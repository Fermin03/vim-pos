-- Smoke tienda en línea (mig. 0162 §5): tienda_seguimiento, lo que ve el cliente con su enlace.
-- Los casos 1–8 mueven delivery_pedidos.estado (lo que reporta la caja o el POS); los 9–12 usan un
-- ticket real de la nube (crear_ticket_desde_tienda) al que se le sella la impresión, se le asigna
-- repartidor, se cobra o se cancela; el 13 prueba que en ESCRITORIO manda la caja; el 14 los NULL;
-- el 15 que no sale ningún dato personal.
-- Fixture: el de smoke_tienda_pedido.sql (tienda abierta ahora, turno abierto, un producto con extra, zona de $35).
-- Uso: cd desktop && npm run smokes -- smoke_tienda_seguimiento.sql
\set ON_ERROR_STOP on
BEGIN;
-- Huella distinta y válida por caso (64 hex, como la guarda tienda_crear_pedido).
CREATE FUNCTION pg_temp.h(p_n int) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to('seguimiento-' || p_n, 'UTF8')), 'hex') $$;

DO $$
DECLARE
  c_firma  CONSTANT text := 'tienda_seguimiento(uuid, text)';
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := '64646464-0000-0000-0000-0000000000ab';
  v_suc_o  uuid;
  v_cat uuid; v_p120 uuid; v_g uuid; v_o15 uuid; v_z35 uuid; v_rep uuid; v_conexion uuid;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_dir    jsonb := '{"calle":"Av. Secreta","numero_exterior":"77","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}';
  -- Recoger: 1 × (120 + extra 15) = 135.00, con nota en el renglón. Domicilio: 2 × 120 + zona de 35 = 275.00.
  v_rec    jsonb;
  v_dom    jsonb;
  v_n int := 0; v_id uuid; v_s jsonb; v_s2 jsonb; v_ticket uuid; v_err text; v_k text; v_txt text;
  v_tel text; v_mail text;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture ───────────────────────────────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta)
  VALUES (v_t, 'seguimiento-smoke', 7, true, true);
  -- Encender va DESPUÉS del complemento y de la configuración: la guarda de la 0163 lo exige.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  UPDATE sucursales SET nombre = 'León Centro Seguimiento', telefono = '4779998877' WHERE id = v_suc;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0162-seg', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OS', 'Sucursal del otro') RETURNING id INTO v_suc_o;

  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Seguimiento smoke', 61) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla seguimiento', 120) RETURNING id INTO v_p120;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras seguimiento', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES (v_t, v_p120, v_g, 1);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Seguimiento 35', 35) RETURNING id INTO v_z35;

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-SEG', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  INSERT INTO repartidores (tenant_id, nombre, telefono) VALUES (v_t, 'Luis Seguimiento', '4771234567') RETURNING id INTO v_rep;

  v_rec := format('[{"producto_id":"%s","cantidad":1,"nota":"NOTA-SECRETA-DEL-RENGLON","modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o15)::jsonb;
  v_dom := format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb;

  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL OR tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NOT NULL THEN
    RAISE EXCEPTION 'fixture: la tienda debía estar abierta en los dos modos';
  END IF;

  -- ── 1–8) El estado que reporta el pedido ──────────────────────────────────
  -- (caso, modo, estado a poner [NULL = se queda en RECIBIDO], motivo_cancelacion, estado esperado, motivo esperado)
  FOR r IN SELECT * FROM (VALUES
    ('1 recién creado',                 'RECOGER',   NULL::text,       NULL::text,                      'EN_PROCESO',         NULL::text),
    ('1 recién creado, a domicilio',    'DOMICILIO', NULL,             NULL,                            'EN_PROCESO',         NULL),
    ('2 ACEPTADO',                      'RECOGER',   'ACEPTADO',       NULL,                            'EN_PREPARACION',     NULL),
    ('2 EN_PREPARACION',                'RECOGER',   'EN_PREPARACION', NULL,                            'EN_PREPARACION',     NULL),
    ('2 ACEPTADO, a domicilio',         'DOMICILIO', 'ACEPTADO',       NULL,                            'EN_PREPARACION',     NULL),
    ('3 LISTO a domicilio',             'DOMICILIO', 'LISTO',          NULL,                            'EN_CAMINO',          NULL),
    ('4 LISTO para recoger',            'RECOGER',   'LISTO',          NULL,                            'LISTO_PARA_RECOGER', NULL),
    ('5 ENTREGADO',                     'RECOGER',   'ENTREGADO',      NULL,                            'ENTREGADO',          NULL),
    ('5 ENTREGADO a domicilio',         'DOMICILIO', 'ENTREGADO',      NULL,                            'ENTREGADO',          NULL),
    ('6 RECHAZADO por AGOTADO',         'RECOGER',   'RECHAZADO',      'AGOTADO',                       'CANCELADO',          'AGOTADO'),
    ('7 EXPIRADO (el texto interno no sale)', 'RECOGER', 'EXPIRADO',   'Venció la ventana de aceptación', 'CANCELADO',        'SIN_RESPUESTA'),
    ('8 CANCELADO sin motivo (NULL)',  'RECOGER',   'CANCELADO',      NULL,                            'CANCELADO',          'OTRO'),
    ('8 CANCELADO con código de la lista', 'RECOGER', 'CANCELADO',     'CERRADO',                       'CANCELADO',          'CERRADO'),
    ('8 CANCELADO con motivo vacío',    'RECOGER',   'CANCELADO',      '',                              'CANCELADO',          'OTRO'),
    ('8 CANCELADO con un código fuera de la lista', 'RECOGER', 'CANCELADO', 'CLIENTE_DESISTIO',          'CANCELADO',          'OTRO'),
    -- ERROR no es «cancelado»: para 0161 es reintentable, y a quien todavía puede recibir su pedido
    -- no se le dice que se canceló. Se ve como en proceso y sin motivo, traiga lo que traiga.
    ('8 ERROR sin motivo',              'RECOGER',   'ERROR',          NULL,                            'EN_PROCESO',         NULL),
    ('8 ERROR con un código de la lista', 'RECOGER', 'ERROR',          'AGOTADO',                       'EN_PROCESO',         NULL),
    ('8 ERROR a domicilio, con el texto del fallo', 'DOMICILIO', 'ERROR', 'TOTAL_NO_COINCIDE: texto libre del fallo', 'EN_PROCESO', NULL),
    ('M RECHAZADO AGOTADO con texto libre y un teléfono', 'RECOGER', 'RECHAZADO', 'AGOTADO: llamó el dueño 4771112233', 'CANCELADO', 'AGOTADO'),
    ('M RECHAZADO con texto libre sin código', 'RECOGER', 'RECHAZADO', 'texto libre cualquiera',          'CANCELADO',          'OTRO'),
    ('M RECHAZADO en minúsculas',       'RECOGER',   'RECHAZADO',      'saturado',                      'CANCELADO',          'SATURADO'),
    ('M RECHAZADO con espacios y minúsculas antes de los dos puntos', 'RECOGER', 'RECHAZADO', '  cerrado : ya cerramos', 'CANCELADO', 'CERRADO'),
    ('M RECHAZADO OTRO',                'RECOGER',   'RECHAZADO',      'OTRO: lo que sea',              'CANCELADO',          'OTRO'),
    ('M RECHAZADO POS_OFFLINE',         'RECOGER',   'RECHAZADO',      'POS_OFFLINE',                   'CANCELADO',          'OTRO'),
    ('M CANCELADO con texto libre antes de cualquier dos puntos', 'RECOGER', 'CANCELADO', 'AGOTADO el pollo: 4771112233', 'CANCELADO', 'OTRO'),
    ('M EXPIRADO con un código válido no cambia', 'RECOGER', 'EXPIRADO', 'AGOTADO',                      'CANCELADO',          'SIN_RESPUESTA')
  ) AS x(caso, modo, estado, motivo, esperado, motivo_esperado)
  LOOP
    v_n := v_n + 1;
    v_tel := '4775551' || lpad(v_n::text, 3, '0');
    v_id := (tienda_crear_pedido(v_t, v_suc, r.modo, CASE WHEN r.modo = 'DOMICILIO' THEN v_z35 END,
               CASE WHEN r.modo = 'DOMICILIO' THEN v_dom ELSE v_rec END,
               jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', v_tel),
               CASE WHEN r.modo = 'DOMICILIO' THEN v_dir END,
               'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
    IF r.estado IS NOT NULL THEN
      UPDATE delivery_pedidos SET estado = r.estado, motivo_cancelacion = r.motivo WHERE id = v_id;
    END IF;
    v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
    IF v_s ->> 'estado' IS DISTINCT FROM r.esperado OR v_s ->> 'motivo' IS DISTINCT FROM r.motivo_esperado
       OR NOT (v_s ? 'motivo') THEN
      RAISE EXCEPTION '%: esperaba estado % y motivo %, dio %', r.caso, r.esperado, COALESCE(r.motivo_esperado, 'null'), v_s;
    END IF;
    IF v_s::text LIKE '%4771112233%' IS NOT FALSE OR v_s::text LIKE '%llamó%' IS NOT FALSE OR v_s::text LIKE '%texto libre%' IS NOT FALSE THEN
      RAISE EXCEPTION '%: el motivo dejó pasar texto libre: %', r.caso, v_s;
    END IF;
    IF v_s ->> 'modo' IS DISTINCT FROM r.modo THEN RAISE EXCEPTION '%: modo % (esperaba %)', r.caso, v_s ->> 'modo', r.modo; END IF;
  END LOOP;
  IF v_n <> 26 THEN RAISE EXCEPTION '1–8: se probaron % de 26', v_n; END IF;

  -- ── 9–13) Con un ticket de verdad en la nube ──────────────────────────────
  -- 9) Impreso: de ACEPTADO (EN_PREPARACION) a EN_CAMINO / LISTO_PARA_RECOGER, sin que `estado` cambie.
  FOR r IN SELECT * FROM (VALUES ('RECOGER', 'LISTO_PARA_RECOGER'), ('DOMICILIO', 'EN_CAMINO')) AS x(modo, esperado) LOOP
    v_n := v_n + 1;
    v_id := (tienda_crear_pedido(v_t, v_suc, r.modo, CASE WHEN r.modo = 'DOMICILIO' THEN v_z35 END,
               CASE WHEN r.modo = 'DOMICILIO' THEN v_dom ELSE v_rec END,
               jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775551' || lpad(v_n::text, 3, '0')),
               CASE WHEN r.modo = 'DOMICILIO' THEN v_dir END, 'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
    IF (SELECT gestion FROM delivery_pedidos WHERE id = v_id) <> 'NUBE' THEN RAISE EXCEPTION '9: el fixture debía dar gestion NUBE'; END IF;
    v_ticket := crear_ticket_desde_tienda(v_id);
    IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ACEPTADO' THEN RAISE EXCEPTION '9 (%): el pedido debía quedar ACEPTADO', r.modo; END IF;
    v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
    IF v_s ->> 'estado' IS DISTINCT FROM 'EN_PREPARACION' THEN RAISE EXCEPTION '9 (%): ticket sin imprimir: esperaba EN_PREPARACION, dio %', r.modo, v_s; END IF;
    UPDATE tickets SET ticket_impreso_at = now() WHERE id = v_ticket;
    v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
    IF v_s ->> 'estado' IS DISTINCT FROM r.esperado THEN RAISE EXCEPTION '9 (%): ticket impreso: esperaba %, dio %', r.modo, r.esperado, v_s; END IF;
    IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ACEPTADO' THEN RAISE EXCEPTION '9 (%): la lectura no debe escribir', r.modo; END IF;
  END LOOP;

  -- 10) Con repartidor asignado (a domicilio): EN_CAMINO aunque el ticket no se haya impreso.
  v_n := v_n + 1;   -- 18
  v_id := (tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, v_dom, jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775551' || lpad(v_n::text, 3, '0')),
             v_dir, 'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
  v_ticket := crear_ticket_desde_tienda(v_id);
  IF (tienda_seguimiento(v_t, pg_temp.h(v_n)) ->> 'estado') IS DISTINCT FROM 'EN_PREPARACION' THEN RAISE EXCEPTION '10: sin repartidor debía ser EN_PREPARACION'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  PERFORM asignar_delivery_lote(ARRAY[v_ticket], v_rep, 30);
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF (SELECT ticket_impreso_at FROM tickets WHERE id = v_ticket) IS NOT NULL THEN RAISE EXCEPTION '10: el ticket no debía estar impreso'; END IF;
  v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
  IF v_s ->> 'estado' IS DISTINCT FROM 'EN_CAMINO' THEN RAISE EXCEPTION '10: con repartidor esperaba EN_CAMINO, dio %', v_s; END IF;

  -- 11) Cobrado (ticket PAGADO, y también FACTURADO): ENTREGADO, aunque `estado` siga en ACEPTADO.
  -- Un UPDATE directo de estado_fiscal: el trigger de transiciones lo permite (ABIERTO → PAGADO → FACTURADO).
  FOR r IN SELECT * FROM (VALUES ('PAGADO'), ('FACTURADO')) AS x(fiscal) LOOP
    v_n := v_n + 1;
    v_id := (tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_rec, jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775551' || lpad(v_n::text, 3, '0')),
               NULL, 'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
    v_ticket := crear_ticket_desde_tienda(v_id);
    UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_ticket;
    IF r.fiscal = 'FACTURADO' THEN UPDATE tickets SET estado_fiscal = 'FACTURADO' WHERE id = v_ticket; END IF;
    v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
    IF v_s ->> 'estado' IS DISTINCT FROM 'ENTREGADO' THEN RAISE EXCEPTION '11 (%): esperaba ENTREGADO, dio %', r.fiscal, v_s; END IF;
    IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ACEPTADO' THEN RAISE EXCEPTION '11 (%): el pedido debía seguir ACEPTADO', r.fiscal; END IF;
  END LOOP;

  -- 12) Cancelado gana a todo: ticket CANCELADO (aunque esté impreso y con repartidor) → CANCELADO, motivo OTRO (el pedido no trae código).
  v_n := v_n + 1;
  v_id := (tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, v_dom, jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775551' || lpad(v_n::text, 3, '0')),
             v_dir, 'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
  v_ticket := crear_ticket_desde_tienda(v_id);
  UPDATE tickets SET ticket_impreso_at = now() WHERE id = v_ticket;
  INSERT INTO delivery_asignaciones (tenant_id, sucursal_id, ticket_id, repartidor_catalogo_id, repartidor_nombre, monto_a_liquidar_mxn, estado, fecha_salida)
  VALUES (v_t, v_suc, v_ticket, v_rep, 'Luis Seguimiento', 275, 'EN_RUTA', now());
  IF (tienda_seguimiento(v_t, pg_temp.h(v_n)) ->> 'estado') IS DISTINCT FROM 'EN_CAMINO' THEN RAISE EXCEPTION '12: antes de cancelar esperaba EN_CAMINO'; END IF;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_ticket;
  v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
  IF v_s ->> 'estado' IS DISTINCT FROM 'CANCELADO' OR v_s ->> 'motivo' IS DISTINCT FROM 'OTRO' THEN
    RAISE EXCEPTION '12: ticket CANCELADO: esperaba CANCELADO con motivo OTRO, dio %', v_s;
  END IF;

  -- 13) ESCRITORIO: manda lo que reporta la caja, no el ticket de la nube (aquí impreso, y pagado en otro pedido).
  FOR r IN SELECT * FROM (VALUES ('impreso', 'EN_PREPARACION'), ('pagado', 'EN_PREPARACION'), ('cancelado', 'EN_PREPARACION')) AS x(en_nube, esperado) LOOP
    v_n := v_n + 1;
    v_id := (tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_rec, jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775551' || lpad(v_n::text, 3, '0')),
               NULL, 'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
    v_ticket := crear_ticket_desde_tienda(v_id);
    UPDATE tickets SET ticket_impreso_at = now() WHERE id = v_ticket;
    IF r.en_nube = 'pagado' THEN UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_ticket; END IF;
    IF r.en_nube = 'cancelado' THEN UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_ticket; END IF;
    UPDATE delivery_pedidos SET gestion = 'ESCRITORIO' WHERE id = v_id;
    v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
    IF v_s ->> 'estado' IS DISTINCT FROM r.esperado THEN RAISE EXCEPTION '13 (ticket % en la nube): esperaba %, dio %', r.en_nube, r.esperado, v_s; END IF;
    -- Y cuando la caja reporta LISTO, eso se ve.
    UPDATE delivery_pedidos SET estado = 'LISTO' WHERE id = v_id;
    IF (tienda_seguimiento(v_t, pg_temp.h(v_n)) ->> 'estado') IS DISTINCT FROM 'LISTO_PARA_RECOGER' THEN RAISE EXCEPTION '13 (ticket %): la caja reportó LISTO y no se ve', r.en_nube; END IF;
  END LOOP;

  -- ── 14) NULL ──────────────────────────────────────────────────────────────
  -- Un pedido de OTRO negocio (con huella propia) y uno del canal APP del mismo negocio.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, items, payload_raw, seguimiento_hash)
  VALUES (v_otro, v_suc_o, 'TIENDA', 'DRIVE_THRU', 'seg-ajeno-1', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, pg_temp.h(900));
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_t, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-seg') RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn, seguimiento_hash)
  VALUES (v_t, v_suc, v_conexion, 'APP_UBEREATS', 'seg-uber-1', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0, pg_temp.h(901));
  IF tienda_seguimiento(v_t, pg_temp.h(999)) IS NOT NULL THEN RAISE EXCEPTION '14: una huella inexistente debía dar NULL'; END IF;
  IF tienda_seguimiento(v_t, pg_temp.h(900)) IS NOT NULL THEN RAISE EXCEPTION '14: la huella de otro negocio debía dar NULL'; END IF;
  IF tienda_seguimiento(v_t, pg_temp.h(901)) IS NOT NULL THEN RAISE EXCEPTION '14: la huella de un pedido de canal APP debía dar NULL'; END IF;
  -- Control positivo: ese mismo pedido ajeno sí se ve con SU negocio (el NULL de arriba es por el negocio).
  IF tienda_seguimiento(v_otro, pg_temp.h(900)) IS NULL THEN RAISE EXCEPTION '14: el pedido ajeno debía verse con su propio negocio'; END IF;
  -- Entradas que no son una huella, y un negocio nulo.
  IF tienda_seguimiento(v_t, NULL) IS NOT NULL OR tienda_seguimiento(v_t, '') IS NOT NULL
     OR tienda_seguimiento(v_t, upper(pg_temp.h(1))) IS NOT NULL OR tienda_seguimiento(v_t, left(pg_temp.h(1), 63)) IS NOT NULL
     OR tienda_seguimiento(v_t, pg_temp.h(1) || '0') IS NOT NULL OR tienda_seguimiento(v_t, repeat('g', 64)) IS NOT NULL
     OR tienda_seguimiento(NULL, pg_temp.h(1)) IS NOT NULL THEN
    RAISE EXCEPTION '14: una huella mal formada o un negocio nulo debían dar NULL';
  END IF;

  -- ── 15) La forma de lo que se devuelve, y que no sale nada personal ───────
  -- Un pedido a domicilio con todos los datos personales, la nota del cliente y un correo, en estado LISTO.
  v_n := v_n + 1;
  v_tel := '4775558' || lpad(v_n::text, 3, '0');
  v_mail := 'privado.secreto@ejemplo-reservado.com';
  v_id := (tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, v_dom,
             jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', v_tel, 'email', v_mail),
             v_dir, 'EFECTIVO', 500, 'NOTA-SECRETA-DEL-CLIENTE', pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
  v_s := tienda_seguimiento(v_t, pg_temp.h(v_n));
  -- (para el renglón con extra y nota se usa además un pedido de recoger, más abajo)
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_s) k)
     IS DISTINCT FROM ARRAY['envio_total_mxn','estado','folio_corto','modo','motivo','pago','recibido_at','renglones','subtotal_mxn','sucursal','total_mxn'] THEN
    RAISE EXCEPTION '15: las claves de la raíz no son las del contrato: %', (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_s) k);
  END IF;
  -- Ninguna de las claves prohibidas (aunque la lista de arriba ya lo cubre: así un cambio al contrato no las cuela).
  FOREACH v_k IN ARRAY ARRAY['cliente_telefono','telefono','cliente_email','email','cliente_nombre','nombre','direccion','tenant_id','id','pedido_id','ticket_id','nota_cliente','items','seguimiento_hash'] LOOP
    IF v_s ? v_k THEN RAISE EXCEPTION '15: la raíz trae la clave prohibida «%»', v_k; END IF;
  END LOOP;
  v_txt := v_s::text;
  IF v_txt LIKE '%' || v_tel || '%' IS NOT FALSE OR v_txt LIKE '%' || v_mail || '%' IS NOT FALSE
     OR v_txt LIKE '%Av. Secreta%' IS NOT FALSE OR v_txt LIKE '%NOTA-SECRETA%' IS NOT FALSE
     OR v_txt LIKE '%' || v_t::text || '%' IS NOT FALSE OR v_txt LIKE '%' || v_id::text || '%' IS NOT FALSE
     OR v_txt LIKE '%Ana Seguimiento%' IS NOT FALSE THEN
    RAISE EXCEPTION '15: el JSON deja ver un dato personal o interno: %', v_s;
  END IF;
  -- Los valores: 2 × 120 + zona de 35. Subtotal 240.00, envío 35.00, total 275.00.
  IF v_s ->> 'folio_corto' IS DISTINCT FROM (SELECT folio_corto FROM delivery_pedidos WHERE id = v_id)
     OR v_s ->> 'modo' IS DISTINCT FROM 'DOMICILIO' OR v_s ->> 'estado' IS DISTINCT FROM 'EN_PROCESO'
     OR v_s ->> 'subtotal_mxn' IS DISTINCT FROM '240.00' OR v_s ->> 'envio_total_mxn' IS DISTINCT FROM '35.00'
     OR v_s ->> 'total_mxn' IS DISTINCT FROM '275.00' OR jsonb_typeof(v_s -> 'total_mxn') IS DISTINCT FROM 'string'
     OR v_s ->> 'pago' IS DISTINCT FROM 'EFECTIVO'
     OR (v_s ->> 'recibido_at')::timestamptz IS DISTINCT FROM (SELECT recibido_at FROM delivery_pedidos WHERE id = v_id) THEN
    RAISE EXCEPTION '15: valores de la raíz: %', v_s;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_s -> 'sucursal') k) IS DISTINCT FROM ARRAY['nombre','telefono']
     OR v_s #>> '{sucursal,nombre}' IS DISTINCT FROM 'León Centro Seguimiento' OR v_s #>> '{sucursal,telefono}' IS DISTINCT FROM '4779998877' THEN
    RAISE EXCEPTION '15: sucursal debe traer solo nombre y teléfono del negocio: %', v_s -> 'sucursal';
  END IF;
  IF jsonb_array_length(v_s -> 'renglones') <> 1 OR (v_s #>> '{renglones,0,nombre}') IS DISTINCT FROM 'Sencilla seguimiento'
     OR (v_s #>> '{renglones,0,cantidad}') IS DISTINCT FROM '2' OR jsonb_typeof(v_s #> '{renglones,0,detalle}') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION '15: renglón de 2 × Sencilla sin extras: %', v_s -> 'renglones';
  END IF;

  -- Un renglón con extra y con nota: expone nombre, cantidad y detalle (nombres del catálogo), nunca la nota.
  v_n := v_n + 1;
  v_id := (tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_rec, jsonb_build_object('nombre', 'Ana Seguimiento', 'telefono', '4775558' || lpad(v_n::text, 3, '0')),
             NULL, 'TARJETA', NULL, 'NOTA-SECRETA-DEL-CLIENTE', pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
  v_s2 := tienda_seguimiento(v_t, pg_temp.h(v_n));
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_s2 -> 'renglones' -> 0) k) IS DISTINCT FROM ARRAY['cantidad','detalle','nombre']
     OR v_s2 #>> '{renglones,0,nombre}' IS DISTINCT FROM 'Sencilla seguimiento' OR v_s2 #>> '{renglones,0,cantidad}' IS DISTINCT FROM '1'
     OR v_s2 #>> '{renglones,0,detalle}' IS DISTINCT FROM 'Extra queso' THEN
    RAISE EXCEPTION '15: renglón con extra: esperaba solo nombre, cantidad y detalle «Extra queso»: %', v_s2 -> 'renglones';
  END IF;
  IF v_s2::text LIKE '%NOTA-SECRETA%' IS NOT FALSE THEN RAISE EXCEPTION '15: se coló una nota libre: %', v_s2; END IF;
  IF v_s2 ->> 'modo' IS DISTINCT FROM 'RECOGER' OR v_s2 ->> 'subtotal_mxn' IS DISTINCT FROM '135.00'
     OR v_s2 ->> 'envio_total_mxn' IS DISTINCT FROM '0.00' OR v_s2 ->> 'total_mxn' IS DISTINCT FROM '135.00'
     OR v_s2 ->> 'pago' IS DISTINCT FROM 'TARJETA' THEN
    RAISE EXCEPTION '15: importes de recoger: %', v_s2;
  END IF;

  -- ── Permisos: solo service_role ───────────────────────────────────────────
  IF NOT has_function_privilege('service_role', c_firma, 'EXECUTE') THEN RAISE EXCEPTION 'permisos: service_role debe poder ejecutar tienda_seguimiento'; END IF;
  IF has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('authenticated', c_firma, 'EXECUTE') THEN
    RAISE EXCEPTION 'permisos: anon o authenticated pueden ejecutar tienda_seguimiento';
  END IF;

  RAISE NOTICE 'smoke_tienda_seguimiento OK (% pedidos)', v_n;
END $$;
ROLLBACK;
