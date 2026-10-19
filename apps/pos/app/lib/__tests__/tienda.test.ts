import { describe, it, expect, vi } from "vitest";
import type { Producto } from "../catalogo";
import type { DatosCaja } from "../turno";
import { agruparTienda, buscarPorCodigo, decidirEscaneo, destinoInventario, buscarVitrina, puedeRecibirMercancia, esTienda, comoTienda, estadoExistencia, etiquetaExistencia, matrizVariantes, pasoConLimite, filasCuentas, puedeCambiarSeccion, renglonTienda, renglonVenta, resumenVitrina, sinExistencia, type Existencia } from "../tienda";

const prod = (id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: 100, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, ...extra,
});
const padre = prod("P", { variante_ejes: ["Talla", "Color"] });
const h = (id: string, talla: string, color: string, precio = 100, extra: Partial<Producto> = {}) =>
  prod(id, { producto_padre_id: "P", variante_valores: { Talla: talla, Color: color }, precio_base_mxn: precio, ...extra });
const hijas = [h("h1", "M", "Negro"), h("h2", "L", "Negro"), h("h3", "M", "Rojo")];
const suelto = prod("S");
const ex = (producto_id: string, cantidad: number, minimo: number | null = null): Existencia => ({ producto_id, sucursal_id: "s1", cantidad, minimo });

describe("esTienda", () => {
  it("los cinco giros de tienda, y un restaurante no", () => {
    for (const giro of ["RETAIL", "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS"]) expect(esTienda({ giro } as DatosCaja)).toBe(true);
    expect(esTienda({ giro: "QUICK_SERVICE" } as DatosCaja)).toBe(false);
    expect(esTienda({ giro: "RESTAURANTE" } as DatosCaja)).toBe(false);
    expect(esTienda({} as DatosCaja)).toBe(false);
    expect(esTienda(null)).toBe(false);
  });
  it("comoTienda: tienda y belleza venden igual; el restaurante no", () => {
    expect(comoTienda({ giro: "RETAIL" } as DatosCaja)).toBe(true);
    expect(comoTienda({ giro: "SALON" } as DatosCaja)).toBe(true);
    expect(comoTienda({ giro: "RESTAURANTE" } as DatosCaja)).toBe(false);
  });
});

describe("agruparTienda", () => {
  it("deja fuera las hijas", () => {
    const { vitrina, padres } = agruparTienda([padre, ...hijas, suelto]);
    expect(vitrina.map((p) => p.id)).toEqual(["P", "S"]);
    expect(padres.get("P")?.hijas.map((x) => x.id)).toEqual(["h1", "h2", "h3"]);
    expect(padres.get("P")?.ejes).toEqual(["Talla", "Color"]);
    expect(padres.has("S")).toBe(false);
  });
});

describe("buscarPorCodigo", () => {
  const lista = [padre, h("h1", "M", "Negro", 100, { codigo_barras: "750100", codigo_interno: "SKU-1" }), h("h2", "L", "Negro", 100, { codigo_interno: "750100" }),
    prod("P2", { codigo_barras: "999", variante_ejes: ["Talla"] }), prod("h9", { producto_padre_id: "P2", codigo_barras: "999" })];
  it("barras con espacios y mayúsculas, antes que SKU", () => {
    expect(buscarPorCodigo(lista, " 750100 ")?.id).toBe("h1");
    expect(buscarPorCodigo(lista, "sku-1")?.id).toBe("h1");
  });
  it("nunca un padre ni vacío", () => {
    expect(buscarPorCodigo(lista, "999")?.id).toBe("h9");
    expect(buscarPorCodigo([padre, ...hijas, prod("P3", { variante_ejes: ["Talla"], codigo_barras: "5" })], "5")).toBeNull();
    expect(buscarPorCodigo(lista, "  ")).toBeNull();
  });
});

describe("estadoExistencia", () => {
  it("umbrales", () => {
    expect(estadoExistencia(0, null)).toBe("agotada");
    expect(estadoExistencia(2, null)).toBe("pocas");
    expect(estadoExistencia(3, null)).toBe("normal");
    expect(estadoExistencia(5, 5)).toBe("pocas");
    expect(estadoExistencia(-1, 3)).toBe("agotada");
  });
});

describe("matrizVariantes", () => {
  const pt = agruparTienda([padre, ...hijas]).padres.get("P")!;
  const exs = [ex("h1", 4), ex("h2", 0), { ...ex("h3", 1), sucursal_id: "s2" }];
  it("dos ejes: null en combinación inexistente", () => {
    const m = matrizVariantes(pt, exs, "s1");
    expect(m.columnas).toEqual(["M", "L"]);
    expect(m.renglones).toEqual(["Negro", "Rojo"]);
    expect(m.celda("M", "Negro")).toMatchObject({ cantidad: 4, estado: "normal" });
    expect(m.celda("L", "Negro")).toMatchObject({ cantidad: 0, estado: "agotada" });
    expect(m.celda("L", "Rojo")).toBeNull();
    expect(m.celda("M", "Rojo")?.cantidad).toBe(0); // existe en otra sucursal, no en s1
  });
  it("un eje: un renglón", () => {
    const uno = agruparTienda([{ ...padre, variante_ejes: ["Talla"] }, prod("a", { producto_padre_id: "P", variante_valores: { Talla: "S" } }), prod("b", { producto_padre_id: "P", variante_valores: { Talla: "M" } })]).padres.get("P")!;
    const m = matrizVariantes(uno, [ex("b", 7)], "s1");
    expect(m.columnas).toEqual(["S", "M"]);
    expect(m.renglones).toEqual([""]);
    expect(m.celda("M", "")?.cantidad).toBe(7);
  });
});

describe("resumenVitrina", () => {
  const { padres } = agruparTienda([padre, ...hijas, suelto]);
  it("suma las hijas y precioDesde solo si difieren", () => {
    const exs = [ex("h1", 4), ex("h2", 1), ex("h3", 0)];
    expect(resumenVitrina(padre, padres, exs, "s1")).toEqual({ piezas: 5, estado: "normal", precioDesde: null });
    const caro = agruparTienda([padre, h("h1", "M", "Negro", 349), h("h2", "L", "Negro", 399)]).padres;
    expect(resumenVitrina(padre, caro, [ex("h1", 1), ex("h2", 1)], "s1")).toMatchObject({ piezas: 2, estado: "pocas", precioDesde: 349 });
  });
  it("producto suelto usa su propia existencia", () => {
    expect(resumenVitrina(suelto, padres, [ex("S", 0)], "s1")).toEqual({ piezas: 0, estado: "agotada", precioDesde: null });
  });
});

describe("decidirEscaneo", () => {
  const lista = [{ ...padre, codigo_barras: "PADRE-1" }, h("h1", "M", "Negro", 100, { codigo_barras: "750100" }), suelto];
  const libre = { cobroAbierto: false, ignorar: false };
  it("agrega lo que encuentra y avisa lo que no", () => {
    expect(decidirEscaneo(lista, "750100", libre)).toEqual({ tipo: "agregar", producto: lista[1] });
    expect(decidirEscaneo(lista, "000", libre)).toEqual({ tipo: "no-encontrado" });
  });
  it("el código de un padre abre su selector, nunca lo agrega", () => {
    expect(decidirEscaneo(lista, " padre-1 ", libre)).toEqual({ tipo: "selector", padre: lista[0] });
  });
  it("con el cobro abierto no agrega; bajo un diálogo se ignora (aunque el cobro esté abierto)", () => {
    expect(decidirEscaneo(lista, "750100", { cobroAbierto: true, ignorar: false })).toEqual({ tipo: "cobro" });
    expect(decidirEscaneo(lista, "750100", { cobroAbierto: true, ignorar: true })).toEqual({ tipo: "ignorar" });
    expect(decidirEscaneo(lista, "000", { cobroAbierto: false, ignorar: true })).toEqual({ tipo: "ignorar" });
  });
});

describe("renglonTienda", () => {
  const lista = [padre, h("h1", "M", "Negro", 100, { nombre: "Polo M Negro", codigo_interno: "POL-M-NEG" }), suelto];
  it("nombre del padre y debajo «talla · color · SKU» en el orden de los ejes", () => {
    expect(renglonTienda(lista[1]!, lista)).toEqual({ nombre: "P", detalle: "M · Negro · POL-M-NEG" });
  });
  it("sin variantes enseña solo su SKU, si tiene", () => {
    expect(renglonTienda({ ...suelto, codigo_interno: "GOR-1" }, lista)).toEqual({ nombre: "S", detalle: "GOR-1" });
    expect(renglonTienda(suelto, lista)).toEqual({ nombre: "S", detalle: undefined });
  });
  it("si el padre no está en el catálogo, deja el nombre del producto sin detalle de variante", () => {
    const huerfana = h("h9", "L", "Rojo", 100, { nombre: "Polo L Rojo" });
    expect(renglonTienda(huerfana, [huerfana])).toEqual({ nombre: "Polo L Rojo", detalle: undefined });
  });
});

describe("sinExistencia", () => {
  const p = prod("A", { controla_existencias: true });
  it("marca cuando la pieza dejaría la existencia en cero o menos", () => {
    expect(sinExistencia(p, 2, [ex("A", 2)], "s1")).toBe(true);
    expect(sinExistencia(p, 1, [ex("A", 2)], "s1")).toBe(false);
    expect(sinExistencia(p, 1, [], "s1")).toBe(true);
    expect(sinExistencia(p, 1, null, "s1")).toBe(false);
  });
  it("no marca lo que no controla existencias", () => {
    expect(sinExistencia({ ...p, controla_existencias: false }, 5, [ex("A", 1)], "s1")).toBe(false);
  });
});

describe("pasoConLimite (la fila de agregados de la tienda)", () => {
  it("un paso colgado vence a los 8 s, la fila sigue y la respuesta tardía no agrega", async () => {
    vi.useFakeTimers();
    try {
      const agregadas: string[] = [];
      let soltar: () => void = () => {};
      const colgada = new Promise<void>((ok) => { soltar = ok; });
      let fila: Promise<unknown> = Promise.resolve();
      const resultados: boolean[] = [];
      const encolar = (id: string, espera: Promise<void>) => {
        fila = fila.then(async () => {
          resultados.push(await pasoConLimite(async (vigente) => { await espera; if (vigente()) agregadas.push(id); }));
        });
      };
      encolar("a", colgada);
      encolar("b", Promise.resolve());
      await vi.advanceTimersByTimeAsync(7999);
      expect(agregadas).toEqual([]); // «b» espera a «a»
      await vi.advanceTimersByTimeAsync(1);
      await fila;
      expect(resultados).toEqual([false, true]);
      expect(agregadas).toEqual(["b"]);
      soltar(); // «a» responde tarde
      await vi.advanceTimersByTimeAsync(0);
      expect(agregadas).toEqual(["b"]);
    } finally { vi.useRealTimers(); }
  });

  it("el error de un paso a tiempo sube", async () => {
    await expect(pasoConLimite(async () => { throw new Error("sin red"); })).rejects.toThrow("sin red");
  });
});

describe("etiquetaExistencia", () => {
  it("solo marca lo que importa; sin cargar, nada", () => {
    expect(etiquetaExistencia("normal")).toBeNull();
    expect(etiquetaExistencia("pocas")).toBe("pocas");
    expect(etiquetaExistencia("agotada")).toBe("agotada");
    expect(etiquetaExistencia(null)).toBeNull();
  });
});

describe("puedeCambiarSeccion", () => {
  it("solo sin cobro ni diálogo encima", () => {
    expect(puedeCambiarSeccion(false, false)).toBe(true);
    expect(puedeCambiarSeccion(true, false)).toBe(false);
    expect(puedeCambiarSeccion(false, true)).toBe(false);
  });
});

describe("Transacciones", () => {
  it("las abiertas van primero, con lo que falta por cobrar; luego las de espera", () => {
    const filas = filasCuentas(
      [
        { ticketId: "a", folio: "A-1", cliente: null, total: 349, pendiente: 349 },
        { ticketId: "b", folio: "A-2", cliente: "Ana", total: 399, pendiente: 50 },
      ],
      [{ ticketId: "e", folio: "A-0", etiqueta: "Señora de rojo", total: 120 }],
    );
    expect(filas.map((f) => [f.ticketId, f.titulo, f.folio, f.monto, f.etiquetaEspera])).toEqual([
      ["a", "A-1", null, 349, null],
      ["b", "Ana", "A-2", 50, null],
      ["e", "Señora de rojo", "A-0", 120, "Señora de rojo"],
    ]);
  });

  it("el renglón de la venta usa el catálogo si la prenda sigue ahí", () => {
    const productos = [padre, h("h1", "M", "Negro", 100, { codigo_interno: "POL-M" })];
    expect(renglonVenta({ producto_id: "h1", nombre: "P M Negro" }, productos)).toEqual({ nombre: "P", detalle: "M · Negro · POL-M" });
    expect(renglonVenta({ producto_id: "borrado", nombre: "Playera vieja" }, productos)).toEqual({ nombre: "Playera vieja", detalle: undefined });
  });
});

describe("Inventario", () => {
  const todos = [padre, ...hijas, suelto];
  const { vitrina, padres } = agruparTienda(todos);
  const conCodigo = [padre, h("h1", "M", "Negro", 100, { codigo_interno: "POL-M-NEG" }), ...hijas.slice(1), prod("S", { codigo_barras: "7501" })];
  const g = agruparTienda(conCodigo);

  it("el código de una hija abre a su padre con esa celda marcada", () => {
    const d = destinoInventario(conCodigo, g.padres, "pol-m-neg");
    expect(d && "padre" in d && d.padre.padre.id).toBe("P");
    expect(d && "padre" in d && d.marcada).toBe("h1");
  });
  it("el código de un suelto abre su lista; el de un padre, su matriz; uno raro, nada", () => {
    expect(destinoInventario(conCodigo, g.padres, "7501")).toEqual({ suelto: conCodigo[4] });
    const g2 = agruparTienda([{ ...padre, codigo_interno: "POL" }, ...hijas]);
    const d = destinoInventario([{ ...padre, codigo_interno: "POL" }, ...hijas], g2.padres, "POL");
    expect(d && "padre" in d && d.marcada).toBeUndefined();
    expect(destinoInventario(conCodigo, g.padres, "nada")).toBeNull();
  });
  it("buscarVitrina ignora acentos y encuentra al padre por una hija", () => {
    const a = [prod("P", { nombre: "Camíseta", variante_ejes: ["Talla"] }), prod("h", { producto_padre_id: "P", codigo_interno: "ZZ-1" })];
    const ag = agruparTienda(a);
    expect(buscarVitrina(ag.vitrina, ag.padres, "camiseta").map((p) => p.id)).toEqual(["P"]);
    expect(buscarVitrina(ag.vitrina, ag.padres, "zz-1").map((p) => p.id)).toEqual(["P"]);
    expect(buscarVitrina(vitrina, padres, "xyz")).toEqual([]);
  });
  it("recibir: dueño o administrador", () => {
    expect(puedeRecibirMercancia("DUENO")).toBe(true);
    expect(puedeRecibirMercancia("ADMIN")).toBe(true);
    expect(puedeRecibirMercancia("CAJERO")).toBe(false);
    expect(puedeRecibirMercancia("SUPERVISOR")).toBe(false);
  });
});
