-- Smoke belleza, entrega 1 (migraciones 0216 y 0217): giros, juego inicial con «agenda» y bloqueo
-- en cambiar_giro. Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  g text;
  v_op jsonb;
  v_belleza jsonb := '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true,"agenda":true}';
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
BEGIN
  FOREACH g IN ARRAY ARRAY['SALON','SPA','PELUQUERIA','BARBERIA','TATUAJES'] LOOP
    IF juego_inicial_de_giro(g::vertical_tipo) IS DISTINCT FROM v_belleza THEN
      RAISE EXCEPTION '1: juego de % incorrecto: %', g, juego_inicial_de_giro(g::vertical_tipo);
    END IF;
    IF NOT es_giro_belleza(g::vertical_tipo) THEN RAISE EXCEPTION '1: % no es belleza', g; END IF;
    BEGIN
      PERFORM cambiar_giro(v_tenant, g::vertical_tipo, false);
      RAISE EXCEPTION '1: cambiar_giro aceptó %', g;
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH g IN ARRAY ARRAY['QUICK_SERVICE','FULL_SERVICE','RETAIL','VINOS','BAR'] LOOP
    IF (juego_inicial_de_giro(g::vertical_tipo)->>'agenda') IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION '2: % debe traer agenda false', g;
    END IF;
  END LOOP;
  IF (juego_inicial_de_giro(NULL)->>'agenda') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '2: el ELSE debe traer agenda false';
  END IF;
  IF es_giro_belleza('RETAIL') OR es_giro_belleza('QUICK_SERVICE') THEN
    RAISE EXCEPTION '3: es_giro_belleza acepta giros que no son';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE EXCEPTION '4: falta btree_gist';
  END IF;
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  IF NOT v_op ? 'agenda' THEN RAISE EXCEPTION '5: el negocio existente quedó sin llave agenda'; END IF;
  RAISE NOTICE 'belleza 1 OK';
END $$;

ROLLBACK;
