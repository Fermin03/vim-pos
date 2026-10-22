-- Retail 2, entrega 3: cotizaciones (diseño 2026-10-18).
--
-- Una cotización es un documento aparte: tiene folio COT-…, vigencia y un enlace público, pero no es
-- venta. No descuenta existencias, no entra al corte, a los reportes ni a la lealtad, y no se factura:
-- vive en sus propias tablas y ningún reporte las lee. Al convertirla, la caja arma una venta normal
-- con los precios de HOY; la cotización se marca CONVERTIDA cuando esa venta queda PAGADO.
--
-- «Vencida» no es un estado: se calcula con vigente_hasta < hoy en tenants.timezone.
-- Viene apagado (configuracion_tenant.modulo_cotizaciones_activo): un restaurante no ve nada. Sync: 0213.

-- ── §1 Configuración y módulo ───────────────────────────────────────────────
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_cotizaciones_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cotizacion_vigencia_dias integer NOT NULL DEFAULT 15
    CHECK (cotizacion_vigencia_dias BETWEEN 1 AND 365);
COMMENT ON COLUMN configuracion_tenant.modulo_cotizaciones_activo IS
  'Interruptor del dueño para las cotizaciones (0212). Sin add-on: solo lo enciende un administrador del negocio.';
COMMENT ON COLUMN configuracion_tenant.cotizacion_vigencia_dias IS
  'Días que vale una cotización desde el día en que se hace, en la zona del negocio (0212).';

-- Molde de configuracion_tenant_credito_guardia (0208). En la caja el pull va en modo réplica y esto
-- no corre: el valor llega tal cual.
CREATE OR REPLACE FUNCTION configuracion_tenant_cotizaciones_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND (NEW.modulo_cotizaciones_activo IS DISTINCT FROM OLD.modulo_cotizaciones_activo
                            OR NEW.cotizacion_vigencia_dias IS DISTINCT FROM OLD.cotizacion_vigencia_dias))
     OR (TG_OP = 'INSERT' AND (NEW.modulo_cotizaciones_activo OR NEW.cotizacion_vigencia_dias <> 15)) THEN
    IF NOT es_admin_del_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar las cotizaciones.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_cotizaciones_guardia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_cotizaciones_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_cotizaciones_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_cotizaciones_guardia();

-- Cuerpo vigente de la 0208 con `cotizaciones`: siempre permitido (no es add-on), encendido =
-- interruptor del dueño.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
  v_tie        boolean;
  v_cre        boolean;
  v_cot        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  -- Un usuario autenticado solo puede preguntar por su propio tenant. Se decide por el ROL del
  -- JWT y no por la ausencia del claim: el hook de acceso (0006) emite tokens SIN tenant_id a
  -- empleados dados de baja, y un token así seguiría siendo `authenticated`. Sin JWT (sesión
  -- directa a la base: pruebas, semillas) o con service_role, pasa.
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion
    INTO v_plan, v_op
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo
                WHEN 'recetas' THEN COALESCE(v_inv, false)
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  -- 0189: existencias por producto. Sin llave = apagado.
  v_permitidos := v_permitidos || jsonb_build_object('existencias', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('existencias', COALESCE((v_op->>'existencias')::boolean, false));

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  -- 0208: crédito. Siempre permitido; encendido = interruptor del dueño.
  SELECT COALESCE(c.modulo_credito_activo, false) INTO v_cre
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_permitidos := v_permitidos || jsonb_build_object('credito', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('credito', COALESCE(v_cre, false));

  -- 0212: cotizaciones. Mismo molde que crédito.
  SELECT COALESCE(c.modulo_cotizaciones_activo, false) INTO v_cot
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_permitidos := v_permitidos || jsonb_build_object('cotizaciones', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('cotizaciones', COALESCE(v_cot, false));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189, 0208, 0212).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §2 Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotizaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id         uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  folio           varchar(40) NOT NULL,
  cliente_id      uuid NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  estado          text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'CONVERTIDA', 'CANCELADA')),
  vigente_hasta   date NOT NULL,
  subtotal_mxn    numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_mxn >= 0),
  iva_mxn         numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_mxn >= 0),
  total_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_mxn >= 0),
  -- Sin pgcrypto: dos uuid v4 dan ~244 bits (molde de clientes.codigo_publico, 0156).
  token_publico   text NOT NULL UNIQUE
    DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  ticket_id       uuid NULL REFERENCES tickets(id) ON DELETE RESTRICT,   -- la venta, si se convirtió
  client_id_local varchar(100) NULL,
  usuario_id      uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cotizaciones_folio_uq UNIQUE (tenant_id, folio),
  CONSTRAINT cotizaciones_client_id_local_uq UNIQUE (tenant_id, client_id_local),
  CONSTRAINT cotizaciones_convertida_con_venta CHECK ((estado = 'CONVERTIDA') = (ticket_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_fecha ON cotizaciones (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_ticket ON cotizaciones (ticket_id) WHERE ticket_id IS NOT NULL;
COMMENT ON TABLE cotizaciones IS
  'Cotización: folio COT-…, vigencia y enlace público. No es venta: no mueve existencias ni entra a corte, reportes, lealtad o factura. Solo se escribe por RPC (0212).';

-- Instantánea del renglón como ticket_items (0008), sin modificadores ni descuentos: los totales se
-- calculan con la misma regla de IVA que recalcular_totales_ticket.
CREATE TABLE IF NOT EXISTS cotizacion_items (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cotizacion_id                   uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id                     uuid NULL REFERENCES productos(id),
  cantidad                        numeric(12,3) NOT NULL CHECK (cantidad > 0),
  orden_visualizacion             integer NOT NULL DEFAULT 0,
  producto_nombre_snapshot        varchar(150) NOT NULL,
  producto_sku_snapshot           varchar(50) NULL,
  precio_unitario_snapshot        numeric(12,2) NOT NULL CHECK (precio_unitario_snapshot >= 0),
  tasa_iva_snapshot               numeric(5,2) NOT NULL CHECK (tasa_iva_snapshot >= 0 AND tasa_iva_snapshot <= 100),
  iva_incluido_en_precio_snapshot boolean NOT NULL,
  clave_sat_snapshot              varchar(20) NULL,
  unidad_sat_snapshot             varchar(10) NULL,
  subtotal_bruto_mxn              numeric(12,2) NOT NULL CHECK (subtotal_bruto_mxn >= 0),
  iva_item_mxn                    numeric(12,2) NOT NULL CHECK (iva_item_mxn >= 0),
  total_item_mxn                  numeric(12,2) NOT NULL CHECK (total_item_mxn >= 0),
  created_at                      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion ON cotizacion_items (cotizacion_id, orden_visualizacion);
COMMENT ON TABLE cotizacion_items IS
  'Renglones de una cotización con la instantánea del producto al cotizar (0212). Sin combos en esta versión.';

-- ── §3 RLS: lectura por negocio, escritura solo por RPC ─────────────────────
ALTER TABLE cotizaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotizaciones_lectura ON cotizaciones;
CREATE POLICY cotizaciones_lectura ON cotizaciones FOR SELECT
  USING (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS cotizacion_items_lectura ON cotizacion_items;
CREATE POLICY cotizacion_items_lectura ON cotizacion_items FOR SELECT
  USING (tenant_id = current_tenant_id());

REVOKE ALL ON cotizaciones, cotizacion_items FROM anon, authenticated;
GRANT SELECT ON cotizaciones, cotizacion_items TO authenticated;

-- ── §4 guardar_cotizacion ───────────────────────────────────────────────────
-- SECURITY DEFINER: las tablas no se escriben directo. Todo se acota a mano al negocio del JWT
-- (molde de registrar_abono, 0208). El precio, el IVA y la instantánea salen del catálogo como en
-- agregar_item_a_ticket (0152): de cada renglón solo se leen producto_id y cantidad.
CREATE OR REPLACE FUNCTION guardar_cotizacion(
  p_sucursal_id     uuid,
  p_caja_id         uuid,
  p_cliente_id      uuid,
  p_items           jsonb,
  p_client_id_local character varying DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   uuid := current_tenant_id();
  v_c        cotizaciones%ROWTYPE;
  v_dias     integer;
  v_hoy      date;
  v_item     jsonb;
  v_cantidad numeric(12,3);
  v_p        record;
  v_bruto    numeric(12,2);
  v_iva      numeric(12,2);
  v_total    numeric(12,2);
  v_orden    integer := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;

  -- Idempotencia (reintento de la caja): mismo client_id_local, misma cotización.
  IF p_client_id_local IS NOT NULL THEN
    SELECT * INTO v_c FROM cotizaciones WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_c.id, 'folio', v_c.folio, 'vigente_hasta', v_c.vigente_hasta,
                                'total', v_c.total_mxn, 'token_publico', v_c.token_publico);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de este negocio.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cajas WHERE id = p_caja_id AND tenant_id = v_tenant AND sucursal_id = p_sucursal_id) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la caja no es de esta sucursal.' USING ERRCODE = '22023';
  END IF;
  SELECT c.cotizacion_vigencia_dias INTO v_dias
    FROM configuracion_tenant c WHERE c.tenant_id = v_tenant AND c.modulo_cotizaciones_activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: las cotizaciones no están encendidas en este negocio.' USING ERRCODE = '22023';
  END IF;
  IF p_cliente_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el cliente no es de este negocio.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cotización no tiene renglones.' USING ERRCODE = '22023';
  END IF;

  SELECT (now() AT TIME ZONE t.timezone)::date INTO v_hoy FROM tenants t WHERE t.id = v_tenant;

  INSERT INTO cotizaciones (tenant_id, sucursal_id, caja_id, folio, cliente_id, vigente_hasta,
                            client_id_local, usuario_id)
  VALUES (v_tenant, p_sucursal_id, p_caja_id,
          'COT-' || (SELECT folio_completo FROM generar_folio(p_sucursal_id, 'COTIZACION')),
          p_cliente_id, v_hoy + v_dias, p_client_id_local, auth.uid())
  RETURNING * INTO v_c;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cantidad := (v_item->>'cantidad')::numeric;
    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: la cantidad de cada renglón debe ser mayor a 0.' USING ERRCODE = '22023';
    END IF;
    SELECT p.id, p.nombre, p.codigo_interno AS sku,
           precio_producto_en_sucursal(p.id, p_sucursal_id) AS precio_mxn,
           p.tasa_iva, p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
           p.es_combo, p.variante_ejes IS NOT NULL AS es_padre
      INTO v_p
      FROM productos p
     WHERE p.id = (v_item->>'producto_id')::uuid AND p.tenant_id = v_tenant AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un producto de la cotización no existe.' USING ERRCODE = '22023';
    END IF;
    IF v_p.es_combo THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: «%» es un combo y todavía no se cotiza.', v_p.nombre USING ERRCODE = '22023';
    END IF;
    IF v_p.es_padre THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: elige la variante (talla, color) de «%».', v_p.nombre USING ERRCODE = '22023';
    END IF;

    -- Regla de IVA de recalcular_totales_ticket (0156).
    v_bruto := v_cantidad * v_p.precio_mxn;
    IF v_p.iva_incluido_en_precio THEN
      v_iva   := ROUND(v_bruto - (v_bruto / (1 + v_p.tasa_iva / 100)), 2);
      v_total := v_bruto;
    ELSE
      v_iva   := ROUND(v_bruto * v_p.tasa_iva / 100, 2);
      v_total := v_bruto + v_iva;
    END IF;

    v_orden := v_orden + 1;
    INSERT INTO cotizacion_items (tenant_id, cotizacion_id, producto_id, cantidad, orden_visualizacion,
                                  producto_nombre_snapshot, producto_sku_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                                  clave_sat_snapshot, unidad_sat_snapshot,
                                  subtotal_bruto_mxn, iva_item_mxn, total_item_mxn)
    VALUES (v_tenant, v_c.id, v_p.id, v_cantidad, v_orden,
            v_p.nombre, v_p.sku, v_p.precio_mxn, v_p.tasa_iva, v_p.iva_incluido_en_precio,
            v_p.clave_sat, v_p.unidad_sat, v_bruto, v_iva, v_total);
  END LOOP;

  -- Como el ticket: subtotal = total - IVA.
  UPDATE cotizaciones c
     SET iva_mxn = s.iva, total_mxn = s.total, subtotal_mxn = s.total - s.iva
    FROM (SELECT sum(iva_item_mxn) AS iva, sum(total_item_mxn) AS total
            FROM cotizacion_items WHERE cotizacion_id = v_c.id) s
   WHERE c.id = v_c.id
  RETURNING c.* INTO v_c;

  RETURN jsonb_build_object('id', v_c.id, 'folio', v_c.folio, 'vigente_hasta', v_c.vigente_hasta,
                            'total', v_c.total_mxn, 'token_publico', v_c.token_publico);
END;
$$;
COMMENT ON FUNCTION guardar_cotizacion(uuid, uuid, uuid, jsonb, character varying) IS
  'Guarda una cotización con precios e IVA del catálogo de la sucursal (0212). p_items = [{producto_id, cantidad}]. Idempotente por client_id_local.';
REVOKE EXECUTE ON FUNCTION guardar_cotizacion(uuid, uuid, uuid, jsonb, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_cotizacion(uuid, uuid, uuid, jsonb, character varying) TO authenticated, service_role;

-- ── §5 cancelar_cotizacion ──────────────────────────────────────────────────
-- Solo una VIGENTE (vencida también). Repetir sobre una CANCELADA no truena: la caja reintenta.
CREATE OR REPLACE FUNCTION cancelar_cotizacion(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM cotizaciones WHERE id = p_id AND tenant_id = current_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cotización no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_estado = 'CANCELADA' THEN RETURN; END IF;
  IF v_estado <> 'VIGENTE' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cotización ya se convirtió en venta.' USING ERRCODE = '22023';
  END IF;
  UPDATE cotizaciones SET estado = 'CANCELADA', updated_at = now() WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION cancelar_cotizacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_cotizacion(uuid) TO authenticated, service_role;

-- ── §6 marcar_cotizacion_convertida ─────────────────────────────────────────
-- La venta ya está cobrada (PAGADO o FACTURADO) y es del mismo negocio. Vencida también vale: se
-- cobró con los precios de hoy. Repetir con la misma venta no truena.
CREATE OR REPLACE FUNCTION marcar_cotizacion_convertida(p_cotizacion_id uuid, p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_c      cotizaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM cotizaciones WHERE id = p_cotizacion_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cotización no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_c.estado = 'CONVERTIDA' AND v_c.ticket_id = p_ticket_id THEN RETURN; END IF;
  IF v_c.estado <> 'VIGENTE' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cotización ya está %.', lower(v_c.estado) USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant
                                         AND estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no existe o todavía no está cobrada.' USING ERRCODE = '22023';
  END IF;
  UPDATE cotizaciones SET estado = 'CONVERTIDA', ticket_id = p_ticket_id, updated_at = now() WHERE id = p_cotizacion_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION marcar_cotizacion_convertida(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_cotizacion_convertida(uuid, uuid) TO authenticated, service_role;

-- ── §7 cotizacion_publica ───────────────────────────────────────────────────
-- El enlace que se manda al cliente (molde de ticket_autofacturable, 0082). Solo lo que va impreso:
-- ni ids, ni estado, ni el token. Token desconocido o cotización cancelada = NULL.
CREATE OR REPLACE FUNCTION cotizacion_publica(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'negocio', t.nombre_comercial,
    'sucursal', jsonb_build_object(
      'nombre', s.nombre,
      'direccion', NULLIF(concat_ws(', ', NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                                    s.direccion_colonia, s.ciudad, s.estado_geo, s.codigo_postal), ''),
      'telefono', s.telefono),
    'folio', c.folio,
    'fecha', (c.created_at AT TIME ZONE t.timezone)::date,
    'vigente_hasta', c.vigente_hasta,
    'cliente', (SELECT NULLIF(trim(concat_ws(' ', cl.nombre, cl.apellido_paterno)), '')
                  FROM clientes cl WHERE cl.id = c.cliente_id AND cl.deleted_at IS NULL),
    'renglones', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'nombre', i.producto_nombre_snapshot,
                     'sku', i.producto_sku_snapshot,
                     'unidad_sat', i.unidad_sat_snapshot,
                     'cantidad', i.cantidad,
                     'precio_unitario', i.precio_unitario_snapshot,
                     'total', i.total_item_mxn) ORDER BY i.orden_visualizacion), '[]'::jsonb)
                    FROM cotizacion_items i WHERE i.cotizacion_id = c.id),
    'totales', jsonb_build_object('subtotal', c.subtotal_mxn, 'iva', c.iva_mxn, 'total', c.total_mxn))
  FROM cotizaciones c
  JOIN tenants t ON t.id = c.tenant_id
  JOIN sucursales s ON s.id = c.sucursal_id
  WHERE c.token_publico = p_token
    AND c.estado <> 'CANCELADA';
$$;
COMMENT ON FUNCTION cotizacion_publica(text) IS
  'Lo impreso de una cotización por su token público (0212): negocio, sucursal, folio, fechas, cliente, renglones y totales. NULL si no existe o se canceló.';
REVOKE EXECUTE ON FUNCTION cotizacion_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cotizacion_publica(text) TO anon, authenticated, service_role;
