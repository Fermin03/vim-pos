
# Preguntas Frecuentes

Esta sección contiene las preguntas más frecuentes que hacen los aliados al integrarse con la API de Rappi.

## Autenticación

Estas son las preguntas más comunes sobre la autenticación:

**¿Cuál es el período de validez de mi token de acceso?**

Su token de acceso tiene una validez de _1 semana_. Después de este tiempo, debe generar un nuevo token para continuar realizando solicitudes de API a los endpoints protegidos.

**¿Puedo usar un conjunto de credenciales Rappi OAuth (`client_id` y `client_secret`) para todas mis tiendas, o tengo que generar un conjunto de credenciales por tienda?**

Puede utilizar un conjunto de credenciales para todas sus tiendas.

**¿Rappi comparte mi información personal con la integración?**

No. No compartimos su información personal con la integración de Rappi.

## Pedidos

Estas son las preguntas más frecuentes sobre pedidos:

**¿Qué tipo de pedidos recibo cuando utilizo el endpoint `GET orders`?**

El endpoint `GET orders` devuelve _solamente_ los pedidos que están listos para ser aceptados o rechazados. Este endpoint no devuelve los pedidos que han sido procesados (aceptados, rechazados o cancelados por expiración).

**¿Cuánto tiempo tengo para tomar o rechazar un pedido?**

Cuatro minutos. Después de este período, Rappi cancela el pedido por expiración.

**¿Tengo que hacer uso del endpoint `ready-for-pickup` necesariamente para mi integración?**

Este endpoint es opcional para su integración.

El endpoint `POST orders/{orderId}/ready-for-pickup` notifica al usuario en la aplicación Rappi que un pedido está listo para ser recogido. Sin embargo, puede solicitar a Rappi establecer este estado automáticamente. Para obtener más información, consulte la sección [Estado del Pedido](/es/managing-user-orders#estado-del-pedido) de este sitio.

**¿Tengo que proporcionar una razón para rechazar un pedido cuando utilizo el endpoint de rechazo de orden?**

Si. El endpoint `PUT orders/{orderId}/reject` requiere que proporcione un motivo al rechazar un pedido.

Proporcionar un motivo da una gran visibilidad de por qué se rechaza el pedido.

Opcionalmente, se puede deshabilitar elementos de su menú, proporcionando sus ID de Rappi o SKU. Consulta la sección [Gestionar Disponibilidad](/es/managing-availability) de este portal para obtener más información.

**¿Qué pasa si acepto o rechazo un pedido que ya ha sido procesado?**

El sistema devuelve un mensaje de error. Los pedidos solo se pueden procesar una vez. Una vez que se aceptan, rechazan, o cancelan por expiración, estos pedidos no se pueden modificar.

**¿Dónde puedo encontrar el precio total de todos los productos del pedido (con descuentos, si son aplicables)?**

El campo `total_products_with_discount` de la respuesta de la API contiene el precio total de los productos del pedido. Este total se calcula después de los descuentos si existen en el pedido.

**¿Cómo consulto los pedidos cancelados?**

Utilizando el endpoint <a href="/es/api-reference/orders#get-orders-order-id-events" target="_blank">`GET orders/{orderId}/events`</a> para recuperar todos los eventos de un orden.

**¿Cuáles son las posibles razones por las que una tienda rechaza un pedido?**

Las razones más comunes por las que las tiendas rechazan pedidos son la diferencia de precio, SKU desconocidos, ingredientes en el pedido que no corresponden a los productos.

**Respecto a la integración, ¿Rappi controla el tiempo de entrega de los pedidos?**

Sí, Rappi controla el tiempo de entrega de los pedidos. Estos tiempos de entrega son automáticos según el tiempo de respuesta de la tienda.

**¿Puedo consultar pedidos programados?**

La API de Rappi no expone un endpoint para consultar pedidos programados. Sin embargo, si tu tienda está suscrita al evento de webhook `NEW_ORDER_SCHEDULED`, recibe un aviso anticipado (con el campo `place_at`) cuando el cliente programa el pedido, antes del `NEW_ORDER` que llega cuando el pedido se libera. Si el pedido programado se cancela antes de liberarse, también recibís `NEW_ORDER_SCHEDULED_CANCELLED`. Ver <a href="/es/webhook-events#new-order-scheduled" target="_blank">Eventos de Webhook</a>.

**¿Dónde puedo encontrar los descuentos globales del pedido (no los descuentos por producto)?**

El campo `total_other_discounts` contiene los descuentos globales del pedido.

**¿Quién asume los descuentos en las respuestas del pedido, Rappi o la tienda?**

Los descuentos en las respuestas son asumidos por la tienda.

**¿Cuál es el estado final de un pedido?**

El estado final posible de un pedido es: `close_order` o cualquier estado relacionado con la cancelación, por ejemplo: `cancel_without_charges`.

**¿Hay alguna forma de saber cuándo se cancela un pedido sin consultar cada pedido por separado?**

No. Actualmente, <a href="/es/api-reference/orders#get-orders-order-id-events" target="_blank">`GET orders/{orderId}/events`</a> devuelve solo un pedido específico por solicitud. Recomendamos consultar los pedidos cada minuto o cada 30 segundos.

## Disponibilidad

Estas son las preguntas más comunes sobre la disponibilidad:

**Después de desactivar un elemento, ¿cuánto tiempo se tarda en volver a estar activo?**

Indefinidamente. Tiene que volver a habilitar el artículo manualmente. Consulta la sección [Gestionar disponibilidad](/es/managing-availability) de este portal para obtener más información.

**Después de desactivar una tienda, ¿cuánto tiempo se tarda en volver a estar activo?**

Indefinidamente. Tiene que volver a habilitar el artículo manualmente. Consulta la sección [Disponibilidad de la tienda](/es/managing-availability#disponibilidad-de-la-tienda-sincrono) de este portal para obtener más información.

**¿Cuál es la cantidad máxima de elementos que se pueden activar y desactivar por solicitud?**

Puede enviar un total combinado máximo de 100 elementos (activar y desactivar). La idea es que utilice este endpoint <a href="/es/api-reference/availability#put-availability-stores-items-rappi" target="_blank">`PUT availability/stores/items/rappi`</a> cuando un producto esté agotado.

**Al actualizar un menú, ¿se habilitan los productos deshabilitados en el menú?**

No. Debe habilitar los productos manualmente mediante el endpoint correspondiente. Consulta la sección [Gestionar disponibilidad](/es/managing-availability) de este portal para obtener más información.
