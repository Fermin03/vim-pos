import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { avisoDeTienda, cuentaPorCancelar, cuentasPagadasEnLinea, devolucionFueraDePlazo, HORAS_PARA_DEVOLVER_EN_LINEA } from "../pedidos-en-linea";
import type { PedidoApp } from "../pedidos-apps";

const AHORA = Date.parse("2026-10-13T12:00:00Z");
const hace = (horas: number) => new Date(AHORA - horas * 3_600_000).toISOString();

describe("cancelar una cuenta pagada en línea: hasta cuándo se promete la devolución", () => {
  it("dentro del plazo se puede cancelar (y el pago se devuelve); fuera, no se promete", () => {
    expect(devolucionFueraDePlazo(hace(0), AHORA)).toBe(false);
    expect(devolucionFueraDePlazo(hace(24), AHORA)).toBe(false);
    expect(devolucionFueraDePlazo(hace(46.9), AHORA)).toBe(false);
    // Una hora antes de las 48: la ventana corre desde el pago, que es anterior a la cuenta.
    expect(devolucionFueraDePlazo(hace(47), AHORA)).toBe(true);
    expect(devolucionFueraDePlazo(hace(48), AHORA)).toBe(true);
    expect(devolucionFueraDePlazo(hace(24 * 30), AHORA)).toBe(true);
  });
  it("sin fecha (o con una ilegible) no se promete nada", () => {
    for (const raro of [null, undefined, "", "ayer"]) expect(devolucionFueraDePlazo(raro, AHORA)).toBe(true);
  });
  it("la constante es la misma ventana en la que la caja reporta la cancelación a la nube (SQL_REPORTE)", () => {
    const espejo = readFileSync(resolve(__dirname, "../../../../../desktop/src/delivery-espejo.mjs"), "utf8");
    const sql = /const SQL_REPORTE = `([\s\S]*?)`;/.exec(espejo)?.[1] ?? "";
    expect(sql).toContain(`p.recibido_at > now() - interval '${HORAS_PARA_DEVOLVER_EN_LINEA} hours'`);
  });
});

describe("la nube canceló un pedido pagado en línea que aquí ya tenía cuenta", () => {
  it("el cajero lee, tal cual, que el pago ya se devolvió y que cancele la cuenta", () => {
    const texto = "El pedido en línea se canceló y el pago ya se le devolvió al cliente: cancela esta cuenta. Si ya lo entregaste, cóbralo de otra forma";
    expect(avisoDeTienda({ canal: "TIENDA", estado: "CANCELADO", ultimoError: texto } as PedidoApp)).toBe(texto);
  });
});

describe("la cuenta cobrada de un pedido pagado en línea que la nube canceló sigue a la vista, para cancelarla", () => {
  const texto = "El pedido en línea se canceló y el pago ya se le devolvió al cliente: cancela esta cuenta. Si ya lo entregaste, cóbralo de otra forma";
  const p = (extra: Partial<PedidoApp>) => ({ id: "p", app: "DRIVE_THRU", canal: "TIENDA", estado: "CANCELADO", ticketId: "tk", ultimoError: texto, pago: { forma: "EN_LINEA", pagaCon: null }, ...extra }) as PedidoApp;
  it("con el aviso de la caja, su cuenta se sigue listando; sin aviso (lo canceló esta caja) o al recibir, no", () => {
    expect(cuentaPorCancelar(p({}))).toBe("tk");
    expect(cuentasPagadasEnLinea([p({})], "DRIVE_THRU")).toEqual(["tk"]);
    expect(cuentasPagadasEnLinea([p({})], "DELIVERY_PROPIO")).toEqual([]);
    expect(cuentasPagadasEnLinea([p({ ultimoError: null })], "DRIVE_THRU")).toEqual([]);
    expect(cuentasPagadasEnLinea([p({ pago: { forma: "EFECTIVO", pagaCon: null } })], "DRIVE_THRU")).toEqual([]);
    // Un pedido vivo no es «por cancelar»: se entrega con «Listo».
    expect(cuentaPorCancelar(p({ estado: "ACEPTADO", ultimoError: null }))).toBeNull();
  });
});

describe("la misma ventana decide cuándo se puede desconectar Mercado Pago de la tienda", () => {
  it("tienda_conexion_ocupada (0173) usa las mismas horas: mientras una cancelación aún devolvería el pago, no se desconecta", () => {
    const sql = readFileSync(resolve(__dirname, "../../../../../supabase/migrations/0173_tienda_pago_en_linea.sql"), "utf8");
    const funcion = /CREATE OR REPLACE FUNCTION tienda_conexion_ocupada[\s\S]*?END \$\$;/.exec(sql)?.[0] ?? "";
    expect(funcion).toContain(`g.aprobado_at > now() - interval '${HORAS_PARA_DEVOLVER_EN_LINEA} hours'`);
    expect(funcion).toContain(`max(g.aprobado_at) + interval '${HORAS_PARA_DEVOLVER_EN_LINEA} hours'`);
  });
});
