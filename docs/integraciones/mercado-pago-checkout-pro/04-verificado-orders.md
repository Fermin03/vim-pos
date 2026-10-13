# Orders API para el pago en línea — verificado del 11 al 13 oct 2026

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

(Titulares SIN la verificación del banco; con ella encendida `APRO` deja de aprobar: ver más abajo.)

| Titular de prueba | Motivo en `details` (tras «: ») |
|---|---|
| FUND | `insufficient_amount` |
| SECU | `bad_filled_card_data` |
| EXPI | `bad_filled_card_data` (igual que SECU: no se distinguen) |
| CALL | `required_call_for_authorize` |
| LOCK | `card_disabled` |
| OTHE | `rejected_by_issuer` |

**Más comprobado sobre el cobro (segunda tanda, 11 oct 2026):**

- **Débito funciona**: tarjeta de prueba `5579 0534 6148 2647` con
  `payment_method: { id: "debmaster", type: "debit_card" }` → 201 `processed` / `accredited`.
- **El 201 trae `user_id` (texto) y `currency: "MXN"`**: el aprobado se verifica en la misma respuesta.
- **La respuesta devuelve el token de la tarjeta** en `transactions.payments[0].payment_method.token`
  (más `installment_amount` y `transaction_security: { validation: "never" }`). Ninguna respuesta
  cruda de Mercado Pago se guarda ni se registra: solo los campos que extrae `decidirOrden`
  (hay una prueba que lo comprueba en `pago-flujo.test.ts`).
- **Token de tarjeta inventado o ya usado → 402 `failed` con motivo `invalid_card_token`** (no es
  un 400). No es un rechazo del banco: la tienda contesta `PAGO_NO_PROCESADO`.
- **`type` que no corresponde al `id`** (p. ej. `debmaster` con `credit_card`) → **400**
  `{"errors":[{"code":"property_value","message":"Invalid value for property","details":["'$.transactions.payments[0].payment_method.id' - value must be one of 'amex', 'master', 'visa'"]}]}`.
  Ids de crédito válidos en México: `amex`, `master`, `visa`. Débito visto: `debmaster` (`debvisa`
  existe en el catálogo de medios).

**En revisión → 201** con `status: "processing"`, `status_detail: "in_process"` (titular CONT). No
existe `binary_mode`. `POST /v1/orders/{id}/cancel` contesta **409 `cannot_cancel_order`** («must be
in 'action_required' or 'created'»): una orden `processing` no se puede cancelar. (Ese mensaje no
es de fiar para `action_required`: una orden que espera el reto del banco tampoco se deja; ver
«La verificación del banco».)

**En revisión del antifraude → 201 con `status: "in_review"`** (VISTO EN PRODUCCIÓN el 12 oct 2026,
cobro real con tarjeta real; no se ha reproducido en la cuenta de prueba). `POST /v1/orders`
devolvió una orden `in_review` y **~5 s después llegó el aviso `order.failed`**, con el que el
pedido se cerró bien. Se trata igual que `processing`: pendiente, viva, no se cancela; la resuelven
el aviso, `confirmar_pago` y el barrido. (Hasta ese día el código no conocía el estado y lo
registraba como `INCIDENTE (estado desconocido: in_review)`.) El `status_detail` que acompaña a
ese estado no se anotó: el código decide solo por `status`.

**`high_risk`** (VISTO EN PRODUCCIÓN el 12 oct 2026): tres cobros reales seguidos se rechazaron con
ese motivo. No es el banco: es el antifraude de Mercado Pago. La tienda lo dice con su propio motivo
(`RIESGO`). Ese día la tienda bloqueaba en su CSP la huella de dispositivo de Mercado Pago y no
mandaba ni Device ID, ni datos del pagador, ni artículos (ver «Señales para el antifraude»).

## Señales para el antifraude (12 oct 2026)

**Aceptado por `POST /v1/orders` (verificado ese día contra la cuenta de prueba: 201 `processed`),
todo junto:** `description` (texto); `items: [{ title, unit_price: "25.00", quantity: 1 }]` (también
admite `external_code` y `category_id`); `payer.first_name`, `payer.last_name`,
`payer.phone: { area_code, number }`, `payer.address: { street_name, street_number, zip_code, city,
state }`; y la cabecera **`X-Meli-Session-Id`**.

Lo que manda la tienda (`cuerpoDeOrden`, `pago-mp.ts`):

- `description`: «Pedido <folio> en <negocio>».
- `items`: un artículo por renglón del pedido, más «Envío» y «Propina» si los hay. **La suma es
  exactamente `total_amount`**; si no cuadra, un solo artículo con la descripción y el total.
- `payer`: nombre partido (primera palabra / resto), teléfono con su lada (2 dígitos solo en 55, 56,
  33 y 81; 3 en las demás) y, a domicilio, la dirección.
- `X-Meli-Session-Id`: la huella del dispositivo que el navegador leyó de `MP_DEVICE_SESSION_ID`.

**SIN VERIFICAR contra Mercado Pago** (se armó con lo de arriba, pero estas combinaciones exactas no
se han mandado): varios artículos con `quantity` mayor que 1; una lada de 2 dígitos con número de 8;
un pagador sin `last_name`; `payer.address` sin `neighborhood`; y una huella real de 231 caracteres
en la cabecera.

**La huella del dispositivo, en el navegador (VISTO el 12 oct 2026, Chromium, public key de prueba):**

- MercadoPago.js (`sdk.mercadopago.com/js/v2`) **por sí solo NO deja `window.MP_DEVICE_SESSION_ID`**
  (la documentación dice que sí). Lo que hace es registrar el dispositivo: `POST
  api.mercadopago.com/v1/devices`, `api.mercadolibre.com/tracks` y dos balizas (`www.mercadolibre.com/jms/lgz`
  y `www.mercadolivre.com/jms/mlb`).
- Con el script de seguridad `https://www.mercadopago.com/v2/security.js` (atributo `view="checkout"`)
  sí aparece: un texto `armor.` + hexadecimales, de **231 caracteres**. Pide `POST
  api.mercadopago.com/v1/device_sessions`.
- La tienda carga ese script solo en la pantalla de la tarjeta.

## La verificación del banco, 3D Secure (12 y 13 oct 2026)

Todo lo de esta sección se comprobó esos días con llamadas reales contra la cuenta de prueba y con
la página del reto abierta en un navegador.

**Pedirla.** El cuerpo de siempre más

```json
"config": { "online": { "transaction_security": { "validation": "on_fraud_risk", "liability_shift": "required" } } }
```

Sin ese `config` la orden nace con `transaction_security.validation: "never"`: cuando el antifraude
duda, solo puede rechazar (`high_risk`). Con `validation: "always"` la respuesta es igual que con
`on_fraud_risk`.

**Con reto → 201**, y la orden NO está cobrada ni rechazada:

```json
{ "id": "ORD…", "status": "action_required", "status_detail": "pending_challenge",
  "transactions": { "payments": [ { "status": "action_required", "status_detail": "pending_challenge",
    "payment_method": { "id": "master", "type": "credit_card", "transaction_security": {
      "id": "<uuid>", "validation": "on_fraud_risk", "liability_shift": "required",
      "url": "https://www.mercadopago.com.mx/auth/card/validation/pages/remedies/<uuid>?display_mode=self_hosted&guest_token=<uuid>" } } } ] } }
```

- **`GET /v1/orders/{id}` sigue devolviendo esa `url`** (con `id`, `validation` y `liability_shift`)
  mientras la orden siga en `pending_challenge`, también minutos después. Por eso la dirección no se
  guarda: quien la necesita otra vez (un reintento, una recarga) la saca de consultar la orden.
- La `url` lleva un `guest_token`: es del cliente dueño de ese pago. No va a la base, ni a
  `tienda_eventos`, ni a ningún log; solo en la respuesta a ese cliente.

**Titulares de prueba con la verificación encendida** (cualquier tarjeta de prueba):

| Titular | Qué pasa |
|---|---|
| `APRO-AUTH` | 201 `processed` / `accredited` directo, **sin reto** (sin `url`) |
| `APRO-CHOK` | 201 `action_required` / `pending_challenge` con `url`; al pulsar «Confirmar» la orden queda **`processed` / `accredited`** y `transaction_security` pasa a `{ id, type: "threeds", status: "authenticated", validation, liability_shift }`, ya **sin `url`** |
| `APRO` a secas | **También devuelve el reto**, y al confirmarlo la orden queda **`failed` / `failed`**: el pago `status: "failed"`, `status_detail: "3ds_challenge_failed"`, y `transaction_security.status: "not_authenticated"` |
| `OTHE-CHNO` | Según la documentación muestra el reto y falla. **Sin probar.** |

> **OJO:** con la verificación encendida, en la cuenta de prueba el titular `APRO` **ya no sirve
> para un aprobado**. Para un cobro aprobado: `APRO-AUTH` (sin reto) o `APRO-CHOK` (con reto).
>
> **Y tampoco hay rechazos directos (solo en la cuenta de prueba):** con `on_fraud_risk`, los
> titulares `FUND`, `OTHE` y `CALL` ya NO dan 402: devuelven 201 `action_required` /
> `pending_challenge`, como `APRO` a secas. Es cosa del ambiente de prueba (todo titular sin sufijo
> de 3DS pide reto), no una regla de producción. Para un rechazo directo con la verificación
> encendida **no hay titular verificado**; el 402 de la tabla de arriba se comprobó sin ella.

**La página del reto** (`https://www.mercadopago.com.mx`, la misma dirección que da la API):

- En el ambiente de prueba: título del documento «Remedies»; el aviso «Ambiente de pruebas. Esta es
  una pantalla de prueba de validación 3DS.»; «Validación de seguridad», un campo «Código de
  verificación» que ya trae un código, y el botón «Confirmar». Unos 370×300 px de contenido, más la
  franja de cookies de Mercado Pago abajo («Aceptar cookies» / «Configurar cookies»), que dentro de
  un marco también sale.
- **Al terminar (aprobado O fallido) le manda a su ventana padre un `postMessage`** con `origin`
  `https://www.mercadopago.com.mx` y `data` = **el TEXTO `{"status":"COMPLETE"}`** (una cadena
  JSON, no un objeto). Después la página queda en blanco. `COMPLETE` no dice si se aprobó.
- El resultado se refleja en `GET /v1/orders/{id}` en menos de ~10 segundos tras el `COMPLETE`.
- El contenido del reto vive en un marco anidado dentro de esa página. Lo que la página carga por
  dentro: `http2.mlstatic.com`, `matt.mercadopago.com.mx`, `api.mercadolibre.com`,
  `o11y-proxy-otel-frontend.meli.com`. Eso lo gobierna SU política, no la nuestra: a la CSP de la
  tienda le basta `frame-src https://www.mercadopago.com.mx`. En un reto real el banco pone su
  propia página en ese marco anidado; tampoco es nuestra CSP.

- **El marco SÍ carga embebido** en una página de otro origen (probado con un marco de 375×500: se
  pinta la pantalla del reto). Y **la misma `url` se puede abrir más de una vez** mientras el reto
  siga pendiente (una recarga de la tienda la vuelve a abrir).

**Una orden que espera el reto NO se puede cancelar.** `POST /v1/orders/{id}/cancel` (sin cuerpo y
con `{}`) sobre una orden `action_required` / `pending_challenge` contesta

```json
{ "errors": [ { "code": "unprocessable_content", "message": "Unprocessable Entity" } ] }
```

con **422**, recién creada (segundos) y con 40 minutos. La orden sigue igual. El mensaje del 409 de
más arriba («must be in 'action_required' or 'created'») **no se cumple** para un reto pendiente.
Cancelar una orden ya `processed` → 409 `cannot_cancel_order`.

**Abandono.** Un reto que nadie contesta **sigue `pending_challenge` al menos 45 minutos** (misma
`last_updated_date`, con su `url`). No se sabe cuándo lo vence Mercado Pago: hay que asumir que
puede tardar horas y que **el cliente puede completarlo tarde** si conserva la página. Por eso la
tienda deja un reto de SU lado (cierra el pedido sin pago), no cancela nada allá, y sigue mirando
esa orden hasta su final: si acaba cobrada, la devuelve (ver `02-diseno.md`).

**Sin verificar de la verificación:** cuándo vence Mercado Pago por su cuenta un reto abandonado y
con qué estado y `status_detail` lo deja (el código acepta `failed`, `canceled` y `expired`); si en
producción la cancelación de un reto pendiente también da 422; qué aviso (`action`) llega al
resolverse el reto, y si llega alguno cuando se aprueba tarde; cómo se ve un reto real de un banco
dentro del marco, y si necesita permisos del marco (`allow`); un rechazo directo (402) con la
verificación encendida; y si un cobro real que antes salía `high_risk` ahora pide el reto.

## Consultar

- `GET /v1/orders/{id}`: funciona.
- `GET /v1/orders?external_reference=…` sin fechas → **400 `missing_required_params: begin_date and end_date`**.
- **Búsqueda por referencia (confirmada):**
  `GET /v1/orders?external_reference=<uuid>&begin_date=2026-10-11T00:00:00.000Z&end_date=2026-10-12T23:59:59.000Z`
  → **200** `{ "data": [ { …orden… } ], "paging": { … } }`. Las fechas van en RFC 3339, con o sin
  milisegundos; solo la fecha (`2026-10-11`) → 400 `invalid_search_params` («must be in RFC3339
  format (e.g., '2024-01-01T00:00:00Z')»). La lista viene **solo en `data`**.

## Qué trae una orden

Claves reales: `id, type, processing_mode, external_reference, total_amount, total_paid_amount,
country_code, user_id, status, status_detail, capture_mode, currency, created_date,
last_updated_date, integration_data, config, transactions`.

- **`user_id` identifica a la cuenta vendedora**, y llega **como texto** (`"3754297554"`).
- `currency: "MXN"`, `country_code: "MEX"`.
- `integration_data.application_id`: el id de la aplicación que la creó.
- **No trae `live_mode`.**

Por eso `decidirOrden` exige `user_id` igual a la cuenta de la conexión (como texto) y
`currency === "MXN"`, además de la referencia y el monto. Que una conexión de prueba no cobre en un
negocio real depende solo de la marca de la conexión.

## Devolver

`POST /v1/orders/{id}/refund`, **sin cuerpo** (total), con `X-Idempotency-Key`.

- Pedida ~2 s después del cobro: **422 `unprocessable_entity` «Post processing rejected the
  operation.»** Un minuto después: **201**, orden `refunded`; en `transactions.refunds` queda el
  primer intento con `status: "failed"` y el segundo `processed`.
- Repetir con la **misma** llave de idempotencia devolvió el **mismo 422 guardado**: la llave tiene
  que ser nueva en cada intento.
- Una orden devuelta queda `status: "refunded"`, `status_detail: "refunded"`, y el pago de dentro
  trae `refunded_amount: "138.00"`, `paid_amount` y `reference_id`.

## Sin probar

- Avisos (webhook) de órdenes online y su firma con la clave de la aplicación nueva.
- El mismo flujo con el token OAuth de un restaurante real.
- Renovar el token de la tienda con su refresh token, y si esa respuesta trae `public_key`.
- Nombre exacto del tópico de órdenes en «Webhooks» del panel.
