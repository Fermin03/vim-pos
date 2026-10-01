"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LogoVim } from "@vim/ui/styles";
import { supabase } from "../lib/supabase";
import { pedirBienvenida } from "../lib/bienvenida";

/**
 * Aterrizaje del enlace "confirma tu correo" del registro público (0142, ADR 0022).
 *
 * GoTrue confirma el correo al abrir el enlace y regresa aquí con la sesión en la URL; el cliente
 * la toma solo (detectSessionInUrl). Con sesión, se pide el correo de bienvenida (0146) y a la
 * primera vez. Sin sesión en unos segundos,
 * el enlace venció o ya se usó: se manda a iniciar sesión, donde se puede pedir otro.
 */
export default function CuentaConfirmadaPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<"validando" | "invalido">("validando");

  useEffect(() => {
    let cancelado = false;
    // Con la cuenta confirmada sale el correo de bienvenida (0146). Una vez por visita desde aquí
    // y una sola vez por negocio en el servidor; no se espera ni se enseña su resultado.
    let pedida = false;
    const seguir = () => {
      if (cancelado) return;
      if (!pedida) { pedida = true; void pedirBienvenida(); }
      router.replace("/bienvenida");
    };
    // Un enlace vencido regresa con `#error=…` en vez de la sesión: no hace falta esperar.
    if (/[#&]error=/.test(window.location.hash)) { setEstado("invalido"); return; }
    supabase.auth.getSession().then(({ data }) => { if (data.session) seguir(); });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => { if (session) seguir(); });
    const t = setTimeout(() => { if (!cancelado) setEstado("invalido"); }, 5000);
    return () => { cancelado = true; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, [router]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10 sm:p-6">
      <div className="flex w-full max-w-[380px] flex-col items-center text-center">
        <LogoVim className="mb-8 h-[46px] w-[46px]" />
        {estado === "validando" ? (
          <>
            <h1 className="mb-1.5 font-display text-24 font-semibold tracking-tight">Confirmando tu correo…</h1>
            <p className="text-14 text-ink-2">En un momento entras a configurar tu negocio.</p>
          </>
        ) : (
          <>
            <h1 className="mb-1.5 font-display text-24 font-semibold tracking-tight">Este enlace ya no sirve</h1>
            <p className="mb-6 text-14 text-ink-2">
              Venció o ya se usó. Si ya confirmaste tu correo, inicia sesión. Si no, al iniciar sesión puedes pedir que te mandemos otro.
            </p>
            <Button onClick={() => router.replace("/")}>Ir a iniciar sesión</Button>
          </>
        )}
      </div>
    </main>
  );
}
