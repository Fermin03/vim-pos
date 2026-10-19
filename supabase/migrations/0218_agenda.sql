-- Belleza, entrega 1: agenda (diseño 2026-10-18).
--
-- Catálogo (qué servicio dura cuánto, quién lo hace, en qué horario, en qué espacio) y citas. El
-- candado de empalmes vive en la base: dos EXCLUDE sobre citas_servicios (mismo colaborador o mismo
-- espacio, tramos que se cruzan) con btree_gist (0217). Los tramos que solo se tocan pasan ('[)').
-- Una cita cancelada, «No llegó» o en espera no ocupa: `activa` la mantiene un disparador.
-- El «día» se calcula en America/Mexico_City. Las citas solo se escriben por RPC. Sync: 0219.

-- ── §1 Tipos, configuración y módulo ────────────────────────────────────────
CREATE TYPE cita_estado AS ENUM ('AGENDADA', 'EN_ESPERA', 'EN_CURSO', 'TERMINADA', 'NO_LLEGO', 'CANCELADA');
CREATE TYPE cita_canal  AS ENUM ('CAJA', 'SIN_CITA', 'EN_LINEA');

ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS agenda_tolerancia_min integer NOT NULL DEFAULT 15
    CHECK (agenda_tolerancia_min BETWEEN 0 AND 120);
COMMENT ON COLUMN configuracion_tenant.agenda_tolerancia_min IS
  'Minutos tras la hora de la cita en que la recepción la ve como «Pasó la tolerancia». «No llegó» es manual (0218).';

-- Molde de configuracion_tenant_credito_guardia (0208).
CREATE OR REPLACE FUNCTION configuracion_tenant_agenda_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND NEW.agenda_tolerancia_min IS DISTINCT FROM OLD.agenda_tolerancia_min)
     OR (TG_OP = 'INSERT' AND NEW.agenda_tolerancia_min <> 15) THEN
    IF NOT es_admin_del_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar la tolerancia de la agenda.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_agenda_guardia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_agenda_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_agenda_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_agenda_guardia();

-- Cuerpo vigente de la 0212 con `agenda`: módulo de operación como `existencias` (siempre
-- permitido; encendido = tenants.operacion->agenda; sin llave = apagado).
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

  -- 0189: existencias por producto; 0218: agenda. Sin llave = apagado.
  FOREACH v_codigo IN ARRAY ARRAY['existencias', 'agenda'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, false));
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
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189, 0208, 0212, 0218).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §2 Catálogo ─────────────────────────────────────────────────────────────
CREATE TABLE tipos_espacio (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre     varchar(60) NOT NULL CHECK (btrim(nombre) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nombre)
);
COMMENT ON TABLE tipos_espacio IS 'Clase de lugar que pide un servicio: cabina, sillón, camilla (0218).';

CREATE TABLE espacios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  tipo_espacio_id uuid NOT NULL REFERENCES tipos_espacio(id) ON DELETE RESTRICT,
  nombre          varchar(60) NOT NULL CHECK (btrim(nombre) <> ''),
  activo          boolean NOT NULL DEFAULT true,
  orden           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_espacios_sucursal_tipo ON espacios (sucursal_id, tipo_espacio_id, orden);
COMMENT ON TABLE espacios IS 'Lugar concreto de una sucursal (Cabina 1). Una cita lo ocupa sin empalmes (0218).';

CREATE TABLE servicios_agenda (
  producto_id     uuid PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  duracion_min    integer NOT NULL CHECK (duracion_min BETWEEN 5 AND 600),
  tipo_espacio_id uuid NULL REFERENCES tipos_espacio(id) ON DELETE RESTRICT,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE servicios_agenda IS 'Un producto que se agenda: cuánto dura y qué tipo de espacio pide (0218).';

CREATE TABLE colaboradores_agenda (
  usuario_id  uuid NOT NULL REFERENCES usuarios_perfil(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  color_hex   varchar(7) NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, usuario_id)
);
COMMENT ON TABLE colaboradores_agenda IS 'Empleado que atiende en la agenda, su sucursal y su color en el calendario (0218).';

CREATE TABLE servicio_colaborador (
  producto_id  uuid NOT NULL REFERENCES servicios_agenda(producto_id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES usuarios_perfil(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  precio_mxn   numeric(12,2) NULL CHECK (precio_mxn >= 0),
  duracion_min integer NULL CHECK (duracion_min BETWEEN 5 AND 600),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, usuario_id),
  FOREIGN KEY (tenant_id, usuario_id) REFERENCES colaboradores_agenda(tenant_id, usuario_id) ON DELETE CASCADE
);
COMMENT ON TABLE servicio_colaborador IS 'Quién hace qué servicio; precio y duración propios opcionales (0218).';

CREATE TABLE horarios_colaborador (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  usuario_id     uuid NOT NULL,
  dia_semana     smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),   -- 0 = domingo
  inicia         time NOT NULL,
  termina        time NOT NULL,
  comida_inicia  time NULL,
  comida_termina time NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usuario_id, dia_semana),
  FOREIGN KEY (tenant_id, usuario_id) REFERENCES colaboradores_agenda(tenant_id, usuario_id) ON DELETE CASCADE,
  CHECK (termina > inicia),
  CHECK ((comida_inicia IS NULL) = (comida_termina IS NULL)),
  CHECK (comida_inicia IS NULL OR (comida_inicia >= inicia AND comida_termina > comida_inicia AND comida_termina <= termina))
);
COMMENT ON TABLE horarios_colaborador IS 'Horario semanal (hora local) de un colaborador; «quien esté libre» lo respeta (0218).';

CREATE TABLE ausencias_colaborador (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL,
  desde      date NOT NULL,
  hasta      date NOT NULL,
  motivo     text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, usuario_id) REFERENCES colaboradores_agenda(tenant_id, usuario_id) ON DELETE CASCADE,
  CHECK (hasta >= desde)
);
CREATE INDEX idx_ausencias_colaborador ON ausencias_colaborador (tenant_id, usuario_id, desde);
COMMENT ON TABLE ausencias_colaborador IS 'Días (en America/Mexico_City) en que un colaborador no atiende: vacaciones, incapacidad (0218).';

-- ── §3 Citas ────────────────────────────────────────────────────────────────
CREATE TABLE citas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id       uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  cliente_id        uuid NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  cliente_nombre    varchar(150) NOT NULL CHECK (btrim(cliente_nombre) <> ''),
  cliente_telefono  varchar(20) NULL,
  cliente_email     varchar(254) NULL,
  estado            cita_estado NOT NULL DEFAULT 'AGENDADA',
  canal             cita_canal NOT NULL DEFAULT 'CAJA',
  inicia            timestamptz NULL,
  termina           timestamptz NULL,
  llego_at          timestamptz NULL,
  nota              text NULL,
  cancelada_motivo  text NULL,
  empalme           boolean NOT NULL DEFAULT false,
  ticket_id         uuid NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  client_id_local   varchar(100) NULL,
  created_by        uuid NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Sin tramo solo quien espera (o la espera que se canceló).
  CONSTRAINT citas_tramo CHECK (
    estado IN ('EN_ESPERA', 'CANCELADA') OR (inicia IS NOT NULL AND termina IS NOT NULL)),
  CONSTRAINT citas_tramo_orden CHECK (termina IS NULL OR inicia IS NULL OR termina > inicia),
  CONSTRAINT citas_client_id_local_uq UNIQUE (tenant_id, client_id_local)
);
CREATE INDEX idx_citas_sucursal_inicia ON citas (tenant_id, sucursal_id, inicia);
CREATE INDEX idx_citas_cliente ON citas (cliente_id) WHERE cliente_id IS NOT NULL;
COMMENT ON TABLE citas IS
  'Cita de belleza. inicia/termina = primer y último tramo de sus servicios; NULL en espera. empalme = chocó al sincronizar (0219). Solo se escribe por RPC (0218).';

CREATE TABLE citas_servicios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cita_id     uuid NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  orden       smallint NOT NULL,
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  usuario_id  uuid NULL REFERENCES usuarios_perfil(id) ON DELETE RESTRICT,   -- NULL solo en espera
  espacio_id  uuid NULL REFERENCES espacios(id) ON DELETE RESTRICT,
  inicia      timestamptz NULL,
  termina     timestamptz NULL,
  precio_mxn  numeric(12,2) NOT NULL CHECK (precio_mxn >= 0),
  activa      boolean NOT NULL DEFAULT false,
  empalme     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cita_id, orden),
  -- Un tramo que ocupa tiene que tener tiempo y dueño; si no, el rango sería infinito.
  CONSTRAINT citas_servicios_activa_con_tramo CHECK (
    NOT activa OR (inicia IS NOT NULL AND termina IS NOT NULL AND termina > inicia AND usuario_id IS NOT NULL)),
  CONSTRAINT citas_servicios_sin_empalme_colaborador EXCLUDE USING gist (
    tenant_id WITH =, usuario_id WITH =, tstzrange(inicia, termina, '[)') WITH &&)
    WHERE (activa AND NOT empalme),
  CONSTRAINT citas_servicios_sin_empalme_espacio EXCLUDE USING gist (
    tenant_id WITH =, espacio_id WITH =, tstzrange(inicia, termina, '[)') WITH &&)
    WHERE (activa AND NOT empalme AND espacio_id IS NOT NULL)
);
CREATE INDEX idx_citas_servicios_cita ON citas_servicios (cita_id, orden);
COMMENT ON TABLE citas_servicios IS
  'Tramo de una cita: un servicio, quién, dónde y cuándo. Los EXCLUDE impiden empalmes entre tramos activos (0218).';

-- `activa` sale del estado de la cita: cancelada, «No llegó» o en espera no ocupan.
CREATE OR REPLACE FUNCTION citas_servicios_activa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.activa := (SELECT c.estado NOT IN ('CANCELADA', 'NO_LLEGO', 'EN_ESPERA') FROM citas c WHERE c.id = NEW.cita_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION citas_servicios_activa() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_citas_servicios_activa
  BEFORE INSERT OR UPDATE ON citas_servicios
  FOR EACH ROW EXECUTE FUNCTION citas_servicios_activa();

CREATE OR REPLACE FUNCTION citas_estado_a_servicios()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE citas_servicios SET updated_at = now() WHERE cita_id = NEW.id;   -- el BEFORE recalcula activa
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION citas_estado_a_servicios() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_citas_estado_a_servicios
  AFTER UPDATE OF estado ON citas
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION citas_estado_a_servicios();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tipos_espacio', 'espacios', 'servicios_agenda', 'colaboradores_agenda',
                           'servicio_colaborador', 'horarios_colaborador', 'ausencias_colaborador',
                           'citas', 'citas_servicios'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ── §4 RLS ──────────────────────────────────────────────────────────────────
-- Catálogo: lee el negocio, escribe solo dueño o administrador. Citas: lectura; escritura por RPC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tipos_espacio', 'espacios', 'servicios_agenda', 'colaboradores_agenda',
                           'servicio_colaborador', 'horarios_colaborador', 'ausencias_colaborador'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %1$s_lectura ON %1$I FOR SELECT USING (tenant_id = current_tenant_id())', t);
    EXECUTE format('CREATE POLICY %1$s_admin ON %1$I FOR ALL TO authenticated
                      USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
                      WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- Las referencias del catálogo a filas de otro negocio no pasan aunque la FK sí.
CREATE OR REPLACE FUNCTION agenda_catalogo_mismo_negocio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  IF (j ? 'producto_id' AND NOT EXISTS (SELECT 1 FROM productos WHERE id = (j->>'producto_id')::uuid AND tenant_id = NEW.tenant_id))
     OR (j->>'sucursal_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (j->>'sucursal_id')::uuid AND tenant_id = NEW.tenant_id))
     OR (j->>'tipo_espacio_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tipos_espacio WHERE id = (j->>'tipo_espacio_id')::uuid AND tenant_id = NEW.tenant_id))
     OR (TG_TABLE_NAME = 'colaboradores_agenda' AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso WHERE usuario_id = (j->>'usuario_id')::uuid AND tenant_id = NEW.tenant_id)) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el catálogo de la agenda apunta a otro negocio.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION agenda_catalogo_mismo_negocio() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['espacios', 'servicios_agenda', 'colaboradores_agenda', 'servicio_colaborador'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_mismo_negocio BEFORE INSERT OR UPDATE ON %1$I
                      FOR EACH ROW EXECUTE FUNCTION agenda_catalogo_mismo_negocio()', t);
  END LOOP;
END $$;

ALTER TABLE citas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas_servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY citas_lectura ON citas FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY citas_servicios_lectura ON citas_servicios FOR SELECT USING (tenant_id = current_tenant_id());
REVOKE ALL ON citas, citas_servicios FROM anon, authenticated;
GRANT SELECT ON citas, citas_servicios TO authenticated;

-- ── §5 colaborador_libre ────────────────────────────────────────────────────
-- Entre los que hacen el servicio, activos en la sucursal y todavía empleados del negocio (acceso
-- activo y perfil sin borrar), con horario que cubre SU tramo (con la duración que tendría con
-- cada uno: la suya si la tiene, si no la del servicio), fuera de comida, sin ausencia ese día y
-- sin otro tramo que se cruce: el de menos citas ese día.
CREATE OR REPLACE FUNCTION colaborador_libre(p_sucursal uuid, p_producto uuid, p_inicia timestamptz)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    SELECT ca.tenant_id, ca.usuario_id, ca.orden,
           p_inicia + make_interval(mins => COALESCE(sc.duracion_min, sa.duracion_min)) AS termina
      FROM servicios_agenda sa
      JOIN servicio_colaborador sc ON sc.tenant_id = sa.tenant_id AND sc.producto_id = sa.producto_id
      JOIN colaboradores_agenda ca ON ca.tenant_id = sc.tenant_id AND ca.usuario_id = sc.usuario_id
     WHERE sa.tenant_id = current_tenant_id() AND sa.producto_id = p_producto AND sa.activo
       AND ca.sucursal_id = p_sucursal AND ca.activo
       AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = ca.tenant_id AND ua.usuario_id = ca.usuario_id AND ua.activo)
       AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = ca.usuario_id AND up.deleted_at IS NULL)
  ), l AS (
    SELECT c.*, (p_inicia AT TIME ZONE 'America/Mexico_City') AS ini,
           (c.termina AT TIME ZONE 'America/Mexico_City') AS fin
      FROM c
  )
  SELECT l.usuario_id
    FROM l
    JOIN horarios_colaborador h ON h.tenant_id = l.tenant_id AND h.usuario_id = l.usuario_id
   WHERE h.dia_semana = extract(dow FROM l.ini)
     AND l.fin::date = l.ini::date
     AND l.ini::time >= h.inicia AND l.fin::time <= h.termina
     AND NOT (h.comida_inicia IS NOT NULL AND l.ini::time < h.comida_termina AND l.fin::time > h.comida_inicia)
     AND NOT EXISTS (SELECT 1 FROM ausencias_colaborador a
                      WHERE a.tenant_id = l.tenant_id AND a.usuario_id = l.usuario_id
                        AND l.ini::date BETWEEN a.desde AND a.hasta)
     AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                      WHERE cs.tenant_id = l.tenant_id AND cs.usuario_id = l.usuario_id AND cs.activa
                        AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(p_inicia, l.termina, '[)'))
   ORDER BY (SELECT count(DISTINCT cs.cita_id) FROM citas_servicios cs
              WHERE cs.tenant_id = l.tenant_id AND cs.usuario_id = l.usuario_id AND cs.activa
                AND (cs.inicia AT TIME ZONE 'America/Mexico_City')::date = l.ini::date),
            l.orden, l.usuario_id
   LIMIT 1;
$$;
COMMENT ON FUNCTION colaborador_libre(uuid, uuid, timestamptz) IS
  '«Quien esté libre»: empleado vigente que hace el servicio y puede en su tramo (con su duración), con menos citas ese día (desempate: orden). NULL si nadie (0218).';
REVOKE EXECUTE ON FUNCTION colaborador_libre(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION colaborador_libre(uuid, uuid, timestamptz) TO authenticated, service_role;

-- ── §6 Tramos (interna) ─────────────────────────────────────────────────────
-- Inserta los servicios de una cita encadenados desde p_inicia (NULL = en espera, sin tramo) y
-- devuelve dónde termina el último. Asigna colaborador y espacio y traduce los EXCLUDE. Solo la
-- llaman las RPC de esta migración (SECURITY DEFINER); authenticated no la ejecuta.
CREATE OR REPLACE FUNCTION _agenda_tramos(p_tenant uuid, p_cita uuid, p_sucursal uuid, p_inicia timestamptz, p_servicios jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s       jsonb;
  v_orden   smallint := 0;
  v_cursor  timestamptz := p_inicia;
  v_fin     timestamptz;
  v_dur     integer;
  v_tipo    uuid;
  v_usuario uuid;
  v_espacio uuid;
  v_precio  numeric(12,2);
  v_prod    uuid;
  v_restr   text;
  v_nombre  text;
BEGIN
  IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servicios) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no tiene servicios.' USING ERRCODE = '22023';
  END IF;

  FOR v_s IN SELECT * FROM jsonb_array_elements(p_servicios) LOOP
    v_prod    := (v_s->>'producto_id')::uuid;
    v_usuario := (v_s->>'usuario_id')::uuid;
    v_espacio := (v_s->>'espacio_id')::uuid;
    SELECT sa.duracion_min, sa.tipo_espacio_id INTO v_dur, v_tipo
      FROM servicios_agenda sa
     WHERE sa.producto_id = v_prod AND sa.tenant_id = p_tenant AND sa.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un servicio de la cita no existe.' USING ERRCODE = '22023';
    END IF;
    IF v_usuario IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM colaboradores_agenda
          WHERE tenant_id = p_tenant AND usuario_id = v_usuario AND activo AND sucursal_id = p_sucursal) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el colaborador no está activo en esta sucursal.' USING ERRCODE = '22023';
    END IF;
    IF v_espacio IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM espacios WHERE id = v_espacio AND tenant_id = p_tenant AND sucursal_id = p_sucursal) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el espacio no es de esta sucursal.' USING ERRCODE = '22023';
    END IF;

    v_fin := NULL;
    IF v_cursor IS NOT NULL THEN
      IF v_usuario IS NULL THEN
        v_usuario := colaborador_libre(p_sucursal, v_prod, v_cursor);
        IF v_usuario IS NULL THEN
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay quien esté libre a esa hora' USING ERRCODE = '23P01';
        END IF;
      END IF;
      SELECT COALESCE(sc.duracion_min, v_dur) INTO v_dur
        FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;
      v_fin := v_cursor + make_interval(mins => v_dur);

      IF v_tipo IS NOT NULL AND v_espacio IS NULL THEN
        SELECT e.id INTO v_espacio
          FROM espacios e
         WHERE e.tenant_id = p_tenant AND e.sucursal_id = p_sucursal AND e.tipo_espacio_id = v_tipo AND e.activo
           AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                            WHERE cs.espacio_id = e.id AND cs.activa AND NOT cs.empalme
                              AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(v_cursor, v_fin, '[)'))
         ORDER BY e.orden, e.nombre
         LIMIT 1;
        IF v_espacio IS NULL THEN
          SELECT lower(nombre) INTO v_nombre FROM tipos_espacio WHERE id = v_tipo;
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay % libre a esa hora', v_nombre USING ERRCODE = '23P01';
        END IF;
      END IF;
    END IF;

    SELECT COALESCE(sc.precio_mxn, precio_producto_en_sucursal(v_prod, p_sucursal)) INTO v_precio
      FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;

    v_orden := v_orden + 1;
    BEGIN
      INSERT INTO citas_servicios (tenant_id, cita_id, orden, producto_id, usuario_id, espacio_id, inicia, termina, precio_mxn)
      VALUES (p_tenant, p_cita, v_orden, v_prod, v_usuario, v_espacio, v_cursor, v_fin, COALESCE(v_precio, 0));
    EXCEPTION WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_restr = CONSTRAINT_NAME;
      IF v_restr = 'citas_servicios_sin_empalme_espacio' THEN
        SELECT nombre INTO v_nombre FROM espacios WHERE id = v_espacio;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_usuario;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
    END;
    v_cursor := v_fin;
  END LOOP;
  RETURN v_cursor;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_tramos(uuid, uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- Negocio de la sesión con la agenda encendida; si no, error.
CREATE OR REPLACE FUNCTION _agenda_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((modulos_efectivos(v_tenant)->'efectivos'->>'agenda')::boolean, false) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la agenda no está encendida en este negocio.' USING ERRCODE = '22023';
  END IF;
  RETURN v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_tenant() FROM PUBLIC, anon, authenticated;

-- ── §7 RPC ──────────────────────────────────────────────────────────────────
-- Todas SECURITY DEFINER acotadas a mano al negocio del JWT (molde de guardar_cotizacion, 0212).

-- Crea (o edita, si trae `id`) una cita AGENDADA. Idempotente por client_id_local.
CREATE OR REPLACE FUNCTION guardar_cita(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := _agenda_tenant();
  v_id      uuid := (p->>'id')::uuid;
  v_suc     uuid := (p->>'sucursal_id')::uuid;
  v_cliente uuid := (p->>'cliente_id')::uuid;
  v_inicia  timestamptz := (p->>'inicia')::timestamptz;
  v_nombre  text := NULLIF(btrim(p->>'cliente_nombre'), '');
  v_estado  cita_estado;
  v_termina timestamptz;
  v_vecinos uuid[] := '{}';
BEGIN
  IF v_id IS NULL AND p->>'client_id_local' IS NOT NULL THEN
    SELECT id INTO v_id FROM citas WHERE tenant_id = v_tenant AND client_id_local = p->>'client_id_local';
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = v_suc AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de este negocio.' USING ERRCODE = '22023';
  END IF;
  IF v_inicia IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la hora de la cita.' USING ERRCODE = '22023';
  END IF;
  IF v_cliente IS NOT NULL THEN
    SELECT COALESCE(v_nombre, c.nombre) INTO v_nombre
      FROM clientes c WHERE c.id = v_cliente AND c.tenant_id = v_tenant AND c.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el cliente no es de este negocio.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta el nombre del cliente.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO citas (tenant_id, sucursal_id, cliente_id, cliente_nombre, cliente_telefono, cliente_email,
                       estado, canal, inicia, termina, nota, client_id_local, created_by)
    VALUES (v_tenant, v_suc, v_cliente, v_nombre, p->>'cliente_telefono', p->>'cliente_email',
            'AGENDADA', COALESCE((p->>'canal')::cita_canal, 'CAJA'), v_inicia, v_inicia + interval '1 minute',
            p->>'nota', p->>'client_id_local', auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT estado INTO v_estado FROM citas WHERE id = v_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023';
    END IF;
    IF v_estado <> 'AGENDADA' THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: solo se edita una cita por llegar.' USING ERRCODE = '22023';
    END IF;
    -- Lo que chocaba con su hora vieja pierde la marca si ya no choca (0219, como el push).
    v_vecinos := _agenda_vecinos(v_tenant, v_id);
    DELETE FROM citas_servicios WHERE cita_id = v_id;
    UPDATE citas SET sucursal_id = v_suc, cliente_id = v_cliente, cliente_nombre = v_nombre,
                     cliente_telefono = p->>'cliente_telefono', cliente_email = p->>'cliente_email',
                     inicia = v_inicia, termina = v_inicia + interval '1 minute',
                     nota = p->>'nota', empalme = false
     WHERE id = v_id;
  END IF;

  v_termina := _agenda_tramos(v_tenant, v_id, v_suc, v_inicia, p->'servicios');
  UPDATE citas SET termina = v_termina WHERE id = v_id;
  PERFORM _agenda_remarcar(v_tenant, v_vecinos);
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION guardar_cita(jsonb) IS
  'Crea o edita una cita AGENDADA con sus servicios encadenados desde `inicia`; usuario_id null = «quien esté libre». Empalme → CITA_EMPALMADA (0218).';

-- Llega alguien sin cita: queda en espera, sin tramo.
CREATE OR REPLACE FUNCTION agregar_en_espera(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_suc    uuid := (p->>'sucursal_id')::uuid;
  v_id     uuid;
BEGIN
  IF p->>'client_id_local' IS NOT NULL THEN
    SELECT id INTO v_id FROM citas WHERE tenant_id = v_tenant AND client_id_local = p->>'client_id_local';
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = v_suc AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de este negocio.' USING ERRCODE = '22023';
  END IF;
  IF (p->>'cliente_id') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM clientes WHERE id = (p->>'cliente_id')::uuid AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el cliente no es de este negocio.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO citas (tenant_id, sucursal_id, cliente_id, cliente_nombre, cliente_telefono, cliente_email,
                     estado, canal, llego_at, nota, client_id_local, created_by)
  VALUES (v_tenant, v_suc, (p->>'cliente_id')::uuid,
          COALESCE(NULLIF(btrim(p->>'cliente_nombre'), ''),
                   (SELECT nombre FROM clientes WHERE id = (p->>'cliente_id')::uuid), 'Sin nombre'),
          p->>'cliente_telefono', p->>'cliente_email',
          'EN_ESPERA', 'SIN_CITA', now(), p->>'nota', p->>'client_id_local', auth.uid())
  RETURNING id INTO v_id;
  PERFORM _agenda_tramos(v_tenant, v_id, v_suc, NULL, p->'servicios');
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION agregar_en_espera(jsonb) IS
  'Cliente sin cita: EN_ESPERA, canal SIN_CITA, llego_at = now(); servicios sin tramo y colaborador opcional (0218).';

-- Empieza a atender. Desde la espera, el tramo empieza ahora con la misma asignación y candado.
CREATE OR REPLACE FUNCTION atender_cita(p_cita uuid, p_servicios jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant    uuid := _agenda_tenant();
  v_c         citas%ROWTYPE;
  v_servicios jsonb;
  v_termina   timestamptz;
BEGIN
  SELECT * INTO v_c FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023'; END IF;
  IF v_c.estado = 'AGENDADA' THEN
    IF p_servicios IS NOT NULL THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: la cita ya tiene sus servicios; para cambiarlos, edítala antes de atenderla.' USING ERRCODE = '22023';
    END IF;
    UPDATE citas SET estado = 'EN_CURSO', llego_at = now() WHERE id = p_cita;
    RETURN;
  END IF;
  IF v_c.estado <> 'EN_ESPERA' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no está por llegar ni en espera.' USING ERRCODE = '22023';
  END IF;

  v_servicios := COALESCE(p_servicios, (
    SELECT jsonb_agg(jsonb_build_object('producto_id', producto_id, 'usuario_id', usuario_id, 'espacio_id', espacio_id) ORDER BY orden)
      FROM citas_servicios WHERE cita_id = p_cita));
  DELETE FROM citas_servicios WHERE cita_id = p_cita;
  -- Primero el estado (sin tramos que reactivar) y luego los tramos: nacen activos.
  UPDATE citas SET estado = 'EN_CURSO', inicia = now(), termina = now() + interval '1 minute' WHERE id = p_cita;
  v_termina := _agenda_tramos(v_tenant, p_cita, v_c.sucursal_id, now(), v_servicios);
  UPDATE citas SET termina = v_termina WHERE id = p_cita;
END;
$$;

CREATE OR REPLACE FUNCTION terminar_cita(p_cita uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := _agenda_tenant();
BEGIN
  UPDATE citas SET estado = 'TERMINADA'
   WHERE id = p_cita AND tenant_id = v_tenant AND estado = 'EN_CURSO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no se está atendiendo.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION marcar_no_llego(p_cita uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_c      citas%ROWTYPE;
  v_vecinos uuid[];
BEGIN
  SELECT * INTO v_c FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR v_c.estado <> 'AGENDADA' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no está por llegar.' USING ERRCODE = '22023';
  END IF;
  IF now() < v_c.inicia THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita todavía no empieza' USING ERRCODE = '22023';
  END IF;
  v_vecinos := _agenda_vecinos(v_tenant, p_cita);
  UPDATE citas SET estado = 'NO_LLEGO' WHERE id = p_cita;
  -- Ya no ocupa: ella y lo que chocaba con ella pierden la marca (0219).
  PERFORM _agenda_remarcar(v_tenant, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = p_cita));
END;
$$;

CREATE OR REPLACE FUNCTION cancelar_cita(p_cita uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := _agenda_tenant();
  v_vecinos uuid[];
BEGIN
  PERFORM 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  v_vecinos := _agenda_vecinos(v_tenant, p_cita);
  UPDATE citas SET estado = 'CANCELADA', cancelada_motivo = NULLIF(btrim(p_motivo), '')
   WHERE id = p_cita AND tenant_id = v_tenant AND estado IN ('AGENDADA', 'EN_ESPERA');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cancela una cita por llegar o en espera.' USING ERRCODE = '22023';
  END IF;
  -- Ya no ocupa: ella y lo que chocaba con ella pierden la marca (0219).
  PERFORM _agenda_remarcar(v_tenant, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = p_cita));
END;
$$;

-- Quita la marca de empalme (0219) si la cita ya no choca; si sigue chocando, CITA_EMPALMADA.
CREATE OR REPLACE FUNCTION resolver_empalme(p_cita uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_restr  text;
  v_nombre text;
  v_s      record;
BEGIN
  PERFORM 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023'; END IF;
  FOR v_s IN SELECT id, usuario_id, espacio_id FROM citas_servicios WHERE cita_id = p_cita AND empalme ORDER BY orden LOOP
    BEGIN
      UPDATE citas_servicios SET empalme = false WHERE id = v_s.id;
    EXCEPTION WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_restr = CONSTRAINT_NAME;
      IF v_restr = 'citas_servicios_sin_empalme_espacio' THEN
        SELECT nombre INTO v_nombre FROM espacios WHERE id = v_s.espacio_id;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_s.usuario_id;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
    END;
  END LOOP;
  UPDATE citas SET empalme = false WHERE id = p_cita;
END;
$$;

CREATE OR REPLACE FUNCTION faltas_cliente(p_cliente uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::integer FROM citas
   WHERE tenant_id = current_tenant_id() AND cliente_id = p_cliente AND estado = 'NO_LLEGO';
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['guardar_cita(jsonb)', 'agregar_en_espera(jsonb)', 'atender_cita(uuid, jsonb)',
                           'terminar_cita(uuid)', 'marcar_no_llego(uuid)', 'cancelar_cita(uuid, text)',
                           'resolver_empalme(uuid)', 'faltas_cliente(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
