-- ============================================================================
-- 0163 — Tienda en línea, entrega 3: lo que el apartado del admin necesita de la base.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md (§9, §5.3, §5.7)
--
-- Cuatro cosas: el logo propio de la tienda, más direcciones reservadas, las guardas del
-- interruptor (molde de Lealtad, 0156) y tienda_negocio con la ruta del logo.
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.*.
-- ============================================================================

-- ── §1 El logo de la tienda ──────────────────────────────────────────────────
-- El logo que el negocio ya tiene (tenants.logo_png_url, 0080) va incrustado como data URI de
-- hasta 512 KB: sirve para el ticket, no para mandarlo en cada carga de una tienda pública. El de
-- la tienda es un archivo del almacén `productos` (0161), y aquí se guarda SU RUTA, no una
-- dirección: `<tenant_id>/<uuid>.(jpg|png|webp)`, las mismas tres extensiones que admite el almacén.
-- La restricción amarra la ruta a la carpeta del propio negocio: sin eso, un dueño podría apuntar
-- su tienda al archivo de otro. Con nombre propio: el admin traduce el error por ese nombre.
ALTER TABLE tienda_config ADD COLUMN IF NOT EXISTS logo_ruta text NULL;
ALTER TABLE tienda_config DROP CONSTRAINT IF EXISTS tienda_config_logo_ruta_check;
ALTER TABLE tienda_config ADD CONSTRAINT tienda_config_logo_ruta_check CHECK (
  logo_ruta IS NULL
  OR logo_ruta ~ ('^' || tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'));
COMMENT ON COLUMN tienda_config.logo_ruta IS
  'Ruta del logo de la tienda dentro del almacén `productos`: <tenant_id>/<uuid>.(jpg|png|webp). NULL = sin logo. La dirección pública la arma quien la consume.';

-- ── §2 Más direcciones reservadas ────────────────────────────────────────────
-- A las ocho de la 0161 (rutas de la aplicación) se suman ocho que parecerían oficiales de VIM.
-- El formato NO cambia. La restricción de la 0161 era anónima y Postgres la llamó
-- tienda_config_slug_check: se repone con ESE nombre, que es por el que el admin traduce el error.
ALTER TABLE tienda_config DROP CONSTRAINT IF EXISTS tienda_config_slug_check;
ALTER TABLE tienda_config ADD CONSTRAINT tienda_config_slug_check CHECK (
  slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
  AND slug NOT IN ('api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets',
                   'vim', 'vimpos', 'soporte', 'login', 'pago', 'ayuda', 'www', 'tienda'));

-- ── §3 Las guardas del interruptor ───────────────────────────────────────────
-- Molde de configuracion_tenant_lealtad_guardia (0156). Encender exige complemento vigente y la
-- tienda configurada; apagar siempre se puede. SECURITY DEFINER porque tenant_addon_activo es
-- exclusiva de service_role desde la 0132.
-- En la caja el pull va en modo réplica y este disparador no se dispara: el valor llega tal cual.
CREATE OR REPLACE FUNCTION configuracion_tenant_tienda_guardia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.modulo_tienda_activo IS NOT DISTINCT FROM OLD.modulo_tienda_activo THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.modulo_tienda_activo = false THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'authenticated' AND NOT es_admin_del_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede encender o apagar la tienda en línea.' USING ERRCODE = '42501';
  END IF;

  IF NEW.modulo_tienda_activo THEN
    IF NOT tenant_addon_activo(NEW.tenant_id, 'TIENDA') THEN
      RAISE EXCEPTION 'SIN_ADDON_TIENDA' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tienda_config WHERE tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'SIN_TIENDA_CONFIGURADA' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_tienda_guardia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_tienda_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_tienda_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_tienda_guardia();

-- Retirar el complemento apaga el interruptor (molde de tenant_addons_apaga_lealtad, 0156).
-- Como allá, solo lo dispara la baja (`activo` a false): un complemento que vence por fecha deja de
-- contar en modulos_efectivos sin pasar por aquí, y el interruptor se queda como estaba.
CREATE OR REPLACE FUNCTION tenant_addons_apaga_tienda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activo AND NOT NEW.activo
     AND NEW.addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA')
     AND NOT tenant_addon_activo(NEW.tenant_id, 'TIENDA') THEN
    UPDATE configuracion_tenant SET modulo_tienda_activo = false
     WHERE tenant_id = NEW.tenant_id AND modulo_tienda_activo;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tenant_addons_apaga_tienda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenant_addons_apaga_tienda ON tenant_addons;
CREATE TRIGGER trg_tenant_addons_apaga_tienda
  AFTER UPDATE OF activo ON tenant_addons
  FOR EACH ROW EXECUTE FUNCTION tenant_addons_apaga_tienda();

-- ── §4 tienda_negocio con el logo de la tienda ───────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql. Un cambio: la clave `logo_url` (que leía
-- tenants.logo_png_url) se sustituye por `logo_ruta`, la ruta guardada en tienda_config, o null.
-- Se devuelve la RUTA y no la dirección pública porque dentro de SQL no hay forma limpia de saber
-- la dirección del proyecto: lo único parecido es el secreto de Vault `vim_functions_url` (0097),
-- que apunta a /functions/v1 y no existe en la caja. La dirección la arma quien la consume:
-- <SUPABASE_URL>/storage/v1/object/public/productos/<logo_ruta>.
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
           'estado', jsonb_build_object(
             'recoger',   tienda_estado_sucursal(s.id, 'RECOGER', p_ahora),
             'domicilio', tienda_estado_sucursal(s.id, 'DOMICILIO', p_ahora)),
           'zonas', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'costo_mxn', z.costo_mxn::text)
                              ORDER BY z.orden, z.nombre)
               FROM zonas_envio z
              WHERE z.sucursal_id = s.id AND z.tenant_id = v_c.tenant_id AND z.activa AND z.deleted_at IS NULL),
             '[]'::jsonb))
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
      'sucursales', v_sucursales));
END;
$$;
REVOKE ALL ON FUNCTION tienda_negocio(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_negocio(text, timestamptz) TO service_role;
