// @vitest-environment jsdom
//
// El Modal compartido (@vim/ui) y la tecla Escape.
//
// Vive aquí porque es el único paquete con jsdom; lo que se prueba es `packages/ui`.
//
// El Modal escucha Escape en `document` y se cierra. El POS tiene además una pila de Escape en
// `window` (apps/pos/app/lib/use-escape.ts) que ignora las teclas ya atendidas
// (`e.defaultPrevented`). Si el Modal NO marca la tecla, React aplica el cierre antes de que la
// tecla llegue a `window`, la pila ya no ve el modal abierto y ejecuta la capa de abajo: cerrar el
// cliente de domicilio sacaba además al cajero de la pantalla de captura. Una tecla, dos acciones.
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "@vim/ui/styles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// La config de pruebas del admin compila el JSX de @vim/ui en modo clásico (React.createElement).
(globalThis as { React?: typeof React }).React = React;

describe("Modal y Escape", () => {
  it("se cierra y marca la tecla como atendida para que nadie más actúe con ella", async () => {
    const onClose = vi.fn();
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const raiz = createRoot(contenedor);
    await act(async () => {
      raiz.render(createElement(Modal, { open: true, onClose, title: "Prueba", children: createElement("input") }));
    });

    let atendidaAlLlegarAWindow: boolean | null = null;
    const enWindow = (e: KeyboardEvent) => { atendidaAlLlegarAWindow = e.defaultPrevented; };
    window.addEventListener("keydown", enWindow);
    const evento = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { document.dispatchEvent(evento); });
    window.removeEventListener("keydown", enWindow);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(atendidaAlLlegarAWindow).toBe(true);

    await act(async () => raiz.unmount());
    contenedor.remove();
  });
});
