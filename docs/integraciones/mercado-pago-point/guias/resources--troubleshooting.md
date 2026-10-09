<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/troubleshooting · capturado 2026-10-08 -->

# Troubleshooting

A continuación, podrás encontrar una lista de problemas que pueden ocurrir durante tu integración y operación con Mercado Pago Point, y cómo solucionarlos.

Si estás experimentando un problema con Mercado Pago, previo a recurrir a la información de esta documentación, asegúrate de que todos nuestros servicios estén funcionando correctamente accediendo a nuestro [reporte de status en tiempo real](https://status.mercadopago.com/).

## La terminal no cambia el modo de operación a PDV

Si realizaste el cambio de modo de operación de tu terminal a modo PDV vía API y no lo ves reflejado, deberás reiniciarla.

Recuerda que cada actualización realizada en el modo de operación de las terminals requiere reiniciarlas para completar el proceso.

## Integración con modo PDV que dejó de funcionar

Si tu integración dejó de funcionar momentáneamente, esto puede deberse a alguna interrupción inesperada en nuestras APIs de pago.

Mientras trabajamos para reestablecer el servicio, y solo provisoriamente, puedes continuar con el procesamiento de pagos con Mercado Pago Point cambiando el modo de operación de tu terminal a `STANDALONE`, que es el modo no integrado con nuestras APIs.

Para eso, tienes tres opciones: hacerlo vía API, vía terminal, o vía Panel de Mercado Pago. Elige la que mejor se adecúe a tus necesidades.

Envía una solicitud al endpoint [Cambiar el modo de operaciónPATCH](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch) utilizando el _Access Token_ que corresponda según tu tipo de integración (propia o para terceros) y asegurándote de enviar el valor `STANDALONE` en el campo `terminals.operating_mode`.

Confirma en la respuesta que el cambio en el modo de operación haya sido exitoso y reinicia tu terminal para completar el proceso.

Recuerda que este cambio debe ser provisorio. Deberás [regresar tu terminal a modo PDV](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal#:~:text=Activar%20el%20modo-,PDV,-en%20la%20terminal) cuando el servicio se restablezca para mantener la conciliación automática entre tu sistema y Mercado Pago y volver a recibir tus notificaciones.

## La order no carga automáticamente en la terminal

Si creaste una order desde tu sistema y esta no es obtenida automáticamente por la terminal, puede deberse a problemas de conexión en tu red.

Para solucionarlo y poder continuar con el pago, deberás oprimir el botón **Actualizar** en tu terminal, lo que forzará la obtención de la order.

Esta solución también puede ser útil para cancelar la order. Mientras tenga `status=created`, puedes [cancelarla vía APIPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/cancel-order/post). Si la order ya tiene `status=at_terminal`, puedes solicitar su cancelación mediante el mismo endpoint enviando el _header_ condicional `x-allow-cancelable-status: at_terminal`, o actualizar la terminal y realizar la [cancelación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing#:~:text=Cancelar%20una-,order,-La%20cancelaci%C3%B3n%20de) desde el lector. Para solicitudes vía API en `at_terminal`, espera la [notificación Webhook de cancelación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications) para confirmar la finalización.

## La API no permite reembolsar una order

Si momentáneamente no estás pudiendo realizar un reembolso vía API, y [verificaste estar cumpliendo con todos los requisitos para efectuar esta operación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing#:~:text=Reembolsar%20una-,order,-Si%20lo%20deseas), puede deberse a alguna interrupción inesperada en nuestras APIs de pago.

Mientras trabajamos para reestablecer el servicio, puedes realizar reembolsos de manera manual desde tu Panel de Mercado Pago o desde la misma terminal. Elige la opción que mejor se adapte a tus necesidades.

Presiona el botón **Más opciones** en el margen inferior de tu terminal y elige la opción **Actividad con este Point**. Allí podrás ver las operaciones realizadas.

Deberás seleccionar la operación que estás queriendo reembolsar para acceder a sus **Detalles**. En esta pantalla, desliza hasta la opción **Acciones relacionadas**, y selecciona la opción **Devolver dinero**.

Por último, revisa la información para asegurarte de estar reembolsando la transacción deseada y confirma la acción presionando el botón **Devolver**.

La pantalla de “Detalles de la operación” ahora deberá mostrarte la transacción reembolsada con el estado “Cobro devuelto” y, retrocediendo a “Más opciones”, podrás ver esta nueva actividad con esa terminal.

Para validar que el reembolso haya sido efectivo, cualquiera sea la manera en la que lo hayas realizado, verifica haber recibido una notificación con la acción `order.refunded`.

## La terminal no realiza impresiones

Si integraste la funcionalidad de impresiones y no estás pudiendo obtenerlas desde tu terminal, primero debes asegurarte de tener habilitada esta opción. Para eso, ponte en contacto con nuestro equipo de Soporte y solicita su actualización.

Si tu terminal ya cuenta con la actualización necesaria para realizar impresiones, esta funcionalidad puede estar fallando debido a problemas técnicos, como rollo de papel insuficiente o que la bobina se haya sobrecalentado. Deberás revisar las advertencias de la terminal para poder entender y solucionar el problema en cada caso.

## No funcionan correctamente las actualizaciones de estado de la order

Verifica haber configurado correctamente las [notificaciones vía Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications) para el tópico **Order (Mercado Pago)**. Si tienes configurado algún otro tópico, como Pagos o Integraciones Point, puedes estar recibiendo alertas inconsistentes con tu integración.
