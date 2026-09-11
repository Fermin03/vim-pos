// Carta de VIM → menú de Uber Eats (Menu API v2, `PUT /v2/eats/stores/{id}/menus`).
//
// La regla que hace funcionar toda la integración: **el id de cada ítem en Uber es el uuid del
// producto en VIM**. Así, cuando llega un pedido, `normalizarPedidoUber` reconoce los ítems sin
// tabla de mapeo y `crear_ticket_desde_app` los convierte en renglones del ticket. Sin este menú
// la tienda de Uber no tiene nada que vender, o vende ids que el POS no conoce (`items_sin_mapear`).
//
// Módulo puro: recibe productos, categorías, grupos de modificadores y combos ya leídos, devuelve
// el cuerpo exacto que espera Uber. Precios en centavos (Uber no acepta decimales); IVA como
// `tax_rate`. Un combo se publica como el producto padre más un `modifier_group` por slot, cuyas
// opciones son los productos reales de la carta — el mismo cálculo aditivo que hace el servidor
// en `agregar_combo_a_ticket`.

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

export type ComboCarta = {
  producto_id: string;
  slots: {
    id: string;
    nombre: string;
    orden: number;
    minimo_selecciones: number;
    maximo_selecciones: number;
    /** Ya resueltas por quien consulta: categoría o lista, exclusiones aplicadas, agotados fuera.
     *  `importe_mxn` es lo que la opción aporta al precio del combo, con la fórmula del servidor. */
    opciones: { producto_id: string; importe_mxn: number | string }[];
  }[];
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
  opciones: { titulo?: string; grupos?: GrupoModificadorCarta[]; combos?: ComboCarta[] } = {},
): {
  menu: MenuUber;
  items: number;
  categorias: number;
  grupos: number;
  opcionesModificador: number;
  combos: number;
  excluidos: { id: string; nombre: string; motivo: string }[];
} {
  const excluidos: { id: string; nombre: string; motivo: string }[] = [];
  const items: unknown[] = [];
  const porCategoria = new Map<string, string[]>();

  // Motivo de exclusión que no depende de combos ni de grupos: id inválido, oculto, agotado o sin
  // precio. Se usa tanto para la cadena de exclusión del producto (abajo) como para decidir qué
  // productos están realmente en la carta que se publica (`enCarta`, abajo) — el mismo criterio en
  // un solo sitio, para que un producto excluido nunca aparezca como opción de un slot.
  const motivoBase = (p: ProductoCarta): string | null =>
    !idValidoUber(p.id) ? "id inválido para Uber"
    : p.visible === false ? "oculto en el POS"
    : p.agotado ? "agotado"
    : centavos(p.precio_base_mxn) <= 0 ? "sin precio"
    : null;

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

  // Un combo al que le falta un slot es inordenable en Uber (rechazo MISSING_ITEM): no se publica.
  // Las opciones que ya no están en la carta (agotadas, ocultas, sin precio) simplemente no cuentan;
  // `enCarta` usa el mismo `motivoBase` que la cadena de exclusión de abajo, para que un slot
  // nunca apunte a un `modifier_option` que Uber no va a encontrar en `items[]`.
  const enCarta = new Set(productos.filter((p) => motivoBase(p) === null).map((p) => p.id));
  const combosVivos: ComboCarta[] = [];
  const comboSinSlot = new Set<string>();
  for (const c of opciones.combos ?? []) {
    const slots = [...c.slots].sort((a, b) => a.orden - b.orden)
      .map((s) => ({ ...s, opciones: s.opciones.filter((o) => enCarta.has(o.producto_id) && idValidoUber(o.producto_id)) }));
    if (slots.length === 0 || slots.some((s) => s.opciones.length === 0)) { comboSinSlot.add(c.producto_id); continue; }
    combosVivos.push({ ...c, slots });
  }
  const slotsPorCombo = new Map<string, string[]>();
  /** producto → ajustes que le tocan por estar en un slot. */
  const ajustesPrecio = new Map<string, { context_type: "MODIFIER_GROUP"; context_value: string; price: number; core_price: number }[]>();
  const ajustesCantidad = new Map<string, { context_type: "MODIFIER_GROUP"; context_value: string; quantity: { min_permitted: number; max_permitted: number } }[]>();
  for (const c of combosVivos) {
    slotsPorCombo.set(c.producto_id, c.slots.map((s) => s.id));
    for (const s of c.slots) for (const o of s.opciones) {
      const suelto = centavos(productos.find((p) => p.id === o.producto_id)?.precio_base_mxn ?? 0);
      ajustesPrecio.set(o.producto_id, [...(ajustesPrecio.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id,
          price: Math.max(0, Math.round(Number(o.importe_mxn) * 100) || 0), core_price: suelto }]);
      ajustesCantidad.set(o.producto_id, [...(ajustesCantidad.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id,
          quantity: { min_permitted: 0, max_permitted: 1 } }]);
    }
  }

  for (const p of productos) {
    const precio = centavos(p.precio_base_mxn);
    const motivo = motivoBase(p)
      ?? (p.es_combo && !(p.n_slots && p.n_slots > 0) ? "combo sin slots"
      : obligatorioVacio.has(p.id) ? "grupo obligatorio sin opciones"
      : comboSinSlot.has(p.id) ? "slot sin opciones"
      : null);
    if (motivo) { excluidos.push({ id: p.id, nombre: p.nombre, motivo }); continue; }
    const item: Record<string, unknown> = {
      id: p.id,
      title: texto(p.nombre || "Producto"),
      price_info: { price: precio },
      tax_info: { tax_rate: Math.max(0, Number(p.tasa_iva ?? 16) || 0) },
      quantity_info: {},
      // Los grupos de modificadores propios van primero; los slots de combo que traen a este
      // producto como opción, después — un combo no tiene grupos propios publicados (invariante
      // del spec), y un producto que es opción de un slot sí puede tener los suyos.
      modifier_group_ids: { ids: [...(gruposPorProducto.get(p.id) ?? []), ...(slotsPorCombo.get(p.id) ?? [])] },
      external_data: p.id,
    };
    if (p.descripcion && p.descripcion.trim()) item.description = texto(p.descripcion);
    const ajP = ajustesPrecio.get(p.id);
    if (ajP?.length) item.price_info = { price: precio, overrides: ajP };
    const ajC = ajustesCantidad.get(p.id);
    if (ajC?.length) item.quantity_info = { quantity: {}, overrides: ajC };
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

  // Cada slot de combo se publica como un modifier_group más, con las mismas opciones de la carta;
  // el precio aditivo de Uber ya está resuelto en `ajustesPrecio` sobre el ítem de cada opción.
  for (const c of combosVivos) {
    for (const s of c.slots) {
      modifierGroups.push({
        id: s.id,
        external_data: s.id,
        title: texto(s.nombre || "Elige"),
        quantity_info: { quantity: { min_permitted: s.minimo_selecciones, max_permitted: s.maximo_selecciones } },
        modifier_options: s.opciones.map((o) => ({ type: "ITEM" as const, id: o.producto_id })),
        display_type: "expanded",
      });
    }
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
    combos: combosVivos.length,
    excluidos,
  };
}
