import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuGeneral } from "../../components/menu-general";
import { ContenidoMenu } from "../../components/contenido-menu";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const nada = () => {};
const opciones = {
  onKds: nada, onDevoluciones: nada, onCorteX: nada, onEnEspera: nada, onAbrirCajon: nada, nEnEspera: 2,
  onCambiarCajero: nada, onBloquear: nada, onCambiarPin: nada, onMisPropinas: nada, onImpresora: nada, onCerrarTurno: nada,
};

/** Textos de un trozo de HTML, sin etiquetas ni globos numéricos. */
const textos = (html: string) => html.split(/<[^>]+>/).map((t) => t.trim()).filter((t) => t && !/^\d+$/.test(t));
/** Títulos de sección («# …») y la etiqueta de cada opción (`role="menuitem"`), en el orden en que se pintan. */
const leer = (html: string) =>
  [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>|role="menuitem"[^>]*>(.*?)<\/(?:button|a)>/g)]
    .map((m) => (m[1] != null ? `# ${textos(m[1])[0]}` : textos(m[2] ?? "")[0]));

describe("menú general", () => {
  it("el restaurante ve el mismo menú de siempre, con Cerrar turno en Ajustes", () => {
    const html = renderToStaticMarkup(React.createElement(MenuGeneral, { onCerrar: nada, ...opciones }));
    expect(html).toContain('role="dialog"');
    expect(leer(html)).toEqual([
      "# Operación", "Cocina", "Devoluciones", "Corte caja X", "Pedidos en espera", "Abrir cajón",
      "# Cuenta", "Cambiar cajero", "Bloquear pantalla", "Cambiar mi PIN", "Mis propinas",
      "# Ajustes", "Configurar impresoras y pantallas", "Ayuda por WhatsApp", "Cerrar turno",
    ]);
  });

  it("en la página de Configuración, Cerrar turno va aparte, al final", () => {
    const html = renderToStaticMarkup(React.createElement(ContenidoMenu, { enPagina: true, ...opciones }));
    expect(html).not.toContain('role="dialog"');
    expect(leer(html).slice(-5)).toEqual(["# Ajustes", "Configurar impresoras y pantallas", "Ayuda por WhatsApp", "# Turno", "Cerrar turno"]);
  });

  it("la tienda suma Retiro / Depósito y Monitor ventas a Operación, y Salir a Turno; Devoluciones vive en Transacciones", () => {
    // Las mismas opciones que pasa home-pos en la Configuración de la tienda: sin onDevoluciones.
    const { onDevoluciones: _sinDevoluciones, ...tienda } = opciones;
    const html = renderToStaticMarkup(React.createElement(ContenidoMenu, { enPagina: true, ...tienda, onMovimientoCaja: nada, onMonitorVentas: nada, onSalir: nada }));
    const l = leer(html);
    expect(l).not.toContain("Devoluciones");
    expect(l.slice(l.indexOf("Abrir cajón"), l.indexOf("# Cuenta"))).toEqual(["Abrir cajón", "Retiro / Depósito", "Monitor ventas"]);
    expect(l.slice(-3)).toEqual(["# Turno", "Cerrar turno", "Salir"]);
  });
});
