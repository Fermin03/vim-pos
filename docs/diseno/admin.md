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

Usan la **paleta funcional** del núcleo (`cat-*`), nunca el azul de marca: el azul significa "esta
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

## Menú por sucursal (0152, ADR 0027)

Solo aparece con **dos o más sucursales**; con una, Catálogo se ve como siempre.

- **Formulario de producto:** en Disponibilidad, una fila por sucursal con «Se vende», precio y
  «Agotado». El precio vacío enseña el general en gris: vacío no es $0, es «el de siempre». Apagar
  una sucursal deshabilita su precio y su agotado. «Agotado por inventario» es una etiqueta, no un
  control: lo pone y lo quita la base. El selector «En la caja» se queda con Se vende / Pausado
  (pausar es para todas).
- **Lista de productos:** un selector de sucursal. En «Todas», la tabla de siempre. Con una
  sucursal elegida, cada renglón deja apagar «Se vende aquí» y escribir su precio en línea, sin
  abrir el producto: armar el menú de una sucursal nueva con 80 productos no puede costar 80 visitas.
  Una escritura a la vez; al terminar se relee, y la fila que se guarda se atenúa.
- **Aviso de cajas viejas:** si el negocio ya usa precios o productos apagados por sucursal y una
  caja de escritorio no se ha actualizado, se nombra la caja y su sucursal: el dueño tiene que saber
  a cuál ir.

## Lo que NO se hereda del POS

- Los objetivos de 44–56px. Con mouse, 36–40px es lo correcto; 44 se ve infantil.
- La regla de una sola acción dominante: un formulario largo puede tener guardar y cancelar sin
  competir, porque no hay prisa ni dedos.
