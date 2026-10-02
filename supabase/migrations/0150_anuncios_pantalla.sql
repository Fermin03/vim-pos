-- ============================================================================
-- 0150 — Anuncios de la pantalla del cliente (ADR 0026, entrega 2).
--
-- La pantalla que mira el cliente enseña anuncios cuando nadie está capturando. Las imágenes van
-- al almacén `anuncios` y aquí solo queda la LISTA: qué imagen, en qué orden y si está activa.
--
-- POR QUÉ NO VIAJAN DENTRO DEL SYNC, COMO EL LOGO
-- El logo es un data URI en `tenants` porque tiene que imprimirse sin internet y pesa poco. Diez
-- imágenes a pantalla completa en cada snapshot serían megas en cada ciclo de cada caja. El
-- snapshot lleva solo estas filas; la caja descarga cada imagen una vez y la guarda en disco.
--
-- POR QUÉ `deleted_at` Y NO DELETE
-- El pull no trae lápidas: una fila borrada en la nube se queda viva en la caja para siempre. La
-- baja lógica sí viaja.
-- ============================================================================

CREATE TABLE IF NOT EXISTS anuncios_pantalla (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  -- Ruta dentro del almacén `anuncios`: <tenant_id>/<uuid>.<ext> (la forma exacta la fija anuncios_pantalla_ruta_chk).
  ruta        text NOT NULL,
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  -- Tiempo propio de este anuncio. NULL = usa el general (configuracion_tenant.pantalla_cliente_segundos).
  segundos    integer NULL CHECK (segundos BETWEEN 3 AND 60),
  ancho       integer NULL CHECK (ancho > 0),
  alto        integer NULL CHECK (alto > 0),
  bytes       integer NULL CHECK (bytes > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL,
  -- La ruta es exactamente lo que escribe la app: carpeta = SU negocio, archivo = <uuid>.<jpg|png|webp>.
  -- Sin esto un admin podría apuntar una fila a la carpeta de otro negocio, o a `../x`.
  CONSTRAINT anuncios_pantalla_ruta_chk CHECK (
    ruta ~ ('^' || tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
  )
);

COMMENT ON TABLE anuncios_pantalla IS 'Imágenes que la pantalla del cliente muestra en reposo. La imagen vive en el almacén `anuncios`; aquí va la lista. Por negocio, no por sucursal.';

-- Sin filtro por deleted_at a propósito: catalogo_version() tiene que notar también las bajas.
CREATE INDEX IF NOT EXISTS idx_anuncios_pantalla_version
  ON anuncios_pantalla (tenant_id, updated_at DESC);

ALTER TABLE anuncios_pantalla ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON anuncios_pantalla TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_select ON anuncios_pantalla
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Administrar anuncios es cosa del dueño o del admin, no de cualquier empleado con sesión.
DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_insert ON anuncios_pantalla
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_update ON anuncios_pantalla
    FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_delete ON anuncios_pantalla
    FOR DELETE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_anuncios_pantalla_updated_at ON anuncios_pantalla;
CREATE TRIGGER trg_anuncios_pantalla_updated_at
  BEFORE UPDATE ON anuncios_pantalla
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tope de 10 vivos por negocio. En la base y no solo en la página: el contador del admin es una
-- cortesía; esto es la regla. El candado por negocio evita que dos subidas a la vez pasen las dos.
CREATE OR REPLACE FUNCTION anuncios_pantalla_tope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_vivos integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('anuncios_pantalla:' || NEW.tenant_id::text, 0));
  SELECT count(*) INTO v_vivos FROM anuncios_pantalla
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND id <> NEW.id;
  IF v_vivos >= 10 THEN
    RAISE EXCEPTION 'Ya hay 10 anuncios. Quita uno para subir otro.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_anuncios_pantalla_tope ON anuncios_pantalla;
CREATE TRIGGER trg_anuncios_pantalla_tope
  BEFORE INSERT OR UPDATE OF deleted_at ON anuncios_pantalla
  FOR EACH ROW EXECUTE FUNCTION anuncios_pantalla_tope();

-- Segundos que dura cada imagen. En configuracion_tenant porque esa fila ya baja a la caja.
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS pantalla_cliente_segundos integer NOT NULL DEFAULT 8;
DO $$ BEGIN
  ALTER TABLE configuracion_tenant ADD CONSTRAINT configuracion_tenant_pantalla_segundos_chk
    CHECK (pantalla_cliente_segundos BETWEEN 3 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Almacén ─────────────────────────────────────────────────────────────────
-- Público para leer: son anuncios, y la caja los descarga sin sesión. En el Postgres embebido de
-- la caja no hay `storage.buckets` (mismo criterio que la 0098): el bloque se omite.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('anuncios', 'anuncios', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Leer la carpeta propia. SIN ESTA POLÍTICA EL DELETE DE ABAJO NUNCA ENCUENTRA UNA FILA: borrar con
-- WHERE solo alcanza lo que las políticas de SELECT dejan ver, y remove() del cliente falla en
-- silencio. No abre nada: cada negocio solo ve su carpeta, y la lectura pública por URL no depende
-- de esta política.
DO $$ BEGIN
  CREATE POLICY "anuncios_read_own_tenant" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'anuncios'
      AND (storage.foldername(name))[1] = current_tenant_id()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Escribir y borrar: solo el dueño o el admin, y solo dentro de la carpeta de su negocio.
DO $$ BEGIN
  CREATE POLICY "anuncios_write_own_tenant" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'anuncios'
      AND (storage.foldername(name))[1] = current_tenant_id()::text
      AND es_admin_del_tenant(current_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anuncios_delete_own_tenant" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'anuncios'
      AND (storage.foldername(name))[1] = current_tenant_id()::text
      AND es_admin_del_tenant(current_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- sync_pull_snapshot: copia íntegra de la vigente (0136_limites_y_sync_pull.sql §2) con UNA clave
-- más: anuncios_pantalla. No se toca nada más, en particular la condición del hash de 'users'.
-- ============================================================================
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

-- ============================================================================
-- catalogo_version(): un anuncio nuevo, reordenado o dado de baja también es "el catálogo cambió",
-- y también un cambio de los segundos por imagen (configuracion_tenant.updated_at).
-- Sin esto un anuncio nuevo tardaría hasta una hora en llegar a la caja en vez de un minuto.
-- Copia íntegra de la vigente (0116_zonas_envio.sql) con dos líneas más.
-- ============================================================================
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores),
    (SELECT max(updated_at) FROM combo_grupos),
    (SELECT max(updated_at) FROM combo_opciones),
    (SELECT max(updated_at) FROM zonas_envio),
    (SELECT max(updated_at) FROM anuncios_pantalla),
    (SELECT max(updated_at) FROM configuracion_tenant)
  );
$$;
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;
