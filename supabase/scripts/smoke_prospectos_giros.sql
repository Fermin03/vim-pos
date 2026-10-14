-- Smoke del giro de prospectos (migración 0182, ADR 0034): el formulario del sitio ya puede mandar
-- BAR, CAFETERIA y TAQUERIA; los giros viejos siguen valiendo y un valor ajeno se sigue rechazando. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE g text;
BEGIN
  FOREACH g IN ARRAY ARRAY['BAR','CAFETERIA','TAQUERIA','CAFE_BAR','ENTERPRISE','FOODTRUCK'] LOOP
    INSERT INTO prospectos (nombre, whatsapp, negocio, cajas, sucursales, giro)
    VALUES ('Prueba Giro', '4771234567', 'Negocio ' || g, 1, 1, g);
  END LOOP;
  INSERT INTO prospectos (nombre, whatsapp, negocio, cajas, sucursales, giro)
  VALUES ('Prueba Giro', '4771234567', 'Sin giro', 1, 1, NULL);
  RAISE NOTICE '1 giros nuevos, viejos y NULL aceptados OK';

  BEGIN
    INSERT INTO prospectos (nombre, whatsapp, negocio, cajas, sucursales, giro)
    VALUES ('Prueba Giro', '4771234567', 'Ajeno', 1, 1, 'SUPERMERCADO');
    RAISE EXCEPTION '2: SUPERMERCADO debió rechazarse';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '2 giro ajeno rechazado OK';
  END;
END $$;

ROLLBACK;
