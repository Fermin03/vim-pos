-- ============================================================================
-- 0080 — FACTURAMA entra al catálogo de PAC.
--
-- El enum `cfdi_proveedor_pac` (0009) lista FACTURAPI, SOLUCIONFACTIBLE, FINKOK, EDICOM, PRODIGIA y
-- OTRO. Facturama no está, aunque es el PAC que el proyecto eligió y el que la propia base asumía
-- desde el principio: la columna `tenant_cfdi_emisor.facturama_issuer_ref` se llama así porque el
-- diseño original ya apuntaba ahí.
--
-- POR QUÉ FACTURAMA Y NO FACTURAPI
--
-- Facturapi resuelve multi-tenant creando una organización por cliente, cada una con su propia API
-- key: N credenciales que custodiar y rotar. Peor, el emisor se deduce de la llave, así que con una
-- sola llave global —como está hoy— el CFDI de cualquier cliente saldría con NUESTRO RFC.
--
-- Facturama Multiemisor lleva el emisor EN EL PAYLOAD y encuentra el sello por su RFC. Una sola
-- credencial para todos los negocios. Verificado contra su sandbox el 24-ago-2026: dos CFDI desde la
-- misma cuenta, cada uno con su propio RFC y su propio UUID.
--
-- El valor por defecto de la columna sigue siendo FACTURAPI para no reescribir filas existentes; lo
-- que decide de verdad es qué credenciales tenga la función de timbrado en su entorno.
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE cfdi_proveedor_pac ADD VALUE IF NOT EXISTS 'FACTURAMA';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Periodicidad de la factura global, por negocio.
--
-- No es un adorno: decide HASTA CUÁNDO un cliente puede autofacturar su ticket. La regla del SAT no
-- es "el mes en curso" sino "hasta que se emita la global del periodo", y el periodo lo declara cada
-- contribuyente. Un negocio que factura global a diario deja de poder autofacturar el ticket de
-- ayer; uno mensual da todo el mes.
--
-- Valores del catálogo c_Periodicidad del Anexo 20: 01 diario, 02 semanal, 03 quincenal,
-- 04 mensual, 05 bimestral. Se guarda el código tal cual porque es lo que viaja al PAC en el nodo
-- GlobalInformation, sin traducciones de por medio.
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_cfdi_emisor
  ADD COLUMN IF NOT EXISTS periodicidad_global varchar(2) NOT NULL DEFAULT '04';

DO $$ BEGIN
  ALTER TABLE tenant_cfdi_emisor
    ADD CONSTRAINT periodicidad_global_valida
    CHECK (periodicidad_global IN ('01', '02', '03', '04', '05'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN tenant_cfdi_emisor.periodicidad_global IS
  'c_Periodicidad del SAT. Define hasta cuándo se puede autofacturar un ticket: hasta que se emita la global de su periodo.';

-- Estado del sello, para avisar antes de que reviente.
--
-- El .key y su contraseña NO se guardan aquí ni en ninguna otra parte: viajan a Facturama y se
-- descartan. Esto es solo lo necesario para saber si el negocio puede timbrar y para avisar antes
-- de que el certificado caduque.
ALTER TABLE tenant_cfdi_emisor
  ADD COLUMN IF NOT EXISTS csd_subido_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS csd_numero_certificado varchar(20) NULL;

COMMENT ON COLUMN tenant_cfdi_emisor.csd_subido_at IS
  'Cuándo se cargó el CSD a la cuenta del PAC. El .key y su contraseña no se almacenan.';

-- ---------------------------------------------------------------------------
-- Logo para el PDF de la factura.
--
-- Facturama pone el logo en el PDF con el campo LogoUrl de cada petición, pero RECHAZA SVG:
-- "la imagen debe ser jpg, jpeg o png". El logotipo maestro del producto es SVG y `tenants.logo_url`
-- puede serlo, así que hace falta una columna aparte con una versión rasterizada.
--
-- Separada y no reutilizando `logo_url` porque son dos cosas con reglas distintas: una alimenta la
-- pantalla y el ticket, donde el SVG es mejor; la otra tiene que ser PNG o JPG por exigencia del PAC.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_png_url text NULL;

COMMENT ON COLUMN tenants.logo_png_url IS
  'Logo en PNG/JPG para el PDF del CFDI (LogoUrl de Facturama, que no acepta SVG). Distinto de logo_url.';
