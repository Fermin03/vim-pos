# Qué cambió y cuándo

> Qué cambió en VIM POS y cuándo: funciones nuevas, mejoras y correcciones de la caja y del panel, con fecha.

**VIM POS** · punto de venta para restaurantes, tiendas y belleza en México · versión en HTML: https://vimpos.com.mx/novedades

## Octubre de 2026

27 de octubre Caja · 0.17.0

### Vincula una caja con un código

#### Nuevo

- Para vincular una caja escribes un código de 6 caracteres. Lo generas en el panel, en **Configuración → Cajas → Vincular**.

#### Correcciones

- La caja ya no te pide vincularla otra vez cada semana.

23 de octubre Caja · 0.16.0

### Edita la dirección de un pedido a domicilio

#### Nuevo

- En **Domicilio** puedes cambiar la dirección o el cliente de un pedido con el botón **Editar**. El envío se ajusta solo.

#### Mejoras

- Los mensajes de la caja son más cortos y claros.
- La parte de arriba de la pantalla ya no se mueve al cambiar de sección.

#### Correcciones

- Escape vuelve a cerrar el cobro cuando lo abres desde la lista de cuentas.

22 de octubre Caja · 0.15.0 y 0.15.1

### Cobro a pantalla completa y ticket por correo

#### Nuevo

- **El cobro ocupa toda la pantalla, paso por paso.** La propina se pregunta después de elegir cómo paga el cliente.
- **Ticket por correo.** Si la caja no tiene impresora, al terminar puedes mandar el ticket al correo del cliente.
- Siempre que algo carga en la caja y en el panel aparece un círculo que gira, y la pantalla **Cobra en la terminal** pulsa mientras espera la tarjeta.

#### Mejoras

- En efectivo, la caja sugiere montos según el total.
- El pago dividido cabe en una sola pantalla.

#### Correcciones

- Si presionabas Escape justo al tocar **Cobrar**, el cobro se abría de todos modos. Ya no pasa.

21 de octubre Caja · 0.14.0

### Caja para tiendas, salones de belleza y comida rápida

#### Nuevo

- **Tiendas** de ropa, calzado, abarrotes, frutería, ferretería o vinos: la caja cobra con escáner, lleva tus existencias por sucursal y te deja vender a granel, fiar a tus clientes, hacer cotizaciones y, en ropa y calzado, cambiar una prenda por otra talla.
- **Salones, spas, peluquerías, barberías y estudios de tatuajes:** agendas citas, cobras a nombre de cada colaborador con su comisión, recibes anticipos y aceptas reservas en línea. Cada colaborador ve su agenda en el celular, en **Mi agenda**.
- **Comida rápida, food trucks y cafeterías:** la caja tiene la barra abajo, pregunta «¿para llevar o comer aquí?» al cobrar, manda la comanda a cocina en cuanto cobras y te muestra tus órdenes en **Pedidos** y tus avisos en **Notificaciones**.

#### Mejoras

- El botón **Cobrar** ahora lleva el ícono de un carrito.

21 de octubre Caja · 0.13.0

### Cobro con terminal Clip

#### Nuevo

- Puedes cobrar con tarjeta en tu terminal Clip desde la caja. Al elegir **Tarjeta**, el monto aparece solo en la terminal y, si lo activas, el cliente elige ahí la propina. La terminal se conecta en el panel, en **Configuración → Terminal de tarjetas**.

#### Mejoras

- Si la terminal rechaza una tarjeta, la caja te dice por qué.
- El ticket muestra la marca de las tarjetas de débito.

16 de octubre Caja · 0.12.1

### La comanda espera a la impresora de cocina

#### Mejoras

- Si la impresora de cocina no responde, la comanda ya no se pierde: se queda esperando y sale sola en cuanto la impresora vuelve, en el orden en que se pidieron.

15 de octubre Caja · 0.12.0

### Colonias y zonas de envío automáticas

#### Nuevo

- Al tomar un pedido a domicilio, el campo **Colonia** te sugiere las colonias de tu sucursal y pone sola la zona de envío y el código postal. Las colonias se administran en el panel, en **Configuración → Envíos → Colonias**.

#### Mejoras

- Si escribes una colonia que no está, se guarda con la zona que elijas y la próxima vez sale sola.
- Cambiar la zona de una colonia que ya tenía una pide el PIN de un supervisor.

14 de octubre Caja · 0.11.0

### Cuentas en barra y propinas del panel

#### Nuevo

- **Barra.** Si tu negocio lo pide a VIM, en el inicio de la caja aparece **Barra**, donde abres con **Nueva cuenta** una cuenta a nombre de una persona, sin mesa. Funciona igual que una mesa y el ticket dice «Servicio: Barra» con el nombre. Si la persona se sienta, la pasas con **Pasar a mesa**, y en Comedor una mesa pasa a barra con **Pasar a barra**.

#### Mejoras

- Los accesos del inicio y las opciones del menú aparecen según cómo trabaja tu negocio. Si ya usas VIM, ves lo mismo que antes. Para encender o apagar algo, escríbele a VIM.

#### Correcciones

- La caja ya no sugiere siempre propina de 10, 15 y 20 %: sigue lo que el dueño configuró en el panel, en **Configuración → Propinas**. Un cambio ahí llega a la caja en un minuto aproximadamente.

13 de octubre Caja · 0.10.2

### El ticket dice con qué tarjeta se cobró

#### Mejoras

- Cuando cobras con tu terminal de cobro, el ticket imprime la terminación de la tarjeta y el número de autorización.
- El comprobante de devolución dice a qué tarjeta regresó el dinero.

13 de octubre Caja · 0.10.0

### Devoluciones a la tarjeta, pago dividido con terminal y pedidos ya pagados

#### Nuevo

- **La devolución regresa el dinero a la tarjeta.** Si la cuenta se cobró en tu terminal de cobro desde la caja, al devolverla con **Mismo método** el dinero vuelve solo a la tarjeta del cliente. La encuentras en **Menú → Devoluciones**.
- **Pago dividido con la terminal.** En **Pago dividido → Agregar pago** puedes elegir **Tarjeta**: esa parte se cobra en la terminal y el resto como tú decidas.
- **Pedidos de la tienda en línea ya pagados.** Si el cliente pagó con tarjeta en tu tienda en línea, el pedido llega a la caja ya cobrado: al entregarlo tocas **Listo**.

11 de octubre Caja · 0.9.0

### Cobro con tarjeta desde la caja

#### Nuevo

- **La caja le manda el cobro a tu terminal de cobro.** Al cobrar eliges **Tarjeta**, el monto aparece solo en la terminal y, cuando el cliente paga, el pago queda registrado en la cuenta como débito o crédito. Ya no se teclea el monto dos veces.
- La terminal se conecta una sola vez desde el panel de administración, en **Configuración → Terminal de tarjetas**, con la cuenta de tu terminal. El dinero cae directo en tu cuenta.
- Si se va el internet o la terminal falla, puedes seguir cobrando como antes: **La cobré en otra terminal**, en la misma pantalla de cobro.

8 de octubre Caja · 0.7.0

### El corte Z con arqueo de efectivo

#### Nuevo

- **El corte Z incluye el arqueo de efectivo:** lo esperado, lo que contaste y la diferencia. Lo ves al cerrar turno, en **Menú → Cerrar turno**.
- Si repartes propinas, el corte dice cuánto le tocó a cada persona.

#### Correcciones

- A veces la caja no abría al primer intento y había que abrirla otra vez; ya abre sola.

7 de octubre Caja · 0.6.0

### Cuentas impresas, tecla Escape y apertura de turno

#### Nuevo

- **La cuenta impresa queda cerrada a cambios.** En Comedor, Pick-up y Domicilio, después de imprimir el ticket ya no se le agregan ni se le quitan productos. Para modificarla usa **Reabrir cuenta**, que pide el PIN de un supervisor.
- La tecla **Escape** cierra o regresa en todas las pantallas de la caja. En el cobro te devuelve al paso anterior en vez de cerrarlo todo.

#### Mejoras

- Abrir turno es una ventana donde solo escribes el efectivo inicial.
- El menú abre aunque no haya turno: puedes cambiar de cajero, tu PIN o las impresoras antes de empezar.
- **Mis propinas** muestra las del turno en curso, también en ventas para llevar.
- Retiro / Depósito ya no muestra cuánto efectivo hay en la caja.
- «App externa» ya no aparece entre las formas de pago al cobrar.

#### Correcciones

- Después de tocar **Cobrar** o aplicar un descuento puedes seguir agregando productos a la venta.
- **Cambiar mi PIN** y **Mis propinas** abren desde el menú a la primera.

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

- **Facturación electrónica.** Factura global, timbrado individual y portal de autofacturación por QR. El detalle está en [Facturación CFDI](https://vimpos.com.mx/funciones#facturacion).
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

**Otras páginas en Markdown:** [Inicio](https://vimpos.com.mx/index.md) · [Funciones](https://vimpos.com.mx/funciones.md) · [Sin internet](https://vimpos.com.mx/sin-internet.md) · [Precios](https://vimpos.com.mx/precios.md) · [Pide una demo](https://vimpos.com.mx/demo.md) · [Cómo elegir sistema](https://vimpos.com.mx/como-elegir-sistema-restaurante.md) · [Nosotros](https://vimpos.com.mx/nosotros.md) · [Contacto](https://vimpos.com.mx/contacto.md) · [Aviso de privacidad](https://vimpos.com.mx/aviso-privacidad.md) · [Términos del servicio](https://vimpos.com.mx/terminos.md) · [Por tipo de negocio](https://vimpos.com.mx/llms.txt)

**Contacto:** hola@vimpos.com.mx · https://vimpos.com.mx/contacto

_Generado desde novedades.html. La versión en HTML es la fuente; este archivo no se edita a mano._
