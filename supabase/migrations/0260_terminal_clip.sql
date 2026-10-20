-- ============================================================================
-- 0260 · La base admite Clip PinPad como segundo proveedor de terminal (junto a Mercado Pago).
--
-- Solo DDL: corre también en el Postgres de la caja, que no tiene Vault.
--
-- Tokens de Clip: `terminal_guardar_tokens` guarda la API key como `access` y la clave secreta como
-- `refresh`, con `vence` NULL (no caducan). La renovación diaria filtra por MERCADO_PAGO y un
-- `vence_at` NULL nunca entra, así que Clip no se renueva ni se toca.
-- ============================================================================

ALTER TABLE terminal_conexiones DROP CONSTRAINT terminal_conexion_proveedor_valido;
ALTER TABLE terminal_conexiones ADD CONSTRAINT terminal_conexion_proveedor_valido
  CHECK (proveedor IN ('MERCADO_PAGO', 'CLIP'));

-- Coordenadas: la 0170 ya quitó latitud/longitud de esta tabla (viven en sucursales.geo_lat/geo_lng,
-- NULL), así que Clip, que no las pide, no necesita cambio aquí.

-- Porcentajes de propina que ofrecerá el lector (de 1 a 3, entre 1 y 100). NULL = sin propina.
ALTER TABLE terminal_config_sucursal ADD COLUMN propina_opciones smallint[] NULL;
ALTER TABLE terminal_config_sucursal ADD CONSTRAINT terminal_config_propina_opciones_validas CHECK (
  propina_opciones IS NULL OR (
    cardinality(propina_opciones) BETWEEN 1 AND 3
    AND 1 <= ALL (propina_opciones) AND 100 >= ALL (propina_opciones)
  ));

-- Clip identifica la terminal por número de serie: no hay «pos» de Mercado Pago.
ALTER TABLE terminal_dispositivos ALTER COLUMN caja_id_externo DROP NOT NULL;

-- Propina que el lector cobró aparte (NULL = el proveedor no la manda por separado).
ALTER TABLE terminal_cobros ADD COLUMN propina_mxn numeric(12,2) NULL;
