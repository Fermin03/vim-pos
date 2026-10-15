-- Smoke: la configuración de propinas baja a la caja (migración 0184). Antes, la caja instalada
-- nunca recibía sucursal_propinas_config y usaba siempre los valores por defecto. Sobre la semilla.
-- ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_snap   jsonb;
BEGIN
  INSERT INTO sucursal_propinas_config (tenant_id, sucursal_id, capturar_propina, porcentajes_sugeridos)
  VALUES (v_tenant, v_suc, false, ARRAY[5, 10]::integer[])
  ON CONFLICT (sucursal_id) DO UPDATE SET capturar_propina = false, porcentajes_sugeridos = ARRAY[5, 10]::integer[];

  -- a) El snapshot de la caja trae la fila del negocio, con lo que el dueño configuró.
  v_snap := sync_pull_snapshot(v_tenant);
  IF NOT v_snap ? 'sucursal_propinas_config' THEN
    RAISE EXCEPTION 'a: el snapshot no trae sucursal_propinas_config';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snap->'sucursal_propinas_config') f
     WHERE (f->>'sucursal_id')::uuid = v_suc
       AND (f->>'capturar_propina')::boolean = false
       AND f->'porcentajes_sugeridos' = '[5, 10]'::jsonb
  ) THEN
    RAISE EXCEPTION 'a: la fila de la sucursal no viene como se configuró: %', v_snap->'sucursal_propinas_config';
  END IF;
  RAISE NOTICE 'a snapshot trae propinas OK';

  -- b) Solo las de este negocio.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap->'sucursal_propinas_config') f
              WHERE (f->>'tenant_id')::uuid <> v_tenant) THEN
    RAISE EXCEPTION 'b: el snapshot trae propinas de otro negocio';
  END IF;
  RAISE NOTICE 'b aislamiento OK';

  -- c) catalogo_version() mira las propinas: un cambio llega en el sondeo de cada minuto, no en el
  --    pull completo de cada hora. El disparador de updated_at es solo BEFORE UPDATE, así que un
  --    INSERT conserva una fecha puesta a mano: una configuración "del futuro" debe mandar.
  DELETE FROM sucursal_propinas_config WHERE sucursal_id = v_suc;
  INSERT INTO sucursal_propinas_config (tenant_id, sucursal_id, updated_at)
  VALUES (v_tenant, v_suc, '2999-01-01T00:00:00Z');
  IF catalogo_version() IS DISTINCT FROM '2999-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'c: catalogo_version no mira sucursal_propinas_config (da %)', catalogo_version();
  END IF;
  RAISE NOTICE 'c catalogo_version OK';
END $$;
ROLLBACK;
