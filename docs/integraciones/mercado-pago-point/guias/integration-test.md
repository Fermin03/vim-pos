<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/integration-test · capturado 2026-10-08 -->

# Probar la integración

La prueba de integración de Mercado Pago Point a tu sistema se basa en la simulación de diferentes estados de transacción utilizando nuestra API. De esta forma, podrás garantizar el correcto funcionamiento de tu integración antes de salir a producción, a partir de diferentes escenarios de prueba. No es posible procesar pagos reales en la terminal física utilizando cuentas de prueba; para realizar transacciones reales en el dispositivo Point, es necesario utilizar una cuenta productiva con medios de pago reales.

En estas pruebas, debes utilizar credenciales de prueba. Aunque la simulación permite validar la integración sin necesidad de interacción con la terminal en cada transacción de prueba, **es recomendable que la terminal esté previamente vinculada con tus credenciales de prueba**. Para más información sobre cómo realizar esta asociación, accede a [Configurar terminal](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal).

Antes de iniciar las pruebas, asegúrate de que las [notificaciones Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications) estén configuradas. Esta configuración es necesaria para validar el correcto funcionamiento de las notificaciones en cada escenario de prueba.

## Usar dispositivo virtual estándar

Si no cuentas con un dispositivo físico, puedes utilizar un dispositivo virtual estándar (identificado por el serial `SBX0000001`) para realizar las pruebas. Este dispositivo es compatible con cualquier terminal (`poi_type`) válido para el país, por lo que puedes crear una order utilizando, por ejemplo, `NEWLAND_N950__SBX0000001`.

El dispositivo virtual estándar no es válido para medición de calidad de integración.

## Simular los escenarios de prueba

Selecciona y ejecuta los escenarios deseados para validar tu integración. Para simular los diferentes escenarios de prueba a continuación, debes utilizar el Access Token de prueba.

El cambio de estado puede demorar hasta 10 segundos en procesarse (o hasta 40 segundos para simular el estado `action_required`) y, durante ese proceso, la order cambiará automáticamente al estado `at_terminal` antes de alcanzar el estado final solicitado, **excepto** en el caso del estado `refunded`, que transiciona directamente. Para más información sobre los posibles estados, consulta la documentación [Estado de una order y de una transacción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/status-order-transaction).

## Crear una order y procesar el pago

Para probar la correcta creación de una order y el procesamiento del pago asociado, sigue los pasos a continuación.

1.  Envía una solicitud al endpoint [Crear orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) utilizando el Access Token de prueba.
2.  Almacena el identificador de la order, devuelto en la respuesta a su creación bajo el parámetro `id`.
3.  Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order (`order_id`) creada en el paso 1. En el _body_ de la solicitud, informa el campo `status` con el valor `processed`, como muestra el ejemplo debajo.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "processed",
        "payment_method_type": "credit_card",
        "installments": 1,
        "payment_method_id": "visa",
        "status_detail": "accredited"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. | `processed` | Obligatorio |
| `payment_method_type` | _Body. String_ | Tipo de medio de pago a utilizar en la simulación. | `debit_card`, `credit_card` | Opcional |
| `installments` | _Body. Integer_ | Número de meses del pago. | `1` | Condicional. Envía este campo solo cuando `payment_method_type` sea `credit_card`. |
| `payment_method_id` | _Body. String_ | Bandera del medio de pago. | `amex`, `master`, `visa`, `debmaster`, `debvisa` | Condicional. Envía este campo cuando `payment_method_type` sea `debit_card` o `credit_card`. |
| `status_detail` | _Body. String_ | Detalle específico del estado que deseas simular. | `accredited` | Opcional |

Si la solicitud es exitosa, la respuesta devolverá el estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.processed`. En el nodo `transactions.payments`, será posible consultar el `status` del pago, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
    "action": "order.processed",
    "api_version": "v1",
    "application_id": "2644473656269379",
    "data": {
        "external_reference": "ext-ref",
        "id": "ORD01JY0PGGPZ4DBV73E2PXRBCQ84",
        "status": "processed",
        "status_detail": "accredited",
        "total_paid_amount": "5.00",
        "transactions": {
            "payments": [
                {
                    "amount": "5.00",
                    "id": "PAY01JY0PGGPZ4DBV73E2Q0DQZQCJ",
                    "paid_amount": "5.00",
                    "payment_method": {
                        "id": "visa",
                        "installments": 1,
                        "type": "credit_card"
                    },
                    "reference": {
                        "id": "115019989861"
                    },
                    "status": "processed",
                    "status_detail": "accredited"
                }
            ]
        },
        "type": "point",
        "version": 3
    },
    "date_created": "2025-06-18T05:00:19.274162018Z",
    "live_mode": false,
    "type": "order",
    "user_id": "123456"
}
```

## Simular una falla en el pago

Para validar que tu integración maneja correctamente los pagos fallidos, puedes simular el estado `failed` de una order.

1.  Envía una nueva solicitud al endpoint [Crear orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) utilizando el Access Token de prueba.
2.  Almacena el identificador de la order, devuelto en la respuesta a su creación bajo el parámetro `id`.
3.  Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order (`order_id`) creada en el paso 1. En el _body_ de la solicitud, informa el campo `status` con el valor `failed`.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "failed",
        "payment_method_type": "credit_card",
        "installments": 1,
        "payment_method_id": "visa",
        "status_detail": "insufficient_amount"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. | `failed` | Obligatorio |
| `payment_method_type` | _Body. String_ | Tipo de medio de pago a ser utilizado en la simulación. | `debit_card`, `credit_card` | Opcional |
| `installments` | _Body.Integer_ | Número de meses del pago. | `1` | Condicional. Envía este campo solo cuando `payment_method_type` sea `credit_card`. |
| `payment_method_id` | _Body.String_ | Bandera del medio de pago. | `amex`, `master`, `visa`, `debmaster`, `debvisa` | Condicional. Envía este campo cuando `payment_method_type` sea `debit_card` o `credit_card`. |
| `status_detail` | _Body.String_ | Detalle específico del estado que deseas simular. | `bad_filled_card_data`, `required_call_for_authorize`, `card_disabled`, `high_risk`, `insufficient_amount`, `invalid_installments`, `max_attempts_exceeded`, `rejected_other_reason`, `processing_error` | Opcional |

Si la solicitud es exitosa, la respuesta devolverá el estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.failed`. En el nodo `transactions.payments`, será posible consultar el `status` del pago, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
  "action": "order.failed",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ext_ref_1234",
    "id": "ORD01K23219YK26BC6GK0HASE8VT6",
    "status": "failed",
    "status_detail": "failed",
    "transactions": {
      "payments": [
        {
          "amount": "120",
          "id": "PAY01K22Y503EJ8JHGF64KGY1PZ2B",
          "payment_method": {
            "id": "debvisa",
            "installments": 1,
            "type": "debit_card"
          },
          "reference": {
            "id": "123456789980"
          },
          "status": "failed",
          "status_detail": "bad_filled_card_data"
        }
      ]
    },
    "type": "point",
    "version": 3
  },
  "date_created": "2025-08-07T20:03:04.897928692Z",
  "live_mode": false,
  "type": "order",
  "user_id": "123456"
}
```

## Reembolsar un pago

Para confirmar que el flujo de reembolso está funcionando correctamente, es necesario simular el estado `refunded` en una order previamente procesada. La simulación de este estado solo puede realizarse en orders que ya estén con el estado `processed`. Por lo tanto, ejecuta primero el escenario "Crear una order y procesar el pago".

Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order procesada anteriormente. En el _body_ de la solicitud, informa el campo `status` con el valor `refunded`.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "refunded"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. **Importante:** Para simular este estado, la order debe haber sido procesada previamente. | `refunded` | Obligatorio |

Si la solicitud es exitosa, la respuesta devolverá el estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.refunded`, indicando que la order fue reembolsada, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
    "action": "order.refunded",
    "api_version": "v1",
    "application_id": "2644473656269379",
    "data": {
        "external_reference": "ext-ref",
        "id": "ORD01JY0PGGPZ4DBV73E2PXRBCQ84",
        "status": "refunded",
        "status_detail": "refunded",
        "total_paid_amount": "5.00",
        "type": "point",
        "version": 4
    },
    "date_created": "2025-06-18T05:05:08.255803326Z",
    "live_mode": false,
    "type": "order",
    "user_id": "123456"
}
```

## Crear y cancelar una order de pago

Para validar que el flujo de cancelación de pagos funciona correctamente, puedes simular el estado `canceled` de una order.

1.  Envía una solicitud al endpoint [Crear orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) utilizando el Access Token de prueba.
2.  Almacena el identificador de la order, devuelto en la respuesta a su creación bajo el parámetro `id`.
3.  Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order creada en el paso 1. En el _body_ de la solicitud, informa el campo `status` con el valor `canceled`.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "canceled"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. | `canceled` | Obligatorio |

Si la solicitud es exitosa, la respuesta devolverá EL estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.canceled`. En el nodo `transactions.payments`, será posible consultar el `status` del pago, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
  "action": "order.canceled",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ext_ref_1234",
    "id": "ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D",
    "status": "canceled",
    "status_detail": "canceled",
    "transactions": {
      "payments": [
        {
          "amount": "120",
          "id": "PAY01K22Y503EJ8JHGF64KGY1PZ2B",
          "status": "canceled",
          "status_detail": "canceled_on_terminal"
        }
      ]
    },
    "type": "point",
    "version": 3
  },
  "date_created": "2025-08-07T19:30:44.741479284Z",
  "live_mode": false,
  "type": "order",
  "user_id": "123456"
}
```

## Simular expiración de una order

Para validar que tu integración maneja correctamente las orders expiradas, puedes simular el estado `expired`.

1.  Envía una solicitud al endpoint [Crear orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) utilizando el Access Token de prueba.
2.  Almacena el identificador de la order, devuelto en la respuesta a su creación bajo el parámetro `id`.
3.  Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order (`order_id`) creada previamente. En el _body_ de la solicitud, informa el campo `status` con el valor `expired`.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "expired"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. | `expired` | Obligatorio |

Si la solicitud es exitosa, la respuesta devolverá el estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.expired`. En el nodo `transactions.payments`, será posible consultar el `status` del pago, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
  "action": "order.expired",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ext_ref_1234",
    "id": "ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D",
    "status": "expired",
    "status_detail": "expired",
    "transactions": {
      "payments": [
        {
          "amount": "120",
          "id": "PAY01K22Y503EJ8JHGF64KGY1PZ2B",
          "status": "expired",
          "status_detail": "expired"
        }
      ]
    },
    "type": "point",
    "version": 3
  },
  "date_created": "2025-08-07T19:50:29.172256789Z",
  "live_mode": false,
  "type": "order",
  "user_id": "123456"
}
```

## Simular acción requerida

En algunos casos, una transacción puede requerir una acción adicional del cliente en la terminal. Para validar que tu integración maneja correctamente este escenario, puedes simular el estado `action_required` de una order. La simulación de este estado puede demorar hasta 40 segundos en procesarse.

1.  Envía una solicitud al endpoint [Crear orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post) utilizando el Access Token de prueba.
2.  Almacena el identificador de la order, devuelto en la respuesta a su creación bajo el parámetro `id`.
3.  Envía una solicitud al endpoint [Simular estado de la orderPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/simulate-order/post), reemplazando el `{order_id}` en el _path_ de la solicitud por el ID de la order (`order_id`) creada en el paso 1. En el _body_ de la solicitud, informa el campo `status` con el valor `action_required`.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{order_id}/events' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
    -d '{
        "status": "action_required"
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que se pueden enviar en esta solicitud.

| Atributo | Tipo | Descripción | Valores posibles | Obligatoriedad |
| --- | --- | --- | --- | --- |
| `status` | _Body. String_ | Estado final que deseas simular para la order. | `action_required` | Obligatorio |

Si la solicitud es exitosa, la respuesta devolverá el estado `204 No Content`, sin _body_.

Recibirás una notificación Webhook de Mercado Pago con el campo `action` definido como `order.action_required`, indicando que se requiere una acción en la terminal, según se ejemplifica a continuación.

Además, podrás consultar el endpoint [Obtener order por IDGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get) para verificar el estado de la order.

```
{
  "action": "order.action_required",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ext_ref_1234",
    "id": "ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D",
    "status": "action_required",
    "status_detail": "check_on_terminal",
    "type": "point",
    "version": 3
  },
  "date_created": "2025-06-24T13:28:36.44747706Z",
  "live_mode": false,
  "type": "order",
  "user_id": "123456"
}
```

Después de probar todos los escenarios y verificar el correcto funcionamiento de tu integración con Mercado Pago Point, podrás [Salir a producción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/go-to-production).
