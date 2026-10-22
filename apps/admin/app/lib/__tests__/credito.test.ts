import { describe, expect, it } from "vitest";
import { armarDeudores, armarVentasCredito, creditoClienteSchema, formDeCredito } from "../credito";
import { conCredito, rutasOcultas } from "../operacion";

describe("creditoClienteSchema", () => {
  const ok = { activo: true, limite: "5000", plazo: "30" };
  it("acepta un crédito válido", () => {
    expect(creditoClienteSchema.safeParse(ok).success).toBe(true);
    expect(creditoClienteSchema.safeParse({ ...ok, limite: "1500.50" }).success).toBe(true);
  });
  it("rechaza límite vacío, cero o con más de dos decimales", () => {
    for (const limite of ["", "0", "12.345", "abc"]) expect(creditoClienteSchema.safeParse({ ...ok, limite }).success).toBe(false);
  });
  it("rechaza plazo vacío, cero o con decimales", () => {
    for (const plazo of ["", "0", "1.5"]) expect(creditoClienteSchema.safeParse({ ...ok, plazo }).success).toBe(false);
  });
});

describe("formDeCredito", () => {
  it("sin crédito: apagado y vacío", () => {
    expect(formDeCredito(null)).toEqual({ activo: false, limite: "", plazo: "" });
  });
  it("con crédito: los valores en texto", () => {
    expect(formDeCredito({ activo: true, limite_mxn: "2500.00", plazo_dias: 15 })).toEqual({ activo: true, limite: "2500", plazo: "15" });
  });
});

describe("conCredito", () => {
  it("solo con el módulo leído y encendido", () => {
    expect(conCredito(null)).toBe(false);
    expect(conCredito("error")).toBe(false);
    expect(conCredito({ permitidos: { credito: true }, efectivos: { credito: false } })).toBe(false);
    expect(conCredito({ permitidos: { credito: true }, efectivos: { credito: true } })).toBe(true);
  });
  it("Créditos solo con el módulo; su configuración, en una tienda o con el crédito ya encendido", () => {
    const m = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });
    expect(rutasOcultas(null).has("/creditos")).toBe(true);
    expect(rutasOcultas(null).has("/configuracion/credito")).toBe(true);
    expect(rutasOcultas(m({ existencias: true })).has("/creditos")).toBe(true);
    expect(rutasOcultas(m({ existencias: true })).has("/configuracion/credito")).toBe(false);
    expect(rutasOcultas(m({})).has("/configuracion/credito")).toBe(true);
    expect(rutasOcultas(m({ credito: true })).has("/creditos")).toBe(false);
    expect(rutasOcultas(m({ credito: true })).has("/configuracion/credito")).toBe(false);
  });
});

describe("armarDeudores", () => {
  const nombres = new Map([["a", "Ana"], ["b", "Beto"], ["c", "Caro"], ["d", "Dani"]]);
  const cred = (cliente_id: string, deuda: string, fecha: string | null, vencido: boolean) => ({
    cliente_id, deuda_mxn: deuda, disponible_mxn: "100", venta_mas_vieja_fecha: fecha, tiene_vencido: vencido, activo: true,
  });

  it("vencidos primero, luego la deuda más vieja; deja fuera a quien no debe ni tiene saldo a favor", () => {
    const r = armarDeudores(
      [
        cred("a", "300", "2026-10-10T12:00:00Z", false),
        cred("b", "50", "2026-10-15T12:00:00Z", true),
        cred("c", "0", null, false),
        cred("d", "900", "2026-09-01T12:00:00Z", false),
      ],
      [],
      nombres,
    );
    expect(r.map((x) => x.clienteId)).toEqual(["b", "d", "a"]);
    expect(r[0]).toMatchObject({ nombre: "Beto", deuda: 50, disponible: 100, vencido: true, saldoFavor: 0 });
  });

  it("suma el saldo a favor y enseña al cliente que solo tiene saldo a favor, al final", () => {
    const r = armarDeudores(
      [cred("a", "300", "2026-10-10T12:00:00Z", false), cred("c", "0", null, false)],
      [{ cliente_id: "a", saldo_mxn: "20.50" }, { cliente_id: "c", saldo_mxn: "75" }, { cliente_id: "x", saldo_mxn: "0" }],
      nombres,
    );
    expect(r.map((x) => [x.clienteId, x.saldoFavor])).toEqual([["a", 20.5], ["c", 75]]);
  });

  it("saldo a favor de un cliente sin fila de crédito también sale", () => {
    const r = armarDeudores([], [{ cliente_id: "d", saldo_mxn: "10" }], nombres);
    expect(r).toEqual([{ clienteId: "d", nombre: "Dani", deuda: 0, disponible: 0, vencido: false, desde: null, saldoFavor: 10, activo: false }]);
  });
});

describe("armarVentasCredito", () => {
  it("saldo = crédito − abonos y ajustes aplicados, en centavos; la más vieja primero", () => {
    const r = armarVentasCredito(
      [
        { ticket_id: "t2", monto_mxn: "100.10", tickets: { folio_completo: "A-2", fecha_pago: "2026-10-12T10:00:00Z" } },
        { ticket_id: "t1", monto_mxn: "200", tickets: { folio_completo: "A-1", fecha_pago: "2026-10-01T10:00:00Z" } },
      ],
      [
        { id: "x1", ticket_id: "t2", tipo: "ABONO", metodo_pago: "EFECTIVO", monto_mxn: "0.10", estado: "APLICADO", created_at: "2026-10-13T10:00:00Z" },
        { id: "x2", ticket_id: "t2", tipo: "ABONO", metodo_pago: "EFECTIVO", monto_mxn: "0.20", estado: "APLICADO", created_at: "2026-10-14T10:00:00Z" },
        { id: "x3", ticket_id: "t1", tipo: "ABONO", metodo_pago: "EFECTIVO", monto_mxn: "50", estado: "CANCELADO", created_at: "2026-10-14T10:00:00Z" },
        { id: "x4", ticket_id: "t1", tipo: "AJUSTE_CANCELACION", metodo_pago: null, monto_mxn: "200", estado: "APLICADO", created_at: "2026-10-15T10:00:00Z" },
      ],
    );
    expect(r.map((v) => [v.folio, v.total, v.saldo])).toEqual([["A-1", 200, 0], ["A-2", 100.1, 99.8]]);
    expect(r[1]!.abonos.map((a) => a.id)).toEqual(["x1", "x2"]);
    expect(r[0]!.abonos.map((a) => a.id)).toEqual(["x4"]);
  });
});
