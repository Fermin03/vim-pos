import { describe, it, expect } from "vitest";
import { evaluarSync } from "../estado-sync";

const AHORA = new Date("2026-08-17T20:00:00Z");
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3600_000).toISOString();

describe("evaluarSync", () => {
  it("en el POS web no dice nada: no hay escritorio que avisar", () => {
    expect(evaluarSync({ disponible: false }, AHORA).nivel).toBe("desconocido");
  });

  it("recién sincronizado sale en verde", () => {
    const r = evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: haceHoras(0.2) }, AHORA);
    expect(r.nivel).toBe("ok");
    expect(r.texto).toMatch(/hace 12 min/);
  });

  it("no alarma por unas horas: en un local es normal", () => {
    expect(evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: haceHoras(2) }, AHORA).nivel).toBe("ok");
    expect(evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: haceHoras(5) }, AHORA).nivel).toBe("atrasada");
  });

  it("pasado un día es 'muda': ya hay un turno entero sin respaldo", () => {
    const r = evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: haceHoras(30) }, AHORA);
    expect(r.nivel).toBe("muda");
    expect(r.texto).toBe("Sin sincronizar hace 1 día");
  });

  it("cuenta los días en plural", () => {
    expect(evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: haceHoras(24 * 4) }, AHORA).texto)
      .toBe("Sin sincronizar hace 4 días");
  });

  it("una caja sin vincular se señala distinto: no es una falla de red", () => {
    expect(evaluarSync({ disponible: true, vinculada: false }, AHORA).nivel).toBe("sin-vincular");
  });

  it("vinculada pero sin haber subido nunca también es muda", () => {
    const r = evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: null }, AHORA);
    expect(r.nivel).toBe("muda");
    expect(r.texto).toBe("Nunca ha sincronizado");
  });

  it("una fecha corrupta no rompe la barra", () => {
    expect(evaluarSync({ disponible: true, vinculada: true, ultimaSincronizacion: "no-es-fecha" }, AHORA).nivel).toBe("desconocido");
  });
});
