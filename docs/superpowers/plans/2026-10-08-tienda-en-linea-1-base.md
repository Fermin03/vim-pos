# Tienda en línea · Entrega 1: la base — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en la base de datos y en el sondeo de la nube todo lo que la tienda en línea necesita para existir, sin que ningún cliente vea nada todavía.

**Architecture:** Una migración aditiva abre `delivery_pedidos` a un canal `TIENDA`, añade `crear_ticket_desde_tienda` (hermana de `crear_ticket_desde_app`, con el bucle de renglones extraído a una función compartida), crea la configuración, las cuentas de clientes y el complemento `TIENDA`, y añade la señal "caja lista". La Edge Function `delivery-espejo` aprende a sellar esa señal y a no mandar pedidos de la tienda a cajas que todavía no los entienden.

**Tech Stack:** PostgreSQL (Supabase y Postgres embebido de la caja), PL/pgSQL, Edge Functions en Deno/TypeScript, `node --test`, smokes `.sql`.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` (secciones 5, 8 y 12, entrega 1).

Este es el plan 1 de 7. Los planes 2 a 7 se escriben cuando este esté mezclado.

## Global Constraints

- **Cargar la skill `ponytail` antes de escribir código.** Reutilizar antes que crear.
- **RLS sagrado.** Toda tabla con `tenant_id` lleva RLS. Las tablas cerradas a todo rol se registran en `_rls_exentas` (`supabase/tests/0002_rls_cobertura.test.sql`).
- **Dinero nunca en float:** `numeric(12,2)`.
- **Español en el dominio**, SQL en `snake_case`, archivos en `kebab-case`. Sin `any` en TS.
- **Una migración aplicada en remoto no se edita.** Las funciones se redefinen **completas** (`CREATE OR REPLACE` con el cuerpo íntegro de su definición vigente).
- **Número de migración: 0161 es tentativo.** Antes de crear el archivo: `git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -3` y revisar las ramas vivas (`git worktree list`). Si 0161 está tomado, usar el siguiente libre y sustituirlo en todo el plan.
- **La migración corre también en el Postgres embebido de la caja**: nada de `storage.*` ni `cron.*` sin el guarda `IF EXISTS` que usan 0095 y 0150.
- **Fechas de negocio en hora de México**: `(now() AT TIME ZONE 'America/Mexico_City')::date`, nunca `CURRENT_DATE` contra `tenant_addons`.
- **Los smokes bloquean el merge.** Se corren con `cd desktop && npm run smokes -- <archivo>`; corren como `postgres` dentro de una transacción que se revierte.
- **Nada de esta entrega se despliega ni se aplica a producción sin el visto bueno explícito de Fermín** (Task 7).
- **El canal APP (Uber) no cambia de comportamiento.** `smoke_delivery_app.sql`, `smoke_combos_uber.sql` y `smoke_delivery_addon.sql` deben seguir en verde tras cada tarea.
- Commits en español, con el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Desviación consciente del spec (§5.6):** el complemento `TIENDA` nace con `addons.activo = false` y **no** se concede todavía a los negocios que ya están en Negocio o Cadena. Ambas cosas se hacen en la entrega 7, cuando existan las pantallas. Mismo criterio que usó lealtad (0156 → 0159): el panel de VIM lista todo complemento activo con un botón de activar.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| Crear `supabase/migrations/0161_tienda_en_linea_base.sql` | Toda la parte SQL, por secciones §1–§6 que las tareas van añadiendo |
| Crear `supabase/scripts/smoke_tienda_canal.sql` | El canal en `delivery_pedidos` |
| Crear `supabase/scripts/smoke_tienda_ticket.sql` | `crear_ticket_desde_tienda` |
| Crear `supabase/scripts/smoke_tienda_rls.sql` | RLS de configuración y cierre de las cuentas |
| Crear `supabase/scripts/smoke_tienda_modulo.sql` | Complemento, plan y `modulos_efectivos` |
| Crear `supabase/scripts/smoke_tienda_caja_lista.sql` | `sucursal_recibe_pedidos` |
| Modificar `supabase/tests/0002_rls_cobertura.test.sql` | Registrar las tablas cerradas |
| Modificar `packages/db/src/modulos.ts` | Módulo `tienda` |
| Modificar `apps/platform/app/lib/cambio-plan.ts` | `ADDONS_DEL_PLAN` |
| Modificar `supabase/functions/_shared/delivery/espejo.ts` + `espejo.test.ts` | Alcance del sondeo y ritmo con tienda |
| Modificar `supabase/functions/delivery-espejo/index.ts` | Sellar turno abierto, filtrar por canal |
| Modificar `packages/db/src/database.types.ts` | Regenerado |

El escritorio (`desktop/`) **no se toca en esta entrega**: sus cambios van juntos en la entrega 4 y salen con el instalador 0.8.0.

---

### Task 1: `delivery_pedidos` admite el canal Tienda

**Files:**
- Create: `supabase/migrations/0161_tienda_en_linea_base.sql`
- Test: `supabase/scripts/smoke_tienda_canal.sql`

**Interfaces:**
- Produces: columnas `delivery_pedidos.canal` (`'APP'|'TIENDA'`), `cliente_email`, `tienda_cuenta_id`, `zona_envio_id`, `direccion` (jsonb), `pago_al_recibir` (`'EFECTIVO'|'TARJETA'`), `paga_con_mxn`, `seguimiento_hash`; `conexion_id` admite NULL. En canal TIENDA, `app` es `'DRIVE_THRU'` (recoger) o `'DELIVERY_PROPIO'` (domicilio).

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_canal.sql`:

```sql
-- Smoke tienda en línea, canal (mig. 0161 §1): delivery_pedidos admite pedidos de la tienda sin
-- conexión a una app, y el canal APP sigue exigiendo lo de siempre. Corre como postgres. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_canal.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_id     uuid;
  v_n      integer;
BEGIN
  -- 1) Un pedido de la tienda entra sin conexión.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, cliente_email, direccion, pago_al_recibir, paga_con_mxn,
    seguimiento_hash, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-smoke-1', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana Tienda', '4771112233', 'ana@example.com',
    '{"calle":"Av. Siempre Viva","numero_exterior":"742","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}'::jsonb,
    'EFECTIVO', 500.00, 'hash-smoke-1', '[]'::jsonb, '{}'::jsonb, 0, now() + interval '5 minutes')
  RETURNING id INTO v_id;
  IF (SELECT canal FROM delivery_pedidos WHERE id = v_id) <> 'TIENDA' THEN RAISE EXCEPTION '1: no quedó en canal TIENDA'; END IF;

  -- 2) Un pedido de la tienda con modo de app: rechazado.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'APP_UBEREATS', 'tienda-smoke-2', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '2: se permitió canal TIENDA con app de Uber';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3) Un pedido de app sin conexión: rechazado, como antes de esta migración.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'uber-smoke-sin-conexion', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '3: se permitió un pedido de app sin conexión';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) Forma de pago fuera de catálogo: rechazada.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, pago_al_recibir, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-smoke-4', 'RECIBIDO', 'CHEQUE', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '4: se permitió una forma de pago inválida';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5) El código de seguimiento no se repite.
  BEGIN
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, seguimiento_hash, items, payload_raw, total_cliente_mxn)
    VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-smoke-5', 'RECIBIDO', 'hash-smoke-1', '[]'::jsonb, '{}'::jsonb, 0);
    RAISE EXCEPTION '5: se repitió un seguimiento_hash';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 6) La retención blanquea también los datos nuevos.
  UPDATE delivery_pedidos SET estado = 'ENTREGADO', recibido_at = now() - interval '40 days' WHERE id = v_id;
  PERFORM delivery_anonimizar_pedidos_viejos(30);
  SELECT count(*) INTO v_n FROM delivery_pedidos
   WHERE id = v_id AND cliente_email IS NULL AND direccion IS NULL AND cliente_telefono IS NULL AND seguimiento_hash IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION '6: la retención no blanqueó correo, dirección o seguimiento'; END IF;

  RAISE NOTICE 'smoke_tienda_canal OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_canal.sql`
Expected: ❌ con `column "canal" of relation "delivery_pedidos" does not exist`.

- [ ] **Step 3: Escribir §1 de la migración**

Confirmar primero el número (ver Global Constraints). Crear `supabase/migrations/0161_tienda_en_linea_base.sql`:

```sql
-- ============================================================================
-- 0161 — Tienda en línea, entrega 1: la base.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md
--
-- La tienda propia del restaurante es UN CANAL MÁS del núcleo de pedidos (ADR 0011), no un
-- sistema paralelo: el pedido cae en delivery_pedidos, baja a la caja por el mismo sondeo y se
-- vuelve ticket con una función hermana de crear_ticket_desde_app.
--
-- Nada de esto se ve todavía: el complemento nace inactivo y ningún negocio tiene el interruptor.
-- ============================================================================

-- ── §1 delivery_pedidos admite el canal Tienda ───────────────────────────────
-- En canal TIENDA, `app` es el modo de servicio del ticket que resultará: DRIVE_THRU es el
-- Pick-up del POS y DELIVERY_PROPIO es Domicilio. Así delivery_enlazar_tickets (0096), que
-- empareja por `t.modo_servicio = p.app`, sirve sin tocarla.
ALTER TABLE delivery_pedidos
  ADD COLUMN IF NOT EXISTS canal            text NOT NULL DEFAULT 'APP' CHECK (canal IN ('APP', 'TIENDA')),
  ADD COLUMN IF NOT EXISTS cliente_email    citext NULL,
  ADD COLUMN IF NOT EXISTS tienda_cuenta_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zona_envio_id    uuid NULL,
  ADD COLUMN IF NOT EXISTS direccion        jsonb NULL,
  ADD COLUMN IF NOT EXISTS pago_al_recibir  text NULL CHECK (pago_al_recibir IN ('EFECTIVO', 'TARJETA')),
  ADD COLUMN IF NOT EXISTS paga_con_mxn     numeric(12,2) NULL CHECK (paga_con_mxn IS NULL OR paga_con_mxn >= 0),
  ADD COLUMN IF NOT EXISTS seguimiento_hash text NULL;

-- SIN llave foránea a propósito en tienda_cuenta_id y zona_envio_id: esta tabla se espeja en la
-- caja, donde las cuentas de la tienda no existen y una zona recién creada en el admin puede no
-- haber bajado todavía. Una FK haría fallar el espejo entero, pedidos de Uber incluidos. Quien
-- valida la zona es fijar_envio_ticket, al crear el ticket.
COMMENT ON COLUMN delivery_pedidos.canal IS 'APP = Uber/DiDi/Rappi (ADR 0011). TIENDA = la tienda en línea del restaurante.';
COMMENT ON COLUMN delivery_pedidos.direccion IS 'Solo canal TIENDA a domicilio: calle, numero_exterior, numero_interior, colonia, codigo_postal, ciudad, estado, referencias.';
COMMENT ON COLUMN delivery_pedidos.seguimiento_hash IS 'SHA-256 del código del enlace de seguimiento. El código en claro no se guarda.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_pedidos_seguimiento
  ON delivery_pedidos (seguimiento_hash) WHERE seguimiento_hash IS NOT NULL;

ALTER TABLE delivery_pedidos ALTER COLUMN conexion_id DROP NOT NULL;

ALTER TABLE delivery_pedidos DROP CONSTRAINT IF EXISTS delivery_pedido_app_valida;
ALTER TABLE delivery_pedidos ADD CONSTRAINT delivery_pedido_app_valida CHECK (
     (canal = 'APP'    AND app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI') AND conexion_id IS NOT NULL)
  OR (canal = 'TIENDA' AND app IN ('DRIVE_THRU', 'DELIVERY_PROPIO')         AND conexion_id IS NULL));

-- Retención (0095): cuerpo copiado ÍNTEGRO de 0095_*.sql; se añaden las columnas de la tienda.
CREATE OR REPLACE FUNCTION delivery_anonimizar_pedidos_viejos(p_dias integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer := 0;
BEGIN
  WITH anon AS (
    UPDATE delivery_pedidos
    SET cliente_nombre       = CASE WHEN cliente_nombre IS NULL THEN NULL ELSE 'Cliente de app' END,
        cliente_telefono     = NULL,
        cliente_telefono_pin = NULL,
        direccion_texto      = NULL,
        payload_raw          = '{"anonimizado": true}'::jsonb,   -- la columna es NOT NULL
        repartidor_nombre    = NULL,
        repartidor_telefono  = NULL,
        cliente_email        = NULL,
        direccion            = NULL,
        seguimiento_hash     = NULL
    WHERE recibido_at < now() - make_interval(days => GREATEST(p_dias, 1))
      AND estado IN ('ENTREGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'LISTO', 'ERROR')
      AND (cliente_telefono IS NOT NULL OR cliente_telefono_pin IS NOT NULL OR direccion_texto IS NOT NULL
           OR payload_raw <> '{"anonimizado": true}'::jsonb OR repartidor_telefono IS NOT NULL OR repartidor_nombre IS NOT NULL
           OR cliente_email IS NOT NULL OR direccion IS NOT NULL OR seguimiento_hash IS NOT NULL
           OR (cliente_nombre IS NOT NULL AND cliente_nombre <> 'Cliente de app'))
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM anon;
  -- El payload de los webhooks también lleva datos del cliente: misma ventana.
  UPDATE delivery_eventos SET payload = '{"anonimizado": true}'::jsonb
  WHERE payload IS NOT NULL AND payload <> '{"anonimizado": true}'::jsonb
    AND created_at < now() - make_interval(days => GREATEST(p_dias, 1));
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) TO service_role;
```

- [ ] **Step 4: Correr el smoke nuevo y los de Uber**

Run: `cd desktop && npm run smokes -- smoke_tienda_canal.sql smoke_delivery_app.sql smoke_combos_uber.sql`
Expected: `✅ 3/3 smokes en verde`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql supabase/scripts/smoke_tienda_canal.sql
git commit -m "feat(tienda): delivery_pedidos admite el canal Tienda"
```

---

### Task 2: extraer el bucle de renglones a una función compartida

Refactor puro: `crear_ticket_desde_app` no cambia de comportamiento. Existe para que la función de la tienda no duplique 160 líneas de combos y modificadores.

**Files:**
- Modify: `supabase/migrations/0161_tienda_en_linea_base.sql` (añadir §2)
- Test: los existentes `smoke_delivery_app.sql` y `smoke_combos_uber.sql`

**Interfaces:**
- Consumes: la definición vigente de `crear_ticket_desde_app` en `supabase/migrations/0112_combos_uber.sql` (desde `CREATE OR REPLACE FUNCTION crear_ticket_desde_app` hasta su `$$;`).
- Produces: `_delivery_items_a_ticket(p_ticket_id uuid, p_items jsonb, p_generico_id uuid) RETURNS boolean` — agrega al ticket los renglones de un pedido con los precios del pedido; devuelve `true` si algún renglón trae alergia. Solo `service_role`. Lanza `ITEM_SIN_MAPEAR`, `COMBO_ELECCION_SIN_MAPEAR`, `COMBO_ELECCION_AMBIGUA`.

- [ ] **Step 1: Correr los smokes de Uber antes de tocar nada**

Run: `cd desktop && npm run smokes -- smoke_delivery_app.sql smoke_combos_uber.sql`
Expected: `✅ 2/2`. Es la línea base del refactor.

- [ ] **Step 2: Añadir §2 a la migración**

Al final de `0161_tienda_en_linea_base.sql`:

```sql
-- ── §2 El bucle de renglones, compartido ─────────────────────────────────────
-- Extraído SIN CAMBIOS de crear_ticket_desde_app (0112): la tienda manda los renglones con la
-- misma forma (producto_id, cantidad, precio_unitario_mxn, nota, modificadores) y necesita
-- exactamente las mismas reglas de combos. Dos copias de este bucle se desincronizarían.
CREATE OR REPLACE FUNCTION _delivery_items_a_ticket(p_ticket_id uuid, p_items jsonb, p_generico_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_item        jsonb;
  v_modif       jsonb;
  v_producto_id uuid;
  v_item_id     uuid;
  v_precio      numeric(12,2);
  v_alergenos   text;
  v_nota_item   text;
  v_hay_alergia boolean := false;
  v_es_combo    boolean;
  v_componentes jsonb;
  v_extras      numeric(12,2);
  v_comp        jsonb;
BEGIN
  -- <<< AQUÍ VA EL BUCLE, COPIADO ÍNTEGRO >>>
  RETURN v_hay_alergia;
END;
$$;
REVOKE ALL ON FUNCTION _delivery_items_a_ticket(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _delivery_items_a_ticket(uuid, jsonb, uuid) TO service_role;
```

Sustituir la línea `-- <<< AQUÍ VA EL BUCLE, COPIADO ÍNTEGRO >>>` por el bucle de `0112_combos_uber.sql`: desde la línea `FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.items) LOOP` hasta el `END LOOP;` que queda justo antes de `PERFORM recalcular_totales_ticket(v_ticket_id);`, **con sus comentarios**. Dentro de lo copiado, hacer exactamente estos tres reemplazos y ninguno más:

| Buscar | Reemplazar por |
|---|---|
| `v_pedido.items` | `p_items` |
| `v_ticket_id` | `p_ticket_id` |
| `v_generico_id` | `p_generico_id` |

- [ ] **Step 3: Redefinir `crear_ticket_desde_app` usando la función nueva**

Debajo, en la misma §2, copiar la función completa de `0112_combos_uber.sql` (de `CREATE OR REPLACE FUNCTION crear_ticket_desde_app` a su `GRANT`) con estos cambios:

1. En el `DECLARE`, quitar las variables que ya no usa: `v_item`, `v_modif`, `v_producto_id`, `v_item_id`, `v_precio`, `v_alergenos`, `v_nota_item`, `v_es_combo`, `v_componentes`, `v_extras`, `v_comp`. Se quedan `v_pedido`, `v_conexion`, `v_turno`, `v_ticket_id`, `v_generico_id`, `v_total`, `v_claims_prev`, `v_hay_alergia`.
2. Sustituir el bucle entero (el mismo rango copiado en el Step 2) por una línea:

```sql
  v_hay_alergia := _delivery_items_a_ticket(v_ticket_id, v_pedido.items, v_generico_id);
```

3. Justo después de `IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;`, añadir la guarda de canal:

```sql
  IF v_pedido.canal <> 'APP' THEN RAISE EXCEPTION 'PEDIDO_NO_ES_DE_APP: canal %', v_pedido.canal; END IF;
```

4. Encabezar con este comentario:

```sql
-- crear_ticket_desde_app: cuerpo de 0112_combos_uber.sql. Dos cambios: el bucle de renglones vive
-- ahora en _delivery_items_a_ticket, y se niega a procesar un pedido que no sea de una app.
```

Todo lo demás (turno, suplantación de claims, `abrir_ticket`, `recalcular_totales_ticket`, el `UPDATE tickets`, `aplicar_pago`, `estado_cocina`, el `UPDATE delivery_pedidos`, restaurar claims, `REVOKE`/`GRANT`) queda idéntico.

- [ ] **Step 4: Verificar que Uber no cambió**

Run: `cd desktop && npm run smokes -- smoke_delivery_app.sql smoke_combos_uber.sql smoke_tienda_canal.sql`
Expected: `✅ 3/3`. Si alguno de los dos de Uber falla, el refactor alteró algo: comparar lo copiado contra 0112 antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql
git commit -m "refactor(delivery): el bucle de renglones de un pedido pasa a una función compartida"
```

---

### Task 3: `crear_ticket_desde_tienda`

**Files:**
- Modify: `supabase/migrations/0161_tienda_en_linea_base.sql` (añadir §3)
- Test: `supabase/scripts/smoke_tienda_ticket.sql`

**Interfaces:**
- Consumes: `_delivery_items_a_ticket` (Task 2); columnas de Task 1; `abrir_ticket(p_sucursal_id, p_caja_id, p_turno_id, p_modo_servicio, p_cliente_id, p_marca_virtual_id, p_client_id_local, p_usuario_id)`; `fijar_envio_ticket(p_ticket_id, p_zona_id)`; `lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono)`; `recalcular_totales_ticket(p_ticket_id)`.
- Produces: `crear_ticket_desde_tienda(p_pedido_id uuid) RETURNS uuid`, solo `service_role`. Errores: `PEDIDO_NO_EXISTE`, `PEDIDO_NO_ES_DE_TIENDA`, `PEDIDO_NO_ACEPTABLE`, `SIN_TURNO_ABIERTO`, `CLIENTE_BLOQUEADO`, `TOTAL_NO_COINCIDE`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_ticket.sql`:

```sql
-- Smoke tienda en línea (mig. 0161 §3): pedido de la tienda → crear_ticket_desde_tienda → ticket
-- ABIERTO y SIN PAGO, con cliente por teléfono, dirección y envío. Idempotente. Corre como postgres.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_ticket.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod uuid; v_zona uuid; v_turno uuid;
  v_dom uuid; v_rec uuid; v_bloq uuid; v_mal uuid; v_app uuid; v_conexion uuid;
  v_ticket uuid; v_ticket2 uuid; v_cli uuid; v_cli2 uuid;
  v_estado text; v_cocina text; v_modo text; v_nota text; v_total numeric; v_n int;
  v_dir jsonb := '{"calle":"Av. Siempre Viva","numero_exterior":"742","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":"portón verde"}'::jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'fixture: no existe Hamburguesa Clásica'; END IF;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Tienda Smoke', 35.00) RETURNING id INTO v_zona;

  -- Domicilio: 2 × $150 + envío $35 = $335, efectivo, paga con $500.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, cliente_email, direccion, zona_envio_id, pago_al_recibir, paga_con_mxn,
    nota_cliente, items, payload_raw, subtotal_mxn, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-dom', 'T001', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana Tienda', '477 111 2233', 'ana@example.com', v_dir, v_zona, 'EFECTIVO', 500.00,
    'Tocar el timbre',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica',
      'cantidad', 2, 'precio_unitario_mxn', 150.00, 'nota', 'sin cebolla', 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 300.00, 35.00, 335.00, now() + interval '5 minutes')
  RETURNING id INTO v_dom;

  -- 1) Sin turno abierto: error claro y el pedido sigue RECIBIDO.
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_dom);
    RAISE EXCEPTION '1: debió fallar sin turno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SIN_TURNO_ABIERTO%' THEN RAISE; END IF;
  END;
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_dom) <> 'RECIBIDO' THEN RAISE EXCEPTION '1: el pedido cambió de estado sin turno'; END IF;

  -- OJO: dia_contable en hora de México, no CURRENT_DATE (UTC en el CI).
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-TIENDA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- 2) Domicilio: ticket abierto, sin pago, en cocina, con el total cotizado.
  v_ticket := crear_ticket_desde_tienda(v_dom);
  SELECT estado_fiscal::text, estado_cocina::text, modo_servicio::text, total_mxn, cliente_id, nota_general
    INTO v_estado, v_cocina, v_modo, v_total, v_cli, v_nota FROM tickets WHERE id = v_ticket;
  IF v_estado <> 'ABIERTO' THEN RAISE EXCEPTION '2: el ticket no quedó ABIERTO (%)', v_estado; END IF;
  IF v_cocina <> 'EN_COCINA' THEN RAISE EXCEPTION '2: no entró a cocina (%)', v_cocina; END IF;
  IF v_modo <> 'DELIVERY_PROPIO' THEN RAISE EXCEPTION '2: modo de servicio % (esperaba DELIVERY_PROPIO)', v_modo; END IF;
  IF v_total <> 335.00 THEN RAISE EXCEPTION '2: total % (esperaba 335.00)', v_total; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_ticket;
  IF v_n <> 0 THEN RAISE EXCEPTION '2: el ticket trae % pagos; la tienda no cobra', v_n; END IF;
  IF v_nota NOT LIKE 'Efectivo, paga con $500.00%' OR v_nota NOT LIKE '%Tocar el timbre%' THEN
    RAISE EXCEPTION '2: nota general sin forma de pago o sin nota del cliente: %', v_nota;
  END IF;

  -- 3) Cliente creado por teléfono, dirección y envío en su lugar.
  IF v_cli IS NULL THEN RAISE EXCEPTION '3: el ticket no tiene cliente'; END IF;
  IF (SELECT regexp_replace(telefono, '\D', '', 'g') FROM clientes WHERE id = v_cli) <> '4771112233' THEN
    RAISE EXCEPTION '3: el cliente no quedó con el teléfono del pedido';
  END IF;
  SELECT count(*) INTO v_n FROM tickets t JOIN direcciones_cliente d ON d.id = t.direccion_entrega_id
   WHERE t.id = v_ticket AND d.cliente_id = v_cli AND d.calle = 'Av. Siempre Viva' AND d.zona_envio_id = v_zona
     AND t.zona_envio_id = v_zona;
  IF v_n <> 1 THEN RAISE EXCEPTION '3: el ticket no quedó con su dirección y zona'; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND precio_unitario_snapshot = 35.00 AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION '3: falta el renglón de envío de $35'; END IF;
  SELECT estado, ticket_id INTO v_estado, v_ticket2 FROM delivery_pedidos WHERE id = v_dom;
  IF v_estado <> 'ACEPTADO' OR v_ticket2 <> v_ticket THEN RAISE EXCEPTION '3: el pedido no quedó ACEPTADO y enlazado'; END IF;

  -- 4) Idempotente: repetir devuelve el mismo ticket.
  IF crear_ticket_desde_tienda(v_dom) <> v_ticket THEN RAISE EXCEPTION '4: no es idempotente'; END IF;

  -- 5) Recoger, mismo teléfono escrito distinto: reutiliza al cliente, sin dirección ni envío.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, subtotal_mxn, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-rec', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana T.', '(477) 111-2233', 'TARJETA',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica',
      'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, 0, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_rec;
  v_ticket2 := crear_ticket_desde_tienda(v_rec);
  SELECT modo_servicio::text, total_mxn, cliente_id, nota_general INTO v_modo, v_total, v_cli2, v_nota FROM tickets WHERE id = v_ticket2;
  IF v_modo <> 'DRIVE_THRU' THEN RAISE EXCEPTION '5: modo % (esperaba DRIVE_THRU, el Pick-up del POS)', v_modo; END IF;
  IF v_total <> 150.00 THEN RAISE EXCEPTION '5: total % (esperaba 150.00)', v_total; END IF;
  IF v_cli2 <> v_cli THEN RAISE EXCEPTION '5: creó otro cliente para el mismo teléfono'; END IF;
  IF v_nota NOT LIKE 'Tarjeta al recibir%' THEN RAISE EXCEPTION '5: nota general sin forma de pago: %', v_nota; END IF;
  IF (SELECT direccion_entrega_id FROM tickets WHERE id = v_ticket2) IS NOT NULL THEN RAISE EXCEPTION '5: recoger no lleva dirección'; END IF;

  -- 6) Cliente bloqueado: no se crea el ticket.
  UPDATE clientes SET estado = 'BLOQUEADO' WHERE id = v_cli;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-bloq', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_bloq;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_bloq);
    RAISE EXCEPTION '6: aceptó a un cliente bloqueado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CLIENTE_BLOQUEADO%' THEN RAISE; END IF;
  END;
  UPDATE clientes SET estado = 'ACTIVO' WHERE id = v_cli;

  -- 7) El total del ticket no coincide con lo cotizado: aborta y no deja ticket.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-mal', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 999.00, now() + interval '5 minutes')
  RETURNING id INTO v_mal;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_mal);
    RAISE EXCEPTION '7: aceptó un total que no coincide';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TOTAL_NO_COINCIDE%' THEN RAISE; END IF;
  END;
  IF (SELECT ticket_id FROM delivery_pedidos WHERE id = v_mal) IS NOT NULL THEN RAISE EXCEPTION '7: quedó un ticket a medias'; END IF;

  -- 8) Cada función se niega al pedido del otro canal.
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-tk') RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-tk-1', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0)
  RETURNING id INTO v_app;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_app);
    RAISE EXCEPTION '8: la función de la tienda aceptó un pedido de app';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PEDIDO_NO_ES_DE_TIENDA%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM crear_ticket_desde_app(v_bloq);
    RAISE EXCEPTION '8: la función de apps aceptó un pedido de la tienda';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PEDIDO_NO_ES_DE_APP%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'smoke_tienda_ticket OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_ticket.sql`
Expected: ❌ con `function crear_ticket_desde_tienda(uuid) does not exist`.

- [ ] **Step 3: Añadir §3 a la migración**

```sql
-- ── §3 crear_ticket_desde_tienda ─────────────────────────────────────────────
-- Hermana de crear_ticket_desde_app. Tres diferencias que importan:
--   · el ticket lleva CLIENTE (resuelto por teléfono, la identidad del sistema: ADR 0030),
--     y en domicilio su dirección y su renglón de envío;
--   · NO se aplica ningún pago: la tienda cobra al recibir, y el cobro lo hace el cajero;
--   · el total del ticket tiene que ser el que se le cotizó al cliente, o no hay ticket.
-- Existe en la nube (POS web) y en la caja (agente de espejo), como la de apps.
CREATE OR REPLACE FUNCTION crear_ticket_desde_tienda(p_pedido_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedido      delivery_pedidos%ROWTYPE;
  v_turno       record;
  v_ticket_id   uuid;
  v_cliente_id  uuid;
  v_bloqueado   boolean;
  v_dir_id      uuid;
  v_total       numeric(12,2);
  v_claims_prev text;
  v_pago        text;
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.canal <> 'TIENDA' THEN RAISE EXCEPTION 'PEDIDO_NO_ES_DE_TIENDA: canal %', v_pedido.canal; END IF;
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR', 'ACEPTADO') THEN
    RAISE EXCEPTION 'PEDIDO_NO_ACEPTABLE: estado %', v_pedido.estado;
  END IF;

  SELECT t.id, t.caja_id, t.usuario_apertura_id INTO v_turno
  FROM turnos t
  WHERE t.sucursal_id = v_pedido.sucursal_id AND t.estado = 'ABIERTO'
  ORDER BY t.fecha_apertura DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO: sucursal %', v_pedido.sucursal_id; END IF;

  -- El cliente: por teléfono (comparado por dígitos), o se crea.
  v_cliente_id := lealtad_resolver_cliente(v_pedido.tenant_id, NULL, v_pedido.cliente_telefono);
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (tenant_id, nombre, telefono, email, created_by)
    VALUES (v_pedido.tenant_id, LEFT(COALESCE(NULLIF(btrim(v_pedido.cliente_nombre), ''), 'Cliente de la tienda'), 200),
            LEFT(regexp_replace(v_pedido.cliente_telefono, '\D', '', 'g'), 20),
            v_pedido.cliente_email, v_turno.usuario_apertura_id)
    RETURNING id INTO v_cliente_id;
  ELSE
    SELECT estado = 'BLOQUEADO' INTO v_bloqueado FROM clientes WHERE id = v_cliente_id;
    IF v_bloqueado THEN RAISE EXCEPTION 'CLIENTE_BLOQUEADO: %', v_cliente_id; END IF;
  END IF;

  -- Actuar como el usuario del turno (auth.uid() en las RPCs de venta), igual que la de apps.
  v_claims_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_turno.usuario_apertura_id::text,
                      'tenant_id', v_pedido.tenant_id::text,
                      'role', 'authenticated')::text,
    true);

  v_ticket_id := abrir_ticket(v_pedido.sucursal_id, v_turno.caja_id, v_turno.id, v_pedido.app,
                              v_cliente_id, NULL,
                              'tienda:' || v_pedido.id_externo,
                              v_turno.usuario_apertura_id);

  -- La tienda solo vende productos del catálogo: no hay producto genérico.
  PERFORM _delivery_items_a_ticket(v_ticket_id, v_pedido.items, NULL);

  IF v_pedido.app = 'DELIVERY_PROPIO' THEN
    -- La dirección del pedido se guarda en el cliente; si ya tenía esa misma, se reutiliza.
    SELECT d.id INTO v_dir_id FROM direcciones_cliente d
     WHERE d.cliente_id = v_cliente_id AND d.activa
       AND lower(btrim(d.calle)) = lower(btrim(v_pedido.direccion->>'calle'))
       AND lower(btrim(d.numero_exterior)) = lower(btrim(v_pedido.direccion->>'numero_exterior'))
       AND d.codigo_postal = v_pedido.direccion->>'codigo_postal'
     ORDER BY d.created_at LIMIT 1;
    IF v_dir_id IS NULL THEN
      INSERT INTO direcciones_cliente (tenant_id, cliente_id, etiqueta, calle, numero_exterior, numero_interior,
        colonia, codigo_postal, ciudad, estado_geo, referencias, zona_envio_id, created_by)
      VALUES (v_pedido.tenant_id, v_cliente_id, 'Tienda en línea',
        LEFT(v_pedido.direccion->>'calle', 255), LEFT(v_pedido.direccion->>'numero_exterior', 20),
        NULLIF(LEFT(v_pedido.direccion->>'numero_interior', 20), ''),
        LEFT(v_pedido.direccion->>'colonia', 150), LEFT(v_pedido.direccion->>'codigo_postal', 5),
        LEFT(v_pedido.direccion->>'ciudad', 100), LEFT(v_pedido.direccion->>'estado', 50),
        NULLIF(v_pedido.direccion->>'referencias', ''), v_pedido.zona_envio_id, v_turno.usuario_apertura_id)
      RETURNING id INTO v_dir_id;
    END IF;
    UPDATE tickets SET direccion_entrega_id = v_dir_id WHERE id = v_ticket_id;

    -- fijar_envio_ticket valida que la zona sea de la sucursal y crea el renglón al precio de HOY.
    -- Lo cotizado manda: si hay renglón, se pisa con el envío del pedido, como los precios de arriba.
    PERFORM fijar_envio_ticket(v_ticket_id, v_pedido.zona_envio_id);
    UPDATE ticket_items SET precio_unitario_snapshot = v_pedido.envio_mxn
     WHERE ticket_id = v_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  v_pago := CASE v_pedido.pago_al_recibir
              WHEN 'EFECTIVO' THEN 'Efectivo' || COALESCE(', paga con $' || to_char(v_pedido.paga_con_mxn, 'FM999999990.00'), '')
              WHEN 'TARJETA'  THEN 'Tarjeta al recibir'
            END;
  UPDATE tickets
  SET folio_externo_app = v_pedido.id_externo,
      origen_creacion   = 'API_EXTERNA',
      nombre_cliente    = LEFT(v_pedido.cliente_nombre, 100),
      nota_general      = NULLIF(concat_ws(' · ', v_pago, NULLIF(v_pedido.nota_cliente, '')), '')
  WHERE id = v_ticket_id;

  -- Lo que se le cotizó al cliente es lo que se le va a cobrar, o no hay ticket. El RAISE revierte
  -- todo lo anterior: no queda ticket a medias.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket_id;
  IF v_total IS DISTINCT FROM v_pedido.total_cliente_mxn THEN
    RAISE EXCEPTION 'TOTAL_NO_COINCIDE: ticket % vs pedido %', v_total, v_pedido.total_cliente_mxn;
  END IF;

  -- SIN aplicar_pago: la tienda cobra al recibir.
  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket_id AND estado_cocina = 'SIN_ENVIAR';

  UPDATE delivery_pedidos
  SET ticket_id = v_ticket_id, estado = 'ACEPTADO',
      aceptado_at = COALESCE(aceptado_at, now()), ultimo_error = NULL
  WHERE id = p_pedido_id;

  PERFORM set_config('request.jwt.claims', v_claims_prev, true);
  RETURN v_ticket_id;
END;
$$;
REVOKE ALL ON FUNCTION crear_ticket_desde_tienda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_ticket_desde_tienda(uuid) TO service_role;
COMMENT ON FUNCTION crear_ticket_desde_tienda(uuid) IS
  'Convierte un pedido de la tienda en línea en ticket ABIERTO y sin pago, con cliente por teléfono, dirección y envío. Idempotente.';
```

- [ ] **Step 4: Correr el smoke hasta verde**

Run: `cd desktop && npm run smokes -- smoke_tienda_ticket.sql`
Expected: `✅ smoke_tienda_ticket.sql`.

Si falla, el runner imprime el paso. Los tres tropiezos previsibles y su arreglo:
- *Un trigger o guarda rechaza el `INSERT INTO clientes` o el `UPDATE tickets`*: leer el mensaje, localizar la guarda con `grep -rn "<texto del error>" supabase/migrations/` y cumplirla (por ejemplo, mover la escritura después del `set_config` de claims). No desactivar la guarda.
- *El total sale distinto de 335.00*: el negocio de la semilla cobra IVA aparte. Ajustar los importes esperados del smoke al total real y dejar un comentario con la cuenta.
- *`fijar_envio_ticket` dice "Ticket no existe"*: la llamada quedó antes del `set_config`; debe ir después.

- [ ] **Step 5: Correr toda la familia**

Run: `cd desktop && npm run smokes -- smoke_tienda_ticket.sql smoke_tienda_canal.sql smoke_delivery_app.sql smoke_combos_uber.sql smoke_envio.sql smoke_domicilio_cobro.sql`
Expected: `✅ 6/6`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql supabase/scripts/smoke_tienda_ticket.sql
git commit -m "feat(tienda): crear_ticket_desde_tienda, ticket abierto con cliente, dirección y envío"
```

---

### Task 4: configuración, cuentas de clientes y fotos

**Files:**
- Modify: `supabase/migrations/0161_tienda_en_linea_base.sql` (añadir §4)
- Modify: `supabase/tests/0002_rls_cobertura.test.sql` (lista `_rls_exentas`)
- Test: `supabase/scripts/smoke_tienda_rls.sql`

**Interfaces:**
- Consumes: `current_tenant_id()`, `es_admin_del_tenant(uuid)`, `set_updated_at()`.
- Produces:
  - `configuracion_tenant.modulo_tienda_activo boolean`
  - `tienda_config(tenant_id PK, slug, color, descripcion, aceptacion 'MANUAL'|'AUTO', minutos_aceptacion 3..15, pago_efectivo, pago_tarjeta)`
  - `tienda_sucursales(sucursal_id PK, tenant_id, participa, recoger, domicilio, horario jsonb, pausa_hasta)`
  - `tienda_cuentas`, `tienda_sesiones`, `tienda_recuperaciones`, `tienda_direcciones` (solo `service_role`)
  - bucket público `productos`

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_rls.sql`:

```sql
-- Smoke tienda en línea (mig. 0161 §4): cada negocio ve solo su configuración, solo dueño o admin
-- la cambia, y las cuentas de clientes de la tienda no las lee ni escribe nadie con sesión.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_rls.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '61616161-0000-0000-0000-0000000000aa';
  v_n      integer;
BEGIN
  -- Fixture, como postgres.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0161', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_otro, 'otro-negocio');
  INSERT INTO tienda_cuentas (tenant_id, email, password_hash, nombre, telefono)
  VALUES (v_t, 'ana@example.com', 'x', 'Ana', '4771112233'), (v_otro, 'ana@example.com', 'x', 'Ana', '4771112233');

  -- 1) El mismo correo existe en dos negocios; repetido en el mismo, no.
  BEGIN
    INSERT INTO tienda_cuentas (tenant_id, email, password_hash, nombre, telefono) VALUES (v_t, 'ANA@example.com', 'x', 'Ana', '1');
    RAISE EXCEPTION '1: se repitió un correo dentro del mismo negocio';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 2) Dirección de la tienda: formato y palabras reservadas.
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'Con Espacios');
    RAISE EXCEPTION '2: aceptó un slug con mayúsculas y espacios';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'api');
    RAISE EXCEPTION '2: aceptó un slug reservado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'otro-negocio');
    RAISE EXCEPTION '2: dos negocios con la misma dirección';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3) Sin forma de pago no hay tienda; minutos fuera de 3..15, tampoco.
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_tarjeta) VALUES (v_t, 'knockout-smoke', false, false);
    RAISE EXCEPTION '3: aceptó una tienda sin forma de pago';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion) VALUES (v_t, 'knockout-smoke', 30);
    RAISE EXCEPTION '3: aceptó 30 minutos de espera';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) El cajero lee la configuración de su negocio pero no la escribe.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
    RAISE EXCEPTION '4: un cajero creó la configuración de la tienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5) El dueño sí, y solo ve lo suyo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, false, '{"1":["13:00","22:00"]}'::jsonb);
  SELECT count(*) INTO v_n FROM tienda_config;
  IF v_n <> 1 THEN RAISE EXCEPTION '5: el dueño ve % configuraciones (esperaba solo la suya)', v_n; END IF;
  UPDATE tienda_config SET color = '#000000' WHERE tenant_id = v_otro;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '5: el dueño cambió la tienda de otro negocio'; END IF;

  -- 6) Las cuentas de clientes están cerradas incluso para el dueño.
  BEGIN
    SELECT count(*) INTO v_n FROM tienda_cuentas;
    IF v_n <> 0 THEN RAISE EXCEPTION '6: el dueño leyó % cuentas de clientes', v_n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM tienda_sesiones;
    IF v_n <> 0 THEN RAISE EXCEPTION '6: el dueño leyó sesiones'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'smoke_tienda_rls OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_rls.sql`
Expected: ❌ con `relation "tienda_config" does not exist`.

- [ ] **Step 3: Añadir §4 a la migración**

```sql
-- ── §4 Configuración, cuentas de clientes y fotos ────────────────────────────

-- El interruptor del dueño, hermano de modulo_delivery_activo (0113) y modulo_lealtad_activo (0156).
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_tienda_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_tienda_activo IS
  'Interruptor del dueño para la tienda en línea. VIM concede el complemento TIENDA; el dueño la enciende.';

CREATE TABLE IF NOT EXISTS tienda_config (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- La dirección pública: pedidos.vimpos.com.mx/<slug>. Las reservadas son rutas de la aplicación.
  slug               text NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                            AND slug NOT IN ('api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets')),
  color              text NOT NULL DEFAULT '#111111' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  descripcion        varchar(200) NULL,
  aceptacion         text NOT NULL DEFAULT 'MANUAL' CHECK (aceptacion IN ('MANUAL', 'AUTO')),
  minutos_aceptacion integer NOT NULL DEFAULT 5 CHECK (minutos_aceptacion BETWEEN 3 AND 15),
  pago_efectivo      boolean NOT NULL DEFAULT true,
  pago_tarjeta       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tienda_config_algun_pago CHECK (pago_efectivo OR pago_tarjeta)
);
COMMENT ON TABLE tienda_config IS 'Tienda en línea de un negocio: dirección, apariencia, aceptación y formas de pago al recibir.';

CREATE TABLE IF NOT EXISTS tienda_sucursales (
  sucursal_id uuid PRIMARY KEY REFERENCES sucursales(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  participa   boolean NOT NULL DEFAULT false,
  recoger     boolean NOT NULL DEFAULT true,
  domicilio   boolean NOT NULL DEFAULT false,
  -- Un rango por día: {"1": ["13:00","22:00"], …}; 1 = lunes … 7 = domingo. Día ausente = cerrado.
  -- Cierre menor que apertura = cierra pasada la medianoche. Hora de México.
  horario     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(horario) = 'object'),
  pausa_hasta timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tienda_sucursales IS 'Qué sucursales venden en la tienda en línea, cómo y a qué horas. pausa_hasta la pone el cajero.';
CREATE INDEX IF NOT EXISTS idx_tienda_sucursales_tenant ON tienda_sucursales (tenant_id);

-- Lee cualquier empleado del negocio; escriben dueño y administradores. Molde de anuncios_pantalla (0150).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tienda_config', 'tienda_sucursales'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated, service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)) WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_delete', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', 'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- Las cuentas de los CLIENTES de la tienda. No viven en Supabase Auth a propósito: ahí el correo es
-- único en toda la plataforma (el choque que ya se conoce con los empleados) y el público quedaría
-- en el mismo rol `authenticated` que el personal. Aquí el correo es único POR NEGOCIO.
-- Cerradas a todo rol salvo service_role: solo las toca la Edge Function `tienda`.
CREATE TABLE IF NOT EXISTS tienda_cuentas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                citext NOT NULL,
  password_hash        text NOT NULL,
  nombre               varchar(100) NOT NULL,
  apellido             varchar(100) NULL,
  telefono             varchar(20) NOT NULL,
  fecha_nacimiento     date NULL,
  acepto_privacidad_at timestamptz NULL,
  intentos_fallidos    integer NOT NULL DEFAULT 0,
  bloqueada_hasta      timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tienda_cuentas_email_uq ON tienda_cuentas (tenant_id, email) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tienda_sesiones (
  token_hash text PRIMARY KEY,                      -- SHA-256 del token; el token solo vive en la cookie
  cuenta_id  uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expira_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tienda_sesiones_cuenta ON tienda_sesiones (cuenta_id);

CREATE TABLE IF NOT EXISTS tienda_recuperaciones (
  token_hash text PRIMARY KEY,
  cuenta_id  uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expira_at  timestamptz NOT NULL,
  usada_at   timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tienda_direcciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etiqueta        varchar(50) NOT NULL DEFAULT 'Casa',
  calle           varchar(255) NOT NULL,
  numero_exterior varchar(20) NOT NULL,
  numero_interior varchar(20) NULL,
  colonia         varchar(150) NOT NULL,
  codigo_postal   varchar(5) NOT NULL,
  ciudad          varchar(100) NOT NULL,
  estado          varchar(50) NOT NULL,
  referencias     text NULL,
  zona_envio_id   uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tienda_direcciones_cuenta ON tienda_direcciones (cuenta_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tienda_cuentas', 'tienda_sesiones', 'tienda_recuperaciones', 'tienda_direcciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role', t);
  END LOOP;
END $$;

-- Fotos de productos: molde del almacén `anuncios` (0150). Público para leer —es el menú de una
-- tienda pública—; escribe solo el dueño o el admin, dentro de la carpeta de su negocio. En el
-- Postgres embebido de la caja no hay storage.buckets: los bloques se omiten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('productos', 'productos', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;

    DROP POLICY IF EXISTS "productos_read_own_tenant" ON storage.objects;
    CREATE POLICY "productos_read_own_tenant" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'productos' AND (storage.foldername(name))[1] = current_tenant_id()::text);

    DROP POLICY IF EXISTS "productos_write_own_tenant" ON storage.objects;
    CREATE POLICY "productos_write_own_tenant" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'productos'
        AND (storage.foldername(name))[1] = current_tenant_id()::text
        AND es_admin_del_tenant(current_tenant_id()));

    DROP POLICY IF EXISTS "productos_delete_own_tenant" ON storage.objects;
    CREATE POLICY "productos_delete_own_tenant" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'productos'
        AND (storage.foldername(name))[1] = current_tenant_id()::text
        AND es_admin_del_tenant(current_tenant_id()));
  END IF;
END $$;
```

- [ ] **Step 4: Registrar las tablas cerradas en la prueba de cobertura**

En `supabase/tests/0002_rls_cobertura.test.sql`, en el `insert into _rls_exentas`, cambiar la última fila de `('avisos_lecturas');` a `('avisos_lecturas'),` (conservando su comentario) y añadir debajo:

```sql
  ('tienda_cuentas'),           -- Cuentas de los clientes de la tienda en línea; solo la Edge Function `tienda` (mig. 0161).
  ('tienda_sesiones'),          -- Sesiones de esas cuentas, guardadas como huella (mig. 0161).
  ('tienda_recuperaciones'),    -- Enlaces de recuperación de contraseña, de un solo uso (mig. 0161).
  ('tienda_direcciones');       -- Direcciones guardadas por el cliente de la tienda (mig. 0161).
```

- [ ] **Step 5: Correr el smoke hasta verde**

Run: `cd desktop && npm run smokes -- smoke_tienda_rls.sql`
Expected: `✅ smoke_tienda_rls.sql`.

Si el paso 4 del smoke falla porque el `INSERT` del cajero **no** lanza `insufficient_privilege` sino que pasa: `es_admin_del_tenant` considera admin al usuario `…000000000001` de la semilla. Verificar su rol con `SELECT * FROM usuarios_acceso WHERE user_id = '99999999-0000-0000-0000-000000000001'` y usar en el smoke un usuario de la semilla que sea cajero; `smoke_lealtad_rls.sql` usa estos mismos dos ids para lo mismo, así que debe coincidir.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql supabase/scripts/smoke_tienda_rls.sql supabase/tests/0002_rls_cobertura.test.sql
git commit -m "feat(tienda): configuración por negocio y sucursal, cuentas de clientes y almacén de fotos"
```

---

### Task 5: complemento, plan y módulo

**Files:**
- Modify: `supabase/migrations/0161_tienda_en_linea_base.sql` (añadir §5)
- Modify: `packages/db/src/modulos.ts`
- Modify: `apps/platform/app/lib/cambio-plan.ts:11-15`
- Test: `supabase/scripts/smoke_tienda_modulo.sql`

**Interfaces:**
- Consumes: `configuracion_tenant.modulo_tienda_activo` (Task 4); `tenant_addon_activo(uuid, varchar)`.
- Produces: complemento `addons.codigo = 'TIENDA'` (inactivo); bandera `planes.features_incluidos.tienda_incluida`; `modulos_efectivos(p_tenant)` devuelve además la clave `tienda` en `permitidos` y `efectivos`; `CodigoModulo` incluye `"tienda"`. Las directivas del latido (`resolver_directivas`) llevan `modulos.tienda` sin tocarlas, porque copian `modulos_efectivos -> 'efectivos'`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_modulo.sql`:

```sql
-- Smoke tienda en línea (mig. 0161 §5): el módulo `tienda` tiene las dos capas de delivery y
-- lealtad —complemento de VIM e interruptor del dueño—, el cambio de plan lo concede y lo retira,
-- y la redefinición de modulos_efectivos no perdió los módulos que ya existían.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_modulo.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_m      jsonb;
  v_r      jsonb;
  v_negocio uuid; v_esencial uuid;
  -- OJO: la misma expresión que tenant_addon_activo. Con CURRENT_DATE (UTC en el CI) este smoke
  -- se pondría rojo seis horas al día.
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_tenant) ON CONFLICT (tenant_id) DO NOTHING;

  -- 1) Sin complemento: ni permitido ni efectivo, aunque el dueño lo encienda.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_tenant;
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF v_m IS NULL THEN RAISE EXCEPTION 'modulos_efectivos devolvió NULL: el tenant de prueba necesita un plan'; END IF;
  IF (v_m->'permitidos'->>'tienda')::boolean THEN RAISE EXCEPTION '1: sin complemento no debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '1: sin complemento no debe ser efectivo'; END IF;

  -- 2) Con complemento e interruptor apagado: permitido, no efectivo.
  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_tenant;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_tenant, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'permitidos'->>'tienda')::boolean THEN RAISE EXCEPTION '2: con complemento debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '2: con el interruptor apagado no debe ser efectivo'; END IF;

  -- 3) Con las dos capas: efectivo. Y las directivas de la caja lo llevan.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_tenant;
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '3: con complemento e interruptor debe ser efectivo'; END IF;
  IF NOT (resolver_directivas(v_tenant) -> 'modulos' ->> 'tienda')::boolean THEN
    RAISE EXCEPTION '3: las directivas del latido no llevan el módulo tienda';
  END IF;

  -- 4) La redefinición no perdió a nadie.
  IF NOT (v_m->'permitidos' ?& ARRAY['kds', 'recetas', 'reservaciones', 'promociones', 'cfdi', 'delivery_apps', 'lealtad', 'tienda']) THEN
    RAISE EXCEPTION '4: modulos_efectivos perdió algún módulo: %', v_m->'permitidos';
  END IF;

  -- 5) Los planes: Esencial no la incluye; Negocio y Cadena sí.
  IF (SELECT (features_incluidos->>'tienda_incluida')::boolean FROM planes WHERE codigo = 'ESENCIAL') THEN
    RAISE EXCEPTION '5: Esencial no debe incluir la tienda';
  END IF;
  IF NOT (SELECT bool_and((features_incluidos->>'tienda_incluida')::boolean) FROM planes WHERE codigo IN ('NEGOCIO', 'CADENA')) THEN
    RAISE EXCEPTION '5: Negocio y Cadena deben incluir la tienda';
  END IF;

  -- 6) El cambio de plan la concede a $0 y la retira; lo que se paga aparte no se toca.
  DELETE FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF NOT (v_r->'concedidos') ? 'TIENDA' THEN RAISE EXCEPTION '6: subir a Negocio no concedió la tienda: %', v_r; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
                  WHERE ta.tenant_id = v_tenant AND a.codigo = 'TIENDA' AND ta.activo AND ta.incluido_en_plan AND ta.precio_mensual_mxn = 0) THEN
    RAISE EXCEPTION '6: la tienda no quedó incluida a $0';
  END IF;
  v_r := _sincronizar_addons_del_plan(v_tenant, v_esencial, true);
  IF NOT (v_r->'retirados') ? 'TIENDA' THEN RAISE EXCEPTION '6: bajar a Esencial no retiró la tienda: %', v_r; END IF;

  -- 7) El complemento nace inactivo: el panel de VIM no debe ofrecerlo hasta la entrega 7.
  IF (SELECT activo FROM addons WHERE codigo = 'TIENDA') THEN RAISE EXCEPTION '7: el complemento TIENDA no debe nacer activo'; END IF;

  RAISE NOTICE 'smoke_tienda_modulo OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_modulo.sql`
Expected: ❌ en el paso 2 (`null value in column "addon_id"`), porque el complemento no existe.

- [ ] **Step 3: Añadir §5 a la migración — complemento y planes**

Antes de escribir, abrir `supabase/migrations/0156_lealtad.sql` y localizar el `INSERT INTO addons` de `LEALTAD` (termina en `ON CONFLICT (codigo) DO NOTHING;`, poco antes del `UPDATE planes … lealtad_incluido`). Copiar **su lista de columnas tal cual** para el `INSERT` de abajo: los valores de este bloque están en el mismo orden que usa ese `INSERT` (código, nombre, descripción, precio, features, activo, orden).

```sql
-- ── §5 Complemento, plan y módulo ────────────────────────────────────────────
-- Molde de 0113 (delivery) y 0156 (lealtad): VIM concede el complemento, el dueño enciende.
-- Nace INACTIVO: el panel de VIM lista todo complemento activo con un botón de activar y todavía
-- no hay pantallas detrás. Se activa, y se concede a quien ya está en Negocio o Cadena, en la
-- migración de salida (entrega 7), igual que hizo lealtad en 0159.
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, activo, orden_visualizacion)
VALUES (
  'TIENDA',
  'Tienda en línea',
  'Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en la caja. '
    || 'Sin comisión por pedido. Incluida sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('tienda', true),
  false,
  30
)
ON CONFLICT (codigo) DO NOTHING;

UPDATE planes
   SET features_incluidos = COALESCE(features_incluidos, '{}'::jsonb) || jsonb_build_object('tienda_incluida', codigo <> 'ESENCIAL'),
       updated_at = now()
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');
```

- [ ] **Step 4: Añadir a §5 `_sincronizar_addons_del_plan` con la tienda**

Copiar **íntegra** la definición vigente desde `supabase/migrations/0159_lealtad_admin.sql`: de la línea `CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan(` hasta el final de su `COMMENT ON FUNCTION … ;` (incluye el `REVOKE` y el `GRANT`). Hacer exactamente dos cambios:

1. La línea del `FOR r IN SELECT * FROM (VALUES …` queda:

```sql
  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido'), ('TIENDA', 'tienda_incluida')) AS x(codigo, bandera) LOOP
```

2. El texto del `COMMENT ON FUNCTION` cambia `(0141, 0159)` por `(0141, 0159, 0161)` y `(CFDI, DELIVERY, LEALTAD)` por `(CFDI, DELIVERY, LEALTAD, TIENDA)`.

Encabezar el bloque con:

```sql
-- El cambio de plan también concede y retira la tienda. Cuerpo copiado ÍNTEGRO de
-- 0159_lealtad_admin.sql (única definición vigente); el único cambio es la pareja nueva en la lista.
-- Su espejo en TS es ADDONS_DEL_PLAN (apps/platform/app/lib/cambio-plan.ts): si cambias uno, cambia el otro.
```

- [ ] **Step 5: Añadir a §5 `modulos_efectivos` con la tienda**

Copiar **íntegra** la definición vigente desde `supabase/migrations/0156_lealtad.sql`: de `CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)` hasta su `GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;`. Hacer exactamente dos cambios:

1. En el `DECLARE`, debajo de `v_lea        boolean;`, añadir:

```sql
  v_tie        boolean;
```

2. Justo antes de `RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);`, añadir:

```sql
  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

```

Encabezar con:

```sql
-- Lectura única de módulos: se añade 'tienda'. Cuerpo copiado ÍNTEGRO de 0156_lealtad.sql; solo se
-- añaden v_tie y el bloque de la tienda. resolver_directivas no se toca: copia `efectivos` entero.
```

- [ ] **Step 6: Correr el smoke hasta verde, con los que comparten estas funciones**

Run: `cd desktop && npm run smokes -- smoke_tienda_modulo.sql smoke_delivery_addon.sql smoke_lealtad_rls.sql smoke_lealtad_admin.sql smoke_cobro_plan.sql`
Expected: `✅ 5/5`.

- [ ] **Step 7: Los espejos en TypeScript**

En `packages/db/src/modulos.ts`:

Cambiar el tipo `CodigoModulo` a:

```ts
export type CodigoModulo = "cfdi" | "delivery_apps" | "lealtad" | "tienda" | "kds" | "recetas" | "reservaciones" | "promociones";
```

Cambiar `interruptorDueno` a:

```ts
  interruptorDueno: "modulo_inventario_activo" | "modulo_delivery_activo" | "modulo_lealtad_activo" | "modulo_tienda_activo" | null;
```

Añadir a `MODULOS`, debajo de la fila de `lealtad`:

```ts
  { codigo: "tienda", nombre: "Tienda en línea", descripcion: "Tus clientes piden desde su teléfono, para recoger o a domicilio.", interruptorDueno: "modulo_tienda_activo", porAddon: true },
```

En `apps/platform/app/lib/cambio-plan.ts`, `ADDONS_DEL_PLAN` queda:

```ts
export const ADDONS_DEL_PLAN = [
  { codigo: "CFDI", bandera: "cfdi_incluido" },
  { codigo: "DELIVERY", bandera: "delivery_incluido" },
  { codigo: "LEALTAD", bandera: "lealtad_incluido" },
  { codigo: "TIENDA", bandera: "tienda_incluida" },
] as const;
```

- [ ] **Step 8: Verificar tipos y pruebas de TS**

Run: `pnpm -r exec tsc --noEmit`
Expected: sin errores. Si algún archivo tiene un `Record<CodigoModulo, …>` o un `switch` exhaustivo que ahora se queja de que falta `tienda`, añadir la entrada siguiendo a la de `lealtad` en ese mismo archivo. **No usar `next build`**: comparte `.next` con el servidor de desarrollo y lo rompe.

Run: `pnpm test`
Expected: todo en verde.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql supabase/scripts/smoke_tienda_modulo.sql packages/db/src/modulos.ts apps/platform/app/lib/cambio-plan.ts
git commit -m "feat(tienda): complemento TIENDA, inclusión por plan y módulo con sus dos capas"
```

Si el Step 8 tocó más archivos, añadirlos al `git add`.

---

### Task 6: la señal de "caja lista" y el sondeo

La tienda solo debe recibir pedidos si una caja de la sucursal consultó hace poco **y** tiene turno abierto. Y una caja que todavía no entiende los pedidos de la tienda (cualquiera anterior a la 0.8.0) no debe recibirlos: su tabla local los rechazaría y se llevaría por delante el espejo entero, Uber incluido.

**Files:**
- Modify: `supabase/migrations/0161_tienda_en_linea_base.sql` (añadir §6)
- Modify: `supabase/functions/_shared/delivery/espejo.ts`
- Modify: `supabase/functions/_shared/delivery/espejo.test.ts`
- Modify: `supabase/functions/delivery-espejo/index.ts`
- Test: `supabase/scripts/smoke_tienda_caja_lista.sql`

**Interfaces:**
- Consumes: `cajas.espejo_apps_at` (0096); `modulos_efectivos().efectivos.tienda` (Task 5); `tienda_sucursales.participa` (Task 4).
- Produces:
  - `cajas.espejo_turno_abierto boolean NOT NULL DEFAULT false`
  - `sucursal_recibe_pedidos(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean`, solo `service_role`
  - `alcanceEspejo({ efectivos, cuerpo }): { conApps: boolean; conTienda: boolean; canales: ("APP"|"TIENDA")[]; turnoAbierto: boolean }` en `espejo.ts`
  - `cadenciaEspejo({ conexiones, pedidosVivos, tienda })` acepta `tienda?: boolean`
  - Contrato del cuerpo de `delivery-espejo`: `{ desde?: string, turno_abierto?: boolean, tienda?: boolean }`. Lo enviará el agente de la caja en la entrega 4.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_caja_lista.sql`:

```sql
-- Smoke tienda en línea (mig. 0161 §6): una sucursal recibe pedidos de la tienda solo si alguna
-- caja suya consultó hace poco Y reportó turno abierto.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_caja_lista.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_suc  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
BEGIN
  UPDATE cajas SET espejo_apps_at = NULL, espejo_turno_abierto = false WHERE sucursal_id = v_suc;

  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '1: sin sondeo no debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now(), espejo_turno_abierto = false WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '2: con sondeo pero sin turno abierto no debe recibir'; END IF;

  UPDATE cajas SET espejo_turno_abierto = true WHERE id = v_caja;
  IF NOT sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '3: con sondeo reciente y turno abierto debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now() - interval '2 minutes' WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '4: un sondeo de hace 2 minutos ya no cuenta'; END IF;

  UPDATE cajas SET espejo_apps_at = now(), activa = false WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '5: una caja desactivada no cuenta'; END IF;

  RAISE NOTICE 'smoke_tienda_caja_lista OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_caja_lista.sql`
Expected: ❌ con `column "espejo_turno_abierto" of relation "cajas" does not exist`.

- [ ] **Step 3: Añadir §6 a la migración**

```sql
-- ── §6 La señal de "caja lista" ──────────────────────────────────────────────
-- El turno abierto llega a la nube por el push, con hasta 10 minutos de retraso: no sirve para
-- decidir si la tienda acepta un pedido AHORA. La única señal de segundos es el sondeo del
-- espejo (0096), así que la caja manda ahí si tiene turno abierto y delivery-espejo lo sella.
-- Una caja vieja no manda el dato, queda en false, y la tienda de esa sucursal no abre.
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS espejo_turno_abierto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN cajas.espejo_turno_abierto IS
  'Si la caja reportó turno abierto en su último sondeo de espejo (espejo_apps_at). La tienda en línea solo recibe pedidos con esto en true.';

CREATE OR REPLACE FUNCTION sucursal_recibe_pedidos(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cajas c
    WHERE c.sucursal_id = p_sucursal AND c.activa AND c.espejo_turno_abierto
      AND c.espejo_apps_at IS NOT NULL AND c.espejo_apps_at > now() - make_interval(secs => p_segundos));
$$;
REVOKE ALL ON FUNCTION sucursal_recibe_pedidos(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sucursal_recibe_pedidos(uuid, integer) TO service_role;
COMMENT ON FUNCTION sucursal_recibe_pedidos(uuid, integer) IS
  'TRUE si alguna caja activa de la sucursal sondeó en los últimos p_segundos y reportó turno abierto.';
```

- [ ] **Step 4: Correr el smoke**

Run: `cd desktop && npm run smokes -- smoke_tienda_caja_lista.sql`
Expected: `✅ smoke_tienda_caja_lista.sql`.

- [ ] **Step 5: Escribir las pruebas de `espejo.ts` que fallan**

Añadir al final de `supabase/functions/_shared/delivery/espejo.test.ts`, y sumar `alcanceEspejo` al `import` de la primera línea del archivo:

```ts
test("con la tienda viva y sin conexiones de apps, ritmo normal: la ventana de 90 s de caja lista lo necesita", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [], tienda: true }), NORMAL_MS);
});

test("la tienda apagada no saca a la caja del reposo", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [], tienda: false }), REPOSO_MS);
});

test("un pedido RECIBIDO manda sobre la tienda: ritmo rápido", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [{ estado: "RECIBIDO" }], tienda: true }), RAPIDA_MS);
});

test("alcance: solo apps, como hasta hoy", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true }, cuerpo: {} }),
    { conApps: true, conTienda: false, canales: ["APP"], turnoAbierto: false });
});

test("alcance: una caja que no declara entender la tienda no recibe sus pedidos aunque el módulo esté encendido", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true, tienda: true }, cuerpo: {} }),
    { conApps: true, conTienda: false, canales: ["APP"], turnoAbierto: false });
});

test("alcance: caja nueva con tienda y apps recibe los dos canales", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true, tienda: true }, cuerpo: { tienda: true, turno_abierto: true } }),
    { conApps: true, conTienda: true, canales: ["APP", "TIENDA"], turnoAbierto: true });
});

test("alcance: tienda sin apps", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { tienda: true }, cuerpo: { tienda: true } }),
    { conApps: false, conTienda: true, canales: ["TIENDA"], turnoAbierto: false });
});

test("alcance: la caja dice que entiende la tienda pero el negocio no la tiene", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: {}, cuerpo: { tienda: true, turno_abierto: true } }),
    { conApps: false, conTienda: false, canales: [], turnoAbierto: true });
});

test("alcance: solo un true estricto cuenta; un cuerpo raro no abre nada", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { tienda: true }, cuerpo: { tienda: "true", turno_abierto: 1 } }),
    { conApps: false, conTienda: false, canales: [], turnoAbierto: false });
});
```

- [ ] **Step 6: Correrlas y verlas fallar**

Run: `pnpm test:functions`
Expected: FAIL — `alcanceEspejo` no está exportada.

- [ ] **Step 7: Implementar en `espejo.ts`**

Sustituir la función `cadenciaEspejo` completa (con su comentario JSDoc) por:

```ts
/**
 * @param conexiones   TODAS las conexiones de la sucursal (son 1–3 filas; siempre se consultan).
 * @param pedidosVivos Los pedidos en estado activo de la sucursal. Ojo: se consultan aparte y
 *                     COMPLETOS, nunca desde el delta — si el ritmo se calculara con las filas
 *                     que cambiaron, un pedido RECIBIDO que lleva 20 s quieto dejaría de contar
 *                     y la caja frenaría justo mientras corre su ventana de aceptación.
 * @param tienda       La sucursal vende en la tienda en línea y esta caja la entiende. Sin una
 *                     conexión de app nada más la sacaría del reposo, y con sondeos cada 300 s la
 *                     señal de caja lista (ventana de 90 s) no se cumpliría nunca.
 */
export function cadenciaEspejo(
  { conexiones = [], pedidosVivos = [], tienda = false }: {
    conexiones?: { estado?: string | null }[];
    pedidosVivos?: { estado?: string | null }[];
    tienda?: boolean;
  },
): number {
  if (pedidosVivos.some((p) => p.estado === "RECIBIDO")) return RAPIDA_MS;
  if (tienda || conexiones.some((c) => CONEXION_VIVA.has(String(c.estado ?? "")))) return NORMAL_MS;
  return REPOSO_MS;
}

/**
 * Qué le toca a esta caja en este sondeo.
 *
 * `conTienda` exige las dos cosas: que el negocio tenga la tienda encendida Y que la caja diga que
 * la entiende (`tienda: true` en el cuerpo, que solo mandan las cajas desde la 0.8.0). Sin lo
 * segundo, una caja vieja recibiría pedidos con `conexion_id` nulo que su tabla local rechaza, y
 * el espejo entero —pedidos de Uber incluidos— fallaría en cada vuelta.
 *
 * Solo un `true` estricto cuenta: nada del cuerpo se da por bueno sin mirarlo.
 */
export function alcanceEspejo(
  { efectivos, cuerpo }: {
    efectivos: Record<string, unknown>;
    cuerpo: { tienda?: unknown; turno_abierto?: unknown };
  },
): { conApps: boolean; conTienda: boolean; canales: ("APP" | "TIENDA")[]; turnoAbierto: boolean } {
  const conApps = efectivos.delivery_apps === true;
  const conTienda = efectivos.tienda === true && cuerpo.tienda === true;
  const canales: ("APP" | "TIENDA")[] = [];
  if (conApps) canales.push("APP");
  if (conTienda) canales.push("TIENDA");
  return { conApps, conTienda, canales, turnoAbierto: cuerpo.turno_abierto === true };
}
```

- [ ] **Step 8: Correr las pruebas**

Run: `pnpm test:functions`
Expected: PASS, incluidas las que ya existían.

- [ ] **Step 9: Usarlo en `delivery-espejo/index.ts`**

Cinco cambios en `supabase/functions/delivery-espejo/index.ts`:

1. Añadir `alcanceEspejo` al `import` que ya trae `cadenciaEspejo`, `cursorPedido`, `respuestaSinModulo`, `unirPedidos` y `TOPE_PEDIDOS` desde `../_shared/delivery/espejo.ts`.

2. Debajo de la constante `COLS_PEDIDO`, añadir:

```ts
// Las columnas del canal Tienda solo viajan a las cajas que lo entienden (ver alcanceEspejo).
const COLS_PEDIDO_TIENDA = `${COLS_PEDIDO}, canal, cliente_email, tienda_cuenta_id, zona_envio_id, direccion, pago_al_recibir, paga_con_mxn`;
```

3. Sustituir la lectura del cuerpo:

```ts
  const cuerpo = await req.json().catch(() => ({})) as { desde?: unknown };
  const desde = cursorPedido(cuerpo?.desde);
```

por:

```ts
  const cuerpo = (await req.json().catch(() => ({})) ?? {}) as { desde?: unknown; turno_abierto?: unknown; tienda?: unknown };
  const desde = cursorPedido(cuerpo.desde);
```

4. En el `update` del latido, sellar también el turno. Sustituir:

```ts
    .update({ espejo_apps_at: new Date().toISOString() })
```

por:

```ts
    // El turno abierto se sella junto al latido: la tienda en línea solo recibe pedidos con las
    // dos cosas frescas (sucursal_recibe_pedidos, mig. 0161). Una caja que no manda el dato queda en false.
    .update({ espejo_apps_at: new Date().toISOString(), espejo_turno_abierto: cuerpo.turno_abierto === true })
```

5. Sustituir desde `const efectivos = …` hasta el final del handler (el `return json({ … })` y su `});`) por:

```ts
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null)?.efectivos ?? {};
  const alcance = alcanceEspejo({ efectivos, cuerpo });
  if (alcance.canales.length === 0) {
    return json(respuestaSinModulo(caja.id, caja.sucursal_id));
  }

  const pedidosDe = () => admin.from("delivery_pedidos")
    .select(alcance.conTienda ? COLS_PEDIDO_TIENDA : COLS_PEDIDO)
    .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
    .in("canal", alcance.canales)
    .order("recibido_at", { ascending: false }).limit(TOPE_PEDIDOS);
  const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [cx, viv, dlt, tie] = await Promise.all([
    alcance.conApps
      ? admin.from("delivery_conexiones").select(COLS_CONEXION)
          .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
      : Promise.resolve({ data: [], error: null }),
    // Los vivos van SIEMPRE, hayan cambiado o no: son los únicos sobre los que la caja tiene algo
    // pendiente que hacer, y un pedido que no cambia jamás vendría en un delta.
    pedidosDe().in("estado", ESTADOS_ACTIVOS),
    // Y lo que cambió desde el cursor. Sin cursor (arranque de la caja) va la ventana de 24 h.
    desde ? pedidosDe().gte("updated_at", desde) : pedidosDe().gte("recibido_at", hace24h),
    // ¿Esta sucursal vende en la tienda? Solo se pregunta si la caja y el negocio la tienen.
    alcance.conTienda
      ? admin.from("tienda_sucursales").select("participa")
          .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [cx, viv, dlt, tie]) {
    if (r.error) { registrarError("delivery-espejo", "DB_ERROR", r.error); return json({ error: "DB_ERROR" }, 500); }
  }

  const conexiones = cx.data ?? [];
  const vivos = viv.data ?? [];
  const tiendaViva = (tie.data as { participa?: boolean } | null)?.participa === true;
  return json({
    ahora: new Date().toISOString(),
    caja_id: caja.id,
    sucursal_id: caja.sucursal_id,
    conexiones,
    pedidos: unirPedidos(vivos, dlt.data ?? []),
    siguiente_en_ms: cadenciaEspejo({ conexiones, pedidosVivos: vivos, tienda: tiendaViva }),
  });
});
```

Conservar tal cual el comentario largo "Guard del módulo…" que está encima de la llamada a `modulos_efectivos`, cambiando solo su última frase de referencia a `efectivos.delivery_apps` si la menciona, para que diga "alguno de los dos módulos".

- [ ] **Step 10: Verificar tipos y pruebas**

Run: `pnpm test:functions`
Expected: PASS.

Run: `deno check supabase/functions/delivery-espejo/index.ts` si `deno` está instalado (`deno --version`). Si no lo está, omitir: el despliegue de la Task 7 hace la misma comprobación.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0161_tienda_en_linea_base.sql supabase/scripts/smoke_tienda_caja_lista.sql supabase/functions/_shared/delivery/espejo.ts supabase/functions/_shared/delivery/espejo.test.ts supabase/functions/delivery-espejo/index.ts
git commit -m "feat(tienda): señal de caja lista y sondeo que distingue canales"
```

---

### Task 7: verificación completa, tipos y salida

**Files:**
- Modify: `packages/db/src/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: PR abierto contra `main`; migración aplicada y función desplegada **solo con el visto bueno de Fermín**.

- [ ] **Step 1: Todos los smokes**

Run: `cd desktop && npm run smokes`
Expected: `✅ N/N smokes en verde`, con los cinco `smoke_tienda_*.sql` entre ellos.

En Windows hay rojos conocidos que no son regresión (libuv, `EPIPE`, `EADDRINUSE` por puertos al azar): si aparece uno de esos, repetir ese smoke suelto antes de darlo por fallo.

- [ ] **Step 2: El resto de las pruebas**

Run: `pnpm test:functions && pnpm test:escritorio && pnpm test && pnpm -r exec tsc --noEmit`
Expected: todo en verde.

- [ ] **Step 3: Regenerar los tipos**

Con el Supabase local arriba (requiere Docker):

Run: `supabase db reset && pnpm db:types`

Si Docker no está disponible, dejar este paso para después del Step 6 y generarlos desde producción:

Run: `supabase gen types typescript --linked > packages/db/src/database.types.ts`

En ambos casos, comprobar que el archivo regenerado contiene `tienda_config`, `crear_ticket_desde_tienda` y `espejo_turno_abierto`, y que `pnpm -r exec tsc --noEmit` sigue en verde.

```bash
git add packages/db/src/database.types.ts
git commit -m "chore(db): tipos regenerados con la base de la tienda en línea"
```

- [ ] **Step 4: Releer la migración completa**

Abrir `supabase/migrations/0161_tienda_en_linea_base.sql` de arriba abajo y comprobar:
- Las seis secciones §1–§6 están y en ese orden (§3 usa la función de §2; §5 usa la columna de §4).
- No queda la línea `-- <<< AQUÍ VA EL BUCLE, COPIADO ÍNTEGRO >>>`.
- Toda función `SECURITY DEFINER` nueva tiene `SET search_path` y su `REVOKE … FROM PUBLIC, anon, authenticated`.
- Ningún uso de `storage.` fuera del bloque con `IF EXISTS`.

- [ ] **Step 5: Subir la rama y abrir el PR**

```bash
git push -u origin feat/tienda-en-linea
gh pr create --base main --title "feat(tienda): base de la tienda en línea (entrega 1 de 7)" --body "$(cat <<'EOF'
Primera de siete entregas de la tienda en línea. Nada visible para ningún cliente: el complemento nace inactivo y ningún negocio tiene el interruptor.

- `delivery_pedidos` admite el canal `TIENDA` (sin conexión a una app, sin cobro automático).
- `crear_ticket_desde_tienda`: ticket abierto con cliente por teléfono, dirección y envío.
- El bucle de renglones de `crear_ticket_desde_app` pasa a `_delivery_items_a_ticket` (refactor sin cambio de comportamiento; los smokes de Uber siguen en verde).
- Configuración por negocio y sucursal, cuentas de clientes de la tienda (cerradas a todo rol) y almacén de fotos de productos.
- Complemento `TIENDA`, inclusión en Negocio y Cadena, módulo `tienda` en `modulos_efectivos`.
- Señal de "caja lista" (`sucursal_recibe_pedidos`) y `delivery-espejo` que distingue canales: una caja anterior a la 0.8.0 no recibe pedidos de la tienda.

Diseño: `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md`
Plan: `docs/superpowers/plans/2026-10-08-tienda-en-linea-1-base.md`

**Antes de mezclar:** aplicar la migración 0161 a producción y desplegar `delivery-espejo`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Producción — DETENERSE y pedir el visto bueno de Fermín**

No ejecutar nada de este paso sin un "sí" explícito de Fermín en el chat. Decirle qué se va a aplicar: la migración 0161 (aditiva, sin efecto visible) y la nueva versión de `delivery-espejo` (compatible con las cajas actuales, que no mandan los campos nuevos).

Con su visto bueno, y **antes de mezclar el PR** (regla del proyecto: la migración va a producción a mano y antes del merge):

1. Confirmar que no hay otra migración pendiente que estorbe: `supabase migration list --linked`.
2. Aplicar: `supabase db query --linked < supabase/migrations/0161_tienda_en_linea_base.sql` y luego `supabase migration repair --status applied 0161 --linked`. (Se aplica por stdin y no con `db push` porque `db push` se bloquea cuando la nube tiene migraciones de otras ramas.)
3. Verificar en producción:

```bash
supabase db query --linked <<'SQL'
SELECT (SELECT count(*) FROM delivery_pedidos WHERE canal <> 'APP') AS pedidos_no_app,
       (SELECT activo FROM addons WHERE codigo = 'TIENDA')          AS addon_activo,
       (SELECT count(*) FROM tienda_config)                          AS tiendas,
       to_regprocedure('crear_ticket_desde_tienda(uuid)') IS NOT NULL AS funcion_existe;
SQL
```

Expected: `0 | f | 0 | t`.

4. Desplegar la función: `supabase functions deploy delivery-espejo --use-api`.
5. Comprobar que las cajas en servicio siguen sondeando sin error: leer los registros de `delivery-espejo` unos minutos después y confirmar que no hay `DB_ERROR`.

- [ ] **Step 7: Mezclar**

Con el CI del PR en verde y el Step 6 hecho, mezclar con squash. Después de mezclar, avisar a Fermín de que la entrega 1 está en `main` y de que el siguiente paso es escribir el plan de la entrega 2 (la función `tienda`).

---

## Lo que esta entrega NO hace

- No hay tienda pública, ni función `tienda`, ni pantallas en el admin o en la caja.
- El agente de la caja no manda todavía `turno_abierto` ni `tienda: true`: hasta la 0.8.0 ninguna sucursal queda "lista" y `delivery-espejo` no reparte pedidos de la tienda. Es lo esperado.
- El complemento `TIENDA` está inactivo y sin conceder.
- La evaluación del horario (día, hora de México, cierre pasada la medianoche) se escribe en la entrega 2, dentro de la función `tienda`, donde se usa.
