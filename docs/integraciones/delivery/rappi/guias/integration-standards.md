
# Estándares de Integración

!!! important
Esta sección aún está en construcción y los siguientes estándares aún están por definirse.

Este documento describe los estándares de calidad y rendimiento para que los aliados se integren con la API de Rappi.

La adherencia a estos estándares da como resultado la mejor experiencia al usar la API y garantiza una integración exitosa con Rappi.

!!! note
Los estándares descritos en este portal están sujetos a cambios en cualquier momento.

## Normas de calidad

Para Rappi, la mejor experiencia de integración es fundamental en nuestro proceso. Por esta razón, te recomendamos que sigas las siguientes prácticas cuando utilices la API de Rappi. Continuamos trabajando para ayudarte a mejorar el proceso y, a medida que desarrollamos nuevas funciones y flujos de trabajo, continuamos mejorando nuestros estándares de desempeño.

## Estándares de Desempeño

Las integraciones con nuestros aliados deben cumplir con los siguientes criterios:

- Inicia sesión en Rappi con su token _una vez a la semana_ para realizar solicitudes.
- Realiza solicitudes a la API de Rappi para descargar ordenes dejando un intervalo de 45 segundos entre solicitudes.

!!! important
Las integraciones que no cumplan con una tasa de éxito del 98% en sus solicitudes de API pueden estar sujetas a la revocación del acceso a la API, la eliminación o la desactivación de las tiendas de restaurantes desde la aplicación Rappi.

## Integraciones de Pedidos

Las integraciones de pedidos deben cumplir los siguientes requisitos.

### Requerimientos

Estos son los requerimientos para las integraciones de pedidos.

- Cumplir con el flujo de integración de pedidos.

- Rechazar pedidos a través de API _solamente_ cuando no pueda procesar el pedido y tu tienda se vea afectada por el procesamiento de este pedido.

- Asegúrate de que los artículos de tus pedidos tengan el precio correcto.

- Asegúrate de que los totales de tus pedidos sean correctos.

- Asegúrate de que los artículos de tus pedidos no estén agotados.

- Asegúrate de que a tus pedidos no les falte ninguna información o que contengan información incorrecta.
