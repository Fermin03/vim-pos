# Pago en línea de la tienda — diseño vigente (Orders API, formulario propio, conexión propia)

Actualizado el 13 de octubre de 2026 (modo de prueba y freno tras un rechazo por riesgo). Sustituye al diseño con Payments API y conexión compartida con
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
(`3ds_challenge_failed`: el banco no confirmó el reto), `SIN_VERIFICAR` (el reto se dejó: lo canceló
el cliente o pasó el plazo), `OTRO`.

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
- **Un reto pendiente NO se puede cancelar en Mercado Pago (422) y sigue vivo al menos 45 minutos**
  (documento 04). Todo lo de «dejar el reto» se hace de NUESTRO lado y no depende de Mercado Pago:
  - **«Cancelar»** (`verificacion` con `cancelar: true`): se decide con la orden a la vista. Si
    sigue en el reto, el pedido se cierra «sin pago» y se contesta 409 `SIN_VERIFICAR` **en el
    acto**: el cliente paga otra vez enseguida, con otra clave, otro pedido y otra orden (vale
    aunque nadie hubiera anotado la verificación: se anota ahí). Si el cliente ya la había
    contestado: cobrada → se le da su pedido; cobrándose (`processing`, `in_review`) → **no se
    deja**, `POR_CONFIRMAR`. Si Mercado Pago no contesta, tampoco se deja a ciegas (la tienda
    vuelve a pedirlo). Y la tienda **no ofrece «Cancelar» desde que la página del reto avisa que
    terminó**: el pago puede estar aprobándose.
  - **El aviso de «terminó» puede llegar antes de tiempo** (solo está verificado en el ambiente de
    prueba): la tienda quita el marco y pregunta seguido; si tras esas vueltas el servidor sigue
    diciendo `VERIFICACION`, el marco vuelve (con la dirección de esa respuesta) y con él «Cancelar».
  - **Plazo: 10 minutos desde que se mandó el cobro** (los 5 de siempre son para un cobro que
    Mercado Pago no contestó, donde el cliente no tiene que hacer nada; aquí tiene que abrir la
    aplicación de su banco). Al pasar, el barrido de la base hace lo mismo que «Cancelar», solo.
  - **El pago de ese intento queda `ABANDONADO`** (estado nuevo, migración 0175): «el reto se dejó
    y su orden sigue viva en Mercado Pago». El pedido **no se borra**: ese renglón es el que sabe
    qué orden vigilar.
  - **Se vigila hasta que la orden llegue a un final**: el barrido la consulta cada 5 minutos la
    primera media hora y después cada hora, hasta 48 horas (y el aviso de órdenes entra por el
    mismo camino). Si aparece **cobrada** —el cliente contestó tarde, quizá en otra pestaña— es un
    pago que llegó tarde: **se devuelve entero**, con la regla y las esperas de siempre. Si acaba
    `failed`, `canceled` o `expired`, se da por conciliado. Mientras siga pendiente **no** es
    «posible cobro sin pedido» (no hay cobro): no suma fallos ni manda correos. Si a las 48 horas
    sigue pendiente, un correo a VIM («Verificación del banco sin cerrar», con el id de la orden)
    y se deja de consultar; un aviso posterior de Mercado Pago se aplica igual. Se da por cerrado
    solo DESPUÉS de avisar, y se avisa aunque el último vistazo falle: si la función muere a
    medias vuelve a salir a la hora (puede repetirse el correo; no perderse). El barrido de la
    base llama a la función con ese mismo ritmo, no cada minuto.
  - Se **intenta** cancelar la orden una vez por pago (al dejarla el cliente, o en la primera
    consulta ya abandonada), por si en producción se deja: si contesta 2xx se vuelve a leer y se
    aplica como quedó. El 422 es lo normal: no es un fallo y no se registra.
  - **Dos pagos a la vez**: si el cliente deja un reto, paga de nuevo y después contesta el reto
    viejo, el pedido válido es el del segundo intento; el primero se devuelve. Nunca dos pedidos
    por un carrito.
  - Mientras se vigila un reto abandonado, **la cuenta de Mercado Pago no se puede desconectar**
    (`tienda_conexion_ocupada`): si se aprueba tarde hay que poder devolverlo.
  - **La página de ese pedido** dice «No se completó el pago» / «No se completó la verificación con
    tu banco. Tu pedido no se envió al restaurante y no se te cobró nada.» (motivo
    `SIN_VERIFICAR`); si después se aprueba tarde, pasa a los textos de devolución.
  - Un reto que llega **sin una dirección que se pueda abrir** se deja en el acto (nadie puede
    contestarlo), con el mismo final.
- **Un reintento con el reto vivo** (misma clave) no crea otra orden ni otro cobro: consulta la
  misma y devuelve su `url`. **Recargar la página** a medio reto abre «Tus datos» sola, pregunta
  por el intento en duda y continúa el reto.
- **Topes:** un reto que se dejó (`SIN_VERIFICAR`) no cuenta como rechazo; el que el banco
  no confirmó (`VERIFICACION`) cuenta para la IP y no para pausar al negocio (`cuentaComoRechazo`).
- **Una orden `action_required` nunca se da por pagada**, y nunca es una orden «sin aplicar»: el
  barrido la cuenta como consulta buena.

**Orden de despliegue, obligado: migración 0175 → web de la tienda → funciones `tienda` y
`tienda-webhook-mp`.** La migración primero porque las funciones nuevas leen
`tienda_pagos.verificacion_at` en cada pago: sin la columna se cae todo el pago en línea. La web
antes que las funciones porque una pestaña con la web vieja lee `VERIFICACION` como «por
confirmar» y ese cliente nunca vería el reto; la web nueva con la función vieja se porta como hoy
(la función vieja nunca contesta `VERIFICACION`, y a la acción `verificacion` le contesta
`ACCION_INVALIDA`, que la tienda trata como «sin respuesta»: manda a la página del pedido, igual
que antes).

**Pendiente del marco:** no lleva `sandbox` ni `allow`. Sin poder probarlo con un banco real,
cualquiera de los dos podría romper el reto (un banco que pida biometría del navegador podría
necesitar `allow`). Revisarlo con el primer reto real.

**La clave del intento en duda** se guarda por negocio (`vim.tienda.intento.<slug>`). La de antes
(`vim.tienda.intento`, una para todo el dominio) se lee una vez: la primera tienda que la encuentra
la toma como suya —no se puede saber de cuál era—, la pasa a su clave y borra la vieja, para que
nadie que recargue con un cobro en vuelo pueda pagar dos veces.

Para probarlo en la cuenta de prueba: titular `APRO-CHOK` (reto que aprueba), `APRO` a secas
(reto que falla) y `APRO-AUTH` (aprobado sin reto). **`APRO` ya no da un aprobado**, y `FUND`,
`OTHE` y `CALL` ya no dan un rechazo directo (piden reto): con la verificación encendida no hay
titular verificado para un 402.

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

## El freno tras un rechazo por riesgo (0177)

`high_risk` no lo dice el banco: lo dice el antifraude de Mercado Pago. Su soporte pide «evitar
reintentos inmediatos con los mismos datos»: repetir el cobro idéntico empeora la puntuación del
restaurante. Por eso, tras un rechazo con motivo `RIESGO`:

- **Ese cliente no puede cobrar en línea en ese negocio durante 30 minutos.** «Ese cliente» es su
  **teléfono Y su IP a la vez** (IPv6: su /64): una sola clave con los dos. Es un freno para que el
  MISMO cliente no repita el cobro al instante, no una defensa contra el abuso (esa son los topes
  por IP). Con la IP sola frenaría a todos los que comparten red (el wifi del local, un operador
  móvil); con el teléfono solo, cualquiera frenaría a otro escribiendo su número. Consecuencia
  aceptada: quien cambia de red (wifi → datos) o de teléfono ya no está frenado. **Sin IP conocida
  no hay freno.** Solo el pago en línea: puede pedir para pagar al recibir.
- **La clave** es un HMAC-SHA256 de negocio + teléfono + IP con una llave que deriva de
  `VIM_TIENDA_SECRET` (`claveDeFreno`, rechazos.ts; igual que `enlace.ts`). La calcula la función y
  es lo único que llega a la base: de ella no se saca ni el teléfono ni la IP.
- **Mientras dure, `pedir` con pago en línea contesta 409 `PAGO_EN_PAUSA` con `hasta`** (ISO, UTC),
  sin crear el pedido ni llamar a Mercado Pago. Se mira **después del antirobot** (antes serviría
  para preguntar, sin costo, si un teléfono tuvo un rechazo) y antes del cupo del negocio (no lo
  gasta). **No cuenta como rechazo**: no suma a ningún tope de «Contra la prueba masiva de
  tarjetas». El rechazo que lo provocó sí cuenta, una vez, como cualquier otro.
- **El 409 `PAGO_RECHAZADO` con `detalle: "RIESGO"` trae `hasta`.** Si a esa IP ya no se le dice el
  motivo (va `OTRO`), el freno se pone igual y `hasta` no viaja: lo sabrá al intentar otra vez.
- **Dónde vive:** en `limites_cupo` (0136), con su vencimiento (`tienda_pago_frenar`,
  `tienda_pago_frenado`; reciben la clave ya calculada).
- **Quién lo pone:** la función `tienda` cuando el rechazo llega en la respuesta del cobro o al
  terminar la verificación del banco (`respuestaDeRechazo`, rechazos.ts); y un disparador sobre
  `tienda_pagos` cuando llega después —por el aviso, la página del pedido o el barrido—, que es
  como se vio en producción (`in_review` y, segundos después, `failed`). Para eso **el pago guarda
  al nacer su clave de freno** (`tienda_pagos.freno_clave`: la del teléfono y la IP con que se
  pidió): el disparador no conoce el secreto ni la IP. Un pago sin clave no frena a nadie.
- **En la tienda** (`lib/pausa.ts`): no se ofrece repetir el cobro. «Pagar» deja su lugar a
  «Elegir otra forma de pago» —que lleva a «¿Cómo pagas?» con la opción en línea apagada y hasta
  cuándo— o, si en línea es la única forma, a llamar al restaurante. El teléfono lo recuerda para
  que una recarga no haga escribir la tarjeta en balde; quien lo hace valer es el servidor.
- Los demás rechazos (fondos, datos, llamar al banco, verificación fallida) siguen como siempre: se
  corrige y se reintenta.

**Sin verificar:** si 30 minutos es lo que Mercado Pago considera «no inmediato» (su soporte no dio
un número), y si en producción un cobro repetido tras ese tiempo deja de salir `high_risk`.

## Modo de prueba (0177)

Para probar el pago de punta a punta sin dinero real: operación y pasos en
[`docs/operacion/tienda-pago-modo-de-prueba.md`](../../operacion/tienda-pago-modo-de-prueba.md).

- **La marca**: `tienda_config.pago_de_prueba`. Solo la pone VIM por SQL: `authenticated` no tiene
  INSERT ni UPDATE sobre esa columna (privilegios por columna), y ninguna función a su alcance la
  escribe. Tampoco la apaga borrando la fila para crearla otra vez: perdió el DELETE de la tabla y
  un disparador niega borrar la fila con la marca puesta a quien llega con sesión. **Quien añada una columna a `tienda_config` tiene que darle su GRANT** (el smoke lo vigila).
- **La conexión de prueba**: una fila de `tienda_conexiones` con `de_prueba` y su access token en
  Vault, sin refresh ni vencimiento (`tienda_conexion_de_prueba`, solo `service_role`; se niega sin
  la marca). No se renueva: la regla de la renovación ya deja fuera a la que no tiene vencimiento.
  **No es del dueño**: `terminal-mp-conexion` (destino tienda) no la desconecta
  (`CONEXION_DE_PRUEBA`), no canjea con el negocio en modo de prueba (`MODO_DE_PRUEBA`) y no pisa
  con un canje una fila `de_prueba` que ya existe (`CUENTA_DE_PRUEBA`); el admin no pinta
  «Desconectar» en ella.
- **Qué conexión cobra** (`tienda_conexion_cobro`): negocio en modo de prueba → SOLO su conexión de
  prueba (la única activa con `de_prueba`; no se mira la elegida por sucursal); negocio normal →
  NUNCA una de prueba; su regla es la de siempre con un cambio: para «la única activa» cuentan solo
  las reales, así que una de prueba que quedó activa no estorba al apagar el modo. Cada pago guarda
  su conexión: no se mezclan.
- **La orden se verifica igual** (referencia, monto, moneda y cuenta vendedora de la conexión del pago).
- **Avisos**: se acepta la firma de cualquiera de las dos claves y **no** se cruza con el tipo de
  pago, porque la firma no decide nada: la orden se consulta con el token de la conexión del pago y
  tiene que traer su cuenta vendedora. Un aviso con la clave «equivocada» solo provoca una consulta.
- **El pagador**: en un pago de prueba se manda a Mercado Pago el usuario de prueba
  (`MP_TIENDA_PAGADOR_DE_PRUEBA`, solo si termina en `@testuser.com`); el correo del cliente sigue
  siendo el de nuestros correos. Ninguno de los dos llega al rastro de un cobro no aceptado.
- **Topes**: en modo de prueba no cuentan los de tarjetas rechazadas ni los cupos de `pedir` por IP
  y restaurante y por negocio (para eso el de IP y restaurante de un pago en línea se gasta ya con
  el negocio resuelto: `conNegocio` en `cuposDe`; mismos 8 por hora, misma clave). Siguen el
  antirobot, el de 40 por hora por IP y el freno por riesgo. No se pausa nada ni sale correo de pausa.
- **Que se note**: `tienda_negocio` dice `pago_de_prueba` (franja en la pantalla de la tarjeta) y
  `tienda_seguimiento` dice, de cada pedido en línea, si SU pago fue de prueba.

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
