# Diseño — Pantalla de cocina (`apps/kds`, `packages/kds-core`)

> Hereda la tipografía y el espaciado de [`nucleo.md`](nucleo.md). **El color no**: el KDS tiene
> su propio tema, `[data-theme="kds"]`.

## Quién y dónde

Un cocinero, a metro y medio o dos metros de la pantalla, de pie, con las manos ocupadas o
sucias. Vapor, grasa, ruido. Mira la pantalla de reojo entre dos cosas y necesita saber en un
vistazo **qué falta y qué lleva más tiempo esperando**.

Muchas veces no hay mouse ni teclado: es una pantalla colgada.

## Tema oscuro, y por qué

Fondo `#1A1A1E`, superficie `#26262B`, tinta `#F0F0EC`. Una pantalla blanca a dos metros en una
cocina iluminada deslumbra y ensucia visualmente el espacio. El oscuro también perdona el reflejo
de las lámparas.

`warning` y `danger` van aclarados respecto al resto del producto (`#D4A017`, `#E04040`): sobre
fondo negro, los tonos del tema claro se apagan.

## El color es tiempo, no decoración

La antigüedad del pedido es la única información que se codifica en color. Verde reciente, ámbar
cuando se acerca al objetivo, rojo cuando lo pasó. Si el color significara además el modo de
servicio o la estación, el cocinero tendría que traducir en vez de mirar.

## Tamaños

Nada por debajo de **16px**, y el nombre del producto va bastante más grande. La prueba real:
párate a dos metros de la pantalla y lee un ticket completo sin acercarte. Si no puedes, está
mal, aunque en tu monitor se vea bien.

## Sin hover, sin arrastrar

No hay mouse. Todo estado tiene que ser visible sin interacción, y toda acción debe caber en un
toque grande. Nada de menús contextuales ni de "mantén presionado".

## Lo que NO se hereda

- **El azul de marca como acción.** Aquí no hay una acción dominante: hay una cola de trabajo.
- La densidad del admin, obviamente.
