// Las cuentas vistas desde el navegador: los lectores del contrato, las llamadas, la validación de
// cada formulario, a dónde se vuelve después de entrar y «pedir de nuevo».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  borrarDireccion, cambiarPassword, eliminarCuenta, entrar, guardarCuenta, guardarDireccion, leerCuenta, misPedidos,
  recuperarAplicar, recuperarPedir, registrar, salir,
} from "../api";
import { cuentaDe, direccionesDe, menuDe, miCuentaDe, okDe, pedidosDe, registroDe, type Menu } from "../contrato";
import { aCuerpo } from "../carrito";
import {
  FORMULARIOS, carritoDesdePedido, datosDeCuenta, datosDeRegistro, errorDeCampoDeCuenta, erroresDeCuenta, erroresDeDireccion,
  textoDeCuenta, volverSeguro,
} from "../cuenta";
import { CODIGOS_DE_ERROR } from "../textos";
import { CODIGO, ID, menuCrudo, u } from "./datos";

const CUENTA = { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "4771112233", fecha_nacimiento: "1990-05-17" };
const DIR = { id: u(500), etiqueta: "Casa", calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro",
              codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null };
const ITEMS = [
  { producto_id: ID.hamburguesa, cantidad: 2, nota: "sin cebolla", modificadores: [{ opcion_id: ID.medio, cantidad: 1 }, { opcion_id: ID.queso, cantidad: 2 }] },
  { producto_id: ID.combo, cantidad: 1, componentes: [{ grupo_id: ID.slotPapas, producto_id: ID.papasGajo, cantidad: 1, modificadores: [{ opcion_id: ID.ranch, cantidad: 2 }] }] },
];
const PEDIDO = { sucursal_id: ID.sucursal, folio_corto: "TAB12C", recibido_at: "2026-10-08T20:00:00+00:00", modo: "RECOGER", estado: "ENTREGADO", total_mxn: "120.00",
                 renglones: [{ nombre: "Hamburguesa", cantidad: 2, detalle: "Medio" }], items: ITEMS };

describe("contrato de cuentas", () => {
  it("la cuenta: cinco campos y nada más; apellido y cumpleaños pueden faltar", () => {
    expect(cuentaDe({ ok: true, cuenta: { ...CUENTA, id: u(1), tenant_id: u(2), password_hash: "x" } })).toEqual(CUENTA);
    expect(cuentaDe({ cuenta: { ...CUENTA, apellido: null, fecha_nacimiento: null } })).toEqual({ ...CUENTA, apellido: null, fecha_nacimiento: null });
    for (const mala of [null, {}, { ok: true }, { cuenta: null }, { cuenta: { ...CUENTA, email: 5 } }, { cuenta: { ...CUENTA, telefono: null } },
                        { cuenta: { ...CUENTA, fecha_nacimiento: "17/05/1990" } }, { cuenta: { ...CUENTA, nombre: undefined } }]) {
      expect(cuentaDe(mala), JSON.stringify(mala)).toBeNull();
    }
  });
  it("registro: con cuenta (alta) o sin ella (correo ya usado), y solo si viene ok", () => {
    expect(registroDe({ ok: true, cuenta: CUENTA })).toEqual({ cuenta: CUENTA });
    expect(registroDe({ ok: true })).toEqual({ cuenta: null });
    for (const mala of [null, {}, { ok: false }, { cuenta: CUENTA }, { ok: true, cuenta: { nombre: "Ana" } }, { ok: "true" }]) {
      expect(registroDe(mala), JSON.stringify(mala)).toBeNull();
    }
  });
  it("ok", () => {
    expect(okDe({ ok: true })).toBe(true);
    for (const mala of [null, {}, { ok: false }, { ok: 1 }, [], "ok"]) expect(okDe(mala), JSON.stringify(mala)).toBeNull();
  });
  it("mi cuenta y sus direcciones", () => {
    expect(miCuentaDe({ cuenta: CUENTA, direcciones: [{ ...DIR, cuenta_id: u(9), zona_envio_id: u(8) }] })).toEqual({ cuenta: CUENTA, direcciones: [DIR] });
    expect(miCuentaDe({ cuenta: CUENTA, direcciones: [] })).toEqual({ cuenta: CUENTA, direcciones: [] });
    expect(miCuentaDe({ cuenta: CUENTA })).toBeNull();
    expect(direccionesDe({ direcciones: [DIR, { ...DIR, id: u(501), numero_interior: "B", referencias: "portón verde" }] })).toHaveLength(2);
    for (const mala of [null, {}, { direcciones: "x" }, { direcciones: [{ ...DIR, id: "no-uuid" }] }, { direcciones: [{ ...DIR, calle: null }] }, { direcciones: [null] }]) {
      expect(direccionesDe(mala), JSON.stringify(mala)).toBeNull();
    }
  });
  it("mis pedidos: los `items` con forma de carrito, o null", () => {
    expect(pedidosDe({ pedidos: [{ ...PEDIDO, id: u(1), cliente_telefono: "x" }] })).toEqual([PEDIDO]);
    expect(pedidosDe({ pedidos: [] })).toEqual([]);
    expect(pedidosDe({ pedidos: [{ ...PEDIDO, items: null }] })![0]!.items).toBeNull();
    // Unos `items` que no cumplen la forma no tumban la lista: ese pedido no se puede «pedir de nuevo».
    for (const malos of ["x", {}, [null], [{ producto_id: "no-uuid", cantidad: 1 }], [{ producto_id: ID.refresco, cantidad: 0 }], [{ producto_id: ID.refresco, cantidad: 1.5 }],
                         [{ producto_id: ID.refresco, cantidad: "2" }], [{ producto_id: ID.refresco, cantidad: 1, modificadores: [{ opcion_id: "x", cantidad: 1 }] }],
                         [{ producto_id: ID.refresco, cantidad: 1, componentes: [{ grupo_id: ID.slotPapas }] }], [{ producto_id: ID.refresco, cantidad: 1, nota: 5 }]]) {
      const leido = pedidosDe({ pedidos: [{ ...PEDIDO, items: malos }] });
      expect(leido, JSON.stringify(malos)).toHaveLength(1);
      expect(leido![0]!.items, JSON.stringify(malos)).toBeNull();
    }
    // Lo que el lector no conoce de un item no pasa.
    expect(pedidosDe({ pedidos: [{ ...PEDIDO, items: [{ producto_id: ID.refresco, cantidad: 1, precio_mxn: "0.01" }] }] })![0]!.items).toEqual([{ producto_id: ID.refresco, cantidad: 1 }]);
    for (const mala of [null, {}, { pedidos: "x" }, { pedidos: [{ ...PEDIDO, estado: "RARO" }] }, { pedidos: [{ ...PEDIDO, total_mxn: 120 }] }, { pedidos: [{ ...PEDIDO, modo: "MESA" }] },
                        { pedidos: [{ ...PEDIDO, sucursal_id: "no-uuid" }] }, { pedidos: [{ ...PEDIDO, sucursal_id: undefined }] }]) {
      expect(pedidosDe(mala), JSON.stringify(mala)).toBeNull();
    }
  });
});

describe("api de cuentas", () => {
  let llamadas: { url: string; init: RequestInit }[] = [];
  let responder: () => Response | Promise<Response>;
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });
  const enviado = (i = 0) => JSON.parse(llamadas[i]!.init.body as string) as unknown;
  beforeEach(() => {
    llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return responder();
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cada acción manda su cuerpo exacto a /api/tienda, con las cookies del mismo origen", async () => {
    const registro = { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "4771112233", password: " con espacios ", captcha: "tok" };
    const datos = { nombre: "Ana", apellido: "López", telefono: "4771112233", fecha_nacimiento: null };
    const direccion = { id: null, etiqueta: "Casa", calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null };
    const casos: [() => Promise<unknown>, unknown, unknown, unknown][] = [
      [() => registrar("knockout", registro), { ok: true, cuenta: CUENTA }, { accion: "registrar", negocio: "knockout", ...registro }, { cuenta: CUENTA }],
      [() => registrar("knockout", registro), { ok: true }, { accion: "registrar", negocio: "knockout", ...registro }, { cuenta: null }],
      [() => entrar("knockout", "ana@example.com", " clave "), { ok: true, cuenta: CUENTA }, { accion: "entrar", negocio: "knockout", email: "ana@example.com", password: " clave " }, CUENTA],
      [() => salir("knockout"), { ok: true }, { accion: "salir", negocio: "knockout" }, true],
      [() => recuperarPedir("knockout", "ana@example.com", "tok"), { ok: true }, { accion: "recuperar_pedir", negocio: "knockout", email: "ana@example.com", captcha: "tok" }, true],
      [() => recuperarAplicar("knockout", CODIGO, "nueva clave"), { ok: true, cuenta: CUENTA }, { accion: "recuperar_aplicar", negocio: "knockout", token: CODIGO, password: "nueva clave" }, CUENTA],
      [() => leerCuenta("knockout"), { cuenta: CUENTA, direcciones: [DIR] }, { accion: "cuenta", negocio: "knockout" }, { cuenta: CUENTA, direcciones: [DIR] }],
      [() => guardarCuenta("knockout", datos), { cuenta: CUENTA }, { accion: "cuenta_guardar", negocio: "knockout", ...datos }, CUENTA],
      [() => cambiarPassword("knockout", "vieja", "nueva 123"), { ok: true }, { accion: "cuenta_password", negocio: "knockout", actual: "vieja", nueva: "nueva 123" }, true],
      [() => guardarDireccion("knockout", direccion), { direcciones: [DIR] }, { accion: "direccion_guardar", negocio: "knockout", ...direccion }, [DIR]],
      [() => borrarDireccion("knockout", DIR.id), { direcciones: [] }, { accion: "direccion_borrar", negocio: "knockout", id: DIR.id }, []],
      [() => misPedidos("knockout"), { pedidos: [PEDIDO] }, { accion: "mis_pedidos", negocio: "knockout" }, [PEDIDO]],
      [() => eliminarCuenta("knockout", "clave"), { ok: true }, { accion: "eliminar_cuenta", negocio: "knockout", password: "clave" }, true],
    ];
    for (const [llamar, respuesta, cuerpo, datosEsperados] of casos) {
      llamadas = [];
      responder = () => json(respuesta);
      expect(await llamar(), JSON.stringify(cuerpo)).toEqual({ ok: true, datos: datosEsperados });
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]!.url).toBe("/api/tienda");
      expect(llamadas[0]!.init.method).toBe("POST");
      expect(llamadas[0]!.init.credentials).toBe("same-origin");
      expect(new Headers(llamadas[0]!.init.headers).get("content-type")).toBe("application/json");
      expect(enviado()).toEqual(cuerpo);
    }
  });
  it("un rechazo trae su código; un 200 sin forma no es datos; sin red es «sin conexión»", async () => {
    responder = () => json({ error: "CREDENCIALES_INVALIDAS" }, 403);
    expect(await entrar("knockout", "ana@example.com", "mala")).toEqual({ ok: false, error: "CREDENCIALES_INVALIDAS", detalle: null });
    responder = () => json({ error: "SESION_INVALIDA" }, 403);
    expect(await leerCuenta("knockout")).toEqual({ ok: false, error: "SESION_INVALIDA", detalle: null });
    responder = () => json({ ok: true });   // entrar sin cuenta no es entrar
    expect(await entrar("knockout", "ana@example.com", "clave")).toEqual({ ok: false, error: "SERVICIO_NO_DISPONIBLE", detalle: null });
    responder = () => { throw new TypeError("Failed to fetch"); };
    expect(await misPedidos("knockout")).toEqual({ ok: false, error: "SIN_CONEXION", detalle: null });
  });
});

describe("formularios de cuenta", () => {
  const e = errorDeCampoDeCuenta;
  it("la contraseña nueva: de 8 a 72, sin recortar ni otra regla", () => {
    expect(e("password", "")).toBe("Escribe una contraseña.");
    expect(e("password", "1234567")).toBe("Usa al menos 8 caracteres.");
    expect(e("password", "12345678")).toBeNull();
    expect(e("password", "        ")).toBeNull();           // ocho espacios son ocho caracteres
    expect(e("password", "ñandúes!")).toBeNull();           // 8 caracteres aunque pesen más
    expect(e("password", "😀".repeat(7))).toBe("Usa al menos 8 caracteres.");
    expect(e("password", "a".repeat(72))).toBeNull();
    expect(e("password", "a".repeat(73))).toBe("Usa 72 caracteres o menos.");
    // bcrypt corta a los 72 BYTES: lo que pasa de ahí no contaría, así que no se acepta.
    expect(e("password", "ñ".repeat(37))).toBe("Usa una contraseña más corta.");
    expect(e("password", "ñ".repeat(36))).toBeNull();
  });
  it("la contraseña que ya se tiene solo se pide; sus reglas no se enseñan", () => {
    expect(e("passwordActual", "")).toBe("Escribe tu contraseña.");
    expect(e("passwordActual", "x")).toBeNull();
    expect(e("passwordActual", " ")).toBeNull();
  });
  it("nombre y apellido: obligatorios, hasta 100", () => {
    expect(e("nombre", "  ")).toBe("Escribe tu nombre.");
    expect(e("apellido", "")).toBe("Escribe tu apellido.");
    expect(e("nombre", "Ana")).toBeNull();
    expect(e("apellido", "x".repeat(100))).toBeNull();
    expect(e("apellido", "x".repeat(101))).toBe("Usa 100 caracteres o menos.");
    expect(e("nombre", "x".repeat(101))).toBe("Usa 100 caracteres o menos.");
  });
  it("correo y teléfono, con las reglas del pedido", () => {
    expect(e("email", "")).toBe("Escribe tu correo.");
    expect(e("email", "ana@")).toMatch(/^Revisa tu correo/);
    expect(e("email", "ana@ejemplo.com.mx")).toBeNull();
    expect(e("email", " Ana@Ejemplo.com ")).toBeNull();
    expect(e("telefono", "")).toBe("Escribe tu teléfono.");
    expect(e("telefono", "477 123")).toMatch(/10 dígitos/);
    expect(e("telefono", "+52 1 477 123 4567")).toBeNull();
  });
  it("la fecha de nacimiento es opcional; si viene, es una fecha de verdad y ya pasó", () => {
    const hoy = "2026-10-09";
    expect(e("fechaNacimiento", "", hoy)).toBeNull();
    expect(e("fechaNacimiento", "1990-05-17", hoy)).toBeNull();
    expect(e("fechaNacimiento", "2026-10-08", hoy)).toBeNull();
    for (const mala of ["17/05/1990", "1990-13-01", "1990-02-30", "2026-10-09", "2026-10-10", "1899-12-31", "90-05-17", "hoy"]) {
      expect(e("fechaNacimiento", mala, hoy), mala).toBe("Revisa la fecha.");
    }
  });
  it("la etiqueta de una dirección: obligatoria, hasta 40", () => {
    expect(e("etiqueta", " ")).toBe("Ponle un nombre, por ejemplo «Casa».");
    expect(e("etiqueta", "Casa")).toBeNull();
    expect(e("etiqueta", "x".repeat(40))).toBeNull();
    expect(e("etiqueta", "x".repeat(41))).toBe("Usa 40 caracteres o menos.");
  });
  it("erroresDeCuenta: solo los campos del formulario, en su orden", () => {
    expect(erroresDeCuenta(FORMULARIOS.registro, { nombre: "", apellido: "López", email: "x", telefono: "4771112233", password: "corta" })).toEqual({
      nombre: "Escribe tu nombre.", email: expect.stringMatching(/^Revisa tu correo/), password: "Usa al menos 8 caracteres.",
    });
    expect(Object.keys(erroresDeCuenta(FORMULARIOS.registro, { nombre: "", apellido: "", email: "", telefono: "", password: "" }))).toEqual(["nombre", "apellido", "email", "telefono", "password"]);
    expect(erroresDeCuenta(FORMULARIOS.entrar, { email: "ana@example.com", passwordActual: "x" })).toEqual({});
    expect(erroresDeCuenta(FORMULARIOS.cambiarPassword, { passwordActual: "", password: "nueva 123" })).toEqual({ passwordActual: "Escribe tu contraseña." });
    expect(erroresDeCuenta(FORMULARIOS.datos, { nombre: "Ana", apellido: "López", telefono: "4771112233", fechaNacimiento: "" })).toEqual({});
    expect(Object.keys(FORMULARIOS).sort()).toEqual(["cambiarPassword", "datos", "eliminar", "entrar", "nuevaPassword", "recuperar", "registro"]);
  });
  it("una dirección guardada se valida como la de un pedido a domicilio, más su etiqueta", () => {
    const buena = { etiqueta: "Casa", calle: "Madero", numeroExterior: "12", numeroInterior: "", colonia: "Centro", codigoPostal: "37000", ciudad: "León", estado: "Guanajuato", referencias: "" };
    expect(erroresDeDireccion(buena)).toEqual({});
    expect(erroresDeDireccion({ ...buena, etiqueta: "", calle: " ", codigoPostal: "370" })).toEqual({
      etiqueta: "Ponle un nombre, por ejemplo «Casa».", calle: "Escribe tu calle.", codigoPostal: "El código postal tiene 5 dígitos.",
    });
  });
  it("lo que se manda: textos recortados, correo en minúsculas, teléfono en 10 dígitos, contraseña intacta", () => {
    expect(datosDeRegistro({ nombre: " Ana ", apellido: " López ", email: " Ana@Ejemplo.COM ", telefono: "+52 (477) 111-2233", password: "  clave 123  " })).toEqual({
      nombre: "Ana", apellido: "López", email: "ana@ejemplo.com", telefono: "4771112233", password: "  clave 123  ",
    });
    expect(datosDeCuenta({ nombre: " Ana ", apellido: " López ", telefono: "477 111 2233", fechaNacimiento: "" })).toEqual({
      nombre: "Ana", apellido: "López", telefono: "4771112233", fecha_nacimiento: null,
    });
    expect(datosDeCuenta({ nombre: "Ana", apellido: "López", telefono: "4771112233", fechaNacimiento: "1990-05-17" }).fecha_nacimiento).toBe("1990-05-17");
  });
});

describe("textos de los errores de cuenta", () => {
  it("cada código de cuenta tiene sus palabras", () => {
    for (const c of ["CREDENCIALES_INVALIDAS", "SESION_INVALIDA", "ENLACE_INVALIDO", "DIRECCIONES_LLENAS", "CUENTA_INVALIDA_DATOS"]) expect(CODIGOS_DE_ERROR, c).toContain(c);
    expect(textoDeCuenta("CREDENCIALES_INVALIDAS")).toMatch(/^El correo o la contraseña no coinciden\./);
    expect(textoDeCuenta("SESION_INVALIDA")).toBe("Tu sesión terminó. Entra otra vez.");
    expect(textoDeCuenta("ENLACE_INVALIDO")).toBe("Este enlace ya no sirve. Pide uno nuevo.");
    expect(textoDeCuenta("DIRECCIONES_LLENAS")).toBe("Ya tienes 5 direcciones guardadas. Borra una para guardar otra.");
    expect(textoDeCuenta("CUENTA_INVALIDA_DATOS")).toMatch(/^Revisa tus datos\./);
    expect(textoDeCuenta("DEMASIADOS_INTENTOS")).toMatch(/demasiados intentos/);
    expect(textoDeCuenta("ALGO_QUE_NO_EXISTE")).toBe("Algo salió mal de nuestro lado. Vuelve a intentar en unos minutos.");
  });
});

describe("volverSeguro", () => {
  it("acepta solo rutas internas de ese negocio", () => {
    for (const buena of ["/knockout", "/knockout/", "/knockout/cuenta", "/knockout?pedido=1", "/knockout/cuenta?x=1#pedidos", "/knockout#menu"]) {
      expect(volverSeguro("knockout", buena), buena).toBe(buena);
    }
  });
  it("todo lo demás vuelve al menú del negocio", () => {
    for (const mala of [
      null, undefined, 5, ["/knockout"], "", "/", "knockout", "/otro", "/otro/cuenta", "/knockout-2", "/knockoutx/cuenta", "/Knockout",
      "//evil.com", "//evil.com/knockout", "/knockout//evil.com", "https://evil.com/knockout", "http://pedidos.vimpos.com.mx/knockout",
      "javascript:alert(1)", "/knockout\\evil.com", "\\\\evil.com", "/\\evil.com", "/knockout/../otro", "/knockout/..", "/knockout/%2e%2e/otro",
      "/knockout/\t/evil.com", "/knockout\n", " /knockout", "/knockout?next=https://evil.com", "/knockout/x:y", "/knockout" + "/a".repeat(300),
    ]) {
      expect(volverSeguro("knockout", mala), String(mala)).toBe("/knockout");
    }
  });
});

describe("pedir de nuevo", () => {
  const menu = menuDe(menuCrudo())!;
  const sinProducto = (id: string): Menu => ({ categorias: menu.categorias.map((c) => ({ ...c, productos: c.productos.filter((p) => p.id !== id) })) });

  it("arma el carrito con lo que sigue en el menú, con los nombres de ahora", () => {
    const { carrito, descartados } = carritoDesdePedido(ITEMS, ID.sucursal, "RECOGER", menu);
    expect(descartados).toEqual([]);
    expect(carrito).toMatchObject({ v: 1, sucursalId: ID.sucursal, modo: "RECOGER", zonaId: null });
    expect(carrito.renglones.map((r) => [r.nombre, r.cantidad, r.nota])).toEqual([["Hamburguesa", 2, "sin cebolla"], ["Combo clásico", 1, ""]]);
    expect(carrito.renglones[0]!.modificadores.map((m) => m.nombre)).toEqual(["Medio", "Extra queso"]);
    // Lo que saldría a la función es lo mismo que se pidió.
    expect(aCuerpo(carrito).items).toEqual(ITEMS);
  });
  it("descarta lo que ya no está o ya no se puede pedir, y dice qué", () => {
    // El combo ya no existe; la hamburguesa sí.
    const a = carritoDesdePedido(ITEMS, ID.sucursal, "DOMICILIO", sinProducto(ID.combo));
    expect(a.carrito.renglones.map((r) => r.nombre)).toEqual(["Hamburguesa"]);
    expect(a.carrito.modo).toBe("DOMICILIO");
    expect(a.descartados).toEqual([null]);            // sin nombre: ya no está en el menú
    // Una opción que ya no existe, una agotada, y un producto agotado: se descartan con su nombre.
    const agotado: Menu = { categorias: menu.categorias.map((c) => ({ ...c, productos: c.productos.map((p) => (p.id === ID.refresco ? { ...p, agotado: true } : p)) })) };
    const b = carritoDesdePedido([
      { producto_id: ID.hamburguesa, cantidad: 1, modificadores: [{ opcion_id: u(999), cantidad: 1 }] },
      { producto_id: ID.hamburguesa, cantidad: 1, modificadores: [{ opcion_id: ID.medio, cantidad: 1 }, { opcion_id: ID.aguacate, cantidad: 1 }] },
      { producto_id: ID.hamburguesa, cantidad: 1 },                                   // le falta el término obligatorio
      { producto_id: ID.refresco, cantidad: 1 },
      { producto_id: ID.hamburguesa, cantidad: 1, modificadores: [{ opcion_id: ID.medio, cantidad: 1 }] },
    ], ID.sucursal, "RECOGER", agotado);
    expect(b.descartados).toEqual(["Hamburguesa", "Hamburguesa", "Hamburguesa", "Refresco"]);
    expect(b.carrito.renglones).toHaveLength(1);
    expect(b.carrito.renglones[0]!.modificadores.map((m) => m.nombre)).toEqual(["Medio"]);
  });
  it("dos renglones iguales se suman; con el menú vacío no queda nada", () => {
    const item = { producto_id: ID.refresco, cantidad: 2 };
    const { carrito, descartados } = carritoDesdePedido([item, item], ID.sucursal, "RECOGER", menu);
    expect(descartados).toEqual([]);
    expect(carrito.renglones.map((r) => r.cantidad)).toEqual([4]);
    const vacio = carritoDesdePedido(ITEMS, ID.sucursal, "RECOGER", { categorias: [] });
    expect(vacio.carrito.renglones).toEqual([]);
    expect(vacio.descartados).toEqual([null, null]);
    expect(carritoDesdePedido([], ID.sucursal, "RECOGER", menu)).toMatchObject({ carrito: { renglones: [] }, descartados: [] });
  });
});
