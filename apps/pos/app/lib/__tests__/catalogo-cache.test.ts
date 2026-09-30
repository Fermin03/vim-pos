import { describe, expect, it } from "vitest";
import { claveCatalogo, esErrorDeRed } from "../catalogo-cache";

// Auditoría integral 30/09/2026 — B2-6: la caché del catálogo es de UN negocio y UNA sucursal,
// y solo se sirve cuando no hay red.

describe("claveCatalogo", () => {
  it("lleva tenant y sucursal: dos vinculaciones distintas no comparten menú", () => {
    expect(claveCatalogo("t1", "s1")).toBe("catalogo:t1:s1");
    expect(claveCatalogo("t1", "s1")).not.toBe(claveCatalogo("t1", "s2"));
    expect(claveCatalogo("t1", "s1")).not.toBe(claveCatalogo("t2", "s1"));
    expect(claveCatalogo("t1", "s1")).not.toBe("catalogo"); // la clave vieja, fija
  });
});

describe("esErrorDeRed", () => {
  it("sin conexión, cualquier fallo cuenta como de red", () => {
    expect(esErrorDeRed(new Error("lo que sea"), false)).toBe(true);
  });

  it("reconoce los mensajes de fetch caído de cada navegador", () => {
    for (const m of ["TypeError: Failed to fetch", "fetch failed", "NetworkError when attempting to fetch resource.", "Load failed", "Network request failed", "connect ECONNREFUSED 127.0.0.1:54321", "timeout"]) {
      expect(esErrorDeRed(new Error(m), true)).toBe(true);
    }
  });

  it("un error real con red (RLS, sesión, esquema) NO se tapa con la caché", () => {
    expect(esErrorDeRed(new Error("permission denied for table productos"), true)).toBe(false);
    expect(esErrorDeRed(new Error("JWT expired"), true)).toBe(false);
    expect(esErrorDeRed(new Error('column productos.foo does not exist'), true)).toBe(false);
    expect(esErrorDeRed(null, true)).toBe(false);
  });
});
