-- Smoke 0260: la base admite Clip (conexión CLIP, porcentajes de propina,
-- caja sin id externo, propina del cobro). Corre en el Postgres de la caja (sin pgTAP ni Vault).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_con uuid := gen_random_uuid();
BEGIN
  INSERT INTO terminal_conexiones (id, tenant_id, proveedor, cuenta_id_externo) VALUES (v_con, v_t, 'CLIP', 'clip-1');

  INSERT INTO terminal_config_sucursal (sucursal_id, tenant_id, conexion_id, propina_opciones)
  VALUES (v_s, v_t, v_con, '{10,15,20}');
  INSERT INTO terminal_dispositivos (caja_id, tenant_id, sucursal_id, conexion_id) VALUES (v_c, v_t, v_s, v_con);
  INSERT INTO terminal_cobros (id, tenant_id, sucursal_id, caja_id, conexion_id, ticket_id, monto_mxn, propina_mxn)
  VALUES (gen_random_uuid(), v_t, v_s, v_c, v_con, gen_random_uuid(), 10, 1.50);

  BEGIN UPDATE terminal_config_sucursal SET propina_opciones = '{10,15,20,25}'; RAISE EXCEPTION 'pasó 4 opciones';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE terminal_config_sucursal SET propina_opciones = '{0}'; RAISE EXCEPTION 'pasó 0';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE terminal_config_sucursal SET propina_opciones = '{10,NULL}'; RAISE EXCEPTION 'pasó NULL';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE terminal_config_sucursal SET propina_opciones = '{}'; RAISE EXCEPTION 'pasó vacío';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE terminal_config_sucursal SET propina_opciones = '{101}'; RAISE EXCEPTION 'pasó 101';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO terminal_conexiones (tenant_id, proveedor, cuenta_id_externo) VALUES (v_t, 'NETPAY', 'x'); RAISE EXCEPTION 'pasó NETPAY';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
