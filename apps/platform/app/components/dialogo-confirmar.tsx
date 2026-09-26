"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@vim/ui/styles";
import { hoyMx } from "@vim/fecha";
import { evaluarConfirmacion, MOTIVO_MINIMO, type ResultadoConfirmacion } from "../lib/confirmacion";
import { fechaBloqueo, GRACIA_POR_DEFECTO } from "../lib/bloqueo";
import { fechaHoraMx, input, label } from "../lib/formato";

export type DialogoConfirmarProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion: ReactNode;
  /** Lo que va a cambiar, antes → después (plan, precio, versión). Va entre la descripción y el motivo. */
  detalle?: ReactNode;
  /** Nombre comercial que hay que escribir para habilitar el botón. */
  nombreEsperado: string;
  /**
   * Fricción graduada: lo reversible que toca a UN cliente (pausar el cobro, activar un add-on,
   * marcar abandonado) pide motivo pero no el nombre. Escribir el nombre se reserva para lo que
   * cuesta dinero o corta la operación: si se pide para todo, deja de frenar.
   */
  sinNombre?: boolean;
  /** Condición extra del llamador (p. ej. haber elegido un plan distinto) y qué decir si falta. */
  listo?: { ok: boolean; falta: string };
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

const FALTA: Record<ResultadoConfirmacion["faltantes"][number], string> = {
  motivo: `el motivo (${MOTIVO_MINIMO} caracteres o más)`,
  nombre: "escribir el nombre",
  gracia: "los días de gracia",
  entiendo: "marcar la casilla",
};

/**
 * Fricción deliberada (docs/diseno/platform.md): lo que toca a un tenant ajeno se confirma con
 * motivo, diciendo a quién afecta y desde cuándo, y —si cuesta dinero o corta la operación—
 * escribiendo su nombre. Sustituye a los `prompt()` y `confirm()` del navegador.
 *
 * El error se pinta AQUÍ, dentro del diálogo: antes iba a la página, detrás del velo, y el
 * operador veía un botón que dejaba de decir "Aplicando…" sin saber si había pasado algo.
 */
export function DialogoConfirmar(p: DialogoConfirmarProps) {
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [gracia, setGracia] = useState<number>(GRACIA_POR_DEFECTO);
  const [entiendo, setEntiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (p.abierto) { setNombre(""); setMotivo(""); setGracia(GRACIA_POR_DEFECTO); setEntiendo(false); setMensaje(""); setError(null); }
  }, [p.abierto]);

  const r = useMemo(
    () => evaluarConfirmacion({
      requiereNombre: !p.sinNombre,
      nombreEsperado: p.nombreEsperado, nombreEscrito: nombre, motivo,
      requiereGracia: p.conGracia, graciaDias: gracia, requiereEntiendo: Boolean(p.conEntiendo), entiendo,
    }),
    [p.sinNombre, p.nombreEsperado, p.conGracia, p.conEntiendo, nombre, motivo, gracia, entiendo],
  );
  const faltan = [...(p.listo && !p.listo.ok ? [p.listo.falta] : []), ...r.faltantes.map((f) => FALTA[f])];
  const puede = faltan.length === 0 && !p.ocupado;

  const fechaBloq = p.conGracia && Number.isInteger(gracia) && gracia >= 1 ? fechaBloqueo(hoyMx(), gracia) : null;

  async function confirmar() {
    setError(null);
    try {
      await p.onConfirmar({
        motivo: motivo.trim(),
        graciaDias: p.conGracia ? gracia : undefined,
        mensaje: p.conMensaje ? mensaje.trim() || undefined : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
    }
  }

  return (
    <Modal open={p.abierto} onClose={p.onCerrar} title={p.titulo} hideTitle className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
      <h2 className={["font-display text-[18px] font-semibold tracking-tight", p.peligroso ? "text-danger" : ""].join(" ")}>{p.titulo}</h2>
      <div className="mt-2 text-[13.5px] leading-snug text-ink-2">{p.descripcion}</div>
      {p.detalle && <div className="mt-3">{p.detalle}</div>}

      <div className="mt-4">
        <label className={label} htmlFor="dc-motivo">Motivo (queda en la bitácora)</label>
        <textarea id="dc-motivo" className={`${input} h-20 py-2`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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
          <p className="mt-1 text-[12.5px] text-ink-2">
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
        <label className="mt-3 flex items-start gap-2 text-[13.5px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
          <span>{p.conEntiendo}</span>
        </label>
      )}

      {!p.sinNombre && (
        <div className="mt-4">
          <label className={label} htmlFor="dc-nombre">
            Escribe <b className="text-ink">{p.nombreEsperado}</b> para confirmar
          </label>
          <input id="dc-nombre" className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {/* Qué falta, en vez de un botón gris que no explica nada. */}
        {faltan.length > 0 && !p.ocupado && (
          <p className="basis-full text-[12.5px] text-ink-2" aria-live="polite">Falta {faltan.join(", ")}.</p>
        )}
        <button type="button" onClick={p.onCerrar} className="btn h-10 rounded border border-line-strong px-4 text-[13px] font-semibold hover:bg-hover">
          Volver
        </button>
        <button
          type="button"
          disabled={!puede}
          onClick={() => void confirmar()}
          // Ancho mínimo: "Aplicando…" no debe hacer brincar el botón bajo el cursor.
          className={["btn h-10 min-w-[120px] rounded px-4 text-[13px] font-semibold text-white disabled:opacity-50", p.peligroso ? "bg-danger" : "bg-ink"].join(" ")}
        >
          {p.ocupado ? "Aplicando…" : p.etiquetaBoton}
        </button>
      </div>
    </Modal>
  );
}
