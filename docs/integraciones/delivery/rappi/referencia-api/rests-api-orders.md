
# Rest API - Órdenes

Los recursos de órdenes te permiten interactuar con las órdenes de tus tiendas.

La siguiente tabla describe los diferentes contenidos del recurso órdenes:

| Recurso                                                                                                                                                              | Descripción                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`GET restaurants/orders/v1/orders`](#get-orders)                                                                                                                    | Regresa una lista de nuevas órdenes creadas de un clientId específico.         |
| [`GET restaurants/orders/v1/stores/{storeId}/orders`](#get-stores-store-id-orders)                                                                                   | Regresa una lista de nuevas órdenes creadas de un storeId específico.          |
| [`GET restaurants/orders/v1/orders/status/sent`](#get-orders-status-sent)                                                                                            | Regresa una lista de nuevas órdenes creadas en estado `SENT`.                  |
| [`PUT restaurants/orders/v1/stores/{storeId}/orders/{orderId}/take`](#put-stores-store-id-orders-order-id-take)                                                      | Toma una orden para comenzar su preparación.                                   |
| [`PUT restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cooking_time/{cookingTime}/take`](#put-stores-store-id-orders-order-id-cooking-time-take)              | Toma una orden para comenzar su preparación con el nuevo cooking time.         |
| [`GET restaurants/orders/v1/stores/{storeId}/orders/{orderId}/handoff`](#get-stores-store-id-orders-order-id-handoff)                                                | Regresa el código de confirmación y el codigo QR de la orden.                  |
| [`POST restaurants/orders/v1/stores/{storeId}/orders/{orderId}/bag-drink-confirmation`](#post-stores-store-id-orders-order-id-bag-drink-confirmation)                | Confirma el número de bolsas y si hay bebidas fuera de las bolsas de la orden. |
| [`POST restaurants/orders/v1/stores/{storeId}/orders/{orderId}/ready-for-pickup`](#post-orders-order-id-ready-for-pickup)                                            | Confirma que la orden está lista para ser recogida.                            |
| [`PUT restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject`](#put-stores-store-id-orders-order-id-cancel-type-cancel-type-reject) | Rechaza una orden para comenzar su preparación con el nuevo cooking time.      |

## GET orders

Usa este endpoint para obtener una lista con las nuevas órdenes para las tiendas del aliado autenticado.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/orders`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/orders/v1/orders`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/orders/v1/orders");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/orders",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/orders"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("GET", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/orders"
	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "order_detail": {
      "order_id": "string",
      "delivery_operation_type": "string",
      "cooking_time": 0,
      "min_cooking_time": 0,
      "max_cooking_time": 0,
      "created_at": "string",
      "delivery_method": "string",
      "payment_method": "string",
      "billing_information": {
        "billing_type": "string",
        "name": "string",
        "address": "string",
        "phone": "string",
        "email": "string",
        "document_type": "string",
        "document_number": "string"
      },
      "delivery_information": {
        "additionalProp1": "string",
        "additionalProp2": "string",
        "additionalProp3": "string"
      },
      "totals": {
        "total_products": 0,
        "total_discounts": 0,
        "total_products_with_discount": 0,
        "total_products_without_discount": 0,
        "total_other_discounts": 0,
        "total_order": 0,
        "total_to_pay": 0,
        "discount_by_support": 0,
        "totals_discount_by_partner": 0,
        "charges": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        },
        "other_totals": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        }
      },
      "items": [
        {
          "sku": "string",
          "id": "string",
          "name": "string",
          "type": "string",
          "comments": "string",
          "unit_price_with_discount": 0,
          "unit_price_without_discount": 0,
          "price": 0,
          "percentage_discount": 0,
          "quantity": 0,
          "subitems": ["string"]
        }
      ],
      "delivery_discount": {
        "additionalProp1": 0,
        "additionalProp2": 0,
        "additionalProp3": 0
      },
      "discounts": [
        {
          "value": 0,
          "description": "string",
          "tittle": "string",
          "product_id": 0,
          "type": "string",
          "raw_value": 0,
          "value_type": "string",
          "max_value": 0,
          "includes_toppings": true,
          "percentage_by_rappi": 0,
          "percentage_by_partners": 0,
          "amount_by_rappi": 0,
          "amount_by_partner": 0,
          "discount_product_units": 0,
          "discount_product_unit_value": 0,
          "sku": "string"
        }
      ]
    },
    "customer": {
      "first_name": "string",
      "last_name": "string",
      "phone_number": "string",
      "user_type": "string",
      "email": "string",
      "document_type": "string",
      "document_number": "string"
    },
    "store": {
      "internal_id": "string",
      "external_id": "string",
      "name": "string"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                                                   | Descripción del objeto                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_detail`<br/>_array of objects_                                    | Propiedades de los detalles de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.order_id`<br/>_string_                                     | Identificador de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.delivery_operation_type`<br/>_string_                      | Identificador para el tipo de orden: tipo turbo o tipo regular.                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.cooking_time`<br/>_integer_                                | Tiempo de preparación estimado para la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.min_cooking_time`<br/>_integer_                            | Tiempo mínimo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.max_cooking_time`<br/>_integer_                            | Tiempo máximo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.created_at`<br/>_string_                                   | Fecha en la que se creó la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_method`<br/>_string_, _enumerable_                | Método de entrega de la orden. Opciones disponibles: `delivery`,`marketplace`, `pickup`.                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.payment_method`<br/>_string_, _enumerable_                 | Metodo de pago de la orden. Opciones disponibles: `rappi_pay`, `cc`, `cash`, `paypal`, `edenred`, `webpay`, `masterpass`, `dc`, `pos_terminal`, `elo`, `sodexo`, `vale_r`, `ticket_r`, `alelo`, `visa_checkout`,`google_pay`, `apple_pay`, `rappicorp`, `PSE`, `PIX`, `unknown`. <b>(Es importante tener en cuenta que Rappi constantemente acepta nuevos métodos de pago, por lo tanto esta lista puede variar en el tiempo y no es necesario validarla.)</b> |
| `order_detail.delivery_information`<br/>_object_                         | Propiedades de la dirección de entrega.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.delivery_information.city`<br/>_string_                    | Ciudad de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complete_address`<br/>_string_        | Dirección de entrega con todos los campos                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.delivery_information.street_number`<br/>_string_           | Numero de la calle                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_information.neighborhood`<br/>_string_            | Barrio de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complement`<br/>_string_              | Información adicional de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.delivery_information.postal_code`<br/>_string_             | Código postal establecido para la dirección                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.delivery_information.street_name`<br/>_string_             | Nombre de la calle establecido para la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.billing_information`<br/>_array of objects_                | Propiedades de facturación del pago .                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.billing_information.address`<br/>_string_                  | Dirección de entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.billing_information.billing_type`<br/>_string_             | Tipo de cobro de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.document_number`<br/>_string_          | Número de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.billing_information.document_type`<br/>_string_            | Tipo de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.billing_information.email`<br/>_string_                    | Email establecido para recibir información de facturación.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.name`<br/>_string_                     | Nombre establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.billing_information.phone`<br/>_string_                    | Teléfono establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.totals`<br/>_array of objects_                             | Propiedades del total de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.total_products`<br/>_integer_                       | Total de los productos sin descuentos.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `order_detail.totals.total_discounts`<br/>_integer_                      | Total de productos sin descuento en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.totals.total_order`<br/>_integer_                          | Cantidad total que el restaurante recibe.<br/>Cuando el metodo de entrega es `marketplace` este campo incluye propina y cargos de entrega.<br/>Para otros métodos de entrega, este campo contiene solo el valor total de todos los productos.<br/>En todos los casos, este campo incluye los descuentos asumidos por el restaurante.                                                                                                                           |
| `order_detail.totals.total_to_pay`<br/>_integer_                         | El total que el usuario paga al repartidor en efectivo. Aplica únicamente cuando el metodo de entrega es `marketplace` o `pickup`, y el método de pago es: `cash`.                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.discount_by_support`<br/>_integer_                  | Descuento aplicado al usuario por el equipo de soporte de Rappi.                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.totals.charges`<br/>_array of objects_                     | Propiedades de cargos adicionales de la orden .                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.totals.charges.shipping`<br/>_integer_                     | Total de cargos de envío .                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.totals.charges.service_fee`<br/>_integer_                  | Cargos del servicio de Rappi                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.totals.other_totals`<br/>_array of objects_                | Otros cargos incluidos en esta orden.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.totals.other_totals.tip`<br/>_integer_                     | Propina para el repartidor.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.totals.other_totals.total_rappi_pay`<br/>_integer_         | Total pagado usando Rappi Pay.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.totals.othet_totals.total_rappi_credits`<br/>_integer_     | Total pagado usando Rappi Creditos .                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items`<br/>_array of objects_                              | Propiedades de los artículos que contiene la orden.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.sku`<br/>_string_                                    | SKU del artículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.items.id`<br/>_string_                                     | Identificador del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.items.name`<br/>_string_                                   | Nombre del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.items.type`<br/>_string_, _enumerable_                     | Tipo de artículo. Opciones disponibles: <br/>`product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items.comments`<br/>_array_                                | Comentarios del usuario para un artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.items.price`<br/>_integer_                                 | Precio unitario del artículo sin descuento.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.quantity`<br/>_integer_                              | Cantidad especificada del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems`<br/>_array of objects_                     | Propiedades de los subartículos en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.items.subitems.sku`<br/>_string_                           | SKU del subartículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.id`<br/>_string_                            | Identificador que Rappi asigna al artículo.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.name`<br/>_string_                          | Nombre del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.subitems.type`<br/>_string_, _enumerable_            | Tipo del subartículo en la orden. Opciones disponibles: `product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems.price`<br/>_integer_                        | Precio unitario del subartículo sin descuento                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.items.subitems.quantity`<br/>_integer_                     | Cantidad especificada del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount`<br/>_integer_                           | Propiedades de los descuentos en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.delivery_discount.total_percentage_discount`<br/>_integer_ | Porcentaje de descuento en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount.total_value_discount`<br/>_integer_      | Monto total del descuento en la entrega.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.customer`<br/>_array of objects_                           | Propiedades del usuario de Rappi que crea la orden. Solo se envían cuando el método de entrega es `marketplace` o si se solicita a Rappi que envíe esta información                                                                                                                                                                                                                                                                                            |
| `order_detail.customer.first_name`<br/>_string_                          | Nombre del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.customer.last_name`<br/>_string_                           | Apellido del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.customer.phone_number`<br/>_string_                        | Número de teléfono del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.customer.document_number`<br/>_string_                     | Número de documento del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.customer.user_type`<br/>_string_                           | Si el usuario es VIP se envía el valor `USER_VIP`. Para el resto de los usuarios este campo no se envía.                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.store`<br/>_array of objects_                              | Propiedades de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.store.internal_id`<br/>_string_                            | Identificador interno que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.store.external_id`<br/>_string_                            | Identificador de la integración que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.store.name`<br/>_string_                                   | Nombre de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.discounts.value`<br/>_integer_                             | Valor del descuento reflejado en divisa.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.description`<br/>_string_                        | Mensaje descriptivo explicando el descuento.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.title`<br/>_string_                              | Nombre del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.discounts.product_id`<br/>_integer_                        | ID del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.discounts.sku`<br/>_string_                                | SKU del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.discounts.type`<br/>_string_                               | Indica el tipo del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.discounts.raw_value`<br/>_integer_                         | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `type_value`.                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.value_type`<br/>_string_, _enumerable_           | El tipo de valor del descuento. Opciones disponibles: `value`, `percentage`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.max_value`<br/>_integer_                         | Máximo valor en divisa a descontar.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.discounts.includes_toppings`<br/>_boolean_                 | Indica si el descuento se resta del total de producto con toppings o no.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.percentage_by_rappi`<br/>_integer_               | El porcentaje del descuento asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.percentage_by_partners`<br/>_integer_            | El porcentaje del descuento asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.discounts.amount_by_rappi`<br/>_integer_                   | Valor del descuento reflejado en divisa asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.amount_by_partner`<br/>_integer_                 | Valor del descuento reflejado en divisa asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.discount_product_units`<br/>_integer_            | Cantidad de productos a las que aplicó el descuento.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.discounts.discount_product_unit_value`<br/>_integer_       | Valor del descuento por unidad de producto.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## GET stores/{storeId}/orders

Usa este endpoint para obtener una lista con las nuevas órdenes para la tienda específica del aliado autenticado.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/orders/v1/stores/205634/orders`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 205634;

URL url = new URL("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders", storeId);

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/205634/orders",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/205634/orders"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("GET", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/205634/orders"
	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "order_detail": {
      "order_id": "string",
      "delivery_operation_type": "string",
      "cooking_time": 0,
      "min_cooking_time": 0,
      "max_cooking_time": 0,
      "created_at": "string",
      "delivery_method": "string",
      "payment_method": "string",
      "billing_information": {
        "billing_type": "string",
        "name": "string",
        "address": "string",
        "phone": "string",
        "email": "string",
        "document_type": "string",
        "document_number": "string"
      },
      "delivery_information": {
        "additionalProp1": "string",
        "additionalProp2": "string",
        "additionalProp3": "string"
      },
      "totals": {
        "total_products": 0,
        "total_discounts": 0,
        "total_products_with_discount": 0,
        "total_products_without_discount": 0,
        "total_other_discounts": 0,
        "total_order": 0,
        "total_to_pay": 0,
        "discount_by_support": 0,
        "totals_discount_by_partner": 0,
        "charges": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        },
        "other_totals": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        }
      },
      "items": [
        {
          "sku": "string",
          "id": "string",
          "name": "string",
          "type": "string",
          "comments": "string",
          "unit_price_with_discount": 0,
          "unit_price_without_discount": 0,
          "price": 0,
          "percentage_discount": 0,
          "quantity": 0,
          "subitems": ["string"]
        }
      ],
      "delivery_discount": {
        "additionalProp1": 0,
        "additionalProp2": 0,
        "additionalProp3": 0
      },
      "discounts": [
        {
          "value": 0,
          "description": "string",
          "tittle": "string",
          "product_id": 0,
          "type": "string",
          "raw_value": 0,
          "value_type": "string",
          "max_value": 0,
          "includes_toppings": true,
          "percentage_by_rappi": 0,
          "percentage_by_partners": 0,
          "amount_by_rappi": 0,
          "amount_by_partner": 0,
          "discount_product_units": 0,
          "discount_product_unit_value": 0,
          "sku": "string"
        }
      ]
    },
    "customer": {
      "first_name": "string",
      "last_name": "string",
      "phone_number": "string",
      "user_type": "string",
      "email": "string",
      "document_type": "string",
      "document_number": "string"
    },
    "store": {
      "internal_id": "string",
      "external_id": "string",
      "name": "string"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                                                   | Descripción del objeto                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_detail`<br/>_array of objects_                                    | Propiedades de los detalles de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.order_id`<br/>_string_                                     | Identificador de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.delivery_operation_type`<br/>_string_                      | Identificador para el tipo de orden: tipo turbo o tipo regular.                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.cooking_time`<br/>_integer_                                | Tiempo de preparación estimado para la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.min_cooking_time`<br/>_integer_                            | Tiempo mínimo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.max_cooking_time`<br/>_integer_                            | Tiempo máximo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.created_at`<br/>_string_                                   | Fecha en la que se creó la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_method`<br/>_string_, _enumerable_                | Método de entrega de la orden. Opciones disponibles: `delivery`,`marketplace`, `pickup`.                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.payment_method`<br/>_string_, _enumerable_                 | Metodo de pago de la orden. Opciones disponibles: `rappi_pay`, `cc`, `cash`, `paypal`, `edenred`, `webpay`, `masterpass`, `dc`, `pos_terminal`, `elo`, `sodexo`, `vale_r`, `ticket_r`, `alelo`, `visa_checkout`,`google_pay`, `apple_pay`, `rappicorp`, `PSE`, `PIX`, `unknown`. <b>(Es importante tener en cuenta que Rappi constantemente acepta nuevos métodos de pago, por lo tanto esta lista puede variar en el tiempo y no es necesario validarla.)</b> |
| `order_detail.delivery_information`<br/>_object_                         | Propiedades de la dirección de entrega.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.delivery_information.city`<br/>_string_                    | Ciudad de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complete_address`<br/>_string_        | Dirección de entrega con todos los campos                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.delivery_information.street_number`<br/>_string_           | Numero de la calle                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_information.neighborhood`<br/>_string_            | Barrio de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complement`<br/>_string_              | Información adicional de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.delivery_information.postal_code`<br/>_string_             | Código postal establecido para la dirección                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.delivery_information.street_name`<br/>_string_             | Nombre de la calle establecido para la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.billing_information`<br/>_array of objects_                | Propiedades de facturación del pago .                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.billing_information.address`<br/>_string_                  | Dirección de entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.billing_information.billing_type`<br/>_string_             | Tipo de cobro de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.document_number`<br/>_string_          | Número de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.billing_information.document_type`<br/>_string_            | Tipo de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.billing_information.email`<br/>_string_                    | Email establecido para recibir información de facturación.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.name`<br/>_string_                     | Nombre establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.billing_information.phone`<br/>_string_                    | Teléfono establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.totals`<br/>_array of objects_                             | Propiedades del total de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.total_products`<br/>_integer_                       | Total de los productos sin descuentos.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `order_detail.totals.total_discounts`<br/>_integer_                      | Total de productos sin descuento en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.totals.total_order`<br/>_integer_                          | Cantidad total que el restaurante recibe.<br/>Cuando el metodo de entrega es `marketplace` este campo incluye propina y cargos de entrega.<br/>Para otros métodos de entrega, este campo contiene solo el valor total de todos los productos.<br/>En todos los casos, este campo incluye los descuentos asumidos por el restaurante.                                                                                                                           |
| `order_detail.totals.total_to_pay`<br/>_integer_                         | El total que el usuario paga al repartidor en efectivo. Aplica únicamente cuando el metodo de entrega es `marketplace` o `pickup`, y el método de pago es: `cash`.                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.discount_by_support`<br/>_integer_                  | Descuento aplicado al usuario por el equipo de soporte de Rappi.                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.totals.charges`<br/>_array of objects_                     | Propiedades de cargos adicionales de la orden .                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.totals.charges.shipping`<br/>_integer_                     | Total de cargos de envío .                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.totals.charges.service_fee`<br/>_integer_                  | Cargos del servicio de Rappi                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.totals.other_totals`<br/>_array of objects_                | Otros cargos incluidos en esta orden.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.totals.other_totals.tip`<br/>_integer_                     | Propina para el repartidor.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.totals.other_totals.total_rappi_pay`<br/>_integer_         | Total pagado usando Rappi Pay.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.totals.othet_totals.total_rappi_credits`<br/>_integer_     | Total pagado usando Rappi Creditos .                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items`<br/>_array of objects_                              | Propiedades de los artículos que contiene la orden.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.sku`<br/>_string_                                    | SKU del artículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.items.id`<br/>_string_                                     | Identificador del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.items.name`<br/>_string_                                   | Nombre del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.items.type`<br/>_string_, _enumerable_                     | Tipo de artículo. Opciones disponibles: <br/>`product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items.comments`<br/>_array_                                | Comentarios del usuario para un artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.items.price`<br/>_integer_                                 | Precio unitario del artículo sin descuento.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.quantity`<br/>_integer_                              | Cantidad especificada del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems`<br/>_array of objects_                     | Propiedades de los subartículos en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.items.subitems.sku`<br/>_string_                           | SKU del subartículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.id`<br/>_string_                            | Identificador que Rappi asigna al artículo.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.name`<br/>_string_                          | Nombre del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.subitems.type`<br/>_string_, _enumerable_            | Tipo del subartículo en la orden. Opciones disponibles: `product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems.price`<br/>_integer_                        | Precio unitario del subartículo sin descuento                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.items.subitems.quantity`<br/>_integer_                     | Cantidad especificada del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount`<br/>_integer_                           | Propiedades de los descuentos en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.delivery_discount.total_percentage_discount`<br/>_integer_ | Porcentaje de descuento en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount.total_value_discount`<br/>_integer_      | Monto total del descuento en la entrega.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.customer`<br/>_array of objects_                           | Propiedades del usuario de Rappi que crea la orden. Solo se envían cuando el método de entrega es `marketplace` o si se solicita a Rappi que envíe esta información                                                                                                                                                                                                                                                                                            |
| `order_detail.customer.first_name`<br/>_string_                          | Nombre del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.customer.last_name`<br/>_string_                           | Apellido del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.customer.phone_number`<br/>_string_                        | Número de teléfono del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.customer.document_number`<br/>_string_                     | Número de documento del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.customer.user_type`<br/>_string_                           | Si el usuario es VIP se envía el valor `USER_VIP`. Para el resto de los usuarios este campo no se envía.                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.store`<br/>_array of objects_                              | Propiedades de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.store.internal_id`<br/>_string_                            | Identificador interno que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.store.external_id`<br/>_string_                            | Identificador de la integración que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.store.name`<br/>_string_                                   | Nombre de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.discounts.value`<br/>_integer_                             | Valor del descuento reflejado en divisa.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.description`<br/>_string_                        | Mensaje descriptivo explicando el descuento.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.title`<br/>_string_                              | Nombre del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.discounts.product_id`<br/>_integer_                        | ID del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.discounts.sku`<br/>_string_                                | SKU del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.discounts.type`<br/>_string_                               | Indica el tipo del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.discounts.raw_value`<br/>_integer_                         | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `type_value`.                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.value_type`<br/>_string_, _enumerable_           | El tipo de valor del descuento. Opciones disponibles: `value`, `percentage`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.max_value`<br/>_integer_                         | Máximo valor en divisa a descontar.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.discounts.includes_toppings`<br/>_boolean_                 | Indica si el descuento se resta del total de producto con toppings o no.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.percentage_by_rappi`<br/>_integer_               | El porcentaje del descuento asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.percentage_by_partners`<br/>_integer_            | El porcentaje del descuento asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.discounts.amount_by_rappi`<br/>_integer_                   | Valor del descuento reflejado en divisa asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.amount_by_partner`<br/>_integer_                 | Valor del descuento reflejado en divisa asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.discount_product_units`<br/>_integer_            | Cantidad de productos a las que aplicó el descuento.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.discounts.discount_product_unit_value`<br/>_integer_       | Valor del descuento por unidad de producto.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## GET orders/status/sent

Usa este endpoint para obtener una lista con las nuevas órdenes en estado `SENT` para las tiendas del aliado autenticado.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/orders/status/sent`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/orders/v1/orders/status/sent`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/orders/v1/orders/status/sent");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

try (BufferedReader br = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
  StringBuilder response = new StringBuilder();
  String responseLine;
  while ((responseLine = br.readLine()) != null) {
    response.append(responseLine.trim());
  }
  System.out.println("Response body: " + response.toString());
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/orders/status/sent",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/orders/status/sent"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("GET", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/orders/status/sent"
	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "order_detail": {
      "order_id": "string",
      "delivery_operation_type": "string",
      "cooking_time": 0,
      "min_cooking_time": 0,
      "max_cooking_time": 0,
      "created_at": "string",
      "delivery_method": "string",
      "payment_method": "string",
      "billing_information": {
        "billing_type": "string",
        "name": "string",
        "address": "string",
        "phone": "string",
        "email": "string",
        "document_type": "string",
        "document_number": "string"
      },
      "delivery_information": {
        "additionalProp1": "string",
        "additionalProp2": "string",
        "additionalProp3": "string"
      },
      "totals": {
        "total_products": 0,
        "total_discounts": 0,
        "total_products_with_discount": 0,
        "total_products_without_discount": 0,
        "total_other_discounts": 0,
        "total_order": 0,
        "total_to_pay": 0,
        "discount_by_support": 0,
        "totals_discount_by_partner": 0,
        "charges": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        },
        "other_totals": {
          "additionalProp1": 0,
          "additionalProp2": 0,
          "additionalProp3": 0
        }
      },
      "items": [
        {
          "sku": "string",
          "id": "string",
          "name": "string",
          "type": "string",
          "comments": "string",
          "unit_price_with_discount": 0,
          "unit_price_without_discount": 0,
          "price": 0,
          "percentage_discount": 0,
          "quantity": 0,
          "subitems": ["string"]
        }
      ],
      "delivery_discount": {
        "additionalProp1": 0,
        "additionalProp2": 0,
        "additionalProp3": 0
      },
      "discounts": [
        {
          "value": 0,
          "description": "string",
          "tittle": "string",
          "product_id": 0,
          "type": "string",
          "raw_value": 0,
          "value_type": "string",
          "max_value": 0,
          "includes_toppings": true,
          "percentage_by_rappi": 0,
          "percentage_by_partners": 0,
          "amount_by_rappi": 0,
          "amount_by_partner": 0,
          "discount_product_units": 0,
          "discount_product_unit_value": 0,
          "sku": "string"
        }
      ]
    },
    "customer": {
      "first_name": "string",
      "last_name": "string",
      "phone_number": "string",
      "user_type": "string",
      "email": "string",
      "document_type": "string",
      "document_number": "string"
    },
    "store": {
      "internal_id": "string",
      "external_id": "string",
      "name": "string"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                                                   | Descripción del objeto                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_detail`<br/>_array of objects_                                    | Propiedades de los detalles de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.order_id`<br/>_string_                                     | Identificador de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.delivery_operation_type`<br/>_string_                      | Identificador para el tipo de orden: tipo turbo o tipo regular.                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.cooking_time`<br/>_integer_                                | Tiempo de preparación estimado para la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.min_cooking_time`<br/>_integer_                            | Tiempo mínimo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.max_cooking_time`<br/>_integer_                            | Tiempo máximo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.created_at`<br/>_string_                                   | Fecha en la que se creó la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_method`<br/>_string_, _enumerable_                | Método de entrega de la orden. Opciones disponibles: `delivery`,`marketplace`, `pickup`.                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.payment_method`<br/>_string_, _enumerable_                 | Metodo de pago de la orden. Opciones disponibles: `rappi_pay`, `cc`, `cash`, `paypal`, `edenred`, `webpay`, `masterpass`, `dc`, `pos_terminal`, `elo`, `sodexo`, `vale_r`, `ticket_r`, `alelo`, `visa_checkout`,`google_pay`, `apple_pay`, `rappicorp`, `PSE`, `PIX`, `unknown`. <b>(Es importante tener en cuenta que Rappi constantemente acepta nuevos métodos de pago, por lo tanto esta lista puede variar en el tiempo y no es necesario validarla.)</b> |
| `order_detail.delivery_information`<br/>_object_                         | Propiedades de la dirección de entrega.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.delivery_information.city`<br/>_string_                    | Ciudad de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complete_address`<br/>_string_        | Dirección de entrega con todos los campos                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.delivery_information.street_number`<br/>_string_           | Numero de la calle                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_information.neighborhood`<br/>_string_            | Barrio de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complement`<br/>_string_              | Información adicional de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.delivery_information.postal_code`<br/>_string_             | Código postal establecido para la dirección                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.delivery_information.street_name`<br/>_string_             | Nombre de la calle establecido para la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.billing_information`<br/>_array of objects_                | Propiedades de facturación del pago .                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.billing_information.address`<br/>_string_                  | Dirección de entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.billing_information.billing_type`<br/>_string_             | Tipo de cobro de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.document_number`<br/>_string_          | Número de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.billing_information.document_type`<br/>_string_            | Tipo de documento del cliente.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.billing_information.email`<br/>_string_                    | Email establecido para recibir información de facturación.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.name`<br/>_string_                     | Nombre establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.billing_information.phone`<br/>_string_                    | Teléfono establecido para la facturación.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.totals`<br/>_array of objects_                             | Propiedades del total de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.total_products`<br/>_integer_                       | Total de los productos sin descuentos.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `order_detail.totals.total_discounts`<br/>_integer_                      | Total de productos sin descuento en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.totals.total_order`<br/>_integer_                          | Cantidad total que el restaurante recibe.<br/>Cuando el metodo de entrega es `marketplace` este campo incluye propina y cargos de entrega.<br/>Para otros métodos de entrega, este campo contiene solo el valor total de todos los productos.<br/>En todos los casos, este campo incluye los descuentos asumidos por el restaurante.                                                                                                                           |
| `order_detail.totals.total_to_pay`<br/>_integer_                         | El total que el usuario paga al repartidor en efectivo. Aplica únicamente cuando el metodo de entrega es `marketplace` o `pickup`, y el método de pago es: `cash`.                                                                                                                                                                                                                                                                                             |
| `order_detail.totals.discount_by_support`<br/>_integer_                  | Descuento aplicado al usuario por el equipo de soporte de Rappi.                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.totals.charges`<br/>_array of objects_                     | Propiedades de cargos adicionales de la orden .                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.totals.charges.shipping`<br/>_integer_                     | Total de cargos de envío .                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.totals.charges.service_fee`<br/>_integer_                  | Cargos del servicio de Rappi                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.totals.other_totals`<br/>_array of objects_                | Otros cargos incluidos en esta orden.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.totals.other_totals.tip`<br/>_integer_                     | Propina para el repartidor.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.totals.other_totals.total_rappi_pay`<br/>_integer_         | Total pagado usando Rappi Pay.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.totals.othet_totals.total_rappi_credits`<br/>_integer_     | Total pagado usando Rappi Creditos .                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items`<br/>_array of objects_                              | Propiedades de los artículos que contiene la orden.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.sku`<br/>_string_                                    | SKU del artículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.items.id`<br/>_string_                                     | Identificador del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.items.name`<br/>_string_                                   | Nombre del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.items.type`<br/>_string_, _enumerable_                     | Tipo de artículo. Opciones disponibles: <br/>`product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.items.comments`<br/>_array_                                | Comentarios del usuario para un artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.items.price`<br/>_integer_                                 | Precio unitario del artículo sin descuento.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.quantity`<br/>_integer_                              | Cantidad especificada del artículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems`<br/>_array of objects_                     | Propiedades de los subartículos en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.items.subitems.sku`<br/>_string_                           | SKU del subartículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.id`<br/>_string_                            | Identificador que Rappi asigna al artículo.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.items.subitems.name`<br/>_string_                          | Nombre del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.items.subitems.type`<br/>_string_, _enumerable_            | Tipo del subartículo en la orden. Opciones disponibles: `product`, o `topping`.                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.items.subitems.price`<br/>_integer_                        | Precio unitario del subartículo sin descuento                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.items.subitems.quantity`<br/>_integer_                     | Cantidad especificada del subartículo en la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount`<br/>_integer_                           | Propiedades de los descuentos en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.delivery_discount.total_percentage_discount`<br/>_integer_ | Porcentaje de descuento en la entrega de la orden.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount.total_value_discount`<br/>_integer_      | Monto total del descuento en la entrega.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.customer`<br/>_array of objects_                           | Propiedades del usuario de Rappi que crea la orden. Solo se envían cuando el método de entrega es `marketplace` o si se solicita a Rappi que envíe esta información                                                                                                                                                                                                                                                                                            |
| `order_detail.customer.first_name`<br/>_string_                          | Nombre del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.customer.last_name`<br/>_string_                           | Apellido del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.customer.phone_number`<br/>_string_                        | Número de teléfono del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.customer.document_number`<br/>_string_                     | Número de documento del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.customer.user_type`<br/>_string_                           | Si el usuario es VIP se envía el valor `USER_VIP`. Para el resto de los usuarios este campo no se envía.                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.store`<br/>_array of objects_                              | Propiedades de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.store.internal_id`<br/>_string_                            | Identificador interno que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.store.external_id`<br/>_string_                            | Identificador de la integración que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.store.name`<br/>_string_                                   | Nombre de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.discounts.value`<br/>_integer_                             | Valor del descuento reflejado en divisa.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.description`<br/>_string_                        | Mensaje descriptivo explicando el descuento.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.title`<br/>_string_                              | Nombre del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `order_detail.discounts.product_id`<br/>_integer_                        | ID del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.discounts.sku`<br/>_string_                                | SKU del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.discounts.type`<br/>_string_                               | Indica el tipo del descuento.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.discounts.raw_value`<br/>_integer_                         | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `type_value`.                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.value_type`<br/>_string_, _enumerable_           | El tipo de valor del descuento. Opciones disponibles: `value`, `percentage`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.max_value`<br/>_integer_                         | Máximo valor en divisa a descontar.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_detail.discounts.includes_toppings`<br/>_boolean_                 | Indica si el descuento se resta del total de producto con toppings o no.                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.percentage_by_rappi`<br/>_integer_               | El porcentaje del descuento asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.percentage_by_partners`<br/>_integer_            | El porcentaje del descuento asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.discounts.amount_by_rappi`<br/>_integer_                   | Valor del descuento reflejado en divisa asumido por Rappi.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.amount_by_partner`<br/>_integer_                 | Valor del descuento reflejado en divisa asumido por el aliado.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.discount_product_units`<br/>_integer_            | Cantidad de productos a las que aplicó el descuento.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `order_detail.discounts.discount_product_unit_value`<br/>_integer_       | Valor del descuento por unidad de producto.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## PUT stores/{storeId}/orders/{orderId}/take

Usa este endpoint para tomar una orden para que la tienda comience a prepararla.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/take`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

`{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Orden exitosamente tomada

</aside>

<aside class="error-response">

`400` Estado de transición inválido

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Orden no encontrada

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/take`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 392625;
final Integer orderId = 203654;

URL url = new URL(String.format("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders/%s/take", storeId, orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "PUT",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/392625/orders/203654/take",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/take"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("PUT", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/take"
	method := "PUT"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

Este endpoint únicamente regresa un código de estado.

## PUT stores/{storeId}/orders/{orderId}/cooking_time/{cookingTime}/take

Usa este endpoint para tomar una orden para que la tienda comience a prepararla.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cooking_time/{cookingTime}/take`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

`{orderId}`: Este es el identificador de la orden.

`{cookingTime}`: Este es el nuevo tiempo de cocción de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Orden exitosamente tomada

</aside>

<aside class="error-response">

`400` Estado de transición inválido

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Orden no encontrada

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/restaurants/orders/v1/stores/205643/orders/392625/cooking_time/20/take`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 205643;
final Integer orderId = 392625;
final Integer cookingTime = 20;

URL url = new URL(String.format("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders/%s/cooking_time/%s/take", storeId, orderId, cookingTime));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "PUT",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/205643/orders/392625/cooking_time/20/take",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/205643/orders/392625/cooking_time/20/take"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("PUT", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/205643/orders/392625/cooking_time/20/take"
	method := "PUT"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

Este endpoint únicamente regresa un código de estado.

## GET stores/{storeId}/orders/{orderId}/handoff

Utilice este endpoint para tomar un recibir un codigo de check out y poder pedirle al RT que confirme el envio

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/handoff`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

`{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`412` La condición previa falló

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/handoff`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 392625;
final Integer orderId = 203654;

URL url = new URL(String.format("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders/%s/handoff", storeId, orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "GET",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/392625/orders/203654/handoff",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/handoff"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("GET", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/handoff"
	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "order_id": 2150145112,
  "store_id": 900126924,
  "product_confirmation_code": "3756",
  "qr_code": "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAIAAAAiOjnJAAALRklEQVR4Xu2SQZJjOxLD+v6X/rOHsGAoxLRrnFhWgGT6lf79tywF/vEPy/KCfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4V9WEuFfVhLhX1YS4Xph/Xvo/Ca5j1cam4l8Joy43sfhdc07+FScyuB15QZ3/sovKZ5D5eaWwm8psz43kfhNc17uNTcSuA1Zcb3Pgqvad7DpeZWAq8pM773UXhN8x4uNbcSeE2Z8b0DGu/gUrbFjKVomHPCTJa6g0vNLWV874DGO7iUbTFjKRrmnDCTpe7gUnNLGd87oPEOLmVbzFiKhjknzGSpO7jU3FLG9w5ovINL2RYzlqJhzgkzWeoOLjW3lPG9Axrv4FK2xYylaJhzwkyWuoNLzS1lfO+Axju4lG0xYyka5pwwk6Xu4FJzSxnfO6BhTgJbrIeGwYzBTAZbrIdGBlush0aZ8b0DGuYksMV6aBjMGMxksMV6aGSwxXpolBnfO6BhTgJbrIeGwYzBTAZbrIdGBlush0aZ8b0DGuYksMV6aBjMGMxksMV6aGSwxXpolBnfO6BhTgJbrIeGwYzBTAZbrIdGBlush0aZ8b0DGuYksMV6aBjMGMxksMV6aGSwxXpolBnfO6BhTgJbrIeGwUwGWwxmLEUjgy3WQ6PM+N4BDXMS2GI9NAxmMthiMGMpGhlssR4aZcb3DmiYk8AW66FhMJPBFoMZS9HIYIv10CgzvndAw5wEtlgPDYOZDLYYzFiKRgZbrIdGmfG9AxrmJLDFemgYzGSwxWDGUjQy2GI9NMqM7x3QMCeBLdZDw2Amgy0GM5aikcEW66FRZnzvgIY5CWyxHhoZbLEeGu+cBLZYD40y43sHNMxJYIv10Mhgi/XQeOcksMV6aJQZ3zugYU4CW6yHRgZbrIfGOyeBLdZDo8z43gENcxLYYj00MthiPTTeOQlssR4aZcb3DmiYk8AW66GRwRbrofHOSWCL9dAoM753QMOcBLZYD40MtlgPjXdOAlush0aZ8b0DGu/g0rst9hrMWIrGO7jU3FLG9w5ovINL77bYazBjKRrv4FJzSxnfO6DxDi6922KvwYylaLyDS80tZXzvgMY7uPRui70GM5ai8Q4uNbeU8b0DGu/g0rst9hrMWIrGO7jU3FLG9w5ovINL77bYazBjKRrv4FJzSxnf+yi8xu6h0XQm4TVlxvc+Cq+xe2g0nUl4TZnxvY/Ca+weGk1nEl5TZnzvo/Aau4dG05mE15QZ3/sovMbuodF0JuE1Zcb3PgqvsXtoNJ1JeE2Z6b1vg5//HVz6MX7+99fg0o/x87+/Bpd+jJ///TW49GP8/O+vwaUf4+d/fw0u/RjTv5+f32DmXYqGwYzBjKVoZM4ruNTcUsb3Aph5l6JhMGMwYykamfMKLjW3lPG9AGbepWgYzBjMWIpG5ryCS80tZXwvgJl3KRoGMwYzlqKROa/gUnNLGd8LYOZdiobBjMGMpWhkziu41NxSxvcCmHmXomEwYzBjKRqZ8wouNbeU8b0r2GI9NAxmLEXDYMZSNG6dO9g7zvQF/AAZbLEeGgYzlqJhMGMpGrfOHewdZ/oCfoAMtlgPDYMZS9EwmLEUjVvnDvaOM30BP0AGW6yHhsGMpWgYzFiKxq1zB3vHmb6AHyCDLdZDw2DGUjQMZixF49a5g73jTF/AD5DBFuuhYTBjKRoGM5aicevcwd5xpi/gB7BPQCODLdZDw5wEthjMGMzMpqqM7x3QMCeBLdZDw5wEthjMGMzMpqqM7x3QMCeBLdZDw5wEthjMGMzMpqqM7x3QMCeBLdZDw5wEthjMGMzMpqqM7x3QMCeBLdZDw5wEthjMGMzMpqqM7x3QMCeBLdZDw5wEthjMGMzMpqqM7x3QuHVOmLmFvQYz7+DSLewtM753QOPWOWHmFvYazLyDS7ewt8z43gGNW+eEmVvYazDzDi7dwt4y43sHNG6dE2ZuYa/BzDu4dAt7y4zvHdC4dU6YuYW9BjPv4NIt7C0zvndA49Y5YeYW9hrMvINLt7C3zPheADO3sDdrZiZLJbA3a2bGYMZSNMqM7wUwcwt7s2ZmslQCe7NmZgxmLEWjzPheADO3sDdrZiZLJbA3a2bGYMZSNMqM7wUwcwt7s2ZmslQCe7NmZgxmLEWjzPheADO3sDdrZiZLJbA3a2bGYMZSNMqM7wUwcwt7s2ZmslQCe7NmZgxmLEWjzPTet8HPb/8AGhlsMZixFA1zTpjJUg+Z3vs2+PntH0Ajgy0GM5aiYc4JM1nqIdN73wY/v/0DaGSwxWDGUjTMOWEmSz1keu/b4Oe3fwCNDLYYzFiKhjknzGSph0zvfRv8/PYPoJHBFoMZS9Ew54SZLPWQ6b1vg5/f/gE0MthiMGMpGuacMJOlHjK+91F4TQZbrIfGO7hkMJOlqkxfwA8wC6/JYIv10HgHlwxmslSV6Qv4AWbhNRlssR4a7+CSwUyWqjJ9AT/ALLwmgy3WQ+MdXDKYyVJVpi/gB5iF12SwxXpovINLBjNZqsr0BfwAs/CaDLZYD413cMlgJktVmb6AH6D5Cbh0u8WWW9h728yWrIeZMuN7BzTewaXbLbbcwt7bZrZkPcyUGd87oPEOLt1useUW9t42syXrYabM+N4BjXdw6XaLLbew97aZLVkPM2XG9w5ovINLt1tsuYW9t81syXqYKTO+d0DjHVy63WLLLey9bWZL1sNMmfG9AxrmJLDFemiYc8LM30zRKDO+d0DDnAS2WA8Nc06Y+ZspGmXG9w5omJPAFuuhYc4JM38zRaPM+N4BDXMS2GI9NMw5YeZvpmiUGd87oGFOAlush4Y5J8z8zRSNMuN7BzTMSWCL9dAw54SZv5miUWZ874CGOQlssR4a5ryCSxlsyWDLFzB9Ez+JfRQaGWyxHhrmvIJLGWzJYMsXMH0TP4l9FBoZbLEeGua8gksZbMlgyxcwfRM/iX0UGhlssR4a5ryCSxlsyWDLFzB9Ez+JfRQaGWyxHhrmvIJLGWzJYMsXMH0TP4l9FBoZbLEeGua8gksZbMlgyxcwfRM/iX0UGhlssR4aGWz5vp4EtpQZ3zugYU4CW6yHRgZbvq8ngS1lxvcOaJiTwBbroZHBlu/rSWBLmfG9AxrmJLDFemhksOX7ehLYUmZ874CGOQlssR4aGWz5vp4EtpQZ3zugYU4CW6yHRgZbvq8ngS1lxvcOaLyDS7ZFw2Amgy0GM5ai8c6pMr53QOMdXLItGgYzGWwxmLEUjXdOlfG9Axrv4JJt0TCYyWCLwYylaLxzqozvHdB4B5dsi4bBTAZbDGYsReOdU2V874DGO7hkWzQMZjLYYjBjKRrvnCrjewc03sEl26JhMJPBFoMZS9F451QZ3/sovMbuoWHOCTPv4FIGW8aZvoAfYBZeY/fQMOeEmXdwKYMt40xfwA8wC6+xe2iYc8LMO7iUwZZxpi/gB5iF19g9NMw5YeYdXMpgyzjTF/ADzMJr7B4a5pww8w4uZbBlnOkL+AFm4TV2Dw1zTph5B5cy2DLO5y9Y/i/Zh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVTYh7VU2Ie1VNiHtVT4H95l1FLTauXpAAAAAElFTkSuQmCC"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                   | Descripción del objeto                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `order_id`<br/>_integer_                 | Identificador de la orden.                              |
| `store_id`<br/>_integer_                 | Identificador interno que Rappi asigna a la tienda.     |
| `product_confirmation_code`<br/>_string_ | Código de confirmación asociado a un pedido específico. |
| `qr_code`<br/>_string_                   | Código QR.                                              |

## POST stores/{storeId}/orders/{orderId}/bag-drink-confirmation

Usa este endpoint para confirmar el número de bolsas y si hay bebidas fuera de las bolsas de la orden.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/bag-drink-confirmation`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

`{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

Esta tabla describe los atributos que el `JSON` de el body de tu llamada requiere:

| Atributos                             | Requerido   | Descripción                                                                    |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `number_of_bags`<br>_integer_         | `requerido` | Número de bolsas que tiene la orden.                                           |
| `has_drinks_outside_bag`<br>_boolean_ | `requerido` | `true` si la orden tiene bebidas fuera de las bolsas, de lo contrario `false`. |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`412` La condición previa falló

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/bag-drink-confirmation`

> Este es un ejemplo de la llamada:

Este es un ejemplo de contenido del _body_ de la llamada:

```json
{
  "number_of_bags": 2,
  "has_drinks_outside_bag": true
}
```

```java
final Integer storeId = 392625;
final Integer orderId = 203654;

URL url = new URL(String.format("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders/%s/bag-drink-confirmation", storeId, orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n  \"number_of_bags\": 2,\n  \"has_drinks_outside_bag\": true\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/392625/orders/203654/bag-drink-confirmation",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "Bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

var postData = JSON.stringify({
  number_of_bags: 2,
  has_drinks_outside_bag: true,
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/bag-drink-confirmation"

payload = json.dumps({
  "number_of_bags": 2,
  "has_drinks_outside_bag": True
})
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/bag-drink-confirmation"
	method := "POST"

  payload := strings.NewReader(`{
		"number_of_bags": 2,
		"has_drinks_outside_bag": true
	}`)

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "order_id": 2150145441,
  "store_id": 900103110,
  "number_of_bags": 2,
  "has_drinks_outside_bag": true,
  "last_updated_by": "store"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                 | Descripción del objeto                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `order_id`<br/>_integer_               | Identificador interno que Rappi asigna a la tienda.                                                       |
| `store_id`<br/>_integer_               | Identificador interno que Rappi asigna a la tienda.                                                       |
| `number_of_bags`<br/>_integer_         | Número de bolsas.                                                                                         |
| `has_drinks_outside_bag`<br/>_boolean_ | `true` si la orden tiene bebidas fuera de las bolsas, de lo contrario `false`.                            |
| `last_updated_by`<br/>_string_         | Entidad que realizó la confirmación, puede ser "store" para la tienda o "storekeeper" para el repartidor. |

## POST orders/{orderId}/ready-for-pickup

Usa este endpoint para notificar al repartidor en la app de Rappi que su orden está lista para ser recogida.
Al realizar la primera solicitud, si no hay un repartidor asignado, el sistema acelerará el proceso de asignación; si ya hay un repartidor asignado, se le enviará una notificación y el estado de la orden cambiará a `READY_FOR_PICKUP`. En la segunda solicitud, si el repartidor ya está asignado, se enviará una nueva notificación al repartidor asignado.

### URL del Endpoint

Usa esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/ready-for-pickup`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank"> Mira la lista de dominios por país.</a>
- `{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

!!! important
Para evitar el uso indebido del endpoint, nos reservamos el derecho de revocar el acceso a aquellos clientes que lo utilicen de manera inapropiada. Es por ello que después de tres solicitudes, el sistema dejará de ejecutar acciones adicionales, por lo que cualquier intento posterior será considerado un uso incorrecto del endpoint.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Orden actualizada

</aside>

<aside class="error-response">

`400` Estado de transición inválido

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Orden no encontrada

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/restaurants/orders/v1/stores/9343463/orders/392625/ready-for-pickup`

> Este es un ejemplo de la llamada:

```java
final Integer orderId = 392625;
final Integer storeId = 9343463;

URL url = new URL(String.format("https://api.dev.rappi.com/restaurants/orders/v1/stores/%s/orders/%s/ready-for-pickup", storeId, orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/orders/v1/stores/9343463/orders/392625/ready-for-pickup",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "bearer YOUR_TOKEN",
  },
};

var req = https.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function (chunk) {
    var body = Buffer.concat(chunks);
    console.log(body.toString());
  });

  res.on("error", function (error) {
    console.error(error);
  });
});

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/restaurants/orders/v1/stores/9343463/orders/392625/ready-for-pickup"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.dev.rappi.com/restaurants/orders/v1/stores/9343463/orders/392625/ready-for-pickup"
	method := "POST"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("x-authorization", "bearer YOUR_TOKEN")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de Respuesta

Este endpoint regresa unicamente un código de respuesta.

## PUT stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject

Usa este endpoint para rechazar una orden.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/restaurants/orders/v1/stores/{storeId}/orders/{orderId}/cancel_type/{cancelType}/reject`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{storeId}`: Este es el identificador de la tienda.

`{orderId}`: Este es el identificador de la orden.

`{cancelType}`: Este es el identificador del tipo de cancelación.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                       |         |
| ------------------------------------- | ------- |
| Formato de respuesta                  | `JSON`  |
| Requerimientos del body para llamadas | `JSON`  |
| Requerimientos de autenticación       | `Token` |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`202` Orden rechazada exitosamente

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`400` Estado de transición inválido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/restaurants/orders/v1/stores/392625/orders/203654/cancel_type/STORE_CLOSED/reject`

```json
{
  "description": "ORDEN RECEPCIONADA FUERA DE HORARIO",
  "additional_info": {}
}
```

| Atributos                                | Requerido   | Descripción                                                                           |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `description`<br/>_string_               | `requerido` | Mensaje del error                                                                     |
| `additional_info`<br/>_array of objects_ | `requerido` | Información extra sobre la cancelación, su contenido depende del tipo de cancelación. |

### Ejemplo de Respuesta

Este endpoint únicamente regresa un código de estado para un resultado exitoso.
