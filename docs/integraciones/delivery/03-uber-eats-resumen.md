# Uber Eats — resumen de estudio

Fuente cruda: `uber-eats/guias/*.md`, `uber-eats/referencia-api/*.md`, `uber-eats/openapi/*.json`
(1 sep 2026). Portal: <https://developer.uber.com/docs/eats>.

## 1. Cómo se entra al programa (`guias/getting-started`, `sandbox`, `going-live`)

- Cualquiera crea una **aplicación de pruebas** en el Developer Dashboard (`developer.uber.com/dashboard`)
  eligiendo la suite "Eats Marketplace" y tipo **Testing**: los scopes se conceden solos, pero solo
  para los dominios sandbox. Las tiendas de prueba se piden por el formulario de soporte
  (`t.uber.com/integration-support`).
- Para producción hace falta **NDA + acuerdo de licencia de API**, hablar con un *partner manager*
  de Uber Eats, crear la app de producción con una cuenta Uber **de producción distinta** a las de
  prueba, pedir por soporte que **whitelisten** los scopes al `client_id`, activar los scopes en el
  dashboard y configurar el webhook. Antes, Uber hace una verificación conjunta de punta a punta.
- Estiman 4–8 semanas para una integración POS completa. El texto "Access to These APIs May Require
  Written Approval From Uber" aparece en todas las páginas.
- Piloto: una tienda mínimo 3 días con ≥ 98 % de inyección exitosa antes de seguir; el estándar de
  producción es **99 % (meta 99.9 %)** de órdenes aceptadas sobre enviadas, o revocan acceso.

## 2. Entornos

| | Token | API |
|---|---|---|
| Testing | `https://sandbox-login.uber.com/oauth/v2/token` | `https://test-api.uber.com` |
| Producción | `https://auth.uber.com/oauth/v2/token` | `https://api.uber.com` |

Mezclar dominios es el error más común (401). Los datos del sandbox se reinician periódicamente.

## 3. Autenticación (`guias/authentication`)

OAuth 2.0 con **dos grant types**:

- **`client_credentials`** (operación normal): `POST /oauth/v2/token` con `client_id`,
  `client_secret`, `grant_type=client_credentials`, `scope=eats.store eats.order …`. Token de
  **30 días**; límite **100 tokens por hora** y con más de 100 vivos se invalida el más viejo: hay
  que **cachearlo** y reutilizarlo. Scopes: `eats.store` (tienda y menú), `eats.store.status.write`
  (pausar/reanudar), `eats.order` (aceptar/rechazar/cancelar y leer órdenes v1),
  `eats.store.orders.read` (leer órdenes v2), `eats.report`.
- **`authorization_code`** (solo para activar tiendas): scope `eats.pos_provisioning`. El dueño
  entra en `https://auth.uber.com/oauth/v2/authorize?client_id=…&response_type=code&redirect_uri=…&scope=eats.pos_provisioning`,
  autoriza, vuelve con `code`, se cambia por un *user token* que solo sirve para `GET /stores`,
  `POST /pos_data` y `DELETE /pos_data`.
- Header `Authorization: Bearer <token>`. No se puede mezclar scopes de distintos grant types en un
  token. Errores: `invalid_client`, `invalid_scope`, `access_denied`, `429`.

## 4. Activar una tienda (`guias/integration-activation-flows`, `openapi/integration-activation-api`)

Tres formas de asociar una tienda a nuestra app: Uber la pre-integra en onboarding, el comercio
pide a soporte técnico, o **desde nuestro propio sitio** con el flujo OAuth del punto anterior:

```
1. Redirigir al dueño a /authorize (scope eats.pos_provisioning) → code → user token
2. GET https://api.uber.com/v1/delivery/stores  (con el user token) → sus tiendas (id, name, location…)
   → mapear por dirección/nombre; el id externo no es criterio único
3. POST /v1/eats/stores/{store_id}/pos_data (user token)
   { integrator_store_id: "<nuestro id de sucursal>", integrator_brand_id, merchant_store_id,
     is_order_manager: true, require_manual_acceptance: false,
     allowed_customer_requests: { allow_special_instruction_requests, allow_single_use_items_requests },
     webhooks_config: { webhooks_version: "1.0.0", order_release_webhooks: {is_enabled},
                        schedule_order_webhooks: {is_enabled}, delivery_status_webhooks: {is_enabled} },
     store_configuration_data: "<blob nuestro, sin PII>" }
4. A partir de aquí el token client_credentials opera la tienda y llegan webhooks store.provisioned
5. PATCH /pos_data (token de app, scope eats.store): integration_enabled true/false ← prende/apaga la inyección
   GET /pos_data → configuración; DELETE /pos_data → desasociar (webhook store.deprovisioned)
```

`webhooks_version: "1.0.0"` hace que el `resource_href` de los webhooks apunte a la API nueva
`/v1/delivery/order/{id}`; sin él apunta a la vieja `/v2/eats/order/{id}`. Las órdenes programadas
solo se notifican con la versión 1.0.0.

## 5. Webhooks (`guias/webhooks`, `referencia-api/webhooks.*`)

- **Una URL primaria por aplicación**, configurada en el dashboard (opcional Basic Auth u OAuth
  hacia nuestro servidor). Si distintas marcas necesitan URLs distintas, hacen falta apps distintas.
- Headers: `X-Uber-Signature` = HMAC-SHA256 hex del cuerpo con el **client secret** como llave;
  `X-Environment` (`production` | `sandbox`).
- Responder `200` con cuerpo vacío. Reintentos con backoff (10 s, 30 s, 60 s, 120 s… hasta 7
  intentos) ante 5xx, timeout o error de red.
- Eventos: `orders.notification` (nueva orden), `orders.scheduled.notification`, `orders.release`
  (repartidor a ~4 min; para cocinas rápidas), `orders.failure` (cancelación; v1.0.0) /
  `orders.cancel` (versión vieja), `orders.fulfillment_issues.resolved`, `delivery.state_changed`
  (`SCHEDULED`, `EN_ROUTE_TO_PICKUP`, `ARRIVED_AT_PICKUP`, `EN_ROUTE_TO_DROPOFF`,
  `ARRIVED_AT_DROPOFF`, `COMPLETED`, `FAILED`), `orders.customer_order_edit` (julio 2026: el cliente
  editó el carrito después del checkout), `store.provisioned` / `store.deprovisioned`,
  `store.status.changed` (requiere scope `eats.store.status.notification`),
  `store.menu_refresh_request` (Uber pide que volvamos a subir el menú), `eats.report.success`.
- Cuerpo de orden: `{ event_id, event_type, event_time, meta: { user_id (= store_id),
  resource_id (= order_id), status: "pos" }, resource_href, webhook_meta{client_id,
  webhook_config_id, webhook_msg_timestamp, webhook_msg_uuid} }`. **No trae la orden**: hay que ir
  por ella al `resource_href`. Los eventos pueden llegar duplicados o fuera de orden (`event_id`).
- Tras el 200 hay que **aceptar o rechazar en 11.5 minutos** o la orden se autocancela; si la
  tienda tiene *robocall*, llaman a los 90 s sin respuesta.

## 6. Órdenes — Order Fulfillment API (`openapi/order-fulfillment-api.openapi.json`)

Rutas (`https://api.uber.com`, scope `eats.order`):

| Método | Ruta | Uso |
|---|---|---|
| GET | `/v1/delivery/order/{order_id}?expand=carts,deliveries,payment` | Detalle (por defecto **omite** carts, deliveries y payment) |
| GET | `/v1/delivery/store/{store_id}/orders?state=&status=&start_time=&end_time=` | Lista (60 días, 50 por página) |
| POST | `/v1/delivery/order/{order_id}/accept` | `{ ready_for_pickup_time (RFC3339), external_reference_id, accepted_by, order_pickup_instructions }` |
| POST | `/v1/delivery/order/{order_id}/deny` | `{ deny_reason: { type, info, client_error_code, item_metadata{invalid_item[]} } }` |
| POST | `/v1/delivery/order/{order_id}/cancel` | `{ cancellation_reason: { …mismo esquema } }` (204) |
| POST | `/v1/delivery/order/{order_id}/ready` | Orden lista |
| POST | `/v1/delivery/order/{order_id}/update-ready-time` | Solo en `ACCEPTED` y si `action_eligibility.adjust_ready_for_pickup_time` |
| POST | `/v1/delivery/order/{order_id}/adjust-price` | `{ amount_e5, tax_rate, reason, custom_reason }` (máx. ±$50 por defecto) |
| POST | `/v1/delivery/order/{order_id}/resolve-fulfillment-issues` | Faltantes: restaurante → `ASK_CUSTOMER`; espera `orders.fulfillment_issues.resolved` |
| POST | `…/validate-item-fulfillment`, `/v1/delivery/get-replacement-recommendations` | Solo retail (códigos de barras, sustitutos) |

`deny_reason.type`: `ITEM_ISSUE`, `KITCHEN_CLOSED`, `CUSTOMER_CALLED_TO_CANCEL`,
`RESTAURANT_TOO_BUSY`, `ORDER_VALIDATION`, `STORE_CLOSED`, `TECHNICAL_FAILURE`, `POS_NOT_READY`,
`POS_OFFLINE`, `CAPACITY`, `ADDRESS`, `SPECIAL_INSTRUCTIONS`, `PRICING`, `UNKNOWN`, `OTHER`.
`invalid_item.type`: `NOT_ON_MENU`, `UNAVAILABLE`, `MISSING_INFO`, `PRICING`, `QUANTITY`,
`OUT_OF_ITEM`, `OTHER`. `409 resource_status_conflict` = ya estaba aceptada/rechazada.

Estados: `state` `CREATED → OFFERED → ACCEPTED → HANDED_OFF → SUCCEEDED | FAILED`; `status`
`SCHEDULED | ACTIVE | COMPLETED`; `preparation_status` `PREPARING | OUT_OF_ITEM_PENDING_CUSTOMER_RESPONSE | READY_FOR_HANDOFF`;
`fulfillment_type` `DELIVERY_BY_UBER | DELIVERY_BY_MERCHANT (BYOC) | DINE_IN | PICKUP`;
`failure_info.reason` `POS_DENIED | ACCEPT_TIMED_OUT | DELIVERY_FAILED | CANCELED`, con
`failure_attributed_to_party` y `will_merchant_be_paid`.

Objeto orden (restaurante):

```
order { id, display_id (el que ve el cliente, p.ej. "2A003"), external_id (lo que mandamos en accept),
        state, status, preparation_status, ordering_platform, fulfillment_type, scheduled_order_target_delivery_time_range,
        store { id, name, partner_identifiers[{type INTEGRATOR_STORE_ID|MERCHANT_STORE_ID…, value}] },
        customers[{ id, name{display_name…}, contact{phone{number, pin_code}}, order_history{past_order_count}, tax_profiles[], can_respond_to_fulfillment_issues }],
        deliveries[{ id, delivery_partner{name, vehicle, contact{phone{number, pin_code}}, current_location}, status, location (solo BYOC),
                     estimated_pick_up_time, estimated_dropoff_time, interaction_type, instructions }],
        carts[{ id, items[{ id (nuestro id de menú), cart_item_id, title, external_data (nuestro texto libre), quantity{amount},
                            customer_request{ allergy{allergens[], instructions}, special_instructions },
                            selected_modifier_groups[{ id, title, external_data, selected_items[{id, title, quantity, price…}], removed_items[] }] }],
                special_instructions, include_single_use_items, restricted_items{alcohol, tobacco} }],
        payment { payment_detail { order_total{net,tax,gross,display_amount}, item_charges{total, subtotal_including_promos, price_breakdown[]},
                                   fees{total, details[]}, tips{total}, promotions{total, details[{external_promotion_id,type,discount_value,promo_funding_splits}]},
                                   adjustment, currency_code, cash_amount_due },
                  tax_reporting{ breakdown, remittance_info[{entity UBER|MERCHANT, type, amount}] } },
        preparation_time { ready_for_pickup_time_secs, source PREDICTED_BY_UBER|DEFAULT|MERCHANT_PROVIDED, ready_for_pickup_time },
        action_eligibility { adjust_ready_for_pickup_time, mark_out_of_item, cancel, mark_cannot_fulfill },
        store_instructions, is_order_accuracy_risk, has_membership_pass, created_time, completed_time, failure_info, support_contact }
```

- **Dinero en `amount_e5`** (valor × 100 000) más `formatted` y `currency_code`; los objetos `money`
  traen `net`, `tax`, `gross` e `is_tax_inclusive`.
- Versión anterior todavía documentada: `GET /v2/eats/order/{id}`, `POST /v1/eats/orders/{id}/accept_pos_order`
  `{ reason, pickup_time (unix), external_reference_id, fields_relayed{…} }`, `deny_pos_order`,
  `cancel`, `PATCH …/cart`, `GET …/created-orders`, `…/canceled-orders`.

## 7. Menú — Menu API v2 (`referencia-api/v2-put-eats-stores-storeid-menu.md`, `v2-example-menu-payloads.md`)

- `PUT https://api.uber.com/v2/eats/stores/{store_id}/menus` (scope `eats.store`) **reemplaza el
  menú completo**. Se recomienda `Content-Encoding: gzip`. `GET …/menus` lo lee.
- Cuatro entidades: `menus[]` (con `service_availability[{day_of_week, time_periods[{start_time,
  end_time}]}]` y `category_ids`), `categories[]` (`entities[{id, type:"ITEM"}]`), `items[]`,
  `modifier_groups[]` (`modifier_options[{id, type:"ITEM"}]`, `quantity_info`). Los textos son
  `MultiLanguageText { translations: { "es_mx": "..." } }`.
- **El horario de la tienda es la unión de `service_availability` de todos los menús.** Los festivos
  van por la Store API (`holiday_hours`).
- `item`: `id` (sin `/` ni `;`), `external_data` (≤ 1024, texto libre nuestro), `title`,
  `description`, `image_url` (JPG/WEBP/PNG, 320–6000 px, < 25 MB), `price_info { price (centavos),
  core_price, in_store_price, overrides[{context_type MENU|ITEM|MODIFIER_GROUP, context_value, price}] }`,
  `quantity_info` (min/max/default, `charge_above`, `refund_under`, `min/max_permitted_unique` en
  grupos), `suspension_info { suspension { suspend_until (unix), reason } }` (agotado),
  `modifier_group_ids { ids[], overrides[] }`, `tax_info { tax_rate | vat_rate_percentage |
  mx_ieps_rate }` (**para México: `vat_rate_percentage: 16` = IVA incluido en el precio, y
  `mx_ieps_rate` si aplica**), `dish_info.classifications { alcoholic_items, can_serve_alone }`,
  `visibility_info.hours`, `bundled_items[]` (lo que va incluido pero no se elige, p.ej. papas del
  combo, para reembolsos), `nutritional_info`, `product_info` (GTIN), `selling_info`.
- Un ítem marcado alcohólico no se puede desmarcar por API.
- Actualización puntual: `POST /v2/eats/stores/{store_id}/menus/items/{item_id}` (precio,
  suspensión) **solo si el menú original se subió por API**. Cuando se opera por API, **no** deben
  tocar el menú desde Menu Maker; ante conflicto, se vuelve a subir el menú completo.
- `menu_type` permite menús distintos por modalidad (delivery vs pickup); una vez separados quedan
  separados. Uber puede pedir un re-envío con el webhook `store.menu_refresh_request`.
- Piden poblar `core_price` y `bundled_items` para que soporte pueda reembolsar bien.

## 8. Tiendas — Store API (`openapi/store-api.openapi.json`, `referencia-api/v1-*`)

- `GET /v1/delivery/stores` (paginado; con user token lista las del comercio, con token de app las
  ya asociadas), `GET /v1/delivery/store/{id}?expand=holiday_hours` (contacto, ubicación, zona
  horaria, `fulfillment_type_availability`, `prep_times`, `onboarding_status`, `orderability`,
  `ooi_config`, `adjustment_config`, `partner_identifiers`), `POST /v1/delivery/store/{id}`
  (contacto, ubicación, instrucciones de pickup).
- Estado: `GET /v1/delivery/store/{id}/status` → `ONLINE | OFFLINE` + `offline_reason`
  (`PAUSED_BY_UBER`, `PAUSED_BY_RESTAURANT`, `PAUSED_BY_API_INTEGRATION`, `OUT_OF_MENU_HOURS`…) y
  `offline_reason_metadata` (`UPTIME_CHECK_TIMEOUT`, `INCIDENT_DETECTED_ON_ORDER_MANAGEMENT_APPLICATION`…).
  `POST /v1/delivery/store/{id}/update-store-status { status, is_offline_until, reason }`
  (scope `eats.store.status.write`; la versión vieja es `POST /v1/eats/store/{id}/status
  { status ONLINE|PAUSED, paused_until }`). Solo funciona si la estrategia de estado de la tienda es
  `external` (403 `resource_update_not_allowed` si no). Uber bloquea reanudar durante un incidente.
- Tiempo de preparación: `POST …/update-store-prep-time { default_prep_time (s, ≤ 3 h) }` o modo
  ocupado `{ delay_config { delay_until, delay_duration ≤ 30 min } }`.
- BYOC: `POST …/update-fulfillment-configuration` (scope `eats.byoc.fulfillment.config`);
  `Delivery BYOC API` `POST /v1/eats/byoc/restaurants/orders/event/location` (posición del
  repartidor propio, scope `eats.byoc.position`); la orden trae `order_tracking_metadata.url` para
  generar un QR que el repartidor escanea con la app de Uber Driver.
- Festivos: `GET/POST /v1/eats/stores/{id}/holiday-hours`.

## 9. Otras suites

- **Promotions API** (`/v1/delivery/stores/{store_id}/promotion` crear, `…/promotions` listar,
  `/v1/delivery/promotions/{id}` leer, `…/revoke`): promociones de la tienda desde el POS.
- **Reporting API** (`POST /v1/eats/report`, scope `eats.report`, 60 req/min, hasta 50 tiendas por
  petición → webhook `eats.report.success` con URLs CSV): *Payment Details Report* (máx. 32 días),
  *Order History* (T-188 a T-2), etc. Datos asentados hasta 72 h después; disputas hasta 30 días.
  Guía de conciliación: marcar lo del Orders API como provisional, conciliar diario con el
  reporte, parsear CSV por nombre de columna (agregan columnas sin aviso). Los reembolsos solo
  aparecen aquí. Alimenta `apps_liquidaciones` con `ingesta_metodo = 'API'`.
- **Delivery Partner API** (`…/update-delivery-partner-count`, scope `delivery.multiple.courier`):
  pedir 2–4 repartidores para órdenes grandes. Poco relevante para nosotros.

## 10. Errores y calidad (`guias/errors`, `quality-and-performance`)

- 400 `validation_failed`, 403 `user_not_allowed` / `resource_update_not_allowed`, 404, 409
  `resource_status_conflict`, 500, 503 (reintentar con backoff exponencial). Con API 2.0.0 los
  errores traen `should_retry`, `recommended_retry_interval_secs`, `erroneous_field`.
- **Requerido** para integraciones de órdenes: soportar `pos_data` (activar, leer, actualizar,
  quitar), webhooks de notificación y fallo, aceptar/rechazar/cancelar con motivos, leer y fijar el
  estado de la tienda, actualizar tiempo de preparación, y **rechazar órdenes con alergias o
  instrucciones especiales si el POS no puede transmitirlas**. Recomendado: desechables, alérgenos,
  instrucciones por ítem y por orden. Menú: soportar toda la suite v2 (impuestos por ítem, flags de
  instrucciones especiales).
- Cambios incompatibles se avisan con 90 días; agregar campos no cuenta como cambio.

## 11. Lo que hay que recordar al diseñar

1. Dos tokens: el de app (30 días, cachear) opera todo; el del dueño (`eats.pos_provisioning`) solo
   sirve para listar sus tiendas y activar `pos_data`. La activación es la única parte que necesita
   una pantalla nuestra con redirección OAuth.
2. El webhook **no trae la orden**; hay que `GET` con `expand=carts,deliveries,payment`.
3. Ventana de 11.5 minutos, la más holgada de las tres, pero exigen 99 % de aceptación.
4. Menú rico y estricto: horarios de la tienda salen del menú; IVA incluido se declara con
   `vat_rate_percentage`; ids sin `/` ni `;`; después de subir por API no se puede tocar en Menu Maker.
5. Dinero en `amount_e5`; hay que convertir a `numeric(12,2)` con cuidado (dividir entre 100 000).
6. `integration_enabled` en `PATCH /pos_data` es el fallback para que la tienda vuelva a operar con
   la tablet de Uber Eats Orders sin desasociarla.
