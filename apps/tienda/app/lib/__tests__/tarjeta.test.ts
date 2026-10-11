// La tarjeta al pagar en línea: lo que se acepta de la librería de Mercado Pago, los errores por
// campo en palabras del cliente y lo que sale hacia el servidor (un token, nunca la tarjeta).
import { describe, expect, it } from "vitest";
import {
  bancoDe, CAMPOS_SIN_TOCAR, dispositivoDe, errorDeToken, erroresDeTarjeta, marcaDe, primerError, textoSinFormulario, tipoAceptado, tokenDe,
  type EstadoDeCampos, type MarcaDeTarjeta,
} from "../tarjeta";

// Con la forma de lo que devuelve mp.getPaymentMethods({ bin }) (documentación de Core Methods).
const MASTER = { results: [{ id: "master", name: "Mastercard", payment_type_id: "credit_card", issuer: { id: 160, name: "Banco" }, additional_info_needed: ["cardholder_name"] }] };
const VISA_DEBITO: MarcaDeTarjeta = { payment_method_id: "debvisa", issuer_id: "158", tipo: "debit_card", nombre: "Visa Débito", pideBanco: false };
const LISTOS: EstadoDeCampos = {
  numero: { listo: true, error: false, tocado: true }, vence: { listo: true, error: false, tocado: true }, codigo: { listo: true, error: false, tocado: true },
};

describe("la marca de la tarjeta", () => {
  it("sale de los primeros dígitos: marca, banco y si es crédito o débito", () => {
    expect(marcaDe(MASTER)).toEqual({ payment_method_id: "master", issuer_id: "160", tipo: "credit_card", nombre: "Mastercard", pideBanco: false });
  });
  it("sin banco en la respuesta queda null, y se sabe si hay que pedirlo", () => {
    const m = marcaDe({ results: [{ id: "visa", payment_type_id: "credit_card", additional_info_needed: ["issuer_id"] }] });
    expect(m).toMatchObject({ payment_method_id: "visa", issuer_id: null, pideBanco: true });
  });
  it("lo que no tiene la forma no es una marca", () => {
    for (const raro of [null, undefined, {}, { results: [] }, { results: [{}] }, { results: [{ id: "VISA <b>" }] }, { results: "x" }, []]) expect(marcaDe(raro)).toBeNull();
  });
  it("el banco: solo si la librería devuelve uno; con varios no se adivina", () => {
    expect(bancoDe([{ id: 160 }])).toBe("160");
    expect(bancoDe([{ id: "24" }])).toBe("24");
    expect(bancoDe([{ id: 1 }, { id: 2 }])).toBeNull();
    for (const raro of [null, [], [{ id: "abc" }], [{}], { id: 1 }]) expect(bancoDe(raro)).toBeNull();
  });
  it("solo crédito y débito", () => {
    expect(tipoAceptado("credit_card")).toBe(true);
    expect(tipoAceptado("debit_card")).toBe(true);
    for (const no of ["prepaid_card", "ticket", "account_money", "", "atm"]) expect(tipoAceptado(no)).toBe(false);
  });
});

describe("lo que sale hacia el servidor", () => {
  it("el token: solo con su forma (letras y números); nunca algo que parezca otra cosa", () => {
    expect(tokenDe({ id: "ff8080814c11e237014c1ff593b57b4d" })).toBe("ff8080814c11e237014c1ff593b57b4d");
    for (const raro of [null, {}, { id: "" }, { id: "corto" }, { id: 4111111111111111 }, { id: "con espacio 0123456789abcdef" }, { id: "x".repeat(65) }, "ff8080814c11e237014c1ff593b57b4d"]) expect(tokenDe(raro)).toBeNull();
  });
  it("el Device ID: con forma se manda; sin ella, no (y no estorba)", () => {
    expect(dispositivoDe("armor.1a2b3c4d5e6f")).toBe("armor.1a2b3c4d5e6f");
    for (const raro of [undefined, null, "", "corto", "<script>alert(1)</script>", 12345678, "x".repeat(121)]) expect(dispositivoDe(raro)).toBeNull();
  });
});

describe("los errores de la tarjeta, por campo", () => {
  it("mientras escribe no se le reclama lo que todavía no toca", () => {
    expect(erroresDeTarjeta({ campos: CAMPOS_SIN_TOCAR, titular: "", marca: null, alEnviar: false })).toEqual({});
  });
  it("lo que la librería marca mal en un campo ya tocado se dice ahí", () => {
    const campos = { ...CAMPOS_SIN_TOCAR, vence: { listo: false, error: true, tocado: true }, codigo: { listo: false, error: true, tocado: false } };
    expect(erroresDeTarjeta({ campos, titular: "", marca: null, alEnviar: false })).toEqual({ vence: "Revisa la fecha de vencimiento." });
  });
  it("al intentar pagar, lo vacío también es un error, y cada campo dice el suyo", () => {
    expect(erroresDeTarjeta({ campos: CAMPOS_SIN_TOCAR, titular: " ", marca: null, alEnviar: true })).toEqual({
      numero: "Escribe el número de tu tarjeta.", vence: "Escribe la fecha de vencimiento.", codigo: "Escribe el código de seguridad.",
      titular: "Escribe el nombre como aparece en la tarjeta.",
    });
  });
  it("todo en orden: sin errores", () => {
    expect(erroresDeTarjeta({ campos: LISTOS, titular: "ANA LOPEZ", marca: VISA_DEBITO, alEnviar: true })).toEqual({});
  });
  it("una tarjeta que no es de crédito ni de débito se dice en el número", () => {
    expect(erroresDeTarjeta({ campos: LISTOS, titular: "ANA LOPEZ", marca: { ...VISA_DEBITO, tipo: "prepaid_card" }, alEnviar: true }))
      .toEqual({ numero: "Solo aceptamos tarjetas de crédito y de débito." });
  });
  it("el titular: un nombre, no un número; se reclama al salir del campo o al pagar", () => {
    const con = (titular: string, extra: object = {}) => erroresDeTarjeta({ campos: LISTOS, titular, marca: VISA_DEBITO, alEnviar: false, ...extra }).titular;
    expect(con("")).toBeUndefined();
    expect(con("", { titularTocado: true })).toBeDefined();
    expect(con("A", { alEnviar: true })).toBeDefined();
    expect(con("4111 1111", { alEnviar: true })).toBeDefined();
    expect(con("x".repeat(101), { alEnviar: true })).toBeDefined();
    expect(con("María José Ñáñez", { alEnviar: true })).toBeUndefined();
  });
  it("el foco va al primer error en el orden en que se leen", () => {
    expect(primerError({ codigo: "x", vence: "y" })).toBe("vence");
    expect(primerError({ titular: "x" })).toBe("titular");
    expect(primerError({})).toBeNull();
  });
});

describe("cuando la librería no pudo crear el token", () => {
  it("si señala un campo, el error va a ese campo, en palabras de la tienda", () => {
    expect(errorDeToken([{ field: "securityCode", message: "invalid_length" }])).toEqual({ campo: "codigo", texto: "Revisa el código de seguridad." });
    expect(errorDeToken([{ field: "expirationYear" }])).toMatchObject({ campo: "vence" });
    expect(errorDeToken({ field: "cardNumber" })).toMatchObject({ campo: "numero" });
  });
  it("si no (sin red, la cuenta bloqueada, un código nuevo), un mensaje general; nunca el texto en crudo de la librería", () => {
    for (const raro of [null, undefined, new Error("Network request failed"), [{ code: "160", message: "collector not allowed to operate" }], [{ field: "__proto__" }], "x"]) {
      const t = errorDeToken(raro);
      expect(t).toEqual({ campo: null, texto: "No pudimos leer tu tarjeta. Revisa los datos y vuelve a intentar." });
    }
  });
  it("si el formulario no carga se dice, y con otra forma de pago se ofrece: nunca un formulario muerto", () => {
    expect(textoSinFormulario(true)).toBe("No pudimos cargar el pago con tarjeta. Elige otra forma de pago o vuelve a intentar.");
    expect(textoSinFormulario(false)).toBe("No pudimos cargar el pago con tarjeta. Revisa tu conexión y vuelve a intentar.");
  });
});
