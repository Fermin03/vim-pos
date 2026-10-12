# Checkout Pro de Mercado Pago (México) — resumen de la API

Fecha de consulta: **11 de octubre de 2026**. Fuente: documentación oficial de Mercado Pago México
(`mercadopago.com.mx/developers`) y su centro de ayuda. Nada de este documento sale de blogs.

Cómo se leyó: cada página de la documentación tiene una versión en texto plano agregando `.md` a la URL
(por ejemplo `.../checkout-pro-preferences/overview.md`). Esa versión llega en inglés aunque la ruta diga
`/es/`; aquí está traducida. Los JSON y cURL están copiados tal cual. Cuando algo no aparece en la
documentación dice **«no confirmado en la documentación»** y se repite en la lista final.

Abreviaturas de las URL base:

- `DOCS-P` = `https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences`
- `DOCS-O` = `https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-orders`
- `REF-P` = `https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro-preferences`
- `REF-O` = `https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro`

---

## 1. Preferences API o Orders API

**Qué dice la documentación**

- Las dos aparecen en el menú de México como productos vigentes: «Checkout Pro (vía Preferences API)» y
  «Checkout Pro (vía Orders API)». Las dos listan MX en «Disponibilidad por país».
  (`DOCS-P/overview`, `DOCS-O/overview`)
- **Ninguna página dice cuál se recomienda para una integración nueva.** No hay aviso de «legacy» sobre
  Preferences para Checkout Pro. (La etiqueta «legacy» sí aparece, pero para *Checkout API vía Payments* y
  para *Point legacy*, en la tabla de eventos de `DOCS-P/additional-content/notifications/webhooks`.)
- La de Orders es la más nueva: sus ejemplos de respuesta traen fechas de mayo de 2026 y habla de
  credenciales de producción, checklist de salida a producción y medición de calidad propia
  (`DOCS-O/go-to-production`, `DOCS-O/integration-quality`). Es decir, está en producción y disponible en MLM.

**Diferencias prácticas**

| Tema | Preferences API | Orders API |
|---|---|---|
| Crear | `POST /checkout/preferences` | `POST /v1/orders` con `type: "online"`, `processing_mode: "manual"` |
| Idempotencia al crear | No documentada | `X-Idempotency-Key` obligatoria (1 a 128 caracteres) |
| Adónde mandar al comprador | `init_point` | `checkout_url` |
| Qué se consulta | El **pago**: `GET /v1/payments/{id}` | La **order**: `GET /v1/orders/{id}` |
| Webhook | Tópico `payment` (y opcional `merchant_order`) | Evento «Order (Mercado Pago)», `type: "order"` |
| `notification_url` por cobro | **Sí**, campo de la preferencia | **No aparece** en la referencia de crear order; solo la URL configurada en la aplicación |
| Reembolso | `POST /v1/payments/{id}/refunds` | `POST /v1/orders/{order_id}/refund` |
| Cancelación | `PUT /v1/payments/{id}` con `status: "cancelled"` | `POST /v1/orders/{order_id}/cancel` |
| Excluir medios | `payment_methods.excluded_payment_types` / `excluded_payment_methods` / `installments` | `config.payment_method.not_allowed_types` / `not_allowed_ids` / `max_installments` |
| Guía de marketplace con OAuth | Existe (`DOCS-P/how-tos/integrate-marketplace`) | **No existe** la página equivalente (404) |
| Estados | Los del pago (`approved`, `rejected`, ...) | Los de la order (`processed`, `failed`, ...) |

Fuentes: `DOCS-O/create-order`, `REF-O/create-order/post`, `REF-P/create-preference/post`,
`DOCS-O/notifications`, `DOCS-P/payment-notifications`, `DOCS-O/refunds-cancellations`,
`DOCS-P/additional-settings/refunds-and-cancellations`.

**Recomendación para VIM POS: Preferences API.**

1. Es la única de las dos con guía oficial de marketplace usando el token OAuth del vendedor.
2. Tiene `notification_url` por cobro, que la propia documentación describe como lo adecuado para
   «integraciones que funcionan como plataforma de pagos para múltiples vendedores»
   (`DOCS-P/payment-notifications`). Con eso el webhook de la tienda queda separado del de las terminales.
3. Lo que necesitamos después (consultar, reembolsar, cancelar) está documentado sobre el pago, con
   ejemplos y lista de errores.

Lo que se pierde: la idempotencia al crear y la unificación con Point si las terminales ya usan Orders.
Si más adelante se quiere unificar, primero hay que probar en sandbox que `POST /v1/orders` con
`type: "online"` funciona con un token OAuth de vendedor, porque eso **no está confirmado en la
documentación**.

---

## 2. Crear el cobro con el token OAuth del vendedor, sin comisión

**Endpoint:** `POST https://api.mercadopago.com/checkout/preferences` con
`Authorization: Bearer <access_token del vendedor>`. (`REF-P/create-preference/post`)

La guía de marketplace dice que se sigue el flujo normal del checkout usando «necesariamente un access
token por cada vendedor, obtenido por OAuth», y que la comisión del marketplace se fija con
`marketplace_fee`. (`DOCS-P/how-tos/integrate-marketplace`)

**Comisión para nosotros: omitir `marketplace_fee`.** La referencia dice que su valor por defecto es 0 y
que «solo puede enviarse si también se definió un marketplace válido; de lo contrario la petición falla».
No hace falta mandarlo en 0. Como el token es del vendedor, el `collector_id` es el restaurante y el dinero
cae en su cuenta.

**Cuerpo que usaríamos** (todos los campos existen en la referencia; el conjunto es nuestro, no un ejemplo
copiado):

```json
{
  "items": [
    { "id": "pedido-123", "title": "Pedido en Knock-Out Burger", "quantity": 1, "currency_id": "MXN", "unit_price": 245.50 }
  ],
  "external_reference": "pedido_8f3a2c",
  "back_urls": {
    "success": "https://pedidos.vimpos.com.mx/.../pago/ok",
    "pending": "https://pedidos.vimpos.com.mx/.../pago/pendiente",
    "failure": "https://pedidos.vimpos.com.mx/.../pago/error"
  },
  "auto_return": "approved",
  "notification_url": "https://<proyecto>.supabase.co/functions/v1/<funcion>",
  "statement_descriptor": "KNOCKOUT",
  "binary_mode": true,
  "expires": true,
  "expiration_date_from": "2026-10-11T12:00:00.000-06:00",
  "expiration_date_to": "2026-10-11T12:30:00.000-06:00",
  "payment_methods": {
    "excluded_payment_types": [ { "id": "ticket" }, { "id": "atm" }, { "id": "bank_transfer" } ],
    "installments": 1
  },
  "metadata": {}
}
```

Reglas de cada campo según la referencia (`REF-P/create-preference/post`):

| Campo | Regla |
|---|---|
| `items[]` | `title`, `quantity`, `unit_price` (dos decimales o ninguno), `currency_id`. No hay campo de «monto total»: el total sale de `unit_price × quantity`. Un solo renglón con el total es válido. |
| `external_reference` | Máximo 64 caracteres; solo letras, números, guion y guion bajo. |
| `back_urls` | `success`, `pending`, `failure`. **HTTPS obligatorio**; una URL en HTTP se descarta en silencio. No acepta `localhost` ni `127.0.0.1`. |
| `auto_return` | `approved` o `all`. La espera antes de redirigir es de hasta 40 segundos y no se puede cambiar. |
| `notification_url` | HTTPS, máximo 248 caracteres. Mercado Pago **no la valida**; si está mal, simplemente no llega nada. |
| `statement_descriptor` | Hasta 13 caracteres; es lo que ve el comprador en su estado de cuenta. |
| `binary_mode` | Booleano. Ver sección 8. |
| `expires`, `expiration_date_from`, `expiration_date_to` | Vigencia de la preferencia, formato ISO 8601 con zona (`2022-11-17T09:37:52.000-04:00`). |
| `date_of_expiration` | Es otra cosa: vencimiento de pagos **en efectivo**. No nos aplica si excluimos efectivo. (`DOCS-P/additional-settings/expiration-date`) |
| `metadata` | JSON libre que se guarda en el pago. |

Respuesta (recortada del ejemplo oficial):

```json
{
  "collector_id": 202809963,
  "client_id": "6295877106812064",
  "marketplace": "MP-MKT-6295877106812064",
  "marketplace_fee": 0,
  "binary_mode": false,
  "external_reference": "string",
  "notification_url": "https://notificationurl.com",
  "id": "202809963-920c288b-4ebb-40be-966f-700250fa5370",
  "init_point": "https://www.mercadopago.com/mla/checkout/start?pref_id=202809963-920c288b-4ebb-40be-966f-700250fa5370",
  "sandbox_init_point": "https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=..."
}
```

- Se redirige al comprador a **`init_point`**. Sobre `sandbox_init_point` la referencia dice: «No uses
  este parámetro. Para pruebas de integración usa init_point».
- `client_id` es el ID de la aplicación que creó la preferencia.

Errores útiles al crear: `collector_does_not_comply_with_current_regulation` (la cuenta del vendedor tiene
pendiente validar identidad: hay que mostrarle un mensaje claro al restaurante), `invalid_back_urls`,
`invalid_marketplace_fee`, `invalid_access_token`.

**Scopes y permisos.** La referencia de `POST /oauth/token` solo reconoce tres scopes:
`offline_access`, `write` y `read`; el ejemplo de respuesta trae `"scope": "read write offline_access"`.
No existe un scope por producto.
(`https://www.mercadopago.com.mx/developers/es/reference/authentication/oauth/_oauth_token/post`)
Que una aplicación dada de alta para Point pueda crear preferencias de Checkout Pro sin tocar nada en el
panel **no está confirmado en la documentación**; al crear una aplicación el panel pide elegir «la solución
a integrar». Hay que probarlo.

Duración de los tokens: el `access_token` de OAuth dura 180 días y el `refresh_token` 6 meses.
(`https://www.mercadopago.com.mx/developers/es/docs/security/oauth/creation`)

**Equivalente en Orders API** (por si se cambia de decisión), copiado de `DOCS-O/create-order`:

```bash
curl -X POST \
    -H 'accept: application/json' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer ENV_ACCESS_TOKEN' \
    -H 'X-Idempotency-Key: UNIQUE_KEY' \
    'https://api.mercadopago.com/v1/orders' \
    -d '{
  "type": "online",
  "processing_mode": "manual",
  "total_amount": "1000.00",
  "external_reference": "order_pro_123",
  "payer": { "email": "buyer@email.com" },
  "items": [
    { "title": "My product", "unit_price": "1000.00", "quantity": 1, "unit_measure": "unit", "total_amount": "1000.00" }
  ]
}'
```

En Orders los montos son **cadenas**, `payer.email` es obligatorio, y la vigencia es `expiration_time` en
duración ISO 8601 (`"P1D"`); si se omite vale 24 horas en producción y 1 hora en sandbox.
(`REF-O/create-order/post`)

---

## 3. Dejar solo medios que se aprueban al instante

Campos de la preferencia (`DOCS-P/additional-settings/payment-methods`, `REF-P/create-preference/post`):

```json
"payment_methods": {
    "excluded_payment_methods": [ { "id": "master" } ],
    "excluded_payment_types": [ { "id": "ticket" } ]
}
```

- `excluded_payment_types[].id`: excluye un **tipo** completo.
- `excluded_payment_methods[].id`: excluye un medio o marca concreta.
- `installments`: número **máximo** de mensualidades. El error `invalid_payment_methods` dice que debe ser
  un número entre 1 y 36. Con `1` no se ofrecen meses.
- `default_installments`: mensualidades preseleccionadas.
- **El dinero en cuenta (`account_money`) no se puede excluir**, lo cual nos conviene.

Identificadores confirmados para México, tomados de las guías de Checkout API de MX
(`https://www.mercadopago.com.mx/developers/es/docs/checkout-api-orders/payment-integration/websites/other-payment-methods`
y `.../websites/spei-transfers`):

| Medio | `payment_method_id` | `payment_type_id` |
|---|---|---|
| OXXO | `oxxo` | `ticket` |
| Paycash | `paycash` | `ticket` |
| BBVA Bancomer | `bancomer` | `atm` |
| Banamex | `banamex` | `atm` |
| Transferencia SPEI | `clabe` | `bank_transfer` |

Tipos que lista la referencia del pago: `ticket`, `bank_transfer`, `atm`, `credit_card`, `debit_card`
(la lista sigue, pero no la capturé completa).

**Configuración propuesta:** excluir `ticket`, `atm` y `bank_transfer`, y poner `installments: 1`. Quedan
tarjeta de crédito, tarjeta de débito y dinero en cuenta.

Puntos sin confirmar en la documentación:

- La lista completa de tipos e identificadores activos en MX. La fuente oficial es
  `GET https://api.mercadopago.com/v1/payment_methods` con un token de México (`REF-P/payment-methods/get`);
  no lo pude llamar sin token. Hay que ejecutarlo una vez y revisar si aparecen otros tipos
  (Santander, vales de despensa, tarjetas prepago, «Meses sin Tarjeta» / crédito de Mercado Pago).
- El overview menciona «Meses sin Tarjeta» y la página de comisiones menciona «Compra ahora, paga después»
  y «vale de despensa» como medios de Checkout. Cómo excluirlos en Preferences **no está documentado**.
  La guía de Orders dice que las billeteras se excluyen con el tipo `digital_currency`
  (`DOCS-O/additional-settings/exclude-payment-methods`); no está confirmado que ese mismo valor sirva en
  Preferences.
- Si `installments: 1` también oculta los meses **con** intereses. La documentación solo dice «máximo de
  mensualidades».

Existe además `purpose: "wallet_purchase"`, que restringe el checkout a usuarios con cuenta de Mercado Pago
y quita efectivo y transferencia, pero también quita el pago como invitado; no nos sirve.
(`DOCS-P/additional-settings/mp-wallet`)

---

## 4. Apple Pay y Google Pay

**Conclusión: no se le puede prometer al cliente.**

- **Checkout Pro:** ninguna página de Checkout Pro de México (ni Preferences ni Orders) menciona Apple Pay
  o Google Pay. Los medios que enumera el overview son: tarjeta de crédito o débito, transferencia SPEI,
  OXXO, Paycash, Banamex, Santander, BBVA Bancomer, cuenta de Mercado Pago y Meses sin Tarjeta.
  (`DOCS-P/overview`, `DOCS-O/overview`). Busqué las dos frases en el HTML completo de esas páginas, menú
  incluido, y en las de Brasil y Argentina: cero apariciones.
- **Apple Pay sí existe en México, pero como producto aparte** dentro del flujo de **Checkout API**, no de
  Checkout Pro: `https://www.mercadopago.com.mx/developers/es/docs/apple-pay/overview`. Lo que dice:
  - «Debes contactar a nuestro equipo comercial para habilitar tu cuenta» (aviso al inicio de la página).
  - Requiere obtener certificados de Apple Developer.
  - Web: solo Safari en iOS y macOS. Solo Visa y Mastercard. No disponible en Android.
  - El pago lo crea nuestro backend con un token; no hay redirección.
- **Google Pay:** no hay documentación para México. `.../docs/google-pay/overview` responde 404 y no
  aparece en ningún menú de MX.

Sin confirmar: si la página alojada de Checkout Pro le muestra por su cuenta un botón de Apple Pay o
Google Pay al comprador en algún dispositivo. La documentación no lo dice ni lo niega. Si en una prueba
real aparece, es un extra; no es algo que controlemos ni que podamos activar.

Para ofrecer Apple Pay habría que integrar Checkout API (otra integración, con formulario propio),
habilitación comercial por cada cuenta y certificados de Apple. Cómo se combina eso con tokens OAuth de
cada restaurante no está documentado.

---

## 5. Notificaciones (webhooks)

### Qué tópico llega

- Para Checkout Pro vía Preferences el evento es **Pagos**, tópico `payment`. Se notifica cuando el pago
  se crea y cada vez que cambia de estado. (`DOCS-P/payment-notifications`)
- Opcional: `merchant_order` («Órdenes comerciales», `topic_merchant_order_wh`), que avisa de creación,
  cierre o expiración de la orden comercial. (`DOCS-P/additional-content/notifications/additional-info`)
- En Orders API el evento es «Order (Mercado Pago)» con `type: "order"`. (`DOCS-O/notifications`)

Otros tópicos que conviene conocer (`DOCS-P/additional-content/notifications/webhooks`):
`topic_chargebacks_wh` (contracargos), `topic_claims_integration_wh` (reclamos), `mp-connect`
(vinculación y desvinculación OAuth) y `stop_delivery_op_wh` (alerta de fraude: la documentación pide
cancelar el pedido sin entregarlo, y esa notificación **no se reintenta**).

### Dos formas de configurarlas

1. **En la aplicación** (Tus integraciones > Webhooks > Configurar notificaciones). Tiene URL de modo
   prueba y de modo producción. Al guardar se genera la **clave secreta**.
2. **Por cobro**, con `notification_url` en la preferencia.

«Las URL configuradas durante la creación de un pago tienen prioridad sobre las configuradas en Tus
integraciones.» (`DOCS-P/payment-notifications`)

Trampa documentada: «Los pagos de prueba, creados con credenciales de prueba, **no envían
notificaciones**. La única forma de probar la recepción es mediante la configuración en Tus
integraciones» (y su botón «Simular»). (`DOCS-P/payment-notifications`)

### Cuerpo de la notificación

```json
{
 "id": 12345,
 "live_mode": true,
 "type": "payment",
 "date_created": "2015-03-25T10:04:58.396-04:00",
 "user_id": 44444,
 "api_version": "v1",
 "action": "payment.created",
 "data": {
     "id": "999999999"
 }
}
```

- `user_id`: «identificador del vendedor». Sirve para saber de qué restaurante es.
- `action`: `payment.created` o `payment.updated`.
- `data.id`: ID del pago. También llega en la URL: `?data.id=123456&type=payment`.
- Para distinguir cuentas la documentación sugiere además agregar un parámetro propio a la URL
  (`?cliente=nombre-del-vendedor`).

### Validar la firma

Cabeceras: `x-signature: ts=1742505638683,v1=ced36ab6...` y `x-request-id: bb56a2f1-...`.

Pasos sin SDK (`DOCS-P/payment-notifications`):

1. Separar `x-signature` por comas y sacar `ts` y `v1`.
2. Armar el manifiesto: `id:{data.id};request-id:{x-request-id};ts:{ts};`
   - `data.id` se toma **de los query params de la URL**, no del cuerpo.
   - Si `data.id` trae letras, se pasa a **minúsculas**.
   - Si falta `data.id` o `x-request-id`, se quita ese par del manifiesto.
3. Calcular `HMAC-SHA256(clave secreta, manifiesto)` en hexadecimal.
4. Comparar con `v1` en tiempo constante.
5. Si coincide responder 200; si no, 401.

Ejemplo oficial en JavaScript:

```js
const xSignature = req.headers['x-signature'] ?? '';
const xRequestId = req.headers['x-request-id'] ?? '';
const dataId     = (req.query['data.id'] ?? '').toLowerCase();

let ts, hash;
for (const part of xSignature.split(',')) {
    const eq  = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 'ts') ts   = val;
    if (key === 'v1') hash = val;
}

const parts = [];
if (dataId)     parts.push(`id:${dataId}`);
if (xRequestId) parts.push(`request-id:${xRequestId}`);
parts.push(`ts:${ts}`);
const manifest = parts.join(';') + ';';

const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
```

**Qué clave:** la clave secreta es **por aplicación**. Se genera al guardar la configuración de Webhooks
en Tus integraciones, no caduca, y se puede renovar con «Restablecer». Es una sola para todos los
vendedores conectados a nuestra aplicación.

`ts` permite además rechazar notificaciones viejas (tolerancia de retraso), según `DOCS-O/notifications`.

### Reintentos

- Hay que responder `200` o `201` en menos de **22 segundos**.
- Si no, reintenta: 0 min, 15 min, 30 min, 6 h, 48 h, 96 h, 96 h, 96 h.
(`DOCS-P/payment-notifications`)

Por eso la función debe responder rápido y ser idempotente: la misma notificación puede llegar varias
veces y fuera de orden.

### Cuando el cobro lo creó un token OAuth de vendedor

Lo que sí dice la documentación:

- Si la preferencia lleva `notification_url`, esa URL gana.
- La notificación trae `user_id` del vendedor.
- La configuración por cobro se describe como apta para plataformas con múltiples vendedores.

Lo que **no está confirmado en la documentación**:

- Que las notificaciones enviadas a una `notification_url` de preferencia traigan `x-signature`. La
  documentación presenta la validación de firma como ventaja de la configuración en Tus integraciones y
  no la menciona en la sección de `notification_url`.
- Que, sin `notification_url`, los pagos de vendedores conectados por OAuth lleguen a la URL configurada
  en **nuestra** aplicación. Es lo esperable (ya ocurre con Point), pero ninguna página de Checkout Pro lo
  afirma.

Mientras no se pruebe, la confirmación del pago no debe depender de la firma: la notificación solo es un
aviso, y la verdad se obtiene consultando el pago.

### Consultar el pago

`GET https://api.mercadopago.com/v1/payments/{id}` con el token del vendedor. (`REF-P/get-payment/get`)

Respuesta de ejemplo (recortada):

```json
{
  "id": 1,
  "date_approved": "2017-08-31T11:26:38.000Z",
  "money_release_date": "2017-09-14T11:26:38.000Z",
  "payment_method_id": "master",
  "payment_type_id": "credit_card",
  "status": "approved",
  "status_detail": "accredited",
  "currency_id": "MXN",
  "live_mode": false,
  "collector_id": 2,
  "external_reference": "MP0001",
  "transaction_amount": "24.50",
  "transaction_amount_refunded": 0,
  "transaction_details": {
    "net_received_amount": 250,
    "total_paid_amount": "50.00"
  },
  "captured": false,
  "binary_mode": false,
  "installments": 1
}
```

Qué comprobar antes de mandar el pedido a la caja:

| Campo | Comprobación |
|---|---|
| `status` | `approved` |
| `status_detail` | `accredited` |
| `transaction_amount` | Igual al total del pedido |
| `currency_id` | `MXN` |
| `external_reference` | Igual a nuestro pedido |
| `collector_id` | El `user_id` de Mercado Pago del restaurante dueño del pedido |
| `live_mode` | `true` en producción |

Aviso: en el ejemplo `transaction_amount` viene como cadena (`"24.50"`) aunque la referencia lo declara
número. Conviene convertir antes de comparar.

Con qué token se consulta en el modelo marketplace no está dicho de forma explícita para pagos. En Orders,
la tabla de errores dice que un 404 significa «verifica que el Access Token corresponda a quien creó la
order» (`DOCS-O/payment-management/integration-errors`), así que lo coherente es usar el del vendedor.

**Dos medios de pago en una compra.** El overview de MX anuncia «medios de pago personalizables con la
opción de dividir el total en 2 partes», y la página de notificaciones advierte que entonces «una sola
compra puede generar más de un `payment_id`» y pide conciliar con `merchant_order` antes de entregar.
La página que lo explica (`DOCS-P/additional-settings/pay-with-two-methods`) no carga para México, así que
no está confirmado si está activo en MLM ni cómo desactivarlo. Hay que diseñar para ello: sumar los pagos
aprobados del mismo `external_reference`, o consultar
`GET /merchant_orders/{id}` (`REF-P/merchant-orders/get-merchant-order/get`).

---

## 6. Regreso del comprador

`back_urls` y `auto_return` se describen en la sección 2. (`DOCS-P/configure-back-urls`)

Ejemplo oficial de la petición que llega a nuestra página:

```
GET /test?collection_id=106400160592&collection_status=rejected&payment_id=106400160592&status=rejected&external_reference=qweqweqwe&payment_type=credit_card&merchant_order_id=29900492508&preference_id=724484980-ecb2c41d-ee0e-4cf4-9950-8ef2f07d3d82&site_id=MLC&processing_mode=aggregator&merchant_account_id=null HTTP/1.1
```

| Parámetro | Significado |
|---|---|
| `payment_id` | ID del pago |
| `collection_id` | Mismo valor que `payment_id` |
| `status` | Estado del pago (`approved`, `rejected`, `pending`) |
| `collection_status` | Espejo de `status` |
| `external_reference` | Nuestra referencia |
| `payment_type` | Tipo de medio (`credit_card`, `ticket`, ...) |
| `merchant_order_id` | ID de la orden comercial |
| `preference_id` | ID de la preferencia |
| `site_id` | País de la cuenta del vendedor (`MLM` en México) |
| `processing_mode` | Modo de procesamiento |
| `merchant_account_id` | Cuenta del vendedor en contexto marketplace; `null` si no aplica |

**Por qué no confiar en ellos.** Es una petición GET que hace el navegador del comprador: cualquiera puede
escribir a mano `?status=approved&external_reference=...`. No va firmada. Además el comprador puede cerrar
la pestaña antes de volver (la redirección tarda hasta 40 segundos) o volver con el botón «Volver al
sitio». La documentación no lo dice con estas palabras, pero sí indica que el estado se actualiza por
notificaciones y que antes de acciones irreversibles hay que esperar el webhook
(`DOCS-O/payment-management/status/order-status`). Uso correcto: tomar `payment_id` de la URL, consultar
`GET /v1/payments/{id}` desde el servidor y decidir con eso.

---

## 7. Reembolsos y cancelaciones

### Reembolso

`POST https://api.mercadopago.com/v1/payments/{id}/refunds` (`REF-P/create-refund/post`)

- Cabecera **`X-Idempotency-Key` obligatoria** (sugieren UUID v4). Sin ella responde el error `4292`.
- **Total:** cuerpo vacío.
- **Parcial:** `{ "amount": 5 }`.

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/payments/{id}/refunds' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "amount": 5
  }'
```

Respuesta de ejemplo:

```json
{
  "id": 1009042015,
  "payment_id": 18552260055,
  "amount": 10,
  "source": [ { "id": "1003743392", "type": "collector" } ],
  "date_created": "2021-11-24T13:58:49.312-04:00",
  "refund_mode": "standard",
  "adjustment_amount": 0,
  "status": "approved"
}
```

Condiciones (`DOCS-P/additional-settings/refunds-and-cancellations`):

- **Plazo:** hasta 180 días después de la aprobación.
- **Saldo:** la cuenta del vendedor debe tener saldo disponible suficiente; si no, el reembolso se
  rechaza. Esto importa: si el restaurante ya retiró el dinero, nuestro reembolso automático puede fallar
  y hay que avisarle.
- **Destino:** con tarjeta de crédito vuelve al estado de cuenta; con otros medios, a la cuenta de Mercado
  Pago del comprador.
- **Dos medios de pago:** cada `payment_id` se reembolsa por separado.

Errores a manejar: `2063` (acción no válida para el estado actual del pago), `2024` / `15016` (pago
demasiado antiguo), `3024` (reembolso parcial no soportado para esta transacción), `2000` (pago no
encontrado), `401` (token inválido).

**Token:** el del vendedor. `source.type` distingue quién originó el reembolso; los valores posibles son
`Admin`, `Collector`, `BPP` y `Marketplace`. La referencia no dice explícitamente que el reembolso deba
hacerse con el token OAuth del vendedor, pero el pago es suyo y el dinero sale de su saldo.

Consultas: `GET /v1/payments/{id}/refunds` y `GET /v1/payments/{id}/refunds/{refund_id}`
(`REF-P/get-refunds/get`, `REF-P/get-refund/get`).

### Cancelación (pago aún no aprobado)

`PUT https://api.mercadopago.com/v1/payments/{payment_id}` (`REF-P/create-cancellation/put`)

```bash
curl -X PUT \
  'https://api.mercadopago.com/v1/payments/{payment_id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "status": "cancelled"
  }'
```

- Solo si el pago está en `pending`, `in_process` o `authorized`. En otro estado responde `2018`.
- El único valor aceptado es `cancelled`.
- La respuesta trae `status: "cancelled"` y `status_detail: "by_collector"`.
- Un pago pendiente que nadie confirma expira solo a los 30 días (`cancelled` / `expired`).

**Regla para nosotros:** `approved` → reembolsar; `pending` / `in_process` / `authorized` → cancelar;
`rejected` / `cancelled` / `refunded` → nada. Con `binary_mode: true` y sin medios en efectivo, casi nunca
debería existir un pago pendiente, pero el código debe cubrir el caso.

Si el comprador nunca pagó, no hay pago que cancelar: basta con que la preferencia expire.

En Orders API: `POST /v1/orders/{order_id}/refund` (cuerpo vacío = total; parcial con
`transactions[].id` y `transactions[].amount`) y `POST /v1/orders/{order_id}/cancel` (solo en `created` o
`action_required`); ambos con `X-Idempotency-Key`. (`REF-O/refund-order/post`, `DOCS-O/refunds-cancellations`)

---

## 8. Estados del pago

Valores de `status` (`REF-P/get-payment/get`):

| `status` | Significado | Cómo tratarlo |
|---|---|---|
| `approved` | Aprobado y acreditado | **Aprobado**: enviar el pedido a la caja |
| `authorized` | Autorizado, sin capturar | Pendiente (no debería ocurrir en nuestro flujo) |
| `pending` | El comprador no ha terminado de pagar | Pendiente |
| `in_process` | En revisión | Pendiente |
| `rejected` | Rechazado; el comprador puede reintentar | **Rechazado** |
| `cancelled` | Cancelado por una parte o expirado | Rechazado |
| `refunded` | Devuelto al comprador | Reembolsado |
| `charged_back` | Contracargo en la tarjeta | Incidente: avisar al restaurante |
| `in_mediation` | El comprador abrió una disputa | Incidente: avisar al restaurante |

`status_detail` relevantes: `accredited` (acreditado), `partially_refunded`, `pending_capture`,
`pending_contingency`, `pending_review_manual`, `pending_waiting_transfer`, `pending_waiting_payment`,
`by_collector`, `by_payer`, `by_admin`, `expired`.

Un pago `approved` puede pasar después a `refunded`, `charged_back` o `in_mediation`; cada cambio dispara
otra notificación `payment.updated`.

**`binary_mode`** (`DOCS-P/additional-settings/binary-mode`): con `true` el pago solo puede quedar
aprobado o rechazado. Lo que quedaría `pending` o `in_process` se **rechaza automáticamente**. La
documentación advierte que esto puede bajar la tasa de aprobación.

Para nuestro caso conviene activarlo: el pedido solo existe si el pago se aprueba en el momento, y un pago
que se apruebe media hora después obligaría a reembolsar.

En Orders API los estados son de la order (`DOCS-O/payment-management/status/order-status`):
`created`, `processing` (`in_process`, `pending_review_manual`), `processed` (`accredited`, `refunded`,
`partially_refunded`), `action_required` (`waiting_capture`), `failed` (con el motivo), `refunded`,
`canceled`. El modo binario allí se activa con `capture_mode: "automatic"`.

---

## 9. Pruebas

**Cuentas de prueba** (`DOCS-P/test-accounts`):

- Al crear la aplicación se crea sola una cuenta de prueba **vendedor**, y sus credenciales son las
  «credenciales de prueba». Por eso el Access Token de prueba también empieza con `APP_USR`.
- Tipos de cuenta: **Vendedor**, **Comprador** e **Integrador** (esta última «para integraciones en modelo
  marketplace»).
- Máximo 15 cuentas; no se pueden borrar.
- Vendedor y comprador deben ser **del mismo país**, y el país no se puede cambiar después.
- Se les puede asignar saldo ficticio, útil para probar el pago con dinero en cuenta.
- Si al iniciar sesión pide un código por correo, es el código de 6 dígitos que aparece en
  Tus integraciones > la aplicación > Cuentas de prueba.

**Tarjetas de prueba de México** (`DOCS-P/integration-test/test-purchases`):

| Tipo | Marca | Número | CVV | Vence |
|---|---|---|---|---|
| Crédito | Mastercard | 5474 9254 3267 0366 | 123 | 11/30 |
| Crédito | Visa | 4075 5957 1648 3764 | 123 | 11/30 |
| Crédito | American Express | 3711 803032 57522 | 1234 | 11/30 |
| Débito | Mastercard | 5579 0534 6148 2647 | 123 | 11/30 |
| Débito | Visa | 4189 1412 2126 7633 | 123 | 11/30 |

**Nombre del titular que fuerza cada resultado:**

| Nombre | Resultado |
|---|---|
| `APRO` | Pago aprobado |
| `OTHE` | Rechazado por error general |
| `CONT` | Pago pendiente |
| `CALL` | Rechazado, requiere llamar para autorizar |
| `FUND` | Rechazado por fondos insuficientes |
| `SECU` | Rechazado por código de seguridad inválido |
| `EXPI` | Rechazado por fecha de vencimiento |
| `FORM` | Rechazado por error en el formulario |
| `CARD` | Rechazado por falta de número de tarjeta |
| `INST` | Rechazado por mensualidades inválidas |
| `DUPL` | Rechazado por pago duplicado |
| `LOCK` | Rechazado por tarjeta deshabilitada |
| `CTNA` | Rechazado por tipo de tarjeta no permitido |
| `ATTE` | Rechazado por exceder intentos de PIN |
| `BLAC` | Rechazado por lista negra |
| `UNSU` | No soportado |
| `TEST` | Para aplicar reglas de monto |

`CONT` con `binary_mode: true` es la prueba clave: debe terminar rechazado.

**Trampas documentadas:**

1. Hacer las compras de prueba en **ventana de incógnito**, para no mezclar la sesión del vendedor con la
   del comprador.
2. Usar `init_point`, no `sandbox_init_point`.
3. Los pagos de prueba **no envían notificaciones a `notification_url`**; para probar el webhook hay que
   configurar la URL de modo prueba en Tus integraciones y usar «Simular».
4. `back_urls` y `notification_url` no aceptan `localhost`.
5. En Orders API, en sandbox el correo del pagador debe terminar en `@testuser.com`
   (error `invalid_email_for_sandbox`).
6. Con una cuenta de prueba no se puede entrar a «Credenciales de prueba» ni a «Calidad de integración»
   del panel.

**OAuth con cuentas de prueba:** la guía de OAuth solo dice que para obtener credenciales *sandbox* se
manda `"test_token": "true"` al pedir el token
(`https://www.mercadopago.com.mx/developers/es/docs/security/oauth/creation`). No hay una guía paso a paso
para probar Checkout Pro en modelo marketplace con cuentas de prueba, ni se explica el uso de la cuenta
«Integrador». **No confirmado en la documentación**: si el vendedor de prueba debe autorizar a la
aplicación real, y si el comprador de prueba puede pagarle a un vendedor de prueba conectado por OAuth.

---

## 10. Salir a producción y medición de calidad

**Salir a producción** (`DOCS-P/go-to-production`):

1. Activar las credenciales de producción de la aplicación (pide industria y sitio web).
2. Usar las credenciales de producción. En nuestro caso, los tokens OAuth de producción de cada restaurante.
3. Certificado SSL y HTTPS: obligatorio en producción.
4. Medir la calidad de la integración (marcado como opcional).

**Medición de calidad** (`DOCS-P/how-tos/integration-quality`):

- Evalúa cinco aspectos: experiencia del comprador, conciliación financiera, aprobación de pagos,
  escalabilidad y seguridad.
- Requiere un `payment ID` de un pago hecho con **credenciales de producción**.
- Hay medición manual (desde Tus integraciones) y una automática mensual.
- **Puntaje mínimo: 73.** Recomiendan 100.
- Ejemplos de acciones **obligatorias**: tener activas las notificaciones Webhooks y enviar
  `external_reference`.
- Ejemplos de acciones **recomendadas**: enviar todos los datos del comprador para mejorar la validación
  antifraude. En la práctica: `payer.email`, `payer.name`, `payer.surname`, teléfono, y en `items` el
  `id`, `title`, `description`, `category_id`, `quantity` y `unit_price`.
- Buenas prácticas (no puntúan): usar el SDK MercadoPago.js V2.

La lista exacta de campos que puntúan no está publicada; la da la herramienta al medir.

En Orders API (`DOCS-O/go-to-production`, `DOCS-O/integration-quality`) el checklist añade: order creada
con `checkout_url` válida, webhook de orders funcionando, `X-Idempotency-Key` implementada y flujos de
cancelación y reembolso probados. Su medición manual usa el Order ID de un pago de prueba de los últimos
7 días, y la automática corre del 1 al 7 de cada mes.

No hay un proceso de aprobación previa por parte de Mercado Pago para empezar a cobrar con Checkout Pro.
Si una aplicación con vendedores OAuth necesita algo adicional, **no está confirmado en la documentación**.

---

## 11. Comisiones y liberación del dinero

Fuente: centro de ayuda oficial, «¿Cuánto cuesta recibir pagos con Checkout?»,
`https://www.mercadopago.com.mx/ayuda/33399`, consultado el **11 de octubre de 2026**.

| Si te pagan con | Pagas | Dinero disponible en |
|---|---|---|
| Tarjeta de crédito, débito, «Compra ahora, paga después», saldo en Mercado Pago Wallet, vale de despensa y transferencias SPEI | 3.49% + $4.00 | Al instante |
| (mismos medios) | 3.19% + $4.00 | 14 días |
| (mismos medios) | 2.95% + $4.00 | 30 días |
| OXXO, depósitos y otros medios en efectivo | 3.79% + $4.00 | 3 días |

- La página dice: «Estas comisiones no incluyen retenciones o impuestos ajenos a Mercado Pago». No dice de
  forma expresa «+ IVA»; hay que asumir que el IVA va aparte y confirmarlo en el simulador de la cuenta.
- El plazo lo elige **cada vendedor** en la sección «Comisiones y MSI» de su cuenta. No es algo que
  nuestra integración decida.
- La guía de marketplace aclara el orden: primero se descuenta la comisión de Mercado Pago y después la
  del marketplace. Como nuestra comisión es cero, el restaurante recibe el total menos la comisión de
  Mercado Pago. (`DOCS-P/how-tos/integrate-marketplace`)
- En cada pago, `money_release_date` indica cuándo se libera y `transaction_details.net_received_amount`
  el neto recibido.

El costo de ofrecer meses sin intereses no lo revisé, porque los vamos a excluir.

---

## Sin confirmar

Nada de esto aparece en la documentación oficial consultada. Cada punto necesita una prueba en sandbox o
una pregunta a soporte de Mercado Pago antes de darlo por hecho.

1. **Cuál API recomienda Mercado Pago** para integraciones nuevas de Checkout Pro. Ninguna página lo dice.
2. **Orders API con token OAuth de vendedor** para Checkout Pro: no hay guía de marketplace en esa sección.
3. **Aplicación creada para Point creando preferencias de Checkout Pro**: no hay scopes por producto
   (solo `read`, `write`, `offline_access`), pero no se afirma que funcione sin cambiar nada en el panel.
4. **Firma `x-signature` en notificaciones enviadas a `notification_url`** de una preferencia, y con qué
   clave. La validación de firma solo está documentada para la configuración en Tus integraciones.
5. **Webhook de la aplicación para pagos de vendedores OAuth** cuando la preferencia no lleva
   `notification_url`: esperable, pero no escrito en las páginas de Checkout Pro.
6. **Con qué token consultar y reembolsar** en el modelo marketplace. Lo coherente es el del vendedor; la
   referencia de pagos no lo dice de forma expresa.
7. **Lista completa de medios y tipos de pago activos en México.** Hay que llamar
   `GET /v1/payment_methods` con un token de MX. Confirmados: `oxxo` y `paycash` (`ticket`), `bancomer` y
   `banamex` (`atm`), `clabe` (`bank_transfer`).
8. **Cómo excluir «Meses sin Tarjeta» / «Compra ahora, paga después» y vales de despensa** en Preferences,
   y si esos medios se aprueban al instante.
9. **Si `installments: 1` oculta también los meses con intereses.**
10. **Apple Pay o Google Pay dentro de la página de Checkout Pro.** No documentado. Apple Pay solo está
    documentado en Checkout API con habilitación comercial; Google Pay no tiene documentación en México.
11. **Pago con dos medios en México** (dos `payment_id` por compra): el overview lo anuncia, la página de
    detalle no carga para MX, y no se sabe cómo desactivarlo.
12. **Probar el flujo completo con cuentas de prueba y OAuth**, incluido el papel de la cuenta
    «Integrador».
13. **Requisitos extra de salida a producción** para aplicaciones que cobran a nombre de terceros.
14. **Si la comisión publicada lleva IVA adicional.** La página solo dice que no incluye impuestos ajenos
    a Mercado Pago.
15. **Inconsistencias dentro de la propia documentación de Orders:** el tópico aparece como `order`,
    `orders` y `orders_v2` según la página; y `capture_mode: "automatic"` se presenta como modo binario
    en una página mientras la referencia dice que en Checkout Pro el valor es «siempre `automatic_async`».
16. **Redirigir a `init_point` sin el SDK de frontend.** La guía web solo muestra el botón del SDK; la
    referencia describe `init_point` como la «URL para abrir el Checkout», así que debería bastar con
    redirigir, pero no hay un ejemplo que lo diga.
