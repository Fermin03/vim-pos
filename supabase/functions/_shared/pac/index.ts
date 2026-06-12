// F8 / Fase 4 — Selector de PAC con REDUNDANCIA (multi-PAC).
// PAC principal: Facturapi si hay FACTURAPI_API_KEY; si no, mock (dev/piloto).
// PAC de respaldo (opcional): env PAC_RESPALDO = "mock" | "facturapi".
//
// Política de failover (conservadora, anti doble-timbrado):
//   • Solo se intenta el respaldo si el principal FALLA EN TRANSPORTE (excepción/red).
//   • Si el principal responde ok:false (rechazo de validación del SAT/PAC), NO hay
//     failover: los mismos datos fallarían igual y reintentar en otro PAC arriesga
//     duplicar el comprobante.
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
import { MockPac } from "./mock.ts";
import { FacturapiPac } from "./facturapi.ts";

function construir(nombre: string | undefined): PacAdapter | null {
  const key = Deno.env.get("FACTURAPI_API_KEY");
  switch ((nombre ?? "").toLowerCase()) {
    case "facturapi":
      return key && key.length > 0 ? new FacturapiPac(key) : null;
    case "mock":
      return new MockPac();
    default:
      return null;
  }
}

export function obtenerPac(): PacAdapter {
  const key = Deno.env.get("FACTURAPI_API_KEY");
  if (key && key.length > 0) return new FacturapiPac(key);
  return new MockPac();
}

export function obtenerPacRespaldo(principal: PacAdapter): PacAdapter | null {
  const respaldo = construir(Deno.env.get("PAC_RESPALDO"));
  if (!respaldo || respaldo.nombre === principal.nombre) return null;
  return respaldo;
}

export type ResultadoTimbradoMulti = PacTimbradoResult & { pacUsado: string; failover: boolean };

/** Timbra con el principal; si falla EN TRANSPORTE y hay respaldo configurado, reintenta con él. */
export async function timbrarConFailover(req: PacTimbradoRequest): Promise<ResultadoTimbradoMulti> {
  const principal = obtenerPac();
  try {
    const r = await principal.timbrar(req);
    return { ...r, pacUsado: principal.nombre, failover: false };
  } catch (e) {
    const respaldo = obtenerPacRespaldo(principal);
    if (!respaldo) throw e;
    const r = await respaldo.timbrar(req);
    return { ...r, pacUsado: respaldo.nombre, failover: true };
  }
}

export type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
