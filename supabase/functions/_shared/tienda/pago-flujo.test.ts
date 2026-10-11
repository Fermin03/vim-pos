// Las respuestas de Mercado Pago son las REALES del 11 oct 2026
// (docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeConciliacionFallida, avisoDeDevolucionFallida, barrer, cobrarPago, confirmarPago, type Deps, devolverPago, type FilaPago, type PuertoPagos, respuestaDeConfirmacion, type Tarea, topesDelAviso } from "./pago-flujo.ts";
import type { ClienteMpTienda, RespuestaMp } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const ORDEN = "ORDTST01M4P8JX8C82XV8G7EB2A16YAC";
const FILA: FilaPago = {
  id: PAGO, conexion_id: "cx-1", estado: "CREADO", monto: "138.00", cobro_mandado: false,
  orden_id_externo: null, detalle: null, creado: "2026-10-11T18:00:00.000Z", de_prueba: false,
};
const APROBADA = {
  id: ORDEN, status: "processed", status_detail: "accredited", total_amount: "138.00", total_paid_amount: "138.00",
  external_reference: PAGO, capture_mode: "automatic_async",
  transactions: { payments: [{ id: "PAY01M4P8JX8TKPS5B2ECXP875P89", status: "processed", status_detail: "accredited", payment_method: { id: "master", type: "credit_card" } }] },
};
const EN_REVISION = { ...APROBADA, id: "ORDTSTREVISION", status: "processing", status_detail: "in_process", total_paid_amount: "0.00" };
const RECHAZO_402 = { errors: [{ code: "failed", message: "The following transactions failed", details: ["PAY01M4P8KB8MM494BGX78592RQMQ: insufficient_amount"] }] };
const DATOS = { pagoId: PAGO, email: "ana@example.com", tarjeta: { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", type: "credit_card" as const } };

type Metodo = keyof ClienteMpTienda;
/** La base y Mercado Pago de mentira: se anota cada llamada y se contesta lo que diga cada prueba. */
function doble(o: {
  /** Lo que la base devuelve en cada lectura del pago, en orden; la última se repite. */
  filas?: (FilaPago | null)[]; token?: string | null; toma?: boolean; tareas?: Tarea[]; descarta?: boolean;
  /** Lo que contesta Mercado Pago: una respuesta por método, o una lista (una por llamada; la última se repite). */
  mp?: Partial<Record<Metodo, RespuestaMp | RespuestaMp[]>>; devolucion?: (ok: boolean) => string;
  aplicar?: (ordenIdExterno: string) => { estado: string; pedido_estado: string; recien_aprobado: boolean };
  tercerFallo?: (id: string) => boolean;
} = {}) {
  const llamadas: string[] = [];
  const tokens: string[] = [];
  const cuerpos: unknown[] = [];
  const veces: Partial<Record<Metodo, number>> = {};
  let lecturas = 0, llaves = 0;
  const filas = o.filas ?? [FILA];
  const db: PuertoPagos = {
    leerPago: async () => filas[Math.min(lecturas++, filas.length - 1)]!,
    token: async () => (o.token === undefined ? "TOKEN" : o.token),
    tomarCobro: async () => { llamadas.push("tomarCobro"); return o.toma ?? true; },
    descartar: async () => { llamadas.push("descartar"); return o.descarta ?? true; },
    aplicar: async (_id, d) => {
      llamadas.push(`aplicar ${d.resultado} ${d.ordenIdExterno} ${d.monto}`);
      return o.aplicar?.(d.ordenIdExterno) ?? { estado: "APROBADO", pedido_estado: "RECIBIDO", recien_aprobado: d.resultado === "APROBADO" };
    },
    anotar: async (_id, d) => { llamadas.push(`anotar ${d.ordenIdExterno ?? "-"} ${d.error ?? "-"}`); },
    tomar: async () => o.tareas ?? [],
    devolucion: async (id, ok, error) => { llamadas.push(`devolucion ${id} ${ok}${error ? ` ${error}` : ""}`); return o.devolucion?.(ok) ?? (ok ? "DEVUELTO" : "POR_DEVOLVER"); },
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
        crearOrden: (c, llave) => { cuerpos.push(c); return responder("crearOrden", c, llave); },
        leerOrden: (id) => responder("leerOrden", id),
        buscarOrdenes: (id, desde, hasta) => responder("buscarOrdenes", id, desde, hasta),
        devolver: (id, llave) => responder("devolver", id, llave),
      };
    },
    registrar: (codigo, detalle) => { llamadas.push(`registrar ${codigo} ${detalle}`); },
    llave: () => `llave-${++llaves}`,
    ahora: () => new Date("2026-10-11T18:03:00.000Z"),
  };
  return { deps, llamadas, tokens, cuerpos };
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

test("400 o 422 de validación (no se creó nada): el pedido se descarta y la tienda dice OTRO", async () => {
  for (const status of [400, 422]) {
    const { deps } = doble({ mp: { crearOrden: { status, cuerpo: { errors: [{ code: "invalid_card_token" }] } } } });
    assert.deepEqual(await cobrarPago(deps, DATOS), { tipo: "RECHAZADO", motivo: "OTRO" });
  }
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
  assert.deepEqual(await confirmarPago(anotada.deps, PAGO, "ORDDEOTRO"), { ok: true, aplicados: 1, recienAprobado: true });
  assert.ok(anotada.llamadas.includes(`mp.leerOrden ${ORDEN}`));
  const pista = doble({ mp: { leerOrden: { status: 200, cuerpo: APROBADA } } });
  assert.deepEqual(await confirmarPago(pista.deps, PAGO, ORDEN), { ok: true, aplicados: 1, recienAprobado: true });
  const busca = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [] } } } });
  assert.deepEqual(await confirmarPago(busca.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false });
});

test("confirmar: la pista de un aviso con una orden de OTRO pago no mueve nada", async () => {
  const { deps, llamadas } = doble({ mp: { leerOrden: { status: 200, cuerpo: { ...APROBADA, external_reference: "otro-pago" } } } });
  assert.deepEqual(await confirmarPago(deps, PAGO, "ORDAJENA"), { ok: true, aplicados: 0, recienAprobado: false });
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
  assert.equal(respuestaDeConfirmacion({ ok: true, aplicados: 0, recienAprobado: false }), 200);
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
  // Una orden de prueba en una cuenta real: viva, nuestra y sin aplicar.
  const modo = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [{ ...APROBADA, live_mode: false }] } } } });
  assert.deepEqual(await confirmarPago(modo.deps, PAGO), { ok: false, motivo: "PAGO_SIN_APLICAR" });
  // Si además hay una aprobada que sí se aplica, el pedido tiene su pago: cuenta como buena.
  const conBuena = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [sinAcreditar, { ...APROBADA, id: "ORDBUENA" }] } } } });
  assert.deepEqual(await confirmarPago(conBuena.deps, PAGO), { ok: true, aplicados: 1, recienAprobado: true });
});

test("confirmar: con varias órdenes, la aprobada se aplica antes que la rechazada", async () => {
  const fallida = { ...APROBADA, id: "ORDFALLIDA", status: "failed", status_detail: "failed", total_paid_amount: undefined };
  const { deps, llamadas } = doble({ mp: { buscarOrdenes: { status: 200, cuerpo: { data: [fallida, APROBADA] } } } });
  assert.deepEqual(await confirmarPago(deps, PAGO), { ok: true, aplicados: 2, recienAprobado: true });
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
