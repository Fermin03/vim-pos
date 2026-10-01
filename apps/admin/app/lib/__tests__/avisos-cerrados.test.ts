import { describe, expect, it } from "vitest";
import { cerrarAviso, leerCerrados } from "../avisos-cerrados";

function almacen(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k: string) => datos[k] ?? null,
    setItem: (k: string, v: string) => { datos[k] = v; },
  };
}

describe("avisos cerrados", () => {
  it("recuerda el aviso cerrado y no los demás", () => {
    const a = almacen();
    cerrarAviso(a, "sello:POR_VENCER:2026-12-01");
    expect(leerCerrados(a)).toContain("sello:POR_VENCER:2026-12-01");
    // La etapa siguiente es otra clave: vuelve a salir.
    expect(leerCerrados(a)).not.toContain("sello:URGENTE:2026-12-01");
  });

  it("cerrar dos veces el mismo no lo duplica, y la lista tiene tope", () => {
    const a = almacen();
    cerrarAviso(a, "x");
    cerrarAviso(a, "x");
    expect(leerCerrados(a)).toEqual(["x"]);
    for (let i = 0; i < 80; i++) cerrarAviso(a, `aviso-${i}`);
    expect(leerCerrados(a).length).toBe(60);
    expect(leerCerrados(a)).toContain("aviso-79");
  });

  it("aguanta almacenamiento roto, ausente o que lanza", () => {
    expect(leerCerrados(almacen({ "vim.admin.avisos-cerrados": "{no es json" }))).toEqual([]);
    expect(leerCerrados(almacen({ "vim.admin.avisos-cerrados": '{"a":1}' }))).toEqual([]);
    expect(leerCerrados(null)).toEqual([]);
    const lanza = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(leerCerrados(lanza)).toEqual([]);
    expect(cerrarAviso(lanza, "x")).toEqual(["x"]);
  });
});
