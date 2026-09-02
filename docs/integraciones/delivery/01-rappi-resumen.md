# Rappi — resumen de estudio

Fuente cruda: `rappi/guias/*.md` y `rappi/referencia-api/*.md` (1 sep 2026).
Portal: <https://dev-portal.rappi.com/es/>.

## 1. Cómo se entra al programa

- No hay autoservicio de credenciales. Todo empieza con "tu principal punto de contacto en Rappi"
  (un TAM, *Technical Account Manager*). Él crea la entidad `Integration` en el backend de Rappi y
  el `clientId` en Auth0. Después de eso el aprovisionamiento de tiendas sí es autoservicio.
- Primero entregan credenciales del **entorno de pruebas** (`client_id` + `client_secret`); un
  solo juego sirve para todas las tiendas del integrador.
- Estándares que exigen (`guias/integration-standards.md`): tasa de éxito ≥ 98 % en las llamadas,
  generar el token una vez por semana, si se hace *polling* de órdenes dejar 45 s entre llamadas,
  rechazar órdenes solo cuando de verdad no se puede preparar. Rechazar muchas órdenes seguidas
  apaga la tienda en la app.

## 2. Dominios y versiones (hay dos APIs conviviendo)

| Familia | Base para México | Prefijo de ruta | Dev |
|---|---|---|---|
| API "clásica" (v2) | `https://services.mxgrability.rappi.com` | `/api/v2/restaurants-integrations-public-api/…` | `https://microservices.dev.rappi.com` |
| API nueva ("Rests API") | `https://api.rappi.com.mx` | `/restaurants/{auth\|orders\|menu\|finance}/v1/…` | `https://api.dev.rappi.com` |

El token se genera **siempre** en el dominio nuevo. Con el dominio nuevo la audiencia del token es
única (`{dominio}/api/v2/restaurants-integrations-public-api`). Algunos endpoints solo existen en la
familia nueva (handoff, bag-drink-confirmation, reject con `cancel_type`, financiero) y el resto
sigue en la clásica. Hay cabeceras de obsolescencia `x-rappi-api-deprecation-date` /
`x-rappi-api-deprecation-info` en respuestas y webhooks.

## 3. Autenticación

```
POST https://api.rappi.com.mx/restaurants/auth/v1/token/login/integrations
{ "client_id": "...", "client_secret": "..." }
→ { "access_token": "..." }        # vigencia: 1 semana
```

- Header en todas las llamadas: `x-authorization: Bearer <access_token>` (no es case-sensitive).
- Hay logins separados para **utils** (`…/token/login/utils`: horarios de corredores/productos/tienda)
  y **finance** (`…/token/login/finance`: API financiera).
- Los campos `audience` y `grant_type` del cuerpo viejo se ignoran (compatibilidad).

## 4. Tiendas y vinculación

### 4.1 Modelo clásico (el TAM asocia tiendas al clientId)

- `GET stores-pa` → lista de tiendas del clientId: `integrationId` (nuestro id), `rappiId`, `name`.
- `PUT stores-pa/{storeId}/status?integrated=true|false` → cuando está "integrada", las órdenes
  llegan por la integración; cuando no, llegan al Portal de Aliados y se aceptan a mano (o con
  auto-accept del portal). **Este switch es el "modo fallback" natural.**
- `GET stores-pa/{storeId}/check-in-code` → código de registro de la tienda.
- `GET store/{rappiId}/menu/current` → menú actual con ids de Rappi de productos/toppings.

### 4.2 Self-onboarding (nuevo; `guias/self-onboarding.md`)

Modelo de **dos tokens**:

1. Token de integrador (M2M, el de §3), header `X-Authorization`.
2. Token del **merchant**: el dueño del restaurante se autentica en Portal Partners con OAuth2
   *Authorization Code + PKCE* (`https://login.partners.rappi.com/authorize` → código →
   `…/oauth/token`). Se usa el `id_token` (JWT firmado RS256, tres partes); el `access_token` es
   un JWE opaco y **no sirve** (da `401 Invalid merchant token signature`). No hay refresh: cuando
   vence, el merchant repite el login. Va en header `Authorization-Partners: Bearer <id_token>`.
   Nuestro `client_id` y `redirect_uri` deben registrarse con el TAM.

Flujo:

```
[Una vez]   POST /clients/{clientId}/webhooks   {event:"STORE_PROVISIONING_STATUS", url, secret}
[Por lote]  GET  /stores/integration-status     → tiendas del merchant (integrated true/false, hijas)
            POST /stores/provisioning           ≤20 tiendas, 202 Accepted, batch_id
              body: stores[{store_id, name, status, store_integration_id (nuestro id de sucursal),
                            ping_active, get_menu_active, cancellation_events}]
            webhook STORE_PROVISIONING_STATUS   → results[{storeId, status ACTIVE|FAILED, httpCode}]
[Opcional]  POST /stores/deprovisioning
```

Reglas: cada tienda aprovisionada queda como padre independiente; una tienda con hijas integradas no
se puede desaprovisionar; el menú se administra por tienda.

## 5. Menú

### 5.1 Tipos de mapeo (`guias/managing-store-menus.md`)

- **Sin mapeo**: el aliado carga el menú en Portal Partners sin SKUs; la orden trae ids de Rappi y
  `sku: null`. El POS tendría que mapear a mano.
- **Self mapping**: el aliado pone el SKU en Portal Partners.
- **Mapeo automático (el que queremos)**: el POS manda el menú por `POST menu` con SKU en cada
  ítem; Rappi guarda la versión del mapeo y las órdenes llegan traducidas con nuestros SKUs.

### 5.2 `POST /api/v2/restaurants-integrations-public-api/menu`

```json
{ "storeId": "900103361",
  "items": [
    { "name": "Grilled Chicken Burger", "description": "...", "price": 14000, "sku": "10",
      "sortingPosition": 0, "type": "PRODUCT",
      "category": { "id": "2090019638", "maxQty": 0, "minQty": 0, "name": "Burgers", "sortingPosition": 0 },
      "children": [
        { "category": { "id": "211", "maxQty": 1, "minQty": 0, "name": "Do you want to add?", "sortingPosition": 0 },
          "name": "French Fries", "price": 5000, "sku": "1", "maxLimit": 1, "sortingPosition": 1, "type": "TOPPING" } ] } ] }
```

- Estructura plana: cada `item` trae su categoría (corredor) embebida; los toppings van en
  `children` con su *topping category* (grupo de modificadores: `minQty`/`maxQty`).
- Máximo **2 niveles** (producto → topping). No hay modificadores anidados.
- Se mandan precios **completos** (sin descuento). `combo: true` marca pertenencia a combo.
- Solo tiendas **padre** aceptan menú. Un menú en aprobación bloquea los siguientes de la misma
  tienda. Respuesta inmediata "Menu updated and ready to be validated"; la aprobación es asíncrona:
  `GET menu/approved/{storeId}` o webhooks `MENU_APPROVED` / `MENU_REJECTED`.
- `GET menu/rappi/{storeId}` → último menú creado. `GET menu` → menús del aliado.
- Validaciones (todas HTTP 400 con detalle): SKU con datos consistentes en todas sus apariciones
  (`item_data_conflict`; si el mismo topping cambia de precio en otro producto, **SKU distinto**),
  sin duplicados por corredor, sin ciclos, imagen URL absoluta http(s), sin emojis, **palabras
  prohibidas por país** (competidores: `uber`, `didi`, `pedidos ya`…; groserías; política),
  longitudes (SKU ≤ 500, nombre ≤ 1000, descripción ≤ 2000), precios ≥ 0, producto sin toppings
  con precio > 0, ≤ 50 hijos por producto, ≤ 50 productos por corredor, ≤ 3 imágenes, imagen ≤ 1 MB
  PNG/JPEG/WEBP/TIFF/BMP.
- Con menú automático conservan el orden de productos, las promociones y el historial de favoritos
  (por SKU). No se pueden reutilizar SKUs para crear productos nuevos.
- Existe además una **Rests API de Menú** (`referencia-api/rests-api-menu.md`) con recursos
  granulares (menús, categorías, ítems por tienda). No se estudió a fondo.

## 6. Disponibilidad (`guias/managing-availability.md`)

- Por SKU: `PUT availability/stores/items` `[{ "store_integration_id": "999", "items": { "turn_on": [...], "turn_off": [...] } }]`
  (máximo 100 combinados por llamada). Por id de Rappi: `…/items/rappi`.
- Consulta: `POST availability/items/status` `{store_id, item_ids}` → `stock_out_state`.
- Un ítem apagado **no se vuelve a prender solo** ni al subir menú nuevo; hay que prenderlo.
- Tienda: `PUT availability/stores/enable` (síncrono, ≤ 300 tiendas, devuelve si quedó y por qué
  no: `suspended`), `PUT availability/stores/enable/massive` y `PUT availability/stores` (asíncronos,
  el resultado llega por webhook `STORE_CONNECTIVITY`). `POST availability/stores` consulta.
- Nueva familia: `PATCH /restaurants/menu/v1/stores/{storeId}/{products|toppings|items}/{sku|id}/stock`.

## 7. Órdenes

### 7.1 Ciclo de vida (`guias/managing-user-orders.md`)

```
CREATED → (WEBHOOK | READY) → SENT → TAKEN → READY_FOR_PICKUP
                                   ↘ REJECTED
                                   ↘ TIMEOUT
```

- Con webhook `NEW_ORDER` la orden nace en `WEBHOOK` y pasa a `SENT` sola. Sin webhook, se hace
  *polling* con `GET orders` (devuelve solo `READY` **una sola vez** y las pasa a `SENT`);
  `GET orders/status/sent` reexpone las `SENT` de los últimos 10 minutos.
- **Tiempo para tomar o rechazar: 4 minutos según la FAQ, 6 según la guía.** Si no, `TIMEOUT`.
  Diseñar para 4.
- Tomar: `PUT orders/{orderId}/take/{cookingTime}` (cooking time en minutos, acotado al rango
  `min_cooking_time`–`max_cooking_time` que viene en la orden). Responde "Order successfully taken".
- Rechazar: `PUT orders/{orderId}/reject` `{ "reason": "...", "items_sku": [...] }` (los SKUs que se
  incluyan quedan apagados y solo Soporte los prende). Nueva API:
  `PUT /restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject`
  con `cancelType` tipo `STORE_CLOSED` y cuerpo `{description, additional_info}`.
- Listo: `POST orders/{orderId}/ready-for-pickup`. Por defecto Rappi pasa a `READY_FOR_PICKUP`
  **automáticamente** según el cooking time; se puede pedir modo manual. Máximo 3 llamadas por orden.
- Eventos: `GET orders/{orderId}/events` (taken_visible_order, replace_storekeeper,
  ready_for_pick_up, domiciliary_in_store, hand_to_domiciliary, arrive, close_order) y eventos de
  cancelación (`cancel_by_user`, `canceled_with_charge`, `cancel_by_support`,
  `canceled_store_closed`, `canceled_by_fraud_automation`, `cancel_by_sk_with_charge`…). **No hay
  endpoint para saber si una orden se canceló sin consultarla una a una**; para eso están los
  webhooks `ORDER_EVENT_CANCEL` / `ORDER_OTHER_EVENT`.
- Nueva API además: `GET …/handoff` (código de confirmación + QR para entregar al repartidor) y
  `POST …/bag-drink-confirmation` (número de bolsas y bebidas fuera de bolsa).
- Órdenes programadas: no hay endpoint; webhook `NEW_ORDER_SCHEDULED` (aviso con `place_at`, montos
  en 0) y `NEW_ORDER_SCHEDULED_CANCELLED`; la orden real llega después por `NEW_ORDER`.

### 7.2 Payload de la orden (`referencia-api/orders.md`, igual en el webhook `NEW_ORDER`)

```
order_detail:
  order_id, delivery_operation_type (regular|turbo), cooking_time, min_cooking_time, max_cooking_time,
  created_at, place_at (solo programadas), delivery_method (delivery|marketplace|pickup),
  payment_method (cc|cash|rappi_pay|paypal|... no validar la lista),
  delivery_information {city, complete_address, street_name, street_number, neighborhood, complement,
                        postal_code, ...}   ← solo con datos completos en marketplace
  billing_information {name, email, phone, document_*}
  totals {total_products, total_discounts, total_order, total_to_pay, discount_by_support,
          charges{shipping, service_fee}, other_totals{tip, total_rappi_pay, total_rappi_credits}}
  items[{sku, id, name, type PRODUCT|TOPPING, comments, price, quantity, subitems[{sku,id,name,type,price,quantity}]}]
  discounts[{value, title, type, raw_value, value_type, percentage_by_rappi, percentage_by_partners,
             amount_by_rappi, amount_by_partner, discount_product_units, ...}]
  delivery_discount, vendors[] (tuweb = pedido por WhatsApp)
customer {first_name, last_name, phone_number, document_number, user_type}   ← solo marketplace o si se pide
store {internal_id (id Rappi), external_id (nuestro id), name}
```

Puntos finos:

- `total_order` es lo que recibe el restaurante (en `marketplace` incluye propina y envío). Incluye
  los descuentos asumidos por el restaurante. `total_to_pay` = efectivo que el cliente paga al
  repartidor (solo marketplace/pickup con `cash`).
- `price` de ítems y subítems es **sin descuento**; los descuentos vienen aparte en `discounts` con
  el reparto Rappi/aliado (`amount_by_rappi`, `amount_by_partner`). Desde nov-2022 no existen
  `unit_price_with_discount` ni `total_products_with_discount` (obsoletos).
- Los ejemplos usan enteros (`28900`) sin decir la unidad; son ejemplos colombianos. **Pendiente
  verificar en sandbox MX si los montos vienen en pesos o centavos.**
- Métodos de entrega: `delivery` (repartidor Rappi, siempre), `marketplace` (repartidor propio del
  restaurante, opcional) y `pickup` (opcional). Se configuran con el punto de contacto.
- Tiempo de cocción: el sistema toma el predictivo, luego el del CMS, luego el de la integración; se
  puede cambiar al tomar la orden dentro del rango.

## 8. Webhooks (`guias/webhook-events.md`, `referencia-api/webhooks.md`)

- Se registran **por tienda** vía API: `POST webhook` `{ "event": "NEW_ORDER", "data": [{ "url": "https://…", "stores": ["1000","1001"] }] }`.
  También `GET webhook/{event}`, `PUT webhook/{event}/add-stores`, `…/change-url`,
  `…/change-status`, `DELETE webhook/{event}/remove-stores`, `PUT webhook/{event}/reset-secret`.
  El de aprovisionamiento es por integración: `POST /clients/{clientId}/webhooks`.
- Eventos: `NEW_ORDER`, `NEW_ORDER_SCHEDULED`, `NEW_ORDER_SCHEDULED_CANCELLED`, `ORDER_EVENT_CANCEL`
  `{event, order_id, store_id}`, `ORDER_OTHER_EVENT` `{event, order_id, store_id, event_time,
  additional_information{courier_data, eta_to_store}}`, `MENU_APPROVED`, `MENU_REJECTED`, `PING`,
  `STORE_CONNECTIVITY` `{external_store_id, enabled, message}`, `ORDER_RT_TRACKING` (lat/lng/eta del
  repartidor), `STORE_PROVISIONING_STATUS`.
- **Firma**: header `Rappi-Signature: t=123456,sign=<hex>` donde
  `sign = HMAC-SHA256(secret, "<t>.<payload crudo>")`. El secret es el del webhook.
- **PING / health check**: cada 3 minutos por tienda `POST {store_id}` (external id) y hay que
  responder `{ "status": "OK", "description": "..." }`. Dos fallos seguidos (con 1 minuto de
  gracia) → Rappi **apaga la tienda** y la vuelve a prender cuando el ping regresa. Sin webhook
  evalúan la última vez que se descargaron órdenes. No aplica a tiendas 24 h. Debe ser por tienda,
  no un "OK" genérico del servidor.
- Las IPs de origen se piden al Project Manager (para allowlist).

## 9. API financiera (`guias/financial.md`, `referencia-api/financial.md`)

- Login propio (`…/token/login/finance`) y `GET /v2/stores` para saber a qué tiendas se tiene acceso.
- Por tienda: `payments` (ids de pago = paidlots por corte semanal/quincenal/mensual), `orders`
  (ventas finalizadas o canceladas con impuestos, descuentos y comisión), `order_adjusments`,
  `charged_cancellations` (cancelaciones que Rappi sí paga), `cancellations` (las que no paga:
  producto no disponible, tienda cerrada, aliado no reconoce), `store_adjustments`, `taxes` (solo
  sumar IRRF), `compensations` (informativo), `loans`, `debts`, `extras` (ads, fees), `agreements`
  (comisiones y condiciones del contrato).
- Datos disponibles un día después del corte a las 14:00. Filtros con operadores
  (`confirmed_payment_date:lte=2023-01-01`) y paginación.
- Esto alimenta directamente `apps_liquidaciones` / `apps_liquidacion_items` con
  `ingesta_metodo = 'API'`.

## 10. Utils API (horarios)

Con el token de utils: corredores y sus horarios por tienda o por integración, horarios de
producto (por id o SKU), horario regular / festivo / especial de la tienda (`store/schedule/…`), y
`GET menu/integration/{integrationId}` (estado y disponibilidad de todos los ítems).

## 11. Lo que hay que recordar al diseñar

1. Una sola credencial para todas las tiendas del integrador; tiendas identificadas por
   `store_integration_id` (nuestro id) ↔ `rappiId`.
2. Ventana de aceptación corta (4 min). El `PING` cada 3 min es por tienda y decide si la tienda
   está prendida: hay que contestarlo con el "latido" real de la caja.
3. Menú plano a 2 niveles con SKU obligatorio y validaciones estrictas (palabras prohibidas,
   consistencia de SKU). Los toppings con precio distinto en otro producto necesitan SKU propio.
4. Descuentos vienen desglosados con quién los paga; el ticket debe guardar `total_order` como lo
   que cobra el restaurante y los `discounts` para conciliar.
5. El switch `integrated=true|false` por tienda es el fallback a operar desde el Portal de Aliados.
