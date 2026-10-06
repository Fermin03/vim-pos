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
