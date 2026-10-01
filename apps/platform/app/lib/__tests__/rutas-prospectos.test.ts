import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Rutas de la bandeja de prospectos (0145). Se prueban con un cliente service_role simulado que
 * registra lo que se le pide: lo que importa es que un cambio inválido no llegue a la base, que
 * borrar exija motivo y que todo lo que sí se hace quede en la bitácora — sin el WhatsApp de la
 * persona dentro, que la bitácora no es lugar para datos de contacto.
 */

type Llamada = { tabla: string; op: string; args?: unknown; filtros: Record<string, unknown> };
let llamadas: Llamada[] = [];
let auditorias: Record<string, unknown>[] = [];
let fila: Record<string, unknown> | null;

const PROSPECTO = {
  id: "p1", nombre: "Ana López", whatsapp: "4771234567", negocio: "Tacos El Güero", cajas: 1, sucursales: 1,
  giro: "FOODTRUCK", usa_hoy: null, mensaje: null, origen: "sitio-web", utm_source: null, utm_campaign: null,
  estado: "NUEVO", notas: null, atendido_en: null, estado_cambiado_en: null, creado_en: "2026-09-30T10:00:00Z",
};

function tabla(nombre: string) {
  const ll: Llamada = { tabla: nombre, op: "select", filtros: {} };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (c: string, v: unknown) => { ll.filtros[c] = v; return q; },
    update: (args: unknown) => { ll.op = "update"; ll.args = args; llamadas.push(ll); return q; },
    delete: () => { ll.op = "delete"; llamadas.push(ll); return q; },
    maybeSingle: () => Promise.resolve({ data: fila, error: null }),
    then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(ok({ data: fila ? [fila] : [], error: null })),
  };
  return q;
}

const sb = { from: (t: string) => tabla(t) };

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb, actor: { id: "op1", nombre: "Operador", via: "cuenta" } }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { GET: listar } = await import("../../api/prospectos/route");
const { PATCH, DELETE } = await import("../../api/prospectos/[id]/route");

const ctx = { params: Promise.resolve({ id: "p1" }) };
const pedir = (metodo: string, body?: unknown) =>
  new Request("http://x/api/prospectos/p1", { method: metodo, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => { llamadas = []; auditorias = []; fila = { ...PROSPECTO }; });

describe("GET /api/prospectos", () => {
  it("devuelve la lista, el conteo por estado y el enlace de WhatsApp ya armado", async () => {
    const r = await listar(new Request("http://x/api/prospectos"));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.prospectos).toHaveLength(1);
    expect(j.prospectos[0].enlace).toMatch(/^https:\/\/wa\.me\/524771234567\?text=/);
    expect(j.conteo).toMatchObject({ NUEVO: 1, CONTACTADO: 0 });
  });

  it("un filtro de estado que no existe se rechaza", async () => {
    const r = await listar(new Request("http://x/api/prospectos?estado=CERRADO"));
    expect(r.status).toBe(400);
  });
});

describe("PATCH /api/prospectos/[id]", () => {
  it("cambia el estado y la nota, y lo deja en la bitácora con antes y después", async () => {
    const r = await PATCH(pedir("PATCH", { estado: "CONTACTADO", notas: " le marco el lunes " }), ctx);
    expect(r.status).toBe(200);
    const u = llamadas.find((l) => l.op === "update");
    expect(u).toMatchObject({ tabla: "prospectos", args: { estado: "CONTACTADO", notas: "le marco el lunes" }, filtros: { id: "p1" } });
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0]).toMatchObject({
      accion: "prospecto.seguimiento", tenantId: null,
      payload: { prospecto_id: "p1", negocio: "Tacos El Güero", estado_antes: "NUEVO", estado_despues: "CONTACTADO" },
    });
    // Ni el nombre de la persona ni su teléfono van a la bitácora.
    expect(JSON.stringify(auditorias[0])).not.toContain("4771234567");
    expect(JSON.stringify(auditorias[0])).not.toContain("Ana López");
  });

  it("un estado inventado no llega a la base", async () => {
    const r = await PATCH(pedir("PATCH", { estado: "CERRADO" }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("ESTADO_INVALIDO");
    expect(llamadas.filter((l) => l.op !== "select")).toEqual([]);
    expect(auditorias).toEqual([]);
  });

  it("un prospecto que no existe contesta 404 sin escribir", async () => {
    fila = null;
    const r = await PATCH(pedir("PATCH", { estado: "CONTACTADO" }), ctx);
    expect(r.status).toBe(404);
    expect(llamadas.filter((l) => l.op !== "select")).toEqual([]);
  });

  it("dejarlo como estaba no escribe ni audita", async () => {
    const r = await PATCH(pedir("PATCH", { estado: "NUEVO" }), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).sinCambios).toBe(true);
    expect(llamadas.filter((l) => l.op !== "select")).toEqual([]);
    expect(auditorias).toEqual([]);
  });
});

describe("DELETE /api/prospectos/[id]", () => {
  it("sin motivo de 10 caracteres no borra", async () => {
    for (const b of [undefined, {}, { motivo: "prueba" }]) {
      const r = await DELETE(pedir("DELETE", b), ctx);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("MOTIVO_REQUERIDO");
    }
    expect(llamadas.some((l) => l.op === "delete")).toBe(false);
  });

  it("con motivo borra ESE prospecto y lo asienta", async () => {
    const r = await DELETE(pedir("DELETE", { motivo: "Entrada de prueba del formulario" }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas.find((l) => l.op === "delete")).toMatchObject({ tabla: "prospectos", filtros: { id: "p1" } });
    expect(auditorias[0]).toMatchObject({
      accion: "prospecto.eliminar", tenantId: null, motivo: "Entrada de prueba del formulario",
      payload: { prospecto_id: "p1", negocio: "Tacos El Güero", estado: "NUEVO" },
    });
    expect(JSON.stringify(auditorias[0])).not.toContain("4771234567");
  });

  it("uno que ya no existe contesta 404", async () => {
    fila = null;
    const r = await DELETE(pedir("DELETE", { motivo: "Entrada de prueba del formulario" }), ctx);
    expect(r.status).toBe(404);
    expect(llamadas.some((l) => l.op === "delete")).toBe(false);
  });
});
