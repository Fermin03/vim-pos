# Tienda en línea en la caja — guía de soporte

Para quien atiende el WhatsApp de soporte cuando un cliente dice «mi tienda en línea no me manda
pedidos» o «un pedido se canceló solo». Está escrita en llano: lo que el cajero ve y lo que se
puede hacer sin tocar la base. El detalle técnico está en
[`../../desktop/RUNBOOK.md`](../../desktop/RUNBOOK.md) (sección «La tienda en línea propia»).

> **Importante: las cajas instaladas necesitan la versión 0.8.0 para recibir pedidos de la tienda,
> y la 0.8.0 todavía no está publicada.** Hoy (9 oct 2026) la última es la 0.7.0. Mientras una
> sucursal tenga una caja con una versión anterior y nadie abra el POS en el navegador con turno, su
> tienda saldrá **«sin turno abierto»** aunque la caja tenga el turno abierto: la caja vieja no sabe
> avisarle a la tienda que está lista. No es un error del cliente ni se arregla reiniciando nada;
> se arregla con la 0.8.0. Ver
> [`instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md).

## Cómo funciona, en tres frases

1. El cliente pide en la tienda del negocio (para recoger o a domicilio). La tienda solo acepta
   pedidos si hay una caja **con turno abierto y con internet** en esa sucursal.
2. El pedido aparece en **Pedidos en línea** en la caja, con un timbre que se repite cada 20
   segundos hasta que alguien lo acepta o lo rechaza. Si el negocio eligió aceptación automática, la
   caja lo acepta sola.
3. Al aceptarlo se crea una cuenta en **Pick-up** (para recoger) o **Domicilio**, y la comanda sale
   en la impresora de cocina. Se cobra desde ahí, como cualquier cuenta.

El cajero **no marca «listo»**: la tienda le avisa al cliente cuando se imprime el ticket o se asigna
un repartidor, y cuando se cobra.

## Un pedido no suena (o no aparece)

Revisa en este orden. Casi siempre es una de las primeras tres.

1. **¿La tienda dice «Tienda: recibiendo pedidos»?** La barra está arriba de la pantalla Pedidos en
   línea. Si dice otra cosa, el pedido ni siquiera entró; ve a la tabla de abajo.
2. **¿Hay turno abierto en la caja y la caja tiene internet?** Sin cualquiera de los dos la tienda se
   cierra sola en menos de dos minutos. Un turno abierto en otra caja de la sucursal también vale.
3. **¿La caja es la 0.8.0 o posterior?** (El mensaje de Ajustes → Ayuda por WhatsApp ya lleva la
   versión.) Si es anterior, ver la nota del principio.
4. **¿El sonido del equipo está encendido?** El navegador puede bloquear el timbre; si falla, el
   contador del mosaico «Pedidos en línea» sigue subiendo. Hay que abrir la pantalla.
5. **¿El pedido está ahí pero ya no suena?** Entonces ya se aceptó (por el cajero o en automático),
   se rechazó o se venció. El timbre solo se repite mientras haya uno **por aceptar**.

| Lo que dice la barra | Qué pasa | Qué hacer |
|---|---|---|
| Tienda: recibiendo pedidos | Todo bien | Si no llega nada, hacer un pedido de prueba desde la tienda |
| Tienda: en pausa hasta las … | El cajero o el dueño la pausó | Tocar **Reanudar** |
| Tienda: fuera de horario | Está fuera del horario que configuró el dueño | Revisar el horario de la tienda en el admin |
| Tienda: sin turno abierto | No hay caja con turno abierto **y** con internet | Abrir turno; revisar internet; ver versión (nota del principio) |
| Tienda: apagada | El dueño la apagó, o la sucursal no vende en la tienda | Revisar en el admin que la tienda esté encendida y que la sucursal venda en ella |
| Tienda: sin datos | La caja no pudo preguntar | Revisar internet; reintenta sola cada minuto |

## Un pedido se cancela solo

Hay tres razones y la tarjeta del pedido dice cuál.

- **«Se venció sin aceptar».** Nadie lo aceptó ni lo rechazó a tiempo (el tiempo lo define el dueño,
  entre 3 y 15 minutos, por omisión 5). Si activó las notificaciones, el dueño recibe un aviso en el celular («Tienda en línea:
  pedido sin aceptar»). Es la causa más común: caja sin nadie mirando, sin sonido o sin internet.
- **«Este pedido se canceló solo: …. Avísale al cliente.»** La caja intentó crear la cuenta y el
  pedido ya no se podía armar tal como el cliente lo pidió. El texto dice por qué:
  - *el precio cambió desde que el cliente lo pidió* o *el costo de envío cambió*: el dueño cambió
    precios o tarifas mientras el cliente armaba el pedido;
  - *la dirección o la zona de envío ya no sirve*: la zona se borró o se apagó;
  - *el cliente está bloqueado*;
  - *un producto del pedido ya no está en el menú*: se agotó, se pausó, se quitó del menú o ya no
    se vende en esa sucursal.

  El cliente ya ve su pedido como cancelado. **Lo que hay que hacer es avisarle**, de preferencia por
  teléfono (viene en el pedido), y si quiere, que vuelva a pedir. Un producto recién dado de alta
  puede tardar hasta un minuto en llegar a la caja; la caja espera 3 minutos antes de cancelar por
  «no existe», así que si esto pasa con algo recién creado, repetirlo pasados unos minutos.
- **«Cancelado» sin explicación.** Alguien canceló la cuenta en la caja (Pick-up o Domicilio) o el
  cajero rechazó el pedido. Cancelar la cuenta cancela el pedido para el cliente.

Si el pedido dice **«El pedido en línea se canceló: cancela el ticket en caja»**, el pedido se cerró
en la nube (rechazado o vencido) justo cuando la caja ya había creado la cuenta. Hay que cancelar esa
cuenta a mano para que no se prepare ni se cobre.

## La tienda dice «sin turno abierto»

La tienda considera que hay quien cocine solo si en el último minuto y medio una caja **con turno
abierto** le avisó que sigue ahí. Por eso:

- Abre turno en la caja. Sin turno, no hay pedidos.
- Revisa el internet de la caja. Sin internet, a los 90 segundos la tienda se cierra para los
  clientes (es a propósito: mejor cerrada que aceptando pedidos que nadie va a ver).
- Si el turno está abierto, hay internet y sigue igual: **versión de la caja**. Una caja anterior a
  la 0.8.0 no avisa (nota del principio). Mientras tanto, una forma de salir del paso es abrir el POS
  en el navegador (pos.vimpos.com.mx) con un turno abierto en esa sucursal: ese avisa cada 30
  segundos. Es un paliativo, no la solución.
- Si hay varias cajas, basta con una en regla.

## La comanda no se imprimió

La comanda sale sola, **una vez**, al aceptar el pedido. Si la impresora estaba apagada, sin papel o
desconectada, el POS avisa («…no se pudo imprimir la comanda») y **no lo reintenta solo**, para no
mandar la misma comanda dos veces a la cocina.

1. Arreglar la impresora (encender, papel, cable; Menú → Configurar impresoras y pantallas).
2. Reimprimir desde la cuenta del pedido en **Pick-up** o **Domicilio**: **Reimprimir comanda**.
   Pide motivo y PIN de supervisor, como cualquier reimpresión.
3. Mientras tanto, el pedido sí está aceptado y el cliente ya lo sabe: avisar a la cocina de viva voz.

La forma de pago y la nota del cliente salen en el ticket impreso como **«Nota del pedido: …»**,
bajo los datos de entrega. Si el repartidor pregunta con cuánto paga el cliente, está ahí y también
en el panel de la cuenta.

## Qué pedir al cliente antes de escalar

- Folio del pedido y hora aproximada.
- Qué dice la barra de la tienda y la tarjeta del pedido.
- Versión de la caja.
- Para el equipo técnico: el log `%APPDATA%\vim-pos-desktop\vim-pos.log`, buscando `[espejo]` y el
  folio del pedido.
