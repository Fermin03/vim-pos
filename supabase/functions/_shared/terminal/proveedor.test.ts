import test from "node:test";
import assert from "node:assert/strict";
import { ESPERA_CLIP, proveedorDe } from "./proveedor.ts";

type Llamada = { url: string; init: RequestInit };
/** `pedir` falso: responde en orden lo que se le da (o lanza, para simular sin respuesta). */
function falso(...respuestas: ({ status: number; cuerpo?: unknown } | "sin_respuesta")[]) {
  const llamadas: Llamada[] = [];
  const pedir = ((url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift() ?? { status: 200, cuerpo: {} };
    if (r === "sin_respuesta") return Promise.reject(new Error("timeout"));
    return Promise.resolve(new Response(r.cuerpo === undefined ? "" : JSON.stringify(r.cuerpo), { status: r.status }));
  }) as unknown as typeof fetch;
  return { pedir, llamadas };
}
const cabeceras = (l: Llamada) => l.init.headers as Record<string, string>;
const BASE = "https://x.supabase.co";
const MP = { access_token: "tok", refresh_token: "ref" };
const CLIP = { access_token: "key", refresh_token: "sec" };
const COBRO = { cobroId: "c-1", monto: "348.00", terminal: "T__1", folio: "A-12", esperaSeg: 180, imprime: false };

test("sin credencial no hay proveedor", () => {
  assert.equal(proveedorDe("MERCADO_PAGO", { access_token: null, refresh_token: "r" }, BASE), null);
  assert.equal(proveedorDe("CLIP", { access_token: null, refresh_token: "sec" }, BASE), null);
  assert.equal(proveedorDe("CLIP", { access_token: "key", refresh_token: null }, BASE), null);
});

// ── Mercado Pago: las mismas peticiones que terminal-cobro hacía antes de la interfaz ──

test("MP crear manda la misma order de siempre y aplica la respuesta", async () => {
  const f = falso({ status: 201, cuerpo: { id: "ORD1", status: "created", external_reference: "c-1" } });
  const r = await proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!.crear(COBRO);
  const [l] = f.llamadas;
  assert.equal(l.url, "https://api.mercadopago.com/v1/orders");
  assert.equal(l.init.method, "POST");
  assert.deepEqual(cabeceras(l), { Authorization: "Bearer tok", "Content-Type": "application/json", "X-Idempotency-Key": "c-1" });
  assert.deepEqual(JSON.parse(String(l.init.body)), {
    type: "point", external_reference: "c-1", expiration_time: "PT180S",
    transactions: { payments: [{ amount: "348.00" }] },
    config: { point: { terminal_id: "T__1", print_on_terminal: "no_ticket" } },
    description: "Ticket A-12",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.datos.estado, r.datos.orden_id_externo, r.datos.detalle], ["EN_TERMINAL", "ORD1", null]);
});

test("MP crear sin folio dice «Cobro en caja» e imprime el ticket del vendedor", async () => {
  const f = falso({ status: 201, cuerpo: { id: "ORD1", status: "created" } });
  await proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!.crear({ ...COBRO, folio: null, imprime: true, esperaSeg: 300 });
  const cuerpo = JSON.parse(String(f.llamadas[0].init.body));
  assert.equal(cuerpo.description, "Cobro en caja");
  assert.equal(cuerpo.config.point.print_on_terminal, "seller_ticket");
  assert.equal(cuerpo.expiration_time, "PT300S");
});

test("MP crear: los códigos de error de siempre", async () => {
  const caso = async (status: number, code?: string) => {
    const f = falso({ status, cuerpo: code ? { errors: [{ code }] } : {} });
    return proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!.crear(COBRO);
  };
  assert.deepEqual(await caso(409, "already_queued_order_on_terminal"), { ok: false, codigo: "TERMINAL_OCUPADA" });
  assert.deepEqual(await caso(409, "already_queued_order_for_terminal"), { ok: false, codigo: "TERMINAL_OCUPADA" });
  assert.deepEqual(await caso(403, "forbidden_checking_terminal_owner"), { ok: false, codigo: "TERMINAL_AJENA" });
  assert.deepEqual(await caso(401), { ok: false, codigo: "CONEXION_INVALIDA" });
  assert.deepEqual(await caso(500), { ok: false, codigo: "NO_SE_PUDO_CREAR" });
});

test("MP consultar lee la order con el id que ya se conocía", async () => {
  const f = falso({ status: 200, cuerpo: { status: "processed", status_detail: "accredited", total_paid_amount: "12.50" } }, { status: 500 });
  const mp = proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!;
  const d = await mp.consultar("ORD 1");
  assert.equal(f.llamadas[0].url, "https://api.mercadopago.com/v1/orders/ORD%201");
  assert.equal(f.llamadas[0].init.method, "GET");
  assert.equal(f.llamadas[0].init.body, undefined);
  assert.deepEqual([d?.estado, d?.orden_id_externo, d?.pagado_mxn], ["APROBADO", "ORD 1", "12.50"]);
  assert.equal(await mp.consultar("ORD1"), null);
});

test("MP cancelar: 200 hecha (con la order), 202 pedida, lo demás falla", async () => {
  const f = falso({ status: 200, cuerpo: { id: "ORD1", status: "canceled", status_detail: "canceled_by_api" } }, { status: 202, cuerpo: {} }, { status: 403 });
  const mp = proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!;
  const hecha = await mp.cancelar("ORD1");
  assert.equal(f.llamadas[0].url, "https://api.mercadopago.com/v1/orders/ORD1/cancel");
  assert.equal(f.llamadas[0].init.method, "POST");
  assert.equal(cabeceras(f.llamadas[0])["x-allow-cancelable-status"], "at_terminal");
  assert.match(cabeceras(f.llamadas[0])["X-Idempotency-Key"], /^[0-9a-f-]{36}$/);
  assert.equal(hecha.cancelacion, "HECHA");
  assert.deepEqual([hecha.datos?.estado, hecha.datos?.detalle], ["CANCELADO", "canceled_by_api"]);
  assert.deepEqual(await mp.cancelar("ORD1"), { cancelacion: "PEDIDA", datos: null });
  assert.deepEqual(await mp.cancelar("ORD1"), { cancelacion: "FALLO", datos: null });
});

test("MP reembolsar: devolución total con la order como llave", async () => {
  const f = falso({ status: 201, cuerpo: { status: "refunded" } }, { status: 200 }, { status: 401 }, { status: 400, cuerpo: { errors: [{ code: "refund_not_possible" }] } }, { status: 500 });
  const mp = proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!;
  const c = { ordenId: "ORD1", pagoId: "PAY1", monto: "348.00" };
  assert.deepEqual(await mp.reembolsar(c), { ok: true });
  assert.equal(f.llamadas[0].url, "https://api.mercadopago.com/v1/orders/ORD1/refund");
  assert.equal(f.llamadas[0].init.body, undefined);
  assert.equal(cabeceras(f.llamadas[0])["X-Idempotency-Key"], "reembolso-ORD1");
  assert.deepEqual(await mp.reembolsar(c), { ok: true });
  assert.deepEqual(await mp.reembolsar(c), { ok: false, motivo: "CONEXION_INVALIDA" });
  assert.deepEqual(await mp.reembolsar(c), { ok: false, motivo: "refund_not_possible" });
  assert.deepEqual(await mp.reembolsar(c), { ok: false, motivo: "HTTP_500" });
});

test("MP lectorListo es siempre true y no pregunta nada", async () => {
  const f = falso();
  assert.equal(await proveedorDe("MERCADO_PAGO", MP, BASE, f.pedir)!.lectorListo("T__1"), true);
  assert.equal(f.llamadas.length, 0);
});

// ── Clip ──

test("Clip crear manda la intención con el aviso del cobro y queda en la terminal", async () => {
  const f = falso({ status: 200, cuerpo: { pinpad_request_id: "pinpad-1", reference: "c-1", amount: "348.00" } });
  const r = await proveedorDe("CLIP", CLIP, BASE, f.pedir)!.crear({ ...COBRO, terminal: "P82" });
  const cuerpo = JSON.parse(String(f.llamadas[0].init.body));
  assert.equal(f.llamadas[0].url, "https://api.payclip.io/f2f/pinpad/v1/payment");
  assert.equal(cuerpo.webhook_url, "https://x.supabase.co/functions/v1/terminal-webhook-clip?c=c-1");
  assert.deepEqual([cuerpo.reference, cuerpo.amount, cuerpo.serial_number_pos], ["c-1", "348.00", "P82"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.datos.estado, r.datos.orden_id_externo], ["EN_TERMINAL", "pinpad-1"]);
});

test("Clip crear sin respuesta cancela por número de serie y no se reintenta", async () => {
  const f = falso("sin_respuesta", { status: 200, cuerpo: {} });
  const r = await proveedorDe("CLIP", CLIP, BASE, f.pedir)!.crear({ ...COBRO, terminal: "P82" });
  assert.deepEqual(r, { ok: false, codigo: "SIN_RESPUESTA", sinRespuesta: true });
  assert.equal(f.llamadas.length, 2);
  assert.equal(f.llamadas[1].init.method, "DELETE");
  assert.equal(f.llamadas[1].url, "https://api.payclip.io/f2f/pinpad/v1/payment/serial-number/P82");
});

test("Clip crear sin respuesta y sin cancelación confirmada queda en REVISAR (reintentar podría cobrar dos veces)", async () => {
  for (const cancelacion of [{ status: 500 }, "sin_respuesta"] as const) {
    const f = falso("sin_respuesta", cancelacion);
    const r = await proveedorDe("CLIP", CLIP, BASE, f.pedir)!.crear({ ...COBRO, terminal: "P82" });
    assert.equal(f.llamadas.length, 2);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual([r.datos.estado, r.datos.detalle, r.datos.orden_id_externo, r.datos.pagado_mxn], ["REVISAR", "SIN_RESPUESTA", null, null]);
  }
});

test("Clip crear con 5xx es tan ambiguo como sin respuesta: cancela por serie y solo cierra si Clip lo confirma", async () => {
  for (const status of [500, 502, 503, 504]) {
    const f = falso({ status }, { status: 200, cuerpo: {} });
    const r = await proveedorDe("CLIP", CLIP, BASE, f.pedir)!.crear({ ...COBRO, terminal: "P82" });
    assert.deepEqual(r, { ok: false, codigo: "SIN_RESPUESTA", sinRespuesta: true }, String(status));
    assert.equal(f.llamadas[1].url, "https://api.payclip.io/f2f/pinpad/v1/payment/serial-number/P82");
  }
  for (const cancelacion of [{ status: 500 }, "sin_respuesta"] as const) {
    const f = falso({ status: 502 }, cancelacion);
    const r = await proveedorDe("CLIP", CLIP, BASE, f.pedir)!.crear({ ...COBRO, terminal: "P82" });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual([r.datos.estado, r.datos.detalle, r.datos.orden_id_externo], ["REVISAR", "SIN_RESPUESTA", null]);
  }
});

test("Clip: crear + cancelar por serie caben de sobra en los 25 s del puente de la caja", () => {
  assert.ok(ESPERA_CLIP.crear + ESPERA_CLIP.cancelarPorSerie <= 20_000);
  assert.ok(ESPERA_CLIP.lectores <= 5_000);
});

test("Clip crear: lector apagado, clave mala, o 200 sin id", async () => {
  const caso = async (...r: Parameters<typeof falso>) => proveedorDe("CLIP", CLIP, BASE, falso(...r).pedir)!.crear(COBRO);
  assert.deepEqual(await caso({ status: 400, cuerpo: { code: "ERR10_04" } }), { ok: false, codigo: "TERMINAL_NO_DISPONIBLE" });
  assert.deepEqual(await caso({ status: 401 }), { ok: false, codigo: "CONEXION_INVALIDA" });
  assert.deepEqual(await caso({ status: 200, cuerpo: {} }, { status: 200 }), { ok: false, codigo: "NO_SE_PUDO_CREAR" });
});

test("Clip consultar y cancelar", async () => {
  const f = falso(
    { status: 200, cuerpo: { pinpad_request_id: "pinpad-1", status: "COMPLETED", detail: { results: [{ status: "approved", transaction_id: "t-1", paid_amount: 348 }] } } },
    "sin_respuesta",
    { status: 200, cuerpo: { pinpad_request_id: "pinpad-1" } },
    { status: 400 },
  );
  const clip = proveedorDe("CLIP", CLIP, BASE, f.pedir)!;
  const d = await clip.consultar("pinpad-1");
  assert.deepEqual([d?.estado, d?.pago_id_externo, d?.pagado_mxn], ["APROBADO", "t-1", "348.00"]);
  assert.equal(await clip.consultar("pinpad-1"), null);
  const hecha = await clip.cancelar("pinpad-1");
  assert.equal(f.llamadas[2].url, "https://api.payclip.io/f2f/pinpad/v1/payment/pinpad-1");
  assert.equal(hecha.cancelacion, "HECHA");
  assert.equal(hecha.datos?.estado, "CANCELADO");
  assert.deepEqual(await clip.cancelar("pinpad-1"), { cancelacion: "FALLO", datos: null });
});

test("Clip reembolsar usa el transaction_id", async () => {
  const f = falso({ status: 200, cuerpo: {} }, { status: 409, cuerpo: { code: "REFUND_DUP" } });
  const clip = proveedorDe("CLIP", CLIP, BASE, f.pedir)!;
  assert.deepEqual(await clip.reembolsar({ ordenId: "pinpad-1", pagoId: "t-1", monto: "24.00" }), { ok: true });
  assert.deepEqual(JSON.parse(String(f.llamadas[0].init.body)), { reference: { type: "transaction", id: "t-1" }, amount: 24 });
  assert.deepEqual(await clip.reembolsar({ ordenId: "pinpad-1", pagoId: "t-1", monto: "24.00" }), { ok: false, motivo: "REFUND_DUP" });
  assert.deepEqual(await clip.reembolsar({ ordenId: "pinpad-1", pagoId: null, monto: "24.00" }), { ok: false, motivo: "SIN_PAGO" });
  assert.equal(f.llamadas.length, 2);
});

test("Clip lectorListo según devices/status; si la consulta falla, true", async () => {
  const lista = (estado: string) => ({ status: 200, cuerpo: [{ serial_number: "P82", status: estado }, { serial_number: "P99", status: "active" }] });
  const listo = async (...r: Parameters<typeof falso>) => proveedorDe("CLIP", CLIP, BASE, falso(...r).pedir)!.lectorListo("P82");
  assert.equal(await listo(lista("inactive")), false);
  assert.equal(await listo(lista("active")), true);
  assert.equal(await listo({ status: 500 }), true);
  assert.equal(await listo("sin_respuesta"), true);
});
