import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Auditoría integral 30/09/2026, hallazgos E-1 y E-2: el panel del admin
 *  · cortaba el "top productos" con `.limit(6)` sobre una vista que viene por SUCURSAL, así que
 *    con dos sucursales el mismo producto salía repetido y el líder real podía quedar fuera;
 *  · leía tickets (ventas por hora) y ticket_items (combos) sin paginar: PostgREST entrega como
 *    máximo 1000 filas y corta el resto sin avisar.
 * Aquí se simula PostgREST con ese tope para `leerDashboard` completo.
 */

type Fila = Record<string, unknown>;
const tablas: Record<string, Fila[]> = {};
const MAX_FILAS = 1000;

/** Constructor de consultas mínimo: ignora filtros (los datos ya vienen filtrados), respeta
 *  `order` por columnas, `limit` y `range`, y nunca entrega más de 1000 filas. */
function consulta(tabla: string) {
  let orden: string[] = [];
  let limite: number | null = null;
  let rango: [number, number] | null = null;
  const q = {
    select: () => q, eq: () => q, match: () => q, in: () => q, is: () => q, not: () => q, gte: () => q, lte: () => q,
    order: (col: string) => { orden = [...orden, col]; return q; },
    limit: (n: number) => { limite = n; return q; },
    range: (a: number, b: number) => { rango = [a, b]; return q; },
    maybeSingle: () => Promise.resolve({ data: (tablas[tabla] ?? [])[0] ?? null, error: null }),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) => {
      let filas = [...(tablas[tabla] ?? [])];
      if (orden.length) {
        filas.sort((x, y) => {
          for (const c of orden) {
            const a = String(x[c] ?? ""), b = String(y[c] ?? "");
            if (a !== b) return a < b ? -1 : 1;
          }
          return 0;
        });
      }
      const desde = rango ? rango[0] : 0;
      const hasta = rango ? rango[1] : Number.MAX_SAFE_INTEGER;
      filas = filas.slice(desde, Math.min(hasta + 1, desde + MAX_FILAS));
      if (limite != null) filas = filas.slice(0, limite);
      return Promise.resolve(ok({ data: filas, error: null }));
    },
  };
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: (t: string) => consulta(t),
    rpc: () => Promise.resolve({ data: "2026-09-29", error: null }),
  },
}));

const { leerDashboard, agregarTopProductos } = await import("../reportes");

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  tablas.tenants = [{ id: "t1", timezone: "America/Mexico_City", hora_cierre_dia_contable: "03:00:00" }];
  tablas.vw_estado_resultados_dia = [];
  tablas.turnos = [];
  tablas.tickets = [];
  tablas.ticket_items = [];
  tablas.vw_ventas_por_producto = [];
});

describe("top productos del panel (E-1)", () => {
  it("suma el producto de todas las sucursales antes de cortar el top", async () => {
    // Tacos vende 400 en cada una de 2 sucursales (800 en total) y no es el más alto en
    // ninguna fila suelta. Seis productos más venden 500 cada uno en una sola sucursal.
    const otros = Array.from({ length: 6 }, (_, i) => ({
      sucursal_id: "s1", producto_id: `p${i}`, producto_nombre: `Otro ${i}`, unidades_vendidas: 5, total_mxn: 500,
    }));
    tablas.vw_ventas_por_producto = [
      ...otros,
      { sucursal_id: "s1", producto_id: "tacos", producto_nombre: "Tacos", unidades_vendidas: 10, total_mxn: 400 },
      { sucursal_id: "s2", producto_id: "tacos", producto_nombre: "Tacos", unidades_vendidas: 10, total_mxn: 400 },
    ];
    const d = await leerDashboard("2026-09-29");
    expect(d.topProductos[0]).toEqual({ nombre: "Tacos", unidades: 20, total: 800 });
    expect(d.topProductos).toHaveLength(6);
    expect(d.topProductos.filter((p) => p.nombre === "Tacos")).toHaveLength(1);
  });

  it("agregarTopProductos no repite productos y ordena por importe", () => {
    const r = agregarTopProductos([
      { producto_id: "a", producto_nombre: "A", unidades_vendidas: 1, total_mxn: 10 },
      { producto_id: "b", producto_nombre: "B", unidades_vendidas: 1, total_mxn: 15 },
      { producto_id: "a", producto_nombre: "A", unidades_vendidas: 2, total_mxn: 10 },
    ], 6);
    expect(r).toEqual([{ nombre: "A", unidades: 3, total: 20 }, { nombre: "B", unidades: 1, total: 15 }]);
  });
});

describe("ventas por hora y combos sin el corte de 1000 filas (E-2)", () => {
  it("cuenta los 1,500 tickets del día en la gráfica por hora", async () => {
    tablas.tickets = Array.from({ length: 1500 }, (_, i) => ({
      id: String(i).padStart(5, "0"), fecha_pago: "2026-09-29T20:30:00Z", total_mxn: 100,
    }));
    const d = await leerDashboard("2026-09-29");
    const total = d.ventasPorHora.reduce((a, h) => a + h.total, 0);
    expect(total).toBe(150_000);
  });

  it("cuenta los 1,200 combos del día", async () => {
    tablas.ticket_items = Array.from({ length: 1200 }, (_, i) => ({ id: String(i).padStart(5, "0"), cantidad: 1 }));
    const d = await leerDashboard("2026-09-29");
    expect(d.combosVendidos).toBe(1200);
  });
});
