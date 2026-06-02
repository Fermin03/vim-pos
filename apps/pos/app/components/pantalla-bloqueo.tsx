"use client";
import { useState } from "react";
import { PinKeypad } from "@vim/ui/styles";
import { pinLogin, type Empleado, type PinLoginResult } from "../lib/supabase";
import { PosSkeletonBg } from "./pos-skeleton-bg";
import { useReloj } from "./topbar-pos";
import { ROL_LABEL, iniciales } from "./selector-empleados";

/** Pantalla bloqueada por inactividad (mockup P-010). El turno/ticket siguen abiertos. */
export function PantallaBloqueo({
  empleado,
  cajaId,
  caja,
  onExito,
  onCambiarUsuario,
}: {
  empleado: Empleado;
  cajaId: string;
  caja: string;
  onExito: (r: PinLoginResult) => void;
  onCambiarUsuario: () => void;
}) {
  const ahora = useReloj();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "ok">("idle");
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);

  async function onComplete(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await pinLogin(empleado.id, pin, cajaId);
      setStatus("ok");
      setTimeout(() => {
        setHandoff(true);
        setTimeout(() => onExito(r), 600);
      }, 350);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setStatus("error");
      setError(msg === "PIN_INCORRECTO" ? "PIN incorrecto. Inténtalo de nuevo." : msg);
      setBusy(false);
      setTimeout(() => {
        setStatus("idle");
        setError(null);
        setClearSignal((n) => n + 1);
      }, 850);
    }
  }

  if (handoff) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <span className="h-[22px] w-[22px] animate-spin rounded-full border-[2.5px] border-line-strong border-t-ink" />
        <p className="text-sm text-ink-2">Volviendo a tu ticket…</p>
      </div>
    );
  }

  return (
    <>
      <PosSkeletonBg variant="caja" />
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/[.74] p-8 backdrop-blur-md animate-vim-fade">
        <div className="text-center">
          <div className="font-display text-[54px] font-semibold leading-none tabular-nums tracking-tight">
            {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
          </div>
          <div className="mt-1.5 text-sm capitalize text-ink-2">
            {ahora ? ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : ""}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-surface font-display text-xl font-semibold text-ink-2">
            {iniciales(empleado.nombre)}
          </span>
          <div className="text-center">
            <div className="font-display text-lg font-semibold tracking-tight">{empleado.nombre}</div>
            <div className="-mt-2 text-[13px] text-ink-3">
              {ROL_LABEL[empleado.rol] ?? "Empleado"} · {caja}
            </div>
          </div>
        </div>

        <p className="text-center text-[13px] text-ink-2">
          Pantalla bloqueada por inactividad. Ingresa tu PIN para continuar.
        </p>

        <PinKeypad
          length={4}
          onComplete={onComplete}
          error={error}
          status={status}
          disabled={busy}
          clearSignal={clearSignal}
          className="w-[230px]"
        />

        <div className="flex items-center gap-[7px] text-[12.5px] text-ink-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-success">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Tu turno y el ticket en curso siguen abiertos.
        </div>

        <button
          type="button"
          onClick={onCambiarUsuario}
          className="inline-flex items-center gap-[7px] rounded px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
            <circle cx="9" cy="7" r="4" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          </svg>
          Cambiar de usuario
        </button>
      </div>
    </>
  );
}
