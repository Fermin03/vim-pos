import { describe, it, expect } from "vitest";
import {
  segundosRestantes, etiquetaApp, etiquetaEstado, ordenarPedidos, etiquetaAlergia, pedidoConAlergia,
  etiquetaModificadores, itemsDesdeJson, pedidoDesdeFila, sinCerradosViejos, type PedidoApp, type PedidoAppItem,
} from "../pedidos-apps";

const base = (extra: Partial<PedidoApp>): PedidoApp => ({
  id: "x", app: "APP_UBEREATS", idExterno: "e", folioCorto: null, estado: "RECIBIDO", tipoEntrega: null, clienteNombre: null,
  notaCliente: null, items: [], totalCliente: null, venceAceptacion: null, recibidoAt: "2026-09-02T10:00:00Z", ticketId: null,
  ticketFolio: null, ultimoError: null, canal: "APP", clienteTelefono: null, direccion: null, pago: null, envio: null,
  gestion: null, gestionCajaId: null, ticketCajaId: null, comandaImpresa: false, ...extra,
});
const item = (extra: Partial<PedidoAppItem>): PedidoAppItem => ({
  nombreApp: "Hamburguesa", cantidad: 1, precioUnitario: 100, nota: null, mapeado: true, alergenos: [], alergiaNota: null, modificadores: [], ...extra,
});

describe("pedidos de apps · helpers", () => {
  it("segundosRestantes cuenta hacia la ventana y nunca baja de 0", () => {
    const ahora = new Date("2026-09-02T10:00:00Z");
    expect(segundosRestantes("2026-09-02T10:11:00Z", ahora)).toBe(660);
    expect(segundosRestantes("2026-09-02T09:59:00Z", ahora)).toBe(0);
    expect(segundosRestantes(null, ahora)).toBeNull();
  });

  it("etiquetas en español", () => {
    expect(etiquetaApp("APP_UBEREATS")).toBe("Uber Eats");
    expect(etiquetaApp("APP_DIDI")).toBe("DiDi Food");
    expect(etiquetaApp("APP_RAPPI")).toBe("Rappi");
    expect(etiquetaEstado("RECIBIDO")).toBe("Por aceptar");
    expect(etiquetaEstado("ACEPTADO")).toBe("En preparación");
    expect(etiquetaEstado("LISTO")).toBe("Listo");
    expect(etiquetaEstado("EXPIRADO")).toBe("Expirado");
  });

  it("ordenarPedidos: pendientes con menos tiempo primero, luego aceptados, luego cerrados", () => {
    const p = [
      base({ id: "a", estado: "LISTO" }),
      base({ id: "b", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:11:00Z" }),
      base({ id: "c", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:05:00Z" }),
      base({ id: "d", estado: "ACEPTADO" }),
      base({ id: "e", estado: "CANCELADO" }),
    ];
    expect(ordenarPedidos(p).map((x) => x.id)).toEqual(["c", "b", "d", "a", "e"]);
  });
});

// ── Tienda de Uber y expirados (spec A6) ─────────────────────────────────────
import { beforeAll } from "vitest";
import { etiquetaTienda, hayExpiradosSinVer, marcarExpiradosVistos, mensajeErrorTienda, OPCIONES_PAUSA, horaCorta } from "../pedidos-apps";

describe("tienda de Uber · helpers", () => {
  beforeAll(() => {
    const mapa = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => { mapa.set(k, v); }, removeItem: (k: string) => { mapa.delete(k); }, clear: () => mapa.clear() },
      configurable: true,
    });
  });

  it("etiquetaTienda: en línea, pausada hasta HH:mm en hora de León, sin datos", () => {
    const base = { hasta: null, motivo: null, consultado_at: "2026-09-02T18:10:00Z" };
    expect(etiquetaTienda({ ...base, estado: "EN_LINEA" })).toBe("Uber: en línea");
    expect(etiquetaTienda({ ...base, estado: "PAUSADA", hasta: "2026-09-02T18:40:00Z" })).toBe("Uber: pausada hasta 12:40");
    expect(etiquetaTienda({ ...base, estado: "PAUSADA" })).toBe("Uber: pausada");
    expect(etiquetaTienda({ ...base, estado: "DESCONOCIDO" })).toBe("Uber: sin datos");
    expect(etiquetaTienda(null)).toBe("Uber: sin datos");
    expect(horaCorta("no-es-fecha")).toBeNull();
  });

  it("hayExpiradosSinVer: solo si hay expirados posteriores a lo último visto en este dispositivo", () => {
    localStorage.clear();
    expect(hayExpiradosSinVer(null)).toBe(false);
    expect(hayExpiradosSinVer("2026-09-02T18:00:00Z")).toBe(true);
    marcarExpiradosVistos("2026-09-02T18:00:00Z");
    expect(hayExpiradosSinVer("2026-09-02T18:00:00Z")).toBe(false);
    expect(hayExpiradosSinVer("2026-09-02T18:05:00Z")).toBe(true);
  });

  it("mensajes y opciones de pausa", () => {
    expect(mensajeErrorTienda("TIENDA_ESTRATEGIA_UBER")).toMatch(/Uber Eats Manager/);
    expect(mensajeErrorTienda("SIN_CONEXION_UBER")).toMatch(/no tiene conectada/);
    expect(mensajeErrorTienda("SIN_MODULO_DELIVERY")).toMatch(/apagadas/);
    expect(mensajeErrorTienda("PREP_FUERA_DE_RANGO")).toMatch(/1 y 180/);
    expect(OPCIONES_PAUSA.map((o) => o.codigo)).toEqual(["30m", "1h", "dia"]);
  });
});

describe("alergias (A7)", () => {
  it("etiquetaAlergia arma la lista y el texto; null sin alergia", () => {
    expect(etiquetaAlergia(item({ alergenos: ["cacahuate", "lácteos"], alergiaNota: "alergia fuerte" }))).toBe("ALERGIA: cacahuate, lácteos — “alergia fuerte”");
    expect(etiquetaAlergia(item({ alergenos: ["gluten"] }))).toBe("ALERGIA: gluten");
    expect(etiquetaAlergia(item({ alergiaNota: "sin kiwi" }))).toBe("ALERGIA: ver nota — “sin kiwi”");
    expect(etiquetaAlergia(item({}))).toBeNull();
  });
  it("pedidoConAlergia mira todos los ítems", () => {
    expect(pedidoConAlergia(base({ items: [item({}), item({ alergenos: ["soya"] })] }))).toBe(true);
    expect(pedidoConAlergia(base({ items: [item({}), item({})] }))).toBe(false);
  });
});

// ── Combos: el segundo nivel de modificadores (los extras sobre un componente) ──────────────
describe("etiquetaModificadores: los extras van pegados a su componente", () => {
  it("sin modificadores → cadena vacía", () => {
    expect(etiquetaModificadores([])).toBe("");
  });

  it("un modificador de primer nivel sin anidados, igual que antes", () => {
    expect(etiquetaModificadores([{ nombreApp: "Papas Sencillas", cantidad: 1 }])).toBe("Papas Sencillas");
  });

  it("respeta la cantidad > 1 en primer nivel, igual que antes", () => {
    expect(etiquetaModificadores([{ nombreApp: "Extra queso", cantidad: 2 }, { nombreApp: "Sin cebolla", cantidad: 1 }]))
      .toBe("2× Extra queso, Sin cebolla");
  });

  it("un componente de combo con un extra anidado: el extra va entre paréntesis, pegado al componente", () => {
    expect(etiquetaModificadores([
      { nombreApp: "Cheese Burger", cantidad: 1, modificadores: [{ nombreApp: "extra queso", cantidad: 1 }] },
      { nombreApp: "Papas Sencillas", cantidad: 1 },
      { nombreApp: "Coca Cola", cantidad: 1 },
    ])).toBe("Cheese Burger (extra queso), Papas Sencillas, Coca Cola");
  });

  it("varios extras sobre varios componentes, con cantidades en ambos niveles", () => {
    expect(etiquetaModificadores([
      { nombreApp: "Cheese Burger", cantidad: 1, modificadores: [{ nombreApp: "Término medio", cantidad: 1 }, { nombreApp: "Extra queso", cantidad: 2 }] },
      { nombreApp: "Papas Grandes", cantidad: 2, modificadores: [{ nombreApp: "Extra salsa", cantidad: 1 }] },
    ])).toBe("Cheese Burger (Término medio, 2× Extra queso), 2× Papas Grandes (Extra salsa)");
  });

  it("modificadores anidado presente pero vacío se trata igual que ausente", () => {
    expect(etiquetaModificadores([{ nombreApp: "Papas Sencillas", cantidad: 1, modificadores: [] }])).toBe("Papas Sencillas");
  });

  it("un anidado sin nombre no genera paréntesis vacíos", () => {
    expect(etiquetaModificadores([{ nombreApp: "Cheese Burger", cantidad: 1, modificadores: [{ nombreApp: "", cantidad: 1 }] }]))
      .toBe("Cheese Burger");
    expect(etiquetaModificadores([{ nombreApp: "Cheese Burger", cantidad: 1, modificadores: [{ nombreApp: "  ", cantidad: 1 }, { nombreApp: "extra queso", cantidad: 1 }] }]))
      .toBe("Cheese Burger (extra queso)");
  });
});

describe("itemsDesdeJson: conserva el segundo nivel al leer el pedido", () => {
  it("un combo con extras sobre dos de sus componentes (pedido real con dos combos)", () => {
    const crudo = [
      {
        nombre_app: "Combo Knock-Out", cantidad: 1, precio_unitario_mxn: "180.00", nota: null, alergenos: [], alergia_nota: null, producto_id: "p1",
        modificadores: [
          { nombre_app: "Cheese Burger", cantidad: 1, modificadores: [{ nombre_app: "extra queso", cantidad: 1 }] },
          { nombre_app: "Papas Sencillas", cantidad: 1 },
          { nombre_app: "Coca Cola", cantidad: 1 },
        ],
      },
    ];
    const [it0] = itemsDesdeJson(crudo);
    expect(it0.modificadores[0]).toEqual({ nombreApp: "Cheese Burger", cantidad: 1, modificadores: [{ nombreApp: "extra queso", cantidad: 1 }] });
    expect(it0.modificadores[1]).toEqual({ nombreApp: "Papas Sencillas", cantidad: 1 });
    expect(it0.modificadores[1].modificadores).toBeUndefined();
  });

  it("sin modificadores en absoluto: se ve igual que hoy (array vacío)", () => {
    const crudo = [{ nombre_app: "Refresco", cantidad: 1, precio_unitario_mxn: "30.00", producto_id: "p2" }];
    expect(itemsDesdeJson(crudo)[0].modificadores).toEqual([]);
  });

  it("modificadores de un solo nivel (el caso de hoy, sin combo): no gana un array vacío colgando", () => {
    const crudo = [{ nombre_app: "Hamburguesa", cantidad: 1, precio_unitario_mxn: "90.00", producto_id: "p3", modificadores: [{ nombre_app: "Sin cebolla", cantidad: 1 }] }];
    expect(itemsDesdeJson(crudo)[0].modificadores).toEqual([{ nombreApp: "Sin cebolla", cantidad: 1 }]);
  });

  it("un anidado con modificadores: [] explícito en el JSON crudo: el parseo ya lo omite, no solo el render", () => {
    const crudo = [{
      nombre_app: "Combo Knock-Out", cantidad: 1, precio_unitario_mxn: "180.00", producto_id: "p1",
      modificadores: [{ nombre_app: "Cheese Burger", cantidad: 1, modificadores: [] }],
    }];
    const [it0] = itemsDesdeJson(crudo);
    expect(it0.modificadores[0]).toEqual({ nombreApp: "Cheese Burger", cantidad: 1 });
    expect(it0.modificadores[0].modificadores).toBeUndefined();
    expect("modificadores" in it0.modificadores[0]).toBe(false);
  });
});

describe("pedidoDesdeFila", () => {
  const fila = { id: "p", app: "APP_UBEREATS", id_externo: "e", estado: "RECIBIDO", recibido_at: "2026-09-02T10:00:00Z", items: [] };
  it("una fila de Uber sin las columnas nuevas es canal APP y todo lo nuevo vacío", () => {
    expect(pedidoDesdeFila(fila)).toMatchObject({
      canal: "APP", clienteTelefono: null, direccion: null, pago: null, envio: null, gestion: null, ticketCajaId: null, comandaImpresa: false,
    });
  });
  it("una fila de la tienda a domicilio trae dirección en una línea, pago, envío y datos del ticket", () => {
    const p = pedidoDesdeFila({
      ...fila, app: "DELIVERY_PROPIO", canal: "TIENDA", cliente_telefono: "4771112233", gestion: "NUBE",
      direccion: { calle: "Hidalgo", numero_exterior: "12", numero_interior: "3", colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Gto", referencias: "Portón negro" },
      pago_al_recibir: "EFECTIVO", paga_con_mxn: "500.00", envio_mxn: "30.00",
      ticket: { folio_completo: "A-1", caja_id: "c1", comanda_impresa_at: "2026-10-09T10:00:00Z" },
    });
    expect(p).toMatchObject({
      canal: "TIENDA", clienteTelefono: "4771112233", gestion: "NUBE", envio: 30, ticketFolio: "A-1", ticketCajaId: "c1", comandaImpresa: true,
      pago: { forma: "EFECTIVO", pagaCon: 500 },
      direccion: { texto: "Hidalgo 12, int. 3, Centro, C.P. 37000, León", referencias: "Portón negro" },
    });
  });
  it("etiquetaApp nombra la tienda", () => {
    expect(etiquetaApp("DRIVE_THRU")).toBe("Tienda");
  });
});

describe("pedido de la tienda atendido desde el POS web (gestión NUBE): el estado sale del ticket", () => {
  const base = { id: "p", app: "DRIVE_THRU", canal: "TIENDA", gestion: "NUBE", id_externo: "e", estado: "ACEPTADO", recibido_at: "2026-10-09T10:00:00Z", items: [], ticket_id: "t1" };
  const con = (ticket: Record<string, unknown>, extra: Record<string, unknown> = {}) => pedidoDesdeFila({ ...base, ...extra, ticket: { folio_completo: "A-1", ...ticket } }).estado;
  it("misma regla que tienda_seguimiento: cancelado, cobrado o facturado, impreso", () => {
    expect(con({ estado_fiscal: "ABIERTO" })).toBe("ACEPTADO");
    expect(con({ estado_fiscal: "ABIERTO", ticket_impreso_at: "2026-10-09T10:05:00Z" })).toBe("LISTO");
    expect(con({ estado_fiscal: "PAGADO" })).toBe("ENTREGADO");
    expect(con({ estado_fiscal: "FACTURADO", ticket_impreso_at: "2026-10-09T10:05:00Z" })).toBe("ENTREGADO");
    expect(con({ estado_fiscal: "CANCELADO", ticket_impreso_at: "2026-10-09T10:05:00Z" })).toBe("CANCELADO");
    expect(con({ estado_fiscal: "PAGADO" }, { estado: "LISTO" })).toBe("ENTREGADO");
    expect(con({ estado_fiscal: "PAGADO" }, { estado: "EN_PREPARACION" })).toBe("ENTREGADO");
  });
  it("no se deriva fuera de eso: sin ticket, por aceptar, ya cerrado, de una caja instalada o de una app", () => {
    expect(pedidoDesdeFila({ ...base, ticket: null }).estado).toBe("ACEPTADO");
    expect(con({ estado_fiscal: "PAGADO" }, { estado: "RECIBIDO" })).toBe("RECIBIDO");
    expect(con({ estado_fiscal: "PAGADO" }, { estado: "EXPIRADO" })).toBe("EXPIRADO");
    expect(con({ estado_fiscal: "PAGADO" }, { gestion: "ESCRITORIO" })).toBe("ACEPTADO");
    expect(con({ estado_fiscal: "PAGADO" }, { canal: "APP", app: "APP_UBEREATS" })).toBe("ACEPTADO");
  });
  it("uno ya cobrado o cancelado deja de listarse pasada la media hora; los vivos siguen", () => {
    const desde = "2026-10-09T12:00:00Z";
    const p = (id: string, ticket: Record<string, unknown>, recibido_at: string) => pedidoDesdeFila({ ...base, id, recibido_at, ticket });
    const lista = [
      p("vivo-viejo", { estado_fiscal: "ABIERTO" }, "2026-10-08T09:00:00Z"),
      p("cobrado-viejo", { estado_fiscal: "PAGADO" }, "2026-10-08T09:00:00Z"),
      p("cancelado-viejo", { estado_fiscal: "CANCELADO" }, "2026-10-09T11:59:59Z"),
      p("cobrado-reciente", { estado_fiscal: "PAGADO" }, "2026-10-09T12:10:00Z"),
    ];
    expect(sinCerradosViejos(lista, desde).map((x) => x.id)).toEqual(["vivo-viejo", "cobrado-reciente"]);
  });
});
