// Las respuestas de Mercado Pago son las REALES del 11 oct 2026
// (docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeConciliacionFallida, avisoDeDevolucionFallida, avisoDeRetoSinCerrar, barrer, cobrarPago, confirmarPago, type Deps, devolverPago, type FilaPago, type PuertoPagos, respuestaDeConfirmacion, type Tarea, topesDelAviso } from "./pago-flujo.ts";
import type { ClienteMpTienda, RespuestaMp } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const ORDEN = "ORDTST01M4P8JX8C82XV8G7EB2A16YAC";
const FILA: FilaPago = {
  id: PAGO, conexion_id: "cx-1", estado: "CREADO", monto: "138.00", cobro_mandado: false,
  orden_id_externo: null, detalle: null, creado: "2026-10-11T18:00:00.000Z", en_verificacion: false, conciliaciones: 0, cuenta_vendedora: "3754297554", de_prueba: false, freno_clave: null,
};
const APROBADA = {
  id: ORDEN, status: "processed", status_detail: "accredited", total_amount: "138.00", total_paid_amount: "138.00",
  external_reference: PAGO, capture_mode: "automatic_async", user_id: "3754297554", currency: "MXN", country_code: "MEX",
  transactions: { payments: [{ id: "PAY01M4P8JX8TKPS5B2ECXP875P89", status: "processed", status_detail: "accredited", payment_method: { id: "master", type: "credit_card" } }] },
};
const EN_REVISION = { ...APROBADA, id: "ORDTSTREVISION", status: "processing", status_detail: "in_process", total_paid_amount: "0.00" };
const RECHAZO_402 = { errors: [{ code: "failed", message: "The following transactions failed", details: ["PAY01M4P8KB8MM494BGX78592RQMQ: insufficient_amount"] }] };
const DATOS = { pagoId: PAGO, email: "ana@example.com", tarjeta: { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", type: "credit_card" as const } };

type Metodo = keyof ClienteMpTienda | "cancelarOrden";
/** La base y Mercado Pago de mentira: se anota cada llamada y se contesta lo que diga cada prueba. */
function doble(o: {
  /** Lo que la base devuelve en cada lectura del pago, en orden; la última se repite. */
  filas?: (FilaPago | null)[]; token?: string | null; toma?: boolean; tareas?: Tarea[]; descarta?: boolean; abandona?: boolean;
  /** Lo que contesta Mercado Pago: una respuesta por método, o una lista (una por llamada; la última se repite). */
  mp?: Partial<Record<Metodo, RespuestaMp | RespuestaMp[]>>; devolucion?: (ok: boolean) => string;
  aplicar?: (ordenIdExterno: string) => { estado: string; pedido_estado: string; recien_aprobado: boolean };
  tercerFallo?: (id: string) => boolean;
  /** El usuario de prueba configurado (MP_TIENDA_PAGADOR_DE_PRUEBA), ya validado. */
  pagadorDePrueba?: string | null;
} = {}) {
  const llamadas: string[] = [];
  const tokens: string[] = [];
  const cuerpos: unknown[] = [];
  /** La huella del dispositivo con que se pidió cada cobro (la cabecera X-Meli-Session-Id), o null. */
  const huellas: (string | null)[] = [];
  /** Todo lo que se le manda a la base, tal cual (para comprobar que no lleva nada crudo de Mercado Pago). */
  const aLaBase: unknown[] = [];
  const veces: Partial<Record<Metodo, number>> = {};
  let lecturas = 0, llaves = 0;
  const filas = o.filas ?? [FILA];
  const db: PuertoPagos = {
    leerPago: async () => filas[Math.min(lecturas++, filas.length - 1)]!,
    token: async () => (o.token === undefined ? "TOKEN" : o.token),
    tomarCobro: async () => { llamadas.push("tomarCobro"); return o.toma ?? true; },
    descartar: async () => { llamadas.push("descartar"); return o.descarta ?? true; },
    aplicar: async (_id, d) => {
      aLaBase.push(d);
      llamadas.push(`aplicar ${d.resultado} ${d.ordenIdExterno} ${d.monto}`);
      return o.aplicar?.(d.ordenIdExterno) ?? { estado: "APROBADO", pedido_estado: "RECIBIDO", recien_aprobado: d.resultado === "APROBADO" };
    },
    anotar: async (_id, d) => { aLaBase.push(d); llamadas.push(`anotar ${d.ordenIdExterno ?? "-"} ${d.error ?? "-"}`); },
    verificar: async (_id, orden) => { aLaBase.push({ verificar: orden }); llamadas.push(`verificar ${orden}`); },
    abandonar: async (_id, orden) => { aLaBase.push({ abandonar: orden }); llamadas.push(`abandonar ${orden ?? "-"}`); return o.abandona ?? true; },
    tomar: async () => o.tareas ?? [],
    devolucion: async (id, ok, error) => { aLaBase.push({ ok, error }); llamadas.push(`devolucion ${id} ${ok}${error ? ` ${error}` : ""}`); return o.devolucion?.(ok) ?? (ok ? "DEVUELTO" : "POR_DEVOLVER"); },
    conciliacion: async (id, ok) => { llamadas.push(`conciliacion ${id} ${ok}`); return !ok && (o.tercerFallo?.(id) ?? false); },
  };
  const responder = (cual: Metodo, ...args: unknown[]): Promise<RespuestaMp> => {
    llamadas.push(`mp.${cual} ${args.map((a) => (typeof a === "string" ? a : a instanceof Date ? a.toISOString() : "{…}")).join(" ")}`.trim());
    const r = o.mp?.[cual];
    const n = veces[cual] ?? 0;
    veces[cual] = n + 1;
    return Promise.resolve((Array.isArray(r) ? r[Math.min(n, r.length - 1)] : r) ?? { status: 500, cuerpo: null });
  };
  const deps: Deps = {
    db,
    mp: (token) => {
      tokens.push(token);
      return {
        crearOrden: (c, llave, huella) => { cuerpos.push(c); huellas.push(huella ?? null); return responder("crearOrden", c, llave); },
        leerOrden: (id) => responder("leerOrden", id),
        buscarOrdenes: (id, desde, hasta) => responder("buscarOrdenes", id, desde, hasta),
        devolver: (id, llave) => responder("devolver", id, llave),
        cancelarOrden: (id) => responder("cancelarOrden", id),
      };
    },
    registrar: (codigo, detalle) => { llamadas.push(`registrar ${codigo} ${detalle}`); },
    pagadorDePrueba: o.pagadorDePrueba,
    llave: () => `llave-${++llaves}`,
    ahora: () => new Date("2026-10-11T18:03:00.000Z"),
  };
  return { deps, llamadas, tokens, cuerpos, aLaBase, huellas };
}
const sin = (llamadas: string[], prefijo: string) => llamadas.every((l) => !l.startsWith(prefijo));

// ── Cobrar ─────────────────────────────────────────────────────────────────────────────────────

test("cobro aprobado: una sola orden, por el monto de la BASE, y se aplica con su orden y lo cobrado", async () => {
  const { deps, llamadas, tokens, cuerpos } = doble({ mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
  assert.deepEqual(llamadas, ["tomarCobro", `mp.crearOrden {…} tienda-pago-${PAGO}`, `aplicar APROBADO ${ORDEN} 138.00`]);
  assert.deepEqual(tokens, ["TOKEN"]);
  assert.equal((cuerpos[0] as { total_amount: string; external_reference: string }).total_amount, "138.00");
  assert.equal((cuerpos[0] as { external_reference: string }).external_reference, PAGO);
});

test("402 failed: rechazo seguro; el pedido se descarta y el motivo sale de details", async () => {
  const { deps, llamadas } = doble({ mp: { crearOrden: { status: 402, cuerpo: RECHAZO_402 } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "RECHAZADO", motivo: "FONDOS" });
  assert.deepEqual(llamadas.slice(-1), ["descartar"]);
  assert.ok(sin(llamadas, "aplicar"));
  // Si ya no se puede descartar (algo movió el pedido entre tanto), no se afirma el rechazo.
  const movido = doble({ mp: { crearOrden: { status: 402, cuerpo: RECHAZO_402 } }, descarta: false });
  assert.deepEqual(await cobrarPago(movido.deps, DATOS), { tipo: "POR_CONFIRMAR" });
});

test("201 processing (en revisión): POR_CONFIRMAR, con la orden anotada; no se descarta ni se cancela", async () => {
  const { deps, llamadas } = doble({ mp: { crearOrden: { status: 201, cuerpo: EN_REVISION } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(llamadas.includes("anotar ORDTSTREVISION -"));
  assert.ok(sin(llamadas, "descartar") && sin(llamadas, "aplicar"));
});

test("401: PAGO_NO_DISPONIBLE con la marca de sin permiso, nunca rechazo de tarjeta; el pedido se descarta", async () => {
  const { deps, llamadas } = doble({ mp: { crearOrden: { status: 401, cuerpo: { message: "Unauthorized use of live credentials", code: 7 } } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "NO_DISPONIBLE", sinPermiso: true });
  assert.ok(llamadas.includes("descartar"));
  assert.ok(llamadas.some((l) => l.startsWith("registrar COBRO_SIN_PERMISO conexión cx-1")));
});

test("sin respuesta, 5xx, 409 o 429: POR_CONFIRMAR; nunca se descarta ni se dice rechazado", async () => {
  for (const status of [0, 500, 502, 503, 409, 429, 403, 404]) {
    const { deps, llamadas } = doble({ mp: { crearOrden: { status, cuerpo: RECHAZO_402 } } });
    assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "POR_CONFIRMAR" }, String(status));
    assert.ok(sin(llamadas, "descartar") && sin(llamadas, "aplicar"), String(status));
  }
});

// Respuesta real (documento 04) cuando `type` no corresponde al `id` de la tarjeta.
const VALIDACION_400 = { errors: [{ code: "property_value", message: "Invalid value for property",
  details: ["'$.transactions.payments[0].payment_method.id' - value must be one of 'amex', 'master', 'visa'"] }] };

test("400 o 422 de validación: NO es «tu banco no aprobó», y «no se creó nada» se comprueba antes de descartar", async () => {
  for (const status of [400, 422]) {
    // Mercado Pago confirma que no hay ninguna orden con nuestra referencia: el pedido se descarta.
    const limpio = doble({ mp: { crearOrden: { status, cuerpo: VALIDACION_400 }, buscarOrdenes: { status: 200, cuerpo: { data: [], paging: { total: 0 } } } } });
    assert.deepEqual(await cobrarPago(limpio.deps, DATOS), { tipo: "NO_PROCESADO", contarIp: false }, String(status));
    assert.deepEqual(limpio.llamadas.slice(-2).map((l) => l.split(" ")[0]), ["mp.buscarOrdenes", "descartar"]);
    // No se pudo comprobar: el renglón se CONSERVA y lo resuelve la conciliación. Nada de «no se cobró».
    const sinSaber = doble({ mp: { crearOrden: { status, cuerpo: VALIDACION_400 } } });
    assert.deepEqual(await cobrarPago(sinSaber.deps, DATOS), { tipo: "POR_CONFIRMAR" }, String(status));
    assert.ok(sin(sinSaber.llamadas, "descartar"));
    // Y si resulta que sí había una orden cobrada, se aplica: nunca se borra un pedido con cobro.
    const habia = doble({ mp: { crearOrden: { status, cuerpo: VALIDACION_400 }, buscarOrdenes: { status: 200, cuerpo: { data: [APROBADA] } } } });
    assert.deepEqual(await cobrarPago(habia.deps, DATOS), { tipo: "POR_CONFIRMAR" }, String(status));
    assert.ok(sin(habia.llamadas, "descartar") && habia.llamadas.includes(`aplicar APROBADO ${ORDEN} 138.00`));
  }
});

test("token de tarjeta inventado o ya usado (402 failed, invalid_card_token): no es un rechazo del banco; cuenta para la IP y no para el negocio", async () => {
  const cuerpo = { errors: [{ code: "failed", message: "The following transactions failed", details: ["PAY01M4PXXXX: invalid_card_token"] }] };
  const { deps, llamadas } = doble({ mp: { crearOrden: { status: 402, cuerpo } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "NO_PROCESADO", contarIp: true });
  assert.ok(llamadas.includes("descartar") && sin(llamadas, "aplicar"));
  // Una tarjeta de verdad rechazada sigue siendo un rechazo, con su motivo.
  const real = doble({ mp: { crearOrden: { status: 402, cuerpo: RECHAZO_402 } } });
  assert.deepEqual(await cobrarPago(real.deps, DATOS), { tipo: "RECHAZADO", motivo: "FONDOS" });
});

test("el token de la tarjeta que Mercado Pago DEVUELVE en la orden no llega a la base, al log ni a los correos", async () => {
  const TOKEN = "ff8080814c11e237014c1ff593b57b4d";
  // La forma real del 201: el pago trae el token, installment_amount y transaction_security.
  const conToken = (orden: typeof APROBADA) => ({ ...orden, transactions: { payments: [{ ...orden.transactions.payments[0],
    payment_method: { id: "debmaster", type: "debit_card", token: TOKEN, installments: 1, installment_amount: "138.00", transaction_security: { validation: "never" } } }] } });
  const casos = [
    doble({ mp: { crearOrden: { status: 201, cuerpo: conToken(APROBADA) } } }),
    doble({ mp: { crearOrden: { status: 201, cuerpo: conToken(EN_REVISION) } } }),
    doble({ mp: { crearOrden: { status: 201, cuerpo: conToken({ ...APROBADA, status_detail: "in_review" }) } } }),
    doble({ mp: { crearOrden: { status: 201, cuerpo: conToken({ ...APROBADA, user_id: "999" }) } } }),
    doble({ mp: { crearOrden: { status: 201, cuerpo: conToken({ ...APROBADA, status: "failed" }) } } }),
  ];
  for (const c of casos) await cobrarPago(c.deps, DATOS);
  const consulta = doble({ filas: [{ ...FILA, orden_id_externo: ORDEN }], mp: { leerOrden: { status: 200, cuerpo: conToken({ ...APROBADA, currency: "USD" }) } } });
  await confirmarPago(consulta.deps, PAGO);
  const busca = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [conToken({ ...APROBADA, status_detail: "in_review" }), conToken(APROBADA)] } } } });
  await confirmarPago(busca.deps, PAGO);
  const devuelve = doble({ mp: { leerOrden: { status: 200, cuerpo: conToken(APROBADA) }, devolver: { status: 422, cuerpo: conToken(APROBADA) } } });
  await devolverPago(devuelve.deps, TAREA);
  for (const c of [...casos, consulta, busca, devuelve]) {
    // `llamadas` anota todo lo que se le pasó a la base (aplicar, anotar, devolución) y al log (registrar).
    assert.ok(c.llamadas.length > 0);
    assert.ok(!c.llamadas.join("\n").includes(TOKEN), c.llamadas.join("\n"));
    assert.ok(!JSON.stringify(c.aLaBase).includes(TOKEN) && !JSON.stringify(c.aLaBase).includes("transaction_security"));
  }
  // El débito aprobado (VERIFICADO: debmaster / debit_card) se aplica con su marca y su tipo, nada más.
  assert.deepEqual(casos[0]!.aLaBase[0], { resultado: "APROBADO", ordenIdExterno: ORDEN, pagoIdExterno: "PAY01M4P8JX8TKPS5B2ECXP875P89", monto: "138.00", tipoTarjeta: "debit_card", marca: "debmaster", detalle: "accredited" });
});

test("una orden con otra referencia, o por otro monto, no deja el pedido pagado", async () => {
  const ajena = doble({ mp: { crearOrden: { status: 201, cuerpo: { ...APROBADA, external_reference: "otra" } } } });
  assert.deepEqual(await cobrarPago(ajena.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(sin(ajena.llamadas, "aplicar") && sin(ajena.llamadas, "descartar"));
  // Por otro monto la base la manda a devolver (estado distinto de APROBADO): no hay pedido pagado.
  const otroMonto = doble({ mp: { crearOrden: { status: 201, cuerpo: { ...APROBADA, total_paid_amount: "1.00" } } },
                            aplicar: () => ({ estado: "CREADO", pedido_estado: "POR_PAGAR", recien_aprobado: false }) });
  assert.deepEqual(await cobrarPago(otroMonto.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(otroMonto.llamadas.includes(`aplicar APROBADO ${ORDEN} 1.00`));
});

test("sin token no sale ningún cobro ni queda marcado como mandado: el pedido se descarta", async () => {
  const { deps, llamadas, tokens } = doble({ token: null });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "NO_DISPONIBLE", sinPermiso: false });
  assert.deepEqual(tokens, []);
  assert.ok(sin(llamadas, "tomarCobro") && sin(llamadas, "mp."));
});

test("un reintento del mismo intento NO vuelve a cobrar: pregunta qué pasó con el primero", async () => {
  // Sin orden anotada (la respuesta se perdió): busca por referencia, en la ventana del renglón.
  const { deps, llamadas } = doble({ toma: false, filas: [{ ...FILA, cobro_mandado: true }, { ...FILA, cobro_mandado: true }, { ...FILA, estado: "APROBADO" }],
                                     mp: { buscarOrdenes: { status: 200, cuerpo: { data: [APROBADA] } } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
  assert.ok(sin(llamadas, "mp.crearOrden"));
  assert.ok(llamadas.includes(`mp.buscarOrdenes ${PAGO} 2026-10-11T17:50:00.000Z 2026-10-11T18:08:00.000Z`));
  // Con la orden anotada (quedó en revisión): consulta ESA orden y no busca.
  const anotada = doble({ toma: false, filas: [{ ...FILA, cobro_mandado: true, orden_id_externo: "ORDTSTREVISION" }], mp: { leerOrden: { status: 200, cuerpo: EN_REVISION } } });
  assert.deepEqual(await cobrarPago(anotada.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(anotada.llamadas.includes("mp.leerOrden ORDTSTREVISION") && sin(anotada.llamadas, "mp.buscarOrdenes") && sin(anotada.llamadas, "mp.crearOrden"));
  // Mercado Pago no contesta: no se sabe.
  const mudo = doble({ toma: false, filas: [{ ...FILA, cobro_mandado: true }] });
  assert.deepEqual(await cobrarPago(mudo.deps, DATOS), { tipo: "POR_CONFIRMAR" });
});

test("la carrera: el aviso del rechazo llegó antes que la respuesta del cobro; se contesta PAGO_RECHAZADO con su detalle", async () => {
  // (a) El reintento encuentra el pago ya RECHAZADO por el aviso: se descarta y se dice por qué, sin llamar a Mercado Pago.
  const a = doble({ filas: [{ ...FILA, estado: "RECHAZADO", detalle: "bad_filled_card_data", cobro_mandado: true }] });
  assert.deepEqual(await cobrarPago(a.deps, DATOS), { tipo: "RECHAZADO", motivo: "DATOS" });
  assert.deepEqual(a.llamadas, ["descartar"]);
  // (b) El reintento pregunta, y Mercado Pago dice que la orden falló: el mismo final.
  const b = doble({ toma: false, filas: [{ ...FILA, cobro_mandado: true }, { ...FILA, cobro_mandado: true }, { ...FILA, estado: "RECHAZADO", detalle: "insufficient_amount", cobro_mandado: true }],
                    mp: { buscarOrdenes: { status: 200, cuerpo: { data: [] } } } });
  assert.deepEqual(await cobrarPago(b.deps, DATOS), { tipo: "RECHAZADO", motivo: "FONDOS" });
  // (c) Un pago ya vencido o por devolver no se descarta ni se cobra: que lo diga el seguimiento.
  for (const estado of ["VENCIDO", "POR_DEVOLVER", "DEVUELTO", "DEVOLUCION_FALLIDA"] as const) {
    const c = doble({ filas: [{ ...FILA, estado }] });
    assert.deepEqual(await cobrarPago(c.deps, DATOS), { tipo: "POR_CONFIRMAR" }, estado);
    assert.deepEqual(c.llamadas, [], estado);
  }
});

test("un pago que ya está aprobado no se vuelve a cobrar", async () => {
  const { deps, llamadas } = doble({ filas: [{ ...FILA, estado: "APROBADO" }] });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "APROBADO", recienAprobado: false });
  assert.deepEqual(llamadas, []);
});

// ── Confirmar ──────────────────────────────────────────────────────────────────────────────────

test("confirmar: la orden anotada manda sobre la pista del aviso; sin ninguna, se busca por referencia", async () => {
  const anotada = doble({ filas: [{ ...FILA, orden_id_externo: ORDEN }], mp: { leerOrden: { status: 200, cuerpo: APROBADA } } });
  assert.deepEqual(await confirmarPago(anotada.deps, PAGO, "ORDDEOTRO"), { ok: true, aplicados: 1, recienAprobado: true, enVerificacion: false });
  assert.ok(anotada.llamadas.includes(`mp.leerOrden ${ORDEN}`));
  const pista = doble({ mp: { leerOrden: { status: 200, cuerpo: APROBADA } } });
  assert.deepEqual(await confirmarPago(pista.deps, PAGO, ORDEN), { ok: true, aplicados: 1, recienAprobado: true, enVerificacion: false });
  const busca = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [] } } } });
  assert.deepEqual(await confirmarPago(busca.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: false });
});

test("confirmar: la pista de un aviso con una orden de OTRO pago no mueve nada", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: { ...APROBADA, external_reference: "otro-pago" } } } });
  assert.deepEqual(await confirmarPago(deps, PAGO, "ORDAJENA"), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: false });
  assert.ok(sin(llamadas, "aplicar") && sin(llamadas, "anotar"));
  // Y una orden que ese token no ve (es de otra cuenta): 404, nada que reintentar.
  const otra = doble({ mp: { leerOrden: { status: 404, cuerpo: null } } });
  assert.deepEqual(await confirmarPago(otra.deps, PAGO, "ORDAJENA"), { ok: false, motivo: "NO_ENCONTRADO" });
});

test("confirmar: sin pago, sin token o sin respuesta, lo dice; y cada caso contesta lo suyo a Mercado Pago", async () => {
  assert.deepEqual(await confirmarPago(doble({ filas: [null] }).deps, PAGO), { ok: false, motivo: "PAGO_DESCONOCIDO" });
  assert.deepEqual(await confirmarPago(doble({ token: null }).deps, PAGO), { ok: false, motivo: "SIN_TOKEN" });
  assert.deepEqual(await confirmarPago(doble().deps, PAGO), { ok: false, motivo: "MP_NO_RESPONDE" });
  // La búsqueda con un formato de fechas que Mercado Pago no acepte (sin probar) cae aquí: no es «sin pago».
  assert.deepEqual(await confirmarPago(doble({ mp: { buscarOrdenes: { status: 400, cuerpo: { errors: [{ code: "invalid_params" }] } } } }).deps, PAGO), { ok: false, motivo: "MP_NO_RESPONDE" });
  assert.equal(respuestaDeConfirmacion({ ok: true, aplicados: 0, recienAprobado: false, enVerificacion: false }), 200);
  for (const motivo of ["PAGO_DESCONOCIDO", "NO_ENCONTRADO", "PAGO_SIN_APLICAR"] as const) assert.equal(respuestaDeConfirmacion({ ok: false, motivo }), 200);
  for (const motivo of ["SIN_TOKEN", "MP_NO_RESPONDE"] as const) assert.equal(respuestaDeConfirmacion({ ok: false, motivo }), 503);
});

test("confirmar: una orden viva con nuestra referencia que no se puede aplicar NO cuenta como conciliada, y queda anotada con su id y su motivo", async () => {
  const sinAcreditar = { ...APROBADA, status_detail: "in_review" };
  const { deps, llamadas } = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [sinAcreditar] } } } });
  assert.deepEqual(await confirmarPago(deps, PAGO), { ok: false, motivo: "PAGO_SIN_APLICAR" });
  const motivo = `orden ${ORDEN}: INCIDENTE (procesada sin acreditar: in_review)`;
  assert.ok(llamadas.includes(`anotar - ${motivo}`), llamadas.join("\n"));
  assert.ok(llamadas.includes(`registrar PAGO_SIN_APLICAR pago ${PAGO}, ${motivo}`));
  assert.ok(sin(llamadas, "aplicar"));
  // En revisión: tampoco es «sin pago», y su orden queda anotada para consultarla a ella.
  const revision = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [EN_REVISION] } } } });
  assert.deepEqual(await confirmarPago(revision.deps, PAGO), { ok: false, motivo: "PAGO_SIN_APLICAR" });
  assert.ok(revision.llamadas.includes("anotar ORDTSTREVISION orden ORDTSTREVISION: PENDIENTE (processing)"));
  // Con nuestra referencia pero de OTRA cuenta vendedora: viva y sin aplicar. Nunca paga el pedido.
  const modo = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [{ ...APROBADA, user_id: "999" }] } } } });
  assert.deepEqual(await confirmarPago(modo.deps, PAGO), { ok: false, motivo: "PAGO_SIN_APLICAR" });
  // Si además hay una aprobada que sí se aplica, el pedido tiene su pago: cuenta como buena.
  const conBuena = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [sinAcreditar, { ...APROBADA, id: "ORDBUENA" }] } } } });
  assert.deepEqual(await confirmarPago(conBuena.deps, PAGO), { ok: true, aplicados: 1, recienAprobado: true, enVerificacion: false });
});

test("confirmar: con varias órdenes, la aprobada se aplica antes que la rechazada", async () => {
  const fallida = { ...APROBADA, id: "ORDFALLIDA", status: "failed", status_detail: "failed", total_paid_amount: undefined };
  const { deps, llamadas } = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [fallida, APROBADA] } } } });
  assert.deepEqual(await confirmarPago(deps, PAGO), { ok: true, aplicados: 2, recienAprobado: true, enVerificacion: false });
  assert.deepEqual(llamadas.filter((l) => l.startsWith("aplicar")), [`aplicar APROBADO ${ORDEN} 138.00`, "aplicar RECHAZADO ORDFALLIDA 138.00"]);
});

// ── Devolver ───────────────────────────────────────────────────────────────────────────────────

const TAREA: Tarea = { id: PAGO, tarea: "DEVOLVER", conexion_id: "cx-1", orden_id_externo: ORDEN };

test("devolver: mira la orden, pide la devolución sin cuerpo con una llave NUEVA, y queda DEVUELTO", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: APROBADA }, devolver: { status: 201, cuerpo: { ...APROBADA, status: "refunded" } } } });
  assert.equal(await devolverPago(deps, TAREA), "DEVUELTO");
  assert.deepEqual(llamadas, [`mp.leerOrden ${ORDEN}`, `mp.devolver ${ORDEN} llave-1`, `devolucion ${PAGO} true`]);
});

test("devolver: cada intento lleva una llave distinta (con la misma, Mercado Pago repite el 422 guardado)", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: APROBADA },
    devolver: [{ status: 422, cuerpo: { errors: [{ code: "unprocessable_entity", message: "Post processing rejected the operation." }] } }, { status: 201, cuerpo: { ...APROBADA, status: "refunded" } }] } });
  assert.equal(await devolverPago(deps, TAREA), "POR_DEVOLVER");
  assert.equal(await devolverPago(deps, TAREA), "DEVUELTO");
  assert.deepEqual(llamadas.filter((l) => l.startsWith("mp.devolver")), [`mp.devolver ${ORDEN} llave-1`, `mp.devolver ${ORDEN} llave-2`]);
  assert.ok(llamadas.includes(`devolucion ${PAGO} false HTTP 422 unprocessable_entity`));
});

test("devolver: si la orden ya está refunded se marca DEVUELTO SIN pedir otra devolución", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: { ...APROBADA, status: "refunded" } } } });
  assert.equal(await devolverPago(deps, TAREA), "DEVUELTO");
  assert.ok(sin(llamadas, "mp.devolver"));
});

test("devolver: si no se puede mirar la orden no se intenta; sin orden o sin token, falla y lo dice", async () => {
  const mudo = doble();
  assert.equal(await devolverPago(mudo.deps, TAREA), "POR_DEVOLVER");
  assert.ok(sin(mudo.llamadas, "mp.devolver"));
  assert.ok(mudo.llamadas.includes(`devolucion ${PAGO} false no se pudo consultar la orden: HTTP 500`));
  const sinOrden = doble();
  await devolverPago(sinOrden.deps, { ...TAREA, orden_id_externo: null });
  assert.deepEqual(sinOrden.llamadas, [`devolucion ${PAGO} false sin id de orden en Mercado Pago`]);
  const sinToken = doble({ token: null });
  await devolverPago(sinToken.deps, TAREA);
  assert.deepEqual(sinToken.llamadas, [`devolucion ${PAGO} false sin token de la cuenta del restaurante`]);
});

test("devolver: un 2xx que no deja la orden refunded no se da por hecho", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: APROBADA }, devolver: { status: 201, cuerpo: { ...APROBADA, status: "processed" } } } });
  assert.equal(await devolverPago(deps, TAREA), "POR_DEVOLVER");
  assert.ok(llamadas.includes(`devolucion ${PAGO} false devolución pedida, orden processed`));
});

// ── El barrido ─────────────────────────────────────────────────────────────────────────────────

test("barrer: devuelve y concilia; avisa de la devolución que se rindió y del tercer fallo de consulta; un fallo no detiene a los demás", async () => {
  const tareas: Tarea[] = [
    { id: "p1", tarea: "DEVOLVER", conexion_id: "cx-1", orden_id_externo: "ORD1" },
    { id: "p2", tarea: "DEVOLVER", conexion_id: "cx-1", orden_id_externo: null },
    { id: "p3", tarea: "CONCILIAR", conexion_id: "cx-1", orden_id_externo: null },
  ];
  const { deps } = doble({ tareas, devolucion: (ok) => (ok ? "DEVUELTO" : "DEVOLUCION_FALLIDA"), tercerFallo: () => true,
                           mp: { leerOrden: { status: 200, cuerpo: { status: "refunded" } } } });
  const avisos: string[] = [];
  const cuenta = await barrer(deps, async (t, de) => { avisos.push(`${t.id} ${de}`); });
  assert.deepEqual(cuenta, { devueltos: 1, fallidos: 1, conciliados: 0, sinConsultar: 1 });
  assert.deepEqual(avisos, ["p2 DEVOLUCION", "p3 CONCILIACION"]);
  const roto = doble({ tareas });
  roto.deps.db.token = async () => { throw new Error("la base no responde"); };
  assert.deepEqual(await barrer(roto.deps, async () => {}), { devueltos: 0, fallidos: 0, conciliados: 0, sinConsultar: 0 });
  // (La tarea sin orden no llega a pedir el token: falla por su cuenta, sin excepción.)
  assert.equal(roto.llamadas.filter((l) => l.startsWith("registrar BARRIDO")).length, 2);
});

test("barrer: una orden viva sin aplicar cuenta como fallo de conciliación (acaba avisando a VIM)", async () => {
  const { deps, llamadas } = doble({ tareas: [{ id: PAGO, tarea: "CONCILIAR", conexion_id: "cx-1", orden_id_externo: null }], tercerFallo: () => true,
                                     mp: { buscarOrdenes: { status: 200, cuerpo: { data: [{ ...APROBADA, status_detail: "in_review" }] } } } });
  const avisos: string[] = [];
  await barrer(deps, async (t, de) => { avisos.push(`${t.id} ${de}`); });
  assert.ok(llamadas.includes(`conciliacion ${PAGO} false`));
  assert.deepEqual(avisos, [`${PAGO} CONCILIACION`]);
});

// ── Topes y correos ────────────────────────────────────────────────────────────────────────────

test("los topes del aviso: el de la referencia va antes que el global, y lo desconocido tiene su bolsa aparte", () => {
  assert.deepEqual(topesDelAviso("ABC", false).map((t) => t.clave), ["mp-tienda:ref-desconocida"]);
  assert.deepEqual(topesDelAviso("ABC", true).map((t) => t.clave), ["mp-tienda:aviso:abc", "mp-tienda:avisos"]);
});

test("el correo de «posible cobro sin pedido» lleva el id de la orden y el motivo; ninguno lleva datos del cliente ni de la tarjeta", () => {
  const c = avisoDeConciliacionFallida({ pagoId: PAGO, negocio: "Knock-Out <b>", folio: "T1A2B3", monto: "138.00",
                                         ordenIdExterno: ORDEN, motivo: `orden ${ORDEN}: INCIDENTE (procesada sin acreditar: in_review)` });
  assert.ok(c.html.includes(ORDEN) && c.html.includes("INCIDENTE (procesada sin acreditar: in_review)") && c.html.includes(PAGO));
  assert.ok(c.html.includes("Knock-Out &lt;b&gt;") && !c.html.includes("<b>"));
  assert.match(c.subject, /^[\x20-\x7e]+$/);
  // Sin orden ni motivo (no se pudo consultar): lo dice, no deja huecos.
  const sinDatos = avisoDeConciliacionFallida({ pagoId: PAGO, negocio: "N", folio: "T1", monto: "1.00" });
  assert.ok(sinDatos.html.includes("no se sabe") && sinDatos.html.includes("no se pudo consultar a Mercado Pago"));
  const d = avisoDeDevolucionFallida({ pagoId: PAGO, negocio: "N", folio: "T1", monto: "1.00", error: "HTTP 422 unprocessable_entity", ordenIdExterno: ORDEN });
  assert.ok(d.html.includes(ORDEN) && d.html.includes("HTTP 422 unprocessable_entity"));
  for (const html of [c.html, sinDatos.html, d.html]) assert.doesNotMatch(html, /@|card|APP_USR|\d{4} ?\d{4} ?\d{4}/i);
});

// VERIFICADO en producción (11 oct 2026): cobrar con una aplicación real a un vendedor de prueba contesta
// 422 `unprocessable_content` y deja la orden en `created`, sin cobrar, para siempre.
test("422 que deja la orden abierta en created: se cancela allá y el pedido se descarta; nadie se queda «confirmando»", async () => {
  const ABIERTA = { ...APROBADA, status: "created", status_detail: undefined, total_paid_amount: undefined, created_date: "2026-10-11T18:02:59.000Z" };
  const CANCELADA = { ...ABIERTA, status: "canceled", status_detail: "canceled" };
  const e422 = { status: 422, cuerpo: { errors: [{ code: "unprocessable_content", message: "Unprocessable Entity" }] } };
  const { deps, llamadas } = doble({
    filas: [FILA, FILA, { ...FILA, estado: "RECHAZADO" }],
    mp: { crearOrden: e422, buscarOrdenes: { status: 200, cuerpo: { data: [ABIERTA] } }, cancelarOrden: { status: 200, cuerpo: CANCELADA }, leerOrden: { status: 200, cuerpo: CANCELADA } },
    aplicar: () => ({ estado: "RECHAZADO", pedido_estado: "EXPIRADO", recien_aprobado: false }),
  });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "NO_PROCESADO", contarIp: false });
  assert.ok(llamadas.some((l) => l.startsWith("mp.cancelarOrden ")), "debía cancelar la orden abierta");
  assert.ok(llamadas.some((l) => l.startsWith("aplicar RECHAZADO ")), "la orden cancelada cierra el pago");
  assert.ok(llamadas.includes("descartar"));

  // En el barrido, una orden recién nacida (menos de un minuto) puede estar procesándose: no se toca.
  const joven = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [ABIERTA] } } } });
  await confirmarPago(joven.deps, FILA.id);
  assert.ok(sin(joven.llamadas, "mp.cancelarOrden"), "con menos de un minuto no se cancela");
  // Pasado el minuto, sí.
  const vieja = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [{ ...ABIERTA, created_date: "2026-10-11T18:00:00.000Z" }] } }, cancelarOrden: { status: 200, cuerpo: CANCELADA }, leerOrden: { status: 200, cuerpo: CANCELADA } } });
  await confirmarPago(vieja.deps, FILA.id);
  assert.ok(vieja.llamadas.some((l) => l.startsWith("mp.cancelarOrden ")));
  // Y una que está EN REVISIÓN (processing) nunca: Mercado Pago no deja y puede acabar cobrada.
  const revision = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [{ ...EN_REVISION, created_date: "2026-10-11T17:00:00.000Z" }] } } } });
  await confirmarPago(revision.deps, FILA.id);
  assert.ok(sin(revision.llamadas, "mp.cancelarOrden"));
});

// ── Antifraude (12 oct 2026): in_review, el detalle del pedido y la huella del dispositivo ─────────
const EN_ANTIFRAUDE = { ...APROBADA, id: "ORDTSTANTIFRAUDE", status: "in_review", status_detail: "in_review", total_paid_amount: "0.00" };
const DETALLE = {
  descripcion: "Pedido T1A2B3 en Knock-Out Burger",
  renglones: [{ nombre: "Clásica", cantidad: 1, total_mxn: "120.00" }], envio: null, propina: "18.00",
  pagador: { nombre: "Anastasia Villalpando", telefono: "4779876543",
             direccion: { calle: "Privada Jacarandas", numero_exterior: "1482", codigo_postal: "37123", ciudad: "Leonardo Bravo", estado: "Guanajuato" } },
};
const CON_DETALLE = { ...DATOS, tarjeta: { ...DATOS.tarjeta, dispositivo: "armor.1a2b3c4d5e6f" }, detalle: DETALLE };
const PERSONALES = ["Anastasia", "Villalpando", "4779876543", "9876543", "Jacarandas", "1482", "37123", "Leonardo", "ana@example.com", "armor.1a2b3c4d5e6f", DATOS.tarjeta.token];

test("201 in_review: POR_CONFIRMAR con la orden anotada; no se descarta, no se cancela y no es un incidente", async () => {
  const { deps, llamadas } = doble({ mp: { crearOrden: { status: 201, cuerpo: EN_ANTIFRAUDE } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(llamadas.includes("anotar ORDTSTANTIFRAUDE -"));
  assert.ok(llamadas.includes(`registrar COBRO_SIN_RESULTADO pago ${PAGO}: PENDIENTE (in_review)`));
  assert.equal(llamadas.some((l) => l.startsWith("descartar") || l.startsWith("mp.cancelarOrden") || l.includes("INCIDENTE")), false);
});
test("confirmar con la orden todavía in_review: sigue pendiente (no cuenta como conciliación buena) y no se cancela aunque lleve una hora", async () => {
  const vieja = { ...EN_ANTIFRAUDE, created_date: "2026-10-11T17:00:00.000Z" };
  const { deps, llamadas } = doble({ filas: [{ ...FILA, cobro_mandado: true, orden_id_externo: "ORDTSTANTIFRAUDE" }], mp: { leerOrden: { status: 200, cuerpo: vieja } } });
  assert.deepEqual(await confirmarPago(deps, PAGO), { ok: false, motivo: "PAGO_SIN_APLICAR" });
  assert.equal(llamadas.some((l) => l.startsWith("mp.cancelarOrden") || l.startsWith("aplicar") || l.startsWith("registrar")), false);
  assert.ok(llamadas.includes("anotar ORDTSTANTIFRAUDE orden ORDTSTANTIFRAUDE: PENDIENTE (in_review)"));
});
test("in_review que acaba en failed (el aviso order.failed): se aplica el rechazo y el pedido se cierra", async () => {
  const fallida = { ...EN_ANTIFRAUDE, status: "failed", status_detail: "failed", transactions: { payments: [{ id: "PAY01", status: "failed", status_detail: "high_risk", payment_method: { id: "master", type: "credit_card" } }] } };
  const { deps, llamadas } = doble({ filas: [{ ...FILA, cobro_mandado: true, orden_id_externo: "ORDTSTANTIFRAUDE" }], mp: { leerOrden: { status: 200, cuerpo: fallida } } });
  assert.deepEqual(await confirmarPago(deps, PAGO, "ORDTSTANTIFRAUDE"), { ok: true, aplicados: 1, recienAprobado: false, enVerificacion: false });
  assert.ok(llamadas.some((l) => l.startsWith("aplicar RECHAZADO ORDTSTANTIFRAUDE")));
});
test("402 high_risk: rechazado con su propio motivo (RIESGO), y el pedido se descarta", async () => {
  const { deps } = doble({ mp: { crearOrden: { status: 402, cuerpo: { errors: [{ code: "failed", details: ["PAY01M4P8KB8MM494BGX78592RQMQ: high_risk"] }] } } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "RECHAZADO", motivo: "RIESGO" });
});
test("el cobro lleva el detalle del pedido y la huella del dispositivo; la llave y la verificación son las de siempre", async () => {
  const { deps, llamadas, cuerpos, huellas } = doble({ mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  assert.deepEqual(await cobrarPago(deps, CON_DETALLE), { tipo: "APROBADO", recienAprobado: true });
  const c = cuerpos[0] as { description: string; items: { unit_price: string; quantity: number }[]; payer: Record<string, unknown>; total_amount: string };
  assert.equal(c.description, "Pedido T1A2B3 en Knock-Out Burger");
  assert.deepEqual(c.items, [{ title: "Clásica", unit_price: "120.00", quantity: 1 }, { title: "Propina", unit_price: "18.00", quantity: 1 }]);
  assert.equal(c.total_amount, "138.00");
  assert.deepEqual(c.payer.phone, { area_code: "477", number: "9876543" });
  assert.deepEqual(huellas, ["armor.1a2b3c4d5e6f"]);
  // La misma llave y los mismos pasos que un cobro sin detalle.
  assert.deepEqual(llamadas, ["tomarCobro", `mp.crearOrden {…} tienda-pago-${PAGO}`, `aplicar APROBADO ${ORDEN} 138.00`]);
  // Sin huella, sin cabecera.
  const sin = doble({ mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  await cobrarPago(sin.deps, DATOS);
  assert.deepEqual(sin.huellas, [null]);
});
test("NADA del cliente llega a un log ni a la base: ni aprobado, ni rechazado, ni en revisión, ni sin respuesta, ni cuando Mercado Pago repite los datos en su error", async () => {
  // Un 400 que repite, en su mensaje y en sus detalles, cada dato personal que se le mandó.
  const eco = { errors: [{ code: "bad_request", message: `payer.first_name Anastasia Villalpando no vale`,
    details: ["payer.phone.number: 9876543", "payer.phone: 4779876543", "payer.address.street_name: Privada Jacarandas 1482, 37123 Leonardo Bravo", "payer.email: ana@example.com", `token ${DATOS.tarjeta.token}`, "session armor.1a2b3c4d5e6f"] }] };
  const escenas: Parameters<typeof doble>[0][] = [
    { mp: { crearOrden: { status: 201, cuerpo: APROBADA } } },
    { mp: { crearOrden: { status: 402, cuerpo: RECHAZO_402 } } },
    { mp: { crearOrden: { status: 201, cuerpo: EN_ANTIFRAUDE } } },
    { mp: { crearOrden: { status: 0, cuerpo: null } } },
    { mp: { crearOrden: { status: 401, cuerpo: { message: "Anastasia Villalpando" } } } },
    { mp: { crearOrden: { status: 400, cuerpo: eco }, buscarOrdenes: { status: 200, cuerpo: { data: [] } } } },
    { mp: { crearOrden: { status: 422, cuerpo: eco }, buscarOrdenes: { status: 500, cuerpo: eco } } },
  ];
  for (const [i, escena] of escenas.entries()) {
    const { deps, llamadas, aLaBase } = doble(escena);
    await cobrarPago(deps, CON_DETALLE);
    const escrito = JSON.stringify([llamadas, aLaBase]);
    for (const dato of PERSONALES) assert.equal(escrito.toLowerCase().includes(dato.toLowerCase()), false, `escena ${i}: «${dato}» llegó a un log o a la base`);
  }
  // Y lo que sí queda del 400 sirve para arreglarlo: el nombre de la propiedad.
  const { deps, llamadas } = doble(escenas[5]);
  await cobrarPago(deps, CON_DETALLE);
  assert.ok(llamadas.some((l) => l.startsWith("registrar COBRO_NO_ACEPTADO") && l.includes("payer.phone.number") && l.includes("payer.address.street_name")));
});

// ── La verificación del banco (3D Secure). Respuestas REALES del 12 y 13 oct 2026 (documento 04) ──
const ORDEN_RETO = "ORDTST01M4P8RETO";
const URL_RETO = "https://www.mercadopago.com.mx/auth/card/validation/pages/remedies/5f0c3c6e-1111-4222-8333-444455556666?display_mode=self_hosted&guest_token=9a8b7c6d-aaaa-4bbb-8ccc-ddddeeeeffff";
/** Lo que NUNCA debe llegar a la base ni a un log: la dirección, su identificador y su token de invitado. */
const DEL_RETO = [URL_RETO, "remedies", "guest_token", "9a8b7c6d-aaaa-4bbb-8ccc-ddddeeeeffff", "5f0c3c6e-1111-4222-8333-444455556666", "mercadopago.com.mx"];
const seguridad = (extra: Record<string, unknown>) => ({ id: "5f0c3c6e-1111-4222-8333-444455556666", validation: "on_fraud_risk", liability_shift: "required", ...extra });
const pagoDeReto = (status: string, status_detail: string, ts: Record<string, unknown>) =>
  ({ transactions: { payments: [{ id: "PAY01M4P8RETO", status, status_detail, payment_method: { id: "master", type: "credit_card", token: DATOS.tarjeta.token, installments: 1, transaction_security: seguridad(ts) } }] } });
// 201 de POST /v1/orders con verificación «on_fraud_risk»: el banco quiere confirmar con el cliente.
const EN_RETO = { ...APROBADA, id: ORDEN_RETO, status: "action_required", status_detail: "pending_challenge", total_paid_amount: "0.00", ...pagoDeReto("action_required", "pending_challenge", { url: URL_RETO }) };
// Titular APRO-CHOK tras «Confirmar»: processed / accredited, autenticada y ya sin dirección.
const RETO_APROBADO = { ...APROBADA, id: ORDEN_RETO, ...pagoDeReto("processed", "accredited", { type: "threeds", status: "authenticated" }) };
// Titular APRO tras «Confirmar»: failed / failed, y el pago 3ds_challenge_failed.
const RETO_FALLIDO = { ...EN_RETO, status: "failed", status_detail: "failed", ...pagoDeReto("failed", "3ds_challenge_failed", { type: "threeds", status: "not_authenticated" }) };
// VERIFICADO (12 y 13 oct 2026): cancelar una orden que espera el reto → 422, recién creada y a los 40 minutos. La orden sigue igual.
const NO_SE_CANCELA = { status: 422, cuerpo: { errors: [{ code: "unprocessable_content", message: "Unprocessable Entity" }] } };
// SIN VERIFICAR: cómo queda una orden si un día Mercado Pago SÍ la deja cancelar, o la vence él. El código solo mira `status`.
const RETO_CANCELADO = { ...EN_RETO, status: "canceled", status_detail: "canceled", ...pagoDeReto("canceled", "canceled", {}) };
const FILA_EN_RETO: FilaPago = { ...FILA, cobro_mandado: true, orden_id_externo: ORDEN_RETO, en_verificacion: true };
const FILA_ABANDONADA: FilaPago = { ...FILA_EN_RETO, estado: "ABANDONADO" };
const CERRADO = () => ({ estado: "ABANDONADO", pedido_estado: "EXPIRADO", recien_aprobado: false });
const sinRastroDelReto = (d: { llamadas: string[]; aLaBase: unknown[] }, extra: unknown = null) => {
  const escrito = JSON.stringify([d.llamadas, d.aLaBase, extra]);
  for (const dato of DEL_RETO) assert.equal(escrito.includes(dato), false, `«${dato}» llegó a la base, a un log o a un resultado que se guarda`);
};

test("el cobro se pide con verificación «solo si hay riesgo»", async () => {
  const { deps, cuerpos } = doble({ mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  await cobrarPago(deps, DATOS);
  assert.deepEqual((cuerpos[0] as { config: unknown }).config, { online: { transaction_security: { validation: "on_fraud_risk", liability_shift: "required" } } });
});

test("reto: 201 action_required / pending_challenge → VERIFICACION con la dirección; la orden queda anotada con su plazo y nada se cobra, se descarta ni se cancela", async () => {
  const d = doble({ mp: { crearOrden: { status: 201, cuerpo: EN_RETO } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "VERIFICACION", url: URL_RETO });
  assert.ok(d.llamadas.includes(`verificar ${ORDEN_RETO}`));
  assert.ok(sin(d.llamadas, "aplicar") && sin(d.llamadas, "descartar") && sin(d.llamadas, "mp.cancelarOrden") && sin(d.llamadas, "anotar") && sin(d.llamadas, "abandonar"));
  // La dirección viaja solo en lo que se le contesta a ese cliente.
  sinRastroDelReto(d);
});

test("reto con una dirección que no es de Mercado Pago (o sin ella): no se abre; el reto se deja en el acto (nadie puede contestarlo) y el pedido NO se descarta", async () => {
  for (const url of ["https://evil.example/reto?guest_token=9a8b7c6d-aaaa-4bbb-8ccc-ddddeeeeffff", "http://www.mercadopago.com.mx/x", undefined]) {
    const d = doble({ mp: { crearOrden: { status: 201, cuerpo: { ...EN_RETO, ...pagoDeReto("action_required", "pending_challenge", { url }) } } } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" });
    assert.ok(d.llamadas.includes(`abandonar ${ORDEN_RETO}`) && sin(d.llamadas, "verificar") && sin(d.llamadas, "descartar"));
    assert.ok(d.llamadas.some((l) => l.startsWith("registrar RETO_SIN_DIRECCION")));
    assert.equal(JSON.stringify([d.llamadas, d.aLaBase]).includes("evil.example"), false);
    assert.equal(JSON.stringify([d.llamadas, d.aLaBase]).includes("guest_token"), false);
  }
  // Si la base no lo deja abandonar (algo lo movió), no se afirma nada: POR_CONFIRMAR.
  const raro = doble({ abandona: false, mp: { crearOrden: { status: 201, cuerpo: { ...EN_RETO, ...pagoDeReto("action_required", "pending_challenge", {}) } } } });
  assert.deepEqual(await cobrarPago(raro.deps, DATOS), { tipo: "POR_CONFIRMAR" });
});

test("reto vivo: no es un fallo ni «no hay orden»; no se cancela, no se anota como error, y la dirección solo sale por alReto", async () => {
  const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  const vistas: string[] = [];
  const c = await confirmarPago(d.deps, PAGO, undefined, false, { alReto: (u) => vistas.push(u) });
  assert.deepEqual(c, { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.deepEqual(vistas, [URL_RETO]);
  assert.ok(sin(d.llamadas, "mp.cancelarOrden") && sin(d.llamadas, "aplicar") && sin(d.llamadas, "anotar") && sin(d.llamadas, "verificar") && sin(d.llamadas, "abandonar") && sin(d.llamadas, "registrar"));
  // El resultado de confirmar se guarda en tienda_eventos (el aviso): no puede llevar la dirección.
  sinRastroDelReto(d, c);
  assert.equal(respuestaDeConfirmacion(c), 200);

  // Si se supo de la orden aquí (la respuesta del cobro se perdió): se anota y se le da su plazo.
  const perdida = doble({ filas: [{ ...FILA, cobro_mandado: true }], mp: { buscarOrdenes: { status: 200, cuerpo: { data: [EN_RETO] } } } });
  assert.deepEqual(await confirmarPago(perdida.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.ok(perdida.llamadas.includes(`verificar ${ORDEN_RETO}`) && sin(perdida.llamadas, "mp.cancelarOrden"));
  sinRastroDelReto(perdida);
});

test("aprobado tras el reto: la consulta lo aplica y el pedido queda pagado", async () => {
  const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: RETO_APROBADO } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, ORDEN_RETO), { ok: true, aplicados: 1, recienAprobado: true, enVerificacion: false });
  assert.ok(d.llamadas.includes(`aplicar APROBADO ${ORDEN_RETO} 138.00`) && sin(d.llamadas, "mp.cancelarOrden"));
  sinRastroDelReto(d);
});

test("el banco no confirmó el reto (3ds_challenge_failed): rechazo con su motivo; el reintento del cliente lo lee como VERIFICACION y el pedido se descarta", async () => {
  const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: RETO_FALLIDO } },
                    aplicar: () => ({ estado: "RECHAZADO", pedido_estado: "EXPIRADO", recien_aprobado: false }) });
  assert.deepEqual(await confirmarPago(d.deps, PAGO), { ok: true, aplicados: 1, recienAprobado: false, enVerificacion: false });
  assert.deepEqual(d.aLaBase[0], { resultado: "RECHAZADO", ordenIdExterno: ORDEN_RETO, pagoIdExterno: "PAY01M4P8RETO", monto: "138.00", tipoTarjeta: "credit_card", marca: "master", detalle: "3ds_challenge_failed" });
  assert.ok(sin(d.llamadas, "mp.cancelarOrden"));
  sinRastroDelReto(d);

  const reintento = doble({ toma: false, filas: [FILA_EN_RETO, FILA_EN_RETO, { ...FILA_EN_RETO, estado: "RECHAZADO", detalle: "3ds_challenge_failed" }],
                            mp: { leerOrden: { status: 200, cuerpo: RETO_FALLIDO } }, aplicar: () => ({ estado: "RECHAZADO", pedido_estado: "EXPIRADO", recien_aprobado: false }) });
  assert.deepEqual(await cobrarPago(reintento.deps, DATOS), { tipo: "RECHAZADO", motivo: "VERIFICACION" });
  assert.ok(reintento.llamadas.includes("descartar") && sin(reintento.llamadas, "mp.crearOrden"));
});

test("el cliente deja el reto: se intenta cancelar UNA vez; el 422 (lo normal) no es un fallo ni se registra, y el pago se abandona CON la orden que se vio", async () => {
  const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: EN_RETO }, cancelarOrden: NO_SE_CANCELA } });
  const vistas: string[] = [];
  const c = await confirmarPago(d.deps, PAGO, undefined, false, { cancelar: true, alReto: (u) => vistas.push(u) });
  assert.deepEqual(c, { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.equal(d.llamadas.filter((l) => l.startsWith("mp.cancelarOrden")).length, 1);
  assert.deepEqual(d.llamadas.filter((l) => l.startsWith("abandonar")), [`abandonar ${ORDEN_RETO}`]);
  assert.ok(sin(d.llamadas, "aplicar") && sin(d.llamadas, "registrar") && sin(d.llamadas, "anotar") && sin(d.llamadas, "conciliacion"));
  assert.deepEqual(vistas, [], "a quien deja el reto no se le devuelve su dirección");
  sinRastroDelReto(d, c);
  // Lo mismo si Mercado Pago ni contesta a la cancelación: la orden se vio y sigue en el reto.
  const sinRed = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: EN_RETO }, cancelarOrden: { status: 0, cuerpo: null } } });
  assert.deepEqual(await confirmarPago(sinRed.deps, PAGO, undefined, false, { cancelar: true }), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.ok(sin(sinRed.llamadas, "registrar") && sinRed.llamadas.includes(`abandonar ${ORDEN_RETO}`));
});

test("«Cancelar» cuando la orden YA SALIÓ del reto y se está cobrando (processing, in_review): NO se abandona; ni tampoco a ciegas si Mercado Pago no contesta", async () => {
  // El cliente contestó el reto y toca «Cancelar» mientras Mercado Pago cobra: abandonar aquí acabaría en cobro y devolución.
  for (const cobrandose of [{ ...EN_REVISION, id: ORDEN_RETO }, { ...EN_ANTIFRAUDE, id: ORDEN_RETO }]) {
    const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: cobrandose } } });
    assert.deepEqual(await confirmarPago(d.deps, PAGO, undefined, false, { cancelar: true }), { ok: false, motivo: "PAGO_SIN_APLICAR" });
    assert.ok(sin(d.llamadas, "abandonar") && sin(d.llamadas, "mp.cancelarOrden") && sin(d.llamadas, "aplicar"), d.llamadas.join("\n"));
  }
  const sinRespuesta = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 0, cuerpo: null } } });
  assert.deepEqual(await confirmarPago(sinRespuesta.deps, PAGO, undefined, false, { cancelar: true }), { ok: false, motivo: "MP_NO_RESPONDE" });
  assert.ok(sin(sinRespuesta.llamadas, "abandonar") && sin(sinRespuesta.llamadas, "mp.cancelarOrden"));
  // Y sin que el cliente lo pida, una consulta nunca abandona un pago que espera.
  const consulta = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  await confirmarPago(consulta.deps, PAGO);
  assert.ok(sin(consulta.llamadas, "abandonar"));
});

test("«Cancelar» sin que nadie hubiera anotado la verificación (la respuesta del cobro se perdió): si la orden está en el reto se abandona igual, con esa orden", async () => {
  const d = doble({ filas: [{ ...FILA, cobro_mandado: true }], mp: { buscarOrdenes: { status: 200, cuerpo: { data: [EN_RETO] } }, cancelarOrden: NO_SE_CANCELA } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, undefined, false, { cancelar: true }), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.ok(d.llamadas.includes(`abandonar ${ORDEN_RETO}`), d.llamadas.join("\n"));
  sinRastroDelReto(d);
});

test("el cliente deja el reto y Mercado Pago SÍ deja cancelar (por si en producción funciona): se vuelve a leer y se aplica el rechazo", async () => {
  const d = doble({ filas: [FILA_EN_RETO], aplicar: () => ({ estado: "RECHAZADO", pedido_estado: "EXPIRADO", recien_aprobado: false }),
                    mp: { leerOrden: [{ status: 200, cuerpo: EN_RETO }, { status: 200, cuerpo: RETO_CANCELADO }], cancelarOrden: { status: 200, cuerpo: RETO_CANCELADO } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, undefined, false, { cancelar: true }), { ok: true, aplicados: 1, recienAprobado: false, enVerificacion: false });
  assert.ok(d.llamadas.includes(`aplicar RECHAZADO ${ORDEN_RETO} 138.00`));
  assert.equal((d.aLaBase[0] as { detalle: string }).detalle, "canceled");
});

test("el cliente toca «Cancelar» cuando ya había contestado el reto: la orden está cobrada y se le da su pedido, no se cierra", async () => {
  const d = doble({ filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: RETO_APROBADO } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, undefined, false, { cancelar: true }), { ok: true, aplicados: 1, recienAprobado: true, enVerificacion: false });
  assert.ok(d.llamadas.includes(`aplicar APROBADO ${ORDEN_RETO} 138.00`) && sin(d.llamadas, "mp.cancelarOrden"));
});

test("reto abandonado y vigilado: mientras Mercado Pago lo tenga pendiente NO es un fallo, ni «posible cobro sin pedido»; cancelar se intenta solo en la primera consulta", async () => {
  // VERIFICADO: una orden abandonada seguía pending_challenge, con su dirección, a los 45 minutos.
  const primera = doble({ filas: [FILA_ABANDONADA], mp: { leerOrden: { status: 200, cuerpo: EN_RETO }, cancelarOrden: NO_SE_CANCELA } });
  const vistas: string[] = [];
  const c = await confirmarPago(primera.deps, PAGO, undefined, false, { alReto: (u) => vistas.push(u) });
  assert.deepEqual(c, { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.equal(primera.llamadas.filter((l) => l.startsWith("mp.cancelarOrden")).length, 1);
  assert.ok(sin(primera.llamadas, "aplicar") && sin(primera.llamadas, "registrar") && sin(primera.llamadas, "anotar") && sin(primera.llamadas, "verificar"));
  assert.deepEqual(vistas, [], "de un reto que ya se dejó no se vuelve a entregar la dirección");
  sinRastroDelReto(primera, c);
  // De la segunda consulta en adelante ya no se intenta cancelar: solo se mira.
  const despues = doble({ filas: [{ ...FILA_ABANDONADA, conciliaciones: 1 }], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  assert.deepEqual(await confirmarPago(despues.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.ok(sin(despues.llamadas, "mp.cancelarOrden") && sin(despues.llamadas, "registrar"));
});

test("reto abandonado que el cliente contesta TARDE: aparece cobrado y se aplica (la base lo manda a devolver: el pedido ya estaba cerrado)", async () => {
  const d = doble({ filas: [{ ...FILA_ABANDONADA, conciliaciones: 3 }], mp: { leerOrden: { status: 200, cuerpo: RETO_APROBADO } },
                    aplicar: () => ({ estado: "POR_DEVOLVER", pedido_estado: "EXPIRADO", recien_aprobado: false }) });
  // Llega igual por el aviso de Mercado Pago que por el barrido: es el mismo camino.
  assert.deepEqual(await confirmarPago(d.deps, PAGO, ORDEN_RETO), { ok: true, aplicados: 1, recienAprobado: false, enVerificacion: false });
  assert.ok(d.llamadas.includes(`aplicar APROBADO ${ORDEN_RETO} 138.00`) && sin(d.llamadas, "mp.cancelarOrden"));
  sinRastroDelReto(d);
});

test("reto abandonado cuya orden acaba fallida, cancelada o vencida: se aplica el rechazo (la base lo da por conciliado)", async () => {
  for (const [final, detalle] of [[RETO_FALLIDO, "3ds_challenge_failed"], [RETO_CANCELADO, "canceled"], [{ ...RETO_CANCELADO, status: "expired" }, "expired"]] as const) {
    const d = doble({ filas: [{ ...FILA_ABANDONADA, conciliaciones: 2 }], mp: { leerOrden: { status: 200, cuerpo: final } }, aplicar: CERRADO });
    assert.deepEqual(await confirmarPago(d.deps, PAGO), { ok: true, aplicados: 1, recienAprobado: false, enVerificacion: false });
    assert.equal((d.aLaBase[0] as { resultado: string; detalle: string }).resultado, "RECHAZADO");
    assert.equal((d.aLaBase[0] as { detalle: string }).detalle, detalle);
  }
});

test("un pago VENCIDO cuya orden resulta estar esperando un reto pasa a vigilarse como abandonado, en vez de darse por conciliado a la hora", async () => {
  const d = doble({ filas: [{ ...FILA, estado: "VENCIDO", cobro_mandado: true }], mp: { buscarOrdenes: { status: 200, cuerpo: { data: [EN_RETO] } } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false, enVerificacion: true });
  assert.ok(d.llamadas.includes(`abandonar ${ORDEN_RETO}`) && sin(d.llamadas, "anotar") && sin(d.llamadas, "registrar"));
});

test("un reintento con el reto vivo NO crea otra orden ni otro cobro: consulta la misma y devuelve su dirección para continuar", async () => {
  const d = doble({ toma: false, filas: [FILA_EN_RETO], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "VERIFICACION", url: URL_RETO });
  assert.ok(sin(d.llamadas, "mp.crearOrden") && sin(d.llamadas, "mp.cancelarOrden") && sin(d.llamadas, "descartar"));
  assert.ok(d.llamadas.includes(`mp.leerOrden ${ORDEN_RETO}`));
  sinRastroDelReto(d);
  // Y si mientras tanto se aprobó, el reintento lo dice.
  const ya = doble({ toma: false, filas: [FILA_EN_RETO, FILA_EN_RETO, { ...FILA_EN_RETO, estado: "APROBADO" }], mp: { leerOrden: { status: 200, cuerpo: RETO_APROBADO } } });
  assert.deepEqual(await cobrarPago(ya.deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
});

test("un reintento del intento cuyo reto ya se dejó: SIN_VERIFICAR, sin cobrar, sin consultar y SIN descartar (ese renglón vigila la orden)", async () => {
  const d = doble({ filas: [FILA_ABANDONADA] });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" });
  assert.deepEqual(d.llamadas, []);
  // Y si se deja justo mientras este reintento preguntaba.
  const carrera = doble({ toma: false, filas: [FILA_EN_RETO, FILA_EN_RETO, FILA_ABANDONADA], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  assert.deepEqual(await cobrarPago(carrera.deps, DATOS), { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" });
  assert.ok(sin(carrera.llamadas, "descartar") && sin(carrera.llamadas, "mp.crearOrden"));
});

test("un 422 que dejó la orden esperando el reto no descarta el pedido: hay una orden viva", async () => {
  const d = doble({ filas: [FILA, { ...FILA, cobro_mandado: true }], mp: { crearOrden: { status: 422, cuerpo: { errors: [{ code: "unprocessable_content" }] } }, buscarOrdenes: { status: 200, cuerpo: { data: [EN_RETO] } } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(sin(d.llamadas, "descartar") && sin(d.llamadas, "mp.cancelarOrden"));
});

test("barrer: un reto pendiente (vivo o abandonado) cuenta como consulta buena: no suma fallos ni avisa a VIM", async () => {
  for (const fila of [FILA_EN_RETO, FILA_ABANDONADA, { ...FILA_ABANDONADA, conciliaciones: 20 }]) {
    const avisos: string[] = [];
    const d = doble({ tareas: [{ id: PAGO, tarea: "CONCILIAR", conexion_id: "cx-1", orden_id_externo: ORDEN_RETO }], filas: [fila],
                      mp: { leerOrden: { status: 200, cuerpo: EN_RETO }, cancelarOrden: NO_SE_CANCELA }, tercerFallo: () => true });
    assert.deepEqual(await barrer(d.deps, async (t, de) => { avisos.push(`${de} ${t.id}`); }), { devueltos: 0, fallidos: 0, conciliados: 1, sinConsultar: 0 });
    assert.ok(d.llamadas.includes(`conciliacion ${PAGO} true`) && sin(d.llamadas, "aplicar"));
    assert.deepEqual(avisos, []);
    sinRastroDelReto(d);
  }
});

test("barrer, RETO_VIEJO (48 horas): un último vistazo; si la orden sigue pendiente o no se pudo mirar, UN aviso a VIM con su id; si ya se cerró o se cobró, se aplica y no se avisa", async () => {
  const tarea: Tarea = { id: PAGO, tarea: "RETO_VIEJO", conexion_id: "cx-1", orden_id_externo: ORDEN_RETO };
  const correr = async (mp: Parameters<typeof doble>[0]["mp"], aplicar = CERRADO) => {
    const avisos: string[] = [];
    const d = doble({ tareas: [tarea], filas: [{ ...FILA_ABANDONADA, conciliaciones: 50 }], mp, aplicar });
    await barrer(d.deps, async (t, de) => { avisos.push(`${de} ${t.orden_id_externo}`); });
    return { avisos, d };
  };
  const pendiente = await correr({ leerOrden: { status: 200, cuerpo: EN_RETO } });
  assert.deepEqual(pendiente.avisos, [`RETO ${ORDEN_RETO}`]);
  // No suma fallos de conciliación (no es «posible cobro sin pedido»): solo se cierra, como consulta buena.
  assert.ok(sin(pendiente.d.llamadas, `conciliacion ${PAGO} false`) && sin(pendiente.d.llamadas, "mp.cancelarOrden"));
  assert.deepEqual((await correr({ leerOrden: { status: 0, cuerpo: null } })).avisos, [`RETO ${ORDEN_RETO}`]);
  assert.deepEqual((await correr({ leerOrden: { status: 200, cuerpo: RETO_CANCELADO } })).avisos, []);
  const cobrada = await correr({ leerOrden: { status: 200, cuerpo: RETO_APROBADO } }, () => ({ estado: "POR_DEVOLVER", pedido_estado: "EXPIRADO", recien_aprobado: false }));
  assert.deepEqual(cobrada.avisos, []);
  assert.ok(cobrada.d.llamadas.includes(`aplicar APROBADO ${ORDEN_RETO} 138.00`));
});

test("barrer, RETO_VIEJO: si el último vistazo REVIENTA se avisa igual; y solo después de avisar se da por cerrado (si el aviso falla, no se cierra: vuelve a salir)", async () => {
  const tarea: Tarea = { id: PAGO, tarea: "RETO_VIEJO", conexion_id: "cx-1", orden_id_externo: ORDEN_RETO };
  // La consulta lanza (la base se cayó al leer el pago).
  const roto = doble({ tareas: [tarea] });
  roto.deps.db.leerPago = async () => { throw new Error("la base no responde"); };
  const avisos: string[] = [];
  await barrer(roto.deps, async (t, de) => { avisos.push(`${de} ${t.orden_id_externo}`); roto.llamadas.push("avisar"); });
  assert.deepEqual(avisos, [`RETO ${ORDEN_RETO}`]);
  assert.ok(roto.llamadas.indexOf("avisar") < roto.llamadas.indexOf(`conciliacion ${PAGO} true`) && roto.llamadas.indexOf("avisar") !== -1, roto.llamadas.join("\n"));
  // El aviso no sale (el correo falla): NO se cierra; la base lo vuelve a sacar a la hora.
  const sinCorreo = doble({ tareas: [tarea], filas: [{ ...FILA_ABANDONADA, conciliaciones: 50 }], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  await barrer(sinCorreo.deps, async () => { throw new Error("SMTP"); });
  assert.ok(sin(sinCorreo.llamadas, "conciliacion"));
  // Lo normal: avisado, y cerrado.
  const bien = doble({ tareas: [tarea], filas: [{ ...FILA_ABANDONADA, conciliaciones: 50 }], mp: { leerOrden: { status: 200, cuerpo: EN_RETO } } });
  await barrer(bien.deps, async () => {});
  assert.ok(bien.llamadas.includes(`conciliacion ${PAGO} true`));
});

test("el correo del reto sin cerrar dice que NO hay cobro y lleva la orden; sin datos del cliente", () => {
  const c = avisoDeRetoSinCerrar({ pagoId: PAGO, negocio: "Knock-Out <Burger>", folio: "T1A2B3", monto: "138.00", ordenIdExterno: ORDEN_RETO });
  assert.ok(c.html.includes(ORDEN_RETO) && c.html.includes(PAGO) && c.html.includes("No se ha cobrado nada") && c.html.includes("Knock-Out &lt;Burger&gt;"));
  assert.ok(!c.html.includes("Posible cobro") && !/[^\x00-\x7F]/.test(c.subject));
  for (const dato of DEL_RETO) assert.equal(c.html.includes(dato), false);
});

// ── Modo de prueba (0178) ───────────────────────────────────────────────────────────────────────
const PAGADOR = "test_user_3753760462@testuser.com";
const pagadorDe = (cuerpo: unknown): unknown => (cuerpo as { payer: { email: unknown } }).payer.email;

test("pago de prueba: a Mercado Pago se le manda el usuario de prueba como pagador; todo lo demás es el cobro de siempre", async () => {
  const { deps, llamadas, tokens, cuerpos } = doble({ filas: [{ ...FILA, de_prueba: true }], pagadorDePrueba: PAGADOR, mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
  assert.equal(pagadorDe(cuerpos[0]), PAGADOR);
  // El correo del cliente no viaja a Mercado Pago en ese cobro (sigue siendo el de nuestros correos, que no salen de aquí).
  assert.equal(JSON.stringify(cuerpos[0]).includes(DATOS.email), false);
  // Mismo monto de la base, misma referencia, misma llave, mismo token de SU conexión, y se aplica igual.
  const { payer: _p, ...resto } = cuerpos[0] as Record<string, unknown>;
  const real = doble({ mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  await cobrarPago(real.deps, DATOS);
  const { payer: _q, ...restoReal } = real.cuerpos[0] as Record<string, unknown>;
  assert.deepEqual(resto, restoReal);
  assert.deepEqual(llamadas, real.llamadas);
  assert.deepEqual(tokens, ["TOKEN"]);
});

test("un pago REAL nunca lleva el usuario de prueba, aunque esté configurado", async () => {
  const { deps, cuerpos } = doble({ pagadorDePrueba: PAGADOR, mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  await cobrarPago(deps, DATOS);
  assert.equal(pagadorDe(cuerpos[0]), DATOS.email);
  assert.equal(JSON.stringify(cuerpos[0]).includes("testuser"), false);
});

test("pago de prueba sin usuario de prueba configurado: sale con el correo que escribió quien prueba", async () => {
  for (const pagadorDePrueba of [undefined, null, ""]) {
    const { deps, cuerpos } = doble({ filas: [{ ...FILA, de_prueba: true }], pagadorDePrueba, mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
    await cobrarPago(deps, DATOS);
    assert.equal(pagadorDe(cuerpos[0]), DATOS.email, String(pagadorDePrueba));
  }
});

test("pago de prueba: la orden se cree con las mismas comprobaciones (referencia, cuenta vendedora de SU conexión, moneda)", async () => {
  // La cuenta de prueba cobra con su conexión: una orden de OTRA cuenta (la real del negocio) no la paga.
  const ajena = doble({ filas: [{ ...FILA, de_prueba: true, cuenta_vendedora: "3754297554" }], pagadorDePrueba: PAGADOR,
                        mp: { crearOrden: { status: 201, cuerpo: { ...APROBADA, user_id: "111222333" } } } });
  assert.deepEqual(await cobrarPago(ajena.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(sin(ajena.llamadas, "aplicar"));
  // Y al revés: un pago real no se da por pagado con una orden de la cuenta de prueba.
  const cruzada = doble({ filas: [{ ...FILA, cuenta_vendedora: "111222333" }], mp: { crearOrden: { status: 201, cuerpo: APROBADA } } });
  assert.deepEqual(await cobrarPago(cruzada.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(sin(cruzada.llamadas, "aplicar"));
});

test("un aviso (de la clave que sea) sobre un pago se resuelve con el token de la conexión de ESE pago y su cuenta vendedora", async () => {
  // El aviso solo trae una pista: la orden. Quién la firmó no entra aquí. Lo que decide es la orden
  // leída con el token de la conexión del pago, y que traiga su cuenta vendedora.
  const dePrueba = doble({ filas: [{ ...FILA, conexion_id: "cx-prueba", de_prueba: true }], mp: { leerOrden: { status: 200, cuerpo: APROBADA } } });
  let pedida = "";
  dePrueba.deps.db.token = async (conexion) => { pedida = conexion; return "TOKEN-DE-PRUEBA"; };
  assert.equal((await confirmarPago(dePrueba.deps, PAGO, ORDEN)).ok, true);
  assert.equal(pedida, "cx-prueba");
  assert.deepEqual(dePrueba.tokens, ["TOKEN-DE-PRUEBA"]);
  // Una orden que no es de la cuenta de esa conexión no mueve el pago, la anuncie quien la anuncie.
  const cruzado = doble({ filas: [{ ...FILA, conexion_id: "cx-real", cuenta_vendedora: "111222333" }], mp: { leerOrden: { status: 200, cuerpo: APROBADA } } });
  await confirmarPago(cruzado.deps, PAGO, ORDEN);
  assert.ok(sin(cruzado.llamadas, "aplicar"));
});

test("pago de prueba: si Mercado Pago no acepta la orden y repite el correo del pagador de prueba, tampoco llega al rastro", async () => {
  // El 400 nombra la propiedad y a veces repite su VALOR. El valor que se mandó aquí es el del usuario de prueba, no el del cliente.
  const eco = { errors: [{ code: "property_value", message: "Invalid value for property", details: [`'$.payer.email' - ${PAGADOR} is not a valid user; ${DATOS.email}`] }] };
  const { deps, llamadas, aLaBase } = doble({ filas: [{ ...FILA, de_prueba: true }], pagadorDePrueba: PAGADOR,
                                              mp: { crearOrden: { status: 400, cuerpo: eco }, buscarOrdenes: { status: 200, cuerpo: { data: [] } } } });
  assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "NO_PROCESADO", contarIp: false });
  const escrito = JSON.stringify([llamadas, aLaBase]);
  assert.equal(escrito.includes(PAGADOR), false);
  assert.equal(escrito.includes("test_user_3753760462"), false);
  assert.equal(escrito.includes(DATOS.email), false);
  // Lo que sirve para arreglarlo sí queda: qué propiedad fue.
  assert.ok(llamadas.some((l) => l.startsWith("registrar COBRO_NO_ACEPTADO") && l.includes("payer.email")));
});
