-- 0109 — catalogo_version(): "¿cambió el menú?" en una sola lectura barata.
--
-- El problema: la caja de escritorio bajaba el catálogo 1 de cada 6 ciclos (≈1 h, ver
-- desktop/src/sync-ciclo.mjs). Un producto dado de alta en /admin no aparecía en la caja hasta
-- esa hora o hasta reiniciar la aplicación, y el dueño lo vivía como que "el POS no se entera".
--
-- La caja no puede recibir avisos: vive detrás del NAT del restaurante. Así que pregunta. Para
-- que preguntar cada minuto sea barato, esto devuelve UN timestamp: si no cambió desde la última
-- vez, la caja no hace nada; si cambió, dispara el PULL en el acto.
--
-- Por qué una RPC de PostgREST y no una Edge Function: PostgREST no cobra por invocación ni tiene
-- arranque en frío. A ~400 cajas preguntando cada 60 s son ~7 lecturas por segundo contra un
-- índice, que es ruido. La misma cadencia contra una Edge Function serían ~576 000 invocaciones
-- diarias, y eso sí se paga.
--
-- SECURITY INVOKER a propósito (regla dura #1): NO es SECURITY DEFINER y no toca service_role.
-- La RLS de cada tabla ya filtra por current_tenant_id(), así que la función no necesita —ni
-- puede— saber de qué tenant se le habla. Un dispositivo solo puede medir su propio menú.

-- ── Índices para que la pregunta sea de verdad barata ───────────────────────
-- Los índices que ya existían son PARCIALES (`WHERE deleted_at IS NULL`) y aquí NO sirven: la
-- consulta no puede filtrar por deleted_at, porque BORRAR un producto también es un cambio que
-- la caja tiene que notar. Sin estos, cada sondeo sería un seq scan de la tabla de TODOS los
-- tenants — exactamente lo que no queremos a razón de uno por minuto por caja.
CREATE INDEX IF NOT EXISTS idx_categorias_version
  ON categorias (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_productos_version
  ON productos (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_grupos_mod_version
  ON grupos_modificadores (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_opciones_mod_version
  ON opciones_modificador (tenant_id, updated_at DESC);
-- productos_grupos_modificadores es la única sin updated_at: es una tabla puente y sus filas se
-- insertan y se borran, no se editan.
CREATE INDEX IF NOT EXISTS idx_prod_grupos_version
  ON productos_grupos_modificadores (tenant_id, created_at DESC);

-- ── La función ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- GREATEST ignora los NULL, así que un tenant sin modificadores (o sin nada todavía) devuelve
  -- el máximo de lo que sí tenga, y NULL solo si no tiene absolutamente nada. La caja trata el
  -- NULL como "no hay novedad", que es lo correcto: no hay menú que bajar.
  --
  -- Sin filtro de deleted_at: el borrado suave es un UPDATE que mueve updated_at, y esa es
  -- justamente la señal de que la caja debe dejar de mostrar el producto.
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores)
  );
$$;

COMMENT ON FUNCTION catalogo_version() IS
  'Último cambio del menú del tenant que llama (RLS). La caja lo sondea cada minuto para saber si le toca bajar el catálogo.';

-- La ejecuta cualquier sesión autenticada: el DISPOSITIVO de la caja (que es quien sondea) y el
-- empleado. No hace falta dársela a anon: sin claim de tenant, la RLS no dejaría ver nada de
-- todos modos, pero mejor que ni siquiera pueda preguntar.
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;
