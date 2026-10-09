// Lo que las pantallas deciden sin pintar: qué sucursal toca, con qué carrito se arranca, qué chip
// de categoría va activo, cómo se marca una opción, a qué renglón pertenece un error y la espera
// de la recotización.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { agregar, carritoNuevo, seleccionInicial, type Carrito, type CuerpoCarrito } from "../carrito";
import { cotizacionDe, menuDe, negocioDe, type Cotizacion, type Menu, type Negocio, type Sucursal } from "../contrato";
import {
  alternar, carritoPara, categoriaActiva, cotizarConEspera, modosDe, motivoDeCierre, renglonesDelError, sucursalElegida,
} from "../pantalla";
import { ID, cotizacionCruda, menuCrudo, negocioCrudo, u } from "./datos";

const negocio = negocioDe(negocioCrudo()) as Negocio;
const centro = negocio.sucursales[0]!;
const con = (cambios: Partial<Sucursal>): Sucursal => ({ ...centro, ...cambios });
const norte = con({ id: u(5), nombre: "Norte" });
const dos: Negocio = { ...negocio, sucursales: [centro, norte] };
const menu = menuDe(menuCrudo()) as Menu;
const refresco = menu.categorias[0]!.productos[1]!;
const conRefresco = (c: Carrito): Carrito => agregar(c, refresco, seleccionInicial(refresco), 1, "");

describe("sucursalElegida", () => {
  it("con una sola sucursal no se pregunta, diga lo que diga la URL", () => {
    expect(sucursalElegida(negocio, undefined)).toBe(centro);
    expect(sucursalElegida(negocio, "basura")).toBe(centro);
  });
  it("con varias, la de la URL; sin una válida, ninguna (se pregunta)", () => {
    expect(sucursalElegida(dos, norte.id)).toBe(norte);
    expect(sucursalElegida(dos, norte.id.toUpperCase())).toBe(norte);
    expect(sucursalElegida(dos, undefined)).toBeNull();
    expect(sucursalElegida(dos, u(99))).toBeNull();
  });
  it("sin sucursales, ninguna", () => {
    expect(sucursalElegida({ ...negocio, sucursales: [] }, undefined)).toBeNull();
  });
});

describe("modos y cierre", () => {
  it("solo los modos que la sucursal ofrece", () => {
    expect(modosDe(centro)).toEqual(["RECOGER", "DOMICILIO"]);
    expect(modosDe(con({ recoger: false }))).toEqual(["DOMICILIO"]);
    expect(modosDe(con({ recoger: false, domicilio: false }))).toEqual([]);
  });
  it("el motivo de cierre es el del modo; un modo que no se ofrece no está disponible", () => {
    expect(motivoDeCierre(centro, "RECOGER")).toBeNull();
    expect(motivoDeCierre(centro, "DOMICILIO")).toBe("FUERA_DE_HORARIO");
    expect(motivoDeCierre(con({ domicilio: false }), "DOMICILIO")).toBe("MODO_NO_DISPONIBLE");
  });
});

describe("carritoPara", () => {
  it("sin nada guardado: carrito nuevo en el primer modo que se ofrece, con la zona si solo hay una", () => {
    expect(carritoPara(centro, null)).toMatchObject({ sucursalId: centro.id, modo: "RECOGER", zonaId: ID.zona, renglones: [] });
    expect(carritoPara(con({ recoger: false }), null).modo).toBe("DOMICILIO");
  });
  it("con varias zonas no se elige por el cliente", () => {
    const s = con({ zonas: [...centro.zonas, { id: u(3), nombre: "Norte", costo_mxn: "50.00" }] });
    expect(carritoPara(s, null).zonaId).toBeNull();
  });
  it("el guardado de la misma sucursal se conserva con sus renglones", () => {
    const g = conRefresco(carritoNuevo(centro.id, "DOMICILIO", ID.zona));
    expect(carritoPara(centro, g)).toEqual(g);
  });
  it("si el modo guardado ya no se ofrece o la zona ya no existe, se corrigen sin perder renglones", () => {
    const g = conRefresco(carritoNuevo(centro.id, "DOMICILIO", u(77)));
    const c = carritoPara(con({ domicilio: false }), g);
    expect(c.modo).toBe("RECOGER");
    expect(c.zonaId).toBe(ID.zona);
    expect(c.renglones).toEqual(g.renglones);
  });
  it("el guardado de otra sucursal no se mezcla", () => {
    const g = conRefresco(carritoNuevo(norte.id, "RECOGER"));
    expect(carritoPara(centro, g).renglones).toEqual([]);
  });
});

describe("categoriaActiva", () => {
  const s = [{ id: "a", top: -300 }, { id: "b", top: 40 }, { id: "c", top: 500 }];
  it("la última sección que ya cruzó la línea", () => {
    expect(categoriaActiva(s, 60)).toBe("b");
    expect(categoriaActiva(s, 39)).toBe("a");
    expect(categoriaActiva(s, 40)).toBe("b");
  });
  it("antes de la primera, la primera; al final de la página, la última", () => {
    expect(categoriaActiva([{ id: "a", top: 200 }, { id: "b", top: 900 }], 60)).toBe("a");
    expect(categoriaActiva(s, 60, true)).toBe("c");
  });
  it("sin secciones, ninguna", () => {
    expect(categoriaActiva([], 60)).toBeNull();
  });
});

describe("alternar", () => {
  const id = (x: string) => x;
  const grupo = ["a", "b", "c"];
  it("obligatorio de uno: elegir otro lo reemplaza y no se puede quitar", () => {
    const r = { minimo: 1, maximo: 1 };
    expect(alternar(["a", "x"], id, grupo, "b", r)).toEqual(["x", "b"]);
    expect(alternar(["a"], id, grupo, "a", r)).toEqual(["a"]);
  });
  it("opcional de uno: se reemplaza y sí se puede quitar", () => {
    const r = { minimo: 0, maximo: 1 };
    expect(alternar(["a"], id, grupo, "b", r)).toEqual(["b"]);
    expect(alternar(["a"], id, grupo, "a", r)).toEqual([]);
  });
  it("varios: se agrega hasta el máximo y ni uno más; lo de otros grupos no cuenta", () => {
    const r = { minimo: 0, maximo: 2 };
    expect(alternar(["a", "x", "y"], id, grupo, "b", r)).toEqual(["a", "x", "y", "b"]);
    expect(alternar(["a", "b"], id, grupo, "c", r)).toEqual(["a", "b"]);
    expect(alternar(["a", "b"], id, grupo, "b", r)).toEqual(["a"]);
  });
  it("sin tope se agrega siempre", () => {
    expect(alternar(["a", "b"], id, grupo, "c", { minimo: 0, maximo: null })).toEqual(["a", "b", "c"]);
  });
});

describe("renglonesDelError", () => {
  const carrito = conRefresco(carritoNuevo(centro.id, "RECOGER"));
  const renglon = carrito.renglones[0]!;
  it("un error de renglón marca los renglones de ese producto, con qué hacer", () => {
    for (const error of ["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]) {
      const avisos = renglonesDelError(carrito, { error, detalle: ID.refresco });
      expect(Object.keys(avisos)).toEqual([renglon.id]);
      expect(avisos[renglon.id]).toMatch(/Quítalo/);
    }
  });
  it("otro código, sin detalle o un producto que no está en el carrito: no marca nada", () => {
    expect(renglonesDelError(carrito, { error: "ZONA_INVALIDA", detalle: ID.refresco })).toEqual({});
    expect(renglonesDelError(carrito, { error: "PRODUCTO_NO_DISPONIBLE", detalle: null })).toEqual({});
    expect(renglonesDelError(carrito, { error: "PRODUCTO_NO_DISPONIBLE", detalle: ID.combo })).toEqual({});
  });
});

describe("cotizarConEspera", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const cuerpo: CuerpoCarrito = { sucursal_id: centro.id, modo: "RECOGER", zona_id: null, items: [] };
  const lista: Resultado<Cotizacion> = { ok: true, datos: cotizacionDe(cotizacionCruda()) as Cotizacion };

  it("espera antes de cotizar y entrega el resultado", async () => {
    const cotizar = vi.fn(async () => lista), alResultado = vi.fn();
    cotizarConEspera(cotizar, cuerpo, alResultado, 400);
    await vi.advanceTimersByTimeAsync(399);
    expect(cotizar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(cotizar).toHaveBeenCalledTimes(1);
    expect(alResultado).toHaveBeenCalledWith(lista);
  });
  it("cancelada durante la espera, no cotiza", async () => {
    const cotizar = vi.fn(async () => lista), alResultado = vi.fn();
    const cancelar = cotizarConEspera(cotizar, cuerpo, alResultado, 400);
    await vi.advanceTimersByTimeAsync(200);
    cancelar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cotizar).not.toHaveBeenCalled();
    expect(alResultado).not.toHaveBeenCalled();
  });
  it("cancelada con la cotización en vuelo: aborta la señal y la respuesta tardía no se entrega", async () => {
    let senal: AbortSignal | undefined;
    let soltar: (r: Resultado<Cotizacion>) => void = () => {};
    const cotizar = vi.fn((_c: CuerpoCarrito, s: AbortSignal) => { senal = s; return new Promise<Resultado<Cotizacion>>((ok) => { soltar = ok; }); });
    const alResultado = vi.fn();
    const cancelar = cotizarConEspera(cotizar, cuerpo, alResultado, 400);
    await vi.advanceTimersByTimeAsync(400);
    expect(senal?.aborted).toBe(false);
    cancelar();
    expect(senal?.aborted).toBe(true);
    soltar(lista);
    await vi.advanceTimersByTimeAsync(0);
    expect(alResultado).not.toHaveBeenCalled();
  });
  it("un error llega tal cual; una cancelada no se entrega", async () => {
    const error: Resultado<Cotizacion> = { ok: false, error: "ZONA_INVALIDA", detalle: null };
    const alResultado = vi.fn();
    cotizarConEspera(async () => error, cuerpo, alResultado, 0);
    cotizarConEspera(async () => ({ ok: false, error: "CANCELADA", detalle: null }), cuerpo, alResultado, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(alResultado).toHaveBeenCalledTimes(1);
    expect(alResultado).toHaveBeenCalledWith(error);
  });
});
