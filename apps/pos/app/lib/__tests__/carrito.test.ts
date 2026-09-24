import type { ClienteDomicilio } from "../clientes-domicilio";
import { describe, it, expect } from "vitest";
import { reducerCarrito, estadoInicial, precioUnitarioLinea, totalLinea, calcularTotalesDisplay, clienteIdParaTicket, admiteClienteCuenta, aplicarEdicion, lineasDeEdicion, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";
import type { ComboDef } from "../combos";

const prod = (id: string, nombre: string, precio: number): Producto => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "c", agotado: false, esCombo: false,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null,
});
const combo = { ...prod("c1", "Combo", 45), esCombo: true };
const def: ComboDef = { producto: combo, slots: [] };
const lineaCombo: LineaCarrito = {
  clientId: "l1", producto: combo, cantidad: 2, modificadores: [], notaCocina: null,
  combo: { def, precioUnitario: 175, componentes: [
    { grupoId: "g1", grupoNombre: "Hamburguesa", producto: prod("h1", "Doble", 130), cantidad: 1, notaCocina: null, clientId: "k1",
      modificadores: [{ opcionId: "o1", grupoNombre: "Extras", opcionNombre: "Extra queso", precioExtra: 15, cantidad: 1 }] },
    { grupoId: "g2", grupoNombre: "Acompañamiento", producto: prod("a1", "Papas", 45), cantidad: 1, notaCocina: null, clientId: "k2", modificadores: [] },
  ] },
};

describe("precio de una línea de combo", () => {
  it("unitario = precio congelado del combo + extras de los hijos", () => {
    expect(precioUnitarioLinea(lineaCombo)).toBe(190);
  });
  it("total = unitario × cantidad", () => {
    expect(totalLinea(lineaCombo)).toBe(380);
  });
  it("una línea normal no cambia", () => {
    expect(precioUnitarioLinea({ clientId: "x", producto: prod("p", "Brownie", 45), cantidad: 1, modificadores: [], notaCocina: null })).toBe(45);
  });
});

describe("reemplazar", () => {
  it("sustituye la línea por clientId sin moverla de lugar", () => {
    const otra: LineaCarrito = { clientId: "l0", producto: prod("p", "Brownie", 45), cantidad: 1, modificadores: [], notaCocina: null };
    const e0 = { ...estadoInicial, lineas: [otra, lineaCombo] };
    const e1 = reducerCarrito(e0, { tipo: "reemplazar", linea: { ...lineaCombo, cantidad: 1 } });
    expect(e1.lineas.map((l) => l.clientId)).toEqual(["l0", "l1"]);
    expect(e1.lineas[1].cantidad).toBe(1);
  });
});

describe("envío por zona", () => {
  const linea: LineaCarrito = {
    clientId: "l1", producto: prod("p1", "Hamburguesa", 120), cantidad: 2,
    modificadores: [], notaCocina: null,
  };

  it("el cargo de la zona suma al total", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.total).toBe(275);
  });

  it("sin envío los totales no cambian", () => {
    expect(calcularTotalesDisplay([linea]).total).toBe(240);
  });

  it("el IVA se calcula sobre el total con envío", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.subtotal + t.iva).toBe(275);
  });

  it("la acción zona guarda la zona elegida", () => {
    const e = reducerCarrito(estadoInicial, {
      tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 },
    });
    expect(e.envio?.costoMxn).toBe(35);
  });

  it("salir de domicilio borra el envío", () => {
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO" },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    expect(reducerCarrito(con, { tipo: "modo", modo: "COMER_AQUI" }).envio).toBeNull();
  });

  it("limpiar el carrito conserva el envío junto con el cliente: son del mismo domicilio", () => {
    // Antes `limpiar` conservaba el cliente y tiraba el envío: el siguiente pedido del mismo
    // cliente salía sin cargo aunque el domicilio (y su zona) fueran los mismos.
    const cliente: ClienteDomicilio = { clienteId: "c1", nombre: "Ana", telefono: "477", direccionId: "d1", direccionPreview: "Madero 10", zona: null };
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO", clienteDomicilio: cliente },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    const limpio = reducerCarrito(con, { tipo: "limpiar" });
    expect(limpio.envio).toEqual({ zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 });
    expect(limpio.clienteDomicilio).toBe(cliente);
    expect(limpio.lineas).toEqual([]);
  });
});

describe("cliente asignado a la cuenta (comedor, para llevar, pick-up)", () => {
  const ana = { clienteId: "c-ana", nombre: "Ana Gómez", telefono: "4771234567" };

  it("solo esos tres modos lo admiten; domicilio tiene su propio cliente", () => {
    expect(["COMER_AQUI", "PARA_LLEVAR", "DRIVE_THRU"].every((m) => admiteClienteCuenta(m as never))).toBe(true);
    expect(admiteClienteCuenta("DELIVERY_PROPIO")).toBe(false);
  });

  it("se conserva al cambiar entre esos modos y se suelta al pasar a domicilio", () => {
    let e = reducerCarrito({ ...estadoInicial, modoServicio: "PARA_LLEVAR" }, { tipo: "cliente_cuenta", cliente: ana });
    e = reducerCarrito(e, { tipo: "modo", modo: "DRIVE_THRU" });
    expect(e.clienteCuenta).toEqual(ana);
    e = reducerCarrito(e, { tipo: "modo", modo: "DELIVERY_PROPIO" });
    expect(e.clienteCuenta ?? null).toBeNull();
  });

  it("una cuenta nueva empieza sin cliente: el siguiente pedido es de otra persona", () => {
    const e = reducerCarrito({ ...estadoInicial, clienteCuenta: ana }, { tipo: "limpiar" });
    expect(e.clienteCuenta ?? null).toBeNull();
  });

  it("clienteIdParaTicket manda el de domicilio en domicilio y el de la cuenta en los demás", () => {
    expect(clienteIdParaTicket({ ...estadoInicial })).toBeNull();
    expect(clienteIdParaTicket({ ...estadoInicial, modoServicio: "COMER_AQUI", clienteCuenta: ana })).toBe("c-ana");
    const dom = { clienteId: "c-dom" } as ClienteDomicilio;
    expect(clienteIdParaTicket({ ...estadoInicial, modoServicio: "DELIVERY_PROPIO", clienteDomicilio: dom, clienteCuenta: ana })).toBe("c-dom");
  });
});

describe("editar un renglón ya capturado", () => {
  const queso = { opcionId: "q", grupoNombre: "Extras", opcionNombre: "Queso", precioExtra: 15, cantidad: 1 };
  const cebolla = { opcionId: "c", grupoNombre: "Sin", opcionNombre: "Sin cebolla", precioExtra: 0, cantidad: 1 };
  const burger = (cantidad: number): LineaCarrito => ({ clientId: "b", producto: prod("p1", "Hamburguesa", 100), cantidad, modificadores: [queso], notaCocina: null });
  const otra: LineaCarrito = { clientId: "z", producto: prod("p2", "Refresco", 30), cantidad: 1, modificadores: [], notaCocina: null };

  it("de una sola unidad: sustituye en su lugar y conserva el clientId", () => {
    const r = aplicarEdicion([burger(1), otra], "b", { ...burger(1), modificadores: [cebolla] }, "una");
    expect(r).toHaveLength(2);
    expect(r[0]!.clientId).toBe("b");
    expect(r[0]!.modificadores).toEqual([cebolla]);
    expect(r[1]).toBe(otra);
  });

  it("'una' con 3 unidades: separa una debajo y deja 2 como estaban", () => {
    const r = aplicarEdicion([burger(3), otra], "b", { ...burger(3), modificadores: [queso, cebolla] }, "una");
    expect(r.map((l) => l.cantidad)).toEqual([2, 1, 1]);
    expect(r[0]!.modificadores).toEqual([queso]);
    expect(r[1]!.modificadores).toEqual([queso, cebolla]);
    expect(r[1]!.clientId).not.toBe("b");
    expect(r[2]).toBe(otra);
  });

  it("'todas' con 3 unidades: cambia el renglón entero sin separar", () => {
    const r = aplicarEdicion([burger(3)], "b", { ...burger(3), modificadores: [] }, "todas");
    expect(r).toHaveLength(1);
    expect(r[0]!.cantidad).toBe(3);
    expect(r[0]!.modificadores).toEqual([]);
  });

  it("sin cambios no separa: 3× no se vuelve 2× + 1× idénticos", () => {
    const lineas = [burger(3)];
    expect(aplicarEdicion(lineas, "b", { ...burger(3), modificadores: [queso] }, "una")).toBe(lineas);
  });

  it("la nota también cuenta como cambio", () => {
    const r = aplicarEdicion([burger(2)], "b", { ...burger(2), notaCocina: "bien dorada" }, "una");
    expect(r.map((l) => [l.cantidad, l.notaCocina])).toEqual([[1, null], [1, "bien dorada"]]);
  });

  it("un combo de 2 separado conserva el precio congelado en ambos renglones", () => {
    const editada: LineaCarrito = { ...lineaCombo, combo: { ...lineaCombo.combo!, componentes: [lineaCombo.combo!.componentes[0]!] } };
    const r = aplicarEdicion([lineaCombo], "l1", editada, "una");
    expect(r.map((l) => l.cantidad)).toEqual([1, 1]);
    expect(r[1]!.combo!.componentes).toHaveLength(1);
    expect(r[1]!.combo!.precioUnitario).toBe(175);
  });

  it("por el reducer: la acción 'editar' aplica la misma regla", () => {
    const e = reducerCarrito({ ...estadoInicial, lineas: [burger(2)] }, { tipo: "editar", clientId: "b", editada: { ...burger(2), modificadores: [] }, alcance: "una" });
    expect(e.lineas.map((l) => l.cantidad)).toEqual([1, 1]);
  });

  it("un clientId que ya no existe no toca nada", () => {
    const lineas = [otra];
    expect(aplicarEdicion(lineas, "nada", burger(1), "todas")).toBe(lineas);
  });
});

describe("lineasDeEdicion: lo que la cuenta de mesa manda a la base", () => {
  const queso = { opcionId: "q", grupoNombre: "Extras", opcionNombre: "Queso", precioExtra: 15, cantidad: 1 };
  const burger = (cantidad: number, mods = [queso]): LineaCarrito => ({ clientId: "b", producto: prod("p1", "Hamburguesa", 100), cantidad, modificadores: mods, notaCocina: null });

  it("'una' de 3: la original con 2 y la editada con 1, en ese orden", () => {
    const r = lineasDeEdicion(burger(3), burger(3, []), "una")!;
    expect(r.map((l) => [l.cantidad, l.modificadores.length])).toEqual([[2, 1], [1, 0]]);
    expect(r[0]!.clientId).toBe("b");
  });
  it("'todas': una sola línea con la cantidad de la editada", () => {
    expect(lineasDeEdicion(burger(3), burger(3, []), "todas")!.map((l) => l.cantidad)).toEqual([3]);
  });
  it("sin cambios devuelve null: no se llama a la base", () => {
    expect(lineasDeEdicion(burger(3), burger(3), "una")).toBeNull();
    expect(lineasDeEdicion(burger(1), burger(1), "todas")).toBeNull();
  });
  it("coincide con lo que aplicarEdicion pone en pantalla", () => {
    const lista = aplicarEdicion([burger(3)], "b", burger(3, []), "una");
    const r = lineasDeEdicion(burger(3), burger(3, []), "una")!;
    expect(lista.map((l) => [l.cantidad, l.modificadores.length])).toEqual(r.map((l) => [l.cantidad, l.modificadores.length]));
  });
});
