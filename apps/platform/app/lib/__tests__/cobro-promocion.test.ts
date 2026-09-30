import { describe, expect, it } from "vitest";
import { clabeValida, estadoPrueba, precioVigente, promocionVigente, textoPrecio } from "@vim/db/cobro";
import { leerPromocion, montoPeriodos, promocionPiloto } from "../promocion";
import { leerDatosPago } from "../datos-pago";
import { vistaPreviaCambioPlan } from "../cambio-plan";

// Regla del precio vigente: espejo de precio_vigente_suscripcion() (0141). Mismos casos que el
// smoke supabase/scripts/smoke_cobro_plan.sql, para que TS y SQL no puedan divergir sin que se note.
const PILOTO = { precio_mensual_mxn: "699.00", precio_promocional_mxn: "499.00", promocion_hasta: "2027-03-31", promocion_nombre: "Piloto 5 negocios" };
const fmt = { fecha: (f: string) => f, mxn: (n: number) => `$${n}` };

describe("precioVigente", () => {
  it("el último día de la promoción vale la promoción; al siguiente, la lista", () => {
    expect(precioVigente(PILOTO, "2027-03-31")).toBe(499);
    expect(precioVigente(PILOTO, "2027-04-01")).toBe(699);
  });
  it("sin promoción manda la lista", () => {
    expect(precioVigente({ precio_mensual_mxn: 999 }, "2027-01-01")).toBe(999);
    expect(promocionVigente({ precio_mensual_mxn: 999, precio_promocional_mxn: null, promocion_hasta: null }, "2027-01-01")).toBeNull();
  });
  it("una promoción de $0 también es promoción", () => {
    expect(precioVigente({ precio_mensual_mxn: 699, precio_promocional_mxn: 0, promocion_hasta: "2027-01-31" }, "2027-01-15")).toBe(0);
  });
  it("la frase dice hasta cuándo y cuánto después", () => {
    expect(textoPrecio(PILOTO, "2026-10-01", fmt)).toBe("$499 hasta 2027-03-31, después $699");
    expect(textoPrecio(PILOTO, "2027-04-01", fmt)).toBe("$699");
  });
});

describe("promocionPiloto", () => {
  it("seis meses desde el inicio del cobro, inclusive hasta el día anterior al sexto aniversario", () => {
    expect(promocionPiloto("2026-10-01")).toEqual({ precio: 499, hasta: "2027-03-31", nombre: "Piloto 5 negocios" });
    // Alta un 31: el recorte a fin de mes de sumarMeses (31 ago → 28 feb) y un día antes.
    expect(promocionPiloto("2026-08-31").hasta).toBe("2027-02-27");
  });
  it("el séptimo cobro ya sale a precio de lista", () => {
    const p = promocionPiloto("2026-10-01");
    const s = { precio_mensual_mxn: 699, precio_promocional_mxn: p.precio, promocion_hasta: p.hasta };
    expect(precioVigente(s, "2027-03-01")).toBe(499); // sexto cobro
    expect(precioVigente(s, "2027-04-01")).toBe(699); // séptimo
  });
});

describe("leerPromocion", () => {
  it("sin promoción es válido", () => {
    expect(leerPromocion(undefined, 699, "2026-10-01")).toEqual({ ok: true, promo: null });
  });
  it("rechaza incompleta, igual o más cara que la lista y con fin en el pasado", () => {
    expect(leerPromocion({ precio: 499 }, 699, "2026-10-01")).toMatchObject({ ok: false, error: "PROMOCION_INCOMPLETA" });
    expect(leerPromocion({ precio: 699, hasta: "2027-03-31" }, 699, "2026-10-01")).toMatchObject({ ok: false, error: "PROMOCION_PRECIO_INVALIDO" });
    expect(leerPromocion({ precio: -1, hasta: "2027-03-31" }, 699, "2026-10-01")).toMatchObject({ ok: false, error: "PROMOCION_INCOMPLETA" });
    expect(leerPromocion({ precio: 499, hasta: "2026-10-01" }, 699, "2026-10-01")).toMatchObject({ ok: false, error: "PROMOCION_FECHA_INVALIDA" });
  });
  it("acepta una buena y limpia el nombre", () => {
    expect(leerPromocion({ precio: "499", hasta: "2027-03-31", nombre: "  Piloto  " }, 699, "2026-10-01"))
      .toEqual({ ok: true, promo: { precio: 499, hasta: "2027-03-31", nombre: "Piloto" } });
  });
});

describe("estadoPrueba", () => {
  it("solo aplica a TRIAL con fecha", () => {
    expect(estadoPrueba("ACTIVO", "2026-10-30", "2026-09-30")).toEqual({ tipo: "NO_APLICA" });
    expect(estadoPrueba("TRIAL", null, "2026-09-30")).toEqual({ tipo: "NO_APLICA" });
  });
  it("días que faltan (0 = hoy es el último) y días vencida", () => {
    expect(estadoPrueba("TRIAL", "2026-10-05", "2026-09-30")).toEqual({ tipo: "EN_PRUEBA", hasta: "2026-10-05", dias: 5 });
    expect(estadoPrueba("TRIAL", "2026-09-30", "2026-09-30")).toEqual({ tipo: "EN_PRUEBA", hasta: "2026-09-30", dias: 0 });
    expect(estadoPrueba("TRIAL", "2026-09-27", "2026-09-30")).toEqual({ tipo: "VENCIDA", hasta: "2026-09-27", dias: 3 });
  });
});

describe("clabeValida (espejo de clabe_valida en 0141)", () => {
  it("acepta CLABEs con dígito de control correcto", () => {
    for (const c of ["002010077777777771", "032180000118359719", "646180157000000004"]) expect(clabeValida(c)).toBe(true);
  });
  it("rechaza control malo, largo distinto y letras", () => {
    for (const c of ["012180001234567897", "00201007777777777", "0020100777777777710", "00201007777777777a", ""]) expect(clabeValida(c)).toBe(false);
  });
});

describe("vistaPreviaCambioPlan (espejo de cambiar_plan_tenant)", () => {
  const ESENCIAL = { id: "e", nombre: "Esencial", precio_mensual_mxn: 699, timbres_cfdi_mensuales: 10, features_incluidos: { cfdi_incluido: false, delivery_incluido: false } };
  const NEGOCIO = { id: "n", nombre: "Negocio", precio_mensual_mxn: 999, timbres_cfdi_mensuales: 20, features_incluidos: { cfdi_incluido: true, delivery_incluido: true } };

  it("al subir: concede lo incluido, deja de cobrar lo que pagaba aparte, precio de lista y quita la promoción", () => {
    const v = vistaPreviaCambioPlan({
      nuevo: NEGOCIO, foliosAntes: 10,
      addons: [{ codigo: "DELIVERY", activo: true, precio: 100, incluidoEnPlan: false }],
      suscripcion: { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_nombre: "Piloto 5 negocios" },
    });
    expect(v).toEqual({
      folios: { antes: 10, despues: 20 },
      concede: ["CFDI", "DELIVERY"],
      dejaDePagar: [{ codigo: "DELIVERY", precio: 100 }],
      retira: [],
      precio: { antes: 699, despues: 999 },
      quitaPromocion: "Piloto 5 negocios",
    });
  });

  it("al bajar: retira solo lo que daba el plan; lo pagado aparte o de cortesía se queda", () => {
    const v = vistaPreviaCambioPlan({
      nuevo: ESENCIAL, foliosAntes: 20, precio: 499,
      addons: [
        { codigo: "CFDI", activo: true, precio: 0, incluidoEnPlan: true },
        { codigo: "DELIVERY", activo: true, precio: 0, incluidoEnPlan: false },
      ],
      suscripcion: { precio_mensual_mxn: 999 },
    });
    expect(v.retira).toEqual(["CFDI"]);
    expect(v.concede).toEqual([]);
    expect(v.precio).toEqual({ antes: 999, despues: 499 });
    expect(v.quitaPromocion).toBeNull();
  });

  it("sin cobro vigente no hay precio que cambiar", () => {
    expect(vistaPreviaCambioPlan({ nuevo: NEGOCIO, foliosAntes: null, addons: [], suscripcion: null }).precio).toBeNull();
  });
});

describe("montoPeriodos", () => {
  const s = { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-31" };
  it("cada periodo al precio de su fecha de cobro", () => {
    expect(montoPeriodos(s, "2027-02-01", 1, false)).toBe(499);
    expect(montoPeriodos(s, "2027-02-01", 3, false)).toBe(499 + 499 + 699);
  });
  it("anual: doce meses por periodo", () => {
    expect(montoPeriodos({ precio_mensual_mxn: 699 }, "2027-01-01", 1, true)).toBe(8388);
  });
});

describe("leerDatosPago", () => {
  it("normaliza CLABE y WhatsApp a dígitos y vacíos a null", () => {
    expect(leerDatosPago({ banco: " BBVA ", clabe: "002 010 077777777771", whatsapp: "+52 (477) 123-4567", correo: "", titular: null }))
      .toEqual({ ok: true, datos: { banco: "BBVA", titular: null, clabe: "002010077777777771", whatsapp: "524771234567", correo: null, instrucciones: null } });
  });
  it("rechaza una CLABE con dígito de control malo y un correo roto", () => {
    expect(leerDatosPago({ clabe: "012180001234567897" })).toMatchObject({ ok: false, campo: "clabe" });
    expect(leerDatosPago({ correo: "no-es-correo" })).toMatchObject({ ok: false, campo: "correo" });
    expect(leerDatosPago({ banco: 5 })).toMatchObject({ ok: false, campo: "banco" });
  });
});
