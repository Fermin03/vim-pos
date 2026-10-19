import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarTicket, quitaUna } from "../../components/sidebar-ticket";
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

describe("SidebarTicket: Cobrar de una cuenta con pagos", () => {
  const linea = { clientId: "l1", producto: { id: "p1", nombre: "Polo", precio_base_mxn: 116 }, cantidad: 1, modificadores: [], notaCocina: null };
  const estado = { ...base.estado, lineas: [linea] } as unknown as typeof base.estado;
  const comun = { estado, totalConDescuento: 116 };

  it("sin nada pendiente dice «Cerrar venta», sin monto", () => {
    const html = pintar({ ...comun, pendienteMxn: 0 });
    expect(html).toContain("Cerrar venta");
    expect(html).not.toMatch(/Cobrar[^<]*<span[^>]*>\$116/);
  });
  it("con saldo parcial cobra lo pendiente, no el total", () => {
    const html = pintar({ ...comun, pendienteMxn: 16 });
    expect(html).toMatch(/Cobrar[^<]*<span[^>]*>\$16\.00/);
    expect(html).not.toContain("Cerrar venta");
  });
  it("sin pendiente (restaurante) cobra el total", () => {
    expect(pintar(comun)).toMatch(/Cobrar[^<]*<span[^>]*>\$116\.00/);
  });
});

describe("Quitar en la tienda", () => {
  const linea = (cantidad: number, tipoVenta?: "PESO") => ({ clientId: "l1", producto: { id: "p1", nombre: "Jitomate", precio_base_mxn: 28, tipoVenta }, cantidad, modificadores: [], notaCocina: null }) as unknown as Parameters<typeof quitaUna>[0];
  it("dos piezas: Quitar saca una", () => expect(quitaUna(linea(2), true)).toBe(true));
  it("a granel quita el renglón completo", () => expect(quitaUna(linea(2.5, "PESO"), true)).toBe(false));
  it("el restaurante quita el renglón", () => expect(quitaUna(linea(2), false)).toBe(false));
});

describe("«N productos» del encabezado", () => {
  it("cada pesada cuenta 1 y las piezas suman: 1.25 kg de jitomate + 2 playeras = 3 productos", () => {
    const lineas = [
      { clientId: "l1", producto: { id: "j", nombre: "Jitomate", precio_base_mxn: 28, tipoVenta: "PESO" }, cantidad: 1.25, modificadores: [], notaCocina: null },
      { clientId: "l2", producto: { id: "p", nombre: "Playera", precio_base_mxn: 150, tipoVenta: "UNIDAD" }, cantidad: 2, modificadores: [], notaCocina: null },
    ];
    const html = pintar({ estado: { ...base.estado, lineas } as unknown as typeof base.estado });
    expect(html).toContain("3 productos");
    expect(html).toContain("1.250 kg");
  });
});

describe("SidebarTicket: colaborador de belleza en el renglón", () => {
  const linea = (id: string, colaboradorId?: string) => ({ clientId: id, producto: { id, nombre: id, precio_base_mxn: 180 }, cantidad: 1, modificadores: [], notaCocina: null, ...(colaboradorId ? { colaboradorId } : {}) });
  const estado = { ...base.estado, lineas: [linea("Corte", "diego"), linea("Tinte")] } as unknown as typeof base.estado;
  const colaborador = (l: { colaboradorId?: string }) => (l.colaboradorId ? { texto: "Diego R.", falta: false } : { texto: "Elige quién lo hizo", falta: true });

  it("debajo del nombre va quién lo hizo, y se cambia tocándolo", () => {
    const html = pintar({ estado, tienda: { ...tienda, simple: true, colaborador, onColaborador: nada } });
    expect(html).toContain(">Diego R.<");
    expect(html).toContain(">Elige quién lo hizo<");
    expect(html).toContain("cambiar quién hizo Corte");
  });

  it("con la venta guardada solo se lee; la tienda no lo enseña", () => {
    expect(pintar({ estado, tienda: { ...tienda, simple: true, colaborador } })).not.toContain("cambiar quién hizo");
    expect(pintar({ estado, tienda: { ...tienda, simple: true } })).not.toContain("Diego R.");
  });
});
