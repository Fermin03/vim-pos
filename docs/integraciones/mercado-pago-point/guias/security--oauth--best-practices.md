<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/security/oauth/best-practices · capturado 2026-10-08 -->

# Buenas prácticas de integración de OAuth

A la hora de utilizar OAuth, es importante tener en cuenta ciertos aspectos para que la integración funcione correctamente.

A continuación, encontrarás una guía de posibles errores y de buenas prácticas a tener en cuenta.

## Uso correcto de los valores en los header de la solicitud

Utiliza siempre los header `accept` y `content-type` en tu solicitud POST. Ten cuidado de no agregar valores a los headers que no sean parte de la integración para evitar recibir un error como respuesta.

![oauth\_header](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/oauth/oauth_header-v1.png)

## Uso correcto de los valores 'params'

En tu llamada POST, ten cuidado de utilizar sólo los valores `params` solicitados. No agregues otros valores no requeridos ya que, de hacerlo, recibirás un código de error como respuesta.

![oauth\_params](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/oauth/oauth-1-v1.png)

## Uso correcto de los Query Params

Recuerda no enviar ningún parámetro dentro de Query Params. Envía los parámetros dentro del cuerpo de la solicitud tal como se indica en [Referencia de API](https://www.mercadopago.com.mx/developers/es/reference/authentication/oauth/_oauth_token/post).

![oauth\_queryparams](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/oauth/oauth_queryparams_v2.png)

## Uso correcto del campo 'grant\_type'

Utiliza siempre el campo `grant_type` en tus solicitudes con los valores `authorization_code` o `client_credentials`. Recuerda que si envias otro valor, es posible que recibas un error como respuesta.

![oauth\_grant\_type](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/oauth/oauth_granttype_v2.png)

## Uso del campo 'state' en la solicitud del 'autorization code'

Para aumentar la seguridad de la integración, recomendamos incluir el parámetro `state` en el flujo de solicitud del `authorization code`. Así, podrás garantizar que la respuesta pertenezca a una solicitud iniciada por la misma aplicación.

**Asegúrate de que el `redirect_uri` sea una URL estática**. Si deseas enviar parámetros adicionales en esa URL, utiliza el parámetro `state` para incluir esa información. De lo contrario, la llamada recibirá una respuesta de error si el `redirect_uri` no coincide exactamente con la configuración de la aplicación.

![oauth\_state](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/oauth/oauth_state_v4-v1.png)

Para encontrar más información acerca de la solicitud, sus parámetros y las posibles respuestas de éxito y error que puedes recibir, ve a la documentación de [Referencia de API](https://www.mercadopago.com.mx/developers/es/reference/authentication/oauth/_oauth_token/post).
