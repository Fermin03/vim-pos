-- ============================================================================
-- 0077 — Registrar al repartidor por NOMBRE, sin obligar a crearle una cuenta.
--
-- `delivery_asignaciones.repartidor_id` es NOT NULL y apunta a `auth.users`: para anotar quién se
-- llevó un pedido había que darle de alta como usuario del sistema, con correo y PIN. Hoy los
-- repartidores no usan el sistema —la app para ellos está por hacerse— así que ese requisito
-- convertía una anotación de treinta segundos en un trámite administrativo, y por eso el módulo
-- seguía sin usarse aunque el rol ya existiera.
--
-- Lo que el negocio necesita ahora es saber QUIÉN llevó cada pedido para poder cuadrarle el
-- dinero al volver. Un nombre basta.
--
-- CÓMO QUEDA
--
-- `repartidor_id` pasa a ser opcional y se añade `repartidor_nombre`. Un CHECK exige que venga al
-- menos uno de los dos: una asignación sin repartidor no sirve para nada, y permitirla llenaría
-- la tabla de filas que no responden la única pregunta que se le hace.
--
-- Cuando exista la app del repartidor, esas cuentas llenarán `repartidor_id` y el nombre quedará
-- como respaldo histórico. Por eso NO se crea un catálogo aparte de repartidores: sería un segundo
-- concepto que habría que reconciliar con el primero el día que lleguen las cuentas de verdad.
-- ============================================================================

ALTER TABLE delivery_asignaciones ALTER COLUMN repartidor_id DROP NOT NULL;

ALTER TABLE delivery_asignaciones
  ADD COLUMN IF NOT EXISTS repartidor_nombre varchar(100) NULL;

COMMENT ON COLUMN delivery_asignaciones.repartidor_nombre IS
  'Nombre del repartidor cuando no tiene cuenta en el sistema. Al llegar la app del repartidor, se usará repartidor_id y esto queda como respaldo histórico.';

DO $$ BEGIN
  ALTER TABLE delivery_asignaciones
    ADD CONSTRAINT delivery_repartidor_identificado
    CHECK (repartidor_id IS NOT NULL OR nullif(btrim(repartidor_nombre), '') IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Asignación por nombre.
--
-- Función aparte en vez de tocar `asignar_delivery`: esa ya está en producción con su firma, y
-- cambiarla obligaría a redesplegar todo lo que la llama a la vez. Las dos conviven — la de
-- siempre para cuentas reales, esta para el nombre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION asignar_delivery_por_nombre(
  p_ticket_id              uuid,
  p_repartidor_nombre      varchar,
  p_monto_a_liquidar_mxn   numeric,
  p_tiempo_promesa_minutos integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_ticket        tickets%ROWTYPE;
  v_existente     uuid;
  v_asignacion_id uuid;
  v_nombre        varchar(100) := nullif(btrim(p_repartidor_nombre), '');
BEGIN
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Falta el nombre del repartidor';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket.modo_servicio <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'Solo los pedidos a domicilio se asignan a un repartidor (este es %)', v_ticket.modo_servicio;
  END IF;

  -- Idempotente: si el pedido ya tiene una asignación viva se actualiza el nombre en vez de crear
  -- otra. Dos asignaciones para el mismo pedido dejarían el dinero contado dos veces al liquidar.
  SELECT id INTO v_existente
    FROM delivery_asignaciones
   WHERE ticket_id = p_ticket_id AND estado NOT IN ('LIQUIDADO', 'CANCELADO')
   ORDER BY fecha_asignacion DESC LIMIT 1;

  IF v_existente IS NOT NULL THEN
    UPDATE delivery_asignaciones
       SET repartidor_nombre      = v_nombre,
           monto_a_liquidar_mxn   = p_monto_a_liquidar_mxn,
           tiempo_promesa_minutos = COALESCE(p_tiempo_promesa_minutos, tiempo_promesa_minutos)
     WHERE id = v_existente;
    RETURN v_existente;
  END IF;

  INSERT INTO delivery_asignaciones (
    tenant_id, sucursal_id, ticket_id, repartidor_nombre,
    monto_a_liquidar_mxn, tiempo_promesa_minutos, estado
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id, v_nombre,
    p_monto_a_liquidar_mxn, p_tiempo_promesa_minutos, 'ASIGNADO'
  )
  RETURNING id INTO v_asignacion_id;

  RETURN v_asignacion_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION asignar_delivery_por_nombre(uuid, varchar, numeric, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION asignar_delivery_por_nombre(uuid, varchar, numeric, integer) TO authenticated, service_role;

COMMENT ON FUNCTION asignar_delivery_por_nombre IS
  'Asigna un domicilio a un repartidor identificado solo por su nombre, sin cuenta en el sistema. Idempotente por ticket.';
