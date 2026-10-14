import { describe, expect, it } from "vitest";
import { avisoDeCobro, cuentaDePrueba, cuentaQueCobra, seDesconectaDesdeElAdmin, estadoDePago, hayQueElegir, sucursalesConCajaSinActualizar, textoDeAviso } from "../tienda-cobro";
import * as cobro from "../tienda-cobro";

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

describe("sucursales con la caja sin actualizar (por lo que la caja DECLARA, no por su número de versión)", () => {
  const s = (id: string, participa = true) => ({ id, nombre: id.toUpperCase(), participa });
  const caja = (sucursal_id: string, declaraPagoEnLinea: boolean, extra: { activa?: boolean; ultimoLatido?: string | null } = {}) =>
    ({ sucursal_id, declaraPagoEnLinea, activa: true, ultimoLatido: "2026-10-11T10:00:00Z", ...extra });
  it("avisa de la sucursal cuyas cajas en uso no declaran el pago en línea; basta una que lo declare para no avisar", () => {
    const cajas = [caja("centro", false), caja("norte", false), caja("norte", true), caja("sur", false), caja("este", true)];
    expect(sucursalesConCajaSinActualizar([s("centro"), s("norte"), s("sur"), s("este")], cajas)).toEqual(["CENTRO", "SUR"]);
  });
  it("no avisa de la que no vende en la tienda, ni de la que no tiene caja instalada en uso", () => {
    const cajas = [caja("fuera", false), caja("web", false, { ultimoLatido: null }), caja("apagada", false, { activa: false })];
    expect(sucursalesConCajaSinActualizar([s("fuera", false), s("web"), s("apagada"), s("sin-cajas")], cajas)).toEqual([]);
  });
  it("la versión no entra en la regla: no hay ningún número que comparar", () => {
    expect(Object.keys(cobro)).not.toContain("CAJA_CON_PAGO_EN_LINEA");
  });
});

describe("una cuenta de prueba (espejo de tienda_conexion_cobro: nunca cobra pedidos reales)", () => {
  const PRUEBA = { id: "p", cuenta_nombre: "Vendedor de prueba", estado: "ACTIVA" as const, de_prueba: true };
  it("no cobra ni siendo la única ni elegida a mano, y el aviso lo dice", () => {
    expect(cuentaQueCobra([PRUEBA], null)).toBeNull();
    expect(cuentaQueCobra([PRUEBA, A], "p")).toBeNull();
    expect(avisoDeCobro(true, [PRUEBA], [suc("Centro")])).toEqual({ tipo: "ELEGIR", sucursales: ["Centro"] });
  });
  it("con una real y una de prueba, sin elegir: la REAL (la de prueba no cuenta para «la única activa»: 0177); y no hay nada que elegir", () => {
    expect(cuentaQueCobra([A, PRUEBA], null)).toBe(A);
    expect(cuentaQueCobra([PRUEBA, A], null)).toBe(A);
    expect(cuentaQueCobra([A, PRUEBA], "a")).toBe(A);
    expect(hayQueElegir([A, PRUEBA], [suc("Centro")])).toBe(false);
    expect(avisoDeCobro(true, [A, PRUEBA], [suc("Centro")])).toBeNull();
    // Con DOS reales (y la de prueba) sigue sin adivinarse: ninguna, y hay que elegir.
    expect(cuentaQueCobra([A, B, PRUEBA], null)).toBeNull();
    expect(hayQueElegir([A, B, PRUEBA], [suc("Centro")])).toBe(true);
  });
  it("la cuenta de prueba no se desconecta desde el admin; una real, sí", () => {
    expect(seDesconectaDesdeElAdmin(PRUEBA)).toBe(false);
    expect(seDesconectaDesdeElAdmin({ ...A, de_prueba: false })).toBe(true);
    expect(seDesconectaDesdeElAdmin({})).toBe(true);
  });
});

describe("una tienda en modo de prueba (espejo de tienda_conexion_cobro, 0177: solo su cuenta de prueba, nunca una real)", () => {
  const PRUEBA = { id: "p", cuenta_nombre: "Cuenta de prueba 3754297554", estado: "ACTIVA" as const, de_prueba: true };
  const PRUEBA2 = { ...PRUEBA, id: "p2" };
  it("cobra la única cuenta de prueba activa, esté o no la real, y elija lo que elija la sucursal", () => {
    expect(cuentaQueCobra([PRUEBA], null, true)).toBe(PRUEBA);
    expect(cuentaQueCobra([A, PRUEBA], null, true)).toBe(PRUEBA);
    expect(cuentaQueCobra([A, PRUEBA], "a", true)).toBe(PRUEBA);
    expect(cuentaDePrueba([A, B, PRUEBA])).toBe(PRUEBA);
  });
  it("sin cuenta de prueba no cobra ninguna: nunca la real, ni siendo la única ni elegida", () => {
    expect(cuentaQueCobra([A], null, true)).toBeNull();
    expect(cuentaQueCobra([A], "a", true)).toBeNull();
    expect(cuentaQueCobra([A, { ...PRUEBA, estado: "ERROR" as const }], "a", true)).toBeNull();
    expect(cuentaQueCobra([], null, true)).toBeNull();
  });
  it("con dos de prueba activas, ninguna", () => {
    expect(cuentaQueCobra([PRUEBA, PRUEBA2], null, true)).toBeNull();
  });
  it("no hay nada que elegir por sucursal, aunque haya varias cuentas", () => {
    expect(hayQueElegir([A, B, PRUEBA], [suc("Centro", "vieja")], true)).toBe(false);
  });
  it("el aviso: nada si la cuenta de prueba está; si falta, dice que la pone VIM y no ofrece conectar", () => {
    expect(avisoDeCobro(true, [A, PRUEBA], [suc("Centro")], true)).toBeNull();
    expect(avisoDeCobro(true, [A], [suc("Centro", "a")], true)).toEqual({ tipo: "PRUEBA", sucursales: [] });
    expect(avisoDeCobro(false, [A], [suc("Centro")], true)).toBeNull();
    const texto = textoDeAviso({ tipo: "PRUEBA", sucursales: [] });
    expect(texto).toMatch(/modo de prueba/);
    expect(texto).toMatch(/La configura VIM/);
    expect(texto).not.toMatch(/Conéctala|Reconéctala/);
  });
  it("sin la marca todo sigue igual: la de prueba no cobra", () => {
    expect(cuentaQueCobra([PRUEBA], null, false)).toBeNull();
    expect(cuentaQueCobra([PRUEBA], null)).toBeNull();
    expect(avisoDeCobro(true, [A], [suc("Centro")], false)).toBeNull();
  });
});
