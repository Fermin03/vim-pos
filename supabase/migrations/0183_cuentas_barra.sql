-- 0183: cuentas por nombre en barra (spec giros §8).
-- Una cuenta de barra es un ticket modo_servicio = 'BARRA' sin mesa, que se identifica por el
-- nombre del cliente. El nombre vive en tickets.nombre_cliente (ruling 1): ya existe, ya viaja al
-- ticket impreso y al sync, y no hace falta otra columna. Es único entre las cuentas de barra
-- abiertas de la sucursal (sin distinguir mayúsculas ni espacios); al cerrarse libera el nombre.
-- cuentas_barra se apaga a los negocios que ya existen (salvo BAR) y al default (ruling 3):
-- VIM lo enciende donde corresponda.

-- 1. Existentes y default
ALTER TABLE tenants ALTER COLUMN operacion
  SET DEFAULT (juego_inicial_de_giro(NULL) || '{"eventos":false,"cuentas_barra":false}'::jsonb);
UPDATE tenants SET operacion = operacion || '{"cuentas_barra":false}'::jsonb
 WHERE vertical_principal::text <> 'BAR';

-- 2. Nombre único entre cuentas de barra abiertas
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_barra_nombre_abierto
  ON tickets (sucursal_id, lower(btrim(nombre_cliente)))
  WHERE modo_servicio = 'BARRA' AND estado_fiscal IN ('BORRADOR', 'ABIERTO') AND deleted_at IS NULL;

-- 3. Abrir
CREATE OR REPLACE FUNCTION abrir_cuenta_barra(
  p_sucursal_id uuid, p_caja_id uuid, p_turno_id uuid,
  p_nombre text, p_client_id_local varchar, p_usuario_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_nombre text := left(btrim(p_nombre), 100);
  v_id uuid;
BEGIN
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RAISE EXCEPTION 'NOMBRE_REQUERIDO' USING ERRCODE = '22023';
  END IF;
  v_id := abrir_ticket(p_sucursal_id, p_caja_id, p_turno_id, 'BARRA', NULL, NULL, p_client_id_local, p_usuario_id);
  BEGIN
    UPDATE tickets SET nombre_cliente = v_nombre WHERE id = v_id AND nombre_cliente IS DISTINCT FROM v_nombre;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'NOMBRE_EN_USO: %', v_nombre USING ERRCODE = '23505';
  END;
  RETURN v_id;
END $$;

-- 4. Barra -> mesa
CREATE OR REPLACE FUNCTION mover_cuenta_a_mesa(p_ticket_id uuid, p_mesa_id uuid, p_client_id_local varchar)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_t tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_t.estado_fiscal::text NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'CUENTA_CERRADA' USING ERRCODE = '22023';
  END IF;
  IF v_t.modo_servicio::text <> 'BARRA' THEN
    RAISE EXCEPTION 'NO_ES_CUENTA_DE_BARRA' USING ERRCODE = '22023';
  END IF;
  UPDATE tickets SET modo_servicio = 'MESA' WHERE id = p_ticket_id;
  PERFORM asignar_mesa_a_ticket(p_ticket_id, p_mesa_id, true, p_client_id_local);
END $$;

-- 5. Mesa -> barra
CREATE OR REPLACE FUNCTION mover_cuenta_a_barra(p_ticket_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_t tickets%ROWTYPE;
  v_nombre text := left(btrim(p_nombre), 100);
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_t.estado_fiscal::text NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'CUENTA_CERRADA' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets_mesas
                  WHERE ticket_id = p_ticket_id AND fecha_liberacion IS NULL AND es_mesa_principal) THEN
    RAISE EXCEPTION 'NO_ES_CUENTA_DE_MESA' USING ERRCODE = '22023';
  END IF;
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RAISE EXCEPTION 'NOMBRE_REQUERIDO' USING ERRCODE = '22023';
  END IF;
  BEGIN
    UPDATE tickets SET modo_servicio = 'BARRA', nombre_cliente = v_nombre WHERE id = p_ticket_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'NOMBRE_EN_USO: %', v_nombre USING ERRCODE = '23505';
  END;
  UPDATE tickets_mesas SET fecha_liberacion = now(), motivo_liberacion = 'PASADA_A_BARRA'
   WHERE ticket_id = p_ticket_id AND fecha_liberacion IS NULL;
END $$;

-- 6. Comentarios
COMMENT ON FUNCTION abrir_cuenta_barra IS 'Abre una cuenta de barra con nombre único entre las abiertas de la sucursal (idempotente por client_id_local).';
COMMENT ON FUNCTION mover_cuenta_a_mesa IS 'Pasa una cuenta de barra abierta a una mesa; el nombre queda como cliente de la mesa.';
COMMENT ON FUNCTION mover_cuenta_a_barra IS 'Pasa una cuenta de mesa abierta a barra con un nombre único y libera la mesa.';

-- 7. Permisos
REVOKE ALL ON FUNCTION abrir_cuenta_barra(uuid, uuid, uuid, text, varchar, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mover_cuenta_a_mesa(uuid, uuid, varchar) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mover_cuenta_a_barra(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION abrir_cuenta_barra(uuid, uuid, uuid, text, varchar, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mover_cuenta_a_mesa(uuid, uuid, varchar) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mover_cuenta_a_barra(uuid, text) TO authenticated, service_role;
