-- Smoke 0156 lealtad (§1-§3), espejo de supabase/tests/0038_lealtad.test.sql para correrlo en el
-- Postgres embebido (la pgTAP solo corre en el CI). Las comprobaciones 1-14 son las mismas de esa
-- prueba, con los mismos ids.
-- Cada negocio ve solo lo suyo, solo dueño o admin configura, nadie escribe el libro ni los saldos
-- a mano, y el interruptor exige add-on y programa.
-- 15-19 (§6, solo aquí): con el módulo encendido y un canje vivo, el cajero con su JWT real (RLS) sigue
-- vendiendo con las RPC normales, puede quitar el canje de una cuenta abierta, y no puede llamar
-- directo a las funciones que autorizan o asientan un canje ni leer un saldo.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_lealtad_rls.sql   (hace ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '38383838-0000-0000-0000-0000000000aa';
  v_cli    uuid := '38383838-0000-0000-0000-000000000001';
  v_cli2   uuid := '38383838-0000-0000-0000-000000000002';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_n      integer;
  v_b      boolean;
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_turno  uuid; v_ver integer; v_hamb uuid; v_t1 uuid; v_t2 uuid; v_canje uuid := gen_random_uuid();
  v_saldo  integer; v_total numeric; j jsonb;
BEGIN
  -- Fixture (como postgres, sin RLS). Sin session_replication_role: el CI no corre smokes como superusuario.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0038', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES
    (v_cli,  v_t,    'Ana Propia', '4770000381'),
    (v_cli2, v_otro, 'Beto Ajeno', '4770000382');
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_otro, 'PUNTOS_DINERO', 5);
  INSERT INTO lealtad_saldos (tenant_id, cliente_id, saldo, programa_version) VALUES
    (v_t, v_cli, 10, 1), (v_otro, v_cli2, 99, 1);
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;

  -- 1-2) Estructura.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'tickets' AND column_name = 'lealtad_mxn') THEN
    RAISE EXCEPTION '1: tickets no tiene lealtad_mxn';
  END IF;
  IF (SELECT codigo_publico FROM clientes WHERE id = v_cli) IS NULL THEN
    RAISE EXCEPTION '2: el cliente no nació con código público';
  END IF;

  -- 3) El módulo aparece en modulos_efectivos, apagado por omisión.
  v_b := (modulos_efectivos(v_t) -> 'efectivos' ->> 'lealtad')::boolean;
  IF v_b IS DISTINCT FROM false THEN RAISE EXCEPTION '3: lealtad debía nacer apagada, vino %', v_b; END IF;

  -- 3b) El add-on existe en el catálogo. Nació INACTIVO en la 0156 (sin pantallas no debía estar a
  -- un clic en /platform); la 0159 (plan 1C) lo enciende porque ya hay sección /lealtad. $100 en Esencial.
  IF NOT EXISTS (SELECT 1 FROM addons WHERE codigo = 'LEALTAD') THEN RAISE EXCEPTION '3b: no existe el add-on LEALTAD'; END IF;
  IF (SELECT activo FROM addons WHERE codigo = 'LEALTAD') IS DISTINCT FROM true THEN
    RAISE EXCEPTION '3b: el add-on LEALTAD debía quedar activo en el catálogo tras la 0159';
  END IF;
  IF (SELECT precio_mensual_mxn FROM addons WHERE codigo = 'LEALTAD') IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION '3b: el add-on LEALTAD debía costar 100';
  END IF;

  -- Como el cajero.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  -- 4-5) Ve lo de su negocio y no lo ajeno.
  SELECT count(*) INTO v_n FROM lealtad_saldos;
  IF v_n <> 1 THEN RAISE EXCEPTION '4: el cajero debía ver 1 saldo, vio %', v_n; END IF;
  SELECT count(*) INTO v_n FROM lealtad_programa;
  IF v_n <> 0 THEN RAISE EXCEPTION '5: el programa de otro negocio se ve (% filas)', v_n; END IF;

  -- 6-8) No configura ni escribe el libro ni los saldos.
  BEGIN
    INSERT INTO lealtad_programa (tenant_id, mecanica) VALUES (v_t, 'SELLOS');
    RAISE EXCEPTION '6: un cajero creó el programa';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO lealtad_movimientos (tenant_id, cliente_id, tipo, puntos, programa_version)
    VALUES (v_t, v_cli, 'AJUSTE', 50, 1);
    RAISE EXCEPTION '7: alguien escribió el libro a mano';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Sin GRANT de UPDATE: aquí no filtra RLS (0 filas en silencio), lanza permiso denegado.
  BEGIN
    UPDATE lealtad_saldos SET saldo = 9999 WHERE cliente_id = v_cli;
    RAISE EXCEPTION '8: alguien editó un saldo a mano';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 9) Tampoco enciende el módulo.
  BEGIN
    UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;
    RAISE EXCEPTION '9: un cajero encendió la lealtad';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Como el dueño.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  -- 10) Sin add-on no se enciende.
  BEGIN
    UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;
    RAISE EXCEPTION '10: se encendió la lealtad sin add-on';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 11-12) El dueño crea su programa, nunca el de otro.
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_t, 'PUNTOS_DINERO', 5);
  BEGIN
    INSERT INTO lealtad_premios (tenant_id, producto_id, costo) VALUES (v_otro, v_prod, 5);
    RAISE EXCEPTION '12: el dueño creó un premio en otro negocio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 13-14) Con add-on y programa, sí enciende, y queda efectivo.
  EXECUTE 'RESET ROLE';
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;
  v_b := (modulos_efectivos(v_t) -> 'efectivos' ->> 'lealtad')::boolean;
  IF v_b IS DISTINCT FROM true THEN RAISE EXCEPTION '14: lealtad debía quedar efectiva, vino %', v_b; END IF;

  -- 15) Fixture de la venta, como postgres: turno abierto, saldo para canjear y una cuenta ya
  --     abierta con un canje de $20 asentado (la nube lo autorizó; la caja lo pegó).
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = v_t;
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_cli, 'AJUSTE', 100, v_ver, p_motivo => 'saldo de prueba');
  SELECT saldo INTO v_saldo FROM lealtad_saldos WHERE cliente_id = v_cli;   -- 10 + 100
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-LRLS', (now() AT TIME ZONE 'America/Mexico_City')::date, v_cajero, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_hamb FROM productos WHERE tenant_id = v_t AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lrls-2', v_cajero);
  PERFORM agregar_item_a_ticket(v_t2, v_hamb, 1, NULL, '[]'::jsonb, 'smoke-lrls-2-i1');
  j := lealtad_canjear(v_canje, v_t, v_cli, NULL, 20, NULL, v_t2, v_suc, v_caja, v_cajero);
  IF NOT (j->>'ok')::boolean THEN RAISE EXCEPTION '15: el canje de fixture no se autorizó: %', j; END IF;
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_t, 'ticket_id', v_t2));

  -- Como el cajero, con RLS de verdad: recalcular_totales_ticket es SECURITY INVOKER y desde la 0156
  -- lee ticket_canjes_lealtad en cada venta.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  -- 16) Una venta normal: abrir, agregar un renglón y cobrar por las RPC de siempre.
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lrls-1', v_cajero);
  PERFORM agregar_item_a_ticket(v_t1, v_hamb, 1, NULL, '[]'::jsonb, 'smoke-lrls-1-i1');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t1;
  IF v_total <> 120 THEN RAISE EXCEPTION '16: el total de la venta bajo RLS es % (esperado 120)', v_total; END IF;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t1) <> 'PAGADO' THEN RAISE EXCEPTION '16: la venta no quedó pagada bajo RLS'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_t1) <> 120 THEN RAISE EXCEPTION '16: el total cambió al cobrar'; END IF;

  -- 17) Una cuenta con canje vivo: agregar un renglón recalcula leyendo el canje bajo RLS.
  PERFORM agregar_item_a_ticket(v_t2, v_hamb, 1, NULL, '[]'::jsonb, 'smoke-lrls-2-i2');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t2;
  IF v_total <> 220 THEN RAISE EXCEPTION '17: 2 x 120 menos el canje de 20 debía dar 220, dio %', v_total; END IF;

  -- 18) quitar_canje_lealtad es lo único de §6 que el cajero llama: devuelve el canje, una vez, y
  --     no toca una cuenta ya cobrada.
  IF quitar_canje_lealtad(v_t2) <> 1 THEN RAISE EXCEPTION '18: el cajero no pudo quitar el canje'; END IF;
  IF quitar_canje_lealtad(v_t2) <> 0 THEN RAISE EXCEPTION '18: quitó el canje dos veces'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t2;
  IF v_total <> 240 THEN RAISE EXCEPTION '18: sin el canje la cuenta debía valer 240, vale %', v_total; END IF;
  BEGIN
    PERFORM quitar_canje_lealtad(v_t1);
    RAISE EXCEPTION '18: quitó el canje de una cuenta ya cobrada';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 19) Lo demás es solo de service_role: ni autorizar, ni asentar, ni leer un saldo.
  BEGIN
    PERFORM lealtad_canjear(gen_random_uuid(), v_t, v_cli, NULL, 5, NULL, v_t2, v_suc, v_caja, v_cajero);
    RAISE EXCEPTION '19: el cajero llamó lealtad_canjear';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM lealtad_asentar_canje(jsonb_build_object('canje_id', gen_random_uuid(), 'tenant_id', v_t, 'ticket_id', v_t2));
    RAISE EXCEPTION '19: el cajero llamó lealtad_asentar_canje';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM lealtad_saldo(v_t, v_cli, NULL);
    RAISE EXCEPTION '19: el cajero llamó lealtad_saldo';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 19b) lealtad_vence_el recibe el negocio como parámetro: un autenticado leería los meses de
  -- vencimiento de otro. Solo la llaman funciones definer y triggers.
  BEGIN
    PERFORM lealtad_vence_el(v_otro, now());
    RAISE EXCEPTION '19b: el cajero llamó lealtad_vence_el';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  EXECUTE 'RESET ROLE';
  -- El cobro bajo RLS también ganó: 5% de 120 = 6, y el canje quitado devolvió sus 20.
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo + 6 THEN
    RAISE EXCEPTION '19: saldo final % (esperado %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli), v_saldo + 6;
  END IF;
  RAISE NOTICE 'SMOKE LEALTAD RLS OK';
END $$;
ROLLBACK;
