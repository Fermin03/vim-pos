import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarTicket } from "../../components/sidebar-ticket";
import { estadoInicial } from "../carrito";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const nada = () => {};
const base = { estado: { ...estadoInicial, modoServicio: "PARA_LLEVAR" as const }, onCantidad: nada, onQuitar: nada, onLimpiar: nada, onCobrar: nada, procesando: false };
const tienda = { renglon: () => ({ nombre: "", detalle: undefined }), sinExistencia: () => false, ultimoProductoId: null, onCambioTalla: nada };
const pintar = (p: Partial<React.ComponentProps<typeof SidebarTicket>>) => renderToStaticMarkup(React.createElement(SidebarTicket, { ...base, ...p }));

describe("SidebarTicket", () => {
  it("el restaurante conserva Precios, Descuento y En espera", () => {
    const html = pintar({});
    for (const t of [">Precios<", ">Descuento<", ">En espera<", ">Limpiar<", "Efectivo exacto"]) expect(html).toContain(t);
    expect(html).not.toContain("Asignar cliente");
  });

  it("el Panel de la tienda se queda con el cliente, Limpiar y Cambio de talla", () => {
    const html = pintar({ tienda: { ...tienda, simple: true, onAsignarCliente: nada, cliente: null } });
    for (const t of [">Precios<", ">Descuento<", ">En espera<", "Efectivo exacto"]) expect(html).not.toContain(t);
    for (const t of [">Asignar cliente<", ">Limpiar<", "Cambio de talla"]) expect(html).toContain(t);
    expect(html).not.toContain("Dejar abierta");
  });

  it("con una cuenta guardada, el Panel ofrece dejarla abierta", () => {
    const html = pintar({ tienda: { ...tienda, simple: true, onDejarAbierta: nada } });
    expect(html).toContain(">Dejar abierta<");
  });
});
