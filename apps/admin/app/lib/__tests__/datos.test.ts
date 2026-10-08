import { describe, it, expect, vi, beforeEach } from "vitest";

// `supabase` es un singleton: el doble sustituye el módulo entero y anota qué se le pidió.
const doble = vi.hoisted(() => ({
  llamada: null as { tabla: string; valores: Record<string, unknown>; columna: string; id: string } | null,
  error: null as { message: string } | null,
  sesion: { tenantId: "t1" } as { tenantId?: string } | null,
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: (tabla: string) => ({
      update: (valores: Record<string, unknown>) => ({
        eq: async (columna: string, id: string) => {
          doble.llamada = { tabla, valores, columna, id };
          return { error: doble.error };
        },
      }),
    }),
  },
  leerSesion: vi.fn(async () => doble.sesion),
}));

import { borrarSuave, tenantId } from "../datos";
import { eliminarMesa } from "../mesas";
import { eliminarCliente } from "../clientes";

beforeEach(() => {
  doble.llamada = null;
  doble.error = null;
  doble.sesion = { tenantId: "t1" };
});

describe("borrarSuave", () => {
  it("marca deleted_at en la fila pedida y nada más", async () => {
    await borrarSuave("insumos", "i1");
    expect(doble.llamada?.tabla).toBe("insumos");
    expect(doble.llamada?.columna).toBe("id");
    expect(doble.llamada?.id).toBe("i1");
    expect(Object.keys(doble.llamada!.valores)).toEqual(["deleted_at"]);
    expect(Number.isNaN(Date.parse(String(doble.llamada!.valores.deleted_at)))).toBe(false);
  });

  it("suma lo que traiga `extra`", async () => {
    await borrarSuave("mesas", "m1", { activa: false });
    expect(doble.llamada?.valores.activa).toBe(false);
    expect(doble.llamada?.valores.deleted_at).toBeTypeOf("string");
  });

  it("si la base rechaza, lanza con su mensaje", async () => {
    doble.error = { message: "violates row-level security" };
    await expect(borrarSuave("mesas", "m1")).rejects.toThrow("violates row-level security");
  });

  it("las bajas de cada módulo siguen apuntando a su tabla", async () => {
    await eliminarMesa("m9");
    expect(doble.llamada).toMatchObject({ tabla: "mesas", id: "m9", valores: { activa: false } });
    await eliminarCliente("c9");
    expect(doble.llamada).toMatchObject({ tabla: "clientes", id: "c9" });
    expect(Object.keys(doble.llamada!.valores)).toEqual(["deleted_at"]);
  });
});

describe("tenantId", () => {
  it("devuelve el tenant de la sesión", async () => {
    expect(await tenantId()).toBe("t1");
  });

  it("sin sesión o sin tenant, lanza", async () => {
    doble.sesion = null;
    await expect(tenantId()).rejects.toThrow("Sesión sin tenant");
    doble.sesion = {};
    await expect(tenantId()).rejects.toThrow("Sesión sin tenant");
  });
});
