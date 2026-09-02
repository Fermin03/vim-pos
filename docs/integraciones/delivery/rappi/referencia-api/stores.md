
# Tiendas

Los recursos de Tiendas te permiten interactuar con tus tiendas.

La siguiente tabla describe los diferentes contenidos de los recursos de Tiendas:

| Recurso API                                                              | Descripción del endpoint                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`GET stores-pa`](#get-stores-pa)                                        | Regresa la lista de tiendas del aliado autenticado.                                |
| [`PUT stores-pa/{storeId}/status`](#put-store-pa-integrated-status)      | Actualiza una tienda a integrada o no integrada.                                   |
| [`GET stores-pa/{storeId}/check-in-code/`](#get-stores-pa-check-in-code) | Regresa el código de registro de una tienda perteneciente a un aliado autenticado. |
| [`GET /stores/integration-status`](#get-integration-status)              | Verifica qué tiendas están integradas y cuáles no (Self-Onboarding)                |
| [`POST /stores/provisioning`](#post-provisioning)                        | Aprovisiona tiendas para una integración en lote (Self-Onboarding)                 |
| [`POST /stores/deprovisioning`](#post-deprovisioning)                    | Desaprovisiona tiendas de una integración en lote (Self-Onboarding)                |

## GET stores-pa

Usa este endpoint para obtener las tiendas del aliado autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores-pa`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

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

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Success

</aside>

<aside class="error-response">

`401` Invalid credentials

</aside>

<aside class="error-response">

`404` App Client no encontrado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa");


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
  path: "/api/v2/restaurants-integrations-public-api/stores-pa",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa"

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa"
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

### Ejemplo de Respuesta "Success 200"

> Este es un ejemplo de la respuesta "Success 200":

```json
[
  {
    "integrationId": "111",
    "rappiId": "890982",
    "name": "Store 1"
  },
  {
    "integrationId": "222",
    "rappiId": "890983",
    "name": "Store 2"
  },
  {
    "integrationId": "333",
    "rappiId": "890983",
    "name": "Store 3"
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                       | Descripción                                          |
| ---------------------------- | ---------------------------------------------------- |
| `integrationId`<br/>_string_ | Identificador de la tienda en la aplicación de Rappi |
| `rappiId`<br/>_string_       | Identificador que Rappi asignó al aliado             |
| `name`<br/>_string_          | Nombre de la tienda en la aplicación de Rappi        |

### Ejemplo de Respuesta "Invalid credentials 401"

> Este es un ejemplo de la respuesta "Invalid credentials 401":

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "App Client no encontrado 404"

> Este es un ejemplo de la respuesta "App Client no encontrado 404":

```json
{
  "message": "Not found appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

## PUT store-pa integrated status

Usa este endpoint para cambiar una tienda a integrada o no integrada

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores-pa/{storeId}/status`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

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

Este endpoint tiene los siguientes parametros:

| Parámetro      | Descripción                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------- |
| `{storeId}`    | Path Param. Store Id del lado de rappi                                                      |
| `{integrated}` | Query Param. Indica si la tienda se actualiza a "integrada" (true) o "no integrada" (false) |

<aside class="notice">
  <p>NOTA</p>
  <p>Cuando la tienda se actualice a <b>"no integrada"</b> las ordenes van a ser recibidas por medio del portal de aliados y deberán ser aceptadas manualmente, excepto que configuren el AUTO ACCEPT desde el mismo portal.<br/>Cuando la tienda se actualice a <b>"integrada"</b> las ordenes serán recibidas a través de la integración</p>
</aside>

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Success

</aside>

<aside class="error-response">

`401` Invalid credentials

</aside>

<aside class="error-response">

`404` App Client no encontrado

</aside>

<aside class="error-response">

`400` Error al actualizar la store

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/12345/status?integrated=true`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/12345/status?integrated=true");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

try (BufferedReader br = new BufferedReader(
         new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
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
  method: "PUT",
  hostname: "api.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/stores-pa/12345/status?integrated=true",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/12345/status?integrated=true"

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/12345/status?integrated=true"
	method := "PUT"

	client := &http.Client {
	}
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

### Ejemplo de Respuesta "Success 200"

> Este es un ejemplo de la respuesta "Success 200" al pasar una tienda a integrada:

```json
{
  "message": "The store {storeid} was changed to integrated {true} successfully."
}
```

> Este es un ejemplo de la respuesta "Success 200" al pasar una tienda a no integrada:

```json
{
  "message": "The store {storeid} was changed to integrated {false} successfully. Please remember to login into the partners app and set the AUTO ACCEPT config"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                                     |
| ---------------------- | ----------------------------------------------- |
| `message`<br/>_string_ | Mensaje con la información del cambio realizado |

### Ejemplo de Respuesta "Invalid credentials 401"

> Este es un ejemplo de la respuesta "Invalid credentials 401":

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "App Client no encontrado 404"

> Este es un ejemplo de la respuesta "App Client no encontrado 404":

```json
{
  "message": "Not found appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

> Este es un ejemplo de la respuesta "Error al actualizar la store 400":

```json
{
  "message": "There was an error trying to change the store {storeId} to integrated: {true|false}. Please contact support team"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

## GET store current menu

Usa este endpoint para obtener el menú actual de la tienda.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/store/{STORE_ID}/menu/current`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

`{STORE_ID}`: Este es el identificador de la tienda del lado de Rappi.

<aside class="notice">
   <p>NOTA</p>
   <p>Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                 |        |     |
| ------------------------------- | ------ | --- |
| Formato de respuesta            | `JSON` |     |
| Requerimientos de autenticación | Token  |     |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
Success

</aside>
<aside class="error-response">

`401`
Invalid credentials

</aside>
<aside class="error-response">

`404`
App Client no encontrado

</aside>
<aside class="error-response">

`400`
La tienda no pertenece al App Client

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://internal-api.dev.rappi.com/api/v2/restaurants-integrations-public-api/store/900111941/menu/current`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://internal-api.dev.rappi.com/api/v2/restaurants-integrations-public-api/store/YOU_STORE/menu/current");



HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("GET");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");

try (BufferedReader br = new BufferedReader(
         new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
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
  path: "/api/v2/restaurants-integrations-public-api/store/YOU_STORE/menu/current",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/store/YOU_STORE/menu/current"

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/store/YOU_STORE/menu/current"
	method := "GET"

	client := &http.Client {
	}
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

### Ejemplo de Respuesta "Success 200"

> Este es un ejemplo de la respuesta "Success 200":

```json
[
  {
    "storeId": "900111941",
    "products": [
      {
        "id": "2135501578",
        "name": "2 por 19,90",
        "price": 52.9,
        "partnerSku": null,
        "active": null,
        "toppings": [
          {
            "id": "340825698",
            "name": "Batata Grande",
            "price": 6.9,
            "partnerSku": null,
            "active": null,
            "category": {
              "id": "1247164425",
              "name": "Deseja Acompanhamento?"
            }
          },
          {
            "id": "340825699",
            "name": "Pepsi 350ml",
            "price": 6.9,
            "partnerSku": null,
            "active": null,
            "category": {
              "id": "1247164426",
              "name": "Deseja Bebida?"
            }
          }
        ]
      },
      {
        "id": "2135501683",
        "name": "4 Sanduíches por R$ 29,80!",
        "price": 43.6,
        "partnerSku": null,
        "active": null,
        "toppings": [
          {
            "id": "340827238",
            "name": "Rodeio",
            "price": 0,
            "partnerSku": null,
            "active": null,
            "category": {
              "id": "1247164714",
              "name": "Escolha seu 1º sanduíche:"
            }
          }
        ]
      }
    ]
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                                        | Descripción                                  |
| --------------------------------------------- | -------------------------------------------- |
| `storeId`<br>_string_                         | Identificador de la tienda del lado de Rappi |
| `products`<br>_array of objects_              | Lista de productos de la tienda              |
| `products.id`<br>_string_                     | Identificador del producto del lado de Rappi |
| `products.name`<br>_string_                   | Nombre del producto                          |
| `products.price`<br>_integer_                 | Precio del producto                          |
| `products.toppings`<br>_array of objects_     | Lista de Toppings del producto               |
| `products.toppings.id`<br>_string_            | Identificador del topping del lado de Rappi  |
| `products.toppings.name`<br>_string_          | Nombre del topping                           |
| `products.toppings.price`<br>_integer_        | Precio del topping                           |
| `products.toppings.category`<br>_objects_     | Categoría del topping                        |
| `products.toppings.category.id`<br>_string_   | Identificador de la categoría del topping    |
| `products.toppings.category.name`<br>_string_ | Nombre de la categoría del topping           |

### Ejemplo de Respuesta "Invalid credentials 401"

> Este es un ejemplo de la respuesta "Invalid credentials 401":

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                | Descripción                   |
| --------------------- | ----------------------------- |
| `message`<br>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "App Client no encontrado 404"

> Este es un ejemplo de la respuesta "App Client no encontrado 404":

```json
{
  "message": "Not found appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                | Descripción                   |
| --------------------- | ----------------------------- |
| `message`<br>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "La tienda no pertenece al App Client 400"

> Este es un ejemplo de la respuesta "La tienda no pertenece al App Client 400":

```json
{
  "message": "The stores {storeId} don't belong to the appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                | Descripción                   |
| --------------------- | ----------------------------- |
| `message`<br>_string_ | Mensaje descriptivo del error |

## GET stores-pa check in code

Usa este endpoint para obtener el código de registro de una tienda del aliado autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores-pa/{storeId}/check-in-code`

`{COUNTRY_DOMAIN}`: Este es tu Dominio por País de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de Dominios por país.</a>

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

Este endpoint tiene el siguiente parámetro:

| Parámetro   | Descripción                              |
| ----------- | ---------------------------------------- |
| `{storeId}` | Path Param. Store Id del aliado de rappi |

### Códigos de respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200` Success

</aside>

<aside class="error-response">

`400` La tienda consultada no pertenece al App Client

</aside>

<aside class="error-response">

`401` Invalid credentials

</aside>

<aside class="error-response">

`404` App Client no encontrado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/900105433/check-in-code`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/900105433/check-in-code");

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
  path: "/api/v2/restaurants-integrations-public-api/stores-pa/900105433/check-in-code",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/900105433/check-in-code"

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores-pa/900105433/check-in-code"
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

### Ejemplo de Respuesta "Success 200"

> Este es un ejemplo de la respuesta "Success 200":

```json
{
  "store_id": 900105433,
  "code": "8733",
  "expired_at": "2023-01-25 16:26:35",
  "created_at": "2023-01-23 13:51:06",
  "updated_at": "2023-01-24 16:26:35"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                    | Descripción                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| `store_id`<br/>_int_      | Identificador de la tienda en la aplicación de Rappi                  |
| `code`<br/>_string_       | Código de registro de la tienda que asigna Rappi                      |
| `expired_at`<br/>_string_ | Fecha de expiración del código de registro asignado para la tienda    |
| `created_at`<br/>_string_ | Fecha de creación del código de registro asignado para la tienda      |
| `updated_at`<br/>_string_ | Fecha de actualización del código de registro asignado para la tienda |

### Ejemplo de Respuesta "La tienda consultada no pertenece al App Client 400"

> Este es un ejemplo de la respuesta "La tienda consultada no pertenece al App Client 400":

```json
{
  "message": "The stores {store_id} don't belong to the appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "Invalid credentials 401"

> Este es un ejemplo de la respuesta "Invalid credentials 401":

```json
{
  "message": "Access is denied"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "App Client no encontrado 404"

> Este es un ejemplo de la respuesta "App Client no encontrado 404":

```json
{
  "message": "Not found appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

## GET integration-status

Utilice este endpoint para verificar qué tiendas ya están integradas y cuáles no. Los IDs de tienda se obtienen automáticamente del email contenido en el JWT del merchant — no se requiere cuerpo en la solicitud.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores/integration-status`

`{COUNTRY_DOMAIN}`: Es su dominio de país de Rappi. <a href="/es/api-reference/content/#domains" target="_blank">Ver la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>En los ejemplos de solicitudes de API de este sitio, utilizamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | `JSON` |
| Autenticación requerida     | Bearer integrator JWT (`X-Authorization`) + Bearer merchant id_token (`Authorization-Partners`) |

### Parámetros

| Header | Requerido | Descripción |
| ------ | --------- | ----------- |
| `X-Authorization` | `requerido` | `Bearer <integrator JWT>` — token M2M emitido por Auth0 |
| `Authorization-Partners` | `requerido` | `Bearer <merchant id_token>` — id_token OIDC emitido por Auth0 (no el `access_token`); el email se extrae internamente para identificar las tiendas del merchant |

### Códigos de Estado

<aside class="ok-response">

`200` Exitoso

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

### Ejemplo de Solicitud

`GET https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores/integration-status`



### Ejemplo de Respuesta "Exitoso 200"

> Este es un ejemplo de la respuesta "Exitoso 200":

```json
{
  "stores": [
    {
      "store_id": "1",
      "name": "Your Brand Main",
      "brand": "YourBrand",
      "integrated": true,
      "integration_id": "your-integration-id",
      "children": [
        { "store_id": "3", "name": "Child Store 3", "brand": "YourBrand", "integrated": true, "integration_id": "your-integration-id" },
        { "store_id": "4", "name": "Child Store 4", "brand": "YourBrand", "integrated": false }
      ]
    },
    {
      "store_id": "2",
      "name": "Your Brand Secondary",
      "brand": "YourBrand",
      "integrated": true,
      "integration_id": "your-integration-id",
      "children": []
    },
    {
      "store_id": "10",
      "name": "Sertester1",
      "brand": "YourBrand",
      "integrated": false,
      "children": [
        { "store_id": "20", "name": "Sertester1 Child 1", "brand": "YourBrand", "integrated": false },
        { "store_id": "21", "name": "Sertester1 Child 2", "brand": "YourBrand", "integrated": false }
      ]
    },
    {
      "store_id": "11",
      "name": "FIFOUno",
      "brand": "YourBrand",
      "integrated": false,
      "children": []
    }
  ]
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Objeto | Descripción |
| ------ | ----------- |
| `stores`<br/>_array de objetos_ | Todas las tiendas padre del merchant (integradas y no integradas). Las tiendas hijas aparecen anidadas en `children`, no en el nivel superior. |
| `stores[].store_id`<br/>_string_ | ID de la tienda Rappi |
| `stores[].name`<br/>_string_ | Nombre de la tienda |
| `stores[].brand`<br/>_string_ | Nombre de marca resuelto desde Portal Partners |
| `stores[].integrated`<br/>_boolean_ | `true` si la tienda está actualmente integrada; `false` en caso contrario |
| `stores[].integration_id`<br/>_string_ | Identificador de la integración bajo la cual está provisionada la tienda. **Solo presente cuando `integrated` es `true`.** |
| `stores[].children`<br/>_array de objetos_ | Tiendas hijas pertenecientes a este padre. Siempre presente (array vacío si no hay ninguna). |
| `stores[].children[].store_id`<br/>_string_ | ID de la tienda hija |
| `stores[].children[].name`<br/>_string_ | Nombre de la tienda hija |
| `stores[].children[].brand`<br/>_string_ | Nombre de marca de la tienda hija |
| `stores[].children[].integrated`<br/>_boolean_ | `true` si la tienda hija está actualmente integrada; `false` en caso contrario |
| `stores[].children[].integration_id`<br/>_string_ | Identificador de la integración. **Solo presente cuando `integrated` es `true`.** |

### Ejemplo de Respuesta "No autorizado 401"

> Este es un ejemplo de la respuesta "No autorizado 401":

```json
{
  "message": "Not a valid token"
}
```

| Objeto | Descripción |
| ------ | ----------- |
| `message`<br/>_string_ | Mensaje de error descriptivo |

## POST provisioning

Utilice este endpoint para aprovisionar tiendas en una integración POS en lote. Esta operación es asincrónica — la API devuelve `202 Accepted` de inmediato. El resultado se entrega vía el webhook <a href="/es/webhook-events#store-provisioning-status" target="_blank">`STORE_PROVISIONING_STATUS`</a>.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores/provisioning`

`{COUNTRY_DOMAIN}`: Es su dominio de país de Rappi. <a href="/es/api-reference/content/#domains" target="_blank">Ver la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>En los ejemplos de solicitudes de API de este sitio, utilizamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | `JSON` |
| Autenticación requerida     | Bearer integrator JWT (`X-Authorization`) + Bearer merchant id_token (`Authorization-Partners`) |

### Parámetros

| Header | Requerido | Descripción |
| ------ | --------- | ----------- |
| `X-Authorization` | `requerido` | `Bearer <integrator JWT>` — token M2M emitido por Auth0 |
| `Authorization-Partners` | `requerido` | `Bearer <merchant id_token>` — id_token OIDC emitido por Auth0 (no el `access_token`) |

### Cuerpo de la Solicitud

| Atributo | Requerido | Descripción |
| -------- | --------- | ----------- |
| `stores`<br/>_array de objetos_ | `requerido` | Lista de tiendas a aprovisionar. Máximo 20 por solicitud. Cada tienda se aprovisiona como padre independiente — no se crea ninguna jerarquía padre/hijo. |
| `stores[].store_id`<br/>_string_ | `requerido` | ID de la tienda Rappi a aprovisionar. Si la tienda actualmente es hija en Partners, se promoverá automáticamente a padre independiente antes del aprovisionamiento (best-effort). |
| `stores[].name`<br/>_string_ | `requerido` | Nombre de la tienda. Se usa para identificar la tienda en la integración. |
| `stores[].status`<br/>_string_ | `opcional` | Estado operacional de la tienda. Valores permitidos: `ACTIVE`, `INACTIVE`. Por defecto es `ACTIVE` si se omite. |
| `stores[].ping_active`<br/>_boolean_ | `opcional` | Si la tienda debe recibir health checks de ping. Por defecto `false`. |
| `stores[].get_menu_active`<br/>_boolean_ | `opcional` | Si la tienda debe recibir solicitudes de pull de menú. Por defecto `false`. |
| `stores[].cancellation_events`<br/>_boolean_ | `opcional` | Si la tienda debe recibir eventos de cancelación de órdenes. Por defecto `false`. |
| `stores[].store_integration_id`<br/>_string_ | `opcional` | Tu identificador interno de la tienda (Store ID at POS). Úsalo para mapear la tienda Rappi a tu propio sistema. Si no se proporciona, usa el `store_id` de Rappi por defecto. |

### Códigos de Estado

<aside class="ok-response">

`202` Aceptado — aprovisionamiento iniciado

</aside>

<aside class="error-response">

`400` Solicitud inválida

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

<aside class="error-response">

`422` Unprocessable Entity — todas las tiendas fueron rechazadas (ninguna pertenece al merchant)

</aside>

### Ejemplo de Solicitud

`POST https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores/provisioning`



> Este es un ejemplo de la solicitud:

```json
{
  "stores": [
    {
      "store_id": "900171885",
      "name": "Tu Marca Principal",
      "status": "ACTIVE",
      "ping_active": true,
      "get_menu_active": false,
      "cancellation_events": false,
      "store_integration_id": "POS-MAIN-001"
    },
    {
      "store_id": "900171886",
      "name": "Tu Marca - Sucursal A",
      "status": "ACTIVE",
      "ping_active": true,
      "store_integration_id": "POS-LOC-A"
    },
    {
      "store_id": "900171887",
      "name": "Tu Marca - Sucursal B",
      "status": "INACTIVE"
    }
  ]
}
```

### Ejemplo de Respuesta "Aceptado 202"

> Este es un ejemplo de la respuesta "Aceptado 202":

```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "accepted": [
    { "store_id": "900171885", "integration_id": "your-integration-id" },
    { "store_id": "900171886", "integration_id": "your-integration-id" }
  ],
  "rejected": [
    { "store_id": "900171887", "reason": "not_owned" }
  ]
}
```

| Objeto | Descripción |
| ------ | ----------- |
| `batch_id`<br/>_string_ | Identificador único de la operación en lote. Referenciado en el webhook `STORE_PROVISIONING_STATUS`. |
| `accepted`<br/>_array de objetos_ | Tiendas aceptadas para aprovisionamiento. Cada tienda quedará como padre independiente. |
| `accepted[].store_id`<br/>_string_ | ID de la tienda Rappi |
| `accepted[].integration_id`<br/>_string_ | Identificador de la integración |
| `rejected`<br/>_array de objetos_ | Tiendas rechazadas y no aprovisionadas |
| `rejected[].store_id`<br/>_string_ | ID de la tienda Rappi |
| `rejected[].reason`<br/>_string_ | Motivo del rechazo: `not_owned`, `invalid_integration_id`, `missing_name`, `invalid_status` |

### Ejemplo de Respuesta "No autorizado 401"

> Este es un ejemplo de la respuesta "No autorizado 401":

```json
{
  "message": "Not a valid token"
}
```

| Objeto | Descripción |
| ------ | ----------- |
| `message`<br/>_string_ | Mensaje de error descriptivo |

## POST deprovisioning

Utilice este endpoint para desaprovisionar tiendas de una integración POS en lote. Esta operación es asincrónica — la API devuelve `202 Accepted` de inmediato. El resultado se entrega vía el webhook <a href="/es/webhook-events#store-provisioning-status" target="_blank">`STORE_PROVISIONING_STATUS`</a> con `operation: DEPROVISION` y `status: INACTIVE` por tienda.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/stores/deprovisioning`

`{COUNTRY_DOMAIN}`: Es su dominio de país de Rappi. <a href="/es/api-reference/content/#domains" target="_blank">Ver la lista de dominios de país.</a>

<aside class="notice">
  <p>NOTA</p>
  <p>En los ejemplos de solicitudes de API de este sitio, utilizamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | `JSON` |
| Autenticación requerida     | Bearer integrator JWT (`X-Authorization`) + Bearer merchant id_token (`Authorization-Partners`) |

### Parámetros

| Header | Requerido | Descripción |
| ------ | --------- | ----------- |
| `X-Authorization` | `requerido` | `Bearer <integrator JWT>` — token M2M emitido por Auth0 |
| `Authorization-Partners` | `requerido` | `Bearer <merchant id_token>` — id_token OIDC emitido por Auth0 (no el `access_token`) |

### Cuerpo de la Solicitud

| Atributo | Requerido | Descripción |
| -------- | --------- | ----------- |
| `stores`<br/>_array de objetos_ | `requerido` | Lista de tiendas a desaprovisionar. Máximo 20 por solicitud. |
| `stores[].store_id`<br/>_string_ | `requerido` | ID de la tienda Rappi a desaprovisionar |

### Códigos de Estado

<aside class="ok-response">

`202` Aceptado — desaprovisionamiento iniciado

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

<aside class="error-response">

`422` Unprocessable Entity — todas las tiendas fueron rechazadas (ninguna pertenece al merchant)

</aside>

### Ejemplo de Solicitud

`POST https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/stores/deprovisioning`



> Este es un ejemplo de la solicitud:

```json
{
  "stores": [
    { "store_id": "10" }
  ]
}
```

### Ejemplo de Respuesta "Aceptado 202"

> Este es un ejemplo de la respuesta "Aceptado 202":

```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "accepted": [
    { "store_id": "10", "integration_id": "your-integration-id" }
  ],
  "rejected": [
    {
      "store_id": "5",
      "reason": "has_integrated_children",
      "integrated_children": ["50", "51"]
    }
  ]
}
```

| Objeto | Descripción |
| ------ | ----------- |
| `batch_id`<br/>_string_ | Identificador único de la operación en lote. Referenciado en el webhook `STORE_PROVISIONING_STATUS`. |
| `accepted`<br/>_array de objetos_ | Tiendas aceptadas para desaprovisionamiento |
| `accepted[].store_id`<br/>_string_ | ID de la tienda Rappi |
| `accepted[].integration_id`<br/>_string_ | Identificador de la integración |
| `rejected`<br/>_array de objetos_ | Tiendas rechazadas y no desaprovisionadas |
| `rejected[].store_id`<br/>_string_ | ID de la tienda Rappi |
| `rejected[].reason`<br/>_string_ | Motivo del rechazo: `not_owned`, `not_integrated`, `has_integrated_children` |
| `rejected[].integrated_children`<br/>_array de strings_ | Presente solo cuando `reason` es `has_integrated_children`. Lista los IDs de tiendas hijas que deben desaprovisionarse primero. |

### Ejemplo de Respuesta "No autorizado 401"

> Este es un ejemplo de la respuesta "No autorizado 401":

```json
{
  "message": "Not a valid token"
}
```

| Objeto | Descripción |
| ------ | ----------- |
| `message`<br/>_string_ | Mensaje de error descriptivo |
