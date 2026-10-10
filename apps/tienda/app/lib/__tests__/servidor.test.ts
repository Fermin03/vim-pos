// La capa de servidor: el cliente de la función (secreto, IP, tiempo límite, caché) y la ruta
// /api/tienda, la única puerta del navegador. La red es un `fetch` de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODIGO, ID, cotizacionCruda, menuCrudo, negocioCrudo } from "./datos";

vi.mock("server-only", () => ({}));
// La caché de Next no existe fuera de Next. Esta la imita en lo que importa aquí: guarda lo que la
// función DEVUELVE, por clave, y no guarda nada si la función lanza.
const cache = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, claves: string[], opciones: { revalidate: number }) => async () => {
    const k = `${claves.join("|")}@${opciones.revalidate}`;
    if (!cache.has(k)) cache.set(k, await fn());
    return cache.get(k);
  },
}));
let cabecerasDeLaPeticion = new Headers();
vi.mock("next/headers", () => ({ headers: async () => cabecerasDeLaPeticion }));

import { leerMenu, leerNegocio, llamarTienda } from "../servidor/funcion";
import { ipDe } from "../servidor/ip";
import { POST } from "../../api/tienda/route";

type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[] = [];
let responder: (l: Llamada) => Response | Promise<Response>;
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const cabecerasEnviadas = (i = 0) => new Headers(llamadas[i]!.init.headers);
const cuerpoEnviado = (i = 0) => JSON.parse(llamadas[i]!.init.body as string) as Record<string, unknown>;

beforeEach(() => {
  llamadas = [];
  cache.clear();
  cabecerasDeLaPeticion = new Headers({ "x-real-ip": "189.203.11.4" });
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

describe("la IP real", () => {
  const ip = (h: Record<string, string>) => ipDe(new Headers(h));
  it("primero las cabeceras que escribe la plataforma; x-forwarded-for solo al final", () => {
    expect(ip({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" })).toBe("1.1.1.1");
    expect(ip({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" })).toBe("2.2.2.2");
    expect(ip({ "x-forwarded-for": " 3.3.3.3 , 10.0.0.1" })).toBe("3.3.3.3");
    expect(ip({ "x-vercel-forwarded-for": "2001:db8::1, 10.0.0.1" })).toBe("2001:db8::1");
    expect(ip({})).toBe("desconocida");
  });
});

describe("llamarTienda", () => {
  it("manda el secreto, la IP y el cuerpo a la función, sin caché", async () => {
    responder = () => json(cotizacionCruda());
    const r = await llamarTienda({ accion: "cotizar", negocio: "knockout" }, "189.203.11.4");
    expect(r).toEqual({ estado: 200, json: cotizacionCruda() });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe("https://abc.supabase.co/functions/v1/tienda");
    expect(llamadas[0]!.init.method).toBe("POST");
    expect(llamadas[0]!.init.cache).toBe("no-store");
    expect(llamadas[0]!.init.signal).toBeInstanceOf(AbortSignal);
    const h = cabecerasEnviadas();
    expect([...h.keys()].sort()).toEqual(["content-type", "x-tienda-ip", "x-vim-tienda"]);
    expect(h.get("x-vim-tienda")).toBe("secreto-de-prueba");
    expect(h.get("x-tienda-ip")).toBe("189.203.11.4");
    expect(cuerpoEnviado()).toEqual({ accion: "cotizar", negocio: "knockout" });
  });
  it("SUPABASE_URL le gana a la pública; el secreto se recorta", async () => {
    vi.stubEnv("SUPABASE_URL", "https://interna.supabase.co");
    vi.stubEnv("VIM_TIENDA_SECRET", "  secreto-de-prueba\n");
    await llamarTienda({}, "1.1.1.1");
    expect(llamadas[0]!.url).toBe("https://interna.supabase.co/functions/v1/tienda");
    expect(cabecerasEnviadas().get("x-vim-tienda")).toBe("secreto-de-prueba");
  });
  it("sin secreto o sin URL: 503 sin llamar", async () => {
    vi.stubEnv("VIM_TIENDA_SECRET", "   ");
    expect(await llamarTienda({}, "1.1.1.1")).toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE" } });
    vi.stubEnv("VIM_TIENDA_SECRET", "x");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await llamarTienda({}, "1.1.1.1")).toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE" } });
    expect(llamadas).toHaveLength(0);
  });
  it("los rechazos conocidos pasan con su estado y su JSON", async () => {
    for (const [estado, cuerpo] of [
      [400, { error: "CARRITO_INVALIDO" }], [403, { error: "CAPTCHA_INVALIDO" }], [404, { error: "TIENDA_NO_DISPONIBLE" }],
      [409, { error: "TOTAL_CAMBIO", detalle: "310.00" }], [413, { error: "CUERPO_DEMASIADO_GRANDE" }],
      [429, { error: "DEMASIADOS_INTENTOS" }], [503, { error: "SERVICIO_NO_DISPONIBLE" }],
    ] as const) {
      responder = () => json(cuerpo, estado);
      expect(await llamarTienda({}, "1.1.1.1"), String(estado)).toEqual({ estado, json: cuerpo });
    }
    expect(console.error).not.toHaveBeenCalled();
  });
  it("un 401 (secreto mal puesto) y cualquier 3xx/4xx inesperado salen como 503 a secas: ahí no se creó nada", async () => {
    for (const estado of [401, 405, 302, 418, 499]) {
      responder = () => json({ error: "NO_AUTORIZADO", pista: "dato-interno" }, estado);
      expect(await llamarTienda({ accion: "pedir", cliente: { telefono: "4771234567" } }, "1.1.1.1"), String(estado))
        .toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE" } });
    }
  });
  it("un 5xx que no es el 503 de la función (500, 502, 504, 546) sale como «sin respuesta»: el pedido pudo haber entrado", async () => {
    for (const estado of [500, 501, 502, 504, 546, 599]) {
      responder = () => json({ error: "ERROR_INTERNO" }, estado);
      expect(await llamarTienda({ accion: "pedir" }, "1.1.1.1"), String(estado))
        .toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE", detalle: "SIN_RESPUESTA" } });
    }
    // El 503 de la propia función contestó a propósito: pasa tal cual, sin el detalle.
    responder = () => json({ error: "SERVICIO_NO_DISPONIBLE" }, 503);
    expect(await llamarTienda({ accion: "pedir" }, "1.1.1.1")).toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE" } });
  });
  it("lo inesperado queda en el registro, sin el cuerpo", async () => {
    for (const estado of [401, 500, 405, 302, 502]) {
      responder = () => json({ error: "NO_AUTORIZADO", pista: "dato-interno" }, estado);
      await llamarTienda({ accion: "pedir", cliente: { telefono: "4771234567" } }, "1.1.1.1");
    }
    const registrado = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(vi.mocked(console.error).mock.calls).toHaveLength(5);
    expect(registrado).toContain("401");
    expect(registrado).not.toMatch(/4771234567|dato-interno|secreto-de-prueba/);
  });
  it("una respuesta que no es JSON tampoco dice qué pasó: «sin respuesta»", async () => {
    responder = () => new Response("<html>gateway</html>", { status: 200 });
    expect(await llamarTienda({}, "1.1.1.1")).toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE", detalle: "SIN_RESPUESTA" } });
  });
  it("si la función no contesta (red o tiempo límite) dice que se quedó sin respuesta: el pedido pudo haber entrado", async () => {
    responder = () => { throw new DOMException("The operation timed out.", "TimeoutError"); };
    expect(await llamarTienda({ accion: "pedir" }, "1.1.1.1")).toEqual({ estado: 503, json: { error: "SERVICIO_NO_DISPONIBLE", detalle: "SIN_RESPUESTA" } });
  });
});

describe("leerNegocio y leerMenu (con caché)", () => {
  it("lee el negocio con la IP del visitante y lo devuelve ya validado", async () => {
    responder = () => json(negocioCrudo());
    const r = await leerNegocio("knockout");
    expect(r.estado).toBe("ok");
    expect(r.estado === "ok" && r.datos.nombre).toBe("Knock-Out Burger");
    expect(cuerpoEnviado()).toEqual({ accion: "negocio", negocio: "knockout" });
    expect(cabecerasEnviadas().get("x-tienda-ip")).toBe("189.203.11.4");
  });
  it("guarda 30 segundos por negocio: la segunda lectura no llama", async () => {
    responder = () => json(negocioCrudo());
    await leerNegocio("knockout");
    cabecerasDeLaPeticion = new Headers({ "x-real-ip": "8.8.8.8" });   // otro visitante, misma entrada
    await leerNegocio("knockout");
    expect(llamadas).toHaveLength(1);
    await leerNegocio("otro-negocio");
    expect(llamadas).toHaveLength(2);
    expect([...cache.keys()].every((k) => k.endsWith("@30"))).toBe(true);
    expect([...cache.keys()].join()).not.toContain("189.203.11.4");
  });
  it("lo que la caché de Next entrega ya viejo (más de 30 s) no se usa: se pregunta de nuevo", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    try {
      responder = () => json(negocioCrudo());
      await leerNegocio("knockout");
      vi.setSystemTime(1_800_000_000_000 + 30_000);
      await leerNegocio("knockout");
      expect(llamadas).toHaveLength(1);
      // La caché de mentira, como la de Next pasado el plazo, sigue entregando la entrada vieja.
      vi.setSystemTime(1_800_000_000_000 + 30_001);
      responder = () => json({ ...(negocioCrudo() as object), nombre: "Nombre nuevo" });
      const r = await leerNegocio("knockout");
      expect(llamadas).toHaveLength(2);
      expect(r.estado === "ok" && r.datos.nombre).toBe("Nombre nuevo");
    } finally {
      vi.useRealTimers();
    }
  });
  it("el 404 también se guarda: una dirección que no existe no martillea a la función", async () => {
    responder = () => json({ error: "TIENDA_NO_DISPONIBLE" }, 404);
    expect(await leerNegocio("no-existe")).toEqual({ estado: "no-existe" });
    expect(await leerNegocio("no-existe")).toEqual({ estado: "no-existe" });
    expect(llamadas).toHaveLength(1);
  });
  it("los errores NO se guardan: al siguiente intento se vuelve a preguntar", async () => {
    for (const mala of [() => json({ error: "SERVICIO_NO_DISPONIBLE" }, 503), () => json({ error: "DEMASIADOS_INTENTOS" }, 429),
                        () => json({ nombre: "sin forma" }), () => { throw new Error("red"); }]) {
      cache.clear(); llamadas = [];
      responder = mala;
      expect(await leerNegocio("knockout")).toEqual({ estado: "no-disponible" });
      responder = () => json(negocioCrudo());
      expect((await leerNegocio("knockout")).estado).toBe("ok");
      expect(llamadas).toHaveLength(2);
    }
  });
  it("una dirección que no tiene forma de dirección ni se pregunta", async () => {
    for (const mala of ["", "A", "Knockout", "a b", "../x", "favicon.ico", "x".repeat(41)]) {
      expect(await leerNegocio(mala), mala).toEqual({ estado: "no-existe" });
    }
    expect(llamadas).toHaveLength(0);
  });
  it("el menú va por negocio y sucursal", async () => {
    responder = () => json(menuCrudo());
    const r = await leerMenu("knockout", ID.sucursal);
    expect(r.estado === "ok" && r.datos.categorias).toHaveLength(2);
    expect(cuerpoEnviado()).toEqual({ accion: "menu", negocio: "knockout", sucursal_id: ID.sucursal });
    await leerMenu("knockout", ID.sucursal);
    expect(llamadas).toHaveLength(1);
    await leerMenu("knockout", ID.zona);
    expect(llamadas).toHaveLength(2);
    expect(await leerMenu("knockout", "no-es-uuid")).toEqual({ estado: "no-existe" });
    expect(llamadas).toHaveLength(2);
  });
  it("un menú sin los precios finales (función vieja) es no disponible, no un menú a medias", async () => {
    const viejo = menuCrudo() as { categorias: { productos: Record<string, unknown>[] }[] };
    delete viejo.categorias[0]!.productos[0]!.precio_final_mxn;
    responder = () => json(viejo);
    expect(await leerMenu("knockout", ID.sucursal)).toEqual({ estado: "no-disponible" });
  });
});

describe("POST /api/tienda", () => {
  const pedir = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
    POST(new Request("https://pedidos.vimpos.com.mx/api/tienda", {
      method: "POST",
      headers: { host: "pedidos.vimpos.com.mx", origin: "https://pedidos.vimpos.com.mx", "content-type": "application/json", "x-real-ip": "189.203.11.4", ...cabeceras },
      body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    }));
  const seguimiento = { accion: "seguimiento", negocio: "knockout", codigo: CODIGO };
  const item = { producto_id: ID.hamburguesa, cantidad: 2, nota: "sin cebolla", modificadores: [{ opcion_id: ID.medio, cantidad: 1 }] };
  const cotizar = { accion: "cotizar", negocio: "knockout", sucursal_id: ID.sucursal, modo: "RECOGER", zona_id: null, items: [item] };

  it("reenvía y devuelve el mismo estado y el mismo JSON, sin caché", async () => {
    responder = () => json(cotizacionCruda());
    const r = await pedir(cotizar);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(cotizacionCruda());
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(cuerpoEnviado()).toEqual(cotizar);
    responder = () => json({ error: "TOTAL_CAMBIO", detalle: "310.00" }, 409);
    const r2 = await pedir(cotizar);
    expect(r2.status).toBe(409);
    expect(await r2.json()).toEqual({ error: "TOTAL_CAMBIO", detalle: "310.00" });
  });
  it("reenvía la IP real del cliente y nunca sus cabeceras", async () => {
    await pedir(seguimiento, { "x-vercel-forwarded-for": "200.1.2.3", "x-forwarded-for": "6.6.6.6", "x-tienda-ip": "6.6.6.6", "x-vim-tienda": "inventado", cookie: "a=b", authorization: "Bearer x" });
    const h = cabecerasEnviadas();
    expect(h.get("x-tienda-ip")).toBe("200.1.2.3");
    expect(h.get("x-vim-tienda")).toBe("secreto-de-prueba");
    expect([...h.keys()].sort()).toEqual(["content-type", "x-tienda-ip", "x-vim-tienda"]);
  });
  it("solo las acciones del navegador", async () => {
    for (const accion of ["negocio", "menu", "direcciones", "", null, 5]) {
      const r = await pedir({ ...seguimiento, accion });
      expect(r.status, String(accion)).toBe(400);
      expect(await r.json()).toEqual({ error: "ACCION_INVALIDA" });
    }
    expect(llamadas).toHaveLength(0);
  });
  it("un cuerpo de más de 32 KB no se reenvía", async () => {
    const r = await pedir({ ...seguimiento, relleno: "x".repeat(33_000) });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "CUERPO_DEMASIADO_GRANDE" });
    // …y se cuenta en bytes, no en caracteres: 12 000 «ñ» pesan 24 KB y 20 000, 40 KB.
    expect((await pedir({ ...seguimiento, relleno: "ñ".repeat(12_000) })).status).toBe(200);
    expect((await pedir({ ...seguimiento, relleno: "ñ".repeat(20_000) })).status).toBe(413);
    expect(llamadas).toHaveLength(1);
  });
  it("sin Content-Length (o con uno falso) deja de leer en cuanto pasa de 32 KB", async () => {
    const trozo = new TextEncoder().encode("x".repeat(8 * 1024));
    const flujo = (leidos: { n: number }, total: number) => new ReadableStream<Uint8Array>({
      pull(c) { if (leidos.n >= total) return c.close(); leidos.n++; c.enqueue(trozo); },
    }, { highWaterMark: 0 });
    const conFlujo = (leidos: { n: number }, total: number, cabeceras: Record<string, string> = {}) =>
      POST(new Request("https://pedidos.vimpos.com.mx/api/tienda", {
        method: "POST", headers: { host: "pedidos.vimpos.com.mx", ...cabeceras }, body: flujo(leidos, total), duplex: "half",
      } as RequestInit));
    // 1 000 trozos de 8 KB (8 MB): se corta al quinto, el primero que pasa del tope.
    const leidos = { n: 0 };
    const r = await conFlujo(leidos, 1000);
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "CUERPO_DEMASIADO_GRANDE" });
    expect(leidos.n).toBeLessThanOrEqual(6);
    // Un Content-Length que miente por lo bajo no lo salva…
    const mentira = { n: 0 };
    expect((await conFlujo(mentira, 1000, { "content-length": "10" })).status).toBe(413);
    expect(mentira.n).toBeLessThanOrEqual(6);
    // …y uno que excede se rechaza sin leer nada.
    const sinLeer = { n: 0 };
    expect((await conFlujo(sinLeer, 1, { "content-length": "40000" })).status).toBe(413);
    expect(sinLeer.n).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
  it("un cuerpo que llega en varios trozos se lee completo (también con un carácter partido entre dos)", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ accion: "seguimiento", negocio: "knockout", codigo: CODIGO, nota: "ñandú" }));
    const corte = bytes.indexOf(0xc3) + 1;   // a media «ñ»
    const r = await POST(new Request("https://pedidos.vimpos.com.mx/api/tienda", {
      method: "POST", headers: { host: "pedidos.vimpos.com.mx" }, duplex: "half",
      body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, corte)); c.enqueue(bytes.slice(corte)); c.close(); } }),
    } as RequestInit));
    expect(r.status).toBe(200);
    expect(cuerpoEnviado()).toEqual({ accion: "seguimiento", negocio: "knockout", codigo: CODIGO });
  });
  it("lo que no es un objeto JSON, 400", async () => {
    for (const malo of ["{no es json", "[]", "null", "\"hola\"", ""]) {
      const r = await pedir(malo);
      expect(r.status, malo).toBe(400);
      expect(await r.json()).toEqual({ error: "CUERPO_INVALIDO" });
    }
    expect(llamadas).toHaveLength(0);
  });
  it("un Origin ajeno se rechaza; sin Origin (no es un navegador en otra página) pasa", async () => {
    for (const origin of ["https://evil.example.com", "https://pedidos.vimpos.com.mx.evil.example.com", "http://pedidos.vimpos.com.mx:8080", "null"]) {
      const r = await pedir(seguimiento, { origin });
      expect(r.status, origin).toBe(403);
      expect(await r.json()).toEqual({ error: "ORIGEN_NO_PERMITIDO" });
    }
    expect(llamadas).toHaveLength(0);
    const sinOrigin = await POST(new Request("https://pedidos.vimpos.com.mx/api/tienda", { method: "POST", headers: { host: "pedidos.vimpos.com.mx" }, body: JSON.stringify(seguimiento) }));
    expect(sinOrigin.status).toBe(200);
  });
  it("la dirección y el código se revisan antes de gastar una llamada", async () => {
    expect(await (await pedir({ ...seguimiento, negocio: "../admin" })).json()).toEqual({ error: "NEGOCIO_INVALIDO" });
    expect(await (await pedir({ ...seguimiento, negocio: 7 })).json()).toEqual({ error: "NEGOCIO_INVALIDO" });
    expect(await (await pedir({ ...seguimiento, codigo: "corto" })).json()).toEqual({ error: "CODIGO_INVALIDO" });
    expect(llamadas).toHaveLength(0);
  });
  it("no reenvía campos que no conoce, ni arriba ni dentro del carrito", async () => {
    await pedir({ ...seguimiento, tenant_id: "x", p_cuenta: "y" });
    expect(cuerpoEnviado(0)).toEqual(seguimiento);
    const pedido = {
      ...cotizar, accion: "pedir", modo: "DOMICILIO", zona_id: ID.zona,
      cliente: { nombre: "Ana", telefono: "477 123 4567", email: null },
      direccion: { calle: "Madero", numero_exterior: "12", numero_interior: null, colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null },
      pago: "EFECTIVO", paga_con: "500.00", nota: null, captcha: "token", total_esperado: "305.00",
    };
    await pedir({
      ...pedido, tenant_id: "x", p_cuenta: "y", precio: "1.00",
      cliente: { ...pedido.cliente, es_admin: true },
      direccion: { ...pedido.direccion, lat: 1 },
      items: [
        { ...item, precio_mxn: "0.01", modificadores: [{ opcion_id: ID.medio, cantidad: 1, precio_extra_mxn: "-99.00" }] },
        { producto_id: ID.combo, cantidad: 1, total: 0, componentes: [{ grupo_id: ID.slotPapas, producto_id: ID.papasGajo, cantidad: 1, gratis: true, modificadores: [{ opcion_id: ID.ranch, cantidad: 2, x: 1 }] }] },
      ],
    });
    expect(cuerpoEnviado(1)).toEqual({
      ...pedido,
      items: [
        item,
        { producto_id: ID.combo, cantidad: 1, componentes: [{ grupo_id: ID.slotPapas, producto_id: ID.papasGajo, cantidad: 1, modificadores: [{ opcion_id: ID.ranch, cantidad: 2 }] }] },
      ],
    });
  });
  it("pedir deja pasar la clave del intento si tiene forma de código; con otra forma no se reenvía; cotizar no la lleva", async () => {
    const pedido = { ...cotizar, accion: "pedir", cliente: { nombre: "Ana", telefono: "4771234567", email: null }, direccion: null, pago: "EFECTIVO", paga_con: null, nota: null, captcha: "token", total_esperado: "305.00" };
    await pedir({ ...pedido, clave: CODIGO });
    expect(cuerpoEnviado(0)).toEqual({ ...pedido, clave: CODIGO });
    await pedir(pedido);                                  // una página vieja, sin clave: como siempre
    expect(cuerpoEnviado(1)).toEqual(pedido);
    await pedir({ ...cotizar, clave: CODIGO });
    expect(cuerpoEnviado(2)).toEqual(cotizar);
    for (const clave of ["corta", `${CODIGO}x`, CODIGO.replace(/.$/, "+"), 7, null, { a: 1 }]) {
      const r = await pedir({ ...pedido, clave });
      expect(r.status, JSON.stringify(clave)).toBe(400);
      expect(await r.json()).toEqual({ error: "CUERPO_INVALIDO" });
    }
    expect(llamadas).toHaveLength(3);
  });
  it("un carrito sin forma no se reenvía", async () => {
    for (const items of [undefined, "muchos", [], Array.from({ length: 41 }, () => item), [5], [null]]) {
      const r = await pedir({ ...cotizar, items });
      expect(r.status, JSON.stringify(items)?.slice(0, 20)).toBe(400);
      expect(await r.json()).toEqual({ error: "CARRITO_INVALIDO" });
    }
    expect(llamadas).toHaveLength(0);
  });
  it("un 401 de la función (secreto mal puesto) sale como 503, y nada del cuerpo llega al registro", async () => {
    responder = () => json({ error: "NO_AUTORIZADO" }, 401);
    const r = await pedir(seguimiento);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "SERVICIO_NO_DISPONIBLE" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(CODIGO);
  });
  it("sin secreto configurado: 503 sin llamar", async () => {
    vi.stubEnv("VIM_TIENDA_SECRET", "");
    const r = await pedir(seguimiento);
    expect(r.status).toBe(503);
    expect(llamadas).toHaveLength(0);
  });
});
