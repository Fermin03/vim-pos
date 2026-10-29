// Checkout Pro con la cuenta de Mercado Pago de VIM: el cliente paga su suscripción desde un enlace.
// Fuente: docs/integraciones/mercado-pago-checkout-pro/. Nunca lanza: todo error vuelve como { ok: false }.
// La firma de los avisos es la misma que la de Point: se reusa `firmaValida` de terminal/mercado-pago.ts.
import { obj, txt } from "../../terminal/comun.ts";

const API = "https://api.mercadopago.com";

type Falla = { ok: false; error: string };

async function llamar(metodo: string, ruta: string, token: string, f: typeof fetch, cuerpo?: unknown, extra: Record<string, string> = {}):
  Promise<{ ok: true; json: Record<string, unknown> } | Falla> {
  try {
    const r = await f(API + ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* cuerpo no JSON */ }
    if (!r.ok) return { ok: false, error: txt(obj(json).message) ?? `HTTP ${r.status}` };
    return { ok: true, json: obj(json) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Mismo instante en hora de México (-06:00 fijo: sin horario de verano desde 2022), como pide la API. */
const enMexico = (d: Date) => new Date(d.getTime() - 6 * 3600_000).toISOString().replace("Z", "-06:00");

/** Tarjeta (sin meses), OXXO/Paycash y transferencia SPEI; el enlace caduca en `venceEn` y la ficha de
 *  efectivo 2 días después. Sin `binary_mode`: OXXO y SPEI llegan `pending` y se aplican al aprobarse. */
export async function crearPreferencia(
  d: { intentoId: string; total: number; titulo: string; venceEn: Date; notificacion: string },
  token: string,
  f: typeof fetch = fetch,
): Promise<{ ok: true; id: string; url: string } | Falla> {
  const r = await llamar("POST", "/checkout/preferences", token, f, {
    external_reference: d.intentoId,
    items: [{ title: d.titulo, quantity: 1, unit_price: d.total, currency_id: "MXN" }],
    payment_methods: { excluded_payment_types: [{ id: "atm" }], installments: 1 },
    expires: true,
    expiration_date_to: enMexico(d.venceEn),
    date_of_expiration: enMexico(new Date(d.venceEn.getTime() + 48 * 3600_000)),
    notification_url: d.notificacion,
  }, { "X-Idempotency-Key": d.intentoId });
  if (!r.ok) return r;
  const id = txt(r.json.id), url = txt(r.json.init_point);
  return id && url ? { ok: true, id, url } : { ok: false, error: "respuesta sin id o init_point" };
}

/** Respaldo del aviso: lee el pago por su id. */
export async function consultarPago(
  pagoId: string,
  token: string,
  f: typeof fetch = fetch,
): Promise<{ ok: true; estado: string; referencia: string | null; monto: number; moneda: string; aprobadoEl: string | null } | Falla> {
  const r = await llamar("GET", `/v1/payments/${encodeURIComponent(pagoId)}`, token, f);
  if (!r.ok) return r;
  const j = r.json;
  return {
    ok: true, estado: String(j.status ?? ""), referencia: txt(j.external_reference),
    monto: Number(j.transaction_amount), moneda: String(j.currency_id ?? ""), aprobadoEl: txt(j.date_approved),
  };
}
