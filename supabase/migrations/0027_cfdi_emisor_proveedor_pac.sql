-- F8 — tenant_cfdi_emisor (0009) guardaba RFC + facturama_issuer_ref + estado, pero no el
-- proveedor PAC elegido por el tenant. Se agrega proveedor_pac (default FACTURAPI) para que
-- el admin lo configure desde el panel (P-018) y el timbrado sepa a qué PAC dirigirse.
-- Reusa el enum cfdi_proveedor_pac ya existente.

ALTER TABLE tenant_cfdi_emisor
  ADD COLUMN IF NOT EXISTS proveedor_pac cfdi_proveedor_pac NOT NULL DEFAULT 'FACTURAPI';

COMMENT ON COLUMN tenant_cfdi_emisor.proveedor_pac IS
  'PAC por defecto del tenant para timbrar. F8.';
