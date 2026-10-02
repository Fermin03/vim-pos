import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estadoInicial, type EstadoCarrito, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";
import type { ClienteDomicilio } from "../clientes-domicilio";
import type { ClienteCuenta } from "../clientes-cuenta";
import { construirVista, construirVistaSegura, leerMensaje, type EntradaVista, type Negocio, type VistaCliente } from "../pantalla-cliente/vista";
import { crearPublicador, crearReceptor, PAGADO_MAX_MS, SILENCIO_MS, type Canal } from "../pantalla-cliente/canal";
import { textoEstadoPantalla, type AjustePantalla } from "../pantalla-cliente/ajuste";
import { CLAVE_NEGOCIO, negocioGuardado, olvidarNegocio, recordarNegocio } from "../pantalla-cliente/negocio";
import { anchoEm, ANCHO_NOMBRE_VMIN, tamanoNombre } from "../pantalla-cliente/medidas";
import { leerAnuncios, listaTrasLeer, mismaLista, pasoSiguiente, puedeLeerAnuncios, seEnsenanAnuncios, siguienteAnuncio, LISTA_VACIA, type ListaAnuncios } from "../pantalla-cliente/anuncios";

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
      // Con una dirección de verdad: `direcciones[].preview` es la calle del cliente, y con la lista
      // vacía una fuga por ahí pasaba la prueba.
      direcciones: [{
        id: "dir-SECRET-1",
        etiqueta: "ETIQUETA-SECRETA",
        preview: "CALLE-SECRETA 12, COL-SECRETA",
        referencias: "REFERENCIA-SECRETA",
        zona: { id: "z-SECRET", nombre: "ZONA-SECRETA", costoMxn: 50 },
      }],
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

describe("construirVistaSegura", () => {
  it("si armar la vista falla, da reposo en vez de lanzar hacia la pantalla de venta", () => {
    const rota = entrada({ lineas: null as unknown as LineaCarrito[] });
    expect(() => construirVista(rota)).toThrow();
    expect(construirVistaSegura(rota)).toEqual({ fase: "reposo" });
  });

  it("cuando no falla, es la misma vista", () => {
    const e = entrada({ lineas: [linea("a", "Pizza", 200)] });
    expect(construirVistaSegura(e)).toEqual(construirVista(e));
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
    const estado = { tipo: "estado", v: 1, vista: { fase: "cobro", total: 50 } };
    expect(enviados).toEqual([estado, estado]);
  });

  it("al volver a reposo deja de latir", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    p.publicar({ fase: "reposo" });
    enviados.length = 0;
    p.latir();
    expect(enviados).toEqual([]);
  });

  it("al cerrar deja la pantalla en reposo", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    p.cerrar();
    expect(enviados.at(-1)).toEqual({ tipo: "estado", v: 1, vista: { fase: "reposo" } });
    expect(canal.cerrado).toBe(true);
  });

  it("si el canal falla, la caja no se entera: ninguna operación lanza", () => {
    const canal: Canal = {
      onmessage: null,
      postMessage: () => { throw new Error("InvalidStateError"); },
      close: () => { throw new Error("InvalidStateError"); },
    };
    const p = crearPublicador(canal, () => NEGOCIO);
    expect(() => p.anunciar()).not.toThrow();
    expect(() => p.publicar({ fase: "cobro", total: 50 })).not.toThrow();
    expect(() => p.latir()).not.toThrow();
    expect(() => canal.onmessage?.({ data: { tipo: "hola", v: 1 } })).not.toThrow();
    expect(() => p.cerrar()).not.toThrow();
    expect(canal.onmessage).toBeNull();
  });
});

describe("crearPublicador: «¡Gracias!» no se queda para siempre", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const PAGADO: VistaCliente = { fase: "pagado", total: 200, cambio: 50 };
  const REPOSO = { tipo: "estado", v: 1, vista: { fase: "reposo" } };

  it("a los 8 s manda reposo aunque la caja siga en «Cobro completado», y deja de latir", () => {
    expect(PAGADO_MAX_MS).toBe(8000);
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar(PAGADO);
    enviados.length = 0;
    vi.advanceTimersByTime(PAGADO_MAX_MS - 1);
    expect(enviados).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(enviados).toEqual([REPOSO]);
    enviados.length = 0;
    p.latir();
    expect(enviados).toEqual([]);
  });

  it("el latido repite «pagado» pero no alarga el tope", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar(PAGADO);
    vi.advanceTimersByTime(5000);
    p.latir();
    expect(enviados.at(-1)).toEqual({ tipo: "estado", v: 1, vista: PAGADO });
    vi.advanceTimersByTime(3000);
    expect(enviados.at(-1)).toEqual(REPOSO);
  });

  it("si la caja publica otra cosa antes, a los 8 s no se manda nada de más", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar(PAGADO);
    vi.advanceTimersByTime(3000);
    const cuenta: VistaCliente = { fase: "cuenta", renglones: [], envio: null, total: 90 };
    p.publicar(cuenta);
    enviados.length = 0;
    vi.advanceTimersByTime(60_000);
    expect(enviados).toEqual([]);
    p.latir();
    expect(enviados).toEqual([{ tipo: "estado", v: 1, vista: cuenta }]);
  });

  it("una pantalla que saluda después del tope recibe reposo", () => {
    const { canal, enviados } = canalFalso();
    crearPublicador(canal, () => NEGOCIO).publicar(PAGADO);
    vi.advanceTimersByTime(PAGADO_MAX_MS);
    enviados.length = 0;
    canal.onmessage?.({ data: { tipo: "hola", v: 1 } });
    expect(enviados).toEqual([{ tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null }, REPOSO]);
  });

  it("cerrar antes de los 8 s no deja nada pendiente", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar(PAGADO);
    p.cerrar();
    enviados.length = 0;
    vi.advanceTimersByTime(60_000);
    expect(enviados).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("las demás fases no arman ningún temporizador", () => {
    const { canal } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    p.publicar({ fase: "reposo" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("crearReceptor", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const CUENTA: VistaCliente = { fase: "cuenta", renglones: [], envio: null, total: 90 };
  const estado = (vista: VistaCliente) => ({ data: { tipo: "estado", v: 1, vista } });

  function montarReceptor() {
    const { canal, enviados } = canalFalso();
    const vistas: VistaCliente[] = [];
    const negocios: Negocio[] = [];
    const r = crearReceptor(canal, { alCambiarVista: (v) => vistas.push(v), alNegocio: (n) => negocios.push(n) });
    return { canal, enviados, vistas, negocios, r };
  }

  it("saluda al crearse", () => {
    const { enviados } = montarReceptor();
    expect(enviados).toEqual([{ tipo: "hola", v: 1 }]);
  });

  it("un estado cambia la vista", () => {
    const { canal, vistas } = montarReceptor();
    canal.onmessage?.(estado(CUENTA));
    expect(vistas).toEqual([CUENTA]);
  });

  it("15 s sin mensajes: vuelve a reposo", () => {
    const { canal, vistas } = montarReceptor();
    canal.onmessage?.(estado(CUENTA));
    vi.advanceTimersByTime(SILENCIO_MS - 1);
    expect(vistas).toEqual([CUENTA]);
    vi.advanceTimersByTime(1);
    expect(vistas).toEqual([CUENTA, { fase: "reposo" }]);
  });

  it("un mensaje a los 10 s vuelve a contar los 15", () => {
    const { canal, vistas } = montarReceptor();
    canal.onmessage?.(estado(CUENTA));
    vi.advanceTimersByTime(10_000);
    canal.onmessage?.(estado(CUENTA));
    vi.advanceTimersByTime(10_000); // 20 s desde el primero, 10 desde el segundo
    expect(vistas).toEqual([CUENTA, CUENTA]);
    vi.advanceTimersByTime(5000);
    expect(vistas).toEqual([CUENTA, CUENTA, { fase: "reposo" }]);
  });

  it("un mensaje inválido deja la última vista válida y no vuelve a contar", () => {
    const { canal, vistas } = montarReceptor();
    canal.onmessage?.(estado(CUENTA));
    vi.advanceTimersByTime(10_000);
    canal.onmessage?.({ data: { tipo: "estado", v: 2, vista: { fase: "reposo" } } });
    canal.onmessage?.({ data: "basura" });
    canal.onmessage?.({ data: { tipo: "hola", v: 1 } }); // válido, pero no es para la pantalla
    expect(vistas).toEqual([CUENTA]);
    vi.advanceTimersByTime(5000); // 15 s desde el único mensaje bueno
    expect(vistas).toEqual([CUENTA, { fase: "reposo" }]);
  });

  it("reposo no arma temporizador, y apaga el que hubiera", () => {
    const { canal, vistas } = montarReceptor();
    canal.onmessage?.(estado({ fase: "reposo" }));
    expect(vi.getTimerCount()).toBe(0);
    canal.onmessage?.(estado(CUENTA));
    expect(vi.getTimerCount()).toBe(1);
    canal.onmessage?.(estado({ fase: "reposo" }));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(vistas).toEqual([{ fase: "reposo" }, CUENTA, { fase: "reposo" }]);
  });

  it("el mensaje del negocio llega a alNegocio y no toca la vista ni el silencio", () => {
    const { canal, vistas, negocios } = montarReceptor();
    canal.onmessage?.({ data: { tipo: "negocio", v: 1, nombre: "Knock-Out Burger", logoUrl: "data:image/png;base64,AAAA" } });
    expect(negocios).toEqual([{ nombre: "Knock-Out Burger", logoUrl: "data:image/png;base64,AAAA" }]);
    expect(vistas).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cerrar apaga el temporizador, suelta el canal y lo cierra", () => {
    const { canal, vistas, r } = montarReceptor();
    canal.onmessage?.(estado(CUENTA));
    r.cerrar();
    expect(vi.getTimerCount()).toBe(0);
    expect(canal.onmessage).toBeNull();
    expect(canal.cerrado).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(vistas).toEqual([CUENTA]);
  });

  it("un canal que falla no rompe la pantalla", () => {
    const canal: Canal = {
      onmessage: null,
      postMessage: () => { throw new Error("InvalidStateError"); },
      close: () => { throw new Error("InvalidStateError"); },
    };
    let r: ReturnType<typeof crearReceptor> | undefined;
    expect(() => { r = crearReceptor(canal, { alCambiarVista: () => {}, alNegocio: () => {} }); }).not.toThrow();
    expect(() => r?.cerrar()).not.toThrow();
  });
});

describe("el negocio que recuerda la pantalla", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function almacenFalso() {
    const datos = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v); },
      removeItem: (k: string) => { datos.delete(k); },
    });
    return datos;
  }

  it("lo guarda y lo vuelve a leer", () => {
    const datos = almacenFalso();
    expect(negocioGuardado()).toBeNull();
    recordarNegocio({ nombre: "Knock-Out Burger", logoUrl: null });
    expect(datos.has(CLAVE_NEGOCIO)).toBe(true);
    expect(negocioGuardado()).toEqual({ nombre: "Knock-Out Burger", logoUrl: null });
  });

  it("al desvincular la caja se olvida: el logo de un negocio no sale en el siguiente", () => {
    const datos = almacenFalso();
    recordarNegocio({ nombre: "Knock-Out Burger", logoUrl: "data:image/png;base64,AAAA" });
    olvidarNegocio();
    expect(datos.has(CLAVE_NEGOCIO)).toBe(false);
    expect(negocioGuardado()).toBeNull();
  });

  it("con basura guardada no hay negocio", () => {
    const datos = almacenFalso();
    datos.set(CLAVE_NEGOCIO, "{no es json");
    expect(negocioGuardado()).toBeNull();
    datos.set(CLAVE_NEGOCIO, JSON.stringify({ logoUrl: "x" }));
    expect(negocioGuardado()).toBeNull();
  });

  it("sin almacenamiento, o con uno que lanza, nada truena", () => {
    expect(() => { olvidarNegocio(); recordarNegocio(NEGOCIO); }).not.toThrow();
    expect(negocioGuardado()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => { olvidarNegocio(); recordarNegocio(NEGOCIO); }).not.toThrow();
    expect(negocioGuardado()).toBeNull();
  });
});

describe("tamanoNombre", () => {
  const cabeEnUnaLinea = (nombre: string, conLogo: boolean) => tamanoNombre(nombre, conLogo) * anchoEm(nombre) <= ANCHO_NOMBRE_VMIN;

  it("«Knock-Out Burger» cabe en una línea, con logo y sin él, sin encogerse al piso", () => {
    expect(tamanoNombre("Knock-Out Burger", true)).toBe(7);
    expect(cabeEnUnaLinea("Knock-Out Burger", true)).toBe(true);
    expect(cabeEnUnaLinea("Knock-Out Burger", false)).toBe(true);
    expect(tamanoNombre("Knock-Out Burger", false)).toBeGreaterThan(7);
  });

  it("un nombre corto sin logo llega a su tope, mayor que con logo", () => {
    expect(tamanoNombre("Tacos", false)).toBe(10);
    expect(tamanoNombre("Tacos", true)).toBe(7);
  });

  it("un nombre larguísimo se parte por palabras, y cada palabra cabe", () => {
    const nombre = "Taquería y Mariscos El Güero de León Centro Histórico";
    const t = tamanoNombre(nombre, false);
    expect(cabeEnUnaLinea(nombre, false)).toBe(false);
    expect(t).toBe(6);
    for (const palabra of nombre.split(" ")) expect(t * anchoEm(palabra)).toBeLessThanOrEqual(ANCHO_NOMBRE_VMIN);
  });

  it("una sola palabra enorme se encoge hasta caber", () => {
    const palabra = "Supercalifragilisticoespialidoso";
    const t = tamanoNombre(palabra, false);
    expect(t).toBeLessThan(6);
    expect(t * anchoEm(palabra)).toBeLessThanOrEqual(ANCHO_NOMBRE_VMIN);
  });
});

const M1 = { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true };
const M2 = { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false };
const base: AjustePantalla = { disponible: true, modo: "auto", displayId: null, abierta: false, monitores: [M1] };

describe("textoEstadoPantalla", () => {
  it("sin segundo monitor lo dice", () => {
    expect(textoEstadoPantalla(base)).toBe("No hay un segundo monitor conectado. Revisa que Windows esté en «Extender» y no en «Duplicar».");
  });
  it("abierta dice en cuál", () => {
    expect(textoEstadoPantalla({ ...base, abierta: true, monitores: [M1, M2] })).toBe("Abierta en HDMI (1024×768).");
  });
  it("con varios candidatos nombra el elegido, no el primero", () => {
    const M3 = { id: 3, etiqueta: "DisplayPort", ancho: 1280, alto: 1024, esDeLaCaja: false };
    expect(textoEstadoPantalla({ ...base, abierta: true, displayId: 3, monitores: [M1, M2, M3] })).toBe("Abierta en DisplayPort (1280×1024).");
  });
  it("hay monitor pero no se abrió: lo dice", () => {
    expect(textoEstadoPantalla({ ...base, abierta: false, monitores: [M1, M2] })).toBe("Hay un segundo monitor, pero la pantalla no se abrió.");
  });
  it("apagada lo dice aunque haya monitor", () => {
    expect(textoEstadoPantalla({ ...base, modo: "apagada", monitores: [M1, M2] })).toBe("Apagada.");
  });
});

describe("siguienteAnuncio", () => {
  const ids = ["a", "b", "c"];
  it("empieza por el primero y da la vuelta", () => {
    expect(siguienteAnuncio(ids, null, new Set())).toBe("a");
    expect(siguienteAnuncio(ids, "a", new Set())).toBe("b");
    expect(siguienteAnuncio(ids, "c", new Set())).toBe("a");
  });
  it("se salta las imágenes que no cargaron", () => {
    expect(siguienteAnuncio(ids, "a", new Set(["b"]))).toBe("c");
    expect(siguienteAnuncio(ids, null, new Set(["a", "b"]))).toBe("c");
  });
  it("con una sola imagen buena se queda en ella", () => {
    expect(siguienteAnuncio(ids, "c", new Set(["a", "b"]))).toBe("c");
  });
  it("si todas fallaron, o no hay, no hay nada que enseñar", () => {
    expect(siguienteAnuncio(ids, "a", new Set(ids))).toBeNull();
    expect(siguienteAnuncio([], null, new Set())).toBeNull();
  });
  it("si la actual ya no está en la lista, vuelve al principio", () => {
    expect(siguienteAnuncio(ids, "z", new Set())).toBe("a");
  });
});

describe("leerAnuncios", () => {
  const con = (cuerpo: unknown, ok = true) => (async () => ({ ok, json: async () => cuerpo })) as unknown as typeof fetch;
  it("devuelve la lista que da la caja", async () => {
    const lista = { segundos: 12, anuncios: [{ id: "a", url: "/__anuncios/11111111-1111-1111-1111-111111111111.jpg", segundos: 20 }] };
    expect(await leerAnuncios(con(lista))).toEqual(lista);
  });
  const UUID = "11111111-1111-1111-1111-111111111111";
  const conUrl = (url: string) => con({ segundos: 8, anuncios: [{ id: "a", url, segundos: 8 }] });

  it("sin anuncios devuelve la lista vacía, que no es un fallo", async () => {
    expect(await leerAnuncios(con({ segundos: 8, anuncios: [] }))).toEqual(LISTA_VACIA);
  });
  it("una respuesta rara es un fallo (null), no «sin anuncios»", async () => {
    expect(await leerAnuncios(con({ segundos: "x", anuncios: 1 }))).toBeNull();
  });
  it("una respuesta de error es un fallo (null), aunque el cuerpo sea una lista válida", async () => {
    expect(await leerAnuncios(con({ segundos: 8, anuncios: [] }, false))).toBeNull();
  });
  it("la falta de red es un fallo (null), y no lanza", async () => {
    expect(await leerAnuncios((async () => { throw new Error("sin red"); }) as unknown as typeof fetch)).toBeNull();
  });
  it("no acepta direcciones fuera de la carpeta de anuncios de la caja", async () => {
    expect(await leerAnuncios(conUrl("https://otro.example/x.jpg"))).toBeNull();
  });
  it("acepta png y webp, además de jpg", async () => {
    expect((await leerAnuncios(conUrl(`/__anuncios/${UUID}.png`)))?.anuncios[0]?.url).toBe(`/__anuncios/${UUID}.png`);
    expect((await leerAnuncios(conUrl(`/__anuncios/${UUID}.webp`)))?.anuncios[0]?.url).toBe(`/__anuncios/${UUID}.webp`);
  });
  it("no acepta una dirección que se sale de la carpeta", async () => {
    expect(await leerAnuncios(conUrl("/__anuncios/../../../../../../../../secretos/caja.jpg"))).toBeNull();
    expect(await leerAnuncios(conUrl(`/__anuncios/../${UUID}.jpg`))).toBeNull();
    expect(await leerAnuncios(conUrl(`/otra/__anuncios/${UUID}.jpg`))).toBeNull();
  });
  it("no acepta la extensión en mayúsculas ni otro tipo de archivo", async () => {
    expect(await leerAnuncios(conUrl(`/__anuncios/${UUID}.JPG`))).toBeNull();
    expect(await leerAnuncios(conUrl(`/__anuncios/${UUID}.svg`))).toBeNull();
    expect(await leerAnuncios(conUrl(`/__anuncios/${UUID}.jpg.svg`))).toBeNull();
    expect(await leerAnuncios(conUrl(`/__anuncios/${UUID}.jpg/../../secretos`))).toBeNull();
  });
  it("un tiempo por anuncio fuera de rango invalida la lista", async () => {
    expect(await leerAnuncios(con({ segundos: 8, anuncios: [{ id: "a", url: `/__anuncios/${UUID}.jpg`, segundos: 2 }] }))).toBeNull();
  });
});

describe("los anuncios son del negocio de la caja", () => {
  const NEG = { nombre: "Knock-Out", logoUrl: null };
  const conUno: ListaAnuncios = { segundos: 8, anuncios: [{ id: "a", url: "/__anuncios/a.jpg", segundos: 8 }] };

  it("la lista se lee solo en reposo", () => {
    expect(puedeLeerAnuncios("reposo", NEG)).toBe(true);
    for (const fase of ["cuenta", "cobro", "pagado"]) expect(puedeLeerAnuncios(fase, NEG)).toBe(false);
  });
  it("sin negocio conocido no se lee: la caja desvinculada aún puede dar la lista del negocio anterior", () => {
    expect(puedeLeerAnuncios("reposo", null)).toBe(false);
    expect(puedeLeerAnuncios("reposo", undefined)).toBe(false);
  });
  it("con negocio, lista e imágenes buenas se enseña el carrusel", () => {
    expect(seEnsenanAnuncios(conUno, false, NEG)).toBe(true);
  });
  it("al olvidar el negocio se dejan de enseñar aunque la lista siga en memoria", () => {
    expect(seEnsenanAnuncios(conUno, false, null)).toBe(false);
    expect(seEnsenanAnuncios(conUno, false, undefined)).toBe(false);
  });
  it("sin anuncios, o si ninguna imagen cargó, queda el logo", () => {
    expect(seEnsenanAnuncios(LISTA_VACIA, false, NEG)).toBe(false);
    expect(seEnsenanAnuncios(conUno, true, NEG)).toBe(false);
  });
});

describe("listaTrasLeer", () => {
  const tenia: ListaAnuncios = { segundos: 8, anuncios: [{ id: "a", url: "/__anuncios/a.jpg", segundos: 8 }] };

  it("una lectura fallida no quita el carrusel: se queda la lista que había", () => {
    expect(listaTrasLeer(tenia, null)).toBe(tenia);
  });
  it("la misma lista vuelta a leer conserva EL MISMO objeto: el carrusel no se reinicia", () => {
    const otraVez: ListaAnuncios = { segundos: 8, anuncios: [{ id: "a", url: "/__anuncios/a.jpg", segundos: 8 }] };
    expect(listaTrasLeer(tenia, otraVez)).toBe(tenia);
  });
  it("una lista distinta la reemplaza", () => {
    const nueva: ListaAnuncios = { segundos: 8, anuncios: [{ id: "b", url: "/__anuncios/b.jpg", segundos: 8 }] };
    expect(listaTrasLeer(tenia, nueva)).toBe(nueva);
  });
  it("una lista vacía de verdad (el dueño quitó todo) sí quita el carrusel", () => {
    expect(listaTrasLeer(tenia, { segundos: 8, anuncios: [] }).anuncios).toEqual([]);
  });
});

const anuncio = (id: string, segundos = 8, url = `/__anuncios/${id}.jpg`) => ({ id, url, segundos });
const listaDe = (...anuncios: ListaAnuncios["anuncios"]): ListaAnuncios => ({ segundos: 8, anuncios });

describe("mismaLista", () => {
  it("la misma lista vuelta a leer es la misma: el carrusel no se reinicia", () => {
    expect(mismaLista(listaDe(anuncio("a"), anuncio("b", 20)), listaDe(anuncio("a"), anuncio("b", 20)))).toBe(true);
    expect(mismaLista(LISTA_VACIA, { segundos: 8, anuncios: [] })).toBe(true);
  });
  it("cambia si cambia un id, una dirección, un tiempo, el orden o el número de anuncios", () => {
    const a = listaDe(anuncio("a"), anuncio("b"));
    expect(mismaLista(a, listaDe(anuncio("a"), anuncio("c")))).toBe(false);
    expect(mismaLista(a, listaDe(anuncio("a"), anuncio("b", 8, "/__anuncios/b.png")))).toBe(false);
    expect(mismaLista(a, listaDe(anuncio("a"), anuncio("b", 9)))).toBe(false);
    expect(mismaLista(a, listaDe(anuncio("b"), anuncio("a")))).toBe(false);
    expect(mismaLista(a, listaDe(anuncio("a")))).toBe(false);
  });
  it("el tiempo general no cuenta: cada anuncio ya trae el suyo", () => {
    expect(mismaLista({ segundos: 8, anuncios: [anuncio("a")] }, { segundos: 30, anuncios: [anuncio("a")] })).toBe(true);
  });
});

describe("pasoSiguiente", () => {
  const A = anuncio("a", 5), B = anuncio("b", 20), C = anuncio("c", 8);
  const lista = listaDe(A, B, C);
  const nada = new Set<string>();

  it("al empezar enseña la primera de inmediato", () => {
    expect(pasoSiguiente(lista, null, nada)).toEqual({ hacer: "cambiar", anuncio: A, enMs: 0 });
  });
  it("cada imagen dura SUS segundos antes de pasar a la que sigue", () => {
    expect(pasoSiguiente(lista, A, nada)).toEqual({ hacer: "cambiar", anuncio: B, enMs: 5000 });
    expect(pasoSiguiente(lista, B, nada)).toEqual({ hacer: "cambiar", anuncio: C, enMs: 20_000 });
    expect(pasoSiguiente(lista, C, nada)).toEqual({ hacer: "cambiar", anuncio: A, enMs: 8000 });
  });
  it("con una sola imagen no hay nada que esperar: se queda", () => {
    expect(pasoSiguiente(listaDe(A), A, nada)).toEqual({ hacer: "quedarse" });
    expect(pasoSiguiente(lista, A, new Set(["b", "c"]))).toEqual({ hacer: "quedarse" });
  });
  it("la candidata que no cargó se salta, sin cambiar lo que le falta a la que está", () => {
    expect(pasoSiguiente(lista, A, new Set(["b"]))).toEqual({ hacer: "cambiar", anuncio: C, enMs: 5000 });
  });
  it("si la que está en pantalla ya no viene en la lista, se cambia ya", () => {
    const quitada = anuncio("z", 30);
    expect(pasoSiguiente(lista, quitada, nada)).toEqual({ hacer: "cambiar", anuncio: A, enMs: 0 });
  });
  it("si su tiempo cambió en la lista nueva, manda el nuevo", () => {
    expect(pasoSiguiente(listaDe(anuncio("a", 40), B), A, nada)).toEqual({ hacer: "cambiar", anuncio: B, enMs: 40_000 });
  });
  it("mismo id con otra imagen: la de pantalla ya no vale", () => {
    const nueva = anuncio("a", 5, "/__anuncios/a.webp");
    expect(pasoSiguiente(listaDe(nueva), A, nada)).toEqual({ hacer: "cambiar", anuncio: nueva, enMs: 0 });
  });
  it("si la que está en pantalla se rompió, pasa ya a otra; y si no hay otra, nada", () => {
    expect(pasoSiguiente(lista, A, new Set(["a"]))).toEqual({ hacer: "cambiar", anuncio: B, enMs: 0 });
    expect(pasoSiguiente(listaDe(A), A, new Set(["a"]))).toEqual({ hacer: "nada" });
  });
  it("sin ninguna imagen que sirva, nada", () => {
    expect(pasoSiguiente(lista, null, new Set(["a", "b", "c"]))).toEqual({ hacer: "nada" });
    expect(pasoSiguiente(LISTA_VACIA, A, nada)).toEqual({ hacer: "nada" });
  });
});
