import { beforeEach, describe, expect, it, vi } from "vitest";

// `persistirTicket` habla con Supabase a través de `employeeClient` (../supabase), que en un
// test real crearía un cliente HTTP de verdad apuntando al URL de mentiras del vitest.config
// (ver comentario ahí: "las suites... son puras, no tocan red"). Para probar la lógica de
// ESTA tarea —cuándo se llama a `fijar_envio_ticket` y cuándo no— sin levantar Supabase, se
// sustituye el módulo entero por un doble mínimo que solo entiende las llamadas que
// `persistirTicket` hace de verdad (rpc + el select de `leerTotales`).
const { rpcMock, singleMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock("../supabase", () => ({
  employeeClient: () => ({
    rpc: rpcMock,
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

import { persistirTicket } from "../cobro";

const TOTALES_ROW = {
  id: "ticket-1",
  subtotal_mxn: "100.00",
  iva_mxn: "16.00",
  descuentos_manuales_mxn: "0",
  promociones_mxn: "0",
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

  it("lee los totales autoritativos de la BD después de fijar el envío", async () => {
    const totales = await persistir("zona-9");
    expect(totales.total).toBe(116);
    expect(totales.ticketId).toBe("ticket-1");
  });
});
