-- ============================================================================
-- 0168 — Tienda en línea: el dueño decide qué categorías y productos salen en su tienda.
--
-- Todo nace visible. Se guarda LO ESCONDIDO, por sucursal: sin filas, la tienda enseña lo de
-- siempre, y lo que se agregue al catálogo después aparece solo. Esconder es «no se vende suelto
-- en la tienda de esta sucursal»; no toca la caja ni las apps de reparto.
--
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.*. La tabla
-- no entra al sync: vive solo en la nube, como tienda_config.
-- ============================================================================

-- ── §1 Lo escondido ──────────────────────────────────────────────────────────
-- Cada fila se amarra a su negocio por los tres lados, como tienda_sucursales (0161): con una FK
-- solo al id, un administrador del negocio A podría colgar de su tenant_id el producto de B. Las FK
-- compuestas necesitan estos índices únicos (el de sucursales ya existe desde la 0161).
CREATE UNIQUE INDEX IF NOT EXISTS categorias_id_tenant_uq ON categorias (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS productos_id_tenant_uq  ON productos (id, tenant_id);

CREATE TABLE IF NOT EXISTS tienda_ocultos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sucursal_id  uuid NOT NULL,
  categoria_id uuid NULL,
  producto_id  uuid NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tienda_ocultos_una_cosa CHECK (num_nonnulls(categoria_id, producto_id) = 1),
  CONSTRAINT tienda_ocultos_sucursal_del_negocio
    FOREIGN KEY (sucursal_id, tenant_id) REFERENCES sucursales (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT tienda_ocultos_categoria_del_negocio
    FOREIGN KEY (categoria_id, tenant_id) REFERENCES categorias (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT tienda_ocultos_producto_del_negocio
    FOREIGN KEY (producto_id, tenant_id) REFERENCES productos (id, tenant_id) ON DELETE CASCADE
);
COMMENT ON TABLE tienda_ocultos IS
  'Lo que una sucursal NO enseña en su tienda en línea: una categoría entera o un producto. Sin fila = visible. Un producto escondido sigue siendo opción de los combos que sí se muestran.';

-- Una fila por cosa y sucursal; son además los índices por los que busca tienda_menu.
CREATE UNIQUE INDEX IF NOT EXISTS tienda_ocultos_categoria_uq ON tienda_ocultos (sucursal_id, categoria_id) WHERE categoria_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tienda_ocultos_producto_uq  ON tienda_ocultos (sucursal_id, producto_id)  WHERE producto_id IS NOT NULL;
-- Para los borrados en cascada desde el catálogo y desde el negocio.
CREATE INDEX IF NOT EXISTS idx_tienda_ocultos_categoria ON tienda_ocultos (categoria_id) WHERE categoria_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tienda_ocultos_producto  ON tienda_ocultos (producto_id)  WHERE producto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tienda_ocultos_tenant    ON tienda_ocultos (tenant_id);

-- Lee cualquier empleado del negocio; esconden y muestran el dueño y los administradores. Los
-- predicados son, letra por letra, los de tienda_sucursales (0161 §4). Una fila no se edita: se
-- inserta para esconder y se borra para mostrar, así que no hay política ni permiso de UPDATE.
ALTER TABLE tienda_ocultos ENABLE ROW LEVEL SECURITY;
-- Nada para anon: en la nube, los privilegios por omisión del proyecto se lo darían.
REVOKE ALL ON tienda_ocultos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON tienda_ocultos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tienda_ocultos TO service_role;

DROP POLICY IF EXISTS tienda_ocultos_select ON tienda_ocultos;
CREATE POLICY tienda_ocultos_select ON tienda_ocultos
  FOR SELECT USING (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS tienda_ocultos_insert ON tienda_ocultos;
CREATE POLICY tienda_ocultos_insert ON tienda_ocultos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
DROP POLICY IF EXISTS tienda_ocultos_delete ON tienda_ocultos;
CREATE POLICY tienda_ocultos_delete ON tienda_ocultos
  FOR DELETE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));

-- ── §2 El menú sin lo escondido ──────────────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0165_tienda_publica.sql. Un cambio, en la consulta final: no salen la
-- categoría escondida en esta sucursal (con todos sus productos) ni el producto escondido.
--
-- El filtro va SOLO ahí, en los renglones del menú, y no en `vendibles`: de `vendibles` salen
-- también las opciones de los pasos de un combo, y un producto escondido tiene que seguir siendo
-- opción (esconder = «no se vende suelto»). Un combo escondido no sale porque es un renglón.
-- tienda_cotizar (0162) arma el menú con esta función y no se toca: un producto escondido deja de
-- estar entre los renglones y responde PRODUCTO_NO_DISPONIBLE, como cualquiera que no está.
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
         -- Lo que el dueño escondió en esta sucursal (0168): la categoría entera o el producto.
         AND NOT EXISTS (SELECT 1 FROM tienda_ocultos o
                          WHERE o.sucursal_id = p_sucursal AND o.tenant_id = p_tenant AND o.categoria_id = cat.id)
         AND NOT EXISTS (SELECT 1 FROM tienda_ocultos o
                          WHERE o.sucursal_id = p_sucursal AND o.tenant_id = p_tenant AND o.producto_id = v.id)
       GROUP BY cat.id
    ) c;

  RETURN jsonb_build_object('categorias', v_categorias);
END;
$$;
REVOKE ALL ON FUNCTION tienda_menu(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_menu(uuid, uuid) TO service_role;
