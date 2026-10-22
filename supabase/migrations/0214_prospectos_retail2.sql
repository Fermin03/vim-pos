-- 0214: el formulario de demo ya puede mandar ABARROTES, FRUTERIA, FERRETERIA y VINOS (retail 2, ADR 0037).
-- Mismos valores que la 0202 más los cuatro; los viejos se quedan por el formulario en caché.
ALTER TABLE prospectos DROP CONSTRAINT IF EXISTS prospectos_giro_check;
ALTER TABLE prospectos ADD CONSTRAINT prospectos_giro_check CHECK (giro IS NULL OR giro IN
  ('FOODTRUCK','QUICK_SERVICE','FULL_SERVICE','CAFE_BAR','DARK_KITCHEN','ENTERPRISE','BAR','CAFETERIA','TAQUERIA','RETAIL',
   'ABARROTES','FRUTERIA','FERRETERIA','VINOS'));
