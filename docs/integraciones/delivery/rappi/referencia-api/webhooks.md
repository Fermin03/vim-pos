
# Webhooks

Usa estos recursos para controlar los Webhooks configurados en tus tiendas.

La siguiente tabla describe los diferentes contenidos de los recursos de Webhooks:

| Recurso                                                           | Descripción del Endpoint                                                       |     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | --- |
| [`GET webhook/{event}`](#get-webhook)                             | Regresa los Webhooks configurados de todas las tiendas del cliente autenticado |
| [`PUT webhook/{event}/add-stores`](#put-webhook-agregar-stores)   | Agrega tiendas al evento del webhook especificado                              |
| [`PUT webhook/{event}/change-url`](#put-webhook-cambiar-url)      | Cambia la url para una lista de tiendas                                        |
| [`POST webhook`](#post-webhook)                                   | Crea un nuevo Webhook para una lista de tiendas del cliente autenticado        |
| [`DELETE webhook/{event}/remove-stores`](#delete-webhook)         | Elimina stores del webhook especificado                                        |
| [`PUT webhook/{event}/reset-secret`](#put-webhook-reset-secret)   | Reinicia el _secret_ y genera uno nuevo al cliente autenticado                 |
| [`PUT webhook/{event}/change-status`](#put-webhook-change-status) | Habilita o deshabilita Webhooks para una lista de tiendas                      |
| [`POST /clients/{clientId}/webhooks`](#post-integration-webhook) | Configura un webhook para una integración (Self-Onboarding)           |
| [`DELETE /clients/{clientId}/webhooks`](#delete-integration-webhook) | Elimina la configuración de webhook de una integración            |
| [`GET /clients/{clientId}/webhooks`](#get-integration-webhooks) | Lista todas las configuraciones de webhook de una integración          |

## GET webhook

Usa este endpoint para obtener los Webhooks configurados para tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{EVENT}`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento y es opcional <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://api.dev.rappi.com
</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`GET https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook");

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
  path: "/api/v2/restaurants-integrations-public-api/webhook",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook"

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook"
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

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                 |         |     |
| ------------------------------- | ------- | --- |
| Formato de respuesta            | `JSON`  |
| Requerimientos de autenticación | `Token` |

### Parámetros

| Parámetro           | Requerimiento | Descripción                                           |
| ------------------- | ------------- | ----------------------------------------------------- |
| `EVENT`<br>_string_ | `opcional`    | Regresa únicamente el detalle del evento especificado |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`401`
Credenciales Inválidas

</aside>
<aside class="error-response">

`406`
Evento invalido

</aside>

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
[
  {
    "event": "event_1",
    "stores": [
      {
        "store_id": "1000",
        "url": "http://testUrl/one",
        "state": "ENABLE"
      },
      {
        "store_id": "10001",
        "url": "http://testUrl/one",
        "state": "ENABLE"
      }
    ]
  },
  {
    "event": "event_2",
    "stores": [
      {
        "store_id": "1000",
        "url": "http://testUrl/one",
        "state": "ENABLE"
      }
    ]
  }
]
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta | Descripción del objeto                                         |
| ---------------------- | -------------------------------------------------------------- |
| `event`<br>_string_    | Nombre del evento que dispara el webhook.                      |
| `stores`<br>_string_   | Lista de las tiendas donde se dispara el evento.               |
| `store_id`<br>_string_ | Id de la tienda que dispara el evento                          |
| `url`<br>_string_      | URL a la que se comunica el webhook.                           |
| `state`<br>_string_    | Estado del webhook. Opciones disponibles: `ENABLE` o `DISABLE` |

## PUT webhook - Agregar Stores

Usa este endpoint para agregar tiendas a un webhook configurado por el cliente autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{EVENT}/add-stores`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://microservices.dev.
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

| Parámetro           | Requerimiento | Descripción                                   |
| ------------------- | ------------- | --------------------------------------------- |
| `event`<br>_string_ | `requerido`   | El nombre del evento del webhook a actualizar |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`400`
Lista de tiendas inválida para el cliente autenticado

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`406`
evento inválido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/add-stores`

> Este es un ejemplo de la llamada:

```json
[
  {
    "url": "http://testDomain/webhook/data",
    "stores": ["1000", "1001"]
  }
]
```

>

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/add-stores");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "[{\n" +
         "   \"url\":\"http://testDomain/webhook/data\",\n" +
         "   \"stores\":[\n" +
         "      \"1000\",\n" +
         "      \"1001\"\n" +
         "   ]\n" +
         "}]";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

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
  path: "/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/add-stores",
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
    url: "http://testDomain/webhook/data",
    stores: ["1000", "1001"],
  },
]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/add-stores"

payload = "[{\n" \
            "   \"url\":\"http://testDomain/webhook/data\",\n" \
            "   \"stores\":[\n" \
            "      \"1000\",\n" \
            "      \"1001\"\n" \
            "   ]\n" \
            "}]"
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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/add-stores"
	method := "PUT"

	payload := strings.NewReader("[{\n" +
		"   \"url\":\"http://testDomain/webhook/data\",\n" +
		"   \"stores\":[\n" +
		"      \"1000\",\n" +
		"      \"1001\"\n" +
		"   ]\n" +
		"}]")

	client := &http.Client {
	}
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

| Atributos                      | Requerimiento | Descripción                                      |
| ------------------------------ | ------------- | ------------------------------------------------ |
| `url`<br>_string_              | `opcional`    | URL a la que se comunica el webhook.             |
| `stores`<br>_array of strings_ | `opcional`    | Lista de las tiendas donde se dispara el evento. |

### Respuesta de ejemplo

> Este es un ejemplo de la respuesta:

```json
{
  "event": "NEW_ORDER",
  "stores": [
    {
      "store_id": "1000",
      "url": "http://testDomain/webhook/data",
      "state": "ENABLE"
    }
  ]
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta | Descripción del objeto                                         |
| ---------------------- | -------------------------------------------------------------- |
| `event`<br>_string_    | Nombre del evento que dispara el webhook.                      |
| `stores`<br>_string_   | Lista de las tiendas donde se dispara el evento.               |
| `store_id`<br>_string_ | Id de la tienda que dispara el evento                          |
| `url`<br>_string_      | URL a la que se comunica el webhook.                           |
| `state`<br>_string_    | Estado del webhook. Opciones disponibles: `ENABLE` o `DISABLE` |

## PUT webhook - Cambiar Url

Usa este endpoint para agregar tiendas a un webhook configurado por el cliente autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{event}/change-url`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://microservices.dev.
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

| Parámetro           | Requerimiento | Descripción                                   |
| ------------------- | ------------- | --------------------------------------------- |
| `event`<br>_string_ | `requerido`   | El nombre del evento del webhook a actualizar |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`400`
Lista de tiendas inválida para el cliente autenticado

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`406`
Evento invalido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-url`

> Este es un ejemplo de la llamada:

```json
{
  "url": "http://testDomain/webhook/data",
  "stores": ["1000", "1001"]
}
```

>

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-url");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
         "   \"url\":\"http://testDomain/webhook/data\",\n" +
         "   \"stores\":[\n" +
         "      \"1000\",\n" +
         "      \"1001\"\n" +
         "   ]\n" +
         "}";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

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
  path: "/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-url",
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
  url: "http://testDomain/webhook/data",
  stores: ["1000", "1001"],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-url"

payload = "{\n" \
            "   \"url\":\"http://testDomain/webhook/data\",\n" \
            "   \"stores\":[\n" \
            "      \"1000\",\n" \
            "      \"1001\"\n" \
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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-url"
	method := "PUT"

	payload := strings.NewReader("{\n" +
		"   \"url\":\"http://testDomain/webhook/data\",\n" +
		"   \"stores\":[\n" +
		"      \"1000\",\n" +
		"      \"1001\"\n" +
		"   ]\n" +
		"}")

	client := &http.Client {
	}
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

| Atributos                      | Requerimiento | Descripción                                      |
| ------------------------------ | ------------- | ------------------------------------------------ |
| `url`<br>_string_              | `requerido`   | URL a la que se comunica el webhook.             |
| `stores`<br>_array of strings_ | `requerido`   | Lista de las tiendas donde se dispara el evento. |

### Respuesta de ejemplo

> Este es un ejemplo de la respuesta:

```json
{
  "event": "NEW_ORDER",
  "stores": [
    {
      "store_id": "1000",
      "url": "http://testDomain/webhook/data",
      "state": "ENABLE"
    }
  ]
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta        | Descripción del objeto                                         |
| ----------------------------- | -------------------------------------------------------------- |
| `event`<br>_string_           | Nombre del evento que dispara el webhook.                      |
| `stores`<br>_array of Stores_ | Lista de las tiendas donde se dispara el evento.               |
| `store_id`<br>_string_        | Id de la tienda que dispara el evento                          |
| `url`<br>_string_             | URL a la que se comunica el webhook.                           |
| `state`<br>_string_           | Estado del webhook. Opciones disponibles: `ENABLE` o `DISABLE` |

## POST webhook

Usa este endpoint para crear un webhook para tus tiendas.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook`

`{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="../../es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país.</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollador: https://api.dev.rappi.com
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`400`
Lista de tiendas inválidas para el cliente autenticado

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`406`
Evento invalido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`POST https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook`

> Este es un ejemplo de la llamada:

```json
{
  "event": "test_event",
  "data": [
    {
      "url": "http://testDomain/webhook/data",
      "stores": ["1000", "1001"]
    }
  ]
}
```

>

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
            "   \"event\":\"test_event\",\n" +
            "   \"data\": [ {" +
            "      \"url\":\"http://testDomain/webhook/data\",\n" +
            "      \"stores\":[\n" +
            "          \"1000\",\n" +
            "          \"1001\"\n" +
            "      ]\n" +
            "    } ]" +
            "}";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

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
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/webhook",
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
  event: "test_event",
  data: [
    {
      url: "http://testDomain/webhook/data",
      stores: ["1000", "1001"],
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook"

payload = "{\n" +
          "   \"event\":\"test_event\",\n" +
          "   \"data\": [ {" +
          "      \"url\":\"http://testDomain/webhook/data\",\n" +
          "      \"stores\":[\n" +
          "          \"1000\",\n" +
          "          \"1001\"\n" +
          "      ]\n" +
          "    } ]" +
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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook"
	method := "POST"

	payload := strings.NewReader("{\n" +
               "   \"event\":\"test_event\",\n" +
               "   \"data\": [ {" +
               "      \"url\":\"http://testDomain/webhook/data\",\n" +
               "      \"stores\":[\n" +
               "          \"1000\",\n" +
               "          \"1001\"\n" +
               "      ]\n" +
               "    } ]" +
               "}")

	client := &http.Client {
	}
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

| Atributo                       | Requerimiento | Descripción                                                                                                                        |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `event`<br>_string_            | `requerido`   | Nombre del evento que dispara el webhook.                                                                                          |
| `data`<br>_array of Object_    | `requerido`   | Contiene los atributos del webhook a configurar                                                                                    |
| `url`<br>_string_              | `requerido`   | URL a la que se comunica el webhook.                                                                                               |
| `stores`<br>_array of strings_ | `opcional`    | Lista de las tiendas donde se dispara el evento. Si no envías este atributo, se aplica a todas las tiendas el cliente autenticado. |

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "event": "test_1",
  "stores": [
    {
      "url": "https://localhost:8080/test",
      "store_id": "1000",
      "state": "ENABLE"
    },
    {
      "url": "https://localhost:8080/test",
      "store_id": "1001",
      "state": "ENABLE"
    }
  ],
  "secret": "TEST_SECRET"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta         | Descripción del objeto                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| `event`<br>_string_            | Nombre del evento que dispara el webhook.                             |
| `stores`<br>_array of strings_ | Lista de las tiendas donde se dispara el evento.                      |
| `url`<br>_string_              | URL a la que se comunica el webhook.                                  |
| `store_id`<br>_string_         | Id de la tienda que dispara el evento                                 |
| `state`<br>_string_            | Estado del webhook. Opciones disponibles: `ENABLE` o `DISABLE`        |
| `secret`<br>_string_           | _Secret Key_ para crear la firma de seguridad de cada evento webhook. |

## DELETE webhook

Usa este endpoint para eliminar tiendas de un webhook.

### URL del Endpoint

Usa esta URL para hacer llamadas con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{EVENT}/remove-stores`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://api.dev.rappi.com
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

| Parámetro           | Requerimiento | Descripción                                   |
| ------------------- | ------------- | --------------------------------------------- |
| `event`<br>_string_ | `requerido`   | El nombre del evento del webhook a actualizar |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`404`
Lista de tiendas inválidas para el cliente autenticado

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`DELETE https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/remove-stores`

> Este es un ejemplo de la llamada:

```json
{
  "stores": ["1000"]
}
```

>

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/remove-stores");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
         "   \"stores\":[\n" +
         "      \"1000\"\n" +
         "   ]\n" +
         "}";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

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
  method: "DELETE",
  hostname: "api.dev.rappi.com",
  path: "/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/remove-stores",
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
  stores: ["1000"],
});

req.setHeader("Content-Length", postData.length);

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/remove-stores"

payload = "{\n" \
         "   \"stores\":[\n" \
         "      \"1000\"\n" \
         "   ]\n" \
         "}"
headers = {
   'Content-Type': 'application/json',
   'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("DELETE", url, headers=headers, data=payload)

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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/remove-stores"
	method := "DELETE"

	payload := strings.NewReader("{\n" +
		"   \"stores\":[\n" +
		"      \"1000\"\n" +
		"   ]\n" +
		"}")

	client := &http.Client {
	}
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

| Atributos                      | Requerimiento | Descripción                                        |
| ------------------------------ | ------------- | -------------------------------------------------- |
| `stores`<br>_array of strings_ | `opcional`    | Lista de las tiendas donde se eliminará el webhook |

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "stores": ["1000"],
  "message": "Store settings removed successfully."
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta         | Descripción del objeto                           |
| ------------------------------ | ------------------------------------------------ |
| `stores`<br>_array of strings_ | Lista de las tiendas donde se dispara el evento. |
| `message`<br>_string_          | Mensaje del resultado de la llamada.             |

## PUT webhook reset secret

Usa este endpoint para reiniciar el _secret_ y crear uno nuevo para el aliado autenticado.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{EVENT}/reset-secret`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://api.dev.rappi.com
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

| Parámetro           | Requerimiento | Descripción                                   |
| ------------------- | ------------- | --------------------------------------------- |
| `event`<br>_string_ | `requerido`   | El nombre del evento del webhook a actualizar |

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`406`
Evento invalido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/reset-secret`

> Este es un ejemplo de la llamada:

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/reset-secret");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

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
  path: "/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/reset-secret",
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

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/reset-secret"

headers = {
   'Content-Type': 'application/json',
   'x-authorization': 'Bearer YOUR_TOKEN'
}

response = requests.request("PUT", url, headers=headers)

print(response.text.encode('utf8'))
```

```go
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
)

func main() {

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/reset-secret"
	method := "PUT"

	client := &http.Client{
	}
	req, err := http.NewRequest(method, url)

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

> ### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "event": "NEW_ORDER",
  "stores": [
    {
      "store_id": "1000",
      "url": "http://localhost",
      "state": "ENABLE"
    }
  ],
  "secret": "NEW_SECRET"
}
```

Esta tabla describe los objectos dentro de la respuesta de ejemplo:

| Objeto en la respuesta         | Descripción del objeto                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| `event`<br>_string_            | Nombre del evento que dispara el webhook.                             |
| `stores`<br>_array of strings_ | Lista de las tiendas donde se dispara el evento.                      |
| `store_id`<br>_string_         | Id de la tienda                                                       |
| `url`<br>_string_              | URL a la que se comunica el webhook.                                  |
| `state`<br>_string_            | Estado del webhook. Opciones disponibles: `ENABLE` o `DISABLE`        |
| `secret`<br>_string_           | _Secret Key_ para crear la firma de seguridad de cada evento webhook. |

## PUT webhook change status

Usa este endpoint para cambiar la disponibilidad de un webhook existente.

### URL del Endpoint

Utiliza esta URL para hacer una llamada con este endpoint:

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/webhook/{EVENT}/change-status`

- `{COUNTRY_DOMAIN}`: Este es tu dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Mira la lista de dominios por país</a>
- `{EVENT}`: Este es el nombre del evento <a href="/es/webhook-events" target="_blank">Mira la lista de eventos validos</a>

<aside class="notice">
   <p>NOTA</p>
   Para ejemplos de llamadas API en este sitio, utilizaremos el dominio de desarrollo: https://api.dev.rappi.com
</aside>

### Propiedades del Endpoint

Este recurso tiene las siguientes propiedades:

|                                         |         |     |
| --------------------------------------- | ------- | --- |
| Formato de respuesta                    | `JSON`  |
| Requerimientos del _body_ de la llamada | `JSON`  |
| Requerimientos de autenticación         | `Token` |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Estos son los posibles códigos de respuesta en este endpoint:

<aside class="ok-response">

`200`
_Sin Mensaje_

</aside>
<aside class="error-response">

`401`
Credenciales inválidas

</aside>
<aside class="error-response">

`404`
Lista de tiendas inválidas para el cliente autenticado

</aside>
<aside class="error-response">

`406`
Evento Invalido

</aside>

### Ejemplo de Llamada

Este es un ejemplo de una llamada API usando este endpoint:

`PUT https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-status`

> Este es un ejemplo de la llamada:

```json
{
  "stores": {
    "enable": ["1001"],
    "disable": ["1000"]
  }
}
```

>

```java
URL url = new URL("https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-status");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\"stores\": {\"enable\": [\"1001\"],\"disable\": [\"1000\" ] } }";

try (OutputStream os = connection.getOutputStream()) {
   byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
   os.write(input, 0, input.length);
}

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
  path: "/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-status",
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
  stores: {
    enable: ["1001"],
    disable: ["1000"],
  },
});

req.setHeader("Content-Length", postData.length);

req.write(postData);

req.end();
```

```python
import requests

url = "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-status"

payload = "{\"stores\": {\"enable\": [\"1001\"],\"disable\": [\"1000\" ] } }"
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

	url := "https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/webhook/NEW_ORDER/change-status"
	method := "PUT"

	payload := strings.NewReader("{\"stores\": {\"enable\": [\"1001\"],\"disable\": [\"1000\" ] } }")

	client := &http.Client {
	}
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

| Atributos                       | Requerimiento | Descripción                                                          |
| ------------------------------- | ------------- | -------------------------------------------------------------------- |
| `stores`<br>_Object_            | `requerido`   | Objeto que contiene las listas de tiendas a habilitar o deshabilitar |
| `enable`<br>_array of strings_  | `opcional`    | Lista de tiendas a habilitar                                         |
| `disable`<br>_array of strings_ | `opcional`    | Lista de tiendas a deshabilitar                                      |

<aside class="notice">
   <p>NOTA</p>
   Al menos una de las listas debe estar presente
</aside>

### Ejemplo de Respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "event": "NEW_ORDER",
  "stores": [
    {
      "store_id": "1001",
      "url": "http://localhost",
      "state": "ENABLE"
    },
    {
      "store_id": "1000",
      "url": "http://localhost",
      "state": "ENABLE"
    }
  ]
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto en la respuesta        | Descripción del objeto                           |
| ----------------------------- | ------------------------------------------------ |
| `event`<br>_string_           | Nombre del evento que dispara el webhook.        |
| `stores`<br>_array of Stores_ | Lista de las tiendas donde se dispara el evento. |
| `store_id`<br>_string_        | Id de la tienda que dispara el webhook           |
| `url`<br>_string_             | URL a la que se comunica el webhook.             |
| `state`<br>_string_           | Nueva disponibilidad definida en la llamada.     |

## Configuración de webhooks de integración

Utilice estos endpoints para configurar webhooks a nivel de integración. A diferencia de los webhooks por tienda, los webhooks de integración aplican a todas las tiendas de una integración y se configuran una sola vez.

La siguiente tabla describe los endpoints de webhooks de integración:

| Recurso de API | Descripción del Endpoint |
| -------------- | ------------------------ |
| [`POST /clients/{clientId}/webhooks`](#post-integration-webhook) | Configura una URL de webhook para todas las tiendas de una integración |
| [`DELETE /clients/{clientId}/webhooks`](#delete-integration-webhook) | Elimina la configuración de webhook para un evento |
| [`GET /clients/{clientId}/webhooks`](#get-integration-webhooks) | Lista todas las configuraciones de webhook de una integración |

## POST integration webhook

Utilice este endpoint para configurar una URL de webhook para un evento de integración. Crea o actualiza la configuración del webhook. El único evento soportado en este momento es `STORE_PROVISIONING_STATUS`.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/clients/{clientId}/webhooks`

`{COUNTRY_DOMAIN}`: Es su dominio de país de Rappi. <a href="/es/api-reference/content/#domains" target="_blank">Ver la lista de dominios de país.</a>

`{clientId}`: Su client ID (el claim `azp` de su JWT de integrador, por ejemplo, `your-client-id`).

<aside class="notice">
  <p>NOTA</p>
  <p>En los ejemplos de solicitudes de API de este sitio, utilizamos el dominio de desarrollo: <code>https://api.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | `JSON` |
| Autenticación requerida     | Bearer integrator JWT (Auth0) |

### Parámetros

| Parámetro | Descripción |
| --------- | ----------- |
| `{clientId}` | Path param. Su client ID (claim `azp` del JWT de integrador) |

### Cuerpo de la Solicitud

| Atributo | Requerido | Descripción |
| -------- | --------- | ----------- |
| `event`<br/>_string_ | `requerido` | El evento a configurar (por ejemplo, `STORE_PROVISIONING_STATUS`) |
| `url`<br/>_string_ | `requerido` | El endpoint HTTPS que recibirá los eventos de webhook |
| `secret`<br/>_string_ | `opcional` | Secret personalizado para validación de firma HMAC. Si se omite, no se enviará firma con los payloads del webhook |

### Códigos de Estado

<aside class="ok-response">

`200` OK — configuración de webhook actualizada

</aside>

<aside class="ok-response">

`201` Creado — webhook configurado

</aside>

<aside class="error-response">

`400` Solicitud inválida

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

### Ejemplo de Solicitud

`POST https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/clients/your-client-id/webhooks`

> Este es un ejemplo de la solicitud:

```json
{
  "event": "STORE_PROVISIONING_STATUS",
  "url": "https://your-endpoint.com/rappi/events",
  "secret": "optional-custom-secret"
}
```

### Ejemplo de Respuesta "Creado 201"

> Este es un ejemplo de la respuesta "Creado 201":

```json
{
  "clientId": "your-client-id",
  "event": "STORE_PROVISIONING_STATUS",
  "url": "https://your-endpoint.com/rappi/events",
  "state": true
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Objeto | Descripción |
| ------ | ----------- |
| `clientId`<br/>_string_ | Su client ID (claim `azp` de su JWT de integrador) |
| `event`<br/>_string_ | El nombre del evento configurado |
| `url`<br/>_string_ | La URL del webhook que recibirá los eventos |
| `state`<br/>_boolean_ | Si el webhook está activo (`true`/`false`). Nota: esto difiere de los webhooks por tienda, que utilizan los valores string `ENABLE`/`DISABLE`. |

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

## DELETE integration webhook

Utilice este endpoint para eliminar la configuración de webhook para un evento específico de una integración.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/clients/{clientId}/webhooks`

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | Ninguno |
| Autenticación requerida     | Bearer integrator JWT (Auth0) |

### Parámetros

| Parámetro | Descripción |
| --------- | ----------- |
| `{clientId}` | Path param. Su client ID (claim `azp` del JWT de integrador) |
| `event` | Query param. Nombre del evento a eliminar |

### Códigos de Estado

<aside class="ok-response">

`204` Sin Contenido — webhook eliminado

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

### Ejemplo de Solicitud

`DELETE https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/clients/your-client-id/webhooks?event=STORE_PROVISIONING_STATUS`

## GET integration webhooks

Utilice este endpoint para listar todas las configuraciones de webhook de una integración.

### URL del Endpoint

`https://{COUNTRY_DOMAIN}/api/v2/restaurants-integrations-public-api/clients/{clientId}/webhooks`

### Propiedades del Endpoint

|                             |        |
| --------------------------- | ------ |
| Formato de respuesta        | `JSON` |
| Autenticación requerida     | Bearer integrator JWT (Auth0) |

### Parámetros

| Parámetro | Descripción |
| --------- | ----------- |
| `{clientId}` | Path param. Su client ID (claim `azp` del JWT de integrador) |

### Códigos de Estado

<aside class="ok-response">

`200` Exitoso

</aside>

<aside class="error-response">

`401` No autorizado

</aside>

### Ejemplo de Solicitud

`GET https://api.dev.rappi.com/api/v2/restaurants-integrations-public-api/clients/your-client-id/webhooks`

### Ejemplo de Respuesta "Exitoso 200"

> Este es un ejemplo de la respuesta "Exitoso 200":

```json
[
  {
    "clientId": "your-client-id",
    "event": "STORE_PROVISIONING_STATUS",
    "url": "https://your-endpoint.com/rappi/events",
    "state": true
  }
]
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Objeto | Descripción |
| ------ | ----------- |
| `clientId`<br/>_string_ | Su client ID (claim `azp` de su JWT de integrador) |
| `event`<br/>_string_ | El nombre del evento configurado |
| `url`<br/>_string_ | La URL del webhook que recibe los eventos |
| `state`<br/>_boolean_ | Si el webhook está activo (`true`/`false`). Nota: esto difiere de los webhooks por tienda, que utilizan los valores string `ENABLE`/`DISABLE`. |
