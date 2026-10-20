// Dirección de cada app para enlazar de una a otra (admin → /mi-agenda del POS y de vuelta a
// /recuperar del admin). En la computadora de desarrollo cada app corre en su puerto (pos 3000,
// admin 3001); en cualquier otro lado, el dominio de producción.
const PRODUCCION = { pos: "https://pos.vimpos.com.mx", admin: "https://admin.vimpos.com.mx" } as const;
const LOCAL = { pos: "http://localhost:3000", admin: "http://localhost:3001" } as const;

export type App = keyof typeof PRODUCCION;

/** Origen de `app` visto desde una página servida en `hostname` (window.location.hostname). */
export function urlApp(app: App, hostname: string): string {
  return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? LOCAL[app] : PRODUCCION[app];
}
