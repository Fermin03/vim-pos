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

## Plan y pagos

El dueño ve lo que paga HOY y hasta cuándo ("$499 al mes hasta el 31 mar 2027, después $699"),
nunca solo el precio de lista (0141, ADR 0021). La prueba gratis es un `Aviso` que no se cierra
ni bloquea: `info` mientras corre, `warning` al vencer — la caja sigue vendiendo, así que no es
rojo. Sale también arriba del dashboard, con enlace a Plan y pagos.

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

## Lo que NO se hereda del POS

- Los objetivos de 44–56px. Con mouse, 36–40px es lo correcto; 44 se ve infantil.
- La regla de una sola acción dominante: un formulario largo puede tener guardar y cancelar sin
  competir, porque no hay prisa ni dedos.
