import { describe, expect, it } from "vitest";
import { GIROS, OPERACION, moduloActivo, nombreGiro } from "@vim/db/operacion";
import { conExistencias } from "../operacion";

describe("moduloActivo", () => {
  it("lo que dice la base manda", () => {
    expect(moduloActivo({ comedor: false }, "comedor")).toBe(false);
    expect(moduloActivo({ eventos: true }, "eventos")).toBe(true);
  });
  it("una llave ausente (caja vieja, todavía cargando) se ve como siempre: encendida", () => {
    for (const m of [undefined, null, {}]) {
      expect(moduloActivo(m, "comedor")).toBe(true);
      expect(moduloActivo(m, "kds")).toBe(true);
    }
  });
  it("salvo eventos: ausente es apagado, como antes de los giros (solo food truck lo veía)", () => {
    expect(moduloActivo({}, "eventos")).toBe(false);
    expect(moduloActivo(null, "eventos")).toBe(false);
    expect(moduloActivo({}, "cuentas_barra")).toBe(false);
    expect(moduloActivo(null, "cuentas_barra")).toBe(false);
    expect(moduloActivo({ cuentas_barra: true }, "cuentas_barra")).toBe(true);
    expect(moduloActivo({}, "existencias")).toBe(false);
    expect(moduloActivo(null, "existencias")).toBe(false);
    expect(moduloActivo({ existencias: true }, "existencias")).toBe(true);
  });
});

describe("catálogo", () => {
  it("los siete giros que se ofrecen, y los retirados con nombre para leer datos viejos", () => {
    expect(GIROS.filter((g) => g.ofrecido).map((g) => g.codigo)).toEqual(
      ["QUICK_SERVICE", "FULL_SERVICE", "TAQUERIA", "CAFETERIA", "BAR", "DARK_KITCHEN", "FOODTRUCK"]);
    expect(nombreGiro("RETAIL")).toBe("Tienda de ropa o calzado");
    expect(nombreGiro("CAFE_BAR")).toBe("Cafetería o bar");
    expect(nombreGiro("TAQUERIA")).toBe("Taquería o cocina económica");
    expect(nombreGiro("NUEVO_RARO")).toBe("NUEVO_RARO");
    expect(nombreGiro(null)).toBe("—");
  });
  it("once módulos visibles", () => {
    expect(OPERACION.map((m) => m.codigo)).toEqual(
      ["mostrador", "comedor", "meseros", "domicilio", "repartidores", "kds", "reservaciones", "marcas", "eventos", "cuentas_barra", "existencias"]);
    expect(OPERACION.find((m) => m.codigo === "meseros")?.requiere).toBe("comedor");
    expect(OPERACION.find((m) => m.codigo === "repartidores")?.requiere).toBe("domicilio");
  });
});

describe("conExistencias", () => {
  it("solo con el módulo efectivo; mientras carga o si falló, no", () => {
    expect(conExistencias(null)).toBe(false);
    expect(conExistencias("error")).toBe(false);
    expect(conExistencias({ permitidos: {}, efectivos: {} })).toBe(false);
    expect(conExistencias({ permitidos: {}, efectivos: { existencias: true } })).toBe(true);
  });
});
