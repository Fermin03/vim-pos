"use client";
import { useEffect } from "react";

/** Fase 3 — registra el service worker del app-shell offline (solo navegadores que lo soportan). */
export function RegistrarSw() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* sin SW se degrada a online-only */ });
    }
  }, []);
  return null;
}
