# Mercado Pago Point — la API en 10 minutos

Resumen de la documentación oficial capturada en esta carpeta (8 oct 2026). **Nada de esto está
probado todavía**: es lo que Mercado Pago documenta. Cuando exista una skill con lo verificado
contra el simulador y la terminal real, manda la skill.

## 1. Qué es y qué no

- La terminal trabaja en uno de dos modos (`guias/configure-terminal.md`):

  | Modo | Qué hace |
  |---|---|
  | `STANDALONE` | El de fábrica. El cajero teclea el monto en la terminal. Sin API. |
  | **`PDV`** | La terminal espera a que el punto de venta le mande el cobro. **Único modo con API.** |
  | `UNDEFINED` | Configuración que Mercado Pago no reconoce. |

- Solo **Point Smart 1 y Point Smart 2** (`guias/overview.md`).
- En modo `PDV` la terminal **solo cobra con tarjeta** (crédito, débito, prepago; chip, sin
  contacto o banda). Nada de QR ni saldo de Mercado Pago.
- La API vigente es **Orders** (`/v1/orders`). La anterior, *Payment Intents*
  (`/point/integration-api/…`), se va a descontinuar; hay guía de migración
  (`guias/resources--migrate-payment-intent-to-orders.md`) que **no nos aplica**: empezamos en Orders.
- El dinero cae en la cuenta de Mercado Pago del comercio. El integrador no toca datos de tarjeta.

## 2. Cuentas, credenciales y entornos

- Todo empieza creando una **aplicación** en *Tus integraciones*
  (<https://www.mercadopago.com.mx/developers/panel/app>). Guía: `guias/create-application.md`.
- La aplicación tiene `client_id`, `client_secret`, *Public Key* y *Access Token*. Para Point solo
  importa el **Access Token**, que va en el backend: `Authorization: Bearer <ACCESS_TOKEN>`.
- **No hay un sandbox aparte**: la URL es siempre `https://api.mercadopago.com`. Lo que cambia es
  la credencial. Las de prueba y las de producción **empiezan igual** (`APP_USR-…`), así que el
  prefijo no dice cuál es cuál.
- Al crear la aplicación se generan solas **cuentas de prueba** (vendedor y comprador; hasta 15, no
  se pueden borrar). `guias/resources--test-accounts.md`.
- Dos tipos de integración:

  | | Propia | **Para terceros** (la nuestra) |
  |---|---|---|
  | Quién cobra | El dueño de la aplicación | N comercios, cada uno con su cuenta |
  | Credencial en producción | El Access Token de producción de la app | Un Access Token **por comercio**, obtenido con OAuth |
  | Webhooks | En la app | En la app de la cuenta principal (la del integrador) |

## 3. OAuth: operar en nombre de cada restaurante

Guías `guias/security--oauth--*.md`; referencia `referencia-api/POST-oauth-_oauth_token.md`.

1. En la aplicación se registra la **URL de redireccionamiento**. Debe ser **estática** y coincidir
   exactamente; lo que haya que llevar de ida y vuelta va en `state`, nunca en la URL.
2. Se manda al dueño a:
   `https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=ALEATORIO&redirect_uri=URL`
3. El dueño entra a su Mercado Pago y autoriza. Regresa a la URL con `code` (vale **10 minutos**).
4. `POST https://api.mercadopago.com/oauth/token` con `client_id`, `client_secret`, `code`,
   `redirect_uri`, `grant_type=authorization_code`. Para cuentas de prueba, `test_token=true`.
5. La respuesta trae `access_token`, `refresh_token`, `user_id` (la cuenta del comercio),
   `expires_in`, `scope` (ejemplo: `read write offline_access`).

Puntos que la documentación deja claros:

- El Access Token dura **180 días**. Se renueva con `grant_type=refresh_token` sin molestar al
  dueño, **solo si** el token trae el scope `offline_access`.
- **Cada renovación cambia también el `refresh_token`.** Hay que guardar el nuevo; el viejo deja
  de servir.
- PKCE es opcional y recomendado; se activa en los detalles de la aplicación y entonces
  `code_challenge` y `code_challenge_method` son obligatorios.
- Los parámetros de `/oauth/token` van **en el cuerpo**, nunca en la query; mandar campos de más
  devuelve error (`guias/security--oauth--best-practices.md`).
- El token muere antes de tiempo si el dueño cambia su contraseña, revoca la autorización, o
  Mercado Pago le limpia credenciales por fraude (`guias/security--oauth--management.md`). Hay
  aviso por webhook: tópico `mp-connect`, acciones `application.authorized` y
  `application.deauthorized` (`guias/optional-notifications.md`).
- La otra modalidad, `client_credentials` (token de 6 horas), solo da acceso a los recursos de la
  propia aplicación. No sirve para cobrar en nombre de un comercio.

## 4. Sucursales, cajas y terminales

Mercado Pago tiene su propio árbol y hay que reflejarlo: **sucursal → caja → terminal**.
Guía `guias/configure-terminal.md`; referencia `referencia-api/*-stores-*`, `*-pos-*`, `*-terminals-*`.

| Paso | Endpoint | Lo importante |
|---|---|---|
| Crear sucursal | `POST /users/{user_id}/stores` | `name`, `location` (calle, número, ciudad, estado, **latitud y longitud**), `external_id` opcional (único, ≤ 60). Ciudad y estado tienen que ser exactos: Mercado Pago los usa para impuestos |
| Crear caja | `POST /v2/pos` | `X-Idempotency-Key` obligatorio. `store_id` o `external_store_id`. `external_id` opcional (único, ≤ 40) |
| Listar terminales | `GET /terminals/v1/list?store_id=&pos_id=` | Devuelve `id`, `pos_id`, `store_id`, `external_pos_id`, `operating_mode` |
| Poner en modo PDV | `PATCH /terminals/v1/setup` | `{"terminals":[{"id":"…","operating_mode":"PDV"}]}`. **Hay que reiniciar la terminal** después |

- **Una caja, una terminal.** Cada caja admite una sola terminal en modo PDV. Dos terminales, dos cajas.
- El `id` de la terminal es `tipo + "__" + serie`, por ejemplo `NEWLAND_N950__N950NCB801293324`.
  Los últimos caracteres son el número de serie de la etiqueta trasera.
- **La terminal se liga a la cuenta a mano, no por API:** se enciende, se escanea su QR con la app
  de Mercado Pago del comercio, y en la propia terminal se eligen la sucursal y la caja. Por eso la
  sucursal y la caja tienen que existir antes.
- El modo también se cambia desde la terminal: *Más opciones > Ajustes > Modo de vinculación*.

## 5. Cobrar: crear la order

`POST /v1/orders` — referencia completa en `referencia-api/POST-orders-create-order.md`, guía en
`guias/payment-processing.md`.

```json
{
  "type": "point",
  "external_reference": "id-nuestro-del-cobro",
  "expiration_time": "PT3M",
  "transactions": { "payments": [{ "amount": "348.00" }] },
  "config": {
    "point": { "terminal_id": "NEWLAND_N950__N950NCB801293324", "print_on_terminal": "no_ticket" }
  },
  "description": "Ticket A-1234",
  "integration_data": { "platform_id": "…", "integrator_id": "…", "sponsor": { "id": "…" } }
}
```

- Headers: `Authorization` y **`X-Idempotency-Key`** (único por petición; UUID v4). Repetir la
  llave con el mismo cuerpo devuelve la order ya creada, no una nueva. Repetirla con otro cuerpo
  dentro de 24 h da `409 idempotency_key_already_used`.
- `type` solo puede ser `point`. **Una transacción por order.**
- `external_reference`: única por order, ≤ 64 caracteres, solo letras, números, `-` y `_`.
  **Sin datos personales.** Es lo que Mercado Pago pide para conciliar.
- `amount` es **texto**, con hasta 2 decimales (`"10"`, `"10.5"`, `"10.00"`).
- `expiration_time`: duración ISO 8601, de `PT30S` a `PT3H`. Sin él, **15 minutos**.
- `print_on_terminal`: `seller_ticket` (por defecto: la terminal imprime su comprobante) o `no_ticket`.
- `config.payment_method.default_type`: `credit_card` o `debit_card` para forzar uno; sin él la
  terminal acepta ambos y el cliente elige.
- `description`: ≤ 150 caracteres.
- `integration_data`: identifica al integrador. `sponsor.id` es el `user_id` de Mercado Pago del
  sistema integrador (el nuestro); `platform_id` e `integrator_id` los asigna Mercado Pago.
- La respuesta (201) trae la order en `created` con su `id` (`ORD…`) y el del pago
  (`transactions.payments[0].id`, `PAY…`). **Hay que guardar los dos.**
- La terminal recibe la order sola. Si no aparece, se presiona *Actualizar* o el botón verde.
- Errores que hay que manejar: `409 already_queued_order_for_terminal` (la terminal ya tiene un
  cobro esperando: hay que terminarlo o cancelarlo), `403 forbidden_checking_terminal_owner` (esa
  terminal no es de esta cuenta), `401 unauthorized` (token malo o vencido).
- **Meses sin intereses** no van en la order: se configuran en la cuenta de Mercado Pago del comercio.

## 6. Estados

`guias/resources--status-order-transaction.md`.

| Order | Qué significa | ¿Final? |
|---|---|---|
| `created` | Creada; la terminal aún no la toma | No |
| `at_terminal` | La terminal ya la tiene | No |
| `processed` | Pagada y acreditada | Sí (salvo reembolso posterior) |
| `action_required` | **Hay que mirar la terminal**: no se sabe si pasó. Llega ~40 s después de iniciar | Sí para la API; el resultado real está en la terminal |
| `failed` | No pasó y no va a pasar | Sí |
| `canceled` | Cancelada (API o terminal) | Sí |
| `expired` | Venció sin pago; hay que crear otra | Sí |
| `refunded` | Reembolso total (`processed` + detalle `partially_refunded` si fue parcial) | Sí |

Detalles del pago que importan: `accredited` (éxito); `canceled_by_api`, `canceled_on_terminal`;
`cancellation_requested` (cancelación pedida, sin confirmar); `waiting_payment`,
`check_on_terminal` (los dos de `action_required`). Rechazos: `rejected_by_issuer`,
`insufficient_amount`, `card_disabled`, `bad_filled_card_data`, `required_call_for_authorize`,
`max_attempts_exceeded`, `high_risk`, `amount_limit_exceeded`, `invalid_installments`,
`processing_error`, `in_review`.

## 7. Cancelar, devolver y consultar

| Operación | Endpoint | Notas |
|---|---|---|
| Cancelar | `POST /v1/orders/{id}/cancel` | En `created`: síncrono, **200**, queda `canceled` / `canceled_by_api`. En `at_terminal`: exige el header `x-allow-cancelable-status: at_terminal`, responde **202** y **no es definitivo** hasta el webhook `order.canceled`; sin el header da `409 cannot_cancel_order`. Si el cliente ya está pagando, la terminal puede terminar el cobro en vez de cancelar |
| Reembolsar | `POST /v1/orders/{id}/refund` | **Total:** sin cuerpo. **Parcial:** `{"transactions":[{"id":"PAY…","amount":"24.00"}]}`. Hasta **90 días** después del pago. Errores: `refund_amount_exceeds`, `unsupported_partially_refunds`, `partial_refund_forbidden_with_tips` |
| Consultar | `GET /v1/orders/{id}` | Solo orders de **menos de 3 meses**. Mercado Pago **desaconseja consultarla seguido**: para eso están los webhooks |

- Los tres primeros llevan `X-Idempotency-Key`.
- La cancelación asíncrona solo funciona con el software de la terminal al día.
- La respuesta de consulta trae lo que hace falta para el ticket: `payment_method.type`
  (`credit_card` / `debit_card`), `payment_method.id` (`visa`, `master`, `amex`, `debvisa`,
  `debmaster`), `installments`, `reference_id`, `paid_amount`, `refunded_amount`.

## 8. Avisos (webhooks)

`guias/notifications.md` y `guias/optional-notifications.md`.

- Se configuran **a mano** en *Tus integraciones > Webhooks > Configurar notificaciones*, pestaña
  **Modo productivo** (también para probar: con la sesión de la cuenta de prueba), con una URL
  HTTPS y el evento **Order (Mercado Pago)**.
- En integraciones para terceros la URL es **una sola para todos los comercios**: va en la
  aplicación del integrador. Cada aviso trae `user_id` (la cuenta del comercio).
- Eventos: `order.processed`, `order.canceled`, `order.refunded`, `order.action_required`,
  `order.failed`, `order.expired`.
- Llega como `POST URL?data.id=ORD…&type=order` con cuerpo JSON: `action`, `type`, `user_id`,
  `application_id`, `live_mode`, `date_created`, `id` y `data`. En `order.processed`, `data` trae
  `external_reference`, `status`, `status_detail`, `total_paid_amount` y
  `transactions.payments[]` con `payment_method` (`id`, `type`, `installments`) y `reference.id`.
- **Firma:** header `x-signature: ts=…,v1=…` (HMAC con la clave secreta de la aplicación) más
  `x-request-id`. Los SDK oficiales traen `WebhookSignatureValidator.validate(x-signature,
  x-request-id, data.id, secret)`. La variante «sin SDK» no quedó capturada (ver README); la clave
  secreta no caduca y se puede restablecer desde el panel.
- Hay que responder **200 o 201 en menos de 22 segundos**. Si no, reintenta cada 15 minutos; tras
  el tercer intento espacia más pero sigue.
- El panel tiene **Simular notificación** para probar la URL.
- Opcionales: `mp-connect` (un comercio autorizó o desautorizó la app),
  `topic_chargebacks_wh` (contracargos), `topic_claims_integration_wh` (reclamos).
- Troubleshooting advierte: suscribirse a otros tópicos viejos (*Payments*, *Point integrations*)
  manda avisos que chocan con los de `order`. **Solo Order.**

## 9. Imprimir en la terminal

`guias/configure-printings.md`; referencia `referencia-api/*-impressions-*`.

`POST /terminals/v1/actions` con `type: "print"`, `config.point.terminal_id`,
`config.point.subtype` (`custom` o `image`) y `content`.

- `custom`: texto de **100 a 4096 caracteres** con etiquetas `{b}`, `{w}` (grande), `{s}`
  (pequeña), `{br}`, `{left}`, `{center}`, `{qr}`, `{pdf417}`.
- `image`: PNG en base64.
- Estados `created` → `on_terminal`; se consulta con `GET` y se cancela (solo en `created`) con `POST`.
- Hay que **pedirle a Soporte de Mercado Pago que habilite la impresión** en la cuenta
  (`guias/resources--troubleshooting.md`).

## 10. Probar

`guias/integration-test.md`; referencia `referencia-api/POST-orders-simulate-order.md`.

- **Las cuentas de prueba no cobran en una terminal física.** Las pruebas son simuladas.
- Terminal virtual: número de serie `SBX0000001` con cualquier tipo válido, por ejemplo
  `NEWLAND_N950__SBX0000001`. No hace falta tener una terminal para desarrollar.
- Simulador: `POST /v1/orders/{id}/events` con `status` = `processed`, `failed`, `refunded`,
  `canceled`, `expired` o `action_required`. Responde 204. Para `processed` acepta
  `payment_method_type`, `payment_method_id`, `installments`; para `failed`, el `status_detail` del
  rechazo. El cambio tarda hasta 10 s (hasta 40 s en `action_required`) y dispara los webhooks.
- La prueba de verdad —tarjeta real en terminal real— solo se puede con credenciales de producción.

## 11. Salir a producción y medición de calidad

`guias/go-to-production.md` y `guias/integration-quality.md`.

1. Activar credenciales de producción en la aplicación (industria, sitio web, términos, reCAPTCHA).
2. **Volver a crear sucursales y cajas** con la credencial real (las de prueba quedaron en la
   cuenta de prueba) y **volver a ligar cada terminal** con la cuenta real.
3. Webhooks en modo productivo con la URL de producción.
4. **Medición de calidad** (el «homologador»): en *Tus integraciones* se declara cómo opera la
   integración (cuántas marcas, países y cuentas) y se mide con el `order_id` de **un pago real de
   los últimos 7 días hecho en terminal física**. No acepta la terminal virtual. Mínimo para
   aprobar: **73 puntos y todas las acciones obligatorias resueltas**; recomiendan 100. Obligatorias
   que mencionan: webhooks configurados y `external_reference` en cada order. Recomendadas: mandar
   los ítems de la compra detallados. Hay medición manual y automática.

La documentación no menciona contrato, certificación presencial ni requisito comercial aparte de
esta medición.

## 12. Contracargos y reportes

- **Contracargos** (`referencia-api/*-chargebacks-*`): `GET /v1/chargebacks/{id}`, búsqueda, y
  subir documentación de defensa. El aviso llega por el tópico opcional `topic_chargebacks_wh`. El
  caso es del comercio; el integrador solo puede ayudarle a verlo.
- **Reportes** (`guias/resources--reports--*`): liberaciones de dinero, todas las transacciones y
  otras operaciones; se generan desde el panel o por API. Son del comercio. Útiles si algún día se
  quiere conciliar contra lo depositado.

## 13. Lo que la documentación **no** dice

- Si la terminal puede **pedir propina** por su cuenta en modo PDV. El resumen dice que Point
  «permite propinas» y existe el error `partial_refund_forbidden_with_tips`, pero ningún campo de
  la order lo configura ni lo devuelve.
- Monto mínimo o máximo por cobro.
- Qué le pasa a una order si la **terminal se queda sin internet** a medio cobro.
- Cuánto tarda la order en aparecer en la terminal.
- Comisiones y plazos de depósito (están en la parte comercial del sitio, no aquí).
- Cómo se valida la firma del webhook sin SDK (la pestaña no se capturó; ver README).
