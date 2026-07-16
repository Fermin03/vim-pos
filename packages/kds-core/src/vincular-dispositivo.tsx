"use client";
import { useState } from "react";
import { deviceSignIn } from "./cliente";
import { guardarCreds, CREDS_DEV_FIXTURE } from "./device-creds";

/**
 * Vinculación del dispositivo de cocina. One-time: guarda las credenciales del dispositivo y abre
 * su sesión base contra el hub. Autónomo (sin dependencias de @vim/ui) para que el paquete sea
 * consumible por cualquier app. En producción CREDS_DEV_FIXTURE es null (no prellena credenciales).
 */
export function VincularDispositivo({ onVinculado }: { onVinculado: () => void }) {
  const [email, setEmail] = useState(CREDS_DEV_FIXTURE?.email ?? "");
  const [password, setPassword] = useState(CREDS_DEV_FIXTURE?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function vincular() {
    setCargando(true);
    setError(null);
    try {
      await deviceSignIn(email.trim(), password);
      guardarCreds({ email: email.trim(), password });
      onVinculado();
    } catch (e) {
      // Distinguir "no llegué a la caja" de "la caja dijo que no". Culpar siempre a las credenciales
      // manda a revisar lo que no es: cuando la caja está apagada, las credenciales están bien y el
      // cajero las reescribe una y otra vez sin que nada cambie.
      const msg = e instanceof Error ? e.message : String(e);
      const esRed = /fetch|network|load failed|ECONN|timeout|NetworkError/i.test(msg);
      setError(
        esRed
          ? "No se pudo contactar la caja. Revisa que VIM POS esté abierto en la caja y que ambas pantallas estén en la misma red."
          : `La caja rechazó las credenciales del dispositivo: ${msg}`,
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#1A1A1E] p-6 text-[#F0F0EC]">
      <header className="flex max-w-sm flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white">
          <span className="font-display text-[20px] font-bold text-[#16161A]">V</span>
        </div>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">Vincular esta pantalla de cocina</h1>
        <p className="text-sm text-[#A0A0A6]">
          Conéctala una sola vez a tu caja. Después arranca directo en Cocina.
        </p>
      </header>

      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          vincular();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#C8C8CC]">Identificador del dispositivo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className="h-11 rounded border border-[#3A3A42] bg-[#242429] px-3 text-sm text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#C8C8CC]">Clave del dispositivo</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="h-11 rounded border border-[#3A3A42] bg-[#242429] px-3 text-sm text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          />
        </label>

        {error && (
          <p className="text-sm font-medium text-[#FF8080]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="font-display mt-1 flex h-12 w-full items-center justify-center rounded bg-[#2E7D52] text-[15px] font-bold text-white transition hover:bg-[#267045] active:scale-[0.98] disabled:opacity-60"
        >
          {cargando ? "Vinculando…" : "Vincular pantalla"}
        </button>
      </form>

      <p className="max-w-sm text-center text-xs text-[#6E6E74]">
        {CREDS_DEV_FIXTURE
          ? "DEV: prellenado con la caja del fixture."
          : "¿No tienes estas credenciales? Genéralas en tu panel: Configuración → Cajas → botón del dispositivo."}
      </p>
    </main>
  );
}
