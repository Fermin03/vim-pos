-- Giro RETAIL (spec 2026-10-15-giro-retail-design.md §4.5, ADR 0037).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0189.
--
-- RETAIL no se asigna a ningún negocio hasta que esta migración viaje en un instalador que tengan
-- todas las cajas: la caja baja la fila completa de `tenants` y un valor que no conoce tumba su
-- pull entero (ADR 0034). Por eso cambiar_giro responde GIRO_NO_DISPONIBLE (0189 §1).
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'RETAIL';

-- Cambio de talla. "Defecto" y "no le gustó" ya existían: PRODUCTO_DEFECTUOSO y CLIENTE_NO_SATISFECHO.
ALTER TYPE devolucion_motivo ADD VALUE IF NOT EXISTS 'CAMBIO_TALLA';
