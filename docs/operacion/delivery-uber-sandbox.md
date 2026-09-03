# Runbook — Pedidos de Uber Eats en el POS (F1, sandbox)

**Estado (2 sep 2026):** el código de la fase 1 está construido y probado en local; **falta la
cuenta de desarrollador de Uber** (sandbox) para la prueba de punta a punta. Diseño: ADR 0011 y
`docs/integraciones/delivery/05-diseno-integracion-vimpos.md`.

## Qué existe

| Pieza | Dónde | Probado con |
|---|---|---|
| Tablas `delivery_conexiones`, `delivery_pedidos`, `delivery_eventos`, `delivery_credenciales_app` (RLS) | `supabase/migrations/0090_*` | pgTAP `supabase/tests/0004_delivery_rls.test.sql` |
| RPC `crear_ticket_desde_app`, `delivery_pedido_transicion` (solo service_role) | `supabase/migrations/0091_*` | `supabase/scripts/smoke_delivery_app.sql` |
| Adaptador Uber (firma, dinero e5, normalización, cliente HTTP) | `supabase/functions/_shared/delivery/` | `pnpm test:functions` |
| Webhook público `delivery-webhook-uber` | `supabase/functions/delivery-webhook-uber/` | `supabase functions serve` + curl (401 firma mala, 200 buena, duplicado sin reprocesar) |
| Acciones del cajero `delivery-accion` | `supabase/functions/delivery-accion/` | typecheck; la prueba real necesita el sandbox |
| Pantalla "Pedidos de apps" + badge + sonido | `apps/pos/app/components/pantalla-pedidos-apps.tsx`, `home-pos.tsx`, `pantalla-inicio.tsx` | `pnpm --filter @vim/pos test` + typecheck |

## 1. Lo que hace Fermín una sola vez

1. Cuenta en <https://developer.uber.com/dashboard> con un correo de VIM → *Create app* → suite
   **Eats Marketplace** → tipo **Testing**. Guardar `client_id` y `client_secret` de sandbox en el
   gestor de contraseñas (nunca en el repo).
2. Pedir tiendas de prueba en <http://t.uber.com/integration-support> ("POS integrator, sandbox test
   stores, Mexico") y una cuenta de consumidor de prueba.
3. En la app Testing → **Webhooks → Primary Webhook URL**:
   `https://<proyecto>.supabase.co/functions/v1/delivery-webhook-uber`.

## 2. Configurar y desplegar (yo o Fermín)

```bash
# Secrets (si `supabase secrets set` falla en esta máquina, usar el dashboard → Edge Functions → Secrets)
supabase secrets set UBER_ENTORNO=sandbox UBER_CLIENT_ID=<client_id> UBER_CLIENT_SECRET=<client_secret> UBER_WEBHOOK_SIGNING_KEY=<signing_key> UBER_REDIRECT_URI=https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback
# La signing key la inventa uno (32+ caracteres aleatorios, del gestor de contraseñas) y se pega
# igual en Uber dashboard → Webhooks → Add New Webhook → Basic HMAC → Signing Key.
supabase functions deploy delivery-webhook-uber --no-verify-jwt
supabase functions deploy delivery-accion
supabase functions deploy delivery-uber-conexion
supabase db push   # 0093 programa el cron de expirados en la nube
```

Variables públicas del **admin** (Vercel, proyecto admin, y `apps/admin/.env.local` en desarrollo):
`NEXT_PUBLIC_UBER_CLIENT_ID=<client_id>` y `NEXT_PUBLIC_UBER_ENTORNO=sandbox`. En la app de Uber
(Setup → Redirect URIs) registrar `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback`
y, para desarrollo, `http://localhost:3001/configuracion/integraciones/uber/callback`.

## 3. Vincular la tienda a la sucursal (desde el admin, F1b)

1. Admin → Configuración → **Apps de delivery** → **Conectar con Uber Eats**.
2. Entrar en Uber con la cuenta del **dueño** (la que administra el restaurante en Uber Eats Manager)
   y autorizar. Uber regresa al asistente del admin.
3. Por cada tienda de Uber elegir la sucursal de VIM, auto-aceptar (sí por defecto) y minutos de
   preparación; marcar la casilla de autorización a VIM POS y pulsar **Activar**.
4. En la tabla, **Comprobar** confirma con Uber que `integrator_store_id` es la sucursal y que la
   integración está encendida. **Pausar** apaga la inyección de pedidos sin desconectar.

### Respaldo manual (si el admin no está disponible)

Con el token del **dueño** (OAuth `authorization_code`, scope `eats.pos_provisioning`; ver
`docs/integraciones/delivery/03-uber-eats-resumen.md §4`):

```bash
# 1) tiendas del dueño
curl -H "Authorization: Bearer <USER_TOKEN>" https://test-api.uber.com/v1/delivery/stores
# 2) activar nuestra app en la tienda (integrator_store_id = uuid de la sucursal en VIM)
curl -X POST -H "Authorization: Bearer <USER_TOKEN>" -H "Content-Type: application/json" \
  https://test-api.uber.com/v1/eats/stores/<STORE_ID>/pos_data \
  -d '{"integrator_store_id":"<SUCURSAL_UUID>","integrator_brand_id":"vimpos","is_order_manager":true,
       "require_manual_acceptance":false,
       "allowed_customer_requests":{"allow_special_instruction_requests":true,"allow_single_use_items_requests":false},
       "webhooks_config":{"webhooks_version":"1.0.0","order_release_webhooks":{"is_enabled":false},
                          "schedule_order_webhooks":{"is_enabled":false},"delivery_status_webhooks":{"is_enabled":true}}}'
```

Y la conexión en VIM (SQL editor de Supabase, como administrador):

```sql
INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, conectada_at)
VALUES ('<tenant>', '<sucursal>', 'APP_UBEREATS', 'ACTIVA', '<STORE_ID>', 'Tienda de prueba Uber', true, 12, now());
```

Subir un menú mínimo a la tienda de prueba con **ids = uuids de productos de VIM**
(`PUT https://test-api.uber.com/v2/eats/stores/<STORE_ID>/menus`, ejemplo en
`docs/integraciones/delivery/uber-eats/referencia-api/v2-example-menu-payloads.md`).

## 3b. Tienda y expirados (spec A6)

- **POS → Pedidos de apps**: la barra de arriba muestra "Uber: en línea / pausada hasta HH:MM /
  sin datos" (cache de 60 s), **Prep −5/+5** (sincroniza a Uber y a `tiempo_prep_min`) y
  **Pausar…** (30 min, 1 h, resto del día) / **Reanudar**. Si Uber contesta 403
  `resource_update_not_allowed` la tienda no tiene estrategia de estado "external": se pausa
  desde Uber Eats Manager (pedir a soporte que la cambie para la tienda de prueba).
- **Admin → Apps de delivery**: chip "Tienda: …", columna "Expirados hoy" y Prep (min) que también
  va a Uber.
- **Expirados**: `delivery_marcar_expirados()` corre cada minuto por pg_cron en la nube (mig.
  0093). Comprobar en el SQL editor: `select jobname, schedule, active from cron.job;`. Para
  probar sin esperar: insertar un `delivery_pedidos` RECIBIDO con `vence_aceptacion` en el pasado
  y ejecutar la función; el POS muestra el banner rojo en el inicio hasta que alguien entra a
  Pedidos de apps.

## 3c. Alergias (A7)

Uber manda la alergia por ítem (`customer_request.allergy`: lista de alérgenos + texto libre). El
normalizador la traduce (`cacahuate`, `lácteos`…) y `crear_ticket_desde_app` la pone **al frente**
de la nota de cocina del ítem (`⚠ ALERGIA: …`) y avisa en la nota general del ticket; la tarjeta de
Pedidos de apps la muestra en rojo. Para que Uber mande el campo hay que **pedir a soporte que
active "allergy requests" para la tienda** (viene apagado en integraciones POS); mientras tanto el
cliente puede escribirla en las instrucciones, que también llegan. Prueba local:
`supabase/scripts/smoke_delivery_app.sql` (ítem con alergia → nota de cocina y nota general).

## 4. Prueba de punta a punta

1. Abrir turno en el POS (nube) de la sucursal vinculada.
2. En ubereats.com con la cuenta de prueba, dirección de la tienda de prueba, pedir un producto.
3. Verificar en orden: `delivery_eventos` (fila `orders.notification`, `firma_valida = true`,
   `respuesta->>'accion' = 'ACEPTADO_AUTO'`), `delivery_pedidos` (estado `ACEPTADO`, `ticket_id`),
   Consultar cuentas en el POS (ticket PAGADO con canal Uber Eats), Uber Eats Orders
   (restaurant-dashboard.uber.com) muestra la orden aceptada.
4. En el POS → Pedidos de apps → **Marcar listo** → en Uber `preparation_status = READY_FOR_HANDOFF`.
5. Con `auto_aceptar = false` en la conexión: el pedido aparece **Por aceptar** con contador; Aceptar
   y Rechazar (con motivo) deben reflejarse en Uber.

## 5. Cuando algo falla

- `delivery_eventos.error` dice qué pasó al procesar (`UBER_TOKEN_401` = credenciales o entorno
  equivocados; `SIN_CONEXION` = el `store_id` no está en `delivery_conexiones`).
- `delivery_pedidos.ultimo_error` y estado `ERROR`: el cajero puede reintentar con **Aceptar**.
- Pedido `RECIBIDO` con `items_sin_mapear`: los ids del menú de Uber no son uuids del catálogo, o
  falta `config.producto_generico_id` en la conexión.
- Sin turno abierto la nube no auto-acepta; el pedido espera al cajero (`vence_aceptacion`).

## Prueba local que ya se hizo (sin Uber real)

```powershell
supabase start; supabase db reset
supabase functions serve delivery-webhook-uber --env-file supabase/functions/.env.delivery.local --no-verify-jwt
# .env.delivery.local: UBER_ENTORNO=sandbox / UBER_CLIENT_ID=test-client / UBER_CLIENT_SECRET=test-secret
```

Resultado: firma incorrecta → 401 y fila con `firma_valida=false`; firma correcta → 200, fila
`firma_valida=true`, procesamiento intenta `obtenerOrden` y registra `UBER_TOKEN_401` (esperado sin
credenciales reales); el mismo `event_id` repetido → 200 sin crear otra fila.
