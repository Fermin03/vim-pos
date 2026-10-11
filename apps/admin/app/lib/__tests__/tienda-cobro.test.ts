import { describe, expect, it } from "vitest";
import { avisoDeCobro, cuentaQueCobra, estadoDePago, hayQueElegir, textoDeAviso } from "../tienda-cobro";

const A = { id: "a", cuenta_nombre: "Knock-Out León", estado: "ACTIVA" as const };
const B = { id: "b", cuenta_nombre: "Knock-Out Norte", estado: "ACTIVA" as const };
const ROTA = { id: "r", cuenta_nombre: "Vieja", estado: "ERROR" as const };
const suc = (nombre: string, conexionId: string | null = null, participa = true) => ({ nombre, participa, conexionId });

describe("qué cuenta cobra en una sucursal (espejo de tienda_conexion_cobro)", () => {
  it("sin elegir cobra la única activa; una en error no cuenta", () => {
    expect(cuentaQueCobra([A], null)).toBe(A);
    expect(cuentaQueCobra([A, ROTA], null)).toBe(A);
    expect(cuentaQueCobra([ROTA], null)).toBeNull();
    expect(cuentaQueCobra([], null)).toBeNull();
  });
  it("con varias activas y sin elegir, ninguna: no se adivina a quién le cae el dinero", () => {
    expect(cuentaQueCobra([A, B], null)).toBeNull();
    expect(cuentaQueCobra([A, B], "b")).toBe(B);
  });
  it("si la elegida dejó de servir no se usa otra, aunque haya una activa", () => {
    expect(cuentaQueCobra([A, ROTA], "r")).toBeNull();
    expect(cuentaQueCobra([A], "desconectada")).toBeNull();
  });
});

describe("cuándo se enseña el selector por sucursal", () => {
  it("con una sola cuenta no hace falta; con varias sí", () => {
    expect(hayQueElegir([A], [suc("Centro")])).toBe(false);
    expect(hayQueElegir([A, ROTA], [suc("Centro")])).toBe(false);
    expect(hayQueElegir([A, B], [suc("Centro")])).toBe(true);
  });
  it("con una sola, también si una sucursal que participa quedó apuntando a otra", () => {
    expect(hayQueElegir([A], [suc("Centro", "a")])).toBe(false);
    expect(hayQueElegir([A], [suc("Centro", "vieja")])).toBe(true);
    expect(hayQueElegir([A], [suc("Centro", "vieja", false)])).toBe(false);
    expect(hayQueElegir([], [suc("Centro", "vieja")])).toBe(false);
  });
});

describe("el aviso de arriba", () => {
  it("sin pago en línea encendido no se avisa de nada", () => {
    expect(avisoDeCobro(false, [], [suc("Centro")])).toBeNull();
    expect(avisoDeCobro(false, [ROTA], [suc("Centro")])).toBeNull();
  });
  it("todo en orden: una cuenta activa, o varias con cada sucursal elegida", () => {
    expect(avisoDeCobro(true, [A], [suc("Centro")])).toBeNull();
    expect(avisoDeCobro(true, [A, B], [suc("Centro", "a"), suc("Norte", "b"), suc("Sur", null, false)])).toBeNull();
  });
  it("la cuenta pasó a error: reconectar", () => {
    expect(avisoDeCobro(true, [ROTA], [suc("Centro")])).toEqual({ tipo: "RECONECTAR", sucursales: [] });
  });
  it("la cuenta se desconectó (ya no se lee ninguna): conectar", () => {
    expect(avisoDeCobro(true, [], [suc("Centro")])).toEqual({ tipo: "CONECTAR", sucursales: [] });
  });
  it("la cuenta de UNA sucursal pasó a error: reconectar, y dice cuál", () => {
    expect(avisoDeCobro(true, [A, ROTA], [suc("Centro", "a"), suc("Norte", "r")])).toEqual({ tipo: "RECONECTAR", sucursales: ["Norte"] });
  });
  it("varias cuentas y sucursales sin elegir, o con la elegida desconectada: elegir", () => {
    expect(avisoDeCobro(true, [A, B], [suc("Centro", "a"), suc("Norte"), suc("Sur", "desconectada"), suc("Fuera", null, false)]))
      .toEqual({ tipo: "ELEGIR", sucursales: ["Norte", "Sur"] });
  });
  it("el texto dice qué pasa y qué hacer, y nombra las sucursales", () => {
    expect(textoDeAviso({ tipo: "RECONECTAR", sucursales: [] })).toMatch(/^Tu tienda no está ofreciendo el pago en línea.*Reconéctala/);
    expect(textoDeAviso({ tipo: "CONECTAR", sucursales: [] })).toMatch(/ya no hay una cuenta.*Conéctala/);
    expect(textoDeAviso({ tipo: "ELEGIR", sucursales: ["Norte", "Sur", "Este"] })).toMatch(/^En Norte, Sur y Este tu tienda.*falta elegir/);
  });
});

describe("el estado de un pago en palabras", () => {
  it("pagado, devuelto, devolución en proceso y no completado", () => {
    expect(estadoDePago("APROBADO")).toBe("Pagado");
    expect(estadoDePago("DEVUELTO")).toBe("Devuelto");
    expect(estadoDePago("POR_DEVOLVER")).toBe("Devolución en proceso");
    // Una devolución que falló se sigue reintentando: para el dueño sigue en proceso.
    expect(estadoDePago("DEVOLUCION_FALLIDA")).toBe("Devolución en proceso");
    for (const e of ["CREADO", "RECHAZADO", "VENCIDO", "ALGO_NUEVO"]) expect(estadoDePago(e)).toBe("No completado");
  });
});
