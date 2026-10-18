# Diseño — Caja de tienda (giro RETAIL)

> Hereda todo de [`pos.md`](pos.md), que hereda de [`nucleo.md`](nucleo.md). Aquí va solo lo que
> cambia cuando la caja es de una tienda de ropa o calzado. Spec: `docs/superpowers/specs/2026-10-15-giro-retail-design.md`
> §5. Boceto del 15 oct 2026; este documento describe lo que quedó construido en las entregas 4 y 4b
> (16 y 17 oct 2026), con el cambio de Fermín del 16 oct (barra inferior y tarjetas con foto). Donde
> el código hizo algo distinto del boceto, aquí manda el código.

## Quién y dónde

La misma caja táctil de 15" (1024×768 es el piso), con dos diferencias contra el restaurante:

- **El producto llega a la mano.** El cliente pone la prenda en el mostrador; el cajero la escanea.
  Tocar el catálogo es el plan B: prenda sin etiqueta o etiqueta que no se lee.
- **La misma prenda tiene muchas versiones.** Una playera en 4 tallas y 3 colores son 12 productos
  para el sistema y uno solo para el cliente. La pantalla enseña **uno** y pregunta la versión al final.

No hay cocina, mesas ni comandas. Lo que sí hay, y en el restaurante casi no: el cliente que vuelve
días después a cambiar la talla.

## La barra inferior y sus cinco secciones

**Una barra de navegación abajo, siempre visible**, con cinco destinos: **Panel · Inventario ·
Transacciones · Notificaciones · Configuración**. En una tienda reemplaza al inicio de mosaicos, al
botón «Menú» y al `Volver` de la venta: el cajero cambia de sección con un toque, sin regresar a un
inicio. Cada destino es un botón de 56 px de alto con icono y texto; el elegido va en el color de
acento. Notificaciones lleva un globo con el número de avisos sin ver. La barra de estado de la caja
(sin conexión, sincronizando, turno, folios) sigue arriba. Con un cobro o un diálogo encima, la barra
no responde. Al iniciar turno, la caja abre en el Panel. Las secciones comparten la misma cabecera:
título de 20 px y, a la derecha, lo suyo.

- **Panel** es la venta (la pantalla de cobro). Ver «La pantalla de venta».
- **Inventario** tiene dos pestañas, **Existencias** y **Recibir**.
- **Transacciones** es la lista de ventas y cuentas abiertas.
- **Notificaciones** junta las alertas de existencias y los avisos de VIM.
- **Configuración** es el menú general de la caja puesto en una página.

Un restaurante no ve nada de esto: su inicio, su menú y su captura quedan iguales.

### Inventario

- **Existencias.** Buscar o escribir una prenda y ver su existencia por talla y color, en esta
  sucursal y en las demás. Es el mismo selector de la venta, solo de consulta: tocar una celda no
  agrega nada. Sin búsqueda se enseñan los primeros 60 productos. Aquí escanear **nunca** agrega al
  ticket: el código reemplaza a la búsqueda y abre la consulta de esa prenda. Un código que no existe
  dice «No encontramos el código…».
- **Recibir.** Recibir mercancía escaneando, como en el admin, pero más corto: **sin costo y sin
  proveedor** (decisión 1 del plan; los productos y los proveedores los captura el admin). Cada escaneo
  suma 1 pieza al renglón; la cantidad se puede editar. Un campo de referencia opcional (hasta 100
  caracteres) y el botón «Recibir N productos». Recibir solo lo puede hacer quien tenga el permiso de
  productos (**dueño o administrador**); a los demás la pantalla les dice «Pide a un administrador que
  entre con su PIN para recibir.». Solo recibe productos que controlan existencias. Si el negocio tiene
  las existencias apagadas, avisa y no deja recibir.
- Lo capturado en Recibir no se pierde por accidente: cambiar de pestaña o de sección con renglones sin
  recibir pregunta antes.
- El escáner solo vive en la pestaña que lo usa. Con un diálogo encima, el lector queda «en pausa».

### Transacciones

La lista de ventas. Arriba las **cuentas abiertas de esta caja** (por ejemplo, la de un cambio con
diferencia por cobrar, o una venta que se dejó abierta), luego las ventas del turno. Búsqueda por
folio o escaneando una prenda (30 días). Al tocar una venta se ve su detalle, con cinco acciones:
**Reimprimir**, **Devolver**, **Cambio de talla** (esta última no sale en una venta facturada),
**Reabrir** (no sale si alguna línea tiene devoluciones ni si la venta se pagó en línea) y
**Cambiar pago** (solo cuando la venta tiene exactamente un pago real; una venta de cambio de talla
se pagó con la prenda devuelta y no tiene pago que cambiar).
Reemplaza a las entradas sueltas de Devoluciones y de Cambio de talla; el botón grande del ticket
vacío se queda como atajo al cambio. Abrir una cuenta la carga en el Panel para cobrarla. Una cuenta abierta que ya trae pagos (la venta de un cambio, reabierta) muestra en el botón lo **pendiente**, no el total; con $0 pendiente (un cambio parejo) el botón dice «Cerrar venta», cierra la cuenta sin abrir el modal de pago y «Cobro completado» dice «Sin cobro». Reabrir esa venta no anula la prenda devuelta: su aviso dice que solo se anula lo que el cliente pagó aparte.

Solo salen las cuentas de **esta caja**: el pago se asienta en la caja y el turno del ticket. En el
restaurante, «Cuentas abiertas · Para llevar» muestra las de toda la sucursal; ver el hallazgo en el
spec (§13).

### Notificaciones

Una lista con dos tipos, **ordenada por gravedad** y sin fechas (las existencias no traen fecha):
primero lo agotado o en negativo, luego «Pocas», luego los avisos de VIM.

- **Existencias** de esta sucursal: prendas bajo mínimo, agotadas o en negativo, con la cifra. Solo
  productos que controlan existencias; un padre no cuenta, sus variantes llevan la cifra. Al tocar una,
  abre Inventario con esa prenda.
- **Avisos de VIM**: los mismos que salen al abrir turno (se siguen mostrando ahí, uno por uno); aquí
  quedan para releerlos. Se abren completos, en texto plano.
- **El globo** cuenta lo que no se ha visto desde la última vez que se abrió la pestaña. Lo visto se
  guarda en esta caja. Si cambia la cantidad de una prenda, su alerta vuelve a contar.
- **Cómo se guardan los avisos de VIM.** La nube deja de mandar los que la caja ya acusó, así que la
  caja guarda la última lista y la une con la nueva (por id, gana la nueva). Se queda con **20 como
  máximo** y tira los que ya pasaron su `vigente_hasta` o traen una fecha que no se entiende. Un aviso
  que VIM retire sigue ahí hasta que venza.

### Configuración

Lo que antes estaba en el «Menú» general, en una página: impresoras y pantallas, cambiar cajero,
bloquear, cambiar PIN, mis propinas, abrir cajón, **Corte caja X** (abre el monitor de ventas),
**Retiro / Depósito**, actualizar menú, buscar actualizaciones, ayuda por WhatsApp, **Salir** (si la
caja puede) y **Cerrar turno** (en rojo, separado de lo demás). «Devoluciones» ya no está aquí: se hace
desde Transacciones.

**Proteger la venta en curso.** Bloquear, Cambiar cajero, Cerrar turno y Salir sacan al cajero de la
pantalla de venta. Antes de hacerlo:

- si hay una cuenta guardada cargada, se **deja abierta** (queda en Transacciones);
- si es una venta suelta sin guardar, pregunta «Se borra la venta sin guardar (N productos).» y solo
  sigue si el cajero confirma.

## Qué pantalla sale

- La caja usa la venta de tienda cuando el giro del negocio es **RETAIL** (`esTienda`, que sale de lo
  que ya lee de la caja). Cambia el **panel izquierdo** de la captura (`PanelVentaRetail`, en
  `venta-retail.tsx`) y se agrega la barra inferior con sus secciones. El ticket de la derecha, el
  cobro y lo demás son los de siempre y viven en `home-pos.tsx`. Un restaurante con el módulo de
  existencias encendido sigue viendo su pantalla de siempre.
- No hay inicio de mosaicos. La caja abre en el Panel.
- El estado de la caja (sin conexión, sincronizando, turno, folios), los avisos de VIM y el bloqueo se
  quedan exactamente donde están.

## La pantalla de venta

Tres zonas, de arriba abajo a la izquierda y el ticket a la derecha (mismo ancho que hoy,
`SidebarTicket`), y la barra inferior debajo de todo:

```
┌ [▮▮ Escanea o busca por nombre o SKU…          ]  Lector listo ┬ Venta T0142 ──────────┐
│ (Todo) (Playeras) (Pantalones) (Calzado)                       │ Asignar cliente Limpiar│
│ ┌──────────┐┌──────────┐┌──────────┐                           │ Playera Polo           │
│ │ [foto]   ││ [foto]   ││ [foto]   │                           │  M · Negra · POL-M-NEG │
│ │Playera   ││Jeans slim││Sudadera  │                           │ Total $1,646           │
│ │$349      ││$799      ││$599 Pocas│              ‹ 1/3 ›      │ [     Cobrar     ]     │
│ └──────────┘└──────────┘└──────────┘                           │                        │
├────────────────────────────────────────────────────────────────┴────────────────────────┤
│   Panel      Inventario     Transacciones     Notificaciones     Configuración          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Barra de escaneo y búsqueda

- Arriba de todo, a todo el ancho de la zona izquierda, **56 px de alto** (`h-14`): es lo que más se
  usa después de Cobrar. Icono de código de barras a la izquierda; a la derecha, el estado del lector
  en `text-13 ink-3`: «Lector listo».
- **Escribir filtra la cuadrícula** por nombre, SKU o código, sin Enter, sin acentos ni mayúsculas.
  Buscar es sobre todo el catálogo, no sobre la categoría elegida. Enter con un código exacto (de
  barras o SKU) agrega ese producto y limpia el campo, igual que la captura del admin
  (`captura-productos.tsx`); Enter con un solo resultado lo agrega o abre su selector.
- Lo que la sucursal no vende no se pinta ni se escanea (menú por sucursal, ADR 0027).
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
- **Cada tarjeta lleva foto.** La foto del producto (la que sube el admin, `imagen_url`) llena la
  tarjeta, recortada en cuadrado. Encima, un degradado oscuro de abajo hacia arriba. Sobre él, abajo a
  la izquierda y en blanco: el nombre (`text-14`, seminegrita, hasta dos renglones) y el precio debajo
  (`font-display`, bold, `tabular-nums`). Chico pero legible a un metro.
  - **Las fotos necesitan internet.** Sin foto, o si no carga (caja sin conexión), la tarjeta usa el
    color de su categoría con la **inicial** del producto en grande, y el mismo degradado y texto.
    Nunca una tarjeta en blanco. Por eso la política de imágenes (CSP `img-src`) incluye el origen de
    Supabase, en la web y en el escritorio.
  - **Existencia:** sin número en la tarjeta. Una etiqueta arriba a la derecha solo cuando importa:
    «Pocas» (`warning`) o «Agotada» (`danger`). **La tarjeta sigue activa**: se vende con aviso
    (decisión de Fermín, spec §2). Mientras las existencias no se han leído, no sale etiqueta: nunca
    una «Agotada» falsa. El número exacto se ve en el selector de talla y color.
- Si las variantes tienen precios distintos, el precio dice «desde $349»; si no, el de sus variantes.
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
  - variante que esta sucursal no vende, o que el dueño marcó **«agotado» a mano** en esta sucursal:
    se ve, pero no se toca, y dice «No se vende aquí» o «No se vende por ahora». «Agotada, se vende con
    aviso» habla solo de la cuenta de piezas; el «agotado» a mano se respeta igual que en el
    restaurante.
- **Tocar una celda agrega una pieza y cierra el selector.** El caso de todos los días es una prenda;
  para la segunda, el escáner o volver a tocar. Sin botón «Agregar» que buscar (mismo criterio que el
  combo: el toque avanza).
- Leyenda al pie en `text-12 ink-2`: «Pocas» y «Agotada, se vende con aviso», cada una con su muestra.
- **Otras sucursales:** con más de una sucursal, arriba de la matriz una fila de botones de 44 px con sus
  nombres (el POS no tiene `Segmentos` del admin; un control así se queda en `venta-retail`). La
  propia viene elegida; elegir otra pinta la matriz con **sus** números, en gris y sin poder tocar
  («Solo para consultar»), con «Actualizado a las 10:42» (la hora del último pull; en el POS web, «al
  momento»). Es la respuesta a «¿la tienen en M en la otra tienda?» sin salir de la venta.
- Escape cierra el selector (capa de `home-pos`, como cualquier modal). El mismo selector sirve en el
  cambio de talla, con una celda marcada «La que regresa».

### El ticket

- El panel de hoy (`SidebarTicket`, `RenglonItem`), **mitad y mitad** con el catálogo (Fermín, 18 oct).
  En el Panel no se pinta la etiqueta del modo bajo «Ticket nuevo». Por dentro el ticket sigue siendo
  `PARA_LLEVAR` (spec §5.2); el ticket impreso y su vista en pantalla dicen «Servicio: Venta». Los textos secundarios (cuentas abiertas, cierre) aún
  dicen «Para llevar».
- Cada renglón: el nombre del padre en la primera línea y, debajo en `text-13 ink-2`, la variante y
  el SKU: «M · Negra · POL-M-NEG». Un producto sin variantes enseña solo su SKU, si tiene.
- **El último renglón agregado queda marcado** (fondo `sel`) hasta la siguiente acción: así el cajero
  ve qué entró con el escáner sin buscarlo. Sin animación (pasa cientos de veces al día).
- Un renglón que deja la existencia en cero o menos lleva la marca «Sin existencia» en `warning`
  (no `danger`: no impide nada). No bloquea el cobro ni pregunta.
- Con el ticket vacío, el panel no queda en blanco: dice «Escanea una prenda para empezar» y ofrece
  **«Cambio de talla»** grande (botón fantasma, `h-14`), porque un ticket vacío es justo el momento en
  que llega quien viene a cambiar algo.
- **Cobrar** es el único azul, abajo, como hoy (60 px). «Quitar», también como hoy. No hay
  «Efectivo exacto», ni contador de cantidad, ni nota por renglón, ni «Nota de la orden» (Fermín,
  18 oct): cada escaneo es una pieza y ese espacio es para la lista de renglones. Dos escaneos de la
  misma prenda quedan en un renglón «2×»; ahí «Quitar» saca una pieza, no el renglón entero.

### Arriba del ticket

Arriba del ticket solo van el título y, a su derecha, un botón **«⋯»** (Fermín, 18 oct). No hay
botones sueltos: ni «Asignar cliente», ni «Limpiar», ni «Dejar abierta», ni «En espera», ni
«Precios». Si hay cliente asignado, su nombre va en texto chico bajo el título, donde el restaurante
pinta el modo. Las cuentas abiertas y en espera viven en Transacciones.

**Menú «⋯».** Despliega, en este orden:

- **Nota** (de la venta; «Editar nota» si ya hay una).
- **Descuento por producto.** Con un solo renglón abre su descuento directo; con varios, el ticket
  pide «Toca el producto al que le harás descuento» y el siguiente toque en un renglón lo elige
  (Escape o «Cancelar» lo deja). En el renglón no hay botón de descuento.
- **Descuento general** (el de todo el ticket, el mismo de hoy).
- **Asignar cliente** («Cambiar cliente» si ya hay uno).
- **Limpiar** en rojo, o **Cancelar cuenta** si el ticket ya está guardado. Es la única salida de una
  cuenta guardada que no se va a cobrar, ahora que no hay «Dejar abierta».

Los dos descuentos guardan la venta como cuenta antes de pedir el PIN de supervisor, igual que en
restaurante. Se cierra con Escape o tocando fuera.

**¿Por qué «Cambio de talla» no va junto a Cobrar?** Empieza otra operación (sobre una venta anterior,
no sobre el ticket en curso). Junto a Cobrar se leía como una forma de cobrar, y una pantalla de caja
tiene una acción dominante, no dos. Se hace desde el detalle de una venta en Transacciones y, con el
ticket vacío, también con el botón grande dentro del panel.

## Escáner

El lector USB se comporta como un teclado: escribe el código muy rápido y manda Enter.

- **Un detector global** en la pantalla de venta reconoce una **ráfaga**: al menos 6 caracteres con
  menos de 35 ms entre uno y otro, terminada en Enter. Tecleo humano no llega a esa velocidad.
  **No hay pantalla de ajustes para el umbral:** se cambia, de 20 a 80 ms, con la llave
  `vimpos.escaner.umbralMs` del `localStorage` del navegador de la caja.
- **Se traga la ráfaga desde el 2º carácter**, para que no llegue al teclado numérico del cobro ni al
  PIN. El 1er carácter no se puede distinguir de un tecleo humano y se escapa. Al reconocer el código
  se come el Enter y limpia el buscador.
- **Funciona sin foco.** Si la ráfaga cae dentro del campo de búsqueda, se trata igual (y el campo se
  limpia). Si cae en **otro** campo enfocado (cantidad, nota, el cliente), el detector no se mete: ese
  texto es del campo.
- **Encontrado:** se agrega una pieza (otra vez el mismo = +1 a su renglón). Sin sonido: el lector ya
  pita.
- **No encontrado:** un sonido corto de error y una franja `danger-soft` bajo la barra de escaneo:
  «No encontramos el código 7501234567890.» con **«Buscar a mano»** (pone el foco en la búsqueda). Se
  quita con la ×, al escanear otro código o al agregar algo. Un código de prenda padre abre su
  selector; si el padre no tiene variantes que vender, cuenta como no encontrado.
- **Con algo encima:**
  - selector de talla y color abierto: el código escaneado se agrega y el selector se cierra.
  - cobro abierto: **no se agrega nada** al ticket que se está cobrando; sale «Termina el cobro para
    agregar productos.» pegado al borde de abajo (a 1024×768 el cobro tapa la franja de arriba) y se va
    solo a los 3 s o al cerrar el cobro.
  - «Cobro completado» o el recibo a la vista: el escaneo los cierra y la prenda abre la **venta
    siguiente**. Es el cliente que sigue en la fila; el ticket y la factura quedan en la consulta de
    cuentas.
  - aviso grande de un pedido de la tienda en línea, PIN u otro diálogo: el escaneo se ignora (esas
    capas ya se quedan el teclado; ver `pos.md`).
- El detector solo existe en la pantalla de venta de tienda; un restaurante no lo tiene.

## Cobro e impresión

- El cobro es el de siempre (`ModalCobro`): formas de pago, terminal, cliente, lealtad, descuentos.
- **No sale comanda.** La venta de tienda nace sin envío automático a cocina y, al cobrar, no se manda
  nada a estaciones aunque existan.
- Los agregados van en fila: dos escaneos seguidos con una cuenta guardada no se pisan. Si la conexión
  tarda demasiado, avisa «Vuelve a escanearla».
- **El ticket impreso** sale solo al cobrar (regla de Para llevar). Cada renglón lleva el nombre de la
  variante como lo guardó el admin («1x Playera Polo M Negra») y, debajo y a la izquierda, «SKU
  POL-M-NEG». La vista en pantalla (`recibo-ticket.tsx`) y el papel (`ticket-builder.ts`) cambian
  juntos.
- La pantalla del cliente enseña los renglones con su variante, igual que el ticket.

## Devoluciones en una tienda

Se llega con **Devolver**, en el detalle de una venta en Transacciones (la venta ya viene elegida).
La pantalla de Devoluciones del restaurante devuelve **toda** la venta y **no** regresa existencias. En una
tienda eso no sirve: el cliente regresa una prenda de tres.

- **Parcial:** se elige qué renglones y cuántas piezas. El total a devolver se recalcula en vivo.
- **Motivos de tienda** (con `MotivoChips`): «Producto defectuoso», «No le gustó», «Error de cobro» y
  «Otro». En la base reutilizan `PRODUCTO_DEFECTUOSO` y `CLIENTE_NO_SATISFECHO`. A un restaurante le
  siguen saliendo los suyos. **Ningún motivo viene elegido**: el cajero lo escoge, para que una
  prenda defectuosa no regrese al anaquel por descuido.
- **¿Vuelve al anaquel?** Cada renglón devuelto lleva un interruptor. Con «Producto defectuoso»
  empieza **apagado** (una prenda rota no se vuelve a vender); con los demás motivos, encendido.
  Cambiar el motivo regresa el interruptor a su valor de entrada.
- **Encontrar la venta:** el cliente llega días después. Además de las ventas del turno se busca por
  **folio**, y **escanear la etiqueta de la prenda** enseña las ventas recientes (30 días) que la
  llevan. La caja instalada solo ve sus propias ventas; una venta de otra caja o sucursal se devuelve
  desde la caja que la cobró o desde el POS web. La pantalla lo dice cuando no encuentra nada. La
  búsqueda por folio y por prenda se limita a la sucursal de la caja.
- **Autorización:** la de hoy (PIN de supervisor o la propia con el permiso de devolución).
- **Medio de devolución:** en una devolución parcial de tienda sale **«Efectivo»** de entrada. «Mismo
  método» se puede elegir, pero la terminal de Mercado Pago solo regresa un cobro completo: si la
  devolución es parcial, la caja la registra con la nota «Reembolso a tarjeta pendiente: …» (dice si
  hay que hacerlo desde la app o la web de Mercado Pago, o desde la terminal con que se cobró), avisa
  al terminar y el comprobante dice «Tarjeta · reembolso pendiente», nunca que ya se devolvió.

## Cambio de talla

Una sola pantalla de cuatro pasos, de pantalla completa (es una operación, no un diálogo), con
un botón para salir a la izquierda y el paso actual arriba («1 Venta · 2 Qué regresa · 3 Qué se lleva · 4 Listo»):

1. **La venta.** Desde Transacciones ya viene elegida. Si se entra por el botón del ticket vacío: folio, ventas del turno o escanear la prenda que trae el
   cliente. Escanear la etiqueta es el camino normal: casi siempre la trae puesta.
2. **Qué regresa.** Los renglones de esa venta; se toca **una** prenda (y cuántas piezas de ella). Si
   se llegó escaneando, ya viene marcada.
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
prenda vuelve al anaquel) y una **venta nueva** con la prenda que se lleva, todo en una sola llamada a
la base (`registrar_cambio_talla`). Las dos se registran en efectivo por el valor de la prenda que
regresa, así que **el cajón cuadra solo**: lo único que se mueve de verdad es la diferencia. Ventajas:
no hay forma de pago nueva, el corte no cambia y los reportes lo cuentan como lo que es.

- **El ticket del cambio** imprime arriba la línea «Regresa: …», luego la prenda que se lleva y, al
  final, la diferencia con palabras («Sin diferencia», «El cliente paga $50.00» o «Le regresas $50.00
  en efectivo»). La vista en pantalla dice lo mismo.
- **Con diferencia a favor del negocio**, la venta nueva queda **abierta** y se carga en el carrito
  para cobrar solo esa diferencia. Esa cuenta abierta **solo se cobra completa o se cancela completa**:
  no deja cambiar renglones, descontar ni borrar. Al cancelarla, el aviso dice «Le regresas $X en
  efectivo» (el valor de la prenda que había regresado, pues su pago interno se anula).
- **Con diferencia a favor del cliente**, el cambio queda pagado y la pantalla avisa «Abre el cajón a
  mano y entrega $X».
- **Autorización.** La base **siempre** pide una. Sin dinero que regresar y con el permiso de
  devolución, la caja la saca sola (sin PIN). Si hay dinero que regresar, o el cajero no tiene el
  permiso, pide el PIN de un supervisor. Esto difiere de lo que aprobó Fermín (ver abajo).

**Lo que no hace:** cambiar una venta **facturada** (la factura necesitaría nota de crédito: «Esta
venta está facturada. Haz la devolución con «Devolver».»); cambiar entre sucursales o cajas
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

## Decidido con Fermín (16 oct)

Aprobó este diseño y las tres propuestas:

1. Si la prenda nueva cuesta **menos**, la diferencia se regresa **en efectivo**.
2. El cambio de talla pide la autorización de una devolución **solo si hay dinero que regresar**.
3. Escanear la prenda busca en las ventas de los **últimos 30 días**.

## Por decidir con Fermín

**La autorización del cambio no quedó como la decisión 2.** La base siempre exige una autorización
para registrar el cambio, y no deja que un cajero se autorice solo sin el permiso de devolución (es
el arreglo de seguridad de la 0134). Así que la caja hace esto:

- sin dinero que regresar **y** con el permiso: sin PIN, como pidió Fermín;
- con dinero que regresar: PIN de supervisor, como pidió Fermín;
- sin dinero que regresar **pero sin el permiso**: también PIN. Aquí es donde se aparta de «PIN solo
  si hay dinero que regresar».

Para cumplirlo al pie de la letra habría que dejar que un cajero sin permiso autorice cambios sin
diferencia, y eso reabre el hueco que cerró la 0134. Queda la decisión a Fermín.
