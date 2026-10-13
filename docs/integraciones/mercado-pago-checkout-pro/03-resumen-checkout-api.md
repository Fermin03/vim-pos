# Checkout API de Mercado Pago (México) — pago con tarjeta dentro de la tienda

Fecha de consulta: **11 de octubre de 2026**. Fuente: documentación oficial de Mercado Pago México
(`mercadopago.com.mx/developers`) y su referencia de API. Complementa a
[`01-resumen-api.md`](01-resumen-api.md) (Checkout Pro): lo que allí ya está verificado —firma del
webhook, reembolsos, cancelación, tarjetas de prueba, comisiones— **no se repite**; aquí solo va lo que
cambia.

Cómo se leyó: versión en texto plano de cada página (`.md` al final de la URL; llega en inglés aunque la
ruta diga `/es/`). Los JSON, cURL y JS están copiados tal cual. Lo que no aparece dice **«no confirmado en
la documentación»** y se repite en la lista final.

Dos fuentes que **no** son el sitio de documentación, y se marcan cada vez que se usan:

- **[GitHub]** = repositorio oficial del SDK, `github.com/mercadopago/sdk-js` (carpeta `docs/`).
- **[Observado]** = lo que se ve al leer el archivo público `https://sdk.mercadopago.com/js/v2`. No es
  documentación; puede cambiar sin aviso.

Abreviaturas de las URL base:

- `DOCS-AO` = `https://www.mercadopago.com.mx/developers/es/docs/checkout-api-orders`
- `DOCS-AP` = `https://www.mercadopago.com.mx/developers/es/docs/checkout-api-payments` (legacy)
- `DOCS-B` = `https://www.mercadopago.com.mx/developers/es/docs/checkout-bricks`
- `DOCS-SEG` = `https://www.mercadopago.com.mx/developers/es/docs/security`
- `DOCS-APPLE` = `https://www.mercadopago.com.mx/developers/es/docs/apple-pay`
- `DOCS-SPLIT` = `https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1`
- `REF-AO` = `https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api`
- `REF-AP` = `https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api-payments`
- `REF-OAUTH` = `https://www.mercadopago.com.mx/developers/es/reference/authentication/oauth/_oauth_token/post`

---

## Resumen de decisiones

| Tema | Recomendación | Por qué |
|---|---|---|
| Formulario | **Card Payment Brick**, con botón propio y variables de estilo | Es lo que Mercado Pago recomienda; valida, traduce y muestra errores solo. Si el diseño no alcanza, plan B: Secure Fields con nuestra maqueta |
| API de cobro | **Payments API (`POST /v1/payments`)** por ahora | La guía de migración oficial dice que marketplace por OAuth **no tiene equivalente documentado** en Orders; además Orders pierde `notification_url` por cobro y `binary_mode` |
| Public key | **La del vendedor**, que viene en la respuesta de `/oauth/token` | Así lo dice la guía de marketplace de Checkout API; otra guía dice lo contrario (ver §3) → probar en sandbox |
| 3DS | **Apagado al lanzar** (es el valor por defecto) | Encenderlo obliga a `binary_mode: false` y abre un estado pendiente con reto |
| Apple Pay / Google Pay | **No prometer** | Apple Pay pide habilitación comercial y certificados por cuenta; Google Pay no tiene documentación en México |

---

## 1. Cómo capturar la tarjeta en nuestra página

Hay tres caminos vigentes. Los tres mandan número, vencimiento y CVV por **iframes servidos por Mercado
Pago**, así que el dato de tarjeta nunca toca nuestro DOM ni nuestro servidor. (`DOCS-AP/types-of-integration`)

### Qué recomienda Mercado Pago

La guía de tarjetas de Checkout API (vía Orders) lo dice sin rodeos: «La **integración recomendada** es a
través del **Card Payment Brick** [...]. Si prefieres ser responsable de definir cómo se obtiene esa
información, puedes integrar con **Core Methods**». (`DOCS-AO/payment-integration/websites/cards`)

### Comparación

| | (a) Card Payment Brick | (b) Secure Fields con Core Methods | (c) CardForm |
|---|---|---|---|
| Qué es | Formulario completo ya armado | Solo 3 campos en iframe (`mp.fields.create`); el resto del formulario es nuestro HTML | Punto medio: nuestro HTML, y la librería llena emisores, mensualidades y arma el token |
| Maqueta | **Fija.** No se reordena | **Libre** | Libre |
| Colores, radios, tamaños | Temas (`default`, `dark`, `bootstrap`, `flat`) + ~30 variables | Nuestros `div` contenedores llevan borde, radio, foco y fondo; dentro del iframe solo ~20 propiedades | Igual que (b) |
| Tipografía | Tamaños y pesos por variable. **No hay variable de familia tipográfica** | `fontFamily` + `customFonts` (URL de la fuente) **[GitHub]** | Igual que (b) |
| Textos | Título, etiquetas, placeholders y botón, reemplazables | Todos nuestros | Todos nuestros |
| Validación y errores | Los trae | Los escribimos nosotros (eventos `validityChange`, `binChange`) | Parcial |
| Idioma | `locale: 'es-MX'` | El nuestro | El nuestro |
| Móvil | «Siempre ocupa el espacio que se le definió y responde cuando cambia» | Lo que hagamos | Lo que hagamos |
| Esfuerzo | Bajo | Alto | Medio |
| Documentado para Orders API | Sí | Sí | Solo en la sección legacy |

Fuentes: `DOCS-B/introduction`, `DOCS-B/additional-content/set-theme`,
`DOCS-B/additional-content/modify-css-variables`, `DOCS-B/additional-content/select-language`,
`DOCS-AO/additional-settings/websites/visual-customizations`, `DOCS-AP/types-of-integration`,
**[GitHub]** `docs/fields.md`.

**Accesibilidad:** ninguna página de Bricks, Checkout API ni del SDK menciona WCAG, lectores de pantalla ni
navegación por teclado. **No confirmado en la documentación**; hay que probarlo a mano.

### (a) Card Payment Brick — lo que sí se puede tocar

Variables de estilo (`customization.visual.style.customVariables`), lista completa de la documentación:

```
textPrimaryColor, textSecondaryColor, inputBackgroundColor, formBackgroundColor, baseColor,
baseColorFirstVariant, baseColorSecondVariant, errorColor, successColor, successSecondaryColor,
outlinePrimaryColor, outlineSecondaryColor, buttonTextColor, fontSizeExtraExtraSmall,
fontSizeExtraSmall, fontSizeSmall, fontSizeMedium, fontSizeLarge, fontSizeExtraLarge,
fontWeightNormal, fontWeightSemiBold, formInputsTextTransform, inputVerticalPadding,
inputHorizontalPadding, inputFocusedBoxShadow, inputErrorFocusedBoxShadow, inputBorderWidth,
inputFocusedBorderWidth, borderRadiusSmall, borderRadiusMedium, borderRadiusLarge, formPadding
```

(`DOCS-B/additional-content/modify-css-variables`)

Advertencia oficial: para ir más allá de temas y variables, **no** usar las clases ni los `id` del Brick,
«porque se generan en la compilación y cambian con frecuencia»; hay que apoyarse en la herencia de HTML.

Textos, título y botón (`DOCS-AO/additional-settings/websites/visual-customizations`):

```js
const settings = {
    customization: {
        visual: {
            texts: {
                formTitle: "",
                emailSectionTitle: "",
                installmentsSectionTitle: "",
                cardholderName: { label: "", placeholder: "" },
                email: { label: "", placeholder: "" },
                cardholderIdentification: { label: "" },
                cardNumber: { label: "" },
                expirationDate: { label: "" },
                securityCode: { label: "" },
                selectInstallments: "",
                selectIssuerBank: "",
                formSubmit: "",
            },
        },
    },
};
```

- `customization.visual.hideFormTitle: true` oculta el título y los logos de marcas.
- `customization.visual.hidePaymentButton: true` oculta el botón; entonces usamos **nuestro** botón y
  llamamos `window.cardPaymentBrickController.getFormData()`.
- Si un texto no cabe, se corta con puntos suspensivos.

Comportamiento (`DOCS-AO/additional-settings/websites/behavior-customizations`):

```js
const settings = {
  initialization: {
    amount: 100,
    payer: { email: 'buyer@example.com' },   // con correo válido, el campo de correo ya no se muestra
  },
  customization: {
    paymentMethods: {
      types: { excluded: ['prepaid_card'] }, // valores: credit_card, debit_card, prepaid_card
      minInstallments: 1,
      maxInstallments: 1,                    // sin meses
    },
  },
};
```

Render mínimo, copiado de `DOCS-AO/payment-integration/websites/cards`:

```js
const renderCardPaymentBrick = async (bricksBuilder) => {
  const settings = {
    initialization: {
      amount: 100.99, // total amount to be paid
    },
    callbacks: {
      onReady: () => {},
      onSubmit: (formData, additionalData) => {
        // formData trae: token, payment_method_id, installments, transaction_amount, payer.email, ...
        // additionalData trae: paymentTypeId, bin, lastFourDigits, cardholderName
        return new Promise((resolve, reject) => { /* fetch a nuestro backend */ });
      },
      onError: (error) => { console.error(error); },
    },
  };
  window.cardPaymentBrickController = await bricksBuilder.create(
    "cardPayment",
    "cardPaymentBrick_container",
    settings
  );
};
```

Dos reglas que salen en la guía:

- Al salir de la pantalla hay que destruir la instancia:
  `window.cardPaymentBrickController.unmount()`. En Next.js eso va en la limpieza del efecto.
- El token de tarjeta **se usa una sola vez y vence a los 7 días**. Cada reintento necesita token nuevo.

### (b) Secure Fields — lo que sí se puede tocar

```js
const cardNumberElement = mp.fields.create('cardNumber', {
      placeholder: "Número do cartão"
    }).mount('form-checkout__cardNumber');
const expirationDateElement = mp.fields.create('expirationDate', {
      placeholder: "MM/YY",
    }).mount('form-checkout__expirationDate');
const securityCodeElement = mp.fields.create('securityCode', {
      placeholder: "Código de segurança"
    }).mount('form-checkout__securityCode');
```

(`DOCS-AO/payment-integration/websites/cards`, pestaña Core Methods)

Propiedades de estilo aceptadas dentro del iframe **[GitHub `docs/fields.md`]**: `color`, `font-family`,
`font-size`, `font-style`, `font-variant`, `font-weight`, `height`, `margin` (y sus cuatro lados),
`padding` (y sus cuatro lados), `placeholder-color`, `text-align`, `width`. Más `customFonts: [{ src }]`
para cargar la fuente. Borde, radio, sombra de foco y fondo se ponen en **nuestro** `div` contenedor,
reaccionando a los eventos `focus`, `blur`, `validityChange` y `ready`.

Con este camino nos toca a nosotros: detectar la marca con `mp.getPaymentMethods({ bin })`, pedir el emisor
con `mp.getIssuers(...)` cuando `additional_info_needed` incluye `issuer_id`, y crear el token con
`mp.fields.createCardToken({ cardholderName, ... })`.

### Recomendación

**Empezar con Card Payment Brick**: botón propio (`hidePaymentButton`), sin título (`hideFormTitle`),
correo precargado, `maxInstallments: 1`, `locale: 'es-MX'` y las variables mapeadas a `tokens.css`. Es lo
recomendado por Mercado Pago y nos ahorra validación, mensajes y detección de marca.

Lo que **no** se va a poder igualar con el Brick: la familia tipográfica por variable (no existe; hay que
ver si hereda la de la página) y la disposición de los campos. Si la revisión de diseño no lo acepta, el
plan B es Secure Fields con nuestra maqueta; el backend no cambia, porque los dos entregan el mismo token.

---

## 2. Orders API o Payments API (legacy)

### Qué dice Mercado Pago

- Aviso en rojo al inicio de la sección legacy: «Mercado Pago ofrece ahora una nueva API para Checkout
  API [...]. Si estás empezando una integración nueva, recomendamos usar la **Orders API**. [...] La
  Payments API seguirá funcionando normalmente, pero **no recibirá nuevas funcionalidades**, solo
  correcciones de seguridad y estabilidad». (`DOCS-AP/overview`)
- Las dos listan MX en «Disponibilidad por país». (`DOCS-AO/overview`, `DOCS-AP/overview`)

### Lo que cambia para un marketplace por OAuth

La guía oficial de migración (`DOCS-AO/resources/migrate-payments-to-orders`) clasifica cada flujo en tres
casos; uno de ellos es «**no tiene equivalente documentado: mantén el flujo en la Payments API hasta que
la Orders API lo soporte**». Y sobre marketplace dice:

> «La Orders API todavía no tiene un campo explícito documentado equivalente a `application_fee`. [...] Si
> tu integración depende de Split de Pagos 1:1 o de un modelo Marketplace, valida este punto antes de
> migrar ese flujo y **no supongas paridad**.»

Nosotros no cobramos comisión, así que `application_fee` no nos hace falta; pero la misma tabla trae otras
tres pérdidas que sí nos pegan:

| Campo en Payments | En Orders, según la guía de migración |
|---|---|
| `notification_url` | «No disponible. Se quitó del cuerpo. Las notificaciones se configuran en Tus integraciones» |
| `binary_mode` | «No documentado como campo de la Orders API. No se encontró equivalente directo» |
| `issuer_id` | «No hay un campo `issuer_id` directo documentado» |
| `application_fee` | «No documentado en la Orders API» |

### Diferencias prácticas

| Tema | Payments API (legacy) | Orders API |
|---|---|---|
| Crear y cobrar | `POST /v1/payments` | `POST /v1/orders` con `type: "online"` y `processing_mode: "automatic"` |
| Montos | Número (`transaction_amount`) | **Cadena** (`total_amount`, `transactions.payments[].amount`) |
| Idempotencia | `X-Idempotency-Key` obligatoria al crear y al reembolsar | Obligatoria en crear, capturar, procesar, cancelar y reembolsar (1 a 128 caracteres); misma llave con cuerpo distinto → `409 idempotency_key_already_used` |
| Procesamiento | Siempre automático | `automatic` (un paso) o `manual` (crear y luego `POST /v1/orders/{id}/process`) |
| Captura | `capture: true/false` | `capture_mode`: `automatic`, `automatic_async`, `manual`; captura hasta 5 días |
| Aprobado se llama | `approved` / `accredited` | `processed` / `accredited` |
| Rechazado se llama | `rejected` + `cc_rejected_*` | `failed` + código sin prefijo |
| Cancelado se escribe | `cancelled` (dos eles) | `canceled` (una ele) |
| Notificación | Tópico `payment`; URL por cobro o en el panel | Tópico `order`; **solo** en el panel |
| Consultar | `GET /v1/payments/{id}` | `GET /v1/orders/{id}` |
| Reembolso | `POST /v1/payments/{id}/refunds` | `POST /v1/orders/{order_id}/refund` |
| Cancelación | `PUT /v1/payments/{id}` con `status: "cancelled"` | `POST /v1/orders/{order_id}/cancel` (solo en `created` o `action_required`) |
| 3DS | `three_d_secure_mode` | `config.online.transaction_security` |
| Errores de validación | Uno a la vez | Lista completa |
| Guía de marketplace por OAuth | **Existe** (`DOCS-AP/how-tos/integrate-marketplace`) | **No existe** |

Fuentes: `DOCS-AO/integration-model`, `DOCS-AO/resources/migrate-payments-to-orders`,
`REF-AO/create-order/post`, `REF-AP/create-payment/post`, `DOCS-AO/payment-management/refunds-cancellations`.

Reembolso en Orders: mismas condiciones que en Checkout Pro —180 días desde la aprobación, saldo
disponible suficiente, a tarjeta de crédito vuelve al estado de cuenta—. (`DOCS-AO/payment-management/refunds-cancellations`)

### Recomendación para VIM POS: Payments API (`/v1/payments`), por ahora

1. Es la única con guía oficial de marketplace usando el token OAuth del vendedor, y la propia guía de
   migración pide no mover ese flujo sin validarlo.
2. Conserva `notification_url` por cobro (webhook de la tienda separado del de las terminales) y
   `binary_mode` (aprobado o rechazado al instante), que hoy sostienen el flujo «el pedido llega a la caja
   solo si el pago se aprobó».
3. Produce el mismo objeto **pago** que Checkout Pro: el webhook, la consulta, el reembolso y la
   cancelación que ya construimos sirven tal cual.

Lo que se paga: la API no recibirá funciones nuevas, y Apple Pay está documentado sobre Orders (§7). El
cambio a Orders queda para cuando una prueba en sandbox confirme que `POST /v1/orders` acepta el token
OAuth de un vendedor y Mercado Pago documente el modo binario. El frontend no cambia: el token de tarjeta
es el mismo.

---

## 3. Marketplace por OAuth con Checkout API

### ¿De quién es la public key?

**La documentación se contradice.** Las dos frases están en guías oficiales del sitio de México:

| Guía | Qué dice |
|---|---|
| «Cómo integrar el checkout en marketplace» (Checkout API, legacy) — `DOCS-AP/how-tos/integrate-marketplace` | «En la integración del checkout, usa la **`public_key` y el `access_token` del vendedor** (obtenidos en el paso 1)». El paso 1 es OAuth |
| «Integrar el checkout en Split de Pagos 1:1» — `DOCS-SPLIT/integration-configuration/integrate-marketplace` | «Usa la **`public_key` de tu cuenta integradora** en el frontend e inserta el `access_token` del vendedor en el backend» |

Nuestro caso —cada restaurante con su cuenta, sin comisión, sin contrato de Split— es el de la primera
guía. **Usar la public key del vendedor**, y confirmarlo con una prueba (ver «Sin confirmar»).

### ¿La respuesta de OAuth trae la public key del vendedor?

**Sí trae un campo `public_key`.** Ejemplo de respuesta de `POST /oauth/token`, copiado de `REF-OAUTH`:

```json
{
  "access_token": "APP_USR-4934588586838432-XXXXXXXX-241983636",
  "token_type": "bearer",
  "expires_in": 15552000,
  "scope": "read write offline_access",
  "user_id": 241983636,
  "refresh_token": "TG-XXXXXXXX-241983636",
  "public_key": "APP_USR-d0a26210-XXXXXXXX-479f0400869e",
  "live_mode": true
}
```

- La referencia describe una sola respuesta para los tres `grant_type` (`authorization_code`,
  `refresh_token`, `client_credentials`), así que el campo viene también al renovar.
- La descripción del campo es ambigua: «Public key **de la aplicación**, que normalmente se usa en el
  frontend y permite, por ejemplo, conocer los medios de pago y cifrar los datos de la tarjeta». No dice
  «del vendedor». La guía de marketplace sí la llama «la `public_key` del vendedor obtenida en el paso 1».
- Al renovar, el `refresh_token` cambia y hay que guardarlo otra vez (`DOCS-SEG/oauth/renewal`). Conviene
  guardar también la `public_key` que venga en esa respuesta.

**Acción para el código:** hoy guardamos `access_token` y `refresh_token`. Hay que guardar además
`public_key` y `live_mode`. Para los restaurantes ya conectados basta con forzar una renovación.

### ¿Hay otro endpoint para obtenerla después?

**No confirmado en la documentación.** La única fuente documentada es la respuesta de `/oauth/token`. El
«mapa de APIs» de OAuth (`DOCS-SEG/oauth/apis-map`) no lista ninguno.

### ¿El token de tarjeta solo sirve con el access token de la misma cuenta?

**No confirmado en la documentación.** Ninguna página lo afirma ni lo niega. Los únicos indicios son los
errores de creación de token `106` («no se puede operar entre usuarios de países distintos») y `145`
(«intentas pagar entre un usuario de prueba y uno real») de `DOCS-AP/error-messages/card-token-creation-errors`.
Por diseño conviene asumir que sí: public key y access token **del mismo restaurante y del mismo modo**
(prueba o producción).

### Crear el cobro con el access token del vendedor

**Endpoint:** `POST https://api.mercadopago.com/v1/payments`, `Authorization: Bearer <access_token del vendedor>`.

Ejemplo de la guía de marketplace (`DOCS-AP/how-tos/integrate-marketplace`):

```bash
curl --location 'https://api.mercadopago.com/v1/payments' \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'Authorization: Bearer {{oauth_access_token}}' \
--data-raw '{
  "description": "Test payment 3",
  "installments": 1,
  "token": "{{card_token}}",
  "payer": { "email": "{{payer_email}}" },
  "payment_method_id": "master",
  "transaction_amount": 25,
  "application_fee": 10
}'
```

Ese ejemplo no trae `X-Idempotency-Key`, pero la referencia la marca **obligatoria** (`REF-AP/create-payment/post`).

**Cuerpo que usaríamos** (cada campo existe en `REF-AP/create-payment/post`; el conjunto es nuestro):

```json
{
  "transaction_amount": 245.50,
  "token": "<token del Brick>",
  "description": "Pedido en Knock-Out Burger",
  "installments": 1,
  "payment_method_id": "master",
  "issuer_id": "<el que entregue el Brick>",
  "payer": { "email": "comprador@correo.com", "first_name": "Ana", "last_name": "López" },
  "external_reference": "pedido_8f3a2c",
  "notification_url": "https://<proyecto>.supabase.co/functions/v1/<funcion>",
  "statement_descriptor": "KNOCKOUT",
  "binary_mode": true,
  "capture": true,
  "additional_info": {
    "items": [ { "id": "sku-1", "title": "Hamburguesa", "quantity": 1, "unit_price": 245.50, "category_id": "food" } ],
    "payer": { "first_name": "Ana", "last_name": "López", "phone": { "area_code": "477", "number": "1234567" } }
  },
  "metadata": {}
}
```

Cabeceras: `Authorization`, `Content-Type: application/json`, `X-Idempotency-Key: <uuid>` y, recomendada,
`X-meli-session-id: <device id>` (§4).

| Campo | Regla según la referencia |
|---|---|
| `transaction_amount` | Número, con dos decimales o ninguno. **La propina se suma aquí**; no hay campo de propina |
| `token` | «Obligatorio para tarjeta de crédito». Se descarta al usarse |
| `payment_method_id` | La marca (`visa`, `master`, `debvisa`, `debmaster`, ...) |
| `issuer_id` | Identificador del banco emisor |
| `installments` | `1` |
| `external_reference` | Máximo 64 caracteres; solo letras, números, guion y guion bajo |
| `notification_url` | Máximo 248 caracteres |
| `statement_descriptor` | Texto en el estado de cuenta del comprador |
| `binary_mode` | `true` = solo aprobado o rechazado; si no, también puede quedar `in_process` |
| `application_fee` | **Omitir.** Es la comisión del integrador |
| `additional_info` | Solo datos; se reenvían al motor de riesgo |

`application_fee`: la referencia no declara un valor por defecto. Que omitirlo equivale a comisión cero
es lo esperable (el campo es opcional), pero **no está escrito**.

**Equivalente en Orders API** (por si se cambia de decisión), copiado de `DOCS-AO/payment-integration/websites/cards`:

```bash
curl -X POST \
 'https://api.mercadopago.com/v1/orders' \
 -H 'Content-Type: application/json' \
 -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
 -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
 -d '{
  "type": "online",
  "processing_mode": "automatic",
  "total_amount": "50.00",
  "external_reference": "ext_ref_1234",
  "payer": { "email": "test@testuser.com" },
  "transactions": {
    "payments": [
      {
        "amount": "50.00",
        "payment_method": { "id": "master", "type": "credit_card", "token": "1223123", "installments": 1 }
      }
    ]
  }
}'
```

En Orders, `statement_descriptor` va dentro de `payment_method` (hasta 50 caracteres; en el estado de
cuenta se ven unos 10) y `payment_method.type` es obligatorio (`credit_card` o `debit_card`).
(`REF-AO/create-order/post`)

### ¿Hace falta algún permiso o producto habilitado?

- Scopes: los mismos tres de siempre (`read`, `write`, `offline_access`); no hay scope por producto.
  (`REF-OAUTH`)
- La referencia de Orders sí lista un `403 forbidden`: «La aplicación no tiene permiso para acceder a este
  recurso. Verifica que el Access Token tenga los permisos y scopes necesarios».
- Que una aplicación dada de alta para Point o Checkout Pro pueda cobrar por `/v1/payments` con token de
  tarjeta sin tocar el panel: **no confirmado en la documentación** (mismo punto abierto que en el resumen
  de Checkout Pro).
- La medición de calidad de Orders pide «declarar» en el panel qué medios y funciones usa la integración
  (§11).

---

## 4. Seguridad y cumplimiento

### PCI DSS

Tabla oficial de qué cuestionario corresponde (`DOCS-SEG/pci`):

| Solución | SAQ |
|---|---|
| Checkout Pro | A |
| Web Tokenize Checkout | A-EP |
| Checkout Transparente (= Checkout API) | **A** |

Y en `DOCS-AP/types-of-integration`: Bricks, CardForm y Core Methods «son elegibles para **PCI SAQ A**,
porque el número de tarjeta, el CVV y el vencimiento viajan por un iframe directo a los servidores de
Mercado Pago».

- **SAQ A** tiene 22 requisitos anuales; el A-EP tiene 191 y el D, 250. (`DOCS-SEG/pci`)
- Nivel por volumen: menos de 20,000 transacciones en línea al año es **nivel 4**: SAQ anual, escaneo
  trimestral por un proveedor aprobado y certificación de cumplimiento (AOC).
- «Mercado Pago puede solicitar esta documentación por su papel de PSP.»

**No confirmado en la documentación:** a quién le toca el SAQ en un modelo de plataforma. El comercio que
cobra es cada restaurante, pero la página y el código son nuestros. Es una pregunta para Mercado Pago o
para un asesor PCI, no algo que la documentación resuelva.

### Lo que obliga o pide Mercado Pago

| Tema | Qué dice | Fuente |
|---|---|---|
| HTTPS | Certificado SSL y formulario en página HTTPS: **obligatorio en producción**, no en pruebas | `DOCS-AO/go-to-production`, `DOCS-AP/integration-test/go-to-production-requirements` |
| Datos de tarjeta | Usar integraciones donde el dato de tarjeta «no llegue a tus servidores» | `DOCS-SEG/pci` |
| Access token | Solo en el backend; la public key es la del frontend | `DOCS-AO/resources/credentials` |
| Device ID | Recomendado para mejorar la aprobación (ver abajo) | `DOCS-AO/payment-management/improve-payment-approval/recommendations` |
| Datos extra | «Envía la mayor cantidad posible de datos del comprador y del producto» | misma página |
| Reintentos | Dos pagos seguidos con los mismos `payer` e `items` pueden disparar `high_risk` y bloquear temporalmente los siguientes; «implementa controles para evitar reintentos inmediatos con los mismos datos» | `DOCS-AO/payment-management/improve-payment-approval/reasons-for-rejection` |

Que «no registrar datos de tarjeta en logs» sea una regla escrita de Mercado Pago: no aparece con esas
palabras. Con Bricks o Secure Fields el dato nunca pasa por nosotros; lo único sensible que vemos es el
**token**, que conviene no escribir en logs.

### Device ID

- «Si ya usas el SDK JS de Mercado Pago, **no** necesitas agregar el script de seguridad: el Device ID se
  obtiene por defecto.» (`DOCS-AO/.../recommendations`)
- Queda en la variable global `MP_DEVICE_SESSION_ID`.
- Se manda al crear el pago en la cabecera **`X-meli-session-id: <device id>`**.

Flujo para nosotros: el navegador lee `window.MP_DEVICE_SESSION_ID` y lo manda junto con el token a la
Edge Function, que lo reenvía en esa cabecera.

> **Corregido el 12 oct 2026 con lo visto en el navegador** (`04-verificado-orders.md`, «Señales para
> el antifraude»): con el SDK JS solo, la variable **no aparece**. Hace falta el script de seguridad
> `https://www.mercadopago.com/v2/security.js` con `view="checkout"`; la tienda lo carga en la
> pantalla de la tarjeta.

### Content-Security-Policy

**No confirmado en la documentación.** Ni el sitio de documentación ni el repositorio del SDK publican una
lista de dominios para CSP.

**[Observado]** en el archivo `https://sdk.mercadopago.com/js/v2`, estos son los hosts que aparecen:

| Directiva | Hosts que se ven en el SDK |
|---|---|
| `script-src` | `https://sdk.mercadopago.com`, `https://http2.mlstatic.com` |
| `frame-src` | `https://api-static.mercadopago.com` (ruta `/secure-fields`), `https://secure-fields.mercadopago.com`, `https://www.mercadopago.com.mx` (reto 3DS de Orders); con 3DS en Payments, además el dominio del banco emisor, que no se conoce de antemano |
| `connect-src` | `https://api.mercadopago.com`, `https://api-static.mercadopago.com` |
| `img-src` | `https://http2.mlstatic.com` |

Es una lista de arranque, no una garantía: hay que cargar el formulario con la CSP en modo
`Report-Only` y completar con lo que reporte el navegador. El script de huella de dispositivo puede pedir
más dominios. Recordar que la CSP de la tienda puede vivir en más de una copia.

> **Lista vigente (12 oct 2026), vista en el navegador hasta no tener ninguna violación** (vive en
> `apps/tienda/next.config.mjs`, una sola copia): `script-src` `sdk.mercadopago.com` y
> `www.mercadopago.com`; `frame-src` `api.mercadopago.com`, `api-static.mercadopago.com` y
> `secure-fields.mercadopago.com`; `connect-src` esos tres más `www.mercadolibre.com` y
> `api.mercadolibre.com`; `img-src` `www.mercadolibre.com` y `www.mercadolivre.com`. Los dos últimos
> de `connect` e `img` son la huella de dispositivo: bloquearlos empeora la aprobación.
> Desde la verificación del banco, `frame-src` lleva además `www.mercadopago.com.mx` (la página del reto).

---

## 5. 3DS 2.0 en México

### ¿Obligatorio u opcional?

**Opcional y apagado por defecto.** Ninguna página dice que sea obligatorio en México.

- Payments: `three_d_secure_mode` acepta `not_supported` («no se usa 3DS; **es el valor por defecto**») u
  `optional` («puede o no pedirse según el riesgo»; es el que recomiendan). (`DOCS-AP/how-tos/integrate-3ds`)
- Orders: `config.online.transaction_security.validation` acepta `never` (**valor por defecto**) u
  `on_fraud_risk`. (`DOCS-AO/payment-management/integrate-3ds`)

Existe el rechazo `cc_rejected_3ds_mandatory`: «rechazado por no tener reto 3DS cuando es obligatorio»
(`DOCS-AP/response-handling/collection-results`). Es decir, con 3DS apagado algunos pagos se rechazarán
porque el banco lo exige. Con qué frecuencia en México: **no confirmado en la documentación**.

### Cómo se integra con Payments API

1. Crear el pago con `"three_d_secure_mode": "optional"`.
2. Restricción escrita: «la captura debe ser automática (`capture=true`) y **el modo binario debe estar
   desactivado (`binary_mode=false`)**, porque el pago puede quedar pendiente mientras el comprador
   completa el reto».
3. Sin reto: `status: "approved"`, igual que hoy.
4. Con reto: `status: "pending"`, `status_detail: "pending_challenge"` y un objeto `three_ds_info`:

```json
{
    "id": 52044997115,
    "status": "pending",
    "status_detail": "pending_challenge",
    "three_ds_info":
    {
        "external_resource_url": "https://acs-public.tp.mastercard.com/api/v1/browser_Challenges",
        "creq": "eyJ0aHJlZURTU2VydmVyVHJhbnNJRCI6ImJmYTVhZjI0..."
    },
    "owner": null
}
```

5. Mostrar el reto: un iframe con un formulario `POST` hacia `external_resource_url` y un campo oculto
   `creq`. Con Bricks lo hace el **Status Screen Brick**, pasándole `paymentId`,
   `additionalInfo.externalResourceURL` y `additionalInfo.creq`. (`DOCS-B/how-tos/integrate-3ds`)
6. Saber que terminó:

```js
window.addEventListener("message", (e) => {
     if (e.data.status === "COMPLETE") {
         window.open("congrats.html");
     }
});
```

   El evento solo dice que el reto acabó, **no** que el pago ya tenga estado final: hay que consultar el
   pago o esperar el webhook.

**Tiempos:**

- Payments: «el usuario tiene unos **5 minutos**»; si no lo completa, el banco rechaza y el pago se da por
  cancelado. (`DOCS-AP/how-tos/integrate-3ds`)
- Bricks: «el pago se rechaza si el reto **no se inicia en 30 segundos** desde su creación».
  (`DOCS-B/how-tos/integrate-3ds`)
- Orders: **40 minutos**; al vencer queda `canceled` / `expired` y hay que crear otra order.
  (`DOCS-AO/payment-management/integrate-3ds`)

### Cómo se integra con Orders API

```json
"config": {
  "online": {
    "transaction_security": {
      "validation": "on_fraud_risk",
      "liability_shift": "required"
    }
  }
}
```

Con reto la order vuelve con `status: "action_required"`, `status_detail: "pending_challenge"` y la URL en
`transactions.payments[i].payment_method.transaction_security.url`; esa URL se abre en un iframe y el
evento `message` es el mismo. `liability_shift: "required"` traslada la responsabilidad del contracargo a
la marca de la tarjeta y es el único valor aceptado.

### Cómo cambia el «aprobado al instante»

| | Sin 3DS (por defecto) | Con 3DS |
|---|---|---|
| `binary_mode` | Puede ir en `true` | **Tiene que ir en `false`** (Payments) |
| Respuesta al crear | Aprobado o rechazado | Aprobado, rechazado **o pendiente con reto** |
| Pedido a la caja | En la misma petición | Puede llegar minutos después, por webhook |
| Estados a manejar | Dos | Además `pending_challenge`, `in_process`, expiración |
| Contracargos por fraude | A cargo del vendedor | Con autenticación, la responsabilidad pasa al emisor |

Con `binary_mode: false` reaparecen los estados `in_process` (`pending_contingency`,
`pending_review_manual`), que pueden tardar «hasta 2 días hábiles» en resolverse
(`DOCS-AP/response-handling/collection-results`). Un pedido de comida no puede esperar eso: habría que
cancelar ese pago en cuanto aparezca.

> **Superado el 12 oct 2026.** Con tarjetas reales Mercado Pago rechazaba casi todo con `high_risk`:
> la verificación se encendió («solo si hay riesgo») con Orders API. Lo comprobado está en
> `04-verificado-orders.md` y el diseño en `02-diseno.md`. De esta sección, **sin confirmar**: los 40
> minutos de vida del reto (una orden abandonada seguía igual a los 8 minutos).

**Recomendación:** lanzar **sin 3DS** y con `binary_mode: true`. Encender 3DS solo si el piloto muestra
contracargos o rechazos `cc_rejected_3ds_mandatory`, y entonces diseñar el estado «esperando al banco».

---

## 6. Datos que se le piden al comprador

| Dato | ¿Lo exige la API? | Fuente |
|---|---|---|
| Correo | Payments: `payer.email` figura como opcional en la referencia, pero **todos** los ejemplos lo mandan. Orders: «obligatorio solo para OXXO, Paycash, Banamex, BBVA y SPEI» | `REF-AP/create-payment/post`, `REF-AO/create-order/post` |
| Nombre del titular | Se pide en el formulario y viaja **dentro del token**; no es un campo del pago | `DOCS-AO/payment-integration/websites/cards` |
| Tipo y número de identificación | «Opcionales para pagos con tarjeta» | `REF-AO/create-order/post` |
| Código postal | Opcional (`payer.address.zip_code`) | `REF-AO/create-order/post` |
| Teléfono | Opcional | `REF-AO/create-order/post` |

**Identificación en México.** La referencia confirma que es opcional para tarjeta. Los ejemplos de México
que la incluyen usan `"type": "CURP"`. Si el Card Payment Brick muestra o no ese campo en México: **no
confirmado en la documentación**; se resuelve llamando una vez `GET /v1/identification_types` con un token
mexicano y mirando el Brick en pantalla.

**Mínimo para que la API acepte el cobro con tarjeta:** token, `payment_method_id`, monto, `installments` y
correo. Un mínimo «para aprobar» no existe como tal: la aprobación la deciden el banco y el motor de riesgo.

**Lo que recomienda para mejorar la aprobación**
(`DOCS-AO/payment-management/improve-payment-approval/recommendations`):

1. Device ID (§4).
2. Datos del comprador: nombre, apellido, teléfono, dirección.
3. Detalle de los productos: `id`, `title`, `description`, `category_id`, `quantity`, `unit_price`.
4. Datos de envío cuando aplique.
5. Explicar al comprador por qué se rechazó y qué puede hacer.

Para un pedido de comida ya tenemos nombre, teléfono, correo y los renglones del carrito: se mandan todos
sin pedir nada nuevo. Hay una página de «datos por industria» con campos extra por giro
(`DOCS-AO/payment-management/improve-payment-approval/industry-data`); no la revisé a fondo.

---

## 7. Apple Pay y Google Pay

**Conclusión: no se le puede prometer al cliente.** Confirma lo dicho en el resumen de Checkout Pro y añade
el detalle de lo que costaría.

### Apple Pay — lo que existe

Producto documentado en México, dentro de Checkout API y sobre **Orders API**. (`DOCS-APPLE/overview`)

Requisitos, uno por uno:

| Requisito | Detalle | Fuente |
|---|---|---|
| Habilitación comercial | Aviso al inicio: «Debes contactar a nuestro equipo comercial para habilitar tu cuenta y dar permiso de cobrar con este modelo» | `DOCS-APPLE/overview` |
| Cuenta de Apple Developer | Hace falta para crear el Merchant ID, verificar el dominio y firmar certificados | `DOCS-APPLE/obtain-apple-developer-certificates` |
| Verificación de dominio | Registrar el dominio en el portal de Apple, descargar el `.txt` y publicarlo en `https://<dominio>/.well-known/apple-developer-merchantid-domain-association.txt`. Cada descarga invalida el archivo anterior | misma página |
| Merchant Identity Certificate | Se pide un CSR a Mercado Pago (`POST /certificates/csr/generate`, `type: "merchant"`), se firma en Apple y se sube (`POST /certificates/certificate/upload`). Después hay que **volver a verificar el dominio** | misma página |
| Payment Processing Certificate | Mismo ciclo con `type: "payment"` | misma página |
| Cabecera `X-Product-ID` | Obligatoria en las llamadas de sesión y de tokenización. La documentación no dice de dónde sale | `DOCS-APPLE/attached-model-integration/web-integration` |
| Navegador | Web: Safari en iOS y macOS; «otros navegadores tienen soporte limitado» | `DOCS-APPLE/overview`, `DOCS-APPLE/resources/possible-errors` |
| Dispositivo | iPhone o iPad con iOS 10.1 o posterior; Mac con macOS Sierra o posterior y Touch ID o Face ID; Wallet con una tarjeta válida | `DOCS-APPLE/resources/possible-errors` |
| Marcas | Solo Visa y Mastercard. No disponible en Android | `DOCS-APPLE/overview` |
| HTTPS | Obligatorio | `DOCS-APPLE/resources/possible-errors` |

Flujo web (`DOCS-APPLE/attached-model-integration/web-integration`):

1. `POST /applepay/v1/session` con `X-Public-key`, el `certificate_id`, el `merchantIdentifier` y el
   `domainName`.
2. El comprador autoriza con Face ID o Touch ID.
3. `POST /platforms/pci/applepay/v1/tokenize` con el `payment_data` de Apple → devuelve un token de tarjeta.
4. `POST /v1/orders` con ese token.

### ¿Funciona cuando el cobro lo crea un vendedor conectado por OAuth?

**No confirmado en la documentación.** Ninguna página de Apple Pay menciona OAuth, marketplace ni
plataformas. Lo que sí se ve apunta a que el modelo es **un comercio, una cuenta**:

- La habilitación comercial es **por cuenta** de Mercado Pago.
- Los CSR se generan y los certificados se suben con el **access token de una cuenta**; quedan ligados a
  ella.
- La sesión y la tokenización se piden con la **public key de una cuenta**.
- El pago se crea por Orders API, que no tiene guía de marketplace (§2).

Si hubiera que repetirlo por restaurante: habilitación comercial de cada uno, dos certificados por cuenta
y un Merchant ID de Apple. Si en cambio bastara con una sola configuración a nombre de VIM para todos los
vendedores, la documentación no lo dice.

**Trabajo estimado si algún día se hace:** cuenta de Apple Developer de pago, gestión comercial con
Mercado Pago, publicar el archivo en `/.well-known/` de `pedidos.vimpos.com.mx`, ciclo de dos certificados
(con renovación periódica), tres endpoints nuevos en el backend, el botón con la API de Apple en el
frontend, migrar ese cobro a Orders API, y pruebas en dispositivos reales. Y antes de todo, la respuesta de
Mercado Pago a la pregunta de OAuth.

### Google Pay

**Sin documentación en México.**

- `.../docs/google-pay/overview` responde 404.
- El índice completo de la documentación de México (`.../developers/es/docs/llms.txt`) no contiene ni una
  vez la frase «Google Pay».
- **[Observado]:** el archivo del SDK (`sdk.mercadopago.com/js/v2`) contiene las cadenas
  `https://pay.google.com/gp` y `https://applepay.cdn-apple.com/jsapi`. Es decir, el SDK trae código
  relacionado, pero sin documentación no hay forma de saber si está activo en México ni cómo se habilita.

---

## 8. Estados y errores

### Estados de un pago con tarjeta (Payments API)

Tabla de `DOCS-AP/response-handling/collection-results`. La columna «Mensaje» es la que sugiere Mercado
Pago, adaptada; la columna «¿Misma tarjeta?» es **nuestra lectura** de ese mensaje, porque la documentación
no trae una regla explícita de reintento.

| `status` | `status_detail` | Mensaje para el comprador | ¿Misma tarjeta? |
|---|---|---|---|
| `approved` | `accredited` | Listo, tu pago se acreditó. En tu estado de cuenta aparecerá como `statement_descriptor` | — |
| `in_process` | `pending_contingency` | Estamos procesando tu pago (hasta 2 días hábiles) | No aplica con `binary_mode: true` |
| `in_process` | `pending_review_manual` | Estamos procesando tu pago (hasta 2 días hábiles) | No aplica con `binary_mode: true` |
| `pending` | `pending_challenge` | Falta confirmar con tu banco | Solo con 3DS |
| `rejected` | `cc_rejected_bad_filled_card_number` | Revisa el número de tarjeta | Sí, corrigiendo |
| `rejected` | `cc_rejected_bad_filled_date` | Revisa la fecha de vencimiento | Sí, corrigiendo |
| `rejected` | `cc_rejected_bad_filled_security_code` | Revisa el código de seguridad | Sí, corrigiendo |
| `rejected` | `cc_rejected_bad_filled_other` | Revisa los datos | Sí, corrigiendo |
| `rejected` | `cc_rejected_insufficient_amount` | Tu tarjeta no tiene fondos suficientes | No: otra tarjeta |
| `rejected` | `cc_rejected_call_for_authorize` | Debes autorizar este pago con tu banco | Sí, después de llamar al banco |
| `rejected` | `cc_rejected_card_disabled` | Llama a tu banco para activar la tarjeta (el teléfono está al reverso) o usa otra | Después de activarla |
| `rejected` | `cc_rejected_duplicated_payment` | Ya hiciste un pago por ese monto. Si necesitas pagar otra vez, usa otra tarjeta | No: otra tarjeta |
| `rejected` | `cc_rejected_high_risk` | Tu pago fue rechazado. Elige otro medio de pago | No, y no reintentar de inmediato (§4) |
| `rejected` | `cc_rejected_max_attempts` | Llegaste al límite de intentos. Elige otra tarjeta | No: otra tarjeta |
| `rejected` | `cc_rejected_invalid_installments` | La tarjeta no acepta ese número de mensualidades | No debería ocurrir con 1 pago |
| `rejected` | `cc_rejected_blacklist` | No pudimos procesar tu pago | No |
| `rejected` | `cc_rejected_card_error` | No pudimos procesar tu pago | Otra tarjeta |
| `rejected` | `cc_rejected_other_reason` | Tu banco no procesó el pago | Otra tarjeta o llamar al banco |
| `rejected` | `cc_rejected_3ds_mandatory` | Tu banco pide una verificación que esta tienda no ofrece | Otra tarjeta |
| `rejected` | `cc_amount_rate_limit_exceeded` | El monto supera el límite de este medio de pago | Otra tarjeta |
| `rejected` | `rejected_insufficient_data` | Faltan datos obligatorios | Error nuestro: revisar el cuerpo |
| `rejected` | `rejected_by_bank` | Tu banco rechazó la operación | Otra tarjeta o llamar al banco |
| `rejected` | `rejected_by_regulations` | Pago rechazado por regulación | No |

El mensaje oficial para `cc_rejected_high_risk` recomienda «medios en efectivo»; nosotros no los
ofrecemos, así que el texto se queda en «otro medio de pago» o pagar al recibir, si el restaurante lo
acepta.

Sobre `cc_rejected_other_reason`: «es un estado que envía el banco emisor; no especifica el motivo y suele
ser una estimación de riesgo de fraude». (`DOCS-AO/.../reasons-for-rejection`)

### Equivalencias si se usa Orders API

De la guía de migración (`DOCS-AO/resources/migrate-payments-to-orders`):

| Payments API | Orders API |
|---|---|
| `approved` | `processed` |
| `pending` | `action_required` |
| `in_process` | `processing` |
| `rejected` | `failed` |
| `cancelled` | `canceled` |
| `in_mediation` | `charged_back` (`in_process`) |
| `cc_rejected_bad_filled_card_number` / `_date` / `_security_code` | `bad_filled_card_data` (uno solo: se pierde el detalle) |
| `cc_rejected_call_for_authorize` | `required_call_for_authorize` |
| `cc_rejected_card_disabled` | `card_disabled` |
| `cc_rejected_duplicated_payment` | `processing_error` |
| `cc_rejected_high_risk` | `high_risk` |
| `cc_rejected_insufficient_amount` | `insufficient_amount` o `card_insufficient_amount` |
| `cc_rejected_invalid_installments` | `invalid_installments` |
| `cc_rejected_max_attempts` | `max_attempts_exceeded` |
| `cc_rejected_other_reason` | `rejected_by_issuer` |
| `cc_rejected_3ds_challenge` | `3ds_challenge_expired` o `cc_rejected_3ds_challenge` |

Otros códigos de transacción en Orders: `invalid_card_token`, `amount_limit_exceeded`, `in_review`.
(`DOCS-AO/payment-management/status/transaction-status`)

### Errores al crear el token

De `DOCS-AP/error-messages/card-token-creation-errors`: `106` (usuarios de países distintos), `145` (mezcla
de usuario de prueba con usuario real), `160` («el cobrador no puede operar»: la cuenta del restaurante
tiene un bloqueo; avisarle), `204` (medio no disponible por ahora), `801` («ya enviaste la misma petición
en el último minuto; intenta en unos minutos»).

### Errores HTTP al crear una order

De `REF-AO/create-order/post`: `402` (la order se creó pero una transacción falló: leer `errors`), `403
forbidden` (permisos o scopes), `409 idempotency_key_already_used`, `423 resource_locked` (reintentar
después), `429` (respetar la cabecera `Retry-After`).

---

## 9. Notificaciones — solo lo que cambia

Lo ya verificado para Checkout Pro (cuerpo, manifiesto de la firma, 22 segundos, reintentos) sigue igual.
«El mecanismo de firma `HMAC-SHA256` es idéntico en las dos API.» (`DOCS-AO/resources/migrate-payments-to-orders`)

| | Payments API | Orders API |
|---|---|---|
| Tópico | `payment` | `order` |
| Dónde se configura | `notification_url` en el cuerpo **o** en el panel | **Solo en el panel** (Tus integraciones > Webhooks) |
| `data.id` | ID numérico del pago | `ORD01...`, alfanumérico: **pasarlo a minúsculas** para el manifiesto |
| Cuerpo | Solo el ID | Trae `data.status`, `data.status_detail`, `data.external_reference`, `data.transactions.payments[]` y `application_id` |
| `action` | `payment.created`, `payment.updated` | `order.processed` (el ejemplo oficial); el resto no se listó |
| Consultar | `GET /v1/payments/{id}` | `GET /v1/orders/{id}` |
| IPN | Disponible, sin firma | No disponible |

**Con Payments API (lo recomendado) no cambia nada respecto a Checkout Pro**: mismo tópico `payment`, misma
`notification_url` por cobro, mismo `GET /v1/payments/{id}`. La función que ya recibe los webhooks de
Checkout Pro sirve tal cual; solo hay que tener en cuenta que el `external_reference` puede venir de un
cobro creado por cualquiera de los dos caminos.

Diferencia de flujo que sí importa: en Checkout API **la respuesta de crear el pago ya trae el estado
final** (con `binary_mode: true`). El pedido se puede mandar a la caja desde esa misma petición; el webhook
queda como respaldo y para lo que pase después (`refunded`, `charged_back`, `in_mediation`). Por eso el
envío a la caja tiene que ser idempotente: la misma aprobación puede llegar por los dos lados.

Siguen sin confirmar, igual que en el resumen de Checkout Pro: si las notificaciones enviadas a una
`notification_url` por cobro llevan `x-signature`, y a qué URL llegan los pagos de vendedores OAuth cuando
no se manda `notification_url`. Con Orders API el segundo punto pasa a ser crítico, porque no hay otra
forma de recibirlas.

---

## 10. Pruebas

### Credenciales de prueba y OAuth

- La cuenta de prueba **vendedor** se crea sola con la aplicación, y sus credenciales son las «de prueba»;
  por eso también empiezan con `APP_USR`. Hay tres tipos de cuenta: vendedor, comprador e **integrador**
  («para integraciones en modelo marketplace»). (`DOCS-AO/resources/test-accounts`)
- El SDK no tiene bandera de sandbox: «el entorno lo define el tipo de Public Key». (`DOCS-AO/development-environment`)
- OAuth: mandar `"test_token": "true"` a `/oauth/token` «para generar credenciales sandbox». La respuesta
  trae `live_mode`. (`DOCS-SEG/oauth/creation`, `REF-OAUTH`)
- **Contradicción en Orders:** las guías dicen «usa tu Access Token de prueba», pero la referencia lista el
  error `401 invalid_credentials`: «No hay soporte para credenciales de prueba. Usa **usuarios de prueba
  con credenciales de producción** para el entorno sandbox». (`REF-AO/create-order/post`)
- Cómo se usa la cuenta «integrador» y cómo se prueba el flujo completo con un vendedor de prueba conectado
  por OAuth: **no confirmado en la documentación**.

### Tarjetas y nombres de titular

Las mismas cinco tarjetas de México y la misma tabla de nombres (`APRO`, `OTHE`, `CONT`, `CALL`, `FUND`,
`SECU`, `EXPI`, `FORM`, ...) que ya están en el resumen de Checkout Pro. (`DOCS-AO/resources/test-cards`)

Regla nueva de la guía web: en el campo de correo usar **`test@testuser.com`**, «el único permitido para
pruebas». En Orders, otro dominio da `invalid_email_for_sandbox`. (`DOCS-AO/integration-test/cards`)

### Probar 3DS

«El flujo 3DS **no se puede probar en producción**, ni con usuarios de prueba.»

**Payments API y Bricks** — tarjetas especiales (`DOCS-AP/how-tos/integrate-3ds`, `DOCS-B/how-tos/integrate-3ds`):

| Flujo | Número | CVV | Vence |
|---|---|---|---|
| Reto exitoso | 5483 9281 6457 4623 | 123 | 11/30 |
| Reto no autorizado | 5361 9568 0611 7557 | 123 | 11/30 |

**Orders API** — cualquier tarjeta de prueba, y el resultado lo decide el nombre del titular
(`DOCS-AO/payment-management/integrate-3ds`):

| `cardholder_name` | Estado 3DS | Resultado |
|---|---|---|
| `APRO-AUTH` | authenticated | `processed` / `accredited` |
| `APRO-ATMT` | attempted | `processed` / `accredited` |
| `OTHE-NAUT` | not_authenticated | `failed` |
| `APRO-CHOK` | authenticated | **muestra el reto** y aprueba |
| `OTHE-CHNO` | not_authenticated | **muestra el reto** y falla |

Solo `APRO-CHOK` y `OTHE-CHNO` devuelven la URL del reto. El código que muestra la pantalla es ilustrativo:
basta con pulsar «Confirmar».

### Trampas

1. `CONT` con `binary_mode: true` debe terminar **rechazado**: es la prueba de que el modo binario está
   activo.
2. Public key y access token deben ser del mismo modo; mezclar prueba con producción da el error `145` al
   crear el token.
3. El token se usa una vez: tras un rechazo hay que pedir otro al formulario antes de reintentar.
4. Reintentar enseguida con los mismos datos puede dar `high_risk` y bloquear los intentos siguientes.
5. `X-Idempotency-Key`: una llave nueva por **intento**, no por pedido; si se repite con otro cuerpo (otro
   token), Orders responde `409`.
6. Los pagos de prueba no envían notificaciones a `notification_url` (ya anotado en Checkout Pro): en
   pruebas hay que decidir con la respuesta de crear el pago.
7. Al desmontar el componente del formulario, llamar `unmount()` del Brick; si no, al volver a entrar falla.

---

## 11. Salir a producción y medición de calidad

### Requisitos

Iguales a los de Checkout Pro: activar credenciales de producción, usarlas, y SSL obligatorio. No hay
aprobación previa de Mercado Pago. (`DOCS-AO/go-to-production`, `DOCS-AP/integration-test/go-to-production-requirements`)

### Medición de calidad

| | Payments API / Bricks | Orders API |
|---|---|---|
| Con qué se mide | `payment ID` de un pago hecho con **credenciales de producción** | **Order ID** de un pago **de prueba** de los últimos 7 días |
| Antes de medir | — | Declarar en el panel cómo opera la integración, qué medios ofrece y qué extras usa (por ejemplo 3DS) |
| Automática | Mensual | Mensual |
| Puntaje mínimo | 73 (recomendado 100) | 73 (recomendado 100) |

Fuentes: `DOCS-AP/how-tos/integration-quality`, `DOCS-AO/integration-quality`.

Aspectos evaluados: experiencia del comprador, conciliación financiera, aprobación de pagos, escalabilidad
y seguridad.

Qué suma, según los ejemplos de la documentación:

- **Obligatorio:** webhooks activos; enviar `external_reference`.
- **Recomendado:** enviar todos los datos del comprador para la validación antifraude.
- **Buenas prácticas (no puntúan):** usar MercadoPago.js V2; mantener el sistema al día con los eventos
  recibidos.

La lista exacta de campos que puntúan **no está publicada**: «guíate por lo que devuelva la herramienta».
Por lo visto en el resto de la documentación, lo razonable es mandar desde el primer día: Device ID
(`X-meli-session-id`), `payer.first_name` / `last_name`, teléfono, los renglones del pedido con `id`,
`title`, `description`, `category_id`, `quantity` y `unit_price`, `statement_descriptor`,
`external_reference` y `notification_url`.

**No confirmado en la documentación:** en una plataforma, qué aplicación se mide (la nuestra) y con qué
pagos (los de cada restaurante, creados con tokens OAuth). Lo esperable es que cuente nuestra aplicación,
porque los pagos llevan su `application_id`.

---

## Sin confirmar

Nada de esto aparece en la documentación oficial consultada. Cada punto necesita una prueba en sandbox o
una pregunta a soporte de Mercado Pago antes de darlo por hecho.

1. **De quién es la public key en un marketplace por OAuth.** Dos guías oficiales se contradicen: la de
   marketplace de Checkout API dice «la del vendedor»; la de Split de Pagos 1:1 dice «la de tu cuenta
   integradora». Prueba: tokenizar con cada una y cobrar con el access token del vendedor.
2. **Si el `public_key` que devuelve `/oauth/token` es del vendedor.** La referencia lo describe como
   «de la aplicación»; la guía de marketplace lo trata como del vendedor.
3. **Otro endpoint para obtener la public key del vendedor** con su access token. No hay ninguno documentado.
4. **Si un token de tarjeta creado con una public key solo sirve con el access token de esa cuenta.**
5. **Orders API con token OAuth de vendedor.** Sin guía; la guía de migración pide no suponer paridad.
6. **Modo binario en Orders API.** La guía de migración dice que no hay equivalente; el resumen de Checkout
   Pro anotó que otra página presenta `capture_mode: "automatic"` como tal.
7. **A qué URL llegan las notificaciones `order`** de vendedores conectados por OAuth, ya que Orders no
   acepta `notification_url`.
8. **Omitir `application_fee` equivale a comisión cero.** Esperable; no escrito.
9. **Permiso o producto que deba habilitarse en la aplicación** para cobrar por Checkout API con tokens
   OAuth.
10. **Dominios para la Content-Security-Policy.** No publicados; la lista de §4 sale de leer el SDK.
11. **Accesibilidad** del Brick y de Secure Fields (teclado, lector de pantalla, contraste).
12. **Si el Brick hereda la tipografía de la página**, dado que no hay variable de familia tipográfica.
13. **Si el Card Payment Brick pide identificación (CURP) en México.** La API la marca opcional.
14. **Si `payer.email` es obligatorio para tarjeta en Payments API.** Figura como opcional; todos los
    ejemplos lo mandan.
15. **Cuántos pagos se rechazan en México por `cc_rejected_3ds_mandatory`** con 3DS apagado.
16. **Tiempo límite del reto 3DS en Payments API:** una página dice «unos 5 minutos», la de Bricks habla de
    30 segundos para iniciarlo, y la guía de migración dice «no documentado».
17. **Apple Pay con vendedores conectados por OAuth.** Sin mención. Todo indica habilitación y certificados
    por cuenta. Tampoco se dice de dónde sale `X-Product-ID`.
18. **Google Pay en México.** Sin documentación; el SDK contiene referencias a `pay.google.com`.
19. **A quién le toca el SAQ de PCI** en una plataforma: a VIM, a cada restaurante o a ambos.
20. **Credenciales de prueba en Orders:** las guías dicen usar el access token de prueba; la referencia
    dice que no hay soporte y que se usen usuarios de prueba con credenciales de producción.
21. **Pruebas de punta a punta con OAuth** y el papel de la cuenta de prueba «integrador».
22. **Medición de calidad en una plataforma:** qué aplicación y qué pagos cuentan, y la lista exacta de
    campos que puntúan.
23. **Lista de valores de `action`** en las notificaciones `order`; solo se vio `order.processed`.
