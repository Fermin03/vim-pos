-- ============================================================================
-- 0071 — El QR de facturación del ticket se vuelve opcional.
--
-- El ticket imprimía SIEMPRE "¿Necesitas factura? Escanea el código" con un QR al portal de
-- autofacturación. Ese portal todavía no existe, así que el cliente que lo escaneaba se topaba
-- con un error: el ticket prometía algo que el negocio no podía cumplir. Y no se podía apagar
-- sin tocar código.
--
-- POR DEFECTO EN false, no en true. Un negocio que aún no tiene su CSD cargado ni PAC
-- contratado —el caso de hoy— no debe imprimir la promesa. Que encenderlo sea un acto
-- deliberado del dueño, y no algo que hereda sin enterarse.
--
-- Vive en `configuracion_tenant` y no en `tenants` porque ahí están los demás ajustes de ticket
-- (`pie_ticket`, `mostrar_nota_producto_ticket`) y esa tabla ya viaja completa en el snapshot de
-- sync (mig. 0055), así que la caja lo respeta también sin internet. Ojo: hoy la mayoría de los
-- tenants NO tienen fila en esa tabla, así que quien lea el ajuste debe tratar "sin fila" como
-- apagado — que es justo el valor seguro.
--
-- Migración ADITIVA e idempotente.
-- ============================================================================

ALTER TABLE public.configuracion_tenant
  ADD COLUMN IF NOT EXISTS mostrar_qr_factura_ticket boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.configuracion_tenant.mostrar_qr_factura_ticket IS
  'Imprimir el QR de autofacturación en el ticket del cliente. false = no se imprime (valor seguro mientras no haya portal ni CSD).';
