-- Retail 2, entrega 1: giros de tienda nuevos y venta por metro (diseño 2026-10-18).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0206.
--
-- Ningún negocio recibe estos giros ni un producto LONGITUD hasta que esta migración viaje en un
-- instalador que tengan todas las cajas: la caja baja las filas completas de `tenants` y `productos`
-- y un valor que no conoce tumba su pull entero (ADR 0034). Por eso cambiar_giro responde
-- GIRO_NO_DISPONIBLE para ellos (0206).
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'ABARROTES';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'FRUTERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'FERRETERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'VINOS';

-- Venta por metro (cable, cadena, manguera). PESO y VOLUMEN ya existían (0007).
ALTER TYPE producto_tipo_venta ADD VALUE IF NOT EXISTS 'LONGITUD';
