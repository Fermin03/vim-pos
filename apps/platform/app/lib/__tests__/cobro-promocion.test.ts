import { describe, expect, it } from "vitest";
import { clabeValida, estadoPrueba, precioVigente, promocionVigente, textoPrecio } from "@vim/db/cobro";
import { fechaCobro, fechaValida, leerPromocion, montoPeriodos, promocionPiloto } from "../promocion";
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

describe("promocionPiloto (cobro por adelantado)", () => {
  it("vale hasta el día anterior al séptimo cobro (inicio + 6 meses, anclado al alta)", () => {
    expect(promocionPiloto("2026-10-01")).toEqual({ precio: 499, hasta: "2027-03-31", nombre: "Piloto 5 negocios" });
    // Alta un 31: el séptimo cobro cae el 28 feb (recorte a fin de mes, como la base) y un día antes.
    expect(promocionPiloto("2026-08-31").hasta).toBe("2027-02-27");
  });
  it("son EXACTAMENTE seis cobros a $499 y el séptimo a $699", () => {
    for (const inicio of ["2026-10-01", "2026-08-31", "2027-01-31"]) {
      const p = promocionPiloto(inicio);
      const s = { precio_mensual_mxn: 699, precio_promocional_mxn: p.precio, promocion_hasta: p.hasta };
      // Por adelantado: los cobros caen en inicio, +1, …, +6 meses, anclados al día de alta.
      const cobros = Array.from({ length: 7 }, (_, k) => precioVigente(s, fechaCobro(inicio, inicio, k)));
      expect(cobros).toEqual([499, 499, 499, 499, 499, 499, 699]);
    }
  });
});

describe("fechaCobro (espejo de _fecha_cobro_siguiente)", () => {
  it("se ancla al día de alta: el 31 cobra 28 feb y luego 31 mar, no 28 para siempre", () => {
    expect(fechaCobro("2027-01-31", "2027-01-31", 1)).toBe("2027-02-28");
    expect(fechaCobro("2027-01-31", "2027-02-28", 1)).toBe("2027-03-31");
  });
});

describe("fechaValida", () => {
  it("rechaza fechas que no existen", () => {
    expect(fechaValida("2027-02-30")).toBe(false);
    expect(fechaValida("2027-13-01")).toBe(false);
    expect(fechaValida("2028-02-29")).toBe(true);
    expect(fechaValida("2027-2-1")).toBe(false);
  });
});

describe("leerPromocion", () => {
  it("sin promoción es válido", () => {
    expect(leerPromocion(undefined, 699, "2026-10-01", "MENSUAL")).toEqual({ ok: true, promo: null });
  });
  it("rechaza incompleta, igual o más cara que la lista, antes del primer cobro y fechas inexistentes", () => {
    expect(leerPromocion({ precio: 499 }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: false, error: "PROMOCION_INCOMPLETA" });
    expect(leerPromocion({ precio: 699, hasta: "2027-03-31" }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: false, error: "PROMOCION_PRECIO_INVALIDO" });
    expect(leerPromocion({ precio: -1, hasta: "2027-03-31" }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: false, error: "PROMOCION_INCOMPLETA" });
    expect(leerPromocion({ precio: 499, hasta: "2026-09-30" }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: false, error: "PROMOCION_FECHA_INVALIDA" });
    expect(leerPromocion({ precio: 499, hasta: "2027-02-30" }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: false, error: "PROMOCION_FECHA_INVALIDA" });
  });
  it("con cobro anual no hay promoción", () => {
    expect(leerPromocion({ precio: 499, hasta: "2027-03-31" }, 699, "2026-10-01", "ANUAL")).toMatchObject({ ok: false, error: "PROMOCION_CICLO_INVALIDO" });
  });
  it("acepta una buena (incluso hasta el mismo día del primer cobro) y limpia el nombre", () => {
    expect(leerPromocion({ precio: "499", hasta: "2027-03-31", nombre: "  Piloto  " }, 699, "2026-10-01", "MENSUAL"))
      .toEqual({ ok: true, promo: { precio: 499, hasta: "2027-03-31", nombre: "Piloto" } });
    expect(leerPromocion({ precio: 499, hasta: "2026-10-01" }, 699, "2026-10-01", "MENSUAL")).toMatchObject({ ok: true });
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
      suscripcion: { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-31", promocion_nombre: "Piloto 5 negocios" }, hoy: "2026-11-15",
    });
    expect(v).toEqual({
      folios: { antes: 10, despues: 20 },
      concede: ["CFDI", "DELIVERY"],
      dejaDePagar: [{ codigo: "DELIVERY", precio: 100 }],
      retira: [],
      retiraExtras: [],
      precio: { antes: 499, despues: 999 },
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
      suscripcion: { precio_mensual_mxn: 999 }, hoy: "2026-11-15",
    });
    expect(v.retira).toEqual(["CFDI"]);
    expect(v.concede).toEqual([]);
    expect(v.precio).toEqual({ antes: 999, despues: 499 });
    expect(v.quitaPromocion).toBeNull();
  });

  it("una promoción que ya venció no se anuncia como que se quita", () => {
    const v = vistaPreviaCambioPlan({
      nuevo: NEGOCIO, foliosAntes: 10, addons: [], hoy: "2027-05-01",
      suscripcion: { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-31", promocion_nombre: "Piloto 5 negocios" },
    });
    expect(v.quitaPromocion).toBeNull();
    expect(v.precio).toEqual({ antes: 699, despues: 999 });
  });

  it("sin cobro vigente no hay precio que cambiar", () => {
    expect(vistaPreviaCambioPlan({ nuevo: NEGOCIO, foliosAntes: null, addons: [], suscripcion: null, hoy: "2026-11-15" }).precio).toBeNull();
  });
  it("la lealtad también entra y sale con el plan", () => {
    const esencial = { ...ESENCIAL, features_incluidos: { ...ESENCIAL.features_incluidos, lealtad_incluido: false } };
    const negocio = { ...NEGOCIO, features_incluidos: { ...NEGOCIO.features_incluidos, lealtad_incluido: true } };
    const sube = vistaPreviaCambioPlan({
      nuevo: negocio, foliosAntes: 10,
      addons: [{ codigo: "LEALTAD", activo: true, precio: 100, incluidoEnPlan: false }],
      suscripcion: { precio_mensual_mxn: 699, precio_promocional_mxn: null, promocion_hasta: null, promocion_nombre: null }, hoy: "2026-11-15",
    });
    expect(sube.concede).toContain("LEALTAD");
    expect(sube.dejaDePagar).toContainEqual({ codigo: "LEALTAD", precio: 100 });

    const baja = vistaPreviaCambioPlan({
      nuevo: esencial, foliosAntes: 20,
      addons: [{ codigo: "LEALTAD", activo: true, precio: 0, incluidoEnPlan: true }],
      suscripcion: { precio_mensual_mxn: 999, precio_promocional_mxn: null, promocion_hasta: null, promocion_nombre: null }, hoy: "2026-11-15",
    });
    expect(baja.retira).toContain("LEALTAD");
  });

  // Entrega 7 de la tienda. La base solo sincroniza TIENDA cuando el complemento está activo en el
  // catálogo (0167); la vista previa lo sabe por el catálogo que el panel ya lee con activo = true.
  describe("la tienda en línea", () => {
    const esencial = { ...ESENCIAL, features_incluidos: { ...ESENCIAL.features_incluidos, tienda_incluida: false } };
    const negocio = { ...NEGOCIO, features_incluidos: { ...NEGOCIO.features_incluidos, tienda_incluida: true } };
    const suscripcion = { precio_mensual_mxn: 699, precio_promocional_mxn: null, promocion_hasta: null, promocion_nombre: null };

    it("REGLA DE ORO: con el complemento inactivo, la vista previa es la de hoy: ni la concede ni la retira", () => {
      for (const catalogoActivo of [undefined, [], ["CFDI", "DELIVERY", "LEALTAD"]]) {
        const sube = vistaPreviaCambioPlan({ nuevo: negocio, foliosAntes: 10, addons: [], suscripcion, hoy: "2026-11-15", catalogoActivo });
        expect(sube.concede).toEqual(["CFDI", "DELIVERY"]);
        expect(sube.dejaDePagar).toEqual([]);
        const baja = vistaPreviaCambioPlan({
          nuevo: esencial, foliosAntes: 20, suscripcion, hoy: "2026-11-15", catalogoActivo,
          addons: [{ codigo: "TIENDA", activo: true, precio: 0, incluidoEnPlan: true }],
        });
        expect(baja.retira).toEqual([]);
      }
    });

    it("con el complemento activo entra y sale con el plan, como los demás", () => {
      const catalogoActivo = ["CFDI", "DELIVERY", "LEALTAD", "TIENDA"];
      const sube = vistaPreviaCambioPlan({
        nuevo: negocio, foliosAntes: 10, suscripcion, hoy: "2026-11-15", catalogoActivo,
        addons: [{ codigo: "TIENDA", activo: true, precio: 100, incluidoEnPlan: false }],
      });
      expect(sube.concede).toEqual(["CFDI", "DELIVERY", "TIENDA"]);
      expect(sube.dejaDePagar).toEqual([{ codigo: "TIENDA", precio: 100 }]);

      const baja = vistaPreviaCambioPlan({
        nuevo: esencial, foliosAntes: 20, suscripcion, hoy: "2026-11-15", catalogoActivo,
        addons: [{ codigo: "TIENDA", activo: true, precio: 0, incluidoEnPlan: true }],
      });
      expect(baja.retira).toEqual(["TIENDA"]);
      // Pagada aparte o de cortesía: se queda.
      expect(vistaPreviaCambioPlan({
        nuevo: esencial, foliosAntes: 20, suscripcion, hoy: "2026-11-15", catalogoActivo,
        addons: [{ codigo: "TIENDA", activo: true, precio: 100, incluidoEnPlan: false }],
      }).retira).toEqual([]);
    });

    it("los demás complementos no dependen del catálogo: la base no les pregunta si están activos", () => {
      const v = vistaPreviaCambioPlan({ nuevo: negocio, foliosAntes: 10, addons: [], suscripcion, hoy: "2026-11-15", catalogoActivo: [] });
      expect(v.concede).toEqual(["CFDI", "DELIVERY"]);
    });
  });
});

describe("montoPeriodos", () => {
  const s = { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-31", fecha_inicio: "2026-10-01" };
  it("cada periodo al precio de su fecha de cobro", () => {
    expect(montoPeriodos(s, "2027-02-01", 1, false)).toBe(499);
    expect(montoPeriodos(s, "2027-02-01", 3, false)).toBe(499 + 499 + 699);
  });
  it("anual: doce meses por periodo", () => {
    expect(montoPeriodos({ precio_mensual_mxn: 699, fecha_inicio: "2027-01-01" }, "2027-01-01", 1, true)).toBe(8388);
  });
  it("se ancla al día de alta como la base: una alta del 31 cobra el 31 de marzo, no el 28", () => {
    // Promoción hasta el 30 mar: el cobro de marzo (el 31, anclado) ya es a lista. Encadenando
    // "+1 mes" desde el 28 feb saldría el 28 mar, a precio de promoción.
    const s31 = { precio_mensual_mxn: 699, precio_promocional_mxn: 499, promocion_hasta: "2027-03-30", fecha_inicio: "2027-01-31" };
    expect(montoPeriodos(s31, "2027-02-28", 2, false)).toBe(499 + 699);
  });
});

describe("leerDatosPago", () => {
  it("normaliza CLABE y WhatsApp a dígitos y vacíos a null", () => {
    expect(leerDatosPago({ banco: " BBVA ", clabe: "002 010 077777777771", whatsapp: "+52 (477) 123-4567", correo: "", titular: null, instrucciones: null }))
      .toEqual({ ok: true, datos: { banco: "BBVA", titular: null, clabe: "002010077777777771", whatsapp: "524771234567", correo: null, instrucciones: null } });
  });
  it("rechaza una CLABE con dígito de control malo y un correo roto", () => {
    const vacio = { banco: null, titular: null, clabe: null, whatsapp: null, correo: null, instrucciones: null };
    expect(leerDatosPago({ ...vacio, clabe: "012180001234567897" })).toMatchObject({ ok: false, campo: "clabe" });
    expect(leerDatosPago({ ...vacio, correo: "no-es-correo" })).toMatchObject({ ok: false, campo: "correo" });
    expect(leerDatosPago({ ...vacio, banco: 5 })).toMatchObject({ ok: false, campo: "banco" });
  });
  it("un cuerpo parcial se rechaza: el PUT es el registro completo", () => {
    expect(leerDatosPago({ clabe: "002010077777777771" })).toMatchObject({ ok: false });
    expect(leerDatosPago({ banco: "BBVA", titular: null, clabe: null, whatsapp: null, correo: null })).toMatchObject({ ok: false, campo: "instrucciones" });
  });
});
