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

## Servicio suspendido: avisar sin estorbar, bloquear sin dejar tirado

Desde la entrega 2 del ADR 0014 la caja obedece las **directivas** que le manda la nube en cada
latido. Dos estados nuevos, y ninguno improvisa: la caja no calcula nada, solo aplica lo que
recibió.

- **Gracia** — banda amarilla arriba con el mensaje que escribió VIM y la fecha en que la caja
  dejará de vender. El cajero **sigue cobrando**. El aviso es para que el dueño lo resuelva, no
  para frenar el mostrador.
- **Bloqueado** — pantalla completa antes del PIN, con el WhatsApp de soporte (número legible,
  horario y botón «Abrir WhatsApp»; ver «Ayuda por WhatsApp» abajo). Dice que las
  ventas anteriores están a salvo y se siguen respaldando, porque esa es la primera pregunta de
  un dueño bloqueado. La sincronización **no se detiene**: quien se ponga al corriente no perdió
  nada.

**La falta de datos nunca bloquea.** Sin archivo de directivas, con el archivo corrupto o con la
nube caída, la caja vende. Perder ventas por un corte de red nuestro sería peor que el impago que
esto persigue. Por eso el bloqueo es un control **comercial**, no una barrera de seguridad: lo que
de verdad cuesta dinero —timbrar un CFDI— se cierra además en el servidor.

### Avisos de VIM

Desde la entrega 3 del ADR 0014, VIM puede mandarle un mensaje al cajero: llega por el mismo
latido y se muestra **al abrir turno**, en un diálogo.

**De uno en uno, nunca en lista.** Un cajero con prisa cierra una lista sin leer nada, y el
acuse diría que la leyó. Así cada aviso cuesta un toque y el acuse significa algo. El botón dice
**Entendido** cuando VIM pidió confirmación y **Cerrar** cuando no.

**Un aviso nunca impide vender.** El diálogo se cierra siempre, incluso si el acuse no se pudo
registrar; lo peor que pasa entonces es que vuelva a salir en el siguiente turno. El cuerpo se
renderiza como texto plano, nunca como HTML.

### Bloqueo por versión: la única pantalla de bloqueo con salida

Desde la entrega 4 del ADR 0014, la caja puede quedar bloqueada por estar **por debajo de la
versión mínima** que VIM exige. Es la misma pantalla completa, con dos diferencias que importan:
el título dice **"Actualiza para seguir vendiendo"** en vez de "Esta caja no puede vender", y
trae un botón que **instala la actualización** ahí mismo.

**Un bloqueo sin salida sería una trampa.** A diferencia de la suspensión, esta la decide la
caja comparando con su propia versión, así que puede morder sin internet; y a diferencia de la
suspensión, el cajero *sí* puede resolverla solo. Por eso el botón va en la pantalla y no en un
menú. El WhatsApp de soporte se queda igualmente: si la actualización no encuentra nada —caso
típico de una **segunda caja de la LAN**, que no puede instalar desde ahí— la pantalla lo dice
con esas palabras y le manda a actualizar la caja principal.

Cualquier motivo de bloqueo que la caja no reconozca se trata como suspensión, no como versión:
un valor raro no puede dejar la pantalla a medio pintar ni ofrecer un botón que no lleva a nada.

### Ayuda por WhatsApp

Desde 0142 (ADR 0022) el menú trae, en **Ajustes**, la tarjeta **Ayuda por WhatsApp**, con el
horario debajo («Atendemos de 9:00 a 18:00»). Abre WhatsApp fuera de la caja con el mensaje ya
escrito: negocio, sucursal, caja y versión de VIM POS — lo primero que pregunta soporte. El menú se
queda abierto: al volver, el cajero sigue donde estaba.

El número lo edita VIM en /platform y **viaja en el latido**: la caja lo guarda con sus directivas y
lo sigue enseñando sin internet. Sin nada guardado —una caja recién instalada— sale el número de
fábrica. Nunca hay un botón de ayuda en blanco.

### El menú se actualiza solo

Un producto dado de alta en /admin aparece en la caja **en menos de un minuto**, sin reiniciar
nada. Antes el catálogo se cargaba una sola vez al abrir la caja y solo se volvía a bajar de la
nube una vez por hora: el dueño daba de alta un producto, se paraba frente a la caja y no estaba.

**El cambio entra sin interrumpir a nadie.** La pantalla relee el menú en el sitio; el carrito, la
cuenta de mesa abierta y el turno siguen donde estaban. Y lo que ya está en el ticket **no se
reescribe**: cada línea guarda el nombre y el precio con los que se pidió, así que un cambio de
precio a media cuenta no le mueve el total al cajero delante del cliente.

También llega la vuelta contraria: si el dueño marca un producto como agotado o lo quita del
menú, desaparece de la caja por el mismo camino.

**Y hay un botón, en Ajustes → "Actualizar menú".** El minuto automático cubre el día normal;
el botón es para el dueño que acaba de guardar un producto y lo quiere en pantalla ahora, con el
cliente delante. Dice "Menú actualizado" cuando llegó y explica el motivo cuando no —sin nube, la
caja sigue cobrando con el menú que tiene, que es lo único que no se puede interrumpir.

En la **segunda caja de la LAN y en la cocina** el menú se refresca igual: el aviso viaja por el
mismo canal que las comandas.

### Combos: un slot por paso, y el avance lo da el toque

Desde el ADR 0015 un combo se captura en un drawer de **un slot por pantalla** (Hamburguesa →
Acompañamiento → Bebida → Resumen). En un slot de una sola elección, **tocar la tarjeta selecciona
y avanza**: no hay botón "Siguiente" que buscar. Se probó en el prototipo del 8 sep 2026 y el dueño
lo aprobó tal cual. Los defaults vienen preseleccionados, así que el caso común son tres toques —
salvo que el default esté agotado: ese slot arranca sin elegir y hay que tocar.

Una opción agotada no desaparece de la tarjeta: se ve, deshabilitada, con la insignia "Agotado". El
combo entero no deja de venderse porque falte una papa chica; solo esa opción queda fuera hasta que
vuelva el inventario — mismo criterio en el editor de combos del admin.

Si el producto elegido tiene un modificador obligatorio (el término), su modal se abre **encima**
del paso y al confirmar se avanza; no se vuelve a la lista. "Personalizar" en una tarjeta ya elegida
abre los opcionales. Ese modal anidado tiene su propio Escape, que cierra solo los modificadores —
no todo el drawer del combo—, y si el grupo era obligatorio, cerrar deshace la selección: mejor un
slot sin elegir que uno elegido a medias.

El precio va en vivo en la cabecera y en el botón. Las tarjetas dicen "+$15" cuando cambian el
precio e "Incluido" cuando no: el cajero lo lee sin sumar.

**"¿Lo hacemos combo?"** aparece como hoja inferior al agregar suelto un producto que es principal
de algún combo, con el diferencial ("+$45 · papas y refresco"). Es la pregunta que el cajero le
hace al cliente de todos modos; el sistema solo la calcula. **Sí** abre el combo ya en el paso 2 y
conserva la nota de cocina que el cajero ya le había puesto al producto suelto: queda pegada a ese
componente, no al combo entero, y llega así a su propio renglón en cocina. **No, solo** agrega el
producto tal cual estaba — Escape hace lo mismo, el producto nunca se pierde. No aparece al agregar
a una cuenta de mesa ya enviada a cocina (reabriría la comanda).

El dueño apaga "¿Lo hacemos combo?" por negocio desde **Catálogo → Combos** en el admin, con el
switch "Ofrecer el combo en la caja" (`configuracion_tenant.combo_upsell_activo`, migración 0111).
Vive ahí y no en Configuración porque solo afecta a los combos: es del mismo módulo que los crea,
no una preferencia general del negocio.

En el carrito el combo es **un renglón con precio** y sus hijos indentados bajo una línea vertical,
cada uno con su slot en versalitas. Un extra con costo dentro de un hijo muestra su importe; lo
incluido no muestra nada. **Editar reabre el drawer en el resumen — solo mientras el ticket no se
ha guardado.** En una cuenta de mesa ya persistida no hay botón Editar en un combo: se cancela el
renglón completo (motivo y autorización, como cualquier ítem) y se vuelve a capturar. Es el mismo
criterio que ya regía para los modificadores; un combo no es una excepción.

En la comanda y el KDS **el combo no existe**: salen sus hijos, cada uno en su estación, con
"↳ Combo #n" para que plancha y barra sepan que van juntos. En el ticket del cliente es al revés:
"1x Combo $170" cobra por todos a la vez y los hijos van sin el precio del combo — pero un extra con
costo dentro de un hijo (p. ej. "Extra queso") sí se imprime con su importe, porque eso lo pagó de
más, y la nota de cocina de ESE hijo también sale ahí, un nivel más adentro que la del renglón
normal, para que quien lo recibe sepa qué llevaba ese componente y no solo la cocina.

### El corte de turno: se cuenta a ciegas y el papel dice el resultado

El arqueo solo pide lo contado; lo que el sistema esperaba no se ve hasta generar el corte (0127).
Por eso el **corte Z** es donde queda escrito:

- **Arqueo de efectivo**, después de la declaración del cajero: *esperado*, *declarado* y
  *diferencia*, siempre con signo. En pantalla el faltante va en rojo y el sobrante en ámbar; en el
  papel no hay color, así que el signo es lo que manda.
- **Propinas repartidas**, bajo la forma de pago de la propina: un renglón por persona con su nombre.
  Solo sale si el turno repartió algo (el reparto va por mesero); nunca un título sin renglones ni
  un identificador en lugar del nombre.

La vista en pantalla (`recibo-z.tsx`) y el papel (`reporte-z-builder.ts`) llevan las mismas
secciones en el mismo orden: lo que se cambia en uno se cambia en el otro.

### Pedidos en línea: la tienda llega a su canal; Uber, a su pantalla

Lo que llega por internet se atiende en dos sitios, según de dónde venga:

| Qué | Dónde llega | Dónde se cuenta |
|---|---|---|
| Pedido de la tienda propia, para recoger | Lista de **Pick-up**, arriba de las cuentas | Contador de Pick-up |
| Pedido de la tienda propia, a domicilio | Lista de **Domicilio**, arriba de las cuentas | Contador de Domicilio |
| Pedido de Uber Eats (y las demás apps) | Pantalla **Pedidos en línea**, en tarjetas | Contador del mosaico «Pedidos en línea» |

Antes los pedidos de la tienda vivían en tarjetas junto a los de Uber y, una vez aceptados, había
que ir a buscarlos a otra pantalla para cobrarlos. Ahora nacen donde se van a cobrar.

**En la lista del canal**, lo que está por aceptar va arriba, bajo el rótulo «De tu tienda en línea
· por aceptar», del más antiguo al más nuevo. Cada tarjeta lleva borde azul (rojo con menos de dos
minutos), el cliente, el total, «Por aceptar» y la cuenta atrás hasta que vence. El subtítulo de
la pantalla los cuenta primero («1 por aceptar · 2 órdenes por recolectar»). Al tocarla, el
panel derecho muestra el pedido completo: «Tienda en línea · Para recoger» (o «A domicilio»), el
folio, el cliente con su teléfono (se toca para llamar; dentro de la caja instalada va como texto),
la dirección con sus referencias, los productos con modificadores y notas, la nota del cliente, el
envío, el total y la forma de pago.

- **Aceptar es la acción principal y Rechazar va lejos de ella**, al otro extremo de la fila.
  Rechazar pide uno de cuatro motivos («Producto agotado», «Cocina saturada», «Ya cerramos», «Otro
  motivo»): el cliente los ve en su seguimiento, así que la lista es cerrada y no hay texto libre.
- **Al aceptar**, el pedido deja de estar por aceptar, su cuenta aparece en la misma lista como
  cualquier otra y queda seleccionada. Desde el POS web es inmediato; en la caja instalada la
  cuenta la abre la propia caja en unos segundos, y mientras el panel dice «Aceptado. Su cuenta
  aparece aquí en un momento.»
- **Un pedido aceptado no tiene tarjeta propia**: es una cuenta normal de Pick-up o de Domicilio.
- **Sin botones cuando este dispositivo no puede atenderlo**, y dice por qué: «Se atiende desde el
  POS web.» (dentro de la caja instalada, un pedido que lleva el POS del navegador), «Otra caja ya
  tomó este pedido.» o «Se venció sin aceptar.». Esos tampoco cuentan en el contador ni timbran.
- **No hay «Marcar listo» en la tienda** (decisión 2 de la entrega 4). El estado sale de lo que el
  cajero ya hace: imprimir el ticket o asignar repartidor es «listo», cobrar es «entregado»,
  cancelar el ticket es «cancelado». Una tarjeta de Uber sí lo conserva, tal como estaba.
  En una caja instalada lo reporta la caja; un pedido atendido desde el POS web (sin caja) lo pone
  al día la nube sola, **cada minuto**.
- **Lo que se cerró solo se dice en su canal**, en una franja roja arriba de la lista que se cierra
  con la ×: «El pedido T1234 se venció sin aceptar.», o lo que la caja dejó dicho al cancelarlo
  («Pedido T1234: …»). Ahí queda también el pedido que se canceló **al intentar aceptarlo** («ya no
  coincide con tu menú o tus zonas de envío…»), se haya aceptado desde la lista o desde el aviso
  grande: hay que avisarle al cliente, y eso no cabe en un aviso de seis segundos.
- **Los errores dicen qué hacer, sin códigos:** «Abre un turno para aceptar pedidos.», «Este pedido
  ya fue atendido.», «Este pedido ya no coincide con tu menú o tus zonas de envío. Se canceló y tu
  cliente ya lo sabe.»

**El aviso grande.** Cuando llega un pedido de la tienda que este dispositivo puede aceptar, aparece
una capa centrada **encima de lo que haya** —el inicio, la venta, un cobro, la cocina— con «Pedido
nuevo de tu tienda en línea», **Para recoger / A domicilio** en el tamaño más grande de la capa, el
folio, el tiempo que queda para aceptarlo, el cliente, los productos (cinco renglones y «y N
productos más»), el total y la forma de pago. Botones: **Aceptar** (el único azul), **Rechazar**
(los mismos cuatro motivos, dentro de la misma capa), **Ver orden** y la ×.

- **Sale una vez por pedido.** Cerrarlo (×, Escape o tocar fuera) no lo hace reaparecer; el timbre
  sigue sonando cada 20 segundos y el contador del canal sigue ahí hasta que alguien lo atienda.
- **Con varios, van en fila**, del más antiguo al más nuevo, y dice «1 de 3».
- **Se quita solo** si el pedido deja de estar por aceptar: lo aceptó o rechazó otra pantalla, lo
  tomó otra caja o venció.
- **No rompe lo de abajo.** Es una capa: al cerrarla, el cobro a medias sigue como estaba y el foco
  vuelve a donde estaba.
- **El foco cae en la ×, nunca en Aceptar ni en Rechazar**, y vuelve a la × al pasar al siguiente
  pedido de la fila. El cajero puede estar tecleando un importe: un Enter que iba para el cobro no
  debe aceptar ni rechazar un pedido.
- **Mientras está abierto, el teclado es suyo.** El teclado numérico del cobro y el del PIN escuchan
  las teclas de toda la ventana; con el aviso encima, Enter cobraría por detrás y los dígitos
  seguirían entrando al importe tapado. El aviso corta las teclas antes de que lleguen a lo de
  abajo; pasan solo Escape (cerrar) y Tab (recorrer sus botones).
- **«Ver orden» lleva a Pick-up o a Domicilio con ese pedido seleccionado.** Si hay un cobro, un
  diálogo o un pedido a medias en pantalla, no navega: avisa «Termina lo que tienes abierto. El
  pedido te espera en Pick-up.» y el pedido se queda en su canal. Cuentan también los diálogos de la
  propia lista de cuentas (cancelar, descuento, PIN, asignar repartidor, reservaciones).
- **Tras «Ver orden», el resto de la fila espera.** El siguiente aviso no cae encima del detalle que
  el cajero acaba de abrir: la fila continúa cuando ese pedido deja de estar por aceptar (se
  aceptó, se rechazó o venció) o cuando el cajero sale de ese canal.
- No aparece durante el cierre de turno (quien cuenta la caja ya no atiende pedidos; el timbre sí).
- Escape lo atiende el propio aviso (`Modal`); `home-pos` lo declara como capa que cede.

**El aviso breve.** Una franja oscura arriba, sin botones, que se quita sola a los seis segundos.
Sale cuando un pedido entra a su canal sin que el cajero lo haya aceptado ahí —la tienda acepta en
automático, o lo aceptó otra pantalla—: «Pedido nuevo en Pick-up · T1234». También dice a dónde fue
el que se aceptó desde el aviso grande («Pedido aceptado. Está en Pick-up.») y por qué no se pudo
atender uno. Con aceptación automática en el POS web el aviso grande no aplica: el pedido se acepta
solo y basta con el breve.

**El timbre se repite.** Un pedido nuevo suena al llegar, **desde cualquier pantalla** del POS, y
vuelve a sonar **cada 20 segundos** mientras quede alguno por aceptar: un pedido que nadie atiende
no puede depender de que el cajero haya estado mirando justo en ese momento. Al abrir el POS con un
pedido ya pendiente suena enseguida. Vale para los dos canales (Uber también). Si el navegador
bloquea el audio, los contadores siguen ahí; el timbre nunca estorba al cobro.
**Solo suena por lo que este dispositivo puede aceptar:** no por un pedido que ya tomó otra caja,
ni por uno cuya hora de aceptar ya pasó (una caja sin internet conserva el pedido «por aceptar»
hasta que vuelve la red; el timbre calla al vencer la ventana), ni por uno que llega ya cancelado.

**La pantalla «Pedidos en línea» queda para Uber y para pausar.** Lista las tarjetas de las apps
(con su Aceptar, Rechazar y «Marcar listo», como siempre) y lleva arriba las dos barras: la de la
tienda propia y, debajo, la de Uber. Ya no lista pedidos de la tienda; lo dice en una línea: «Tus
pedidos en línea llegan a Pick-up y a Domicilio.» Si el negocio solo tiene la tienda (sin Uber), la
pantalla sigue existiendo por la barra de pausa, con esa misma línea al centro. El aviso del inicio
de pedidos vencidos sin aceptar sigue llevando aquí.

**La barra de pausa de la tienda** dice en una línea cómo está — «Tienda: recibiendo pedidos»
(verde), «en pausa hasta las 2:30 p. m.», «fuera de horario», «sin turno abierto» o «apagada» (en
ámbar) — y ofrece **Pausar…** (30 minutos, 1 hora o «Hasta que la reanude») o **Reanudar**. Los
botones solo aparecen si la sucursal vende en la tienda; sin datos, la barra lo dice y no ofrece
nada. «Sin turno abierto» no es un error de la tienda: es que no hay caja con turno que pueda
cocinar el pedido.

**La nota del pedido viaja con la cuenta.** El pedido de la tienda trae lo que el cliente pidió por
escrito y la forma de pago, y eso se guarda en la nota de la cuenta. El panel de detalle de
**Pick-up** y de **Domicilio** muestra una franja «Nota del pedido: …»; el ticket impreso la lleva
en negritas, bajo los datos de entrega y antes de los productos, y la comanda de cocina también.
En el papel, la separación « · » sale como « - »: la impresora cambia lo que no es ASCII por «?».
**Solo en tickets nacidos de la tienda** (`notaPedidoDe`: creados por la tienda y en modo Pick-up o
Domicilio), en los tres lugares: pantalla, ticket y comanda. El recado a cocina que teclea el cajero
en una cuenta normal es la misma columna, y no sale ahí: una cuenta que no es de la tienda se ve y
se imprime exactamente como antes. La tienda ya no pregunta con cuánto paga el cliente; si un
pedido lo trae, se sigue mostrando («Efectivo, paga con $500.00»).

**La comanda sale sola al aceptar**, una vez, por áreas. Si la impresora falla, **no se reintenta
sola**: una comanda duplicada en la cocina cuesta más que una que el cajero manda a mano. En su
lugar, la tarjeta de esa cuenta en la lista de Pick-up o de Domicilio lleva la marca roja «Comanda
sin imprimir» (se nota sin abrirla) y su detalle muestra una alerta —«La comanda no se imprimió.
Revisa la impresora.»— con el botón **Imprimir comanda**, que la manda desde ese dispositivo sin
pedir PIN (es la primera impresión, no una reimpresión). La alerta aparece pasados
unos 20 segundos sin comanda y se quita cuando sale el papel.

## Lo que NO se hereda de otras apps

- **La densidad del admin.** Aquí el scroll es tiempo frente a un cliente, pero apretar de más
  produce toques equivocados. Prefiere menos elementos antes que elementos más chicos.
- **El tema oscuro del KDS.** Está calibrado para una pantalla lejana en una cocina.
