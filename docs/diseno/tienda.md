# Diseño — Tienda en línea (`apps/tienda`)

> Hereda todo de [`nucleo.md`](nucleo.md), con dos excepciones de marca (abajo). Su pariente más
> cercano es [`factura.md`](factura.md): la otra app que ve alguien que no trabaja en el restaurante.

## Quién y dónde

El **comensal**. Tiene hambre, está en su casa o en el coche, con el teléfono en una mano, y llegó
por un enlace que el restaurante puso en su Instagram o le mandó por WhatsApp. No tiene cuenta y no
va a leer nada: va a buscar lo que se le antoja, pedirlo y dejar el teléfono.

Vuelve. A diferencia del portal de factura, esta pantalla sí se abre muchas veces: lo que se toca
cada visita (el menú, agregar, la cantidad) no se anima; solo responde al presionar.

## La marca que se ve es la del restaurante

El logotipo (o la inicial del nombre, si no subió uno) y el nombre del negocio van arriba en todas
las páginas. VIM aparece una sola vez, al pie y en chico: «Pedidos con VIM POS».

## El color del negocio: solo en la acción principal

El dueño elige cualquier color, sin revisar contraste. Por eso el color tiene un solo trabajo:

| Dónde | Cómo |
|---|---|
| **La acción principal de la pantalla** — «Agregar», «Ver pedido», «Continuar» | Fondo `--accent` (el color del negocio), texto `--sobre-accent` (blanco o negro, el que dé más contraste; siempre ≥ 4.5:1) |
| La inicial del negocio, si no hay logotipo | Igual |
| Realce tenue («2 en tu pedido») | Fondo `--accent-soft` con texto `ink` |

- Las variables se pisan en el `layout` del negocio (`variablesDeColor`, `app/lib/color.ts`).
- **Nunca como color de texto ni de línea sobre blanco**: un amarillo no se leería. Lo elegido (el
  chip de categoría activo, un radio, una casilla), el foco y los enlaces van en `ink`.
- El botón lleva un borde interior tenue: con un color casi blanco sigue teniendo orilla.
- Es la clase `PRINCIPAL` de `app/components/piezas.tsx`, no el `Button` de `@vim/ui`, que fija el
  texto en blanco. Las acciones secundarias sí usan `botonClases({ variant: "ghost" })`.
- **Una sola por pantalla.** Si la barra «Ver pedido» está visible, es la única; dentro de una hoja
  manda el botón del pie de la hoja.

Los semánticos no cambian con el negocio: `danger` para lo que impide continuar, `warning` para la
tienda cerrada, `success` solo en el punto de «Abierto».

## Móvil primero de verdad

Pensada para 360–430 px; en escritorio es la misma columna, centrada (`max-w-2xl`).

- Todo lo que se toca mide **44 px o más**. Un chip de categoría se ve de 36, pero su botón mide 48.
- Campos y selectores a `text-16`: por debajo, iOS hace zoom al enfocar.
- La acción principal siempre abajo, al alcance del pulgar: la barra del carrito o el pie de la hoja,
  con el margen del área segura.
- Selectores nativos (`<select>`, radios, casillas): en un teléfono, el control del sistema es el
  mejor control.

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Marco | `[negocio]/layout.tsx` | Logotipo o inicial, nombre, color del negocio, pie con VIM |
| Encabezado | `components/tienda.tsx` | Descripción, sucursal (si hay más de una), estado, dirección, teléfono, horario desplegable y cómo se recibe |
| Entrega | `components/entrega.tsx` | Para recoger / a domicilio y la zona. Va en el encabezado y en el carrito |
| Menú | `components/menu.tsx` | Chips de categoría pegajosos (el activo sigue al desplazamiento) y los productos como una carta |
| Hoja | `components/hoja.tsx` | Sube desde abajo en el teléfono; diálogo centrado desde 640 px |
| Producto | `components/producto.tsx` | Foto, opciones con su regla, cantidad, nota y «Agregar» |
| Carrito | `components/carrito.tsx` | Renglones, nota para el restaurante y la cuenta |
| Tus datos | `components/datos.tsx` | Quién recibe, a dónde, cómo paga y «Enviar pedido». Va dentro de la hoja del carrito |
| Seguimiento | `components/seguimiento.tsx` | El estado en grande, el recorrido, el restaurante, el resumen y «Copiar enlace» |
| Privacidad | `[negocio]/privacidad/page.tsx` | El aviso (provisional, marcado como tal). Se enlaza desde «Tus datos» y desde el pie |

**El menú es una carta, no una rejilla de tarjetas.** Renglones separados por una línea: nombre,
descripción en dos líneas como máximo y precio a la izquierda; la foto (96 px) a la derecha, si hay.
Sin foto, el texto ocupa todo el ancho: no hay marco vacío ni icono de imagen rota (una foto que no
carga se quita sola). Sin sombras ni cajas.

**La hoja** es un `<dialog>` nativo: el navegador atrapa el foco, cierra con Escape y lo devuelve a
lo que la abrió. Se cierra también tocando afuera, con la ✕ o arrastrando la cabecera hacia abajo.
Al abrir, el foco cae en «Cerrar», no en un campo: el teclado no debe taparle el producto a nadie.
Entra en 300 ms y sale en 180; con movimiento reducido solo funde.

**Las opciones** dicen su regla en palabras junto al nombre del grupo: «Elige 1», «Opcional»,
«Opcional · hasta 3», «Elige de 1 a 2». «Elige 1» son radios; lo demás, casillas, y al llegar al
máximo las que faltan se apagan. Un extra enseña su precio (`+$17.40`); lo agotado se queda en la
lista, apagado y con la palabra «Agotado».

**La cuenta** (subtotal, envío, total) va con puntos guía, como en un ticket. El total que manda es
el que calcula el servidor: mientras llega se ve el estimado **atenuado** y debajo «Calculando el
total…»; ese renglón de texto siempre ocupa su lugar, para que nada brinque.

## Tus datos

Un formulario de teléfono, no de escritorio: una columna, y solo dos pares lado a lado (número
exterior / interior, código postal / ciudad).

- **La etiqueta va arriba y siempre se ve**; nunca un `placeholder` haciendo de etiqueta. Lo opcional
  lo dice a la derecha de la etiqueta («Opcional»); lo demás es obligatorio y no lleva asterisco.
- Cada campo con su teclado y su autocompletado: `tel` para el teléfono, `numeric` para el código
  postal, `decimal` para «¿Con cuánto pagas?»; `name`, `tel-national`, `email`, `address-line1`,
  `postal-code`, `address-level2`, `address-level1`.
- **El error va junto al campo**, en `danger`, con el borde del campo en rojo, y dice qué hacer
  («El código postal tiene 5 dígitos.»). Aparece al salir del campo, no mientras se escribe. Al
  enviar con errores, se marcan todos y el foco va al primero. Va enlazado con `aria-describedby` y
  `aria-invalid`.
- Las reglas son las mismas que aplica el servidor (`app/lib/cliente.ts`): lo que aquí pasa, allá
  también.
- Al entrar, el foco va al título de la sección, no a un campo: el teclado no se abre solo.
- **Forma de pago:** con una sola encendida no se pregunta, se dice. Con dos, radios en `ink`.
- Lo escrito no se pierde por volver al carrito. Al teléfono solo se guarda (nombre, teléfono, correo
  y dirección) cuando el pedido entra; nunca la nota, el pago ni el enlace del pedido. Cuando se
  rellenó solo, lo dice y ofrece «Olvidar mis datos».

**Enviar.** El botón del pie es la acción principal: «Enviar pedido» y el total a la derecha.
Mientras trabaja se apaga y dice qué está pasando («Enviando tu pedido…», «Comprobando que no eres
un robot…»); un segundo toque no hace nada. Lo que sale mal aparece **encima del botón**, donde está
el pulgar, y cada caso deja a la vista solo lo que sí sirve:

| Qué pasó | Qué queda en el pie |
|---|---|
| Se puede volver a intentar (sin conexión, antirobot, demasiados intentos, tienda cerrada) | El aviso y el mismo botón |
| El total cambió | Aviso (`warning`) con el total nuevo, «Confirmar y enviar» con ese total y «Volver a tu pedido» |
| No se supo si el pedido entró | Aviso (`danger`), **«Llamar al …» como acción principal** y, en secundario, «Ya llamé y no les llegó: enviar otra vez». Nunca se reintenta solo |
| Por aquí no se va a poder | Aviso, «Llamar al …» y «Volver a tu pedido» |
| Se arregla en el carrito (la zona, un producto) | Aviso y «Volver a tu pedido»; si es un producto, regresa solo y lo marca |
| Es de un campo o del pago | El texto junto al campo, con el foco ahí |

## Seguimiento

Una página para mirar de reojo varias veces: **el estado es lo más grande de la pantalla**
(`text-32`, `font-display`) con su línea de apoyo debajo. Arriba, en chico, el folio y la hora.

- **El recorrido** es una lista vertical de los pasos de *su* modo (para recoger no existe «En
  camino»). Sí es una secuencia, por eso lleva marcas: hecho (relleno con palomita), actual (relleno
  con punto, texto en negritas) y pendiente (hueco, texto `ink-3`). Todo en `ink`: el color del
  negocio no entra aquí. El estado no depende del color: cada paso lo dice en texto para lectores
  de pantalla.
- **Cancelado rompe el recorrido**: no se pinta la lista; el título va en `danger` con el motivo
  debajo y los botones para llamar.
- «Llamar» y «WhatsApp» son secundarios (`ghost`, lado a lado). La única acción principal de la
  página aparece al final: «Pedir de nuevo», cuando el pedido terminó.
- El resumen usa la misma cuenta con puntos guía del carrito. Sin importes por renglón (el servidor
  no los manda).
- Se actualiza sola; no hay botón de «actualizar» ni indicador girando. Si deja de haber conexión,
  un aviso (`warning`) «Sin conexión. Reintentando…» **sin borrar lo último que se supo**.
- **El código del pedido nunca se escribe en la pantalla**, ni en el título de la pestaña: lo que
  se enseña es el folio. «Copiar enlace» toma la dirección de la barra.

## Precios

Siempre el precio final (`precio_final_mxn`, `precio_extra_final_mxn`): lo que se va a cobrar. En
`font-display` con `tabular-nums`, como todo el dinero de VIM. Nunca se guarda un precio en el
teléfono.

## Textos

De comensal, sin palabras de la caja ni códigos. Todos salen de `app/lib/textos.ts`.

| Momento | Texto |
|---|---|
| Se puede pedir | «Abierto» |
| Fuera de horario | «Cerrado ahora. Abre hoy a la 1:00 p. m.» / «…Abre el lunes a las 2:00 p. m.» |
| En pausa | «No estamos tomando pedidos en este momento. Vuelve a intentar en unos minutos.» |
| Falta elegir | «Elige 1 en «Término».» |
| Renglón que ya no se puede pedir | «Se agotó. Quítalo para continuar.» |
| Carrito vacío | «Tu pedido está vacío» · «Elige algo del menú y aparecerá aquí.» · botón «Ver el menú» |
| Cotización lista | «Pagas al recibir tu pedido.» |
| Enviando | «Enviando tu pedido…» |
| No se supo si entró | «No pudimos confirmar tu pedido. Antes de volver a intentarlo, llama al restaurante: 477 123 4567.» |
| El total cambió | «El total de tu pedido cambió: ahora es $310.00. Confirma para enviar tu pedido con ese total.» |
| Estados del pedido | «En proceso», «En preparación», «En camino», «Listo para recoger», «Entregado», «Cancelado» (con su línea de apoyo; `textoDeEstado`) |
| Enlace que no lleva a un pedido | «No encontramos este pedido.» · «El enlace puede estar vencido o mal copiado…» |
| Bajo el seguimiento | «Guarda este enlace para volver a ver tu pedido.» · «Copiar enlace» → «Enlace copiado.» |

Un botón dice lo que hace y lleva su importe a la derecha: «Agregar   $139.20», «Continuar   $278.40».

## Estados

| Estado | Qué se ve |
|---|---|
| **Tienda cerrada** (horario, pausa, caja sin abrir) | El menú completo y el carrito funcionan. En el carrito, el aviso (`warning`) ocupa el lugar de «Continuar» |
| **Producto agotado** | Renglón atenuado, etiqueta «Agotado», no se puede tocar |
| **Falta una elección** | «Agregar» se ve apagado y debajo dice qué falta. Si se toca, lleva al grupo y lo marca en rojo |
| **Carrito cargando** | El menú se ve igual que lo mandó el servidor; la barra «Ver pedido» aparece cuando ya se leyó el teléfono |
| **Calculando el total** | Importes atenuados, «Continuar» apagado con «Calculando…» |
| **No se pudo calcular** | Aviso (`danger`) con qué pasó y qué hacer, y «Volver a intentar» |
| **Algo del pedido ya no está** | El renglón lleva su aviso en rojo y un botón «Quitar»; abajo, «Quita lo que está marcado para continuar.» |
| **A domicilio sin zona** | «Elige tu zona de entrega para ver el total.» |
| **Pedido empezado en otra sucursal** | Hoja que pregunta: «Seguir en {otra}» (principal) o «Empezar en {esta}». Cerrarla sin elegir vuelve a la otra: es lo que no borra nada |
| **No cargó la tienda o el menú** | Título, qué hacer y «Volver a intentar» |
| **Menú sin productos** | «Este menú todavía no tiene productos.» |
| **Enviando el pedido** | Botón apagado con lo que está pasando; no hay velo ni se bloquea el formulario. Mientras dura **no se puede salir de la hoja** («Tu pedido», «Cerrar», el velo, Escape y el arrastre quedan sin efecto): salir a medio envío dejaba mandar el pedido dos veces |
| **Sin formas de pago** | Aviso (`warning`) en «¿Cómo pagas?» y «Enviar pedido» apagado |
| **Buscando el pedido** | «Tu pedido» y «Buscando tu pedido…»; si la primera lectura falla, «Estamos tardando en cargar tu pedido. Seguimos intentando…» con el botón «Reintentar ahora» |
| **Tienda abierta / cerrada** | Se vuelve a preguntar sola cada minuto con la pestaña a la vista y al volver a ella (no mientras se llena «Tus datos» ni con un producto abierto) |
| **Pedido no encontrado** | Título, qué pudo pasar y «Ver el menú» |
| **Página que no existe** | «No encontramos esta página» y qué hacer, sin la marca de ningún negocio |

## Accesibilidad

- El estado de la tienda lo dice el texto; el punto de color solo acompaña.
- Cada grupo de opciones es un `fieldset` con su `legend` (nombre y regla); los de «Elige 1» son
  `radiogroup`.
- Lo que cambia solo se anuncia con `aria-live`: qué falta para agregar, el total, el estado al
  cambiar de modo. Un renglón que hay que quitar es `role="alert"`.
- El foco por teclado es un contorno `ink` de 2 px en todo lo que se toca.
- En «Tus datos», el aviso de un envío que falló es `role="alert"`; lo que pasa mientras se envía se
  anuncia con `aria-live`.
- En el seguimiento, el estado y su línea de apoyo viven en una región `aria-live="polite"`: el
  cambio se anuncia sin robar el foco. El paso actual lleva `aria-current="step"`.
- Fotos con `alt` («Foto de …»), tamaño reservado y carga diferida.

## Lo que NO se hereda

- El azul de VIM: aquí `--accent` es del negocio. Por eso tampoco el `Button` primario de `@vim/ui`.
- El `Modal` de `@vim/ui`: manda el foco al primer campo, que en un teléfono abre el teclado.
- Los objetivos táctiles de caja (`h-14` en todo): es un teléfono personal. 44 px es el mínimo y la
  densidad es la de una web móvil; `h-14` queda para la acción principal.
- Nada del tema oscuro del KDS.
