
# Proceso de Autenticación

<a href="/es/api-reference/authentication" target="_blank" class="api">Referencia de API</a>

Esta sección contiene toda la información que necesitas para obtener tus credenciales de API y te guía a través del proceso de autenticación para utilizar la API pública de Rappi.

## Requisitos de Autenticación

Rappi utiliza <a href="https://oauth.net/2/" target="_blank"> OAuth 2.0 </a> como método de autenticación para solicitudes de API seguras a la API pública de Rappi.

Durante el proceso de integración, Rappi te otorga tu propio conjunto de credenciales de API. Con estas credenciales, debes generar un token para autenticarte al realizar solicitudes de API.

Las credenciales de API que Rappi te proporciona constan de los siguientes objetos:

| Artículo      | Descripción                                                             |
| ------------- | ----------------------------------------------------------------------- |
| Client ID     | Este es el identificador del cliente donde se autentica.                |
| Client Secret | Este es el _secret_ que necesita para autenticarse para su integración. |

!!! important
Para compatibilidad hacia atrás, aún puedes enviar los campos `audience` y `grant_type` en el cuerpo de la solicitud al usar los nuevos endpoints. El sistema ignorará estos campos y no generará ningún error. Esto permite que los clientes migren a la última versión solo modificando la URL mientras mantienen el cuerpo de la solicitud sin cambios.

## Generando un Token de Acceso

<a href="/es/api-reference/authentication#post-login-de-integraciones" class="api" target="_blank">Referencia de API</a>

Genera un token de acceso a través de una llamada a la API utilizando el <a href="/es/api-reference/authentication#post-login-de-integraciones" target="_blank">`POST login de integraciones`</a> endpoint o el <a href="/es/api-reference/authentication#post-login-de-utlis" target="_blank">`POST login de utils`</a> endpoint, dependiendo de los servicios a los que necesites acceder.

!!! important
Tu token de acceso tiene una validez de **1 semana**. Después de este tiempo, debes generar un nuevo token para continuar realizando solicitudes a los endpoints protegidos de API.

Para generar tu token:

Realiza una solicitud `POST` a una de las siguientes URLs y agrega un `JSON` al cuerpo de la solicitud con el siguiente objeto.

**Para servicios de integraciones:**
`https://{NEW_DOMAIN}/restaurants/auth/v1/token/login/integrations`

**Para servicios de utilidades:**
`https://{NEW_DOMAIN}/restaurants/auth/v1/token/login/utils`

- `{NEW_DOMAIN}`: Este es el nuevo dominio de país de Rappi. [Ver la lista de nuevos dominios de países](/es/api-reference/content/#nuevos-dominios).

El siguiente código muestra la estructura del objeto `JSON` en el cuerpo de la solicitud:

```json
{
  "client_id": "{{your_client_id}}",
  "client_secret": "{{your_client_secret}}"
}
```

!!! note
Los valores de este `JSON` no son datos reales. Asegúrate de reemplazarlos con sus propios datos cuando realices solicitudes de API.

La siguiente tabla describe los valores de los atributos del cuerpo de la solicitud:

| Atributos                   | Requisito   | Descripción                                          |
| --------------------------- | ----------- | ---------------------------------------------------- |
| `client_id`<br>_string_     | `requerido` | Identificación de cliente de tus credenciales Rappi. |
| `client_secret`<br>_string_ | `requerido` | Cliente secreto de tus credenciales Rappi.           |

El sistema responde con tu `access_token`.

Ahora que tienes tu token, puedes comenzar a integrarte con la API pública de Rappi.

## Usando tu Token de Acceso

Para autenticarte utilizando tu token de acceso al realizar solicitudes de API:

Incluye tu token de acceso en un encabezado personalizado de tu solicitud con los siguientes valores:

| Clave             | Valor                       |
| ----------------- | --------------------------- |
| `x-authorization` | `Bearer` [`{access_token}`] |

`{access_token}`: Este es el token de acceso que generaste.

Asegúrate de incluir estos valores en el encabezado de todas tus solicitudes de API para una autenticación exitosa.
