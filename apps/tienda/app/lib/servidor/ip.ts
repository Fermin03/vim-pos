/**
 * La IP del cliente final, para mandarla a la función en `x-tienda-ip` (de ella cuelgan los cupos).
 * Primero las cabeceras que escribe la plataforma y el cliente no puede fijar
 * (`x-vercel-forwarded-for`, `x-real-ip`); la primera entrada de `x-forwarded-for` solo como último
 * recurso: fuera de Vercel la escribe quien llama. Mismo criterio que apps/platform/app/lib/server.ts.
 * Sin ninguna, "desconocida": la función mete a todos esos en un mismo contador, que es lo seguro.
 */
export function ipDe(cabeceras: Headers): string {
  const valor = cabeceras.get("x-vercel-forwarded-for") ?? cabeceras.get("x-real-ip") ?? cabeceras.get("x-forwarded-for");
  return valor?.split(",")[0]?.trim() || "desconocida";
}
