-- 0137 · activar el cobro de un cliente en una sola transacción
--
-- Auditoría integral 30/09/2026 (hallazgo E-3). La acción `suscripcion_activar` del panel de
-- plataforma (apps/platform/app/api/tenants/[id]/route.ts) hacía tres escrituras sueltas por
-- PostgREST:
--
--   1) UPDATE suscripciones SET estado = 'EXPIRADA' … WHERE estado = 'ACTIVA'
--   2) INSERT INTO suscripciones (… 'ACTIVA' …)
--   3) UPDATE tenants SET estado = 'ACTIVO' WHERE estado = 'TRIAL'
--
-- Cada una es su propia transacción. Si (2) fallaba —un precio fuera de rango, un ciclo que no
-- cabe en la columna, un corte de red— el cliente se quedaba con su suscripción anterior EXPIRADA
-- y ninguna nueva: sin cobro vigente, y `registrar_pago_suscripcion` (0130) respondía
-- SIN_SUSCRIPCION al primer pago. Reproducido mandando `precio: -1`: el CHECK
-- `precio_mensual_mxn >= 0` rechaza el INSERT después de que el UPDATE ya expiró la anterior.
-- Además dos clics simultáneos podían dejar DOS suscripciones ACTIVAS (nada serializaba).
--
-- Arreglo: `activar_suscripcion` hace las tres cosas en una transacción, bloqueando la fila del
-- tenant para serializar altas simultáneas, y valida precio y ciclo antes de tocar nada.
-- SECURITY DEFINER y ejecutable SOLO por service_role (el servidor del panel), igual que
-- registrar_pago_suscripcion. Las fechas llegan calculadas del panel (hora de México y recorte a
-- fin de mes de `sumarMeses`): la regla de negocio de cuándo se cobra no cambia aquí.

CREATE OR REPLACE FUNCTION activar_suscripcion(
  p_tenant_id  uuid,
  p_precio     numeric,
  p_ciclo      text,
  p_inicio     date,
  p_proxima    date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan    uuid;
  v_id      uuid;
  v_expir   int;
BEGIN
  IF p_precio IS NULL OR p_precio < 0 OR p_precio > 99999999.99 OR p_precio <> round(p_precio, 2) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO' USING HINT = 'Un importe en pesos, de 0 en adelante, con hasta dos decimales.';
  END IF;
  IF p_ciclo IS NULL OR p_ciclo NOT IN ('MENSUAL', 'ANUAL') THEN
    RAISE EXCEPTION 'CICLO_INVALIDO';
  END IF;
  IF p_inicio IS NULL OR p_proxima IS NULL OR p_proxima <= p_inicio THEN
    RAISE EXCEPTION 'FECHAS_INVALIDAS';
  END IF;

  -- La fila del tenant, bloqueada: dos altas simultáneas se forman, no se cruzan.
  SELECT plan_actual_id INTO v_plan FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NO_EXISTE';
  END IF;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'TENANT_SIN_PLAN';
  END IF;

  -- Solo una vigente: la ACTIVA anterior se cierra hoy (misma regla que tenía la ruta).
  UPDATE public.suscripciones
     SET estado = 'EXPIRADA', fecha_fin = p_inicio, updated_at = now()
   WHERE tenant_id = p_tenant_id AND estado = 'ACTIVA';
  GET DIAGNOSTICS v_expir = ROW_COUNT;

  INSERT INTO public.suscripciones
    (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro)
  VALUES
    (p_tenant_id, v_plan, p_inicio, 'ACTIVA', p_precio, p_ciclo, p_proxima)
  RETURNING id INTO v_id;

  -- Al activar el cobro, el tenant pasa a ACTIVO si estaba en prueba.
  UPDATE public.tenants SET estado = 'ACTIVO' WHERE id = p_tenant_id AND estado = 'TRIAL';

  RETURN jsonb_build_object('suscripcion_id', v_id, 'plan_id', v_plan, 'expiradas', v_expir);
END;
$$;

REVOKE ALL ON FUNCTION activar_suscripcion(uuid, numeric, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activar_suscripcion(uuid, numeric, text, date, date) TO service_role;

COMMENT ON FUNCTION activar_suscripcion(uuid, numeric, text, date, date) IS
  'Panel de plataforma (0137): expira la suscripción ACTIVA, crea la nueva y pasa TRIAL→ACTIVO en una sola transacción. Solo service_role.';
