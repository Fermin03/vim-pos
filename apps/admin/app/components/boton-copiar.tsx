"use client";
import { useState } from "react";

/**
 * Copia un texto al portapapeles. Ancho fijo para que no brinque al cambiar a "Copiado", y
 * "Copiado" solo si el portapapeles de verdad aceptó el texto (mismo patrón que Cajas).
 */
export function BotonCopiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${etiqueta}`}
      onClick={() => {
        navigator.clipboard?.writeText(valor).then(
          () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); },
          () => { /* sin permiso de portapapeles: el texto sigue a la vista para copiarlo a mano */ },
        );
      }}
      className="h-9 w-[92px] shrink-0 rounded border border-line-strong px-3 text-center text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97]"
    >
      <span aria-live="polite">{copiado ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
