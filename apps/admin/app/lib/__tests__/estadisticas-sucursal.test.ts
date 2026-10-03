import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * El panel y los reportes se miran por sucursal (una por defecto, "Todas" a elección). Aquí se
 * simula PostgREST aplicando DE VERDAD los filtros de igualdad (`eq` y `match`, también sobre la
 * tabla embebida `ticket.`): si una consulta olvida acotar a la sucursal, la otra se cuela en
 * la cifra y la prueba lo nota.
 */

type Fila = Record<string, unknown>;
const tablas: Record<string, Fila[]> = {};

const valorDe = (f: Fila, col: string): unknown => {
  const [a, b] = col.split(".");
  return b ? (f[a!] as Fila | undefined)?.[b] : f[col];
};

function consulta(tabla: string) {
  const filtros: [string, unknown][] = [];
  const q = {
    select: () => q, in: () => q, is: () => q, not: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => q, range: () => q,
    eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
    match: (o: Record<string, unknown>) => { filtros.push(...Object.entries(o)); return q; },
    maybeSingle: () => Promise.resolve({ data: (tablas[tabla] ?? [])[0] ?? null, error: null }),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) =>
      Promise.resolve(ok({ data: (tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => valorDe(f, c) === v)), error: null })),
  };
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: (t: string) => consulta(t),
    rpc: () => Promise.resolve({ data: "2026-10-01", error: null }),
  },
}));

const { leerDashboard, leerVentasPorProducto, leerZHistorico, agregarEventos } = await import("../reportes");
const { elegirInicial } = await import("../../components/selector-sucursal");

const DIA = "2026-10-01";

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  tablas.tenants = [{ id: "t1", timezone: "America/Mexico_City", hora_cierre_dia_contable: "03:00:00" }];
  tablas.vw_estado_resultados_dia = [
    { sucursal_id: "centro", dia_contable: DIA, tickets_completados: 10, total_neto_mxn: 1000 },
    { sucursal_id: "norte", dia_contable: DIA, tickets_completados: 3, total_neto_mxn: 300 },
  ];
  tablas.vw_ventas_por_producto = [
    { sucursal_id: "centro", dia_contable: DIA, producto_id: "p1", producto_nombre: "Hamburguesa", unidades_vendidas: 8, total_mxn: 800 },
    { sucursal_id: "norte", dia_contable: DIA, producto_id: "p2", producto_nombre: "Papas", unidades_vendidas: 30, total_mxn: 900 },
  ];
  tablas.ticket_items = [
    { id: "i1", combo_rol: "PADRE", cancelado: false, cantidad: 2, ticket: { dia_contable: DIA, sucursal_id: "centro" } },
    { id: "i2", combo_rol: "PADRE", cancelado: false, cantidad: 5, ticket: { dia_contable: DIA, sucursal_id: "norte" } },
  ];
  tablas.tickets = [
    { id: "t1", sucursal_id: "centro", dia_contable: DIA, fecha_pago: "2026-10-01T20:00:00Z", total_mxn: 1000 },
    { id: "t2", sucursal_id: "norte", dia_contable: DIA, fecha_pago: "2026-10-01T21:00:00Z", total_mxn: 300 },
  ];
  tablas.turnos = [
    { sucursal_id: "centro", dia_contable: DIA, estado: "CERRADO", diferencia_mxn: 0 },
    { sucursal_id: "norte", dia_contable: DIA, estado: "CERRADO", diferencia_mxn: -50 },
  ];
  tablas.reportes_z_historico = [
    { id: "z1", sucursal_id: "centro", dia_contable: DIA, total_ventas_mxn: 1000 },
    { id: "z2", sucursal_id: "norte", dia_contable: DIA, total_ventas_mxn: 300 },
  ];
});

describe("panel por sucursal", () => {
  it("con una sucursal, ninguna cifra trae a la otra", async () => {
    const d = await leerDashboard(DIA, "centro");
    expect(d.hoy?.totalNeto).toBe(1000);
    expect(d.topProductos.map((p) => p.nombre)).toEqual(["Hamburguesa"]);
    expect(d.combosVendidos).toBe(2);
    expect(d.ventasPorHora.reduce((s, h) => s + h.total, 0)).toBe(1000);
    expect(d.caja.diferenciaNeta).toBe(0);
  });

  it("con todas, suma las sucursales como antes", async () => {
    const d = await leerDashboard(DIA, null);
    expect(d.hoy?.totalNeto).toBe(1300);
    expect(d.combosVendidos).toBe(7);
    expect(d.ventasPorHora.reduce((s, h) => s + h.total, 0)).toBe(1300);
  });
});

describe("reportes por sucursal", () => {
  it("ventas por producto respeta la sucursal", async () => {
    expect((await leerVentasPorProducto(DIA, DIA, "norte")).map((f) => f.producto_nombre)).toEqual(["Papas"]);
    expect(await leerVentasPorProducto(DIA, DIA, null)).toHaveLength(2);
  });

  it("cortes de turno respeta la sucursal", async () => {
    expect((await leerZHistorico(DIA, DIA, "centro")).map((f) => f.id)).toEqual(["z1"]);
    expect(await leerZHistorico(DIA, DIA, null)).toHaveLength(2);
  });
});

describe("eventos: con todas las sucursales se junta por evento", () => {
  it("suma la misma feria vista desde dos sucursales y abarca sus fechas", () => {
    const [feria] = agregarEventos([
      { evento_nombre: "Feria León", evento_tipo: "FERIA", turnos: 2, primer_dia: "2026-01-10", ultimo_dia: "2026-01-11", tickets: 50, total_vendido_mxn: 5000, propinas_mxn: 100, comision_mxn: 500, neto_mxn: 4500 },
      { evento_nombre: "Feria León", evento_tipo: null, turnos: 1, primer_dia: "2026-01-09", ultimo_dia: "2026-01-12", tickets: 10, total_vendido_mxn: 1000, propinas_mxn: 0, comision_mxn: 100, neto_mxn: 900 },
    ]);
    expect(feria).toMatchObject({ evento: "Feria León", tipo: "FERIA", turnos: 3, primerDia: "2026-01-09", ultimoDia: "2026-01-12", tickets: 60, total: 6000, comision: 600, neto: 5400 });
  });
});

describe("qué sucursal se mira al entrar", () => {
  const dos = [{ id: "a", nombre: "Centro" }, { id: "b", nombre: "Norte" }];
  it("por defecto, la primera sucursal (no todas)", () => {
    expect(elegirInicial(dos, null, null)).toBe("a");
  });
  it("la URL manda sobre lo recordado", () => {
    expect(elegirInicial(dos, "b", "todas")).toBe("b");
    expect(elegirInicial(dos, "todas", "b")).toBeNull();
  });
  it("recuerda la última elección, también «todas»", () => {
    expect(elegirInicial(dos, null, "b")).toBe("b");
    expect(elegirInicial(dos, null, "todas")).toBeNull();
  });
  it("una sucursal borrada o ajena no se respeta", () => {
    expect(elegirInicial(dos, "zzz", "yyy")).toBe("a");
  });
  it("con una sola sucursal no hay elección", () => {
    expect(elegirInicial([{ id: "a", nombre: "Centro" }], "todas", "todas")).toBe("a");
  });
});
