# Giro RETAIL · Entrega 1: el núcleo en la base — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la base sepa qué es una prenda con variantes, cuánto hay de cada variante en cada sucursal y que cada venta, cuenta reabierta, cancelación, devolución, entrada, ajuste, conteo, merma y traspaso lo mueva exactamente una vez, **sin que ningún restaurante note nada**.

**Architecture:** Dos migraciones. La 0188 solo agrega valores a enums (`RETAIL` y `CAMBIO_TALLA`), porque un valor nuevo no se puede usar en la misma transacción y la caja aplica cada archivo como una sola consulta. La 0189 trae todo lo demás en seis secciones, una por tarea. Las existencias son la suma de `movimientos_producto` (append-only). Un disparador mantiene `producto_existencias`. Venta, reabrir, cancelación y devolución no escriben movimientos por su cuenta: llaman a **una sola función** que compara lo que el ticket *debe* haber movido con lo que *ya* movió y registra la diferencia. Así ningún camino descuenta dos veces. Ninguna pantalla cambia. La sincronización con la caja es la entrega 4.

**Tech Stack:** PostgreSQL 15 (Supabase), plpgsql, smokes `.sql` corridos por `desktop/scripts/smokes.mjs` sobre un Postgres embebido recién sembrado.

**Spec:** `docs/superpowers/specs/2026-10-15-giro-retail-design.md` (§4 completo y §4.5; entrega 1 de §9).

## Global Constraints

- **Ningún restaurante cambia.** Un producto con `controla_existencias = false` (todos los de hoy) no genera `movimientos_producto`. Recetas e insumos siguen idénticos.
- **La venta nunca falla por existencias** (D32): sin existencia, se vende y queda negativa.
- **Solo se escribe por funciones.** `authenticated` solo puede leer `producto_existencias`, `movimientos_producto` y `traspasos_producto`; escribir directo se rechaza.
- **RLS sagrado:** toda tabla nueva con `tenant_id` y política `tenant_id = current_tenant_id()`.
- **Dinero en `numeric(12,2)`**; cantidades en `numeric(12,3)`.
- **El giro `RETAIL` no se asigna a nadie todavía:** `cambiar_giro` responde `GIRO_NO_DISPONIBLE`, y `_shared/alta.ts` no lo trae en `VERTICALES`. Se libera en la entrega 5.
- Módulo de operación nuevo `existencias`: nace **apagado** para todos los negocios existentes y todos los giros, salvo `RETAIL`. No depende del plan.
- Movimientos a mano (entrada, ajuste, merma, conteo, traspaso): permiso `config.productos` **y** módulo `existencias` efectivo.
- Nada de `CURRENT_DATE` contra fechas de negocio en los smokes: `(now() AT TIME ZONE 'America/Mexico_City')::date`.
- **Todo en local hasta el 100 % (Fermín, 15 oct):** nada de push, PR ni producción en esta entrega. Se prueba solo contra el Postgres embebido de los smokes y el Supabase local. Cuando llegue el momento, las migraciones van a producción **a mano y antes del merge**, cada una en su transacción.
- Antes de crear los archivos, confirmar que 0188 y 0189 siguen libres en `origin/main`. Si no, usar las dos siguientes y renumerar en todo el plan.
- Antes de reemplazar `juego_inicial_de_giro`, `modulos_efectivos` o `cambiar_giro`, confirmar con `grep -l "FUNCTION <nombre>" supabase/migrations/*.sql` que la 0180 sigue siendo su versión más nueva. Si otra migración las reescribió, partir de ese cuerpo.

## Ajustes al spec (decididos al planear; van al ADR)

1. **Motivos de devolución:** `PRODUCTO_DEFECTUOSO` y `CLIENTE_NO_SATISFECHO` ya existen y son el "defecto" y el "no le gustó" del spec. Solo se agrega `CAMBIO_TALLA`. La caja (entrega 4) los rotula por giro.
2. **"Precio vacío hereda el del padre":** `precio_base_mxn` es `NOT NULL` y lo leen cobro, menús, combos y tienda. La hija siempre tiene precio propio y el admin (entrega 2) lo prellena con el del padre. Cero cambios en el cobro.
3. **Cambio de talla:** en la base se compone con dos piezas que ya existen y que aquí se prueban juntas: devolución parcial con motivo `CAMBIO_TALLA` y venta de la talla nueva. La RPC de "un solo flujo" (cobrar o regresar la diferencia) va en la entrega 4, junto con la pantalla que decide el dinero.
4. **SKU y código de barras únicos** solo entre productos que controlan existencias: los restaurantes pueden repetirlos hoy, y así la migración no puede fallar en ninguna base existente (nube o caja). (Regla R4, tomada al ejecutar.)

## Review Focus

1. **Cancelar un ticket pagado con devolución de dinero.** `cancelar_ticket_pagado` crea una devolución total y además inserta la cancelación. La existencia regresa **una sola vez**. Prueba en la Tarea 5.
2. **Reabrir una cuenta pagada y volver a cobrarla.** El neto es una sola venta, no dos. Prueba en la Tarea 5.
3. **Un restaurante cobra, cancela y devuelve igual que antes.** Ningún `movimientos_producto` para la Hamburguesa Clásica; las recetas siguen descontando insumos. Prueba en la Tarea 5, y todos los smokes en la Tarea 8.
4. **Escribir directo o leer lo ajeno.** El cajero con su JWT no puede insertar en `movimientos_producto` ni tocar `producto_existencias`, y no ve las filas de otro negocio. Prueba en la Tarea 4.
5. **Entradas malas en conteo, ajuste y traspaso:** producto repetido en el lote, producto de otro negocio, producto padre, cantidad cero o negativa donde no toca, traspaso a la misma sucursal, recibir dos veces. Error claro y nada cambia. Pruebas en las Tareas 6 y 7.

## Hallazgos que el plan ya considera

- `trg_cancelacion_marcar_ticket` (0009) pone el ticket en `CANCELADO` con `session_replication_role = replica`, así que **los disparadores de `tickets` no ven la cancelación**. Por eso hay un disparador propio en `cancelaciones_ticket`, con un nombre que ordena **después** de `trg_cancelaciones_marcar_ticket` (Postgres corre los disparadores del mismo evento en orden alfabético): `trg_cancelaciones_z_existencias`.
- `cancelar_ticket_pagado` (0134) con `p_devolver_dinero` crea **y confirma** una devolución total antes de insertar la cancelación. Si cada camino regresara existencias por su cuenta, se regresarían dos veces. La función única de la Tarea 5 lo evita por construcción. (El inventario por insumos parece tener ese doble regreso hoy: **fuera de alcance**, se reporta a Fermín, no se toca aquí.)
- `reabrir` (0058/0134) pasa `PAGADO → ABIERTO`, y esa transición sí dispara los disparadores de `tickets`.
- El push de la caja aplica `tickets` y `ticket_items` en modo réplica: **en la nube no corre ningún disparador de esta entrega por ventas hechas en la caja.** La caja los corre en su Postgres local y la entrega 4 sube sus `movimientos_producto`, igual que la 0101 sube `movimientos_inventario`. Hasta entonces nadie es RETAIL, así que no se pierde nada.
- `eliminar_tenant` (0144) borra **todas** las tablas con `tenant_id` sacándolas del catálogo, en una sola sentencia. Por eso las tablas nuevas **no** llevan disparador que impida borrar: lo append-only se logra con privilegios. `smoke_eliminar_tenant.sql` lo comprueba en la Tarea 8.
- `_shared/alta.ts:18` valida el giro contra `VERTICALES`, que no incluye `RETAIL`: el alta lo rechaza sin tocar nada.
- La caja baja `productos` completo. Columnas nuevas no rompen una caja vieja: el pull rellena por nombre de columna e ignora las que no conoce. Lo único que rompe es un **valor de enum** que la caja no conoce, y ninguno se asigna en esta entrega.

## Archivos

- Crear: `supabase/migrations/0188_retail_valores.sql`, solo los `ADD VALUE`.
- Crear: `supabase/migrations/0189_existencias_por_producto.sql`, secciones §1–§6 (una por tarea, de la 2 a la 7).
- Crear: `supabase/scripts/smoke_existencias_producto.sql`, un bloque `DO` por tarea.
- Modificar: `supabase/scripts/smoke_giros_operacion.sql`, para que los juegos esperados traigan la llave `existencias`.
- Crear: `docs/decisiones/0037-el-stock-de-una-tienda-vive-en-el-producto.md`.
- Modificar: `docs/decisiones/README.md` (índice).
- Regenerar: los tipos de `pnpm db:types`.

## Datos fijos de los smokes

Semilla de dev: negocio `99999999-0000-0000-0000-0000000000aa`, sucursal `…0bb`, caja `…0cc`, cajera María `99999999-0000-0000-0000-000000000001` (sin `config.productos`), dueño `99999999-0000-0000-0000-0000000000e1` (con `config.productos`). Hamburguesa Clásica `b0000000-0000-0000-0000-0000000000f1` ($120).

Fixture de prenda que crea la Tarea 3 y que usan las siguientes:

| Qué | id |
|---|---|
| Categoría "Playeras" | `a7a70000-0000-0000-0000-0000000000c1` |
| Padre "Playera Polo" ($349) | `a7a70000-0000-0000-0000-0000000000a0` |
| Hija M · Negra | `a7a70000-0000-0000-0000-0000000000a1` |
| Hija G · Negra | `a7a70000-0000-0000-0000-0000000000a2` |
| Otro negocio | `a7a70000-0000-0000-0000-0000000000ee` |
| Producto del otro negocio | `a7a70000-0000-0000-0000-0000000000e1` |

---

### Task 0: Rama

- [ ] **Step 1: Crear la rama encima del spec y el plan**

```bash
cd vim-pos-retail
git fetch origin
git switch -c feat/retail-nucleo docs/giro-retail
git rebase origin/main
ls supabase/migrations | tail -3
```

Esperado: la última es `0187_catalogo_colonias.sql`. Si ya hay 0188 o 0189, renumera en todo el plan.

---

### Task 1: Valores nuevos en los enums

**Files:**
- Create: `supabase/migrations/0188_retail_valores.sql`
- Create: `supabase/scripts/smoke_existencias_producto.sql`

**Interfaces:**
- Produces: `'RETAIL'` en `vertical_tipo`; `'CAMBIO_TALLA'` en `devolucion_motivo`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_existencias_producto.sql`:

```sql
-- Smoke del giro RETAIL y las existencias por producto (spec 2026-10-15-giro-retail-design.md,
-- migraciones 0188 y 0189). Sobre la semilla de dev. ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_existencias_producto.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Valores nuevos.
DO $$
BEGIN
  IF NOT 'RETAIL' = ANY(enum_range(NULL::vertical_tipo)::text[]) THEN
    RAISE EXCEPTION '1a: falta RETAIL en vertical_tipo';
  END IF;
  IF NOT 'CAMBIO_TALLA' = ANY(enum_range(NULL::devolucion_motivo)::text[]) THEN
    RAISE EXCEPTION '1b: falta CAMBIO_TALLA en devolucion_motivo';
  END IF;
  RAISE NOTICE '1 valores nuevos OK';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌ smoke_existencias_producto.sql` con `1a: falta RETAIL en vertical_tipo`.

- [ ] **Step 3: La migración**

`supabase/migrations/0188_retail_valores.sql`:

```sql
-- Giro RETAIL (spec 2026-10-15-giro-retail-design.md §4.5, ADR 0037).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0189.
--
-- RETAIL no se asigna a ningún negocio hasta que esta migración viaje en un instalador que tengan
-- todas las cajas: la caja baja la fila completa de `tenants` y un valor que no conoce tumba su
-- pull entero (ADR 0034). Por eso cambiar_giro responde GIRO_NO_DISPONIBLE (0189 §1).
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'RETAIL';

-- Cambio de talla. "Defecto" y "no le gustó" ya existían: PRODUCTO_DEFECTUOSO y CLIENTE_NO_SATISFECHO.
ALTER TYPE devolucion_motivo ADD VALUE IF NOT EXISTS 'CAMBIO_TALLA';
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `✅ smoke_existencias_producto.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0188_retail_valores.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): giro RETAIL y motivo CAMBIO_TALLA en los enums (0188)"
```

---

### Task 2: El giro RETAIL y el módulo `existencias`

**Files:**
- Create: `supabase/migrations/0189_existencias_por_producto.sql` (§1)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 2)
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (juegos esperados)

**Interfaces:**
- Consumes: `'RETAIL'` (Tarea 1).
- Produces: llave `existencias` en `tenants.operacion` y en `modulos_efectivos(t)->'efectivos'`; `juego_inicial_de_giro('RETAIL')`; `cambiar_giro(t,'RETAIL',…)` responde `GIRO_NO_DISPONIBLE`.

- [ ] **Step 1: Agregar el bloque 2 al smoke (antes del `ROLLBACK;`)**

```sql
-- 2) Giro RETAIL y módulo existencias.
DO $$
DECLARE
  v_t  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_op jsonb;
  v_m  jsonb;
BEGIN
  IF juego_inicial_de_giro('RETAIL') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'::jsonb
  THEN RAISE EXCEPTION '2a: RETAIL: %', juego_inicial_de_giro('RETAIL'); END IF;

  -- Ningún giro de comida arranca con existencias, y sin giro (o ENTERPRISE) tampoco.
  IF (juego_inicial_de_giro('QUICK_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro('FULL_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro(NULL)->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2b: existencias solo debe arrancar encendido en RETAIL';
  END IF;

  -- El cliente existente queda con la llave apagada y modulos_efectivos la reporta.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_t;
  IF (v_op->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2c: el cliente existente debía tener existencias=false: %', v_op;
  END IF;
  v_m := modulos_efectivos(v_t);
  IF (v_m->'permitidos'->>'existencias')::boolean IS DISTINCT FROM true
     OR (v_m->'efectivos'->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2d: modulos_efectivos.existencias: %', v_m;
  END IF;
  -- Lo de antes sigue ahí.
  IF NOT (v_m->'efectivos' ?& ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','kds','mostrador','cuentas_barra']) THEN
    RAISE EXCEPTION '2e: modulos_efectivos perdió llaves: %', v_m;
  END IF;

  -- VIM lo enciende (como cualquier módulo de operación) y se refleja.
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  IF (modulos_efectivos(v_t)->'efectivos'->>'existencias')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '2f: encender existencias no se reflejó';
  END IF;

  -- Nadie pasa a RETAIL todavía.
  BEGIN
    PERFORM cambiar_giro(v_t, 'RETAIL', true);
    RAISE EXCEPTION '2g: cambiar_giro debía rechazar RETAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '2 giro RETAIL y módulo existencias OK';
END $$;
```

El bloque 2 deja `existencias` **encendido** en el negocio de la semilla. Los bloques siguientes lo necesitan.

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `2a: RETAIL: {... todo encendido ...}` (cae en el `ELSE`).

- [ ] **Step 3: La migración, §1**

`supabase/migrations/0189_existencias_por_producto.sql`:

```sql
-- Existencias por producto y variantes (spec 2026-10-15-giro-retail-design.md, ADR 0037).
--
-- Un restaurante lleva su inventario por insumo y receta (0007, ADR 0012/0013); una tienda de ropa
-- lo lleva por prenda: "quedan 4 playeras M negras". Esto agrega lo segundo SIN tocar lo primero:
-- un producto controla existencias o usa recetas, nunca las dos. Los productos que ya existen
-- nacen con controla_existencias = false y no cambian.
--
-- Secciones: §1 giro y módulo · §2 variantes y costo · §3 existencias y movimientos ·
-- §4 venta, reabrir, cancelación y devolución · §5 movimientos a mano · §6 traspasos.

-- ── §1 El giro RETAIL y el módulo `existencias` ─────────────────────────────
-- Cuerpo de la 0180 con la llave `existencias` (apagada en todos los giros salvo RETAIL) y la fila
-- de RETAIL. Sin giro conocido sigue siendo "todo encendido" en los diez de antes; existencias no,
-- porque nadie lo tenía.
CREATE OR REPLACE FUNCTION juego_inicial_de_giro(p_giro vertical_tipo)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (CASE p_giro::text
    WHEN 'QUICK_SERVICE' THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'FULL_SERVICE'  THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'FOODTRUCK'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false,"existencias":false}'
    WHEN 'DARK_KITCHEN'  THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'BAR'           THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true,"existencias":false}'
    WHEN 'CAFETERIA'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'TAQUERIA'      THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'RETAIL'        THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true,"existencias":false}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro. Sin giro conocido: los diez de restaurante encendidos y existencias apagado. Única fuente de esa tabla (0180, 0189).';

-- operacion_normalizar toma las llaves válidas de juego_inicial_de_giro(NULL): ya acepta
-- `existencias` sin cambios. El DEFAULT de la columna (0183) también se calcula de ahí.
-- Los negocios que ya existen quedan con la llave explícita y apagada.
UPDATE tenants SET operacion = operacion || '{"existencias":false}'::jsonb
 WHERE NOT operacion ? 'existencias';

-- Cuerpo de la 0180 con RETAIL en la lista de giros que todavía no se asignan.
CREATE OR REPLACE FUNCTION cambiar_giro(p_tenant uuid, p_giro vertical_tipo, p_reaplicar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes    jsonb;
  v_nuevo    jsonb;
  v_abiertas jsonb;
  v_avisos   text[] := '{}';
BEGIN
  IF p_giro IS NULL OR p_giro::text IN ('CAFE_BAR', 'ENTERPRISE') THEN
    RAISE EXCEPTION 'GIRO_RETIRADO: %', p_giro USING ERRCODE = '22023';
  END IF;
  -- La caja baja la fila completa de `tenants`; una caja sin la 0179/0188 no conoce estos valores y
  -- su pull entero fallaría. Se liberan con una migración cuando todas las cajas la tengan (ADR 0034).
  IF p_giro::text IN ('BAR', 'CAFETERIA', 'TAQUERIA', 'RETAIL') THEN   -- 0189: RETAIL
    RAISE EXCEPTION 'GIRO_NO_DISPONIBLE: %', p_giro USING ERRCODE = '22023';
  END IF;
  SELECT operacion INTO v_antes FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;

  UPDATE tenants SET vertical_principal = p_giro WHERE id = p_tenant;
  IF NOT COALESCE(p_reaplicar, false) THEN
    RETURN jsonb_build_object('operacion', v_antes, 'avisos', '[]'::jsonb);
  END IF;

  v_nuevo    := juego_inicial_de_giro(p_giro);
  v_abiertas := operacion_cuentas_abiertas(p_tenant);
  IF (v_antes->>'comedor')::boolean AND NOT (v_nuevo->>'comedor')::boolean
     AND (v_abiertas->>'comedor')::int > 0 THEN
    v_nuevo  := v_nuevo || jsonb_build_object('comedor', true, 'meseros', v_antes->'meseros');
    v_avisos := v_avisos || format('El comedor sigue encendido porque tiene %s cuentas abiertas.', v_abiertas->>'comedor');
  END IF;
  IF (v_antes->>'cuentas_barra')::boolean AND NOT (v_nuevo->>'cuentas_barra')::boolean
     AND (v_abiertas->>'cuentas_barra')::int > 0 THEN
    v_nuevo  := v_nuevo || '{"cuentas_barra":true}'::jsonb;
    v_avisos := v_avisos || format('Las cuentas en barra siguen encendidas porque hay %s abiertas.', v_abiertas->>'cuentas_barra');
  END IF;

  UPDATE tenants SET operacion = v_nuevo WHERE id = p_tenant RETURNING operacion INTO v_nuevo;
  RETURN jsonb_build_object('operacion', v_nuevo, 'avisos', to_jsonb(v_avisos));
END;
$$;

-- Cuerpo de la 0180 con `existencias`: siempre permitido (no se cobra, decisión de Fermín 15 oct);
-- encendido = interruptor de VIM, y si la llave no está, apagado (nadie lo tenía).
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
  v_tie        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion
    INTO v_plan, v_op
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo
                WHEN 'recetas' THEN COALESCE(v_inv, false)
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  -- 0189: existencias por producto. Sin llave = apagado.
  v_permitidos := v_permitidos || jsonb_build_object('existencias', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('existencias', COALESCE((v_op->>'existencias')::boolean, false));

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;
```

`CREATE OR REPLACE` conserva los `REVOKE`/`GRANT` de `cambiar_giro` de la 0180. No se repiten.

- [ ] **Step 4: Actualizar `smoke_giros_operacion.sql`**

En el bloque 2 de `supabase/scripts/smoke_giros_operacion.sql`, cada juego esperado lleva ahora `,"existencias":false` antes de la `}` de cierre. Son las siete comparaciones de `juego_inicial_de_giro('…')` y la variable `v_todo`. Ejemplo:

```sql
  IF juego_inicial_de_giro('QUICK_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'::jsonb
```

y

```sql
  v_todo jsonb := '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true,"existencias":false}';
```

Revisa el resto del archivo con `grep -n '"cuentas_barra":' supabase/scripts/smoke_giros_operacion.sql`. Si otro bloque compara un `operacion` completo, agrégale la misma llave.

- [ ] **Step 5: Correr los dos smokes y los que leen `modulos_efectivos`**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql smoke_giros_operacion.sql smoke_delivery_addon.sql smoke_lealtad_rls.sql smoke_inventario_plan.sql`
Esperado: `✅ 5/5 smokes en verde`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(retail): juego del giro RETAIL y modulo existencias (0189 §1)"
```

---

### Task 3: Variantes y costo en `productos`

**Files:**
- Modify: `supabase/migrations/0189_existencias_por_producto.sql` (§2, al final)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 3, que además crea el fixture)

**Interfaces:**
- Produces: columnas `productos.producto_padre_id uuid`, `variante_ejes text[]`, `variante_valores jsonb`, `costo_mxn numeric(12,2)`, `controla_existencias boolean`. Errores `VARIANTE_INVALIDA` (23514) y `PRODUCTO_CON_VARIANTES` (22023). El fixture de la tabla "Datos fijos".

- [ ] **Step 1: Agregar el bloque 3 al smoke**

```sql
-- 3) Variantes: forma válida, coherencia con el padre, códigos únicos y el padre no se vende.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'a7a70000-0000-0000-0000-0000000000c1';
  v_padre uuid := 'a7a70000-0000-0000-0000-0000000000a0';
  v_m     uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g     uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_otro  uuid := 'a7a70000-0000-0000-0000-0000000000ee';
  v_ajeno uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_turno uuid; v_ticket uuid;
BEGIN
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Playeras');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes)
  VALUES (v_padre, v_t, 'Playera Polo', v_cat, 349, ARRAY['Talla','Color']);
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, codigo_barras,
                         producto_padre_id, variante_valores, controla_existencias, costo_mxn)
  VALUES (v_m, v_t, 'Playera Polo M Negra', v_cat, 349, 'POL-M-NEG', '2000000000015',
          v_padre, '{"Talla":"M","Color":"Negra"}', true, 150),
         (v_g, v_t, 'Playera Polo G Negra', v_cat, 349, 'POL-G-NEG', '2000000000022',
          v_padre, '{"Talla":"G","Color":"Negra"}', true, 150);

  -- Otro negocio con un producto, para las pruebas de aislamiento.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-retail-0189', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('a7a70000-0000-0000-0000-0000000000c2', v_otro, 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES (v_ajeno, v_otro, 'Prenda ajena', 'a7a70000-0000-0000-0000-0000000000c2', 100, true);

  -- 3a) La hija repite la combinación de otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Duplicada', v_cat, 349, v_padre, '{"Color":"Negra","Talla":"M"}');
    RAISE EXCEPTION '3a: debía rechazar la combinación repetida';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3b) Ejes que no son los del padre.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Sin color', v_cat, 349, v_padre, '{"Talla":"CH"}');
    RAISE EXCEPTION '3b: debía rechazar ejes distintos a los del padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3c) Nieta: el padre de una hija no puede ser otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Nieta', v_cat, 349, v_m, '{"Talla":"M","Color":"Negra"}');
    RAISE EXCEPTION '3c: debía rechazar una nieta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3d) Padre de otro negocio.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_otro, 'Cruzada', 'a7a70000-0000-0000-0000-0000000000c2', 349, v_padre, '{"Talla":"M","Color":"Roja"}');
    RAISE EXCEPTION '3d: debía rechazar un padre de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3e) No se cambian los ejes de un padre con hijas.
  BEGIN
    UPDATE productos SET variante_ejes = ARRAY['Talla'] WHERE id = v_padre;
    RAISE EXCEPTION '3e: debía rechazar cambiar ejes con hijas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3f) El padre no controla existencias.
  BEGIN
    UPDATE productos SET controla_existencias = true WHERE id = v_padre;
    RAISE EXCEPTION '3f: el padre no debía poder controlar existencias';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3g) Código de barras único por negocio; SKU único entre los que controlan existencias.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_barras)
    VALUES (v_t, 'Mismo código', v_cat, 10, '2000000000015');
    RAISE EXCEPTION '3g: debía rechazar código de barras repetido';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, controla_existencias)
    VALUES (v_t, 'Mismo SKU', v_cat, 10, 'POL-M-NEG', true);
    RAISE EXCEPTION '3g: debía rechazar SKU repetido con existencias';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Un restaurante puede seguir repitiendo codigo_interno (sin existencias).
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno)
  VALUES (v_t, 'SKU repetido de restaurante 1', v_cat, 10, 'REP-1'),
         (v_t, 'SKU repetido de restaurante 2', v_cat, 10, 'REP-1');

  -- 3h) El padre no se vende: se vende la hija.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-RET3', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret3', v_maria);
  BEGIN
    PERFORM agregar_item_a_ticket(v_ticket, v_padre, 1, NULL, '[]'::jsonb, 'smoke-ret3-padre');
    RAISE EXCEPTION '3h: debía rechazar vender el padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PRODUCTO_CON_VARIANTES%' THEN RAISE; END IF;
  END;
  PERFORM agregar_item_a_ticket(v_ticket, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret3-hija');
  RAISE NOTICE '3 variantes OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `column "variante_ejes" of relation "productos" does not exist`.

- [ ] **Step 3: La migración, §2 (agregar al final de la 0189)**

```sql
-- ── §2 Variantes y costo ─────────────────────────────────────────────────────
-- La variante es un producto más (con su SKU, código de barras, precio y existencias) que apunta
-- a su padre. El padre es lo que se ve en catálogo y caja ("Playera Polo") y no se vende.
-- Un solo nivel. El precio de la hija es siempre suyo: el admin lo prellena con el del padre
-- (precio_base_mxn es NOT NULL y lo leen cobro, menús, combos y tienda).
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS producto_padre_id    uuid NULL REFERENCES productos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variante_ejes        text[] NULL,
  ADD COLUMN IF NOT EXISTS variante_valores     jsonb NULL,
  ADD COLUMN IF NOT EXISTS costo_mxn            numeric(12,2) NULL CHECK (costo_mxn IS NULL OR costo_mxn >= 0),
  ADD COLUMN IF NOT EXISTS controla_existencias boolean NOT NULL DEFAULT false;

ALTER TABLE productos
  -- Padre: tiene ejes y no tiene padre ni valores. Hija: tiene padre y valores y no tiene ejes.
  ADD CONSTRAINT productos_variante_forma CHECK (
    (producto_padre_id IS NULL AND variante_valores IS NULL)
    OR (producto_padre_id IS NOT NULL AND variante_ejes IS NULL
        AND variante_valores IS NOT NULL AND jsonb_typeof(variante_valores) = 'object')),
  -- El padre no se vende, así que no tiene existencias.
  ADD CONSTRAINT productos_padre_sin_existencias CHECK (NOT (variante_ejes IS NOT NULL AND controla_existencias));

COMMENT ON COLUMN productos.producto_padre_id IS 'Variante: apunta al producto padre (un nivel). El padre no se vende (0189).';
COMMENT ON COLUMN productos.variante_ejes IS 'Solo en el padre: ejes de sus variantes, p. ej. {Talla,Color} (0189).';
COMMENT ON COLUMN productos.variante_valores IS 'Solo en la hija: valor por eje, p. ej. {"Talla":"M","Color":"Negra"} (0189).';
COMMENT ON COLUMN productos.costo_mxn IS 'Costo vigente (último de entrada). Para margen y existencias valorizadas (0189).';
COMMENT ON COLUMN productos.controla_existencias IS 'true = lleva existencias por sucursal en producto_existencias. Excluye recetas/insumos (0189).';

CREATE INDEX IF NOT EXISTS idx_productos_padre ON productos(producto_padre_id)
  WHERE producto_padre_id IS NOT NULL AND deleted_at IS NULL;
-- jsonb compara por contenido: {"Color":"Negra","Talla":"M"} = {"Talla":"M","Color":"Negra"}.
CREATE UNIQUE INDEX IF NOT EXISTS productos_variante_unica ON productos(producto_padre_id, variante_valores)
  WHERE producto_padre_id IS NOT NULL AND deleted_at IS NULL;
-- Antes de aplicar en producción, esta consulta debe regresar cero filas (ver ADR 0037):
--   SELECT tenant_id, codigo_barras, count(*) FROM productos
--    WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo_barras_unico ON productos(tenant_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL;
-- SKU único solo entre los que controlan existencias: los restaurantes pueden repetirlo hoy.
CREATE UNIQUE INDEX IF NOT EXISTS productos_sku_existencias_unico ON productos(tenant_id, codigo_interno)
  WHERE codigo_interno IS NOT NULL AND deleted_at IS NULL AND controla_existencias;

-- Coherencia que un CHECK no alcanza: el padre existe, es del mismo negocio, es padre (tiene ejes,
-- no tiene padre) y los valores de la hija son exactamente sus ejes, con texto no vacío. Tampoco se
-- cambian los ejes de un padre que ya tiene hijas. En la caja el pull corre en réplica y esto no
-- corre: la nube ya lo validó.
CREATE OR REPLACE FUNCTION productos_variante_coherencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_padre productos%ROWTYPE;
  k       text;
BEGIN
  IF NEW.variante_ejes IS NOT NULL AND cardinality(NEW.variante_ejes) = 0 THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: un producto con variantes necesita al menos un eje' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.variante_ejes IS DISTINCT FROM NEW.variante_ejes
     AND EXISTS (SELECT 1 FROM productos h WHERE h.producto_padre_id = NEW.id AND h.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: no se cambian los ejes de un producto que ya tiene variantes' USING ERRCODE = '23514';
  END IF;

  IF NEW.producto_padre_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_padre FROM productos WHERE id = NEW.producto_padre_id;
  IF NOT FOUND OR v_padre.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el producto padre no es de este negocio' USING ERRCODE = '23514';
  END IF;
  IF v_padre.producto_padre_id IS NOT NULL OR v_padre.variante_ejes IS NULL THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el padre tiene que ser un producto con variantes' USING ERRCODE = '23514';
  END IF;
  IF (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(NEW.variante_valores) x)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_padre.variante_ejes) x) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: la variante debe traer exactamente los ejes %', v_padre.variante_ejes USING ERRCODE = '23514';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.variante_valores) LOOP
    IF jsonb_typeof(NEW.variante_valores->k) <> 'string' OR btrim(NEW.variante_valores->>k) = '' THEN
      RAISE EXCEPTION 'VARIANTE_INVALIDA: el valor de % no puede ir vacío', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_variante_coherencia ON productos;
CREATE TRIGGER trg_productos_variante_coherencia
  BEFORE INSERT OR UPDATE OF producto_padre_id, variante_ejes, variante_valores, tenant_id ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_variante_coherencia();

-- El padre no se vende. Disparador y no cambio en agregar_item_a_ticket: cubre también combos,
-- tienda y cualquier camino futuro sin reescribir esas funciones.
CREATE OR REPLACE FUNCTION ticket_items_no_padre()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.producto_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND variante_ejes IS NOT NULL) THEN
    RAISE EXCEPTION 'PRODUCTO_CON_VARIANTES: elige la variante (talla, color) que se vende' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_items_no_padre ON ticket_items;
CREATE TRIGGER trg_ticket_items_no_padre
  BEFORE INSERT OR UPDATE OF producto_id ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION ticket_items_no_padre();
```

- [ ] **Step 4: Correrlo y verlo pasar, junto con los smokes de catálogo y venta**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql smoke_menus.sql smoke_menu_sucursal.sql smoke_combos.sql smoke_rls_venta.sql`
Esperado: `✅ 5/5 smokes en verde`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): variantes, costo y codigos unicos en productos (0189 §2)"
```

---

### Task 4: Existencias y movimientos

**Files:**
- Modify: `supabase/migrations/0189_existencias_por_producto.sql` (§3)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 4)

**Interfaces:**
- Consumes: `productos.controla_existencias` (Tarea 3).
- Produces: tipo `movimiento_producto_tipo` (`VENTA`, `DEVOLUCION`, `ENTRADA`, `AJUSTE`, `CONTEO`, `MERMA`, `TRASPASO_SALIDA`, `TRASPASO_ENTRADA`); tablas `producto_existencias(tenant_id, sucursal_id, producto_id, cantidad, minimo, actualizado_at)` y `movimientos_producto(id, tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, ticket_id, ticket_item_id, devolucion_id, traspaso_id, proveedor_id, motivo, usuario_id, creado_at)`. Insertar un movimiento mueve la existencia (disparador).

- [ ] **Step 1: Agregar el bloque 4 al smoke**

```sql
-- 4) Existencias = suma de movimientos; signos; solo lectura y aislamiento para el cajero.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_otro   uuid := 'a7a70000-0000-0000-0000-0000000000ee';
  v_ajeno  uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_hamb   uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_suc_o  uuid;
  v_n      integer;
  v_cant   numeric;
BEGIN
  -- Como postgres (lo que harán las funciones): entra 10, merma 1.
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo)
  VALUES (v_t, v_suc, v_m, 'ENTRADA', 10, 'smoke'), (v_t, v_suc, v_m, 'MERMA', -1, 'smoke');
  SELECT cantidad INTO v_cant FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  IF v_cant IS DISTINCT FROM 9 THEN RAISE EXCEPTION '4a: existencia debía ser 9, es %', v_cant; END IF;
  IF v_cant <> (SELECT sum(cantidad) FROM movimientos_producto WHERE sucursal_id = v_suc AND producto_id = v_m) THEN
    RAISE EXCEPTION '4a: existencia distinta de la suma de movimientos';
  END IF;

  -- 4b) Signo equivocado para el tipo.
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_m, 'VENTA', 1);
    RAISE EXCEPTION '4b: una VENTA positiva debía rechazarse';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4c) Producto sin control de existencias (la hamburguesa), padre o de otro negocio.
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_hamb, 'ENTRADA', 1);
    RAISE EXCEPTION '4c: un producto sin existencias no lleva movimientos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_ajeno, 'ENTRADA', 1);
    RAISE EXCEPTION '4c: producto de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF;
  END;

  -- Fila del otro negocio, para ver que el cajero no la ve.
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'R189', 'Sucursal ajena') RETURNING id INTO v_suc_o;
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  VALUES (v_otro, v_suc_o, v_ajeno, 'ENTRADA', 5);

  -- Como la cajera, con su JWT y RLS.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  SELECT count(*) INTO v_n FROM producto_existencias;
  IF v_n <> 1 THEN RAISE EXCEPTION '4d: la cajera debía ver 1 existencia (la suya), vio %', v_n; END IF;
  SELECT count(*) INTO v_n FROM movimientos_producto WHERE tenant_id = v_otro;
  IF v_n <> 0 THEN RAISE EXCEPTION '4d: ve movimientos de otro negocio'; END IF;

  BEGIN
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
    VALUES (v_t, v_suc, v_m, 'ENTRADA', 100);
    RAISE EXCEPTION '4e: la cajera no debía poder insertar movimientos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE producto_existencias SET cantidad = 999;
    RAISE EXCEPTION '4e: la cajera no debía poder escribir existencias';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM movimientos_producto;
    RAISE EXCEPTION '4e: la cajera no debía poder borrar movimientos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '4 existencias y movimientos OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `relation "movimientos_producto" does not exist`.

- [ ] **Step 3: La migración, §3**

```sql
-- ── §3 Existencias y movimientos ─────────────────────────────────────────────
-- La existencia es la SUMA de los movimientos. Nadie escribe `cantidad` a mano: un ajuste también
-- es un movimiento. Los movimientos solo se agregan. La caja (entrega 4) los crea con su propio id y
-- los sube; reenviar uno no lo duplica (PRIMARY KEY).
CREATE TYPE movimiento_producto_tipo AS ENUM (
  'VENTA', 'DEVOLUCION', 'ENTRADA', 'AJUSTE', 'CONTEO', 'MERMA', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA'
);

CREATE TABLE IF NOT EXISTS producto_existencias (
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id    uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  producto_id    uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad       numeric(12,3) NOT NULL DEFAULT 0,          -- puede ser negativa (D32)
  minimo         numeric(12,3) NULL CHECK (minimo IS NULL OR minimo >= 0),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sucursal_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant ON producto_existencias(tenant_id, sucursal_id);
COMMENT ON TABLE producto_existencias IS 'Existencia por sucursal de los productos con controla_existencias. = suma de movimientos_producto; la mantiene un disparador (0189).';

CREATE TABLE IF NOT EXISTS movimientos_producto (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id        uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  producto_id        uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  tipo               movimiento_producto_tipo NOT NULL,
  cantidad           numeric(12,3) NOT NULL,                 -- con signo
  costo_unitario_mxn numeric(12,2) NULL CHECK (costo_unitario_mxn IS NULL OR costo_unitario_mxn >= 0),
  ticket_id          uuid NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  ticket_item_id     uuid NULL REFERENCES ticket_items(id) ON DELETE RESTRICT,
  devolucion_id      uuid NULL REFERENCES devoluciones(id) ON DELETE RESTRICT,
  traspaso_id        uuid NULL,                              -- FK en §6
  proveedor_id       uuid NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  motivo             text NULL,
  usuario_id         uuid NULL REFERENCES auth.users(id),
  creado_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_producto_signo CHECK (
    (tipo IN ('VENTA', 'MERMA', 'TRASPASO_SALIDA') AND cantidad < 0)
    OR (tipo IN ('DEVOLUCION', 'ENTRADA', 'TRASPASO_ENTRADA') AND cantidad > 0)
    OR (tipo IN ('AJUSTE', 'CONTEO') AND cantidad <> 0))
);
CREATE INDEX IF NOT EXISTS idx_mov_producto_existencia ON movimientos_producto(sucursal_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_producto_tenant_fecha ON movimientos_producto(tenant_id, creado_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_producto_item ON movimientos_producto(ticket_item_id) WHERE ticket_item_id IS NOT NULL;
COMMENT ON TABLE movimientos_producto IS 'Libro de existencias por producto: solo se agrega. Se escribe solo por funciones (0189).';

-- Solo lectura para la app; escriben las funciones de esta migración (SECURITY DEFINER).
-- Sin disparador anti-DELETE: eliminar_tenant (0144) borra toda tabla con tenant_id.
ALTER TABLE producto_existencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY producto_existencias_tenant ON producto_existencias FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY movimientos_producto_tenant ON movimientos_producto FOR SELECT USING (tenant_id = current_tenant_id());
REVOKE ALL ON producto_existencias, movimientos_producto FROM PUBLIC, anon, authenticated;
GRANT SELECT ON producto_existencias, movimientos_producto TO authenticated;
GRANT ALL ON producto_existencias, movimientos_producto TO service_role;

-- Antes de insertar: el producto controla existencias, no es padre, y producto y sucursal son del
-- negocio del movimiento.
CREATE OR REPLACE FUNCTION movimientos_producto_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM productos p WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
                   AND p.controla_existencias AND p.variante_ejes IS NULL) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: el producto no lleva existencias en este negocio' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: la sucursal no es de este negocio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_movimientos_producto_validar ON movimientos_producto;
CREATE TRIGGER trg_movimientos_producto_validar
  BEFORE INSERT ON movimientos_producto
  FOR EACH ROW EXECUTE FUNCTION movimientos_producto_validar();

-- Después de insertar: la existencia se mueve en la misma cantidad. En modo réplica (el push de la
-- caja, entrega 4) esto NO corre: ese push aplica sus movimientos en modo origin, igual que la 0101.
CREATE OR REPLACE FUNCTION movimientos_producto_aplicar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id, cantidad, actualizado_at)
  VALUES (NEW.tenant_id, NEW.sucursal_id, NEW.producto_id, NEW.cantidad, now())
  ON CONFLICT (sucursal_id, producto_id) DO UPDATE
    SET cantidad = producto_existencias.cantidad + EXCLUDED.cantidad,
        actualizado_at = now();
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_movimientos_producto_aplicar ON movimientos_producto;
CREATE TRIGGER trg_movimientos_producto_aplicar
  AFTER INSERT ON movimientos_producto
  FOR EACH ROW EXECUTE FUNCTION movimientos_producto_aplicar();
```

- [ ] **Step 4: Correrlo y verlo pasar, junto con eliminar un negocio**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql smoke_eliminar_tenant.sql`
Esperado: `✅ 2/2 smokes en verde`. Si `smoke_eliminar_tenant.sql` falla nombrando una tabla nueva, revisa que ninguna tenga un disparador que impida `DELETE`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): existencias y libro de movimientos por producto (0189 §3)"
```

---

### Task 5: Venta, reabrir, cancelación y devolución

**Files:**
- Modify: `supabase/migrations/0189_existencias_por_producto.sql` (§4)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 5)

**Interfaces:**
- Consumes: `movimientos_producto` y su disparador (Tarea 4); `CAMBIO_TALLA` (Tarea 1).
- Produces: `_existencias_sincronizar_ticket(p_ticket uuid) RETURNS void` (interna) y cuatro disparadores: `trg_tickets_existencias`, `trg_ticket_items_existencias`, `trg_devoluciones_existencias` y `trg_cancelaciones_z_existencias`.

**La regla:** por cada renglón de un producto con existencias, lo que el ticket *debe* haber movido es:

| Estado del ticket | Debe haber movido |
|---|---|
| renglón cancelado | 0 |
| `PAGADO` o `FACTURADO` | −cantidad + devuelto |
| `CANCELADO` desde pagado **sin** regresar inventario | −cantidad + devuelto |
| cualquier otro (`BORRADOR`, `ABIERTO`, cancelado regresando inventario) | 0 |

"Devuelto" = suma de `devolucion_items.cantidad_devuelta` de devoluciones `CONFIRMADA` con `reversar_inventario` y `reversar_inventario_item`. Se compara con la suma de lo ya movido para ese renglón y se inserta la diferencia: `VENTA` si es negativa, `DEVOLUCION` si es positiva. Llamarla dos veces no mueve nada la segunda.

- [ ] **Step 1: Agregar el bloque 5 al smoke**

```sql
-- 5) Venta, reabrir, cancelación con y sin dinero, devolución y cambio de talla: cada pieza se
--    mueve una sola vez, y el restaurante no se entera.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g      uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_hamb   uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_turno  uuid; v_tk uuid; v_it uuid; v_it_h uuid; v_auth uuid; v_dev uuid; v_tk2 uuid;
  v_ini_m  numeric; v_ini_g numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-RET5', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT cantidad INTO v_ini_m FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;  -- 9 (bloque 4)
  v_ini_g := COALESCE((SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g), 0);

  -- 5a) Venta de 2 M + 1 hamburguesa: M baja 2; la hamburguesa no genera movimientos_producto.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-a', v_maria);
  v_it   := agregar_item_a_ticket(v_tk, v_m, 2, NULL, '[]'::jsonb, 'smoke-ret5-a-m');
  v_it_h := agregar_item_a_ticket(v_tk, v_hamb, 1, NULL, '[]'::jsonb, 'smoke-ret5-a-h');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 818, 818, NULL, NULL, NULL, false, NULL, 'smoke-ret5-a-pago');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'PAGADO' THEN RAISE EXCEPTION '5a: no quedó PAGADO'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m - 2 THEN
    RAISE EXCEPTION '5a: M debía bajar 2'; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_item_id = v_it_h) THEN
    RAISE EXCEPTION '5a: la hamburguesa no debía generar movimientos_producto'; END IF;

  -- 5b) Llamar otra vez a la sincronización no mueve nada.
  PERFORM _existencias_sincronizar_ticket(v_tk);
  IF (SELECT count(*) FROM movimientos_producto WHERE ticket_id = v_tk) <> 1 THEN
    RAISE EXCEPTION '5b: sincronizar dos veces duplicó movimientos'; END IF;

  -- 5c) Devolución parcial por cambio de talla (1 M) + venta de 1 G: M neto −1, G −1.
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'Cambio de talla')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'CAMBIO_TALLA'::devolucion_motivo,
    p_motivo_texto := 'Le quedó chica', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad_devuelta', 1)),
    p_reversar_inventario := true, p_nota := 'smoke');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  v_tk2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-c', v_maria);
  PERFORM agregar_item_a_ticket(v_tk2, v_g, 1, NULL, '[]'::jsonb, 'smoke-ret5-c-g');
  PERFORM aplicar_pago(v_tk2, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-c-pago');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m - 1 THEN
    RAISE EXCEPTION '5c: tras el cambio de talla M debía quedar en %', v_ini_m - 1; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g) <> v_ini_g - 1 THEN
    RAISE EXCEPTION '5c: G debía bajar 1 (y quedar negativa si no había: D32)'; END IF;

  -- 5d) Cancelar un ticket pagado DEVOLVIENDO dinero: cancelar_ticket_pagado crea y confirma una
  --     devolución total y además inserta la cancelación. La pieza regresa UNA vez.
  v_ini_m := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m);
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-d', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-d-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-d-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_medio_devolucion := 'EFECTIVO'::devolucion_medio, p_client_id_local := 'smoke-ret5-d');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'CANCELADO' THEN RAISE EXCEPTION '5d: no quedó CANCELADO'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m THEN
    RAISE EXCEPTION '5d: M debía volver a % (regresar una sola vez), es %', v_ini_m,
      (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m); END IF;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '5d: el neto del ticket cancelado debía ser 0'; END IF;

  -- 5d2) Cancelar un ticket pagado SIN devolver dinero (solo cancelación): también regresa una vez.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-d2', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-d2-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-d2-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := false,
    p_client_id_local := 'smoke-ret5-d2');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ini_m THEN
    RAISE EXCEPTION '5d2: M debía volver a % tras cancelar sin dinero', v_ini_m; END IF;

  -- 5e) Reabrir y volver a cobrar: neto = una sola venta.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret5-e', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret5-e-m');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-ret5-e-pago');
  -- Reabrir directo (lo que hacen reabrir_cuenta 0058/0134 por dentro: PAGADO → ABIERTO).
  UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_tk;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '5e: reabrir debía regresar la pieza'; END IF;
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_tk;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> -1 THEN
    RAISE EXCEPTION '5e: volver a cobrar debía dejar una sola venta'; END IF;

  -- 5f) La existencia sigue siendo la suma de movimientos.
  IF EXISTS (SELECT 1 FROM producto_existencias e
              WHERE e.tenant_id = v_t
                AND e.cantidad <> (SELECT sum(m.cantidad) FROM movimientos_producto m
                                    WHERE m.sucursal_id = e.sucursal_id AND m.producto_id = e.producto_id)) THEN
    RAISE EXCEPTION '5f: alguna existencia no cuadra con sus movimientos'; END IF;
  RAISE NOTICE '5 venta, reabrir, cancelación, devolución y cambio de talla OK';
END $$;
```

> Nota para quien implementa: si `aplicar_pago` rechaza 818 porque el total del ticket es otro (precio de la hamburguesa en la semilla distinto de $120), usa `(SELECT total_mxn FROM tickets WHERE id = v_tk)` como monto. Si `cancelar_ticket_pagado` no acepta `p_medio_devolucion`, revisa su firma vigente con `\df cancelar_ticket_pagado` y pásale los parámetros que pide; el resto del bloque no cambia. Si para reabrir en 5e el disparador de transición (0058) exige más columnas, usa la RPC de reabrir vigente (`grep -n "FUNCTION reabrir" supabase/migrations/0134_*.sql`).

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `5a: M debía bajar 2`.

- [ ] **Step 3: La migración, §4**

```sql
-- ── §4 Venta, reabrir, cancelación y devolución ──────────────────────────────
-- Una sola función decide cuánto debe haber movido cada renglón de un ticket y registra la
-- diferencia contra lo ya movido. Así ningún camino descuenta o regresa dos veces: cancelar un
-- ticket pagado con devolución de dinero crea una devolución Y una cancelación (0134), y reabrir
-- pasa PAGADO → ABIERTO (0058). La venta nunca falla por esto (D32): la existencia puede quedar
-- negativa.
CREATE OR REPLACE FUNCTION _existencias_sincronizar_ticket(p_ticket uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tk     tickets%ROWTYPE;
  v_canc   record;
  v_it     record;
  v_dev    numeric;
  v_debe   numeric;
  v_hecho  numeric;
  v_dif    numeric;
BEGIN
  SELECT * INTO v_tk FROM tickets WHERE id = p_ticket FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT c.reversar_inventario, c.ticket_estado_fiscal_previo INTO v_canc
    FROM cancelaciones_ticket c WHERE c.ticket_id = p_ticket ORDER BY c.created_at DESC LIMIT 1;

  FOR v_it IN
    SELECT ti.id, ti.producto_id, ti.cantidad, ti.cancelado
      FROM ticket_items ti JOIN productos p ON p.id = ti.producto_id
     WHERE ti.ticket_id = p_ticket AND p.controla_existencias
  LOOP
    SELECT COALESCE(sum(di.cantidad_devuelta), 0) INTO v_dev
      FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
     WHERE di.ticket_item_id_original = v_it.id AND d.estado = 'CONFIRMADA'
       AND d.reversar_inventario AND di.reversar_inventario_item;

    v_debe := CASE
      WHEN v_it.cancelado THEN 0
      WHEN v_tk.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN -v_it.cantidad + v_dev
      WHEN v_tk.estado_fiscal = 'CANCELADO'
           AND v_canc.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')
           AND NOT v_canc.reversar_inventario THEN -v_it.cantidad + v_dev
      ELSE 0 END;
    v_debe := LEAST(v_debe, 0);   -- nunca se regresa más de lo vendido

    SELECT COALESCE(sum(m.cantidad), 0) INTO v_hecho FROM movimientos_producto m WHERE m.ticket_item_id = v_it.id;
    v_dif := v_debe - v_hecho;
    IF v_dif <> 0 THEN
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad,
                                        ticket_id, ticket_item_id, motivo, usuario_id)
      VALUES (v_tk.tenant_id, v_tk.sucursal_id, v_it.producto_id,
              CASE WHEN v_dif < 0 THEN 'VENTA' ELSE 'DEVOLUCION' END::movimiento_producto_tipo,
              v_dif, p_ticket, v_it.id, 'Ticket ' || COALESCE(v_tk.folio_completo, p_ticket::text), auth.uid());
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION _existencias_sincronizar_ticket(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _existencias_sincronizar_ticket(uuid) TO service_role;
COMMENT ON FUNCTION _existencias_sincronizar_ticket(uuid) IS
  'Registra en movimientos_producto la diferencia entre lo que el ticket debe haber movido (por estado, cancelación y devoluciones confirmadas) y lo ya movido. Idempotente (0189).';

-- Los disparadores son SECURITY DEFINER: el cajero no tiene EXECUTE sobre la función interna.
CREATE OR REPLACE FUNCTION trg_existencias_por_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _existencias_sincronizar_ticket(NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_tickets_existencias ON tickets;
CREATE TRIGGER trg_tickets_existencias
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW WHEN (OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal)
  EXECUTE FUNCTION trg_existencias_por_ticket();

-- Un renglón que cambia en un ticket ya pagado (un ticket que nace pagado, como la tienda en
-- línea, recibe sus renglones después del cambio de estado).
CREATE OR REPLACE FUNCTION trg_existencias_por_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM productos p WHERE p.id = NEW.producto_id AND p.controla_existencias)
     AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = NEW.ticket_id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
    PERFORM _existencias_sincronizar_ticket(NEW.ticket_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_items_existencias ON ticket_items;
CREATE TRIGGER trg_ticket_items_existencias
  AFTER INSERT OR UPDATE OF cantidad, cancelado, producto_id ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_existencias_por_item();

CREATE OR REPLACE FUNCTION trg_existencias_por_devolucion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _existencias_sincronizar_ticket(NEW.ticket_original_id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_devoluciones_existencias ON devoluciones;
CREATE TRIGGER trg_devoluciones_existencias
  AFTER UPDATE OF estado ON devoluciones
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'CONFIRMADA')
  EXECUTE FUNCTION trg_existencias_por_devolucion();

-- trg_cancelacion_marcar_ticket (0009) cambia el ticket a CANCELADO en modo réplica, así que
-- trg_tickets_existencias no lo ve. Este disparador corre después (orden alfabético: "z").
CREATE OR REPLACE FUNCTION trg_existencias_por_cancelacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _existencias_sincronizar_ticket(NEW.ticket_id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_cancelaciones_z_existencias ON cancelaciones_ticket;
CREATE TRIGGER trg_cancelaciones_z_existencias
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_existencias_por_cancelacion();
```

- [ ] **Step 4: Correrlo y verlo pasar, con los smokes de venta, cancelación y devolución**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql smoke_cancelar_ticket.sql smoke_cancelar_item.sql smoke_devolucion.sql smoke_doble_devolucion.sql smoke_reabrir_cuenta_impresa.sql smoke_cobro_offline.sql smoke_recetas.sql`
Esperado: `✅ 8/8 smokes en verde`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): venta, reabrir, cancelacion y devolucion mueven existencias una vez (0189 §4)"
```

---

### Task 6: Entradas, ajustes, mermas y conteo

**Files:**
- Modify: `supabase/migrations/0189_existencias_por_producto.sql` (§5)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 6)

**Interfaces:**
- Consumes: `movimientos_producto` (Tarea 4); `modulos_efectivos(t)->'efectivos'->>'existencias'` (Tarea 2); `usuario_actual_tiene_permiso(text)` (0133).
- Produces:
  - `registrar_movimiento_producto(p_sucursal uuid, p_producto uuid, p_tipo movimiento_producto_tipo, p_cantidad numeric, p_costo_unitario numeric DEFAULT NULL, p_motivo text DEFAULT NULL, p_proveedor uuid DEFAULT NULL) RETURNS uuid`. Tipos: `ENTRADA` y `MERMA` reciben la cantidad en positivo; `AJUSTE` con signo y distinto de cero. `ENTRADA` con costo actualiza `productos.costo_mxn`.
  - `registrar_conteo(p_sucursal uuid, p_conteo jsonb) RETURNS jsonb`. `p_conteo` = `[{"producto_id": uuid, "contado": number}]`. Regresa `{"ajustados": int, "diferencias": [{"producto_id","sistema","contado","diferencia"}]}`. Todo o nada.
  - Errores: `SIN_PERMISO` (42501), `MODULO_APAGADO` (42501), `DATOS_INVALIDOS: …` (22023).

- [ ] **Step 1: Agregar el bloque 6 al smoke**

```sql
-- 6) Movimientos a mano: permiso, módulo, entradas malas, costo y conteo.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_m      uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g      uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_padre  uuid := 'a7a70000-0000-0000-0000-0000000000a0';
  v_ajeno  uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_antes  numeric; v_r jsonb; v_n int;
BEGIN
  -- 6a) La cajera no tiene config.productos.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  BEGIN
    PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 5);
    RAISE EXCEPTION '6a: la cajera no debía poder registrar entradas';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF;
  END;

  -- Como el dueño.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_t::text)::text, true);

  -- 6b) Entrada de 5 a $160: sube 5 y el costo queda en 160.
  SELECT cantidad INTO v_antes FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 5, 160, 'Llegó pedido');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes + 5 THEN
    RAISE EXCEPTION '6b: la entrada no sumó 5'; END IF;
  IF (SELECT costo_mxn FROM productos WHERE id = v_m) <> 160 THEN RAISE EXCEPTION '6b: el costo no quedó en 160'; END IF;

  -- 6c) Merma de 1 (positiva al pedirla, negativa en el libro) y ajuste de −2.
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'MERMA', 1, NULL, 'Mancha');
  PERFORM registrar_movimiento_producto(v_suc, v_m, 'AJUSTE', -2, NULL, 'Error de captura');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes + 2 THEN
    RAISE EXCEPTION '6c: merma y ajuste no cuadran'; END IF;

  -- 6d) Entradas malas: cero, merma negativa, tipo no manual, padre, producto ajeno.
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 0);
        RAISE EXCEPTION '6d: entrada 0'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'MERMA', -1);
        RAISE EXCEPTION '6d: merma negativa'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'VENTA', 1);
        RAISE EXCEPTION '6d: venta a mano'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_padre, 'ENTRADA', 1);
        RAISE EXCEPTION '6d: padre'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_ajeno, 'ENTRADA', 1);
        RAISE EXCEPTION '6d: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  -- 6e) Conteo: M contado 4 y G contado 0 (G venía en −1 por la venta del bloque 5). Los dos quedan
  --     en lo contado; un segundo conteo idéntico no genera nada.
  v_r := registrar_conteo(v_suc, jsonb_build_array(
           jsonb_build_object('producto_id', v_m, 'contado', 4),
           jsonb_build_object('producto_id', v_g, 'contado', 0)));
  IF (v_r->>'ajustados')::int <> 2 THEN RAISE EXCEPTION '6e: debía ajustar 2, ajustó %', v_r; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 4
     OR (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g) <> 0 THEN
    RAISE EXCEPTION '6e: M debía quedar en 4 y G en 0 tras el conteo'; END IF;
  v_r := registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'contado', 4)));
  IF (v_r->>'ajustados')::int <> 0 THEN RAISE EXCEPTION '6e: un conteo igual no debía ajustar nada'; END IF;

  -- 6f) Conteo malo (producto repetido, contado negativo, ajeno): nada cambia.
  SELECT count(*) INTO v_n FROM movimientos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(
          jsonb_build_object('producto_id', v_m, 'contado', 1), jsonb_build_object('producto_id', v_m, 'contado', 2)));
        RAISE EXCEPTION '6f: repetido'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'contado', -1)));
        RAISE EXCEPTION '6f: negativo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM registrar_conteo(v_suc, jsonb_build_array(
          jsonb_build_object('producto_id', v_g, 'contado', 0), jsonb_build_object('producto_id', v_ajeno, 'contado', 1)));
        RAISE EXCEPTION '6f: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM movimientos_producto WHERE tenant_id = v_t) <> v_n THEN
    RAISE EXCEPTION '6f: un conteo rechazado dejó movimientos'; END IF;

  -- 6g) Con el módulo apagado, nada a mano.
  PERFORM operacion_cambiar(v_t, '{"existencias":false}');
  BEGIN PERFORM registrar_movimiento_producto(v_suc, v_m, 'ENTRADA', 1);
        RAISE EXCEPTION '6g: módulo apagado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MODULO_APAGADO%' THEN RAISE; END IF; END;
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  RAISE NOTICE '6 movimientos a mano y conteo OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `function registrar_movimiento_producto(...) does not exist`.

- [ ] **Step 3: La migración, §5**

```sql
-- ── §5 Movimientos a mano: entrada, ajuste, merma y conteo ───────────────────
-- Las escribe el dueño (o quien tenga config.productos) desde el admin, con el módulo encendido.
-- SECURITY DEFINER porque la app no tiene INSERT sobre movimientos_producto; por eso cada función
-- comprueba el negocio, el permiso y el módulo antes de tocar nada.
CREATE OR REPLACE FUNCTION _existencias_puede_escribir()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_t uuid := current_tenant_id();
BEGIN
  IF v_t IS NULL OR NOT usuario_actual_tiene_permiso('config.productos') THEN
    RAISE EXCEPTION 'SIN_PERMISO: tu rol no puede mover existencias' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((modulos_efectivos(v_t)->'efectivos'->>'existencias')::boolean, false) THEN
    RAISE EXCEPTION 'MODULO_APAGADO: existencias no está encendido para este negocio' USING ERRCODE = '42501';
  END IF;
  RETURN v_t;
END;
$$;
REVOKE ALL ON FUNCTION _existencias_puede_escribir() FROM PUBLIC, anon, authenticated;

-- Producto y sucursal válidos para un movimiento a mano, con mensaje que el dueño entiende.
CREATE OR REPLACE FUNCTION _existencias_validar(p_tenant uuid, p_sucursal uuid, p_producto uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM productos WHERE id = p_producto AND tenant_id = p_tenant AND deleted_at IS NULL
                   AND controla_existencias AND variante_ejes IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese producto no lleva existencias (o es el padre: elige la variante)' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _existencias_validar(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION registrar_movimiento_producto(
  p_sucursal       uuid,
  p_producto       uuid,
  p_tipo           movimiento_producto_tipo,
  p_cantidad       numeric,
  p_costo_unitario numeric DEFAULT NULL,
  p_motivo         text DEFAULT NULL,
  p_proveedor      uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t   uuid := _existencias_puede_escribir();
  v_q   numeric;
  v_id  uuid;
BEGIN
  PERFORM _existencias_validar(v_t, p_sucursal, p_producto);
  IF p_tipo NOT IN ('ENTRADA', 'MERMA', 'AJUSTE') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: a mano solo se registran entradas, mermas y ajustes' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad = 0
     OR (p_tipo IN ('ENTRADA', 'MERMA') AND p_cantidad < 0) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: cantidad inválida para %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_costo_unitario IS NOT NULL AND (p_costo_unitario < 0 OR p_tipo <> 'ENTRADA') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el costo solo va en una entrada y no puede ser negativo' USING ERRCODE = '22023';
  END IF;
  IF p_proveedor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores WHERE id = p_proveedor AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el proveedor no es de tu negocio' USING ERRCODE = '22023';
  END IF;

  v_q := CASE p_tipo WHEN 'MERMA' THEN -p_cantidad ELSE p_cantidad END;
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn,
                                    proveedor_id, motivo, usuario_id)
  VALUES (v_t, p_sucursal, p_producto, p_tipo, v_q, p_costo_unitario, p_proveedor, p_motivo, auth.uid())
  RETURNING id INTO v_id;

  IF p_tipo = 'ENTRADA' AND p_costo_unitario IS NOT NULL THEN
    UPDATE productos SET costo_mxn = p_costo_unitario, updated_at = now() WHERE id = p_producto;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION registrar_movimiento_producto(uuid, uuid, movimiento_producto_tipo, numeric, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_movimiento_producto(uuid, uuid, movimiento_producto_tipo, numeric, numeric, text, uuid) TO authenticated, service_role;

-- Conteo físico: lo contado manda. Se registra la diferencia contra el sistema al momento de
-- confirmar (con la fila bloqueada, para que una venta simultánea no se pierda). Todo o nada.
CREATE OR REPLACE FUNCTION registrar_conteo(p_sucursal uuid, p_conteo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t       uuid := _existencias_puede_escribir();
  v_fila    jsonb;
  v_prod    uuid;
  v_contado numeric;
  v_sistema numeric;
  v_n       int := 0;
  v_dif     jsonb := '[]'::jsonb;
BEGIN
  IF p_conteo IS NULL OR jsonb_typeof(p_conteo) <> 'array' OR jsonb_array_length(p_conteo) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el conteo viene vacío' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'producto_id') FROM jsonb_array_elements(p_conteo) e) <> jsonb_array_length(p_conteo) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un producto viene dos veces en el conteo' USING ERRCODE = '22023';
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_conteo) LOOP
    BEGIN
      v_prod    := (v_fila->>'producto_id')::uuid;
      v_contado := (v_fila->>'contado')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: renglón de conteo mal formado: %', v_fila USING ERRCODE = '22023';
    END;
    IF v_prod IS NULL OR v_contado IS NULL OR v_contado < 0 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: renglón de conteo mal formado: %', v_fila USING ERRCODE = '22023';
    END IF;
    PERFORM _existencias_validar(v_t, p_sucursal, v_prod);

    SELECT cantidad INTO v_sistema FROM producto_existencias
     WHERE sucursal_id = p_sucursal AND producto_id = v_prod FOR UPDATE;
    v_sistema := COALESCE(v_sistema, 0);
    IF v_contado <> v_sistema THEN
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo, usuario_id)
      VALUES (v_t, p_sucursal, v_prod, 'CONTEO', v_contado - v_sistema, 'Conteo físico', auth.uid());
      v_n := v_n + 1;
    END IF;
    v_dif := v_dif || jsonb_build_object('producto_id', v_prod, 'sistema', v_sistema,
                                         'contado', v_contado, 'diferencia', v_contado - v_sistema);
  END LOOP;
  RETURN jsonb_build_object('ajustados', v_n, 'diferencias', v_dif);
END;
$$;
REVOKE ALL ON FUNCTION registrar_conteo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_conteo(uuid, jsonb) TO authenticated, service_role;
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `✅ smoke_existencias_producto.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): entradas, mermas, ajustes y conteo de existencias (0189 §5)"
```

---

### Task 7: Traspasos entre sucursales

**Files:**
- Modify: `supabase/migrations/0189_existencias_por_producto.sql` (§6)
- Modify: `supabase/scripts/smoke_existencias_producto.sql` (bloque 7)

**Interfaces:**
- Consumes: `_existencias_puede_escribir()`, `_existencias_validar(...)` (Tarea 6).
- Produces: tipo `traspaso_producto_estado` (`ENVIADO`, `RECIBIDO`); tabla `traspasos_producto(id, tenant_id, origen_sucursal_id, destino_sucursal_id, estado, lineas jsonb, enviado_por, enviado_at, recibido_por, recibido_at)`; `enviar_traspaso_producto(p_origen uuid, p_destino uuid, p_lineas jsonb) RETURNS uuid` con `p_lineas = [{"producto_id": uuid, "cantidad": number}]`; `recibir_traspaso_producto(p_traspaso uuid) RETURNS void`.

- [ ] **Step 1: Agregar el bloque 7 al smoke**

```sql
-- 7) Traspaso: sale al enviar, entra al recibir, una sola vez; entradas malas no dejan nada.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno uuid := '99999999-0000-0000-0000-0000000000e1';
  v_m     uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_norte uuid := gen_random_uuid();
  v_tr    uuid; v_antes numeric; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_t::text)::text, true);
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_t, 'RN', 'Tienda Norte');

  SELECT cantidad INTO v_antes FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m;
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 3)));
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_antes - 3 THEN
    RAISE EXCEPTION '7a: el origen debía bajar 3 al enviar'; END IF;
  IF EXISTS (SELECT 1 FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_m AND cantidad <> 0) THEN
    RAISE EXCEPTION '7a: el destino no debía subir antes de recibir'; END IF;

  PERFORM recibir_traspaso_producto(v_tr);
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_m) <> 3 THEN
    RAISE EXCEPTION '7b: el destino debía quedar en 3'; END IF;
  BEGIN PERFORM recibir_traspaso_producto(v_tr);
        RAISE EXCEPTION '7c: recibir dos veces'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  SELECT count(*) INTO v_n FROM traspasos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 1)));
        RAISE EXCEPTION '7d: misma sucursal'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_m, 'cantidad', 0)));
        RAISE EXCEPTION '7d: cantidad 0'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, '[]'::jsonb);
        RAISE EXCEPTION '7d: vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM traspasos_producto WHERE tenant_id = v_t) <> v_n THEN
    RAISE EXCEPTION '7d: un traspaso rechazado quedó guardado'; END IF;
  RAISE NOTICE '7 traspasos OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql`
Esperado: `❌` con `function enviar_traspaso_producto(...) does not exist`.

- [ ] **Step 3: La migración, §6**

```sql
-- ── §6 Traspasos entre sucursales ────────────────────────────────────────────
-- Sale del origen al enviar; entra al destino cuando el destino lo recibe. Lo que va en camino no
-- está en ninguna de las dos. Las líneas viven en jsonb: el detalle por producto ya queda en
-- movimientos_producto con traspaso_id.
CREATE TYPE traspaso_producto_estado AS ENUM ('ENVIADO', 'RECIBIDO');

CREATE TABLE IF NOT EXISTS traspasos_producto (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  origen_sucursal_id  uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  destino_sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  estado              traspaso_producto_estado NOT NULL DEFAULT 'ENVIADO',
  lineas              jsonb NOT NULL CHECK (jsonb_typeof(lineas) = 'array' AND jsonb_array_length(lineas) > 0),
  enviado_por         uuid NULL REFERENCES auth.users(id),
  enviado_at          timestamptz NOT NULL DEFAULT now(),
  recibido_por        uuid NULL REFERENCES auth.users(id),
  recibido_at         timestamptz NULL,
  CONSTRAINT traspasos_producto_distintas CHECK (origen_sucursal_id <> destino_sucursal_id)
);
CREATE INDEX IF NOT EXISTS idx_traspasos_producto_tenant ON traspasos_producto(tenant_id, estado, enviado_at DESC);
ALTER TABLE movimientos_producto
  ADD CONSTRAINT movimientos_producto_traspaso_fk FOREIGN KEY (traspaso_id) REFERENCES traspasos_producto(id) ON DELETE RESTRICT;

ALTER TABLE traspasos_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY traspasos_producto_tenant ON traspasos_producto FOR SELECT USING (tenant_id = current_tenant_id());
REVOKE ALL ON traspasos_producto FROM PUBLIC, anon, authenticated;
GRANT SELECT ON traspasos_producto TO authenticated;
GRANT ALL ON traspasos_producto TO service_role;

CREATE OR REPLACE FUNCTION enviar_traspaso_producto(p_origen uuid, p_destino uuid, p_lineas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t    uuid := _existencias_puede_escribir();
  v_id   uuid;
  v_l    jsonb;
  v_prod uuid;
  v_q    numeric;
BEGIN
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen = p_destino THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el traspaso necesita dos sucursales distintas' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_destino AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal destino no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el traspaso viene vacío' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'producto_id') FROM jsonb_array_elements(p_lineas) e) <> jsonb_array_length(p_lineas) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un producto viene dos veces en el traspaso' USING ERRCODE = '22023';
  END IF;

  INSERT INTO traspasos_producto (tenant_id, origen_sucursal_id, destino_sucursal_id, lineas, enviado_por)
  VALUES (v_t, p_origen, p_destino, p_lineas, auth.uid()) RETURNING id INTO v_id;

  FOR v_l IN SELECT value FROM jsonb_array_elements(p_lineas) LOOP
    BEGIN
      v_prod := (v_l->>'producto_id')::uuid;
      v_q    := (v_l->>'cantidad')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: línea de traspaso mal formada: %', v_l USING ERRCODE = '22023';
    END;
    IF v_prod IS NULL OR v_q IS NULL OR v_q <= 0 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: línea de traspaso mal formada: %', v_l USING ERRCODE = '22023';
    END IF;
    PERFORM _existencias_validar(v_t, p_origen, v_prod);
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, p_origen, v_prod, 'TRASPASO_SALIDA', -v_q, v_id, 'Traspaso enviado', auth.uid());
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION recibir_traspaso_producto(p_traspaso uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t  uuid := _existencias_puede_escribir();
  v_tr traspasos_producto%ROWTYPE;
  v_l  jsonb;
BEGIN
  SELECT * INTO v_tr FROM traspasos_producto WHERE id = p_traspaso AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso no existe' USING ERRCODE = '22023';
  END IF;
  IF v_tr.estado <> 'ENVIADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso ya se recibió' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_tr.lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, v_tr.destino_sucursal_id, (v_l->>'producto_id')::uuid, 'TRASPASO_ENTRADA',
            (v_l->>'cantidad')::numeric, p_traspaso, 'Traspaso recibido', auth.uid());
  END LOOP;
  UPDATE traspasos_producto SET estado = 'RECIBIDO', recibido_por = auth.uid(), recibido_at = now() WHERE id = p_traspaso;
END;
$$;
REVOKE ALL ON FUNCTION recibir_traspaso_producto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recibir_traspaso_producto(uuid) TO authenticated, service_role;
```

- [ ] **Step 4: Correrlo y verlo pasar, con eliminar un negocio**

Run: `cd desktop && npm run smokes -- smoke_existencias_producto.sql smoke_eliminar_tenant.sql`
Esperado: `✅ 2/2 smokes en verde`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0189_existencias_por_producto.sql supabase/scripts/smoke_existencias_producto.sql
git commit -m "feat(retail): traspasos de existencias entre sucursales (0189 §6)"
```

---

### Task 8: ADR, tipos y verificación completa

**Files:**
- Create: `docs/decisiones/0037-el-stock-de-una-tienda-vive-en-el-producto.md`
- Modify: `docs/decisiones/README.md` (renglón después del 0036)
- Regenerate: tipos de `pnpm db:types`

- [ ] **Step 1: El ADR**

```markdown
# 0037 — El stock de una tienda vive en el producto, no en una receta

**Fecha:** 15 de octubre de 2026 · **Estado:** vigente (entrega 1 de 5 del giro RETAIL)

## Qué había antes

El inventario solo existía por insumo: una venta descuenta lo que dice la receta del producto
(ADR 0012/0013). Para una tienda de ropa eso obliga a una receta 1:1 por prenda, y no hay tallas
ni colores.

## Qué hacemos ahora

- **Giro `RETAIL`** (ropa, boutique y calzado). Arranca con `mostrador` y `existencias`; todo lo de
  restaurante apagado. **No se asigna a nadie** hasta que la 0188 viaje en un instalador que tengan
  todas las cajas (misma regla que el ADR 0034).
- **Módulo de operación `existencias`**, que mueve VIM. No depende del plan: una tienda sin existencias
  no sirve (decisión de Fermín, 15 oct). Apagado para todos los negocios que ya existían.
- **Variantes = productos.** La hija ("Playera Polo · M · Negra") apunta a su padre y tiene su SKU,
  código de barras, precio y existencias. El padre no se vende.
- **Existencias propias por producto** (`producto_existencias`), como suma de un libro que solo se
  agrega (`movimientos_producto`). Un producto lleva existencias **o** receta, nunca las dos.
- **Una sola función** decide cuánto debe haber movido cada renglón de un ticket y registra la
  diferencia. Venta, reabrir, cancelación y devolución la llaman; ninguna escribe por su cuenta.
- **Se vende sin existencia** (D32): queda negativa y aparece en alertas.

## Ajustes al spec

- Defecto y "no le gustó" reutilizan `PRODUCTO_DEFECTUOSO` y `CLIENTE_NO_SATISFECHO`; solo se agregó
  `CAMBIO_TALLA`.
- La hija siempre tiene precio propio; el admin lo prellena con el del padre.
- El cambio de talla en un solo flujo (con el dinero) es de la entrega 4. En la base son una
  devolución parcial y una venta.
- SKU y código de barras únicos solo entre productos con existencias. Así la 0189 no puede fallar
  en ninguna base que ya exista (la nube o el Postgres de cada caja instalada), y los restaurantes
  pueden seguir repitiéndolos.

## Cómo se despliega (no es obvio)

- La 0188 (solo `ADD VALUE`) y la 0189 van a producción a mano, **cada una en su transacción**.
- Esta entrega no necesita instalador: nadie es RETAIL. La caja que ya traiga la 0189 descuenta en
  su Postgres local, pero **sus movimientos no suben hasta la entrega 4** (sync).

## Por qué

Reutilizar insumos ocultos (uno por prenda) ahorraba la sincronización, pero ensuciaba el catálogo
de insumos y las recetas con algo que no es una receta. Fermín eligió stock propio sabiendo que
la sincronización con la caja (entrega 4) se escribe aparte, copiando el patrón de la 0101.

Spec: `docs/superpowers/specs/2026-10-15-giro-retail-design.md`.
```

En `docs/decisiones/README.md`, después del renglón 0036:

```markdown
| [0037](0037-el-stock-de-una-tienda-vive-en-el-producto.md) | El stock de una tienda vive en el producto, no en una receta | 15/10/2026 |
```

- [ ] **Step 2: Regenerar tipos**

Run: `pnpm db:types` desde la raíz de `vim-pos-retail/`, con el Supabase local arriba y las dos migraciones aplicadas.
Esperado: el archivo de tipos trae `RETAIL` en `vertical_tipo`, `CAMBIO_TALLA` en `devolucion_motivo`, las columnas nuevas de `productos`, las tres tablas nuevas y las funciones `registrar_movimiento_producto`, `registrar_conteo`, `enviar_traspaso_producto` y `recibir_traspaso_producto`. Verifica que compile con `pnpm -r exec tsc --noEmit`, **no** con `next build` (rompe el dev server).

Si `tsc` se queja de que `vertical_tipo` ahora incluye `RETAIL` en algún `Record<vertical_tipo, …>` o `switch` exhaustivo, agrégale `RETAIL` con el nombre "Tienda de ropa o calzado". Si es `packages/db/src/operacion.ts` (`GIROS`), agrégalo con `ofrecido: false`.

- [ ] **Step 3: Todos los smokes**

Run: `cd desktop && npm run smokes`
Esperado: `✅ N/N smokes en verde`. Un rojo que no tenga que ver con esto se reporta, no se "arregla" en esta rama (ver `reference_pruebas_escritorio_windows` en la memoria para los rojos conocidos de Windows).

- [ ] **Step 4: Commit**

```bash
git add docs/decisiones/0037-el-stock-de-una-tienda-vive-en-el-producto.md docs/decisiones/README.md <archivo de tipos regenerado> <archivos TS tocados en el Step 2>
git commit -m "docs(retail): ADR 0037 y tipos regenerados"
```

- [ ] **Step 5: Cierre local (sin push, sin PR, sin producción)**

**Regla de Fermín (15 oct): todo el giro RETAIL se trabaja en local hasta que esté al 100 %.** Esta entrega termina en la rama local `feat/retail-nucleo` con todos los smokes en verde. **No** se hace push, **no** se abre PR y **no** se aplica nada a producción. Las entregas 2 a 5 se apilan encima, en local.

- Reportar a Fermín el resultado de los smokes y el hallazgo del doble regreso de insumos al cancelar un ticket pagado con devolución de dinero (fuera de alcance aquí).
- Cuando las cinco entregas estén completas y Fermín dé el OK, se sigue el orden de lanzamiento del spec §7. La 0188 y la 0189 van a producción a mano, en ese orden y cada una en su transacción, y antes del merge.

## Lo que esta entrega no hace (va en la 2 a la 5)

- Ninguna pantalla: ni catálogo con matriz, ni existencias en el admin, ni caja retail.
- Código EAN-13 interno, importar CSV, etiquetas PDF (entrega 2).
- Mínimo por producto editable, alertas visibles y reportes (entrega 3).
- La sincronización de `movimientos_producto` y `producto_existencias` con la caja, y el cambio de talla en un solo flujo con el dinero (entrega 4).
- Liberar `RETAIL` en `cambiar_giro`, `_shared/alta.ts`, `prospectos.giro` y el registro (entrega 5).
