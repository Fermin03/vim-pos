// Puerta interna del camino "pausar" en delivery-uber-conexion (Task 6, ADR 0011). Vive aparte
// para poder probarla con `node --test`: el handler no se prueba (toca la base y Deno.serve), así
// que esta es la única parte de la puerta que queda verificada en CI — mismo patrón que
// `respuestaSinModulo` en espejo.ts, extraído después de que esta puerta pasara por tres rondas de
// revisión (una de las cuales llegó a abrir la función entera) sin que quedara ninguna prueba.

import { igualesEnTiempoConstante } from "./firma.ts";

/**
 * ¿El secreto que trae `x-vim-interno` es el configurado? Solo tiene sentido llamarla cuando la
 * cabecera vino no vacía (eso lo decide el handler, comparando contra ""); aquí solo se decide si
 * ese valor es legítimo. Un secreto no configurado en el entorno (`""`) es SIEMPRE inválido — no
 * puede "coincidir por accidente" con una cabecera vacía.
 */
export function secretoInternoValido(secretoRecibido: string, secretoConfigurado: string): boolean {
  return secretoConfigurado !== "" && igualesEnTiempoConstante(secretoRecibido, secretoConfigurado);
}

/**
 * El camino interno existe solo para que apps/platform avise a Uber cuando retira el add-on de un
 * tenant, es decir, para pausar. El secreto autentica AL LLAMADOR, no autoriza cualquier acción en
 * su nombre: con secreto válido y cualquier otra acción, se rechaza igual.
 */
export function accionInternaPermitida(accion: string | undefined): boolean {
  return accion === "pausar";
}
