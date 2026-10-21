-- Smoke 0242: configuración del mostrador. Las columnas nacen en false y un negocio no lee la
-- configuración de otro.
-- Uso: cd desktop && npm run smokes -- smoke_comida_rapida.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_otro   uuid := '61616161-0000-0000-0000-0000000000ab';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_n      integer;
  v_nombre boolean;
  v_comer  boolean;
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_turno  uuid; v_ticket uuid; v_prod uuid;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0242', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t), (v_otro);

  -- 1) Valores por defecto.
  SELECT pedir_nombre_cliente, tiene_donde_comer INTO v_nombre, v_comer FROM configuracion_tenant WHERE tenant_id = v_t;
  IF v_nombre IS DISTINCT FROM false OR v_comer IS DISTINCT FROM false THEN
    RAISE EXCEPTION '1: los valores por defecto no son false (% / %)', v_nombre, v_comer;
  END IF;

  -- 2) Otro negocio no las lee ni las cambia.
  UPDATE configuracion_tenant SET pedir_nombre_cliente = true, tiene_donde_comer = true WHERE tenant_id = v_otro;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM configuracion_tenant WHERE tenant_id = v_otro;
  IF v_n <> 0 THEN RAISE EXCEPTION '2: un negocio leyó la configuración de otro'; END IF;
  SELECT pedir_nombre_cliente INTO v_nombre FROM configuracion_tenant;
  IF v_nombre IS DISTINCT FROM false THEN RAISE EXCEPTION '2: la configuración propia se contaminó'; END IF;

  -- 3) Cocina al cobrar: lo que hace `enviarACocina` con la venta YA pagada (como cajero, bajo RLS)
  --    la pone en la consulta del KDS (`estado_cocina` in EN_COCINA, LISTO).
  EXECUTE 'RESET ROLE';
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-0242', CURRENT_DATE, v_cajero, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_t AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-0242-1', v_cajero);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-0242-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-0242-pago');
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE ticket_items SET enviado_cocina_at = now()
   WHERE ticket_id = v_ticket AND cancelado = false AND enviado_cocina_at IS NULL AND cargo_tipo IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '3: no se marcó el renglón de la venta pagada (%)', v_n; END IF;
  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket AND estado_cocina = 'SIN_ENVIAR';
  SELECT count(*) INTO v_n FROM tickets
   WHERE id = v_ticket AND sucursal_id = v_suc AND deleted_at IS NULL AND estado_cocina IN ('EN_COCINA', 'LISTO');
  IF v_n <> 1 THEN RAISE EXCEPTION '3: la venta pagada no aparece en la consulta del KDS'; END IF;
  -- Una sola comanda por venta: el segundo envío ya no encuentra renglones.
  UPDATE ticket_items SET enviado_cocina_at = now()
   WHERE ticket_id = v_ticket AND cancelado = false AND enviado_cocina_at IS NULL AND cargo_tipo IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '3: el segundo envío volvió a marcar renglones (%)', v_n; END IF;
  RAISE NOTICE 'smoke_comida_rapida OK';
END $$;
ROLLBACK;
