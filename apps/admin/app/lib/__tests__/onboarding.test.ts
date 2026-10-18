import { beforeEach, describe, expect, it, vi } from "vitest";

/** La primera vez habla de tienda cuando el giro del negocio es RETAIL; con otro giro, igual que hoy. */
const doble = vi.hoisted(() => ({ vertical: "QUICK_SERVICE" as string }));

// Cadena de consulta falsa: cualquier método la devuelve; al esperarla o pedir maybeSingle da la fila.
vi.mock("../supabase", () => ({
  supabase: {
    from: (tabla: string) => {
      const fila = tabla === "tenants" ? { nombre_comercial: "Mi negocio", vertical_principal: doble.vertical } : null;
      const q: Record<string, unknown> = {
        maybeSingle: async () => ({ data: fila, error: null }),
        then: (ok: (r: unknown) => unknown) => ok({ count: 0, error: null }),
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
