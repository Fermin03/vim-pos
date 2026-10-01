import { describe, expect, it } from "vitest";
import {
  addonVigente,
  cantidadDeExtra,
  EXTRAS,
  esExtra,
  importeAddon,
  limiteConExtras,
  totalMensual,
  type AddonCobro,
} from "@vim/db/cobro";
import { montoPeriodos } from "../promocion";

// Lo que un negocio paga al mes = el precio vigente de su suscripción (con promoción mientras dure)
// + los add-ons que paga aparte, cada uno por su cantidad. Es EL número del panel (MRR, ficha,
// registro de pagos) y del dueño (Plan y pagos): si cada pantalla lo sumara por su cuenta, acabarían
// diciendo cosas distintas.

const HOY = "2026-10-01";
const PILOTO = { precio_mensual_mxn: "699.00", precio_promocional_mxn: "499.00", promocion_hasta: "2027-03-31" };
const addon = (a: Partial<AddonCobro> & { codigo?: string }): AddonCobro => ({ activo: true, precio_mensual_mxn: 0, fecha_inicio: "2026-09-01", fecha_fin: null, ...a });

describe("addonVigente (espejo de tenant_addon_activo)", () => {
  it("activo, ya empezó y no ha terminado", () => {
    expect(addonVigente(addon({}), HOY)).toBe(true);
    expect(addonVigente(addon({ fecha_fin: HOY }), HOY)).toBe(true);        // el último día cuenta
    expect(addonVigente(addon({ fecha_fin: "2026-09-30" }), HOY)).toBe(false);
    expect(addonVigente(addon({ fecha_inicio: "2026-10-02" }), HOY)).toBe(false);
    expect(addonVigente(addon({ activo: false }), HOY)).toBe(false);
  });
});

describe("importeAddon", () => {
  it("es el precio unitario por la cantidad; sin cantidad, una", () => {
    expect(importeAddon(addon({ precio_mensual_mxn: "249.00", cantidad: 2 }))).toBe(498);
    expect(importeAddon(addon({ precio_mensual_mxn: 349 }))).toBe(349);
    expect(importeAddon(addon({ precio_mensual_mxn: 599, cantidad: null }))).toBe(599);
  });
});

describe("totalMensual", () => {
  it("suscripción con promoción + extras por cantidad + lo incluido a $0", () => {
    const t = totalMensual(PILOTO, [
      addon({ precio_mensual_mxn: 599, cantidad: 1 }),          // sucursal adicional
      addon({ precio_mensual_mxn: 249, cantidad: 2 }),          // dos cajas adicionales
      addon({ precio_mensual_mxn: 0 }),                         // CFDI incluido en el plan
    ], HOY);
    expect(t).toEqual({ suscripcion: 499, addons: 1097, total: 1596 });
  });

  it("al terminar la promoción el total sube con ella", () => {
    expect(totalMensual(PILOTO, [addon({ precio_mensual_mxn: 249 })], "2027-04-01").total).toBe(948);
  });

  it("un add-on dado de baja o que aún no empieza no se cobra", () => {
    const t = totalMensual({ precio_mensual_mxn: 999 }, [
      addon({ precio_mensual_mxn: 349, activo: false, fecha_fin: "2026-09-15" }),
      addon({ precio_mensual_mxn: 100, fecha_inicio: "2026-11-01" }),
    ], HOY);
    expect(t).toEqual({ suscripcion: 999, addons: 0, total: 999 });
  });

  it("sin cobro activo no hay total: en prueba no se paga nada, ni los extras", () => {
    expect(totalMensual(null, [addon({ precio_mensual_mxn: 599 })], HOY)).toEqual({ suscripcion: 0, addons: 0, total: 0 });
  });

  it("lo INCLUIDO en el plan nunca se cobra, aunque su fila traiga un precio por error", () => {
    // Una fila marcada `incluido_en_plan` con precio (un alta vieja, una corrección a mano): el
    // cliente ya lo paga dentro de su plan. Contarla lo cobraría dos veces e inflaría el MRR.
    const colada = addon({ precio_mensual_mxn: 349, incluido_en_plan: true });
    expect(importeAddon(colada)).toBe(0);
    expect(totalMensual({ precio_mensual_mxn: 999 }, [colada, addon({ precio_mensual_mxn: 249, cantidad: 2 })], HOY))
      .toEqual({ suscripcion: 999, addons: 498, total: 1497 });
  });

  it("no arrastra centavos de coma flotante", () => {
    expect(totalMensual({ precio_mensual_mxn: "699.10" }, [addon({ precio_mensual_mxn: "0.20", cantidad: 3 })], HOY).total).toBe(699.7);
  });
});

describe("extras por cantidad", () => {
  it("son dos y cada uno sube un límite", () => {
    expect(EXTRAS.SUCURSAL_EXTRA.limite).toBe("max_sucursales");
    expect(EXTRAS.CAJA_EXTRA.limite).toBe("max_cajas_por_sucursal");
    expect(esExtra("CAJA_EXTRA")).toBe(true);
    expect(esExtra("CFDI")).toBe(false);
  });

  it("cantidadDeExtra suma solo lo vigente de ese código", () => {
    const filas = [
      { codigo: "CAJA_EXTRA", ...addon({ cantidad: 2 }) },
      { codigo: "CAJA_EXTRA", ...addon({ cantidad: 5, activo: false, fecha_fin: "2026-09-10" }) },
      { codigo: "SUCURSAL_EXTRA", ...addon({ cantidad: 1 }) },
    ];
    expect(cantidadDeExtra(filas, "CAJA_EXTRA", HOY)).toBe(2);
    expect(cantidadDeExtra(filas, "SUCURSAL_EXTRA", HOY)).toBe(1);
    expect(cantidadDeExtra([], "CAJA_EXTRA", HOY)).toBe(0);
  });

  it("limiteConExtras: la excepción reemplaza al plan como base y los extras se suman encima", () => {
    // Esencial (1 caja) + 2 extras = 3.
    expect(limiteConExtras({ plan: 1, excepcion: null, extras: 2 })).toBe(3);
    // Con excepción a 2 cajas y 1 extra = 3: la excepción no absorbe lo que el cliente paga.
    expect(limiteConExtras({ plan: 1, excepcion: 2, extras: 1 })).toBe(3);
    // Sin extras, la excepción sigue mandando como antes de 0147.
    expect(limiteConExtras({ plan: 1, excepcion: 4, extras: 0 })).toBe(4);
    // Sin límite (Cadena) sigue sin límite: los extras no le ponen techo.
    expect(limiteConExtras({ plan: null, excepcion: null, extras: 3 })).toBeNull();
  });
});

describe("montoPeriodos con extras", () => {
  const s = { ...PILOTO, fecha_inicio: "2026-10-01" };
  it("cada periodo lleva su precio vigente MÁS los extras del mes", () => {
    // Sin extras, como antes.
    expect(montoPeriodos(s, "2027-02-01", 3, false)).toBe(499 + 499 + 699);
    // Con $249 de extras al mes.
    expect(montoPeriodos(s, "2027-02-01", 3, false, 249)).toBe(499 + 499 + 699 + 249 * 3);
  });
  it("en el ciclo anual un periodo son doce meses de extras", () => {
    expect(montoPeriodos({ precio_mensual_mxn: 999, fecha_inicio: "2026-10-01" }, "2026-10-01", 1, true, 100)).toBe((999 + 100) * 12);
  });
});
