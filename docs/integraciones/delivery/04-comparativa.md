# Comparativa Rappi · DiDi Food · Uber Eats

Resumen de las diferencias que afectan el diseño. Detalle en los documentos 01–03.

## Acceso y trámites

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| Cómo se empieza | Contacto con un TAM de Rappi; él crea la `Integration` y el `clientId` | NDA + registro en portal + *Qualification* (RFC/DUNS, quizá acta y poder) + correo a globalsupportapi | Cuenta de desarrollador (sandbox autoservicio) + NDA + acuerdo de licencia + partner manager para producción |
| Sandbox sin hablar con nadie | No (credenciales de dev las da el TAM) | No (hay que pasar *Qualification*), pero después es autoservicio: app de prueba, tienda de prueba, sandbox de pedidos | **Sí**: app *Testing* con scopes automáticos; las tiendas de prueba se piden por formulario |
| Idioma del portal | Español | Inglés | Inglés |
| Aprobación a producción | Con el TAM | App de producción + piloto de 1–2 tiendas | Verificación conjunta + whitelist de scopes; piloto 3 días con ≥ 98 % |
| Estándar de calidad | ≥ 98 % éxito de llamadas; no rechazar de más | Checklist obligatorio (token, orderNew, efectivo, promos, responder webhooks) | ≥ 99 % de inyección (meta 99.9 %); endpoints obligatorios |

## Credenciales y modelo de tienda

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| Credencial del integrador (VIM) | `client_id` + `client_secret` (una para todas las tiendas) | `app_id` + `app_secret` por app (test / prod) | `client_id` + `client_secret` por app (test / prod) |
| Token de operación | 1 semana; `x-authorization: Bearer` | `auth_token` **por tienda**, 30 días, refresh con cooldown | OAuth `client_credentials`, 30 días, máx. 100/h, cachear |
| Cómo se liga la tienda del cliente | TAM la asocia al clientId, o **self-onboarding**: dueño hace login OAuth+PKCE en Portal Partners → `id_token` → `POST /stores/provisioning` | Dueño abre la **URL de autorización** (login en DiDi Store) y pulsa *Authorize*; o `shopBind` firmado; o lote en portal | Dueño hace **login OAuth** (`eats.pos_provisioning`) → `GET /stores` → `POST /pos_data` |
| Nuestro id de la tienda | `store_integration_id` (≈ `external_id`) | `app_shop_id` | `integrator_store_id` (+ `merchant_store_id`) |
| Id de la app | `rappiId` / `internal_id` | `shop_id` (64 bits) | `store_id` (UUID) |
| Switch "integrado / no integrado" | `PUT stores-pa/{id}/status?integrated=` | `setconfirmmethod` (B-App vs OpenAPI) | `PATCH /pos_data { integration_enabled }` |
| Abrir / cerrar tienda desde el POS | `PUT availability/stores/enable` | `setStatus { biz_status, auto_switch }` | `POST …/update-store-status { ONLINE\|OFFLINE }` (solo si la estrategia es `external`) |

## Recepción de pedidos

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| Mecanismo | Webhook `NEW_ORDER` (trae la orden) o polling `GET orders` cada 45 s | Webhook `orderNew` (trae la orden completa) | Webhook `orders.notification` (**no** trae la orden) → `GET /v1/delivery/order/{id}?expand=…` |
| Registro del webhook | Por tienda, vía API (`POST webhook`) | Una URL por app (portal) | Una URL por app (dashboard) |
| Firma | `Rappi-Signature: t=…,sign=HMAC-SHA256(secret, t + "." + body)` | `didi-header-sign = MD5(body + app_secret)` | `X-Uber-Signature = HMAC-SHA256(client_secret, body)` |
| Respuesta esperada | 200 | `{"errno":0,"errmsg":"ok"}` en < 6 s | 200 vacío |
| Reintentos | (no documentado en detalle) | "varias veces" | 10 s, 30 s, 60 s, 120 s… hasta 7 |
| **Tiempo para aceptar** | **4 min** (FAQ) / 6 min (guía) | **5 min** | **11.5 min** (robocall a los 90 s) |
| Aceptar | `PUT orders/{id}/take/{cookingTime}` | `POST order/order/confirm` | `POST …/accept { ready_for_pickup_time, external_reference_id }` |
| Rechazar | `PUT orders/{id}/reject { reason, items_sku }` / nuevo `…/cancel_type/{tipo}/reject` | `POST order/order/cancel { reason_id 1010–1080 }` | `POST …/deny { deny_reason{type, item_metadata} }` |
| Cancelar ya aceptada | Solo vía soporte / rechazo antes de tomar | `order/order/cancel` (sin castigo) | `POST …/cancel { cancellation_reason }` |
| "Listo" | `POST …/ready-for-pickup` (opcional, máx. 3; automático por defecto) | `POST order/order/ready` | `POST …/ready` |
| Faltantes | Rechazar apagando SKUs | Cancelación parcial (`partialCancel`) | `resolve-fulfillment-issues` (`ASK_CUSTOMER`) |
| Salud de la tienda | **PING cada 3 min por tienda**, 2 fallos → tienda apagada | `sub_biz_status`, `autoOnlineResult`; con OpenAPI no exige app abierta | `UPTIME_CHECK_*`; Uber puede pausar y bloquea reanudar en incidentes |
| Estados de entrega | Eventos `ORDER_OTHER_EVENT` (repartidor asignado, en tienda, entregado…) + `ORDER_RT_TRACKING` | `deliveryStatus` 120–190 con nombre y teléfono del repartidor | `delivery.state_changed` + `deliveries[]` en la orden (nombre, vehículo, teléfono con PIN) |
| Programadas | `NEW_ORDER_SCHEDULED` (aviso) + `NEW_ORDER` al liberar | (no documentado) | `orders.scheduled.notification`; aceptar dos veces |

## Dinero en la orden

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| Unidad | Entero; **unidad no documentada** (ejemplos en COP). Verificar en sandbox MX | **Centavos** (`12345` = $123.45) | `amount_e5` (`750000` = $7.50) + `formatted` |
| Lo que cobra el restaurante | `totals.total_order` (incluye descuentos que absorbe el aliado) | `real_price` (entrega propia) / `order_price − shop_subside_price` (entrega DiDi) | `payment_detail.order_total` + desglose; `remittance_info` dice quién remite el impuesto |
| Descuentos | `discounts[]` con `amount_by_rappi` / `amount_by_partner` | `promotions[]` y por ítem `promo_list[]` con `shop_subside_price` | `promotions.details[]` con `promo_funding_splits` |
| Efectivo | `payment_method: cash`, `total_to_pay` (marketplace/pickup) | `pay_type: 2`; `shop_paid_money` (repartidor DiDi paga en tienda → `payConfirm`) o `customer_need_paying_money` | `cash_amount_due` |
| Propina | `other_totals.tip` | `others_fees.total_tip_money` (entrega propia) | `tips.total` |
| Impuestos | Precios con IVA incluido (no hay campo) | `tax_info_list` por ítem al subir menú (IVA 16 / IEPS) | `tax_info.vat_rate_percentage` (incluido) o `tax_rate` (encima); `mx_ieps_rate` |

## Menú

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| Endpoint | `POST menu` (por tienda padre) | `POST /v3/item/item/upload` (reemplaza, asíncrono) | `PUT /v2/eats/stores/{id}/menus` (reemplaza, gzip) |
| Estructura | Plana: ítem con categoría embebida, `children` = toppings con *topping category* | `menus / categories / items / modifier_groups`; **los modificadores son ítems** `is_sold_separately:false` | `menus / categories / items / modifier_groups`; los modificadores son ítems referenciados |
| Niveles | 2 (producto → topping) | Hasta 6 (whitelist) | Anidado (modifier group → item → modifier group) |
| Identificador | `sku` (≤ 500) consistente en cada aparición | `app_item_id`, `app_category_id`, `app_modifier_group_id` | `id` (sin `/` ni `;`) + `external_data` |
| Aprobación | Validación inmediata (400 con detalle) + **aprobación humana asíncrona** (`MENU_APPROVED`) | Tarea asíncrona (`taskID`, `uploadMenuTaskStatus`), visible en 1–2 min | Inmediato (imágenes tardan horas) |
| Agotar un ítem | `PUT availability/stores/items { turn_off }` (máx. 100) | `updateItemStatus { app_item_ids, status: 2 }` | `POST …/menus/items/{id}` con `suspension_info` |
| Horarios | Utils API (corredores, productos, tienda) | `sold_info_intl` por ítem + `biz_day_time` de la tienda | `service_availability` del menú **define el horario de la tienda**; `visibility_info` por ítem |
| Trampas | Palabras prohibidas (nombres de competidores), SKU con datos distintos, 1 menú en aprobación a la vez | Nombre ≤ 50 caracteres (lo cortan), imagen que falla no bloquea, IDs de 64 bits | No tocar Menu Maker después; alcohol irreversible; `store.menu_refresh_request` |

## Conciliación / reportes

| | Rappi | DiDi Food | Uber Eats |
|---|---|---|---|
| API | Financial API (login propio): payments, orders, cancellations, adjustments, agreements… | Payment Reconciliation Report | Reporting API → CSV por webhook (payment details, order history) |
| Cadencia | Corte semanal/quincenal/mensual; datos al día siguiente 14:00 | (ver doc 54) | Diario; asienta en 72 h; disputas hasta 30 días |

## Conclusiones para el diseño

1. **Las tres caben en el mismo molde**: credencial de integrador guardada por VIM, un vínculo por
   sucursal con id externo ↔ id interno, un endpoint de webhook por app que enruta por tienda,
   aceptar/rechazar con tiempo límite, "listo", y un modelo de menú con categorías, ítems y grupos
   de modificadores. Se puede escribir un adaptador por app detrás de una interfaz común.
2. **El tiempo límite manda la UX**: 4 minutos en Rappi. La aceptación automática tiene que ser el
   modo por defecto, con el POS enterándose y pudiendo rechazar dentro de la ventana.
3. **El PING de Rappi y el "OFFLINE" de Uber/DiDi deben salir del estado real de la caja**, no de
   un servidor que siempre dice OK; si no, se aceptan pedidos que nadie prepara.
4. **Dinero**: normalizar a `numeric(12,2)` en el adaptador (centavos en DiDi, e5 en Uber, Rappi
   por confirmar) y guardar siempre el JSON crudo.
5. **Menú**: VIM ya tiene `productos` + `grupos_modificadores` + `opciones_modificador` + categorías,
   que es exactamente el modelo de DiDi y Uber; para Rappi hay que "aplanar" y generar SKUs propios
   para las opciones con precio distinto por producto.
6. **Uber es el mejor para arrancar** (sandbox autoservicio, documentación completa, ventana
   holgada); DiDi va segundo (autoservicio tras la *Qualification*); Rappi depende de conseguir TAM.
   Los tres trámites conviene iniciarlos ya porque tardan semanas.
