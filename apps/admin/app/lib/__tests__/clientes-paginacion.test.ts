import { describe, it, expect } from "vitest";
import { filtroBusqueda, paginasTotales, rangoPagina, textoRango, ticketPromedio } from "../clientes-paginacion";

describe("paginación de clientes", () => {
  it("rangoPagina da el rango inclusivo que pide PostgREST", () => {
    expect(rangoPagina(1, 50)).toEqual({ desde: 0, hasta: 49 });
    expect(rangoPagina(3, 50)).toEqual({ desde: 100, hasta: 149 });
  });

  it("paginasTotales nunca baja de 1 (una lista vacía sigue siendo la página 1)", () => {
    expect(paginasTotales(0, 50)).toBe(1);
    expect(paginasTotales(50, 50)).toBe(1);
    expect(paginasTotales(51, 50)).toBe(2);
    expect(paginasTotales(222, 50)).toBe(5);
  });

  it("textoRango recorta la última página al total real", () => {
    expect(textoRango(1, 50, 222)).toBe("1–50 de 222");
    expect(textoRango(5, 50, 222)).toBe("201–222 de 222");
    expect(textoRango(1, 50, 0)).toBe("0 de 0");
  });
});

describe("búsqueda de clientes", () => {
  it("busca el término en nombre, apellido, teléfono, RFC y correo", () => {
    expect(filtroBusqueda("Juan")).toBe(
      "nombre.ilike.%Juan%,apellido_paterno.ilike.%Juan%,telefono.ilike.%Juan%,rfc.ilike.%Juan%,email.ilike.%Juan%",
    );
  });

  it("vacío o solo espacios no filtra", () => {
    expect(filtroBusqueda("")).toBeNull();
    expect(filtroBusqueda("   ")).toBeNull();
  });

  it("neutraliza los caracteres que rompen la sintaxis del filtro .or() de PostgREST", () => {
    // Una coma o un paréntesis en el término partían el filtro en condiciones ajenas.
    const f = filtroBusqueda("a,b)(c%d*e\\f") ?? "";
    expect(f.startsWith("nombre.ilike.%a b  c d e f%,")).toBe(true);
    expect(f.split(",")).toHaveLength(5);
  });
});

describe("ticket promedio", () => {
  it("es gasto entre compras del padrón, y 0 si nadie ha comprado", () => {
    expect(ticketPromedio(1000, 8)).toBe(125);
    expect(ticketPromedio(0, 0)).toBe(0);
  });
});
