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

DROP TRIGGER IF EXISTS trg_colonias_updated_at ON colonias;
CREATE TRIGGER trg_colonias_updated_at BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La sucursal tiene que ser del mismo negocio (sin esto, otro negocio podría ocupar las llaves del
-- catálogo ajeno: la sucursal de un negocio es pública vía tienda_negocio).
-- La zona de una colonia: viva, de la MISMA sucursal y no de un tramo por distancia (las de tramo
-- no se eligen a mano, 0185). SECURITY DEFINER: la cajera no necesita leer tienda_sucursales.
-- En modo réplica (sync) no corre: la nube y la caja ya validaron al escribir.
CREATE OR REPLACE FUNCTION _colonia_zona_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA: la sucursal no es de este negocio' USING ERRCODE = '42501';
  END IF;
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
DROP TRIGGER IF EXISTS trg_colonias_zona_valida ON colonias;
CREATE TRIGGER trg_colonias_zona_valida BEFORE INSERT OR UPDATE OF zona_envio_id, sucursal_id, tenant_id ON colonias
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
                      WHERE c.tenant_id = v_tenant AND c.sucursal_id = p_sucursal
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
    SELECT DISTINCT ON (id) id, zona FROM votos ORDER BY id, n DESC, ult DESC, zona
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

-- ── §6 tienda ────────────────────────────────────────────────────────────────
-- A domicilio, una colonia viva de la sucursal con zona viva, activa y no de tramo decide el envío:
-- esa zona y su precio, se ignoran la zona y el punto que mande el navegador, y `cobro` = 'COLONIA'.
-- Si no, exactamente lo de antes según tienda_sucursales.cobro_envio.

-- La zona que una colonia le da a la tienda: viva, activa, de la sucursal y no de un tramo.
CREATE OR REPLACE FUNCTION _tienda_zona_de_colonia(p_tenant uuid, p_sucursal uuid, p_colonia uuid)
RETURNS TABLE (zona_id uuid, costo_mxn numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT z.id, z.costo_mxn
    FROM colonias c
    JOIN zonas_envio z ON z.id = c.zona_envio_id
   WHERE c.id = p_colonia AND c.tenant_id = p_tenant AND c.sucursal_id = p_sucursal AND c.deleted_at IS NULL
     AND z.sucursal_id = p_sucursal AND z.activa AND z.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM tienda_sucursales ts
                      WHERE ts.sucursal_id = p_sucursal
                        AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text)));
$$;
REVOKE ALL ON FUNCTION _tienda_zona_de_colonia(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _tienda_zona_de_colonia(uuid, uuid, uuid) TO service_role;

-- Sugerencias para el formulario de la tienda. Sin precio ni id de zona: solo si tiene.
-- De 2 a 60 caracteres; `%` y `_` se buscan tal cual. Normaliza igual que colonias.nombre_busqueda.
CREATE OR REPLACE FUNCTION tienda_colonias(p_tenant uuid, p_sucursal uuid, p_q text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH q AS (SELECT lower(f_unaccent(btrim(coalesce(p_q, '')))) AS t),
       l AS (SELECT t, replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') AS esc FROM q)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'codigo_postal', x.codigo_postal,
                                               'con_zona', x.con_zona) ORDER BY x.empieza DESC, x.nombre, x.codigo_postal), '[]'::jsonb)
    FROM (SELECT c.id, btrim(c.nombre) AS nombre, c.codigo_postal,   -- la tabla guarda el nombre como se escribió
                 c.nombre_busqueda LIKE l.esc || '%' AS empieza,
                 EXISTS (SELECT 1 FROM _tienda_zona_de_colonia(p_tenant, p_sucursal, c.id)) AS con_zona
            FROM colonias c, l
           WHERE c.tenant_id = p_tenant AND c.sucursal_id = p_sucursal AND c.deleted_at IS NULL
             AND char_length(l.t) BETWEEN 2 AND 60
             AND c.nombre_busqueda LIKE '%' || l.esc || '%'
           ORDER BY empieza DESC, nombre, codigo_postal   -- homónimas: en orden de CP, sin CP al final
           LIMIT 8) x;
$$;
REVOKE ALL ON FUNCTION tienda_colonias(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_colonias(uuid, uuid, text) TO service_role;

-- tienda_cotizar: cuerpo copiado ÍNTEGRO de 0185 §5. Cambios marcados «-- 0187:»: parámetro nuevo
-- p_colonia (al final, NULL por omisión) y, a domicilio, la colonia con zona decide el envío.
-- La firma cambia: la anterior se borra (con dos, PostgREST no sabría a cuál llamar).
DROP FUNCTION IF EXISTS tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb);   -- 0187: la firma de 0185
CREATE OR REPLACE FUNCTION tienda_cotizar(p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
                                          p_punto jsonb DEFAULT NULL,
                                          p_colonia uuid DEFAULT NULL)   -- 0187: la colonia del catálogo, si eligió una
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_uuid       CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  -- Más lejos que esto (en calles) un punto no es un cliente de la sucursal: es basura o un error.
  -- Holgado sobre el tramo más largo que se puede configurar (50 km).
  c_alcance_km CONSTANT numeric := 80;
  v_menu       jsonb;
  v_r          jsonb;            -- un renglón del carrito
  v_pid        text;
  v_p          jsonb;            -- su producto, como lo enseña el menú
  v_cant       integer;
  v_precio     numeric(12,2);    -- precio unitario del renglón (en un combo: base + elecciones)
  v_total      numeric(12,2);    -- lo que el ticket cobrará por el renglón (un combo: padre + hijos)
  v_mods       jsonb;            -- sus modificadores normalizados (en un combo: las elecciones)
  v_m          jsonb;
  v_comps      jsonb;
  v_comp       jsonb;
  v_slot       jsonb;
  v_op         jsonb;
  v_n          integer;
  v_items      jsonb := '[]'::jsonb;
  v_renglones  jsonb := '[]'::jsonb;
  v_subtotal   numeric(12,2) := 0;
  v_envio      numeric(12,2) := 0;
  v_envio_tot  numeric(12,2) := 0;
  v_ts         tienda_sucursales%ROWTYPE;
  v_suc        record;
  v_tramos     jsonb;
  v_punto      jsonb;
  v_dist       numeric;
  v_zona       uuid := p_zona;
  v_cobro      text;             -- 0187: 'COLONIA' cuando la colonia decidió el envío
  v_col        record;           -- 0187: la zona de la colonia
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;

  IF p_modo = 'DOMICILIO' THEN
    SELECT * INTO v_ts FROM tienda_sucursales ts WHERE ts.sucursal_id = p_sucursal AND ts.tenant_id = p_tenant;
    -- 0187: la colonia con zona decide el envío, cobre como cobre la sucursal. La zona y el punto
    -- que mande el navegador no cuentan (así no se elige una zona más barata).
    SELECT * INTO v_col FROM _tienda_zona_de_colonia(p_tenant, p_sucursal, p_colonia);
    IF v_col.zona_id IS NOT NULL THEN
      v_zona := v_col.zona_id; v_envio := v_col.costo_mxn; v_cobro := 'COLONIA';
    ELSIF v_ts.cobro_envio IS NOT DISTINCT FROM 'DISTANCIA' THEN   -- 0187: era IF
      IF p_zona IS NOT NULL THEN
        RAISE EXCEPTION 'ZONA_INVALIDA: con envío por distancia la zona la decide la ubicación';
      END IF;
      v_tramos := _tienda_tramos(p_sucursal);
      SELECT s.geo_lat, s.geo_lng INTO v_suc FROM sucursales s WHERE s.id = p_sucursal;
      IF v_tramos IS NULL OR v_suc.geo_lat IS NULL OR v_suc.geo_lng IS NULL THEN
        RAISE EXCEPTION 'ZONA_INVALIDA: esta sucursal no tiene listo el envío por distancia';
      END IF;
      IF p_punto IS NOT NULL AND p_punto <> 'null'::jsonb THEN
        v_punto := _tienda_punto(p_punto);
        IF v_punto IS NOT NULL THEN
          v_dist := _tienda_distancia_km(v_suc.geo_lat, v_suc.geo_lng, (v_punto ->> 'lat')::numeric, (v_punto ->> 'lng')::numeric);
        END IF;
        IF v_dist IS NULL OR v_dist > c_alcance_km THEN
          RAISE EXCEPTION 'UBICACION_INVALIDA: la ubicación no es válida';
        END IF;
        -- El primer tramo que la alcanza. El borde cuenta: a 3.0 km exactos, el tramo «hasta 3 km».
        SELECT (t ->> 'zona_id')::uuid, (t ->> 'costo_mxn')::numeric INTO v_zona, v_envio
          FROM jsonb_array_elements(v_tramos) t
         WHERE (t ->> 'hasta_km')::numeric >= v_dist
         ORDER BY (t ->> 'hasta_km')::numeric
         LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'FUERA_DE_AREA: %', to_char(v_dist, 'FM99990.0'); END IF;
      END IF;
    ELSE
      SELECT z.costo_mxn INTO v_envio
        FROM zonas_envio z
       WHERE z.id = p_zona AND z.tenant_id = p_tenant AND z.sucursal_id = p_sucursal
         AND z.activa AND z.deleted_at IS NULL
         AND NOT COALESCE(v_ts.tramos_envio, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text));
      IF NOT FOUND THEN RAISE EXCEPTION 'ZONA_INVALIDA: a domicilio hace falta una zona activa de esta sucursal'; END IF;
    END IF;
  ELSIF p_modo = 'RECOGER' THEN
    IF p_zona IS NOT NULL THEN RAISE EXCEPTION 'ZONA_INVALIDA: al recoger no hay zona de envío'; END IF;
  ELSE
    RAISE EXCEPTION 'MODO_INVALIDO: el modo es RECOGER o DOMICILIO';
  END IF;

  -- jsonb_array_length revienta con lo que no es arreglo: el CASE lo deja en NULL.
  IF COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items END), 0) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'CARRITO_INVALIDO: el carrito es un arreglo de 1 a 40 renglones';
  END IF;

  v_menu := tienda_menu(p_tenant, p_sucursal);

  FOR v_r IN SELECT e.r FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(r, ord) ORDER BY e.ord LOOP
    v_pid  := lower(v_r ->> 'producto_id');
    v_cant := _tienda_entero(v_r -> 'cantidad', 1, 50);
    IF jsonb_typeof(v_r) IS DISTINCT FROM 'object' OR jsonb_typeof(v_r -> 'producto_id') IS DISTINCT FROM 'string'
       OR v_pid !~ c_uuid OR v_cant IS NULL THEN
      RAISE EXCEPTION 'CARRITO_INVALIDO: cada renglón lleva producto_id y una cantidad entera de 1 a 50';
    END IF;

    -- Que esté en el menú y no agotado ES la regla de qué se vende (tienda_menu, reglas 1, 2, 6 y 8).
    v_p := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_pid));
    -- «IS NOT FALSE»: sin la clave `agotado` tampoco se vende.
    IF v_p IS NULL OR (v_p ->> 'agotado')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE: %', v_pid;
    END IF;
    v_precio := (v_p ->> 'precio_mxn')::numeric;

    IF NOT (v_p ->> 'es_combo')::boolean THEN
      IF COALESCE(v_r -> 'componentes', '[]'::jsonb) NOT IN ('[]'::jsonb, 'null'::jsonb) THEN
        RAISE EXCEPTION 'CARRITO_INVALIDO: solo un combo lleva componentes';
      END IF;
      v_m := _tienda_modificadores(v_p -> 'grupos', v_r -> 'modificadores', v_cant);
      IF v_m IS NULL THEN RAISE EXCEPTION 'MODIFICADORES_INVALIDOS: %', v_pid; END IF;
      v_mods  := v_m -> 'normalizados';
      v_total := _tienda_con_iva(ROUND(v_cant * v_precio, 2) + (v_m ->> 'monto')::numeric, v_pid::uuid, p_tenant);
    ELSE
      -- Un combo: el padre cobra base + elecciones (con el IVA del combo); cada hijo va a precio 0
      -- y solo cobra sus propios modificadores (con el IVA del hijo). Anexo §4.
      v_comps := COALESCE(NULLIF(v_r -> 'componentes', 'null'::jsonb), '[]'::jsonb);
      IF COALESCE(v_r -> 'modificadores', '[]'::jsonb) NOT IN ('[]'::jsonb, 'null'::jsonb)
         OR jsonb_typeof(v_comps) <> 'array' THEN
        RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
      END IF;
      v_mods  := '[]'::jsonb;
      v_total := 0;
      FOR v_comp IN SELECT e.c FROM jsonb_array_elements(v_comps) WITH ORDINALITY AS e(c, ord) ORDER BY e.ord LOOP
        v_slot := jsonb_path_query_first(v_p, '$.slots[*] ? (@.id == $id)',
                                         jsonb_build_object('id', lower(v_comp ->> 'grupo_id')));
        v_op   := jsonb_path_query_first(v_slot, '$.opciones[*] ? (@.producto_id == $id)',
                                         jsonb_build_object('id', lower(v_comp ->> 'producto_id')));
        v_n    := _tienda_entero(v_comp -> 'cantidad', 1, 999);   -- el tope de verdad es el máximo del slot
        IF v_op IS NULL OR (v_op ->> 'agotado')::boolean IS NOT FALSE OR v_n IS NULL THEN
          RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
        END IF;
        v_m := _tienda_modificadores(v_op -> 'grupos', v_comp -> 'modificadores', v_n * v_cant);
        IF v_m IS NULL THEN RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid; END IF;

        v_precio := v_precio + (v_op ->> 'precio_extra_mxn')::numeric * v_n;
        v_total  := v_total + _tienda_con_iva((v_m ->> 'monto')::numeric, (v_op ->> 'producto_id')::uuid, p_tenant);
        v_mods   := v_mods || jsonb_build_object(
          'opcion_modificador_id', v_op ->> 'producto_id',   -- el PRODUCTO elegido (0161:218-234)
          'grupo_id', v_slot ->> 'id',
          'nombre_app', v_op ->> 'nombre',
          'cantidad', v_n,                                     -- por unidad de combo
          'precio_extra_mxn', v_op ->> 'precio_extra_mxn',
          'modificadores', v_m -> 'normalizados');
      END LOOP;
      -- El mismo producto dos veces no se admite: el ticket empareja los modificadores de un hijo
      -- por producto y no sabría a cuál van (0161, COMBO_ELECCION_AMBIGUA). Y cada slot, con su
      -- mínimo y su máximo.
      IF (SELECT count(*) <> count(DISTINCT m ->> 'opcion_modificador_id') FROM jsonb_array_elements(v_mods) m)
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_p -> 'slots') s
            CROSS JOIN LATERAL (SELECT COALESCE(sum((m ->> 'cantidad')::integer), 0) AS n
                                  FROM jsonb_array_elements(v_mods) m
                                 WHERE m ->> 'grupo_id' = s ->> 'id') x
            WHERE x.n NOT BETWEEN (s ->> 'minimo')::integer AND (s ->> 'maximo')::integer) THEN
        RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
      END IF;
      v_total := v_total + _tienda_con_iva(ROUND(v_cant * v_precio, 2), v_pid::uuid, p_tenant);
    END IF;

    -- Una elección de slot puede restar (precio_delta_mxn no tiene CHECK), pero el renglón no puede
    -- quedar en negativo: ticket_items.precio_unitario_snapshot tiene CHECK >= 0.
    IF v_precio < 0 THEN RAISE EXCEPTION 'PRECIO_INVALIDO: un precio unitario quedó en negativo'; END IF;

    v_items := v_items || jsonb_build_object(
      'producto_id', v_pid,
      'nombre_app', v_p ->> 'nombre',
      'cantidad', v_cant,
      'precio_unitario_mxn', v_p ->> 'precio_mxn',   -- en un combo, la base: las elecciones suman aparte
      -- Texto del público, última red (la función `tienda` ya lo limpia): los caracteres de control
      -- se vuelven espacio antes de recortar. Va a la comanda y al ticket impreso.
      'nota', CASE WHEN jsonb_typeof(v_r -> 'nota') = 'string'
                   THEN NULLIF(left(btrim(regexp_replace(v_r ->> 'nota', '[[:cntrl:]]', ' ', 'g')), 200), '') END,
      'alergenos', '[]'::jsonb,
      'alergia_nota', NULL,
      'modificadores', v_mods);
    v_renglones := v_renglones || jsonb_build_object(
      'nombre', v_p ->> 'nombre',
      'cantidad', v_cant,
      'detalle', (SELECT string_agg(m ->> 'nombre_app', ', ') FROM jsonb_array_elements(v_mods) m),
      'total_mxn', to_char(v_total, 'FM999999990.00'));
    v_subtotal := v_subtotal + v_total;
  END LOOP;

  -- El envío es un renglón más del ticket, de cantidad 1, con el IVA del PRIMER renglón del
  -- carrito (fijar_envio_ticket, 0116:193-205). Una zona de $0 no deja renglón.
  IF v_envio > 0 THEN
    v_envio_tot := _tienda_con_iva(v_envio, lower(p_items -> 0 ->> 'producto_id')::uuid, p_tenant);
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'renglones', v_renglones,
    'subtotal_mxn', to_char(v_subtotal, 'FM999999990.00'),
    'envio_mxn', to_char(v_envio, 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_tot, 'FM999999990.00'),
    'total_mxn', to_char(v_subtotal + v_envio_tot, 'FM999999990.00'),
    'cobro', CASE WHEN p_modo = 'DOMICILIO' THEN COALESCE(v_cobro, v_ts.cobro_envio, 'ZONAS') END,   -- 0187: v_cobro
    'distancia_km', to_char(v_dist, 'FM99990.0'),
    'zona_id', CASE WHEN p_modo = 'DOMICILIO' THEN v_zona END);
END;
$$;
REVOKE ALL ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb, uuid) TO service_role;

-- tienda_crear_pedido: cuerpo copiado ÍNTEGRO de 0185 §6. Cambios marcados «-- 0187:»: parámetro
-- nuevo p_colonia (al final, NULL por omisión), que va a la cotización. La zona del pedido sigue
-- siendo la que dio la cotización (v_q ->> 'zona_id'), que ahora puede ser la de la colonia.
DROP FUNCTION IF EXISTS tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb);   -- 0187: la firma de 0185
CREATE OR REPLACE FUNCTION tienda_crear_pedido(
  p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
  p_cliente jsonb,          -- {nombre, telefono (10 dígitos), email | null}
  p_direccion jsonb,        -- NULL al recoger; a domicilio {calle, numero_exterior, numero_interior?, colonia, codigo_postal, ciudad, estado, referencias?}
  p_pago text,              -- 'EFECTIVO' | 'TARJETA' | 'EN_LINEA'
  p_paga_con numeric,       -- NULL salvo EFECTIVO
  p_nota text,
  p_seguimiento_hash text,  -- SHA-256 en hex del código que solo conoce el cliente
  p_cuenta uuid DEFAULT NULL,
  p_total_esperado numeric DEFAULT NULL,
  p_clave text DEFAULT NULL,  -- la llave del intento de compra: con ella, repetir devuelve el mismo pedido
  p_propina_pct integer DEFAULT NULL,  -- solo EN_LINEA: 0, 10, 15 o 20. NULL = sin propina
  p_propina_mxn numeric DEFAULT NULL,  -- solo EN_LINEA y sin p_propina_pct: la propina de «otro monto», en pesos
  p_punto jsonb DEFAULT NULL,          -- solo a domicilio «Por distancia»: {lat, lng} del pin del cliente
  p_colonia uuid DEFAULT NULL)         -- 0187: la colonia del catálogo; con zona, decide el envío
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
  v_nombre text := btrim(p_cliente ->> 'nombre');
  v_tel    text := p_cliente ->> 'telefono';
  v_email  text := p_cliente ->> 'email';
  v_cfg    tienda_config%ROWTYPE;
  v_q      jsonb;
  v_total  numeric(12,2);
  v_dir    jsonb := NULLIF(p_direccion, 'null'::jsonb);
  v_dir_ok boolean;
  v_id_ext text := replace(gen_random_uuid()::text, '-', '');
  v_ped    delivery_pedidos%ROWTYPE;
  v_en_linea boolean := p_pago IS NOT DISTINCT FROM 'EN_LINEA';
  v_conexion uuid;
  v_propina  numeric(12,2) := 0;
  v_por_distancia boolean;
BEGIN
  -- 0) El reintento. Va antes que todo: quien reintenta ya tiene su pedido, y da igual que desde
  --    entonces la tienda haya cerrado, un precio haya cambiado o él haya llegado a su tope de
  --    pedidos vivos. Se busca por huella Y negocio (el índice es único en toda la plataforma: la
  --    huella de otro negocio no se devuelve). El candado pone en fila a dos envíos simultáneos
  --    del mismo intento: el segundo espera a que el primero termine y aquí ya lo encuentra.
  IF p_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tienda_clave:' || COALESCE(p_seguimiento_hash, ''), 0));
    SELECT * INTO v_ped FROM delivery_pedidos d
     WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
    IF FOUND THEN RETURN _tienda_pedido_creado(v_ped, true); END IF;
  END IF;

  -- 1) La sucursal es del negocio (antes que nada: no se contesta por la tienda de otro) y recibe
  --    pedidos ahora en ese modo. Un modo que no existe sale por aquí como MODO_NO_DISPONIBLE.
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;
  v_motivo := tienda_estado_sucursal(p_sucursal, p_modo);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'TIENDA_CERRADA: %', v_motivo; END IF;

  -- 2) El cliente. «IS NOT TRUE»: una clave ausente deja la condición en NULL, y NULL no es válido.
  IF (char_length(v_nombre) BETWEEN 1 AND 100
      AND v_tel ~ '^[0-9]{10}$'
      AND (v_email IS NULL OR (char_length(v_email) <= 254 AND v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))) IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO: nombre de 1 a 100 caracteres, teléfono de 10 dígitos y correo válido o ausente';
  END IF;

  -- 3) La forma de pago, habilitada por el negocio. (tienda_estado_sucursal ya exigió la fila.)
  --    En línea, además, la sucursal tiene que tener quién cobre AHORA (tienda_conexion_cobro).
  SELECT * INTO v_cfg FROM tienda_config WHERE tenant_id = p_tenant;
  IF v_en_linea THEN v_conexion := tienda_conexion_cobro(p_tenant, p_sucursal); END IF;
  IF ((p_pago = 'EFECTIVO' AND v_cfg.pago_efectivo) OR (p_pago = 'TARJETA' AND v_cfg.pago_tarjeta)
      OR (v_en_linea AND v_conexion IS NOT NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: esa forma de pago no está disponible';
  END IF;
  -- En línea el correo es obligatorio: Mercado Pago lo pide con el cobro, y ahí llega la confirmación.
  IF v_en_linea AND v_email IS NULL THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO: para pagar en línea hace falta el correo';
  END IF;
  IF p_propina_pct IS NOT NULL AND (NOT v_en_linea OR p_propina_pct NOT IN (0, 10, 15, 20)) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: la propina va solo con el pago en línea y es de 0, 10, 15 o 20 por ciento';
  END IF;
  -- «Otro monto»: va en lugar del porcentaje (nunca los dos), solo en línea, mayor que cero y con
  -- dos decimales a lo más. Contra el subtotal se mide en el paso 4, que es donde se conoce (y
  -- ese tope también deja fuera NaN e infinito, que para numeric son mayores que todo).
  IF p_propina_mxn IS NOT NULL AND (NOT v_en_linea OR p_propina_pct IS NOT NULL
      OR (p_propina_mxn > 0 AND p_propina_mxn = round(p_propina_mxn, 2)) IS NOT TRUE) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: la propina de otro monto va sola, solo con el pago en línea, mayor que cero y con dos decimales';
  END IF;

  -- 4) La cotización: valida el carrito y la zona, y pone los renglones y los importes. Sus errores
  --    pasan tal cual. Y el total, si el cliente dijo cuál vio, tiene que seguir siendo ese.
  --    La propina es un porcentaje de los PRODUCTOS (sin el envío) que calcula el servidor, o el
  --    monto que escribió el cliente, de hasta ese subtotal; no entra en el total del pedido: va
  --    aparte, como en el ticket.
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items, p_punto, p_colonia);   -- 0187: p_colonia
  v_total := (v_q ->> 'total_mxn')::numeric;
  -- «Por distancia», el envío sale de la ubicación: sin ella no hay a dónde ni cuánto.
  v_por_distancia := p_modo = 'DOMICILIO' AND v_q ->> 'cobro' = 'DISTANCIA';
  IF v_por_distancia AND v_q ->> 'distancia_km' IS NULL THEN
    RAISE EXCEPTION 'UBICACION_INVALIDA: a domicilio hace falta tu ubicación';
  END IF;
  IF p_total_esperado IS NOT NULL AND p_total_esperado IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'TOTAL_CAMBIO: %', v_q ->> 'total_mxn';   -- el total de ahora, con dos decimales
  END IF;
  IF v_en_linea THEN
    IF v_total <= 0 THEN RAISE EXCEPTION 'PAGO_INVALIDO: no hay nada que cobrar en línea'; END IF;
    IF p_propina_mxn IS NOT NULL THEN
      -- El tope lo pone el subtotal REAL de los productos (sin el envío), el de esta cotización.
      IF p_propina_mxn > (v_q ->> 'subtotal_mxn')::numeric THEN
        RAISE EXCEPTION 'PAGO_INVALIDO: la propina no puede ser mayor que el subtotal de los productos';
      END IF;
      v_propina := p_propina_mxn;
    ELSE
      v_propina := ROUND((v_q ->> 'subtotal_mxn')::numeric * COALESCE(p_propina_pct, 0) / 100, 2);
    END IF;
  END IF;

  -- 5) «Paga con»: solo en efectivo, y entre el total y el total + 5000 (el tope también deja
  --    fuera NaN e infinito, que para numeric son mayores que todo).
  IF p_paga_con IS NOT NULL AND (p_pago <> 'EFECTIVO' OR p_paga_con < v_total OR p_paga_con > v_total + 5000) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: «paga con» va solo en efectivo y entre el total y el total más 5000';
  END IF;

  -- 6) La dirección: a domicilio, completa y dentro de las longitudes de direcciones_cliente (que
  --    es donde crear_ticket_desde_tienda la guardará); al recoger, ninguna. Se guarda recortada y
  --    solo con estas claves: lo demás que mande el cliente no entra.
  IF p_modo = 'DOMICILIO' THEN
    SELECT bool_and(char_length(x.valor) BETWEEN k.minimo AND k.maximo),
           jsonb_object_agg(k.clave, x.valor) FILTER (WHERE x.valor <> '')
      INTO v_dir_ok, v_dir
      FROM (VALUES ('calle', 1, 255), ('numero_exterior', 1, 20), ('numero_interior', 0, 20), ('colonia', 1, 150),
                   ('codigo_postal', 5, 5), ('ciudad', 1, 100), ('estado', 1, 50), ('referencias', 0, 300)) AS k(clave, minimo, maximo)
     CROSS JOIN LATERAL (SELECT btrim(COALESCE(v_dir ->> k.clave, ''))) AS x(valor);
    IF (v_dir_ok AND v_dir ->> 'codigo_postal' ~ '^[0-9]{5}$') IS NOT TRUE THEN
      RAISE EXCEPTION 'DIRECCION_INVALIDA: a domicilio hacen falta calle, número, colonia, código postal de 5 dígitos, ciudad y estado';
    END IF;
    -- «Por distancia»: el punto (dato personal: se purga con la dirección a los 30 días) y la
    -- distancia al frente de las referencias, por donde la caja instalada ya la enseña e imprime.
    -- Los dos los pone la base: el punto ya validado y la distancia que ella calculó.
    IF v_por_distancia THEN
      v_dir := v_dir || _tienda_punto(p_punto)
               || jsonb_build_object('referencias', 'A ' || (v_q ->> 'distancia_km') || ' km' || COALESCE(' · ' || (v_dir ->> 'referencias'), ''));
    END IF;
    -- 0187: si la colonia decidió el envío, la dirección lleva ESA colonia (y su CP, si el catálogo
    -- lo tiene): así no se cobra la zona de una colonia y el repartidor va a otra.
    IF v_q ->> 'cobro' = 'COLONIA' THEN
      SELECT v_dir || jsonb_build_object('colonia', btrim(c.nombre))
                   || CASE WHEN c.codigo_postal IS NOT NULL THEN jsonb_build_object('codigo_postal', c.codigo_postal) ELSE '{}'::jsonb END
        INTO v_dir
        FROM colonias c
       WHERE c.id = p_colonia AND c.tenant_id = p_tenant AND c.sucursal_id = p_sucursal;
    END IF;
  ELSIF v_dir IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECCION_INVALIDA: al recoger no hay dirección';
  END IF;

  -- 7) La huella del código de seguimiento. Repetida, la rechaza el índice único (0161 §1).
  IF (p_seguimiento_hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'SEGUIMIENTO_INVALIDO: la huella del seguimiento es un SHA-256 en hexadecimal';
  END IF;

  -- 8) La cuenta del cliente, si viene, es de este negocio y sigue viva. delivery_pedidos no tiene
  --    llave foránea a tienda_cuentas (0161 §1): quien lo comprueba es esta función.
  IF p_cuenta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tienda_cuentas c
                                           WHERE c.id = p_cuenta AND c.tenant_id = p_tenant AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA: la cuenta no existe en este negocio';
  END IF;

  -- 9) Cliente bloqueado o con 3 pedidos vivos: el MISMO error, letra por letra, para no revelar si
  --    un teléfono existe o está bloqueado. Va AQUÍ, lo último antes de insertar y después de todas
  --    las demás validaciones: si fuera antes, una petición inválida a propósito serviría para
  --    preguntar por un teléfono sin llegar a crear nada. Quien llega hasta aquí, o crea un pedido o
  --    recibe este error. El candado hace de uno en uno las altas de un mismo teléfono: sin él,
  --    varias simultáneas contarían lo mismo y pasarían todas el tope.
  --    «Vivo» tiene que decaer solo: con gestión NUBE nada mueve `estado` más allá de ACEPTADO (el
  --    seguimiento lo deriva del ticket al leer, §5), así que sin esto tres pedidos aceptados
  --    dejarían ese teléfono sin poder pedir para siempre. No cuenta el pedido de hace más de 6
  --    horas ni el que ya tiene en la nube un ticket cobrado, facturado o cancelado.
  --    El que espera la confirmación de su cobro (POR_PAGAR) cuenta: puede acabar siendo un pedido.
  -- ponytail: el conteo no tiene índice propio; recorre los pedidos vivos (índice parcial de 0090),
  -- que son pocos. Si un día pesa, un índice parcial por (tenant_id, cliente_telefono).
  PERFORM pg_advisory_xact_lock(hashtextextended('tienda_pedido:' || p_tenant || ':' || v_tel, 0));
  IF EXISTS (SELECT 1 FROM clientes c
              WHERE c.id = lealtad_resolver_cliente(p_tenant, NULL, v_tel) AND c.estado = 'BLOQUEADO')
     OR (SELECT count(*) FROM delivery_pedidos d
          WHERE d.tenant_id = p_tenant AND d.canal = 'TIENDA' AND d.cliente_telefono = v_tel
            AND d.estado IN ('POR_PAGAR', 'RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
            AND d.recibido_at > now() - interval '6 hours'
            AND NOT EXISTS (SELECT 1 FROM tickets t
                             WHERE t.id = d.ticket_id AND t.tenant_id = p_tenant
                               AND t.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO'))) > 2 THEN
    RAISE EXCEPTION 'NO_SE_PUDO_CREAR: no se pudo crear el pedido';
  END IF;

  -- 10) La fila. id_externo: 32 hex al azar ('tienda:' || id_externo cabe en el varchar(64) de
  --    tickets.client_id_local) y único en toda la plataforma, como pide UNIQUE (app, id_externo).
  --    En su propio bloque por la segunda red del reintento: si aun con el candado del paso 0 otra
  --    transacción metió antes la misma huella (un llamador que no lee lo ya confirmado), con
  --    p_clave se devuelve el pedido que ganó en vez del error. Cualquier otra violación de
  --    unicidad —sin p_clave, o una huella que es de otro negocio— sale tal cual, como antes.
  BEGIN
    INSERT INTO delivery_pedidos (
      tenant_id, sucursal_id, canal, app, conexion_id, estado, tipo_entrega, id_externo, folio_corto,
      items, subtotal_mxn, envio_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn,
      cliente_nombre, cliente_telefono, cliente_email, direccion, zona_envio_id,
      pago_al_recibir, paga_con_mxn, propina_mxn, nota_cliente, seguimiento_hash, tienda_cuenta_id,
      vence_aceptacion, gestion, payload_raw, envio_distancia_km)
    VALUES (
      p_tenant, p_sucursal, 'TIENDA',
      (CASE p_modo WHEN 'DOMICILIO' THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)::modo_servicio,
      NULL, CASE WHEN v_en_linea THEN 'POR_PAGAR' ELSE 'RECIBIDO' END,
      CASE p_modo WHEN 'DOMICILIO' THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END,
      v_id_ext, 'T' || upper(left(v_id_ext, 5)),
      v_q -> 'items', (v_q ->> 'subtotal_mxn')::numeric,
      (v_q ->> 'envio_mxn')::numeric,   -- el costo de la zona, no el total con IVA: así lo espera el ticket
      v_total, v_total, CASE p_pago WHEN 'EFECTIVO' THEN v_total ELSE 0 END,
      v_nombre, v_tel, v_email, v_dir, (v_q ->> 'zona_id')::uuid,
      p_pago, p_paga_con, CASE WHEN v_en_linea THEN v_propina END,
      NULLIF(left(btrim(p_nota), 300), ''), p_seguimiento_hash, p_cuenta,
      -- En línea no corre ninguna ventana hasta que se paga.
      CASE WHEN v_en_linea THEN NULL ELSE now() + make_interval(mins => v_cfg.minutos_aceptacion) END,
      -- Misma regla que los pedidos de apps (procesar-uber.ts): con una caja instalada viva, el
      -- ticket lo crea la caja. (En línea se vuelve a decidir al aprobarse el cobro.)
      CASE WHEN sucursal_con_espejo(p_sucursal) THEN 'ESCRITORIO' ELSE 'NUBE' END,
      '{}'::jsonb,                      -- nada del cuerpo crudo: ni IP, ni token, ni sesión
      CASE WHEN v_por_distancia THEN (v_q ->> 'distancia_km')::numeric END)
    RETURNING * INTO v_ped;
  EXCEPTION WHEN unique_violation THEN
    IF p_clave IS NOT NULL THEN
      SELECT * INTO v_ped FROM delivery_pedidos d
       WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
      IF FOUND THEN RETURN _tienda_pedido_creado(v_ped, true); END IF;
    END IF;
    RAISE;
  END;

  -- El cobro que se va a hacer enseguida: total + propina, a la cuenta que cobra. `vence_at` es
  -- hasta cuándo se espera su resultado si Mercado Pago no contestó (lo normal es saberlo al instante).
  IF v_en_linea THEN
    INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, propina_mxn, vence_at)
    VALUES (p_tenant, v_ped.id, v_conexion, v_total + v_propina, v_propina, now() + interval '5 minutes');
  END IF;

  RETURN _tienda_pedido_creado(v_ped, false);
END;
$$;
-- Los permisos son de la firma: la nueva nace con los de fábrica (EXECUTE para todos) y hay que
-- dejarla como estaba la anterior (0185): solo service_role.
REVOKE ALL ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb, uuid) TO service_role;

-- tienda_negocio: cuerpo copiado ÍNTEGRO de 0185 §4. Un cambio, marcado «-- 0187:»: cada sucursal
-- dice si tiene catálogo de colonias (`colonias`).
CREATE OR REPLACE FUNCTION tienda_negocio(p_slug text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c  tienda_config%ROWTYPE;
  v_t  record;
  v_sucursales jsonb;
BEGIN
  SELECT * INTO v_c FROM tienda_config WHERE slug = lower(btrim(COALESCE(p_slug, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT t.id, t.nombre_comercial INTO v_t
    FROM tenants t
   WHERE t.id = v_c.tenant_id AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE((modulos_efectivos(v_c.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'telefono', s.telefono,
           'direccion', NULLIF(concat_ws(', ',
                          NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                          s.direccion_colonia, s.ciudad), ''),
           'recoger', ts.recoger,
           'domicilio', ts.domicilio,
           'horario', ts.horario,
           'pago_en_linea', tienda_conexion_cobro(v_c.tenant_id, s.id) IS NOT NULL,
           -- La public key de la cuenta que cobra ahí (no es secreta): con ella se tokeniza la tarjeta.
           'public_key', (SELECT x.public_key FROM tienda_conexiones x WHERE x.id = tienda_conexion_cobro(v_c.tenant_id, s.id)),
           'estado', jsonb_build_object(
             'recoger',   tienda_estado_sucursal(s.id, 'RECOGER', p_ahora),
             'domicilio', tienda_estado_sucursal(s.id, 'DOMICILIO', p_ahora)),
           'envio', jsonb_build_object(
             'cobro', ts.cobro_envio,
             'tramos', CASE WHEN ts.cobro_envio = 'DISTANCIA' THEN COALESCE((
               SELECT jsonb_agg(tr - 'zona_id') FROM jsonb_array_elements(_tienda_tramos(s.id)) tr), '[]'::jsonb)
               ELSE '[]'::jsonb END,
             'punto', CASE WHEN ts.cobro_envio = 'DISTANCIA' AND s.geo_lat IS NOT NULL AND s.geo_lng IS NOT NULL
                           THEN jsonb_build_object('lat', s.geo_lat, 'lng', s.geo_lng) END),
           -- 0187: si tiene catálogo de colonias (la tienda sugiere y la colonia puede decidir el envío).
           'colonias', EXISTS (SELECT 1 FROM colonias c WHERE c.sucursal_id = s.id AND c.tenant_id = v_c.tenant_id AND c.deleted_at IS NULL),
           'zonas', CASE WHEN ts.cobro_envio = 'DISTANCIA' THEN '[]'::jsonb ELSE COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'costo_mxn', z.costo_mxn::text)
                              ORDER BY z.orden, z.nombre)
               FROM zonas_envio z
              WHERE z.sucursal_id = s.id AND z.tenant_id = v_c.tenant_id AND z.activa AND z.deleted_at IS NULL
                AND NOT ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text))),
             '[]'::jsonb) END)
         ORDER BY s.nombre), '[]'::jsonb)
    INTO v_sucursales
    FROM tienda_sucursales ts
    JOIN sucursales s ON s.id = ts.sucursal_id AND s.tenant_id = ts.tenant_id
   WHERE ts.tenant_id = v_c.tenant_id AND ts.participa AND s.activa AND s.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'tenant_id', v_c.tenant_id,
    'publico', jsonb_build_object(
      'slug', v_c.slug,
      'nombre', v_t.nombre_comercial,
      'logo_ruta', v_c.logo_ruta,
      'color', v_c.color,
      'descripcion', v_c.descripcion,
      'pago_efectivo', v_c.pago_efectivo,
      'pago_tarjeta', v_c.pago_tarjeta,
      'pago_en_linea', v_c.pago_en_linea,
      'pago_de_prueba', v_c.pago_de_prueba,
      'sucursales', v_sucursales));
END;
$$;
REVOKE ALL ON FUNCTION tienda_negocio(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_negocio(text, timestamptz) TO service_role;
