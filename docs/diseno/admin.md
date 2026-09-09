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
`90101503` (editable, no obligatoria)— y de ahí se pasa a la misma pantalla a agregarle **slots**:
uno por paso que va a ver la caja. Un slot puede tomar sus opciones de **una categoría entera** en
vez de listarlas una por una — es la forma normal de decir "cualquier hamburguesa" sin mantener la
lista a mano cada vez que se da de alta una.

Una opción agotada no se oculta del slot: se marca. El combo se sigue vendiendo aunque falte un
insumo puntual, y ocultar la opción escondería el motivo por el que el cliente ya no la ve en caja.

La **vista previa de precio** recalcula en vivo, con cada slot que se agrega o edita, lo que de
verdad va a pagar el cliente ("Con Clásica $140 · Con Doble $175") — porque el precio final del
combo no está escrito en ningún campo del formulario, sale de sumar slots, y el dueño necesita
verlo tal como lo calcula la caja antes de publicar, no confiar en que la suma le salió bien en la
cabeza.

La lista de Combos también trae el switch **"Ofrecer el combo en la caja"**
(`configuracion_tenant.combo_upsell_activo`, migración 0110): apaga la pregunta "¿Lo hacemos
combo?" que la caja le hace al cliente cuando el cajero agrega suelto un producto que es principal
de un combo. Vive aquí, no en Configuración, porque solo afecta a los combos — mismo criterio que
el switch de descuento de inventario, que vive en Inventario y no en Configuración.

## Lo que NO se hereda del POS

- Los objetivos de 44–56px. Con mouse, 36–40px es lo correcto; 44 se ve infantil.
- La regla de una sola acción dominante: un formulario largo puede tener guardar y cancelar sin
  competir, porque no hay prisa ni dedos.
