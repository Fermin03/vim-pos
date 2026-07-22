"use client";
import { useEffect } from "react";

/** Fase 3 — registra el service worker del app-shell offline (solo navegadores que lo soportan). */
export function RegistrarSw() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // updateViaCache:"none" → el navegador revalida sw.js en cada registro en vez de servirlo de
      // su propia caché (que puede retenerlo hasta 24 h). Sin esto, una versión nueva del SW puede
      // tardar un día en tomarse, y con ella la purga de cachés viejas.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => { /* sin SW se degrada a online-only */ });
    }
  }, []);
  return null;
}
