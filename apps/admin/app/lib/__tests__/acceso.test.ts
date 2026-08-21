import { describe, it, expect } from "vitest";
import { puedeVer, jerarquiaRequerida } from "../acceso";

// Jerarquías reales de la base.
const DUENO = 5, ADMIN = 4, SUPERVISOR = 3, CAJERO = 2;

describe("puedeVer", () => {
  it("el dueño entra a todo", () => {
    for (const r of ["/dashboard", "/configuracion/fiscal", "/reportes/z-historico", "/usuarios"]) {
      expect(puedeVer(DUENO, r)).toBe(true);
    }
  });

  it("EL CASO QUE MOTIVÓ ESTO: un cajero no llega a la configuración fiscal ni al reporte Z", () => {
    expect(puedeVer(CAJERO, "/configuracion/fiscal")).toBe(false);
    expect(puedeVer(CAJERO, "/reportes/z-historico")).toBe(false);
    expect(puedeVer(CAJERO, "/usuarios")).toBe(false);
  });

  it("pero el cajero sí ve el panel", () => {
    expect(puedeVer(CAJERO, "/dashboard")).toBe(true);
  });

  it("el supervisor ve reportes y reservaciones, no el catálogo ni los usuarios", () => {
    expect(puedeVer(SUPERVISOR, "/reportes")).toBe(true);
    expect(puedeVer(SUPERVISOR, "/reservaciones")).toBe(true);
    expect(puedeVer(SUPERVISOR, "/catalogo")).toBe(false);
    expect(puedeVer(SUPERVISOR, "/usuarios")).toBe(false);
  });

  it("las subrutas heredan el mínimo de su sección", () => {
    expect(puedeVer(SUPERVISOR, "/configuracion/cajas")).toBe(false);
    expect(puedeVer(ADMIN, "/configuracion/cajas")).toBe(true);
    expect(puedeVer(SUPERVISOR, "/reportes/ventas-producto")).toBe(true);
  });

  it("una ruta parecida no se cuela por empezar igual", () => {
    // "/catalogos-x" NO debe tomar el mínimo de "/catalogo".
    expect(jerarquiaRequerida("/catalogos-x")).toBeNull();
  });

  it("una ruta desconocida no se bloquea: una página nueva no debe volverse un muro", () => {
    expect(jerarquiaRequerida("/seccion-nueva")).toBeNull();
    expect(puedeVer(CAJERO, "/seccion-nueva")).toBe(true);
  });
});
