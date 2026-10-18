# Giro RETAIL · Entrega 5 (abrir a la venta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el giro RETAIL listo para venderse: cerrar R13 (el cambio de talla no suma lealtad, y su venta se puede reabrir y cambiar de pago sin descuadrar el cajón), abrir RETAIL en el registro y en /platform, adaptar la primera vez del admin y escribir la migración que libera el giro.

**Architecture:** Cuatro migraciones nuevas (0200–0203), todas aplicadas **solo al Supabase local de Docker**. La 0203, la que libera RETAIL en `cambiar_giro`, se escribe y se prueba ahora, pero en el lanzamiento va **después** del instalador (spec §7). Del lado de las apps: Transacciones de la tienda gana «Reabrir» y «Cambiar pago», las listas de giros aprenden RETAIL, y la primera vez del admin habla de tienda cuando el giro es RETAIL.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql` (`cd desktop && npm run smokes -- <archivo>`), pgTAP (`supabase/tests`), Next.js + Vitest (`apps/pos`, `apps/admin`, `apps/platform`), Deno (`supabase/functions`).

**Spec:** `docs/superpowers/specs/2026-10-15-giro-retail-design.md` (§4.5, §7, §9 fila 5, §13 «Decisiones de Fermín, 18 oct»). Diseño de la caja: `docs/diseno/pos-retail.md`.

## Global Constraints

- **Todo en local** (Fermín, 15 y 18 oct): sin push, PR, merge, `supabase db push`, `functions deploy` ni instalador. Nada sale a producción hasta que estén **todos** los giros de retail.
- Rama `feat/retail-abrir`, creada encima de `feat/retail-caja` (HEAD 5ac8c438), en el worktree `vim-pos-retail`.
- Migraciones aditivas: 0188–0199 ya están aplicadas en el Docker local, así que **no se editan**. Cada migración nueva se aplica al Docker local con `docker exec -i supabase_db_vim-pos psql -U postgres -v ON_ERROR_STOP=1 < <archivo>` y se registra en `supabase_migrations.schema_migrations (version, name)`.
- Una función `SECURITY INVOKER` que llame a una ayudante necesita que `authenticated` pueda ejecutar esa ayudante. La prueba `supabase/tests/0040_invoker_sin_permiso.test.sql` debe seguir en verde: córrela con `docker exec -i supabase_db_vim-pos psql -U postgres -At < supabase/tests/0040_invoker_sin_permiso.test.sql`.
- Se mantienen R5 de la entrega 4 (Fermín: «así») y los candados de la 0196 sobre la venta abierta de un cambio (renglones, descuentos, borrar).
- Etiqueta del giro en pantallas y correos: **«Tienda de ropa o calzado»** (la de `packages/db/src/operacion.ts:19`).
- Antes de escribir código, cargar la skill `ponytail`. Dominio en español, sin `any`, dinero nunca en float.
- Suites que no se pueden romper: smokes 98/98 (más los nuevos), `pnpm --filter @vim/pos test`, `pnpm --filter @vim/admin test`, `pnpm --filter @vim/platform test`, `typecheck` de cada app y `pnpm tipografia`.

## Review Focus

1. **Reabrir un cambio cuya prenda nueva costó igual o menos.** El pago interno cubre todo y el saldo queda en $0. La caja debe poder volver a cerrarlo sin pedir dinero, y el cajón no debe cambiar. → Task 2 (smoke 6c) y Task 3 (cobro con saldo 0).
2. **El cambio de un cambio.** Una venta que ya fue un cambio vuelve a cambiarse de talla: lealtad, pago interno y efectivo esperado deben cuadrar igual que en el primero. → Task 1 (smoke 6b).
3. **La caja instalada sube un cambio reabierto.** El push aplica las filas en modo réplica, sin disparadores. El pago interno debe llegar vivo y la nube calcular el mismo efectivo esperado. → Task 2 (smoke 6e).
4. **Cambiar el pago cuando el saldo se pagó dividido.** Con dos pagos reales, debe rechazarse como hoy, con «pago dividido», y no tocar el pago interno. → Task 2 (smoke 6d).
5. **Cancelar un cambio que nunca ganó puntos.** Revertir lealtad debe ser un no-op y no dejar movimientos en negativo. → Task 1 (smoke 6a).

---

### Task 1: Un cambio de talla no suma ni resta lealtad, ni lleva promociones (0200)

**Files:**
- Create: `supabase/migrations/0200_cambio_sin_lealtad.sql`
- Modify: `supabase/scripts/smoke_caja_tienda.sql` (sección nueva §6, al final, antes de `ROLLBACK`)

**Interfaces:**
- Produces: `_ticket_es_de_cambio(p_ticket uuid) RETURNS boolean`. Es SQL STABLE SECURITY DEFINER, con `EXECUTE` para `authenticated` y el mismo `search_path` que `_ticket_de_cambio_abierto`. Es la condición de la 0196 §1 **sin** el filtro de `estado_fiscal`. La usan la Task 2 y la Task 3.

- [ ] **Step 1: Escribir los smokes que fallan (§6a, §6b, §6f en `smoke_caja_tienda.sql`)**

  Sigue el patrón de §4/§5 del mismo archivo (semilla `99999999-…`, María, JWT con `set_config`). Usa un cliente con programa de lealtad activo; copia la preparación de `smoke_lealtad_ganar.sql`.
  - **6a:** una venta pagada gana puntos. Su cambio de talla (lleva = regresa + 50, cobrar el saldo) no deja ningún `lealtad_movimientos` de tipo ganado para el ticket nuevo, **y** el saldo de puntos del cliente es igual al de antes del cambio. Esto prueba que la devolución CAMBIO_TALLA no revierte. Después se cancela la venta del cambio con `cancelar_ticket_pagado`: el saldo de puntos no cambia y no se crea ningún movimiento.
  - **6b:** cambio de talla sobre la venta de **6a**. El saldo de puntos sigue igual y `calcular_efectivo_esperado(turno)` cambia exactamente lo mismo que en §4a/§4b para los mismos montos.
  - **6f:** con la venta de un cambio ABIERTA (lleva > regresa), `aplicar_promocion(...)` y el canje de lealtad (`INSERT` en `ticket_canjes_lealtad` vía su RPC de canje) se rechazan con exactamente `DATOS_INVALIDOS: es la venta de un cambio: cóbrala o cancélala completa`.
  - **Regresión:** una devolución con motivo distinto de CAMBIO_TALLA sigue revirtiendo puntos en proporción, como en `smoke_lealtad_ganar.sql`.

- [ ] **Step 2: Correrlos y ver que fallan**

  Run: `cd desktop && npm run smokes -- smoke_caja_tienda.sql`
  Expected: FALLA en 6a, con puntos ganados sobre el ticket del cambio.

- [ ] **Step 3: Escribir `0200_cambio_sin_lealtad.sql`**

  - Crear `_ticket_es_de_cambio(uuid)` como se describe en Interfaces.
  - `CREATE OR REPLACE` de `lealtad_acumular_por_ticket`: el cuerpo vigente de la 0156 (:463-509) con una salida temprana `RETURN 0` si `_ticket_es_de_cambio(p_ticket)`.
  - `CREATE OR REPLACE` de la función del disparador `trg_devolucion_lealtad` (0156 :596-619): no revierte cuando `NEW.motivo = 'CAMBIO_TALLA'`.
  - Dos disparadores nuevos con la función existente `trg_venta_de_cambio_fija('ticket_id')`, al estilo de la 0196: `BEFORE INSERT ON ticket_promociones_aplicadas` y `BEFORE INSERT ON ticket_canjes_lealtad`.
  - Encabezado de la migración: por qué (R13, Fermín 18 oct) en tres líneas.

- [ ] **Step 4: Aplicar al Docker local y correr las pruebas**

  Run: aplicar como dice Global Constraints. Después `npm run smokes -- smoke_caja_tienda.sql smoke_lealtad_ganar.sql smoke_lealtad_canje.sql`, y la 0040.
  Expected: todo en verde.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/0200_cambio_sin_lealtad.sql supabase/scripts/smoke_caja_tienda.sql
  git commit -m "BD tienda: el cambio de talla no suma ni resta lealtad ni lleva promociones (0200)"
  ```

### Task 2: Reabrir y cambiar el pago de la venta de un cambio sin descuadrar el cajón (0201)

**Files:**
- Create: `supabase/migrations/0201_reabrir_cambio.sql`
- Modify: `supabase/scripts/smoke_caja_tienda.sql` (§6c–§6e)

**Interfaces:**
- Consumes: `_ticket_es_de_cambio(uuid)` (Task 1).
- Produces: las mismas firmas de `reabrir_ticket_pagado` y `cambiar_forma_pago_ticket` (0134 :604-808), con esta regla nueva. En la venta de un cambio, el **pago interno** es el pago de ese ticket con `client_id_local = tickets.client_id_local || '-pago'`. Nunca se cancela ni se le cambia el método.
  - Mensaje nuevo, exacto: `DATOS_INVALIDOS: esta venta se pagó con la prenda devuelta; no hay pago que cambiar`.

- [ ] **Step 1: Smokes que fallan**

  - **6c (reabrir, lleva ≤ regresa):** reabrir deja el ticket ABIERTO, el pago interno APLICADO y `monto_pendiente_mxn = 0`. `calcular_efectivo_esperado` no se mueve. Después `cerrar_ticket_si_pagado` lo regresa a PAGADO, sin puntos.
  - **6c' (reabrir, lleva > regresa):** se cancela solo el pago del saldo. El pendiente es igual a `total − interno` y el esperado baja solo lo del saldo. Cobrar el saldo otra vez lo deja PAGADO.
  - **6d (cambiar pago):** con lleva > regresa se cambia el pago del saldo a TARJETA y el interno queda EFECTIVO. Con lleva ≤ regresa se rechaza con el mensaje nuevo. Con el saldo pagado en dos pagos se rechaza con el «pago dividido» de hoy.
  - **6e (push):** se arma el JSON del push de la caja con el ticket reabierto y cobrado otra vez, como en §5f. Al aplicarlo, el pago interno sigue APLICADO en la «nube» y el esperado coincide.

- [ ] **Step 2: Correr y ver fallar.** Expected: 6c falla porque el pago interno queda CANCELADO.

- [ ] **Step 3: Escribir `0201_reabrir_cambio.sql`**

  `CREATE OR REPLACE` de las dos funciones con su cuerpo vigente de la 0134 y solo estos cambios:
  - **`reabrir_ticket_pagado`:** el `UPDATE pagos … CANCELADO` excluye el pago interno cuando `_ticket_es_de_cambio(p_ticket_id)`.
  - **`cambiar_forma_pago_ticket`:** el conteo y el `UPDATE` ignoran el pago interno. Si con eso quedan 0 pagos en la venta de un cambio, se lanza el mensaje nuevo; en cualquier otro ticket, el error de hoy.
  - Las dos siguen siendo SECURITY INVOKER, con los mismos grants.

- [ ] **Step 4: Aplicar al Docker local y correr** `smoke_caja_tienda.sql`, la suite completa de smokes y la 0040. Expected: todo en verde.

- [ ] **Step 5: Commit** `"BD tienda: reabrir y cambiar pago de un cambio respetan el pago interno (0201)"`

### Task 3: «Reabrir» y «Cambiar pago» en Transacciones de la tienda

**Files:**
- Modify: `apps/pos/app/lib/devoluciones.ts`. `VentaDevolvible` gana `pagoCambiable: { metodo: string } | null`: el único pago real (sin el interno) si hay exactamente uno, y si no, `null`. Se calcula donde hoy se arma `VentaDevolvible`.
- Modify: `apps/pos/app/components/seccion-transacciones.tsx` (botonera del detalle, :295-303). Nuevas props: `onReabrir(venta: VentaDevolvible): void` y `onCambiarPago(venta: VentaDevolvible): void`.
- Modify: `apps/pos/app/components/home-pos.tsx`. Monta `ModalReabrirCuenta` y `ModalCambiarPago` (sin cambiarles las props). `onReabierto` lleva la cuenta al Panel con `abrirDesdeTransacciones(ticketId)`; `onCambiado` refresca el detalle.
- Test: `apps/pos/app/lib/__tests__/seccion-transacciones.test.ts` (crear si no existe, con el patrón de `renderToStaticMarkup` de `sidebar-ticket.test.ts`) y la prueba de `devoluciones` que ya exista para el armado de `VentaDevolvible`.

**Interfaces:**
- Consumes: el contrato SQL de la Task 2.

- [ ] **Step 1: Pruebas que fallan**
  - Una venta PAGADO no facturada muestra «Reabrir» y, con `pagoCambiable`, «Cambiar pago».
  - Con `pagoCambiable: null` no se pinta «Cambiar pago».
  - Una venta facturada no muestra ninguno de los dos.
  - El armado de `VentaDevolvible` pone `pagoCambiable: null` en la venta de un cambio con lleva ≤ regresa y el método del saldo cuando lleva > regresa.
- [ ] **Step 2: Correr y ver fallar:** `pnpm --filter @vim/pos test`.
- [ ] **Step 3: Implementar.** La botonera pasa a dos filas: Reimprimir / Devolver / Cambio de talla arriba, Reabrir / Cambiar pago abajo, en `variant="ghost"`. Así, a 1024 px de ancho, cada botón mide al menos 44 px. **Cobro con saldo 0** (Review Focus 1): si la cuenta que llega al Panel tiene `monto_pendiente_mxn = 0`, «Cobrar» llama a `cerrar_ticket_si_pagado` y la da por cobrada sin abrir el modal de pago.
- [ ] **Step 4: Correr** `pnpm --filter @vim/pos test`, `typecheck` y `pnpm tipografia`. Expected: en verde.
- [ ] **Step 5: Verificar en el navegador** (config `pos-retail`, puerto 3022; desregistrar el service worker antes; tenant de prueba en RETAIL). Probar lo siguiente y tomar una captura de cada uno:
  - cambio con diferencia → reabrir → volver a cobrar;
  - cambio sin diferencia → reabrir → Cobrar $0;
  - cambiar pago de una venta normal.
- [ ] **Step 6: Commit** `"POS tienda: Reabrir y Cambiar pago desde Transacciones"`

### Task 4: RETAIL en el registro, /platform y prospectos (0202)

**Files:**
- Create: `supabase/migrations/0202_prospectos_retail.sql`, que reemplaza `prospectos_giro_check` con los 9 valores de la 0182 más `'RETAIL'`.
- Modify: `supabase/scripts/smoke_prospectos_giros.sql:9` (agregar RETAIL).
- Modify: `supabase/functions/_shared/alta.ts:18-29` (RETAIL en `VERTICALES` y en `GIRO_ETIQUETA`) y su prueba `alta.test.ts:170-179` («los ocho giros que se ofrecen pasan»).
- Modify: `supabase/functions/provisionar-tenant/index.ts:33` y `supabase/functions/solicitar-demo/index.ts:64-76` (RETAIL con su etiqueta).
- Modify: `apps/admin/app/registro/page.tsx:15-23`: RETAIL al final, con la etiqueta «Tienda de ropa o calzado».
- Modify: `packages/db/src/operacion.ts:19`: `ofrecido: true`. Actualizar `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts:29-32`.

- [ ] **Step 1: Pruebas que fallan:** `alta.test.ts` con RETAIL, `operacion-catalogo.test.ts` con los 8 ofrecidos y el smoke de prospectos con RETAIL.
- [ ] **Step 2: Correr y ver fallar:**
  - `deno test supabase/functions/_shared/alta.test.ts`
  - `pnpm --filter @vim/admin test`
  - `npm run smokes -- smoke_prospectos_giros.sql`
- [ ] **Step 3: Implementar.** Las tres listas de las funciones son copias. Ponytail: no unificarlas en esta entrega (cada función se despliega sola); basta con agregar RETAIL en las tres.
- [ ] **Step 4: Aplicar la 0202 al Docker local y correr** todo lo anterior más `pnpm --filter @vim/platform test` y los `typecheck`. Expected: en verde.
- [ ] **Step 5: Verificar en el navegador:**
  - `/registro` del admin (config `admin-retail`, puerto 3021) muestra «Tienda de ropa o calzado».
  - /platform → «Nuevo cliente» lo ofrece.
  - En un negocio existente, cambiar el giro a RETAIL responde 409 (lo libera la Task 6).
- [ ] **Step 6: Commit** `"RETAIL en el registro, /platform y prospectos (0202)"`

### Task 5: La primera vez del admin habla de tienda

**Files:**
- Modify: `apps/admin/app/lib/onboarding.ts:68-79`. Leer `tenants.vertical_principal` junto con lo que ya se lee y, si es `RETAIL`:
  - paso `catalogo`: título «Tus productos», descripción «Importa tus prendas con tallas y colores, o captúralas.», href `/catalogo/importar-tienda`;
  - paso `equipo`: descripción «Crea a tus cajeros con su PIN.».
  - Los demás pasos no cambian.
- Test: la prueba existente de `onboarding` (o `apps/admin/app/lib/__tests__/onboarding.test.ts`).

- [ ] **Step 1:** Prueba que falla: con `vertical_principal = 'RETAIL'`, los pasos `catalogo` y `equipo` traen esos textos y ese href; con `QUICK_SERVICE`, los de hoy.
- [ ] **Step 2:** Correr y ver fallar: `pnpm --filter @vim/admin test`.
- [ ] **Step 3:** Implementar. Los textos van tal cual; la regla de textos cortos ya se cumple.
- [ ] **Step 4:** `pnpm --filter @vim/admin test` y `typecheck`. Verificar `/bienvenida` en el navegador con el tenant de prueba en RETAIL.
- [ ] **Step 5:** Commit `"Admin: la primera vez de una tienda pide productos, no menú"`

### Task 6: Migración que libera RETAIL (0203) y documentos

**Files:**
- Create: `supabase/migrations/0203_liberar_retail.sql`: `CREATE OR REPLACE FUNCTION cambiar_giro`, con el cuerpo vigente de la 0189 :39-79 y sin `'RETAIL'` en la lista de :52. BAR, CAFETERIA y TAQUERIA **siguen** bloqueados, porque nadie pidió liberarlos. Mismos grants (solo `service_role`).
  - Encabezado: «En el lanzamiento va DESPUÉS de publicar el instalador que trae la 0188 (spec §7, ADR 0034)».
- Modify: `supabase/scripts/smoke_existencias_producto.sql:58-64`. «Nadie pasa a RETAIL todavía» pasa a «Un negocio pasa a RETAIL»: `cambiar_giro(v_t,'RETAIL',true)` funciona y deja `operacion = juego_inicial_de_giro('RETAIL')`.
- Modify: `docs/superpowers/specs/2026-10-15-giro-retail-design.md` §13, con la nota de la entrega 5:
  - qué cerró;
  - el orden de lanzamiento con 0188–0203, donde 0199 va con 0196 y 0203 va al final, después del instalador;
  - que el sitio y el PDF de prospectos esperan a tener todos los giros de retail.
- Modify: `docs/diseno/pos-retail.md`, con «Reabrir» y «Cambiar pago» en Transacciones.

- [ ] **Step 1:** Invertir el smoke y verlo fallar: `npm run smokes -- smoke_existencias_producto.sql`. Falla con GIRO_NO_DISPONIBLE.
- [ ] **Step 2:** Escribir la 0203, aplicarla al Docker local y correr la suite completa de smokes y la 0040.
- [ ] **Step 3:** En el navegador, /platform → un negocio existente → cambiar el giro a «Tienda de ropa o calzado» funciona, y la caja de ese negocio abre en el Panel de tienda.
- [ ] **Step 4:** Commit `"Libera el giro RETAIL en cambiar_giro (0203) y documenta el lanzamiento"`

### Task 7: Revisión final

- [ ] Correr todas las suites de Global Constraints y escribir los conteos en el commit.
- [ ] Revisar la rama completa (`git diff feat/retail-caja...feat/retail-abrir`) con foco en dinero (pago interno, efectivo esperado) y en RLS/grants de las funciones nuevas.
- [ ] Dejar el tenant de prueba como estaba antes de empezar: `vertical_principal='QUICK_SERVICE'`, `existencias=false`, y los productos `e3e30000-…` borrados (suave) y sin `imagen_url`.

## Fuera de esta entrega (propuesta, a confirmar con Fermín)

- **Página del sitio y PDF de prospectos para tienda.** El spec los pone en la entrega 5, pero como nada sale a producción hasta tener todos los giros de retail (Fermín, 18 oct), se propone hacerlos una sola vez, para todos, al final. Los textos los escribe James.
- **Liberar BAR, CAFETERIA y TAQUERIA en `cambiar_giro`.** Son de restaurante y nadie lo ha pedido.
- **El formulario de demo del sitio (`sitio-web/demo.html:257-266`)** sigue con los 6 giros viejos (CAFE_BAR, ENTERPRISE). Es un problema de los restaurantes, no del giro.
