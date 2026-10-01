"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Aviso, LogoVim } from "@vim/ui/styles";
import type { Api } from "./tipos";
import { input, label } from "./formato";
import { clienteAuth, mensajeAuth } from "./cliente-auth";
import { AltaSegundoFactor, CodigoSegundoFactor } from "../components/segundo-factor";

const CLAVE = "vim.platform.clave";

/** Quién está dentro. `via: "clave"` = la clave compartida del arranque (ver lib/server.ts). */
export type Operador = { nombre: string; via: "cuenta" | "clave"; id: string };

const Ctx = createContext<{ api: Api; salir: () => void; operador: Operador } | null>(null);

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSesion fuera de SesionProvider");
  return c;
}

type Estado =
  | { tipo: "cargando" }
  | { tipo: "fuera"; aviso?: string }
  | { tipo: "cuenta"; sb: SupabaseClient; operador: Operador }
  | { tipo: "clave"; clave: string; operador: Operador };

/**
 * Sesión del panel (A8). Se entra con la cuenta del operador —contraseña y código de su app
 * autenticadora— o, solo mientras no haya ningún operador activado, con la clave compartida.
 *
 * Las dos viven en sessionStorage: mueren al cerrar la pestaña. Un 401 en cualquier llamada
 * cierra la sesión y vuelve a pedir la entrada: una cuenta desactivada o una clave retirada no
 * dejan el panel "abierto" enseñando errores.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  const salir = useCallback((aviso?: string) => {
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
    void clienteAuth().then((sb) => sb.auth.signOut({ scope: "local" })).catch(() => {});
    setEstado({ tipo: "fuera", aviso });
  }, []);

  // Al abrir: ¿hay una clave o una sesión con segundo factor de esta pestaña?
  useEffect(() => {
    void (async () => {
      let clave: string | null = null;
      try { clave = sessionStorage.getItem(CLAVE); } catch { /* sin storage */ }
      if (clave) {
        const r = await quienSoy({ "X-Platform-Key": clave });
        if (r.ok) return setEstado({ tipo: "clave", clave, operador: r.operador });
        try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
        return setEstado({ tipo: "fuera", aviso: r.error });
      }
      try {
        const sb = await clienteAuth();
        const { data } = await sb.auth.getSession();
        const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data.session && nivel?.currentLevel === "aal2") {
          const r = await quienSoy({ Authorization: `Bearer ${data.session.access_token}` });
          if (r.ok) return setEstado({ tipo: "cuenta", sb, operador: r.operador });
          await sb.auth.signOut({ scope: "local" });
          return setEstado({ tipo: "fuera", aviso: r.error });
        }
      } catch { /* sin configuración: se muestra la entrada, que explica el error */ }
      setEstado({ tipo: "fuera" });
    })();
  }, []);

  const api = useMemo<Api>(() => async (path, init) => {
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };
    if (init?.body) headers["Content-Type"] = "application/json";
    if (estado.tipo === "clave") headers["X-Platform-Key"] = estado.clave;
    if (estado.tipo === "cuenta") {
      // getSession renueva el token si ya venció: supabase-js lo refresca solo.
      const { data } = await estado.sb.auth.getSession();
      headers.Authorization = `Bearer ${data.session?.access_token ?? ""}`;
    }
    const res = await fetch(path, { ...init, headers });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) {
      const aviso = mensajeDeError(401, data);
      salir(aviso);
      throw new Error(aviso);
    }
    if (!res.ok) throw new Error(mensajeDeError(res.status, data));
    return data;
  }, [estado, salir]);

  if (estado.tipo === "cargando") return null;
  if (estado.tipo === "fuera") {
    return (
      <Entrada
        aviso={estado.aviso}
        onCuenta={(sb, operador) => setEstado({ tipo: "cuenta", sb, operador })}
        onClave={(clave, operador) => {
          try { sessionStorage.setItem(CLAVE, clave); } catch { /* nada */ }
          setEstado({ tipo: "clave", clave, operador });
        }}
      />
    );
  }
  return <Ctx.Provider value={{ api, salir: () => salir(), operador: estado.operador }}>{children}</Ctx.Provider>;
}

/** GET /api/sesion con las credenciales dadas: quién soy, o por qué no. */
async function quienSoy(headers: Record<string, string>): Promise<{ ok: true; operador: Operador } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/sesion", { headers, cache: "no-store" });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, error: mensajeDeError(r.status, data) };
    return { ok: true, operador: data as unknown as Operador };
  } catch {
    return { ok: false, error: "No se pudo contactar al servidor del panel." };
  }
}

/**
 * El error del servidor en palabras del operador. El detalle manda sobre el código: "Escribe el
 * motivo (10 caracteres o más)" dice qué hacer; "MOTIVO_REQUERIDO" no.
 */
function mensajeDeError(status: number, data: Record<string, unknown>): string {
  if (data.error === "IP_NO_PERMITIDA") {
    return `Esta red no tiene permiso para entrar al panel (tu IP: ${String(data.ip ?? "desconocida")}). Agrégala a PLATFORM_IP_ALLOWLIST en Vercel.`;
  }
  // Solo el bloqueo de la entrada al panel (lib/server.ts). Otros 429 traen su propio detalle
  // ("espera un minuto antes de reenviar"), y decirles "15 minutos" sería mentir.
  if (status === 429 && (data.error === "DEMASIADOS_INTENTOS" || !data.detalle)) return "Demasiados intentos. Espera 15 minutos.";
  if (data.error === "NO_AUTORIZADO") return "Clave incorrecta.";
  return String(data.detalle ?? data.error ?? `El servidor respondió ${status}`);
}

type Paso = { tipo: "credenciales" } | { tipo: "codigo"; sb: SupabaseClient } | { tipo: "alta"; sb: SupabaseClient };

function Entrada({
  aviso,
  onCuenta,
  onClave,
}: {
  aviso?: string;
  onCuenta: (sb: SupabaseClient, operador: Operador) => void;
  onClave: (clave: string, operador: Operador) => void;
}) {
  const [modo, setModo] = useState<"cuenta" | "clave">("cuenta");
  const [paso, setPaso] = useState<Paso>({ tipo: "credenciales" });
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [k, setK] = useState("");
  const [error, setError] = useState<string | null>(aviso ?? null);
  const [ocupado, setOcupado] = useState(false);

  async function entrarConCuenta() {
    setError(null);
    if (!email.trim() || !pass) { setError("Escribe tu correo y tu contraseña."); return; }
    setOcupado(true);
    try {
      const sb = await clienteAuth();
      const { error: e } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
      if (e) throw e;
      const { data } = await sb.auth.mfa.listFactors();
      // Sin autenticador dado de alta (se quedó a medias al activar la cuenta): se da de alta ahora.
      setPaso((data?.totp?.length ?? 0) > 0 ? { tipo: "codigo", sb } : { tipo: "alta", sb });
    } catch (e) {
      setError(e instanceof Error && !("code" in e) ? e.message : mensajeAuth(e as { message?: string; code?: string }));
    } finally {
      setOcupado(false);
    }
  }

  async function terminarCuenta(sb: SupabaseClient) {
    const { data } = await sb.auth.getSession();
    const r = await quienSoy({ Authorization: `Bearer ${data.session?.access_token ?? ""}` });
    if (r.ok) return onCuenta(sb, r.operador);
    await sb.auth.signOut({ scope: "local" });
    setPaso({ tipo: "credenciales" });
    setError(r.error);
  }

  async function entrarConClave() {
    setError(null);
    if (!k.trim()) { setError("Escribe la clave de plataforma."); return; }
    setOcupado(true);
    const r = await quienSoy({ "X-Platform-Key": k });
    setOcupado(false);
    if (r.ok) return onClave(k, r.operador);
    setError(r.error);
  }

  const boton = "btn mt-4 h-11 w-full rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-60";

  return (
    <div className="flex min-h-screen items-center justify-center bg-sel p-6">
      <div className="w-[400px] max-w-full rounded-lg border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <LogoVim className="h-8 w-8" />
          <span className="font-display text-18 font-bold tracking-tight">VIM Plataforma</span>
        </div>
        <p className="mb-5 text-13 text-ink-3">Panel de control interno de VIM. Acceso restringido.</p>

        {modo === "cuenta" && paso.tipo === "credenciales" && (
          <>
            <label className={label} htmlFor="op-email">Correo</label>
            <input id="op-email" type="email" autoComplete="username" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <label className={`${label} mt-3`} htmlFor="op-pass">Contraseña</label>
            <input id="op-pass" type="password" autoComplete="current-password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void entrarConCuenta()} />
            {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
            <button onClick={() => void entrarConCuenta()} disabled={ocupado} className={boton}>{ocupado ? "Entrando…" : "Continuar"}</button>
            <button type="button" onClick={() => { setModo("clave"); setError(null); }} className="mt-4 w-full text-center text-13 font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">
              ¿Aún no tienes cuenta? Entra con la clave compartida
            </button>
          </>
        )}

        {modo === "cuenta" && paso.tipo === "codigo" && <CodigoSegundoFactor sb={paso.sb} onListo={() => void terminarCuenta(paso.sb)} />}
        {modo === "cuenta" && paso.tipo === "alta" && <AltaSegundoFactor sb={paso.sb} onListo={() => void terminarCuenta(paso.sb)} />}

        {modo === "clave" && (
          <>
            <Aviso tono="info" className="mb-4">
              La clave compartida sirve solo hasta que el primer operador active su cuenta. Después se entra con correo, contraseña y app autenticadora.
            </Aviso>
            <label className={label} htmlFor="pk">Clave de plataforma</label>
            <input id="pk" type="password" className={input} value={k} onChange={(e) => setK(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void entrarConClave()} autoFocus />
            {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
            <button onClick={() => void entrarConClave()} disabled={ocupado} className={boton}>{ocupado ? "Entrando…" : "Entrar"}</button>
            <button type="button" onClick={() => { setModo("cuenta"); setError(null); }} className="mt-4 w-full text-center text-13 font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">
              Entrar con mi cuenta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
