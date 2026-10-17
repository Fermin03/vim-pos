import { employeeClient } from "./supabase";

// Como `::numeric`: ".5" y "5." valen, y los ceros al final no cuentan como decimales.
const NUMERO = /^(\d+\.?\d*|\.\d+)$/;
const decimales = (s: string) => (s.split(".")[1] ?? "").replace(/0+$/, "").length;

/** Lo mismo que rechaza `_existencias_lineas` (0193), dicho antes de enviar. `null` = el renglón está bien. */
export function avisoCantidad(cantidad: string): string | null {
  const q = cantidad.trim();
  if (!NUMERO.test(q) || Number(q) === 0) return "Escribe una cantidad mayor a 0";
  if (decimales(q) > 3) return "La cantidad lleva hasta 3 decimales";
  if (Number(q) >= 1e9) return "Esa cantidad es demasiado grande";
  return null;
}

/** La base negó el permiso de productos (`SIN_PERMISO`, 42501): la pantalla vuelve al aviso de «Cambiar cajero». */
export class SinPermisoRecibir extends Error {}
/** El módulo de existencias está apagado para el negocio (`MODULO_APAGADO`). */
export class ExistenciasApagadas extends Error {}

/** Suma una pieza a lo ya capturado; una cantidad que no vale vuelve a 1. */
export const masUna = (cantidad: string): string =>
  avisoCantidad(cantidad) ? "1" : String(Math.round((Number(cantidad) + 1) * 1000) / 1000);

/**
 * `recibir_mercancia` (0193) sin proveedor y sin costo: los productos y los proveedores los manda la
 * nube, y la 0197 rechaza para siempre una entrada con costo. Devuelve cuántos renglones entraron.
 */
export async function recibirEnCaja(args: {
  token: string;
  sucursalId: string;
  lineas: { productoId: string; cantidad: number }[];
  referencia: string;
}): Promise<number> {
  const { data, error } = await employeeClient(args.token).rpc("recibir_mercancia", {
    p_sucursal: args.sucursalId,
    p_proveedor: null,
    p_lineas: args.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad })),
    p_referencia: args.referencia.trim().slice(0, 100),
  });
  if (error) {
    if (/MODULO_APAGADO/.test(error.message)) throw new ExistenciasApagadas(error.message);
    if (/SIN_PERMISO|permission denied/i.test(error.message) || error.code === "42501") throw new SinPermisoRecibir(error.message);
    throw new Error(error.message.replace(/^DATOS_INVALIDOS:\s*/, ""));
  }
  return typeof data === "number" ? data : args.lineas.length;
}
