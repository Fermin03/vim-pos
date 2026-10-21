-- Giros nuevos (spec 2026-10-14-giros-y-modulos-de-operacion-design.md §6.1, ADR 0034).
--
-- Este archivo trae SOLO los ADD VALUE. Postgres no deja usar un valor nuevo de un enum en la
-- misma transacción en que se agrega, y la caja aplica cada archivo de migraciones como una sola
-- consulta (desktop/src/runtime.mjs). Los valores se usan a partir de la 0180.
--
-- CAFE_BAR y ENTERPRISE se quedan en el tipo (quitar un valor de un enum exige recrearlo), pero
-- ya no se ofrecen: CAFE_BAR se separa en BAR y CAFETERIA, y ENTERPRISE pasó a ser el plan Cadena.
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'BAR';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'CAFETERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'TAQUERIA';
