-- Smoke tienda en línea (mig. 0162 §3): tienda_cotizar. La cotización tiene que dar, al centavo, el
-- total que tendrá el ticket; por eso cada carrito con importe se cotiza Y se lleva hasta el ticket
-- (pedido insertado a mano con lo cotizado → crear_ticket_desde_tienda, que aborta con
-- TOTAL_NO_COINCIDE si la cotización se equivoca).
-- Fixture propio sobre el negocio y la sucursal de la semilla. Los casos numerados son los del plan
-- (1–22); los que empiezan con E son de más.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_cotizar.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := '63636363-0000-0000-0000-0000000000ab';
  v_suc_o  uuid; v_suc2 uuid;
  v_cat uuid; v_cat_in uuid;
  -- Productos que se venden.
  v_p120 uuid; v_a uuid; v_f33 uuid; v_f100 uuid; v_f8 uuid; v_papas uuid;
  v_ref uuid; v_agua uuid; v_te uuid; v_vaso uuid; v_regalo uuid; v_jugo uuid;
  v_combo uuid; v_combo_f uuid;
  -- Productos que no.
  v_pau uuid; v_nv uuid; v_del uuid; v_nsv uuid; v_ajeno uuid; v_in uuid; v_ag uuid;
  -- Modificadores.
  v_g1 uuid; v_g2 uuid; v_g3 uuid; v_g_in uuid;
  v_o_tc uuid; v_o_bc uuid; v_o15 uuid; v_o10 uuid; v_oneg uuid; v_o_agot uuid; v_o_inact uuid;
  v_o_ajena uuid; v_o_g3 uuid; v_o_gin uuid;
  -- Slots y zonas.
  v_s_beb uuid; v_s_aco uuid; v_s_in uuid; v_s_f uuid;
  v_z35 uuid; v_z0 uuid; v_z_inact uuid; v_z_del uuid; v_z_suc2 uuid; v_z_ajena uuid;
  v_dir jsonb := '{"calle":"Av. Cotizar","numero_exterior":"1","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}'::jsonb;
  v_casos jsonb; v_c jsonb; v_q jsonb; v_qs jsonb := '{}'::jsonb; v_tks jsonb := '{}'::jsonb;
  v_i jsonb; v_m jsonb; v_menu jsonb;
  v_ped uuid; v_ticket uuid; v_total numeric; v_n int; v_n2 int; v_err text; r record;
  v_cuarenta jsonb; v_41 jsonb; v_nota text; v_gr jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture ───────────────────────────────────────────────────────────────
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0162-cot', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OC', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'C2', 'Otra sucursal nuestra') RETURNING id INTO v_suc2;

  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Cotizar smoke', 60) RETURNING id INTO v_cat;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_t, 'Cotizar inactiva', 61, false) RETURNING id INTO v_cat_in;

  -- IVA incluido (16 %).
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla cotizar', 120) RETURNING id INTO v_p120;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Con término cotizar', 100) RETURNING id INTO v_a;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Papas cotizar', 30) RETURNING id INTO v_papas;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Refresco cotizar', 25) RETURNING id INTO v_ref;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Agua cotizar', 20) RETURNING id INTO v_agua;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Té cotizar', 22) RETURNING id INTO v_te;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Vaso cotizar', 5) RETURNING id INTO v_vaso;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Regalo cotizar', 0) RETURNING id INTO v_regalo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Jugo agotado cotizar', 35) RETURNING id INTO v_jugo;
  -- IVA por fuera.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 cotizar', 33.33, 16, false) RETURNING id INTO v_f33;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 de cien cotizar', 100, 16, false) RETURNING id INTO v_f100;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 8 cotizar', 100, 8, false) RETURNING id INTO v_f8;
  -- Combos: uno con IVA incluido y otro con IVA por fuera.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo)
  VALUES (v_t, v_cat, 'Combo cotizar', 150, true) RETURNING id INTO v_combo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Combo fuera cotizar', 100, true, 16, false) RETURNING id INTO v_combo_f;
  -- Los que la tienda no vende.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, estado) VALUES (v_t, v_cat, 'Pausado cotizar', 10, 'PAUSADO') RETURNING id INTO v_pau;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, visible_en_pos) VALUES (v_t, v_cat, 'No visible cotizar', 10, false) RETURNING id INTO v_nv;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, deleted_at) VALUES (v_t, v_cat, 'Borrado cotizar', 10, now()) RETURNING id INTO v_del;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'No se vende aquí cotizar', 10) RETURNING id INTO v_nsv;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Agotado cotizar', 10) RETURNING id INTO v_ag;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat_in, 'En categoría inactiva cotizar', 10) RETURNING id INTO v_in;
  -- De otro negocio, colgado de UNA CATEGORÍA NUESTRA: lo único que lo deja fuera es su tenant.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_otro, v_cat, 'De otro negocio cotizar', 10) RETURNING id INTO v_ajeno;
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible)     VALUES (v_t, v_nsv,  v_suc, false);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_t, v_ag,   v_suc, true);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_t, v_jugo, v_suc, true);

  -- Modificadores. g1 obligatorio (uno y solo uno); g2 opcional con extras de pago, una opción
  -- negativa, una agotada, una inactiva y una DE OTRO NEGOCIO dentro de nuestro grupo; g3 no está
  -- ligado ni a «Sencilla» ni a «Con término»; g_in está ligado pero inactivo.
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Término cotizar', 'UNICA_OBLIGATORIA') RETURNING id INTO v_g1;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras cotizar', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g2;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Salsas cotizar', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g3;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, activo) VALUES (v_t, 'Inactivo cotizar', 'MULTIPLE_OPCIONAL', false) RETURNING id INTO v_g_in;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, es_default, orden_visualizacion) VALUES (v_t, v_g1, 'Tres cuartos', true, 1) RETURNING id INTO v_o_tc;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, orden_visualizacion) VALUES (v_t, v_g1, 'Bien cocida', 2) RETURNING id INTO v_o_bc;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Aguacate', 10, 2) RETURNING id INTO v_o10;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Descuento raro', -5, 3) RETURNING id INTO v_oneg;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion, agotada) VALUES (v_t, v_g2, 'Tocino', 20, 4, true) RETURNING id INTO v_o_agot;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion, activa) VALUES (v_t, v_g2, 'Inactiva', 1, 5, false) RETURNING id INTO v_o_inact;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_otro, v_g2, 'Ajena', 1, 6) RETURNING id INTO v_o_ajena;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn) VALUES (v_t, v_g3, 'Salsa suelta', 5) RETURNING id INTO v_o_g3;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn) VALUES (v_t, v_g_in, 'De grupo inactivo', 5) RETURNING id INTO v_o_gin;
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES
    (v_t, v_p120, v_g2, 1), (v_t, v_p120, v_g_in, 2),
    (v_t, v_a, v_g1, 1), (v_t, v_a, v_g2, 2),
    (v_t, v_f8, v_g2, 1),
    (v_t, v_papas, v_g3, 1);

  -- Combo con IVA incluido ($150). «Bebida»: DELTA, obligatoria, opciones explícitas (una excluida,
  -- una más barata, una que dejaría el combo en negativo y una agotada). «Acompañamiento»:
  -- SUMA_PRECIO_PRODUCTO, opcional, hasta 2. Y un slot inactivo.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo, 'Bebida', 1, 'DELTA') RETURNING id INTO v_s_beb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, minimo_selecciones, maximo_selecciones)
  VALUES (v_t, v_combo, 'Acompañamiento', 2, 'SUMA_PRECIO_PRODUCTO', 0, 2) RETURNING id INTO v_s_aco;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, minimo_selecciones, activo)
  VALUES (v_t, v_combo, 'Slot inactivo', 3, 'DELTA', 0, false) RETURNING id INTO v_s_in;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES
    (v_t, v_s_beb, v_ref, 10, 1), (v_t, v_s_beb, v_agua, 0, 2), (v_t, v_s_beb, v_vaso, -5, 3),
    (v_t, v_s_beb, v_regalo, -200, 4), (v_t, v_s_beb, v_jugo, 0, 5),
    (v_t, v_s_aco, v_papas, 5, 1), (v_t, v_s_aco, v_f8, 0, 2), (v_t, v_s_aco, v_a, 0, 3),
    (v_t, v_s_in, v_ref, 0, 1);
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, activa) VALUES (v_t, v_s_beb, v_te, false);
  -- Combo con IVA por fuera ($100 + 16 %): su hijo («Sencilla», IVA incluido) admite extras de pago.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo_f, 'Principal', 1, 'DELTA') RETURNING id INTO v_s_f;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id) VALUES (v_t, v_s_f, v_p120);

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Cotizar 35', 35) RETURNING id INTO v_z35;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Cotizar gratis', 0) RETURNING id INTO v_z0;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn, activa) VALUES (v_t, v_suc, 'Cotizar inactiva', 10, false) RETURNING id INTO v_z_inact;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn, deleted_at) VALUES (v_t, v_suc, 'Cotizar borrada', 10, now()) RETURNING id INTO v_z_del;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc2, 'Cotizar otra sucursal', 20) RETURNING id INTO v_z_suc2;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_otro, v_suc_o, 'Cotizar ajena', 20) RETURNING id INTO v_z_ajena;

  -- Un turno abierto, para llevar cada cotización hasta el ticket. dia_contable en hora de México.
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-COTIZAR', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');

  -- ── Totales (casos 1–11 y E1–E6), calculados a mano ───────────────────────
  -- Cada fila: carrito, modo y zona → subtotal, envío (como se guarda), envío total (lo que paga
  -- el cliente) y total.
  v_casos := jsonb_build_array(
    -- 1) 2 × $120 con IVA incluido.
    jsonb_build_object('caso', '1', 'modo', 'RECOGER', 'sub', '240.00', 'env', '0.00', 'envtot', '0.00', 'tot', '240.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    -- 2) El extra de $15 se multiplica por la cantidad del renglón: 2 × (120 + 15).
    jsonb_build_object('caso', '2', 'modo', 'RECOGER', 'sub', '270.00', 'env', '0.00', 'envtot', '0.00', 'tot', '270.00',
      'items', format('[{"producto_id":"%s","cantidad":2,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o15)::jsonb),
    -- 3) El extra en cantidad 2: 120 + 2 × 15.
    jsonb_build_object('caso', '3', 'modo', 'RECOGER', 'sub', '150.00', 'env', '0.00', 'envtot', '0.00', 'tot', '150.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":2}]}]', v_p120, v_o15)::jsonb),
    -- 4) 3 × $33.33 con IVA 16 % por fuera: bruto 99.99, IVA round(15.9984) = 16.00.
    jsonb_build_object('caso', '4', 'modo', 'RECOGER', 'sub', '115.99', 'env', '0.00', 'envtot', '0.00', 'tot', '115.99',
      'items', format('[{"producto_id":"%s","cantidad":3}]', v_f33)::jsonb),
    -- 5) $100 + 8 % por fuera (108) y $120 con IVA incluido.
    jsonb_build_object('caso', '5', 'modo', 'RECOGER', 'sub', '228.00', 'env', '0.00', 'envtot', '0.00', 'tot', '228.00',
      'items', format('[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":1}]', v_f8, v_p120)::jsonb),
    -- 6) El caso 1 a domicilio, zona de $35: el primer renglón lleva IVA incluido, el envío también.
    jsonb_build_object('caso', '6', 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '240.00', 'env', '35.00', 'envtot', '35.00', 'tot', '275.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    -- 7) Primer renglón con IVA 16 % por fuera: el envío lo hereda (35 + 5.60).
    jsonb_build_object('caso', '7', 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '116.00', 'env', '35.00', 'envtot', '40.60', 'tot', '156.60',
      'items', format('[{"producto_id":"%s","cantidad":1}]', v_f100)::jsonb),
    -- 8) Zona gratis.
    jsonb_build_object('caso', '8', 'modo', 'DOMICILIO', 'zona', v_z0, 'sub', '240.00', 'env', '0.00', 'envtot', '0.00', 'tot', '240.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    -- 9) Combo de $150, slot DELTA con una elección de delta $10.
    jsonb_build_object('caso', '9', 'modo', 'RECOGER', 'sub', '160.00', 'env', '0.00', 'envtot', '0.00', 'tot', '160.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo, v_s_beb, v_ref)::jsonb),
    -- 10) 2 combos; el slot SUMA_PRECIO_PRODUCTO suma el producto ($30) más su delta ($5): 2 × (150 + 0 + 35).
    jsonb_build_object('caso', '10', 'modo', 'RECOGER', 'sub', '370.00', 'env', '0.00', 'envtot', '0.00', 'tot', '370.00',
      'items', format('[{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo, v_s_beb, v_agua, v_s_aco, v_papas)::jsonb),
    -- 11) 2 combos de $100 + 16 % por fuera (232.00); su hijo, con IVA incluido, lleva un extra de
    --     $10 que se cobra por cada combo (20.00).
    jsonb_build_object('caso', '11', 'modo', 'RECOGER', 'sub', '252.00', 'env', '0.00', 'envtot', '0.00', 'tot', '252.00',
      'items', format('[{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                      v_combo_f, v_s_f, v_p120, v_o10)::jsonb),
    -- E1) El extra de un hijo cobra con el IVA DEL HIJO: padre 150 + 0 + 100 = 250 (incluido);
    --     hijo con 8 % por fuera, extra 15 × 2 = 30 + 2.40.
    jsonb_build_object('caso', 'E1', 'modo', 'RECOGER', 'sub', '282.40', 'env', '0.00', 'envtot', '0.00', 'tot', '282.40',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":2}]}]}]',
                      v_combo, v_s_beb, v_agua, v_s_aco, v_f8, v_o15)::jsonb),
    -- E2) Una elección de slot puede ser más barata (delta −5): 150 − 5.
    jsonb_build_object('caso', 'E2', 'modo', 'RECOGER', 'sub', '145.00', 'env', '0.00', 'envtot', '0.00', 'tot', '145.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo, v_s_beb, v_vaso)::jsonb),
    -- E3) Tres renglones mezclados, a domicilio:
    --     3 × 120 + 15×1×3 + 10×2×3 = 465.00; 2 × (150 + 10 + 35×2) = 460.00; 33.33 + 5.33 = 38.66.
    jsonb_build_object('caso', 'E3', 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '963.66', 'env', '35.00', 'envtot', '35.00', 'tot', '998.66',
      'items', format('[{"producto_id":"%s","cantidad":3,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":1}]',
                      v_p120, v_o15, v_o10, v_combo, v_s_beb, v_ref, v_s_aco, v_papas, v_f33)::jsonb),
    -- E4) El primer renglón es un combo con IVA por fuera: el envío hereda el IVA DEL COMBO.
    jsonb_build_object('caso', 'E4', 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '116.00', 'env', '35.00', 'envtot', '40.60', 'tot', '156.60',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo_f, v_s_f, v_p120)::jsonb),
    -- E5) El envío hereda el IVA del PRIMER renglón (8 %), no el del segundo: 35 + 2.80.
    jsonb_build_object('caso', 'E5', 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '228.00', 'env', '35.00', 'envtot', '37.80', 'tot', '265.80',
      'items', format('[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":1}]', v_f8, v_p120)::jsonb),
    -- E6) Un hijo con grupo obligatorio y un extra: padre 150 + 0 + 100 = 250; hijo 0 + 15.
    jsonb_build_object('caso', 'E6', 'modo', 'RECOGER', 'sub', '265.00', 'env', '0.00', 'envtot', '0.00', 'tot', '265.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":1}]}]}]',
                      v_combo, v_s_beb, v_agua, v_s_aco, v_a, v_o_bc, v_o15)::jsonb));

  -- Y lo que el menú ofrece: de cada producto no agotado, un carrito con lo mínimo que el menú
  -- exige (la primera opción no agotada de cada grupo y de cada slot obligatorios). La cotización
  -- tiene que aceptar todo lo que el menú enseña, y el ticket tiene que salir por lo cotizado.
  v_menu := tienda_menu(v_t, v_suc);
  SELECT v_casos || jsonb_agg(jsonb_build_object('caso', 'menú ' || (p ->> 'nombre'), 'modo', 'RECOGER',
           'items', jsonb_build_array(jsonb_build_object(
             'producto_id', p ->> 'id', 'cantidad', 1,
             'modificadores', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object('opcion_id', x.o ->> 'id', 'cantidad', (g ->> 'minimo')::int)), '[]'::jsonb)
                 FROM jsonb_array_elements(p -> 'grupos') g
                CROSS JOIN LATERAL (SELECT o FROM jsonb_array_elements(g -> 'opciones') o WHERE NOT (o ->> 'agotada')::boolean LIMIT 1) x
                WHERE (g ->> 'minimo')::int >= 1),
             'componentes', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'grupo_id', s ->> 'id', 'producto_id', y.o ->> 'producto_id', 'cantidad', (s ->> 'minimo')::int,
                        'modificadores', (
                          SELECT COALESCE(jsonb_agg(jsonb_build_object('opcion_id', x.o ->> 'id', 'cantidad', (g ->> 'minimo')::int)), '[]'::jsonb)
                            FROM jsonb_array_elements(y.o -> 'grupos') g
                           CROSS JOIN LATERAL (SELECT o FROM jsonb_array_elements(g -> 'opciones') o WHERE NOT (o ->> 'agotada')::boolean LIMIT 1) x
                           WHERE (g ->> 'minimo')::int >= 1))), '[]'::jsonb)
                 FROM jsonb_array_elements(p -> 'slots') s
                CROSS JOIN LATERAL (SELECT o FROM jsonb_array_elements(s -> 'opciones') o WHERE NOT (o ->> 'agotado')::boolean LIMIT 1) y
                WHERE (s ->> 'minimo')::int >= 1)))))
    INTO v_casos
    FROM jsonb_path_query(v_menu, '$.categorias[*].productos[*] ? (@.agotado == false)') p;
  -- 17 a mano, y del menú los 13 de este fixture que se venden más los de la semilla.
  IF jsonb_array_length(v_casos) < 17 + 13 THEN RAISE EXCEPTION 'fixture: esperaba al menos 30 carritos, hay %', jsonb_array_length(v_casos); END IF;

  v_n := 0;
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_casos) LOOP
    v_n := v_n + 1;
    v_q := tienda_cotizar(v_t, v_suc, v_c ->> 'modo', (v_c ->> 'zona')::uuid, v_c -> 'items');
    v_qs := v_qs || jsonb_build_object(v_c ->> 'caso', v_q);

    IF NOT (v_q ?& ARRAY['items', 'renglones', 'subtotal_mxn', 'envio_mxn', 'envio_total_mxn', 'total_mxn'])
       OR (SELECT count(*) FROM jsonb_object_keys(v_q)) <> 6 THEN
      RAISE EXCEPTION '%: la salida debe traer exactamente items, renglones, subtotal_mxn, envio_mxn, envio_total_mxn y total_mxn: %', v_c ->> 'caso', v_q;
    END IF;
    IF v_c ? 'tot' AND ROW(v_q ->> 'subtotal_mxn', v_q ->> 'envio_mxn', v_q ->> 'envio_total_mxn', v_q ->> 'total_mxn')
                       IS DISTINCT FROM ROW(v_c ->> 'sub', v_c ->> 'env', v_c ->> 'envtot', v_c ->> 'tot') THEN
      RAISE EXCEPTION '%: esperaba subtotal %, envío %, envío total %, total %; dio %, %, %, %', v_c ->> 'caso',
        v_c ->> 'sub', v_c ->> 'env', v_c ->> 'envtot', v_c ->> 'tot',
        v_q ->> 'subtotal_mxn', v_q ->> 'envio_mxn', v_q ->> 'envio_total_mxn', v_q ->> 'total_mxn';
    END IF;
    -- Coherencia interna: un renglón por renglón del carrito, la suma de sus totales es el subtotal
    -- y total = subtotal + envío total.
    IF jsonb_array_length(v_q -> 'items') <> jsonb_array_length(v_c -> 'items')
       OR jsonb_array_length(v_q -> 'renglones') <> jsonb_array_length(v_c -> 'items')
       OR (SELECT sum((x ->> 'total_mxn')::numeric) FROM jsonb_array_elements(v_q -> 'renglones') x) <> (v_q ->> 'subtotal_mxn')::numeric
       OR (v_q ->> 'subtotal_mxn')::numeric + (v_q ->> 'envio_total_mxn')::numeric <> (v_q ->> 'total_mxn')::numeric THEN
      RAISE EXCEPTION '%: la cotización no cuadra consigo misma: %', v_c ->> 'caso', v_q;
    END IF;

    -- Ida y vuelta: el pedido con lo cotizado se convierte en ticket por ese mismo total.
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
      cliente_nombre, cliente_telefono, direccion, zona_envio_id, pago_al_recibir, items, payload_raw,
      subtotal_mxn, envio_mxn, total_cliente_mxn, vence_aceptacion)
    VALUES (v_t, v_suc, 'TIENDA',
      (CASE v_c ->> 'modo' WHEN 'DOMICILIO' THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)::modo_servicio,
      'cotizar-smoke-' || v_n, 'RECIBIDO',
      CASE v_c ->> 'modo' WHEN 'DOMICILIO' THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END,
      'Ana Cotizar', '4775550101', CASE v_c ->> 'modo' WHEN 'DOMICILIO' THEN v_dir END, (v_c ->> 'zona')::uuid, 'TARJETA',
      v_q -> 'items', '{}'::jsonb,
      (v_q ->> 'subtotal_mxn')::numeric, (v_q ->> 'envio_mxn')::numeric, (v_q ->> 'total_mxn')::numeric, now() + interval '5 minutes')
    RETURNING id INTO v_ped;
    BEGIN
      v_ticket := crear_ticket_desde_tienda(v_ped);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ida y vuelta, caso %: el ticket no aceptó la cotización: % — cotización: %', v_c ->> 'caso', SQLERRM, v_q;
    END;
    SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
    IF v_total IS DISTINCT FROM (v_q ->> 'total_mxn')::numeric THEN
      RAISE EXCEPTION 'ida y vuelta, caso %: ticket % vs cotización %', v_c ->> 'caso', v_total, v_q ->> 'total_mxn';
    END IF;
    v_tks := v_tks || jsonb_build_object(v_c ->> 'caso', v_ticket);
  END LOOP;

  -- Lo que los casos 4, 7 y 11 dicen de cada renglón se lee del ticket real, que es quien manda.
  IF NOT EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = (v_tks ->> '4')::uuid
                    AND subtotal_bruto_mxn = 99.99 AND iva_item_mxn = 16.00 AND total_item_mxn = 115.99) THEN
    RAISE EXCEPTION '4: el renglón del ticket debía ser bruto 99.99, IVA 16.00, total 115.99';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = (v_tks ->> '7')::uuid
                    AND cargo_tipo = 'ENVIO' AND precio_unitario_snapshot = 35.00 AND total_item_mxn = 40.60) THEN
    RAISE EXCEPTION '7: el renglón de envío del ticket debía ser de 35.00 y total 40.60';
  END IF;
  IF (SELECT count(*) FROM ticket_items WHERE ticket_id = (v_tks ->> '8')::uuid AND cargo_tipo IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION '8: una zona gratis no deja renglón de envío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = (v_tks ->> '11')::uuid AND combo_rol = 'PADRE' AND total_item_mxn = 232.00)
     OR NOT EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = (v_tks ->> '11')::uuid AND combo_rol = 'HIJO' AND total_item_mxn = 20.00) THEN
    RAISE EXCEPTION '11: el ticket debía traer el padre en 232.00 y el hijo en 20.00';
  END IF;

  -- 2) El renglón que se le enseña al cliente, completo.
  IF v_qs -> '2' -> 'renglones' IS DISTINCT FROM
     '[{"nombre": "Sencilla cotizar", "cantidad": 2, "detalle": "Extra queso", "total_mxn": "270.00"}]'::jsonb THEN
    RAISE EXCEPTION '2: renglones: %', v_qs -> '2' -> 'renglones';
  END IF;
  IF jsonb_typeof(v_qs -> '1' -> 'renglones' -> 0 -> 'detalle') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION '1: sin modificadores, detalle va en null: %', v_qs -> '1' -> 'renglones';
  END IF;

  -- 9) El precio del renglón: la base del combo va en precio_unitario_mxn y el delta en la elección.
  v_i := v_qs -> '9' -> 'items' -> 0;
  IF v_qs -> '9' -> 'renglones' -> 0 ->> 'total_mxn' IS DISTINCT FROM '160.00' OR v_i ->> 'precio_unitario_mxn' IS DISTINCT FROM '150.00'
     OR v_i -> 'modificadores' -> 0 ->> 'precio_extra_mxn' IS DISTINCT FROM '10.00' THEN
    RAISE EXCEPTION '9: esperaba renglón 160.00 = base 150.00 + elección 10.00: %', v_qs -> '9';
  END IF;
  IF v_qs -> '9' -> 'renglones' -> 0 ->> 'detalle' IS DISTINCT FROM 'Refresco cotizar' THEN
    RAISE EXCEPTION '9: el detalle de un combo son sus elecciones: %', v_qs -> '9' -> 'renglones';
  END IF;

  -- 10) precio_unitario_mxn es la base; la elección SUMA_PRECIO_PRODUCTO lleva producto + delta.
  v_i := v_qs -> '10' -> 'items' -> 0;
  v_m := jsonb_path_query_first(v_i, '$.modificadores[*] ? (@.opcion_modificador_id == $id)', jsonb_build_object('id', v_papas));
  IF v_i ->> 'precio_unitario_mxn' IS DISTINCT FROM '150.00' OR v_m ->> 'precio_extra_mxn' IS DISTINCT FROM '35.00' THEN
    RAISE EXCEPTION '10: esperaba precio_unitario_mxn 150.00 y la elección en 35.00: %', v_i;
  END IF;
  -- E2) El delta negativo sale tal cual en la elección.
  IF v_qs -> 'E2' -> 'items' -> 0 -> 'modificadores' -> 0 ->> 'precio_extra_mxn' IS DISTINCT FROM '-5.00' THEN
    RAISE EXCEPTION 'E2: la elección más barata debía ir en -5.00: %', v_qs -> 'E2' -> 'items';
  END IF;

  -- 12) items de un producto simple: grupo_id null (presente), precio_extra_mxn texto, cantidades enteras.
  v_i := v_qs -> '3' -> 'items' -> 0;
  v_m := v_i -> 'modificadores' -> 0;
  IF NOT (v_i ?& ARRAY['producto_id', 'nombre_app', 'cantidad', 'precio_unitario_mxn', 'nota', 'alergenos', 'alergia_nota', 'modificadores'])
     OR NOT (v_m ?& ARRAY['opcion_modificador_id', 'grupo_id', 'nombre_app', 'cantidad', 'precio_extra_mxn']) THEN
    RAISE EXCEPTION '12: faltan claves en el renglón normalizado: %', v_i;
  END IF;
  IF v_i ->> 'producto_id' <> v_p120::text OR v_i ->> 'precio_unitario_mxn' <> '120.00'
     OR v_m ->> 'opcion_modificador_id' <> v_o15::text OR jsonb_typeof(v_m -> 'grupo_id') <> 'null'
     OR jsonb_typeof(v_m -> 'precio_extra_mxn') <> 'string' OR v_m ->> 'precio_extra_mxn' <> '15.00'
     OR jsonb_typeof(v_m -> 'cantidad') <> 'number' OR (v_m -> 'cantidad')::text <> '2'
     OR jsonb_typeof(v_i -> 'cantidad') <> 'number' OR (v_i -> 'cantidad')::text <> '1' THEN
    RAISE EXCEPTION '12: renglón normalizado de un producto simple: %', v_i;
  END IF;
  -- En TODAS las cotizaciones: cada `cantidad` es un entero JSON (sin punto decimal: el ticket la
  -- lee con ::int), y cada importe es texto con dos decimales, nunca null ni número.
  SELECT count(*), count(*) FILTER (WHERE jsonb_typeof(x) = 'number' AND x::text ~ '^[0-9]+$')
    INTO v_n, v_n2 FROM jsonb_path_query(v_qs, '$.**.cantidad') x;
  IF v_n < 60 OR v_n <> v_n2 THEN RAISE EXCEPTION '12: % cantidades, % enteras: %', v_n, v_n2, v_qs; END IF;
  SELECT count(*), count(*) FILTER (WHERE jsonb_typeof(x) = 'string' AND x #>> '{}' ~ '^-?[0-9]+\.[0-9]{2}$')
    INTO v_n, v_n2
    FROM (SELECT jsonb_path_query(v_qs, '$.**.precio_extra_mxn') AS x
          UNION ALL SELECT jsonb_path_query(v_qs, '$.**.precio_unitario_mxn')
          UNION ALL SELECT jsonb_path_query(v_qs, '$.**.total_mxn')
          UNION ALL SELECT jsonb_path_query(v_qs, '$.**.subtotal_mxn')
          UNION ALL SELECT jsonb_path_query(v_qs, '$.**.envio_mxn')
          UNION ALL SELECT jsonb_path_query(v_qs, '$.**.envio_total_mxn')) t;
  IF v_n < 150 OR v_n <> v_n2 THEN RAISE EXCEPTION '12: % importes, % como texto con dos decimales', v_n, v_n2; END IF;
  -- Ningún modificador de primer nivel de un producto simple, ni de segundo nivel de un combo, lleva grupo_id.
  IF jsonb_path_exists(v_qs, '$.*.items[*].modificadores[*].modificadores[*] ? (@.grupo_id != null)') THEN
    RAISE EXCEPTION '12: un modificador de segundo nivel trae grupo_id';
  END IF;

  -- 13) items de un combo: cada elección lleva grupo_id = el slot y opcion_modificador_id = el
  --     PRODUCTO elegido, y sus modificadores van anidados.
  v_i := v_qs -> 'E6' -> 'items' -> 0;
  IF v_i ->> 'producto_id' <> v_combo::text OR jsonb_array_length(v_i -> 'modificadores') <> 2 THEN RAISE EXCEPTION '13: combo normalizado: %', v_i; END IF;
  v_m := v_i -> 'modificadores' -> 0;
  IF v_m ->> 'grupo_id' IS DISTINCT FROM v_s_beb::text OR v_m ->> 'opcion_modificador_id' IS DISTINCT FROM v_agua::text
     OR v_m ->> 'nombre_app' <> 'Agua cotizar' OR (v_m -> 'cantidad')::text <> '1' OR v_m ->> 'precio_extra_mxn' <> '0.00'
     OR v_m -> 'modificadores' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION '13: elección sin modificadores: %', v_m;
  END IF;
  v_m := v_i -> 'modificadores' -> 1;
  IF v_m ->> 'grupo_id' IS DISTINCT FROM v_s_aco::text OR v_m ->> 'opcion_modificador_id' IS DISTINCT FROM v_a::text
     OR v_m ->> 'precio_extra_mxn' <> '100.00' OR v_m -> 'modificadores' IS DISTINCT FROM jsonb_build_array(
          jsonb_build_object('opcion_modificador_id', v_o_bc, 'grupo_id', NULL, 'nombre_app', 'Bien cocida', 'cantidad', 1, 'precio_extra_mxn', '0.00'),
          jsonb_build_object('opcion_modificador_id', v_o15,  'grupo_id', NULL, 'nombre_app', 'Extra queso', 'cantidad', 1, 'precio_extra_mxn', '15.00')) THEN
    RAISE EXCEPTION '13: elección con modificadores anidados: %', v_m;
  END IF;
  -- La cantidad de una elección es por UNIDAD de combo: en el caso E3 son 2 combos con 2 papas cada uno.
  v_m := jsonb_path_query_first(v_qs -> 'E3' -> 'items' -> 1, '$.modificadores[*] ? (@.opcion_modificador_id == $id)', jsonb_build_object('id', v_papas));
  IF (v_m -> 'cantidad')::text IS DISTINCT FROM '2' THEN RAISE EXCEPTION '13: la cantidad de la elección es por unidad de combo: %', v_m; END IF;

  -- 14) Los nombres y los precios son los del catálogo, no lo que mande el cliente; alergenos = [].
  -- 15) La nota se conserva, recortada a 200 caracteres.
  v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, jsonb_build_array(
    jsonb_build_object('producto_id', upper(v_p120::text), 'cantidad', 1, 'nombre_app', 'GRATIS', 'nombre', 'GRATIS',
      'precio_unitario_mxn', '1.00', 'alergenos', '["cacahuate"]'::jsonb, 'alergia_nota', 'me muero',
      'nota', '  ' || repeat('x', 250) || '  ',
      'modificadores', jsonb_build_array(jsonb_build_object('opcion_id', v_o15, 'cantidad', 1, 'nombre_app', 'GRATIS', 'precio_extra_mxn', '0.00', 'grupo_id', v_g2))),
    jsonb_build_object('producto_id', v_combo, 'cantidad', 1, 'nota', 'sin hielo',
      'componentes', jsonb_build_array(jsonb_build_object('grupo_id', v_s_beb, 'producto_id', v_ref, 'cantidad', 1, 'nombre_app', 'GRATIS', 'precio_extra_mxn', '-100.00'))),
    jsonb_build_object('producto_id', v_papas, 'cantidad', 1, 'nota', '   '),
    jsonb_build_object('producto_id', v_papas, 'cantidad', 1, 'nota', 7)));
  v_i := v_q -> 'items' -> 0;
  IF v_i ->> 'producto_id' <> v_p120::text OR v_i ->> 'nombre_app' <> 'Sencilla cotizar' OR v_i ->> 'precio_unitario_mxn' <> '120.00'
     OR v_i -> 'alergenos' IS DISTINCT FROM '[]'::jsonb OR jsonb_typeof(v_i -> 'alergia_nota') IS DISTINCT FROM 'null'
     OR v_i -> 'modificadores' -> 0 ->> 'nombre_app' <> 'Extra queso' OR v_i -> 'modificadores' -> 0 ->> 'precio_extra_mxn' <> '15.00'
     OR jsonb_typeof(v_i -> 'modificadores' -> 0 -> 'grupo_id') <> 'null' OR v_i ? 'nombre' THEN
    RAISE EXCEPTION '14: el renglón debe salir del catálogo, no del cliente: %', v_i;
  END IF;
  IF v_i ->> 'nota' IS DISTINCT FROM repeat('x', 200) THEN RAISE EXCEPTION '15: la nota debía quedar en 200 caracteres: %', v_i ->> 'nota'; END IF;
  v_i := v_q -> 'items' -> 1;
  IF v_i ->> 'nombre_app' <> 'Combo cotizar' OR v_i -> 'alergenos' IS DISTINCT FROM '[]'::jsonb OR v_i ->> 'nota' IS DISTINCT FROM 'sin hielo'
     OR v_i -> 'modificadores' -> 0 ->> 'nombre_app' <> 'Refresco cotizar' OR v_i -> 'modificadores' -> 0 ->> 'precio_extra_mxn' <> '10.00' THEN
    RAISE EXCEPTION '14: el combo debe salir del catálogo, no del cliente: %', v_i;
  END IF;
  IF jsonb_typeof(v_q -> 'items' -> 2 -> 'nota') IS DISTINCT FROM 'null' OR jsonb_typeof(v_q -> 'items' -> 3 -> 'nota') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION '15: una nota vacía o que no es texto va en null: %', v_q -> 'items';
  END IF;
  IF v_q ->> 'total_mxn' IS DISTINCT FROM '355.00' THEN RAISE EXCEPTION '14: total % (esperaba 135 + 160 + 30 + 30 = 355.00)', v_q ->> 'total_mxn'; END IF;

  -- F3) La nota es texto del público: los caracteres de control (un salto de línea, un ESC de
  -- terminal, un tabulador) se vuelven espacio ANTES de recortar a 200. Solo controles = sin nota.
  v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, jsonb_build_array(
    jsonb_build_object('producto_id', v_papas, 'cantidad', 1,
      'nota', chr(27) || '[31msin' || chr(10) || 'sal' || chr(9) || chr(13) || repeat('x', 250)),
    jsonb_build_object('producto_id', v_papas, 'cantidad', 1, 'nota', chr(10) || chr(27) || ' ' || chr(7))));
  v_nota := v_q -> 'items' -> 0 ->> 'nota';
  IF (position(chr(10) in v_nota) = 0 AND position(chr(27) in v_nota) = 0 AND v_nota !~ '[[:cntrl:]]') IS NOT TRUE THEN
    RAISE EXCEPTION 'F3: la nota del renglón conserva caracteres de control: %', to_jsonb(v_nota);
  END IF;
  IF v_nota IS DISTINCT FROM left('[31msin sal  ' || repeat('x', 250), 200) THEN
    RAISE EXCEPTION 'F3: la nota debía quedar con espacios donde había controles y en 200 caracteres: %', to_jsonb(v_nota);
  END IF;
  IF jsonb_typeof(v_q -> 'items' -> 1 -> 'nota') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'F3: una nota de solo caracteres de control va en null: %', v_q -> 'items' -> 1 -> 'nota';
  END IF;

  -- F7) Del lado seguro: una opción a la que le falta la clave `agotada` NO se puede vender. (El menú
  -- siempre la pone; esto es por si un día deja de hacerlo.) Con `agotada: false` la misma entrada vale.
  v_gr := jsonb_build_array(jsonb_build_object('id', v_g2, 'minimo', 0, 'maximo', NULL, 'opciones',
            jsonb_build_array(jsonb_build_object('id', v_o15, 'nombre', 'Extra queso', 'precio_extra_mxn', '15.00'))));
  v_m := format('[{"opcion_id":"%s","cantidad":1}]', v_o15)::jsonb;
  IF _tienda_modificadores(jsonb_set(v_gr, '{0,opciones,0,agotada}', 'false'), v_m, 1)
     IS DISTINCT FROM jsonb_build_object('normalizados', jsonb_build_array(jsonb_build_object(
       'opcion_modificador_id', v_o15, 'grupo_id', NULL, 'nombre_app', 'Extra queso', 'cantidad', 1, 'precio_extra_mxn', '15.00')), 'monto', 15.00) THEN
    RAISE EXCEPTION 'F7 (control): con agotada = false la opción debía valer: %', _tienda_modificadores(jsonb_set(v_gr, '{0,opciones,0,agotada}', 'false'), v_m, 1);
  END IF;
  IF _tienda_modificadores(jsonb_set(v_gr, '{0,opciones,0,agotada}', 'true'), v_m, 1) IS NOT NULL THEN RAISE EXCEPTION 'F7 (control): una opción agotada no vale'; END IF;
  IF _tienda_modificadores(v_gr, v_m, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'F7: una opción sin la clave `agotada` se dio por vendible: %', _tienda_modificadores(v_gr, v_m, 1);
  END IF;
  IF _tienda_modificadores(jsonb_set(v_gr, '{0,opciones,0,agotada}', 'null'), v_m, 1) IS NOT NULL THEN RAISE EXCEPTION 'F7: una opción con `agotada` en null se dio por vendible'; END IF;

  -- Los topes sí entran: 40 renglones y cantidad 50; un extra en cantidad 10.
  SELECT jsonb_agg(jsonb_build_object('producto_id', v_p120, 'cantidad', 1)) INTO v_cuarenta FROM generate_series(1, 40);
  v_41 := v_cuarenta || jsonb_build_object('producto_id', v_p120, 'cantidad', 1);
  IF tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_cuarenta) ->> 'total_mxn' IS DISTINCT FROM '4800.00' THEN RAISE EXCEPTION '16: 40 renglones sí entran'; END IF;
  IF tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":50,"modificadores":[{"opcion_id":"%s","cantidad":10}]}]', v_p120, v_o15)::jsonb)
       ->> 'total_mxn' IS DISTINCT FROM '13500.00' THEN RAISE EXCEPTION '16: cantidad 50 con un extra en cantidad 10 sí entra (50 × 120 + 15 × 10 × 50)'; END IF;

  -- ── Rechazos (casos 16–21) ────────────────────────────────────────────────
  -- `detalle`: el id que debe venir, él solo, después del código.
  v_n := 0;
  FOR r IN SELECT * FROM (VALUES
    -- 16) El carrito.
    ('16 []',            'CARRITO_INVALIDO', 'RECOGER', NULL::uuid, '[]'::jsonb, NULL::uuid),
    ('16 {}',            'CARRITO_INVALIDO', 'RECOGER', NULL, '{}'::jsonb, NULL),
    ('16 NULL',          'CARRITO_INVALIDO', 'RECOGER', NULL, NULL, NULL),
    ('16 null JSON',     'CARRITO_INVALIDO', 'RECOGER', NULL, 'null'::jsonb, NULL),
    ('16 41 renglones',  'CARRITO_INVALIDO', 'RECOGER', NULL, v_41, NULL),
    ('16 cantidad 0',    'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":0}]', v_p120)::jsonb, NULL),
    ('16 cantidad 51',   'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":51}]', v_p120)::jsonb, NULL),
    ('16 cantidad 1.5',  'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1.5}]', v_p120)::jsonb, NULL),
    ('16 cantidad "2"',  'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":"2"}]', v_p120)::jsonb, NULL),
    ('16 cantidad 2.0',  'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":2.0}]', v_p120)::jsonb, NULL),
    ('16 cantidad -1',   'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":-1}]', v_p120)::jsonb, NULL),
    ('16 sin cantidad',  'CARRITO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s"}]', v_p120)::jsonb, NULL),
    ('16 sin producto',  'CARRITO_INVALIDO', 'RECOGER', NULL, '[{"cantidad":1}]'::jsonb, NULL),
    ('16 id no es uuid', 'CARRITO_INVALIDO', 'RECOGER', NULL, '[{"producto_id":"hamburguesa","cantidad":1}]'::jsonb, NULL),
    ('16 id numérico',   'CARRITO_INVALIDO', 'RECOGER', NULL, '[{"producto_id":7,"cantidad":1}]'::jsonb, NULL),
    ('16 no es objeto',  'CARRITO_INVALIDO', 'RECOGER', NULL, '[1]'::jsonb, NULL),
    ('16 un renglón malo entre buenos', 'CARRITO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1},"x"]', v_p120)::jsonb, NULL),
    ('16 simple con componentes', 'CARRITO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_p120, v_s_beb, v_ref)::jsonb, NULL),
    -- 17) El producto.
    ('17 otro negocio',  'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_ajeno)::jsonb, v_ajeno),
    ('17 borrado',       'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_del)::jsonb, v_del),
    ('17 pausado',       'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_pau)::jsonb, v_pau),
    ('17 agotado',       'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_ag)::jsonb, v_ag),
    ('17 no visible',    'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_nv)::jsonb, v_nv),
    ('17 no se vende aquí', 'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_nsv)::jsonb, v_nsv),
    ('17 no existe',     'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_cat)::jsonb, v_cat),
    ('17 categoría inactiva', 'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_in)::jsonb, v_in),
    ('17 el malo es el segundo', 'PRODUCTO_NO_DISPONIBLE', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":1}]', v_p120, v_pau)::jsonb, v_pau),
    -- 18) Los modificadores de un producto simple.
    ('18 sin el obligatorio', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_a)::jsonb, v_a),
    ('18 dos en un grupo único', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":1}]}]', v_a, v_o_tc, v_o_bc)::jsonb, v_a),
    ('18 una en cantidad 2 en un grupo único', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":2}]}]', v_a, v_o_tc)::jsonb, v_a),
    ('18 grupo no ligado', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o_g3)::jsonb, v_p120),
    ('18 opción agotada', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o_agot)::jsonb, v_p120),
    ('18 opción de otro negocio', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o_ajena)::jsonb, v_p120),
    ('18 opción repetida', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o15, upper(v_o15::text))::jsonb, v_p120),
    ('18 precio negativo', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_oneg)::jsonb, v_p120),
    ('18 opción inactiva', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o_inact)::jsonb, v_p120),
    ('18 grupo inactivo', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o_gin)::jsonb, v_p120),
    ('18 opción que no existe', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_cat)::jsonb, v_p120),
    ('18 cantidad de opción 0', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":0}]}]', v_p120, v_o15)::jsonb, v_p120),
    ('18 cantidad de opción 11', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":11}]}]', v_p120, v_o15)::jsonb, v_p120),
    ('18 cantidad de opción 1.0', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1.0}]}]', v_p120, v_o15)::jsonb, v_p120),
    ('18 opción sin cantidad', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s"}]}]', v_p120, v_o15)::jsonb, v_p120),
    ('18 modificadores no es arreglo', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":{"opcion_id":"%s","cantidad":1}}]', v_p120, v_o15)::jsonb, v_p120),
    ('18 modificador no es objeto', 'MODIFICADORES_INVALIDOS', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":["%s"]}]', v_p120, v_o15)::jsonb, v_p120),
    -- 19) Los combos.
    ('19 sin el slot obligatorio', 'COMBO_INVALIDO', 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_combo)::jsonb, v_combo),
    ('19 solo el slot opcional', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_aco, v_papas)::jsonb, v_combo),
    ('19 slot de otro combo', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_s_beb, v_ref, v_s_f, v_p120)::jsonb, v_combo),
    ('19 no es opción del slot', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_beb, v_papas)::jsonb, v_combo),
    ('19 opción activa = false', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_beb, v_te)::jsonb, v_combo),
    ('19 mismo producto dos veces', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_s_beb, v_ref, v_s_aco, v_papas, v_s_aco, v_papas)::jsonb, v_combo),
    ('19 modificadores propios', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}],"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_o15, v_s_beb, v_ref)::jsonb, v_combo),
    ('19 slot inactivo', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_s_beb, v_agua, v_s_in, v_ref)::jsonb, v_combo),
    ('19 opción agotada', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_beb, v_jugo)::jsonb, v_combo),
    ('19 más que el máximo del slot', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":3}]}]',
              v_combo, v_s_beb, v_ref, v_s_aco, v_papas)::jsonb, v_combo),
    ('19 dos en un slot de máximo 1', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_s_beb, v_ref, v_s_beb, v_agua)::jsonb, v_combo),
    ('19 cantidad de componente 0', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":0}]}]', v_combo, v_s_beb, v_ref)::jsonb, v_combo),
    ('19 cantidad de componente 1.5', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1.5}]}]', v_combo, v_s_beb, v_ref)::jsonb, v_combo),
    ('19 componente sin slot', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"producto_id":"%s","cantidad":1}]}]', v_combo, v_ref)::jsonb, v_combo),
    ('19 componentes no es arreglo', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":{"grupo_id":"%s","producto_id":"%s","cantidad":1}}]', v_combo, v_s_beb, v_ref)::jsonb, v_combo),
    ('19 el hijo sin su grupo obligatorio', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
              v_combo, v_s_beb, v_agua, v_s_aco, v_a)::jsonb, v_combo),
    ('19 el hijo con una opción negativa', 'COMBO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
              v_combo_f, v_s_f, v_p120, v_oneg)::jsonb, v_combo_f),
    -- 20) La zona.
    ('20 domicilio sin zona', 'ZONA_INVALIDA', 'DOMICILIO', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('20 zona de otra sucursal', 'ZONA_INVALIDA', 'DOMICILIO', v_z_suc2, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('20 zona inactiva', 'ZONA_INVALIDA', 'DOMICILIO', v_z_inact, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('20 zona borrada', 'ZONA_INVALIDA', 'DOMICILIO', v_z_del, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('20 zona de otro negocio', 'ZONA_INVALIDA', 'DOMICILIO', v_z_ajena, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('20 recoger con zona', 'ZONA_INVALIDA', 'RECOGER', v_z35, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    -- 21) El modo.
    ('21 MESA', 'MODO_INVALIDO', 'MESA', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('21 minúsculas', 'MODO_INVALIDO', 'recoger', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    ('21 NULL', 'MODO_INVALIDO', NULL, NULL, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb, NULL),
    -- Un precio unitario negativo: la elección de −200 sobre un combo de 150.
    ('precio negativo', 'PRECIO_INVALIDO', 'RECOGER', NULL,
       format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_beb, v_regalo)::jsonb, NULL)
  ) AS x(caso, codigo, modo, zona, items, detalle)
  LOOP
    v_n := v_n + 1;
    v_err := NULL;
    BEGIN
      PERFORM tienda_cotizar(v_t, v_suc, r.modo, r.zona, r.items);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE r.codigo || ':%' THEN
      RAISE EXCEPTION '%: esperaba %, dio %', r.caso, r.codigo, COALESCE(v_err, 'una cotización');
    END IF;
    IF r.detalle IS NOT NULL AND v_err <> r.codigo || ': ' || r.detalle THEN
      RAISE EXCEPTION '%: el detalle debía ser solo el producto_id %: %', r.caso, r.detalle, v_err;
    END IF;
  END LOOP;
  IF v_n <> 71 THEN RAISE EXCEPTION 'rechazos: se probaron % de 71', v_n; END IF;

  -- 22) La sucursal no es del negocio (en los dos sentidos).
  FOR r IN SELECT * FROM (VALUES (v_t, v_suc_o), (v_otro, v_suc), (v_t, NULL::uuid)) AS x(tenant, sucursal) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_cotizar(r.tenant, r.sucursal, 'RECOGER', NULL, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE 'SUCURSAL_DE_OTRO_NEGOCIO:%' THEN
      RAISE EXCEPTION '22: esperaba SUCURSAL_DE_OTRO_NEGOCIO, dio %', COALESCE(v_err, 'una cotización');
    END IF;
  END LOOP;

  -- Cotizar NO mira si la tienda está abierta: este negocio ni siquiera tiene tienda_config.
  IF EXISTS (SELECT 1 FROM tienda_config WHERE tenant_id = v_t) THEN RAISE EXCEPTION 'fixture: no esperaba tienda_config en la semilla'; END IF;

  -- Lo que el menú marca agotado tampoco se cotiza: con las dos opciones del grupo obligatorio
  -- agotadas, «Con término» sale agotado en el menú (regla 6) y aquí es PRODUCTO_NO_DISPONIBLE, sola
  -- o como elección de un combo (COMBO_INVALIDO).
  UPDATE opciones_modificador SET agotada = true WHERE grupo_id = v_g1;
  FOR r IN SELECT * FROM (VALUES
    ('PRODUCTO_NO_DISPONIBLE', format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_a, v_o_tc)::jsonb),
    ('COMBO_INVALIDO', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                              v_combo, v_s_beb, v_agua, v_s_aco, v_a, v_o_tc)::jsonb)) AS x(codigo, items)
  LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, r.items);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE r.codigo || ':%' THEN
      RAISE EXCEPTION 'regla 6: esperaba %, dio %', r.codigo, COALESCE(v_err, 'una cotización');
    END IF;
  END LOOP;

  -- Permisos: la cotización es solo para service_role; ni ella ni sus internas son para la API pública.
  IF NOT has_function_privilege('service_role', 'tienda_cotizar(uuid, uuid, text, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permisos: service_role debe poder ejecutar tienda_cotizar';
  END IF;
  FOR r IN SELECT rol, f FROM unnest(ARRAY['anon', 'authenticated']) rol,
                             unnest(ARRAY['tienda_cotizar(uuid, uuid, text, uuid, jsonb)', '_tienda_modificadores(jsonb, jsonb, integer)',
                                          '_tienda_con_iva(numeric, uuid, uuid)', '_tienda_entero(jsonb, integer, integer)']) f
  LOOP
    IF has_function_privilege(r.rol, r.f, 'EXECUTE') THEN RAISE EXCEPTION 'permisos: % puede ejecutar %', r.rol, r.f; END IF;
  END LOOP;

  RAISE NOTICE 'smoke_tienda_cotizar OK';
END $$;
ROLLBACK;
