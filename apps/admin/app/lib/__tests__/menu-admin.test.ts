import { describe, it, expect } from "vitest";
import { MENU, filtrarMenu, rutaActiva, caminoDe, buscarEnMenu, type ContextoMenu, type MenuAdmin, type Nodo } from "../menu-admin";

const BASE: ContextoMenu = { jerarquia: 5, ocultas: new Set(), tiendaContratada: true, gruposInformes: null };

const hojas = (nodos: Nodo[]): string[] => nodos.flatMap((n) => (n.tipo === "hoja" ? [n.href] : hojas(n.hijos)));
const hrefs = (m: MenuAdmin) => [...hojas(m.principal), ...hojas(m.canales)];

describe("MENU", () => {
  it("cada ruta del mapa de la spec está en el menú", () => {
    for (const r of [
      "/dashboard", "/catalogo/productos", "/catalogo/importar", "/inventario/compras", "/inventario/proveedores",
      "/inventario/movimientos", "/usuarios/repartidores", "/configuracion/roles", "/configuracion/cajas/descargar",
      "/configuracion/facturacion", "/conciliacion", "/tienda/menu", "/reportes",
    ]) expect(hrefs(MENU)).toContain(r);
  });

  it("ninguna ruta se repite", () => {
    const todas = hrefs(MENU);
    expect(new Set(todas).size).toBe(todas.length);
  });
});

describe("filtrarMenu", () => {
  it("un supervisor ve solo Inicio, Reservaciones, Informes y Conciliación", () => {
    const visto = hrefs(filtrarMenu(MENU, { ...BASE, jerarquia: 3 })).map((h) => h.split("#")[0]);
    expect(new Set(visto)).toEqual(new Set(["/dashboard", "/reservaciones", "/reportes", "/conciliacion"]));
  });

  it("perfil cargando (null) no filtra por rol", () => {
    expect(hrefs(filtrarMenu(MENU, { ...BASE, jerarquia: null }))).toContain("/configuracion/negocio");
  });

  it("rutas ocultas por módulo desaparecen", () => {
    const m = filtrarMenu(MENU, { ...BASE, ocultas: new Set(["/configuracion/mesas", "/reservaciones"]) });
    expect(hrefs(m)).not.toContain("/configuracion/mesas");
    expect(hrefs(m)).not.toContain("/reservaciones");
  });

  it("un grupo sin opciones desaparece entero", () => {
    const m = filtrarMenu(MENU, { ...BASE, ocultas: new Set(["/configuracion/integraciones", "/conciliacion"]) });
    expect(m.canales.some((n) => n.label === "Apps de delivery")).toBe(false);
  });

  it("sin delivery_apps queda Conciliación sola en Apps de delivery", () => {
    const m = filtrarMenu(MENU, { ...BASE, ocultas: new Set(["/configuracion/integraciones"]) });
    expect(hrefs(m)).toContain("/conciliacion");
    expect(hrefs(m)).not.toContain("/configuracion/integraciones");
  });

  it("tienda sin contratar se vuelve un solo enlace", () => {
    const m = filtrarMenu(MENU, { ...BASE, tiendaContratada: false });
    expect(m.canales.find((n) => n.label === "Tienda en línea")).toMatchObject({ tipo: "hoja", href: "/tienda" });
  });

  it("Informes muestra solo los grupos visibles", () => {
    const m = filtrarMenu(MENU, { ...BASE, gruposInformes: new Set(["que-se-vende"]) });
    expect(hrefs(m)).toContain("/reportes#que-se-vende");
    expect(hrefs(m)).toContain("/reportes");
    expect(hrefs(m)).not.toContain("/reportes#varias-sucursales");
  });
});

describe("rutaActiva", () => {
  it("gana el prefijo más largo", () => {
    expect(rutaActiva(MENU, "/configuracion/cajas/descargar")).toBe("/configuracion/cajas/descargar");
    expect(rutaActiva(MENU, "/configuracion/cajas")).toBe("/configuracion/cajas");
    expect(rutaActiva(MENU, "/catalogo/productos/abc")).toBe("/catalogo/productos");
    expect(rutaActiva(MENU, "/inventario/compras/nueva")).toBe("/inventario/compras");
    expect(rutaActiva(MENU, "/reportes/ventas-producto")).toBe("/reportes");
    expect(rutaActiva(MENU, "/configuracion/envios/colonias")).toBe("/configuracion/envios");
  });

  it("una ruta fuera del menú no marca nada", () => {
    expect(rutaActiva(MENU, "/bienvenida")).toBeNull();
  });
});

describe("caminoDe", () => {
  it("da los grupos a desplegar", () => {
    expect(caminoDe(MENU, "/configuracion/cajas")).toEqual(["ajustes", "dispositivos"]);
    expect(caminoDe(MENU, "/dashboard")).toEqual([]);
  });
});

describe("buscarEnMenu", () => {
  it("ignora acentos y mayúsculas y usa claves", () => {
    expect(buscarEnMenu(MENU, "CAJA").map((r) => r.href)).toContain("/configuracion/cajas");
    expect(buscarEnMenu(MENU, "como vende").map((r) => r.label)).toContain("Cómo vende tu negocio");
    expect(buscarEnMenu(MENU, "sello")[0]).toMatchObject({ href: "/configuracion/facturacion", ruta: ["Facturación"] });
  });

  it("texto vacío no da resultados", () => {
    expect(buscarEnMenu(MENU, "  ")).toEqual([]);
  });
});
