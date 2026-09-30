import { describe, it, expect, vi, beforeEach } from "vitest";
import { precioValido } from "../precio";

/*
 * Auditoría integral 30/09/2026:
 *  · E-3 — `suscripcion_activar` y `addon_activar` guardaban `Number(body.precio)` sin validar, y
 *    activar el cobro eran tres escrituras sueltas (expirar, insertar, pasar a ACTIVO).
 *  · E-4 — impersonar tenía un motivo por defecto; ahora lo exige.
 * Se prueban las rutas con un cliente service_role simulado que registra lo que se le pide.
 */

type Llamada = { tipo: "from" | "rpc"; nombre: string; op?: string; args?: unknown };
let llamadas: Llamada[] = [];

function tabla(nombre: string) {
  const datos: Record<string, unknown> = {
    tenants: { plan_actual_id: "plan-1", plan: { precio_mensual_mxn: 899, codigo: "ESENCIAL" }, usuario_dueno_id: "u1", estado: "TRIAL", prueba_hasta: "2026-10-30" },
    addons: { id: "a1", nombre: "Delivery", precio_mensual_mxn: 100 },
  };
  const q = {
    select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
    update: (args: unknown) => { llamadas.push({ tipo: "from", nombre, op: "update", args }); return q; },
    insert: (args: unknown) => { llamadas.push({ tipo: "from", nombre, op: "insert", args }); return Promise.resolve({ error: null }); },
    maybeSingle: () => Promise.resolve({ data: datos[nombre] ?? null, error: null }),
    then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(ok({ data: [], error: null })),
  };
  return q;
}

const sb = {
  from: (t: string) => tabla(t),
  rpc: (nombre: string, args: unknown) => { llamadas.push({ tipo: "rpc", nombre, args }); return Promise.resolve({ data: {}, error: null }); },
  auth: {
    admin: {
      getUserById: () => Promise.resolve({ data: { user: { email: "dueno@ejemplo.mx" } }, error: null }),
      generateLink: () => Promise.resolve({ data: { properties: { action_link: "https://enlace" } }, error: null }),
    },
  },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb }),
  auditar: (_sb: unknown, a: unknown) => { llamadas.push({ tipo: "from", nombre: "super_admin_accesos", op: "auditar", args: a }); return Promise.resolve(); },
}));

const { PATCH } = await import("../../api/tenants/[id]/route");
const { POST: impersonar } = await import("../../api/tenants/[id]/impersonar/route");

const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = (body: unknown) => new Request("http://x/api/tenants/t1", { method: "PATCH", body: JSON.stringify(body) });
const MOTIVO = "Cliente firmó contrato anual";

beforeEach(() => { llamadas = []; });

describe("precioValido", () => {
  it("acepta importes de $0 en adelante con hasta dos decimales", () => {
    expect(precioValido(0)).toBe(0);
    expect(precioValido(899)).toBe(899);
    expect(precioValido("499.50")).toBe(499.5);
  });
  it("rechaza negativos, NaN, vacíos, booleanos y más de dos decimales", () => {
    for (const v of [-1, Number.NaN, Infinity, "", "abc", true, {}, 1.005, 100_000_000]) expect(precioValido(v)).toBeNull();
  });
});

describe("suscripcion_activar (E-3)", () => {
  it("un precio negativo se rechaza con 400 y no toca la base", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO, precio: -1 }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("PRECIO_INVALIDO");
    expect(llamadas.filter((l) => l.op === "update" || l.op === "insert" || l.tipo === "rpc")).toEqual([]);
  });

  it("un precio no numérico se rechaza con 400", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO, precio: "abc" }), ctx);
    expect(r.status).toBe(400);
  });

  it("activa en UNA llamada atómica (RPC), no expirando e insertando por separado", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    const rpc = llamadas.filter((l) => l.tipo === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0]!.nombre).toBe("activar_suscripcion");
    expect(rpc[0]!.args).toMatchObject({ p_tenant_id: "t1", p_precio: 899, p_ciclo: "MENSUAL" });
    expect(llamadas.some((l) => l.nombre === "suscripciones")).toBe(false);
  });
});

describe("addon_activar (E-3)", () => {
  it("un precio explícito negativo se rechaza con 400 antes de escribir", async () => {
    const r = await PATCH(pedir({ accion: "addon_activar", addon_codigo: "OTRO", precio_mensual_mxn: -50 }), ctx);
    expect(r.status).toBe(400);
    expect(llamadas.filter((l) => l.op === "insert" || l.op === "update")).toEqual([]);
  });
});

describe("impersonar (E-4)", () => {
  const post = (body?: unknown) => new Request("http://x/api/tenants/t1/impersonar", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  it("sin motivo responde 400 MOTIVO_REQUERIDO y no genera enlace", async () => {
    for (const b of [undefined, {}, { motivo: "   soporte " }]) {
      const r = await impersonar(post(b), ctx);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("MOTIVO_REQUERIDO");
    }
    expect(llamadas.some((l) => l.op === "auditar")).toBe(false);
  });

  it("con motivo genera el enlace y audita ESE motivo", async () => {
    const r = await impersonar(post({ motivo: "No le cuadra el corte del lunes" }), ctx);
    expect(r.status).toBe(200);
    const a = llamadas.find((l) => l.op === "auditar");
    expect(a?.args).toMatchObject({ accion: "tenant.impersonar", motivo: "No le cuadra el corte del lunes" });
  });
});

// ── 0141: promoción, cambio de plan y prueba ─────────────────────────────────────────────────
describe("suscripcion_activar con promoción (0141)", () => {
  it("pasa la promoción a la RPC en la misma llamada", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO, precio: 699, promocion: { precio: 499, hasta: "2099-03-31", nombre: "Piloto 5 negocios" } }), ctx);
    expect(r.status).toBe(200);
    const rpc = llamadas.filter((l) => l.tipo === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0]!.args).toMatchObject({ p_precio: 699, p_promo_precio: 499, p_promo_hasta: "2099-03-31", p_promo_nombre: "Piloto 5 negocios" });
  });
  it("sin promoción manda los tres en null", async () => {
    await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO }), ctx);
    expect(llamadas.find((l) => l.tipo === "rpc")!.args).toMatchObject({ p_promo_precio: null, p_promo_hasta: null, p_promo_nombre: null });
  });
  it("una promoción igual o más cara que la lista se rechaza con 400 sin llamar a la base", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO, precio: 699, promocion: { precio: 699, hasta: "2099-03-31" } }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("PROMOCION_PRECIO_INVALIDO");
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
  });
});

describe("cambiar_plan (0141)", () => {
  it("va en UNA llamada a cambiar_plan_tenant, no escribiendo tenants a mano", async () => {
    const r = await PATCH(pedir({ accion: "cambiar_plan", plan_id: "plan-2", motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    const rpc = llamadas.filter((l) => l.tipo === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0]).toMatchObject({ nombre: "cambiar_plan_tenant", args: { p_tenant_id: "t1", p_plan_id: "plan-2", p_precio: null } });
    expect(llamadas.some((l) => l.nombre === "tenants" && l.op === "update")).toBe(false);
    expect(llamadas.find((l) => l.op === "auditar")?.args).toMatchObject({ accion: "tenant.cambiar_plan", motivo: MOTIVO });
  });
  it("un precio pactado inválido se rechaza antes de llamar a la base", async () => {
    const r = await PATCH(pedir({ accion: "cambiar_plan", plan_id: "plan-2", motivo: MOTIVO, precio: -1 }), ctx);
    expect(r.status).toBe(400);
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
  });
  it("sin motivo no cambia nada", async () => {
    const r = await PATCH(pedir({ accion: "cambiar_plan", plan_id: "plan-2" }), ctx);
    expect(r.status).toBe(400);
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
  });
});

describe("prueba_extender (0141)", () => {
  it("más de seis meses de prueba se rechaza", async () => {
    const r = await PATCH(pedir({ accion: "prueba_extender", prueba_hasta: "2099-01-01", motivo: MOTIVO }), ctx);
    expect(r.status).toBe(400);
  });
  it("con una fecha válida actualiza tenants y audita", async () => {
    const { hoyMx, sumarDias } = await import("@vim/fecha");
    const nueva = sumarDias(hoyMx(), 20);
    const r = await PATCH(pedir({ accion: "prueba_extender", prueba_hasta: nueva, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas.find((l) => l.nombre === "tenants" && l.op === "update")?.args).toEqual({ prueba_hasta: nueva });
    expect(llamadas.find((l) => l.op === "auditar")?.args).toMatchObject({ accion: "tenant.prueba_extender", payload: { antes: "2026-10-30", despues: nueva } });
  });
  it("sin motivo o con fecha pasada, 400", async () => {
    expect((await PATCH(pedir({ accion: "prueba_extender", prueba_hasta: "2099-01-01" }), ctx)).status).toBe(400);
    expect((await PATCH(pedir({ accion: "prueba_extender", prueba_hasta: "2020-01-01", motivo: MOTIVO }), ctx)).status).toBe(400);
    expect(llamadas.some((l) => l.op === "update")).toBe(false);
  });
});

describe("cobro por adelantado (decisión 30/09/2026)", () => {
  it("el primer cobro vence el mismo día de la activación", async () => {
    await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO }), ctx);
    const args = llamadas.find((l) => l.tipo === "rpc")!.args as { p_inicio: string; p_proxima: string };
    expect(args.p_proxima).toBe(args.p_inicio);
  });
  it("una promoción con cobro anual se rechaza con 400 sin llamar a la base", async () => {
    const r = await PATCH(pedir({ accion: "suscripcion_activar", motivo: MOTIVO, ciclo: "ANUAL", promocion: { precio: 499, hasta: "2099-03-31" } }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("PROMOCION_CICLO_INVALIDO");
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
  });
  it("una fecha que no existe se contesta con 400 en español, no con el 500 de la base", async () => {
    const r = await PATCH(pedir({ accion: "prueba_extender", prueba_hasta: "2027-02-30", motivo: MOTIVO }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).detalle).toMatch(/no existe/);
  });
});
