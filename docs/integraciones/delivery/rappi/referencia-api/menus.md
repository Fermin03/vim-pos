
# Menús

Los recursos de Menús te permiten interactuar con los menús de tus tiendas.

| Recurso API                                                 | Descripción                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [`GET menu`](#get-menu)                                     | Devuelve la lista de menús creados por el aliado autenticado |
| [`POST menu`](#post-menu)                                   | Crea o actualiza un menú de una tienda                       |
| [`GET menu/approved/{storeId}`](#get-menu-approved-storeid) | Devuelve el estado actual de aprobación de un menú           |
| [`GET menu/rappi/{storeId}`](#get-menu-rappi-storeid)       | Devuelve el último menú creado para una tienda               |

## GET menu

Utiliza este endpoint para obtener la colección de menús creados por el aliado autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

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

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu");

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

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu"

payload = {}
headers = {
  'Content-Type': 'application/json',
  'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("GET", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```javascript
var https = require("https");

var options = {
  method: "GET",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/menu",
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

```go
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu"
	method := "GET"

	client := &http.Client {}
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

### Ejemplo de Respuesta "200 Llamada exitosa":

> Este es un ejemplo de la respuesta:

```json
[
  {
    "storeId": "900111978",
    "items": [
      {
        "name": "Naked Cake con frutos",
        "description": "Naked cake decorado con frutos. Cubierta de trufa derretida (ganache) y decorada con frutos del bosque.",
        "sku": "8569874",
        "type": "PRODUCT",
        "price": 75.0,
        "category": {
          "id": "3",
          "name": "Tortas",
          "minQty": 0,
          "maxQty": 0,
          "sortingPosition": 0
        },
        "imageUrl": "https://image.com/image1.jpg",
        "children": [
          {
            "name": "Chocolate",
            "description": "",
            "sku": "8569874-159",
            "type": "TOPPING",
            "price": 0.0,
            "category": {
              "id": "1",
              "name": "Sabor",
              "minQty": 0,
              "maxQty": 1,
              "sortingPosition": 0
            },
            "imageUrl": "https://image.com/image10.jpg",
            "children": [],
            "rappiIds": ["340948822"],
            "sortingPosition": 1,
            "maxLimit": 1
          }
        ],
        "rappiIds": ["2135527868"],
        "sortingPosition": 0,
        "maxLimit": 1
      },
      {
        "name": "Snowman",
        "description": "Linda lata de Snowman con productos variadosIncluye:Galletas mantequilla 350 gr, 6 brookies y 4 trufas de brownie.",
        "sku": "856887",
        "type": "PRODUCT",
        "price": 75.0,
        "category": {
          "id": "9",
          "name": "Navidad",
          "minQty": 0,
          "maxQty": 0,
          "sortingPosition": 0
        },
        "imageUrl": "https://image.com/image2.jpg",
        "children": [],
        "rappiIds": ["2135524472"],
        "sortingPosition": 0,
        "maxLimit": 1
      }
    ]
  }
]
```

Esta tabla describe los objectos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                                  | Descripción del objeto                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `storeId`<br/>_string_                                  | Identificador de la tienda en la aplicación de Rappi.                                                                        |
| `items`<br/>_array of objects_                          | Lista de productos dentro del menú de la tienda.                                                                             |
| `items.name`<br/>_string_                               | Nombre del producto en el menú.                                                                                              |
| `items.description`<br/>_string_                        | Descripción del producto en el menú.                                                                                         |
| `items.sku`<br/>_string_                                | SKU que el aliado asigna al producto en el menú.                                                                             |
| `items.type`<br/>_string_                               | Tipo de producto en el menú, en este caso solamente puede ser `PRODUCT`                                                      |
| `items.price`<br/>_integer_                             | Precio del producto en el menú.                                                                                              |
| `items.imageUrl`<br/>_string_                           | Url de la imagen del producto en el menú                                                                                     |
| `items.rappiIds`<br/>_array of string_                  | Lista de los identificadores que Rappi le da al producto                                                                     |
| `items.sortingPosition`<br/>_integer_                   | La posición del producto en su categoría en el menú                                                                          |
| `items.maxLimit`<br/>_integer_                          | Indicador máximo, es requerido solo si el tipo es topping                                                                    |
| `items.category`<br/>_string_                           | Categoría a la cual pertenece el producto en el menú                                                                         |
| `items.category.id`<br/>_string_                        | Id de la categoría                                                                                                           |
| `items.category.name`<br/>_string_                      | Nombre de la categoría                                                                                                       |
| `items.category.minQty`<br/>_integer_                   | La cantidad maxima de elementos que se pueden pedir en esta categoría                                                        |
| `items.category.maxQty`<br/>_integer_                   | La cantidad minima de elementos que se pueden pedir en esta categoría (En toppings, si es 0 significa que no es obligatorio) |
| `items.category.sortingPosition`<br/>_integer_          | Es la posición de la categoría en el menu                                                                                    |
| `items.children`<br/>_array of objects_                 | Lista de toppings del producto                                                                                               |
| `items.children.name`<br/>_string_                      | Nombre del topping en el menú.                                                                                               |
| `items.children.description`<br/>_string_               | Descripción del toppin en el menú.                                                                                           |
| `items.children.sku`<br/>_string_                       | SKU que el aliado asigna al topping en el menú.                                                                              |
| `items.children.type`<br/>_string_                      | Tipo de topping en el menú, en este caso solamente puede ser `TOPPING`                                                       |
| `items.children.price`<br/>_integer_                    | Precio del topping en el menú.                                                                                               |
| `items.children.imageUrl`<br/>_string_                  | Url de la imagen del topping en el menú                                                                                      |
| `items.children.rappiIds`<br/>_array of string_         | Lista de los identificadores que Rappi le da al topping                                                                      |
| `items.children.sortingPosition`<br/>_integer_          | La posición del topping en su categoría en el menú                                                                           |
| `items.children.maxLimit`<br/>_integer_                 | Indicador máximo, es requerido solo si el tipo es topping                                                                    |
| `items.children.category`<br/>_string_                  | Categoría a la cual pertenece el topping en el menú                                                                          |
| `items.children.category.id`<br/>_string_               | Id de la categoría                                                                                                           |
| `items.children.category.name`<br/>_string_             | Nombre de la categoría                                                                                                       |
| `items.children.category.minQty`<br/>_integer_          | La cantidad maxima de elementos que se pueden pedir en esta categoría                                                        |
| `items.children.category.maxQty`<br/>_integer_          | La cantidad minima de elementos que se pueden pedir en esta categoría (En toppings, si es 0 significa que no es obligatorio) |
| `items.children.category.sortingPosition`<br/>_integer_ | La posición de la categoría dentro del producto                                                                              |

### Ejemplo de Respuesta "Credenciales invalidas 401":

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objectos dentro de la respuesta de ejemplo:

| Atributos              | Descripción          |
| ---------------------- | -------------------- |
| `message`<br/>_string_ | El token es invalido |

## POST menu

Usa este endpoint para crear un nuevo menú o añadir nuevos artículos a un menú existente del aliado autenticado.

Después de crear un menú o añadir nuevos artículos a alguno existente, el equipo de Rappi valida los artículos y la estructura del menú. Puedes consultar el estado de aprobación usando el endpoint [`GET menu/approved/{storeId}`](#get-menu-approved-store-id).

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país.</a>

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

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Menú actualizado y listo para ser validado

</aside>

<aside class="error-response">

`400` La estructura del menú es invalida.

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Tienda no encontrada

</aside>
<aside class="error-response">

`500` Error interno del servidor

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu`

> Este es un ejemplo de la llamada:

```json
{
  "storeId": "900103361",
  "items": [
    {
      "category": {
        "id": "2090019638",
        "maxQty": 0,
        "minQty": 0,
        "name": "Burgers",
        "sortingPosition": 0
      },
      "children": [
        {
          "category": {
            "id": "211",
            "maxQty": 1,
            "minQty": 0,
            "name": "Do you want to add?",
            "sortingPosition": 0
          },
          "children": [],
          "name": "French Fries",
          "price": 5000,
          "sku": "2135092195",
          "sortingPosition": 1,
          "type": "TOPPING",
          "maxLimit": 1
        },
        {
          "category": {
            "id": "211",
            "maxQty": 1,
            "minQty": 0,
            "name": "Do you want to add?",
            "sortingPosition": 0
          },
          "children": [],
          "name": "Potato Wedges",
          "price": 7000,
          "sku": "2135092196",
          "sortingPosition": 1,
          "type": "TOPPING",
          "maxLimit": 1
        }
      ],
      "name": "Grilled Chicken Burger",
      "price": 14000,
      "sku": "2135092197",
      "sortingPosition": 0,
      "type": "PRODUCT",
      "combo": true
    },
    {
      "category": {
        "id": "2090019639",
        "maxQty": 0,
        "minQty": 0,
        "name": "Pizzas",
        "sortingPosition": 1
      },
      "children": [],
      "name": "Hawaiian Pizza",
      "price": 17000,
      "sku": "2135092198",
      "sortingPosition": 1,
      "type": "PRODUCT",
      "combo": true
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"storeId\": \"900103361\",\n" +
        "  \"items\": [\n" +
        "    {\n" +
        "      \"category\": {\n" +
        "        \"id\": \"2090019638\",\n" +
        "        \"maxQty\": 0,\n" +
        "        \"minQty\": 0,\n" +
        "        \"name\": \"Burgers\",\n" +
        "        \"sortingPosition\": 0\n" +
        "      },\n" +
        "      \"children\": [\n" +
        "        {\n" +
        "          \"category\": {\n" +
        "            \"id\": \"211\",\n" +
        "            \"maxQty\": 1,\n" +
        "            \"minQty\": 0,\n" +
        "            \"name\": \"Do you want to add?\",\n" +
        "            \"sortingPosition\": 0\n" +
        "          },\n" +
        "          \"children\": [],\n" +
        "          \"name\": \"French Fries\",\n" +
        "          \"price\": 5000,\n" +
        "          \"sku\": \"2135092145\",\n" +
        "          \"sortingPosition\": 1,\n" +
        "          \"type\": \"TOPPING\",\n" +
        "          \"maxLimit\": 1\n" +
        "        },\n" +
        "        {\n" +
        "          \"category\": {\n" +
        "            \"id\": \"211\",\n" +
        "            \"maxQty\": 1,\n" +
        "            \"minQty\": 0,\n" +
        "            \"name\": \"Do you want to add?\",\n" +
        "            \"sortingPosition\": 0\n" +
        "          },\n" +
        "          \"children\": [],\n" +
        "          \"name\": \"Potato Wedges\",\n" +
        "          \"price\": 7000,\n" +
        "          \"sku\": \"2135092145\",\n" +
        "          \"sortingPosition\": 1,\n" +
        "          \"type\": \"TOPPING\",\n" +
        "          \"maxLimit\": 1\n" +
        "        }\n" +
        "      ],\n" +
        "      \"name\": \"Grilled Chicken Burger\",\n" +
        "      \"price\": 14000,\n" +
        "      \"sku\": \"2135092145\",\n" +
        "      \"sortingPosition\": 0,\n" +
        "      \"type\": \"PRODUCT\"\n" +
        "      \"combo\": true\n" +
        "    },\n" +
        "    {\n" +
        "      \"category\": {\n" +
        "        \"id\": \"2090019639\",\n" +
        "        \"maxQty\": 0,\n" +
        "        \"minQty\": 0,\n" +
        "        \"name\": \"Pizzas\",\n" +
        "        \"sortingPosition\": 1\n" +
        "      },\n" +
        "      \"children\": [],\n" +
        "      \"name\": \"Hawaiian Pizza\",\n" +
        "      \"price\": 17000,\n" +
        "      \"sku\": \"2135092145\",\n" +
        "      \"sortingPosition\": 1,\n" +
        "      \"type\": \"PRODUCT\"\n" +
        "      \"combo\": true\n" +
        "    }\n" +
        "  ]\n" +
        "}\n";

try (OutputStream os = connection.getOutputStream()) {
    byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
    os.write(input, 0, input.length);
}

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
  method: "POST",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/menu",
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
  storeId: "900103361",
  items: [
    {
      category: {
        id: "2090019638",
        maxQty: 0,
        minQty: 0,
        name: "Burgers",
        sortingPosition: 0,
      },
      children: [
        {
          category: {
            id: "211",
            maxQty: 1,
            minQty: 0,
            name: "Do you want to add?",
            sortingPosition: 0,
          },
          children: [],
          name: "French Fries",
          price: 5000,
          sku: "2135092145",
          sortingPosition: 1,
          type: "TOPPING",
          maxLimit: 1,
        },
        {
          category: {
            id: "211",
            maxQty: 1,
            minQty: 0,
            name: "Do you want to add?",
            sortingPosition: 0,
          },
          children: [],
          name: "Potato Wedges",
          price: 7000,
          sku: "2135092145",
          sortingPosition: 1,
          type: "TOPPING",
          maxLimit: 1,
        },
      ],
      name: "Grilled Chicken Burger",
      price: 14000,
      sku: "2135092145",
      sortingPosition: 0,
      type: "PRODUCT",
      combo: true,
    },
    {
      category: {
        id: "2090019639",
        maxQty: 0,
        minQty: 0,
        name: "Pizzas",
        sortingPosition: 1,
      },
      children: [],
      name: "Hawaiian Pizza",
      price: 17000,
      sku: "2135092145",
      sortingPosition: 1,
      type: "PRODUCT",
      combo: true,
    },
  ],
});

req.write(postData);

req.end();
```

```python
 import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu"

payload = "{\n" \
            "  \"storeId\": \"900103361\",\n" \
            "  \"items\": [\n" \
            "    {\n" \
            "      \"category\": {\n" \
            "        \"id\": \"2090019638\",\n" \
            "        \"maxQty\": 0,\n" \
            "        \"minQty\": 0,\n" \
            "        \"name\": \"Burgers\",\n" \
            "        \"sortingPosition\": 0\n" \
            "      },\n" \
            "      \"children\": [\n" \
            "        {\n" \
            "          \"category\": {\n" \
            "            \"id\": \"211\",\n" \
            "            \"maxQty\": 1,\n" \
            "            \"minQty\": 0,\n" \
            "            \"name\": \"Do you want to add?\",\n" \
            "            \"sortingPosition\": 0\n" \
            "          },\n" \
            "          \"children\": [],\n" \
            "          \"name\": \"French Fries\",\n" \
            "          \"price\": 5000,\n" \
            "          \"sku\": \"2135092145\",\n" \
            "          \"sortingPosition\": 1,\n" \
            "          \"type\": \"TOPPING\",\n" \
            "          \"maxLimit\": 1\n" \
            "        },\n" \
            "        {\n" \
            "          \"category\": {\n" \
            "            \"id\": \"211\",\n" \
            "            \"maxQty\": 1,\n" \
            "            \"minQty\": 0,\n" \
            "            \"name\": \"Do you want to add?\",\n" \
            "            \"sortingPosition\": 0\n" \
            "          },\n" \
            "          \"children\": [],\n" \
            "          \"name\": \"Potato Wedges\",\n" \
            "          \"price\": 7000,\n" \
            "          \"sku\": \"2135092145\",\n" \
            "          \"sortingPosition\": 1,\n" \
            "          \"type\": \"TOPPING\",\n" \
            "          \"maxLimit\": 1\n" \
            "        }\n" \
            "      ],\n" \
            "      \"name\": \"Grilled Chicken Burger\",\n" \
            "      \"price\": 14000,\n" \
            "      \"sku\": \"2135092145\",\n" \
            "      \"sortingPosition\": 0,\n" \
            "      \"type\": \"PRODUCT\"\n" \
            "      \"combo\": true\n" \
            "    },\n" \
            "    {\n" \
            "      \"category\": {\n" \
            "        \"id\": \"2090019639\",\n" \
            "        \"maxQty\": 0,\n" \
            "        \"minQty\": 0,\n" \
            "        \"name\": \"Pizzas\",\n" \
            "        \"sortingPosition\": 1\n" \
            "      },\n" \
            "      \"children\": [],\n" \
            "      \"name\": \"Hawaiian Pizza\",\n" \
            "      \"price\": 17000,\n" \
            "      \"sku\": \"2135092145\",\n" \
            "      \"sortingPosition\": 1,\n" \
            "      \"type\": \"PRODUCT\"\n" \
            "      \"combo\": true\n" \
            "    }\n" \
            "  ]\n" \
            "}\n"
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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu"
	method := "POST"

	payload := strings.NewReader("{\n" +
		"  \"storeId\": \"900103361\",\n" +
		"  \"items\": [\n" +
		"    {\n" +
		"      \"category\": {\n" +
		"        \"id\": \"2090019638\",\n" +
		"        \"maxQty\": 0,\n" +
		"        \"minQty\": 0,\n" +
		"        \"name\": \"Burgers\",\n" +
		"        \"sortingPosition\": 0\n" +
		"      },\n" +
		"      \"children\": [\n" +
		"        {\n" +
		"          \"category\": {\n" +
		"            \"id\": \"211\",\n" +
		"            \"maxQty\": 1,\n" +
		"            \"minQty\": 0,\n" +
		"            \"name\": \"Do you want to add?\",\n" +
		"            \"sortingPosition\": 0\n" +
		"          },\n" +
		"          \"children\": [],\n" +
		"          \"name\": \"French Fries\",\n" +
		"          \"price\": 5000,\n" +
		"          \"sku\": \"2135092145\",\n" +
		"          \"sortingPosition\": 1,\n" +
		"          \"type\": \"TOPPING\",\n" +
		"          \"maxLimit\": 1\n" +
		"        },\n" +
		"        {\n" +
		"          \"category\": {\n" +
		"            \"id\": \"211\",\n" +
		"            \"maxQty\": 1,\n" +
		"            \"minQty\": 0,\n" +
		"            \"name\": \"Do you want to add?\",\n" +
		"            \"sortingPosition\": 0\n" +
		"          },\n" +
		"          \"children\": [],\n" +
		"          \"name\": \"Potato Wedges\",\n" +
		"          \"price\": 7000,\n" +
		"          \"sku\": \"2135092145\",\n" +
		"          \"sortingPosition\": 1,\n" +
		"          \"type\": \"TOPPING\",\n" +
		"          \"maxLimit\": 1\n" +
		"        }\n" +
		"      ],\n" +
		"      \"name\": \"Grilled Chicken Burger\",\n" +
		"      \"price\": 14000,\n" +
		"      \"sku\": \"2135092145\",\n" +
		"      \"sortingPosition\": 0,\n" +
		"      \"type\": \"PRODUCT\"\n" +
		"      \"combo\": true\n" +
		"    },\n" +
		"    {\n" +
		"      \"category\": {\n" +
		"        \"id\": \"2090019639\",\n" +
		"        \"maxQty\": 0,\n" +
		"        \"minQty\": 0,\n" +
		"        \"name\": \"Pizzas\",\n" +
		"        \"sortingPosition\": 1\n" +
		"      },\n" +
		"      \"children\": [],\n" +
		"      \"name\": \"Hawaiian Pizza\",\n" +
		"      \"price\": 17000,\n" +
		"      \"sku\": \"2135092145\",\n" +
		"      \"sortingPosition\": 1,\n" +
		"      \"type\": \"PRODUCT\"\n" +
		"      \"combo\": true\n" +
		"    }\n" +
		"  ]\n" +
		"}\n")

	client := &http.Client {}
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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                                               | Requerido   | Descripción                                                                                                                  |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `storeId`<br/>_string_                                  | `requerido` | Identificador de la tienda en la aplicación de Rappi.                                                                        |
| `items`<br/>_array of objects_                          | `requerido` | Lista de productos dentro del menú de la tienda.                                                                             |
| `items.name`<br/>_string_                               | `requerido` | Nombre del producto en el menú.                                                                                              |
| `items.description`<br/>_string_                        | `requerido` | Descripción del producto en el menú.                                                                                         |
| `items.sku`<br/>_string_                                | `requerido` | SKU que el aliado asigna al producto en el menú.                                                                             |
| `items.type`<br/>_string_                               | `requerido` | Tipo de producto en el menú, en este caso solamente puede ser `PRODUCT`                                                      |
| `items.price`<br/>_integer_                             | `requerido` | Precio del producto en el menú.                                                                                              |
| `items.imageUrl`<br/>_string_                           | `opcional`  | Url de la imagen del producto en el menú                                                                                     |
| `items.rappiIds`<br/>_array of string_                  | `opcional`  | Lista de los identificadores que Rappi le da al producto                                                                     |
| `items.sortingPosition`<br/>_integer_                   | `opcional`  | La posición del producto en su categoría en el menú                                                                          |
| `items.maxLimit`<br/>_integer_                          | `opcional`  | Indicador máximo, es requerido solo si el tipo es topping                                                                    |
| `items.combo`<br/>_boolean_                             | `opcional`  | Indica si el elemento pertenece a un combo                                                                                   |
| `items.category`<br/>_string_                           | `requerido` | Categoría a la cual pertenece el producto en el menú                                                                         |
| `items.category.id`<br/>_string_                        | `requerido` | Id de la categoría                                                                                                           |
| `items.category.name`<br/>_string_                      | `requerido` | Nombre de la categoría                                                                                                       |
| `items.category.minQty`<br/>_integer_                   | `requerido` | La cantidad maxima de elementos que se pueden pedir en esta categoría                                                        |
| `items.category.maxQty`<br/>_integer_                   | `requerido` | La cantidad minima de elementos que se pueden pedir en esta categoría (En toppings, si es 0 significa que no es obligatorio) |
| `items.category.sortingPosition`<br/>_integer_          | `requerido` | Es la posición de la categoría en el menu                                                                                    |
| `items.children`<br/>_array of objects_                 | `opcional`  | Lista de toppings del producto                                                                                               |
| `items.children.name`<br/>_string_                      | `requerido` | Nombre del topping en el menú.                                                                                               |
| `items.children.description`<br/>_string_               | `requerido` | Descripción del toppin en el menú.                                                                                           |
| `items.children.sku`<br/>_string_                       | `requerido` | SKU que el aliado asigna al topping en el menú.                                                                              |
| `items.children.type`<br/>_string_                      | `requerido` | Tipo de topping en el menú, en este caso solamente puede ser `TOPPING`                                                       |
| `items.children.price`<br/>_integer_                    | `requerido` | Precio del topping en el menú.                                                                                               |
| `items.children.imageUrl`<br/>_string_                  | `opcional`  | Url de la imagen del topping en el menú                                                                                      |
| `items.children.rappiIds`<br/>_array of string_         | `opcional`  | Lista de los identificadores que Rappi le da al topping                                                                      |
| `items.children.sortingPosition`<br/>_integer_          | `requerido` | La posición del topping en su categoría en el menú                                                                           |
| `items.children.maxLimit`<br/>_integer_                 | `requerido` | Indicador máximo, es requerido solo si el tipo es topping                                                                    |
| `items.children.category`<br/>_string_                  | `requerido` | Categoría a la cual pertenece el topping en el menú                                                                          |
| `items.children.category.id`<br/>_string_               | `requerido` | Id de la categoría                                                                                                           |
| `items.children.category.name`<br/>_string_             | `requerido` | Nombre de la categoría                                                                                                       |
| `items.children.category.minQty`<br/>_integer_          | `requerido` | La cantidad maxima de elementos que se pueden pedir en esta categoría                                                        |
| `items.children.category.maxQty`<br/>_integer_          | `requerido` | La cantidad minima de elementos que se pueden pedir en esta categoría (En toppings, si es 0 significa que no es obligatorio) |
| `items.children.category.sortingPosition`<br/>_integer_ | `requerido` | La posición de la categoría dentro del producto                                                                              |

### Ejemplo de Respuesta "200 Llamada exitosa"

Este endpoint regresa solo un código de respuesta exitosa.

### Ejemplo de Respuesta "400 La estructura del menú es invalida."

```json
{
  "message": "The submitted menu has errors.",
  "errors": [
    {
      "reason": "All items must have a valid name, category or product description.",
      "relatedItems": [
        {
          "description": "",
          "sku": "product1",
          "type": "PRODUCT",
          "price": 899.0,
          "category": {
            "id": "455",
            "name": "producto category name 1",
            "minQty": 0,
            "maxQty": 0,
            "sortingPosition": 0
          },
          "imageUrl": "https://anydomain/anyimagen_1.png",
          "rappiIds": ["1965855"],
          "sortingPosition": 0,
          "maxLimit": 1
        }
      ]
    },
    {
      "reason": "Invalid urls were found",
      "relatedItems": [
        {
          "name": "producto name 1",
          "description": "",
          "sku": "product2",
          "type": "PRODUCT",
          "price": 899.0,
          "category": {
            "id": "455",
            "name": "producto category name 1",
            "minQty": 0,
            "maxQty": 0,
            "sortingPosition": 0
          },
          "imageUrl": "httpaas://anydomain/anyimagen_2.png",
          "rappiIds": ["1965855"],
          "sortingPosition": 0,
          "maxLimit": 1
        }
      ]
    }
  ]
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta                       | Descripción del objeto                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `message`<br/>_string_                       | Mensaje de error al enviar el menu. El mensaje por defecto es "The submitted menu has errors."                                     |
| `errors`<br/>_array of objects_              | Lista de errores encontrados en el menu.                                                                                           |
| `errors.reason`<br/>_string_                 | Descripción del error encontrado en el menu. Los distintos mensajes los podemos encontrar en "VALIDACIONES SOBRE EL MENU RECIBIDO" |
| `errors.relatedItems`<br/>_array of objects_ | Lista de items que poseen el error, pueden ser tanto productos como toppings                                                       |

Para ver todas las posibles validaciones de la estructura del menú pueden ver las <a href="/es/managing-store-menus/#validaciones-sobre-el-menu-recibido" target="_blank">VALIDACIONES SOBRE EL MENU RECIBIDO.</a>

### Ejemplo de Respuesta "401 Credenciales inválidas"

> 401 Credenciales inválidas:

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Atributos              | Descripción    |
| ---------------------- | -------------- |
| `message`<br/>_string_ | Token inválido |

### Ejemplo de Respuesta "404 Tienda no encontrada"

> 404 Tienda no encontrada:

```json
{
  "message": "StoreId 9001035324: not found associated Stores"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Atributos              | Descripción          |
| ---------------------- | -------------------- |
| `message`<br/>_string_ | Tienda no encontrada |

### Ejemplo de Respuesta "500 Error interno del servidor"

> 500 Error interno del servidor:

```json
{
  "message": "An error occurred while processing your request. please try again later.",
  "detail": {
    "error": {
      "code": "catalog_error_code",
      "message": "Descripción del error recibido desde el servicio de catálogo"
    }
  }
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Atributos                               | Descripción                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`<br/>_string_                  | Mensaje de error genérico indicando que la solicitud no pudo ser procesada.                                                                                                                                                         |
| `detail`<br/>_object \| string \| null_ | Detalle del error reenviado desde el servicio interno de menú. Contiene el error retornado por el servicio de catálogo cuando está disponible. Puede ser un objeto JSON, una cadena de texto o `null` si no hay detalle disponible. |
| `detail.error`<br/>_object_             | Objeto de error del servicio interno.                                                                                                                                                                                               |
| `detail.error.code`<br/>_string_        | Identificador del código de error proveniente del servicio de catálogo.                                                                                                                                                             |
| `detail.error.message`<br/>_string_     | Descripción legible del error proveniente del servicio de catálogo.                                                                                                                                                                 |

### Ejemplo de Respuesta "424 Dependencia Fallida"

> 424 Dependencia Fallida:

```json
{
  "message": "An error occurred while processing your request. please try again later.",
  "detail": {
    "error": {
      "code": "duplicated_items_complies",
      "message": "Hay productos repetidos dentro de una misma categoría o grupo de modificadores. Elimina los duplicados."
    }
  }
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Atributos                               | Descripción                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`<br/>_string_                  | Mensaje de error genérico indicando que la solicitud no pudo ser procesada.                                                                                                                                                         |
| `detail`<br/>_object \| string \| null_ | Detalle del error reenviado desde el servicio interno de menú. Contiene el error retornado por el servicio de catálogo cuando está disponible. Puede ser un objeto JSON, una cadena de texto o `null` si no hay detalle disponible. |
| `detail.error`<br/>_object_             | Objeto de error del servicio interno.                                                                                                                                                                                               |
| `detail.error.code`<br/>_string_        | Código de validación que identifica el error específico del servicio de catálogo. Consulta la tabla a continuación para ver los valores posibles.                                                                                   |
| `detail.error.message`<br/>_string_     | Descripción legible del error proveniente del servicio de catálogo.                                                                                                                                                                 |

#### Códigos de validación del catálogo

| Código | Tipo | Descripción |
| ------ | ---- | ----------- |
| `duplicated_categories_complies` | Estructural | Hay categorías repetidas en el menú. Revisa que cada categoría tenga un nombre y código únicos. |
| `duplicated_items_complies` | Estructural | Hay productos repetidos dentro de una misma categoría o grupo de modificadores. Elimina los duplicados. |
| `item_relation_complies` | Estructural | La estructura del menú tiene un error: un producto está conectado directamente a otro producto, o un grupo de modificadores a otro grupo. Revisa la jerarquía. |
| `item_relation_without_cyclic_complies` | Estructural | Se detectó un bucle en la estructura del menú: un producto aparece más de una vez en la misma ruta. Esto puede causar errores al navegar el menú. |
| `start_and_ends_with_item` | Estructural | La ruta del menú no comienza o no termina con un producto. Cada ruta debe empezar y terminar con un producto, no con un grupo de modificadores. |
| `minimum_menus_complies` | Estructural | No se encontró ningún menú en la tienda. Se necesita al menos un menú para publicar. |
| `minimum_categories_complies` | Estructural | No se encontró ninguna categoría en el menú. Se necesita al menos una categoría. |
| `minimum_items_complies` | Estructural | No se encontró ningún producto en el menú. Se necesita al menos un producto. |
| `image_url_complies` | Contenido | La URL de la imagen del producto no es válida. Verifica que comience con http:// o https:// y que no tenga espacios. |
| `text_format_complies` | Contenido | El texto contiene emojis o palabras prohibidas, los cuales no están permitidos en el nombre, descripción o código del producto o categoría. |
| `text_fields_length_complies` | Contenido | El nombre o código del producto/categoría está vacío, es demasiado corto o demasiado largo. Todos los productos y categorías deben tener un nombre y código dentro de los límites permitidos. |
| `override_type_complies` | Contenido | Se usó un tipo de personalización no válido en el producto. Revisa la configuración de las personalizaciones del producto. |
| `positive_numbers_complies` | Contenido | El precio o las cantidades del producto son negativos, o un grupo de modificadores tiene la cantidad máxima en cero. Estos valores deben ser positivos. |
| `min_permitted_complies` | Contenido | Un producto estándar tiene una cantidad mínima obligatoria mayor a cero. Los productos estándar no deben requerir una cantidad mínima. |
| `zero_price_complies` | Contenido | El precio del producto es cero. Verifica que todos los productos tengan un precio asignado. |
| `max_item_childs_complies` | Límites | El producto o grupo de modificadores tiene demasiados elementos hijos (más de 50). Reduce la cantidad de opciones. |
| `max_item_images_complies` | Límites | El producto tiene demasiadas imágenes (más de 3). Reduce la cantidad de imágenes por producto. |
| `max_item_level_depth_complies` | Límites | La estructura del menú tiene demasiados niveles de profundidad. El límite es de 11 niveles. Simplifica la estructura de modificadores. |
| `max_items_category_complies` | Límites | La categoría tiene demasiados productos (más de 50). Divide los productos en varias categorías. |
| `max_time_periods_complies` | Límites | El producto o categoría tiene demasiados horarios configurados (más de 6 por día). Reduce la cantidad de franjas horarias. |
| `max_permitted_in_items_complies` | Límites | La suma de cantidades máximas permitidas de los productos hijos no es válida. Revisa las cantidades configuradas en el grupo de modificadores. |

## GET menu/approved/{storeId}

Usa este endpoint para regresar el estado de aprobación de un menú.

### URL del Endpoint

Usa esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu/approved/{storeId}`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país.</a>

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

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/approved/251`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 251;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/approved/%s", storeId));

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/menu/approved/251",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/approved/251"

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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/approved/251"
	method := "GET"

	client := &http.Client {}
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

Este endpoint regresa unicamente un código de respuesta.

> 401 Credenciales inválidas:

```json
{
  "message": "Not a valid token"
}
```

## GET menu/rappi/{storeId}

Utiliza este endpoint para obtener el último menú creado para una tienda en especifico.

### URL del Endpoint

Utiliza esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/menu/rappi/{storeId}`

- `{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank"> Mira la lista de dominios por país.</a>
- `{storeId}`: Este es el identificador de la integración de tu tienda.

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

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/rappi/251`

> Este es un ejemplo de la llamada:

```java
final Integer storeId = 251;

URL url = new URL(String.format("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/rappi/%s", storeId));

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
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/menu/rappi/251",
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

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/rappi/251"

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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/menu/rappi/251"
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

> Este es un ejemplo de la respuesta "200 Llamada exitosa":

```json
{
  "storeId": "900111978",
  "items": [
    {
      "name": "Naked Cake con frutos",
      "description": "Naked cake decorado con frutos. Cubierta de trufa derretida (ganache) y decorada con frutos del bosque.",
      "sku": "8569874",
      "type": "PRODUCT",
      "price": 75.0,
      "category": {
        "id": "3",
        "name": "Tortas",
        "minQty": 0,
        "maxQty": 0,
        "sortingPosition": 0
      },
      "imageUrl": "https://image.com/image1.jpg",
      "children": [
        {
          "name": "Chocolate",
          "description": "",
          "sku": "8569874-159",
          "type": "TOPPING",
          "price": 0.0,
          "category": {
            "id": "1",
            "name": "Sabor",
            "minQty": 0,
            "maxQty": 1,
            "sortingPosition": 0
          },
          "imageUrl": "https://image.com/image10.jpg",
          "children": [],
          "rappiIds": ["340948822"],
          "sortingPosition": 1,
          "maxLimit": 1
        }
      ],
      "rappiIds": ["2135527868"],
      "sortingPosition": 0,
      "maxLimit": 1
    },
    {
      "name": "Snowman",
      "description": "Linda lata de Snowman con productos variadosIncluye:Galletas mantequilla 350 gr, 6 brookies y 4 trufas de brownie.",
      "sku": "856887",
      "type": "PRODUCT",
      "price": 75.0,
      "category": {
        "id": "9",
        "name": "Navidad",
        "minQty": 0,
        "maxQty": 0,
        "sortingPosition": 0
      },
      "imageUrl": "https://image.com/image2.jpg",
      "children": [],
      "rappiIds": ["2135524472"],
      "sortingPosition": 0,
      "maxLimit": 1
    }
  ]
}
```

> Este es un ejemplo de la respuesta "401 Credenciales inválidas":

```json
{
  "message": "Not a valid token"
}
```

El detalle de lo que significa cada atributo esta dentro de la sección [Get Menu.](#get-menu)
