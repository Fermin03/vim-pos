import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { urlConexionUber, generarState, iniciarConexionUber, validarState, mensajeErrorIntegracion, etiquetaEstado, RUTA_CALLBACK_UBER } from "../integraciones";

// vitest corre en entorno node: se simula lo mínimo del navegador que usa el flujo OAuth.
beforeAll(() => {
  const mapa = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => { mapa.set(k, v); },
    removeItem: (k: string) => { mapa.delete(k); },
    clear: () => { mapa.clear(); },
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { location: { origin: "http://localhost:3001" } }, configurable: true });
});

describe("urlConexionUber", () => {
  it("arma la URL de autorización con scope eats.pos_provisioning y state", () => {
    const u = new URL(urlConexionUber({ entorno: "sandbox", clientId: "cid", redirectUri: "http://localhost:3001" + RUTA_CALLBACK_UBER, state: "s1" }));
    expect(u.origin).toBe("https://sandbox-login.uber.com");
    expect(u.pathname).toBe("/oauth/v2/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("eats.pos_provisioning");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3001/configuracion/integraciones/uber/callback");
  });
  it("producción usa auth.uber.com", () => {
    expect(urlConexionUber({ entorno: "produccion", clientId: "c", redirectUri: "r", state: "s" })).toMatch(/^https:\/\/auth\.uber\.com\//);
  });
});

describe("state anti-CSRF", () => {
  beforeEach(() => sessionStorage.clear());
  it("generarState da 32 hex distintos cada vez", () => {
    const a = generarState(), b = generarState();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
  it("iniciarConexionUber guarda el state, usa el origin del navegador, y validarState lo acepta una sola vez", () => {
    const url = new URL(iniciarConexionUber());
    const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3001" + RUTA_CALLBACK_UBER);
    expect(validarState(state)).toBe(true);
    expect(validarState(state)).toBe(false);
  });
  it("un state ajeno o nulo no pasa", () => {
    iniciarConexionUber();
    expect(validarState("otro")).toBe(false);
    iniciarConexionUber();
    expect(validarState(null)).toBe(false);
  });
});

describe("mensajeErrorIntegracion", () => {
  it("traduce los códigos de la función", () => {
    expect(mensajeErrorIntegracion(new Error("SIN_AUTORIZACION"))).toMatch(/vuelve a conectar/i);
    expect(mensajeErrorIntegracion(new Error("TIENDA_YA_CONECTADA"))).toMatch(/otra sucursal/i);
    expect(mensajeErrorIntegracion(new Error("SIN_PERMISO"))).toMatch(/administrador/i);
    expect(mensajeErrorIntegracion(new Error("UBER_ERROR"))).toMatch(/Uber/);
    expect(mensajeErrorIntegracion(new Error("LO_QUE_SEA"))).toMatch(/Algo salió mal/);
  });
});

describe("etiquetaEstado", () => {
  it("tiene texto para cada estado", () => {
    for (const e of ["SIN_CONECTAR", "PENDIENTE", "ACTIVA", "PAUSADA", "ERROR", "DESCONECTADA"] as const) expect(etiquetaEstado(e).length).toBeGreaterThan(0);
  });
});
