import { describe, expect, it, vi } from "vitest";

// Doble mínimo de PostgREST: aplica de verdad los filtros `eq` e `is` sobre las filas de cada
// tabla, para que la prueba mire el RESULTADO (qué renglones salen) y no solo qué se llamó.
type Fila = Record<string, unknown>;
const { tablas } = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]> }));

function consulta(filas: Fila[]) {
  let vivas = filas;
  const q = {
    select: () => q,
    order: () => q,
    or: () => q, // el filtro de hijos de combo no se modela: aquí no hay combos
    eq: (col: string, v: unknown) => { vivas = vivas.filter((f) => f[col] === v); return q; },
    is: (col: string, v: unknown) => { vivas = vivas.filter((f) => (f[col] ?? null) === v); return q; },
    maybeSingle: async () => ({ data: vivas[0] ?? null, error: null }),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: vivas, error: null }).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({
  employeeClient: () => ({ from: (t: string) => consulta(tablas[t] ?? []) }),
}));

import { leerItemsPersistidos } from "../cancelacion";

describe("leerItemsPersistidos", () => {
  it("no devuelve el renglón de envío: no es un producto y no es cancelable", async () => {
    // Sin el filtro, home-pos lo comparaba contra el catálogo y avisaba "fuera de catálogo" en
    // cada domicilio con envío.
    tablas.ticket_items = [
      { id: "i1", ticket_id: "t1", client_id_local: "c1", producto_nombre_snapshot: "Hamburguesa", cantidad: 2, total_item_mxn: "240.00", cancelado: false, cargo_tipo: null },
      { id: "i2", ticket_id: "t1", client_id_local: null, producto_nombre_snapshot: "Envío · Zona Norte", cantidad: 1, total_item_mxn: "35.00", cancelado: false, cargo_tipo: "ENVIO" },
    ];
    tablas.tickets = [{ id: "t1", estado_cocina: "PENDIENTE" }];

    const items = await leerItemsPersistidos("token", "t1");
    expect(items.map((i) => i.productoNombre)).toEqual(["Hamburguesa"]);
  });
});
