-- ============================================================================
-- 0120 — Cada estación del KDS marca LISTO lo suyo (ADR 0018).
--
-- Hasta aquí el estado de cocina vivía solo en el ticket (tickets.estado_cocina) y el KDS cerraba
-- la orden entera con dos UPDATE sueltos. Con la pantalla filtrada en Plancha, marcar LISTO una
-- orden que también llevaba bebidas de Barra las sacaba de la pantalla de Barra sin estar hechas.
--
--   1. ticket_items.listo_at: cuándo la estación terminó ese renglón. Nula = pendiente. Nullable a
--      propósito: sync_push_snapshot hace upsert de la fila completa con las columnas de la nube
--      (0074), y un escritorio viejo sin la columna manda NULL, que es "sin marcar".
--
--   2. marcar_listo_cocina(ticket, área, todas): marca los renglones pendientes de esa área —o de
--      todas— y, si ya no queda ninguno, avanza el ticket EN_COCINA → LISTO → ENTREGADO en la
--      MISMA transacción. Bloquea el ticket (FOR UPDATE) para que dos estaciones que marcan casi a
--      la vez no dejen la orden abierta ni la cierren dos veces. El validador de estado_cocina
--      (0009) sigue mandando: los avances son los mismos que antes, en el mismo orden.
--
--      Pendiente = renglón vivo que va a cocina: no cancelado, sin cargo_tipo (el envío, 0116) y
--      que no es el PADRE de un combo (0111: se prepara la comida, no "un combo"). Área nula es la
--      "General" del KDS; el RPC la recibe como NULL.
--
--   3. El área de un renglón nuevo cae a la de su CATEGORÍA cuando el producto no tiene una
--      propia. agregar_item_a_ticket solo mira productos.area_cocina_id, mientras la comanda
--      impresa usa producto → categoría (0079, apps/pos/app/lib/print/ticket-datos.ts): lo que en
--      papel salía en "Barra" en el KDS caía en "General", y con LISTO por estación eso importa.
--      Es un trigger BEFORE INSERT y no un cambio a agregar_item_a_ticket para no reescribir esa
--      función (0111) y para cubrir cualquier otro camino que inserte renglones. En réplica
--      (sync) no dispara, y está bien: esas filas ya traen su snapshot.
--
-- SECURITY INVOKER: corre bajo la RLS de quien lo llama (el dispositivo del KDS o el empleado),
-- igual que el UPDATE directo que reemplaza.
-- ============================================================================

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS listo_at timestamptz NULL;

COMMENT ON COLUMN ticket_items.listo_at IS
  'Cuándo la estación de cocina marcó LISTO este renglón (KDS por estación). NULL = pendiente. Lo pone marcar_listo_cocina. 0120, ADR 0018.';

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marcar_listo_cocina(
  p_ticket_id uuid,
  p_area      text    DEFAULT NULL,
  p_todas     boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_estado     ticket_estado_cocina;
  v_marcados   integer;
  v_pendientes text[];
BEGIN
  SELECT estado_cocina INTO v_estado FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'TICKET_NO_ENCONTRADO');
  END IF;
  IF v_estado NOT IN ('EN_COCINA', 'LISTO') THEN
    -- Ya salió de cocina (otra estación la cerró, o se entregó por otro camino): no es error
    -- para el KDS, solo ya no hay nada que marcar.
    RETURN jsonb_build_object('ok', true, 'cerrada', true, 'marcados', 0, 'pendientes', '[]'::jsonb);
  END IF;

  UPDATE ticket_items
     SET listo_at = now()
   WHERE ticket_id = p_ticket_id
     AND listo_at IS NULL
     AND cancelado = false
     AND cargo_tipo IS NULL
     AND combo_rol IS DISTINCT FROM 'PADRE'
     AND (p_todas OR area_cocina_nombre_snapshot IS NOT DISTINCT FROM p_area);
  GET DIAGNOSTICS v_marcados = ROW_COUNT;

  SELECT array_agg(DISTINCT coalesce(area_cocina_nombre_snapshot, ''))
    INTO v_pendientes
    FROM ticket_items
   WHERE ticket_id = p_ticket_id
     AND listo_at IS NULL
     AND cancelado = false
     AND cargo_tipo IS NULL
     AND combo_rol IS DISTINCT FROM 'PADRE';

  IF v_pendientes IS NULL THEN
    IF v_estado = 'EN_COCINA' THEN
      UPDATE tickets SET estado_cocina = 'LISTO' WHERE id = p_ticket_id;
    END IF;
    UPDATE tickets SET estado_cocina = 'ENTREGADO' WHERE id = p_ticket_id;
    RETURN jsonb_build_object('ok', true, 'cerrada', true, 'marcados', v_marcados, 'pendientes', '[]'::jsonb);
  END IF;

  -- '' = "General" (área nula); el KDS la vuelve a mostrar con su etiqueta.
  RETURN jsonb_build_object('ok', true, 'cerrada', false, 'marcados', v_marcados,
                            'pendientes', to_jsonb(v_pendientes));
END;
$$;

COMMENT ON FUNCTION marcar_listo_cocina(uuid, text, boolean) IS
  'KDS por estación: marca listo_at en los renglones pendientes del área dada (NULL = General) o de todas, y cierra la orden (EN_COCINA → LISTO → ENTREGADO) cuando ya no queda ninguno. Devuelve {ok, cerrada, marcados, pendientes}. 0120, ADR 0018.';

REVOKE EXECUTE ON FUNCTION marcar_listo_cocina(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION marcar_listo_cocina(uuid, text, boolean) TO authenticated, service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_ticket_items_area_de_categoria() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.area_cocina_nombre_snapshot IS NULL AND NEW.producto_id IS NOT NULL THEN
    SELECT ac.nombre INTO NEW.area_cocina_nombre_snapshot
      FROM productos p
      JOIN categorias c    ON c.id = p.categoria_id
      JOIN areas_cocina ac ON ac.id = c.area_cocina_id
     WHERE p.id = NEW.producto_id
       AND p.area_cocina_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_items_area_de_categoria ON ticket_items;
CREATE TRIGGER trg_ticket_items_area_de_categoria
  BEFORE INSERT ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_items_area_de_categoria();
