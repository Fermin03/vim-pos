-- 0229: el formulario de demo ya puede mandar SALON, SPA, PELUQUERIA, BARBERIA y TATUAJES (belleza, ADR 0038).
-- Mismos valores que la 0214 más los cinco; los viejos se quedan por el formulario en caché.
ALTER TABLE prospectos DROP CONSTRAINT IF EXISTS prospectos_giro_check;
ALTER TABLE prospectos ADD CONSTRAINT prospectos_giro_check CHECK (giro IS NULL OR giro IN
  ('FOODTRUCK','QUICK_SERVICE','FULL_SERVICE','CAFE_BAR','DARK_KITCHEN','ENTERPRISE','BAR','CAFETERIA','TAQUERIA','RETAIL',
   'ABARROTES','FRUTERIA','FERRETERIA','VINOS',
   'SALON','SPA','PELUQUERIA','BARBERIA','TATUAJES'));
