-- Smoke pago en línea de la tienda (mig. 0171 y 0172): quién cobra, el pedido que nace POR_PAGAR y
-- no existe para quien atiende, aplicar lo que dice Mercado Pago (aprobado, rechazado, repetido,
-- tardío, de más), la cuenta que nace cobrada, las devoluciones por cada camino y el barrido.
-- Aquí no hay Mercado Pago: se prueba lo que la base decide con lo que las funciones le traen.
-- Fixture propio sobre el negocio y la sucursal de la semilla, como smoke_tienda_pedido.sql.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_pago_en_linea.sql
\set ON_ERROR_STOP on
BEGIN;

-- Un pedido en línea de 2 × $120 para recoger, con 10 % de propina: total 240.00, propina 24.00.
CREATE FUNCTION pg_temp.pedir(p_tel text, p_n integer, p_clave text DEFAULT NULL, p_propina integer DEFAULT 10) RETURNS jsonb
LANGUAGE sql AS $f$
  SELECT tienda_crear_pedido(
    '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', 'RECOGER', NULL,
    (SELECT format('[{"producto_id":"%s","cantidad":2}]', p.id)::jsonb FROM productos p
      WHERE p.tenant_id = '99999999-0000-0000-0000-0000000000aa' AND p.nombre = 'Sencilla en línea'),
    jsonb_build_object('nombre', 'Ana Línea', 'telefono', p_tel, 'email', 'ana.linea@example.com'),
    NULL, 'EN_LINEA', NULL, NULL, md5('pl-a' || p_n) || md5('pl-b' || p_n),
    p_clave => p_clave, p_propina_pct => p_propina);
$f$;

-- Un pedido ya pagado (RECIBIDO): lo crea y le aplica su pago aprobado.
CREATE FUNCTION pg_temp.pagado(p_tel text, p_n integer) RETURNS uuid
LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  v := pg_temp.pedir(p_tel, p_n);
  PERFORM tienda_pago_aplicar((v ->> 'pago_id')::uuid, 'APROBADO', (900000 + p_n)::text, 264.00, 'credit_card', 'visa');
  RETURN (v ->> 'pedido_id')::uuid;
END $f$;

CREATE FUNCTION pg_temp.pago_de(p_pedido uuid) RETURNS text
LANGUAGE sql AS $f$ SELECT estado::text FROM tienda_pagos WHERE pedido_id = p_pedido AND NOT extra $f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '71717171-0000-0000-0000-0000000000aa';
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_cat uuid; v_prod uuid; v_zona uuid; v_cx1 uuid; v_cx2 uuid; v_cx_o uuid;
  v_r jsonb; v_r2 jsonb; v_a jsonb; v_seg jsonb; v_neg jsonb;
  v_ped uuid; v_pago uuid; v_ticket uuid; v_id uuid; v_ped2 uuid;
  v_p delivery_pedidos%ROWTYPE; v_g tienda_pagos%ROWTYPE;
  v_n integer; v_txt text; v_num numeric;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: la tienda abierta ahora, con turno, sin caja instalada (gestión NUBE) ──────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta)
  VALUES (v_t, 'linea-smoke', 7, true, false);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'En línea smoke', 70) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla en línea', 120) RETURNING id INTO v_prod;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'En línea 35', 35) RETURNING id INTO v_zona;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-LINEA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_cajero, 500, 'TOTAL');
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0172', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key) VALUES (v_otro, '700', 'APP_USR-smoke-otro-negocio-0000') RETURNING id INTO v_cx_o;
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL THEN RAISE EXCEPTION 'fixture: la tienda debía estar abierta: %', tienda_estado_sucursal(v_suc, 'RECOGER'); END IF;

  -- ── A) Quién cobra ──────────────────────────────────────────────────────────────────────────
  -- A1) La casilla apagada: no se cobra en línea aunque haya cuenta. Y sigue valiendo «al menos una forma de pago».
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre, public_key) VALUES (v_t, '501', 'Cuenta uno', 'APP_USR-smoke-cuenta-uno-0000001') RETURNING id INTO v_cx1;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A1: cobra en línea con la casilla apagada'; END IF;
  BEGIN
    UPDATE tienda_config SET pago_efectivo = false WHERE tenant_id = v_t;
    RAISE EXCEPTION 'A1: aceptó una tienda sin ninguna forma de pago';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE tienda_config SET pago_en_linea = true, pago_efectivo = false WHERE tenant_id = v_t;   -- solo en línea: vale
  UPDATE tienda_config SET pago_efectivo = true WHERE tenant_id = v_t;

  -- A2) Una sola cuenta activa: esa. Dos sin elegir: ninguna. Elegida: la elegida. Elegida y desconectada: ninguna.
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_cx1 THEN RAISE EXCEPTION 'A2: con una sola cuenta activa debía cobrar esa'; END IF;
  -- Sin public key (o con algo que no lo parece) no existe la conexión: la tienda no podría tokenizar la tarjeta.
  FOR r IN SELECT * FROM (VALUES (NULL), ('corta'), ('con espacios y <script>………………')) AS x(pk) LOOP
    BEGIN
      UPDATE tienda_conexiones SET public_key = r.pk WHERE id = v_cx1;
      RAISE EXCEPTION 'A2: aceptó la public key %', COALESCE(r.pk, 'NULL');
    EXCEPTION WHEN not_null_violation OR check_violation THEN NULL;
    END;
  END LOOP;
  -- La tienda no mira la terminal, ni al revés: una cuenta conectada para la TERMINAL no cobra en la
  -- tienda, y la terminal no tiene nada de la tienda (la public key es solo de tienda_conexiones).
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'terminal_conexiones' AND column_name = 'public_key') THEN
    RAISE EXCEPTION 'A2: terminal_conexiones tiene public_key: la conexión de la terminal no debía cambiar';
  END IF;
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE id = v_cx1;
  INSERT INTO terminal_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre) VALUES (v_t, '501', 'La de la terminal');
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: la tienda cobró con la conexión de la terminal'; END IF;
  UPDATE tienda_conexiones SET estado = 'ACTIVA' WHERE id = v_cx1;
  -- En pausa (muchas tarjetas rechazadas en el negocio, o Mercado Pago rechazó las credenciales en la
  -- sucursal): no se ofrece. La pausa se levanta sola, y pausar dos veces avisa una.
  IF NOT tienda_pago_pausar(v_t, NULL, 60) OR tienda_pago_pausar(v_t, NULL, 60) THEN RAISE EXCEPTION 'A2: pausar el negocio debía dar verdadero una sola vez'; END IF;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: cobra en línea con el negocio en pausa'; END IF;
  IF (tienda_negocio('linea-smoke') -> 'publico' -> 'sucursales' -> 0 -> 'pago_en_linea') <> 'false'::jsonb THEN RAISE EXCEPTION 'A2: la tienda anuncia el pago en línea con el negocio en pausa'; END IF;
  UPDATE tienda_config SET pago_pausado_hasta = now() - interval '1 second' WHERE tenant_id = v_t;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_cx1 THEN RAISE EXCEPTION 'A2: la pausa del negocio no se levantó sola'; END IF;
  IF NOT tienda_pago_pausar(v_t, v_suc, 60) OR tienda_pago_pausar(v_t, v_suc, 60) THEN RAISE EXCEPTION 'A2: pausar la sucursal debía dar verdadero una sola vez'; END IF;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: cobra en línea con la sucursal en pausa'; END IF;
  IF tienda_pago_pausar(v_otro, v_suc, 60) THEN RAISE EXCEPTION 'A2: otro negocio pausó una sucursal que no es suya'; END IF;
  UPDATE tienda_sucursales SET pago_pausado_hasta = NULL WHERE sucursal_id = v_suc;
  UPDATE tienda_config SET pago_pausado_hasta = NULL WHERE tenant_id = v_t;
  -- Los tokens van a Vault y aquí (como en la caja) no hay: guardar y leer lo dicen; borrar no revienta.
  BEGIN
    PERFORM tienda_guardar_tokens(v_cx1, 'a', 'r', now());
    RAISE EXCEPTION 'A2: guardó tokens sin Vault';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VAULT_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  PERFORM tienda_borrar_tokens(v_cx1);
  -- Una conexión de PRUEBA nunca cobra en la tienda (ni siendo la única, ni elegida a mano).
  UPDATE tienda_conexiones SET de_prueba = true WHERE id = v_cx1;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: cobra en línea una conexión de prueba'; END IF;
  UPDATE tienda_sucursales SET conexion_id = v_cx1 WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: cobra en línea una conexión de prueba elegida a mano'; END IF;
  UPDATE tienda_sucursales SET conexion_id = NULL WHERE sucursal_id = v_suc;
  UPDATE tienda_conexiones SET de_prueba = false WHERE id = v_cx1;
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre, public_key) VALUES (v_t, '502', 'Cuenta dos', 'APP_USR-smoke-cuenta-dos-0000002') RETURNING id INTO v_cx2;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: con dos cuentas y sin elegir no debe adivinar'; END IF;
  UPDATE tienda_sucursales SET conexion_id = v_cx2 WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_cx2 THEN RAISE EXCEPTION 'A2: debía cobrar la cuenta elegida'; END IF;
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE id = v_cx2;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: la elegida está desconectada; no se usa otra'; END IF;
  -- La cuenta de OTRO negocio, elegida a mano: no cobra.
  UPDATE tienda_sucursales SET conexion_id = v_cx_o WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'A2: cobró con la cuenta de otro negocio'; END IF;
  UPDATE tienda_sucursales SET conexion_id = NULL WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_cx1 THEN RAISE EXCEPTION 'A2: sin elegir y con una sola activa, debía volver a esa'; END IF;

  -- A3) Con una caja instalada viva que no sabe de pedidos pagados (anterior a la 0.9.0): no se cobra en línea.
  FOR r IN SELECT * FROM (VALUES ('0.8.0', false), (NULL, false), ('0.9', false), ('0.9.0-beta', false),
                                 ('0.9.0', true), ('0.10.2', true), ('1.0.0', true)) AS x(version, vale) LOOP
    UPDATE cajas SET espejo_apps_at = now(), version_app = r.version WHERE id = v_caja;
    IF (tienda_conexion_cobro(v_t, v_suc) IS NOT NULL) <> r.vale THEN
      RAISE EXCEPTION 'A3: con una caja viva en la versión % debía dar %', COALESCE(r.version, 'NULL'), r.vale;
    END IF;
  END LOOP;
  -- La misma caja vieja, apagada (sin latido reciente): no estorba.
  UPDATE cajas SET espejo_apps_at = now() - interval '10 minutes', version_app = '0.8.0' WHERE id = v_caja;
  IF tienda_conexion_cobro(v_t, v_suc) IS NULL THEN RAISE EXCEPTION 'A3: una caja vieja apagada no debe impedir el cobro'; END IF;
  UPDATE cajas SET espejo_apps_at = NULL, version_app = NULL WHERE id = v_caja;

  -- A4) tienda_negocio lo dice: en el negocio y en la sucursal.
  v_neg := tienda_negocio('linea-smoke') -> 'publico';
  IF v_neg -> 'pago_en_linea' <> 'true'::jsonb OR v_neg -> 'sucursales' -> 0 -> 'pago_en_linea' <> 'true'::jsonb THEN
    RAISE EXCEPTION 'A4: tienda_negocio no anuncia el pago en línea: %', v_neg - 'sucursales';
  END IF;
  -- Y la public key de la cuenta que cobra ahí (es pública). Nada más de la conexión.
  IF v_neg -> 'sucursales' -> 0 ->> 'public_key' IS DISTINCT FROM (SELECT public_key FROM tienda_conexiones WHERE id = tienda_conexion_cobro(v_t, v_suc))
     OR v_neg -> 'sucursales' -> 0 ->> 'public_key' IS NULL OR v_neg::text ~ 'cuenta_id_externo|access|refresh' THEN
    RAISE EXCEPTION 'A4: la public key de la sucursal: %', v_neg -> 'sucursales' -> 0;
  END IF;

  -- ── B) El pedido nace POR_PAGAR ─────────────────────────────────────────────────────────────
  v_r := pg_temp.pedir('4776660001', 1, 'clave-uno');
  IF NOT (v_r ?& ARRAY['pedido_id', 'folio_corto', 'total_mxn', 'vence_aceptacion', 'ya_existia', 'pago_id', 'propina_mxn', 'total_a_pagar_mxn'])
     OR (SELECT count(*) FROM jsonb_object_keys(v_r)) <> 8 THEN
    RAISE EXCEPTION 'B1: lo que devuelve un pedido en línea: %', v_r;
  END IF;
  IF v_r ->> 'total_mxn' <> '240.00' OR v_r ->> 'propina_mxn' <> '24.00' OR v_r ->> 'total_a_pagar_mxn' <> '264.00'
     OR v_r -> 'vence_aceptacion' <> 'null'::jsonb OR v_r -> 'ya_existia' <> 'false'::jsonb THEN
    RAISE EXCEPTION 'B1: importes o ventana: %', v_r;
  END IF;
  v_ped := (v_r ->> 'pedido_id')::uuid; v_pago := (v_r ->> 'pago_id')::uuid;
  SELECT * INTO v_p FROM delivery_pedidos WHERE id = v_ped;
  IF v_p.estado <> 'POR_PAGAR' OR v_p.pago_al_recibir <> 'EN_LINEA' OR v_p.vence_aceptacion IS NOT NULL OR v_p.pagado_at IS NOT NULL
     OR v_p.propina_mxn <> 24.00 OR v_p.total_cliente_mxn <> 240.00 OR v_p.efectivo_a_cobrar_mxn <> 0 THEN
    RAISE EXCEPTION 'B1: la fila del pedido: %', to_jsonb(v_p) - 'items';
  END IF;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = v_pago;
  IF v_g.estado <> 'CREADO' OR v_g.monto_mxn <> 264.00 OR v_g.propina_mxn <> 24.00 OR v_g.conexion_id <> v_cx1 OR v_g.extra
     OR v_g.pedido_id <> v_ped OR v_g.vence_at NOT BETWEEN now() + interval '4 minutes' AND now() + interval '6 minutes' OR v_g.cobro_pedido_at IS NOT NULL THEN
    RAISE EXCEPTION 'B1: el renglón del pago: %', to_jsonb(v_g);
  END IF;

  -- B2) La propina es sobre los productos, sin el envío: a domicilio (240 + 35 de envío), 20 % = 48.00.
  v_r2 := tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_zona, format('[{"producto_id":"%s","cantidad":2}]', v_prod)::jsonb,
            '{"nombre":"Ana Línea","telefono":"4776660002","email":"ana.linea@example.com"}',
            '{"calle":"Av. Línea","numero_exterior":"1","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}',
            'EN_LINEA', NULL, NULL, md5('pl-dom-a') || md5('pl-dom-b'), p_propina_pct => 20);
  IF v_r2 ->> 'total_mxn' <> '275.00' OR v_r2 ->> 'propina_mxn' <> '48.00' OR v_r2 ->> 'total_a_pagar_mxn' <> '323.00' THEN
    RAISE EXCEPTION 'B2: la propina debía ser 20 %% de 240.00 (sin el envío): %', v_r2;
  END IF;
  -- Sin propina (NULL o 0): se cobra el total.
  v_r2 := pg_temp.pedir('4776660003', 3, NULL, NULL);
  IF v_r2 ->> 'propina_mxn' <> '0.00' OR v_r2 ->> 'total_a_pagar_mxn' <> '240.00' THEN RAISE EXCEPTION 'B2: sin propina: %', v_r2; END IF;

  -- B3) Lo que no vale: propina fuera de la lista, propina o «paga con» fuera de lugar, y en línea sin quién cobre.
  FOR r IN SELECT * FROM (VALUES
      ('propina de 12',            'EN_LINEA', NULL::numeric, 12),
      ('propina negativa',         'EN_LINEA', NULL, -10),
      ('propina con efectivo',     'EFECTIVO', NULL, 10),
      ('«paga con» en línea',      'EN_LINEA', 500, 0)) AS x(caso, pago, paga_con, propina) LOOP
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_prod)::jsonb,
                '{"nombre":"Ana","telefono":"4776660004","email":"ana@example.com"}', NULL, r.pago, r.paga_con, NULL, md5('pl-mal') || md5(r.caso),
                p_propina_pct => r.propina);
      RAISE EXCEPTION 'B3 (%): debió rechazarse', r.caso;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'PAGO_INVALIDO:%' THEN RAISE EXCEPTION 'B3 (%): esperaba PAGO_INVALIDO y salió: %', r.caso, SQLERRM; END IF;
    END;
  END LOOP;
  UPDATE tienda_conexiones SET estado = 'ERROR' WHERE id = v_cx1;
  BEGIN
    PERFORM pg_temp.pedir('4776660004', 4);
    RAISE EXCEPTION 'B3: creó un pedido en línea sin cuenta que cobre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGO_INVALIDO:%' THEN RAISE EXCEPTION 'B3: esperaba PAGO_INVALIDO y salió: %', SQLERRM; END IF;
  END;
  UPDATE tienda_conexiones SET estado = 'ACTIVA' WHERE id = v_cx1;
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE cliente_telefono = '4776660004') THEN RAISE EXCEPTION 'B3: un rechazo dejó pedido'; END IF;

  -- B4) El reintento con la misma clave: el MISMO pedido y el MISMO pago, sin crear otro.
  v_r2 := pg_temp.pedir('4776660001', 1, 'clave-uno');
  IF v_r2 ->> 'pedido_id' <> v_ped::text OR v_r2 ->> 'pago_id' <> v_pago::text OR v_r2 -> 'ya_existia' <> 'true'::jsonb
     OR v_r2 ->> 'total_a_pagar_mxn' <> '264.00' THEN
    RAISE EXCEPTION 'B4: el reintento no devolvió el mismo pedido y pago: %', v_r2;
  END IF;
  IF (SELECT count(*) FROM tienda_pagos WHERE pedido_id = v_ped) <> 1 THEN RAISE EXCEPTION 'B4: el reintento creó otro pago'; END IF;

  -- B5) No existe para quien atiende. Ni el cajero ni el dueño lo leen; la vista de vencidos tampoco.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM delivery_pedidos WHERE pago_al_recibir = 'EN_LINEA';
  IF v_n <> 0 THEN RAISE EXCEPTION 'B5: el cajero ve % pedido(s) sin pagar', v_n; END IF;
  SELECT count(*) INTO v_n FROM tienda_pagos;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B5: el cajero lee tienda_pagos (% filas)', v_n; END IF;
  SELECT count(*) INTO v_n FROM tienda_conexiones;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B5: el cajero lee tienda_conexiones (% filas)', v_n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  -- La conexión de la tienda: el dueño lee las suyas (y ninguna ajena), no las escribe ni toca los tokens.
  SELECT count(*) INTO v_n FROM tienda_conexiones;
  IF v_n <> 2 THEN RAISE EXCEPTION 'B5: el dueño debía leer las 2 cuentas de su negocio y lee %', v_n; END IF;
  BEGIN
    UPDATE tienda_conexiones SET estado = 'ACTIVA';
    RAISE EXCEPTION 'B5: el dueño escribió en tienda_conexiones';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM tienda_leer_tokens(v_cx1);
    RAISE EXCEPTION 'B5: un usuario con sesión ejecutó tienda_leer_tokens';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM tienda_eventos;
    RAISE EXCEPTION 'B5: un usuario con sesión leyó tienda_eventos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM delivery_pedidos WHERE pago_al_recibir = 'EN_LINEA';
  IF v_n <> 0 THEN RAISE EXCEPTION 'B5: el dueño ve % pedido(s) sin pagar', v_n; END IF;
  SELECT count(*) INTO v_n FROM tienda_pagos;
  IF v_n <> 3 THEN RAISE EXCEPTION 'B5: el dueño debía leer los 3 pagos de su negocio y lee %', v_n; END IF;
  BEGIN
    UPDATE tienda_pagos SET estado = 'APROBADO';
    RAISE EXCEPTION 'B5: el dueño escribió en tienda_pagos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM tienda_pago_aplicar(v_pago, 'APROBADO', '1', 264.00);
    RAISE EXCEPTION 'B5: un usuario con sesión ejecutó tienda_pago_aplicar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Otro negocio no lee los pagos de este.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  SELECT count(*) INTO v_n FROM tienda_pagos;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B5: otro negocio lee % pago(s) ajenos', v_n; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF has_table_privilege('anon', 'tienda_pagos', 'SELECT') THEN RAISE EXCEPTION 'B5: anon puede leer tienda_pagos'; END IF;
  IF has_table_privilege('anon', 'tienda_conexiones', 'SELECT') OR has_table_privilege('anon', 'tienda_eventos', 'SELECT') THEN RAISE EXCEPTION 'B5: anon puede leer tienda_conexiones o tienda_eventos'; END IF;

  -- B6) Ni se vence como los que esperan aceptación, ni se puede aceptar, ni reportar.
  PERFORM delivery_marcar_expirados();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped) <> 'POR_PAGAR' THEN RAISE EXCEPTION 'B6: delivery_marcar_expirados tocó un pedido sin pagar'; END IF;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_ped);
    RAISE EXCEPTION 'B6: se aceptó un pedido sin pagar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PEDIDO_NO_ACEPTABLE:%' THEN RAISE; END IF;
  END;
  IF tienda_reportar_estado(v_t, v_ped, 'CANCELADO') <> 'POR_PAGAR' THEN RAISE EXCEPTION 'B6: se pudo cancelar desde la caja un pedido sin pagar'; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a1') || md5('pl-b1'));
  IF v_seg ->> 'estado' <> 'POR_PAGAR' OR v_seg ->> 'pago' <> 'EN_LINEA' OR v_seg ->> 'pago_estado' <> 'POR_CONFIRMAR'
     OR v_seg ->> 'propina_mxn' <> '24.00' OR v_seg ->> 'total_a_pagar_mxn' <> '264.00' OR v_seg ? 'vence_pago' THEN
    RAISE EXCEPTION 'B6: el seguimiento de un pedido que espera pago: %', v_seg - 'renglones';
  END IF;
  -- Ningún id de Mercado Pago ni de la base sale en el seguimiento.
  IF v_seg::text ~ (v_pago::text || '|' || v_ped::text || '|init_point|preferencia|pago_id') THEN
    RAISE EXCEPTION 'B6: el seguimiento enseña un identificador interno: %', v_seg - 'renglones';
  END IF;

  -- B7) Tres pedidos esperando pago del mismo teléfono: el cuarto no entra (cuentan contra el tope).
  PERFORM pg_temp.pedir('4776660007', 71); PERFORM pg_temp.pedir('4776660007', 72); PERFORM pg_temp.pedir('4776660007', 73);
  BEGIN
    PERFORM pg_temp.pedir('4776660007', 74);
    RAISE EXCEPTION 'B7: entró un cuarto pedido sin pagar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'NO_SE_PUDO_CREAR:%' THEN RAISE; END IF;
  END;

  -- B8) En línea el correo es obligatorio (Mercado Pago lo pide con el cobro).
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_prod)::jsonb,
      '{"nombre":"Sin Correo","telefono":"4776660008"}', NULL, 'EN_LINEA', NULL, NULL, md5('pl-sc-a') || md5('pl-sc-b'), p_propina_pct => 0);
    RAISE EXCEPTION 'B8: entró un pedido en línea sin correo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CLIENTE_INVALIDO:%' THEN RAISE; END IF;
  END;

  -- ── C) El cobro: se manda UNA vez por pago, pase lo que pase ─────────────────────────────────
  IF NOT tienda_pago_tomar_cobro(v_pago) THEN RAISE EXCEPTION 'C1: el primero debía tomar el cobro'; END IF;
  IF tienda_pago_tomar_cobro(v_pago) THEN RAISE EXCEPTION 'C1: el mismo pago se pudo cobrar dos veces'; END IF;
  UPDATE tienda_pagos SET cobro_pedido_at = now() - interval '1 hour' WHERE id = v_pago;
  IF tienda_pago_tomar_cobro(v_pago) THEN RAISE EXCEPTION 'C1: pasado el tiempo se pudo cobrar otra vez (nunca: se pregunta, no se cobra)'; END IF;
END $$;

-- Segunda mitad, en su propio bloque solo para no pasar de las variables que caben a la vista.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_r jsonb; v_r2 jsonb; v_a jsonb; v_seg jsonb;
  v_ped uuid; v_pago uuid; v_ticket uuid; v_id uuid; v_turno uuid;
  v_p delivery_pedidos%ROWTYPE; v_g tienda_pagos%ROWTYPE;
  v_n integer; v_txt text; v_num numeric; v_ped2 uuid;
  v_otro   uuid := '71717171-0000-0000-0000-0000000000aa';
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT pedido_id, id INTO v_ped, v_pago FROM tienda_pagos g
   WHERE g.pedido_id = (SELECT id FROM delivery_pedidos WHERE cliente_telefono = '4776660001');

  -- C2) Descartar (Mercado Pago rechazó el cobro): se van el pedido y su pago, el teléfono deja de
  --     cargar con él y la misma clave crea uno NUEVO (el cliente reintenta con la misma tarjeta o con otra).
  v_id := (SELECT id FROM delivery_pedidos WHERE seguimiento_hash = md5('pl-a71') || md5('pl-b71'));
  IF NOT tienda_pago_tomar_cobro((SELECT id FROM tienda_pagos WHERE pedido_id = v_id)) THEN RAISE EXCEPTION 'C2: debía tomarse el cobro'; END IF;
  IF NOT tienda_pago_descartar((SELECT id FROM tienda_pagos WHERE pedido_id = v_id)) THEN RAISE EXCEPTION 'C2: debía descartarse'; END IF;
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id) OR EXISTS (SELECT 1 FROM tienda_pagos WHERE pedido_id = v_id) THEN
    RAISE EXCEPTION 'C2: el descarte dejó el pedido o su pago';
  END IF;
  v_r := pg_temp.pedir('4776660007', 71, 'clave-descartada');     -- vuelve a caber: quedaban dos vivos
  IF v_r -> 'ya_existia' <> 'false'::jsonb THEN RAISE EXCEPTION 'C2: tras descartar debía crearse uno nuevo: %', v_r; END IF;
  IF NOT tienda_pago_tomar_cobro((v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'C2: el pedido nuevo trae su propio cobro, sin mandar'; END IF;
  -- Un pago que ya tiene su orden en Mercado Pago (quedó en revisión) NO se descarta, ni se vuelve a cobrar.
  PERFORM tienda_pago_anotar(v_pago, 'ORDTST777', NULL);
  IF (SELECT orden_id_externo FROM tienda_pagos WHERE id = v_pago) IS DISTINCT FROM 'ORDTST777' THEN RAISE EXCEPTION 'C2: la orden en revisión no quedó anotada'; END IF;
  IF tienda_pago_descartar(v_pago) THEN RAISE EXCEPTION 'C2: descartó un pedido cuyo cobro ya tiene orden en Mercado Pago'; END IF;
  IF tienda_pago_tomar_cobro(v_pago) THEN RAISE EXCEPTION 'C2: se iba a cobrar otra vez un pago que ya tiene orden'; END IF;
  PERFORM tienda_pago_anotar(v_pago, 'ORDTST778', 'INCIDENTE (otra moneda)');   -- ya tiene orden: no se pisa; el motivo sí se guarda
  IF (SELECT orden_id_externo || '|' || ultimo_error FROM tienda_pagos WHERE id = v_pago) IS DISTINCT FROM 'ORDTST777|INCIDENTE (otra moneda)' THEN
    RAISE EXCEPTION 'C2: anotar pisó la orden o no guardó el motivo: %', (SELECT to_jsonb(g) FROM tienda_pagos g WHERE g.id = v_pago);
  END IF;
  UPDATE tienda_pagos SET orden_id_externo = NULL, ultimo_error = NULL WHERE id = v_pago;

  -- C2c) La carrera: el aviso del rechazo llegó ANTES que la respuesta del cobro. El pago ya está
  --      RECHAZADO y el pedido cerrado «sin pago»: se descarta igual, y la misma clave vuelve a pedir.
  v_r := pg_temp.pedir('4776660008', 92, 'clave-carrera');
  PERFORM tienda_pago_tomar_cobro((v_r ->> 'pago_id')::uuid);
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDTST92', 264.00, 'credit_card', 'visa', 'insufficient_amount');
  IF (SELECT detalle FROM tienda_pagos WHERE id = (v_r ->> 'pago_id')::uuid) <> 'insufficient_amount' THEN RAISE EXCEPTION 'C2c: el motivo del rechazo no quedó guardado'; END IF;
  IF NOT tienda_pago_descartar((v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'C2c: un pago rechazado con el pedido cerrado sin pago debía poder descartarse'; END IF;
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) THEN RAISE EXCEPTION 'C2c: el descarte dejó el pedido'; END IF;
  v_r := pg_temp.pedir('4776660008', 92, 'clave-carrera');
  IF v_r -> 'ya_existia' <> 'false'::jsonb THEN RAISE EXCEPTION 'C2c: tras el descarte la misma clave debía crear un pedido nuevo: %', v_r; END IF;
  DELETE FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;
  --      Pero nunca un pedido que SÍ se pagó y después venció o se canceló, ni uno con una orden de más por devolver.
  v_id := pg_temp.pagado('4776660008', 93);
  UPDATE delivery_pedidos SET estado = 'EXPIRADO', motivo_cancelacion = 'Sin pago' WHERE id = v_id;
  IF tienda_pago_descartar((SELECT id FROM tienda_pagos WHERE pedido_id = v_id AND NOT extra)) THEN RAISE EXCEPTION 'C2c: descartó un pedido que se había pagado'; END IF;
  DELETE FROM delivery_pedidos WHERE id = v_id;
  v_r := pg_temp.pedir('4776660008', 94);
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'APROBADO', 'ORDTST94', 1.00);          -- por otro monto: queda aparte, por devolver
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDTST95', 264.00);
  IF tienda_pago_descartar((v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'C2c: descartó un pedido con una orden cobrada de más: la devolución se perdería'; END IF;
  DELETE FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;

  -- C2b) Un rechazo que se conoce DESPUÉS (la respuesta del cobro se perdió; lo dicen el aviso o el
  --      barrido): el pedido que esperaba se cierra como «sin pago», sin haber existido para la caja.
  v_r := pg_temp.pedir('4776660009', 91);
  v_a := tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', '9091', 264.00, 'credit_card', 'visa', 'cc_rejected_insufficient_amount');
  IF v_a ->> 'estado' <> 'RECHAZADO' OR v_a ->> 'pedido_estado' <> 'EXPIRADO' THEN RAISE EXCEPTION 'C2b: un rechazo tardío debía cerrar el pedido: %', v_a; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a91') || md5('pl-b91'));
  IF v_seg ->> 'estado' <> 'CANCELADO' OR v_seg ->> 'motivo' <> 'SIN_PAGO' OR v_seg ->> 'pago_estado' <> 'SIN_PAGO' THEN RAISE EXCEPTION 'C2b: seguimiento de un cobro rechazado: %', v_seg - 'renglones'; END IF;
  -- Y si ese mismo cobro apareciera aprobado después, no revive el pedido: se devuelve.
  v_a := tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'APROBADO', '9092', 264.00, 'credit_card', 'visa');
  IF v_a ->> 'estado' <> 'POR_DEVOLVER' OR v_a ->> 'pedido_estado' <> 'EXPIRADO' THEN RAISE EXCEPTION 'C2b: un aprobado tras cerrar debía devolverse: %', v_a; END IF;
  DELETE FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;   -- para no mover las cuentas de las secciones de abajo

  -- C3) Preguntarle a Mercado Pago: a lo sumo una vez cada tantos segundos.
  IF NOT tienda_pago_tomar_consulta(v_pago, 10) THEN RAISE EXCEPTION 'C3: la primera consulta debía pasar'; END IF;
  IF tienda_pago_tomar_consulta(v_pago, 10) THEN RAISE EXCEPTION 'C3: dos consultas seguidas pasaron'; END IF;
  UPDATE tienda_pagos SET consultado_at = now() - interval '11 seconds' WHERE id = v_pago;
  IF NOT tienda_pago_tomar_consulta(v_pago, 10) THEN RAISE EXCEPTION 'C3: a los 10 s debía poder consultarse otra vez'; END IF;

  -- ── D) Aplicar lo que dice Mercado Pago ─────────────────────────────────────────────────────
  -- D2) Aprobado por OTRO monto: no es el pago del pedido. Se registra aparte para devolverlo.
  v_a := tienda_pago_aplicar(v_pago, 'APROBADO', '1002', 1.00, 'credit_card', 'visa');
  IF v_a ->> 'estado' <> 'CREADO' OR v_a ->> 'pedido_estado' <> 'POR_PAGAR' OR v_a -> 'recien_aprobado' <> 'false'::jsonb THEN
    RAISE EXCEPTION 'D2: un pago por otro monto movió el pedido: %', v_a;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos WHERE pedido_id = v_ped AND extra AND orden_id_externo = '1002' AND estado = 'POR_DEVOLVER' AND monto_mxn = 1.00) THEN
    RAISE EXCEPTION 'D2: el pago por otro monto no quedó para devolver';
  END IF;

  -- D3) Aprobado y correcto: pago APROBADO, pedido RECIBIDO, y su ventana empieza AHORA (7 minutos).
  v_a := tienda_pago_aplicar(v_pago, 'APROBADO', '1003', 264.00, 'debit_card', 'master');
  IF v_a ->> 'estado' <> 'APROBADO' OR v_a ->> 'pedido_estado' <> 'RECIBIDO' OR v_a -> 'recien_aprobado' <> 'true'::jsonb THEN
    RAISE EXCEPTION 'D3: un pago aprobado: %', v_a;
  END IF;
  SELECT * INTO v_p FROM delivery_pedidos WHERE id = v_ped;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = v_pago;
  IF v_p.pagado_at IS NULL OR v_p.gestion <> 'NUBE'
     OR v_p.vence_aceptacion NOT BETWEEN now() + interval '6 minutes' AND now() + interval '8 minutes' THEN
    RAISE EXCEPTION 'D3: el pedido pagado: pagado_at %, vence %, gestión %', v_p.pagado_at, v_p.vence_aceptacion, v_p.gestion;
  END IF;
  IF v_g.orden_id_externo <> '1003' OR v_g.tipo_tarjeta <> 'debit_card' OR v_g.marca <> 'master' OR v_g.aprobado_at IS NULL THEN
    RAISE EXCEPTION 'D3: el pago aprobado: %', to_jsonb(v_g);
  END IF;

  -- D4) El mismo aviso otra vez (y un rechazo viejo que llega tarde): nada cambia.
  v_a := tienda_pago_aplicar(v_pago, 'APROBADO', '1003', 264.00, 'debit_card', 'master');
  IF v_a ->> 'estado' <> 'APROBADO' OR v_a -> 'recien_aprobado' <> 'false'::jsonb THEN RAISE EXCEPTION 'D4: el aviso repetido: %', v_a; END IF;
  v_a := tienda_pago_aplicar(v_pago, 'RECHAZADO', '1001', 264.00);
  IF v_a ->> 'estado' <> 'APROBADO' OR v_a ->> 'pedido_estado' <> 'RECIBIDO' THEN RAISE EXCEPTION 'D4: un rechazo tardío despagó el pedido: %', v_a; END IF;
  IF (SELECT count(*) FROM tienda_pagos WHERE pedido_id = v_ped) <> 2 THEN RAISE EXCEPTION 'D4: el aviso repetido creó renglones'; END IF;

  -- D5) Un SEGUNDO pago aprobado de la misma preferencia: se devuelve; el pedido sigue con el suyo.
  v_a := tienda_pago_aplicar(v_pago, 'APROBADO', '1004', 264.00, 'credit_card', 'visa');
  IF v_a ->> 'estado' <> 'APROBADO' OR NOT EXISTS (SELECT 1 FROM tienda_pagos WHERE pedido_id = v_ped AND extra AND orden_id_externo = '1004' AND estado = 'POR_DEVOLVER' AND monto_mxn = 264.00) THEN
    RAISE EXCEPTION 'D5: el segundo cobro no quedó para devolver: %', v_a;
  END IF;
  PERFORM tienda_pago_aplicar(v_pago, 'APROBADO', '1004', 264.00);   -- repetido: sigue siendo uno
  IF (SELECT count(*) FROM tienda_pagos WHERE pedido_id = v_ped AND extra) <> 2 THEN RAISE EXCEPTION 'D5: el segundo cobro se registró dos veces'; END IF;

  -- D6) Lo que no es un resultado: error, sin tocar nada.
  FOR r IN SELECT * FROM (VALUES ('PAGADO', '1'), (NULL, '1'), ('APROBADO', 'ORD con espacio'), ('APROBADO', ''), ('APROBADO', repeat('A', 65)), ('APROBADO', NULL), ('APROBADO', '1; DROP')) AS x(res, pid) LOOP
    BEGIN
      PERFORM tienda_pago_aplicar(v_pago, r.res, r.pid, 264.00);
      RAISE EXCEPTION 'D6: aceptó resultado % con pago %', r.res, r.pid;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'PAGO_RESULTADO_INVALIDO:%' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM tienda_pago_aplicar(gen_random_uuid(), 'APROBADO', '1', 1.00);
    RAISE EXCEPTION 'D6: aplicó sobre un pago que no existe';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGO_NO_EXISTE:%' THEN RAISE; END IF;
  END;

  -- D7) Ya pagado, existe para quien atiende; y el correo de confirmación sale una sola vez.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM delivery_pedidos WHERE pago_al_recibir = 'EN_LINEA';
  IF v_n <> 1 THEN RAISE EXCEPTION 'D7: el cajero debía ver solo el pedido pagado y ve %', v_n; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF NOT tienda_pago_tomar_correo(v_pago) OR tienda_pago_tomar_correo(v_pago) THEN RAISE EXCEPTION 'D7: el correo debía tomarse una vez y solo una'; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a1') || md5('pl-b1'));
  IF v_seg ->> 'estado' <> 'EN_PROCESO' OR v_seg ->> 'pago_estado' <> 'PAGADO' THEN RAISE EXCEPTION 'D7: seguimiento de un pedido pagado: %', v_seg - 'renglones'; END IF;

  -- ── E) Aceptar un pedido pagado: la cuenta nace cobrada ─────────────────────────────────────
  v_ticket := crear_ticket_desde_tienda(v_ped);
  SELECT estado_fiscal::text INTO v_txt FROM tickets WHERE id = v_ticket;
  IF v_txt <> 'PAGADO' THEN RAISE EXCEPTION 'E1: la cuenta debía nacer PAGADA y quedó %', v_txt; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_ticket) <> 240.00 OR (SELECT propina_mxn FROM tickets WHERE id = v_ticket) <> 24.00
     OR (SELECT monto_pagado_mxn FROM tickets WHERE id = v_ticket) <> 264.00 THEN
    RAISE EXCEPTION 'E1: total, propina o pagado de la cuenta: %', (SELECT jsonb_build_object('total', total_mxn, 'propina', propina_mxn, 'pagado', monto_pagado_mxn) FROM tickets WHERE id = v_ticket);
  END IF;
  IF (SELECT nota_general FROM tickets WHERE id = v_ticket) NOT LIKE 'PAGADO EN LÍNEA, no cobrar%' THEN RAISE EXCEPTION 'E1: la nota de la cuenta no dice que está pagada y que no se cobra'; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_ticket AND metodo_pago = 'PAGO_EN_LINEA' AND monto_mxn = 264.00 AND estado = 'APLICADO';
  IF v_n <> 1 THEN RAISE EXCEPTION 'E1: debía haber UN pago PAGO_EN_LINEA de 264.00 y hay %', v_n; END IF;
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped) <> 'ACEPTADO' THEN RAISE EXCEPTION 'E1: el pedido no quedó ACEPTADO'; END IF;
  -- Idempotente: no cobra dos veces.
  IF crear_ticket_desde_tienda(v_ped) <> v_ticket THEN RAISE EXCEPTION 'E1: aceptar dos veces dio otra cuenta'; END IF;
  IF (SELECT count(*) FROM pagos WHERE ticket_id = v_ticket) <> 1 THEN RAISE EXCEPTION 'E1: aceptar dos veces duplicó el pago'; END IF;

  -- E2) El corte lo suma en su renglón, y la propina en la del turno.
  SELECT id INTO v_turno FROM turnos WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT (m ->> 'monto_total_mxn')::numeric INTO STRICT v_n FROM jsonb_array_elements(reporte_x(v_turno) -> 'pagos_por_metodo') m WHERE m ->> 'metodo_pago' = 'PAGO_EN_LINEA';
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF v_n <> 264 THEN RAISE EXCEPTION 'E2: el corte debía traer 264.00 en PAGO_EN_LINEA y trae %', v_n; END IF;

  -- E3) Cobrada no es entregada: ni el seguimiento ni la pasada de la nube lo dan por entregado.
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped) <> 'ACEPTADO' THEN RAISE EXCEPTION 'E3: la nube dio por entregado un pedido solo por estar cobrado'; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a1') || md5('pl-b1'));
  IF v_seg ->> 'estado' <> 'EN_PREPARACION' OR v_seg ->> 'pago_estado' <> 'PAGADO' THEN RAISE EXCEPTION 'E3: seguimiento tras aceptar: %', v_seg - 'renglones'; END IF;
  -- Impreso → listo, como siempre.
  UPDATE tickets SET ticket_impreso_at = now() WHERE id = v_ticket;
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped) <> 'LISTO' THEN RAISE EXCEPTION 'E3: impreso debía pasar a LISTO'; END IF;
  -- «Listo» del cajero → entregado. Y el pago se queda: entregar no devuelve nada.
  IF tienda_reportar_estado(v_t, v_ped, 'ENTREGADO') <> 'ENTREGADO' THEN RAISE EXCEPTION 'E3: no se pudo marcar entregado'; END IF;
  IF pg_temp.pago_de(v_ped) <> 'APROBADO' THEN RAISE EXCEPTION 'E3: entregar movió el pago a %', pg_temp.pago_de(v_ped); END IF;
  IF (tienda_seguimiento(v_t, md5('pl-a1') || md5('pl-b1')) ->> 'estado') <> 'ENTREGADO' THEN RAISE EXCEPTION 'E3: el cliente no ve Entregado'; END IF;

  -- E4) En la caja instalada no hay tienda_pagos: el pedido pagado que le llega se cobra igual.
  v_id := pg_temp.pagado('4776660041', 41);
  DELETE FROM tienda_pagos WHERE pedido_id = v_id;
  v_ticket := crear_ticket_desde_tienda(v_id);
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_ticket) <> 'PAGADO'
     OR (SELECT count(*) FROM pagos WHERE ticket_id = v_ticket AND metodo_pago = 'PAGO_EN_LINEA' AND monto_mxn = 264.00) <> 1 THEN
    RAISE EXCEPTION 'E4: sin tienda_pagos (la caja) la cuenta no nació cobrada';
  END IF;
  -- E5) El pago en línea no se edita en caja: ni cambiar la forma de pago, ni reabrir, ni devolución.
  BEGIN
    UPDATE pagos SET metodo_pago = 'EFECTIVO' WHERE ticket_id = v_ticket;
    RAISE EXCEPTION 'E5: se cambió la forma de pago de una cuenta pagada en línea';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Esta cuenta se pagó en línea%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE pagos SET estado = 'CANCELADO', deleted_at = now() WHERE ticket_id = v_ticket;   -- lo que hace reabrir_ticket_pagado
    RAISE EXCEPTION 'E5: se anuló el pago de una cuenta pagada en línea (reabrir)';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Esta cuenta se pagó en línea%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE pagos SET metodo_pago = 'PAGO_EN_LINEA' WHERE ticket_id = (SELECT id FROM tickets WHERE tenant_id = v_t AND id <> v_ticket LIMIT 1) AND metodo_pago <> 'PAGO_EN_LINEA';
    IF FOUND THEN RAISE EXCEPTION 'E5: un cobro de caja se pudo convertir en pago en línea'; END IF;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Esta cuenta se pagó en línea%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM pagos WHERE ticket_id = v_ticket AND metodo_pago = 'PAGO_EN_LINEA' AND estado = 'APLICADO' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'E5: el pago en línea no quedó intacto';
  END IF;
  -- Devolución suelta (la pantalla Devoluciones): el disparador corre antes que cualquier otra validación.
  BEGIN
    INSERT INTO devoluciones (tenant_id, ticket_original_id, alcance, motivo, medio_devolucion)
    VALUES (v_t, v_ticket, 'TOTAL', 'CLIENTE_NO_SATISFECHO', 'EFECTIVO');
    RAISE EXCEPTION 'E5: se registró una devolución de caja sobre una cuenta pagada en línea';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Esta cuenta se pagó en línea: no se le hace devolución en caja%' THEN RAISE; END IF;
  END;

  -- E6) «Listo» en la caja instalada: sella entregado_at en la copia local y no toca el estado.
  UPDATE delivery_pedidos SET gestion = 'ESCRITORIO' WHERE id = v_id;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM tienda_marcar_entregado(v_id);
  SELECT * INTO v_p FROM delivery_pedidos WHERE id = v_id;
  IF v_p.entregado_at IS NULL OR v_p.estado <> 'ACEPTADO' THEN RAISE EXCEPTION 'E6: «Listo» debía sellar entregado_at sin tocar el estado: % / %', v_p.entregado_at, v_p.estado; END IF;
  PERFORM tienda_marcar_entregado(v_id);   -- dos toques no cambian la hora
  IF (SELECT entregado_at FROM delivery_pedidos WHERE id = v_id) <> v_p.entregado_at THEN RAISE EXCEPTION 'E6: el segundo «Listo» movió la hora'; END IF;
  -- Ni de otro negocio, ni un pedido que atiende el POS web (ese va por delivery-accion).
  BEGIN
    PERFORM tienda_marcar_entregado(v_ped);
    RAISE EXCEPTION 'E6: se marcó por aquí un pedido que no atiende una caja instalada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ACCION_INVALIDA:%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  BEGIN
    PERFORM tienda_marcar_entregado(v_id);
    RAISE EXCEPTION 'E6: otro negocio marcó entregado un pedido ajeno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ACCION_INVALIDA:%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- E7) Cancelar la cuenta pagada en línea: aunque la caja pida «en efectivo», del cajón no sale nada.
  v_num := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_cajero, v_cajero, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_ticket, 264.00, 'Cliente desistió')
  RETURNING id INTO v_ped2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM cancelar_ticket_pagado(v_ticket, v_caja, v_turno, 'CLIENTE_DESISTIO'::cancelacion_motivo, NULL, v_ped2, v_cajero, v_cajero,
    true, false, true, 'EFECTIVO'::devolucion_medio, NULL, 'smoke-pl-cancel');
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_ticket) <> 'CANCELADO' THEN RAISE EXCEPTION 'E7: la cuenta no quedó cancelada'; END IF;
  IF (SELECT medio_devolucion::text FROM devoluciones WHERE ticket_original_id = v_ticket) <> 'MISMO_METODO_PAGO' THEN
    RAISE EXCEPTION 'E7: la devolución de una cuenta pagada en línea salió como %', (SELECT medio_devolucion FROM devoluciones WHERE ticket_original_id = v_ticket);
  END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_num THEN RAISE EXCEPTION 'E7: cancelar movió el efectivo esperado de % a %', v_num, calcular_efectivo_esperado(v_turno); END IF;

  -- Y en la nube, con el pago sin aprobar, no hay cuenta.
  v_id := pg_temp.pagado('4776660042', 42);
  UPDATE tienda_pagos SET estado = 'CREADO' WHERE pedido_id = v_id;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_id);
    RAISE EXCEPTION 'E4: se aceptó un pedido con el pago sin aprobar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGO_NO_APROBADO:%' THEN RAISE; END IF;
  END;
  UPDATE tienda_pagos SET estado = 'APROBADO' WHERE pedido_id = v_id;

  -- ── F) Devoluciones: cada camino por el que un pedido pagado termina mal ─────────────────────
  -- F1) El cajero lo rechaza (delivery-accion escribe el estado directo).
  v_id := pg_temp.pagado('4776660051', 51);
  UPDATE delivery_pedidos SET estado = 'RECHAZADO', cancelado_at = now(), motivo_cancelacion = 'AGOTADO' WHERE id = v_id;
  IF pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'F1: rechazado, el pago quedó %', pg_temp.pago_de(v_id); END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a51') || md5('pl-b51'));
  IF v_seg ->> 'estado' <> 'CANCELADO' OR v_seg ->> 'motivo' <> 'AGOTADO' OR v_seg ->> 'pago_estado' <> 'DEVOLUCION_EN_PROCESO' THEN
    RAISE EXCEPTION 'F1: seguimiento de un pedido rechazado y pagado: %', v_seg - 'renglones';
  END IF;

  -- F2) Nadie lo aceptó a tiempo (el barrido de vencidos de siempre).
  v_id := pg_temp.pagado('4776660052', 52);
  UPDATE delivery_pedidos SET vence_aceptacion = now() - interval '1 minute' WHERE id = v_id;
  PERFORM delivery_marcar_expirados();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'EXPIRADO' OR pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'F2: vencido sin aceptar, el pago quedó %', pg_temp.pago_de(v_id);
  END IF;
  IF (tienda_seguimiento(v_t, md5('pl-a52') || md5('pl-b52')) ->> 'motivo') <> 'SIN_RESPUESTA' THEN RAISE EXCEPTION 'F2: un pagado que nadie aceptó es SIN_RESPUESTA, no SIN_PAGO'; END IF;

  -- F3) La caja reporta la cuenta cancelada.
  v_id := pg_temp.pagado('4776660053', 53);
  UPDATE delivery_pedidos SET estado = 'ACEPTADO', aceptado_at = now(), gestion = 'ESCRITORIO' WHERE id = v_id;
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO', 'OTRO') <> 'CANCELADO' OR pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'F3: cancelado por la caja, el pago quedó %', pg_temp.pago_de(v_id);
  END IF;

  -- F4) Una caja lo aceptó y en 15 minutos no lo tomó.
  v_id := pg_temp.pagado('4776660054', 54);
  UPDATE delivery_pedidos SET estado = 'ACEPTADO', aceptado_at = now() - interval '16 minutes', gestion = 'ESCRITORIO' WHERE id = v_id;
  PERFORM delivery_marcar_expirados();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'CANCELADO' OR pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'F4: aceptado sin tomar, el pago quedó %', pg_temp.pago_de(v_id);
  END IF;

  -- F5) Atendido desde el POS web y se cancela la cuenta: la pasada de la nube lo ve.
  v_id := pg_temp.pagado('4776660055', 55);
  v_ticket := crear_ticket_desde_tienda(v_id);
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_ticket;
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'CANCELADO' OR pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'F5: cuenta cancelada en la nube, el pago quedó %', pg_temp.pago_de(v_id);
  END IF;

  -- F6) Un pedido al recibir que se rechaza no toca tienda_pagos (no tiene nada ahí).
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, (SELECT format('[{"producto_id":"%s","cantidad":1}]', id)::jsonb FROM productos WHERE tenant_id = v_t AND nombre = 'Sencilla en línea'),
           '{"nombre":"Ana","telefono":"4776660056"}', NULL, 'EFECTIVO', NULL, NULL, md5('pl-efe-a') || md5('pl-efe-b'));
  IF (SELECT count(*) FROM jsonb_object_keys(v_r)) <> 5 OR v_r -> 'vence_aceptacion' = 'null'::jsonb THEN RAISE EXCEPTION 'F6: un pedido en efectivo cambió de forma: %', v_r; END IF;
  IF (SELECT estado FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 'RECIBIDO' THEN RAISE EXCEPTION 'F6: un pedido en efectivo no nació RECIBIDO'; END IF;
  UPDATE delivery_pedidos SET estado = 'RECHAZADO' WHERE id = (v_r ->> 'pedido_id')::uuid;
  IF tienda_seguimiento(v_t, md5('pl-efe-a') || md5('pl-efe-b')) ?| ARRAY['pago_estado', 'propina_mxn', 'total_a_pagar_mxn', 'vence_pago'] THEN RAISE EXCEPTION 'F6: el seguimiento de un pedido en efectivo cambió de forma'; END IF;

  -- F7) El barrido toma cada devolución una vez, y nunca antes de un minuto del cobro (Mercado Pago
  --     rechaza la devolución pedida enseguida). Cada fallo espera más: 1, 5, 30 minutos, 3 y 12
  --     horas; al sexto deja de insistir. Con éxito, DEVUELTO.
  SELECT count(*) INTO v_n FROM tienda_pagos_tomar(50) WHERE tarea = 'DEVOLVER';
  IF v_n <> 0 THEN RAISE EXCEPTION 'F7: tomó % devoluciones de cobros de hace menos de un minuto', v_n; END IF;
  UPDATE tienda_pagos SET aprobado_at = now() - interval '61 seconds' WHERE estado = 'POR_DEVOLVER';
  SELECT count(*), count(t.orden_id_externo) INTO v_n, v_num FROM tienda_pagos_tomar(50) t WHERE t.tarea = 'DEVOLVER';
  IF v_n <> 7 OR v_num <> 7 THEN RAISE EXCEPTION 'F7: debía tomar 7 devoluciones (5 pedidos y 2 cobros de más), cada una con su orden, y tomó % (% con orden)', v_n, v_num; END IF;
  SELECT count(*) INTO v_n FROM tienda_pagos_tomar(50) WHERE tarea = 'DEVOLVER';
  IF v_n <> 0 THEN RAISE EXCEPTION 'F7: la segunda pasada volvió a tomar % devoluciones', v_n; END IF;
  SELECT id INTO v_id FROM tienda_pagos WHERE pedido_id = v_ped AND orden_id_externo = '1004';
  FOR r IN SELECT * FROM (VALUES (1, 1), (2, 5), (3, 30), (4, 180), (5, 720)) AS x(fallo, minutos) LOOP
    IF tienda_pago_devolucion(v_id, false, 'saldo insuficiente') <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'F7: al fallo % ya no quedó POR_DEVOLVER', r.fallo; END IF;
    IF (SELECT proximo_intento_at FROM tienda_pagos WHERE id = v_id) IS DISTINCT FROM now() + make_interval(mins => r.minutos) THEN
      RAISE EXCEPTION 'F7: tras el fallo % debía esperar % minutos y espera hasta %', r.fallo, r.minutos, (SELECT proximo_intento_at - now() FROM tienda_pagos WHERE id = v_id);
    END IF;
    IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_id) THEN RAISE EXCEPTION 'F7: se reintentó antes de la espera del fallo %', r.fallo; END IF;
  END LOOP;
  UPDATE tienda_pagos SET proximo_intento_at = now() WHERE id = v_id;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_id AND t.tarea = 'DEVOLVER') THEN RAISE EXCEPTION 'F7: cumplida la espera debía reintentarse'; END IF;
  IF tienda_pago_devolucion(v_id, false, 'saldo insuficiente') <> 'DEVOLUCION_FALLIDA' THEN
    RAISE EXCEPTION 'F7: el sexto fallo debía dejarlo en DEVOLUCION_FALLIDA: %', (SELECT to_jsonb(g) FROM tienda_pagos g WHERE g.id = v_id);
  END IF;
  UPDATE tienda_pagos SET proximo_intento_at = NULL WHERE estado IN ('POR_DEVOLVER', 'DEVOLUCION_FALLIDA');
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_id) THEN RAISE EXCEPTION 'F7: una devolución fallida se volvió a tomar'; END IF;
  SELECT id INTO v_id FROM tienda_pagos WHERE pedido_id = v_ped AND orden_id_externo = '1002';
  -- (En dos sentencias: una subconsulta en la misma sentencia no vería lo que la función acaba de escribir.)
  IF tienda_pago_devolucion(v_id, true) <> 'DEVUELTO' THEN RAISE EXCEPTION 'F7: una devolución hecha debía quedar DEVUELTO'; END IF;
  IF (SELECT devuelto_at FROM tienda_pagos WHERE id = v_id) IS NULL THEN RAISE EXCEPTION 'F7: la devolución hecha no selló devuelto_at'; END IF;
  -- Mercado Pago avisa que un pago ya está devuelto: lo mismo, y el seguimiento lo dice.
  v_id := (SELECT id FROM delivery_pedidos WHERE cliente_telefono = '4776660051');
  PERFORM tienda_pago_aplicar((SELECT id FROM tienda_pagos WHERE pedido_id = v_id AND NOT extra), 'DEVUELTO', '900051', 264.00);
  IF pg_temp.pago_de(v_id) <> 'DEVUELTO' OR (tienda_seguimiento(v_t, md5('pl-a51') || md5('pl-b51')) ->> 'pago_estado') <> 'DEVUELTO' THEN
    RAISE EXCEPTION 'F7: el aviso de devuelto no dejó el pago DEVUELTO';
  END IF;

  -- ── G) El barrido: lo que nadie pagó ────────────────────────────────────────────────────────
  v_r := pg_temp.pedir('4776660061', 61);    -- viejo: 18 minutos
  v_r2 := pg_temp.pedir('4776660062', 62);   -- reciente: 4 minutos, todavía dentro del plazo
  UPDATE delivery_pedidos SET created_at = now() - interval '4 minutes' WHERE id = (v_r2 ->> 'pedido_id')::uuid;
  v_a := pg_temp.pedir('4776660063', 63);    -- vencido y su cobro NUNCA se mandó (la función se cayó antes)
  UPDATE delivery_pedidos SET created_at = now() - interval '6 minutes' WHERE id = (v_a ->> 'pedido_id')::uuid;
  UPDATE delivery_pedidos SET created_at = now() - interval '6 minutes' WHERE id = (v_r ->> 'pedido_id')::uuid;
  UPDATE tienda_pagos SET vence_at = now() - interval '3 minutes', cobro_pedido_at = now() - interval '10 minutes' WHERE id = (v_r ->> 'pago_id')::uuid;
  SELECT count(*) INTO v_n FROM delivery_eventos;
  PERFORM tienda_pagos_barrer();   -- sin pg_net ni Vault aquí: la llamada se omite y lo demás funciona
  -- …pero no en silencio: hay pagos sin atender y queda a la vista, un renglón por hora.
  PERFORM tienda_pagos_barrer();
  IF (SELECT count(*) FROM tienda_eventos WHERE accion = 'barrido:sin_configurar' AND payload ->> 'vim_interno' = 'false') <> 1 THEN
    RAISE EXCEPTION 'G1: el barrido que no puede correr debía dejar UN rastro en tienda_eventos y dejó %', (SELECT count(*) FROM tienda_eventos WHERE accion = 'barrido:sin_configurar');
  END IF;
  IF (SELECT estado FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 'EXPIRADO' OR (SELECT estado FROM tienda_pagos WHERE id = (v_r ->> 'pago_id')::uuid) <> 'VENCIDO' THEN
    RAISE EXCEPTION 'G1: un pedido de 6 minutos sin cobro confirmado debía vencer';
  END IF;
  IF (SELECT estado FROM delivery_pedidos WHERE id = (v_r2 ->> 'pedido_id')::uuid) <> 'POR_PAGAR' THEN RAISE EXCEPTION 'G1: venció un pedido de 4 minutos'; END IF;
  -- Sin cobro mandado no hay nada que confirmar: se dice «sin pago» desde ya, no «confirmando».
  v_seg := tienda_seguimiento(v_t, md5('pl-a63') || md5('pl-b63'));
  IF v_seg ->> 'motivo' <> 'SIN_PAGO' OR v_seg ->> 'pago_estado' <> 'SIN_PAGO' THEN RAISE EXCEPTION 'G1: vencido sin haber mandado el cobro: %', v_seg - 'renglones'; END IF;
  DELETE FROM delivery_pedidos WHERE id = (v_a ->> 'pedido_id')::uuid;
  IF (SELECT count(*) FROM delivery_eventos) <> v_n THEN RAISE EXCEPTION 'G1: vencer un pedido sin pagar dejó un evento'; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a61') || md5('pl-b61'));
  IF v_seg ->> 'estado' <> 'CANCELADO' OR v_seg ->> 'motivo' <> 'POR_CONFIRMAR' OR v_seg ->> 'pago_estado' <> 'POR_CONFIRMAR' THEN RAISE EXCEPTION 'G1: seguimiento de un pedido recién vencido, antes de consultar a Mercado Pago: %', v_seg - 'renglones'; END IF;
  -- Sigue sin existir para quien atiende, ni en la lista ni en el contador de vencidos del día: la
  -- vista que alimenta la alerta del POS y del admin cuenta, sin política, uno más (este) que con ella.
  SELECT COALESCE(sum(n_expirados), 0) INTO v_n FROM vw_delivery_expirados_hoy WHERE sucursal_id = v_suc;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) THEN RAISE EXCEPTION 'G1: el cajero ve un pedido que venció sin pagarse'; END IF;
  IF v_n - (SELECT COALESCE(sum(n_expirados), 0) FROM vw_delivery_expirados_hoy WHERE sucursal_id = v_suc) <> 1 THEN
    RAISE EXCEPTION 'G1: el contador de vencidos del día cuenta el pedido que venció sin pagarse (sin política %)', v_n;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- G1b) Lo que NO es en línea se ve como siempre: el de pago al recibir, y el que no tiene forma de
  --      pago (así son todos los de Uber: pago_al_recibir nulo). Es lo que la política no debe tocar.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
  VALUES (v_t, v_suc, 'TIENDA', 'DRIVE_THRU', 'linea-smoke-sin-pago', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0);
  SELECT count(*) INTO v_n FROM delivery_pedidos WHERE tenant_id = v_t AND pago_al_recibir IS DISTINCT FROM 'EN_LINEA';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  IF (SELECT count(*) FROM delivery_pedidos WHERE pago_al_recibir IS DISTINCT FROM 'EN_LINEA') <> v_n
     OR NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id_externo = 'linea-smoke-sin-pago')
     OR NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE pago_al_recibir = 'EFECTIVO') THEN
    RAISE EXCEPTION 'G1b: la política esconde pedidos que no son en línea (sin política %)', v_n;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- G2) Ya vencido, se le pregunta a Mercado Pago una última vez (CONCILIAR)…
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.tarea = 'CONCILIAR' AND t.id = (v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'G2: el pago vencido no salió para conciliar'; END IF;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.tarea = 'CONCILIAR' AND t.id = (v_r2 ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'G2: salió para conciliar un pago que aún puede pagarse'; END IF;
  -- …y si resulta que sí se cobró, llegó tarde: se devuelve y el pedido sigue vencido.
  v_a := tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'APROBADO', '1061', 264.00, 'credit_card', 'visa');
  IF v_a ->> 'estado' <> 'POR_DEVOLVER' OR v_a ->> 'pedido_estado' <> 'EXPIRADO' OR v_a -> 'recien_aprobado' <> 'false'::jsonb THEN RAISE EXCEPTION 'G2: un pago tardío: %', v_a; END IF;
  IF (tienda_seguimiento(v_t, md5('pl-a61') || md5('pl-b61')) ->> 'pago_estado') <> 'DEVOLUCION_EN_PROCESO' THEN RAISE EXCEPTION 'G2: el seguimiento no dice que se le devuelve'; END IF;

  -- ── I) Revisión de la entrega 1 ─────────────────────────────────────────────────────────────
  -- I1) Venció y no se ha podido preguntar a Mercado Pago (la cuenta perdió el token): el seguimiento
  --     NO afirma «sin pago», se cuentan los fallos, el TERCERO avisa (una sola vez) y deja de
  --     preguntarse cada minuto: una vez por hora.
  v_r := pg_temp.pedir('4776660081', 81);
  v_pago := (v_r ->> 'pago_id')::uuid;
  UPDATE delivery_pedidos SET created_at = now() - interval '6 minutes' WHERE id = (v_r ->> 'pedido_id')::uuid;
  UPDATE tienda_pagos SET created_at = now() - interval '18 minutes', vence_at = now() - interval '3 minutes', cobro_pedido_at = now() - interval '10 minutes' WHERE id = v_pago;
  PERFORM tienda_pagos_barrer();
  v_seg := tienda_seguimiento(v_t, md5('pl-a81') || md5('pl-b81'));
  IF v_seg ->> 'estado' <> 'CANCELADO' OR v_seg ->> 'pago_estado' <> 'POR_CONFIRMAR' OR v_seg ->> 'motivo' <> 'POR_CONFIRMAR' THEN
    RAISE EXCEPTION 'I1: vencido y sin poder consultar, el seguimiento debía decir POR_CONFIRMAR: %', v_seg - 'renglones';
  END IF;
  IF tienda_pago_conciliacion(v_pago, false) OR tienda_pago_conciliacion(v_pago, false) THEN RAISE EXCEPTION 'I1: avisó antes del tercer fallo'; END IF;
  IF NOT tienda_pago_conciliacion(v_pago, false) THEN RAISE EXCEPTION 'I1: el tercer fallo debía avisar'; END IF;
  IF tienda_pago_conciliacion(v_pago, false) THEN RAISE EXCEPTION 'I1: el cuarto fallo volvió a avisar'; END IF;
  UPDATE tienda_pagos SET consultado_at = now() - interval '10 minutes' WHERE id = v_pago;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I1: con tres fallos se siguió preguntando antes de una hora'; END IF;
  UPDATE tienda_pagos SET consultado_at = now() - interval '61 minutes' WHERE id = v_pago;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago AND t.tarea = 'CONCILIAR') THEN RAISE EXCEPTION 'I1: pasada una hora debía volver a preguntarse'; END IF;
  IF (tienda_seguimiento(v_t, md5('pl-a81') || md5('pl-b81')) ->> 'pago_estado') <> 'POR_CONFIRMAR' THEN RAISE EXCEPTION 'I1: con fallos, sigue sin poder afirmarse nada'; END IF;

  -- I1b/I5) Mercado Pago por fin contesta que no hay pago: ahora sí «sin pago». Pero no se da por
  --     cerrado: falta la segunda pasada, alrededor de una hora después del plazo.
  IF tienda_pago_conciliacion(v_pago, true) THEN RAISE EXCEPTION 'I5: una consulta que salió bien avisó'; END IF;
  v_seg := tienda_seguimiento(v_t, md5('pl-a81') || md5('pl-b81'));
  IF v_seg ->> 'pago_estado' <> 'SIN_PAGO' OR v_seg ->> 'motivo' <> 'SIN_PAGO' THEN RAISE EXCEPTION 'I5: consultado y sin pago: %', v_seg - 'renglones'; END IF;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = v_pago;
  IF v_g.conciliaciones <> 1 OR v_g.conciliacion_fallos <> 0 OR v_g.conciliado_at IS NOT NULL THEN RAISE EXCEPTION 'I5: tras la primera respuesta: %', to_jsonb(v_g); END IF;
  UPDATE tienda_pagos SET consultado_at = now() - interval '30 minutes' WHERE id = v_pago;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I5: la segunda pasada salió antes de la hora'; END IF;
  UPDATE tienda_pagos SET vence_at = now() - interval '61 minutes' WHERE id = v_pago;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago AND t.tarea = 'CONCILIAR') THEN RAISE EXCEPTION 'I5: una hora después del plazo debía preguntarse otra vez'; END IF;
  PERFORM tienda_pago_conciliacion(v_pago, true);
  UPDATE tienda_pagos SET consultado_at = now() - interval '5 hours' WHERE id = v_pago;
  IF (SELECT conciliado_at FROM tienda_pagos WHERE id = v_pago) IS NULL OR EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN
    RAISE EXCEPTION 'I5: tras la segunda respuesta debía darse por conciliado y no volver a salir';
  END IF;
  -- Y si en esa segunda pasada sí aparece el cobro, se devuelve (tienda_pago_aplicar lo acepta de un VENCIDO).
  v_a := tienda_pago_aplicar(v_pago, 'APROBADO', '1081', 264.00);
  IF v_a ->> 'estado' <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'I5: un aprobado que aparece en la segunda pasada no quedó para devolver: %', v_a; END IF;
  -- Nunca pasadas 48 horas del plazo.
  v_r := pg_temp.pedir('4776660082', 82);
  UPDATE delivery_pedidos SET estado = 'EXPIRADO' WHERE id = (v_r ->> 'pedido_id')::uuid;
  UPDATE tienda_pagos SET estado = 'VENCIDO', created_at = now() - interval '50 hours', vence_at = now() - interval '49 hours', cobro_pedido_at = now() - interval '10 minutes' WHERE id = (v_r ->> 'pago_id')::uuid;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = (v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'I1: se sigue preguntando por un pago 48 horas después de su plazo'; END IF;

  -- I3) No se espera al vencimiento: un cobro del que no se supo el resultado se concilia desde los 20
  --     segundos de mandado, y a lo sumo cada 45 (el aviso se perdió y el cliente no está en la página).
  v_r := pg_temp.pedir('4776660083', 83);
  v_pago := (v_r ->> 'pago_id')::uuid;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I3: se concilió un pago cuyo cobro nunca se mandó'; END IF;
  UPDATE tienda_pagos SET cobro_pedido_at = now() - interval '5 seconds' WHERE id = v_pago;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I3: se concilió un cobro mandado hace 5 segundos'; END IF;
  UPDATE tienda_pagos SET cobro_pedido_at = now() - interval '30 seconds' WHERE id = v_pago;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago AND t.tarea = 'CONCILIAR') THEN RAISE EXCEPTION 'I3: un cobro mandado hace 30 segundos debía salir para conciliar'; END IF;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I3: se consultó dos veces seguidas el mismo pago'; END IF;
  UPDATE tienda_pagos SET consultado_at = now() - interval '20 seconds' WHERE id = v_pago;
  IF EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I3: se volvió a consultar antes de 45 segundos'; END IF;
  -- La página del pedido comparte ese reloj: si ella acaba de preguntar, el barrido no repite.
  UPDATE tienda_pagos SET consultado_at = now() - interval '3 minutes' WHERE id = v_pago;
  IF NOT tienda_pago_tomar_consulta(v_pago, 10) OR EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = v_pago) THEN RAISE EXCEPTION 'I3: el barrido repitió la consulta que acababa de hacer la página'; END IF;
  -- Una respuesta con el pago aún vivo no cuenta como conciliación final.
  PERFORM tienda_pago_conciliacion(v_pago, true);
  IF (SELECT conciliaciones FROM tienda_pagos WHERE id = v_pago) <> 0 THEN RAISE EXCEPTION 'I3: una consulta con el pago vivo contó como conciliación final'; END IF;

  -- I1c) El turno: va primero quien lleva más sin consultarse (el nunca consultado, antes que nadie),
  --      no el más viejo. Un pago atascado no le quita el turno a los demás.
  UPDATE tienda_pagos SET created_at = now() - interval '14 minutes', consultado_at = now() - interval '3 minutes' WHERE id = v_pago;   -- el más viejo, ya consultado
  v_r2 := pg_temp.pedir('4776660084', 84);
  UPDATE tienda_pagos SET cobro_pedido_at = now() - interval '10 minutes', created_at = now() - interval '3 minutes' WHERE id = (v_r2 ->> 'pago_id')::uuid;   -- más nuevo, nunca consultado
  IF (SELECT t.id FROM tienda_pagos_tomar(1) t WHERE t.tarea = 'CONCILIAR') IS DISTINCT FROM (v_r2 ->> 'pago_id')::uuid THEN
    RAISE EXCEPTION 'I1c: con un solo turno debía tocarle al que nunca se ha consultado';
  END IF;

  -- I4) Al pagarse, el pedido va a una caja solo si late una que sepa de pedidos pagados (0.9.0).
  --     (Se pide sin caja viva y la caja aparece mientras el cliente paga.)
  FOR r IN SELECT * FROM (VALUES (85, '0.8.0', 'NUBE'), (86, '0.9.0', 'ESCRITORIO'), (87, NULL, 'NUBE')) AS x(n, version, gestion) LOOP
    UPDATE cajas SET espejo_apps_at = NULL, version_app = NULL WHERE id = v_caja;
    v_r := pg_temp.pedir('47766600' || r.n, r.n);
    UPDATE cajas SET espejo_apps_at = now(), version_app = r.version WHERE id = v_caja;
    PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'APROBADO', (900000 + r.n)::text, 264.00);
    SELECT gestion INTO v_txt FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;
    IF v_txt <> r.gestion THEN RAISE EXCEPTION 'I4: pagado con una caja viva en la versión %, la gestión fue % (esperaba %)', COALESCE(r.version, 'NULL'), v_txt, r.gestion; END IF;
  END LOOP;
  UPDATE cajas SET espejo_apps_at = NULL, version_app = NULL WHERE id = v_caja;

  -- I7) Cancelar la cuenta de un pedido pagado en línea YA ENTREGADO devuelve el pago.
  --     En la nube (POS web): la pasada lo ve por el ticket cancelado.
  v_id := pg_temp.pagado('4776660091', 91);
  v_ticket := crear_ticket_desde_tienda(v_id);
  IF tienda_reportar_estado(v_t, v_id, 'ENTREGADO') <> 'ENTREGADO' THEN RAISE EXCEPTION 'I7 (fixture): no se pudo entregar'; END IF;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_ticket;
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'CANCELADO' OR pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'I7: cuenta cancelada tras entregar (nube): pedido %, pago %', (SELECT estado FROM delivery_pedidos WHERE id = v_id), pg_temp.pago_de(v_id);
  END IF;
  -- Sin doble devolución: ya devuelto, otra pasada y otro reporte no lo vuelven a encolar.
  PERFORM tienda_pago_devolucion((SELECT id FROM tienda_pagos WHERE pedido_id = v_id AND NOT extra), true);
  PERFORM tienda_sincronizar_estados_nube();
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO') <> 'CANCELADO' THEN RAISE EXCEPTION 'I7: repetir el cancelado debía devolver el estado actual'; END IF;
  IF pg_temp.pago_de(v_id) <> 'DEVUELTO' THEN RAISE EXCEPTION 'I7: un pago ya devuelto volvió a %', pg_temp.pago_de(v_id); END IF;
  --     Por el camino de la caja: reporta CANCELADO de un pedido que ya había reportado ENTREGADO.
  v_id := pg_temp.pagado('4776660092', 92);
  UPDATE delivery_pedidos SET estado = 'ENTREGADO', entregado_at = now(), gestion = 'ESCRITORIO' WHERE id = v_id;
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO', 'OTRO') <> 'CANCELADO' THEN RAISE EXCEPTION 'I7: la caja no pudo cancelar un pedido en línea ya entregado'; END IF;
  IF pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'I7: cancelado tras entregar (caja), el pago quedó %', pg_temp.pago_de(v_id); END IF;
  --     Un pedido AL RECIBIR ya entregado sigue como antes: ni la caja ni la nube lo cancelan.
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, (SELECT format('[{"producto_id":"%s","cantidad":1}]', id)::jsonb FROM productos WHERE tenant_id = v_t AND nombre = 'Sencilla en línea'),
           '{"nombre":"Ana","telefono":"4776660093"}', NULL, 'EFECTIVO', NULL, NULL, md5('pl-efe-c') || md5('pl-efe-d'));
  v_id := (v_r ->> 'pedido_id')::uuid;
  v_ticket := crear_ticket_desde_tienda(v_id);
  UPDATE delivery_pedidos SET estado = 'ENTREGADO' WHERE id = v_id;
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO') <> 'ENTREGADO' THEN RAISE EXCEPTION 'I7: se canceló un pedido al recibir ya entregado'; END IF;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_ticket;
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ENTREGADO' THEN RAISE EXCEPTION 'I7: la nube canceló un pedido al recibir ya entregado'; END IF;

  -- I8) La caja estuvo sin internet y la nube canceló un pedido pagado que la caja ya había aceptado:
  --     el pago se devuelve UNA vez. Cuando la caja vuelve, el cajero cancela esa cuenta (se lo pide
  --     el aviso): ni falla, ni dispara otra devolución, ni saca efectivo del cajón.
  v_id := pg_temp.pagado('4776660097', 97);
  v_ticket := crear_ticket_desde_tienda(v_id);
  UPDATE delivery_pedidos SET estado = 'CANCELADO', cancelado_at = now(), cancelado_por = 'TIMEOUT' WHERE id = v_id;   -- lo que hace la nube al vencer
  IF pg_temp.pago_de(v_id) <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'I8: cancelado por la nube, el pago quedó %', pg_temp.pago_de(v_id); END IF;
  PERFORM tienda_pago_devolucion((SELECT id FROM tienda_pagos WHERE pedido_id = v_id AND NOT extra), true);
  v_num := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_cajero, v_cajero, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_ticket, 264.00, 'La nube canceló el pedido')
  RETURNING id INTO v_ped2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM cancelar_ticket_pagado(v_ticket, v_caja, v_turno, 'CLIENTE_DESISTIO'::cancelacion_motivo, NULL, v_ped2, v_cajero, v_cajero,
    true, false, true, 'EFECTIVO'::devolucion_medio, NULL, 'smoke-pl-cancel-i8');
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_ticket) <> 'CANCELADO' THEN RAISE EXCEPTION 'I8: la cuenta de un pedido que la nube canceló no se pudo cancelar en caja'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_num THEN RAISE EXCEPTION 'I8: cancelar esa cuenta movió el efectivo esperado'; END IF;
  -- La caja lo reporta y la nube lo vuelve a mirar: el pago sigue devuelto una sola vez.
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO', 'OTRO') <> 'CANCELADO' THEN RAISE EXCEPTION 'I8: el reporte de la caja debía devolver el estado que ya tenía'; END IF;
  PERFORM tienda_sincronizar_estados_nube();
  IF pg_temp.pago_de(v_id) <> 'DEVUELTO' OR (SELECT count(*) FROM tienda_pagos WHERE pedido_id = v_id) <> 1
     OR EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t JOIN tienda_pagos g ON g.id = t.id WHERE g.pedido_id = v_id) THEN
    RAISE EXCEPTION 'I8: cancelar en caja una cuenta cuyo pago ya se devolvió volvió a encolar una devolución (pago %)', pg_temp.pago_de(v_id);
  END IF;

  -- ── H) Permisos ─────────────────────────────────────────────────────────────────────────────
  FOR r IN SELECT p.oid::regprocedure AS firma, p.proname FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_guardar_tokens', 'tienda_leer_tokens', 'tienda_borrar_tokens', 'tienda_pago_pausar', 'tienda_pago_anotar',
                                'tienda_conexion_cobro', 'tienda_crear_pedido', 'tienda_pago_tomar_cobro', 'tienda_pago_descartar',
                                'tienda_pago_tomar_consulta', 'tienda_pago_aplicar', 'tienda_pago_tomar_correo', 'tienda_pagos_tomar',
                                'tienda_pago_devolucion', 'tienda_pago_conciliacion', 'tienda_reportar_estado', 'tienda_pagos_barrer', '_tienda_pedido_creado',
                                '_tienda_version_al_menos', '_tienda_caja_en_linea_viva',
                                'delivery_pedidos_devolver_pago') LOOP
    IF has_function_privilege('anon', r.firma, 'EXECUTE') OR has_function_privilege('authenticated', r.firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'H: % la puede ejecutar el público o el personal', r.firma;
    END IF;
    IF has_function_privilege('service_role', r.firma, 'EXECUTE') <> (r.proname NOT LIKE '\_%' AND r.proname <> 'delivery_pedidos_devolver_pago') THEN
      RAISE EXCEPTION 'H: permiso de service_role sobre %', r.firma;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'tienda_crear_pedido') <> 1 THEN
    RAISE EXCEPTION 'H: tienda_crear_pedido tiene más de una firma (PostgREST no sabría a cuál llamar)';
  END IF;

  RAISE NOTICE 'smoke_tienda_pago_en_linea: OK';
END $$;
ROLLBACK;
