import type { Categoria, Producto } from "./catalogo";

/**
 * Menú por sucursal (ADR 0027, migración 0152). La caja lee el catálogo del negocio y lo ajusta a
 * SU sucursal con las filas de `productos_sucursal`: sin fila, el producto se vende al precio
 * general y sin agotar.
 *
 * La misma regla vive en tres lugares, con los mismos casos de prueba:
 *   - SQL: precio_producto_en_sucursal / motivo_no_disponible_en_sucursal (0152). Es la que cobra.
 *   - Uber: aplicarSucursalCarta (supabase/functions/_shared/delivery/menu-uber.ts).
 *   - Aquí.
 */
export type FilaProductoSucursal = {
  producto_id: string;
  disponible: boolean;
  precio_mxn: number | string | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

/**
 * `precio_base_mxn` del Producto de la caja pasa a ser «lo que cobra ESTA sucursal»: así el
 * carrito, los combos, los modales y la pantalla del cliente lo usan sin saber de sucursales. Lo
 * que no se vende aquí se MARCA (`seVendeAqui: false`), no se quita: la reapertura de una cuenta
 * (`agruparPadresHijos`, cuenta-mesa.ts) tira los renglones cuyo producto no encuentra.
 */
export function aplicarSucursal(productos: Producto[], filas: FilaProductoSucursal[]): Producto[] {
  const porProducto = new Map(filas.map((f) => [f.producto_id, f]));
  return productos.map((p) => {
    const f = porProducto.get(p.id);
    if (!f) return p;
    return {
      ...p,
      precio_base_mxn: f.precio_mxn === null ? p.precio_base_mxn : Number(f.precio_mxn),
      agotado: p.agotado || f.agotado_manual || f.agotado_automatico,
      seVendeAqui: f.disponible,
    };
  });
}

/**
 * Lo que se pinta en la cuadrícula: sin lo que no se vende aquí, y sin las categorías que se
 * quedaron vacías POR eso. Una categoría vacía de verdad se queda como estaba: esconderla sería un
 * cambio para todos los negocios, no solo para los de varias sucursales. `seVendeAqui` ausente
 * (catálogo en caché de antes de 0152) cuenta como que se vende.
 */
export function menuVisible(categorias: Categoria[], productos: Producto[]): { categorias: Categoria[]; productos: Producto[] } {
  const visibles = productos.filter((p) => p.seVendeAqui !== false);
  const conProductos = new Set(productos.map((p) => p.categoria_id));
  const conVisibles = new Set(visibles.map((p) => p.categoria_id));
  return {
    categorias: categorias.filter((c) => !conProductos.has(c.id) || conVisibles.has(c.id)),
    productos: visibles,
  };
}
