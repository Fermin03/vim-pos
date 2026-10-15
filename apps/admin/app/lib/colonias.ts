"use client";
import { z } from "zod";
import { supabase } from "./supabase";
import { borrarSuave, tenantId } from "./datos";

/**
 * Catálogo de colonias por sucursal (0187, ADR 0036). La caja lo usa para sugerir la zona de
 * envío de un domicilio; aquí el dueño lo carga, ve cuáles heredaron zona y asigna el resto.
 */

export type ColoniaAdmin = {
  id: string;
  nombre: string;
  codigoPostal: string | null;
  origen: "SEPOMEX" | "CAPTURADA";
  zonaId: string | null;
};

export const PAGINA = 50;

export const coloniaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la colonia").max(150),
  codigoPostal: z.string().trim().regex(/^\d{5}$/, "El código postal tiene 5 dígitos").or(z.literal("")).optional(),
});

/** Igual que `nombre_busqueda` en la base y que la caja: sin acentos, minúsculas, sin espacios en las orillas. */
const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
/** `%` y `_` del texto se buscan tal cual, no como comodines. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Patrón `like` del buscador. */
export const filtroBusqueda = (q: string) => `%${escaparLike(normalizar(q))}%`;

export function mensajeSiembra(r: { insertadas: number; heredadas: number }): string {
  if (r.insertadas === 0) return "No había colonias nuevas.";
  const n = (k: number, s: string, p: string) => `${k} ${k === 1 ? s : p}`;
  const base = `Se ${r.insertadas === 1 ? "cargó" : "cargaron"} ${n(r.insertadas, "colonia", "colonias")}`;
  return r.heredadas > 0
    ? `${base}; ${n(r.heredadas, "ya tiene", "ya tienen")} zona por tus domicilios.`
    : `${base}.`;
}

/** Errores de la base dichos en claro. */
function traducir(mensaje: string): string {
  if (mensaje.includes("CP_DESCONOCIDO"))
    return "La sucursal no tiene un código postal válido. Captúralo en Configuración → Sucursales.";
  if (mensaje.includes("colonia_llave_uq")) return "Esa colonia ya está en el catálogo.";
  if (mensaje.includes("ZONA_INVALIDA")) return "Esa zona no se puede usar aquí.";
  return mensaje;
}

export async function listarColonias(
  sucursalId: string,
  { q = "", sinZona = false, pagina = 0 }: { q?: string; sinZona?: boolean; pagina?: number },
): Promise<{ filas: ColoniaAdmin[]; total: number }> {
  let consulta = supabase
    .from("colonias")
    .select("id, nombre, codigo_postal, origen, zona_envio_id", { count: "exact" })
    .eq("sucursal_id", sucursalId)
    .is("deleted_at", null);
  if (q.trim()) consulta = consulta.like("nombre_busqueda", filtroBusqueda(q));
  if (sinZona) consulta = consulta.is("zona_envio_id", null);
  const { data, error, count } = await consulta
    .order("nombre", { ascending: true })
    .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
  if (error) throw new Error(traducir(error.message));
  const filas = ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    nombre: String(f.nombre ?? ""),
    codigoPostal: (f.codigo_postal as string | null) ?? null,
    origen: f.origen === "CAPTURADA" ? ("CAPTURADA" as const) : ("SEPOMEX" as const),
    zonaId: (f.zona_envio_id as string | null) ?? null,
  }));
  return { filas, total: count ?? 0 };
}

/** Cuántas colonias vivas hay en total y cuántas sin zona (los dos números del contador). */
export async function contarColonias(sucursalId: string): Promise<{ total: number; sinZona: number }> {
  const base = () =>
    supabase.from("colonias").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursalId).is("deleted_at", null);
  const [t, s] = await Promise.all([base(), base().is("zona_envio_id", null)]);
  if (t.error) throw new Error(traducir(t.error.message));
  if (s.error) throw new Error(traducir(s.error.message));
  return { total: t.count ?? 0, sinZona: s.count ?? 0 };
}

/** Municipio del código postal de la sucursal, para rotular el botón de carga. `null` si no se sabe. */
export async function municipioDeSucursal(sucursalId: string): Promise<string | null> {
  const { data: suc } = await supabase.from("sucursales").select("codigo_postal").eq("id", sucursalId).maybeSingle();
  const cp = (suc as { codigo_postal?: string | null } | null)?.codigo_postal;
  if (!cp) return null;
  const { data } = await supabase.from("sepomex_asentamientos").select("municipio").eq("codigo_postal", cp).limit(1).maybeSingle();
  return (data as { municipio?: string } | null)?.municipio ?? null;
}

export async function sembrarColonias(sucursalId: string): Promise<{ insertadas: number; heredadas: number }> {
  const { data, error } = await supabase.rpc("sembrar_colonias", { p_sucursal: sucursalId });
  if (error) throw new Error(traducir(error.message));
  const r = (data ?? {}) as { insertadas?: number; heredadas?: number };
  return { insertadas: Number(r.insertadas) || 0, heredadas: Number(r.heredadas) || 0 };
}

export async function asignarZona(ids: string[], zonaId: string | null): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("colonias")
    .update({ zona_envio_id: zonaId, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(traducir(error.message));
}

export async function crearColonia(
  sucursalId: string,
  d: { nombre: string; codigoPostal?: string; zonaId: string | null },
): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("colonias").insert({
    tenant_id: tid,
    sucursal_id: sucursalId,
    nombre: d.nombre.trim(),
    codigo_postal: d.codigoPostal?.trim() || null,
    zona_envio_id: d.zonaId,
    origen: "CAPTURADA",
  });
  if (error) throw new Error(traducir(error.message));
}

export const eliminarColonia = (id: string): Promise<void> => borrarSuave("colonias", id);
