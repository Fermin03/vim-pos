import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  rpc: [] as { fn: string; args: Fila }[],
  rpcRespuesta: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  escrituras: [] as { tabla: string; op: string; valores: Fila; filtros: Fila }[],
  errorEscritura: null as { message: string; code?: string } | null,
}));

// Doble de PostgREST sobre filas en memoria: filtra de verdad y anota cada escritura.
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const eqs: Fila = {};
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let valores: Fila = {};
  const resolver = () => {
    if (op !== "select") {
      doble.escrituras.push({ tabla, op, valores, filtros: { ...eqs } });
      return { data: null, error: doble.errorEscritura };
    }
    return { data: (doble.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null };
  };
  const q = {
    select: () => q,
    insert: (v: Fila) => { op = "insert"; valores = v; return q; },
    update: (v: Fila) => { op = "update"; valores = v; return q; },
    upsert: (v: Fila) => { op = "upsert"; valores = v; return q; },
    eq: (c: string, v: unknown) => { eqs[c] = v; filtros = [...filtros, (f) => f[c] === v]; return q; },
    is: (c: string, v: unknown) => { filtros = [...filtros, (f) => (f[c] ?? null) === v]; return q; },
    order: () => q,
    maybeSingle: async () => { const r = resolver(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: consulta,
    rpc: vi.fn(async (fn: string, args: Fila) => {
      doble.rpc.push({ fn, args });
      return doble.rpcRespuesta[fn] ?? { data: null, error: null };
    }),
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })),
}));

import {
  FORM_PROGRAMA_INICIAL, activarModuloLealtad, cambiarCostoPremio, costoPremioSchema, crearPremio, ejemploPrograma,
  eliminarPremio, formDePrograma, guardarPrograma, leerProgramaAdmin, listarPremios, mensajeLealtad, productosParaPremio,
  programaSchema, setActivoPremio,
} from "../lealtad";
import { estadoLealtad, mensajeQuieroLealtad } from "../lealtad-plan";

beforeEach(() => {
  doble.tablas = {};
  doble.rpc = [];
  doble.rpcRespuesta = {};
  doble.escrituras = [];
  doble.errorEscritura = null;
});

const DINERO = { ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_DINERO" as const, porcentaje: "5" };

describe("el formulario del programa", () => {
  it("acepta cada mecánica con lo suyo y rechaza lo que le falta", () => {
    expect(programaSchema.safeParse(DINERO).success).toBe(true);
    expect(programaSchema.safeParse({ ...DINERO, porcentaje: "" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, porcentaje: "51" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" }).success).toBe(true);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "10" }).success).toBe(true);
  });

  it("el vencimiento vacío es «sin vencimiento»; con número, de 1 a 60 meses", () => {
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "" }).success).toBe(true);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "0" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "61" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "6" }).success).toBe(true);
  });

  it("el tope de compras por día va de 1 a 50", () => {
    expect(programaSchema.safeParse({ ...DINERO, topeComprasDia: "0" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, topeComprasDia: "51" }).success).toBe(false);
  });
});

describe("el ejemplo en vivo", () => {
  it("puntos por dinero: dice cuánto gana y cuánto vale", () => {
    expect(ejemploPrograma(DINERO)).toBe("Una compra de $200 gana 10 puntos, que valen $10 en su siguiente visita.");
  });

  it("con compra mínima, el ejemplo usa una compra que sí gana", () => {
    expect(ejemploPrograma({ ...DINERO, compraMinima: "300" })).toBe("Una compra de $300 gana 15 puntos, que valen $15 en su siguiente visita.");
  });

  it("sellos: uno por visita", () => {
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" })).toBe("Cada visita gana 1 sello, sin importar cuánto consuma.");
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS", compraMinima: "100" })).toBe("Cada visita de $100 o más gana 1 sello.");
  });

  it("puntos con premios: cuántos puntos da la compra del ejemplo", () => {
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "10" }))
      .toBe("Una compra de $200 gana 20 puntos, que se cambian por los premios que definas.");
  });

  it("sin el dato de la mecánica no hay ejemplo que dar", () => {
    expect(ejemploPrograma({ ...DINERO, porcentaje: "" })).toBeNull();
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "0" })).toBeNull();
  });
});

describe("leer y guardar el programa", () => {
  it("lee el programa con números y lo convierte al formulario", async () => {
    doble.tablas.lealtad_programa = [{ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: "5.00", pesos_por_punto: null, compra_minima_mxn: "0.00", vencimiento_meses: 6, tope_compras_dia: 3 }];
    const p = await leerProgramaAdmin();
    expect(p).toEqual({ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 0, vencimientoMeses: 6, topeComprasDia: 3 });
    expect(formDePrograma(p!)).toEqual({ mecanica: "PUNTOS_DINERO", porcentaje: "5", pesosPorPunto: "", compraMinima: "0", vencimientoMeses: "6", topeComprasDia: "3" });
  });

  it("sin programa devuelve null", async () => {
    doble.tablas.lealtad_programa = [];
    expect(await leerProgramaAdmin()).toBeNull();
  });

  it("guarda por la función de la base, mandando NULL lo que no aplica a la mecánica", async () => {
    doble.rpcRespuesta.lealtad_guardar_programa = { data: { ok: true, version: 1, clientes_reiniciados: 0 }, error: null };
    const r = await guardarPrograma({ ...DINERO, pesosPorPunto: "10", vencimientoMeses: "" }, false);
    expect(r).toEqual({ ok: true, version: 1, clientesReiniciados: 0 });
    expect(doble.rpc[0]).toEqual({
      fn: "lealtad_guardar_programa",
      args: { p_mecanica: "PUNTOS_DINERO", p_porcentaje: 5, p_pesos_por_punto: null, p_compra_minima_mxn: 0, p_vencimiento_meses: null, p_tope_compras_dia: 3, p_confirmar_reinicio: false },
    });
  });

  it("si cambiar de mecánica borraría saldos, no guarda: devuelve a cuántos clientes afecta", async () => {
    doble.rpcRespuesta.lealtad_guardar_programa = { data: { ok: false, error: "REQUIERE_CONFIRMAR_REINICIO", clientes_con_saldo: 37 }, error: null };
    expect(await guardarPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" }, false)).toEqual({ ok: false, clientesConSaldo: 37 });
  });

  it("un formulario inválido no llega a la base", async () => {
    await expect(guardarPrograma({ ...DINERO, porcentaje: "" }, false)).rejects.toThrow(/porcentaje/i);
    expect(doble.rpc).toEqual([]);
  });
});

describe("el interruptor", () => {
  it("enciende con un upsert sobre la configuración del negocio", async () => {
    await activarModuloLealtad(true);
    expect(doble.escrituras[0]).toMatchObject({ tabla: "configuracion_tenant", op: "upsert", valores: { tenant_id: "t1", modulo_lealtad_activo: true } });
  });

  it("los rechazos de la base se dicen en palabras del dueño", async () => {
    doble.errorEscritura = { message: "SIN_PROGRAMA_LEALTAD", code: "22023" };
    await expect(activarModuloLealtad(true)).rejects.toThrow("Primero guarda tu programa: elige cómo ganan tus clientes.");
    doble.errorEscritura = { message: "SIN_ADDON_LEALTAD", code: "42501" };
    await expect(activarModuloLealtad(true)).rejects.toThrow(/no está incluido/i);
  });
});

describe("premios", () => {
  beforeEach(() => {
    doble.tablas.lealtad_premios = [
      { id: "pr-1", costo: 6, activo: true, deleted_at: null, producto: { id: "p-1", nombre: "Hamburguesa", precio_base_mxn: "120.00", estado: "ACTIVO", deleted_at: null } },
      { id: "pr-2", costo: 3, activo: false, deleted_at: null, producto: { id: "p-2", nombre: "Refresco", precio_base_mxn: "35.00", estado: "PAUSADO", deleted_at: null } },
      { id: "pr-3", costo: 9, activo: true, deleted_at: "2026-10-01", producto: { id: "p-3", nombre: "Malteada", precio_base_mxn: "70.00", estado: "ACTIVO", deleted_at: null } },
    ];
    doble.tablas.productos = [
      { id: "p-1", nombre: "Hamburguesa", precio_base_mxn: "120.00", es_combo: false, estado: "ACTIVO", deleted_at: null },
      { id: "p-4", nombre: "Papas", precio_base_mxn: "55.00", es_combo: false, estado: "ACTIVO", deleted_at: null },
      { id: "p-5", nombre: "Combo Clásico", precio_base_mxn: "150.00", es_combo: true, estado: "ACTIVO", deleted_at: null },
      { id: "p-6", nombre: "Pausado", precio_base_mxn: "10.00", es_combo: false, estado: "PAUSADO", deleted_at: null },
    ];
  });

  it("lista los premios vivos, y marca los que tienen su producto pausado", async () => {
    expect(await listarPremios()).toEqual([
      { id: "pr-2", productoId: "p-2", nombre: "Refresco", precio: 35, costo: 3, activo: false, productoDisponible: false },
      { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", precio: 120, costo: 6, activo: true, productoDisponible: true },
    ]);
  });

  it("para premio solo se ofrecen productos activos, que no son combo y que no son ya un premio", async () => {
    expect(await productosParaPremio()).toEqual([{ id: "p-4", nombre: "Papas", precio: 55 }]);
  });

  it("el costo es un entero de 1 en adelante", () => {
    expect(costoPremioSchema.safeParse("6").success).toBe(true);
    expect(costoPremioSchema.safeParse("0").success).toBe(false);
    expect(costoPremioSchema.safeParse("2.5").success).toBe(false);
    expect(costoPremioSchema.safeParse("").success).toBe(false);
  });

  it("crear, cambiar el costo, pausar y eliminar escriben lo que deben", async () => {
    await crearPremio("p-4", 5);
    await cambiarCostoPremio("pr-1", 8);
    await setActivoPremio("pr-1", false);
    await eliminarPremio("pr-1");
    expect(doble.escrituras[0]).toMatchObject({ tabla: "lealtad_premios", op: "insert", valores: { tenant_id: "t1", producto_id: "p-4", costo: 5 } });
    expect(doble.escrituras[1]).toMatchObject({ op: "update", valores: { costo: 8 }, filtros: { id: "pr-1" } });
    expect(doble.escrituras[2]).toMatchObject({ op: "update", valores: { activo: false }, filtros: { id: "pr-1" } });
    expect(doble.escrituras[3]!.valores).toMatchObject({ activo: false });
    expect(typeof doble.escrituras[3]!.valores.deleted_at).toBe("string");
  });

  it("un producto que ya es premio se dice así, no con el nombre del índice", async () => {
    doble.errorEscritura = { message: 'duplicate key value violates unique constraint "lealtad_premios_producto_uq"', code: "23505" };
    await expect(crearPremio("p-1", 5)).rejects.toThrow("Ese producto ya es un premio.");
  });
});

describe("mensajes y estado de la sección", () => {
  it("a quien no es dueño ni administrador se le dice eso, no el rechazo de la base", () => {
    expect(mensajeLealtad({ message: "new row violates row-level security policy", code: "42501" }, "x"))
      .toBe("Solo el dueño o un administrador puede cambiar la lealtad.");
    expect(mensajeLealtad(new Error("El porcentaje de puntos debe ser mayor que 0 y de máximo 50."), "x"))
      .toBe("El porcentaje de puntos debe ser mayor que 0 y de máximo 50.");
    expect(mensajeLealtad(null, "No se pudo guardar")).toBe("No se pudo guardar");
  });

  it("la sección se enseña si está permitida; si la lectura de módulos falla, también", () => {
    expect(estadoLealtad(null)).toBe("cargando");
    expect(estadoLealtad("error")).toBe("permitida");
    expect(estadoLealtad({ permitidos: { lealtad: true }, efectivos: {} })).toBe("permitida");
    expect(estadoLealtad({ permitidos: { lealtad: false }, efectivos: {} })).toBe("sin_contratar");
    expect(estadoLealtad({ permitidos: {}, efectivos: {} })).toBe("sin_contratar");
  });

  it("el mensaje de WhatsApp ya dice qué se quiere", () => {
    expect(mensajeQuieroLealtad({ usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" })).toMatch(/Quiero activar el programa de lealtad\.$/);
  });
});
