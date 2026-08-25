-- ============================================================================
-- 0081 — El add-on de facturación y la acreditación de folios (fase 4 del CFDI).
--
-- Dos cosas que faltaban para que el módulo se pueda vender:
--
--   1. La tabla `addons` está VACÍA desde 0002. El producto tiene add-ons en el pricing, pero
--      ninguno existe en la base, así que no hay nada que activarle a un cliente.
--
--   2. Acreditar folios no movía el saldo. `/platform` insertaba una fila en `folios_movimientos`
--      y nada más; `consumir_folio_cfdi` lee `tenant_folios_saldo`. Eran dos fuentes de verdad sin
--      contacto: los folios acreditados no existían para el timbrado, y el saldo que mostraba el
--      panel podía apartarse del real sin que nadie lo notara. Esta migración pone la única puerta
--      de entrada que mueve las dos a la vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El add-on de facturación electrónica.
--
-- $349/mes. Cubre nuestro costo por folio y el trabajo real que no se ve: dar de alta el emisor,
-- custodiar nada del sello, servir el XML y el PDF —Facturama en Multiemisor no guarda ninguno— y
-- sostener el portal de autofactura.
--
-- `features_activadas` es el contrato con el resto del producto: lo que enciende cuando el add-on
-- está vigente. Se consulta con `tenant_addon_activo()`, no leyendo esta fila a mano.
-- ---------------------------------------------------------------------------
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES (
  'CFDI',
  'Facturación electrónica',
  'Timbrado de CFDI 4.0, factura global automática y portal de autofacturación con QR en el ticket. '
    || 'Incluye el alta de tu sello ante el PAC. Los folios se cobran aparte por paquete.',
  349.00,
  jsonb_build_object(
    'cfdi_activo', true,
    'factura_global', true,
    'portal_autofactura', true,
    'qr_factura_ticket', true
  ),
  10
)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ¿Este negocio tiene tal add-on vigente hoy?
--
-- Existe para que ni el POS ni el panel tengan que replicar la regla de vigencia. Un add-on está
-- vigente si la fila está activa, ya empezó y no ha terminado — tres condiciones que es fácil
-- olvidar por separado y que dejarían facturando a quien ya no paga.
--
-- SECURITY DEFINER porque `tenant_addons` solo deja leer al propio tenant, y el portal público de
-- autofactura necesita preguntarlo sin sesión. La función NO devuelve datos del add-on: solo sí o
-- no, que es lo que hace falta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tenant_addon_activo(p_tenant_id uuid, p_codigo varchar)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp   -- CN-001: search_path fijo en SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_addons ta
    JOIN addons a ON a.id = ta.addon_id
    WHERE ta.tenant_id = p_tenant_id
      AND a.codigo = p_codigo
      AND ta.activo = true
      AND ta.fecha_inicio <= (now() AT TIME ZONE 'America/Mexico_City')::date
      AND (ta.fecha_fin IS NULL OR ta.fecha_fin >= (now() AT TIME ZONE 'America/Mexico_City')::date)
  );
$$;

COMMENT ON FUNCTION tenant_addon_activo IS
  'TRUE si el tenant tiene el add-on vigente hoy (activo + dentro de fechas). Fuente única de la regla de vigencia.';

REVOKE EXECUTE ON FUNCTION tenant_addon_activo(uuid, varchar) FROM public;
GRANT EXECUTE ON FUNCTION tenant_addon_activo(uuid, varchar) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Acreditar folios: saldo y ledger, o ninguno de los dos.
--
-- El bloqueo `FOR UPDATE` no es decorativo: sin él, dos acreditaciones simultáneas leen el mismo
-- saldo previo y la segunda pisa a la primera, regalando o borrando folios que alguien pagó.
--
-- El saldo autoritativo es `tenant_folios_saldo.saldo_paquetes`. La fila del ledger guarda el
-- resultante como fotografía para auditoría — sirve para reconstruir la historia, no para
-- responder "cuánto hay", que es lo que se hacía antes y por eso divergían.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acreditar_folios_cfdi(
  p_tenant_id uuid,
  p_cantidad  integer,                        -- positivo acredita, negativo corrige
  p_tipo      folio_movimiento_tipo DEFAULT 'AJUSTE_MANUAL',
  p_paquete_id uuid DEFAULT NULL,
  p_precio_pagado_mxn numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo   tenant_folios_saldo%ROWTYPE;
  v_periodo date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
  v_nuevo   integer;
BEGIN
  IF p_cantidad = 0 THEN
    RAISE EXCEPTION 'La cantidad de folios no puede ser cero';
  END IF;

  SELECT * INTO v_saldo FROM tenant_folios_saldo WHERE tenant_id = p_tenant_id FOR UPDATE;

  -- Los tenants dados de alta antes de que existiera el provisioning pueden no tener fila. Se crea
  -- en vez de fallar: negarse a acreditar un paquete ya cobrado por una fila ausente sería
  -- convertir un detalle histórico en un problema del cliente.
  IF NOT FOUND THEN
    INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
    VALUES (p_tenant_id, 0, 0, v_periodo, 0)
    RETURNING * INTO v_saldo;
  END IF;

  v_nuevo := v_saldo.saldo_paquetes + p_cantidad;
  IF v_nuevo < 0 THEN
    RAISE EXCEPTION 'El ajuste dejaría el saldo en % folios (saldo actual: %)', v_nuevo, v_saldo.saldo_paquetes;
  END IF;

  UPDATE tenant_folios_saldo
     SET saldo_paquetes = v_nuevo, updated_at = now()
   WHERE tenant_id = p_tenant_id;

  INSERT INTO folios_movimientos (
    tenant_id, tipo, cantidad, paquete_id, precio_pagado_mxn, saldo_paquetes_resultante, dia_contable
  ) VALUES (
    p_tenant_id, p_tipo, p_cantidad, p_paquete_id, p_precio_pagado_mxn, v_nuevo,
    -- Día contable en hora de México: el servidor corre en UTC y a partir de las 18:00 locales un
    -- movimiento se asentaría en el día siguiente.
    (now() AT TIME ZONE 'America/Mexico_City')::date
  );

  RETURN jsonb_build_object(
    'saldo_paquetes', v_nuevo,
    'saldo_anterior', v_saldo.saldo_paquetes,
    'cantidad', p_cantidad
  );
END;
$$;

COMMENT ON FUNCTION acreditar_folios_cfdi IS
  'Única puerta para mover folios: actualiza tenant_folios_saldo y asienta el ledger en la misma transacción. Solo service_role (panel de plataforma).';

-- Solo el panel de plataforma acredita folios. Un negocio no puede regalarse timbres.
REVOKE EXECUTE ON FUNCTION acreditar_folios_cfdi(uuid, integer, folio_movimiento_tipo, uuid, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION acreditar_folios_cfdi(uuid, integer, folio_movimiento_tipo, uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- Reparación de los saldos que ya divergieron.
--
-- Mientras `/platform` solo escribía el ledger, `tenant_folios_saldo.saldo_paquetes` se quedó en
-- el valor con el que nació el tenant. Se reconstruye desde el ledger, que es el registro que sí
-- tiene todos los movimientos.
--
-- OJO CON LOS TIPOS: solo tres de los cinco mueven el saldo de PAQUETES.
--   · COMPRA_PAQUETE, CONSUMO_PAQUETE, AJUSTE_MANUAL → sí.
--   · BASE_RESET y CONSUMO_BASE → NO. Los dos viven en la base mensual, no en los paquetes, y
--     `CONSUMO_BASE` se asienta con cantidad -1 aunque no descuente ni un folio de paquete.
--     Sumarlos aquí restaría folios que el cliente sí tiene pagados.
--
-- `GREATEST(...,0)` cubre el caso previsto de la factura global, que se timbra aun sin saldo y
-- asienta un resultante negativo a propósito para no romper el cumplimiento ante el SAT.
-- ---------------------------------------------------------------------------
UPDATE tenant_folios_saldo s
   SET saldo_paquetes = GREATEST(l.suma, 0), updated_at = now()
  FROM (
    SELECT tenant_id,
           COALESCE(SUM(cantidad) FILTER (
             WHERE tipo IN ('COMPRA_PAQUETE', 'CONSUMO_PAQUETE', 'AJUSTE_MANUAL')
           ), 0)::integer AS suma
      FROM folios_movimientos
     GROUP BY tenant_id
  ) l
 WHERE l.tenant_id = s.tenant_id
   AND s.saldo_paquetes <> GREATEST(l.suma, 0);
