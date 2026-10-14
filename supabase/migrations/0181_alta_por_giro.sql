-- El alta aplica el juego del giro, y los negocios que ya existían ven exactamente lo de antes
-- (spec 2026-10-14-giros-y-modulos-de-operacion-design.md §6.3, ADR 0034; entrega 2).
--
-- Va junto con las pantallas que obedecen los módulos: aplicar el juego antes habría hecho que un
-- negocio registrado en el hueco perdiera pantallas de golpe. La política de cobro NO se fija:
-- la caja decide por tipo de cuenta (mesa al final, mostrador al pedir), decisión de Fermín 14 oct.

-- Antes de la 0180 el bloque de evento solo salía a FOODTRUCK (abrir-turno.tsx). La 0180 dejó
-- `eventos` encendido para todos; aquí se apaga a los demás para que ninguna caja cambie. El
-- default cambia también: un negocio que no nace por el alta (semilla, scripts) ve lo de siempre.
ALTER TABLE tenants ALTER COLUMN operacion SET DEFAULT (juego_inicial_de_giro(NULL) || '{"eventos":false}'::jsonb);
UPDATE tenants SET operacion = operacion || '{"eventos":false}'::jsonb
 WHERE vertical_principal::text <> 'FOODTRUCK';

-- Cuerpo de la 0141 más el bloque marcado 0181.
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_estado           tenant_estado,
  p_notas_internas   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_plan   uuid;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Unidades de medida (0085). */
  PERFORM sembrar_unidades_base(v_tenant);

  /* Lo que el plan incluye (0086 → 0141). En el alta no hay nada que retirar. */
  SELECT id INTO v_plan FROM planes WHERE codigo = p_plan_codigo;
  IF v_plan IS NOT NULL THEN
    PERFORM public._sincronizar_addons_del_plan(v_tenant, v_plan, false);
  END IF;

  /* 0181: los módulos de operación con que arranca su giro. */
  UPDATE tenants SET operacion = juego_inicial_de_giro(p_vertical) WHERE id = v_tenant;

  RETURN v_tenant;
END;
$$;
COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base, siembra unidades de medida (0085), los add-ons que el plan incluye (0086, 0141) y los módulos de operación de su giro (0181).';
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;
