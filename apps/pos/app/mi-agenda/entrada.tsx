"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { BrandMark } from "../components/topbar-pos";
import { entrarColaborador, enlaceRecuperar, mensajeEntrada, validarEntrada } from "../lib/sesion-colaborador";

const campo =
  "h-12 rounded border border-line-strong bg-surface px-3 text-16 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

/** Entrada de /mi-agenda: correo y contraseña del colaborador (nunca el PIN de la caja). */
export function Entrada({ alEntrar, aviso = null }: { alEntrar: () => void; aviso?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(aviso);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const invalido = validarEntrada(email, password);
    setError(invalido);
    if (invalido) return;
    setCargando(true);
    try {
      await entrarColaborador(email, password);
      alEntrar();
    } catch (err) {
      setError(mensajeEntrada(err));
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 px-4 py-10">
      <header className="flex max-w-sm flex-col items-center gap-2 text-center">
        <BrandMark size={44} />
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">Mi agenda</h1>
        <p className="text-sm text-ink-3">Entra con el correo y la contraseña que te dio acceso el negocio.</p>
      </header>

      <form onSubmit={enviar} noValidate className="flex w-full max-w-sm flex-col gap-3">
        <label htmlFor="mi-agenda-correo" className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-2">Correo</span>
          <input id="mi-agenda-correo" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
        </label>
        <label htmlFor="mi-agenda-contrasena" className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-2">Contraseña</span>
          <input id="mi-agenda-contrasena" name="password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} className={campo} />
        </label>
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" disabled={cargando} className="mt-1 min-h-[48px]">
          {cargando ? "Entrando…" : "Entrar"}
        </Button>
        <a href={enlaceRecuperar(window.location.hostname)}
          className="flex min-h-[44px] items-center justify-center text-sm font-medium text-ink-2 underline-offset-2 hover:underline">
          Olvidé mi contraseña
        </a>
      </form>
    </main>
  );
}
