
# Gestionar Ordenes de Usuario

<a href="/es/api-reference/orders" target="_blank" class="api">Referencia de API</a>

La API de Rappi te permite administrar las órdenes que hacen los usuarios utilizando la aplicación de Rappi. Las siguientes secciones describen el proceso para:

- Gestionar el flujo de trabajo y el estado de las órdenes de los usuarios.
- Obtener órdenes de usuarios a través de solicitudes al API.

## Propiedades del Pedido

Las siguientes secciones describen las propiedades de las órdenes, sus diferentes estados y los eventos que ocurren en las órdenes.

### Estado del Pedido

Cuando un usuario crea una orden, la orden sigue un flujo específico desde el momento en que la aplicación comienza a procesarlo. El sistema activa algunos de estos cambios de estado automáticamente cada vez que la orden se actualiza en la aplicación de Rappi, y los demás deben actualizarse manualmente.

La siguiente tabla describe los diferentes estados por los que pasa la orden:

| Estado del pedido  | Descripción                                                                    | Tipo de actualización          | Transiciones desde                       | Transiciones a                                                                  |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `CREATED`          | Cuando un usuario crea una orden en la aplicación de Rappi.                    | Automático                     | N/A                                      | `WEBHOOK`<br><br>`READY`                                                        |
| `WEBHOOK`          | Cuando la orden se procesa por webhook.                                        | Automático                     | `CREATED`                                | `*READY`<br><br>`*SENT`<br><br>`**TAKEN`<br><br>`**REJECTED`<br><br>`**TIMEOUT` |
| `READY`            | Cuando la aplicación procesa la orden y está lista para enviarse a la tienda.  | Automático                     | `CREATED`<br><br>`WEBHOOK`               | `SENT`<br><br>`TIMEOUT`                                                         |
| `SENT`             | Cuando la aplicación confirma la recepción de la orden por parte de la tienda. | Manual-><br><br>Automático->   | `READY`<br><br>`WEBHOOK`                 | `TAKEN` <br><br>`REJECTED`<br><br>`TIMEOUT`                                     |
| `TAKEN`            | Cuando la tienda acepta la orden.                                              | Manual                         | `SENT`<br><br>`**WEBHOOK`                | `READY_FOR_PICKUP`                                                              |
| `REJECTED`         | Cuando la tienda rechaza la orden.                                             | Manual                         | `SENT`<br><br>`**WEBHOOK`                | N/A                                                                             |
| `TIMEOUT`          | Cuando ni la tienda ni Rappi, realiza alguna acción sobre la orden. `***`      | Automático                     | `READY`<br><br>`SENT`<br><br>`**WEBHOOK` | N/A                                                                             |
| `READY_FOR_PICKUP` | Cuando la tienda haya preparado la orden.                                      | Automático<br><br>`****`Manual | `TAKEN`                                  | N/A                                                                             |

Si la orden se está procesando a través de webhook, su estado inicial será `WEBHOOK` .

Las órdenes en estado `READY` pueden ser consultadas en el enpoint <a href="/es/api-reference/orders/#get-orders" target="_blank">`GET orders?storeId={storeId}`</a> , `*`en caso de que la orden se esté procesando a través de webhook, no es necesario hacer la consulta a menos que suceda un error en el proceso, ya que se realiza envío de la orden a la tienda y la transición a estado `SENT` de manera automática.

Cuando las órdenes estén en estado `SENT` se pueden tomar o rechazar de forma manual <a href="/es/api-reference/orders" target="_blank">`(ORDERS)`</a> , hay un tiempo limite de 6 minutos para tomar o rechazar la orden, de lo contrario pasará a estado `TIMEOUT` ; `**`existen casos en que el aliado tiene webhook, pero por alguna razón la respuesta del webhook no es exitosa, dicha orden se considera como orden no recepcionada por parte del aliado, Rappi mantiene el estado de la orden en `WEBHOOK` , pero es posible tomar o rechazar la orden.

`***`Las órdenes pueden estar en proceso de integración por un máximo de 6 minutos, de lo contrario la orden pasará a estado `TIMEOUT` .

De forma predeterminada, el sistema cambia la orden de `TAKEN` a `READY_FOR_PICKUP` automáticamente.

`****`Puedes solicitar a Rappi que gestione la transición a `READY_FOR_PICKUP` manualmente, teniendo en cuenta lo siguiente:

- Cuando se establece en **Automático**, Rappi cambia el estado del pedido en función del tiempo de cocinado de la tienda y los registros de retrasos en órdenes.

- Cuando se establece en **Manual**, debes llamar al endpoint <a href="/es/api-reference/orders#post-orders-order-id-ready-for-pickup" target="_blank">`POST orders/{orderId}/ready-for-pickup`</a> cuando la orden esté lista. Esto enviará una notificación al repartidor asignado; si no hay uno asignado, acelerará el proceso de asignación.

!!! important
Rappi recomienda mantener esta transición configurada en **Automático**, para evitar cualquier impacto en el flujo de sus órdenes.

!!! important
Si intenta hacer la transición de una orden a un estado ilegal (por ejemplo, rechazar un pedido ya tomado), terminará en la imposibilidad de iterar la orden, devolverá un mensaje de transición no válido.

La siguiente imagen describe los diferentes estados por los que pasa la orden:

<img src="/assets/estado-orden.png" alt="Status order" />

### Eventos de Ordenes

Durante el ciclo de vida de una orden, el sistema indica una serie de eventos y cada uno de estos eventos desencadena una acción diferente en la aplicación de Rappi.

Por ejemplo, el sistema activa un evento cuando se asigna un repartidor para recoger una orden en una tienda, y el evento cambia cuando el repartidor entrega este pedido al usuario.

La API de Rappi te permite traer el historial de eventos de las órdenes.

La siguiente tabla describe los eventos que pueden ocurrir durante el ciclo de vida de una orden:

| Evento de Pedido       | Descripción del Evento                                                                                                                                                                                                                                                      | Transiciona desde                                  | Transiciona a                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `taken_visible_order`  | Ocurre cuando:<br>- El pedido se asigna a la tienda dentro de Rappi, inmediatamente después de una toma exitosa de una orden.<br>- El repartidor se asigna al pedido, en este caso, Rappi también proporciona el tiempo estimado para que el repartidor llegue a la tienda. | N/A                                                | `ready_for_pick_up`<br><br> `replace_storekeeper` |
| `replace_storekeeper`  | Ocurre cuando Rappi asigna a un nuevo repartidor la orden. en este caso, Rappi también proporciona la ETA que tardará el repartidor en llegar a la tienda.                                                                                                                  | `taken_visible_order`                              | `ready_for_pick_up`                               |
| `ready_for_pick_up`    | Ocurre cuando la tienda prepara la orden y está lista para ser recogida.                                                                                                                                                                                                    | `taken_visible_order`<br><br>`replace_storekeeper` | `domiciliary_in_store`                            |
| `domiciliary_in_store` | Ocurre cuando el repartidor está en la tienda.                                                                                                                                                                                                                              | `ready_for_pick_up`                                | `hand_to_domiciliary`                             |
| `hand_to_domiciliary`  | Ocurre cuando la tienda entrega la orden al repartidor.                                                                                                                                                                                                                     | `domiciliary_in_store`                             | `arrive`                                          |
| `arrive`               | Se produce cuando la orden llega al domicilio del usuario.                                                                                                                                                                                                                  | `domiciliary_in_store`                             | `close_order`                                     |
| `close_order`          | Ocurre cuando el usuario recibe la orden.                                                                                                                                                                                                                                   | `arrive`                                           | N/A                                               |

### Enventos de Cancelación

Cuando ocurre una cancelación en la plataforma Rappi, el sistema genera un evento de cancelación dependiendo del escenario y las circunstancias de la cancelación.

La siguiente tabla contiene los eventos de cancelación existentes y su descripción:

| Envento de Cancelación          | Ocurre cuando:                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cancel_by_user`                | El usuario cancela una orden.                                                                                     |
| `canceled_with_charge`          | El usuario cancela una orden y Rappi aplica una tarifa de cancelación al usuario.                                 |
| `cancel_without_charges`        | El usuario cancela una orden sin cargo para el usuario.                                                           |
| `cancel_by_support`             | El servicio de atención al usuario de Rappi cancela la orden.                                                     |
| `cancel_by_support_with_charge` | El servicio de atención al usuario de Rappi cancela la orden y Rappi aplica una tarifa de cancelación al usuario. |
| `cancel_by_application_user`    | El aliado cancela una orden mediante la aplicación Cliente.                                                       |
| `canceled_from_cms`             | El servicio de atención al usuario de Rappi cancela la orden a través de la herramienta interna de CMS.           |
| `canceled_by_fraud_automation`  | Rappi cancela una orden debido a la detección de fraude.                                                          |
| `canceled_store_closed`         | Rappi cancela una orden que el usuario hizo a una tienda cerrada.                                                 |
| `cancel_by_sk_with_charge`      | El servicio de repartición cancela la orden y Rappi aplica una tarifa de cancelación al servicio de repartición.  |

### Total de Ordenes y Descuentos

Rappi te permite configurar campañas de descuento mediante la aplicación <a href="https://youtu.be/_1kYr-Hqw1M" target="_blank">Rappi Growth</a> o mediante el <a href="https://partners.rappi.com/" target="_blank">Portal de Partners</a>. Puedes aplicar descuentos a productos individuales, tiendas, o puedes configurar campañas de descuentos especiales para un número limitado de usuarios que realizan órdenes.

Utiliza la API de Rappi para ver los descuentos aplicados a las órdenes, los descuentos totales y los precios totales.

La siguiente tabla describe la información de descuentos en las órdenes:

| Campo                         | Descripción                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `value`                       | Valor del descuento reflejado en divisa.                                                                   |
| `description`                 | Mensaje descriptivo explicando el descuento.                                                               |
| `title`                       | Nombre del descuento.                                                                                      |
| `product_id`                  | ID del producto si el descuento aplica a un producto.                                                      |
| `sku`                         | SKU del producto si el descuento aplica a un producto.                                                     |
| `type`                        | Indica el tipo del descuento.                                                                              |
| `raw_value`                   | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `value_type`. |
| `value_type`                  | El tipo de valor del descuento, puede ser o value o percentage.                                            |
| `max_value`                   | Máximo valor en divisa a descontar.                                                                        |
| `includes_toppings`           | Indica si el descuento se resta del total de producto con toppings o no.                                   |
| `percentage_by_rappi`         | El porcentaje del descuento asumido por Rappi.                                                             |
| `percentage_by_partners`      | El porcentaje del descuento asumido por el aliado.                                                         |
| `amount_by_rappi`             | Valor del descuento reflejado en divisa asumido por Rappi.                                                 |
| `amount_by_partner`           | Valor del descuento reflejado en divisa asumido por el aliado.                                             |
| `discount_product_units`      | Cantidad de productos a las que aplicó el descuento.                                                       |
| `discount_product_unit_value` | Valor del descuento por unidad de producto.                                                                |

La siguiente tabla describe los indicadores para los totales de órdenes disponibles:

| Indicador de Total          | Descripción                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `total_products`            | El total de los productos sin descuentos.                        |
| `total_discounts`           | El total de los descuentos.                                      |
| `total_order`               | El total del pedido con descuentos.                              |
| `total_to_pay`              | El importe restante a pagar en efectivo por el usuario.          |
| `total_discount_by_partner` | El total en divisa de los descuentos asumidos por el aliado.     |
| `discount_by_support`       | Descuento aplicado al usuario por el equipo de soporte de Rappi. |
| `charges`                   | Los cargos en la orden.                                          |
| `shipping`                  | La tarifa de envío del pedido.                                   |
| `service_fee`               | La tarifa del servicio de pedido.                                |
| `other_totals`              | Los totales adicionales del pedido.                              |
| `tip`                       | La propina a pagar al repartidor.                                |
| `total_rappi_pay`           | La cantidad pagada con Rappi Pay.                                |
| `total_rappi_credits`       | El monto pagado con Rappicréditos.                               |

### Métodos de Entrega

Rappi te permite configurar diferentes métodos de entrega para tus órdenes.

Esta tabla describe los métodos de entrega disponibles:

| Método de Entrega | Descripción                                 |
| ----------------- | ------------------------------------------- |
| `delivery`        | Un repartidor Rappi entrega la orden        |
| `marketplace`     | Un repartidor de la tienda entrega la orden |
| `pickup`          | El usuario recoge la orden en la tienda     |

Rappi siempre admite la opción de `delivery` para todas sus tiendas, y puede elegir habilitar los métodos de entrega `marketplace` y `pickup`.

Puede configurar estas opciones a nivel de tienda con su principal punto de contacto de Rappi.

#### Datos del Domicilio

Dependiendo de los métodos de entrega de sus tiendas, las respuestas de la API contienen información específica.

La siguiente tabla representa la información común compartida entre los diferentes métodos de entrega.

| Campo              | Descripción                                 |
| ------------------ | ------------------------------------------- |
| `city`             | La ciudad de la dirección del pedido        |
| `neighborhood`     | El barrio de la dirección del pedido        |
| `postal_code`      | El código postal de la dirección del pedido |
| `complement`       | La información adicional de la dirección    |
| `complete_address` | La dirección completa del pedido            |

#### Campos de Marketplace por País

Las tiendas que tienen habilitado el método de entrega `marketplace` reciben información adicional en sus respuestas API.

La siguiente tabla especifica todos los campos de `delivery_information` presentes por país. Los campos marcados con `✓` están incluidos para ese país. Los campos marcados con `-` no están incluidos para ese país.

> `street_shorcut` (BR, PE) contiene un error tipográfico conocido — la 't' faltante de "shortcut" es intencional y se mantiene por estabilidad de la API.
> `address` (CL, AR, Otros) está obsoleto; utiliza `complete_address` en su lugar.

| Campo                                | CL  | AR  | BR  | MX  | PE  | CO  | Otros |
| ------------------------------------ | --- | --- | --- | --- | --- | --- | ----- |
| `city`                               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `neighborhood`                       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `postal_code`                        | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `complete_address`                   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `complement`                         | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `has_reverse_geocoding_result`       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `match_original_address`             | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `match_geocoding_address`            | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     |
| `street_name`                        | ✓   | ✓   | ✓   | ✓   | ✓   | -   | -     |
| `street_number`                      | ✓   | ✓   | ✓   | ✓   | ✓   | -   | -     |
| `description`                        | ✓   | ✓   | -   | -   | -   | -   | ✓     |
| `district`                           | ✓   | -   | -   | -   | -   | -   | -     |
| `address` _(obsoleto)_               | ✓   | ✓   | -   | -   | -   | -   | ✓     |
| `street_shorcut`                     | -   | -   | ✓   | -   | ✓   | -   | -     |
| `federal_unit`                       | -   | -   | ✓   | -   | -   | -   | -     |
| `complete_main_street`               | -   | -   | -   | -   | -   | ✓   | -     |
| `complete_main_street_number`        | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_number_or_name`         | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_type`                   | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_prefix`                 | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_prefix_letter`          | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_number_letter`          | -   | -   | -   | -   | -   | ✓   | -     |
| `main_street_quadrant`               | -   | -   | -   | -   | -   | ✓   | -     |
| `complete_complementary_street`      | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_without_meter` | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_number`        | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_letter`        | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_quadrant`      | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_prefix`        | -   | -   | -   | -   | -   | ✓   | -     |
| `complementary_street_prefix_letter` | -   | -   | -   | -   | -   | ✓   | -     |
| `meter`                              | -   | -   | -   | -   | -   | ✓   | -     |

### Información del Vendor

El campo `vendors` identifica el canal de origen de la orden. Las órdenes creadas desde WhatsApp tienen una entrada con `type: "tuweb"` en este array.

`vendors` siempre viene en la respuesta. Si la orden no tiene vendor asociado, el campo es un array vacío (`[]`), nunca `null`.

Campos del objeto `vendor`:

| Campo       | Tipo    | Descripción                       |
| ----------- | ------- | --------------------------------- |
| `id`        | integer | Identificador interno del vendor. |
| `type`      | string  | Tipo de vendor.                   |
| `vendor_id` | string  | Identificador externo del vendor. |
| `flow_type` | string  | Tipo de flujo asociado.           |

Valores posibles de `type`:

| Valor   | Descripción                     |
| ------- | ------------------------------- |
| `tuweb` | Orden originada desde WhatsApp. |

Ejemplo para una orden de WhatsApp:

```json
{
  "vendors": [
    {
      "id": 100200300,
      "type": "tuweb",
      "vendor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "flow_type": "ai-agent"
    }
  ]
}
```

Ejemplo para una orden regular:

```json
{
  "vendors": []
}
```

## Recuperar Nuevas Ordenes

<a href="/es/api-reference/orders#get-orders" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders#get-orders" target="_blank">`GET orders`</a> para recuperar una lista de todas las órdenes que están en estado `READY` para realizar más acciones.

!!! important
Solo puedes recuperar nuevas órdenes _una sola vez_. Después de recuperar estas órdenes, el sistema cambia su estado de `READY` a `SENT`.

Para recuperar nuevas órdenes:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

!!! note
Para recuperar solo las órdenes de una tienda específica, agregue el parámetro `storeId` a su solicitud, de la siguiente forma `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders?storeId={storeId}`.

El sistema recupera una respuesta `JSON` con todos los nuevas órdenes de sus tiendas. Consulte la estructura de respuesta `JSON` en la sección de endpoint `orders` de la Referencia de API.

Cuando recupere la lista de sus nuevas órdenes, puede [tomar](/es/managing-user-orders#tomar-ordenes), o [rechazar](/es/managing-user-orders#rechazar-ordenes) las órdenes.

## Recuperar Nuevas Ordenes En Estado SENT

<a href="/es/api-reference/orders#get-orders-status-sent" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders#get-orders-status-sent" target="_blank">`GET orders/status/sent`</a> para recuperar una lista de todas las órdenes que están en estado `SENT`.

!!! important
Solo se van a tener en cuenta las ordenes que su último estado sea `SENT` y que ese estado haya sido actualizado dentro del límite del tiempo (10 minutos hacia adelante).

Ejemplo:

Si la orden paso a estado `SENT` a las 14:00 del día 12/10/2021, y se utiliza este endpoint a las 14:07 el mismo día, el resultado traerá la orden, debido a que 14:07 - 10 minutos = 13:57 y la hora de cambio de estado fue a las 14:00 por lo que es mayor a 13:57.

Otro ejemplo, si la orden paso a estado `SENT` a las 14:00 del día 12/10/2021, pero se consulta el endpont a las 17:30, el resultado no traerá la orden porque 17:30 - 10 minutos = 17:20, y la hora de cambio de estado fue a las 14:00 que es menor a 17:20.

Para recuperar nuevas ordenes en estado `SENT`:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/status/sent`

`{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).

!!! note
Para recuperar solo las órdenes de una tienda específica, agregue el parámetro `storeId` a su solicitud.

El sistema recupera una respuesta `JSON` con todos los nuevas órdenes de sus tiendas. Consulte la estructura de respuesta `JSON` en la sección de endpoint `orders` de la Referencia de API.

Cuando recupere la lista de sus nuevas órdenes, puede [tomar](/es/managing-user-orders#tomar-ordenes), o [rechazar](/es/managing-user-orders#rechazar-ordenes) las órdenes.

## Tomar Ordenes

<a href="/es/api-reference/orders#put-orders-order-id-take-cooking-time" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders#put-orders-order-id-take-cooking-time" target="_blank">`PUT orders/{orderId}/take/{cookingTime}`</a> para recibir órdenes que se encuentran en estado `SENT`.

!!! important
Cuando tomas una orden, el sistema cambia su estado a `TAKEN` y la tienda comienza su preparación. Aunque es inusual, si obtiene un estado diferente a 200, use patrones de resiliencia como `reintentar`; utilícelo junto con el retroceso exponencial para disminuir multiplicativamente la tasa de la solicitud.

Para aceptar una orden, haz una solicitud `PUT` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/take/`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{orderId}`: Este es el identificador de tu pedido.

!!! note
Puedes modificar el tiempo de cocción predeterminado del pedido ingresando un nuevo tiempo de cocción al final del endpoint con el parámetro `{cookingTime}`: `/orders/{orderId}/take/{cookingTime}`.

El sistema regresa un objeto `JSON` con el mensaje de confirmación "_Order successfully taken_".

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

## Rechazar Ordenes

<a href="/es/api-reference/orders#put-orders-order-id-reject" target="_blank" class="api">Referencia de API</a>

Utiliza el endpoint <a href="/es/api-reference/orders#put-orders-order-id-reject" target="_blank">`PUT orders/{orderId}/reject`</a> para rechazar órdenes que están en estado `SENT` cuando:

- El pedido contiene artículos no válidos o no disponibles.
- El pedido contiene artículos con un precio incorrecto.

!!! important
_No utilices_ este endpoint para limitar el número de órdenes que procesa la tienda. Si rechazas varias órdenes para una tienda determinada en poco tiempo, Rappi deshabilita la tienda en la aplicación.

También puedes deshabilitar elementos del menú de la tienda al rechazar órdenes, proporcionando el `items_sku` o el `items_id` al cuerpo de la solicitud.

!!! note
Los elementos que deshabilites al rechazar una orden solo pueden ser habilitados nuevamente por Soporte de Rappi. Para ver otras formas de deshabilitar elementos, consulta la sección [Gestionar Disponibilidad](/managing-availability/) de este portal.

Para rechazar una orden, haz una solicitud `PUT` a la siguiente URL y agrega un objeto `JSON` al cuerpo de la solicitud con los siguientes objetos.

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/reject`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{orderId}`: Este es el identificador del pedido.

Este es un ejemplo del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "reason": "The order has invalid items"
}
```

!!! note
Para deshabilitar elementos del menú de la tienda, agregue los objetos `"items_sku"` o los objetos `"items_ids"` debajo de `"reason"` en el objeto JSON.

El sistema recupera una respuesta de objeto `JSON` con el mensaje de confirmación "_Order successfully rejected_".

## Notificar que la Orden Está Lista para ser Recogida

<a href="/es/api-reference/orders#post-orders-order-id-ready-for-pickup" target="_blank" class="api">Referencia de API</a>

Si tus tiendas tienen configuraciones de notificación manual, use el endpoint <a href="/es/api-reference/orders#post-orders-order-id-ready-for-pickup" target="_blank">`POST orders/{orderId}/ready-for-pickup`</a> para notificar a la aplicación de Rappi cuando una orden está lista para ser recogida.

Al realizar la primera solicitud:

- Si no hay un repartidor asignado, el sistema acelerará el proceso de asignación.
- Si hay un repartidor asignado, el sistema enviará una notificación al repartidor asignado.
- En función del estado actual de la orden, el sistema cambiará el estado de la orden a `READY_FOR_PICKUP`.

Al realizar la segunda solicitud:

- Si hay un repartidor asignado, el sistema enviará una notificación al repartidor asignado.

!!! important
Para evitar el uso indebido del endpoint, nos reservamos el derecho de revocar el acceso a aquellos clientes que lo utilicen de manera inapropiada. Es por ello que después de tres solicitudes, el sistema dejará de ejecutar acciones adicionales, por lo que cualquier intento posterior será considerado un uso incorrecto del endpoint.

Para notificar a Rappi cuando una orden está lista para ser recogida, realiza una solicitud `POST` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/ready-for-pickup`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{orderId}`: Este es el identificador de tu pedido.

El sistema devuelve una respuesta `JSON` con el mensaje de confirmación "_Order successfully updated_".

## Recuperar Eventos de Ordenes

<a href="/es/api-reference/orders#get-orders-order-id-events" target="_blank" class="api">Referencia de API</a>

Puedes recuperar los eventos de tu pedido utilizando el endpoint <a href="/es/api-reference/orders#get-orders-order-id-events" target="_blank">`GET orders/{orderId}/events`</a>.

Para recuperar los eventos de tu pedido:

Realiza una solicitud `GET` a la siguiente URL:

**URL**: `https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/events`

- `{COUNTRY_DOMAIN}`: Este es tu dominio de país de Rappi. [Ver la lista de dominios de países](/es/api-reference/content/#dominios).
- `{orderId}`: Este es el identificador de tu pedido.

El sistema recupera una respuesta `JSON` con el registro de los eventos de tu pedido.
