import { describe, it, expect } from "vitest";
import {
  cajasSinMenuPorSucursal,
  edicionesDeForm,
  errorPreciosForm,
  esPorDefecto,
  estadoEnSucursal,
  estadoGeneral,
  filaPorDefecto,
  filasFormIniciales,
  filasParaGuardar,
  precioValido,
  versionMenor,
  VERSION_MINIMA_MENU_SUCURSAL,
  type FilaMenuSucursal,
} from "../menu-sucursal";

const fila = (sucursal_id: string, extra: Partial<FilaMenuSucursal> = {}): FilaMenuSucursal => ({
  ...filaPorDefecto("p1", sucursal_id), ...extra,
});

describe("estado en una sucursal (misma regla que 0152 y que la caja)", () => {
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
  it("un precio que no es número no se guarda: un «.» suelto no es $0.00", () => {
    expect(precioValido("")).toBeNull();
    expect(precioValido("  ")).toBeNull();
    expect(precioValido("0")).toBe(0);
    expect(precioValido("135")).toBe(135);
    expect(precioValido("135.5")).toBe(135.5);
    expect(precioValido(" 99.90 ")).toBe(99.9);
    // limpiarPrecio(".") deja "0.": Number("0.") era 0 y se guardaba $0.00.
    expect(precioValido(".")).toBe("invalido");
    expect(precioValido("0.")).toBe("invalido");
    expect(precioValido("12.")).toBe("invalido");
    expect(precioValido("1.234")).toBe("invalido");
    expect(precioValido("-5")).toBe("invalido");
    expect(precioValido("abc")).toBe("invalido");
  });
  it("del formulario: un precio inválido bloquea el guardado y nombra la sucursal", () => {
    const filas = [
      { sucursalId: "c", nombre: "Centro", disponible: true, precio: "120", agotado: false, agotadoAuto: false },
      { sucursalId: "n", nombre: "Norte", disponible: true, precio: "0.", agotado: false, agotadoAuto: false },
    ];
    expect(errorPreciosForm(filas)).toBe("Precio inválido en Norte");
    expect(() => edicionesDeForm("p1", filas)).toThrow("Precio inválido en Norte");
    expect(errorPreciosForm([filas[0]!])).toBeNull();
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
    expect(versionMenor("0.4.110", "0.4.110")).toBe(false);
    expect(versionMenor("0.5.0", "0.4.110")).toBe(false);
    expect(versionMenor("basura", "0.4.110")).toBe(true);
  });
  it("la mínima es la 0.4.110: la 0.4.109 (pantalla del cliente, sin menú por sucursal) ya es vieja", () => {
    expect(VERSION_MINIMA_MENU_SUCURSAL).toBe("0.4.110");
    expect(versionMenor("0.4.109", VERSION_MINIMA_MENU_SUCURSAL)).toBe(true);
    expect(versionMenor("0.4.110", VERSION_MINIMA_MENU_SUCURSAL)).toBe(false);
  });
  it("solo cajas de escritorio (con latido) de versión vieja o desconocida", () => {
    const cajas = [
      { id: "1", nombre: "Caja 01", sucursalNombre: "Centro", activa: true, ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.109" },
      { id: "2", nombre: "Caja 02", sucursalNombre: "Norte", activa: true, ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.110" },
      { id: "3", nombre: "Caja web", sucursalNombre: "Norte", activa: true, ultimoLatido: null, versionApp: null },
      { id: "4", nombre: "Caja vieja", sucursalNombre: "Sur", activa: true, ultimoLatido: "2026-10-01T10:00:00Z", versionApp: null },
    ];
    expect(cajasSinMenuPorSucursal(cajas).map((c) => c.id)).toEqual(["1", "4"]);
  });
  it("una caja desactivada no se nombra aunque sea vieja", () => {
    const cajas = [
      { id: "1", nombre: "Caja 01", activa: false, ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.100" },
      { id: "2", nombre: "Caja 02", activa: false, ultimoLatido: "2026-10-02T10:00:00Z", versionApp: null },
      { id: "3", nombre: "Caja 03", activa: true, ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.100" },
    ];
    expect(cajasSinMenuPorSucursal(cajas).map((c) => c.id)).toEqual(["3"]);
  });
});
