/**
 * El negocio que la pantalla del cliente recuerda entre arranques: por la mañana, antes de que
 * entre el cajero, nadie publica nada y la pantalla igual tiene que enseñar el logo.
 *
 * Vive en `localStorage`, que comparten la caja y la pantalla (mismo origen). Por eso la caja puede
 * borrarlo al desvincularse: el logo de un negocio no debe salir cuando el equipo ya es de otro.
 *
 * Nada de aquí lanza: sin almacenamiento, o con uno que falla, la pantalla espera el saludo de la caja.
 */
import type { Negocio } from "./vista";

export const CLAVE_NEGOCIO = "vim.pantalla-cliente.negocio";

export function negocioGuardado(): Negocio | null {
  try {
    const n: unknown = JSON.parse(localStorage.getItem(CLAVE_NEGOCIO) ?? "null");
    if (n && typeof n === "object" && "nombre" in n && typeof n.nombre === "string") {
      const logoUrl = "logoUrl" in n && typeof n.logoUrl === "string" ? n.logoUrl : null;
      return { nombre: n.nombre, logoUrl };
    }
  } catch { /* sin almacenamiento o con basura: se espera al saludo de la caja */ }
  return null;
}

export function recordarNegocio(n: Negocio): void {
  try { localStorage.setItem(CLAVE_NEGOCIO, JSON.stringify({ nombre: n.nombre, logoUrl: n.logoUrl })); } catch { /* */ }
}

export function olvidarNegocio(): void {
  try { localStorage.removeItem(CLAVE_NEGOCIO); } catch { /* */ }
}
