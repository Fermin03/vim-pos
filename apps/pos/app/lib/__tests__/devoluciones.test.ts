import { describe, expect, it, vi } from "vitest";

/** Cliente falso: anota cada consulta (tabla + filtros) y responde lo que diga `responder`. */
const falso = vi.hoisted(() => {
  type Consulta = { tabla: string; filtros: [string, string, unknown][] };
  const consultas: Consulta[] = [];
  let responder: (c: Consulta) => unknown[] = () => [];
  const cliente = {
    from(tabla: string) {
      const c: Consulta = { tabla, filtros: [] };
      consultas.push(c);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq", "is", "gte", "order", "limit"]) {
        b[m] = (col: string, v: unknown) => { c.filtros.push([m, col, v]); return b; };
      }
      b.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: responder(c), error: null }).then(ok);
      return b;
    },
  };
  return { consultas, cliente, fijar: (r: (c: Consulta) => unknown[]) => { responder = r; } };
});
vi.mock("../supabase", () => ({ employeeClient: () => falso.cliente }));

import { alcanceDevolucion, buscarVentasConProducto, itemsDevolucion, motivosDevolucion, totalDevolucion, type VentaDevolvible } from "../devoluciones";

const venta: VentaDevolvible = {
  ticketId: "t1",
  folio: "A-12",
  total: 500,
  fechaCobro: null,
  renglones: [
    { ticket_item_id: "i1", producto_id: "p1", nombre: "Playera M", cantidad: 2, devuelta: 0, precio_unitario: 150, total: 300 },
    { ticket_item_id: "i2", producto_id: "p2", nombre: "Gorra", cantidad: 1, devuelta: 0, precio_unitario: 200, total: 200 },
  ],
};

describe("motivos de devolución", () => {
  it("una tienda no ve «Tardó demasiado» y sí «No le gustó»", () => {
    const tienda = motivosDevolucion(true);
    expect(tienda.map((m) => m.codigo)).toEqual(["PRODUCTO_DEFECTUOSO", "CLIENTE_NO_SATISFECHO", "ERROR_COBRO", "OTRO"]);
    expect(tienda.find((m) => m.codigo === "CLIENTE_NO_SATISFECHO")?.label).toBe("No le gustó");
  });
  it("un restaurante sigue con su lista de hoy", () => {
    expect(motivosDevolucion(false).map((m) => m.codigo)).toContain("TIEMPO_EXCEDIDO");
  });
});

describe("armado de la devolución parcial", () => {
  it("un renglón que no vuelve al anaquel no reversa existencia", () => {
    expect(itemsDevolucion([
      { ticket_item_id: "i1", cantidad: 1, regresaAlAnaquel: false },
      { ticket_item_id: "i2", cantidad: 1, regresaAlAnaquel: true },
    ])).toEqual([
      { ticket_item_id: "i1", cantidad_devuelta: 1, reversar_inventario_item: false },
      { ticket_item_id: "i2", cantidad_devuelta: 1, reversar_inventario_item: true },
    ]);
  });
  it("es TOTAL solo si se devuelve todo completo", () => {
    const todo = [
      { ticket_item_id: "i1", cantidad: 2, regresaAlAnaquel: true },
      { ticket_item_id: "i2", cantidad: 1, regresaAlAnaquel: true },
    ];
    expect(alcanceDevolucion(venta, todo)).toBe("TOTAL");
    expect(alcanceDevolucion(venta, [{ ...todo[0], cantidad: 1 }, todo[1]])).toBe("PARCIAL");
    expect(alcanceDevolucion(venta, [todo[0]])).toBe("PARCIAL");
  });
  it("lo ya devuelto antes cuenta para completar la venta", () => {
    const conPrevia = { ...venta, renglones: [{ ...venta.renglones[0], devuelta: 2 }, venta.renglones[1]] };
    expect(alcanceDevolucion(conPrevia, [{ ticket_item_id: "i2", cantidad: 1, regresaAlAnaquel: true }])).toBe("TOTAL");
  });
  it("el total sigue el cálculo de la base: proporción por pieza y descuento del ticket", () => {
    expect(totalDevolucion(venta, [{ ticket_item_id: "i1", cantidad: 1, regresaAlAnaquel: true }])).toBe(150);
    // Ticket con 10 % de descuento global: total 450 contra 500 de renglones.
    expect(totalDevolucion({ ...venta, total: 450 }, [{ ticket_item_id: "i1", cantidad: 1, regresaAlAnaquel: true }])).toBe(135);
  });
  it("redondea como ROUND de la base, mitad hacia arriba en centavos: 100.01 / 2 → 50.01", () => {
    // En flotante, 100.01 / 2 = 50.00499… y Math.round(·×100)/100 daba 50.00.
    const impar: VentaDevolvible = {
      ...venta,
      total: 100.01,
      renglones: [{ ticket_item_id: "i1", producto_id: "p1", nombre: "Calcetas", cantidad: 2, devuelta: 0, precio_unitario: 50.005, total: 100.01 }],
    };
    expect(totalDevolucion(impar, [{ ticket_item_id: "i1", cantidad: 1, regresaAlAnaquel: true }])).toBe(50.01);
    // 2.01 / 2 = 1.005: en flotante 100.4999… centavos, que redondeaba a 1.00.
    const chico = { ...impar, total: 2.01, renglones: [{ ...impar.renglones[0], total: 2.01 }] };
    expect(totalDevolucion(chico, [{ ticket_item_id: "i1", cantidad: 1, regresaAlAnaquel: true }])).toBe(1.01);
  });
});

describe("buscar ventas por la prenda escaneada", () => {
  it("busca solo en la sucursal de la caja y pide los renglones de a 50 ids", async () => {
    falso.consultas.length = 0;
    const tickets = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, folio_completo: `A-${i}`, total_mxn: 100, fecha_pago: null, estado_fiscal: "PAGADO" }));
    // Dos renglones por venta: 100 ids de renglón, que van en dos consultas de devoluciones.
    falso.fijar((c) => c.tabla === "tickets" ? tickets
      : c.tabla === "ticket_items" ? tickets.flatMap((t) => [0, 1].map((k) => ({ id: `${t.id}-${k}`, ticket_id: t.id, producto_id: "p1", producto_nombre_snapshot: "Playera", cantidad: 1, precio_unitario_snapshot: 50, total_item_mxn: 50 })))
      : []);
    const ventas = await buscarVentasConProducto("tok", "p1", "suc-1");
    expect(falso.consultas[0]?.filtros).toContainEqual(["eq", "sucursal_id", "suc-1"]);
    expect(ventas).toHaveLength(50);
    expect(ventas[0]?.renglones).toHaveLength(2);
    const enDev = falso.consultas.filter((c) => c.tabla === "devolucion_items")
      .map((c) => (c.filtros.find(([m]) => m === "in")?.[2] as string[]).length);
    expect(enDev).toEqual([50, 50]);
  });
});
