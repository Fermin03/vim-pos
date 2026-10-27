"use client";
import { useState } from "react";
import { Button, Icono } from "@vim/ui/styles";
import { deviceSignIn } from "../lib/supabase";
import { guardarIdent, leerIdent, CREDS_DEV_FIXTURE } from "../lib/device-creds";
import { canjearCodigoWeb, darDeAltaDesdeNube } from "../lib/alta-nube";
import { esEscritorio } from "../lib/actualizacion";
import { BrandMark } from "./topbar-pos";

/**
 * Vinculación del dispositivo (caja). One-time: abre su sesión base. Lo normal es el código de
 * 6 caracteres que da el panel (Configuración → Cajas → Vincular); identificador y clave quedan
 * como segunda vía, y en DEV vienen prellenados con la cuenta de dispositivo del fixture.
 */
export function VincularDispositivo({
  onVinculado,
  motivo,
}: {
  onVinculado: () => void;
  /** "sesion-invalida": no es una caja nueva — la sesión guardada dejó de valer y hay que re-vincular. */
  motivo?: "sesion-invalida";
}) {
  // SEC CN-011: en producción CREDS_DEV_FIXTURE es null (no prellenamos credenciales).
  // SEC CN-006: si esta caja ya estuvo vinculada, se recuerda el correo (nunca la contraseña),
  // así reconectar tras perder la sesión es teclear una clave, no descifrar cuál era el correo.
  const [email, setEmail] = useState(() => leerIdent()?.email ?? CREDS_DEV_FIXTURE?.email ?? "");
  const [password, setPassword] = useState(CREDS_DEV_FIXTURE?.password ?? "");
  const [modo, setModo] = useState<"codigo" | "credenciales">(CREDS_DEV_FIXTURE ? "credenciales" : "codigo");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);

  /** Login contra la base LOCAL. Es el que decide si la caja queda vinculada. */
  async function intentarLocal(correo: string, clave: string): Promise<boolean> {
    try {
      const entro = await deviceSignIn(correo, clave);
      guardarIdent({ email: entro }); // SEC CN-006: solo el correo; la sesión la sostiene supabase-js
      return true;
    } catch {
      return false;
    }
  }

  async function vincularConCodigo() {
    const cod = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-Z2-9]{6}$/.test(cod)) { setError("El código tiene 6 caracteres, como K7M-4QX."); return; }
    setCargando(true);
    setError(null);
    try {
      let creds: { email: string; password: string };
      if (esEscritorio()) {
        // El escritorio canjea el código, baja los datos del negocio y devuelve con qué entrar.
        setPaso("Consultando la nube de VIM…");
        const alta = await darDeAltaDesdeNube({ codigo: cod });
        if (!alta.ok) { setError(alta.error); return; }
        if (!alta.email || !alta.password) { setError("No se pudo vincular con código. Usa el identificador y la clave."); return; }
        creds = { email: alta.email, password: alta.password };
        setPaso("Datos del negocio descargados. Vinculando…");
      } else {
        const c = await canjearCodigoWeb(cod);
        if ("error" in c) { setError(c.error); return; }
        creds = c;
      }
      if (await intentarLocal(creds.email, creds.password)) { onVinculado(); return; }
      setError("La caja no pudo vincularse. Vuelve a intentar; si sigue, genera otro código en el panel.");
    } finally {
      setCargando(false);
      setPaso(null);
    }
  }

  async function vincular() {
    const correo = email.trim();
    setCargando(true);
    setError(null);
    setPaso(null);
    try {
      // 1) Local: si esta caja ya tiene los datos del negocio, entra directo.
      if (await intentarLocal(correo, password)) { onVinculado(); return; }

      // 2) Primera vez: las credenciales se crearon en el Admin (nube) y aquí todavía no existen.
      //    Se validan contra la nube y se baja la rebanada del negocio; luego se reintenta local.
      if (!esEscritorio()) {
        setError("No se pudo vincular. Revisa las credenciales del dispositivo.");
        return;
      }
      setPaso("Consultando la nube de VIM…");
      const alta = await darDeAltaDesdeNube({ email: correo, password });
      if (!alta.ok) {
        setError(
          alta.motivo === "CREDENCIALES"
            ? "La nube rechazó estas credenciales. Genera un código en Configuración → Cajas."
            : alta.error,
        );
        return;
      }
      setPaso("Datos del negocio descargados. Vinculando…");
      if (await intentarLocal(correo, password)) { onVinculado(); return; }
      setError("Se descargaron los datos del negocio, pero la caja no pudo vincularse. Vuelve a intentar.");
    } finally {
      setCargando(false);
      setPaso(null);
    }
  }

  const claseCampo = "h-11 rounded border border-line-strong px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-6">
      <header className="flex max-w-sm flex-col items-center gap-2 text-center">
        <BrandMark size={44} />
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">
          {motivo === "sesion-invalida" ? "Vuelve a vincular esta caja" : "Vincular este dispositivo"}
        </h1>
        <p className="text-sm text-ink-3">
          {motivo === "sesion-invalida"
            ? "La sesión guardada de esta caja dejó de ser válida. Vuelve a vincularla; no se pierde ninguna venta."
            : "Conecta esta caja a tu sucursal una sola vez. Después, tu equipo entra con su PIN."}
        </p>
      </header>

      {motivo === "sesion-invalida" && (
        <div className="flex w-full max-w-sm items-start gap-2.5 rounded border border-warning-line bg-warning-soft px-3 py-2.5 text-13 text-ink-2" role="status">
          <Icono nombre="info" className="mt-px h-4 w-4 flex-shrink-0 text-warning" />
          <span>
            El código se genera en el panel: <b>Configuración → Cajas → Vincular otra vez</b>.
          </span>
        </div>
      )}

      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (modo === "codigo") vincularConCodigo(); else vincular();
        }}
      >
        {modo === "codigo" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-2">Código de vinculación</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="K7M-4QX"
              maxLength={7}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={`${claseCampo} h-14 text-center font-mono text-2xl font-bold tracking-[0.2em] placeholder:text-ink-3/40`}
            />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink-2">Identificador del dispositivo</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={claseCampo} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink-2">Clave del dispositivo</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className={claseCampo} />
            </label>
          </>
        )}

        {paso && (
          <p className="text-sm font-medium text-ink-2" role="status">
            {paso}
          </p>
        )}

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={cargando} className="mt-1">
          {cargando ? "Vinculando…" : "Vincular dispositivo"}
        </Button>
      </form>

      <div className="flex max-w-sm flex-col items-center gap-2 text-center text-xs text-ink-3">
        <p>
          {CREDS_DEV_FIXTURE
            ? "DEV: prellenado con la caja del fixture."
            : modo === "codigo"
              ? "¿No tienes el código? Genéralo en tu panel: Configuración → Cajas → Vincular."
              : "¿No tienes estas credenciales? Genera un código en tu panel: Configuración → Cajas → Vincular."}
        </p>
        <button
          type="button"
          onClick={() => { setModo(modo === "codigo" ? "credenciales" : "codigo"); setError(null); }}
          className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          {modo === "codigo" ? "Usar identificador y clave" : "Usar un código"}
        </button>
      </div>
    </main>
  );
}
