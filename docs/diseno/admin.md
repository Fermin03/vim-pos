# Diseño — Panel del dueño (`apps/admin`)

> Hereda todo de [`nucleo.md`](nucleo.md).

## Quién y dónde

El dueño o el gerente, en una laptop, sentado, con tiempo. No está operando: está **entendiendo**
— cuánto se vendió, qué se canceló, quién atendió, cuánto queda de inventario. Puede leer una
tabla de 40 filas sin que se le caiga el negocio encima.

Es la app más grande del monorepo (73 pantallas) y la que más crece.

## Navegación: un solo menú, desplegable (oct 2026)

Inspirado en el panel de Square: **el menú lateral es la navegación**. Pocos grupos arriba que se
despliegan ahí mismo en sus opciones (hasta tres niveles); cada página del panel tiene su entrada, y
ninguna sección repite sus opciones como pestañas o columna dentro de la página. El árbol vive en
`lib/menu-admin.ts` (con pruebas); el diseño completo, en
`docs/superpowers/specs/2026-10-20-admin-menu-tipo-square-design.md`.

- **Grupos:** Inicio · Menú · Inventario · Clientes · Informes · Personal · Facturación · Ajustes
  (Mi negocio / Dispositivos / Cuenta) — línea — Tienda en línea · Apps de delivery.
- **Acordeón:** tocar un grupo lo despliega o lo pliega, no navega; abrir uno cierra a su hermano.
  Al entrar a una página se despliega su camino y se marca la opción (gana la ruta más larga:
  `/configuracion/cajas/descargar` marca «Conectar computadora», no «Cajas»).
- **Sin animación de altura:** se abre decenas de veces al día. Solo gira el chevron.
- **Buscador** arriba del menú: busca en el menú (etiquetas y unas palabras clave, sin acentos), no
  en datos del negocio. Enter abre el primer resultado; Esc limpia. 16 px en el celular.
- **Lo que no se ve se quita, no se apaga:** rol (`lib/acceso.ts`), módulos de operación
  (`rutasOcultas`) y lo concedido (sin `delivery_apps` desaparece «Conexión», no «Conciliación»).
  Un grupo sin opciones desaparece. La Tienda sin contratar es un solo enlace. Informes enseña los
  mismos grupos que el índice de reportes (`lib/reportes-grupos.ts`).
- **Arriba:** el nombre del negocio y su sucursal, solo texto (la sucursal se elige en cada página).
- **Se quedan como pestañas** solo las partes de UNA opción: Lealtad (Programa / Premios /
  Movimientos) y Zonas de envío (Zonas / Colonias).

**Inicio con pasos.** Mientras el negocio no esté en operación (`fase` ≠ GO_LIVE) y a quien puede
hacerlos (Dueño y Administrador), el inicio abre con «Configura tu negocio para empezar a vender»: una
tarjeta por paso de `lib/onboarding.ts`, el siguiente marcado como **Siguiente** con el único botón
primario, los terminados en una línea. Solo Facturación (opcional) se puede ignorar, y se recuerda en
el navegador. Con todo listo, «Terminar configuración» marca GO_LIVE y el bloque se va. Verlo por
primera vez pasa la fase de INVITADO a EN_CONFIGURACION (Plataforma lee esa fase). `/bienvenida`
redirige al inicio.

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

**Excepción: los periodos de Comisiones.** «Periodo actual» pone la semana o la quincena completa,
que termina después de hoy: es lo que se va a pagar, y solo con el periodo exacto se suma el sueldo.
Ese fin futuro lo pone el botón (o una URL que es exactamente un periodo, que no se recorta al
recargar); escrito a mano, un fin después de hoy sigue sin poder aplicarse.

El día contable no es el día natural. Cuando un reporte usa día contable, lo dice.

## Gráficas

Usan la **paleta funcional** del núcleo (seis colores, en `nucleo.md`), nunca el azul de marca: el azul significa "esta
es la acción", y una barra no es una acción. Una serie, un color, estable entre pantallas.

## Acciones peligrosas

Cancelar un ticket, borrar un producto, cerrar un turno ajeno. Piden confirmación que **nombra la
consecuencia** y, cuando toca dinero, PIN. Nada destructivo vive junto a un filtro.

## Combos

En el menú **Menú**, **Combos** tiene entrada propia entre Modificadores y Recetas (ADR 0015). Un
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

La franja de menús aparece arriba de las páginas del Catálogo cuando el negocio tiene dos o más
sucursales, o algún menú propio; con una sola sucursal, el Catálogo se ve como siempre.

- **Una pastilla por menú**, con las sucursales que lo usan en gris. «General» siempre va primero.
  El menú elegido se recuerda entre páginas y entre visitas.
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
- **Cada página del Catálogo trabaja sobre el menú elegido.** Productos y Combos: casilla «En este menú» y
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

## Tienda en línea (0161–0163, 0168)

Menú lateral → **Tienda en línea** (General · Pedidos y pagos · Sucursales y horarios · Menú, cada
una con su entrada): donde el dueño arma la tienda en la que sus clientes piden desde el teléfono. Sin
el complemento concedido, en su lugar va la invitación (`PedirModulo`). Su cierre depende de lo que
VIM ofrece (`invitacionTienda`): mientras el complemento no esté activo en el catálogo, sin precios
(«Estamos por lanzarla…»); ya activo, «Tu plan incluye la tienda en línea. Escríbenos para
activarla.» o, si el plan no la incluye, **el precio** («La tienda en línea cuesta $100 al mes en tu
plan. Escríbenos para contratarla.»). En los tres la acción es escribir por WhatsApp.

Los bloques, en este orden, cada uno en su `Tarjeta`:

1. **Estado** — el interruptor «Tienda en línea» y, debajo, la lista de revisión.
2. **Tu tienda** — dirección (`online.vimpos.com.mx/` + lo que escriba), logo, color y una
   descripción de hasta 200 caracteres.
3. **Pedidos** — aceptación «A mano» o «Automática», minutos de espera (3 a 15, solo en «A mano») y
   formas de pago: «Pago en línea», «Efectivo al recibir» y «Tarjeta al recibir» (al menos una; la
   única marcada queda fija). «Pago en línea» no se puede encender sin una cuenta de Mercado Pago
   activa.
   - **Pago en línea** (0173) — tarjeta aparte, justo debajo de Pedidos. Sin cuenta: una línea y
     «Conectar Mercado Pago» (la cuenta de la TIENDA: es otra conexión que la de Terminal de
     tarjetas y no se comparten; al terminar vuelve a esta página). Con cuentas: la lista con sus
     píldoras («De prueba: no cobra pedidos reales», «Hay que volver a conectarla»), «Desconectar»
     en cada una (`DialogoPeligro`: dice que la tienda deja de ofrecer el pago en línea y que la
     terminal no cambia; no se puede con un pago por confirmar o una devolución en proceso) y
     «Conectar otra cuenta». Y,
     si hay varias activas, un selector por sucursal que vende en la tienda («¿Qué cuenta cobra en
     …?») que se guarda al elegir. Debajo, «Lo que debes saber» (comisión de Mercado Pago sin
     porcentaje, VIM no cobra por pedido, la devolución es sola y completa, hace falta la caja
     actualizada) y «Últimos pagos en línea»: 30 renglones de solo lectura, sin paginar, con el
     estado en palabras (Pagado, Devuelto, Devolución en proceso, No completado).
   - **En modo de prueba** (lo pone VIM, 0178): la tarjeta abre con un `Aviso` azul que no se
     cierra («Tu tienda está en modo de prueba: los pagos en línea no son reales.» y qué cuenta de
     prueba cobra, o que falta y la configura VIM); **no se ofrece conectar** Mercado Pago (ni
     «Conectar otra cuenta»), la cuenta real lleva la píldora «No se usa en modo de prueba» y no hay
     selector por sucursal. La cuenta de prueba nunca lleva «Desconectar» (la pone y la quita VIM),
     ni aparece en el selector por sucursal.
   - Si el dueño ofrece pago en línea y la tienda no lo está ofreciendo (cuenta en error o
     desconectada, o sucursal sin cuenta elegida), sale un `Aviso` ámbar **arriba de todo**, con su
     botón «Reconectar Mercado Pago» / «Conectar Mercado Pago» cuando eso lo arregla.
4. **Sucursales** — una tarjeta por sucursal: si vende en la tienda, si entrega para recoger o a
   domicilio, y su horario. Con domicilio guardado, **«Envío a domicilio en la tienda»** (ADR 0035):
   «Por zonas» o «Por distancia»; por distancia, el mapa con el punto de la sucursal (tocar o
   arrastrar el pin) y los tramos en renglones «Hasta [ ] km → $[ ]» con «Quitar» en rojo, «Agregar
   tramo» y la nota de hasta dónde se entrega. Guarda aparte, con su botón «Guardar envío», y el error
   de un tramo sale bajo su renglón.
5. **Menú de la tienda** (0168) — qué categorías y productos enseña cada sucursal. Ver abajo.
6. **Compartir** — el enlace con su botón de copiar y el QR para descargar. Solo existe cuando ya
   hay dirección guardada.

(Entre el 5 y el 6 puede salir el aviso «Combos que tus clientes no pueden pedir».)

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

### Menú de la tienda (`tienda-menu.tsx`, 0168)

**Todo nace visible.** La tienda enseña el catálogo entero que la sucursal vende; aquí el dueño
apaga lo que no quiere vender en línea. Se guarda lo escondido (`tienda_ocultos`), así que un
producto nuevo aparece solo y quien nunca toca el bloque no nota nada.

- **Es por sucursal.** Con más de una sucursal que vende en la tienda hay un selector «Sucursal»;
  con una sola, no. Sin ninguna dice «Primero elige, en «Sucursales», cuál vende en la tienda.»
- **Una lista de categorías, cerradas.** Cada una con su `Interruptor` (encendido = se ve) y su
  resumen («12 de 15 productos visibles»); la flecha la abre y hasta entonces se pintan sus
  productos, cada uno con su interruptor y su precio en esa sucursal. Solo salen las categorías
  activas con algo que la tienda pueda enseñar, en el orden del catálogo.
- **Categoría escondida**: su resumen lo dice («Escondida: ninguno de sus 15 productos aparece en la
  tienda») y sus productos van apagados y deshabilitados con «Categoría escondida». Lo que cada
  producto tenía elegido se conserva para cuando la categoría vuelva.
- **Donde el interruptor no manda**, el producto va atenuado, apagado y con el motivo: «No está
  visible en el punto de venta», «Está pausado» o «No se vende en esta sucursal». No cuenta en el
  resumen.
- **«Mostrar todos»** sale dentro de una categoría abierta cuando tiene productos escondidos uno
  por uno. No hay «Esconder todos»: eso es el interruptor de la categoría.
- **Sin botón «Guardar».** Cada toque se pinta al momento y se guarda (una fila que entra o sale).
  Si la base lo rechaza, el interruptor regresa y arriba de la lista sale el motivo, terminado en
  «Quedó como estaba.» Mientras un interruptor guarda no responde, pero los demás sí: este bloque
  **no** entra en la «una escritura a la vez» del resto de la página.
- **Combos**: si el catálogo tiene combos, al pie dice que esconder un producto no lo quita de los
  combos que sí se muestran. Esconder el combo sí lo quita.
- Vacío: «Tu catálogo todavía no tiene productos.» con «Ir al catálogo». Si no se puede leer, el
  motivo y «Reintentar», solo en este bloque.

Aquí los controles **sí miden 44 px** (`h-11`): el dueño abre esta página desde el celular, con el
teléfono en una mano y el local enfrente. En celular la dirección se parte en dos renglones (el
prefijo arriba, el campo abajo a todo el ancho).

## Tienda (giro RETAIL)

Todo esto aparece solo cuando el negocio tiene el módulo de existencias. A un restaurante no se le
muestra nada: ni en el producto, ni en el menú del Catálogo, y la fila «Existencias» de Configuración
→ Operación tampoco sale. Quien entra por enlace directo lee «Esta sección es para tiendas».

- **Bloque «Tienda» del producto** (`producto-form.tsx`). Un `Plegable` más, abierto, como sus
  hermanos «Más datos» y «Fiscal». Lleva el código de barras con su botón «Generar» (crea uno
  interno), el costo («lo que te cuesta a ti») y el interruptor «Lleva existencias». Si el código no
  es un EAN-13 lo avisa, porque la etiqueta saldría sin barras. En un producto con variantes el
  interruptor no se ofrece: las existencias son de cada variante.
- **Tallas y colores** (`producto-variantes.tsx`). Una tarjeta en la ficha del producto con dos ejes,
  por ejemplo «Talla» y «Color», y sus valores separados por coma. De ahí sale una tabla con un
  renglón por combinación (SKU, código de barras, precio, costo y existencia inicial), separados por
  una línea. «Quitar» va en rojo desde el reposo; lo quitado se junta abajo en «Quitadas» con su
  «Restaurar». Una vez guardada cualquier variante, los nombres de los ejes ya no se cambian; los
  valores sí. No tiene botón propio: se guarda con el «Guardar cambios» del producto y lo dice. Si
  el producto se guardó pero las variantes no, el error empieza con «El producto se guardó, pero no
  las tallas y colores».
- **Lista de productos.** Un producto con variantes lleva la pastilla «N variantes» junto al nombre,
  y la búsqueda de la lista también encuentra por código de barras.
- **Importar tienda** (Catálogo → Importar tienda). Se sube un Excel o CSV, o se pega el texto; la
  plantilla se descarga con BOM para que Excel respete los acentos. «Revisar» enseña cómo quedará
  cada renglón en una vista previa; los errores salen por línea («Línea 7: …») y mientras haya uno
  no se puede importar: es todo o nada. La coma decimal se rechaza (se escribe 12.50). Si un SKU ya
  existe se actualizan su nombre, precio, costo y código; la existencia solo cuenta al crear.
- **Etiquetas** (Catálogo → Etiquetas). Se marcan productos, se elige cuántas de cada una (de entrada,
  lo que hay en existencia) y se imprime en hoja carta de 3×10 o en rollo con ancho y alto en mm. El
  código EAN-13 se dibuja como SVG en negro puro: es la única excepción a los tokens, porque la
  impresión no lee el tema y un gris no se escanea. En la impresión el texto va en Arial, una letra
  que toda impresora trae. La zona que se imprime existe solo mientras se imprime (se monta aparte en
  la página), para no tener miles de dibujos ocultos. El PDF sale de «Imprimir» → «Guardar como PDF».
- **Clave del SAT** (campo «Clave de producto SAT», en Fiscal). Debajo del campo hay un buscador
  («camisa, pantalón, tenis…») que llena la clave al elegir un resultado. Es para todos los negocios,
  no solo tiendas, y la clave se puede seguir escribiendo a mano.
- **Existencias** (menú «Existencias», 0192–0194). Solo la ven el dueño y el administrador, porque
  enseña costos y valor. Lleva cinco pestañas (`existencias-tabs.tsx`): Existencias, Recibir, Conteo,
  Traspasos y Movimientos.
  - *Existencias.* Una tabla por producto y sucursal con existencia, mínimo, costo y valor. Arriba
    van piezas, «Valor del inventario» («con el costo de hoy»), bajo mínimo y en negativo. Se filtra
    por Todas, Bajo mínimo, Agotadas y Negativas, y se descarga en Excel. «Mínimo» y «Ajustar» abren
    un modal; con «Todas las sucursales» quedan apagados y se pide elegir una.
  - *Captura* (`captura-productos.tsx`, en Recibir, Conteo y Traspasos). Un solo campo para el
    escáner o el teclado. Con el código exacto (barras o SKU) agrega el producto y se limpia; si no,
    enseña hasta 8 por nombre. Escanear el mismo producto otra vez suma 1 a su renglón.
  - *Recibir.* Sucursal, proveedor opcional y referencia («Ej. F-1234»). El costo de cada renglón es
    opcional; vacío, el costo del producto no cambia. Cambiar de sucursal con algo capturado
    pregunta antes de descartarlo.
  - *Conteo.* Solo se tocan los productos capturados. «Revisar diferencias» vuelve a leer la
    existencia (pudo venderse algo mientras se contaba) y enseña sistema, contado y diferencia antes
    de «Confirmar conteo». Cambiar de sucursal con algo contado pregunta antes de descartarlo.
  - *Traspasos.* Origen, destino y renglones; la mercancía sale del origen al enviar. En «Historial»,
    uno en camino se puede «Recibir» o «Cancelar» (en rojo); al cancelar, la mercancía regresa al
    origen. Ambos piden confirmación. Si el destino está eliminado no se ofrece «Recibir»; si el
    origen lo está, no se ofrece «Cancelar».
  - *Movimientos.* Todo lo que entró y salió, por fechas, tipo y producto, con descarga en Excel.
    Lo que regresa de un traspaso cancelado se nombra «Regresa (traspaso cancelado)».
- **Ventas por talla y color** (Reportes, solo con existencias). Piezas, venta, costo y margen por
  variante. El margen usa la venta sin IVA, ya con descuentos por producto, y el costo de hoy (el
  pie lo dice); los descuentos a toda la cuenta no se restan.

## Agenda: cobro y comisiones (belleza, entrega 2; ADR 0039)

Solo con el módulo `agenda`. Sin él, las rutas y las tarjetas de reportes se ocultan y un enlace
directo dice «Este reporte es para negocios con agenda.».

### Configuración › Agenda (`/configuracion/agenda`)

Tres tarjetas, cada una con su propio Guardar:

- **Tolerancia**, como antes.
- **Cobro:** «Al final», «Anticipo al apartar» o «Todo por adelantado», y el límite para cancelar con
  devolución (de 0 a 168 h).
- **Comisiones:** la base, «Sobre lo cobrado (con descuentos, sin IVA)» o «Sobre el precio de lista
  (sin IVA)» (la de lista no incluye modificadores); un interruptor «Comisión por vender productos»
  con su %; y el periodo, Semanal o Quincenal. Cambiar la base o el % no mueve las ventas ya hechas:
  la regla se congela en cada renglón.

### Servicios (`/agenda/servicios`)

- El formulario trae **Comisión** y **Anticipo**, cada uno con «Sin…», «Porcentaje (%)» o «Monto fijo
  ($)» y su valor, y la **clave SAT**: se escribe o se busca (buscador con ejemplos «corte de cabello,
  manicure, masaje…»). Sin clave, la factura sigue saliendo como servicios de restaurante (90101500).
  Una clave vieja con otro formato no impide guardar si no se toca.
- En «Quién lo hace», cada colaborador puede tener su comisión propia; vacía = la del servicio.
- La tabla suma las columnas Comisión y Anticipo.

### Colaboradores (`/agenda/colaboradores`)

**Sueldo por periodo** va en la tarjeta del colaborador y se guarda con su Guardar. Vacío no es válido:
se escribe 0.

### Reportes

Los dos son de todo el negocio (la vista no filtra por sucursal) y aparecen en «Cómo va la operación».

- **Comisiones** (`/reportes/comisiones`). Abre siempre en el periodo actual; «Periodo actual» y
  «Periodo anterior» ponen el periodo completo y el rango también se puede elegir libre. Cuatro cifras
  y una fila por colaborador: servicios, ventas sin IVA, comisión de servicios, comisión de productos,
  sueldo y total. Tocar un nombre abre sus renglones. **El sueldo solo se suma con un periodo
  exacto**; en un rango libre sale $0 y un aviso lo explica. Si falla el cálculo de periodos, un aviso
  pide elegir las fechas a mano. Un supervisor que no es administrador solo ve sus renglones.
- **Ventas por colaborador** (`/reportes/ventas-colaborador`). Agrupa por colaborador o por servicio:
  vendidos, tickets, ventas sin IVA y %.

### Dar acceso a su celular (Colaboradores, entrega 4; ADR 0041)

En el detalle de un colaborador activo, bloque «Su agenda en el celular»: botón **«Dar acceso a su
celular»**. Manda al correo del colaborador el enlace para poner su contraseña (es el correo de
«recuperar contraseña»; hoy no hay plantilla propia). Después se lee «Correo enviado a …» y «Último
acceso: …» o «Aún no ha entrado». Solo dueño y administrador; si la lectura falla, el bloque no aparece.
Límite de un correo por minuto (se avisa). El enlace abre `/establecer-acceso`, que usa la sesión del
enlace y no la que ya esté abierta en ese navegador; al terminar, «Listo» y «Abrir mi agenda» (POS).

### Citas y faltas y Ocupación (belleza)

Dos reportes más en «Cómo va la operación»; solo dueño y administrador (el supervisor no los ve) y solo
con agenda.

- **Citas y faltas** (`/reportes/citas`). Por colaborador o por servicio, canal Todas / En caja / En
  línea. Atendidas, Canceló la clienta, Canceló el negocio, No llegó, Total y Tasa de falta (con fila de
  totales). Una espera cancelada sin colaborador sale como «Sin colaborador». Más de 367 días: se usan
  los últimos 367 y un aviso lo dice. Descarga en Excel.
- **Ocupación** (`/reportes/ocupacion`). Por colaborador (suma del rango) o por día. Horas agendadas,
  Horas de horario y Ocupación % con barra; «—» si no hay horario. **El % ignora los días sin horario:
  solo cuenta lo agendado en días con horario.** Por eso «Horas agendadas» puede mostrar más horas de las
  que explica el % (p. ej. 5 h agendadas y 8 h de horario pueden dar 50 %, con más horas en un día sin
  horario). Una Nota en la pantalla lo explica. Más de 93 días: los últimos 93 con aviso.

### Primera vez de un salón (`/bienvenida`)

Con un giro de belleza la lista cambia a seis pasos: Tus servicios, Tu equipo, Colaboradores y horarios
(se marca con al menos un horario de un colaborador activo), Tu caja, Vincula tu caja y Facturación
(opcional). Restaurante y tienda no cambian.

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
