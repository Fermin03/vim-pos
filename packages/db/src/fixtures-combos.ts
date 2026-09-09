// Fixture compartida del PRECIO DE UN COMBO (ADR 0015).
//
// El precio de un combo está implementado TRES veces: la RPC `agregar_combo_a_ticket` (migración
// 0110), `precioCombo` en la caja (`apps/pos/app/lib/combos.ts`) y `precioCombo` en el admin
// (`apps/admin/app/lib/combos.ts`, que dibuja la vista previa que el dueño usa para poner el
// precio). Las tres coinciden hoy, y hasta la revisión final de la rama lo único que las sostenía
// era que dos archivos de prueba distintos codificaban a mano los mismos 190 y 140: si una de las
// implementaciones se hubiera movido, el otro archivo habría seguido en verde.
//
// Con esta fixture, las pruebas de la caja y las del admin leen los MISMOS números, así que una
// divergencia rompe algo en vez de pasar desapercibida.
//
// Vive en `@vim/db` porque es el único paquete del que dependen las dos apps; no es un cliente de
// base de datos, es el contrato de precio que ambas (y la RPC) tienen que respetar.
//
// El smoke SQL (`supabase/scripts/smoke_combos.sql`) NO comparte esta fixture a propósito: usa la
// semilla de desarrollo, con sus propios productos y sus propios precios ($175). Intentar
// compartir números entre TypeScript y un .sql que corre sobre otra semilla costaría más de lo que
// protege.

export type OpcionCombo = {
  productoId: string;
  nombre: string;
  /** Precio del producto suelto, a la carta. */
  precioMxn: number;
  /** Lo que suma elegir esta opción dentro del slot (además del precio, si el modo lo suma). */
  deltaMxn: number;
  esDefault: boolean;
};

export type SlotCombo = {
  id: string;
  nombre: string;
  modoPrecio: "DELTA" | "SUMA_PRECIO_PRODUCTO";
  /** Categoría de la que salen los productos del slot; identifica al grupo también cuando el slot
   *  se define por lista explícita. */
  categoriaId: string;
  /** true = el slot toma la categoría entera; false = lista explícita de opciones. */
  porCategoria: boolean;
  opciones: OpcionCombo[];
};

/** Lo que cuesta "hacerlo combo" antes de elegir nada. */
export const COMBO_BASE_MXN = 45;

export const SLOTS_COMBO: SlotCombo[] = [
  {
    id: "g-hamb",
    nombre: "Hamburguesa",
    modoPrecio: "SUMA_PRECIO_PRODUCTO",
    categoriaId: "cat-hamb",
    porCategoria: true,
    opciones: [
      { productoId: "h1", nombre: "Clásica", precioMxn: 95, deltaMxn: 0, esDefault: false },
      { productoId: "h2", nombre: "Doble", precioMxn: 130, deltaMxn: 0, esDefault: false },
    ],
  },
  {
    id: "g-acom",
    nombre: "Acompañamiento",
    modoPrecio: "DELTA",
    categoriaId: "cat-acom",
    porCategoria: false,
    opciones: [
      { productoId: "a1", nombre: "Papas", precioMxn: 45, deltaMxn: 0, esDefault: true },
      { productoId: "a2", nombre: "Aros", precioMxn: 55, deltaMxn: 15, esDefault: false },
    ],
  },
  {
    id: "g-beb",
    nombre: "Bebida",
    modoPrecio: "DELTA",
    categoriaId: "cat-beb",
    porCategoria: false,
    opciones: [
      { productoId: "b1", nombre: "Refresco", precioMxn: 30, deltaMxn: 0, esDefault: true },
      { productoId: "b2", nombre: "Malteada", precioMxn: 55, deltaMxn: 25, esDefault: false },
    ],
  },
];

/** Una selección: qué producto se eligió en cada slot, y lo que el combo tiene que cobrar. */
export type CasoPrecioCombo = {
  /** grupo_id → producto_id. */
  seleccion: Record<string, string>;
  esperadoMxn: number;
};

export const CASOS_PRECIO_COMBO: Record<
  "dobleArosRefresco" | "clasicaConDefaults" | "dobleConDefaults",
  CasoPrecioCombo
> = {
  // 45 (base) + 130 (la Doble, porque el slot suma el precio del producto) + 15 (Aros) + 0.
  dobleArosRefresco: { seleccion: { "g-hamb": "h2", "g-acom": "a2", "g-beb": "b1" }, esperadoMxn: 190 },
  // 45 + 95 + 0 + 0.
  clasicaConDefaults: { seleccion: { "g-hamb": "h1", "g-acom": "a1", "g-beb": "b1" }, esperadoMxn: 140 },
  // 45 + 130 + 0 + 0: es la fila "Doble" de la vista previa del admin.
  dobleConDefaults: { seleccion: { "g-hamb": "h2", "g-acom": "a1", "g-beb": "b1" }, esperadoMxn: 175 },
};

/** Busca una opción por id de producto en cualquier slot. Falla fuerte: la fixture es fija. */
export function opcionCombo(productoId: string): OpcionCombo & { slot: SlotCombo } {
  for (const slot of SLOTS_COMBO) {
    const o = slot.opciones.find((x) => x.productoId === productoId);
    if (o) return { ...o, slot };
  }
  throw new Error(`La fixture de combos no tiene el producto ${productoId}`);
}
