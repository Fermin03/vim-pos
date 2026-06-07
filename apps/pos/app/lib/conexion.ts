"use client";
import { useEffect, useState } from "react";

/**
 * F16 — Estado de conexión. Hoy el POS habla directo a Supabase (online-first); este hook
 * detecta cuando se cae la red para avisar al cajero que NO puede cobrar hasta reconectar
 * (mejor que un error silencioso). El offline-first completo (cola Dexie + sync por batch,
 * doc 1C.2 §10) es la siguiente arquitectura — ver docs/OFFLINE-ARQUITECTURA.md.
 *
 * Combina navigator.onLine (instantáneo pero a veces miente) con un ping ligero a Supabase
 * para confirmar que la API responde de verdad.
 */
export function useConexion(pingUrl?: string): { online: boolean; verificando: boolean } {
  const [online, setOnline] = useState(true);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    let activo = true;

    async function verificar() {
      // navigator.onLine = false es confiable para "no hay red"; true puede mentir.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (activo) setOnline(false);
        return;
      }
      if (!pingUrl) {
        if (activo) setOnline(true);
        return;
      }
      if (activo) setVerificando(true);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        // HEAD ligero al gateway; si responde (cualquier status) la red está viva.
        await fetch(pingUrl, { method: "HEAD", signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (activo) setOnline(true);
      } catch {
        if (activo) setOnline(false);
      } finally {
        if (activo) setVerificando(false);
      }
    }

    verificar();
    const onUp = () => verificar();
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    // Re-verifica cada 20s por si la red se cae sin disparar el evento.
    const id = setInterval(verificar, 20000);

    return () => {
      activo = false;
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      clearInterval(id);
    };
  }, [pingUrl]);

  return { online, verificando };
}
