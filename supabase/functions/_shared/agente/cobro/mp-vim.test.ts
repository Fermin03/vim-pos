import { test } from "node:test";
import assert from "node:assert/strict";
import { consultarPago, crearPreferencia } from "./mp-vim.ts";

const resp = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status });

test("la preferencia solo acepta tarjeta, sin meses, y vence en 24 h", async () => {
  let url = "", init: RequestInit = {};
  const f = (async (u: string, i: RequestInit) => {
    url = u; init = i;
    return resp(201, { id: "pref-1", init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1" });
  }) as unknown as typeof fetch;
  const r = await crearPreferencia({
    intentoId: "int-1", total: 1853.68, titulo: "VIM POS", venceEn: new Date("2026-10-29T20:05:00.000Z"),
    notificacion: "https://x.supabase.co/functions/v1/mp-vim-webhook",
  }, "tok", f);
  assert.deepEqual(r, { ok: true, id: "pref-1", url: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1" });
  assert.equal(url, "https://api.mercadopago.com/checkout/preferences");
  assert.equal(init.method, "POST");
  const h = init.headers as Record<string, string>;
  assert.equal(h.Authorization, "Bearer tok");
  assert.equal(h["X-Idempotency-Key"], "int-1");
  const b = JSON.parse(String(init.body));
  assert.equal(b.external_reference, "int-1");
  assert.deepEqual(b.items, [{ title: "VIM POS", quantity: 1, unit_price: 1853.68, currency_id: "MXN" }]);
  assert.deepEqual(b.payment_methods, {
    excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }], installments: 1,
  });
  assert.equal(b.binary_mode, true);
  assert.equal(b.expires, true);
  assert.equal(b.expiration_date_to, "2026-10-29T14:05:00.000-06:00");
  assert.equal(b.notification_url, "https://x.supabase.co/functions/v1/mp-vim-webhook");
});

test("error de Mercado Pago vuelve como ok:false, nunca lanza", async () => {
  const d = { intentoId: "i", total: 1, titulo: "t", venceEn: new Date(), notificacion: "n" };
  const malo = (async () => resp(400, { message: "invalid_items" })) as unknown as typeof fetch;
  const a = await crearPreferencia(d, "tok", malo);
  assert.equal(a.ok, false);
  const cae = (async () => { throw new Error("red"); }) as unknown as typeof fetch;
  assert.deepEqual(await crearPreferencia(d, "tok", cae), { ok: false, error: "red" });
  assert.equal((await consultarPago("1", "tok", cae)).ok, false);
  assert.equal((await consultarPago("1", "tok", malo)).ok, false);
});

test("consultarPago lee estado, referencia, monto y fecha", async () => {
  let url = "";
  const f = (async (u: string) => {
    url = u;
    return resp(200, {
      status: "approved", external_reference: "int-1", transaction_amount: 1853.68,
      currency_id: "MXN", date_approved: "2026-10-28T10:00:00.000-06:00",
    });
  }) as unknown as typeof fetch;
  assert.deepEqual(await consultarPago("123/4", "tok", f), {
    ok: true, estado: "approved", referencia: "int-1", monto: 1853.68, moneda: "MXN", aprobadoEl: "2026-10-28T10:00:00.000-06:00",
  });
  assert.equal(url, "https://api.mercadopago.com/v1/payments/123%2F4");
  const sin = (async () => resp(200, { status: "pending", transaction_amount: 5, currency_id: "MXN" })) as unknown as typeof fetch;
  assert.deepEqual(await consultarPago("9", "tok", sin), {
    ok: true, estado: "pending", referencia: null, monto: 5, moneda: "MXN", aprobadoEl: null,
  });
});
