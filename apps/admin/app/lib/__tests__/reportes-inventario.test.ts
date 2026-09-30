import { describe, it, expect } from "vitest";
import {
  aMovimiento,
  agruparCostoVentas,
  cifrasMovimientos,
  estadoCosto,
  etiquetaTipo,
  fechaHoraMx,
  limpiarBusqueda,
  margenDe,
  referenciaMovimiento,
  tiposDeFiltro,
  totalesCostoVentas,
  type FilaCostoRpc,
  type Movimiento,
} from "../reportes-inventario";

// ── P-149 ─────────────────────────────────────────────────────────────────────────────────
describe("limpiarBusqueda", () => {
  it("quita los comodines del ILIKE para que tabla y cifras busquen lo mismo", () => {
    expect(limpiarBusqueda("  carne%_molida*  ")).toBe("carne molida");
    expect(limpiarBusqueda("100%")).toBe("100");
    expect(limpiarBusqueda("   ")).toBe("");
  });
});

describe("fechaHoraMx", () => {
  it("la hora del negocio, no la del navegador: 05:06 UTC del 30 son las 23:06 del 29 en México", () => {
    expect(fechaHoraMx("2026-09-30T05:06:31.566Z")).toBe("29 sep 2026, 23:06");
  });
  it("una fecha rota no truena", () => {
    expect(fechaHoraMx("no-es-fecha")).toBe("—");
  });
});

describe("tipos de movimiento", () => {
  it("en palabras del dueño, y un tipo nuevo sale con su nombre crudo", () => {
    expect(etiquetaTipo("REVERSA_CANCELACION")).toBe("Regreso de venta");
    expect(etiquetaTipo("AJUSTE_NEGATIVO")).toBe("Ajuste −");
    expect(etiquetaTipo("TIPO_NUEVO")).toBe("TIPO_NUEVO");
  });
  it("el filtro de ventas incluye lo que regresó; el de compras, las anuladas", () => {
    expect(tiposDeFiltro("ventas")).toEqual(["SALIDA_VENTA", "SALIDA_MODIFICADOR_EXTRA", "REVERSA_CANCELACION"]);
    expect(tiposDeFiltro("compras")).toEqual(["ENTRADA_COMPRA", "DEVOLUCION_PROVEEDOR"]);
    expect(tiposDeFiltro("todos")).toBeNull();
  });
});

const base: Movimiento = {
  id: "m1", fecha: "2026-09-29T20:00:00Z", sucursal: "Centro", insumo: "Carne", unidad: "kg", tipo: "SALIDA_VENTA",
  cantidad: -0.15, costo: -27.75, compraFolio: null, proveedor: null, facturaReferencia: null, ticketFolio: null,
  motivo: null, descripcion: null, sucursalDestino: null, usuario: null,
};

describe("referenciaMovimiento", () => {
  it("una compra: folio, proveedor y documento", () => {
    expect(referenciaMovimiento({ ...base, tipo: "ENTRADA_COMPRA", compraFolio: "K1-2026-000003", proveedor: "Carnes del Bajío", facturaReferencia: "F-2291" }))
      .toBe("Compra K1-2026-000003 · Carnes del Bajío · doc. F-2291");
    // La entrada vieja (antes de 0099) no tiene compra: queda el proveedor escrito a mano.
    expect(referenciaMovimiento({ ...base, tipo: "ENTRADA_COMPRA", proveedor: "Mercado" })).toBe("Compra · Mercado");
  });
  it("una venta y un extra: el ticket", () => {
    expect(referenciaMovimiento({ ...base, ticketFolio: "CB-2026-000001" })).toBe("Ticket CB-2026-000001");
    expect(referenciaMovimiento({ ...base, tipo: "SALIDA_MODIFICADOR_EXTRA", ticketFolio: "CB-2026-000001" })).toBe("Extra del ticket CB-2026-000001");
  });
  it("un regreso dice si fue cancelación o devolución (lo escribe la reversa)", () => {
    expect(referenciaMovimiento({ ...base, tipo: "REVERSA_CANCELACION", ticketFolio: "CB-1", descripcion: "Devolución folio D-2026-000004" }))
      .toBe("Devolución folio D-2026-000004");
    expect(referenciaMovimiento({ ...base, tipo: "REVERSA_CANCELACION", ticketFolio: "CB-1" })).toBe("Ticket CB-1");
  });
  it("una merma o un ajuste: el motivo capturado", () => {
    expect(referenciaMovimiento({ ...base, tipo: "MERMA", motivo: "Caducado", descripcion: "Del lote del lunes" })).toBe("Caducado · Del lote del lunes");
    expect(referenciaMovimiento({ ...base, tipo: "AJUSTE_POSITIVO" })).toBe("Sin motivo");
  });
  it("una compra anulada", () => {
    expect(referenciaMovimiento({ ...base, tipo: "DEVOLUCION_PROVEEDOR", compraFolio: "K1-9", motivo: "Anulación de compra K1-9: venía mal" }))
      .toBe("Anulación de compra K1-9: venía mal");
    expect(referenciaMovimiento({ ...base, tipo: "DEVOLUCION_PROVEEDOR", compraFolio: "K1-9" })).toBe("Anulación de compra K1-9");
  });
});

describe("aMovimiento", () => {
  it("aplica el signo a cantidad y costo", () => {
    const m = aMovimiento({ id: "x", fecha: "2026-09-29T20:00:00Z", tipo: "SALIDA_VENTA", signo: -1, cantidad: "0.150", costo_unitario_mxn: "185", costo_total_mxn: "27.75" });
    expect(m.cantidad).toBe(-0.15);
    expect(m.costo).toBe(-27.75);
  });
  it("sin costo unitario no hay costo: no es 'gratis', es que no se sabe", () => {
    const m = aMovimiento({ id: "x", fecha: "2026-09-29T20:00:00Z", tipo: "ENTRADA_COMPRA", signo: 1, cantidad: 2, costo_unitario_mxn: 0, costo_total_mxn: 0 });
    expect(m.cantidad).toBe(2);
    expect(m.costo).toBeNull();
  });
});

describe("cifrasMovimientos", () => {
  it("cada cifra es un neto: compras menos anuladas, venta menos lo que regresó, ajustes + menos −", () => {
    const c = cifrasMovimientos([
      { tipo: "ENTRADA_COMPRA", movimientos: 2, costo: 2892 },
      { tipo: "DEVOLUCION_PROVEEDOR", movimientos: 1, costo: 92 },
      { tipo: "SALIDA_VENTA", movimientos: 262, costo: 3444.45 },
      { tipo: "SALIDA_MODIFICADOR_EXTRA", movimientos: 3, costo: 15 },
      { tipo: "REVERSA_CANCELACION", movimientos: 4, costo: 59.45 },
      { tipo: "MERMA", movimientos: 3, costo: 142.6 },
      { tipo: "AJUSTE_POSITIVO", movimientos: 1, costo: 10 },
      { tipo: "AJUSTE_NEGATIVO", movimientos: 2, costo: 30 },
    ]);
    expect(c.compras).toBe(2800);
    expect(c.comprasMovs).toBe(3);
    expect(c.consumoVenta).toBeCloseTo(3400, 2);
    expect(c.ventaMovs).toBe(269);
    expect(c.mermas).toBe(142.6);
    expect(c.ajustes).toBe(-20);
    expect(c.movimientos).toBe(278);
  });
  it("sin movimientos, todo en cero", () => {
    expect(cifrasMovimientos([])).toMatchObject({ movimientos: 0, compras: 0, consumoVenta: 0, mermas: 0, ajustes: 0 });
  });
});

// ── P-150 ─────────────────────────────────────────────────────────────────────────────────
const fila = (x: Partial<FilaCostoRpc>): FilaCostoRpc => ({
  productoId: "p1", producto: "Burger", categoria: "Hamburguesas", tieneReceta: true,
  unidades: 0, venta: 0, unidadesConCosto: 0, ventaConCosto: 0, costo: 0, costoEstimado: 0, costoRepartido: 0, insumoSinCosto: false,
  ...x,
});

// El caso del smoke (0129): Burger con una venta sin descuento de inventario, Papas con sal sin
// costo, Refresco sin receta, Doble con la receta cambiada después de vender.
const smoke: FilaCostoRpc[] = [
  fila({ productoId: "b", producto: "Burger", unidades: 2, venta: 200, unidadesConCosto: 1, ventaConCosto: 100, costo: 33, costoEstimado: 8 }),
  fila({ productoId: "p", producto: "Papas", categoria: "Acompañantes", unidades: 2, venta: 90, unidadesConCosto: 2, ventaConCosto: 90, costo: 20, insumoSinCosto: true }),
  fila({ productoId: "r", producto: "Refresco", categoria: "Bebidas", tieneReceta: false, unidades: 1, venta: 25 }),
  fila({ productoId: "d", producto: "Doble", unidades: 1, venta: 200, unidadesConCosto: 1, ventaConCosto: 200, costo: 45, costoRepartido: 40 }),
];

describe("agruparCostoVentas", () => {
  it("por producto: junta las filas del mismo producto vendido bajo dos categorías", () => {
    const g = agruparCostoVentas(
      [fila({ unidades: 2, venta: 200, unidadesConCosto: 2, ventaConCosto: 200, costo: 60 }), fila({ categoria: "Burgers", unidades: 1, venta: 100, unidadesConCosto: 1, ventaConCosto: 100, costo: 30 })],
      "producto",
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nombre: "Burger", unidades: 3, venta: 300, costo: 90, productos: 1 });
  });

  it("por categoría: cuenta productos y cuántos no tienen nada de costo", () => {
    const g = agruparCostoVentas(smoke, "categoria");
    const hamb = g.find((x) => x.nombre === "Hamburguesas")!;
    expect(hamb).toMatchObject({ productos: 2, productosSinCosto: 0, venta: 400, ventaConCosto: 300, costo: 78, costoRepartido: 40 });
    expect(g.find((x) => x.nombre === "Bebidas")).toMatchObject({ productos: 1, productosSinCosto: 1, costo: 0 });
  });

  it("un producto libre (sin id) se identifica por su nombre, y la categoría vacía tiene nombre", () => {
    const g = agruparCostoVentas([fila({ productoId: null, producto: "Varios", categoria: null, unidades: 1, venta: 10 }), fila({ productoId: null, producto: "Otro", categoria: null, unidades: 1, venta: 5 })], "producto");
    expect(g.map((x) => x.nombre).sort()).toEqual(["Otro", "Varios"]);
    expect(agruparCostoVentas([fila({ categoria: null })], "categoria")[0]!.nombre).toBe("Sin categoría");
  });

  it("el consumo sin producto sale en su propia fila, en los dos agrupados", () => {
    const huerfano = fila({ productoId: null, producto: null, categoria: null, costo: 12, costoRepartido: 12 });
    for (const por of ["producto", "categoria"] as const) {
      const g = agruparCostoVentas([...smoke, huerfano], por);
      const s = g.find((x) => x.sinProducto)!;
      expect(s).toMatchObject({ nombre: "Consumo sin producto", costo: 12, productos: 0 });
    }
  });
});

describe("margen y estado", () => {
  const g = agruparCostoVentas(smoke, "producto");
  const de = (n: string) => g.find((x) => x.nombre === n)!;

  it("el margen es contra la venta CON costo: la venta de t1 (descuento apagado) no cuenta", () => {
    expect(margenDe(de("Burger"))).toEqual({ pesos: 67, pct: 67 });
  });

  it("un producto sin receta NO tiene margen del 100 %: no tiene margen", () => {
    expect(margenDe(de("Refresco"))).toEqual({ pesos: null, pct: null });
    expect(estadoCosto(de("Refresco"))).toBe("sin_receta");
  });

  it("con receta pero sin consumo registrado es otro estado (el descuento estaba apagado)", () => {
    expect(estadoCosto({ ...de("Burger"), unidadesConCosto: 0, ventaConCosto: 0, costo: 0 })).toBe("sin_consumo");
  });

  it("costo en parte de las piezas: parcial; en todas: completo", () => {
    expect(estadoCosto(de("Burger"))).toBe("parcial");
    expect(estadoCosto(de("Papas"))).toBe("completo");
  });

  it("un margen negativo se reporta como tal", () => {
    expect(margenDe({ ventaConCosto: 50, costo: 80 })).toEqual({ pesos: -30, pct: -60 });
  });

  it("costo sin venta (un combo con receta propia): margen en pesos, sin porcentaje", () => {
    expect(margenDe({ ventaConCosto: 0, costo: 5 })).toEqual({ pesos: -5, pct: null });
  });
});

describe("totalesCostoVentas", () => {
  const t = totalesCostoVentas(agruparCostoVentas(smoke, "producto"));

  it("cuadra con el smoke: venta 515, con costo 390, costo 98", () => {
    expect(t).toMatchObject({ venta: 515, ventaConCosto: 390, ventaSinCosto: 125, costo: 98, margen: 292 });
    expect(t.margenPct).toBeCloseTo((292 / 390) * 100, 6);
    expect(t.costoPct).toBeCloseTo((98 / 390) * 100, 6);
  });

  it("cuenta lo que hay que explicar en las notas", () => {
    expect(t).toMatchObject({ costoEstimado: 8, costoRepartido: 40, insumoSinCosto: true, productosSinCosto: 1, productosSinReceta: 1 });
  });

  it("sin nada de costo no hay porcentaje que inventar", () => {
    const s = totalesCostoVentas(agruparCostoVentas([fila({ tieneReceta: false, unidades: 3, venta: 300 })], "producto"));
    expect(s).toMatchObject({ venta: 300, ventaConCosto: 0, ventaSinCosto: 300, costo: 0, margenPct: null, costoPct: null });
  });
});
