import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeccionPedidos } from "../../components/seccion-pedidos";
import { BarraTienda } from "../../components/barra-tienda";
import { copiaDeLista } from "../../components/pantalla-cuentas-modo";
import { destinosDe, globoPedidos, seccionTrasLista } from "../tienda";
import type { DatosCaja } from "../turno";

(globalThis as { React?: unknown }).React = React;

const nada = () => {};
const base = {
  domicilio: false, enLinea: false, barra: false, expiradosEnLinea: 0,
  nEnEspera: 0, nParaLlevar: 0, nPickup: 0, nDomicilio: 0, nEnLinea: 0, nMesa: 0, nBarra: 0,
  onEnEspera: nada, onParaLlevar: nada, onPickup: nada, onDomicilio: nada, onEnLinea: nada, onMesa: nada, onBarra: nada,
  onNuevoRecoger: nada, onNuevoDomicilio: nada,
};
const pintar = (p: Partial<typeof base> = {}) => renderToStaticMarkup(React.createElement(SeccionPedidos, { ...base, ...p }));
/** Etiqueta y conteo de cada tarjeta, en orden. */
const tarjetas = (html: string) =>
  [...html.matchAll(/data-tarjeta="([^"]+)"[^>]*>.*?<span data-conteo="">(\d+)<\/span>/g)].map((m) => `${m[1]} ${m[2]}`);
const botones = (html: string) => [...html.matchAll(/data-nuevo="([^"]+)"/g)].map((m) => m[1]);

describe("sección Pedidos de comida rápida", () => {
  it("sin módulos: En espera, Para llevar abiertas y Pick-up, con su conteo", () => {
    expect(tarjetas(pintar({ nEnEspera: 2, nParaLlevar: 1, nPickup: 3 }))).toEqual(["En espera 2", "Para llevar abiertas 1", "Pick-up 3"]);
  });

  it("Domicilio con el módulo, o mientras quede alguna cuenta suya abierta", () => {
    expect(tarjetas(pintar({ domicilio: true }))).toContain("Domicilio 0");
    expect(tarjetas(pintar({ nDomicilio: 1 }))).toContain("Domicilio 1");
    expect(tarjetas(pintar()).some((t) => t.startsWith("Domicilio"))).toBe(false);
  });

  it("En línea solo con tienda o apps", () => {
    expect(tarjetas(pintar({ enLinea: true, nEnLinea: 4 }))).toContain("En línea 4");
    expect(tarjetas(pintar({ nEnLinea: 4 })).some((t) => t.startsWith("En línea"))).toBe(false);
  });

  it("«Cuentas de mesa» solo si hay alguna abierta", () => {
    expect(tarjetas(pintar()).some((t) => t.startsWith("Cuentas de mesa"))).toBe(false);
    expect(tarjetas(pintar({ nMesa: 2 }))).toContain("Cuentas de mesa 2");
  });

  it("Barra con el módulo cuentas_barra, o mientras quede alguna cuenta de barra abierta", () => {
    expect(tarjetas(pintar()).some((t) => t.startsWith("Barra"))).toBe(false);
    expect(tarjetas(pintar({ barra: true }))).toContain("Barra 0");
    expect(tarjetas(pintar({ nBarra: 2 }))).toContain("Barra 2");
  });

  it("«Nuevo a domicilio» solo con el módulo; «Nuevo para recoger» siempre", () => {
    expect(botones(pintar())).toEqual(["Nuevo para recoger"]);
    expect(botones(pintar({ nDomicilio: 1 }))).toEqual(["Nuevo para recoger"]);
    expect(botones(pintar({ domicilio: true }))).toEqual(["Nuevo para recoger", "Nuevo a domicilio"]);
  });

  it("el aviso de vencidos en línea, el mismo texto que daba el inicio", () => {
    expect(pintar({ enLinea: true, expiradosEnLinea: 1 })).toContain("Se venció 1 pedido en línea sin aceptar.");
    expect(pintar({ enLinea: true, expiradosEnLinea: 3 })).toContain("Se vencieron 3 pedidos en línea sin aceptar.");
    expect(pintar({ enLinea: true })).not.toContain("Se venc");
    expect(pintar({ expiradosEnLinea: 3 })).not.toContain("Se venc");
  });
});

describe("globo de Pedidos", () => {
  it("suma apps por aceptar, tienda por aceptar (pick-up y domicilio) y en espera", () => {
    expect(globoPedidos(1, { pickup: 2, domicilio: 3, apps: 99 }, 4)).toBe(10);
    expect(globoPedidos(0, { pickup: 0, domicilio: 0, apps: 0 }, 0)).toBe(0);
  });

  it("la barra lo pinta sobre Pedidos", () => {
    const html = renderToStaticMarkup(React.createElement(BarraTienda, {
      destinos: destinosDe({ giro: "QUICK_SERVICE" } as DatosCaja, false, false), seccion: "panel", onCambiar: nada, pendientes: 0, pendientesPedidos: 7, bloqueada: false,
    }));
    expect(html).toMatch(/>7<\/span>.*Pedidos/);
  });

  it("en la cafetería, sin Pedidos, lo pinta sobre Más", () => {
    const html = renderToStaticMarkup(React.createElement(BarraTienda, {
      destinos: destinosDe({ giro: "CAFETERIA" } as DatosCaja, false, false), seccion: "panel", onCambiar: nada, pendientes: 0, pendientesPedidos: 7, bloqueada: false,
    }));
    expect(html).toMatch(/>7<\/span>.*Más/);
    expect(html).not.toContain("Pedidos");
  });
});

describe("lista de cuentas de mesa", () => {
  it("en comida rápida se titula «Cuentas de mesa» y su vacío no manda abrir una mesa", () => {
    const c = copiaDeLista("COMER_AQUI", true);
    expect(c.titulo).toBe("Cuentas de mesa");
    expect(c.vacioTexto).not.toMatch(/mesa/i);
    expect(copiaDeLista("COMER_AQUI", false).titulo).toBe("Comedor");
    expect(copiaDeLista("DRIVE_THRU", true).titulo).toBe("Pick-up");
  });
});

describe("salir de una lista", () => {
  it("comida rápida regresa a Pedidos; los demás se quedan donde estaban", () => {
    expect(seccionTrasLista({ giro: "QUICK_SERVICE" } as DatosCaja, "panel")).toBe("pedidos");
    expect(seccionTrasLista({ giro: "FOODTRUCK" } as DatosCaja, "configuracion")).toBe("pedidos");
    expect(seccionTrasLista({ giro: "CAFETERIA" } as DatosCaja, "panel")).toBe("configuracion");
    expect(seccionTrasLista({ giro: "RETAIL" } as DatosCaja, "configuracion")).toBe("configuracion");
  });
});
