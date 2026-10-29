# Inventario y existencias

VIM POS lleva dos tipos de inventario. Cada sección dice cuál usa:

- **Restaurantes y comida:** inventario de **insumos** (lo que usas para preparar) con **recetas**.
  Está en el panel, en **Inventario**, desde el plan Negocio.
- **Tiendas:** **existencias** de cada producto que vendes. Está en el panel, en **Inventario →
  Existencias de la tienda**, y en la caja, en la pestaña **«Inventario»**.

## Cómo dar de alta insumos

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Existencias · **Plan:** desde el plan Negocio ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** restaurantes y comida
**Lo piden así:** insumos, ingredientes, materia prima, inventario de cocina, bodega, dar de alta ingredientes

Un insumo es lo que usas para preparar, por ejemplo carne molida, pan o refresco.

1. Entra a **Inventario → Existencias**.
2. Toca **«Nuevo insumo»**.
3. Llena el **«Nombre»** (por ejemplo “Carne molida”), la **«Categoría»**, la **«Unidad»**, el
   **«Costo por unidad»** y el **«Stock mínimo»** (cuando la existencia baja de esa cantidad, el insumo sale como «Stock bajo»).
4. Toca **«Guardar»**.

**Qué pasa después:** el insumo sale en la lista con su estado: «En nivel», «Stock bajo» o
«Agotado». Para que baje solo al vender, hazle receta a tus productos
([Cómo hacer la receta de un producto](#cómo-hacer-la-receta-de-un-producto)).
**Si algo falla:**
- Si ves «El inventario viene desde el plan Negocio», tu plan no lo incluye. Toca **«Preguntar por
  el plan Negocio»**.
- Si la existencia no coincide con lo que tienes en una sucursal, es porque suma todas tus
  sucursales.
**Relacionado:** [Cómo registrar una compra](#cómo-registrar-una-compra)

## Cómo hacer la receta de un producto

**Quién:** dueño o administrador · **Dónde:** Panel → Menú → Recetas · **Plan:** desde el plan Negocio ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** restaurantes y comida
**Lo piden así:** receta, costo del platillo, cuánto me cuesta, margen, que se descuente el inventario

La receta dice qué insumos lleva un producto. Con ella, VIM POS descuenta el inventario al vender y
te dice cuánto te cuesta cada platillo.

1. Entra a **Menú → Recetas**. Marca **«Solo sin receta»** para ver los productos que todavía no tienen receta.
2. Toca el producto.
3. Toca **«Agregar insumo»** y escribe la **«Cantidad»** y la **«Unidad»** de cada uno.
4. Marca **«Crítico»** en el insumo sin el cual no se puede preparar: si se acaba, el producto se
   agota solo.
5. Deja marcada **«Receta activa (descuenta inventario al vender)»**.
6. Toca **«Guardar receta»**.
7. Revisa que en **Inventario → Existencias** esté encendido **«Descontar inventario al vender»**.

**Qué pasa después:** abajo ves el **«Costo de la receta»** y tu margen sobre el precio sin IVA.
Cada venta descuenta los insumos; si cancelas o devuelves, regresan.
**Si algo falla:**
- «No hay conversión de … a …» → captura la cantidad en la unidad que te sugiere VIM POS.
- Si el inventario no baja al vender, revisa que **«Descontar inventario al vender»** esté
  encendido y que la receta esté activa.
- Los combos no llevan receta: la llevan los productos que el cliente elige.
**Relacionado:** [Cómo recibir avisos de existencia baja](#cómo-recibir-avisos-de-existencia-baja)

## Cómo registrar una compra

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Compras → «Nueva compra» · **Plan:** desde el plan Negocio ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** restaurantes y comida
**Lo piden así:** registrar compra, entrada de mercancía, me llegó el proveedor, factura de compra, cargar XML

1. Entra a **Inventario → Compras** y toca **«Nueva compra»**.
2. Si tienes la factura, arrastra su archivo XML al espacio que dice **«Arrastra el XML de la factura o haz clic»**: se llenan
   solos el proveedor y los productos. Si no tienes la factura, captura los datos a mano.
3. Revisa el **«Proveedor»**, la **«Fecha»** y la **«Factura o nota»**.
4. En cada renglón, elige el **«Insumo»** y revisa la **«Cantidad»**. El **«Factor»** dice cuántas
   unidades de tu insumo vienen en cada unidad que te vende el proveedor: si te vende cajas de 12
   piezas, el factor es 12. VIM POS lo recuerda
   para la próxima factura.
5. Toca **«Registrar compra»**.

**Qué pasa después:** la compra queda «Confirmada», los insumos suben de existencia y su costo se
actualiza con el promedio.
**Si algo falla:**
- «Esta factura ya está registrada…» → ya la habías capturado.
- «Esta factura no está a nombre de tu negocio» → revisa que sea tu factura.
- Si te equivocaste, abre la compra, toca **«Anular compra»** y pon el motivo. Las existencias
  bajan en la cantidad que esa compra había sumado; el costo promedio no cambia.
**Relacionado:** [Cómo dar de alta un proveedor](#cómo-dar-de-alta-un-proveedor)

## Cómo dar de alta un proveedor

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Proveedores · **Plan:** desde el plan Negocio ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** proveedor, a quién le compro, agregar proveedor, RFC del proveedor

1. Entra a **Inventario → Proveedores**.
2. Toca **«Nuevo proveedor»**.
3. Escribe el **«Nombre»**. Si quieres, agrega su **«RFC»** (sirve para reconocer sus facturas al
   registrar una compra), teléfono, correo y notas.
4. Toca **«Guardar»**.

**Qué pasa después:** el proveedor sale al registrar compras y, en tiendas, al recibir mercancía.
**Si algo falla:** si ya no le compras a un proveedor, toca **«Dar de baja»**: sus compras anteriores se
conservan.
**Relacionado:** [Cómo registrar una compra](#cómo-registrar-una-compra)

## Cómo registrar una merma o un ajuste

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Existencias, o Existencias de la tienda · **Plan:** insumos, desde el plan Negocio; tiendas, todos ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** merma, se echó a perder, desperdicio, ajuste de inventario, corregir existencia

**Restaurantes (insumos):**

1. En **Inventario → Existencias**, en el renglón del insumo, toca **«Movimiento»**.
2. Elige **«Merma»**, **«Ajuste +»** o **«Ajuste −»**.
3. Escribe la **«Cantidad»** y, si quieres, el **«Motivo»** (por ejemplo “producto echado a perder”).
4. Toca **«Registrar»**.

**Tiendas (productos):**

1. En **Inventario → Existencias de la tienda**, elige la sucursal.
2. En el renglón del producto, toca **«Ajustar»**.
3. Elige **«Entrada»**, **«Merma»** o **«Ajuste»**. En «Ajuste», pon un signo menos antes de la cantidad para
   restar.
4. Escribe la **«Cantidad»** y el **«Motivo»** si quieres, y toca **«Registrar»**.

**Qué pasa después:** la existencia cambia y el movimiento queda en **«Movimientos»** con tu nombre.
**Si algo falla:** las compras no se registran con **«Movimiento»** ni con **«Ajustar»**: van en **Compras** (restaurantes) o en
**«Recibir»** (tiendas).
**Relacionado:** [Cómo hacer un conteo](#cómo-hacer-un-conteo)

## Cómo recibir avisos de existencia baja

**Quién:** dueño, administrador y cajero · **Dónde:** Panel → Inventario, y Caja → «Notificaciones» · **Plan:** insumos, desde el plan Negocio; tiendas, todos ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** se está acabando, stock bajo, avisos de inventario, mínimo, qué me falta, alerta

VIM POS no manda avisos por correo ni al celular: te los muestra en pantalla.

**Restaurantes:** en **Inventario → Existencias**, cada insumo dice «En nivel», «Stock bajo» (abajo
de su mínimo) o «Agotado». Usa el filtro **«Stock bajo»** para ver qué comprar. Si un insumo
marcado como **«Crítico»** en una receta se acaba, los productos que lo usan se agotan solos en esa
sucursal y vuelven a venderse cuando registras la compra.

**Tiendas:**

1. En **Inventario → Existencias de la tienda**, en el renglón del producto, toca **«Mínimo»** y
   escribe en **«Avisar cuando queden»** la cantidad.
2. En la caja, la pestaña **«Notificaciones»** muestra primero los agotados y luego los que tienen
   pocas piezas.

**Qué pasa después:** ves de un vistazo qué reponer.
**Si algo falla:** en tiendas, un producto no se agota solo al llegar a cero: la caja te avisa,
pero deja venderlo y la existencia queda en negativo.
**Relacionado:** [Cómo ver las existencias de la tienda](#cómo-ver-las-existencias-de-la-tienda)

## Cómo ver las existencias de la tienda

**Quién:** dueño o administrador en el panel; cajero en la caja · **Dónde:** Panel → Inventario → Existencias de la tienda, o Caja → «Inventario» → «Existencias» · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** cuánto me queda, existencias, stock, inventario de la tienda, cuántas piezas hay

**En el panel:**

1. Entra a **Inventario → Existencias de la tienda**.
2. Elige la sucursal, o **«Todas las sucursales»**.
3. Filtra por **«Bajo mínimo»**, **«Agotadas»** o **«Negativas»**, o busca por nombre, SKU o código.

Arriba ves la existencia total y el **«Valor del inventario»** con el costo de hoy. Para tener la lista en Excel,
toca **«Descargar Excel»**.

**En la caja:** toca **«Inventario»** en la barra de abajo y luego **«Existencias»**. Es solo para
consultar.

**Qué pasa después:** la existencia se actualiza sola: cada venta la descuenta y cada devolución la
regresa.
**Si algo falla:** si la pantalla dice «Todavía no hay productos que lleven existencias…», marca **«Lleva
existencias»** en tus productos o impórtalos con **Menú → Importar tienda**.
**Relacionado:** [Cómo recibir mercancía](#cómo-recibir-mercancía)

## Cómo recibir mercancía

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Existencias de la tienda → «Recibir», o Caja → «Inventario» → «Recibir» · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** recibir mercancía, llegó el pedido, entrada de producto, dar entrada, surtir

**En el panel:**

1. Entra a **Inventario → Existencias de la tienda** y abre **«Recibir»**.
2. Elige la sucursal, el **«Proveedor»** y, si quieres, la **«Remisión o factura»**.
3. Escanea cada producto o búscalo por nombre, SKU o código. Cada vez que escaneas un producto, se suma una pieza.
4. Ajusta la **«Cantidad»** y, si cambió, el **«Costo unitario»** (si lo dejas vacío, se queda el costo que ya tenía).
5. Toca **«Recibir … productos»**.

**En la caja:** toca **«Inventario»** → **«Recibir»**, escanea lo que llega y toca **«Recibir …
productos»**. En la caja no se captura costo ni proveedor.

**Qué pasa después:** sale «Listo: entraron … productos» y la existencia sube.
**Si algo falla:**
- Si la caja dice «Pide a un administrador que entre con su PIN para recibir.», toca **«Cambiar
  cajero»** para que entre el dueño o un administrador.
- «Ese producto no lleva existencias.» → márcale **«Lleva existencias»** en el panel.
**Relacionado:** [Cómo hacer un conteo](#cómo-hacer-un-conteo)

## Cómo hacer un conteo

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Existencias de la tienda → «Conteo» · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** conteo, inventario físico, contar la tienda, cuadrar existencias, toma de inventario

1. Entra a **Inventario → Existencias de la tienda** y abre **«Conteo»**.
2. Elige la sucursal.
3. Escanea cada pieza que tienes en el anaquel. Cada vez que escaneas una pieza, se suma una en
   **«Contado»**.
4. Toca **«Revisar diferencias»**: ves cuántas sobran y cuántas faltan contra lo que dice VIM POS.
5. Toca **«Confirmar conteo»**, o **«Seguir contando»** si te faltó algo.

**Qué pasa después:** sale «Listo: se ajustaron … productos». La existencia queda igual a lo que
contaste y el ajuste aparece en **«Movimientos»** como «Conteo».
**Si algo falla:**
- Solo se ajustan los productos que capturaste: lo que no contaste no se toca.
- El conteo no se guarda a medias: termínalo de una sola vez.
**Relacionado:** [Cómo registrar una merma o un ajuste](#cómo-registrar-una-merma-o-un-ajuste)

## Cómo hacer un traspaso entre sucursales

**Quién:** dueño o administrador · **Dónde:** Panel → Inventario → Existencias de la tienda → «Traspasos» · **Plan:** con más de una sucursal ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** traspaso, mandar mercancía a otra sucursal, mover inventario, pasar producto

1. Entra a **Inventario → Existencias de la tienda** y abre **«Traspasos»**.
2. En **«Sale de»**, elige la sucursal que manda la mercancía, y en **«Llega a»**, la que la
   recibe.
3. Escanea o busca los productos y escribe la cantidad de cada uno.
4. Toca **«Enviar»**.

**Cuando llegue la mercancía:** en **«Historial»**, en ese traspaso, toca **«Recibir»** y confirma.

**Qué pasa después:** la mercancía sale del origen al enviar, queda «En camino» y entra al destino
al recibirla.
**Si algo falla:**
- Si ya no vas a hacer el traspaso, toca **«Cancelar»**: la mercancía regresa a la sucursal de origen.
- Con una sola sucursal sale «Los traspasos son entre sucursales; tu negocio tiene una.»
**Relacionado:** [Cómo ver las existencias de la tienda](#cómo-ver-las-existencias-de-la-tienda)
