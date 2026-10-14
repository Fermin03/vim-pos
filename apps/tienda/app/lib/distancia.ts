// El envío por distancia (0179) visto desde el teléfono: la MISMA cuenta que hace la base
// (`_tienda_distancia_km` y `tienda_cotizar`), solo para enseñar el precio mientras se mueve el pin.
// La que cobra es la de la base: al soltar el pin se cotiza y su número reemplaza a este.
import type { Tramo } from "./contrato";

export type Punto = { lat: number; lng: number };

const RADIO_TIERRA_KM = 6371.0088;
/** Las calles no van en línea recta: el factor de rodeo que usa la base. Si cambia allá, cambia aquí. */
export const FACTOR_CALLES = 1.3;

/** Distancia aproximada en calles, en décimas de km (entero): 3.2 km = 32. Así no hay flotantes que comparar. */
export function decimasDeKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h))) * FACTOR_CALLES * 10);
}

/** «3.2» a partir de décimas. */
export const kmDeDecimas = (d: number): string => `${Math.floor(d / 10)}.${d % 10}`;

/** Décimas de un «hasta_km» de la base («3.0», «12.5»); null si no tiene esa forma. */
const decimasDe = (km: string): number | null => (/^\d{1,2}\.\d$/.test(km) ? Number(km.replace(".", "")) : null);

/**
 * El tramo que cobra una distancia: el primero cuyo límite la alcanza (el borde cuenta: a 3.0 km,
 * «hasta 3 km»). null = fuera del área. Los tramos llegan en orden creciente.
 */
export function tramoDe(tramos: readonly Tramo[], decimas: number): Tramo | null {
  return tramos.find((t) => { const d = decimasDe(t.hasta_km); return d !== null && d >= decimas; }) ?? null;
}

/** El alcance: el límite del último tramo, en km («8.0»). */
export const alcanceDe = (tramos: readonly Tramo[]): string | null => tramos.at(-1)?.hasta_km ?? null;

/** Un punto con la forma que acepta la función: números finitos, en rango, a 6 decimales. */
export function puntoValido(x: { lat: number; lng: number }): Punto | null {
  if (!Number.isFinite(x.lat) || !Number.isFinite(x.lng) || Math.abs(x.lat) > 90 || Math.abs(x.lng) > 180) return null;
  return { lat: Math.round(x.lat * 1e6) / 1e6, lng: Math.round(x.lng * 1e6) / 1e6 };
}
