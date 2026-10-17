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

/** Títulos de sección y etiquetas de las opciones, en el orden en que se pintan. */
const leer = (html: string) =>
  [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>|<span class="text-center text-15[^"]*">([^<]+)<\/span>/g)].map((m) => m[1] ? `# ${m[1]}` : m[2]);

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
});
