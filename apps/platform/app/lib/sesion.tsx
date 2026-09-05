"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LogoVim } from "@vim/ui/styles";
import type { Api } from "./tipos";
import { input, label } from "./formato";

const CLAVE = "vim.platform.clave";
const Ctx = createContext<{ api: Api; salir: () => void } | null>(null);

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSesion fuera de SesionProvider");
  return c;
}

/**
 * La clave vive en sessionStorage: muere al cerrar la pestaña y no sobrevive al navegador.
 * Antes vivía en estado de React, así que al pasar el panel a páginas un simple refresco la
 * perdía. Un 401 en cualquier llamada la borra y vuelve a pedirla: una clave rotada no deja el
 * panel "abierto" enseñando errores.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [clave, setClave] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    try { setClave(sessionStorage.getItem(CLAVE)); } catch { /* sin storage: se pide siempre */ }
    setListo(true);
  }, []);

  const salir = useCallback(() => {
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
    setClave(null);
  }, []);

  const api = useMemo<Api>(() => async (path, init) => {
    const res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), "X-Platform-Key": clave ?? "", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) { salir(); throw new Error("La clave ya no es válida. Vuelve a entrar."); }
    if (!res.ok) throw new Error(String(data.error ?? data.detalle ?? "Error"));
    return data;
  }, [clave, salir]);

  if (!listo) return null;
  if (!clave) {
    return (
      <Entrada
        onEntrar={(k) => {
          try { sessionStorage.setItem(CLAVE, k); } catch { /* nada */ }
          setClave(k);
        }}
      />
    );
  }
  return <Ctx.Provider value={{ api, salir }}>{children}</Ctx.Provider>;
}

function Entrada({ onEntrar }: { onEntrar: (clave: string) => void }) {
  const [k, setK] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  async function entrar() {
    setError(null);
    if (!k.trim()) { setError("Ingresa la clave de plataforma"); return; }
    setProbando(true);
    try {
      const r = await fetch("/api/tenants", { headers: { "X-Platform-Key": k } });
      if (r.status === 401) throw new Error("Clave incorrecta");
      if (r.status === 429) throw new Error("Demasiados intentos. Espera 15 minutos.");
      if (!r.ok) {
        // El motivo real, no un "no se pudo entrar" genérico: un 500 por una migración que
        // falta o un 503 por falta de PLATFORM_PROVISION_KEY se ven idénticos a una clave
        // equivocada, y se pierde el rato buscando el problema donde no está.
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; detalle?: string };
        throw new Error(cuerpo.error ?? cuerpo.detalle ?? `El servidor respondió ${r.status}`);
      }
      onEntrar(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al entrar");
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sel p-6">
      <div className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <LogoVim className="h-8 w-8" />
          <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
        </div>
        <p className="mb-5 text-[13px] text-ink-3">Panel de control interno de VIM. Acceso restringido.</p>
        <label className={label} htmlFor="pk">Clave de plataforma</label>
        <input id="pk" type="password" className={input} value={k} onChange={(e) => setK(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} autoFocus />
        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        <button onClick={entrar} disabled={probando} className="btn mt-4 h-11 w-full rounded bg-ink text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {probando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
