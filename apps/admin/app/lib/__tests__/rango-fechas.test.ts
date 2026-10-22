// @vitest-environment jsdom
//
// RangoFechas sigue al rango que le llega de fuera (los botones de periodo de Comisiones): antes
// los campos se quedaban con el rango viejo y «Aplicar» se encendía.
import { describe, expect, it } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { hoyMx, sumarDias } from "@vim/fecha";
import { RangoFechas } from "../../components/rango-fechas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// @vim/ui se compila en modo clásico (React.createElement).
(globalThis as { React?: typeof React }).React = React;

const campos = (c: HTMLElement) => [...c.querySelectorAll("input")].map((i) => i.value);
const aplicar = (c: HTMLElement) => [...c.querySelectorAll("button")].find((b) => b.textContent === "Aplicar")!;

describe("RangoFechas", () => {
  it("al cambiar el rango desde fuera, los campos lo siguen y no queda nada pendiente", async () => {
    const c = document.createElement("div");
    document.body.appendChild(c);
    const raiz = createRoot(c);
    const pintar = (desde: string, hasta: string) => raiz.render(createElement(RangoFechas, { desde, hasta, onCambio: () => {} }));
    await act(async () => { pintar("2026-09-01", "2026-09-30"); });
    expect(campos(c)).toEqual(["2026-09-01", "2026-09-30"]);

    // Un periodo que termina después de hoy (la semana en curso): se muestra tal cual y se puede ver sin aplicar.
    const fin = sumarDias(hoyMx(), 3);
    await act(async () => { pintar("2026-10-13", fin); });
    expect(campos(c)).toEqual(["2026-10-13", fin]);
    expect(aplicar(c).className).toContain("hidden");
    expect(c.querySelector("[role=alert]")).toBeNull();
    await act(async () => { raiz.unmount(); });
  });
});
