-- 0170 · Las coordenadas de la sucursal ya tenían sitio: sucursales.geo_lat / geo_lng (0003).
-- La 0169 las duplicó en terminal_config_sucursal por no haberlas visto. Se quitan antes de usarse.
ALTER TABLE terminal_config_sucursal
  DROP CONSTRAINT IF EXISTS terminal_config_coordenadas_validas,
  DROP COLUMN IF EXISTS latitud,
  DROP COLUMN IF EXISTS longitud;
