# Diseño — Pantalla del cliente (`apps/pos`, modo `?cliente`)

> Hereda todo de [`nucleo.md`](nucleo.md): color, tipografía y curvas. Aquí va solo lo que es
> cierto **en un monitor que mira hacia el mostrador**.

## Quién y dónde

Segundo monitor de la caja, de cara al mostrador. La ve alguien de pie, a un metro o más, que no
la toca y que no vino a leer una pantalla: voltea a verla dos o tres veces mientras pide, y otra
cuando paga. En cada vistazo quiere saber una sola cosa — qué le están cobrando, cuánto debe o
cuánto le regresan.

El monitor es el que el negocio tenga a la mano: horizontal, vertical, o uno viejo casi cuadrado.
La ventana no recibe foco ni teclado; el cajero nunca la opera.

## Reglas

- **Se lee de lejos.** Todo el tamaño va en `vmin`: el monitor puede ser horizontal, vertical o casi
  cuadrado. Nada mide en píxeles fijos.
- **Un solo número manda.** En la cuenta, el total; al cobrar, el total a pagar; al terminar, el
  cambio. Es lo más grande de la pantalla en cada fase.
- **No se toca.** Sin cursor, sin selección, sin botones, sin scroll manual. La lista se desplaza
  sola para dejar a la vista el último artículo.
- **No dice nada privado.** Ni notas de cocina, ni nombre, teléfono o dirección del cliente, ni
  nombre del cajero. Esto se garantiza en `construirVista`, no aquí.
- **El total es el del cajero.** Mismo número que el costado de la caja, siempre.

## Fases

| Fase | Qué muestra |
|---|---|
| Reposo | Logo y nombre del negocio. Con anuncios (entrega 2), el carrusel. |
| Cuenta | Renglones (cantidad, nombre, detalle, importe), envío si aplica, total fijo abajo. |
| Cobro | «Total a pagar» y el monto. |
| Pagado | «¡Gracias!» y el cambio; sin cambio, «Vuelva pronto». |

Si la caja deja de publicar 15 s (se colgó, se recargó), la pantalla vuelve sola a reposo: la
cuenta de un cliente no se queda a la vista del siguiente.

## Tema claro, y por qué

Fondo blanco y tinta, igual que la caja. El tema oscuro del KDS está calibrado para una cocina; en
el mostrador hay luz de local y el cliente ve la caja y esta pantalla en el mismo vistazo: tienen
que leerse como el mismo sistema.

## El color no decora

Casi todo es tinta sobre blanco. Hay un solo color y significa una sola cosa:

- **`success`, solo en Pagado**: la palomita y la cifra del cambio. Es el mismo dibujo del «Cobro
  completado» de la caja. Sin él, Cobro y Pagado son la misma composición —un letrero y una
  cifra— y de lejos «lo que debe» se confunde con «su cambio».
- **El azul de marca no aparece.** El azul significa «esta es la acción», y aquí nadie hace nada.

## Tamaños

En `vmin`, pensados para leerse a un metro:

| Qué | Tamaño |
|---|---|
| Cifra que manda (total a pagar, cambio) | `16vmin`, Sora bold |
| Total de la cuenta | `11vmin`, Sora bold |
| Títulos («Total a pagar», «¡Gracias!», nombre del negocio) | `7vmin`; `10`–`12vmin` cuando no hay nada más grande en pantalla |
| Renglón (cantidad, nombre, importe) | `4vmin` |
| Detalle del renglón | `2.8vmin`, el piso de la pantalla |
| Logo | `34vmin` de alto, sin importar el tamaño de la imagen |

**Una cifra nunca se corta.** En un monitor vertical o cuadrado el ancho es `100vmin`, y
`$1,234.50` a `16vmin` ya lo roza. Las cifras grandes miden su tope **o menos si no caben**
(`tamanoCifra`): una cifra cortada por el borde es un total falso de cara al cliente.

**El dinero, como en la caja:** `font-display`, bold o semibold, `tabular-nums`. El total de la
cuenta repite el bloque del costado de la caja —etiqueta en versalitas, cifra en Sora—.

**La lista no se estira de orilla a orilla.** En horizontal se queda en una columna de `130vmin`,
centrada: con más, la vista tiene que cruzar medio monitor para ir del nombre al importe. En
vertical ocupa todo el ancho.

**Cuando la lista no cabe**, se ancla al final y lo de arriba se desvanece contra el fondo en vez
de cortarse en seco a media letra.

## Sin cursor, sin tocar

No hay mouse, dedo ni teclado. Todo estado se entiende sin interacción, y no existe ningún control
que alguien pudiera querer tocar: ni botones, ni barras de desplazamiento, ni foco.

## Movimiento

Solo dos cosas se mueven, las dos son entradas, y las dos usan `--ease-out` con 200 ms:

| Qué | Cómo |
|---|---|
| Cambio de fase | Fundido de la fase que entra (`vim-fade`, solo opacidad). |
| Renglón recién agregado | `animate-vim-pop`: opacidad y un desplazamiento corto. |

- **Las cifras no se animan nunca.** Esta pantalla cambia con cada toque del cajero; el total
  nuevo tiene que estar ahí al instante, no llegando.
- **Los renglones que ya estaban al entrar a la fase no se animan** uno por uno (al reabrir una
  cuenta de mesa, al volver del cobro): llegan con el fundido de la fase.
- **El desplazamiento de la lista es instantáneo.** Ocurre antes de pintar, junto con la entrada
  del renglón nuevo.
- Con `prefers-reduced-motion`, **sin movimiento**: ni fundido ni entrada
  (`motion-reduce:animate-none`).

## Lo que NO se hereda

- **La acción dominante.** No hay botón azul porque no hay acción.
- **El detalle del ticket del cajero.** Ni subtotal, ni IVA, ni descuentos desglosados: el cliente
  ve renglones y total. Lo demás va en su ticket impreso.
- **La densidad de la caja.** Aquí sobra espacio a propósito; el que mira está más lejos y tiene
  menos tiempo.
