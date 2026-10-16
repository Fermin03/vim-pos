import { describe, expect, it } from "vitest";
import { buscarCapturable, estadoExistencia, resumenExistencias, varianteDe, type FilaExistencia } from "../existencias";

const fila = (c: number, m: number | null, v = 0): FilaExistencia => ({
  sucursal_id: "s", sucursal_nombre: "S", producto_id: Math.random().toString(), producto_nombre: "P", variante: "",
  nombre_completo: "P", codigo_interno: null, codigo_barras: null, costo_mxn: 10, precio_mxn: 20, cantidad: c, minimo: m, valor_mxn: v,
});

describe("existencias", () => {
  it("variante en orden de ejes", () => {
    expect(varianteDe(["Talla", "Color"], { Color: "Negra", Talla: "M" })).toBe("M · Negra");
    expect(varianteDe(null, null)).toBe("");
  });
  it("estado", () => {
    expect(estadoExistencia(-1, null)).toBe("negativa");
    expect(estadoExistencia(0, null)).toBe("agotada");
    expect(estadoExistencia(2, 2)).toBe("bajo");
    expect(estadoExistencia(3, 2)).toBe("ok");
    expect(estadoExistencia(3, null)).toBe("ok");
  });
  it("resumen", () => {
    expect(resumenExistencias([fila(5, 2, 50), fila(1, 2, 10), fila(-2, null, 0), fila(0, 1, 0)]))
      .toEqual({ piezas: 4, valor_mxn: 60, bajo: 2, negativas: 1 });
  });
  it("captura: código exacto primero, luego nombre", () => {
    const lista = [
      { id: "1", nombre: "Gorra roja", codigo_interno: "GOR-1", codigo_barras: "2000000000985" },
      { id: "2", nombre: "Gorra azul", codigo_interno: "GOR-2", codigo_barras: null },
    ];
    expect(buscarCapturable(lista, " 2000000000985 ").exacto?.id).toBe("1");
    expect(buscarCapturable(lista, "gor-2").exacto?.id).toBe("2");
    const r = buscarCapturable(lista, "gorra");
    expect(r.exacto).toBeNull();
    expect(r.coincidencias.map((c) => c.id)).toEqual(["1", "2"]);
    expect(buscarCapturable(lista, "").coincidencias).toEqual([]);
  });
});
