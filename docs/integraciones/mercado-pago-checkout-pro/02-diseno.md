# Pago en línea de la tienda — diseño vigente (Checkout API, formulario propio)

Actualizado el 11 de octubre de 2026. Sustituye al diseño con Checkout Pro (redirección), que se
retiró por completo: ya no hay preferencias, `init_point`, `back_urls`, ni un pedido «falta pagar»
a la vista del cliente. La carpeta conserva el nombre por los enlaces; el estudio de la API vigente
es [`03-resumen-checkout-api.md`](03-resumen-checkout-api.md) y lo verificado antes (firma del
aviso, reembolsos, tarjetas de prueba) sigue en [`01-resumen-api.md`](01-resumen-api.md).

## Qué es

El cliente paga con tarjeta de crédito o débito **dentro de la tienda**, en «Tus datos». El dinero
cae en la cuenta de Mercado Pago del restaurante (su token de OAuth); VIM no cobra comisión.

- **Formulario propio con Secure Fields** de MercadoPago.js: número, vencimiento y código son
  iframes de Mercado Pago dentro de cajas nuestras; el nombre del titular es un campo nuestro.
  Etiquetas, errores, foco y acomodo son de la tienda (`apps/tienda/app/components/tarjeta.tsx`,
  lo puro en `lib/tarjeta.ts`). La librería se carga solo al elegir «Pagar en línea».
- **Payments API** (`POST /v1/payments`) con el access token del restaurante: `binary_mode: true`,
  `installments: 1`, `capture: true`, sin 3DS, sin `application_fee`, sin `statement_descriptor`,
  `external_reference` = id de `tienda_pagos`, `notification_url` = `tienda-webhook-mp?ref=<id>`,
  `payer.email` (el correo es obligatorio al pagar en línea), `X-Idempotency-Key: tienda-pago-<id>`
  y, si la librería lo dio, `X-meli-session-id` (Device ID).
- **Los datos de la tarjeta nunca tocan nuestro servidor ni nuestros logs**: solo viaja el token
  (un solo uso), la marca (`payment_method_id`) y el banco (`issuer_id`).
- **Public key del vendedor**: se guarda en `terminal_conexiones.public_key` al conectar la cuenta
  (respuesta de `/oauth/token`). `tienda_negocio` la entrega por sucursal. Una cuenta sin public key
  guardada no cobra en línea: el admin pide volver a conectarla.

## Flujo

1. «Pagar $X»: el navegador tokeniza con la public key del restaurante y manda `pedir` con
   `pago: "EN_LINEA"`, `propina_pct` y `tarjeta: { token, payment_method_id, issuer_id?, dispositivo? }`.
2. La función `tienda` valida como siempre, crea el pedido `POR_PAGAR` (invisible para la caja y el
   POS: política de lectura de `delivery_pedidos`) con su renglón en `tienda_pagos`, y **cobra en la
   misma petición** (`cobrarPago`, `_shared/tienda/pago-flujo.ts`):
   - **aprobado y verificado** (referencia, cuenta vendedora, moneda, modo; el monto lo comprueba la
     base) → pedido `RECIBIDO` con su ventana de aceptación, correo de confirmación, respuesta con
     el código y `pago: { estado: "PAGADO" }`;
   - **rechazado** (un pago `rejected`, o un 4xx de validación: Mercado Pago no creó pago) → el
     pedido se **borra** (no queda vivo ni cuenta contra el tope) y se contesta
     `409 { error: "PAGO_RECHAZADO", detalle: <familia> }`;
   - **no se supo** (sin respuesta, 5xx, 409, 429, o un estado que no es final) → **nunca** se dice
     «rechazado»: el pedido sigue `POR_PAGAR`, se contesta 200 con `pago: { estado: "POR_CONFIRMAR" }`
     y la tienda va al seguimiento («Confirmando tu pago»).
3. **Un renglón de `tienda_pagos` se cobra una sola vez** (`tienda_pago_tomar_cobro`). El reintento
   del mismo intento de compra (misma `clave`) no vuelve a cobrar: le pregunta a Mercado Pago qué
   pasó con el primero. Tras un rechazo el pedido ya no existe, así que la misma clave crea un
   intento nuevo, con token nuevo.
4. **Conciliación** de lo que quedó sin saberse (igual que antes, con otros plazos): el aviso
   `payment`, `confirmar_pago` desde la página del pedido, y el barrido de cada minuto (desde los
   20 s de mandado el cobro, cada 45 s). Aprobado → `RECIBIDO`. Rechazado → el pedido se cierra como
   «sin pago». A los **5 minutos** sin confirmarse, el pedido vence; si el cobro aparece aprobado
   después, se devuelve solo. Si no se puede preguntar tres veces, correo interno «posible cobro sin
   pedido».
5. Devoluciones automáticas, cancelación tras entregado, la lectura del admin y todo lo de la caja
   (cuenta que nace cobrada, «Listo», corte) no cambian.

## Contrato de `pedir` (pago en línea)

Petición: lo de siempre más `pago: "EN_LINEA"`, `propina_pct` (0, 10, 15, 20), `cliente.email`
obligatorio y

```json
"tarjeta": { "token": "<16–64 letras o números>", "payment_method_id": "master", "issuer_id": "158", "dispositivo": "<Device ID, opcional>" }
```

Respuestas:

| Caso | HTTP | Cuerpo |
|---|---|---|
| Cobro aprobado | 200 | `{ codigo, folio_corto, total_mxn, vence_aceptacion, propina_mxn, total_a_pagar_mxn, pago: { estado: "PAGADO" } }` |
| No se supo | 200 | lo mismo con `vence_aceptacion: null` y `pago: { estado: "POR_CONFIRMAR" }` |
| Rechazado | 409 | `{ error: "PAGO_RECHAZADO", detalle }` con `detalle` ∈ `FONDOS`, `CODIGO`, `FECHA`, `NUMERO`, `LLAMAR_BANCO`, `TARJETA_DESHABILITADA`, `VERIFICACION`, `OTRO` |
| La cuenta ya no cobra | 409 | `{ error: "PAGO_NO_DISPONIBLE" }` (pedido descartado; token rechazado → conexión en ERROR) |
| Cuerpo mal | 400 | `PAGO_INVALIDO` (falta `tarjeta` o no tiene la forma, o viene sin ser en línea), `CLIENTE_INVALIDO` (sin correo) |

Seguimiento de un pedido en línea: `pago_estado` ∈ `PAGADO`, `POR_CONFIRMAR`,
`DEVOLUCION_EN_PROCESO`, `DEVUELTO`, `SIN_PAGO`; más `propina_mxn` y `total_a_pagar_mxn`. Se
retiraron `ESPERANDO_PAGO`, `RECHAZADO`, `vence_pago` e `init_point`.

## Content-Security-Policy de la tienda

`apps/tienda/next.config.mjs`. Mercado Pago no publica la lista; es lo observado en el navegador al
montar los campos y crear un token con una public key de prueba (11 oct 2026):

| Directiva | Orígenes |
|---|---|
| `script-src` | `https://sdk.mercadopago.com` |
| `frame-src` | `https://api.mercadopago.com`, `https://api-static.mercadopago.com`, `https://secure-fields.mercadopago.com` |
| `connect-src` | los tres anteriores y `https://www.mercadolibre.com` (huella del dispositivo) |
| `img-src` | `https://www.mercadolibre.com` |

Se dejan bloqueados a propósito `https://api.mercadolibre.com/tracks` (telemetría) y
`https://www.mercadolivre.com` (imagen de huella): con ellos bloqueados los campos montan y el token
se crea.

## Sin confirmar (solo se resuelve con un pago de prueba real)

1. Que `POST /v1/payments` acepte el token OAuth de un vendedor con un token de tarjeta creado con
   la public key de esa cuenta, sin habilitar nada más en la aplicación.
2. Que la `public_key` de `/oauth/token` sea la del vendedor (y si viene también al renovar).
3. Qué contesta Mercado Pago al repetir la misma `X-Idempotency-Key` (no se depende de ello: cada
   renglón se cobra una vez).
4. Con `binary_mode: true`, que el titular de prueba `CONT` termine rechazado y no pendiente.
5. Los `status_detail` reales de cada rechazo de prueba (`FUND`, `SECU`, `EXPI`, `CALL`, `LOCK`).
6. Que el aviso `payment` llegue a la `notification_url` del cobro (los pagos de prueba no avisan).
7. El Device ID: en local `window.MP_DEVICE_SESSION_ID` no apareció; el cobro va sin esa cabecera.
8. Cuántos pagos rechaza el banco por pedir 3DS (`VERIFICACION`).
9. El banco emisor cuando la librería devuelve varios (`issuer_id` va vacío en ese caso).

## Cómo probar el cobro real (lo corre quien tiene el access token de prueba)

1. Aplicar 0171 y 0172 en un entorno de prueba y desplegar `tienda`, `tienda-webhook-mp` y
   `terminal-mp-conexion`.
2. Conectar la cuenta de prueba desde el admin (Tienda en línea → Conectar Mercado Pago): guarda
   tokens y `public_key`. Encender «Pago en línea» en Pedidos.
3. En la tienda: carrito → Tus datos → Pagar en línea, correo `test@testuser.com`, tarjeta
   `5474 9254 3267 0366`, `11/30`, `123`, titular `APRO` → debe quedar «En proceso» y el pedido
   aparecer en la caja como «PAGADO EN LÍNEA, no cobrar».
4. Repetir con titular `FUND`, `SECU`, `EXPI`, `CALL`, `LOCK`, `OTHE` y `CONT`: cada uno debe
   dejar su mensaje junto a la tarjeta, sin pedido en la caja y sin renglón vivo en `tienda_pagos`.
5. Revisar en Admin → «Últimos pagos en línea» y en la cuenta de prueba de Mercado Pago que hay un
   cobro por intento aprobado y ninguno duplicado.
