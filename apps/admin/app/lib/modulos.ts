"use client";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

/**
 * Módulos del cliente, en sus DOS capas (ADR 0014).
 *
 * `permitidos` es lo que VIM concedió; `efectivos`, lo que además el dueño encendió. El admin
 * necesita las dos: sin `permitidos` no podría mostrar la sección de delivery con su interruptor
 * apagado, y el dueño no tendría dónde encenderla.
 *
 * Sin respuesta del RPC se devuelve vacío, que es lo mismo que "nada permitido": esconder de más
 * es recuperable —el dueño llama— y mostrar de más deja tocar lo que no se pagó.
 */
export async function leerModulos(): Promise<{ permitidos: Record<string, boolean>; efectivos: Record<string, boolean> }> {
  const tid = await tenantId();
  const { data, error } = await supabase.rpc("modulos_efectivos", { p_tenant: tid });
  if (error) throw new Error(error.message);
  const m = data as { permitidos?: Record<string, boolean>; efectivos?: Record<string, boolean> } | null;
  return { permitidos: m?.permitidos ?? {}, efectivos: m?.efectivos ?? {} };
}

/**
 * Enciende o apaga las apps de delivery. Mismo upsert que el de inventario
 * (`activarModuloInventario`, `inventario.ts:183`): la mayoría de los tenants no tiene fila en
 * `configuracion_tenant` hasta el primer ajuste, así que un UPDATE afectaría cero filas.
 */
export async function activarModuloDelivery(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_delivery_activo: activo }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}
