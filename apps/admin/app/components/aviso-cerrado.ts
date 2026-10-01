"use client";
import { useCallback, useEffect, useState } from "react";
import { cerrarAviso, leerCerrados } from "../lib/avisos-cerrados";

/**
 * Para un aviso con "×": `cerrado` y la función que lo cierra y lo recuerda en este navegador.
 * Hasta leer el almacenamiento (primer efecto) responde `cerrado = true`: así un aviso que la
 * persona ya cerró no parpadea al cargar la página.
 */
export function useAvisoCerrado(clave: string | null): { cerrado: boolean; cerrar: () => void } {
  const [cerrados, setCerrados] = useState<string[] | null>(null);
  useEffect(() => {
    setCerrados(leerCerrados(typeof window === "undefined" ? null : window.localStorage));
  }, []);
  const cerrar = useCallback(() => {
    if (clave) setCerrados(cerrarAviso(window.localStorage, clave));
  }, [clave]);
  return { cerrado: cerrados === null || (clave !== null && cerrados.includes(clave)), cerrar };
}
