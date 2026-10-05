-- Smoke de la 0144: eliminar un cliente por completo (ADR 0023).
--
-- Llena el negocio del seed con datos como los de un cliente que operó —venta con modificadores,
-- pago dividido, devolución, movimiento de caja, arqueo y reporte Z, mesa, delivery propio con
-- repartidor, pedido de app, compra e inventario, cliente con dirección, add-on, suscripción con
-- pagos (uno anulado) y un CFDI en borrador— y lo elimina. Después recorre el CATÁLOGO (no una
-- lista escrita a mano): no puede quedar una sola fila con ese tenant_id en ninguna tabla.
--
-- También: no se elimina sin cancelar, ni un INTERNO, ni con un CFDI timbrado; el negocio vecino
-- queda intacto; la cuenta compartida sobrevive y las exclusivas no; el código queda libre.
--
-- Corre como postgres en la nube local (psql) y en el Postgres embebido del escritorio
-- (`npm run smokes` en desktop/): prueba de paso que la migración es segura en la caja.
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_disp   uuid := '99999999-0000-0000-0000-0000000000d1';
  v_op     uuid := '00000000-0000-0000-0000-0000000000a1';
  v_vecino uuid := '99999999-0000-0000-0000-0000000000ee';
  v_paco   uuid := '99999999-0000-0000-0000-0000000000a7';
  v_globales jsonb;
  v_codigo text;
  v_prod uuid; v_opc uuid; v_turno uuid; v_auth uuid; v_plan uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_item uuid; v_dev uuid; v_cfdi uuid;
  v_mesa uuid; v_rep uuid; v_cliente uuid; v_conexion uuid; v_kg uuid; v_insumo uuid; v_prov uuid;
  v_suc_b uuid; v_caja_b uuid; v_turno_b uuid; v_tb uuid;
  v_antes jsonb; v_despues jsonb; v_previa jsonb; v_res jsonb; r jsonb; v_arch tenants_eliminados%ROWTYPE;
  v_n bigint; v_msg text; v_tabla record; v_quedan text; v_bitacora bigint;
BEGIN
  SELECT codigo INTO v_codigo FROM tenants WHERE id = v_tenant;
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'falta el negocio del seed'; END IF;

  -- ── Negocio vecino: lo que NO se debe tocar ────────────────────────────────────────────────
  -- María también trabaja ahí (cuenta compartida) y Diego dejó su firma en un cliente del vecino
  -- (cuenta exclusiva de Knock-Out, pero referenciada desde otro negocio).
  INSERT INTO tenants(id, codigo, nombre_comercial, vertical_principal)
  VALUES (v_vecino, 'smoke-vecino-elim', 'Vecino', 'QUICK_SERVICE');
  INSERT INTO sucursales(tenant_id, codigo, nombre) VALUES (v_vecino, 'VE', 'Sucursal vecina') RETURNING id INTO v_suc_b;
  INSERT INTO cajas(tenant_id, sucursal_id, numero, nombre) VALUES (v_vecino, v_suc_b, 1, 'Caja vecina') RETURNING id INTO v_caja_b;
  INSERT INTO usuarios_acceso(usuario_id, tenant_id, rol_id)
  SELECT v_maria, v_vecino, id FROM roles WHERE tenant_id IS NULL AND codigo = 'CAJERO';
  INSERT INTO clientes(tenant_id, nombre, telefono, created_by) VALUES (v_vecino, 'Cliente del vecino', '4770000001', v_diego);
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_vecino, v_suc_b, v_caja_b, 'VECINO-1', '2026-09-30', v_maria, 0, 'TOTAL') RETURNING id INTO v_turno_b;
  v_tb := abrir_ticket(v_suc_b, v_caja_b, v_turno_b, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-elim-vecino', v_maria);

  -- Paco (M1): hoy solo tiene acceso a Knock-Out, pero antes trabajó con el vecino y dejó ahí
  -- filas que cuelgan de su cuenta con ON DELETE CASCADE: un permiso, una suscripción push y el
  -- token de Uber del vecino. Si su cuenta se borrara, esas filas se irían en silencio.
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_paco, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'paco-smoke-elim@prueba.test', '',
          now(), '{"provider":"email","providers":["email"]}', '{}');
  INSERT INTO usuarios_perfil(id, nombre) VALUES (v_paco, 'Paco Smoke');
  INSERT INTO usuarios_acceso(usuario_id, tenant_id, rol_id)
  SELECT v_paco, v_tenant, id FROM roles WHERE tenant_id IS NULL AND codigo = 'ADMIN';
  INSERT INTO permisos_personalizados(tenant_id, usuario_id, permiso_id) SELECT v_vecino, v_paco, id FROM permisos LIMIT 1;
  INSERT INTO push_suscripciones(tenant_id, usuario_id, endpoint, p256dh, auth) VALUES (v_vecino, v_paco, 'https://push.invalid/smoke-elim', 'k', 'a');
  INSERT INTO delivery_autorizaciones(tenant_id, app, entorno, access_token, vence_at, creado_por)
  VALUES (v_vecino, 'APP_UBEREATS', 'sandbox', 'token-del-vecino', now() + interval '1 hour', v_paco);

  -- ── Datos del negocio que se va a eliminar ─────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-ELIM', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_opc FROM opciones_modificador WHERE tenant_id = v_tenant AND nombre = 'Extra queso' LIMIT 1;

  -- Cliente con dirección.
  INSERT INTO clientes(tenant_id, nombre, telefono) VALUES (v_tenant, 'Cliente Smoke Elim', '4771112233') RETURNING id INTO v_cliente;
  INSERT INTO direcciones_cliente(tenant_id, cliente_id, calle, numero_exterior, colonia, ciudad, estado_geo, codigo_postal)
  VALUES (v_tenant, v_cliente, 'Calle Smoke', '1', 'Centro', 'León', 'Guanajuato', '37000');

  -- Venta 1: con modificador, pago dividido. Venta 2: efectivo, se devuelve completa.
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-elim-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, 'sin cebolla',
    jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_opc, 'cantidad', 1)), 'smk-elim-1-i');
  UPDATE tickets SET cliente_id = v_cliente WHERE id = v_t1;
  SELECT total_mxn INTO v_n FROM tickets WHERE id = v_t1;
  PERFORM aplicar_pago(v_t1, 'TARJETA_DEBITO'::metodo_pago, 35, NULL, '1234', NULL, NULL, false, NULL, 'smk-elim-1-p1');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_n - 35, v_n - 35, NULL, NULL, NULL, false, NULL, 'smk-elim-1-p2');

  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-elim-2', v_maria);
  v_item := agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smk-elim-2-i');
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smk-elim-2-p');
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_t2, 'Producto defectuoso')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_t2, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'Hamburguesa fría', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_item, 'cantidad_devuelta', 1)),
    p_reversar_inventario := false, p_nota := 'Reembolso');
  PERFORM confirmar_devolucion(v_dev, v_maria);

  -- CFDI en BORRADOR (sin uuid: nunca llegó al SAT) sobre la venta 1.
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id := v_t1, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL', p_receptor_uso_cfdi := 'S01',
    p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616', p_receptor_email := 'cliente@demo.mx',
    p_emisor_rfc := 'XAXX010101000', p_emisor_razon_social := 'EMISOR DE PRUEBA', p_emisor_regimen_fiscal := '601',
    p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
    p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);

  -- Mesa con cuenta abierta.
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 91, 'Mesa smoke elim', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'smk-elim-3', v_maria);
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 2, NULL, '[]'::jsonb, 'smk-elim-3-i');
  PERFORM asignar_mesa_a_ticket(v_t3, v_mesa, true, 'smk-elim-3-m');

  -- Delivery propio con repartidor.
  INSERT INTO repartidores(tenant_id, nombre, telefono) VALUES (v_tenant, 'Repartidor Smoke Elim', '4774445566') RETURNING id INTO v_rep;
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-elim-4', v_maria);
  PERFORM agregar_item_a_ticket(v_t4, v_prod, 1, NULL, '[]'::jsonb, 'smk-elim-4-i');
  PERFORM asignar_delivery_lote(ARRAY[v_t4], v_rep, 30);

  -- Pedido de app con su conexión.
  INSERT INTO delivery_conexiones(tenant_id, sucursal_id, app, estado, tienda_id_externo, tiempo_prep_min)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-smoke-elim', 12) RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos(tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado, cliente_nombre, items, total_cliente_mxn)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-smoke-elim-1', 'EL001', 'RECIBIDO', 'Cliente Uber', '[]'::jsonb, 120);

  -- Movimiento de caja, arqueo y reporte Z (el Z es el que tiene el trigger de inmutabilidad).
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cerrar_turno', 'turno.cerrar_propio', 'turno', v_turno, NULL, 'Cierre de turno')
  RETURNING id INTO v_auth;
  r := reporte_x(v_turno);
  PERFORM arquear_caja(v_turno,
    jsonb_build_array(jsonb_build_object('metodo_pago', 'EFECTIVO', 'monto_declarado_mxn', (r->>'efectivo_esperado_mxn')::numeric)),
    'CIERRE_TURNO', v_maria, NULL);
  PERFORM reporte_z(v_turno, (r->>'efectivo_esperado_mxn')::numeric, v_auth, v_maria, NULL);

  -- Inventario y compras.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_kg FROM unidades_medida WHERE tenant_id = v_tenant AND codigo = 'KG' LIMIT 1;
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn, stock_minimo_global)
  VALUES (v_tenant, 'Carne smoke elim', v_kg, 'CARNICOS', 180, 5) RETURNING id INTO v_insumo;
  PERFORM aplicar_movimiento_inventario(v_tenant, v_suc, v_insumo, 'ENTRADA_COMPRA'::movimiento_inventario_tipo, 10, 180, v_dueno, 'Compra inicial');
  PERFORM aplicar_movimiento_inventario(v_tenant, v_suc, v_insumo, 'MERMA'::movimiento_inventario_tipo, 2, NULL, v_dueno, 'Merma');
  INSERT INTO proveedores(tenant_id, nombre, rfc) VALUES (v_tenant, 'Proveedor Smoke Elim', 'PSE010101AB1') RETURNING id INTO v_prov;
  PERFORM registrar_compra(jsonb_build_object(
    'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-03', 'referencia_documento', 'E 1',
    'origen', 'MANUAL', 'notas', NULL, 'iva_mxn', 0,
    'lineas', jsonb_build_array(jsonb_build_object(
      'insumo_id', v_insumo, 'descripcion_origen', 'CARNE', 'cantidad_capturada', 1, 'unidad_capturada_id', v_kg,
      'cantidad', 1, 'costo_unitario_mxn', 180, 'importe_mxn', 180.00)),
    'aliases', '[]'::jsonb));

  -- Add-on, suscripción y pagos (uno anulado).
  INSERT INTO tenant_addons(tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, '2026-01-31', true, 100 FROM addons WHERE codigo = 'DELIVERY'
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan FROM planes ORDER BY precio_mensual_mxn NULLS LAST LIMIT 1;
  UPDATE suscripciones SET estado = 'EXPIRADA', fecha_fin = '2026-01-30' WHERE tenant_id = v_tenant AND estado IN ('ACTIVA', 'PAUSADA');
  INSERT INTO suscripciones(tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro)
  VALUES (v_tenant, v_plan, '2026-01-31', 'ACTIVA', 499, 'MENSUAL', '2026-02-28');
  PERFORM registrar_pago_suscripcion(v_tenant, 499, 'TRANSFERENCIA', '2026-02-27', 1, 'SPEI 123', NULL, v_op);
  r := registrar_pago_suscripcion(v_tenant, 499, 'EFECTIVO', '2026-03-30', 1, NULL, 'capturado dos veces', v_op);
  PERFORM anular_pago_suscripcion((r->>'pago_id')::uuid, 'capturado dos veces', v_op);

  -- Bitácora de plataforma del negocio: debe sobrevivir.
  INSERT INTO super_admin_accesos(super_admin_id, tenant_id, accion, motivo, payload)
  VALUES (v_op, v_tenant, 'tenant.cancelado', 'Dejó de pagar hace tres meses', '{"estado":"CANCELADO"}'::jsonb);
  SELECT count(*) INTO v_bitacora FROM super_admin_accesos WHERE tenant_id = v_tenant;

  -- Menús del catálogo (0155): un menú propio asignado a la sucursal y un producto apagado en el
  -- General. Borrar `menus` pone sucursales.menu_id en NULL (FK) y eso dispara la proyección a
  -- productos_sucursal: no puede dejar filas ni frenar el borrado.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  PERFORM crear_menu('Menú smoke eliminar', ARRAY[v_suc]);
  UPDATE productos SET en_menu_general = false
   WHERE id = (SELECT id FROM productos WHERE tenant_id = v_tenant AND deleted_at IS NULL ORDER BY id LIMIT 1);

  PERFORM set_config('request.jwt.claims', '', true);

  -- Que el fixture sea de verdad "realista": estas tablas tienen que traer filas.
  v_antes := _eliminar_tenant_inventario(v_tenant);
  FOR v_tabla IN SELECT unnest(ARRAY[
      'sucursales', 'cajas', 'usuarios_acceso', 'productos', 'categorias', 'tickets', 'ticket_items',
      'ticket_item_modificadores', 'pagos', 'turnos', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico',
      'devoluciones', 'devolucion_items', 'movimientos_caja', 'autorizaciones_pin', 'contadores_folio',
      'clientes', 'direcciones_cliente', 'mesas', 'tickets_mesas', 'repartidores', 'delivery_asignaciones',
      'delivery_conexiones', 'delivery_pedidos', 'insumos', 'insumo_stock_sucursal', 'movimientos_inventario',
      'proveedores', 'compras', 'compra_lineas', 'tenant_addons', 'suscripciones', 'pagos_suscripcion',
      'tickets_cfdi', 'menus', 'menu_productos', 'productos_sucursal']) AS t
  LOOP
    IF NOT v_antes ? v_tabla.t THEN RAISE EXCEPTION 'el fixture no dejó filas en %', v_tabla.t; END IF;
  END LOOP;
  RAISE NOTICE 'fixture: % tablas con datos', (SELECT count(*) FROM jsonb_object_keys(v_antes));

  -- ── 1) Rechazos ────────────────────────────────────────────────────────────────────────────
  -- INTERNO (así viene el seed).
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TENANT_INTERNO%' THEN RAISE EXCEPTION 'INTERNO debió rechazarse, salió: %', SQLERRM; END IF;
  END;
  -- ACTIVO.
  UPDATE tenants SET estado = 'ACTIVO' WHERE id = v_tenant;
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TENANT_NO_CANCELADO%' THEN RAISE EXCEPTION 'ACTIVO debió rechazarse, salió: %', SQLERRM; END IF;
  END;
  UPDATE tenants SET estado = 'CANCELADO', fecha_baja = now(), motivo_baja = 'Dejó de pagar hace tres meses' WHERE id = v_tenant;

  -- Recién dado de baja y con facturas (aunque sean borradores): puede haber un timbrado en vuelo.
  v_previa := eliminar_tenant_vista_previa(v_tenant);
  IF (v_previa->>'puede_eliminar')::boolean OR v_previa->'bloqueos'->0->>'codigo' <> 'ESPERA_TIMBRADOS'
     OR (v_previa->'bloqueos'->0->>'espera_min')::int NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'la vista previa no pidió esperar tras la baja: %', v_previa->'bloqueos';
  END IF;
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ESPERA_TIMBRADOS%' THEN RAISE EXCEPTION 'recién dado de baja debió pedir espera, salió: %', SQLERRM; END IF;
  END;
  -- Pasados los 15 minutos de la baja, sigue estorbando el borrador recién tocado.
  UPDATE tenants SET fecha_baja = now() - interval '20 minutes' WHERE id = v_tenant;
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ESPERA_TIMBRADOS%' THEN RAISE EXCEPTION 'un borrador reciente debió pedir espera, salió: %', SQLERRM; END IF;
  END;
  -- El borrador envejece (el trigger de updated_at lo volvería a sellar con la hora de ahora).
  ALTER TABLE tickets_cfdi DISABLE TRIGGER trg_tickets_cfdi_updated_at;
  UPDATE tickets_cfdi SET created_at = now() - interval '20 minutes', updated_at = now() - interval '20 minutes' WHERE tenant_id = v_tenant;
  ALTER TABLE tickets_cfdi ENABLE TRIGGER trg_tickets_cfdi_updated_at;
  -- Sin la palabra, o con motivo corto.
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'eliminar');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CONFIRMACION_INVALIDA%' THEN RAISE EXCEPTION 'sin ELIMINAR debió rechazarse, salió: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'corto', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MOTIVO_REQUERIDO%' THEN RAISE EXCEPTION 'motivo corto debió rechazarse, salió: %', SQLERRM; END IF;
  END;
  -- Con un CFDI timbrado (se deshace después: el bloque entero se revierte con la excepción).
  BEGIN
    UPDATE tickets_cfdi SET uuid_fiscal = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', fecha_timbrado = now(), estado_sat = 'CANCELADO' WHERE id = v_cfdi;
    v_previa := eliminar_tenant_vista_previa(v_tenant);
    IF (v_previa->>'puede_eliminar')::boolean OR v_previa->'bloqueos'->0->>'codigo' <> 'TIENE_TIMBRADOS' THEN
      RAISE EXCEPTION 'la vista previa no avisó del timbrado: %', v_previa->'bloqueos';
    END IF;
    BEGIN
      PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
      RAISE EXCEPTION 'NO_RECHAZO';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'TIENE_TIMBRADOS%' THEN RAISE EXCEPTION 'un timbrado (aunque esté cancelado) debió impedirlo, salió: %', SQLERRM; END IF;
    END;
    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE; END IF;
  END;
  -- Nada de lo anterior borró nada.
  IF _eliminar_tenant_inventario(v_tenant) <> v_antes THEN RAISE EXCEPTION 'un rechazo dejó cambios'; END IF;
  RAISE NOTICE '1) rechazos OK';

  -- ── 2) El reporte Z sigue sin poder borrarse fuera de la eliminación ───────────────────────
  BEGIN
    DELETE FROM reportes_z_historico WHERE tenant_id = v_tenant;
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Reporte Z no se puede eliminar%' THEN RAISE EXCEPTION 'el reporte Z se dejó borrar: %', SQLERRM; END IF;
  END;

  -- ── 3) Vista previa y eliminación ──────────────────────────────────────────────────────────
  v_previa := eliminar_tenant_vista_previa(v_tenant);
  IF NOT (v_previa->>'puede_eliminar')::boolean THEN RAISE EXCEPTION 'debería poderse: %', v_previa->'bloqueos'; END IF;
  IF (v_previa->'resumen'->>'tickets')::int <> 4 OR (v_previa->'resumen'->>'cfdi')::int <> 1
     OR (v_previa->'resumen'->>'pagos_suscripcion')::int <> 2 OR (v_previa->'resumen'->>'cuentas')::int <> 2
     OR (v_previa->'resumen'->>'cuentas_conservadas')::int <> 3 THEN
    RAISE EXCEPTION 'vista previa inesperada: %', v_previa->'resumen';
  END IF;

  v_despues := _eliminar_tenant_inventario(v_vecino);

  -- Filas GLOBALES (B3): las de tenant_id NULL en cada tabla (roles de sistema, avisos a todos…)
  -- y las tablas sin tenant_id (planes, addons, permisos…). No se puede mover ni una. Fuera:
  -- la bitácora de plataforma (gana filas a propósito), tenants y su archivo, usuarios_perfil
  -- (se va con cada cuenta borrada) y las libretas internas del escritorio (_vim_*).
  v_globales := '{}'::jsonb;
  FOR v_tabla IN
    SELECT c.relname AS t,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS con_tenant
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname NOT IN ('super_admin_accesos', 'tenants', 'tenants_eliminados', 'usuarios_perfil')
       AND left(c.relname, 5) <> '_vim_'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I %s', v_tabla.t,
      CASE WHEN v_tabla.con_tenant THEN 'WHERE tenant_id IS NULL'
           WHEN v_tabla.t = 'rol_permisos' THEN 'rp WHERE EXISTS (SELECT 1 FROM public.roles ro WHERE ro.id = rp.rol_id AND ro.tenant_id IS NULL)'
           ELSE '' END) INTO v_n;
    v_globales := v_globales || jsonb_build_object(v_tabla.t, v_n);
  END LOOP;
  IF (v_globales->>'roles')::int = 0 OR (v_globales->>'planes')::int = 0 OR (v_globales->>'rol_permisos')::int = 0 THEN
    RAISE EXCEPTION 'el conteo de filas globales no ve los catálogos: %', v_globales;
  END IF;
  v_res := eliminar_tenant(v_tenant, '  Dejó de pagar y pidió borrar todo  ', v_op, 'ELIMINAR', '10.0.0.7'::inet);
  RAISE NOTICE '3) eliminado: %', v_res->'resumen';
  IF v_res->'tablas' <> v_antes THEN
    RAISE EXCEPTION 'lo borrado no coincide con el inventario previo: % vs %', v_res->'tablas', v_antes;
  END IF;

  -- ── 4) No queda nada: se recorre el catálogo ───────────────────────────────────────────────
  v_quedan := NULL;
  FOR v_tabla IN
    SELECT c.relname AS t, a.attname AS col
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped AND a.attnum > 0
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
       AND (a.attname = 'tenant_id'
            -- …y cualquier columna que sea llave foránea a tenants, se llame como se llame.
            OR EXISTS (SELECT 1 FROM pg_constraint k
                        WHERE k.contype = 'f' AND k.conrelid = c.oid AND k.confrelid = 'public.tenants'::regclass
                          AND a.attnum = ANY (k.conkey)))
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_tabla.t, v_tabla.col) INTO v_n USING v_tenant;
    IF v_n > 0 THEN v_quedan := concat_ws(', ', v_quedan, v_tabla.t || '=' || v_n); END IF;
  END LOOP;
  IF v_quedan IS NOT NULL THEN RAISE EXCEPTION 'quedan filas del negocio eliminado: %', v_quedan; END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN RAISE EXCEPTION 'la fila de tenants sigue ahí'; END IF;
  -- Hijas sin tenant_id: los permisos de los roles propios se van con el rol.
  IF EXISTS (SELECT 1 FROM rol_permisos rp WHERE NOT EXISTS (SELECT 1 FROM roles ro WHERE ro.id = rp.rol_id)) THEN
    RAISE EXCEPTION 'quedaron rol_permisos huérfanos';
  END IF;
  RAISE NOTICE '4) catálogo limpio';

  -- ── 5) El vecino, intacto ──────────────────────────────────────────────────────────────────
  IF _eliminar_tenant_inventario(v_vecino) <> v_despues THEN
    RAISE EXCEPTION 'se tocó al vecino: % vs %', _eliminar_tenant_inventario(v_vecino), v_despues;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id = v_tb) THEN RAISE EXCEPTION 'se borró el ticket del vecino'; END IF;
  -- M1: lo que Paco dejó en el vecino sigue ahí, y por eso su cuenta también.
  IF NOT EXISTS (SELECT 1 FROM delivery_autorizaciones WHERE tenant_id = v_vecino AND creado_por = v_paco)
     OR NOT EXISTS (SELECT 1 FROM permisos_personalizados WHERE tenant_id = v_vecino AND usuario_id = v_paco)
     OR NOT EXISTS (SELECT 1 FROM push_suscripciones WHERE tenant_id = v_vecino AND usuario_id = v_paco) THEN
    RAISE EXCEPTION 'borrar una cuenta arrastró filas del vecino (token de Uber, permisos o push)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_paco) THEN RAISE EXCEPTION 'se borró la cuenta de Paco, que tiene filas en el vecino'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios_acceso WHERE usuario_id = v_paco) THEN RAISE EXCEPTION 'Paco conservó un acceso que no debía'; END IF;

  -- B3: las filas globales, intactas tabla por tabla.
  FOR v_tabla IN
    SELECT c.relname AS t,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS con_tenant
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname NOT IN ('super_admin_accesos', 'tenants', 'tenants_eliminados', 'usuarios_perfil')
       AND left(c.relname, 5) <> '_vim_'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I %s', v_tabla.t,
      CASE WHEN v_tabla.con_tenant THEN 'WHERE tenant_id IS NULL'
           WHEN v_tabla.t = 'rol_permisos' THEN 'rp WHERE EXISTS (SELECT 1 FROM public.roles ro WHERE ro.id = rp.rol_id AND ro.tenant_id IS NULL)'
           ELSE '' END) INTO v_n;
    IF v_n IS DISTINCT FROM (v_globales->>v_tabla.t)::bigint THEN
      RAISE EXCEPTION 'cambiaron las filas globales de %: % → %', v_tabla.t, v_globales->>v_tabla.t, v_n;
    END IF;
  END LOOP;
  RAISE NOTICE '5) vecino y filas globales intactos (% tablas)', (SELECT count(*) FROM jsonb_object_keys(v_globales));

  -- ── 6) Cuentas ─────────────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_maria) THEN RAISE EXCEPTION 'se borró la cuenta compartida (María)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios_acceso WHERE usuario_id = v_maria AND tenant_id = v_vecino) THEN
    RAISE EXCEPTION 'María perdió su acceso al vecino';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (v_dueno, v_disp)) THEN RAISE EXCEPTION 'quedaron cuentas exclusivas (dueño o dispositivo)'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios_perfil WHERE id IN (v_dueno, v_disp)) THEN RAISE EXCEPTION 'quedaron perfiles de cuentas borradas'; END IF;
  -- Diego era exclusivo pero firma un cliente del vecino: se conserva y se reporta.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_diego) THEN RAISE EXCEPTION 'se borró una cuenta referenciada por otro negocio'; END IF;
  IF NOT v_res->'cuentas_conservadas' @> jsonb_build_array(jsonb_build_object('usuario_id', v_diego, 'motivo', 'REFERENCIADA_POR_OTRO_NEGOCIO'))
     OR NOT v_res->'cuentas_conservadas' @> jsonb_build_array(jsonb_build_object('usuario_id', v_paco, 'motivo', 'REFERENCIADA_POR_OTRO_NEGOCIO'))
     OR NOT v_res->'cuentas_conservadas' @> jsonb_build_array(jsonb_build_object('usuario_id', v_maria, 'motivo', 'ACCESO_A_OTRO_NEGOCIO')) THEN
    RAISE EXCEPTION 'no se reportaron las cuentas conservadas con su motivo: %', v_res->'cuentas_conservadas';
  END IF;
  IF (v_res->'resumen'->>'cuentas')::int <> 2 OR (v_res->'resumen'->>'cuentas_conservadas')::int <> 3 THEN
    RAISE EXCEPTION 'conteo de cuentas inesperado: %', v_res->'resumen';
  END IF;
  RAISE NOTICE '6) cuentas OK';

  -- ── 7) Lo que queda ────────────────────────────────────────────────────────────────────────
  SELECT * INTO v_arch FROM tenants_eliminados WHERE id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'no quedó la fila en tenants_eliminados'; END IF;
  IF v_arch.codigo <> v_codigo OR v_arch.eliminado_por <> v_op OR v_arch.motivo <> 'Dejó de pagar y pidió borrar todo'
     OR v_arch.motivo_baja IS NULL OR v_arch.fecha_baja IS NULL THEN
    RAISE EXCEPTION 'archivo incompleto: %', to_jsonb(v_arch) - 'conteos';
  END IF;
  IF jsonb_array_length(v_arch.pagos_suscripcion) <> 2 OR v_arch.pagos_suscripcion->0->>'monto_mxn' <> '499.00'
     OR v_arch.pagos_suscripcion->1->>'anulado_motivo' IS NULL THEN
    RAISE EXCEPTION 'los pagos de la suscripción no se archivaron bien: %', v_arch.pagos_suscripcion;
  END IF;
  IF jsonb_array_length(v_arch.suscripciones) < 1 THEN RAISE EXCEPTION 'no se archivó la suscripción'; END IF;
  IF v_arch.archivos_pendientes <> '[]'::jsonb THEN RAISE EXCEPTION 'sin archivos en Storage no debe quedar nada pendiente: %', v_arch.archivos_pendientes; END IF;
  IF v_arch.contacto->>'email' IS NULL THEN RAISE EXCEPTION 'no se archivó el contacto del dueño: %', v_arch.contacto; END IF;
  IF (v_arch.conteos->'resumen'->>'tickets')::int <> 4 OR v_arch.conteos->'tablas' <> v_antes THEN
    RAISE EXCEPTION 'conteos archivados inesperados: %', v_arch.conteos->'resumen';
  END IF;
  -- Bitácora: las filas del negocio siguen (sin llave, con su nombre) y hay una de la eliminación.
  SELECT count(*) INTO v_n FROM super_admin_accesos
   WHERE tenant_id IS NULL AND payload->'tenant_eliminado'->>'id' = v_tenant::text AND accion <> 'tenant.eliminar';
  IF v_n <> v_bitacora THEN RAISE EXCEPTION 'la bitácora del negocio no sobrevivió: % de %', v_n, v_bitacora; END IF;
  SELECT count(*) INTO v_n FROM super_admin_accesos
   WHERE accion = 'tenant.eliminar' AND super_admin_id = v_op AND host(ip_address) = '10.0.0.7'
     AND payload->'tenant_eliminado'->>'codigo' = v_codigo;
  IF v_n <> 1 THEN RAISE EXCEPTION 'falta el asiento de la eliminación en la bitácora'; END IF;
  RAISE NOTICE '7) archivo y bitácora OK';

  -- ── 8) No se puede eliminar dos veces, y la variable de la excepción no se queda puesta ────
  BEGIN
    PERFORM eliminar_tenant(v_tenant, 'Prueba de eliminación completa', v_op, 'ELIMINAR');
    RAISE EXCEPTION 'NO_RECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TENANT_NO_EXISTE%' THEN RAISE EXCEPTION 'la segunda vez debió decir que no existe, salió: %', SQLERRM; END IF;
  END;
  IF coalesce(current_setting('vim.eliminando_tenant', true), '') <> '' THEN
    RAISE EXCEPTION 'la variable vim.eliminando_tenant quedó puesta';
  END IF;

  -- ── 9) El código queda libre ───────────────────────────────────────────────────────────────
  INSERT INTO tenants(codigo, nombre_comercial, vertical_principal) VALUES (v_codigo, 'El mismo negocio, de vuelta', 'QUICK_SERVICE');
  RAISE NOTICE 'SMOKE ELIMINAR TENANT OK';
END $$;

ROLLBACK;
