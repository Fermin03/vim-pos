import { afterEach, describe, expect, it, vi } from "vitest";
import { nuevoClientId, uuidV4Respaldo } from "../carrito";
import { nuevoClientIdComponente } from "../combos";

// Auditoría integral 30/09/2026 — B2-8: una tablet que abre la caja por http://IP de la LAN no
// tiene crypto.randomUUID (solo existe en contexto seguro) y la captura tronaba.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("nuevoClientId fuera de contexto seguro", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin crypto.randomUUID no truena y devuelve un uuid v4", () => {
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array) => b.fill(7) });
    const id = nuevoClientId();
    expect(id).toMatch(UUID_V4);
  });

  it("ni siquiera sin getRandomValues (cae a Math.random) y los ids no se repiten", () => {
    vi.stubGlobal("crypto", {});
    const ids = new Set(Array.from({ length: 200 }, () => nuevoClientId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("los componentes de combo también usan el respaldo", () => {
    vi.stubGlobal("crypto", {});
    expect(nuevoClientIdComponente()).toMatch(/^comp-/);
  });

  it("con crypto.randomUUID disponible lo usa tal cual", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    expect(nuevoClientId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("uuidV4Respaldo marca versión y variante", () => {
    expect(uuidV4Respaldo()).toMatch(UUID_V4);
  });
});
