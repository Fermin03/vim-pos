-- ============================================================================
-- 0115 — Asignaciones de mesa huérfanas: repararlas, y que no vuelvan a dejar una mesa inservible.
--
-- La 0104 arregló el bug (cancelar un ticket corría en modo réplica y se saltaba
-- trg_ticket_liberar_mesa, así que `tickets_mesas` se quedaba sin liberar), pero no reparó lo que
-- ese bug ya había dejado escrito. En Knock-Out sobrevivieron las TRES mesas rotas, cada una con
-- una asignación viva apuntando a un ticket que lleva semanas CANCELADO. El daño se ve de dos
-- formas distintas según en qué quedara `mesas.estado`:
--
--   A) mesa OCUPADA (mesa 1) — la pantalla la pinta ocupada y la deja abrir, porque
--      vw_mesas_estado_actual saca `ticket_activo_id` de la asignación sin mirar en qué estado
--      está el ticket. El cajero entra, le da a "Cancelar cuenta" y la RPC le contesta
--      "Ticket ya está CANCELADO". No hay ninguna otra salida desde la caja: la mesa queda muerta.
--
--   B) mesa LIBRE (mesas 2 y 3) — se ve perfectamente normal, pero al sentar a alguien
--      asignar_mesa_a_ticket solo mira `mesas.estado`, da el visto bueno, y el INSERT choca contra
--      idx_tickets_mesas_mesa_activa (una sola asignación viva por mesa). La mesa no se puede
--      abrir nunca más, y el cajero ve un error de base de datos en crudo.
--
-- Tres cosas, en este orden:
--   1. Reparar los datos ya rotos (idempotente: en una base sana no toca nada).
--   2. La vista deja de dar por activo un ticket terminal — se acabó el callejón de A.
--   3. asignar_mesa_a_ticket barre la huérfana antes de insertar — se acabó el choque de B, y la
--      mesa se cura sola la próxima vez que alguien se siente.
--
-- El 2 y el 3 son cinturón y tirantes a propósito: el 1 limpia lo de hoy, pero una caja puede
-- llegar con daño que no previmos (un push en modo réplica, un restore viejo), y entonces la mesa
-- se arregla sola en vez de morirse otra vez.
--
-- Cubierto por supabase/scripts/smoke_mesa_huerfana.sql.
-- ============================================================================

-- ── 1. Reparación de lo ya roto ──────────────────────────────────────────────
-- Se libera con la fecha en que el ticket murió, no con now(): la asignación dejó de ser real en
-- ese momento, y así los reportes de ocupación no cuentan semanas de mesa fantasma.
UPDATE tickets_mesas tm
   SET fecha_liberacion  = GREATEST(t.updated_at, tm.fecha_asignacion),
       motivo_liberacion = COALESCE(tm.motivo_liberacion, 'CUENTA_CERRADA')
  FROM tickets t
 WHERE t.id = tm.ticket_id
   AND tm.fecha_liberacion IS NULL
   AND t.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO');

-- Una mesa OCUPADA sin ninguna asignación viva no la ocupa nadie: lo único que ocupa una mesa es
-- una asignación. (El trigger de liberación ya deja LIBRE a las que acaba de soltar el UPDATE de
-- arriba; esto recoge las que se quedaron ocupadas sin fila que lo justificara.)
UPDATE mesas m
   SET estado = 'LIBRE'
 WHERE m.estado = 'OCUPADA'
   AND NOT EXISTS (
     SELECT 1 FROM tickets_mesas tm
      WHERE tm.mesa_id = m.id AND tm.fecha_liberacion IS NULL
   );

-- ── 2. La vista no ofrece cuentas muertas ────────────────────────────────────
-- El filtro de estado del ticket se muda al JOIN de `tickets_mesas`. Antes vivía en el JOIN de
-- `tickets`, que solo vaciaba folio y total: `ticket_activo_id` seguía saliendo, y es justo el
-- campo que la pantalla usa para decidir si la mesa es pulsable (pantalla-mesas.tsx).
CREATE OR REPLACE VIEW vw_mesas_estado_actual
WITH (security_invoker = on) AS
SELECT m.id AS mesa_id,
   m.tenant_id,
   m.sucursal_id,
   m.numero AS mesa_numero,
   m.capacidad,
   m.seccion_id,
   s.nombre AS seccion_nombre,
   m.estado AS mesa_estado,
   m.posicion_x,
   m.posicion_y,
   m.forma,
   tm.ticket_id AS ticket_activo_id,
   t.folio_completo AS ticket_folio,
   t.fecha_apertura AS ticket_fecha_apertura,
   t.fecha_primer_item AS ticket_fecha_primer_item,
   t.total_mxn AS ticket_total_mxn,
   t.mesero_id AS ticket_mesero_id,
   (up_mesero.nombre)::character varying(255) AS mesero_email,
       CASE
           WHEN (t.fecha_apertura IS NOT NULL) THEN ((EXTRACT(epoch FROM (now() - t.fecha_apertura)))::integer / 60)
           ELSE NULL::integer
       END AS minutos_ocupada,
   m.reservacion_actual_id,
       CASE
           WHEN ult.ultimo_item IS NOT NULL THEN ((EXTRACT(epoch FROM (now() - ult.ultimo_item)))::integer / 60)
           WHEN (t.fecha_apertura IS NOT NULL) THEN ((EXTRACT(epoch FROM (now() - t.fecha_apertura)))::integer / 60)
           ELSE NULL::integer
       END AS minutos_sin_movimiento
  FROM ((((mesas m
    LEFT JOIN secciones s ON ((s.id = m.seccion_id)))
    LEFT JOIN tickets_mesas tm ON (((tm.mesa_id = m.id)
                                AND (tm.fecha_liberacion IS NULL)
                                AND EXISTS (SELECT 1 FROM tickets tv
                                             WHERE tv.id = tm.ticket_id
                                               AND tv.estado_fiscal = ANY (ARRAY['BORRADOR'::ticket_estado_fiscal, 'ABIERTO'::ticket_estado_fiscal])))))
    LEFT JOIN tickets t ON ((t.id = tm.ticket_id)))
    LEFT JOIN usuarios_perfil up_mesero ON ((up_mesero.id = t.mesero_id)))
  LEFT JOIN LATERAL (
    SELECT max(ti.created_at) AS ultimo_item
    FROM ticket_items ti
    WHERE ti.ticket_id = t.id AND ti.cancelado = false
  ) ult ON true
 WHERE ((m.deleted_at IS NULL) AND (m.activa = true));

COMMENT ON VIEW vw_mesas_estado_actual IS
  'Estado vivo de mesas. 0050 añade minutos_sin_movimiento. 0115: una asignación cuyo ticket ya es terminal NO cuenta como activa (ticket_activo_id sale NULL), para que la pantalla no ofrezca una cuenta cancelada.';

-- ── 3. Sentar a alguien barre la huérfana en vez de reventar ─────────────────
CREATE OR REPLACE FUNCTION asignar_mesa_a_ticket(
  p_ticket_id        uuid,
  p_mesa_id          uuid,
  p_es_principal     boolean DEFAULT true,
  p_client_id_local  varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid := current_tenant_id();
  v_existing_id uuid;
  v_asignacion_id uuid;
  v_mesa_estado mesa_estado;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM tickets_mesas
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM mesas WHERE id = p_mesa_id) THEN
    RAISE EXCEPTION 'Mesa % no existe', p_mesa_id;
  END IF;

  -- 0115 — Barrer asignaciones huérfanas de ESTA mesa: filas vivas cuyo ticket ya es terminal.
  -- Va ANTES de mirar el estado porque liberarlas es lo que devuelve la mesa a LIBRE (lo hace
  -- trg_tickets_mesas_sync_estado). Sin esto, una huérfana dejaba la mesa muerta para siempre:
  -- si quedó OCUPADA, el guard de abajo la rechazaba; si quedó LIBRE, pasaba el guard y el INSERT
  -- chocaba contra idx_tickets_mesas_mesa_activa con un error de base de datos en crudo.
  UPDATE tickets_mesas tm
     SET fecha_liberacion  = GREATEST(t.updated_at, tm.fecha_asignacion),
         motivo_liberacion = COALESCE(tm.motivo_liberacion, 'CUENTA_CERRADA')
    FROM tickets t
   WHERE t.id = tm.ticket_id
     AND tm.mesa_id = p_mesa_id
     AND tm.fecha_liberacion IS NULL
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO');

  -- Verificar que la mesa esté libre (ya sin el ruido de las huérfanas)
  SELECT estado INTO v_mesa_estado FROM mesas WHERE id = p_mesa_id;

  IF v_mesa_estado NOT IN ('LIBRE', 'RESERVADA', 'EN_LIMPIEZA') THEN
    RAISE EXCEPTION 'Mesa % no está disponible (estado: %)', p_mesa_id, v_mesa_estado;
  END IF;

  -- Si es principal y el ticket ya tiene mesa principal, error
  IF p_es_principal AND EXISTS (
    SELECT 1 FROM tickets_mesas
    WHERE ticket_id = p_ticket_id
      AND es_mesa_principal = true
      AND fecha_liberacion IS NULL
  ) THEN
    RAISE EXCEPTION 'Ticket ya tiene mesa principal. Para juntar mesas, use es_principal=false';
  END IF;

  INSERT INTO tickets_mesas (
    tenant_id, ticket_id, mesa_id, es_mesa_principal,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_mesa_id, p_es_principal,
    p_client_id_local, auth.uid()
  ) RETURNING id INTO v_asignacion_id;

  RETURN v_asignacion_id;
END;
$$;

COMMENT ON FUNCTION asignar_mesa_a_ticket IS
  'Asigna una mesa a un ticket (la mesa pasa a OCUPADA por trigger). 0115: antes de insertar libera las asignaciones huérfanas de esa mesa (ticket ya terminal), que si no dejaban la mesa inservible.';
