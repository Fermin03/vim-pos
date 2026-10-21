# 0045 — Comida rápida usa la navegación de tienda con el cobro de restaurante

**Fecha:** 21 de octubre de 2026 · **Estado:** vigente (grupo de alimentos y bebidas, antes del lanzamiento conjunto)

> El número 0044 lo usa el ADR de la demo autoguiada, en la rama local `feat/demo-autoguiada`, que aún no
> se mezcla. Por eso este es el 0045.

## Qué decía el plan

Todos los restaurantes compartían la misma caja: abre en una pantalla de inicio (Comedor, Para llevar,
Pick-up, Domicilio, En línea) y desde ahí se entra a vender. La comanda de una venta para llevar solo se
imprimía al cobrar si la cocina tenía su propia impresora; con una sola impresora no salía. Servicio rápido y
food truck tenían comedor y meseros como cualquier restaurante.

## Qué hacemos ahora

- **Servicio rápido (`QUICK_SERVICE`) y food truck (`FOODTRUCK`) usan la navegación de la tienda:** abren
  directo en Cobrar, sin pantalla de inicio, con la barra **Cobrar · Pedidos · Inventario · Transacciones ·
  Más** abajo (Inventario solo con el módulo de existencias). Lo decidió Fermín «para que sea más ágil las
  ventas».
- **El cobro y el ticket siguen siendo de restaurante.** En el código hay dos preguntas separadas:
  `conBarraAbajo(caja)` (tienda **o** comida rápida) decide cómo se mueve la caja, y `comoTienda(caja)`
  (solo tienda) decide el ticket de tienda. Para comida rápida la segunda es falsa, así que se conservan
  la comanda, los combos, los modificadores, la propina y la lealtad, sin duplicar el cobro. La lista de
  giros vive en `GIROS_COMIDA_RAPIDA` (`packages/db/src/operacion.ts`).
- **La pregunta va antes de guardar la venta.** Al tocar Cobrar sale «¿Es para llevar o para comer aquí?»
  (siempre en servicio rápido; en food truck solo con «Tiene dónde comer»). Cancelar no deja nada guardado
  ni abre el cajón. Si la cuenta ya estaba guardada (retomada de espera), lo elegido se escribe en la venta
  abierta y, si no se puede, no se cobra.
- **Dos interruptores por negocio (0242):** `configuracion_tenant.pedir_nombre_cliente` y
  `tiene_donde_comer`, apagados por defecto, en el admin en Configuración › Operación › Mostrador. Van por
  negocio y no por caja. La caja instalada los recibe por el sync genérico (sin cambio en el escritorio) y,
  si no los encuentra, los toma como apagados. El nombre va en `tickets.nombre_cliente`, que ya existía.
- **«Comer aquí» se llama así solo en comida rápida.** `etiquetaModo(modo, giro)` decide la palabra en el
  ticket, la comanda, la caja, «Consultar cuentas» y la pantalla de cocina. Los demás restaurantes siguen con
  «Comedor».
- **La comanda sale al cobrar, también con una sola impresora.** Al quedar pagada una venta de mostrador
  (para llevar o comer aquí), la caja la manda a cocina con `enviarACocina`, que ya existía y funciona sin
  internet, así que también llega a la pantalla de cocina. Con los renglones que esa función devuelve imprime
  la comanda por áreas: en la estación de cocina si existe, o en la única impresora después del ticket. Si no
  devuelve renglones (ya se había mandado), no imprime: una sola comanda por venta. La regla nueva vive en
  `debeImprimirComandaAlCobrar(…, comidaRapida)`, y sin ese dato da lo mismo que antes para los demás giros.
  Fermín: «Que salgan ambos».
- **El ticket de «Comer aquí» se imprime al cobrar**, porque en comida rápida no hay otro momento para darlo,
  salvo que la cuenta ya tuviera su ticket impreso.
- **Sin mesas.** Estos dos giros no muestran comedor, mapa de mesas ni meseros, aunque los módulos estén
  encendidos, porque no hay inicio que los ofrezca. No se apagó ningún módulo en la base. Las cuentas de
  mesa abiertas al actualizar se cobran desde Pedidos › Cuentas de mesa, sin «Nueva orden». Fermín: «Un
  servicio de comida rápida no tiene mesas; en caso de requerir mesas se pasa a servicio completo.»
- **Pedidos junta lo que no es venta de mostrador** (en espera, para llevar abiertas, pick-up, domicilio, en
  línea y cuentas de mesa), reutilizando las pantallas que ya existían. Pick-up y domicilio conservan su
  flujo: se mandan a cocina antes de cobrar y no se pregunta nada.
- **Sin interruptor de migración:** los negocios con estos giros cambian solos al actualizar la caja.

## Adenda (21 oct 2026): cafetería y Notificaciones

- **La cafetería (`CAFETERIA`) entra a comida rápida.** Fermín: la cafetería adopta el diseño del food
  truck. Está en `GIROS_COMIDA_RAPIDA`, así que hereda todo: barra abajo, sin inicio, ticket y cobro de
  restaurante, comanda al cobrar, «Comer aquí» y el panel sin Subtotal ni Total. Pregunta **siempre**
  «¿Es para llevar o para comer aquí?», como servicio rápido; en el admin ve «Pedir el nombre del
  cliente», no «Tiene dónde comer».
- **Su barra no lleva Pedidos:** **Cobrar · Inventario · Transacciones · Notificaciones · Más**, con
  Inventario siempre (sin el módulo de existencias enseña que no lleva existencias). Las tarjetas de
  Pedidos, el aviso de vencidos en línea y el globo viven en **Más** (`seccionDePedidos(caja)`).
- **Notificaciones entra a la barra de los tres giros.** Servicio rápido y food truck: **Cobrar · Pedidos ·
  Inventario · Transacciones · Notificaciones · Más** (Inventario solo con existencias). Es la sección de
  la tienda, sin cambios: alertas de existencias (con el módulo, que ahora se lee también fuera de
  Inventario para el globo) y avisos de VIM.
- **Cuentas de barra (`cuentas_barra`):** sin pantalla de inicio, su lista se abre desde la tarjeta
  **«Barra»** de Pedidos (en la cafetería, de Más), que sale con el módulo o mientras quede alguna cuenta de
  barra abierta. Vale para los tres giros.

## Lo que aceptamos

- **Si el envío a cocina falla después de cobrar,** la venta queda cobrada y la caja pide avisar a mano. No se
  reintenta solo: una comanda doble en la cocina cuesta más (como en pick-up, `pos.md`).
- **Los números de Pedidos se leen por sondeo** (cada 15 a 20 segundos y al volver de una lista), no en
  vivo.
- **El monitor de ventas y la lista de cuentas abiertas** todavía dicen «Comedor» para «Comer aquí».
- **La pantalla de cocina dedicada** ahora lee el giro del negocio (`tenants.vertical_principal`) para
  escribir «Comer aquí». No se probó con el usuario de una pantalla de cocina dedicada: si no pudiera leer
  `tenants`, esa pantalla no cargaría.

## Descartado

- **Hacer que comida rápida sea «tienda» completa** (encender `comoTienda`): cambiaba el ticket a «Venta/SKU»
  y apagaba la comanda.
- **Preguntar después de cobrar** o **al abrir la venta**: lo primero ya no sirve para la comanda; lo segundo
  agrega un paso a cada venta.
- **Interruptor por caja** para el nombre o el dónde comer: el negocio decide una vez para todas sus cajas.
- **Apagar los módulos `comedor` y `meseros` en la base:** tocaba el juego inicial (ADR 0034) y a negocios
  que cambian de giro; basta con que la caja no los ofrezca.
- **Un contador nuevo de órdenes:** el «Orden #» de la comanda (últimos 4 del folio) ya funciona sin internet.
