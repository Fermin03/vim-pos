# Menú y productos

Cómo dar de alta lo que vendes: categorías, productos, modificadores, combos, promociones y, en
tiendas, tallas, colores y etiquetas. Casi todo se hace en el panel, en el grupo **«Menú»**. Cada sección
se entiende sola.

## Cómo crear categorías

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Categorías · **Plan:** todos · **Giros:** todos
**Lo piden así:** categorías, secciones del menú, grupos, ordenar el menú, bebidas, postres

1. Entra a **Menú → Categorías**.
2. Toca **«Nueva categoría»**.
3. Escribe el **«Nombre de la categoría»** (hasta 40 letras, por ejemplo “Bebidas”). Si quieres,
   agrega una descripción, un color y un icono.
4. Si tienes estaciones de preparación, elige en **«Estación de preparación»** dónde se preparan sus productos.
5. Deja marcada **«Categoría activa (visible en el POS)»** y toca **«Crear categoría»**.

Para cambiar el orden en que salen en la caja, usa las flechas **«Subir»** y **«Bajar»**.

**Qué pasa después:** la categoría sale como pestaña en la caja y ya puedes meterle productos.
**Si algo falla:** si las flechas no responden y dice «Quita el filtro para ordenar», quita el
filtro de búsqueda primero.
**Relacionado:** [Cómo dar de alta un producto](#cómo-dar-de-alta-un-producto)

## Cómo dar de alta un producto

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos · **Plan:** todos · **Giros:** todos
**Lo piden así:** agregar producto, nuevo platillo, dar de alta un artículo, subir un producto, poner precio

1. Entra a **Menú → Productos** y toca **«Nuevo producto»**.
2. Escribe el **«Nombre»** y el **«Precio»**. Debajo dice si el precio ya trae el IVA incluido.
3. Elige la **«Categoría»**.
4. En **«En la caja»**, deja **«Se vende»**.
5. Si quieres, abre **«Más datos»** para la descripción, un **«Código interno»** o la **«Estación de
   preparación»** (dónde sale su comanda).
6. Si facturas, abre **«Datos fiscales»**: **«Tasa de IVA»** («16% · comida y bebida preparadas»,
   «0% · productos sin preparar» u «8% · región fronteriza») y la **«Clave de producto SAT»**. Sin
   clave, se factura como servicio de restaurante.
7. Toca **«Crear producto»**.

En tiendas también aparece **«Se vende por»** (pieza, kilo, metro o litro) y la sección **«Tienda»**
con código de barras, costo y **«Lleva existencias»**.

**Qué pasa después:** el producto llega a las cajas en uno o dos minutos. Al editarlo puedes
asignarle modificadores y, desde el plan Negocio, su receta.
**Si algo falla:** «Elige una categoría» → crea la categoría primero
([Cómo crear categorías](#cómo-crear-categorías)).
**Relacionado:** [Cómo mandar los cambios del menú a la caja](#cómo-mandar-los-cambios-del-menú-a-la-caja)

## Cómo importar mi menú desde Excel

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Importar menú · **Plan:** todos · **Giros:** restaurantes, comida rápida y cafeterías
**Lo piden así:** subir mi menú, importar Excel, cargar productos de golpe, traer mi menú de otro sistema

Sirve para subir muchos productos a la vez, desde un Excel o desde el archivo de tu sistema anterior.

1. Entra a **Menú → Importar menú**.
2. Toca **«Subir archivo»** (Excel .xlsx o CSV), o pega tu menú en **«O pégalo aquí»**. Para ver
   cómo debe quedar tu archivo, toca **«Usar ejemplo»**.
3. En **«POS de origen»**, deja **«Detectar automáticamente»** o elige tu sistema anterior.
4. Toca **«Revisar»** y revisa la vista previa.
5. Toca el botón **«Importar»**, que dice cuántos productos se van a crear.

Tu archivo lleva estas columnas, en este orden: categoría, producto, precio y, si quieres,
descripción. Las categorías que no existan se crean solas.

**Qué pasa después:** sale «Importación completada». Los productos entran con IVA de 16 % incluido y sin
clave SAT: revísalos si facturas.
**Si algo falla:**
- Las líneas con error se saltan y salen en «Líneas que se omitirán:». Corrígelas y vuelve a subir
  solo esas.
- «Ese es el formato viejo de Excel (.xls)…» → ábrelo y guárdalo como .xlsx o .csv.
- Solo se lee la primera hoja del Excel.
**Relacionado:** [Cómo importar los productos de mi tienda](#cómo-importar-los-productos-de-mi-tienda)

## Cómo importar los productos de mi tienda

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Importar tienda · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** importar inventario, subir mis productos, cargar tallas, plantilla de productos, importar SKU

1. Entra a **Menú → Importar tienda**.
2. Toca **«Descargar plantilla»** y llénala en Excel.
3. Sube el archivo con **«Subir archivo»**, o pega su contenido en **«O pégalo aquí»**.
4. Deja marcada **«Generar código de barras a las que no traen»** si tus productos no tienen
   código.
5. Toca **«Revisar»** y luego el botón **«Importar»**.

La plantilla lleva: categoría, producto, ejes, valores, SKU, código de barras, precio, unidad,
costo y existencia. Para ropa, los ejes (lo que cambia de una pieza a otra) van como “Talla|Color” y los valores como
“M|Negra”, con una barra vertical entre uno y otro.

**Qué pasa después:** sale un resumen con cuántos productos, variantes y categorías se crearon. Si
un SKU ya existía, se actualizan su nombre, precio, costo y código, pero no su existencia: la
columna de existencia solo se usa al crear un producto nuevo.
**Si algo falla:** si hay un solo error, no se importa nada. Corrige las líneas que salen en «Corrige estas
líneas para poder importar:». El más común: «Excel cambió el código a notación científica…» → dale
formato de texto a la columna del código, o sube el .xlsx.
**Relacionado:** [Cómo dar de alta tallas y colores](#cómo-dar-de-alta-tallas-y-colores)

## Cómo ponerle foto a un producto

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos → el producto · **Plan:** con la tienda en línea ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** foto del producto, imagen, subir foto, foto del platillo

La foto la ve tu cliente en la tienda en línea.

1. Entra a **Menú → Productos** y abre el producto.
2. En **«Foto»**, toca **«Subir foto»** y elige una imagen JPG, PNG o WebP.

La foto se guarda al momento, sin tocar «Guardar cambios». Para cambiarla, usa **«Cambiar»**; para
borrarla, **«Quitar»**.

**Qué pasa después:** sale «Foto guardada.» y aparece en tu tienda en línea. La imagen se reduce
sola a un tamaño ligero.
**Si algo falla:**
- «Guarda el producto para poder subirle foto.» → crea el producto primero.
- Si no ves el campo «Foto», tu plan no incluye la tienda en línea.
- «Ese archivo no se puede usar…» → usa JPG, PNG o WebP.
**Relacionado:** [Cómo encender la tienda en línea](tienda-en-linea.md#cómo-encender-la-tienda-en-línea)

## Cómo crear modificadores (y hacerlos obligatorios)

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Modificadores · **Plan:** todos · **Giros:** todos (sobre todo comida)
**Lo piden así:** modificadores, extras, término de la carne, sin cebolla, opciones, obligatorio

1. Entra a **Menú → Modificadores** y toca **«Nuevo grupo»**.
2. Escribe el **«Nombre del grupo»**, por ejemplo “Término de la carne”.
3. En **«Cómo se elige»**, elige:
   - **«Elige una (obligatorio)»**: el cajero no puede seguir sin elegir.
   - **«Elige una o ninguna»**, **«Elige varias o ninguna»** o **«Elige varias, con mínimo y
     máximo»**.
4. En **«Qué es»**, elige qué es el grupo: un extra, algo que quita un ingrediente, una preparación o
   una variante.
5. Toca **«Crear grupo»**.
6. En **«Opciones del grupo»**, toca **«Agregar opción»** por cada una y llena su **«Nombre»** y su **«Precio
   extra (MXN)»** (0 si no cuesta). Marca **«Ya elegida»** si la caja debe marcarla sola.
7. En **«Asignar a productos»**, marca los productos y toca **«Asignar a … seleccionados»**.

También puedes asignar el grupo desde la ficha del producto, en **«Modificadores»**, y tocar **«Guardar
cambios»**.

**Qué pasa después:** al tocar ese producto en la caja se abre la ventana de opciones. Los grupos
obligatorios salen marcados «Obligatorio».
**Si algo falla:** «Define un rango válido (máximo ≥ mínimo)» → el máximo no puede ser menor que el
mínimo.
**Relacionado:** [Cómo agregar modificadores a un producto](vender-en-la-caja.md#cómo-agregar-modificadores-a-un-producto)

## Cómo crear un combo

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Combos · **Plan:** todos · **Giros:** comida
**Lo piden así:** combo, paquete, promoción de hamburguesa con papas, armar un combo

Un combo es un producto por pasos: la caja va preguntando qué elige el cliente en cada uno.

1. Entra a **Menú → Combos** y toca **«Nuevo combo»**.
2. Escribe el **«Nombre del combo»**, la **«Categoría»** y el **«Precio base (MXN)»**: lo que
   cuesta hacerlo combo. A ese precio se le suma el del producto principal.
3. Toca **«Crear combo»**. El combo se crea pausado: todavía no sale en la caja.
4. En **«Pasos del combo»**, toca **«Agregar paso»** por cada elección (por ejemplo “Bebida”):
   ponle nombre, marca **«Obligatorio»** si el cliente tiene que elegir algo en ese paso, elige **«Cómo se cobra»** y **«De dónde salen las
   opciones»** (toda una categoría o productos uno por uno).
5. Revisa **«Cuánto va a pagar el cliente»** en el recuadro de al lado.
6. En **«En la caja»**, elige **«Se vende»** y toca **«Guardar cambios»**.

En la lista de combos, el interruptor **«Ofrecer el combo en la caja»** lo enciende o lo apaga.

**Qué pasa después:** la caja ofrece el combo en unos minutos, o al momento si el cajero toca
**«Actualizar menú»**.
**Si algo falla:** cada paso deja elegir una sola opción.
**Relacionado:** [Cómo poner modificadores dentro de un combo](#cómo-poner-modificadores-dentro-de-un-combo)

## Cómo poner modificadores dentro de un combo

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos y Modificadores · **Plan:** todos · **Giros:** comida
**Lo piden así:** modificadores en el combo, término en el combo, extras dentro del combo

El combo no tiene modificadores propios: usa los de cada producto que el cliente elige.

1. Asigna los modificadores a cada producto, por ejemplo “Término de la carne” a la hamburguesa
   ([Cómo crear modificadores (y hacerlos obligatorios)](#cómo-crear-modificadores-y-hacerlos-obligatorios)).
2. Incluye ese producto como opción de un paso del combo.

**Qué pasa después:** cuando el cajero elige ese producto dentro del combo, la caja le pregunta sus
modificadores. [VERIFICAR: si pregunta también los opcionales o solo los obligatorios]
**Relacionado:** [Cómo crear un combo](#cómo-crear-un-combo)

## Cómo crear una promoción

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Promociones · **Plan:** todos · **Giros:** todos
**Lo piden así:** promoción, oferta, happy hour, descuento del día, precio especial

1. Entra a **Menú → Promociones** y toca **«Nueva promoción»**.
2. Escribe el **«Nombre»**, por ejemplo “Happy hour”.
3. Elige el **«Tipo»**: «% de descuento», «Monto fijo», «Precio especial» o «Cortesía total», y
   escribe el **«Valor»**.
4. Pon el **«Inicio»** y, si quieres, el **«Fin»** (fecha y hora).
5. Toca **«Guardar»**.

**Qué pasa después:** mientras esté vigente, aparece en la caja al cobrar y el cajero la aplica de
un toque, sin pedir autorización. Sale en el ticket como «Promoción».
**Si algo falla:**
- La promoción aplica a toda la cuenta, no a un producto.
- No se programa por días de la semana ni por horario: solo tiene inicio y fin. Para un happy hour
  diario, cambia el inicio y el fin cada día, o pausa la promoción y vuelve a activarla a mano.
- Si no sale en la caja, revisa que diga «Activa» y no «Programada», «Pausada» o «Expirada».
**Relacionado:** [Cómo aplicar un descuento](vender-en-la-caja.md#cómo-aplicar-un-descuento)

## Cómo imprimir etiquetas con código de barras

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Etiquetas · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** etiquetas, código de barras, imprimir precios, etiquetas para anaquel, etiquetadora

1. Entra a **Menú → Etiquetas**.
2. Elige el **«Formato de etiqueta»**: **«Hoja carta (3×10)»** o **«Rollo»** (con su ancho y alto
   en milímetros).
3. Busca los productos y márcalos, o toca **«Seleccionar todos»**. Ajusta cuántas etiquetas quieres de cada
   uno. El panel te propone una cantidad según tu existencia.
4. Toca **«Imprimir»**, arriba a la derecha.

Para guardarlas en PDF, en la ventana de impresión elige «Guardar como PDF».

**Qué pasa después:** cada etiqueta lleva el nombre, el precio y el código de barras.
**Si algo falla:**
- Si un producto no sale en la lista, revisa que tenga marcada **«Lleva existencias»**: solo salen
  esos.
- Si un producto dice «Sin barras: sale el código en texto», su código no es EAN-13. Usa
  **«Generar»** en el código de barras del producto.
**Relacionado:** [Cómo usar un lector de código de barras](equipo-fisico.md#cómo-usar-un-lector-de-código-de-barras)

## Cómo dar de alta tallas y colores

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos → el producto → «Tallas y colores» · **Plan:** todos · **Giros:** tienda de ropa o calzado
**Lo piden así:** tallas, colores, variantes, número de calzado, misma prenda en varios colores

1. Crea el producto, sin marcar **«Lleva existencias»** (la existencia va en cada talla y color).
2. Ábrelo para editarlo. Aparece **«Tallas y colores»**.
3. Escribe los ejes (lo que cambia de una prenda a otra) y sus valores separados por coma, por ejemplo “Talla” con “CH, M, G” y “Color”
   con “Negra, Blanca”.
4. En la tabla, revisa cada combinación: **«SKU»**, **«Código de barras»** (si lo dejas vacío, se
   genera al guardar), **«Precio»**, **«Costo»** y **«Existencia inicial»**. Quita las que no
   vendes con **«Quitar»**.
5. Toca **«Guardar cambios»**.

**Qué pasa después:** cada combinación se vende y se cuenta por separado. En la caja, al tocar la
prenda se elige la talla y el color.
**Si algo falla:** los nombres de los ejes ya no se cambian después; sí puedes agregar o quitar
valores. Para muchas prendas a la vez, usa **«Importar tienda»**.
**Relacionado:** [Cómo importar los productos de mi tienda](#cómo-importar-los-productos-de-mi-tienda)

## Cómo vender por peso, metro o litro

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos → «Se vende por» · **Plan:** todos · **Giros:** tiendas (abarrotes, frutería, ferretería, vinos)
**Lo piden así:** vender por kilo, a granel, por metro, por litro, báscula, peso

1. En la ficha del producto, en **«Se vende por»**, elige **«Kilo»**, **«Metro»** o **«Litro»**.
2. Escribe el precio por unidad. El campo cambia de nombre según lo que elegiste, por ejemplo
   **«Precio por kilo»**.
3. Toca **«Guardar cambios»**.

**Qué pasa después:** al vender ese producto, la caja abre una ventana para escribir la cantidad
(por ejemplo **«Peso · kg»**) y calcula el importe.
**Si algo falla:** si no ves **«Se vende por»**, tu negocio no tiene encendidas las existencias de
tienda. Revísalo en **Ajustes → Mi negocio → Cómo vende tu negocio** y pide que te las enciendan
por el WhatsApp de soporte de VIM.
**Relacionado:** [Cómo dar de alta un producto](#cómo-dar-de-alta-un-producto)

## Cómo pausar un producto o marcarlo agotado

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos → el producto → «En la caja» · **Plan:** todos · **Giros:** todos
**Lo piden así:** agotado, se acabó, pausar producto, quitar del menú, ocultar producto, ya no hay

1. Abre el producto en **Menú → Productos**.
2. En **«En la caja»**, elige:
   - **«Agotado · se ve en gris y no se puede vender»**: se sigue viendo, pero no se vende.
   - **«Pausado · no aparece»**: desaparece de la caja.
   - **«Se vende»**: para volver a venderlo.
3. Toca **«Guardar cambios»**.

Si tienes varias sucursales, aparece **«Agotado hoy»** con una casilla por sucursal. Cada casilla
agota el producto solo en esa sucursal, sin cambiar el menú.

**Qué pasa después:** el cambio llega a las cajas en uno o dos minutos.
**Si algo falla:** el agotado no se quita solo al día siguiente, tampoco el de «Agotado hoy». Cuando vuelva a haber, márcalo
otra vez como «Se vende» (o quita la casilla de «Agotado hoy»).
**Relacionado:** [Cómo mandar los cambios del menú a la caja](#cómo-mandar-los-cambios-del-menú-a-la-caja)

## Cómo quitar un producto en una sola sucursal

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Productos → franja «Menú» · **Plan:** todos; se usa cuando tienes más de una sucursal ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** menú por sucursal, precio distinto por sucursal, no vender en una sucursal, menú diferente

Para que una sucursal tenga un menú distinto, se crea un menú para ella.

1. En **Menú → Productos**, en la franja **«Menú»** de arriba, toca **«Nuevo menú»**.
2. Escribe el **«Nombre»** (por ejemplo “Menú Norte”) y elige las **«Sucursales que lo usan»**.
3. Toca **«Crear menú»**. El menú nuevo arranca igual que el menú General.
4. Con ese menú elegido, en la lista de productos, desmarca **«En este menú»** en los que no se
   venden en esa sucursal. En la misma fila puedes cambiar el precio para ese menú.

En **Categorías** también puedes apagar una categoría entera para ese menú.

**Qué pasa después:** las cajas de esas sucursales muestran su menú en uno o dos minutos.
**Si algo falla:** si sale «Una caja todavía no respeta los menús», esa caja necesita actualizarse:
mientras tanto, esa caja vende todos los productos al precio general.
**Relacionado:** [Cómo usar el mismo menú en todas](varias-sucursales.md#cómo-usar-el-mismo-menú-en-todas)

## Cómo mandar los cambios del menú a la caja

**Quién:** dueño o cajero · **Dónde:** Caja → «Menú» o «Más» → «Actualizar menú» · **Plan:** todos · **Giros:** todos
**Lo piden así:** actualizar el menú, no sale el producto nuevo, sincronizar menú, refrescar precios

Los cambios del panel llegan solos a las cajas en uno o dos minutos. Si los necesitas ya:

1. En la caja, abre **«Menú»** (en comida rápida, tiendas y belleza, **«Más»**).
2. Toca **«Actualizar menú»**.

**Qué pasa después:** sale «Menú actualizado.» y los cambios aparecen en esa caja, en las demás
cajas y en la pantalla de cocina.
**Si algo falla:** «No se pudo actualizar el menú.» → revisa el internet de la caja. Si no ves
«Actualizar menú», es porque solo está en la caja instalada en Windows.
**Relacionado:** [Qué hacer si un cambio del menú no aparece en la caja](problemas-comunes.md#qué-hacer-si-un-cambio-del-menú-no-aparece-en-la-caja)
