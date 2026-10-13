# Pago en línea de la tienda — diseño vigente (Orders API, formulario propio, conexión propia)

Actualizado el 12 de octubre de 2026 (verificación del banco). Sustituye al diseño con Payments API y conexión compartida con
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

`pedir` con `pago: "EN_LINEA"`, `propina_pct` (o, en su lugar, `propina_mxn`: «otro monto» en pesos, de hasta el
subtotal de los productos; migración 0174) y `tarjeta: { token, payment_method_id, type }` crea el
pedido `POR_PAGAR` (invisible para la caja) y cobra en la misma petición, con
`X-Idempotency-Key: tienda-pago-<id de tienda_pagos>` y `external_reference` = ese id.

| Mercado Pago contesta | Qué se hace | `pedir` contesta |
|---|---|---|
| 201 `processed` / `accredited`, con nuestra referencia y el monto esperado | pedido `RECIBIDO`, correo | 200 `pago: { estado: "PAGADO" }` |
| **402** con `errors[].code === "failed"` (no hay orden) | el pedido se borra | 409 `PAGO_RECHAZADO` + `detalle` |
| 201 `processing` (en revisión; **no se puede cancelar**) | se anota la orden; conciliación | 200 `pago: { estado: "POR_CONFIRMAR" }` |
| 201 `action_required` / `pending_challenge` (el banco pide confirmar: 3D Secure) | se anota la orden y el pago recibe su plazo de verificación; nada cobrado | 200 `pago: { estado: "VERIFICACION", url }` |
| 401 | el pedido se borra; pausa de la sucursal 1 h y aviso a VIM | 409 `PAGO_NO_DISPONIBLE` |
| 402 `failed` con motivo `invalid_card_token` (token inventado o usado) | el pedido se borra; cuenta para el tope de la IP, no del negocio | 409 `PAGO_NO_PROCESADO` |
| 400 / 422 (validación) | se busca la orden por referencia: si Mercado Pago confirma que no hay, el pedido se borra; si no se puede comprobar, se conserva | 409 `PAGO_NO_PROCESADO`, o 200 `POR_CONFIRMAR` |
| sin respuesta, 5xx, 409, 429, otro | nada: conciliación | 200 `pago: { estado: "POR_CONFIRMAR" }` |

`detalle` ∈ `FONDOS` (`insufficient_amount`), `DATOS` (`bad_filled_card_data`: código y fecha no se
distinguen), `LLAMAR_BANCO`, `TARJETA_DESHABILITADA`, `RIESGO` (`high_risk`), `VERIFICACION`
(`3ds_challenge_failed`: el banco no confirmó el reto), `SIN_VERIFICAR` (el reto no se contestó: se
canceló o venció), `OTRO`.

## La verificación del banco (3D Secure)

La orden se crea con `config.online.transaction_security: { validation: "on_fraud_risk",
liability_shift: "required" }`: cuando el antifraude de Mercado Pago duda, en vez de rechazar
(`high_risk`) le pide al cliente confirmar con su banco.

- **`pedir` contesta `VERIFICACION` con la `url` del reto.** El pedido sigue `POR_PAGAR` (invisible
  para la caja, el POS y el admin, como siempre hasta `RECIBIDO`), con su orden anotada. La `url` se
  valida —https y host de una lista cerrada, hoy solo `www.mercadopago.com.mx`
  (`HOSTS_DEL_RETO`)— y **no se guarda en ningún lado**: lleva un token del cliente y Mercado Pago
  la vuelve a dar al consultar la orden.
- **La tienda abre el reto en un marco**, en la pantalla de la tarjeta, y pregunta cómo va con la
  acción **`verificacion`** (`{ negocio, codigo, cancelar? }`): cada 10 s, al volver a la pestaña y
  en cuanto la página del reto avisa que terminó (`postMessage` `{"status":"COMPLETE"}`, que solo
  sirve para preguntar antes: nunca como verdad). Contesta `VERIFICACION` (sigue; con la `url` si
  se consultó), `PAGADO`, `POR_CONFIRMAR` (ya no espera el reto y falta el resultado: lo dice la
  página del pedido) o 409 `PAGO_RECHAZADO` con su `detalle` (el pedido se descartó: se puede pagar
  otra vez, como tras un rechazo directo). A lo sumo una consulta a Mercado Pago cada 3 s por pago;
  gasta de la bolsa de cupo de `confirmar_pago`.
- **El resultado lo dicen el aviso de órdenes y la consulta** (`confirmarPago`, el camino de
  siempre): `processed` / `accredited` verificado → `RECIBIDO` y correo; `failed` → rechazo.
- **Plazo: 10 minutos desde que se mandó el cobro** (migración 0175; los 5 de siempre son para un
  cobro que Mercado Pago no contestó, donde el cliente no tiene que hacer nada; aquí tiene que
  abrir la aplicación de su banco). Al pasar, quien consulte la orden —el barrido, la página o el
  aviso— la **cancela** en Mercado Pago y aplica lo que quede: cancelada → el pedido se cierra «sin
  pago» de inmediato; cobrada en el último segundo → pagado. Si no se deja cancelar, cuenta como
  consulta fallida (al tercer fallo, correo a VIM) y a los 12 minutos la base vence el pedido como
  cualquier otro. No depende del plazo de Mercado Pago, que no vence pronto un reto abandonado.
- **«Cancelar»** (`verificacion` con `cancelar: true`) cancela la orden en el acto. La tienda solo
  deja pagar otra vez cuando el servidor confirma que quedó cancelada; mientras, «Confirmando tu
  pago».
- **Un reintento con el reto vivo** (misma clave) no crea otra orden ni otro cobro: consulta la
  misma y devuelve su `url`. **Recargar la página** a medio reto abre «Tus datos» sola, pregunta
  por el intento en duda y continúa el reto.
- **Topes:** un reto que nadie contestó (`SIN_VERIFICAR`) no cuenta como rechazo; el que el banco
  no confirmó (`VERIFICACION`) cuenta para la IP y no para pausar al negocio (`cuentaComoRechazo`).
- **Una orden `action_required` nunca se da por pagada**, y dentro de su plazo no es una orden
  «sin aplicar»: el barrido la cuenta como consulta buena (no suma fallos ni avisa a VIM).

Para probarlo en la cuenta de prueba: titular `APRO-CHOK` (reto que aprueba), `APRO` a secas
(reto que falla) y `APRO-AUTH` (aprobado sin reto). **`APRO` ya no da un aprobado.**

**Cuenta vendedora (verificado).** La orden trae `user_id`, el id de la cuenta vendedora, como
texto: tiene que ser el de la conexión que cobra ese pago. Además `currency` es `MXN`, la
referencia es la nuestra y el monto es el esperado (lo comprueba la base). La orden no trae
`live_mode`: que una conexión de prueba (`live_mode: false` al conectarla) no cobre lo decide solo
la marca de la conexión.

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
- El barrido de cada minuto, el plazo de 5 minutos y la página del pedido (`confirmar_pago`) no cambian
  (el pago que espera la verificación del banco tiene su plazo propio: ver arriba).
  Si el barrido no puede correr (faltan `vim_interno` / `vim_functions_url` en Vault) deja un renglón
  por hora en `tienda_eventos` (`accion = 'barrido:sin_configurar'`).
- Una orden viva con nuestra referencia que no se puede aplicar no cuenta como conciliada; al tercer
  intento sale el correo «posible cobro sin pedido», con el id de la orden y el motivo.

## Contra la prueba masiva de tarjetas

Contadores en `limites_cupo` (cuentan aunque el pedido rechazado se borre):

- 3 rechazos de una IP en una hora → del siguiente en adelante su `detalle` es `OTRO`;
- 5 → esa IP recibe 429 `DEMASIADOS_INTENTOS` al intentar otro pago en línea esa hora;
- 20 rechazos de tarjetas reales en un negocio en una hora, **desde al menos 8 IP distintas** → su
  pago en línea se pausa una hora (`tienda_config.pago_pausado_hasta`) y se avisa a VIM. Los pedidos
  al recibir siguen. Un atacante con pocas IP no lo puede provocar: cada IP aporta a lo sumo 5 por
  hora, y lo que no es una tarjeta (token inventado, petición no aceptada) no cuenta para el negocio.
- Los pedidos en línea gastan bolsas de cupo propias (`tienda:paga:*`), no las de `pedir` al recibir.

## Lo que el cliente nunca lee sin estar comprobado

- **«No se te cobró nada»** (`SIN_PAGO`) solo tras la SEGUNDA conciliación sin orden (la de una
  hora después del plazo) o cuando el cobro nunca se mandó. Hasta entonces el pedido vencido sigue
  «Confirmando tu pago», en el seguimiento y en «Mis pedidos» (`_tienda_pago_sin_confirmar`).
- **Otro intento de pago**: desde que sale un cobro y hasta saber qué pasó, la tienda no emite otra
  clave de intento (cambie lo que cambie el cliente, y aunque recargue). Le pregunta al servidor por
  esa clave (acción `intento`, que no crea ni cobra nada) y solo un «no existe» libera el formulario.

## Otras reglas

- **La caja declara que atiende pedidos pagados** (`pago_en_linea: true` en su sondeo →
  `cajas.espejo_pago_en_linea_at`). De esa marca, y no del número de versión, depende que la tienda
  ofrezca el pago en línea en la sucursal y que un pedido pagado se le encargue a una caja.
- **Desconectar la cuenta** se niega mientras haya un cobro sin resolver, una devolución por hacer o
  fallida, o un cobro de las últimas 48 horas (`tienda_conexion_ocupada`); dice por qué y hasta cuándo.

## En la caja

- Si la nube cancela un pedido pagado que la caja ya aceptó (15 minutos sin internet), el pago se
  devuelve y la caja avisa en rojo que el pago ya se devolvió y que hay que cancelar esa cuenta (y
  cobrarla de otra forma si ya se entregó). Cancelarla no devuelve otra vez.
- Cancelar una cuenta pagada en línea devuelve el pago solo dentro de las 48 horas en que la caja lo
  reporta. Después, el POS no la cancela: manda a devolver desde Mercado Pago.

## Sin confirmar (solo se resuelve con una prueba real)

Ver «Sin probar» en el documento 04. Además: que `/oauth/token` de la aplicación nueva entregue
`public_key`, y qué `live_mode` da un vendedor de prueba conectado por OAuth.

## Renovación de los tokens

El access token dura 180 días. Una vez al día (10:50 UTC) la base llama a `tienda-mp-renovar`
(pg_cron → pg_net, `x-vim-interno`), que renueva las conexiones ACTIVAS que vencen en menos de 30
días con `MP_TIENDA_CLIENT_ID` / `MP_TIENDA_CLIENT_SECRET`, guarda el par nuevo en Vault (los dos
o ninguno) y actualiza la `public_key` si viene. Un fallo pasajero se reintenta al día siguiente
sin tocar la conexión. Solo si Mercado Pago dice `invalid_grant`, o si el par nuevo no se pudo
guardar, la conexión queda en ERROR (el admin pide reconectar) y se avisa a VIM.
