"use client";
import { useEffect } from "react";

/**
 * Escape como atajo de "volver" o "cerrar".
 *
 * En una caja el teclado gana a la pantalla: el cajero ya tiene las manos ahí capturando, y
 * llevar la mano al mouse o al táctil para cerrar un modal cuesta más de lo que parece cuando se
 * repite doscientas veces al día.
 *
 * `activo` evita el error clásico de esto: si todos los modales escucharan siempre, un Escape
 * cerraría varios a la vez. Cada punto se registra solo cuando de verdad está a la vista, y quien
 * lo usa decide la precedencia.
 */
export function useEscape(onEscape: (() => void) | null | undefined, activo = true): void {
  useEffect(() => {
    if (!activo || !onEscape) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Se marca como consumido para que un contenedor de más afuera no cierre también con la
      // misma pulsación.
      e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onEscape, activo]);
}
