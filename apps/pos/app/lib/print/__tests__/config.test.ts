import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { leerConfigImpresoras, guardarConfigImpresoras, leerConfigParaDestino, hayEstacionDeCocinaDedicada } from "../config";

/** Fake mínimo de localStorage + window para probar el módulo en entorno "node" (sin jsdom). */
function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}

describe("config de impresoras (2 estaciones)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin config previa: preview en ambas estaciones, ambos destinos en Estación 1", () => {
    vi.stubGlobal("window", fakeWindow());
    const cfg = leerConfigImpresoras();
    expect(cfg.estaciones.estacion1).toEqual({ tipo: "preview" });
    expect(cfg.estaciones.estacion2).toEqual({ tipo: "preview" });
    expect(cfg.asignacion).toEqual({ CAJA: "estacion1", COCINA: "estacion1" });
    expect(hayEstacionDeCocinaDedicada()).toBe(false);
  });

  it("migra la config previa (una sola impresora) a Estación 1 usada por ambos destinos", () => {
    const w = fakeWindow();
    w.localStorage.setItem("vim_impresora", JSON.stringify({ tipo: "generica", ip: "192.168.0.21", puerto: 9100, ancho: 80 }));
    vi.stubGlobal("window", w);

    const cfg = leerConfigImpresoras();
    expect(cfg.estaciones.estacion1).toEqual({ tipo: "generica", ip: "192.168.0.21", puerto: 9100, ancho: 80 });
    expect(cfg.estaciones.estacion2).toEqual({ tipo: "preview" });
    expect(cfg.asignacion).toEqual({ CAJA: "estacion1", COCINA: "estacion1" });
  });

  it("guarda y relee las 2 estaciones + asignación, y resuelve la config por destino", () => {
    vi.stubGlobal("window", fakeWindow());
    guardarConfigImpresoras({
      estaciones: {
        estacion1: { tipo: "generica", ip: "192.168.0.21", puerto: 9100, ancho: 80 },
        estacion2: { tipo: "generica", ip: "192.168.0.22", puerto: 9100, ancho: 58 },
      },
      asignacion: { CAJA: "estacion1", COCINA: "estacion2" },
    });

    expect(leerConfigParaDestino("CAJA")).toEqual({ tipo: "generica", ip: "192.168.0.21", puerto: 9100, ancho: 80 });
    expect(leerConfigParaDestino("COCINA")).toEqual({ tipo: "generica", ip: "192.168.0.22", puerto: 9100, ancho: 58 });
    expect(hayEstacionDeCocinaDedicada()).toBe(true);
  });
});
