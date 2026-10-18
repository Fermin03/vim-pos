import { describe, it, expect, vi } from "vitest";
import { venderOPedirCantidad } from "../../components/venta-retail";
import type { Producto } from "../catalogo";

const prod = (tipoVenta?: Producto["tipoVenta"]): Producto => ({ id: "p", nombre: "P", descripcion: null, precio_base_mxn: 28, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, tipoVenta });

describe("venderOPedirCantidad (tocar, escanear o elegir en el selector)", () => {
  it("un producto por peso abre la ventana y no agrega nada", () => {
    const agregar = vi.fn(), pedir = vi.fn();
    venderOPedirCantidad(prod("PESO"), agregar, pedir);
    expect(pedir).toHaveBeenCalledOnce();
    expect(agregar).not.toHaveBeenCalled();
  });
  it("una pieza (o un producto de antes, sin tipo) se agrega como hoy", () => {
    const agregar = vi.fn(), pedir = vi.fn();
    venderOPedirCantidad(prod("UNIDAD"), agregar, pedir);
    venderOPedirCantidad(prod(), agregar, pedir);
    expect(agregar).toHaveBeenCalledTimes(2);
    expect(pedir).not.toHaveBeenCalled();
  });
});
