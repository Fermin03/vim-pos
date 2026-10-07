# Qué cambió y cuándo

> Qué cambió en VIM POS y cuándo: funciones nuevas, mejoras y correcciones de la caja y del panel, con fecha.

**VIM POS** · punto de venta para restaurantes en México · versión en HTML: https://vimpos.com.mx/novedades

## Octubre de 2026

7 de octubre Caja · 0.5.0

### Programa de lealtad

#### Nuevo

- **Programa de lealtad.** Tus clientes ganan algo cada vez que compran y lo usan en su siguiente visita. Lo encuentras en el panel, en **Lealtad**.
- Tú eliges cómo ganan: puntos que valen dinero, sellos por visita o puntos que se cambian por premios de tu carta.
- En la caja, al asignar un cliente a la cuenta se ve cuánto tiene y cuánto va a ganar; el botón **Canjear puntos** aplica el descuento o agrega el premio.
- El ticket le dice al cliente cuánto ganó y cuánto lleva, y el corte separa lo que se descontó por lealtad.
- En **Lealtad → Movimientos** ves cuánto has repartido, cuánto se ha canjeado y quién hizo cada canje.

#### A tener en cuenta

- Canjear necesita internet; ganar puntos, no.
- Una cuenta que lleva un premio de regalo no se factura por separado: entra en tu factura global.
- En el plan Esencial es un extra; en Negocio y en Cadena ya va incluido.

4 y 5 de octubre Panel de administración

### Menús del catálogo

#### Nuevo

- Arma menús con nombre desde **Catálogo → Nuevo menú**. Cada menú tiene sus productos, sus combos, sus categorías y sus precios, y cada sucursal vende el que le asignes.
- Apaga una categoría entera en un menú sin tocar los demás.
- Eliminar a un empleado que ya no trabaja contigo libera su correo. Su nombre se conserva en el historial de ventas.

2 de octubre Caja · 0.4.105 a 0.4.110

### Pantalla del cliente y menú por sucursal

#### Nuevo

- **Pantalla del cliente.** Si la caja tiene un segundo monitor, muestra ahí la cuenta, el total y el cambio. Se enciende en Menú → Configurar impresoras y pantallas.
- Las imágenes que subas en Configuración → Pantalla del cliente salen en ese monitor cuando no se está cobrando, cada una con su tiempo.
- Cada sucursal puede vender productos distintos, a su propio precio, y agotarlos por su cuenta.
- Puedes imprimir en una impresora USB instalada en Windows.
- Los productos de un combo ya aceptan modificadores.
- En el panel, las estadísticas y los reportes se ven por sucursal o de todas juntas.

#### Correcciones

- La caja ya no se queda en «Sin internet» ni se desconecta sola en computadoras lentas.
- Cuando un insumo se termina, el producto se agota solo en la sucursal que se quedó sin él, no en todas.

1 de octubre Caja · 0.4.100 a 0.4.104

### Respaldo diario y ayuda por WhatsApp

#### Nuevo

- La caja se respalda sola una vez al día, cuando está en reposo.
- Puedes pedir ayuda por WhatsApp desde Ajustes y desde la pantalla de bloqueo.

#### Mejoras

- Las actualizaciones llegan firmadas por VIM: la caja no instala nada que no venga de nosotros.

#### Correcciones

- La primera impresión del ticket ya no pide PIN de supervisor.

## Septiembre de 2026

29 y 30 de septiembre Caja · 0.4.92 a 0.4.99

### Corte ciego y registro de reimpresiones

#### Nuevo

- **Corte ciego.** Al cerrar el turno, el cajero cuenta el efectivo sin ver cuánto debería haber; la diferencia aparece al generar el corte. Volver a contar pide la autorización de un supervisor.
- Reimprimir una comanda pide motivo y autorización, y cada reimpresión queda registrada. Las ves en Reportes → Reimpresiones por cajero.
- La caja avisa en su pantalla de inicio cuando hay una versión nueva, con un botón para instalarla.

#### Mejoras

- Cancelar, devolver y reimprimir se confirman igual en toda la caja: dicen qué va a pasar y piden el motivo.
- Las pantallas de cuentas caben completas en monitores de 1024×768.

22 al 26 de septiembre Caja · 0.4.75 a 0.4.91

### Repartidores, zonas de envío y cocina por estación

#### Nuevo

- **Repartidores.** Asignas el pedido a domicilio a un repartidor y con eso sale. Puedes mandar varios pedidos en un mismo viaje.
- **Zonas de envío.** El domicilio se cobra según la zona del cliente. Cada sucursal define las suyas y se eligen al capturar el pedido.
- Para llevar tiene su lista de «Cuentas abiertas», junto a «Cuentas en espera».
- Botón «Asignar cliente» en Comedor, Para llevar y Pick-up.
- Tocar un producto del ticket vuelve a abrir sus modificadores o su combo para cambiarlo, mientras no se haya mandado a cocina.
- En cocina, cada estación marca como listo solo lo suyo y la orden se cierra cuando termina la última.

#### Mejoras

- La caja y la pantalla de cocina tienen diseño nuevo: botones más grandes, color por categoría y «Efectivo exacto» al cobrar.
- Los clientes y las direcciones que registras en la caja aparecen en el panel, en Clientes.
- Desvincular una caja pide el PIN de un administrador.

#### Correcciones

- Al retomar un pedido en espera aparece «Cobrar».

![Pantalla de cocina con las comandas activas, cada una con su tiempo, el término de la carne, los extras y las notas.](https://vimpos.com.mx/assets/img/capturas/kds.webp?v=3)

_La pantalla de cocina con su diseño nuevo: cada comanda con su tiempo a la vista._

10 al 13 de septiembre Caja · 0.4.67 a 0.4.70

### Combos

#### Nuevo

- **Combos.** Vende un paquete con sus opciones a un solo precio. Cada producto del combo llega a cocina, descuenta inventario y cuenta en los reportes.
- Los combos y los modificadores se publican en tu carta de Uber Eats, y esos pedidos entran a la caja con el total que cobró la app.

#### Mejoras

- El catálogo se acomoda en cuadrícula y llena la pantalla. Lo que no cabe pasa a otra página con flechas, sin arrastrar.

![La caja en plena venta: el catálogo por categorías y un ticket en curso con una hamburguesa, papas y refresco.](https://vimpos.com.mx/assets/img/capturas/pos-home.webp?v=3)

_El catálogo en cuadrícula: todos los productos del mismo tamaño, sin arrastrar la pantalla._

2 al 6 de septiembre Caja · 0.4.53 a 0.4.64

### Facturación y pedidos de Uber Eats

#### Nuevo

- **Facturación electrónica.** Factura global, timbrado individual y portal de autofacturación por QR. El detalle está en [Facturación CFDI](https://vimpos.com.mx/facturacion-cfdi).
- Los pedidos de Uber Eats entran directo a la caja y a la cocina. Desde la caja pausas la tienda, la reanudas y ajustas el tiempo de preparación.
- El inventario se descuenta al vender en la caja. Se enciende desde Inventario, en el panel.

#### Mejoras

- Un cambio de menú hecho en el panel llega a la caja en un minuto.
- Si la caja no arranca a la primera después de un apagado forzado, lo reintenta sola.

#### Correcciones

- Cancelar una cuenta de mesa libera la mesa.
- Una cuenta que se abre y no se cobra ya no se pierde de vista: al salir, la caja pregunta qué hacer con ella.

Este registro empieza en septiembre de 2026. Si quieres ver todo esto funcionando, [pide una demo](https://vimpos.com.mx/demo) o revisa las [funciones](https://vimpos.com.mx/funciones) una por una.

---

**Otras páginas en Markdown:** [Inicio](https://vimpos.com.mx/index.md) · [Funciones](https://vimpos.com.mx/funciones.md) · [Sin internet](https://vimpos.com.mx/sin-internet.md) · [Facturación CFDI](https://vimpos.com.mx/facturacion-cfdi.md) · [Precios](https://vimpos.com.mx/precios.md) · [Pide una demo](https://vimpos.com.mx/demo.md) · [Cuánto cuesta](https://vimpos.com.mx/cuanto-cuesta-un-sistema-para-restaurante.md) · [Cómo elegir sistema](https://vimpos.com.mx/como-elegir-sistema-restaurante.md) · [Factura global](https://vimpos.com.mx/factura-global-restaurantes.md) · [Hamburgueserías](https://vimpos.com.mx/punto-de-venta-hamburgueserias.md) · [León, Guanajuato](https://vimpos.com.mx/punto-de-venta-restaurantes-leon.md) · [Nosotros](https://vimpos.com.mx/nosotros.md) · [Contacto](https://vimpos.com.mx/contacto.md) · [Aviso de privacidad](https://vimpos.com.mx/aviso-privacidad.md) · [Términos del servicio](https://vimpos.com.mx/terminos.md)

**Contacto:** hola@vimpos.com.mx · https://vimpos.com.mx/contacto

_Generado desde novedades.html. La versión en HTML es la fuente; este archivo no se edita a mano._
