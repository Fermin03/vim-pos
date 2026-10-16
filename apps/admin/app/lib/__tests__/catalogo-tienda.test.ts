import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ llamadas: [] as { tabla: string; op: string; args: unknown[] }[] }));
vi.mock("../supabase", () => {
  const cadena = (tabla: string) => {
    const q: Record<string, unknown> = {};
    const reg = (op: string) => (...args: unknown[]) => { h.llamadas.push({ tabla, op, args }); return q; };
    for (const op of ["select", "is", "not", "eq", "order", "limit", "insert", "update"]) q[op] = reg(op);
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: { id: "nuevo" }, error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => cadena(t) } };
});
vi.mock("../datos", () => ({ tenantId: async () => "t1", borrarSuave: async () => undefined }));

import { crearProducto, listarProductos } from "../catalogo";

const base = {
  nombre: "Gorra", categoria_id: "11111111-1111-4111-8111-111111111111", precio_base_mxn: 249, descripcion: "",
  codigo_interno: "GOR-1", estado: "ACTIVO" as const, agotado: false, visible_en_pos: true, marca_virtual_id: "",
  area_cocina_id: "", clave_sat: "", tasa_iva: 16, iva_incluido_en_precio: true, codigo_barras: "", costo_mxn: undefined,
};

describe("catálogo con tienda", () => {
  beforeEach(() => { h.llamadas.length = 0; });

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
