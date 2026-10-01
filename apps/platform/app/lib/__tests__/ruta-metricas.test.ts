import { describe, expect, it, vi } from "vitest";

/*
 * El MRR del panel es la suma de lo que HOY paga cada negocio con cobro activo: su suscripción al
 * precio vigente MÁS los add-ons que paga aparte, por su cantidad (0147). Antes solo sumaba la
 * suscripción, así que una sucursal adicional de $599 no existía para el panel.
 */

const HOY_LEJANO = "2099-12-31"; // promociones "vigentes" en la prueba sin depender del reloj

const datos: Record<string, unknown[]> = {
  tenants: [{ estado: "ACTIVO", vertical_principal: "QUICK_SERVICE", fecha_alta: null }],
  suscripciones: [
    // Piloto: paga 499 mientras dure la promoción.
    { tenant_id: "t1", estado: "ACTIVA", precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: HOY_LEJANO },
    { tenant_id: "t2", estado: "ACTIVA", precio_mensual_mxn: 999, precio_promocional_mxn: null, promocion_hasta: null },
    // En pausa: no cuenta, ni ella ni sus extras.
    { tenant_id: "t3", estado: "PAUSADA", precio_mensual_mxn: 1999, precio_promocional_mxn: null, promocion_hasta: null },
  ],
  tenant_addons: [
    { tenant_id: "t1", activo: true, precio_mensual_mxn: 249, cantidad: 2, fecha_inicio: "2026-09-01", fecha_fin: null },   // 498
    { tenant_id: "t2", activo: true, precio_mensual_mxn: 599, cantidad: 1, fecha_inicio: "2026-09-01", fecha_fin: null },   // 599
    { tenant_id: "t2", activo: true, precio_mensual_mxn: 0, cantidad: 1, fecha_inicio: "2026-09-01", fecha_fin: null },     // incluido
    // Incluido en el plan pero con un precio que se coló: NO cuenta.
    { tenant_id: "t2", activo: true, precio_mensual_mxn: 349, cantidad: 1, fecha_inicio: "2026-09-01", fecha_fin: null, incluido_en_plan: true },
    { tenant_id: "t2", activo: false, precio_mensual_mxn: 349, cantidad: 1, fecha_inicio: "2026-08-01", fecha_fin: "2026-08-31" }, // dado de baja
    { tenant_id: "t3", activo: true, precio_mensual_mxn: 599, cantidad: 3, fecha_inicio: "2026-09-01", fecha_fin: null },   // cobro en pausa
    { tenant_id: "t9", activo: true, precio_mensual_mxn: 599, cantidad: 1, fecha_inicio: "2026-09-01", fecha_fin: null },   // en prueba, sin cobro
  ],
  folios_movimientos: [],
};

const sb = {
  from: (t: string) => {
    const q = {
      select: () => q, is: () => q, eq: () => q, gte: () => q, limit: () => q,
      then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(ok({ data: datos[t] ?? [], error: null })),
    };
    return q;
  },
};
vi.mock("../server", () => ({ autorizar: () => Promise.resolve({ sb }) }));

const { GET } = await import("../../api/metricas/route");

describe("GET /api/metricas", () => {
  it("el MRR suma suscripción vigente + add-ons pagados × cantidad, solo de quien tiene cobro activo", async () => {
    const j = await (await GET(new Request("http://x/api/metricas"))).json();
    // t1: 499 + 498 · t2: 999 + 599 · t3 (pausa) y t9 (sin cobro): nada.
    expect(j.mrr).toBe(499 + 498 + 999 + 599);
    expect(j.mrrSuscripciones).toBe(499 + 999);
    expect(j.mrrAddons).toBe(498 + 599);
  });
});
