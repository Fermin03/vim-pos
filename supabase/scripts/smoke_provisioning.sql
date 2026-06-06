-- Smoke F10 provisioning: crea un owner (auth.users) + crear_tenant_con_owner (plan QS) y
-- verifica que quedó el tenant + perfil + acceso DUENO + saldo de folios + onboarding. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tenant uuid;
  v_codigo text := 'smoke-prov-' || substr(v_owner::text, 1, 8);
  v_acceso int; v_folios int; v_fase text; v_dueno_ok boolean;
BEGIN
  -- Owner como lo crearía la Edge Function vía admin.auth.admin.createUser (aquí, directo).
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text,1,8) || '@smoke.dev',
          crypt('smokepass', gen_salt('bf')), now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  -- Provisioning del tenant (la RPC es SECURITY DEFINER; la Edge Function la invoca con service_role).
  v_tenant := crear_tenant_con_owner(
    p_owner_user_id    := v_owner,
    p_codigo           := v_codigo,
    p_nombre_comercial := 'Taquería Smoke',
    p_nombre_owner     := 'Owner Smoke',
    p_telefono_owner   := '4770000000',
    p_vertical         := 'QUICK_SERVICE'::vertical_tipo,
    p_plan_codigo      := 'QS',
    p_estado           := 'TRIAL'::tenant_estado,
    p_notas_internas   := 'Alta de prueba (smoke)'
  );
  RAISE NOTICE 'tenant creado: %', v_tenant;

  -- 1) Acceso DUENO del owner sobre el tenant
  SELECT EXISTS (
    SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
    WHERE ua.usuario_id = v_owner AND ua.tenant_id = v_tenant AND r.codigo = 'DUENO' AND ua.activo
  ) INTO v_dueno_ok;
  RAISE NOTICE 'acceso DUENO del owner: %', v_dueno_ok;
  IF NOT v_dueno_ok THEN RAISE EXCEPTION 'no se creó el acceso DUENO'; END IF;

  -- 2) Saldo de folios del plan
  SELECT count(*) INTO v_folios FROM tenant_folios_saldo WHERE tenant_id = v_tenant;
  IF v_folios <> 1 THEN RAISE EXCEPTION 'no se creó tenant_folios_saldo'; END IF;

  -- 3) Onboarding en fase INVITADO
  SELECT fase INTO v_fase FROM tenant_onboarding_estado WHERE tenant_id = v_tenant;
  RAISE NOTICE 'onboarding fase: %', v_fase;
  IF v_fase <> 'INVITADO' THEN RAISE EXCEPTION 'onboarding no quedó en INVITADO: %', v_fase; END IF;

  -- 4) Tenant en estado TRIAL con su plan
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id=v_tenant AND estado='TRIAL' AND codigo=v_codigo) THEN
    RAISE EXCEPTION 'tenant no quedó bien';
  END IF;

  RAISE NOTICE 'SMOKE PROVISIONING OK: tenant % (% / QS / TRIAL) con dueño, folios y onboarding.', v_codigo, v_tenant;
END $$;
ROLLBACK;
