-- Smoke lealtad · ganar (0156 §4). Un cliente compra y gana; pagar dos veces no duplica; el tope
-- diario frena (y cuenta por neto); cancelar revierte; dos devoluciones parciales suman el 100%; una falla
-- de la lealtad no tumba el cobro; sin cliente o con el módulo apagado nadie gana. Hace ROLLBACK.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_lealtad_ganar.sql
\set ON_ERROR_STOP on
BEGIN;
-- Devolución PARCIAL confirmada de un solo renglón (cantidad 1), con su propia autorización.
CREATE FUNCTION pg_temp.smoke_devolver(p_ticket uuid, p_item uuid, p_tenant uuid, p_suc uuid, p_caja uuid, p_turno uuid, p_usuario uuid)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_auth uuid; v_dev uuid;
BEGIN
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (p_tenant, p_suc, p_caja, p_turno, p_usuario, p_usuario, 'devolucion', 'venta.devolucion', 'ticket', p_ticket, 'Producto defectuoso')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := p_ticket, p_caja_id := p_caja, p_turno_id := p_turno,
    p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'Devolución de smoke', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := p_usuario, p_usuario_autorizo_id := p_usuario,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', p_item, 'cantidad_devuelta', 1)),
    p_reversar_inventario := false, p_nota := 'Reembolso parcial');
  PERFORM confirmar_devolucion(v_dev, p_usuario);
END $f$;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_papas uuid; v_cli uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_total  numeric; v_n integer;
  v_item   uuid; v_item2 uuid; v_cli2 uuid; v_ta uuid; v_tb uuid; v_tc uuid; v_saldo_antes integer; v_total_p numeric;
BEGIN
  -- aplicar_pago inserta pagos.usuario_id = auth.uid(): se simula al empleado con un claim.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- La función pura, caso por caso (los mismos que prueba el espejo en TS del plan 1B).
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 200, 5, NULL, 0) <> 10 THEN RAISE EXCEPTION '5%% de 200 debe dar 10'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 199.99, 5, NULL, 0) <> 9 THEN RAISE EXCEPTION 'se redondea hacia abajo'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 80, 5, NULL, 100) <> 0 THEN RAISE EXCEPTION 'bajo la compra mínima no gana'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_PREMIOS', 125, NULL, 10, 0) <> 12 THEN RAISE EXCEPTION '1 punto por cada $10'; END IF;
  IF lealtad_puntos_por_compra('SELLOS', 45, NULL, NULL, 0) <> 1 THEN RAISE EXCEPTION 'una visita, un sello'; END IF;
  IF lealtad_puntos_por_compra('SELLOS', 0, NULL, NULL, 0) <> 0 THEN RAISE EXCEPTION 'una cuenta en cero no gana'; END IF;

  -- Negocio con add-on, programa (10%, tope 2) e interruptor encendido. La semilla no trae fila de
  -- configuracion_tenant para este negocio: se crea ya encendida (el add-on y el programa, antes).
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_tenant, 'PUNTOS_DINERO', 10, 2);
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;

  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Smoke', '4770001561') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LEA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod  FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_papas FROM productos WHERE tenant_id = v_tenant AND nombre = 'Papas Gajo' LIMIT 1;

  -- 1) Compra de $120 con cliente: gana 12.
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-1-i');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t1;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t1) <> 'PAGADO' THEN RAISE EXCEPTION 'el ticket no quedó pagado'; END IF;
  IF lealtad_neto_ganado(v_t1) <> 12 THEN RAISE EXCEPTION 'ganado: % (esperado 12)', lealtad_neto_ganado(v_t1); END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 12 THEN RAISE EXCEPTION 'saldo no es 12'; END IF;
  IF (SELECT saldo_visto FROM lealtad_movimientos WHERE ticket_id = v_t1) <> 12 THEN RAISE EXCEPTION 'saldo_visto no se guardó'; END IF;

  -- 2) Volver a acumular el mismo ticket no duplica.
  IF lealtad_acumular_por_ticket(v_t1) <> 0 THEN RAISE EXCEPTION 'acumuló dos veces'; END IF;

  -- 3) Segunda compra del día: gana. Tercera: el tope (2) la frena.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-2-i');
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, v_total, v_total);
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-3', v_maria);
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-3-i');
  PERFORM aplicar_pago(v_t3, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF lealtad_neto_ganado(v_t3) <> 0 THEN RAISE EXCEPTION 'el tope diario no frenó la tercera compra'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 24 THEN RAISE EXCEPTION 'saldo tras dos compras no es 24'; END IF;

  -- 4) Cancelar la primera revierte sus 12 y no más.
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t1;
  IF lealtad_neto_ganado(v_t1) <> 0 THEN RAISE EXCEPTION 'cancelar no revirtió'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 12 THEN RAISE EXCEPTION 'saldo tras cancelar no es 12'; END IF;
  IF lealtad_revertir_ganado_ticket(v_t1) <> 0 THEN RAISE EXCEPTION 'revirtió dos veces'; END IF;

  -- 5) Sin cliente no hay movimiento.
  SELECT count(*) INTO v_n FROM lealtad_movimientos WHERE tenant_id = v_tenant;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-lea-4', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-4-i');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT count(*) FROM lealtad_movimientos WHERE tenant_id = v_tenant) <> v_n THEN RAISE EXCEPTION 'un ticket sin cliente generó movimiento'; END IF;

  -- 6) Con el módulo apagado nadie gana.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  UPDATE lealtad_programa SET tope_compras_dia = 50 WHERE tenant_id = v_tenant;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-5', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-5-i');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF lealtad_neto_ganado(v_t1) <> 0 THEN RAISE EXCEPTION 'ganó con el módulo apagado'; END IF;

  -- 7) Dos devoluciones PARCIALES que juntas cubren el 100% del ticket (módulo encendido otra vez).
  -- Hamburguesa 120 + papas 55 = 175; gana floor(17.5) = 17. La fracción de cada devolución es
  -- relativa al ticket original: 120/175 → ceil(17 × 0.6857) = 12; 55/175 → lo que quede (5).
  -- Con la fracción aplicada al remanente, la segunda revertiría solo 2 y sobrevivirían 3 puntos.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-6', v_maria);
  v_item := agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-6-i');
  v_item2 := agregar_item_a_ticket(v_t1, v_papas, 1, NULL, '[]'::jsonb, 'smoke-lea-6-p');
  SELECT total_mxn INTO v_total_p FROM tickets WHERE id = v_t1;
  IF v_total_p <> 175 THEN RAISE EXCEPTION 'el ticket debía sumar 175, sumó %', v_total_p; END IF;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total_p, v_total_p);
  IF lealtad_neto_ganado(v_t1) <> 17 THEN RAISE EXCEPTION 'ganado % (esperado 17)', lealtad_neto_ganado(v_t1); END IF;
  SELECT saldo INTO v_saldo_antes FROM lealtad_saldos WHERE cliente_id = v_cli;

  PERFORM pg_temp.smoke_devolver(v_t1, v_item, v_tenant, v_suc, v_caja, v_turno, v_maria);
  IF lealtad_neto_ganado(v_t1) <> 5 THEN
    RAISE EXCEPTION 'tras devolver la hamburguesa debían quedar 5 puntos, quedaron %', lealtad_neto_ganado(v_t1);
  END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo_antes - 12 THEN RAISE EXCEPTION 'el saldo no bajó 12'; END IF;

  PERFORM pg_temp.smoke_devolver(v_t1, v_item2, v_tenant, v_suc, v_caja, v_turno, v_maria);
  IF lealtad_neto_ganado(v_t1) <> 0 THEN
    RAISE EXCEPTION 'tras devolver todo el ticket no debía quedar nada, quedaron %', lealtad_neto_ganado(v_t1);
  END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo_antes - 17 THEN
    RAISE EXCEPTION 'el saldo debía bajar los 17 que ganó el ticket';
  END IF;

  -- 8) El tope cuenta por neto: un ticket con devolución parcial sigue reteniendo puntos y sigue
  -- contando. Tope 2: A (devolución parcial, neto 5) + B (gana) → C no gana.
  UPDATE lealtad_programa SET tope_compras_dia = 2 WHERE tenant_id = v_tenant;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Beto Smoke', '4770001562') RETURNING id INTO v_cli2;
  v_ta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lea-7a', v_maria);
  v_item := agregar_item_a_ticket(v_ta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-7a-i');
  PERFORM agregar_item_a_ticket(v_ta, v_papas, 1, NULL, '[]'::jsonb, 'smoke-lea-7a-p');
  PERFORM aplicar_pago(v_ta, 'EFECTIVO'::metodo_pago, 175, 175);
  PERFORM pg_temp.smoke_devolver(v_ta, v_item, v_tenant, v_suc, v_caja, v_turno, v_maria);
  IF lealtad_neto_ganado(v_ta) <> 5 THEN RAISE EXCEPTION 'A debía quedar con 5 puntos vivos, quedó con %', lealtad_neto_ganado(v_ta); END IF;
  v_tb := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lea-7b', v_maria);
  PERFORM agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-7b-i');
  PERFORM aplicar_pago(v_tb, 'EFECTIVO'::metodo_pago, 120, 120);
  IF lealtad_neto_ganado(v_tb) <> 12 THEN RAISE EXCEPTION 'B debía ganar 12, ganó %', lealtad_neto_ganado(v_tb); END IF;
  v_tc := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lea-7c', v_maria);
  PERFORM agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-7c-i');
  PERFORM aplicar_pago(v_tc, 'EFECTIVO'::metodo_pago, 120, 120);
  IF lealtad_neto_ganado(v_tc) <> 0 THEN RAISE EXCEPTION 'el tope (2) no frenó a C: A con devolución parcial seguía contando'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> 17 THEN RAISE EXCEPTION 'saldo de Beto debía ser 5 + 12'; END IF;

  -- 9) Una falla de la lealtad no tumba la venta: se impide registrar lo ganado y el ticket queda
  -- PAGADO igual (el aviso queda en el log). La restricción solo existe dentro de esta transacción.
  UPDATE lealtad_programa SET tope_compras_dia = 50 WHERE tenant_id = v_tenant;
  ALTER TABLE lealtad_movimientos ADD CONSTRAINT smoke_rompe CHECK (tipo <> 'GANADO') NOT VALID;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-8', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-8-i');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, 120, 120);
  ALTER TABLE lealtad_movimientos DROP CONSTRAINT smoke_rompe;
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t1) <> 'PAGADO' THEN RAISE EXCEPTION 'la falla de la lealtad tumbó el cobro'; END IF;
  IF lealtad_neto_ganado(v_t1) <> 0 THEN RAISE EXCEPTION 'la falla forzada no impidió el registro: la prueba no prueba nada'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD GANAR OK';
END $$;
ROLLBACK;
