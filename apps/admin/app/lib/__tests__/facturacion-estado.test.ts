import { describe, it, expect } from "vitest";
import { diasHasta, estadoFacturacion } from "../facturacion-estado";

const datos = { rfc: "EKU9003173C9", razon_social: "ESCUELA KEMPER URGATE", regimen_fiscal: "601", codigo_postal_fiscal: "42501" };
const sello = { numeroCertificado: "30001000000500003416", vigenciaHasta: "2027-05-18" };
const hoy = new Date(2026, 8, 25);

describe("estadoFacturacion — ¿ya puedo facturar?", () => {
  it("negocio nuevo: faltan datos y sello", () => {
    const e = estadoFacturacion(
      { rfc: "", razon_social: "", regimen_fiscal: null, codigo_postal_fiscal: "" },
      { estado: "PRUEBA", csd: { numeroCertificado: null, vigenciaHasta: null } },
      hoy,
    );
    expect(e.faltan).toEqual(["tus datos fiscales", "cargar tu sello digital"]);
    expect(e.lista).toBe(false);
  });

  it("con la razón social sola NO cuenta como datos completos (antes sí)", () => {
    const e = estadoFacturacion({ ...datos, rfc: "", codigo_postal_fiscal: "" }, { estado: "PRUEBA", csd: sello }, hoy);
    expect(e.datosCompletos).toBe(false);
  });

  it("el modo viejo «Pruebas» con datos y sello SÍ está listo: timbra igual que hoy", () => {
    const e = estadoFacturacion(datos, { estado: "PRUEBA", csd: sello }, hoy);
    expect(e).toMatchObject({ lista: true, pausada: false, faltan: [] });
  });

  it("pausada: no está lista y dice que hay que reanudarla", () => {
    const e = estadoFacturacion(datos, { estado: "INACTIVO", csd: sello }, hoy);
    expect(e.lista).toBe(false);
    expect(e.faltan).toEqual(["reanudar la facturación, que está en pausa"]);
  });

  it("sello vencido: no está lista y dice que hay que renovarlo", () => {
    const e = estadoFacturacion(datos, { estado: "ACTIVO", csd: { ...sello, vigenciaHasta: "2026-09-24" } }, hoy);
    expect(e.selloVencido).toBe(true);
    expect(e.lista).toBe(false);
    expect(e.faltan[0]).toMatch(/renovar/);
  });
});

describe("diasHasta", () => {
  it("cuenta días de calendario", () => {
    expect(diasHasta("2026-09-25", hoy)).toBe(0);
    expect(diasHasta("2026-10-25", hoy)).toBe(30);
    expect(diasHasta("2026-09-24", hoy)).toBe(-1);
  });
});
