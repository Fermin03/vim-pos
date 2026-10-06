-- Smoke 0156 lealtad (§1-§3), espejo de supabase/tests/0038_lealtad.test.sql para correrlo en el
-- Postgres embebido (la pgTAP solo corre en el CI). Mismas 14 comprobaciones, mismos ids.
-- Cada negocio ve solo lo suyo, solo dueño o admin configura, nadie escribe el libro ni los saldos
-- a mano, y el interruptor exige add-on y programa.
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

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'SMOKE LEALTAD RLS OK';
END $$;
ROLLBACK;
