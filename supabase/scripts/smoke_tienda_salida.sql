-- Smoke tienda en línea (mig. 0167, la salida). Cuatro bloques, en una sola transacción:
--   A) `pedir` sin duplicados: tienda_crear_pedido con p_clave.
--   B) «Ya lo tengo» (EN_PREPARACION) y la caducidad de los ACEPTADO de la caja a los 15 minutos.
--   C) Retención: notas, filas atascadas, y el barrido de sesiones y enlaces vencidos.
--   D) El encendido empaquetado. REGLA DE ORO: con el complemento TIENDA inactivo, un alta y un
--      cambio de plan no conceden nada de la tienda; solo tienda_encender_complemento() lo cambia.
--      Va al final porque enciende el complemento para lo que queda de la transacción.
-- Corre como postgres. Uso: cd desktop && npm run smokes -- smoke_tienda_salida.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE SEQUENCE pg_temp.n_pedido;
-- Un pedido a mano. p_min: hace cuántos minutos se aceptó (NULL = sin sello); p_dias: antigüedad.
CREATE FUNCTION pg_temp.pedido(p_estado text, p_canal text DEFAULT 'TIENDA', p_gestion text DEFAULT 'ESCRITORIO',
                               p_min integer DEFAULT NULL, p_dias integer DEFAULT 0, p_cuenta uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_n bigint := nextval('pg_temp.n_pedido'); v_id uuid;
BEGIN
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, conexion_id, id_externo, estado, gestion,
    items, payload_raw, total_cliente_mxn, seguimiento_hash, vence_aceptacion, aceptado_at, recibido_at,
    cliente_nombre, cliente_telefono, nota_cliente, tienda_cuenta_id)
  VALUES ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', p_canal,
    (CASE p_canal WHEN 'TIENDA' THEN 'DRIVE_THRU' ELSE 'APP_UBEREATS' END)::modo_servicio,
    CASE p_canal WHEN 'APP' THEN (SELECT id FROM delivery_conexiones WHERE tienda_id_externo = 'store-salida') END,
    'salida-' || v_n, p_estado, p_gestion,
    '[{"producto_id":null,"nombre_app":"Sencilla","cantidad":2,"precio_unitario_mxn":"120.00","nota":"sin cebolla, soy Ana","modificadores":[{"opcion_modificador_id":null,"nombre_app":"Extra queso","cantidad":1}]},
      {"producto_id":null,"nombre_app":"Papas","cantidad":1,"precio_unitario_mxn":"30.00","nota":null,"modificadores":[]}]'::jsonb,
    '{}'::jsonb, 270.00,
    CASE p_canal WHEN 'TIENDA' THEN encode(sha256(convert_to('salida-' || v_n, 'UTF8')), 'hex') END,
    now() + interval '5 minutes', now() - make_interval(mins => p_min), now() - make_interval(days => p_dias),
    'Ana Salida', '4775550001', 'toca el timbre, depto 4', p_cuenta)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
CREATE FUNCTION pg_temp.fila(p_id uuid) RETURNS jsonb LANGUAGE sql
AS $$ SELECT to_jsonb(p) FROM delivery_pedidos p WHERE p.id = p_id $$;

-- ── A) `pedir` sin duplicados ────────────────────────────────────────────────
DO $$
DECLARE
  c_firma  CONSTANT text := 'tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text)';
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_otro   uuid := '67676767-0000-0000-0000-0000000000ab';
  v_suc_o  uuid;
  v_cat uuid; v_prod uuid; v_uno jsonb;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_cli    jsonb := '{"nombre":"Ana Clave","telefono":"4775550671"}';
  v_h1 text := md5('salida-1') || md5('salida-1b');
  v_h2 text := md5('salida-2') || md5('salida-2b');
  v_h3 text := md5('salida-3') || md5('salida-3b');
  v_r1 jsonb; v_r2 jsonb; v_r jsonb; v_err text; v_estado text; v_i int;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Fixture: la tienda abierta ahora (como smoke_tienda_pedido.sql) y un producto de $120.
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta) VALUES (v_t, 'salida-smoke', 7, true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario) VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Salida smoke', 61) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla salida', 120) RETURNING id INTO v_prod;
  v_uno := format('[{"producto_id":"%s","cantidad":1}]', v_prod)::jsonb;
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL THEN
    RAISE EXCEPTION 'A (fixture): la tienda debía estar abierta: %', tienda_estado_sucursal(v_suc, 'RECOGER');
  END IF;

  -- A1) Con clave: crea, y devuelve las cuatro claves de siempre.
  v_r1 := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
            p_cliente => v_cli, p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
            p_seguimiento_hash => v_h1, p_total_esperado => 120.00, p_clave => 'AAAAAAAAAAAAAAAAAAAAAA');
  IF NOT (v_r1 ?& ARRAY['pedido_id', 'folio_corto', 'total_mxn', 'vence_aceptacion']) OR v_r1 ->> 'total_mxn' <> '120.00' THEN
    RAISE EXCEPTION 'A1: respuesta inesperada: %', v_r1;
  END IF;
  -- Y dice que lo acaba de crear (un booleano de JSON, no texto): con eso la función manda el correo.
  IF v_r1 -> 'ya_existia' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'A1: un pedido nuevo debía traer ya_existia = false: %', v_r1; END IF;

  -- A2) La misma clave otra vez → el MISMO pedido, letra por letra, y una sola fila. Sin volver a
  --     validar: la tienda ya cerró, el precio cambió, el total que manda no es, y el carrito y
  --     el cliente que llegan ni siquiera son válidos.
  UPDATE tienda_sucursales SET participa = false WHERE sucursal_id = v_suc;
  UPDATE productos SET precio_base_mxn = 999 WHERE id = v_prod;
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NULL THEN RAISE EXCEPTION 'A2 (fixture): la tienda debía estar cerrada'; END IF;
  v_r2 := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => '[]',
            p_cliente => '{}', p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
            p_seguimiento_hash => v_h1, p_total_esperado => 1.00, p_clave => 'AAAAAAAAAAAAAAAAAAAAAA');
  -- …salvo ya_existia, que ahora es true: la función no repite el correo de confirmación.
  IF v_r2 - 'ya_existia' IS DISTINCT FROM v_r1 - 'ya_existia' THEN RAISE EXCEPTION 'A2: el reintento devolvió otra cosa: % (era %)', v_r2, v_r1; END IF;
  IF v_r2 -> 'ya_existia' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'A2: el reintento debía traer ya_existia = true: %', v_r2; END IF;
  IF (SELECT count(*) FROM delivery_pedidos WHERE seguimiento_hash = v_h1) <> 1 THEN RAISE EXCEPTION 'A2: el reintento creó otra fila'; END IF;
  -- Sigue devolviéndolo cuando el pedido ya avanzó (el cliente reintenta tarde).
  UPDATE delivery_pedidos SET estado = 'ENTREGADO' WHERE id = (v_r1 ->> 'pedido_id')::uuid;
  v_r2 := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
            p_cliente => v_cli, p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
            p_seguimiento_hash => v_h1, p_clave => 'AAAAAAAAAAAAAAAAAAAAAA');
  IF v_r2 IS DISTINCT FROM v_r1 || '{"ya_existia": true}' THEN RAISE EXCEPTION 'A2: sobre un pedido entregado el reintento devolvió %', v_r2; END IF;
  UPDATE tienda_sucursales SET participa = true WHERE sucursal_id = v_suc;
  UPDATE productos SET precio_base_mxn = 120 WHERE id = v_prod;

  -- A3) Otra clave (otra huella) → otro pedido.
  v_r2 := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
            p_cliente => v_cli, p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
            p_seguimiento_hash => v_h2, p_clave => 'BBBBBBBBBBBBBBBBBBBBBB');
  IF v_r2 ->> 'pedido_id' = v_r1 ->> 'pedido_id' OR v_r2 -> 'ya_existia' IS DISTINCT FROM 'false'::jsonb OR (SELECT count(*) FROM delivery_pedidos WHERE seguimiento_hash IN (v_h1, v_h2)) <> 2 THEN
    RAISE EXCEPTION 'A3: otra clave debía crear otro pedido: %', v_r2;
  END IF;

  -- A4) Sin clave, todo como hoy: una huella repetida la rechaza el índice único y no devuelve nada.
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, v_h1);
  EXCEPTION WHEN unique_violation THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN RAISE EXCEPTION 'A4: sin clave, una huella repetida debía fallar por el índice único'; END IF;
  IF (SELECT count(*) FROM delivery_pedidos WHERE seguimiento_hash = v_h1) <> 1 THEN RAISE EXCEPTION 'A4: sin clave se creó un duplicado'; END IF;

  -- A5) Con clave, pero la huella es de un pedido de OTRO negocio: ni lo devuelve ni crea nada.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0167-sal', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OS', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, items, payload_raw, total_cliente_mxn, seguimiento_hash)
  VALUES (v_otro, v_suc_o, 'TIENDA', 'DRIVE_THRU', 'salida-ajeno', 'RECIBIDO', '[]', '{}', 55.00, v_h3);
  v_err := NULL;
  BEGIN
    v_r := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
             p_cliente => v_cli, p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
             p_seguimiento_hash => v_h3, p_clave => 'CCCCCCCCCCCCCCCCCCCCCC');
  EXCEPTION WHEN unique_violation THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN RAISE EXCEPTION 'A5: devolvió o creó con la huella de otro negocio: %', v_r; END IF;
  IF (SELECT count(*) FROM delivery_pedidos WHERE seguimiento_hash = v_h3) <> 1 THEN RAISE EXCEPTION 'A5: quedó más de una fila con esa huella'; END IF;

  -- A6) Con clave también se valida la huella.
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
              p_cliente => v_cli, p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
              p_seguimiento_hash => 'no-es-una-huella', p_clave => 'DDDDDDDDDDDDDDDDDDDDDD');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'SEGUIMIENTO_INVALIDO%' THEN RAISE EXCEPTION 'A6: esperaba SEGUIMIENTO_INVALIDO, dio %', COALESCE(v_err, 'un pedido'); END IF;

  -- A7) El tope de tres pedidos vivos no estorba al reintento: el tercero, reintentado, es el
  --     tercero; un cuarto de verdad sigue sin entrar.
  FOR v_i IN 1..3 LOOP
    v_r := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
             p_cliente => '{"nombre":"Tope","telefono":"4775550672"}', p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
             p_seguimiento_hash => md5('tope' || v_i) || md5('tope-b' || v_i), p_clave => 'tope' || v_i);
  END LOOP;
  v_r2 := tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
            p_cliente => '{"nombre":"Tope","telefono":"4775550672"}', p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
            p_seguimiento_hash => md5('tope3') || md5('tope-b3'), p_clave => 'tope3');
  IF v_r2 IS DISTINCT FROM v_r || '{"ya_existia": true}' THEN RAISE EXCEPTION 'A7: el reintento del tercer pedido devolvió %', v_r2; END IF;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(p_tenant => v_t, p_sucursal => v_suc, p_modo => 'RECOGER', p_zona => NULL, p_items => v_uno,
              p_cliente => '{"nombre":"Tope","telefono":"4775550672"}', p_direccion => NULL, p_pago => 'EFECTIVO', p_paga_con => NULL, p_nota => NULL,
              p_seguimiento_hash => md5('tope4') || md5('tope-b4'), p_clave => 'tope4');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'NO_SE_PUDO_CREAR%' THEN RAISE EXCEPTION 'A7: el cuarto pedido vivo debía rechazarse, dio %', COALESCE(v_err, 'un pedido'); END IF;

  -- A8) Una sola firma (con dos, PostgREST no sabría a cuál llamar), la nueva, y solo service_role.
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'tienda_crear_pedido' AND pronamespace = 'public'::regnamespace) <> 1
     OR to_regprocedure(c_firma) IS NULL THEN
    RAISE EXCEPTION 'A8: debe existir exactamente una tienda_crear_pedido, la de p_clave';
  END IF;
  IF NOT has_function_privilege('service_role', c_firma, 'EXECUTE')
     OR has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('authenticated', c_firma, 'EXECUTE') THEN
    RAISE EXCEPTION 'A8: tienda_crear_pedido es solo de service_role';
  END IF;

  RAISE NOTICE 'smoke_tienda_salida A (pedir sin duplicados) OK';
END $$;

-- ── B) «Ya lo tengo» y la caducidad de lo aceptado ───────────────────────────
DO $$
DECLARE
  v_t   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_id uuid; v_antes jsonb; v_r text; v_n int;
  v_viejo uuid; v_reciente uuid; v_nube uuid; v_prep uuid; v_app uuid; v_sin_sello uuid;
  r record;
BEGIN
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_t, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-salida');

  -- B1) ACEPTADO → EN_PREPARACION: lo dice y no sella nada más.
  v_id := pg_temp.pedido('ACEPTADO');
  v_r := tienda_reportar_estado(v_t, v_id, 'EN_PREPARACION');
  IF v_r IS DISTINCT FROM 'EN_PREPARACION' THEN RAISE EXCEPTION 'B1: devolvió % (esperaba EN_PREPARACION)', v_r; END IF;
  IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'EN_PREPARACION' AND listo_at IS NULL
                   AND entregado_at IS NULL AND cancelado_at IS NULL AND cancelado_por IS NULL AND motivo_cancelacion IS NULL) THEN
    RAISE EXCEPTION 'B1: no quedó EN_PREPARACION limpio: %', pg_temp.fila(v_id);
  END IF;
  -- Repetido no cambia nada, y de ahí sigue a LISTO y a ENTREGADO como siempre.
  v_antes := pg_temp.fila(v_id);
  IF tienda_reportar_estado(v_t, v_id, 'EN_PREPARACION') IS DISTINCT FROM 'EN_PREPARACION' OR pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'B1: repetir EN_PREPARACION tocó la fila';
  END IF;
  IF tienda_reportar_estado(v_t, v_id, 'LISTO') IS DISTINCT FROM 'LISTO' OR tienda_reportar_estado(v_t, v_id, 'ENTREGADO') IS DISTINCT FROM 'ENTREGADO' THEN
    RAISE EXCEPTION 'B1: desde EN_PREPARACION debía seguir a LISTO y a ENTREGADO';
  END IF;

  -- B2) Solo desde ACEPTADO: sin aceptar no se prepara, y un pedido no retrocede.
  FOR r IN SELECT * FROM (VALUES ('RECIBIDO'), ('LISTO'), ('ENTREGADO'), ('CANCELADO'), ('RECHAZADO'), ('EXPIRADO'), ('ERROR')) AS x(desde) LOOP
    v_id := pg_temp.pedido(r.desde);
    v_antes := pg_temp.fila(v_id);
    v_r := tienda_reportar_estado(v_t, v_id, 'EN_PREPARACION');
    IF v_r IS DISTINCT FROM r.desde THEN RAISE EXCEPTION 'B2: EN_PREPARACION sobre % devolvió %', r.desde, v_r; END IF;
    IF pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'B2: EN_PREPARACION sobre % tocó la fila', r.desde; END IF;
  END LOOP;

  -- B3) Caducidad. Una pasada primero, para que la que se mide no cuente vencidos de la semilla.
  PERFORM delivery_marcar_expirados();
  v_viejo     := pg_temp.pedido('ACEPTADO', 'TIENDA', 'ESCRITORIO', 16);
  v_reciente  := pg_temp.pedido('ACEPTADO', 'TIENDA', 'ESCRITORIO', 14);
  v_nube      := pg_temp.pedido('ACEPTADO', 'TIENDA', 'NUBE', 16);
  v_prep      := pg_temp.pedido('EN_PREPARACION', 'TIENDA', 'ESCRITORIO', 16);
  v_app       := pg_temp.pedido('ACEPTADO', 'APP', 'ESCRITORIO', 16);
  v_sin_sello := pg_temp.pedido('ACEPTADO', 'TIENDA', 'ESCRITORIO', NULL);
  SELECT jsonb_object_agg(id, to_jsonb(p)) INTO v_antes FROM delivery_pedidos p WHERE id IN (v_reciente, v_nube, v_prep, v_app, v_sin_sello);
  v_n := delivery_marcar_expirados();
  IF v_n <> 0 THEN RAISE EXCEPTION 'B3: la función cuenta vencidos, no caducados: devolvió %', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_viejo AND estado = 'CANCELADO' AND cancelado_por = 'RESTAURANTE'
                   AND motivo_cancelacion = 'OTRO' AND cancelado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'B3: el aceptado hace 16 min debía quedar CANCELADO / RESTAURANTE / OTRO: %', pg_temp.fila(v_viejo);
  END IF;
  IF (SELECT jsonb_object_agg(id, to_jsonb(p)) FROM delivery_pedidos p WHERE id IN (v_reciente, v_nube, v_prep, v_app, v_sin_sello)) IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'B3: la caducidad tocó un pedido que no era (14 min, gestión NUBE, EN_PREPARACION, de Uber o sin sello)';
  END IF;
  -- Lo que ve el cliente: cancelado, con un motivo de la lista cerrada.
  IF (SELECT tienda_seguimiento(v_t, seguimiento_hash) FROM delivery_pedidos WHERE id = v_viejo) ->> 'estado' IS DISTINCT FROM 'CANCELADO'
     OR (SELECT tienda_seguimiento(v_t, seguimiento_hash) FROM delivery_pedidos WHERE id = v_viejo) ->> 'motivo' IS DISTINCT FROM 'OTRO' THEN
    RAISE EXCEPTION 'B3: el seguimiento del caducado debía decir CANCELADO / OTRO';
  END IF;

  RAISE NOTICE 'smoke_tienda_salida B (EN_PREPARACION y caducidad) OK';
END $$;

-- ── C) Retención ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_cuenta uuid := '67676767-0000-0000-0000-0000000000c1';
  v_ent uuid; v_ace uuid; v_prep uuid; v_listo uuid; v_nuevo uuid; v_app_ace uuid; v_app_ent uuid;
  v_antes jsonb; v_antes_app jsonb; v_f jsonb; v_m jsonb; v_id uuid;
BEGIN
  INSERT INTO tienda_cuentas (id, tenant_id, email, password_hash, nombre, telefono)
  VALUES (v_cuenta, v_t, 'ana.salida@example.com', 'x', 'Ana', '4775550001');
  INSERT INTO tienda_sesiones (token_hash, cuenta_id, tenant_id, expira_at) VALUES
    (pg_temp.h('sesion-vencida'), v_cuenta, v_t, now() - interval '1 second'), (pg_temp.h('sesion-viva'), v_cuenta, v_t, now() + interval '1 day');
  INSERT INTO tienda_recuperaciones (token_hash, cuenta_id, tenant_id, expira_at) VALUES
    (pg_temp.h('enlace-vencido'), v_cuenta, v_t, now() - interval '1 second'), (pg_temp.h('enlace-vivo'), v_cuenta, v_t, now() + interval '1 hour');

  v_ent     := pg_temp.pedido('ENTREGADO',      'TIENDA', 'NUBE',       NULL, 31, v_cuenta);
  v_ace     := pg_temp.pedido('ACEPTADO',       'TIENDA', 'ESCRITORIO', NULL, 31);
  v_prep    := pg_temp.pedido('EN_PREPARACION', 'TIENDA', 'ESCRITORIO', NULL, 31);
  v_listo   := pg_temp.pedido('LISTO',          'TIENDA', 'ESCRITORIO', NULL, 31);
  v_nuevo   := pg_temp.pedido('ACEPTADO',       'TIENDA', 'ESCRITORIO', NULL, 29);
  v_app_ace := pg_temp.pedido('ACEPTADO',       'APP',    'NUBE',       NULL, 31);
  v_app_ent := pg_temp.pedido('ENTREGADO',      'APP',    'NUBE',       NULL, 31);
  SELECT jsonb_object_agg(id, to_jsonb(p)) INTO v_antes FROM delivery_pedidos p WHERE id IN (v_nuevo, v_app_ace);
  v_antes_app := pg_temp.fila(v_app_ent);

  IF delivery_anonimizar_pedidos_viejos(30) < 5 THEN RAISE EXCEPTION 'C: debía anonimizar al menos los 5 de aquí'; END IF;

  -- C1) Los de la tienda con más de 30 días, también los atascados: sin datos personales ni notas.
  FOREACH v_id IN ARRAY ARRAY[v_ent, v_ace, v_prep, v_listo] LOOP
    v_f := pg_temp.fila(v_id);
    IF v_f ->> 'nota_cliente' IS NOT NULL OR v_f ->> 'cliente_telefono' IS NOT NULL OR v_f ->> 'seguimiento_hash' IS NOT NULL
       OR v_f ->> 'cliente_nombre' <> 'Cliente de app' OR v_f -> 'payload_raw' <> '{"anonimizado": true}' THEN
      RAISE EXCEPTION 'C1 (%): quedaron datos personales: %', v_f ->> 'estado', v_f;
    END IF;
    IF v_f::text LIKE '%cebolla%' OR v_f::text LIKE '%timbre%' THEN RAISE EXCEPTION 'C1 (%): quedó una nota: %', v_f ->> 'estado', v_f; END IF;
    -- Los renglones siguen ahí, con todo menos la nota (que queda la clave, en null).
    IF jsonb_array_length(v_f -> 'items') <> 2 OR v_f #>> '{items,0,nombre_app}' <> 'Sencilla' OR v_f #>> '{items,0,cantidad}' <> '2'
       OR v_f #>> '{items,0,modificadores,0,nombre_app}' <> 'Extra queso' OR v_f #>> '{items,1,nombre_app}' <> 'Papas'
       OR NOT (v_f #> '{items,0}') ? 'nota' OR v_f #> '{items,0,nota}' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'C1 (%): los renglones no quedaron como debían: %', v_f ->> 'estado', v_f -> 'items';
    END IF;
  END LOOP;
  -- El estado no se toca, y el pedido sigue ligado a su cuenta.
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ace) <> 'ACEPTADO' THEN RAISE EXCEPTION 'C1: la retención cambió un estado'; END IF;
  IF (SELECT tienda_cuenta_id FROM delivery_pedidos WHERE id = v_ent) IS DISTINCT FROM v_cuenta THEN RAISE EXCEPTION 'C1: se perdió tienda_cuenta_id'; END IF;

  -- C2) Lo que no toca: el de la tienda de 29 días y el de Uber atascado en ACEPTADO (como hoy).
  IF (SELECT jsonb_object_agg(id, to_jsonb(p)) FROM delivery_pedidos p WHERE id IN (v_nuevo, v_app_ace)) IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'C2: tocó un pedido de menos de 30 días o uno de Uber en ACEPTADO';
  END IF;
  -- El de Uber entregado, igual que hoy: datos personales fuera; su nota y sus renglones, intactos.
  v_f := pg_temp.fila(v_app_ent);
  IF v_f ->> 'cliente_telefono' IS NOT NULL OR v_f ->> 'cliente_nombre' <> 'Cliente de app'
     OR v_f -> 'nota_cliente' IS DISTINCT FROM v_antes_app -> 'nota_cliente' OR v_f -> 'items' IS DISTINCT FROM v_antes_app -> 'items' THEN
    RAISE EXCEPTION 'C2: el pedido de Uber entregado no quedó como hoy: %', v_f;
  END IF;

  -- C3) Repetir no encuentra nada.
  IF delivery_anonimizar_pedidos_viejos(30) <> 0 THEN RAISE EXCEPTION 'C3: la segunda pasada volvió a anonimizar'; END IF;

  -- C4) «Mis pedidos» sigue funcionando con el pedido anonimizado: en la lista, con items en null.
  v_m := tienda_mis_pedidos(v_t, v_cuenta);
  IF jsonb_array_length(v_m) <> 1 OR v_m -> 0 -> 'items' <> 'null'::jsonb OR jsonb_array_length(v_m -> 0 -> 'renglones') <> 2
     OR v_m #>> '{0,total_mxn}' <> '270.00' OR v_m #>> '{0,estado}' IS NULL THEN
    RAISE EXCEPTION 'C4: mis pedidos con un pedido anonimizado: %', v_m;
  END IF;

  -- C5) El barrido: fuera sesiones y enlaces vencidos; los vivos se quedan.
  IF (SELECT array_agg(token_hash::text ORDER BY token_hash) FROM (SELECT token_hash FROM tienda_sesiones WHERE cuenta_id = v_cuenta
        UNION ALL SELECT token_hash FROM tienda_recuperaciones WHERE cuenta_id = v_cuenta) x) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[pg_temp.h('enlace-vivo'), pg_temp.h('sesion-viva')]) x) THEN
    RAISE EXCEPTION 'C5: el barrido de sesiones y enlaces vencidos no dejó solo los vivos';
  END IF;

  IF has_function_privilege('anon', 'delivery_anonimizar_pedidos_viejos(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'delivery_anonimizar_pedidos_viejos(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'delivery_marcar_expirados()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tienda_reportar_estado(uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C: permisos de la retención, los vencidos o el reporte de estado';
  END IF;

  RAISE NOTICE 'smoke_tienda_salida C (retención) OK';
END $$;

-- ── D) El encendido empaquetado ──────────────────────────────────────────────
CREATE FUNCTION pg_temp.negocio(p_n integer, p_plan text, p_estado text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id)
  VALUES (('67676767-0000-0000-0000-0000000001' || lpad(p_n::text, 2, '0'))::uuid, 'tenant-0167-' || p_n, 'Negocio ' || p_n,
          p_estado::tenant_estado, 'QUICK_SERVICE', (SELECT id FROM planes WHERE codigo = p_plan))
  RETURNING id
$$;
CREATE FUNCTION pg_temp.alta(p_plan text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_owner uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  RETURN crear_tenant_con_owner(v_owner, 'smoke-salida-' || substr(v_owner::text, 1, 8), 'Tortas Salida', 'Dueño Smoke',
                                '4770000000', 'QUICK_SERVICE'::vertical_tipo, p_plan, 'TRIAL'::tenant_estado, 'smoke 0167');
END $$;
-- Los complementos vigentes de un negocio, como texto ordenado.
CREATE FUNCTION pg_temp.complementos(p_tenant uuid) RETURNS text LANGUAGE sql
AS $$ SELECT COALESCE(string_agg(a.codigo || ':' || ta.precio_mensual_mxn || ':' || ta.incluido_en_plan, ',' ORDER BY a.codigo), '')
        FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = p_tenant AND ta.activo $$;

DO $$
DECLARE
  c_enc    CONSTANT text := 'tienda_encender_complemento()';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_tienda uuid; v_negocio uuid; v_esencial uuid;
  v_alta uuid; v_alta_e uuid; v_r jsonb;
  v_act uuid; v_trial uuid; v_int uuid; v_ese uuid; v_baja uuid; v_susp uuid; v_pagaba uuid; v_baja_hoy uuid;
  v_eleg int; v_vig int; v_encendidos bigint; v_antes text;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT id INTO v_tienda   FROM addons WHERE codigo = 'TIENDA';
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';

  -- D1) REGLA DE ORO. La migración no enciende nada…
  IF (SELECT activo FROM addons WHERE codigo = 'TIENDA') THEN RAISE EXCEPTION 'D1: la 0167 no debe activar el complemento TIENDA'; END IF;
  -- …un alta en Negocio trae lo de siempre (lo que su plan incluye, sin la tienda)…
  v_alta := pg_temp.alta('NEGOCIO');
  IF pg_temp.complementos(v_alta) IS DISTINCT FROM (
       SELECT string_agg(x.codigo || ':0.00:true', ',' ORDER BY x.codigo)
         FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido')) AS x(codigo, bandera)
        WHERE COALESCE(((SELECT features_incluidos FROM planes WHERE id = v_negocio) ->> x.bandera)::boolean, false)) THEN
    RAISE EXCEPTION 'D1: con el complemento inactivo, el alta en Negocio debía dar lo de hoy; dio «%»', pg_temp.complementos(v_alta);
  END IF;
  IF pg_temp.complementos(v_alta) NOT LIKE '%DELIVERY%' OR pg_temp.complementos(v_alta) NOT LIKE '%LEALTAD%' THEN
    RAISE EXCEPTION 'D1 (control): el alta en Negocio debía traer delivery y lealtad: «%»', pg_temp.complementos(v_alta);
  END IF;
  -- …y un cambio de plan tampoco la concede ni la nombra.
  v_alta_e := pg_temp.alta('ESENCIAL');
  v_r := cambiar_plan_tenant(v_alta_e, v_negocio, NULL);
  IF v_r::text LIKE '%TIENDA%' THEN RAISE EXCEPTION 'D1: con el complemento inactivo, el cambio de plan nombró la tienda: %', v_r; END IF;
  IF pg_temp.complementos(v_alta_e) IS DISTINCT FROM pg_temp.complementos(v_alta) THEN
    RAISE EXCEPTION 'D1: subir a Negocio debía dejar lo mismo que un alta en Negocio: «%»', pg_temp.complementos(v_alta_e);
  END IF;
  v_r := cambiar_plan_tenant(v_alta_e, v_esencial, NULL);
  IF v_r::text LIKE '%TIENDA%' THEN RAISE EXCEPTION 'D1: bajar a Esencial nombró la tienda: %', v_r; END IF;
  -- Ni retira: quien la tiene (a mano, marcada como incluida) la conserva al bajar de plan, como hoy.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, incluido_en_plan) VALUES (v_alta, v_tienda, v_hoy - 5, true, 0, true);
  v_r := cambiar_plan_tenant(v_alta, v_esencial, NULL);
  IF v_r::text LIKE '%TIENDA%' OR NOT tenant_addon_activo(v_alta, 'TIENDA') THEN
    RAISE EXCEPTION 'D1: con el complemento inactivo, bajar de plan retiró la tienda: %', v_r;
  END IF;
  DELETE FROM tenant_addons WHERE tenant_id = v_alta AND addon_id = v_tienda;
  IF EXISTS (SELECT 1 FROM tenant_addons WHERE addon_id = v_tienda AND tenant_id IN (v_alta, v_alta_e)) THEN
    RAISE EXCEPTION 'D1: quedó una fila del complemento TIENDA';
  END IF;

  -- D2) El encendido. Negocios de cada clase:
  v_act      := pg_temp.negocio(1, 'NEGOCIO',  'ACTIVO');
  v_trial    := pg_temp.negocio(2, 'CADENA',   'TRIAL');
  v_int      := pg_temp.negocio(3, 'FT',       'INTERNO');      -- plan heredado: también la incluye
  v_ese      := pg_temp.negocio(4, 'ESENCIAL', 'ACTIVO');
  v_baja     := pg_temp.negocio(5, 'NEGOCIO',  'CANCELADO');
  v_susp     := pg_temp.negocio(6, 'NEGOCIO',  'SUSPENDIDO');
  v_pagaba   := pg_temp.negocio(7, 'NEGOCIO',  'ACTIVO');       -- ya la tiene vigente (de pago)
  v_baja_hoy := pg_temp.negocio(8, 'NEGOCIO',  'ACTIVO');       -- tiene una baja con fecha de hoy
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas) VALUES (v_pagaba, v_tienda, v_hoy - 3, true, 100, 'De pago');
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, fecha_fin, activo, precio_mensual_mxn) VALUES (v_baja_hoy, v_tienda, v_hoy, v_hoy, false, 100);
  IF tenant_addon_activo(v_baja_hoy, 'TIENDA') THEN RAISE EXCEPTION 'D2 (fixture): una baja no es un complemento vigente'; END IF;

  SELECT count(*), count(*) FILTER (WHERE tenant_addon_activo(t.id, 'TIENDA')) INTO v_eleg, v_vig
    FROM tenants t JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO') AND COALESCE((p.features_incluidos ->> 'tienda_incluida')::boolean, false);
  SELECT count(*) INTO v_encendidos FROM configuracion_tenant WHERE modulo_tienda_activo;
  v_antes := pg_temp.complementos(v_pagaba);

  v_r := tienda_encender_complemento();
  IF v_r IS DISTINCT FROM jsonb_build_object('activado', true, 'concedidos', v_eleg - v_vig, 'ya_tenian', v_vig) THEN
    RAISE EXCEPTION 'D2: devolvió % (esperaba activado, % concedidos y % que ya la tenían)', v_r, v_eleg - v_vig, v_vig;
  END IF;
  IF NOT (SELECT activo FROM addons WHERE codigo = 'TIENDA') THEN RAISE EXCEPTION 'D2: el complemento no quedó activo'; END IF;
  -- Activo, en prueba e interno, y el de la baja de hoy: una fila vigente, a $0 e incluida.
  IF (SELECT count(*) FROM tenant_addons WHERE addon_id = v_tienda AND tenant_id IN (v_act, v_trial, v_int, v_baja_hoy)
         AND activo AND fecha_inicio = v_hoy AND fecha_fin IS NULL AND precio_mensual_mxn = 0 AND incluido_en_plan
         AND notas LIKE 'Incluido en el plan %') <> 4
     OR (SELECT count(*) FROM tenant_addons WHERE addon_id = v_tienda AND tenant_id IN (v_act, v_trial, v_int, v_baja_hoy)) <> 4 THEN
    RAISE EXCEPTION 'D2: los negocios con plan que la incluye debían quedar con UNA fila a $0 incluida';
  END IF;
  -- Esencial, el dado de baja y el suspendido: nada.
  IF EXISTS (SELECT 1 FROM tenant_addons WHERE addon_id = v_tienda AND tenant_id IN (v_ese, v_baja, v_susp)) THEN
    RAISE EXCEPTION 'D2: concedió a Esencial, a un negocio dado de baja o a uno suspendido';
  END IF;
  -- Quien ya la tenía vigente se queda como estaba.
  IF pg_temp.complementos(v_pagaba) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'D2: tocó a quien ya la tenía: «%»', pg_temp.complementos(v_pagaba); END IF;
  -- Conceder no abre ninguna tienda.
  IF (SELECT count(*) FROM configuracion_tenant WHERE modulo_tienda_activo) <> v_encendidos THEN
    RAISE EXCEPTION 'D2: el encendido movió el interruptor de algún dueño';
  END IF;
  IF NOT (modulos_efectivos(v_act) -> 'permitidos' ->> 'tienda')::boolean OR (modulos_efectivos(v_act) -> 'efectivos' ->> 'tienda')::boolean THEN
    RAISE EXCEPTION 'D2: tras encender, la tienda debe quedar permitida y NO efectiva';
  END IF;

  -- D3) Dos veces no duplica.
  v_r := tienda_encender_complemento();
  IF v_r IS DISTINCT FROM jsonb_build_object('activado', false, 'concedidos', 0, 'ya_tenian', v_eleg) THEN
    RAISE EXCEPTION 'D3: la segunda vez devolvió % (esperaba nada nuevo y % que ya la tenían)', v_r, v_eleg;
  END IF;
  IF (SELECT count(*) FROM tenant_addons WHERE addon_id = v_tienda AND tenant_id IN (v_act, v_trial, v_int, v_baja_hoy, v_pagaba)) <> 5 THEN
    RAISE EXCEPTION 'D3: la segunda vez duplicó filas';
  END IF;

  -- D4) Ya encendido, los planes la conceden solos: un alta en Negocio la trae…
  v_alta := pg_temp.alta('NEGOCIO');
  IF pg_temp.complementos(v_alta) NOT LIKE '%TIENDA:0.00:true%' THEN RAISE EXCEPTION 'D4: el alta en Negocio no trajo la tienda: «%»', pg_temp.complementos(v_alta); END IF;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_alta) THEN RAISE EXCEPTION 'D4: un alta no nace con la tienda encendida'; END IF;
  IF pg_temp.complementos(pg_temp.alta('ESENCIAL')) LIKE '%TIENDA%' THEN RAISE EXCEPTION 'D4: un alta en Esencial no la trae'; END IF;
  -- …y pasar a Esencial la retira y apaga la tienda del dueño (disparador de la 0163).
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_alta, 'salida-alta');
  INSERT INTO configuracion_tenant (tenant_id, modulo_tienda_activo) VALUES (v_alta, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_tienda_activo = true;
  IF NOT (modulos_efectivos(v_alta) -> 'efectivos' ->> 'tienda')::boolean THEN RAISE EXCEPTION 'D4 (fixture): la tienda debía quedar efectiva'; END IF;
  v_r := cambiar_plan_tenant(v_alta, v_esencial, NULL);
  IF NOT (v_r -> 'addons' -> 'retirados') ? 'TIENDA' THEN RAISE EXCEPTION 'D4: bajar a Esencial no retiró la tienda: %', v_r; END IF;
  IF tenant_addon_activo(v_alta, 'TIENDA') OR (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_alta) THEN
    RAISE EXCEPTION 'D4: al retirar la tienda debió quedar sin complemento y con el interruptor apagado';
  END IF;
  -- De vuelta a Negocio (la baja es de hoy: se reactiva esa fila) la concede otra vez; no la enciende.
  v_r := cambiar_plan_tenant(v_alta, v_negocio, NULL);
  IF NOT (v_r -> 'addons' -> 'concedidos') ? 'TIENDA' OR pg_temp.complementos(v_alta) NOT LIKE '%TIENDA:0.00:true%'
     OR (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_alta) THEN
    RAISE EXCEPTION 'D4: volver a Negocio debía concederla sin encenderla: %', v_r;
  END IF;

  -- D5) Quien la pagaba aparte y la tiene encendida sube de plan sin que se le apague (como lealtad, 0159).
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_ese, 'salida-esencial');
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas) VALUES (v_ese, v_tienda, v_hoy - 30, true, 100, 'De pago');
  INSERT INTO configuracion_tenant (tenant_id, modulo_tienda_activo) VALUES (v_ese, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_tienda_activo = true;
  v_r := _sincronizar_addons_del_plan(v_ese, v_negocio, true);
  IF NOT (v_r -> 'concedidos') ? 'TIENDA' OR NOT (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_ese) THEN
    RAISE EXCEPTION 'D5: subir de plan pagando la tienda aparte debía concederla sin apagarla: %', v_r;
  END IF;
  IF (SELECT count(*) FILTER (WHERE activo) <> 1 OR bool_or(activo AND (precio_mensual_mxn <> 0 OR NOT incluido_en_plan))
             OR count(*) FILTER (WHERE NOT activo AND fecha_fin = v_hoy AND precio_mensual_mxn = 100) <> 1
        FROM tenant_addons WHERE tenant_id = v_ese AND addon_id = v_tienda) THEN
    RAISE EXCEPTION 'D5: debía quedar UNA fila activa a $0 incluida y la pagada cerrada hoy';
  END IF;

  -- D6) Solo service_role.
  IF NOT has_function_privilege('service_role', c_enc, 'EXECUTE')
     OR has_function_privilege('anon', c_enc, 'EXECUTE') OR has_function_privilege('authenticated', c_enc, 'EXECUTE')
     OR has_function_privilege('authenticated', '_sincronizar_addons_del_plan(uuid, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', '_sincronizar_addons_del_plan(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'D6: tienda_encender_complemento y la sincronización son solo de service_role';
  END IF;

  RAISE NOTICE 'smoke_tienda_salida D (encendido) OK';
END $$;
ROLLBACK;
