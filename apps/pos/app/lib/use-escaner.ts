"use client";
import { useEffect, useRef } from "react";
import { crearDetectorEscaner, leerUmbral } from "./escaner";

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
 *
 * También se traga cada tecla de la ráfaga desde el 2º carácter, para que no lleguen al teclado
 * numérico del cobro ni al PIN. El 1er carácter se escapa: aún no se sabe que es un lector.
 *
 * `activo` solo enciende el oyente; QUÉ hacer con el código lo decide `alCodigo`. Sigue activo con
 * el cobro abierto (para tragarse la ráfaga) y ahí `alCodigo` avisa «Termina el cobro…». Bajo el
 * aviso de un pedido de la tienda o un PIN, `alCodigo` ignora el código.
 */
export function useEscaner(alCodigo: (codigo: string) => void, activo: boolean): void {
  const cb = useRef(alCodigo);
  cb.current = alCodigo;

  useEffect(() => {
    if (!activo) return;
    const detector = crearDetectorEscaner({ umbralMs: leerUmbral() });
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "Enter" && e.key.length !== 1) return; // Shift, flechas, F1…
      const foco = document.activeElement;
      const esInput =
        foco instanceof HTMLInputElement ||
        foco instanceof HTMLTextAreaElement ||
        foco instanceof HTMLSelectElement ||
        (foco instanceof HTMLElement && foco.isContentEditable);
      const busqueda = foco instanceof HTMLInputElement && foco.dataset.escaner === "busqueda";
      const { codigo, enRafaga } = detector.tecla({
        key: e.key,
        tiempo: e.timeStamp,
        enCampoAjeno: esInput && !busqueda,
      });
      if (codigo === null && !enRafaga) return;
      e.preventDefault();
      e.stopPropagation();
      if (codigo === null) return;
      if (busqueda) limpiarCampo(foco);
      cb.current(codigo);
    };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [activo]);
}
