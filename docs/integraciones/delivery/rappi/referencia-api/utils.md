
# Utilidades

Esta sección está diseñada para organizar los endpoints de los brokers y productos que anteriormente se encontraban en secciones separadas.

Además, está previsto que estos endpoints dejen de estar disponibles en los próximos meses, ya que serán reemplazados por un nuevo conjunto de endpoints diseñados para facilitar la gestión completa del menú con un rendimiento y una fiabilidad mejorados.

**Horarios de Corredores Por Tienda**

Utilice Utils para configurar los horarios de sus tiendas.

La siguiente tabla muestra el contenido de los horarios de los corredores:

| Recurso                                                                                                                                                                                                             | Descripción                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`GET /corridor/store/{storeId}`](#get-corridor-store-store-id)                                                                                                                                                     | Retorna la lista de los corredores de la tienda                                                |
| [`GET /corridor/schedule/{corridorId}/store/{storeId}`](#get-corridor-schedule-corridor-id-store-store-id)                                                                                                          | Retorna los horarios del corredor configurado en la tienda                                     |
| [`POST /corridor/schedule/{corridorId}/store/{storeId}`](#post-corridor-schedule-corridor-id-store-store-id)                                                                                                        | Crea los horarios del corredor en la tienda                                                    |
| [`PUT /corridor/schedule/{corridorId}/store/{storeId}`](#put-corridor-schedule-corridor-id-store-store-id)                                                                                                          | Actualiza los horarios del corredor en la tienda                                               |
| [`DELETE /corridor/schedule/{corridorId}/store/{storeId}/{corridorProductScheduleId}`](#put-corridor-schedule-corridor-id-store-store-id-corridor-product-schedule-id)                                              | Utilice este endpoint para actualizar los horarios del corredor de su tienda.                  |
| [`GET /corridor/integration/{integrationId}`](#get-corridor-integration-integration-id)                                                                                                                             | Retorna la lista de los corredores de la tienda                                                |
| [`GET /corridor/schedule/{corridorId}/integration/{integrationId}`](#get-corridor-schedule-corridor-id-integration-integration-id)                                                                                  | Retorna los horarios del corredor configurado en la tienda                                     |
| [`POST /corridor/schedule/{corridorId}/integration/{integrationId}`](#post-corridor-schedule-corridor-id-integration-integration-id)                                                                                | Crea los horarios del corredor en la tienda                                                    |
| [`PUT /corridor/schedule/{corridorId}/integration/{integrationId}`](#put-corridor-schedule-corridor-id-integration-integration-id)                                                                                  | Actualiza los horarios del corredor en la tienda                                               |
| [`DELETE /corridor/schedule/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`](#delete-corridor-schedule-corridor-id-integration-integration-id-corridor-product-schedule-id)                   | Utilice este endpoint para eliminar los horarios del corredor de su tienda.                    |
| [`GET /product/corridor/{corridorId}/store/{storeId}`](#get-product-corridor-corridor-id-store-store-id)                                                                                                            | Retorna la lista de los productos del corredor y tienda                                        |
| [`GET /product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`](#get-product-schedule-product-id-corridor-corridor-id-store-store-id)                                                                   | Retorna los horarios de un producto configurados por corredor y tienda                         |
| [`POST /product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`](#post-product-schedule-product-id-corridor-corridor-id-store-store-id)                                                                 | Crea los horarios de un producto por corredor y tienda                                         |
| [`PUT /product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`](#put-product-schedule-product-id-corridor-corridor-id-store-store-id)                                                                   | Actualiza los horarios de un producto por corredor y tienda                                    |
| [`DELETE /product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}`](#delete-product-schedule-product-id-corridor-corridor-id-store-store-id-corridor-product-schedule-id)    | Use este endpoint para eliminar los horarios del producto configurado por corredores y tienda. |
| [`GET /sku/corridor/{corridorId}/integration/{integrationId}`](#get-sku-corridor-corridor-id-integration-integration-id)                                                                                            | Retorna la lista de los productos del corredor y tienda                                        |
| [`GET /sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`](#get-sku-schedule-sku-corridor-corridor-id-integration-integration-id)                                                                | Retorna los horarios de un producto configurados por corredor y tienda                         |
| [`POST /sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`](#post-sku-schedule-sku-corridor-corridor-id-integration-integration-id)                                                              | Crea los horarios de un producto por corredor y tienda                                         |
| [`PUT /sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`](#put-sku-schedule-sku-corridor-corridor-id-integration-integration-id)                                                                | Actualiza los horarios de un producto por corredor y tienda                                    |
| [`DELETE /sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`](#delete-sku-schedule-sku-corridor-corridor-id-integration-integration-id-corridor-product-schedule-id) | Use este endpoint para eliminar los horarios del producto configurado por corredores y tienda  |

**Estado de productos y tiendas**

Utilice Utils para consultar los estados de los productos de su tienda.

| Recurso                                                                                                             | Descripción                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`GET /menu/integration/{integrationId}`](#get-menu-integration-integration-id)                                     | Retorna la lista de productos y toppings mostrando el estado de los items y su disponibilidad. |
| [`GET /store/schedule/{storeId}`](#get-store-schedule-store-id)                                                     | Retorna todo el horario regular de la tienda                                                   |
| [`GET /store/schedule/{storeId}/holiday`](#get-store-schedule-store-id-holiday)                                     | Retorna todo el horario de dias festivos                                                       |
| [`GET /store/schedule/{storeId}/special`](#get-store-schedule-store-id-special)                                     | Retorna todo el horario de dias especiales de la tienda                                        |
| [`POST /store/schedule/{storeId}`](#post-store-schedule-store-id)                                                   | Crea una franja horaria en un día de horario regular de la tienda                              |
| [`POST /store/schedule/{storeId}/holiday/{holidayDayId}`](#post-store-schedule-store-id-holiday-holiday-day-id)     | Crea una franja horaria en un día feriado                                                      |
| [`POST /store/schedule/{storeId}/special`](#post-store-schedule-store-id-special)                                   | Crea un día especial de la tienda                                                              |
| [`POST /store/schedule/{storeId}/special/{specialDayId}`](#post-store-schedule-store-id-special-special-day-id)     | Crea una franja horaria en un día especial de la tienda                                        |
| [`PUT /store/schedule/{storeId}/{storeScheduleId}`](#put-store-schedule-store-id-store-schedule-id)                 | Actualiza una franja horaria                                                                   |
| [`DELETE /store/schedule/{storeId}/{storeScheduleId}`](#delete-store-schedule-store-id-store-schedule-id)           | Elimina una franja horaria                                                                     |
| [`DELETE /store/schedule/{storeId}/special/{specialDayId}`](#delete-store-schedule-store-id-special-special-day-id) | Elimina un dia especial                                                                        |

## GET corridor/store/{storeId}

Use este endpoint para obtener la lista de los corredores de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/store/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/store/999`

> Este es un request de ejemplo:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/store/999");

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
  path: "/api/rest-ops-utils/corridor/store/999",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/store/999"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/store/999"
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

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

```json
[
  {
    "id": 123,
    "name": "Bebidas Calientes",
    "description": "Corredor Bebidas Calientes",
    "storeId": 999
  },
  {
    "id": 321,
    "name": "Bebidas Frias",
    "description": "Corredor Bebidas Frias",
    "storeId": 999
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta        | Descripción                               |
| -------------------------- | ----------------------------------------- |
| `id`<br/>_integer_         | ID del corredor.                          |
| `name`<br/>_string_        | Nombre del corredor.                      |
| `description`<br/>_string_ | Descripción del corredor .                |
| `storeId`<br/>_integer_    | ID de la tienda que contiene el corredor. |

## GET corridor/schedule/{corridorId}/store/{storeId}

Utilice este endpoint para obtener los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Id de la tienda en Rappi.
- `{corridorId}`: Id del corredor.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/store/999`

> Ejemplo completo del request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/store/999");

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
  path: "/api/rest-ops-utils/corridor/schedule/321/store/999",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/store/999"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/store/999"
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

```json
{
  "corridor_id": 321,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 1,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    }
  ]
}
```

Esta tabla detalla los campos que contienen la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                 |
| `store_id`<br/>_integer_                    | ID de la tienda en Rappi.                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor                                                                      |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## POST corridor/schedule/{corridorId}/store/{storeId}

Utilice este endpoint para crear los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Id de la tienda en Rappi.
- `{corridorId}`: Id del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

This endpoint does not permit additional parameters.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo enviar el request a la API:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999`

> Ejemplo del request:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  path: "/api/rest-ops-utils/corridor/schedule/123/store/999",
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
  schedule_details: [
    {
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "08:00:00",
      ends_time: "20:00:00",
    },
    {
      days: "hol",
      starts_time: "13:00:00",
      ends_time: "22:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"08:00:00\",\n" +
            "        \"ends_time\": \"20:00:00\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"days\": \"hol\",\n" +
            "        \"starts_time\": \"13:00:00\",\n" +
            "        \"ends_time\": \"22:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999"
	method := "POST"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla describe cuales son los campos requeridos del request:

| Atributos                                   | Requerido   | Description                                                                                      |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `requerido` | Lista de horarios del corredor.                                                                  |
| `schedule_details.days`<br/>_string_        | `requerido` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requerido` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requerido` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de Respuesta

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 3,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                 |
| `store_id`<br/>_integer_                    | ID de la tienda.                                                                                 |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | ID del horario de un corredor.                                                                   |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## PUT corridor/schedule/{corridorId}/store/{storeId}

Utilice este endpoint para actualizar los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Id de su tienda en Rappi.
- `{corridorId}`: Id del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999`

> Ejemplo del request:

```json
{
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 2,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/corridor/schedule/123/store/999",
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
  schedule_details: [
    {
      id: 2,
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "10:00:00",
      ends_time: "16:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"id\": 2,\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"10:00:00\",\n" +
            "        \"ends_time\": \"16:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999"
	method := "PUT"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 2,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido   | Descripción                                                                                      |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `requerido` | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | `requerido` | ID del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | `requerido` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requerido` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requerido` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de la Respuesta

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                 |
| `store_id`<br/>_integer_                    | ID de la tienda en Rappi.                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## DELETE corridor/schedule/{corridorId}/store/{storeId}/{corridorProductScheduleId}

Utilice este endpoint para actualizar los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/corridor/schedule/{corridorId}/store/{storeId}/{corridorProductScheduleId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{corridorProductScheduleId}`: ID del horario en el corredor
- `{storeId}`: ID de su tienda en Rappi.
- `{corridorId}`: ID del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999/2541`

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999/2541");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);


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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/corridor/schedule/123/store/999/2541",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999/2541"

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
	"strings"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/store/999/2541"
	method := "PUT"

	client := &http.Client{}
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

### Ejemplo de la Respuesta

```json
{
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                 |
| `store_id`<br/>_integer_                    | ID de la tienda en Rappi.                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor que siguen disponibles.                                           |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## GET corridor/integration/{integrationId}

Use este endpoint para obtener la lista de los corredores de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: ID de la tienda del lado del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/integration/888`

> Este es un request de ejemplo:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/integration/888");

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
  path: "/api/rest-ops-utils/corridor/integration/888",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/integration/888"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/integration/888"
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

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

```json
[
  {
    "id": 123,
    "name": "Bebidas Calientes",
    "description": "Corredor Bebidas Calientes",
    "integrationId": "888"
  },
  {
    "id": 321,
    "name": "Bebidas Frias",
    "description": "Corredor Bebidas Frias",
    "integrationId": "888"
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta          | Descripción                               |
| ---------------------------- | ----------------------------------------- |
| `id`<br/>_integer_           | ID del corredor.                          |
| `name`<br/>_string_          | Nombre del corredor.                      |
| `description`<br/>_string_   | Descripción del corredor .                |
| `integrationId`<br/>_string_ | ID de la tienda que contiene el corredor. |

## GET corridor/schedule/{corridorId}/integration/{integrationId}

Utilice este endpoint para obtener los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: ID de la tienda del aliado.
- `{corridorId}`: ID del corredor.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888`

> Ejemplo completo del request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888");

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
  path: "/api/rest-ops-utils/corridor/schedule/321/integration/888",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888"
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

```json
{
  "corridor_id": 321,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 1,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    }
  ]
}
```

Esta tabla detalla los campos que contienen la respuesta:

| Campos de Respuesta                         | Descripción                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                  |
| `integration_id`<br/>_string_               | ID de la tienda del aliado                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                   |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor                                                                       |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

## POST corridor/schedule/{corridorId}/integration/{integrationId}

Utilice este endpoint para crear los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: ID de la tienda del aliado.
- `{corridorId}`: ID del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

This endpoint does not permit additional parameters.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo enviar el request a la API:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888`

> Ejemplo del request:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  path: "/api/rest-ops-utils/corridor/schedule/123/integration/888",
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
  schedule_details: [
    {
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "08:00:00",
      ends_time: "20:00:00",
    },
    {
      days: "hol",
      starts_time: "13:00:00",
      ends_time: "22:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"08:00:00\",\n" +
            "        \"ends_time\": \"20:00:00\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"days\": \"hol\",\n" +
            "        \"starts_time\": \"13:00:00\",\n" +
            "        \"ends_time\": \"22:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888"
	method := "POST"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla describe cuales son los campos requeridos del request:

| Atributos                                   | Requerido   | Descripción                                                                                       |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `schedule_details`<br/>_array of objects_   | `requerido` | Lista de horarios del corredor.                                                                   |
| `schedule_details.days`<br/>_string_        | `requerido` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | `requerido` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | `requerido` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

### Ejemplo de Respuesta

```json
{
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 3,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de Respuesta                         | Descripción                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                  |
| `integration_id`<br/>_integer_              | ID de la tienda del aliado.                                                                       |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                   |
| `schedule_details.id`<br/>_integer_         | ID del horario de un corredor.                                                                    |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

## PUT corridor/schedule/{corridorId}/integration/{integrationId}

Utilice este endpoint para actualizar los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationd}`: ID de la tienda del aliado.
- `{corridorId}`: ID del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888`

> Ejemplo del request:

```json
{
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 2,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/corridor/schedule/123/integration/888",
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
  schedule_details: [
    {
      id: 2,
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "10:00:00",
      ends_time: "16:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"id\": 2,\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"10:00:00\",\n" +
            "        \"ends_time\": \"16:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/123/integration/888"
	method := "PUT"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 2,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido   | Descripción                                                                                       |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `schedule_details`<br/>_array of objects_   | `requerido` | Lista de horarios del corredor.                                                                   |
| `schedule_details.id`<br/>_integer_         | `requerido` | ID del horario del corredor.                                                                      |
| `schedule_details.days`<br/>_string_        | `requerido` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | `requerido` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | `requerido` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

### Ejemplo de la Respuesta

```json
{
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 2,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                  |
| `integration_id`<br/>_integer_              | ID de la tienda del aliado.                                                                       |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                   |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor.                                                                      |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

## DELETE corridor/schedule/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}

Utilice este endpoint para eliminar los horarios del corredor de su tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/corridor/schedule/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`

- `{COUNTRY_DOMAIN}`: Dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{corridorProductScheduleId}`: ID del horario en el corredor
- `{integrationId}`: ID de la tienda del aliado.
- `{corridorId}`: ID del corredor.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Este recurso utiliza las siguientes propiedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

`DELETE https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888/254`

> Ejemplo completo del request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888/254");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
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
  method: "DELETE",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/corridor/schedule/321/integration/888/254",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888/254"

payload = {}
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
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/corridor/schedule/321/integration/888/254"
	method := "DELETE"

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

```json
{
  "corridor_id": 321,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 1,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    }
  ]
}
```

Esta tabla detalla los campos que contienen la respuesta:

| Campos de Respuesta                         | Descripción                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `corridor_id`<br/>_integer_                 | ID del corredor.                                                                                  |
| `integration_id`<br/>_string_               | ID de la tienda del aliado                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor que siguen disponibles.                                            |
| `schedule_details.id`<br/>_integer_         | ID del horario del corredor                                                                       |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".            |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss  |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 houras HH:mm:ss |

## GET product/corridor/{corridorId}/store/{storeId}

Use este endpoint para obtener la lista de los productos configurados por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/corridor/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{corridorId}`: Es el identificador del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/product/corridor/123/store/999`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/product/corridor/123/store/999");

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
  path: "/api/rest-ops-utils/corridor/store/999",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/product/corridor/123/store/999"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/product/corridor/123/store/999"
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

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
[
  {
    "product_id": 789,
    "name": "Americano Caliente 16 oz",
    "description": "16 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "store_id": 999
  },
  {
    "product_id": 987,
    "name": "Americano Caliente 20 oz",
    "description": "20 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "store_id": 999
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta         | Descripción                          |
| --------------------------- | ------------------------------------ |
| `product_id`<br/>_integer_  | Identificador del producto.          |
| `name`<br/>_string_         | Nombre del producto.                 |
| `description`<br/>_string_  | Descripción del producto.            |
| `corridor_id`<br/>_integer_ | Identificador del corredor.          |
| `store_id`<br/>_integer_    | Identificador de la tienda en Rappi. |

## GET product/schedule/{productId}/corridor/{corridorId}/store/{storeId}

Use este endpoint para obtener los horarios del producto configurado por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{productId}`: Es el identificador del producto.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999");

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
  path: "/api/rest-ops-utils/product/schedule/789/corridor/123/store/999",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"
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

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `product_id`<br/>_integer_                  | Identificador del producto en Rappi.                                                             |
| `corridor_id`<br/>_integer_                 | Identificador del corredor en Rappi.                                                             |
| `store_id`<br/>_integer_                    | Identificador de la tienda en Rappi.                                                             |
| `schedule_details`<br/>_array of objects_   | Lista del horarios que el producto está disponible.                                              |
| `schedule_details.id`<br/>_integer_         | Identificador del horario del producto.                                                          |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## POST product/schedule/{productId}/corridor/{corridorId}/store/{storeId}

Use este endpoint para crear los horarios del producto configurados por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{productId}`: Es el identificador del product en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999`

> Ejemplo del Request:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  path: "/api/rest-ops-utils/product/schedule/789/corridor/123/store/999",
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
  schedule_details: [
    {
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "08:00:00",
      ends_time: "20:00:00",
    },
    {
      days: "hol",
      starts_time: "13:00:00",
      ends_time: "22:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"08:00:00\",\n" +
            "        \"ends_time\": \"20:00:00\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"days\": \"hol\",\n" +
            "        \"starts_time\": \"13:00:00\",\n" +
            "        \"ends_time\": \"22:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"
	method := "POST"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido  | Descripción                                                                                      |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `required` | Lista de horarios del corredor.                                                                  |
| `schedule_details.days`<br/>_string_        | `requered` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requered` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requered` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 6,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `product_id`<br/>_integer_                  | Id del producto en Rappi.                                                                        |
| `corridor_id`<br/>_integer_                 | Id del corredor en Rappi.                                                                        |
| `store_id`<br/>_integer_                    | Id de la tienda en Rappi.                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | Id del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## PUT product/schedule/{productId}/corridor/{corridorId}/store/{storeId}

Use este endpoint para actualizar los horarios del producto configurados por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{corridorId}`: Es el identificador del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999`

> Ejemplo del Request:

```json
{
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 5,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/product/schedule/789/corridor/123/store/999",
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
  schedule_details: [
    {
      id: 5,
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "10:00:00",
      ends_time: "16:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"id\": 5,\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"10:00:00\",\n" +
            "        \"ends_time\": \"16:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999"
	method := "PUT"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 5,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido  | Descripción                                                                                      |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `required` | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | `required` | Id del horario del producto en Rappi.                                                            |
| `schedule_details.days`<br/>_string_        | `requered` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requered` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requered` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `product_id`<br/>_integer_                  | Id del producto en Rappi.                                                                        |
| `corridor_id`<br/>_integer_                 | Id del corredor en Rappi.                                                                        |
| `store_id`<br/>_integer_                    | Id de la tienda en Rappi.                                                                        |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | Id del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## DELETE product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}

Use este endpoint para eliminar los horarios del producto configurado por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{corridorProductScheduleId}`: Id del horario en el producto
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{productId}`: Es el identificador del producto.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`DELETE https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/{productId}/corridor/{corridorId}/store/{storeId}/{corridorProductScheduleId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999/254");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
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
  method: "DELETE",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/product/schedule/789/corridor/123/store/999/254",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999/254"

payload = {}
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
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/product/schedule/789/corridor/123/store/999/254"
	method := "DELETE"

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

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "product_id": 789,
  "corridor_id": 123,
  "store_id": 999,
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `product_id`<br/>_integer_                  | Identificador del producto en Rappi.                                                             |
| `corridor_id`<br/>_integer_                 | Identificador del corredor en Rappi.                                                             |
| `store_id`<br/>_integer_                    | Identificador de la tienda en Rappi.                                                             |
| `schedule_details`<br/>_array of objects_   | Lista del horarios que el producto siguen disponibles.                                           |
| `schedule_details.id`<br/>_integer_         | Identificador del horario del producto.                                                          |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## GET sku/corridor/{corridorId}/integration/{integrationId}

Use este endpoint para obtener la lista de los productos configurados por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/corridor/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: Es el identificador del a tienda.
- `{corridorId}`: Es el identificador del corredor en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/sku/corridor/123/integration/888`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/sku/corridor/123/integration/888");

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
  path: "/api/rest-ops-utils/sku/corridor/123/integration/888",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/corridor/123/integration/888"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/corridor/123/integration/888"
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

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Invalid Credentials

</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
[
  {
    "sku": 789,
    "name": "Americano Caliente 16 oz",
    "description": "16 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "integration_id": "888"
  },
  {
    "sku": 987,
    "name": "Americano Caliente 20 oz",
    "description": "20 oz. Espresso con agua caliente.",
    "corridor_id": 123,
    "integration_id": "888"
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta           | Descripción                            |
| ----------------------------- | -------------------------------------- |
| `sku`<br/>_integer_           | Identificador del producto.            |
| `name`<br/>_string_           | Nombre del producto.                   |
| `description`<br/>_string_    | Descripción del producto.              |
| `corridor_id`<br/>_integer_   | Identificador del corredor.            |
| `integration_id`<br/>_string_ | Identificador de la tienda del aliado. |

## GET sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}

Use este endpoint para obtener los horarios del producto configurado por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: Es el identificador de la tienda del aliado.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{sku}`: Es el identificador del producto del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888");

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
  path: "/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"
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

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sku`<br/>_integer_                         | Identificador del producto del aliado.                                                           |
| `corridor_id`<br/>_integer_                 | Identificador del corredor en Rappi.                                                             |
| `integration_id`<br/>_integer_              | Identificador de la tienda del aliado.                                                           |
| `schedule_details`<br/>_array of objects_   | Lista del horarios que el producto está disponible.                                              |
| `schedule_details.id`<br/>_integer_         | Identificador del horario del producto.                                                          |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## POST sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}

Use este endpoint para crear los horarios del producto configurados por corredor y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: Es el identificador de la tienda del aliado.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{sku}`: Es el identificador del producto del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888`

> Ejemplo del Request:

```json
{
  "schedule_details": [
    {
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

>

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  path: "/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888",
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
  schedule_details: [
    {
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "08:00:00",
      ends_time: "20:00:00",
    },
    {
      days: "hol",
      starts_time: "13:00:00",
      ends_time: "22:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"08:00:00\",\n" +
            "        \"ends_time\": \"20:00:00\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"days\": \"hol\",\n" +
            "        \"starts_time\": \"13:00:00\",\n" +
            "        \"ends_time\": \"22:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"
	method := "POST"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    },\n" +
        "    {\n" +
        "        \"days\": \"hol\",\n" +
        "        \"starts_time\": \"13:00:00\",\n" +
        "        \"ends_time\": \"22:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido  | Descripción                                                                                      |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `required` | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | `required` | Id del horario del producto en Rappi.                                                            |
| `schedule_details.days`<br/>_string_        | `requered` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requered` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requered` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "08:00:00",
      "ends_time": "20:00:00"
    },
    {
      "id": 6,
      "days": "hol",
      "starts_time": "13:00:00",
      "ends_time": "22:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sku`<br/>_integer_                         | Id del producto del aliado.                                                                      |
| `corridor_id`<br/>_integer_                 | Id del corredor en Rappi.                                                                        |
| `integration_id`<br/>_integer_              | Id de la tienda del aliado.                                                                      |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | Id del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## PUT sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}

Use este endpoint para actualizar los horarios del producto configurados por corredor y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: Es el identificador de la tienda del aliado.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{sku}`: Es el identificador del producto del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888`

> Ejemplo del Request:

```json
{
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString = "{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 5,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
        "}";

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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888",
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
  schedule_details: [
    {
      id: 5,
      days: "mon,tue,wed,thu,fri,sat,sun",
      starts_time: "10:00:00",
      ends_time: "16:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"

payload = "{\n" +
            "  \"schedule_details\": [\n" +
            "    {\n" +
            "        \"id\": 5,\n" +
            "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
            "        \"starts_time\": \"10:00:00\",\n" +
            "        \"ends_time\": \"16:00:00\"\n" +
            "    }\n" +
            "  ]\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888"
	method := "PUT"

	payload := strings.NewReader(""{\n" +
        "  \"schedule_details\": [\n" +
        "    {\n" +
        "        \"id\": 5,\n" +
        "        \"days\": \"mon,tue,wed,thu,fri,sat,sun\",\n" +
        "        \"starts_time\": \"10:00:00\",\n" +
        "        \"ends_time\": \"16:00:00\"\n" +
        "    }\n" +
        "  ]\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                                   | Requerido  | Descripción                                                                                      |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `schedule_details`<br/>_array of objects_   | `required` | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | `required` | Id del horario del producto en Rappi.                                                            |
| `schedule_details.days`<br/>_string_        | `requered` | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | `requered` | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | `requered` | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 5,
      "days": "mon,tue,wed,thu,fri,sat,sun",
      "starts_time": "10:00:00",
      "ends_time": "16:00:00"
    }
  ]
}
```

La siguiente tabla detalla los campos que contiene la respuesta:

| Campos de la Respuesta                      | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sku`<br/>_integer_                         | Id del producto del aliado.                                                                      |
| `corridor_id`<br/>_integer_                 | Id del corredor en Rappi.                                                                        |
| `integration_id`<br/>_integer_              | Id de la tienda del aliado.                                                                      |
| `schedule_details`<br/>_array of objects_   | Lista de horarios del corredor.                                                                  |
| `schedule_details.id`<br/>_integer_         | Id del horario del corredor.                                                                     |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## DELETE sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}

Use este endpoint para eliminar los horarios del producto configurado por corredores y tienda.

<aside class="success">
  <p>IMPORTANTE</p>
  <p>Las tiendas hijas usan <b>las mismas configuraciones que las tiendas padres</b>.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{corridorProductScheduleId}`: Id del horario en el producto
- `{integrationId}`: Es el identificador de la tienda del aliado.
- `{corridorId}`: Es el identificador del corredor en Rappi.
- `{sku}`: Es el identificador del producto del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`DELETE https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/{sku}/corridor/{corridorId}/integration/{integrationId}/{corridorProductScheduleId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888/254");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
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
  method: "DELETE",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888/254",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888/254"

payload = {}
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
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/sku/schedule/987/corridor/123/integration/888/254"
	method := "DELETE"

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

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "sku": 987,
  "corridor_id": 123,
  "integration_id": "888",
  "schedule_details": [
    {
      "id": 4,
      "days": "mon,tue,wed,thu,fri,sat,sun,hol",
      "starts_time": "08:00:00",
      "ends_time": "23:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                         | Descripción                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sku`<br/>_integer_                         | Identificador del producto del aliado.                                                           |
| `corridor_id`<br/>_integer_                 | Identificador del corredor en Rappi.                                                             |
| `integration_id`<br/>_integer_              | Identificador de la tienda del aliado.                                                           |
| `schedule_details`<br/>_array of objects_   | Lista del horarios que el producto siguen disponibles.                                           |
| `schedule_details.id`<br/>_integer_         | Identificador del horario del producto.                                                          |
| `schedule_details.days`<br/>_string_        | Días del horario. Días de la semana: "mon,tue,wed,thu,fri,sat,sun", Vacaciones: "hol".           |
| `schedule_details.starts_time`<br/>_string_ | Tiempo desde que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |
| `schedule_details.ends_time`<br/>_string_   | Tiempo hasta que el corredor va a estar disponible para el usuario. Formato en 24 horas HH:mm:ss |

## GET menu/integration/{integrationId}

Use este endpoint para obtener la lista de productos y toppings mostrando el estado de los items y su disponibilidad.

<aside class="success">
  <p>IMPORTANT</p>
  <p>Tiene que usar el integrationId de una tienda padre, si utiliza el integrationId de una tienda hija, directamente el endpoint consultara la data de su padre.</p>
</aside>

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/menu/integration/{integrationId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{integrationId}`: Id de la tienda padre del lado del aliado.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/menu/integration/910001`

> Este es un request de ejemplo:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/menu/integration/910001");

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
  path: "/api/rest-ops-utils/menu/integration/910001",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/menu/integration/910001"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/menu/integration/910001"
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

### Propiedades del Endpoint

Este recurso utiliza las siguientes propriedades:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este recurso no utiliza parámetros.

### Status Codes

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` Llamada exitosa

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

### Ejemplo de la Respuesta

Este es un ejemplo de la respuesta:

```json
{
  "corridors": [
    {
      "id": "2090062012",
      "name": "Alimentos",
      "description": "",
      "storeId": "900113661",
      "integrationId": "900113662"
    }
  ],
  "products": [
    {
      "id": "2136363834",
      "sku": "0003339",
      "name": "Combo Ant. De Lomo",
      "description": "Combo ant. de lomo",
      "active": true,
      "isAvailable": true,
      "corridorId": "2090062012"
    }
  ],
  "toppingsCategories": [
    {
      "id": "1247309613",
      "sku": null,
      "description": "Otros",
      "productId": "2136363834",
      "toppings": [
        {
          "id": "341611638",
          "sku": "0000105",
          "description": "Anticucho de lomo fino",
          "activated": true
        },
        {
          "id": "341611639",
          "sku": "0003341",
          "description": "Cusqueña doble malta",
          "activated": true
        },
        {
          "id": "341611640",
          "sku": "0002991",
          "description": "Aji diablo",
          "activated": true
        }
      ]
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                                    | Descripción                                       |
| ------------------------------------------------------ | ------------------------------------------------- |
| `corridors`<br/>_array of objects_                     | Lista de corredores de los productos.             |
| `corridors.id`<br/>_string_                            | Id del corredor.                                  |
| `corridors.name`<br/>_string_                          | nombre del corredor.                              |
| `corridors.description`<br/>_string_                   | descripción del corredor.                         |
| `corridors.storeId`<br/>_string_                       | Id de la tienda del corredor de parte de Rappi.   |
| `corridors.integrationId`<br/>_string_                 | Id de la tienda del corredor de parte del Aliado. |
| `products`<br/>_array of objects_                      | Lista de productos de la tienda.                  |
| `products.id`<br/>_string_                             | Id del producto.                                  |
| `products.sku`<br/>_string_                            | SKU del producto.                                 |
| `products.name`<br/>_string_                           | Nombre del producto.                              |
| `products.description`<br/>_string_                    | Descripción del producto.                         |
| `products.active`<br/>_string_                         | Indica si el producto esta activo.                |
| `products.isAvailable`<br/>_string_                    | Indica si el producto esta disponible.            |
| `products.corridorId`<br/>_string_                     | Id del corredor del producto.                     |
| `toppingsCategories`<br/>_array of objects_            | Lista de categorías de los toppings.              |
| `toppingsCategories.id`<br/>_string_                   | Id de la categoria.                               |
| `toppingsCategories.description`<br/>_string_          | Descripción de la categoria.                      |
| `toppingsCategories.productId`<br/>_string_            | Id del producto que posee la categoria.           |
| `toppingsCategories.toppings`<br/>_array of objects_   | Lista de toppings de la categoria.                |
| `toppingsCategories.toppings.id`<br/>_string_          | Id del topping.                                   |
| `toppingsCategories.toppings.sku`<br/>_string_         | SKU del topping.                                  |
| `toppingsCategories.toppings.description`<br/>_string_ | Descripción del topping.                          |
| `toppingsCategories.toppings.activated`<br/>_string_   | Indica si el topping se encuentra activo.         |

### Ejemplo de Respuesta "Credenciales Inválidas 401"

> Este es un ejemplo de la respuesta "Credenciales Inválidas 401":

```json
{
  "message": "Not a valid token"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "App Client not found 404"

> Este es un ejemplo de la respuesta "App Client not found 404":

```json
{
  "message": "Not found appClient of client id {clientId}"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

### Ejemplo de Respuesta "integration Id not found Bad Request 400"

> Este es un ejemplo de la respuesta "integration Id not found Bad Request 400":

```json
{
  "message": "IntegrationId {integrationId} not found"
}
```

Esta tabla describe los objetos dentro de la respuesta de ejemplo:

| Objeto                 | Descripción                   |
| ---------------------- | ----------------------------- |
| `message`<br/>_string_ | Mensaje descriptivo del error |

## GET store/schedule/{storeId}

Use este endpoint para obtener todo el horario regular de su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999");

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
  path: "/api/rest-ops-utils/store/schedule/999",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999"
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

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "storeScheduleDays": [
    {
      "day": "mon",
      "storeSchedules": [
        {
          "id": 1171828,
          "startsTime": "07:00:00",
          "endsTime": "09:00:00"
        }
      ]
    },
    {
      "day": "tue",
      "storeSchedules": [
        {
          "id": 21126084,
          "startsTime": "00:00:00",
          "endsTime": "05:00:00"
        }
      ]
    },
    {
      "day": "sun",
      "storeSchedules": [
        {
          "id": 1171833,
          "startsTime": "00:00:00",
          "endsTime": "13:00:00"
        }
      ]
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta               | Descripción                                               |
| --------------------------------- | --------------------------------------------------------- |
| `day`<br/>_string_                | Identificador del dia.                                    |
| `storeSchedules`<br/>_list_       | Lista de franjas horarias.                                |
| `storeSchedules.id`<br/>_integer_ | Id de la franja horaria.                                  |
| `startsTime`<br/>_string_         | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `endsTime`<br/>_string_           | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## GET store/schedule/{storeId}/holiday

Use este endpoint para obtener todo el horario para los dias festivos

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/holiday`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador de la tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday");

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
  path: "/api/rest-ops-utils/store/schedule/999/holiday",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday"
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

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "storeSpecialScheduleDays": [
    {
      "id": 270,
      "name": "Festivo",
      "month": 2,
      "day": 22,
      "cityId": null,
      "storeSchedules": []
    },
    {
      "id": 10342,
      "name": "Festivo",
      "month": 3,
      "day": 15,
      "cityId": null,
      "storeSchedules": [
        {
          "id": 2334763,
          "startsTime": "00:00:00",
          "endsTime": "10:00:00"
        }
      ]
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                                               | Descripción                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `storeSpecialScheduleDays`<br/>_list_                             | Lista de dias festivos.                                   |
| `storeSpecialScheduleDays.id`<br/>_integer_                       | ID de dia festivo.                                        |
| `storeSpecialScheduleDays.name`<br/>_string_                      | Nombre de dia festivo.                                    |
| `storeSpecialScheduleDays.month`<br/>_integer_                    | Mes del dia festivo.                                      |
| `storeSpecialScheduleDays.day`<br/>_integer_                      | Número del dia festivo.                                   |
| `storeSpecialScheduleDays.cityId`<br/>_integer_                   | ID de la ciudad (Opcional)                                |
| `storeSpecialScheduleDays.storeSchedules`<br/>_list_              | Lista de franjas horarias                                 |
| `storeSpecialScheduleDays.storeSchedules.id`<br/>_integer_        | Id de la franja horaria.                                  |
| `storeSpecialScheduleDays.storeSchedules.startsTime`<br/>_string_ | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `storeSpecialScheduleDays.storeSchedules.endsTime`<br/>_string_   | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## GET store/schedule/{storeId}/special

Use este endpoint para obtener todo el horario para los dias especiales de su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`GET https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special");

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
  path: "/api/rest-ops-utils/store/schedule/999/special",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special"

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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special"
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

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "storeSpecialScheduleDays": [
    {
      "id": 270,
      "name": "Cumpleaños de Daniel",
      "month": 6,
      "day": 20,
      "cityId": null,
      "storeSchedules": []
    },
    {
      "id": 10342,
      "name": "Aniversario",
      "month": 3,
      "day": 15,
      "cityId": null,
      "storeSchedules": [
        {
          "id": 2334761,
          "startsTime": "00:00:00",
          "endsTime": "10:00:00"
        }
      ]
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                                               | Descripción                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `storeSpecialScheduleDays`<br/>_list_                             | Lista de dias especiales.                                 |
| `storeSpecialScheduleDays.id`<br/>_integer_                       | ID de dia especial.                                       |
| `storeSpecialScheduleDays.name`<br/>_string_                      | Nombre de dia especial.                                   |
| `storeSpecialScheduleDays.month`<br/>_integer_                    | Mes del dia especial.                                     |
| `storeSpecialScheduleDays.day`<br/>_integer_                      | Número del dia especial.                                  |
| `storeSpecialScheduleDays.cityId`<br/>_integer_                   | ID de la ciudad (Opcional)                                |
| `storeSpecialScheduleDays.storeSchedules`<br/>_list_              | Lista de franjas horarias                                 |
| `storeSpecialScheduleDays.storeSchedules.id`<br/>_integer_        | Id de la franja horaria.                                  |
| `storeSpecialScheduleDays.storeSchedules.startsTime`<br/>_string_ | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `storeSpecialScheduleDays.storeSchedules.endsTime`<br/>_string_   | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## POST store/schedule/{storeId}

Use este endpoint para crear una nueva franja horaria para su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999`

> Ejemplo del Request:

```json
{
  "day": "mon",
  "starts_time": "08:00:00",
  "ends_time": "09:00:00"
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString =
        "    {\n" +
        "        \"day\": \"mon\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    }\n"

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
  path: "/api/rest-ops-utils/store/schedule/999",
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
  day: "mon",
  starts_time: "08:00:00",
  ends_time: "09:00:00",
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999"

payload = "{\n" +
            "  \"day\":  \"mon\",\n" +
            "  \"starts_time\": \"08:00:00\",\n" +
            "  \"ends_time\": \"20:00:00\"\n" +
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999"
	method := "POST"

	payload := strings.NewReader(""{\n" +
        "  \"day\": \"mon\",\n" +
        "  \"starts_time\": \"08:00:00\",\n" +
        "  \"ends_time\": \"20:00:00\"\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                  | Requerido   | Descripción                                             |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `day`<br/>_string_         | `requerido` | Dia del horario. "mon,tue,wed,thu,fri,sat,sun"          |
| `starts_time`<br/>_string_ | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |
| `ends_time`<br/>_string_   | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "day": "mon",
  "storeSchedules": [
    {
      "id": 21126292,
      "starts_time": "08:00:00",
      "ends_time": "09:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta               | Descripción                                               |
| --------------------------------- | --------------------------------------------------------- |
| `day`<br/>_string_                | Identificador del dia.                                    |
| `storeSchedules`<br/>_list_       | Lista de franjas horarias.                                |
| `storeSchedules.id`<br/>_integer_ | Id de la franja horaria.                                  |
| `startsTime`<br/>_string_         | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `endsTime`<br/>_string_           | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## POST store/schedule/{storeId}/holiday/{holidayDayId}

Use este endpoint para crear una nueva franja horaria para su tienda en un dia feriado

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/holiday/{holidayDayId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{holidayDayId}`: Es el identificador del dia feriado en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday/{holidayDayId}`

> Ejemplo del Request:

```json
[
  {
    "startsTime": "10:00:00",
    "endsTime": "12:00:00"
  }
]
```

>

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday/{holidayDayId}");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString =
        "[\n" +
        "    {\n" +
        "        \"day\": \"mon\",\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    }\n"
        "]\n"

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
  path: "/api/rest-ops-utils/store/schedule/999/holiday/{holidayDayId}",
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
    day: "mon",
    starts_time: "08:00:00",
    ends_time: "09:00:00",
  },
]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday/{holidayDayId}"

payload = "[\n" +
                "{\n" +
                "  \"day\":  \"mon\",\n" +
                "  \"starts_time\": \"08:00:00\",\n" +
                "  \"ends_time\": \"20:00:00\"\n" +
                "}\n"
           "]\n"
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/holiday/{holidayDayId}"
	method := "POST"

	payload := strings.NewReader(""[{\n" +
        "  \"day\": \"mon\",\n" +
        "  \"starts_time\": \"08:00:00\",\n" +
        "  \"ends_time\": \"20:00:00\"\n" +
        "}]")

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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                  | Requerido   | Descripción                                             |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `starts_time`<br/>_string_ | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |
| `ends_time`<br/>_string_   | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |

<aside class="notice">
  <p>NOTA</p>
  <p>Es posible crear multiples franjas horarias al tiempo en un dia feriado</p>
</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
[
  {
    "id": 21126293,
    "startsTime": "10:00:00",
    "endsTime": "12:00:00"
  },
  {
    "id": 21126294,
    "startsTime": "13:00:00",
    "endsTime": "15:00:00"
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta       | Descripción                                               |
| ------------------------- | --------------------------------------------------------- |
| `id`<br/>_integer_        | Id de la franja horaria.                                  |
| `startsTime`<br/>_string_ | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `endsTime`<br/>_string_   | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## POST store/schedule/{storeId}/special

Use este endpoint para crear un dia especial para su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special`

> Ejemplo del Request:

```json
{
  "day": 10,
  "month": 10,
  "name": "Dia especial",
  "schedules": [
    {
      "startsTime": "09:00:00",
      "endsTime": "12:00:00"
    },
    {
      "startsTime": "15:00:00",
      "endsTime": "16:00:00"
    }
  ]
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString =
        "{\n" +
        "    \"day\": \"10\",\n" +
        "    \"month\": \"10\",\n" +
        "    \"name\": \"Dia especial\",\n" +
        "    \"schedules\": [ \n" +
        "        {\n" +
        "            \"starts_time\": \"08:00:00\",\n" +
        "            \"ends_time\": \"20:00:00\"\n" +
        "        }\n" +
        "    ]\n"
        "}\n"

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
  path: "/api/rest-ops-utils/store/schedule/{storeId}/special",
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
  day: 10,
  month: 10,
  name: "Dia especial",
  schedules: [
    {
      startsTime: "09:00:00",
      endsTime: "12:00:00",
    },
    {
      startsTime: "15:00:00",
      endsTime: "16:00:00",
    },
  ],
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special"

payload = "{\n" +
        "    \"day\": \"10\",\n" +
        "    \"month\": \"10\",\n" +
        "    \"name\": \"Dia especial\",\n" +
        "    \"schedules\": [ \n" +
        "        {\n" +
        "            \"starts_time\": \"08:00:00\",\n" +
        "            \"ends_time\": \"20:00:00\"\n" +
        "        }\n" +
        "    ]\n"
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special"
	method := "POST"

	payload := strings.NewReader("{\n" +
        "    \"day\": \"10\",\n" +
        "    \"month\": \"10\",\n" +
        "    \"name\": \"Dia especial\",\n" +
        "    \"schedules\": [ \n" +
        "        {\n" +
        "            \"starts_time\": \"08:00:00\",\n" +
        "            \"ends_time\": \"20:00:00\"\n" +
        "        }\n" +
        "    ]\n"
        "}\n")

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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                            | Requerido   | Descripción                                             |
| ------------------------------------ | ----------- | ------------------------------------------------------- |
| `day`<br/>_integer_                  | `requerido` | Número del dia especial                                 |
| `month`<br/>_integer_                | `requerido` | Mes del dia especial.                                   |
| `name`<br/>_string_                  | `requerido` | Nombre del dia especial                                 |
| `schedules`<br/>_list_               | `requerido` | Lista de franjas horarias                               |
| `schedules.starts_time`<br/>_string_ | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |
| `schedules.ends_time`<br/>_string_   | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |

<aside class="notice">
  <p>NOTA</p>
  <p>Es posible crear multiples franjas horarias al tiempo en un dia especial</p>
</aside>

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "name": "Dia especial",
  "month": 11,
  "day": 10,
  "storeSchedules": [
    {
      "id": 21126295,
      "startsTime": "09:00:00",
      "endsTime": "12:00:00"
    },
    {
      "id": 21126296,
      "startsTime": "15:00:00",
      "endsTime": "16:00:00"
    }
  ]
}
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta                      | Descripción                                               |
| ---------------------------------------- | --------------------------------------------------------- |
| `name`<br/>_string_                      | Nombre del dia especial.                                  |
| `month`<br/>_integer_                    | Mes del dia especial.                                     |
| `day`<br/>_integer_                      | Número del dia especial                                   |
| `storeSchedules`<br/>_list_              | Lista de franjas horarias                                 |
| `storeSchedules.id`<br/>_integer_        | Id de la franja horaria                                   |
| `storeSchedules.startsTime`<br/>_string_ | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `storeSchedules.endsTime`<br/>_string_   | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## POST store/schedule/{storeId}/special/{specialDayId}

Use este endpoint para crear una nueva franja horaria para su tienda en un dia especial

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{specialDayId}`: Es el identificador del dia especial en Rappi.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`POST https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}`

> Ejemplo del Request:

```json
[
  {
    "startsTime": "08:00:00",
    "endsTime": "20:00:00"
  }
]
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString =
        "[\n" +
        "    {\n" +
        "        \"starts_time\": \"08:00:00\",\n" +
        "        \"ends_time\": \"20:00:00\"\n" +
        "    }\n"
        "]\n"

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
  path: "/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}",
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
    starts_time: "08:00:00",
    ends_time: "09:00:00",
  },
]);

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}"

payload = "[\n" +
                "{\n" +
                "  \"starts_time\": \"08:00:00\",\n" +
                "  \"ends_time\": \"20:00:00\"\n" +
                "}\n"
           "]\n"
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/special/{specialDayId}"
	method := "POST"

	payload := strings.NewReader(""[{\n" +
        "  \"starts_time\": \"08:00:00\",\n" +
        "  \"ends_time\": \"20:00:00\"\n" +
        "}]")

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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                  | Requerido   | Descripción                                             |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `starts_time`<br/>_string_ | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |
| `ends_time`<br/>_string_   | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
[
  {
    "id": 21126293,
    "startsTime": "08:00:00",
    "endsTime": "20:00:00"
  }
]
```

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta       | Descripción                                               |
| ------------------------- | --------------------------------------------------------- |
| `id`<br/>_integer_        | Id de la franja horaria.                                  |
| `startsTime`<br/>_string_ | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `endsTime`<br/>_string_   | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## PUT store/schedule/{storeId}/{storeScheduleId}

Use este endpoint para actualizar una franja horaria para su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{storeScheduleId}`: Es el identificador de la franja horaria.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                       |        |
| ------------------------------------- | ------ |
| Formato de respuesta                  | `JSON` |
| Requerimientos del body de la llamada | `JSON` |
| Requerimientos de autenticación       | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`PUT https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

> Ejemplo del Request:

```json
{
  "startsTime": "07:00:00",
  "endsTime": "08:00:00"
}
```

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("PUT");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setRequestProperty("x-authorization", "Bearer YOUR_TOKEN");
connection.setDoOutput(true);

String jsonInputString =
        "{\n" +
        "    \"starts_time\": \"08:00:00\",\n" +
        "    \"ends_time\": \"20:00:00\"\n" +
        "}\n"

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
  method: "PUT",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}",
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
  starts_time: "08:00:00",
  ends_time: "09:00:00",
});

req.write(postData);

req.end();
```

```python
import requests

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}"

payload = "{\n" +
          "  \"starts_time\": \"08:00:00\",\n" +
          "  \"ends_time\": \"20:00:00\"\n" +
          "}\n"
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

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}"
	method := "PUT"

	payload := strings.NewReader(""{\n" +
        "  \"starts_time\": \"08:00:00\",\n" +
        "  \"ends_time\": \"20:00:00\"\n" +
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

La siguiente tabla detalla los atributos requeridos para el Request:

| Atributos                  | Requerido   | Descripción                                             |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `starts_time`<br/>_string_ | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |
| `ends_time`<br/>_string_   | `requerido` | Inicio de la franja horaria en formato 24 hrs HH:mm:ss. |

### Ejemplo de la Respuesta

> Ejemplo de la respuesta:

```json
{
  "day": "mon",
  "storeSchedules": [
    {
      "id": 1171828,
      "startsTime": "07:00:00",
      "endsTime": "08:00:00"
    }
  ]
}
```

<aside class="notice">
  <p>NOTA</p>
  <p>Dado el ID de la franja horaria, el sistema determinará a que tipo de horario pertenece, en este ejemplo, el sistema identificó que esta franja horaria pertenece al día Lunes del horario regular</p>
</aside>

La tabla detalla los campos que puede devolver la respuesta:

| Campos de Respuesta         | Descripción                                               |
| --------------------------- | --------------------------------------------------------- |
| `day`<br/>_string_          | Identificador del dia.                                    |
| `storeSchedules`<br/>_list_ | Lista de franjas horarias.                                |
| `startsTime`<br/>_string_   | Inicio de la franja horaria en formato 24 horas HH:mm:ss. |
| `endsTime`<br/>_string_     | Final de la franja horaria en formato 24 horas HH:mm:ss.  |

## DELETE store/schedule/{storeId}/{storeScheduleId}

Use este endpoint para eliminar una franja horaria de su tienda tienda.

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{storeScheduleId}`: Es el identificador de la franja horaria.

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`DELETE https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/{storeId}/{storeScheduleId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/5432");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
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
  method: "DELETE",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/store/schedule/999/5432",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/5432"

payload = {}
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
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/5432"
	method := "DELETE"

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

<aside class="notice">
  <p>NOTA</p>
  <p>El sistema no devuelve una respuesta, por lo que si recibe un status 200 OK, significa que la eliminación fue exitosa.</p>
</aside>

## DELETE store/schedule/{storeId}/special/{specialDayId}

Use este endpoint para eliminar un dia especial de su tienda

### URL del endpoint

Utilice esta URL para llamar al endpoint:

`https://{COUNTRY_DOMAIN}/api/rest-ops-utils/DELETE store/schedule/{storeId}/special/{specialDayId}`

- `{COUNTRY_DOMAIN}`: dominio por país de Rappi. <a href="/es/api-reference/content/#dominios" target="_blank">Ver la lista de los dominios por paises.</a>
- `{storeId}`: Es el identificador del a tienda en Rappi.
- `{specialDayId}`: Es el identificador del dia especial

<aside class="notice">
  <p>NOTA</p>
  <p>Puede usar nuestro ambiente de desarrollo para hacer pruebas: <code>https://microservices.dev.rappi.com</code></p>
</aside>

### Propiedades del Endpoint

Las propiedades del Endpoint son las siguientes:

|                                 |        |
| ------------------------------- | ------ |
| Formato de respuesta            | `JSON` |
| Requerimientos de autenticación | Token  |

### Parámetros

Este endpoint no permite parámetros adicionales.

### Códigos de Respuesta

Hay diversas respuestas para este endpoint:

<aside class="ok-response">

`200` _Sin Mensaje_

</aside>

<aside class="error-response">

`400` Request inválido

</aside>

<aside class="error-response">

`401` Credenciales Inválidas

</aside>

### Ejemplo del Request

Ejemplo de cómo llamar a la API usando este Endpoint:

`DELETE https://microservices.dev.rappi.com/api/rest-ops-utils/DELETE store/schedule/{storeId}/special/{specialDayId}`

> Ejemplo del Request:

```java
URL url = new URL("https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special/5678");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("DELETE");
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
  method: "DELETE",
  hostname: "microservices.dev.rappi.com",
  path: "/api/rest-ops-utils/store/schedule/999/special/5678",
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

url = "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special/5678"

payload = {}
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
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://microservices.dev.rappi.com/api/rest-ops-utils/store/schedule/999/special/5678"
	method := "DELETE"

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

<aside class="notice">
  <p>NOTA</p>
  <p>El sistema no devuelve una respuesta, por lo que si recibe un status 200 OK, significa que la eliminación fue exitosa.</p>
</aside>
