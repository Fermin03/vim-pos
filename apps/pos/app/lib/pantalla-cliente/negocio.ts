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

/**
 * El negocio con el que arranca la pantalla, para el `useState` inicial: así el logo sale en el
 * primer cuadro y la ventana no se abre en blanco.
 *
 * Leer `localStorage` al crear el estado solo es seguro porque la pantalla del cliente NUNCA se
 * dibuja en el servidor: `page.tsx` elige el modo `?cliente` en un efecto, ya en el navegador. En
 * un componente que sí se pre-renderiza, el servidor diría «sin negocio» y el navegador otra cosa
 * (error de hidratación). Por si algún día se renderiza fuera del navegador: `undefined` = sin mirar.
 */
export function negocioAlAbrir(): Negocio | null | undefined {
  if (typeof window === "undefined") return undefined;
  return negocioGuardado();
}

/** Lo que dibuja reposo cuando no hay anuncios. */
export type LoQueVeReposo =
  | { ve: "logo"; logoUrl: string; nombre: string | null }
  | { ve: "nombre"; nombre: string }
  | { ve: "vim" };

/**
 * Qué enseña reposo sin anuncios. PURA. `logoRoto` es el logo que ya falló al cargar (un data
 * URI dañado): se recuerda cuál, para que uno nuevo sí se intente. Reposo nunca queda en blanco:
 * sin logo queda el nombre, y sin ninguno de los dos, la marca de VIM.
 */
export function queEnsenaReposo(negocio: Negocio | null, logoRoto: string | null): LoQueVeReposo {
  // Un nombre vacío o de puros espacios es no tener nombre.
  const nombre = negocio?.nombre.trim() || null;
  const logoUrl = negocio?.logoUrl && negocio.logoUrl !== logoRoto ? negocio.logoUrl : null;
  if (logoUrl) return { ve: "logo", logoUrl, nombre };
  if (nombre) return { ve: "nombre", nombre };
  return { ve: "vim" };
}

export function recordarNegocio(n: Negocio): void {
  try { localStorage.setItem(CLAVE_NEGOCIO, JSON.stringify({ nombre: n.nombre, logoUrl: n.logoUrl })); } catch { /* */ }
}

export function olvidarNegocio(): void {
  try { localStorage.removeItem(CLAVE_NEGOCIO); } catch { /* */ }
}
