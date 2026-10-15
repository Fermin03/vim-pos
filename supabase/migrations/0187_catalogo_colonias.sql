-- 0187 · Catálogo de colonias con zona de envío (ADR 0036; spec 2026-10-15-catalogo-colonias-design.md)
--
-- La colonia de un domicilio era texto libre y la zona se elegía aparte, de memoria. Ahora cada
-- sucursal tiene su catálogo de colonias con su zona: al escribirla, la caja y la tienda la sugieren
-- y la zona sale sola. El domicilio sigue guardando SU zona (direcciones_cliente.zona_envio_id): el
-- catálogo solo sugiere, y cambiar la zona de una colonia no toca domicilios guardados.
--
--   §1 sepomex_asentamientos: el catálogo oficial de Correos de México, entero y de solo lectura.
--      Lo carga desktop/scripts/cargar-sepomex.mjs una vez. NO baja a la caja.
--   §2 colonias: el catálogo de cada sucursal. Baja a la caja y sube desde ella (§5), igual que
--      zonas_envio. La caja da de alta colonias (CAPTURADA) sin PIN, como da de alta zonas (0139 §2).
--   §3 sembrar_colonias: copia el municipio de la sucursal y hereda zonas del historial.
--   §4 asignar_zona_colonia: poner zona a una colonia sin zona es libre; cambiarla pide PIN.
--   §5 sync: pull, push (con fusión por llave) y catalogo_version.
--   §6 tienda: búsqueda pública, la colonia decide el envío (tienda_cotizar / tienda_crear_pedido).

-- ── §1 SEPOMEX ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sepomex_asentamientos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_postal   varchar(5)   NOT NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  nombre          varchar(150) NOT NULL,
  tipo            varchar(50)  NOT NULL,
  municipio       varchar(100) NOT NULL,
  estado          varchar(50)  NOT NULL,
  -- c_estado (2) + c_mnpio (3): la llave para sembrar el municipio de una sucursal.
  clave_municipio varchar(8)   NOT NULL
);
COMMENT ON TABLE sepomex_asentamientos IS 'Asentamientos de Correos de México (CPdescarga.txt). Solo lectura; la carga desktop/scripts/cargar-sepomex.mjs. No baja a la caja.';
CREATE INDEX IF NOT EXISTS idx_sepomex_cp        ON sepomex_asentamientos (codigo_postal);
CREATE INDEX IF NOT EXISTS idx_sepomex_municipio ON sepomex_asentamientos (clave_municipio);
ALTER TABLE sepomex_asentamientos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sepomex_asentamientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON sepomex_asentamientos TO service_role;
DO $$ BEGIN
  CREATE POLICY sepomex_select ON sepomex_asentamientos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §2 colonias ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colonias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre          varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
  codigo_postal   varchar(5) NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  zona_envio_id   uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL,
  origen          text NOT NULL DEFAULT 'CAPTURADA' CHECK (origen IN ('SEPOMEX', 'CAPTURADA')),
  -- Para buscar y para la llave: sin acentos, minúsculas, sin espacios de sobra (como clientes, 0007).
  nombre_busqueda text GENERATED ALWAYS AS (lower(f_unaccent(btrim(nombre)))) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);
COMMENT ON TABLE colonias IS 'Colonias de cada sucursal con su zona de envío (0187, ADR 0036). Sugiere la zona del domicilio; no la impone.';

-- Hay colonias homónimas con distinto CP («Centro» 37000 y 37500): la llave lleva el CP.
CREATE UNIQUE INDEX IF NOT EXISTS colonia_llave_uq
  ON colonias (sucursal_id, nombre_busqueda, (coalesce(codigo_postal, ''))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_busqueda_trgm
  ON colonias USING GIN (nombre_busqueda gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_sucursal ON colonias (sucursal_id) WHERE deleted_at IS NULL;

ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON colonias TO authenticated, service_role;
-- Leer y dar de alta: todo el personal del negocio (la caja captura colonias al vuelo, sin PIN).
-- Cambiar o borrar: solo quien administra (el panel). La caja cambia zonas por asignar_zona_colonia.
DO $$ BEGIN
  CREATE POLICY colonias_select ON colonias FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_insert ON colonias FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_update ON colonias FOR UPDATE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_delete ON colonias FOR DELETE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_colonias_updated_at BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona de una colonia: viva, de la MISMA sucursal y no de un tramo por distancia (las de tramo
-- no se eligen a mano, 0185). SECURITY DEFINER: la cajera no necesita leer tienda_sucursales.
-- En modo réplica (sync) no corre: la nube y la caja ya validaron al escribir.
CREATE OR REPLACE FUNCTION _colonia_zona_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.zona_envio_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM zonas_envio z
                  WHERE z.id = NEW.zona_envio_id AND z.sucursal_id = NEW.sucursal_id
                    AND z.tenant_id = NEW.tenant_id AND z.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM tienda_sucursales ts
                 WHERE ts.sucursal_id = NEW.sucursal_id
                   AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', NEW.zona_envio_id::text))) THEN
    RAISE EXCEPTION 'ZONA_INVALIDA: la zona no es de esta sucursal o es de un tramo por distancia' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION _colonia_zona_valida() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_colonias_zona_valida BEFORE INSERT OR UPDATE OF zona_envio_id, sucursal_id ON colonias
  FOR EACH ROW EXECUTE FUNCTION _colonia_zona_valida();

-- ── §3 sembrar_colonias ──────────────────────────────────────────────────────
-- Copia los asentamientos del municipio de la sucursal (sale de su CP) y a cada colonia SIN zona le
-- pone la zona más usada en el historial de domicilios de esa sucursal. Repetirla es seguro: no
-- duplica, no revive colonias borradas y nunca pisa una zona asignada.
-- Herencia: el texto del domicilio se compara sin acentos ni mayúsculas. Si la colonia tiene una
-- homónima viva con otro CP, solo cuenta el historial con SU CP (muchos domicilios de la caja
-- guardan «00000»: esos no deciden entre homónimas). Zonas borradas, inactivas o de tramo no cuentan.
CREATE OR REPLACE FUNCTION sembrar_colonias(p_sucursal uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_cp     text;
  v_mun    text;
  v_ins    integer;
  v_her    integer;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: solo quien administra el negocio carga colonias' USING ERRCODE = '42501';
  END IF;
  SELECT s.codigo_postal INTO v_cp FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA: la sucursal no es de este negocio' USING ERRCODE = 'P0002';
  END IF;
  SELECT a.clave_municipio INTO v_mun FROM sepomex_asentamientos a WHERE a.codigo_postal = v_cp LIMIT 1;
  IF v_mun IS NULL THEN
    RAISE EXCEPTION 'CP_DESCONOCIDO: captura un código postal válido en los datos de la sucursal' USING ERRCODE = '22023';
  END IF;

  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal, origen)
  SELECT DISTINCT ON (lower(f_unaccent(btrim(a.nombre))), a.codigo_postal)
         v_tenant, p_sucursal, btrim(a.nombre), a.codigo_postal, 'SEPOMEX'
    FROM sepomex_asentamientos a
   WHERE a.clave_municipio = v_mun
     -- Sin el filtro de deleted_at: una colonia que el dueño borró no vuelve.
     AND NOT EXISTS (SELECT 1 FROM colonias c
                      WHERE c.sucursal_id = p_sucursal
                        AND c.nombre_busqueda = lower(f_unaccent(btrim(a.nombre)))
                        AND coalesce(c.codigo_postal, '') = a.codigo_postal)
   ORDER BY lower(f_unaccent(btrim(a.nombre))), a.codigo_postal, a.id;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  WITH uso AS (
    SELECT lower(f_unaccent(btrim(d.colonia))) AS nb, d.codigo_postal AS cp, d.zona_envio_id AS zona,
           count(*) AS n, max(d.updated_at) AS ult
      FROM direcciones_cliente d
      JOIN zonas_envio z ON z.id = d.zona_envio_id
     WHERE d.tenant_id = v_tenant AND d.activa
       AND z.sucursal_id = p_sucursal AND z.deleted_at IS NULL AND z.activa
       AND NOT EXISTS (SELECT 1 FROM tienda_sucursales ts
                        WHERE ts.sucursal_id = p_sucursal
                          AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text)))
     GROUP BY 1, 2, 3
  ), votos AS (
    SELECT c.id, u.zona, sum(u.n) AS n, max(u.ult) AS ult
      FROM colonias c
      JOIN uso u ON u.nb = c.nombre_busqueda
                AND (u.cp = c.codigo_postal
                     OR NOT EXISTS (SELECT 1 FROM colonias o
                                     WHERE o.sucursal_id = c.sucursal_id AND o.deleted_at IS NULL
                                       AND o.nombre_busqueda = c.nombre_busqueda AND o.id <> c.id))
     WHERE c.sucursal_id = p_sucursal AND c.deleted_at IS NULL AND c.zona_envio_id IS NULL
     GROUP BY c.id, u.zona
  ), elegida AS (
    SELECT DISTINCT ON (id) id, zona FROM votos ORDER BY id, n DESC, ult DESC
  )
  UPDATE colonias c SET zona_envio_id = e.zona FROM elegida e WHERE c.id = e.id;
  GET DIAGNOSTICS v_her = ROW_COUNT;

  RETURN jsonb_build_object('insertadas', v_ins, 'heredadas', v_her);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION sembrar_colonias(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sembrar_colonias(uuid) TO authenticated;

-- ── §4 asignar_zona_colonia ──────────────────────────────────────────────────
-- Mismo patrón que cambiar_costo_zona (0139). Poner zona a una colonia que no tiene (o cuya zona ya
-- no está viva y activa) es libre: llega un pedido a esa hora y no hay a quién pedirle PIN. CAMBIAR
-- una zona viva pide autorización de descuento.override_precio sobre esa colonia; quien administra
-- el negocio no la necesita. Quitar la zona, solo quien administra.
CREATE OR REPLACE FUNCTION asignar_zona_colonia(p_colonia uuid, p_zona uuid, p_autorizacion_pin_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_c      colonias%ROWTYPE;
  v_viva   boolean;
  v_admin  boolean;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM colonias WHERE id = p_colonia AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La colonia no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_c.zona_envio_id IS NOT DISTINCT FROM p_zona THEN RETURN; END IF;

  v_admin := es_admin_del_tenant(v_tenant);
  IF p_zona IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'Solo quien administra el negocio quita la zona de una colonia.' USING ERRCODE = '42501';
  END IF;
  v_viva := v_c.zona_envio_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM zonas_envio z WHERE z.id = v_c.zona_envio_id AND z.deleted_at IS NULL AND z.activa);
  IF v_viva AND NOT (v_admin AND p_autorizacion_pin_id IS NULL) THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['descuento.override_precio'], p_colonia, NULL);
  END IF;
  UPDATE colonias SET zona_envio_id = p_zona WHERE id = p_colonia;   -- trg_colonias_zona_valida revisa
END;
$fn$;
REVOKE EXECUTE ON FUNCTION asignar_zona_colonia(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION asignar_zona_colonia(uuid, uuid, uuid) TO authenticated;

-- ── §5 sync ──────────────────────────────────────────────────────────────────
-- Dos cajas (o una caja y el panel) capturan la misma colonia sin internet: mismo nombre y CP, otro
-- id. El upsert del push chocaría con colonia_llave_uq y la fila se reintentaría para siempre. Antes
-- de aplicar, la de la caja se saca del lote y, si la de la nube no tenía zona, le pasa la suya.
-- Nadie apunta a una colonia (el domicilio guarda su propia zona), así que no hay nada que reapuntar;
-- el siguiente pull de la caja trae la de la nube y la local se funde allá (sync-pull.mjs).
CREATE OR REPLACE FUNCTION _vim_fusionar_colonias(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila   jsonb;
  v_nube   colonias%ROWTYPE;
  v_quedan jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot -> 'colonias') IS DISTINCT FROM 'array' THEN RETURN p_snapshot; END IF;
  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_snapshot -> 'colonias') LOOP
    SELECT * INTO v_nube FROM colonias c
     WHERE c.tenant_id = p_tenant
       AND c.sucursal_id = NULLIF(v_fila ->> 'sucursal_id', '')::uuid
       AND c.id <> NULLIF(v_fila ->> 'id', '')::uuid
       AND c.deleted_at IS NULL
       AND c.nombre_busqueda = lower(f_unaccent(btrim(v_fila ->> 'nombre')))
       AND coalesce(c.codigo_postal, '') = coalesce(v_fila ->> 'codigo_postal', '');
    IF FOUND AND (v_fila ->> 'deleted_at') IS NULL THEN
      IF v_nube.zona_envio_id IS NULL AND NULLIF(v_fila ->> 'zona_envio_id', '') IS NOT NULL THEN
        BEGIN
          UPDATE colonias SET zona_envio_id = (v_fila ->> 'zona_envio_id')::uuid WHERE id = v_nube.id;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '_vim_fusionar_colonias: no se pasó la zona de %: %', v_fila ->> 'id', SQLERRM;
        END;
      END IF;
    ELSE
      v_quedan := v_quedan || jsonb_build_array(v_fila);
    END IF;
  END LOOP;
  RETURN jsonb_set(p_snapshot, '{colonias}', v_quedan);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_fusionar_colonias(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- 0187: sync_pull_snapshot es la de la 0184 (vigente) más la clave `colonias`.
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
    -- 0187: el catálogo de colonias (ADR 0036). Sube y baja, como las zonas.
    'colonias',                       coalesce((SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Propinas por sucursal (0184): lo que el dueño configura en el admin, para que la caja lo respete.
    'sucursal_propinas_config',       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursal_propinas_config x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
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

-- 0187: catalogo_version es la de la 0184 (vigente) más colonias.
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM productos_sucursal),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores),
    (SELECT max(updated_at) FROM combo_grupos),
    (SELECT max(updated_at) FROM combo_opciones),
    (SELECT max(updated_at) FROM zonas_envio),
    (SELECT max(updated_at) FROM colonias),   -- 0187
    (SELECT max(updated_at) FROM anuncios_pantalla),
    (SELECT max(updated_at) FROM lealtad_programa),
    (SELECT max(updated_at) FROM lealtad_premios),
    (SELECT max(updated_at) FROM configuracion_tenant),
    (SELECT max(updated_at) FROM sucursal_propinas_config)
  );
$$;
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;

-- 0187: sync_push_snapshot es la de la 0156 (vigente) con dos cambios, marcados "0187".
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
    'colonias',   -- 0187
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
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);

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

