-- Smoke tienda en línea (mig. 0162 §4): tienda_crear_pedido, y la ida y vuelta hasta el ticket.
-- La ida y vuelta (casos 1–9) es la prueba que vigila la cotización: tienda_crear_pedido guarda lo
-- cotizado y crear_ticket_desde_tienda (0161) arma el ticket con esos renglones; si la cotización
-- se equivoca por un centavo, aborta con TOTAL_NO_COINCIDE.
-- Fixture propio sobre el negocio y la sucursal de la semilla: tienda abierta AHORA (la apertura usa
-- el reloj real: sucursal_recibe_pedidos mira now()) y los productos de smoke_tienda_cotizar.sql.
-- Los casos numerados son los del plan (1–19); los que empiezan con E son de más.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_pedido.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  c_firma  CONSTANT text := 'tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text)';   -- 0167: gana p_clave al final
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := '64646464-0000-0000-0000-0000000000ab';
  v_suc_o  uuid;
  v_cuenta uuid := '64646464-0000-0000-0000-0000000000c1';
  v_cuenta_o   uuid := '64646464-0000-0000-0000-0000000000c2';   -- la misma persona, en OTRO negocio
  v_cuenta_del uuid := '64646464-0000-0000-0000-0000000000c3';   -- de este negocio, borrada
  v_cat uuid;
  v_p120 uuid; v_papas uuid; v_ref uuid; v_agua uuid; v_f33 uuid; v_f100 uuid; v_f8 uuid;
  v_combo uuid; v_combo_f uuid; v_ag uuid;
  v_g2 uuid; v_o15 uuid; v_o10 uuid;
  v_s_beb uuid; v_s_aco uuid; v_s_f uuid;
  v_z35 uuid; v_z0 uuid;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  -- La dirección como llega (con espacios y una clave de más) y como debe guardarse.
  v_dir_sucia jsonb := '{"calle":"  Av. Pedido  ","numero_exterior":"12","numero_interior":"","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":" portón verde ","basura":"no se guarda"}';
  v_dir       jsonb := '{"calle":"Av. Pedido","numero_exterior":"12","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":"portón verde"}';
  v_cli    jsonb := '{"nombre":"Ana Pedido","telefono":"4775550199"}';
  v_uno    jsonb;            -- el carrito más simple: 1 × $120
  v_carritos jsonb; v_c jsonb; v_r jsonb; v_q jsonb;
  v_ped    delivery_pedidos%ROWTYPE;
  v_tel text; v_hash text; v_nota text; v_email text; v_dom boolean;
  v_ticket uuid; v_total numeric; v_n int; v_n0 bigint; v_err text; v_err13 text; v_i int;
  v_ids uuid[] := '{}';
  v_tks uuid[] := '{}';
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: la tienda, abierta ahora ─────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta)
  VALUES (v_t, 'pedido-smoke', 7, true, true);
  -- Encender va DESPUÉS del complemento y de la configuración: la guarda de la 0163 lo exige.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  -- Turno reportado por el espejo (la tienda abre) y SIN latido de apps (gestión NUBE; el caso 11 lo cambia).
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0162-ped', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OP', 'Sucursal del otro') RETURNING id INTO v_suc_o;

  -- La cuenta de cliente que usa el carrito 1, y dos que no valen: la de otro negocio y una borrada.
  INSERT INTO tienda_cuentas (id, tenant_id, email, password_hash, nombre, telefono, deleted_at) VALUES
    (v_cuenta,     v_t,    'ana.cuenta@example.com', 'x', 'Ana', '4775550101', NULL),
    (v_cuenta_o,   v_otro, 'ana.cuenta@example.com', 'x', 'Ana', '4775550101', NULL),
    (v_cuenta_del, v_t,    'ana.borrada@example.com', 'x', 'Ana', '4775550101', now());

  -- Los productos de la Task 3 (smoke_tienda_cotizar.sql), los que estos carritos usan.
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Pedido smoke', 60) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla pedido', 120) RETURNING id INTO v_p120;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Papas pedido', 30) RETURNING id INTO v_papas;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Refresco pedido', 25) RETURNING id INTO v_ref;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Agua pedido', 20) RETURNING id INTO v_agua;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Agotado pedido', 10) RETURNING id INTO v_ag;
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_t, v_ag, v_suc, true);
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 pedido', 33.33, 16, false) RETURNING id INTO v_f33;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 de cien pedido', 100, 16, false) RETURNING id INTO v_f100;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 8 pedido', 100, 8, false) RETURNING id INTO v_f8;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo)
  VALUES (v_t, v_cat, 'Combo pedido', 150, true) RETURNING id INTO v_combo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Combo fuera pedido', 100, true, 16, false) RETURNING id INTO v_combo_f;

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras pedido', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g2;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Aguacate', 10, 2) RETURNING id INTO v_o10;
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES (v_t, v_p120, v_g2, 1);

  -- Combo con IVA incluido ($150): «Bebida» DELTA obligatoria, «Acompañamiento» SUMA_PRECIO_PRODUCTO hasta 2.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo, 'Bebida', 1, 'DELTA') RETURNING id INTO v_s_beb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, minimo_selecciones, maximo_selecciones)
  VALUES (v_t, v_combo, 'Acompañamiento', 2, 'SUMA_PRECIO_PRODUCTO', 0, 2) RETURNING id INTO v_s_aco;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES
    (v_t, v_s_beb, v_ref, 10, 1), (v_t, v_s_beb, v_agua, 0, 2), (v_t, v_s_aco, v_papas, 5, 1);
  -- Combo con IVA por fuera ($100 + 16 %): su hijo («Sencilla», IVA incluido) admite extras de pago.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo_f, 'Principal', 1, 'DELTA') RETURNING id INTO v_s_f;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id) VALUES (v_t, v_s_f, v_p120);

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Pedido 35', 35) RETURNING id INTO v_z35;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Pedido gratis', 0) RETURNING id INTO v_z0;

  -- Un turno abierto, como el de smoke_tienda_ticket.sql. dia_contable en hora de México.
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-PEDIDO', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');

  v_uno := format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb;
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL OR tienda_estado_sucursal(v_suc, 'DOMICILIO') IS NOT NULL THEN
    RAISE EXCEPTION 'fixture: la tienda debía estar abierta en los dos modos: %, %',
      tienda_estado_sucursal(v_suc, 'RECOGER'), tienda_estado_sucursal(v_suc, 'DOMICILIO');
  END IF;

  -- ── 1–9) La ida y vuelta, y 10) la fila creada ────────────────────────────
  -- `tot` está calculado a mano (los mismos números que smoke_tienda_cotizar.sql).
  v_carritos := jsonb_build_array(
    -- 1) Casos 1, 2 y 3 de la Task 3: 2 × 120 = 240; 2 × (120 + 15) = 270; 120 + 2 × 15 = 150. Paga con el total exacto.
    jsonb_build_object('modo', 'RECOGER', 'pago', 'EFECTIVO', 'paga_con', 660.00, 'tot', '660.00',
      'items', format('[{"producto_id":"%s","cantidad":2},'
                      || '{"producto_id":"%s","cantidad":2,"modificadores":[{"opcion_id":"%s","cantidad":1}]},'
                      || '{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":2}]}]',
                      v_p120, v_p120, v_o15, v_p120, v_o15)::jsonb),
    -- 2) Caso 4: 3 × $33.33 con IVA 16 % por fuera: 99.99 + 16.00. Efectivo sin «paga con».
    jsonb_build_object('modo', 'RECOGER', 'pago', 'EFECTIVO', 'tot', '115.99',
      'items', format('[{"producto_id":"%s","cantidad":3}]', v_f33)::jsonb),
    -- 3) Caso 5: $100 + 8 % por fuera (108) y $120 con IVA incluido.
    jsonb_build_object('modo', 'RECOGER', 'pago', 'TARJETA', 'tot', '228.00',
      'items', format('[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":1}]', v_f8, v_p120)::jsonb),
    -- 4) Caso 6: 2 × $120 a domicilio, zona de $35 con IVA incluido. Paga con el tope: total + 5000.
    jsonb_build_object('modo', 'DOMICILIO', 'zona', v_z35, 'pago', 'EFECTIVO', 'paga_con', 5275.00, 'tot', '275.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    -- 5) Caso 7: el primer renglón lleva IVA 16 % por fuera y el envío lo hereda: 116 + 35 + 5.60.
    jsonb_build_object('modo', 'DOMICILIO', 'zona', v_z35, 'pago', 'TARJETA', 'tot', '156.60',
      'items', format('[{"producto_id":"%s","cantidad":1}]', v_f100)::jsonb),
    -- 6) Caso 8: zona gratis.
    jsonb_build_object('modo', 'DOMICILIO', 'zona', v_z0, 'pago', 'EFECTIVO', 'paga_con', 500, 'tot', '240.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    -- 7) Casos 9 y 10: combo con elección DELTA de $10 (160) y 2 combos con SUMA_PRECIO_PRODUCTO
    --    (30 + 5): 2 × (150 + 0 + 35) = 370.
    jsonb_build_object('modo', 'RECOGER', 'pago', 'TARJETA', 'tot', '530.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]},'
                      || '{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo, v_s_beb, v_ref, v_combo, v_s_beb, v_agua, v_s_aco, v_papas)::jsonb),
    -- 8) Caso 11: 2 combos de $100 + 16 % por fuera (232) y su hijo con un extra de $10 por combo (20).
    jsonb_build_object('modo', 'RECOGER', 'pago', 'EFECTIVO', 'paga_con', 300, 'tot', '252.00',
      'items', format('[{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                      v_combo_f, v_s_f, v_p120, v_o10)::jsonb),
    -- 9) Tres renglones mezclados, a domicilio: 3 × 120 + 15×1×3 + 10×2×3 = 465.00;
    --    2 × (150 + 10 + 35×2) = 460.00; 33.33 + 5.33 = 38.66; envío 35.00.
    jsonb_build_object('modo', 'DOMICILIO', 'zona', v_z35, 'pago', 'EFECTIVO', 'paga_con', 1000, 'tot', '998.66',
      'items', format('[{"producto_id":"%s","cantidad":3,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":1}]',
                      v_p120, v_o15, v_o10, v_combo, v_s_beb, v_ref, v_s_aco, v_papas, v_f33)::jsonb));

  v_n := 0;
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_carritos) LOOP
    v_n := v_n + 1;
    v_dom   := v_c ->> 'modo' = 'DOMICILIO';
    v_tel   := '47755501' || lpad(v_n::text, 2, '0');           -- un teléfono por carrito
    v_hash  := md5('a' || v_n) || md5('b' || v_n);
    v_email := CASE WHEN v_n % 2 = 0 THEN 'ana' || v_n || '@example.com' END;
    v_nota  := CASE v_n WHEN 1 THEN '  ' || repeat('n', 320) || '  ' WHEN 2 THEN NULL WHEN 3 THEN '   ' ELSE 'Tocar el timbre' END;

    v_q := tienda_cotizar(v_t, v_suc, v_c ->> 'modo', (v_c ->> 'zona')::uuid, v_c -> 'items');
    v_r := tienda_crear_pedido(v_t, v_suc, v_c ->> 'modo', (v_c ->> 'zona')::uuid, v_c -> 'items',
             -- El nombre llega con espacios; el correo, ausente (9), en null JSON (impares) o puesto (pares).
             jsonb_build_object('nombre', '  Ana Pedido  ', 'telefono', v_tel)
               || CASE WHEN v_n = 9 THEN '{}'::jsonb ELSE jsonb_build_object('email', v_email) END,
             CASE WHEN v_dom THEN v_dir_sucia END,
             v_c ->> 'pago', (v_c ->> 'paga_con')::numeric, v_nota, v_hash,
             CASE WHEN v_n = 1 THEN v_cuenta END);

    -- 12 del contrato) Lo que devuelve: cuatro claves, el total como texto.
    IF NOT (v_r ?& ARRAY['pedido_id', 'folio_corto', 'total_mxn', 'vence_aceptacion'])
       OR (SELECT count(*) FROM jsonb_object_keys(v_r)) <> 4 OR jsonb_typeof(v_r -> 'total_mxn') <> 'string' THEN
      RAISE EXCEPTION '%: debe devolver exactamente pedido_id, folio_corto, total_mxn (texto) y vence_aceptacion: %', v_n, v_r;
    END IF;
    IF v_r ->> 'total_mxn' IS DISTINCT FROM v_c ->> 'tot' THEN
      RAISE EXCEPTION '%: total devuelto % (esperaba %) — cotización: %', v_n, v_r ->> 'total_mxn', v_c ->> 'tot', v_q;
    END IF;

    -- 10) La fila creada, antes de que el ticket la pase a ACEPTADO.
    SELECT * INTO v_ped FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION '10 (%): no existe el pedido devuelto', v_n; END IF;
    IF v_ped.tenant_id <> v_t OR v_ped.sucursal_id <> v_suc OR v_ped.canal <> 'TIENDA' OR v_ped.estado <> 'RECIBIDO'
       OR v_ped.conexion_id IS NOT NULL OR v_ped.ticket_id IS NOT NULL OR v_ped.payload_raw <> '{}'::jsonb
       OR v_ped.app::text         <> (CASE WHEN v_dom THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)
       OR v_ped.tipo_entrega IS DISTINCT FROM (CASE WHEN v_dom THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END) THEN
      RAISE EXCEPTION '10 (%): canal, app, tipo_entrega, estado, conexion_id o payload_raw: %', v_n, to_jsonb(v_ped) - 'items';
    END IF;
    IF v_ped.id_externo !~ '^[0-9a-f]{32}$' OR length(v_ped.folio_corto) <> 6
       OR v_ped.folio_corto <> 'T' || upper(left(v_ped.id_externo, 5)) OR v_r ->> 'folio_corto' <> v_ped.folio_corto THEN
      RAISE EXCEPTION '10 (%): id_externo % o folio_corto % (devuelto %)', v_n, v_ped.id_externo, v_ped.folio_corto, v_r ->> 'folio_corto';
    END IF;
    IF abs(extract(epoch FROM v_ped.vence_aceptacion - (now() + interval '7 minutes'))) > 1
       OR (v_r ->> 'vence_aceptacion')::timestamptz <> v_ped.vence_aceptacion THEN
      RAISE EXCEPTION '10 (%): vence_aceptacion % (esperaba now() + 7 min; devuelto %)', v_n, v_ped.vence_aceptacion, v_r ->> 'vence_aceptacion';
    END IF;
    -- 11 del contrato) Los importes son los de la cotización; envio_mxn es el costo de la zona, sin IVA.
    IF v_ped.items IS DISTINCT FROM v_q -> 'items'
       OR v_ped.subtotal_mxn IS DISTINCT FROM (v_q ->> 'subtotal_mxn')::numeric
       OR v_ped.envio_mxn IS DISTINCT FROM (v_q ->> 'envio_mxn')::numeric
       OR v_ped.total_cliente_mxn IS DISTINCT FROM (v_c ->> 'tot')::numeric
       OR v_ped.total_restaurante_mxn IS DISTINCT FROM (v_c ->> 'tot')::numeric
       OR v_ped.efectivo_a_cobrar_mxn IS DISTINCT FROM (CASE v_c ->> 'pago' WHEN 'EFECTIVO' THEN (v_c ->> 'tot')::numeric ELSE 0 END) THEN
      RAISE EXCEPTION '10 (%): items o importes no son los de la cotización: %', v_n, to_jsonb(v_ped) - 'items';
    END IF;
    IF v_ped.cliente_nombre IS DISTINCT FROM 'Ana Pedido' OR v_ped.cliente_telefono IS DISTINCT FROM v_tel
       OR v_ped.cliente_email::text IS DISTINCT FROM (CASE WHEN v_n <> 9 THEN v_email END)
       OR v_ped.direccion IS DISTINCT FROM (CASE WHEN v_dom THEN v_dir END)
       OR v_ped.zona_envio_id IS DISTINCT FROM (v_c ->> 'zona')::uuid
       OR v_ped.pago_al_recibir IS DISTINCT FROM v_c ->> 'pago'
       OR v_ped.paga_con_mxn IS DISTINCT FROM (v_c ->> 'paga_con')::numeric
       OR v_ped.nota_cliente IS DISTINCT FROM (CASE v_n WHEN 1 THEN repeat('n', 300) WHEN 2 THEN NULL WHEN 3 THEN NULL ELSE 'Tocar el timbre' END)
       OR v_ped.seguimiento_hash IS DISTINCT FROM v_hash
       OR v_ped.tienda_cuenta_id IS DISTINCT FROM (CASE WHEN v_n = 1 THEN v_cuenta END) THEN
      RAISE EXCEPTION '10 (%): cliente, dirección, zona, pago, nota, seguimiento o cuenta: %', v_n, to_jsonb(v_ped) - 'items';
    END IF;
    -- 11) Sin latido del espejo de apps, el ticket lo crea la nube.
    IF v_ped.gestion <> 'NUBE' THEN RAISE EXCEPTION '11 (%): sin espejo_apps_at esperaba gestion NUBE, dio %', v_n, v_ped.gestion; END IF;

    -- 1–9) La vuelta: el ticket sale por el total devuelto.
    BEGIN
      v_ticket := crear_ticket_desde_tienda(v_ped.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ida y vuelta, carrito %: el ticket no aceptó el pedido: % — carrito: % — cotización: %', v_n, SQLERRM, v_c -> 'items', v_q;
    END;
    SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
    IF v_total IS DISTINCT FROM (v_r ->> 'total_mxn')::numeric THEN
      RAISE EXCEPTION 'ida y vuelta, carrito %: ticket % vs total devuelto %', v_n, v_total, v_r ->> 'total_mxn';
    END IF;
    IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped.id) <> 'ACEPTADO' THEN RAISE EXCEPTION 'ida y vuelta, carrito %: el pedido no quedó ACEPTADO', v_n; END IF;
  END LOOP;
  IF v_n <> 9 THEN RAISE EXCEPTION 'ida y vuelta: se probaron % carritos de 9', v_n; END IF;

  -- 11) Con una caja instalada viva (latido del espejo de apps), el ticket lo crea la caja…
  UPDATE cajas SET espejo_apps_at = now() WHERE sucursal_id = v_suc;
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('11a') || md5('11b'));
  IF (SELECT gestion FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 'ESCRITORIO' THEN
    RAISE EXCEPTION '11: con espejo_apps_at = now() esperaba gestion ESCRITORIO';
  END IF;
  -- …y sin él (con el turno vigente en los dos casos), la nube.
  UPDATE cajas SET espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('11c') || md5('11d'));
  IF (SELECT gestion FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) <> 'NUBE' THEN
    RAISE EXCEPTION '11: con espejo_apps_at NULL esperaba gestion NUBE';
  END IF;
  -- El teléfono de v_cli queda con 2 pedidos vivos: los rechazos de abajo no pueden deberse al tope.

  SELECT count(*) INTO v_n0 FROM delivery_pedidos;

  -- ── 15–18) Rechazos que no dependen del estado de la tienda ───────────────
  -- hash 'ok' = uno válido y distinto por caso. El carrito es 1 × $120 (a domicilio, $155).
  v_n := 0;
  FOR r IN SELECT * FROM (VALUES
    -- 15) El pago.
    ('15 efectivo con menos que el total', 'PAGO_INVALIDO', 'RECOGER', NULL::uuid, v_cli, NULL::jsonb, 'EFECTIVO', 119.99::numeric, 'ok'),
    ('15 tarjeta con paga_con',            'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'TARJETA', 200, 'ok'),
    ('E15 paga con más de total + 5000',   'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', 5120.01, 'ok'),
    ('E15 paga con negativo',              'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', -1, 'ok'),
    ('E15 paga con NaN',                   'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', 'NaN', 'ok'),
    ('E15 forma de pago desconocida',      'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'CHEQUE', NULL, 'ok'),
    ('E15 forma de pago en minúsculas',    'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'efectivo', NULL, 'ok'),
    ('E15 sin forma de pago',              'PAGO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, NULL, NULL, 'ok'),
    -- 16) El cliente.
    ('16 teléfono de 9 dígitos',  'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"477555019"}'::jsonb, NULL, 'EFECTIVO', NULL, 'ok'),
    ('16 teléfono con letras',    'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"47755501AB"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('16 teléfono vacío',         'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":""}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('16 nombre vacío',           'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"","telefono":"4775550199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('16 correo sin @',           'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"4775550199","email":"ana.example.com"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 teléfono de 11 dígitos', 'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"44775550199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 teléfono con +52',      'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"+524775550199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 teléfono con espacios', 'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"477 555 0199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 teléfono con salto de línea', 'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"4775550199\n"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 sin teléfono',          'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 sin nombre',            'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"telefono":"4775550199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 nombre de puros espacios', 'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"    ","telefono":"4775550199"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 nombre de 101 caracteres', 'CLIENTE_INVALIDO', 'RECOGER', NULL, jsonb_build_object('nombre', repeat('x', 101), 'telefono', '4775550199'), NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 correo vacío',          'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"4775550199","email":""}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 correo sin dominio',    'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"4775550199","email":"ana@example"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 correo con espacio',    'CLIENTE_INVALIDO', 'RECOGER', NULL, '{"nombre":"Ana","telefono":"4775550199","email":"ana maria@example.com"}', NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 correo de 255 caracteres', 'CLIENTE_INVALIDO', 'RECOGER', NULL, jsonb_build_object('nombre', 'Ana', 'telefono', '4775550199', 'email', repeat('a', 243) || '@example.com'), NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 cliente NULL',          'CLIENTE_INVALIDO', 'RECOGER', NULL, NULL, NULL, 'EFECTIVO', NULL, 'ok'),
    ('E16 cliente no es objeto',  'CLIENTE_INVALIDO', 'RECOGER', NULL, '["Ana","4775550199"]', NULL, 'EFECTIVO', NULL, 'ok'),
    -- 17) La dirección.
    ('17 domicilio sin dirección',     'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, NULL, 'EFECTIVO', NULL, 'ok'),
    ('17 código postal de 4 dígitos',  'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || '{"codigo_postal":"3700"}', 'EFECTIVO', NULL, 'ok'),
    ('17 sin calle',                   'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'calle', 'EFECTIVO', NULL, 'ok'),
    ('17 recoger con dirección',       'DIRECCION_INVALIDA', 'RECOGER', NULL, v_cli, v_dir, 'EFECTIVO', NULL, 'ok'),
    ('E17 dirección en null JSON',     'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, 'null', 'EFECTIVO', NULL, 'ok'),
    ('E17 dirección no es objeto',     'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, '["Av. Pedido"]', 'EFECTIVO', NULL, 'ok'),
    ('E17 calle de puros espacios',    'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || '{"calle":"   "}', 'EFECTIVO', NULL, 'ok'),
    ('E17 calle de 256 caracteres',    'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('calle', repeat('c', 256)), 'EFECTIVO', NULL, 'ok'),
    ('E17 número exterior de 21',      'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('numero_exterior', repeat('1', 21)), 'EFECTIVO', NULL, 'ok'),
    ('E17 sin número exterior',        'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'numero_exterior', 'EFECTIVO', NULL, 'ok'),
    ('E17 número interior de 21',      'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('numero_interior', repeat('1', 21)), 'EFECTIVO', NULL, 'ok'),
    ('E17 colonia de 151',             'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('colonia', repeat('c', 151)), 'EFECTIVO', NULL, 'ok'),
    ('E17 sin colonia',                'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'colonia', 'EFECTIVO', NULL, 'ok'),
    ('E17 ciudad de 101',              'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('ciudad', repeat('c', 101)), 'EFECTIVO', NULL, 'ok'),
    ('E17 sin ciudad',                 'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'ciudad', 'EFECTIVO', NULL, 'ok'),
    ('E17 estado de 51',               'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('estado', repeat('e', 51)), 'EFECTIVO', NULL, 'ok'),
    ('E17 sin estado',                 'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'estado', 'EFECTIVO', NULL, 'ok'),
    ('E17 referencias de 301',         'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || jsonb_build_object('referencias', repeat('r', 301)), 'EFECTIVO', NULL, 'ok'),
    ('E17 código postal con letras',   'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || '{"codigo_postal":"3700A"}', 'EFECTIVO', NULL, 'ok'),
    ('E17 código postal de 6 dígitos', 'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir || '{"codigo_postal":"370000"}', 'EFECTIVO', NULL, 'ok'),
    ('E17 sin código postal',          'DIRECCION_INVALIDA', 'DOMICILIO', v_z35, v_cli, v_dir - 'codigo_postal', 'EFECTIVO', NULL, 'ok'),
    -- 18) La huella del seguimiento.
    ('18 huella de 63 caracteres', 'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, left(md5('x') || md5('y'), 63)),
    ('18 huella con mayúsculas',   'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, upper(md5('x') || md5('y'))),
    ('E18 huella de 65 caracteres', 'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, md5('x') || md5('y') || '0'),
    ('E18 huella que no es hex',   'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, repeat('g', 64)),
    ('E18 huella vacía',           'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, ''),
    ('E18 sin huella',             'SEGUIMIENTO_INVALIDO', 'RECOGER', NULL, v_cli, NULL, 'EFECTIVO', NULL, NULL),
    -- Los errores de la cotización pasan tal cual (regla 6).
    ('E19 domicilio sin zona',     'ZONA_INVALIDA', 'DOMICILIO', NULL, v_cli, v_dir, 'EFECTIVO', NULL, 'ok'),
    ('E19 recoger con zona',       'ZONA_INVALIDA', 'RECOGER', v_z35, v_cli, NULL, 'EFECTIVO', NULL, 'ok'),
    -- Un modo que no existe: la tienda no está abierta «en ese modo» (regla 1).
    ('E1 modo desconocido',        'TIENDA_CERRADA', 'MESA', NULL, v_cli, NULL, 'EFECTIVO', NULL, 'ok'),
    ('E1 sin modo',                'TIENDA_CERRADA', NULL, NULL, v_cli, NULL, 'EFECTIVO', NULL, 'ok')
  ) AS x(caso, codigo, modo, zona, cliente, direccion, pago, paga_con, hash)
  LOOP
    v_n := v_n + 1;
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, r.modo, r.zona, v_uno, r.cliente, r.direccion, r.pago, r.paga_con, NULL,
                CASE WHEN r.hash = 'ok' THEN md5('r' || v_n) || md5('s' || v_n) ELSE r.hash END);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE r.codigo || ':%' THEN
      RAISE EXCEPTION '%: esperaba %, dio %', r.caso, r.codigo, COALESCE(v_err, 'un pedido');
    END IF;
  END LOOP;
  IF v_n <> 58 THEN RAISE EXCEPTION 'rechazos: se probaron % de 58', v_n; END IF;

  -- 15) TARJETA con el pago con tarjeta apagado; y al revés.
  UPDATE tienda_config SET pago_tarjeta = false WHERE tenant_id = v_t;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'TARJETA', NULL, NULL, md5('15a') || md5('15b'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'PAGO_INVALIDO:%' THEN RAISE EXCEPTION '15: TARJETA con pago_tarjeta = false: esperaba PAGO_INVALIDO, dio %', COALESCE(v_err, 'un pedido'); END IF;
  UPDATE tienda_config SET pago_tarjeta = true, pago_efectivo = false WHERE tenant_id = v_t;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('15c') || md5('15d'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'PAGO_INVALIDO:%' THEN RAISE EXCEPTION 'E15: EFECTIVO con pago_efectivo = false: esperaba PAGO_INVALIDO, dio %', COALESCE(v_err, 'un pedido'); END IF;
  UPDATE tienda_config SET pago_efectivo = true WHERE tenant_id = v_t;

  -- 12) Con la tienda en pausa.
  UPDATE tienda_sucursales SET pausa_hasta = now() + interval '10 minutes' WHERE sucursal_id = v_suc;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('12a') || md5('12b'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'TIENDA_CERRADA: EN_PAUSA' THEN RAISE EXCEPTION '12: esperaba «TIENDA_CERRADA: EN_PAUSA», dio %', COALESCE(v_err, 'un pedido'); END IF;
  UPDATE tienda_sucursales SET pausa_hasta = NULL WHERE sucursal_id = v_suc;

  -- 19) Un error de la cotización (producto agotado) se propaga con su código.
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_ag)::jsonb,
              v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('19a') || md5('19b'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'PRODUCTO_NO_DISPONIBLE: ' || v_ag THEN RAISE EXCEPTION '19: esperaba PRODUCTO_NO_DISPONIBLE, dio %', COALESCE(v_err, 'un pedido'); END IF;

  -- E1) La sucursal no es del negocio, en los dos sentidos (y con alguno de los dos en NULL).
  FOR r IN SELECT * FROM (VALUES (v_otro, v_suc), (v_t, v_suc_o), (v_t, NULL::uuid), (NULL::uuid, v_suc)) AS x(tenant, sucursal) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(r.tenant, r.sucursal, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('e1a') || md5('e1b'));
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE 'SUCURSAL_DE_OTRO_NEGOCIO:%' THEN
      RAISE EXCEPTION 'E1: esperaba SUCURSAL_DE_OTRO_NEGOCIO, dio %', COALESCE(v_err, 'un pedido');
    END IF;
  END LOOP;

  -- F7) La cuenta, si viene, es de ESTE negocio y sigue viva: delivery_pedidos no tiene llave foránea
  --     a tienda_cuentas (0161 §1), así que nadie más lo comprueba.
  FOR r IN SELECT * FROM (VALUES ('de otro negocio', v_cuenta_o), ('borrada', v_cuenta_del), ('que no existe', v_cat)) AS x(caso, cuenta) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, v_cli, NULL, 'EFECTIVO', NULL, NULL, md5('f7a') || md5('f7b'), r.cuenta);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA:%' THEN
      RAISE EXCEPTION 'F7: cuenta %: esperaba CUENTA_INVALIDA, dio %', r.caso, COALESCE(v_err, 'un pedido');
    END IF;
  END LOOP;

  -- 13) Cliente bloqueado. Su teléfono está guardado con formato: se compara por dígitos.
  INSERT INTO clientes (tenant_id, nombre, telefono, estado, motivo_bloqueo)   -- bloqueo_consistente exige motivo
  VALUES (v_t, 'Bloqueado Pedido', '(477) 555-0913', 'BLOQUEADO', 'smoke');
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550913"}', NULL, 'EFECTIVO', NULL, NULL, md5('13a') || md5('13b'));
    v_err13 := NULL;
  EXCEPTION WHEN OTHERS THEN v_err13 := SQLERRM;
  END;
  IF v_err13 IS NULL OR v_err13 NOT LIKE 'NO_SE_PUDO_CREAR:%' THEN RAISE EXCEPTION '13: cliente bloqueado: esperaba NO_SE_PUDO_CREAR, dio %', COALESCE(v_err13, 'un pedido'); END IF;

  -- 12, 13, 15–19) Ningún rechazo de los de arriba dejó fila.
  IF (SELECT count(*) FROM delivery_pedidos) <> v_n0 THEN
    RAISE EXCEPTION 'los rechazos dejaron % fila(s) en delivery_pedidos', (SELECT count(*) FROM delivery_pedidos) - v_n0;
  END IF;

  -- 18) Una huella repetida choca con el índice único: no hay dos pedidos con el mismo enlace.
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550918"}', NULL, 'EFECTIVO', NULL, NULL, md5('a1') || md5('b1'));
    RAISE EXCEPTION '18: aceptó una huella de seguimiento repetida';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%idx_delivery_pedidos_seguimiento%' THEN RAISE; END IF;
  END;

  -- F4) El pedido se crea al total que el cliente vio (paga al recibir). Con el total esperado
  --     correcto entra: recoger 120.00, y a domicilio 120 + 35 de envío.
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550920"}', NULL, 'EFECTIVO', NULL, NULL,
           md5('f4a') || md5('f4b'), p_total_esperado => 120.00);
  IF v_r ->> 'total_mxn' IS DISTINCT FROM '120.00' THEN RAISE EXCEPTION 'F4: con el total esperado correcto debía entrar: %', v_r; END IF;
  v_r := tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, v_uno, '{"nombre":"Ana","telefono":"4775550921"}', v_dir, 'TARJETA', NULL, NULL,
           md5('f4c') || md5('f4d'), NULL, 155);
  IF v_r ->> 'total_mxn' IS DISTINCT FROM '155.00' THEN RAISE EXCEPTION 'F4: a domicilio, con 155 esperado debía entrar: %', v_r; END IF;

  SELECT count(*) INTO v_n0 FROM delivery_pedidos;
  -- Con otro total: TOTAL_CAMBIO con el total de verdad (dos decimales), y nada más.
  FOR r IN SELECT * FROM (VALUES (119.99::numeric), (120.01), (0), (155), ('NaN')) AS x(esperado) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550923"}', NULL, 'EFECTIVO', NULL, NULL,
                md5('f4e') || md5('f4f'), p_total_esperado => r.esperado);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS DISTINCT FROM 'TOTAL_CAMBIO: 120.00' THEN
      RAISE EXCEPTION 'F4: esperando % debía dar «TOTAL_CAMBIO: 120.00», dio %', r.esperado, COALESCE(v_err, 'un pedido');
    END IF;
  END LOOP;
  -- El precio cambia entre la cotización y el pedido: el total viejo ya no vale…
  v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_uno);
  IF v_q ->> 'total_mxn' IS DISTINCT FROM '120.00' THEN RAISE EXCEPTION 'F4 (fixture): la cotización debía dar 120.00: %', v_q; END IF;
  UPDATE productos SET precio_base_mxn = 125.50 WHERE id = v_p120;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550923"}', NULL, 'EFECTIVO', NULL, NULL,
              md5('f4e') || md5('f4f'), p_total_esperado => (v_q ->> 'total_mxn')::numeric);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'TOTAL_CAMBIO: 125.50' THEN RAISE EXCEPTION 'F4: tras subir el precio, el total viejo debía dar «TOTAL_CAMBIO: 125.50», dio %', COALESCE(v_err, 'un pedido'); END IF;
  -- …y lo mismo si lo que cambia es el costo de la zona (120 + 40).
  UPDATE productos SET precio_base_mxn = 120 WHERE id = v_p120;
  UPDATE zonas_envio SET costo_mxn = 40 WHERE id = v_z35;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, v_uno, '{"nombre":"Ana","telefono":"4775550923"}', v_dir, 'EFECTIVO', NULL, NULL,
              md5('f4e') || md5('f4f'), p_total_esperado => 155);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'TOTAL_CAMBIO: 160.00' THEN RAISE EXCEPTION 'F4: tras subir el envío, el total viejo debía dar «TOTAL_CAMBIO: 160.00», dio %', COALESCE(v_err, 'un pedido'); END IF;
  UPDATE zonas_envio SET costo_mxn = 35 WHERE id = v_z35;
  -- Ningún TOTAL_CAMBIO dejó fila.
  IF (SELECT count(*) FROM delivery_pedidos) <> v_n0 THEN
    RAISE EXCEPTION 'F4: los TOTAL_CAMBIO dejaron % fila(s)', (SELECT count(*) FROM delivery_pedidos) - v_n0;
  END IF;
  -- Con el total nuevo, el mismo pedido entra.
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550923"}', NULL, 'EFECTIVO', NULL, NULL,
           md5('f4e') || md5('f4f'), p_total_esperado => 120);
  IF v_r ->> 'total_mxn' IS DISTINCT FROM '120.00' THEN RAISE EXCEPTION 'F4: con el total vigente debía entrar: %', v_r; END IF;

  -- 14) Con 3 pedidos vivos de un teléfono, el cuarto no entra…
  FOR v_i IN 1..3 LOOP
    v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550914"}', NULL, 'EFECTIVO', NULL, NULL, md5('14a' || v_i) || md5('14b' || v_i));
    v_ids := v_ids || (v_r ->> 'pedido_id')::uuid;
  END LOOP;
  -- …esté cada uno en el estado vivo que esté…
  FOR r IN SELECT * FROM (VALUES ('RECIBIDO', 'RECIBIDO', 'RECIBIDO'), ('ACEPTADO', 'EN_PREPARACION', 'LISTO')) AS x(e1, e2, e3) LOOP
    UPDATE delivery_pedidos SET estado = CASE id WHEN v_ids[1] THEN r.e1 WHEN v_ids[2] THEN r.e2 ELSE r.e3 END WHERE id = ANY (v_ids);
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550914"}', NULL, 'EFECTIVO', NULL, NULL, md5('14c') || md5('14d'));
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE 'NO_SE_PUDO_CREAR:%' THEN
      RAISE EXCEPTION '14: con 3 pedidos vivos (%, %, %) esperaba NO_SE_PUDO_CREAR, dio %', r.e1, r.e2, r.e3, COALESCE(v_err, 'un pedido');
    END IF;
    -- 13 y 14) El bloqueo y el tope responden IGUAL, letra por letra: no se revela cuál de los dos fue.
    IF v_err IS DISTINCT FROM v_err13 THEN RAISE EXCEPTION '14: el tope dice «%» y el bloqueo «%»: deben ser idénticos', v_err, v_err13; END IF;
  END LOOP;
  -- F6) No se sondea un teléfono sin crear un pedido: el bloqueo y el tope se miran al final, justo
  --     antes de insertar. Una petición inválida a propósito con un teléfono bloqueado (el del caso
  --     13) o en el tope (el de este caso) da SU error, el mismo que daría con cualquier otro
  --     teléfono, y no NO_SE_PUDO_CREAR.
  SELECT count(*) INTO v_n0 FROM delivery_pedidos;
  v_n := 0;
  FOR r IN SELECT f.tel, x.* FROM (VALUES ('4775550913'), ('4775550914')) AS f(tel), (VALUES
    ('forma de pago que no existe', 'PAGO_INVALIDO',          'RECOGER',   NULL::uuid, v_uno, NULL::jsonb, 'CHEQUE',   NULL::numeric, 'ok', NULL::numeric),
    ('paga con menos que el total', 'PAGO_INVALIDO',          'RECOGER',   NULL, v_uno, NULL, 'EFECTIVO', 1,    'ok', NULL),
    ('carrito vacío',               'CARRITO_INVALIDO',       'RECOGER',   NULL, '[]'::jsonb, NULL, 'EFECTIVO', NULL, 'ok', NULL),
    ('producto agotado',            'PRODUCTO_NO_DISPONIBLE', 'RECOGER',   NULL, format('[{"producto_id":"%s","cantidad":1}]', v_ag)::jsonb, NULL, 'EFECTIVO', NULL, 'ok', NULL),
    ('domicilio sin zona',          'ZONA_INVALIDA',          'DOMICILIO', NULL, v_uno, v_dir, 'EFECTIVO', NULL, 'ok', NULL),
    ('total que no es',             'TOTAL_CAMBIO',           'RECOGER',   NULL, v_uno, NULL, 'EFECTIVO', NULL, 'ok', 1),
    ('domicilio sin dirección',     'DIRECCION_INVALIDA',     'DOMICILIO', v_z35, v_uno, NULL, 'EFECTIVO', NULL, 'ok', NULL),
    ('huella mal formada',          'SEGUIMIENTO_INVALIDO',   'RECOGER',   NULL, v_uno, NULL, 'EFECTIVO', NULL, 'mala', NULL)
  ) AS x(caso, codigo, modo, zona, items, direccion, pago, paga_con, hash, total)
  LOOP
    v_n := v_n + 1;
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, r.modo, r.zona, r.items, jsonb_build_object('nombre', 'Ana', 'telefono', r.tel), r.direccion,
                r.pago, r.paga_con, NULL, CASE WHEN r.hash = 'ok' THEN md5('f6a') || md5('f6b') ELSE r.hash END,
                p_total_esperado => r.total);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE r.codigo || ':%' THEN
      RAISE EXCEPTION 'F6 (teléfono %, %): esperaba %, dio %', r.tel, r.caso, r.codigo, COALESCE(v_err, 'un pedido');
    END IF;
  END LOOP;
  IF v_n <> 16 THEN RAISE EXCEPTION 'F6: se probaron % de 16', v_n; END IF;
  -- La cuenta también se valida antes: con un teléfono bloqueado, una cuenta ajena da CUENTA_INVALIDA.
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550913"}', NULL, 'EFECTIVO', NULL, NULL,
              md5('f6a') || md5('f6b'), v_cuenta_o);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA:%' THEN RAISE EXCEPTION 'F6 (cuenta ajena con teléfono bloqueado): esperaba CUENTA_INVALIDA, dio %', COALESCE(v_err, 'un pedido'); END IF;
  -- Y esos dos teléfonos, con una petición VÁLIDA, siguen sin poder pedir (control).
  FOR r IN SELECT * FROM (VALUES ('4775550913'), ('4775550914')) AS f(tel) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, jsonb_build_object('nombre', 'Ana', 'telefono', r.tel), NULL, 'EFECTIVO', NULL, NULL,
                md5('f6a') || md5('f6b'), p_total_esperado => 120);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS DISTINCT FROM v_err13 THEN RAISE EXCEPTION 'F6 (control, teléfono %): una petición válida debía dar «%», dio %', r.tel, v_err13, COALESCE(v_err, 'un pedido'); END IF;
  END LOOP;
  IF (SELECT count(*) FROM delivery_pedidos) <> v_n0 THEN
    RAISE EXCEPTION 'F6: los rechazos dejaron % fila(s)', (SELECT count(*) FROM delivery_pedidos) - v_n0;
  END IF;

  -- …y con uno de ellos ya ENTREGADO, entra.
  UPDATE delivery_pedidos SET estado = 'ENTREGADO' WHERE id = v_ids[1];
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550914"}', NULL, 'EFECTIVO', NULL, NULL, md5('14c') || md5('14d'));
  IF v_r ->> 'total_mxn' IS DISTINCT FROM '120.00' THEN RAISE EXCEPTION '14: con uno ENTREGADO debía entrar: %', v_r; END IF;
  -- E14) El tope es por negocio y por canal: tres pedidos vivos de la tienda de OTRO negocio con el
  --      mismo teléfono no cuentan.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, cliente_telefono, items, payload_raw)
  SELECT v_otro, v_suc_o, 'TIENDA', 'DRIVE_THRU', 'pedido-smoke-ajeno-' || g, 'RECIBIDO', '4775550915', '[]'::jsonb, '{}'::jsonb
    FROM generate_series(1, 3) g;
  v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550915"}', NULL, 'EFECTIVO', NULL, NULL, md5('14e') || md5('14f'));
  IF v_r ->> 'total_mxn' IS DISTINCT FROM '120.00' THEN RAISE EXCEPTION 'E14: los pedidos de otro negocio no cuentan para el tope: %', v_r; END IF;

  -- F1) El límite decae. Con gestión NUBE nada mueve `estado` más allá de ACEPTADO (el seguimiento lo
  --     deriva del ticket al leer): sin esto, tras tres pedidos aceptados ese teléfono no vuelve a pedir.
  -- a) Tres pedidos aceptados, cada uno con su ticket en la nube. Con el ticket abierto, cuentan…
  v_ids := '{}';
  FOR v_i IN 1..3 LOOP
    v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550916"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1a' || v_i) || md5('f1b' || v_i));
    v_ids := v_ids || (v_r ->> 'pedido_id')::uuid;
    v_tks := v_tks || crear_ticket_desde_tienda((v_r ->> 'pedido_id')::uuid);
  END LOOP;
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550916"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1c') || md5('f1d'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM v_err13 THEN RAISE EXCEPTION 'F1a (control): tres aceptados con el ticket abierto: esperaba NO_SE_PUDO_CREAR, dio %', COALESCE(v_err, 'un pedido'); END IF;
  -- …y con el ticket cobrado, facturado o cancelado, no: `estado` sigue en ACEPTADO en los tres.
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id IN (v_tks[1], v_tks[2]);
  UPDATE tickets SET estado_fiscal = 'FACTURADO' WHERE id = v_tks[2];
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_tks[3];
  IF (SELECT count(*) FROM delivery_pedidos WHERE id = ANY (v_ids) AND estado = 'ACEPTADO' AND gestion = 'NUBE') <> 3 THEN
    RAISE EXCEPTION 'F1a (fixture): los tres pedidos debían seguir ACEPTADO y con gestión NUBE';
  END IF;
  -- Caben TRES nuevos: si uno solo de los tres estados terminales siguiera contando, el tercero no entraría.
  FOR v_i IN 1..3 LOOP
    BEGIN
      v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550916"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1e' || v_i) || md5('f1f' || v_i));
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'F1a: con los tres tickets cobrado, facturado y cancelado, el pedido nuevo % de 3 debía entrar: %', v_i, SQLERRM;
    END;
  END LOOP;
  -- Y el tope sigue ahí para los que sí están vivos: tres recientes sin ticket terminal.
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550916"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1g') || md5('f1h'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM v_err13 THEN RAISE EXCEPTION 'F1a: con tres vivos recientes sin ticket terminal esperaba NO_SE_PUDO_CREAR, dio %', COALESCE(v_err, 'un pedido'); END IF;

  -- b) Tres pedidos vivos sin ticket: a las 5 h 59 min todavía cuentan; a las 7 horas, ya no.
  v_ids := '{}';
  FOR v_i IN 1..3 LOOP
    v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550917"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1i' || v_i) || md5('f1j' || v_i));
    v_ids := v_ids || (v_r ->> 'pedido_id')::uuid;
  END LOOP;
  UPDATE delivery_pedidos SET recibido_at = now() - interval '5 hours 59 minutes' WHERE id = ANY (v_ids);
  v_err := NULL;
  BEGIN
    PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550917"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1k') || md5('f1l'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM v_err13 THEN RAISE EXCEPTION 'F1b (control): tres vivos de hace 5 h 59 min: esperaba NO_SE_PUDO_CREAR, dio %', COALESCE(v_err, 'un pedido'); END IF;
  UPDATE delivery_pedidos SET recibido_at = now() - interval '7 hours' WHERE id = ANY (v_ids);
  BEGIN
    v_r := tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_uno, '{"nombre":"Ana","telefono":"4775550917"}', NULL, 'EFECTIVO', NULL, NULL, md5('f1k') || md5('f1l'));
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'F1b: con los tres pedidos vivos recibidos hace 7 horas, el cuarto debía entrar: %', SQLERRM;
  END;
  IF (SELECT count(*) FROM delivery_pedidos WHERE id = ANY (v_ids) AND estado = 'RECIBIDO') <> 3 THEN RAISE EXCEPTION 'F1b (fixture): los tres viejos debían seguir en RECIBIDO'; END IF;

  -- Una sola firma: con dos, PostgREST no sabría a cuál llamar.
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'tienda_crear_pedido' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'F4: debe existir exactamente una función tienda_crear_pedido, hay %',
      (SELECT count(*) FROM pg_proc WHERE proname = 'tienda_crear_pedido' AND pronamespace = 'public'::regnamespace);
  END IF;
  -- Permisos: solo service_role.
  IF NOT has_function_privilege('service_role', c_firma, 'EXECUTE') THEN RAISE EXCEPTION 'permisos: service_role debe poder ejecutar tienda_crear_pedido'; END IF;
  IF has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('authenticated', c_firma, 'EXECUTE') THEN
    RAISE EXCEPTION 'permisos: anon o authenticated pueden ejecutar tienda_crear_pedido';
  END IF;

  RAISE NOTICE 'smoke_tienda_pedido OK';
END $$;
ROLLBACK;
