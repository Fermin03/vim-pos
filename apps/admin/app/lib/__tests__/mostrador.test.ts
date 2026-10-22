import { beforeEach, describe, expect, it, vi } from "vitest";

const doble = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null as { message: string } | null })),
  fila: null as Record<string, unknown> | null,
}));

vi.mock("../datos", () => ({ tenantId: async () => "t1" }));
vi.mock("../supabase", () => ({
  supabase: {
    from: () => ({
      upsert: doble.upsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: doble.fila, error: null }) }) }),
    }),
  },
}));

import { casillasMostrador, guardarConfigMostrador, leerConfigMostrador } from "../mostrador";

beforeEach(() => { doble.upsert.mockClear(); doble.fila = null; });

describe("casillasMostrador", () => {
  it("el nombre se ofrece en comida rápida, food truck y cafetería; «dónde comer» solo en food truck", () => {
    expect(casillasMostrador("QUICK_SERVICE")).toEqual({ nombre: true, dondeComer: false });
    expect(casillasMostrador("FOODTRUCK")).toEqual({ nombre: true, dondeComer: true });
    expect(casillasMostrador("CAFETERIA")).toEqual({ nombre: true, dondeComer: false });
  });
  it("los demás giros no ven nada", () => {
    for (const g of ["FULL_SERVICE", "BAR", "TAQUERIA", "RETAIL", null]) {
      expect(casillasMostrador(g)).toEqual({ nombre: false, dondeComer: false });
    }
  });
});

describe("configuración del mostrador", () => {
  it("guarda con upsert por tenant_id y solo lo que cambió", async () => {
    await guardarConfigMostrador({ pedirNombre: true });
    expect(doble.upsert).toHaveBeenCalledWith({ tenant_id: "t1", pedir_nombre_cliente: true }, { onConflict: "tenant_id" });
    await guardarConfigMostrador({ tieneDondeComer: false });
    expect(doble.upsert).toHaveBeenLastCalledWith({ tenant_id: "t1", tiene_donde_comer: false }, { onConflict: "tenant_id" });
  });
  it("lee false sin fila y los valores con fila", async () => {
    expect(await leerConfigMostrador()).toEqual({ pedirNombre: false, tieneDondeComer: false });
    doble.fila = { pedir_nombre_cliente: true, tiene_donde_comer: true };
    expect(await leerConfigMostrador()).toEqual({ pedirNombre: true, tieneDondeComer: true });
  });
});
