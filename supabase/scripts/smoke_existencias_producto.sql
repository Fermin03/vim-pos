-- Smoke del giro RETAIL y las existencias por producto (spec 2026-10-15-giro-retail-design.md,
-- migraciones 0188 y 0189). Sobre la semilla de dev. ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_existencias_producto.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Valores nuevos.
DO $$
BEGIN
  IF NOT 'RETAIL' = ANY(enum_range(NULL::vertical_tipo)::text[]) THEN
    RAISE EXCEPTION '1a: falta RETAIL en vertical_tipo';
  END IF;
  IF NOT 'CAMBIO_TALLA' = ANY(enum_range(NULL::devolucion_motivo)::text[]) THEN
    RAISE EXCEPTION '1b: falta CAMBIO_TALLA en devolucion_motivo';
  END IF;
  RAISE NOTICE '1 valores nuevos OK';
END $$;

-- 2) Giro RETAIL y módulo existencias.
DO $$
DECLARE
  v_t  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_op jsonb;
  v_m  jsonb;
BEGIN
  IF juego_inicial_de_giro('RETAIL') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'::jsonb
  THEN RAISE EXCEPTION '2a: RETAIL: %', juego_inicial_de_giro('RETAIL'); END IF;

  -- Ningún giro de comida arranca con existencias, y sin giro (o ENTERPRISE) tampoco.
  IF (juego_inicial_de_giro('QUICK_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro('FULL_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro(NULL)->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2b: existencias solo debe arrancar encendido en RETAIL';
  END IF;

  -- El cliente existente queda con la llave apagada y modulos_efectivos la reporta.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_t;
  IF (v_op->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2c: el cliente existente debía tener existencias=false: %', v_op;
  END IF;
  v_m := modulos_efectivos(v_t);
  IF (v_m->'permitidos'->>'existencias')::boolean IS DISTINCT FROM true
     OR (v_m->'efectivos'->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2d: modulos_efectivos.existencias: %', v_m;
  END IF;
  -- Lo de antes sigue ahí.
  IF NOT (v_m->'efectivos' ?& ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','kds','mostrador','cuentas_barra']) THEN
    RAISE EXCEPTION '2e: modulos_efectivos perdió llaves: %', v_m;
  END IF;

  -- VIM lo enciende (como cualquier módulo de operación) y se refleja.
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  IF (modulos_efectivos(v_t)->'efectivos'->>'existencias')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '2f: encender existencias no se reflejó';
  END IF;

  -- Nadie pasa a RETAIL todavía.
  BEGIN
    PERFORM cambiar_giro(v_t, 'RETAIL', true);
    RAISE EXCEPTION '2g: cambiar_giro debía rechazar RETAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '2 giro RETAIL y módulo existencias OK';
END $$;

-- 3) Variantes: forma válida, coherencia con el padre, códigos únicos y el padre no se vende.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'a7a70000-0000-0000-0000-0000000000c1';
  v_padre uuid := 'a7a70000-0000-0000-0000-0000000000a0';
  v_m     uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g     uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_otro  uuid := 'a7a70000-0000-0000-0000-0000000000ee';
  v_ajeno uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_turno uuid; v_ticket uuid;
BEGIN
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Playeras');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes)
  VALUES (v_padre, v_t, 'Playera Polo', v_cat, 349, ARRAY['Talla','Color']);
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, codigo_barras,
                         producto_padre_id, variante_valores, controla_existencias, costo_mxn)
  VALUES (v_m, v_t, 'Playera Polo M Negra', v_cat, 349, 'POL-M-NEG', '2000000000015',
          v_padre, '{"Talla":"M","Color":"Negra"}', true, 150),
         (v_g, v_t, 'Playera Polo G Negra', v_cat, 349, 'POL-G-NEG', '2000000000022',
          v_padre, '{"Talla":"G","Color":"Negra"}', true, 150);

  -- Otro negocio con un producto, para las pruebas de aislamiento.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-retail-0189', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('a7a70000-0000-0000-0000-0000000000c2', v_otro, 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES (v_ajeno, v_otro, 'Prenda ajena', 'a7a70000-0000-0000-0000-0000000000c2', 100, true);

  -- 3a) La hija repite la combinación de otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Duplicada', v_cat, 349, v_padre, '{"Color":"Negra","Talla":"M"}');
    RAISE EXCEPTION '3a: debía rechazar la combinación repetida';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3b) Ejes que no son los del padre.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Sin color', v_cat, 349, v_padre, '{"Talla":"CH"}');
    RAISE EXCEPTION '3b: debía rechazar ejes distintos a los del padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3c) Nieta: el padre de una hija no puede ser otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Nieta', v_cat, 349, v_m, '{"Talla":"M","Color":"Negra"}');
    RAISE EXCEPTION '3c: debía rechazar una nieta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3d) Padre de otro negocio.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_otro, 'Cruzada', 'a7a70000-0000-0000-0000-0000000000c2', 349, v_padre, '{"Talla":"M","Color":"Roja"}');
    RAISE EXCEPTION '3d: debía rechazar un padre de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3e) No se cambian los ejes de un padre con hijas.
  BEGIN
    UPDATE productos SET variante_ejes = ARRAY['Talla'] WHERE id = v_padre;
    RAISE EXCEPTION '3e: debía rechazar cambiar ejes con hijas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3f) El padre no controla existencias.
  BEGIN
    UPDATE productos SET controla_existencias = true WHERE id = v_padre;
    RAISE EXCEPTION '3f: el padre no debía poder controlar existencias';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3g) Código de barras único por negocio; SKU único entre los que controlan existencias.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_barras, controla_existencias)
    VALUES (v_t, 'Mismo código', v_cat, 10, '2000000000015', true);
    RAISE EXCEPTION '3g: debía rechazar código de barras repetido';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, controla_existencias)
    VALUES (v_t, 'Mismo SKU', v_cat, 10, 'POL-M-NEG', true);
    RAISE EXCEPTION '3g: debía rechazar SKU repetido con existencias';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Un restaurante puede seguir repitiendo codigo_interno (sin existencias).
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno)
  VALUES (v_t, 'SKU repetido de restaurante 1', v_cat, 10, 'REP-1'),
         (v_t, 'SKU repetido de restaurante 2', v_cat, 10, 'REP-1');
  -- Y el código de barras tampoco es único sin existencias.
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_barras)
  VALUES (v_t, 'Código repetido 1', v_cat, 10, '7500000000001'),
         (v_t, 'Código repetido 2', v_cat, 10, '7500000000001');

  -- 3h) El padre no se vende: se vende la hija.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-RET3', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret3', v_maria);
  BEGIN
    PERFORM agregar_item_a_ticket(v_ticket, v_padre, 1, NULL, '[]'::jsonb, 'smoke-ret3-padre');
    RAISE EXCEPTION '3h: debía rechazar vender el padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PRODUCTO_CON_VARIANTES%' THEN RAISE; END IF;
  END;
  PERFORM agregar_item_a_ticket(v_ticket, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret3-hija');
  RAISE NOTICE '3 variantes OK';
END $$;

-- 4) Existencias = suma de movimientos; signos; solo lectura y aislamiento para el cajero.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_otro   uuid := 'a7a70000-0000-0000-0000-0000000000ee';
  v_ajeno  uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_hamb   uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_suc_o  uuid;
  v_n      integer;
  v_cant   numeric;
BEGIN
  -- Como postgres (lo que harán las funciones): entra 10, merma 1.
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo)
  VALUES (v_t, v_suc, v_m, 'ENTRADA', 10, 'smoke'), (v_t, v_suc, v_m, 'MERMA', -1, 'smoke');
  SELECT cantidad INTO v_cant FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  IF v_cant IS DISTINCT FROM 9 THEN RAISE EXCEPTION '4a: existencia debía ser 9, es %', v_cant; END IF;
  IF v_cant <> (SELECT sum(cantidad) FROM movimientos_producto WHERE sucursal_id = v_suc AND producto_id = v_m) THEN
    RAISE EXCEPTION '4a: existencia distinta de la suma de movimientos';
  END IF;

  -- 4b) Signo equivocado para el tipo.
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_m, 'VENTA', 1);
    RAISE EXCEPTION '4b: una VENTA positiva debía rechazarse';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4c) Producto sin control de existencias (la hamburguesa), padre o de otro negocio.
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_hamb, 'ENTRADA', 1);
    RAISE EXCEPTION '4c: un producto sin existencias no lleva movimientos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_ajeno, 'ENTRADA', 1);
    RAISE EXCEPTION '4c: producto de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF;
  END;

  -- Fila del otro negocio, para ver que el cajero no la ve.
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'R189', 'Sucursal ajena') RETURNING id INTO v_suc_o;
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  VALUES (v_otro, v_suc_o, v_ajeno, 'ENTRADA', 5);

  -- Como la cajera, con su JWT y RLS.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  SELECT count(*) INTO v_n FROM producto_existencias;
  IF v_n <> 1 THEN RAISE EXCEPTION '4d: la cajera debía ver 1 existencia (la suya), vio %', v_n; END IF;
  SELECT count(*) INTO v_n FROM movimientos_producto WHERE tenant_id = v_otro;
  IF v_n <> 0 THEN RAISE EXCEPTION '4d: ve movimientos de otro negocio'; END IF;

  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_m, 'ENTRADA', 100);
    RAISE EXCEPTION '4e: la cajera no debía poder insertar movimientos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE producto_existencias SET cantidad = 999;
    RAISE EXCEPTION '4e: la cajera no debía poder escribir existencias';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM movimientos_producto;
    RAISE EXCEPTION '4e: la cajera no debía poder borrar movimientos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '4 existencias y movimientos OK';
END $$;


-- 5) Venta, reabrir, cancelación con y sin dinero, devolución y cambio de talla: cada pieza se
--    mueve una sola vez, y el restaurante no se entera.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g      uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_hamb   uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_turno  uuid; v_tk uuid; v_it uuid; v_it_h uuid; v_auth uuid; v_dev uuid; v_tk2 uuid;
  v_ini_m  numeric; v_ini_g numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-RET5', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT cantidad INTO v_ini_m FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;  -- 9 (bloque 4)
  v_ini_g := COALESCE((SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g), 0);

  -- 5a) Venta de 2 M + 1 hamburguesa: M baja 2; la hamburguesa no genera movimientos_producto.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-a', v_maria);
  v_it   := agregar_item_a_ticket(v_tk, v_m, 2, NULL, '[]'::jsonb, 'smoke-ret5-a-m');
  v_it_h := agregar_item_a_ticket(v_tk, v_hamb, 1, NULL, '[]'::jsonb, 'smoke-ret5-a-h');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 818, 818, NULL, NULL, NULL, false, NULL, 'smoke-ret5-a-pago');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'PAGADO' THEN RAISE EXCEPTION '5a: no quedó PAGADO'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m - 2 THEN
    RAISE EXCEPTION '5a: M debía bajar 2'; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_item_id = v_it_h) THEN
    RAISE EXCEPTION '5a: la hamburguesa no debía generar movimientos_producto'; END IF;

  -- 5b) Llamar otra vez a la sincronización no mueve nada.
  PERFORM _existencias_sincronizar_ticket(v_tk, false);
  IF (SELECT count(*) FROM movimientos_producto WHERE ticket_id = v_tk) <> 1 THEN
    RAISE EXCEPTION '5b: sincronizar dos veces duplicó movimientos'; END IF;

  -- 5c) Devolución parcial por cambio de talla (1 M) + venta de 1 G: M neto −1, G −1.
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'Cambio de talla')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'CAMBIO_TALLA'::devolucion_motivo,
    p_motivo_texto := 'Le quedó chica', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad_devuelta', 1)),
    p_reversar_inventario := true, p_nota := 'smoke');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  v_tk2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-c', v_maria);
  PERFORM agregar_item_a_ticket(v_tk2, v_g, 1, NULL, '[]'::jsonb, 'smoke-ret5-c-g');
  PERFORM aplicar_pago(v_tk2, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-c-pago');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m - 1 THEN
    RAISE EXCEPTION '5c: tras el cambio de talla M debía quedar en %', v_ini_m - 1; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g) <> v_ini_g - 1 THEN
    RAISE EXCEPTION '5c: G debía bajar 1 (y quedar negativa si no había: D32)'; END IF;

  -- 5d) Cancelar un ticket pagado DEVOLVIENDO dinero: cancelar_ticket_pagado crea y confirma una
  --     devolución total y además inserta la cancelación. La pieza regresa UNA vez.
  v_ini_m := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m);
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-d', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-d-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-d-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_medio_devolucion := 'EFECTIVO'::devolucion_medio, p_client_id_local := 'smoke-ret5-d');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'CANCELADO' THEN RAISE EXCEPTION '5d: no quedó CANCELADO'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m THEN
    RAISE EXCEPTION '5d: M debía volver a % (regresar una sola vez), es %', v_ini_m,
      (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m); END IF;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '5d: el neto del ticket cancelado debía ser 0'; END IF;

  -- 5d2) Cancelar un ticket pagado SIN devolver dinero (solo cancelación): también regresa una vez.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-d2', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-d2-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-d2-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := false,
    p_client_id_local := 'smoke-ret5-d2');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m THEN
    RAISE EXCEPTION '5d2: M debía volver a % tras cancelar sin dinero', v_ini_m; END IF;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '5d2: el neto del ticket cancelado debía ser 0'; END IF;

  -- 5e) Reabrir y volver a cobrar: neto = una sola venta.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-e', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-e-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-e-pago');
  -- Reabrir directo (lo que hacen reabrir_cuenta 0058/0134 por dentro: PAGADO → ABIERTO).
  UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_tk;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '5e: reabrir debía regresar la pieza'; END IF;
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_tk;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> -1 THEN
    RAISE EXCEPTION '5e: volver a cobrar debía dejar una sola venta'; END IF;

  -- 5g) Una venta anterior al control de existencias no se toca después (R5): facturar o devolver
  --     solo ajustan líneas ya registradas.
  DECLARE v_tk3 uuid; v_it3 uuid; v_stock numeric;
  BEGIN
    UPDATE productos SET controla_existencias = false WHERE id = v_m;
    v_tk3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-g', v_maria);
    v_it3 := agregar_item_a_ticket(v_tk3, v_m, 2, NULL, '[]'::jsonb, 'smoke-ret5-g-m');
    PERFORM aplicar_pago(v_tk3, 'EFECTIVO'::metodo_pago, 698, 698, NULL, NULL, NULL, false, NULL, 'smoke-ret5-g-pago');
    UPDATE productos SET controla_existencias = true WHERE id = v_m;
    v_stock := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m);
    UPDATE tickets SET estado_fiscal = 'FACTURADO' WHERE id = v_tk3;
    IF EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_id = v_tk3) THEN
      RAISE EXCEPTION '5g(i): facturar una venta sin movimientos no debía registrar nada'; END IF;
    INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
    VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk3, 'Cambio de talla')
    RETURNING id INTO v_auth;
    v_dev := crear_devolucion(
      p_ticket_original_id := v_tk3, p_caja_id := v_caja, p_turno_id := v_turno,
      p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'CAMBIO_TALLA'::devolucion_motivo,
      p_motivo_texto := 'Le quedó chica', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
      p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
      p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_it3, 'cantidad_devuelta', 1)),
      p_reversar_inventario := true, p_nota := 'smoke');
    PERFORM confirmar_devolucion(v_dev, v_maria);
    IF EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_id = v_tk3) THEN
      RAISE EXCEPTION '5g(ii): devolver de una venta sin movimientos no debía registrar nada'; END IF;
    IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_stock THEN
      RAISE EXCEPTION '5g(ii): la existencia de M no debía cambiar'; END IF;
  END;

  -- 5f) La existencia sigue siendo la suma de movimientos.
  IF EXISTS (SELECT 1 FROM producto_existencias e
              WHERE e.tenant_id = v_t
                AND e.cantidad <> (SELECT sum(m.cantidad) FROM movimientos_producto m
                                    WHERE m.sucursal_id = e.sucursal_id AND m.producto_id = e.producto_id)) THEN
    RAISE EXCEPTION '5f: alguna existencia no cuadra con sus movimientos'; END IF;
  RAISE NOTICE '5 venta, reabrir, cancelación, devolución y cambio de talla OK';
END $$;

-- 6) Movimientos a mano: permiso, módulo, entradas malas, costo y conteo.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g      uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_padre  uuid := 'a7a70000-0000-0000-0000-0000000000a0';
  v_ajeno  uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_antes  numeric; v_r jsonb; v_n int;
BEGIN
  -- 6a) La cajera no tiene config.productos.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  BEGIN
    PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 5);
    RAISE EXCEPTION '6a: la cajera no debía poder registrar entradas';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF;
  END;

  -- Como el dueño.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_t::text)::text, true);

  -- 6b) Entrada de 5 a $160: sube 5 y el costo queda en 160.
  SELECT cantidad INTO v_antes FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 5, 160, 'Llegó pedido');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes + 5 THEN
    RAISE EXCEPTION '6b: la entrada no sumó 5'; END IF;
  IF (SELECT costo_mxn FROM productos WHERE id = v_m) <> 160 THEN RAISE EXCEPTION '6b: el costo no quedó en 160'; END IF;

  -- 6c) Merma de 1 (positiva al pedirla, negativa en el libro) y ajuste de −2.
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'MERMA', 1, NULL, 'Mancha');
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'AJUSTE', -2, NULL, 'Error de captura');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes + 2 THEN
    RAISE EXCEPTION '6c: merma y ajuste no cuadran'; END IF;

  -- 6d) Entradas malas: cero, merma negativa, tipo no manual, padre, producto ajeno.
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 0);
        RAISE EXCEPTION '6d: entrada 0'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'MERMA', -1);
        RAISE EXCEPTION '6d: merma negativa'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'VENTA', 1);
        RAISE EXCEPTION '6d: venta a mano'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_padre, 'ENTRADA', 1);
        RAISE EXCEPTION '6d: padre'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_ajeno, 'ENTRADA', 1);
        RAISE EXCEPTION '6d: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  -- 6e) Conteo: M contado 4 y G contado 0 (G venía en −1 por la venta del bloque 5). Los dos quedan
  --     en lo contado; un segundo conteo idéntico no genera nada.
  v_r := registrar_conteo(v_suc, jsonb_build_array(
           jsonb_build_object('producto_id', v_m, 'contado', 4),
           jsonb_build_object('producto_id', v_g, 'contado', 0)));
  IF (v_r->>'ajustados')::int <> 2 THEN RAISE EXCEPTION '6e: debía ajustar 2, ajustó %', v_r; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 4
     OR (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g) <> 0 THEN
    RAISE EXCEPTION '6e: M debía quedar en 4 y G en 0 tras el conteo'; END IF;
  v_r := registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'contado', 4)));
  IF (v_r->>'ajustados')::int <> 0 THEN RAISE EXCEPTION '6e: un conteo igual no debía ajustar nada'; END IF;

  -- 6f) Conteo malo (producto repetido, contado negativo, ajeno): nada cambia.
  SELECT count(*) INTO v_n FROM movimientos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(
          jsonb_build_object('producto_id', v_m, 'contado', 1), jsonb_build_object('producto_id', v_m, 'contado', 2)));
        RAISE EXCEPTION '6f: repetido'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'contado', -1)));
        RAISE EXCEPTION '6f: negativo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(
          jsonb_build_object('producto_id', v_g, 'contado', 0), jsonb_build_object('producto_id', v_ajeno, 'contado', 1)));
        RAISE EXCEPTION '6f: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM movimientos_producto WHERE tenant_id = v_t) <> v_n THEN
    RAISE EXCEPTION '6f: un conteo rechazado dejó movimientos'; END IF;

  -- 6g) Con el módulo apagado, nada a mano.
  PERFORM operacion_cambiar(v_t, '{"existencias":false}');
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 1);
        RAISE EXCEPTION '6g: módulo apagado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MODULO_APAGADO%' THEN RAISE; END IF; END;
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  -- 6h) NaN no entra: ni por las funciones ni por INSERT directo.
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 'NaN'::numeric);
        RAISE EXCEPTION '6h: cantidad NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 1, 'NaN'::numeric);
        RAISE EXCEPTION '6h: costo NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_conteo(v_suc, '[{"producto_id":"a7a70000-0000-0000-0000-0000000000a1","contado":"NaN"}]'::jsonb);
        RAISE EXCEPTION '6h: conteo NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
        VALUES (v_t, v_suc, v_m, 'AJUSTE', 'NaN');
        RAISE EXCEPTION '6h: INSERT directo con NaN'; EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) = 'NaN' THEN
    RAISE EXCEPTION '6h: la existencia quedó en NaN'; END IF;
  RAISE NOTICE '6 movimientos a mano y conteo OK';
END $$;

-- 7) Traspaso: sale al enviar, entra al recibir, una sola vez; entradas malas no dejan nada.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno uuid := '99999999-0000-0000-0000-0000000000e1';
  v_m     uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_norte uuid := gen_random_uuid();
  v_tr    uuid; v_antes numeric; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_t::text)::text, true);
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_t, 'RN', 'Tienda Norte');

  SELECT cantidad INTO v_antes FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 3)));
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes - 3 THEN
    RAISE EXCEPTION '7a: el origen debía bajar 3 al enviar'; END IF;
  IF EXISTS (SELECT 1 FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_m AND cantidad <> 0) THEN
    RAISE EXCEPTION '7a: el destino no debía subir antes de recibir'; END IF;

  PERFORM recibir_traspaso_producto(v_tr);
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_m) <> 3 THEN
    RAISE EXCEPTION '7b: el destino debía quedar en 3'; END IF;
  BEGIN PERFORM recibir_traspaso_producto(v_tr);
        RAISE EXCEPTION '7c: recibir dos veces'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  SELECT count(*) INTO v_n FROM traspasos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 1)));
        RAISE EXCEPTION '7d: misma sucursal'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 0)));
        RAISE EXCEPTION '7d: cantidad 0'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, '[]'::jsonb);
        RAISE EXCEPTION '7d: vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, '[{"producto_id":"a7a70000-0000-0000-0000-0000000000a1","cantidad":"NaN"}]'::jsonb);
        RAISE EXCEPTION '7d: cantidad NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM traspasos_producto WHERE tenant_id = v_t) <> v_n THEN
    RAISE EXCEPTION '7d: un traspaso rechazado quedó guardado'; END IF;
  RAISE NOTICE '7 traspasos OK';
END $$;

ROLLBACK;
