import { describe, expect, it } from "vitest";
import { aFechaMx } from "@vim/fecha";
import { estadoSello, faltanDias, SELLO_AVISO_DIAS, SELLO_URGENTE_DIAS } from "@vim/db/sello";
import { debeAvisarGlobal, textoGlobalesPendientes } from "../facturacion-estado";

const hoy = "2026-09-30";

describe("estadoSello — el aviso de «tu sello está por vencer»", () => {
  it("los umbrales son 30 y 7 días", () => {
    expect([SELLO_AVISO_DIAS, SELLO_URGENTE_DIAS]).toEqual([30, 7]);
  });

  it("a 31 días todavía no avisa; a 30 sí", () => {
    expect(estadoSello("2026-10-31", hoy)).toEqual({ tipo: "VIGENTE", hasta: "2026-10-31", dias: 31 });
    expect(estadoSello("2026-10-30", hoy)).toEqual({ tipo: "POR_VENCER", hasta: "2026-10-30", dias: 30 });
  });

  it("a 8 días sigue siendo el aviso normal; a 7 sube de tono", () => {
    expect(estadoSello("2026-10-08", hoy).tipo).toBe("POR_VENCER");
    expect(estadoSello("2026-10-07", hoy)).toEqual({ tipo: "URGENTE", hasta: "2026-10-07", dias: 7 });
  });

  it("el último día de vigencia el sello todavía sirve: urgente, no vencido", () => {
    expect(estadoSello("2026-09-30", hoy)).toEqual({ tipo: "URGENTE", hasta: "2026-09-30", dias: 0 });
  });

  it("al día siguiente ya venció, y dice hace cuánto", () => {
    expect(estadoSello("2026-09-29", hoy)).toEqual({ tipo: "VENCIDO", hasta: "2026-09-29", dias: 1 });
    expect(estadoSello("2026-08-31", hoy)).toMatchObject({ tipo: "VENCIDO", dias: 30 });
  });

  it("sin sello o con una fecha ilegible no avisa nada", () => {
    expect(estadoSello(null, hoy)).toEqual({ tipo: "SIN_FECHA" });
    expect(estadoSello("", hoy)).toEqual({ tipo: "SIN_FECHA" });
    expect(estadoSello("mañana", hoy)).toEqual({ tipo: "SIN_FECHA" });
  });

  it("acepta la vigencia con hora (timestamp) y cuenta solo el día", () => {
    expect(estadoSello("2026-10-07T23:59:59Z", hoy)).toMatchObject({ tipo: "URGENTE", dias: 7 });
  });

  it("el día se cuenta en hora de México: a las 19:00 del 30 sep sigue siendo 30 sep", () => {
    // 2026-10-01T01:00Z = 30 sep 19:00 en México. Con la fecha UTC el aviso se adelantaría un día
    // y un sello que vence el 30 saldría como vencido la tarde del mismo 30.
    const tarde = aFechaMx(new Date("2026-10-01T01:00:00Z"));
    expect(tarde).toBe("2026-09-30");
    expect(estadoSello("2026-09-30", tarde).tipo).toBe("URGENTE");
  });

  it("faltanDias: singular, plural y hoy", () => {
    expect([faltanDias(12), faltanDias(1), faltanDias(0)]).toEqual(["faltan 12 días", "falta 1 día", "vence hoy"]);
  });
});

describe("textoGlobalesPendientes — «tienes N periodos sin factura global»", () => {
  it("sin pendientes no hay aviso", () => {
    expect(textoGlobalesPendientes([])).toBeNull();
  });

  it("uno, en singular", () => {
    expect(textoGlobalesPendientes([{ desde: "2026-08-01", hasta: "2026-08-31" }]))
      .toBe("Tienes 1 periodo sin factura global: 1 ago 2026 – 31 ago 2026.");
  });

  it("varios: del más viejo al más nuevo, sin importar cómo lleguen", () => {
    expect(textoGlobalesPendientes([
      { desde: "2026-08-01", hasta: "2026-08-31" },
      { desde: "2026-07-01", hasta: "2026-07-31" },
    ])).toBe("Tienes 2 periodos sin factura global: 1 jul 2026 – 31 jul 2026 y 1 ago 2026 – 31 ago 2026.");
  });

  it("un periodo diario se nombra con un solo día", () => {
    expect(textoGlobalesPendientes([{ desde: "2026-09-29", hasta: "2026-09-29" }]))
      .toBe("Tienes 1 periodo sin factura global: 29 sep 2026.");
  });

  it("con más de tres nombra los tres más viejos y cuenta el resto", () => {
    const dias = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"].map((d) => ({ desde: d, hasta: d }));
    expect(textoGlobalesPendientes(dias))
      .toBe("Tienes 5 periodos sin factura global: 25 sep 2026, 26 sep 2026, 27 sep 2026 y 2 más.");
  });
});

describe("debeAvisarGlobal — solo a quien de verdad factura", () => {
  const sello = { numeroCertificado: "30001000000500003416", vigenciaHasta: "2027-05-18" };
  it("sin emisor o sin sello cargado, no", () => {
    expect(debeAvisarGlobal({ existe: false, estado: "PRUEBA", csd: { numeroCertificado: null, vigenciaHasta: null } })).toBe(false);
    expect(debeAvisarGlobal({ existe: true, estado: "ACTIVO", csd: { numeroCertificado: null, vigenciaHasta: null } })).toBe(false);
  });
  it("con la facturación en pausa, no", () => {
    expect(debeAvisarGlobal({ existe: true, estado: "INACTIVO", csd: sello })).toBe(false);
  });
  it("con sello, en «Pruebas» o «Activo» (los dos timbran), sí", () => {
    expect(debeAvisarGlobal({ existe: true, estado: "PRUEBA", csd: sello })).toBe(true);
    expect(debeAvisarGlobal({ existe: true, estado: "ACTIVO", csd: sello })).toBe(true);
  });
});
