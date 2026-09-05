"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recarga cada `ms` mientras la pestaña está visible, y al volver a ella. Sin websockets: el
 * panel lo usa una persona. Devuelve hace cuántos segundos se cargó, para el pie de página.
 *
 * Antes cada pantalla se cargaba una sola vez: la bandeja de Atención era una foto del momento
 * en que se abrió el panel, y una caja que se caía a media mañana no aparecía hasta recargar.
 */
export function useRefresco(cargar: () => Promise<void>, ms = 60_000): { hace: number | null; recargar: () => Promise<void> } {
  const [ultima, setUltima] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const recargar = useCallback(async () => {
    await cargarRef.current();
    setUltima(Date.now());
  }, []);

  useEffect(() => {
    let vivo = true;
    // La primera carga va siempre: una pestaña abierta en segundo plano se quedaría en
    // "Cargando…" hasta que alguien la mirara. Solo el refresco periódico espera a ser visible.
    const corre = () => { if (vivo && document.visibilityState === "visible") void recargar(); };
    void recargar();
    const id = setInterval(corre, ms);
    document.addEventListener("visibilitychange", corre);
    const reloj = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => {
      vivo = false;
      clearInterval(id);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", corre);
    };
  }, [ms, recargar]);

  return { hace: ultima ? Math.floor((Date.now() - ultima) / 1000) : null, recargar };
}

/** Pie común: "Actualizado hace N s". */
export function textoActualizado(hace: number | null): string {
  if (hace === null) return "Cargando…";
  if (hace < 5) return "Actualizado ahora";
  return `Actualizado hace ${hace} s`;
}
