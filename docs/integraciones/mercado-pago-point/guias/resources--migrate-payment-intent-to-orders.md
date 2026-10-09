<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/migrate-payment-intent-to-orders · capturado 2026-10-08 -->

# Cómo migrar de Payment Intent API a Orders API

Orders API unifica el procesamiento de pagos presenciales en Mercado Pago Point, ofreciendo endpoints estandarizados, un modelo de _status_ más completo y nuevos recursos nativos que no existían en Payment Intent API. Además, todas las nuevas funcionalidades de Mercado Pago se desarrollarán sobre Orders API.

La migración de la integración de Mercado Pago Point de Payment Intent API a Orders API implica la **actualización de endpoints y campos de la solicitud**, la **adaptación del modelo de _status_** y el aprovechamiento de **nuevos recursos nativos**. La nueva API incorpora _status_ autocontenidos, validez configurable de la order (`expiration_time`) y endpoint dedicado de reembolso. La migración no implica cambios en el flujo de negocio: la terminal sigue recibiendo las orders creadas por el _backend_ y procesando los pagos de forma autónoma.

A continuación, te explicamos cómo realizar esta migración de forma completa.

## Mapear los cambios de endpoint

Antes de iniciar los pasos de migración, consulta la tabla a continuación para tener una visión general de todos los cambios de endpoint. En Payment Intent API, cada operación utilizaba una estructura de URL propia con el identificador del dispositivo en el _path_. Orders API consolida estas operaciones en endpoints estandarizados y elimina el `{deviceid}` del _path_ en todas las operaciones.

| Operación | Payment Intent API | Orders API |
| --- | --- | --- |
| Listar terminales | [GET /point/integration-api/devicesGET](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_devices/get) | [GET /terminals/v1/listGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get) |
| Actualizar modo de operación de la terminal | [PATCH /point/integration-api/devices/{device\_id}PATCH](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_devices_device-id/patch) | [PATCH /terminals/v1/setupPATCH](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch) |
| Crear intención de pago vs. Crear order | [POST /point/integration-api/devices/{deviceid}/payment-intentsPOST](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_devices_deviceid_payment-intents/post) | [POST /v1/ordersPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) |
| Obtener intención de pago vs. Obtener order | [GET /point/integration-api/payment-intents/{paymentintentid}GET](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_payment-intents_paymentintentid/get) | [GET /v1/orders/{orderid}GET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) |
| Cancelar intención de pago vs. Cancelar order | [DELETE /point/integration-api/devices/{deviceid}/payment-intents/{paymentintentid}DELETE](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_devices_deviceid_payment-intents_paymentintentid/delete) | [POST /v1/orders/{orderid}/cancelPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/cancel-order/post) |
| Reembolsar order | No existe endpoint dedicado | [POST /v1/orders/{orderid}/refundPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/refund-order/post) |

## Adaptar los _headers_

Orders API introduce dos cambios obligatorios de _headers_ que afectan a todos los endpoints: el mecanismo de sandbox fue eliminado y un nuevo control de idempotencia fue introducido. Aplica los cambios a continuación antes de probar cualquier otro recurso.

## 11Eliminar el header x-test-scope

El _header_ `x-test-scope: sandbox` era utilizado en Payment Intent API para identificar solicitudes de prueba. En Orders API, el mecanismo de sandbox fue reestructurado y ese _header_ ya no existe. Elimínalo de todas las solicitudes de la integración. Para operar en ambiente de prueba en Orders API, utiliza usuarios de prueba. Consulta la [documentación de pruebas](https://www.mercadopago.com.mx/developers/es/docs/mp-point/integration-test) para más información.

## 22Agregar el header X-Idempotency-Key

El _header_ `X-Idempotency-Key` es obligatorio en las operaciones de creación, cancelación y reembolso de orders. Garantiza que una solicitud repetida con la misma clave devuelva el resultado original sin procesar la operación nuevamente. Envía un UUID v4 o _string_ aleatorio único por solicitud. Las operaciones de tipo **GET** no requieren este _header_.

Si se reutiliza la misma `X-Idempotency-Key` con un _body_ diferente, la API devolverá el error `idempotency_key_already_used`. Genera una clave distinta para cada nueva operación.

## Actualizar el listado y configuración de terminales

Los endpoints de terminales cambiaron de URL: el listado pasa de `GET /point/integration-api/devices` a `GET /terminals/v1/list` y la actualización de modo pasa de `PATCH /point/integration-api/devices/{device_id}` a `PATCH /terminals/v1/setup`. En la actualización de modo, el identificador de la terminal también deja el _path_ y pasa al _body_, dentro del _array_ `terminals[]`. Actualmente, el _array_ acepta un único elemento, por lo que solo puedes actualizar una terminal por solicitud.

## 11Migrar el listado de terminales

En Payment Intent API, los dispositivos eran devueltos en el _array_ `devices`. En Orders API, pasan a `data.terminals`. Los _query params_ `store_id`, `pos_id`, `limit` y `offset` se mantienen iguales. La tabla a continuación describe los cambios en la respuesta.

| Payment Intent API | Orders API | Descripción | Cambio |
| --- | --- | --- | --- |
| `devices[]` | `data.terminals[]` | Lista de terminales asociadas a la cuenta. En Payment Intent API, era devuelto como _array_ directo en `devices`. En Orders API, es movido dentro del objeto `data` y renombrado a `terminals`. | Renombrado y movido dentro del objeto `data`. |
| `devices[].id` | `data.terminals[].id` | Identificador único de la terminal. Los últimos caracteres coinciden con el serial en la etiqueta trasera de la terminal. | Mismo concepto. El formato del ID puede variar según el modelo de la terminal. |
| `devices[].pos_id` | `data.terminals[].pos_id` | Identificador de la caja asociada a la terminal. | Sin cambios. |
| `devices[].store_id` (_integer_) | `data.terminals[].store_id` (_string_) | Identificador de la sucursal asociada a la terminal. En Payment Intent API, era devuelto como entero. En Orders API, es devuelto como _string_. | Cambia de _integer_ a _string_. |
| `devices[].external_pos_id` | `data.terminals[].external_pos_id` | Identificador externo de caja, definido por el integrador. | Sin cambios. |
| `devices[].operating_mode` | `data.terminals[].operating_mode` | Modo de operación de la terminal. En Payment Intent API, los valores posibles son `PDV` y `STANDALONE`. En Orders API, el valor `UNDEFINED` es añadido para configuraciones no reconocidas. | Incorpora el valor `UNDEFINED` para configuración no reconocida. |
| `paging.total` / `paging.offset` / `paging.limit` | `paging.total` / `paging.offset` / `paging.limit` | Datos de paginación del listado: total de registros, punto de inicio y límite. | Sin cambios. |

En el listado de terminales, los errores fueron agrupados según el tipo de cambio. Consulta las tablas a continuación para más detalles.

### Errores no documentados en Orders API

Los siguientes errores existen en Payment Intent API pero no están documentados en Orders API.

| HTTP | Payment Intent API | Observación |
| --- | --- | --- |
| `400` | `bad_request` | Parámetro obligatorio ausente o con formato incorrecto. |
| `400` | `bad_request` | Formato de solicitud inválido. |
| `403` | `forbidden` | Presente en Payment Intent API. |

### Errores que permanecen igual

Los siguientes errores tienen el mismo comportamiento en ambas APIs.

| HTTP | Error | Observación |
| --- | --- | --- |
| `401` | `unauthorized` | Token inválido o expirado. |
| `500` | `internal_error` | Error interno. Verificar el retorno y reintentar. |

## 22Migrar la actualización del modo de operación

En Payment Intent API, el identificador de la terminal se enviaba en el _path_. En Orders API, el identificador migra al _body_ dentro del _array_ `terminals[]`. Actualmente, el _array_ acepta un único elemento, por lo que solo puedes actualizar una terminal por solicitud.

A continuación, un ejemplo comparativo de actualización de modo de operación.

Actualización del modo de operación vía Payment Intent API. El identificador de la terminal se envía como _path param_.

```
curl -X PATCH \
  'https://api.mercadopago.com/point/integration-api/devices/{{DEVICE_ID}}' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}' \
  -d '{
    "operating_mode": "PDV"
  }'
```

En Payment Intent API, la respuesta devuelve solo el campo `operating_mode`. En Orders API, la respuesta devuelve el _array_ `terminals[]` con `id` y `operating_mode`, identificando cada terminal actualizada. Consulta la tabla a continuación para el mapeo completo.

| Payment Intent API | Orders API | Descripción | Cambio |
| --- | --- | --- | --- |
| `operating_mode` | `terminals[].operating_mode` | Modo de operación definido para la terminal. En Payment Intent API, era devuelto como campo único. En Orders API, es devuelto dentro del _array_ `terminals[]`. Los valores posibles son `PDV` y `STANDALONE`. | Pasa al interior del _array_ `terminals[]`. |

Orders API también introduce el siguiente campo sin equivalente en Payment Intent API.

| Campo | Descripción |
| --- | --- |
| `terminals[].id` | Identificador único de la terminal actualizada. Es devuelto solo en Orders API. |

En la actualización del modo de operación, los errores fueron agrupados según el tipo de cambio. Consulta las tablas a continuación para más detalles.

### Errores que desaparecen

El siguiente error existe en Payment Intent API pero fue eliminado en Orders API.

| HTTP | Payment Intent API | Observación |
| --- | --- | --- |
| `424` | `failed_dependency` | Código eliminado en Orders API. |

### Errores renombrados

El siguiente error fue renombrado en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `403` | `forbidden` | `store_pos_not_found` | Terminal sin sucursal o caja asociada. |

### Errores que cambian de comportamiento

El siguiente error existe en ambas APIs pero con un significado diferente en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `400` | `bad_request` | `property_value` | `device_id` u `operating_mode` con valor inválido. |

### Errores que permanecen igual

Los siguientes errores tienen el mismo comportamiento en ambas APIs.

| HTTP | Error | Observación |
| --- | --- | --- |
| `401` | `unauthorized` | Token inválido o expirado. |
| `500` | `internal_error` | Error interno. Reintentar la solicitud. |

### Errores introducidos por Orders API

Los siguientes errores no tienen equivalente en Payment Intent API.

| HTTP | Error | Observación |
| --- | --- | --- |
| `400` | `unsupported_site` | Site inválido. |
| `400` | `required_properties` | Propiedad obligatoria ausente. |
| `400` | `unsupported_properties` | Campo no soportado enviado. |
| `400` | `invalid_payload` | _Payload_ inválido. Verificar los campos enviados. |
| `403` | `terminal_not_allowed_action` | Acción no permitida para este modelo de terminal. |
| `404` | `not_found` | Recurso no encontrado o ID inválido. |
| `412` | _(sin código __string__)_ | Operación no permitida: ya existe una terminal asociada a la caja en modo PDV. Solo se permite una terminal por caja en modo PDV. |

## Migrar la creación de intenciones de pago a la creación de orders

El endpoint de creación cambia de `POST /point/integration-api/devices/{deviceid}/payment-intents` a `POST /v1/orders`. Además del cambio de URL, la estructura de la solicitud fue significativamente reorganizada: el identificador de la terminal deja el _path_ y pasa al _body_, se introdujeron nuevos campos obligatorios y Orders API posee una estructura distinta. Sigue los pasos a continuación para adaptar la solicitud, la respuesta y el tratamiento de errores.

```
curl -X POST \
  'https://api.mercadopago.com/v1/orders' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: {{IDEMPOTENCY_KEY}}' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}' \
  -d '{
    "type": "point",
    "external_reference": "ext_ref_1234",
    "transactions": {
      "payments": [
        {
          "amount": "24.00"
        }
      ]
    },
    "config": {
      "point": {
        "terminal_id": "{{TERMINAL_ID}}",
        "print_on_terminal": "no_ticket"
      }
    },
    "description": "Point Smart 2"
  }'
```

## 11Mapear los campos del body de la solicitud

Orders API posee una estructura distinta a la de Intención de Pago: el identificador de la terminal debe enviarse en el _body_, los campos de configuración de pago e impresión se ubican en nuevos nodos, y los _headers_ de identificación forman parte del _body_. Los nuevos campos obligatorios son `type` (con valor `"point"`) y `external_reference`. Consulta la tabla a continuación para el mapeo completo de campos.

A continuación, un ejemplo comparativo entre la creación de una intención de pago y la creación de una order, seguido de la tabla de mapeo completo de campos.

Solicitud para crear una intención de pago. El identificador de la terminal se envía como _path param_ y el `amount` es un valor entero.

```
curl -X POST \
  'https://api.mercadopago.com/point/integration-api/devices/{{DEVICE_ID}}/payment-intents' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}' \
  -H 'x-test-scope: sandbox' \
  -d '{
    "amount": 1500,
    "additional_info": {
      "external_reference": "order-ref-001",
      "print_on_terminal": true
    },
    "description": "Producto de prueba"
  }'
```

| Payment Intent API | Orders API | Descripción | Cambio |
| --- | --- | --- | --- |
| `{deviceid}` (_path param_) | `config.point.terminal_id` | Identifica la terminal que recibirá la order. En Payment Intent API, se envía en el _path_. En Orders API, se envía en el _body_ con el formato `{tipo_terminal}__{serial_terminal}`. | Pasa de _path param_ a campo en el _body_. |
| `amount` (_integer_) | `transactions.payments[].amount` (_string_) | Monto a cobrar. En Payment Intent API, se representa como entero con dos decimales implícitos (ej.: `1500` para $15,00). En Orders API, se representa como _string_ dentro del _array_ `transactions.payments`. Acepta dos decimales (ej.: `"15.00"`) o ninguno. Solo se permite 1 transacción por order cuando `type` es `point`. | Cambia de entero a _string_ y pasa al _array_ `transactions.payments`. |
| `additional_info.external_reference` | `external_reference` | Identificador alfanumérico de la transacción en el sistema del integrador, devuelto en las notificaciones de webhook. En Orders API, es obligatorio, con un máximo de 64 caracteres, solo letras, números, `-` y `_`. Debe ser único por order y no puede contener datos PII. | Sube al nivel raíz y pasa a ser **obligatorio**. |
| `additional_info.print_on_terminal` (_boolean_) | `config.point.print_on_terminal` (_string_) | Controla la impresión del _ticket_ en la terminal. En Payment Intent API, acepta los valores booleanos `true` y `false`. En Orders API, acepta los valores `seller_ticket` (imprime) y `no_ticket` (no imprime). Valor por defecto: `seller_ticket`. | Cambia de booleano a _enum_ _string_. |
| `payment.type` | `config.payment_method.default_type` | Define el medio de pago aceptado por la terminal. En Payment Intent API, los valores posibles son `credit_card`, `debit_card`. En Orders API, los valores posibles son `credit_card`, `debit_card` y `qr`. Si no se envía, la terminal acepta todos los medios de pago. | Cambia de nodo y pasa a aceptar también `qr`. |
| `description` | `description` | Describe el producto, servicio o motivo del pago. En Orders API, acepta hasta 150 caracteres. | Sin cambios. |
| `X-platform-id` (_header_) | `integration_data.platform_id` | Identifica la plataforma de la integración, asignado por Mercado Pago. En Payment Intent API, se enviaba como _header_. En Orders API, se envía en el _body_ dentro de `integration_data`. | Deja de ser _header_ y pasa al _body_. |
| `X-integrator-id` (_header_) | `integration_data.integrator_id` | Identifica al integrador de la integración, asignado por Mercado Pago. En Payment Intent API, se enviaba como _header_. En Orders API, se envía en el _body_ dentro de `integration_data`. | Deja de ser _header_ y pasa al _body_. |

Orders API también introduce los siguientes campos sin equivalente en Payment Intent API.

| Campo | Descripción |
| --- | --- |
| `integration_data.sponsor.id` | USER\_ID de la cuenta de Mercado Pago del sistema integrador. |
| `type` | Tipo de order. Para Point, el único valor aceptado es `"point"`. **Obligatorio.** |
| `expiration_time` | Define el tiempo de validez de la order desde su creación, en formato ISO 8601. El valor mínimo es `PT30S` (30 segundos), el valor máximo es `PT3H` (3 horas) y el valor por defecto es `PT15M` (15 minutos). Ejemplos: `PT30S` para 30 segundos, `PT10M` para 10 minutos, `PT1H15M` para 1 hora y 15 minutos. Si la order expira sin ser procesada, se cancela automáticamente. **Opcional.** |

El formato del ID de la order cambia de UUID (ej.: `7f25f9aa-eea6-...`) a alfanumérico (ej.: `ORD00001111222233334444555566`). Actualiza cualquier lógica de almacenamiento o consulta que dependa del formato del ID antes de continuar.

Consulta todos los parámetros disponibles en la [Referencia de APIAPI](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post).

## 22Adaptar los campos de la respuesta de creación

La tabla a continuación presenta los campos de la respuesta de creación que existían en ambas APIs y sufrieron cambios en la migración.

| Payment Intent API | Orders API | Descripción | Cambio |
| --- | --- | --- | --- |
| `id` (UUID) | `id` (alfanumérico) | Identificador de la order creada, generado por Mercado Pago. En Payment Intent API, se devuelve en formato UUID. En Orders API, se devuelve en formato alfanumérico con prefijo `ORD`. | El formato del ID cambia a `ORD...`. |
| `device_id` | `config.point.terminal_id` | Identificador de la terminal que recibió la order. | Pasa a `config.point`. |
| `amount` (_integer_) | `transactions.payments[].amount` (_string_) | Valor del pago. En Payment Intent API, se devuelve como entero. En Orders API, se devuelve como _string_ decimal dentro del _array_ de pagos. | Pasa al _array_ de pagos. |
| `additional_info.external_reference` | `external_reference` | Referencia externa de la order en el sistema del integrador. | Sube al nivel raíz. |
| `additional_info.print_on_terminal` (_boolean_) | `config.point.print_on_terminal` (_string_) | Indica si la terminal imprimió el _ticket_. En Payment Intent API, se devuelve como booleano. En Orders API, se devuelve como _enum_ _string_: `seller_ticket` o `no_ticket`. | Cambia de booleano a _enum_ _string_. |
| `additional_info.ticket_number` | `config.point.ticket_number` | Valor alfanumérico para identificar el número de factura o _ticket_, impreso en la terminal cuando la impresión está habilitada. | Pasa a `config.point`. |

Orders API también introduce los siguientes campos sin equivalente en Payment Intent API.

| Campo | Descripción |
| --- | --- |
| `status` | Estado actual de la order. Al crear: `created`. |
| `status_detail` | Detalle del estado de la order. Al crear: `created`. |
| `type` | Tipo de order. Para Point: siempre `point`. |
| `expiration_time` | Tiempo de validez de la order en formato ISO 8601. Si la order expira sin ser procesada, se cancela automáticamente. |
| `created_date` / `last_updated_date` | Registra las fechas de creación y última actualización de la order en formato `yyyy-MM-ddTHH:mm:ss.sssZ`. |
| `transactions.payments[].id` | Identificador de la transacción de pago, generado por Mercado Pago. Necesario para reembolsos parciales. |
| `transactions.payments[].status` | Estado de la transacción de pago. Al crear: `created`. |
| `user_id` | Identificador del usuario de Mercado Pago que creó la order. |
| `country_code` | Identificador del site/país de la aplicación. |
| `integration_data.application_id` | Identificador de la aplicación de Mercado Pago. |
| `integration_data.platform_id` | Identificador de la plataforma, asignado por Mercado Pago. |
| `integration_data.integrator_id` | Identificador del integrador, asignado por Mercado Pago. |
| `integration_data.sponsor.id` | USER\_ID del sistema integrador. |

## 33Actualizar el tratamiento de errores en la creación

En la creación, los errores fueron agrupados según el tipo de cambio. Consulta las tablas a continuación para más detalles.

### Errores que cambian de comportamiento

En Payment Intent API, los siguientes errores devolvían el código genérico `bad_request`. En Orders API, son reemplazados por códigos específicos.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `400` | `bad_request` | `required_properties` | Propiedad obligatoria ausente. |
| `400` | `bad_request` | `property_value` | Valor inválido en una propiedad. |
| `400` | `bad_request` | `property_type` | Tipo incorrecto. Por ejemplo: _integer_ en vez de _string_. |
| `400` | `bad_request` | `json_syntax_error` | JSON inválido. |
| `400` | `bad_request` | `unsupported_properties` | Propiedad no soportada enviada. |

### Errores renombrados

Los siguientes errores fueron renombrados en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `403` | `forbidden` | `forbidden_checking_terminal_owner` | Terminal no vinculada a la cuenta. |
| `409` | `conflict_error` | `already_queued_order_for_terminal` | Ya existe una order en espera para este terminal. |

### Errores que desaparecen

El siguiente error existe en Payment Intent API pero fue eliminado en Orders API.

| HTTP | Payment Intent API | Observación |
| --- | --- | --- |
| `424` | `failed_dependency` | Código eliminado en Orders API. |

### Errores que permanecen igual

El siguiente error tiene el mismo comportamiento en ambas APIs.

| HTTP | Error | Observación |
| --- | --- | --- |
| `401` | `unauthorized` | Token inválido o expirado. |
| `500` | `internal_error` | Error interno. Verifica el retorno y repite la solicitud. |

### Errores introducidos por Orders API

Los siguientes errores no tienen equivalente en Payment Intent API.

| HTTP | Error | Observación |
| --- | --- | --- |
| `400` | `empty_required_header` | `X-Idempotency-Key` ausente. |
| `400` | `minimum_properties` | Número mínimo de propiedades obligatorias no enviado. |
| `400` | `minimum_items` / `maximum_items` | Número inválido de ítems en el _array_ `transactions.payments`. |
| `409` | `idempotency_key_already_used` | Clave de idempotencia reutilizada con _body_ diferente. |
| `500` | `idempotency_validation_failed` | Falla en la validación de idempotencia. Reintenta la solicitud. |

## Actualizar el mecanismo de consulta de Intención de Pago a Orders

El endpoint de consulta cambia de [GET /point/integration-api/payment-intents/{paymentintentid}GET](https://www.mercadopago.com.mx/developers/es/reference/integrations_api/_point_integration-api_payment-intents_paymentintentid/get) a [GET /v1/orders/{orderid}GET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get). El identificador de la order en el _path_ también cambia de formato UUID a alfanumérico. La respuesta incluye campos nuevos con información sobre el resultado del pago, reembolsos y datos de la tarjeta utilizada.

```
curl -X GET \
  'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}'
```

## 11Adaptar los campos de la respuesta de consulta

Además de los campos documentados en la respuesta de creación, la respuesta del **GET** incluye campos adicionales relevantes para la migración. Consulta la tabla a continuación para el detalle.

| Payment Intent API | Orders API | Descripción | Cambio |
| --- | --- | --- | --- |
| `state` | `status` | Estado de la order. En Payment Intent API, campo `state` con valores en mayúsculas. En Orders API, campo `status` con valores en minúsculas y conjunto de estados expandido. | Renombrado. Consulta el mapeo completo en [Actualizar el tratamiento de status](#bookmark_actualizar_el_tratamiento_de_status). |
| `payment.id` (_integer_) | `transactions.payments[].reference_id` (_string_) | Identificador del pago procesado, disponible cuando el flujo se completa con éxito. En Payment Intent API, era devuelto como entero en `payment.id`. En Orders API, es devuelto como _string_ en `transactions.payments[].reference_id`. | Identificador del pago procesado. Cambia de _integer_ a _string_. |

Orders API también introduce los siguientes campos sin equivalente en Payment Intent API.

| Campo | Descripción |
| --- | --- |
| `status_detail` | Detalle del estado de la order. Valores posibles: `accredited`, `canceled_by_api`, `bad_filled_card_data`, `insufficient_amount`, entre otros. Consulta la [Referencia de APIGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para la lista completa. |
| `transactions.payments[].paid_amount` | Valor efectivamente pagado en la transacción. |
| `transactions.payments[].refunded_amount` | Valor reembolsado en la transacción. |
| `transactions.payments[].status` | Estado de la transacción de pago. |
| `transactions.payments[].status_detail` | Detalle del estado de la transacción. Mismos valores posibles de `status_detail` de la order. |
| `transactions.payments[].payment_method.type` | Medio de pago utilizado en la transacción (ej.: `credit_card`, `debit_card`). |
| `transactions.payments[].payment_method.installments` | Cantidad de cuotas seleccionada en la transacción. |
| `transactions.payments[].payment_method.id` | Identificador del medio de pago o marca de tarjeta. Consulta en [GET /v1/payment\_methodsGET](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api/payment-methods/get). |
| `transactions.payments[].card.first_digits` / `last_digits` | Primeros y últimos dígitos de la tarjeta utilizada en la transacción, disponibles cuando el pago se realizó con tarjeta. |
| `transactions.refunds[]` | _Array_ con los datos de los reembolsos realizados en la order (`id`, `transaction_id`, `reference_id`, `amount`, `status`). |

## 22Actualizar el tratamiento de errores en la consulta

En la consulta, los errores fueron agrupados según el tipo de cambio. Consulta las tablas a continuación para más detalles.

### Errores que desaparecen

Los siguientes errores existen en Payment Intent API pero no tienen equivalente en Orders API.

| HTTP | Payment Intent API | Observación |
| --- | --- | --- |
| `401` | `unauthorized` (Unauthorized use of live credentials) | El _header_ `x-test-scope` fue eliminado en Orders API. |
| `403` | `forbidden` | La validación de propiedad de la terminal ocurre solo en la creación. |
| `429` | `too_many_requests` | Presente en Payment Intent API. No documentado en Orders API. |

### Errores renombrados

El siguiente error fue renombrado en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `404` | `not_found` | `order_not_found` | Order no encontrada. Verificar si el ID enviado es correcto. |

### Errores que cambian de comportamiento

El siguiente error existe en ambas APIs pero con un significado diferente en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `400` | `bad_request` | `bad_request` | Formato del `order_id` inválido. El ID cambia de UUID a alfanumérico. |

### Errores que permanecen igual

Los siguientes errores tienen el mismo comportamiento en ambas APIs.

| HTTP | Error | Observación |
| --- | --- | --- |
| `401` | `unauthorized` | Token inválido o expirado. |
| `500` | `internal_error` | Error interno. Reintentar la solicitud. |

## Actualizar el tratamiento de _status_

Uno de los cambios más significativos entre Payment Intent API y Orders API es el del campo `state`, que pasa a llamarse `status` en la nueva API y recibe nuevos valores. En Payment Intent API, el estado `FINISHED` requería llamadas adicionales para determinar el resultado real del pago. En Orders API, los _status_ `processed` y `failed` son autocontenidos y eliminan esa necesidad. Actualiza todas las verificaciones de _status_ de la integración conforme a la tabla a continuación.

## 11Mapear los valores de status

| Payment Intent API (`state`) | Orders API (`status`) | Observación |
| --- | --- | --- |
| `OPEN` | `created` | Renombrado |
| `ON_TERMINAL` | `at_terminal` | Renombrado |
| `PROCESSING` | Absorbido | No hay estado intermedio en Orders API |
| `PROCESSED` | Absorbido | No hay estado intermedio en Orders API |
| `FINISHED` (pago aprobado) | `processed` | El resultado del pago aprobado está contenido en la propia order, sin necesidad de consultas adicionales. |
| `FINISHED` (pago rechazado) | `failed` | El resultado del pago rechazado está contenido en la propia order, sin necesidad de consultas adicionales. |
| `CONFIRMATION_REQUIRED` | `action_required` | Renombrado |
| `ERROR` | `failed` | Renombrado |
| `ABANDONED` | `expired` | Renombrado (basado en timeout) |
| `CANCELED` | `canceled` | Mismo significado. Ahora en minúsculas |

En Payment Intent API, para confirmar el resultado de un pago con `state: FINISHED`, era necesario inspeccionar `payment.state` en el webhook, llamar a `GET /v1/payments/{id}` o buscar por `external_reference`. En Orders API, los _status_ `processed` y `failed` son autocontenidos: el resultado del pago está disponible directamente en la order, sin consultas adicionales.

Orders API también introduce el siguiente _status_ sin equivalente en Payment Intent API.

| _Status_ (Orders API) | Observación |
| --- | --- |
| `refunded` | **Nuevo _status_.** Debe tratarse explícitamente en todos los flujos. |

## Actualizar el tópico de notificaciones de webhook

En Payment Intent API, las notificaciones se enviaban con el tópico `point_integration_wh`. En Orders API, pasan al tópico **Order (Mercado Pago)** (`orders`).

Antes de ir a producción, actualiza la configuración de tu aplicación en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app). Para ello, selecciona el tópico **"Order (Mercado Pago)"** y desactiva el tópico `point_integration_wh`. Para más información, consulta la documentación [Configurar notificaciones](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications).

## Actualizar la cancelación de orders

El nuevo endpoint para cancelar una order es `POST /v1/orders/{orderid}/cancel`, reemplazando el `DELETE` de Payment Intent API. El `{deviceid}` desaparece del _path_ y la cancelación pasa a identificarse únicamente por el `{orderid}`.

Con Payment Intent API, solo era posible cancelar intenciones de pago que aún no habían llegado a la terminal. En Orders API, es posible cancelar una order incluso después de que haya llegado a la terminal, mediante un nuevo _header_ específico.

```
curl -X POST \
  'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}/cancel' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: {{IDEMPOTENCY_KEY}}' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}'
```

## 11Adaptar los headers de cancelación

La respuesta pasa a devolver el objeto completo de la order con `status: "canceled"`, en lugar de solo el `id`. Los _headers_ necesarios en esta operación son:

| _Header_ | Obligatoriedad | Descripción |
| --- | --- | --- |
| `X-Idempotency-Key` | Obligatorio | Clave única por solicitud |
| `x-allow-cancelable-status` | Condicional | Obligatorio para cancelar orders en `at_terminal`. Valor: `"at_terminal"` |

Para cancelar orders en status `at_terminal`, envía el _header_ `x-allow-cancelable-status: at_terminal`. Sin este _header_, solo se cancelarán orders con `status: created`.

## 22Actualizar el tratamiento de errores en la cancelación

En la cancelación, los errores fueron agrupados según el tipo de cambio. Consulta las tablas a continuación para más detalles.

### Errores que desaparecen

Los siguientes errores existen en Payment Intent API pero no tienen equivalente en Orders API.

| HTTP | Payment Intent API | Observación |
| --- | --- | --- |
| `400` | `bad_request` (deviceID format) | `deviceid` fue eliminado del _path_ en Orders API. |
| `429` | `too_many_requests` | Presente en Payment Intent API. No documentado en Orders API. |

### Errores renombrados

El siguiente error fue renombrado en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `409` | `conflict_error` | `cannot_cancel_order` | El estado de la order no permite la cancelación. Para `at_terminal`, enviar `x-allow-cancelable-status: at_terminal`. |

### Errores que cambian de comportamiento

Los siguientes errores existen en ambas APIs pero con comportamiento diferente en Orders API.

| HTTP | Payment Intent API | Orders API | Observación |
| --- | --- | --- | --- |
| `400` | `bad_request` | `bad_request` | Formato del `order_id` inválido. El ID cambia de UUID a alfanumérico. |
| `404` | `101` | `order_not_found` | Order no encontrada. En Payment Intent API, el campo `error` usa el código numérico `"101"`. |
| `409` | `101` | `order_already_canceled` | En Payment Intent API, order inexistente y order ya cancelada devolvían el mismo error `"101"`. En Orders API se diferencian en dos errores distintos: `404` para order no encontrada y `409` para order ya cancelada. |
| `500` | `internal_error` | `idempotency_validation_failed` | Falla en la validación de idempotencia. Reintentar la solicitud. |

### Errores que permanecen igual

El siguiente error tiene el mismo comportamiento en ambas APIs.

| HTTP | Error | Observación |
| --- | --- | --- |
| `401` | `unauthorized` | Token inválido o expirado. |

### Errores introducidos por Orders API

Los siguientes errores no tienen equivalente en Payment Intent API.

| HTTP | Error | Observación |
| --- | --- | --- |
| `400` | `empty_required_header` | `X-Idempotency-Key` ausente. |
| `409` | `idempotency_key_already_used` | Clave de idempotencia reutilizada. |

## Implementar reembolsos con el endpoint dedicado

Orders API introduce el endpoint dedicado `POST /v1/orders/{orderid}/refund` para reembolsos, que no existía en Payment Intent API. Antes, era necesario recibir el webhook del pago, obtener el `payment_id` y ejecutar el reembolso a través de la API de Payments por separado. Ahora, el reembolso se realiza directamente sobre la order.

## 11Reemplazar el flujo de reembolso de Payment Intent API

Elige entre reembolso total o parcial de acuerdo con el valor a devolver.

Para reembolsar el valor total de la order, envía la solicitud al endpoint [POST /v1/orders/{orderid}/refundPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/refund-order/post) sin _body_.

```
curl -X POST \
  'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}/refund' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}' \
  -H 'X-Idempotency-Key: {{IDEMPOTENCY_KEY}}'
```

Los reembolsos se aceptan hasta 90 días a partir de la fecha del pago.

Consulta todos los códigos de error posibles en esta operación en [Errores de reembolso](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/refund-errors).

## 22Adaptar los campos de la respuesta de reembolso

La respuesta del reembolso varía según el tipo de operación realizada.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | _string_ | Identificador de la order reembolsada |
| `status` | _string_ | `refunded` para reembolso total. `processed` para reembolso parcial (aún hay saldo disponible) |
| `status_detail` | _string_ | `refunded` para reembolso total. `partially_refunded` para reembolso parcial |
| `transactions.refunds[].id` | _string_ | Identificador del reembolso, generado por Mercado Pago |
| `transactions.refunds[].transaction_id` | _string_ | Identificador de la transacción de pago que está siendo reembolsada |
| `transactions.refunds[].reference_id` | _string_ | Identificador que asocia el pago y su respectivo reembolso |
| `transactions.refunds[].amount` | _string_ | Valor del reembolso |
| `transactions.refunds[].status` | _string_ | `processing` cuando el reembolso total fue solicitado y está en procesamiento. `processed` cuando el reembolso parcial fue concluido con éxito |

## Validar la migración

Después de aplicar los cambios, verifica que la integración funcione correctamente en todos los flujos antes de ir a producción.

Header x-test-scope eliminado

El _header_ `x-test-scope` fue eliminado de todas las solicitudes de la integración.

Header X-Idempotency-Key configurado

El _header_ `X-Idempotency-Key` debe estar presente en todas las operaciones de creación, cancelación y reembolso.

Terminales configuradas

Terminales listadas con el endpoint [GET /terminals/v1/listGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get) y modo de operación actualizado con [PATCH /terminals/v1/setupPATCH](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch).

Creación de orders validada

Orders creadas correctamente con el nuevo _payload_ en el endpoint [POST /v1/ordersPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) y recibidas en la terminal.

Consulta de orders validada

Orders consultadas correctamente a través del endpoint [GET /v1/orders/{orderid}GET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get).

Tópico de webhook actualizado

Tópico **"Order (Mercado Pago)"** (`orders`) configurado en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) sustituyendo `point_integration_wh`, y _status_ de orders monitoreados con los nuevos valores: `created`, `at_terminal`, `processed`, `failed`, `canceled` y `refunded`.

Cancelación de orders validada

Orders canceladas correctamente a través del endpoint [POST /v1/orders/{orderid}/cancelPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/cancel-order/post).

Reembolsos validados

Reembolsos realizados a través del endpoint dedicado [POST /v1/orders/{orderid}/refundPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/refund-order/post).

Accede a la documentación para saber cómo [probar la integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/integration-test).
