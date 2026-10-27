"use client";
import { useEffect } from "react";
import { ANCHO_DISENO, anchoLayout, esTableta } from "../lib/tableta";

/** Escala la caja en tableta (ver `lib/tableta.ts`). Sin efecto en escritorio ni con mouse. */
export function AjusteTableta() {
  useEffect(() => {
    if (!esTableta()) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const vertical = window.matchMedia("(orientation: portrait)");
    const ajustar = () => {
      const ancho = anchoLayout(screen.width, screen.height, vertical.matches);
      if (ancho == null) return;
      const escala = Math.max(screen.width, screen.height) / ANCHO_DISENO;
      meta.content = `width=${ancho}, initial-scale=${escala.toFixed(3)}`;
    };
    ajustar();
    vertical.addEventListener("change", ajustar);
    return () => vertical.removeEventListener("change", ajustar);
  }, []);
  return null;
}
