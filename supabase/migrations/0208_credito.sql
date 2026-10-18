-- Retail 2, entrega 2: crédito por cliente, venta a crédito, abonos y corte (diseño 2026-10-18).
--
-- El negocio le da a un cliente un límite y un plazo. La venta a crédito se cobra entera con un pago
-- CREDITO (0207): el ticket queda PAGADO, pero ese pago no es dinero y el corte no lo cuenta. Lo que
-- el cliente debe de una venta es su pago CREDITO menos sus abonos y ajustes (abonos_credito). El
-- abono es dinero de verdad y suma al corte del turno que lo RECIBE, no al de la venta.
--
-- Viene apagado (configuracion_tenant.modulo_credito_activo): un restaurante no ve nada de esto.
-- Cancelar una venta a crédito, lealtad, factura y saldo a favor: 0209. Sync con la caja: 0210.

-- ── §1 Configuración y módulo ───────────────────────────────────────────────
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_credito_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credito_abonos_al_cancelar text NOT NULL DEFAULT 'SALDO_FAVOR'
    CHECK (credito_abonos_al_cancelar IN ('SALDO_FAVOR', 'EFECTIVO'));
COMMENT ON COLUMN configuracion_tenant.modulo_credito_activo IS
  'Interruptor del dueño para la venta a crédito (0208). Sin add-on: solo lo enciende un administrador del negocio.';
COMMENT ON COLUMN configuracion_tenant.credito_abonos_al_cancelar IS
  'Al cancelar una venta a crédito ya abonada, lo abonado se devuelve en EFECTIVO (sale del corte) o queda como SALDO_FAVOR del cliente (0208/0209).';

-- Molde de configuracion_tenant_segundos_solo_admin (0151): solo dueño o administrador cambia las dos.
-- En la caja el pull va en modo réplica y este disparador no corre: el valor llega tal cual.
CREATE OR REPLACE FUNCTION configuracion_tenant_credito_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND (NEW.modulo_credito_activo IS DISTINCT FROM OLD.modulo_credito_activo
                            OR NEW.credito_abonos_al_cancelar IS DISTINCT FROM OLD.credito_abonos_al_cancelar))
     OR (TG_OP = 'INSERT' AND (NEW.modulo_credito_activo OR NEW.credito_abonos_al_cancelar <> 'SALDO_FAVOR')) THEN
    IF NOT es_admin_del_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar la venta a crédito.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_credito_guardia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_credito_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_credito_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_credito_guardia();

-- Cuerpo vigente de la 0189 con `credito`: siempre permitido (no es add-on), encendido = interruptor
-- del dueño.
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

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189, 0208).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §2 Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes_credito (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  limite_mxn  numeric(12,2) NOT NULL CHECK (limite_mxn > 0),
  plazo_dias  integer NOT NULL CHECK (plazo_dias > 0),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid DEFAULT auth.uid(),
  CONSTRAINT clientes_credito_cliente_uq UNIQUE (tenant_id, cliente_id)
);
COMMENT ON TABLE clientes_credito IS
  'Crédito que el negocio le da a un cliente: límite y plazo (0208). Se apaga con activo = false, no se borra: puede haber deuda.';

CREATE OR REPLACE FUNCTION clientes_credito_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clientes_credito_auditoria() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_clientes_credito_auditoria ON clientes_credito;
CREATE TRIGGER trg_clientes_credito_auditoria
  BEFORE UPDATE ON clientes_credito
  FOR EACH ROW EXECUTE FUNCTION clientes_credito_auditoria();

CREATE TABLE IF NOT EXISTS abonos_credito (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id         uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id        uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,   -- el turno que lo RECIBE
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  tipo            text NOT NULL CHECK (tipo IN ('ABONO', 'AJUSTE_CANCELACION')),
  metodo_pago     metodo_pago NULL,
  monto_mxn       numeric(12,2) NOT NULL CHECK (monto_mxn > 0),
  estado          text NOT NULL DEFAULT 'APLICADO' CHECK (estado IN ('APLICADO', 'CANCELADO')),
  client_id_local varchar(100) NULL,
  usuario_id      uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Un abono es dinero (lleva método); un ajuste por cancelación solo baja la deuda (no lleva).
  CONSTRAINT abonos_credito_metodo CHECK ((tipo = 'ABONO') = (metodo_pago IS NOT NULL)),
  CONSTRAINT abonos_credito_client_id_local_uq UNIQUE (tenant_id, client_id_local)
);
CREATE INDEX IF NOT EXISTS idx_abonos_credito_ticket ON abonos_credito (ticket_id);
CREATE INDEX IF NOT EXISTS idx_abonos_credito_turno ON abonos_credito (turno_id);
CREATE INDEX IF NOT EXISTS idx_abonos_credito_cliente ON abonos_credito (tenant_id, cliente_id);
COMMENT ON TABLE abonos_credito IS
  'Lo que baja la deuda de una venta a crédito: ABONO (dinero, suma al turno que lo recibe) o AJUSTE_CANCELACION (sin dinero). Un renglón por venta. Solo se escribe por RPC (0208).';

-- ── §3 RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE clientes_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos_credito   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_credito_lectura ON clientes_credito;
CREATE POLICY clientes_credito_lectura ON clientes_credito FOR SELECT
  USING (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS clientes_credito_alta ON clientes_credito;
CREATE POLICY clientes_credito_alta ON clientes_credito FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)
              AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = cliente_id AND c.tenant_id = clientes_credito.tenant_id));
DROP POLICY IF EXISTS clientes_credito_cambio ON clientes_credito;
CREATE POLICY clientes_credito_cambio ON clientes_credito FOR UPDATE
  USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
  WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)
              AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = cliente_id AND c.tenant_id = clientes_credito.tenant_id));

DROP POLICY IF EXISTS abonos_credito_lectura ON abonos_credito;
CREATE POLICY abonos_credito_lectura ON abonos_credito FOR SELECT
  USING (tenant_id = current_tenant_id());

REVOKE ALL ON clientes_credito, abonos_credito FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON clientes_credito TO authenticated;
GRANT SELECT ON abonos_credito TO authenticated;

-- ── §4 Saldo de una venta y vista por cliente ───────────────────────────────
-- Invoker: bajo RLS solo ve las ventas del negocio de la sesión.
CREATE OR REPLACE FUNCTION credito_saldo_ticket(p_ticket uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (COALESCE((SELECT sum(p.monto_mxn) FROM pagos p
                     WHERE p.ticket_id = p_ticket AND p.metodo_pago = 'CREDITO'
                       AND p.estado = 'APLICADO' AND p.deleted_at IS NULL), 0)
        - COALESCE((SELECT sum(a.monto_mxn) FROM abonos_credito a
                     WHERE a.ticket_id = p_ticket AND a.estado = 'APLICADO'), 0))::numeric(12,2);
$$;
COMMENT ON FUNCTION credito_saldo_ticket(uuid) IS
  'Lo que se debe de una venta: su pago CREDITO aplicado menos sus abonos y ajustes aplicados (0208).';
REVOKE EXECUTE ON FUNCTION credito_saldo_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION credito_saldo_ticket(uuid) TO authenticated, service_role;

-- Vencido: alguna venta con saldo cuya fecha (en la zona del negocio) + plazo ya pasó.
CREATE OR REPLACE VIEW vw_creditos_cliente WITH (security_invoker = true) AS
WITH ventas AS (
  SELECT t.tenant_id, t.cliente_id, t.id AS ticket_id, t.fecha_pago, credito_saldo_ticket(t.id) AS saldo
    FROM tickets t
   WHERE t.cliente_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM pagos p
                  WHERE p.ticket_id = t.id AND p.metodo_pago = 'CREDITO'
                    AND p.estado = 'APLICADO' AND p.deleted_at IS NULL)
)
SELECT cc.tenant_id,
       cc.cliente_id,
       cc.limite_mxn,
       cc.plazo_dias,
       cc.activo,
       COALESCE(sum(v.saldo) FILTER (WHERE v.saldo > 0), 0)::numeric(12,2) AS deuda_mxn,
       GREATEST(cc.limite_mxn - COALESCE(sum(v.saldo) FILTER (WHERE v.saldo > 0), 0), 0)::numeric(12,2) AS disponible_mxn,
       min(v.fecha_pago) FILTER (WHERE v.saldo > 0) AS venta_mas_vieja_fecha,
       (array_agg(v.ticket_id ORDER BY v.fecha_pago, v.ticket_id) FILTER (WHERE v.saldo > 0))[1] AS venta_mas_vieja_ticket_id,
       COALESCE(bool_or(v.saldo > 0
                        AND (v.fecha_pago AT TIME ZONE tn.timezone)::date + cc.plazo_dias
                            < (now() AT TIME ZONE tn.timezone)::date), false) AS tiene_vencido
  FROM clientes_credito cc
  JOIN tenants tn ON tn.id = cc.tenant_id
  LEFT JOIN ventas v ON v.tenant_id = cc.tenant_id AND v.cliente_id = cc.cliente_id
 GROUP BY cc.tenant_id, cc.cliente_id, cc.limite_mxn, cc.plazo_dias, cc.activo, tn.timezone;
COMMENT ON VIEW vw_creditos_cliente IS
  'Por cliente con crédito: deuda, disponible, venta más vieja con saldo y si hay algo vencido (0208).';
REVOKE ALL ON vw_creditos_cliente FROM anon, authenticated;
GRANT SELECT ON vw_creditos_cliente TO authenticated;

-- ── §5 Permiso ──────────────────────────────────────────────────────────────
INSERT INTO permisos (codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin)
SELECT 'venta.credito_excedido', 'Vender a crédito sobre el límite o con pagos vencidos',
       'Autoriza una venta a crédito que pasa el límite del cliente o cuando tiene pagos vencidos (0208).',
       'VENTA', true, 3
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'venta.credito_excedido');

INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
SELECT rp.rol_id, (SELECT id FROM permisos WHERE codigo = 'venta.credito_excedido'), rp.concedido
  FROM rol_permisos rp
  JOIN permisos p ON p.id = rp.permiso_id
 WHERE p.codigo = 'venta.cancelar_pagada'
   AND NOT EXISTS (
     SELECT 1 FROM rol_permisos x
      WHERE x.rol_id = rp.rol_id
        AND x.permiso_id = (SELECT id FROM permisos WHERE codigo = 'venta.credito_excedido'));

-- ── §6 Guardia: un CREDITO solo entra por pagar_a_credito ───────────────────
-- pagar_a_credito pone vim.pago_credito = 'si' (local a la transacción) antes de llamar a
-- aplicar_pago. Sin eso, aplicar_pago directo con CREDITO marcaría la venta PAGADO sin validar
-- cliente ni límite. Y un pago no se cambia de ni a CREDITO (cambiar_forma_pago_ticket, 0201, o
-- un PATCH directo a pagos): EFECTIVO→CREDITO crearía deuda sin validar nada y sacaría el efectivo
-- del corte; CREDITO→EFECTIVO borraría la deuda y el corte esperaría dinero que nadie dio
-- (precedente: PAGO_EN_LINEA, 0173). En la caja el push y el pull van en modo réplica y esto no
-- corre: la caja ya validó en local. Cada método "solo por RPC" se suma a los WHEN y a una rama
-- de la función (SALDO_FAVOR: 0209).
CREATE OR REPLACE FUNCTION pagos_metodo_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito no cambia de forma de pago, ni otra pasa a crédito. Cancela la venta y vuelve a cobrarla.'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.metodo_pago = 'CREDITO' AND current_setting('vim.pago_credito', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito se cobra con «A crédito» (pagar_a_credito).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pagos_metodo_solo_por_rpc() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc
  BEFORE INSERT ON pagos
  FOR EACH ROW WHEN (NEW.metodo_pago IN ('CREDITO'))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();
-- Un disparador de INSERT no puede leer OLD en su WHEN: el del cambio va aparte.
DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc_cambio ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc_cambio
  BEFORE UPDATE OF metodo_pago ON pagos
  FOR EACH ROW WHEN (OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago
                     AND (OLD.metodo_pago IN ('CREDITO') OR NEW.metodo_pago IN ('CREDITO')))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();

-- ── §7 pagar_a_credito ──────────────────────────────────────────────────────
-- SECURITY INVOKER como aplicar_pago: el ticket, el crédito y la vista se leen bajo RLS del negocio
-- de la sesión, así que no hace falta revalidar el tenant a mano.
CREATE OR REPLACE FUNCTION pagar_a_credito(
  p_ticket_id           uuid,
  p_autorizacion_pin_id uuid DEFAULT NULL,
  p_client_id_local     character varying DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_t      tickets%ROWTYPE;
  v_c      vw_creditos_cliente%ROWTYPE;
  v_monto  numeric(12,2);
  v_pago   uuid;
  v_motivo text;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no existe.' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia (reintento de la caja): mismo client_id_local y misma venta, mismo pago. Si el
  -- client_id_local es de otra venta, aplicar_pago devolvería ese pago ajeno: se rechaza.
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_pago FROM pagos
     WHERE tenant_id = v_t.tenant_id AND client_id_local = p_client_id_local AND ticket_id = p_ticket_id;
    IF FOUND THEN RETURN v_pago; END IF;
    IF EXISTS (SELECT 1 FROM pagos WHERE tenant_id = v_t.tenant_id AND client_id_local = p_client_id_local) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: ese identificador de pago ya es de otra venta.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT COALESCE((SELECT modulo_credito_activo FROM configuracion_tenant WHERE tenant_id = v_t.tenant_id), false) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta a crédito no está encendida en este negocio.' USING ERRCODE = '22023';
  END IF;
  IF v_t.estado_fiscal <> 'ABIERTO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo una venta abierta se puede mandar a crédito.' USING ERRCODE = '22023';
  END IF;
  IF v_t.total_mxn <= 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta está en cero.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pagos WHERE ticket_id = p_ticket_id AND deleted_at IS NULL AND estado <> 'CANCELADO') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: a crédito va la venta completa y esta ya tiene pagos.' USING ERRCODE = '22023';
  END IF;
  IF v_t.cliente_id IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: asigna un cliente para vender a crédito.' USING ERRCODE = '22023';
  END IF;

  -- Dos ventas a crédito simultáneas del mismo cliente no pasan juntas el límite.
  -- ponytail: candado consultivo por cliente (el cajero no puede FOR UPDATE en clientes_credito).
  PERFORM pg_advisory_xact_lock(hashtextextended('credito:' || v_t.cliente_id::text, 0));

  SELECT * INTO v_c FROM vw_creditos_cliente WHERE tenant_id = v_t.tenant_id AND cliente_id = v_t.cliente_id;
  IF NOT FOUND OR NOT v_c.activo THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: este cliente no tiene crédito.' USING ERRCODE = '22023';
  END IF;

  v_monto := v_t.total_mxn + COALESCE(v_t.propina_mxn, 0);
  IF v_c.tiene_vencido THEN
    v_motivo := 'el cliente tiene pagos vencidos: pide autorización.';
  ELSIF v_c.deuda_mxn + v_monto > v_c.limite_mxn THEN
    v_motivo := 'la venta pasa el límite de crédito: pide autorización.';
  END IF;
  IF v_motivo IS NOT NULL THEN
    IF p_autorizacion_pin_id IS NULL THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: %', v_motivo USING ERRCODE = '22023';
    END IF;
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.credito_excedido'],
                                  p_ticket_id, NULL, NULL, false, v_t.tenant_id);
  END IF;

  PERFORM set_config('vim.pago_credito', 'si', true);
  v_pago := aplicar_pago(p_ticket_id, 'CREDITO'::metodo_pago, v_monto,
                         p_client_id_local := p_client_id_local);
  PERFORM set_config('vim.pago_credito', '', true);
  RETURN v_pago;
END;
$$;
COMMENT ON FUNCTION pagar_a_credito(uuid, uuid, character varying) IS
  'Cobra la venta completa a crédito del cliente asignado (0208). Pide venta.credito_excedido si pasa el límite o hay algo vencido.';
REVOKE EXECUTE ON FUNCTION pagar_a_credito(uuid, uuid, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pagar_a_credito(uuid, uuid, character varying) TO authenticated, service_role;

-- ── §8 registrar_abono ──────────────────────────────────────────────────────
-- SECURITY DEFINER: abonos_credito no se escribe directo (sin INSERT para authenticated) y hace
-- falta FOR UPDATE en clientes_credito, que el cajero no puede modificar. Por eso todo se acota
-- a mano al negocio del JWT (molde de cambiar_costo_zona, 0139).
-- Se abona aunque el módulo esté apagado o el crédito del cliente inactivo: una deuda siempre se paga.
CREATE OR REPLACE FUNCTION registrar_abono(
  p_cliente_id      uuid,
  p_monto           numeric,
  p_metodo          metodo_pago,
  p_caja_id         uuid,
  p_turno_id        uuid,
  p_client_id_local character varying DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant    uuid := current_tenant_id();
  v_turno     turnos%ROWTYPE;
  v_monto     numeric(12,2) := round(p_monto, 2);
  v_deuda     numeric(12,2);
  v_resto     numeric(12,2);
  v_parte     numeric(12,2);
  v_n         integer := 0;
  v_id        uuid;
  v_renglones jsonb := '[]'::jsonb;
  v_r         record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un abono se recibe en efectivo, tarjeta o transferencia.' USING ERRCODE = '22023';
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el abono debe ser mayor a 0.' USING ERRCODE = '22023';
  END IF;
  -- Cabe en varchar(100) con el sufijo de renglón (-1, -2, …).
  IF length(p_client_id_local) > 90 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el identificador del abono pasa de 90 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Un abono a la vez por cliente: dos simultáneos no pasan juntos la deuda.
  PERFORM 1 FROM clientes_credito WHERE tenant_id = v_tenant AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: este cliente no tiene crédito.' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia: los renglones de un abono son <client_id_local>-1, -2, …
  IF p_client_id_local IS NOT NULL AND EXISTS (
       SELECT 1 FROM abonos_credito WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local || '-1') THEN
    SELECT COALESCE(sum(a.monto_mxn), 0),
           COALESCE(jsonb_agg(jsonb_build_object('abono_id', a.id, 'ticket_id', a.ticket_id, 'monto_mxn', a.monto_mxn)
                              ORDER BY a.created_at, a.client_id_local), '[]'::jsonb)
      INTO v_monto, v_renglones
      FROM abonos_credito a
     WHERE a.tenant_id = v_tenant AND a.cliente_id = p_cliente_id
       AND starts_with(a.client_id_local, p_client_id_local || '-');
    SELECT COALESCE(sum(s.saldo), 0) INTO v_deuda
      FROM (SELECT credito_saldo_ticket(t.id) AS saldo FROM tickets t
             WHERE t.tenant_id = v_tenant AND t.cliente_id = p_cliente_id) s
     WHERE s.saldo > 0;
    RETURN jsonb_build_object('abonado', v_monto, 'deuda_restante', v_deuda, 'renglones', v_renglones);
  END IF;

  SELECT * INTO v_turno FROM turnos
   WHERE id = p_turno_id AND tenant_id = v_tenant AND caja_id = p_caja_id AND estado = 'ABIERTO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el abono se recibe en un turno abierto de esta caja.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(s.saldo), 0) INTO v_deuda
    FROM (SELECT credito_saldo_ticket(t.id) AS saldo FROM tickets t
           WHERE t.tenant_id = v_tenant AND t.cliente_id = p_cliente_id) s
   WHERE s.saldo > 0;
  IF v_monto > v_deuda THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el abono (%) pasa de lo que debe el cliente (%).', v_monto, v_deuda
      USING ERRCODE = '22023';
  END IF;

  -- De la venta más vieja a la más nueva; un renglón por venta tocada.
  v_resto := v_monto;
  FOR v_r IN
    SELECT s.id, s.saldo FROM (
      SELECT t.id, t.fecha_pago, credito_saldo_ticket(t.id) AS saldo FROM tickets t
       WHERE t.tenant_id = v_tenant AND t.cliente_id = p_cliente_id) s
     WHERE s.saldo > 0
     ORDER BY s.fecha_pago, s.id
  LOOP
    EXIT WHEN v_resto <= 0;
    v_parte := LEAST(v_resto, v_r.saldo);
    v_n := v_n + 1;
    INSERT INTO abonos_credito (tenant_id, sucursal_id, caja_id, turno_id, cliente_id, ticket_id,
                                tipo, metodo_pago, monto_mxn, client_id_local, usuario_id)
    VALUES (v_tenant, v_turno.sucursal_id, v_turno.caja_id, v_turno.id, p_cliente_id, v_r.id,
            'ABONO', p_metodo, v_parte,
            CASE WHEN p_client_id_local IS NULL THEN NULL ELSE p_client_id_local || '-' || v_n END,
            auth.uid())
    RETURNING id INTO v_id;
    v_renglones := v_renglones || jsonb_build_array(jsonb_build_object('abono_id', v_id, 'ticket_id', v_r.id, 'monto_mxn', v_parte));
    v_resto := v_resto - v_parte;
  END LOOP;

  RETURN jsonb_build_object('abonado', v_monto, 'deuda_restante', v_deuda - v_monto, 'renglones', v_renglones);
END;
$$;
COMMENT ON FUNCTION registrar_abono(uuid, numeric, metodo_pago, uuid, uuid, character varying) IS
  'Abono de un cliente a su crédito, repartido de la venta más vieja a la más nueva (0208). Suma al corte del turno que lo recibe.';
REVOKE EXECUTE ON FUNCTION registrar_abono(uuid, numeric, metodo_pago, uuid, uuid, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_abono(uuid, numeric, metodo_pago, uuid, uuid, character varying) TO authenticated, service_role;

-- ── §9 Corte: efectivo esperado ─────────────────────────────────────────────
-- Cuerpo vigente de la 0042 + los abonos en efectivo que recibió ESTE turno. Los pagos CREDITO ya
-- no entraban (solo cuenta EFECTIVO).
CREATE OR REPLACE FUNCTION public.calcular_efectivo_esperado(p_turno_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_turno          turnos%ROWTYPE;
  v_pagos_efectivo numeric(12,2);
  v_movimientos    numeric(12,2);
  v_abonos         numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_pagos_efectivo
  FROM pagos p
  WHERE p.turno_id = p_turno_id
    AND p.metodo_pago = 'EFECTIVO'
    AND p.estado = 'APLICADO'
    AND p.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('INYECCION_FONDO', 'AJUSTE_POSITIVO') THEN monto_mxn
      WHEN tipo IN ('SANGRIA', 'DEPOSITO', 'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR', 'AJUSTE_NEGATIVO') THEN -monto_mxn
      ELSE 0
    END
  ), 0) INTO v_movimientos
  FROM movimientos_caja
  WHERE turno_id = p_turno_id
    AND cancelado = false;   -- 0042: excluir movimientos cancelados

  -- 0208: abonos a crédito recibidos en efectivo en este turno.
  SELECT COALESCE(SUM(a.monto_mxn), 0) INTO v_abonos
  FROM abonos_credito a
  WHERE a.turno_id = p_turno_id
    AND a.tipo = 'ABONO'
    AND a.metodo_pago = 'EFECTIVO'
    AND a.estado = 'APLICADO';

  RETURN v_turno.fondo_inicial_mxn + v_pagos_efectivo + v_movimientos + v_abonos;
END;
$function$;

-- ── §10 Corte: reporte_x ────────────────────────────────────────────────────
-- Cuerpo vigente de la 0157. Cambios marcados «0208»: pagos_por_metodo (lo que se declara) deja
-- fuera el CREDITO y suma los abonos del turno por método; ventas_a_credito_mxn informa lo vendido
-- a crédito sin pedir que se declare.
CREATE OR REPLACE FUNCTION reporte_x(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_resultado    jsonb;
  v_pagos_metodo jsonb;
  v_tickets      jsonb;
  v_devoluciones jsonb;
  v_movimientos  jsonb;
  v_efectivo_esperado numeric(12,2);
  v_ventas_credito numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe o no pertenece al tenant', p_turno_id;
  END IF;

  -- ===== Pagos por método (suma de tickets PAGADO/FACTURADO del turno) =====
  SELECT jsonb_agg(jsonb_build_object(
    'metodo_pago', metodo_pago,
    'monto_total_mxn', monto_total,
    'cantidad_pagos', cantidad
  ) ORDER BY metodo_pago)
  INTO v_pagos_metodo
  FROM (
    SELECT
      x.metodo_pago,
      SUM(x.monto_mxn) AS monto_total,
      COUNT(*) AS cantidad
    FROM (
      SELECT p.metodo_pago, p.monto_mxn
      FROM pagos p
      JOIN tickets t ON t.id = p.ticket_id
      WHERE p.turno_id = p_turno_id
        AND p.deleted_at IS NULL
        AND p.estado = 'APLICADO'
        AND p.metodo_pago <> 'CREDITO'                         -- 0208: no es dinero recibido
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
      UNION ALL
      SELECT a.metodo_pago, a.monto_mxn                        -- 0208: abonos recibidos en el turno
      FROM abonos_credito a
      WHERE a.turno_id = p_turno_id
        AND a.tipo = 'ABONO'
        AND a.estado = 'APLICADO'
    ) x
    GROUP BY x.metodo_pago
  ) sub;

  -- 0208: lo vendido a crédito en el turno (informativo, no se declara).
  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_ventas_credito
  FROM pagos p
  JOIN tickets t ON t.id = p.ticket_id
  WHERE p.turno_id = p_turno_id
    AND p.deleted_at IS NULL
    AND p.estado = 'APLICADO'
    AND p.metodo_pago = 'CREDITO'
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO');

  -- ===== Tickets del turno =====
  SELECT jsonb_build_object(
    'total_tickets_abiertos',     COUNT(*) FILTER (WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'total_tickets_pagados',      COUNT(*) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')),
    'total_tickets_cancelados',   COUNT(*) FILTER (WHERE estado_fiscal = 'CANCELADO'),
    'total_tickets_en_espera',    COUNT(*) FILTER (WHERE en_espera = true AND estado_fiscal = 'ABIERTO'),
    'subtotal_neto_mxn',          COALESCE(SUM(subtotal_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'iva_neto_mxn',               COALESCE(SUM(iva_mxn)      FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'total_neto_mxn',             COALESCE(SUM(total_mxn)    FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'descuentos_manuales_mxn',    COALESCE(SUM(descuentos_manuales_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'promociones_mxn',            COALESCE(SUM(promociones_mxn)        FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'lealtad_mxn',                COALESCE(SUM(lealtad_mxn)            FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),  -- 0157
    'propina_total_mxn',          COALESCE(SUM(propina_mxn)                FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'ticket_promedio_mxn',        COALESCE(AVG(total_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0)
  ) INTO v_tickets
  FROM tickets
  WHERE turno_id = p_turno_id
    AND deleted_at IS NULL;

  -- ===== Devoluciones del turno =====
  SELECT jsonb_build_object(
    'cantidad',      COUNT(*),
    'total_mxn',     COALESCE(SUM(total_devuelto_mxn), 0),
    'por_motivo',    COALESCE(jsonb_object_agg(motivo, count_motivo), '{}'::jsonb)
  ) INTO v_devoluciones
  FROM (
    SELECT
      motivo,
      total_devuelto_mxn,
      COUNT(*) OVER (PARTITION BY motivo) AS count_motivo
    FROM devoluciones
    WHERE turno_id = p_turno_id
      AND estado = 'CONFIRMADA'
      AND deleted_at IS NULL
  ) sub;

  -- ===== Movimientos de caja (inyecciones, retiros, depósitos, devoluciones efectivo) =====
  SELECT jsonb_agg(jsonb_build_object(
    'tipo', tipo,
    'cantidad', cantidad,
    'monto_total_mxn', monto_total
  ))
  INTO v_movimientos
  FROM (
    SELECT
      tipo,
      COUNT(*) AS cantidad,
      SUM(monto_mxn) AS monto_total
    FROM movimientos_caja
    WHERE turno_id = p_turno_id
    GROUP BY tipo
  ) sub;

  -- ===== Efectivo esperado en caja =====
  SELECT calcular_efectivo_esperado(p_turno_id) INTO v_efectivo_esperado;

  -- ===== Construir respuesta completa =====
  v_resultado := jsonb_build_object(
    'reporte_tipo', 'X',
    'turno_id', v_turno.id,
    'turno_estado', v_turno.estado,
    'sucursal_id', v_turno.sucursal_id,
    'caja_id', v_turno.caja_id,
    'usuario_apertura_id', v_turno.usuario_apertura_id,
    'fecha_apertura', v_turno.fecha_apertura,
    'fondo_apertura_mxn', v_turno.fondo_inicial_mxn,
    'fecha_consulta', now(),

    'tickets', v_tickets,
    'pagos_por_metodo', COALESCE(v_pagos_metodo, '[]'::jsonb),
    'ventas_a_credito_mxn', v_ventas_credito,                  -- 0208
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn. 0208: sin CREDITO en pagos_por_metodo, con abonos; ventas_a_credito_mxn.';
