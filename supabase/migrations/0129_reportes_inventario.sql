-- ============================================================================
-- 0129 — Reportes de inventario: historial de movimientos (P-149) y costo de ventas (P-150).
--
-- Los dos reportes que quedaron pendientes al construir recetas y compras (ADR 0012) y el sync
-- de inventario con la caja (ADR 0013). Todo es de LECTURA: no cambia cómo se vende, se compra
-- ni se descuenta. La caja también aplica esta migración al arrancar; no le hace nada.
--
--   · vw_movimientos_inventario — un movimiento por fila, con lo que el dueño necesita para
--     leerlo (insumo, unidad, sucursal, folio de la compra o del ticket, quién). PostgREST
--     filtra, ordena y corta la página en la base: en un mes de venta hay decenas de miles de
--     movimientos (uno por insumo de cada receta vendida) y bajarlos todos no es opción.
--   · resumen_movimientos_inventario() — las cifras de arriba del historial (cuánto se compró,
--     cuánto consumió la venta, cuánta merma) con los mismos filtros que la tabla.
--   · reporte_costo_ventas() — venta, costo de lo vendido y margen por producto en un periodo.
--
-- RLS: la vista declara security_invoker (lo exige supabase/tests/0002_rls_cobertura) y las dos
-- funciones son SECURITY INVOKER, así que todo corre con el RLS de quien consulta. Además filtran
-- por current_tenant_id() a mano: son sumas que cruzan varias tablas y, llamadas con una llave
-- que se salta el RLS, no deben mezclar negocios — con esa llave no hay tenant y salen vacías.
-- ============================================================================

-- El historial filtra por día contable dentro del negocio. Ninguno de los índices de 0007 lo
-- cubre: (tenant_id, fecha) va por instante y (sucursal_id, dia_contable) exige sucursal.
CREATE INDEX IF NOT EXISTS idx_mov_inv_tenant_dia ON movimientos_inventario (tenant_id, dia_contable);

-- ---------------------------------------------------------------------------------------------
-- 1. vw_movimientos_inventario (P-149)
-- ---------------------------------------------------------------------------------------------
-- El signo va escrito aquí y no con _vim_signo_movimiento (0101): esa función solo la puede
-- ejecutar service_role, y una vista security_invoker la llama con los permisos del dueño.
--
-- "Quién": el movimiento guarda al usuario cuando lo captura una persona (compra, merma, ajuste).
-- El descuento por venta no lo guarda (descontar_inventario_por_venta pasa NULL), así que para
-- esos se toma a quien cobró el ticket o, si no quedó, a quien lo abrió.
-- De usuarios_perfil solo salen nombre y apellido: la tabla también guarda el pin_hash.
CREATE OR REPLACE VIEW vw_movimientos_inventario
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.tenant_id,
  m.sucursal_id,
  s.nombre                                                        AS sucursal_nombre,
  m.fecha,
  m.dia_contable,
  m.insumo_id,
  i.nombre                                                        AS insumo_nombre,
  u.simbolo                                                       AS unidad_simbolo,
  m.tipo,
  CASE WHEN m.tipo IN ('ENTRADA_COMPRA', 'REVERSA_CANCELACION', 'AJUSTE_POSITIVO', 'TRANSFERENCIA_ENTRADA')
       THEN 1 ELSE -1 END                                         AS signo,
  m.cantidad,
  m.costo_unitario_mxn,
  m.costo_total_mxn,
  m.compra_id,
  c.folio_completo                                                AS compra_folio,
  COALESCE(p.nombre, m.proveedor_texto)                           AS proveedor,
  m.factura_referencia,
  m.ticket_id,
  t.folio_completo                                                AS ticket_folio,
  m.motivo,
  m.descripcion,
  sd.nombre                                                       AS sucursal_destino_nombre,
  COALESCE(m.usuario_id, t.usuario_cierre_id, t.usuario_apertura_id) AS usuario_id,
  NULLIF(btrim(concat_ws(' ', up.nombre, up.apellido_paterno)), '') AS usuario_nombre
FROM movimientos_inventario m
JOIN insumos i                ON i.id  = m.insumo_id
LEFT JOIN unidades_medida u   ON u.id  = i.unidad_medida_id
LEFT JOIN sucursales s        ON s.id  = m.sucursal_id
LEFT JOIN sucursales sd       ON sd.id = m.sucursal_destino_id
LEFT JOIN compras c           ON c.id  = m.compra_id
LEFT JOIN proveedores p       ON p.id  = c.proveedor_id
LEFT JOIN tickets t           ON t.id  = m.ticket_id
LEFT JOIN usuarios_perfil up  ON up.id = COALESCE(m.usuario_id, t.usuario_cierre_id, t.usuario_apertura_id);

COMMENT ON VIEW vw_movimientos_inventario IS
  'P-149: cada movimiento de inventario con insumo, unidad, sucursal, folio de compra o ticket y quién. signo = +1 entra / -1 sale. security_invoker → RLS de quien consulta.';

-- ---------------------------------------------------------------------------------------------
-- 2. resumen_movimientos_inventario (P-149, cifras)
-- ---------------------------------------------------------------------------------------------
-- Lee las tablas base y no la vista: la vista arrastra tickets y perfiles que aquí no hacen
-- falta. La búsqueda es la MISMA que la de la tabla (ILIKE sobre el nombre del insumo), para
-- que las cifras hablen de las mismas filas. No filtra por tipo a propósito: las cifras son el
-- panorama del periodo (compras, consumo, merma) y el tipo solo angosta la tabla.
CREATE OR REPLACE FUNCTION resumen_movimientos_inventario(
  p_desde       date,
  p_hasta       date,
  p_sucursal_id uuid DEFAULT NULL,
  p_busqueda    text DEFAULT NULL
) RETURNS TABLE (tipo text, movimientos integer, costo_mxn numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT m.tipo::text,
         COUNT(*)::integer,
         COALESCE(SUM(m.costo_total_mxn), 0)
    FROM movimientos_inventario m
    JOIN insumos i ON i.id = m.insumo_id
   WHERE m.tenant_id = current_tenant_id()
     AND m.dia_contable BETWEEN p_desde AND p_hasta
     AND (p_sucursal_id IS NULL OR m.sucursal_id = p_sucursal_id)
     AND (NULLIF(btrim(p_busqueda), '') IS NULL OR i.nombre ILIKE '%' || btrim(p_busqueda) || '%')
   GROUP BY m.tipo;
$$;

COMMENT ON FUNCTION resumen_movimientos_inventario(date, date, uuid, text) IS
  'P-149: movimientos y su costo por tipo en un rango de días contables, con los filtros de sucursal e insumo del historial.';

REVOKE EXECUTE ON FUNCTION resumen_movimientos_inventario(date, date, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION resumen_movimientos_inventario(date, date, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. reporte_costo_ventas (P-150)
-- ---------------------------------------------------------------------------------------------
-- Una fila por producto (y categoría con la que se vendió) de los tickets vendidos en el rango.
--
-- VENTA: sin IVA — el IVA se cobra para el SAT y el costo de los insumos se captura sin IVA, así
-- que es la única comparación que da un margen verdadero (la misma que usa /catalogo/recetas).
-- Los combos se cuentan como en vw_ventas_por_producto: el PADRE no, los HIJOS por su parte del
-- precio. El descuento a la cuenta completa se reparte entre sus renglones en proporción a lo que
-- valía cada uno (el mismo criterio que crear_devolucion en 0041, sin contar el envío, que no
-- admite descuentos: ADR 0017). Las devoluciones confirmadas se restan del renglón devuelto,
-- sin importar qué día se devolvió: se comparan con la venta que deshacen.
--
-- COSTO: lo que la venta sacó del inventario — los movimientos SALIDA_VENTA y
-- SALIDA_MODIFICADOR_EXTRA de esos tickets, menos los REVERSA_CANCELACION que los regresaron —
-- al costo que quedó escrito en cada movimiento. Si el movimiento no trae costo (el insumo no
-- tenía costo cuando se vendió) se usa el costo promedio ACTUAL del insumo y se reporta aparte
-- (costo_estimado_mxn). Si tampoco hay costo actual, el consumo vale 0 y se marca
-- (insumo_sin_costo): la pantalla no puede presentar eso como margen.
--
-- REPARTO POR PRODUCTO: el movimiento guarda el ticket pero no el renglón. El consumo de cada
-- insumo en un ticket se reparte entre los renglones que lo piden según la receta (y los extras)
-- de HOY, en proporción a lo que pide cada uno (sin las piezas devueltas que regresaron al
-- inventario). La receta solo decide el reparto: cantidades y costos salen de los movimientos.
-- Lo que ningún renglón pide hoy (la receta cambió o se quitó después de vender) se reparte
-- entre los renglones del ticket que sí recibieron costo —si no hay, entre todos— según su
-- venta, y se reporta aparte (costo_repartido_mxn). Primero los que tienen costo porque el caso
-- común es cambiar un insumo de la receta; repartirlo entre los que no tienen le cargaría la
-- carne de una hamburguesa al refresco que nunca tuvo receta.
--
-- SIN COSTO: un renglón sin consumo registrado (producto sin receta, o vendido con el descuento
-- de inventario apagado) no tiene costo, y NO es margen del 100 %: su venta sale en venta_mxn
-- pero no en venta_con_costo_mxn, que es contra la que se calcula el margen.
CREATE OR REPLACE FUNCTION reporte_costo_ventas(
  p_desde       date,
  p_hasta       date,
  p_sucursal_id uuid DEFAULT NULL
) RETURNS TABLE (
  producto_id         uuid,
  producto_nombre     text,
  categoria           text,
  tiene_receta        boolean,
  unidades            numeric,
  venta_mxn           numeric,
  unidades_con_costo  numeric,
  venta_con_costo_mxn numeric,
  costo_mxn           numeric,
  costo_estimado_mxn  numeric,
  costo_repartido_mxn numeric,
  insumo_sin_costo    boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
tk AS (
  SELECT t.id, t.total_mxn
    FROM tickets t
   WHERE t.tenant_id = current_tenant_id()
     AND t.deleted_at IS NULL
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
     AND t.dia_contable BETWEEN p_desde AND p_hasta
     AND (p_sucursal_id IS NULL OR t.sucursal_id = p_sucursal_id)
),
-- Renglones vivos y su venta sin IVA ANTES del descuento a la cuenta completa. El IVA de la
-- parte de un HIJO se deriva del PADRE, como en vw_ventas_por_producto (0111).
ren AS (
  SELECT ti.id, ti.ticket_id, ti.producto_id,
         ti.producto_nombre_snapshot::text  AS nombre,
         ti.categoria_nombre_snapshot::text AS categoria,
         ti.cantidad, ti.combo_rol, ti.cargo_tipo, ti.total_item_mxn,
         CASE
           WHEN ti.combo_rol = 'PADRE' THEN 0
           WHEN ti.combo_rol = 'HIJO' THEN
             COALESCE(ti.precio_asignado_mxn, 0)
             - CASE WHEN padre.iva_incluido_en_precio_snapshot
                    THEN ROUND(COALESCE(ti.precio_asignado_mxn, 0) * padre.tasa_iva_snapshot / (100 + padre.tasa_iva_snapshot), 2)
                    ELSE 0 END
             + (ti.total_item_mxn - ti.iva_item_mxn)
           ELSE ti.total_item_mxn - ti.iva_item_mxn
         END AS base
    FROM tk
    JOIN ticket_items ti         ON ti.ticket_id = tk.id AND ti.cancelado = false
    LEFT JOIN ticket_items padre ON padre.id = ti.parent_item_id
),
fac AS (
  SELECT r.ticket_id,
         CASE WHEN COALESCE(SUM(r.total_item_mxn) FILTER (WHERE r.cargo_tipo IS NULL), 0) > 0
              THEN LEAST(1, GREATEST(0,
                     (MAX(tk.total_mxn) - COALESCE(SUM(r.total_item_mxn) FILTER (WHERE r.cargo_tipo IS NOT NULL), 0))
                     / SUM(r.total_item_mxn) FILTER (WHERE r.cargo_tipo IS NULL)))
              ELSE 1 END AS f
    FROM ren r
    JOIN tk ON tk.id = r.ticket_id
   GROUP BY r.ticket_id
),
dev AS (
  SELECT di.ticket_item_id_original AS item_id,
         SUM(di.cantidad_devuelta)     AS cantidad,
         COALESCE(SUM(di.cantidad_devuelta) FILTER (WHERE di.reversar_inventario_item), 0) AS reversada,
         SUM(di.subtotal_devuelto_mxn) AS venta
    FROM devolucion_items di
    JOIN devoluciones d ON d.id = di.devolucion_id
   WHERE d.estado = 'CONFIRMADA'
     AND d.deleted_at IS NULL
     AND di.ticket_item_id_original IN (SELECT id FROM ren)
   GROUP BY di.ticket_item_id_original
),
con AS (
  SELECT m.ticket_id, m.insumo_id,
         SUM(sg.s * m.cantidad * CASE WHEN m.costo_unitario_mxn > 0 THEN m.costo_unitario_mxn ELSE i.costo_unitario_mxn END) AS costo,
         COALESCE(SUM(sg.s * m.cantidad * i.costo_unitario_mxn) FILTER (WHERE m.costo_unitario_mxn <= 0), 0)               AS estimado,
         bool_or(m.costo_unitario_mxn <= 0 AND i.costo_unitario_mxn <= 0)                                                  AS sin_costo
    FROM movimientos_inventario m
    JOIN tk        ON tk.id = m.ticket_id
    JOIN insumos i ON i.id  = m.insumo_id
    CROSS JOIN LATERAL (SELECT CASE WHEN m.tipo = 'REVERSA_CANCELACION' THEN -1 ELSE 1 END AS s) sg
   WHERE m.tipo IN ('SALIDA_VENTA', 'SALIDA_MODIFICADOR_EXTRA', 'REVERSA_CANCELACION')
   GROUP BY m.ticket_id, m.insumo_id
),
-- Lo que pide cada renglón según la receta activa y los extras de hoy (las mismas dos fuentes que
-- descontar_inventario_por_venta), sin las piezas devueltas que regresaron al inventario. Solo
-- pesa el reparto. Un renglón devuelto entero pide 0 y no entra (no se divide entre cero).
teo AS (
  SELECT item_id, ticket_id, insumo_id, SUM(q) AS q
    FROM (
      SELECT r.id AS item_id, r.ticket_id, rc.insumo_id, rc.cantidad * (r.cantidad - COALESCE(d.reversada, 0)) AS q
        FROM ren r
        JOIN recetas re            ON re.producto_id = r.producto_id AND re.activa
        JOIN receta_componentes rc ON rc.receta_id = re.id
        LEFT JOIN dev d            ON d.item_id = r.id
      UNION ALL
      SELECT r.id, r.ticket_id, mc.insumo_id, mc.cantidad * (r.cantidad - COALESCE(d.reversada, 0))
        FROM ren r
        JOIN ticket_item_modificadores tim ON tim.ticket_item_id = r.id
        JOIN opciones_modificador om       ON om.id = tim.opcion_modificador_id
        JOIN grupos_modificadores gm       ON gm.id = om.grupo_id AND gm.naturaleza = 'EXTRA'
        JOIN modificador_componentes mc    ON mc.opcion_modificador_id = om.id
        LEFT JOIN dev d                    ON d.item_id = r.id
    ) x
   GROUP BY item_id, ticket_id, insumo_id
  HAVING SUM(q) > 0
),
p1 AS (
  SELECT t.item_id,
         c.costo    * t.q / SUM(t.q) OVER w AS costo,
         c.estimado * t.q / SUM(t.q) OVER w AS estimado,
         c.sin_costo
    FROM con c
    JOIN teo t ON t.ticket_id = c.ticket_id AND t.insumo_id = c.insumo_id
  WINDOW w AS (PARTITION BY c.ticket_id, c.insumo_id)
),
resto AS (
  SELECT c.ticket_id, SUM(c.costo) AS costo, SUM(c.estimado) AS estimado, bool_or(c.sin_costo) AS sin_costo
    FROM con c
   WHERE NOT EXISTS (SELECT 1 FROM teo t WHERE t.ticket_id = c.ticket_id AND t.insumo_id = c.insumo_id)
   GROUP BY c.ticket_id
),
cand AS (
  SELECT r.id AS item_id, r.ticket_id, r.base, r.cantidad,
         EXISTS (SELECT 1 FROM p1 WHERE p1.item_id = r.id) AS con_p1
    FROM ren r
   WHERE r.cargo_tipo IS NULL
     AND r.combo_rol IS DISTINCT FROM 'PADRE'
     AND r.ticket_id IN (SELECT ticket_id FROM resto)
),
elegidos AS (
  SELECT c.item_id, c.ticket_id, c.base, c.cantidad
    FROM (SELECT cand.*, bool_or(cand.con_p1) OVER (PARTITION BY cand.ticket_id) AS hay_con FROM cand) c
   WHERE c.con_p1 OR NOT c.hay_con
),
p2 AS (
  SELECT pe.item_id,
         rs.costo    * pe.peso AS costo,
         rs.estimado * pe.peso AS estimado,
         rs.sin_costo
    FROM (SELECT e.item_id, e.ticket_id,
                 CASE WHEN SUM(e.base) OVER w > 0 THEN e.base / SUM(e.base) OVER w
                      ELSE e.cantidad / SUM(e.cantidad) OVER w END AS peso
            FROM elegidos e
          WINDOW w AS (PARTITION BY e.ticket_id)) pe
    JOIN resto rs ON rs.ticket_id = pe.ticket_id
),
costo_ren AS (
  SELECT item_id, SUM(costo) AS costo, SUM(estimado) AS estimado, SUM(repartido) AS repartido, bool_or(sin_costo) AS sin_costo
    FROM (
      SELECT item_id, costo, estimado, 0::numeric AS repartido, sin_costo FROM p1
      UNION ALL
      SELECT item_id, costo, estimado, costo, sin_costo FROM p2
    ) x
   GROUP BY item_id
),
fila AS (
  SELECT r.producto_id, r.nombre, r.categoria,
         CASE WHEN r.combo_rol = 'PADRE' THEN 0 ELSE r.cantidad - COALESCE(d.cantidad, 0) END AS unidades,
         r.base * f.f - COALESCE(d.venta, 0)                                                AS venta,
         cr.item_id IS NOT NULL                                                             AS con_costo,
         COALESCE(cr.costo, 0)     AS costo,
         COALESCE(cr.estimado, 0)  AS estimado,
         COALESCE(cr.repartido, 0) AS repartido,
         COALESCE(cr.sin_costo, false) AS sin_costo
    FROM ren r
    JOIN fac f             ON f.ticket_id = r.ticket_id
    LEFT JOIN dev d        ON d.item_id = r.id
    LEFT JOIN costo_ren cr ON cr.item_id = r.id
   WHERE r.cargo_tipo IS NULL
)
SELECT fl.producto_id,
       COALESCE(pr.nombre::text, MAX(fl.nombre)),
       fl.categoria,
       EXISTS (SELECT 1 FROM recetas re JOIN receta_componentes rc ON rc.receta_id = re.id
                WHERE re.producto_id = fl.producto_id AND re.activa),
       ROUND(SUM(fl.unidades), 3),
       ROUND(SUM(fl.venta), 2),
       ROUND(COALESCE(SUM(fl.unidades) FILTER (WHERE fl.con_costo), 0), 3),
       ROUND(COALESCE(SUM(fl.venta) FILTER (WHERE fl.con_costo), 0), 2),
       ROUND(SUM(fl.costo), 2),
       ROUND(SUM(fl.estimado), 2),
       ROUND(SUM(fl.repartido), 2),
       bool_or(fl.sin_costo)
  FROM fila fl
  LEFT JOIN productos pr ON pr.id = fl.producto_id
 GROUP BY fl.producto_id, pr.nombre, (CASE WHEN fl.producto_id IS NULL THEN fl.nombre END), fl.categoria
-- Un PADRE de combo sin receta propia no vende ni cuesta nada por sí mismo: no sale.
HAVING SUM(fl.unidades) <> 0 OR SUM(fl.venta) <> 0 OR SUM(fl.costo) <> 0 OR bool_or(fl.con_costo)
UNION ALL
-- Consumo de un ticket al que no le quedó ningún renglón donde repartirlo (casi imposible: todos
-- sus renglones se cancelaron después de cobrar). Sale como fila sin producto para que el costo
-- total cuadre con lo que salió del inventario.
SELECT NULL::uuid, NULL::text, NULL::text, false, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
       ROUND(SUM(rs.costo), 2), ROUND(SUM(rs.estimado), 2), ROUND(SUM(rs.costo), 2), bool_or(rs.sin_costo)
  FROM resto rs
 WHERE NOT EXISTS (SELECT 1 FROM elegidos e WHERE e.ticket_id = rs.ticket_id)
HAVING COUNT(*) > 0;
$$;

COMMENT ON FUNCTION reporte_costo_ventas(date, date, uuid) IS
  'P-150: por producto, venta sin IVA (neta de descuentos y devoluciones), costo de lo que la venta sacó del inventario al costo de sus movimientos, y la venta que no tiene costo. Detalle del cálculo en 0129.';

REVOKE EXECUTE ON FUNCTION reporte_costo_ventas(date, date, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION reporte_costo_ventas(date, date, uuid) TO authenticated, service_role;
