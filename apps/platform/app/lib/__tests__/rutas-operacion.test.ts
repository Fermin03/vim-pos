import { beforeEach, describe, expect, it, vi } from "vitest";

type Llamada = { nombre: string; args: unknown };
let llamadas: Llamada[] = [];
let auditorias: Record<string, unknown>[] = [];
let rpcRespuesta: { data: unknown; error: { message: string } | null };

const sb = {
  from: () => { throw new Error("operación no debe tocar tablas a mano"); },
  rpc: (nombre: string, args: unknown) => { llamadas.push({ nombre, args }); return Promise.resolve(rpcRespuesta); },
};
vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { PATCH } = await import("../../api/tenants/[id]/route");
const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = (body: unknown) => new Request("http://x/api/tenants/t1", { method: "PATCH", body: JSON.stringify(body) });
const MOTIVO = "El food truck ya reparte a domicilio";

beforeEach(() => {
  llamadas = []; auditorias = [];
  rpcRespuesta = { data: { operacion: { domicilio: true }, ajustes: [] }, error: null };
});

describe("operacion", () => {
  it("una llamada a operacion_cambiar y queda en la bitácora", async () => {
    const r = await PATCH(pedir({ accion: "operacion", cambios: { domicilio: true }, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas).toEqual([{ nombre: "operacion_cambiar", args: { p_tenant: "t1", p_cambios: { domicilio: true } } }]);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.operacion", tenantId: "t1", motivo: MOTIVO, payload: { cambios: { domicilio: true } } });
  });
  it("sin motivo o con cambios que no son un objeto, ni llega a la base", async () => {
    expect((await PATCH(pedir({ accion: "operacion", cambios: { domicilio: true } }), ctx)).status).toBe(400);
    expect((await PATCH(pedir({ accion: "operacion", cambios: [true], motivo: MOTIVO }), ctx)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
  it("cuentas abiertas = 409 con cuántas, en palabras", async () => {
    rpcRespuesta = { data: null, error: { message: "CUENTAS_ABIERTAS_COMEDOR: 3" } };
    const r = await PATCH(pedir({ accion: "operacion", cambios: { comedor: false }, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(409);
    const b = await r.json();
    expect(b.error).toBe("CUENTAS_ABIERTAS_COMEDOR");
    expect(b.detalle).toMatch(/3 cuentas de mesa abiertas/);
    expect(auditorias).toHaveLength(0);
  });
  it("dependencia faltante = 409 que dice qué encender primero", async () => {
    rpcRespuesta = { data: null, error: { message: "MESEROS_REQUIERE_COMEDOR" } };
    const b = await (await PATCH(pedir({ accion: "operacion", cambios: { meseros: true }, motivo: MOTIVO }), ctx)).json();
    expect(b.detalle).toMatch(/primero enciende Comedor/);
  });
  it("algo desconocido de la base = 500 con el mensaje", async () => {
    rpcRespuesta = { data: null, error: { message: "boom" } };
    expect((await PATCH(pedir({ accion: "operacion", cambios: { comedor: true }, motivo: MOTIVO }), ctx)).status).toBe(500);
  });
});

describe("cambiar_giro", () => {
  it("una llamada a cambiar_giro y queda en la bitácora con los avisos", async () => {
    rpcRespuesta = { data: { operacion: {}, avisos: ["El comedor sigue encendido porque tiene 1 cuentas abiertas."] }, error: null };
    const r = await PATCH(pedir({ accion: "cambiar_giro", giro: "FOODTRUCK", reaplicar: true, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas).toEqual([{ nombre: "cambiar_giro", args: { p_tenant: "t1", p_giro: "FOODTRUCK", p_reaplicar: true } }]);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.cambiar_giro", payload: { giro: "FOODTRUCK", reaplicar: true } });
    expect((await r.json()).avisos).toHaveLength(1);
  });
  it("giro nuevo para un negocio que ya existe = 409 que explica por qué", async () => {
    rpcRespuesta = { data: null, error: { message: "GIRO_NO_DISPONIBLE: BAR" } };
    const b = await (await PATCH(pedir({ accion: "cambiar_giro", giro: "BAR", reaplicar: false, motivo: MOTIVO }), ctx)).json();
    expect(b.error).toBe("GIRO_NO_DISPONIBLE");
    expect(b.detalle).toMatch(/cajas/);
  });
  it("un giro que no está en el catálogo no llega a la base", async () => {
    expect((await PATCH(pedir({ accion: "cambiar_giro", giro: "SUPERMERCADO", reaplicar: false, motivo: MOTIVO }), ctx)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});
