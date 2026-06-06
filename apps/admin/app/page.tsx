"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { entrar, leerSesion } from "./lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [alerta, setAlerta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Si ya hay sesión, al dashboard.
  useEffect(() => {
    leerSesion().then((s) => {
      if (s) router.replace("/dashboard");
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlerta(null);
    const emailOk = EMAIL_RE.test(email.trim());
    setEmailErr(!emailOk);
    if (!emailOk || !password) return;

    setCargando(true);
    try {
      await entrar(email.trim(), password);
      router.replace("/dashboard");
    } catch {
      setAlerta("Email o contraseña incorrectos. Revisa tus datos e intenta de nuevo.");
      setCargando(false);
    }
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-[380px] flex-col">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-ink">
            <span className="font-display text-2xl font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-[9px] right-2 h-[5px] w-[5px] rounded-full bg-accent" aria-hidden="true" />
          </div>
          <div className="font-display text-[19px] font-bold tracking-tight">
            VIM POS<span className="text-accent">.</span>
          </div>
        </div>

        {/* Encabezado */}
        <div className="mb-8 text-center">
          <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Inicia sesión</h1>
          <p className="text-sm text-ink-2">Entra a tu panel para administrar tu negocio</p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="mb-5">
            <label htmlFor="email" className="mb-[7px] block text-[13px] font-medium text-ink-2">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="tu@negocio.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailErr(false);
              }}
              className={[
                "w-full rounded border bg-surface px-[13px] py-3 text-[15px] outline-none transition",
                "focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]",
                emailErr ? "border-danger" : "border-line-strong",
              ].join(" ")}
            />
            {emailErr && <p className="mt-1.5 text-xs text-danger">Escribe un correo válido</p>}
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="mb-[7px] block text-[13px] font-medium text-ink-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={verPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-line-strong bg-surface px-[13px] py-3 pr-11 text-[15px] outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
              />
              <button
                type="button"
                onClick={() => setVerPass((v) => !v)}
                aria-label={verPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verPass}
                className="absolute right-1.5 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
              >
                {verPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
                    <path d="M9.9 5.1A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 4M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.4-.6" />
                    <path d="m9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    <path d="M3 3l18 18" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="mb-6 text-right">
            <span className="cursor-not-allowed text-[13px] font-medium text-ink-3" title="Próximamente">
              ¿Olvidaste tu contraseña?
            </span>
          </div>

          {alerta && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded border border-line border-l-[3px] border-l-danger bg-surface px-[13px] py-[11px] text-[13.5px] text-ink-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-px h-[17px] w-[17px] flex-shrink-0 text-danger">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span>{alerta}</span>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={cargando}>
            {cargando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-8 text-center text-[13px] text-ink-3">
          ¿Aún no tienes cuenta? <a href="/registro" className="font-medium text-ink underline-offset-2 hover:underline">Crea tu negocio en VIM POS</a>
        </p>
      </div>
    </main>
  );
}
