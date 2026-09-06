import { describe, it, expect } from "vitest";
import { avisosDe, evaluarAcceso, type Directivas } from "../directivas";

const AHORA = new Date("2026-09-05T18:00:00Z");
const con = (acceso: Partial<Directivas["acceso"]>): Directivas => ({
  servidor_hora: null,
  acceso: { estado: null, bloqueado: false, bloquea_desde: null, mensaje: null, ...acceso },
  modulos: {},
  limites: {},
  avisos: [],
  version: {},
});

describe("evaluarAcceso", () => {
  it("sin directivas deja operar: la falta de datos nunca bloquea una caja", () => {
    expect(evaluarAcceso(null, AHORA).nivel).toBe("ok");
  });

  it("un tenant activo opera normal", () => {
    expect(evaluarAcceso(con({ estado: "ACTIVO" }), AHORA).nivel).toBe("ok");
  });

  it("suspendido con fecha futura está en gracia y lleva el mensaje", () => {
    const r = evaluarAcceso(
      con({ estado: "SUSPENDIDO", bloquea_desde: "2026-09-08T12:00:00Z", mensaje: "Paga antes del 8" }),
      AHORA,
    );
    expect(r.nivel).toBe("gracia");
    expect(r.mensaje).toBe("Paga antes del 8");
  });

  it("bloqueado cuando el servidor lo dice", () => {
    expect(evaluarAcceso(con({ estado: "SUSPENDIDO", bloqueado: true }), AHORA).nivel).toBe("bloqueado");
  });

  it("NO bloquea por su cuenta si la fecha pasó pero el servidor dice que no", () => {
    // Directiva vieja de una caja sin internet: sigue vendiendo. Es la invariante de la spec §3.
    const r = evaluarAcceso(
      con({ estado: "SUSPENDIDO", bloqueado: false, bloquea_desde: "2026-09-01T12:00:00Z" }),
      AHORA,
    );
    expect(r.nivel).toBe("gracia");
  });

  it("un tenant en prueba o interno nunca entra en gracia", () => {
    expect(evaluarAcceso(con({ estado: "TRIAL", bloquea_desde: "2026-09-08T12:00:00Z" }), AHORA).nivel).toBe("ok");
    expect(evaluarAcceso(con({ estado: "INTERNO" }), AHORA).nivel).toBe("ok");
  });

  it("da un mensaje por defecto si el operador no escribió ninguno", () => {
    const r = evaluarAcceso(con({ estado: "SUSPENDIDO", bloqueado: true }), AHORA);
    expect(r.mensaje.length).toBeGreaterThan(10);
  });

  it("un cancelado también bloquea cuando el servidor lo dice", () => {
    expect(evaluarAcceso(con({ estado: "CANCELADO", bloqueado: true }), AHORA).nivel).toBe("bloqueado");
  });
});

describe("avisosDe", () => {
  const conAvisos = (avisos: unknown[]): Directivas => ({
    servidor_hora: null,
    acceso: { estado: "ACTIVO", bloqueado: false, bloquea_desde: null, mensaje: null },
    modulos: {}, limites: {}, avisos, version: {},
  });

  it("sin directivas no hay avisos", () => {
    expect(avisosDe(null)).toEqual([]);
  });

  it("descarta lo que no tiene forma de aviso: un JSON raro no puede tumbar la caja", () => {
    expect(avisosDe(conAvisos([{ titulo: "sin id" }, "texto", null, 7]))).toEqual([]);
  });

  it("acepta un aviso completo y normaliza un nivel desconocido a info", () => {
    const r = avisosDe(conAvisos([
      { id: "a1", nivel: "raro", titulo: "T", cuerpo: "C", requiere_confirmacion: true, vigente_hasta: null },
    ]));
    expect(r).toHaveLength(1);
    expect(r[0]!.nivel).toBe("info");
    expect(r[0]!.requiere_confirmacion).toBe(true);
  });

  it("conserva el orden en que vienen: la nube ya los ordenó por urgencia", () => {
    const r = avisosDe(conAvisos([
      { id: "a1", nivel: "danger", titulo: "Urgente", cuerpo: "C" },
      { id: "a2", nivel: "info", titulo: "Normal", cuerpo: "C" },
    ]));
    expect(r.map((x) => x.id)).toEqual(["a1", "a2"]);
  });
});
