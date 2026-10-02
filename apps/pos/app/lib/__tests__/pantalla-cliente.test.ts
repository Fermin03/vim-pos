import { describe, expect, it } from "vitest";
import { estadoInicial, type EstadoCarrito, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";
import type { ClienteDomicilio } from "../clientes-domicilio";
import type { ClienteCuenta } from "../clientes-cuenta";
import { construirVista, leerMensaje, type EntradaVista } from "../pantalla-cliente/vista";
import { crearPublicador, type Canal } from "../pantalla-cliente/canal";

function producto(nombre: string, precio: number): Producto {
  return {
    id: `p-${nombre}`, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "c1", agotado: false,
    esCombo: false, sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null,
  };
}

function linea(id: string, nombre: string, precio: number, cantidad = 1, extra: Partial<LineaCarrito> = {}): LineaCarrito {
  return { clientId: id, producto: producto(nombre, precio), cantidad, modificadores: [], notaCocina: null, ...extra };
}

function entrada(carrito: Partial<EstadoCarrito>, resto: Partial<EntradaVista> = {}): EntradaVista {
  return { carrito: { ...estadoInicial, ...carrito }, totalAutoritativo: null, cobro: null, pagado: null, ...resto };
}

describe("construirVista", () => {
  it("sin líneas está en reposo", () => {
    expect(construirVista(entrada({}))).toEqual({ fase: "reposo" });
  });

  it("con líneas muestra renglones e importe, y el total que ve el cajero", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Hamburguesa", 120, 2), linea("b", "Refresco", 35)] }));
    expect(v).toEqual({
      fase: "cuenta",
      renglones: [
        { id: "a", cantidad: 2, nombre: "Hamburguesa", detalle: [], importe: 240 },
        { id: "b", cantidad: 1, nombre: "Refresco", detalle: [], importe: 35 },
      ],
      envio: null,
      total: 275,
    });
  });

  it("los modificadores salen como texto, con su cantidad si es más de uno", () => {
    const l = linea("a", "Hamburguesa", 100, 1, {
      modificadores: [
        { opcionId: "o1", grupoNombre: "Extras", opcionNombre: "Tocino", precioExtra: 15, cantidad: 2 },
        { opcionId: "o2", grupoNombre: "Término", opcionNombre: "Tres cuartos", precioExtra: 0, cantidad: 1 },
      ],
    });
    const v = construirVista(entrada({ lineas: [l] }));
    expect(v.fase === "cuenta" && v.renglones[0]).toEqual({ id: "a", cantidad: 1, nombre: "Hamburguesa", detalle: ["2× Tocino", "Tres cuartos"], importe: 130 });
  });

  it("un combo lista sus componentes y usa su precio congelado", () => {
    const papas = producto("Papas", 40);
    const l = linea("a", "Combo Clásico", 0, 1, {
      combo: {
        def: { producto: producto("Combo Clásico", 0), slots: [] },
        precioUnitario: 150,
        componentes: [
          { grupoId: "g1", grupoNombre: "Acompañamiento", producto: papas, cantidad: 1, modificadores: [{ opcionId: "o9", grupoNombre: "Tamaño", opcionNombre: "Grandes", precioExtra: 10, cantidad: 1 }], notaCocina: "bien doradas", clientId: "h1" },
        ],
      },
    });
    const v = construirVista(entrada({ lineas: [l] }));
    expect(v.fase === "cuenta" && v.renglones[0]).toEqual({ id: "a", cantidad: 1, nombre: "Combo Clásico", detalle: ["Papas (Grandes)"], importe: 160 });
  });

  it("el envío va aparte y entra en el total", () => {
    const v = construirVista(entrada({ modoServicio: "DELIVERY_PROPIO", lineas: [linea("a", "Pizza", 200)], envio: { zonaId: "z1", nombre: "Centro", costoMxn: 30 } }));
    expect(v).toMatchObject({ fase: "cuenta", envio: { nombre: "Centro", importe: 30 }, total: 230 });
  });

  it("con cuenta guardada manda el total de la base, que ya trae descuentos", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Pizza", 200)] }, { totalAutoritativo: 180 }));
    expect(v).toMatchObject({ fase: "cuenta", total: 180 });
  });

  it("al cobrar muestra solo el total a pagar", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Pizza", 200)] }, { cobro: { total: 200 } }));
    expect(v).toEqual({ fase: "cobro", total: 200 });
  });

  it("cobrado manda sobre todo lo demás y lleva el cambio", () => {
    const v = construirVista(entrada({}, { pagado: { total: 200, cambio: 300 }, cobro: { total: 200 } }));
    expect(v).toEqual({ fase: "pagado", total: 200, cambio: 300 });
  });

  it("redondea el cambio cuando hay errores de punto flotante", () => {
    const v = construirVista(entrada({}, { pagado: { total: 100, cambio: 0.1 + 0.2 }, cobro: { total: 100 } }));
    expect(v).toEqual({ fase: "pagado", total: 100, cambio: 0.3 });
  });

  it("no deja pasar ningún dato privado", () => {
    const clienteDomicilio: ClienteDomicilio = {
      clienteId: "ID-SECRETO-1",
      nombre: "CLIENTE-SECRETO",
      telefono: "4771234567",
      direccionId: "d-SECRET-1",
      direccionPreview: "Casa · CALLE-SECRETA 12, COL-SECRETA",
      zona: { id: "z-SECRET", nombre: "ZONA-SECRETA", costoMxn: 50 },
      direcciones: [],
    };
    const clienteCuenta: ClienteCuenta = {
      clienteId: "ID-SECRETO-2",
      nombre: "OTRO-CLIENTE-SECRETO",
      telefono: "4777654321",
    };
    const carrito: EstadoCarrito = {
      ...estadoInicial,
      modoServicio: "DELIVERY_PROPIO" as const,
      lineas: [
        linea("a", "Pizza", 200, 1, { notaCocina: "NOTA-COCINA-SECRETA" }),
        linea("b", "Combo Secret", 150, 1, {
          combo: {
            def: { producto: producto("Combo Secret", 0), slots: [] },
            precioUnitario: 150,
            componentes: [
              { grupoId: "g1", grupoNombre: "Base", producto: producto("Item", 50), cantidad: 1, modificadores: [], notaCocina: "NOTA-HIJO-SECRETA", clientId: "h-SECRET" },
            ],
          },
        }),
      ],
      notaOrden: "NOTA-ORDEN-SECRETA",
      nombreCuenta: "NOMBRE-CUENTA-SECRETO",
      clienteDomicilio,
      clienteCuenta,
      envio: { zonaId: "z-SECRET", nombre: "Centro", costoMxn: 30 },
    };
    const texto = JSON.stringify(construirVista({ carrito, totalAutoritativo: null, cobro: null, pagado: null }));
    for (const secreto of ["SECRET", "4771234567", "4777654321"]) expect(texto).not.toContain(secreto);
  });
});

describe("leerMensaje", () => {
  it("acepta los tres mensajes del canal", () => {
    expect(leerMensaje({ tipo: "hola", v: 1 })).toEqual({ tipo: "hola", v: 1 });
    expect(leerMensaje({ tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null })).toEqual({ tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null });
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cobro", total: 99.5 } })).toEqual({ tipo: "estado", v: 1, vista: { fase: "cobro", total: 99.5 } });
  });

  it("ignora lo que no entiende", () => {
    expect(leerMensaje(null)).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 2, vista: { fase: "reposo" } })).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cuenta", renglones: "x", envio: null, total: 1 } })).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cobro", total: Number.NaN } })).toBeNull();
  });

  it("round trip: lo que construye la caja se valida igual", () => {
    const v = construirVista(entrada({
      lineas: [linea("a", "Hamburguesa", 100, 1, {
        modificadores: [{ opcionId: "o1", grupoNombre: "Extras", opcionNombre: "Tocino", precioExtra: 15, cantidad: 1 }],
      })],
      envio: { zonaId: "z1", nombre: "Centro", costoMxn: 30 },
    }));
    if (v.fase !== "cuenta") throw new Error("Expected cuenta phase");
    const msg = leerMensaje({ tipo: "estado", v: 1, vista: v });
    expect(msg).not.toBeNull();
    if (msg?.tipo !== "estado") throw new Error("Expected estado message");
    expect(msg.vista).toEqual(v);
  });

  it("leerMensaje rechaza hola sin v", () => {
    expect(leerMensaje({ tipo: "hola" })).toBeNull();
  });
});

function canalFalso() {
  const enviados: unknown[] = [];
  const canal: Canal & { cerrado: boolean } = {
    cerrado: false,
    onmessage: null,
    postMessage: (m) => { enviados.push(m); },
    close() { this.cerrado = true; },
  };
  return { canal, enviados };
}

const NEGOCIO = { nombre: "Knock-Out", logoUrl: null };

describe("crearPublicador", () => {
  it("al saludar la pantalla, le manda el negocio y el estado actual", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    enviados.length = 0;
    canal.onmessage?.({ data: { tipo: "hola", v: 1 } });
    expect(enviados).toEqual([
      { tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null },
      { tipo: "estado", v: 1, vista: { fase: "cobro", total: 50 } },
    ]);
  });

  it("ignora mensajes que no son un saludo", () => {
    const { canal, enviados } = canalFalso();
    crearPublicador(canal, () => NEGOCIO);
    canal.onmessage?.({ data: { tipo: "estado", v: 1, vista: { fase: "reposo" } } });
    canal.onmessage?.({ data: "basura" });
    expect(enviados).toEqual([]);
  });

  it("late solo si hay algo en pantalla", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.latir();
    expect(enviados).toEqual([]);
    p.publicar({ fase: "cobro", total: 50 });
    p.latir();
    expect(enviados).toHaveLength(2);
  });

  it("al cerrar deja la pantalla en reposo", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    p.cerrar();
    expect(enviados.at(-1)).toEqual({ tipo: "estado", v: 1, vista: { fase: "reposo" } });
    expect(canal.cerrado).toBe(true);
  });
});
