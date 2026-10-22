import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble mínimo de PostgREST que aplica `eq`/`is` de verdad sobre filas en memoria, y ejecuta el
// `update` sobre las que pasan el filtro. Así se prueba qué renglones se mandan a cocina, no solo
// qué métodos se llamaron.
type Fila = Record<string, unknown>;
const { tablas } = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]> }));

function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  let cambios: Fila | null = null;
  let contar = false;
  const vivas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
  const resolver = () => {
    const filas = vivas();
    if (cambios) for (const f of filas) Object.assign(f, cambios);
    return contar ? { count: filas.length, error: null } : { data: filas, error: null };
  };
  const q = {
    update: (v: Fila) => { cambios = v; return q; },
    select: (_c?: string, o?: { count?: string }) => { contar = Boolean(o?.count); return q; },
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    maybeSingle: async () => ({ data: vivas()[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({ employeeClient: () => ({ from: consulta }) }));

import { contarPendientesCocina, enviarACocina } from "../mesero";

describe("cocina y el renglón de envío (M2)", () => {
  beforeEach(() => {
    // Pedido ya mandado a cocina; después el cajero cambió la zona y entró un renglón de envío nuevo.
    tablas.ticket_items = [
      { id: "i1", ticket_id: "t1", cancelado: false, enviado_cocina_at: "2026-09-22T12:00:00Z", cargo_tipo: null },
      { id: "e1", ticket_id: "t1", cancelado: false, enviado_cocina_at: null, cargo_tipo: "ENVIO" },
    ];
    tablas.tickets = [{ id: "t1", estado_cocina: "EN_COCINA" }];
  });

  it("el envío no cuenta como pendiente de cocina", async () => {
    expect(await contarPendientesCocina("tk", "t1")).toBe(0);
  });

  it("enviar a cocina no manda el envío (y no hay comanda que imprimir)", async () => {
    expect(await enviarACocina("tk", "t1")).toEqual([]);
  });
});

describe("resumirPropinas", () => {
  it("suma propinas y ventas del turno sin arrastrar decimales", async () => {
    const { resumirPropinas } = await import("../mesero");
    const r = resumirPropinas([
      { total_mxn: "110.10", propina_mxn: "11.01" },
      { total_mxn: 55.2, propina_mxn: 0 },
      { total_mxn: "99.90", propina_mxn: "9.99" },
    ]);
    expect(r).toEqual({ totalMxn: 21, totalVendidoMxn: 265.2, ticketsConPropina: 2, promedioMxn: 88.4 });
  });

  it("sin cuentas cobradas todo queda en cero (no divide entre cero)", async () => {
    const { resumirPropinas } = await import("../mesero");
    expect(resumirPropinas([])).toEqual({ totalMxn: 0, totalVendidoMxn: 0, ticketsConPropina: 0, promedioMxn: 0 });
  });
});

describe("una sola comanda por venta (comida rápida al cobrar)", () => {
  beforeEach(() => {
    tablas.ticket_items = [
      { id: "i1", ticket_id: "t2", cancelado: false, enviado_cocina_at: null, cargo_tipo: null },
      { id: "i2", ticket_id: "t2", cancelado: true, enviado_cocina_at: null, cargo_tipo: null },
    ];
    tablas.tickets = [{ id: "t2", estado_cocina: "SIN_ENVIAR" }];
  });

  it("el primer envío marca lo pendiente y pone la venta EN_COCINA; el segundo no trae nada que imprimir", async () => {
    expect(await enviarACocina("tk", "t2")).toEqual(["i1"]);
    expect(tablas.tickets[0].estado_cocina).toBe("EN_COCINA");
    expect(await enviarACocina("tk", "t2")).toEqual([]);
  });
});
