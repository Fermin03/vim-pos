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

  it("el Panel de la tienda deja arriba solo el menú ⋯ y el cliente asignado", () => {
    const html = pintar({ tienda: { ...tienda, simple: true, onAsignarCliente: nada, cliente: "Ana López" } });
    for (const t of [">Precios<", ">Descuento<", ">En espera<", "Efectivo exacto", ">Asignar cliente<", ">Limpiar<", "Dejar abierta"]) expect(html).not.toContain(t);
    for (const t of ["Más opciones", ">Ana López<", "Cambio de talla"]) expect(html).toContain(t);
  });

  it("el Panel va mitad y mitad, sin cantidad, notas ni etiqueta del modo", () => {
    const linea = { clientId: "l1", producto: { id: "p1", nombre: "Polo", precio: 100 }, cantidad: 1, modificadores: [], notaCocina: null };
    const estado = { ...base.estado, lineas: [linea] } as unknown as typeof base.estado;
    const comun = { estado, onNotaOrden: nada, onNotaLinea: nada, modoTexto: "Venta" };
    const restaurante = pintar(comun);
    for (const t of ['aria-label="Más"', ">Nota<", "Nota de la orden", ">Venta<"]) expect(restaurante).toContain(t);
    const panel = pintar({ ...comun, tienda: { ...tienda, simple: true } });
    for (const t of ['aria-label="Más"', 'aria-label="Menos"', ">Nota<", "Nota de la orden", ">Venta<"]) expect(panel).not.toContain(t);
    expect(panel).toContain(">Quitar<");
    expect(panel).toContain("w-1/2");
    expect(panel).toContain('aria-label="Más opciones"');
    expect(restaurante).not.toContain('aria-label="Más opciones"');
  });

  it("con la cuenta guardada, el renglón de la tienda no lleva el botón de descuento", () => {
    const linea = { clientId: "l1", producto: { id: "p1", nombre: "Polo", precio: 100 }, cantidad: 1, modificadores: [], notaCocina: null };
    const estado = { ...base.estado, lineas: [linea] } as unknown as typeof base.estado;
    const comun = { estado, bloqueado: true, onDescuentoItem: nada };
    expect(pintar(comun)).toContain("Descuento o precio del producto");
    expect(pintar({ ...comun, tienda: { ...tienda, simple: true } })).not.toContain("Descuento o precio del producto");
  });
});
