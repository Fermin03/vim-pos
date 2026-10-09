-- ============================================================================
-- 0162 — Tienda en línea, entrega 2: las funciones que usa la función pública `tienda`.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md (§7, §10)
--
-- Toda la lógica vive aquí y no en la Edge Function por dos razones: se prueba con smokes contra
-- un Postgres real, y la cotización tiene que dar el MISMO total que recalcular_totales_ticket al
-- centavo — crear_ticket_desde_tienda (0161) rechaza el pedido si no coincide.
--
-- Todas son SECURITY DEFINER y solo para service_role: el público nunca las llama; las llama la
-- Edge Function, que a su vez solo atiende al servidor de la tienda.
-- ============================================================================

-- ── §1 Estado de la tienda y datos del negocio ───────────────────────────────

-- ¿Cae p_ahora dentro del horario? p_horario: {"1": ["13:00","22:00"], …}, 1 = lunes … 7 = domingo.
-- Día ausente = cerrado. Cierre <= apertura = cierra pasada la medianoche (o, si son iguales, no
-- cierra). Cualquier cosa mal formada cuenta como cerrado: una tienda que no se sabe si abre, no abre.
CREATE OR REPLACE FUNCTION tienda_horario_abierto(p_horario jsonb, p_ahora timestamptz, p_tz text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local timestamp;
  v_hora  time;
  v_dow   integer;
  v_ayer  integer;
  v_a     time;
  v_c     time;
BEGIN
  IF p_horario IS NULL OR jsonb_typeof(p_horario) <> 'object' OR p_ahora IS NULL THEN RETURN false; END IF;
  v_local := p_ahora AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'America/Mexico_City');
  v_hora  := v_local::time;
  v_dow   := EXTRACT(isodow FROM v_local)::integer;
  v_ayer  := CASE WHEN v_dow = 1 THEN 7 ELSE v_dow - 1 END;

  -- El tramo de hoy.
  BEGIN
    v_a := (p_horario -> v_dow::text ->> 0)::time;
    v_c := (p_horario -> v_dow::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL THEN
    IF v_c > v_a  AND v_hora >= v_a AND v_hora < v_c THEN RETURN true; END IF;
    IF v_c <= v_a AND v_hora >= v_a THEN RETURN true; END IF;
  END IF;

  -- El tramo de ayer, si cruzó la medianoche.
  BEGIN
    v_a := (p_horario -> v_ayer::text ->> 0)::time;
    v_c := (p_horario -> v_ayer::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL AND v_c <= v_a AND v_hora < v_c THEN RETURN true; END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) TO service_role;

-- ¿Recibe pedidos esta sucursal en este modo? NULL = sí. Si no, el motivo, en este orden.
CREATE OR REPLACE FUNCTION tienda_estado_sucursal(p_sucursal uuid, p_modo text, p_ahora timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_suc  record;
  v_ts   tienda_sucursales%ROWTYPE;
BEGIN
  SELECT s.id, s.tenant_id, COALESCE(s.timezone, t.timezone) AS tz
    INTO v_suc
    FROM sucursales s JOIN tenants t ON t.id = s.tenant_id
   WHERE s.id = p_sucursal AND s.deleted_at IS NULL AND s.activa
     AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN 'TIENDA_NO_DISPONIBLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM tienda_config c WHERE c.tenant_id = v_suc.tenant_id)
     OR COALESCE((modulos_efectivos(v_suc.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN 'TIENDA_NO_DISPONIBLE';
  END IF;

  SELECT * INTO v_ts FROM tienda_sucursales WHERE sucursal_id = p_sucursal AND tenant_id = v_suc.tenant_id;
  IF NOT FOUND OR NOT v_ts.participa THEN RETURN 'NO_PARTICIPA'; END IF;

  IF p_modo = 'RECOGER' THEN
    IF NOT v_ts.recoger THEN RETURN 'MODO_NO_DISPONIBLE'; END IF;
  ELSIF p_modo = 'DOMICILIO' THEN
    IF NOT v_ts.domicilio
       OR NOT EXISTS (SELECT 1 FROM zonas_envio z
                       WHERE z.sucursal_id = p_sucursal AND z.tenant_id = v_suc.tenant_id
                         AND z.activa AND z.deleted_at IS NULL) THEN
      RETURN 'MODO_NO_DISPONIBLE';
    END IF;
  ELSE
    RETURN 'MODO_NO_DISPONIBLE';
  END IF;

  IF v_ts.pausa_hasta IS NOT NULL AND v_ts.pausa_hasta > p_ahora THEN RETURN 'EN_PAUSA'; END IF;
  IF NOT tienda_horario_abierto(v_ts.horario, p_ahora, v_suc.tz) THEN RETURN 'FUERA_DE_HORARIO'; END IF;
  IF NOT sucursal_recibe_pedidos(p_sucursal) THEN RETURN 'CAJA_NO_LISTA'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) TO service_role;

-- Lo que la tienda enseña del negocio. NULL = no hay tienda que enseñar (no existe, el negocio
-- está de baja o bloqueado, o no tiene el módulo). La Edge Function responde igual en los tres
-- casos: no se confirma qué direcciones existen.
-- Devuelve {tenant_id, publico: {…}}: `tenant_id` es para la función, que NUNCA lo manda al cliente.
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

  SELECT t.id, t.nombre_comercial, t.logo_png_url INTO v_t
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
      'logo_url', v_t.logo_png_url,
      'color', v_c.color,
      'descripcion', v_c.descripcion,
      'pago_efectivo', v_c.pago_efectivo,
      'pago_tarjeta', v_c.pago_tarjeta,
      'sucursales', v_sucursales));
END;
$$;
REVOKE ALL ON FUNCTION tienda_negocio(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_negocio(text, timestamptz) TO service_role;
