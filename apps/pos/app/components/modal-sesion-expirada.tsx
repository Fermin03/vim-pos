"use client";
import { useState } from "react";
import { Button, Modal, PinKeypad } from "@vim/ui/styles";
import { pinLogin, type Empleado, type PinLoginResult } from "../lib/supabase";
import { PosSkeletonBg } from "./pos-skeleton-bg";
import { ROL_LABEL } from "./selector-empleados";

/** Sesión expirada (mockup P-012): re-autenticar con PIN sin perder el trabajo. */
export function ModalSesionExpirada({
  empleado,
  cajaId,
  onExito,
  onCerrarSesion,
}: {
  empleado: Empleado;
  cajaId: string;
  onExito: (r: PinLoginResult) => void;
  onCerrarSesion: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "ok">("idle");
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);

  async function continuar() {
    if (pin.length !== 4 || busy) return;
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
      setPin("");
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
        <p className="text-sm text-ink-2">Volviendo a donde estabas…</p>
      </div>
    );
  }

  return (
    <>
      <PosSkeletonBg variant="app" />
      <Modal
        open
        onClose={onCerrarSesion}
        title="Tu sesión expiró"
        hideTitle
        backdropClassName="bg-ink/30 backdrop-blur-sm"
        className="w-[360px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-hover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink-2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>

        <div className="mb-5 text-center">
          <h3 className="mb-[7px] font-display text-xl font-semibold tracking-tight">Tu sesión expiró</h3>
          <p className="text-[13.5px] leading-normal text-ink-2">
            Por seguridad cerramos tu sesión tras un rato. Vuelve a entrar para continuar.
          </p>
        </div>

        <p className="mb-5 text-center text-[13px] text-ink-3">
          Sesión de <b className="font-semibold text-ink-2">{empleado.nombre}</b> ({ROL_LABEL[empleado.rol] ?? "Empleado"})
        </p>

        <PinKeypad
          length={4}
          onComplete={() => {}}
          onChange={setPin}
          autoSubmit={false}
          error={error}
          status={status}
          disabled={busy}
          clearSignal={clearSignal}
          className="mx-auto w-[208px]"
        />

        <div className="my-4 flex items-start gap-2 rounded border border-line bg-hover px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px h-[15px] w-[15px] flex-shrink-0 text-success">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Tu trabajo no se perdió: sigue justo donde lo dejaste.
        </div>

        <Button size="lg" className="w-full" disabled={pin.length !== 4 || busy} onClick={continuar}>
          {busy && status !== "error" ? "Verificando…" : "Continuar"}
        </Button>

        <button
          type="button"
          onClick={onCerrarSesion}
          className="mt-4 block w-full text-center text-[13px] font-medium text-ink-3 transition-colors hover:text-ink-2"
        >
          Cerrar sesión
        </button>
      </Modal>
    </>
  );
}
