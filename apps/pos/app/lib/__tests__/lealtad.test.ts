import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const { tablas, rpcs } = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  rpcs: [] as { nombre: string; args: Fila }[],
}));

// Doble de PostgREST: filtra de verdad sobre filas en memoria.
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    gte: (col: string, v: string) => { filtros = [...filtros, (f) => new Date(String(f[col])).getTime() >= new Date(v).getTime()]; return q; },
    order: () => q,
    limit: () => q,
    single: async () => ({ data: filas()[0] ?? null, error: filas()[0] ? null : { message: "sin fila" } }),
    maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({
  employeeClient: () => ({
    from: consulta,
    rpc: async (nombre: string, args: Fila) => {
      rpcs.push({ nombre, args });
      if (nombre === "quitar_canje_lealtad") {
        for (const c of tablas.ticket_canjes_lealtad ?? []) if (c.ticket_id === args.p_ticket_id) c.revertido = true;
        return { data: 1, error: null };
      }
      if (nombre === "agregar_item_a_ticket") return { data: "item-nuevo", error: null };
      return { data: null, error: { message: `rpc sin doble: ${nombre}` } };
    },
  }),
  urlFuncion: (n: string) => `http://gw/functions/v1/${n}`,
  encabezadosFuncion: (t: string) => ({ apikey: "anon", Authorization: `Bearer ${t}`, "Content-Type": "application/json" }),
}));

import {
  agregarRenglonPremio, asentar, canjear, comprasQueSumanHoy, consultarSaldo, leerCanjeDelTicket, leerClienteLealtad,
  leerPremios, leerPrograma, leerSaldoLocal, quitarCanje,
} from "../lealtad";

beforeEach(() => {
  rpcs.length = 0;
  for (const k of Object.keys(tablas)) delete tablas[k];
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("lecturas bajo RLS", () => {
  it("el programa llega con números, no con los textos de numeric", async () => {
    tablas.lealtad_programa = [{ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: "5.00", pesos_por_punto: null, compra_minima_mxn: "100.00", tope_compras_dia: 3 }];
    expect(await leerPrograma("tk")).toEqual({ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 100, topeComprasDia: 3 });
  });

  it("sin programa configurado devuelve null", async () => {
    tablas.lealtad_programa = [];
    expect(await leerPrograma("tk")).toBeNull();
  });

  it("los premios traen el nombre de su producto; los apagados y los borrados no salen", async () => {
    tablas.lealtad_premios = [
      { id: "pr-1", costo: 6, activo: true, deleted_at: null, producto: { id: "p-1", nombre: "Hamburguesa" } },
      { id: "pr-2", costo: 3, activo: false, deleted_at: null, producto: { id: "p-2", nombre: "Refresco" } },
      { id: "pr-3", costo: 9, activo: true, deleted_at: "2026-10-01", producto: { id: "p-3", nombre: "Malteada" } },
      { id: "pr-4", costo: 4, activo: true, deleted_at: null, producto: null },
    ];
    expect(await leerPremios("tk")).toEqual([{ id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", costo: 6 }]);
  });

  it("el cliente de la lealtad: nombre completo y teléfono", async () => {
    tablas.clientes = [{ id: "c-1", nombre: "Ana", apellido_paterno: "Gómez", telefono: "4771234567", deleted_at: null }];
    expect(await leerClienteLealtad("tk", "c-1")).toEqual({ clienteId: "c-1", nombre: "Ana Gómez", telefono: "4771234567" });
    expect(await leerClienteLealtad("tk", "c-x")).toBeNull();
  });

  it("un saldo de otra versión del programa ya no vale", async () => {
    tablas.lealtad_saldos = [{ cliente_id: "c-1", saldo: 120, vence_el: "2027-04-05", programa_version: 1 }];
    expect(await leerSaldoLocal("tk", "c-1", 1)).toEqual({ saldo: 120, venceEl: "2027-04-05" });
    expect(await leerSaldoLocal("tk", "c-1", 2)).toEqual({ saldo: 0, venceEl: null });
    expect(await leerSaldoLocal("tk", "c-nuevo", 1)).toEqual({ saldo: 0, venceEl: null });
  });

  it("cuenta las compras de HOY (hora de México) que ya le sumaron, una por cuenta", async () => {
    tablas.lealtad_movimientos = [
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-a", fecha: "2026-10-06T15:00:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-a", fecha: "2026-10-06T15:05:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-b", fecha: "2026-10-06T17:00:00Z" },
      { cliente_id: "c-1", tipo: "GANADO", ticket_id: "t-ayer", fecha: "2026-10-06T03:00:00Z" }, // 21:00 del 5 en México
      { cliente_id: "c-1", tipo: "CANJE", ticket_id: "t-c", fecha: "2026-10-06T17:00:00Z" },
      { cliente_id: "c-2", tipo: "GANADO", ticket_id: "t-d", fecha: "2026-10-06T17:00:00Z" },
    ];
    expect(await comprasQueSumanHoy("tk", "c-1", new Date("2026-10-06T18:00:00Z"))).toBe(2);
  });

  it("el canje vivo de una cuenta; uno revertido no cuenta", async () => {
    tablas.ticket_canjes_lealtad = [
      { id: "cj-0", ticket_id: "tk-1", puntos: 20, monto_descontado_mxn: "20.00", premio_id: null, ticket_item_id: null, revertido: true },
      { id: "cj-1", ticket_id: "tk-1", puntos: 50, monto_descontado_mxn: "50.00", premio_id: null, ticket_item_id: null, revertido: false },
    ];
    expect(await leerCanjeDelTicket("tk", "tk-1")).toEqual({ id: "cj-1", puntos: 50, monto: 50, premioId: null, ticketItemId: null });
    expect(await leerCanjeDelTicket("tk", "otra")).toBeNull();
  });
});

describe("escrituras directas", () => {
  it("quitar el canje llama a la única RPC que el POS puede usar", async () => {
    expect(await quitarCanje("tk", "tk-1")).toBe(1);
    expect(rpcs).toEqual([{ nombre: "quitar_canje_lealtad", args: { p_ticket_id: "tk-1" } }]);
  });

  it("el premio entra como renglón propio de UNA pieza, sin modificadores, y devuelve su id", async () => {
    expect(await agregarRenglonPremio("tk", { ticketId: "tk-1", productoId: "p-1", clientId: "premio-abc" })).toBe("item-nuevo");
    expect(rpcs[0]).toEqual({
      nombre: "agregar_item_a_ticket",
      args: { p_ticket_id: "tk-1", p_producto_id: "p-1", p_cantidad: 1, p_nota_cocina: "Premio de lealtad", p_modificadores: [], p_client_id_local: "premio-abc" },
    });
  });
});

describe("llamadas a lealtad-canje", () => {
  const responder = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("saldo: manda cliente y teléfono con el token del empleado, a la URL de runtime", async () => {
    const f = responder(200, { ok: true, cliente_id: "c-1", saldo: 120, vence_el: null, mecanica: "PUNTOS_DINERO", programa_version: 1 });
    vi.stubGlobal("fetch", f);
    const r = await consultarSaldo("tk-emp", { clienteId: "c-1", telefono: "4771234567" });
    expect(r).toMatchObject({ ok: true, saldo: 120 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://gw/functions/v1/lealtad-canje");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tk-emp");
    expect(JSON.parse(String(init.body))).toEqual({ accion: "saldo", cliente_id: "c-1", telefono: "4771234567" });
  });

  it("canjear dinero manda puntos y la cuenta; canjear premio manda el premio y no puntos", async () => {
    const f = responder(200, { ok: true, canje_id: "cj", puntos: 50, monto_mxn: 50, premio_id: null, producto_id: null, saldo: 70, repetido: false });
    vi.stubGlobal("fetch", f);
    await canjear("tk", { canjeId: "cj", ticketId: "tk-1", clienteId: "c-1", telefono: null, puntos: 50, sucursalId: "s-1" });
    await canjear("tk", { canjeId: "cj2", ticketId: "tk-1", clienteId: "c-1", telefono: "477", premioId: "pr-1", sucursalId: "s-1" });
    const cuerpos = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(cuerpos[0]).toEqual({ accion: "canjear", canje_id: "cj", ticket_id: "tk-1", cliente_id: "c-1", puntos: 50, sucursal_id: "s-1" });
    expect(cuerpos[1]).toEqual({ accion: "canjear", canje_id: "cj2", ticket_id: "tk-1", cliente_id: "c-1", telefono: "477", premio_id: "pr-1", sucursal_id: "s-1" });
  });

  it("asentar manda el renglón solo si lo hay", async () => {
    const f = responder(200, { ok: true, canje_id: "cj" });
    vi.stubGlobal("fetch", f);
    await asentar("tk", { canjeId: "cj", ticketId: "tk-1" });
    await asentar("tk", { canjeId: "cj", ticketId: "tk-1", ticketItemId: "it-9" });
    const cuerpos = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(cuerpos[0]).toEqual({ accion: "asentar", canje_id: "cj", ticket_id: "tk-1" });
    expect(cuerpos[1]).toEqual({ accion: "asentar", canje_id: "cj", ticket_id: "tk-1", ticket_item_id: "it-9" });
  });

  it("un 409 de negocio devuelve su código y, si viene, el saldo real", async () => {
    vi.stubGlobal("fetch", responder(409, { ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 }));
    expect(await canjear("tk", { canjeId: "cj", ticketId: "tk-1", clienteId: "c-1", telefono: null, puntos: 50, sucursalId: "s" }))
      .toEqual({ ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 });
  });

  it("los errores sin `ok` (403, 503) también llegan con su código", async () => {
    vi.stubGlobal("fetch", responder(503, { error: "FUNCION_REQUIERE_NUBE", funcion: "lealtad-canje" }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "FUNCION_REQUIERE_NUBE" });
  });

  it("si la red se cae es SIN_RED; si contestan algo que no es JSON, HTTP_<status>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "SIN_RED" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "HTTP_502" });
  });

  it("un 200 sin ok:true no se da por bueno ni por rechazo: es una respuesta inválida (ambigua)", async () => {
    vi.stubGlobal("fetch", responder(200, { cliente_id: "c-1" }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "RESPUESTA_INVALIDA" });
    // Aunque el cuerpo traiga un `error`, con 2xx no se le cree como rechazo limpio.
    vi.stubGlobal("fetch", responder(200, { ok: false, error: "SALDO_INSUFICIENTE" }));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "RESPUESTA_INVALIDA" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await consultarSaldo("tk", { clienteId: "c-1", telefono: null })).toEqual({ ok: false, error: "RESPUESTA_INVALIDA" });
  });
});
