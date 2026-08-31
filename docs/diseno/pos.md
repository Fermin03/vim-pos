# Diseño — POS (`apps/pos`)

> Hereda todo de [`nucleo.md`](nucleo.md). Aquí va solo lo que es cierto **en una caja**.

## Quién y dónde

Un cajero, de pie, frente a una pantalla táctil de 15" (1024×768 típico), con gente esperando.
A veces con las manos grasosas, casi siempre con prisa, a ratos sin internet. No lee la pantalla:
la reconoce. Cada segundo de orientación que le cobras se paga con un cliente esperando.

En el escritorio corre además contra su propio Postgres local, así que la app tiene que verse
igual con y sin nube.

## Reglas propias de una caja

Estas no son preferencias estéticas: salen de errores que ya costaron dinero en el piloto.

**Una acción dominante por pantalla.** Si hay dos azules, hay cero.

**El botón "Volver" siempre en el mismo sitio** — extremo izquierdo de la cabecera, mismo tamaño
en todas las pantallas. El cajero va al lugar donde *sabe* que está el botón. Si cambia de sitio,
cada regreso cuesta una búsqueda.

**Escape cierra lo que esté encima; si no hay nada, vuelve.** Con una excepción deliberada: no
interrumpe un cobro en curso.

**Lo destructivo pregunta, y dice qué va a pasar.** No "¿Estás seguro?", sino qué se pierde y qué
se puede deshacer.

**Los avisos a cocina son inequívocos.** Una comanda de cancelación abre con `CANCELADO` /
`NO PREPARAR` invertido y a tamaño máximo, y **cada renglón** repite la marca — por si el papel se
corta o se lee a medias. Que la cocina confunda una cancelación con un pedido nuevo es el peor
desenlace posible.

**Un cero honesto vale más que un número creíble.** Si no hay datos de hoy, se dice; no se
muestran los de anteayer con la etiqueta "hoy".

## Tacto

- Objetivo mínimo **44px**; los de uso frecuente (productos del catálogo, teclado de PIN,
  cobrar) van a **56px** o más.
- Separación mínima de 8px entre objetivos destructivos y no destructivos. "Quitar" nunca pegado
  a "Cobrar".
- Nada depende de `hover`: hay dedo, no mouse. El hover puede añadir, nunca revelar.

## Dinero

Siempre en `font-display`, **bold**, `tabular-nums`. El total de la pantalla es el número más
grande que hay en ella; subtotal e IVA son informativos y van en tipografía menor.

Un número que cambia de significado sin cambiar de aspecto es un bug de diseño: si un total es
de la tanda y no de la cuenta, tiene que decirlo.

## Estado de la caja, siempre visible

Sin conexión, sincronizando, turno abierto, folios restantes. El cajero no debe descubrir que
lleva media hora offline al intentar cobrar.

## Lo que NO se hereda de otras apps

- **La densidad del admin.** Aquí el scroll es tiempo frente a un cliente, pero apretar de más
  produce toques equivocados. Prefiere menos elementos antes que elementos más chicos.
- **El tema oscuro del KDS.** Está calibrado para una pantalla lejana en una cocina.
