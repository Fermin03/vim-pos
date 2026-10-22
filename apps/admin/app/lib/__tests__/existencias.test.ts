import { describe, expect, it } from "vitest";
import { avisoRenglon, buscarCapturable, diferenciasConteo, estadoExistencia, resumenExistencias, varianteDe, type FilaExistencia } from "../existencias";

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
  it("aviso del renglón, como el validador de la base", () => {
    expect(avisoRenglon("1")).toBeNull();
    expect(avisoRenglon("0.001", "12.50")).toBeNull();
    expect(avisoRenglon("0")).toMatch(/cantidad/);
    expect(avisoRenglon("0", "", true)).toBeNull();
    expect(avisoRenglon("")).toMatch(/cantidad/);
    expect(avisoRenglon("NaN")).toMatch(/cantidad/);
    expect(avisoRenglon("1.2345")).toMatch(/3 decimales/);
    expect(avisoRenglon("1000000000")).toMatch(/cantidad/);
    expect(avisoRenglon("1", "-1")).toMatch(/costo/);
    expect(avisoRenglon("1", "1.234")).toMatch(/2 decimales/);
  });
  it("aviso del renglón acepta lo que acepta numeric", () => {
    expect(avisoRenglon(".5")).toBeNull();
    expect(avisoRenglon("5.")).toBeNull();
    expect(avisoRenglon("1.2340")).toBeNull();
    expect(avisoRenglon("1.2345")).toMatch(/3 decimales/);
    expect(avisoRenglon("999999999.999")).toBeNull();
    expect(avisoRenglon(".")).toMatch(/cantidad/);
    expect(avisoRenglon("1", "0")).toBeNull();
    expect(avisoRenglon("1", "1.230")).toBeNull();
    expect(avisoRenglon("1", ".5")).toBeNull();
    expect(avisoRenglon("1", "1.235")).toMatch(/2 decimales/);
  });
});

describe("diferenciasConteo", () => {
  const ex = (id: string, sucursal: string, cantidad: number): FilaExistencia => ({
    sucursal_id: sucursal, sucursal_nombre: sucursal, producto_id: id, producto_nombre: id, variante: "",
    nombre_completo: `Prenda ${id}`, codigo_interno: null, codigo_barras: null, costo_mxn: null, precio_mxn: 0, cantidad, minimo: null, valor_mxn: 0,
  });
  it("compara contra la sucursal elegida, 0 sin fila, por diferencia absoluta", () => {
    const filas = [ex("sobra", "A", 2), ex("falta", "A", 10), ex("igual", "A", 4), ex("sinfila", "B", 99)];
    const r = diferenciasConteo(
      [
        { producto_id: "igual", contado: 4 },
        { producto_id: "sobra", contado: 3 },
        { producto_id: "sinfila", contado: 2 },
        { producto_id: "falta", contado: 7 },
      ],
      filas.filter((f) => f.sucursal_id === "A"),
    );
    expect(r).toEqual([
      { producto_id: "falta", nombre: "Prenda falta", sistema: 10, contado: 7, diferencia: -3 },
      { producto_id: "sinfila", nombre: "", sistema: 0, contado: 2, diferencia: 2 },
      { producto_id: "sobra", nombre: "Prenda sobra", sistema: 2, contado: 3, diferencia: 1 },
      { producto_id: "igual", nombre: "Prenda igual", sistema: 4, contado: 4, diferencia: 0 },
    ]);
  });
  it("sin errores de coma flotante", () => {
    expect(diferenciasConteo([{ producto_id: "x", contado: 0.3 }], [ex("x", "A", 0.1)])[0]!.diferencia).toBe(0.2);
  });
});
