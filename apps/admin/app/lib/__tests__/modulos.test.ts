import { describe, it, expect, vi } from "vitest";

/**
 * `supabase` es un singleton (mismo patrón que el resto de apps/admin/app/lib): no hay forma de
 * inyectarlo en `leerModulos`/`activarModuloDelivery`, así que el doble sustituye el módulo
 * entero. `leerSesion` se fija a un tenant fijo: a estas dos funciones solo les importa que la
 * sesión tenga tenant, no de quién es.
 */
const doble = vi.hoisted(() => ({
  rpc: {} as Record<string, unknown>,
  rpcError: null as { message: string } | null,
  upsert: null as { tabla: string; valores: Record<string, unknown> } | null,
}));

vi.mock("../supabase", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) => (doble.rpcError ? { data: null, error: doble.rpcError } : { data: doble.rpc[fn] ?? null, error: null })),
    from: vi.fn((tabla: string) => ({
      upsert: vi.fn(async (valores: Record<string, unknown>) => {
        doble.upsert = { tabla, valores };
        return { error: null };
      }),
    })),
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB" })),
}));

import { activarModuloDelivery, leerModulos } from "../modulos";

/**
 * Doble de supabase: fija lo que el RPC `modulos_efectivos` devuelve en la siguiente llamada, o
 * el error que PostgREST regresaría si el RPC falla (`{ error: "..." }` en vez de `{ rpc }`) —
 * esa rama de `leerModulos` (`if (error) throw`) no queda cubierta si el doble solo sabe
 * responder con éxito.
 */
function supabaseFalso(cfg: { rpc: Record<string, unknown> } | { error: string }) {
  doble.rpc = "rpc" in cfg ? cfg.rpc : {};
  doble.rpcError = "error" in cfg ? { message: cfg.error } : null;
  return doble;
}

describe("leerModulos", () => {
  it("devuelve las dos capas", async () => {
    supabaseFalso({ rpc: { modulos_efectivos: { permitidos: { delivery_apps: true }, efectivos: { delivery_apps: false } } } });
    const m = await leerModulos();
    expect(m.permitidos.delivery_apps).toBe(true);
    expect(m.efectivos.delivery_apps).toBe(false);
  });

  it("sin respuesta del RPC, nada está permitido", async () => {
    supabaseFalso({ rpc: { modulos_efectivos: null } });
    const m = await leerModulos();
    expect(m).toEqual({ permitidos: {}, efectivos: {} });
  });

  it("si el RPC falla, se propaga el error (no se esconde como 'nada permitido')", async () => {
    supabaseFalso({ error: "conexión perdida" });
    await expect(leerModulos()).rejects.toThrow("conexión perdida");
  });
});

describe("activarModuloDelivery", () => {
  it("hace upsert por tenant_id, no un UPDATE que podría afectar 0 filas", async () => {
    doble.upsert = null;
    await activarModuloDelivery(true);
    expect(doble.upsert).toEqual({ tabla: "configuracion_tenant", valores: { tenant_id: "t1", modulo_delivery_activo: true } });
  });

  it("también al apagar", async () => {
    doble.upsert = null;
    await activarModuloDelivery(false);
    expect(doble.upsert).toEqual({ tabla: "configuracion_tenant", valores: { tenant_id: "t1", modulo_delivery_activo: false } });
  });
});
