# Glosario

Las palabras que vas a ver en VIM POS, explicadas en corto. Cada sección se entiende sola.

## Qué significan las palabras de la caja

**Lo piden así:** qué es, qué significa, no entiendo, turno, fondo, corte, arqueo, fiado, abono, cotización

- **Turno:** el tiempo de trabajo de una caja, desde que se abre hasta que se cierra con su corte.
- **Fondo:** el efectivo que dejas en el cajón al abrir el turno para dar cambio.
- **Arqueo:** contar el dinero del cajón al cerrar el turno.
- **Corte (corte Z):** el cierre del turno, con lo vendido, lo que debía haber y lo que contaste.
  Se imprime al cerrar.
- **Corte X («Corte caja X»):** ver cómo va el turno sin cerrarlo.
- **Corte ciego:** al contar, la caja no te dice cuánto debería haber; te lo dice al generar el
  corte.
- **Sobrante y faltante:** la diferencia entre lo que contaste y lo que debía haber. Con «+» sobra,
  con «−» falta.
- **Folio:** el número de cada venta, por ejemplo “CB-2026-000058”. Sirve para buscarla, devolverla o
  facturarla.
- **Retiro y depósito:** sacar o meter efectivo del cajón fuera de una venta.
- **Cortesía:** una venta que el cliente no paga (descuento del 100 %).
- **Pedido en espera:** una venta que dejas a un lado para atender a otro cliente y retomarla
  después.
- **Cuenta abierta:** una venta que se cobra después, como una mesa, la barra, pick-up o domicilio.
- **PIN:** la clave de 4 dígitos con la que cada empleado entra a la caja.
- **Vincular:** conectar una computadora o tableta a tu negocio para que funcione como caja, con un
  código del panel.
- **Terminal de tarjetas (lector):** el aparato de Mercado Pago Point o Clip donde el cliente paga
  con tarjeta. «Terminal» y «lector» son lo mismo.
- **Venta a crédito (fiado):** una venta que el cliente paga después, hasta su límite de crédito.
- **Abono:** un pago a cuenta de lo que el cliente debe.
- **Saldo a favor:** dinero que el cliente tiene a su favor y puede usar al pagar.
- **Cotización:** un presupuesto con productos y precios que todavía no es venta. Vale los días de
  su vigencia.

**Relacionado:** [Cómo hacer el arqueo y el corte](corte-de-caja.md#cómo-hacer-el-arqueo-y-el-corte)

## Qué significan las palabras del menú y la cocina

**Lo piden así:** qué es un modificador, qué es un combo, comanda, estación, KDS, insumo, receta

- **Producto:** lo que vendes, con su nombre, precio y categoría.
- **Categoría:** el grupo de productos que sale como pestaña en la caja, por ejemplo “Bebidas”.
- **Modificador:** una opción de un producto, como el término de la carne, un extra o “sin
  cebolla”. Puede ser obligatorio u opcional.
- **Combo:** un producto que se arma por pasos; en cada paso, la caja pregunta qué elige el cliente.
- **Promoción:** un descuento con fecha de inicio y fin que el cajero aplica de un toque.
- **Comanda:** el papel que le dice a la cocina qué preparar.
- **Pantalla de cocina (KDS):** una pantalla donde la cocina ve los pedidos en lugar de papel.
- **Estación de preparación:** un lugar de la cocina, como “Cocina” o “Barra”, que recibe solo sus
  productos.
- **Agotado:** un producto que no se puede vender por ahora; se ve en gris en la caja.
- **Insumo:** lo que usas para preparar, como carne o pan.
- **Receta:** qué insumos y cuánto de cada uno lleva un producto.
- **Merma:** lo que se pierde o se echa a perder.
- **Existencia:** cuántas piezas te quedan de un producto, en tiendas.
- **Traspaso:** mandar mercancía de una sucursal a otra.
- **Menú General:** el menú que usan todas tus sucursales, salvo que una tenga su menú propio.

**Relacionado:** [Cómo crear modificadores (y hacerlos obligatorios)](menu-y-productos.md#cómo-crear-modificadores-y-hacerlos-obligatorios)

## Qué significan las palabras de facturación

**Lo piden así:** qué es CFDI, qué es el CSD, factura global, folio fiscal, UUID, timbrar

- **CFDI:** la factura electrónica que pide el SAT. VIM POS emite la versión 4.0.
- **Timbrar:** emitir la factura ante el SAT para que sea válida.
- **CSD (sello digital):** los dos archivos (.cer y .key) y su contraseña que te da el SAT para
  facturar. No es tu e.firma.
- **Constancia de Situación Fiscal:** el documento del SAT con tu RFC, nombre, régimen y código
  postal. De ahí salen los datos para facturar.
- **Régimen fiscal:** la categoría en la que pagas impuestos ante el SAT, por ejemplo “612”.
- **Uso CFDI:** para qué usa la factura quien la recibe, por ejemplo “G03 · Gastos en general”.
- **Folio fiscal (UUID):** el número único que el SAT le da a cada factura.
- **Folios de facturación:** cuántas facturas puedes emitir con tu plan cada mes.
- **Autofactura:** cuando tu cliente saca su propia factura desde el ticket, en factura.vimpos.com.mx.
- **Factura global:** la factura que junta, por periodo, las ventas en las que nadie pidió factura.
- **Público en general (XAXX010101000):** el RFC genérico que se usa en la factura global.
- **Acuse:** el comprobante del SAT de que una factura se canceló.

**Relacionado:** [Cómo funciona la factura global](facturacion.md#cómo-funciona-la-factura-global)

## Qué significan las palabras del panel y las ventas en línea

**Lo piden así:** qué es el panel, giro, sucursal, conciliación, liquidación, marca virtual, módulo

- **Panel:** la página donde el dueño configura todo y ve sus informes, en admin.vimpos.com.mx.
- **Caja:** el programa VIM POS donde se vende, en una computadora o una tableta.
- **Giro (tipo de negocio):** si eres restaurante, comida rápida, tienda o belleza. Decide cómo se ve
  tu caja.
- **Sucursal:** cada local de tu negocio, con sus cajas y su personal.
- **Rol:** lo que puede hacer cada empleado: dueño, administrador, supervisor, cajero, repartidor,
  personal o personalizado.
- **Pick-up:** un pedido que el cliente pasa a recoger.
- **Tienda en línea:** tu página de pedidos en online.vimpos.com.mx.
- **Liquidación:** cada depósito que te hace una app de delivery por un periodo.
- **Conciliación:** comparar tus ventas de la caja contra lo que la app te depositó.
- **Marca virtual:** otra marca que vende desde tu misma cocina.
- **Franquicia:** un grupo de sucursales de un franquiciatario, para verlas juntas en los informes.
- **Anticipo:** dinero que la clienta deja al apartar una cita.
- **Colaborador:** el empleado que atiende citas en belleza.
- **Hora de corte («Cierre de día contable»):** la hora en que termina tu día de ventas, por
  ejemplo las 3:00 de la mañana. No es el corte de caja.

**Relacionado:** [Cómo seguir los pasos del inicio](alta-y-primera-vez.md#cómo-seguir-los-pasos-del-inicio)
