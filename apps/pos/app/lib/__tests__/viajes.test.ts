import { describe, it, expect } from "vitest";
import { agruparViajes, minutosFuera, viajeTarde } from "../viajes";
import type { DeliveryAsignacion } from "../delivery";

const asig = (over: Partial<DeliveryAsignacion> & { id: string }): DeliveryAsignacion => ({
  ticketId: `t-${over.id}`, ticketFolio: null, repartidorId: null, repartidorNombre: "Luis",
  estado: "EN_RUTA", montoALiquidar: 100, propinaRepartidor: 0, tiempoPromesa: 30,
  fechaAsignacion: "2026-09-20T18:00:00Z", viajeId: null, ...over,
});

describe("agruparViajes", () => {
  it("junta en un viaje las asignaciones que comparten viaje_id", () => {
    const vs = agruparViajes([
      asig({ id: "a", viajeId: "V1", montoALiquidar: 100, fechaAsignacion: "2026-09-20T18:05:00Z" }),
      asig({ id: "b", viajeId: "V1", montoALiquidar: 250, fechaAsignacion: "2026-09-20T18:00:00Z" }),
    ]);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.pedidos).toHaveLength(2);
    expect(vs[0]!.efectivo).toBe(350);
    // El viaje empezó con el pedido MÁS VIEJO: es contra ese que se cuenta el tiempo fuera.
    expect(vs[0]!.desdeIso).toBe("2026-09-20T18:00:00Z");
  });

  it("una asignación sin viaje_id es su propio viaje", () => {
    const vs = agruparViajes([asig({ id: "a", viajeId: null })]);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.id).toBe("a");
  });

  it("NO junta dos asignaciones sin viaje_id aunque sean del mismo repartidor", () => {
    // Son de antes de la 0114 o de dos salidas distintas. Juntarlas inventaría un viaje que no fue.
    const vs = agruparViajes([
      asig({ id: "a", viajeId: null, repartidorNombre: "Luis" }),
      asig({ id: "b", viajeId: null, repartidorNombre: "Luis" }),
    ]);
    expect(vs).toHaveLength(2);
  });

  it("dos viajes del mismo repartidor quedan separados", () => {
    const vs = agruparViajes([
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:15:00Z" }),
      asig({ id: "b", viajeId: "V2", fechaAsignacion: "2026-09-20T18:40:00Z" }),
    ]);
    expect(vs).toHaveLength(2);
  });

  it("ordena los viajes por el más viejo primero", () => {
    const vs = agruparViajes([
      asig({ id: "b", viajeId: "V2", fechaAsignacion: "2026-09-20T18:40:00Z" }),
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:15:00Z" }),
    ]);
    expect(vs.map((v) => v.id)).toEqual(["V1", "V2"]);
  });

  it("sin asignaciones no hay viajes", () => {
    expect(agruparViajes([])).toEqual([]);
  });
});

describe("minutosFuera", () => {
  it("cuenta desde el pedido más viejo del viaje", () => {
    const [v] = agruparViajes([
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:00:00Z" }),
      asig({ id: "b", viajeId: "V1", fechaAsignacion: "2026-09-20T18:10:00Z" }),
    ]);
    expect(minutosFuera(v!, new Date("2026-09-20T18:25:00Z"))).toBe(25);
  });
});

describe("viajeTarde", () => {
  it("es tarde cuando se pasó del tiempo prometido", () => {
    const [v] = agruparViajes([asig({ id: "a", viajeId: "V1", tiempoPromesa: 30 })]);
    expect(viajeTarde(v!, new Date("2026-09-20T18:31:00Z"))).toBe(true);
    expect(viajeTarde(v!, new Date("2026-09-20T18:20:00Z"))).toBe(false);
  });

  it("sin promesa nunca es tarde", () => {
    const [v] = agruparViajes([asig({ id: "a", viajeId: "V1", tiempoPromesa: null })]);
    expect(viajeTarde(v!, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});
