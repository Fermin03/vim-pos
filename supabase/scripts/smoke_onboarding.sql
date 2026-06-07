-- Smoke Tier1 onboarding: la RPC onboarding_actualizar_fase hace upsert + avanza la fase del
-- tenant del JWT bajo su RLS (la tabla es solo-lectura, la RPC es SECURITY DEFINER). ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_tenant uuid:='99999999-0000-0000-0000-0000000000aa'; v_dueno uuid:='99999999-0000-0000-0000-0000000000e1'; v_fase text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dueno::text,'tenant_id',v_tenant::text,'role','authenticated')::text,true);
  PERFORM set_config('role','authenticated', true);
  PERFORM onboarding_actualizar_fase('EN_CONFIGURACION', 2);
  PERFORM onboarding_actualizar_fase('GO_LIVE', NULL);
  SET LOCAL role postgres;
  SELECT fase INTO v_fase FROM tenant_onboarding_estado WHERE tenant_id=v_tenant;
  RAISE NOTICE 'fase final: % (esperado GO_LIVE) + fecha_go_live=%', v_fase, (SELECT fecha_go_live IS NOT NULL FROM tenant_onboarding_estado WHERE tenant_id=v_tenant);
  IF v_fase<>'GO_LIVE' THEN RAISE EXCEPTION 'no llegó a GO_LIVE'; END IF;
  RAISE NOTICE 'SMOKE ONBOARDING OK: INVITADO->EN_CONFIGURACION->GO_LIVE vía RPC bajo RLS.';
END $$;
ROLLBACK;
