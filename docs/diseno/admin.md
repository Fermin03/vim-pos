# Diseño — Panel del dueño (`apps/admin`)

> Hereda todo de [`nucleo.md`](nucleo.md).

## Quién y dónde

El dueño o el gerente, en una laptop, sentado, con tiempo. No está operando: está **entendiendo**
— cuánto se vendió, qué se canceló, quién atendió, cuánto queda de inventario. Puede leer una
tabla de 40 filas sin que se le caiga el negocio encima.

Es la app más grande del monorepo (73 pantallas) y la que más crece.

## Densidad, al revés que en el POS

Aquí sí se aprieta. Filas de tabla de 40px, tipografía de 13–14px, y tantas columnas como quepan
sin scroll horizontal. Obligar a paginar de tres en tres para "que respire" es hacerle perder el
tiempo a quien vino a comparar.

## Números

- Alineados a la **derecha**, `tabular-nums`, siempre con la misma cantidad de decimales dentro
  de una columna.
- Los negativos en `danger`, con signo, no solo en rojo: el color se pierde al imprimir y en
  daltonismo.
- Totales de columna en negrita y separados por una línea, no por un espacio.

## Fechas y rangos

Todo reporte lleva rango de fechas, y el rango **nunca deja elegir el futuro** ni un inicio
posterior al fin: se deshabilita Aplicar y se dice por qué. Un reporte vacío por un rango
invertido parece un negocio sin ventas.

El día contable no es el día natural. Cuando un reporte usa día contable, lo dice.

## Gráficas

Usan la **paleta funcional** del núcleo (seis colores, en `nucleo.md`), nunca el azul de marca: el azul significa "esta
es la acción", y una barra no es una acción. Una serie, un color, estable entre pantallas.

## Acciones peligrosas

Cancelar un ticket, borrar un producto, cerrar un turno ajeno. Piden confirmación que **nombra la
consecuencia** y, cuando toca dinero, PIN. Nada destructivo vive junto a un filtro.

## Combos

En Catálogo, **Combos** vive como pestaña propia entre Modificadores y Recetas (ADR 0015). Un
combo se crea con los mismos datos que cualquier producto —nombre, categoría, clave SAT sugerida
`90101503` (editable, no obligatoria)— y de ahí se navega a la pantalla del combo a agregarle
**slots**: uno por paso que va a ver la caja. Un slot puede tomar sus opciones de **una categoría
entera** en vez de listarlas una por una — es la forma normal de decir "cualquier hamburguesa" sin
mantener la lista a mano cada vez que se da de alta una.

Una opción agotada no se oculta del slot: se marca. El combo se sigue vendiendo aunque falte un
insumo puntual, y ocultar la opción escondería el motivo por el que el cliente ya no la ve en caja.

La **vista previa de precio** recalcula en vivo, con cada slot que se agrega o edita, lo que de
verdad va a pagar el cliente ("Con Clásica $140 · Con Doble $175") — porque el precio final del
combo no está escrito en ningún campo del formulario, sale de sumar slots, y el dueño necesita
verlo tal como lo calcula la caja antes de publicar, no confiar en que la suma le salió bien en la
cabeza.

La lista de Combos también trae el switch **"Ofrecer el combo en la caja"**
(`configuracion_tenant.combo_upsell_activo`, migración 0111): apaga la pregunta "¿Lo hacemos
combo?" que la caja le hace al cliente cuando el cajero agrega suelto un producto que es principal
de un combo. Vive aquí, no en Configuración, porque solo afecta a los combos — mismo criterio que
el switch de descuento de inventario, que vive en Inventario y no en Configuración.

**Lealtad.** La sección aparece siempre en el menú. Sin el programa contratado ocupa la pantalla una
tarjeta que dice qué es y un botón que abre WhatsApp con el mensaje escrito (misma regla que
Inventario). Con él, el interruptor vive en la pestaña Programa, no en Configuración. Apagarlo y
cambiar la forma de ganar pasan por `DialogoPeligro` y dicen la consecuencia: al apagar, los saldos
se conservan; al cambiar de forma, quedan en cero y se dice a cuántos clientes afecta. El ejemplo
de la pestaña Programa se calcula con la misma regla que usa la caja (`@vim/db/lealtad`).

## Inventario desde el plan Negocio (0148, ADR 0025)

Un negocio cuyo plan no incluye inventario **sigue viendo** Inventario en el menú y Recetas en
Catálogo, con una etiqueta pequeña "Plan Negocio". No se esconden: esconder una sección que el
sitio anuncia hace pensar que el producto no la tiene. Al entrar, en lugar de las pantallas, una
tarjeta tranquila: qué es ("El inventario viene desde el plan Negocio"), las cinco cosas que
incluye en palabras de restaurantero y **un** botón azul, "Preguntar por el plan Negocio", que
abre WhatsApp con el mensaje ya escrito (quién, negocio y código). Sin precios —los dice quien
contesta, que sabe qué promoción tiene el cliente—, sin rojo, sin candados dibujados y sin
`Aviso`: no es una alerta, es el contenido de la pantalla. Si la lectura de módulos falla se
enseñan las pantallas de siempre; el candado de verdad está en la base.

## Plan y pagos

El dueño ve lo que paga HOY y hasta cuándo ("$499 al mes hasta el 31 mar 2027, después $699"),
nunca solo el precio de lista (0141, ADR 0021). La prueba gratis es un `Aviso` que no se cierra
ni bloquea: `info` mientras corre, `warning` al vencer — la caja sigue vendiendo, así que no es
rojo. Sale también arriba del dashboard, con enlace a Plan y pagos.

Debajo, **"Lo que tienes contratado"** (0147): un renglón por cosa —el plan y cada add-on, con
"2 × $249.00" cuando va por cantidad e "incluido en tu plan" cuando no cuesta— y el **total al
mes**, que es el mismo número que ve VIM en su panel. Solo aparece si hay algo además del plan:
con un solo renglón no dice nada. Sin cobro activo no hay total; se dice que empieza a cobrarse
junto con el plan. Bajo el nombre del plan va hasta dónde puede crecer, con las mismas palabras
que usa VIM: "Hasta 2 sucursales · 1 caja por sucursal + 2 cajas adicionales (1 en uso)".

"Cómo pagar" enseña los datos que VIM captura en su panel (banco, titular, CLABE en grupos de
cuatro, correo) con botón de copiar, y un botón de WhatsApp con el mensaje del comprobante ya
escrito — la única acción azul de la pantalla. Sin datos capturados, un texto neutro que manda a
escribirle a VIM: **nunca datos de ejemplo**, porque un dato de pago falso manda dinero a otro lado.

## Llegada del cliente (0142, ADR 0022)

**Registro.** Es público (el sitio enlaza "Pruébalo 30 días gratis"). Paso 2 pide nombre, WhatsApp
de 10 dígitos, correo, ciudad y contraseña, la casilla de términos y aviso de privacidad (enlaces
al sitio, en pestaña nueva) y el captcha, que casi nunca pide nada. Al terminar **no entra**: la
pantalla dice a qué correo se mandó el enlace y ofrece reenviarlo. Iniciar sesión sin confirmar no
es un error rojo: es un aviso `warning` con el mismo "Reenviar el correo de confirmación".

**Ayuda por WhatsApp.** Va al pie del menú lateral —también en el cajón del celular—, fuera de
las secciones porque no es una pantalla, con el horario debajo. Abre WhatsApp con el mensaje ya
escrito (quién, negocio y código). Nunca queda sin número: si la consulta falla, sale el oficial.

**Descargar la caja** (Configuración → Cajas → Descargar, y el paso "Conecta la computadora de tu
caja"). Un solo botón azul con la versión y la fecha de la última publicada; debajo, en lenguaje de
restaurantero, lo que hace falta y el paso a paso. La impresora de **red** se dice en negritas
porque es lo que más se compra mal; los modelos van como ejemplos, nunca como "probados".

**Correo de bienvenida (0146).** Con la cuenta confirmada —al abrir el enlace del registro o al
fijar la contraseña de la invitación— sale UN correo al dueño con lo mismo que "primeros pasos",
en el mismo orden, más la descarga de la caja, el equipo que hace falta (Windows 10 u 11 e
impresora **de red**), cómo se paga y el WhatsApp de soporte con su horario. Es para el día en que
instale la caja, que casi nunca es el día en que se registró. Texto de restaurantero, sin
imágenes ni adornos, y cada enlace enseña su dirección. La pantalla no espera ese correo ni dice
nada si falla: si los pasos cambian en `lib/onboarding.ts`, cambian también en
`supabase/functions/_shared/bienvenida.ts`.

## Avisos de facturación (0143)

La factura global **se emite a mano** y el sello digital vence: las dos cosas tienen fecha límite
ante el SAT y ninguna se le puede pasar al dueño. Salen como `Aviso` arriba del dashboard y de
Facturación, con la misma lectura (`useAvisosFacturacion`), sin poder cerrarse:

- **Sello por vencer** — `warning` desde 30 días antes, con la fecha y los días que faltan; a 7 días
  el mismo tono con la consecuencia en negritas ("tu negocio deja de facturar"); **vencido** es
  `danger`, porque ahí sí hay algo impedido. Las reglas son de `@vim/db/sello`, las mismas que usa
  la bandeja de VIM ("Sello por vencer").
- **Periodos sin factura global** — "Tienes N periodos sin factura global: … Emitir". Solo a un
  negocio con sello y sin pausa. En Facturación cada periodo pendiente tiene su botón, el más viejo
  primero. Qué es un periodo y qué venta cuenta lo decide la base (`periodos_globales_pendientes`).

Nada de correos ni tareas programadas: el aviso vive donde el dueño ya entra.

## Pantalla del cliente (0150, ADR 0026)

Configuración → **Pantalla del cliente**: las imágenes que el segundo monitor de la caja muestra
cuando nadie está cobrando. Una sola página para todo —subir, ordenar, pausar, quitar **y el
tiempo**—, porque el dueño decide cuánto dura una imagen viéndola, no en otra sección.

- **Tiempo en pantalla**, arriba de la lista: un campo de 3 a 60 segundos con Guardar. Es el tiempo
  general, el de toda imagen que no tenga uno propio. El error de validación sale junto al campo.
- **Cada renglón**, en el orden en que salen: número, miniatura (entera, `object-contain`),
  interruptor Activo / En pausa, selector de tiempo y Subir · Bajar · Eliminar. El selector empieza
  en "Tiempo general (8 s)" —con el número vigente, para que se entienda qué es— y sigue con
  tiempos fijos; cambiarlo guarda en el acto, sin botón.
- **El orden se cambia con Subir y Bajar**, sin arrastrar: funciona igual con el dedo y con el
  teclado, y son diez renglones como mucho.
- **Tope de 10**, a la vista ("3 de 10 · 1 en pausa"). Al llegar, el botón azul dice "Ya hay 10
  anuncios" y se apaga; la regla de verdad está en la base.
- **Una escritura a la vez.** Mientras algo se guarda, los demás controles de la lista no
  responden, y al terminar —bien o mal— se vuelve a leer la lista: lo que se ve es lo guardado. El
  renglón que se guarda se atenúa; los demás no parpadean.
- Eliminar pasa por `DialogoPeligro` y dice la consecuencia: deja de mostrarse en las cajas.
- Un aviso fijo dice cuánto tardan los cambios en llegar a las cajas (uno o dos minutos), porque
  el dueño va a voltear a ver el monitor en cuanto suba la imagen.
- A quien no es dueño ni administrador se le dice eso mismo, no el rechazo de la base.

Aquí los controles **sí miden 44 px**: es de las pocas páginas de Configuración que el dueño abre
desde el celular, parado junto a la caja, con la foto de la promoción que acaba de recibir.

## Menús del catálogo (0155, ADR 0029)

La franja de menús aparece arriba de las pestañas del Catálogo cuando el negocio tiene dos o más
sucursales, o algún menú propio; con una sola sucursal, el Catálogo se ve como siempre.

- **Una pastilla por menú**, con las sucursales que lo usan en gris. «General» siempre va primero.
  El menú elegido se recuerda entre pestañas y entre visitas.
- **La pastilla activa va en tinta sólida** (`bg-ink`, texto blanco; sus sucursales en blanco al
  75 %), como el atajo activo del rango de fechas. Las demás, superficie blanca con borde. Solo
  borde y negrita no bastaba para saber qué menú se está editando.
- **Los enlaces llevan el menú** (`?menu=`): editar, «Nuevo producto», «Nuevo combo» e «Importar»
  abren en el menú de la lista, no en «el último usado» (que con dos pestañas puede ser otro).
- **Si los menús no cargan**, la franja lo dice en rojo con «Reintentar» y nada guarda precio ni
  «se vende» hasta que carguen. No se degrada en silencio al General.
- **«Nuevo menú»** pide nombre (hasta 80 caracteres) y sucursales. Arranca igual que el General; si
  una sucursal viene de otro menú propio, se dice antes de guardar. Eliminar nombra la
  consecuencia: sus sucursales vuelven al General.
- **Cada pestaña trabaja sobre el menú elegido.** Productos y Combos: casilla «En este menú» y
  precio en línea. Categorías: «N de M productos» y un interruptor que apaga o enciende la
  categoría entera (con parte encendida se ve «parcial», con la casilla en estado indeterminado).
  Modificadores y Recetas dicen que son los mismos en todos los menús; Recetas aclara además que
  el margen se calcula con el precio del menú General.
- **Combos:** «Nuevo combo» dentro de un menú propio lo crea solo ahí y lo avisa antes de guardar
  («Solo se venderá en Menú Norte»). La vista previa del combo dice de qué menú es («En Menú
  Norte, tal como lo calcula la caja») y cuenta con los precios de ese menú; si el menú no vende
  alguna opción, lo dice en una línea en vez de sumarla.
- **Importar menú:** con un menú propio elegido, una nota arriba de la página: «La importación
  crea los productos en el menú General y en todos tus menús, al mismo precio.»
- **No se comparan precios.** En un menú se ve solo su precio; nunca el de otro menú al lado.
- **Formulario de producto:** el precio y «se vende» son del menú elegido, y lo dice junto al
  campo; el resto es del producto. Un producto creado dentro de un menú propio solo se vende ahí, y
  el formulario lo avisa antes de guardar. Con una sola sucursal y un menú propio, el selector «En
  la caja» conserva «Agotado».
- **El agotado no es del menú.** Es de la sucursal y del día: en el formulario queda «Agotado hoy»
  con una casilla por sucursal.
- **Escrituras en línea:** entran en una cola, una a la vez, y ninguna se pierde (la cola está
  duplicada en las páginas de Productos y de Combos); solo se atenúa el renglón que se está
  guardando. La casilla «se vende» es la misma en las dos (`casilla-menu.tsx`): área de toque de
  44 px en táctil y 40 en escritorio, y `aria-disabled` mientras guarda para no perder el foco.
- **Aviso de cajas viejas** (anteriores a la 0.4.110): se conserva; una caja así no respeta ningún menú.

## Tienda en línea (0161–0163)

Menú principal → **Tienda en línea**: donde el dueño arma la tienda en la que sus clientes piden
desde el teléfono. Una sola página, sin pestañas, porque son pocos campos y se llenan una vez. Sin
el complemento concedido, en su lugar va la invitación (`PedirModulo`). Su cierre depende de lo que
VIM ofrece (`invitacionTienda`): mientras el complemento no esté activo en el catálogo, sin precios
(«Estamos por lanzarla…»); ya activo, «Tu plan incluye la tienda en línea. Escríbenos para
activarla.» o, si el plan no la incluye, **el precio** («La tienda en línea cuesta $100 al mes en tu
plan. Escríbenos para contratarla.»). En los tres la acción es escribir por WhatsApp.

Los bloques, en este orden, cada uno en su `Tarjeta`:

1. **Estado** — el interruptor «Tienda en línea» y, debajo, la lista de revisión.
2. **Tu tienda** — dirección (`pedidos.vimpos.com.mx/` + lo que escriba), logo, color y una
   descripción de hasta 200 caracteres.
3. **Pedidos** — aceptación «A mano» o «Automática», minutos de espera (3 a 15, solo en «A mano») y
   formas de pago al recibir (al menos una).
4. **Sucursales** — una tarjeta por sucursal: si vende en la tienda, si entrega para recoger o a
   domicilio, y su horario.
5. **Compartir** — el enlace con su botón de copiar y el QR para descargar. Solo existe cuando ya
   hay dirección guardada.

Las reglas:

- **El interruptor dice lo que ve el cliente**: «Encendida: tus clientes ya pueden pedir.» o
  «Apagada: nadie puede verla.». Encender no pide confirmación; apagar sí (`DialogoPeligro`, con la
  consecuencia: los pedidos que ya entraron se atienden igual). Apagar siempre se puede.
- **La lista de revisión manda sobre el interruptor.** Lo que **bloquea** (aviso ámbar) impide
  encender: falta la dirección, ninguna sucursal vende en la tienda, o una sucursal que vende no
  tiene horario, no tiene teléfono, no eligió recoger ni domicilio, ofrece domicilio sin zonas de
  envío, o está inactiva. Lo que **solo avisa** (aviso azul) no impide nada: productos sin foto, sin
  descripción o en una categoría inactiva. Cada renglón que se arregla en otra pantalla lleva su
  enlace («Ir a sucursales», «Ir a zonas de envío», «Ir al catálogo»). Sin pendientes dice «Todo
  listo para recibir pedidos.»
- **Cada bloque guarda lo suyo, con su propio botón.** «Tu tienda» guarda dirección, color y
  descripción; «Pedidos», aceptación, minutos y pagos; cada sucursal, su tarjeta. Ninguno pisa lo
  que otro guardó, aunque la página lleve rato abierta en otra pestaña. El resultado se dice junto
  al botón del bloque («Cambios guardados.» o el error), sin avisos flotantes.
- **Una escritura a la vez** en toda la página: mientras algo se guarda, los demás botones no
  responden y solo el que guarda dice «Guardando…».
- **Si un guardado entra pero no se puede volver a leer**, lo guardado ya queda en pantalla y el
  bloque lo dice en ámbar: «Se guardó, pero no se pudo actualizar la pantalla.» con «Reintentar».
  Hasta que la lectura salga bien no se guarda nada más. Si lo que falla es la primera lectura, no
  se pinta ningún formulario: solo el motivo y «Reintentar».
- **«Pedidos» espera a la dirección.** Mientras no haya dirección guardada, sus campos y su botón
  van apagados y dice «Primero guarda la dirección de tu tienda.» Lo mismo el logo.
- **La dirección se normaliza al salir del campo**, no mientras se escribe: sin acentos, en
  minúsculas y con guiones en vez de espacios («Tacos El Güero» queda `tacos-el-guero`). El error
  sale entonces, junto al campo. La primera vez se propone una a partir del nombre del negocio.
  **Cambiar una dirección ya guardada pide confirmación** y dice la consecuencia: dejan de
  funcionar los códigos QR impresos y los enlaces de seguimiento de los pedidos en curso.
- **Horario por día, un solo rango.** Cada día tiene su casilla «Abre» y, si abre, hora de apertura
  y de cierre. Un cierre anterior a la apertura se anota «Cierra al día siguiente»; apertura igual
  al cierre, «Abre todo el día». El primer día abierto lleva «Copiar a todos los días». Una hora
  mal escrita se señala en su renglón.
- **Una sucursal inactiva no puede empezar a vender** (su interruptor va apagado y dice «Sucursal
  inactiva»); si ya vendía, sí se puede apagar. Una tarjeta con cambios dice «Cambios sin guardar».
- **Logo y foto de producto se suben al momento**, sin esperar al «Guardar» de su formulario
  (`CampoImagen`). El orden es siempre subir → guardar → borrar la anterior: pase lo que pase a la
  mitad, lo guardado apunta a una imagen que existe. La imagen se reduce antes de subir (foto 1200 px,
  logo 800 px, menos de 1 MB). Un error que no se reconoce nunca se enseña crudo: «No se pudo subir
  la imagen. Inténtalo de nuevo.»
- **La foto del producto vive en la ficha del producto** (Catálogo) y solo se ofrece a quien tiene
  la tienda concedida; a los demás la ficha les queda como siempre.
- A quien no es dueño ni administrador se le dice eso mismo («Solo el dueño o un administrador
  puede cambiar esto.»), no el rechazo de la base.

Aquí los controles **sí miden 44 px** (`h-11`): el dueño abre esta página desde el celular, con el
teléfono en una mano y el local enfrente. En celular la dirección se parte en dos renglones (el
prefijo arriba, el campo abajo a todo el ancho).

## Piezas que se repiten en el panel

Viven en `apps/admin/app/components` y se usan en vez de volver a escribir el marcado:

- **`Segmentos`** (`controles.tsx`) — el control segmentado de los filtros de lista ("Todos · Activos ·
  Inactivos") y de "Agrupar por" en los reportes (`grande`, de 40 px, para ir junto al rango de fechas).
  Es un grupo con nombre y cada opción dice si está elegida (`aria-pressed`).
- **`AccionFila`** (`controles.tsx`) — las acciones de texto al final de una fila (Editar, Pausar,
  Eliminar). La que destruye lleva `peligro` y va **en rojo en reposo**, no solo al pasar el mouse.
- **`label` e `input`** (`campos.ts`) — la etiqueta y el campo de formulario estándar. Un campo con
  otra altura o tamaño de letra declara el suyo en su archivo.
- **`PedirModulo`** (`pedir-modulo.tsx`) — la tarjeta de una sección que el plan no incluye
  (Inventario, Lealtad): qué es, qué trae y un solo botón que abre WhatsApp.
- **`Tarjeta`** (`tarjeta.tsx`) — el bloque de un formulario: borde, título y, si hace falta, una
  línea de descripción. Es una sección con nombre (`aria-labelledby`).
- **`Interruptor`** (`interruptor.tsx`) — encender o apagar UNA cosa. La etiqueta es un `<label>`
  de verdad y el estado se dice en palabras debajo. La pista mide 24 px y su zona de toque 44.
  `deshabilitado` es que no se puede cambiar; `ocupado` es que se está guardando: se atenúa y no
  responde, pero conserva el foco (`aria-disabled`, sin `disabled`).
- **`CampoImagen`** (`campo-imagen.tsx`) — una imagen que se sube al momento: miniatura de 96 px,
  «Subir» o «Cambiar», y «Quitar» en rojo con confirmación. Mientras trabaja, sus botones se quedan
  enfocables y dicen «Subiendo…» o «Quitando…».
- Los diálogos son siempre `Modal` de `@vim/ui`: cierra con Escape y lleva el foco al primer campo.
- Los fondos de las etiquetas de estado salen de los tokens (`bg-danger-soft`, `bg-warning-soft`,
  `bg-info-soft`, `bg-hover`), no de un hexadecimal.

## Lo que NO se hereda del POS

- Los objetivos de 44–56px. Con mouse, 36–40px es lo correcto; 44 se ve infantil.
- La regla de una sola acción dominante: un formulario largo puede tener guardar y cancelar sin
  competir, porque no hay prisa ni dedos.
