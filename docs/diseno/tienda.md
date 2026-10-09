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
| Tus datos | `components/datos.tsx` | Quién recibe (o recoge), a dónde, cómo paga y «Enviar pedido». Va dentro de la hoja del carrito |
| Seguimiento | `components/seguimiento.tsx` | El estado en grande, el recorrido, el restaurante, el resumen y «Copiar enlace» |
| Privacidad | `[negocio]/privacidad/page.tsx` | El aviso (provisional, marcado como tal). Se enlaza desde «Tus datos», desde «Crear cuenta» y desde el pie |
| Campos | `components/campo.tsx` | El campo de texto y el de contraseña de TODOS los formularios, y cómo se comportan (`useCampos`, `useAccion`) |
| Acceso | `components/acceso.tsx` | Entrar, crear cuenta y recuperar la contraseña. Una página cada una (`[negocio]/entrar`, `registro`, `recuperar`) |
| Mi cuenta | `components/cuenta.tsx` | Pedidos, datos, direcciones, contraseña y sesión, y eliminar la cuenta (`[negocio]/cuenta`) |

**El menú es una carta, no una rejilla de tarjetas.** Renglones separados por una línea: nombre,
descripción en dos líneas como máximo y precio a la izquierda; la foto (96 px) a la derecha, si hay.
Sin foto, el texto ocupa todo el ancho: no hay marco vacío ni icono de imagen rota (una foto que no
carga se quita sola). Sin sombras ni cajas.

**La hoja** es un `<dialog>` nativo: el navegador atrapa el foco, cierra con Escape y lo devuelve a
lo que la abrió. Se cierra también tocando afuera, con la ✕ o arrastrando la cabecera hacia abajo.
Al abrir, el foco cae en «Cerrar», no en un campo: el teclado no debe taparle el producto a nadie.
Entra en 300 ms y sale en 180; con movimiento reducido solo funde.

### La regla de altura de la hoja (y por qué)

**La hoja mide lo que mide su contenido, hasta su tope** (92 % del alto visible en el teléfono); al
llegar al tope el cuerpo se desplaza y el pie —con la acción principal— se queda fijo y a la vista.
Una hoja corta («Borrar dirección») es corta; no se estira.

Se arma siempre con las tres clases de `components/hoja.tsx`: `COLUMNA` (la envoltura, o el `<form>`
que la sustituye), `CUERPO` y `PIE`. Tres reglas que no se negocian:

1. **Nunca `flex-1` (ni alturas en porcentaje) entre la hoja y su cuerpo.** `flex-1` es
   `flex: 1 1 0%`, y Safari resuelve ese `0%` como cero: en octubre de 2026 la hoja salía en el
   iPhone midiendo solo su cabecera, sin cuerpo ni botón. Chrome lo perdona y por eso no se vio en
   escritorio. Va `flex-initial` (`0 1 auto`) con `min-h-0`: se encoge, no crece, y no hay porcentaje
   que un navegador pueda leer distinto.
2. **`.hoja` lleva `height: auto`**, no el `fit-content` que el navegador le pone a un `<dialog>`
   (es lo que hace que WebKit crea que la altura ya se conoce). Por eso en escritorio se centra con
   `translate`, no con `inset: 0; margin: auto`.
3. **El tope es `dvh`**, con `vh` de respaldo: `vh` cuenta la barra del navegador aunque esté visible.

**En el teléfono, además:**

- El pie respeta la franja de inicio (`env(safe-area-inset-bottom)`); para que ese valor exista la
  página declara `viewport-fit=cover`, y `body` devuelve el margen lateral con el teléfono acostado.
- **El teclado no tapa el botón.** iOS no encoge la página al abrir el teclado: mientras hay una hoja
  abierta, esta se sube lo que el teclado ocupa y se limita a lo que queda visible
  (`visualViewport`), y el campo con foco se trae a la vista. En Android la página se encoge sola
  (`interactive-widget=resizes-content`).
- Con una hoja abierta el menú de atrás no se desplaza (`overflow: hidden` en la raíz, que Safari
  respeta desde iOS 16) ni se arrastra al llegar al final del cuerpo (`overscroll-behavior`).
- **El anillo de foco de «Cerrar» solo se ve con teclado.** El foco inicial sigue cayendo ahí, pero
  Safari pinta el anillo en cualquier foco puesto por código; la hoja lo esconde cuando se abrió con
  el dedo y lo devuelve en cuanto se usa una tecla.

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
- **El título de los datos de contacto dice de quién son:** «¿Quién recoge?» cuando el pedido es
  para recoger y «¿Quién recibe?» a domicilio.
- Cada campo con su teclado y su autocompletado: `tel` para el teléfono, `numeric` para el código
  postal; `name`, `tel-national`, `email`, `address-line1`, `postal-code`, `address-level2`,
  `address-level1`.
- **El error va junto al campo**, en `danger`, con el borde del campo en rojo, y dice qué hacer
  («El código postal tiene 5 dígitos.»). Aparece al salir del campo, no mientras se escribe. Al
  enviar con errores, se marcan todos y el foco va al primero. Va enlazado con `aria-describedby` y
  `aria-invalid`.
- Las reglas son las mismas que aplica el servidor (`app/lib/cliente.ts`): lo que aquí pasa, allá
  también.
- Al entrar, el foco va al título de la sección, no a un campo: el teclado no se abre solo.
- **Forma de pago:** con una sola encendida no se pregunta, se dice. Con dos, radios en `ink`.
  **No se pregunta con cuánto se paga** (el campo «¿Con cuánto pagas?» se quitó tras probar en
  producción): el pedido viaja con `paga_con: null`. El servidor y la caja siguen sabiendo
  mostrarlo si algún día llega.
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
| No se supo si el pedido entró (`SIN_CONFIRMAR`) | Aviso (`warning`) «No pudimos confirmar tu pedido. Vuelve a intentarlo: si ya había entrado, no se duplica.», **«Reintentar»** con el total como acción principal y, en secundario, «Llamar al restaurante». Reintentar es seguro (va con la misma llave del intento: si el pedido ya había entrado, lleva a su seguimiento), pero nunca se reintenta solo |
| Por aquí no se va a poder | Aviso, «Llamar al …» y «Volver a tu pedido» |
| La sesión de su cuenta terminó | Aviso (`warning`) «Tu sesión terminó. Entra otra vez o envía tu pedido como invitado.», **«Enviar como invitado»** con el total y, en secundario, «Entrar otra vez». Nunca se manda solo como invitado |
| Se arregla en el carrito (la zona, un producto) | Aviso y «Volver a tu pedido»; si es un producto, regresa solo y lo marca |
| Es de un campo o del pago | El texto junto al campo, con el foco ahí |

## Cuentas

La cuenta es opcional y nunca estorba: se puede pedir sin ella de principio a fin. Es de la tienda
de **ese** restaurante (entrar en una no abre sesión en otra).

**Dónde aparece.** En el marco, arriba a la derecha, un enlace de texto en `ink`: «Entrar» o
«Mi cuenta» (44 px de alto, nunca del color del negocio: no compite con la acción principal). Y en
«Tus datos», solo para quien no tiene sesión, una franja tenue (`bg-hover`) antes del primer campo:
«¿Ya tienes cuenta? **Entrar** **Crear cuenta**». Quien sale a entrar vuelve al menú de su sucursal
y su pedido lo espera (vive en el teléfono).

**Entrar, crear cuenta y recuperar** son páginas, no hojas: se llega a ellas por un enlace (también
el del correo) y se vuelve a donde se iba (`?volver=`, que solo admite rutas de ese negocio).

- Título (`text-24`), una línea que dice para qué sirve, el formulario y **un** botón principal de
  ancho completo justo debajo del último campo (con el teclado abierto es lo que queda a la vista).
  Debajo, los enlaces a las otras dos pantallas y «Seguir sin cuenta», en texto.
- Al llegar, el foco va al título: el teclado no se abre solo y un lector de pantalla oye dónde está.
- **Contraseña:** el campo trae «Mostrar» / «Ocultar» escrito (no un ojo), dentro del campo y de
  44 px. Al elegir una nueva, la ayuda dice la única regla («Mínimo 8 caracteres.») y cambia a
  «Bien: tiene 8 caracteres o más.» al cumplirla. No hay medidor de fuerza.
- **Entrar** tiene un solo error para todo, encima del botón: no dice si falló el correo o la
  contraseña.
- **La pantalla nunca dice con palabras si un correo ya tiene cuenta.** Crear una con un correo ya
  usado termina en «Revisa tu correo para continuar»; recuperar siempre termina en «Si hay una
  cuenta con ese correo, te mandamos un enlace.». Entrar y recuperar no dejan averiguarlo; crear
  cuenta sí (un alta nueva entra de una vez, una repetida no): está aceptado y explicado en el
  ADR 0032.
- El enlace de recuperación trae su llave tras `#`, que no viaja al servidor: la pantalla la lee al
  cargar y la saca de la barra. Hasta saber si hay enlace no pinta ni «pedir enlace» ni «contraseña
  nueva» (un instante en blanco, sin salto de una a otra). Un enlace vencido o ya usado no es un
  error en rojo: es una pantalla que lo explica y ofrece «Pedir otro enlace».
- Entrar y salir recargan la página completa: así el marco cambia «Entrar» por «Mi cuenta».

**Mi cuenta** es una página para leer; **cada cambio se hace en una hoja**, con su botón principal
en el pie. Así la página no tiene acción principal propia y ningún formulario abre el teclado sin
que se pida. De arriba abajo, por lo que más se usa:

1. **Mis pedidos** — por pedido: el estado (en negritas; «Cancelado» en `danger`) y el total a la
   derecha, una línea con folio, fecha y modo, lo que se pidió y «Pedir de nuevo» (secundario). El
   estado es el del momento de abrir la página: no se actualiza solo ni enlaza al seguimiento (ese
   enlace solo lo tiene quien hizo el pedido). Un pedido de hace más de 30 días ya no trae con qué
   repetirlo: no lleva botón.
2. **Tus datos** — nombre, teléfono y cumpleaños si lo dio; «Editar» a la derecha del título. El
   correo se ve pero no se cambia.
3. **Direcciones** — nombre de la dirección en negritas y la dirección en una línea; «Editar» y
   «Borrar» (en `danger`) como enlaces de texto. Con 5, «Agregar dirección» se cambia por el texto
   del tope.
4. **Contraseña y sesión** — «Cambiar contraseña» y «Cerrar sesión», secundarios.
5. **Eliminar cuenta** — al final y separada: dice qué se borra y qué conserva el restaurante. Su
   hoja pide la contraseña y una casilla «Entiendo que esto no se puede deshacer».

Lo que no tiene vuelta (borrar una dirección, eliminar la cuenta) sigue al núcleo: **«Volver»
primero y el verbo en rojo** (`danger`), con la consecuencia escrita arriba.

Lo que se hizo («Guardamos tus datos.») se dice en un aviso `success` arriba de la página, que se
cierra con su ×. Si la sesión terminó, no hay aviso: se va a «Entrar» y de ahí se vuelve.

**«Pedir de nuevo»** lleva al menú de la sucursal del pedido con el carrito ya armado y abierto. Lo
que ya no está en el menú no entra, y se dice arriba del carrito en un aviso `warning` que se cierra
(«Ya no se puede pedir: Papas.»). Reemplaza al pedido que hubiera a medias; si nada del pedido
anterior se puede pedir, no se toca.

**«Tus datos» con sesión.** Nombre, teléfono y correo llegan llenos desde la cuenta (se pueden
cambiar para ese pedido; la cuenta no cambia). A domicilio, las direcciones guardadas son radios
(nombre en negritas, dirección debajo) y la última opción es «Otra dirección», que es la única que
abre los campos. Bajo ellos, la casilla «Guardar esta dirección en mi cuenta» y, al marcarla, con
qué nombre. No aparece «Olvidar mis datos»: con sesión el teléfono no guarda nada; en su lugar dice
«Este pedido queda en tu cuenta».

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
| Entrar con datos que no son | «El correo o la contraseña no coinciden. Revisa que estén bien escritos y vuelve a intentar.» |
| Cuenta creada con un correo ya usado | «Revisa tu correo para continuar» (sin decir por qué) |
| Se pidió recuperar | «Si hay una cuenta con ese correo, te mandamos un enlace. Revisa también tu correo no deseado.» |
| Enlace de recuperación vencido o usado | «Este enlace ya no sirve» · «Pedir otro enlace» |
| Demasiados intentos en una pantalla de cuenta | «Demasiados intentos. Espera unos minutos y vuelve a intentar.» (sin «llama al restaurante», que es del pedido) |
| La contraseña actual no es (cambiarla, eliminar la cuenta) | «La contraseña actual no coincide.», junto al campo |
| Tope de direcciones | «Ya tienes 5 direcciones guardadas. Borra una para guardar otra.» |
| Eliminar la cuenta | «Se borra tu cuenta, tus direcciones guardadas y el acceso a tu historial. {Restaurante} conserva en su sistema los pedidos que ya le hiciste.» |
| Sin pedidos en la cuenta | «Todavía no tienes pedidos con esta cuenta. Aquí aparecen los que hagas con tu sesión abierta.» · «Ver el menú» |

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
| **Mi cuenta cargando** | «Mi cuenta» y «Cargando tu cuenta…». Si no carga, el aviso (`danger`) y «Volver a intentar»; si solo fallan los pedidos, la cuenta se ve y esa sección ofrece reintentar |
| **«Mi cuenta» sin sesión** | No se pinta: lleva a «Entrar» y, al entrar, de vuelta |
| **«Entrar» o «Crear cuenta» con sesión** | No se pintan: llevan a donde se iba |
| **Enviando un formulario de cuenta** | El botón se apaga y dice qué hace («Entrando…», «Guardando…»); un segundo toque no hace nada |
| **«Tus datos» con la cuenta aún sin llegar** | El formulario de siempre, vacío; al llegar la cuenta se llena solo lo que siga vacío |

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
- En las pantallas de cuenta cada campo dice qué es al navegador (`email`, `current-password`,
  `new-password`, `given-name`, `family-name`, `tel-national`, `bday`): el gestor de contraseñas
  ofrece guardar y rellenar. «Mostrar» es un botón con nombre («Mostrar contraseña») y `aria-pressed`.
- El error de entrar y lo que rechaza el servidor son `role="alert"`; lo que se guardó y lo que pasa
  mientras se envía se anuncia con `aria-live` sin mover el foco.

## Lo que NO se hereda

- El azul de VIM: aquí `--accent` es del negocio. Por eso tampoco el `Button` primario de `@vim/ui`.
- El `Modal` de `@vim/ui`: manda el foco al primer campo, que en un teléfono abre el teclado.
- Los objetivos táctiles de caja (`h-14` en todo): es un teléfono personal. 44 px es el mínimo y la
  densidad es la de una web móvil; `h-14` queda para la acción principal.
- Nada del tema oscuro del KDS.
