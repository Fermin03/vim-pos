"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@vim/ui/styles";
import { hoyMx } from "@vim/fecha";
import { evaluarConfirmacion, MOTIVO_MINIMO } from "../lib/confirmacion";
import { fechaBloqueo, GRACIA_POR_DEFECTO } from "../lib/bloqueo";
import { fechaHoraMx, input, label } from "../lib/formato";

export type DialogoConfirmarProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion: ReactNode;
  /** Nombre comercial que hay que escribir para habilitar el botón. */
  nombreEsperado: string;
  etiquetaBoton: string;
  peligroso?: boolean;
  /** Pide días de gracia y muestra la fecha de bloqueo resultante. */
  conGracia?: boolean;
  /** Texto de una casilla obligatoria ("Entiendo que…"). */
  conEntiendo?: string;
  /** Campo opcional "mensaje que verá el cajero". */
  conMensaje?: boolean;
  ocupado?: boolean;
  onConfirmar: (r: { motivo: string; graciaDias?: number; mensaje?: string }) => void | Promise<void>;
};

/**
 * Fricción deliberada (docs/diseno/platform.md): lo que toca a un tenant ajeno se confirma
 * escribiendo su nombre, con motivo, y diciendo a quién afecta y desde cuándo. Sustituye a los
 * `prompt()` y `confirm()` del navegador, que confirmaban lo irreversible con un clic.
 */
export function DialogoConfirmar(p: DialogoConfirmarProps) {
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [gracia, setGracia] = useState<number>(GRACIA_POR_DEFECTO);
  const [entiendo, setEntiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (p.abierto) { setNombre(""); setMotivo(""); setGracia(GRACIA_POR_DEFECTO); setEntiendo(false); setMensaje(""); }
  }, [p.abierto]);

  const r = useMemo(
    () => evaluarConfirmacion({
      nombreEsperado: p.nombreEsperado, nombreEscrito: nombre, motivo,
      requiereGracia: p.conGracia, graciaDias: gracia, requiereEntiendo: Boolean(p.conEntiendo), entiendo,
    }),
    [p.nombreEsperado, p.conGracia, p.conEntiendo, nombre, motivo, gracia, entiendo],
  );

  const fechaBloq = p.conGracia && Number.isInteger(gracia) && gracia >= 1 ? fechaBloqueo(hoyMx(), gracia) : null;

  return (
    <Modal open={p.abierto} onClose={p.onCerrar} title={p.titulo} className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
      <h2 className={["font-display text-[18px] font-semibold tracking-tight", p.peligroso ? "text-danger" : ""].join(" ")}>{p.titulo}</h2>
      <div className="mt-2 text-[13px] leading-snug text-ink-2">{p.descripcion}</div>

      <div className="mt-4">
        <label className={label} htmlFor="dc-motivo">Motivo (queda en la bitácora)</label>
        <textarea id="dc-motivo" className={`${input} h-20 py-2`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {motivo.length > 0 && motivo.trim().length < MOTIVO_MINIMO && (
          <p className="mt-1 text-[11.5px] text-ink-3">Al menos {MOTIVO_MINIMO} caracteres.</p>
        )}
      </div>

      {p.conGracia && (
        <div className="mt-3">
          <label className={label} htmlFor="dc-gracia">Días de gracia antes de bloquear la caja</label>
          <input
            id="dc-gracia"
            className={`${input} w-28`}
            inputMode="numeric"
            value={gracia}
            onChange={(e) => setGracia(Math.trunc(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
          />
          <p className="mt-1 text-[12px] text-ink-3">
            {fechaBloq ? `La caja dejará de vender el ${fechaHoraMx(fechaBloq)} (hora de México).` : "Escribe al menos 1 día."}
          </p>
        </div>
      )}

      {p.conMensaje && (
        <div className="mt-3">
          <label className={label} htmlFor="dc-mensaje">Mensaje que verá el cajero (opcional)</label>
          <textarea
            id="dc-mensaje"
            className={`${input} h-16 py-2`}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Si lo dejas vacío se usa el texto estándar con la fecha."
          />
        </div>
      )}

      {p.conEntiendo && (
        <label className="mt-3 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
          <span>{p.conEntiendo}</span>
        </label>
      )}

      <div className="mt-4">
        <label className={label} htmlFor="dc-nombre">
          Escribe <b className="text-ink">{p.nombreEsperado}</b> para confirmar
        </label>
        <input id="dc-nombre" className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={p.onCerrar} className="btn h-10 rounded border border-line-strong px-4 text-[13px] font-semibold hover:bg-hover">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!r.ok || p.ocupado}
          onClick={() => p.onConfirmar({
            motivo: motivo.trim(),
            graciaDias: p.conGracia ? gracia : undefined,
            mensaje: p.conMensaje ? mensaje.trim() || undefined : undefined,
          })}
          className={["btn h-10 rounded px-4 text-[13px] font-semibold text-white disabled:opacity-50", p.peligroso ? "bg-danger" : "bg-ink"].join(" ")}
        >
          {p.ocupado ? "Aplicando…" : p.etiquetaBoton}
        </button>
      </div>
    </Modal>
  );
}
