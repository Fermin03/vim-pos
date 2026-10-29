import { test } from "node:test";
import assert from "node:assert/strict";
import { atenderPago, type DepsPago } from "./pago.ts";

const AHORA = new Date("2026-10-28T20:00:00.000Z");
const INTENTO = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
// 01:30 del 29 en UTC = 19:30 del 28 en México: la fecha del pago es la de México.
const PAGO = { ok: true as const, estado: "approved", referencia: INTENTO, monto: 811.84, moneda: "MXN", aprobadoEl: "2026-10-29T01:30:00.000Z" };

const aplicado = (extra: Record<string, unknown> = {}) => ({
  resultado: "APLICADO", reactivado: false, sin_reactivar: false, proxima_fecha_cobro: "2026-11-28",
  wa_id: "5214771234567", conversacion_id: "conv-1", negocio: "Knock Out", factura: null,
  ultimo_cliente_en: "2026-10-28T19:50:00.000Z", ...extra,
});

/** Deps falsos: `rpc` responde por nombre de función y todo queda anotado. */
function falsos(aplicar: unknown, pago: Awaited<ReturnType<DepsPago["consultar"]>> = PAGO) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const envios: object[] = [];
  const salidas: { conversacionId: string; wamid: string; texto: string }[] = [];
  const d: DepsPago = {
    async consultar() { return pago; },
    async rpc(fn, args) { rpcs.push({ fn, args }); return fn === "wa_aplicar_pago" ? aplicar : null; },
    async enviar(c) { envios.push(c); return { ok: true, wamid: "wamid.1" }; },
    async registrarSalida(conversacionId, wamid, texto) { salidas.push({ conversacionId, wamid, texto }); },
    ahora: () => AHORA,
  };
  return { d, rpcs, envios, salidas };
}

const texto = (c: object) => (c as { text?: { body: string } }).text?.body ?? "";

test("solo aplica pagos approved en MXN con referencia uuid", async () => {
  for (const cambio of [{ estado: "pending" }, { estado: "rejected" }, { moneda: "USD" }, { referencia: "pedido-42" }, { referencia: null }, { monto: NaN }]) {
    const f = falsos(aplicado(), { ...PAGO, ...cambio });
    assert.equal(await atenderPago("123", f.d), "IGNORADO", JSON.stringify(cambio));
    assert.equal(f.rpcs.length, 0);
    assert.equal(f.envios.length, 0);
  }
});

test("si Mercado Pago no contesta, lanza para que el aviso se reintente", async () => {
  const f = falsos(aplicado(), { ok: false, error: "HTTP 500" });
  await assert.rejects(atenderPago("123", f.d), /HTTP 500/);
  assert.equal(f.rpcs.length, 0);
});

test("aplicado: confirma por WhatsApp con la próxima fecha", async () => {
  const f = falsos(aplicado());
  assert.equal(await atenderPago("123", f.d), "APLICADO");
  assert.deepEqual(f.rpcs, [{ fn: "wa_aplicar_pago", args: { p_intento_id: INTENTO, p_pago_id: "123", p_monto: 811.84, p_pagado_el: "2026-10-28" } }]);
  assert.equal(f.envios.length, 1);
  assert.equal((f.envios[0] as { to: string }).to, "5214771234567");
  assert.equal(texto(f.envios[0]), "Listo, quedó tu pago. Tu próxima fecha de pago es el 28 de noviembre de 2026.");
  assert.deepEqual(f.salidas, [{ conversacionId: "conv-1", wamid: "wamid.1", texto: texto(f.envios[0]) }]);
});

test("aplicado y reactivado: dice que la caja se desbloquea en unos minutos", async () => {
  const f = falsos(aplicado({ reactivado: true }));
  assert.equal(await atenderPago("123", f.d), "APLICADO");
  assert.equal(texto(f.envios[0]), "Listo, quedó tu pago. Tu próxima fecha de pago es el 28 de noviembre de 2026. Tu caja se desbloquea en unos minutos.");
});

test("con factura: le dice al cliente que le llega por correo (el aviso a Fermín lo deja wa_aplicar_pago)", async () => {
  const factura = { rfc: "KOB210101AB1", razon_social: "Knock Out Burger SA de CV", regimen: "601", codigo_postal: "37000", uso_cfdi: "G03" };
  const f = falsos(aplicado({ factura }));
  assert.equal(await atenderPago("123", f.d), "APLICADO");
  // Solo wa_aplicar_pago: el aviso va en su transacción (smoke_agente_cobro.sql, 6f).
  assert.deepEqual(f.rpcs.map((r) => r.fn), ["wa_aplicar_pago"]);
  assert.ok(texto(f.envios[0]).endsWith(" Tu factura te llega por correo."));
  assert.ok(!texto(f.envios[0]).includes("Fermín"));
});

test("más de 24 h desde el último mensaje del cliente: usa la plantilla pago_confirmado", async () => {
  for (const ultimo of ["2026-10-27T19:59:00.000Z", null]) {
    const f = falsos(aplicado({ ultimo_cliente_en: ultimo, reactivado: true }));
    assert.equal(await atenderPago("123", f.d), "APLICADO");
    assert.deepEqual(f.envios[0], {
      messaging_product: "whatsapp", to: "5214771234567", type: "template",
      template: { name: "pago_confirmado", language: { code: "es_MX" }, components: [{ type: "body", parameters: [{ type: "text", text: "28 de noviembre de 2026" }] }] },
    });
    assert.equal(f.salidas.length, 1);
    assert.ok(f.salidas[0].texto.includes("28 de noviembre de 2026"));
  }
});

test("MONTO_DISTINTO, FECHA_MOVIDA o sin_reactivar: pasa a Fermín como URGENTE_SOPORTE y no felicita al cliente", async () => {
  for (const resultado of ["MONTO_DISTINTO", "FECHA_MOVIDA"]) {
    const f = falsos(aplicado({ resultado }));
    assert.equal(await atenderPago("123", f.d), "RECHAZADO");
    const pasa = f.rpcs.find((r) => r.fn === "wa_pasar_a_fermin");
    assert.ok(pasa);
    assert.equal(pasa.args.p_conversacion_id, "conv-1");
    assert.equal(pasa.args.p_estado, "URGENTE_SOPORTE");
    assert.ok(String(pasa.args.p_resumen).includes("123") && String(pasa.args.p_resumen).includes("811.84"));
    assert.equal(f.envios.length, 0);
    assert.equal(f.salidas.length, 0);
  }

  // sin_reactivar: el URGENTE_SOPORTE lo deja wa_aplicar_pago en su transacción (smoke, 6g).
  const s = falsos(aplicado({ sin_reactivar: true }));
  assert.equal(await atenderPago("123", s.d), "APLICADO");
  assert.deepEqual(s.rpcs.map((r) => r.fn), ["wa_aplicar_pago"]);
  // El pago sí quedó: se confirma, pero sin prometer que la caja se desbloquea.
  assert.equal(s.envios.length, 1);
  assert.ok(texto(s.envios[0]).startsWith("Listo, quedó tu pago."));
  assert.ok(!texto(s.envios[0]).includes("desbloquea"));
  assert.ok(!texto(s.envios[0]).includes("Fermín"));
});

test("DUPLICADO no envía nada", async () => {
  for (const [resultado, sale] of [["DUPLICADO", "DUPLICADO"], ["NO_EXISTE", "IGNORADO"]]) {
    const f = falsos(resultado === "NO_EXISTE" ? { resultado, reactivado: false, sin_reactivar: false } : aplicado({ resultado }));
    assert.equal(await atenderPago("123", f.d), sale);
    assert.equal(f.rpcs.length, 1);
    assert.equal(f.envios.length, 0);
    assert.equal(f.salidas.length, 0);
  }
});

test("si WhatsApp no da wamid, no se registra la salida", async () => {
  const f = falsos(aplicado());
  f.d.enviar = async () => ({ ok: false, wamid: null });
  assert.equal(await atenderPago("123", f.d), "APLICADO");
  assert.equal(f.salidas.length, 0);
});

test("ya aplicado, si WhatsApp o registrar la salida lanzan, igual devuelve APLICADO (un reintento sería DUPLICADO)", async () => {
  const lanza = async () => { throw new Error("base caída"); };
  const a = falsos(aplicado());
  a.d.enviar = lanza;
  assert.equal(await atenderPago("123", a.d), "APLICADO");
  const b = falsos(aplicado());
  b.d.registrarSalida = lanza;
  assert.equal(await atenderPago("123", b.d), "APLICADO");
});

test("si la base falla al aplicar, lanza para que Mercado Pago reintente", async () => {
  const f = falsos(aplicado());
  f.d.rpc = async () => { throw new Error("conexión rechazada"); };
  await assert.rejects(atenderPago("123", f.d), /conexión rechazada/);
});
