import { describe, it, expect } from "vitest";
import {
  cajasSinMenuPorSucursal,
  edicionesDeForm,
  esPorDefecto,
  estadoEnSucursal,
  estadoGeneral,
  filaPorDefecto,
  filasFormIniciales,
  filasParaGuardar,
  versionMenor,
  type FilaMenuSucursal,
} from "../menu-sucursal";

const fila = (sucursal_id: string, extra: Partial<FilaMenuSucursal> = {}): FilaMenuSucursal => ({
  ...filaPorDefecto("p1", sucursal_id), ...extra,
});

describe("estado en una sucursal (misma regla que 0151 y que la caja)", () => {
  it("sin fila, se vende", () => {
    expect(estadoEnSucursal("ACTIVO", undefined)).toBe("ACTIVO");
  });
  it("orden: pausado gana, luego no se vende, luego agotado", () => {
    expect(estadoEnSucursal("PAUSADO", fila("n", { disponible: false }))).toBe("PAUSADO");
    expect(estadoEnSucursal("ACTIVO", fila("n", { disponible: false, agotado_manual: true }))).toBe("NO_SE_VENDE");
    expect(estadoEnSucursal("ACTIVO", fila("n", { agotado_automatico: true }))).toBe("AGOTADO");
    expect(estadoEnSucursal("AGOTADO", undefined)).toBe("AGOTADO");
  });
  it("en «todas», agotado es «agotado en todas» (las columnas derivadas)", () => {
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: true })).toBe("AGOTADO");
    expect(estadoGeneral({ estado: "PAUSADO", agotado_manual: true, agotado_automatico: false })).toBe("PAUSADO");
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: false })).toBe("ACTIVO");
  });
});

describe("qué se guarda", () => {
  it("una fila en los valores por defecto es igual que no tenerla", () => {
    expect(esPorDefecto({ disponible: true, precio_mxn: null, agotado_manual: false })).toBe(true);
    expect(esPorDefecto({ disponible: true, precio_mxn: 0, agotado_manual: false })).toBe(false);
  });
  it("no crea filas por defecto, pero sí regresa a lo general una que ya existía", () => {
    const ediciones = edicionesDeForm("p1", [
      { sucursalId: "centro", nombre: "Centro", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "norte", nombre: "Norte", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "sur", nombre: "Sur", disponible: false, precio: "", agotado: false, agotadoAuto: false },
    ]);
    const r = filasParaGuardar(ediciones, [{ sucursal_id: "norte" }]);
    expect(r.map((e) => e.sucursal_id)).toEqual(["norte", "sur"]);
  });
  it("del formulario: precio vacío = general (null), con texto = número", () => {
    const [a, b] = edicionesDeForm("p1", [
      { sucursalId: "c", nombre: "C", disponible: true, precio: "", agotado: true, agotadoAuto: false },
      { sucursalId: "n", nombre: "N", disponible: true, precio: "135.5", agotado: false, agotadoAuto: false },
    ]);
    expect(a).toEqual({ producto_id: "p1", sucursal_id: "c", disponible: true, precio_mxn: null, agotado_manual: true });
    expect(b!.precio_mxn).toBe(135.5);
  });
  it("las filas del formulario salen de las sucursales, con lo guardado encima", () => {
    const r = filasFormIniciales(
      [{ id: "c", nombre: "Centro" }, { id: "n", nombre: "Norte" }],
      [fila("n", { precio_mxn: 135, agotado_automatico: true })],
    );
    expect(r).toEqual([
      { sucursalId: "c", nombre: "Centro", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "n", nombre: "Norte", disponible: true, precio: "135", agotado: false, agotadoAuto: true },
    ]);
  });
});

describe("cajas que todavía no respetan el menú por sucursal", () => {
  it("compara versiones por número, no por texto", () => {
    expect(versionMenor("0.4.9", "0.4.10")).toBe(true);
    expect(versionMenor("0.4.109", "0.4.109")).toBe(false);
    expect(versionMenor("0.5.0", "0.4.109")).toBe(false);
    expect(versionMenor("basura", "0.4.109")).toBe(true);
  });
  it("solo cajas de escritorio (con latido) de versión vieja o desconocida", () => {
    const cajas = [
      { id: "1", nombre: "Caja 01", sucursalNombre: "Centro", ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.108" },
      { id: "2", nombre: "Caja 02", sucursalNombre: "Norte", ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.109" },
      { id: "3", nombre: "Caja web", sucursalNombre: "Norte", ultimoLatido: null, versionApp: null },
      { id: "4", nombre: "Caja vieja", sucursalNombre: "Sur", ultimoLatido: "2026-10-01T10:00:00Z", versionApp: null },
    ];
    expect(cajasSinMenuPorSucursal(cajas, "0.4.109").map((c) => c.id)).toEqual(["1", "4"]);
  });
});
