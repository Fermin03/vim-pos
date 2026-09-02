
# Autenticación

Para autenticarte al realizar solicitudes API a la API de Rappi, necesitas un _Token de acceso_.

El API de Rappi utiliza un esquema de <a href="https://swagger.io/docs/specification/authentication/bearer-authentication/" target="_blank">Bearer authentication</a>, como método de autenticación HTTP para solicitudes de API.

Para realizar solicitudes a la API, envía el token en un _encabezado customizado_ para interactuar con los recursos protegidos.

Rappi utiliza el siguiente esquema para la autenticación Bearer:

| Key               | Value                    |
| ----------------- | ------------------------ |
| `x-authorization` | `Bearer: <access_token>` |

La siguiente tabla describe los diferentes contenidos del recurso de autenticación:

| Recursos                                                           | Descripcion                                                                                  | Observaciones |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------- |
| [`POST v1/token/login/integrations`](#post-login-de-integraciones) | Utilice este punto final para generar un token de acceso para los servicios de integraciones |               |
| [`POST v1/token/login/utils`](#post-login-de-utlis)                | Utilice este punto final para generar un token de acceso para los servicios de utils         |               |

## POST login de integraciones

Utilice este punto de conexión para generar un token de acceso. Este token le permite autenticarse al realizar solicitudes de API para integraciones.

### URL del endpoint

Utilice las siguientes URL para realizar una solicitud con este punto final:

**URL**: `https://{NEW_DOMAIN}/restaurants/auth/v1/token/login/integrations`

- `{NEW_DOMAIN}`: This is your new Rappi Country Domain. [See the list of new Country Domains](/es/api-reference/content/#nuevos-dominios).

<aside class="notice">
    <p><b>NOTA</b></p>
    <p>Para ejemplos de solicitudes de API en este sitio, utilizamos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
    <p><b>IMPORTANTE: </b> Su token de acceso tiene una validez de <b>1 semana</b></p>
</aside>

### Propiedades del endpoint

Este recurso tiene las siguientes propiedades:

|                        |        |
| ---------------------- | ------ |
| Cuerpo de la solicitud | _json_ |
| Cuerpo de la respuesta | _json_ |

### Parametros

Este endpoint no permite parámetros adicionales.

### Codigos de respuesta

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Correcto

</aside>
<aside class="error-response">

`403` No autorizado

</aside>

### Ejemplo de solicitud

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`POST https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations`

> Este es un ejemplo de la solicitud:

```json
{
  "client_id": "{{your_client_id}}",
  "client_secret": "{{your_client_secret}}"
}
```

Esta tabla describe los atributos que requiere el `JSON` de su solicitud:

| Atributos       |          | Requerido | Descripcion                                 |
| --------------- | -------- | --------- | ------------------------------------------- |
| `client_id`     | _string_ | `true`    | Client Id de tus credenciales de Rappi.     |
| `client_secret` | _string_ | `true`    | Client Secret de tus credenciales de Rappi. |

```curl
curl --location 'https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations' \
--header 'Content-Type: application/json' \
--data
'{
    "client_id": "{{your_client_id}}",
    "client_secret": "{{your_client_secret}}"
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setDoOutput(true);

final String jsonInputString = "{\n" +
                "   \"client_id\":\"{{your_client_id}}\",\n" +
                "   \"client_secret\":\"{{your_client_secret}}\"\n" +
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

```python
import requests

url = "https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations"

payload = "{ \"client_id\":\"{{your_client_id}}\"," \
         "\"client_secret\":\"{{your_client_secret}}\" }"
headers = { 'Content-Type': 'application/json' }

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/auth/v1/token/login/integrations?",
  headers: {
    "Content-Type": "application/json",
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
  client_id: "{{your_client_id}}",
  client_secret: "{{your_client_secret}}",
});

req.write(postData);

req.end();
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

	url := "https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations"
	method := "POST"

	payload := strings.NewReader("{\n   " +
		"\"client_id\":\"{{your_client_id}}\",\n   " +
		"\"client_secret\":\"{{your_client_secret}}\",\n}")

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemplo de respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6Ikp",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object |           | Object Description                               |
| --------------- | --------- | ------------------------------------------------ |
| `access_token`  | _string_  | Token de acceso para acceder a endpoint seguros. |
| `token_type`    | _string_  | Tipo de token.                                   |
| `expires_in`    | _integer_ | Tiempo de validez del token en segundos.         |

## POST login de utlis

Utilice este punto final para generar un token de acceso. Este token le permite autenticarse al realizar solicitudes de API para utilidades.

### URL del endpoint

Utilice las siguientes URL para realizar una solicitud con este endpoint:

**URL**: `https://{NEW_DOMAIN}/restaurants/auth/v1/token/login/utils`

- `{NEW_DOMAIN}`: This is your new Rappi Country Domain. [See the list of new Country Domains](/es/api-reference/content/#nuevos-dominios).

<aside class="notice">
    <p><b>NOTE</b></p>
    <p>Para ejemplos de solicitudes de API en este sitio, utilizamos el dominio del desarrollador: <code>https://api.dev.rappi.com</code></p>
    <p><b>IMPORTANTE: </b> Su token de acceso tiene una validez de <b>1 semana</b></p>
</aside>

### Propiedades del endpoint

Este recurso tiene las siguientes propiedades:

|                        |        |
| ---------------------- | ------ |
| Cuerpo de la solicitud | _json_ |
| Cuerpo de la respuesta | _json_ |

### Parametros

Este endpoint no permite parámetros adicionales.

### Codigos de respuesta

Estos son los posibles códigos de estado de la respuesta para este endpoint:

<aside class="ok-response">

`200` Correcto

</aside>
<aside class="error-response">

`403` No autorizado

</aside>

### Ejemplo de solicitud

Este es un ejemplo de una solicitud de API que utiliza este endpoint:

`POST https://api.dev.rappi.com/restaurants/auth/v1/token/login/integrations`

> Este es un ejemplo de la solicitud:

```json
{
  "client_id": "{{your_client_id}}",
  "client_secret": "{{your_client_secret}}"
}
```

Esta tabla describe los atributos que requiere el `JSON` de su solicitud:

| Atributos       |          | Requerido | Descripcion                                 |
| --------------- | -------- | --------- | ------------------------------------------- |
| `client_id`     | _string_ | `true`    | Client Id de tus credenciales de Rappi.     |
| `client_secret` | _string_ | `true`    | Client Secret de tus credenciales de Rappi. |

>

```curl
curl --location 'https://api.dev.rappi.com/restaurants/auth/v1/token/login/utils' \
--header 'Content-Type: application/json' \
--data
'{
    "client_id": "{{your_client_id}}",
    "client_secret": "{{your_client_secret}}"
}'
```

```java
URL url = new URL("https://api.dev.rappi.com/restaurants/auth/v1/token/login/utils");

HttpURLConnection connection = (HttpURLConnection) url.openConnection();
connection.setRequestMethod("POST");
connection.setRequestProperty("User-Agent", "Mozilla/5.0");
connection.setRequestProperty("Content-Type", "application/json");
connection.setRequestProperty("Accept", "application/json");
connection.setDoOutput(true);

final String jsonInputString = "{\n" +
                "   \"client_id\":\"{{your_client_id}}\",\n" +
                "   \"client_secret\":\"{{your_client_secret}}\"\n" +
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

```python
import requests

url = "https://api.dev.rappi.com/restaurants/auth/v1/token/login/utils"

payload = "{ \"client_id\":\"{{your_client_id}}\"," \
         "\"client_secret\":\"{{your_client_secret}}\" }"
headers = { 'Content-Type': 'application/json' }

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text.encode('utf8'))
```

```javascript
var https = require("https");

var options = {
  method: "POST",
  hostname: "api.dev.rappi.com",
  path: "/restaurants/auth/v1/token/login/utils?",
  headers: {
    "Content-Type": "application/json",
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
  client_id: "{{your_client_id}}",
  client_secret: "{{your_client_secret}}",
});

req.write(postData);

req.end();
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

	url := "https://api.dev.rappi.com/restaurants/auth/v1/token/login/utils"
	method := "POST"

	payload := strings.NewReader("{\n   " +
		"\"client_id\":\"{{your_client_id}}\",\n   " +
		"\"client_secret\":\"{{your_client_secret}}\"\n}")

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)

	if err != nil {
		fmt.Println(err)
	}
	req.Header.Add("Content-Type", "application/json")

	res, err := client.Do(req)
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	fmt.Println(string(body))
}
```

### Ejemple de respuesta

> Este es un ejemplo de la respuesta:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6IkpeyJhbGciOiJIUzI1NiIsInR5cCI6Ikp",
  "token_type": "Bearer",
  "expires_in": 604798
}
```

Esta tabla describe los objetos contenidos en el ejemplo de respuesta:

| Response Object |           | Object Description                               |
| --------------- | --------- | ------------------------------------------------ |
| `access_token`  | _string_  | Token de acceso para acceder a endpoint seguros. |
| `token_type`    | _string_  | Tipo de token.                                   |
| `expires_in`    | _integer_ | Tiempo de validez del token en segundos.         |
