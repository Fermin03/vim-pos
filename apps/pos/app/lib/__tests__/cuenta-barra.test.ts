import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("../supabase", () => ({ employeeClient: () => ({ rpc: rpcMock }) }));

describe("nombreLibre", () => {
  it("un nombre libre se queda (sin espacios sobrantes)", async () => {
    const { nombreLibre } = await import("../cuenta-barra");
    expect(nombreLibre("  Luis ", ["Ana"])).toBe("Luis");
  });
  it("si está en uso propone el siguiente número, sin distinguir mayúsculas", async () => {
    const { nombreLibre } = await import("../cuenta-barra");
    expect(nombreLibre("luis", ["Luis"])).toBe("luis 2");
    expect(nombreLibre("Luis", ["luis", "LUIS 2"])).toBe("Luis 3");
  });
});

describe("cuentas de barra por RPC", () => {
  beforeEach(() => rpcMock.mockReset());

  it("abrirCuentaBarra llama abrir_cuenta_barra con los parámetros", async () => {
    rpcMock.mockResolvedValue({ data: "t1", error: null });
    const { abrirCuentaBarra } = await import("../cuenta-barra");
    const id = await abrirCuentaBarra("tok", { sucursalId: "s", cajaId: "c", turnoId: "tu", nombre: "Luis", usuarioId: "u", clientIdLocal: "cl" });
    expect(id).toBe("t1");
    expect(rpcMock).toHaveBeenCalledWith("abrir_cuenta_barra", {
      p_sucursal_id: "s", p_caja_id: "c", p_turno_id: "tu", p_nombre: "Luis", p_client_id_local: "cl", p_usuario_id: "u",
    });
  });

  it("NOMBRE_EN_USO se vuelve NombreEnUso; otro error se relanza", async () => {
    const { abrirCuentaBarra, moverCuentaABarra, moverCuentaAMesa, NombreEnUso } = await import("../cuenta-barra");
    const a = { sucursalId: "s", cajaId: "c", turnoId: "tu", nombre: "Luis", usuarioId: null, clientIdLocal: "cl" };
    rpcMock.mockResolvedValue({ data: null, error: { message: "NOMBRE_EN_USO: Luis" } });
    const e = await abrirCuentaBarra("tok", a).catch((x) => x);
    expect(e).toBeInstanceOf(NombreEnUso);
    expect(e.nombre).toBe("Luis");
    await expect(moverCuentaABarra("tok", "t", "Luis")).rejects.toBeInstanceOf(NombreEnUso);
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(abrirCuentaBarra("tok", a)).rejects.toThrow(new Error("boom"));
    await expect(moverCuentaAMesa("tok", "t", "m", "cl")).rejects.toThrow("boom");
  });

  it("los códigos conocidos se traducen a español", async () => {
    const { moverCuentaAMesa } = await import("../cuenta-barra");
    const casos: [string, string][] = [
      ["CUENTA_CERRADA", "Esta cuenta ya se cobró o se canceló. Actualiza la lista."],
      ["NO_ES_CUENTA_DE_BARRA", "Esta cuenta ya no está en la barra. Actualiza la lista."],
      ["NO_ES_CUENTA_DE_MESA", "Esta cuenta ya no está en una mesa. Actualiza la lista."],
      ["NOMBRE_REQUERIDO", "Escribe un nombre para la cuenta."],
    ];
    for (const [codigo, texto] of casos) {
      rpcMock.mockResolvedValue({ data: null, error: { message: codigo } });
      await expect(moverCuentaAMesa("tok", "t", "m", "cl")).rejects.toThrow(new Error(texto));
    }
  });

  it("moverCuentaAMesa y moverCuentaABarra llaman su RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { moverCuentaAMesa, moverCuentaABarra } = await import("../cuenta-barra");
    await moverCuentaAMesa("tok", "t", "m", "cl");
    await moverCuentaABarra("tok", "t", "Ana");
    expect(rpcMock).toHaveBeenNthCalledWith(1, "mover_cuenta_a_mesa", { p_ticket_id: "t", p_mesa_id: "m", p_client_id_local: "cl" });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "mover_cuenta_a_barra", { p_ticket_id: "t", p_nombre: "Ana" });
  });
});
