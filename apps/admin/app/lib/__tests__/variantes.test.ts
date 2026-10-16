import { describe, expect, it } from "vitest";
import { armarMatriz, claveValores, parsearValoresEje, type FilaVariante } from "../variantes";

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
});
