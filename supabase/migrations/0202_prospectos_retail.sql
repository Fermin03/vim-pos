-- 0202: el formulario de demo ya puede mandar RETAIL (giro Tienda de ropa o calzado, ADR 0037).
-- Mismos valores que la 0182 más RETAIL; los viejos se quedan por el formulario en caché.
ALTER TABLE prospectos DROP CONSTRAINT IF EXISTS prospectos_giro_check;
ALTER TABLE prospectos ADD CONSTRAINT prospectos_giro_check CHECK (giro IS NULL OR giro IN
  ('FOODTRUCK','QUICK_SERVICE','FULL_SERVICE','CAFE_BAR','DARK_KITCHEN','ENTERPRISE','BAR','CAFETERIA','TAQUERIA','RETAIL'));
