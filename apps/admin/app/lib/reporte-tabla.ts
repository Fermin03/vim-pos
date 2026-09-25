/**
 * El modelo de tabla que comparten los reportes: la pantalla y el Excel salen de la misma
 * definición de columnas, así que lo que se ve y lo que se descarga no pueden separarse.
 *
 * Antes cada uno de los 14 reportes armaba su <table> a mano —con la cadena de clases del
 * encabezado pegada 15 veces— y divergían en totales (fila en tfoot, fila en el cuerpo, frase
 * suelta o nada), en decimales y en qué se podía ordenar (nada).
 */
import type { ReactNode } from "react";
import { fechaLegible } from "@vim/fecha";
import type { Celda, Hoja, TipoCelda } from "./excel";

export type Columna<T> = {
  id: string;
  titulo: string;
  tipo?: TipoCelda;
  /** El dato: define el orden, el total y lo que va al Excel. `pct` va de 0 a 100. */
  valor: (f: T) => string | number | null;
  /** Total de la columna: "suma", una función o nada. */
  total?: "suma" | ((filas: T[]) => string | number | null);
  /** Pintado en pantalla cuando no basta el formato (una etiqueta, un color). */
  celda?: (f: T) => ReactNode;
  /** "fuerte" = la cifra que contesta el reporte; "suave" = contexto. */
  enfasis?: "fuerte" | "suave";
  /** Ancho aproximado en el Excel (caracteres). */
  ancho?: number;
};

export type Orden = { id: string; dir: "asc" | "desc" };

const numero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** El texto en pantalla de un valor según su tipo. Un solo criterio de decimales para todos. */
export function formatear(v: string | number | null, tipo: TipoCelda = "texto"): string {
  if (v === null || v === "") return "—";
  if (typeof v === "string") return tipo === "fecha" ? fechaLegible(v) : v;
  if (!Number.isFinite(v)) return "—";
  switch (tipo) {
    case "mxn":
      return moneda.format(v);
    case "entero":
      return numero.format(v);
    case "pct":
      // Siempre un decimal: antes la misma columna mezclaba "50 %" y "33.3 %".
      return `${v.toFixed(1)}%`;
    case "decimal":
      return v.toFixed(1);
    default:
      return String(v);
  }
}

export function ordenar<T>(filas: T[], columnas: Columna<T>[], orden: Orden | null): T[] {
  if (!orden) return filas;
  const col = columnas.find((c) => c.id === orden.id);
  if (!col) return filas;
  const signo = orden.dir === "asc" ? 1 : -1;
  const comp = new Intl.Collator("es-MX", { numeric: true, sensitivity: "base" });
  return [...filas].sort((a, b) => {
    const x = col.valor(a);
    const y = col.valor(b);
    // Vacíos siempre al final, en cualquier dirección.
    if (x === null || x === "") return y === null || y === "" ? 0 : 1;
    if (y === null || y === "") return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * signo;
    return comp.compare(String(x), String(y)) * signo;
  });
}

export function totalDe<T>(col: Columna<T>, filas: T[]): string | number | null {
  if (!col.total) return null;
  if (col.total === "suma") return filas.reduce((s, f) => s + (Number(col.valor(f)) || 0), 0);
  return col.total(filas);
}

export function tieneTotales<T>(columnas: Columna<T>[]): boolean {
  return columnas.some((c) => c.total);
}

/** La primera columna sin total lleva la palabra "Total". */
export function filaTotales<T>(columnas: Columna<T>[], filas: T[]): (string | number | null)[] {
  return columnas.map((c, i) => (c.total ? totalDe(c, filas) : i === 0 ? "Total" : null));
}

export type CifraExportable = { etiqueta: string; valor: string | number | null; tipo?: TipoCelda };

/** La hoja del Excel: título, rango y cifras arriba; la tabla, con su fila de totales, abajo. */
export function hojaDeReporte<T>(opts: {
  titulo: string;
  rango?: { desde: string; hasta: string } | null;
  cifras?: CifraExportable[];
  columnas: Columna<T>[];
  filas: T[];
}): Hoja {
  const { titulo, rango, cifras = [], columnas, filas } = opts;
  const preambulo: Celda[][] = [[{ valor: titulo, negrita: true }]];
  if (rango) preambulo.push([{ valor: `Del ${fechaLegible(rango.desde)} al ${fechaLegible(rango.hasta)}` }]);
  for (const c of cifras) preambulo.push([{ valor: c.etiqueta }, { valor: c.valor, tipo: c.tipo }]);
  const totales = tieneTotales(columnas)
    ? filaTotales(columnas, filas).map((v, i) => ({ valor: v, tipo: columnas[i]!.total ? columnas[i]!.tipo : "texto" }) as Celda)
    : undefined;
  return {
    nombre: titulo,
    preambulo,
    encabezados: columnas.map((c) => c.titulo),
    filas: filas.map((f) => columnas.map((c) => ({ valor: c.valor(f), tipo: c.tipo }))),
    totales,
    anchos: columnas.map((c, i) =>
      c.ancho ?? Math.max(c.titulo.length + 2, i === 0 ? 24 : c.tipo === "mxn" ? 14 : 10),
    ),
  };
}

/** "Ventas por producto" + rango → "ventas-por-producto_2026-09-01_2026-09-25". */
export function nombreArchivo(titulo: string, rango?: { desde: string; hasta: string } | null): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return rango ? `${base}_${rango.desde}_${rango.hasta}` : base;
}
