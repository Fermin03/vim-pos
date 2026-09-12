import { beforeEach, describe, expect, it, vi } from "vitest";

/** localStorage de mentiras: el módulo se prueba en Node, donde no existe. */
function memoriaLocal() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe("preciosVisibles", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { localStorage: unknown }).localStorage = memoriaLocal();
  });

  it("arranca apagado: la caja no enseña precios hasta que alguien los pide", async () => {
    const m = await import("../precios-visibles");
    expect(m.preciosVisibles()).toBe(false);
  });

  it("encenderlo cambia el valor y avisa a quien esté escuchando", async () => {
    const m = await import("../precios-visibles");
    let avisos = 0;
    m.suscribirPrecios(() => { avisos += 1; });
    m.setPreciosVisibles(true);
    expect(m.preciosVisibles()).toBe(true);
    expect(avisos).toBe(1);
  });

  it("no avisa si el valor no cambió: evita repintar la rejilla de balde", async () => {
    const m = await import("../precios-visibles");
    m.setPreciosVisibles(true);
    let avisos = 0;
    m.suscribirPrecios(() => { avisos += 1; });
    m.setPreciosVisibles(true);
    expect(avisos).toBe(0);
  });

  it("deja de avisar al que se da de baja", async () => {
    const m = await import("../precios-visibles");
    let avisos = 0;
    const baja = m.suscribirPrecios(() => { avisos += 1; });
    baja();
    m.setPreciosVisibles(true);
    expect(avisos).toBe(0);
  });

  it("recuerda el ajuste para la siguiente sesión de la caja", async () => {
    const m = await import("../precios-visibles");
    m.setPreciosVisibles(true);
    vi.resetModules();
    const otraSesion = await import("../precios-visibles");
    expect(otraSesion.preciosVisibles()).toBe(true);
  });

  it("si el almacenamiento del navegador falla, sigue funcionando en memoria", async () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error("acceso denegado"); },
      setItem: () => { throw new Error("acceso denegado"); },
    };
    const m = await import("../precios-visibles");
    expect(m.preciosVisibles()).toBe(false);
    expect(() => m.setPreciosVisibles(true)).not.toThrow();
    expect(m.preciosVisibles()).toBe(true);
  });
});
