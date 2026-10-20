-- Libera SALON, SPA, PELUQUERIA, BARBERIA y TATUAJES en cambiar_giro (belleza, entrega 4, ADR 0038).
-- BAR, CAFETERIA y TAQUERIA siguen bloqueados.
-- En el lanzamiento va DESPUÉS de publicar el instalador con 0216–0230 (molde: la 0215):
-- una caja sin la 0216 no conoce estos valores y su pull de `tenants` fallaría.

-- Cuerpo de la 0217 sin los cinco giros de belleza en la lista de no disponibles.
CREATE OR REPLACE FUNCTION cambiar_giro(p_tenant uuid, p_giro vertical_tipo, p_reaplicar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes    jsonb;
  v_nuevo    jsonb;
  v_abiertas jsonb;
  v_avisos   text[] := '{}';
BEGIN
  IF p_giro IS NULL OR p_giro::text IN ('CAFE_BAR', 'ENTERPRISE') THEN
    RAISE EXCEPTION 'GIRO_RETIRADO: %', p_giro USING ERRCODE = '22023';
  END IF;
  -- La caja baja la fila completa de `tenants`; una caja sin la 0179 no conoce estos valores y
  -- su pull entero fallaría. Se liberan con una migración cuando todas las cajas la tengan (ADR 0034).
  IF p_giro::text IN ('BAR', 'CAFETERIA', 'TAQUERIA') THEN
    RAISE EXCEPTION 'GIRO_NO_DISPONIBLE: %', p_giro USING ERRCODE = '22023';
  END IF;
  SELECT operacion INTO v_antes FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;

  UPDATE tenants SET vertical_principal = p_giro WHERE id = p_tenant;
  IF NOT COALESCE(p_reaplicar, false) THEN
    RETURN jsonb_build_object('operacion', v_antes, 'avisos', '[]'::jsonb);
  END IF;

  v_nuevo    := juego_inicial_de_giro(p_giro);
  v_abiertas := operacion_cuentas_abiertas(p_tenant);
  IF (v_antes->>'comedor')::boolean AND NOT (v_nuevo->>'comedor')::boolean
     AND (v_abiertas->>'comedor')::int > 0 THEN
    v_nuevo  := v_nuevo || jsonb_build_object('comedor', true, 'meseros', v_antes->'meseros');
    v_avisos := v_avisos || format('El comedor sigue encendido porque tiene %s cuentas abiertas.', v_abiertas->>'comedor');
  END IF;
  IF (v_antes->>'cuentas_barra')::boolean AND NOT (v_nuevo->>'cuentas_barra')::boolean
     AND (v_abiertas->>'cuentas_barra')::int > 0 THEN
    v_nuevo  := v_nuevo || '{"cuentas_barra":true}'::jsonb;
    v_avisos := v_avisos || format('Las cuentas en barra siguen encendidas porque hay %s abiertas.', v_abiertas->>'cuentas_barra');
  END IF;

  UPDATE tenants SET operacion = v_nuevo WHERE id = p_tenant RETURNING operacion INTO v_nuevo;
  RETURN jsonb_build_object('operacion', v_nuevo, 'avisos', to_jsonb(v_avisos));
END;
$$;

REVOKE ALL ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) TO service_role;
