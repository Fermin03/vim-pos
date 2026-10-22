import { describe, expect, it } from "vitest";
import { armarMatriz, claveValores, filaConDatoInvalido, parsearValoresEje, type FilaVariante } from "../variantes";

describe("variantes", () => {
  it("valores de un eje: separa por coma, quita vacíos y repetidos", () => {
    expect(parsearValoresEje(" CH, M ,, m, G ")).toEqual(["CH", "M", "G"]);
  });
  it("arma el producto cartesiano en orden de ejes con el precio base", () => {
    const m = armarMatriz([{ nombre: "Talla", valores: ["M", "G"] }, { nombre: "Color", valores: ["Negra", "Blanca"] }], [], "349");
    expect(m.map((f) => claveValores(f.valores))).toEqual([
      claveValores({ Talla: "M", Color: "Negra" }), claveValores({ Talla: "M", Color: "Blanca" }),
      claveValores({ Talla: "G", Color: "Negra" }), claveValores({ Talla: "G", Color: "Blanca" }),
    ]);
    expect(m.every((f) => f.precio === "349" && f.activa && f.generar_codigo)).toBe(true);
  });
  it("conserva las existentes y desactiva las que ya no caben", () => {
    const vieja: FilaVariante = { id: "x", valores: { Talla: "CH" }, codigo_interno: "A", codigo_barras: "200", generar_codigo: false,
      precio: "300", costo: "", existencia_inicial: "", activa: true };
    const sigue: FilaVariante = { ...vieja, id: "y", valores: { Talla: "M" }, precio: "310" };
    const m = armarMatriz([{ nombre: "Talla", valores: ["M", "G"] }], [vieja, sigue], "349");
    expect(m.find((f) => f.id === "y")?.precio).toBe("310");
    expect(m.find((f) => f.valores.Talla === "G")?.id).toBeUndefined();
    expect(m.at(-1)).toMatchObject({ id: "x", activa: false });
  });
  it("compara los valores sin importar mayúsculas", () => {
    const f: FilaVariante = { id: "x", valores: { Talla: "M" }, codigo_interno: "A", codigo_barras: "", generar_codigo: false,
      precio: "300", costo: "", existencia_inicial: "", activa: true };
    const m = armarMatriz([{ nombre: "Talla", valores: ["m"] }], [f], "349");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: "x", activa: true, valores: { Talla: "M" } });
  });
  it("una existente inactiva cuyos valores siguen en los ejes se queda inactiva", () => {
    const f: FilaVariante = { id: "x", valores: { Talla: "M" }, codigo_interno: "A", codigo_barras: "", generar_codigo: false,
      precio: "300", costo: "", existencia_inicial: "", activa: false };
    const m = armarMatriz([{ nombre: "Talla", valores: ["M", "G"] }], [f], "349");
    expect(m.find((r) => r.id === "x")?.activa).toBe(false);
    expect(m.find((r) => !r.id)?.activa).toBe(true);
  });
  it("detecta precio, costo o existencia inválidos solo en filas activas", () => {
    const f: FilaVariante = { valores: { Talla: "M" }, codigo_interno: "", codigo_barras: "", generar_codigo: true,
      precio: "349", costo: "", existencia_inicial: "", activa: true };
    expect(filaConDatoInvalido([f])).toBeNull();
    expect(filaConDatoInvalido([{ ...f, precio: "0" }])).toBeNull();
    for (const precio of ["", "  ", "abc", "-1"]) expect(filaConDatoInvalido([{ ...f, precio }])?.campo).toBe("Precio");
    expect(filaConDatoInvalido([{ ...f, costo: "x" }])?.campo).toBe("Costo");
    expect(filaConDatoInvalido([{ ...f, costo: "12.5" }])).toBeNull();
    expect(filaConDatoInvalido([{ ...f, existencia_inicial: "-2" }])?.campo).toBe("Existencia");
    expect(filaConDatoInvalido([{ ...f, id: "x", existencia_inicial: "-2" }])).toBeNull();
    expect(filaConDatoInvalido([{ ...f, precio: "", activa: false }])).toBeNull();
  });
});
