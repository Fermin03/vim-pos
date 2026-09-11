// Carta de VIM → menú de Uber Eats (Menu API v2, `PUT /v2/eats/stores/{id}/menus`).
//
// La regla que hace funcionar toda la integración: **el id de cada ítem en Uber es el uuid del
// producto en VIM**. Así, cuando llega un pedido, `normalizarPedidoUber` reconoce los ítems sin
// tabla de mapeo y `crear_ticket_desde_app` los convierte en renglones del ticket. Sin este menú
// la tienda de Uber no tiene nada que vender, o vende ids que el POS no conoce (`items_sin_mapear`).
//
// Módulo puro: recibe productos, categorías, grupos de modificadores y combos ya leídos, devuelve
// el cuerpo exacto que espera Uber. Precios en centavos (Uber no acepta decimales); IVA como
// `vat_rate_percentage`. Un combo se publica como el producto padre más un `modifier_group` por slot, cuyas
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
 * Motivo de exclusión que no depende de combos ni de grupos: id inválido, oculto, agotado o sin
 * precio. Es el único criterio para decidir si un producto entra a `items[]`, y el mismo que usa
 * `combosPublicables` para saber qué productos están realmente "en la carta" — para que un slot
 * de combo nunca apunte a una opción (o a un padre) que Uber no va a encontrar.
 */
function motivoBase(p: ProductoCarta): string | null {
  return !idValidoUber(p.id) ? "id inválido para Uber"
    : p.visible === false ? "oculto en el POS"
    : p.agotado ? "agotado"
    : centavos(p.precio_base_mxn) <= 0 ? "sin precio"
    : null;
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
      // El máximo nunca puede pedir más de las opciones que de verdad se publican: si una
      // agotada se llevó parte del rango, Uber no puede ofrecer un `max_permitted` que no
      // alcanza. El mínimo insuficiente no se corrige aquí — ese caso hace que el grupo entero
      // se trate como obligatorio vacío antes de llegar a esta función (Importante 4, revisión
      // final: ver `gruposVivos` en `construirMenuUber`).
      return { min_permitted: g.minimo_selecciones ?? 1, max_permitted: Math.min(g.maximo_selecciones ?? nOpciones, nOpciones) };
  }
}

/**
 * Arma los grupos de modificadores de la carta a partir de las filas ya consultadas (PostgREST):
 * opciones por grupo y productos a los que se aplica, en el orden en que los pide la caja. Función
 * pura — solo transforma filas ya leídas, no toca la base; vive aquí (y no en la Edge Function que
 * la llama) para poder probarla igual que el resto del módulo.
 */
export function armarGruposModificadorCarta(
  grupos: Record<string, unknown>[],
  opciones: Record<string, unknown>[],
  vinculos: Record<string, unknown>[],
): GrupoModificadorCarta[] {
  const opcionesPorGrupo = new Map<string, GrupoModificadorCarta["opciones"]>();
  for (const o of opciones) {
    const k = String(o.grupo_id);
    opcionesPorGrupo.set(k, [...(opcionesPorGrupo.get(k) ?? []),
      { id: String(o.id), nombre: String(o.nombre ?? ""), precio_extra_mxn: o.precio_extra_mxn as number, agotada: o.agotada === true }]);
  }
  const productosPorGrupo = new Map<string, { pid: string; orden: number }[]>();
  for (const r of vinculos) {
    const k = String(r.grupo_id);
    productosPorGrupo.set(k, [...(productosPorGrupo.get(k) ?? []),
      { pid: String(r.producto_id), orden: Number(r.orden_visualizacion ?? 0) }]);
  }
  return grupos.map((g) => ({
    id: String(g.id), nombre: String(g.nombre ?? ""),
    tipo_seleccion: g.tipo_seleccion as GrupoModificadorCarta["tipo_seleccion"],
    minimo_selecciones: (g.minimo_selecciones as number | null) ?? null,
    maximo_selecciones: (g.maximo_selecciones as number | null) ?? null,
    opciones: opcionesPorGrupo.get(String(g.id)) ?? [],
    producto_ids: (productosPorGrupo.get(String(g.id)) ?? []).sort((a, b) => a.orden - b.orden).map((x) => x.pid),
  }));
}

/**
 * Resuelve las opciones de cada slot de combo con el mismo criterio que la RPC
 * `agregar_combo_a_ticket` (0111_combos.sql:338-350) — y que ya usan la caja (`apps/pos/app/lib/
 * combos.ts: armarCombos`) y la vista previa del admin (`apps/admin/app/lib/combos.ts`): con
 * `categoria_id`, todos los productos vendibles de esa categoría salvo los excluidos explícitamente
 * (`combo_opciones.activa = false`); sin `categoria_id`, exactamente las filas explícitas activas.
 * "Vendible" = producto activo (ya filtrado en la consulta), visible en el POS, no agotado y no
 * combo (un combo no puede ser componente de otro combo). El importe que cada opción aporta es
 * `precio_base_mxn` (solo si el slot es `SUMA_PRECIO_PRODUCTO`) más su `precio_delta_mxn`.
 *
 * Nota: la RPC, leída al pie de la letra, es un poco más permisiva en dos casos de borde — una
 * fila explícita activa para un producto fuera de la categoría del slot, o sobre un producto
 * oculto del POS — porque su rama `IF FOUND` no repite las comprobaciones de categoría ni de
 * `visible_en_pos`. No se replica esa permisividad a propósito: el editor de combos del admin no
 * deja crear ese primer caso (sin buscador para productos ajenos a la categoría en un slot por
 * categoría), el segundo caso no cambia el menú publicado de todos modos (`construirMenuUber`
 * excluye un producto oculto vía `motivoBase` aunque llegara como opción), y esta simplificación es
 * la misma que ya usan la caja y el admin — replicar la RPC al pie de la letra habría desalineado
 * *esta* función del resto del sistema. Publicar un conjunto más amplio que el que acepta la RPC sí
 * sería grave (el pedido entra y revienta al crear el ticket, con el cliente ya cobrado); publicar
 * de menos, en estos dos casos de borde, no lo es.
 */
export function armarCombosCarta(
  productos: ProductoCarta[],
  comboGrupos: Record<string, unknown>[],
  comboOpciones: Record<string, unknown>[],
): ComboCarta[] {
  const opcionesPorSlot = new Map<string, Record<string, unknown>[]>();
  for (const o of comboOpciones) {
    const k = String(o.grupo_id);
    opcionesPorSlot.set(k, [...(opcionesPorSlot.get(k) ?? []), o]);
  }
  const vendibles = new Map(productos.filter((p) => !p.es_combo && p.visible !== false && !p.agotado).map((p) => [p.id, p]));
  const slotsPorCombo = new Map<string, ComboCarta["slots"]>();
  for (const s of comboGrupos) {
    const explicitas = opcionesPorSlot.get(String(s.id)) ?? [];
    const excluidos = new Set(explicitas.filter((o) => o.activa === false).map((o) => String(o.producto_id)));
    const delta = new Map(explicitas.filter((o) => o.activa !== false).map((o) => [String(o.producto_id), Number(o.precio_delta_mxn ?? 0)]));
    const sumaPrecioProducto = s.modo_precio === "SUMA_PRECIO_PRODUCTO";
    const candidatos = s.categoria_id
      ? [...vendibles.values()].filter((p) => p.categoria_id === String(s.categoria_id) && !excluidos.has(p.id))
      : [...delta.keys()].flatMap((pid) => { const p = vendibles.get(pid); return p ? [p] : []; });
    const opcionesSlot = candidatos.map((p) => ({
      producto_id: p.id,
      importe_mxn: (sumaPrecioProducto ? Number(p.precio_base_mxn) : 0) + (delta.get(p.id) ?? 0),
    }));
    const comboProductoId = String(s.combo_producto_id);
    slotsPorCombo.set(comboProductoId, [...(slotsPorCombo.get(comboProductoId) ?? []), {
      id: String(s.id), nombre: String(s.nombre ?? ""), orden: Number(s.orden_visualizacion ?? 0),
      minimo_selecciones: Number(s.minimo_selecciones ?? 1), maximo_selecciones: Number(s.maximo_selecciones ?? 1),
      opciones: opcionesSlot,
    }]);
  }
  return [...slotsPorCombo.entries()].map(([producto_id, slots]) => ({ producto_id, slots }));
}

type AjustePrecio = { context_type: "MODIFIER_GROUP"; context_value: string; price: number; core_price: number };
type AjusteCantidad = { context_type: "MODIFIER_GROUP"; context_value: string; quantity: { min_permitted: number; max_permitted: number } };

/**
 * Decide qué combos son publicables y qué ajuste de precio/cantidad le toca, por slot, a cada
 * producto que es opción de uno.
 *
 * Un combo se publica solo si su propio producto (el padre) también se publica: si el padre está
 * agotado, oculto, sin precio, con id inválido (`motivoBase`), o si su conteo de slots en la base
 * dice que no tiene ninguno ("combo sin slots"), sus grupos-slot quedarían huérfanos —publicados
 * sin que ningún ítem los referencie— y sus opciones cargarían un ajuste de precio que nadie usa.
 * Luego, un combo al que le falta un slot es inordenable en Uber (rechazo MISSING_ITEM): tampoco
 * se publica. Las opciones que ya no están en la carta (agotadas, ocultas, sin precio) simplemente
 * no cuentan.
 */
function combosPublicables(
  productos: ProductoCarta[],
  combos: ComboCarta[],
): {
  combosVivos: ComboCarta[];
  comboSinSlot: Set<string>;
  slotsPorCombo: Map<string, string[]>;
  ajustesPrecio: Map<string, AjustePrecio[]>;
  ajustesCantidad: Map<string, AjusteCantidad[]>;
} {
  const enCarta = new Set(productos.filter((p) => motivoBase(p) === null).map((p) => p.id));
  const padreVivo = (id: string): boolean => {
    const p = productos.find((pp) => pp.id === id);
    return !!p && motivoBase(p) === null && !(p.es_combo && !(p.n_slots && p.n_slots > 0));
  };
  const combosVivos: ComboCarta[] = [];
  const comboSinSlot = new Set<string>();
  for (const c of combos) {
    if (!padreVivo(c.producto_id)) continue; // el padre ya se excluye por su propio motivo
    const slots = [...c.slots].sort((a, b) => a.orden - b.orden)
      .map((s) => ({ ...s, opciones: s.opciones.filter((o) => enCarta.has(o.producto_id)) }));
    // No basta con "vacío": un slot con menos opciones vivas que su propio mínimo (p. ej. "elige 2
    // bebidas" con una sola bebida viva) es igual de inordenable — el cliente no puede repetir una
    // opción para llegar al mínimo, porque cada opción lleva max_permitted: 1 por contexto (más
    // abajo). Importante 3, revisión final.
    if (slots.length === 0 || slots.some((s) => s.opciones.length < s.minimo_selecciones)) { comboSinSlot.add(c.producto_id); continue; }
    combosVivos.push({ ...c, slots });
  }
  const slotsPorCombo = new Map<string, string[]>();
  const ajustesPrecio = new Map<string, AjustePrecio[]>();
  const ajustesCantidad = new Map<string, AjusteCantidad[]>();
  for (const c of combosVivos) {
    slotsPorCombo.set(c.producto_id, c.slots.map((s) => s.id));
    for (const s of c.slots) for (const o of s.opciones) {
      const suelto = centavos(productos.find((p) => p.id === o.producto_id)?.precio_base_mxn ?? 0);
      ajustesPrecio.set(o.producto_id, [...(ajustesPrecio.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id, price: centavos(o.importe_mxn), core_price: suelto }]);
      ajustesCantidad.set(o.producto_id, [...(ajustesCantidad.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id, quantity: { min_permitted: 0, max_permitted: 1 } }]);
    }
  }
  return { combosVivos, comboSinSlot, slotsPorCombo, ajustesPrecio, ajustesCantidad };
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

  // Un combo no publica sus propios grupos de modificadores (invariante 5 del spec §3: la línea
  // del padre no admite modificadores — 0111_combos.sql:387-389 — y publicarlos obligaría a
  // distinguir en el pedido entrante un grupo-slot de un grupo-modificador sobre el mismo
  // producto). Se filtra aquí, en el origen de `gruposPorProducto` y `obligatorioVacio`, para que
  // un grupo asignado a un combo por error (p. ej. una asignación masiva que no excluye combos)
  // nunca llegue a publicarse en su `modifier_group_ids` (Importante 1, revisión final) ni pueda
  // tumbar al combo de la carta por "grupo obligatorio sin opciones" (Importante 2).
  const combosIds = new Set(productos.filter((p) => p.es_combo).map((p) => p.id));

  // Un grupo sin opciones rompe la sincronización de la carta entera (documentado por Toast), así
  // que no se publica. Si era obligatorio, su producto queda inordenable: se excluye también. Un
  // MULTIPLE_OBLIGATORIA_RANGO cuyo mínimo ya no cabe en las opciones vivas (una o más se agotaron)
  // es igual de inordenable aunque no esté vacío del todo: se trata como si lo estuviera
  // (Importante 4, revisión final) en vez de publicar un rango que Uber no puede cumplir.
  const gruposVivos = (opciones.grupos ?? [])
    .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !o.agotada && idValidoUber(o.id)) }))
    .filter((g) => g.opciones.length > 0
      && !(g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.opciones.length < (g.minimo_selecciones ?? 1)));
  const gruposPorProducto = new Map<string, string[]>();
  for (const g of gruposVivos) for (const pid of g.producto_ids) {
    if (combosIds.has(pid)) continue;
    gruposPorProducto.set(pid, [...(gruposPorProducto.get(pid) ?? []), g.id]);
  }
  const obligatorioVacio = new Set<string>();
  for (const g of opciones.grupos ?? []) {
    const vivo = gruposVivos.some((v) => v.id === g.id);
    const obligatorio = g.tipo_seleccion === "UNICA_OBLIGATORIA" || g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO";
    if (!vivo && obligatorio) for (const pid of g.producto_ids) {
      if (combosIds.has(pid)) continue;
      obligatorioVacio.add(pid);
    }
  }

  const { combosVivos, comboSinSlot, slotsPorCombo, ajustesPrecio, ajustesCantidad } =
    combosPublicables(productos, opciones.combos ?? []);

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
      tax_info: { vat_rate_percentage: Math.max(0, Number(p.tasa_iva ?? 16) || 0) },
      quantity_info: {},
      // Los grupos de modificadores propios van primero (ya sin los de un combo: ver
      // `combosIds` arriba); después, si ESTE producto ES el padre de un combo, sus propios
      // slots — `slotsPorCombo` está indexado por el producto padre, no por sus opciones (spec
      // §4.3: "el combo padre... y sus slots en modifier_group_ids.ids").
      modifier_group_ids: { ids: [...(gruposPorProducto.get(p.id) ?? []), ...(slotsPorCombo.get(p.id) ?? [])] },
      external_data: p.id,
    };
    if (p.descripcion && p.descripcion.trim()) item.description = texto(p.descripcion);
    const ajP = ajustesPrecio.get(p.id);
    if (ajP?.length) item.price_info = { price: precio, overrides: ajP };
    const ajC = ajustesCantidad.get(p.id);
    if (ajC?.length) item.quantity_info = { overrides: ajC };
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
      const precio = centavos(o.precio_extra_mxn);
      items.push({
        id: o.id,
        title: texto(o.nombre || "Opción"),
        // Uber SUMA el precio de la opción al del padre, así que aquí va el extra tal cual.
        // `core_price` es lo que Uber usa para calcular un reembolso parcial.
        price_info: { price: precio, core_price: precio },
        tax_info: { vat_rate_percentage: 16 },
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
