import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  llamadas: [] as { tabla: string; op: string; args: unknown[] }[],
  // Lo que regresa la consulta de padres y la de hijas (la que lleva .not("producto_padre_id", …)).
  padres: [] as unknown[],
  hijas: [] as unknown[],
}));
vi.mock("../supabase", () => {
  const cadena = (tabla: string) => {
    const q: Record<string, unknown> = {};
    let esHijas = false;
    const reg = (op: string) => (...args: unknown[]) => {
      h.llamadas.push({ tabla, op, args });
      if (op === "not") esHijas = true;
      return q;
    };
    for (const op of ["select", "is", "not", "eq", "order", "limit", "insert", "update", "range"]) q[op] = reg(op);
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: { id: "nuevo" }, error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: esHijas ? h.hijas : h.padres, error: null });
    return q;
  };
  return { supabase: { from: (t: string) => cadena(t) } };
});
vi.mock("../datos", () => ({ tenantId: async () => "t1", borrarSuave: async () => undefined }));

import { actualizarProducto, crearProducto, listarProductos } from "../catalogo";

const base = {
  nombre: "Gorra", categoria_id: "11111111-1111-4111-8111-111111111111", precio_base_mxn: 249, descripcion: "",
  codigo_interno: "GOR-1", estado: "ACTIVO" as const, agotado: false, visible_en_pos: true, marca_virtual_id: "",
  area_cocina_id: "", clave_sat: "", tasa_iva: 16, iva_incluido_en_precio: true, codigo_barras: "", costo_mxn: undefined,
};

describe("catálogo con tienda", () => {
  beforeEach(() => { h.llamadas.length = 0; h.padres = []; h.hijas = []; });

  it("cada padre trae los códigos de barras y SKU de sus variantes, para buscarlo por ellos", async () => {
    h.padres = [{ id: "p1", nombre: "Playera", precio_base_mxn: 349, tasa_iva: 16, categoria: null }, { id: "p2", nombre: "Gorra", precio_base_mxn: 249, tasa_iva: 16, categoria: null }];
    h.hijas = [
      { producto_padre_id: "p1", codigo_barras: "2000000000015", codigo_interno: "POL-M" },
      { producto_padre_id: "p1", codigo_barras: null, codigo_interno: "POL-G" },
    ];
    const [playera, gorra] = await listarProductos();
    expect(playera).toMatchObject({ variantes: 2, codigosVariantes: "2000000000015 POL-M POL-G" });
    expect(gorra).toMatchObject({ variantes: 0, codigosVariantes: "" });
    // La consulta de hijas se pagina (PostgREST corta en 1000 filas).
    expect(h.llamadas.some((l) => l.op === "range" && l.args[0] === 0 && l.args[1] === 999)).toBe(true);
  });

  it("actualizar sin datos de tienda no toca código de barras, costo ni existencias", async () => {
    await actualizarProducto("p1", base);
    const upd = h.llamadas.find((l) => l.op === "update")!.args[0] as Record<string, unknown>;
    expect(upd).not.toHaveProperty("codigo_barras");
    expect(upd).not.toHaveProperty("costo_mxn");
    expect(upd).not.toHaveProperty("controla_existencias");
  });

  it("la lista esconde las variantes (hijas)", async () => {
    await listarProductos();
    expect(h.llamadas.some((l) => l.tabla === "productos" && l.op === "is" && l.args[0] === "producto_padre_id" && l.args[1] === null)).toBe(true);
  });

  it("un restaurante crea exactamente lo de antes (sin campos de tienda)", async () => {
    await crearProducto(base);
    const ins = h.llamadas.find((l) => l.op === "insert")!.args[0] as Record<string, unknown>;
    expect(ins).not.toHaveProperty("codigo_barras");
    expect(ins).not.toHaveProperty("controla_existencias");
  });

  it("con tienda escribe código de barras, costo y existencias", async () => {
    await crearProducto(base, { tienda: { codigo_barras: "4006381333931", costo_mxn: 90, controla_existencias: true } });
    const ins = h.llamadas.find((l) => l.op === "insert")!.args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({ codigo_barras: "4006381333931", costo_mxn: 90, controla_existencias: true });
  });
});
