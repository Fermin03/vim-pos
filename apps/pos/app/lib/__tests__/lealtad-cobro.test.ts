import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const { tablas, rpcs, fallas } = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  rpcs: [] as { nombre: string; args: Fila }[],
  /** Qué debe fallar en esta prueba. `lecturasDeTickets`: a partir de cuál lectura de `tickets` truena. */
  fallas: { quitar: false, canjes: false, lecturaDeTicketsDesde: 0, lecturasDeTickets: 0 },
}));

// Doble de PostgREST: filtra de verdad sobre filas en memoria (mismo estilo que lealtad.test.ts).
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    limit: () => q,
    single: async () => {
      if (tabla === "tickets") {
        fallas.lecturasDeTickets += 1;
        if (fallas.lecturaDeTicketsDesde > 0 && fallas.lecturasDeTickets >= fallas.lecturaDeTicketsDesde) {
          return { data: null, error: { message: "sin conexión con la base" } };
        }
      }
      return { data: filas()[0] ?? null, error: filas()[0] ? null : { message: "sin fila" } };
    },
    maybeSingle: async () => (
      tabla === "ticket_canjes_lealtad" && fallas.canjes
        ? { data: null, error: { message: "no se pudo leer el canje" } }
        : { data: filas()[0] ?? null, error: null }
    ),
  };
  return q;
}

vi.mock("../supabase", () => ({
  employeeClient: () => ({
    from: consulta,
    rpc: async (nombre: string, args: Fila) => {
      rpcs.push({ nombre, args });
      if (nombre === "quitar_canje_lealtad") {
        if (fallas.quitar) return { data: null, error: { message: "no se pudo quitar" } };
        for (const c of tablas.ticket_canjes_lealtad ?? []) if (c.ticket_id === args.p_ticket_id) c.revertido = true;
        for (const t of tablas.tickets ?? []) if (t.id === args.p_ticket_id) { t.total_mxn = "80"; t.lealtad_mxn = "0"; t.monto_pendiente_mxn = "80"; }
        return { data: 1, error: null };
      }
      return { data: null, error: { message: `rpc sin doble: ${nombre}` } };
    },
  }),
  urlFuncion: (n: string) => `http://gw/functions/v1/${n}`,
  encabezadosFuncion: () => ({}),
}));

import { revisarLealtadAntesDeCobrar } from "../lealtad-cobro";
import { guardarPendiente, leerPendiente, nuevoCanjeDinero, nuevoCanjePremio, type Almacen } from "../lealtad-canje";

function memoria(): Almacen {
  const crudo = new Map<string, string>();
  return { getItem: (k) => crudo.get(k) ?? null, setItem: (k, v) => { crudo.set(k, v); } };
}

const ANA = { clienteId: "c-1", nombre: "Ana Gómez", telefono: "4771234567" };

/** La cuenta en la base: $80 de consumo con $30 de lealtad aplicados → total $50. */
const TICKET_FILA = {
  id: "tk-1", subtotal_mxn: "68.97", iva_mxn: "11.03", descuentos_manuales_mxn: "0", promociones_mxn: "0", lealtad_mxn: "30",
  total_mxn: "50", monto_pagado_mxn: "0", cambio_mxn: "0", monto_pendiente_mxn: "50", estado_fiscal: "ABIERTO", folio_completo: "KC-1",
};
const canjeDe = (monto: number, extra: Fila = {}): Fila => ({
  id: "cj-1", ticket_id: "tk-1", puntos: monto, monto_descontado_mxn: String(monto), premio_id: null, ticket_item_id: null, revertido: false, ...extra,
});
const sigueVivo = () => (tablas.ticket_canjes_lealtad ?? []).some((c) => c.revertido === false);

let alm: Almacen;

beforeEach(() => {
  rpcs.length = 0;
  for (const k of Object.keys(tablas)) delete tablas[k];
  Object.assign(fallas, { quitar: false, canjes: false, lecturaDeTicketsDesde: 0, lecturasDeTickets: 0 });
  tablas.tickets = [{ ...TICKET_FILA }];
  tablas.ticket_canjes_lealtad = [];
  alm = memoria();
});

describe("canje a medias antes de cobrar", () => {
  it("con un canje a medias avisa, no abre el cobro y NO quita nada (ni siquiera lee la cuenta)", async () => {
    // Además hay un canje recortado en la cuenta: el pendiente manda y ese canje no se toca.
    tablas.ticket_canjes_lealtad = [canjeDe(50)];
    const pendiente = { ...nuevoCanjeDinero({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 40 }), paso: "ASENTAR" as const };
    guardarPendiente(alm, pendiente);

    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);

    expect(r.accion).toBe("AVISAR");
    expect(r).toMatchObject({ titulo: "Hay un canje a medias", totales: null });
    expect(r.accion === "AVISAR" && r.texto).toMatch(/40 puntos/);
    expect(r.accion === "AVISAR" && r.texto).toMatch(/ya se le hayan descontado/);
    expect(r.accion === "AVISAR" && r.texto).toMatch(/Reintentar/);
    expect(r.accion === "AVISAR" && r.texto).toMatch(/desc[aá]rtalo/);
    expect(rpcs).toEqual([]);
    expect(sigueVivo()).toBe(true);
    expect(fallas.lecturasDeTickets).toBe(0);
    // El pendiente sigue guardado: resolverlo es cosa del modal de Lealtad.
    expect(leerPendiente(alm, "tk-1")).toMatchObject({ canjeId: pendiente.canjeId, paso: "ASENTAR" });
  });

  it("la cantidad se dice en la unidad del canje pendiente (sellos de un premio)", async () => {
    guardarPendiente(alm, nuevoCanjePremio({
      ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "SELLOS",
      premio: { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", costo: 6 },
    }));
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "SELLOS", alm);
    expect(r.accion === "AVISAR" && r.texto).toMatch(/6 sellos/);
  });

  it("el canje a medias de OTRA cuenta no estorba el cobro de esta", async () => {
    guardarPendiente(alm, nuevoCanjeDinero({ ticketId: "tk-2", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 40 }));
    expect((await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm)).accion).toBe("COBRAR");
  });
});

describe("canje de dinero recortado antes de cobrar", () => {
  it("si la cuenta ya no aguanta el canje completo, lo quita, relee el total y avisa con los totales nuevos", async () => {
    tablas.ticket_canjes_lealtad = [canjeDe(50)]; // la base solo aplicó 30 de los 50
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);
    expect(rpcs).toEqual([{ nombre: "quitar_canje_lealtad", args: { p_ticket_id: "tk-1" } }]);
    expect(r).toMatchObject({ accion: "AVISAR", titulo: "Se quitó el canje de lealtad", totales: { ticketId: "tk-1", total: 80, lealtad: 0 } });
    expect(r.accion === "AVISAR" && r.texto).toMatch(/50 puntos/);
    expect(r.accion === "AVISAR" && r.texto).toMatch(/volvieron/);
  });

  it("un canje que entra completo no se toca: se cobra con los totales recién leídos", async () => {
    tablas.ticket_canjes_lealtad = [canjeDe(30)];
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);
    expect(rpcs).toEqual([]);
    expect(r).toEqual({
      accion: "COBRAR",
      totales: {
        ticketId: "tk-1", subtotal: 68.97, iva: 11.03, descuentos: 0, promociones: 0, lealtad: 30, total: 50,
        montoPagado: 0, cambio: 0, pendiente: 50, estadoFiscal: "ABIERTO", folio: "KC-1",
      },
    });
  });

  it("sin canje no hace nada: se cobra con los totales recién leídos", async () => {
    tablas.tickets = [{ ...TICKET_FILA, lealtad_mxn: "0", total_mxn: "80", monto_pendiente_mxn: "80" }];
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);
    expect(rpcs).toEqual([]);
    expect(r).toMatchObject({ accion: "COBRAR", totales: { ticketId: "tk-1", total: 80, lealtad: 0, pendiente: 80 } });
  });

  it("decide con la base, no con lo que trae la pantalla: canje de 50 y la fila dice lealtad 50 → se cobra y no se quita", async () => {
    // El caso del estado viejo: otro dispositivo canjeó 50 sobre la misma mesa. La pantalla de esta
    // caja todavía cree que la cuenta va en $80 sin lealtad; la base ya dice $30 con 50 de lealtad.
    // La revisión ni recibe los totales de la pantalla: lee los de la base y el canje está sano.
    tablas.tickets = [{ ...TICKET_FILA, lealtad_mxn: "50", total_mxn: "30", monto_pendiente_mxn: "30" }];
    tablas.ticket_canjes_lealtad = [canjeDe(50)];
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);
    expect(rpcs).toEqual([]);
    expect(sigueVivo()).toBe(true);
    expect(r).toMatchObject({ accion: "COBRAR", totales: { total: 30, lealtad: 50, pendiente: 30 } });
  });

  it("un premio de producto nunca cuenta como recortado", async () => {
    tablas.tickets = [{ ...TICKET_FILA, lealtad_mxn: "0", total_mxn: "80" }];
    tablas.ticket_canjes_lealtad = [canjeDe(50, { premio_id: "pr-1", ticket_item_id: "it-9" })];
    expect((await revisarLealtadAntesDeCobrar("tk", "tk-1", "SELLOS", alm)).accion).toBe("COBRAR");
    expect(rpcs).toEqual([]);
  });

  it("si quitó el canje y ya no pudo releer, avisa igual (sin totales): no se abre el cobro con un total viejo", async () => {
    tablas.ticket_canjes_lealtad = [canjeDe(50)];
    fallas.lecturaDeTicketsDesde = 2; // la primera lectura sirve; la de después de quitar truena
    const r = await revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm);
    expect(rpcs.map((x) => x.nombre)).toEqual(["quitar_canje_lealtad"]);
    expect(r).toMatchObject({ accion: "AVISAR", titulo: "El total de la cuenta cambió", totales: null });
    expect(r.accion === "AVISAR" && r.texto).toMatch(/Revisa el total y vuelve a cobrar/);
  });
});

describe("si la revisión falla, lanza: quien cobra la atrapa y sigue", () => {
  it("no se pueden leer los totales", async () => {
    fallas.lecturaDeTicketsDesde = 1;
    await expect(revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm)).rejects.toThrow(/sin conexión/);
  });

  it("no se puede leer el canje", async () => {
    fallas.canjes = true;
    await expect(revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm)).rejects.toThrow(/no se pudo leer el canje/);
    expect(rpcs).toEqual([]);
  });

  it("no se puede quitar el canje recortado", async () => {
    tablas.ticket_canjes_lealtad = [canjeDe(50)];
    fallas.quitar = true;
    await expect(revisarLealtadAntesDeCobrar("tk", "tk-1", "PUNTOS_DINERO", alm)).rejects.toThrow(/no se pudo quitar/);
    expect(sigueVivo()).toBe(true);
  });
});
