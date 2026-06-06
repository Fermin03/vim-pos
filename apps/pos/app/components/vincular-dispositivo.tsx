"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { deviceSignIn } from "../lib/supabase";
import { guardarCreds, CREDS_DEV_FIXTURE } from "../lib/device-creds";
import { BrandMark } from "./topbar-pos";

/**
 * Vinculación del dispositivo (caja). One-time: guarda las credenciales del dispositivo
 * y abre su sesión base. En producción esto lo hace el setup (doc 10); aquí prellenamos
 * con la cuenta de dispositivo del fixture para DEV.
 */
export function VincularDispositivo({ onVinculado }: { onVinculado: () => void }) {
  // SEC CN-011: en producción CREDS_DEV_FIXTURE es null (no prellenamos credenciales).
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
    } catch {
      setError("No se pudo vincular. Revisa las credenciales del dispositivo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-6">
      <header className="flex max-w-sm flex-col items-center gap-2 text-center">
        <BrandMark size={44} />
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">Vincular este dispositivo</h1>
        <p className="text-sm text-ink-3">
          Conecta esta caja a tu sucursal una sola vez. Después, tu equipo entra con su PIN.
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
          <span className="font-medium text-ink-2">Identificador del dispositivo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className="h-11 rounded border border-line-strong px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-2">Clave del dispositivo</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="h-11 rounded border border-line-strong px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          />
        </label>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={cargando} className="mt-1">
          {cargando ? "Vinculando…" : "Vincular dispositivo"}
        </Button>
      </form>

      <p className="max-w-sm text-center text-xs text-ink-3">
        DEV: prellenado con la caja del fixture. En producción estas credenciales se
        provisionan en el alta de la sucursal (doc 10).
      </p>
    </main>
  );
}
