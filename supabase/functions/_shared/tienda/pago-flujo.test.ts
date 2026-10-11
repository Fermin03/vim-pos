import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeConciliacionFallida, avisoDeDevolucionFallida, topesDelAviso, barrer, cobrarPago, confirmarPago, type Deps, devolverPago, type FilaPago, type PuertoPagos, respuestaDeConfirmacion, type Tarea } from "./pago-flujo.ts";
import type { ClienteMpTienda, RespuestaMp } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const FILA: FilaPago = {
  id: PAGO, conexion_id: "cx-1", estado: "CREADO", monto: "264.00", cuenta_vendedora: "202809963", de_prueba: false,
};
const APROBADO = {
  id: 18552260055, status: "approved", status_detail: "accredited", currency_id: "MXN", live_mode: true,
  collector_id: 202809963, external_reference: PAGO, transaction_amount: 264, payment_type_id: "credit_card", payment_method_id: "master",
};
const DATOS = {
  pagoId: PAGO, folio: "T1A2B3", negocio: "Knock-Out",
  aviso: `https://x.supabase.co/functions/v1/tienda-webhook-mp?ref=${PAGO}`, email: "ana@example.com",
  tarjeta: { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", issuer_id: null, dispositivo: null },
};

/** La base y Mercado Pago de mentira: se anota cada llamada y se contesta lo que diga cada prueba. */
function doble(o: {
  fila?: FilaPago | null; token?: string | null; toma?: boolean; tareas?: Tarea[]; descarta?: boolean;
  /** Lo que la base devuelve en las lecturas siguientes a la primera (después de confirmar). */
  filaDespues?: FilaPago | null;
  mp?: Partial<Record<keyof ClienteMpTienda, RespuestaMp>>; devolucion?: (ok: boolean) => string;
  aplicar?: (pagoIdExterno: string) => { estado: string; pedido_estado: string; recien_aprobado: boolean };
  /** Lo que contesta la base a una consulta fallida: ¿es el tercer fallo? */
  tercerFallo?: (id: string) => boolean;
} = {}) {
  const llamadas: string[] = [];
  const tokens: string[] = [];
  let lecturas = 0;
  const db: PuertoPagos = {
    leerPago: async () => (lecturas++ > 0 && o.filaDespues !== undefined ? o.filaDespues : o.fila === undefined ? FILA : o.fila),
    token: async () => (o.token === undefined ? "TOKEN" : o.token),
    conexionEnError: async (id) => { llamadas.push(`conexionEnError ${id}`); },
    tomarCobro: async () => { llamadas.push("tomarCobro"); return o.toma ?? true; },
    descartar: async () => { llamadas.push("descartar"); return o.descarta ?? true; },
    aplicar: async (_id, d) => {
      llamadas.push(`aplicar ${d.resultado} ${d.pagoIdExterno} ${d.monto}`);
      return o.aplicar?.(d.pagoIdExterno) ?? { estado: "APROBADO", pedido_estado: "RECIBIDO", recien_aprobado: d.resultado === "APROBADO" };
    },
    tomar: async () => o.tareas ?? [],
    devolucion: async (id, ok, error) => { llamadas.push(`devolucion ${id} ${ok}${error ? ` ${error}` : ""}`); return o.devolucion?.(ok) ?? (ok ? "DEVUELTO" : "POR_DEVOLVER"); },
    conciliacion: async (id, ok) => { llamadas.push(`conciliacion ${id} ${ok}`); return !ok && (o.tercerFallo?.(id) ?? false); },
  };
  const responder = (cual: keyof ClienteMpTienda, ...args: unknown[]): Promise<RespuestaMp> => {
    llamadas.push(`mp.${cual} ${args.map((a) => (typeof a === "string" ? a : "{…}")).join(" ")}`.trim());
    return Promise.resolve(o.mp?.[cual] ?? { status: 500, cuerpo: null });
  };
  const deps: Deps = {
    db,
    mp: (token) => {
      tokens.push(token);
      return {
        cobrar: (c, llave) => responder("cobrar", c, llave), leerPago: (id) => responder("leerPago", id),
        buscarPagos: (id) => responder("buscarPagos", id), devolver: (id, llave) => responder("devolver", id, llave),
      };
    },
    registrar: (codigo) => { llamadas.push(`registrar ${codigo}`); },
  };
  return { deps, llamadas, tokens };
}
const LLAVE = `tienda-pago-${PAGO}`;
const RECHAZADO = { ...APROBADO, status: "rejected", status_detail: "cc_rejected_insufficient_amount" };

// ── cobrarPago ───────────────────────────────────────────────────────────────────────────────────

test("cobrar: aprobado y nuestro → se aplica con lo que cobró Mercado Pago y el pedido queda recibido", async () => {
  const d = doble({ mp: { cobrar: { status: 201, cuerpo: APROBADO } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
  assert.deepEqual(d.llamadas, ["tomarCobro", `mp.cobrar {…} ${LLAVE}`, "aplicar APROBADO 18552260055 264.00"]);
  assert.deepEqual(d.tokens, ["TOKEN"]);
});

test("cobrar: rechazado → el pedido se descarta y se dice la familia del motivo", async () => {
  const casos: [string, string][] = [["cc_rejected_insufficient_amount", "FONDOS"], ["cc_rejected_bad_filled_security_code", "CODIGO"], ["cc_rejected_high_risk", "OTRO"]];
  for (const [detalle, motivo] of casos) {
    const d = doble({ mp: { cobrar: { status: 201, cuerpo: { ...RECHAZADO, status_detail: detalle } } } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "RECHAZADO", motivo }, detalle);
    assert.deepEqual(d.llamadas, ["tomarCobro", `mp.cobrar {…} ${LLAVE}`, "descartar"]);
  }
});

test("cobrar: sin respuesta, 5xx, 409 o 429 NUNCA es «rechazado»: queda por confirmar y el pedido NO se descarta", async () => {
  for (const status of [0, 500, 502, 503, 409, 429]) {
    const d = doble({ mp: { cobrar: { status, cuerpo: null } } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" }, String(status));
    assert.ok(!d.llamadas.includes("descartar"), String(status));
    assert.ok(!d.llamadas.some((l) => l.startsWith("aplicar")), String(status));
  }
});

test("cobrar: un estado que no es final (pendiente, en proceso) o un pago que no es nuestro tampoco es rechazo", async () => {
  for (const cuerpo of [{ ...APROBADO, status: "in_process", status_detail: "pending_contingency" }, { ...APROBADO, status: "pending", status_detail: "pending_challenge" },
                        { ...APROBADO, external_reference: "otra" }, { ...APROBADO, collector_id: 999 }, { ...APROBADO, status_detail: "otra_cosa" }, { ...APROBADO, live_mode: false }, null]) {
    const d = doble({ mp: { cobrar: { status: 201, cuerpo } } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" }, JSON.stringify(cuerpo));
    assert.ok(!d.llamadas.includes("descartar") && !d.llamadas.some((l) => l.startsWith("aplicar")), JSON.stringify(cuerpo));
  }
});

test("cobrar: Mercado Pago no aceptó el cobro (4xx de validación: token usado, datos que no cuadran) → descartado, motivo OTRO", async () => {
  for (const status of [400, 402, 403, 404, 422]) {
    const d = doble({ mp: { cobrar: { status, cuerpo: { message: "Invalid card token", cause: [{ code: 2006 }] } } } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "RECHAZADO", motivo: "OTRO" }, String(status));
    assert.deepEqual(d.llamadas, ["tomarCobro", `mp.cobrar {…} ${LLAVE}`, "registrar COBRO", "descartar"]);
  }
});

test("cobrar: token del restaurante rechazado o ausente → conexión con error, pedido descartado, no disponible", async () => {
  const d = doble({ mp: { cobrar: { status: 401, cuerpo: null } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "NO_DISPONIBLE" });
  assert.deepEqual(d.llamadas, ["tomarCobro", `mp.cobrar {…} ${LLAVE}`, "conexionEnError cx-1", "registrar COBRO", "descartar"]);
  const sin = doble({ token: null });
  assert.deepEqual(await cobrarPago(sin.deps, DATOS), { tipo: "NO_DISPONIBLE" });
  assert.deepEqual(sin.llamadas, ["tomarCobro", "conexionEnError cx-1", "registrar SIN_TOKEN", "descartar"]);
});

test("cobrar: un renglón se cobra UNA vez. El reintento del mismo intento no cobra: pregunta qué pasó con el primero", async () => {
  // La respuesta del primer cobro se perdió; Mercado Pago sí cobró.
  const d = doble({ toma: false, filaDespues: { ...FILA, estado: "APROBADO" }, mp: { buscarPagos: { status: 200, cuerpo: { results: [APROBADO] } } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "APROBADO", recienAprobado: true });
  assert.ok(!d.llamadas.some((l) => l.startsWith("mp.cobrar")), "no se cobra otra vez");
  assert.deepEqual(d.llamadas, ["tomarCobro", `mp.buscarPagos ${PAGO}`, "aplicar APROBADO 18552260055 264.00"]);
  // Mercado Pago todavía no tiene nada con esa referencia, o no contesta: por confirmar, sin cobrar y sin descartar.
  for (const buscarPagos of [{ status: 200, cuerpo: { results: [] } }, { status: 500, cuerpo: null }]) {
    const e = doble({ toma: false, mp: { buscarPagos } });
    assert.deepEqual(await cobrarPago(e.deps, DATOS), { tipo: "POR_CONFIRMAR" });
    assert.ok(!e.llamadas.some((l) => l.startsWith("mp.cobrar")) && !e.llamadas.includes("descartar"));
  }
});

test("cobrar: un pago ya aprobado contesta aprobado sin tocar nada; uno que ya no espera, por confirmar", async () => {
  const ya = doble({ fila: { ...FILA, estado: "APROBADO" } });
  assert.deepEqual(await cobrarPago(ya.deps, DATOS), { tipo: "APROBADO", recienAprobado: false });
  assert.deepEqual(ya.llamadas, []);
  for (const estado of ["VENCIDO", "RECHAZADO", "POR_DEVOLVER", "DEVUELTO"] as const) {
    const d = doble({ fila: { ...FILA, estado } });
    assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" }, estado);
    assert.deepEqual(d.llamadas, [], estado);
  }
  assert.deepEqual(await cobrarPago(doble({ fila: null }).deps, DATOS), { tipo: "POR_CONFIRMAR" });
});

test("cobrar: aprobado por OTRO monto no se cree: la base lo deja por devolver y el pedido queda por confirmar", async () => {
  const d = doble({ mp: { cobrar: { status: 201, cuerpo: { ...APROBADO, transaction_amount: 1 } } }, aplicar: () => ({ estado: "CREADO", pedido_estado: "POR_PAGAR", recien_aprobado: false }) });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" });
  assert.ok(d.llamadas.includes("aplicar APROBADO 18552260055 1.00"));
});

test("cobrar: si el pedido ya no se puede descartar (algo lo movió), no se dice «rechazado»", async () => {
  const d = doble({ descarta: false, mp: { cobrar: { status: 201, cuerpo: RECHAZADO } } });
  assert.deepEqual(await cobrarPago(d.deps, DATOS), { tipo: "POR_CONFIRMAR" });
});

test("cobrar: el token de la tarjeta no llega a ningún log", async () => {
  for (const cobrar of [{ status: 400, cuerpo: { message: DATOS.tarjeta.token } }, { status: 500, cuerpo: null }, { status: 201, cuerpo: RECHAZADO }]) {
    const vistos: string[] = [];
    const d = doble({ mp: { cobrar } });
    await cobrarPago({ ...d.deps, registrar: (codigo, detalle) => { vistos.push(`${codigo} ${detalle}`); } }, DATOS);
    assert.ok(!vistos.join(" ").includes(DATOS.tarjeta.token), vistos.join(" | "));
  }
});

test("confirmar: si la búsqueda trae un rechazado y un aprobado, el aprobado se aplica primero", async () => {
  const d = doble({ mp: { buscarPagos: { status: 200, cuerpo: { results: [{ ...RECHAZADO, id: 7 }, APROBADO] } } } });
  await confirmarPago(d.deps, PAGO);
  assert.deepEqual(d.llamadas.filter((l) => l.startsWith("aplicar")), ["aplicar APROBADO 18552260055 264.00", "aplicar RECHAZADO 7 264.00"]);
});

test("confirmar: con la pista de un aviso consulta ESE pago con el token del restaurante y lo aplica", async () => {
  const d = doble({ mp: { leerPago: { status: 200, cuerpo: APROBADO } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, "18552260055"), { ok: true, aplicados: 1, recienAprobado: true });
  assert.deepEqual(d.llamadas, ["mp.leerPago 18552260055", "aplicar APROBADO 18552260055 264.00"]);
  assert.deepEqual(d.tokens, ["TOKEN"]);
});

test("confirmar: sin pista busca por nuestra referencia y aplica cada pago que encuentre", async () => {
  const rechazado = { ...APROBADO, id: 111, status: "rejected", status_detail: "cc_rejected_other_reason" };
  const d = doble({ mp: { buscarPagos: { status: 200, cuerpo: { results: [APROBADO, rechazado] } } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO), { ok: true, aplicados: 2, recienAprobado: true });
  assert.deepEqual(d.llamadas, [`mp.buscarPagos ${PAGO}`, "aplicar APROBADO 18552260055 264.00", "aplicar RECHAZADO 111 264.00"]);
});

test("confirmar: un pago por OTRO monto se le pasa a la base tal cual lo cobró Mercado Pago (ella lo devuelve)", async () => {
  const d = doble({ mp: { leerPago: { status: 200, cuerpo: { ...APROBADO, transaction_amount: 1 } } }, aplicar: () => ({ estado: "CREADO", pedido_estado: "POR_PAGAR", recien_aprobado: false }) });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, "18552260055"), { ok: true, aplicados: 1, recienAprobado: false });
  assert.deepEqual(d.llamadas, ["mp.leerPago 18552260055", "aplicar APROBADO 18552260055 1.00"]);
});

test("confirmar: lo que no es nuestro no toca la base, aunque diga «approved»", async () => {
  for (const ajeno of [{ ...APROBADO, external_reference: "otra" }, { ...APROBADO, collector_id: 5 }, { ...APROBADO, live_mode: false }]) {
    const d = doble({ mp: { leerPago: { status: 200, cuerpo: ajeno } } });
    assert.deepEqual(await confirmarPago(d.deps, PAGO, "18552260055"), { ok: true, aplicados: 0, recienAprobado: false });
    assert.deepEqual(d.llamadas, ["mp.leerPago 18552260055", "registrar AJENO"]);
  }
});

test("confirmar: pendiente no hace nada; un contracargo se deja en el log", async () => {
  const pend = doble({ mp: { buscarPagos: { status: 200, cuerpo: { results: [{ ...APROBADO, status: "in_process" }] } } } });
  assert.deepEqual(await confirmarPago(pend.deps, PAGO), { ok: true, aplicados: 0, recienAprobado: false });
  assert.deepEqual(pend.llamadas, [`mp.buscarPagos ${PAGO}`]);
  const cb = doble({ mp: { leerPago: { status: 200, cuerpo: { ...APROBADO, status: "charged_back" } } } });
  await confirmarPago(cb.deps, PAGO, "18552260055");
  assert.deepEqual(cb.llamadas, ["mp.leerPago 18552260055", "registrar INCIDENTE"]);
});

test("confirmar: una referencia que no es nuestra no llega a Mercado Pago", async () => {
  const d = doble({ fila: null });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, "1"), { ok: false, motivo: "PAGO_DESCONOCIDO" });
  assert.deepEqual(d.llamadas, []);
  assert.deepEqual(d.tokens, []);
});

test("confirmar: sin token, o si Mercado Pago no contesta, no se aplica nada y se puede reintentar", async () => {
  const sin = doble({ token: null });
  assert.deepEqual(await confirmarPago(sin.deps, PAGO, "1"), { ok: false, motivo: "SIN_TOKEN" });
  for (const status of [0, 500, 429]) {
    const d = doble({ mp: { leerPago: { status, cuerpo: null }, buscarPagos: { status, cuerpo: null } } });
    assert.deepEqual(await confirmarPago(d.deps, PAGO, "1"), { ok: false, motivo: "MP_NO_RESPONDE" });
    assert.deepEqual(await confirmarPago(d.deps, PAGO), { ok: false, motivo: "MP_NO_RESPONDE" });
    assert.ok(!d.llamadas.some((l) => l.startsWith("aplicar")));
  }
  const rechazado = doble({ mp: { buscarPagos: { status: 401, cuerpo: null } } });
  assert.deepEqual(await confirmarPago(rechazado.deps, PAGO), { ok: false, motivo: "MP_NO_RESPONDE" });
  assert.ok(rechazado.llamadas.includes("conexionEnError cx-1"));
});

test("confirmar: un pago que esa cuenta no tiene (404) no es nuestro: nada que reintentar", async () => {
  const d = doble({ mp: { leerPago: { status: 404, cuerpo: null } } });
  assert.deepEqual(await confirmarPago(d.deps, PAGO, "123"), { ok: false, motivo: "NO_ENCONTRADO" });
});

test("aviso: a Mercado Pago se le dice 200 salvo cuando hay que reintentar", () => {
  assert.equal(respuestaDeConfirmacion({ ok: true, aplicados: 0, recienAprobado: false }), 200);
  assert.equal(respuestaDeConfirmacion({ ok: false, motivo: "PAGO_DESCONOCIDO" }), 200);
  assert.equal(respuestaDeConfirmacion({ ok: false, motivo: "NO_ENCONTRADO" }), 200);
  assert.equal(respuestaDeConfirmacion({ ok: false, motivo: "MP_NO_RESPONDE" }), 503);
  assert.equal(respuestaDeConfirmacion({ ok: false, motivo: "SIN_TOKEN" }), 503);
});

// ── devolverPago y barrer ────────────────────────────────────────────────────────────────────────

const DEV: Tarea = { id: PAGO, tarea: "DEVOLVER", conexion_id: "cx-1", pago_id_externo: "18552260055" };

test("devolver: completa, con el token del restaurante y una llave fija por pago", async () => {
  const d = doble({ mp: { devolver: { status: 201, cuerpo: { id: 1009042015, status: "approved" } } } });
  assert.equal(await devolverPago(d.deps, DEV), "DEVUELTO");
  assert.deepEqual(d.llamadas, [`mp.devolver 18552260055 devolucion-${PAGO}`, `devolucion ${PAGO} true`]);
  // La llave no cambia entre intentos: si el anterior sí llegó, este no devuelve dos veces.
  const otra = doble({ mp: { devolver: { status: 201, cuerpo: {} } } });
  await devolverPago(otra.deps, DEV);
  assert.equal(otra.llamadas[0], d.llamadas[0]);
});

test("devolver: si falla pero Mercado Pago dice que ya está devuelto, queda DEVUELTO", async () => {
  const d = doble({ mp: { devolver: { status: 400, cuerpo: { cause: [{ code: "2063" }] } }, leerPago: { status: 200, cuerpo: { status: "refunded" } } } });
  assert.equal(await devolverPago(d.deps, DEV), "DEVUELTO");
  assert.deepEqual(d.llamadas.at(-1), `devolucion ${PAGO} true`);
});

test("devolver: un fallo de verdad cuenta un intento, con el motivo y sin el cuerpo", async () => {
  const d = doble({ mp: { devolver: { status: 400, cuerpo: { message: "saldo insuficiente de 4111…", error: "insufficient_amount" } }, leerPago: { status: 200, cuerpo: { status: "approved" } } } });
  assert.equal(await devolverPago(d.deps, DEV), "POR_DEVOLVER");
  assert.deepEqual(d.llamadas.at(-1), `devolucion ${PAGO} false HTTP 400 insufficient_amount`);
});

test("devolver: sin id de pago o sin token cuenta un intento sin llamar a Mercado Pago", async () => {
  const sinId = doble();
  await devolverPago(sinId.deps, { ...DEV, pago_id_externo: null });
  const sinToken = doble({ token: null });
  await devolverPago(sinToken.deps, DEV);
  for (const d of [sinId, sinToken]) assert.ok(d.llamadas.length === 1 && d.llamadas[0]!.startsWith(`devolucion ${PAGO} false`));
});

test("barrer: devuelve, concilia, y avisa solo de la devolución que se dio por fallida", async () => {
  const tareas: Tarea[] = [DEV, { id: "pago-2", tarea: "DEVOLVER", conexion_id: "cx-1", pago_id_externo: "22" },
                           { id: "pago-3", tarea: "CONCILIAR", conexion_id: "cx-1", pago_id_externo: null }];
  let n = 0;
  const d = doble({
    tareas, mp: { devolver: { status: 500, cuerpo: null }, leerPago: { status: 500, cuerpo: null }, buscarPagos: { status: 200, cuerpo: { results: [] } } },
    devolucion: () => (++n === 2 ? "DEVOLUCION_FALLIDA" : "POR_DEVOLVER"),
  });
  const avisados: string[] = [];
  assert.deepEqual(await barrer(d.deps, async (t, de) => { avisados.push(`${t.id} ${de}`); }), { devueltos: 0, fallidos: 1, conciliados: 1, sinConsultar: 0 });
  assert.deepEqual(avisados, ["pago-2 DEVOLUCION"]);
  assert.ok(d.llamadas.includes("conciliacion pago-3 true"));
});

test("barrer: si Mercado Pago no contesta, el pago NO se da por conciliado: se le dice a la base que falló", async () => {
  const d = doble({ tareas: [{ id: "pago-3", tarea: "CONCILIAR", conexion_id: "cx-1", pago_id_externo: null }], mp: { buscarPagos: { status: 0, cuerpo: null } } });
  assert.deepEqual(await barrer(d.deps, async () => {}), { devueltos: 0, fallidos: 0, conciliados: 0, sinConsultar: 1 });
  assert.ok(d.llamadas.includes("conciliacion pago-3 false") && !d.llamadas.includes("conciliacion pago-3 true"));
});

test("barrer: una tarea que revienta no detiene las demás", async () => {
  const d = doble({ tareas: [DEV, { ...DEV, id: "pago-2" }], mp: { devolver: { status: 201, cuerpo: {} } } });
  let primera = true;
  d.deps.db.devolucion = async () => { if (primera) { primera = false; throw new Error("la base no respondió"); } return "DEVUELTO"; };
  assert.deepEqual(await barrer(d.deps, async () => {}), { devueltos: 1, fallidos: 0, conciliados: 0, sinConsultar: 0 });
  assert.ok(d.llamadas.includes("registrar BARRIDO"));
});

test("aviso interno: lleva negocio, folio, monto y nuestro id, escapados; el asunto, en ASCII", () => {
  const a = avisoDeDevolucionFallida({ pagoId: PAGO, negocio: "Tacos <b>El Güero</b>", folio: "T1A2B3", monto: "264.00", error: "HTTP 400 <script>" });
  assert.equal(a.subject, "Devolucion fallida: pedido T1A2B3 de Tacos <b>El Guero</b>");
  assert.ok(a.html.includes("Tacos &lt;b&gt;El Güero&lt;/b&gt;") && a.html.includes("$264.00") && a.html.includes(PAGO) && a.html.includes("HTTP 400 &lt;script&gt;"));
  assert.ok(!a.html.includes("<script>"));
});

// ── Revisión de la entrega 1 ─────────────────────────────────────────────────────────────────────

const CON: Tarea = { id: "pago-3", tarea: "CONCILIAR", conexion_id: "cx-1", pago_id_externo: null };

test("barrer: la cuenta perdió el token con un checkout abierto: no se calla, se cuenta el fallo y al tercero se avisa", async () => {
  // Sin token (el restaurante desconectó Mercado Pago) y con el token rechazado (401): los dos casos.
  for (const o of [{ token: null }, { mp: { buscarPagos: { status: 401, cuerpo: null } } }]) {
    const avisados: string[] = [];
    const primeras = doble({ ...o, tareas: [CON] });
    await barrer(primeras.deps, async (t, de) => { avisados.push(`${t.id} ${de}`); });
    assert.ok(primeras.llamadas.includes("conciliacion pago-3 false"));
    assert.deepEqual(avisados, []);                       // primer y segundo fallo: todavía no
    const tercera = doble({ ...o, tareas: [CON], tercerFallo: () => true });
    await barrer(tercera.deps, async (t, de) => { avisados.push(`${t.id} ${de}`); });
    assert.deepEqual(avisados, ["pago-3 CONCILIACION"]);
  }
});

test("barrer: cuando Mercado Pago sí contesta no se avisa, aunque la base viniera contando fallos", async () => {
  const d = doble({ tareas: [CON], mp: { buscarPagos: { status: 200, cuerpo: { results: [] } } }, tercerFallo: () => true });
  const avisados: string[] = [];
  await barrer(d.deps, async (t) => { avisados.push(t.id); });
  assert.deepEqual(avisados, []);
  assert.ok(d.llamadas.includes("conciliacion pago-3 true"));
});

test("aviso de conciliación: dice que puede haber un cobro sin pedido y en qué negocio, escapado", () => {
  const a = avisoDeConciliacionFallida({ pagoId: PAGO, negocio: "Tacos <b>El Güero</b>", folio: "T1A2B3", monto: "264.00" });
  assert.equal(a.subject, "Posible cobro sin pedido: T1A2B3 de Tacos <b>El Guero</b>");
  assert.ok(a.html.includes("Puede haber un cobro hecho sin pedido") && a.html.includes("Tacos &lt;b&gt;El Güero&lt;/b&gt;"));
  assert.ok(a.html.includes("$264.00") && a.html.includes(PAGO) && !a.html.includes("<b>El"));
});

test("topes del aviso: una referencia que no es nuestra no gasta ningún tope de los avisos de verdad", () => {
  const ajena = topesDelAviso("00000000-0000-4000-8000-000000000000", false);
  const nuestra = topesDelAviso(PAGO.toUpperCase(), true);
  assert.deepEqual(ajena, [{ clave: "mp-tienda:ref-desconocida", ventanaSeg: 3600, max: 600 }]);
  const clavesNuestras = nuestra.map((t) => t.clave);
  assert.ok(!ajena.some((t) => clavesNuestras.includes(t.clave)));
  // La inventada tampoco estrena una bolsa por referencia: son infinitas, y cada una sería una fila.
  assert.ok(!ajena.some((t) => t.clave.includes("00000000")));
});

test("topes del aviso: lo que un comprador puede forzar con SU referencia son 40 consultas por hora, y no gasta el global", () => {
  const t = topesDelAviso(PAGO.toUpperCase(), true);
  // El de la referencia va PRIMERO: consumirCupo se detiene en el que no cabe, así que agotado este no se toca el global.
  assert.deepEqual(t[0], { clave: `mp-tienda:aviso:${PAGO}`, ventanaSeg: 3600, max: 40 });
  assert.deepEqual(t[1], { clave: "mp-tienda:avisos", ventanaSeg: 3600, max: 3000 });
  assert.equal(t.length, 2);
});
