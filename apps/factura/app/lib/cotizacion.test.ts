import { describe, expect, it } from "vitest";
import { armarCotizacion, buscarCotizacion, fechaDia, fmtCantidad, sufijoPrecio } from "./cotizacion";

const rpc = {
  negocio: "Ferretería Lupita",
  sucursal: { nombre: "Centro", direccion: "Juárez 10, León", telefono: null },
  folio: "COT-0007",
  fecha: "2026-10-18",
  vigente_hasta: "2026-10-25",
  cliente: "Ana Pérez",
  renglones: [
    { nombre: "Playera", sku: "PL-1", unidad_sat: "H87", cantidad: 2, precio_unitario: 150, total: 300 },
    { nombre: "Jitomate", sku: null, unidad_sat: "KGM", cantidad: 1.25, precio_unitario: 28, total: 35 },
  ],
  totales: { subtotal: 288.79, iva: 46.21, total: 335 },
};

describe("armarCotizacion", () => {
  it("arma la vista", () => {
    const v = armarCotizacion(rpc)!;
    expect(v.folio).toBe("COT-0007");
    expect(v.sucursal.telefono).toBeNull();
    expect(v.renglones.map((r) => r.cantidad)).toEqual(["2 ×", "1.250 kg"]);
    expect(v.renglones[1]?.precioUnidad).toBe("/kg");
    expect(v.total).toBe(335);
    expect(v.cliente).toBe("Ana Pérez");
  });
  it("NULL o basura es null", () => {
    expect(armarCotizacion(null)).toBeNull();
    expect(armarCotizacion("x")).toBeNull();
    expect(armarCotizacion({})).toBeNull();
  });
  it("sin cliente ni renglones no truena", () => {
    const v = armarCotizacion({ ...rpc, cliente: null, renglones: undefined })!;
    expect(v.cliente).toBeNull();
    expect(v.renglones).toEqual([]);
  });
});

describe("formatos", () => {
  it("cantidad y fecha", () => {
    expect(fmtCantidad(3)).toBe("3 ×");
    expect(fmtCantidad(3, "E48")).toBe("3 ×");
    expect(fmtCantidad(0.5, "KGM")).toBe("0.500 kg");
    expect(fmtCantidad(7.5, "MTR")).toBe("7.50 m");
    expect(fmtCantidad(2, "LTR")).toBe("2.00 l");
    expect(sufijoPrecio("KGM")).toBe("/kg");
    expect(sufijoPrecio("H87")).toBe("");
    expect(sufijoPrecio(null)).toBe("");
    expect(fechaDia("2026-10-25")).toBe("25/10/2026");
  });
});

describe("buscarCotizacion", () => {
  it("un token con forma inválida ni se consulta", async () => {
    expect(await buscarCotizacion("../etc")).toBeNull();
    expect(await buscarCotizacion("corto")).toBeNull();
  });
});
