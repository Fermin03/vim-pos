"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Aviso, LogoVim } from "@vim/ui/styles";
import { clienteAuth, mensajeAuth } from "../lib/cliente-auth";
import { input, label } from "../lib/formato";
import { AltaSegundoFactor } from "../components/segundo-factor";

const MINIMO = 12;

type Paso =
  | { tipo: "canjeando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "contrasena"; sb: SupabaseClient }
  | { tipo: "factor"; sb: SupabaseClient }
  | { tipo: "listo" };

/**
 * Activar o recuperar la cuenta de un operador del panel (A8).
 *
 * Llega aquí con el enlace de un solo uso que otro operador generó en Operadores
 * (`/acceso#token=…&tipo=invite|recovery`). El token va en el fragmento para que no toque ningún
 * servidor; se canjea directamente contra Supabase Auth, así que no hace falta registrar esta URL
 * entre las de redirección de Auth ni que salga ningún correo.
 *
 * Tres pasos: canjear el enlace → elegir contraseña → dar de alta la app autenticadora. Hasta el
 * tercero la cuenta no entra al panel: el servidor exige el segundo factor en cada petición.
 */
export default function Acceso() {
  const [paso, setPaso] = useState<Paso>({ tipo: "canjeando" });
  const canjeado = useRef(false);

  useEffect(() => {
    if (canjeado.current) return; // modo estricto: el token es de un solo uso
    canjeado.current = true;
    void (async () => {
      const h = new URLSearchParams(window.location.hash.slice(1));
      const token = h.get("token");
      const tipo = h.get("tipo");
      // Se borra de la barra de direcciones de inmediato: que no quede en el historial.
      window.history.replaceState(null, "", "/acceso");
      if (!token || (tipo !== "invite" && tipo !== "recovery")) {
        return setPaso({ tipo: "error", mensaje: "Este enlace está incompleto. Pide uno nuevo a otro operador." });
      }
      try {
        const sb = await clienteAuth();
        await sb.auth.signOut({ scope: "local" }); // que no se mezcle con otra sesión de la pestaña
        const { error } = await sb.auth.verifyOtp({ token_hash: token, type: tipo });
        if (error) throw error;
        setPaso({ tipo: "contrasena", sb });
      } catch (e) {
        setPaso({ tipo: "error", mensaje: mensajeAuth(e as { message?: string; code?: string }) });
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-sel p-6">
      <div className="w-[420px] max-w-full rounded-lg border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <LogoVim className="h-8 w-8" />
          <span className="font-display text-18 font-bold tracking-tight">VIM Plataforma</span>
        </div>
        <p className="mb-5 text-13 text-ink-3">Activa tu cuenta del panel interno.</p>

        {paso.tipo === "canjeando" && <p className="my-6 text-center text-13 text-ink-3">Revisando el enlace…</p>}
        {paso.tipo === "error" && <Aviso tono="danger" role="alert">{paso.mensaje}</Aviso>}
        {paso.tipo === "contrasena" && <Contrasena sb={paso.sb} onListo={() => setPaso({ tipo: "factor", sb: paso.sb })} />}
        {paso.tipo === "factor" && (
          <AltaSegundoFactor
            sb={paso.sb}
            onListo={async () => {
              // La primera petición con segundo factor activa la cuenta (lib/server.ts).
              const { data } = await paso.sb.auth.getSession();
              await fetch("/api/sesion", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
              setPaso({ tipo: "listo" });
              window.location.replace("/");
            }}
          />
        )}
        {paso.tipo === "listo" && <p className="my-6 text-center text-13 text-ink-3">Listo. Entrando al panel…</p>}
      </div>
    </div>
  );
}

function Contrasena({ sb, onListo }: { sb: SupabaseClient; onListo: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setError(null);
    if (a.length < MINIMO) return setError(`Usa al menos ${MINIMO} caracteres. Una frase de varias palabras sirve.`);
    if (a !== b) return setError("Las dos contraseñas no coinciden.");
    setOcupado(true);
    const { error: e } = await sb.auth.updateUser({ password: a });
    setOcupado(false);
    if (e) return setError(mensajeAuth(e));
    onListo();
  }

  return (
    <div>
      <label className={label} htmlFor="ac-a">Elige tu contraseña</label>
      <input id="ac-a" type="password" autoComplete="new-password" className={input} value={a} onChange={(e) => setA(e.target.value)} autoFocus />
      <label className={`${label} mt-3`} htmlFor="ac-b">Escríbela otra vez</label>
      <input id="ac-b" type="password" autoComplete="new-password" className={input} value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void guardar()} />
      <p className="mt-2 text-12 text-ink-3">Al menos {MINIMO} caracteres. Después vas a dar de alta tu app autenticadora.</p>
      {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
      <button onClick={() => void guardar()} disabled={ocupado} className="btn mt-4 h-11 w-full rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {ocupado ? "Guardando…" : "Continuar"}
      </button>
    </div>
  );
}
