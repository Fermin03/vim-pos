// «Tus datos»: las reglas de cada campo (las mismas que la función), el cuerpo que sale del
// formulario y lo que se recuerda en el teléfono.
import { describe, expect, it } from "vitest";
import {
  CAMPOS, CLAVE_DEL_CLIENTE, FORMULARIO_VACIO, datosDelPedido, errorDeCampo, erroresDe, formasDePago, guardarCliente, leerCliente, olvidarCliente,
  type Contexto, type Formulario,
} from "../cliente";

const aDomicilio: Contexto = { modo: "DOMICILIO", pago: "EFECTIVO", total: 30500 };
const alRecoger: Contexto = { modo: "RECOGER", pago: "EFECTIVO", total: 30500 };
const lleno: Formulario = {
  nombre: " Ana López ", telefono: "477 123 4567", email: " Ana@Correo.com ",
  calle: "Madero", numeroExterior: "12", numeroInterior: "", colonia: "Centro", codigoPostal: "37000", ciudad: "León", estado: "Guanajuato", referencias: "",
  pagaCon: "",
};

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
  };
}

describe("errorDeCampo", () => {
  it("nombre y teléfono son obligatorios; el correo no", () => {
    expect(errorDeCampo("nombre", "  ", alRecoger)).toBe("Escribe tu nombre.");
    expect(errorDeCampo("telefono", "", alRecoger)).toBe("Escribe tu teléfono.");
    expect(errorDeCampo("email", "", alRecoger)).toBeNull();
  });
  it("el teléfono se juzga como en la función: 10 dígitos, con adornos, sin letras", () => {
    for (const bien of ["4771234567", "477 123 4567", "+52 (477) 123-4567", "5214771234567"]) expect(errorDeCampo("telefono", bien, alRecoger), bien).toBeNull();
    for (const mal of ["477123456", "0771234567", "477 123 4567 ext 2", "47712345678"]) expect(errorDeCampo("telefono", mal, alRecoger), mal).toContain("10 dígitos");
  });
  it("el correo: completo y solo con caracteres simples", () => {
    expect(errorDeCampo("email", "ana@correo.com", alRecoger)).toBeNull();
    for (const mal of ["ana@correo", "ana correo.com", "añá@correo.com", `${"a".repeat(250)}@b.com`]) expect(errorDeCampo("email", mal, alRecoger), mal).not.toBeNull();
  });
  it("la dirección solo se revisa a domicilio", () => {
    expect(errorDeCampo("calle", "", alRecoger)).toBeNull();
    expect(errorDeCampo("calle", "", aDomicilio)).toBe("Escribe tu calle.");
    expect(errorDeCampo("numeroInterior", "", aDomicilio)).toBeNull();
    expect(errorDeCampo("referencias", "", aDomicilio)).toBeNull();
  });
  it("el código postal son 5 dígitos exactos", () => {
    expect(errorDeCampo("codigoPostal", "37000", aDomicilio)).toBeNull();
    for (const mal of ["3700", "370000", "37 000", "3700a"]) expect(errorDeCampo("codigoPostal", mal, aDomicilio), mal).toBe("El código postal tiene 5 dígitos.");
    expect(errorDeCampo("codigoPostal", "", aDomicilio)).toBe("Escribe tu código postal.");
  });
  it("los topes del anexo §1.9, contados en caracteres", () => {
    expect(errorDeCampo("nombre", "a".repeat(100), alRecoger)).toBeNull();
    expect(errorDeCampo("nombre", "a".repeat(101), alRecoger)).toContain("100");
    expect(errorDeCampo("numeroExterior", "1".repeat(21), aDomicilio)).toContain("20");
    expect(errorDeCampo("estado", "a".repeat(51), aDomicilio)).toContain("50");
    expect(errorDeCampo("referencias", "😀".repeat(300), aDomicilio)).toBeNull();
    expect(errorDeCampo("referencias", "a".repeat(301), aDomicilio)).toContain("300");
  });
  it("«¿Con cuánto pagas?»: opcional, entre el total y el total + $5,000", () => {
    expect(errorDeCampo("pagaCon", "", aDomicilio)).toBeNull();
    expect(errorDeCampo("pagaCon", "305", aDomicilio)).toBeNull();
    expect(errorDeCampo("pagaCon", "$5,305.00", aDomicilio)).toBeNull();
    expect(errorDeCampo("pagaCon", "304.99", aDomicilio)).toContain("$305.00");
    expect(errorDeCampo("pagaCon", "5305.01", aDomicilio)).toContain("$5,305.00");
    expect(errorDeCampo("pagaCon", "quinientos", aDomicilio)).toContain("por ejemplo 500");
  });
  it("con tarjeta no se revisa con cuánto paga; sin total, solo que sea una cantidad", () => {
    expect(errorDeCampo("pagaCon", "1", { ...aDomicilio, pago: "TARJETA" })).toBeNull();
    expect(errorDeCampo("pagaCon", "1", { ...aDomicilio, total: null })).toBeNull();
    expect(errorDeCampo("pagaCon", "x", { ...aDomicilio, total: null })).not.toBeNull();
  });
});

describe("erroresDe", () => {
  it("un formulario bien lleno no tiene errores", () => {
    expect(erroresDe(lleno, aDomicilio)).toEqual({});
  });
  it("salen en el orden de la pantalla: el primero es el primer campo que corregir", () => {
    const e = erroresDe(FORMULARIO_VACIO, aDomicilio);
    expect(Object.keys(e)).toEqual(["nombre", "telefono", "calle", "numeroExterior", "colonia", "codigoPostal", "ciudad", "estado"]);
    expect(Object.keys(erroresDe(FORMULARIO_VACIO, alRecoger))).toEqual(["nombre", "telefono"]);
    expect(CAMPOS[0]).toBe("nombre");
  });
});

describe("formasDePago", () => {
  it("solo las que el negocio tiene encendidas", () => {
    expect(formasDePago({ pago_efectivo: true, pago_tarjeta: true })).toEqual(["EFECTIVO", "TARJETA"]);
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: true })).toEqual(["TARJETA"]);
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: false })).toEqual([]);
  });
});

describe("datosDelPedido", () => {
  it("a domicilio: limpio, teléfono en 10 dígitos, correo en minúsculas y vacíos en null", () => {
    expect(datosDelPedido({ ...lleno, pagaCon: "500" }, { modo: "DOMICILIO", pago: "EFECTIVO" })).toEqual({
      cliente: { nombre: "Ana López", telefono: "4771234567", email: "ana@correo.com" },
      direccion: { calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null },
      pago: "EFECTIVO", paga_con: "500.00",
    });
  });
  it("al recoger la dirección va en null aunque haya una escrita de antes", () => {
    expect(datosDelPedido(lleno, { modo: "RECOGER", pago: "EFECTIVO" }).direccion).toBeNull();
  });
  it("con tarjeta nunca viaja con cuánto paga; sin correo, null", () => {
    const d = datosDelPedido({ ...lleno, email: "", pagaCon: "500" }, { modo: "RECOGER", pago: "TARJETA" });
    expect(d.paga_con).toBeNull();
    expect(d.cliente.email).toBeNull();
  });
});

describe("lo que se recuerda en el teléfono", () => {
  it("guarda nombre, teléfono, correo y dirección; nunca con cuánto paga", () => {
    const a = almacen();
    guardarCliente({ ...lleno, pagaCon: "500" }, "DOMICILIO", a);
    const crudo = a.datos.get(CLAVE_DEL_CLIENTE)!;
    expect(CLAVE_DEL_CLIENTE).toBe("vim.tienda.cliente");
    expect(crudo).not.toContain("500");
    expect(crudo).not.toContain("pagaCon");
    expect(leerCliente(a)).toEqual({ nombre: "Ana López", telefono: "477 123 4567", email: "Ana@Correo.com", calle: "Madero", numeroExterior: "12", colonia: "Centro", codigoPostal: "37000", ciudad: "León", estado: "Guanajuato" });
  });
  it("un pedido para recoger no borra la dirección de antes ni guarda la que no se usó", () => {
    const a = almacen();
    guardarCliente(lleno, "DOMICILIO", a);
    guardarCliente({ ...lleno, nombre: "Ana L.", calle: "Otra que no se envió" }, "RECOGER", a);
    expect(leerCliente(a)).toMatchObject({ nombre: "Ana L.", calle: "Madero", codigoPostal: "37000" });
    const b = almacen();
    guardarCliente(lleno, "RECOGER", b);
    expect(leerCliente(b)).toEqual({ nombre: "Ana López", telefono: "477 123 4567", email: "Ana@Correo.com" });
  });
  it("lo que no se entiende se descarta y se borra; un texto de más se recorta", () => {
    for (const basura of ["{", "[]", `{"v":2,"nombre":"Ana"}`, `"hola"`]) {
      const a = almacen({ [CLAVE_DEL_CLIENTE]: basura });
      expect(leerCliente(a), basura).toBeNull();
      expect(a.datos.has(CLAVE_DEL_CLIENTE), basura).toBe(false);
    }
    const a = almacen({ [CLAVE_DEL_CLIENTE]: JSON.stringify({ v: 1, nombre: "a".repeat(500), telefono: 4771234567, codigo: "secreto" }) });
    expect(leerCliente(a)).toEqual({ nombre: "a".repeat(100) });
  });
  it("olvidar borra; sin almacén o con uno que falla, nada truena", () => {
    const a = almacen();
    guardarCliente(lleno, "DOMICILIO", a);
    olvidarCliente(a);
    expect(leerCliente(a)).toBeNull();
    const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(leerCliente(roto)).toBeNull();
    expect(() => { guardarCliente(lleno, "DOMICILIO", roto); olvidarCliente(roto); guardarCliente(lleno, "RECOGER", null); }).not.toThrow();
    expect(leerCliente(null)).toBeNull();
  });
});
