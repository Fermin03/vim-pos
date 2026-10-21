"use client";
import { supabase } from "./supabase";
import { tenantId } from "./datos";
import { esGiroComidaRapida } from "@vim/db/operacion";

export type ConfigMostrador = { pedirNombre: boolean; tieneDondeComer: boolean };

/** Qué casillas del mostrador ve cada giro: comida rápida, food truck y cafetería; «dónde comer» solo el food truck (los otros dos siempre preguntan). */
export function casillasMostrador(giro: string | null): { nombre: boolean; dondeComer: boolean } {
  return { nombre: esGiroComidaRapida(giro), dondeComer: giro === "FOODTRUCK" };
}

export async function leerConfigMostrador(): Promise<ConfigMostrador> {
  const tid = await tenantId();
  const { data, error } = await supabase.from("configuracion_tenant").select("pedir_nombre_cliente, tiene_donde_comer").eq("tenant_id", tid).maybeSingle();
  if (error) throw new Error(error.message);
  return { pedirNombre: data?.pedir_nombre_cliente === true, tieneDondeComer: data?.tiene_donde_comer === true };
}

/** Upsert por tenant_id: la mayoría de los negocios aún no tiene fila (igual que `activarComboUpsell`). */
export async function guardarConfigMostrador(c: Partial<ConfigMostrador>): Promise<void> {
  const tid = await tenantId();
  const fila = {
    tenant_id: tid,
    ...(c.pedirNombre !== undefined && { pedir_nombre_cliente: c.pedirNombre }),
    ...(c.tieneDondeComer !== undefined && { tiene_donde_comer: c.tieneDondeComer }),
  };
  const { error } = await supabase.from("configuracion_tenant").upsert(fila, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}
