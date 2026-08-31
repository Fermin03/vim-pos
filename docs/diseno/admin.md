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

## Lo que NO se hereda del POS

- Los objetivos de 44–56px. Con mouse, 36–40px es lo correcto; 44 se ve infantil.
- La regla de una sola acción dominante: un formulario largo puede tener guardar y cancelar sin
  competir, porque no hay prisa ni dedos.
