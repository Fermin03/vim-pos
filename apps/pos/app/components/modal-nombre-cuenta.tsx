"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { NombreEnUso, nombreLibre } from "../lib/cuenta-barra";

const input =
  "h-12 w-full rounded border border-line-strong px-3 text-15 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * Pide un nombre para identificar la cuenta.
 *
 * **Pick-up** (con `onOmitir`): NO se da de alta un cliente: el nombre es de un solo uso —sirve
 * para gritar "¡Juan!" cuando el pedido está listo— y registrar cada uno llenaría el catálogo de
 * clientes de basura. Se guarda como etiqueta del ticket y ya. Se puede omitir: si el cajero no
 * alcanzó a preguntar el nombre, el pedido igual se toma y la cuenta se identifica por su folio.
 *
 * **Barra** (con `enUso`, sin `onOmitir`): el nombre es OBLIGATORIO, porque es lo único con que se
 * encuentra la cuenta, y no puede repetirse entre las abiertas. Si ya hay un «Luis» se propone
 * «Luis 2» antes de mandarlo; si otra caja lo ganó en el mismo instante (`NombreEnUso`), el modal
 * se queda abierto proponiendo el siguiente libre.
 */
export function ModalNombreCuenta({
  onListo,
  onOmitir,
  onCancelar,
  enUso,
}: {
  /** Puede ser async: mientras corre, el botón espera; si lanza, el error se enseña aquí. */
  onListo: (nombre: string) => void | Promise<void>;
  /** Pick-up: seguir sin nombre. */
  onOmitir?: () => void;
  /** Barra: cerrar sin abrir nada. */
  onCancelar?: () => void;
  /** Barra: nombres de las cuentas abiertas, para proponer uno libre. */
  enUso?: readonly string[];
}) {
  const [nombre, setNombre] = useState("");
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<readonly string[]>(enUso ?? []);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement | null>(null);
  const obligatorio = !onOmitir;
  const salir = onOmitir ?? onCancelar;

  // Foco por ref y no con `autoFocus`: el modal se monta en el mismo tick en que se entra al
  // catálogo, y en esa transición el navegador puede darle el foco a otro elemento.
  useEffect(() => {
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const confirmar = async () => {
    if (enviando) return;
    const n = (propuesta ?? nombre.trim()).slice(0, 100);
    if (n.length === 0) { if (!obligatorio) onOmitir?.(); return; }
    if (obligatorio && !propuesta) {
      const libre = nombreLibre(n, ocupados);
      if (libre !== n) { setPropuesta(libre); return; }
    }
    setEnviando(true);
    setError(null);
    try {
      await onListo(n);
    } catch (e) {
      if (e instanceof NombreEnUso) {
        const usados = [...ocupados, e.nombre];
        setOcupados(usados);
        setPropuesta(nombreLibre(e.nombre, usados));
      } else {
        setError(e instanceof Error ? e.message : "No se pudo abrir la cuenta");
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px] rounded-lg bg-surface p-5 shadow-lg">
        <h2 className="font-display text-18 font-bold">¿A nombre de quién?</h2>
        <p className="mt-1 text-13 text-ink-3">
          {obligatorio ? "Con este nombre encuentras la cuenta en la barra." : "Para identificar el pedido al recogerlo."}
        </p>
        <input
          ref={campo}
          className={`${input} mt-3`}
          placeholder="Nombre del cliente…"
          value={nombre}
          maxLength={100}
          onChange={(e) => { setNombre(e.target.value); setPropuesta(null); setError(null); }}
          onKeyDown={(e) => {
            // Enter confirma: el cajero está al teléfono o con el cliente enfrente y no
            // debería tener que soltar el teclado para tocar un botón.
            if (e.key === "Enter") { e.preventDefault(); void confirmar(); }
            if (e.key === "Escape") { e.preventDefault(); salir?.(); }
          }}
        />
        {propuesta && (
          <p className="mt-3 text-13 font-medium text-ink-2" role="status">
            Ya hay una cuenta con ese nombre. ¿La abrimos como «{propuesta}»?
          </p>
        )}
        {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={salir}
            className="h-10 rounded border border-line-strong px-4 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            {obligatorio ? "Cancelar" : "Omitir"}
          </button>
          <Button onClick={() => void confirmar()} disabled={enviando || nombre.trim().length === 0}>
            {enviando ? "Un momento…" : propuesta ? `Abrir como «${propuesta}»` : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
