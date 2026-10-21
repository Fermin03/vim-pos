import test from "node:test";
import assert from "node:assert/strict";
import { aceptaCambioClip, clienteClip, codigoDeErrorClip, datosDeIntencion, estadoDeIntencion, lectoresDe } from "./clip.ts";

// Ejemplo de referencia-api/get_payment.md, con los valores que pide el caso.
const resultado = (o: Record<string, unknown> = {}) => ({
  transaction_id: "f473b6eb", status: "approved", amount: 348, tip_amount: 34.8, paid_amount: 348, amount_refunded: 0,
  installments: 1, payment_method: { id: "master", type: "credit_card", card: { last_digits: "1447" } }, ...o,
});
const intencion = (status: string, results: unknown[]) => ({
  pinpad_request_id: "pinpad-0d08", reference: "cobro-1", amount: "348.00", status, detail: { results },
});

test("COMPLETED con una aprobada", () => {
  const d = datosDeIntencion(intencion("COMPLETED", [resultado({ paid_amount: "348.00", tip_amount: "34.80" })]));
  assert.equal(d.estado, "APROBADO");
  assert.equal(d.pagado_mxn, "348.00");
  assert.equal(d.propina_mxn, "34.80");
  assert.equal(d.reembolsado_mxn, null);
  assert.equal(d.tarjeta_ultimos4, "1447");
  assert.equal(d.marca, "master");
  assert.equal(d.tipo_tarjeta, "credit_card");
  assert.equal(d.mensualidades, 1);
  assert.equal(d.pago_id_externo, "f473b6eb");
  assert.equal(d.referencia, "f473b6eb");
  assert.equal(d.orden_id_externo, "pinpad-0d08");
  assert.equal(d.cobro_id, "cobro-1");
  assert.equal(d.detalle, "COMPLETED");
});

test("montos como número", () => {
  const d = datosDeIntencion(intencion("COMPLETED", [resultado()]));
  assert.equal(d.pagado_mxn, "348.00");
  assert.equal(d.propina_mxn, "34.80");
});

test("la autorización del banco gana a receipt_no, y receipt_no a transaction_id", () => {
  const conAut = resultado({ receipt_no: "Pk9RoQul", private_data: { psp_data: { authorization_id: "000154" } } });
  assert.equal(datosDeIntencion(intencion("APPROVED", [conAut])).referencia, "000154");
  const d = datosDeIntencion(intencion("COMPLETED", [resultado({ receipt_no: "R-9" })]));
  assert.equal(d.referencia, "R-9");
  assert.equal(d.pago_id_externo, "f473b6eb");
});

test("solo suman las aprobadas", () => {
  const d = datosDeIntencion(intencion("COMPLETED", [
    resultado({ paid_amount: 100, tip_amount: 0, amount_refunded: 25.5 }),
    resultado({ status: "declined", paid_amount: 50, transaction_id: "x" }),
  ]));
  assert.equal(d.pagado_mxn, "100.00");
  assert.equal(d.propina_mxn, null);
  assert.equal(d.reembolsado_mxn, "25.50");
  assert.equal(d.pago_id_externo, "f473b6eb");
});

test("estados", () => {
  assert.equal(estadoDeIntencion("ALGO_NUEVO", 1), "REVISAR");
  assert.equal(estadoDeIntencion("COMPLETED", 0), "REVISAR");
  assert.equal(estadoDeIntencion("PENDING", 0), "EN_TERMINAL");
  assert.equal(estadoDeIntencion("IN_PROCESS", 0), "EN_TERMINAL");
  assert.equal(estadoDeIntencion("CANCELED", 0), "CANCELADO");
  assert.equal(estadoDeIntencion("REJECTED", 0), "RECHAZADO");
  assert.equal(estadoDeIntencion("APPROVED", 1), "APROBADO");
  assert.equal(estadoDeIntencion("APPROVED", 0), "REVISAR");
  assert.equal(estadoDeIntencion("FAILED", 0), "REVISAR");
  assert.equal(estadoDeIntencion("PENDING", 1), "EN_TERMINAL");
  assert.equal(datosDeIntencion(intencion("APPROVED", [resultado({ status: "APPROVED" })])).estado, "APROBADO");
  assert.equal(datosDeIntencion(intencion("COMPLETED", [])).estado, "REVISAR");
  assert.equal(datosDeIntencion(null).estado, "REVISAR");
  // Visto con el lector real: el motivo de un REJECTED llega en error.code.
  const chip = datosDeIntencion({ ...intencion("REJECTED", []), error: { code: "CD-PROCESS-AS-CHIP", detail: "x" } });
  assert.deepEqual([chip.estado, chip.detalle], ["RECHAZADO", "CD-PROCESS-AS-CHIP"]);
});

test("últimos 4 dígitos inválidos", () => {
  const d = datosDeIntencion(intencion("COMPLETED", [resultado({ payment_method: { id: "visa", type: "debit_card", card: { last_digits: "12" } } })]));
  assert.equal(d.tarjeta_ultimos4, null);
  assert.equal(d.tipo_tarjeta, "debit_card");
});

const falso = (status = 200, cuerpo: unknown = {}) => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const pedir = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(cuerpo), { status });
  }) as unknown as typeof fetch;
  return { llamadas, pedir };
};

test("crearIntencion arma la petición", async () => {
  const f = falso(200, { pinpad_request_id: "pinpad-1" });
  const r = await clienteClip("k", "s", f.pedir).crearIntencion({ cobroId: "c1", monto: "348.00", serie: "P82", webhookUrl: "https://x/w?c=c1", imprime: true });
  assert.equal(r.status, 200);
  const { url, init } = f.llamadas[0];
  assert.equal(url, "https://api.payclip.io/f2f/pinpad/v1/payment");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Basic " + btoa("k:s"));
  const b = JSON.parse(String(init.body));
  assert.equal(b.amount, 348);
  assert.equal(b.reference, "c1");
  assert.equal(b.serial_number_pos, "P82");
  assert.equal(b.webhook_url, "https://x/w?c=c1");
  assert.deepEqual(b.preferences, {
    is_tip_enabled: false, is_msi_enabled: false, is_mci_enabled: false, is_dcc_enabled: false, is_retry_enabled: true,
    is_split_payment_enabled: false, is_share_enabled: false, is_auto_return_enabled: true, is_auto_print_receipt_enabled: true,
  });
});

test("crearIntencion con propinas: el lector las ofrece; lo demás igual", async () => {
  const f = falso(200, { pinpad_request_id: "pinpad-1" });
  await clienteClip("k", "s", f.pedir).crearIntencion({ cobroId: "c1", monto: "348.00", serie: "P82", webhookUrl: "u", imprime: false, propinas: [10, 15, 20] });
  assert.deepEqual(JSON.parse(String(f.llamadas[0].init.body)).preferences, {
    is_tip_enabled: true, tip_options: [10, 15, 20], is_msi_enabled: false, is_mci_enabled: false, is_dcc_enabled: false, is_retry_enabled: true,
    is_split_payment_enabled: false, is_share_enabled: false, is_auto_return_enabled: true, is_auto_print_receipt_enabled: false,
  });
});

test("crearIntencion sin respuesta no lanza", async () => {
  const lento = ((_u: string, init: RequestInit) => new Promise((_, rechaza) => {
    init.signal?.addEventListener("abort", () => rechaza(new Error("abortado")));
  })) as unknown as typeof fetch;
  const r = await clienteClip("k", "s", lento, 20).crearIntencion({ cobroId: "c1", monto: "1.00", serie: "S", webhookUrl: "u", imprime: false });
  assert.deepEqual(r, { status: 0, cuerpo: null, codigo: null });
});

test("consultar, cancelar y cancelarPorSerie", async () => {
  const f = falso();
  const c = clienteClip("k", "s", f.pedir);
  await c.consultar("pinpad-1");
  await c.cancelar("pinpad-1");
  await c.cancelarPorSerie("P 82");
  const [a, b, d] = f.llamadas;
  assert.equal(a.url, "https://api.payclip.io/f2f/pinpad/v1/payment?pinpadRequestId=pinpad-1");
  assert.equal((a.init.headers as Record<string, string>)["Pinpad-Include-Detail"], "true");
  assert.equal(b.init.method, "DELETE");
  assert.equal(b.url, "https://api.payclip.io/f2f/pinpad/v1/payment/pinpad-1");
  assert.equal(d.url, "https://api.payclip.io/f2f/pinpad/v1/payment/serial-number/P%2082");
});

test("lectores y su configuración", async () => {
  const f = falso(200, [{ serial_number: "P82", status: "active" }]);
  const c = clienteClip("k", "s", f.pedir);
  const r = await c.estadoLectores();
  await c.configurarLectores(["P82"], null);
  await c.estadoLectores("AA61B 1");
  assert.equal(f.llamadas[0].url, "https://api.payclip.io/f2f/pinpad/v1/devices/status");
  assert.equal(f.llamadas[2].url, "https://api.payclip.io/f2f/pinpad/v1/devices/status?serial_number=AA61B%201");
  assert.equal(f.llamadas[1].url, "https://api.payclip.io/f2f/pinpad/v1/devices");
  assert.deepEqual(JSON.parse(String(f.llamadas[1].init.body)), { devices: ["P82"], preferences: { timeout_seg: null } });
  assert.deepEqual(lectoresDe(r.cuerpo), [{ serie: "P82", estado: "active" }]);
  assert.deepEqual(lectoresDe({ devices: [{ serial_number: "A", status: "expired" }, 3] }), [{ serie: "A", estado: "expired" }]);
  assert.deepEqual(lectoresDe(null), []);
});

test("codigoDeErrorClip", () => {
  assert.equal(codigoDeErrorClip({ status: 400, cuerpo: { code: "ERR10_04" }, codigo: "ERR10_04" }), "TERMINAL_NO_DISPONIBLE");
  assert.equal(codigoDeErrorClip({ status: 400, cuerpo: { error_code: "PINPAD_TERMINAL_TIMEOUT_EXCEPTION" }, codigo: "PINPAD_TERMINAL_TIMEOUT_EXCEPTION" }), "TERMINAL_NO_DISPONIBLE");
  assert.equal(codigoDeErrorClip({ status: 401, cuerpo: null, codigo: null }), "CONEXION_INVALIDA");
  assert.equal(codigoDeErrorClip({ status: 500, cuerpo: {}, codigo: null }), "NO_SE_PUDO_CREAR");
});

test("el código sale de error_code del cuerpo", async () => {
  const f = falso(400, { error_code: "ERR10_04" });
  const r = await clienteClip("k", "s", f.pedir).consultar("x");
  assert.equal(r.codigo, "ERR10_04");
});

test("reembolsar pega a api.payclip.com/refunds", async () => {
  const f = falso(200, { status: "approved" });
  await clienteClip("k", "s", f.pedir).reembolsar("t-1", "24.00");
  const { url, init } = f.llamadas[0];
  assert.equal(url, "https://api.payclip.com/refunds");
  assert.equal((init.headers as Record<string, string>)["idempotency-key"], "reembolso-t-1");
  assert.deepEqual(JSON.parse(String(init.body)), { reference: { type: "transaction", id: "t-1" }, amount: 24 });
});

test("aviso de Clip: un cobro cerrado solo se reabre si se pagó; lo demás, como aceptaCambio", () => {
  for (const cerrado of ["RECHAZADO", "CANCELADO", "VENCIDO"] as const) {
    assert.equal(aceptaCambioClip(cerrado, "APROBADO"), true);
    for (const nuevo of ["REVISAR", "EN_TERMINAL", "RECHAZADO", "CANCELADO", "VENCIDO"] as const) assert.equal(aceptaCambioClip(cerrado, nuevo), false, `${cerrado}→${nuevo}`);
  }
  assert.equal(aceptaCambioClip("EN_TERMINAL", "REVISAR"), true);
  assert.equal(aceptaCambioClip("REVISAR", "APROBADO"), true);
  assert.equal(aceptaCambioClip("APROBADO", "REVISAR"), false);
  assert.equal(aceptaCambioClip("DEVUELTO", "APROBADO"), false);
});
