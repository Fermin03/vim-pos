// «Tus datos» por pantallas (pasos.ts) y la propina de «otro monto» (pago.ts, cliente.ts, envio.ts).
import { describe, expect, it } from "vitest";
import { FORMULARIO_VACIO, datosDelPedido } from "../cliente";
import type { Pago } from "../contrato";
import { desenlaceDelError, intentoDeCompra } from "../envio";
import { leerOtroMonto, type PropinaElegida } from "../pago";
import { accionDe, avanzar, pasoDelDesenlace, pasosDe, type Paso } from "../pasos";
import { ID } from "./datos";

const DOS: Paso[] = ["datos", "tarjeta"], UNA: Paso[] = ["datos"];

describe("qué pantallas hay", () => {
  it("se paga al recibir (o no hay formas de pago): una sola pantalla, con todo", () => {
    expect(pasosDe("EFECTIVO")).toEqual(UNA);
    expect(pasosDe("TARJETA")).toEqual(UNA);
    expect(pasosDe(null)).toEqual(UNA);
  });
  it("paga en línea: la de los datos y la de la tarjeta", () => {
    expect(pasosDe("EN_LINEA")).toEqual(DOS);
  });
});

describe("qué hace el botón principal de cada pantalla", () => {
  it("al recibir: «Enviar pedido» desde la primera", () => {
    expect(accionDe(UNA, "datos", "EFECTIVO")).toBe("enviar");
    expect(accionDe(UNA, "datos", "TARJETA")).toBe("enviar");
  });
  it("en línea: «Ir a pagar» y luego «Pagar»", () => {
    expect(accionDe(DOS, "datos", "EN_LINEA")).toBe("ir-a-pagar");
    expect(accionDe(DOS, "tarjeta", "EN_LINEA")).toBe("pagar");
  });
});

describe("el toque en el botón principal", () => {
  const base = { pasos: DOS, paso: "datos" as Paso, primerError: undefined, enLinea: true, propina: 10 as PropinaElegida, otroValido: false, yaPreguntada: false };
  it("un dato del cliente con error manda a ese campo, desde cualquier pantalla", () => {
    for (const paso of DOS) expect(avanzar({ ...base, paso, primerError: "email" })).toEqual({ tipo: "campo", campo: "email" });
  });
  it("«Ir a pagar» sin haber elegido propina pregunta UNA vez", () => {
    expect(avanzar({ ...base, propina: null })).toEqual({ tipo: "preguntar" });
    // Regresó y vuelve a avanzar sin haber contestado: ya no se repite.
    expect(avanzar({ ...base, propina: null, yaPreguntada: true })).toEqual({ tipo: "paso", paso: "tarjeta" });
  });
  it("«Sin propina» elegida a propósito, o un porcentaje, no pregunta", () => {
    for (const propina of [0, 10, 15, 20] as const) expect(avanzar({ ...base, propina })).toEqual({ tipo: "paso", paso: "tarjeta" });
  });
  it("«Otro monto» que no vale no avanza; el que vale, sí", () => {
    expect(avanzar({ ...base, propina: "otro" })).toEqual({ tipo: "otro-monto" });
    expect(avanzar({ ...base, propina: "otro", otroValido: true })).toEqual({ tipo: "paso", paso: "tarjeta" });
    // En la última pantalla también se mira: el total pudo cambiar y dejarlo por encima del tope.
    expect(avanzar({ ...base, paso: "tarjeta", propina: "otro" })).toEqual({ tipo: "otro-monto" });
  });
  it("la última pantalla envía; en la tarjeta nunca se pregunta la propina", () => {
    expect(avanzar({ ...base, paso: "tarjeta", propina: null })).toEqual({ tipo: "enviar" });
    expect(avanzar({ ...base, pasos: UNA, enLinea: false, propina: null })).toEqual({ tipo: "enviar" });
  });
  it("al recibir no importa la propina que haya quedado de antes", () => {
    expect(avanzar({ ...base, pasos: UNA, enLinea: false, propina: "otro" })).toEqual({ tipo: "enviar" });
  });
});

describe("a qué pantalla regresa cada respuesta del servidor", () => {
  const c = { telefono: "4771234567", horario: {}, otrasFormas: true };
  const de = (error: string, detalle: string | null = null, pasos: Paso[] = DOS) => pasoDelDesenlace(desenlaceDelError({ error, detalle }, c), pasos);
  it("los datos del cliente, la dirección y la forma de pago viven en la primera", () => {
    expect(de("CLIENTE_INVALIDO")).toBe("datos");
    expect(de("DIRECCION_INVALIDA")).toBe("datos");
    expect(de("PAGO_INVALIDO")).toBe("datos");
    expect(de("PAGO_NO_DISPONIBLE")).toBe("datos");
    expect(de("PAGO_INVALIDO", null, UNA)).toBe("datos");
  });
  it("lo que dijo el banco, en la tarjeta", () => {
    expect(de("PAGO_RECHAZADO", "FONDOS")).toBe("tarjeta");
    expect(de("PAGO_NO_PROCESADO")).toBe("tarjeta");
  });
  it("lo demás no mueve de pantalla: el aviso sale encima del botón (o es del carrito)", () => {
    for (const error of ["TOTAL_CAMBIO", "TIENDA_CERRADA", "SESION_INVALIDA", "SIN_CONFIRMAR", "CAPTCHA_INVALIDO", "NO_SE_PUDO_CREAR", "ZONA_INVALIDA", "PRODUCTO_NO_DISPONIBLE"]) {
      expect(de(error, error === "TOTAL_CAMBIO" ? "310.00" : ID.hamburguesa), error).toBeNull();
    }
  });
});

describe("la propina de «otro monto»", () => {
  it("lo escrito sale como importe con dos decimales", () => {
    expect(leerOtroMonto("25", "240.00")).toEqual({ ok: true, monto: "25.00" });
    expect(leerOtroMonto("25.5", "240.00")).toEqual({ ok: true, monto: "25.50" });
    expect(leerOtroMonto(" $ 25.05 ", "240.00")).toEqual({ ok: true, monto: "25.05" });
    expect(leerOtroMonto("0.01", "240.00")).toEqual({ ok: true, monto: "0.01" });
    // La coma decimal de algunos teclados.
    expect(leerOtroMonto("12,5", "240.00")).toEqual({ ok: true, monto: "12.50" });
    // El clásico que el flotante da mal: 19.99 son 1999 centavos, ni uno menos.
    expect(leerOtroMonto("19.99", "240.00")).toEqual({ ok: true, monto: "19.99" });
  });
  it("el tope es el subtotal de los productos: justo ese pasa, un centavo más no", () => {
    expect(leerOtroMonto("240", "240.00")).toEqual({ ok: true, monto: "240.00" });
    const r = leerOtroMonto("240.01", "240.00");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("$240.00");
  });
  it("vacío, cero, negativo o que no es un monto: dice qué hacer", () => {
    for (const mal of ["", "   ", "0", "0.00", "-5", "abc", "1.234", "1,250.00", "1e3", "12.", ".5", "1234567"]) {
      const r = leerOtroMonto(mal, "240.00");
      expect(r.ok, mal).toBe(false);
      expect(!r.ok && r.error.length > 10, mal).toBe(true);
    }
  });
  it("sin subtotal a la mano no se mide el tope aquí (lo mide el servidor), pero sí lo demás", () => {
    expect(leerOtroMonto("500", null)).toEqual({ ok: true, monto: "500.00" });
    expect(leerOtroMonto("0", null).ok).toBe(false);
  });
});

describe("el cuerpo del pedido y la clave del intento, con «otro monto»", () => {
  const f = { ...FORMULARIO_VACIO, nombre: "Ana", telefono: "4771112233", email: "ana@example.com" };
  it("viaja como `propina_mxn`, EN LUGAR del porcentaje, y solo al pagar en línea", () => {
    const d = datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA", propina: 15, propinaMxn: "33.50" });
    expect(d.propina_mxn).toBe("33.50");
    expect("propina_pct" in d).toBe(false);
    // Con porcentaje, como siempre: sin la clave del monto.
    expect("propina_mxn" in datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA", propina: 15 })).toBe(false);
    for (const pago of ["EFECTIVO", "TARJETA"] as Pago[]) {
      const alRecibir = datosDelPedido(f, { modo: "RECOGER", pago, propinaMxn: "33.50" });
      expect("propina_mxn" in alRecibir || "propina_pct" in alRecibir).toBe(false);
    }
  });
  it("el monto libre entra en la huella del intento: otro monto, otra clave; el mismo, la misma", () => {
    let n = 0;
    const intento = intentoDeCompra(() => `clave-${++n}`, () => null);
    const pedido = (c: { propina?: 0 | 10 | 15 | 20; propinaMxn?: string }) =>
      ({ negocio: "knockout", items: [{ producto_id: ID.hamburguesa, cantidad: 1 }], ...datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA", ...c }) });
    const a = intento.para(pedido({ propinaMxn: "25.00" }));
    expect(intento.para(pedido({ propinaMxn: "25.00" }))).toBe(a);       // reintento del mismo pedido
    const b = intento.para(pedido({ propinaMxn: "30.00" }));             // cambió el monto
    expect(b).not.toBe(a);
    const c = intento.para(pedido({ propina: 10 }));                     // de monto a porcentaje
    expect(c).not.toBe(b);
    // 10 % de algo y «otro monto» de lo mismo no son el mismo pedido para la clave: viajan distinto.
    expect(intento.para(pedido({ propinaMxn: "24.00" }))).not.toBe(c);
  });
  it("en duda, la clave no cambia aunque se toque el otro monto", () => {
    let n = 0;
    const intento = intentoDeCompra(() => `clave-${++n}`, () => null);
    const pedido = (propinaMxn: string) => ({ negocio: "knockout", ...datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA", propinaMxn }) });
    const a = intento.para(pedido("25.00"));
    intento.dudar();
    expect(intento.para(pedido("99.00"))).toBe(a);
  });
});
