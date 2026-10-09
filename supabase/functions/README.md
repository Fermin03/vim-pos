# Edge Functions — VIM POS

## `pin-login` (doc 1F §5)

Verifica el PIN de un empleado (RPC `verificar_pin_login`, migración 0006) y acuña
un **JWT de empleado** firmado HS256 con el JWT secret del proyecto. El RLS lo acepta
porque va firmado con el mismo secreto que usa GoTrue.

### Probar el esqueleto de autenticación (local)

Necesitas el stack local arriba con el fixture de dev cargado:

```powershell
cd "D:\...\vim-pos"
supabase start
supabase db reset            # carga seed.sql, incluido el fixture DEV (María, PIN 1234)
```

El fixture crea (UUIDs fijos):
- Cajero **María** = `99999999-0000-0000-0000-000000000001`, PIN **1234**
- Caja = `99999999-0000-0000-0000-0000000000cc` (tenant Knock-Out)

Sirve la función (en otra terminal). `--no-verify-jwt` permite llamarla sin sesión de
dispositivo durante la prueba:

```powershell
supabase functions serve pin-login --env-file supabase/functions/.env --no-verify-jwt
```

Toma el **anon key** local de `supabase status` (campo "anon key") y guárdalo:

```powershell
$ANON = "<anon key local de supabase status>"
$base = "http://127.0.0.1:54321"
```

**1) Login con PIN correcto** → debe devolver `access_token`:

```powershell
$r = Invoke-RestMethod -Method Post -Uri "$base/functions/v1/pin-login" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $ANON" } `
  -ContentType "application/json" `
  -Body '{"usuario_id":"99999999-0000-0000-0000-000000000001","pin":"1234","caja_id":"99999999-0000-0000-0000-0000000000cc"}'
$r | ConvertTo-Json
$TOKEN = $r.access_token
```

**2) El JWT acuñado respeta RLS** → con ese token, listar sucursales debe devolver
SOLO la de Knock-Out (aislamiento por tenant funcionando con el token de pin-login):

```powershell
Invoke-RestMethod -Method Get -Uri "$base/rest/v1/sucursales?select=codigo,nombre" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $TOKEN" }
# Esperado: [ { "codigo": "KC", "nombre": "León Centro" } ]
```

**3) PIN incorrecto** → debe devolver 401:

```powershell
Invoke-RestMethod -Method Post -Uri "$base/functions/v1/pin-login" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $ANON" } `
  -ContentType "application/json" `
  -Body '{"usuario_id":"99999999-0000-0000-0000-000000000001","pin":"0000","caja_id":"99999999-0000-0000-0000-0000000000cc"}'
# Esperado: error 401 PIN_INCORRECTO (y a los 3 intentos: bloqueo 5 min)
```

Si el paso 2 devuelve solo la sucursal de Knock-Out, **la cadena de auth está validada**:
PIN → JWT de empleado → RLS por tenant. 🎉

## `delivery-webhook-uber` y `delivery-accion` (ADR 0011)

`delivery-webhook-uber` recibe los webhooks de Uber Eats. Sin JWT; valida `X-Uber-Signature`
(HMAC-SHA256 del cuerpo con el client secret). `delivery-accion` recibe las acciones del cajero
(aceptar / rechazar / listo) con el JWT del empleado. Secrets de las dos: `UBER_ENTORNO`
(`sandbox` | `produccion`), `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, y para el webhook
`UBER_WEBHOOK_SIGNING_KEY` (la *Signing Key* que se captura en el dashboard de Uber al dar de alta
el webhook con "Basic HMAC"; opcional `UBER_WEBHOOK_SIGNING_KEY_2` para rotarla). La firma
`X-Uber-Signature` se valida contra la signing key y, como respaldo, contra el client secret.

### `delivery-uber-conexion` — conectar tiendas de Uber Eats desde el admin (F1b)

JWT del admin (jerarquía ≥ 4, se lee de `usuarios_acceso` → `roles.jerarquia`). Cuerpo
`{ accion, ... }`: `intercambiar` (`code` OAuth → token del dueño en `delivery_autorizaciones` +
lista de tiendas), `tiendas`, `activar` (`tienda_id`, `sucursal_id`, `auto_aceptar`,
`tiempo_prep_min`, `terminos_aceptados`), `pausar`, `reanudar`, `desconectar` y `verificar`
(`conexion_id`). Secrets: los de F1 más `UBER_REDIRECT_URI` (la URL de callback registrada en la
app de Uber: `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback`). Errores:
`SIN_PERMISO` 403, `SIN_AUTORIZACION` 409, `SUCURSAL_YA_CONECTADA` / `TIENDA_YA_CONECTADA` 409,
`TERMINOS_NO_ACEPTADOS` 400, `CONEXION_NO_EXISTE` 404, `UBER_ERROR` 502. Spec:
`docs/superpowers/specs/2026-09-02-delivery-f1b-conectar-uber-design.md`.
Además (spec A6): `prep` (`conexion_id`, `minutos`) sincroniza el tiempo de preparación a Uber y
luego a `tiempo_prep_min`; `verificar` devuelve también `tienda` (estado normalizado, cacheado 60 s
en `config.tienda`).

Acciones de tienda en `delivery-accion` (POS, spec A6), por `sucursal_id`: `tienda_estado`
(`forzar?`), `tienda_pausar` (`duracion`: `30m` | `1h` | `dia`), `tienda_reanudar`, `tienda_prep`
(`minutos` 1..180). Errores: `SIN_CONEXION_UBER` 404, `TIENDA_ESTRATEGIA_UBER` 409 (la tienda no
tiene estrategia de estado "external": solo se pausa desde Uber Eats Manager),
`PREP_FUERA_DE_RANGO` 400, `UBER_ERROR` 502. Los expirados los marca `delivery_marcar_expirados()`
por pg_cron cada minuto (migración 0093).

### `lealtad-canje` — saldo y canje del programa de lealtad (ADR 0030, 0156)

Entrada única del saldo y del canje; la nube es la única que autoriza un canje. La llaman el POS web
(JWT del empleado) y el puente de la caja (token de dispositivo). Acciones por `POST`: `saldo`
(`lealtad_saldo`), `canjear` (`lealtad_canjear`: bloquea el saldo, valida y descuenta) y `asentar`
(`lealtad_asentar_canje`: pega el canje ya autorizado a una cuenta; desde una caja es solo una
consulta, porque el ticket vive en su Postgres y lo asienta el puente). El negocio sale del token; el
navegador solo aporta el canje, el ticket y el renglón. Sin `config.toml` propio (usa `verify_jwt` por
omisión, igual que `delivery-accion`). Los errores de SQL van al log y el cliente recibe `ERROR_INTERNO`.

### Archivo de comprobantes y `descargar-cfdi` (0098)

Al timbrar (`timbrar-cfdi`, `timbrar-global`, `autofacturar`) se bajan del PAC el XML y el PDF y se
suben con service_role al bucket privado `cfdi` (`_shared/pac/archivo.ts`); `cancelar-cfdi` archiva el
acuse. El bucket no tiene políticas: `descargar-cfdi` (JWT, RLS sobre `tickets_cfdi`) sirve los
archivos en base64 y, si uno falta, lo repone del PAC por su referencia. Las fechas del PAC se
normalizan a la zona de México (`_shared/pac/fechas.ts`): Facturama las manda sin zona.

### Verificar la cuenta del PAC (cargar-csd, acción `verificar`)

`cargar-csd` con `{"accion":"verificar"}` comprueba credencial y modalidad Multiemisor de Facturama
sin gastar folios ni tocar sellos (`FacturamaPac.verificarCuenta()`: `GET /catalogs/PaymentForms` y
`GET /cfdi?type=issuedLite`). Entra con JWT de dueño/admin del tenant o por el camino interno
`x-vim-interno` (mismo secreto que enviar-push). Por eso `verify_jwt = false` en config.toml: la
función valida el JWT por sí misma. Receta en `docs/integraciones/facturama/03-activacion-produccion.md`.

### Push de expirados al dueño (0097)

`enviar-push` acepta, además del JWT de usuario, el camino interno: cabecera `x-vim-interno`
igual al secret `VIM_INTERNO_SECRET` y `tenant_id` en el cuerpo. Lo usa la base de datos:
`delivery_marcar_expirados()` (cron cada minuto) llama a `delivery_avisar_expirados(tenant, sucursal, n, canal)` (el
cuarto argumento, `p_canal`, es de la 0164: `'TIENDA'` o `'APP'`; decide el título y la ruta del aviso)
que hace `net.http_post` a `enviar-push` con el secreto leído de Vault (`vim_interno`) y la URL base de
funciones (`vim_functions_url`). Sin pg_net o sin secretos, el marcado sigue y el aviso se omite.
Desde la 0164 la misma pasada llama al final a `tienda_sincronizar_estados_nube()`, en un bloque
propio (si falla deja un `WARNING` y el marcado no se pierde): pasa a `LISTO`, `ENTREGADO` o
`CANCELADO` los pedidos de la tienda de gestión `NUBE` mirando su ticket, con la regla de
`tienda_seguimiento`. Solo `service_role`; mira los pedidos de los últimos 7 días.

### Tienda en línea propia en `delivery-accion` y `delivery-espejo` (entrega 4)

Los pedidos con `canal = 'TIENDA'` no pasan por Uber: `delivery-accion` los atiende en su propia rama
(sin `uber.*` ni `delivery_eventos`) y `delivery-espejo` se los manda a la caja con la clave `tienda`.

- Sobre un pedido (`pedido_id`): `aceptar` y `rechazar` escriben solo si el pedido sigue `RECIBIDO` o
  `ERROR` (si no, `409 ACCION_INVALIDA`; el de `aceptar` lleva siempre el `estado` en que está el
  pedido, releído, para que la caja distinga «lo aceptó otra pantalla» de «se cerró»); `estado`
  (`estado` = `LISTO` | `ENTREGADO` | `CANCELADO`, y `motivo` de lista cerrada) es **solo de
  dispositivo y solo para pedidos de gestión `ESCRITORIO`** (uno de gestión `NUBE` → `409
  ACCION_INVALIDA`: su estado lo pone la base, ver «Push de expirados») y llama a
  `tienda_reportar_estado` (0164), que solo avanza y devuelve en qué quedó. `listo` no existe en la tienda. `reclamar` es el de siempre.
  Un `aceptar` de gestión `NUBE` crea el ticket en la nube (`crear_ticket_desde_tienda`); una caja
  instalada que lo intente recibe `409`. Si el ticket no se puede armar y reintentar no lo arregla
  (`fallaDeTicket`, `_shared/delivery/enlinea.ts`), el pedido se rechaza y responde
  `PEDIDO_CANCELADO` con la `causa`; lo reintentable (`SIN_TURNO_ABIERTO`, `DUPLICADO`, `RPC_ERROR`)
  responde `409` con su código y no toca el pedido.
- Por sucursal (`sucursal_id`), sin `pedido_id`: `enlinea_estado` → `{participa, aceptacion,
  pausa_hasta, motivo}`; `enlinea_pausar` (`duracion`: `30m` | `1h` | `indefinida`; otra →
  `DURACION_INVALIDA`); `enlinea_reanudar`; `enlinea_presente` (solo empleado: el POS web con turno
  avisa, opcionalmente con su `caja_id`, y sella `cajas.espejo_turno_abierto_at`). Errores:
  `SIN_MODULO_TIENDA` 403 (no usa el módulo de apps), `SUCURSAL_SIN_TIENDA` 404, `SOLO_EMPLEADO` 403.
- `delivery-espejo`: la caja manda `tienda: true` y `turno_abierto`; la respuesta añade
  `tienda: {participa, aceptacion, pausa_hasta}` (o `null` sin módulo). Una caja anterior no manda
  la clave y recibe lo de siempre. Con un pedido vivo de la tienda en gestión `ESCRITORIO` el sondeo
  es rápido (10 s).

### `tienda` — la puerta de la tienda en línea (entregas 2 y 6)

La llama **solo el servidor de `apps/tienda`**, nunca un navegador (sin CORS; `OPTIONS` es 405).
Siempre `POST` con `{ accion, negocio: <slug>, … }` y estas cabeceras:

| Cabecera | Qué es |
|---|---|
| `x-vim-tienda` | El secreto `VIM_TIENDA_SECRET`. Sin él (o sin configurar) todo es `401 NO_AUTORIZADO`. |
| `x-tienda-ip` | La IP del cliente final; de ella salen los cupos y lo que se le dice a Turnstile. |
| `x-tienda-sesion` | El token de sesión de la cuenta (22 caracteres), que el servidor de la tienda saca de su cookie `HttpOnly`. Opcional. Nunca va en el cuerpo. |

El negocio sale siempre del slug y toda RPC va acotada a ese tenant. Orden de comprobaciones:
método → secreto → cuerpo (≤ 32 KB, forma) → cupo por IP → negocio → acción. Estados que usa: 200,
400, 403, 404, 409, 413, 429, 503 (y 401 solo para el secreto). Errores comunes: `CUERPO_INVALIDO`,
`ACCION_INVALIDA`, `NEGOCIO_INVALIDO` 400 · `TIENDA_NO_DISPONIBLE` 404 · `DEMASIADOS_INTENTOS` 429 ·
`SERVICIO_NO_DISPONIBLE` 503 · un rechazo de la base (`CODIGO: detalle`) sale como 409 con el código.

**Pedidos** (entrega 2): `negocio`, `menu`, `cotizar`, `pedir` (antirobot `tienda_pedido`),
`seguimiento`. `pedir` mira la sesión: sin cabecera, invitado; con una sesión válida, el pedido
queda ligado a la cuenta (`p_cuenta`); con una cabecera que no sirve (mal formada, vencida, cerrada
o de otro negocio) → `403 SESION_INVALIDA`, no se degrada a invitado.

**Cuentas** (entrega 6; funciones SQL de la 0166). `cuenta` = `{ nombre, apellido, email, telefono,
fecha_nacimiento }`; nunca sale el id de la cuenta ni el `tenant_id`.

| Acción | Cuerpo | Sesión | 200 | Errores propios |
|---|---|---|---|---|
| `registrar` | `nombre`, `apellido`, `email`, `telefono`, `password`, `captcha` (`tienda_registro`) | no | correo nuevo: `{ ok, sesion, cuenta }` · ya usado: `{ ok }` (y le llega «ya tienes cuenta») | 400 `CUENTA_INVALIDA_DATOS`, 403 `CAPTCHA_INVALIDO`, 429 `DEMASIADOS_INTENTOS` (también por correo) |
| `entrar` | `email`, `password` | no | `{ ok, sesion, cuenta }` | 403 `CREDENCIALES_INVALIDAS` (mala, inexistente o bloqueada: indistinguibles), 400 `CUENTA_INVALIDA_DATOS` |
| `salir` | — | si viene | `{ ok }` siempre | — |
| `recuperar_pedir` | `email`, `captcha` (`tienda_recuperar`) | no | `{ ok }` siempre | 400 `CUENTA_INVALIDA_DATOS`, 403 `CAPTCHA_INVALIDO`, 429 `DEMASIADOS_INTENTOS` (también por correo) |
| `recuperar_aplicar` | `token`, `password` | no | `{ ok, sesion, cuenta }` | 403 `ENLACE_INVALIDO`, 400 `CUENTA_INVALIDA_DATOS` |
| `cuenta` | — | sí | `{ cuenta, direcciones }` | 403 `SESION_INVALIDA` |
| `cuenta_guardar` | `nombre`, `apellido`, `telefono`, `fecha_nacimiento` (`YYYY-MM-DD` o `null`) | sí | `{ cuenta }` | 403 `SESION_INVALIDA`, 400 `CUENTA_INVALIDA_DATOS` |
| `cuenta_password` | `actual`, `nueva` | sí | `{ ok }` (cierra las demás sesiones) | 403 `SESION_INVALIDA` / `CREDENCIALES_INVALIDAS`, 400 `CUENTA_INVALIDA_DATOS` |
| `direccion_guardar` | `id` (o `null` = nueva), `etiqueta` (≤ 40), y los campos de dirección de `pedir`, sueltos o bajo `direccion` | sí | `{ direcciones }` | 403 `SESION_INVALIDA`, 409 `DIRECCIONES_LLENAS`, 400 `DIRECCION_INVALIDA` |
| `direccion_borrar` | `id` | sí | `{ direcciones }` | 403 `SESION_INVALIDA`, 400 `DIRECCION_INVALIDA` |
| `mis_pedidos` | — | sí | `{ pedidos: [{ sucursal_id, folio_corto, recibido_at, modo, estado, total_mxn, renglones, items }] }` | 403 `SESION_INVALIDA` |
| `eliminar_cuenta` | `password` | sí | `{ ok }` | 403 `SESION_INVALIDA` / `CREDENCIALES_INVALIDAS` |

- **Secretos.** La contraseña lleva al menos 8 caracteres y como mucho 72 **bytes** (lo que mira
  bcrypt: con acentos o emojis se llega antes que con 72 letras), tal cual llega (ni se recorta ni
  se normaliza), y solo la base la cifra. La función (`validar.ts`), el SQL (`octet_length`) y la
  pantalla aplican el mismo tope. El token de sesión y el de recuperación nacen aquí
  (`nuevoCodigo()`); a la base va su huella SHA-256. En claro, el de sesión sale una vez, en el
  campo `sesion` (el servidor de la tienda lo vuelve cookie y lo quita de la respuesta), y el de
  recuperación solo en el enlace del correo: `${VIM_TIENDA_URL}/<slug>/recuperar#t=<token>`. Va en
  el fragmento: el navegador no se lo manda al servidor de la tienda, así que no queda en sus
  registros de peticiones; lo lee la pantalla. Nada de eso, ni el correo del cliente, se escribe en el log.
- **Enumeración: dónde no y dónde sí.** `entrar` contesta lo mismo en los tres fallos y
  `recuperar_pedir` hace el mismo camino exista o no la cuenta (el correo sale después de
  responder). **`registrar` sí deja deducir si un correo ya es cliente de ese restaurante**: la
  respuesta trae `cuenta` y `sesion` solo en el alta nueva. Está aceptado (ADR 0032): es lo que
  cuesta entrar de una vez al registrarse, sin confirmar el correo. Lo acotan el antirobot y los
  dos cupos de abajo.
- **Correos** (`_shared/tienda/correo-cuenta.ts`, por `VIM_SMTP_*`, buzón de VIM con el nombre del
  restaurante): bienvenida, «ya tienes cuenta» y recuperación. Van a direcciones que nadie ha
  verificado, así que **no llevan el nombre que se tecleó** (saludo neutro) ni ningún otro dato de
  la cuenta. El asunto va sin acentos a propósito: denomailer rompe el correo si el asunto viaja
  codificado (ver `solicitar-demo`). Su fallo no cambia la respuesta; sin `VIM_SMTP_*` o sin
  `VIM_TIENDA_URL` no sale ninguno y solo queda un aviso en el log.
- **Cupos** (`cuposDe`, tabla de cupos de la 0136; IPv6 por su /64). «Cierra» = si el control de
  cupos no responde, la acción se niega con 503.

| Acción | Cupo | Si el control falla |
|---|---|---|
| `negocio`, `menu`, `cotizar` | 120 / 10 min por IP (`tienda:lee:ip`) | deja pasar |
| `seguimiento` | 90 / 10 min por IP (`tienda:sigue:ip`) | deja pasar |
| `pedir` | 5 / h por IP (`tienda:pide:ip`); tras el antirobot, 60 / h por negocio | cierra |
| `entrar` | 10 / 10 min por IP (`tienda:entra:ip`) | cierra |
| `registrar` | 5 / h por IP (`tienda:registra:ip`); tras el antirobot, 3 / h por huella de negocio+correo (`tienda:registra:correo`) | cierra |
| `recuperar_pedir` | 3 / h por IP (`tienda:recupera:ip`); tras el antirobot, 3 / h por huella de negocio+correo (`tienda:recupera:correo`) | cierra |
| `recuperar_aplicar` | 10 / h por IP (`tienda:aplica:ip`) | cierra |
| `cuenta`, `mis_pedidos`, `salir` | 60 / 10 min por IP (`tienda:cuenta:ip`) | deja pasar |
| `cuenta_guardar`, `cuenta_password`, `direccion_*`, `eliminar_cuenta` | la misma bolsa `tienda:cuenta:ip` | cierra |

Los cupos por correo existen porque esas dos acciones mandan un correo a una dirección sin
verificar; agotados responden `429 DEMASIADOS_INTENTOS` exista o no la cuenta. Los puede agotar un
tercero con tres captchas: la víctima ve «demasiados intentos» durante una hora.

El handler no tiene arnés (Deno y la base): lo probado es `_shared/tienda/*.ts` con `pnpm test:functions`.

### Espejo en la caja de escritorio (spec 2026-09-03)

- `delivery-espejo` (solo dispositivos): sella `cajas.espejo_apps_at` y devuelve conexiones y
  pedidos de la sucursal de la caja (sin credenciales ni `payload_raw`). La llama el agente del
  escritorio cada 10 s.
- `delivery-accion`: acepta también el JWT de **dispositivo**. `reclamar` (`pedido_id`) reclama
  un pedido ESCRITORIO para la caja; `aceptar` en un pedido ESCRITORIO **no** crea ticket en la
  nube: acepta en Uber y pasa a ACEPTADO (el ticket lo crea la caja y sube con el push).
- `sync-push`: tras aplicar el snapshot llama `delivery_enlazar_tickets` (enlace por
  `folio_externo_app`) y devuelve `enlazados`.
- El webhook deja el pedido en `gestion = ESCRITORIO` cuando `sucursal_con_espejo()` es true
  (una caja instalada con latido de menos de 90 s).

Prueba local (stack arriba, `supabase db reset`, una `delivery_conexion` ACTIVA con
`tienda_id_externo = 'store-1'` para la sucursal de Knock-Out y un turno abierto):

```powershell
supabase functions serve delivery-webhook-uber --env-file supabase/functions/.env --no-verify-jwt
$body = '{"event_id":"ev-1","event_type":"orders.notification","event_time":1,"meta":{"user_id":"store-1","resource_id":"ord-1","status":"pos"},"resource_href":"x"}'
$sig = (node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$env:UBER_CLIENT_SECRET" $body)
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/functions/v1/delivery-webhook-uber" -Headers @{ "X-Uber-Signature" = $sig } -ContentType "application/json" -Body $body
```

Esperado: 200 vacío; una fila en `delivery_eventos` con `firma_valida = true`; con el sandbox real
de Uber, una fila en `delivery_pedidos` y (si hay turno) un ticket PAGADO. Firma incorrecta → 401 y
fila con `firma_valida = false`. Cómo se leen los errores: `delivery_eventos.error` y
`delivery_pedidos.ultimo_error`.
