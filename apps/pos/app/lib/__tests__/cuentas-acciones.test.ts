import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("../supabase", () => ({ employeeClient: () => ({ rpc: rpcMock }) }));

const args = { ticketId: "t", motivo: "m", autorizacionPinId: "p", solicitanteId: "s", autorizoId: "a" };

describe("reabrirCuenta", () => {
  beforeEach(() => rpcMock.mockReset());

  it("si otra cuenta de barra abierta usa el nombre, avisa en español", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "idx_tickets_barra_nombre_abierto"' },
    });
    const { reabrirCuenta } = await import("../cuentas-acciones");
    await expect(reabrirCuenta("tok", args)).rejects.toThrow(
      new Error("Otra cuenta de barra tiene ese nombre. Cóbrala o pásala a una mesa."),
    );
  });

  it("otro error se relanza tal cual", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { reabrirCuenta } = await import("../cuentas-acciones");
    await expect(reabrirCuenta("tok", args)).rejects.toThrow(new Error("boom"));
  });
});
