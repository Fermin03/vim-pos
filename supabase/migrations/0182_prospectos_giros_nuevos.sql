-- 0182: el formulario de demo del sitio ya puede mandar los giros nuevos (ADR 0034). La lista de
-- 0084 solo traía los seis viejos y rechazaba el insert de BAR, CAFETERIA y TAQUERIA. Los viejos
-- se quedan: el formulario en caché y los prospectos ya guardados los siguen usando.
ALTER TABLE prospectos DROP CONSTRAINT IF EXISTS prospectos_giro_check;
ALTER TABLE prospectos ADD CONSTRAINT prospectos_giro_check CHECK (giro IS NULL OR giro IN
  ('FOODTRUCK','QUICK_SERVICE','FULL_SERVICE','CAFE_BAR','DARK_KITCHEN','ENTERPRISE','BAR','CAFETERIA','TAQUERIA'));
