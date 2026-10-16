"use client";
import { useEffect, useRef } from "react";
import { crearDetectorEscaner } from "./escaner";

const CLAVE_UMBRAL = "vimpos.escaner.umbralMs";

function leerUmbral(): number | undefined {
  try {
    const n = Number(localStorage.getItem(CLAVE_UMBRAL));
    return n ? Math.min(80, Math.max(20, n)) : undefined;
  } catch {
    return undefined;
  }
}

/** Pone "" en un input controlado por React: el setter nativo + `input` hace que su estado lo siga. */
function limpiarCampo(el: HTMLInputElement) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Lector USB como atajo global de la pantalla de venta de tienda: funciona sin foco.
 *
 * Escucha en `window` en fase de captura para ver la ráfaga antes que cualquier otro listener. Si
 * la ráfaga cae en un campo distinto del buscador (`data-escaner="busqueda"`) no se mete. Al
 * reconocer un código se come el Enter (`preventDefault` + `stopPropagation`), para que no active
 * ni envíe nada (el Enter del cobro, un botón enfocado), y limpia el buscador, donde los
 * caracteres de la ráfaga pudieron haber caído.
 */
export function useEscaner(alCodigo: (codigo: string) => void, activo: boolean): void {
  const cb = useRef(alCodigo);
  cb.current = alCodigo;

  useEffect(() => {
    if (!activo) return;
    const detector = crearDetectorEscaner({ umbralMs: leerUmbral() });
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "Enter" && e.key.length !== 1) return; // Shift, flechas, F1…
      const foco = document.activeElement;
      const esInput = foco instanceof HTMLInputElement || foco instanceof HTMLTextAreaElement;
      const busqueda = foco instanceof HTMLInputElement && foco.dataset.escaner === "busqueda";
      const codigo = detector.tecla({ key: e.key, tiempo: e.timeStamp, enCampoAjeno: esInput && !busqueda });
      if (codigo === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (busqueda) limpiarCampo(foco);
      cb.current(codigo);
    };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [activo]);
}
