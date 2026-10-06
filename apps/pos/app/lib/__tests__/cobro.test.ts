import { beforeEach, describe, expect, it, vi } from "vitest";

// `persistirTicket` habla con Supabase a través de `employeeClient` (../supabase), que en un
// test real crearía un cliente HTTP de verdad apuntando al URL de mentiras del vitest.config
// (ver comentario ahí: "las suites... son puras, no tocan red"). Para probar la lógica de
// ESTA tarea —cuándo se llama a `fijar_envio_ticket` y cuándo no— sin levantar Supabase, se
// sustituye el módulo entero por un doble mínimo que solo entiende las llamadas que
// `persistirTicket` hace de verdad (rpc + el select de `leerTotales`).
const { rpcMock, singleMock, updateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("../supabase", () => ({
  employeeClient: () => ({
    rpc: rpcMock,
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: (valores: Record<string, unknown>) => ({ eq: () => updateMock(valores) }),
    }),
  }),
}));

import { persistirTicket, cambiarZonaDePedido, ErrorEnvioNoFijado, ErrorTicketParcial } from "../cobro";
import type { LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";

const TOTALES_ROW = {
  id: "ticket-1",
  subtotal_mxn: "100.00",
  iva_mxn: "16.00",
  descuentos_manuales_mxn: "0",
  promociones_mxn: "0",
  lealtad_mxn: "0",
  total_mxn: "116.00",
  monto_pagado_mxn: "0",
  cambio_mxn: "0",
  monto_pendiente_mxn: "116.00",
  estado_fiscal: "ABIERTO",
  folio_completo: null,
};

const ctx = { token: "t", sucursalId: "s", cajaId: "c", turnoId: "tu" };

// Lineas vacías y cliente/dirección/nota sin capturar: así las únicas llamadas de red que hace
// `persistirTicket` son "abrir_ticket", la de envío (si aplica) y el select de `leerTotales` —
// justo lo que hace falta para probar el branching del envío, sin tener que simular productos.
const persistir = (envioZonaId?: string | null) =>
  persistirTicket(ctx, "DELIVERY_PROPIO", [], "cli-1", null, null, null, null, envioZonaId);

describe("persistirTicket — el cargo de envío (Task 7)", () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockImplementation(async () => ({ error: null }));
    rpcMock.mockReset();
    rpcMock.mockImplementation(async () => ({ data: "ticket-1", error: null }));
    singleMock.mockReset();
    singleMock.mockImplementation(async () => ({ data: TOTALES_ROW, error: null }));
  });

  it("no llama a fijar_envio_ticket cuando el pedido no trae zona", async () => {
    await persistir(null);
    const nombresRpc = rpcMock.mock.calls.map((c) => c[0]);
    expect(nombresRpc).toContain("abrir_ticket");
    expect(nombresRpc).not.toContain("fijar_envio_ticket");
  });

  it("tampoco llama a fijar_envio_ticket cuando el parámetro simplemente no se manda (compatibilidad)", async () => {
    await persistirTicket(ctx, "PARA_LLEVAR", [], "cli-2");
    expect(rpcMock.mock.calls.map((c) => c[0])).not.toContain("fijar_envio_ticket");
  });

  it("llama a fijar_envio_ticket con el ticket recién abierto y la zona, cuando sí hay zona", async () => {
    await persistir("zona-9");
    const llamada = rpcMock.mock.calls.find((c) => c[0] === "fijar_envio_ticket");
    expect(llamada?.[1]).toEqual({ p_ticket_id: "ticket-1", p_zona_id: "zona-9" });
  });

  it("propaga el error si fijar_envio_ticket falla (zona inactiva, de otra sucursal, etc.)", async () => {
    rpcMock.mockImplementation(async (nombre: string) =>
      nombre === "fijar_envio_ticket"
        ? { data: null, error: { message: "Zona de envío zona-mala no existe, está inactiva o no es de esta sucursal" } }
        : { data: "ticket-1", error: null },
    );
    await expect(persistir("zona-mala")).rejects.toThrow(/no existe, está inactiva/);
  });

  it("si el envío falla, el error lleva el ticket YA creado (y sus totales) para no abrir otro al reintentar", async () => {
    // abrir_ticket y los renglones ya pasaron: hay un ticket ABIERTO real. Si el llamador no se
    // entera de su id, el reintento abre otro y el primero queda huérfano trabando el corte.
    rpcMock.mockImplementation(async (nombre: string) =>
      nombre === "fijar_envio_ticket"
        ? { data: null, error: { message: "Zona de envío zona-mala no existe, está inactiva o no es de esta sucursal" } }
        : { data: "ticket-1", error: null },
    );
    const error = await persistir("zona-mala").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorEnvioNoFijado);
    const e = error as ErrorEnvioNoFijado;
    expect(e.ticketId).toBe("ticket-1");
    expect(e.totales?.ticketId).toBe("ticket-1");
    expect(e.message).toMatch(/no existe, está inactiva/);
  });

  it("un fallo ANTES de abrir el ticket no es ErrorEnvioNoFijado (no hay ticket que adoptar)", async () => {
    rpcMock.mockImplementation(async () => ({ data: null, error: { message: "turno cerrado" } }));
    const error = await persistir("zona-9").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ErrorEnvioNoFijado);
  });

  it("lee los totales autoritativos de la BD después de fijar el envío", async () => {
    const totales = await persistir("zona-9");
    expect(totales.total).toBe(116);
    expect(totales.ticketId).toBe("ticket-1");
  });
});

describe("cambiarZonaDePedido — cambiar la zona de un pedido en curso (Task 7, ronda 1/5)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockImplementation(async () => ({ data: null, error: null }));
    singleMock.mockReset();
    singleMock.mockImplementation(async () => ({ data: TOTALES_ROW, error: null }));
  });

  it("sin ticket (pedido todavía no persistido) no toca la red y devuelve null", async () => {
    const resultado = await cambiarZonaDePedido("t", null, "zona-9");
    expect(resultado).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(singleMock).not.toHaveBeenCalled();
  });

  it("con ticket, llama a fijar_envio_ticket y devuelve los totales frescos de leerTotales", async () => {
    const resultado = await cambiarZonaDePedido("t", "ticket-1", "zona-9");
    expect(rpcMock).toHaveBeenCalledWith("fijar_envio_ticket", { p_ticket_id: "ticket-1", p_zona_id: "zona-9" });
    expect(resultado?.total).toBe(116);
  });

  it("quitar la zona (zonaId null) también llama a la RPC, con p_zona_id null", async () => {
    await cambiarZonaDePedido("t", "ticket-1", null);
    expect(rpcMock).toHaveBeenCalledWith("fijar_envio_ticket", { p_ticket_id: "ticket-1", p_zona_id: null });
  });

  it("si la escritura falla, propaga el error y NUNCA llega a leer los totales", async () => {
    rpcMock.mockImplementation(async () => ({ data: null, error: { message: "El envío solo se puede fijar en tickets BORRADOR o ABIERTO (estado actual: PAGADO)" } }));
    await expect(cambiarZonaDePedido("t", "ticket-1", "zona-9")).rejects.toThrow(/BORRADOR o ABIERTO/);
    expect(singleMock).not.toHaveBeenCalled();
  });
});

const linea = (id: string, nombre: string): LineaCarrito => ({
  clientId: id,
  producto: { id: `prod-${id}`, nombre, descripcion: null, precio_base_mxn: 10, categoria_id: "c", agotado: false } as unknown as Producto,
  cantidad: 1,
  modificadores: [],
  notaCocina: null,
});

describe("persistirTicket — un corte a medias lleva el ticket (auditoría 30/09/2026, B2-3/B2-4)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    singleMock.mockReset();
    singleMock.mockImplementation(async () => ({ data: TOTALES_ROW, error: null }));
    updateMock.mockReset();
    updateMock.mockImplementation(async () => ({ error: null }));
  });

  it("si un renglón falla DESPUÉS de abrir, el error es ErrorTicketParcial con el id (no un Error pelón)", async () => {
    rpcMock.mockImplementation(async (nombre: string, args: { p_client_id_local?: string }) =>
      nombre === "agregar_item_a_ticket" && args.p_client_id_local === "l2"
        ? { data: null, error: { message: "Producto inactivo" } }
        : { data: "ticket-1", error: null },
    );
    const error = await persistirTicket(ctx, "PARA_LLEVAR", [linea("l1", "Taco"), linea("l2", "Agua")], "cli-9").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTicketParcial);
    expect(error).not.toBeInstanceOf(ErrorEnvioNoFijado);
    const e = error as ErrorTicketParcial;
    expect(e.ticketId).toBe("ticket-1");
    expect(e.fase).toBe("renglones");
    expect(e.message).toMatch(/Agua.*Producto inactivo/);
    expect(e.totales?.ticketId).toBe("ticket-1");
  });

  it("el reintento manda el MISMO client id del ticket y de cada renglón (la BD los hace idempotentes)", async () => {
    let falla = true;
    rpcMock.mockImplementation(async (nombre: string, args: { p_client_id_local?: string }) => {
      if (nombre === "agregar_item_a_ticket" && args.p_client_id_local === "l2" && falla) {
        falla = false;
        return { data: null, error: { message: "red" } };
      }
      return { data: "ticket-1", error: null };
    });
    const lineas = [linea("l1", "Taco"), linea("l2", "Agua")];
    await persistirTicket(ctx, "PARA_LLEVAR", lineas, "cli-9").catch(() => null);
    const totales = await persistirTicket(ctx, "PARA_LLEVAR", lineas, "cli-9");
    expect(totales.ticketId).toBe("ticket-1");
    const aperturas = rpcMock.mock.calls.filter((c) => c[0] === "abrir_ticket").map((c) => c[1].p_client_id_local);
    expect(aperturas).toEqual(["cli-9", "cli-9"]);
    const renglones = rpcMock.mock.calls.filter((c) => c[0] === "agregar_item_a_ticket").map((c) => c[1].p_client_id_local);
    expect(renglones).toEqual(["l1", "l2", "l1", "l2"]);
  });

  it("un update de la nota que falla YA NO se traga: sale ErrorTicketParcial con el id (fase encabezado)", async () => {
    rpcMock.mockImplementation(async () => ({ data: "ticket-1", error: null }));
    updateMock.mockImplementation(async (valores: Record<string, unknown>) =>
      "nota_general" in valores ? { error: { message: "permission denied" } } : { error: null },
    );
    const error = await persistirTicket(ctx, "PARA_LLEVAR", [linea("l1", "Taco")], "cli-1", null, null, "Sin cacahuate: alergia").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTicketParcial);
    const e = error as ErrorTicketParcial;
    expect(e.fase).toBe("encabezado");
    expect(e.ticketId).toBe("ticket-1");
    expect(e.message).toMatch(/nota de la orden.*permission denied/);
  });

  it("también revisa el error del nombre de la cuenta y de la dirección de entrega", async () => {
    rpcMock.mockImplementation(async () => ({ data: "ticket-1", error: null }));
    updateMock.mockImplementation(async () => ({ error: { message: "x" } }));
    await expect(persistirTicket(ctx, "DRIVE_THRU", [], "c", null, null, null, "Juan")).rejects.toThrow(/nombre de la cuenta/);
    await expect(persistirTicket(ctx, "DELIVERY_PROPIO", [], "c", "cli", "dir")).rejects.toThrow(/dirección de entrega/);
  });

  it("ErrorEnvioNoFijado sigue siendo un ErrorTicketParcial (fase envio) para que se adopte igual", () => {
    const e = new ErrorEnvioNoFijado("zona", "t", null);
    expect(e).toBeInstanceOf(ErrorTicketParcial);
    expect(e.fase).toBe("envio");
  });
});
