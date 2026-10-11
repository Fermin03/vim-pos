// El pago en línea en la tienda: qué formas se ofrecen, la propina que se enseña, cuándo cambia la
// clave del intento, qué hace la pantalla con cada respuesta, el sondeo y lo que se le dice al cliente.
import { describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { guardarCarrito, leerCarrito, carritoNuevo, type Almacen } from "../carrito";
import { FORMULARIO_VACIO, datosDelPedido } from "../cliente";
import { negocioDe, pedidoDe, pedidosDe, seguimientoDe, type EstadoDePago, type PedidoCreado, type Seguimiento } from "../contrato";
import { CLAVE_DEL_INTENTO, desenlaceDelError, enviarPedido, intentoDeCompra } from "../envio";
import { PROPINAS, anotarPorPagar, enlaceDePago, formasDePago, propinaDe, totalAPagar, vaciarSiPagado } from "../pago";
import { SONDEO_INICIAL, alLeer, cerrado, debeConfirmar, esperaDe, recorrido, terminado } from "../seguimiento";
import { CODIGOS_DE_ERROR, apoyoDePago, nombreDePago, textoDeError, textoDeSeguimiento } from "../textos";
import { CODIGO, ID, cotizacionCruda, negocioCrudo, pedidoCrudo, seguimientoCrudo } from "./datos";

const MP = "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=202809963-920c";

describe("formasDePago", () => {
  const suc = { pago_en_linea: false }, sucEnLinea = { pago_en_linea: true };
  it("solo las que el negocio tiene encendidas, como siempre", () => {
    expect(formasDePago({ pago_efectivo: true, pago_tarjeta: true, pago_en_linea: false }, suc)).toEqual(["EFECTIVO", "TARJETA"]);
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: true, pago_en_linea: false }, suc)).toEqual(["TARJETA"]);
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: false, pago_en_linea: false }, suc)).toEqual([]);
  });
  it("en línea solo si lo ofrece el negocio Y la sucursal elegida puede cobrar", () => {
    const negocio = { pago_efectivo: true, pago_tarjeta: false, pago_en_linea: true };
    expect(formasDePago(negocio, sucEnLinea)).toEqual(["EFECTIVO", "EN_LINEA"]);
    expect(formasDePago(negocio, suc)).toEqual(["EFECTIVO"]);
    expect(formasDePago({ ...negocio, pago_en_linea: false }, sucEnLinea)).toEqual(["EFECTIVO"]);
  });
  it("si es la única, es la única (no se pregunta)", () => {
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: false, pago_en_linea: true }, sucEnLinea)).toEqual(["EN_LINEA"]);
  });
  it("una función que aún no manda las banderas no ofrece pago en línea", () => {
    const n = negocioDe(negocioCrudo())!;
    expect(n.pago_en_linea).toBe(false);
    expect(n.sucursales[0]!.pago_en_linea).toBe(false);
    const con = negocioDe({ ...(negocioCrudo() as object), pago_en_linea: true, sucursales: (negocioCrudo() as { sucursales: object[] }).sucursales.map((s) => ({ ...s, pago_en_linea: true })) })!;
    expect(formasDePago(con, con.sucursales[0]!)).toEqual(["EFECTIVO", "EN_LINEA"]);
    // Solo un `true` cuenta.
    expect(negocioDe({ ...(negocioCrudo() as object), pago_en_linea: "true" })!.pago_en_linea).toBe(false);
  });
});

describe("la propina que se enseña", () => {
  it("las opciones son las que acepta la función, y la primera es sin propina", () => {
    expect(PROPINAS).toEqual([0, 10, 15, 20]);
  });
  it("es el porcentaje del subtotal de productos, con dos decimales", () => {
    expect(propinaDe("240.00", 0)).toBe("0.00");
    expect(propinaDe("240.00", 10)).toBe("24.00");
    expect(propinaDe("240.00", 15)).toBe("36.00");
    expect(propinaDe("240.00", 20)).toBe("48.00");
  });
  it("redondea al centavo como la base: el medio centavo, hacia arriba", () => {
    expect(propinaDe("33.33", 15)).toBe("5.00");     // 4.9995
    expect(propinaDe("0.05", 10)).toBe("0.01");      // 0.005
    expect(propinaDe("0.04", 10)).toBe("0.00");      // 0.004
    expect(propinaDe("115.99", 15)).toBe("17.40");   // 17.3985
    expect(propinaDe("99.99", 20)).toBe("20.00");    // 19.998
    expect(propinaDe("19.99", 10)).toBe("2.00");     // 1.999, el clásico que el flotante da mal
  });
  it("lo que no es un importe no tiene propina que enseñar", () => {
    for (const mal of ["", "240", "abc", "-5.00", "1.234"]) expect(propinaDe(mal, 10)).toBeNull();
  });
  it("total a pagar = total del pedido + propina, en centavos enteros", () => {
    expect(totalAPagar("275.00", "48.00")).toBe("323.00");
    expect(totalAPagar("0.10", "0.20")).toBe("0.30");
    expect(totalAPagar("275.00", null)).toBe("275.00");
    expect(totalAPagar("x", "1.00")).toBeNull();
  });
});

describe("a dónde se manda a pagar", () => {
  it("solo a una dirección https de Mercado Pago", () => {
    expect(enlaceDePago(MP)).toBe(MP);
    expect(enlaceDePago("https://mercadopago.com/mla/checkout/start?pref_id=1")).toBe("https://mercadopago.com/mla/checkout/start?pref_id=1");
    for (const mal of [
      "http://www.mercadopago.com.mx/x", "https://mercadopago.com.mx.evil.example/x", "https://evil.example/?mercadopago.com", "https://notmercadopago.com/x",
      "javascript:alert(1)", "//www.mercadopago.com.mx/x", "", null, undefined, 42, {}, `https://www.mercadopago.com.mx/${"a".repeat(700)}`,
    ]) expect(enlaceDePago(mal), String(mal)).toBeNull();
  });
  it("`pedir`: con un enlace válido el pedido sale a pagarse; con uno raro o sin él, a su seguimiento", () => {
    const base = pedidoCrudo() as object;
    expect(pedidoDe(base)!.pago).toBeNull();
    expect(pedidoDe({ ...base, vence_aceptacion: null, pago: { estado: "ESPERANDO_PAGO", init_point: MP } })!.pago).toEqual({ init_point: MP });
    expect(pedidoDe({ ...base, pago: { estado: "ESPERANDO_PAGO", init_point: "https://evil.example/pagar" } })!.pago).toEqual({ init_point: null });
    expect(pedidoDe({ ...base, pago: { estado: "CERRADO", init_point: null } })!.pago).toEqual({ init_point: null });
    expect(pedidoDe({ ...base, pago: "x" })!.pago).toBeNull();
  });
});

describe("el cuerpo del pedido y la clave del intento", () => {
  const f = { ...FORMULARIO_VACIO, nombre: "Ana", telefono: "4771112233" };
  it("la propina viaja solo al pagar en línea, y como porcentaje (nunca un monto)", () => {
    expect(datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA", propina: 15 })).toMatchObject({ pago: "EN_LINEA", propina_pct: 15, paga_con: null });
    expect(datosDelPedido(f, { modo: "RECOGER", pago: "EN_LINEA" }).propina_pct).toBe(0);
    for (const pago of ["EFECTIVO", "TARJETA"] as const) expect("propina_pct" in datosDelPedido(f, { modo: "RECOGER", pago, propina: 15 })).toBe(false);
  });
  it("la misma clave mientras el pedido sea el mismo; otra si cambia el carrito, la forma de pago o la propina", () => {
    let n = 0;
    const intento = intentoDeCompra(() => `clave-${++n}`);
    const pedido = (items: number, pago: "EFECTIVO" | "EN_LINEA", propina?: 0 | 10 | 15 | 20) =>
      ({ negocio: "knockout", items: [{ producto_id: ID.hamburguesa, cantidad: items }], ...datosDelPedido(f, { modo: "RECOGER", pago, propina }) });
    const a = intento.para(pedido(1, "EN_LINEA", 10));
    expect(intento.para(pedido(1, "EN_LINEA", 10))).toBe(a);            // «Pagar» otra vez (volvió de Mercado Pago): el mismo pedido
    const b = intento.para(pedido(1, "EN_LINEA", 15));                  // cambió la propina
    expect(b).not.toBe(a);
    const c = intento.para(pedido(1, "EFECTIVO"));                      // cambió la forma de pago
    expect(c).not.toBe(b);
    const d = intento.para(pedido(2, "EFECTIVO"));                      // cambió el carrito
    expect(d).not.toBe(c);
    expect(intento.para(pedido(2, "EFECTIVO"))).toBe(d);
  });
});

describe("qué hace «Tus datos» con cada respuesta de `pedir`", () => {
  const c = { telefono: "4771234567", horario: {} };
  const cotizada = { ok: true as const, datos: JSON.parse(JSON.stringify(cotizacionCruda())) };
  const creado = (pago: PedidoCreado["pago"]): Resultado<PedidoCreado> =>
    ({ ok: true, datos: { codigo: CODIGO, folio_corto: "TAB12C", total_mxn: "305.00", vence_aceptacion: null, pago } });
  it("un pedido en línea sale a pagarse (y NO es un pedido hecho: el carrito no se vacía)", async () => {
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => creado({ init_point: MP }), totalVisto: "305.00" }, c);
    expect(r).toEqual({ desenlace: { tipo: "pagar", url: MP, folio: "TAB12C" }, pidio: true });
  });
  it("uno que ya no espera pago (un reintento de un pedido ya pagado), o al recibir, va a su seguimiento", async () => {
    for (const pago of [{ init_point: null }, null]) {
      const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => creado(pago), totalVisto: "305.00" }, c);
      expect(r.desenlace).toEqual({ tipo: "hecho", codigo: CODIGO });
    }
  });
  it("PAGO_EN_PROCESO: se espera y se reintenta solo; no es un error que se enseñe", () => {
    expect(desenlaceDelError({ error: "PAGO_EN_PROCESO", detalle: null }, c)).toEqual({ tipo: "esperar" });
  });
  it("PAGO_NO_DISPONIBLE con otra forma de pago: se dice junto a «¿Cómo pagas?» y se ofrece elegir otra", () => {
    const d = desenlaceDelError({ error: "PAGO_NO_DISPONIBLE", detalle: null }, { ...c, otrasFormas: true });
    expect(d).toEqual({ tipo: "campo", campo: "pago", texto: "No pudimos abrir el pago en línea. Tu pedido no se envió y no se te cobró nada. Elige otra forma de pago o vuelve a intentar." });
  });
  it("PAGO_NO_DISPONIBLE siendo la única forma: aviso y el mismo botón; nunca «no supimos si entró»", () => {
    const d = desenlaceDelError({ error: "PAGO_NO_DISPONIBLE", detalle: null }, c);
    expect(d).toEqual({ tipo: "aviso", tono: "danger", sigue: "reintentar", texto: "No pudimos abrir el pago en línea. Tu pedido no se envió y no se te cobró nada. Vuelve a intentar en unos minutos." });
  });
  it("PAGO_INVALIDO sigue yendo a la forma de pago", () => {
    expect(desenlaceDelError({ error: "PAGO_INVALIDO", detalle: null }, c)).toMatchObject({ tipo: "campo", campo: "pago" });
  });
  it("los códigos nuevos tienen texto propio", () => {
    for (const codigo of ["PAGO_EN_PROCESO", "PAGO_NO_DISPONIBLE"]) expect(CODIGOS_DE_ERROR).toContain(codigo);
    expect(textoDeError("PAGO_NO_DISPONIBLE").texto).not.toBe(textoDeError("CODIGO_QUE_NO_EXISTE").texto);
  });
});

// ── Seguimiento ──────────────────────────────────────────────────────────────────────────────────
const enLineaCrudo = (estado: string, pago_estado: EstadoDePago, mas: object = {}): unknown => ({
  ...(seguimientoCrudo() as object), modo: "RECOGER", estado, motivo: null, pago: "EN_LINEA", pago_estado,
  subtotal_mxn: "240.00", envio_total_mxn: "0.00", total_mxn: "240.00", propina_mxn: "24.00", total_a_pagar_mxn: "264.00",
  vence_pago: "2026-10-11T21:45:00+00:00", ...mas,
});
const seg = (estado: string, pago_estado: EstadoDePago, mas: object = {}): Seguimiento => seguimientoDe(enLineaCrudo(estado, pago_estado, mas)) as Seguimiento;

describe("leer el seguimiento de un pedido en línea", () => {
  it("trae cómo va el pago, la propina, el total a pagar y hasta cuándo", () => {
    expect(seg("POR_PAGAR", "ESPERANDO_PAGO", { init_point: MP }).enLinea).toEqual({
      estado: "ESPERANDO_PAGO", propina_mxn: "24.00", total_a_pagar_mxn: "264.00", vence_pago: "2026-10-11T21:45:00+00:00", init_point: MP,
    });
  });
  it("un pedido al recibir no trae nada del pago en línea, como siempre", () => {
    expect((seguimientoDe(seguimientoCrudo()) as Seguimiento).enLinea).toBeNull();
  });
  it("un enlace de pago que no es de Mercado Pago no llega a la pantalla", () => {
    expect(seg("POR_PAGAR", "ESPERANDO_PAGO", { init_point: "https://evil.example/pagar" }).enLinea!.init_point).toBeNull();
  });
  it("un pedido en línea sin el estado de su pago, o con uno desconocido, no se pinta a medias", () => {
    expect(seguimientoDe(enLineaCrudo("POR_PAGAR", "ESPERANDO_PAGO", { pago_estado: undefined }))).toBeNull();
    expect(seguimientoDe(enLineaCrudo("POR_PAGAR", "ESPERANDO_PAGO", { pago_estado: "COBRADO" }))).toBeNull();
    expect(seguimientoDe(enLineaCrudo("POR_PAGAR", "ESPERANDO_PAGO", { total_a_pagar_mxn: 264 }))).toBeNull();
  });
  it("«mis pedidos» acepta un pedido que falta pagar", () => {
    const p = { sucursal_id: ID.sucursal, folio_corto: "TAB12C", recibido_at: "2026-10-09T19:00:00+00:00", modo: "RECOGER", estado: "POR_PAGAR", total_mxn: "240.00", renglones: [], items: null };
    expect(pedidosDe({ pedidos: [p] })![0]!.estado).toBe("POR_PAGAR");
  });
});

describe("el sondeo de un pedido en línea", () => {
  const tras = (p: Seguimiento) => alLeer(SONDEO_INICIAL, { ok: true, datos: p });
  it("la primera lectura siempre pide confirmar el pago (de ahí sale el correo de un pedido recién pagado)", () => {
    expect(debeConfirmar(null)).toBe(true);
  });
  it("después, solo mientras el pago no se haya resuelto", () => {
    for (const e of ["ESPERANDO_PAGO", "RECHAZADO"] as const) expect(debeConfirmar(seg("POR_PAGAR", e)), e).toBe(true);
    expect(debeConfirmar(seg("CANCELADO", "POR_CONFIRMAR"))).toBe(true);
    expect(debeConfirmar(seg("EN_PROCESO", "PAGADO"))).toBe(false);
    expect(debeConfirmar(seg("CANCELADO", "SIN_PAGO"))).toBe(false);
    expect(debeConfirmar(seg("CANCELADO", "DEVOLUCION_EN_PROCESO"))).toBe(false);
    expect(debeConfirmar(seguimientoDe(seguimientoCrudo()))).toBe(false);
  });
  it("esperando pago se pregunta con el ritmo de siempre (10 s)", () => {
    expect(esperaDe(tras(seg("POR_PAGAR", "ESPERANDO_PAGO")))).toBe(10_000);
    expect(terminado(tras(seg("POR_PAGAR", "ESPERANDO_PAGO")))).toBe(false);
  });
  it("cancelado con el pago por resolver: se sigue preguntando, una vez por minuto, hasta saber cómo acabó", () => {
    for (const e of ["POR_CONFIRMAR", "DEVOLUCION_EN_PROCESO"] as const) {
      const s = tras(seg("CANCELADO", e));
      expect(terminado(s), e).toBe(false);
      expect(esperaDe(s), e).toBe(60_000);
      expect(cerrado(s.pedido!), e).toBe(true);     // pero ya se ofrece «Pedir de nuevo»
    }
    for (const e of ["SIN_PAGO", "DEVUELTO"] as const) expect(esperaDe(tras(seg("CANCELADO", e))), e).toBeNull();
  });
  it("sin pagar no hay recorrido; pagado, el de siempre", () => {
    expect(recorrido("RECOGER", "POR_PAGAR")).toBeNull();
    expect(recorrido("RECOGER", "EN_PROCESO")!.map((p) => p.fase)).toEqual(["actual", "pendiente", "pendiente", "pendiente"]);
  });
});

describe("lo que ve el cliente en cada estado del pago", () => {
  it("falta pagar: lo dice, con la hora límite", () => {
    expect(textoDeSeguimiento(seg("POR_PAGAR", "ESPERANDO_PAGO"))).toEqual({
      titulo: "Falta pagar", apoyo: "Paga antes de las 3:45 p. m. para que el restaurante reciba tu pedido.", alerta: false,
    });
    expect(textoDeSeguimiento(seg("POR_PAGAR", "ESPERANDO_PAGO", { vence_pago: null })).apoyo).toBe("Paga para que el restaurante reciba tu pedido.");
  });
  it("el pago no pasó: puede intentar con otra tarjeta mientras no venza", () => {
    expect(textoDeSeguimiento(seg("POR_PAGAR", "RECHAZADO"))).toEqual({
      titulo: "El pago no pasó", apoyo: "No se te cobró. Puedes intentar con otra tarjeta antes de las 3:45 p. m.", alerta: false,
    });
  });
  it("venció y todavía no se ha podido confirmar: NUNCA dice que no hubo pago ni que no se cobró", () => {
    const t = textoDeSeguimiento(seg("CANCELADO", "POR_CONFIRMAR", { motivo: "POR_CONFIRMAR" }));
    expect(t.titulo).toBe("Confirmando tu pago");
    expect(t.apoyo).toBe("Esto puede tardar unos minutos.");
    // No promete devolver: el pago puede ser de un pedido válido.
    expect(t.apoyo).not.toMatch(/devolv/i);
    expect(`${t.titulo} ${t.apoyo}`).not.toMatch(/sin pago|no se te cobr|no se complet/i);
    expect(t.alerta).toBe(false);
  });
  it("venció sin pagarse (confirmado): no se cobró, y no es una cancelación del restaurante", () => {
    expect(textoDeSeguimiento(seg("CANCELADO", "SIN_PAGO", { motivo: "SIN_PAGO" }))).toEqual({
      titulo: "No se completó el pago", apoyo: "Tu pedido no se envió al restaurante y no se te cobró nada.", alerta: false,
    });
  });
  it("pagado: el recorrido normal, con sus textos de siempre", () => {
    expect(textoDeSeguimiento(seg("EN_PROCESO", "PAGADO"))).toEqual({ titulo: "En proceso", apoyo: "Le avisamos al restaurante. En un momento confirma tu pedido.", alerta: false });
    expect(textoDeSeguimiento(seg("ENTREGADO", "PAGADO")).titulo).toBe("Entregado");
  });
  it("cancelado ya pagado: dice que el dinero se devuelve y NUNCA «no se te cobró»; sin prometer días", () => {
    const enProceso = textoDeSeguimiento(seg("CANCELADO", "DEVOLUCION_EN_PROCESO", { motivo: "SIN_RESPUESTA" }));
    expect(enProceso).toEqual({
      titulo: "Cancelado", alerta: true,
      apoyo: "El restaurante no confirmó tu pedido a tiempo. Estamos devolviendo tu pago completo. Cuándo lo ves reflejado depende de tu banco.",
    });
    const devuelto = textoDeSeguimiento(seg("CANCELADO", "DEVUELTO", { motivo: "AGOTADO" }));
    expect(devuelto.apoyo).toBe("Se agotó algo de tu pedido. Te devolvimos tu pago completo. Cuándo lo ves reflejado depende de tu banco.");
    for (const t of [enProceso, devuelto]) {
      expect(t.apoyo).not.toMatch(/no se te cobr/i);
      expect(t.apoyo).not.toMatch(/\d+\s*(días|horas)/i);
    }
  });
  it("un pedido al recibir conserva sus textos, letra por letra", () => {
    const alRecibir = seguimientoDe({ ...(seguimientoCrudo() as object), estado: "CANCELADO", motivo: "SIN_RESPUESTA" }) as Seguimiento;
    expect(textoDeSeguimiento(alRecibir)).toEqual({ titulo: "Cancelado", apoyo: "El restaurante no confirmó tu pedido a tiempo. No se te cobró nada.", alerta: true });
  });
  it("formas de pago: no menciona Apple Pay ni Google Pay, y al haber pago en línea las otras dicen «al recibir»", () => {
    expect(apoyoDePago("EN_LINEA")).toBe("Pagas con tarjeta de crédito o débito en la página de Mercado Pago.");
    expect(apoyoDePago("EFECTIVO")).toBe("Pagas al recibir tu pedido.");
    expect(apoyoDePago("EN_LINEA")).not.toMatch(/apple|google/i);
    expect([nombreDePago("EFECTIVO", false), nombreDePago("TARJETA", false)]).toEqual(["En efectivo", "Con tarjeta"]);
    expect([nombreDePago("EFECTIVO", true), nombreDePago("TARJETA", true), nombreDePago("EN_LINEA", true)]).toEqual(["En efectivo, al recibir", "Con tarjeta, al recibir", "Pagar en línea"]);
  });
});

describe("el carrito de un pedido que salió a pagarse", () => {
  const almacen = (): Almacen => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  };
  const conUno = () => ({ ...carritoNuevo(ID.sucursal, "RECOGER"), renglones: [{ id: "r1", productoId: ID.hamburguesa, nombre: "Hamburguesa", cantidad: 1, nota: "", modificadores: [], componentes: [] }] });
  it("NO se vacía al salir a pagar; se vacía cuando ESE pedido queda pagado", () => {
    const a = almacen();
    guardarCarrito("knockout", conUno(), a);
    anotarPorPagar("knockout", "TAB12C", a);
    expect(leerCarrito("knockout", a)!.renglones).toHaveLength(1);       // volvió atrás desde Mercado Pago: su pedido sigue ahí
    expect(vaciarSiPagado("knockout", "TAB12C", a)).toBe(true);
    expect(leerCarrito("knockout", a)?.renglones ?? []).toHaveLength(0);
    expect(vaciarSiPagado("knockout", "TAB12C", a)).toBe(false);         // una sola vez
  });
  it("ver pagado OTRO pedido (uno viejo) no toca el carrito de ahora", () => {
    const a = almacen();
    guardarCarrito("knockout", conUno(), a);
    anotarPorPagar("knockout", "TAB12C", a);
    expect(vaciarSiPagado("knockout", "TXXXXX", a)).toBe(false);
    expect(vaciarSiPagado("otro-negocio", "TAB12C", a)).toBe(false);
    expect(leerCarrito("knockout", a)!.renglones).toHaveLength(1);
  });
  it("sin almacén (modo privado) no revienta", () => {
    expect(() => anotarPorPagar("knockout", "TAB12C", null)).not.toThrow();
    expect(vaciarSiPagado("knockout", "TAB12C", null)).toBe(false);
    const roto: Almacen = { getItem: () => { throw new Error("bloqueado"); }, setItem: vi.fn(), removeItem: vi.fn() };
    expect(vaciarSiPagado("knockout", "TAB12C", roto)).toBe(false);
  });
});

describe("recargar antes de pagar no crea otro pedido", () => {
  const almacen = (): Almacen => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  };
  const f = { ...FORMULARIO_VACIO, nombre: "Ana Privada", telefono: "4771112233" };
  const pedido = (items: number, pago: "EFECTIVO" | "EN_LINEA", propina?: 0 | 10 | 15 | 20) =>
    ({ negocio: "knockout", items: [{ producto_id: ID.hamburguesa, cantidad: items }], nota: "sin cebolla", ...datosDelPedido(f, { modo: "RECOGER", pago, propina }) });
  /** Una página recién cargada: memoria en blanco, el mismo teléfono. */
  const pagina = (a: Almacen | null, reloj = { t: 1_000_000 }) => {
    let n = 0;
    const id = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    return intentoDeCompra(() => `${id}${String(++n).padStart(16, "0")}`, () => a, () => reloj.t);
  };
  it("la página recargada reutiliza la clave del mismo carrito, forma de pago y propina", () => {
    const a = almacen();
    const clave = pagina(a).para(pedido(1, "EN_LINEA", 10));
    expect(pagina(a).para(pedido(1, "EN_LINEA", 10))).toBe(clave);
  });
  it("si cambia el carrito, la forma de pago o la propina, la clave guardada se sustituye", () => {
    const a = almacen();
    const clave = pagina(a).para(pedido(1, "EN_LINEA", 10));
    for (const otro of [pedido(2, "EN_LINEA", 10), pedido(1, "EFECTIVO"), pedido(1, "EN_LINEA", 15)]) {
      const b = almacen();
      pagina(b).para(pedido(1, "EN_LINEA", 10));
      const nueva = pagina(b).para(otro);
      expect(nueva).not.toBe(clave);
      expect(pagina(b).para(otro)).toBe(nueva);                       // y la que queda guardada es la nueva
      expect(pagina(b).para(pedido(1, "EN_LINEA", 10))).not.toBe(nueva);
    }
  });
  it("al quedar aprobado el pago (o entrar el pedido) se borra: el siguiente pedido idéntico es otro", () => {
    const a = almacen();
    const p1 = pagina(a), clave = p1.para(pedido(1, "EN_LINEA", 10));
    p1.cerrar();
    expect(a.getItem(CLAVE_DEL_INTENTO)).toBeNull();
    expect(pagina(a).para(pedido(1, "EN_LINEA", 10))).not.toBe(clave);
  });
  it("caduca a los 15 minutos: no se reutiliza la clave de un pedido que ya venció", () => {
    const a = almacen(), reloj = { t: 1_000_000 };
    const clave = pagina(a, reloj).para(pedido(1, "EN_LINEA", 10));
    reloj.t += 14 * 60_000;
    expect(pagina(a, reloj).para(pedido(1, "EN_LINEA", 10))).toBe(clave);
    reloj.t += 2 * 60_000;
    expect(pagina(a, reloj).para(pedido(1, "EN_LINEA", 10))).not.toBe(clave);
  });
  it("en el teléfono queda la clave y una huella: ni el nombre, ni el teléfono, ni la nota", () => {
    const a = almacen();
    pagina(a).para(pedido(1, "EN_LINEA", 10));
    const guardado = a.getItem(CLAVE_DEL_INTENTO)!;
    expect(guardado).not.toMatch(/Ana|4771112233|cebolla|EN_LINEA|producto/);
    expect(Object.keys(JSON.parse(guardado)).sort()).toEqual(["clave", "cuando", "de"]);
  });
  it("sin almacén, con uno que lanza o con basura guardada, sigue funcionando en memoria", () => {
    const roto: Almacen = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => { throw new Error("bloqueado"); } };
    for (const a of [null, roto]) {
      const p = pagina(a);
      const clave = p.para(pedido(1, "EN_LINEA", 10));
      expect(p.para(pedido(1, "EN_LINEA", 10))).toBe(clave);
      expect(() => p.cerrar()).not.toThrow();
    }
    for (const basura of ["{no es json", "null", "[]", JSON.stringify({ de: "x", clave: "corta", cuando: 1 }), JSON.stringify({ de: 5, clave: "a".repeat(22), cuando: "ayer" })]) {
      const a = almacen();
      a.setItem(CLAVE_DEL_INTENTO, basura);
      expect(pagina(a).para(pedido(1, "EN_LINEA", 10))).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });
});
