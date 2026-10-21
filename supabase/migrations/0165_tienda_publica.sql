-- ============================================================================
-- 0165 — Tienda en línea, entrega 5: lo que la tienda pública necesita de la base.
-- Plan: docs/superpowers/plans/2026-10-09-tienda-en-linea-5-publica.md (Task 1)
--
-- Dos cosas: el menú trae cada precio como se va a cobrar, y hay más direcciones reservadas.
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.*.
-- ============================================================================

-- ── §1 El precio final en el menú ────────────────────────────────────────────
-- Un producto con el IVA por fuera se enseñaba a su precio de lista y se cobraba con IVA: el precio
-- del menú no era el del carrito. El menú añade DOS campos y no cambia ninguno de los de siempre
-- (tienda_cotizar arma el menú por dentro y lee precio_mxn y precio_extra_mxn):
--   · producto:           precio_final_mxn       = lo que cotizar cobra por UNA unidad sin extras
--                                                  (en un combo, la base sin elecciones);
--   · opción (de grupo o de slot): precio_extra_final_mxn = el extra tal como entra al total.
-- La cuenta NO se repite aquí: es _tienda_con_iva (0162), la misma función que usa tienda_cotizar,
-- que por eso no se toca. De quién es el IVA también es lo que hace cotizar:
--   · el extra de un modificador lleva el IVA del producto que lo ofrece (también cuando ese
--     producto va de hijo en un combo: lo cobra el renglón del hijo);
--   · el extra de una elección de slot lleva el IVA del COMBO: entra al precio del padre.
-- Redondeo: el ticket redondea el IVA por renglón, sobre el importe del renglón entero. Estos
-- campos son exactos para una unidad sola; n × precio_final, o precio_final + extra_final, pueden
-- diferir un centavo de la cotización. El total que manda es el de tienda_cotizar.

-- Cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql. Un cambio: cada opción trae además
-- precio_extra_final_mxn.
-- ponytail: _tienda_con_iva vuelve a leer el producto por cada opción (una búsqueda por llave).
-- Sobra para una carta normal; si un día pesa, leer tasa e «incluido» una vez por producto.
CREATE OR REPLACE FUNCTION _tienda_grupos_de(p_producto uuid, p_tenant uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'nombre', g.nombre,
           'tipo_seleccion', g.tipo_seleccion,
           'minimo', CASE g.tipo_seleccion
                       WHEN 'UNICA_OBLIGATORIA' THEN 1
                       WHEN 'UNICA_OPCIONAL'    THEN 0
                       ELSE COALESCE(g.minimo_selecciones, 0) END,
           'maximo', CASE WHEN g.tipo_seleccion IN ('UNICA_OBLIGATORIA', 'UNICA_OPCIONAL') THEN 1
                          ELSE g.maximo_selecciones END,
           'opciones', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', o.id,
                      'nombre', o.nombre,
                      'precio_extra_mxn', to_char(o.precio_extra_mxn, 'FM999999990.00'),
                      'precio_extra_final_mxn', to_char(_tienda_con_iva(o.precio_extra_mxn, p_producto, p_tenant), 'FM999999990.00'),
                      'agotada', o.agotada,
                      'es_default', o.es_default)
                    ORDER BY o.orden_visualizacion, o.nombre)
               FROM opciones_modificador o
              WHERE o.grupo_id = g.id AND o.tenant_id = p_tenant
                AND o.activa AND o.deleted_at IS NULL AND o.precio_extra_mxn >= 0),
             '[]'::jsonb))
         ORDER BY pg.orden_visualizacion, g.nombre), '[]'::jsonb)
    FROM productos_grupos_modificadores pg
    JOIN grupos_modificadores g ON g.id = pg.grupo_id
   WHERE pg.producto_id = p_producto AND pg.tenant_id = p_tenant
     AND g.tenant_id = p_tenant AND g.activo AND g.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION _tienda_grupos_de(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql. Dos cambios: cada producto trae además
-- precio_final_mxn y cada opción de slot, precio_extra_final_mxn.
-- El menú de una sucursal: {categorias: [{id, nombre, productos: [{…, grupos, slots}]}]}.
-- Todos los importes son texto con dos decimales; minimo/maximo son los únicos números.
CREATE OR REPLACE FUNCTION tienda_menu(p_tenant uuid, p_sucursal uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categorias jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;

  WITH
  -- Lo que la caja enseña en esta sucursal, sea renglón del menú u opción de un slot. `agotado`:
  -- lo está en la sucursal, o un grupo obligatorio se quedó sin ninguna opción que se pueda pedir.
  vendibles AS (
    SELECT p.id, p.categoria_id, p.nombre, p.descripcion, p.imagen_url, p.es_combo, p.orden_visualizacion,
           precio_producto_en_sucursal(p.id, p_sucursal) AS precio,
           g.grupos,
           m.motivo IS NOT NULL   -- el WHERE solo deja pasar NULL o 'AGOTADO'
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(g.grupos) gr
                         WHERE (gr ->> 'minimo')::integer >= 1
                           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(gr -> 'opciones') op
                                            WHERE NOT (op ->> 'agotada')::boolean)) AS agotado
      FROM productos p
     CROSS JOIN LATERAL (SELECT motivo_no_disponible_en_sucursal(p.id, p_sucursal) AS motivo) m
     -- Un combo no lleva modificadores en su línea: agregar_combo_a_ticket los rechaza.
     CROSS JOIN LATERAL (SELECT CASE WHEN p.es_combo THEN '[]'::jsonb ELSE _tienda_grupos_de(p.id, p_tenant) END AS grupos) g
     WHERE p.tenant_id = p_tenant AND p.deleted_at IS NULL AND p.visible_en_pos
       AND (m.motivo IS NULL OR m.motivo = 'AGOTADO')
  ),
  -- Los slots de cada combo. Qué es opción lo decide lo mismo que valida agregar_combo_a_ticket
  -- (0152) y enseña la caja (combos.ts): en un slot por categoría, los productos de la categoría
  -- menos los excluidos (fila con activa = false); sin categoría, solo las filas activas.
  slots AS (
    SELECT cg.combo_producto_id,
           jsonb_agg(jsonb_build_object(
             'id', cg.id,
             'nombre', cg.nombre,
             'minimo', cg.minimo_selecciones,
             'maximo', cg.maximo_selecciones,
             'opciones', o.opciones) ORDER BY cg.orden_visualizacion, cg.nombre) AS slots,
           bool_or(cg.minimo_selecciones >= 1 AND NOT o.hay_vendible) AS incompleto
      FROM combo_grupos cg
     CROSS JOIN LATERAL (
       SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'producto_id', v.id,
                'nombre', v.nombre,
                'precio_extra_mxn', to_char(x.extra, 'FM999999990.00'),
                -- La elección entra al precio del padre: lleva el IVA del combo, no el del elegido.
                'precio_extra_final_mxn', to_char(_tienda_con_iva(x.extra, cg.combo_producto_id, p_tenant), 'FM999999990.00'),
                'agotado', v.agotado,
                'es_default', COALESCE(co.es_default, false),
                'grupos', v.grupos)
              ORDER BY CASE WHEN cg.categoria_id IS NULL THEN co.orden_visualizacion ELSE v.orden_visualizacion END,
                       v.nombre), '[]'::jsonb) AS opciones,
              COALESCE(bool_or(NOT v.agotado), false) AS hay_vendible
         FROM vendibles v
         LEFT JOIN combo_opciones co
                ON co.grupo_id = cg.id AND co.producto_id = v.id AND co.deleted_at IS NULL
        CROSS JOIN LATERAL (SELECT CASE WHEN cg.modo_precio = 'SUMA_PRECIO_PRODUCTO' THEN v.precio ELSE 0 END
                                   + COALESCE(co.precio_delta_mxn, 0) AS extra) x
        WHERE NOT v.es_combo
          AND CASE WHEN cg.categoria_id IS NULL
                   THEN COALESCE(co.activa AND co.tenant_id = p_tenant, false)
                   ELSE v.categoria_id = cg.categoria_id
                        AND COALESCE(co.activa AND co.tenant_id = p_tenant, true)
              END) o
     WHERE cg.tenant_id = p_tenant AND cg.activo AND cg.deleted_at IS NULL
     GROUP BY cg.combo_producto_id
  )
  SELECT COALESCE(jsonb_agg(c.categoria ORDER BY c.orden_visualizacion, c.nombre), '[]'::jsonb)
    INTO v_categorias
    FROM (
      -- El JOIN deja fuera la categoría sin productos visibles.
      SELECT cat.orden_visualizacion, cat.nombre,
             jsonb_build_object(
               'id', cat.id,
               'nombre', cat.nombre,
               'productos', jsonb_agg(jsonb_build_object(
                 'id', v.id,
                 'nombre', v.nombre,
                 'descripcion', v.descripcion,
                 'imagen_url', v.imagen_url,
                 'precio_mxn', to_char(v.precio, 'FM999999990.00'),
                 'precio_final_mxn', to_char(_tienda_con_iva(v.precio, v.id, p_tenant), 'FM999999990.00'),
                 -- Un combo, además, se agota si a un slot obligatorio no le queda opción vendible.
                 'agotado', v.agotado OR COALESCE(s.incompleto, false),
                 'es_combo', v.es_combo,
                 'grupos', v.grupos,
                 'slots', COALESCE(s.slots, '[]'::jsonb))
               ORDER BY v.orden_visualizacion, v.nombre)) AS categoria
        FROM categorias cat
        JOIN vendibles v ON v.categoria_id = cat.id
        LEFT JOIN slots s ON s.combo_producto_id = v.id AND v.es_combo
       WHERE cat.tenant_id = p_tenant AND cat.deleted_at IS NULL AND cat.activa
       GROUP BY cat.id
    ) c;

  RETURN jsonb_build_object('categorias', v_categorias);
END;
$$;
REVOKE ALL ON FUNCTION tienda_menu(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_menu(uuid, uuid) TO service_role;

-- ── §2 Más direcciones reservadas ────────────────────────────────────────────
-- A las dieciséis de la 0163 se suman diecinueve: las rutas de primer nivel que la tienda pública
-- usa o puede llegar a usar, y dos más que parecerían oficiales de VIM. El formato NO cambia y el
-- nombre de la restricción tampoco: es por el que el admin traduce el error.
-- El espejo de esta lista vive en apps/admin/app/lib/tienda-reglas.ts.
-- Si una tienda ya usara una de estas direcciones, el ADD CONSTRAINT falla y la migración no
-- entra: se revisa antes de aplicar en producción.
ALTER TABLE tienda_config DROP CONSTRAINT IF EXISTS tienda_config_slug_check;
ALTER TABLE tienda_config ADD CONSTRAINT tienda_config_slug_check CHECK (
  slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
  AND slug NOT IN ('api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets',
                   'vim', 'vimpos', 'soporte', 'login', 'pago', 'ayuda', 'www', 'tienda',
                   'seguimiento', 'carrito', 'entrar', 'registro', 'salir', 'icon', 'manifest',
                   'robots', 'sitemap', 'favicon', 'menu', 'inicio', 'app', 'legal', 'aviso',
                   'contacto', 'vim-pos', 'soporte-vim', 'pedidos'));
