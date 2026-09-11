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

## 1. Lo que hace el dueño una sola vez

1. Cuenta en <https://developer.uber.com/dashboard> con un correo de VIM → *Create app* → suite
   **Eats Marketplace** → tipo **Testing**. Guardar `client_id` y `client_secret` de sandbox en el
   gestor de contraseñas (nunca en el repo).
2. Pedir tiendas de prueba en <http://t.uber.com/integration-support> ("POS integrator, sandbox test
   stores, Mexico") y una cuenta de consumidor de prueba.
3. En la app Testing → **Webhooks → Primary Webhook URL**:
   `https://<proyecto>.supabase.co/functions/v1/delivery-webhook-uber`.

## 2. Configurar y desplegar (yo o el dueño)

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

La carta se manda desde el admin: en la fila de la sucursal, **Enviar carta** (acción `menu` de
`delivery-uber-conexion`, `_shared/delivery/menu-uber.ts`). Reemplaza la carta entera de la tienda
con los productos activos con precio (**id del ítem en Uber = uuid del producto en VIM**), agrupados
por categoría, sin modificadores, disponible todo el día. Los agotados, ocultos y sin precio quedan
fuera y el aviso dice cuáles. Hay que repetirlo cuando cambie el catálogo (no es automático todavía).

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

## 3d. Caja de escritorio (espejo)

Si la sucursal opera con el programa instalado, no hay que hacer nada especial: al arrancar, la
caja vinculada a la nube inicia el agente de espejo (`· [espejo]` en el log). Cada 10 s lee
`delivery-espejo` con su token de dispositivo, copia conexiones y pedidos a su base local, y para
los pedidos que le tocan crea el ticket local y acepta en Uber. La pantalla "Pedidos de apps" y
sus botones funcionan igual que en la web (el gateway reenvía `delivery-accion` a la nube).

- Ver que la caja está viva para la nube: `select nombre, espejo_apps_at from cajas` en el SQL
  editor (debe tener menos de un minuto).
- Si el ticket no aparece en la caja: buscar en el log `· [espejo]` el motivo (`SIN_TURNO_ABIERTO`,
  `ITEM_SIN_MAPEAR`, reclamo de otra caja) y en la tarjeta del POS (`ultimo_error`).
- Si la app cancela un pedido que ya tenía ticket local, la tarjeta lo avisa en rojo y el cajero
  cancela el ticket con el flujo normal.
- Sin internet: el agente se salta el ciclo y la pantalla sigue con lo último espejado; al volver
  la red, el siguiente ciclo se pone al día.

## 3e. Aviso push al dueño cuando vencen pedidos (0097)

Una sola vez, el dueño:
1. Dashboard → **Vault** → *New secret*: `vim_interno` = cadena aleatoria de 32+ caracteres (del
   gestor de contraseñas) y `vim_functions_url` = `https://pbiaxzvmssjsxdwqrumb.supabase.co/functions/v1`.
2. Edge Functions → **Secrets**: `VIM_INTERNO_SECRET` = la misma cadena que `vim_interno`.
3. Los dispositivos que deben recibir el aviso activan notificaciones en el admin
   (Configuración → Notificaciones).

Prueba: `select delivery_avisar_expirados('<tenant>', '<sucursal>', 1);` en el SQL editor debe
devolver `true` y llegar la notificación; `select * from net._http_response order by id desc limit 3`
muestra la respuesta de `enviar-push` (200 con `enviadas`).

## 4. Prueba de punta a punta

0. Tiendas de prueba recibidas el 3 sep 2026 (caso 59818999): «VIM POS Test Store 1» (dueño
   `uber-test@vimpos.com.mx`, id `e597a6b1-9ea2-45d0-a0cd-5843ac6908b8`) y «VIM POS Test Store 2»
   (`uber-test2@vimpos.com.mx`, id `55435171-1ab7-4a42-8b38-b55d5672ef25`), Delivery by Uber. Uber
   NO las integró: hay que conectarlas con el flujo de §3 (OAuth con la cuenta del dueño de prueba).
   Las contraseñas están en el correo de Uber; van al gestor de contraseñas, no aquí. Uber avisó que
   el client ID no tenía webhook URL: comprobar en el dashboard de desarrollador que el Primary
   Webhook sea `https://pbiaxzvmssjsxdwqrumb.supabase.co/functions/v1/delivery-webhook-uber`.
1. Abrir turno en el POS (nube o caja de escritorio) de la sucursal vinculada; mandar la carta
   (**Enviar carta** en el admin).
2. En ubereats.com con la cuenta de prueba, dirección de la tienda de prueba, pedir un producto.
3. Verificar en orden: `delivery_eventos` (fila `orders.notification`, `firma_valida = true`,
   `respuesta->>'accion' = 'ACEPTADO_AUTO'`), `delivery_pedidos` (estado `ACEPTADO`, `ticket_id`),
   Consultar cuentas en el POS (ticket PAGADO con canal Uber Eats), Uber Eats Orders
   (restaurant-dashboard.uber.com) muestra la orden aceptada.
4. En el POS → Pedidos de apps → **Marcar listo** → en Uber `preparation_status = READY_FOR_HANDOFF`.
5. Con `auto_aceptar = false` en la conexión: el pedido aparece **Por aceptar** con contador; Aceptar
   y Rechazar (con motivo) deben reflejarse en Uber.

### Resultado del 6 sep 2026 (nube, sucursal Pruebas de VIM Pruebas)

Hecho de punta a punta con la tienda de prueba 1: OAuth con `uber-test@` (en ventana de incógnito:
la sesión de Uber se comparte entre dashboards y el primer intento autorizó con otra cuenta y devolvió
0 tiendas) → Activar → Comprobar (integración activa, tienda en línea) → Enviar carta (38 productos,
7 categorías) → pedido desde ubereats.com → webhook con firma válida → ítems reconocidos por uuid →
con turno abierto en el POS web, **aceptado en automático**, ticket VP1-2026-000005 → Marcar listo →
`ready` enviado a Uber. Lo que se rompió y se arregló ese día: el contador de folios de la nube no
existía para sucursales cuyos folios emitió el escritorio (mig. 0107); el primer pedido expiró sin
turno abierto. Pendiente: la caja de escritorio (espejo) recibía `401 AUTH_INVALIDA` y se quedaba con
el token muerto 20 min; el agente ya fuerza login nuevo tras un 401 y el log dice vigencia y sesión.

### Resultado del 11 sep 2026 — combos y modificadores (entrega 2)

Primera prueba con la carta que lleva **grupos de modificadores y combos**. Se hizo **por fases**,
para separar el riesgo de publicar del riesgo de cobrar. Hay un solo proyecto de Supabase
(`pbiaxzvmssjsxdwqrumb`), así que "sandbox" es la tienda de prueba de Uber, no un backend aparte:
probar obliga a desplegar a producción.

**Fase A — solo la carta.** Se desplegó únicamente `delivery-uber-conexion`. Antes se comprobó que
esa función **no tiene ninguna acción que procese pedidos** y que sus dos referencias a
`procesar-uber.ts` son `import type`, que desaparece al compilar: el radio real del despliegue era
el botón "Enviar carta" del admin. Si hubiera fallado, se revertía redesplegando la versión de
`main`.

Resultado: **la carta se publicó y Uber la aceptó.** Eso cierra la duda de mayor riesgo de toda la
entrega, porque `tax_info` pasó de `tax_rate` a `vat_rate_percentage` (lo que corresponde a México
con precio con IVA incluido) y ese era el único cambio que alcanzaba a **todos** los restaurantes
que ya publican. Como `PUT /menus` reemplaza la carta entera, un rechazo habría dejado sin poder
republicar a quien lo intentara. También quedaron aceptados los `modifier_group` de los grupos de
modificadores y los de los slots de combo, con sus opciones como ítems sin categoría.

**Fase B — el pedido.** Se aplicó la migración `0112_combos_uber.sql` y se redesplegaron
`delivery-webhook-uber` y `delivery-accion`. Las dos hacían falta: cada función empaqueta su propia
copia de `_shared/`, así que sin redesplegarlas el pedido habría llegado con el normalizador viejo,
sin `grupo_id`, y la migración nueva lo habría rechazado.

Pedido **9E434** desde ubereats.com → ticket **VP1-2026-000009**, aceptado en automático, con dos
combos:

```
1 × Combo Knock-Out · Cheese Burger, Papas Sencillas, Coca Cola
1 × Combo Knock-Out · Cheese Burger, Aros de Cebolla, Coca Cola
Total en la app: $300.00
```

**El ticket cuadra con lo que cobró Uber.**

### Qué quedó probado, y qué no

**Probado:**

- La carta se publica con grupos de modificadores y combos, y Uber la acepta.
- Un pedido con combos se convierte en ticket: padre con su precio, hijos desglosados.
- **El segundo nivel de anidamiento.** No se probó con el término —esos grupos se habían quitado del
  catálogo de pruebas— pero sí con **extras sobre los componentes del combo**, que recorren
  exactamente el mismo camino. El término habría pasado por el mismo código.
- **El defecto de los `$0.00` está cerrado con datos reales.** El precio de cada opción se buscaba en
  el desglose con el `cart_item_id` del ítem **padre**, cuando Uber indexa esas filas por el de la
  **opción**; con datos reales no coincidía ninguna y todo modificador entraba a cero. Que el total
  del ticket cuadre con los $300 de la app lo demuestra: si los extras hubieran entrado a cero, no
  cuadraría.

**No probado en vivo, y por qué se asume:**

- **Un extra sobre un producto suelto**, fuera de combo. Es el caso de Knock-Out, que no usa combos
  todavía. Recorre la misma ruta de código que los extras dentro del combo, que sí quedó probada.
  Riesgo bajo, asumido a propósito.
- **`core_price` vs `corePrice`.** La referencia de Uber y su propio ejemplo se contradicen. No
  rompe el `PUT`; rompe los reembolsos parciales, en silencio. Sigue sin confirmar.
- **El tope de precio por ítem en pesos**, si existe para México.
- **Que `min_permitted`/`max_permitted` se respeten de verdad en la app del cliente.** El modelo de
  combo lo da por hecho: si Uber no los aplicara, podría llegar un pedido con un slot incompleto y
  el POS lo rechazaría con el cliente ya cobrado.
- **El `max_permitted` de un slot no se recorta a sus opciones vivas** (a diferencia del de un grupo
  de modificadores, que sí). Un slot "elige hasta 2" con una sola opción disponible publica
  `max_permitted: 2` con un solo `modifier_option`. No lo vuelve inordenable —el máximo es un tope,
  no una exigencia— pero está por ver si Uber acepta ese payload sin protestar.

### Lo que la prueba real encontró y se arregló

Los extras del segundo nivel **no se veían en la pantalla "Pedidos de apps"**. El dinero estaba bien
y la cocina los recibía, porque cuelgan del renglón hijo, pero `apps/pos/app/lib/pedidos-apps.ts`
se quedaba con el nombre y la cantidad de cada modificador y descartaba el array anidado. El cajero
veía "Cheese Burger" sin enterarse de que llevaba algo encima.

Arreglado: la tarjeta pinta ahora el extra pegado a su componente,
`1 × Combo Knock-Out · Cheese Burger (extra queso), Papas Sencillas, Coca Cola`. **Ese arreglo vive
en el POS web, que se despliega desde `main`: no se ve hasta mezclar.**

### El orden del despliegue, que importa

1. `supabase db push` (la `0112`).
2. Mezclar el PR.
3. Instalador **0.4.68** en todas las cajas.
4. **Solo al final**, enviar la carta con combos a la tienda de producción.

Una caja en 0.4.67 no tiene la `0112`, así que `agregar_item_a_ticket` rechazaría el combo con
`'El producto "%" es un combo: usa agregar_combo_a_ticket'` — un mensaje que el espejo tampoco
traduce. Publicar la carta antes de actualizar el parque es invitar pedidos que la caja no sabe
cobrar.

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
