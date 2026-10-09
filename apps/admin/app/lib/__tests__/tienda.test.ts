import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
type Err = { message: string; code?: string };
const doble = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; op: string; valores: Fila; filtros: Fila; opciones?: Fila }[],
  consultas: [] as { tabla: string; columnas: string }[],
  errorEscritura: null as Err | null,
  errorLectura: null as Err | null,
  /** Simula la RLS que niega un UPDATE/UPSERT sin error: cero filas afectadas. */
  sinFilas: false,
}));

// Doble de PostgREST sobre filas en memoria (copia ampliada del de lealtad.test.ts): filtra de verdad,
// devuelve las filas escritas cuando se pide `.select()` después, y entiende `count` con `head`.
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const eqs: Fila = {};
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let valores: Fila = {};
  let opciones: Fila | undefined;
  let conteo = false;
  const resolver = () => {
    if (op !== "select") {
      doble.escrituras.push({ tabla, op, valores, filtros: { ...eqs }, ...(opciones && { opciones }) });
      if (doble.errorEscritura) return { data: null, error: doble.errorEscritura };
      if (doble.sinFilas) return { data: [], error: null };
      return { data: op === "update" ? (doble.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))) : [valores], error: null };
    }
    if (doble.errorLectura) return { data: null, error: doble.errorLectura, count: null };
    const filas = (doble.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    return conteo ? { data: null, error: null, count: filas.length } : { data: filas, error: null, count: null };
  };
  const q = {
    select: (columnas?: string, o?: { count?: string; head?: boolean }) => {
      if (op === "select") doble.consultas.push({ tabla, columnas: columnas ?? "*" });
      if (o?.head) conteo = true;
      return q;
    },
    insert: (v: Fila) => { op = "insert"; valores = v; return q; },
    update: (v: Fila) => { op = "update"; valores = v; return q; },
    upsert: (v: Fila, o?: Fila) => { op = "upsert"; valores = v; opciones = o; return q; },
    eq: (c: string, v: unknown) => { eqs[c] = v; filtros = [...filtros, (f) => f[c] === v]; return q; },
    gte: (c: string, v: number) => { filtros = [...filtros, (f) => Number(f[c]) >= v]; return q; },
    neq: (c: string, v: unknown) => { filtros = [...filtros, (f) => f[c] !== v]; return q; },
    is: (c: string, v: unknown) => { filtros = [...filtros, (f) => (f[c] ?? null) === v]; return q; },
    in: (c: string, vs: unknown[]) => { filtros = [...filtros, (f) => vs.includes(f[c])]; return q; },
    order: () => q,
    maybeSingle: async () => { const r = resolver(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
    then: (ok: (r: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, no),
  };
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: consulta,
    storage: { from: (almacen: string) => ({ getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://cdn.test/${almacen}/${ruta}` } }) }) },
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })),
}));

import {
  contarPendientesDeCatalogo, encenderTienda, guardarConfigTienda, guardarSucursalTienda, leerConfigTienda,
  leerCombosNoComprables, leerSucursalesTienda, leerTiendaEncendida,
} from "../tienda";

beforeEach(() => {
  doble.tablas = {};
  doble.escrituras = [];
  doble.consultas = [];
  doble.errorEscritura = null;
  doble.errorLectura = null;
  doble.sinFilas = false;
});

const CONFIG = {
  direccion: "knock-out", color: "#aa0000", descripcion: "Hamburguesas", aceptacion: "AUTO" as const,
  minutosAceptacion: 7, pagoEfectivo: true, pagoTarjeta: false,
};
const FILA_CONFIG = {
  tenant_id: "t1", slug: "knock-out", color: "#aa0000", descripcion: "Hamburguesas", logo_ruta: "t1/tienda/logo.png",
  aceptacion: "AUTO", minutos_aceptacion: 7, pago_efectivo: true, pago_tarjeta: false,
};

describe("leer la configuración", () => {
  it("sin fila todavía no hay tienda configurada", async () => {
    expect(await leerConfigTienda()).toBeNull();
  });

  it("convierte la fila y deriva la URL del logo de su ruta en el almacén público", async () => {
    doble.tablas.tienda_config = [FILA_CONFIG];
    expect(await leerConfigTienda()).toEqual({ ...CONFIG, logoRuta: "t1/tienda/logo.png", logoUrl: "https://cdn.test/productos/t1/tienda/logo.png" });
  });

  it("sin logo, la URL es null; una descripción nula sale vacía", async () => {
    doble.tablas.tienda_config = [{ ...FILA_CONFIG, logo_ruta: null, descripcion: null }];
    expect(await leerConfigTienda()).toMatchObject({ logoRuta: null, logoUrl: null, descripcion: "" });
  });
});

describe("guardar la configuración", () => {
  it("la primera vez inserta con el negocio, sin tocar el logo", async () => {
    await guardarConfigTienda(CONFIG, "datos");
    expect(doble.escrituras).toHaveLength(1);
    expect(doble.escrituras[0]).toMatchObject({
      tabla: "tienda_config", op: "insert",
      valores: { tenant_id: "t1", slug: "knock-out", color: "#aa0000", descripcion: "Hamburguesas", aceptacion: "AUTO", minutos_aceptacion: 7, pago_efectivo: true, pago_tarjeta: false },
    });
    expect(doble.escrituras[0]!.valores).not.toHaveProperty("logo_ruta");
  });

  it("la segunda vez actualiza solo lo suyo (el logo no se borra)", async () => {
    doble.tablas.tienda_config = [FILA_CONFIG];
    await guardarConfigTienda({ ...CONFIG, color: "#00aa00" }, "datos");
    expect(doble.escrituras).toHaveLength(1);
    expect(doble.escrituras[0]).toMatchObject({ op: "update", valores: { color: "#00aa00" }, filtros: { tenant_id: "t1" } });
    expect(doble.escrituras[0]!.valores).not.toHaveProperty("logo_ruta");
  });

  // Dos pestañas (o dos administradores): cada bloque manda solo sus columnas, así una memoria vieja
  // no pisa lo que se guardó en el otro bloque desde otro lado.
  it("«Tu tienda» actualiza dirección, color y descripción, y no nombra las columnas de «Pedidos»", async () => {
    doble.tablas.tienda_config = [FILA_CONFIG];
    await guardarConfigTienda({ ...CONFIG, direccion: "ko-burger", aceptacion: "MANUAL", minutosAceptacion: 3, pagoTarjeta: true }, "datos");
    expect(doble.escrituras[0]).toMatchObject({ op: "update", valores: { slug: "ko-burger", color: "#aa0000", descripcion: "Hamburguesas" } });
    expect(Object.keys(doble.escrituras[0]!.valores).sort()).toEqual(["color", "descripcion", "slug", "updated_at"]);
  });

  it("«Pedidos» actualiza aceptación, minutos y pagos, y no nombra las columnas de «Tu tienda»", async () => {
    doble.tablas.tienda_config = [FILA_CONFIG];
    await guardarConfigTienda({ ...CONFIG, direccion: "memoria-vieja", color: "#000000", descripcion: "vieja", aceptacion: "MANUAL", minutosAceptacion: 9, pagoTarjeta: true }, "pedidos");
    expect(doble.escrituras[0]).toMatchObject({ op: "update", valores: { aceptacion: "MANUAL", minutos_aceptacion: 9, pago_efectivo: true, pago_tarjeta: true } });
    expect(Object.keys(doble.escrituras[0]!.valores).sort()).toEqual(["aceptacion", "minutos_aceptacion", "pago_efectivo", "pago_tarjeta", "updated_at"]);
  });

  it("el primer guardado manda todo, sea del bloque que sea: la fila nace completa", async () => {
    await guardarConfigTienda(CONFIG, "pedidos");
    expect(doble.escrituras[0]!.op).toBe("insert");
    expect(Object.keys(doble.escrituras[0]!.valores).sort()).toEqual(
      ["aceptacion", "color", "descripcion", "minutos_aceptacion", "pago_efectivo", "pago_tarjeta", "slug", "tenant_id"]);
  });

  it("una descripción vacía se guarda como NULL", async () => {
    await guardarConfigTienda({ ...CONFIG, descripcion: "" }, "datos");
    expect(doble.escrituras[0]!.valores.descripcion).toBeNull();
  });

  it("una dirección tomada dice que la usa otro negocio", async () => {
    doble.errorEscritura = { message: 'duplicate key value violates unique constraint "tienda_config_slug_key"', code: "23505" };
    await expect(guardarConfigTienda(CONFIG, "datos")).rejects.toThrow("Esa dirección ya la usa otro negocio. Prueba con otra.");
  });

  it("un rechazo de RLS dice que solo el dueño o un administrador", async () => {
    doble.errorEscritura = { message: 'new row violates row-level security policy for table "tienda_config"', code: "42501" };
    await expect(guardarConfigTienda(CONFIG, "datos")).rejects.toThrow("Solo el dueño o un administrador puede cambiar esto.");
  });

  it("un UPDATE que afecta cero filas (RLS sin error) también lo dice", async () => {
    doble.tablas.tienda_config = [FILA_CONFIG];
    doble.sinFilas = true;
    await expect(guardarConfigTienda(CONFIG, "datos")).rejects.toThrow("Solo el dueño o un administrador puede cambiar esto.");
    await expect(guardarConfigTienda(CONFIG, "pedidos")).rejects.toThrow("Solo el dueño o un administrador puede cambiar esto.");
  });

  it.each([
    ["minutos 2", { minutosAceptacion: 2 }, /minutos/i],
    ["minutos 16", { minutosAceptacion: 16 }, /minutos/i],
    ["minutos con decimales", { minutosAceptacion: 5.5 }, /minutos/i],
    ["sin formas de pago", { pagoEfectivo: false, pagoTarjeta: false }, /forma de pago/i],
    ["dirección reservada", { direccion: "admin" }, /reservada/i],
    ["dirección con mayúsculas", { direccion: "Knock" }, /Usa solo letras, números y guiones/],
    ["color sin #", { color: "aa0000" }, /color/i],
    ["descripción de 201 caracteres", { descripcion: "x".repeat(201) }, /200/],
  ])("%s no llega a la base", async (_n, cambio, mensaje) => {
    await expect(guardarConfigTienda({ ...CONFIG, ...cambio }, "datos")).rejects.toThrow(mensaje);
    await expect(guardarConfigTienda({ ...CONFIG, ...cambio }, "pedidos")).rejects.toThrow(mensaje);
    expect(doble.escrituras).toEqual([]);
    expect(doble.consultas).toEqual([]);
  });
});

describe("sucursales de la tienda", () => {
  beforeEach(() => {
    doble.tablas.sucursales = [
      { id: "s1", nombre: "Centro", telefono: "477 111", activa: true, deleted_at: null },
      { id: "s2", nombre: "Norte", telefono: null, activa: false, deleted_at: null },
      { id: "s3", nombre: "Cerrada", telefono: "1", activa: true, deleted_at: "2026-01-01" },
    ];
    doble.tablas.tienda_sucursales = [
      { sucursal_id: "s1", tenant_id: "t1", participa: true, recoger: false, domicilio: true, horario: { "1": ["09:00", "22:00"], "9": ["x", "y"] }, pausa_hasta: null },
    ];
    doble.tablas.zonas_envio = [
      { sucursal_id: "s1", activa: true, deleted_at: null },
      { sucursal_id: "s1", activa: true, deleted_at: null },
      { sucursal_id: "s1", activa: false, deleted_at: null },
      { sucursal_id: "s1", activa: true, deleted_at: "2026-02-01" },
      { sucursal_id: "s2", activa: true, deleted_at: null },
    ];
  });

  it("lista las sucursales vivas; sin fila de tienda salen los valores por omisión", async () => {
    expect(await leerSucursalesTienda()).toEqual([
      { id: "s1", nombre: "Centro", telefono: "477 111", activa: true, participa: true, recoger: false, domicilio: true, horario: { "1": ["09:00", "22:00"] }, zonasActivas: 2 },
      { id: "s2", nombre: "Norte", telefono: "", activa: false, participa: false, recoger: true, domicilio: false, horario: {}, zonasActivas: 1 },
    ]);
  });

  it("cuenta las zonas con UNA sola consulta, no una por sucursal", async () => {
    await leerSucursalesTienda();
    expect(doble.consultas.filter((c) => c.tabla === "zonas_envio")).toHaveLength(1);
  });

  it("guarda con upsert por sucursal, con el negocio, sin tocar la pausa", async () => {
    const horario = { "1": ["09:00", "22:00"] as [string, string] };
    await guardarSucursalTienda("s1", { participa: true, recoger: true, domicilio: false, horario });
    expect(doble.escrituras[0]).toMatchObject({
      tabla: "tienda_sucursales", op: "upsert", opciones: { onConflict: "sucursal_id" },
      valores: { sucursal_id: "s1", tenant_id: "t1", participa: true, recoger: true, domicilio: false, horario },
    });
    expect(doble.escrituras[0]!.valores).not.toHaveProperty("pausa_hasta");
  });

  it("un horario mal escrito no llega a la base", async () => {
    await expect(guardarSucursalTienda("s1", { participa: true, recoger: true, domicilio: false, horario: { "1": ["9:00", "22:00"] } }))
      .rejects.toThrow(/Lunes: escribe las horas/);
    expect(doble.escrituras).toEqual([]);
  });

  it("una escritura que afecta cero filas dice que solo el dueño o un administrador", async () => {
    doble.sinFilas = true;
    await expect(guardarSucursalTienda("s1", { participa: false, recoger: true, domicilio: false, horario: {} }))
      .rejects.toThrow("Solo el dueño o un administrador puede cambiar esto.");
  });
});

describe("el interruptor", () => {
  it("enciende con un upsert de modulo_tienda_activo sobre la configuración del negocio", async () => {
    await encenderTienda(true);
    expect(doble.escrituras[0]).toMatchObject({
      tabla: "configuracion_tenant", op: "upsert", opciones: { onConflict: "tenant_id" },
      valores: { tenant_id: "t1", modulo_tienda_activo: true },
    });
  });

  it("SIN_TIENDA_CONFIGURADA se dice en palabras del dueño", async () => {
    doble.errorEscritura = { message: "SIN_TIENDA_CONFIGURADA", code: "22023" };
    await expect(encenderTienda(true)).rejects.toThrow("Primero guarda la dirección de tu tienda.");
  });

  it("lee el interruptor crudo del negocio; sin fila está apagado", async () => {
    doble.tablas.configuracion_tenant = [{ tenant_id: "t2", modulo_tienda_activo: true }];
    expect(await leerTiendaEncendida()).toBe(false);
    doble.tablas.configuracion_tenant = [{ tenant_id: "t1", modulo_tienda_activo: true }];
    expect(await leerTiendaEncendida()).toBe(true);
  });
});

describe("pendientes del catálogo", () => {
  it("cuenta solo productos vivos, visibles y no pausados", async () => {
    doble.tablas.categorias = [
      { id: "c1", activa: true, deleted_at: null },
      { id: "c2", activa: false, deleted_at: null },
      { id: "c3", activa: true, deleted_at: "2026-01-01" },
    ];
    const p = (o: Fila): Fila => ({ deleted_at: null, visible_en_pos: true, estado: "ACTIVO", categoria_id: "c1", imagen_url: "x.png", descripcion: "ok", ...o });
    doble.tablas.productos = [
      p({}),
      p({ imagen_url: null }),
      p({ imagen_url: null, descripcion: null }),
      p({ descripcion: null, categoria_id: "c2" }),
      p({ categoria_id: "c3" }),
      p({ imagen_url: null, estado: "PAUSADO" }),
      p({ imagen_url: null, visible_en_pos: false }),
      p({ imagen_url: null, deleted_at: "2026-03-01" }),
    ];
    expect(await contarPendientesDeCatalogo()).toEqual({ sinFoto: 2, sinDescripcion: 2, enCategoriaInactiva: 2 });
  });

  it("sin categorías inactivas el conteo es 0", async () => {
    doble.tablas.categorias = [{ id: "c1", activa: true, deleted_at: null }];
    doble.tablas.productos = [{ deleted_at: null, visible_en_pos: true, estado: "ACTIVO", categoria_id: "c1", imagen_url: "x", descripcion: "x" }];
    expect(await contarPendientesDeCatalogo()).toEqual({ sinFoto: 0, sinDescripcion: 0, enCategoriaInactiva: 0 });
  });
});

describe("combos que la tienda no puede vender", () => {
  const prod = (id: string, nombre: string, extra: Fila = {}) => ({ id, nombre, categoria_id: "c1", es_combo: false, visible_en_pos: true, estado: "ACTIVO", deleted_at: null, ...extra });
  const paso = (id: string, nombre: string, extra: Fila = {}) => ({ id, combo_producto_id: "k1", nombre, categoria_id: null, activo: true, minimo_selecciones: 1, deleted_at: null, ...extra });
  const opc = (grupo_id: string, producto_id: string, activa = true) => ({ grupo_id, producto_id, activa, deleted_at: null });

  it("dos pasos obligatorios con el mismo único producto salen avisados, con el nombre del combo", async () => {
    doble.tablas.productos = [prod("k1", "Combo Doble", { es_combo: true }), prod("p1", "Refresco")];
    doble.tablas.combo_grupos = [paso("g1", "Bebida"), paso("g2", "Extra")];
    doble.tablas.combo_opciones = [opc("g1", "p1"), opc("g2", "p1")];
    expect(await leerCombosNoComprables()).toEqual([{ combo: "Combo Doble", producto: "Refresco", pasos: ["Bebida", "Extra"] }]);
  });

  it("un paso por categoría admite todos los productos de la categoría menos los excluidos y los pausados", async () => {
    doble.tablas.productos = [
      prod("k1", "Combo", { es_combo: true }), prod("p1", "Refresco"), prod("p2", "Agua"), prod("p3", "Té", { estado: "PAUSADO" }), prod("p4", "Jugo"),
    ];
    doble.tablas.combo_grupos = [paso("g1", "Bebida", { categoria_id: "c1" }), paso("g2", "Extra")];
    doble.tablas.combo_opciones = [opc("g1", "p2", false), opc("g1", "p4", false), opc("g2", "p1")];
    // Bebida queda solo con Refresco y Extra también: no se pueden llenar los dos pasos.
    expect(await leerCombosNoComprables()).toEqual([{ combo: "Combo", producto: "Refresco", pasos: ["Bebida", "Extra"] }]);
  });

  it("un combo sano, un paso opcional o uno borrado no avisan", async () => {
    doble.tablas.productos = [prod("k1", "Combo", { es_combo: true }), prod("p1", "Refresco"), prod("p2", "Agua")];
    doble.tablas.combo_grupos = [paso("g1", "Bebida"), paso("g2", "Extra", { minimo_selecciones: 0 }), paso("g3", "Otro", { deleted_at: "2026-01-01" })];
    doble.tablas.combo_opciones = [opc("g1", "p1"), opc("g2", "p1"), opc("g3", "p1")];
    expect(await leerCombosNoComprables()).toEqual([]);
  });

  it("si la consulta falla, lanza (quien llama decide que el aviso no rompe la página)", async () => {
    doble.errorLectura = { message: "boom" };
    await expect(leerCombosNoComprables()).rejects.toThrow();
  });
});
