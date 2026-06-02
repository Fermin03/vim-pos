"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { resetPinSchema, resetearPin, type Usuario } from "../lib/usuarios";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export function ModalResetearPin({
  usuario,
  onCerrar,
  onHecho,
}: {
  usuario: Usuario;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function reset() {
    setError(null);
    const parsed = resetPinSchema.safeParse({ pin, confirmar });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await resetearPin(usuario.id, pin);
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resetear");
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={`Resetear PIN de ${usuario.nombre}`}
      hideTitle
      className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Resetear PIN</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Nuevo PIN para <b className="text-ink-2">{usuario.nombre}</b>. Desbloqueará la cuenta si está bloqueada.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="rp-pin">Nuevo PIN</label>
          <input
            id="rp-pin"
            className={input}
            value={pin}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            autoComplete="off"
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="4 a 6 dígitos"
          />
        </div>
        <div>
          <label className={label} htmlFor="rp-conf">Confirmar PIN</label>
          <input
            id="rp-conf"
            className={input}
            value={confirmar}
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            onChange={(e) => setConfirmar(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Repite el PIN"
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">{error}</p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={reset} disabled={guardando}>{guardando ? "Guardando…" : "Resetear PIN"}</Button>
      </div>
    </Modal>
  );
}
