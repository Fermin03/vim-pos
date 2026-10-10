<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications · capturado 2026-10-08 -->

# Configurar notificaciones

Las notificaciones **Webhooks**, también conocidas como **devoluciones de llamada web**, son un método efectivo que permiten a los servidores de Mercado Pago enviar información en **tiempo real** cuando ocurre un evento específico relacionado con tu integración. En lugar de que tu sistema realice consultas constantes para verificar actualizaciones, los Webhooks permiten la transmisión de datos de manera **pasiva y automática** entre Mercado Pago y tu integración a través de una solicitud **HTTPS POST**, optimizando la comunicación y reduciendo la carga en los servidores.

## Configurar Webhooks

A continuación, presentaremos un paso a paso para poder recibir notificaciones de pago en integraciones con Point. Una vez configuradas, las notificaciones Webhook se enviarán siempre que ocurra cualquier actualización sobre el tópico reportado, incluyendo creación y actualización de orders y procesamiento de transacciones.

Si estás desarrollando utilizando credenciales de prueba, accede a **Tus integraciones > Datos de integración > Credenciales de prueba > Datos de las credenciales de prueba**, inicia sesión en [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/es/docs) con el usuario y la contraseña de esa cuenta de prueba y configura los Webhooks en modo producción para esa cuenta. De esta manera, podrás probar las notificaciones correctamente.

1.  Ingresa a [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) y selecciona la aplicación integrada con Point para la que deseas activar las notificaciones.

![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not1-app-es-v1.png)

2.  En el menú de la izquierda, selecciona **Webhooks > Configurar notificaciones**.

![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not2-configure-es-v1.png)

3.  Selecciona la pestaña **Modo productivo** y proporciona una `URL HTTPS` para recibir notificaciones con tu integración productiva.

![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not3-url-es-v1.png)

En caso de ser necesario identificar múltiples cuentas, agrega el parámetro `?client=(nombredelvendedor)` al final de la URL indicada para identificar a los vendedores.

4.  Selecciona el evento **Order (Mercado Pago)** para recibir notificaciones, que serán enviadas en formato `JSON` a través de un `HTTPS POST` a la URL especificada anteriormente.

![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not4-order-es-v1.png)

5.  Por último, haz clic en **Guardar configuración**. Esto generará una clave secreta exclusiva para la aplicación, que permitirá validar la autenticidad de las notificaciones recibidas, garantizando que hayan sido enviadas por Mercado Pago. Ten en cuenta que esta clave generada no tiene plazo de caducidad y su renovación periódica no es obligatoria, aunque sí recomendada. Para hacerlo, basta con cliquear en el botón **Restablecer**.

Al concluir, tus notificaciones Webhooks para Mercado Pago Point estarán configuradas y podrás recibir los siguientes alertas sobre la order:

-   **Procesada** (`order.processed`)
-   **Cancelada** (`order.canceled`)
-   **Reembolsada** (`order.refunded`)
-   **Requiera una confirmación en la terminal** (`order.action_required`)
-   **Falló** (`order.failed`)
-   **Expirada** (`order.expired`)

## Simular la recepción de la notificación

Para garantizar que las notificaciones sean configuradas correctamente, es necesario simular su recepción. Para hacerlo, sigue el paso a paso a continuación.

1.  Después de configurar tus Webhooks, haz clic en **Simular notificación**.
2.  En la pantalla de simulación, selecciona la URL que se va a probar.
3.  A continuación, elige el **tipo de evento** e ingresa la **identificación** que se enviará en el cuerpo de la notificación (`Data ID`).

![cofigure notifications](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/not5-order-es-v2.png)

4.  Por último, haz clic en **Enviar prueba** para verificar la solicitud, la respuesta proporcionada por el servidor y la descripción del evento. Recibirás una respuesta según los ejemplos a continuación, que representan el _body_ de la notificación recibida en tu servidor.

```
{
  "action": "order.processed",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ext_ref_1235",
    "id": "ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D",
    "status": "processed",
    "status_detail": "accredited",
    "total_paid_amount": "120",
    "transactions": {
      "payments": [
        {
          "amount": "120",
          "id": "PAY01K22Y503EJ8JHGF64KGY1PZ2B",
          "paid_amount": "120",
          "payment_method": {
            "id": "debvisa",
            "installments": 1,
            "type": "debit_card"
          },
          "reference": {
            "id": "123456789980"
          },
          "status": "processed",
          "status_detail": "accredited"
        }
      ]
    },
    "type": "point",
    "version": 3
  },
  "date_created": "2025-08-07T18:54:40.851374414Z",
  "live_mode": true,
  "type": "order",
  "user_id": "123456"
}
```

## Validar origen de la notificación

La validación del origen de una notificación es fundamental para asegurar la seguridad y la autenticidad de la información recibida. Este proceso ayuda a prevenir fraudes y garantiza que solo las notificaciones legítimas sean procesadas.

Mercado Pago enviará a tu servidor una notificación similar al ejemplo a continuación para una alerta del tópico `order`. En este ejemplo, se incluye la notificación completa, que contiene los _query params_, el _body_ y el _header_ de la notificación.

-   **_Query params_**: Son parámetros de consulta que acompañan la URL. En el ejemplo, tenemos `data.id=ORD01JQ4S4KY8HWQ6NA5PXB65B3D3` y `type=order`.
-   **_Body_**: El cuerpo de la notificación contiene información detallada sobre el evento, como `action`, `api_version`, `application_id`, `date_created`, `id`, `live_mode`, `type`, `user_id` y `data`.
-   **_Header_**: El encabezado contiene metadatos importantes, incluyendo la firma secreta de la notificación `x-signature`.

```
POST /test?data.id=ORD01JQ4S4KY8HWQ6NA5PXB65B3D3&type=order HTTP/1.1
Host: prueba.requestcatcher.com
Accept: */*
Accept-Encoding: *
Connection: keep-alive
Content-Length: 177
Content-Type: application/json
Newrelic: eyJ2IjpbMCwxXSwiZCI6eyJ0eSI6IkFwcCIsImFjIjoiOTg5NTg2IiwiYXAiOiI5NjA2MzYwOTQiLCJ0eCI6ImY4MzljZjg4ODg2MGRmZTIiLCJ0ciI6ImMwOGMwZGMyMjNjZDY2YjJkZWQwMjUxZmYxNWNiNGQ1IiwicHIiOjEuMjUwMzIsInNhIjp0cnVlLCJ0aSI6MTc0Mjg0MjU4MDE2NCwiaWQiOiIxOGI2NDcxNjNkNzI3NjU4IiwidGsiOiIxNzA5NzA3In19=
Traceparent: 00-c08c0dc223cd66b2ded0251ff15cb4d5-18b647163d727658-01
Tracestate: 1709707@nr=0-0-989586-960636094-18b647163d727658-f839cf888860dfe2-1-1.250320-1742842580164
User-Agent: restclient-node/4.15.3
X-Request-Id: 2066ca19-c6f1-498a-be75-1923005edd06
X-Rest-Pool-Name: /services/webhooks.js
X-Retry: 0
X-Signature: ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b
X-Socket-Timeout: 22000
{"action":"order.action_required","api_version":"v1","application_id":"76506430185983","date_created":"2021-11-01T02:02:02Z","id":"123456","live_mode":false,"type":"order","user_id":2025701502,"data":{"id":"ORD01JQ4S4KY8HWQ6NA5PXB65B3D3"}}
```

A partir de la notificación Webhook recibida, podrás validar la autenticidad de su origen a través la clave secreta. Esta clave será enviada en el _header_ `x-signature`, que será similar al ejemplo debajo.

```
ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b
```

Para confirmar la validación, es necesario extraer la clave contenida en el _header_ y compararla con la clave otorgada para tu aplicación en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app).

Sigue uno de los enfoques a continuación para validar la autenticidad de la notificación.

Los SDKs oficiales implementan verificación de firma basada en HMAC (_HMAC-based Webhook Signature Verification_) para autenticar el origen de cada notificación recibida.

Para obtener tu clave secreta (`secret`), en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) selecciona la aplicación, haz clic en **Webhooks > Configurar notificación** y revela la clave generada.

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

Cuando recibes una notificación en tu plataforma, Mercado Pago espera una respuesta para validar que esa recepción fue correcta. Para eso, debes devolver un `HTTP STATUS 200 (OK)` o `201 (CREATED)`.

El tiempo de espera para esa confirmación será de 22 segundos. Si no se envía esta respuesta, el sistema entenderá que la notificación no fue recibida y realizará un nuevo intento de envío cada 15 minutos, hasta que reciba la respuesta. Después del tercer intento, el plazo será prorrogado, pero los envíos continuarán sucediendo.

Luego de responder a la notificación Webhook y confirmar su recibimiento, solo si la información recibida no es suficiente y necesitas información adicional, es posible obtener todos los datos sobre el recurso notificado enviando un **GET** al endpoint [/v1/orders/{id}GET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get).

Con esta información podrás realizar las actualizaciones necesarias en tu plataforma, como actualizar un pago aprobado.
