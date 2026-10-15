# Giros y módulos de operación · Entrega 1: el núcleo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la base de datos sepa qué módulos de operación tiene encendidos cada negocio, que el alta los fije según el giro, que solo VIM los pueda cambiar y que `modulos_efectivos` los entregue, **sin que ningún cliente existente note nada**.

**Architecture:** Dos migraciones. La 0179 solo agrega los giros nuevos al tipo `vertical_tipo` (un valor nuevo de un enum no se puede usar en la misma transacción, y la caja aplica cada archivo como una sola consulta). La 0180 agrega `tenants.operacion jsonb` (por defecto todo encendido), la función `juego_inicial_de_giro`, un disparador que solo corrige dependencias, las funciones de /platform `operacion_cambiar` y `cambiar_giro` (solo `service_role`), la nueva versión de `modulos_efectivos` con las diez llaves y el alta por giro. Ninguna pantalla cambia en esta entrega; eso es la entrega 2.

**Tech Stack:** PostgreSQL 15 (Supabase), plpgsql, smokes `.sql` corridos por `desktop/scripts/smokes.mjs` sobre un Postgres embebido recién sembrado.

**Spec:** `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md` (§4, §5, §6 y §9; la entrega 1 de §3).

## Global Constraints

- Los clientes existentes conservan **todo encendido**: el valor por defecto de `tenants.operacion` es todo `true`.
- **Solo VIM** cambia los módulos: `operacion_cambiar` y `cambiar_giro` solo para `service_role`; `authenticated` no puede escribir en `tenants.operacion` (la 0132 ya limita el UPDATE de `tenants` a una lista de columnas, y `operacion` no entra en ella).
- Las diez llaves, exactas: `mostrador`, `comedor`, `meseros`, `domicilio`, `repartidores`, `kds`, `reservaciones`, `marcas`, `eventos`, `cuentas_barra`.
- Dependencias: `meseros` requiere `comedor`; `repartidores` requiere `domicilio`.
- No se apaga `comedor` ni `cuentas_barra` con cuentas abiertas de ese tipo.
- `kds` y `reservaciones` efectivos = plan **Y** interruptor de operación.
- Giros que se ofrecen: `QUICK_SERVICE`, `FULL_SERVICE`, `FOODTRUCK`, `DARK_KITCHEN`, `BAR`, `CAFETERIA`, `TAQUERIA`. `CAFE_BAR` y `ENTERPRISE` quedan en el tipo pero no se ofrecen; `cambiar_giro` los rechaza.
- Nada de `CURRENT_DATE` contra fechas de negocio en los smokes: `(now() AT TIME ZONE 'America/Mexico_City')::date`.
- Una migración aplicada en remoto no se edita. Migraciones a producción **a mano y antes del merge**.
- Antes de crear los archivos, confirmar que 0179 y 0180 siguen libres en `origin/main` (otras sesiones toman números). Si no, usar los dos siguientes y ajustar el plan.

## Review Focus

1. **La caja recibe por sincronización `comedor` apagado mientras todavía tiene mesas abiertas en su Postgres.** El pull escribe `tenants` con `session_replication_role = replica`; nada debe fallar ahí. Por eso el candado de cuentas abiertas vive en `operacion_cambiar` y no en el disparador. Prueba en la Tarea 3.
2. **Cambios mal formados desde /platform** (llave desconocida, `"true"` como texto, `null`, un arreglo): error claro y nada cambia. Prueba en la Tarea 3.
3. **Cambiar a un giro retirado** (`CAFE_BAR`, `ENTERPRISE`): se rechaza. Prueba en la Tarea 3.
4. **Un cliente existente (la semilla, plan QS) queda idéntico**: todo encendido y `kds` efectivo igual que antes. Prueba en las Tareas 2 y 4.
5. **La redefinición de `modulos_efectivos` no pierde nada**: siguen `recetas`, `promociones`, `cfdi`, `delivery_apps`, `lealtad` y `tienda`, y sigue devolviendo NULL para otro negocio. Prueba en la Tarea 4, más correr todos los smokes en la Tarea 6.

## Hallazgos que el plan ya considera

- `crear_tenant_con_owner` (versión vigente en la 0141) no crea sucursal ni `configuracion_tenant`; las sucursales nacen después, desde el admin (`apps/admin/app/lib/configuracion.ts:430`).
- `desktop/src/sync-pull.mjs:712` baja los datos con `session_replication_role = replica`, así que los disparadores no corren en la caja: el de `tenants` no toca el pull.
- **La propina inicial por giro se pasa a la entrega 2.** Ni la semilla ni los smokes crean `sucursal_propinas_config`: dependen de su valor por defecto (`true`). Un disparador en `sucursales` cambiaría eso también para las sucursales nuevas de clientes existentes. Además, esa tabla no está en el pull de la caja, así que la caja instalada no la vería. Va junto con la primera vez (que crea la sucursal) y con su sincronización.
- `configuracion_tenant.politica_cobro_cocina` hoy no la lee ninguna app. Aquí solo se fija su valor inicial; obedecerla es la entrega 2.

## Archivos

- Crear: `supabase/migrations/0179_giros_nuevos.sql` — solo los `ADD VALUE`.
- Crear: `supabase/migrations/0180_modulos_de_operacion.sql` — todo lo demás, en secciones §1–§5 (una por tarea).
- Crear: `supabase/scripts/smoke_giros_operacion.sql` — un bloque `DO` por tarea.
- Crear: `docs/decisiones/0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md`.
- Modificar: `docs/decisiones/README.md` (índice).
- Regenerar: los tipos de `pnpm db:types`.

---

### Task 0: Rama

- [ ] **Step 1: Crear la rama desde `origin/main`**

```bash
cd vim-pos
git fetch origin
git switch -c feat/giros-nucleo origin/main
ls supabase/migrations | tail -3
```

Esperado: la última es `0178_tienda_modo_de_prueba_y_freno.sql`. Si hay 0179 o 0180, renumera en todo el plan.

---

### Task 1: Giros nuevos en el tipo

**Files:**
- Create: `supabase/migrations/0179_giros_nuevos.sql`
- Create: `supabase/scripts/smoke_giros_operacion.sql`

**Interfaces:**
- Produces: valores `BAR`, `CAFETERIA` y `TAQUERIA` en `vertical_tipo`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_giros_operacion.sql`:

```sql
-- Smoke giros y módulos de operación (spec 2026-10-14-giros-y-modulos-de-operacion-design.md,
-- migraciones 0179 y 0180). Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los giros nuevos existen en el tipo.
DO $$
BEGIN
  IF NOT ('BAR' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'CAFETERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'TAQUERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])) THEN
    RAISE EXCEPTION '1: faltan giros en vertical_tipo: %', enum_range(NULL::vertical_tipo);
  END IF;
  RAISE NOTICE '1 giros nuevos OK';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `❌ smoke_giros_operacion.sql` con `1: faltan giros en vertical_tipo`.

- [ ] **Step 3: La migración**

`supabase/migrations/0179_giros_nuevos.sql`:

```sql
-- Giros nuevos (spec 2026-10-14-giros-y-modulos-de-operacion-design.md §6.1, ADR 0034).
--
-- Este archivo trae SOLO los ADD VALUE. Postgres no deja usar un valor nuevo de un enum en la
-- misma transacción en que se agrega, y la caja aplica cada archivo de migraciones como una sola
-- consulta (desktop/src/runtime.mjs). Los valores se usan a partir de la 0180.
--
-- CAFE_BAR y ENTERPRISE se quedan en el tipo (quitar un valor de un enum exige recrearlo), pero
-- ya no se ofrecen: CAFE_BAR se separa en BAR y CAFETERIA, y ENTERPRISE pasó a ser el plan Cadena.
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'BAR';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'CAFETERIA';
ALTER TYPE vertical_tipo ADD VALUE IF NOT EXISTS 'TAQUERIA';
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `✅ smoke_giros_operacion.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0179_giros_nuevos.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(giros): agrega Bar, Cafetería y Taquería al tipo de giro"
```

---

### Task 2: Interruptores de operación y juego inicial

**Files:**
- Create: `supabase/migrations/0180_modulos_de_operacion.sql` (§1 y §2)
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (bloque 2, antes del `ROLLBACK;` final)

**Interfaces:**
- Consumes: valores de la Tarea 1.
- Produces:
  - `juego_inicial_de_giro(p_giro vertical_tipo) RETURNS jsonb`: las diez llaves; con NULL, `ENTERPRISE` o un valor desconocido devuelve todo `true`.
  - `cobro_inicial_de_giro(p_giro vertical_tipo) RETURNS varchar`: `'COBRO_PRIMERO'` o `'COCINA_PRIMERO'`.
  - `operacion_normalizar(p jsonb) RETURNS jsonb`: completa las llaves que falten con `true`, rechaza llaves desconocidas o valores que no sean booleanos (ERRCODE `22023`, mensaje `MODULO_DESCONOCIDO: <llave>` o `MODULO_NO_BOOLEANO: <llave>`), y apaga `meseros` sin `comedor` y `repartidores` sin `domicilio`.
  - Columna `tenants.operacion jsonb NOT NULL`, con disparador `tenants_operacion_normalizar` (BEFORE INSERT OR UPDATE OF operacion).

- [ ] **Step 1: Escribir la prueba que falla**

Agregar antes del `ROLLBACK;` final de `smoke_giros_operacion.sql`:

```sql
-- 2) Juego inicial por giro (tabla §5 del spec), cliente existente intacto, dependencias.
DO $$
DECLARE
  v_todo jsonb := '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}';
  v_op   jsonb;
BEGIN
  IF juego_inicial_de_giro('QUICK_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: QUICK_SERVICE: %', juego_inicial_de_giro('QUICK_SERVICE'); END IF;
  IF juego_inicial_de_giro('FULL_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FULL_SERVICE: %', juego_inicial_de_giro('FULL_SERVICE'); END IF;
  IF juego_inicial_de_giro('FOODTRUCK') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FOODTRUCK: %', juego_inicial_de_giro('FOODTRUCK'); END IF;
  IF juego_inicial_de_giro('DARK_KITCHEN') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: DARK_KITCHEN: %', juego_inicial_de_giro('DARK_KITCHEN'); END IF;
  IF juego_inicial_de_giro('BAR') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'::jsonb
  THEN RAISE EXCEPTION '2a: BAR: %', juego_inicial_de_giro('BAR'); END IF;
  IF juego_inicial_de_giro('CAFETERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: CAFETERIA: %', juego_inicial_de_giro('CAFETERIA'); END IF;
  IF juego_inicial_de_giro('TAQUERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: TAQUERIA: %', juego_inicial_de_giro('TAQUERIA'); END IF;
  IF juego_inicial_de_giro('ENTERPRISE') IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: ENTERPRISE debía ser todo encendido'; END IF;
  IF juego_inicial_de_giro(NULL) IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: NULL debía ser todo encendido'; END IF;
  RAISE NOTICE '2a juego inicial de los 7 giros OK';

  IF cobro_inicial_de_giro('FULL_SERVICE') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('TAQUERIA') <> 'COCINA_PRIMERO'
     OR cobro_inicial_de_giro('BAR') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('QUICK_SERVICE') <> 'COBRO_PRIMERO'
     OR cobro_inicial_de_giro('CAFETERIA') <> 'COBRO_PRIMERO' OR cobro_inicial_de_giro(NULL) <> 'COBRO_PRIMERO' THEN
    RAISE EXCEPTION '2b: cobro inicial por giro mal';
  END IF;
  RAISE NOTICE '2b cobro inicial OK';

  -- Cliente existente (semilla): todo encendido sin que nadie lo toque.
  SELECT operacion INTO v_op FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa';
  IF v_op IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2c: el cliente existente debía quedar todo encendido: %', v_op; END IF;
  RAISE NOTICE '2c cliente existente intacto OK';

  -- El disparador completa llaves y corrige dependencias; nunca rechaza un valor válido.
  UPDATE tenants SET operacion = '{"comedor":false,"domicilio":false}'
   WHERE id = '99999999-0000-0000-0000-0000000000aa' RETURNING operacion INTO v_op;
  IF (v_op->>'meseros')::boolean OR (v_op->>'repartidores')::boolean THEN
    RAISE EXCEPTION '2d: sin comedor/domicilio debían apagarse meseros/repartidores: %', v_op;
  END IF;
  IF NOT (v_op->>'kds')::boolean OR NOT (v_op ? 'cuentas_barra') THEN
    RAISE EXCEPTION '2d: las llaves que faltan debían completarse encendidas: %', v_op;
  END IF;
  BEGIN
    UPDATE tenants SET operacion = '{"inventado":true}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó una llave desconocida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE tenants SET operacion = '{"comedor":"true"}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó un texto como booleano';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE tenants SET operacion = v_todo WHERE id = '99999999-0000-0000-0000-0000000000aa';
  RAISE NOTICE '2d-2e disparador OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `❌` con `function juego_inicial_de_giro(unknown) does not exist`.

- [ ] **Step 3: La migración, §1 y §2**

`supabase/migrations/0180_modulos_de_operacion.sql`:

```sql
-- Módulos de operación por giro (spec 2026-10-14-giros-y-modulos-de-operacion-design.md, ADR 0034).
--
-- El giro ya no se lee en las pantallas: solo arma, al darse de alta, el juego inicial de diez
-- interruptores. Después los mueve solo VIM, desde /platform. Se guardan en `tenants` y no en
-- `configuracion_tenant` porque esta última la escribe el dueño (política `config_tenant FOR ALL`,
-- 0003); en `tenants` el UPDATE de `authenticated` está limitado a una lista de columnas (0132) y
-- `operacion` no entra en ella.

-- ── §1 El juego inicial de cada giro ─────────────────────────────────────────
-- Se compara como texto: así esta función no depende de que los valores de la 0179 ya estén
-- confirmados, y un giro que no está en la lista recibe todo encendido (ENTERPRISE, CAFE_BAR
-- viejo, NULL), que es lo que tenían todos antes de esta migración.
CREATE OR REPLACE FUNCTION juego_inicial_de_giro(p_giro vertical_tipo)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (CASE p_giro::text
    WHEN 'QUICK_SERVICE' THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FULL_SERVICE'  THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FOODTRUCK'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'
    WHEN 'DARK_KITCHEN'  THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'
    WHEN 'BAR'           THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'
    WHEN 'CAFETERIA'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'TAQUERIA'      THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro (tabla §5 del spec de giros). Sin giro conocido: todo encendido. Única fuente de esa tabla (0180).';

CREATE OR REPLACE FUNCTION cobro_inicial_de_giro(p_giro vertical_tipo)
RETURNS varchar LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_giro::text IN ('FULL_SERVICE', 'BAR', 'CAFE_BAR', 'TAQUERIA')
              THEN 'COCINA_PRIMERO' ELSE 'COBRO_PRIMERO' END::varchar;
$$;

-- ── §2 Los interruptores ─────────────────────────────────────────────────────
-- Por defecto todo encendido: los clientes que ya existen no cambian sin que nadie haga nada.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS operacion jsonb NOT NULL DEFAULT juego_inicial_de_giro(NULL);
COMMENT ON COLUMN tenants.operacion IS
  'Módulos de operación encendidos (diez llaves booleanas). Los arma juego_inicial_de_giro al darse de alta y después solo los cambia VIM con operacion_cambiar / cambiar_giro (0180, ADR 0034).';

-- Completa, valida y corrige dependencias. NUNCA rechaza un valor válido por el estado del
-- negocio (cuentas abiertas): ese candado vive en operacion_cambiar, porque la caja baja `tenants`
-- en el pull y ahí no puede fallar. El pull corre con session_replication_role = replica, así que
-- este disparador no corre en la caja; aun así se mantiene determinista a propósito.
CREATE OR REPLACE FUNCTION operacion_normalizar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_base jsonb := juego_inicial_de_giro(NULL);
  v      jsonb;
  k      text;
BEGIN
  IF p IS NOT NULL AND jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'MODULO_NO_BOOLEANO: operacion debe ser un objeto' USING ERRCODE = '22023';
  END IF;
  v := v_base || COALESCE(p, '{}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF NOT v_base ? k THEN
      RAISE EXCEPTION 'MODULO_DESCONOCIDO: %', k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v->k) <> 'boolean' THEN
      RAISE EXCEPTION 'MODULO_NO_BOOLEANO: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT (v->>'comedor')::boolean   THEN v := v || '{"meseros":false}'::jsonb;      END IF;
  IF NOT (v->>'domicilio')::boolean THEN v := v || '{"repartidores":false}'::jsonb; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION tenants_operacion_normalizar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.operacion := operacion_normalizar(NEW.operacion);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenants_operacion_normalizar ON tenants;
CREATE TRIGGER tenants_operacion_normalizar
  BEFORE INSERT OR UPDATE OF operacion ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_operacion_normalizar();

-- CAFE_BAR se separa en BAR y CAFETERIA; quien lo tuviera pasa a BAR (el más parecido: cuentas
-- abiertas). Su `operacion` no se toca: sigue todo encendido, como cualquier cliente existente.
UPDATE tenants SET vertical_principal = 'BAR' WHERE vertical_principal = 'CAFE_BAR';
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `✅`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0180_modulos_de_operacion.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(giros): interruptores de operación por negocio y juego inicial por giro"
```

---

### Task 3: Lo que mueve /platform

**Files:**
- Modify: `supabase/migrations/0180_modulos_de_operacion.sql` (agregar §3 al final)
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (bloque 3)

**Interfaces:**
- Consumes: `operacion_normalizar`, `juego_inicial_de_giro`, `tenants.operacion` (Tarea 2).
- Produces (las tres solo para `service_role`):
  - `operacion_cuentas_abiertas(p_tenant uuid) RETURNS jsonb`, de la forma `{"comedor": <int>, "cuentas_barra": <int>}`.
  - `operacion_cambiar(p_tenant uuid, p_cambios jsonb) RETURNS jsonb`, de la forma `{"operacion": {...}, "ajustes": ["meseros", ...]}`. `ajustes` lista las llaves que se apagaron por dependencia sin pedirlo. Errores (el mensaje empieza con el código):
    - `CAMBIOS_INVALIDOS` (22023), si `p_cambios` es NULL o no es un objeto.
    - `MODULO_DESCONOCIDO` y `MODULO_NO_BOOLEANO` (22023).
    - `TENANT_NO_EXISTE` (P0002).
    - `MESEROS_REQUIERE_COMEDOR` y `REPARTIDORES_REQUIERE_DOMICILIO` (22023).
    - `CUENTAS_ABIERTAS_COMEDOR: <n>` y `CUENTAS_ABIERTAS_BARRA: <n>` (55006).
  - `cambiar_giro(p_tenant uuid, p_giro vertical_tipo, p_reaplicar boolean) RETURNS jsonb`, de la forma `{"operacion": {...}, "avisos": ["..."]}`. Errores: `GIRO_RETIRADO` (22023) para `CAFE_BAR`, `ENTERPRISE` o NULL, y `TENANT_NO_EXISTE` (P0002).

- [ ] **Step 1: Escribir la prueba que falla**

Agregar antes del `ROLLBACK;` final:

```sql
-- 3) operacion_cambiar y cambiar_giro: dependencias, entradas malas, cuentas abiertas, pull, giros
--    retirados y permisos.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_ticket uuid; v_mesa uuid; v_r jsonb; v_op jsonb;
BEGIN
  -- Sin JWT: es la sesión de servicio (como /platform). Las cuentas de mesa sí necesitan claims.
  PERFORM set_config('request.jwt.claims', '', true);

  -- 3a) Apagar comedor apaga meseros y lo reporta.
  v_r := operacion_cambiar(v_tenant, '{"comedor":false}');
  IF (v_r->'operacion'->>'meseros')::boolean THEN RAISE EXCEPTION '3a: meseros seguía encendido: %', v_r; END IF;
  IF NOT (v_r->'ajustes') ? 'meseros' THEN RAISE EXCEPTION '3a: debía reportar meseros en ajustes: %', v_r; END IF;

  -- 3b) Encender meseros sin comedor se rechaza y no cambia nada.
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"meseros":true}');
    RAISE EXCEPTION '3b: encendió meseros sin comedor';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'MESEROS_REQUIERE_COMEDOR%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"repartidores":true,"domicilio":false}');
    RAISE EXCEPTION '3b: encendió repartidores sin domicilio';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'REPARTIDORES_REQUIERE_DOMICILIO%' THEN RAISE; END IF;
  END;
  -- Pedirlos juntos sí se puede.
  v_r := operacion_cambiar(v_tenant, '{"comedor":true,"meseros":true}');
  IF NOT (v_r->'operacion'->>'meseros')::boolean THEN RAISE EXCEPTION '3b: comedor+meseros juntos debía pasar'; END IF;
  RAISE NOTICE '3a-3b dependencias OK';

  -- 3c) Entradas malas: error claro, nada cambia.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  BEGIN PERFORM operacion_cambiar(v_tenant, NULL); RAISE EXCEPTION '3c: aceptó NULL';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '[true]'); RAISE EXCEPTION '3c: aceptó un arreglo';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"domicilio":"si"}'); RAISE EXCEPTION '3c: aceptó texto';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"cocina":true}'); RAISE EXCEPTION '3c: aceptó llave desconocida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(gen_random_uuid(), '{"comedor":true}'); RAISE EXCEPTION '3c: aceptó un negocio que no existe';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF (SELECT operacion FROM tenants WHERE id = v_tenant) IS DISTINCT FROM v_op THEN
    RAISE EXCEPTION '3c: una entrada mala cambió la operación';
  END IF;
  RAISE NOTICE '3c entradas malas OK';

  -- 3d) Con una cuenta de mesa abierta no se apaga el comedor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-GIROS', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 97, 'Mesa 97', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'giros-1', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa, true, 'giros-asig');
  PERFORM set_config('request.jwt.claims', '', true);

  IF (operacion_cuentas_abiertas(v_tenant)->>'comedor')::int < 1 THEN
    RAISE EXCEPTION '3d: no contó la cuenta de mesa abierta: %', operacion_cuentas_abiertas(v_tenant);
  END IF;
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"comedor":false}');
    RAISE EXCEPTION '3d: apagó el comedor con una cuenta abierta';
  EXCEPTION WHEN object_in_use THEN
    IF SQLERRM NOT LIKE 'CUENTAS_ABIERTAS_COMEDOR%' THEN RAISE; END IF;
  END;

  -- 3e) cambiar_giro con reaplicar respeta la cuenta abierta: comedor se queda y avisa.
  v_r := cambiar_giro(v_tenant, 'FOODTRUCK', true);
  IF NOT (v_r->'operacion'->>'comedor')::boolean THEN RAISE EXCEPTION '3e: apagó el comedor con cuenta abierta: %', v_r; END IF;
  IF jsonb_array_length(v_r->'avisos') < 1 THEN RAISE EXCEPTION '3e: debía avisar del comedor: %', v_r; END IF;
  IF NOT (v_r->'operacion'->>'eventos')::boolean OR (v_r->'operacion'->>'domicilio')::boolean THEN
    RAISE EXCEPTION '3e: el resto debía ser el juego de FOODTRUCK: %', v_r;
  END IF;
  IF (SELECT vertical_principal::text FROM tenants WHERE id = v_tenant) <> 'FOODTRUCK' THEN RAISE EXCEPTION '3e: no cambió el giro'; END IF;
  RAISE NOTICE '3d-3e cuentas abiertas OK';

  -- 3f) El pull de la caja (replica) escribe comedor apagado aunque haya cuentas abiertas.
  SET LOCAL session_replication_role = replica;
  UPDATE tenants SET operacion = operacion || '{"comedor":false}' WHERE id = v_tenant;
  SET LOCAL session_replication_role = origin;
  RAISE NOTICE '3f pull con cuentas abiertas OK';

  -- 3g) Giros retirados.
  BEGIN PERFORM cambiar_giro(v_tenant, 'CAFE_BAR', false); RAISE EXCEPTION '3g: aceptó CAFE_BAR';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM cambiar_giro(v_tenant, 'ENTERPRISE', false); RAISE EXCEPTION '3g: aceptó ENTERPRISE';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Sin reaplicar: solo cambia el giro.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  v_r := cambiar_giro(v_tenant, 'BAR', false);
  IF v_r->'operacion' IS DISTINCT FROM v_op THEN RAISE EXCEPTION '3g: sin reaplicar no debía tocar la operación'; END IF;
  RAISE NOTICE '3g giros retirados y sin reaplicar OK';

  -- 3h) Un usuario autenticado (el dueño incluido) no escribe ni ejecuta nada de esto.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);
  BEGIN
    UPDATE tenants SET operacion = '{}' WHERE id = v_tenant;
    RAISE EXCEPTION '3h: un usuario autenticado cambió tenants.operacion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"comedor":true}'); RAISE EXCEPTION '3h: ejecutó operacion_cambiar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM cambiar_giro(v_tenant, 'BAR', true); RAISE EXCEPTION '3h: ejecutó cambiar_giro';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '3h permisos OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `❌` con `function operacion_cambiar(uuid, unknown) does not exist`.

- [ ] **Step 3: La migración, §3**

Agregar al final de `0180_modulos_de_operacion.sql`:

```sql
-- ── §3 Lo que mueve /platform ────────────────────────────────────────────────
-- Cuentas que impiden apagar un módulo. BORRADOR también cuenta: una mesa con la cuenta abierta y
-- sin productos todavía es una mesa ocupada.
CREATE OR REPLACE FUNCTION operacion_cuentas_abiertas(p_tenant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'comedor', (SELECT count(DISTINCT tm.ticket_id)
                  FROM tickets_mesas tm JOIN tickets t ON t.id = tm.ticket_id
                 WHERE tm.tenant_id = p_tenant AND tm.fecha_liberacion IS NULL
                   AND t.estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'cuentas_barra', (SELECT count(*) FROM tickets t
                       WHERE t.tenant_id = p_tenant AND t.modo_servicio = 'BARRA'
                         AND t.estado_fiscal IN ('BORRADOR', 'ABIERTO')));
$$;

CREATE OR REPLACE FUNCTION operacion_cambiar(p_tenant uuid, p_cambios jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes    jsonb;
  v_pedido   jsonb;
  v_despues  jsonb;
  v_abiertas jsonb;
  v_ajustes  text[];
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN
    RAISE EXCEPTION 'CAMBIOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  SELECT operacion INTO v_antes FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;

  v_pedido  := v_antes || p_cambios;
  v_despues := operacion_normalizar(v_pedido);   -- valida llaves y tipos antes de leer valores

  IF (p_cambios->>'meseros')::boolean AND NOT (v_despues->>'comedor')::boolean THEN
    RAISE EXCEPTION 'MESEROS_REQUIERE_COMEDOR' USING ERRCODE = '22023';
  END IF;
  IF (p_cambios->>'repartidores')::boolean AND NOT (v_despues->>'domicilio')::boolean THEN
    RAISE EXCEPTION 'REPARTIDORES_REQUIERE_DOMICILIO' USING ERRCODE = '22023';
  END IF;

  v_abiertas := operacion_cuentas_abiertas(p_tenant);
  IF (v_antes->>'comedor')::boolean AND NOT (v_despues->>'comedor')::boolean
     AND (v_abiertas->>'comedor')::int > 0 THEN
    RAISE EXCEPTION 'CUENTAS_ABIERTAS_COMEDOR: %', v_abiertas->>'comedor' USING ERRCODE = '55006';
  END IF;
  IF (v_antes->>'cuentas_barra')::boolean AND NOT (v_despues->>'cuentas_barra')::boolean
     AND (v_abiertas->>'cuentas_barra')::int > 0 THEN
    RAISE EXCEPTION 'CUENTAS_ABIERTAS_BARRA: %', v_abiertas->>'cuentas_barra' USING ERRCODE = '55006';
  END IF;

  SELECT COALESCE(array_agg(k ORDER BY k), '{}') INTO v_ajustes
    FROM jsonb_object_keys(v_despues) k
   WHERE v_despues->k IS DISTINCT FROM v_pedido->k;

  UPDATE tenants SET operacion = v_despues WHERE id = p_tenant;
  RETURN jsonb_build_object('operacion', v_despues, 'ajustes', to_jsonb(v_ajustes));
END;
$$;
COMMENT ON FUNCTION operacion_cambiar(uuid, jsonb) IS
  'Panel de plataforma: enciende/apaga módulos de operación. Apaga dependientes (los reporta en ajustes), rechaza dependencias faltantes y apagar comedor/barra con cuentas abiertas. Solo service_role (0180).';

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
COMMENT ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) IS
  'Panel de plataforma: cambia el giro y, si p_reaplicar, vuelve a aplicar su juego inicial sin apagar comedor/barra con cuentas abiertas (lo dice en avisos). Rechaza giros retirados. Solo service_role (0180).';

REVOKE ALL ON FUNCTION operacion_cuentas_abiertas(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION operacion_cambiar(uuid, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION operacion_cuentas_abiertas(uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION operacion_cambiar(uuid, jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) TO service_role;
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `✅`. Si 3h falla porque el `UPDATE` no lanza error (es decir, `authenticated` sí puede escribir `operacion`), revisa la lista de columnas del `GRANT UPDATE (...) ON public.tenants TO authenticated` de la 0132. No toques la prueba.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0180_modulos_de_operacion.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(giros): operacion_cambiar y cambiar_giro para el panel de VIM"
```

---

### Task 4: `modulos_efectivos` con las diez llaves

**Files:**
- Modify: `supabase/migrations/0180_modulos_de_operacion.sql` (agregar §4)
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (bloque 4)

**Interfaces:**
- Consumes: `tenants.operacion`.
- Produces: `modulos_efectivos(uuid)` mantiene su contrato `{permitidos, efectivos}` y suma ocho llaves (`mostrador`, `comedor`, `meseros`, `domicilio`, `repartidores`, `marcas`, `eventos`, `cuentas_barra`) que siempre están permitidas y cuyo valor efectivo es el interruptor. `kds` y `reservaciones` quedan en efectivo = plan AND interruptor. La caja lo recibe sin cambios por `resolver_directivas` y el latido.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar antes del `ROLLBACK;` final:

```sql
-- 4) modulos_efectivos: las diez llaves, kds = plan Y interruptor, nada perdido.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_m jsonb; v_kds_antes boolean; k text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE tenants SET operacion = juego_inicial_de_giro(NULL) WHERE id = v_tenant;
  v_m := modulos_efectivos(v_tenant);
  v_kds_antes := (v_m->'permitidos'->>'kds')::boolean;   -- con todo encendido, efectivo = plan, como antes
  IF (v_m->'efectivos'->>'kds')::boolean IS DISTINCT FROM v_kds_antes THEN
    RAISE EXCEPTION '4a: con todo encendido kds efectivo debía ser igual al plan: %', v_m;
  END IF;
  FOREACH k IN ARRAY ARRAY['mostrador','comedor','meseros','domicilio','repartidores','marcas','eventos','cuentas_barra'] LOOP
    IF (v_m->'permitidos'->>k)::boolean IS DISTINCT FROM true OR (v_m->'efectivos'->>k)::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION '4a: % debía estar permitido y efectivo con todo encendido: %', k, v_m;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','reservaciones'] LOOP
    IF NOT (v_m->'permitidos' ? k AND v_m->'efectivos' ? k) THEN
      RAISE EXCEPTION '4b: la redefinición perdió %: %', k, v_m;
    END IF;
  END LOOP;
  RAISE NOTICE '4a-4b llaves OK';

  PERFORM operacion_cambiar(v_tenant, '{"kds":false,"domicilio":false}');
  v_m := modulos_efectivos(v_tenant);
  IF (v_m->'efectivos'->>'kds')::boolean OR (v_m->'efectivos'->>'domicilio')::boolean
     OR (v_m->'efectivos'->>'repartidores')::boolean THEN
    RAISE EXCEPTION '4c: apagado debía no ser efectivo: %', v_m;
  END IF;
  IF (v_m->'permitidos'->>'kds')::boolean IS DISTINCT FROM v_kds_antes THEN
    RAISE EXCEPTION '4c: apagar el interruptor no debe cambiar lo que el plan permite';
  END IF;
  RAISE NOTICE '4c apagados OK';

  -- Otro negocio sigue sin poder preguntar por este.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'tenant_id', gen_random_uuid())::text, true);
  IF modulos_efectivos(v_tenant) IS NOT NULL THEN RAISE EXCEPTION '4d: otro negocio leyó estos módulos'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '4d aislamiento OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `❌` con `4a: mostrador debía estar permitido y efectivo`.

- [ ] **Step 3: La migración, §4**

Agregar al final de `0180_modulos_de_operacion.sql`. Es el cuerpo vigente de la 0161 con tres cambios, marcados `-- 0180`:

```sql
-- ── §4 modulos_efectivos con los módulos de operación ────────────────────────
-- Cuerpo de la 0161 con tres cambios (marcados 0180): lee tenants.operacion junto con el plan; kds
-- y reservaciones pasan a ser plan Y interruptor; y se agregan las ocho llaves de operación
-- (permitidas siempre: no se cobran). Con todo encendido —el default— el resultado de kds y
-- reservaciones es el mismo de antes.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;   -- 0180
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
  -- Un usuario autenticado solo puede preguntar por su propio tenant. Se decide por el ROL del
  -- JWT y no por la ausencia del claim: el hook de acceso (0006) emite tokens SIN tenant_id a
  -- empleados dados de baja, y un token así seguiría siendo `authenticated`. Sin JWT (sesión
  -- directa a la base: pruebas, semillas) o con service_role, pasa.
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion   -- 0180
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
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)                      -- 0180
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)  -- 0180
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  -- 0180: módulos de operación. Siempre permitidos (no se cobran); el interruptor lo mueve VIM.
  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;
```

- [ ] **Step 4: Correrlo y verlo pasar, junto con los smokes que ya leen `modulos_efectivos`**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql smoke_delivery_addon.sql`
Además, corre cada smoke que mencione `modulos_efectivos`:

```bash
grep -l modulos_efectivos ../supabase/scripts/smoke_*.sql
```

Esperado: todos en `✅`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0180_modulos_de_operacion.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(giros): modulos_efectivos entrega los módulos de operación"
```

---

### Task 5: El alta arranca con el juego del giro

**Files:**
- Modify: `supabase/migrations/0180_modulos_de_operacion.sql` (agregar §5)
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (bloque 5)

**Interfaces:**
- Consumes: `juego_inicial_de_giro`, `cobro_inicial_de_giro`.
- Produces: `crear_tenant_con_owner(...)`, con la misma firma de la 0141. Ahora además deja `tenants.operacion` con el juego del giro y `configuracion_tenant.politica_cobro_cocina` con el cobro del giro.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar antes del `ROLLBACK;` final:

```sql
-- 5) Alta por giro: operación y política de cobro.
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tenant uuid; v_op jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  v_tenant := crear_tenant_con_owner(v_owner, 'smoke-giro-' || substr(v_owner::text, 1, 8), 'Food Truck Smoke', 'Dueño Smoke',
                                     '4770000000', 'FOODTRUCK'::vertical_tipo, 'ESENCIAL', 'TRIAL'::tenant_estado, 'smoke 0180');

  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  IF v_op IS DISTINCT FROM juego_inicial_de_giro('FOODTRUCK') THEN
    RAISE EXCEPTION '5a: el alta no aplicó el juego de FOODTRUCK: %', v_op;
  END IF;
  IF (SELECT politica_cobro_cocina FROM configuracion_tenant WHERE tenant_id = v_tenant) IS DISTINCT FROM 'COBRO_PRIMERO' THEN
    RAISE EXCEPTION '5a: política de cobro inicial mal';
  END IF;
  RAISE NOTICE '5a alta por giro OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql`
Esperado: `❌` con `5a: el alta no aplicó el juego de FOODTRUCK` (la columna existe, pero con el default de todo encendido).

- [ ] **Step 3: La migración, §5**

Agregar al final de `0180_modulos_de_operacion.sql`:

```sql
-- ── §5 El alta arranca con el juego del giro ─────────────────────────────────
-- Cuerpo de la 0141 más las dos líneas marcadas 0180. Se aplica aquí y no en la base del alta
-- para no tocar crear_tenant_con_owner_base (0012/0085).
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_estado           tenant_estado,
  p_notas_internas   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_plan   uuid;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Unidades de medida (0085). */
  PERFORM sembrar_unidades_base(v_tenant);

  /* Lo que el plan incluye (0086 → 0141). En el alta no hay nada que retirar. */
  SELECT id INTO v_plan FROM planes WHERE codigo = p_plan_codigo;
  IF v_plan IS NOT NULL THEN
    PERFORM public._sincronizar_addons_del_plan(v_tenant, v_plan, false);
  END IF;

  /* 0180: módulos de operación y política de cobro según el giro. */
  UPDATE tenants SET operacion = juego_inicial_de_giro(p_vertical) WHERE id = v_tenant;
  INSERT INTO configuracion_tenant (tenant_id, politica_cobro_cocina)
  VALUES (v_tenant, cobro_inicial_de_giro(p_vertical))
  ON CONFLICT (tenant_id) DO UPDATE SET politica_cobro_cocina = EXCLUDED.politica_cobro_cocina;

  RETURN v_tenant;
END;
$$;
COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base, siembra unidades de medida (0085), los add-ons que el plan incluye (0086, 0141) y el juego inicial del giro (0180). La prueba (prueba_hasta) la pone el trigger de tenants.';
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;
```

- [ ] **Step 4: Correrlo y verlo pasar, junto con los smokes del alta**

Run: `cd desktop && npm run smokes -- smoke_giros_operacion.sql smoke_provisioning.sql smoke_cobro_plan.sql smoke_tienda_salida.sql`
Esperado: todos en `✅`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0180_modulos_de_operacion.sql supabase/scripts/smoke_giros_operacion.sql
git commit -m "feat(giros): el alta arranca con los módulos y el cobro del giro"
```

---

### Task 6: ADR, tipos y verificación completa

**Files:**
- Create: `docs/decisiones/0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md`
- Modify: `docs/decisiones/README.md` (renglón de la tabla, después del 0033)
- Regenerate: tipos de `pnpm db:types`

- [ ] **Step 1: El ADR**

```markdown
# 0034 — El giro arma el juego inicial de módulos, y después solo VIM lo ajusta

**Fecha:** 14 de octubre de 2026 · **Estado:** vigente (entrega 1 de 3)

## Qué había antes

El giro se pedía al registrarse y casi no servía: solo escondía el bloque de evento al abrir turno
si el negocio no era food truck. Todos veían mesas, meseros, domicilio, repartidores y marcas
virtuales. El ADR 0002 ya había dicho que el precio va por paquete y que el giro "sigue configurando
el producto", pero nadie lo había hecho.

## Qué hacemos ahora

- **El giro no cambia el precio.** Esencial, Negocio y Cadena siguen igual. Cadena es el plan, no un giro.
- **Siete giros:** comida rápida, restaurante con meseros, food truck, dark kitchen, bar, cafetería y
  taquería / cocina económica. `CAFE_BAR` y `ENTERPRISE` se quedan en el tipo, pero ya no se ofrecen.
- **Diez módulos de operación** en `tenants.operacion`. El giro solo decide con cuáles arranca un
  negocio (`juego_inicial_de_giro`); después **solo VIM** los cambia desde /platform, en cualquier
  giro. El dueño los ve, pero no los cambia: lo pide a soporte.
- **Viven en `tenants` y no en `configuracion_tenant`** porque esa la escribe el dueño; en `tenants`
  la 0132 ya le cerró el UPDATE salvo una lista de columnas.
- **El candado de cuentas abiertas vive en `operacion_cambiar`, no en un disparador:** la caja baja
  `tenants` en el pull y ahí nada puede fallar.
- **Los clientes que ya existían quedan con todo encendido.**

## Por qué

Precio por giro ya se probó y se retiró (0002). Un molde fijo por giro no sirve para los negocios
mixtos (una hamburguesería con cuatro mesas). Que el dueño moviera los interruptores se descartó
por decisión de Fermín: cada cambio pasa por VIM.

Spec: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md`.
```

En `docs/decisiones/README.md`, después del renglón 0033:

```markdown
| [0034](0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md) | El giro arma el juego inicial de módulos de operación, y después solo VIM lo ajusta | 14/10/2026 |
```

- [ ] **Step 2: Regenerar tipos**

Run: `pnpm db:types` desde la raíz de `vim-pos/`, con el Supabase local arriba y las dos migraciones aplicadas.
Esperado: el archivo de tipos ahora trae `operacion` en `tenants`, `BAR | CAFETERIA | TAQUERIA` en `vertical_tipo` y las funciones nuevas. Verifica que compile con `pnpm -r exec tsc --noEmit`, **no** con `next build` (rompe el dev server).

- [ ] **Step 3: Todos los smokes**

Run: `cd desktop && npm run smokes`
Esperado: `✅ N/N smokes en verde`. Un rojo que no tenga que ver con esto se reporta, no se "arregla" en esta rama.

- [ ] **Step 4: Commit**

```bash
git add docs/decisiones/0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md docs/decisiones/README.md <archivo de tipos regenerado>
git commit -m "docs(giros): ADR 0034 y tipos regenerados"
```

- [ ] **Step 5: Entrega**

- Abrir el PR contra `main` con el resumen y el enlace al spec. **No mezclarlo** hasta que las migraciones 0179 y 0180 estén aplicadas a producción, a mano y en ese orden, con el visto bueno de Fermín.
- Esta entrega **no requiere instalador**: la caja recibe las llaves nuevas por el latido y, mientras la entrega 2 no exista, las ignora.

## Lo que esta entrega no hace (va en la 2 o la 3)

- Ninguna pantalla obedece todavía los módulos: caja, admin, /platform, registro, primera vez.
- `_shared/alta.ts`, `registro/page.tsx` y `solicitar-demo` siguen ofreciendo los giros viejos.
- La propina inicial por giro, junto con bajar `sucursal_propinas_config` a la caja.
- Las cuentas por nombre en barra (`tickets.nombre_cuenta`).
