import { describe, expect, it, vi } from "vitest";
import {
  TOPES, aCuerpo, agregar, cambiarCantidad, carritoNuevo, claveDeCarrito, contarPiezas, estimarSeleccion,
  estimarTotal, guardarCarrito, leerCarrito, quitar, revalidar, seleccionInicial, vaciar, validarSeleccion,
  type Carrito, type Seleccion,
} from "../carrito";
import { menuDe, type Menu, type Producto } from "../contrato";
import { ID, menuCrudo } from "./datos";

const menu = menuDe(menuCrudo()) as Menu;
const producto = (id: string, m: Menu = menu): Producto => m.categorias.flatMap((c) => c.productos).find((p) => p.id === id)!;
const hamburguesa = producto(ID.hamburguesa), refresco = producto(ID.refresco), combo = producto(ID.combo);
const sel = (o: Partial<Seleccion> = {}): Seleccion => ({ modificadores: [], componentes: [], ...o });
const mod = (opcionId: string, cantidad = 1) => ({ opcionId, cantidad });
const comp = (grupoId: string, productoId: string, cantidad = 1, modificadores: { opcionId: string; cantidad: number }[] = []) =>
  ({ grupoId, productoId, cantidad, modificadores });
const motivos = (p: Producto, s: Seleccion) => validarSeleccion(p, s).map((f) => `${f.motivo}:${f.donde}`);
/** El menú con un cambio, para probar la revalidación. */
const menuCon = (cambiar: (productos: Record<string, unknown>[]) => void): Menu => {
  const crudo = menuCrudo() as { categorias: { productos: Record<string, unknown>[] }[] };
  cambiar(crudo.categorias.flatMap((c) => c.productos));
  return menuDe(crudo) as Menu;
};
/** El menú sin un producto. */
const menuSin = (id: string): Menu => {
  const crudo = menuCrudo() as { categorias: { productos: { id: string }[] }[] };
  for (const c of crudo.categorias) c.productos = c.productos.filter((p) => p.id !== id);
  return menuDe(crudo) as Menu;
};
const vacio = (): Carrito => carritoNuevo(ID.sucursal, "RECOGER");

describe("selección de un producto con modificadores", () => {
  it("el mínimo: sin elegir el obligatorio falta; con uno, pasa", () => {
    expect(motivos(hamburguesa, sel())).toEqual([`FALTAN:${ID.termino}`]);
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio)] }))).toEqual([]);
  });
  it("el máximo: uno de más sobra (dos opciones o una con cantidad 2)", () => {
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.bienCocido)] }))).toEqual([`SOBRAN:${ID.termino}`]);
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio, 2)] }))).toEqual([`SOBRAN:${ID.termino}`]);
  });
  it("el máximo cuenta cantidades: 3 caben en «hasta 3», 4 no", () => {
    const con = (queso: number, tocino: number) => sel({ modificadores: [mod(ID.medio), mod(ID.queso, queso), mod(ID.tocino, tocino)] });
    expect(motivos(hamburguesa, con(2, 1))).toEqual([]);
    expect(motivos(hamburguesa, con(2, 2))).toEqual([`SOBRAN:${ID.extras}`]);
  });
  it("máximo null = sin tope del grupo (pero cada opción, hasta 10)", () => {
    const papas = (ranch: number) => sel({ componentes: [comp(ID.slotPapas, ID.papasGajo, 1, [mod(ID.ranch, ranch)])] });
    expect(motivos(combo, papas(10))).toEqual([]);
    expect(motivos(combo, papas(11))).toEqual([`CANTIDAD:${ID.salsas}`]);
  });
  it("una opción agotada no se puede pedir", () => {
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.aguacate)] }))).toEqual([`AGOTADO:${ID.extras}`]);
  });
  it("una opción que no es de este producto, o repetida, no pasa", () => {
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.ranch)] }))).toEqual([`DESCONOCIDO:${ID.ranch}`]);
    expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso), mod(ID.queso)] }))).toEqual([`REPETIDO:${ID.extras}`]);
  });
  it("cantidades que la base rechaza: cero, negativas, con decimales", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) {
      expect(motivos(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso, n)] })), String(n)).toEqual([`CANTIDAD:${ID.extras}`]);
    }
  });
  it("un producto sin grupos se agrega tal cual; con componentes, no", () => {
    expect(motivos(refresco, sel())).toEqual([]);
    expect(motivos(refresco, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo)] }))).toEqual([`DESCONOCIDO:${ID.slotPapas}`]);
  });
  it("un producto agotado no se puede pedir", () => {
    const agotado = { ...refresco, agotado: true };
    expect(motivos(agotado, sel())).toEqual([`AGOTADO:${ID.refresco}`]);
  });
  it("cada falta trae un texto para el cliente, sin códigos", () => {
    const [falta] = validarSeleccion(hamburguesa, sel());
    expect(falta?.texto).toBe("Elige 1 en «Término».");
    expect(validarSeleccion(hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.aguacate)] }))[0]?.texto).toBe("«Aguacate» se agotó.");
  });
  it("los valores iniciales: lo que el negocio marcó por omisión, sin agotados y sin pasarse del máximo", () => {
    expect(seleccionInicial(hamburguesa)).toEqual(sel());
    const conDefaults = menuCon((ps) => {
      const grupos = ps[0]!.grupos as { opciones: Record<string, unknown>[] }[];
      grupos[0]!.opciones.forEach((o) => { o.es_default = true; });   // dos por omisión en un grupo de máximo 1
      grupos[1]!.opciones[2]!.es_default = true;                        // el agotado
    });
    expect(seleccionInicial(producto(ID.hamburguesa, conDefaults))).toEqual(sel({ modificadores: [mod(ID.medio)] }));
  });
});

describe("selección de un combo", () => {
  it("cada slot con su mínimo y su máximo", () => {
    expect(motivos(combo, sel())).toEqual([`FALTAN:${ID.slotPapas}`]);
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo)] }))).toEqual([]);
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo, 2)] }))).toEqual([`SOBRAN:${ID.slotPapas}`]);
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasFrancesas), comp(ID.slotBebida, ID.refresco, 2)] }))).toEqual([]);
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasFrancesas), comp(ID.slotBebida, ID.refresco, 3)] }))).toEqual([`SOBRAN:${ID.slotBebida}`]);
  });
  it("el mismo producto dos veces no se admite, aunque sea en slots distintos", () => {
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo), comp(ID.slotBebida, ID.papasGajo)] })))
      .toEqual([`REPETIDO:${ID.slotBebida}`]);
  });
  it("una elección agotada, o que no es de ese slot, no pasa", () => {
    const agotadas = menuCon((ps) => { ((ps[2]!.slots as { opciones: Record<string, unknown>[] }[])[0]!.opciones[0]!).agotado = true; });
    expect(motivos(producto(ID.combo, agotadas), sel({ componentes: [comp(ID.slotPapas, ID.papasGajo)] }))).toEqual([`AGOTADO:${ID.slotPapas}`]);
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.refresco)] }))).toEqual([`DESCONOCIDO:${ID.slotPapas}`, `FALTAN:${ID.slotPapas}`]);
  });
  it("los modificadores van en la elección, con las reglas de su grupo; en la línea del combo, no", () => {
    expect(motivos(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo, 1, [mod(ID.queso)])] }))).toEqual([`DESCONOCIDO:${ID.queso}`]);
    expect(motivos(combo, sel({ modificadores: [mod(ID.ranch)], componentes: [comp(ID.slotPapas, ID.papasGajo)] }))).toEqual([`DESCONOCIDO:${ID.ranch}`]);
  });
  it("los valores iniciales toman la elección por omisión de cada slot", () => {
    expect(seleccionInicial(combo)).toEqual(sel({ componentes: [comp(ID.slotPapas, ID.papasGajo)] }));
  });
});

describe("el carrito", () => {
  const conHamburguesa = (c = vacio(), cantidad = 1, nota = "") =>
    agregar(c, hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso, 2)] }), cantidad, nota);

  it("agregar guarda los nombres para pintar, nunca precios", () => {
    const c = conHamburguesa(vacio(), 2, "  sin cebolla ");
    expect(c.renglones).toHaveLength(1);
    expect(c.renglones[0]).toMatchObject({
      productoId: ID.hamburguesa, nombre: "Hamburguesa", cantidad: 2, nota: "sin cebolla", componentes: [],
      modificadores: [{ opcionId: ID.medio, nombre: "Medio", cantidad: 1 }, { opcionId: ID.queso, nombre: "Extra queso", cantidad: 2 }],
    });
    expect(JSON.stringify(c)).not.toMatch(/precio|139|17\.40/);
  });
  it("no agrega una selección inválida", () => {
    const c = vacio();
    expect(agregar(c, hamburguesa, sel(), 1, "")).toBe(c);
  });
  it("renglones idénticos se suman; con otra nota u otros modificadores, no", () => {
    let c = conHamburguesa(conHamburguesa(), 2);
    expect(c.renglones).toHaveLength(1);
    expect(c.renglones[0]?.cantidad).toBe(3);
    // El orden en que se eligieron los modificadores no hace distinto al renglón.
    c = agregar(c, hamburguesa, sel({ modificadores: [mod(ID.queso, 2), mod(ID.medio)] }), 1, "");
    expect(c.renglones).toHaveLength(1);
    c = conHamburguesa(c, 1, "sin cebolla");
    c = agregar(c, hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso, 1)] }), 1, "");
    expect(c.renglones.map((r) => r.cantidad)).toEqual([4, 1, 1]);
    expect(new Set(c.renglones.map((r) => r.id)).size).toBe(3);
  });
  it("topes: 50 por renglón y 40 renglones", () => {
    expect(conHamburguesa(vacio(), 80).renglones[0]?.cantidad).toBe(TOPES.porRenglon);
    expect(conHamburguesa(conHamburguesa(vacio(), 30), 30).renglones[0]?.cantidad).toBe(50);
    let c = vacio();
    for (let i = 0; i < 45; i++) c = agregar(c, refresco, sel(), 1, `nota ${i}`);
    expect(c.renglones).toHaveLength(TOPES.renglones);
    // …pero lo que se suma a un renglón que ya está, sí entra
    expect(agregar(c, refresco, sel(), 1, "nota 0").renglones[0]?.cantidad).toBe(2);
  });
  it("la nota se recorta a 200 caracteres", () => {
    expect(agregar(vacio(), refresco, sel(), 1, "x".repeat(250)).renglones[0]?.nota).toHaveLength(200);
  });
  it("cambiar cantidad, quitar y vaciar", () => {
    let c = agregar(conHamburguesa(), refresco, sel(), 1, "");
    const [h, r] = c.renglones.map((x) => x.id) as [string, string];
    c = cambiarCantidad(c, h, 7);
    expect(c.renglones[0]?.cantidad).toBe(7);
    expect(cambiarCantidad(c, h, 99).renglones[0]?.cantidad).toBe(50);
    expect(cambiarCantidad(c, h, 2.9).renglones[0]?.cantidad).toBe(2);
    expect(cambiarCantidad(c, h, 0).renglones.map((x) => x.id)).toEqual([r]);
    expect(quitar(c, r).renglones.map((x) => x.id)).toEqual([h]);
    expect(contarPiezas(c)).toBe(8);
    expect(vaciar(c)).toMatchObject({ sucursalId: ID.sucursal, modo: "RECOGER", renglones: [] });
  });
  it("sin crypto.randomUUID (página servida por http en la red local) también se puede agregar", () => {
    for (const cripto of [{}, undefined]) {
      vi.stubGlobal("crypto", cripto);
      try {
        let c = vacio();
        for (let i = 0; i < 30; i++) c = agregar(c, refresco, sel(), 1, `nota ${i}`);
        expect(c.renglones).toHaveLength(30);
        expect(new Set(c.renglones.map((r) => r.id)).size).toBe(30);
        expect(cambiarCantidad(c, c.renglones[7]!.id, 4).renglones.map((r) => r.cantidad).filter((n) => n === 4)).toHaveLength(1);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });
  it("no cambia el carrito que recibe", () => {
    const c = conHamburguesa();
    const copia = structuredClone(c);
    cambiarCantidad(c, c.renglones[0]!.id, 5);
    conHamburguesa(c);
    quitar(c, c.renglones[0]!.id);
    expect(c).toEqual(copia);
  });
});

describe("estimado (solo para mostrar antes de cotizar)", () => {
  it("usa el precio final y el extra final, en centavos", () => {
    // 139.20 + 2 × 17.40 + 20.00 = 194.00 por pieza
    const s = sel({ modificadores: [mod(ID.medio), mod(ID.queso, 2), mod(ID.tocino)] });
    expect(estimarSeleccion(hamburguesa, s, 1)).toBe(19400);
    expect(estimarSeleccion(hamburguesa, s, 3)).toBe(58200);
  });
  it("un combo: base + extra de cada elección × su cantidad + sus modificadores", () => {
    // 150 + francesas 10 = 160 ;  150 + gajo 0 + 3 ranch × 5 = 165 ; con 2 refrescos (0) igual
    expect(estimarSeleccion(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasFrancesas)] }), 1)).toBe(16000);
    expect(estimarSeleccion(combo, sel({ componentes: [comp(ID.slotPapas, ID.papasGajo, 1, [mod(ID.ranch, 3)]), comp(ID.slotBebida, ID.refresco, 2)] }), 2)).toBe(33000);
  });
  it("el total del carrito; lo que ya no está en el menú no suma", () => {
    let c = agregar(vacio(), hamburguesa, sel({ modificadores: [mod(ID.medio)] }), 2, "");
    c = agregar(c, refresco, sel(), 3, "");
    expect(estimarTotal(c, menu)).toBe(2 * 13920 + 3 * 3000);
    expect(estimarTotal(c, menuSin(ID.refresco))).toBe(2 * 13920);
  });
});

describe("revalidar contra un menú nuevo", () => {
  const c = agregar(agregar(vacio(), hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso)] }), 1, ""), refresco, sel(), 1, "");
  const [h, r] = c.renglones.map((x) => x.id) as [string, string];
  it("con el mismo menú no hay nada que decir", () => expect(revalidar(c, menu)).toEqual({}));
  it("un producto que ya no está, o que se agotó", () => {
    expect(revalidar(c, menuSin(ID.refresco))).toEqual({ [r]: "Ya no está disponible. Quítalo para continuar." });
    expect(revalidar(c, menuCon((ps) => { ps[1]!.agotado = true; }))).toEqual({ [r]: "Se agotó. Quítalo para continuar." });
  });
  it("una opción elegida que se agotó o desapareció marca su renglón", () => {
    const sinQueso = menuCon((ps) => { (ps[0]!.grupos as { opciones: unknown[] }[])[1]!.opciones.shift(); });
    const quesoAgotado = menuCon((ps) => { ((ps[0]!.grupos as { opciones: Record<string, unknown>[] }[])[1]!.opciones[0]!).agotada = true; });
    expect(Object.keys(revalidar(c, sinQueso))).toEqual([h]);
    expect(revalidar(c, quesoAgotado)).toEqual({ [h]: "«Extra queso» se agotó. Quítalo y vuelve a agregarlo." });
  });
  it("un grupo que ahora exige más", () => {
    const exigente = menuCon((ps) => { (ps[0]!.grupos as Record<string, unknown>[])[1]!.minimo = 2; });
    expect(Object.keys(revalidar(c, exigente))).toEqual([h]);
  });
});

describe("el cuerpo para cotizar y pedir", () => {
  it("un producto con modificadores: exactamente lo que espera la función", () => {
    const c = agregar(carritoNuevo(ID.sucursal, "DOMICILIO", ID.zona), hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso, 2)] }), 2, "sin cebolla");
    expect(aCuerpo(c)).toEqual({
      sucursal_id: ID.sucursal, modo: "DOMICILIO", zona_id: ID.zona,
      items: [{ producto_id: ID.hamburguesa, cantidad: 2, nota: "sin cebolla",
                modificadores: [{ opcion_id: ID.medio, cantidad: 1 }, { opcion_id: ID.queso, cantidad: 2 }] }],
    });
  });
  it("un combo: componentes con su slot, y sin modificadores en la línea", () => {
    const s = sel({ componentes: [comp(ID.slotPapas, ID.papasGajo, 1, [mod(ID.ranch, 3)]), comp(ID.slotBebida, ID.refresco, 2)] });
    expect(aCuerpo(agregar(vacio(), combo, s, 1, ""))).toEqual({
      sucursal_id: ID.sucursal, modo: "RECOGER", zona_id: null,
      items: [{ producto_id: ID.combo, cantidad: 1, componentes: [
        { grupo_id: ID.slotPapas, producto_id: ID.papasGajo, cantidad: 1, modificadores: [{ opcion_id: ID.ranch, cantidad: 3 }] },
        { grupo_id: ID.slotBebida, producto_id: ID.refresco, cantidad: 2, modificadores: [] },
      ] }],
    });
  });
  it("un producto sin nada: sin nota, sin componentes", () => {
    expect(aCuerpo(agregar(vacio(), refresco, sel(), 1, "")).items).toEqual([{ producto_id: ID.refresco, cantidad: 1, modificadores: [] }]);
  });
  it("al recoger la zona va en null aunque el carrito traiga una", () => {
    expect(aCuerpo({ ...carritoNuevo(ID.sucursal, "DOMICILIO", ID.zona), modo: "RECOGER" }).zona_id).toBeNull();
  });
  it("las cantidades salen como enteros JSON y dentro de los topes, venga lo que venga guardado", () => {
    const c = agregar(vacio(), hamburguesa, sel({ modificadores: [mod(ID.medio), mod(ID.queso, 2)] }), 2, "");
    const raro: Carrito = { ...c, renglones: Array.from({ length: 45 }, (_, i) => ({
      ...c.renglones[0]!, id: String(i), cantidad: 70.7,
      modificadores: [{ opcionId: ID.queso, nombre: "x", cantidad: 12.4 }],
    })) };
    const cuerpo = aCuerpo(raro);
    expect(cuerpo.items).toHaveLength(40);
    expect(cuerpo.items[0]).toMatchObject({ cantidad: 50, modificadores: [{ opcion_id: ID.queso, cantidad: 10 }] });
    expect(JSON.stringify(cuerpo)).not.toMatch(/\d\.\d/);
  });
});

describe("guardado en el teléfono", () => {
  const almacen = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const AHORA = 1_800_000_000_000, HORA = 3_600_000;
  const c = agregar(vacio(), refresco, sel(), 2, "");

  it("la clave es por negocio", () => expect(claveDeCarrito("knockout")).toBe("vim.tienda.knockout.carrito"));
  it("guarda y lee de vuelta, con la hora del guardado", () => {
    const a = almacen();
    guardarCarrito("knockout", c, a, AHORA);
    expect(leerCarrito("knockout", a, AHORA + HORA)).toEqual({ ...c, guardado: AHORA });
    expect(leerCarrito("otro", a, AHORA)).toBeNull();
  });
  it("caduca a las 24 horas (y se borra)", () => {
    const a = almacen();
    guardarCarrito("knockout", c, a, AHORA);
    expect(leerCarrito("knockout", a, AHORA + 24 * HORA)).not.toBeNull();
    expect(leerCarrito("knockout", a, AHORA + 24 * HORA + 1)).toBeNull();
    expect(a.m.size).toBe(0);
  });
  it("uno guardado «en el futuro» (reloj movido) tampoco vale", () => {
    const a = almacen();
    guardarCarrito("knockout", c, a, AHORA + 2 * HORA);
    expect(leerCarrito("knockout", a, AHORA)).toBeNull();
  });
  it("otra versión, o cualquier cosa que no tenga la forma, se descarta", () => {
    const guardado = { ...c, guardado: AHORA };
    const malos: unknown[] = [
      "no es json", { ...guardado, v: 2 }, { ...guardado, modo: "MESA" }, { ...guardado, sucursalId: 5 },
      { ...guardado, renglones: [{ ...guardado.renglones[0], cantidad: "2" }] },
      { ...guardado, renglones: [{ ...guardado.renglones[0], modificadores: [{ opcionId: 1 }] }] },
      { ...guardado, renglones: "muchos" }, null, [],
    ];
    for (const malo of malos) {
      const a = almacen();
      a.setItem(claveDeCarrito("knockout"), typeof malo === "string" ? malo : JSON.stringify(malo));
      expect(leerCarrito("knockout", a, AHORA), JSON.stringify(malo)).toBeNull();
    }
  });
  it("un almacén que truena (modo privado, cuota llena) no rompe la tienda", () => {
    const roto = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(leerCarrito("knockout", roto, AHORA)).toBeNull();
    expect(() => guardarCarrito("knockout", c, roto, AHORA)).not.toThrow();
  });
  it("con el almacenamiento BLOQUEADO (tocar `localStorage` ya lanza), leer da null y guardar no truena", () => {
    // Firefox con las cookies bloqueadas, Chrome con «no permitir que los sitios guarden datos».
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new DOMException("denegado", "SecurityError"); } });
    try {
      expect(leerCarrito("knockout")).toBeNull();
      expect(() => guardarCarrito("knockout", c)).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
