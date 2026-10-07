import { describe, expect, it } from "vitest";
import {
  baseDeLealtad, canjeRecortado, cantidad, esFalloAmbiguo, fechaCorta, franjaLealtad, inicioDelDiaMexico,
  maximoCanjeDinero, mensajeErrorLealtad, premiosConFaltante, puntosPorCompra, unidad, type Programa,
} from "../lealtad-reglas";

const P = (x: Partial<Programa>): Programa => ({
  mecanica: "PUNTOS_DINERO", version: 1, porcentaje: null, pesosPorPunto: null, compraMinima: 0, topeComprasDia: 3, ...x,
});

// Los MISMOS seis casos de supabase/scripts/smoke_lealtad_ganar.sql:40-46. Si cambias uno aquí,
// cambia el otro: la caja imprime lo que dice el SQL y la pantalla promete lo que dice esto.
describe("puntosPorCompra — espejo de lealtad_puntos_por_compra", () => {
  it.each([
    ["5% de 200 da 10", P({ porcentaje: 5 }), 200, 10],
    ["se redondea hacia abajo", P({ porcentaje: 5 }), 199.99, 9],
    ["bajo la compra mínima no gana", P({ porcentaje: 5, compraMinima: 100 }), 80, 0],
    ["1 punto por cada $10", P({ mecanica: "PUNTOS_PREMIOS", pesosPorPunto: 10 }), 125, 12],
    ["una visita, un sello", P({ mecanica: "SELLOS" }), 45, 1],
    ["una cuenta en cero no gana", P({ mecanica: "SELLOS" }), 0, 0],
  ])("%s", (_nombre, programa, base, esperado) => {
    expect(puntosPorCompra(programa, base)).toBe(esperado);
  });

  it("no hereda errores de coma flotante: 10% de 0.30 no es 0.03 puntos de más ni de menos", () => {
    expect(puntosPorCompra(P({ porcentaje: 10 }), 110)).toBe(11);
    expect(puntosPorCompra(P({ porcentaje: 15 }), 20)).toBe(3);
    expect(puntosPorCompra(P({ mecanica: "PUNTOS_PREMIOS", pesosPorPunto: 0.1 }), 0.3)).toBe(3);
  });

  it("sin parámetro no gana, y una base que no es número tampoco", () => {
    expect(puntosPorCompra(P({}), 200)).toBe(0);
    expect(puntosPorCompra(P({ mecanica: "PUNTOS_PREMIOS" }), 200)).toBe(0);
    expect(puntosPorCompra(P({ porcentaje: 5 }), Number.NaN)).toBe(0);
  });
});

describe("base y máximo del canje", () => {
  it("la base es lo que se paga por comida: el total sin el envío", () => {
    expect(baseDeLealtad(240, 40)).toBe(200);
    expect(baseDeLealtad(30, 40)).toBe(0);
  });

  it("se puede canjear hasta el menor entre el saldo y la comida, en pesos cerrados", () => {
    expect(maximoCanjeDinero(500, 199.5, 0)).toBe(199);
    expect(maximoCanjeDinero(50, 240, 40)).toBe(50);
    expect(maximoCanjeDinero(0, 240, 0)).toBe(0);
    expect(maximoCanjeDinero(-3, 240, 0)).toBe(0);
  });
});

describe("textos", () => {
  it("puntos o sellos, en singular cuando es uno", () => {
    expect(unidad("SELLOS", 1)).toBe("sello");
    expect(unidad("SELLOS", 4)).toBe("sellos");
    expect(unidad("PUNTOS_DINERO", 1)).toBe("punto");
    expect(cantidad("PUNTOS_PREMIOS", 120)).toBe("120 puntos");
  });

  it("la fecha de vencimiento no se mueve de día por la zona horaria", () => {
    expect(fechaCorta("2027-04-05")).toBe("05/04/2027");
    expect(fechaCorta("2027-04-05T00:00:00+00:00")).toBe("05/04/2027");
  });

  it("el día en México empieza a medianoche de México, no de UTC", () => {
    // 6 oct 2026, 03:30 UTC = 5 oct 2026, 21:30 en México.
    expect(inicioDelDiaMexico(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05T00:00:00-06:00");
    expect(inicioDelDiaMexico(new Date("2026-10-06T18:00:00Z"))).toBe("2026-10-06T00:00:00-06:00");
  });
});

describe("premios", () => {
  const premios = [
    { id: "b", productoId: "p2", nombre: "Hamburguesa", costo: 8 },
    { id: "a", productoId: "p1", nombre: "Refresco", costo: 3 },
  ];

  it("ordena por costo y dice cuánto falta para cada uno", () => {
    expect(premiosConFaltante(premios, 5)).toEqual([
      { id: "a", productoId: "p1", nombre: "Refresco", costo: 3, alcanza: true, falta: 0 },
      { id: "b", productoId: "p2", nombre: "Hamburguesa", costo: 8, alcanza: false, falta: 3 },
    ]);
  });
});

describe("canje recortado", () => {
  it("un canje de dinero que ya no cabe en la cuenta está recortado", () => {
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 30)).toBe(true);
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 0)).toBe(true);
  });

  it("uno que entra completo no, y un premio nunca (su renglón se cancela, no se recorta)", () => {
    expect(canjeRecortado({ ticketItemId: null, monto: 50 }, 50)).toBe(false);
    expect(canjeRecortado({ ticketItemId: "it-1", monto: 120 }, 60)).toBe(false);
    expect(canjeRecortado(null, 0)).toBe(false);
  });
});

describe("franja de lealtad de la cuenta", () => {
  const base = { programa: P({ porcentaje: 5 }), saldo: 120, comprasHoy: 0, base: 200, canje: null, online: true };

  it("con saldo y conexión deja canjear y dice lo que gana", () => {
    expect(franjaLealtad(base)).toEqual({ saldoTexto: "120 puntos", detalle: "Gana 10 puntos con esta compra", boton: "Canjear", puedeAbrir: true });
  });

  it("sin conexión no deja canjear y lo dice", () => {
    expect(franjaLealtad({ ...base, online: false })).toEqual({ saldoTexto: "120 puntos", detalle: "Canje no disponible sin conexión", boton: "Canjear", puedeAbrir: false });
  });

  it("sin saldo no hay qué canjear", () => {
    expect(franjaLealtad({ ...base, saldo: 0 }).puedeAbrir).toBe(false);
  });

  it("al llegar al tope del día avisa que esta compra ya no suma", () => {
    expect(franjaLealtad({ ...base, comprasHoy: 3 }).detalle).toBe("Hoy ya no suma: tope de 3 compras al día");
  });

  it("con un canje a medias se puede abrir siempre, con saldo en cero y sin conexión: hay que poder resolverlo", () => {
    expect(franjaLealtad({ ...base, saldo: 0, online: false, pendiente: { puntos: 120 } })).toEqual({
      saldoTexto: "0 puntos", detalle: "Canje a medias: 120 puntos", boton: "Ver canje", puedeAbrir: true,
    });
  });

  it("si además hay un canje aplicado, manda el aplicado", () => {
    expect(franjaLealtad({ ...base, canje: { puntos: 50 }, pendiente: { puntos: 120 } })).toEqual({
      saldoTexto: "120 puntos", detalle: "Canje aplicado: 50 puntos", boton: "Ver canje", puedeAbrir: true,
    });
  });

  it("sin canje a medias (null) nada cambia", () => {
    expect(franjaLealtad({ ...base, saldo: 0, pendiente: null }).puedeAbrir).toBe(false);
  });

  it("con tope de una compra al día lo dice en singular", () => {
    const uno = { ...base, programa: P({ porcentaje: 5, topeComprasDia: 1 }), comprasHoy: 1 };
    expect(franjaLealtad(uno).detalle).toBe("Hoy ya no suma: tope de 1 compra al día");
  });

  it("si la compra no gana nada, no promete nada", () => {
    expect(franjaLealtad({ ...base, base: 10 }).detalle).toBeNull();
  });

  it("con un canje aplicado se puede abrir siempre, también sin conexión: quitarlo no necesita nube", () => {
    expect(franjaLealtad({ ...base, online: false, saldo: 0, canje: { puntos: 50 } })).toEqual({
      saldoTexto: "0 puntos", detalle: "Canje aplicado: 50 puntos", boton: "Ver canje", puedeAbrir: true,
    });
  });
});

describe("errores del canje", () => {
  it("cada código que el cajero puede ver tiene un texto en español, sin el código en crudo", () => {
    for (const c of ["SIN_RED", "FUNCION_REQUIERE_NUBE", "SIN_MODULO_LEALTAD", "MODULO_APAGADO", "SOLO_EMPLEADO", "SIN_PROGRAMA",
      "CLIENTE_NO_EXISTE", "SALDO_INSUFICIENTE", "PREMIO_INVALIDO", "PUNTOS_INVALIDOS", "CANJE_REVERTIDO", "CANJE_DE_OTRA_CUENTA",
      "CANJE_DE_OTRA_CAJA", "TICKET_YA_TIENE_CANJE", "TICKET_NO_ABIERTO", "TICKET_SIN_CLIENTE", "CLIENTE_NO_COINCIDE", "RENGLON_NO_ES_PREMIO"]) {
      expect(mensajeErrorLealtad(c)).not.toContain(c);
    }
  });

  it("un código desconocido se muestra, para poder reportarlo", () => {
    expect(mensajeErrorLealtad("ALGO_RARO")).toBe("No se pudo completar el canje (ALGO_RARO).");
  });

  it("ambiguo = no se sabe si la nube alcanzó a descontar; se reintenta con el mismo canje", () => {
    for (const c of ["SIN_RED", "RESPUESTA_INVALIDA", "ERROR_INTERNO", "HTTP_502", "HTTP_500"]) expect(esFalloAmbiguo(c)).toBe(true);
    for (const c of ["SALDO_INSUFICIENTE", "FUNCION_REQUIERE_NUBE", "SIN_MODULO_LEALTAD", "HTTP_403", "CANJE_REVERTIDO"]) expect(esFalloAmbiguo(c)).toBe(false);
  });
});
