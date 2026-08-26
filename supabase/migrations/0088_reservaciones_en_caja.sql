-- ============================================================================
-- 0088 — Lo que le faltaba a reservaciones para vivir en la caja.
--
-- La 0010 dejó las reservaciones casi completas: tabla, folio propio, y cuatro
-- RPCs —crear, confirmar llegada, marcar no-show y cancelar—. Faltan dos cosas
-- para que el cajero pueda trabajar con ellas desde Comedor.
--
--   1. MODIFICAR. No existía ninguna forma de corregir una reserva. En un
--      restaurante eso pasa todo el tiempo: «somos seis, no cuatro», «llegamos
--      a las nueve, no a las ocho». Sin esto la única salida era cancelar y
--      volver a crear, que pierde el folio y ensucia el reporte de no-shows con
--      una cancelación que nunca ocurrió.
--
--   2. QUE LA MESA SE ENTERE al asignarla en la llegada. El trigger
--      `trg_reservacion_sync_mesa` ya marcaba la mesa RESERVADA al CREAR la
--      reserva con mesa, y la liberaba al cancelar. Pero el caso que más se usa
--      —la reserva entra sin mesa y el cajero se la asigna cuando el cliente
--      llega— no estaba contemplado: la mesa seguía viéndose LIBRE en el mapa,
--      y otro cajero podía sentar ahí a alguien más. Dos familias en la misma
--      mesa es de los errores que el cliente sí recuerda.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Modificar una reservación
--
-- Solo las CONFIRMADAS. Una que ya llegó, se canceló o se marcó como no-show es
-- historia: cambiarle la hora a toro pasado falsearía el reporte de no-shows,
-- que es justo lo que ese reporte sirve para medir.
--
-- Todos los parámetros son opcionales; NULL significa «no lo toques». Así el
-- mismo RPC sirve para corregir solo el número de comensales sin tener que
-- reenviar el resto y arriesgarse a pisarlo con datos viejos de la pantalla.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION modificar_reservacion(
  p_reservacion_id   uuid,
  p_cliente_nombre   varchar     DEFAULT NULL,
  p_cliente_telefono varchar     DEFAULT NULL,
  p_fecha_hora       timestamptz DEFAULT NULL,
  p_comensales       integer     DEFAULT NULL,
  p_nota             text        DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_estado reservacion_estado;
BEGIN
  SELECT estado INTO v_estado FROM reservaciones WHERE id = p_reservacion_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reservación no existe';
  END IF;
  IF v_estado <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'Solo se puede modificar una reservación confirmada (esta está %)', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_comensales IS NOT NULL AND p_comensales < 1 THEN
    RAISE EXCEPTION 'Los comensales deben ser al menos 1' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE reservaciones
     SET cliente_nombre_snapshot   = COALESCE(NULLIF(btrim(p_cliente_nombre), ''), cliente_nombre_snapshot),
         -- El teléfono sí se puede vaciar a propósito (cadena vacía), a diferencia
         -- del nombre, que la tabla exige NOT NULL.
         cliente_telefono_snapshot = CASE WHEN p_cliente_telefono IS NULL THEN cliente_telefono_snapshot
                                          ELSE NULLIF(btrim(p_cliente_telefono), '') END,
         fecha_hora_reserva        = COALESCE(p_fecha_hora, fecha_hora_reserva),
         comensales                = COALESCE(p_comensales, comensales),
         nota                      = CASE WHEN p_nota IS NULL THEN nota
                                          ELSE NULLIF(btrim(p_nota), '') END,
         updated_by                = auth.uid(),
         updated_at                = now()
   WHERE id = p_reservacion_id;
END;
$$;

COMMENT ON FUNCTION modificar_reservacion IS
  'Corrige una reservación CONFIRMADA. Los parámetros NULL se dejan como estaban. No toca estados posteriores: una reserva que ya llegó o se canceló es historia.';

REVOKE ALL ON FUNCTION modificar_reservacion(uuid, varchar, varchar, timestamptz, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION modificar_reservacion(uuid, varchar, varchar, timestamptz, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. La mesa se entera cuando se le asigna una reserva
--
-- Se REEMPLAZA el trigger de la 0010 conservando entero lo que ya hacía, y se
-- le añaden los dos casos que faltaban. Se reescribe completo en vez de encadenar
-- un segundo trigger: dos triggers peleándose por la misma columna `mesas.estado`
-- es imposible de razonar cuando algo sale mal.
--
-- Casos, en orden:
--
--   a) Alta con mesa (ya estaba): la mesa queda RESERVADA.
--   b) La reserva termina —cancelada, no llegó, terminada— (ya estaba): se
--      libera la mesa, pero SOLO si seguía reservada por esta reserva. Si el
--      cliente ya se sentó, la mesa está OCUPADA y la manda el ticket, no esto.
--   c) NUEVO — cambia la mesa asignada: se libera la anterior y se marca la
--      nueva. Sin esto, mover una reserva de la mesa 4 a la 7 dejaba la 4
--      bloqueada toda la noche sin que nadie supiera por qué.
--   d) NUEVO — el cliente llega y se le asigna mesa en ese momento: la mesa deja
--      de verse libre. Es el camino normal desde la caja y era el que faltaba.
--
-- En todos los casos la mesa solo se marca si está LIBRE, y solo se libera si
-- está RESERVADA por esta reserva. El estado OCUPADA nunca se pisa: esa lo
-- gobierna el ticket, y una reserva no puede echar a quien ya está comiendo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_reservacion_sync_mesa() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- (a) Alta con mesa asignada
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'CONFIRMADA' AND NEW.mesa_asignada_id IS NOT NULL THEN
      UPDATE mesas
         SET estado = 'RESERVADA', reservacion_actual_id = NEW.id, updated_by = NEW.created_by
       WHERE id = NEW.mesa_asignada_id AND estado = 'LIBRE';
    END IF;
    RETURN NEW;
  END IF;

  -- (b) La reserva se cierra: se libera la mesa que tuviera apartada
  IF OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.estado IN ('CANCELADA', 'NO_SHOW', 'TERMINADA') THEN
    UPDATE mesas
       SET estado = 'LIBRE', reservacion_actual_id = NULL, updated_by = NEW.updated_by
     WHERE id = NEW.mesa_asignada_id
       AND reservacion_actual_id = NEW.id
       AND estado = 'RESERVADA';
    RETURN NEW;
  END IF;

  -- (c) Cambió la mesa: liberar la vieja antes de apartar la nueva
  IF OLD.mesa_asignada_id IS DISTINCT FROM NEW.mesa_asignada_id
     AND OLD.mesa_asignada_id IS NOT NULL THEN
    UPDATE mesas
       SET estado = 'LIBRE', reservacion_actual_id = NULL, updated_by = NEW.updated_by
     WHERE id = OLD.mesa_asignada_id
       AND reservacion_actual_id = NEW.id
       AND estado = 'RESERVADA';
  END IF;

  -- (c/d) Apartar la mesa vigente, mientras la reserva siga viva
  IF NEW.mesa_asignada_id IS NOT NULL
     AND NEW.estado IN ('CONFIRMADA', 'LLEGO')
     AND (OLD.mesa_asignada_id IS DISTINCT FROM NEW.mesa_asignada_id
          OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
    UPDATE mesas
       SET estado = 'RESERVADA', reservacion_actual_id = NEW.id, updated_by = NEW.updated_by
     WHERE id = NEW.mesa_asignada_id AND estado = 'LIBRE';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_reservacion_sync_mesa IS
  'Mantiene mesas.estado/reservacion_actual_id en sincronía con la reservación. Amplía la 0010 con el cambio de mesa y con la asignación al llegar, que es el camino normal desde la caja. Nunca pisa OCUPADA: ese estado lo gobierna el ticket.';
