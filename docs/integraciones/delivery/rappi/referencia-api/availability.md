
# Disponibilidad

Los recursos de Disponibilidad te permiten interactuar con las opciones de disponibilidad de tus artículos y tiendas.

!!! important
Dada la expansión y mejoras, se han introducido nuevos endpoints o recursos que amplían las capacidades de disponibilidad para interactuar con distintas opciones de artículos y tiendas; debido a estos avances, ahora esta sección se divide en dos partes distintas, cada una con su propia lista de dominios por país. Es esencial destacar que la sección de disponibilidad actual sigue plenamente operativa y contiene los recursos tradicionales que han manejado las opciones de disponibilidad establecidas previamente.

<aside class="notice">
  <p>NOTA</p>
  <p>Para acceder a la nueva sección de disponibilidad con los últimos recursos y funcionalidades, te invitamos a hacer <a href="/es/api-reference/availability-rests-api/" target="_blank">clic aquí</a>.</p>
</aside>

La siguiente tabla describe los diferentes contenidos de los recursos de Disponibilidad relacionados a esta <a href="/es/api-reference/content/#dominios" target="_blank">Lista de Dominios por país.</a>:

| Recurso                                                                            | Descripción                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`POST availability/items/status`](#post-availability-items-status)                | Retorna la disponibilidad de los artículos por SKU en la app de Rappi         |
| [`POST availability/items/rappi/status`](#post-availability-items-rappi-status)    | Retorna la disponibilidad de los artículos por ID en la app de Rappi          |
| [`PUT availability/stores/items`](#put-availability-stores-items)                  | Maneja la disponibilidad de los artículos por SKU en la app de Rappi          |
| [`PUT availability/stores/items/rappi`](#put-availability-stores-items-rappi)      | Maneja la disponibilidad de los artículos por ID en la app de Rappi           |
| [`POST availability/stores`](#post-availability-stores)                            | Retorna el estado de disponibilidad de las tiendas en la app de Rappi         |
| [`PUT availability/stores`](#put-availability-stores)                              | Maneja de forma asincrónica la disponibilidad de la tienda en la app de Rappi |
| [`PUT availability/stores/enable/massive`](#put-availability-stores-enable-masive) | Maneja de forma asincrónica la disponibilidad de la tienda en la app de Rappi |
| [`PUT availability/stores/enable`](#put-availability-stores-enable)                | Maneja de forma sincrónica la disponibilidad de la tienda en la app de Rappi  |

## POST availability/items/status

Usa este endpoint para consultar la disponibilidad de tus artículos por SKU en tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/items`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint: `POST https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/status`

Este es un ejemplo de la llamada:

```json
{
  "store_id": "900144512",
  "item_ids": ["7713", "2668", "3395", "5685"]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/status");
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);
String jsonInputString = "{\n" +
         "   \"store_id\":\"900144512\",\n" +
         "   \"item_ids\":[\n" +
         "      \"7713\",\n" +
         "      \"2668\",\n" +
         "      \"3395\",\n" +
         "      \"5685\"\n" +
         "   ],\n" +
         "}";
try (OutputStream os = connection.getOutputStream()) {
  byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
  os.write(input, 0, input.length);
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");
var options = {
  method: "POST",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/availability/items/status",
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
  store_id: "900144512",
  item_ids: ["7713", "2668", "3395", "5685"],
});
req.write(postData);
req.end();
```

```python
import requests
url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items"
payload ="{\n" \
         "   \"store_id\":\"900144512\",\n" \
         "   \"item_ids\":[\n" \
         "      \"7713\",\n" \
         "      \"2668\",\n" \
         "      \"3395\",\n" \
         "      \"5685\"\n" \
         "   ],\n" \
         "}"
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
  url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/status"
  method := "POST"
  payload := strings.NewReader("{\n" +
        "   \"store_id\":\"900144512\",\n" +
        "   \"item_ids\":[\n" +
        "      \"7713\",\n" +
        "      \"2668\",\n" +
        "      \"3395\",\n" +
        "      \"5685\"\n" +
        "   ],\n" +
        "}")
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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                        | Requerido   | Descripción                                              |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `store_id`<br>_string_           | `requerido` | Este es el identificador de la tienda del lado de Rappi. |
| `item_ids`<br>_array of strings_ | `requerido` | Lista de los SKU de los artículos a consultar.           |

### Ejemplo de Respuesta

> Ejemplo de respuesta exitosa:

```json
[
  {
    "item_id": 2136411305,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411307,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411304,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  },
  {
    "item_id": 2136411306,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta        | Descripción del objeto                                   |
| ----------------------------- | -------------------------------------------------------- |
| `item_id`<br>_integer_        | Identificador del articulo dentro del menú de la tienda. |
| `item_type`<br>_string_       | Tipo de producto en el menú.                             |
| `stock_out_state`<br>_string_ | Indica la disponibilidad del producto                    |

Estos son las respuestas posibles al hacer la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## POST availability/items/rappi/status

Usa este endpoint para consultar la disponibilidad de tus artículos por SKU en tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/items`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:
`POST https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/rappi/status`

> Este es un ejemplo de la llamada:

```json
{
  "store_id": "900144512",
  "item_ids": ["2136411304"]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/rappi/status");
HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);
String jsonInputString = "{\n" +
         "   \"store_id\":\"900144512\",\n" +
         "   \"item_ids\":[\n" +
         "      \"2136411304\"\n" +
         "   ],\n" +
         "}";
try (OutputStream os = connection.getOutputStream()) {
  byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
  os.write(input, 0, input.length);
}
System.out.println("Response Code : " + connection.getResponseCode());
```

```javascript
var https = require("https");
var options = {
  method: "POST",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/availability/items/rappi/status",
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
  store_id: "900144512",
  item_ids: ["2136411304"],
});
req.write(postData);
req.end();
```

```python
import requests
url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/rappi/status"
payload ="{\n" \
         "   \"store_id\":\"900144512\",\n" \
         "   \"item_ids\":[\n" \
         "      \"2136411304\"\n" \
         "   ],\n" \
         "}"
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
    url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/items/rappi/status"
    method := "POST"
    payload := strings.NewReader("{\n" +
         "   \"store_id\":\"900144512\",\n" +
         "   \"item_ids\":[\n" +
         "      \"2136411304\"\n" +
         "   ],\n" +
         "}")
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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                        | Requerido   | Descripción                                              |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `store_id`<br>_string_           | `requerido` | Este es el identificador de la tienda del lado de Rappi. |
| `item_ids`<br>_array of strings_ | `requerido` | Lista de los ids de los artículos a consultar.           |

### Ejemplo de Respuesta

> Ejemplo de respuesta exitosa:

```json
[
  {
    "item_id": 2136411304,
    "item_type": "PRODUCT",
    "stock_out_state": "AVAILABLE"
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta        | Descripción del objeto                                   |
| ----------------------------- | -------------------------------------------------------- |
| `item_id`<br>_integer_        | Identificador del articulo dentro del menú de la tienda. |
| `item_type`<br>_string_       | Tipo de producto en el menú.                             |
| `stock_out_state`<br>_string_ | Indica la disponibilidad del producto                    |

Estos son las respuestas posibles al hacer la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## PUT availability/stores/items

Usa este endpoint para configurar las opciones de disponibilidad de tus artículos por SKU en tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/items`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

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

<aside class="error-response">

`404` Artículo no encontrado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items`

> Este es un ejemplo de la llamada:

```json
[
  {
    "store_integration_id": "999",
    "items": {
      "turn_on": ["1111", "2222", "3333"],
      "turn_off": ["5555"]
    }
  }
]
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "[\n" +
         "   {\n" +
         "      \"store_integration_id\":\"999\",\n" +
         "      \"items\":{\n" +
         "         \"turn_on\":[\n" +
         "            \"1111\",\n" +
         "            \"2222\",\n" +
         "            \"3333\"\n" +
         "         ],\n" +
         "         \"turn_off\":[\n" +
         "            \"5555\"\n" +
         "         ]\n" +
         "      }\n" +
         "   }\n" +
         "]";

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
  path: "/api/v2/restaurants-integrations-public-api/availability/stores/items",
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

var postData = JSON.stringify([
  {
    store_integration_id: "999",
    items: {
      turn_on: ["1111", "2222", "3333"],
      turn_off: ["5555"],
    },
  },
]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items"

payload = "[\n" \
         "   {\n" \
         "      \"store_integration_id\":\"999\",\n" \
         "      \"items\":{\n" \
         "         \"turn_on\":[ " \
         "            \"1111\", " \
         "            \"2222\", " \
         "            \"3333\" " \
         "         ],\n" \
         "         \"turn_off\":[ " \
         "            \"5555\" " \
         "         ]\n" \
         "      }\n" \
         "   }\n" \
         "]"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items"
	method := "PUT"

	payload := strings.NewReader("[\n" +
		"   {\n" +
		"      \"store_integration_id\":\"999\",\n" +
		"      \"items\":{\n" +
		"         \"turn_on\":[\n" +
		"            \"1111\",\n" +
		"            \"2222\",\n" +
		"            \"3333\"\n" +
		"         ],\n" +
		"         \"turn_off\":[\n" +
		"            \"5555\"\n" +
		"         ]\n" +
		"      }\n" +
		"   }\n" +
		"]")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                           | Requerido  | Descripción                                   |
| ----------------------------------- | ---------- | --------------------------------------------- |
| `store_integration_id`<br/>_string_ | `required` | Identificador de la integración de la tienda. |
| `items`<br/>_array of objects_      | `required` | Propiedades de los artículos configurados.    |
| `items.turn_on`<br/>_string_        | `optional` | SKU del artículo a habilitar.                 |
| `items.turn_off`<br/>_string_       | `optional` | Sku del artículo a deshabilitar.              |

### Ejemplo de Respuesta

> Ejemplo de respuesta con mensaje de error:

```json
[
  {
    "message": "Error updating items"
  }
]
```

Estos son las respuestas posibles al hacer la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## PUT availability/stores/items/rappi

Usa este endpoint para configurar la disponibilidad de tus artículos por ID de Rappi en tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Artículo actualizado exitosamente

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Artículo no encontrado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi`

> Este es un ejemplo de la llamada:

```json
[
  {
    "store_integration_id": "999",
    "items": {
      "turn_on": [1111, 2222, 3333],
      "turn_off": [5555]
    }
  }
]
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "[\n" +
         "   {\n" +
         "      \"store_integration_id\":\"999\",\n" +
         "      \"items\":{\n" +
         "         \"turn_on\":[\n" +
         "            1111,\n" +
         "            2222,\n" +
         "            3333\n" +
         "         ],\n" +
         "         \"turn_off\":[\n" +
         "            5555\n" +
         "         ]\n" +
         "      }\n" +
         "   }\n" +
         "]";

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
  path: "/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi",
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

var postData = JSON.stringify([
  {
    store_integration_id: "999",
    items: {
      turn_on: [1111, 2222, 3333],
      turn_off: [5555],
    },
  },
]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi"

payload = "[\n" \
         "   {\n" \
         "      \"store_integration_id\":\"999\",\n" \
         "      \"items\":{\n" \
         "         \"turn_on\":[ " \
         "            1111, " \
         "            2222, " \
         "            3333 " \
         "         ],\n" \
         "         \"turn_off\":[\n" \
         "            5555\n" \
         "         ]\n" \
         "      }\n" \
         "   }\n" \
         "]"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/items/rappi"
	method := "PUT"

	payload := strings.NewReader("[\n" +
		"   {\n" +
		"      \"store_integration_id\":\"999\",\n" +
		"      \"items\":{\n" +
		"         \"turn_on\":[\n" +
		"            1111,\n" +
		"            2222,\n" +
		"            3333\n" +
		"         ],\n" +
		"         \"turn_off\":[\n" +
		"            5555\n" +
		"         ]\n" +
		"      }\n" +
		"   }\n" +
		"]")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                           | Requerido  | Descripción                                   |
| ----------------------------------- | ---------- | --------------------------------------------- |
| `store_integration_id`<br/>_string_ | `required` | Identificador de la integración de la tienda. |
| `items`<br/>_array of objects_      | `required` | Propiedades de los artículos configurados.    |
| `items.turn_on`<br/>_integer_       | `optional` | Rappi ID del artículo a habilitar.            |
| `items.turn_off`<br/>_integer_      | `optional` | Rappi ID del artículo a deshabilitar.         |

### Ejemplo de Respuesta

> Este es un ejemplo de una respuesta con un mensaje de error:

```json
{
  "message": "Error message"
}
```

Estas son las posibles respuestas de la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## POST availability/stores

Usa este endpoint para consultar la disponibilidad de tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Tiendas consultadas exitosamente

</aside>

<aside class="error-response">

`400` Se está consultando una cantidad de tiendas superior al máximo permitido (100 tiendas)

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`429` Se están enviando demasiadas solicitudes en un período de tiempo determinado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores`

> Este es un ejemplo de la llamada:

```json
[900105433]
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "[
  900105433
  ]";

try (OutputStream os = connection.getOutputStream()) {
  byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
  os.write(input, 0, input.length);
}

System.out.println("Response Code : " + connection.getResponseCode());

```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "microservices.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/availability/stores/",
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

var postData = JSON.stringify([900105433]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores"

payload = "[
  900105433
  ]"

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

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores"
	method := "POST"

	payload := strings.NewReader("[
  900105433
  ]")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                        | Requerido   | Descripción                                                 |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| Listado de tiendas<br/>_integer_ | `requerido` | Lista de IDs de las tiendas a consultar separados por coma. |

### Ejemplo de Respuesta

> Este es un ejemplo de una respuesta _Success_:

```json
{
  "900105433": false
}
```

> Este es un ejemplo de una respuesta con un mensaje de error:

```json
{
  "message": "Error message"
}
```

Estas son las posibles respuestas de la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_ con un objeto en formato `JSON`.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## PUT availability/stores

Usa este endpoint para configurar la disponibilidad de tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Tiendas actualizadas exitosamente

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

<aside class="error-response">

`404` Tienda no encontrada

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores`

> Este es un ejemplo de la llamada:

```json
{
  "turn_on": ["2222"],
  "turn_off": ["333", "444"]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
         "   \"turn_on\":[\n" +
         "      \"2222\"\n" +
         "   ],\n" +
         "   \"turn_off\":[\n" +
         "      \"333\",\n" +
         "      \"444\"\n" +
         "   ]\n" +
         "}";

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
  path: "/api/v2/restaurants-integrations-public-api/availability/stores/items",
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
  turn_on: ["2222"],
  turn_off: ["333", "444"],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores"

payload = "{\n" \
         "   \"turn_on\":[\n" \
         "      \"2222\"\n" \
         "   ],\n" \
         "   \"turn_off\":[\n" \
         "      \"333\",\n" \
         "      \"444\"\n" \
         "   ]\n" \
         "}"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores"
	method := "PUT"

	payload := strings.NewReader("{\n" +
		"   \"turn_on\":[\n" +
		"      \"2222\"\n" +
		"   ],\n" +
		"   \"turn_off\":[\n" +
		"      \"333\",\n" +
		"      \"444\"\n" +
		"   ]\n" +
		"}")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Atributos                | Requerido  | Descripción                                 |
| ------------------------ | ---------- | ------------------------------------------- |
| `turn_on`<br/>_integer_  | `opcional` | Lista de IDs de las tiendas a habilitar.    |
| `turn_off`<br/>_integer_ | `opcional` | Lista de IDs de las tiendas a deshabilitar. |

### Ejemplo de Respuesta

> Este es un ejemplo de una respuesta con un mensaje de error:

```json
{
  "message": "Error message"
}
```

Estas son las posibles respuestas de la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## PUT availability/stores/enable/massive

Usa este endpoint para configurar la disponibilidad de tus artículos por ID de Rappi en tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">See the list of Country Domains.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |        |
| --------------------------------------- | ------ |
| Formato de respuesta                    | `JSON` |
| Requerimientos del _body_ de la llamada | `JSON` |
| Requerimientos de autenticación         | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Tiendas actualizadas correctamente

</aside>

<aside class="error-response">

`400` Error al actualizar las tiendas

</aside>

<aside class="error-response">

`401` Credenciales inválidas

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable/massive`

> Este es un ejemplo de la llamada:

```json
{
  "stores": [
    {
      "store_id": "12312",
      "is_enabled": true
    },
    {
      "store_id": "12312",
      "is_enabled": false
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable/massive");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = = "{\n"
                     + "    \"stores\": [\n"
                     + "        {\n"
                     + "            \"store_id\": \"12312\",\n"
                     + "            \"is_enabled\": true\n"
                     + "        },\n"
                     + "        {\n"
                     + "            \"store_id\": \"12312\",\n"
                     + "            \"is_enabled\": false\n"
                     + "        }\n"
                     + "    ]\n"
                     + "}";

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
  path: "/api/v2/restaurants-integrations-public-api/availability/stores//enable/massive",
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
  stores: [
    {
      store_id: "12312",
      is_enabled: true,
    },
    {
      store_id: "12312",
      is_enabled: false,
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable/massive"

payload = = "{\n"
      + "    \"stores\": [\n"
      + "        {\n"
      + "            \"store_id\": \"12312\",\n"
      + "            \"is_enabled\": true\n"
      + "        },\n"
      + "        {\n"
      + "            \"store_id\": \"12312\",\n"
      + "            \"is_enabled\": false\n"
      + "        }\n"
      + "    ]\n"
      + "}"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable/massive"
	method := "PUT"

	payload := strings.NewReader("{\n"
                           + "    \"stores\": [\n"
                           + "        {\n"
                           + "            \"store_id\": \"12312\",\n"
                           + "            \"is_enabled\": true\n"
                           + "        },\n"
                           + "        {\n"
                           + "            \"store_id\": \"12312\",\n"
                           + "            \"is_enabled\": false\n"
                           + "        }\n"
                           + "    ]\n"
                           + "}")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

<aside class="notice">
  <p>NOTA</p>
  <p>Tenga en cuenta que el id de la tienda es del lado de rappi</p>
</aside>

| Atributos                         | Requerido   | Descripción                                              |
| --------------------------------- | ----------- | -------------------------------------------------------- |
| `stores`<br/>_array of objects_   | `requerido` | Lista de tiendas                                         |
| `stores.store_id`<br/>_string_    | `requerido` | ID de la tienda (del lado de rappi) que será actualizada |
| `stores.is_enabled`<br/>_boolean_ | `requerido` | `true` para prenderla, de lo contrario `false`           |

### Ejemplo de Respuesta

> Este es un ejemplo de una respuesta con un mensaje de error:

```json
{
  "message": "Error message"
}
```

Estas son las posibles respuestas de la llamada:

- Si la llamada es exitosa, el endpoint regresa un código _Success_.
- Si la llamada falla, el endpoint regresa un código de _Error_ con un mensaje en formato `JSON`.

## PUT availability/stores/enable

Usa este endpoint para configurar la disponibilidad de tus tiendas de forma sincrónica

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/availability/stores/enable`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank"> Mira la lista de Dominios por país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parametros

Este endpoint no permite parámetros adicionales.

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Tiendas actualizadas exitosamente

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`403` No tienes permiso para actualizar las tiendas enviadas

</aside>

<aside class="error-response">

`422` Se enviaron mas tiendas de las permitidas

</aside>

<aside class="error-response">

`502` Error interno al actualizar las tiendas

</aside>

### Ejemplo de llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable`

> Este es un ejemplo de la llamada:

```json
{
  "stores": [
    {
      "store_id": "12312",
      "is_enabled": true
    },
    {
      "store_id": "12312",
      "is_enabled": false
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = = "{\n"
                     + "    \"stores\": [\n"
                     + "        {\n"
                     + "            \"store_id\": \"12312\",\n"
                     + "            \"is_enabled\": true\n"
                     + "        },\n"
                     + "        {\n"
                     + "            \"store_id\": \"12312\",\n"
                     + "            \"is_enabled\": false\n"
                     + "        }\n"
                     + "    ]\n"
                     + "}";

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
  path: "/api/v2/restaurants-integrations-public-api/availability/stores/enable",
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
  stores: [
    {
      store_id: "12312",
      is_enabled: true,
    },
    {
      store_id: "12312",
      is_enabled: false,
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable"

payload = = "{\n"
      + "    \"stores\": [\n"
      + "        {\n"
      + "            \"store_id\": \"12312\",\n"
      + "            \"is_enabled\": true\n"
      + "        },\n"
      + "        {\n"
      + "            \"store_id\": \"12312\",\n"
      + "            \"is_enabled\": false\n"
      + "        }\n"
      + "    ]\n"
      + "}"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/v2/restaurants-integrations-public-api/availability/stores/enable"
	method := "PUT"

	payload := strings.NewReader("{\n"
                           + "    \"stores\": [\n"
                           + "        {\n"
                           + "            \"store_id\": \"12312\",\n"
                           + "            \"is_enabled\": true\n"
                           + "        },\n"
                           + "        {\n"
                           + "            \"store_id\": \"12312\",\n"
                           + "            \"is_enabled\": false\n"
                           + "        }\n"
                           + "    ]\n"
                           + "}")

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

Esta tabla describe los atributos que el `JSON` de tu llamada requiere:

| Attributes                        | Requirement | Description                                    |
| --------------------------------- | ----------- | ---------------------------------------------- |
| `stores`<br/>_array of objects_   | `requerido` | List of store's data                           |
| `stores.store_id`<br/>_string_    | `requerido` | id of the store that will change the status    |
| `stores.is_enabled`<br/>_boolean_ | `requerido` | `true` to turn on the store, otherwise `false` |

<aside class="notice">
  <p>NOTA</p>
  <p>La máxima cantidad de tiendas permitidas para actualizar son 300</p>
</aside>

### Sample Response

> Este es un ejemplo de la respuesta exitosa:

```json
{
  "results": [
    {
      "store_id": 90774,
      "is_enabled": true,
      "operation_result": true,
      "operation_result_type": "SUCCESS",
      "operation_result_message": "success",
      "suspended_reason": null,
      "suspended_at": null,
      "suspended_time": 0
    },
    {
      "store_id": 90775,
      "is_enabled": false,
      "operation_result": false,
      "operation_result_type": "SUSPENDED",
      "operation_result_message": "suspended",
      "suspended_reason": "suspended due to cancelled orders",
      "suspended_at": "2022-04-11T20:23:00.00Z",
      "suspended_time": 60
    }
  ]
}
```

> Este es un ejemplo de la respuesta con algún error:

```json
{
  "message": "It has been sent more than 300 stores and cannot be processed, please use the asynchronous service"
}
```

Esta tabla describe los atributos que el `JSON` de la respuesta contiene

| Response Object                                 | Object Description                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `results`<br/>_array of objects_                | Lista de resultados                                                                                                     |
| `results.store_id`<br/>_int_                    | ID de la tienda.                                                                                                        |
| `results.is_enabled`<br/>_boolean_              | Estado actual de la tienda                                                                                              |
| `results.operation_result`<br/>_boolean_        | `true` si el resultado de la operación fue exitoso, de lo contrario `false`.                                            |
| `results.operation_result_type`<br/>_string_    | Valores posibles: `SUCCESS, SUSPENDED, FORBIDDEN, STORE_NOT_PUBLISHED, STORE_ALREADY_IN_STATUS, ERROR_EXTERNAL_SERVICE` |
| `results.operation_result_message`<br/>_string_ | Descripción del result type                                                                                             |
| `results.suspended_reason`<br/>_string_         | Si la tienda fue suspendida, el motivo va a estar acá                                                                   |
| `results.suspended_at`<br/>_date_               | Fecha desde la cual la tienda fue suspendida                                                                            |
| `results.suspended_time`<br/>_int_              | Tiempo en minutos que indica por cuanto tiempo la tienda fue suspendida                                                 |

Significado de los diferentes valores del campo operation_result_type

- `STORE_NOT_PUBLISHED`: la tienda no se está mostrando actualmente en la aplicación
- `SUSPENDED`: la tienda fue suspendida y no es posible prenderla
- `ERROR_EXTERNAL_SERVICE`: hubo un error intentando cambiar el estado de la tienda
- `FORBIDDEN`: el client_id autenticado no tiene permisos para cambiar el estado de la tienda especificada
- `STORE_ALREADY_IN_STATUS`: la tienda ya se encuentra en el estado al que está intentando cambiarla
- `SUCCESS`: la tienda fue actualizada correctamente
