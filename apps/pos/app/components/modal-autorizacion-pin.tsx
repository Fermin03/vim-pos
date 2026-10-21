"use client";
import { useState } from "react";
import { Button, Modal, PinKeypad, Icono } from "@vim/ui/styles";
import { autorizarConPin, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";

/**
 * Componente reutilizable de autorización por PIN de supervisor (mockup P-080).
 * Aparece sobre la pantalla donde se solicita la operación. El PIN del autorizador
 * se verifica server-side (Edge Function autorizar-pin); nunca en el cliente.
 */
export function ModalAutorizacionPin({
  token,
  payload,
  descripcion,
  ejecutaNombre,
  quienAutoriza,
  capa,
  onAutorizado,
  onCancelar,
}: {
  token: string;
  /** Lo que se autoriza. `turnoId` es null fuera de un turno (p. ej. desvincular desde la pantalla de acceso). */
  payload: PayloadAutorizacion;
  descripcion: string;
  ejecutaNombre: string;
  /** Quién puede autorizar, cuando no es "un supervisor o admin" (p. ej. un permiso solo de dueño/admin). */
  quienAutoriza?: string;
  /** Capa extra (p. ej. "z-[70]") cuando se abre encima de algo que ya está sobre z-50, como el recibo. */
  capa?: string;
  onAutorizado: (a: Autorizacion) => void;
  onCancelar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "ok">("idle");
  const [busy, setBusy] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);

  function mensajeError(codigo: string): string {
    if (codigo === "SIN_PERMISO")
      return `Ese PIN es válido, pero pertenece a un rol que no puede autorizar esta operación. Pide el PIN de ${quienAutoriza ?? "un supervisor o administrador"}.`;
    if (codigo === "BLOQUEADO") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    if (codigo === "PIN_INCORRECTO") return "PIN incorrecto. Inténtalo de nuevo.";
    return codigo;
  }

  async function onComplete(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const a = await autorizarConPin(token, pin, payload);
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
      backdropClassName={`bg-ink/40 backdrop-blur-sm ${capa ?? ""}`}
      className="w-[380px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-hover">
        <Icono nombre="candado" className="h-6 w-6 text-ink-2" />
      </div>

      <div className="mb-4 text-center">
        <h3 className="mb-[6px] font-display text-xl font-semibold tracking-tight">Autorización requerida</h3>
        <p className="text-14 font-medium text-ink-2">{descripcion}</p>
        <p className="mt-1 text-13 text-ink-3">
          Lo ejecuta <b className="font-semibold text-ink-2">{ejecutaNombre}</b> · debe autorizar {quienAutoriza ?? "un supervisor o admin"}.
        </p>
      </div>

      {status === "ok" ? (
        <div className="my-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <Icono nombre="palomita" className="h-6 w-6" />
          </div>
          <p className="font-display text-base font-semibold text-success">Autorizado</p>
          <p className="text-13 text-ink-3">La operación se ejecutará.</p>
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
        className="mt-4 block w-full text-center text-13 font-medium text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-50"
      >
        Cancelar
      </button>
    </Modal>
  );
}
