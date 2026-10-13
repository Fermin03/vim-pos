import { beforeAll, describe, expect, it } from "vitest";
import { esStateDeTienda, iniciarConexionTienda, mensajeErrorConexionTienda, validarStateTienda } from "../tienda-conexion";
import { iniciarConexionMp, validarStateMp, REGRESO_MP } from "../terminal";

beforeAll(() => {
  const mapa = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v), removeItem: (k: string) => void mapa.delete(k) },
  });
});

describe("conectar Mercado Pago para la tienda en línea", () => {
  it("manda al dueño a Mercado Pago con la misma URL de regreso registrada y un state que dice «tienda»", () => {
    const u = new URL(iniciarConexionTienda());
    expect(u.origin + u.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(u.searchParams.get("redirect_uri")).toBe(REGRESO_MP);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toMatch(/^tienda\.[0-9a-f]{32}$/);
  });
  it("el state vale una vez, y solo el que se guardó", () => {
    const state = new URL(iniciarConexionTienda()).searchParams.get("state");
    expect(validarStateTienda("tienda.otro")).toBe(false);
    expect(validarStateTienda(state)).toBe(false);   // el intento anterior ya lo consumió
    const otro = new URL(iniciarConexionTienda()).searchParams.get("state");
    expect(validarStateTienda(otro)).toBe(true);
    expect(validarStateTienda(otro)).toBe(false);
    expect(validarStateTienda(null)).toBe(false);
  });
  it("los dos flujos no se confunden: el state de la terminal no es de la tienda, ni al revés", () => {
    const deTerminal = new URL(iniciarConexionMp()).searchParams.get("state");
    const deTienda = new URL(iniciarConexionTienda()).searchParams.get("state");
    expect(esStateDeTienda(deTerminal)).toBe(false);
    expect(esStateDeTienda(deTienda)).toBe(true);
    expect(esStateDeTienda(null)).toBe(false);
    // El state de la tienda no pasa como de la terminal (cada uno guarda el suyo), y el de la terminal sigue valiendo.
    expect(validarStateTienda(deTerminal)).toBe(false);
    expect(validarStateMp(deTerminal)).toBe(true);
  });
  it("los errores se dicen en palabras del dueño, nunca el código", () => {
    expect(mensajeErrorConexionTienda(new Error("PAGOS_PENDIENTES"))).toContain("devolución sin terminar");
    // Cobró hace poco: dice por qué y desde cuándo se podrá (hora del centro de México).
    const reciente = mensajeErrorConexionTienda(new Error("PAGOS_RECIENTES:2026-10-13T18:30:00+00:00"));
    expect(reciente).toContain("últimas 48 horas");
    expect(reciente).toMatch(/a partir del 13 de octubre.{1,12}12:30/);
    // Sin fecha legible no se inventa ninguna.
    expect(mensajeErrorConexionTienda(new Error("PAGOS_RECIENTES"))).not.toMatch(/a partir del/);
    expect(mensajeErrorConexionTienda(new Error("PAGOS_RECIENTES:no-es-fecha"))).not.toMatch(/a partir del|Invalid/);
    expect(mensajeErrorConexionTienda(new Error("SIN_PUBLIC_KEY"))).not.toMatch(/public|key/i);
    expect(mensajeErrorConexionTienda(new Error("ALGO_NUEVO"))).toBe("Algo salió mal con Mercado Pago. Inténtalo de nuevo.");
  });
});
