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
