import { describe, expect, it } from "vitest";
import { cotizacionDe, errorDe, menuDe, negocioDe, pedidoDe, seguimientoDe } from "../contrato";
import { CODIGO, ID, cotizacionCruda, menuCrudo, negocioCrudo, pedidoCrudo, seguimientoCrudo } from "./datos";

type Obj = Record<string, unknown>;
/** Copia `x` y deja que la prueba la rompa. */
const roto = (x: unknown, romper: (o: Obj) => void): unknown => {
  const o = structuredClone(x) as Obj;
  romper(o);
  return o;
};
const BASURA: unknown[] = [null, undefined, "", "hola", 7, [], {}, { error: "SERVICIO_NO_DISPONIBLE" }];

describe("negocio", () => {
  it("lee la respuesta del anexo", () => {
    const n = negocioDe(negocioCrudo());
    expect(n?.nombre).toBe("Knock-Out Burger");
    expect(n?.sucursales[0]).toMatchObject({
      id: ID.sucursal, telefono: "477 123 4567", recoger: true, domicilio: true,
      horario: { "1": ["13:00", "22:00"], "7": ["13:00", "02:00"] },
      estado: { recoger: null, domicilio: "FUERA_DE_HORARIO" },
      zonas: [{ id: ID.zona, nombre: "Centro", costo_mxn: "35.00" }],
    });
  });
  it("admite lo que puede venir en null", () => {
    const n = negocioDe(roto(negocioCrudo(), (o) => {
      o.logo_ruta = null; o.descripcion = null;
      const s = (o.sucursales as Obj[])[0]!;
      s.telefono = null; s.direccion = null; s.zonas = []; s.horario = {};
    }));
    expect(n?.logo_ruta).toBeNull();
    expect(n?.sucursales[0]?.horario).toEqual({});
  });
  it("basura = null", () => {
    for (const b of BASURA) expect(negocioDe(b), JSON.stringify(b)).toBeNull();
  });
  it("una sola pieza mal y no se pinta nada", () => {
    const malos: ((o: Obj) => void)[] = [
      (o) => { delete o.nombre; },
      (o) => { o.color = "rojo"; },
      (o) => { o.pago_efectivo = "true"; },
      (o) => { o.sucursales = "ninguna"; },
      (o) => { (o.sucursales as Obj[])[0]!.id = "no-es-uuid"; },
      (o) => { (o.sucursales as Obj[])[0]!.recoger = 1; },
      (o) => { delete (o.sucursales as Obj[])[0]!.estado; },
      (o) => { ((o.sucursales as Obj[])[0]!.estado as Obj).recoger = false; },
      (o) => { ((o.sucursales as Obj[])[0]!.zonas as Obj[])[0]!.costo_mxn = 35; },
      (o) => { ((o.sucursales as Obj[])[0]!.zonas as Obj[])[0]!.costo_mxn = "35"; },
    ];
    malos.forEach((m, i) => expect(negocioDe(roto(negocioCrudo(), m)), `caso ${i}`).toBeNull());
  });
  it("no deja pasar campos que no conoce (tenant_id nunca llega a la pantalla)", () => {
    const n = negocioDe(roto(negocioCrudo(), (o) => { o.tenant_id = "secreto"; }));
    expect(n).not.toBeNull();
    expect(JSON.stringify(n)).not.toContain("secreto");
  });
});

describe("menú", () => {
  const productos = (o: Obj) => (o.categorias as Obj[]).flatMap((c) => c.productos as Obj[]);
  it("lee la respuesta del anexo con los campos de la 0165", () => {
    const m = menuDe(menuCrudo());
    const h = m?.categorias[0]?.productos[0];
    expect(h).toMatchObject({ id: ID.hamburguesa, precio_mxn: "120.00", precio_final_mxn: "139.20", agotado: false, es_combo: false });
    expect(h?.grupos[0]).toMatchObject({ id: ID.termino, minimo: 1, maximo: 1 });
    expect(h?.grupos[1]?.opciones[0]).toMatchObject({ id: ID.queso, precio_extra_mxn: "15.00", precio_extra_final_mxn: "17.40", agotada: false });
    const combo = m?.categorias[1]?.productos[0];
    expect(combo?.slots[0]?.opciones[0]).toMatchObject({ producto_id: ID.papasGajo, agotado: false, es_default: true });
    // máximo null = sin tope (solo en grupos de modificadores)
    expect(combo?.slots[0]?.opciones[0]?.grupos[0]?.maximo).toBeNull();
  });
  it("un menú vacío es un menú", () => expect(menuDe({ categorias: [] })).toEqual({ categorias: [] }));
  it("basura = null", () => {
    for (const b of BASURA) expect(menuDe(b), JSON.stringify(b)).toBeNull();
  });
  it("exige el precio final del producto y de cada opción (0165)", () => {
    expect(menuDe(roto(menuCrudo(), (o) => { delete productos(o)[0]!.precio_final_mxn; }))).toBeNull();
    expect(menuDe(roto(menuCrudo(), (o) => { delete ((productos(o)[0]!.grupos as Obj[])[1]!.opciones as Obj[])[0]!.precio_extra_final_mxn; }))).toBeNull();
    expect(menuDe(roto(menuCrudo(), (o) => { delete ((productos(o)[2]!.slots as Obj[])[0]!.opciones as Obj[])[0]!.precio_extra_final_mxn; }))).toBeNull();
    // …también en los modificadores de una opción de slot
    expect(menuDe(roto(menuCrudo(), (o) => {
      const papas = ((productos(o)[2]!.slots as Obj[])[0]!.opciones as Obj[])[0]!;
      delete ((papas.grupos as Obj[])[0]!.opciones as Obj[])[0]!.precio_extra_final_mxn;
    }))).toBeNull();
  });
  it("una sola pieza mal y no se pinta nada", () => {
    const malos: ((o: Obj) => void)[] = [
      (o) => { productos(o)[0]!.precio_mxn = 120; },
      (o) => { productos(o)[0]!.precio_final_mxn = "139.2"; },
      (o) => { productos(o)[0]!.agotado = null; },
      (o) => { delete productos(o)[0]!.slots; },
      (o) => { (productos(o)[0]!.grupos as Obj[])[0]!.minimo = "1"; },
      (o) => { (productos(o)[0]!.grupos as Obj[])[0]!.minimo = 1.5; },
      (o) => { (productos(o)[0]!.grupos as Obj[])[0]!.maximo = -1; },
      // «agotada» es de las opciones de modificador; «agotado», de productos y opciones de slot
      (o) => { const op = ((productos(o)[0]!.grupos as Obj[])[0]!.opciones as Obj[])[0]!; op.agotado = op.agotada; delete op.agotada; },
      (o) => { (productos(o)[2]!.slots as Obj[])[0]!.maximo = null; },
      (o) => { ((productos(o)[2]!.slots as Obj[])[0]!.opciones as Obj[])[0]!.producto_id = 5; },
    ];
    malos.forEach((m, i) => expect(menuDe(roto(menuCrudo(), m)), `caso ${i}`).toBeNull());
  });
  it("el extra de una opción de slot puede ser negativo; el de un modificador, no", () => {
    expect(menuDe(roto(menuCrudo(), (o) => {
      const op = ((productos(o)[2]!.slots as Obj[])[0]!.opciones as Obj[])[1]!;
      op.precio_extra_mxn = "-5.00"; op.precio_extra_final_mxn = "-5.00";
    }))).not.toBeNull();
    expect(menuDe(roto(menuCrudo(), (o) => { ((productos(o)[0]!.grupos as Obj[])[1]!.opciones as Obj[])[0]!.precio_extra_mxn = "-5.00"; }))).toBeNull();
  });
});

describe("cotizar, pedir y seguimiento", () => {
  it("cotización", () => {
    expect(cotizacionDe(cotizacionCruda())).toEqual(cotizacionCruda());
    for (const b of BASURA) expect(cotizacionDe(b)).toBeNull();
    expect(cotizacionDe(roto(cotizacionCruda(), (o) => { o.total_mxn = 305; }))).toBeNull();
    expect(cotizacionDe(roto(cotizacionCruda(), (o) => { delete o.envio_total_mxn; }))).toBeNull();
    expect(cotizacionDe(roto(cotizacionCruda(), (o) => { (o.renglones as Obj[])[0]!.cantidad = "2"; }))).toBeNull();
  });
  it("pedido creado", () => {
    expect(pedidoDe(pedidoCrudo())).toEqual(pedidoCrudo());
    for (const b of BASURA) expect(pedidoDe(b)).toBeNull();
    expect(pedidoDe(roto(pedidoCrudo(), (o) => { o.codigo = "corto"; }))).toBeNull();
  });
  it("pedido creado, caso degradado: con el código basta — el pedido existe", () => {
    expect(pedidoDe({ codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null }))
      .toEqual({ codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null });
    // Lo demás, si viene raro, se lee como ausente: perder el código sería perder el pedido.
    expect(pedidoDe({ codigo: CODIGO, folio_corto: 7, total_mxn: "mucho" }))
      .toEqual({ codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null });
  });
  it("seguimiento", () => {
    expect(seguimientoDe(seguimientoCrudo())).toEqual(seguimientoCrudo());
    for (const b of BASURA) expect(seguimientoDe(b)).toBeNull();
    expect(seguimientoDe(roto(seguimientoCrudo(), (o) => { o.estado = "RECIBIDO"; }))).toBeNull();
    expect(seguimientoDe(roto(seguimientoCrudo(), (o) => { o.modo = "MESA"; }))).toBeNull();
    expect(seguimientoDe(roto(seguimientoCrudo(), (o) => { o.pago = "CRIPTO"; }))).toBeNull();
    expect(seguimientoDe(roto(seguimientoCrudo(), (o) => { delete o.sucursal; }))).toBeNull();
    expect(seguimientoDe(roto(seguimientoCrudo(), (o) => { o.estado = "CANCELADO"; o.motivo = "AGOTADO"; }))?.motivo).toBe("AGOTADO");
  });
});

describe("error", () => {
  it("código y detalle", () => {
    expect(errorDe({ error: "TOTAL_CAMBIO", detalle: "310.00" })).toEqual({ error: "TOTAL_CAMBIO", detalle: "310.00" });
    expect(errorDe({ error: "CAPTCHA_INVALIDO" })).toEqual({ error: "CAPTCHA_INVALIDO", detalle: null });
  });
  it("lo que no parece un código de la función es servicio no disponible", () => {
    for (const b of [...BASURA.filter((x) => !(typeof x === "object" && x !== null && "error" in x)), { error: 5 }, { error: "<b>hola</b>" }, { error: "select * from" }]) {
      expect(errorDe(b), JSON.stringify(b)).toEqual({ error: "SERVICIO_NO_DISPONIBLE", detalle: null });
    }
    expect(errorDe({ error: "TIENDA_CERRADA", detalle: { a: 1 } })).toEqual({ error: "TIENDA_CERRADA", detalle: null });
  });
});
