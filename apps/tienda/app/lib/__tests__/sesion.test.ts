// La sesión de una cuenta: la cookie por negocio que solo conoce el servidor de la tienda, cómo viaja
// a la función (`x-tienda-sesion`) y lo que la ruta /api/tienda hace con ella. La red es de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODIGO, ID, negocioCrudo, pedidoCrudo } from "./datos";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
let cabecerasDeLaPeticion = new Headers();
let cookiesDeLaPeticion: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => cabecerasDeLaPeticion,
  cookies: async () => ({ get: (n: string) => (n in cookiesDeLaPeticion ? { name: n, value: cookiesDeLaPeticion[n] } : undefined) }),
}));

import { leerNegocio, llamarTienda } from "../servidor/funcion";
import { cookieBorrada, cookieDeSesion, haySesion, nombreDeCookie, sesionDe } from "../servidor/sesion";
import { FORMA_SLUG } from "../contrato";
import { POST } from "../../api/tienda/route";

const TOKEN = "Ab3_-".repeat(4) + "Zz";       // 22 caracteres: la forma de un token de sesión
const OTRO = "Zz9_-".repeat(4) + "Aa";
const CUENTA = { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "4771112233", fecha_nacimiento: null };
const PUESTA = `vt_knockout=${TOKEN}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
const BORRADA = "vt_knockout=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[] = [];
let responder: (l: Llamada) => Response | Promise<Response>;
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const cabecerasEnviadas = (i = 0) => new Headers(llamadas[i]!.init.headers);
const cuerpoEnviado = (i = 0) => JSON.parse(llamadas[i]!.init.body as string) as Record<string, unknown>;

beforeEach(() => {
  llamadas = [];
  cabecerasDeLaPeticion = new Headers({ "x-real-ip": "189.203.11.4" });
  cookiesDeLaPeticion = {};
  responder = () => json({ ok: true });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const l = { url: String(url), init };
    llamadas.push(l);
    return responder(l);
  }));
  vi.stubEnv("VIM_TIENDA_SECRET", "secreto-de-prueba");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co/");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("la cookie de sesión", () => {
  it("se llama vt_<slug>, y todo slug válido es un nombre de cookie válido", () => {
    expect(nombreDeCookie("knockout")).toBe("vt_knockout");
    // El alfabeto del slug (a-z, 0-9, guion) cabe entero en el de un nombre de cookie (token de RFC 7230).
    const TOKEN_HTTP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    for (const slug of ["knockout", "la-casa-de-ana", "a1b", "0-0", "x".repeat(40)]) {
      expect(FORMA_SLUG.test(slug), slug).toBe(true);
      expect(nombreDeCookie(slug), slug).toMatch(TOKEN_HTTP);
    }
  });
  it("lee solo la del negocio pedido", () => {
    const h = (cookie: string) => new Headers({ cookie });
    expect(sesionDe(h(`a=b; vt_knockout=${TOKEN}; vt_otro=${OTRO}`), "knockout")).toBe(TOKEN);
    expect(sesionDe(h(`a=b; vt_knockout=${TOKEN}; vt_otro=${OTRO}`), "otro")).toBe(OTRO);
    expect(sesionDe(h(`vt_otro=${OTRO}`), "knockout")).toBeNull();
    // Un negocio cuyo slug empieza igual no es el mismo negocio.
    expect(sesionDe(h(`vt_knockout-2=${OTRO}`), "knockout")).toBeNull();
    expect(sesionDe(h(`vt_knockout=${TOKEN}`), "knockout-2")).toBeNull();
    expect(sesionDe(h(`xvt_knockout=${TOKEN}`), "knockout")).toBeNull();
    expect(sesionDe(new Headers(), "knockout")).toBeNull();
  });
  it("lo que no tiene forma de token no es una sesión", () => {
    for (const malo of ["", "corto", `${TOKEN}x`, `"${TOKEN}"`, "a b", "x".repeat(5000)]) {
      expect(sesionDe(new Headers({ cookie: `vt_knockout=${malo}` }), "knockout"), malo.slice(0, 30)).toBeNull();
    }
  });
  it("se pone y se borra con sus atributos exactos; Secure solo falta en localhost", () => {
    expect(cookieDeSesion("knockout", TOKEN, "pedidos.vimpos.com.mx")).toBe(PUESTA);
    expect(cookieBorrada("knockout", "pedidos.vimpos.com.mx")).toBe(BORRADA);
    for (const local of ["localhost", "localhost:3005", "127.0.0.1", "127.0.0.1:3005"]) {
      expect(cookieDeSesion("knockout", TOKEN, local), local).toBe(`vt_knockout=${TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
      expect(cookieBorrada("knockout", local), local).toBe("vt_knockout=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    }
    // Lo que solo se parece a localhost lleva Secure.
    for (const host of ["localhost.evil.com", "mi-localhost", "127.0.0.1.evil.com", "192.168.1.5:3005", ""]) {
      expect(cookieDeSesion("knockout", TOKEN, host), host).toBe(PUESTA);
    }
  });
  it("haySesion mira solo si existe la cookie de ese negocio", async () => {
    expect(await haySesion("knockout")).toBe(false);
    cookiesDeLaPeticion = { vt_otro: OTRO };
    expect(await haySesion("knockout")).toBe(false);
    cookiesDeLaPeticion = { vt_knockout: TOKEN };
    expect(await haySesion("knockout")).toBe(true);
    expect(await haySesion("otro")).toBe(false);
    cookiesDeLaPeticion = { vt_knockout: "basura" };
    expect(await haySesion("knockout")).toBe(false);
    expect(llamadas).toHaveLength(0);   // sin llamada extra: la validez la decide la función al usarla
  });
});

describe("llamarTienda con sesión", () => {
  it("añade x-tienda-sesion solo cuando hay sesión", async () => {
    await llamarTienda({ accion: "cuenta", negocio: "knockout" }, "1.1.1.1", TOKEN);
    expect([...cabecerasEnviadas(0).keys()].sort()).toEqual(["content-type", "x-tienda-ip", "x-tienda-sesion", "x-vim-tienda"]);
    expect(cabecerasEnviadas(0).get("x-tienda-sesion")).toBe(TOKEN);
    expect(cuerpoEnviado(0)).toEqual({ accion: "cuenta", negocio: "knockout" });
    await llamarTienda({}, "1.1.1.1", null);
    await llamarTienda({}, "1.1.1.1");
    for (const i of [1, 2]) expect([...cabecerasEnviadas(i).keys()].sort()).toEqual(["content-type", "x-tienda-ip", "x-vim-tienda"]);
  });
  it("la lectura con caché del negocio nunca lleva la sesión del visitante", async () => {
    cabecerasDeLaPeticion = new Headers({ "x-real-ip": "189.203.11.4", cookie: `vt_knockout=${TOKEN}` });
    cookiesDeLaPeticion = { vt_knockout: TOKEN };
    responder = () => json(negocioCrudo());
    expect((await leerNegocio("knockout")).estado).toBe("ok");
    expect(cabecerasEnviadas(0).has("x-tienda-sesion")).toBe(false);
    expect(JSON.stringify(llamadas)).not.toContain(TOKEN);
  });
});

describe("POST /api/tienda — cuentas", () => {
  const BASE = { host: "pedidos.vimpos.com.mx", origin: "https://pedidos.vimpos.com.mx", "content-type": "application/json", "x-real-ip": "189.203.11.4" };
  /** `cabeceras` REEMPLAZA a las de base cuando `soloEsas` es true. */
  const llamar = (cuerpo: unknown, cabeceras: Record<string, string> = {}, soloEsas = false) =>
    POST(new Request("https://pedidos.vimpos.com.mx/api/tienda", {
      method: "POST", headers: soloEsas ? cabeceras : { ...BASE, ...cabeceras }, body: JSON.stringify(cuerpo),
    }));
  const conSesion = { cookie: `otra=1; vt_knockout=${TOKEN}; vt_otro=${OTRO}` };
  const DIR = { calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null };
  /** Cada acción con TODO su cuerpo conocido. */
  const ACCIONES: Record<string, Record<string, unknown>> = {
    registrar: { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "477 111 2233", password: "  con espacios  ", captcha: "tok" },
    entrar: { email: "ana@example.com", password: " secreta 1 " },
    salir: {},
    recuperar_pedir: { email: "ana@example.com", captcha: "tok" },
    recuperar_aplicar: { token: CODIGO, password: "nueva clave " },
    cuenta: {},
    cuenta_guardar: { nombre: "Ana", apellido: "López", telefono: "4771112233", fecha_nacimiento: null },
    cuenta_password: { actual: " vieja ", nueva: " nueva 123 " },
    direccion_guardar: { id: null, etiqueta: "Casa", ...DIR },
    direccion_borrar: { id: ID.zona },
    mis_pedidos: {},
    eliminar_cuenta: { password: " secreta 1 " },
  };
  const LLEVAN_SESION = ["salir", "cuenta", "cuenta_guardar", "cuenta_password", "direccion_guardar", "direccion_borrar", "mis_pedidos", "eliminar_cuenta"];

  it("cada acción de cuenta pasa con sus campos tal cual (las contraseñas sin recortar) y nada más", async () => {
    for (const [accion, datos] of Object.entries(ACCIONES)) {
      llamadas = [];
      const r = await llamar({
        accion, negocio: "knockout", ...datos,
        // Nada de esto es de ninguna acción de cuenta: no pasa.
        tenant_id: "x", p_cuenta: "y", p_tenant: "z", cuenta_id: "w", sesion: OTRO, "x-tienda-sesion": OTRO, es_admin: true, items: [{ producto_id: ID.refresco }],
      }, conSesion);
      expect(r.status, accion).toBe(200);
      expect(r.headers.get("cache-control"), accion).toBe("no-store");
      expect(llamadas, accion).toHaveLength(1);
      expect(cuerpoEnviado(), accion).toEqual({ accion, negocio: "knockout", ...datos });
    }
  });
  it("los campos de otra acción tampoco pasan", async () => {
    await llamar({ accion: "entrar", negocio: "knockout", ...ACCIONES.registrar, ...ACCIONES.cuenta_password, id: ID.zona });
    expect(cuerpoEnviado()).toEqual({ accion: "entrar", negocio: "knockout", email: "ana@example.com", password: "  con espacios  " });
    await llamar({ accion: "salir", negocio: "knockout", password: "x", email: "y" }, conSesion);
    expect(cuerpoEnviado(1)).toEqual({ accion: "salir", negocio: "knockout" });
  });
  it("sin Origin, o con uno ajeno, ninguna acción de cuenta pasa", async () => {
    const { origin: _sin, ...sinOrigin } = BASE;
    for (const accion of Object.keys(ACCIONES)) {
      const r = await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, { ...sinOrigin, ...conSesion }, true);
      expect(r.status, accion).toBe(403);
      expect(await r.json(), accion).toEqual({ error: "ORIGEN_NO_PERMITIDO" });
      for (const origin of ["https://evil.example.com", "null", "http://pedidos.vimpos.com.mx:8080"]) {
        const r2 = await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, { ...conSesion, origin });
        expect(r2.status, `${accion} ${origin}`).toBe(403);
        expect(r2.headers.get("set-cookie"), accion).toBeNull();
      }
    }
    expect(llamadas).toHaveLength(0);
  });
  it("sin Content-Type JSON, 400: un formulario de otra página no puede armar esta petición", async () => {
    const { "content-type": _sin, ...sinTipo } = BASE;
    for (const accion of Object.keys(ACCIONES)) {
      const r = await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, { ...sinTipo, ...conSesion }, true);
      // (`Request` pone text/plain cuando el cuerpo es texto y no se dice otra cosa.)
      expect(r.status, accion).toBe(400);
      expect(await r.json(), accion).toEqual({ error: "CUERPO_INVALIDO" });
    }
    for (const tipo of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/jsonx", ""]) {
      expect((await llamar({ accion: "entrar", negocio: "knockout", ...ACCIONES.entrar }, { "content-type": tipo })).status, tipo).toBe(400);
    }
    expect(llamadas).toHaveLength(0);
    expect((await llamar({ accion: "entrar", negocio: "knockout", ...ACCIONES.entrar }, { "content-type": "Application/JSON; charset=utf-8" })).status).toBe(200);
  });
  it("manda la cookie del negocio DEL CUERPO en x-tienda-sesion, nunca la de otro", async () => {
    for (const accion of LLEVAN_SESION) {
      llamadas = [];
      await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, conSesion);
      expect(cabecerasEnviadas().get("x-tienda-sesion"), accion).toBe(TOKEN);
      expect([...cabecerasEnviadas().keys()].sort(), accion).toEqual(["content-type", "x-tienda-ip", "x-tienda-sesion", "x-vim-tienda"]);
      await llamar({ accion, negocio: "otro", ...ACCIONES[accion] }, conSesion);
      expect(cabecerasEnviadas(1).get("x-tienda-sesion"), accion).toBe(OTRO);
      // Con sesión solo en OTRO negocio, a este no se le manda ninguna.
      await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, { cookie: `vt_otro=${OTRO}; vt_knockout-2=${OTRO}` });
      expect(cabecerasEnviadas(2).has("x-tienda-sesion"), accion).toBe(false);
      expect(JSON.stringify(llamadas[2]), accion).not.toContain(OTRO);
    }
  });
  it("lo que no usa sesión no la recibe: entrar, registrar, recuperar, cotizar y seguimiento", async () => {
    const item = { producto_id: ID.refresco, cantidad: 1, modificadores: [] };
    for (const cuerpo of [
      { accion: "registrar", ...ACCIONES.registrar }, { accion: "entrar", ...ACCIONES.entrar },
      { accion: "recuperar_pedir", ...ACCIONES.recuperar_pedir }, { accion: "recuperar_aplicar", ...ACCIONES.recuperar_aplicar },
      { accion: "seguimiento", codigo: CODIGO }, { accion: "cotizar", sucursal_id: ID.sucursal, modo: "RECOGER", zona_id: null, items: [item] },
    ]) {
      llamadas = [];
      await llamar({ negocio: "knockout", ...cuerpo }, conSesion);
      expect(llamadas, cuerpo.accion).toHaveLength(1);
      expect(cabecerasEnviadas().has("x-tienda-sesion"), cuerpo.accion).toBe(false);
    }
  });
  it("ni el cuerpo ni una cabecera del navegador pueden fijar la sesión ni la cuenta", async () => {
    await llamar({ accion: "cuenta", negocio: "knockout", sesion: OTRO, "x-tienda-sesion": OTRO, p_cuenta: ID.zona, cuenta: ID.zona }, { "x-tienda-sesion": OTRO, authorization: `Bearer ${OTRO}` });
    expect(cuerpoEnviado()).toEqual({ accion: "cuenta", negocio: "knockout" });
    expect(cabecerasEnviadas().has("x-tienda-sesion")).toBe(false);
    expect(JSON.stringify(llamadas[0])).not.toContain(OTRO);
    await llamar({ accion: "cuenta", negocio: "knockout", sesion: OTRO }, { ...conSesion, "x-tienda-sesion": OTRO });
    expect(cabecerasEnviadas(1).get("x-tienda-sesion")).toBe(TOKEN);
  });
  it("la sesión de la respuesta se vuelve cookie y NO llega al navegador", async () => {
    for (const accion of ["registrar", "entrar", "recuperar_aplicar"]) {
      responder = () => json({ ok: true, sesion: TOKEN, cuenta: CUENTA });
      const r = await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] });
      expect(r.status, accion).toBe(200);
      expect(r.headers.get("set-cookie"), accion).toBe(PUESTA);
      expect(r.headers.get("cache-control"), accion).toBe("no-store");
      const texto = await r.text();
      expect(JSON.parse(texto), accion).toEqual({ ok: true, cuenta: CUENTA });
      expect(texto, accion).not.toContain(TOKEN);
    }
  });
  it("en localhost la cookie va sin Secure", async () => {
    responder = () => json({ ok: true, sesion: TOKEN, cuenta: CUENTA });
    const r = await POST(new Request("http://localhost:3005/api/tienda", {
      method: "POST", headers: { host: "localhost:3005", origin: "http://localhost:3005", "content-type": "application/json" },
      body: JSON.stringify({ accion: "entrar", negocio: "knockout", ...ACCIONES.entrar }),
    }));
    expect(r.headers.get("set-cookie")).toBe(`vt_knockout=${TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
  });
  it("registrarse con un correo ya usado: mismo 200, sin cookie", async () => {
    responder = () => json({ ok: true });
    const r = await llamar({ accion: "registrar", negocio: "knockout", ...ACCIONES.registrar });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toEqual({ ok: true });
  });
  it("una `sesion` que no tiene forma de token no se vuelve cookie ni llega al navegador", async () => {
    for (const mala of ["corta", 5, null, { a: 1 }, `${TOKEN}; Domain=evil.com`, `${TOKEN}\r\nSet-Cookie: x=1`]) {
      responder = () => json({ ok: true, sesion: mala, cuenta: CUENTA });
      const r = await llamar({ accion: "entrar", negocio: "knockout", ...ACCIONES.entrar });
      expect(r.status, String(mala)).toBe(503);
      expect(r.headers.get("set-cookie"), String(mala)).toBeNull();
      expect(await r.json(), String(mala)).toEqual({ error: "SERVICIO_NO_DISPONIBLE" });
    }
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(TOKEN);
  });
  it("un campo `sesion` en la respuesta de cualquier otra acción tampoco sale ni pone cookie", async () => {
    responder = () => json({ cuenta: CUENTA, direcciones: [], sesion: OTRO });
    const r = await llamar({ accion: "cuenta", negocio: "knockout" }, conSesion);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toEqual({ cuenta: CUENTA, direcciones: [] });
    // Un rechazo con `sesion` tampoco la pone.
    responder = () => json({ error: "CREDENCIALES_INVALIDAS", sesion: TOKEN }, 403);
    const r2 = await llamar({ accion: "entrar", negocio: "knockout", ...ACCIONES.entrar });
    expect(r2.status).toBe(403);
    expect(r2.headers.get("set-cookie")).toBeNull();
    expect(await r2.json()).toEqual({ error: "CREDENCIALES_INVALIDAS" });
  });
  it("salir borra la cookie siempre, también si la función falla o no había sesión", async () => {
    for (const [respuesta, estado] of [[{ ok: true }, 200], [{ error: "SERVICIO_NO_DISPONIBLE" }, 503], [{ error: "DEMASIADOS_INTENTOS" }, 429]] as const) {
      responder = () => json(respuesta, estado);
      const r = await llamar({ accion: "salir", negocio: "knockout" }, conSesion);
      expect(r.status).toBe(estado);
      expect(r.headers.get("set-cookie"), String(estado)).toBe(BORRADA);
    }
    responder = () => json({ ok: true });
    expect((await llamar({ accion: "salir", negocio: "knockout" })).headers.get("set-cookie")).toBe(BORRADA);
    vi.stubEnv("VIM_TIENDA_SECRET", "");
    expect((await llamar({ accion: "salir", negocio: "knockout" }, conSesion)).headers.get("set-cookie")).toBe(BORRADA);
  });
  it("eliminar la cuenta borra la cookie solo si se eliminó", async () => {
    const eliminar = { accion: "eliminar_cuenta", negocio: "knockout", password: "secreta 1" };
    expect((await llamar(eliminar, conSesion)).headers.get("set-cookie")).toBe(BORRADA);
    responder = () => json({ error: "CREDENCIALES_INVALIDAS" }, 403);
    const r = await llamar(eliminar, conSesion);
    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    responder = () => json({ error: "SERVICIO_NO_DISPONIBLE" }, 503);
    expect((await llamar(eliminar, conSesion)).headers.get("set-cookie")).toBeNull();
  });
  it("SESION_INVALIDA borra la cookie, en cualquier acción", async () => {
    responder = () => json({ error: "SESION_INVALIDA" }, 403);
    for (const accion of LLEVAN_SESION) {
      const r = await llamar({ accion, negocio: "knockout", ...ACCIONES[accion] }, conSesion);
      expect(r.status, accion).toBe(403);
      expect(r.headers.get("set-cookie"), accion).toBe(BORRADA);
      expect(await r.json(), accion).toEqual({ error: "SESION_INVALIDA" });
    }
    // Otro rechazo no la toca.
    responder = () => json({ error: "DIRECCIONES_LLENAS" }, 409);
    expect((await llamar({ accion: "direccion_guardar", negocio: "knockout", ...ACCIONES.direccion_guardar }, conSesion)).headers.get("set-cookie")).toBeNull();
  });

  describe("pedir", () => {
    const pedido = {
      accion: "pedir", negocio: "knockout", sucursal_id: ID.sucursal, modo: "RECOGER", zona_id: null,
      items: [{ producto_id: ID.refresco, cantidad: 1, modificadores: [] }],
      cliente: { nombre: "Ana", telefono: "4771112233", email: null }, direccion: null,
      pago: "EFECTIVO", paga_con: null, nota: null, captcha: "token", total_esperado: "30.00",
    };
    it("con cookie de sesión la reenvía, y el cuerpo es el mismo de un invitado", async () => {
      responder = () => json(pedidoCrudo());
      const r = await llamar({ ...pedido, p_cuenta: ID.zona, tienda_cuenta_id: ID.zona, sesion: OTRO }, conSesion);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual(pedidoCrudo());
      expect(r.headers.get("set-cookie")).toBeNull();
      expect(cabecerasEnviadas().get("x-tienda-sesion")).toBe(TOKEN);
      expect(cuerpoEnviado()).toEqual(pedido);
    });
    it("de invitado (sin cookie) manda exactamente lo de siempre, también sin Origin ni Content-Type", async () => {
      responder = () => json(pedidoCrudo());
      const r = await llamar(pedido, { host: "pedidos.vimpos.com.mx" }, true);
      expect(r.status).toBe(200);
      expect([...cabecerasEnviadas().keys()].sort()).toEqual(["content-type", "x-tienda-ip", "x-vim-tienda"]);
      expect(cuerpoEnviado()).toEqual(pedido);
      // La cookie de otro negocio no lo vuelve un pedido con sesión.
      await llamar(pedido, { host: "pedidos.vimpos.com.mx", cookie: `vt_otro=${OTRO}` }, true);
      expect(cabecerasEnviadas(1).has("x-tienda-sesion")).toBe(false);
    });
    it("con cookie de sesión exige Origin propio y JSON", async () => {
      const r = await llamar(pedido, { host: "pedidos.vimpos.com.mx", "content-type": "application/json", ...conSesion }, true);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: "ORIGEN_NO_PERMITIDO" });
      const r2 = await llamar(pedido, { host: "pedidos.vimpos.com.mx", origin: "https://pedidos.vimpos.com.mx", ...conSesion }, true);
      expect(r2.status).toBe(400);
      expect(llamadas).toHaveLength(0);
    });
    it("con la sesión vencida se rechaza (no baja a invitado) y se borra la cookie", async () => {
      responder = () => json({ error: "SESION_INVALIDA" }, 403);
      const r = await llamar(pedido, conSesion);
      expect(r.status).toBe(403);
      expect(r.headers.get("set-cookie")).toBe(BORRADA);
      expect(llamadas).toHaveLength(1);   // un solo intento: no reintenta como invitado
    });
  });
});
