import { describe, it, expect } from "vitest";
import {
  agotadosParaGuardar,
  cajasSinMenuPorSucursal,
  estadoGeneral,
  filasFormIniciales,
  precioValido,
  versionMenor,
  VERSION_MINIMA_MENU_SUCURSAL,
  type FilaMenuSucursal,
} from "../menu-sucursal";

const fila = (sucursal_id: string, extra: Partial<FilaMenuSucursal> = {}): FilaMenuSucursal => ({
  producto_id: "p1",
  sucursal_id,
  disponible: true,
  precio_mxn: null,
  agotado_manual: false,
  agotado_automatico: false,
  ...extra,
});

describe("estado en «todas»", () => {
  it("agotado es «agotado en todas» (las columnas derivadas)", () => {
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: true })).toBe("AGOTADO");
    expect(estadoGeneral({ estado: "PAUSADO", agotado_manual: true, agotado_automatico: false })).toBe("PAUSADO");
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: false })).toBe("ACTIVO");
  });
});

describe("qué se guarda", () => {
  it("un precio que no es número no es precio: un «.» suelto no es $0.00", () => {
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
  it("las filas del formulario salen de las sucursales, con lo guardado encima", () => {
    const r = filasFormIniciales(
      [{ id: "c", nombre: "Centro" }, { id: "n", nombre: "Norte" }],
      [fila("n", { precio_mxn: 135, agotado_automatico: true })],
    );
    expect(r).toEqual([
      { sucursalId: "c", nombre: "Centro", agotado: false, agotadoAuto: false },
      { sucursalId: "n", nombre: "Norte", agotado: false, agotadoAuto: true },
    ]);
  });
});

describe("agotado hoy por sucursal (0155)", () => {
  it("manda las que se agotan y las que ya tenían fila; no crea filas para lo que no cambia", () => {
    const r = agotadosParaGuardar(
      "p1",
      [
        { sucursalId: "centro", agotado: true },
        { sucursalId: "norte", agotado: false },
        { sucursalId: "sur", agotado: false },
      ],
      [{ sucursal_id: "norte" }],
    );
    expect(r).toEqual([
      { producto_id: "p1", sucursal_id: "centro", agotado_manual: true },
      { producto_id: "p1", sucursal_id: "norte", agotado_manual: false },
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
