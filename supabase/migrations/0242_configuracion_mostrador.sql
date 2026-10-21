-- 0242 · Configuración del mostrador de comida rápida (QUICK_SERVICE y FOODTRUCK).
-- Dos interruptores por negocio, junto a combo_upsell_activo. RLS y grants de la tabla ya cubren.
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS pedir_nombre_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_donde_comer boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.pedir_nombre_cliente IS 'Comida rápida: la caja pide el nombre del cliente al cobrar (va a tickets.nombre_cliente).';
COMMENT ON COLUMN configuracion_tenant.tiene_donde_comer IS 'Food truck: la caja pregunta "¿para llevar o para comer aquí?". Sin esto la venta es PARA_LLEVAR. QUICK_SERVICE siempre pregunta.';
