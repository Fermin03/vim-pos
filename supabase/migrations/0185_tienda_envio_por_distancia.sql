-- 0185 · Tienda en línea: costo de envío por distancia.
--
-- Una sucursal cobra el envío de la tienda «Por zonas» (como hasta hoy, y lo que queda en todas las
-- sucursales existentes) o «Por distancia»: tramos «hasta X km → $Y». El cliente pone un pin en el
-- mapa; la BASE calcula la distancia (haversine × 1.3, que aproxima la distancia en calles) y el
-- precio. Del teléfono solo llega el punto; un envío que mande el cliente no se lee nunca.
--
-- CÓMO LLEGA A LA CAJA SIN INSTALADOR NUEVO. La caja instalada crea el ticket con SU copia de
-- crear_ticket_desde_tienda (0173), que exige una zona de envío de la sucursal, activa, y que
-- repreciará su renglón al `envio_mxn` cotizado. Por eso CADA TRAMO ES UNA ZONA DE ENVÍO (nombre
-- «Hasta 3 km», costo = precio del tramo) que crea y mantiene tienda_guardar_envio: la zona baja a
-- la caja por el pull de siempre, el pedido lleva la zona de su tramo, y el ticket, los reportes por
-- zona y el POS («Hasta 3 km · $35» para un pedido por teléfono) funcionan como con cualquier zona.
-- Qué zona es de qué tramo lo dice tienda_sucursales.tramos_envio ([{hasta_km, zona_id}], en orden):
-- vive en una tabla que NO viaja a la caja, así que una caja vieja que repreció la zona no la
-- puede romper (el precio sí es el de la zona: el repreciado vale para la tienda también).
-- La distancia llega a la caja dentro de `direccion.referencias` («A 3.2 km · …»), que la caja ya
-- guarda en la dirección del cliente y ya pinta y ya imprime en el ticket.
--
-- DATO PERSONAL. El punto del cliente va dentro de delivery_pedidos.direccion (claves lat y lng):
-- la purga de los 30 días (delivery_anonimizar_pedidos_viejos) ya pone esa columna en NULL, así que
-- se va con la dirección sin tocar la purga. La distancia (envio_distancia_km) se conserva.
--
-- Cambian (cuerpos copiados de su versión vigente, con solo los cambios dichos en cada una):
--   · tienda_estado_sucursal (0162): a domicilio «Por distancia» exige tramos válidos y el punto de
--     la sucursal; «Por zonas» no cuenta las zonas de los tramos.
--   · tienda_negocio (0178): cada sucursal dice cómo cobra el envío (`envio`); sus zonas no incluyen
--     las de los tramos, y «Por distancia» no enseña zonas.
--   · tienda_cotizar (0162): nuevo parámetro p_punto, AL FINAL y con valor por omisión.
--   · tienda_crear_pedido (0174): nuevo parámetro p_punto, AL FINAL y con valor por omisión.
-- Las dos firmas cambian: la anterior se borra (con dos, PostgREST no sabría a cuál llamar).
--
-- ORDEN DE DESPLIEGUE: 1) esta migración → 2) la función `tienda` → 3) la web de la tienda →
-- 4) el admin. Con la migración sola nada cambia: todas las sucursales nacen «Por zonas», y la
-- función de hoy llama sin p_punto (por nombre), que es exactamente la llamada de antes.
--
-- Corre también en el Postgres de la caja (sin Vault, pg_net ni pg_cron): no usa ninguno.

-- ── §1 Esquema ───────────────────────────────────────────────────────────────
ALTER TABLE tienda_sucursales
  ADD COLUMN IF NOT EXISTS cobro_envio  text  NOT NULL DEFAULT 'ZONAS' CHECK (cobro_envio IN ('ZONAS', 'DISTANCIA')),
  ADD COLUMN IF NOT EXISTS tramos_envio jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tramos_envio) = 'array');
COMMENT ON COLUMN tienda_sucursales.cobro_envio IS
  'Cómo cobra el envío la tienda en línea en esta sucursal: ZONAS (el cliente elige su zona) o DISTANCIA (tramos por km desde el punto del cliente).';
COMMENT ON COLUMN tienda_sucursales.tramos_envio IS
  '[{hasta_km, zona_id}] en orden creciente. Cada tramo es una zona de envío (su precio es el de la zona). Solo la escribe tienda_guardar_envio.';

ALTER TABLE delivery_pedidos
  ADD COLUMN IF NOT EXISTS envio_distancia_km numeric(5,1) NULL CHECK (envio_distancia_km IS NULL OR envio_distancia_km >= 0);
COMMENT ON COLUMN delivery_pedidos.envio_distancia_km IS
  'Solo tienda a domicilio «Por distancia»: la distancia que calculó la base (haversine × 1.3, en km, un decimal). El punto va en direccion (lat, lng) y se purga con ella.';

-- ── §2 Las piezas puras ──────────────────────────────────────────────────────

-- Distancia aproximada EN CALLES entre dos puntos, en km con un decimal. La tienda la repite en el
-- teléfono (app/lib/distancia.ts) solo para enseñarla mientras se mueve el pin: la que cobra es esta.
CREATE OR REPLACE FUNCTION _tienda_distancia_km(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  c_radio_tierra_km CONSTANT double precision := 6371.0088;   -- radio medio de la Tierra
  -- La línea recta se queda corta: las calles no van en línea recta. 1.3 es el factor de rodeo
  -- usual en ciudad; con él, «3 km en el mapa» se cobra como los ~3.9 km que de verdad se manejan.
  c_factor_calles   CONSTANT double precision := 1.3;
  v_a double precision;
BEGIN
  v_a := power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
       + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
         * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2);
  RETURN round((2 * c_radio_tierra_km * asin(least(1, sqrt(v_a))) * c_factor_calles)::numeric, 1);
END;
$$;
REVOKE ALL ON FUNCTION _tienda_distancia_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- Un punto {lat, lng} como lo manda alguien de fuera: dos NÚMEROS JSON dentro de rango, redondeados
-- a 6 decimales (los de sucursales.geo_lat/geo_lng). Cualquier otra cosa: NULL. Las demás claves no entran.
CREATE OR REPLACE FUNCTION _tienda_punto(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p -> 'lat') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p -> 'lng') IS DISTINCT FROM 'number' THEN
    RETURN NULL;
  END IF;
  v_lat := round((p ->> 'lat')::numeric, 6);
  v_lng := round((p ->> 'lng')::numeric, 6);
  IF v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('lat', v_lat, 'lng', v_lng);
END;
$$;
REVOKE ALL ON FUNCTION _tienda_punto(jsonb) FROM PUBLIC, anon, authenticated;

-- Los tramos VIGENTES de una sucursal, con su precio: [{hasta_km, costo_mxn, zona_id}] (importes y
-- km como texto), en orden. NULL si no hay tramos o si uno solo no cuadra: menos de 1 o más de 20,
-- km fuera de (0, 50] o con más de un decimal, km que no crece, o una zona que ya no es de la
-- sucursal, está inactiva o se borró. Falla cerrada: con NULL, «Por distancia» no recibe a domicilio.
-- Lo que se escribió con tienda_guardar_envio cumple todo esto; aquí se vuelve a mirar porque el
-- dueño puede escribir la fila con su sesión y porque la zona se puede tocar desde el POS.
CREATE OR REPLACE FUNCTION _tienda_tramos(p_sucursal uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ts      tienda_sucursales%ROWTYPE;
  v_ok      boolean;
  v_tramos  jsonb;
BEGIN
  SELECT * INTO v_ts FROM tienda_sucursales WHERE sucursal_id = p_sucursal;
  IF NOT FOUND OR jsonb_array_length(v_ts.tramos_envio) NOT BETWEEN 1 AND 20 THEN RETURN NULL; END IF;

  WITH t AS (
    SELECT e.ord,
           CASE WHEN jsonb_typeof(e.x -> 'hasta_km') IN ('string', 'number') AND (e.x ->> 'hasta_km') ~ '^[0-9]{1,2}(\.[0-9])?$'
                THEN (e.x ->> 'hasta_km')::numeric END AS km,
           CASE WHEN (e.x ->> 'zona_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (e.x ->> 'zona_id')::uuid END AS zona_id
      FROM jsonb_array_elements(v_ts.tramos_envio) WITH ORDINALITY AS e(x, ord)
  ),
  j AS (
    SELECT t.ord, t.km, z.id AS zona_id, z.costo_mxn, lag(t.km) OVER (ORDER BY t.ord) AS anterior
      FROM t
      LEFT JOIN zonas_envio z
             ON z.id = t.zona_id AND z.tenant_id = v_ts.tenant_id AND z.sucursal_id = p_sucursal
            AND z.activa AND z.deleted_at IS NULL
  )
  SELECT bool_and(km IS NOT NULL AND km > 0 AND km <= 50 AND zona_id IS NOT NULL AND (anterior IS NULL OR km > anterior)),
         jsonb_agg(jsonb_build_object('hasta_km', to_char(km, 'FM990.0'),
                                      'costo_mxn', to_char(costo_mxn, 'FM999999990.00'),
                                      'zona_id', zona_id) ORDER BY ord)
    INTO v_ok, v_tramos
    FROM j;
  RETURN CASE WHEN v_ok THEN v_tramos END;
END;
$$;
REVOKE ALL ON FUNCTION _tienda_tramos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _tienda_tramos(uuid) TO service_role;

-- ── §3 Estado de la sucursal ─────────────────────────────────────────────────
-- tienda_estado_sucursal: cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql §1. Un solo cambio, en
-- la rama DOMICILIO: «Por distancia» pide tramos válidos y el punto de la sucursal; «Por zonas»
-- pide una zona activa que NO sea de un tramo (las de los tramos no se eligen a mano en la tienda).
CREATE OR REPLACE FUNCTION tienda_estado_sucursal(p_sucursal uuid, p_modo text, p_ahora timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_suc  record;
  v_ts   tienda_sucursales%ROWTYPE;
BEGIN
  SELECT s.id, s.tenant_id, COALESCE(s.timezone, t.timezone) AS tz, s.geo_lat, s.geo_lng
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
    IF NOT v_ts.domicilio THEN RETURN 'MODO_NO_DISPONIBLE'; END IF;
    IF v_ts.cobro_envio = 'DISTANCIA' THEN
      IF v_suc.geo_lat IS NULL OR v_suc.geo_lng IS NULL OR _tienda_tramos(p_sucursal) IS NULL THEN
        RETURN 'MODO_NO_DISPONIBLE';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM zonas_envio z
                       WHERE z.sucursal_id = p_sucursal AND z.tenant_id = v_suc.tenant_id
                         AND z.activa AND z.deleted_at IS NULL
                         AND NOT v_ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text))) THEN
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

-- ── §4 Lo que la tienda enseña ───────────────────────────────────────────────
-- tienda_negocio: cuerpo copiado ÍNTEGRO de 0178_tienda_modo_de_prueba_y_freno.sql. Dos cambios en
-- cada sucursal:
--   · clave nueva `envio`: {cobro, tramos: [{hasta_km, costo_mxn}], punto: {lat, lng} | null}. Los
--     tramos y el punto de la sucursal no son secretos (con ellos la tienda enseña el precio
--     mientras se mueve el pin); el id de la zona de cada tramo no sale.
--   · `zonas`: «Por distancia», ninguna; «Por zonas», las de siempre menos las de los tramos.
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

-- ── §5 La cotización ─────────────────────────────────────────────────────────
-- tienda_cotizar: cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql §3. Cambios:
--   · parámetro nuevo p_punto (al final, NULL por omisión): {lat, lng} del pin del cliente;
--   · el bloque DOMICILIO elige el envío según cómo cobre la sucursal:
--       «Por zonas»: como antes (la zona que eligió el cliente), y una zona de tramo no vale;
--       «Por distancia»: no se acepta zona; sin punto, el envío todavía no se sabe (0, y
--         distancia_km null: para enseñar el carrito); con punto, distancia y primer tramo que la
--         alcanza (límite >= distancia); ninguno: FUERA_DE_AREA con la distancia. Un punto mal
--         formado o a más de c_alcance_km de la sucursal: UBICACION_INVALIDA;
--   · devuelve además `cobro`, `distancia_km` (texto con un decimal o null) y `zona_id` (interno:
--     la zona que llevará el pedido; la función `tienda` no lo enseña).
DROP FUNCTION IF EXISTS tienda_cotizar(uuid, uuid, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION tienda_cotizar(p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
                                          p_punto jsonb DEFAULT NULL)
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;

  IF p_modo = 'DOMICILIO' THEN
    SELECT * INTO v_ts FROM tienda_sucursales ts WHERE ts.sucursal_id = p_sucursal AND ts.tenant_id = p_tenant;
    IF v_ts.cobro_envio IS NOT DISTINCT FROM 'DISTANCIA' THEN
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
    'cobro', CASE WHEN p_modo = 'DOMICILIO' THEN COALESCE(v_ts.cobro_envio, 'ZONAS') END,
    'distancia_km', to_char(v_dist, 'FM99990.0'),
    'zona_id', CASE WHEN p_modo = 'DOMICILIO' THEN v_zona END);
END;
$$;
REVOKE ALL ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb) TO service_role;

-- ── §6 El alta del pedido ────────────────────────────────────────────────────
-- tienda_crear_pedido: cuerpo copiado ÍNTEGRO de 0174_tienda_propina_otro_monto.sql. Cambios:
--   · parámetro nuevo p_punto (al final, NULL por omisión), que va a la cotización;
--   · paso 4: «Por distancia» a domicilio sin una ubicación válida no se pide (UBICACION_INVALIDA);
--     va antes de comparar el total, que sin ubicación no lleva envío;
--   · paso 6: «Por distancia», la dirección guarda además el punto (lat, lng) y sus referencias
--     empiezan con la distancia («A 3.2 km · …»), que es lo que la caja ya pinta e imprime;
--   · paso 10: la zona del pedido es la que dio la cotización (la del tramo, por distancia; la que
--     eligió el cliente, por zonas: es la misma p_zona) y se guarda la distancia.
DROP FUNCTION IF EXISTS tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric);
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
  p_punto jsonb DEFAULT NULL)          -- solo a domicilio «Por distancia»: {lat, lng} del pin del cliente
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
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items, p_punto);
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
-- dejarla como estaba la anterior (0174): solo service_role.
REVOKE ALL ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb) TO service_role;

-- ── §7 Lo que guarda el dueño ────────────────────────────────────────────────
-- «Envío a domicilio» de una sucursal, desde el admin, con la sesión del dueño o de un administrador
-- de ESE negocio. Todo en una transacción: el modo, los tramos con sus zonas y, si viene, el punto
-- de la sucursal (sucursales.geo_lat/geo_lng).
--   · p_cobro: 'ZONAS' | 'DISTANCIA'. «Por distancia» exige al menos un tramo y el punto.
--   · p_tramos: [{hasta_km: '3.5', costo_mxn: '35.00'}] como TEXTO (dinero nunca en float), de 0 a
--     20, km de 0.1 a 50 con un decimal y estrictamente crecientes, costo de 0 a 9999.99 con dos.
--   · p_punto: {lat, lng} o NULL (no se toca el punto).
-- Las zonas de los tramos: un tramo con el MISMO km que uno vigente conserva su zona (solo cambia el
-- precio: una zona nunca se renombra, porque la caja reconcilia las zonas por nombre); uno nuevo
-- crea su zona «Hasta X km»; la zona de un tramo que se quitó se da de baja (lógica, como en el
-- admin). Activas solo «Por distancia»: «Por zonas» no se ofrecen ni en la tienda ni en el POS.
-- Devuelve lo guardado: {cobro, tramos: [{hasta_km, costo_mxn}], punto}.
CREATE OR REPLACE FUNCTION tienda_guardar_envio(p_sucursal uuid, p_cobro text, p_tramos jsonb, p_punto jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_ts      tienda_sucursales%ROWTYPE;
  v_punto   jsonb;
  v_ok      boolean;
  v_n       integer;
  v_t       record;
  v_zona    uuid;
  v_nombre  text;
  v_nuevos  jsonb := '[]'::jsonb;
  v_suc     record;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: solo el dueño o un administrador puede cambiar el envío';
  END IF;
  SELECT * INTO v_ts FROM tienda_sucursales WHERE sucursal_id = p_sucursal AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUCURSAL_INVALIDA: la sucursal no está en tu tienda'; END IF;
  IF p_cobro IS NULL OR p_cobro NOT IN ('ZONAS', 'DISTANCIA') THEN
    RAISE EXCEPTION 'COBRO_INVALIDO: el envío se cobra por zonas o por distancia';
  END IF;

  IF p_punto IS NOT NULL AND p_punto <> 'null'::jsonb THEN
    v_punto := _tienda_punto(p_punto);
    IF v_punto IS NULL THEN RAISE EXCEPTION 'UBICACION_INVALIDA: el punto de la sucursal no es válido'; END IF;
    UPDATE sucursales SET geo_lat = (v_punto ->> 'lat')::numeric, geo_lng = (v_punto ->> 'lng')::numeric, updated_at = now()
     WHERE id = p_sucursal AND tenant_id = v_tenant;
  END IF;

  -- Los tramos: la forma exacta, o nada.
  IF jsonb_typeof(p_tramos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tramos) > 20 THEN
    RAISE EXCEPTION 'TRAMOS_INVALIDOS: los tramos son una lista de hasta 20';
  END IF;
  WITH t AS (
    SELECT e.ord,
           CASE WHEN jsonb_typeof(e.x -> 'hasta_km') = 'string' AND (e.x ->> 'hasta_km') ~ '^[0-9]{1,2}(\.[0-9])?$'
                THEN (e.x ->> 'hasta_km')::numeric END AS km,
           CASE WHEN jsonb_typeof(e.x -> 'costo_mxn') = 'string' AND (e.x ->> 'costo_mxn') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
                THEN (e.x ->> 'costo_mxn')::numeric END AS costo
      FROM jsonb_array_elements(p_tramos) WITH ORDINALITY AS e(x, ord)
  )
  SELECT COALESCE(bool_and(km IS NOT NULL AND km > 0 AND km <= 50 AND costo IS NOT NULL
                           AND (anterior IS NULL OR km > anterior)), true), count(*)
    INTO v_ok, v_n
    FROM (SELECT t.*, lag(t.km) OVER (ORDER BY t.ord) AS anterior FROM t) x;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'TRAMOS_INVALIDOS: cada tramo va hasta 0.1 a 50 km (un decimal), cada uno más lejos que el anterior, y cuesta de $0 a $9,999.99';
  END IF;

  SELECT geo_lat, geo_lng INTO v_suc FROM sucursales WHERE id = p_sucursal;
  IF p_cobro = 'DISTANCIA' AND (v_n = 0 OR v_suc.geo_lat IS NULL OR v_suc.geo_lng IS NULL) THEN
    RAISE EXCEPTION 'DISTANCIA_INCOMPLETA: por distancia hacen falta al menos un tramo y el punto de la sucursal';
  END IF;

  -- Las zonas, tramo por tramo.
  FOR v_t IN SELECT e.ord, (e.x ->> 'hasta_km')::numeric AS km, (e.x ->> 'costo_mxn')::numeric AS costo
               FROM jsonb_array_elements(p_tramos) WITH ORDINALITY AS e(x, ord) ORDER BY e.ord LOOP
    SELECT z.id INTO v_zona
      FROM jsonb_array_elements(v_ts.tramos_envio) v
      JOIN zonas_envio z ON z.id::text = v ->> 'zona_id' AND z.tenant_id = v_tenant AND z.sucursal_id = p_sucursal AND z.deleted_at IS NULL
     WHERE (v ->> 'hasta_km') ~ '^[0-9]{1,2}(\.[0-9])?$' AND (v ->> 'hasta_km')::numeric = v_t.km
     LIMIT 1;
    IF v_zona IS NULL THEN
      -- «Hasta 3 km», «Hasta 3.5 km».
      v_nombre := 'Hasta ' || rtrim(rtrim(to_char(v_t.km, 'FM990.0'), '0'), '.') || ' km';
      IF EXISTS (SELECT 1 FROM zonas_envio z WHERE z.sucursal_id = p_sucursal AND z.deleted_at IS NULL
                                               AND lower(btrim(z.nombre)) = lower(v_nombre)) THEN
        RAISE EXCEPTION 'ZONA_OCUPADA: ya tienes una zona llamada «%»; cámbiale el nombre en Zonas de envío', v_nombre;
      END IF;
      INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn, orden, activa)
      VALUES (v_tenant, p_sucursal, v_nombre, v_t.costo, 1000 + v_t.ord, p_cobro = 'DISTANCIA')
      RETURNING id INTO v_zona;
    ELSE
      UPDATE zonas_envio SET costo_mxn = v_t.costo, orden = 1000 + v_t.ord, activa = (p_cobro = 'DISTANCIA'), updated_at = now()
       WHERE id = v_zona;
    END IF;
    v_nuevos := v_nuevos || jsonb_build_array(jsonb_build_object('hasta_km', to_char(v_t.km, 'FM990.0'), 'zona_id', v_zona));
    v_zona := NULL;
  END LOOP;

  -- Las zonas de los tramos que ya no están: baja lógica (tickets y direcciones siguen apuntando a ellas).
  UPDATE zonas_envio z SET activa = false, deleted_at = now(), updated_at = now()
   WHERE z.tenant_id = v_tenant AND z.sucursal_id = p_sucursal AND z.deleted_at IS NULL
     AND v_ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text))
     AND NOT v_nuevos @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text));

  UPDATE tienda_sucursales SET cobro_envio = p_cobro, tramos_envio = v_nuevos, updated_at = now()
   WHERE sucursal_id = p_sucursal AND tenant_id = v_tenant;

  SELECT geo_lat, geo_lng INTO v_suc FROM sucursales WHERE id = p_sucursal;
  RETURN jsonb_build_object(
    'cobro', p_cobro,
    'tramos', COALESCE((SELECT jsonb_agg(jsonb_build_object('hasta_km', x ->> 'hasta_km',
                                                             'costo_mxn', to_char(z.costo_mxn, 'FM999999990.00')) ORDER BY e.ord)
                          FROM jsonb_array_elements(v_nuevos) WITH ORDINALITY AS e(x, ord)
                          JOIN zonas_envio z ON z.id = (x ->> 'zona_id')::uuid), '[]'::jsonb),
    'punto', CASE WHEN v_suc.geo_lat IS NOT NULL AND v_suc.geo_lng IS NOT NULL
                  THEN jsonb_build_object('lat', v_suc.geo_lat, 'lng', v_suc.geo_lng) END);
END;
$$;
REVOKE ALL ON FUNCTION tienda_guardar_envio(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tienda_guardar_envio(uuid, text, jsonb, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION tienda_guardar_envio(uuid, text, jsonb, jsonb) IS
  'El dueño guarda cómo cobra el envío la tienda en una sucursal: por zonas o por distancia (tramos, cada uno una zona de envío), y el punto de la sucursal.';
