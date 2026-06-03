"use client";
import { useState } from "react";
import { Button, Modal, PinKeypad } from "@vim/ui/styles";
import { autorizarConPin, type Autorizacion } from "../lib/autorizacion";

/**
 * Componente reutilizable de autorización por PIN de supervisor (mockup P-080).
 * Aparece sobre la pantalla donde se solicita la operación. El PIN del autorizador
 * se verifica server-side (Edge Function autorizar-pin); nunca en el cliente.
 */
export function ModalAutorizacionPin({
  token,
  accion,
  permisoCodigo,
  descripcion,
  ejecutaNombre,
  monto,
  entidadTipo,
  entidadId,
  cajaId,
  turnoId,
  motivo,
  onAutorizado,
  onCancelar,
}: {
  token: string;
  accion: string;
  permisoCodigo: string;
  descripcion: string;
  ejecutaNombre: string;
  monto: number | null;
  entidadTipo: string;
  entidadId: string | null;
  cajaId: string;
  turnoId: string;
  motivo: string;
  onAutorizado: (a: Autorizacion) => void;
  onCancelar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "ok">("idle");
  const [busy, setBusy] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);

  function mensajeError(codigo: string): string {
    if (codigo === "SIN_PERMISO")
      return "Ese PIN es válido, pero pertenece a un rol que no puede autorizar esta operación. Pide el PIN de un supervisor o administrador.";
    if (codigo === "BLOQUEADO") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    if (codigo === "PIN_INCORRECTO") return "PIN incorrecto. Inténtalo de nuevo.";
    return codigo;
  }

  async function onComplete(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const a = await autorizarConPin(token, pin, {
        accion,
        permisoCodigo,
        entidadTipo,
        entidadId,
        monto,
        motivo,
        cajaId,
        turnoId,
      });
      setStatus("ok");
      setTimeout(() => onAutorizado(a), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setStatus("error");
      setError(mensajeError(msg));
      setBusy(false);
      setTimeout(() => {
        setStatus("idle");
        setError(null);
        setClearSignal((n) => n + 1);
      }, 1000);
    }
  }

  return (
    <Modal
      open
      onClose={onCancelar}
      title="Autorización requerida"
      hideTitle
      backdropClassName="bg-ink/40 backdrop-blur-sm"
      className="w-[380px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-hover">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink-2">
          <rect x="4" y="11" width="16" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>

      <div className="mb-4 text-center">
        <h3 className="mb-[6px] font-display text-xl font-semibold tracking-tight">Autorización requerida</h3>
        <p className="text-[13.5px] font-medium text-ink-2">{descripcion}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Lo ejecuta <b className="font-semibold text-ink-2">{ejecutaNombre}</b> · debe autorizar un supervisor o admin.
        </p>
      </div>

      {status === "ok" ? (
        <div className="my-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="font-display text-base font-semibold text-success">Autorizado</p>
          <p className="text-[12.5px] text-ink-3">La operación se ejecutará.</p>
        </div>
      ) : (
        <PinKeypad
          length={4}
          onComplete={onComplete}
          error={error}
          status={status}
          disabled={busy}
          clearSignal={clearSignal}
          className="mx-auto w-[208px]"
        />
      )}

      <button
        type="button"
        onClick={onCancelar}
        disabled={busy && status === "ok"}
        className="mt-4 block w-full text-center text-[13px] font-medium text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-50"
      >
        Cancelar
      </button>
    </Modal>
  );
}
