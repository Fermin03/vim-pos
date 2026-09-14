import { describe, expect, it } from "vitest";
import { decidirAltaAddon, precioAltaDelivery, type FilaAddon } from "../addons";

const HOY = "2026-09-13";

describe("decidirAltaAddon", () => {
  it("sin filas previas: alta normal", () => {
    expect(decidirAltaAddon([], HOY)).toEqual({ accion: "insertar" });
  });

  it("ya activo: no se duplica la fila ni se le cobra dos veces", () => {
    const filas: FilaAddon[] = [{ id: "a", activo: true, fecha_inicio: "2026-08-25" }];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "ya_estaba" });
  });

  it("baja de HOY: se reactiva esa fila, que es lo que la restricción impide insertar de nuevo", () => {
    const filas: FilaAddon[] = [{ id: "a", activo: false, fecha_inicio: HOY }];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "reactivar", id: "a" });
  });

  it("baja de otro día: alta normal, con su propia fecha_inicio", () => {
    const filas: FilaAddon[] = [{ id: "a", activo: false, fecha_inicio: "2026-08-25" }];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "insertar" });
  });

  it("historial largo con una baja de hoy: reactiva la de hoy, no la vieja", () => {
    const filas: FilaAddon[] = [
      { id: "vieja", activo: false, fecha_inicio: "2026-01-10" },
      { id: "otra", activo: false, fecha_inicio: "2026-05-02" },
      { id: "hoy", activo: false, fecha_inicio: HOY },
    ];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "reactivar", id: "hoy" });
  });

  it("activo manda sobre una baja de hoy: primero se comprueba que no lo tenga ya", () => {
    const filas: FilaAddon[] = [
      { id: "hoy", activo: false, fecha_inicio: HOY },
      { id: "viva", activo: true, fecha_inicio: "2026-08-25" },
    ];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "ya_estaba" });
  });

  it("fecha_inicio con hora: se compara solo el día", () => {
    const filas: FilaAddon[] = [{ id: "a", activo: false, fecha_inicio: `${HOY}T00:00:00+00:00` }];
    expect(decidirAltaAddon(filas, HOY)).toEqual({ accion: "reactivar", id: "a" });
  });
});

describe("precioAltaDelivery", () => {
  const LISTA = 100;

  it("Esencial paga el precio de lista", () => {
    expect(precioAltaDelivery("ESENCIAL", LISTA)).toBe(100);
  });

  it("Negocio y Cadena lo llevan incluido", () => {
    expect(precioAltaDelivery("NEGOCIO", LISTA)).toBe(0);
    expect(precioAltaDelivery("CADENA", LISTA)).toBe(0);
  });

  it("los planes viejos por vertical también lo llevan incluido", () => {
    // Decisión del 14 sep 2026: cuestan más que Negocio, así que cobrarles aparte lo que un
    // Cadena de $1,999 lleva incluido no se sostenía.
    for (const p of ["FT", "QS", "CB", "FS", "DK", "ENT"]) {
      expect(precioAltaDelivery(p, LISTA)).toBe(0);
    }
  });

  it("un plan que no conocemos paga: regalar sin querer es peor que cobrar de más", () => {
    // Cobrar de más se ve en la factura y alguien reclama; regalarlo no lo nota nadie.
    expect(precioAltaDelivery("PLAN_NUEVO_2027", LISTA)).toBe(100);
  });

  it("sin plan, paga", () => {
    expect(precioAltaDelivery("", LISTA)).toBe(100);
    expect(precioAltaDelivery(undefined, LISTA)).toBe(100);
  });
});
