"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { enviarEnlaceRecuperacion } from "../lib/supabase";

const inputCls =
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 text-[15px] outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/** Enmascara el correo para la confirmación (P-004): "mario@knockout.com" → "m•••@knockout.com". */
function enmascarar(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return email;
  return `${usuario[0]}•••@${dominio}`;
}

/**
 * P-003 (pedir enlace) + P-004 (confirmación de envío). Una sola ruta con dos estados:
 * el mockup los separa en dos pantallas, pero el flujo real no navega — solo cambia el
 * contenido tras enviar, y así el correo escrito no se pierde al reenviar.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const correo = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Escribe un correo válido");
      return;
    }
    setCargando(true);
    try {
      await enviarEnlaceRecuperacion(correo);
      setEnviado(true);
    } catch (err) {
      // Los errores de red de supabase-js llegan como "Failed to fetch": crudo, en inglés y sin
      // decirle al dueño qué hacer. Se traduce a algo accionable y se deja pasar el resto.
      const msg = err instanceof Error ? err.message : "";
      setError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo."
          : msg || "No se pudo enviar el enlace.",
      );
    } finally {
      setCargando(false);
    }
  }

  async function reenviar() {
    setReenviado(false);
    await enviar();
    setReenviado(true);
    setTimeout(() => setReenviado(false), 3000);
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-[380px] flex-col">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-ink">
            <span className="font-display text-2xl font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-[9px] right-2 h-[5px] w-[5px] rounded-full bg-accent" aria-hidden="true" />
          </div>
          <div className="font-display text-[19px] font-bold tracking-tight">VIM POS<span className="text-accent">.</span></div>
        </div>

        {!enviado ? (
          <>
            <div className="mb-8 text-center">
              <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Restablece tu contraseña</h1>
              <p className="text-sm text-ink-2">Escribe tu correo y te enviaremos un enlace para crear una nueva.</p>
            </div>
            <form onSubmit={enviar} noValidate>
              <div className="mb-5">
                <label htmlFor="email" className="mb-[7px] block text-[13px] font-medium text-ink-2">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  className={inputCls}
                  aria-invalid={error ? true : undefined}
                />
                {error && <p className="mt-1.5 text-[13px] font-medium text-danger" role="alert">{error}</p>}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={cargando}>
                {cargando ? "Enviando…" : "Enviar enlace"}
              </Button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F1EC] text-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m2 7 10 6 10-6" />
              </svg>
            </div>
            <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Revisa tu correo</h1>
            <p className="text-sm leading-relaxed text-ink-2">
              Si existe una cuenta, enviamos un enlace para restablecer tu contraseña a <b className="text-ink">{enmascarar(email.trim())}</b>.
            </p>
            <p className="mt-3 text-[13px] text-ink-3">¿No lo ves? Revisa tu carpeta de spam o correo no deseado.</p>
            {error && <p className="mt-4 text-sm font-medium text-danger" role="alert">{error}</p>}
            <Button variant="ghost" className="mt-6 w-full" onClick={reenviar} disabled={cargando}>
              {cargando ? "Reenviando…" : reenviado ? "Enlace reenviado ✓" : "Reenviar enlace"}
            </Button>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
            Volver a inicio de sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
