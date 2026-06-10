-- 0048 — fix B2: apps_liquidacion_items tiene un trigger set_updated_at pero la tabla
-- NO tiene columna updated_at (solo created_at) → cualquier UPDATE fallaba con
-- 'record "new" has no field "updated_at"', rompiendo la persistencia del match
-- de conciliación. Se elimina el trigger (el nombre 'unused_trigger' delata el descuido).

DROP TRIGGER IF EXISTS trg_apps_liq_items_unused_trigger ON apps_liquidacion_items;
