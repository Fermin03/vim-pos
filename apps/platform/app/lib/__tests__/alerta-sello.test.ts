import { describe, expect, it } from "vitest";
import { alertaDeSello } from "../alerta-sello";

const hoy = "2026-09-30";

describe("alertaDeSello — la bandeja de VIM avisa del sello antes de que venza", () => {
  it("con más de 30 días no hay alerta", () => {
    expect(alertaDeSello("2026-10-31", hoy)).toBeNull();
    expect(alertaDeSello("2027-05-18", hoy)).toBeNull();
  });

  it("a 30 días exactos sale como «Sello por vencer», media", () => {
    expect(alertaDeSello("2026-10-30", hoy)).toMatchObject({ severidad: "media", tipo: "Sello por vencer", orden: 30 });
  });

  it("a 8 días sigue en media; a 7 sube a alta", () => {
    expect(alertaDeSello("2026-10-08", hoy)?.severidad).toBe("media");
    expect(alertaDeSello("2026-10-07", hoy)).toMatchObject({ severidad: "alta", tipo: "Sello por vencer" });
  });

  it("el último día de vigencia dice «vence hoy» y todavía no «vencido»", () => {
    const a = alertaDeSello("2026-09-30", hoy);
    expect(a?.tipo).toBe("Sello por vencer");
    expect(a?.titulo).toMatch(/vence hoy/);
  });

  it("al día siguiente ya es «Sello vencido»", () => {
    const a = alertaDeSello("2026-09-29", hoy);
    expect(a).toMatchObject({ severidad: "alta", tipo: "Sello vencido" });
    expect(a?.titulo).toMatch(/hace 1 día$/);
  });

  it("sin fecha de vigencia no inventa una alerta", () => {
    expect(alertaDeSello(null, hoy)).toBeNull();
    expect(alertaDeSello("", hoy)).toBeNull();
  });
});
