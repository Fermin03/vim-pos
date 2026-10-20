import { describe, expect, it } from "vitest";
import { filtrarSecciones, mensajeCambiarModulos, rutasOcultas } from "../operacion";
import { disponiblesDe } from "../reportes";

const con = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });

describe("rutasOcultas", () => {
  const TIENDA = ["/catalogo/importar-tienda", "/catalogo/etiquetas", "/existencias", "/reportes/ventas-variantes"];
  // Crédito (0208): apagado mientras no se lea encendido; su configuración, solo en tiendas.
  const CREDITO = ["/creditos", "/configuracion/credito", "/cotizaciones", "/configuracion/cotizaciones"];
  // Agenda (0218): de belleza; apagada mientras no se lea encendida.
  const AGENDA = ["/agenda/servicios", "/agenda/colaboradores", "/agenda/espacios", "/configuracion/agenda", "/reportes/comisiones", "/reportes/ventas-colaborador", "/reportes/citas", "/reportes/ocupacion"];
  it("cargando o con error no esconde nada de restaurante (esconder de más y luego mostrar salta a la vista)", () => {
    expect(rutasOcultas(null)).toEqual(new Set([...TIENDA, ...CREDITO, ...AGENDA]));
    expect(rutasOcultas("error")).toEqual(new Set([...TIENDA, ...CREDITO, ...AGENDA]));
  });
  it("Existencias falla cerrado: solo se ve con el módulo leído y encendido", () => {
    expect(rutasOcultas(null).has("/existencias")).toBe(true);
    expect(rutasOcultas("error").has("/existencias")).toBe(true);
    expect(rutasOcultas(con({ existencias: false })).has("/existencias")).toBe(true);
    expect(rutasOcultas(con({ existencias: true })).has("/existencias")).toBe(false);
  });
  it("un negocio de siempre (todo encendido) ve todo; lo de tienda solo con existencias", () => {
    expect(rutasOcultas(con({ existencias: true, credito: true, cotizaciones: true, agenda: true })).size).toBe(0);
    expect([...rutasOcultas(con({ existencias: true }))]).toEqual(["/creditos", "/cotizaciones", ...AGENDA]);
  });
  it("las rutas de tienda se esconden salvo con existencias", () => {
    expect(rutasOcultas(con({}))).toEqual(new Set([...TIENDA, ...CREDITO, ...AGENDA]));
    const tienda = rutasOcultas(con({ existencias: true }));
    for (const r of ["/catalogo/importar-tienda", "/catalogo/etiquetas", "/existencias", "/reportes/ventas-variantes"]) expect(tienda.has(r)).toBe(false);
  });
  it("food truck: sin mesas, envíos, repartidores, reservaciones, marcas ni reporte de meseros", () => {
    const m = con({ existencias: true, credito: true, cotizaciones: true, agenda: true, comedor: false, meseros: false, domicilio: false, repartidores: false, reservaciones: false, marcas: false });
    expect([...rutasOcultas(m)].sort()).toEqual([
      "/configuracion/envios", "/configuracion/marcas", "/configuracion/mesas",
      "/reportes/ventas-mesero", "/reservaciones", "/usuarios/repartidores",
    ]);
  });
  it("la agenda solo se ve con el módulo leído y encendido", () => {
    expect(rutasOcultas(null).has("/agenda/servicios")).toBe(true);
    expect(rutasOcultas("error").has("/agenda/servicios")).toBe(true);
    expect(rutasOcultas(con({ existencias: true })).has("/agenda/servicios")).toBe(true);
    expect(rutasOcultas(con({ agenda: false })).has("/configuracion/agenda")).toBe(true);
    for (const r of AGENDA) expect(rutasOcultas(con({ agenda: true })).has(r)).toBe(false);
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
  it("ventas por talla y color sigue solo al módulo existencias (apagado por omisión)", () => {
    expect(disponiblesDe({}, hay).existencias).toBe(false);
    expect(disponiblesDe({ existencias: true }, hay).existencias).toBe(true);
  });
  it("comisiones y ventas por colaborador siguen solo al módulo agenda", () => {
    expect(disponiblesDe({}, hay).agenda).toBe(false);
    expect(disponiblesDe({ agenda: true }, hay).agenda).toBe(true);
  });
});

describe("mensajeCambiarModulos", () => {
  it("dice quién es y qué pide", () => {
    const t = mensajeCambiarModulos({ usuario: "Ana", negocio: "Tacos Ana", codigo: "tacos-ana" });
    expect(t).toMatch(/Tacos Ana/);
    expect(t).toMatch(/Quiero cambiar lo que mi negocio usa en VIM POS\.$/);
  });
});
