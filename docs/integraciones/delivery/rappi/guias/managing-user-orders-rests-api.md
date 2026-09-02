
# Gestionar Ordenes de Usuario

<a href="/es/api-reference/orders-rests-api" target="_blank" class="api">Referencia de API</a>

La API de Rappi te permite administrar las órdenes que hacen los usuarios utilizando la aplicación de Rappi con los nuevos dominios. Las siguientes secciones describen el proceso para:

- Gestionar el flujo de trabajo y el estado de las órdenes de los usuarios.
- Obtener órdenes de usuarios a través de solicitudes al API.

## Recuperar Nuevas Ordenes De Una Tienda Especifica

<a href="/es/api-reference/orders-rests-api#get-stores-store-id-orders" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#get-stores-store-id-orders" target="_blank">`GET stores/{storeId}/orders`</a> para recuperar una lista de todas las órdenes de una tienda específica que están en estado `READY` para realizar más acciones.

!!! important
Solo puedes recuperar nuevas órdenes _una sola vez_. Después de recuperar estas órdenes, el sistema cambia su estado de `READY` a `SENT`.

Para recuperar nuevas órdenes:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Éste es el identificador de la tienda.

El sistema recupera una respuesta `JSON` con todos los nuevas órdenes de sus tiendas. Consulte la estructura de respuesta `JSON` en la sección de endpoint `orders` de la Referencia de API.

Cuando recupere la lista de sus nuevas órdenes, puede [tomar](/es/managing-user-orders-rests-api#tomar-ordenes) las órdenes.

## Tomar Ordenes

<a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-take" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-take" target="_blank">`PUT stores/{storeId}/orders/{orderId}/take`</a> para recibir órdenes que se encuentran en estado `SENT`.

!!! important
Cuando tomas una orden, el sistema cambia su estado a `TAKEN` y la tienda comienza su preparación. Aunque es inusual, si obtiene un estado diferente a 200, use patrones de resiliencia como `reintentar`; utilícelo junto con el retroceso exponencial para disminuir multiplicativamente la tasa de la solicitud.

Para aceptar una orden, haz una solicitud `PUT` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/take`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Este es el identificador de tu tienda.
- `{orderId}`: Este es el identificador de tu pedido.

## Tomar Ordenes Con Un Tiempo De Coccion Especifico

<a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-cooking-time-cooking-time-take" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-cooking-time-cooking-time-take" target="_blank">`PUT stores/{storeId}/orders/{orderId}/cooking_time/{cookingTime}/take`</a> para recibir órdenes que se encuentran en estado `SENT` con un específico tiempo de cocción.

!!! important
Cuando tomas una orden, el sistema cambia su estado a `TAKEN` y la tienda comienza su preparación. Aunque es inusual, si obtiene un estado diferente a 200, use patrones de resiliencia como `reintentar`; utilícelo junto con el retroceso exponencial para disminuir multiplicativamente la tasa de la solicitud.

Para aceptar una orden, haz una solicitud `PUT` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cooking_time/{cookingTime}/take`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Este es el identificador de tu tienda.
- `{orderId}`: Este es el identificador de tu pedido.
- `{cookingTime}`: Este es el tiempo de cocción nuevo.

### Tiempo de Cocción

Funcionalidad que permite modificar el tiempo de cocción de una orden al ser tomada y/o aceptada en el POS

**¿Cuales son los tiempos de cocción?**

La orden tiene tres posibles tiempos de coocción los cuales se aplican en el orden que se mencionan

- Tiempo de cocción predictivo
- Tiempo de cocción en CMS (con máximos y mínimos)
- Tiempo de cocción configurado en el core de la integración

**¿Cómo funciona el tiempo de cocción?**

El sistema hace un recorrido por cada uno de los tiempos de cocción en el orden mencionado para asignar el tiempo de cocción a la orden, y en caso que NO encuentre uno continúa con el siguiente hasta asignar el tiempo de cocción.

**¿Se puede cambiar el tiempo de cocción?**

Sí, Puede cambiar el tiempo de cocción por un valor contenido entre los valores del mínimo y máximo configurado en el core de la integración, y en caso que envie un valor que salga del rango configurado el sistema de manera automática toma el cambio en el mínimo o máximo configurado en el core de la integración.

## Obtener Codigo QR De Una Orden

<a href="/es/api-reference/orders-rests-api#get-stores-store-id-orders-order-id-handoff" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#get-stores-store-id-orders-order-id-handoff" target="_blank">`GET stores/{storeId}/orders/{orderId}/handoff`</a> para obtener el código de confirmación y código QR de la orden.

!!! important
La consulta del código QR puede realizarse solo después de haberse creado la orden.

Para obtener el código QR de la orden, haz una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/handoff`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Este es el identificador de tu tienda.
- `{orderId}`: Este es el identificador de tu pedido.

El sistema recupera una respuesta `JSON` que contendrá el código, el QR, el order_id y el store_id de la orden. Consulte la estructura de respuesta `JSON` en la sección de endpoint `orders` de la Referencia de API.

## Confirmar Bolsas y Bebidas

<a href="/es/api-reference/orders-rests-api#post-stores-store-id-orders-order-id-bag-drink-confirmation" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#post-stores-store-id-bag-drink-confirmation" target="_blank">`POST stores/{storeId}/orders/{orderId}/bag-drink-confirmation`</a> para confirmar el número de bolsas y si hay bebidas fuera de las bolsas de la orden.

!!! important
Esta confirmación la puede hacer tanto la tienda como el repartidor.

Para realizar la confirmación del número de bolsas y si hay bebidas fuera de las bolsas de la orden, haz una solicitud `POST` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/bag-drink-confirmation`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Este es el identificador de tu tienda.
- `{orderId}`: Este es el identificador de tu pedido.

El sistema recupera una respuesta `JSON` que contendrá el id de la orden, la entidad que realizó la confirmación (indicada en el campo last_updated_by, que puede ser "store" para la tienda o "storekeeper" para el repartidor), la cantidad de bolsas, la presencia de bebidas fuera de las bolsas, y las fechas de creación y última actualización. Consulte la estructura de respuesta `JSON` en la sección de endpoint `orders` de la Referencia de API.

## Notificar que la Orden Está Lista para ser Recogida

<a href="/es/api-reference/orders-rests-api#post-orders-order-id-ready-for-pickup" target="_blank" class="api">Referencia de API</a>

Si tus tiendas tienen configuraciones de notificación manual, use el endpoint <a href="/es/api-reference/orders-rests-api#post-orders-order-id-ready-for-pickup" target="_blank">`POST stores/{storeId}/orders/{orderId}/ready-for-pickup`</a> para notificar a la aplicación de Rappi cuando una orden está lista para ser recogida.

Al realizar la primera solicitud:

- Si no hay un repartidor asignado, el sistema acelerará el proceso de asignación.
- Si hay un repartidor asignado, el sistema enviará una notificación al repartidor asignado.
- En función del estado actual de la orden, el sistema cambiará el estado de la orden a `READY_FOR_PICKUP`.

Al realizar la segunda solicitud:

- Si hay un repartidor asignado, el sistema enviará una notificación al repartidor asignado.

!!! important
Para evitar el uso indebido del endpoint, nos reservamos el derecho de revocar el acceso a aquellos clientes que lo utilicen de manera inapropiada. Es por ello que después de tres solicitudes, el sistema dejará de ejecutar acciones adicionales, por lo que cualquier intento posterior será considerado un uso incorrecto del endpoint.

Para notificar a Rappi cuando una orden está lista para ser recogida, realiza una solicitud `POST` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/ready-for-pickup`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{orderId}`: Este es el identificador de tu pedido.

El sistema devuelve una respuesta `JSON` con el mensaje de confirmación "_Order successfully updated_".

## Rechazar Ordenes

<a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-cancel-type-cancel-type-reject" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders-rests-api#put-stores-store-id-orders-order-id-cancel-type-cancel-type-reject" target="_blank">`PUT stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject`</a> para rechazar la orden.

!!! important
Cuando rechazas una orden, el sistema cambia su estado a `REJECT` y la orden es cancelada.

Para rechazar una orden, haz una solicitud `PUT` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{storeId}`: Este es el identificador de tu tienda.
- `{orderId}`: Este es el identificador de tu pedido.
- `{cancelType}`: Corresponde al tipo de cancelación de tu pedido.

## Lista de Tipos de Cancelación Aceptados

En la siguiente sección, se describen los tipos de cancelación que puedes utilizar para rechazar una orden.

### STORE_CLOSED

Una cancelación por `STORE_CLOSED` se realiza cuando el restaurante está cerrado y no puede aceptar la orden.

```json
{
  "description": "ORDEN RECEPCIONADA FUERA DE HORARIO",
  "additional_info": {}
}
```

### ITEM_STOCKOUT

Una cancelación por `ITEM_STOCKOUT` se realiza cuando el restaurante no tiene suficiente stock para completar la orden.

```json
{
  "description": "Stock insuficiente en algunos artículos",
  "additional_info": {
    "items": ["sku-123", "sku-23"],
    "identity_type": "RAPPI/SKU"
  }
}
```

### POS_OFFLINE

Una cancelación por `POS_OFFLINE` se realiza cuando el integrador recibe una orden y no puede conectarse al POS o Terminal.

```json
{
  "description": "El restaurante tiene problemas y no puede recibir la orden",
  "additional_info": {}
}
```

### POS_INTERNAL_ERROR

Una cancelación por `POS_INTERNAL_ERROR` se realiza cuando existe un error interno en el POS o Terminal.

```json
{
  "description": "Technical issue in server",
  "additional_info": {}
}
```

### INTEGRATOR_ERROR

Una cancelación por `INTEGRATOR_ERROR` se realiza cuando el integrador no puede procesar la orden recibida por Rappi.

```json
{
  "description": "Error al convertir la orden de Rappi",
  "additional_info": {}
}
```

### DELIVERY_METHOD_NOT_SUPPORTED

Una cancelación por `DELIVERY_METHOD_NOT_SUPPORTED` se realiza cuando el integrador recibe una orden y no puede procesarla porque el método de entrega no es compatible.

```json
{
  "description": "Método de entrega no soportado",
  "additional_info": {
    "received_value": "pickup",
    "available_options": ["delivery", "marketplace", "pickup"]
  }
}
```

### ORDER_TOTAL_INCORRECT

Una cancelación por `ORDER_TOTAL_INCORRECT` se realiza cuando el total de la orden no coincide con la contabilidad en los sistemas del integrador.

```json
{
  "description": "Totales incorrectos",
  "additional_info": {
    "received_value": 123.13,
    "expected_value": 130.23
  }
}
```

### ORDER_CHARGES_INCORRECT

Una cancelación por `ORDER_CHARGES_INCORRECT` se realiza cuando hay un error en los cargos de la orden, como el service fee o delivery.

```json
{
  "description": "El valor del delivery es incorrecto",
  "additional_info": {}
}
```

### ORDER_DISCOUNTS_INCORRECT

Una cancelación por `ORDER_DISCOUNTS_INCORRECT` se realiza cuando hay un error en los descuentos aplicados a la orden.

```json
{
  "description": "El valor de uno o varios de los descuentos es incorrecto",
  "additional_info": {}
}
```

### OUTSIDE_DELIVERY_AREA

Una cancelación por `OUTSIDE_DELIVERY_AREA` se realiza cuando el integrador recibe una orden y requiere cancelarla porque el usuario se encuentra fuera del área de entrega.

```json
{
  "description": "Fuera de área de entrega",
  "additional_info": {}
}
```

### ITEM_PRICE_INCORRECT

Una cancelación por `ITEM_PRICE_INCORRECT` se realiza cuando el integrador necesita validar los precios unitarios de cada producto y no coinciden con los precios en el POS.

```json
{
  "description": "El precio de sku-23 está incorrecto",
  "additional_info": {
    "offending_items": [
      {
        "identifier": "sku-23",
        "identity_type": "RAPPI/SKU",
        "received_value": 123.13,
        "expected_value": 130.23
      }
    ]
  }
}
```

### ITEM_NOT_FOUND

Una cancelación por `ITEM_NOT_FOUND` se realiza cuando el integrador recibe una orden y algunos de los identificadores de productos no son reconocidos por el POS.

```json
{
  "description": "Los productos sku-123 y sku-23 no se encontraron en el sistema",
  "additional_info": {
    "items": ["sku-123", "sku-23"],
    "identity_type": "RAPPI/SKU"
  }
}
```

### CUSTOMER_INFO_INCORRECT

Una cancelación por `CUSTOMER_INFO_INCORRECT` se realiza cuando el integrador considera que hay problemas con la información del usuario.

```json
{
  "description": "Información del cliente incorrecta",
  "additional_info": {}
}
```
