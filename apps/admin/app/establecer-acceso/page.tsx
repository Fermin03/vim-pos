"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { supabase, establecerPassword } from "../lib/supabase";

const inputCls =
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 pr-11 text-[15px] outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * Aterrizaje del link de invitación / recuperación. El link de Supabase ya dejó
 * una sesión (detectSessionInUrl). Aquí el dueño fija su contraseña y entra al panel.
 */
export default function EstablecerAccesoPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<"validando" | "listo" | "invalido">("validando");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // El link establece la sesión vía la URL. Esperamos a que aparezca.
  useEffect(() => {
    let cancelado = false;
    const verificar = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      if (data.session) {
        setEmail(data.session.user.email ?? "");
        setEstado("listo");
      }
    };
    verificar();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (cancelado) return;
      if (session) {
        setEmail(session.user.email ?? "");
        setEstado("listo");
      }
    });
    // Si tras 4s no hubo sesión, el link es inválido/expirado.
    const t = setTimeout(() => {
      if (!cancelado) setEstado((e) => (e === "validando" ? "invalido" : e));
    }, 4000);
    return () => {
      cancelado = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pass !== pass2) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      await establecerPassword(pass);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la contraseña.");
      setGuardando(false);
    }
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

        {estado === "validando" && <p className="text-center text-sm text-ink-2">Validando tu invitación…</p>}

        {estado === "invalido" && (
          <div className="text-center">
            <h1 className="mb-1.5 font-display text-[22px] font-semibold tracking-tight">Enlace no válido o expirado</h1>
            <p className="mb-6 text-sm text-ink-2">Pídele a VIM que te reenvíe la invitación, o entra con tu correo y contraseña si ya la creaste.</p>
            <Button onClick={() => router.replace("/")}>Ir a iniciar sesión</Button>
          </div>
        )}

        {estado === "listo" && (
          <>
            <div className="mb-8 text-center">
              <h1 className="mb-1.5 font-display text-[26px] font-semibold tracking-tight">Crea tu contraseña</h1>
              <p className="text-sm text-ink-2">{email ? <>Para <b>{email}</b>. </> : null}Define tu contraseña para entrar a tu panel.</p>
            </div>
            <form onSubmit={onSubmit} noValidate>
              <div className="mb-5">
                <label htmlFor="p1" className="mb-[7px] block text-[13px] font-medium text-ink-2">Nueva contraseña</label>
                <div className="relative">
                  <input id="p1" type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                    value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} />
                  <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar" : "Mostrar"}
                    className="absolute right-1.5 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink-2 text-[12px] font-semibold">
                    {ver ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>
              <div className="mb-5">
                <label htmlFor="p2" className="mb-[7px] block text-[13px] font-medium text-ink-2">Confirmar contraseña</label>
                <input id="p2" type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Repite la contraseña"
                  value={pass2} onChange={(e) => setPass2(e.target.value)} className={inputCls.replace(" pr-11", "")} />
              </div>
              {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
              <Button type="submit" disabled={guardando} className="w-full">{guardando ? "Guardando…" : "Crear contraseña y entrar"}</Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
