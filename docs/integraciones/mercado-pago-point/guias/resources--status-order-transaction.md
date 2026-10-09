<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/status-order-transaction · capturado 2026-10-08 -->

# Estados de una order y de una transacción

Al procesar orders con Mercado Pago Point, es importante conocer cómo funciona el flujo de este procesamiento y cuáles son los estados que una order y una transacción pueden tomar en cada momento.

A continuación, puedes visualizar el flujo de una order para pagos con tarjeta y, posteriormente, una tabla informativa sobre cada uno de los posibles `status`, incluyendo los respectivos `status_detail`.

```
stateDiagram-v2
    [*] --> created

    created --> expired: No fue procesada en hasta 15 minutos después de su creación.
    created --> canceled: Cancelado desde la API
    created --> at_terminal

    at_terminal --> canceled: Cancelado vía terminal / Cancelado tras confirmar la solicitud vía API
    at_terminal --> processed: Se procesó correctamente
    at_terminal --> failed: Pago rechazado / Falla componente de pagos / Reverso EMV
    at_terminal --> action_required: 40 segundos luego del inicio del procesamiento
    at_terminal --> expired: Expiró mientras estaba en terminal

    processed --> refunded: Reembolso total vía API, actividad o terminal

    created: created
    expired: expired
    canceled: canceled
    at_terminal: at_terminal
    processed: processed
    failed: failed
    action_required: action_required
    refunded: refunded
```

## Estado de la order

Consulta la lista de `status` y `status_detail` que puede tomar una order.

| `status` | `status_detail` | Descripción |
| --- | --- | --- |
| `created` | `created` | La order fue creada con éxito, pero aún no fue obtenida por la terminal. |
| `processed` | `processed` | La order fue procesada con éxito y el pago fue acreditado. |
| `processed` | `partially_refunded` | La order fue reembolsada parcialmente. Esto significa que el monto de la transacción que fue solicitado fue devuelto al pagador. |
| `action_required` | `action_required` | La transacción asociada a la order necesita ser confirmada. Revisa la terminal para verificar el estado final y asegúrate de actualizar tu sistema en función de esto, ya que se trata de un estado que no se modificará. |
| `at_terminal` | `at_terminal` | La order fue obtenida por la terminal y está lista para ser procesada. |
| `failed` | `failed` | La order ha fallado. Esto significa que la transacción no fue exitosa y no será completada. |
| `refunded` | `refunded` | La order ha sido reembolsada. Esto significa que el monto de la transacción ha sido devuelto íntegramente al pagador. |
| `expired` | `expired` | La order expiró luego de pasar más de 15 minutos sin ser pagada. Si deseas que ese pago se realice, deberás crear una nueva order. |

## Estados de la transacción

Consulta la lista de `status` y `status_detail` que puede tomar una transacción.

| `status` | `status_detail` | Descripción |
| --- | --- | --- |
| `created` | `created` | La transacción fue creada con éxito, pero aún no ha sido procesada. Este es el estado inicial de una transacción después de su creación. |
| `processed` | `accredited` | La transacción fue procesada con éxito y el monto ha sido efectivamente acreditado. |
| `action_required` | `waiting_payment` | La transacción requiere una acción adicional y está esperando el pago. Esto significa que la transacción ha sido iniciada, pero el pago aún no se ha completado. |
| `action_required` | `check_on_terminal` | La transacción requiere de una confirmación en la terminal para verificar si el pago fue aprobado o rechazado. |
| `at_terminal` | `at_terminal` | La transacción fue obtenida por la terminal y está lista para ser procesada. |
| `at_terminal` | `cancellation_requested` | La solicitud de cancelación de la order fue aceptada, pero la cancelación solo se completará después de recibir una [notificación Webhook de cancelación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications). |
| `expired` | `expired` | La transacción ha expirado. Esto significa que no se completó dentro del tiempo límite y, por lo tanto, fue terminada. |
| `refunded` | `refunded` | La order ha sido reembolsada. Esto significa que el monto de la transacción ha sido devuelto íntegramente al pagador. |
| `canceled` | `canceled` | La transacción fue cancelada y no será concluida. |
| `canceled` | `canceled_by_api` | La transacción fue cancelada desde la API y no será concluida. |
| `canceled` | `canceled_on_terminal` | La transacción fue cancelada desde la terminal y no será concluida. |
| `failed` | `failed` | Se produjo un fallo en el procesamiento de la order. Puede deberse a un envío de datos incorrectos, riesgo de fraude, o rechazos de la entidad emisora del medio de pago. |
| `failed` | `bad_filled_card_data` | La transacción falló debido a datos de la tarjeta completados incorrectamente. Esto puede incluir información como el número de la tarjeta, CVV, fecha de vencimiento, entre otros. |
| `failed` | `high_risk` | La transacción falló debido a un alto riesgo detectado. Esto puede ocurrir cuando el sistema de detección de fraudes identifica un posible riesgo en la transacción. |
| `failed` | `rejected_by_issuer` | La transacción falló debido a un rechazo por parte del emisor de la tarjeta. |
| `failed` | `required_call_for_authorize` | La transacción falló porque se requiere una llamada para autorización. Esto puede ocurrir cuando el emisor de la tarjeta exige una verificación adicional antes de aprobar la transacción. |
| `failed` | `max_attempts_exceeded` | La transacción falló debido a que se excedió el número máximo de intentos. Esto puede ocurrir cuando el número de intentos de pago supera el límite permitido por el sistema. |
| `failed` | `card_disabled` | La transacción falló debido a que la tarjeta está desactivada. Esto puede ocurrir cuando la tarjeta ha sido bloqueada o desactivada por el emisor. |
| `failed` | `insufficient_amount` | La transacción falló debido a un monto insuficiente. Esto puede ocurrir cuando el saldo disponible no es suficiente para cubrir el monto de la transacción. |
| `failed` | `amount_limit_exceeded` | La transacción falló debido a que se excedió el límite de monto. Esto puede ocurrir cuando el monto de la transacción supera el límite permitido por el emisor de la tarjeta o por el sistema. |
| `failed` | `processing_error` | La transacción falló debido a un error de procesamiento. Esto puede ocurrir cuando hay un problema técnico o un error en el sistema que impide la finalización de la transacción. Si el problema persiste, comunícate con soporte, y proporciona el `x-request-id` junto con los detalles sobre la operación realizada. |
| `failed` | `invalid_installments` | La transacción falló debido a cuotas inválidas. Esto puede ocurrir cuando el número de cuotas seleccionadas no es aceptado por el emisor de la tarjeta o por el sistema. |
| `failed` | `in_review` | La transacción falló y su _status_ es desconocido o contiene información sensible. |
