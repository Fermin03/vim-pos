
# Rest API - Disponibilidad

Los recursos de Disponibilidad le permiten interactuar con las opciones de disponibilidad de sus artículos y tiendas.

La siguiente tabla describe los diferentes contenidos de los recursos de Disponibilidad:

| Resource                                                                                                                   | Description                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`PATCH /v1/stores/{storeId}/products/{identityType}/stock`](#patch-disponibilidad-de-productos-por-sku-o-id)              | Gestiona de forma asincrónica la disponibilidad de productos por SKU o ID en la app de Rappi            |
| [`POST /v1/stores/{storeId}/products/{identityType}/stock/status`](#post-validar-disponibilidad-de-productos-por-sku-o-id) | Devuelve la disponibilidad de productos por SKU o ID en la app de Rappi                                 |
| [`PATCH /v1/stores/{storeId}/toppings/{identityType}/stock`](#patch-disponibilidad-de-toppings-por-sku-o-id)               | Gestiona de forma asincrónica la disponibilidad de toppings por SKU o ID en la app de Rappi             |
| [`POST /v1/stores/{storeId}/toppings/{identityType}/stock/status`](#post-validar-disponibilidad-de-toppings-por-sku-o-id)  | Devuelve la disponibilidad de toppings por SKU o ID en la app de Rappi                                  |
| [`PATCH /v1/stores/{storeId}/items/{identityType}/stock`](#patch-disponibilidad-de-articulos-por-sku-o-id)                 | Gestiona de forma asincrónica la disponibilidad de productos y toppings por SKU o ID en la app de Rappi |
| [`POST /v1/stores/{storeId}/items/{identityType}/stock/status`](#post-validar-disponibilidad-de-articulos-por-sku-o-id)    | Devuelve la disponibilidad de productos y toppings por SKU o ID en la app de Rappi                      |

## PATCH Disponibilidad de productos por SKU o ID

Utilice este endpoint para habilitar o deshabilitar productos en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud a este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del Endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                    |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debe utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son ID de Rappi, y `SKU` si se utilizan identificadores de comerciante. |

### Ejemplo de solicitud

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`PATCH https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock`

Este es un ejemplo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

Esta tabla describe los atributos que requiere el `JSON` de su solicitud:

| Attributes    |                    | Required | Description                                                                                |
| ------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `available`   | _array of strings_ | `true`   | Listado de identificadores de productos, ya sean SKUs o Rappi IDs, a habilitar.            |
| `unavailable` | _array of strings_ | `true`   | Listado de identificadores de productos, ya sean SKUs o Rappi IDs, que se deshabilitarán . |

```curl
curl --location --request PATCH 'https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/products/RAPPI/stock' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "available": [
        "12346"
    ],
    "unavailable": []
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/products/RAPPI/stock");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("PATCH");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n    \"available\": [\n        \"123123\"\n    ],\n    \"unavailable\": [\n    ]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "PATCH",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/11111/products/SKU/stock",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  available: ["123123"],
  unavailable: [],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/products/SKU/stock"

payload = json.dumps({
  "available": [
    "123123"
  ],
  "unavailable": []
})
headers = {
  'x-authorization': 'Bearer YOUR_TOKEN',
  'Content-Type': 'application/json'
}

response = requests.request("PATCH", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/products/SKU/stock"
  method := "PATCH"

  payload := strings.NewReader(`{
    "available": [
        "123123"
    ],
    "unavailable": [
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Ejemplo de respuesta

Ejemplo de respuesta exitosa:

```json
{
  "message": "Your request has been accepted"
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object |          | Object Description                                       |
| --------------- | -------- | -------------------------------------------------------- |
| `message`       | _string_ | Muestra el mensaje de que la solicitud ha sido aceptada. |

## POST Validar disponibilidad de productos por SKU o ID

Utilice este endpoint para validar la disponibilidad de productos en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud con este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                  |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debes utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son Rappi ID, y `SKU` si se utilizan identificadores de comerciante. |

### Solicitud de muestra

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status`

Este es un ejemplo de la solicitud:

```json
{
  "products": ["123123"]
}
```

Esta tabla describe los atributos que requiere el `JSON` en el cuerpo de su solicitud:

| Attributes |                    | Required | Description                                                                     |
| ---------- | ------------------ | -------- | ------------------------------------------------------------------------------- |
| `products` | _array of strings_ | `true`   | Listado de identificadores de productos, ya sean SKUs o Rappi IDs, a habilitar. |

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "products": [
        "123456"
    ]
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("POST");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n\"products\":[\n\"123123\"\n]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  products: ["123123"],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status"

payload = json.dumps({
  "products": [
    "123123"
  ]
})
headers = {
  'x-authorization': 'Bearer <access_token>',
  'Content-Type': 'application/json'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/products/{identityType}/stock/status"
  method := "POST"

  payload := strings.NewReader(`{
    "products": [
        "123123"
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer <access_token>")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="ok-response">

`201` Solicitud aceptada

</aside>

<aside class="error-response">

`409` Conflicto

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Respuesta de muestra

Este es un ejemplo de respuesta:

Ejemplo de respuesta exitosa:

```json
[
  {
    "item_id": 123456,
    "item_sku": "",
    "item_type": "PRODUCT",
    "stock_out_state": "UNKNOWN"
  }
]
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object   |          | Object Description                                        |
| ----------------- | -------- | --------------------------------------------------------- |
| `item_id`         | _long_   | ID del artículo Rappi                                     |
| `item_sku`        | _string_ | Código del artículo.                                      |
| `item_type`       | _string_ | El tipo de artículo puede ser `PRODUCT` `TOPPING` `ITEM`. |
| `stock_out_state` | _string_ | Estado de stock del artículo.                             |

## PATCH Disponibilidad de toppings por SKU o ID

Utilice este endpoint para habilitar o deshabilitar toppings en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud a este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del Endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                    |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debe utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son ID de Rappi, y `SKU` si se utilizan identificadores de comerciante. |

### Ejemplo de solicitud

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`PATCH https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock`

Este es un ejemplo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

Esta tabla describe los atributos que requiere el `JSON` de su solicitud:

| Attributes    |                    | Required | Description                                                                               |
| ------------- | ------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `available`   | _array of strings_ | `true`   | Listado de identificadores de toppings, ya sean SKUs o Rappi IDs, a habilitar.            |
| `unavailable` | _array of strings_ | `true`   | Listado de identificadores de toppings, ya sean SKUs o Rappi IDs, que se deshabilitarán . |

```curl
curl --location --request PATCH 'https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/toppings/RAPPI/stock' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "available": [
        "12346"
    ],
    "unavailable": []
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/toppings/RAPPI/stock");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("PATCH");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n    \"available\": [\n        \"123123\"\n    ],\n    \"unavailable\": [\n    ]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "PATCH",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/11111/toppings/SKU/stock",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  available: ["123123"],
  unavailable: [],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/toppings/SKU/stock"

payload = json.dumps({
  "available": [
    "123123"
  ],
  "unavailable": []
})
headers = {
  'x-authorization': 'Bearer YOUR_TOKEN',
  'Content-Type': 'application/json'
}

response = requests.request("PATCH", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/toppings/SKU/stock"
  method := "PATCH"

  payload := strings.NewReader(`{
    "available": [
        "123123"
    ],
    "unavailable": [
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Ejemplo de respuesta

Ejemplo de respuesta exitosa:

```json
{
  "message": "Your request has been accepted"
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object |          | Object Description                                       |
| --------------- | -------- | -------------------------------------------------------- |
| `message`       | _string_ | Muestra el mensaje de que la solicitud ha sido aceptada. |

## POST Validar disponibilidad de toppings por SKU o ID

Utilice este endpoint para validar la disponibilidad de toppings en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud con este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                  |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debes utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son Rappi ID, y `SKU` si se utilizan identificadores de comerciante. |

### Solicitud de muestra

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status`

Este es un ejemplo de la solicitud:

```json
{
  "toppings": ["123123"]
}
```

Esta tabla describe los atributos que requiere el `JSON` en el cuerpo de su solicitud:

| Attributes |                    | Required | Description                                                                    |
| ---------- | ------------------ | -------- | ------------------------------------------------------------------------------ |
| `toppings` | _array of strings_ | `true`   | Listado de identificadores de toppings, ya sean SKUs o Rappi IDs, a habilitar. |

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "toppings": [
        "123456"
    ]
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("POST");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n\"toppings\":[\n\"123123\"\n]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  toppings: ["123123"],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status"

payload = json.dumps({
  "toppings": [
    "123123"
  ]
})
headers = {
  'x-authorization': 'Bearer <access_token>',
  'Content-Type': 'application/json'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/toppings/{identityType}/stock/status"
  method := "POST"

  payload := strings.NewReader(`{
    "toppings": [
        "123123"
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer <access_token>")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="ok-response">

`201` Solicitud aceptada

</aside>

<aside class="error-response">

`409` Conflicto

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Respuesta de muestra

Este es un ejemplo de respuesta:

Ejemplo de respuesta exitosa:

```json
[
  {
    "item_id": 123456,
    "item_sku": "",
    "item_type": "TOPPING",
    "stock_out_state": "UNKNOWN"
  }
]
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object   |          | Object Description                                        |
| ----------------- | -------- | --------------------------------------------------------- |
| `item_id`         | _long_   | ID del artículo Rappi                                     |
| `item_sku`        | _string_ | Código del artículo.                                      |
| `item_type`       | _string_ | El tipo de artículo puede ser `PRODUCT` `TOPPING` `ITEM`. |
| `stock_out_state` | _string_ | Estado de stock del artículo.                             |

## PATCH Disponibilidad de articulos por SKU o ID

Utilice este endpoint para habilitar o deshabilitar articulos en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud a este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del Endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                    |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debe utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son ID de Rappi, y `SKU` si se utilizan identificadores de comerciante. |

### Ejemplo de solicitud

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`PATCH https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock`

Este es un ejemplo de la solicitud:

```json
{
  "available": ["123123"],
  "unavailable": []
}
```

Esta tabla describe los atributos que requiere el `JSON` de su solicitud:

| Attributes    |                    | Required | Description                                                                                |
| ------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `available`   | _array of strings_ | `true`   | Listado de identificadores de articulos, ya sean SKUs o Rappi IDs, a habilitar.            |
| `unavailable` | _array of strings_ | `true`   | Listado de identificadores de articulos, ya sean SKUs o Rappi IDs, que se deshabilitarán . |

```curl
curl --location --request PATCH 'https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/items/RAPPI/stock' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "available": [
        "12346"
    ],
    "unavailable": []
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/items/RAPPI/stock");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("PATCH");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n    \"available\": [\n        \"123123\"\n    ],\n    \"unavailable\": [\n    ]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "PATCH",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/11111/items/SKU/stock",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  available: ["123123"],
  unavailable: [],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/items/SKU/stock"

payload = json.dumps({
  "available": [
    "123123"
  ],
  "unavailable": []
})
headers = {
  'x-authorization': 'Bearer YOUR_TOKEN',
  'Content-Type': 'application/json'
}

response = requests.request("PATCH", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/11111/items/SKU/stock"
  method := "PATCH"

  payload := strings.NewReader(`{
    "available": [
        "123123"
    ],
    "unavailable": [
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer YOUR_TOKEN")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Ejemplo de respuesta

Ejemplo de respuesta exitosa:

```json
{
  "message": "Your request has been accepted"
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object |          | Object Description                                       |
| --------------- | -------- | -------------------------------------------------------- |
| `message`       | _string_ | Muestra el mensaje de que la solicitud ha sido aceptada. |

## POST Validar disponibilidad de articulos por SKU o ID

Utilice este endpoint para validar la disponibilidad de articulos en masa para una tienda específica.

### Endpoint URL

Utilice esta URL para realizar una solicitud con este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status`

- `{NEW_DOMAIN}`: Este es tu dominio de país de Rappi. Consulta la lista de dominios de país. <a href="/es/api-reference/content/#nuevos-dominios" target="_blank">Consulta la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>Para los ejemplos de solicitudes de API en este sitio, usaremos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
  <p>El tipo de autenticación para los recursos es TOKEN, el tipo de token es 'Bearer', aquí hay un ejemplo de cómo se vería el encabezado: <code>'x-authorization: Bearer access_token'</code></p>
</aside>

### Propiedades del endpoint (Encabezados)

Este recurso tiene las siguientes propiedades:

| Header            | Value              |
| ----------------- | ------------------ |
| `Content-Type`    | _application/json_ |
| `x-authorization` | _access_token_     |

### Parametros

| Parameter      | Description                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storeId`      | Este es el identificador de la tienda en el lado de Rappi.                                                                                                                                                  |
| `identityType` | Los valores posibles son `RAPPI, SKU`; donde debes utilizar `RAPPI` si los identificadores utilizados para la activación/desactivación son Rappi ID, y `SKU` si se utilizan identificadores de comerciante. |

### Solicitud de muestra

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`POST https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status`

Este es un ejemplo de la solicitud:

```json
{
  "items": ["123123"]
}
```

Esta tabla describe los atributos que requiere el `JSON` en el cuerpo de su solicitud:

| Attributes |                    | Required | Description                                                                     |
| ---------- | ------------------ | -------- | ------------------------------------------------------------------------------- |
| `items`    | _array of strings_ | `true`   | Listado de identificadores de articulos, ya sean SKUs o Rappi IDs, a habilitar. |

```curl
curl --location 'https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status' \
--header 'Content-Type: application/json' \
--header 'x-authorization: Bearer <access_token>' \
--data
'{
    "items": [
        "123456"
    ]
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status");
HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();
httpConn.setRequestMethod("POST");

httpConn.setRequestProperty("x-authorization", "Bearer <access_token>");
httpConn.setRequestProperty("Content-Type", "application/json");

httpConn.setDoOutput(true);
OutputStreamWriter writer = new OutputStreamWriter(httpConn.getOutputStream());
writer.write("{\n\"items\":[\n\"123123\"\n]\n}");
writer.flush();
writer.close();
httpConn.getOutputStream().close();

InputStream responseStream = httpConn.getResponseCode() / 100 == 2
        ? httpConn.getInputStream()
        : httpConn.getErrorStream();
Scanner s = new Scanner(responseStream).useDelimiter("\\A");
String response = s.hasNext() ? s.next() : "";
System.out.println(response);
```

```javascript
var https = require("follow-redirects").https;
var fs = require("fs");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status",
  headers: {
    "x-authorization": "Bearer <access_token>",
    "Content-Type": "application/json",
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

var postData = JSON.stringify({
  items: ["123123"],
});

req.write(postData);

req.end();
```

```python
import requests
import json

url = "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status"

payload = json.dumps({
  "items": [
    "123123"
  ]
})
headers = {
  'x-authorization': 'Bearer <access_token>',
  'Content-Type': 'application/json'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)

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

  url := "https://api.dev.rappi.com/restaurants/menu/v1/stores/{storeId}/items/{identityType}/stock/status"
  method := "POST"

  payload := strings.NewReader(`{
    "items": [
        "123123"
    ]
}`)

  client := &http.Client {
  }
  req, err := http.NewRequest(method, url, payload)

  if err != nil {
    fmt.Println(err)
    return
  }
  req.Header.Add("x-authorization", "Bearer <access_token>")
  req.Header.Add("Content-Type", "application/json")

  res, err := client.Do(req)
  if err != nil {
    fmt.Println(err)
    return
  }
  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    fmt.Println(err)
    return
  }
  fmt.Println(string(body))
}
```

### Códigos de respuesta

Estos son los posibles códigos de respuesta para este endpoint:

<aside class="ok-response">

`200` Solicitud exitosa

</aside>

<aside class="ok-response">

`201` Solicitud aceptada

</aside>

<aside class="error-response">

`409` Conflicto

</aside>

<aside class="error-response">

`412` Condición previa fallida

</aside>

<aside class="error-response">

`424` Dependencia fallida

</aside>

### Respuesta de muestra

Este es un ejemplo de respuesta:

Ejemplo de respuesta exitosa:

```json
[
  {
    "item_id": 123456,
    "item_sku": "",
    "item_type": "ITEM",
    "stock_out_state": "UNKNOWN"
  }
]
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object   |          | Object Description                                        |
| ----------------- | -------- | --------------------------------------------------------- |
| `item_id`         | _long_   | ID del artículo Rappi                                     |
| `item_sku`        | _string_ | Código del artículo.                                      |
| `item_type`       | _string_ | El tipo de artículo puede ser `PRODUCT` `TOPPING` `ITEM`. |
| `stock_out_state` | _string_ | Estado de stock del artículo.                             |
