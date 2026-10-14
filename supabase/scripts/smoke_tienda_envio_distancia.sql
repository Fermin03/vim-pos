-- Smoke tienda en línea, envío por distancia (mig. 0179).
-- Cubre: el cálculo puro (haversine × 1.3, un decimal), lo que guarda el dueño (tramos = zonas,
-- validación, permisos, zonas que se conservan, se crean y se dan de baja), el estado y lo que enseña
-- la tienda, la cotización por distancia (bordes del tramo, fuera de área, ubicación basura), el alta
-- del pedido (ubicación obligatoria, el envío lo pone la base y no el cliente, punto y distancia en la
-- dirección), la vuelta hasta el ticket (que es lo que hace la caja instalada con su copia de
-- crear_ticket_desde_tienda), la purga del punto a los 30 días y que «Por zonas» sigue igual.
-- Puntos de prueba: al norte de la sucursal (21.1223, -101.6824); cada uno da, en calles, la
-- distancia anotada (calculada aparte con la misma fórmula).
-- Uso: cd desktop && npm run smokes -- smoke_tienda_envio_distancia.sql
\set ON_ERROR_STOP on
BEGIN;

-- El código del error de una sentencia (lo que va antes de los dos puntos), o NULL si no falló.
CREATE FUNCTION pg_temp.error_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';   -- cajera
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '64646464-0000-0000-0000-0000000000d1';
  v_suc_o  uuid;
  v_cat uuid; v_p120 uuid; v_f100 uuid; v_z35 uuid; v_z2 uuid; v_z5 uuid; v_z8 uuid; v_z10 uuid;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_dir    jsonb := '{"calle":"Av. Pedido","numero_exterior":"12","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":"portón verde"}';
  v_cli    jsonb := '{"nombre":"Ana Distancia","telefono":"4775559001"}';
  v_tramos jsonb := '[{"hasta_km":"2.0","costo_mxn":"0"},{"hasta_km":"5","costo_mxn":"35.00"},{"hasta_km":"8.0","costo_mxn":"50"}]';
  v_uno    text;
  v_r jsonb; v_q jsonb; v_neg jsonb; v_s jsonb;
  v_ped delivery_pedidos%ROWTYPE;
  v_ticket uuid; v_dir_id uuid;
  v_e text; v_n int; c record;
  c_claims_dueno text;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  c_claims_dueno := json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text;

  -- ── 1) El cálculo puro ───────────────────────────────────────────────────
  -- Zócalo → Ángel de la Independencia (CDMX): 3.67 km en línea recta, × 1.3 = 4.77 → 4.8.
  IF _tienda_distancia_km(19.4326, -99.1332, 19.4270, -99.1677) <> 4.8 THEN
    RAISE EXCEPTION '1: Zócalo–Ángel debía dar 4.8, dio %', _tienda_distancia_km(19.4326, -99.1332, 19.4270, -99.1677);
  END IF;
  IF _tienda_distancia_km(21.1223, -101.6824, 21.1223, -101.6824) <> 0
     OR _tienda_distancia_km(21.1223, -101.6824, 21.129218, -101.6824) <> 1.0
     OR _tienda_distancia_km(21.1223, -101.6824, 21.157304, -101.6824) <> 5.1
     -- Simétrica.
     OR _tienda_distancia_km(21.157304, -101.6824, 21.1223, -101.6824) <> 5.1
     -- Un grado de latitud: 111.195 km × 1.3 = 144.55 → 144.6.
     OR _tienda_distancia_km(0, 0, 1, 0) <> 144.6 THEN
    RAISE EXCEPTION '1: distancias de referencia equivocadas';
  END IF;
  IF _tienda_punto('{"lat":21.1234567,"lng":-101.5}') <> '{"lat":21.123457,"lng":-101.500000}'::jsonb
     OR _tienda_punto('{"lat":"21.1","lng":-101}') IS NOT NULL OR _tienda_punto('{"lat":91,"lng":0}') IS NOT NULL
     OR _tienda_punto('{"lat":0,"lng":-180.5}') IS NOT NULL OR _tienda_punto('{"lat":0}') IS NOT NULL
     OR _tienda_punto('[21.1,-101.6]') IS NOT NULL OR _tienda_punto(NULL) IS NOT NULL
     OR _tienda_punto('{"lat":1e400,"lng":0}') IS NOT NULL THEN
    RAISE EXCEPTION '1: _tienda_punto acepta o rechaza mal';
  END IF;

  -- ── Fixture: la tienda, abierta ahora, «Por zonas» como todas ─────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_tarjeta) VALUES (v_t, 'distancia-smoke', true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  UPDATE sucursales SET geo_lat = NULL, geo_lng = NULL WHERE id = v_suc;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0179', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OD', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa) VALUES (v_suc_o, v_otro, true);

  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Distancia smoke', 61) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla distancia', 120) RETURNING id INTO v_p120;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 distancia', 100, 16, false) RETURNING id INTO v_f100;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Distancia 35', 35) RETURNING id INTO v_z35;

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-DIST', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  v_uno := format('[{"producto_id":"%s","cantidad":1}]', v_p120);

  -- ── 2) Todo nace «Por zonas» y sigue igual ───────────────────────────────
  IF (SELECT cobro_envio FROM tienda_sucursales WHERE sucursal_id = v_suc) <> 'ZONAS'
     OR (SELECT tramos_envio FROM tienda_sucursales WHERE sucursal_id = v_suc) <> '[]'::jsonb THEN
    RAISE EXCEPTION '2: una sucursal nueva debía nacer «Por zonas» y sin tramos';
  END IF;
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NOT NULL THEN RAISE EXCEPTION '2: por zonas con una zona debía estar abierta'; END IF;
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z35, v_uno::jsonb);
  IF v_q ->> 'total_mxn' <> '155.00' OR v_q ->> 'cobro' <> 'ZONAS' OR v_q -> 'distancia_km' <> 'null'::jsonb
     OR (v_q ->> 'zona_id')::uuid <> v_z35 THEN
    RAISE EXCEPTION '2: cotizar por zonas cambió: %', v_q - 'items' - 'renglones';
  END IF;
  -- Por zonas, el punto no cuenta para nada.
  IF tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z35, v_uno::jsonb, '{"lat":21.17,"lng":-101.68}') <> v_q THEN
    RAISE EXCEPTION '2: por zonas, el punto no debía cambiar la cotización';
  END IF;
  v_s := (SELECT s FROM jsonb_array_elements(tienda_negocio('distancia-smoke') -> 'publico' -> 'sucursales') s WHERE s ->> 'id' = v_suc::text);
  IF v_s -> 'envio' <> '{"cobro":"ZONAS","tramos":[],"punto":null}'::jsonb OR jsonb_array_length(v_s -> 'zonas') <> 1 THEN
    RAISE EXCEPTION '2: tienda_negocio por zonas: %', v_s -> 'envio';
  END IF;

  -- ── 3) Quién puede guardar ───────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_e := pg_temp.error_de(format('SELECT tienda_guardar_envio(%L, %L, %L)', v_suc, 'ZONAS', '[]'));
  IF v_e IS DISTINCT FROM 'NO_AUTORIZADO' THEN RAISE EXCEPTION '3: la cajera no debía poder guardar (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  v_e := pg_temp.error_de(format('SELECT tienda_guardar_envio(%L, %L, %L)', v_suc, 'ZONAS', '[]'));
  IF v_e IS DISTINCT FROM 'NO_AUTORIZADO' THEN RAISE EXCEPTION '3: sin sesión no debía poder guardar (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', c_claims_dueno, true);
  v_e := pg_temp.error_de(format('SELECT tienda_guardar_envio(%L, %L, %L)', v_suc_o, 'ZONAS', '[]'));
  IF v_e IS DISTINCT FROM 'SUCURSAL_INVALIDA' THEN RAISE EXCEPTION '3: la sucursal de otro negocio debía rechazarse (dio %)', v_e; END IF;
  IF has_function_privilege('anon', 'tienda_guardar_envio(uuid, text, jsonb, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'tienda_guardar_envio(uuid, text, jsonb, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', '_tienda_tramos(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric, jsonb)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('tienda_cotizar', 'tienda_crear_pedido') GROUP BY proname HAVING count(*) > 1) THEN
    RAISE EXCEPTION '3: privilegios o firmas de las funciones';
  END IF;

  -- ── 4) Lo que no se guarda ───────────────────────────────────────────────
  FOR c IN SELECT * FROM (VALUES
    ('sin punto de la sucursal', 'DISTANCIA', v_tramos, NULL::jsonb, 'DISTANCIA_INCOMPLETA'),
    ('sin tramos',               'DISTANCIA', '[]', '{"lat":21.1223,"lng":-101.6824}', 'DISTANCIA_INCOMPLETA'),
    ('cobro desconocido',        'KM', v_tramos, NULL, 'COBRO_INVALIDO'),
    ('km que no crece',          'ZONAS', '[{"hasta_km":"5","costo_mxn":"0"},{"hasta_km":"5.0","costo_mxn":"1"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('km que baja',              'ZONAS', '[{"hasta_km":"5","costo_mxn":"0"},{"hasta_km":"3","costo_mxn":"1"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('km cero',                  'ZONAS', '[{"hasta_km":"0","costo_mxn":"0"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('km de más de 50',          'ZONAS', '[{"hasta_km":"50.1","costo_mxn":"0"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('km con dos decimales',     'ZONAS', '[{"hasta_km":"3.25","costo_mxn":"0"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('km como número JSON',      'ZONAS', '[{"hasta_km":3,"costo_mxn":"0"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('costo como número JSON',   'ZONAS', '[{"hasta_km":"3","costo_mxn":35.5}]', NULL, 'TRAMOS_INVALIDOS'),
    ('costo negativo',           'ZONAS', '[{"hasta_km":"3","costo_mxn":"-1"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('costo con tres decimales', 'ZONAS', '[{"hasta_km":"3","costo_mxn":"1.001"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('costo de 10000',           'ZONAS', '[{"hasta_km":"3","costo_mxn":"10000"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('tramo sin costo',          'ZONAS', '[{"hasta_km":"3"}]', NULL, 'TRAMOS_INVALIDOS'),
    ('tramos que no son lista',  'ZONAS', '{"hasta_km":"3","costo_mxn":"0"}', NULL, 'TRAMOS_INVALIDOS'),
    ('21 tramos',                'ZONAS', (SELECT jsonb_agg(jsonb_build_object('hasta_km', g::text, 'costo_mxn', '1')) FROM generate_series(1, 21) g), NULL, 'TRAMOS_INVALIDOS'),
    ('punto fuera de rango',     'ZONAS', '[]', '{"lat":95,"lng":0}', 'UBICACION_INVALIDA'),
    ('punto como texto',         'ZONAS', '[]', '{"lat":"21.1","lng":"-101.6"}', 'UBICACION_INVALIDA')
  ) AS x(caso, cobro, tramos, punto, codigo) LOOP
    v_e := pg_temp.error_de(format('SELECT tienda_guardar_envio(%L, %L, %L, %L)', v_suc, c.cobro, c.tramos, c.punto));
    IF v_e IS DISTINCT FROM c.codigo THEN RAISE EXCEPTION '4 %: esperaba %, dio %', c.caso, c.codigo, v_e; END IF;
  END LOOP;
  IF (SELECT cobro_envio FROM tienda_sucursales WHERE sucursal_id = v_suc) <> 'ZONAS'
     OR (SELECT geo_lat FROM sucursales WHERE id = v_suc) IS NOT NULL
     OR EXISTS (SELECT 1 FROM zonas_envio WHERE sucursal_id = v_suc AND nombre LIKE 'Hasta %') THEN
    RAISE EXCEPTION '4: un rechazo dejó algo guardado';
  END IF;

  -- ── 5) Guardar «Por distancia» ───────────────────────────────────────────
  v_r := tienda_guardar_envio(v_suc, 'DISTANCIA', v_tramos, '{"lat":21.1223,"lng":-101.6824}');
  IF v_r <> '{"cobro":"DISTANCIA","tramos":[{"hasta_km":"2.0","costo_mxn":"0.00"},{"hasta_km":"5.0","costo_mxn":"35.00"},{"hasta_km":"8.0","costo_mxn":"50.00"}],"punto":{"lat":21.122300,"lng":-101.682400}}'::jsonb THEN
    RAISE EXCEPTION '5: lo que devuelve: %', v_r;
  END IF;
  SELECT id INTO v_z2 FROM zonas_envio WHERE sucursal_id = v_suc AND nombre = 'Hasta 2 km' AND deleted_at IS NULL AND activa AND costo_mxn = 0;
  SELECT id INTO v_z5 FROM zonas_envio WHERE sucursal_id = v_suc AND nombre = 'Hasta 5 km' AND deleted_at IS NULL AND activa AND costo_mxn = 35;
  SELECT id INTO v_z8 FROM zonas_envio WHERE sucursal_id = v_suc AND nombre = 'Hasta 8 km' AND deleted_at IS NULL AND activa AND costo_mxn = 50;
  IF v_z2 IS NULL OR v_z5 IS NULL OR v_z8 IS NULL
     OR (SELECT tramos_envio FROM tienda_sucursales WHERE sucursal_id = v_suc)
        <> jsonb_build_array(jsonb_build_object('hasta_km', '2.0', 'zona_id', v_z2), jsonb_build_object('hasta_km', '5.0', 'zona_id', v_z5),
                             jsonb_build_object('hasta_km', '8.0', 'zona_id', v_z8)) THEN
    RAISE EXCEPTION '5: los tramos no quedaron como zonas «Hasta X km» con su precio';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── 6) Lo que enseña la tienda y si recibe ───────────────────────────────
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NOT NULL THEN
    RAISE EXCEPTION '6: por distancia debía recibir a domicilio: %', tienda_estado_sucursal(v_suc, 'DOMICILIO');
  END IF;
  v_neg := tienda_negocio('distancia-smoke');
  v_s := (SELECT s FROM jsonb_array_elements(v_neg -> 'publico' -> 'sucursales') s WHERE s ->> 'id' = v_suc::text);
  IF v_s -> 'envio' <> '{"cobro":"DISTANCIA","tramos":[{"hasta_km":"2.0","costo_mxn":"0.00"},{"hasta_km":"5.0","costo_mxn":"35.00"},{"hasta_km":"8.0","costo_mxn":"50.00"}],"punto":{"lat":21.122300,"lng":-101.682400}}'::jsonb
     OR v_s -> 'zonas' <> '[]'::jsonb OR v_neg::text LIKE '%' || v_z5 || '%' THEN
    RAISE EXCEPTION '6: tienda_negocio por distancia (sin zonas y sin ids de zona): %', v_s - 'horario';
  END IF;

  -- ── 7) La cotización por distancia ───────────────────────────────────────
  -- Sin punto: el carrito se puede enseñar, sin envío todavía.
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', NULL, v_uno::jsonb);
  IF v_q ->> 'envio_mxn' <> '0.00' OR v_q ->> 'total_mxn' <> '120.00' OR v_q -> 'distancia_km' <> 'null'::jsonb
     OR v_q -> 'zona_id' <> 'null'::jsonb OR v_q ->> 'cobro' <> 'DISTANCIA' THEN
    RAISE EXCEPTION '7: sin punto: %', v_q - 'items' - 'renglones';
  END IF;
  FOR c IN SELECT * FROM (VALUES
    -- punto (latitud al norte de la sucursal), distancia, envío, zona, total
    (21.129218, '1.0', '0.00',  v_z2, '120.00'),
    (21.136412, '2.0', '0.00',  v_z2, '120.00'),   -- borde exacto: «hasta 2 km» incluye 2.0
    (21.136551, '2.1', '35.00', v_z5, '155.00'),
    (21.156751, '5.0', '35.00', v_z5, '155.00'),   -- 4.98 redondea a 5.0: sigue en «hasta 5»
    (21.157166, '5.0', '35.00', v_z5, '155.00'),   -- 5.04 también
    (21.157304, '5.1', '50.00', v_z8, '170.00'),   -- 5.06 ya es 5.1
    (21.176951, '7.9', '50.00', v_z8, '170.00')
  ) AS x(lat, dist, envio, zona, total) LOOP
    v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', NULL, v_uno::jsonb, jsonb_build_object('lat', c.lat, 'lng', -101.6824));
    IF v_q ->> 'distancia_km' <> c.dist OR v_q ->> 'envio_mxn' <> c.envio OR (v_q ->> 'zona_id')::uuid <> c.zona
       OR v_q ->> 'total_mxn' <> c.total THEN
      RAISE EXCEPTION '7 (lat %): esperaba % km, envío %, total %; dio %', c.lat, c.dist, c.envio, c.total, v_q - 'items' - 'renglones';
    END IF;
  END LOOP;
  -- El envío hereda el IVA del primer renglón: $35 + 16 % por fuera = 40.60.
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_f100)::jsonb, '{"lat":21.136551,"lng":-101.6824}');
  IF v_q ->> 'envio_total_mxn' <> '40.60' OR v_q ->> 'total_mxn' <> '156.60' THEN
    RAISE EXCEPTION '7: IVA del envío por distancia: %', v_q - 'items' - 'renglones';
  END IF;
  FOR c IN SELECT * FROM (VALUES
    ('fuera del último tramo',  '{"lat":21.179026,"lng":-101.6824}', NULL::uuid, 'FUERA_DE_AREA'),
    ('a 90 km: basura',         '{"lat":21.744906,"lng":-101.6824}', NULL, 'UBICACION_INVALIDA'),
    ('del otro lado del mundo', '{"lat":-21.1223,"lng":78.3176}', NULL, 'UBICACION_INVALIDA'),
    ('punto como texto',        '{"lat":"21.13","lng":"-101.68"}', NULL, 'UBICACION_INVALIDA'),
    ('punto sin lng',           '{"lat":21.13}', NULL, 'UBICACION_INVALIDA'),
    ('punto que no es objeto',  '[21.13,-101.68]', NULL, 'UBICACION_INVALIDA'),
    ('latitud fuera de rango',  '{"lat":91,"lng":-101.68}', NULL, 'UBICACION_INVALIDA'),
    ('con zona elegida a mano', '{"lat":21.13,"lng":-101.6824}', v_z35, 'ZONA_INVALIDA'),
    ('con la zona de un tramo', '{"lat":21.13,"lng":-101.6824}', v_z2, 'ZONA_INVALIDA')
  ) AS x(caso, punto, zona, codigo) LOOP
    v_e := pg_temp.error_de(format('SELECT tienda_cotizar(%L, %L, %L, %L, %L, %L)', v_t, v_suc, 'DOMICILIO', c.zona, v_uno, c.punto));
    IF v_e IS DISTINCT FROM c.codigo THEN RAISE EXCEPTION '7 %: esperaba %, dio %', c.caso, c.codigo, v_e; END IF;
  END LOOP;
  BEGIN
    PERFORM tienda_cotizar(v_t, v_suc, 'DOMICILIO', NULL, v_uno::jsonb, '{"lat":21.179026,"lng":-101.6824}');
  EXCEPTION WHEN OTHERS THEN v_e := SQLERRM;
  END;
  IF v_e <> 'FUERA_DE_AREA: 8.2' THEN RAISE EXCEPTION '7: fuera de área debía decir la distancia: %', v_e; END IF;
  -- Recoger no cambia con el punto.
  IF tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_uno::jsonb, '{"lat":21.179026,"lng":-101.6824}') ->> 'total_mxn' <> '120.00' THEN
    RAISE EXCEPTION '7: recoger no debía cobrar envío';
  END IF;

  -- ── 8) El pedido ─────────────────────────────────────────────────────────
  FOR c IN SELECT * FROM (VALUES
    ('sin ubicación',          NULL::uuid, NULL::jsonb, NULL::numeric, 'UBICACION_INVALIDA'),
    ('ubicación basura',       NULL, '{"lat":"x","lng":0}', NULL, 'UBICACION_INVALIDA'),
    ('fuera del área',         NULL, '{"lat":21.179026,"lng":-101.6824}', NULL, 'FUERA_DE_AREA'),
    ('con zona a mano',        v_z35, '{"lat":21.136551,"lng":-101.6824}', NULL, 'ZONA_INVALIDA'),
    -- El cliente dice que el envío es gratis (vio 120): la base cobra el de la distancia.
    ('el cliente pone el envío', NULL, '{"lat":21.136551,"lng":-101.6824}', 120.00, 'TOTAL_CAMBIO')
  ) AS x(caso, zona, punto, esperado, codigo) LOOP
    v_e := pg_temp.error_de(format(
      'SELECT tienda_crear_pedido(p_tenant => %L, p_sucursal => %L, p_modo => %L, p_zona => %L, p_items => %L, p_cliente => %L, p_direccion => %L, p_pago => %L, p_paga_con => NULL, p_nota => NULL, p_seguimiento_hash => %L, p_total_esperado => %L, p_punto => %L)',
      v_t, v_suc, 'DOMICILIO', c.zona, v_uno, v_cli, v_dir, 'EFECTIVO', md5('d' || c.caso) || md5('e' || c.caso), c.esperado, c.punto));
    IF v_e IS DISTINCT FROM c.codigo THEN RAISE EXCEPTION '8 %: esperaba %, dio %', c.caso, c.codigo, v_e; END IF;
  END LOOP;

  -- El bueno: 2.1 km, $35. Lo que mande el cliente en la dirección además de lo suyo no entra.
  v_r := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'DOMICILIO', p_zona => NULL, p_items => v_uno::jsonb,
           p_cliente => v_cli, p_direccion => v_dir || '{"lat":0,"lng":0,"envio_mxn":"0.00"}', p_pago => 'EFECTIVO', p_paga_con => NULL,
           p_nota => NULL, p_seguimiento_hash => md5('dist-ok') || md5('dist-ok2'), p_total_esperado => 155.00,
           p_punto => '{"lat":21.1365512,"lng":-101.6824,"extra":1}');
  SELECT * INTO v_ped FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;
  IF v_ped.envio_mxn <> 35 OR v_ped.total_cliente_mxn <> 155 OR v_ped.zona_envio_id <> v_z5 OR v_ped.envio_distancia_km <> 2.1
     OR v_ped.direccion <> (v_dir || '{"lat":21.136551,"lng":-101.682400,"referencias":"A 2.1 km · portón verde"}'::jsonb) THEN
    RAISE EXCEPTION '8: el pedido: envío %, total %, zona % (esperaba %), distancia %, dirección %',
      v_ped.envio_mxn, v_ped.total_cliente_mxn, v_ped.zona_envio_id, v_z5, v_ped.envio_distancia_km, v_ped.direccion;
  END IF;
  -- Sin referencias del cliente, la distancia sola.
  v_r := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'DOMICILIO', p_zona => NULL, p_items => v_uno::jsonb,
           p_cliente => '{"nombre":"Beto Distancia","telefono":"4775559002"}', p_direccion => v_dir - 'referencias', p_pago => 'TARJETA',
           p_paga_con => NULL, p_nota => NULL, p_seguimiento_hash => md5('dist-ok3') || md5('dist-ok4'), p_punto => '{"lat":21.129218,"lng":-101.6824}');
  IF (SELECT direccion ->> 'referencias' FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 'A 1.0 km'
     OR (SELECT envio_mxn FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 0 THEN
    RAISE EXCEPTION '8: sin referencias / tramo gratis';
  END IF;

  -- ── 9) La vuelta al ticket (lo mismo que hace la caja instalada) ────────
  v_ticket := crear_ticket_desde_tienda(v_ped.id);
  IF (SELECT total_mxn FROM tickets WHERE id = v_ticket) <> 155
     OR (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) <> v_z5
     OR (SELECT precio_unitario_snapshot FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND NOT cancelado) <> 35 THEN
    RAISE EXCEPTION '9: el ticket no salió con el envío del tramo';
  END IF;
  SELECT direccion_entrega_id INTO v_dir_id FROM tickets WHERE id = v_ticket;
  IF (SELECT referencias FROM direcciones_cliente WHERE id = v_dir_id) <> 'A 2.1 km · portón verde' THEN
    RAISE EXCEPTION '9: la dirección del cliente no lleva la distancia';
  END IF;
  -- El gratis también: sin renglón de envío.
  v_ticket := crear_ticket_desde_tienda((v_r ->> 'pedido_id')::uuid);
  IF EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND NOT cancelado)
     OR (SELECT total_mxn FROM tickets WHERE id = v_ticket) <> 120 THEN
    RAISE EXCEPTION '9: el tramo gratis no debía dejar renglón de envío';
  END IF;

  -- ── 10) La purga: el punto se va con la dirección, la distancia se queda ─
  UPDATE delivery_pedidos SET recibido_at = now() - interval '31 days', estado = 'ENTREGADO' WHERE id = v_ped.id;
  PERFORM delivery_anonimizar_pedidos_viejos(30);
  SELECT * INTO v_ped FROM delivery_pedidos WHERE id = v_ped.id;
  IF v_ped.direccion IS NOT NULL OR v_ped.envio_distancia_km <> 2.1 THEN
    RAISE EXCEPTION '10: la purga debía borrar la dirección (con el punto) y conservar la distancia: %, %', v_ped.direccion, v_ped.envio_distancia_km;
  END IF;

  -- ── 11) Volver a guardar: se conservan, se crean y se dan de baja zonas ──
  PERFORM set_config('request.jwt.claims', c_claims_dueno, true);
  PERFORM tienda_guardar_envio(v_suc, 'DISTANCIA', '[{"hasta_km":"2","costo_mxn":"0"},{"hasta_km":"5","costo_mxn":"40"},{"hasta_km":"10","costo_mxn":"60.50"}]');
  SELECT id INTO v_z10 FROM zonas_envio WHERE sucursal_id = v_suc AND nombre = 'Hasta 10 km' AND deleted_at IS NULL AND costo_mxn = 60.50;
  IF v_z10 IS NULL OR (SELECT costo_mxn FROM zonas_envio WHERE id = v_z5) <> 40
     OR (SELECT nombre FROM zonas_envio WHERE id = v_z5) <> 'Hasta 5 km'
     OR (SELECT deleted_at IS NULL OR activa FROM zonas_envio WHERE id = v_z8)
     OR (SELECT geo_lat FROM sucursales WHERE id = v_suc) <> 21.1223 THEN
    RAISE EXCEPTION '11: la zona de 5 km debía conservarse con su nuevo precio, la de 8 km irse y la de 10 km nacer';
  END IF;
  -- Una zona del dueño con el nombre que tocaría: no se pisa.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'hasta 12 KM', 10);
  v_e := pg_temp.error_de(format('SELECT tienda_guardar_envio(%L, %L, %L)', v_suc, 'DISTANCIA', '[{"hasta_km":"12","costo_mxn":"1"}]'));
  IF v_e IS DISTINCT FROM 'ZONA_OCUPADA' THEN RAISE EXCEPTION '11: zona con el mismo nombre: esperaba ZONA_OCUPADA, dio %', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── 12) Falla cerrada: una zona de tramo tocada desde el POS ─────────────
  UPDATE zonas_envio SET activa = false WHERE id = v_z10;
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS DISTINCT FROM 'MODO_NO_DISPONIBLE' OR _tienda_tramos(v_suc) IS NOT NULL THEN
    RAISE EXCEPTION '12: un tramo sin zona activa debía cerrar el domicilio';
  END IF;
  v_e := pg_temp.error_de(format('SELECT tienda_cotizar(%L, %L, %L, NULL, %L, %L)', v_t, v_suc, 'DOMICILIO', v_uno, '{"lat":21.13,"lng":-101.6824}'));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '12: cotizar debía rechazar (dio %)', v_e; END IF;
  UPDATE zonas_envio SET activa = true WHERE id = v_z10;
  -- Una fila escrita a mano por el dueño (con su sesión puede) con una zona ajena: cerrada también.
  UPDATE tienda_sucursales SET tramos_envio = jsonb_build_array(jsonb_build_object('hasta_km', '3.0', 'zona_id', v_z35)) || tramos_envio
   WHERE sucursal_id = v_suc;
  IF _tienda_tramos(v_suc) IS NOT NULL OR tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NULL THEN
    RAISE EXCEPTION '12: tramos que no crecen debían cerrar el domicilio';
  END IF;
  UPDATE tienda_sucursales SET tramos_envio = tramos_envio - 0 WHERE sucursal_id = v_suc;
  -- Sin el punto de la sucursal, tampoco.
  UPDATE sucursales SET geo_lat = NULL WHERE id = v_suc;
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS DISTINCT FROM 'MODO_NO_DISPONIBLE' THEN
    RAISE EXCEPTION '12: sin punto de la sucursal debía cerrar el domicilio';
  END IF;
  UPDATE sucursales SET geo_lat = 21.1223 WHERE id = v_suc;
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NOT NULL THEN RAISE EXCEPTION '12: no volvió a abrir'; END IF;

  -- ── 13) De vuelta «Por zonas»: los tramos se apagan, las zonas de siempre siguen ─
  PERFORM set_config('request.jwt.claims', c_claims_dueno, true);
  PERFORM tienda_guardar_envio(v_suc, 'ZONAS', '[{"hasta_km":"2","costo_mxn":"0"},{"hasta_km":"5","costo_mxn":"40"},{"hasta_km":"10","costo_mxn":"60.50"}]');
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF EXISTS (SELECT 1 FROM zonas_envio WHERE id IN (v_z2, v_z5, v_z10) AND (activa OR deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION '13: «Por zonas», las zonas de los tramos debían quedar inactivas (no borradas)';
  END IF;
  v_s := (SELECT s FROM jsonb_array_elements(tienda_negocio('distancia-smoke') -> 'publico' -> 'sucursales') s WHERE s ->> 'id' = v_suc::text);
  IF v_s -> 'envio' <> '{"cobro":"ZONAS","tramos":[],"punto":null}'::jsonb
     OR (SELECT count(*) FROM jsonb_array_elements(v_s -> 'zonas') z WHERE z ->> 'nombre' ILIKE 'hasta % km' AND z ->> 'nombre' <> 'hasta 12 KM') <> 0
     OR NOT (v_s -> 'zonas') @> jsonb_build_array(jsonb_build_object('id', v_z35)) THEN
    RAISE EXCEPTION '13: por zonas, la tienda enseña: %', v_s -> 'zonas';
  END IF;
  -- Aunque alguien reactive desde el POS una zona de tramo, «Por zonas» no se puede elegir en la tienda.
  UPDATE zonas_envio SET activa = true WHERE id = v_z5;
  v_e := pg_temp.error_de(format('SELECT tienda_cotizar(%L, %L, %L, %L, %L)', v_t, v_suc, 'DOMICILIO', v_z5, v_uno));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '13: la zona de un tramo no se elige a mano (dio %)', v_e; END IF;
  IF tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z35, v_uno::jsonb) ->> 'total_mxn' <> '155.00' THEN
    RAISE EXCEPTION '13: la zona de siempre dejó de cotizar';
  END IF;
  -- Solo con zonas de tramos (aunque una esté activa), «Por zonas» no recibe a domicilio.
  UPDATE zonas_envio SET activa = false WHERE sucursal_id = v_suc AND id NOT IN (v_z5);
  IF tienda_estado_sucursal(v_suc, 'DOMICILIO') IS DISTINCT FROM 'MODO_NO_DISPONIBLE' THEN
    RAISE EXCEPTION '13: sin zonas propias, por zonas no debía recibir a domicilio';
  END IF;

  RAISE NOTICE 'smoke_tienda_envio_distancia: OK';
END $$;

ROLLBACK;
