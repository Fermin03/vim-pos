-- Smoke del giro RETAIL y las existencias por producto (spec 2026-10-15-giro-retail-design.md,
-- migraciones 0188 y 0189). Sobre la semilla de dev. ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_existencias_producto.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Valores nuevos.
DO $$
BEGIN
  IF NOT 'RETAIL' = ANY(enum_range(NULL::vertical_tipo)::text[]) THEN
    RAISE EXCEPTION '1a: falta RETAIL en vertical_tipo';
  END IF;
  IF NOT 'CAMBIO_TALLA' = ANY(enum_range(NULL::devolucion_motivo)::text[]) THEN
    RAISE EXCEPTION '1b: falta CAMBIO_TALLA en devolucion_motivo';
  END IF;
  RAISE NOTICE '1 valores nuevos OK';
END $$;

-- 2) Giro RETAIL y módulo existencias.
DO $$
DECLARE
  v_t  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_op jsonb;
  v_m  jsonb;
BEGIN
  IF juego_inicial_de_giro('RETAIL') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'::jsonb
  THEN RAISE EXCEPTION '2a: RETAIL: %', juego_inicial_de_giro('RETAIL'); END IF;

  -- Ningún giro de comida arranca con existencias, y sin giro (o ENTERPRISE) tampoco.
  IF (juego_inicial_de_giro('QUICK_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro('FULL_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro(NULL)->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2b: existencias solo debe arrancar encendido en RETAIL';
  END IF;

  -- El cliente existente queda con la llave apagada y modulos_efectivos la reporta.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_t;
  IF (v_op->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2c: el cliente existente debía tener existencias=false: %', v_op;
  END IF;
  v_m := modulos_efectivos(v_t);
  IF (v_m->'permitidos'->>'existencias')::boolean IS DISTINCT FROM true
     OR (v_m->'efectivos'->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2d: modulos_efectivos.existencias: %', v_m;
  END IF;
  -- Lo de antes sigue ahí.
  IF NOT (v_m->'efectivos' ?& ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','kds','mostrador','cuentas_barra']) THEN
    RAISE EXCEPTION '2e: modulos_efectivos perdió llaves: %', v_m;
  END IF;

  -- VIM lo enciende (como cualquier módulo de operación) y se refleja.
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  IF (modulos_efectivos(v_t)->'efectivos'->>'existencias')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '2f: encender existencias no se reflejó';
  END IF;

  -- Nadie pasa a RETAIL todavía.
  BEGIN
    PERFORM cambiar_giro(v_t, 'RETAIL', true);
    RAISE EXCEPTION '2g: cambiar_giro debía rechazar RETAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '2 giro RETAIL y módulo existencias OK';
END $$;

ROLLBACK;
