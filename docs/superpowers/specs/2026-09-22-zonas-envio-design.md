# Zonas de envío con cargo por zona — diseño

**Fecha:** 2026-09-22 · **Decisión:** ADR 0017 «el envío es un renglón, no una columna» — se
escribe durante la implementación, en `docs/decisiones/`. ·
**Antecedentes:** motor de totales (`supabase/migrations/0008_operacion_venta.sql` §8.1
`recalcular_totales_ticket`), conceptos del CFDI
(`supabase/functions/_shared/pac/conceptos.ts`), CRM de domicilios
(`apps/pos/app/lib/clientes-domicilio.ts`, `apps/pos/app/components/modal-cliente-domicilio.tsx`),
catálogo de repartidores (`0078_catalogo_repartidores.sql`) y su subida al push
(`0114_delivery_viaje.sql` §4.3), asignación por viaje (ADR 0016).

## 1. Problema

El POS entrega a domicilio **gratis**. No existe el concepto de cargo de envío: un
`DELIVERY_PROPIO` cuesta exactamente lo mismo que un pick-up, aunque el repartidor cruce la
ciudad.

Los negocios no cobran así. Cobran por distancia y la expresan en zonas: el centro sin cargo, la
colonia de allá $35, el fraccionamiento del otro lado $50. Hoy la única forma de meter ese dinero
al ticket es dar de alta un producto trucado en el catálogo —"Envío $35"— con tres efectos malos:
ensucia el menú del cajero, se imprime en la comanda como si fuera un platillo, y se cuenta como
comida vendida en los reportes de producto. Y como el cargo no es uno solo, serían varios
productos trucados.

Falta además el paso previo: **nadie sabe en qué zona vive el cliente**. La dirección se captura
como texto libre (calle, número, colonia) y el cajero decide de memoria cuánto cobrar, si es que
cobra.

## 2. Alcance

**Entra:**

1. Migración `0116_zonas_envio.sql`: tabla `zonas_envio`, `zona_envio_id` en
   `direcciones_cliente` y `tickets`, `cargo_tipo` en `ticket_items`, RPC `fijar_envio_ticket`,
   y el catálogo añadido a los dos sentidos del sync (§4). *(Se numeró 0116 y no 0115: la rama
   `fix/mesas-huerfanas` reclamó el 0115 primero con su propia migración.)*
2. Caja: selector de zona y alta de zona en el modal de domicilio (§5).
3. Caja: el envío en el carrito, en el ticket lateral y en la persistencia del ticket (§6).
4. Cocina: el cargo no viaja al KDS ni a la comanda (§8).
5. Cuentas reabiertas: reconstrucción del carrito sin duplicar el envío (§9).
6. Admin: CRUD de zonas por sucursal (§10).
7. Escritorio y sync (§11).
8. Pruebas (§12).

**No entra:** asignar la zona automáticamente por código postal, colonia o mapa —el cajero la
elige—; cobro por distancia calculada; pedidos de apps de delivery (§13); pagarle el envío al
repartidor o descontarlo de su liquidación (eso es liquidación, no venta); reportes nuevos en el
admin más allá de dejar el dato listo (`tickets.zona_envio_id`); zonas con precio por horario o
por monto mínimo de compra.

## 3. Invariantes

- **El envío es un renglón del ticket.** No una columna de `tickets` al estilo `propina_mxn`. Los
  totales salen *solo* de `ticket_items` (§8.1 de la 0008) y `armarConceptos` **truena a
  propósito** si los conceptos del CFDI no suman `tickets.total_mxn`. Un cargo fuera de los
  renglones sería un ticket que no se puede facturar. Como renglón, todo lo demás —totales,
  ticket impreso, CFDI, factura global, reportes, sync— funciona sin tocarse.
- **La zona vive en la dirección; el dinero, en el ticket.** La dirección recuerda a qué zona
  pertenece; el ticket congela cuánto se cobró. Cambiar el precio de una zona mañana no altera
  ninguna venta de ayer.
- **Un ticket tiene a lo sumo un renglón de envío vivo.** Garantizado por índice único parcial,
  no por disciplina del que llama.
- **El envío no es comida.** No va a cocina, no consume inventario, no admite modificadores ni
  promociones, y no cuenta como producto vendido.
- **El envío queda fuera de todo descuento o promoción de ticket** (decisión de Fermín). Un 10% de
  descuento rebaja la comida; el envío se cobra completo. En concreto:
  - La base de `aplicar_descuento_manual` a nivel ticket (porcentaje, monto fijo —topado en la
    comida— y cortesía) y la de `aplicar_promocion` (porcentaje, monto fijo, cortesía y precio
    especial) es el total **menos** los renglones con `cargo_tipo`.
  - `evaluar_promociones_aplicables` no cuenta el envío ni para el monto previsto ni para alcanzar
    `condiciones.monto_ticket.minimo_mxn`: $240 de comida + $35 de envío no alcanzan un mínimo de
    $250.
  - Descontar **el propio renglón** de envío (descuento de ítem o cambio de precio) se rechaza;
    quitar el envío sí se puede, quitando la zona.
  - En el CFDI, `armarConceptos` reparte el descuento de ticket solo entre los renglones de
    producto: el concepto de envío sale con descuento 0.
  - La vista previa del POS (`previewDescuento`) calcula sobre la misma base que la BD.
- **Solo `DELIVERY_PROPIO`.** Cualquier otro modo de servicio rechaza el cargo.
- **El envío sigue la política fiscal del ticket.** Hereda `iva_incluido_en_precio` y la tasa del
  primer renglón, no una constante.

## 4. Datos — migración `0116_zonas_envio.sql`

> Confirmar que `0116` sigue libre al crear el archivo: hay ramas abiertas que pueden haber
> tomado el número (trampa conocida, ADR 0014). Y aplicarla a producción **antes** de mezclar.

### 4.1 `zonas_envio`

Misma forma que `repartidores` (0078), que es el precedente exacto: catálogo chico, se da de alta
desde la caja y se administra en el panel.

```sql
CREATE TABLE zonas_envio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre      varchar(60) NOT NULL,
  costo_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mxn >= 0),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

CREATE UNIQUE INDEX zona_envio_nombre_uq
  ON zonas_envio (sucursal_id, lower(btrim(nombre))) WHERE deleted_at IS NULL;
CREATE INDEX idx_zonas_envio_sucursal
  ON zonas_envio (sucursal_id) WHERE deleted_at IS NULL AND activa;
```

`costo_mxn = 0` es válido y es el caso de la zona centro: existe para poder decir "este domicilio
no paga envío", que no es lo mismo que "no tiene zona".

`sucursal_id` y no solo `tenant_id`: las colonias de León no le sirven a una sucursal en otra
ciudad. Hoy Knock-Out tiene una sola y la diferencia no se nota; el día que abra la segunda, sí.

RLS igual que `repartidores`: `GRANT` explícito a `authenticated, service_role` (no por default
privileges, ver 0065) y políticas `SELECT/INSERT/UPDATE/DELETE` contra `current_tenant_id()`.

### 4.2 `zona_envio_id` en `direcciones_cliente` y en `tickets`

```sql
ALTER TABLE direcciones_cliente ADD COLUMN zona_envio_id uuid NULL REFERENCES zonas_envio(id);
ALTER TABLE tickets             ADD COLUMN zona_envio_id uuid NULL REFERENCES zonas_envio(id);
```

La de la dirección es la memoria: la próxima vez que ese cliente pida, la zona sale sola. La del
ticket es el reporte: agrupar ventas por zona con un `group by` honesto en vez de parsear el
nombre del renglón.

### 4.3 `cargo_tipo` en `ticket_items`

```sql
ALTER TABLE ticket_items
  ADD COLUMN cargo_tipo varchar(20) NULL CHECK (cargo_tipo IN ('ENVIO'));

CREATE UNIQUE INDEX ticket_envio_unico
  ON ticket_items (ticket_id) WHERE cargo_tipo = 'ENVIO' AND cancelado = false;
```

Hace falta una marca explícita: `producto_id` ya es nulo para los renglones cuyo producto se
borró del catálogo (FK blanda, `0008_operacion_venta.sql`:547), así que "sin producto" no
significa "es un cargo".

El `varchar` con `CHECK` en lugar de un `ENUM` nuevo: un solo valor hoy, y si mañana hay
`'SERVICIO'` o `'EMPAQUE'` se amplía el check sin un `ALTER TYPE` en producción.

### 4.4 RPC `fijar_envio_ticket(p_ticket_id uuid, p_zona_id uuid)`

Punto único por el que entra y sale el cargo. Devuelve el `id` del renglón (o `NULL` si se quitó).

Reglas:

1. El ticket debe existir y estar en `BORRADOR` o `ABIERTO`. Un ticket cobrado no cambia de
   precio: para eso están devoluciones.
2. `tickets.modo_servicio` debe ser `DELIVERY_PROPIO`. Si no, `RAISE EXCEPTION`.
3. `p_zona_id IS NULL` → **borra** el renglón de envío vivo (si lo hay) y pone
   `tickets.zona_envio_id = NULL`. Se borra, no se cancela: un cargo retirado antes de cobrar no
   es una venta cancelada y no debe aparecer en los reportes de cancelaciones. El trigger
   `AFTER INSERT OR UPDATE OR DELETE ON ticket_items` (`0008`:696) recalcula solo.
4. Con zona: si ya hay renglón de envío, se **actualiza** (nombre, precio, `zona_envio_id`); si
   no, se **inserta**. Nunca dos.
5. Snapshot del renglón insertado:
   - `producto_id = NULL`, `cargo_tipo = 'ENVIO'`, `cantidad = 1`
   - `producto_nombre_snapshot = 'Envío · ' || zona.nombre`
   - `precio_unitario_snapshot = zona.costo_mxn`
   - `tasa_iva_snapshot` e `iva_incluido_en_precio_snapshot`: **heredados del primer renglón no
     cancelado del ticket**; si el ticket no tiene renglones, `16.00` e incluido. Una constante
     rompería a cualquier tenant que facture con IVA por afuera.
   - `clave_sat_snapshot` y `unidad_sat_snapshot` en `NULL`: el armador del CFDI cae a
     `CLAVE_SAT_POR_DEFECTO` (`90101500`, servicios de restaurantes) y `E48`. Es la decisión de
     Fermín: el envío va como una línea más, sin clave ni trato fiscal especial.
   - `orden_visualizacion = MAX + 1` → queda al final del ticket, después de la comida.
6. Escribe `tickets.zona_envio_id`.
7. La zona debe ser del mismo tenant, estar viva y activa, y pertenecer a la sucursal del ticket.

Una zona con `costo_mxn = 0` **no** inserta renglón: fija `tickets.zona_envio_id` (la zona queda
registrada para reportes) y, si existía un renglón de una zona anterior que sí cobraba, lo borra.
Devuelve `NULL`. *(Corregido en la revisión final de la rama: la versión anterior insertaba
"Envío · Centro $0.00". Un renglón suelto sin dinero sale al CFDI como concepto de base 0 —
`armarConceptos` solo pliega los renglones sin dinero que son hijos de combo— y el Anexo 20 exige
base > 0: ese ticket no se podría facturar. No insertar el renglón evita tocar el CFDI y las Edge
Functions en producción.)* Al reabrir la cuenta, el POS reconstruye la zona gratis desde
`tickets.zona_envio_id` (`envioReconstruido` en `cuenta-mesa.ts`), para que siga visible a $0.

La función es `SECURITY DEFINER` con `search_path` fijo y guarda de tenant explícita: como invoker,
la política `ticket_items_delete` (solo tickets en `BORRADOR`) hacía que quitar el envío de un
ticket `ABIERTO` afectara cero filas sin error. Cada escritura comprueba sus filas afectadas.

### 4.5 El catálogo viaja en los dos sentidos

Zonas creadas en la caja tienen que subir; zonas editadas en el panel tienen que bajar. Es
exactamente el caso de `repartidores` en la 0114, y se copia:

- **Baja:** `sync_pull_snapshot` (última versión en `0111_combos.sql`:602) gana la línea
  `'zonas_envio'` filtrada por `tenant_id`.
- **Sube:** `sync_push_snapshot` (`0114_delivery_viaje.sql`:162) gana `'zonas_envio'` al
  **principio** de `v_tablas` —el array está ordenado por dependencia y `tickets.zona_envio_id`
  apunta a ella— y la comprobación final que rechaza tablas no declaradas la acepta.

`direcciones_cliente` **no sincroniza hoy** (ni sube ni baja), así que la zona pegada a la
dirección vive solo en la caja. Es el estado actual de los clientes de domicilio y no lo cambia
esta entrega; el reporte por zona en la nube se apoya en `tickets.zona_envio_id`, que sí sube con
su ticket. Queda anotado en §14.

## 5. La caja — el modal de domicilio

`apps/pos/app/components/modal-cliente-domicilio.tsx` y `apps/pos/app/lib/clientes-domicilio.ts`.

### 5.1 El botón `Zona:`

En `CamposDireccion`, debajo de *Colonia* (aplica igual al alta de cliente nuevo y al alta de
dirección alterna): una fila `Zona:` con las zonas activas como chips —mismo estilo que los chips
de *Etiqueta*, que ya están ahí— mostrando nombre y costo: `Centro · $0` · `Zona 2 · $35`.

La zona elegida se guarda en `direcciones_cliente.zona_envio_id` junto con el resto de la
dirección, en el mismo `insert` de `agregarDireccionCliente()`.

### 5.2 Crear una zona en sitio

Al final de los chips, un **`＋`**. Abre un mini-formulario en línea (nombre + costo) dentro del
mismo modal; al guardar inserta en `zonas_envio` y deja la zona nueva seleccionada. Sin PIN:
cualquier cajero puede darla de alta, igual que da de alta un repartidor
(`apps/pos/app/lib/delivery.ts`:149). El caso real es un pedido de una colonia que nadie había
capturado, a las once de la noche, con el cliente esperando en el teléfono.

Nueva lib `apps/pos/app/lib/zonas-envio.ts`: `listarZonas`, `crearZona`, `cambiarCostoZona`.

### 5.3 Cambiar el precio pide PIN

Cada chip lleva un lápiz discreto que abre el cambio de costo. Eso **sí** pasa por
`ModalAutorizacionPin` (`apps/pos/app/components/modal-autorizacion-pin.tsx`) con
`accion: "editar_zona_envio"` y `permisoCodigo: "descuento.override_precio"` — el permiso que ya
existe para alterar un precio en el mostrador y que ya tienen los roles que autorizan descuentos.
No se siembra un permiso nuevo: quien puede autorizar un override de precio es exactamente quien
debe poder mover el precio del envío, y la autorización queda registrada en `autorizaciones_pin`
como cualquier otra.

Crear es libre; **editar precios, no**. Dar de alta "Las Joyas $40" no toca ninguna venta
anterior; bajarle el precio a la zona que usa el 80% de los pedidos, sí.

### 5.4 Direcciones viejas sin zona

Todas las direcciones registradas antes de esta entrega tienen `zona_envio_id = NULL`. Regla:

- Si el negocio **no tiene zonas activas**, no se pide nada y no hay envío. El POS se comporta
  como hoy. Nadie tiene que configurar nada para seguir trabajando.
- Si **sí tiene zonas** y la dirección elegida no trae ninguna, al seleccionarla el modal pide la
  zona antes de continuar, y la guarda en la dirección. El catálogo se llena solo, pedido a
  pedido.

## 6. El carrito y el ticket lateral

`apps/pos/app/lib/carrito.ts`:

- `EstadoCarrito` gana `envio?: { zonaId: string; nombre: string; costoMxn: number } | null`.
- Acción nueva `{ tipo: "zona", envio }`. La acción `modo` ya limpia el cliente al salir de
  domicilio; limpia también el envío.
- `calcularTotalesDisplay(lineas, tasaIva, envioMxn = 0)` — tercer parámetro opcional, para no
  tocar las llamadas existentes ni sus pruebas.

`apps/pos/app/components/sidebar-ticket.tsx`: el envío se pinta **abajo de los renglones y antes
de los totales**, con su nombre de zona y su importe, y es *tocable*: abre el selector de zona
para cambiarla **solo en este pedido** (no reescribe la dirección del cliente). Quitarla ahí deja
el pedido sin envío.

Ojo con la asimetría: antes de cobrar el envío **no** es una línea del carrito —vive en
`estado.envio` y se pinta aparte—, y después de cobrar **sí** es un renglón en la BD. El carrito
es una intención; el ticket, un hecho. `fijar_envio_ticket` es el punto donde una se vuelve el
otro.

`apps/pos/app/lib/cobro.ts` → `persistirTicket()`: después del bucle de renglones y antes de
`leerTotales()`, si hay envío llama a `fijar_envio_ticket`. El orden importa: la RPC hereda la
política de IVA del primer renglón, así que los renglones tienen que existir ya.

## 7. Cobro, ticket impreso y factura

Nada que hacer, y ese es justo el punto del diseño:

- **Totales:** el trigger de `ticket_items` llama a `recalcular_totales_ticket`, que suma el
  renglón como cualquier otro. `total_mxn` ya trae el envío; `monto_pendiente_mxn` es generada.
- **Ticket impreso:** `apps/pos/app/lib/print/ticket-datos.ts` lee los renglones de la BD, así
  que el envío se imprime solo, al final de la lista.
- **CFDI:** `timbrar-cfdi` arma conceptos desde `ticket_items` y valida contra `total_mxn`.
  Cuadra por construcción. El envío aparece como una línea más con la clave genérica del giro.
  Única excepción al "nada que hacer": el reparto del descuento de ticket excluye los renglones
  con `cargo_tipo` (§3), así que `timbrar-cfdi`, `timbrar-global` y `autofacturar` leen
  `cargo_tipo` y **se redespliegan junto con la migración**.
- **Factura global y cancelación:** se apoyan en los mismos totales. Sin cambios.

## 8. Cocina: el envío no va

- `packages/kds-core/src/comandas.ts` → `leerComandas()`: añadir `cargo_tipo` al `select` y
  descartar los renglones con cargo al mapear. Sin esto, a la pantalla de cocina le llega
  "Envío · Zona 2" como si fuera un platillo que hay que preparar.
- `apps/pos/app/lib/print/comanda-builder.ts`: mismo filtro para la comanda impresa.
- **Inventario:** no hay nada que hacer. El descuento de insumos (`0101_sync_inventario.sql`:316)
  une contra `recetas.producto_id`, y un renglón con `producto_id NULL` no une con nada.
- **Promociones y descuentos:** comprobado en la implementación: sí descontaban sobre el envío
  (la base era `total_mxn`, con envío, en los tres caminos). La 0116 redefine
  `aplicar_descuento_manual`, `aplicar_promocion` y `evaluar_promociones_aplicables` para
  excluir `cargo_tipo IS NOT NULL` de su base; ver §3. Cubierto por el bloque 6 de
  `smoke_envio.sql`.

## 9. Cuentas reabiertas

`apps/pos/app/lib/cuenta-mesa.ts` → `reconstruirCarrito()` arma el carrito desde `ticket_items`.
Debe pedir `cargo_tipo`, **sacar** el renglón de envío de las líneas y devolverlo aparte como
`envio`, para que la pantalla lo muestre en su sitio y no lo trate como un producto fantasma (hoy
lo descartaría en silencio al no encontrar su producto en el catálogo, y el cajero vería el total
con envío sin saber de dónde sale).

Un domicilio con cuenta abierta al que se le agregan productos después conserva su renglón de
envío: `fijar_envio_ticket` es idempotente y el índice único impide el duplicado.

## 10. El admin

Página nueva `apps/admin/app/(panel)/configuracion/envios/page.tsx` + lib
`apps/admin/app/lib/zonas-envio.ts`. Tabla simple por sucursal: nombre, costo, activa, orden;
alta, edición y baja lógica (`deleted_at`). Sigue el patrón de `configuracion/propinas` y de
`usuarios/repartidores`.

Desactivar una zona la saca de los chips de la caja; las direcciones que la tenían conservan el
`zona_envio_id` y el modal pedirá zona de nuevo la próxima vez (§5.4).

## 11. Escritorio y sync

- `desktop/src/sync-pull.mjs` → `PULL_ORDER`: `{ t: "zonas_envio" }` después de `sucursales`
  (su FK) y antes de lo demás.
- `desktop/src/sync-push.mjs` → `construirSnapshotPush`: `'zonas_envio'` con el patrón
  `_vim_zonas_ok` — tabla local de control, se mandan las que la nube aún no confirmó, y una
  siembra única (`siembra_zonas_0116`, espejo de `siembra_repartidores_0114`) que marca como ya
  subidas las que bajaron del pull, para que una caja recién actualizada no reenvíe el catálogo
  entero. *(Revisión final de la rama: la libreta va por **huella**, como `_vim_turnos_ok` —
  `md5(to_jsonb(x))` anotada al subir y al bajar del pull—; una zona sube si no está anotada o si
  su huella cambió. Con "una vez por id" un repreciado autorizado con PIN en la caja nunca subía y
  el siguiente pull lo revertía. **ARREGLADO (22 sep):** ese primer arreglo por huella dejaba un
  residual — `pullSnapshot` upseteaba TODAS las zonas de la nube sin mirar la libreta, así que un
  repreciado local pendiente sobrevivía solo hasta el SIGUIENTE pull, que lo pisaba con el precio
  viejo en silencio y, al anotar la huella de la nube, lo dejaba sin volver a subir jamás. Ahora
  `pullSnapshot` (`sync-pull.mjs` → `separarZonasPendientes`) descarta antes del upsert las filas
  entrantes cuya copia local tiene la huella cambiada y no las marca en `_vim_zonas_ok`: el cambio
  sobrevive hasta que el push lo suba. Reusa `ZONA_EDITADA_LOCAL`, exportada desde
  `sync-push.mjs`.)*
- `sync-pull.mjs` → `CLAVES_NATURALES`: `zonas_envio` con clave natural
  `(sucursal_id, lower(btrim(nombre)))` entre filas vivas. Si la caja creó "Centro" sin conexión y
  el panel otro "Centro", la zona local se borra para que entre la de la nube, **reapuntando antes**
  `tickets.zona_envio_id` y `direcciones_cliente.zona_envio_id` al id de la nube. Sin esto el pull
  chocaba con `zona_envio_nombre_uq` y hacía ROLLBACK de todo, en cada ciclo.
- Las columnas nuevas de `tickets` y `ticket_items` viajan solas: el push serializa con
  `to_jsonb(x)` y el pull descubre columnas por `information_schema`.

## 12. Pruebas

### 12.1 Smokes `.sql` (bloquean el merge, job `rls-tests`)

Nuevo `supabase/scripts/smoke_envio.sql`, al estilo de `smoke_venta.sql`. Corre con
`npm run smokes -- smoke_envio.sql` desde `desktop/`, sin Docker.

1. Ticket `DELIVERY_PROPIO` con dos productos → `fijar_envio_ticket` con una zona de $35 →
   `total_mxn` sube exactamente $35.00.
2. **La invariante que protege el timbrado:** `SUM(total_item_mxn)` de los renglones vivos =
   `tickets.total_mxn`. Es lo que valida `armarConceptos`; si un día alguien mete el cargo por
   fuera, este smoke se pone rojo antes que el PAC.
3. Cambiar de zona ($35 → $50) → el total cambia y sigue habiendo **un** renglón de envío.
4. `fijar_envio_ticket(ticket, NULL)` → el renglón desaparece y el total vuelve al original.
5. Zona con `costo_mxn = 0` → hay renglón, el total no cambia.
6. Ticket `COMER_AQUI` → `RAISE EXCEPTION`.
7. Ticket `PAGADO` → `RAISE EXCEPTION`.
8. Dos renglones `ENVIO` vivos en el mismo ticket → el índice único los rechaza.
9. El IVA se hereda: ticket con renglones `iva_incluido = false` → el renglón de envío nace con
   `iva_incluido = false` y su IVA se suma por afuera.

Sin `CURRENT_DATE` contra fechas de negocio: el servidor es UTC y el sistema calcula en hora de
México; los smokes que lo mezclan se ponen rojos seis horas al día.

### 12.2 Unitarias

- `apps/pos/app/lib/__tests__/carrito.test.ts`: `calcularTotalesDisplay` con envío, y que el
  cambio de modo de servicio lo limpie.
- `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`: el renglón de envío se imprime.
- `apps/pos/app/lib/print/__tests__/comanda-builder.test.ts`: el renglón de envío **no** se
  imprime.
- `apps/pos/app/lib/__tests__/kds.test.ts`: la comanda del KDS ignora los cargos.
- `desktop/src/sync-push.test.mjs`: `zonas_envio` entra al snapshot y la siembra no reenvía.

### 12.3 A mano, antes de publicar

Pedido a domicilio de Zona 2 en la caja instalada → cobrar → el ticket impreso trae la línea de
envío y el total cuadra → facturar ese ticket desde el portal → el CFDI timbra y el PDF muestra el
renglón. Un pedido sin zona y un pedido de zona $0 en el mismo turno, para ver el corte.

## 13. Pedidos de apps de delivery

No se tocan. Uber y DiDi cobran su propio envío al cliente final y liquidan aparte; meterles un
cargo de zona sería cobrarlo dos veces. La RPC ni siquiera los alcanza: sus tickets no son
`DELIVERY_PROPIO`.

## 14. Riesgos abiertos

- **La zona de la dirección no llega a la nube.** `clientes` y `direcciones_cliente` no viajan en
  el sync (ni suben ni bajan, `desktop/src/sync-push.mjs`:356). La memoria de zonas por domicilio
  vive en la caja; si se reinstala sin respaldo, se pierde y se vuelve a llenar pidiendo la zona.
  El reporte por zona no depende de esto: usa `tickets.zona_envio_id`.
- **Orden de despliegue.** Migración a producción primero, instalador después. Una caja con el POS
  nuevo contra una base sin `0116` falla al fijar el envío; al revés (base migrada, caja vieja) es
  inocuo: baja el catálogo de zonas y no lo usa.
- **Cambiar el precio de una zona no reprecia nada.** Es lo correcto —el renglón es un snapshot—
  pero conviene decirlo en el admin con una nota, porque la expectativa natural del dueño es que
  "el precio de la zona" sea un dato vivo.
- **Promoción de ticket completo sobre el envío.** Resuelto (§3, §8): sí lo rebajaba, y ya no.
  Queda un hueco menor: un descuento de ticket se congela al aplicarse, así que si después se
  cancela la comida, el monto congelado puede comerse el envío en `recalcular_totales_ticket`.
  El CFDI no lo timbra (`armarConceptos` rechaza un descuento de ticket sin comida sobre la cual
  repartirse) y el caso se investiga.
