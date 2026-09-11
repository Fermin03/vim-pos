// Carta de VIM → menú de Uber Eats (Menu API v2, `PUT /v2/eats/stores/{id}/menus`).
//
// La regla que hace funcionar toda la integración: **el id de cada ítem en Uber es el uuid del
// producto en VIM**. Así, cuando llega un pedido, `normalizarPedidoUber` reconoce los ítems sin
// tabla de mapeo y `crear_ticket_desde_app` los convierte en renglones del ticket. Sin este menú
// la tienda de Uber no tiene nada que vender, o vende ids que el POS no conoce (`items_sin_mapear`).
//
// Módulo puro: recibe productos y categorías ya leídos, devuelve el cuerpo exacto que espera Uber.
// Precios en centavos (Uber no acepta decimales); IVA como `tax_rate`; sin modificadores todavía
// (los combos y extras del POS no se exponen en esta primera carta).

export type ProductoCarta = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio_base_mxn: number | string;
  tasa_iva?: number | string | null;
  categoria_id?: string | null;
  agotado?: boolean;
  visible?: boolean;
  /** true si es un combo (productos.es_combo). Un combo sin slots no se puede vender. */
  es_combo?: boolean;
  /** Nº de slots activos del combo. Solo se mira cuando `es_combo`. */
  n_slots?: number;
};

export type CategoriaCarta = { id: string; nombre: string; orden?: number | null };

export type MenuUber = {
  items: unknown[];
  modifier_groups: unknown[];
  categories: { id: string; title: { translations: Record<string, string> }; entities: { id: string; type: "ITEM" }[] }[];
  menus: unknown[];
};

const IDIOMA = "es_mx";
const DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const SIN_CATEGORIA = "otros";

const texto = (s: string) => ({ translations: { [IDIOMA]: s.trim().slice(0, 200) } });

/** Uber rechaza `/` y `;` en ids de ítem (van en rutas de la API). Los uuid no los llevan; se valida por si acaso. */
export function idValidoUber(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id);
}

export function centavos(precio: number | string): number {
  const n = Number(precio);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/**
 * Arma el menú. Excluye productos sin precio, agotados, ocultos o con id inválido; las categorías
 * sin productos no van; los productos sin categoría caen en «Otros». Devuelve también los conteos
 * y los productos excluidos con su motivo, para que el admin diga qué quedó fuera.
 */
export function construirMenuUber(
  productos: ProductoCarta[],
  categorias: CategoriaCarta[],
  opciones: { titulo?: string } = {},
): { menu: MenuUber; items: number; categorias: number; excluidos: { id: string; nombre: string; motivo: string }[] } {
  const excluidos: { id: string; nombre: string; motivo: string }[] = [];
  const items: unknown[] = [];
  const porCategoria = new Map<string, string[]>();

  for (const p of productos) {
    const precio = centavos(p.precio_base_mxn);
    const motivo = !idValidoUber(p.id) ? "id inválido para Uber"
      : p.visible === false ? "oculto en el POS"
      : p.agotado ? "agotado"
      : precio <= 0 ? "sin precio"
      : p.es_combo && !(p.n_slots && p.n_slots > 0) ? "combo sin slots"
      : null;
    if (motivo) { excluidos.push({ id: p.id, nombre: p.nombre, motivo }); continue; }
    const item: Record<string, unknown> = {
      id: p.id,
      title: texto(p.nombre || "Producto"),
      price_info: { price: precio },
      tax_info: { tax_rate: Math.max(0, Number(p.tasa_iva ?? 16) || 0) },
      quantity_info: {},
      modifier_group_ids: { ids: [] },
      external_data: p.id,
    };
    if (p.descripcion && p.descripcion.trim()) item.description = texto(p.descripcion);
    items.push(item);
    const cat = p.categoria_id && categorias.some((c) => c.id === p.categoria_id) ? p.categoria_id : SIN_CATEGORIA;
    porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), p.id]);
  }

  const ordenadas = [...categorias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const categories: MenuUber["categories"] = [];
  for (const c of ordenadas) {
    const ids = porCategoria.get(c.id);
    if (!ids?.length) continue;
    categories.push({ id: c.id, title: texto(c.nombre || "Categoría"), entities: ids.map((id) => ({ id, type: "ITEM" as const })) });
  }
  const sueltos = porCategoria.get(SIN_CATEGORIA);
  if (sueltos?.length) {
    categories.push({ id: SIN_CATEGORIA, title: texto("Otros"), entities: sueltos.map((id) => ({ id, type: "ITEM" as const })) });
  }

  const menu: MenuUber = {
    items,
    modifier_groups: [],
    categories,
    menus: [{
      id: "carta",
      title: texto(opciones.titulo ?? "Carta"),
      service_availability: DIAS.map((day_of_week) => ({ day_of_week, time_periods: [{ start_time: "00:00", end_time: "23:59" }] })),
      category_ids: categories.map((c) => c.id),
    }],
  };
  return { menu, items: items.length, categorias: categories.length, excluidos };
}
