# Diseño — Caja de tienda (giro RETAIL)

> Hereda todo de [`pos.md`](pos.md), que hereda de [`nucleo.md`](nucleo.md). Aquí va solo lo que
> cambia cuando la caja es de una tienda de ropa o calzado. Spec: `docs/superpowers/specs/2026-10-15-giro-retail-design.md`
> §5. Forma: boceto del 15 oct 2026, aprobado en forma por Fermín y sujeto a sus ajustes.

## Quién y dónde

La misma caja táctil de 15" (1024×768 es el piso), con dos diferencias contra el restaurante:

- **El producto llega a la mano.** El cliente pone la prenda en el mostrador; el cajero la escanea.
  Tocar el catálogo es el plan B: prenda sin etiqueta o etiqueta que no se lee.
- **La misma prenda tiene muchas versiones.** Una playera en 4 tallas y 3 colores son 12 productos
  para el sistema y uno solo para el cliente. La pantalla enseña **uno** y pregunta la versión al final.

No hay cocina, mesas ni comandas. Lo que sí hay, y en el restaurante casi no: el cliente que vuelve
días después a cambiar la talla.

## Qué pantalla sale

- La caja usa la pantalla de tienda (`venta-retail.tsx`) cuando el giro del negocio es **RETAIL**. Hoy
  la caja no lee el giro; se agrega a lo que ya lee de la caja (`leerCaja`). Un restaurante con el
  módulo de existencias encendido sigue viendo su pantalla de siempre.
- **El inicio no cambia de forma.** El acceso «Para llevar» se llama **«Venta»** en una tienda y lleva a
  la pantalla de tienda. Los demás accesos salen o no por sus módulos, como hoy (una tienda arranca con
  comedor, cocina y domicilio apagados, así que el inicio queda casi vacío: Venta, Devoluciones y lo de
  turno).
- `Volver`, el menú general, el estado de la caja (sin conexión, sincronizando, turno, folios), los
  avisos de VIM y el bloqueo se quedan exactamente donde están.

## La pantalla de venta

Tres zonas, de arriba abajo a la izquierda y el ticket a la derecha (mismo ancho que hoy,
`SidebarTicket`):

```
┌ Volver ─ Venta ──────────────────────── Cambio de talla · Asignar cliente ┐
│ [▮▮ Escanea o busca por nombre o SKU…               ]  Lector listo        │ Venta T0142 │
│ (Todo) (Playeras) (Pantalones) (Calzado)                                   │ Playera Polo│
│ ┌──────────┐┌──────────┐┌──────────┐                                       │  M · Negra  │
│ │Playera   ││Jeans slim││Sudadera  │                                       │  SKU ...    │
│ │$349      ││$799      ││$599      │                                       │ ...         │
│ │12 en tien││8 en tien.││Agotada   │                                       │ Total $1,646│
│ └──────────┘└──────────┘└──────────┘                     ‹ 1/3 ›           │ [  Cobrar  ]│
└────────────────────────────────────────────────────────────────────────────┴─────────────┘
```

### Barra de escaneo y búsqueda

- Arriba de todo, a todo el ancho de la zona izquierda, **56 px de alto** (`h-14`): es lo que más se
  usa después de Cobrar. Icono de código de barras a la izquierda; a la derecha, el estado del lector
  en `text-13 ink-3`: «Lector listo».
- **Escribir filtra la cuadrícula** por nombre, SKU o código, sin Enter. Enter con un código exacto (de
  barras o SKU) agrega ese producto y limpia el campo, igual que la captura del admin
  (`captura-productos.tsx`); Enter con un solo resultado lo agrega o abre su selector.
- El campo **no toma el foco solo** en una pantalla táctil: abriría el teclado en pantalla. El lector
  funciona sin foco (ver «Escáner»).
- Con texto escrito aparece la × para limpiar (44 px de zona de toque).

### Categorías

Las mismas pastillas de hoy (`calcularBarraCategorias`, 56 px de alto, sin scroll), con **«Todo»
primero**: en una tienda se busca más por prenda que por categoría, y «Todo» ordenado por nombre es lo
que el cajero espera al entrar.

### Cuadrícula de productos

- La rejilla de hoy, **paginada y sin scroll** (`calcularRejilla`, `Paginador`). Se enseñan los
  **productos padre** y los productos sin variantes; las variantes nunca salen sueltas en la cuadrícula
  (hoy saldrían todas: hay que filtrarlas).
- Cada tarjeta: nombre (`tamanoNombre`, como hoy), precio en `font-display` bold, y una línea de
  existencia de **esta sucursal** en `text-13`:
  - «12 en tienda» (`ink-2`) — suma de sus variantes.
  - «Pocas: 2» (`warning`) — ver «Pocas» abajo.
  - «Agotada» (`danger`) — cero o menos. **La tarjeta sigue activa**: se vende con aviso (decisión de
    Fermín, spec §2).
- Si las variantes tienen precios distintos, el precio dice «desde $349».
- Tocar un producto **sin variantes** lo agrega; tocar un **padre** abre el selector.

### Selector de talla y color

Un `Modal` centrado, no un cajón lateral: la matriz necesita ancho.

- **Título:** el nombre del producto y su precio. Debajo, la sucursal: «Existencia en León Centro».
- **Matriz:** columnas = primer eje (Talla), renglones = segundo eje (Color), en el orden en que el
  dueño los capturó. Con un solo eje, un renglón. Cada celda es un botón de **56×56 px mínimo** con la
  existencia en `font-display` bold `tabular-nums`, y el precio debajo solo si esa variante cuesta
  distinto.
- **Estados de celda** (el color nunca va solo; siempre hay número o palabra):
  - normal: fondo `surface`, borde `line-strong`, número en `ink`.
  - pocas: fondo `warning-soft`, número en `warning`.
  - agotada (0 o negativa): fondo `danger-soft`, número en `danger` (un negativo se ve como tal:
    «−2»). **Seleccionable.**
  - combinación que no existe (no hay variante, o se quitó): celda vacía con «—», deshabilitada.
- **Tocar una celda agrega una pieza y cierra el selector.** El caso de todos los días es una prenda;
  para la segunda, el escáner o volver a tocar. Sin botón «Agregar» que buscar (mismo criterio que el
  combo: el toque avanza).
- Leyenda al pie en `text-12 ink-2`: «Pocas» y «Agotada, se vende con aviso», cada una con su muestra.
- **Otras sucursales:** con más de una sucursal, arriba de la matriz una fila de botones de 44 px con sus
  nombres (el POS no tiene `Segmentos` del admin; un control así se queda en `venta-retail`). La
  propia viene elegida; elegir otra pinta la matriz con **sus** números, en gris y sin poder tocar
  («Solo para consultar»), con «Actualizado a las 10:42» (la hora del último pull; en el POS web, «al
  momento»). Es la respuesta a «¿la tienen en M en la otra tienda?» sin salir de la venta.
- Escape cierra el selector (capa de `home-pos`/`venta-retail`, como cualquier modal).

### El ticket

- El panel de hoy (`SidebarTicket`, `RenglonItem`). En pantalla el modo se llama **«Venta»**, no «Para
  llevar» (spec §5.2; el ticket por dentro sigue siendo `PARA_LLEVAR`).
- Cada renglón: el nombre del padre en la primera línea y, debajo en `text-13 ink-2`, la variante y
  el SKU: «M · Negra · POL-M-NEG». Un producto sin variantes enseña solo su SKU, si tiene.
- **El último renglón agregado queda marcado** (fondo `sel`) hasta la siguiente acción: así el cajero
  ve qué entró con el escáner sin buscarlo. Sin animación (pasa cientos de veces al día).
- Un renglón que deja la existencia en cero o menos lleva la marca «Sin existencia» en `warning`
  (no `danger`: no impide nada). No bloquea el cobro ni pregunta.
- Con el ticket vacío, el panel no queda en blanco: dice «Escanea una prenda para empezar» y ofrece
  **«Cambio de talla»** grande (botón fantasma, `h-14`), porque un ticket vacío es justo el momento en
  que llega quien viene a cambiar algo.
- **Cobrar** es el único azul, abajo, como hoy (60 px). «Quitar» y el contador de cantidad, también
  como hoy.

### Cabecera

`Volver` a la izquierda (siempre ahí). A la derecha, botones fantasma de 44 px: **«Cambio de talla»** y
**«Asignar cliente»**. «Cuentas en espera» se queda si hoy aplica a Para llevar.

**¿Por qué «Cambio de talla» no va junto a Cobrar, como en el boceto?** Empieza otra operación (sobre
una venta anterior, no sobre el ticket en curso). Junto a Cobrar se leía como una forma de cobrar, y
una pantalla de caja tiene una acción dominante, no dos. Va en la cabecera siempre y, con el ticket
vacío, también en grande dentro del panel.

## Escáner

El lector USB se comporta como un teclado: escribe el código muy rápido y manda Enter.

- **Un detector global** en la pantalla de venta reconoce una **ráfaga**: al menos 6 caracteres con
  menos de 35 ms entre uno y otro (configurable de 20 a 80 ms en Ajustes de la caja), terminada en
  Enter. Tecleo humano no llega a esa velocidad.
- **Funciona sin foco.** Si la ráfaga cae dentro del campo de búsqueda, se trata igual (y el campo se
  limpia). Si cae en **otro** campo enfocado (cantidad, nota, el cliente), el detector no se mete: ese
  texto es del campo.
- **Encontrado:** se agrega una pieza (otra vez el mismo = +1 a su renglón). Sin sonido: el lector ya
  pita.
- **No encontrado:** un sonido corto de error y una franja `danger-soft` bajo la barra de escaneo:
  «No encontramos el código 7501234567890.» con **«Buscar a mano»** (pone el foco en la búsqueda). Se
  quita con la ×, al escanear otro código o al agregar algo.
- **Con algo encima:**
  - selector de talla y color abierto: el código escaneado se agrega y el selector se cierra.
  - cobro abierto: **no se agrega nada** al ticket que se está cobrando; la franja dice «Termina el
    cobro para agregar productos.».
  - aviso grande de un pedido de la tienda en línea, PIN u otro diálogo: el escaneo se ignora (esas
    capas ya se quedan el teclado; ver `pos.md`).
- El detector solo existe en la pantalla de venta de tienda; un restaurante no lo tiene.

## Cobro e impresión

- El cobro es el de siempre (`ModalCobro`): formas de pago, terminal, cliente, lealtad, descuentos.
- **No sale comanda.** La venta de tienda nace sin envío automático a cocina y, al cobrar, no se manda
  nada a estaciones aunque existan.
- **El ticket impreso** sale solo al cobrar (regla de Para llevar). Cada renglón lleva el nombre de la
  variante como lo guardó el admin («1x Playera Polo M Negra») y, debajo y a la izquierda, «SKU
  POL-M-NEG». La vista en pantalla (`recibo-ticket.tsx`) y el papel (`ticket-builder.ts`) cambian
  juntos.
- La pantalla del cliente enseña los renglones con su variante, igual que el ticket.

## Devoluciones en una tienda

La pantalla de Devoluciones de hoy devuelve **toda** la venta y **no** regresa existencias. En una
tienda eso no sirve: el cliente regresa una prenda de tres.

- **Parcial:** se elige qué renglones y cuántas piezas. El total a devolver se recalcula en vivo.
- **Motivos de tienda** (con `MotivoChips`): «Producto defectuoso», «No le gustó», «Error de cobro» y
  «Otro». A un restaurante le siguen saliendo los suyos.
- **¿Vuelve al anaquel?** Cada renglón devuelto lleva un interruptor, encendido de entrada: la pieza
  regresa a la existencia. Con «Producto defectuoso» empieza **apagado**: una prenda rota no se
  vuelve a vender.
- **Encontrar la venta:** el cliente llega días después. Además de las ventas del turno se busca por
  **folio**, y **escanear la etiqueta de la prenda** enseña las ventas recientes (30 días) que la
  llevan. La caja instalada solo ve sus propias ventas; una venta de otra caja o sucursal se devuelve
  desde la caja que la cobró o desde el POS web. La pantalla lo dice cuando no encuentra nada.
- Autorización y medio de devolución: los de hoy.

## Cambio de talla

Una sola pantalla de cuatro pasos, de pantalla completa (es una operación, no un diálogo), con
`Volver` a la izquierda y el paso actual arriba («1 Venta · 2 Qué regresa · 3 Qué se lleva · 4 Listo»):

1. **La venta.** Igual que en Devoluciones: folio, ventas del turno o escanear la prenda que trae el
   cliente. Escanear la etiqueta es el camino normal: casi siempre la trae puesta.
2. **Qué regresa.** Los renglones de esa venta; se toca la prenda (y cuántas). Si se llegó escaneando,
   ya viene marcada.
3. **Qué se lleva.** Se abre el **selector de esa misma prenda** (lo común es la misma playera en otra
   talla), con la talla que regresa marcada como «La que regresa». Se puede escanear cualquier otra
   cosa en su lugar.
4. **Listo.** Dos líneas y una cifra grande:
   - «Regresa: Playera Polo M Negra $349» / «Se lleva: Playera Polo G Negra $349»
   - La cifra dice qué pasa con el dinero, nunca un número sin palabra: **«Sin diferencia»**,
     **«El cliente paga $50»** o **«Le regresas $50 en efectivo»**.
   - Botón principal: «Confirmar cambio», o «Cobrar $50» si hay que cobrar (abre el cobro de siempre
     por la diferencia).

**Cómo queda registrado.** Un cambio es una **devolución parcial** con motivo «Cambio de talla» (la
prenda vuelve al anaquel) y una **venta nueva** con la prenda que se lleva. Las dos se registran en
efectivo por el valor de la prenda que regresa, así que **el cajón cuadra solo**: lo único que se
mueve de verdad es la diferencia. El ticket del cambio lo imprime con las dos líneas y la diferencia.
Ventajas: no hay forma de pago nueva, el corte no cambia y los reportes lo cuentan como lo que es.

**Lo que no hace:** cambiar una venta **facturada** (la factura necesitaría nota de crédito: «Esta
venta está facturada. Haz la devolución desde Devoluciones.»); cambiar entre sucursales o cajas
(mismo límite que Devoluciones).

## Sin internet

- La caja vende, devuelve y cambia contra su copia local; las existencias de su sucursal bajan al
  momento en esa caja. Las de otras cajas de la misma sucursal y las de otras sucursales llegan en la
  siguiente sincronización: por eso el selector dice la hora.
- Dos cajas que venden la última pieza a la vez dejan la existencia en −1. No es un error de la caja:
  el admin lo enseña en «En negativo».

## Pocas

«Pocas» = la existencia está en el **mínimo** que el dueño fijó para esa sucursal o debajo. Sin mínimo
fijado, **2 o menos**. Es el mismo criterio que «Bajo mínimo» del admin, más un piso para quien no ha
fijado mínimos.

## Lo que no cambia

Un restaurante no ve nada de esto. La pantalla de captura, los combos, los modificadores, las mesas,
la cocina y su pantalla de devoluciones siguen igual. Lo compartido (ticket, cobro, impresión,
Escape) se reutiliza; si hay que tocarlo para la tienda, se agrega una opción, no una copia.

## Por decidir con Fermín

1. Si la prenda nueva cuesta **menos**, ¿se regresa la diferencia en efectivo (propuesta) o la tienda
   no regresa dinero en cambios?
2. ¿El cambio de talla pide PIN de supervisor como una devolución (propuesta: solo si hay dinero que
   regresar)?
3. ¿30 días para encontrar una venta escaneando la prenda está bien?
