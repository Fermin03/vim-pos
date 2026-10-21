-- Smoke tienda en línea, canal (mig. 0161 §1): delivery_pedidos admite pedidos de la tienda sin
-- conexión a una app, y el canal APP sigue exigiendo lo de siempre. Corre como postgres. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_canal.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_id     uuid;
  v_n      integer;
BEGIN
  -- 1) Un pedido de la tienda entra sin conexión.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, cliente_email, direccion, pago_al_recibir, paga_con_mxn,
    seguimiento_hash, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-smoke-1', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana Tienda', '4771112233', 'ana@example.com',
    '{"calle":"Av. Siempre Viva","numero_exterior":"742","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}'::jsonb,
    'EFECTIVO', 500.00, 'hash-smoke-1', '[]'::jsonb, '{}'::jsonb, 0, now() + interval '5 minutes')
  RETURNING id INTO v_id;
  IF (SELECT canal FROM delivery_pedidos WHERE id = v_id) <> 'TIENDA' THEN RAISE EXCEPTION '1: no quedó en canal TIENDA'; END IF;

  -- 2) Un pedido de la tienda con modo de app: rechazado.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'APP_UBEREATS', 'tienda-smoke-2', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '2: se permitió canal TIENDA con app de Uber';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3) Un pedido de app sin conexión: rechazado, como antes de esta migración.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'uber-smoke-sin-conexion', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '3: se permitió un pedido de app sin conexión';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) Forma de pago fuera de catálogo: rechazada.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, pago_al_recibir, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-smoke-4', 'RECIBIDO', 'CHEQUE', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '4: se permitió una forma de pago inválida';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5) El código de seguimiento no se repite.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, seguimiento_hash, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-smoke-5', 'RECIBIDO', 'hash-smoke-1', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '5: se repitió un seguimiento_hash';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 6) La retención blanquea también los datos nuevos.
  UPDATE delivery_pedidos SET estado = 'ENTREGADO', recibido_at = now() - interval '40 days' WHERE id = v_id;
  PERFORM delivery_anonimizar_pedidos_viejos(30);
  SELECT count(*) INTO v_n FROM delivery_pedidos
   WHERE id = v_id AND cliente_email IS NULL AND direccion IS NULL AND cliente_telefono IS NULL AND seguimiento_hash IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION '6: la retención no blanqueó correo, dirección o seguimiento'; END IF;

  RAISE NOTICE 'smoke_tienda_canal OK';
END $$;
ROLLBACK;
