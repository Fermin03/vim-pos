"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LogoVim } from "@vim/ui/styles";
import { supabase, establecerPassword, leerSesion, salir } from "../lib/supabase";
import { enlaceMiAgenda, tieneAgenda } from "../lib/acceso-celular";
import { abrirSesionDelEnlace, leerEnlace } from "../lib/enlace-acceso";
import { mensajeError } from "../lib/errores";
import { pedirBienvenida } from "../lib/bienvenida";

const inputCls =
  "w-full rounded border border-line-strong bg-surface px-[13px] py-3 pr-11 text-15 outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * Aterrizaje del link de invitación / recuperación. El link de Supabase ya dejó
 * una sesión (detectSessionInUrl). Aquí el dueño fija su contraseña y entra al panel. Un
 * colaborador de la agenda («Dar acceso a su celular») ve a dónde entrar: /mi-agenda del POS.
 */
export default function EstablecerAccesoPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<"validando" | "listo" | "invalido" | "agenda">("validando");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [conPanel, setConPanel] = useState(false);
  // Se lee una vez, antes de limpiar la URL (el efecto puede correr dos veces en desarrollo).
  const [enlace] = useState(() => (typeof window === "undefined" ? null : leerEnlace(window.location.href)));

  useEffect(() => {
    let cancelado = false;
    // Con un enlace en la URL, su sesión reemplaza a la que hubiera (el dueño con el panel abierto)
    // y, si no abre, el enlace es inválido: nunca se usa otra sesión.
    if (enlace) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      void abrirSesionDelEnlace(supabase.auth, enlace).then((correo) => {
        if (cancelado) return;
        if (correo === null) return setEstado("invalido");
        setEmail(correo);
        setEstado("listo");
      });
      return () => { cancelado = true; };
    }
    // Sin enlace: la sesión que ya hay (cambiar la contraseña estando dentro).
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
  }, [enlace]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pass !== pass2) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      await establecerPassword(pass);
      if (await tieneAgenda()) {
        // El hook decide con la jerarquía en el negocio DEL TOKEN: sin panel, role = colaborador_web.
        const panel = (await leerSesion())?.rol !== "colaborador_web";
        // Quien no entra al panel no se queda con su sesión abierta aquí.
        if (!panel) await salir();
        setConPanel(panel);
        setEstado("agenda");
        return;
      }
      // Ya tiene acceso: sale el correo de bienvenida (0146). Aquí también llega quien restablece
      // su contraseña; a ese el servidor no le manda nada (no es un negocio recién llegado).
      void pedirBienvenida();
      router.replace("/dashboard");
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar la contraseña."));
      setGuardando(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10 sm:p-6">
      <div className="flex w-full max-w-[380px] flex-col">
        <div className="mb-8 flex flex-col items-center gap-4">
          <LogoVim className="h-[46px] w-[46px]" />
          <div className="font-display text-20 font-bold tracking-tight">VIM POS<span className="text-accent">.</span></div>
        </div>

        {estado === "validando" && <p className="text-center text-sm text-ink-2">Validando tu invitación…</p>}

        {estado === "invalido" && (
          <div className="text-center">
            <h1 className="mb-1.5 font-display text-24 font-semibold tracking-tight">Enlace no válido o expirado</h1>
            <p className="mb-6 text-sm text-ink-2">Pídele a VIM que te reenvíe la invitación, o entra con tu correo y contraseña si ya la creaste.</p>
            <Button onClick={() => router.replace("/")}>Ir a iniciar sesión</Button>
          </div>
        )}

        {estado === "agenda" && (
          <div className="text-center">
            <h1 className="mb-1.5 font-display text-24 font-semibold tracking-tight">Listo</h1>
            <p className="mb-6 text-15 text-ink-2">
              Entra a tu agenda en <a href={enlaceMiAgenda(window.location.hostname)} className="break-all font-semibold text-ink underline">{enlaceMiAgenda(window.location.hostname)}</a>
            </p>
            <div className="flex flex-col gap-2">
              <a href={enlaceMiAgenda(window.location.hostname)}
                className="inline-flex min-h-[44px] items-center justify-center rounded bg-ink px-5 text-15 font-semibold text-white transition-transform active:scale-[.97]">
                Abrir mi agenda
              </a>
              {conPanel && <Button variant="ghost" onClick={() => router.replace("/dashboard")}>Ir al panel</Button>}
            </div>
          </div>
        )}

        {estado === "listo" && (
          <>
            <div className="mb-8 text-center">
              <h1 className="mb-1.5 font-display text-28 font-semibold tracking-tight">Crea tu contraseña</h1>
              <p className="text-sm text-ink-2">{email ? <>Para <b>{email}</b>. </> : null}Define tu contraseña para entrar a tu panel.</p>
            </div>
            <form onSubmit={onSubmit} noValidate>
              <div className="mb-5">
                <label htmlFor="p1" className="mb-[7px] block text-13 font-medium text-ink-2">Nueva contraseña</label>
                <div className="relative">
                  <input id="p1" type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                    value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} />
                  <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar" : "Mostrar"}
                    className="absolute right-1.5 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink-2 text-12 font-semibold">
                    {ver ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>
              <div className="mb-5">
                <label htmlFor="p2" className="mb-[7px] block text-13 font-medium text-ink-2">Confirmar contraseña</label>
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
