import { describe, expect, it } from "vitest";
import { GIROS, GIROS_BELLEZA, GIROS_TIENDA, OPERACION, esGiroBelleza, esGiroTienda, moduloActivo, nombreGiro } from "@vim/db/operacion";
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
  it("los doce giros que se ofrecen, y los retirados con nombre para leer datos viejos", () => {
    expect(GIROS.filter((g) => g.ofrecido).map((g) => g.codigo)).toEqual(
      ["QUICK_SERVICE", "FULL_SERVICE", "TAQUERIA", "CAFETERIA", "BAR", "DARK_KITCHEN", "FOODTRUCK", "RETAIL", "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS"]);
    expect(nombreGiro("RETAIL")).toBe("Tienda de ropa o calzado");
    expect(nombreGiro("ABARROTES")).toBe("Tienda de abarrotes o supermercado");
    expect(nombreGiro("FRUTERIA")).toBe("Frutería y verdulería");
    expect(nombreGiro("FERRETERIA")).toBe("Ferretería");
    expect(nombreGiro("VINOS")).toBe("Vinos y licores");
    expect(GIROS_TIENDA).toEqual(["RETAIL", "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS"]);
    expect(esGiroTienda("VINOS")).toBe(true);
    expect(esGiroTienda("BAR")).toBe(false);
    expect(esGiroTienda(null)).toBe(false);
    expect(nombreGiro("CAFE_BAR")).toBe("Cafetería o bar");
    expect(nombreGiro("TAQUERIA")).toBe("Taquería o cocina económica");
    expect(nombreGiro("NUEVO_RARO")).toBe("NUEVO_RARO");
    expect(nombreGiro(null)).toBe("—");
  });
  it("doce módulos visibles", () => {
    expect(OPERACION.map((m) => m.codigo)).toEqual(
      ["mostrador", "comedor", "meseros", "domicilio", "repartidores", "kds", "reservaciones", "marcas", "eventos", "cuentas_barra", "existencias", "agenda"]);
    expect(OPERACION.find((m) => m.codigo === "meseros")?.requiere).toBe("comedor");
    expect(OPERACION.find((m) => m.codigo === "repartidores")?.requiere).toBe("domicilio");
  });
});

describe("belleza", () => {
  it("los cinco giros existen, con nombre, y no se ofrecen todavía", () => {
    expect(GIROS_BELLEZA).toEqual(["SALON", "SPA", "PELUQUERIA", "BARBERIA", "TATUAJES"]);
    for (const g of GIROS_BELLEZA) {
      expect(GIROS.find((x) => x.codigo === g)?.ofrecido).toBe(false);
      expect(esGiroBelleza(g)).toBe(true);
    }
    expect(nombreGiro("TATUAJES")).toBe("Tatuajes y piercings");
    expect(esGiroBelleza("RETAIL")).toBe(false);
    expect(esGiroBelleza("QUICK_SERVICE")).toBe(false);
    expect(esGiroBelleza(null)).toBe(false);
  });
  it("agenda ausente es apagada", () => {
    expect(moduloActivo({}, "agenda")).toBe(false);
    expect(moduloActivo({ agenda: true }, "agenda")).toBe(true);
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
