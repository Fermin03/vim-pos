// La pausa del pago en línea tras un rechazo por riesgo, y el modo de prueba, vistos desde la tienda:
// qué se lee del servidor, qué hace la pantalla con ello, qué recuerda el teléfono y qué se dice.
import { describe, expect, it } from "vitest";
import type { Almacen } from "../carrito";
import { errorDe, negocioDe, seguimientoDe } from "../contrato";
import { desenlaceDelError, enviarPedido, intentoDeCompra, pruebaQueNoHuboCobro, resolverDuda } from "../envio";
import { PAUSA_POR_OMISION_MS, aPartirDe, dondeDeLaPausa, finDeLaPausa, guardarPausa, leerPausa, lineaDePausa, textoDePausa } from "../pausa";
import { pasosDe, pasoDelDesenlace } from "../pasos";
import { MODO_DE_PRUEBA, textoDeError } from "../textos";
import { pasoDelReto } from "../verificacion";
import { cotizacionCruda, negocioCrudo, seguimientoCrudo } from "./datos";

const AHORA = Date.parse("2026-10-13T20:00:00.000Z");      // 2:00 p. m. en el centro de México
const HASTA = "2026-10-13T20:30:00.000Z";                  // 2:30 p. m.
const c = { telefono: "4771234567", horario: {}, otrasFormas: true };
const memoria = (): Almacen & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); }, removeItem: (k) => { datos.delete(k); } };
};

describe("lo que el servidor dice de la pausa", () => {
  it("`hasta` se lee solo si es una hora con la forma que manda la función; lo demás no es una hora", () => {
    expect(errorDe({ error: "PAGO_EN_PAUSA", hasta: HASTA })).toEqual({ error: "PAGO_EN_PAUSA", detalle: null, hasta: HASTA });
    expect(errorDe({ error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: "2026-10-13T20:30:00.123456Z" })).toEqual({ error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: "2026-10-13T20:30:00.123456Z" });
    for (const hasta of [undefined, null, "", "mañana", 1760387400000, "2026-10-13", "2026-10-13T20:30:00+00:00", "<script>", `${HASTA} y más`, { hasta: HASTA }]) {
      expect(errorDe({ error: "PAGO_EN_PAUSA", hasta }), String(hasta)).toEqual({ error: "PAGO_EN_PAUSA", detalle: null });
    }
    // Un error de siempre sale como siempre: sin la clave.
    expect(errorDe({ error: "PAGO_RECHAZADO", detalle: "FONDOS" })).toEqual({ error: "PAGO_RECHAZADO", detalle: "FONDOS" });
  });

  it("un rechazo por RIESGO y un intento durante la pausa NO son «corrige y reintenta»: son la pausa, con su hora", () => {
    expect(desenlaceDelError({ error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: HASTA }, c)).toEqual({ tipo: "pausa", hasta: HASTA, rechazado: true });
    expect(desenlaceDelError({ error: "PAGO_EN_PAUSA", detalle: null, hasta: HASTA }, c)).toEqual({ tipo: "pausa", hasta: HASTA, rechazado: false });
    // Sin hora (una función que no la mandó, o ilegible): sigue siendo la pausa.
    expect(desenlaceDelError({ error: "PAGO_RECHAZADO", detalle: "RIESGO" }, c)).toEqual({ tipo: "pausa", hasta: null, rechazado: true });
    expect(desenlaceDelError({ error: "PAGO_EN_PAUSA", detalle: null }, { ...c, otrasFormas: false })).toEqual({ tipo: "pausa", hasta: null, rechazado: false });
  });

  it("los demás rechazos siguen como siempre: junto a la tarjeta, se corrige y se reintenta", () => {
    for (const detalle of ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "VERIFICACION", "SIN_VERIFICAR", "OTRO", null]) {
      expect(desenlaceDelError({ error: "PAGO_RECHAZADO", detalle }, c).tipo, String(detalle)).toBe("tarjeta");
    }
    expect(desenlaceDelError({ error: "PAGO_NO_PROCESADO", detalle: null }, c).tipo).toBe("tarjeta");
  });

  it("la pausa se queda en la pantalla en la que está: no manda a corregir ningún dato", () => {
    expect(pasoDelDesenlace({ tipo: "pausa", hasta: HASTA, rechazado: true }, pasosDe(["EFECTIVO", "EN_LINEA"], "EN_LINEA"))).toBeNull();
  });

  it("`pedir` que contesta la pausa entrega ese desenlace y su código (el antirobot ya se gastó)", async () => {
    const r = await enviarPedido({
      cotizar: async () => ({ ok: true, datos: cotizacionCruda() as never }),
      pedir: async () => ({ ok: false, error: "PAGO_EN_PAUSA", detalle: null, hasta: HASTA }),
      totalVisto: (cotizacionCruda() as { total_mxn: string }).total_mxn,
    }, c);
    expect(r).toEqual({ desenlace: { tipo: "pausa", hasta: HASTA, rechazado: false }, pidio: true, error: "PAGO_EN_PAUSA" });
  });

  it("PAGO_EN_PAUSA no prueba nada del intento en duda (pudo salir antes de mirar esa clave): hay que preguntar por él", () => {
    expect(pruebaQueNoHuboCobro("PAGO_EN_PAUSA")).toBe(false);
    // El rechazo por riesgo sí: es un PAGO_RECHAZADO, y el servidor ya descartó ese pedido.
    expect(pruebaQueNoHuboCobro("PAGO_RECHAZADO")).toBe(true);
  });

  it("la verificación del banco que acaba rechazada por riesgo trae la hora hasta la pantalla", async () => {
    expect(pasoDelReto({ ok: false, error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: HASTA })).toEqual({ tipo: "rechazado", detalle: "RIESGO", hasta: HASTA });
    expect(pasoDelReto({ ok: false, error: "PAGO_RECHAZADO", detalle: "VERIFICACION" })).toEqual({ tipo: "rechazado", detalle: "VERIFICACION" });
    // Y al recargar a medio reto, por el camino de la duda.
    const intento = intentoDeCompra(() => "AAAAAAAAAAAAAAAAAAAAAA", () => memoria(), () => AHORA, "knockout");
    intento.para({ a: 1 }); intento.dudar();
    const d = await resolverDuda(intento, async () => ({ ok: true, datos: { existe: true, codigo: "BBBBBBBBBBBBBBBBBBBBBB" } }),
      async () => ({ ok: false, error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: HASTA }));
    expect(d).toEqual({ tipo: "libre", rechazo: "RIESGO", hasta: HASTA });
    expect(intento.enDuda()).toBeNull();
  });
});

describe("hasta cuándo dura la pausa", () => {
  it("lo que dijo el servidor; sin eso, 30 minutos; y nunca más de un día", () => {
    expect(finDeLaPausa(HASTA, AHORA)).toBe(Date.parse(HASTA));
    for (const raro of [null, undefined, "", "pronto"]) expect(finDeLaPausa(raro, AHORA), String(raro)).toBe(AHORA + PAUSA_POR_OMISION_MS);
    expect(PAUSA_POR_OMISION_MS).toBe(30 * 60_000);
    expect(finDeLaPausa("2099-01-01T00:00:00.000Z", AHORA)).toBe(AHORA + 24 * 60 * 60_000);
    // Una hora que ya pasó no es una pausa: quien llama no la pone.
    expect(finDeLaPausa("2026-10-13T19:00:00.000Z", AHORA)).toBeLessThan(AHORA);
  });

  it("el teléfono la recuerda por negocio, y la olvida sola al vencer", () => {
    const a = memoria();
    expect(leerPausa("knockout", a, AHORA)).toBeNull();
    guardarPausa("knockout", Date.parse(HASTA), a);
    expect(leerPausa("knockout", a, AHORA)).toBe(Date.parse(HASTA));
    expect(leerPausa("knockout", a, AHORA + 29 * 60_000)).toBe(Date.parse(HASTA));
    // La de un restaurante no vale en otro.
    expect(leerPausa("tacos-don-beto", a, AHORA)).toBeNull();
    // Vencida: no hay pausa, y se borra.
    expect(leerPausa("knockout", a, AHORA + 31 * 60_000)).toBeNull();
    expect(a.datos.has(dondeDeLaPausa("knockout"))).toBe(false);
  });

  it("lo guardado es texto de fuera: una hora ilegible, o a más de un día, no apaga el pago", () => {
    for (const basura of ["", "x", "NaN", "{}", String(AHORA + 25 * 60 * 60_000), "Infinity"]) {
      const a = memoria();
      a.setItem(dondeDeLaPausa("knockout"), basura);
      expect(leerPausa("knockout", a, AHORA), basura).toBeNull();
      expect(a.datos.size, basura).toBe(0);
    }
  });

  it("con el almacén bloqueado (modo privado) no revienta: no recuerda, y el servidor lo dirá", () => {
    const roto: Almacen = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(leerPausa("knockout", roto, AHORA)).toBeNull();
    expect(() => guardarPausa("knockout", AHORA, roto)).not.toThrow();
    expect(leerPausa("knockout", null, AHORA)).toBeNull();
  });
});

describe("lo que se le dice al cliente", () => {
  const fin = Date.parse(HASTA);
  it("la hora va en la del centro de México, como el resto de la tienda", () => {
    expect(aPartirDe(fin)).toBe("a partir de las 2:30 p. m.");
    expect(aPartirDe(Date.parse("2026-10-13T19:05:00.000Z"))).toBe("a partir de la 1:05 p. m.");
    expect(lineaDePausa(fin)).toBe("Disponible otra vez a partir de las 2:30 p. m.");
  });

  it("recién rechazado: no fue su banco, no se le cobró, y otra forma de pago si la hay", () => {
    expect(textoDePausa(fin, { recienRechazado: true, otrasFormas: true }))
      .toBe("No pudimos aprobar este pago en línea. No fue tu banco y no se te cobró nada. Puedes pagar de otra forma, o intentar en línea otra vez a partir de las 2:30 p. m.");
    expect(textoDePausa(fin, { recienRechazado: true, otrasFormas: false }))
      .toBe("No pudimos aprobar este pago en línea. No fue tu banco y no se te cobró nada. Intenta otra vez a partir de las 2:30 p. m. o llama al restaurante.");
  });

  it("ya en pausa: tampoco se cobró nada, y lo mismo que puede hacer", () => {
    expect(textoDePausa(fin, { recienRechazado: false, otrasFormas: true }))
      .toBe("El pago en línea está en pausa para ti por ahora. No se te cobró nada. Puedes pagar de otra forma, o intentar en línea otra vez a partir de las 2:30 p. m.");
    expect(textoDePausa(fin, { recienRechazado: false, otrasFormas: false })).toMatch(/No se te cobró nada\. Intenta otra vez a partir de las 2:30 p\. m\. o llama al restaurante\.$/);
  });

  it("ningún texto de la pausa invita a repetir el cobro ya, enseña un código, ni nombra a Mercado Pago", () => {
    for (const recienRechazado of [true, false]) for (const otrasFormas of [true, false]) {
      const t = textoDePausa(fin, { recienRechazado, otrasFormas });
      expect(t).toMatch(/no se te cobró nada/i);
      expect(t).not.toMatch(/otra tarjeta|vuelve a intentar\b(?! )|Mercado Pago|RIESGO|high_risk|[A-Z]{3,}_[A-Z]/);
      expect(t).not.toMatch(/\.\.$/);
    }
    // El de respaldo (si la pantalla no fuera «Tus datos») tampoco.
    const r = textoDeError("PAGO_EN_PAUSA");
    expect(`${r.texto} ${r.hacer}`).toMatch(/No se te cobró nada/);
    expect(`${r.texto} ${r.hacer}`).not.toMatch(/Mercado Pago|[A-Z]{3,}_[A-Z]/);
  });
});

describe("modo de prueba", () => {
  it("la tienda está en modo de prueba solo si el servidor dice `pago_de_prueba: true`", () => {
    expect(negocioDe(negocioCrudo())!.pago_de_prueba).toBe(false);
    expect(negocioDe({ ...(negocioCrudo() as object), pago_de_prueba: true })!.pago_de_prueba).toBe(true);
    for (const v of [false, null, "true", 1, {}]) expect(negocioDe({ ...(negocioCrudo() as object), pago_de_prueba: v })!.pago_de_prueba, String(v)).toBe(false);
  });

  it("el seguimiento dice si el pago de ESE pedido fue de prueba; uno al recibir no trae nada de eso", () => {
    const enLinea = (extra: object) => seguimientoDe({ ...(seguimientoCrudo() as object), pago: "EN_LINEA", pago_estado: "PAGADO", propina_mxn: "0.00", total_a_pagar_mxn: "240.00", ...extra });
    expect(enLinea({})!.enLinea!.dePrueba).toBe(false);
    expect(enLinea({ pago_de_prueba: true })!.enLinea!.dePrueba).toBe(true);
    for (const v of [false, null, "true", 1]) expect(enLinea({ pago_de_prueba: v })!.enLinea!.dePrueba, String(v)).toBe(false);
    expect(seguimientoDe({ ...(seguimientoCrudo() as object), pago_de_prueba: true })!.enLinea).toBeNull();
  });

  it("la franja dice que los pagos no son reales", () => {
    expect(MODO_DE_PRUEBA.titulo).toBe("Modo de prueba: los pagos no son reales.");
    expect(MODO_DE_PRUEBA.ayuda).toMatch(/tarjeta de prueba/);
  });
});
