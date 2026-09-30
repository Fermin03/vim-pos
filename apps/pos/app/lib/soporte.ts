"use client";
import { useEffect, useState } from "react";
import { SOPORTE_POR_DEFECTO, soporteConRespaldo, type Soporte } from "@vim/db/soporte";
import { deviceClient } from "./supabase";

/**
 * El soporte de VIM que ve el cajero (0142, ADR 0022), del más fresco al de fábrica:
 *
 *   1. Caja de escritorio: `/__directivas` → lo que trajo el último latido, guardado en disco. Así
 *      se ve el número vigente aunque la caja lleve días sin internet.
 *   2. POS web (o un escritorio que todavía no ha latido): la RPC `soporte_plataforma()`.
 *   3. El número oficial compilado (`WHATSAPP_SOPORTE_VIM`). Nunca se queda sin a quién escribir.
 *
 * NUNCA lanza: esto se usa en la pantalla de bloqueo, que tiene que pintarse pase lo que pase.
 */
export async function leerSoporte(): Promise<{ soporte: Soporte; version: string | null }> {
  let desdeCaja: unknown = null;
  let version: string | null = null;
  try {
    const r = await fetch("/__directivas", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { disponible?: boolean; directivas?: { soporte?: unknown; version?: { instalada?: unknown } } };
      if (j.disponible) {
        desdeCaja = j.directivas?.soporte ?? null;
        const v = j.directivas?.version?.instalada;
        version = typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
      }
    }
  } catch {
    // POS web: esa ruta no existe.
  }
  let desdeNube: unknown = null;
  if (!desdeCaja) {
    try {
      const { data } = await deviceClient.rpc("soporte_plataforma");
      desdeNube = Array.isArray(data) ? data[0] : null;
    } catch {
      // Sin sesión o sin red: queda el de fábrica.
    }
  }
  return { soporte: soporteConRespaldo(desdeCaja, desdeNube), version };
}

/** El soporte para pintar. Arranca con el de fábrica —nunca en blanco— y se corrige al leer. */
export function useSoporte(): { soporte: Soporte; version: string | null } {
  const [r, setR] = useState<{ soporte: Soporte; version: string | null }>({ soporte: SOPORTE_POR_DEFECTO, version: null });
  useEffect(() => {
    let vivo = true;
    leerSoporte().then((x) => { if (vivo) setR(x); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return r;
}
