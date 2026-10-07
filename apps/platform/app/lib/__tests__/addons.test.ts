import { describe, expect, it } from "vitest";
import { decidirAltaAddon, precioAltaAddon, type FilaAddon } from "../addons";

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

describe("precioAltaAddon: lo que el plan ya incluye entra a $0", () => {
  it("delivery y lealtad van a $0 desde Negocio", () => {
    for (const codigo of ["DELIVERY", "LEALTAD"]) {
      expect(precioAltaAddon(codigo, "NEGOCIO", 100)).toBe(0);
      expect(precioAltaAddon(codigo, "CADENA", 100)).toBe(0);
    }
  });

  it("en Esencial se cobran a precio de lista", () => {
    expect(precioAltaAddon("DELIVERY", "ESENCIAL", 100)).toBe(100);
    expect(precioAltaAddon("LEALTAD", "ESENCIAL", 100)).toBe(100);
  });

  it("los planes heredados por giro también los incluyen", () => {
    for (const plan of ["FT", "QS", "CB", "FS", "DK", "ENT"]) expect(precioAltaAddon("LEALTAD", plan, 100)).toBe(0);
  });

  it("un plan que no conocemos paga", () => {
    expect(precioAltaAddon("LEALTAD", "OTRO", 100)).toBe(100);
    expect(precioAltaAddon("LEALTAD", undefined, 100)).toBe(100);
  });

  it("un add-on que ningún plan regala se cobra siempre a su precio", () => {
    expect(precioAltaAddon("CFDI", "NEGOCIO", 250)).toBe(250);
  });
});
