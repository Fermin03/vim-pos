import { describe, expect, it } from "vitest";
import { filtrarSecciones, mensajeCambiarModulos, rutasOcultas } from "../operacion";
import { disponiblesDe } from "../reportes";

const con = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });

describe("rutasOcultas", () => {
  it("cargando o con error no esconde nada (esconder de más y luego mostrar salta a la vista)", () => {
    expect(rutasOcultas(null).size).toBe(0);
    expect(rutasOcultas("error").size).toBe(0);
  });
  it("un negocio de siempre (todo encendido o sin llaves) ve todo", () => {
    expect(rutasOcultas(con({})).size).toBe(0);
  });
  it("food truck: sin mesas, envíos, repartidores, reservaciones, marcas ni reporte de meseros", () => {
    const m = con({ comedor: false, meseros: false, domicilio: false, repartidores: false, reservaciones: false, marcas: false });
    expect([...rutasOcultas(m)].sort()).toEqual([
      "/configuracion/envios", "/configuracion/marcas", "/configuracion/mesas",
      "/reportes/ventas-mesero", "/reservaciones", "/usuarios/repartidores",
    ]);
  });
  it("las estaciones no se esconden sin pantalla de cocina: reparten las comandas impresas", () => {
    expect(rutasOcultas(con({ kds: false })).has("/configuracion/areas")).toBe(false);
  });
});

describe("filtrarSecciones", () => {
  it("quita los items ocultos y las secciones que se quedan vacías", () => {
    const s = [{ titulo: "A", items: [{ href: "/x" }, { href: "/y" }] }, { titulo: "B", items: [{ href: "/z" }] }];
    expect(filtrarSecciones(s, new Set(["/y", "/z"]))).toEqual([{ titulo: "A", items: [{ href: "/x" }] }]);
  });
});

describe("disponiblesDe — ventas por mesero", () => {
  const hay = { marcas: false, eventos: false, reservas: false, apps: false, sucursales: false, movimientos: false, meseros: false };
  it("se ve con el módulo encendido (o sin la llave) aunque aún no haya datos", () => {
    expect(disponiblesDe({}, hay).meseros).toBe(true);
  });
  it("apagado y sin historial, no se ve; con historial sí (no se le esconde a nadie su historia)", () => {
    expect(disponiblesDe({ meseros: false }, hay).meseros).toBe(false);
    expect(disponiblesDe({ meseros: false }, { ...hay, meseros: true }).meseros).toBe(true);
  });
});

describe("mensajeCambiarModulos", () => {
  it("dice quién es y qué pide", () => {
    const t = mensajeCambiarModulos({ usuario: "Ana", negocio: "Tacos Ana", codigo: "tacos-ana" });
    expect(t).toMatch(/Tacos Ana/);
    expect(t).toMatch(/Quiero cambiar lo que mi negocio usa en VIM POS\.$/);
  });
});
