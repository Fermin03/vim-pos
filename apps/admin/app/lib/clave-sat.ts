"use client";
import { z } from "zod";
import { supabase } from "./supabase";

/** Clave del catálogo c_ClaveProdServ: 8 dígitos. La comparten productos, combos y servicios. */
export const claveSatSchema = z.string().trim().regex(/^\d{8}$/, "La clave del SAT son 8 dígitos");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type ClaveSat = { clave: string; descripcion: string };

export async function buscarClavesSat(texto: string): Promise<ClaveSat[]> {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(`${SB_URL}/functions/v1/buscar-clave-sat`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${sess.session?.access_token ?? SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  const data = (await res.json().catch(() => ({}))) as { claves?: ClaveSat[]; mensaje?: string; error?: string };
  if (!res.ok) throw new Error(data.mensaje ?? data.error ?? `HTTP ${res.status}`);
  return data.claves ?? [];
}
