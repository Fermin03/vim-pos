-- ============================================================================
-- 0156 · Sistema de lealtad (ADR 0030; spec docs/superpowers/specs/2026-10-05-lealtad-design.md)
--
-- Libro de movimientos que solo se agrega; el saldo se deriva de él. Ganar corre donde se cobra
-- (caja o nube); canjear lo autoriza solo la nube. Esta migración corre también en el Postgres de
-- cada caja: nada aquí puede depender de algo que solo exista en la nube.
-- ============================================================================

-- ── §1 Tipos y tablas ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE lealtad_mecanica AS ENUM ('PUNTOS_DINERO', 'SELLOS', 'PUNTOS_PREMIOS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lealtad_movimiento_tipo AS ENUM
    ('GANADO', 'CANJE', 'REVERSA_GANADO', 'REVERSA_CANJE', 'AJUSTE', 'VENCIMIENTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lealtad_programa (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  mecanica            lealtad_mecanica NOT NULL,
  -- Sube en cada cambio de mecánica. Un movimiento de otra versión se registra y no suma.
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  porcentaje          numeric(5,2) NULL CHECK (porcentaje > 0 AND porcentaje <= 50),       -- PUNTOS_DINERO
  pesos_por_punto     numeric(10,2) NULL CHECK (pesos_por_punto > 0),                      -- PUNTOS_PREMIOS
  compra_minima_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (compra_minima_mxn >= 0),
  vencimiento_meses   integer NULL CHECK (vencimiento_meses BETWEEN 1 AND 60),             -- NULL = nunca
  tope_compras_dia    integer NOT NULL DEFAULT 3 CHECK (tope_compras_dia BETWEEN 1 AND 50),
  -- Última vez que se encendió el módulo: el reloj de vencimiento no corre mientras está apagado.
  encendido_desde     timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lealtad_programa_parametros_chk CHECK (
    (mecanica = 'PUNTOS_DINERO'  AND porcentaje IS NOT NULL)
    OR (mecanica = 'PUNTOS_PREMIOS' AND pesos_por_punto IS NOT NULL)
    OR mecanica = 'SELLOS')
);
COMMENT ON TABLE lealtad_programa IS 'Programa de lealtad del negocio: una fila, una mecánica activa. ADR 0030.';

CREATE TABLE IF NOT EXISTS lealtad_premios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  costo       integer NOT NULL CHECK (costo > 0),                 -- puntos o sellos
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lealtad_premios_producto_uq
  ON lealtad_premios (tenant_id, producto_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE lealtad_premios IS 'Catálogo de premios (SELLOS y PUNTOS_PREMIOS). Baja a la caja; usa deleted_at porque el pull no trae lápidas.';

CREATE TABLE IF NOT EXISTS lealtad_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo                lealtad_movimiento_tipo NOT NULL,
  puntos              integer NOT NULL,                            -- con signo
  programa_version    integer NOT NULL,
  -- SIN llave foránea a propósito: el movimiento puede llegar a la nube en un lote anterior al de
  -- su ticket, y una FK lo rechazaría en cada ciclo.
  ticket_id           uuid NULL,
  sucursal_id         uuid NULL,
  caja_id             uuid NULL,
  usuario_id          uuid NULL,
  premio_id           uuid NULL,
  monto_mxn           numeric(12,2) NULL,
  motivo              text NULL,
  -- En una REVERSA_CANJE: el id del CANJE que deshace.
  canje_movimiento_id uuid NULL,
  -- El saldo tal como quedó donde se escribió. La verdad es lealtad_saldos de la nube.
  saldo_visto         integer NULL,
  fecha               timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lealtad_mov_signo_chk CHECK (
    (tipo IN ('GANADO', 'REVERSA_CANJE') AND puntos > 0)
    OR (tipo IN ('CANJE', 'REVERSA_GANADO', 'VENCIMIENTO') AND puntos < 0)
    OR (tipo = 'AJUSTE' AND puntos <> 0))
);
CREATE INDEX IF NOT EXISTS idx_lealtad_mov_cliente ON lealtad_movimientos (tenant_id, cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_lealtad_mov_ticket ON lealtad_movimientos (ticket_id) WHERE ticket_id IS NOT NULL;
-- Un canje se deshace una sola vez, venga la reversa de la caja o de la red de seguridad.
CREATE UNIQUE INDEX IF NOT EXISTS lealtad_mov_una_reversa_por_canje
  ON lealtad_movimientos (canje_movimiento_id) WHERE tipo = 'REVERSA_CANJE';
COMMENT ON TABLE lealtad_movimientos IS 'El libro de la lealtad. Solo se agrega; lo escriben funciones definer. ADR 0030.';

CREATE TABLE IF NOT EXISTS lealtad_saldos (
  cliente_id        uuid PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  saldo             integer NOT NULL DEFAULT 0,
  ultima_actividad  timestamptz NULL,
  vence_el          date NULL,
  programa_version  integer NOT NULL DEFAULT 1,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lealtad_saldos_tenant ON lealtad_saldos (tenant_id);
COMMENT ON TABLE lealtad_saldos IS 'Saldo por cliente. La verdad es la de la nube; en la caja es una copia que el pull corrige con los movimientos pendientes de subir.';

CREATE TABLE IF NOT EXISTS ticket_canjes_lealtad (
  -- El id ES el id del movimiento CANJE que la nube autorizó.
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id             uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cliente_id            uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  premio_id             uuid NULL,
  -- NULL = descuento sobre la cuenta (PUNTOS_DINERO). Con valor = premio de producto sobre ese renglón.
  ticket_item_id        uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,
  puntos                integer NOT NULL CHECK (puntos > 0),
  monto_descontado_mxn  numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),
  revertido             boolean NOT NULL DEFAULT false,
  revertido_at          timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_canje_uno_vivo ON ticket_canjes_lealtad (ticket_id) WHERE NOT revertido;
-- recalcular_totales_ticket busca el premio de cada renglón en cada venta, y el trigger de §6 busca el
-- canje de cada renglón que se cancela o se borra. La FK ON DELETE CASCADE de ticket_item_id también
-- lo usa. Sin índice, cada una de esas búsquedas recorre la tabla entera.
CREATE INDEX IF NOT EXISTS idx_ticket_canjes_item ON ticket_canjes_lealtad (ticket_item_id) WHERE ticket_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_canjes_ticket ON ticket_canjes_lealtad (ticket_id);
COMMENT ON TABLE ticket_canjes_lealtad IS 'El canje aplicado a un ticket. Un canje vivo por ticket. Sube con su ticket.';

CREATE TABLE IF NOT EXISTS clientes_alias (
  alias_id    uuid PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE clientes_alias IS 'Id que una caja le dio a un cliente cuyo teléfono ya existía en la nube con otro id. La nube redirige a cliente_id todo lo que llegue con alias_id.';

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lealtad_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (lealtad_mxn >= 0);
COMMENT ON COLUMN tickets.lealtad_mxn IS 'Descuento por canje de lealtad. Hermano de promociones_mxn y descuentos_manuales_mxn; lo mantiene recalcular_totales_ticket.';

-- Código inadivinable para la página pública de consulta (entrega 3). Nace ya para que baje a las
-- cajas con el cliente. Sin pgcrypto: dos uuid v4 dan ~244 bits.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_publico text NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_publico_uq ON clientes (codigo_publico);

ALTER TABLE configuracion_tenant ADD COLUMN IF NOT EXISTS modulo_lealtad_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_lealtad_activo IS 'Interruptor del dueño para la lealtad. VIM concede el add-on LEALTAD; el dueño lo enciende. Es lo único que la caja puede consultar en SQL (tenant_addons no baja).';

-- ── §2 RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE lealtad_programa       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_premios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_saldos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_canjes_lealtad  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_alias         ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON lealtad_programa, lealtad_premios TO authenticated;
GRANT SELECT ON lealtad_movimientos, lealtad_saldos, ticket_canjes_lealtad, clientes_alias TO authenticated;
-- Los privilegios por omisión del esquema (0065) dan CRUD completo a `authenticated` a toda tabla
-- nueva, y un GRANT no quita lo ya dado. Sin estos REVOKE, un UPDATE sobre un saldo no lanzaría
-- permiso denegado: RLS lo filtraría en silencio y el hueco quedaría a una política de distancia.
REVOKE INSERT, UPDATE, DELETE ON lealtad_movimientos, lealtad_saldos, ticket_canjes_lealtad, clientes_alias FROM authenticated;
REVOKE DELETE ON lealtad_programa, lealtad_premios FROM authenticated;
GRANT ALL ON lealtad_programa, lealtad_premios, lealtad_movimientos, lealtad_saldos,
             ticket_canjes_lealtad, clientes_alias TO service_role;

DO $$
DECLARE t text;
BEGIN
  -- Lectura: todo empleado del negocio.
  FOREACH t IN ARRAY ARRAY['lealtad_programa', 'lealtad_premios', 'lealtad_movimientos',
                           'lealtad_saldos', 'ticket_canjes_lealtad', 'clientes_alias'] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t || '_select', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
  -- Escritura: solo dueño o administrador, y solo en programa y premios. El libro, los saldos y
  -- los canjes los escriben funciones definer: no tienen política de escritura a propósito.
  FOREACH t IN ARRAY ARRAY['lealtad_programa', 'lealtad_premios'] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_insert', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)) WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_update', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_lealtad_programa_updated_at ON lealtad_programa;
CREATE TRIGGER trg_lealtad_programa_updated_at BEFORE UPDATE ON lealtad_programa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_lealtad_premios_updated_at ON lealtad_premios;
CREATE TRIGGER trg_lealtad_premios_updated_at BEFORE UPDATE ON lealtad_premios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §3 Add-on, módulo e interruptor ─────────────────────────────────────────
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES (
  'LEALTAD',
  'Programa de lealtad',
  'Tus clientes ganan puntos o sellos en cada compra y los canjean en caja. '
    || 'Incluido sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('lealtad', true),
  25
)
ON CONFLICT (codigo) DO NOTHING;

UPDATE planes
   SET features_incluidos = COALESCE(features_incluidos, '{}'::jsonb) || jsonb_build_object('lealtad_incluido', codigo <> 'ESENCIAL'),
       updated_at = now()
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- Fecha en que vence un saldo: la última actividad (o el último encendido, lo que sea más reciente)
-- más los meses del programa, en hora de México. NULL = no vence.
CREATE OR REPLACE FUNCTION lealtad_vence_el(p_tenant uuid, p_ultima timestamptz)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p.vencimiento_meses IS NULL OR p_ultima IS NULL THEN NULL
    ELSE ((GREATEST(p_ultima, COALESCE(p.encendido_desde, p_ultima)) AT TIME ZONE 'America/Mexico_City')::date
          + make_interval(months => p.vencimiento_meses))::date
  END
  FROM lealtad_programa p WHERE p.tenant_id = p_tenant;
$$;
REVOKE ALL ON FUNCTION lealtad_vence_el(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_vence_el(uuid, timestamptz) TO authenticated, service_role;

-- El interruptor: solo dueño o admin, solo con add-on y programa. Al encender, el reloj de
-- vencimiento arranca de ese momento (spec §5, regla 9). SECURITY DEFINER porque
-- tenant_addon_activo es exclusiva de service_role desde la 0132.
-- En la caja el pull va en modo réplica y este trigger no se dispara: el valor llega tal cual.
CREATE OR REPLACE FUNCTION configuracion_tenant_lealtad_guardia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.modulo_lealtad_activo IS NOT DISTINCT FROM OLD.modulo_lealtad_activo THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.modulo_lealtad_activo = false THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'authenticated' AND NOT es_admin_del_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede encender o apagar la lealtad.' USING ERRCODE = '42501';
  END IF;

  IF NEW.modulo_lealtad_activo THEN
    IF NOT tenant_addon_activo(NEW.tenant_id, 'LEALTAD') THEN
      RAISE EXCEPTION 'SIN_ADDON_LEALTAD' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM lealtad_programa WHERE tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'SIN_PROGRAMA_LEALTAD' USING ERRCODE = '22023';
    END IF;
    UPDATE lealtad_programa SET encendido_desde = now() WHERE tenant_id = NEW.tenant_id;
    UPDATE lealtad_saldos s
       SET vence_el = lealtad_vence_el(s.tenant_id, s.ultima_actividad), updated_at = now()
     WHERE s.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_lealtad_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_lealtad_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_lealtad_guardia();

-- Retirar el add-on apaga el interruptor. Así "apagado" es un solo hecho que la caja sí puede leer.
CREATE OR REPLACE FUNCTION tenant_addons_apaga_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activo AND NOT NEW.activo
     AND NEW.addon_id = (SELECT id FROM addons WHERE codigo = 'LEALTAD')
     AND NOT tenant_addon_activo(NEW.tenant_id, 'LEALTAD') THEN
    UPDATE configuracion_tenant SET modulo_lealtad_activo = false
     WHERE tenant_id = NEW.tenant_id AND modulo_lealtad_activo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_addons_apaga_lealtad ON tenant_addons;
CREATE TRIGGER trg_tenant_addons_apaga_lealtad
  AFTER UPDATE OF activo ON tenant_addons
  FOR EACH ROW EXECUTE FUNCTION tenant_addons_apaga_lealtad();

-- Lectura única de módulos: se añade 'lealtad' con las mismas dos capas que delivery.
-- Cuerpo copiado ÍNTEGRO de 0113_delivery_addon.sql:43-112; solo se añaden v_lea y el bloque de lealtad.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
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

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb)
    INTO v_plan
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
    v_enc  := CASE v_codigo WHEN 'recetas' THEN COALESCE(v_inv, false) ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

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

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags) y efectivos (AND encendido por el dueño). Única lectura autorizada (ADR 0014).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §4 Ganar y revertir lo ganado ───────────────────────────────────────────

-- Cuánto gana una compra. PURA: tiene un espejo en TS (apps/pos, plan 1B) con los mismos casos
-- de smoke_lealtad_ganar.sql. Si cambias una, cambia la otra.
CREATE OR REPLACE FUNCTION lealtad_puntos_por_compra(
  p_mecanica lealtad_mecanica, p_base numeric, p_porcentaje numeric,
  p_pesos_por_punto numeric, p_compra_minima numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_base IS NULL OR p_base <= 0 OR p_base < COALESCE(p_compra_minima, 0) THEN 0
    WHEN p_mecanica = 'SELLOS' THEN 1
    WHEN p_mecanica = 'PUNTOS_DINERO' THEN floor(p_base * COALESCE(p_porcentaje, 0) / 100)::integer
    WHEN p_mecanica = 'PUNTOS_PREMIOS' AND COALESCE(p_pesos_por_punto, 0) > 0 THEN floor(p_base / p_pesos_por_punto)::integer
    ELSE 0
  END;
$$;
GRANT EXECUTE ON FUNCTION lealtad_puntos_por_compra(lealtad_mecanica, numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- EL ÚNICO punto que escribe el libro y el saldo. Idempotente por id (y por "una reversa por
-- canje"): devuelve false si el movimiento ya existía y entonces no toca el saldo.
-- Un movimiento de una versión anterior del programa se registra y no suma.
CREATE OR REPLACE FUNCTION lealtad_registrar_movimiento(
  p_id uuid, p_tenant uuid, p_cliente uuid, p_tipo lealtad_movimiento_tipo, p_puntos integer, p_version integer,
  p_ticket uuid DEFAULT NULL, p_sucursal uuid DEFAULT NULL, p_caja uuid DEFAULT NULL, p_usuario uuid DEFAULT NULL,
  p_premio uuid DEFAULT NULL, p_monto numeric DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_canje_mov uuid DEFAULT NULL, p_fecha timestamptz DEFAULT now(), p_saldo_visto integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_ver   integer;
  v_saldo integer;
BEGIN
  INSERT INTO lealtad_movimientos (
    id, tenant_id, cliente_id, tipo, puntos, programa_version, ticket_id, sucursal_id, caja_id,
    usuario_id, premio_id, monto_mxn, motivo, canje_movimiento_id, fecha, saldo_visto)
  VALUES (
    COALESCE(p_id, gen_random_uuid()), p_tenant, p_cliente, p_tipo, p_puntos, p_version, p_ticket, p_sucursal, p_caja,
    p_usuario, p_premio, p_monto, p_motivo, p_canje_mov, COALESCE(p_fecha, now()), p_saldo_visto)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;

  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF v_ver IS DISTINCT FROM p_version THEN RETURN true; END IF;

  INSERT INTO lealtad_saldos (cliente_id, tenant_id, saldo, ultima_actividad, programa_version)
  VALUES (p_cliente, p_tenant, p_puntos,
          CASE WHEN p_tipo IN ('GANADO', 'CANJE') THEN COALESCE(p_fecha, now()) END, p_version)
  ON CONFLICT (cliente_id) DO UPDATE
    SET saldo = lealtad_saldos.saldo + EXCLUDED.saldo,
        -- GREATEST ignora NULL: una reversa o un ajuste no cuentan como actividad.
        ultima_actividad = GREATEST(lealtad_saldos.ultima_actividad, EXCLUDED.ultima_actividad),
        programa_version = EXCLUDED.programa_version,
        updated_at = now()
  RETURNING saldo INTO v_saldo;

  UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(p_tenant, ultima_actividad) WHERE cliente_id = p_cliente;
  UPDATE lealtad_movimientos SET saldo_visto = COALESCE(saldo_visto, v_saldo) WHERE id = v_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION lealtad_registrar_movimiento(uuid, uuid, uuid, lealtad_movimiento_tipo, integer, integer, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_registrar_movimiento(uuid, uuid, uuid, lealtad_movimiento_tipo, integer, integer, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION lealtad_neto_ganado(p_ticket uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(puntos), 0)::integer FROM lealtad_movimientos
   WHERE ticket_id = p_ticket AND tipo IN ('GANADO', 'REVERSA_GANADO');
$$;
REVOKE ALL ON FUNCTION lealtad_neto_ganado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_neto_ganado(uuid) TO service_role;

-- Lo que gana un ticket al quedar pagado. Devuelve los puntos escritos (0 si no aplica).
-- Base: lo que el cliente pagó por comida. total_mxn ya viene neto de descuentos, promociones y
-- canje; se le quitan los renglones de cargo (el envío). La propina nunca entra en total_mxn.
CREATE OR REPLACE FUNCTION lealtad_acumular_por_ticket(p_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_t       tickets%ROWTYPE;
  v_p       lealtad_programa%ROWTYPE;
  v_cargos  numeric(12,2);
  v_puntos  integer;
  v_hoy     date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_compras integer;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_t.cliente_id IS NULL THEN RETURN 0; END IF;
  -- Los pedidos de apps de delivery no ganan.
  IF v_t.modo_servicio::text LIKE 'APP\_%' THEN RETURN 0; END IF;
  IF NOT COALESCE((SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_t.tenant_id), false) THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_t.tenant_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Idempotente: un ticket con ganado vivo no vuelve a ganar (FACTURADO→PAGADO, reintentos).
  IF lealtad_neto_ganado(p_ticket_id) > 0 THEN RETURN 0; END IF;

  -- Tope diario: tickets de HOY (hora de México) de este cliente que todavía tienen puntos vivos.
  -- Cuenta por neto, no por "sin reversa": un ticket con devolución parcial, o reabierto y vuelto a
  -- pagar, sigue reteniendo puntos y por eso sigue contando. Filtra por tenant para usar
  -- idx_lealtad_mov_cliente.
  SELECT count(DISTINCT m.ticket_id) INTO v_compras
    FROM lealtad_movimientos m
   WHERE m.tenant_id = v_t.tenant_id AND m.cliente_id = v_t.cliente_id AND m.tipo = 'GANADO'
     AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date = v_hoy
     AND lealtad_neto_ganado(m.ticket_id) > 0;
  IF v_compras >= v_p.tope_compras_dia THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
    FROM ticket_items WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;

  v_puntos := lealtad_puntos_por_compra(
    v_p.mecanica, GREATEST(v_t.total_mxn - v_cargos, 0), v_p.porcentaje, v_p.pesos_por_punto, v_p.compra_minima_mxn);
  IF v_puntos <= 0 THEN RETURN 0; END IF;

  PERFORM lealtad_registrar_movimiento(
    NULL, v_t.tenant_id, v_t.cliente_id, 'GANADO', v_puntos, v_p.version,
    p_ticket_id, v_t.sucursal_id, v_t.caja_id, auth.uid());
  RETURN v_puntos;
END $$;
REVOKE ALL ON FUNCTION lealtad_acumular_por_ticket(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_acumular_por_ticket(uuid) TO service_role;

-- Deshace lo ganado por un ticket, entero o en proporción (devolución parcial). Idempotente: solo
-- revierte lo que siga vivo. Devuelve los puntos revertidos.
-- p_fraccion es relativa al ticket ORIGINAL, así que se aplica a lo que el ticket ganó en su ciclo
-- actual (los puntos del último GANADO) y no a lo que queda tras reversas anteriores: dos
-- devoluciones de 50% suman el 100%. Una fracción >= 1 (cancelación, devolución total) revierte
-- todo lo que siga vivo.
CREATE OR REPLACE FUNCTION lealtad_revertir_ganado_ticket(p_ticket_id uuid, p_fraccion numeric DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_neto integer := lealtad_neto_ganado(p_ticket_id);
  v_m    lealtad_movimientos%ROWTYPE;
  v_rev  integer;
BEGIN
  IF v_neto <= 0 THEN RETURN 0; END IF;
  SELECT * INTO v_m FROM lealtad_movimientos
   WHERE ticket_id = p_ticket_id AND tipo = 'GANADO' ORDER BY fecha DESC LIMIT 1;
  v_rev := CASE
    WHEN COALESCE(p_fraccion, 1) >= 1 THEN v_neto
    ELSE LEAST(v_neto, ceil(v_m.puntos * GREATEST(p_fraccion, 0))::integer)
  END;
  IF v_rev <= 0 THEN RETURN 0; END IF;
  PERFORM lealtad_registrar_movimiento(
    NULL, v_m.tenant_id, v_m.cliente_id, 'REVERSA_GANADO', -v_rev, v_m.programa_version,
    p_ticket_id, v_m.sucursal_id, v_m.caja_id, auth.uid());
  RETURN v_rev;
END $$;
REVOKE ALL ON FUNCTION lealtad_revertir_ganado_ticket(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_revertir_ganado_ticket(uuid, numeric) TO service_role;

-- El gancho en tickets. SECURITY DEFINER: lo dispara el cajero al cobrar y las funciones de
-- adentro no son ejecutables por authenticated.
-- OJO: en la nube los tickets que suben de una caja entran en modo réplica y este trigger NO
-- corre; lo ganado en la caja llega como movimiento por el push (§8). Solo corre aquí para el
-- POS web, que cobra directo contra la nube.
-- Una venta no se cae por la lealtad: es un AFTER trigger, así que un error aquí revertiría el cobro
-- o la cancelación en una caja con clientes delante. Cualquier fallo se traga y queda como aviso
-- en el log.
CREATE OR REPLACE FUNCTION trg_ticket_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF NEW.estado_fiscal = 'PAGADO' AND OLD.estado_fiscal <> 'PAGADO' THEN
      PERFORM lealtad_acumular_por_ticket(NEW.id);
    ELSIF NEW.estado_fiscal IN ('CANCELADO', 'ABIERTO') AND OLD.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN
      -- Cancelar o reabrir una cuenta cobrada deshace lo que ganó.
      PERFORM lealtad_revertir_ganado_ticket(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo procesar el ticket %: %', NEW.id, SQLERRM;
  END;
  -- Cancelar una cuenta con un canje vivo lo devuelve. Reabrirla no: el canje sigue en la cuenta.
  -- Corre porque este trigger es AFTER: la cuenta ya está CANCELADO, así que revertir el canje no
  -- recalcula sus totales (§5) y la cuenta conserva lo que se vendió.
  -- Bloque propio: si devolver el canje falla, lo que se revirtió de lo ganado arriba no se deshace
  -- con él (un error dentro de un BEGIN…EXCEPTION revierte solo ese bloque).
  BEGIN
    IF NEW.estado_fiscal = 'CANCELADO' AND OLD.estado_fiscal <> 'CANCELADO' THEN
      PERFORM lealtad_revertir_canje_ticket(NEW.id, 'Cuenta cancelada');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo devolver el canje del ticket %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_lealtad ON tickets;
CREATE TRIGGER trg_tickets_lealtad
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_lealtad();

-- Devolución confirmada: revierte en proporción a lo devuelto. Misma condición de transición que
-- trg_devolucion_inventario (0009:314). Mismo criterio que trg_ticket_lealtad: una devolución no se
-- cae por la lealtad; el aviso queda en el log.
CREATE OR REPLACE FUNCTION trg_devolucion_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA' THEN
      SELECT total_mxn INTO v_total FROM tickets WHERE id = NEW.ticket_original_id;
      PERFORM lealtad_revertir_ganado_ticket(
        NEW.ticket_original_id,
        CASE WHEN COALESCE(v_total, 0) <= 0 THEN 1 ELSE LEAST(NEW.total_devuelto_mxn / v_total, 1) END);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo revertir lo ganado del ticket %: %', NEW.ticket_original_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_devoluciones_lealtad ON devoluciones;
CREATE TRIGGER trg_devoluciones_lealtad
  AFTER UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_lealtad();

-- ── §5 El canje en los totales del ticket ───────────────────────────────────
-- El canje es un descuento más. Dinero (ticket_item_id NULL): baja el total de la cuenta con el
-- mismo piso que descuentos y promociones (el envío no se come). Premio de producto: se descuenta
-- en el renglón, sumado a promocion_item_mxn. Se guarda ahí porque es la columna que ya existe por
-- renglón para un descuento automático (el que no pide PIN), y agregar una columna NOT NULL nueva a
-- ticket_items rompería el push de las cajas que todavía no se han actualizado. El timbrado NO lee
-- esa columna para el descuento: _shared/pac/conceptos.ts lo deduce de total_item_mxn e
-- iva_item_mxn, que ya salen con el premio descontado. Consecuencia: la suma de promocion_item_mxn
-- por renglón deja de cuadrar con tickets.promociones_mxn; la parte de lealtad se reporta en
-- tickets.lealtad_mxn (a nivel de ticket, el canje de dinero y el premio van ahí, nunca en
-- promociones_mxn), y solo lo que de verdad se aplicó. La invariante pasa a ser:
--     renglones vivos − (descuentos_manuales_mxn + promociones_mxn + lealtad_mxn) = total_mxn
-- Tal cual solo cuando el IVA va incluido en el precio; con IVA por fuera, el lado izquierdo es
-- antes de impuestos.
-- Sin un canje vivo todo se calcula EXACTAMENTE como en la 0116: el cuerpo de abajo es esa función
-- con solo los cambios marcados con "0156". Conserva el SET search_path de la 0116 (la 0044 se lo
-- puso con ALTER FUNCTION y un CREATE OR REPLACE sin la cláusula lo quita) y, como CREATE OR
-- REPLACE, el COMMENT y los privilegios de la 0008.
CREATE OR REPLACE FUNCTION recalcular_totales_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_subtotal_bruto          numeric(12,2) := 0;
  v_modificadores           numeric(12,2) := 0;
  v_descuentos_manuales     numeric(12,2) := 0;
  v_promociones             numeric(12,2) := 0;
  v_iva                     numeric(12,2) := 0;
  v_subtotal_final          numeric(12,2) := 0;
  v_total                   numeric(12,2) := 0;
  v_monto_pagado            numeric(12,2) := 0;
  v_cambio                  numeric(12,2) := 0;
  v_item                    record;
  v_item_bruto              numeric(12,2);
  v_item_modif              numeric(12,2);
  v_item_desc               numeric(12,2);
  v_item_promo              numeric(12,2);
  v_item_neto               numeric(12,2);
  v_item_iva                numeric(12,2);
  v_item_total              numeric(12,2);
  v_piso                    numeric(12,2) := 0;  -- 0116: renglones de cargo vivos (el envío)
  v_lealtad                 numeric(12,2) := 0;  -- 0156: canjes de lealtad vivos
  v_item_lea                numeric(12,2);
BEGIN
  -- Iterar items no cancelados y calcular su subtotal e IVA
  FOR v_item IN
    SELECT
      ti.id,
      ti.cantidad,
      ti.precio_unitario_snapshot,
      ti.tasa_iva_snapshot,
      ti.iva_incluido_en_precio_snapshot,
      COALESCE(SUM(tim.monto_total_mxn), 0) AS monto_modif
    FROM ticket_items ti
    LEFT JOIN ticket_item_modificadores tim ON tim.ticket_item_id = ti.id
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
    GROUP BY ti.id, ti.cantidad, ti.precio_unitario_snapshot,
             ti.tasa_iva_snapshot, ti.iva_incluido_en_precio_snapshot
  LOOP
    -- Bruto del ítem: precio * cantidad + modificadores
    v_item_bruto := (v_item.cantidad * v_item.precio_unitario_snapshot);
    v_item_modif := v_item.monto_modif;

    -- Descuentos manuales aplicables a este item (los del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_desc
    FROM ticket_descuentos_manuales
    WHERE ticket_item_id = v_item.id
      AND reversado = false;

    -- Promociones aplicables a este item (las del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_promo
    FROM ticket_promociones_aplicadas
    WHERE ticket_id = p_ticket_id
      AND cancelada_por_cajero = false
      AND v_item.id = ANY(items_afectados);

    -- 0156: premio de producto canjeado sobre este renglón. Acotado a lo que queda del renglón.
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_lea
    FROM ticket_canjes_lealtad
    WHERE ticket_item_id = v_item.id
      AND revertido = false;
    v_item_lea := LEAST(v_item_lea, GREATEST((v_item_bruto + v_item_modif) - v_item_desc - v_item_promo, 0));

    -- Neto del ítem (después de descuentos a nivel item, no a nivel ticket)
    v_item_neto := (v_item_bruto + v_item_modif) - v_item_desc - v_item_promo - v_item_lea;
    IF v_item_neto < 0 THEN v_item_neto := 0; END IF;

    -- IVA del ítem según política iva_incluido
    IF v_item.iva_incluido_en_precio_snapshot THEN
      -- El precio ya trae IVA: subtotal_sin_iva = neto / (1 + tasa/100), iva = neto - subtotal
      v_item_iva := ROUND(v_item_neto - (v_item_neto / (1 + v_item.tasa_iva_snapshot/100)), 2);
      v_item_total := v_item_neto;
    ELSE
      -- IVA por afuera: subtotal_sin_iva = neto, iva = neto * tasa/100, total = neto + iva
      v_item_iva := ROUND(v_item_neto * v_item.tasa_iva_snapshot/100, 2);
      v_item_total := v_item_neto + v_item_iva;
    END IF;

    -- Persistir el cálculo en ticket_items
    UPDATE ticket_items
    SET subtotal_bruto_mxn      = v_item_bruto,
        monto_modificadores_mxn = v_item_modif,
        descuento_item_mxn      = v_item_desc,
        -- 0156: el premio de lealtad va aquí porque es la columna por renglón de un descuento
        -- automático, y una columna nueva NOT NULL rompería el push de las cajas sin actualizar.
        -- Por eso la suma de esta columna ya no cuadra con tickets.promociones_mxn: la parte de
        -- lealtad se reporta a nivel de ticket en lealtad_mxn.
        promocion_item_mxn      = v_item_promo + v_item_lea,
        iva_item_mxn            = v_item_iva,
        total_item_mxn          = v_item_total
    WHERE id = v_item.id;

    -- Acumular al ticket
    v_subtotal_bruto      := v_subtotal_bruto + v_item_bruto;
    v_modificadores       := v_modificadores  + v_item_modif;
    v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
    v_promociones         := v_promociones    + v_item_promo;
    v_iva                 := v_iva            + v_item_iva;
    v_total               := v_total          + v_item_total;
    v_lealtad             := v_lealtad        + v_item_lea;
  END LOOP;

  -- 0116: el piso del total. Los descuentos de ticket no pueden comerse los renglones de cargo
  -- (el envío no admite descuentos, spec zonas de envío §3, ADR 0017). Se lee DESPUÉS del bucle,
  -- que acaba de persistir total_item_mxn. Acotado a v_total por defensa: el piso nunca puede
  -- subir el total por encima de la suma de sus renglones (eso descuadraría el CFDI).
  SELECT COALESCE(SUM(total_item_mxn), 0)
  INTO v_piso
  FROM ticket_items
  WHERE ticket_id = p_ticket_id
    AND cancelado = false
    AND cargo_tipo IS NOT NULL;
  v_piso := LEAST(v_piso, GREATEST(v_total, 0));

  -- Descuentos manuales a nivel ticket (sin ticket_item_id) — se restan del total
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_desc
  FROM ticket_descuentos_manuales
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND reversado = false;
  v_total := v_total - v_item_desc;
  -- 0116: el excedente no se come el cargo; se reporta solo lo que se aplicó.
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_desc := v_item_desc - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Promociones a nivel ticket (items_afectados vacío y alcance TICKET_COMPLETO)
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_promo
  FROM ticket_promociones_aplicadas
  WHERE ticket_id = p_ticket_id
    AND cancelada_por_cajero = false
    AND promocion_alcance_snapshot = 'TICKET_COMPLETO';
  v_total := v_total - v_item_promo;
  -- 0116: ídem para las promociones.
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_promo := v_item_promo - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  v_promociones := v_promociones + v_item_promo;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- 0156: canje de lealtad a nivel ticket (puntos por dinero). Mismo piso que descuentos y
  -- promociones, y se reporta solo lo que de verdad se aplicó.
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_lea
  FROM ticket_canjes_lealtad
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND revertido = false;
  v_total := v_total - v_item_lea;
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_lea := v_item_lea - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  IF v_total < 0 THEN
    v_item_lea := v_item_lea + v_total;
    v_total := 0;
  END IF;
  v_lealtad := v_lealtad + GREATEST(v_item_lea, 0);

  -- Subtotal final (sin IVA) — útil para reportes
  v_subtotal_final := v_total - v_iva;
  IF v_subtotal_final < 0 THEN v_subtotal_final := 0; END IF;

  -- Pagos
  SELECT
    COALESCE(SUM(monto_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0),
    COALESCE(SUM(cambio_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0)
  INTO v_monto_pagado, v_cambio
  FROM pagos
  WHERE ticket_id = p_ticket_id
    AND deleted_at IS NULL;

  -- Persistir totales en el ticket
  UPDATE tickets
  SET subtotal_mxn            = v_subtotal_final,
      descuentos_manuales_mxn = v_descuentos_manuales,
      promociones_mxn         = v_promociones,
      lealtad_mxn             = v_lealtad,
      iva_mxn                 = v_iva,
      total_mxn               = v_total,
      monto_pagado_mxn        = v_monto_pagado,
      cambio_mxn              = v_cambio,
      updated_at              = now()
  WHERE id = p_ticket_id;
END;
$$;

-- Cuando cambia un canje (se aplica, se revierte o se borra) los totales se recalculan, pero SOLO
-- si el ticket sigue abierto. Un ticket cerrado conserva los totales con los que se vendió: si al
-- cancelar o devolver una cuenta cobrada se revierte su canje, recalcular subiría total_mxn de un
-- ticket que ya se cobró. La reversa la registra el libro de movimientos de lealtad, no el ticket.
CREATE OR REPLACE FUNCTION trg_ticket_canje_lealtad_recalcular()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket_id uuid := COALESCE(NEW.ticket_id, OLD.ticket_id);
  v_estado    ticket_estado_fiscal;
BEGIN
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = v_ticket_id;
  IF v_estado IN ('BORRADOR', 'ABIERTO') THEN
    PERFORM recalcular_totales_ticket(v_ticket_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ticket_canjes_lealtad_recalcular ON ticket_canjes_lealtad;
CREATE TRIGGER trg_ticket_canjes_lealtad_recalcular
  AFTER INSERT OR DELETE OR UPDATE OF revertido, monto_descontado_mxn, ticket_item_id ON ticket_canjes_lealtad
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_canje_lealtad_recalcular();

-- El borrador del CFDI deduce su descuento de los totales del ticket: el canje cuenta como descuento.
-- Misma firma y mismos REVOKE/GRANT que la 0135 (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION cfdi_crear_borrador(
  p_ticket_id              uuid,
  p_tipo_comprobante       cfdi_tipo_comprobante,
  p_receptor_rfc           varchar,
  p_receptor_razon_social  varchar,
  p_receptor_uso_cfdi      varchar,
  p_receptor_codigo_postal varchar,
  p_receptor_regimen_fiscal varchar,
  p_receptor_email         varchar,
  p_emisor_rfc             varchar,
  p_emisor_razon_social    varchar,
  p_emisor_regimen_fiscal  varchar,
  p_emisor_lugar_expedicion varchar,
  p_metodo_pago_sat        varchar,
  p_forma_pago_sat         varchar,
  p_pac_proveedor          cfdi_proveedor_pac,
  p_devolucion_id          uuid DEFAULT NULL,
  p_cfdi_sustituye_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_ticket    tickets%ROWTYPE;
  v_cfdi_id   uuid;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sin tenant en la sesión' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF p_tipo_comprobante = 'INGRESO' AND v_ticket.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'Solo tickets PAGADOS se pueden facturar (estado actual: %)', v_ticket.estado_fiscal;
  END IF;

  IF p_tipo_comprobante = 'EGRESO' AND p_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'Nota de crédito requiere devolucion_id';
  END IF;
  IF p_devolucion_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM devoluciones WHERE id = p_devolucion_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;
  IF p_cfdi_sustituye_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM tickets_cfdi WHERE id = p_cfdi_sustituye_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'CFDI % no existe', p_cfdi_sustituye_id;
  END IF;

  INSERT INTO tickets_cfdi (
    tenant_id, ticket_id, tipo_comprobante,
    receptor_rfc, receptor_razon_social, receptor_uso_cfdi,
    receptor_codigo_postal, receptor_regimen_fiscal, receptor_email,
    emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion,
    subtotal_mxn, descuento_mxn, iva_mxn, total_mxn,
    metodo_pago_sat, forma_pago_sat,
    estado_sat, pac_proveedor,
    cfdi_sustituye_id, devolucion_id,
    created_by, updated_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_tipo_comprobante,
    p_receptor_rfc, p_receptor_razon_social, p_receptor_uso_cfdi,
    p_receptor_codigo_postal, p_receptor_regimen_fiscal, p_receptor_email,
    p_emisor_rfc, p_emisor_razon_social, p_emisor_regimen_fiscal, p_emisor_lugar_expedicion,
    v_ticket.subtotal_mxn,
    -- 0156: el canje de lealtad es descuento, no forma de pago.
    v_ticket.descuentos_manuales_mxn + v_ticket.promociones_mxn + v_ticket.lealtad_mxn,
    v_ticket.iva_mxn,
    v_ticket.total_mxn,
    p_metodo_pago_sat, p_forma_pago_sat,
    'BORRADOR', p_pac_proveedor,
    p_cfdi_sustituye_id, p_devolucion_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_cfdi_id;

  RETURN v_cfdi_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION cfdi_crear_borrador(uuid, cfdi_tipo_comprobante, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, cfdi_proveedor_pac, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION cfdi_crear_borrador(uuid, cfdi_tipo_comprobante, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, cfdi_proveedor_pac, uuid, uuid) TO authenticated, service_role;

-- ── §6 Canje, saldo y asentado ──────────────────────────────────────────────

-- El cliente canónico: por id; si ese id es un alias, su cliente real; si no, por teléfono.
-- El teléfono es la identidad (spec §8.4): una caja puede conocer al cliente con otro id.
CREATE OR REPLACE FUNCTION lealtad_resolver_cliente(p_tenant uuid, p_cliente_id uuid, p_telefono text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT c.id FROM clientes c WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant AND c.deleted_at IS NULL),
    (SELECT a.cliente_id FROM clientes_alias a WHERE a.alias_id = p_cliente_id AND a.tenant_id = p_tenant),
    (SELECT c.id FROM clientes c
      WHERE c.tenant_id = p_tenant AND c.deleted_at IS NULL
        AND c.telefono = NULLIF(regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'), '')
      LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION lealtad_saldo(p_tenant uuid, p_cliente_id uuid, p_telefono text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cli uuid := lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono);
  v_p   lealtad_programa%ROWTYPE;
  v_s   lealtad_saldos%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PROGRAMA'); END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CLIENTE_NO_EXISTE'); END IF;
  SELECT * INTO v_s FROM lealtad_saldos WHERE cliente_id = v_cli;
  RETURN jsonb_build_object(
    'ok', true, 'cliente_id', v_cli,
    -- Un saldo de otra versión del programa ya no vale.
    'saldo', CASE WHEN v_s.programa_version = v_p.version THEN COALESCE(v_s.saldo, 0) ELSE 0 END,
    'vence_el', v_s.vence_el, 'mecanica', v_p.mecanica, 'programa_version', v_p.version);
END $$;

-- LA AUTORIDAD DEL CANJE. Solo tiene sentido en la nube. Bloquea la fila del saldo, valida y
-- escribe el movimiento en una transacción. Reintentar con el mismo p_canje_id devuelve lo mismo.
CREATE OR REPLACE FUNCTION lealtad_canjear(
  p_canje_id uuid, p_tenant uuid, p_cliente_id uuid, p_telefono text,
  p_puntos integer, p_premio_id uuid, p_ticket_id uuid,
  p_sucursal_id uuid, p_caja_id uuid, p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_p       lealtad_programa%ROWTYPE;
  v_cli     uuid;
  v_m       lealtad_movimientos%ROWTYPE;
  v_premio  lealtad_premios%ROWTYPE;
  v_puntos  integer;
  v_monto   numeric(12,2);
  v_saldo   integer;
BEGIN
  IF p_canje_id IS NULL THEN RAISE EXCEPTION 'el canje necesita id' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF FOUND THEN
    RETURN lealtad_canje_datos(p_canje_id, p_tenant) || jsonb_build_object('repetido', true);
  END IF;

  IF NOT COALESCE((SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = p_tenant), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODULO_APAGADO');
  END IF;
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PROGRAMA'); END IF;

  v_cli := lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono);
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CLIENTE_NO_EXISTE'); END IF;

  IF v_p.mecanica = 'PUNTOS_DINERO' THEN
    IF p_premio_id IS NOT NULL OR COALESCE(p_puntos, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PUNTOS_INVALIDOS');
    END IF;
    v_puntos := p_puntos;
    v_monto  := p_puntos;                      -- 1 punto = $1
  ELSE
    SELECT * INTO v_premio FROM lealtad_premios
     WHERE id = p_premio_id AND tenant_id = p_tenant AND activo AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'PREMIO_INVALIDO'); END IF;
    v_puntos := v_premio.costo;
    v_monto  := NULL;                          -- lo fija el renglón al asentar
  END IF;

  -- La fila del saldo, bloqueada: dos canjes simultáneos del mismo cliente van en fila.
  INSERT INTO lealtad_saldos (cliente_id, tenant_id, saldo, programa_version)
  VALUES (v_cli, p_tenant, 0, v_p.version) ON CONFLICT (cliente_id) DO NOTHING;
  SELECT CASE WHEN programa_version = v_p.version THEN saldo ELSE 0 END INTO v_saldo
    FROM lealtad_saldos WHERE cliente_id = v_cli FOR UPDATE;

  -- Un reintento con el mismo id que llegó mientras el original seguía en curso esperó aquí el
  -- bloqueo: ya con el saldo descontado, no debe contestar SALDO_INSUFICIENTE sino lo mismo que el
  -- original. Por eso la búsqueda del principio se repite ya con la fila bloqueada.
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF FOUND THEN
    RETURN lealtad_canje_datos(p_canje_id, p_tenant) || jsonb_build_object('repetido', true);
  END IF;

  IF v_saldo < v_puntos THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SALDO_INSUFICIENTE', 'saldo', v_saldo);
  END IF;

  PERFORM lealtad_registrar_movimiento(
    p_canje_id, p_tenant, v_cli, 'CANJE', -v_puntos, v_p.version,
    p_ticket_id, p_sucursal_id, p_caja_id, p_usuario_id, v_premio.id, v_monto);

  RETURN lealtad_canje_datos(p_canje_id, p_tenant) || jsonb_build_object('repetido', false);
END $$;

-- Los datos de un canje ya autorizado. Es lo que el puente de la caja consulta antes de asentar:
-- la caja asienta con lo que diga la nube, nunca con lo que mande el navegador.
CREATE OR REPLACE FUNCTION lealtad_canje_datos(p_canje_id uuid, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_m lealtad_movimientos%ROWTYPE;
  v_s lealtad_saldos%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CANJE_NO_EXISTE'); END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE canje_movimiento_id = p_canje_id AND tipo = 'REVERSA_CANJE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANJE_REVERTIDO');
  END IF;
  SELECT * INTO v_s FROM lealtad_saldos WHERE cliente_id = v_m.cliente_id;
  RETURN jsonb_build_object(
    'ok', true, 'canje_id', v_m.id, 'cliente_id', v_m.cliente_id, 'puntos', -v_m.puntos,
    'monto_mxn', v_m.monto_mxn, 'premio_id', v_m.premio_id,
    'producto_id', (SELECT producto_id FROM lealtad_premios WHERE id = v_m.premio_id),
    'telefono', (SELECT telefono FROM clientes WHERE id = v_m.cliente_id),
    'saldo', COALESCE(v_s.saldo, 0), 'vence_el', v_s.vence_el, 'programa_version', v_m.programa_version);
END $$;

-- Pega un canje YA AUTORIZADO a un ticket, en la base donde vive el ticket (la caja o la nube).
-- En la caja además escribe la copia local del movimiento (mismo id) para que el saldo local baje;
-- en la nube ese id ya existe y el registro es un no-op.
-- Es la ÚLTIMA barrera: el id del renglón (ticket_item_id) es lo único que no sale de la nube, así
-- que aquí se valida todo lo que ata el canje a lo que de verdad se está descontando. Rechaza con:
--   PUNTOS_INVALIDOS      los puntos no son un entero positivo
--   CANJE_REVERTIDO       ese canje ya tiene su reversa: ya no se puede asentar
--   CANJE_NO_COINCIDE     ya hay un movimiento con ese id y no es un CANJE de este negocio, por esos
--                         puntos y de ese cliente
--   CANJE_YA_ASENTADO     ese canje ya está pegado a OTRA cuenta (a la misma es idempotente)
--   TICKET_YA_TIENE_CANJE la cuenta ya lleva otro canje vivo (solo cabe uno)
--   TICKET_SIN_CLIENTE    el cliente del canje no existe aquí y la cuenta no tiene cliente
--   CLIENTE_NO_COINCIDE   el cliente del canje no existe aquí y el de la cuenta no es la misma persona
--                         (otro teléfono, o falta alguno de los dos)
--   PREMIO_INVALIDO       el premio no existe en este negocio
--   RENGLON_NO_EXISTE     el renglón no es de esta cuenta
--   RENGLON_NO_ES_PREMIO  un premio solo se pega a UN renglón de producto vivo (no de cargo, ni cancelado,
--                         ni parte de un combo) de ese mismo producto y de cantidad 1
--   RENGLON_NO_APLICA     un canje de dinero no lleva renglón
--   MONTO_INVALIDO        el descuento de un premio es lo que vale el renglón (y debe ser > 0); el de
--                         dinero es 1 punto = $1, exacto
-- En un premio el descuento sale del renglón, nunca del payload.
-- El cliente del canje es el que autorizó la nube: si el movimiento ya existe aquí (la nube), es el de
-- ese movimiento y el payload no puede decir otro. Si no existe (la caja), es el del payload si lo
-- conoce esta base; si no, la caja puede tenerlo con otro id (un duplicado por teléfono que su
-- siguiente pull y la fusión de la nube resolverán), y SOLO en ese caso se usa el de la cuenta: cuando
-- su teléfono, reducido a dígitos, es el mismo que manda la nube. Cualquier otra cosa sería mover
-- puntos de una persona a otra.
CREATE OR REPLACE FUNCTION lealtad_asentar_canje(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_canje  uuid := (p->>'canje_id')::uuid;
  v_tenant uuid := (p->>'tenant_id')::uuid;
  v_ticket uuid := (p->>'ticket_id')::uuid;
  v_item   uuid := NULLIF(p->>'ticket_item_id', '')::uuid;
  v_premio uuid := NULLIF(p->>'premio_id', '')::uuid;
  v_puntos integer := (p->>'puntos')::integer;
  v_monto  numeric(12,2) := NULLIF(p->>'monto_mxn', '')::numeric;
  v_cli    uuid := NULLIF(p->>'cliente_id', '')::uuid;
  v_tel    text := NULLIF(regexp_replace(COALESCE(p->>'telefono', ''), '\D', '', 'g'), '');
  v_tel_t  text;
  v_filas  integer;
  v_t      tickets%ROWTYPE;
  v_m      lealtad_movimientos%ROWTYPE;
  v_c      ticket_canjes_lealtad%ROWTYPE;
  v_pr     lealtad_premios%ROWTYPE;
  v_it     ticket_items%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = v_ticket AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;
  IF v_t.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN RAISE EXCEPTION 'TICKET_NO_ABIERTO' USING ERRCODE = '22023'; END IF;
  IF v_canje IS NULL OR v_puntos IS NULL OR v_puntos <= 0 THEN RAISE EXCEPTION 'PUNTOS_INVALIDOS' USING ERRCODE = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE canje_movimiento_id = v_canje AND tipo = 'REVERSA_CANJE') THEN
    RAISE EXCEPTION 'CANJE_REVERTIDO' USING ERRCODE = '22023';
  END IF;
  -- En la nube el movimiento ya existe (la autorización lo escribió) y tiene que ser este canje; en la
  -- caja todavía no existe, y eso es lo normal.
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = v_canje;
  IF FOUND AND (v_m.tenant_id <> v_tenant OR v_m.tipo <> 'CANJE' OR v_m.puntos <> -v_puntos) THEN
    RAISE EXCEPTION 'CANJE_NO_COINCIDE' USING ERRCODE = '22023';
  END IF;
  IF FOUND THEN
    -- La nube: el cliente es el del movimiento. La cuenta no se consulta.
    IF v_cli IS NOT NULL AND v_cli <> v_m.cliente_id THEN RAISE EXCEPTION 'CANJE_NO_COINCIDE' USING ERRCODE = '22023'; END IF;
    v_cli := v_m.cliente_id;
  END IF;
  -- Asentar dos veces el mismo canje en la misma cuenta es un reintento; en otra, no.
  SELECT * INTO v_c FROM ticket_canjes_lealtad WHERE id = v_canje;
  IF FOUND THEN
    IF v_c.ticket_id <> v_ticket THEN RAISE EXCEPTION 'CANJE_YA_ASENTADO' USING ERRCODE = '22023'; END IF;
    RETURN v_canje;
  END IF;
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE ticket_id = v_ticket AND NOT revertido) THEN
    RAISE EXCEPTION 'TICKET_YA_TIENE_CANJE' USING ERRCODE = '22023';
  END IF;

  -- El cliente (ver la cabecera). Con el movimiento ya aquí, v_cli es el del movimiento.
  IF v_m.id IS NULL AND (v_cli IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND tenant_id = v_tenant)) THEN
    IF v_t.cliente_id IS NULL THEN RAISE EXCEPTION 'TICKET_SIN_CLIENTE' USING ERRCODE = '22023'; END IF;
    SELECT NULLIF(regexp_replace(COALESCE(telefono, ''), '\D', '', 'g'), '') INTO v_tel_t
      FROM clientes WHERE id = v_t.cliente_id;
    IF v_tel IS NULL OR v_tel_t IS NULL OR v_tel <> v_tel_t THEN RAISE EXCEPTION 'CLIENTE_NO_COINCIDE' USING ERRCODE = '22023'; END IF;
    v_cli := v_t.cliente_id;
  END IF;

  IF v_premio IS NOT NULL THEN
    SELECT * INTO v_pr FROM lealtad_premios WHERE id = v_premio AND tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'PREMIO_INVALIDO' USING ERRCODE = '22023'; END IF;
    IF v_item IS NULL THEN RAISE EXCEPTION 'PREMIO_SIN_RENGLON' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_it FROM ticket_items WHERE id = v_item AND ticket_id = v_ticket;
    IF NOT FOUND THEN RAISE EXCEPTION 'RENGLON_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;
    IF v_it.producto_id IS DISTINCT FROM v_pr.producto_id OR v_it.cantidad <> 1 OR v_it.cancelado
       OR v_it.cargo_tipo IS NOT NULL OR v_it.combo_rol IS NOT NULL OR v_it.parent_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'RENGLON_NO_ES_PREMIO' USING ERRCODE = '22023';
    END IF;
    v_monto := GREATEST(v_it.subtotal_bruto_mxn + v_it.monto_modificadores_mxn - v_it.descuento_item_mxn - v_it.promocion_item_mxn, 0);
    IF v_monto <= 0 THEN RAISE EXCEPTION 'MONTO_INVALIDO' USING ERRCODE = '22023'; END IF;
  ELSE
    IF v_item IS NOT NULL THEN RAISE EXCEPTION 'RENGLON_NO_APLICA' USING ERRCODE = '22023'; END IF;
    IF v_monto IS DISTINCT FROM v_puntos::numeric THEN RAISE EXCEPTION 'MONTO_INVALIDO' USING ERRCODE = '22023'; END IF;   -- 1 punto = $1
  END IF;

  PERFORM lealtad_registrar_movimiento(
    v_canje, v_tenant, v_cli, 'CANJE', -v_puntos, (p->>'programa_version')::integer,
    v_ticket, COALESCE(NULLIF(p->>'sucursal_id', '')::uuid, v_t.sucursal_id),
    COALESCE(NULLIF(p->>'caja_id', '')::uuid, v_t.caja_id),
    NULLIF(p->>'usuario_id', '')::uuid, v_premio, v_monto);

  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, premio_id, ticket_item_id, puntos, monto_descontado_mxn, created_by)
  VALUES (v_canje, v_tenant, v_ticket, v_cli, v_premio, v_item, v_puntos, v_monto, NULLIF(p->>'usuario_id', '')::uuid)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN
    -- Otra transacción asentó este mismo canje mientras esta corría: si fue en otra cuenta, esta perdió.
    IF (SELECT ticket_id FROM ticket_canjes_lealtad WHERE id = v_canje) <> v_ticket THEN
      RAISE EXCEPTION 'CANJE_YA_ASENTADO' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_canje;
END $$;

-- Deshace el canje vivo de un ticket, en la base donde vive el ticket. Solo devuelve saldo, así
-- que es seguro sin internet: en la caja la reversa sube en el siguiente push.
CREATE OR REPLACE FUNCTION lealtad_revertir_canje_ticket(p_ticket_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c     ticket_canjes_lealtad%ROWTYPE;
  v_ver integer;
  v_n   integer := 0;
BEGIN
  FOR c IN SELECT * FROM ticket_canjes_lealtad WHERE ticket_id = p_ticket_id AND NOT revertido FOR UPDATE LOOP
    UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = c.id;
    SELECT COALESCE((SELECT programa_version FROM lealtad_movimientos WHERE id = c.id),
                    (SELECT version FROM lealtad_programa WHERE tenant_id = c.tenant_id)) INTO v_ver;
    PERFORM lealtad_registrar_movimiento(
      NULL, c.tenant_id, c.cliente_id, 'REVERSA_CANJE', c.puntos, v_ver,
      p_ticket_id, p_motivo => p_motivo, p_canje_mov => c.id, p_usuario => auth.uid());
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- Deshace un canje por su id, sin necesitar el ticket. Es la que usa la red de seguridad de la
-- nube (§7). true si lo revirtió; false si ya estaba revertido o no existe.
CREATE OR REPLACE FUNCTION lealtad_revertir_canje(p_canje_id uuid, p_tenant uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_m lealtad_movimientos%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF NOT FOUND THEN RETURN false; END IF;
  v_ok := lealtad_registrar_movimiento(
    NULL, p_tenant, v_m.cliente_id, 'REVERSA_CANJE', -v_m.puntos, v_m.programa_version,
    v_m.ticket_id, p_motivo => p_motivo, p_canje_mov => p_canje_id);
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = p_canje_id AND NOT revertido;
  RETURN v_ok;
END $$;

-- Lo único que el POS llama directo: quitar el canje de una cuenta que sigue abierta.
CREATE OR REPLACE FUNCTION quitar_canje_lealtad(p_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets
                  WHERE id = p_ticket_id AND tenant_id = current_tenant_id()
                    AND estado_fiscal IN ('BORRADOR', 'ABIERTO')) THEN
    RAISE EXCEPTION 'Esta cuenta ya se cobró o no existe.' USING ERRCODE = '22023';
  END IF;
  RETURN lealtad_revertir_canje_ticket(p_ticket_id, 'Canje quitado en caja');
END $$;

-- El renglón que lleva un premio de producto se cancela o se borra: los puntos vuelven. Sin esto el
-- total deja de contar el premio (§5) pero nadie devuelve los puntos, y al borrar el renglón el
-- canje desaparece por ON DELETE CASCADE sin dejar reversa en el libro. Mismo criterio que
-- trg_ticket_lealtad: una venta no se cae por la lealtad; el aviso queda en el log.
-- Solo en una cuenta abierta (BORRADOR o ABIERTO). En una ya cobrada o facturada el renglón premiado
-- puede cancelarse o borrarse y los puntos NO vuelven: el cliente ya recibió el producto, y devolverlos
-- sería dinero gratis. Es la misma regla de §5: un ticket cerrado conserva lo que se vendió.
-- Son DOS triggers porque los dos casos corren en momentos distintos:
--   · Cancelar es AFTER UPDATE. Revertir recalcula la cuenta, y recalcular_totales_ticket actualiza
--     cada renglón vivo; en un BEFORE tocaría la fila que se está actualizando y Postgres lanzaría
--     "tuple to be updated was already modified by an operation triggered by the current command".
--   · Borrar es BEFORE DELETE porque después la cascada ya se llevó el canje y no habría a quién
--     devolverle los puntos. Aquí SOLO se escribe la reversa en el libro: el canje se va por la
--     cascada, que recalcula una cuenta abierta con su propio trigger, y tocar desde aquí el renglón
--     que se borra lanzaría el mismo error.
CREATE OR REPLACE FUNCTION trg_item_premio_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c        ticket_canjes_lealtad%ROWTYPE;
  v_ver    integer;
  v_estado ticket_estado_fiscal;
BEGIN
  BEGIN
    SELECT estado_fiscal INTO v_estado FROM tickets
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.ticket_id ELSE NEW.ticket_id END;
    -- Sin cuenta (se está borrando entera por cascada) tampoco hay a quién devolver nada.
    IF v_estado IS NULL OR v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.cancelado AND NOT OLD.cancelado
         AND EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE ticket_item_id = NEW.id AND NOT revertido) THEN
        PERFORM lealtad_revertir_canje_ticket(NEW.ticket_id, 'Renglón premiado cancelado');
      END IF;
    ELSE
      FOR c IN SELECT * FROM ticket_canjes_lealtad WHERE ticket_item_id = OLD.id AND NOT revertido LOOP
        -- La versión del programa con la que se descontó, igual que lealtad_revertir_canje_ticket.
        SELECT COALESCE((SELECT programa_version FROM lealtad_movimientos WHERE id = c.id),
                        (SELECT version FROM lealtad_programa WHERE tenant_id = c.tenant_id)) INTO v_ver;
        PERFORM lealtad_registrar_movimiento(
          NULL, c.tenant_id, c.cliente_id, 'REVERSA_CANJE', c.puntos, v_ver,
          c.ticket_id, p_motivo => 'Renglón premiado eliminado', p_canje_mov => c.id, p_usuario => auth.uid());
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo devolver el premio del renglón %: %',
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, SQLERRM;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_ticket_items_premio_lealtad_cancelado ON ticket_items;
CREATE TRIGGER trg_ticket_items_premio_lealtad_cancelado
  AFTER UPDATE OF cancelado ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_premio_lealtad();

DROP TRIGGER IF EXISTS trg_ticket_items_premio_lealtad_borrado ON ticket_items;
CREATE TRIGGER trg_ticket_items_premio_lealtad_borrado
  BEFORE DELETE ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_premio_lealtad();

REVOKE ALL ON FUNCTION lealtad_resolver_cliente(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_saldo(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_canjear(uuid, uuid, uuid, text, integer, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_canje_datos(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_asentar_canje(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_revertir_canje_ticket(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_revertir_canje(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quitar_canje_lealtad(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trg_item_premio_lealtad() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_resolver_cliente(uuid, uuid, text), lealtad_saldo(uuid, uuid, text),
  lealtad_canjear(uuid, uuid, uuid, text, integer, uuid, uuid, uuid, uuid, uuid), lealtad_canje_datos(uuid, uuid),
  lealtad_asentar_canje(jsonb), lealtad_revertir_canje_ticket(uuid, text), lealtad_revertir_canje(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION quitar_canje_lealtad(uuid) TO authenticated, service_role;
