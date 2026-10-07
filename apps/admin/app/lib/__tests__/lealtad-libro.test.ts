import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({
  filas: [] as Fila[],
  llamadas: [] as { metodo: string; args: unknown[] }[],
  rpc: [] as { fn: string; args: Fila }[],
  rpcRespuesta: {} as Record<string, { data: unknown; error: { message: string } | null }>,
}));

// Doble que ANOTA la consulta (qué filtros se pidieron) y devuelve las filas tal cual.
function consulta(tabla: string) {
  doble.llamadas.push({ metodo: "from", args: [tabla] });
  const anota = (metodo: string) => (...args: unknown[]) => { doble.llamadas.push({ metodo, args }); return q; };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lt", "or", "order", "range", "limit"]) q[m] = anota(m);
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: doble.filas, error: null, count: doble.filas.length }).then(ok);
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: consulta,
    rpc: vi.fn(async (fn: string, args: Fila) => { doble.rpc.push({ fn, args }); return doble.rpcRespuesta[fn] ?? { data: null, error: null }; }),
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })),
}));

import {
  MOVS_POR_PAGINA, ajustarSaldo, ajusteSchema, errorDeRango, etiquetaTipo, historialCliente, hoyMexico, leerControl, leerResumen,
  listarMovimientos, rangoPorDefecto,
} from "../lealtad-libro";

const FILA = {
  id: "m1", fecha: "2026-10-06T18:00:00+00:00", tipo: "CANJE", puntos: -50, saldo_visto: 70, motivo: null,
  cliente_nombre: "Ana Gómez", cliente_telefono: "4771234567", sucursal_nombre: "Centro", usuario_nombre: "María G", ticket_folio: "KC-1",
};
const con = (metodo: string) => doble.llamadas.filter((l) => l.metodo === metodo).map((l) => l.args);

beforeEach(() => { doble.filas = []; doble.llamadas = []; doble.rpc = []; doble.rpcRespuesta = {}; });

describe("fechas del libro, en hora de México", () => {
  it("«hoy» es el día de México, no el de UTC", () => {
    expect(hoyMexico(new Date("2026-10-07T03:30:00Z"))).toBe("2026-10-06");
    expect(hoyMexico(new Date("2026-10-07T18:00:00Z"))).toBe("2026-10-07");
  });

  it("por defecto se miran los últimos 30 días, contando hoy", () => {
    expect(rangoPorDefecto(new Date("2026-10-07T18:00:00Z"))).toEqual({ desde: "2026-09-08", hasta: "2026-10-07" });
  });

  it("el rango no deja elegir el futuro ni un inicio posterior al fin, y dice por qué", () => {
    expect(errorDeRango("2026-10-01", "2026-10-07", "2026-10-07")).toBeNull();
    expect(errorDeRango("2026-10-08", "2026-10-07", "2026-10-07")).toMatch(/inicio/i);
    expect(errorDeRango("2026-10-01", "2026-10-08", "2026-10-07")).toMatch(/futuro/i);
    expect(errorDeRango("", "2026-10-07", "2026-10-07")).toMatch(/fechas/i);
  });
});

describe("el libro", () => {
  it("cada tipo de movimiento se dice en palabras del dueño", () => {
    expect(etiquetaTipo("GANADO")).toBe("Ganó");
    expect(etiquetaTipo("CANJE")).toBe("Canjeó");
    expect(etiquetaTipo("REVERSA_GANADO")).toBe("Se le quitó lo ganado");
    expect(etiquetaTipo("REVERSA_CANJE")).toBe("Canje devuelto");
    expect(etiquetaTipo("AJUSTE")).toBe("Ajuste");
    expect(etiquetaTipo("VENCIMIENTO")).toBe("Venció");
    expect(etiquetaTipo("OTRO")).toBe("OTRO");
  });

  it("filtra por el día de México completo, por sucursal, por tipo y por cliente, y pagina", async () => {
    doble.filas = [FILA];
    const r = await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: "s1", tipo: "CANJE", busqueda: "Ana 477-123", pagina: 2 });
    expect(con("from")).toEqual([["vw_lealtad_movimientos"]]);
    expect(con("gte")).toEqual([["fecha", "2026-10-01T00:00:00-06:00"]]);
    expect(con("lt")).toEqual([["fecha", "2026-10-07T00:00:00-06:00"]]);
    expect(con("eq")).toEqual([["sucursal_id", "s1"], ["tipo", "CANJE"]]);
    expect(con("or")).toEqual([["cliente_nombre.ilike.%Ana 477-123%,cliente_telefono.ilike.%477123%"]]);
    expect(con("range")).toEqual([[MOVS_POR_PAGINA, MOVS_POR_PAGINA * 2 - 1]]);
    expect(r).toEqual({
      total: 1,
      filas: [{ id: "m1", fecha: "2026-10-06T18:00:00+00:00", tipo: "CANJE", puntos: -50, saldoVisto: 70, motivo: null, cliente: "Ana Gómez", telefono: "4771234567", sucursal: "Centro", usuario: "María G", folio: "KC-1" }],
    });
  });

  it("sin sucursal, sin tipo y sin búsqueda no añade esos filtros", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: "  ", pagina: 1 });
    expect(con("eq")).toEqual([]);
    expect(con("or")).toEqual([]);
    expect(con("range")).toEqual([[0, MOVS_POR_PAGINA - 1]]);
  });

  it("los caracteres que rompen el .or() no llegan a la consulta", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: "a,b(c)%", pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%a b c%"]]);
  });

  it("comillas, diagonal inversa y comodines tampoco llegan: cada racha es un espacio y se recorta", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: 'O"B\\x*_y', pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%O B x y%"]]);
    doble.llamadas.length = 0;
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: 'O"Brien', pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%O Brien%"]]);
  });

  it("si al limpiar no queda texto no hay filtro por nombre, pero el teléfono sí cuenta con 3+ dígitos", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: '"*_"', pagina: 1 });
    expect(con("or")).toEqual([]);
    doble.llamadas.length = 0;
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: '"477_123"', pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%477 123%,cliente_telefono.ilike.%477123%"]]);
    doble.llamadas.length = 0;
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: '*"*123"', pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%123%,cliente_telefono.ilike.%123%"]]);
  });

  it("el historial de un cliente son sus últimos 30 movimientos", async () => {
    doble.filas = [FILA];
    const h = await historialCliente("c1");
    expect(con("eq")).toEqual([["cliente_id", "c1"]]);
    expect(con("limit")).toEqual([[30]]);
    expect(h[0]?.cliente).toBe("Ana Gómez");
  });
});

describe("cifras y control", () => {
  it("el resumen llega con números y nombres del lado del admin", async () => {
    doble.rpcRespuesta.lealtad_resumen = { data: { emitido: 120, canjeado: 50, saldo_vivo: 300, clientes_con_saldo: 12 }, error: null };
    expect(await leerResumen("2026-10-01", "2026-10-06", null)).toEqual({ emitido: 120, canjeado: 50, saldoVivo: 300, clientesConSaldo: 12 });
    expect(doble.rpc[0]).toEqual({ fn: "lealtad_resumen", args: { p_desde: "2026-10-01", p_hasta: "2026-10-06", p_sucursal: null } });
  });

  it("la vista de control llega lista para pintar; vacía si la base no manda nada", async () => {
    doble.rpcRespuesta.lealtad_control = { data: {
      clientes_al_tope: [{ cliente_id: "c1", cliente_nombre: "Ana Gómez", dias_al_tope: 3 }],
      cajeros: [{ usuario_id: "u9", usuario_nombre: "María G", canjes: 6, clientes: 2, puntos: 300, del_cliente_top: 5 }],
    }, error: null };
    expect(await leerControl("2026-10-01", "2026-10-06")).toEqual({
      clientesAlTope: [{ clienteId: "c1", nombre: "Ana Gómez", diasAlTope: 3 }],
      cajeros: [{ usuarioId: "u9", nombre: "María G", canjes: 6, clientes: 2, puntos: 300, delClienteTop: 5 }],
    });
    doble.rpcRespuesta.lealtad_control = { data: null, error: null };
    expect(await leerControl("2026-10-01", "2026-10-06")).toEqual({ clientesAlTope: [], cajeros: [] });
  });
});

describe("ajuste manual", () => {
  it("pide puntos enteros distintos de cero y un motivo", () => {
    expect(ajusteSchema.safeParse({ puntos: "10", motivo: "Cortesía por la espera" }).success).toBe(true);
    expect(ajusteSchema.safeParse({ puntos: "-5", motivo: "Se cargó de más" }).success).toBe(true);
    expect(ajusteSchema.safeParse({ puntos: "0", motivo: "x" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ puntos: "2.5", motivo: "x y z" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ puntos: "10", motivo: "  " }).success).toBe(false);
  });

  it("va por la función de la base y devuelve el saldo nuevo", async () => {
    doble.rpcRespuesta.lealtad_ajustar_saldo = { data: 130, error: null };
    expect(await ajustarSaldo("c1", 10, "  Cortesía por la espera ")).toBe(130);
    expect(doble.rpc[0]).toEqual({ fn: "lealtad_ajustar_saldo", args: { p_cliente_id: "c1", p_puntos: 10, p_motivo: "Cortesía por la espera" } });
  });

  it("lo que la base rechaza se dice tal cual: ya viene en palabras del dueño", async () => {
    doble.rpcRespuesta.lealtad_ajustar_saldo = { data: null, error: { message: "El ajuste dejaría el saldo en negativo." } };
    await expect(ajustarSaldo("c1", -500, "Error de captura")).rejects.toThrow("El ajuste dejaría el saldo en negativo.");
  });
});
