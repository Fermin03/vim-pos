"use client";
import { useState } from "react";
import { Modal, PinKeypad } from "@vim/ui/styles";
import { pinLogin, type Empleado, type PinLoginResult } from "../lib/supabase";
import { iniciales, ROL_LABEL } from "./selector-empleados";

function mensajeError(msg: string): string {
  if (msg === "PIN_INCORRECTO") return "PIN incorrecto. Inténtalo de nuevo.";
  if (msg.startsWith("BLOQUEADO")) return "Cuenta bloqueada. Pide ayuda a tu supervisor.";
  return msg;
}

/** Overlay de PIN sobre el selector (mockup P-002): toca usuario → ingresa PIN. */
export function ModalPin({
  empleado,
  cajaId,
  onExito,
  onCerrar,
}: {
  empleado: Empleado;
  cajaId: string;
  onExito: (r: PinLoginResult) => void;
  onCerrar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "ok">("idle");
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [clearSignal, setClearSignal] = useState(0);

  async function onComplete(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await pinLogin(empleado.id, pin, cajaId);
      setStatus("ok");
      setOkMsg("Bienvenido. Abriendo tu turno…");
      setTimeout(() => onExito(r), 700);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setStatus("error");
      setError(mensajeError(msg));
      setBusy(false);
      setTimeout(() => {
        setStatus("idle");
        setError(null);
        setClearSignal((n) => n + 1);
      }, 850);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={`Ingresar PIN de ${empleado.nombre}`}
      hideTitle
      className="relative w-[340px] rounded-lg border border-line bg-surface p-6 shadow-[0_16px_40px_rgba(22,22,26,.16)]"
    >
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cambiar usuario"
        className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div className="mb-5 flex flex-col items-center gap-3">
        <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-line bg-hover font-display text-[19px] font-semibold text-ink-2">
          {iniciales(empleado.nombre)}
        </span>
        <div className="text-center">
          <div className="font-display text-[17px] font-semibold tracking-tight">{empleado.nombre}</div>
          <div className="text-xs text-ink-3">{ROL_LABEL[empleado.rol] ?? "Empleado"}</div>
        </div>
      </div>

      <p className="mb-4 text-center text-[13px] text-ink-2">
        {okMsg ?? "Ingresa tu PIN de 4 dígitos"}
      </p>

      <PinKeypad
        length={4}
        onComplete={onComplete}
        error={error}
        status={status}
        disabled={busy}
        clearSignal={clearSignal}
        className="w-full"
      />
    </Modal>
  );
}
