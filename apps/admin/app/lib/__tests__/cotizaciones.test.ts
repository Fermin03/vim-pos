import { describe, expect, it } from "vitest";
import { armarCotizaciones, diaEnZona, estadoVisible, filtrarPorEstado, totalesCotizaciones, vigenciaValida } from "../cotizaciones";
import { conCotizaciones, rutasOcultas } from "../operacion";

const ZONA = "America/Mexico_City";
const fila = (o: Partial<Parameters<typeof armarCotizaciones>[0][number]> = {}) => ({
  id: "c1", folio: "COT-A-1", estado: "VIGENTE", vigente_hasta: "2026-10-30", total_mxn: "100.10",
  cliente_id: null, sucursal_id: "s1", ticket_id: null, created_at: "2026-10-10T18:00:00Z", ...o,
});

describe("diaEnZona", () => {
  it("usa la zona del negocio, no UTC", () => {
    expect(diaEnZona("2026-10-11T02:00:00Z", ZONA)).toBe("2026-10-10");
    expect(diaEnZona("2026-10-11T07:00:00Z", ZONA)).toBe("2026-10-11");
  });
});

describe("estadoVisible", () => {
  it("vigente hasta el último día; vencida al día siguiente", () => {
    expect(estadoVisible("VIGENTE", "2026-10-18", "2026-10-18")).toBe("VIGENTE");
    expect(estadoVisible("VIGENTE", "2026-10-17", "2026-10-18")).toBe("VENCIDA");
  });
  it("convertida y cancelada no se vencen", () => {
    expect(estadoVisible("CONVERTIDA", "2026-01-01", "2026-10-18")).toBe("CONVERTIDA");
    expect(estadoVisible("CANCELADA", "2026-01-01", "2026-10-18")).toBe("CANCELADA");
  });
});

describe("armarCotizaciones", () => {
  const nombres = new Map([["cl1", "Ana Pérez"]]);
  const sucs = new Map([["s1", "Centro"]]);
  const ventas = new Map([["t1", "A-77"]]);
  it("arma cliente, sucursal, folio de la venta y estado calculado; la más nueva primero", () => {
    const r = armarCotizaciones(
      [
        fila({ id: "a", vigente_hasta: "2026-10-01", created_at: "2026-09-20T18:00:00Z" }),
        fila({ id: "b", estado: "CONVERTIDA", ticket_id: "t1", cliente_id: "cl1", created_at: "2026-10-12T18:00:00Z" }),
      ],
      { hoy: "2026-10-18", nombres, sucursales: sucs, ventas },
    );
    expect(r.map((c) => c.id)).toEqual(["b", "a"]);
    expect(r[0]).toMatchObject({ estado: "CONVERTIDA", cliente: "Ana Pérez", sucursal: "Centro", folioVenta: "A-77", total: 100.1 });
    expect(r[1]).toMatchObject({ estado: "VENCIDA", cliente: null, folioVenta: null });
  });
});

describe("filtrarPorEstado", () => {
  it("TODAS deja todo; un estado filtra por el calculado", () => {
    const l = armarCotizaciones(
      [fila({ id: "a", vigente_hasta: "2026-10-01" }), fila({ id: "b" })],
      { hoy: "2026-10-18", nombres: new Map(), sucursales: new Map(), ventas: new Map() },
    );
    expect(filtrarPorEstado(l, "TODAS")).toHaveLength(2);
    expect(filtrarPorEstado(l, "VENCIDA").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("totalesCotizaciones", () => {
  it("cotizado del mes y lo convertido, en centavos", () => {
    const l = armarCotizaciones(
      [
        fila({ id: "a", total_mxn: "0.10", created_at: "2026-10-02T18:00:00Z" }),
        fila({ id: "b", total_mxn: "0.20", estado: "CONVERTIDA", created_at: "2026-10-03T18:00:00Z" }),
        fila({ id: "c", total_mxn: "500", created_at: "2026-09-30T18:00:00Z" }),
        fila({ id: "d", total_mxn: "9", estado: "CANCELADA", created_at: "2026-10-04T18:00:00Z" }),
      ],
      { hoy: "2026-10-18", nombres: new Map(), sucursales: new Map(), ventas: new Map() },
    );
    expect(totalesCotizaciones(l, "2026-10-18", ZONA)).toEqual({ cotizado: 0.3, convertido: 0.2 });
  });
});

describe("vigenciaValida", () => {
  it("1 a 365 días enteros", () => {
    for (const v of ["1", "15", "365"]) expect(vigenciaValida(v)).toBe(true);
    for (const v of ["", "0", "366", "1.5", "abc"]) expect(vigenciaValida(v)).toBe(false);
  });
});

describe("rutas de cotizaciones", () => {
  const con = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });
  it("ocultas mientras carga o sin módulo ni existencias", () => {
    for (const m of [null, "error" as const, con({})]) {
      const o = rutasOcultas(m);
      expect(o.has("/cotizaciones")).toBe(true);
      expect(o.has("/configuracion/cotizaciones")).toBe(true);
    }
  });
  it("con existencias se ve la configuración; la lista, solo con el módulo encendido", () => {
    const o = rutasOcultas(con({ existencias: true }));
    expect(o.has("/configuracion/cotizaciones")).toBe(false);
    expect(o.has("/cotizaciones")).toBe(true);
    expect(rutasOcultas(con({ existencias: true, cotizaciones: true })).has("/cotizaciones")).toBe(false);
  });
  it("encendido sin existencias aún deja apagarlo", () => {
    const o = rutasOcultas(con({ cotizaciones: true }));
    expect(o.has("/configuracion/cotizaciones")).toBe(false);
    expect(conCotizaciones(con({ cotizaciones: true }))).toBe(true);
    expect(conCotizaciones(null)).toBe(false);
  });
});
