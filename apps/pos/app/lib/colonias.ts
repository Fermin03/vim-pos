"use client";
import { employeeClient } from "./supabase";
import { zonaVigente, type ZonaEnvio } from "./zonas-envio";

// Catálogo de colonias de la sucursal (0187, ADR 0036). Sugiere la zona del domicilio; el
// domicilio guarda la suya. En el escritorio estas consultas van a la base local: sirven sin internet.

export type Colonia = { id: string; nombre: string; codigoPostal: string | null; zona: ZonaEnvio | null };

type Fila = { id: string; nombre: string; codigo_postal: string | null; zona: { id: string; nombre: string; costo_mxn: number } | null };

/** Igual que `nombre_busqueda` en la base: sin acentos, minúsculas, sin espacios de sobra en las orillas. */
export function normalizarColonia(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function ordenarSugerencias(lista: Colonia[], q: string): Colonia[] {
  const t = normalizarColonia(q);
  const empieza = (x: Colonia) => (normalizarColonia(x.nombre).startsWith(t) ? 0 : 1);
  return [...lista].sort((a, b) => empieza(a) - empieza(b) || a.nombre.localeCompare(b.nombre, "es")).slice(0, 8);
}

export function etiquetaColonia(c: Colonia): string {
  return c.codigoPostal ? `${c.nombre} · ${c.codigoPostal}` : c.nombre;
}

const COLUMNAS = "id, nombre, codigo_postal, zona:zonas_envio(id, nombre, costo_mxn)";

/** La zona embebida solo vale si sigue vigente, y con el precio de hoy (como `zonaVigente`). */
function mapear(f: Fila, vigentes: ZonaEnvio[]): Colonia {
  const zona = f.zona ? { id: f.zona.id, nombre: f.zona.nombre, costoMxn: Number(f.zona.costo_mxn) } : null;
  return { id: f.id, nombre: f.nombre, codigoPostal: f.codigo_postal, zona: zonaVigente(zona, vigentes) };
}

/** `%` y `_` del texto se buscan tal cual, no como comodines. */
const escaparLike = (t: string) => t.replace(/[\%_]/g, (m) => `\${m}`);

export async function hayColonias(token: string, sucursalId: string): Promise<boolean> {
  const { count, error } = await employeeClient(token).from("colonias")
    .select("id", { count: "exact", head: true }).eq("sucursal_id", sucursalId).is("deleted_at", null).limit(1);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function buscarColonias(token: string, sucursalId: string, q: string, vigentes: ZonaEnvio[]): Promise<Colonia[]> {
  const t = normalizarColonia(q);
  if (t.length < 2) return [];
  const { data, error } = await employeeClient(token).from("colonias").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).is("deleted_at", null)
    .like("nombre_busqueda", `%${escaparLike(t)}%`).limit(30);
  if (error) throw new Error(error.message);
  return ordenarSugerencias(((data ?? []) as unknown as Fila[]).map((f) => mapear(f, vigentes)), q);
}

/** La colonia del catálogo que se llama exactamente así (para domicilios ya guardados). Con homónimas, null. */
export async function coloniaExacta(token: string, sucursalId: string, nombre: string, vigentes: ZonaEnvio[]): Promise<Colonia | null> {
  const { data, error } = await employeeClient(token).from("colonias").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).is("deleted_at", null).eq("nombre_busqueda", normalizarColonia(nombre)).limit(2);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as Fila[];
  return filas.length === 1 ? mapear(filas[0]!, vigentes) : null;
}

export async function crearColonia(
  token: string,
  a: { tenantId: string; sucursalId: string; nombre: string; codigoPostal: string | null; zonaId: string | null },
): Promise<Colonia> {
  const { data, error } = await employeeClient(token).from("colonias")
    .insert({ tenant_id: a.tenantId, sucursal_id: a.sucursalId, nombre: a.nombre.trim(), codigo_postal: a.codigoPostal, zona_envio_id: a.zonaId })
    .select(COLUMNAS).single();
  if (error) throw new Error(error.message.includes("colonia_llave_uq") ? "Esa colonia ya está en el catálogo." : error.message);
  const f = data as unknown as Fila;
  return { id: f.id, nombre: f.nombre, codigoPostal: f.codigo_postal, zona: f.zona ? { id: f.zona.id, nombre: f.zona.nombre, costoMxn: Number(f.zona.costo_mxn) } : null };
}

export async function asignarZonaColonia(token: string, coloniaId: string, zonaId: string, autorizacionPinId: string | null): Promise<void> {
  const { error } = await employeeClient(token).rpc("asignar_zona_colonia", {
    p_colonia: coloniaId, p_zona: zonaId, p_autorizacion_pin_id: autorizacionPinId,
  });
  if (error) throw new Error(error.message);
}
