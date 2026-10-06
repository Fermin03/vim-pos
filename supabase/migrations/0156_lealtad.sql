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
