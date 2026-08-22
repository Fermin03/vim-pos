"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

/**
 * Estaciones de preparación: dónde se prepara cada cosa y, por lo tanto, dónde se imprime su
 * comanda. "Cocina", "Barra", y mañana "Postres" si hace falta.
 *
 * La tabla existe desde la 0007 con su impresora y su formato de comanda, pero nunca tuvo pantalla
 * ni la usaba el POS: el reporte de ventas por área llevaba desde entonces diciendo "General".
 *
 * Aquí NO se configura la impresora. Qué impresora física le toca a cada estación es propio de
 * cada caja —una segunda caja del mismo negocio tiene otras IPs— y se elige en el POS, en
 * Configurar impresora.
 */

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const S = (v: unknown) => (v == null ? "" : String(v));

export type AreaCocina = {
  id: string;
  sucursalId: string;
  sucursalNombre: string;
  nombre: string;
  tipo: string;
  activa: boolean;
};

export const TIPOS_AREA = [
  { v: "COCINA_CALIENTE", l: "Cocina caliente" },
  { v: "COCINA_FRIA", l: "Cocina fría" },
  { v: "BARRA", l: "Barra" },
  { v: "PIZZAS", l: "Pizzas" },
  { v: "POSTRES", l: "Postres" },
  { v: "CAFE", l: "Café" },
  { v: "OTRO", l: "Otro" },
] as const;

export const areaSchema = z.object({
  sucursal_id: z.string().uuid("Elige una sucursal"),
  nombre: z.string().trim().min(2, "Escribe el nombre").max(100),
  tipo: z.enum(["COCINA_CALIENTE", "COCINA_FRIA", "BARRA", "PIZZAS", "POSTRES", "CAFE", "OTRO"]),
});
export type AreaInput = z.infer<typeof areaSchema>;

export async function listarAreasCocina(): Promise<AreaCocina[]> {
  const { data, error } = await supabase
    .from("areas_cocina")
    .select("id, sucursal_id, nombre, tipo, activa, sucursal:sucursales(nombre)")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    sucursalId: String(a.sucursal_id),
    sucursalNombre: S((a.sucursal as { nombre?: string } | null)?.nombre),
    nombre: S(a.nombre),
    tipo: S(a.tipo),
    activa: a.activa !== false,
  }));
}

export async function crearArea(d: AreaInput): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("areas_cocina").insert({
    tenant_id: tid, sucursal_id: d.sucursal_id, nombre: d.nombre.trim(), tipo: d.tipo,
  });
  if (error) throw new Error(traducir(error.message));
}

export async function editarArea(id: string, d: AreaInput): Promise<void> {
  const { error } = await supabase
    .from("areas_cocina")
    .update({ sucursal_id: d.sucursal_id, nombre: d.nombre.trim(), tipo: d.tipo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

export async function setActivaArea(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase
    .from("areas_cocina")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Baja lógica. Los productos y categorías que apuntaban aquí quedan en NULL por la FK
 * (ON DELETE SET NULL solo aplica al borrado real, así que se limpian a mano) y vuelven a
 * imprimirse en cocina: sin estación asignada nada se pierde, solo deja de repartirse.
 */
export async function eliminarArea(id: string): Promise<void> {
  await supabase.from("productos").update({ area_cocina_id: null }).eq("area_cocina_id", id);
  await supabase.from("categorias").update({ area_cocina_id: null }).eq("area_cocina_id", id);
  const { error } = await supabase
    .from("areas_cocina")
    .update({ deleted_at: new Date().toISOString(), activa: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function traducir(mensaje: string): string {
  if (mensaje.includes("nombre_area_unico_por_sucursal")) return "Ya hay una estación con ese nombre en la sucursal.";
  return mensaje;
}
