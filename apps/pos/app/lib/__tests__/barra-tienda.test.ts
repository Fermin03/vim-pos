import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BarraTienda } from "../../components/barra-tienda";
import { destinosDe, esBelleza, seccionInicial } from "../tienda";
import type { DatosCaja } from "../turno";

(globalThis as { React?: unknown }).React = React;

const etiquetas = (giro: string) => {
  const html = renderToStaticMarkup(
    React.createElement(BarraTienda, { destinos: destinosDe({ giro } as DatosCaja), seccion: "panel", onCambiar: () => {}, pendientes: 0, bloqueada: false }),
  );
  return [...html.matchAll(/<span class="max-w-full[^>]*>(.*?)<\/span>/g)].map((m) => m[1]);
};

describe("barra de la tienda", () => {
  it("dice Cobrar, Inventario, Transacciones, Notificaciones y Más, en ese orden", () => {
    expect(etiquetas("RETAIL")).toEqual(["Cobrar", "Inventario", "Transacciones", "Notificaciones", "Más"]);
  });
});

describe("barra de belleza", () => {
  it("dice Calendario, Cobrar, Clientes, Transacciones y Más, en ese orden", () => {
    for (const giro of ["SALON", "SPA", "PELUQUERIA", "BARBERIA", "TATUAJES"]) {
      expect(etiquetas(giro)).toEqual(["Calendario", "Cobrar", "Clientes", "Transacciones", "Más"]);
    }
  });

  it("abre en el calendario; la tienda y el restaurante no son belleza", () => {
    expect(seccionInicial({ giro: "SALON" } as DatosCaja)).toBe("calendario");
    expect(seccionInicial({ giro: "RETAIL" } as DatosCaja)).toBe("panel");
    expect(esBelleza({ giro: "QUICK_SERVICE" } as DatosCaja)).toBe(false);
    expect(esBelleza({ giro: "RETAIL" } as DatosCaja)).toBe(false);
    expect(esBelleza(null)).toBe(false);
  });
});
