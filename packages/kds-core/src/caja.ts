"use client";
import { clienteConToken } from "./cliente";

/** Datos mínimos de la caja que necesita la pantalla de cocina. Compatible estructuralmente
 *  con el DatosCaja del POS (mismos campos), así que el POS puede pasar el suyo tal cual. */
export type CajaKds = {
  tenant_id: string;
  sucursal_id: string;
  nombre: string;
  sucursalNombre: string;
};

/** Lee la caja (para saber su sucursal y nombre). RLS por tenant. */
export async function leerCaja(token: string, cajaId: string): Promise<CajaKds> {
  const { data, error } = await clienteConToken(token)
    .from("cajas")
    .select("tenant_id, sucursal_id, nombre, sucursal:sucursales(nombre)")
    .eq("id", cajaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Caja no encontrada");
  type Fila = { tenant_id: string; sucursal_id: string; nombre: string; sucursal: { nombre: string } | null };
  const f = data as unknown as Fila;
  return {
    tenant_id: f.tenant_id,
    sucursal_id: f.sucursal_id,
    nombre: f.nombre,
    sucursalNombre: f.sucursal?.nombre ?? "—",
  };
}
