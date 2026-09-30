import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("../supabase", () => ({ deviceClient: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { leerSoporte } from "../soporte";

const respuesta = (cuerpo: unknown, ok = true) => ({ ok, json: async () => cuerpo }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  rpc.mockReset();
});

describe("soporte que ve el cajero (0142)", () => {
  it("en la caja usa lo que trajo el último latido, con la versión instalada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({
      disponible: true,
      directivas: { soporte: { whatsapp: "5214771234567", horario: "10 a 20" }, version: { instalada: "0.4.99" } },
    })));
    const r = await leerSoporte();
    expect(r.soporte.whatsapp).toBe("5214771234567");
    expect(r.version).toBe("0.4.99");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("en el POS web pregunta a la nube por la RPC", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no existe"); }));
    rpc.mockResolvedValue({ data: [{ whatsapp: "5215555555555", horario: null, correo: null }], error: null });
    const r = await leerSoporte();
    expect(rpc).toHaveBeenCalledWith("soporte_plataforma");
    expect(r.soporte.whatsapp).toBe("5215555555555");
    expect(r.version).toBeNull();
  });

  it("sin caja, sin red y sin sesión: el número oficial de VIM", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({}, false)));
    rpc.mockRejectedValue(new Error("sin red"));
    const r = await leerSoporte();
    expect(r.soporte.whatsapp).toBe("525665083346");
    expect(r.soporte.horario).toBe("9:00 a 18:00");
  });

  it("una caja que todavía no latió cae a la RPC (el Postgres local trae la fila de fábrica)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({ disponible: true, directivas: { soporte: null } })));
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await leerSoporte();
    expect(r.soporte.whatsapp).toBe("525665083346");
  });
});
