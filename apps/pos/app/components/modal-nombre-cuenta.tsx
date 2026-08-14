"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";

const input =
  "h-12 w-full rounded border border-line-strong px-3 text-[15px] outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * Pide un nombre para identificar la cuenta (Pick-up).
 *
 * A diferencia del modal de domicilio, aquí NO se da de alta un cliente: el nombre es de un
 * solo uso —sirve para gritar "¡Juan!" cuando el pedido está listo— y registrar cada uno
 * llenaría el catálogo de clientes de basura. Se guarda como etiqueta del ticket y ya.
 *
 * Se puede omitir: si el cajero no alcanzó a preguntar el nombre, el pedido igual se toma y la
 * cuenta se identifica por su folio, como antes.
 */
export function ModalNombreCuenta({
  onListo,
  onOmitir,
}: {
  onListo: (nombre: string) => void;
  onOmitir: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const campo = useRef<HTMLInputElement | null>(null);

  // Foco por ref y no con `autoFocus`: el modal se monta en el mismo tick en que se entra al
  // catálogo, y en esa transición el navegador puede darle el foco a otro elemento.
  useEffect(() => {
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const confirmar = () => {
    const n = nombre.trim();
    if (n.length === 0) onOmitir();
    else onListo(n.slice(0, 100));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px] rounded-lg bg-surface p-5 shadow-lg">
        <h2 className="font-display text-[17px] font-bold">¿A nombre de quién?</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Para identificar el pedido al recogerlo.</p>
        <input
          ref={campo}
          className={`${input} mt-3`}
          placeholder="Nombre del cliente…"
          value={nombre}
          maxLength={100}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            // Enter confirma: el cajero está al teléfono o con el cliente enfrente y no
            // debería tener que soltar el teclado para tocar un botón.
            if (e.key === "Enter") { e.preventDefault(); confirmar(); }
            if (e.key === "Escape") { e.preventDefault(); onOmitir(); }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onOmitir}
            className="h-10 rounded border border-line-strong px-4 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            Omitir
          </button>
          <Button onClick={confirmar} disabled={nombre.trim().length === 0}>Continuar</Button>
        </div>
      </div>
    </div>
  );
}
