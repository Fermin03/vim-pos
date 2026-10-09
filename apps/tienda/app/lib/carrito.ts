// El carrito de la tienda: estado puro (cada operación devuelve un carrito nuevo), las reglas de
// modificadores y combos, el estimado, el cuerpo que espera la función y su guardado en el teléfono.
//
// Las reglas de selección son las MISMAS que aplica la base al cotizar (0162, `_tienda_modificadores`
// y el bloque de combos de `tienda_cotizar`): aquí solo sirven para no dejar agregar algo que la
// base va a rechazar y para decir qué falta. La base sigue siendo la que decide.
//
// Precios NUNCA se guardan: el estimado sale del menú vigente y el total que manda es el de `cotizar`.
import type { Grupo, Menu, Modo, Producto } from "./contrato";
import { aCentavos } from "./dinero";

/** Los topes de la función (anexo §1.8). */
export const TOPES = { renglones: 40, porRenglon: 50, porModificador: 10, nota: 200 } as const;
const CADUCA_MS = 24 * 60 * 60 * 1000;

export type ModificadorElegido = { opcionId: string; cantidad: number };
export type ComponenteElegido = { grupoId: string; productoId: string; cantidad: number; modificadores: ModificadorElegido[] };
/** Lo que el cliente va eligiendo en la hoja de un producto. En un combo, todo va en `componentes`. */
export type Seleccion = { modificadores: ModificadorElegido[]; componentes: ComponenteElegido[] };

type ModificadorGuardado = ModificadorElegido & { nombre: string };
export type RenglonCarrito = {
  /** Local, para React. */
  id: string;
  productoId: string; nombre: string; cantidad: number; nota: string;
  modificadores: ModificadorGuardado[];
  componentes: { grupoId: string; productoId: string; nombre: string; cantidad: number; modificadores: ModificadorGuardado[] }[];
};
export type Carrito = {
  v: 1; sucursalId: string; modo: Modo; zonaId: string | null; renglones: RenglonCarrito[];
  /** Cuándo se guardó (ms). Lo pone `guardarCarrito`. */
  guardado: number;
};

export function carritoNuevo(sucursalId: string, modo: Modo, zonaId: string | null = null): Carrito {
  return { v: 1, sucursalId, modo, zonaId, renglones: [], guardado: 0 };
}

// ── Reglas de selección ──────────────────────────────────────────────────────────────────────────
export type Falta = {
  /** El id del grupo o slot con el problema (o el de la opción, si no es de ningún grupo; o el del producto, si se agotó). */
  donde: string;
  motivo: "FALTAN" | "SOBRAN" | "AGOTADO" | "DESCONOCIDO" | "REPETIDO" | "CANTIDAD";
  /** Para el cliente. */
  texto: string;
};

const cantidadValida = (n: number, max: number): boolean => Number.isInteger(n) && n >= 1 && n <= max;
const NO_DISPONIBLE = "Una de tus elecciones ya no está disponible.";

function sumas(pide: { id: string; nombre: string; minimo: number; maximo: number | null }[], n: Map<string, number>): Falta[] {
  const f: Falta[] = [];
  for (const g of pide) {
    const total = n.get(g.id) ?? 0;
    if (total < g.minimo) f.push({ donde: g.id, motivo: "FALTAN", texto: `Elige ${g.maximo === g.minimo ? "" : "al menos "}${g.minimo} en «${g.nombre}».` });
    else if (g.maximo !== null && total > g.maximo) f.push({ donde: g.id, motivo: "SOBRAN", texto: `Elige máximo ${g.maximo} en «${g.nombre}».` });
  }
  return f;
}

/** Los modificadores elegidos contra los grupos que el menú ofrece para ese producto. */
function validarModificadores(grupos: Grupo[], elegidos: ModificadorElegido[]): Falta[] {
  const f: Falta[] = [], n = new Map<string, number>(), vistos = new Set<string>();
  for (const e of elegidos) {
    const g = grupos.find((x) => x.opciones.some((o) => o.id === e.opcionId));
    const o = g?.opciones.find((x) => x.id === e.opcionId);
    if (!g || !o) { f.push({ donde: e.opcionId, motivo: "DESCONOCIDO", texto: NO_DISPONIBLE }); continue; }
    if (vistos.has(o.id)) { f.push({ donde: g.id, motivo: "REPETIDO", texto: `«${o.nombre}» está repetido.` }); continue; }
    vistos.add(o.id);
    if (!cantidadValida(e.cantidad, TOPES.porModificador)) {
      f.push({ donde: g.id, motivo: "CANTIDAD", texto: `Revisa la cantidad de «${o.nombre}» (de 1 a ${TOPES.porModificador}).` });
      continue;
    }
    if (o.agotada) f.push({ donde: g.id, motivo: "AGOTADO", texto: `«${o.nombre}» se agotó.` });
    n.set(g.id, (n.get(g.id) ?? 0) + e.cantidad);
  }
  return [...f, ...sumas(grupos, n)];
}

/**
 * Lo que le falta (o le sobra) a una selección para poder agregarse. Vacío = válida.
 * En un combo: cada elección es de su slot y no está agotada, cada slot cumple su mínimo y máximo,
 * el mismo producto no va dos veces (ni en slots distintos) y los modificadores de cada elección
 * cumplen sus grupos.
 */
export function validarSeleccion(producto: Producto, s: Seleccion): Falta[] {
  const f: Falta[] = [];
  if (producto.agotado) f.push({ donde: producto.id, motivo: "AGOTADO", texto: `«${producto.nombre}» se agotó.` });
  f.push(...validarModificadores(producto.grupos, s.modificadores));

  const n = new Map<string, number>(), vistos = new Set<string>();
  for (const c of s.componentes) {
    const slot = producto.slots.find((x) => x.id === c.grupoId);
    const o = slot?.opciones.find((x) => x.producto_id === c.productoId);
    if (!slot || !o) { f.push({ donde: c.grupoId, motivo: "DESCONOCIDO", texto: NO_DISPONIBLE }); continue; }
    if (vistos.has(o.producto_id)) { f.push({ donde: slot.id, motivo: "REPETIDO", texto: `En un combo no se puede elegir «${o.nombre}» dos veces.` }); continue; }
    vistos.add(o.producto_id);
    if (!cantidadValida(c.cantidad, 999)) { f.push({ donde: slot.id, motivo: "CANTIDAD", texto: `Revisa la cantidad de «${o.nombre}».` }); continue; }
    if (o.agotado) f.push({ donde: slot.id, motivo: "AGOTADO", texto: `«${o.nombre}» se agotó.` });
    n.set(slot.id, (n.get(slot.id) ?? 0) + c.cantidad);
    f.push(...validarModificadores(o.grupos, c.modificadores));
  }
  return [...f, ...sumas(producto.slots, n)];
}

/** Lo marcado por omisión en cada grupo, sin agotados y sin pasarse del máximo. */
function modificadoresIniciales(grupos: Grupo[]): ModificadorElegido[] {
  return grupos.flatMap((g) => g.opciones.filter((o) => o.es_default && !o.agotada).slice(0, g.maximo ?? undefined)
    .map((o) => ({ opcionId: o.id, cantidad: 1 })));
}

/** Con qué abre la hoja de un producto: lo que el negocio marcó por omisión. */
export function seleccionInicial(producto: Producto): Seleccion {
  const usados = new Set<string>();
  const componentes = producto.slots.flatMap((slot) =>
    slot.opciones.filter((o) => o.es_default && !o.agotado && !usados.has(o.producto_id)).slice(0, slot.maximo)
      .map((o): ComponenteElegido => {
        usados.add(o.producto_id);
        return { grupoId: slot.id, productoId: o.producto_id, cantidad: 1, modificadores: modificadoresIniciales(o.grupos) };
      }));
  return { modificadores: modificadoresIniciales(producto.grupos), componentes };
}

// ── Estimado (solo para mostrar antes de cotizar: el total que manda es el de `cotizar`) ─────────
const extras = (grupos: Grupo[], elegidos: ModificadorElegido[]): number => elegidos.reduce((s, e) => {
  const o = grupos.flatMap((g) => g.opciones).find((x) => x.id === e.opcionId);
  return s + (o ? (aCentavos(o.precio_extra_final_mxn) ?? 0) * e.cantidad : 0);
}, 0);

/**
 * Centavos estimados de `cantidad` piezas con esa selección, con los precios finales del menú.
 * Puede diferir del cobro por centavos de redondeo del IVA: por eso es un estimado.
 */
export function estimarSeleccion(producto: Producto, s: Seleccion, cantidad: number): number {
  let pieza = (aCentavos(producto.precio_final_mxn) ?? 0) + extras(producto.grupos, s.modificadores);
  for (const c of s.componentes) {
    const o = producto.slots.find((x) => x.id === c.grupoId)?.opciones.find((x) => x.producto_id === c.productoId);
    if (o) pieza += c.cantidad * ((aCentavos(o.precio_extra_final_mxn) ?? 0) + extras(o.grupos, c.modificadores));
  }
  return pieza * cantidad;
}

const productoDe = (menu: Menu, id: string): Producto | undefined => {
  for (const c of menu.categorias) for (const p of c.productos) if (p.id === id) return p;
  return undefined;
};

/** Centavos estimados de un renglón; null si su producto ya no está en el menú. */
export function estimarRenglon(r: RenglonCarrito, menu: Menu): number | null {
  const p = productoDe(menu, r.productoId);
  return p ? estimarSeleccion(p, r, r.cantidad) : null;
}

/** Centavos estimados del carrito, sin envío. Lo que ya no está en el menú no suma. */
export function estimarTotal(carrito: Carrito, menu: Menu): number {
  return carrito.renglones.reduce((s, r) => s + (estimarRenglon(r, menu) ?? 0), 0);
}

/** Las piezas del carrito, para «Ver pedido · N». */
export function contarPiezas(carrito: Carrito): number {
  return carrito.renglones.reduce((s, r) => s + r.cantidad, 0);
}

// ── Operaciones ──────────────────────────────────────────────────────────────────────────────────
let consecutivo = 0;
/**
 * El id local de un renglón (solo para React y para cambiar o quitar). `crypto.randomUUID` no existe
 * fuera de HTTPS o localhost —probando desde el teléfono contra http://192.168.x.x—, y sin respaldo
 * «Agregar» reventaría ahí. No es un secreto: basta con que no se repita en el carrito.
 */
const idDeRenglon = (): string =>
  (crypto as Partial<Crypto> | undefined)?.randomUUID?.() ?? `r-${Date.now().toString(36)}-${(consecutivo++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const acotar = (n: number, max: number): number => Math.min(max, Math.max(1, Math.trunc(n) || 1));
const firmaMods = (m: ModificadorElegido[]): string => m.map((x) => `${x.opcionId}×${x.cantidad}`).sort().join(",");
/** Dos renglones con la misma firma son el mismo pedido y se suman. El orden de elección no cuenta. */
const firma = (r: Pick<RenglonCarrito, "productoId" | "nota" | "modificadores" | "componentes">): string =>
  [r.productoId, r.nota, firmaMods(r.modificadores),
   r.componentes.map((c) => `${c.grupoId}:${c.productoId}×${c.cantidad}[${firmaMods(c.modificadores)}]`).sort().join(";")].join("|");

/**
 * Agrega al carrito. Si ya hay un renglón idéntico (mismo producto, nota y elecciones) le suma la
 * cantidad, hasta 50. Devuelve EL MISMO carrito (sin cambios) si la selección no es válida o si ya
 * hay 40 renglones y este sería uno nuevo: compruébalo antes con `validarSeleccion` y `TOPES`.
 */
export function agregar(carrito: Carrito, producto: Producto, s: Seleccion, cantidad: number, nota: string): Carrito {
  if (validarSeleccion(producto, s).length > 0) return carrito;
  const conNombre = (grupos: Grupo[], m: ModificadorElegido[]): ModificadorGuardado[] => m.map((e) =>
    ({ opcionId: e.opcionId, nombre: grupos.flatMap((g) => g.opciones).find((o) => o.id === e.opcionId)!.nombre, cantidad: e.cantidad }));
  const nuevo: RenglonCarrito = {
    id: idDeRenglon(), productoId: producto.id, nombre: producto.nombre, cantidad: acotar(cantidad, TOPES.porRenglon),
    nota: Array.from(nota.trim()).slice(0, TOPES.nota).join("").trim(),
    modificadores: conNombre(producto.grupos, s.modificadores),
    componentes: s.componentes.map((c) => {
      const o = producto.slots.find((x) => x.id === c.grupoId)!.opciones.find((x) => x.producto_id === c.productoId)!;
      return { grupoId: c.grupoId, productoId: c.productoId, nombre: o.nombre, cantidad: c.cantidad, modificadores: conNombre(o.grupos, c.modificadores) };
    }),
  };
  const igual = carrito.renglones.find((r) => firma(r) === firma(nuevo));
  if (igual) return cambiarCantidad(carrito, igual.id, igual.cantidad + nuevo.cantidad);
  if (carrito.renglones.length >= TOPES.renglones) return carrito;
  return { ...carrito, renglones: [...carrito.renglones, nuevo] };
}

/** Cero o menos quita el renglón; más de 50 se queda en 50. */
export function cambiarCantidad(carrito: Carrito, id: string, cantidad: number): Carrito {
  if (!(cantidad >= 1)) return quitar(carrito, id);
  return { ...carrito, renglones: carrito.renglones.map((r) => (r.id === id ? { ...r, cantidad: acotar(cantidad, TOPES.porRenglon) } : r)) };
}

export function quitar(carrito: Carrito, id: string): Carrito {
  return { ...carrito, renglones: carrito.renglones.filter((r) => r.id !== id) };
}

/** Sin renglones; la sucursal, el modo y la zona se conservan. */
export function vaciar(carrito: Carrito): Carrito {
  return { ...carrito, renglones: [] };
}

/**
 * Los renglones que ya no se pueden pedir con el menú de ahora, con su aviso: `{ [renglon.id]: texto }`.
 * Vacío = todo bien. Mientras haya alguno no se deja continuar: el cliente lo quita.
 */
export function revalidar(carrito: Carrito, menu: Menu): Record<string, string> {
  const avisos: Record<string, string> = {};
  for (const r of carrito.renglones) {
    const p = productoDe(menu, r.productoId);
    if (!p) avisos[r.id] = "Ya no está disponible. Quítalo para continuar.";
    else if (p.agotado) avisos[r.id] = "Se agotó. Quítalo para continuar.";
    else {
      const falta = validarSeleccion(p, r)[0];
      if (falta) avisos[r.id] = `${falta.texto} Quítalo y vuelve a agregarlo.`;
    }
  }
  return avisos;
}

// ── A la función ─────────────────────────────────────────────────────────────────────────────────
type ModificadorDeCuerpo = { opcion_id: string; cantidad: number };
export type ItemDeCuerpo = {
  producto_id: string; cantidad: number; nota?: string;
  modificadores?: ModificadorDeCuerpo[];
  componentes?: { grupo_id: string; producto_id: string; cantidad: number; modificadores: ModificadorDeCuerpo[] }[];
};
/** La parte del carrito en el cuerpo de `cotizar` y `pedir` (anexo §1.8). */
export type CuerpoCarrito = { sucursal_id: string; modo: Modo; zona_id: string | null; items: ItemDeCuerpo[] };

/**
 * El carrito como lo espera la función. Las cantidades salen como enteros JSON dentro de sus topes
 * (la base rechaza `2.0`, `"2"` y lo que se pase): un carrito guardado raro no produce un 400.
 * Un producto simple lleva `modificadores` y nunca `componentes`; un combo, al revés.
 */
export function aCuerpo(carrito: Carrito): CuerpoCarrito {
  const mods = (m: ModificadorElegido[]): ModificadorDeCuerpo[] =>
    m.map((x) => ({ opcion_id: x.opcionId, cantidad: acotar(x.cantidad, TOPES.porModificador) }));
  return {
    sucursal_id: carrito.sucursalId, modo: carrito.modo,
    zona_id: carrito.modo === "DOMICILIO" ? carrito.zonaId : null,
    items: carrito.renglones.slice(0, TOPES.renglones).map((r) => ({
      producto_id: r.productoId, cantidad: acotar(r.cantidad, TOPES.porRenglon),
      ...(r.nota && { nota: r.nota }),
      ...(r.componentes.length > 0
        ? { componentes: r.componentes.map((c) => ({ grupo_id: c.grupoId, producto_id: c.productoId, cantidad: acotar(c.cantidad, 999), modificadores: mods(c.modificadores) })) }
        : { modificadores: mods(r.modificadores) }),
    })),
  };
}

// ── En el teléfono ───────────────────────────────────────────────────────────────────────────────
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const almacenDelNavegador = (): Almacen | null => (typeof localStorage === "undefined" ? null : localStorage);

export const claveDeCarrito = (slug: string): string => `vim.tienda.${slug}.carrito`;

const txt = (x: unknown): x is string => typeof x === "string";
const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const esMod = (x: unknown): boolean => obj(x) && txt(x.opcionId) && txt(x.nombre) && typeof x.cantidad === "number";
const esRenglon = (x: unknown): boolean => obj(x) && txt(x.id) && txt(x.productoId) && txt(x.nombre) && txt(x.nota)
  && typeof x.cantidad === "number" && x.cantidad >= 1
  && Array.isArray(x.modificadores) && x.modificadores.every(esMod)
  && Array.isArray(x.componentes) && x.componentes.every((c) => obj(c) && txt(c.grupoId) && txt(c.productoId) && txt(c.nombre)
    && typeof c.cantidad === "number" && Array.isArray(c.modificadores) && c.modificadores.every(esMod));
const esCarrito = (x: unknown): x is Carrito => obj(x) && x.v === 1 && txt(x.sucursalId) && (x.modo === "RECOGER" || x.modo === "DOMICILIO")
  && (x.zonaId === null || txt(x.zonaId)) && typeof x.guardado === "number" && Array.isArray(x.renglones) && x.renglones.every(esRenglon);

/**
 * El carrito guardado de ese negocio, o null. Se descarta (y se borra) si no tiene la forma de esta
 * versión o si tiene más de 24 horas. Un almacén que falla (modo privado) es «no hay carrito».
 */
export function leerCarrito(slug: string, almacen: Almacen | null = almacenDelNavegador(), ahora: number = Date.now()): Carrito | null {
  try {
    const crudo = almacen?.getItem(claveDeCarrito(slug));
    if (!crudo) return null;
    const c: unknown = JSON.parse(crudo);
    if (esCarrito(c) && c.guardado <= ahora && ahora - c.guardado <= CADUCA_MS) return c;
    almacen?.removeItem(claveDeCarrito(slug));
  } catch {
    try { almacen?.removeItem(claveDeCarrito(slug)); } catch { /* sin almacén no hay nada que limpiar */ }
  }
  return null;
}

/** Guarda con la hora de ahora. Si el almacén falla, la tienda sigue: el carrito vive en memoria. */
export function guardarCarrito(slug: string, carrito: Carrito, almacen: Almacen | null = almacenDelNavegador(), ahora: number = Date.now()): void {
  try {
    almacen?.setItem(claveDeCarrito(slug), JSON.stringify({ ...carrito, guardado: ahora }));
  } catch { /* cuota llena o modo privado */ }
}
