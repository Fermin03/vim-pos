<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing · capturado 2026-10-08 -->

# Integrar el procesamiento de pagos

El procesamiento de pagos con Mercado Pago Point integrado a tu punto de venta se basa en la creación de orders que contienen asociada una transacción de pago. Al crear una order, esta será cargada automáticamente a la terminal indicada, y el comprador podrá realizar su pago de manera presencial.

El procesamiento de pagos integrado con Mercado Pago Point te permitirá crear orders, procesarlas, cancelarlas o bien realizar reembolsos y consultar su información o actualizaciones de estado.

Si deseas configurar que los meses sean [con](https://www.mercadopago.com.mx/ayuda/24694) o [sin interés](https://www.mercadopago.com.mx/developers/es/support/mensualidades-sin-intereses_2255) en transacciones con tarjeta de crédito, previo a crear una order, **deberás configurarlas en tu cuenta de Mercado Pago**.

## Crear una order

Para comenzar a procesar pagos con Point desde los puntos de venta, primero necesitas identificar a qué terminal deseas asignar la order. Recuerda que esta terminal debe haber sido [configurada en modo PDVPATCH](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch).

Para eso, envía una solicitud al endpoint [Obtener lista de terminalsGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get), utilizando tu Access Token de prueba.

Si es necesario, puedes filtrar la búsqueda utilizando los _query params_ opcionales `store_id` y `pos_id`, que corresponden a los identificadores de la tienda y la caja devueltos en la respuesta a la creación de cada uno.

```
curl -X GET \
    'https://api.mercadopago.com/terminals/v1/list?limit=50&offset=0&store_id=12354567&pos_id=23545678' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
```

La respuesta a esta solicitud mostrará las terminals asociadas a tu cuenta, lo que te permitirá seleccionar la que deseas usar para crear tu order.

La terminal puede identificarse por los últimos caracteres del campo `id`, que corresponden al número de serie impreso en la etiqueta trasera de la terminal física.

```
{
  "data": {
    "terminals": [
      {
        "id": "NEWLAND_N950__N950NCB801293324",
        "pos_id": "23545678",
        "store_id": "12354567",
        "external_pos_id": "SUC0101POS",
        "operating_mode": "PDV"
      }
    ]
  },
  "paging": {
    "total": 1,
    "offset": 0,
    "limit": 50
  }
}
```

Luego, deberás crear la order. Para eso, envía una solicitud al endpoint [/v1/ordersPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post), cuidando de incluir tu Access Token de prueba, y el ID de la terminal a la que quieres asignar la order, obtenido en el paso anterior.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders' \
    -H 'Content-Type: application/json' \
    -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
    -d '{
        "type": "point",
        "external_reference": "ext_ref_1234",
        "expiration_time": "PT16M",
        "transactions": {
            "payments": [
                {
                    "amount": "24.00"
                }
            ]
        },
        "config": {
            "point": {
                "terminal_id": "NEWLAND_N950__N950NCB801293324",
                "print_on_terminal": "no_ticket"
            }
        },
        "description": "Point Smart 2",
        "integration_data": {
            "platform_id": "dev_1234567890",
            "integrator_id": "dev_1234567890",
            "sponsor": {
                "id": "446566691"
            }
        }
    }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que tienen alguna particularidad importante que debe destacarse.

| Atributo | Tipo | Descripción | Obligatoriedad |
| --- | --- | --- | --- |
| `Authorization` | _Header_ | Hace referencia a tu Access Token de prueba. | Requerido |
| `X-Idempotency-Key` | _Header_ | Llave de idempotencia. Esta llave garantiza que cada solicitud sea procesada una única vez, evitando duplicidades. Utiliza un valor exclusivo en el encabezado de tu solicitud, como un UUID V4 o _strings_ aleatorias. | Requerido |
| `type` | _Body.String_ | Tipo de order, asociado a la solución de Mercado Pago para la que se crea. Para pagos con Mercado Pago Point, el único valor posible es `point`. | Requerido |
| `external_reference` | _Body.String_ | Es una referencia externa de la order, asignada al momento de su creación. Debe ser un valor único para cada order, y no puede contener datos PII. El límite máximo permitido es de 64 caracteres y los permitidos son: **letras mayúsculas y minúsculas**, **números** y **los símbolos de guion (-) y guion bajo (\_)**. | Requerido |
| `expiration_time` | _Body. String_ | Indica el **período de validez** de la order de pago a partir de su creación. Durante este tiempo, la order estará habilitada para ser procesada por el cliente; si la order no se procesa dentro del plazo especificado, expirará automáticamente y no podrá ser utilizada, siendo necesario generar una nueva order de pago para continuar. El valor mínimo permitido es 30 segundos (PT30S) y el máximo es 3 horas (PT3H). Ejemplos de uso: para una expiración de 30 segundos: "PT30S", para 10 minutos: "PT10M", y para 1 hora y 15 minutos: "PT1H15M". | Opcional |
| `transactions.payments.amount` | _Body.String_ | Monto total de la order de pago. Admite hasta 2 decimales y el separador decimal es opcional. Ejemplos válidos: `10`, `10.5` y `10.00`. | Requerido |
| `config.point.terminal_id` | _Body.String_ | Identificador de la terminal Point que obtendrá la order. Debes enviarlo tal cual fue devuelto en el llamado [Obtener terminalsGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get), como en el siguiente ejemplo: `NEWLAND_N950__N950NCB801293324`. | Requerido |

Para conocer en detalle todos los parámetros a ser enviados en esta solicitud, consulta nuestra [Referencia de APIAPI](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post).

Si la solicitud fue exitosa, la respuesta devolverá una order con estado `created`.

```
{
  "id": "ORD00001111222233334444555566",
  "type": "point",
  "user_id": "5238400195",
  "external_reference": "ext_ref_1234",
  "description": "Point Smart 2",
  "expiration_time": "PT16M",
  "processing_mode": "automatic",
  "country_code": "MEX",
  "integration_data": {
    "application_id": "1234567890",
    "platform_id": "dev_1234567890",
    "integrator_id": "dev_1234567890",
    "sponsor": {
      "id": "446566691"
    }
  },
  "status": "created",
  "status_detail": "created",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
    "point": {
      "terminal_id": "NEWLAND_N950__N950NCB801293324",
      "print_on_terminal": "no_ticket"
    },
    "payment_method": {
      "default_type": "credit_card"
    }
  },
  "transactions": {
    "payments": [
      {
        "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
        "amount": "24.00",
        "status": "created"
      }
    ]
  }
}
```

Como la order es la base del procesamiento del pago, es importante que guardes su ID (`order_id`) y el ID del pago (`transactions.payments.id`) obtenidos al crearla, porque te permitirán realizar otras operaciones y consultar tus notificaciones de manera adecuada. Adicionalmente, puedes consultar nuestra documentación en la **sección Recursos** para conocer mejor sobre los [posibles _status_ de una order y de una transacción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/status-order-transaction).

Esta order creada será recibida automáticamente por la terminal a la que fue asignada. Si la order no se carga automáticamente en la terminal, debes presionar el botón **Actualizar** o, si la terminal lo tiene, el **botón verde** para recibir la order. Así, el pago podrá ser realizado por el comprador en la terminal y luego procesado. **Ten en cuenta que, si no completas el parámetro `expiration_time`, el pago debe realizarse dentro de los 15 minutos posteriores a la creación de la order; pasado ese tiempo, la order expirará.**

## Cancelar una order

La cancelación de una order se puede solicitar vía API o, cuando se encuentre en estado `at_terminal`, realizar directamente desde la terminal.

Para hacer el seguimiento de la cancelación de una order en `at_terminal`, ya sea solicitada vía API o realizada desde la terminal, configura previamente tus [notificaciones Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications). La notificación confirma que la cancelación se hizo efectiva y te permite mantener tu conciliación.

-   Si el `status` de la order es `created`, la cancelación debe realizarse vía API y se procesa de forma síncrona.
    
-   Si su `status` es `at_terminal`, significa que la order ya fue obtenida por la terminal. En este caso, la cancelación puede solicitarse de forma asíncrona vía API o realizarse directamente desde la terminal.
    

Elige la opción que mejor se adecúe a tus necesidades para conocer cómo cancelar tu order.

Para cancelar una order con estado `created` o `at_terminal` vía API, envía una solicitud al endpoint [/v1/orders/{order\_id}/cancelPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/cancel-order/post), incluyendo tu Access Token de prueba y el ID de la order obtenido en la respuesta a su creación.

Si el _header_ `x-allow-cancelable-status` no se envía o tiene un valor diferente de `at_terminal`, la solicitud de cancelación vía API de una order en `status=at_terminal` devolverá el error `409 cannot_cancel_order`.  
  
Además, la funcionalidad está disponible en terminales Point Smart 1 y Point Smart 2 que tengan la versión de _software_ actualizada a la última disponible. De lo contrario, la solicitud se tratará como si el _header_ no se hubiera enviado y devolverá el mismo error.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}/cancel' \
    -H 'Content-Type: application/json' \
    -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
    -H 'x-allow-cancelable-status: at_terminal' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
```

El resultado depende del estado de la order al momento de la solicitud:

-   Para `created`, la cancelación es síncrona y la API devuelve `HTTP 200`, con la order en `status=canceled` y el pago en `status_detail=canceled_by_api`. El _header_ `x-allow-cancelable-status` es opcional y, cuando se envía, se ignora.
-   Para `at_terminal`, la API acepta la solicitud de forma asíncrona y devuelve `HTTP 202`. La order permanece en `status=at_terminal`, mientras que el pago pasa a tener `status_detail=cancellation_requested`, hasta que una notificación Webhook confirme la cancelación. Si el pago ya está en procesamiento, la terminal podrá priorizarlo y no completar la cancelación; por eso, la respuesta `HTTP 202` no debe interpretarse como la confirmación final.

### Respuesta para una order en `created`

### Respuesta para una order en `at_terminal`

```
{
  "id": "ORD00009999222233334444555566",
  "status": "at_terminal",
  "status_detail": "at_terminal",
  "transactions": {
    "payments": [
      {
        "id": "PAY01J67CQQH5904WDBVZEM4JMEP4",
        "status": "at_terminal",
        "status_detail": "cancellation_requested"
      }
    ]
  }
}
```

La respuesta `HTTP 202` solo confirma que la solicitud fue aceptada. Considera la order cancelada únicamente después de recibir la confirmación mediante las [notificaciones Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications).

## Reembolsar una order

En caso de necesitarlo, es posible reembolsar una order creada mediante nuestra API. Este endpoint permite realizar la devolución **total o parcial** de una transacción de pago asociada a la order. Para solicitar un reembolso total, no es necesario enviar un _body_ en la solicitud. Para el reembolso parcial, es necesario informar en el _body_ el valor a reembolsar y el identificador de la transacción.

Una order podrá ser reembolsada vía API **hasta 90 días después de realizado su pago**. Pasado ese tiempo, ya no será posible hacer la devolución.

Elige la opción que mejor se adapte a tus necesidades y sigue las instrucciones correspondientes.

Para realizar el reembolso **total** de una order, envía una solicitud al endpoint [/v1/orders/{order\_id}/refundPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/refund-order/post) **sin enviar _body_** en la solicitud. Asegúrate de incluir tu Access Token de prueba. También es necesario informar el ID de la order (`order_id`) que deseas reembolsar, obtenido en la respuesta a su creación.

```
curl -X POST \
    'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}/refund' \
    -H 'Content-Type: application/json' \
    -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
```

Si la solicitud fue exitosa, la respuesta mostrará el `status=refunded` y un nuevo nodo `transactions.refunds`, que contendrá los detalles del reembolso, junto con el ID del pago original (`transactions.payments.id`) y el ID de la transacción de reembolso (`transaction_id`).

```
{
  "id": "ORD00001111222233334444555566",
  "status": "refunded",
  "status_detail": "refunded",
  "transactions": {
    "refunds": [
      {
        "id": "REF01J67CQQH5904WDBVZEM1234D",
        "transaction_id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
        "reference_id": "12345678",
        "amount": "24.00",
        "status": "processed"
      }
    ]
  }
}
```

## Consultar datos de una order

Si lo necesitas, puedes consultar los datos de una order y sus transacciones asociadas, sean pagos o reembolsos, incluídos sus estados o valores.

Si bien la utilización recurrente de esta consulta vía API **no es recomendada**, sí puede resultar útil en caso de que requieras información adicional sobre la order.

Para consultar los datos de una order, envía una solicitud al endpoint [/v1/orders/{order\_id}GET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/get-order/get), cuidando de incluir tu Access Token de prueba, y el ID de la order (`order_id`) cuya información quieres consultar, obtenido en la respuesta a su creación.

Ten en cuenta que esta solicitud solo permitirá consultar las **orders creadas con una antigüedad menor a 3 meses**. Si necesitas información sobre orders anteriores, te recomendamos que contactes a nuestro servicio de atención al cliente para obtener asistencia adicional.

```
curl -X GET \
    'https://api.mercadopago.com/v1/orders/{{ORDER_ID}}' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
```

Si la solicitud fue exitosa, la respuesta te devolverá toda la información de la order, incluidos su estado y el estado del pago y/o del reembolso en tiempo real:

```
{
  "id": "ORD00001111222233334444555566",
  "user_id": "5238400195",
  "type": "point",
  "external_reference": "ext_ref_1234",
  "processing_mode": "automatic",
  "description": "Point Smart 2",
  "expiration_time": "PT16M",
  "country_code": "MEX",
  "currency": "MXN",
  "integration_data": {
    "application_id": "1234567890",
    "platform_id": "dev_1234567890",
    "integrator_id": "dev_1234567890",
    "sponsor": {
      "id": "446566691"
    }
  },
  "status": "refunded",
  "status_detail": "refunded",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
    "point": {
      "terminal_id": "NEWLAND_N950__N950NCB801293324",
      "print_on_terminal": "no_ticket"
    },
    "payment_method": {
      "default_type": "credit_card"
    }
  },
  "transactions": {
    "payments": [
      {
        "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
        "amount": "24.00",
        "refunded_amount": "24.00",
        "paid_amount": "24.00",
        "status": "refunded",
        "status_detail": "refunded",
        "reference_id": "12345678",
        "payment_method": {
          "type": "credit_card",
          "installments": 6,
          "id": "master"
        }
      }
    ],
    "refunds": [
      {
        "id": "REF01J67CQQH5904WDBVZEM1234D",
        "transaction_id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
        "reference_id": "12345678",
        "amount": "24.00",
        "status": "processed"
      }
    ]
  }
}
```
