"use client";
import { deviceClient } from "./supabase";

/**
 * Folios de facturación que le quedan al negocio.
 *
 * POR QUÉ NO SE LEE DE LA BASE LOCAL
 *
 * La caja trabaja contra su Postgres local y el saldo vive en la nube, donde lo mueve el panel de
 * plataforma al acreditar un paquete. Traerlo en el snapshot de sincronización parecía lo natural,
 * pero el PULL baja el catálogo **1 de cada 6 ciclos, o sea cada hora**: el cajero le pagaría a VIM
 * un paquete y seguiría viendo cero durante una hora. Para este dato la copia local es peor que
 * inútil, porque induce a error justo cuando alguien está esperando su factura.
 *
 * Se consulta **a demanda y contra la nube**. Manual y no automático a propósito: pedirlo en cada
 * venta ataría la caja a la conexión, que es exactamente lo que el producto evita.
 *
 * En el escritorio la petición pasa por `/__folios` del servidor local, que es quien tiene el token
 * de nube del dispositivo. En el POS web el cliente ya apunta a la nube y se lee directo.
 */

export type SaldoFolios = {
  /** Folios prepagados que quedan. */
  paquetes: number;
  /** Los del plan que quedan este mes. No se acumulan: el mes que viene se reinician. */
  baseRestante: number;
  /** Lo que de verdad se puede timbrar hoy. */
  total: number;
};

export type LecturaFolios =
  | { estado: "ok"; saldo: SaldoFolios }
  | { estado: "sin-conexion" }
  | { estado: "no-aplica" };

const esEscritorio = (): boolean =>
  typeof window !== "undefined" && (window as unknown as { __VIM_DESKTOP?: boolean }).__VIM_DESKTOP === true;

export async function leerFolios(): Promise<LecturaFolios> {
  return esEscritorio() ? await desdeEscritorio() : await desdeNube();
}

async function desdeEscritorio(): Promise<LecturaFolios> {
  try {
    const r = await fetch("/__folios", { cache: "no-store" });
    if (!r.ok) return { estado: "sin-conexion" };
    const d = (await r.json()) as { ok?: boolean; aplica?: boolean; paquetes?: number; base_restante?: number };
    if (d.aplica === false) return { estado: "no-aplica" };
    if (!d.ok) return { estado: "sin-conexion" };
    return {
      estado: "ok",
      saldo: armar(Number(d.paquetes ?? 0), Number(d.base_restante ?? 0)),
    };
  } catch {
    return { estado: "sin-conexion" };
  }
}

async function desdeNube(): Promise<LecturaFolios> {
  try {
    const { data, error } = await deviceClient
      .from("tenant_folios_saldo")
      .select("saldo_paquetes, folios_base_mensuales, folios_base_consumidos")
      .maybeSingle();
    if (error) return { estado: "sin-conexion" };
    if (!data) return { estado: "no-aplica" };
    const f = data as { saldo_paquetes: number; folios_base_mensuales: number; folios_base_consumidos: number };
    return {
      estado: "ok",
      saldo: armar(f.saldo_paquetes, f.folios_base_mensuales - f.folios_base_consumidos),
    };
  } catch {
    return { estado: "sin-conexion" };
  }
}

function armar(paquetes: number, baseRestante: number): SaldoFolios {
  // La base consumida puede pasarse de la mensual (la global se timbra aunque no queden folios),
  // y un negativo restaría de los paquetes, que sí están pagados.
  const base = Math.max(baseRestante, 0);
  const paq = Math.max(paquetes, 0);
  return { paquetes: paq, baseRestante: base, total: base + paq };
}

export type NivelFolios = "ok" | "pocos" | "agotados";

/**
 * Traduce el saldo a algo que el cajero pueda leer de un vistazo. Función PURA.
 *
 * El umbral de aviso es generoso a propósito. Quedarse sin folios no se arregla en el momento:
 * hay que avisar a VIM, pagar y esperar a que acrediten. Avisar cuando ya solo quedan cinco sería
 * avisar tarde.
 */
export function evaluarFolios(saldo: SaldoFolios, umbral = 25): { nivel: NivelFolios; texto: string } {
  if (saldo.total <= 0) return { nivel: "agotados", texto: "Sin folios para facturar" };
  const uno = saldo.total === 1;
  const plural = uno ? "folio" : "folios";
  if (saldo.total <= umbral) {
    return { nivel: "pocos", texto: `${uno ? "Queda" : "Quedan"} ${saldo.total} ${plural}` };
  }
  return { nivel: "ok", texto: `${saldo.total} ${plural}` };
}
