import type { Producto } from "./catalogo";
import { avisosDe, type Aviso } from "./directivas";
import { estadoExistencia, renglonTienda, type Existencia } from "./tienda";

export type Notificacion = {
  /** Firma: `producto:estado:cantidad` en una existencia (si cambia la cantidad vuelve a contar), el id del aviso en un aviso de VIM. */
  id: string;
  tipo: "existencia" | "aviso";
  titulo: string;
  detalle: string;
  nivel: "warning" | "danger" | "info";
  productoId?: string;
  fecha?: string;
};

/**
 * Lo que la pestaña Notificaciones enseña (pos-retail.md, «Versión 2»). FUNCIÓN PURA. Primero lo
 * agotado o en negativo, luego «pocas», luego los avisos de VIM. Solo productos que controlan
 * existencias, en esta sucursal; un padre no cuenta (sus hijas llevan la cifra).
 */
export function notificacionesTienda(existencias: Existencia[] | null, productos: Producto[], sucursalId: string, avisos: Aviso[]): Notificacion[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const agotadas: Notificacion[] = [];
  const pocas: Notificacion[] = [];
  for (const e of existencias ?? []) {
    const p = porId.get(e.producto_id);
    if (e.sucursal_id !== sucursalId || !p?.controla_existencias || p.variante_ejes?.length) continue;
    const estado = estadoExistencia(e.cantidad, e.minimo);
    if (estado === "normal") continue;
    const { nombre, detalle } = renglonTienda(p, productos);
    const titulo = [nombre, detalle].filter(Boolean).join(" · ");
    const base = { id: `${p.id}:${estado}:${e.cantidad}`, tipo: "existencia" as const, titulo, productoId: p.id };
    if (estado === "agotada") agotadas.push({ ...base, nivel: "danger", detalle: e.cantidad < 0 ? `En negativo: ${e.cantidad}` : "Agotada" });
    else pocas.push({ ...base, nivel: "warning", detalle: `Pocas: ${e.cantidad}` });
  }
  const porTitulo = (a: Notificacion, b: Notificacion) => a.titulo.localeCompare(b.titulo, "es");
  return [
    ...agotadas.sort(porTitulo),
    ...pocas.sort(porTitulo),
    ...avisos.map((a): Notificacion => ({ id: a.id, tipo: "aviso", titulo: a.titulo, detalle: a.cuerpo, nivel: a.nivel })),
  ];
}

/** Cuántas notificaciones no están en `vistas`. */
export const sinVer = (notificaciones: Notificacion[], vistas: string[]): number => {
  const v = new Set(vistas);
  return notificaciones.filter((n) => !v.has(n.id)).length;
};

const llaveVistas = (cajaId: string) => `vimpos.notif.vistas.${cajaId}`;

/** Lo ya visto en esta caja. Sin localStorage (modo privado, bloqueado) se lee como «nada visto». */
export function leerVistas(cajaId: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(llaveVistas(cajaId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function guardarVistas(cajaId: string, ids: string[]): void {
  try { localStorage.setItem(llaveVistas(cajaId), JSON.stringify(ids)); } catch { /* sin almacenamiento, el globo vuelve a contar */ }
}

/**
 * Avisos de VIM para releer (R7). FUNCIÓN PURA. La nube deja de mandar los que esta caja ya acusó,
 * así que la lista de la última vez se guarda y se une con la nueva: por id (gana el nuevo), los
 * nuevos primero, y se tira lo que ya venció. Un aviso que VIM retire sigue aquí hasta su vencimiento.
 */
export function unirAvisos(guardados: Aviso[], nuevos: Aviso[], ahora = Date.now()): Aviso[] {
  const ids = new Set(nuevos.map((a) => a.id));
  return [...nuevos, ...guardados.filter((a) => !ids.has(a.id))]
    .filter((a) => a.vigente_hasta === null || !(Date.parse(a.vigente_hasta) <= ahora));
}

const llaveAvisos = (cajaId: string) => `vimpos.notif.avisos.${cajaId}`;

/** Los avisos guardados en esta caja; lo que no tenga forma de aviso se descarta. */
export function leerAvisos(cajaId: string): Aviso[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(llaveAvisos(cajaId)) ?? "[]");
    return avisosDe({ avisos: Array.isArray(v) ? v : [] });
  } catch { return []; }
}

export function guardarAvisos(cajaId: string, avisos: Aviso[]): void {
  try { localStorage.setItem(llaveAvisos(cajaId), JSON.stringify(avisos)); } catch { /* sin almacenamiento, solo se releen los de este arranque */ }
}
