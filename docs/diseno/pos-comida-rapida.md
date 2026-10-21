# Diseño — Caja de comida rápida (giros QUICK_SERVICE, FOODTRUCK y CAFETERIA)

> Hereda de [`pos.md`](pos.md) y [`nucleo.md`](nucleo.md); toma la navegación de [`pos-retail.md`](pos-retail.md).
> Aquí va solo lo que cambia cuando la caja es de **servicio rápido**, de un **food truck** o de una
> **cafetería** (esta desde el 21 oct, decisión de Fermín: «la cafetería adopta el diseño del food truck»). Spec:
> `docs/superpowers/specs/2026-10-21-servicio-rapido-caja-tienda-design.md`. Decisión: ADR 0045. Describe
> lo que quedó construido el 21 oct 2026 (rama `feat/alimentos-rapido`); donde el código hizo algo distinto
> del spec, manda el código.

## Quién y dónde

El mostrador de una hamburguesería, un puesto de hot dogs, un food truck o un café, en la misma caja táctil de 15"
(1024×768 es el piso). La venta es «tomar la orden y cobrar», con gente formada. Por eso la caja abre
directo en **Cobrar**: no hay pantalla de inicio con Comedor, Para llevar, Pick-up y Domicilio.

**Lo de adentro es de restaurante:** el ticket, los modificadores (término, extras), los combos con «¿Lo
hacemos combo?», los descuentos, la propina, la lealtad y la comanda funcionan como en cualquier restaurante.
Solo la forma de moverse por la caja es la de tienda.

## La barra inferior

Abre siempre en **Cobrar**. Cada giro tiene su barra:

| Giro | Barra |
|---|---|
| Servicio rápido y food truck | **Cobrar · Pedidos · Inventario · Transacciones · Notificaciones · Más** |
| Cafetería | **Cobrar · Inventario · Transacciones · Notificaciones · Más** |

- En servicio rápido y food truck, **Inventario** solo aparece si el negocio tiene encendido el módulo de
  existencias; sin él la barra tiene cinco destinos. En la cafetería **siempre** está: sin el módulo dice
  «Tu negocio no lleva existencias» y cómo pedir que se activen.
- **Pedidos** lleva un globo con lo que espera atención (abajo). La cafetería no tiene Pedidos: sus
  tarjetas y el globo están en **Más** (ver «Cafetería»).
- **Notificaciones** es la de la tienda: lo que se agotó o va quedando poco (solo con el módulo de
  existencias) y los avisos de VIM para releerlos. Su globo cuenta lo no visto.
- **Más** es el menú de siempre (turno, retiro y depósito, corte X, pedidos en espera, salir) y suma
  **«Consultar cuentas»** en Operación, porque ya no hay pantalla de inicio desde donde abrirla.
- **Transacciones** es la de tienda, sin «Cambio de talla» (eso es de ropa y calzado).

## Cobrar

Catálogo por categorías con buscador a la izquierda, ticket a la derecha. El ticket arranca siempre en
**Para llevar**. En el menú «⋯» del ticket están **«Asignar cliente»** (o «Cambiar cliente»), que sirve
también para canjear lealtad, y **«Limpiar»** o «Cancelar cuenta». El nombre del cliente asignado se ve junto
al tipo de servicio. «Poner en espera» sigue donde estaba.

## La pregunta al cobrar

Al tocar **Cobrar** sale una ventana: **«¿Es para llevar o para comer aquí?»**, con dos botones grandes
(64 px de alto): **Para llevar** y **Comer aquí**. Después sigue el cobro de siempre: propina, forma de pago
y ticket.

- **Servicio rápido y cafetería:** se pregunta siempre.
- **Food truck:** solo si el dueño activó «Tiene dónde comer». Si no, la venta es para llevar y no sale
  la pregunta.
- **Cancelar** (botón o Escape) cierra la ventana sin guardar nada y sin abrir el cajón.
- La pregunta sale **antes** de guardar la venta. Una cuenta que se puso en espera y se retoma vuelve a
  preguntar una vez; si lo elegido no se puede guardar, la caja avisa y no cobra.
- **Pick-up, domicilio y pedidos de apps no se preguntan:** ya tienen su tipo de servicio.

### Nombre del cliente

Si el dueño activó «Pedir el nombre del cliente al cobrar», la misma ventana pide **«Nombre del cliente»**
(obligatorio, hasta 100 letras) y los botones no se activan hasta que haya texto. Vale para llevar y para
comer aquí. El nombre sale en el ticket y en la comanda.

En un food truck sin dónde comer pero con nombre, la ventana solo pide el nombre y tiene un botón
**«Continuar»** (la venta es para llevar).

### Dónde se activan

En el admin, **Configuración › Operación › Mostrador**, por negocio (no por caja):

- **Pedir el nombre del cliente al cobrar:** servicio rápido, food truck y cafetería.
- **Tiene dónde comer:** solo food truck.

Los dos nacen apagados. Los demás giros no ven esta sección. La caja instalada los recibe por la
sincronización; si no los puede leer, los toma como apagados.

## «Comer aquí», no «Comedor»

En estos tres giros, el tipo de servicio para comer en el local se llama **«Comer aquí»**: en el ticket, en la
comanda, en el ticket en pantalla, en «Consultar cuentas» y en la pantalla de cocina. No es una mesa: solo
dice que la orden se consume en el local. En los demás restaurantes sigue diciendo **«Comedor»**.

## La comanda sale al cobrar

Cuando la venta queda pagada, la orden **se manda a cocina sola** y **se imprime la comanda**, sin paso extra.
Va con el tipo de servicio («Para llevar» o «Comer aquí»), el **«Orden #»** grande (los últimos 4 dígitos del
folio, como hoy) y el **«Cliente»** si se pidió el nombre.

- **Con impresora de cocina propia:** la comanda sale ahí, repartida por áreas, como siempre.
- **Con una sola impresora:** salen los dos papeles en ella, primero el ticket del cliente y luego la
  comanda. Esta regla es solo de comida rápida: un café con una sola impresora sigue sin comanda para llevar.
- **Con pantalla de cocina:** la orden pagada también aparece ahí.
- **Una sola comanda por venta:** si el cobro se reintenta, se reimprime el ticket o se cobra una cuenta que
  ya se había mandado a cocina, no sale otra.
- **El ticket de «Comer aquí» también se imprime al cobrar**, porque no hay otro momento para darlo. Una
  cuenta que ya tenía su ticket impreso no saca otro.
- **Si no se pudo mandar a cocina,** el cobro no se deshace y la caja avisa: «La venta se cobró, pero no se
  pudo mandar a cocina. Avísales a mano.» Si falla el papel, avisa como siempre.

Funciona igual sin internet, en la caja instalada.

## Pedidos

Junta todo lo que no es venta de mostrador. Arriba: **«Nuevo para recoger»** (botón principal) y **«Nuevo a
domicilio»** (solo con el módulo de domicilio). Los dos abren Cobrar en ese modo. Si había una venta a medias
en Cobrar, la caja pregunta antes qué hacer con ella.

Debajo, una tarjeta por tipo, con el número de cuentas en grande. Cada tarjeta abre la pantalla que ya
existía:

| Tarjeta | Cuándo aparece | Abre |
|---|---|---|
| En espera | siempre | la lista de pedidos en espera |
| Para llevar abiertas | siempre | las cuentas para llevar sin cobrar |
| Pick-up | siempre | la lista de pedidos para recoger |
| Domicilio | con el módulo, o mientras quede alguna cuenta abierta | la lista de domicilio, con repartidores |
| En línea | si el negocio tiene tienda en línea o apps (Uber) | los pedidos en línea |
| Cuentas de mesa | solo si queda alguna abierta | la lista para cobrarlas, sin abrir nuevas |

- Si se venció un pedido en línea sin aceptar, arriba sale un aviso rojo («Se venció 1 pedido en línea sin
  aceptar. Toca para verlos.») que lleva a En línea.
- **El globo de Pedidos** suma los pedidos en línea por aceptar, los de la tienda por aceptar (pick-up y
  domicilio) y las cuentas en espera.
- Al salir de una lista, la caja regresa a **Pedidos** (no al inicio, que no existe) y vuelve a leer los
  números. Mientras Pedidos está a la vista, los números se refrescan solos cada 15 a 20 segundos.

**Pick-up y domicilio conservan su flujo de hoy:** se mandan a cocina con «Enviar a cocina» antes de cobrar,
no se pregunta «¿para llevar o comer aquí?» y no sacan comanda al cobrar.

## Sin mesas

Servicio rápido, food truck y cafetería no tienen comedor, mapa de mesas ni meseros, aunque esos módulos estén
encendidos: no hay pantalla de inicio que los ofrezca. Un negocio que tenía cuentas de mesa abiertas al
actualizar las ve en **Pedidos › Cuentas de mesa** hasta cobrarlas; ahí no hay «Nueva orden». Si un negocio
necesita mesas, cambia su giro a servicio completo.

## Cafetería

Igual que servicio rápido (pregunta siempre, «Comer aquí», comanda al cobrar, sin mesas), con la barra sin
**Pedidos**. Lo que en los otros dos vive en Pedidos, en la cafetería vive en **Más**, en un grupo
**«Pedidos»** arriba de todo: En espera, Para llevar abiertas, Pick-up, Domicilio, En línea y Cuentas de
mesa, con las mismas reglas de cuándo aparece cada una y su número en el globo de la tarjeta. El aviso rojo
de pedidos en línea vencidos sale arriba de Más, y el globo de Pedidos se pinta sobre **Más**. Al salir de
una lista se regresa a Más. Para un pedido nuevo para recoger, Pick-up › «Nueva orden».

Lo que tenía la pantalla de inicio de la cafetería sigue a la mano:

| Antes | Ahora |
|---|---|
| Para llevar | Cobrar |
| Pick-up, Domicilio, Pedidos en línea | Más › Pedidos |
| Cuentas abiertas (Para llevar) | Más › Pedidos › Para llevar abiertas, y Transacciones |
| Cuentas en espera | Más › Pedidos › En espera |
| Asignar cliente | Menú «⋯» del ticket |
| Retiro / Depósito, Consultar ctas., Cerrar turno, Salir | Más |
| Monitor ventas | Más › Corte caja X |

## Food truck

Igual que servicio rápido, con dos diferencias: la pregunta solo sale con «Tiene dónde comer», y conserva el
nombre del evento al abrir turno (módulo `eventos`).

## Lo que no cambia

- **Servicio completo, bares, taquerías, dark kitchens y los demás restaurantes:** su pantalla de inicio, sus mesas,
  «Comedor» y su regla de comandas siguen igual.
- **Tiendas, salones, talleres y consultorios:** igual que antes.
- **Nada se pierde en estos tres giros**, salvo las mesas: combos, modificadores, propinas, pick-up, domicilio
  con repartidores, tienda en línea, Uber, cuentas en espera, lealtad, factura, corte y turno. Solo cambian de
  lugar.
- **Los negocios que ya usan VIM POS** con estos giros cambian solos al actualizar la caja; no hay
  interruptor.
