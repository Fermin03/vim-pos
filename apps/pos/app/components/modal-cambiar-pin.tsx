"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { cambiarPinPropio } from "../lib/supabase";

const input = "h-12 w-full rounded border border-line-strong px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1 block text-[12.5px] font-medium text-ink-2";

const MENSAJES: Record<string, string> = {
  PIN_ACTUAL_INCORRECTO: "El PIN actual no es correcto.",
  PIN_INVALIDO: "El PIN nuevo debe ser de 4 a 6 dígitos.",
  PIN_IGUAL: "El PIN nuevo no puede ser igual al actual.",
  SIN_PIN: "Tu cuenta no tiene PIN configurado. Pide al administrador que lo restablezca.",
};

const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function ModalCambiarPin({ token, onListo, onCerrar }: { token: string; onListo: () => void; onCerrar: () => void }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  async function guardar() {
    setError(null);
    if (!/^\d{4,6}$/.test(nuevo)) { setError("El PIN nuevo debe ser de 4 a 6 dígitos."); return; }
    if (nuevo !== confirmar) { setError("La confirmación no coincide."); return; }
    setGuardando(true);
    try {
      await cambiarPinPropio(token, actual, nuevo);
      setOk(true);
      setTimeout(onListo, 1100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(MENSAJES[msg] ?? "No se pudo cambiar el PIN. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Cambiar mi PIN" hideTitle
      className="w-[380px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <h2 className="mb-1 font-display text-xl font-semibold tracking-tight">Cambiar mi PIN</h2>
      <p className="mb-4 text-[13px] text-ink-3">Verifica tu PIN actual y elige uno nuevo de 4 a 6 dígitos.</p>

      {ok ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF3EE] text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="text-[14px] font-semibold">PIN actualizado</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className={label}>PIN actual</label>
            <input autoFocus type="password" inputMode="numeric" className={input} value={actual} onChange={(e) => setActual(soloDigitos(e.target.value))} />
          </div>
          <div>
            <label className={label}>PIN nuevo</label>
            <input type="password" inputMode="numeric" className={input} value={nuevo} onChange={(e) => setNuevo(soloDigitos(e.target.value))} />
          </div>
          <div>
            <label className={label}>Confirmar PIN nuevo</label>
            <input type="password" inputMode="numeric" className={input} value={confirmar} onChange={(e) => setConfirmar(soloDigitos(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }} />
          </div>
          {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando || !actual || !nuevo || !confirmar}>{guardando ? "Guardando…" : "Cambiar PIN"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
