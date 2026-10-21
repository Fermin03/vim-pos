"use client";
import { useEffect, useRef, useState } from "react";
import { useEscape } from "../lib/use-escape";

type ModoComida = "PARA_LLEVAR" | "COMER_AQUI";

const opcion =
  "h-16 flex-1 rounded-lg border-2 border-line-strong bg-surface font-display text-18 font-bold text-ink " +
  "transition-[border-color,background-color,transform] duration-150 ease-vim hover:border-ink hover:bg-hover " +
  "active:scale-[.97] active:duration-[60ms] disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Comida rápida, al presionar Cobrar: «¿Es para llevar o para comer aquí?» antes de guardar el ticket.
 * Con `pedirNombre` la misma ventana pide el nombre (obligatorio) y los botones esperan a que haya
 * texto. `soloNombre` (food truck sin dónde comer): no hay pregunta, solo el nombre y «Continuar»,
 * que es Para llevar. Escape y «Cancelar» cierran sin guardar nada.
 */
export function ModalServicioComida({
  pedirNombre,
  nombreInicial,
  soloNombre = false,
  onElegir,
  onCancelar,
}: {
  pedirNombre: boolean;
  nombreInicial: string;
  soloNombre?: boolean;
  onElegir: (modo: ModoComida, nombre: string | null) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const campo = useRef<HTMLInputElement | null>(null);
  useEscape(onCancelar);

  // Foco por ref, como en «¿A nombre de quién?»: el modal se monta en el mismo tick del clic en Cobrar.
  useEffect(() => {
    if (!pedirNombre) return;
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [pedirNombre]);

  const limpio = nombre.trim().slice(0, 100);
  const listo = !pedirNombre || limpio.length > 0;
  const elegir = (modo: ModoComida) => { if (listo) onElegir(modo, pedirNombre ? limpio : null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="servicio-comida-titulo">
      <div className="w-full max-w-[460px] rounded-lg bg-surface p-5 shadow-lg">
        <h2 id="servicio-comida-titulo" className="font-display text-20 font-bold">
          {soloNombre ? "Nombre del cliente" : "¿Es para llevar o para comer aquí?"}
        </h2>
        {pedirNombre && (
          <label className="mt-4 block">
            {!soloNombre && <span className="text-14 font-semibold text-ink-2">Nombre del cliente</span>}
            <input
              ref={campo}
              className="mt-1 h-12 w-full rounded border border-line-strong px-3 text-15 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
              value={nombre}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setNombre(e.target.value)}
              // Enter solo confirma cuando no hay nada que elegir; con la pregunta, el cajero toca el botón.
              onKeyDown={(e) => { if (e.key === "Enter" && soloNombre) { e.preventDefault(); elegir("PARA_LLEVAR"); } }}
            />
          </label>
        )}
        <div className="mt-5 flex gap-3">
          {soloNombre ? (
            <button type="button" className={opcion} disabled={!listo} onClick={() => elegir("PARA_LLEVAR")}>Continuar</button>
          ) : (
            <>
              <button type="button" className={opcion} disabled={!listo} onClick={() => elegir("PARA_LLEVAR")}>Para llevar</button>
              <button type="button" className={opcion} disabled={!listo} onClick={() => elegir("COMER_AQUI")}>Comer aquí</button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onCancelar}
          className="mt-3 h-11 w-full rounded text-14 font-semibold text-ink-2 transition hover:bg-hover hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
