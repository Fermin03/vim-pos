# Hechos del código para la entrega 4 de RETAIL (16 oct 2026)

Levantados leyendo el código de `feat/retail-existencias`. Rutas relativas a la raíz del repo; las
líneas pueden moverse un poco. Si un hecho ya no es cierto, gana el código: dilo en tu reporte.

## POS: cómo se elige la pantalla

- `page.tsx` → `PantallaTurno` (`components/pantalla-turno.tsx:152-162`) siempre pinta `HomePos`. No
  hay rama por giro. **El POS no lee el giro**: `leerCaja` (`lib/turno.ts:46-69`) trae solo
  `tenants(nombre_comercial, logo_url)`; `DatosCaja` (`turno.ts:32-43`) no tiene giro. La columna es
  `tenants.vertical_principal` (`0002_nucleo_comercial.sql:147`).
- Los módulos llegan por `useAcceso().modulos` (`components/banda-acceso.tsx:32-47`, relee cada 60 s;
  en la caja vía `/__directivas`, en la web vía RPC `mi_acceso()`). `moduloActivo` en
  `packages/db/src/operacion.ts:52-55`.
- `HomePos` (`components/home-pos.tsx`, ~2,900 líneas) tiene un `return` por pantalla: cierre :1791,
  inicio :2209, monitor :2274, cuentas por modo :2278, consulta :2528, devoluciones :2532, pedidos
  apps :2539 y la **captura** :2549-2903. Para llevar entra por `onParaLlevar` (:2233-2239).
- Accesos del inicio: `lib/accesos-inicio.ts` (`paraLlevar = moduloActivo(modulos,"mostrador")`).

## POS: venta, cobro, impresión

- Carrito: `useReducer(reducerCarrito)` en :284; reductor en `lib/carrito.ts` (`LineaCarrito` :22-31).
- Persistir: `persistirCarrito()` (:350-361) → `lib/cobro.ts:99-183` (`abrir_ticket`,
  `agregar_item_a_ticket`/`agregar_combo_a_ticket`, `fijar_envio_ticket`, `leerTotales`).
  `abrir_ticket` (0008:1443) no tiene parámetro de envío a cocina.
- Agregar: `onTapProducto` (:762-783) → modificadores / `ofrecerCombo` (:739-760) → `agregarSuelto`.
- Cobro: `iniciarCobro` (:1176-1241), `modalesCobro` (:1859-2073) con `ModalCobro`
  (`modal-cobro.tsx`), RPC `aplicar_pago` (`lib/cobro.ts:280-297`; firma en 0134:1362).
- Al cobrar (`onPagado` :1871-1993): ticket automático solo en PARA_LLEVAR
  (`debeImprimirTicketAlCobrar`, `lib/print/ticket-builder.ts:181-183`); **comanda al cobrar** en
  PARA_LLEVAR con estación dedicada (`debeImprimirComandaAlCobrar`, `comanda-builder.ts:124-126`;
  home-pos :1937-1940).
- Envío a cocina automático: trigger `trg_ticket_auto_enviar_cocina_al_pagar` con
  `envio_cocina_automatico` (default true, 0008:190, 478-498). El cliente no puede escribir esa
  columna (guarda 0133:211-215).
- Renglón impreso: `ticket-builder.ts:97` (`${cantidad}x ${nombre}`), nombre de
  `producto_nombre_snapshot` (`lib/print/ticket-datos.ts`). `producto_sku_snapshot` se llena con
  `codigo_interno` en `agregar_item_a_ticket` (0152:283-318) **para todos los negocios** y hoy nadie
  lo lee. Espejo en pantalla: `recibo-ticket.tsx`.
- El nombre de una variante lo genera la base: padre + valores separados por espacio (0190:53-57).
- Ticket: `SidebarTicket` (`sidebar-ticket.tsx`, ancho `clamp(18rem,26vw,26.25rem)`, Cobrar 60 px),
  `RenglonItem`.

## POS: catálogo

- `recargarCatalogo` (home-pos :523-550) → `listarProductosPos` (`lib/catalogo.ts:29-83`); columnas:
  `id, nombre, descripcion, precio_base_mxn, categoria_id, estado, visible_en_pos, es_combo`. **No**
  carga `producto_padre_id`, `variante_*`, `controla_existencias`, `codigo_barras`, `codigo_interno`.
- Las hijas nacen visibles y ACTIVO (0190:164-168): hoy la cuadrícula las enseñaría todas. Vender un
  padre lo rechaza `trg_ticket_items_no_padre` (`PRODUCTO_CON_VARIANTES`, 0189:272-285).
- Cache de lectura: Dexie `vimpos_outbox.cache`, clave `catalogo:${tenant}:${sucursal}`
  (`lib/catalogo-cache.ts`), solo se usa con error de red.
- Rejilla sin scroll: `lib/rejilla.ts` (`calcularRejilla`, `calcularBarraCategorias`,
  `tamanoNombre`), `components/paginador.tsx`, `lib/usar-hueco.ts`.

## POS: Escape y teclado

- `lib/escape.ts` (`CapaEscape`, `PilaEscape`) y `lib/use-escape.ts` (un listener en `window`,
  ignora `defaultPrevented`). `home-pos` declara sus capas en el `useMemo` de :1642-1711.
- `Modal` (`packages/ui/src/components/modal.tsx:83-112`) escucha en `document` y hace
  `preventDefault`.
- Otros listeners: `pin-keypad.tsx:77-87` y `modal-cobro.tsx:195-205` (dígitos/Enter en `window`,
  ignoran inputs); `pedido-tienda.tsx:170-173` (captura; corta todo menos Tab y Escape);
  `catalogo-productos.tsx:219-225` (flechas).
- No hay código de escáner. Sonido existente: `public/sonidos/pedido-app.wav` (home-pos :1505).

## POS: devoluciones y cancelaciones

- `PantallaDevoluciones` (`components/pantalla-devoluciones.tsx`): ventas del turno
  (`lib/devoluciones.ts:16-47`), siempre TOTAL, y `devolverVenta` (:96-134) manda
  **`p_reversar_inventario: false`** → hoy no regresa existencias.
- `crear_devolucion` (0134:460): `p_ticket_original_id, p_caja_id, p_turno_id, p_alcance, p_motivo,
  p_motivo_texto, p_medio_devolucion, p_autorizacion_pin_id, p_usuario_solicitante_id,
  p_usuario_autorizo_id, p_items jsonb, p_reversar_inventario DEFAULT true, p_cliente_id, p_nota,
  p_client_id_local`. Exige PAGADO/FACTURADO.
- Motivos fijos en `lib/devoluciones.ts:68-80`; `MotivoChips` en `motivo-y-autorizacion.tsx`.
  `CAMBIO_TALLA` existe desde 0188. Medios: `EFECTIVO`, `MISMO_METODO_PAGO`, `VALE_PROXIMA_COMPRA`,
  `CORTESIA_SIN_REEMBOLSO`, `NOTA_CREDITO_CFDI`.
- `cancelar_ticket_pagado` (0134:160-262) crea una devolución TOTAL si devuelve dinero.
- Cambiar el producto de un renglón cobrado: ninguna RPC lo hace (`reemplazar_item_ticket` exige
  BORRADOR/ABIERTO, 0119), pero **ningún candado en la base lo impide**, y el push lo escribe tal cual.

## Existencias en la base (0189)

- `_existencias_sincronizar_ticket` (0189:417-470) bloquea el ticket y recorre renglones **sin orden**.
- Triggers normales (no ALWAYS): `trg_tickets_existencias` (cobro), `trg_ticket_items_existencias`,
  `trg_devoluciones_existencias` (al CONFIRMAR), `trg_cancelaciones_z_existencias`. En la caja corren
  (modo origin); en la nube, el push va en réplica y **no** corren.
- `movimientos_producto_validar` (0189:378-391) solo valida producto y sucursal.
  `movimientos_producto_aplicar` mueve `producto_existencias` en origin.

## Escritorio: sync

- Pull: función `sync-pull` → RPC `sync_pull_snapshot` (vigente: 0187:274-346). No baja
  `producto_existencias`, `movimientos_producto`, `traspasos_producto` ni `proveedores`.
  `desktop/src/sync-pull.mjs`: `PULL_ORDER` (:12-58), réplica (:751), `upsertTabla` usa solo columnas
  locales (:99-150), `soltarClavesProductos` (:571-577, llamado en :805),
  `corregirExistenciasPorPendientes` (:396-432, llamado en :822).
- Push: `desktop/src/sync-push.mjs` → función `sync-push` → RPC `sync_push_snapshot` (vigente:
  0187:378-545). Tablas en réplica `v_tablas` (0187:405-412), luego origin (:462) con
  `_vim_aplicar_movimientos` y `_vim_aplicar_movimientos_lealtad`; llaves extra permitidas en
  `_ignoradas`. En el escritorio: `construirSnapshotPush` (:631-778), `listarPendientes` (:538-592),
  `MAX_MOVIMIENTOS_POR_PUSH = 500`, `_vim_mov_ok` (:148), `marcarMovimientosPushed` (:809-812), y
  el molde «la nube ignoró la llave» de lealtad (:1030-1031).
- Patrón 0101: `0101_sync_inventario.sql` (`_vim_aplicar_movimientos` :29-115), spec
  `docs/superpowers/specs/2026-09-04-sync-inventario-caja-design.md`.
- Ciclo: push cada 10 min, pull 1 de cada 6 (`sync-ciclo.mjs`); sondeo de catálogo cada minuto
  (`catalogo_version()`, 0187:351-374).
- La caja aplica las mismas migraciones (`desktop/src/runtime.mjs:439-457`). El gateway pasa
  `/rest/v1/*` entero a PostgREST local (sin lista de tablas).
- Estado de sync para el POS: `/__estado-sync` (`desktop/src/ui-server.mjs:198`), leído por
  `apps/pos/app/lib/estado-sync.ts` (`ultimaSincronizacion`, sin hora del último pull).

## Pruebas

- POS: Vitest (`apps/pos/vitest.config.ts`, entorno node, `app/**/*.test.ts`); pruebas en
  `apps/pos/app/lib/__tests__/` y `lib/print/__tests__/`.
- Escritorio: `node --test desktop/src/*.test.mjs` (bloques con Postgres real solo en Windows);
  scripts `verify:*` en `desktop/package.json` (no en CI).
- Smokes: `supabase/scripts/smoke_*.sql` con `cd desktop && npm run smokes -- <archivo>` (nombre de
  archivo pelón).
- No hay Playwright para las apps.
