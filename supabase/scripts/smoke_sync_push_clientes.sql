-- Smoke sync PUSH de clientes (0117): un cliente y su dirección registrados en la caja se replican
-- a la "nube" vía sync_push_snapshot. Antes de la 0117 la RPC no conocía estas tablas y las
-- reportaba en `_ignoradas`: el padrón no salía nunca de la caja.
-- Se auto-envuelve en transacción con ROLLBACK (no persiste nada).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_cli uuid; v_dir uuid; v_snap jsonb; v_res jsonb; v_ref text;
BEGIN
  -- 1) Alta en la "caja": cliente + dirección, como lo hace registrarClienteDomicilio.
  INSERT INTO clientes (tenant_id, nombre, telefono)
  VALUES (v_t, 'Smoke Push Cliente', '4779990117') RETURNING id INTO v_cli;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, referencias)
  VALUES (v_t, v_cli, 'Madero', '12', 'Centro', '37000', 'León', 'Guanajuato', 'Portón negro') RETURNING id INTO v_dir;

  SELECT jsonb_build_object(
    'clientes',            (SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.id = v_cli),
    'direcciones_cliente', (SELECT jsonb_agg(to_jsonb(x)) FROM direcciones_cliente x WHERE x.id = v_dir)
  ) INTO v_snap;

  -- 2) La "nube" sin ese cliente.
  DELETE FROM direcciones_cliente WHERE id = v_dir;
  DELETE FROM clientes WHERE id = v_cli;

  -- 3) PUSH.
  v_res := sync_push_snapshot(v_t, v_snap);
  RAISE NOTICE 'resultado: %', v_res;
  IF v_res ? '_ignoradas' THEN RAISE EXCEPTION 'la RPC ignoró tablas: %', v_res->'_ignoradas'; END IF;
  IF v_res ? '_errores' THEN RAISE EXCEPTION 'la RPC rechazó filas: %', v_res->'_errores'; END IF;
  IF (v_res->>'clientes')::int <> 1 THEN RAISE EXCEPTION 'clientes aplicados: %', v_res->>'clientes'; END IF;
  IF (v_res->>'direcciones_cliente')::int <> 1 THEN RAISE EXCEPTION 'direcciones aplicadas: %', v_res->>'direcciones_cliente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND telefono = '4779990117') THEN
    RAISE EXCEPTION 'el cliente no llegó a la nube';
  END IF;

  -- 4) Una edición hecha en la caja vuelve a viajar y se aplica (ON CONFLICT DO UPDATE).
  v_snap := jsonb_set(v_snap, '{direcciones_cliente,0,referencias}', '"Casa azul"');
  PERFORM sync_push_snapshot(v_t, v_snap);
  SELECT referencias INTO v_ref FROM direcciones_cliente WHERE id = v_dir;
  IF v_ref IS DISTINCT FROM 'Casa azul' THEN RAISE EXCEPTION 'la edición no se aplicó: %', v_ref; END IF;
  IF (SELECT count(*) FROM clientes WHERE id = v_cli) <> 1 THEN RAISE EXCEPTION 'push no idempotente'; END IF;

  -- 5) Otro tenant no puede colarse: la RPC fuerza tenant_id = p_tenant.
  v_snap := jsonb_set(v_snap, '{clientes,0,id}', to_jsonb(gen_random_uuid()::text));
  v_snap := jsonb_set(v_snap, '{clientes,0,tenant_id}', '"00000000-0000-0000-0000-00000000dead"');
  v_res := sync_push_snapshot(v_t, v_snap - 'direcciones_cliente');
  IF (v_res->>'clientes')::int <> 0 THEN RAISE EXCEPTION 'se aplicó un cliente de otro tenant'; END IF;

  RAISE NOTICE 'SMOKE PUSH CLIENTES OK: cliente y dirección replicados, ediciones viajan, tenant aislado.';
END $$;
ROLLBACK;
