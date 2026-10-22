import { beforeEach, describe, expect, it, vi } from "vitest";

/** La primera vez habla de tienda cuando el giro del negocio es RETAIL; con otro giro, igual que hoy. */
const doble = vi.hoisted(() => ({ vertical: "QUICK_SERVICE" as string, conteos: {} as Record<string, number> }));

// Cadena de consulta falsa: cualquier método la devuelve; al esperarla o pedir maybeSingle da la fila.
vi.mock("../supabase", () => ({
  supabase: {
    from: (tabla: string) => {
      const fila = tabla === "tenants" ? { nombre_comercial: "Mi negocio", vertical_principal: doble.vertical } : null;
      const q: Record<string, unknown> = {
        maybeSingle: async () => ({ data: fila, error: null }),
        then: (ok: (r: unknown) => unknown) => ok({ count: doble.conteos[tabla] ?? 0, error: null }),
      };
      for (const m of ["select", "is", "eq", "not"]) q[m] = () => q;
      return q;
    },
  },
}));

import { leerEstadoOnboarding } from "../onboarding";

const paso = async (clave: string) => (await leerEstadoOnboarding()).pasos.find((p) => p.clave === clave)!;

beforeEach(() => {
  doble.vertical = "QUICK_SERVICE";
  doble.conteos = {};
});

describe("leerEstadoOnboarding — giro", () => {
  it("RETAIL: productos y equipo hablan de tienda", async () => {
    doble.vertical = "RETAIL";
    expect(await paso("catalogo")).toMatchObject({
      titulo: "Tus productos",
      descripcion: "Importa tus prendas con tallas y colores, o captúralas.",
      href: "/catalogo/importar-tienda",
    });
    expect((await paso("equipo")).descripcion).toBe("Crea a tus cajeros con su PIN.");
  });

  it("FERRETERIA: textos de tienda sin hablar de prendas", async () => {
    doble.vertical = "FERRETERIA";
    expect(await paso("catalogo")).toMatchObject({
      titulo: "Tus productos",
      descripcion: "Importa tus productos o captúralos.",
      href: "/catalogo/importar-tienda",
    });
    expect((await paso("equipo")).descripcion).toBe("Crea a tus cajeros con su PIN.");
  });

  it("QUICK_SERVICE: los textos de hoy", async () => {
    expect(await paso("catalogo")).toMatchObject({ titulo: "Tu menú", href: "/catalogo/importar" });
    expect((await paso("equipo")).descripcion).toBe("Crea cajeros y cocina con su PIN.");
  });
});

describe("leerEstadoOnboarding — pasos por giro", () => {
  const titulos = async () => (await leerEstadoOnboarding()).pasos.map((p) => [p.clave, p.titulo, p.opcional]);

  it("restaurante: los pasos de siempre", async () => {
    expect(await titulos()).toEqual([
      ["negocio", "Datos del negocio", false], ["catalogo", "Tu menú", false], ["caja", "Tu caja", false],
      ["vincular", "Conecta la computadora de tu caja", false], ["equipo", "Tu equipo", false], ["fiscal", "Facturación", true],
    ]);
  });

  it("tienda: los mismos pasos, con productos en vez de menú", async () => {
    doble.vertical = "ABARROTES";
    expect(await titulos()).toEqual([
      ["negocio", "Datos del negocio", false], ["catalogo", "Tus productos", false], ["caja", "Tu caja", false],
      ["vincular", "Conecta la computadora de tu caja", false], ["equipo", "Tu equipo", false], ["fiscal", "Facturación", true],
    ]);
  });

  it("salón: servicios, equipo, colaboradores y horarios, caja, vincular y facturación; sin menú ni cocina", async () => {
    doble.vertical = "SALON";
    const e = await leerEstadoOnboarding();
    expect(e.pasos.map((p) => [p.clave, p.titulo, p.href, p.opcional])).toEqual([
      ["servicios", "Tus servicios", "/agenda/servicios", false],
      ["equipo", "Tu equipo", "/usuarios", false],
      ["colaboradores", "Colaboradores y horarios", "/agenda/colaboradores", false],
      ["caja", "Tu caja", "/configuracion/cajas", false],
      ["vincular", "Vincula tu caja", "/configuracion/cajas/descargar", false],
      ["fiscal", "Facturación", "/configuracion/facturacion", true],
    ]);
    expect(JSON.stringify(e.pasos)).not.toMatch(/men[uú]|cocina/i);
    expect(e).toMatchObject({ obligatoriosHechos: 0, obligatoriosTotal: 5, listoParaVender: false });
  });

  it("salón: cada paso se marca con su conteo (equipo pide más de un empleado)", async () => {
    doble.vertical = "BARBERIA";
    doble.conteos = { servicios_agenda: 2, usuarios_perfil: 1, horarios_colaborador: 1, cajas: 1 };
    const e = await leerEstadoOnboarding();
    const hecho = Object.fromEntries(e.pasos.map((p) => [p.clave, p.completo]));
    expect(hecho).toEqual({ servicios: true, equipo: false, colaboradores: true, caja: true, vincular: true, fiscal: false });
    doble.conteos = { usuarios_perfil: 2 };
    const hecho2 = Object.fromEntries((await leerEstadoOnboarding()).pasos.map((p) => [p.clave, p.completo]));
    expect(hecho2).toMatchObject({ servicios: false, equipo: true, colaboradores: false });
  });
});
