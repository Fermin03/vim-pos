import { describe, expect, it, vi } from "vitest";

// `plan.ts` importa el cliente de Supabase al cargarse; aquí solo se prueba la función pura.
vi.mock("../supabase", () => ({ supabase: {}, leerSesion: vi.fn() }));

import { desgloseMensual, type AddonContratado } from "../plan";

/*
 * "Plan y pagos" le dice al dueño cuánto paga al mes y por qué: su plan al precio vigente (con la
 * promoción mientras dure) más lo que tiene contratado aparte, con su cantidad (0147). El total es
 * el mismo `totalMensual` que usa el panel de VIM: no pueden decir números distintos.
 */

const HOY = "2026-10-01";
const PILOTO = { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-31" };
const addon = (a: Partial<AddonContratado>): AddonContratado => ({
  codigo: "CFDI", nombre: "Facturación electrónica", activo: true, precio_mensual_mxn: 0, cantidad: 1,
  fecha_inicio: "2026-09-01", fecha_fin: null, incluido_en_plan: false, ...a,
});

describe("desgloseMensual", () => {
  it("plan con promoción + extras por cantidad: cada renglón con su importe y el total", () => {
    const d = desgloseMensual({ nombre: "Esencial" }, PILOTO, [
      addon({ codigo: "CAJA_EXTRA", nombre: "Caja adicional", precio_mensual_mxn: 249, cantidad: 2 }),
      addon({ codigo: "SUCURSAL_EXTRA", nombre: "Sucursal adicional", precio_mensual_mxn: 599, cantidad: 1 }),
    ], HOY);
    expect(d.renglones).toEqual([
      { clave: "plan", concepto: "Plan Esencial", detalle: null, importe: 499 },
      { clave: "CAJA_EXTRA", concepto: "Caja adicional", detalle: "2 × $249.00", importe: 498 },
      { clave: "SUCURSAL_EXTRA", concepto: "Sucursal adicional", detalle: null, importe: 599 },
    ]);
    expect(d.total).toBe(1596);
    expect(d.hayExtras).toBe(true);
  });

  it("lo que el plan incluye sale como incluido, sin sumar", () => {
    const d = desgloseMensual({ nombre: "Negocio" }, { precio_mensual_mxn: 999 }, [
      addon({ incluido_en_plan: true }),
      addon({ codigo: "DELIVERY", nombre: "Apps de delivery", incluido_en_plan: true }),
    ], HOY);
    expect(d.renglones.map((r) => [r.concepto, r.detalle, r.importe])).toEqual([
      ["Plan Negocio", null, 999],
      ["Facturación electrónica", "incluido en tu plan", 0],
      ["Apps de delivery", "incluido en tu plan", 0],
    ]);
    expect(d.total).toBe(999);
    expect(d.hayExtras).toBe(false);
  });

  it("un $0 que no viene del plan es cortesía de VIM, no 'incluido'", () => {
    const d = desgloseMensual({ nombre: "Esencial" }, { precio_mensual_mxn: 699 }, [addon({ incluido_en_plan: false })], HOY);
    expect(d.renglones[1]).toMatchObject({ detalle: "sin costo", importe: 0 });
  });

  it("lo dado de baja no aparece", () => {
    const d = desgloseMensual({ nombre: "Esencial" }, { precio_mensual_mxn: 699 }, [
      addon({ codigo: "CAJA_EXTRA", nombre: "Caja adicional", precio_mensual_mxn: 249, activo: false, fecha_fin: "2026-09-20" }),
    ], HOY);
    expect(d.renglones).toHaveLength(1);
    expect(d.total).toBe(699);
  });

  it("sin cobro activo (en prueba) no hay total que cobrar, pero sí se ve lo contratado", () => {
    const d = desgloseMensual({ nombre: "Esencial" }, null, [
      addon({ codigo: "CAJA_EXTRA", nombre: "Caja adicional", precio_mensual_mxn: 249, cantidad: 1 }),
    ], HOY);
    expect(d.total).toBe(0);
    expect(d.renglones).toEqual([{ clave: "CAJA_EXTRA", concepto: "Caja adicional", detalle: null, importe: 249 }]);
  });

  it("sin plan no escribe 'Plan undefined'", () => {
    const d = desgloseMensual(null, { precio_mensual_mxn: 699 }, [], HOY);
    expect(d.renglones[0]?.concepto).toBe("Tu plan");
  });
});
