# Orders API para el pago en línea — verificado el 11 oct 2026

Hechos comprobados con llamadas reales contra la cuenta de prueba (vendedor de prueba `3754297554`,
aplicación gemela de «VIM POS Tienda»), con la Mastercard de prueba `5474 9254 3267 0366`, 11/30, 123
y un token de tarjeta creado con la public key de esa aplicación. Lo que no está aquí no está probado.

## Por qué Orders y por qué otra aplicación

- La aplicación «VIM POS» está declarada como **Pagos presenciales / Point** y Mercado Pago admite un
  solo producto por aplicación. Con sus credenciales, `POST /v1/payments` contesta
  **401 `Unauthorized use of live credentials` (code 7)** aunque el access token sea válido.
- El dueño creó **«VIM POS Tienda»** (Pagos online → Checkout API → API de Orders). Al crearla, el
  panel avisa que la **API de Payments «será descontinuada pronto»**. Decisión: Orders API.
- Consecuencia: la tienda tiene **su propia conexión OAuth** por restaurante (otro client id/secret,
  otros tokens, otra public key, otra clave de firma de avisos). No comparte nada con la terminal.

## Cobrar

`POST https://api.mercadopago.com/v1/orders`, `Authorization: Bearer <access token>`,
`X-Idempotency-Key` obligatoria. Montos como **texto** con dos decimales.

```json
{
  "type": "online",
  "processing_mode": "automatic",
  "total_amount": "138.00",
  "external_reference": "<uuid nuestro>",
  "payer": { "email": "test_user_3753760462@testuser.com" },
  "transactions": { "payments": [ {
    "amount": "138.00",
    "payment_method": { "id": "master", "type": "credit_card", "token": "<token de tarjeta>", "installments": 1 }
  } ] }
}
```

**Aprobado → 201**

```json
{ "id": "ORDTST01M4P8JX8C82XV8G7EB2A16YAC", "status": "processed", "status_detail": "accredited",
  "total_amount": "138.00", "total_paid_amount": "138.00", "external_reference": "…",
  "capture_mode": "automatic_async",
  "transactions": { "payments": [ { "id": "PAY01M4P8JX8TKPS5B2ECXP875P89", "status": "processed",
    "status_detail": "accredited", "payment_method": { "id": "master", "type": "credit_card" } } ] } }
```

**Rechazado → 402**, sin objeto de orden:

```json
{ "errors": [ { "code": "failed", "message": "The following transactions failed",
  "details": [ "PAY01M4P8KB8MM494BGX78592RQMQ: insufficient_amount" ] } ] }
```

| Titular de prueba | Motivo en `details` (tras «: ») |
|---|---|
| FUND | `insufficient_amount` |
| SECU | `bad_filled_card_data` |
| EXPI | `bad_filled_card_data` (igual que SECU: no se distinguen) |
| CALL | `required_call_for_authorize` |
| LOCK | `card_disabled` |
| OTHE | `rejected_by_issuer` |

**En revisión → 201** con `status: "processing"`, `status_detail: "in_process"` (titular CONT). No
existe `binary_mode`. `POST /v1/orders/{id}/cancel` contesta **409 `cannot_cancel_order`** («must be
in 'action_required' or 'created'»): una orden `processing` no se puede cancelar.

## Consultar

- `GET /v1/orders/{id}`: funciona.
- `GET /v1/orders?external_reference=…` → **400 `missing_required_params: begin_date and end_date`**.
  El formato de esas fechas no está probado.

## Devolver

`POST /v1/orders/{id}/refund`, **sin cuerpo** (total), con `X-Idempotency-Key`.

- Pedida ~2 s después del cobro: **422 `unprocessable_entity` «Post processing rejected the
  operation.»** Un minuto después: **201**, orden `refunded`; en `transactions.refunds` queda el
  primer intento con `status: "failed"` y el segundo `processed`.
- Repetir con la **misma** llave de idempotencia devolvió el **mismo 422 guardado**: la llave tiene
  que ser nueva en cada intento.

## Sin probar

- Avisos (webhook) de órdenes online y su firma con la clave de la aplicación nueva.
- El mismo flujo con el token OAuth de un restaurante real.
- Tarjetas de débito (`type: "debit_card"`, supuesto).
- Qué campo de la orden identifica a la cuenta vendedora y si trae `live_mode`.
- Nombre exacto del tópico de órdenes en «Webhooks» del panel.
