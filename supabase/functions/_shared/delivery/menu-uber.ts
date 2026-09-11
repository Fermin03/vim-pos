// Carta de VIM → menú de Uber Eats (Menu API v2, `PUT /v2/eats/stores/{id}/menus`).
//
// La regla que hace funcionar toda la integración: **el id de cada ítem en Uber es el uuid del
// producto en VIM**. Así, cuando llega un pedido, `normalizarPedidoUber` reconoce los ítems sin
// tabla de mapeo y `crear_ticket_desde_app` los convierte en renglones del ticket. Sin este menú
// la tienda de Uber no tiene nada que vender, o vende ids que el POS no conoce (`items_sin_mapear`).
//
// Módulo puro: recibe productos, categorías y grupos de modificadores ya leídos, devuelve el
// cuerpo exacto que espera Uber. Precios en centavos (Uber no acepta decimales); IVA como
// `tax_rate`. Los combos todavía no se exponen (van en una entrega aparte).

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

export type GrupoModificadorCarta = {
  id: string;
  nombre: string;
  tipo_seleccion: "UNICA_OBLIGATORIA" | "UNICA_OPCIONAL" | "MULTIPLE_OPCIONAL" | "MULTIPLE_OBLIGATORIA_RANGO";
  minimo_selecciones: number | null;
  maximo_selecciones: number | null;
  opciones: { id: string; nombre: string; precio_extra_mxn: number | string; agotada?: boolean }[];
  /** Productos a los que se aplica, en el orden en que los pide la caja. */
  producto_ids: string[];
};

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
 * Cantidades del grupo según su tipo (enum `modificador_tipo_seleccion`, 0007). Uber necesita
 * min/max explícitos; el POS los deduce del tipo salvo en el rango, que sí los guarda.
 */
export function cantidadesDeGrupo(
  g: Pick<GrupoModificadorCarta, "tipo_seleccion" | "minimo_selecciones" | "maximo_selecciones">,
  nOpciones: number,
): { min_permitted: number; max_permitted: number } {
  switch (g.tipo_seleccion) {
    case "UNICA_OBLIGATORIA": return { min_permitted: 1, max_permitted: 1 };
    case "UNICA_OPCIONAL": return { min_permitted: 0, max_permitted: 1 };
    case "MULTIPLE_OPCIONAL": return { min_permitted: 0, max_permitted: Math.max(1, nOpciones) };
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return { min_permitted: g.minimo_selecciones ?? 1, max_permitted: g.maximo_selecciones ?? Math.max(1, nOpciones) };
  }
}

/**
 * Arma el menú. Excluye productos sin precio, agotados, ocultos o con id inválido; las categorías
 * sin productos no van; los productos sin categoría caen en «Otros». Devuelve también los conteos
 * y los productos excluidos con su motivo, para que el admin diga qué quedó fuera.
 */
export function construirMenuUber(
  productos: ProductoCarta[],
  categorias: CategoriaCarta[],
  opciones: { titulo?: string; grupos?: GrupoModificadorCarta[]; combos?: unknown[] } = {},
): {
  menu: MenuUber;
  items: number;
  categorias: number;
  grupos: number;
  opcionesModificador: number;
  excluidos: { id: string; nombre: string; motivo: string }[];
} {
  const excluidos: { id: string; nombre: string; motivo: string }[] = [];
  const items: unknown[] = [];
  const porCategoria = new Map<string, string[]>();

  // Un grupo sin opciones rompe la sincronización de la carta entera (documentado por Toast), así
  // que no se publica. Si era obligatorio, su producto queda inordenable: se excluye también.
  const gruposVivos = (opciones.grupos ?? [])
    .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !o.agotada && idValidoUber(o.id)) }))
    .filter((g) => g.opciones.length > 0);
  const gruposPorProducto = new Map<string, string[]>();
  for (const g of gruposVivos) for (const pid of g.producto_ids) {
    gruposPorProducto.set(pid, [...(gruposPorProducto.get(pid) ?? []), g.id]);
  }
  const obligatorioVacio = new Set<string>();
  for (const g of opciones.grupos ?? []) {
    const vivo = gruposVivos.some((v) => v.id === g.id);
    const obligatorio = g.tipo_seleccion === "UNICA_OBLIGATORIA" || g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO";
    if (!vivo && obligatorio) for (const pid of g.producto_ids) obligatorioVacio.add(pid);
  }

  for (const p of productos) {
    const precio = centavos(p.precio_base_mxn);
    const motivo = !idValidoUber(p.id) ? "id inválido para Uber"
      : p.visible === false ? "oculto en el POS"
      : p.agotado ? "agotado"
      : precio <= 0 ? "sin precio"
      : p.es_combo && !(p.n_slots && p.n_slots > 0) ? "combo sin slots"
      : obligatorioVacio.has(p.id) ? "grupo obligatorio sin opciones"
      : null;
    if (motivo) { excluidos.push({ id: p.id, nombre: p.nombre, motivo }); continue; }
    const item: Record<string, unknown> = {
      id: p.id,
      title: texto(p.nombre || "Producto"),
      price_info: { price: precio },
      tax_info: { tax_rate: Math.max(0, Number(p.tasa_iva ?? 16) || 0) },
      quantity_info: {},
      modifier_group_ids: { ids: gruposPorProducto.get(p.id) ?? [] },
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

  // Las opciones se empujan a `items` aquí, después de cerrar `porCategoria`, para que no puedan
  // colarse en ninguna categoría: no se venden sueltas, solo como parte de un grupo.
  const modifierGroups: unknown[] = [];
  let nOpciones = 0;
  for (const g of gruposVivos) {
    for (const o of g.opciones) {
      const precio = Math.max(0, Math.round(Number(o.precio_extra_mxn) * 100) || 0);
      items.push({
        id: o.id,
        title: texto(o.nombre || "Opción"),
        // Uber SUMA el precio de la opción al del padre, así que aquí va el extra tal cual.
        // `core_price` es lo que Uber usa para calcular un reembolso parcial.
        price_info: { price: precio, core_price: precio },
        tax_info: { tax_rate: 16 },
        quantity_info: {},
        modifier_group_ids: { ids: [] },
        external_data: o.id,
      });
      nOpciones += 1;
    }
    modifierGroups.push({
      id: g.id,
      external_data: g.id,
      title: texto(g.nombre || "Opciones"),
      quantity_info: { quantity: cantidadesDeGrupo(g, g.opciones.length) },
      modifier_options: g.opciones.map((o) => ({ type: "ITEM" as const, id: o.id })),
      display_type: "expanded",
    });
  }

  const menu: MenuUber = {
    items,
    modifier_groups: modifierGroups,
    categories,
    menus: [{
      id: "carta",
      title: texto(opciones.titulo ?? "Carta"),
      service_availability: DIAS.map((day_of_week) => ({ day_of_week, time_periods: [{ start_time: "00:00", end_time: "23:59" }] })),
      category_ids: categories.map((c) => c.id),
    }],
  };
  return {
    menu,
    items: items.length,
    categorias: categories.length,
    grupos: modifierGroups.length,
    opcionesModificador: nOpciones,
    excluidos,
  };
}
