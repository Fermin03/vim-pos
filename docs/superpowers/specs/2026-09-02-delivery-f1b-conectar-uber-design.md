# Delivery F1b — Conectar una tienda de Uber Eats desde el admin

Fecha: 2026-09-02. Estado: aprobado por Fermín en chat. Construye sobre F1 (ADR 0011, migraciones
0090/0091, `delivery-webhook-uber`, `delivery-accion`).

## Objetivo

Que el dueño de un negocio conecte su tienda de Uber Eats a una sucursal de VIM POS **sin ayuda de
VIM**: autoriza en Uber, elige a qué sucursal corresponde cada tienda, y desde ese momento los
pedidos entran al POS. Hoy eso se hace a mano con `curl` y un `INSERT` (runbook
`docs/operacion/delivery-uber-sandbox.md §3`). Además cubre los endpoints de gestión de
integración que el contrato exige (`docs/integraciones/delivery/uber-eats/contrato/README.md`,
obligación A5) y registra la autorización expresa del merchant (obligación B3).

## Decisiones tomadas

- El callback de OAuth vive en el admin: `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback`
  (desarrollo: `http://localhost:3001/configuracion/integraciones/uber/callback`). Ambas se
  registran como Redirect URI en la app de Uber.
- Solo Dueño (5) y Administrador (4) pueden conectar, pausar o desconectar. Una tienda de Uber por
  sucursal (ya lo impone `UNIQUE (sucursal_id, app)` en `delivery_conexiones`).
- El client secret de Uber nunca sale de Supabase: el canje del `code` lo hace una Edge Function.
- El token del dueño (scope `eats.pos_provisioning`) solo se usa para activar; se guarda en una
  tabla temporal y se borra al terminar. La operación diaria usa el token de aplicación de VIM.
- Fuera de alcance: pausar la tienda en Uber (ONLINE/OFFLINE), tiempo de preparación por API,
  alertas de salud, una marca virtual por conexión, DiDi y Rappi.

## Arquitectura

```
Admin (Next, navegador)                 Supabase                          Uber
─────────────────────────               ────────────────────────          ─────────────
/configuracion/integraciones            Edge Function                     auth.uber.com /
  "Conectar con Uber Eats"              delivery-uber-conexion            sandbox-login.uber.com
   → state aleatorio (sessionStorage)                                     api.uber.com /
   → redirige a /oauth/v2/authorize ───────────────────────────────────▶  test-api.uber.com
                                                                          (dueño autoriza)
/configuracion/integraciones/uber/callback?code&state  ◀──────────────────
   valida state
   POST {accion:"intercambiar", code}  ─▶  code → token del dueño ────▶  POST /oauth/v2/token
                                           guarda delivery_autorizaciones
                                           GET /v1/delivery/stores ────▶  (token del dueño)
   ◀── tiendas [{id,nombre,direccion,conectada_a}]
   dueño asigna sucursal por tienda, acepta términos
   POST {accion:"activar", ...}       ─▶  POST /v1/eats/stores/{id}/pos_data (token del dueño)
                                           upsert delivery_conexiones ACTIVA
                                           borra delivery_autorizaciones
   ◀── conexión
```

Después de activar, Uber manda `store.provisioned` al webhook existente y los pedidos llegan por
`orders.notification` como en F1.

## Base de datos — migración `0092_delivery_autorizaciones.sql`

```sql
CREATE TABLE delivery_autorizaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app           modo_servicio NOT NULL CHECK (app IN ('APP_RAPPI','APP_UBEREATS','APP_DIDI')),
  entorno       text NOT NULL CHECK (entorno IN ('sandbox','produccion')),
  access_token  text NOT NULL,
  vence_at      timestamptz NOT NULL,
  creado_por    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, app, entorno)
);
ALTER TABLE delivery_autorizaciones ENABLE ROW LEVEL SECURITY;   -- sin políticas: deny-all
REVOKE ALL ON delivery_autorizaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_autorizaciones TO service_role;
```

Una autorización viva por tenant y app: si el dueño vuelve a autorizar, se reemplaza. Se borra al
activar; si nunca activa, se ignora al vencer (Uber da tokens de ~30 días). Sin cambios en
`delivery_conexiones`; `config` guarda `{"terminos_aceptados_at": ISO, "terminos_aceptados_por": uuid}`.

Después de la migración: `pnpm db:types`.

## Edge Function `delivery-uber-conexion`

`verify_jwt` normal (JWT del admin). Secrets: `UBER_ENTORNO`, `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`
(los mismos de F1) y `UBER_REDIRECT_URI` (la URL registrada en Uber; en local la de localhost).

Entrada: `POST { accion, ...campos }`. Salida JSON. Errores como `{ error: CODIGO, detalle? }`.

Autorización: `admin.auth.getUser(token)` → `usuarios_acceso` activo del usuario → `tenant_id` y
`rol_id` → `roles.jerarquia`. Si `jerarquia < 4` → 403 `SIN_PERMISO`. Todo lo que toca
`delivery_conexiones` filtra por ese `tenant_id`.

| Acción | Campos | Qué hace | Respuesta |
|---|---|---|---|
| `intercambiar` | `code` | `POST /oauth/v2/token` grant `authorization_code` con `redirect_uri` = `UBER_REDIRECT_URI`. Upsert en `delivery_autorizaciones`. `GET /v1/delivery/stores` paginado con el token del dueño. Cruza con `delivery_conexiones` del tenant para marcar las ya conectadas. | `{ tiendas: [{ id, nombre, direccion, ciudad, conectada_a: { sucursal_id, sucursal_nombre } \| null }] }` |
| `tiendas` | — | Solo la lista, con la autorización guardada (para recargar el asistente sin volver a Uber). | igual que arriba; 409 `SIN_AUTORIZACION` si no hay o venció |
| `activar` | `tienda_id`, `sucursal_id`, `auto_aceptar`, `tiempo_prep_min`, `terminos_aceptados: true` | Valida que la sucursal es del tenant y no tiene ya conexión ACTIVA/PAUSADA con Uber; que `terminos_aceptados` es `true`. `POST /v1/eats/stores/{tienda_id}/pos_data` con el token del dueño. Upsert `delivery_conexiones` (estado ACTIVA, `tienda_id_externo`, `tienda_nombre_app`, `auto_aceptar`, `tiempo_prep_min`, `conectada_at`, `config.terminos_*`). Registra evento SALIDA `activar`. Si es la última tienda pendiente, borra la autorización (o siempre: el dueño puede volver a autorizar). | `{ conexion_id }` |
| `pausar` / `reanudar` | `conexion_id` | `PATCH /pos_data { integration_enabled: false/true }` con token de aplicación. Estado PAUSADA/ACTIVA. | `{ estado }` |
| `desconectar` | `conexion_id` | `DELETE /pos_data` con token de aplicación. Estado DESCONECTADA, `desconectada_at`. Si Uber responde 404 se considera desconectada igual. | `{ estado }` |
| `verificar` | `conexion_id` | `GET /pos_data` + `GET /v1/delivery/store/{id}/status` con token de aplicación. Actualiza `ultimo_evento_at`; si `integrator_store_id` no coincide con la sucursal o `integration_enabled` es false, marca ERROR con `ultimo_error`. | `{ integracion_activa, tienda_online, offline_reason?, detalle }` |

Códigos de error: `NO_AUTH` 401, `AUTH_INVALIDA` 401, `SIN_TENANT` 403, `SIN_PERMISO` 403,
`BAD_JSON` 400, `FALTAN_CAMPOS` 400, `ACCION_DESCONOCIDA` 400, `SIN_AUTORIZACION` 409,
`SUCURSAL_NO_EXISTE` 404, `SUCURSAL_YA_CONECTADA` 409, `TIENDA_YA_CONECTADA` 409,
`TERMINOS_NO_ACEPTADOS` 400, `CONEXION_NO_EXISTE` 404, `UBER_ERROR` 502 (con `detalle` =
código/estado de Uber), `UBER_TOKEN_401` 502.

Cada llamada a Uber deja fila en `delivery_eventos` (`direccion SALIDA`, `tipo` = acción,
`http_status`, `respuesta` sin tokens).

### Módulo puro `_shared/delivery/uber-activacion.ts`

Sin I/O, probado con `node --test`:

- `urlAutorizacionUber({ entorno, clientId, redirectUri, state })` → URL de `/oauth/v2/authorize`
  (`auth.uber.com` en producción, `sandbox-login.uber.com` en sandbox) con `response_type=code`,
  `scope=eats.pos_provisioning`, `state`.
- `normalizarTiendasUber(respuesta: unknown)` → `{ id, nombre, direccion, ciudad }[]` (tolera campos
  faltantes; `direccion` = `street_address_line_one` + `unit_number`).
- `cuerpoPosData({ sucursalId, autoAceptar })` → el JSON exacto de `POST /pos_data`:
  `integrator_store_id = sucursalId`, `integrator_brand_id = "vimpos"`, `is_order_manager = true`,
  `require_manual_acceptance = !autoAceptar`, `allowed_customer_requests = { allow_special_instruction_requests: true, allow_single_use_items_requests: false }`,
  `webhooks_config = { webhooks_version: "1.0.0", order_release_webhooks: { is_enabled: false }, schedule_order_webhooks: { is_enabled: true }, delivery_status_webhooks: { is_enabled: true } }`.
- `transicionConexion(estadoActual, accion)` → nuevo estado o lanza `TRANSICION_INVALIDA`
  (`pausar` solo desde ACTIVA, `reanudar` solo desde PAUSADA, `desconectar` desde ACTIVA/PAUSADA/ERROR,
  `activar` desde SIN_CONECTAR/DESCONECTADA/ERROR o sin fila).
- `stateAleatorio()` → 32 hex desde `crypto.getRandomValues` (se usa en el admin, no aquí; vive en
  `apps/admin/app/lib/integraciones.ts`).

### Cliente Uber (`_shared/delivery/uber.ts`)

Se amplía `crearClienteUber` con:
- `canjearCodigo(code, redirectUri)` → `{ access_token, expires_in }` (grant `authorization_code`).
- `listarTiendas(tokenDueno)` → todas las páginas de `GET /v1/delivery/stores`.
- `posData(tiendaId).crear(tokenDueno, cuerpo)`, `.actualizar(cuerpo)`, `.leer()`, `.borrar()`
  (las tres últimas con el token de aplicación).
- `estadoTienda(tiendaId)` → `GET /v1/delivery/store/{id}/status`.

Todo con `fetchFn` inyectable para probar sin red.

## Admin

### Rutas y acceso

- `/configuracion/integraciones` — página "Apps de delivery". Entrada en `config-sidenav.tsx`,
  sección "Operación", después de "Marcas virtuales". Hereda jerarquía mínima 4 de
  `/configuracion` en `acceso.ts` (no hace falta fila nueva).
- `/configuracion/integraciones/uber/callback` — recibe `?code&state` o `?error`.

### `apps/admin/app/lib/integraciones.ts`

- `listarConexiones()` → `delivery_conexiones` del tenant bajo RLS con `sucursal:sucursales(nombre)`.
- `actualizarConexion(id, { auto_aceptar?, tiempo_prep_min? })` → update directo bajo RLS (la
  tabla ya da UPDATE a authenticated).
- `iniciarConexionUber()` → genera `state`, lo guarda en `sessionStorage["vimpos.uber.state"]`,
  devuelve la URL de autorización (usa `urlAutorizacionUber` copiado como helper local con las
  mismas reglas; `NEXT_PUBLIC_UBER_CLIENT_ID`, `NEXT_PUBLIC_UBER_ENTORNO`, redirect = `origin +
  ruta del callback`).
- `validarState(recibido)` → compara con sessionStorage y lo borra.
- `accionConexion(accion, campos)` → `fetch ${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delivery-uber-conexion`
  con el JWT de la sesión; lanza `Error(codigo)`.
- `mensajeErrorIntegracion(codigo)` → texto para el usuario.

### Pantalla "Apps de delivery"

Encabezado con migas Configuración › Apps de delivery. Texto corto: "Conecta tus tiendas de las
apps de reparto para que los pedidos entren solos al POS".

Tabla por sucursal (filas de 40 px, densidad del admin):

| Sucursal | Uber Eats | Auto-aceptar | Prep (min) | Acciones |
|---|---|---|---|---|
| Centro | ● Activa · "Knock-Out Burger Centro" | switch | número | Comprobar · Pausar · Desconectar |
| Norte | ○ Sin conectar | — | — | Conectar |
| Sur | ⏸ Pausada · "KOB Sur" | switch | número | Comprobar · Reanudar · Desconectar |
| Este | ⚠ Error · "…" + `ultimo_error` | switch | número | Comprobar · Desconectar |

- Botón principal arriba: **Conectar con Uber Eats** (siempre visible; lleva al OAuth; el mapeo
  tienda→sucursal se hace en el asistente). "Conectar" en una fila hace lo mismo.
- Auto-aceptar y Prep se editan en línea y guardan al cambiar (`actualizarConexion`).
- Desconectar pide confirmación que nombra la consecuencia: "Los pedidos de Uber Eats de
  *Centro* dejarán de llegar al POS. La tienda sigue existiendo en Uber."
- Debajo, dos tarjetas apagadas: DiDi Food y Rappi, "Próximamente".
- Estados de carga y error como en el resto del admin (`mensajeError`).

### Asistente del callback

1. Si viene `?error` (p. ej. `access_denied`): mensaje "No autorizaste el acceso en Uber" y botón
   Volver a intentar.
2. Si `state` no coincide: "La sesión de conexión no es válida. Vuelve a empezar desde Apps de
   delivery."
3. Con `code` válido: llama `intercambiar`, muestra spinner "Consultando tus tiendas en Uber…".
4. Lista de tiendas de Uber: nombre, dirección, y un selector de sucursal de VIM (`listarSucursales`)
   con la opción "No conectar". Las ya conectadas se muestran deshabilitadas con "Conectada a
   *Centro*". Por tienda: auto-aceptar (default sí) y minutos de preparación (default 15).
5. Checkbox obligatorio: "Autorizo a VIM POS a recibir en mi nombre los pedidos y datos de mis
   tiendas de Uber Eats y a usarlos únicamente para operar y reportar mis ventas."
6. Botón **Activar** por cada tienda asignada (llama `activar` una por una, muestra resultado en
   la fila). Al terminar, enlace "Ir a Apps de delivery".

## Seguridad

- El `code` se canjea una sola vez, en el servidor. `state` aleatorio de 128 bits en sessionStorage
  protege el callback contra CSRF.
- La Edge Function exige jerarquía ≥ 4 además del tenant (el admin no es frontera; RLS y la función
  sí).
- `delivery_autorizaciones` es deny-all para anon/authenticated (pgTAP lo prueba).
- Las respuestas de Uber se registran en `delivery_eventos` sin tokens.
- `NEXT_PUBLIC_UBER_CLIENT_ID` es público por diseño (va en la URL de autorización).

## Pruebas

- `uber-activacion.test.ts` (node --test): URL de autorización por entorno, normalización de
  tiendas con campos faltantes, cuerpo de `pos_data`, tabla de transiciones.
- `uber.test.ts` amplía: canje de código, paginación de tiendas, `posData` con `fetchFn` falso.
- `supabase/tests/0005_delivery_autorizaciones.test.sql`: existe, authenticated no lee ni escribe.
- `apps/admin/app/lib/__tests__/integraciones.test.ts` (vitest): `validarState`, URL de conexión,
  `mensajeErrorIntegracion`.
- `pnpm typecheck` del admin y `pnpm test` completo en verde.
- Navegador con Supabase local: la página muestra "Sin conectar" y el botón arma la URL correcta;
  el callback con `?error=access_denied` y con `state` inválido muestra los mensajes; con la
  función local y `fetchFn` real contra credenciales falsas, el canje devuelve `UBER_ERROR` y el
  asistente lo explica.
- La activación real se prueba cuando Uber asigne las tiendas (runbook §3 pasa a ser "desde el
  admin").

## Documentación que cambia

- `docs/operacion/delivery-uber-sandbox.md §3`: reemplazar los `curl` por los pasos en el admin
  (dejar los `curl` como respaldo).
- `supabase/functions/README.md`: sección de `delivery-uber-conexion` y el secret `UBER_REDIRECT_URI`.
- `docs/integraciones/delivery/uber-eats/contrato/README.md`: A5 y B3 pasan a ✅.
- ADR 0011: nota de que la conexión la hace el dueño desde el admin (ya lo decía; se enlaza este spec).
