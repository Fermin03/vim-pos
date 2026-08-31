# 0005 — Comedor entra por lista de cuentas; el mapa de mesas es consulta

**Fecha:** agosto de 2026 · **Estado:** vigente

## Qué decía el plan

`04-FLUJOS-FULL-SERVICE.md` y los mockups plantean el mapa de mesas como la puerta de entrada al
comedor: el mesero ve el plano, toca una mesa y abre la cuenta ahí.

## Qué hacemos ahora

Comedor entra por el **mismo flujo que Pick-up y domicilio**: lista de cuentas abiertas a la
izquierda, detalle a la derecha, y "Nueva orden" pregunta el número de mesa por teclado.

El mapa de mesas sigue existiendo, pero como **consulta opcional** desde ese modal: sirve para
cuando no te acuerdas del número o quieres ver qué está ocupado.

## Por qué

El mesero casi siempre sabe a qué mesa va: se lo acaban de decir o la está atendiendo. Obligarlo
a buscarla en un plano es más lento que teclear un número, y en hora pico eso se nota.

Además unifica: tres modos de servicio con la misma pantalla en vez de tres pantallas distintas
para lo mismo. Menos que aprender y menos que mantener.

## Consecuencias

- El plano deja de ser la referencia de "qué está pasando en el salón"; esa lectura la da la
  lista, que además muestra minutos abiertos y total.
- Las reservaciones cuelgan de comedor como una sección propia, no del plano.
