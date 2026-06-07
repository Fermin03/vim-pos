-- Smoke F18 Full Service: crea una mesa, abre un ticket modo MESA, le asigna la mesa,
-- verifica que la mesa queda OCUPADA y aparece en vw_mesas_estado_actual, luego transfiere
-- a otra mesa. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid;
  v_mesa1 uuid; v_mesa2 uuid;
  v_estado1 text; v_ticket_en_vista uuid; v_estado_tras_transfer text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-MESA', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- Dos mesas
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 1, 'Mesa 1', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa1;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 2, 'Mesa 2', 2, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa2;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'smoke-mesa-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-mesa-item');

  -- Asignar mesa 1 al ticket
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa1, true, 'smoke-mesa-asig');
  SELECT estado INTO v_estado1 FROM mesas WHERE id=v_mesa1;
  RAISE NOTICE 'mesa1 tras asignar: % (esperado OCUPADA)', v_estado1;
  IF v_estado1 <> 'OCUPADA' THEN RAISE EXCEPTION 'mesa no quedó OCUPADA'; END IF;

  -- La vista de estado debe mostrar el ticket activo en la mesa
  SELECT ticket_activo_id INTO v_ticket_en_vista FROM vw_mesas_estado_actual WHERE mesa_id=v_mesa1;
  RAISE NOTICE 'vista mesa1 ticket_activo: %', (v_ticket_en_vista = v_ticket);
  IF v_ticket_en_vista <> v_ticket THEN RAISE EXCEPTION 'la vista no muestra el ticket activo'; END IF;

  -- Transferir a mesa 2 (sin PIN; el RPC acepta autorizacion opcional). Motivo corto:
  -- motivo_liberacion es varchar(50) y el RPC le antepone texto, así que dejamos margen.
  PERFORM transferir_mesa(v_ticket, v_mesa2, 'cambio', NULL);

  SELECT estado INTO v_estado_tras_transfer FROM mesas WHERE id=v_mesa2;
  RAISE NOTICE 'mesa2 tras transferir: % (esperado OCUPADA)', v_estado_tras_transfer;
  IF v_estado_tras_transfer <> 'OCUPADA' THEN RAISE EXCEPTION 'transferencia no ocupó mesa2'; END IF;
  IF (SELECT estado FROM mesas WHERE id=v_mesa1) = 'OCUPADA' THEN RAISE EXCEPTION 'mesa1 debió liberarse'; END IF;

  RAISE NOTICE 'SMOKE MESAS OK: asignar mesa1 OCUPADA + vista + transferir a mesa2.';
END $$;
ROLLBACK;
