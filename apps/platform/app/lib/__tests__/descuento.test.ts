import { describe, expect, it } from "vitest";
import { descuentoVigente, rebajaDescuento, totalMensual } from "@vim/db/cobro";
import { leerDescuento, montoPeriodos } from "../promocion";

// Descuento al cobro final (0289): porcentaje o importe sobre el TOTAL (plan con promoción + extras),
// por N cobros, por fechas o sin fin. Lo leen el MRR, el monto sugerido del pago y "Plan y pagos".

const HOY = "2026-10-28";
const S = { fecha_inicio: "2026-09-15", proxima_fecha_cobro: "2026-11-15", ciclo_facturacion: "MENSUAL" };
const PILOTO = { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-14" };
const addon = { activo: true, precio_mensual_mxn: 249, fecha_inicio: "2026-09-01" };

describe("rebajaDescuento", () => {
  it("porcentaje e importe, solo dentro de sus fechas", () => {
    const d = { descuento_tipo: "PORCENTAJE", descuento_valor: 10, descuento_desde: HOY, descuento_hasta: "2026-12-14" };
    expect(rebajaDescuento(d, 748, "2026-11-15")).toBe(74.8);
    expect(rebajaDescuento(d, 748, "2026-12-14")).toBe(74.8);   // el último día cuenta
    expect(rebajaDescuento(d, 748, "2026-12-15")).toBe(0);
    expect(rebajaDescuento(d, 748, "2026-10-27")).toBe(0);
    expect(rebajaDescuento({ ...d, descuento_tipo: "IMPORTE", descuento_valor: 100, descuento_hasta: null }, 748, "2030-01-01")).toBe(100);
  });
  it("nunca deja el cobro negativo", () => {
    expect(rebajaDescuento({ descuento_tipo: "IMPORTE", descuento_valor: 900, descuento_desde: HOY }, 748, HOY)).toBe(748);
  });
  it("sin descuento o a medias no rebaja nada", () => {
    expect(descuentoVigente({}, HOY)).toBeNull();
    expect(descuentoVigente({ descuento_tipo: "PORCENTAJE", descuento_valor: 10 }, HOY)).toBeNull();
  });
});

describe("totalMensual con descuento", () => {
  it("va sobre el total ya con promoción y extras", () => {
    const s = { ...PILOTO, descuento_tipo: "PORCENTAJE", descuento_valor: 10, descuento_desde: HOY };
    expect(totalMensual(s, [addon], HOY)).toEqual({ suscripcion: 499, addons: 249, descuento: 74.8, total: 673.2 });
  });
});

describe("leerDescuento", () => {
  it("por N cobros: desde hoy hasta el día antes del cobro N+1", () => {
    const r = leerDescuento({ tipo: "PORCENTAJE", valor: 20, forma: "COBROS", cobros: 3 }, S, HOY);
    expect(r).toEqual({ ok: true, descuento: { tipo: "PORCENTAJE", valor: 20, desde: HOY, hasta: "2027-02-14" } });
  });
  it("por N cobros con el cobro vencido: lo incluye", () => {
    const r = leerDescuento({ tipo: "IMPORTE", valor: 50, forma: "COBROS", cobros: 1 }, { ...S, proxima_fecha_cobro: "2026-10-15" }, HOY);
    expect(r).toEqual({ ok: true, descuento: { tipo: "IMPORTE", valor: 50, desde: "2026-10-15", hasta: "2026-11-14" } });
  });
  it("anual: un cobro son doce meses", () => {
    const r = leerDescuento({ tipo: "PORCENTAJE", valor: 5, forma: "COBROS", cobros: 1 }, { ...S, ciclo_facturacion: "ANUAL" }, HOY);
    expect(r.ok && r.descuento.hasta).toBe("2027-11-14");
  });
  it("rango e indefinido", () => {
    expect(leerDescuento({ tipo: "IMPORTE", valor: "100", forma: "RANGO", desde: "2026-11-01", hasta: "2027-01-31" }, S, HOY))
      .toEqual({ ok: true, descuento: { tipo: "IMPORTE", valor: 100, desde: "2026-11-01", hasta: "2027-01-31" } });
    expect(leerDescuento({ tipo: "PORCENTAJE", valor: 15, forma: "INDEFINIDO" }, S, HOY))
      .toEqual({ ok: true, descuento: { tipo: "PORCENTAJE", valor: 15, desde: HOY, hasta: null } });
  });
  it("rechaza lo que no es descuento", () => {
    const err = (b: Record<string, unknown>) => { const r = leerDescuento(b, S, HOY); return r.ok ? null : r.error; };
    expect(err({ tipo: "OTRO", valor: 10, forma: "INDEFINIDO" })).toBe("DESCUENTO_TIPO_INVALIDO");
    expect(err({ tipo: "PORCENTAJE", valor: 0, forma: "INDEFINIDO" })).toBe("DESCUENTO_VALOR_INVALIDO");
    expect(err({ tipo: "PORCENTAJE", valor: 101, forma: "INDEFINIDO" })).toBe("DESCUENTO_VALOR_INVALIDO");
    expect(err({ tipo: "IMPORTE", valor: "1.234", forma: "INDEFINIDO" })).toBe("DESCUENTO_VALOR_INVALIDO");
    expect(err({ tipo: "IMPORTE", valor: 10, forma: "COBROS", cobros: 0 })).toBe("DESCUENTO_COBROS_INVALIDO");
    expect(err({ tipo: "IMPORTE", valor: 10, forma: "RANGO", desde: "2026-11-01", hasta: "2026-10-31" })).toBe("DESCUENTO_FECHA_INVALIDA");
    expect(err({ tipo: "IMPORTE", valor: 10, forma: "RANGO", desde: "2026-01-01", hasta: "2026-02-01" })).toBe("DESCUENTO_FECHA_INVALIDA");
    expect(err({ tipo: "IMPORTE", valor: 10, forma: "RANGO", hasta: "2027-02-30" })).toBe("DESCUENTO_FECHA_INVALIDA");
  });
});

describe("montoPeriodos con descuento", () => {
  it("cada cobro con el descuento que vale en SU fecha", () => {
    // 20 % los próximos 2 cobros; se pagan 3 de una vez: 2 con descuento y 1 completo.
    const s = { ...PILOTO, fecha_inicio: S.fecha_inicio, descuento_tipo: "PORCENTAJE", descuento_valor: 20, descuento_desde: HOY, descuento_hasta: "2027-01-14" };
    expect(montoPeriodos(s, "2026-11-15", 3, false, 249)).toBe(748 * 0.8 * 2 + 748);
  });
});
