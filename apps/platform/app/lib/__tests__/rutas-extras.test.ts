import { beforeEach, describe, expect, it, vi } from "vitest";
import { vistaPreviaCambioPlan } from "../cambio-plan";

/*
 * Extras por cantidad (0147, ADR 0024): sucursal adicional y caja adicional.
 * La regla vive en la base (`fijar_extra_tenant`, probada en smoke_extras.sql); aquí se prueba que
 * la ruta la llame bien, que traduzca sus rechazos a algo que el operador entienda, que todo quede
 * en la bitácora, y que el camino de los add-ons de siempre no pueda usarse para saltársela.
 */

type Llamada = { tipo: "from" | "rpc"; nombre: string; op?: string; args?: unknown };
let llamadas: Llamada[] = [];
let auditorias: Record<string, unknown>[] = [];
let rpcRespuesta: { data: unknown; error: { message: string; hint?: string } | null };

function tabla(nombre: string) {
  const q = {
    select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
    update: (args: unknown) => { llamadas.push({ tipo: "from", nombre, op: "update", args }); return q; },
    insert: (args: unknown) => { llamadas.push({ tipo: "from", nombre, op: "insert", args }); return Promise.resolve({ error: null }); },
    maybeSingle: () => Promise.resolve({ data: nombre === "addons" ? { id: "a1", nombre: "Caja adicional", precio_mensual_mxn: 249 } : null, error: null }),
    then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(ok({ data: [], error: null })),
  };
  return q;
}
const sb = {
  from: (t: string) => tabla(t),
  rpc: (nombre: string, args: unknown) => { llamadas.push({ tipo: "rpc", nombre, args }); return Promise.resolve(rpcRespuesta); },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { PATCH } = await import("../../api/tenants/[id]/route");
const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = (body: unknown) => new Request("http://x/api/tenants/t1", { method: "PATCH", body: JSON.stringify(body) });
const MOTIVO = "Abre su segunda caja el lunes";

beforeEach(() => {
  llamadas = []; auditorias = [];
  rpcRespuesta = { data: { codigo: "CAJA_EXTRA", cantidad_antes: 0, cantidad_despues: 2, precio_unitario: 249, importe_mensual: 498, limite_antes: 1, limite_despues: 3, en_uso: 1 }, error: null };
});

describe("extra_fijar", () => {
  it("va en UNA llamada a fijar_extra_tenant y queda en la bitácora con antes y después", async () => {
    const r = await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 2, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    const rpc = llamadas.filter((l) => l.tipo === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0]).toMatchObject({ nombre: "fijar_extra_tenant", args: { p_tenant_id: "t1", p_codigo: "CAJA_EXTRA", p_cantidad: 2, p_precio: null, p_notas: MOTIVO } });
    // Nada de escribir tenant_addons a mano: la regla (en uso, mismo día, sin límite) está en la base.
    expect(llamadas.some((l) => l.nombre === "tenant_addons" && (l.op === "insert" || l.op === "update"))).toBe(false);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.extra_fijar", tenantId: "t1", motivo: MOTIVO, payload: { codigo: "CAJA_EXTRA", cantidad_antes: 0, cantidad_despues: 2, limite_despues: 3 } });
    expect(await r.json()).toMatchObject({ ok: true, limite_despues: 3, importe_mensual: 498 });
  });

  it("un precio pactado explícito viaja a la base; uno inválido no llega", async () => {
    await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "SUCURSAL_EXTRA", cantidad: 1, precio_mensual_mxn: "499.50", motivo: MOTIVO }), ctx);
    expect(llamadas.find((l) => l.tipo === "rpc")?.args).toMatchObject({ p_codigo: "SUCURSAL_EXTRA", p_precio: 499.5 });
    llamadas = [];
    const r = await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "SUCURSAL_EXTRA", cantidad: 1, precio_mensual_mxn: -1, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("PRECIO_INVALIDO");
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
  });

  it("sin motivo, con un código que no es extra o con una cantidad rara: 400 sin llamar a la base", async () => {
    for (const b of [
      { accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 1 },
      { accion: "extra_fijar", addon_codigo: "CFDI", cantidad: 1, motivo: MOTIVO },
      { accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: -1, motivo: MOTIVO },
      { accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 1.5, motivo: MOTIVO },
      { accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: "dos", motivo: MOTIVO },
      { accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 51, motivo: MOTIVO },
    ]) {
      const r = await PATCH(pedir(b), ctx);
      expect(r.status, JSON.stringify(b)).toBe(400);
    }
    expect(llamadas.some((l) => l.tipo === "rpc")).toBe(false);
    expect(auditorias).toEqual([]);
  });

  it("quitar un extra que el cliente está usando se rechaza con el motivo de la base", async () => {
    rpcRespuesta = { data: null, error: { message: "EXTRA_EN_USO", hint: "Tiene 3 cajas activas en una sucursal y el límite quedaría en 2 por sucursal. Tiene que desactivar 1 antes." } };
    const r = await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 1, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toBe("EXTRA_EN_USO");
    expect(j.detalle).toContain("Tiene 3 cajas activas");
    expect(auditorias).toEqual([]);
  });

  it("una caja adicional en un plan con cajas sin límite se rechaza con su porqué", async () => {
    rpcRespuesta = { data: null, error: { message: "SIN_LIMITE", hint: "Su plan ya trae cajas sin límite: un extra no le añade nada." } };
    const r = await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 1, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(409);
    expect((await r.json()).detalle).toMatch(/sin límite/);
  });

  it("un error desconocido de la base no se disfraza de regla: 500", async () => {
    rpcRespuesta = { data: null, error: { message: "deadlock detected" } };
    const r = await PATCH(pedir({ accion: "extra_fijar", addon_codigo: "CAJA_EXTRA", cantidad: 1, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(500);
  });
});

describe("cambiar_plan con cajas que no caben (0147)", () => {
  it("la base lo rechaza y la ruta lo dice con sus números, como un choque (409), no como un error del servidor", async () => {
    rpcRespuesta = { data: null, error: { message: "CAJAS_EXCEDEN_PLAN", hint: "El plan Esencial da 1 caja(s) por sucursal. Tiene 2 caja(s) de más y 1 adicional(es) contratada(s): contrata 1 caja(s) adicional(es) o desactiva cajas antes de cambiar." } };
    const r = await PATCH(pedir({ accion: "cambiar_plan", plan_id: "plan-2", motivo: MOTIVO }), ctx);
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toBe("CAJAS_EXCEDEN_PLAN");
    expect(j.detalle).toContain("Tiene 2 caja(s) de más");
    expect(auditorias).toEqual([]);
  });
});

describe("los extras no entran por el camino de los add-ons de siempre", () => {
  it("addon_activar y addon_desactivar los rechazan: saltarían la cantidad y la comprobación de uso", async () => {
    for (const accion of ["addon_activar", "addon_desactivar"]) {
      const r = await PATCH(pedir({ accion, addon_codigo: "CAJA_EXTRA", motivo: MOTIVO }), ctx);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("ES_EXTRA_POR_CANTIDAD");
    }
    expect(llamadas.filter((l) => l.op === "insert" || l.op === "update")).toEqual([]);
  });
});

// ── Vista previa del cambio de plan ─────────────────────────────────────────────────────────────
describe("vistaPreviaCambioPlan con extras (0147)", () => {
  const cadena = { id: "p-cad", nombre: "Cadena", precio_mensual_mxn: 1999, timbres_cfdi_mensuales: 40, features_incluidos: {}, max_sucursales: 3, max_cajas_por_sucursal: null };
  const negocio = { id: "p-neg", nombre: "Negocio", precio_mensual_mxn: 999, timbres_cfdi_mensuales: 20, features_incluidos: {}, max_sucursales: 1, max_cajas_por_sucursal: 3 };
  const extras = [
    { codigo: "CAJA_EXTRA", activo: true, precio: 249, incluidoEnPlan: false, cantidad: 2 },
    { codigo: "SUCURSAL_EXTRA", activo: true, precio: 599, incluidoEnPlan: false, cantidad: 1 },
  ];
  const base = { foliosAntes: 10, suscripcion: null, hoy: "2026-10-01" };

  it("al subir a Cadena se retiran las cajas adicionales (ya no hay límite) y se conserva la sucursal", () => {
    const v = vistaPreviaCambioPlan({ ...base, nuevo: cadena, addons: extras });
    expect(v.retiraExtras).toEqual([{ codigo: "CAJA_EXTRA", cantidad: 2, importe: 498 }]);
  });

  it("entre planes con límite los extras se conservan", () => {
    expect(vistaPreviaCambioPlan({ ...base, nuevo: negocio, addons: extras }).retiraExtras).toEqual([]);
  });

  it("una excepción de límite que ya tiene el cliente manda como base: con ella no se retira", () => {
    const v = vistaPreviaCambioPlan({ ...base, nuevo: cadena, addons: extras, excepcion: { max_sucursales: null, max_cajas_por_sucursal: 5 } });
    expect(v.retiraExtras).toEqual([]);
  });

  it("los extras no se confunden con los add-ons que incluye el plan", () => {
    const v = vistaPreviaCambioPlan({ ...base, nuevo: cadena, addons: extras });
    expect(v.concede).toEqual([]);
    expect(v.retira).toEqual([]);
  });
});
