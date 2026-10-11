// El pago en línea en la tienda: qué formas se ofrecen, la propina que se enseña, cuándo cambia la
// clave del intento, qué hace la pantalla con cada respuesta, el sondeo y lo que se le dice al cliente.
import { describe, expect, it } from "vitest";
import type { Resultado } from "../api";
import type { Almacen } from "../carrito";
import { FORMULARIO_VACIO, datosDelPedido, erroresDe } from "../cliente";
import { negocioDe, pedidoDe, pedidosDe, seguimientoDe, type EstadoDePago, type PedidoCreado, type Seguimiento } from "../contrato";
import { CLAVE_DEL_INTENTO, desenlaceDelError, enviarPedido, intentoDeCompra } from "../envio";
import { PROPINAS, formasDePago, propinaDe, totalAPagar } from "../pago";
import { SONDEO_INICIAL, alLeer, cerrado, debeConfirmar, esperaDe, recorrido, terminado } from "../seguimiento";
import { textoDeRechazo } from "../tarjeta";
import { CODIGOS_DE_ERROR, apoyoDePago, nombreDePago, textoDeEstado, textoDeSeguimiento } from "../textos";
import { CODIGO, ID, cotizacionCruda, negocioCrudo, pedidoCrudo, seguimientoCrudo } from "./datos";

const PK = "APP_USR-00000000-0000-4000-8000-000000000000";

describe("formasDePago", () => {
  const suc = { pago_en_linea: false, public_key: null }, sucEnLinea = { pago_en_linea: true, public_key: PK };
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
  it("sin la public key de la cuenta que cobra no se ofrece: no habría cómo leer la tarjeta", () => {
    expect(formasDePago({ pago_efectivo: true, pago_tarjeta: false, pago_en_linea: true }, { pago_en_linea: true, public_key: null })).toEqual(["EFECTIVO"]);
  });
  it("si es la única, es la única (no se pregunta)", () => {
    expect(formasDePago({ pago_efectivo: false, pago_tarjeta: false, pago_en_linea: true }, sucEnLinea)).toEqual(["EN_LINEA"]);
  });
  it("una función que aún no manda las banderas no ofrece pago en línea", () => {
    const n = negocioDe(negocioCrudo())!;
    expect(n.pago_en_linea).toBe(false);
    expect(n.sucursales[0]!.pago_en_linea).toBe(false);
    const con = negocioDe({ ...(negocioCrudo() as object), pago_en_linea: true, sucursales: (negocioCrudo() as { sucursales: object[] }).sucursales.map((s) => ({ ...s, pago_en_linea: true, public_key: PK })) })!;
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
  const e = (error: string, detalle: string | null = null) => ({ error, detalle });

  it("pagado: el pedido está hecho y se va a su página", async () => {
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => creado({ estado: "PAGADO" }), totalVisto: cotizada.datos.total_mxn }, c);
    expect(r).toEqual({ desenlace: { tipo: "hecho", codigo: CODIGO }, pidio: true });
  });
  it("no se supo si el cobro pasó: también va a la página del pedido, que dirá «Confirmando tu pago»; NUNCA un error de rechazo", async () => {
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => creado({ estado: "POR_CONFIRMAR" }), totalVisto: cotizada.datos.total_mxn }, c);
    expect(r.desenlace).toEqual({ tipo: "hecho", codigo: CODIGO });
  });
  it("`pedir`: lo que no sea «pagado» se lee como por confirmar; un pedido al recibir no trae pago", () => {
    const con = (pago: unknown) => (pedidoDe({ ...(pedidoCrudo() as object), pago }) as PedidoCreado).pago;
    expect(con({ estado: "PAGADO" })).toEqual({ estado: "PAGADO" });
    for (const raro of [{ estado: "POR_CONFIRMAR" }, { estado: "APROBADO" }, { estado: 1 }, {}, { init_point: "https://x" }]) expect(con(raro)).toEqual({ estado: "POR_CONFIRMAR" });
    expect(con(undefined)).toBeNull();
    expect(con(null)).toBeNull();
  });
  it("PAGO_RECHAZADO: se dice junto a la tarjeta, con el motivo y que no se cobró", () => {
    expect(desenlaceDelError(e("PAGO_RECHAZADO", "FONDOS"), c)).toEqual({ tipo: "tarjeta", campo: null, texto: "Tu tarjeta no tiene fondos suficientes. Prueba con otra tarjeta. No se te cobró nada." });
    // Sin motivo o con uno que no se conoce: el general. Nunca el código en crudo.
    for (const raro of [null, "", "ALGO_NUEVO", "constructor", "CODIGO", "FECHA", "NUMERO", "VERIFICACION"]) {
      const d = desenlaceDelError(e("PAGO_RECHAZADO", raro), c);
      expect(d).toEqual({ tipo: "tarjeta", campo: null, texto: "Tu banco no aprobó el pago. Prueba con otra tarjeta. No se te cobró nada." });
    }
  });
  it("los datos mal escritos: UN solo mensaje, sin señalar un campo (Mercado Pago no dice si fue el código o la fecha)", () => {
    expect(desenlaceDelError(e("PAGO_RECHAZADO", "DATOS"), c)).toEqual({
      tipo: "tarjeta", campo: null,
      texto: "Revisa los datos de tu tarjeta: el número, la fecha de vencimiento y el código de seguridad. No se te cobró nada.",
    });
  });
  it("cada familia de rechazo tiene su texto, dice que no se cobró y no enseña códigos", () => {
    const familias = ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "OTRO"];
    for (const motivo of familias) {
      const t = textoDeRechazo(motivo, false).texto;
      expect(t, motivo).toMatch(/No se te cobró nada\.$/);
      expect(t, motivo).not.toMatch(/[A-Z]{3,}_[A-Z]|bad_filled|insufficient|Apple Pay|Google Pay/);
    }
    expect(new Set(familias.map((m) => textoDeRechazo(m, false).texto)).size).toBe(5);
  });
  it("con otra forma de pago, el rechazo la ofrece; el de los datos, no (se corrige y ya)", () => {
    expect(textoDeRechazo("FONDOS", true).texto).toMatch(/también puedes elegir otra forma de pago\.$/);
    expect(textoDeRechazo("DATOS", true).texto).not.toMatch(/otra forma de pago/);
  });
  it("PAGO_NO_DISPONIBLE con otra forma de pago: se dice junto a «¿Cómo pagas?» y se ofrece elegir otra", () => {
    const d = desenlaceDelError(e("PAGO_NO_DISPONIBLE"), { ...c, otrasFormas: true });
    expect(d).toMatchObject({ tipo: "campo", campo: "pago" });
    expect(d.tipo === "campo" && d.texto).toMatch(/Elige otra forma de pago/);
  });
  it("PAGO_NO_DISPONIBLE siendo la única forma: aviso y el mismo botón; nunca «no supimos si entró»", () => {
    expect(desenlaceDelError(e("PAGO_NO_DISPONIBLE"), c)).toMatchObject({ tipo: "aviso", tono: "danger", sigue: "reintentar" });
  });
  it("PAGO_INVALIDO sigue yendo a la forma de pago", () => {
    expect(desenlaceDelError(e("PAGO_INVALIDO"), c)).toMatchObject({ tipo: "campo", campo: "pago" });
  });
  it("lo que se retiró con la redirección ya no existe: ni «en proceso», ni un enlace a dónde ir a pagar", () => {
    expect(CODIGOS_DE_ERROR).not.toContain("PAGO_EN_PROCESO");
    expect(CODIGOS_DE_ERROR).toContain("PAGO_NO_DISPONIBLE");
    expect(JSON.stringify(pedidoDe({ ...(pedidoCrudo() as object), pago: { estado: "PAGADO", init_point: "https://www.mercadopago.com.mx/x" } }))).not.toMatch(/init_point|mercadopago/);
  });
  it("en línea el correo es obligatorio; al recibir sigue siendo opcional", () => {
    const f = { ...FORMULARIO_VACIO, nombre: "Ana", telefono: "4771112233" };
    expect(erroresDe(f, { modo: "RECOGER", enLinea: true }).email).toMatch(/correo/);
    expect(erroresDe(f, { modo: "RECOGER", enLinea: false }).email).toBeUndefined();
    expect(erroresDe(f, { modo: "RECOGER" }).email).toBeUndefined();
    expect(erroresDe({ ...f, email: "ana@example.com" }, { modo: "RECOGER", enLinea: true }).email).toBeUndefined();
  });
});

describe("la sucursal dice con qué clave se lee la tarjeta", () => {
  const conClave = (public_key: unknown) => {
    const crudo = JSON.parse(JSON.stringify(negocioCrudo())) as { sucursales: Record<string, unknown>[] };
    crudo.sucursales[0]!.public_key = public_key;
    crudo.sucursales[0]!.pago_en_linea = true;
    const n = negocioDe(crudo);
    return n && "sucursales" in n ? n.sucursales[0]!.public_key : undefined;
  };
  it("la public key llega tal cual si tiene su forma; cualquier otra cosa es «sin clave»", () => {
    expect(conClave(PK)).toBe(PK);
    expect(conClave("TEST-00000000-0000-4000-8000-000000000000")).toBe("TEST-00000000-0000-4000-8000-000000000000");
    for (const raro of [undefined, null, "", "corta", 123, "con espacio y <script>alert(1)</script>", "x".repeat(101)]) expect(conClave(raro)).toBeNull();
  });
});

// ── Seguimiento ──────────────────────────────────────────────────────────────────────────────────
const enLineaCrudo = (estado: string, pago_estado: string, mas: object = {}): unknown => ({
  ...(seguimientoCrudo() as object), modo: "RECOGER", estado, motivo: null, pago: "EN_LINEA", pago_estado,
  subtotal_mxn: "240.00", envio_total_mxn: "0.00", total_mxn: "240.00", propina_mxn: "24.00", total_a_pagar_mxn: "264.00", ...mas,
});
const seg = (estado: string, pago_estado: EstadoDePago, mas: object = {}): Seguimiento => seguimientoDe(enLineaCrudo(estado, pago_estado, mas)) as Seguimiento;

describe("leer el seguimiento de un pedido en línea", () => {
  it("trae cómo va el pago, la propina y el total a pagar; nada de la redirección", () => {
    const s = seg("EN_PROCESO", "PAGADO");
    expect(s.enLinea).toEqual({ estado: "PAGADO", propina_mxn: "24.00", total_a_pagar_mxn: "264.00" });
  });
  it("un pedido al recibir no trae nada del pago en línea, como siempre", () => {
    expect((seguimientoDe(seguimientoCrudo()) as Seguimiento).enLinea).toBeNull();
  });
  it("un pedido en línea sin el estado de su pago, o con uno que ya no existe, no se pinta a medias", () => {
    for (const estado of [undefined, "", "ALGO", "ESPERANDO_PAGO", "RECHAZADO"]) expect(seguimientoDe(enLineaCrudo("POR_PAGAR", estado as string)), String(estado)).toBeNull();
  });
  it("«mis pedidos» acepta un pedido cuyo cobro se está confirmando", () => {
    const p = { sucursal_id: ID.sucursal, folio_corto: "TAB12C", recibido_at: "2026-10-09T19:00:00+00:00", modo: "RECOGER", estado: "POR_PAGAR", total_mxn: "240.00", renglones: [], items: null };
    expect(pedidosDe({ pedidos: [p] })![0]!.estado).toBe("POR_PAGAR");
  });
});

describe("el sondeo de un pedido en línea", () => {
  const tras = (p: Seguimiento) => alLeer(SONDEO_INICIAL, { ok: true, datos: p });
  it("la primera lectura siempre pide confirmar el pago (de ahí sale el correo de un pedido cuyo cobro se confirmó después)", () => {
    expect(debeConfirmar(null)).toBe(true);
  });
  it("después, solo mientras el cobro siga sin resolverse", () => {
    expect(debeConfirmar(seg("POR_PAGAR", "POR_CONFIRMAR"))).toBe(true);
    expect(debeConfirmar(seg("CANCELADO", "POR_CONFIRMAR", { motivo: "POR_CONFIRMAR" }))).toBe(true);
    for (const e of ["PAGADO", "DEVOLUCION_EN_PROCESO", "DEVUELTO", "SIN_PAGO"] as const) expect(debeConfirmar(seg("CANCELADO", e)), e).toBe(false);
    expect(debeConfirmar(seguimientoDe(seguimientoCrudo()) as Seguimiento)).toBe(false);
  });
  it("confirmando el cobro se pregunta con el ritmo de siempre, y no se da por terminado", () => {
    const s = tras(seg("POR_PAGAR", "POR_CONFIRMAR"));
    expect(terminado(s)).toBe(false);
    expect(esperaDe(s)).toBe(esperaDe(tras(seg("EN_PROCESO", "PAGADO"))));
  });
  it("cancelado con el cobro por confirmar: se sigue preguntando hasta saber cómo acabó", () => {
    expect(terminado(tras(seg("CANCELADO", "POR_CONFIRMAR", { motivo: "POR_CONFIRMAR" })))).toBe(false);
    expect(terminado(tras(seg("CANCELADO", "SIN_PAGO", { motivo: "SIN_PAGO" })))).toBe(true);
    expect(cerrado(seg("CANCELADO", "SIN_PAGO"))).toBe(true);
  });
  it("sin confirmar todavía no hay recorrido; pagado, el de siempre", () => {
    expect(recorrido("RECOGER", "POR_PAGAR")).toBeNull();
    expect(recorrido("RECOGER", "EN_PROCESO")).not.toBeNull();
  });
});

describe("lo que ve el cliente en cada estado del pago", () => {
  it("el cobro se mandó y no se sabe si pasó: «Confirmando tu pago». NUNCA «falta pagar», «rechazado» ni «no se te cobró»", () => {
    for (const s of [seg("POR_PAGAR", "POR_CONFIRMAR"), seg("CANCELADO", "POR_CONFIRMAR", { motivo: "POR_CONFIRMAR" })]) {
      const t = textoDeSeguimiento(s);
      expect(t.titulo).toBe("Confirmando tu pago");
      expect(t.apoyo).toBe("Esto puede tardar unos minutos.");
      expect(`${t.titulo} ${t.apoyo}`).not.toMatch(/falta pagar|rechaz|sin pago|no se te cobr|no se complet|devolv/i);
      expect(t.alerta).toBe(false);
    }
  });
  it("no se cobró (confirmado): se dice, y no es una cancelación del restaurante", () => {
    expect(textoDeSeguimiento(seg("CANCELADO", "SIN_PAGO", { motivo: "SIN_PAGO" }))).toEqual({
      titulo: "No se completó el pago", apoyo: "Tu pedido no se envió al restaurante y no se te cobró nada.", alerta: false,
    });
  });
  it("pagado: el recorrido normal, con sus textos de siempre", () => {
    expect(textoDeSeguimiento(seg("EN_PREPARACION", "PAGADO"))).toEqual({ titulo: "En preparación", apoyo: "El restaurante ya está preparando tu pedido.", alerta: false });
  });
  it("cancelado ya pagado: dice que el dinero se devuelve y NUNCA «no se te cobró»", () => {
    const enProceso = textoDeSeguimiento(seg("CANCELADO", "DEVOLUCION_EN_PROCESO", { motivo: "AGOTADO" }));
    expect(enProceso.titulo).toBe("Cancelado");
    expect(enProceso.apoyo).toMatch(/Estamos devolviendo tu pago completo\./);
    expect(enProceso.apoyo).not.toMatch(/no se te cobr/i);
    expect(textoDeSeguimiento(seg("CANCELADO", "DEVUELTO", { motivo: "SIN_RESPUESTA" })).apoyo).toMatch(/Te devolvimos tu pago completo\./);
  });
  it("un pedido al recibir conserva sus textos, letra por letra", () => {
    const s = seguimientoDe(seguimientoCrudo()) as Seguimiento;
    expect(textoDeSeguimiento(s)).toEqual({ ...textoDeEstado(s.estado, s.motivo), alerta: s.estado === "CANCELADO" });
  });
  it("formas de pago: se paga aquí mismo, no en otra página; sin Apple Pay ni Google Pay; al haber pago en línea las otras dicen «al recibir»", () => {
    expect(nombreDePago("EN_LINEA", true)).toBe("Pagar en línea");
    expect(nombreDePago("EFECTIVO", true)).toBe("En efectivo, al recibir");
    expect(nombreDePago("TARJETA", false)).toBe("Con tarjeta");
    expect(apoyoDePago("EN_LINEA")).toBe("Pagas ahora, aquí mismo, con tarjeta de crédito o débito.");
    expect(apoyoDePago("EN_LINEA")).not.toMatch(/Apple Pay|Google Pay|página de Mercado Pago/i);
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
