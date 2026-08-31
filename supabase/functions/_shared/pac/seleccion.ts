// Qué PAC toca, dada la configuración. Vive aparte de `index.ts` por dos razones:
//
//   1. No importa nada. `index.ts` arrastra los adaptadores, y uno de ellos usa propiedades de
//      constructor, que el `--experimental-strip-types` de Node no soporta: importarlo desde una
//      prueba revienta. Aquí no hay nada que importar, así que se prueba sin Deno y sin trucos.
//   2. Es una decisión, no un mecanismo. Merece leerse sola.

/** `NINGUNO` = no hay PAC real configurado y el mock no está permitido. */
export type EleccionPac = "FACTURAMA" | "FACTURAPI" | "MOCK" | "NINGUNO";

/** Código con el que "no hay PAC" viaja hasta quien llamó, para marcar el CFDI en ERROR. */
export const PAC_NO_CONFIGURADO = "PAC_NO_CONFIGURADO";

/**
 * Recibe un lector de variables en vez de leer `Deno.env`, para poder probarlo.
 *
 * EL ORDEN IMPORTA. Facturama va primero porque es el único que sirve multi-tenant: lleva el
 * emisor en el payload, así que una sola credencial timbra a nombre de cualquier cliente.
 * Facturapi deduce el emisor de su llave, de modo que con una llave global TODO saldría con
 * nuestro RFC y no con el del restaurante — por eso es respaldo y nunca principal.
 *
 * Y EL MOCK SE PIDE. Antes era el último de la lista y entraba solo cuando faltaban credenciales.
 * El mock simula un timbrado exitoso: el CFDI quedaba TIMBRADO, se consumía un folio y el cliente
 * recibía por correo un comprobante que no existe ante el SAT. Ahora, sin `PAC_PERMITIR_MOCK=1`,
 * la respuesta es `NINGUNO` y no se timbra nada.
 */
export function elegirPac(env: (clave: string) => string | undefined): EleccionPac {
  const usuario = (env("FACTURAMA_API_USER") ?? "").trim();
  const password = (env("FACTURAMA_API_PASSWORD") ?? "").trim();
  if (usuario && password) return "FACTURAMA";

  const key = (env("FACTURAPI_API_KEY") ?? "").trim();
  if (key) return "FACTURAPI";

  if ((env("PAC_PERMITIR_MOCK") ?? "").trim() === "1") return "MOCK";

  return "NINGUNO";
}
