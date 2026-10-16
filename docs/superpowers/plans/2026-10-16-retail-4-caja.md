# Giro RETAIL · Entrega 4: la caja de tienda y su sincronización — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una tienda de ropa venda escaneando en la caja (web e instalada), elija talla y color viendo la
existencia, devuelva parcialmente y haga cambios de talla en un solo flujo, y que las existencias de la caja
instalada suban y bajen con la nube **sin que un restaurante note nada**.

**Architecture:**
- **Base de datos, una migración (0195)** con cuatro secciones:
  - candados que la entrega 1 dejó pendientes (spec §13);
  - la venta de tienda nace sin envío a cocina;
  - la sync de existencias, al estilo de la 0101;
  - `registrar_cambio_talla`, atómica.
- **Escritorio:** baja `producto_existencias` (corrigiendo lo que aún no sube) y sube `movimientos_producto`, como hace hoy con `movimientos_inventario`.
- **POS:** `home-pos.tsx` sigue siendo dueño del carrito, el ticket y el cobro. En una tienda cambia solo el panel izquierdo de la captura por `PanelVentaRetail` (`venta-retail.tsx`: búsqueda, escáner, cuadrícula de padres y selector). Así no se copia la orquestación de cobro de 2,900 líneas (spec §11, «extraer lo compartido en vez de copiarlo»). Devoluciones gana el modo parcial, y el cambio de talla es una pantalla nueva.

**Tech Stack:** PostgreSQL 15 (Supabase) y smokes `.sql`; Next.js/React/Tailwind en `apps/pos` con Vitest; Node (`node --test`) en `desktop/`.

**Spec:** `docs/superpowers/specs/2026-10-15-giro-retail-design.md` §4.4, §5, §7, §8 y §13. **Diseño:** `docs/diseno/pos-retail.md` (manda en todo lo que se ve). **Hechos del código:** `docs/superpowers/plans/anexos/2026-10-16-retail-4-hechos-del-codigo.md` (rutas y líneas verificadas; léelo antes de tu tarea).

## Global Constraints

- **Todo en local hasta el 100 % (Fermín, 15 oct).**
  - Nada de push, PR, producción, `supabase db push`, `functions deploy` ni publicar instaladores.
  - La 0195 se aplica solo al Supabase **local** de Docker (`npx supabase migration up --local`), en la Tarea 13.
- **Ningún restaurante cambia.** Todo lo nuevo en la caja depende de `giro === "RETAIL"`, leído de `tenants.vertical_principal`. Sin ese giro, la pantalla, las devoluciones, el ticket impreso y el inicio quedan idénticos.
- **El pull nunca falla por un dato nuevo** (ADR 0034). Esta entrega no baja `traspasos_producto` ni `movimientos_producto` a la caja. Solo baja `producto_existencias`, y su único enum, el de movimientos, no viaja.
- **RLS sagrado; sin `service_role` en `apps/pos`.** Las funciones nuevas `SECURITY DEFINER` se confinan con `current_tenant_id()` y validan que cada id que entra sea del negocio.
- **Dinero `numeric(12,2)`, cantidades `numeric(12,3)`, `'NaN'` nunca entra.**
- **Diseño:** `docs/diseno/pos-retail.md`, `pos.md` y `nucleo.md`.
  - Controles de 44 px como mínimo; celdas del selector y barra de escaneo de 56 px.
  - Una sola acción azul por pantalla. Tamaños de letra solo de la escala (`pnpm tipografia`).
  - Cargar `ponytail` antes de programar, y `emil-design-eng` antes de escribir marcado o CSS.
- **Sin dependencias nuevas, sin `any`.**
- **Escape:** toda capa nueva se declara en la pila de `home-pos` (`lib/escape.ts`, `lib/use-escape.ts`) o la atiende su `Modal`.
- **Commits:** solo los archivos de la tarea, por nombre. Mensaje + línea en blanco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Antes de crear la migración, confirmar que 0195 sigue libre.

## Decisiones de este plan

1. **La tienda cambia el panel izquierdo, no toda la pantalla** (ver Architecture). Se anota en spec §12 como ajuste a §5.2.
2. **Cambio de talla = devolución parcial + venta nueva**, las dos en efectivo por el valor que regresa: el cajón cuadra solo y solo se mueve la diferencia (`pos-retail.md`, «Cómo queda registrado»).
   - Si la prenda nueva cuesta menos, la diferencia se regresa en efectivo.
   - El cambio pide la misma autorización que una devolución solo cuando hay dinero que regresar.
   - Estas dos son las propuestas de `pos-retail.md` «Por decidir con Fermín»; si Fermín decide otra cosa, cambia solo la Tarea 11.
3. **Ventas para devolver o cambiar:** las del turno, por folio, o escaneando la prenda en las de los últimos 30 días que la llevan. La caja instalada solo ve las suyas.
4. **«Pocas»** = existencia ≤ mínimo de la sucursal; sin mínimo, ≤ 2.
5. **Otras sucursales en el selector:** se leen de `producto_existencias` local (pull). Llevan la hora de `ultimoPull` del escritorio; en el POS web, «al momento».
6. **Fuera de esta entrega:** publicar instalador, liberar RETAIL (entrega 5), probar con una caja real (antes de publicar), devolver ventas de otra caja desde la caja instalada.

## Review Focus

1. **Un restaurante con el escáner USB conectado** teclea en la búsqueda de clientes o en una nota: el detector no existe fuera de la tienda y nunca roba texto de un campo enfocado → prueba en la Tarea 5.
2. **El push llega dos veces** (corte de red a medio ciclo): los movimientos no se duplican y la existencia de la nube no se mueve dos veces → smoke en la Tarea 3.
3. **Pull con movimientos aún sin subir:** la caja no «recupera» piezas ya vendidas → prueba en la Tarea 4.
4. **Cambio de talla con la venta original facturada, ya devuelta o de otro negocio:** se rechaza con mensaje claro y no deja nada a medias → smoke en la Tarea 10.
5. **Producto padre escaneado o tocado como si fuera variante:** nunca llega al ticket (la base lo rechaza con `PRODUCTO_CON_VARIANTES`); la caja abre el selector → prueba en la Tarea 6.

---

### Task 1: Candados pendientes de la entrega 1 (0195 §1)

**Files:**
- Create: `supabase/migrations/0195_caja_tienda.sql` (§1)
- Create: `supabase/scripts/smoke_caja_tienda.sql` (bloque 1)

**Interfaces:**
- Produces:
  - trigger `trg_ticket_items_producto_fijo`: BEFORE UPDATE OF producto_id ON ticket_items. Si el ticket está PAGADO o FACTURADO y `NEW.producto_id IS DISTINCT FROM OLD.producto_id`, levanta `DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado`. No corre en réplica, como todo trigger normal.
  - `movimientos_producto_validar()` redefinida: además de lo que hace hoy (0189:378-391, copiar tal cual), exige que `ticket_id`, `ticket_item_id`, `devolucion_id`, `traspaso_id` y `proveedor_id`, cuando no son nulos, sean del mismo `tenant_id`.
  - `_existencias_sincronizar_ticket` redefinida desde su cuerpo vigente en 0189:417-470, con una sola diferencia: recorre los renglones `ORDER BY producto_id, id`.

- [ ] **Step 1: Smoke que falla** (`smoke_caja_tienda.sql`, bloque 1, fixture propio de dos negocios como `smoke_existencias_admin.sql`):
  - 1a. Cambiar `producto_id` de un renglón de un ticket PAGADO falla con ese mensaje; en ABIERTO sigue pasando.
  - 1b. Un `movimientos_producto` con `ticket_id` de otro negocio falla con `MOVIMIENTO_INVALIDO`.
  - 1c. Cobrar un ticket con dos renglones de existencias sigue generando dos `VENTA` (no cambió el resultado).

- [ ] **Step 2: Correr y ver fallar.** Run: `cd desktop && npm run smokes -- smoke_caja_tienda.sql`. Esperado: falla en 1a.
- [ ] **Step 3: Escribir §1 de la 0195.**
- [ ] **Step 4: Correr `smoke_caja_tienda.sql`, `smoke_existencias_producto.sql` y `smoke_existencias_admin.sql`.** Esperado: los tres en verde.
- [ ] **Step 5: Commit** — `feat(retail): candados del renglón cobrado y de los movimientos (0195 §1)`.

### Task 2: La venta de tienda no va a cocina (0195 §2)

**Files:**
- Modify: `supabase/migrations/0195_caja_tienda.sql` (§2), `supabase/scripts/smoke_caja_tienda.sql` (bloque 2)

**Interfaces:**
- Produces: trigger `trg_tickets_tienda_sin_cocina`, BEFORE INSERT ON tickets. Si el negocio tiene `vertical_principal = 'RETAIL'`, pone `NEW.envio_cocina_automatico := false`. No toca `abrir_ticket` ni ningún enum. El POS no manda nada nuevo.

- [ ] **Step 1: Smoke que falla.**
  - 2a. En un negocio RETAIL (fijado por SQL en el fixture), `abrir_ticket` deja `envio_cocina_automatico = false`, y al cobrarlo `estado_cocina` no pasa a `EN_COCINA`.
  - 2b. En un negocio de restaurante sigue en `true`.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Escribir §2.**
- [ ] **Step 4: Ver pasar** (los tres smokes de la Tarea 1).
- [ ] **Step 5: Commit** — `feat(retail): la venta de tienda nace sin envio a cocina (0195 §2)`.

### Task 3: Sync de existencias en la nube (0195 §3)

**Files:**
- Modify: `supabase/migrations/0195_caja_tienda.sql` (§3), `supabase/scripts/smoke_caja_tienda.sql` (bloque 3)

**Interfaces:**
- Produces:
  - `_vim_aplicar_movimientos_producto(p_tenant uuid, p_movs jsonb) RETURNS jsonb` (`{aplicados int, errores jsonb}`). Copia la forma de `_vim_aplicar_movimientos` (0101:29-115):
    - por renglón, en un bloque con su propia excepción;
    - valida el tenant y el resto lo deja al trigger de validación;
    - `INSERT … ON CONFLICT (id) DO NOTHING`;
    - la existencia la mueve el trigger `movimientos_producto_aplicar`, porque esto corre en modo origin.
    - `SECURITY DEFINER`, `search_path` fijo; REVOKE a PUBLIC, anon y authenticated (solo la llama `sync_push_snapshot`).
  - `sync_push_snapshot` redefinida desde su cuerpo vigente (0187:378-545), con dos cambios. Tras `_vim_aplicar_movimientos_lealtad`, ya en origin, llama `_vim_aplicar_movimientos_producto(p_tenant, p_snapshot->'movimientos_producto')`. Además, `movimientos_producto` entra a la lista de llaves que no van a `_ignoradas`.
  - `sync_pull_snapshot` redefinida desde su cuerpo vigente (0187:274-346), agregando `producto_existencias` de **todas** las sucursales vivas del negocio.
  - No se agrega `catalogo_version`: las existencias no avisan cada minuto, bajan con el pull.

- [ ] **Step 1: Smoke que falla** (bloque 3):
  - 3a. Un snapshot con un `VENTA` de −1 aplica una vez; el mismo snapshot otra vez no duplica ni mueve la existencia (Review Focus 2).
  - 3b. Un movimiento con `producto_id` de otro negocio cae en `errores` y no detiene a los demás.
  - 3c. `sync_pull_snapshot` trae `producto_existencias` de las dos sucursales.
  - 3d. Un ticket subido con su `VENTA` y luego cancelado en la nube (por `cancelar_ticket_pagado`) deja la existencia como estaba antes de la venta. Cubre spec §13: la cancelación en la nube de un ticket de la caja.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Escribir §3.** Diff contra el cuerpo vigente: solo las líneas nuevas.
- [ ] **Step 4: Ver pasar**, junto con `smoke_sync_push.sql`, `smoke_sync_push_completo.sql` y `smoke_sync_inventario.sql`.
- [ ] **Step 5: Commit** — `feat(retail): la nube recibe movimientos de la caja y baja existencias (0195 §3)`.

### Task 4: Sync de existencias en el escritorio

**Files:**
- Modify: `desktop/src/sync-push.mjs`, `desktop/src/sync-pull.mjs`, `desktop/src/main.mjs` (solo lo necesario para `ultimoPull`), `desktop/src/sync-push.test.mjs`, `desktop/src/sync-pull.test.mjs`

**Interfaces:**
- Consumes: Tarea 3.
- Produces:
  - Tabla local `_vim_mov_producto_ok (id uuid primary key)`. Se crea como `_vim_mov_ok` (`sync-push.mjs:148`).
  - `construirSnapshotPush` agrega `movimientos_producto`: los renglones locales que no están en `_vim_mov_producto_ok`, con un tope de 500 por push, en el primer lote igual que `movimientos_inventario`.
  - `marcarMovimientosProductoPushed(ids)` marca solo si la nube no reportó la llave en `_ignoradas` (molde de lealtad, `sync-push.mjs:1030`).
  - `PULL_ORDER` agrega `producto_existencias` después de `productos`.
  - `corregirExistenciasProductoPorPendientes(client)` resta, de lo que bajó, los movimientos locales sin subir. Molde: `corregirExistenciasPorPendientes`, `sync-pull.mjs:396-432`.
  - `/__estado-sync` agrega `ultimoPull: string | null`, la hora ISO del último pull completo.

- [ ] **Step 1: Pruebas que fallan.**
  - `sync-push.test.mjs`: «manda movimientos_producto pendientes y los marca»; «no los marca si la nube ignoró la llave».
  - `sync-pull.test.mjs`: «corrige producto_existencias por movimientos sin subir» (bajó 5, hay un `VENTA` local −1 sin subir → queda 4); Review Focus 3.
- [ ] **Step 2: Ver fallar.** Run: `node --test desktop/src/sync-push.test.mjs desktop/src/sync-pull.test.mjs`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver pasar**, más `node --test desktop/src/*.test.mjs`. Los rojos conocidos de Windows (libuv, EPIPE, EADDRINUSE) se reportan, no se arreglan.
- [ ] **Step 5: Commit** — `feat(retail): la caja sube movimientos de producto y baja existencias`.

### Task 5: Detector del escáner

**Files:**
- Create: `apps/pos/app/lib/escaner.ts`, `apps/pos/app/lib/use-escaner.ts`, `apps/pos/app/lib/__tests__/escaner.test.ts`

**Interfaces:**
- Produces:
  - `crearDetectorEscaner(opts: { umbralMs?: number; minimo?: number }): { tecla(t: { key: string; tiempo: number; enCampoAjeno: boolean }): string | null; reiniciar(): void }`. Es pura y sin DOM. Devuelve el código cuando Enter cierra una ráfaga válida. Por defecto `umbralMs` 35 y `minimo` 6.
  - `useEscaner(alCodigo: (codigo: string) => void, activo: boolean)`. Es un listener de `keydown` en `window` (fase de captura), ignora si `e.defaultPrevented`, y marca `enCampoAjeno` cuando el foco está en un input que no lleva `data-escaner="busqueda"`. Al reconocer un código, `preventDefault()` en el Enter y limpia el campo de búsqueda si la ráfaga cayó ahí.
  - El umbral se puede cambiar con `localStorage["vimpos.escaner.umbralMs"]`, acotado de 20 a 80. Sin pantalla de ajustes en esta entrega.

- [ ] **Step 1: Pruebas que fallan** (`escaner.test.ts`):
  - «ráfaga de 13 dígitos a 10 ms + Enter → código»
  - «tecleo a 120 ms + Enter → null»
  - «5 caracteres + Enter → null»
  - «ráfaga en campo ajeno → null»
  - «pausa a media ráfaga reinicia»
  - «umbral 80 acepta 60 ms»
- [ ] **Step 2: Ver fallar.** Run: `pnpm --filter @vim/pos test -- escaner`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver pasar.**
- [ ] **Step 5: Commit** — `feat(retail): detector de escaner por rafaga`.

### Task 6: Catálogo y existencias de tienda en el POS

**Files:**
- Modify: `apps/pos/app/lib/catalogo.ts` (tipo `Producto` y `listarProductosPos`), `apps/pos/app/lib/turno.ts` (`leerCaja`, `DatosCaja`)
- Create: `apps/pos/app/lib/tienda.ts`, `apps/pos/app/lib/__tests__/tienda.test.ts`

**Interfaces:**
- Produces:
  - `Producto` agrega campos opcionales: `producto_padre_id`, `variante_ejes: string[] | null`, `variante_valores: Record<string,string> | null`, `controla_existencias`, `codigo_barras`, `codigo_interno`. Opcionales para no romper el cache de Dexie.
  - `listarProductosPos` los selecciona. **Para un restaurante la lista final no cambia:** no hay hijas.
  - `DatosCaja.giro: string | null`, de `tenants.vertical_principal`.
  - En `tienda.ts`:
    - `esTienda(caja: DatosCaja | null): boolean`
    - `type Existencia = { producto_id: string; sucursal_id: string; cantidad: number; minimo: number | null }`
    - `leerExistencias(): Promise<Existencia[]>`: todas las sucursales del negocio, paginando con `.range` de 1000 en 1000 y ordenado por `sucursal_id, producto_id`.
    - `estadoExistencia(cantidad: number, minimo: number | null): "normal" | "pocas" | "agotada"`: agotada si ≤ 0; pocas si ≤ mínimo, o ≤ 2 sin mínimo (decisión 4).
    - `type PadreTienda = { padre: Producto; hijas: Producto[]; ejes: string[] }`
    - `agruparTienda(productos: Producto[]): { vitrina: Producto[]; padres: Map<string, PadreTienda> }`: la vitrina son padres y productos sin variantes, nunca hijas.
    - `buscarPorCodigo(productos: Producto[], codigo: string): Producto | null`: exacto, sin mayúsculas ni espacios; primero `codigo_barras`, luego `codigo_interno`; nunca un padre (Review Focus 5).
    - `matrizVariantes(p: PadreTienda, existencias: Existencia[], sucursalId: string): { columnas: string[]; renglones: string[]; celda(col: string, ren: string): { hija: Producto; cantidad: number; estado } | null }`. Con un eje, `renglones = [""]`.
    - `resumenVitrina(p: Producto, padres, existencias, sucursalId): { piezas: number; estado; precioDesde: number | null }`.

- [ ] **Step 1: Pruebas que fallan** (`tienda.test.ts`):
  - `agruparTienda` deja fuera las hijas;
  - `buscarPorCodigo` encuentra por barras con espacios, después por SKU, y nunca devuelve un padre;
  - `estadoExistencia(0,null)` es agotada, `(2,null)` pocas, `(3,null)` normal, `(5,5)` pocas y `(-1,3)` agotada;
  - `matrizVariantes` con 2 ejes pone null en una combinación inexistente; con un eje deja un renglón;
  - `resumenVitrina` suma las hijas y da `precioDesde` solo si los precios difieren.
- [ ] **Step 2: Ver fallar.** Run: `pnpm --filter @vim/pos test -- tienda`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver pasar**, más `pnpm --filter @vim/pos test` completo y `pnpm --filter @vim/pos typecheck`.
- [ ] **Step 5: Commit** — `feat(retail): catalogo, giro y existencias de tienda en el POS`.

### Task 7: Panel de venta de tienda y selector

**Files:**
- Create: `apps/pos/app/components/venta-retail.tsx` (`PanelVentaRetail`), `apps/pos/app/components/selector-variantes.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx` (captura: el panel izquierdo según `esTienda`; capas de Escape)

**Interfaces:**
- Consumes: Tareas 5 y 6; `calcularRejilla`, `calcularBarraCategorias`, `Paginador`, `Modal`, `useHueco`.
- Produces:
  - `PanelVentaRetail(props: { productos: Producto[]; categorias; existencias: Existencia[]; sucursalId: string; sucursales: { id: string; nombre: string }[]; actualizadoA: string | null; cobroAbierto: boolean; onAgregar(p: Producto): void })`. Las capas del selector y del aviso se declaran en la pila de `home-pos`.
  - `SelectorVariantes(props: { padre: PadreTienda; existencias; sucursalId; sucursales; actualizadoA; onElegir(hija: Producto): void; onCerrar(): void; marcada?: string })`. `marcada` es el id de la hija «La que regresa» (Tarea 11).
  - `home-pos.tsx`: cuando `esTienda(caja)` y el modo es PARA_LLEVAR, la captura pinta `PanelVentaRetail` en lugar de `CatalogoProductos`. `onAgregar` usa la misma ruta que `agregarSuelto`, sin combos ni la hoja «¿Lo hacemos combo?». Las existencias se leen al entrar a la venta, tras cada cobro y cada 60 s.

- [ ] **Step 1: Construir según `pos-retail.md`** («La pantalla de venta», «Selector de talla y color», «Escáner»). Puntos que no se dejan a criterio:
  - barra de 56 px con `data-escaner="busqueda"`, sin autofoco;
  - «Todo» como primera categoría;
  - la vitrina sale de `agruparTienda`;
  - un toque en una celda agrega la pieza y cierra el selector;
  - celdas de 56 px; la combinación inexistente se ve deshabilitada con «—»;
  - otras sucursales se muestran en gris, solo para consultar, con «Actualizado a las HH:MM» o «al momento»;
  - un código no encontrado pinta una franja `danger-soft` con «Buscar a mano», con el sonido de error de `public/sonidos/` (si no hay uno, se agrega un wav corto);
  - con el cobro abierto, el escaneo no agrega nada y muestra «Termina el cobro para agregar productos.»;
  - escanear con el selector abierto agrega la pieza y cierra el selector.
- [ ] **Step 2: Verificar.** Run: `pnpm --filter @vim/pos typecheck`, `pnpm --filter @vim/pos test` y `pnpm tipografia`. Esperado: verde. La verificación en navegador es de la Tarea 13.
- [ ] **Step 3: Commit** — `feat(retail): panel de venta de tienda con escaner y selector de talla y color`.

### Task 8: El ticket de tienda (pantalla e impresión)

**Files:**
- Modify:
  - `apps/pos/app/components/sidebar-ticket.tsx`, `apps/pos/app/components/renglon-item.tsx`
  - `apps/pos/app/components/home-pos.tsx` (etiqueta «Venta»; sin comanda al cobrar en una tienda; el último agregado)
  - `apps/pos/app/lib/print/ticket-datos.ts` (seleccionar `producto_sku_snapshot`), `apps/pos/app/lib/print/ticket-builder.ts`, `apps/pos/app/components/recibo-ticket.tsx`
  - `apps/pos/app/lib/accesos-inicio.ts` y `pantalla-inicio.tsx` (el acceso dice «Venta» en una tienda)
- Test: `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`

**Interfaces:**
- Produces:
  - `construirTicketJob` recibe `tienda: boolean` en sus datos. Solo con `tienda` imprime, bajo un renglón con SKU, la línea `"   SKU " + sku`. Un restaurante también tiene `producto_sku_snapshot` (sale de `codigo_interno`), así que la condición es el giro, no la presencia del SKU.
  - `RenglonItem` acepta `detalle?: string` (variante · SKU) y `sinExistencia?: boolean`.

- [ ] **Step 1: Prueba que falla** (`ticket-builder.test.ts`):
  - «tienda: renglón con SKU imprime la línea SKU debajo»;
  - «restaurante con SKU queda igual que antes» (compara contra la salida actual).
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar**, según `pos-retail.md` («El ticket», «Cobro e impresión»):
  - el renglón muestra el nombre del padre, y debajo «M · Negra · POL-M-NEG» en `text-13 ink-2`;
  - marca «Sin existencia» en `warning`;
  - fondo `sel` en el último agregado, sin animación;
  - con el ticket vacío, «Escanea una prenda para empezar» y «Cambio de talla» (`h-14`, fantasma);
  - el modo se llama «Venta»;
  - en una tienda `debeImprimirComandaAlCobrar` no aplica;
  - la cabecera lleva «Cambio de talla».
- [ ] **Step 4: Ver pasar**, más typecheck, pruebas del POS y `pnpm tipografia`.
- [ ] **Step 5: Commit** — `feat(retail): el ticket de tienda enseña e imprime variante y SKU`.

### Task 9: Devoluciones parciales en una tienda

**Files:**
- Modify: `apps/pos/app/lib/devoluciones.ts`, `apps/pos/app/components/pantalla-devoluciones.tsx`
- Test: `apps/pos/app/lib/__tests__/devoluciones.test.ts` (crearlo si no existe)

**Interfaces:**
- Produces:
  - `motivosDevolucion(tienda: boolean)`. Para una tienda: `PRODUCTO_DEFECTUOSO` («Producto defectuoso»), `CLIENTE_NO_SATISFECHO` («No le gustó»), `ERROR_COBRO` y `OTRO`. Sin tienda: la lista de hoy.
  - `type RenglonDevolver = { ticket_item_id: string; cantidad: number; regresaAlAnaquel: boolean }`
  - `devolverRenglones(venta, renglones: RenglonDevolver[], motivo, medio, autorizacion)`: llama `crear_devolucion` con `p_alcance` `'PARCIAL'` (o `'TOTAL'` si son todos completos), `p_items` con `reversar_inventario_item` por renglón y `p_reversar_inventario: true`, y luego `confirmar_devolucion`. La firma de `crear_devolucion` está en 0134:460.
  - `buscarVentasConProducto(productoId: string, dias = 30)` y `buscarVentaPorFolio(folio: string)`: PAGADO/FACTURADO, de este negocio. En la caja, solo lo local.
  - `devolverVenta` de hoy (restaurante) no cambia.

- [ ] **Step 1: Pruebas que fallan**:
  - `motivosDevolucion(true)` no trae `TIEMPO_EXCEDIDO`;
  - el armado de `p_items` pone `reversar_inventario_item: false` en un renglón con `regresaAlAnaquel: false`;
  - `alcance` es TOTAL solo si se devuelve todo completo.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** según `pos-retail.md` («Devoluciones en una tienda»): la elección de renglones y piezas, el total en vivo y «¿Vuelve al anaquel?». Ese interruptor empieza apagado con «Producto defectuoso» y encendido en lo demás; búsqueda por folio y por escaneo. Un restaurante sigue viendo su pantalla como hoy.
- [ ] **Step 4: Ver pasar**, más typecheck, pruebas y tipografía.
- [ ] **Step 5: Commit** — `feat(retail): devoluciones parciales con regreso al anaquel en una tienda`.

### Task 10: `registrar_cambio_talla` (0195 §4)

**Files:**
- Modify: `supabase/migrations/0195_caja_tienda.sql` (§4), `supabase/scripts/smoke_caja_tienda.sql` (bloque 4)

**Interfaces:**
- Produces: `registrar_cambio_talla(p_ticket_origen uuid, p_regresa jsonb, p_lleva jsonb, p_caja_id uuid, p_turno_id uuid, p_usuario_id uuid, p_autorizacion_pin_id uuid, p_usuario_autorizo_id uuid, p_client_id_local varchar) RETURNS jsonb`. Devuelve `{devolucion_id, ticket_id, regresa_mxn, lleva_mxn, diferencia_mxn}`. Es `SECURITY INVOKER` (todo lo que llama ya confina) y transaccional por ser una sola función.
  - `p_regresa = [{ticket_item_id, cantidad}]`; `p_lleva = [{producto_id, cantidad}]`.
  - Rechaza (`DATOS_INVALIDOS`, sin dejar nada) si:
    - el ticket de origen está FACTURADO, no es PAGADO o es de otro negocio;
    - algún renglón no es de ese ticket o excede lo que queda por devolver;
    - `p_lleva` está vacío.
  - Hace:
    1. `crear_devolucion` (PARCIAL o TOTAL, motivo `CAMBIO_TALLA`, medio `EFECTIVO`, `reversar_inventario_item` true) y `confirmar_devolucion`;
    2. `abrir_ticket` PARA_LLEVAR y `agregar_item_a_ticket` por cada renglón de `p_lleva`;
    3. `aplicar_pago(ticket, 'EFECTIVO', least(regresa, total nuevo))` con nota `Cambio de la venta <folio>`.
  - Si la diferencia es ≤ 0, el ticket queda PAGADO; si es > 0, queda ABIERTO con el saldo y la caja abre el cobro de siempre.
  - La autorización se pasa a `crear_devolucion` tal cual (decisión 2: la caja la pide solo si `diferencia_mxn < 0`).

- [ ] **Step 1: Smoke que falla** (bloque 4):
  - 4a. M $349 por G $349: diferencia 0; la existencia de M sube 1 y la de G baja 1; ticket nuevo PAGADO.
  - 4b. Por una prenda de $399: diferencia 50; ticket ABIERTO con saldo 50.
  - 4c. Por una de $299: diferencia −50; ticket PAGADO; la devolución es de $349 en efectivo y el pago de $299, así que en el cajón el neto es −50.
  - 4d. Venta FACTURADA, renglón ajeno, cantidad de más y ticket de otro negocio: los cuatro fallan y no queda devolución ni ticket (Review Focus 4).
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Escribir §4.**
- [ ] **Step 4: Ver pasar**, junto con los smokes de devoluciones existentes (`smoke_devoluciones*.sql`, si existen).
- [ ] **Step 5: Commit** — `feat(retail): cambio de talla atomico (0195 §4)`.

### Task 11: Pantalla «Cambio de talla»

**Files:**
- Create: `apps/pos/app/components/pantalla-cambio-talla.tsx`, `apps/pos/app/lib/cambio-talla.ts`, `apps/pos/app/lib/__tests__/cambio-talla.test.ts`
- Modify: `apps/pos/app/components/home-pos.tsx` (entrada desde la cabecera y desde el ticket vacío; capa de Escape; tras confirmar con saldo, abrir el cobro del ticket nuevo)

**Interfaces:**
- Consumes: Tareas 6, 7 (`SelectorVariantes` con `marcada`), 9 (búsquedas de venta) y 10.
- Produces:
  - `resumenCambio(regresaMxn: number, llevaMxn: number): { diferencia: number; texto: string }`. Textos exactos: «Sin diferencia», «El cliente paga $X» y «Le regresas $X en efectivo», con `X` en el formato de dinero del POS.
  - `registrarCambio(args): Promise<{ ticketId: string; diferencia: number }>` llama la RPC de la Tarea 10.

- [ ] **Step 1: Prueba que falla** (`cambio-talla.test.ts`): `resumenCambio(349,349)`, `(349,399)` y `(349,299)` dan los tres textos, y los montos con centavos se redondean bien (`(349.5, 349.49)`).
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** la pantalla de cuatro pasos según `pos-retail.md` («Cambio de talla»):
  - `Volver` a la izquierda; Escape regresa un paso y, en el paso 1, sale.
  - Escanear la prenda en el paso 1 la deja marcada en el paso 2.
  - El paso 3 abre `SelectorVariantes` del mismo padre, con `marcada`.
  - En el paso 4, el botón dice «Confirmar cambio», o «Cobrar $X» cuando la diferencia es mayor que 0.
  - Una venta facturada muestra el mensaje exacto del diseño.
- [ ] **Step 4: Ver pasar**, más typecheck, pruebas y tipografía.
- [ ] **Step 5: Commit** — `feat(retail): pantalla de cambio de talla`.

### Task 12: Diseño, spec y tipos

**Files:**
- Modify: `docs/diseno/pos-retail.md` (cambia de «propuesta» a lo construido; deja «Por decidir» con lo que Fermín haya contestado), `docs/diseno/pos.md` (una línea que remite a `pos-retail.md`), `docs/superpowers/specs/2026-10-15-giro-retail-design.md` (§12: la decisión 1 de este plan, la 0195, el cambio en efectivo; §13: tachar lo que esta entrega cerró)
- Regenerate: `packages/db/src/database.types.ts`

- [ ] **Step 1: Base local.** `npx supabase migration list --local` debe mostrar **solo** la 0195 pendiente; si no, detente y repórtalo. Luego `npx supabase migration up --local` y `pnpm db:types`, y restaura el bloque `__InternalSupabase` si el CLI lo quita.
- [ ] **Step 2: Documentos** (describir lo que el código hace, leyéndolo).
- [ ] **Step 3: Todo.**

```bash
cd desktop && npm run smokes && cd ..
node --test desktop/src/*.test.mjs
pnpm test:functions
pnpm --filter "./apps/*" -r typecheck
pnpm --filter @vim/pos test
pnpm --filter @vim/admin test
pnpm tipografia
```

Esperado: todo verde; un rojo ajeno se reporta.

- [ ] **Step 4: Commit** — `docs(retail): caja de tienda en el diseno y el spec; tipos con 0195`.

### Task 13: Verificación en el navegador (controlador)

Sin código: la hace quien controla la ejecución, con el POS web del worktree contra el Supabase local. Hace falta una configuración `pos-retail` en `.claude/launch.json` de la raíz, en un puerto libre, como `admin-retail`.

- [ ] Negocio de prueba `99999999-…aa`:
  - poner `vertical_principal = 'RETAIL'` y `existencias = true` **solo durante la prueba**;
  - crear 2 prendas con 2×2 variantes y una sin variantes, con códigos y existencias.
- [ ] Revisar:
  - escanear (teclear una ráfaga con `type` de golpe) agrega y suma;
  - un código desconocido muestra la franja;
  - el selector enseña los números, «pocas», «agotada» y otra sucursal;
  - cobrar no manda comanda, y el ticket en pantalla muestra variante y SKU;
  - devolución parcial con y sin regreso al anaquel;
  - cambio de talla con diferencia 0, positiva y negativa;
  - las existencias en el admin (`admin-retail`) cuadran.
- [ ] Como restaurante (giro de vuelta), la caja se ve igual que en `main`.
- [ ] Limpiar: giro y `existencias` como estaban, y las prendas de prueba borradas (suave).
- [ ] La caja real (instalador) queda para antes de publicar, con Fermín.

## Lo que esta entrega no hace

- Publicar instalador ni subir a producción (regla del 15 oct).
- Liberar RETAIL en el alta y el registro, el sitio y el PDF: entrega 5.
- Devolver o cambiar desde la caja instalada una venta de otra caja o sucursal.
- Bajar `traspasos_producto` o `movimientos_producto` a la caja.
- Pantalla de ajustes del umbral del escáner (solo con `localStorage`).
- El E2E con Playwright de spec §8: el repo no tiene esa infraestructura para las apps. Lo cubre la
  Tarea 13 a mano; montarla es otro trabajo.
- Antes de mezclar todo el giro: aplicar 0188–0195 a producción, desplegar `buscar-clave-sat` y publicar el instalador con 0188–0195 **antes** de liberar RETAIL (spec §7).
