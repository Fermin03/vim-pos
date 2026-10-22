-- Belleza, entrega 1: giros de belleza nuevos (diseño 2026-10-18).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0217. Va en el instalador antes de usarse.
--
-- Ningún negocio recibe estos giros hasta que esta migración viaje en un instalador que tengan todas
-- las cajas: la caja baja las filas completas de `tenants` y un valor que no conoce tumba su pull
-- entero (ADR 0034). Por eso cambiar_giro responde GIRO_NO_DISPONIBLE para ellos (0217).
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'SALON';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'SPA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'PELUQUERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'BARBERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'TATUAJES';
