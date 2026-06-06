// F8 — Selector de PAC. Si hay FACTURAPI_API_KEY en el entorno usa Facturapi (@sin-verificar);
// si no, usa el PAC mock (dev/piloto). Mismo patrón que obtenerImpresora() en el POS.
import type { PacAdapter } from "./tipos.ts";
import { MockPac } from "./mock.ts";
import { FacturapiPac } from "./facturapi.ts";

export function obtenerPac(): PacAdapter {
  const key = Deno.env.get("FACTURAPI_API_KEY");
  if (key && key.length > 0) return new FacturapiPac(key);
  return new MockPac();
}

export type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
