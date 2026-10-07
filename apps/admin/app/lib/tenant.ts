"use client";
import { leerSesion } from "./supabase";

/** El tenant de la sesión. Lo piden los módulos de datos del panel antes de leer o escribir. */
export async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
