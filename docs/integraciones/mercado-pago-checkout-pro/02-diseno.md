# Pago en línea de la tienda — diseño vigente (Orders API, formulario propio, conexión propia)

Actualizado el 11 de octubre de 2026. Sustituye al diseño con Payments API y conexión compartida con
la terminal, que a su vez sustituyó a Checkout Pro. Lo probado contra Mercado Pago está en
[`04-verificado-orders.md`](04-verificado-orders.md) y **manda sobre este documento**. Firma del
aviso, OAuth y tarjetas de prueba: [`01-resumen-api.md`](01-resumen-api.md) y
[`03-resumen-checkout-api.md`](03-resumen-checkout-api.md). La carpeta conserva el nombre por los enlaces.

## Qué es

El cliente paga con tarjeta de crédito o débito **dentro de la tienda**, en «Tus datos». El dinero
cae en la cuenta de Mercado Pago del restaurante; VIM no cobra comisión.

- **Aplicación propia: «VIM POS Tienda»** (Pagos online → Checkout API → API de Orders). No es la
  de la terminal Point: Mercado Pago admite un solo producto por aplicación.
- **Conexión propia por restaurante**: tabla `tienda_conexiones` (0173), tokens en Vault
  (`tienda:<conexion>:access` / `:refresh`), su public key y si es de prueba. Nada de la tienda lee
  ni escribe `terminal_conexiones`, ni al revés. Se conecta y se desconecta desde **Tienda en línea**
  en el admin; el OAuth entra por `terminal-mp-conexion` con `destino: "tienda"` (lista cerrada) y
  vuelve a la misma URL registrada (`/integraciones/mercado-pago/callback`), que distingue por el
  `state` (el de la tienda empieza por `tienda.`).
- **Formulario propio con Secure Fields** de MercadoPago.js. De la tarjeta solo sale el token (un
  solo uso), la marca (`payment_method_id`) y el tipo (`credit_card` | `debit_card`).

## Cobrar (`POST /v1/orders`)

`pedir` con `pago: "EN_LINEA"`, `propina_pct` y `tarjeta: { token, payment_method_id, type }` crea el
pedido `POR_PAGAR` (invisible para la caja) y cobra en la misma petición, con
`X-Idempotency-Key: tienda-pago-<id de tienda_pagos>` y `external_reference` = ese id.

| Mercado Pago contesta | Qué se hace | `pedir` contesta |
|---|---|---|
| 201 `processed` / `accredited`, con nuestra referencia y el monto esperado | pedido `RECIBIDO`, correo | 200 `pago: { estado: "PAGADO" }` |
| **402** con `errors[].code === "failed"` (no hay orden) | el pedido se borra | 409 `PAGO_RECHAZADO` + `detalle` |
| 201 `processing` (en revisión; **no se puede cancelar**) | se anota la orden; conciliación | 200 `pago: { estado: "POR_CONFIRMAR" }` |
| 401 | el pedido se borra; pausa de la sucursal 1 h y aviso a VIM | 409 `PAGO_NO_DISPONIBLE` |
| 400 / 422 (validación: no se creó nada) | el pedido se borra | 409 `PAGO_RECHAZADO`, `detalle: "OTRO"` |
| sin respuesta, 5xx, 409, 429, otro | nada: conciliación | 200 `pago: { estado: "POR_CONFIRMAR" }` |

`detalle` ∈ `FONDOS` (`insufficient_amount`), `DATOS` (`bad_filled_card_data`: código y fecha no se
distinguen), `LLAMAR_BANCO`, `TARJETA_DESHABILITADA`, `OTRO`.

**Cuenta vendedora.** No está probado que la orden traiga un campo que la identifique. La garantía
es que la orden se creó o se consultó con el token de ESA conexión, trae nuestra referencia y el
monto es el esperado (lo comprueba la base). Si la orden trae `live_mode`, tiene que casar con la
conexión. Una conexión de prueba (`live_mode: false` al conectarla) nunca cobra.

## Conciliar, devolver, avisos

- **Consultar**: `GET /v1/orders/{id}` cuando se sabe la orden (quedó anotada, o la dice un aviso).
  Solo si al crearla no hubo respuesta se busca por referencia (`begin_date`/`end_date`).
- **Devolver**: `POST /v1/orders/{id}/refund` sin cuerpo. Llave de idempotencia **nueva en cada
  intento**; antes de cada intento se mira la orden y, si ya está `refunded`, se marca devuelto sin
  pedir otra. Primer intento no antes de 1 minuto del cobro; esperas de 1, 5 y 30 minutos, 3 y 12
  horas; al sexto fallo, `DEVOLUCION_FALLIDA` y correo a VIM.
- **Avisos**: llegan a la URL configurada en la aplicación (`tienda-webhook-mp`), con **firma
  obligatoria** (`MP_TIENDA_WEBHOOK_SECRET`, `MP_TIENDA_WEBHOOK_SECRET_PRUEBA`). Siguen siendo solo
  una pista: la verdad sale de consultar la orden con el token de la conexión.
- El barrido de cada minuto, el plazo de 5 minutos y la página del pedido (`confirmar_pago`) no cambian.
  Si el barrido no puede correr (faltan `vim_interno` / `vim_functions_url` en Vault) deja un renglón
  por hora en `tienda_eventos` (`accion = 'barrido:sin_configurar'`).
- Una orden viva con nuestra referencia que no se puede aplicar no cuenta como conciliada; al tercer
  intento sale el correo «posible cobro sin pedido», con el id de la orden y el motivo.

## Contra la prueba masiva de tarjetas

Contadores en `limites_cupo` (cuentan aunque el pedido rechazado se borre):

- 3 rechazos de una IP en una hora → del siguiente en adelante su `detalle` es `OTRO`;
- 5 → esa IP recibe 429 `DEMASIADOS_INTENTOS` al intentar otro pago en línea esa hora;
- 12 rechazos en un negocio en una hora → su pago en línea se pausa una hora
  (`tienda_config.pago_pausado_hasta`) y se avisa a VIM. Los pedidos al recibir siguen.
- Los pedidos en línea gastan bolsas de cupo propias (`tienda:paga:*`), no las de `pedir` al recibir.

## En la caja

- Si la nube cancela un pedido pagado que la caja ya aceptó (15 minutos sin internet), el pago se
  devuelve y la caja avisa en rojo que el pago ya se devolvió y que hay que cancelar esa cuenta (y
  cobrarla de otra forma si ya se entregó). Cancelarla no devuelve otra vez.
- Cancelar una cuenta pagada en línea devuelve el pago solo dentro de las 48 horas en que la caja lo
  reporta. Después, el POS no la cancela: manda a devolver desde Mercado Pago.

## Sin confirmar (solo se resuelve con una prueba real)

Ver «Sin probar» en el documento 04. Además: el formato de `begin_date`/`end_date`; que
`/oauth/token` de la aplicación nueva entregue `public_key`; qué `live_mode` da un vendedor de prueba
conectado por OAuth; y que nada renueva todavía los tokens de la tienda (vencen a los 180 días).
