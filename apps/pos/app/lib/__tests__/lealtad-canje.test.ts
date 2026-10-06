import { beforeEach, describe, expect, it } from "vitest";
import {
  avanzarCanje, borrarPendiente, guardarPendiente, leerPendiente, nuevoCanjeDinero, nuevoCanjePremio,
  type Almacen, type OpsCanje, type Pendiente,
} from "../lealtad-canje";

function memoria(): Almacen & { crudo: Map<string, string> } {
  const crudo = new Map<string, string>();
  return { crudo, getItem: (k) => crudo.get(k) ?? null, setItem: (k, v) => { crudo.set(k, v); } };
}

const ANA = { clienteId: "c-1", nombre: "Ana Gómez", telefono: "4771234567" };
const HAMBURGUESA = { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", costo: 6 };

type Guion = {
  agregar?: () => Promise<string>;
  canjear?: () => Awaited<ReturnType<OpsCanje["canjear"]>>;
  asentar?: () => Awaited<ReturnType<OpsCanje["asentar"]>>;
  cancelar?: () => Promise<void>;
};

/** Operaciones de mentira que anotan en qué orden se llamaron y con qué. */
function ops(g: Guion = {}) {
  const llamadas: [string, unknown][] = [];
  const o: OpsCanje = {
    agregarRenglon: async (a) => { llamadas.push(["agregar", a]); return g.agregar ? g.agregar() : "it-9"; },
    canjear: async (a) => {
      llamadas.push(["canjear", a]);
      return g.canjear ? g.canjear() : { ok: true, canje_id: a.canjeId, puntos: a.puntos ?? 6, monto_mxn: a.puntos ?? null, premio_id: a.premioId ?? null, producto_id: null, saldo: 0, repetido: false };
    },
    asentar: async (a) => { llamadas.push(["asentar", a]); return g.asentar ? g.asentar() : { ok: true, canje_id: a.canjeId }; },
    cancelarRenglon: async (id) => { llamadas.push(["cancelar", id]); if (g.cancelar) await g.cancelar(); },
  };
  return { o, llamadas, nombres: () => llamadas.map((l) => l[0]) };
}

let alm: ReturnType<typeof memoria>;
let dinero: Pendiente;
let premio: Pendiente;

beforeEach(() => {
  alm = memoria();
  dinero = nuevoCanjeDinero({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 50 });
  premio = nuevoCanjePremio({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "SELLOS", premio: HAMBURGUESA });
});

describe("canje de dinero", () => {
  it("camino feliz: la nube descuenta, la cuenta lo asienta, y no queda nada pendiente", async () => {
    const t = ops();
    expect(await avanzarCanje(t.o, alm, dinero)).toEqual({ estado: "APLICADO" });
    expect(t.nombres()).toEqual(["canjear", "asentar"]);
    expect(t.llamadas[0][1]).toEqual({ canjeId: dinero.canjeId, ticketId: "tk-1", clienteId: "c-1", telefono: "4771234567", puntos: 50, sucursalId: "s-1" });
    expect(t.llamadas[1][1]).toEqual({ canjeId: dinero.canjeId, ticketId: "tk-1", ticketItemId: null });
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("la nube lo rechaza: no se descontó nada, no se asienta y no queda pendiente", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SALDO_INSUFICIENTE", saldo: 12 }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("RECHAZADO");
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/No se descontó nada/);
    expect(t.nombres()).toEqual(["canjear"]);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("sin red al canjear: queda a medias, y el reintento usa el MISMO canje", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("A_MEDIAS");
    const guardado = leerPendiente(alm, "tk-1");
    expect(guardado).toMatchObject({ canjeId: dinero.canjeId, paso: "CANJEAR" });

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado as Pendiente)).toEqual({ estado: "APLICADO" });
    expect((t2.llamadas[0][1] as { canjeId: string }).canjeId).toBe(dinero.canjeId);
  });

  it("sin red al asentar: queda a medias en ASENTAR, y el reintento ya no vuelve a canjear", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("A_MEDIAS");
    expect(r.estado === "A_MEDIAS" && r.mensaje).toMatch(/no se descuentan dos veces/);
    const guardado = leerPendiente(alm, "tk-1") as Pendiente;
    expect(guardado.paso).toBe("ASENTAR");

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado)).toEqual({ estado: "APLICADO" });
    expect(t2.nombres()).toEqual(["asentar"]);
  });

  it.each(["FUNCION_REQUIERE_NUBE", "SOLO_EMPLEADO", "AUTH_INVALIDA", "HTTP_502"])(
    "asentar con %s se puede reintentar: no se dan los puntos por perdidos", async (codigo) => {
      const t = ops({ asentar: () => ({ ok: false, error: codigo }) });
      expect((await avanzarCanje(t.o, alm, dinero)).estado).toBe("A_MEDIAS");
      expect(leerPendiente(alm, "tk-1")?.paso).toBe("ASENTAR");
    });

  it("la cuenta rechaza el asiento para siempre: lo dice claro, con las 48 horas, y limpia", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "TICKET_NO_ABIERTO" }) });
    const r = await avanzarCanje(t.o, alm, dinero);
    expect(r.estado).toBe("PUNTOS_GASTADOS");
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/50 puntos/);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/48 horas/);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("FUNCION_REQUIERE_NUBE al canjear es un rechazo limpio: la caja ni lo mandó", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "FUNCION_REQUIERE_NUBE" }) });
    expect((await avanzarCanje(t.o, alm, dinero)).estado).toBe("RECHAZADO");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });
});

describe("canje de premio", () => {
  it("camino feliz: renglón, canje con el premio (sin puntos) y asiento sobre ESE renglón", async () => {
    const t = ops();
    expect(await avanzarCanje(t.o, alm, premio)).toEqual({ estado: "APLICADO" });
    expect(t.nombres()).toEqual(["agregar", "canjear", "asentar"]);
    expect(t.llamadas[0][1]).toEqual({ ticketId: "tk-1", productoId: "p-1", clientId: premio.premio?.renglonClientId });
    expect(t.llamadas[1][1]).toEqual({ canjeId: premio.canjeId, ticketId: "tk-1", clienteId: "c-1", telefono: "4771234567", premioId: "pr-1", sucursalId: "s-1" });
    expect(t.llamadas[2][1]).toEqual({ canjeId: premio.canjeId, ticketId: "tk-1", ticketItemId: "it-9" });
  });

  it("si el renglón no entra, no se llama a la nube: no se descontó nada", async () => {
    const t = ops({ agregar: async () => { throw new Error("Producto agotado"); } });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado).toBe("RECHAZADO");
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/Producto agotado/);
    expect(t.nombres()).toEqual(["agregar"]);
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("la nube rechaza el premio: el renglón se cancela solo y la cuenta queda como estaba", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "PREMIO_INVALIDO" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(t.nombres()).toEqual(["agregar", "canjear", "cancelar"]);
    expect(t.llamadas[2][1]).toBe("it-9");
    expect(r.estado === "RECHAZADO" && r.mensaje).not.toMatch(/quedó en la cuenta/);
  });

  it("si el renglón no se pudo cancelar (ya está en cocina), avisa que se quedó a su precio", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SALDO_INSUFICIENTE" }), cancelar: async () => { throw new Error("requiere PIN"); } });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "RECHAZADO" && r.mensaje).toMatch(/Hamburguesa quedó en la cuenta a su precio/);
  });

  it("sin red al canjear: a medias, con el renglón ya anotado para no agregarlo dos veces", async () => {
    const t = ops({ canjear: () => ({ ok: false, error: "SIN_RED" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "A_MEDIAS" && r.mensaje).toMatch(/Hamburguesa/);
    const guardado = leerPendiente(alm, "tk-1") as Pendiente;
    expect(guardado.premio?.ticketItemId).toBe("it-9");

    const t2 = ops();
    expect(await avanzarCanje(t2.o, alm, guardado)).toEqual({ estado: "APLICADO" });
    expect(t2.nombres()).toEqual(["canjear", "asentar"]);
  });

  it("puntos gastados en un premio: además dice que el producto quedó a su precio", async () => {
    const t = ops({ asentar: () => ({ ok: false, error: "RENGLON_NO_ES_PREMIO" }) });
    const r = await avanzarCanje(t.o, alm, premio);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/6 sellos/);
    expect(r.estado === "PUNTOS_GASTADOS" && r.mensaje).toMatch(/Hamburguesa quedó en la cuenta a su precio/);
  });
});

describe("el canje pendiente guardado", () => {
  it("se guarda por cuenta y no se mezcla con el de otra", () => {
    guardarPendiente(alm, dinero);
    guardarPendiente(alm, { ...premio, ticketId: "tk-2" });
    expect(leerPendiente(alm, "tk-1")?.canjeId).toBe(dinero.canjeId);
    expect(leerPendiente(alm, "tk-2")?.canjeId).toBe(premio.canjeId);
    borrarPendiente(alm, "tk-1");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
    expect(leerPendiente(alm, "tk-2")).not.toBeNull();
  });

  it("basura en el almacén no truena ni se toma por un canje", () => {
    alm.setItem("vim_lealtad_pendiente", "{no es json");
    expect(leerPendiente(alm, "tk-1")).toBeNull();
    alm.setItem("vim_lealtad_pendiente", JSON.stringify({ "tk-1": { canjeId: 7 } }));
    expect(leerPendiente(alm, "tk-1")).toBeNull();
  });

  it("cada canje nuevo nace con su propio id (un uuid) y en el paso CANJEAR", () => {
    const otro = nuevoCanjeDinero({ ticketId: "tk-1", sucursalId: "s-1", cliente: ANA, mecanica: "PUNTOS_DINERO", puntos: 50 });
    expect(otro.canjeId).not.toBe(dinero.canjeId);
    expect(dinero.canjeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(dinero).toMatchObject({ paso: "CANJEAR", premio: null, puntos: 50 });
    expect(premio).toMatchObject({ paso: "CANJEAR", puntos: 6, premio: { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", ticketItemId: null } });
  });
});
