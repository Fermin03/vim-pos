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
CREATE INDEX IF NOT EXISTS idx_clientes_alias_tenant ON clientes_alias (tenant_id);
-- La fusión por teléfono y la búsqueda de lealtad comparan por dígitos (el POS guarda el teléfono
-- solo con trim()): este índice sirve a ambas. No es único a propósito: datos anteriores pueden repetirse.
CREATE INDEX IF NOT EXISTS idx_clientes_telefono_digitos
  ON clientes (tenant_id, (regexp_replace(telefono, '\D', '', 'g')))
  WHERE telefono IS NOT NULL AND deleted_at IS NULL;
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
   WHERE ticket_id = p_ticket AND tipo IN ('GANADO', 'REVERSA_GANADO')
     -- Del negocio del ticket: un movimiento que otro negocio dejó apuntando a este id no cuenta.
     -- Si el ticket aún no existe aquí, como siempre.
     AND tenant_id = COALESCE((SELECT t.tenant_id FROM tickets t WHERE t.id = p_ticket), tenant_id);
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
   WHERE ticket_id = p_ticket_id AND tipo = 'GANADO'
     AND tenant_id = COALESCE((SELECT t.tenant_id FROM tickets t WHERE t.id = p_ticket_id), tenant_id)
   ORDER BY fecha DESC LIMIT 1;
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
        AND c.telefono IS NOT NULL
        AND regexp_replace(c.telefono, '\D', '', 'g') = NULLIF(regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'), '')
      ORDER BY c.created_at, c.id
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
    'saldo', COALESCE(v_s.saldo, 0), 'vence_el', v_s.vence_el, 'programa_version', v_m.programa_version,
    -- La cuenta y la caja que lo autorizaron: la Edge Function ata el asiento a ellas (un canje, un ticket, una caja).
    'ticket_id', v_m.ticket_id, 'caja_id', v_m.caja_id);
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

-- ── §7 Programa, ajuste manual, vencimiento y red de seguridad ──────────────

-- Alta o edición del programa. Cambiar de mecánica pone TODOS los saldos en cero (no son
-- convertibles) y por eso exige p_confirmar_reinicio; sin él, devuelve a cuántos clientes afecta.
-- Los parámetros se validan aquí con mensajes para el dueño (los CHECK de la tabla quedan de
-- red, pero un dueño no debe ver "violates check constraint"). Lo que no aplica a la mecánica
-- elegida se guarda como NULL, para que el programa no arrastre valores de una mecánica anterior.
CREATE OR REPLACE FUNCTION lealtad_guardar_programa(
  p_mecanica lealtad_mecanica, p_porcentaje numeric, p_pesos_por_punto numeric,
  p_compra_minima_mxn numeric, p_vencimiento_meses integer, p_tope_compras_dia integer,
  p_confirmar_reinicio boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_p      lealtad_programa%ROWTYPE;
  v_con    integer := 0;
  s        lealtad_saldos%ROWTYPE;
  v_pct    numeric;
  v_pesos  numeric;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede configurar la lealtad.' USING ERRCODE = '42501';
  END IF;

  IF p_mecanica IS NULL THEN
    RAISE EXCEPTION 'Elige cómo ganan tus clientes: puntos por dinero, sellos o puntos con premios.' USING ERRCODE = '22023';
  END IF;
  -- Se valida lo que de verdad se guardaría: la columna redondea a 2 decimales, así que 0.004
  -- sería 0.00 y llegaría como violación de CHECK.
  IF p_mecanica = 'PUNTOS_DINERO' AND (p_porcentaje IS NULL OR round(p_porcentaje, 2) <= 0 OR round(p_porcentaje, 2) > 50) THEN
    RAISE EXCEPTION 'El porcentaje de puntos debe ser mayor que 0 y de máximo 50.' USING ERRCODE = '22023';
  END IF;
  IF p_mecanica = 'PUNTOS_PREMIOS' AND (p_pesos_por_punto IS NULL OR round(p_pesos_por_punto, 2) <= 0 OR round(p_pesos_por_punto, 2) > 99999999.99) THEN
    RAISE EXCEPTION 'Indica cuántos pesos de compra valen un punto (mayor que 0 y menor de 100 millones).' USING ERRCODE = '22023';
  END IF;
  IF p_vencimiento_meses IS NOT NULL AND (p_vencimiento_meses < 1 OR p_vencimiento_meses > 60) THEN
    RAISE EXCEPTION 'El vencimiento debe ser de 1 a 60 meses, o sin vencimiento.' USING ERRCODE = '22023';
  END IF;
  IF p_tope_compras_dia IS NOT NULL AND (p_tope_compras_dia < 1 OR p_tope_compras_dia > 50) THEN
    RAISE EXCEPTION 'El tope de compras por día debe estar entre 1 y 50.' USING ERRCODE = '22023';
  END IF;
  IF p_compra_minima_mxn IS NOT NULL AND (round(p_compra_minima_mxn, 2) < 0 OR round(p_compra_minima_mxn, 2) > 9999999999.99) THEN
    RAISE EXCEPTION 'La compra mínima debe ser de 0 pesos en adelante y menor de 10 mil millones.' USING ERRCODE = '22023';
  END IF;
  v_pct   := CASE WHEN p_mecanica = 'PUNTOS_DINERO'  THEN p_porcentaje      END;
  v_pesos := CASE WHEN p_mecanica = 'PUNTOS_PREMIOS' THEN p_pesos_por_punto END;

  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, pesos_por_punto, compra_minima_mxn, vencimiento_meses, tope_compras_dia)
    VALUES (v_tenant, p_mecanica, v_pct, v_pesos, COALESCE(p_compra_minima_mxn, 0), p_vencimiento_meses, COALESCE(p_tope_compras_dia, 3))
    ON CONFLICT (tenant_id) DO NOTHING;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'version', 1, 'clientes_reiniciados', 0);
    END IF;
    -- Otro administrador la creó un instante antes: se sigue por la ruta normal de edición.
    SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_tenant FOR UPDATE;
  END IF;

  IF v_p.mecanica <> p_mecanica THEN
    SELECT count(*) INTO v_con FROM lealtad_saldos
     WHERE tenant_id = v_tenant AND saldo <> 0 AND programa_version = v_p.version;
    IF v_con > 0 AND NOT COALESCE(p_confirmar_reinicio, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REQUIERE_CONFIRMAR_REINICIO', 'clientes_con_saldo', v_con);
    END IF;
    -- Primero se anula cada saldo CON LA VERSIÓN VIEJA (para que el movimiento sume), después se
    -- sube la versión.
    FOR s IN SELECT * FROM lealtad_saldos
              WHERE tenant_id = v_tenant AND saldo <> 0 AND programa_version = v_p.version LOOP
      PERFORM lealtad_registrar_movimiento(
        NULL, v_tenant, s.cliente_id, 'AJUSTE', -s.saldo, v_p.version,
        p_motivo => 'Cambio de mecánica: ' || v_p.mecanica || ' → ' || p_mecanica, p_usuario => auth.uid());
    END LOOP;
    v_p.version := v_p.version + 1;
    UPDATE lealtad_saldos SET saldo = 0, programa_version = v_p.version, vence_el = NULL, updated_at = now()
     WHERE tenant_id = v_tenant;
  END IF;

  UPDATE lealtad_programa
     SET mecanica = p_mecanica, version = v_p.version, porcentaje = v_pct, pesos_por_punto = v_pesos,
         compra_minima_mxn = COALESCE(p_compra_minima_mxn, 0), vencimiento_meses = p_vencimiento_meses,
         tope_compras_dia = COALESCE(p_tope_compras_dia, 3)
   WHERE tenant_id = v_tenant;

  -- Cambiar los meses de vencimiento mueve la fecha de todos.
  UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(v_tenant, ultima_actividad), updated_at = now()
   WHERE tenant_id = v_tenant AND vence_el IS DISTINCT FROM lealtad_vence_el(v_tenant, ultima_actividad);

  RETURN jsonb_build_object('ok', true, 'version', v_p.version, 'clientes_reiniciados', v_con);
END $$;
REVOKE ALL ON FUNCTION lealtad_guardar_programa(lealtad_mecanica, numeric, numeric, numeric, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_guardar_programa(lealtad_mecanica, numeric, numeric, numeric, integer, integer, boolean) TO authenticated, service_role;

-- Ajuste manual del dueño o admin. Motivo obligatorio; queda en el libro con quien lo hizo.
-- Devuelve el saldo nuevo.
CREATE OR REPLACE FUNCTION lealtad_ajustar_saldo(p_cliente_id uuid, p_puntos integer, p_motivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_ver    integer;
  v_saldo  integer;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede ajustar un saldo.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_puntos, 0) = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero.' USING ERRCODE = '22023'; END IF;
  IF abs(p_puntos) > 100000 THEN RAISE EXCEPTION 'Un ajuste no puede pasar de 100,000 puntos.' USING ERRCODE = '22023'; END IF;
  IF btrim(COALESCE(p_motivo, '')) = '' THEN RAISE EXCEPTION 'El ajuste necesita un motivo.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'El cliente no existe.' USING ERRCODE = 'P0002';
  END IF;
  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = v_tenant;
  IF v_ver IS NULL THEN RAISE EXCEPTION 'Primero configura el programa.' USING ERRCODE = '22023'; END IF;

  -- Un ajuste a mano no deja el saldo en negativo (solo las reversas automáticas pueden, por
  -- diseño). Sin fila de saldo, el cliente tiene 0.
  SELECT saldo INTO v_saldo FROM lealtad_saldos
   WHERE cliente_id = p_cliente_id AND programa_version = v_ver FOR UPDATE;
  IF COALESCE(v_saldo, 0) + p_puntos < 0 THEN
    RAISE EXCEPTION 'El ajuste dejaría el saldo en negativo.' USING ERRCODE = '22023';
  END IF;

  PERFORM lealtad_registrar_movimiento(
    NULL, v_tenant, p_cliente_id, 'AJUSTE', p_puntos, v_ver,
    p_motivo => btrim(p_motivo), p_usuario => auth.uid());
  RETURN (SELECT saldo FROM lealtad_saldos WHERE cliente_id = p_cliente_id);
END $$;
REVOKE ALL ON FUNCTION lealtad_ajustar_saldo(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_ajustar_saldo(uuid, integer, text) TO authenticated, service_role;

-- El motivo con el que la red de seguridad deja escrita su reversa. Vive aquí, en un solo lugar:
-- el push (_vim_conciliar_canjes) reconoce por él una devolución de la red sin leer texto libre.
CREATE OR REPLACE FUNCTION lealtad_motivo_red_48h()
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT 'El canje no llegó a una cuenta pagada en 48 horas'::text $$;
REVOKE ALL ON FUNCTION lealtad_motivo_red_48h() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_motivo_red_48h() TO authenticated, service_role;

-- El proceso diario de la nube. Dos trabajos:
--   1) Vencer los saldos cuya fecha ya pasó, en hora de México. Solo en negocios con el módulo
--      encendido: mientras está apagado nada vence (spec §5, regla 9).
--   2) Red de seguridad del canje (spec §6): un canje de hace más de 48 h que no cuelga de un
--      ticket pagado se devuelve. Cubre la llamada que la caja nunca supo que se completó.
--      Un canje que SÍ cuelga de un ticket pagado o facturado nunca se toca: el cliente ya se
--      llevó el descuento.
-- p_ahora existe para poder probarlo sin depender del reloj.
CREATE OR REPLACE FUNCTION lealtad_proceso_diario(p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy   date := (p_ahora AT TIME ZONE 'America/Mexico_City')::date;
  s       record;
  m       record;
  v_saldo integer;
  v_vence date;
  v_ver   integer;
  v_venc  integer := 0;
  v_rev   integer := 0;
  v_err   integer := 0;
BEGIN
  -- Cada fila va en su propio bloque: una fila que falle se cuenta y se avisa en el log, pero no
  -- tumba el proceso de los demás negocios (ni se repite igual cada noche sin que nadie lo vea).
  FOR s IN
    SELECT sa.cliente_id, sa.tenant_id, sa.programa_version
      FROM lealtad_saldos sa
      JOIN lealtad_programa p ON p.tenant_id = sa.tenant_id AND p.version = sa.programa_version
      JOIN configuracion_tenant c ON c.tenant_id = sa.tenant_id AND c.modulo_lealtad_activo
     WHERE sa.saldo > 0 AND sa.vence_el IS NOT NULL AND sa.vence_el < v_hoy
  LOOP
    BEGIN
      -- Se vuelve a leer con bloqueo: desde la foto del ciclo pudo entrar una compra o un canje.
      -- Se vence el saldo de ahora, no el de la foto.
      SELECT saldo, vence_el, programa_version INTO v_saldo, v_vence, v_ver
        FROM lealtad_saldos WHERE cliente_id = s.cliente_id FOR UPDATE;
      IF NOT FOUND OR v_saldo <= 0 OR v_vence IS NULL OR v_vence >= v_hoy
         OR v_ver IS DISTINCT FROM s.programa_version THEN
        CONTINUE;
      END IF;
      PERFORM lealtad_registrar_movimiento(
        NULL, s.tenant_id, s.cliente_id, 'VENCIMIENTO', -v_saldo, v_ver,
        p_motivo => 'Venció por inactividad', p_fecha => p_ahora);
      v_venc := v_venc + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'lealtad_proceso_diario: no se pudo vencer el saldo del cliente % (negocio %): %',
        s.cliente_id, s.tenant_id, SQLERRM;
      v_err := v_err + 1;
    END;
  END LOOP;

  FOR m IN
    SELECT c.id, c.tenant_id
      FROM lealtad_movimientos c
     WHERE c.tipo = 'CANJE' AND c.fecha < p_ahora - interval '48 hours'
       AND NOT EXISTS (SELECT 1 FROM lealtad_movimientos r
                        WHERE r.canje_movimiento_id = c.id AND r.tipo = 'REVERSA_CANJE')
       AND NOT EXISTS (SELECT 1 FROM ticket_canjes_lealtad tc
                         JOIN tickets t ON t.id = tc.ticket_id
                        WHERE tc.id = c.id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO'))
  LOOP
    BEGIN
      IF lealtad_revertir_canje(m.id, m.tenant_id, lealtad_motivo_red_48h()) THEN
        v_rev := v_rev + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'lealtad_proceso_diario: no se pudo revertir el canje % (negocio %): %',
        m.id, m.tenant_id, SQLERRM;
      v_err := v_err + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('vencidos', v_venc, 'canjes_revertidos', v_rev, 'errores', v_err);
END $$;
REVOKE ALL ON FUNCTION lealtad_proceso_diario(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_proceso_diario(timestamptz) TO service_role;

-- Solo en la nube: el Postgres de la caja no tiene pg_cron y este bloque no hace nada ahí.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lealtad-diario') THEN
      PERFORM cron.unschedule('lealtad-diario');
    END IF;
    -- 09:20 UTC = 03:20 hora del centro de México: fuera de servicio y ya dentro del día nuevo.
    PERFORM cron.schedule('lealtad-diario', '20 9 * * *', 'SELECT public.lealtad_proceso_diario()');
  END IF;
END $$;

-- ── §8 Sincronización ───────────────────────────────────────────────────────

-- EL TELÉFONO ES LA IDENTIDAD Y LA NUBE DECIDE (spec §8.4).
--
-- Dos cajas pueden registrar el mismo teléfono antes de sincronizar. Hasta la 0156 el segundo
-- chocaba contra idx_clientes_telefono_unico, caía en _errores y se reintentaba en cada ciclo para
-- siempre, ocupando cupo del techo de 500; sus tickets entraban apuntando a un cliente que la nube
-- no tenía. Ahora: se anota como alias del existente, se quita del lote (no es un error: la caja lo
-- da por subido) y se redirige al cliente real todo lo que venga con el id viejo, en este push y en
-- los siguientes hasta que la caja haga pull.
--
-- El teléfono se compara por DÍGITOS, como en el resto de la lealtad: el POS lo guarda solo con
-- trim(), así que "477 000 9901" y "4770009901" son el mismo cliente. Si varios clientes vivos del
-- negocio comparten dígitos (datos anteriores a la 0156), gana el más antiguo.
--
-- Solo se anota alias cuando el id entrante NO lo conoce la nube. Si ya existe como cliente y su
-- fila editada ahora trae el teléfono de otro, no es un duplicado de otra caja sino una edición que
-- choca: la fila sigue al aplicador genérico y la restricción única la reporta en _errores, como
-- siempre. Anotar ahí un alias haría desaparecer a un cliente vivo.
--
-- Un alias no sobrevive a su cliente real: si este se borra, el alias se elimina y la fila viva de
-- la caja entra como un cliente normal (si no, sus puntos irían a un cliente borrado y ella nunca
-- podría subir el suyo).
--
-- Este paso corre ANTES de aplicar nada y lo que lance aborta el push entero, no una fila: por eso
-- no castea nada que venga de la caja (un id mal formado lo rechaza después el aplicador, aislado).
CREATE OR REPLACE FUNCTION _vim_fusionar_clientes(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uuid   CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_clave  text;
  v_filas  jsonb;
  v_nuevos jsonb := '[]'::jsonb;
  v_par    jsonb;
  v_rol    text;
  v_ali    uuid;
  v_real   uuid;
  v_errs   jsonb := '[]'::jsonb;
BEGIN
  -- _fusion_errores es una clave RESERVADA: solo la escribe esta función (al final) y
  -- sync_push_snapshot la saca del lote antes de aplicar nada. Una que venga de la caja se descarta.
  p_snapshot := p_snapshot - '_fusion_errores';

  -- Todo lo que sigue corre fuera del aislamiento por fila del aplicador, y una excepción aquí
  -- abortaría el push entero en cada ciclo (la caja dejaría de subir ventas). Por eso cada paso va
  -- en su propio bloque: si falla, avisa y el lote sigue; el rechazo se devuelve en _fusion_errores.
  BEGIN
    DELETE FROM clientes_alias a
     WHERE a.tenant_id = p_tenant
       AND NOT EXISTS (SELECT 1 FROM clientes c
                        WHERE c.id = a.cliente_id AND c.tenant_id = p_tenant AND c.deleted_at IS NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_vim_fusionar_clientes: no se pudieron limpiar los alias del negocio %: %', p_tenant, SQLERRM;
    v_errs := v_errs || jsonb_build_object('tabla', 'clientes_alias', 'id', NULL, 'error', SQLERRM);
  END;

  IF jsonb_typeof(p_snapshot->'clientes') = 'array' THEN
    BEGIN
      WITH ins AS (
        INSERT INTO clientes_alias (alias_id, cliente_id, tenant_id)
        SELECT DISTINCT ON (f.id) f.id, c.id, p_tenant
          FROM (SELECT CASE WHEN r->>'id' ~ v_uuid THEN (r->>'id')::uuid END AS id,
                       NULLIF(regexp_replace(COALESCE(r->>'telefono', ''), '\D', '', 'g'), '') AS digitos
                  FROM jsonb_array_elements(p_snapshot->'clientes') r
                 WHERE lower(r->>'tenant_id') = p_tenant::text
                   AND NULLIF(r->>'deleted_at', '') IS NULL) f
          JOIN clientes c
            ON c.tenant_id = p_tenant AND c.deleted_at IS NULL AND c.telefono IS NOT NULL
           AND regexp_replace(c.telefono, '\D', '', 'g') = f.digitos
           AND c.id <> f.id
         WHERE f.id IS NOT NULL AND f.digitos IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM clientes x WHERE x.id = f.id)
         ORDER BY f.id, c.created_at, c.id
        ON CONFLICT (alias_id) DO NOTHING
        RETURNING alias_id, cliente_id)
      SELECT COALESCE(jsonb_agg(jsonb_build_object('alias', alias_id, 'cliente', cliente_id)), '[]'::jsonb)
        INTO v_nuevos FROM ins;
    EXCEPTION WHEN OTHERS THEN
      v_nuevos := '[]'::jsonb;
      RAISE WARNING '_vim_fusionar_clientes: no se pudieron anotar los alias del negocio %: %', p_tenant, SQLERRM;
      v_errs := v_errs || jsonb_build_object('tabla', 'clientes_alias', 'id', NULL, 'error', SQLERRM);
    END;

    -- Lo que la nube YA tenía guardado con el id del alias (un push anterior lo subió antes de que
    -- el cliente existiera) pasa al cliente real, alias por alias y cada uno aislado: si no se puede
    -- mover (p. ej. un índice único), el alias ya anotado se queda, el lote se redirige igual y solo
    -- se salta este repunte. En modo réplica: es una corrección de identidad, no una operación; no
    -- debe disparar los triggers de la venta (el modo vuelve solo si el bloque falla: es un SET LOCAL
    -- dentro de la subtransacción).
    FOR v_par IN SELECT value FROM jsonb_array_elements(v_nuevos) LOOP
      BEGIN
        v_ali  := (v_par->>'alias')::uuid;
        v_real := (v_par->>'cliente')::uuid;
        v_rol  := current_setting('session_replication_role');
        PERFORM set_config('session_replication_role', 'replica', true);

        -- idx_direcciones_principal_unica: UNA principal viva (es_principal AND deleted_at IS NULL)
        -- por cliente. La del alias deja de serlo si el real ya tiene una; y si trae varias, solo
        -- la más antigua puede quedarse.
        UPDATE direcciones_cliente d SET es_principal = false
         WHERE d.tenant_id = p_tenant AND d.cliente_id = v_ali AND d.es_principal AND d.deleted_at IS NULL
           AND (EXISTS (SELECT 1 FROM direcciones_cliente x
                         WHERE x.cliente_id = v_real AND x.es_principal AND x.deleted_at IS NULL)
                OR d.id <> (SELECT y.id FROM direcciones_cliente y
                             WHERE y.tenant_id = p_tenant AND y.cliente_id = v_ali
                               AND y.es_principal AND y.deleted_at IS NULL
                             ORDER BY y.created_at, y.id LIMIT 1));
        UPDATE direcciones_cliente SET cliente_id = v_real WHERE tenant_id = p_tenant AND cliente_id = v_ali;
        -- Estas cuatro no tienen índice único por cliente_id.
        UPDATE tickets SET cliente_id = v_real WHERE tenant_id = p_tenant AND cliente_id = v_ali;
        UPDATE devoluciones SET cliente_id = v_real WHERE tenant_id = p_tenant AND cliente_id = v_ali;
        UPDATE ticket_promociones_aplicadas SET cliente_id = v_real WHERE tenant_id = p_tenant AND cliente_id = v_ali;
        UPDATE ticket_canjes_lealtad SET cliente_id = v_real WHERE tenant_id = p_tenant AND cliente_id = v_ali;

        PERFORM set_config('session_replication_role', v_rol, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '_vim_fusionar_clientes: no se pudo repuntar lo guardado bajo el alias % (negocio %): %',
          v_par->>'alias', p_tenant, SQLERRM;
        v_errs := v_errs || jsonb_build_object('tabla', 'clientes_alias', 'id', v_par->>'alias', 'error', SQLERRM);
      END;
    END LOOP;

    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_filas
      FROM jsonb_array_elements(p_snapshot->'clientes') r
     WHERE NOT EXISTS (SELECT 1 FROM clientes_alias a
                        WHERE a.tenant_id = p_tenant AND a.alias_id::text = lower(r->>'id'));
    p_snapshot := jsonb_set(p_snapshot, '{clientes}', v_filas);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE tenant_id = p_tenant) THEN
    IF jsonb_array_length(v_errs) > 0 THEN p_snapshot := jsonb_set(p_snapshot, '{_fusion_errores}', v_errs); END IF;
    RETURN p_snapshot;
  END IF;

  FOREACH v_clave IN ARRAY ARRAY['tickets', 'direcciones_cliente', 'devoluciones', 'lealtad_movimientos',
                                 'ticket_canjes_lealtad', 'ticket_promociones_aplicadas'] LOOP
    -- IS DISTINCT FROM: con la tabla ausente typeof es NULL y un <> la dejaría pasar, creando una
    -- clave vacía que taparía a otra (tickets sobre turnos al buscar caja y sucursal del envío).
    CONTINUE WHEN jsonb_typeof(p_snapshot->v_clave) IS DISTINCT FROM 'array';
    IF v_clave = 'direcciones_cliente' THEN
      -- Una dirección principal redirigida al cliente real chocaría con idx_direcciones_principal_unica
      -- (una principal viva por cliente) y el aplicador la rechazaría en cada ciclo. Si el real ya
      -- tiene una principal viva (otra fila), la redirigida entra como no principal; y de varias
      -- redirigidas al mismo cliente solo la primera puede quedarse. Solo comparaciones de texto.
      SELECT COALESCE(jsonb_agg(
               CASE WHEN q.real IS NULL THEN q.v
                    WHEN q.pri AND (q.rk > 1 OR EXISTS (SELECT 1 FROM direcciones_cliente x
                                                         WHERE x.cliente_id = q.real AND x.es_principal AND x.deleted_at IS NULL
                                                           AND x.id::text <> lower(q.v->>'id')))
                         THEN q.v || jsonb_build_object('cliente_id', q.real, 'es_principal', false)
                    ELSE q.v || jsonb_build_object('cliente_id', q.real) END
               ORDER BY q.n), '[]'::jsonb)
        INTO v_filas
        FROM (SELECT z.v, z.n, z.real, z.pri,
                     CASE WHEN z.pri THEN row_number() OVER (PARTITION BY z.real, z.pri ORDER BY z.n) END AS rk
                FROM (SELECT r.value AS v, r.ordinality AS n, a.cliente_id AS real,
                             (a.cliente_id IS NOT NULL
                              AND lower(COALESCE(r.value->>'es_principal', '')) IN ('true', 't', 'yes', 'y', 'on', '1')) AS pri
                        FROM jsonb_array_elements(p_snapshot->v_clave) WITH ORDINALITY r
                        LEFT JOIN clientes_alias a
                          ON a.tenant_id = p_tenant AND a.alias_id::text = lower(r.value->>'cliente_id')) z) q;
    ELSE
      SELECT COALESCE(jsonb_agg(
               CASE WHEN a.cliente_id IS NOT NULL
                    THEN r || jsonb_build_object('cliente_id', a.cliente_id)
                    ELSE r END), '[]'::jsonb)
        INTO v_filas
        FROM jsonb_array_elements(p_snapshot->v_clave) r
        LEFT JOIN clientes_alias a
          ON a.tenant_id = p_tenant AND a.alias_id::text = lower(r->>'cliente_id');
    END IF;
    p_snapshot := jsonb_set(p_snapshot, ARRAY[v_clave], v_filas);
  END LOOP;
  IF jsonb_array_length(v_errs) > 0 THEN p_snapshot := jsonb_set(p_snapshot, '{_fusion_errores}', v_errs); END IF;
  RETURN p_snapshot;
END $$;
REVOKE ALL ON FUNCTION _vim_fusionar_clientes(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- CAJAS SIN ACTUALIZAR, y el código público. _vim_apply_rows_detalle (0131) inserta TODAS las
-- columnas del destino y deja en NULL las que el JSON no trae. tickets.lealtad_mxn y
-- clientes.codigo_publico son NOT NULL: sin este relleno, en cuanto la 0156 esté en producción cada
-- venta y cada cliente que suba una caja que aún no se actualizó se rechazaría, y esa caja dejaría
-- de subir.
-- El código público es el enlace/QR del cliente y lo manda la NUBE: la migración también corre en
-- cada caja, cuyo DEFAULT le da a cada cliente local un código distinto, y el upsert pisa todas las
-- columnas. Por eso, de un cliente que la nube ya tiene SIEMPRE se impone el código de la nube,
-- diga lo que diga la caja; solo uno nuevo conserva el que traía (o se le genera uno).
CREATE OR REPLACE FUNCTION _vim_compat_0156(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uuid  CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_filas jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
             CASE WHEN r->>'lealtad_mxn' IS NOT NULL THEN r
                  ELSE r || jsonb_build_object('lealtad_mxn', 0) END), '[]'::jsonb)
      INTO v_filas FROM jsonb_array_elements(p_snapshot->'tickets') r;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', v_filas);
  END IF;

  IF jsonb_typeof(p_snapshot->'clientes') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
             CASE WHEN e.codigo IS NOT NULL THEN r || jsonb_build_object('codigo_publico', e.codigo)
                  WHEN r->>'codigo_publico' IS NOT NULL THEN r
                  ELSE r || jsonb_build_object('codigo_publico',
                         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
             END), '[]'::jsonb)
      INTO v_filas
      FROM jsonb_array_elements(p_snapshot->'clientes') r
      LEFT JOIN LATERAL (SELECT c.codigo_publico AS codigo FROM clientes c
                          WHERE c.tenant_id = p_tenant
                            AND c.id = CASE WHEN r->>'id' ~ v_uuid THEN (r->>'id')::uuid END) e ON true;
    p_snapshot := jsonb_set(p_snapshot, '{clientes}', v_filas);
  END IF;
  RETURN p_snapshot;
END $$;
REVOKE ALL ON FUNCTION _vim_compat_0156(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- Aplica los movimientos de lealtad que sube una caja. Uno por uno y aislados: un movimiento malo
-- no retiene a los demás. Idempotente por id. La caja solo puede subir lo que ella origina:
--   GANADO, REVERSA_GANADO, REVERSA_CANJE.
-- Un CANJE solo pasa si la nube ya lo tiene (es la copia local de uno que ella autorizó); uno que
-- no conoce se rechaza. AJUSTE y VENCIMIENTO no suben nunca.
-- Una REVERSA_CANJE devuelve puntos, así que no se cree lo que dice la caja: tiene que apuntar a un
-- CANJE de este negocio y se registra con el cliente, los puntos y la versión de ESE canje. Una caja
-- confundida o manipulada no puede devolver más de lo canjeado ni devolverlo a otro cliente.
-- Las referencias (ticket, sucursal, caja, premio) no pueden ser de otro negocio: un GANADO con el
-- ticket de otro haría que ese ticket no ganara nada y que su cancelación revirtiera contra un
-- movimiento ajeno. Un id que la nube aún no tiene sí pasa: el ticket puede llegar en otro lote.
CREATE OR REPLACE FUNCTION _vim_aplicar_movimientos_lealtad(p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila    jsonb;
  v_tipo    lealtad_movimiento_tipo;
  v_canje   lealtad_movimientos%ROWTYPE;
  v_cliente uuid;
  v_puntos  integer;
  v_version integer;
  v_ticket  uuid;
  v_sucursal uuid;
  v_caja    uuid;
  v_premio  uuid;
  v_n       integer := 0;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', v_errores);
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'fecha' LOOP
    BEGIN
      IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'movimiento de otro negocio';
      END IF;
      v_tipo := (v_fila->>'tipo')::lealtad_movimiento_tipo;

      IF v_tipo = 'CANJE' THEN
        IF NOT EXISTS (SELECT 1 FROM lealtad_movimientos
                        WHERE id = (v_fila->>'id')::uuid AND tenant_id = p_tenant AND tipo = 'CANJE') THEN
          RAISE EXCEPTION 'canje que la nube no autorizó';
        END IF;
        CONTINUE;
      END IF;
      IF v_tipo NOT IN ('GANADO', 'REVERSA_GANADO', 'REVERSA_CANJE') THEN
        RAISE EXCEPTION 'un movimiento % no puede subir desde una caja', v_tipo;
      END IF;

      v_ticket   := NULLIF(v_fila->>'ticket_id', '')::uuid;
      v_sucursal := NULLIF(v_fila->>'sucursal_id', '')::uuid;
      v_caja     := NULLIF(v_fila->>'caja_id', '')::uuid;
      v_premio   := NULLIF(v_fila->>'premio_id', '')::uuid;
      IF EXISTS (SELECT 1 FROM tickets WHERE id = v_ticket AND tenant_id IS DISTINCT FROM p_tenant) THEN
        RAISE EXCEPTION 'el ticket es de otro negocio';
      END IF;
      IF EXISTS (SELECT 1 FROM sucursales WHERE id = v_sucursal AND tenant_id IS DISTINCT FROM p_tenant) THEN
        RAISE EXCEPTION 'la sucursal es de otro negocio';
      END IF;
      IF EXISTS (SELECT 1 FROM cajas WHERE id = v_caja AND tenant_id IS DISTINCT FROM p_tenant) THEN
        RAISE EXCEPTION 'la caja es de otro negocio';
      END IF;
      IF EXISTS (SELECT 1 FROM lealtad_premios WHERE id = v_premio AND tenant_id IS DISTINCT FROM p_tenant) THEN
        RAISE EXCEPTION 'el premio es de otro negocio';
      END IF;

      IF v_tipo = 'REVERSA_CANJE' THEN
        SELECT * INTO v_canje FROM lealtad_movimientos
         WHERE id = NULLIF(v_fila->>'canje_movimiento_id', '')::uuid AND tenant_id = p_tenant AND tipo = 'CANJE';
        IF NOT FOUND THEN
          RAISE EXCEPTION 'la reversa no apunta a un canje de este negocio';
        END IF;
        v_cliente := v_canje.cliente_id;
        v_puntos  := -v_canje.puntos;
        v_version := v_canje.programa_version;
      ELSE
        v_cliente := (v_fila->>'cliente_id')::uuid;
        v_puntos  := (v_fila->>'puntos')::integer;
        v_version := (v_fila->>'programa_version')::integer;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cliente AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'el cliente todavía no existe en la nube';
      END IF;

      IF lealtad_registrar_movimiento(
           (v_fila->>'id')::uuid, p_tenant, v_cliente, v_tipo, v_puntos, v_version,
           v_ticket, v_sucursal, v_caja, NULLIF(v_fila->>'usuario_id', '')::uuid,
           v_premio, NULLIF(v_fila->>'monto_mxn', '')::numeric,
           v_fila->>'motivo', NULLIF(v_fila->>'canje_movimiento_id', '')::uuid,
           COALESCE(NULLIF(v_fila->>'fecha', '')::timestamptz, now()),
           NULLIF(v_fila->>'saldo_visto', '')::integer) THEN
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object(
        'tabla', 'lealtad_movimientos', 'id', v_fila->>'id', 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores);
END $$;
REVOKE ALL ON FUNCTION _vim_aplicar_movimientos_lealtad(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- El canje que sube con su ticket pasa por el aplicador genérico, que pisa TODAS las columnas: una
-- copia tardía de la caja con revertido = false podría revivir un canje que el libro ya devolvió, y
-- el cliente se quedaría con el descuento Y con los puntos. Esta conciliación corre justo después
-- del aplicador, con el libro como autoridad:
--   · la nube ya devolvió el canje y la caja lo manda vivo:
--       - la devolvió la red de 48 h y la cuenta resultó pagada (llegó tarde): el canje sí se usó,
--         se cobran los puntos otra vez con un AJUSTE de id determinista (reenviar no cobra dos
--         veces) y la fila queda viva;
--       - cualquier otro caso: la fila vuelve a revertido = true. Lo devuelto no revive.
-- Corre en modo réplica (triggers apagados), igual que el aplicador de arriba.
CREATE OR REPLACE FUNCTION _vim_conciliar_canjes(p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila    jsonb;
  v_id      uuid;
  v_tenant  uuid;
  v_ticket  uuid;
  v_vivo    boolean;
  v_rev     lealtad_movimientos%ROWTYPE;
  v_canje   lealtad_movimientos%ROWTYPE;
  v_n       integer := 0;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', v_errores);
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      -- Se castea con los MISMOS tipos que el aplicador genérico (jsonb_populate_recordset acepta un
      -- uuid sin guiones o con llaves y booleanos como 'fal'): lo que él no pudo castear no lo aplicó
      -- y ya lo reportó, y aquí se salta sin repetirlo; todo lo que SÍ aplicó se concilia. Una
      -- lista blanca propia, más estricta, dejaría pasar con revertido = false un canje devuelto.
      BEGIN
        v_id     := (v_fila->>'id')::uuid;
        v_tenant := (v_fila->>'tenant_id')::uuid;
        v_ticket := (v_fila->>'ticket_id')::uuid;
        v_vivo   := NOT COALESCE((v_fila->>'revertido')::boolean, false);
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      IF v_tenant IS DISTINCT FROM p_tenant THEN CONTINUE; END IF;   -- ya lo rechazó el aplicador
      IF NOT v_vivo THEN CONTINUE; END IF;

      SELECT * INTO v_rev FROM lealtad_movimientos
       WHERE tenant_id = p_tenant AND tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_id;
      IF NOT FOUND THEN CONTINUE; END IF;

      IF v_rev.motivo IS NOT DISTINCT FROM lealtad_motivo_red_48h()
         AND EXISTS (SELECT 1 FROM tickets t
                      WHERE t.id = v_ticket AND t.tenant_id = p_tenant
                        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
        SELECT * INTO v_canje FROM lealtad_movimientos
         WHERE id = v_id AND tenant_id = p_tenant AND tipo = 'CANJE';
        IF FOUND AND lealtad_registrar_movimiento(
             md5(v_id::text || ':recarga')::uuid, p_tenant, v_canje.cliente_id, 'AJUSTE',
             v_canje.puntos, v_canje.programa_version, v_canje.ticket_id,
             p_motivo => 'Canje confirmado tarde: la cuenta llegó pagada después de la red de 48 horas') THEN
          v_n := v_n + 1;
        END IF;
      ELSE
        UPDATE ticket_canjes_lealtad
           SET revertido = true, revertido_at = COALESCE(revertido_at, now())
         WHERE id = v_id AND tenant_id = p_tenant AND NOT revertido;
        IF FOUND THEN v_n := v_n + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object(
        'tabla', 'ticket_canjes_lealtad', 'id', v_fila->>'id', 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores);
END $$;
REVOKE ALL ON FUNCTION _vim_conciliar_canjes(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ── sync_push_snapshot: la de la 0126 (vigente) con cinco cambios, marcados "0156" ──
CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla     text;
  v_res       jsonb := '{}'::jsonb;
  v_det       jsonb;
  v_errores   jsonb := '[]'::jsonb;
  v_ignoradas text[] := ARRAY[]::text[];
  v_ini       timestamptz := clock_timestamp();
  v_total     integer := 0;
  v_aplicadas integer := 0;
  v_caja      uuid;
  v_sucursal  uuid;
  v_disp      text;
  v_desc      text;
  v_min       timestamptz;
  v_max       timestamptz;
  v_tickets   jsonb;
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  IF jsonb_typeof(p_snapshot->'_fusion_errores') = 'array' THEN v_errores := v_errores || (p_snapshot->'_fusion_errores'); END IF;
  p_snapshot := p_snapshot - '_fusion_errores';
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);

  -- La guarda del FACTURADO (ver el encabezado, punto 2): si la nube ya lo facturó y la caja
  -- manda su copia PAGADO, se conserva FACTURADO. Se reescribe el JSON entrante antes de aplicar,
  -- así el resto de la fila (lo que cambió en la caja) entra igual.
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT jsonb_agg(
             CASE WHEN t.estado_fiscal = 'FACTURADO' AND r->>'estado_fiscal' = 'PAGADO'
                  THEN r || jsonb_build_object('estado_fiscal', 'FACTURADO')
                  ELSE r END)
      INTO v_tickets
      FROM jsonb_array_elements(p_snapshot->'tickets') AS r
      LEFT JOIN public.tickets t ON t.id = NULLIF(r->>'id', '')::uuid AND t.tenant_id = p_tenant;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', COALESCE(v_tickets, '[]'::jsonb));
  END IF;

  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- 0156: un canje que el libro ya devolvió no revive con la copia tardía de la caja. Ver
  -- _vim_conciliar_canjes. Sigue en modo réplica, que es lo que se quiere para su UPDATE.
  v_det := _vim_conciliar_canjes(p_snapshot->'ticket_canjes_lealtad', p_tenant);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- ── Rastro del envío (0070/0073) ─────────────────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    -- Caja y sucursal de la primera fila (tickets, turnos o, si solo vienen movimientos, pagos/movimientos).
    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', '[]'::jsonb)) AS t
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', '[]'::jsonb)) AS t LIMIT 1;
    END IF;
    IF v_caja IS NULL AND v_sucursal IS NOT NULL THEN
      -- Un lote de puros movimientos no trae caja: se toma la de la sucursal con señal de vida más reciente.
      SELECT id INTO v_caja FROM public.cajas WHERE sucursal_id = v_sucursal AND tenant_id = p_tenant
       ORDER BY ultima_conexion DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
     WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id, dispositivo_descripcion,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'), v_desc,
      v_total, v_aplicadas, jsonb_array_length(v_errores),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'),
      -- 0123: el motivo de cada fila rechazada (hasta 20), no solo cuántas. Sin esto el detalle solo
      -- quedaba en la bitácora de la caja del local, y un rechazo que se reintenta cada 10 minutos
      -- no se podía diagnosticar desde aquí.
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                    THEN jsonb_build_object('_errores', (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_errores) e LIMIT 20) x))
                    ELSE '{}'::jsonb END
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Tablas que la caja mandó y aquí no se replican (0089).
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos']));
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;

-- ── sync_pull_snapshot: la de la 0152 (vigente) con las cuatro claves de lealtad ──
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Menú por sucursal (0152, ADR 0027).
    'productos_sucursal',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Lealtad (0156, ADR 0030). Los clientes bajan por primera vez: sin esto el cliente de una
    -- sucursal no existe en la otra. Los saldos bajan solo para mostrarse; la caja les suma lo que
    -- aún no subió. Los movimientos NO bajan.
    'clientes',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_programa',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_programa x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_premios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_premios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_saldos',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_saldos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;
