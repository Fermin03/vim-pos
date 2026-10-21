# Servicio rápido y food truck con la caja de tienda: diseño

**Fecha:** 21 oct 2026 · **Estado:** para aprobación de Fermín · **Grupo:** alimentos y bebidas, antes del
lanzamiento conjunto (retail ✔ → belleza ✔ → servicios ✔ → **alimentos y bebidas**).

## 1. Para qué

En un mostrador de comida rápida la venta es «tomar la orden y cobrar». Hoy la caja de restaurante abre en
una pantalla de inicio (Comedor, Para llevar, Pick-up, Domicilio…), así que el cajero da un paso antes de
cada venta. Las tiendas ya tienen una caja más ágil: abre directo en Cobrar y las secciones están en una
barra abajo. **Servicio rápido y food truck adoptan esa caja.**

**Éxito:** en servicio rápido o food truck, el cajero toma la orden y cobra sin pantallas intermedias, y la
cocina recibe la comanda al instante.

## 2. Alcance

| Giro | Código | Cambia |
|---|---|---|
| Servicio rápido | `QUICK_SERVICE` | **Sí** |
| Food truck | `FOODTRUCK` | **Sí** |
| Cafés | `CAFETERIA` | No |
| Servicio completo | `FULL_SERVICE` | No |
| Bares y cervecerías | `BAR` | No |
| Taquerías y los demás restaurantes | — | No |

Fermín: «esos lugares quedarían igual. Solo cambiaría servicio rápido y foodtruck».

## 3. Lo que decidió Fermín

- **Diseño:** la caja de tienda, con la barra de secciones abajo, «para que sea más ágil las ventas».
- **La venta:** se toma la orden y se cobra. Si el negocio tiene servicio para comer ahí, se pregunta y se
  selecciona en el sistema.
- **Cuándo se pregunta (boceto B):** al tocar «Cobrar» sale «¿Es para llevar o para comer aquí?» con dos
  botones grandes. Después sigue el cobro de siempre.
- **Cocina:** la comanda **se imprime al cobrar**, sin paso extra.
- **Cómo se encuentra al cliente cuando sale su orden:** lo decide cada restaurante.
- **Negocios que ya usan VIM POS:** su caja **cambia sola** al recibir la actualización; no hay interruptor.
- **Sin mesas:** «Un servicio de comida rápida no tiene mesas; en caso de requerir mesas se pasa a servicio
  completo.» «Comer aquí» solo marca que la orden se consume en el local.
- **Una sola impresora:** «Que salgan ambos»: el ticket del cliente y la comanda.

## 4. Cómo se arma

### La caja

- **Arranque:** abre directo en **Cobrar**. Desaparece la pantalla de inicio de restaurante para estos dos
  giros.
- **Barra de abajo:** **Cobrar · Pedidos · Inventario · Transacciones · Más**.
  - Inventario solo aparece si el negocio tiene encendido el módulo de existencias.
  - El resto de lo que hoy está en la pantalla de inicio pasa a «Más»: retiro/depósito, consultar cuentas,
    monitor de ventas, abrir y cerrar turno y salir. *(Propuesta mía.)*
- **Cobrar:** catálogo por categorías con buscador, como en tienda, y el ticket a la derecha. Siguen igual
  que hoy:
  - modificadores (término, extras);
  - combos, incluida la sugerencia «¿Lo hacemos combo?»;
  - descuentos y asignar cliente;
  - propina, si el negocio la usa;
  - lealtad.
- **Al tocar «Cobrar»:**
  1. Sale la pregunta con «Para llevar» y «Comer aquí»: siempre en servicio rápido, y en food truck solo si
     el dueño activó «Tiene dónde comer». Si no se pregunta, la venta es para llevar.
  2. Si el dueño lo activó (abajo), se pide el nombre del cliente.
  3. Sigue el cobro de siempre: propina, forma de pago y ticket.
  4. Al quedar pagada, **se imprime la comanda** con el tipo de servicio («Para llevar» / «Comer aquí») y el
    identificador. Sale una sola vez por venta.
     - Si la cocina tiene su propia impresora, la comanda sale ahí (como hoy).
     - **Si el negocio tiene una sola impresora, salen los dos papeles en ella: ticket y comanda.** Esta
       regla es solo para servicio rápido y food truck; los demás giros siguen con la regla actual.
     - Si el negocio tiene pantalla de cocina, la orden pagada también llega ahí. *(Decisión mía. Si hoy una
       venta de mostrador pagada no llega a la pantalla, es trabajo nuevo de esta entrega.)*
- **«Pedidos»** junta lo que no es venta de mostrador, con un globo de los que esperan:
  - cuentas en espera y para llevar abiertas;
  - pedidos para recoger;
  - domicilio, si el módulo está encendido;
  - pedidos de la tienda en línea y de Uber.

  Es lo mismo que hoy está en «Pick-up», «Domicilio» y «Pedidos en línea» de la pantalla de inicio, en un
  solo lugar. *(Propuesta mía.)* Arriba lleva **«Nuevo para recoger»** y **«Nuevo a domicilio»** (este solo
  con el módulo), que abren Cobrar en ese modo; esos pedidos conservan su flujo de hoy (se mandan a cocina
  antes de cobrarse). En Cobrar, el menú del ticket conserva «Poner en espera». *(Propuesta mía.)*
- **Sin mesas:** estos dos giros no usan comedor, mapa de mesas ni meseros.
  - Al actualizar, un negocio que tenga cuentas de mesa abiertas las sigue viendo en «Pedidos» hasta
    cobrarlas o cerrarlas; no se pueden abrir nuevas. *(Decisión mía.)*
  - Si un negocio necesita mesas, cambia su giro a servicio completo.
- **Food truck:** igual, sin Domicilio, y conserva el nombre del evento al abrir turno (módulo `eventos`).

### Cómo se identifica la orden (lo elige el dueño)

- **Número de orden:** siempre sale, grande, en el ticket y en la comanda. Es el «Orden #» que la comanda ya
  imprime hoy (los últimos 4 dígitos del folio), así funciona sin internet y sin contador nuevo. *(Decisión
  mía.)*
- **Nombre del cliente:** el dueño lo activa o no en la configuración de la caja en el admin. Activado, el
  cajero lo escribe al cobrar, tanto para llevar como para comer aquí, y sale en el ticket y en la comanda.

## 5. Reglas que el constructor no debe romper

- **Cafés, servicio completo, bares, taquerías y los demás giros no cambian:** ni su pantalla de inicio,
  ni sus mesas, ni su flujo de comandas.
- **Las tiendas, los salones, los talleres y los consultorios no cambian.**
- **No se pierde ninguna función** que hoy usan servicio rápido y food truck, salvo las mesas (decisión de
  Fermín): combos, modificadores, propinas, pick-up, domicilio con repartidores, tienda en línea, Uber,
  cuentas en espera, lealtad, factura, corte y turno. Solo cambian de lugar.
- **La comanda sale una sola vez por venta**, aunque el cobro se reintente.
- **Funciona en la caja instalada sin internet**, como hoy.
- Diseño: `docs/diseno/` y `tokens.css`; controles de 44 px.

## 6. Fuera de alcance

- Cambios a cafés, servicio completo y bares.
- Mesas, mapa de mesas y meseros en servicio rápido y food truck (para eso está servicio completo).
- Pantalla de llamado de órdenes para el cliente («tu orden está lista»).

## 7. Lo que queda al constructor

- Cómo se reparte el código entre la caja de tienda y la de restaurante, sin duplicar el cobro.
- Dónde vive el interruptor «pedir nombre del cliente» (preferencia: la configuración de la caja que ya
  existe).
- Cómo se apagan comedor y meseros para estos dos giros sin romper a los negocios que hoy los tienen
  encendidos (juego inicial y negocios existentes).

## 8. Mis decisiones (Fermín puede corregirlas)

- La sección «Pedidos», lo que junta, y sus botones «Nuevo para recoger» y «Nuevo a domicilio».
- Turno, retiro/depósito, consultar cuentas y monitor de ventas pasan a «Más».
- El número de orden es el «Orden #» de hoy y sale siempre; el nombre, solo si el dueño lo activa.
- Si el negocio tiene pantalla de cocina, la orden pagada también llega ahí.
- «Comer aquí» se pregunta siempre en servicio rápido; en food truck solo si el dueño lo activa (muchos no
  tienen dónde sentarse).
- Las cuentas de mesa abiertas al actualizar se pueden terminar desde «Pedidos», pero no se abren nuevas.
