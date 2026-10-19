import { describe, it, expect } from "vitest";
import {
  avisosConversion,
  enlaceWhatsappCotizacion,
  estadoCotizar,
  esRechazoFinal,
  estaVencida,
  filtrarCotizaciones,
  lineasDeCotizacion,
  marcarPendientes,
  anotarPorMarcar,
  porMarcar,
  puedeCotizar,
  textoWhatsappCotizacion,
  urlCotizacion,
  type Cotizacion,
  type ItemCotizacion,
} from "../cotizaciones";
import type { Producto } from "../catalogo";
import type { Almacen } from "../lealtad-canje";

const prod = (id: string, precio: number, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: precio, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, ...extra,
});
const item = (productoId: string | null, cantidad: number, precio: number, nombre = productoId ?? "?"): ItemCotizacion => ({
  productoId, nombre, sku: null, cantidad, precioUnitario: precio, unidadSat: null, total: cantidad * precio,
});
const memoria = (): Almacen => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };

describe("«Guardar como cotización» en el menú ⋯", () => {
  const suelta = { producto: prod("p", 10), modificadores: [] };
  it("solo con el módulo, con renglones y sin cuenta guardada", () => {
    expect(puedeCotizar({ modulo: true, lineas: [suelta], guardada: false })).toBe(true);
    expect(puedeCotizar({ modulo: false, lineas: [suelta], guardada: false })).toBe(false);
    expect(puedeCotizar({ modulo: true, lineas: [], guardada: false })).toBe(false);
    expect(puedeCotizar({ modulo: true, lineas: [suelta], guardada: true })).toBe(false);
    expect(estadoCotizar({ modulo: false, lineas: [suelta], guardada: false })).toEqual({ ofrecer: false, motivo: null });
  });

  it("con extras o un combo se ve apagada, con el motivo", () => {
    const conExtra = { ...suelta, modificadores: [{ opcionId: "o", grupoNombre: "G", opcionNombre: "Grande", precioExtra: 5, cantidad: 1 }] };
    const combo = { producto: prod("k", 99, { esCombo: true }), modificadores: [] };
    for (const l of [conExtra, combo]) {
      expect(puedeCotizar({ modulo: true, lineas: [suelta, l], guardada: false })).toBe(false);
      expect(estadoCotizar({ modulo: true, lineas: [suelta, l], guardada: false })).toEqual({ ofrecer: true, motivo: "Sin extras ni combos" });
    }
  });
});

describe("enlace público y WhatsApp", () => {
  it("la URL sale del portal de factura, con el token", () => {
    expect(urlCotizacion("abc123")).toBe("https://factura.vimpos.com.mx/c/abc123");
  });

  it("el texto lleva folio, negocio, total, vigencia y la URL", () => {
    expect(textoWhatsappCotizacion({ folio: "COT-A-000012", negocio: "Tenis Union", total: 1250.5, vigenteHasta: "2026-11-02", url: "https://factura.vimpos.com.mx/c/x" }))
      .toBe("Cotización COT-A-000012 de Tenis Union: $1,250.50, válida hasta 02/11/2026. Ver: https://factura.vimpos.com.mx/c/x");
  });

  it("al teléfono del cliente (10 dígitos van con 52) o sin número para elegir el contacto", () => {
    expect(enlaceWhatsappCotizacion("477 123 4567", "hola")).toBe("https://wa.me/524771234567?text=hola");
    expect(enlaceWhatsappCotizacion("524771234567", "hola")).toBe("https://wa.me/524771234567?text=hola");
    expect(enlaceWhatsappCotizacion(null, "a b")).toBe("https://wa.me/?text=a%20b");
    expect(enlaceWhatsappCotizacion("123", "a")).toBe("https://wa.me/?text=a");
  });
});

describe("convertir en venta", () => {
  it("arma los renglones con el catálogo de hoy, a granel incluido", () => {
    const productos = [prod("playera", 150), prod("jitomate", 28, { tipoVenta: "PESO" })];
    const r = lineasDeCotizacion([item("playera", 2, 150), item("jitomate", 1.25, 28)], productos);
    expect(r.lineas.map((l) => [l.producto.id, l.cantidad, l.producto.tipoVenta])).toEqual([["playera", 2, undefined], ["jitomate", 1.25, "PESO"]]);
    expect(r.lineas.every((l) => l.modificadores.length === 0 && l.clientId)).toBe(true);
    expect(r.cambiaronPrecio).toBe(0);
    expect(r.omitidos).toEqual([]);
  });

  it("cuenta los precios que cambiaron y omite lo que ya no existe, se agotó o no se vende aquí", () => {
    const productos = [prod("a", 110), prod("b", 50), prod("c", 10, { agotado: true }), prod("d", 10, { seVendeAqui: false })];
    const r = lineasDeCotizacion([item("a", 1, 100), item("b", 1, 50), item("c", 1, 10, "Gorra"), item("d", 1, 10, "Cinto"), item("x", 1, 5, "Calceta"), item(null, 1, 5, "Borrado")], productos);
    expect(r.lineas.map((l) => l.producto.id)).toEqual(["a", "b"]);
    expect(r.cambiaronPrecio).toBe(1);
    expect(r.omitidos).toEqual(["Gorra", "Cinto", "Calceta", "Borrado"]);
  });

  it("avisa precios de hoy, vencida y lo omitido", () => {
    expect(avisosConversion({ cambiaronPrecio: 0, omitidos: [], vigenteHasta: "2026-10-20", hoy: "2026-10-18" })).toEqual([]);
    expect(avisosConversion({ cambiaronPrecio: 2, omitidos: ["Gorra"], vigenteHasta: "2026-10-10", hoy: "2026-10-18" })).toEqual([
      "Precios de hoy: 2 producto(s) cambiaron.",
      "Esta cotización venció el 10/10/2026.",
      "Se omitió lo que ya no se vende o está agotado: Gorra.",
    ]);
  });

  it("vence al día siguiente de su vigencia", () => {
    expect(estaVencida("2026-10-18", "2026-10-18")).toBe(false);
    expect(estaVencida("2026-10-17", "2026-10-18")).toBe(true);
  });
});

describe("lista", () => {
  const cot = (folio: string, cliente: string | null): Cotizacion => ({
    id: folio, folio, estado: "VIGENTE", creadaIso: "2026-10-18T10:00:00Z", vigenteHasta: "2026-11-02", token: "t",
    cliente: cliente ? { clienteId: "c", nombre: cliente, telefono: null } : null, items: [], subtotal: 0, iva: 0, total: 0,
  });
  it("busca por folio o por cliente, sin acentos", () => {
    const l = [cot("COT-A-000001", "José Pérez"), cot("COT-A-000002", null)];
    expect(filtrarCotizaciones(l, "jose").map((c) => c.folio)).toEqual(["COT-A-000001"]);
    expect(filtrarCotizaciones(l, "0002").map((c) => c.folio)).toEqual(["COT-A-000002"]);
    expect(filtrarCotizaciones(l, "")).toHaveLength(2);
  });
});

describe("marcar convertida sin detener el cobro", () => {
  it("lo que falla se queda guardado y se reintenta", async () => {
    const a = memoria();
    anotarPorMarcar(a, { cotizacionId: "c1", ticketId: "t1" }, 1000);
    anotarPorMarcar(a, { cotizacionId: "c1", ticketId: "t1" }, 1000);
    expect(porMarcar(a)).toEqual([{ cotizacionId: "c1", ticketId: "t1", desdeMs: 1000 }]);
    await marcarPendientes(a, async () => { throw new Error("sin red"); }, 2000);
    expect(porMarcar(a)).toHaveLength(1);
    const hechas: string[] = [];
    await marcarPendientes(a, async (p) => { hechas.push(p.cotizacionId); }, 3000);
    expect(hechas).toEqual(["c1"]);
    expect(porMarcar(a)).toEqual([]);
  });

  it("cancelada, convertida con otra venta o borrada se suelta; sin cobrar se reintenta", () => {
    expect(esRechazoFinal("DATOS_INVALIDOS: la cotización ya está cancelada.")).toBe(true);
    expect(esRechazoFinal("DATOS_INVALIDOS: la cotización ya está convertida.")).toBe(true);
    expect(esRechazoFinal("DATOS_INVALIDOS: la cotización no existe.")).toBe(true);
    expect(esRechazoFinal("DATOS_INVALIDOS: la venta no existe o todavía no está cobrada.")).toBe(false);
    expect(esRechazoFinal("Failed to fetch")).toBe(false);
    // La venta se canceló después del cobro: tampoco cambia.
    expect(esRechazoFinal("DATOS_INVALIDOS: la venta no existe o todavía no está cobrada.", "CANCELADO")).toBe(true);
    expect(esRechazoFinal("DATOS_INVALIDOS: la venta no existe o todavía no está cobrada.", "ABIERTO")).toBe(false);
  });

  it("pasada una semana se suelta sin intentarla", async () => {
    const a = memoria();
    const dia = 24 * 60 * 60 * 1000;
    anotarPorMarcar(a, { cotizacionId: "vieja", ticketId: "t1" }, 0);
    anotarPorMarcar(a, { cotizacionId: "nueva", ticketId: "t2" }, 7 * dia);
    const intentadas: string[] = [];
    await marcarPendientes(a, async (p) => { intentadas.push(p.cotizacionId); throw new Error("sin red"); }, 7 * dia + 1);
    expect(intentadas).toEqual(["nueva"]);
    expect(porMarcar(a).map((p) => p.cotizacionId)).toEqual(["nueva"]);
  });
});

describe("la venta recuerda su cotización", () => {
  it("«cargar» la guarda y «limpiar» la suelta", async () => {
    const { reducerCarrito, estadoInicial } = await import("../carrito");
    const linea = { clientId: "l", producto: prod("p", 10), cantidad: 1, modificadores: [], notaCocina: null };
    const cargado = reducerCarrito(estadoInicial, { tipo: "cargar", estado: { ...estadoInicial, lineas: [linea], cotizacionId: "c1" } });
    expect(cargado.cotizacionId).toBe("c1");
    expect(reducerCarrito(cargado, { tipo: "limpiar" }).cotizacionId).toBeUndefined();
  });

  it("vaciada renglón por renglón (✕ o cantidad 0) también la suelta", async () => {
    const { reducerCarrito, estadoInicial } = await import("../carrito");
    const l = (id: string) => ({ clientId: id, producto: prod(id, 10), cantidad: 1, modificadores: [], notaCocina: null });
    let e = reducerCarrito(estadoInicial, { tipo: "cargar", estado: { ...estadoInicial, lineas: [l("a"), l("b")], cotizacionId: "c1" } });
    e = reducerCarrito(e, { tipo: "quitar", clientId: "a" });
    expect(e.cotizacionId).toBe("c1");
    e = reducerCarrito(e, { tipo: "cantidad", clientId: "b", cantidad: 0 });
    expect(e.lineas).toEqual([]);
    expect(e.cotizacionId).toBeNull();
    // Lo que se capture después ya no lleva la cotización.
    e = reducerCarrito(e, { tipo: "agregar", linea: l("z") });
    expect(e.cotizacionId).toBeNull();
  });
});
