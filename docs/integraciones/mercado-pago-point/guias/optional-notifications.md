<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/optional-notifications · capturado 2026-10-08 -->

# Configurar notificaciones opcionales

Además del tópico primario de orders, Mercado Pago ofrece tópicos opcionales que notifican a tu aplicación sobre eventos de gestión de la integración: vinculación de cuentas mediante OAuth, reclamos iniciados por compradores y contracargos. Estas notificaciones complementan el flujo principal y te permiten mantener tu sistema sincronizado con eventos que van más allá del procesamiento de pagos.

Ninguno de estos tópicos reemplaza al tópico de orders ni es obligatorio. Activa solo los que sean relevantes para tu integración.

## Tópicos disponibles

| Tópico | Nombre en el panel | Descripción |
| --- | --- | --- |
| `mp-connect` | Vinculación de aplicaciones | Notifica cuando una cuenta se vincula o desvincula a través de [OAuth](https://www.mercadopago.com.mx/developers/es/docs/security/oauth). Aplica a todas las integraciones que usen OAuth. |
| `topic_claims_integration_wh` | Reclamos | Notifica cuando un comprador inicia un reclamo o cuando se produce un cambio de estado. |
| `topic_chargebacks_wh` | Contracargos | Notifica cuando el comprador inicia un contracargo o se produce un cambio de estado. |

## Configurar Webhooks

Sigue los pasos a continuación para activar los tópicos opcionales en tu integración.

Si estás desarrollando utilizando credenciales de prueba, accede a **Tus integraciones > Detalles de la aplicación > Credenciales de prueba > Datos de las credenciales de prueba**, inicia sesión en [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/es/docs) con el usuario y la contraseña de esa cuenta de prueba y configura los Webhooks en modo producción para esa cuenta. De esta manera, podrás probar las notificaciones correctamente.

1.  Accede a [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) y selecciona la aplicación para la que deseas activar las notificaciones.

![configure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not1-app-es-v1.png)

2.  En el menú de la izquierda, selecciona **Webhooks > Configurar notificaciones**.

![configure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not2-configure-es-v1.png)

3.  Selecciona la pestaña **Modo productivo** y proporciona una `URL HTTPS` para recibir notificaciones.
    
4.  En la sección de tópicos opcionales, selecciona los eventos que deseas activar: **Vinculación de aplicaciones**, **Reclamos** y/o **Contracargos**.
    
5.  Por último, haz clic en **Guardar configuración**. Esto generará una clave secreta para tu aplicación. Ten en cuenta que esta clave no tiene plazo de caducidad y su renovación periódica no es obligatoria, aunque sí recomendada. Para hacerlo, basta con cliquear en el botón **Restablecer**.
    

## Simular la recepción de la notificación

Para garantizar que las notificaciones estén configuradas correctamente, simula su recepción siguiendo el paso a paso a continuación.

1.  Después de configurar tus Webhooks, haz clic en **Simular notificación**.
    
2.  En la pantalla de simulación, selecciona la URL que se va a probar.
    
3.  Elige el tipo de evento que deseas probar e ingresa el **ID del recurso** que se enviará en el cuerpo de la notificación (`Data ID`). ![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not5-order-es-v2.png)
    
4.  Por último, haz clic en **Enviar prueba** para verificar la solicitud, la respuesta del servidor y la descripción del evento.
    

## Validar el origen de la notificación

La validación del origen de una notificación es fundamental para asegurar la seguridad y la autenticidad de la información recibida. Este proceso ayuda a prevenir fraudes y garantiza que solo las notificaciones legítimas sean procesadas.

Mercado Pago enviará a tu servidor una notificación que incluye los siguientes componentes:

-   **_Query params_**: Acompañan la URL de la solicitud. Contienen `data.id` con el identificador del recurso notificado y `type` con el nombre del tópico.
-   **_Body_**: Contiene los detalles del evento notificado, como `action`, `api_version`, `application_id`, `date_created`, `id`, `live_mode`, `type`, `user_id` y `data`.
-   **_Header_**: Incluye la firma secreta `x-signature`, que permite validar la autenticidad de la notificación.

A continuación, se muestran ejemplos de las notificaciones para cada tópico.

```
POST /?data.id=123456789&type=mp-connect HTTP/1.1
Host: test-optional-nots.requestcatcher.com
Accept: */*
Accept-Encoding: *
Connection: keep-alive
Content-Length: 187
Content-Type: application/json
User-Agent: restclient-node/5.1.10
X-Request-Id: 4ed4fa2b-0b31-42ec-a62f-ad793c486c59
X-Rest-Pool-Name: /services/webhooks.js
X-Retry: 0
X-Signature: ts=1781009491,v1=654866c48793d9f716f255f8a8e6cb162f643d93b29391daa6ac7ce78cf0ce81
X-Socket-Timeout: 22000
{"action":"application.authorized","api_version":"v1","data":{"id":"123456789"},"date_created":"2026-06-12T13:14:01.351Z","id":100000000000,"live_mode":true,"type":"mp-connect","user_id":123456789}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `action` | _string_ | Evento notificado. Los valores posibles son `application.authorized` (vinculación) y `application.deauthorized` (desvinculación). |
| `api_version` | _string_ | Versión de la API que envía la notificación. Siempre `v1`. |
| `data.id` | _string_ | Identificador del recurso asociado al evento. |
| `date_created` | _string_ | Fecha de creación de la notificación (ISO 8601). |
| `id` | _long_ | Identificador único de la notificación. Utilízalo para el control de idempotencia. |
| `live_mode` | _boolean_ | `true` en producción, `false` en pruebas. |
| `type` | _string_ | Siempre `mp-connect`. |
| `user_id` | _long_ | Identificador del vendedor para el que se envía la notificación. |

A partir de la notificación recibida, podrás validar la autenticidad de su origen a través de la clave secreta. Esta clave será enviada en el _header_ `x-signature`, con el siguiente formato:

```
ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b
```

Para confirmar la validación, es necesario extraer la clave contenida en el _header_ y compararla con la clave otorgada para tu aplicación en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app).

Sigue uno de los enfoques a continuación para validar la autenticidad de la notificación.

Los SDKs oficiales implementan verificación de firma basada en HMAC (_HMAC-based Webhook Signature Verification_) para autenticar el origen de cada notificación recibida.

Para obtener tu clave secreta (`secret`), en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app), selecciona la aplicación, haz clic en **Webhooks > Configurar notificación** y revela la clave generada.

```
<?php
use MercadoPago\Webhook\WebhookSignatureValidator;
use MercadoPago\Exceptions\InvalidWebhookSignatureException;

try {
    WebhookSignatureValidator::validate(
        $_SERVER['HTTP_X_SIGNATURE'],
        $_SERVER['HTTP_X_REQUEST_ID'],
        $_GET['data_id'],
        $secret
    );
    http_response_code(200);
} catch (InvalidWebhookSignatureException $e) {
    http_response_code(401);
}
```

```
import { WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago';

try {
    WebhookSignatureValidator.validate({
        xSignature: req.headers['x-signature'],
        xRequestId: req.headers['x-request-id'],
        dataId:     req.query['data.id'],
        secret,
    });
    res.sendStatus(200);
} catch (err) {
    if (err instanceof InvalidWebhookSignatureError) res.status(401).end();
    else throw err;
}
```

```
from mercadopago.webhook import WebhookSignatureValidator, InvalidWebhookSignatureError

try:
    WebhookSignatureValidator.validate(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        request.args.get("data.id"),
        secret,
    )
    return "", 200
except InvalidWebhookSignatureError:
    return "", 401
```

```
import "github.com/mercadopago/sdk-go/pkg/webhook"

err := webhook.ValidateSignature(
    r.Header.Get("x-signature"),
    r.Header.Get("x-request-id"),
    r.URL.Query().Get("data.id"),
    secret,
)
if err != nil {
    w.WriteHeader(http.StatusUnauthorized)
    return
}
w.WriteHeader(http.StatusOK)
```

```
using MercadoPago.Error;
using MercadoPago.Webhook;

try {
    WebhookSignatureValidator.Validate(
        xSignature: Request.Headers["x-signature"],
        xRequestId: Request.Headers["x-request-id"],
        dataId:     Request.Query["data.id"],
        secret:     secret);
    return Ok();
} catch (InvalidWebhookSignatureException) {
    return Unauthorized();
}
```

```
import com.mercadopago.webhook.WebhookSignatureValidator;
import com.mercadopago.exceptions.MPInvalidWebhookSignatureException;

try {
    WebhookSignatureValidator.validate(
        request.getHeader("x-signature"),
        request.getHeader("x-request-id"),
        request.getParameter("data.id"),
        secret);
    response.setStatus(200);
} catch (MPInvalidWebhookSignatureException e) {
    response.setStatus(401);
}
```

```
require 'mercadopago/webhook/validator'

begin
    Mercadopago::Webhook::Validator.validate(
        request.headers['x-signature'],
        request.headers['x-request-id'],
        request.params['data.id'],
        secret
    )
    head :ok
rescue Mercadopago::Webhook::InvalidWebhookSignatureError
    head :unauthorized
end
```

## Acciones necesarias después de recibir la notificación

Cuando recibes una notificación en tu plataforma, Mercado Pago espera una respuesta para validar que la recepción fue correcta. Para eso, devuelve un `HTTP STATUS 200` o `201` dentro de los 22 segundos siguientes a la recepción.

Recomendamos que primero respondas con un `200` o `201`, y que luego proceses la notificación en el servidor, para evitar notificaciones duplicadas.

Si no se envía esta respuesta, el sistema realizará nuevos intentos de envío cada 15 minutos. Después de los primeros fallos, el intervalo se amplía progresivamente, pero las entregas continúan hasta que la notificación sea confirmada.
