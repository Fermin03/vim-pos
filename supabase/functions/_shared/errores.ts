// Errores internos: al log del servidor, nunca al cliente.
//
// Auditoría integral 30/09/2026 (C2-9). Varias funciones devolvían `detalle: error.message` —el
// texto crudo de Postgres, de GoTrue o de la API de Uber— a quien llamara: nombres de tablas y
// restricciones, mensajes de validación internos, respuestas de terceros. Nada de eso le sirve al
// usuario (las pantallas traducen el CÓDIGO: ver mensajeErrorIntegracion en admin o
// mensajeErrorTienda en el POS) y a un atacante le enseña el esquema.
//
// Ahora el mensaje va a `console.error` (los logs de la función en Supabase, que es donde se
// diagnostica) con el nombre de la función y el código, y al cliente solo le llega el código.

/** El texto de cualquier cosa que se lance o que devuelva supabase-js como `error`. */
export function textoDeError(causa: unknown): string {
  if (causa instanceof Error) return causa.message;
  if (causa && typeof causa === "object" && "message" in causa) return String((causa as { message: unknown }).message);
  return String(causa);
}

/** Deja el error en el log de la función: `[funcion] CODIGO: mensaje`. */
export function registrarError(funcion: string, codigo: string, causa: unknown): void {
  console.error(`[${funcion}] ${codigo}: ${textoDeError(causa)}`);
}
