import { describe, it, expect } from "vitest";
import { construirOpsCobro } from "../cobro-offline";
import type { LineaCarrito } from "../carrito";

const prod = (id: string, nombre: string, precio: number) => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "cat", agotado: false,
  sku: "SKU-" + id, tasaIva: 16, ivaIncluido: true, claveSat: "01010101", unidadSat: "H87", categoriaNombre: "Burgers",
});

const lineas: LineaCarrito[] = [
  { clientId: "l1", producto: prod("p1", "Cheese Burger", 120), cantidad: 2, modificadores: [], notaCocina: "sin cebolla" },
  { clientId: "l2", producto: prod("p2", "Papas", 50), cantidad: 1, modificadores: [], notaCocina: null },
];

let n = 0;
const gen = { id: () => `id-${++n}`, clientId: () => `cli-${++n}`, ahora: () => "2026-06-10T12:00:00.000Z" };

describe("Fase 3 — construirOpsCobro (cobro offline → operaciones de sync)", () => {
  const ops = construirOpsCobro(
    { sucursalId: "S", cajaId: "C", turnoId: "T", usuarioId: "U" },
    "PARA_LLEVAR", lineas,
    { metodo: "EFECTIVO", montoMxn: 290, montoRecibidoMxn: 300, cambioMxn: 10 },
    { notaOrden: "alérgico" },
    gen,
  );

  it("emite ticket INSERT + ticket UPDATE(ABIERTO) + N items + pago, en orden", () => {
    expect(ops.map((o) => `${o.tabla}:${o.operacion}`)).toEqual([
      "tickets:INSERT", "tickets:UPDATE", "ticket_items:INSERT", "ticket_items:INSERT", "pagos:INSERT",
    ]);
  });

  it("el ticket entra como BORRADOR (sin estado_fiscal en el INSERT) y luego transiciona a ABIERTO", () => {
    expect(ops[0].payload.estado_fiscal).toBeUndefined();
    expect(ops[1].payload).toEqual({ estado_fiscal: "ABIERTO" });
    expect(ops[0].payload.nota_general).toBe("alérgico");
  });

  it("los items referencian el id LOCAL del ticket y cargan los snapshots fiscales", () => {
    const ticketLocalId = ops[0].entidadIdLocal;
    expect(ops[2].payload.ticket_id).toBe(ticketLocalId);
    expect(ops[2].payload.producto_nombre_snapshot).toBe("Cheese Burger");
    expect(ops[2].payload.precio_unitario_snapshot).toBe(120);
    expect(ops[2].payload.tasa_iva_snapshot).toBe(16);
    expect(ops[2].payload.nota_cocina).toBe("sin cebolla");
  });

  it("el pago referencia el ticket y lleva método/montos", () => {
    const ticketLocalId = ops[0].entidadIdLocal;
    expect(ops[4].payload.ticket_id).toBe(ticketLocalId);
    expect(ops[4].payload.metodo_pago).toBe("EFECTIVO");
    expect(ops[4].payload.monto_mxn).toBe(290);
    expect(ops[4].payload.cambio_mxn).toBe(10);
  });

  it("cada operación tiene client_id_local único (idempotencia)", () => {
    const ids = ops.map((o) => o.clientIdLocal);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
