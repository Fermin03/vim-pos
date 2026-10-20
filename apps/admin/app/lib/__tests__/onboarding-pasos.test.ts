import { describe, it, expect } from "vitest";
import { debeMostrarPasos, resumenPasos, type EstadoOnboarding, type PasoOnboarding } from "../onboarding";

const paso = (clave: string, completo: boolean, opcional = false): PasoOnboarding =>
  ({ clave, titulo: clave, descripcion: "", href: "/", completo, opcional });

// Negocio y menú hechos; faltan caja, computadora y equipo; facturación (opcional) sin hacer.
const ESTADO_DOS_DE_CINCO: EstadoOnboarding = {
  fase: "EN_CONFIGURACION",
  pasos: [paso("negocio", true), paso("catalogo", true), paso("caja", false), paso("vincular", false), paso("equipo", false), paso("fiscal", false, true)],
  obligatoriosHechos: 2,
  obligatoriosTotal: 5,
  listoParaVender: false,
};

describe("debeMostrarPasos", () => {
  it("GO_LIVE no muestra pasos", () => {
    expect(debeMostrarPasos("GO_LIVE", 5)).toBe(false);
  });

  it("un supervisor no ve pasos; perfil cargando tampoco", () => {
    expect(debeMostrarPasos("EN_CONFIGURACION", 3)).toBe(false);
    expect(debeMostrarPasos("INVITADO", null)).toBe(false);
  });

  it("dueño o administrador en configuración sí", () => {
    expect(debeMostrarPasos("EN_CONFIGURACION", 5)).toBe(true);
    expect(debeMostrarPasos("INVITADO", 4)).toBe(true);
  });
});

describe("resumenPasos", () => {
  it("siguiente = primer obligatorio incompleto; ignorar facturación la quita", () => {
    const r = resumenPasos(ESTADO_DOS_DE_CINCO, new Set(["fiscal"]));
    expect(r.siguiente).toBe("caja");
    expect(r.visibles.map((p) => p.clave)).not.toContain("fiscal");
    expect(r.listo).toBe(false);
  });

  it("un obligatorio no se puede ignorar", () => {
    expect(resumenPasos(ESTADO_DOS_DE_CINCO, new Set(["caja"])).visibles.map((p) => p.clave)).toContain("caja");
  });

  it("todo hecho: sin siguiente y listo", () => {
    const listo = { ...ESTADO_DOS_DE_CINCO, pasos: ESTADO_DOS_DE_CINCO.pasos.map((p) => ({ ...p, completo: !p.opcional })), obligatoriosHechos: 5, listoParaVender: true };
    expect(resumenPasos(listo, new Set())).toMatchObject({ siguiente: null, listo: true });
  });
});
