/**
 * La cotización pública (retail 2, entrega 3): lo que devuelve `cotizacion_publica(token)` armado
 * para pintarse. Puro y sin red; la llamada vive en `buscarCotizacion`.
 */

export type RenglonVista = { nombre: string; sku: string | null; cantidad: string; precio: number; total: number };
export type CotizacionVista = {
  negocio: string;
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  folio: string;
  fecha: string;
  vigenteHasta: string;
  cliente: string | null;
  renglones: RenglonVista[];
  subtotal: number;
  iva: number;
  total: number;
};

type Json = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => Number(v ?? 0);

/** «2», «1.250»: una pieza sin decimales; lo fraccionario con 3 (la base guarda numeric(12,3)). */
export const fmtCantidad = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** «2026-10-18» → «18/10/2026», sin pasar por Date (la zona horaria movería el día). */
export function fechaDia(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** El JSON de la función a la vista; NULL (token desconocido o cancelada) o algo ilegible, a null. */
export function armarCotizacion(d: unknown): CotizacionVista | null {
  if (!d || typeof d !== "object") return null;
  const j = d as Json;
  const folio = texto(j.folio);
  if (!folio) return null;
  const suc = (j.sucursal ?? {}) as Json;
  const tot = (j.totales ?? {}) as Json;
  const renglones = Array.isArray(j.renglones) ? (j.renglones as Json[]) : [];
  return {
    negocio: texto(j.negocio) ?? "",
    sucursal: { nombre: texto(suc.nombre) ?? "", direccion: texto(suc.direccion), telefono: texto(suc.telefono) },
    folio,
    fecha: texto(j.fecha) ?? "",
    vigenteHasta: texto(j.vigente_hasta) ?? "",
    cliente: texto(j.cliente),
    renglones: renglones.map((r) => ({
      nombre: texto(r.nombre) ?? "",
      sku: texto(r.sku),
      cantidad: fmtCantidad(num(r.cantidad)),
      precio: num(r.precio_unitario),
      total: num(r.total),
    })),
    subtotal: num(tot.subtotal),
    iva: num(tot.iva),
    total: num(tot.total),
  };
}

/** Forma del token público; lo que no encaje ni se consulta. */
export const TOKEN_COTIZACION = /^[A-Za-z0-9_-]{16,128}$/;

/** Llama a la función con la llave anónima (EXECUTE para anon). Sin sesión, sin cookies. */
export async function buscarCotizacion(token: string): Promise<CotizacionVista | null> {
  if (!TOKEN_COTIZACION.test(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/cotizacion_publica`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
      cache: "no-store",
    });
    return res.ok ? armarCotizacion(await res.json()) : null;
  } catch {
    return null;
  }
}
