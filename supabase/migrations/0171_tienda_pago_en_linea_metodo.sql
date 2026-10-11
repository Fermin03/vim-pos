-- ============================================================================
-- 0171 — Pago en línea de la tienda: el método de pago nuevo.
-- Diseño: docs/integraciones/mercado-pago-checkout-pro/02-diseno.md
--
-- Va SOLO en su archivo a propósito: un valor recién añadido a un enum no se puede usar en la misma
-- transacción que lo añade, y tanto la nube como la caja aplican cada archivo de migración en una
-- sola transacción (desktop/src/runtime.mjs manda el archivo entero en un query). Lo que lo usa
-- llega en la 0172.
-- ============================================================================
ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'PAGO_EN_LINEA';
