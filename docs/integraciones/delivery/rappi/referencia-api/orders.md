
# Órdenes

Los recursos de órdenes te permiten interactuar con las opciones de órdenes de tus artículos y tiendas.

!!! important
Dada la expansión y mejoras, se han introducido nuevos endpoints o recursos que amplían las capacidades de órdenes para interactuar con distintas opciones de artículos y tiendas; debido a estos avances, ahora esta sección se divide en dos partes distintas, cada una con su propia lista de dominios por país. Es esencial destacar que la sección de órdenes actual sigue plenamente operativa y contiene los recursos tradicionales que han manejado las opciones de órdenes establecidas previamente.

<aside class="notice">
  <p>NOTA</p>
  <p>Para acceder a la nueva sección de órdenes con los últimos recursos y funcionalidades, te invitamos a hacer <a href="/es/api-reference/orders-rests-api/" target="_blank">clic aquí</a>.</p>
</aside>

Los recursos de órdenes te permiten interactuar con las órdenes de tus tiendas.

La siguiente tabla describe los diferentes contenidos del recurso órdenes:

| Recurso                                                                             | Descripción                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`GET orders`](#get-orders)                                                         | Regresa una lista de nuevas órdenes creadas.                 |
| [`GET orders/status/sent`](#get-orders-status-sent)                                 | Regresa una lista de nuevas órdenes creadas en estado `SENT` |
| [`PUT orders/{orderId}/take/{cookingTime}`](#put-orders-order-id-take-cooking-time) | Toma una orden para comenzar su preparación.                 |
| [`PUT orders/{orderId}/reject`](#put-orders-order-id-reject)                        | Rechaza una orden.                                           |
| [`POST orders/{orderId}/ready-for-pickup`](#post-orders-order-id-ready-for-pickup)  | Confirma que la orden está lista para ser recogida.          |
| [`GET orders/{orderId}/events`](#get-orders-order-id-events)                        | Regresa los últimos eventos de una orden.                    |

## GET orders

Usa este endpoint para obtener una lista con las nuevas órdenes para las tiendas del aliado autenticado.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint acepta los siguientes parámetros opcionales:

| Parámetro   | Descripción                                  |
| ----------- | -------------------------------------------- |
| `{storeId}` | Regresa únicamente las órdenes de una tienda |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`400` La tienda no pertenece al appClient del id especificado.

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Tienda no encontrada.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders"
	method := "GET"

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

> Este es un ejemplo de la respuesta:

```json
[
  {
    "order_detail": {
      "order_id": "392625",
      "delivery_operation_type": "regular",
      "cooking_time": 10,
      "min_cooking_time": 5,
      "max_cooking_time": 20,
      "created_at": "2019-04-10T11:12:57.000Z",
      "delivery_method": "delivery",
      "payment_method": "cc",
      "delivery_information": {
        "city": "Ciudad de México",
        "complete_address": "Nombre de la calle 5050. Barrio. 12345. Ciudad De México",
        "street_number": "5050",
        "neighborhood": "Barrio",
        "complement": "Portón verde",
        "postal_code": "12345",
        "street_name": "Nombre de la calle",
        "has_reverse_geocoding_result": true,
        "match_original_address": true,
        "match_geocoding_address": true
      },
      "billing_information": {
        "address": "148  Davis Court",
        "billing_type": "Bill",
        "document_number": "32432342",
        "document_type": "DNI",
        "email": "client@gmail.com",
        "name": "John Doe",
        "phone": "43333222"
      },
      "totals": {
        "total_products": 204000,
        "total_discounts": 173685,
        "total_order": 204180,
        "total_to_pay": 0,
        "discount_by_support": 0,
        "charges": {
          "shipping": 50,
          "service_fee": 100
        },
        "other_totals": {
          "tip": 30,
          "total_rappi_pay": 0,
          "total_rappi_credits": 0
        }
      },
      "items": [
        {
          "sku": "1234",
          "id": "2089918083",
          "name": "Chicken and Apple Salad",
          "type": "PRODUCT",
          "comments": "No vinegar",
          "price": 28900,
          "quantity": 3,
          "subitems": [
            {
              "sku": "11",
              "id": "10005260",
              "name": "Burrata Cheese",
              "type": "TOPPING",
              "price": 13500,
              "quantity": 1
            }
          ]
        },
        {
          "id": "2089918082",
          "name": "Seafood Salad",
          "comments": "",
          "price": 34900,
          "quantity": 2,
          "subitems": [
            {
              "id": "9928277",
              "name": "With white vinaigrette",
              "price": 0,
              "quantity": 1
            },
            {
              "id": "10005257",
              "name": "Ricotta Cheese",
              "price": 3500,
              "quantity": 1
            }
          ]
        }
      ],
      "delivery_discount": {
        "total_percentage_discount": 100,
        "total_value_discount": 50
      },
      "discounts": [
        {
          "value": 7600,
          "description": "Envío gratis",
          "title": "Envío gratis",
          "product_id": null,
          "sku": null,
          "type": "shipping",
          "raw_value": 100,
          "value_type": "percentage",
          "max_value": null,
          "includes_toppings": false,
          "percentage_by_rappi": 100,
          "percentage_by_partners": 0,
          "amount_by_rappi": 7600,
          "amount_by_partner": 0,
          "discount_product_units": 0,
          "discount_product_unit_value": null
        },
        {
          "value": 100,
          "description": "Disfruta de 20% de descuento en productos seleccionados.",
          "title": "Disfruta de 20% de descuento en productos seleccionados.",
          "product_id": 2089918082,
          "sku": 2089918082,
          "type": "offer_by_product",
          "raw_value": 20,
          "value_type": "percentage",
          "max_value": null,
          "includes_toppings": false,
          "percentage_by_rappi": 0,
          "percentage_by_partners": 100,
          "amount_by_rappi": 0,
          "amount_by_partner": 100,
          "discount_product_units": 1,
          "discount_product_unit_value": 100
        }
      ],
      "vendors": [
        {
          "id": 100200300,
          "type": "tuweb",
          "vendor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "flow_type": "ai-agent"
        }
      ]
    },
    "customer": {
      "first_name": "John",
      "last_name": "Doe",
      "phone_number": "3163535",
      "document_number": "34545678",
      "user_type": "USER_VIP"
    },
    "store": {
      "internal_id": "30000011",
      "external_id": "123445",
      "name": "Store 1"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Campo                                                             | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_detail`<br/>_array of objects_                             | Propiedades de los detalles de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.order_id`<br/>_string_                              | Identificador de la orden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `order_detail.delivery_operation_type`<br/>_string_               | Identificador para el tipo de orden: tipo turbo o tipo regular.                                                                                                                                                                                                                                                                                                                                                                                                |
| `order_detail.cooking_time`<br/>_integer_                         | Tiempo de preparación estimado para la orden.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.min_cooking_time`<br/>_integer_                     | Tiempo mínimo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.max_cooking_time`<br/>_integer_                     | Tiempo máximo de preparación en minutos para esta orden.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.created_at`<br/>_string_                            | Fecha en la que se creó la orden.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.place_at`<br/>_string_                              | Fecha y hora para la que el cliente programó la orden, en la hora local de la tienda (`yyyy-MM-dd HH:mm:ss`). Opcional — solo aparece en órdenes programadas; en las demás no está.                                                                                                                                                                                                                                                                                                                                                  |
| `order_detail.delivery_method`<br/>_string_, _enumerable_         | Método de entrega de la orden. Opciones disponibles: `delivery`,`marketplace`, `pickup`.                                                                                                                                                                                                                                                                                                                                                                       |
| `order_detail.payment_method`<br/>_string_, _enumerable_          | Metodo de pago de la orden. Opciones disponibles: `rappi_pay`, `cc`, `cash`, `paypal`, `edenred`, `webpay`, `masterpass`, `dc`, `pos_terminal`, `elo`, `sodexo`, `vale_r`, `ticket_r`, `alelo`, `visa_checkout`,`google_pay`, `apple_pay`, `rappicorp`, `PSE`, `PIX`, `unknown`. <b>(Es importante tener en cuenta que Rappi constantemente acepta nuevos métodos de pago, por lo tanto esta lista puede variar en el tiempo y no es necesario validarla.)</b> |
| `order_detail.delivery_information`<br/>_object_                  | Propiedades de la dirección de entrega.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `order_detail.delivery_information.city`<br/>_string_             | Ciudad de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complete_address`<br/>_string_ | Dirección de entrega con todos los campos                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `order_detail.delivery_information.street_number`<br/>_string_    | Numero de la calle                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_information.neighborhood`<br/>_string_     | Barrio de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_detail.delivery_information.complement`<br/>_string_       | Información adicional de la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                               |
| `order_detail.delivery_information.postal_code`<br/>_string_      | Código postal establecido para la dirección                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `order_detail.delivery_information.street_name`<br/>_string_      | Nombre de la calle establecido para la dirección de entrega                                                                                                                                                                                                                                                                                                                                                                                                    |

**Campos requeridos de `delivery_information` por país**

La siguiente tabla especifica qué campos son requeridos por país. Los campos marcados con `✓` son requeridos para ese país. Los campos marcados con `-` no son requeridos para ese país.

> `lat` y `lng` no están incluidos en esta tabla.
> `street_shorcut` (BR, PE) tiene un typo conocido — la 't' faltante de "shortcut" es intencional y se mantiene por estabilidad del API.
> `address` (CL, AR, Otros) está obsoleto; usar `complete_address` en su lugar.

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

| Campo                                                                    | Descripción                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `order_detail.billing_information`<br/>_array of objects_                | Propiedades de facturación del pago .                                                                                                                                                                                                                                                                                                |
| `order_detail.billing_information.address`<br/>_string_                  | Dirección de entrega de la orden.                                                                                                                                                                                                                                                                                                    |
| `order_detail.billing_information.billing_type`<br/>_string_             | Tipo de cobro de la orden.                                                                                                                                                                                                                                                                                                           |
| `order_detail.billing_information.document_number`<br/>_string_          | Número de documento del cliente.                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.document_type`<br/>_string_            | Tipo de documento del cliente.                                                                                                                                                                                                                                                                                                       |
| `order_detail.billing_information.email`<br/>_string_                    | Email establecido para recibir información de facturación.                                                                                                                                                                                                                                                                           |
| `order_detail.billing_information.name`<br/>_string_                     | Nombre establecido para la facturación.                                                                                                                                                                                                                                                                                              |
| `order_detail.billing_information.phone`<br/>_string_                    | Teléfono establecido para la facturación.                                                                                                                                                                                                                                                                                            |
| `order_detail.totals`<br/>_array of objects_                             | Propiedades del total de la orden.                                                                                                                                                                                                                                                                                                   |
| `order_detail.totals.total_products`<br/>_integer_                       | Total de los productos sin descuentos.                                                                                                                                                                                                                                                                                               |
| `order_detail.totals.total_discounts`<br/>_integer_                      | Total de productos sin descuento en la orden.                                                                                                                                                                                                                                                                                        |
| `order_detail.totals.total_order`<br/>_integer_                          | Cantidad total que el restaurante recibe.<br/>Cuando el metodo de entrega es `marketplace` este campo incluye propina y cargos de entrega.<br/>Para otros métodos de entrega, este campo contiene solo el valor total de todos los productos.<br/>En todos los casos, este campo incluye los descuentos asumidos por el restaurante. |
| `order_detail.totals.total_to_pay`<br/>_integer_                         | El total que el usuario paga al repartidor en efectivo. Aplica únicamente cuando el metodo de entrega es `marketplace` o `pickup`, y el método de pago es: `cash`.                                                                                                                                                                   |
| `order_detail.totals.discount_by_support`<br/>_integer_                  | Descuento aplicado al usuario por el equipo de soporte de Rappi.                                                                                                                                                                                                                                                                     |
| `order_detail.totals.charges`<br/>_array of objects_                     | Propiedades de cargos adicionales de la orden .                                                                                                                                                                                                                                                                                      |
| `order_detail.totals.charges.shipping`<br/>_integer_                     | Total de cargos de envío .                                                                                                                                                                                                                                                                                                           |
| `order_detail.totals.charges.service_fee`<br/>_integer_                  | Cargos del servicio de Rappi                                                                                                                                                                                                                                                                                                         |
| `order_detail.totals.other_totals`<br/>_array of objects_                | Otros cargos incluidos en esta orden.                                                                                                                                                                                                                                                                                                |
| `order_detail.totals.other_totals.tip`<br/>_integer_                     | Propina para el repartidor.                                                                                                                                                                                                                                                                                                          |
| `order_detail.totals.other_totals.total_rappi_pay`<br/>_integer_         | Total pagado usando Rappi Pay.                                                                                                                                                                                                                                                                                                       |
| `order_detail.totals.other_totals.total_rappi_credits`<br/>_integer_     | Total pagado usando Rappi Creditos .                                                                                                                                                                                                                                                                                                 |
| `order_detail.items`<br/>_array of objects_                              | Propiedades de los artículos que contiene la orden.                                                                                                                                                                                                                                                                                  |
| `order_detail.items.sku`<br/>_string_                                    | SKU del artículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                             |
| `order_detail.items.id`<br/>_string_                                     | Identificador del artículo en la orden.                                                                                                                                                                                                                                                                                              |
| `order_detail.items.name`<br/>_string_                                   | Nombre del artículo en la orden.                                                                                                                                                                                                                                                                                                     |
| `order_detail.items.type`<br/>_string_, _enumerable_                     | Tipo de artículo. Opciones disponibles: <br/>`product`, o `topping`.                                                                                                                                                                                                                                                                 |
| `order_detail.items.comments`<br/>_array_                                | Comentarios del usuario para un artículo en la orden.                                                                                                                                                                                                                                                                                |
| `order_detail.items.price`<br/>_integer_                                 | Precio unitario del artículo sin descuento.                                                                                                                                                                                                                                                                                          |
| `order_detail.items.quantity`<br/>_integer_                              | Cantidad especificada del artículo en la orden.                                                                                                                                                                                                                                                                                      |
| `order_detail.items.subitems`<br/>_array of objects_                     | Propiedades de los subartículos en la orden.                                                                                                                                                                                                                                                                                         |
| `order_detail.items.subitems.sku`<br/>_string_                           | SKU del subartículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                          |
| `order_detail.items.subitems.id`<br/>_string_                            | Identificador que Rappi asigna al artículo.                                                                                                                                                                                                                                                                                          |
| `order_detail.items.subitems.name`<br/>_string_                          | Nombre del subartículo en la orden.                                                                                                                                                                                                                                                                                                  |
| `order_detail.items.subitems.type`<br/>_string_, _enumerable_            | Tipo del subartículo en la orden. Opciones disponibles: `product`, o `topping`.                                                                                                                                                                                                                                                      |
| `order_detail.items.subitems.price`<br/>_integer_                        | Precio unitario del subartículo sin descuento                                                                                                                                                                                                                                                                                        |
| `order_detail.items.subitems.quantity`<br/>_integer_                     | Cantidad especificada del subartículo en la orden.                                                                                                                                                                                                                                                                                   |
| `order_detail.delivery_discount`<br/>_integer_                           | Propiedades de los descuentos en la entrega de la orden.                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount.total_percentage_discount`<br/>_integer_ | Porcentaje de descuento en la entrega de la orden.                                                                                                                                                                                                                                                                                   |
| `order_detail.delivery_discount.total_value_discount`<br/>_integer_      | Monto total del descuento en la entrega.                                                                                                                                                                                                                                                                                             |
| `order_detail.customer`<br/>_array of objects_                           | Propiedades del usuario de Rappi que crea la orden. Solo se envían cuando el método de entrega es `marketplace` o si se solicita a Rappi que envíe esta información                                                                                                                                                                  |
| `order_detail.customer.first_name`<br/>_string_                          | Nombre del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                       |
| `order_detail.customer.last_name`<br/>_string_                           | Apellido del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                     |
| `order_detail.customer.phone_number`<br/>_string_                        | Número de teléfono del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                           |
| `order_detail.customer.document_number`<br/>_string_                     | Número de documento del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                          |
| `order_detail.customer.user_type`<br/>_string_                           | Si el usuario es VIP se envía el valor `USER_VIP`. Para el resto de los usuarios este campo no se envía.                                                                                                                                                                                                                             |
| `order_detail.store`<br/>_array of objects_                              | Propiedades de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                       |
| `order_detail.store.internal_id`<br/>_string_                            | Identificador interno que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                  |
| `order_detail.store.external_id`<br/>_string_                            | Identificador de la integración que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                        |
| `order_detail.store.name`<br/>_string_                                   | Nombre de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                            |
| `order_detail.discounts.value`<br/>_integer_                             | Valor del descuento reflejado en divisa.                                                                                                                                                                                                                                                                                             |
| `order_detail.discounts.description`<br/>_string_                        | Mensaje descriptivo explicando el descuento.                                                                                                                                                                                                                                                                                         |
| `order_detail.discounts.title`<br/>_string_                              | Nombre del descuento.                                                                                                                                                                                                                                                                                                                |
| `order_detail.discounts.product_id`<br/>_integer_                        | ID del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.sku`<br/>_string_                                | SKU del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                    |
| `order_detail.discounts.type`<br/>_string_                               | Indica el tipo del descuento.                                                                                                                                                                                                                                                                                                        |
| `order_detail.discounts.raw_value`<br/>_integer_                         | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `type_value`.                                                                                                                                                                                                                           |
| `order_detail.discounts.value_type`<br/>_string_, _enumerable_           | El tipo de valor del descuento. Opciones disponibles: `value`, `percentage`.                                                                                                                                                                                                                                                         |
| `order_detail.discounts.max_value`<br/>_integer_                         | Máximo valor en divisa a descontar.                                                                                                                                                                                                                                                                                                  |
| `order_detail.discounts.includes_toppings`<br/>_boolean_                 | Indica si el descuento se resta del total de producto con toppings o no.                                                                                                                                                                                                                                                             |
| `order_detail.discounts.percentage_by_rappi`<br/>_integer_               | El porcentaje del descuento asumido por Rappi.                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.percentage_by_partners`<br/>_integer_            | El porcentaje del descuento asumido por el aliado.                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.amount_by_rappi`<br/>_integer_                   | Valor del descuento reflejado en divisa asumido por Rappi.                                                                                                                                                                                                                                                                           |
| `order_detail.discounts.amount_by_partner`<br/>_integer_                 | Valor del descuento reflejado en divisa asumido por el aliado.                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.discount_product_units`<br/>_integer_            | Cantidad de productos a las que aplicó el descuento.                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.discount_product_unit_value`<br/>_integer_       | Valor del descuento por unidad de producto.                                                                                                                                                                                                                                                                                          |
| `order_detail.vendors`<br/>_array of objects_                            | Vendors asociados a la orden. Array vacío (`[]`) si la orden no tiene vendor.                                                                                                                                                                                                                                                        |
| `order_detail.vendors.id`<br/>_integer_                                  | Identificador interno del vendor.                                                                                                                                                                                                                                                                                                    |
| `order_detail.vendors.type`<br/>_string_, _enumerable_                   | Tipo de vendor. Opciones disponibles: `tuweb` (orden originada desde WhatsApp).                                                                                                                                                                                                                                                      |
| `order_detail.vendors.vendor_id`<br/>_string_                            | Identificador externo del vendor.                                                                                                                                                                                                                                                                                                    |
| `order_detail.vendors.flow_type`<br/>_string_                            | Tipo de flujo asociado al vendor.                                                                                                                                                                                                                                                                                                    |

## GET orders status sent

Usa este endpoint para obtener una lista con las nuevas órdenes en estado SENT para las tiendas del aliado autenticado.

### URL del Endpoint

Usa esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/status/sent`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tienes las siguiente propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint acepta los siguientes parametros opcionales:

| Parámetro   | Descripción                                                   |
| ----------- | ------------------------------------------------------------- |
| `{storeId}` | Regresa únicamente las órdenes en estado `SENT` de una tienda |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`400` La tienda no pertenece al appClient del id especificado.

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Tienda no encontrada.

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/status/sent`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/status/sent");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders/status/sent",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/status/sent"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/status/sent"
	method := "GET"

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

> Este es un ejemplo de la respuesta:

```json
[
  {
    "order_detail": {
      "order_id": "392625",
      "delivery_operation_type": "turbo",
      "cooking_time": 10,
      "min_cooking_time": 5,
      "max_cooking_time": 20,
      "created_at": "2019-04-10T11:12:57.000Z",
      "delivery_method": "delivery",
      "payment_method": "cc",
      "delivery_information": {
        "city": "Ciudad de México",
        "complete_address": "Nombre de la calle 5050. Barrio. 12345. Ciudad De México",
        "street_number": "5050",
        "neighborhood": "Barrio",
        "complement": "Portón verde",
        "postal_code": "12345",
        "street_name": "Nombre de la calle"
      },
      "billing_information": {
        "address": "148  Davis Court",
        "billing_type": "Bill",
        "document_number": "32432342",
        "document_type": "DNI",
        "email": "client@gmail.com",
        "name": "John Doe",
        "phone": "43333222"
      },
      "totals": {
        "total_products": 204000,
        "total_discounts": 173685,
        "total_order": 204180,
        "total_to_pay": 0,
        "discount_by_support": 0,
        "charges": {
          "shipping": 50,
          "service_fee": 100
        },
        "other_totals": {
          "tip": 30,
          "total_rappi_pay": 0,
          "total_rappi_credits": 0
        }
      },
      "items": [
        {
          "sku": "1234",
          "id": "2089918083",
          "name": "Chicken and Apple Salad",
          "type": "PRODUCT",
          "comments": "No vinegar",
          "price": 28900,
          "quantity": 3,
          "subitems": [
            {
              "sku": "11",
              "id": "10005260",
              "name": "Burrata Cheese",
              "type": "TOPPING",
              "price": 13500,
              "quantity": 1
            }
          ]
        },
        {
          "id": "2089918082",
          "name": "Seafood Salad",
          "comments": "",
          "price": 34900,
          "quantity": 2,
          "subitems": [
            {
              "id": "9928277",
              "name": "With white vinaigrette",
              "price": 0,
              "quantity": 1
            },
            {
              "id": "10005257",
              "name": "Ricotta Cheese",
              "price": 3500,
              "quantity": 1
            }
          ]
        }
      ],
      "delivery_discount": {
        "total_percentage_discount": 100,
        "total_value_discount": 50
      },
      "discounts": [
        {
          "value": 7600,
          "description": "Envío gratis",
          "title": "Envío gratis",
          "product_id": null,
          "sku": null,
          "type": "shipping",
          "raw_value": 100,
          "value_type": "percentage",
          "max_value": null,
          "includes_toppings": false,
          "percentage_by_rappi": 100,
          "percentage_by_partners": 0,
          "amount_by_rappi": 7600,
          "amount_by_partner": 0,
          "discount_product_units": 0,
          "discount_product_unit_value": null
        },
        {
          "value": 100,
          "description": "Disfruta de 20% de descuento en productos seleccionados.",
          "title": "Disfruta de 20% de descuento en productos seleccionados.",
          "product_id": 2089918082,
          "sku": 2089918082,
          "type": "offer_by_product",
          "raw_value": 20,
          "value_type": "percentage",
          "max_value": null,
          "includes_toppings": false,
          "percentage_by_rappi": 0,
          "percentage_by_partners": 100,
          "amount_by_rappi": 0,
          "amount_by_partner": 100,
          "discount_product_units": 1,
          "discount_product_unit_value": 100
        }
      ],
      "vendors": [
        {
          "id": 100200300,
          "type": "tuweb",
          "vendor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "flow_type": "ai-agent"
        }
      ]
    },
    "customer": {
      "first_name": "John",
      "last_name": "Doe",
      "phone_number": "3163535",
      "document_number": "34545678",
      "user_type": "USER_VIP"
    },
    "store": {
      "internal_id": "30000011",
      "external_id": "123445",
      "name": "Store 1"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Campo                                                             | Descripción                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_detail`<br/>_array of objects_                             | Propiedades de los detalles de la orden.                                                                                                                                                                                                                                         |
| `order_detail.order_id`<br/>_string_                              | Identificador de la orden.                                                                                                                                                                                                                                                       |
| `order_detail.delivery_operation_type`<br/>_string_               | Identificador para el tipo de orden: tipo turbo o tipo regular.                                                                                                                                                                                                                  |
| `order_detail.cooking_time`<br/>_integer_                         | Tiempo de preparación estimado para la orden.                                                                                                                                                                                                                                    |
| `order_detail.min_cooking_time`<br/>_integer_                     | Tiempo mínimo de preparación en minutos para esta orden.                                                                                                                                                                                                                         |
| `order_detail.max_cooking_time`<br/>_integer_                     | Tiempo máximo de preparación en minutos para esta orden.                                                                                                                                                                                                                         |
| `order_detail.created_at`<br/>_string_                            | Fecha en la que se creó la orden.                                                                                                                                                                                                                                                |
| `order_detail.place_at`<br/>_string_                              | Fecha y hora para la que el cliente programó la orden, en la hora local de la tienda (`yyyy-MM-dd HH:mm:ss`). Opcional — solo aparece en órdenes programadas; en las demás no está.                                                                                                                                                                    |
| `order_detail.delivery_method`<br/>_string_, _enumerable_         | Método de entrega de la orden. Opciones disponibles: `delivery`,`marketplace`, `pickup`.                                                                                                                                                                                         |
| `order_detail.payment_method`<br/>_string_, _enumerable_          | Metodo de pago de la orden. Opciones disponibles: `rappi_pay`, `cc`, `cash`, `paypal`, `edenred`, `webpay`, `masterpass`, `dc`, `pos_terminal`, `elo`, `sodexo`, `vale_r`, `ticket_r`, `alelo`, `visa_checkout`,`google_pay`, `apple_pay`, `rappicorp`, `PSE`, `PIX`, `unknown`. |
| `order_detail.delivery_information`<br/>_object_                  | Propiedades de la dirección de entrega.                                                                                                                                                                                                                                          |
| `order_detail.delivery_information.city`<br/>_string_             | Ciudad de la dirección de entrega                                                                                                                                                                                                                                                |
| `order_detail.delivery_information.complete_address`<br/>_string_ | Dirección de entrega con todos los campos                                                                                                                                                                                                                                        |
| `order_detail.delivery_information.has_reverse_geocoding_result`<br/>_boolean_ | Indica si la dirección de entrega tiene resultado de geocodificación inversa.                                                                                                                                                                                             |
| `order_detail.delivery_information.match_original_address`<br/>_boolean_ | Indica si la dirección geocodificada coincide con la dirección original ingresada.                                                                                                                                                                                         |
| `order_detail.delivery_information.match_geocoding_address`<br/>_boolean_ | Indica si la dirección de entrega coincide con la dirección obtenida por geocodificación.                                                                                                                                                                                  |
| `order_detail.delivery_information.street_number`<br/>_string_    | Numero de la calle                                                                                                                                                                                                                                                               |
| `order_detail.delivery_information.neighborhood`<br/>_string_     | Barrio de la dirección de entrega                                                                                                                                                                                                                                                |
| `order_detail.delivery_information.complement`<br/>_string_       | Información adicional de la dirección de entrega                                                                                                                                                                                                                                 |
| `order_detail.delivery_information.postal_code`<br/>_string_      | Código postal establecido para la dirección                                                                                                                                                                                                                                      |
| `order_detail.delivery_information.street_name`<br/>_string_      | Nombre de la calle establecido para la dirección de entrega                                                                                                                                                                                                                      |

**Campos requeridos de `delivery_information` por país**

La siguiente tabla especifica qué campos son requeridos por país. Los campos marcados con `✓` son requeridos para ese país. Los campos marcados con `-` no son requeridos para ese país.

> `lat` y `lng` no están incluidos en esta tabla.
> `street_shorcut` (BR, PE) tiene un typo conocido — la 't' faltante de "shortcut" es intencional y se mantiene por estabilidad del API.
> `address` (CL, AR, Otros) está obsoleto; usar `complete_address` en su lugar.

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

| Campo                                                                    | Descripción                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `order_detail.billing_information`<br/>_array of objects_                | Propiedades de facturación del pago .                                                                                                                                                                                                                                                                                                |
| `order_detail.billing_information.address`<br/>_string_                  | Dirección de entrega de la orden.                                                                                                                                                                                                                                                                                                    |
| `order_detail.billing_information.billing_type`<br/>_string_             | Tipo de cobro de la orden.                                                                                                                                                                                                                                                                                                           |
| `order_detail.billing_information.document_number`<br/>_string_          | Número de documento del cliente.                                                                                                                                                                                                                                                                                                     |
| `order_detail.billing_information.document_type`<br/>_string_            | Tipo de documento del cliente.                                                                                                                                                                                                                                                                                                       |
| `order_detail.billing_information.email`<br/>_string_                    | Email establecido para recibir información de facturación.                                                                                                                                                                                                                                                                           |
| `order_detail.billing_information.name`<br/>_string_                     | Nombre establecido para la facturación.                                                                                                                                                                                                                                                                                              |
| `order_detail.billing_information.phone`<br/>_string_                    | Teléfono establecido para la facturación.                                                                                                                                                                                                                                                                                            |
| `order_detail.totals`<br/>_array of objects_                             | Propiedades del total de la orden.                                                                                                                                                                                                                                                                                                   |
| `order_detail.totals.total_products`<br/>_integer_                       | Total de los productos sin descuentos.                                                                                                                                                                                                                                                                                               |
| `order_detail.totals.total_discounts`<br/>_integer_                      | Total de productos sin descuento en la orden.                                                                                                                                                                                                                                                                                        |
| `order_detail.totals.total_order`<br/>_integer_                          | Cantidad total que el restaurante recibe.<br/>Cuando el metodo de entrega es `marketplace` este campo incluye propina y cargos de entrega.<br/>Para otros métodos de entrega, este campo contiene solo el valor total de todos los productos.<br/>En todos los casos, este campo incluye los descuentos asumidos por el restaurante. |
| `order_detail.totals.total_to_pay`<br/>_integer_                         | El total que el usuario paga al repartidor en efectivo. Aplica únicamente cuando el metodo de entrega es `marketplace` o `pickup`, y el método de pago es: `cash`.                                                                                                                                                                   |
| `order_detail.totals.discount_by_support`<br/>_integer_                  | Descuento aplicado al usuario por el equipo de soporte de Rappi.                                                                                                                                                                                                                                                                     |
| `order_detail.totals.charges`<br/>_array of objects_                     | Propiedades de cargos adicionales de la orden .                                                                                                                                                                                                                                                                                      |
| `order_detail.totals.charges.shipping`<br/>_integer_                     | Total de cargos de envío .                                                                                                                                                                                                                                                                                                           |
| `order_detail.totals.charges.service_fee`<br/>_integer_                  | Cargos del servicio de Rappi                                                                                                                                                                                                                                                                                                         |
| `order_detail.totals.other_totals`<br/>_array of objects_                | Otros cargos incluidos en esta orden.                                                                                                                                                                                                                                                                                                |
| `order_detail.totals.other_totals.tip`<br/>_integer_                     | Propina para el repartidor.                                                                                                                                                                                                                                                                                                          |
| `order_detail.totals.other_totals.total_rappi_pay`<br/>_integer_         | Total pagado usando Rappi Pay.                                                                                                                                                                                                                                                                                                       |
| `order_detail.totals.othet_totals.total_rappi_credits`<br/>_integer_     | Total pagado usando Rappi Creditos .                                                                                                                                                                                                                                                                                                 |
| `order_detail.items`<br/>_array of objects_                              | Propiedades de los artículos que contiene la orden.                                                                                                                                                                                                                                                                                  |
| `order_detail.items.sku`<br/>_string_                                    | SKU del artículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                             |
| `order_detail.items.id`<br/>_string_                                     | Identificador del artículo en la orden.                                                                                                                                                                                                                                                                                              |
| `order_detail.items.name`<br/>_string_                                   | Nombre del artículo en la orden.                                                                                                                                                                                                                                                                                                     |
| `order_detail.items.type`<br/>_string_, _enumerable_                     | Tipo de artículo. Opciones disponibles: <br/>`product`, o `topping`.                                                                                                                                                                                                                                                                 |
| `order_detail.items.comments`<br/>_array_                                | Comentarios del usuario para un artículo en la orden.                                                                                                                                                                                                                                                                                |
| `order_detail.items.price`<br/>_integer_                                 | Precio unitario del artículo sin descuento.                                                                                                                                                                                                                                                                                          |
| `order_detail.items.quantity`<br/>_integer_                              | Cantidad especificada del artículo en la orden.                                                                                                                                                                                                                                                                                      |
| `order_detail.items.subitems`<br/>_array of objects_                     | Propiedades de los subartículos en la orden.                                                                                                                                                                                                                                                                                         |
| `order_detail.items.subitems.sku`<br/>_string_                           | SKU del subartículo en el menú. El aliado asigna su propio SKU al artículo.                                                                                                                                                                                                                                                          |
| `order_detail.items.subitems.id`<br/>_string_                            | Identificador que Rappi asigna al artículo.                                                                                                                                                                                                                                                                                          |
| `order_detail.items.subitems.name`<br/>_string_                          | Nombre del subartículo en la orden.                                                                                                                                                                                                                                                                                                  |
| `order_detail.items.subitems.type`<br/>_string_, _enumerable_            | Tipo del subartículo en la orden. Opciones disponibles: `product`, o `topping`.                                                                                                                                                                                                                                                      |
| `order_detail.items.subitems.price`<br/>_integer_                        | Precio unitario del subartículo sin descuento                                                                                                                                                                                                                                                                                        |
| `order_detail.items.subitems.quantity`<br/>_integer_                     | Cantidad especificada del subartículo en la orden.                                                                                                                                                                                                                                                                                   |
| `order_detail.delivery_discount`<br/>_integer_                           | Propiedades de los descuentos en la entrega de la orden.                                                                                                                                                                                                                                                                             |
| `order_detail.delivery_discount.total_percentage_discount`<br/>_integer_ | Porcentaje de descuento en la entrega de la orden.                                                                                                                                                                                                                                                                                   |
| `order_detail.delivery_discount.total_value_discount`<br/>_integer_      | Monto total del descuento en la entrega.                                                                                                                                                                                                                                                                                             |
| `order_detail.customer`<br/>_array of objects_                           | Propiedades del usuario de Rappi que crea la orden. Solo se envían cuando el método de entrega es `marketplace` o si se solicita a Rappi que envíe esta información                                                                                                                                                                  |
| `order_detail.customer.first_name`<br/>_string_                          | Nombre del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                       |
| `order_detail.customer.last_name`<br/>_string_                           | Apellido del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                                     |
| `order_detail.customer.phone_number`<br/>_string_                        | Número de teléfono del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                           |
| `order_detail.customer.document_number`<br/>_string_                     | Número de documento del usuario de Rappi que crea la orden.                                                                                                                                                                                                                                                                          |
| `order_detail.customer.user_type`<br/>_string_                           | Si el usuario es VIP se envía el valor `USER_VIP`. Para el resto de los usuarios este campo no se envía.                                                                                                                                                                                                                             |
| `order_detail.store`<br/>_array of objects_                              | Propiedades de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                       |
| `order_detail.store.internal_id`<br/>_string_                            | Identificador interno que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                                  |
| `order_detail.store.external_id`<br/>_string_                            | Identificador de la integración que Rappi asigna a la tienda.                                                                                                                                                                                                                                                                        |
| `order_detail.store.name`<br/>_string_                                   | Nombre de la tienda que prepara la orden.                                                                                                                                                                                                                                                                                            |
| `order_detail.discounts.value`<br/>_integer_                             | Valor del descuento reflejado en divisa.                                                                                                                                                                                                                                                                                             |
| `order_detail.discounts.description`<br/>_string_                        | Mensaje descriptivo explicando el descuento.                                                                                                                                                                                                                                                                                         |
| `order_detail.discounts.title`<br/>_string_                              | Nombre del descuento.                                                                                                                                                                                                                                                                                                                |
| `order_detail.discounts.product_id`<br/>_integer_                        | ID del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                     |
| `order_detail.discounts.sku`<br/>_string_                                | SKU del producto si el descuento aplica producto.                                                                                                                                                                                                                                                                                    |
| `order_detail.discounts.type`<br/>_string_                               | Indica el tipo del descuento.                                                                                                                                                                                                                                                                                                        |
| `order_detail.discounts.raw_value`<br/>_integer_                         | El valor del descuento, puede representar un porcentaje o un valor en divisa dependiendo del `type_value`.                                                                                                                                                                                                                           |
| `order_detail.discounts.value_type`<br/>_string_, _enumerable_           | El tipo de valor del descuento. Opciones disponibles: `value`, `percentage`.                                                                                                                                                                                                                                                         |
| `order_detail.discounts.max_value`<br/>_integer_                         | Máximo valor en divisa a descontar.                                                                                                                                                                                                                                                                                                  |
| `order_detail.discounts.includes_toppings`<br/>_boolean_                 | Indica si el descuento se resta del total de producto con toppings o no.                                                                                                                                                                                                                                                             |
| `order_detail.discounts.percentage_by_rappi`<br/>_integer_               | El porcentaje del descuento asumido por Rappi.                                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.percentage_by_partners`<br/>_integer_            | El porcentaje del descuento asumido por el aliado.                                                                                                                                                                                                                                                                                   |
| `order_detail.discounts.amount_by_rappi`<br/>_integer_                   | Valor del descuento reflejado en divisa asumido por Rappi.                                                                                                                                                                                                                                                                           |
| `order_detail.discounts.amount_by_partner`<br/>_integer_                 | Valor del descuento reflejado en divisa asumido por el aliado.                                                                                                                                                                                                                                                                       |
| `order_detail.discounts.discount_product_units`<br/>_integer_            | Cantidad de productos a las que aplicó el descuento.                                                                                                                                                                                                                                                                                 |
| `order_detail.discounts.discount_product_unit_value`<br/>_integer_       | Valor del descuento por unidad de producto.                                                                                                                                                                                                                                                                                          |
| `order_detail.vendors`<br/>_array of objects_                            | Vendors asociados a la orden. Array vacío (`[]`) si la orden no tiene vendor.                                                                                                                                                                                                                                                        |
| `order_detail.vendors.id`<br/>_integer_                                  | Identificador interno del vendor.                                                                                                                                                                                                                                                                                                    |
| `order_detail.vendors.type`<br/>_string_, _enumerable_                   | Tipo de vendor. Opciones disponibles: `tuweb` (orden originada desde WhatsApp).                                                                                                                                                                                                                                                      |
| `order_detail.vendors.vendor_id`<br/>_string_                            | Identificador externo del vendor.                                                                                                                                                                                                                                                                                                    |
| `order_detail.vendors.flow_type`<br/>_string_                            | Tipo de flujo asociado al vendor.                                                                                                                                                                                                                                                                                                    |

## PUT orders/{orderId}/take/{cookingTime}

Usa este endpoint para tomar una orden para que la tienda comience a pepararla.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/take/{cookingTime}`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país.</a>
- `{orderId}`: Este es el identificador de la orden.
- `{cookingTime}`: Este es el nuevo tiempo de preparación de la orden. Puedes dejar este campo vacío para mantener el tiempo de preparación por defecto.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

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

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/take/20`

> Este es un ejemplo de la llamada:

```java
final Integer orderId = 392625;
final Integer cookingTime = 20;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/%s/take/%s", orderId, cookingTime));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");
connection.setDoOutput(true);

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders/392625/take/20",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/take/20"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/take/20"
	method := "PUT"

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

Este endpoint únicamente regresa un código de estado.

## PUT orders/{orderId}/reject

Usa este endpoint para rechazar una orden.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Solo puedes usar este endpoint para rechazar órdenes que tienen estado SENT.</p>
</aside>

### URL del Endpoint

Utiliza esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/reject`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank"> Mira la lista de dominios por país.</a>
- `{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ para llamadas | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

| Nombre                                       | Requerido   | Descripción                                                                                                                                                            |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderId`<br/>_string_                       | `requerido` | Rechaza una orden en especifico.                                                                                                                                       |
| `items_ids`<br/>_array of string_            | `opcional`  | Lista de los ids de los items con error. Aca se envia el rappi id                                                                                                      |
| `items_skus`<br/>_array of string_           | `opcional`  | Lista de skus de los items con error. Aca se envia el sku                                                                                                              |
| `cancel_type`<br/>_string_ <br/>_enumerable_ | `requerido` | Enum: `"ITEM_WRONG_PRICE"`, `"ITEM_NOT_FOUND"`, `"ITEM_OUT_OF_STOCK"`, `"ORDER_MISSING_INFORMATION"`, `"ORDER_MISSING_ADDRESS_INFORMATION"`, `"ORDER_TOTAL_INCORRECT"` |

<aside class="success">
   <p>IMPORTANTE</p>
   Si el valor de cancel_type es uno de los siguientes: ITEM_WRONG_PRICE, ITEM_NOT_FOUND, ITEM_OUT_OF_STOCK. Se deberá enviar la lista de items con error.
</aside>

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Orden rechazada

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

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/reject`

> Este es un ejemplo de la llamada:

```json
{
  "reason": "The order has invalid items"
}
```

> Este es un ejemplo de la llamada con items con error:

```json
{
  "reason": "The order has invalid items",
  "cancel_type": "ITEM_NOT_FOUND",
  "items_skus": ["sku1", "sku2"]
}
```

```java
final Integer orderId = 3320025;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/%s/reject", orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\"reason\":\"The order has invalid items\"}";

try (OutputStream os = connection.getOutputStream()) {
  byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
  os.write(input, 0, input.length);
}

System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");

var options = {
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders/392625/reject",
  headers: {
    "Content-Type": "application/json",
    "x-authorization": "bearer YOUR_TOKEN",
  },
  maxRedirects: 20,
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

var postData = JSON.stringify({ reason: "The order has invalid items" });

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/reject"

payload = "{\"reason\":\"The order has invalid items\"}"
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
}

response = requests.request("PUT", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/reject"
	method := "PUT"

	payload := strings.NewReader("{\"reason\":\"The order has invalid items\"}")

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos             | Requerido   | Descripción                          |
| --------------------- | ----------- | ------------------------------------ |
| `reason`<br/>_string_ | `requerido` | Razón por la que la orden se rechazó |

### Ejemplo de Llamada

Este endpoint regresa solo un código de respuesta.

## POST orders/{orderId}/ready-for-pickup

Usa este endpoint para notificar al repartidor en la app de Rappi que su orden está lista para ser recogida.
Al realizar la primera solicitud, si no hay un repartidor asignado, el sistema acelerará el proceso de asignación; si ya hay un repartidor asignado, se le enviará una notificación y el estado de la orden cambiará a `READY_FOR_PICKUP`. En la segunda solicitud, si el repartidor ya está asignado, se enviará una nueva notificación al repartidor asignado.

### URL del Endpoint

Usa esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/ready-for-pickup`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank"> Mira la lista de dominios por país.</a>
- `{orderId}`: Este es el identificador de la orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
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

`POST https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/ready-for-pickup`

> Este es un ejemplo de la llamada:

```java
final Integer orderId = 392625;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/%s/ready-for-pickup", orderId));

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders/392625/ready-for-pickup",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/ready-for-pickup"

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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/ready-for-pickup"
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

## GET orders/{orderId}/events

Usa este endpoint para para obtener las últimas actualizaciones de una orden.

### URL del Endpoint

Utiliza esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/orders/{orderId}/events`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank"> Mira la lista de dominios por país.</a>
- `{orderId}`: Este es el identificador de tu orden.

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/events`

> Este es un ejemplo de la llamada:

```java
final Integer orderId = 392625;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/%s/events", orderId));

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "bearer YOUR_TOKEN");

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/orders/392625/events",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/events"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'bearer YOUR_TOKEN'
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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/orders/392625/events"
	method := "GET"

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

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Orden no encontrada

</aside>

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "event": "canceled_with_charge",
    "event_time": "2020-05-28T12:31:12.501Z",
    "additional_information": {}
  },
  {
    "event": "taken_visible_order",
    "event_time": "2020-05-28T12:30:12.501Z",
    "additional_information": {
      "eta_to_store": "15"
    }
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo: Tiempo estimado de llegada del repartidor a la tienda

| Campo                                              | Descripción                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `event`<br/>_string_                               | Último evento de la orden.                                                         |
| `event_time`<br/>_string_                          | Hora del evento. Formato: _yyyy-MM-dd_'T'_HH:mm:ss.SSS_'Z'.                        |
| `additional_information`<br/>_array of objects_    | Información adicional de la orden. El formato puede variar dependiendo del evento. |
| `additional_information.eta_to_store`<br/>_string_ | Tiempo estimado de llegada del repartidor a la tienda.                             |
