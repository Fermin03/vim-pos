import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeDevolucionFallida, barrer, confirmarPago, type Deps, devolverPago, type FilaPago, prepararPago, type PuertoPagos, respuestaDeConfirmacion, type Tarea } from "./pago-flujo.ts";
import type { ClienteMpTienda, RespuestaMp } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const FILA: FilaPago = {
  id: PAGO, conexion_id: "cx-1", estado: "CREADO", monto: "264.00", init_point: null,
  vence_at: "2026-10-11T18:15:00.000Z", cuenta_vendedora: "202809963", de_prueba: false,
};
const APROBADO = {
  id: 18552260055, status: "approved", status_detail: "accredited", currency_id: "MXN", live_mode: true,
  collector_id: 202809963, external_reference: PAGO, transaction_amount: 264, payment_type_id: "credit_card", payment_method_id: "master",
};
const DATOS = {
  pagoId: PAGO, folio: "T1A2B3", negocio: "Knock-Out", regreso: "https://pedidos.vimpos.com.mx/knockout/pedido/abc",
  aviso: `https://x.supabase.co/functions/v1/tienda-webhook-mp?ref=${PAGO}`, ahora: new Date("2026-10-11T18:00:00Z"), email: null,
};

/** La base y Mercado Pago de mentira: se anota cada llamada y se contesta lo que diga cada prueba. */
function doble(o: {
  fila?: FilaPago | null; token?: string | null; toma?: boolean; tareas?: Tarea[];
  mp?: Partial<Record<keyof ClienteMpTienda, RespuestaMp>>; devolucion?: (ok: boolean) => string;
  aplicar?: (pagoIdExterno: string) => { estado: string; pedido_estado: string; recien_aprobado: boolean };
} = {}) {
  const llamadas: string[] = [];
  const tokens: string[] = [];
  const db: PuertoPagos = {
    leerPago: async () => (o.fila === undefined ? FILA : o.fila),
    token: async () => (o.token === undefined ? "TOKEN" : o.token),
    conexionEnError: async (id) => { llamadas.push(`conexionEnError ${id}`); },
    tomarPreferencia: async () => { llamadas.push("tomarPreferencia"); return o.toma ?? true; },
    guardarPreferencia: async (_id, pref, init) => { llamadas.push(`guardarPreferencia ${pref} ${init}`); },
    descartar: async () => { llamadas.push("descartar"); return true; },
    aplicar: async (_id, d) => {
      llamadas.push(`aplicar ${d.resultado} ${d.pagoIdExterno} ${d.monto}`);
      return o.aplicar?.(d.pagoIdExterno) ?? { estado: "APROBADO", pedido_estado: "RECIBIDO", recien_aprobado: d.resultado === "APROBADO" };
    },
    tomar: async () => o.tareas ?? [],
    devolucion: async (id, ok, error) => { llamadas.push(`devolucion ${id} ${ok}${error ? ` ${error}` : ""}`); return o.devolucion?.(ok) ?? (ok ? "DEVUELTO" : "POR_DEVOLVER"); },
    conciliado: async (id) => { llamadas.push(`conciliado ${id}`); },
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
        crearPreferencia: (c) => responder("crearPreferencia", c), leerPago: (id) => responder("leerPago", id),
        buscarPagos: (id) => responder("buscarPagos", id), devolver: (id, llave) => responder("devolver", id, llave),
      };
    },
    registrar: (codigo) => { llamadas.push(`registrar ${codigo}`); },
  };
  return { deps, llamadas, tokens };
}
const PREF = { status: 201, cuerpo: { id: "pref-1", init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1" } };

// ── prepararPago ─────────────────────────────────────────────────────────────────────────────────

test("preparar: crea la preferencia con el token del restaurante y el monto de la base, y la guarda", async () => {
  const d = doble({ mp: { crearPreferencia: PREF } });
  assert.deepEqual(await prepararPago(d.deps, DATOS), { ok: true, init_point: PREF.cuerpo.init_point });
  assert.deepEqual(d.llamadas, ["tomarPreferencia", "mp.crearPreferencia {…}", `guardarPreferencia pref-1 ${PREF.cuerpo.init_point}`]);
  assert.deepEqual(d.tokens, ["TOKEN"]);
});

test("preparar: el reintento devuelve el MISMO init_point sin tomar nada ni crear otra preferencia", async () => {
  const d = doble({ fila: { ...FILA, init_point: "https://mp/ya-creada" }, mp: { crearPreferencia: PREF } });
  assert.deepEqual(await prepararPago(d.deps, DATOS), { ok: true, init_point: "https://mp/ya-creada" });
  assert.deepEqual(d.llamadas, []);
  assert.deepEqual(d.tokens, []);
});

test("preparar: un pago que ya no espera al cliente (pagado, vencido) no tiene a dónde mandarlo", async () => {
  for (const estado of ["APROBADO", "VENCIDO", "POR_DEVOLVER", "DEVUELTO"] as const) {
    for (const init_point of [null, "https://mp/ya-creada"]) {
      const d = doble({ fila: { ...FILA, estado, init_point } });
      assert.deepEqual(await prepararPago(d.deps, DATOS), { ok: true, init_point: null });
      assert.deepEqual(d.llamadas, []);
    }
  }
});

test("preparar: si otra petición del mismo intento la está creando, esta no crea otra", async () => {
  const d = doble({ toma: false, mp: { crearPreferencia: PREF } });
  assert.deepEqual(await prepararPago(d.deps, DATOS), { ok: false, error: "PAGO_EN_PROCESO" });
  assert.deepEqual(d.llamadas, ["tomarPreferencia"]);
});

test("preparar: si Mercado Pago no la crea, el pedido se descarta y no queda vivo", async () => {
  for (const r of [{ status: 500, cuerpo: null }, { status: 0, cuerpo: null }, { status: 400, cuerpo: { error: "invalid_back_urls" } },
                   { status: 201, cuerpo: { id: "sin-init-point" } }, { status: 201, cuerpo: { id: "x", init_point: "http://sin-tls" } }]) {
    const d = doble({ mp: { crearPreferencia: r } });
    assert.deepEqual(await prepararPago(d.deps, DATOS), { ok: false, error: "PAGO_NO_DISPONIBLE" });
    assert.deepEqual(d.llamadas, ["tomarPreferencia", "mp.crearPreferencia {…}", "registrar PREFERENCIA", "descartar"]);
  }
});

test("preparar: token rechazado o ausente marca la conexión con error, y también descarta", async () => {
  const rechazado = doble({ mp: { crearPreferencia: { status: 401, cuerpo: { error: "invalid_access_token" } } } });
  assert.deepEqual(await prepararPago(rechazado.deps, DATOS), { ok: false, error: "PAGO_NO_DISPONIBLE" });
  assert.deepEqual(rechazado.llamadas, ["tomarPreferencia", "mp.crearPreferencia {…}", "conexionEnError cx-1", "registrar PREFERENCIA", "descartar"]);
  const sin = doble({ token: null });
  assert.deepEqual(await prepararPago(sin.deps, DATOS), { ok: false, error: "PAGO_NO_DISPONIBLE" });
  assert.deepEqual(sin.llamadas, ["tomarPreferencia", "conexionEnError cx-1", "registrar SIN_TOKEN", "descartar"]);
});

// ── confirmarPago ────────────────────────────────────────────────────────────────────────────────

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
  assert.deepEqual(await barrer(d.deps, async (t) => { avisados.push(t.id); }), { devueltos: 0, fallidos: 1, conciliados: 1 });
  assert.deepEqual(avisados, ["pago-2"]);
  assert.ok(d.llamadas.includes("conciliado pago-3"));
});

test("barrer: si Mercado Pago no contesta, el pago NO se da por conciliado (se le vuelve a preguntar)", async () => {
  const d = doble({ tareas: [{ id: "pago-3", tarea: "CONCILIAR", conexion_id: "cx-1", pago_id_externo: null }], mp: { buscarPagos: { status: 0, cuerpo: null } } });
  assert.deepEqual(await barrer(d.deps, async () => {}), { devueltos: 0, fallidos: 0, conciliados: 0 });
  assert.ok(!d.llamadas.some((l) => l.startsWith("conciliado")));
});

test("barrer: una tarea que revienta no detiene las demás", async () => {
  const d = doble({ tareas: [DEV, { ...DEV, id: "pago-2" }], mp: { devolver: { status: 201, cuerpo: {} } } });
  let primera = true;
  d.deps.db.devolucion = async () => { if (primera) { primera = false; throw new Error("la base no respondió"); } return "DEVUELTO"; };
  assert.deepEqual(await barrer(d.deps, async () => {}), { devueltos: 1, fallidos: 0, conciliados: 0 });
  assert.ok(d.llamadas.includes("registrar BARRIDO"));
});

test("aviso interno: lleva negocio, folio, monto y nuestro id, escapados; el asunto, en ASCII", () => {
  const a = avisoDeDevolucionFallida({ pagoId: PAGO, negocio: "Tacos <b>El Güero</b>", folio: "T1A2B3", monto: "264.00", error: "HTTP 400 <script>" });
  assert.equal(a.subject, "Devolucion fallida: pedido T1A2B3 de Tacos <b>El Guero</b>");
  assert.ok(a.html.includes("Tacos &lt;b&gt;El Güero&lt;/b&gt;") && a.html.includes("$264.00") && a.html.includes(PAGO) && a.html.includes("HTTP 400 &lt;script&gt;"));
  assert.ok(!a.html.includes("<script>"));
});
