-- Tier1 Onboarding wizard — la tabla tenant_onboarding_estado tiene RLS solo-lectura
-- (onboarding_select_tenant), así que el wizard no puede UPDATE la fase directamente. Esta RPC
-- SECURITY DEFINER actualiza (o crea, upsert) la fila de onboarding del tenant del JWT, avanzando
-- la fase (INVITADO → EN_CONFIGURACION → GO_LIVE) y guardando el paso del wizard + timestamps.
-- Queda acotada a current_tenant_id(), así que un tenant no puede tocar a otro.

CREATE OR REPLACE FUNCTION onboarding_actualizar_fase(
  p_fase onboarding_fase,
  p_fase_wizard int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant en el contexto';
  END IF;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase, fase_wizard, fecha_invitacion)
  VALUES (v_tenant, p_fase, COALESCE(p_fase_wizard, 0), now())
  ON CONFLICT (tenant_id) DO UPDATE
  SET fase = EXCLUDED.fase,
      fase_wizard = COALESCE(p_fase_wizard, tenant_onboarding_estado.fase_wizard),
      fecha_activacion = CASE
        WHEN EXCLUDED.fase = 'EN_CONFIGURACION' AND tenant_onboarding_estado.fecha_activacion IS NULL
        THEN now() ELSE tenant_onboarding_estado.fecha_activacion END,
      fecha_go_live = CASE
        WHEN EXCLUDED.fase = 'GO_LIVE' AND tenant_onboarding_estado.fecha_go_live IS NULL
        THEN now() ELSE tenant_onboarding_estado.fecha_go_live END,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION onboarding_actualizar_fase(onboarding_fase, int) FROM public;
GRANT EXECUTE ON FUNCTION onboarding_actualizar_fase(onboarding_fase, int) TO authenticated;
