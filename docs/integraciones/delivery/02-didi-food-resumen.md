# DiDi Food — resumen de estudio

Fuente cruda: `didi-food/docs/NN_*.md` y `didi-food/openapi/swagger.yaml` (1 sep 2026).
Portal: <https://developer.didi-food.com/en-US/openapi> (solo en inglés). Base de la API:
`https://openapi.didi-food.com`.

## 1. Cómo se entra al programa (`02_…Basic-Process-Overview`, `03_…Obtaining-Credentials`)

Cuatro fases:

1. **Pre-proceso**: contacto con BDM/KAM o el equipo de integraciones → firma de **NDA** (DocuSign,
   por el representante legal) → registro en el portal → **Qualification** (perfil de empresa:
   DUNS o RFC; puede exigir *Technology Integration Agreement* con acta constitutiva, RFC, poder
   notarial e identificación del representante) → avisar por correo a
   `globalsupportapi@didiglobal.com`.
2. **Desarrollo en test**: crear **app de prueba** (nombre `MX_T_<nombre>`; producción `MX_P_…`),
   crear **tienda de prueba**, pedir **cuenta de consumidor de prueba** (formulario; empieza con
   "000", vigencia 2 meses), kickoff con un especialista y grupo de WhatsApp. Herramientas:
   YAML OpenAPI, sandbox (manda `orderNew`/`orderFinish`/`orderCancel` al callback), app de
   consumidor con la tienda de prueba (dirección en CDMX: Calle Manuel Carpio 67, Santa María la
   Ribera). Máximo 5 pedidos de prueba por minuto; usar pago en efectivo para poder cancelar.
3. **Piloto**: crear app de producción, vincular 1 o 2 tiendas reales, monitorear.
4. **Expansión**: vincular más tiendas en autoservicio (URL de autorización, endpoint de bind o
   herramienta por lotes) o con ayuda de DiDi. Cada tienda solo puede estar vinculada a **una** app
   de producción.

Checklist obligatorio antes de producción (`12_…Before-Going-Live`): obtener y refrescar token,
inyección de pedidos (`orderNew`), proceso de efectivo (`shop_paid_money`), entrega propia,
entrega DiDi, soporte de promociones, lógica de precios, y responder a **todos** los webhooks.
Cancelación: opcional pero muy recomendada.

## 2. Credenciales y tokens (`13`–`15`, FAQ)

- Por app: `app_id` (entero de 64 bits) y `app_secret`. Se ven en *Application Management*.
- Por tienda: `auth_token`, que se obtiene con
  `GET /v1/auth/authtoken/get?app_id&app_secret&app_shop_id` (`app_shop_id` = **nuestro** id de la
  tienda). Cada tienda tiene su propio token; vigencia 30 días (la fecha de expiración es aleatoria),
  `token_expiration_time` viene en la respuesta. Cuando vence: `GET /v1/auth/authtoken/refresh`
  (mismos parámetros; cooldown 2 minutos; error `10102` = expirado) y luego volver a `get`.
  `get` es de solo lectura y no tiene efectos secundarios. Recomiendan un proceso automático de
  refresco porque sin token válido no se puede confirmar el pedido.
- Casi todos los endpoints reciben `auth_token` en el cuerpo (o query en los GET). Los que operan a
  nivel app (`shop/shop/list`, `shopBind`, `getAuthorizedShops`) usan `app_id + timestamp + sign`,
  con `sign = md5( "k1=v1&k2=v2…" ordenado ASCII + app_secret )`.
- **IDs de 64 bits**: `order_id`, `shop_id`, `app_id` pierden precisión con `JSON.parse`; usar
  `json-bigint` (o leer como string).

## 3. Vinculación de tiendas (`15`, `16`, `24`–`26`, `63`)

Tres caminos, todos terminan mapeando `shop_id` (DiDi) ↔ `app_shop_id` (nuestro):

1. **Página de autorización (autoservicio, recomendado para POS)**:
   `POST /v1/auth/authorizationpage/getUrl {app_id, app_shop_id}` → URL
   (`https://didi-food.com/…/store/ui-sdk/authorization?appId=…&appShopId=…`). Se la mandamos al
   dueño; entra con su cuenta de DiDi Store (manager o superadmin), ve sus tiendas y pulsa
   **Authorize** en la correcta. Si estaba ligada a otro POS, acepta el aviso y se cambia. Para
   desvincular, mismo flujo con **Deauthorize**. Hay guías en español para el comercio (zip).
2. **Endpoint** `POST /v3/auth/authorization/shopBind` (firma `sign`, hasta 50 tiendas, la tienda
   debe estar previamente autorizada) → devuelve `auth_token` por tienda. `POST /v1/shop/shop/unbind`.
3. **Herramienta por lotes** del portal (*Store Management → Store Binding*) para cadenas.

Después de vincular, obligatorio configurar:

- `POST /v1/shop/shop/setStatus {auth_token, biz_status 1 online|2 offline, auto_switch}`.
  `auto_switch`: 1 solo abre solo, 2 solo cierra solo, 3 abre y cierra según horario (recomendado).
  Si la tienda se cerró a mano desde la B-App, hay que abrirla a mano; la API no la reabre.
- `POST /v1/shop/shop/setconfirmmethod {order_confirm_method 1 B-App | 2 OpenAPI}`. Con **OpenAPI**
  el pedido se acepta/cancela por API y **no hace falta tener la B-App abierta**; con **B-App** se
  puede aceptar desde la app o desde el POS pero la app debe estar en línea. Al desvincular vuelve a
  B-App. Sugieren operar 2 días en B-App y luego pasar a OpenAPI.
- `POST /v1/shop/apply/set {receive_cancel_apply 0|1, receive_refund_apply 0|1}`: si se aceptan
  solicitudes de cancelación/reembolso del cliente, llegan webhooks `orderCancelApply` /
  `orderRefundApply` que hay que contestar.
- `GET /v1/shop/shop/detail` (datos, `sub_biz_status`, `promise_produce_time` en segundos,
  `biz_day_time`); `POST /v1/shop/shop/update`; áreas de entrega propia (`/shop/deliveryArea/*`).
- Para poder abrir, la tienda debe pasar "inspección": ≥ 1 ítem disponible, teléfono, horarios,
  info de entrega, imagen, categoría principal, tiempo promedio de preparación (`57_…`).

Webhooks de tienda: `shopStatus {biz_status}`, `imageAuditStatus`, `autoOnlineResult` (por qué no
abrió sola: 1000 feature apagada, 1001 cerrada, 1002 suspendida, 1003 forzada offline dos días por
no aceptar a tiempo, 1005 inspección fallida, 1006 fuera de horario).

## 4. Webhooks (`11_…Webhooks`, `51_…Order-Webhooks`)

- **Una sola URL de callback por app**, se define al crear la app (editable). Todos los eventos
  llegan ahí; se distinguen por `type`.
- Cuerpo: `{ app_id, app_shop_id, type, timestamp, data }`.
- **Firma**: header `didi-header-sign = MD5( <body crudo> + app_secret )`.
- Hay que responder JSON `{ "errno": 0, "errmsg": "ok" }` en **menos de 6 segundos**; si no,
  reintentan varias veces.
- Tipos de pedido: `orderNew` (trae el pedido completo, misma estructura que `order/order/detail`),
  `orderCancel`, `orderPartialCancel`, `orderFinish` (solo `order_id`), `deliveryStatus`
  (`delivery_status` 120 asignado, 130 repartidor en tienda, 140 recogió, 150 llegó al cliente,
  160 entregado, 170 cancelado, 180 reasignado, 190 abortado; `rider_name`, `rider_phone`,
  `rider_to_B_ETA`), `orderCancelApply` (se reintenta 6 veces cada 2 min; si no se contesta en 10
  min se **rechaza**), `orderRefundApply` (25 veces cada hora; si no se contesta en 24 h se
  **acepta**).
- De menú: `uploadMenuTaskStatus`, `imageAuditStatus`. De tienda: los de §3.

## 5. Pedidos (`41`–`53`)

### 5.1 Flujo

```
orderNew (status 100) ──confirmar en < 5 min──▶ 200 aceptado ──▶ 400 repartidor recogió ──▶ 500 llegó ──▶ 600 terminado
                       └─ si no: 922 cancelado por timeout
Cancelaciones: 901/902 cliente · 921/923 tienda · 961 servicio al cliente · 971/981 repartidor
```

- Confirmar: `POST /v1/order/order/confirm {auth_token, order_id}` (o desde la B-App si el método
  es B-App). Error `12007` = falló la confirmación.
- Cancelar: `POST /v1/order/order/cancel {auth_token, order_id, reason_id, reason}` con `reason_id`:
  1010 producto agotado, 1020 tienda cerrada, 1030 tienda saturada, 1040 sin agua/luz, 1050 lo
  pidió el cliente, 1060 sin repartidor (solo entrega propia), 1080 otro. Cancelar no penaliza a la
  tienda ni la cierra. Después de cancelar no se puede reactivar.
- Listo: `POST /v1/order/order/ready` (sirve para afinar su modelo de despacho).
- Entregado: `POST /v1/order/order/delivered` **solo entrega propia**.
- Efectivo con repartidor DiDi: `POST /v1/order/order/payConfirm` confirma que la tienda recibió el
  efectivo que el repartidor le adelanta (`shop_paid_money`). Es obligatorio si la tienda acepta
  efectivo; sin esa confirmación el repartidor no ve la dirección del cliente. Errores 12013–12016.
- Solicitudes del cliente: `POST /v1/order/apply/cancel {order_id, apply_id, agree, reason}` y
  `POST /v1/order/apply/refund {…, base_reason_id, base_reason, custom_reason}`.
- Retail: `partialCancel`, `adjustItem`, `order/verify` (no aplica a restaurantes).
- Detalle: `GET /v1/order/order/detail?auth_token&order_id` (mismo JSON que `orderNew`; FAQ: no es
  necesario llamarlo tras `orderNew`, salvo para leer `expected_cook_eta`/`expected_arrived_eta`
  después de confirmar, o `shop_paid_money` que solo se llena cuando asignan repartidor).

### 5.2 Payload del pedido

```
order_id (64 bits), status, fulfillment_mode (0 delivery | 1 pickup), order_index (número corto del día por tienda),
remark (nota del cliente), city_id, country "MX", timezone, pay_type (1 online | 2 efectivo | 3 POS del repartidor | 4 wallet),
pay_method (1 online | 2 offline), pay_channel (153 efectivo, 150 tarjeta, ...), change_for (billete con el que paga),
delivery_type (1 DiDi | 2 tienda), expected_cook_eta, expected_arrived_eta (unix), create_time, pay_time, shop_confirm_time,
price { ...3 modelos, ver abajo },
shop { shop_id, app_shop_id, shop_name, shop_addr, shop_phone[] },
receive_address { name, first_name, last_name, calling_code, phone (ofuscado "312***5359"), poi_address, poi_lat, poi_lng,
                  poi_display_name, ... }   ← con privacidad activa casi todo llega como "privacy protection"
order_items[{ app_item_id, app_external_id, name, sku_price, total_price, amount, remark, real_price,
              sub_item_list[{ app_item_id, name, sku_price, total_price, amount, app_content_id (grupo), sub_item_list[] }],
              promotion_detail { promo_type, promo_discount, shop_subside_price }, promo_list[] }]
promotions[{ promo_type, promo_discount, shop_subside_price }]     ← nivel pedido
need_cutlery, virtual_phone_number + locator (para llamar al cliente), handover_code / pickup_code (4 dígitos), c_cancel_preference
```

- **Todos los precios son enteros en centavos** (MXN 123.45 → `12345`).
- Modelo de precio **entrega DiDi** (integradores desde 2021): `order_price` (suma de ítems sin
  promoción, sin envío), `items_discount`, `delivery_discount`, `shop_paid_money` (lo que el
  repartidor paga en tienda si es efectivo), `refund_price`, `service_price`, `meal_top_up_price`.
- Modelo **entrega propia**: además `delivery_price`, `real_price` (lo que recibe la tienda incl.
  envío, sin subsidios DiDi), `real_pay_price` (lo que pagó el cliente), `customer_need_paying_money`
  (efectivo a cobrar al cliente), `others_fees{small_order_price, total_tip_money, service_price,
  coupon_discount}`.
- Promociones (`46_…`): `promo_type` 0 ninguna, 1 descuento por monto mínimo, 2 precio de oferta
  por ítem, 3 envío gratis, 4 compra X lleva Y, 5 compra más ahorra más, 10/11/12 cupones (pedido,
  ítems, envío), 20/30/34 descuentos de membresía/envío compartido, 100/101 usuario nuevo/recurrente.
  `shop_subside_price` = lo que absorbe la tienda; `promo_discount` = lo que percibe el cliente. Si
  un ítem trae varias promos, `promotion_detail.promo_type` siempre es 2 y el detalle está en
  `promo_list`. Solo llegan en apps de **producción** (whitelist).
- La cantidad real de subítems a servir es `amount` del ítem × `amount` del subítem.

## 6. Menú (`27`–`35`)

### 6.1 `POST /v3/item/item/upload` (recomendado; reemplaza el menú completo, asíncrono)

```json
{ "auth_token": "...",
  "menus": [{ "app_menu_id": "menu", "menu_name": "Menú", "app_category_ids": ["1"] }],
  "categories": [{ "app_category_id": "1", "category_name": "Tacos", "priority": 1, "app_item_ids": ["item_1", "sub_item_1"] }],
  "items": [
    { "app_item_id": "item_1", "item_name": "Taco a tu gusto", "short_desc": "...", "price": 10000, "activity_price": 8000,
      "status": 1, "priority": 1, "is_sold_separately": true, "head_img": "https://...", "has_wine": 0,
      "sold_info_intl": [{ "time": [{"begin":"09:00","end":"19:00"}], "day": [1,2,3], "specialDay": [] }],
      "tax_info_list": [{ "type": 1, "rate": 1600 }],
      "app_modifier_group_ids": ["mg1"] },
    { "app_item_id": "sub_item_1", "item_name": "Carnitas", "price": 500, "status": 1, "is_sold_separately": false } ],
  "modifier_groups": [
    { "app_modifier_group_id": "mg1", "modifier_group_name": "Elige tu proteína", "is_required": 1,
      "quantity_min_permitted": 1, "quantity_max_permitted": 1, "buy_mode": 0,
      "app_mg_items": [{ "app_item_id": "sub_item_1", "price": 100, "purchase_limit": 2 }] } ] }
```

- **Los modificadores son ítems** (`is_sold_separately: false`) referenciados desde grupos de
  modificadores; el grupo puede sobrescribir el precio del ítem dentro del grupo. Los grupos se
  reutilizan entre ítems. Anidado hasta 6 niveles con whitelist.
- Un solo menú; categorías ordenadas por el orden del arreglo (ignoran `priority`); nombre de ítem
  ≤ 50 caracteres (lo cortan), descripción ≤ 400, categoría ≤ 100, id de grupo ≤ 150.
- Límites: 20 categorías, 300 ítems por categoría, 4 000 ítems, 400 principales, 500 grupos (v3 con
  whitelist: 50 / 8 000).
- `activity_price` = precio promocional pagado 100 % por la tienda (≥ 1 % de diferencia, no en
  alcohol; se quita mandando el menú sin él). `has_wine` dispara verificación de edad.
- `tax_info_list`: `type` 1 IVA (rate 0 o 1600) o 2 IEPS (0–10000).
- Imagen: https, ≤ 10 MB, 150–3000 px, JPEG/PNG/GIF; si falla la imagen **no** bloquea el menú.
  También se puede subir a su CDN: `POST /v3/image/image/uploadImage` (multipart) → `giftUrl`.
- Respuesta inmediata con `taskID` y `status` (0 esperando, 1 éxito, 2 falló, 3 reintento interno,
  4 corriendo, 5 éxito parcial); seguimiento con `GET …/getMenuTaskInfo` o webhook
  `uploadMenuTaskStatus` (listas de éxito/fallo por categoría, ítem, imagen, menú, y
  `failInfoUrl` con el detalle JSON). Los errores de "primer filtro" responden `errno 10001` con el
  `app_item_id` culpable. El menú aparece en la app en 1–2 minutos.
- Cambios puntuales: `POST /v3/item/item/updateItem` (todo menos `app_item_id`; no toca promociones),
  `POST /v3/item/item/updateItemStatus {app_item_ids[], status 1|2}` (agotado / disponible, responde
  éxito/fallo por ítem), `POST /v3/item/item/updateModifierGroup`.
- Lectura: `GET /item/item/list` (con `show_real_id`).
- Una variante (talla) agotada apaga el producto completo.

## 7. Portal de herramientas (`58`–`66`)

Application Management (crear/editar app, callback, correos), Store Management (bind por lotes y
**Batch Store Management** para abrir/cerrar, método de aceptación y auto online/offline sin
código), Order Monitoring (tiempo real, últimos 7 días), API Monitoring (estadísticas y logs de
cada llamada y webhook), Sandbox (simula `orderNew`/`orderFinish`/`orderCancel` con `app_item_id`
reales), Permissions (administradores y usuarios estándar por app), Help Center (respuesta en 3
días hábiles, en inglés).

## 8. Reportes (`54_…Payment-Reconciliation-Report`)

Existe un endpoint de reporte de conciliación de pagos (no resumido; ver el archivo) que puede
alimentar `apps_liquidaciones` con `ingesta_metodo = 'API'`.

## 9. Lo que hay que recordar al diseñar

1. Un `app_id/secret` para VIM (test y producción por separado), un `auth_token` **por tienda** que
   caduca a los 30 días y hay que refrescar de forma automática.
2. Un solo webhook por app: nuestro endpoint debe enrutar por `app_shop_id` → tenant/sucursal y
   contestar `{errno:0}` en < 6 s.
3. Ventana de confirmación de **5 minutos**. Con método OpenAPI la B-App puede estar apagada.
4. Modelo de menú donde los modificadores son ítems y los grupos se comparten: mapea muy bien a
   `grupos_modificadores` + `opciones_modificador` de VIM.
5. Precios en **centavos**; IDs de 64 bits como string; `shop_paid_money` obliga al flujo de
   "confirmar efectivo" cuando el repartidor de DiDi paga en tienda.
6. Con `receive_cancel_apply = 1` hay que contestar cancelaciones del cliente en 10 min o se
   rechazan solas; conviene mostrarlas en el POS.
