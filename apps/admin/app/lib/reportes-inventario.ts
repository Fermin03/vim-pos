"use client";
import { fechaLegible, ZONA_MX } from "@vim/fecha";
import { supabase } from "./supabase";
import { leerTodas } from "./reportes";

// Reportes de inventario (0129): historial de movimientos (P-149) y costo de ventas (P-150).
// Todo se lee con la sesión del negocio: la vista es security_invoker y las funciones SECURITY
// INVOKER, así que el RLS de las tablas base aplica igual que en los demás reportes.

const num = (v: unknown) => Number(v ?? 0);
const texto = (v: unknown) => (v == null ? null : String(v));
type RespuestaPagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
type Rango = { desde: string; hasta: string };

// ── Tipos de movimiento, en palabras del dueño ─────────────────────────────────────────────
export const TIPOS_MOVIMIENTO = [
  "ENTRADA_COMPRA",
  "SALIDA_VENTA",
  "SALIDA_MODIFICADOR_EXTRA",
  "REVERSA_CANCELACION",
  "MERMA",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO",
  "TRANSFERENCIA_SALIDA",
  "TRANSFERENCIA_ENTRADA",
  "DEVOLUCION_PROVEEDOR",
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** "Ajuste +" y "Ajuste −" son los mismos rótulos del diálogo de movimiento en Inventario. */
export const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: "Compra",
  SALIDA_VENTA: "Venta",
  SALIDA_MODIFICADOR_EXTRA: "Extra vendido",
  REVERSA_CANCELACION: "Regreso de venta",
  MERMA: "Merma",
  AJUSTE_POSITIVO: "Ajuste +",
  AJUSTE_NEGATIVO: "Ajuste −",
  TRANSFERENCIA_SALIDA: "Traspaso enviado",
  TRANSFERENCIA_ENTRADA: "Traspaso recibido",
  DEVOLUCION_PROVEEDOR: "Devolución al proveedor",
};

export const esTipoMovimiento = (v: unknown): v is TipoMovimiento =>
  typeof v === "string" && (TIPOS_MOVIMIENTO as readonly string[]).includes(v);

/** Un tipo que la base agregue después sale con su nombre crudo, no disfrazado de otro. */
export const etiquetaTipo = (t: string): string => (esTipoMovimiento(t) ? ETIQUETA_TIPO[t] : t);

/**
 * El filtro de tipo agrupa lo que el dueño piensa junto: una compra anulada es parte de "compras"
 * y lo que regresó por una cancelación es parte de "ventas". Los traspasos no tienen opción
 * porque ninguna pantalla los crea todavía; si existieran, salen en "Todos".
 */
export const FILTROS_TIPO = [
  { id: "todos", etiqueta: "Todos los movimientos", tipos: null },
  { id: "compras", etiqueta: "Compras", tipos: ["ENTRADA_COMPRA", "DEVOLUCION_PROVEEDOR"] },
  { id: "ventas", etiqueta: "Ventas", tipos: ["SALIDA_VENTA", "SALIDA_MODIFICADOR_EXTRA", "REVERSA_CANCELACION"] },
  { id: "mermas", etiqueta: "Mermas", tipos: ["MERMA"] },
  { id: "ajustes", etiqueta: "Ajustes", tipos: ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"] },
] as const satisfies readonly { id: string; etiqueta: string; tipos: readonly TipoMovimiento[] | null }[];
export type FiltroTipo = (typeof FILTROS_TIPO)[number]["id"];

export function tiposDeFiltro(f: FiltroTipo): TipoMovimiento[] | null {
  const t = FILTROS_TIPO.find((x) => x.id === f)?.tipos;
  return t ? [...t] : null;
}

/**
 * La búsqueda de insumo va a un ILIKE (en la tabla por PostgREST y en las cifras por la función
 * SQL). Se quitan los comodines —`%`, `_` y el `*` que PostgREST traduce a `%`— para que las dos
 * busquen lo mismo y "100%" no se lea como "cualquier cosa después de 100".
 */
export function limpiarBusqueda(q: string): string {
  return q.replace(/[%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const hora = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MX, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** `2026-09-29T23:06:00Z` → `29 sep 2026, 17:06` — la hora del negocio, no la del navegador. */
export function fechaHoraMx(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fechaLegible(iso)}, ${hora.format(d)}`;
}

// ── P-149: historial ──────────────────────────────────────────────────────────────────────
export type Movimiento = {
  id: string;
  fecha: string;
  sucursal: string;
  insumo: string;
  unidad: string;
  tipo: string;
  /** Con signo: + entró al inventario, − salió. */
  cantidad: number;
  /** Con signo, como la cantidad. null si el movimiento se registró sin costo. */
  costo: number | null;
  compraFolio: string | null;
  proveedor: string | null;
  facturaReferencia: string | null;
  ticketFolio: string | null;
  motivo: string | null;
  descripcion: string | null;
  sucursalDestino: string | null;
  usuario: string | null;
};

const unir = (...partes: (string | null | undefined)[]) =>
  partes.map((p) => p?.trim()).filter((p): p is string => !!p).join(" · ");

/** De dónde salió el movimiento, en una línea: la compra con su folio, el ticket, el motivo. */
export function referenciaMovimiento(m: Pick<Movimiento, "tipo" | "compraFolio" | "proveedor" | "facturaReferencia" | "ticketFolio" | "motivo" | "descripcion" | "sucursalDestino">): string {
  switch (m.tipo) {
    case "ENTRADA_COMPRA":
      return unir(m.compraFolio ? `Compra ${m.compraFolio}` : "Compra", m.proveedor, m.facturaReferencia && `doc. ${m.facturaReferencia}`);
    case "DEVOLUCION_PROVEEDOR":
      // anular_compra (0100) ya escribe "Anulación de compra K1-… : motivo".
      return m.motivo?.trim() || (m.compraFolio ? `Anulación de compra ${m.compraFolio}` : unir("Devolución al proveedor", m.proveedor));
    case "SALIDA_VENTA":
      return m.ticketFolio ? `Ticket ${m.ticketFolio}` : "Venta";
    case "SALIDA_MODIFICADOR_EXTRA":
      return m.ticketFolio ? `Extra del ticket ${m.ticketFolio}` : "Extra vendido";
    case "REVERSA_CANCELACION":
      // Las reversas escriben "Cancelación ticket …" o "Devolución folio …" (0057): dice cuál fue.
      return m.descripcion?.trim() || (m.ticketFolio ? `Ticket ${m.ticketFolio}` : "Regreso de venta");
    case "TRANSFERENCIA_SALIDA":
      return m.sucursalDestino ? `Hacia ${m.sucursalDestino}` : unir(m.motivo) || "Traspaso";
    default:
      // Mermas, ajustes y traspasos recibidos: el motivo que se capturó.
      return unir(m.motivo, m.descripcion) || "Sin motivo";
  }
}

export type ResumenTipo = { tipo: TipoMovimiento; movimientos: number; costo: number };

export type CifrasMovimientos = {
  movimientos: number;
  compras: number;
  comprasMovs: number;
  consumoVenta: number;
  ventaMovs: number;
  mermas: number;
  mermasMovs: number;
  ajustes: number;
  ajustesMovs: number;
};

/**
 * Las cifras de arriba del historial. Cada una es un NETO de lo que el dueño piensa como una sola
 * cosa: lo comprado menos lo devuelto al proveedor, lo que la venta consumió menos lo que regresó
 * por cancelaciones y devoluciones, los ajustes a favor menos los ajustes en contra.
 */
export function cifrasMovimientos(resumen: ResumenTipo[]): CifrasMovimientos {
  const de = (...tipos: TipoMovimiento[]) => resumen.filter((r) => tipos.includes(r.tipo));
  const costo = (rs: ResumenTipo[]) => rs.reduce((s, r) => s + r.costo, 0);
  const movs = (rs: ResumenTipo[]) => rs.reduce((s, r) => s + r.movimientos, 0);
  const compras = de("ENTRADA_COMPRA", "DEVOLUCION_PROVEEDOR");
  const venta = de("SALIDA_VENTA", "SALIDA_MODIFICADOR_EXTRA", "REVERSA_CANCELACION");
  const ajustes = de("AJUSTE_POSITIVO", "AJUSTE_NEGATIVO");
  return {
    movimientos: movs(resumen),
    compras: costo(de("ENTRADA_COMPRA")) - costo(de("DEVOLUCION_PROVEEDOR")),
    comprasMovs: movs(compras),
    consumoVenta: costo(de("SALIDA_VENTA", "SALIDA_MODIFICADOR_EXTRA")) - costo(de("REVERSA_CANCELACION")),
    ventaMovs: movs(venta),
    mermas: costo(de("MERMA")),
    mermasMovs: movs(de("MERMA")),
    ajustes: costo(de("AJUSTE_POSITIVO")) - costo(de("AJUSTE_NEGATIVO")),
    ajustesMovs: movs(ajustes),
  };
}

export type FiltrosMovimientos = { sucursalId: string | null; busqueda: string; tipo: FiltroTipo };

const COLUMNAS_VISTA =
  "id, fecha, sucursal_nombre, insumo_nombre, unidad_simbolo, tipo, signo, cantidad, costo_unitario_mxn, costo_total_mxn, compra_folio, proveedor, factura_referencia, ticket_folio, motivo, descripcion, sucursal_destino_nombre, usuario_nombre";

function consultaMovimientos(r: Rango, f: FiltrosMovimientos, contar: boolean) {
  let q = supabase
    .from("vw_movimientos_inventario")
    .select(COLUMNAS_VISTA, contar ? { count: "exact" } : undefined)
    .gte("dia_contable", r.desde)
    .lte("dia_contable", r.hasta);
  if (f.sucursalId) q = q.eq("sucursal_id", f.sucursalId);
  const b = limpiarBusqueda(f.busqueda);
  if (b) q = q.ilike("insumo_nombre", `%${b}%`);
  const tipos = tiposDeFiltro(f.tipo);
  if (tipos) q = q.in("tipo", tipos);
  // El id desempata los movimientos del mismo instante (una venta escribe todos sus insumos con
  // el mismo now()): sin él, una fila podía salir en dos páginas y otra en ninguna.
  return q.order("fecha", { ascending: false }).order("id", { ascending: false });
}

export function aMovimiento(r: Record<string, unknown>): Movimiento {
  const signo = num(r.signo) < 0 ? -1 : 1;
  return {
    id: String(r.id),
    fecha: String(r.fecha),
    sucursal: texto(r.sucursal_nombre) ?? "—",
    insumo: texto(r.insumo_nombre) ?? "—",
    unidad: texto(r.unidad_simbolo) ?? "",
    tipo: String(r.tipo ?? ""),
    cantidad: signo * num(r.cantidad),
    // Sin costo unitario el total es 0 y no significa "gratis": se muestra como que no hay dato.
    costo: num(r.costo_unitario_mxn) > 0 ? signo * num(r.costo_total_mxn) : null,
    compraFolio: texto(r.compra_folio),
    proveedor: texto(r.proveedor),
    facturaReferencia: texto(r.factura_referencia),
    ticketFolio: texto(r.ticket_folio),
    motivo: texto(r.motivo),
    descripcion: texto(r.descripcion),
    sucursalDestino: texto(r.sucursal_destino_nombre),
    usuario: texto(r.usuario_nombre),
  };
}

export const MOVIMIENTOS_POR_PAGINA = 50;

export type PaginaMovimientos = { filas: Movimiento[]; total: number; resumen: ResumenTipo[] };

/** Una página del historial, el total de filas con esos filtros y las cifras del periodo. */
export async function leerMovimientos(r: Rango, f: FiltrosMovimientos, pagina: number): Promise<PaginaMovimientos> {
  const desde = (pagina - 1) * MOVIMIENTOS_POR_PAGINA;
  const [pag, res] = await Promise.all([
    consultaMovimientos(r, f, true).range(desde, desde + MOVIMIENTOS_POR_PAGINA - 1),
    supabase.rpc("resumen_movimientos_inventario", {
      p_desde: r.desde,
      p_hasta: r.hasta,
      p_sucursal_id: f.sucursalId,
      p_busqueda: limpiarBusqueda(f.busqueda) || null,
    }),
  ]);
  if (pag.error) throw new Error(pag.error.message);
  if (res.error) throw new Error(res.error.message);
  return {
    filas: ((pag.data ?? []) as Record<string, unknown>[]).map(aMovimiento),
    total: pag.count ?? 0,
    resumen: ((res.data ?? []) as Record<string, unknown>[])
      .filter((x) => esTipoMovimiento(x.tipo))
      .map((x) => ({ tipo: x.tipo as TipoMovimiento, movimientos: num(x.movimientos), costo: num(x.costo_mxn) })),
  };
}

/** Todas las filas con los mismos filtros, para el Excel (por páginas: PostgREST corta en 1000). */
export async function leerTodosLosMovimientos(r: Rango, f: FiltrosMovimientos): Promise<Movimiento[]> {
  const filas = await leerTodas((a, b) => consultaMovimientos(r, f, false).range(a, b) as unknown as RespuestaPagina);
  return filas.map(aMovimiento);
}

// ── P-150: costo de ventas y margen ───────────────────────────────────────────────────────
/** Una fila de reporte_costo_ventas: producto × categoría con que se vendió. */
export type FilaCostoRpc = {
  productoId: string | null;
  producto: string | null;
  categoria: string | null;
  tieneReceta: boolean;
  unidades: number;
  venta: number;
  unidadesConCosto: number;
  ventaConCosto: number;
  costo: number;
  costoEstimado: number;
  costoRepartido: number;
  insumoSinCosto: boolean;
};

export function aFilaCosto(r: Record<string, unknown>): FilaCostoRpc {
  return {
    productoId: texto(r.producto_id),
    producto: texto(r.producto_nombre),
    categoria: texto(r.categoria),
    tieneReceta: r.tiene_receta === true,
    unidades: num(r.unidades),
    venta: num(r.venta_mxn),
    unidadesConCosto: num(r.unidades_con_costo),
    ventaConCosto: num(r.venta_con_costo_mxn),
    costo: num(r.costo_mxn),
    costoEstimado: num(r.costo_estimado_mxn),
    costoRepartido: num(r.costo_repartido_mxn),
    insumoSinCosto: r.insumo_sin_costo === true,
  };
}

export async function leerCostoVentas(desde: string, hasta: string, sucursalId: string | null): Promise<FilaCostoRpc[]> {
  // Casi nunca pasa de mil filas (una por producto vendido), pero si pasa, PostgREST corta sin
  // avisar: se lee por páginas con un orden que identifica cada fila.
  const filas = await leerTodas(
    (a, b) =>
      supabase
        .rpc("reporte_costo_ventas", { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId })
        .order("producto_id", { nullsFirst: false })
        .order("producto_nombre", { nullsFirst: false })
        .order("categoria", { nullsFirst: false })
        .range(a, b) as unknown as RespuestaPagina,
  );
  return filas.map(aFilaCosto);
}

export type AgruparPor = "producto" | "categoria";

export type FilaCosto = {
  clave: string;
  nombre: string;
  /** Por producto: su categoría. Por categoría: cuántos productos. */
  categoria: string;
  productos: number;
  /** Productos del grupo sin nada de costo (sin receta o sin consumo registrado). */
  productosSinCosto: number;
  tieneReceta: boolean;
  unidades: number;
  venta: number;
  unidadesConCosto: number;
  ventaConCosto: number;
  costo: number;
  costoEstimado: number;
  costoRepartido: number;
  insumoSinCosto: boolean;
  /** La fila del consumo que no quedó en ningún producto (ver 0129). */
  sinProducto: boolean;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const SIN_CATEGORIA = "Sin categoría";

/**
 * Junta las filas de la función por producto (un producto pudo venderse bajo dos nombres de
 * categoría si la renombraron) o por categoría. Pura, para poder probarla.
 */
export function agruparCostoVentas(filas: FilaCostoRpc[], por: AgruparPor): FilaCosto[] {
  const grupos = new Map<string, { base: FilaCosto; productos: Map<string, FilaCostoRpc[]> }>();
  for (const f of filas) {
    const sinProducto = f.productoId === null && f.producto === null;
    const claveProducto = f.productoId ?? `nombre:${f.producto ?? ""}`;
    const clave = sinProducto ? "sin-producto" : por === "producto" ? claveProducto : `cat:${f.categoria ?? ""}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        base: {
          clave,
          nombre: sinProducto ? "Consumo sin producto" : por === "producto" ? (f.producto ?? "—") : (f.categoria ?? SIN_CATEGORIA),
          categoria: sinProducto ? "—" : f.categoria ?? SIN_CATEGORIA,
          productos: 0,
          productosSinCosto: 0,
          tieneReceta: false,
          unidades: 0,
          venta: 0,
          unidadesConCosto: 0,
          ventaConCosto: 0,
          costo: 0,
          costoEstimado: 0,
          costoRepartido: 0,
          insumoSinCosto: false,
          sinProducto,
        },
        productos: new Map(),
      };
      grupos.set(clave, g);
    }
    const b = g.base;
    b.tieneReceta ||= f.tieneReceta;
    b.unidades += f.unidades;
    b.venta += f.venta;
    b.unidadesConCosto += f.unidadesConCosto;
    b.ventaConCosto += f.ventaConCosto;
    b.costo += f.costo;
    b.costoEstimado += f.costoEstimado;
    b.costoRepartido += f.costoRepartido;
    b.insumoSinCosto ||= f.insumoSinCosto;
    if (!sinProducto) g.productos.set(claveProducto, [...(g.productos.get(claveProducto) ?? []), f]);
  }
  return [...grupos.values()].map(({ base, productos }) => {
    const deProducto = [...productos.values()];
    return {
      ...base,
      venta: redondear2(base.venta),
      ventaConCosto: redondear2(base.ventaConCosto),
      costo: redondear2(base.costo),
      costoEstimado: redondear2(base.costoEstimado),
      costoRepartido: redondear2(base.costoRepartido),
      productos: deProducto.length,
      productosSinCosto: deProducto.filter((fs) => fs.every((f) => f.unidadesConCosto <= 0 && f.costo === 0)).length,
    };
  });
}

/**
 * Margen contra la venta QUE TIENE COSTO. La venta sin consumo registrado no entra: contarla
 * con costo cero la presentaría como margen del 100 %, que es justo lo que no se sabe.
 */
export function margenDe(f: Pick<FilaCosto, "ventaConCosto" | "costo">): { pesos: number | null; pct: number | null } {
  if (f.ventaConCosto === 0 && f.costo === 0) return { pesos: null, pct: null };
  const pesos = redondear2(f.ventaConCosto - f.costo);
  return { pesos, pct: f.ventaConCosto > 0 ? (pesos / f.ventaConCosto) * 100 : null };
}

export type EstadoCosto = "sin_producto" | "sin_receta" | "sin_consumo" | "parcial" | "completo";

/** El estado de la fila por producto: por qué no tiene costo, o si solo una parte lo tiene. */
export function estadoCosto(f: FilaCosto): EstadoCosto {
  if (f.sinProducto) return "sin_producto";
  if (f.unidadesConCosto <= 0 && f.costo === 0) return f.tieneReceta ? "sin_consumo" : "sin_receta";
  if (f.unidadesConCosto < f.unidades) return "parcial";
  return "completo";
}

export type TotalesCosto = {
  venta: number;
  ventaConCosto: number;
  ventaSinCosto: number;
  costo: number;
  margen: number;
  margenPct: number | null;
  costoPct: number | null;
  costoEstimado: number;
  costoRepartido: number;
  insumoSinCosto: boolean;
  productosSinCosto: number;
  productosSinReceta: number;
};

export function totalesCostoVentas(filasPorProducto: FilaCosto[]): TotalesCosto {
  const suma = (k: "venta" | "ventaConCosto" | "costo" | "costoEstimado" | "costoRepartido") =>
    redondear2(filasPorProducto.reduce((s, f) => s + f[k], 0));
  const venta = suma("venta");
  const ventaConCosto = suma("ventaConCosto");
  const costo = suma("costo");
  const margen = redondear2(ventaConCosto - costo);
  return {
    venta,
    ventaConCosto,
    ventaSinCosto: redondear2(venta - ventaConCosto),
    costo,
    margen,
    margenPct: ventaConCosto > 0 ? (margen / ventaConCosto) * 100 : null,
    costoPct: ventaConCosto > 0 ? (costo / ventaConCosto) * 100 : null,
    costoEstimado: suma("costoEstimado"),
    costoRepartido: suma("costoRepartido"),
    insumoSinCosto: filasPorProducto.some((f) => f.insumoSinCosto),
    productosSinCosto: filasPorProducto.filter((f) => !f.sinProducto && (estadoCosto(f) === "sin_receta" || estadoCosto(f) === "sin_consumo")).length,
    productosSinReceta: filasPorProducto.filter((f) => estadoCosto(f) === "sin_receta").length,
  };
}
