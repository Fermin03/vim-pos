-- Smoke F4-fiscal: el DUEÑO actualiza datos fiscales de SU tenant (RLS tenants_update_admin),
-- y NO puede tocar los de otro tenant. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';  -- DUEÑO Knock-Out (usuarios_acceso DUENO activo)
  v_otro   uuid;
  v_rfc text; v_razon text;
BEGIN
  -- Simular JWT del dueño con su tenant
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) Update fiscal de SU tenant (debe pasar por RLS)
  UPDATE tenants SET
    rfc = 'VIMF030828Z07',
    razon_social = 'VIM MARKETING SA DE CV',
    regimen_fiscal = '601',
    codigo_postal_fiscal = '37150',
    email_fiscal = 'facturas@knockout.dev'
  WHERE id = v_tenant;

  SET LOCAL role postgres;  -- leer sin RLS para verificar
  SELECT rfc, razon_social INTO v_rfc, v_razon FROM tenants WHERE id = v_tenant;
  RAISE NOTICE 'tenant propio -> rfc=% razon=%', v_rfc, v_razon;
  IF v_rfc <> 'VIMF030828Z07' THEN RAISE EXCEPTION 'update fiscal propio falló'; END IF;

  -- 2) Crear un segundo tenant y verificar que el dueño NO lo puede actualizar
  INSERT INTO tenants(nombre_comercial, codigo, vertical_principal, estado, timezone)
  VALUES ('Otro Negocio', 'otro-neg-smoke', 'QUICK_SERVICE', 'ACTIVO', 'America/Mexico_City')
  RETURNING id INTO v_otro;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE tenants SET rfc = 'XXXX010101XXX' WHERE id = v_otro;  -- RLS debe filtrar 0 filas
  GET DIAGNOSTICS v_rfc = ROW_COUNT;
  RAISE NOTICE 'filas afectadas en tenant ajeno: % (esperado 0)', v_rfc;
  IF v_rfc::int <> 0 THEN RAISE EXCEPTION 'RLS NO bloqueó update cross-tenant!'; END IF;

  RAISE NOTICE 'SMOKE DATOS FISCALES OK: update propio aplicado, cross-tenant bloqueado por RLS.';
END $$;
ROLLBACK;
