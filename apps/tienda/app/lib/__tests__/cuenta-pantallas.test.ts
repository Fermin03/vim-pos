// Lo que las pantallas de cuenta DECIDEN sin pintar: a dónde llevan sus enlaces, qué se enseña de una
// dirección o de un pedido, cómo se prellena «Tus datos» y el relevo de «Pedir de nuevo».
import { describe, expect, it } from "vitest";
import type { Almacen } from "../carrito";
import { menuDe, pedidosDe, type Menu, type PedidoDeCuenta } from "../contrato";
import {
  dejarPorRepetir, direccionEnUnaLinea, direccionPorGuardar, enlaceDeAcceso, fechaDeNacimiento, fechaDePedido, formularioDeCuenta,
  formularioDeDireccion, paraTusDatos, rutaDelMenu, textoDeDescartados, pasoDelEnlace, textoDePasswordActual, tomarPorRepetir,
} from "../cuenta";
import { CODIGO, ID, menuCrudo, u } from "./datos";

const DIR = { id: u(500), etiqueta: "Casa", calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro",
              codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null };
const CUENTA = { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "4771112233", fecha_nacimiento: "1990-05-17" };
const menu = menuDe(menuCrudo()) as Menu;
const PEDIDO = pedidosDe({ pedidos: [{
  sucursal_id: ID.sucursal, folio_corto: "TAB12C", recibido_at: "2026-10-08T20:00:00+00:00", modo: "RECOGER", estado: "ENTREGADO", total_mxn: "30.00",
  renglones: [{ nombre: "Refresco", cantidad: 2, detalle: null }],
  items: [{ producto_id: ID.refresco, cantidad: 2 }, { producto_id: u(999), cantidad: 1 }],
}] })![0] as PedidoDeCuenta;

function almacen(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); }, removeItem: (k) => { datos.delete(k); } };
}

describe("enlaces de las pantallas de cuenta", () => {
  it("entrar, registro y recuperar conservan a dónde volver, solo si es de ese negocio", () => {
    expect(enlaceDeAcceso("knockout", "entrar")).toBe("/knockout/entrar");
    expect(enlaceDeAcceso("knockout", "registro", "/knockout")).toBe("/knockout/registro");   // el menú es el destino por omisión: no hace falta decirlo
    expect(enlaceDeAcceso("knockout", "entrar", "/knockout/cuenta")).toBe("/knockout/entrar?volver=%2Fknockout%2Fcuenta");
    expect(enlaceDeAcceso("knockout", "recuperar", `/knockout?s=${ID.sucursal}`)).toBe(`/knockout/recuperar?volver=%2Fknockout%3Fs%3D${ID.sucursal}`);
    for (const malo of ["https://evil.example.com", "//evil.example.com", "/otro/cuenta", "/knockout-2", 5, null, undefined]) {
      expect(enlaceDeAcceso("knockout", "entrar", malo), String(malo)).toBe("/knockout/entrar");
    }
  });
  it("el menú de una sucursal: con una sola no lleva parámetro", () => {
    expect(rutaDelMenu({ slug: "knockout", sucursales: [{ id: u(1) }] }, u(1))).toBe("/knockout");
    expect(rutaDelMenu({ slug: "knockout", sucursales: [{ id: u(1) }, { id: u(2) }] }, u(2))).toBe(`/knockout?s=${u(2)}`);
    expect(rutaDelMenu({ slug: "knockout", sucursales: [{ id: u(1) }, { id: u(2) }] }, null)).toBe("/knockout");
  });
  it("recuperar: el token llega en el fragmento, y solo vale con su forma", () => {
    expect(pasoDelEnlace(`#t=${CODIGO}`)).toEqual({ paso: "nueva", token: CODIGO });
    // Sin `t` no hay enlace: se pide el correo.
    for (const sin of ["", "#", "#otra-cosa", "#x=1", `#${CODIGO}`, undefined, null, 5, [`#t=${CODIGO}`]]) expect(pasoDelEnlace(sin), String(sin)).toEqual({ paso: "pedir" });
    // Con un `t` que no es un token, el enlace no sirve (y no se manda nada a la función).
    for (const roto of ["#t=", "#t=corto", `#t=${CODIGO}x`, `#t=${CODIGO.slice(1)}`, `#t=${CODIGO.slice(0, -1)}%20`, `#t=${CODIGO.slice(0, -1)}.`]) {
      expect(pasoDelEnlace(roto), roto).toEqual({ paso: "invalido" });
    }
  });
});

describe("lo que se dice", () => {
  it("al cambiar la contraseña o eliminar la cuenta, credenciales malas = «la actual no coincide» (sin distinguir un bloqueo)", () => {
    expect(textoDePasswordActual("CREDENCIALES_INVALIDAS")).toBe("La contraseña actual no coincide.");
    expect(textoDePasswordActual("SIN_CONEXION")).toBe("No pudimos conectar. Revisa tu conexión a internet y vuelve a intentar.");
    expect(textoDePasswordActual("UN_CODIGO_NUEVO")).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
  it("lo que ya no entró al pedir de nuevo, con nombre si lo tiene", () => {
    expect(textoDeDescartados([])).toBeNull();
    expect(textoDeDescartados(["Papas"])).toBe("Ya no se puede pedir: Papas.");
    expect(textoDeDescartados(["Papas", "Refresco", "Papas"])).toBe("Ya no se pueden pedir: Papas y Refresco.");
    expect(textoDeDescartados(["Papas", "Refresco", "Malteada"])).toBe("Ya no se pueden pedir: Papas, Refresco y Malteada.");
    expect(textoDeDescartados([null])).toBe("Un producto de ese pedido ya no está en el menú.");
    expect(textoDeDescartados([null, "Papas", null])).toBe("Ya no se puede pedir: Papas. 2 productos de ese pedido ya no están en el menú.");
  });
  it("una dirección en una línea", () => {
    expect(direccionEnUnaLinea(DIR)).toBe("Madero 12, Centro, 37000 León");
    expect(direccionEnUnaLinea({ ...DIR, numero_interior: "B" })).toBe("Madero 12 int. B, Centro, 37000 León");
  });
  it("las fechas, en hora de México y sin depender del reloj del teléfono", () => {
    expect(fechaDePedido("2026-10-08T20:00:00+00:00")).toBe("8 oct, 2:00 p. m.");
    expect(fechaDePedido("2026-10-09T05:30:00+00:00")).toBe("8 oct, 11:30 p. m.");   // en México todavía es día 8
    expect(fechaDePedido("no es una fecha")).toBe("");
    expect(fechaDeNacimiento("1990-05-17")).toBe("17 de mayo de 1990");
    expect(fechaDeNacimiento("1990-01-01")).toBe("1 de enero de 1990");               // no se corre al 31 de diciembre
    expect(fechaDeNacimiento("x")).toBe("");
  });
});

describe("formularios desde lo guardado", () => {
  it("la cuenta → «Mis datos» y → lo que prellena «Tus datos» (nombre completo)", () => {
    expect(formularioDeCuenta(CUENTA)).toEqual({ nombre: "Ana", apellido: "López", telefono: "4771112233", fechaNacimiento: "1990-05-17" });
    expect(formularioDeCuenta({ ...CUENTA, apellido: null, fecha_nacimiento: null })).toMatchObject({ apellido: "", fechaNacimiento: "" });
    expect(paraTusDatos(CUENTA)).toEqual({ nombre: "Ana López", telefono: "4771112233", email: "ana@example.com" });
    expect(paraTusDatos({ ...CUENTA, apellido: null }).nombre).toBe("Ana");
  });
  it("una dirección guardada ↔ su formulario, ida y vuelta", () => {
    const f = formularioDeDireccion(DIR);
    expect(f).toEqual({ etiqueta: "Casa", calle: "Madero", numeroExterior: "12", numeroInterior: "", colonia: "Centro", codigoPostal: "37000", ciudad: "León", estado: "Guanajuato", referencias: "" });
    expect(direccionPorGuardar(f, DIR.id)).toEqual(DIR);
    expect(formularioDeDireccion(null)).toMatchObject({ etiqueta: "", calle: "", referencias: "" });
    expect(direccionPorGuardar({ ...f, etiqueta: "  Oficina ", numeroInterior: " 3 ", referencias: " portón " }, null))
      .toEqual({ ...DIR, id: null, etiqueta: "Oficina", numero_interior: "3", referencias: "portón" });
  });
});

describe("el relevo de «Pedir de nuevo»: la cuenta lo deja, el menú de esa sucursal lo toma", () => {
  const AHORA = 1_800_000_000_000;
  it("se toma una sola vez y arma el carrito contra el menú de ahora", () => {
    const a = almacen();
    expect(dejarPorRepetir("knockout", PEDIDO, a, AHORA)).toBe(true);
    const tomado = tomarPorRepetir("knockout", ID.sucursal, menu, a, AHORA + 1000);
    expect(tomado!.carrito).toMatchObject({ sucursalId: ID.sucursal, modo: "RECOGER", zonaId: null });
    expect(tomado!.carrito.renglones.map((r) => [r.nombre, r.cantidad])).toEqual([["Refresco", 2]]);
    expect(tomado!.descartados).toEqual([null]);
    expect(a.datos.size).toBe(0);
    expect(tomarPorRepetir("knockout", ID.sucursal, menu, a, AHORA + 2000)).toBeNull();
  });
  it("no se toma en otra sucursal, ni en otro negocio, ni pasado de tiempo, ni si lo guardado no tiene la forma", () => {
    const a = almacen();
    dejarPorRepetir("knockout", PEDIDO, a, AHORA);
    expect(tomarPorRepetir("otro", ID.sucursal, menu, a, AHORA)).toBeNull();
    expect(a.datos.size).toBe(1);                                              // el de knockout sigue ahí
    expect(tomarPorRepetir("knockout", u(2), menu, a, AHORA)).toBeNull();      // otra sucursal: se descarta
    expect(a.datos.size).toBe(0);
    dejarPorRepetir("knockout", PEDIDO, a, AHORA);
    expect(tomarPorRepetir("knockout", ID.sucursal, menu, a, AHORA + 5 * 60_000)).toBeNull();   // quedó de una visita anterior
    expect(a.datos.size).toBe(0);
    for (const basura of ["{", "null", "[]", JSON.stringify({ cuando: AHORA, pedido: { ...PEDIDO, sucursal_id: "x" } }), JSON.stringify({ cuando: "ayer", pedido: PEDIDO })]) {
      a.datos.set("vim.tienda.knockout.repetir", basura);
      expect(tomarPorRepetir("knockout", ID.sucursal, menu, a, AHORA), basura.slice(0, 20)).toBeNull();
      expect(a.datos.size, basura.slice(0, 20)).toBe(0);
    }
  });
  it("un pedido sin `items` no se deja; sin almacén (o si falla) no truena y lo dice", () => {
    const a = almacen();
    expect(dejarPorRepetir("knockout", { ...PEDIDO, items: null }, a, AHORA)).toBe(false);
    expect(a.datos.size).toBe(0);
    expect(dejarPorRepetir("knockout", PEDIDO, null, AHORA)).toBe(false);
    expect(dejarPorRepetir("knockout", PEDIDO, { ...a, setItem: () => { throw new Error("cuota"); } }, AHORA)).toBe(false);
    expect(tomarPorRepetir("knockout", ID.sucursal, menu, null, AHORA)).toBeNull();
  });
});
