
# Eventos de Webhook

<a href="/es/api-reference/webhooks" target="_blank" class="api">Referencia de API</a>

Puedes configurar webhooks a través de API que te permiten recibir notificaciones sobre eventos que suceden en tus tiendas.

Estos son los eventos disponibles para recuperar con webhooks:

- `NEW_ORDER`: Evento de creación de la orden
- `NEW_ORDER_SCHEDULED`: Aviso anticipado de órdenes programadas. Se envía cuando el cliente programa una orden para una hora futura, antes del `NEW_ORDER` que llega en la liberación. Ver <a href="#new-order-scheduled">NEW_ORDER_SCHEDULED</a>
- `NEW_ORDER_SCHEDULED_CANCELLED`: Se envía cuando una orden programada se cancela antes de liberarse a tu tienda (es decir, antes del `NEW_ORDER`). Ver <a href="#new-order-scheduled-cancelled">NEW_ORDER_SCHEDULED_CANCELLED</a>
- `ORDER_EVENT_CANCEL`: Eventos de cancelación de pedidos. Ver <a href="/es/managing-user-orders#enventos-de-cancelacion" target="_blank">Eventos de cancelación</a>
- `ORDER_OTHER_EVENT`: Otros eventos del pedido. Ver <a href="/es/managing-user-orders#eventos-de-ordenes" target="_blank">Otros eventos</a>
- `MENU_APPROVED`: Eventos de aprobación del menú.
- `MENU_REJECTED`: Eventos de rechazo del menú.
- `PING`: Este evento habilita el proceso de health check
- `STORE_CONNECTIVITY`: Este evento habilita el proceso información de conectividad de las tiendas. (Cuando deja o vuelve a estar disponible para operar)
- `ORDER_RT_TRACKING`: Este evento habilita el proceso de tracking.
- `STORE_PROVISIONING_STATUS`: Notifica cuando una operación de aprovisionamiento o desaprovisionamiento en lote finaliza. Ver <a href="#store-provisioning-status">STORE_PROVISIONING_STATUS</a>

Utiliza los endpoints <a href="/es/api-reference/webhooks" target="_blank">Webhooks</a> para registrar y probar webhooks en tus tiendas.

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>En caso de querer consultar las IP’s desde donde se envía la información, deberán preguntarle a su Project Manager </p>
</div>

## Payloads de los eventos de webhook

<br/>

### NEW_ORDER

<br/>

El evento `NEW_ORDER` va a enviar la misma información que podemos obtener del endpoint getOrders para la orden que dispara el evento. Podemos encontrar mas información del body en la <a href="/es/api-reference/orders/#get-orders" target="_blank"> API reference</a>

### NEW_ORDER_SCHEDULED

<br/>

El evento `NEW_ORDER_SCHEDULED` es un **aviso anticipado** de que el cliente programó una orden para una hora futura (`place_at`). A diferencia de `NEW_ORDER`, se envía **cuando la orden programada se crea** —antes de la ventana de preparación— para que tu POS pueda planificarla con anticipación. Es **opt-in por tienda** y puramente aditivo: no reemplaza ni modifica `NEW_ORDER`.

La orden definitiva, con precios y totales confirmados, se entrega después por `NEW_ORDER` cuando la orden se **libera** a tu tienda (a la hora programada / apertura de la tienda). `NEW_ORDER` gobierna el ciclo de vida de la orden exactamente como antes.

El payload lleva la orden con la **forma completa de getOrders** más un campo `action` en el nivel superior. Solo los **valores monetarios** van en cero: los totales, los cargos/fees, los precios de los ítems y las propinas se envían en `0` / vacíos porque en la creación todavía son provisionales (Rappi los recalcula en la liberación). Todos los demás campos llegan con su valor real, igual que en `NEW_ORDER` —incluido un objeto `customer` de nivel superior con datos personales (PII) cuando están disponibles—. Los campos clave:

| Campo | Descripción |
| ----- | ----------- |
| `action`<br/>_string_ | Siempre `"scheduled"` para este evento. Permite distinguir el aviso anticipado de un `NEW_ORDER` normal, que no tiene campo `action`. |
| `order_detail.order_id`<br/>_string_ | Id de la orden en Rappi. |
| `order_detail.place_at`<br/>_string_ | Fecha y hora para la que el cliente programó la orden, en la hora local de la tienda (`yyyy-MM-dd HH:mm:ss`). |
| `order_detail.items[]`<br/>_array_ | Productos de la orden, con `sku`, `name` y `quantity`. **Los precios son `0`** (provisionales). |
| `customer`<br/>_object_ | Datos del cliente (`first_name`, `last_name`, `email`, `phone_number`, `document_type`, `document_number`), igual que en `NEW_ORDER`, cuando están disponibles. **Contiene PII.** |
| `store`<br/>_object_ | Tienda destino (`internal_id` / `external_id`). Nota: en este evento el id de la tienda vive acá (`store` de nivel superior), no en `order_detail`. |

Ejemplo de body:

```json
{
  "order_detail": {
    "order_id": "2150558091",
    "place_at": "2026-07-22 17:35:00",
    "delivery_method": "delivery",
    "payment_method": "cash",
    "totals": {
      "total_order": 0,
      "total_to_pay": 0,
      "charges": {},
      "other_totals": { "tip": 0, "total_rappi_pay": 0, "total_rappi_credits": 0 }
    },
    "items": [
      { "id": "729970", "name": "Producto 8", "quantity": 4, "sku": "0007",
        "price": 0, "unit_price_with_discount": 0, "unit_price_without_discount": 0 }
    ]
  },
  "customer": {
    "first_name": "...", "last_name": "...", "email": "...",
    "phone_number": "...", "document_type": "...", "document_number": "..."
  },
  "store": { "internal_id": "900105814", "external_id": "900105814", "name": "..." },
  "action": "scheduled"
}
```

Suscríbete con los endpoints de <a href="/es/api-reference/webhooks" target="_blank">Webhooks</a> usando `"event": "NEW_ORDER_SCHEDULED"`. Las tiendas no suscritas siguen recibiendo solo `NEW_ORDER`, sin cambios.

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Los campos monetarios de <code>NEW_ORDER_SCHEDULED</code> son provisionales y se envían en cero. Usá el <code>NEW_ORDER</code> que se entrega en la liberación para los precios, totales y fees confirmados. <code>NEW_ORDER_SCHEDULED</code> es una notificación adicional y su entrega no afecta a la orden.</p>
</div>

### NEW_ORDER_SCHEDULED_CANCELLED

<br/>

El evento `NEW_ORDER_SCHEDULED_CANCELLED` te avisa que una orden programada se **canceló antes de liberarse** a tu tienda —se canceló mientras todavía esperaba su hora programada, por lo que nunca entró al flujo normal de órdenes ni disparó `NEW_ORDER`—. Úsalo para cerrar el aviso `NEW_ORDER_SCHEDULED` correspondiente.

Si una orden programada se cancela **después** de haberse liberado (después del `NEW_ORDER`), sigue el flujo normal de <a href="#order-event-cancel">ORDER_EVENT_CANCEL</a>, no este evento.

Este evento es **opt-in por tienda** (una suscripción independiente de `NEW_ORDER_SCHEDULED`).

| Campo | Descripción |
| ----- | ----------- |
| `action`<br/>_string_ | Siempre `"cancelled"` para este evento. |
| `order_detail.order_id`<br/>_string_ | Id de la orden en Rappi (coincide con el `NEW_ORDER_SCHEDULED` previo). |
| `order_detail.store_id`<br/>_string_ | Id de la tienda. |
| `order_detail.place_at`<br/>_string_ | Fecha y hora programada, en la hora local de la tienda (`yyyy-MM-dd HH:mm:ss`). |

> **Nota — el id de la tienda vive en un lugar distinto según el evento:** en el **aviso** (`NEW_ORDER_SCHEDULED`) es el objeto `store` de nivel superior (no hay `order_detail.store_id`); en esta **baja** es `order_detail.store_id`. Tenelo en cuenta si matcheás un aviso con su baja por tienda.

Ejemplo de body:

```json
{
  "order_detail": {
    "order_id": "2150558091",
    "store_id": "900105814",
    "place_at": "2026-07-22 17:35:00"
  },
  "action": "cancelled"
}
```

### ORDER_EVENT_CANCEL

<br/>

El evento `ORDER_EVENT_CANCEL` enviará el payload con el siguiente formato:

```json
{
  "event": "canceled_with_charge",
  "order_id": "106",
  "store_id": "900109448"
}
```

Donde **event** representa el nombre del evento de cancelación.

Donde **order_id** representa el identificador de la orden.

Donde **store_id** representa el Identificador de la tienda en la aplicación de Rappi.

### ORDER_OTHER_EVENT

<br/>

El evento `ORDER_OTHER_EVENT` enviará el payload con el siguiente formato:

```json
{
  "event": "taken_visible_order",
  "order_id": "344949817",
  "store_id": "10000682",
  "event_time": "2023-05-04 12:01:22",
  "additional_information": {
    "courier_data": {
      "id": 729365,
      "phone": "3118012176",
      "full_name": "Daletzi Karina Olmedo Plata",
      "last_name": "Olmedo Plata",
      "first_name": "Daletzi Karina",
      "profile_pic": null
    },
    "eta_to_store": 147,
    "storekeeper_name": "Daletzi Karina Olmedo Plata"
  }
}
```

Donde **event** representa el nombre del evento.

Donde **order_id** representa el identificador de la orden.

Donde **store_id** representa el Identificador de la tienda en la aplicación de Rappi.

Donde **event_time** representa el dia y hora de evento.

Donde **additional_information** representa información detallada de la orden.

### MENU_APPROVED

<br/>

El evento `MENU_APPROVED` enviará el payload con el siguiente formato:

```json
{
  "store_id": "900109448",
  "message": "Menu Approved"
}
```

Donde **store_id** representa el Identificador de la tienda en la aplicación de Rappi.

Donde **message** es el mensaje de aprobación del menú.

### MENU_REJECTED

<br/>

El evento `MENU_REJECTED` enviará el payload con el siguiente formato:

```json
{
  "store_id": "900109448"
}
```

Donde **store_id** representa el Identificador de la tienda en la aplicación de Rappi.

### PING

<br/>

El evento PING enviará el payload con el siguiente formato:

```json
{
  "store_id": 999
}
```

Donde **store_id** representa el Identificador de la tienda en la aplicación de Rappi.

La respuesta debe tener el siguiente formato:

```json
{
  "status": "OK",
  "description": "Tienda prendida"
}
```

**status**: este campo es requerido, si viene null o con un valor distinto a OK se considerará que la tienda no está disponible.

**description**: este campo es opcional.

#### ¿COMO FUNCIONA PING?

`OBJETIVO` Detectar cuando una tienda pierde conectividad y apagarla al ocurrir un cambio de ping de positivo a negativo, con el fin de prevenir futuras cancelaciones por consecuencia de dicha falta de conectividad en la tienda para aceptar el take. Este Ping debe estar implementado para cada tienda y no en un servidor central como general.

`FUNCION` El monitor recibe una notificación cada vez que una tienda pase de recibir ping positivo a negativo. Al darse esto, inmediatamente se envía a suspender la tienda en cuestión. Como administrador se puede configurar el número de strikes para aplicar las reglas de ping negativo.

1. El ping, cuando se tiene configurado un webhook, se envía cada 3 minutos, en caso de no tener webhook y utilizar Pulling de ordenes, se evaluará cada 3 minutos.
2. Dependiendo del numero de ping negativos configurados, se genera un incidente de Ping Negativo.
3. El rango de tiempo configurado para el tiempo de gracia será de 1 minuto.
4. La cantidad de strikes actual esta configurado en 2 para todos los aliados.
5. Solo después de validar el tiempo de intermitencia, se genera el incidente de perdida o recuperación de la conectividad de acuerdo a la definición del mismo.

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Si no utilizas webhooks, la evaluacion cada 3 minutos se hace sobre la ultima vez que descargaste ordenes, el tiempo de gracia para determinar si es un ping negativo es de 1 minuto </p>
</div>

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Existen tiendas que tiene horario fraccionado durante el día, por tanto, este horario se debe tener en cuenta para la generación del ping </p>
</div>

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Es impórtate aclarar que NO aplica para las tiendas que tienen horario de 24 horas </p>
</div>

#### REGLAS PING

Estas son las siguientes reglas que tenemos en cuenta

`PING NEGATIVO` Esta regla crea un incidente de Conectividad Perdida, este incidente esta **Status: Abierto** en espera de un Ping Positivo.

`PING POSITIVO` En esta regla se dispara una alerta que busca el incidente de Conectividad perdida **Status: Abierto** para cambiarlo a **Status: Cerrado**.

### STORE_CONNECTIVITY

<br/>

El evento `STORE_CONNECTIVITY` enviará el payload con el siguiente formato:

```json
{
  "external_store_id": "999",
  "enabled": false,
  "message": "The Store is not enabled to operate"
}
```

Donde **external_store_id (String)** representa el id de la tienda configurada de su lado.

Donde **enabled (boolean)** representa con un valor binario de la tienda está disponible para operar o no.

Donde **message (String)** representa un mensaje informando si la tienda esta disponible o no.

### ORDER_RT_TRACKING

<br/>

El evento `ORDER_RT_TRACKING` enviará el payload con el siguiente formato:

```json
{
  "lat": 123.3,
  "lng": 1234.5,
  "eta_in_millis": 330000,
  "eta_type": "PICKUP o el DELIVERY",
  "order_id": 1234,
  "store_id": 1234,
  "courier_id": 1234,
  "created_at": "10/10/2023 12:00:20"
}
```

Donde **lat (Double)** representa la latitud del mensajero. Donde **lng (Double)** representa la longitud del mensajero. Donde **eta_in_millis (Integer)** representa la distancia en millas a la que se encuentra el mensajero del restaurante. Donde **order_id (Integer)** representa el id del pedido en el restaurante. Donde **courier_id (Integer)** representa el id del mensagero que es con la entrega. Donde **store_id (String)** representa el Identificador de la tienda en la aplicación de Rappi. Donde **created_at (String)** representa la fecha en la que fui creado.

## Seguridad

Para segurizar los webhooks nuestra Public API cuenta con una firma que se genera usando un código de autenticación de mensajes basado en hash (HMAC) con SHA-256 (Secure Hash Algorithm 2). Cada request tiene su propia firma, la cual se enviará en un header con el nombre **Rappi-Signature** y tendrá el siguiente formato

```
t=123456,sign=d74b65c2e68c1a84a4d5843a69ef5faf1d82f28df2dd3723e8e0dad9c54abc79
```

<div class="admonition whats-new">
    <p class="admonition-title"> <i class="fas fa-exclamation-circle"></i> Importante</p>
    <p>Todos headers descritos en este portal son <b>NO</b> case-sensitive. Para más información puedes revisar el siguiente <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers" target="_blank">Link</a></p>
</div>

## Validación tu Firma

Puedes validar la firma que llega en el header siguiendo los pasos de abajo

!!! Important
Para validar el estado de tu firma, vas a necesitar el `secret` de tu webhook.

1. Extrae la marca de tiempo y las firmas del encabezado.

   1.1 Separa con una coma,",". Para crear una lista.\

   1.2 Separa cada elemento nuevamente con "=" para obtener una `t` y un `sign`.

   - `t`: Es el timestamp de la solicitud
   - `sign`: Es la firma

2. Crea la cadena `signed_payload` concatenando:

   - El timestamp
   - El carácter `.`
   - El payload

     Ejemplo:

     ```
     123456.{ "message" : "Este es un ejemplo" }
     ```

3. Calcula un HMAC con la función hash SHA256. Utiliza el `secret` como clave y use la cadena `signed_payload` como mensaje para determinar la firma esperada.

4. Compara la firma en el encabezado con la firma esperada.

Ahora puedes asegurarte de que la información es válida.

!!! note
    Asegúrate de tomar el payload string en el mismo formato que llega para evitar diferencias en la firma

### STORE_PROVISIONING_STATUS

<br/>

El evento `STORE_PROVISIONING_STATUS` se dispara cuando una operación de aprovisionamiento o desaprovisionamiento en lote finaliza. Se configura a nivel de integración mediante <a href="/es/api-reference/webhooks#post-integration-webhook" target="_blank">`POST /clients/{clientId}/webhooks`</a> con `"event": "STORE_PROVISIONING_STATUS"` en el cuerpo de la solicitud.

El evento `STORE_PROVISIONING_STATUS` enviará el payload con el siguiente formato:

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "integrationId": "your-integration-id",
  "operation": "PROVISION",
  "results": [
    { "storeId": "10", "integrationId": "your-integration-id", "brand": "YourBrand", "status": "ACTIVE", "httpCode": 201 },
    { "storeId": "11", "integrationId": "your-integration-id", "brand": "YourBrand", "status": "FAILED", "errorMessage": "Store already exists", "httpCode": 409 }
  ],
  "timestamp": "2026-04-21T10:00:00Z"
}
```

Donde **batchId** es el identificador único de la operación en lote, coincide con el `batchId` devuelto en la respuesta de la API de aprovisionamiento/desaprovisionamiento.

Donde **integrationId** es el identificador de la integración propietaria de las tiendas.

Donde **operation** indica el tipo de operación realizada:

| Valor | Significado |
| ----- | ----------- |
| `PROVISION` | El lote fue una operación de aprovisionamiento. |
| `DEPROVISION` | El lote fue una operación de desaprovisionamiento. |

Donde **results** es un array con el resultado por tienda:

| Campo | Descripción |
| ----- | ----------- |
| `results[].storeId`<br/>_string_ | ID de la tienda Rappi para la cual se realizó la operación |
| `results[].integrationId`<br/>_string_ | Identificador de la integración |
| `results[].brand`<br/>_string_ | Nombre de marca resuelto desde Portal Partners |
| `results[].status`<br/>_string_ | Resultado de la operación para esta tienda (ver tabla a continuación) |
| `results[].httpCode`<br/>_integer_ | Código HTTP de la operación subyacente (ej. `201`, `204`, `409`) |
| `results[].errorMessage`<br/>_string_ | Solo presente cuando `status` es `FAILED`; describe el motivo del fallo |

Valores posibles de `results[].status`:

| Valor | Significado |
| ----- | ----------- |
| `ACTIVE` | El aprovisionamiento finalizó con éxito. La tienda ahora está integrada. |
| `INACTIVE` | El desaprovisionamiento finalizó con éxito. |
| `FAILED` | La operación falló. Revise `errorMessage` y `httpCode` para más detalles. |

Donde **timestamp** es la fecha y hora en formato ISO 8601 en que se generó el evento.

<aside class="notice">
  <p>NOTA</p>
  <p>A diferencia de otros eventos de webhook que se configuran por tienda, <code>STORE_PROVISIONING_STATUS</code> se configura una sola vez por integración. Consulte <a href="/es/self-onboarding" target="_blank">Self-Onboarding</a> para ver el flujo completo.</p>
</aside>
