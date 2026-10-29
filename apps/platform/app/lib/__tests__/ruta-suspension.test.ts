import { beforeEach, describe, expect, it, vi } from "vitest";

let patches: Record<string, unknown>[] = [];
let auditorias: Record<string, unknown>[] = [];

const sb = {
  from: (tabla: string) => ({
    update: (patch: Record<string, unknown>) => {
      if (tabla === "tenants") patches.push(patch);
      return { eq: () => Promise.resolve({ error: null }) };
    },
  }),
};
vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { PATCH } = await import("../../api/tenants/[id]/route");
const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = (body: unknown) => new Request("http://x/api/tenants/t1", { method: "PATCH", body: JSON.stringify(body) });
const base = { accion: "cambiar_estado", motivo: "No pagó la mensualidad de octubre", gracia_dias: 0 };

beforeEach(() => { patches = []; auditorias = []; });

describe("cambiar_estado: tipo de suspensión", () => {
  it("suspender exige el tipo", async () => {
    const r = await PATCH(pedir({ ...base, estado: "SUSPENDIDO" }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("TIPO_REQUERIDO");
    expect((await PATCH(pedir({ ...base, estado: "SUSPENDIDO", tipo_suspension: "OTRA_COSA" }), ctx)).status).toBe(400);
    expect(patches).toHaveLength(0);
  });
  it("suspender por falta de pago lo guarda", async () => {
    const r = await PATCH(pedir({ ...base, estado: "SUSPENDIDO", tipo_suspension: "FALTA_DE_PAGO" }), ctx);
    expect(r.status).toBe(200);
    expect(patches[0]).toMatchObject({ estado: "SUSPENDIDO", suspension_tipo: "FALTA_DE_PAGO" });
    expect(auditorias[0]).toMatchObject({ accion: "tenant.suspendido", payload: { suspension_tipo: "FALTA_DE_PAGO" } });
  });
  it("reactivar limpia el tipo", async () => {
    const r = await PATCH(pedir({ accion: "cambiar_estado", estado: "ACTIVO" }), ctx);
    expect(r.status).toBe(200);
    expect(patches[0]).toHaveProperty("suspension_tipo", null);
  });
  it("cancelar no pide tipo y lo limpia", async () => {
    const r = await PATCH(pedir({ ...base, estado: "CANCELADO" }), ctx);
    expect(r.status).toBe(200);
    expect(patches[0]).toHaveProperty("suspension_tipo", null);
  });
});
