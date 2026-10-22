import { describe, it, expect } from "vitest";
import { idsGruposVisibles, reporteVisible, GRUPOS } from "../reportes-grupos";
import type { ReportesDisponibles } from "../reportes";

const TODO_DISPONIBLE: ReportesDisponibles = { marcas: true, eventos: true, reservaciones: true, apps: true, variasSucursales: true, inventario: true, meseros: true, existencias: true, agenda: true };

describe("idsGruposVisibles", () => {
  it("un supervisor no ve Inventario y costos (costo de ventas y movimientos piden 4)", () => {
    expect(idsGruposVisibles(TODO_DISPONIBLE, 3).has("inventario-costos")).toBe(false);
    expect(idsGruposVisibles(TODO_DISPONIBLE, 4).has("inventario-costos")).toBe(true);
  });

  it("con una sola sucursal no aparece Varias sucursales", () => {
    expect(idsGruposVisibles({ ...TODO_DISPONIBLE, variasSucursales: false }, 5).has("varias-sucursales")).toBe(false);
  });

  it("sin datos de disponibilidad se muestran todos", () => {
    expect(idsGruposVisibles(null, 5).size).toBe(5);
  });
});

describe("reporteVisible", () => {
  const consolidado = GRUPOS.flatMap((g) => g.reportes).find((r) => r.href === "/reportes/consolidado")!;
  it("verTodos enseña lo de módulos apagados, pero nunca lo que el rol no abre", () => {
    const sinSucursales = { ...TODO_DISPONIBLE, variasSucursales: false };
    expect(reporteVisible(consolidado, sinSucursales, 5)).toBe(false);
    expect(reporteVisible(consolidado, sinSucursales, 5, true)).toBe(true);
    const costo = GRUPOS.flatMap((g) => g.reportes).find((r) => r.href === "/reportes/costo-ventas")!;
    expect(reporteVisible(costo, TODO_DISPONIBLE, 3, true)).toBe(false);
  });
});

describe("reporteVisible — tienda y belleza", () => {
  const variantes = GRUPOS.flatMap((g) => g.reportes).find((r) => r.href === "/reportes/ventas-variantes")!;
  const comisiones = GRUPOS.flatMap((g) => g.reportes).find((r) => r.href === "/reportes/comisiones")!;
  it("solo con el módulo confirmado: ni cargando ni con «Verlos»", () => {
    expect(reporteVisible(variantes, null, 5)).toBe(false);
    expect(reporteVisible(variantes, { ...TODO_DISPONIBLE, existencias: false }, 5, true)).toBe(false);
    expect(reporteVisible(variantes, TODO_DISPONIBLE, 5)).toBe(true);
    expect(reporteVisible(comisiones, { ...TODO_DISPONIBLE, agenda: false }, 5, true)).toBe(false);
    expect(reporteVisible(comisiones, TODO_DISPONIBLE, 5)).toBe(true);
  });
});
