-- Smoke giros y módulos de operación (spec 2026-10-14-giros-y-modulos-de-operacion-design.md,
-- migraciones 0179 y 0180). Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los giros nuevos existen en el tipo.
DO $$
BEGIN
  IF NOT ('BAR' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'CAFETERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'TAQUERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])) THEN
    RAISE EXCEPTION '1: faltan giros en vertical_tipo: %', enum_range(NULL::vertical_tipo);
  END IF;
  RAISE NOTICE '1 giros nuevos OK';
END $$;

-- 2) Juego inicial por giro (tabla §5 del spec), cliente existente intacto, dependencias.
DO $$
DECLARE
  v_todo jsonb := '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}';
  v_op   jsonb;
BEGIN
  IF juego_inicial_de_giro('QUICK_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: QUICK_SERVICE: %', juego_inicial_de_giro('QUICK_SERVICE'); END IF;
  IF juego_inicial_de_giro('FULL_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FULL_SERVICE: %', juego_inicial_de_giro('FULL_SERVICE'); END IF;
  IF juego_inicial_de_giro('FOODTRUCK') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FOODTRUCK: %', juego_inicial_de_giro('FOODTRUCK'); END IF;
  IF juego_inicial_de_giro('DARK_KITCHEN') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: DARK_KITCHEN: %', juego_inicial_de_giro('DARK_KITCHEN'); END IF;
  IF juego_inicial_de_giro('BAR') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'::jsonb
  THEN RAISE EXCEPTION '2a: BAR: %', juego_inicial_de_giro('BAR'); END IF;
  IF juego_inicial_de_giro('CAFETERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: CAFETERIA: %', juego_inicial_de_giro('CAFETERIA'); END IF;
  IF juego_inicial_de_giro('TAQUERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: TAQUERIA: %', juego_inicial_de_giro('TAQUERIA'); END IF;
  IF juego_inicial_de_giro('ENTERPRISE') IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: ENTERPRISE debía ser todo encendido'; END IF;
  IF juego_inicial_de_giro(NULL) IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: NULL debía ser todo encendido'; END IF;
  RAISE NOTICE '2a juego inicial de los 7 giros OK';

  IF cobro_inicial_de_giro('FULL_SERVICE') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('TAQUERIA') <> 'COCINA_PRIMERO'
     OR cobro_inicial_de_giro('BAR') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('QUICK_SERVICE') <> 'COBRO_PRIMERO'
     OR cobro_inicial_de_giro('CAFETERIA') <> 'COBRO_PRIMERO' OR cobro_inicial_de_giro(NULL) <> 'COBRO_PRIMERO' THEN
    RAISE EXCEPTION '2b: cobro inicial por giro mal';
  END IF;
  RAISE NOTICE '2b cobro inicial OK';

  -- Cliente existente (semilla): todo encendido sin que nadie lo toque.
  SELECT operacion INTO v_op FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa';
  IF v_op IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2c: el cliente existente debía quedar todo encendido: %', v_op; END IF;
  RAISE NOTICE '2c cliente existente intacto OK';

  -- El disparador completa llaves y corrige dependencias; nunca rechaza un valor válido.
  UPDATE tenants SET operacion = '{"comedor":false,"domicilio":false}'
   WHERE id = '99999999-0000-0000-0000-0000000000aa' RETURNING operacion INTO v_op;
  IF (v_op->>'meseros')::boolean OR (v_op->>'repartidores')::boolean THEN
    RAISE EXCEPTION '2d: sin comedor/domicilio debían apagarse meseros/repartidores: %', v_op;
  END IF;
  IF NOT (v_op->>'kds')::boolean OR NOT (v_op ? 'cuentas_barra') THEN
    RAISE EXCEPTION '2d: las llaves que faltan debían completarse encendidas: %', v_op;
  END IF;
  BEGIN
    UPDATE tenants SET operacion = '{"inventado":true}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó una llave desconocida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE tenants SET operacion = '{"comedor":"true"}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó un texto como booleano';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE tenants SET operacion = v_todo WHERE id = '99999999-0000-0000-0000-0000000000aa';
  RAISE NOTICE '2d-2e disparador OK';
END $$;

ROLLBACK;
