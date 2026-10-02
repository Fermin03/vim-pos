import { describe, it, expect, afterEach, vi } from "vitest";
import { ColaWindowsAdapter, listarImpresorasWindows } from "../cola-windows-adapter";
import { obtenerImpresora } from "../adapter";
import { guardarConfigImpresoras, leerConfigImpresoras } from "../config";

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}

/**
 * Impresora instalada en Windows: para el negocio que ya trae sus impresoras dadas de alta en la
 * PC (USB) y no tiene IP que capturar. Lo que no puede pasar es que un ticket se vaya a pantalla
 * en silencio, o que un fallo de la cola se reporte como impreso.
 */
describe("impresora instalada en Windows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda el trabajo al relay con el nombre de la impresora, no con una IP", async () => {
    const f = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", f);
    const r = await new ColaWindowsAdapter("POS-80C").abrirCajon();
    expect(r).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/__imprimir");
    const cuerpo = JSON.parse(init.body) as Record<string, unknown>;
    expect(cuerpo.impresoraWindows).toBe("POS-80C");
    expect(cuerpo.ip).toBeUndefined();
    expect(typeof cuerpo.datosB64).toBe("string");
    expect((cuerpo.datosB64 as string).length).toBeGreaterThan(0);
  });

  it("propaga el fallo de la cola en vez de darlo por impreso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: false, motivo: "OFFLINE" }) }));
    expect(await new ColaWindowsAdapter("POS-80C").abrirCajon()).toEqual({ ok: false, motivo: "OFFLINE" });
    expect(await new ColaWindowsAdapter("POS-80C").estado()).toBe("OFFLINE");
  });

  it("sin relay (navegador normal) reporta OFFLINE, no éxito silencioso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    expect((await new ColaWindowsAdapter("POS-80C").abrirCajon()).ok).toBe(false);
  });

  it("la config guarda el nombre y el destino usa la cola de Windows", () => {
    vi.stubGlobal("window", fakeWindow());
    guardarConfigImpresoras({
      estaciones: {
        estacion1: { tipo: "generica", ip: "192.168.0.21", puerto: 9100, ancho: 80 },
        estacion2: { tipo: "windows", nombre: "POS-80C", ancho: 80 },
      },
      asignacion: { CAJA: "estacion1", COCINA: "estacion2" },
    });
    expect(leerConfigImpresoras().estaciones.estacion2).toEqual({ tipo: "windows", nombre: "POS-80C", ancho: 80 });
    expect(obtenerImpresora("COCINA", { onMostrar: () => {} })).toBeInstanceOf(ColaWindowsAdapter);
  });

  it("tipo 'windows' sin impresora elegida cae en pantalla, no en una cola sin nombre", () => {
    vi.stubGlobal("window", fakeWindow());
    guardarConfigImpresoras({
      estaciones: { estacion1: { tipo: "windows" }, estacion2: { tipo: "preview" } },
      asignacion: { CAJA: "estacion1", COCINA: "estacion1" },
    });
    expect(obtenerImpresora("CAJA", { onMostrar: () => {} })).not.toBeInstanceOf(ColaWindowsAdapter);
  });

  it("listar: devuelve las impresoras; si no hay relay devuelve null (no una lista vacía)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, impresoras: [{ nombre: "POS-80C", predeterminada: true }, { nombre: "" }, null] }) }));
    expect(await listarImpresorasWindows()).toEqual([{ nombre: "POS-80C", predeterminada: true }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    expect(await listarImpresorasWindows()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: false }) }));
    expect(await listarImpresorasWindows()).toBeNull();
  });
});
