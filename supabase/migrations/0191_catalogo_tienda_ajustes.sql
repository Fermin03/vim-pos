-- Ajustes al catálogo de tienda (0190) tras la revisión de la entrega 2 del giro RETAIL.
-- §1 borrar un padre borra sus variantes · §2 código interno sin recorrer el catálogo ·
-- §3 tiempo del importador · §4 permisos de las funciones auxiliares.

-- ── §1 Borrar un padre borra sus variantes vivas ─────────────────────────────
-- Sin esto las hijas quedaban vivas, sin padre visible, con su SKU y su código ocupados: reimportar
-- la prenda creaba un padre nuevo y chocaba con «el SKU ya es de otro producto». En la caja el
-- pull corre en réplica y esto no corre: la nube ya mandó las hijas borradas.
CREATE OR REPLACE FUNCTION productos_borrar_variantes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE productos SET deleted_at = NEW.deleted_at, updated_at = now()
   WHERE producto_padre_id = NEW.id AND deleted_at IS NULL;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_borrar_variantes ON productos;
CREATE TRIGGER trg_productos_borrar_variantes
  AFTER UPDATE OF deleted_at ON productos
  FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.variante_ejes IS NOT NULL)
  EXECUTE FUNCTION productos_borrar_variantes();

-- ── §2 Siguiente código interno ──────────────────────────────────────────────
-- 0190 buscaba el mayor código 20… de todo el catálogo en CADA llamada; importar 3,000 renglones
-- era recorrer el catálogo 3,000 veces. Ahora solo se busca cuando el negocio aún no tiene contador.
-- El contador nunca retrocede, así que un código entregado no se vuelve a entregar; uno tecleado a
-- mano por delante del contador se salta (la búsqueda va por el índice único de 0189).
CREATE OR REPLACE FUNCTION _siguiente_codigo_interno(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n    bigint;
  v_cod  text;
BEGIN
  LOOP
    UPDATE codigos_internos_contador SET ultimo = ultimo + 1 WHERE tenant_id = p_tenant RETURNING ultimo INTO v_n;
    IF NOT FOUND THEN
      INSERT INTO codigos_internos_contador AS c (tenant_id, ultimo)
      VALUES (p_tenant, COALESCE((SELECT max(substr(codigo_barras, 3, 10)::bigint) FROM productos
                                   WHERE tenant_id = p_tenant AND codigo_barras ~ '^20[0-9]{11}$'), 0) + 1)
      ON CONFLICT (tenant_id) DO UPDATE SET ultimo = GREATEST(c.ultimo + 1, EXCLUDED.ultimo)
      RETURNING ultimo INTO v_n;
    END IF;
    v_cod := '20' || lpad(v_n::text, 10, '0');
    v_cod := v_cod || ean13_digito(v_cod);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM productos WHERE tenant_id = p_tenant AND codigo_barras = v_cod
                            AND deleted_at IS NULL AND controla_existencias);
  END LOOP;
  RETURN v_cod;
END;
$$;
REVOKE ALL ON FUNCTION _siguiente_codigo_interno(uuid) FROM PUBLIC, anon, authenticated;

-- ── §3 Importador ────────────────────────────────────────────────────────────
-- 3,000 renglones (500 prendas × 6 variantes) tardan ~10 s en el Docker local: casi todo es el costo
-- fijo de los triggers de cada producto nuevo (menús, sucursales). PostgREST (v12+) aplica el
-- statement_timeout de la función a la transacción de la llamada; sin esto mandaría el de
-- authenticated (8 s). Ojo: dentro de Postgres un SET de función NO alarga el timeout de la
-- sentencia que ya corre; esto solo sirve llamando por PostgREST.
ALTER FUNCTION importar_catalogo_tienda(jsonb, uuid) SET statement_timeout = '60s';
-- El padre se busca por nombre en cada renglón; sin índice era recorrer el catálogo cada vez.
CREATE INDEX IF NOT EXISTS idx_productos_padre_por_nombre ON productos (tenant_id, lower(btrim(nombre)))
  WHERE variante_ejes IS NOT NULL AND deleted_at IS NULL;

-- ── §4 Permisos de las auxiliares ────────────────────────────────────────────
-- Supabase da EXECUTE a anon y authenticated en cada función nueva de public. _nombre_variante la
-- usa el trigger de herencia, que corre como quien edita el producto (authenticated); las otras
-- dos solo las llaman funciones SECURITY DEFINER.
REVOKE ALL ON FUNCTION _nombre_variante(text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _nombre_variante(text, text[], jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION ean13_digito(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ean13_digito(text) TO service_role;
REVOKE ALL ON FUNCTION _mensaje_unico_producto(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _mensaje_unico_producto(text) TO service_role;
