"use client";
import { supabase, leerSesion } from "./supabase";
import { convertirCantidad, type Conversion, type UnidadDetalle } from "./recetas";

// Compras a proveedores (ADR 0012, spec 2026-09-03 §4.1, §4.2, §7.3). La parte pura (resolver
// líneas y totales) se prueba con vitest; el resto son llamadas a los RPC y a las tablas.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));
const opc = (v: unknown) => (v == null || v === "" ? null : String(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

// ---------------------------------------------------------------- puro

export type LineaCaptura = {
  insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string;
  factor: number; importeSinIva: number; claveOrigen: string | null; omitir: boolean;
};
export type LineaResuelta = {
  insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string;
  cantidad: number; costoUnitario: number; importe: number;
};

/** cantidad = capturada × factor (unidad del insumo); costo unitario = importe sin IVA / cantidad. */
export function resolverLinea(l: LineaCaptura): LineaResuelta {
  const cantidad = r3(l.cantidadCapturada * l.factor);
  const importe = r2(l.importeSinIva);
  return {
    insumoId: l.insumoId, descripcionOrigen: l.descripcionOrigen, cantidadCapturada: l.cantidadCapturada,
    unidadCapturadaId: l.unidadCapturadaId, cantidad, costoUnitario: cantidad > 0 ? r6(importe / cantidad) : 0, importe,
  };
}

export function totales(lineas: LineaResuelta[], ivaXml: number | null): { subtotal: number; iva: number; total: number } {
  const subtotal = r2(lineas.reduce((a, l) => a + l.importe, 0));
  const iva = ivaXml == null ? r2(subtotal * 0.16) : r2(ivaXml);
  return { subtotal, iva, total: r2(subtotal + iva) };
}

/** Factor propuesto de la unidad del proveedor a la del insumo; null cuando el usuario debe capturarlo. */
export function factorSugerido(origen: UnidadDetalle | undefined, destino: UnidadDetalle | undefined, conversiones: Conversion[]): number | null {
  if (!origen || !destino) return null;
  if (origen.id === destino.id) return 1;
  try { return convertirCantidad(1, origen, destino, conversiones); } catch { return null; }
}

// ---------------------------------------------------------------- datos

export type Alias = { claveOrigen: string; descripcionOrigen: string | null; insumoId: string; unidadId: string; factor: number };

export async function listarAliases(proveedorId: string): Promise<Alias[]> {
  const { data, error } = await supabase
    .from("proveedor_insumo_alias")
    .select("clave_origen, descripcion_origen, insumo_id, unidad_id, factor")
    .eq("proveedor_id", proveedorId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    claveOrigen: S(a.clave_origen), descripcionOrigen: opc(a.descripcion_origen), insumoId: S(a.insumo_id), unidadId: S(a.unidad_id), factor: num(a.factor),
  }));
}

export async function buscarCompraPorUuid(uuid: string): Promise<{ id: string; folio: string } | null> {
  const { data, error } = await supabase.from("compras").select("id, folio_completo").eq("cfdi_uuid", uuid.toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: S((data as Record<string, unknown>).id), folio: S((data as Record<string, unknown>).folio_completo) } : null;
}

export type CompraResumen = {
  id: string; folio: string; fecha: string; proveedorNombre: string; referencia: string | null; sucursalNombre: string;
  total: number; estado: "CONFIRMADA" | "ANULADA"; origen: "MANUAL" | "XML";
};

const SELECT_RESUMEN = "id, folio_completo, fecha, referencia_documento, total_mxn, estado, origen, proveedor:proveedores!proveedor_id(nombre), sucursal:sucursales!sucursal_id(nombre)";

function mapearResumen(r: Record<string, unknown>): CompraResumen {
  return {
    id: S(r.id), folio: S(r.folio_completo), fecha: S(r.fecha), referencia: opc(r.referencia_documento),
    proveedorNombre: ((r.proveedor as { nombre?: string } | null)?.nombre) ?? "",
    sucursalNombre: ((r.sucursal as { nombre?: string } | null)?.nombre) ?? "",
    total: num(r.total_mxn), estado: r.estado === "ANULADA" ? "ANULADA" : "CONFIRMADA", origen: r.origen === "XML" ? "XML" : "MANUAL",
  };
}

export async function listarCompras(f: { desde: string; hasta: string; proveedorId?: string; sucursalId?: string }): Promise<CompraResumen[]> {
  let q = supabase.from("compras").select(SELECT_RESUMEN).gte("fecha", f.desde).lte("fecha", f.hasta).order("fecha", { ascending: false }).order("folio_consecutivo", { ascending: false });
  if (f.proveedorId) q = q.eq("proveedor_id", f.proveedorId);
  if (f.sucursalId) q = q.eq("sucursal_id", f.sucursalId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapearResumen);
}

export type CompraDetalle = CompraResumen & {
  sucursalId: string; cfdiUuid: string | null; subtotal: number; iva: number; notas: string | null; motivoAnulacion: string | null;
  lineas: { insumoNombre: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturada: string; cantidad: number; unidadInsumo: string; costoUnitario: number; importe: number }[];
};

export async function obtenerCompra(id: string): Promise<CompraDetalle | null> {
  const { data, error } = await supabase
    .from("compras")
    .select(`${SELECT_RESUMEN}, sucursal_id, cfdi_uuid, subtotal_mxn, iva_mxn, notas, motivo_anulacion, lineas:compra_lineas(orden, descripcion_origen, cantidad_capturada, cantidad, costo_unitario_mxn, importe_mxn, insumo:insumos!insumo_id(nombre, unidad:unidades_medida!unidad_medida_id(simbolo)), unidad_capturada:unidades_medida!unidad_capturada_id(simbolo))`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const lineas = ((r.lineas as Record<string, unknown>[] | null) ?? [])
    .sort((a, b) => num(a.orden) - num(b.orden))
    .map((l) => {
      const insumo = l.insumo as { nombre?: string; unidad?: { simbolo?: string } | null } | null;
      return {
        insumoNombre: insumo?.nombre ?? "", descripcionOrigen: opc(l.descripcion_origen),
        cantidadCapturada: num(l.cantidad_capturada), unidadCapturada: ((l.unidad_capturada as { simbolo?: string } | null)?.simbolo) ?? "",
        cantidad: num(l.cantidad), unidadInsumo: insumo?.unidad?.simbolo ?? "",
        costoUnitario: num(l.costo_unitario_mxn), importe: num(l.importe_mxn),
      };
    });
  return {
    ...mapearResumen(r), sucursalId: S(r.sucursal_id), cfdiUuid: opc(r.cfdi_uuid), subtotal: num(r.subtotal_mxn), iva: num(r.iva_mxn),
    notas: opc(r.notas), motivoAnulacion: opc(r.motivo_anulacion), lineas,
  };
}

export async function registrarCompra(input: {
  sucursalId: string; proveedorId: string; fecha: string; referencia: string | null; cfdiUuid: string | null;
  origen: "MANUAL" | "XML"; notas: string | null; ivaXml: number | null; lineas: LineaResuelta[]; aliases: Alias[];
}): Promise<string> {
  await tenantId();
  const { data, error } = await supabase.rpc("registrar_compra", {
    p_compra: {
      sucursal_id: input.sucursalId, proveedor_id: input.proveedorId, fecha: input.fecha,
      referencia_documento: input.referencia, cfdi_uuid: input.cfdiUuid, origen: input.origen, notas: input.notas,
      iva_mxn: input.ivaXml,
      lineas: input.lineas.map((l) => ({
        insumo_id: l.insumoId, descripcion_origen: l.descripcionOrigen, cantidad_capturada: l.cantidadCapturada,
        unidad_capturada_id: l.unidadCapturadaId, cantidad: l.cantidad, costo_unitario_mxn: l.costoUnitario, importe_mxn: l.importe,
      })),
      aliases: input.aliases.map((a) => ({
        clave_origen: a.claveOrigen, descripcion_origen: a.descripcionOrigen, insumo_id: a.insumoId, unidad_id: a.unidadId, factor: a.factor,
      })),
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function anularCompra(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("anular_compra", { p_compra_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}
