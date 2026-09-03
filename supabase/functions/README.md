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

### Verificar la cuenta del PAC (cargar-csd, acción `verificar`)

`cargar-csd` con `{"accion":"verificar"}` comprueba credencial y modalidad Multiemisor de Facturama
sin gastar folios ni tocar sellos (`FacturamaPac.verificarCuenta()`: `GET /catalogs/PaymentForms` y
`GET /cfdi?type=issuedLite`). Entra con JWT de dueño/admin del tenant o por el camino interno
`x-vim-interno` (mismo secreto que enviar-push). Por eso `verify_jwt = false` en config.toml: la
función valida el JWT por sí misma. Receta en `docs/integraciones/facturama/03-activacion-produccion.md`.

### Push de expirados al dueño (0097)

`enviar-push` acepta, además del JWT de usuario, el camino interno: cabecera `x-vim-interno`
igual al secret `VIM_INTERNO_SECRET` y `tenant_id` en el cuerpo. Lo usa la base de datos:
`delivery_marcar_expirados()` (cron cada minuto) llama a `delivery_avisar_expirados()` que hace
`net.http_post` a `enviar-push` con el secreto leído de Vault (`vim_interno`) y la URL base de
funciones (`vim_functions_url`). Sin pg_net o sin secretos, el marcado sigue y el aviso se omite.

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
