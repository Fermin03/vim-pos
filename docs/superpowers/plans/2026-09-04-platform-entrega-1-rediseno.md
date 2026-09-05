# Panel de plataforma · Entrega 1 — rediseño, módulos y límites — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `apps/platform` de pestañas con cajón lateral en páginas con barra lateral y ficha de cliente por secciones, con confirmaciones escritas para lo destructivo, refresco automático, y la pantalla de módulos y límites por cliente escribiendo en las tablas que ya existen.

**Architecture:** Una migración (0102) crea `tenant_limites`, las columnas de bloqueo en `tenants`, la clave `modulos` en `planes.features_incluidos`, las funciones `modulos_efectivos` / `limites_efectivos` y el trigger que limita cajas por sucursal. El panel pasa al App Router: `lib/sesion.tsx` guarda la clave en `sessionStorage` y provee `api`; `components/barra-lateral.tsx` es la navegación; cada pestaña vieja es una página; el cajón `DetalleDrawer` se descompone en `clientes/[id]/page.tsx` con componentes de sección; `dialogo-confirmar.tsx` reemplaza `prompt`/`confirm`. Nada de esto toca la caja instalada.

**Tech Stack:** Next 15 App Router (client components), React 19, Tailwind con `@vim/config/tailwind-preset` + `@vim/ui/tokens.css`, `@vim/ui/styles` (`Modal`, `Button`, `LogoVim`), supabase-js con `service_role` solo en `app/api/*`, vitest (node) para lógica pura, pgTAP (`supabase test db`) para SQL.

**Spec:** `docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md` (§5 entera, §10 seguridad, §11 pruebas, §12 publicación paso 1). ADR: `docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md`.

## Global Constraints

- **Rama y carpeta:** todo el trabajo va en un **worktree aparte** `../vim-pos-platform` sobre la rama `platform-centro-control` creada desde `main`. La carpeta principal `vim-pos/` está en la rama `sync-inventario` con cambios sin confirmar de otra sesión: **no tocarla, no cambiarle de rama, no hacer `git stash` ahí.**
- **Base local:** Supabase local ya corre (Docker arriba). Otras sesiones pueden resetearla: si una prueba falla por datos, `supabase db reset` y volver a intentar. La base local NO es producción (`reference_platform_env_local`).
- **`service_role` solo en `app/api/*`** (regla dura 1). Ningún componente cliente importa `@vim/db/service`.
- **Sin `any`**: `unknown` + Zod o casts explícitos a tipos declarados. `pnpm --filter @vim/platform typecheck` debe quedar en cero errores tras cada tarea.
- **Español en dominio y archivos** `kebab-case`, componentes `PascalCase`.
- **Toda escritura del panel llama `auditar()`** de `app/lib/server.ts` con `tenantId` y `motivo`.
- **Tokens de diseño**: solo clases del preset (`ink`, `ink-2`, `ink-3`, `line`, `line-strong`, `surface`, `bg`, `hover`, `sel`, `accent`, `success`, `warning`, `danger`). Un solo botón `accent` por pantalla. Lo destructivo en `danger`. Antes de escribir CSS nuevo, cargar la skill `emil-design-eng` (`feedback_skills_emil`).
- **`prompt()` y `confirm()` del navegador quedan prohibidos** en el panel al terminar.
- **Migraciones aplicadas en remoto no se editan**: 0102 es nueva y aditiva. Tras aplicarla: `pnpm db:types`.
- Commits pequeños, mensajes en español con prefijo (`db:`, `feat(platform):`, `test:`, `docs:`), y al final de cada mensaje:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0102_platform_modulos_limites.sql` | tabla `tenant_limites`, columnas de bloqueo, `planes.modulos`, `modulos_efectivos`, `limites_efectivos`, trigger de cajas |
| `supabase/tests/0010_modulos_limites.test.sql` | pgTAP: funciones, trigger, grants |
| `packages/db/src/modulos.ts` | catálogo de módulos compartido (`MODULOS`, `CodigoModulo`) |
| `apps/platform/app/lib/sesion.tsx` | contexto de sesión: clave en `sessionStorage`, `api()`, `salir()` |
| `apps/platform/app/lib/refresco.ts` | hook `useRefresco(cargar, ms)` con visibilidad |
| `apps/platform/app/lib/confirmacion.ts` | `evaluarConfirmacion()` pura + test |
| `apps/platform/app/lib/bloqueo.ts` | `fechaBloqueo(hoyMx, graciaDias)` pura + test (servidor) |
| `apps/platform/app/lib/formato.ts` | `fmtMxn`, `fechaCorta`, `COLOR_ESTADO`, `VERTICALES` (sacados de `page.tsx`) |
| `apps/platform/app/components/barra-lateral.tsx` | navegación lateral con conteo de críticas |
| `apps/platform/app/components/shell.tsx` | pantalla de entrada + barra lateral + `<main>` |
| `apps/platform/app/components/seccion.tsx` | tarjeta de sección con título y ancla |
| `apps/platform/app/components/tarjeta-cifra.tsx` | la `Card` de cifra (era local en `page.tsx`) |
| `apps/platform/app/components/pastilla-estado.tsx` | pastilla de estado de tenant |
| `apps/platform/app/components/dialogo-confirmar.tsx` | diálogo con motivo, nombre escrito, gracia, casilla "entiendo" |
| `apps/platform/app/components/ficha-contrato.tsx` | plan, suscripción, add-ons, onboarding, notas |
| `apps/platform/app/components/ficha-facturacion.tsx` | fiscal, folios, paquete, ajuste |
| `apps/platform/app/components/modulos-limites.tsx` | módulos con interruptor y límites editables |
| `apps/platform/app/components/zona-peligrosa.tsx` | suspender, cancelar, reactivar |
| `apps/platform/app/page.tsx` | redirige a `/atencion` |
| `apps/platform/app/atencion/page.tsx`, `cfdi/page.tsx`, `errores/page.tsx`, `bitacora/page.tsx` | envuelven los componentes existentes |
| `apps/platform/app/clientes/page.tsx` | franja de métricas + lista con filtros |
| `apps/platform/app/clientes/nuevo/page.tsx` | alta (era `NuevoCliente`) |
| `apps/platform/app/clientes/[id]/page.tsx` | ficha de cliente |
| `apps/platform/app/api/tenants/[id]/route.ts` | GET con `modulos`/`limites`; PATCH con acciones nuevas y gracia |
| `apps/platform/app/layout.tsx` | envuelve en `<Shell>` |
| `docs/diseno/platform.md` | actualizar "7 pantallas" y describir la ficha |

---

### Task 0: Worktree y arranque

**Files:** ninguno del repo (solo git y entorno).

- [ ] **Step 1: Crear el worktree desde `main`**

Desde `vim-pos/` (la carpeta principal; solo lectura de git, no se cambia de rama):

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos"
git fetch origin main
git worktree add -b platform-centro-control ../vim-pos-platform main
```

Traer la spec y el ADR (están en `sync-inventario`, no en `main`):

```bash
git -C ../vim-pos-platform checkout sync-inventario -- docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md docs/decisiones/README.md docs/superpowers/plans/2026-09-04-platform-entrega-1-rediseno.md
git -C ../vim-pos-platform commit -m "docs: spec, ADR 0014 y plan de la entrega 1 del panel de plataforma

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Copiar los env locales (gitignored) e instalar**

```bash
cp apps/platform/.env.local ../vim-pos-platform/apps/platform/.env.local
cp .env.local ../vim-pos-platform/.env.local
cd ../vim-pos-platform && pnpm install --frozen-lockfile
```

- [ ] **Step 3: Verificar que el panel arranca y las pruebas actuales pasan**

```bash
pnpm --filter @vim/platform typecheck
pnpm --filter @vim/platform test
```
Expected: typecheck sin errores; vitest `2 files, all passed` (ip-allowlist y senal-caja).

A partir de aquí **todas las rutas son relativas a `vim-pos-platform/`**.

---

### Task 1: Migración 0102 — límites, bloqueo, módulos por plan, funciones y trigger

**Files:**
- Create: `supabase/migrations/0102_platform_modulos_limites.sql`
- Create: `supabase/tests/0010_modulos_limites.test.sql`
- Modify: `supabase/tests/0003_grants_secdef.test.sql` (no: las funciones nuevas son `authenticated`; ver Step 5)

**Interfaces:**
- Produces: `modulos_efectivos(p_tenant uuid) RETURNS jsonb` → `{"permitidos": {codigo: bool}, "efectivos": {codigo: bool}}`; `limites_efectivos(p_tenant uuid) RETURNS jsonb` → `{"max_sucursales": int|null, "max_cajas_por_sucursal": int|null, "max_usuarios": int|null, "del_plan": {los tres}, "excepcion": {los tres}}`; tabla `tenant_limites`; columnas `tenants.bloqueo_desde`, `tenants.bloqueo_mensaje`; `planes.features_incluidos->'modulos'`.
- Códigos de módulo (fijos, iguales a `packages/db/src/modulos.ts` de la Task 2): `cfdi`, `delivery_apps`, `kds`, `recetas`, `reservaciones`, `promociones`.

- [ ] **Step 1: Escribir la prueba pgTAP (falla porque nada existe)**

`supabase/tests/0010_modulos_limites.test.sql`:

```sql
-- Módulos y límites por cliente (spec 2026-09-04 §5.4–5.5, ADR 0014).
begin;
select plan(12);

-- Tenant de prueba en plan ESENCIAL (1 caja por sucursal, sin recetas).
insert into tenants (id, codigo, nombre_comercial, vertical_principal, plan_actual_id)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'mod-esencial', 'Mod Esencial', 'QUICK_SERVICE',
        (select id from planes where codigo = 'ESENCIAL'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d0', 'S1', 'Suc 1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('aaaaaaaa-0000-0000-0000-0000000000d0')
on conflict (tenant_id) do nothing;

-- #1 el plan ESENCIAL declara módulos
select ok((select features_incluidos ? 'modulos' from planes where codigo = 'ESENCIAL'), 'ESENCIAL trae modulos');
-- #2 un plan heredado también (nadie se queda sin nada)
select ok((select features_incluidos->'modulos'->>'recetas' = 'true' from planes where codigo = 'QS'), 'QS heredado tiene recetas');

-- #3/#4 permitidos según plan
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'false', 'ESENCIAL no permite recetas');
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'kds'), 'true', 'ESENCIAL permite kds');

-- #5 excepción por flag enciende el permiso
insert into tenant_feature_flags (tenant_id, flag_codigo, activado, motivo)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'recetas', true, 'cortesía de prueba');
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'true', 'flag permite recetas por excepción');

-- #6 efectivo = permitido AND encendido (recetas depende de modulo_inventario_activo)
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'efectivos'->>'recetas'), 'false', 'recetas permitido pero apagado → no efectivo');
update configuracion_tenant set modulo_inventario_activo = true where tenant_id = 'aaaaaaaa-0000-0000-0000-0000000000d0';
-- #7
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'efectivos'->>'recetas'), 'true', 'recetas encendido → efectivo');

-- #8 flag vencido no cuenta
update tenant_feature_flags set fecha_fin = now() - interval '1 day' where tenant_id = 'aaaaaaaa-0000-0000-0000-0000000000d0' and flag_codigo = 'recetas';
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'false', 'flag vencido no permite');

-- #9 límites del plan
select is((limites_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->>'max_cajas_por_sucursal'), '1', 'ESENCIAL: 1 caja por sucursal');
-- #10 override por tenant_limites
insert into tenant_limites (tenant_id, max_cajas_por_sucursal, motivo) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 2, 'prueba');
select is((limites_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->>'max_cajas_por_sucursal'), '2', 'override manda sobre el plan');

-- #11 trigger: con límite 2, la tercera caja falla
insert into cajas (tenant_id, sucursal_id, numero, nombre) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 1, 'Caja 1');
insert into cajas (tenant_id, sucursal_id, numero, nombre) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 2, 'Caja 2');
select throws_ok(
  $$ insert into cajas (tenant_id, sucursal_id, numero, nombre) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 3, 'Caja 3') $$,
  'P0001', 'Tu plan permite 2 caja(s) por sucursal. Pide a VIM ampliar el límite.', 'la tercera caja se rechaza');

-- #12 otro tenant autenticado no lee los módulos del primero (guard por claim)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000d9', 'tenant_id', 'bbbbbbbb-0000-0000-0000-0000000000d0', 'role', 'authenticated')::text, true);
select is(modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0'), null, 'otro tenant recibe NULL');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr la prueba y ver que falla**

```bash
supabase test db
```
Expected: `0010_modulos_limites.test.sql` falla en #1 (`modulos` no existe) y las funciones no existen.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0102_platform_modulos_limites.sql`:

```sql
-- ============================================================================
-- 0102 — El panel de plataforma controla módulos y límites por cliente (ADR 0014, entrega 1).
--
-- `tenant_feature_flags` (0002) y `planes.max_*` existían desde el primer día y nadie los
-- leía. Aquí se les da una lectura única (`modulos_efectivos`, `limites_efectivos`), una tabla
-- de excepciones de límites por cliente, la primera regla que los aplica (cajas por sucursal)
-- y las dos columnas con las que "suspender con gracia" programa el bloqueo que la caja
-- empezará a obedecer en la entrega 2.
-- ============================================================================

-- ── Límites por cliente (excepciones sobre el plan) ─────────────────────────
CREATE TABLE tenant_limites (
  tenant_id               uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_sucursales          integer NULL CHECK (max_sucursales IS NULL OR max_sucursales >= 1),
  max_cajas_por_sucursal  integer NULL CHECK (max_cajas_por_sucursal IS NULL OR max_cajas_por_sucursal >= 1),
  max_usuarios            integer NULL CHECK (max_usuarios IS NULL OR max_usuarios >= 1),
  motivo                  text NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_limites IS 'Excepciones de límites por cliente. NULL = manda el plan. Solo la escribe el panel de plataforma.';
ALTER TABLE tenant_limites ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role
CREATE TRIGGER trg_tenant_limites_updated_at BEFORE UPDATE ON tenant_limites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Bloqueo programado (lo escribe "suspender con gracia"; lo obedece la caja desde 0103) ──
ALTER TABLE tenants
  ADD COLUMN bloqueo_desde   timestamptz NULL,
  ADD COLUMN bloqueo_mensaje text NULL;
COMMENT ON COLUMN tenants.bloqueo_desde IS 'A partir de cuándo las directivas dicen bloqueado=true. NULL = sin bloqueo programado.';
COMMENT ON COLUMN tenants.bloqueo_mensaje IS 'Lo que verá el cajero en la banda de gracia y en la pantalla de bloqueo.';

-- ── Módulos por plan ─────────────────────────────────────────────────────────
-- `cfdi` NO va aquí: lo resuelve el add-on CFDI (0081), que el alta ya materializa (0086).
-- Esencial es "una sola caja, sin inventario"; el resto incluye todo. Los planes heredados por
-- vertical reciben lo mismo que Negocio para que nadie pierda nada.
UPDATE planes
   SET features_incluidos = features_incluidos || jsonb_build_object('modulos', jsonb_build_object(
         'delivery_apps', true,
         'kds',           true,
         'recetas',       (codigo <> 'ESENCIAL'),
         'reservaciones', true,
         'promociones',   true))
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- ── Lectura única de módulos ─────────────────────────────────────────────────
-- permitido = flag vigente si existe, si no lo que dice el plan; cfdi = add-on.
-- efectivo  = permitido AND encendido por el dueño. Solo `recetas` tiene interruptor del dueño
-- hoy (configuracion_tenant.modulo_inventario_activo, ADR 0013); los demás módulos no tienen
-- interruptor propio, así que encendido = true para no apagar nada que hoy funciona.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_inv        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  -- Un usuario autenticado solo puede preguntar por su propio tenant.
  IF current_tenant_id() IS NOT NULL AND current_tenant_id() <> p_tenant THEN RETURN NULL; END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb)
    INTO v_plan
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['delivery_apps', 'kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo WHEN 'recetas' THEN COALESCE(v_inv, false) ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
    v_flag := NULL;
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS 'Módulos por cliente: permitidos (plan + flags) y efectivos (AND encendido por el dueño). Única lectura autorizada (ADR 0014).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── Lectura única de límites ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION limites_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_tenant IS NULL THEN NULL
    WHEN current_tenant_id() IS NOT NULL AND current_tenant_id() <> p_tenant THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'max_sucursales',         COALESCE(l.max_sucursales, p.max_sucursales),
        'max_cajas_por_sucursal', COALESCE(l.max_cajas_por_sucursal, p.max_cajas_por_sucursal),
        'max_usuarios',           COALESCE(l.max_usuarios, p.max_usuarios),
        'del_plan',  jsonb_build_object('max_sucursales', p.max_sucursales, 'max_cajas_por_sucursal', p.max_cajas_por_sucursal, 'max_usuarios', p.max_usuarios),
        'excepcion', jsonb_build_object('max_sucursales', l.max_sucursales, 'max_cajas_por_sucursal', l.max_cajas_por_sucursal, 'max_usuarios', l.max_usuarios, 'motivo', l.motivo))
      FROM tenants t
      LEFT JOIN planes p ON p.id = t.plan_actual_id
      LEFT JOIN tenant_limites l ON l.tenant_id = t.id
      WHERE t.id = p_tenant)
  END;
$$;
COMMENT ON FUNCTION limites_efectivos(uuid) IS 'Límites por cliente: excepción de tenant_limites si existe, si no el plan. NULL = sin límite.';
REVOKE EXECUTE ON FUNCTION limites_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION limites_efectivos(uuid) TO authenticated, service_role;

-- ── Primera regla que aplica un límite: cajas por sucursal ──────────────────
-- El admin del dueño inserta cajas directo bajo RLS, así que el candado va en la tabla. El pull
-- de la caja instalada corre en modo réplica y no dispara este trigger (ADR 0004).
CREATE OR REPLACE FUNCTION cajas_verificar_limite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_n   integer;
BEGIN
  SELECT (limites_efectivos(NEW.tenant_id)->>'max_cajas_por_sucursal')::integer INTO v_max;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_n FROM cajas
   WHERE sucursal_id = NEW.sucursal_id AND deleted_at IS NULL AND activa = true;
  IF v_n >= v_max THEN
    RAISE EXCEPTION 'Tu plan permite % caja(s) por sucursal. Pide a VIM ampliar el límite.', v_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION cajas_verificar_limite() FROM public;
CREATE TRIGGER trg_cajas_limite BEFORE INSERT ON cajas
  FOR EACH ROW EXECUTE FUNCTION cajas_verificar_limite();
```

- [ ] **Step 4: Aplicar y correr la prueba**

```bash
supabase db reset
supabase test db
```
Expected: `0010_modulos_limites.test.sql` 12/12 OK y los demás siguen verdes. Si `0003_grants_secdef` reclama alguna de las funciones nuevas, no agregarlas a `_secdef_solo_service` (son `authenticated` a propósito, con guard por claim).

- [ ] **Step 5: Regenerar tipos y confirmar**

```bash
pnpm db:types
git add supabase/migrations/0102_platform_modulos_limites.sql supabase/tests/0010_modulos_limites.test.sql packages/db/src/database.types.ts
git commit -m "db: módulos y límites por cliente, bloqueo programado y candado de cajas (0102, ADR 0014)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Catálogo de módulos compartido y utilidades puras del panel

**Files:**
- Create: `packages/db/src/modulos.ts`
- Modify: `packages/db/package.json` (export `./modulos`)
- Create: `apps/platform/app/lib/formato.ts`
- Create: `apps/platform/app/lib/bloqueo.ts`
- Create: `apps/platform/app/lib/confirmacion.ts`
- Test: `apps/platform/app/lib/__tests__/bloqueo.test.ts`, `apps/platform/app/lib/__tests__/confirmacion.test.ts`

**Interfaces:**
- Produces: `MODULOS: { codigo: CodigoModulo; nombre: string; descripcion: string; interruptorDueno: string | null }[]`; `type CodigoModulo = "cfdi" | "delivery_apps" | "kds" | "recetas" | "reservaciones" | "promociones"`.
- Produces: `fechaBloqueo(hoyMx: string, graciaDias: number): string` (ISO UTC de las 06:00 México del día `hoy + gracia`).
- Produces: `evaluarConfirmacion(e: EntradaConfirmacion): ResultadoConfirmacion` con `{ ok: boolean; faltantes: string[] }`.
- Produces: `fmtMxn`, `fechaCorta`, `COLOR_ESTADO`, `VERTICALES`, `NOMBRE_ESTADO`.

- [ ] **Step 1: Catálogo de módulos**

`packages/db/src/modulos.ts`:

```ts
/**
 * Catálogo de módulos que VIM permite por cliente (ADR 0014). Los códigos son los mismos que
 * escribe la migración 0102 en `planes.features_incluidos->'modulos'` y los que lee
 * `modulos_efectivos()`. Agregar uno aquí sin migración no lo enciende en ningún lado.
 */
export type CodigoModulo = "cfdi" | "delivery_apps" | "kds" | "recetas" | "reservaciones" | "promociones";

export type Modulo = {
  codigo: CodigoModulo;
  nombre: string;
  descripcion: string;
  /** Columna de configuracion_tenant que el dueño enciende, o null si no hay interruptor. */
  interruptorDueno: "modulo_inventario_activo" | null;
  /** true = el permiso lo decide el add-on CFDI, no un flag. */
  porAddon: boolean;
};

export const MODULOS: readonly Modulo[] = [
  { codigo: "cfdi", nombre: "Facturación electrónica", descripcion: "Timbrado CFDI desde el admin y el portal de autofactura.", interruptorDueno: null, porAddon: true },
  { codigo: "delivery_apps", nombre: "Apps de delivery", descripcion: "Uber Eats, DiDi y Rappi entrando a la caja.", interruptorDueno: null, porAddon: false },
  { codigo: "kds", nombre: "Pantalla de cocina", descripcion: "Comandas en pantalla por área de preparación.", interruptorDueno: null, porAddon: false },
  { codigo: "recetas", nombre: "Recetas e inventario", descripcion: "Insumos, compras y descuento de inventario al vender.", interruptorDueno: "modulo_inventario_activo", porAddon: false },
  { codigo: "reservaciones", nombre: "Reservaciones", descripcion: "Mesas reservadas visibles desde la caja.", interruptorDueno: null, porAddon: false },
  { codigo: "promociones", nombre: "Promociones", descripcion: "Descuentos programados por producto o categoría.", interruptorDueno: null, porAddon: false },
] as const;
```

En `packages/db/package.json`, dentro de `"exports"`, agregar `"./modulos": "./src/modulos.ts"`.

- [ ] **Step 2: Formato compartido (sacado de `page.tsx`)**

`apps/platform/app/lib/formato.ts`:

```ts
export const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
export const fmtInt = (n: number) => new Intl.NumberFormat("es-MX").format(n || 0);

/** Fecha corta. Las de contrato son `date` sin hora: se parte el ISO en vez de `new Date`, que en México restaría un día. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  if (!a || !m || !d) return "—";
  return `${d}/${m}/${a}`;
}

export const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Quick Service" },
  { v: "FULL_SERVICE", l: "Full Service" },
  { v: "CAFE_BAR", l: "Café & Bar" },
  { v: "DARK_KITCHEN", l: "Dark Kitchen" },
  { v: "FOODTRUCK", l: "Foodtruck" },
  { v: "ENTERPRISE", l: "Enterprise" },
] as const;

export const COLOR_ESTADO: Record<string, string> = {
  ACTIVO: "bg-[#EAF3EE] text-success",
  TRIAL: "bg-[#EAF3FB] text-[#0063A8]",
  SUSPENDIDO: "bg-[#FCF3E6] text-warning",
  CANCELADO: "bg-[#FBECEA] text-danger",
  INTERNO: "bg-sel text-ink-3",
};
export const NOMBRE_ESTADO: Record<string, string> = {
  ACTIVO: "Activo", TRIAL: "En prueba", SUSPENDIDO: "Suspendido", CANCELADO: "Cancelado", INTERNO: "Interno",
};

export const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
export const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
```

- [ ] **Step 3: Prueba de `fechaBloqueo` (falla)**

`apps/platform/app/lib/__tests__/bloqueo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fechaBloqueo } from "../bloqueo";

describe("fechaBloqueo", () => {
  it("suma la gracia y fija las 06:00 de México (UTC-6) del día resultante", () => {
    // 4 sep + 3 días = 7 sep, 06:00 México = 12:00Z
    expect(fechaBloqueo("2026-09-04", 3)).toBe("2026-09-07T12:00:00.000Z");
  });
  it("cruza de mes sin desbordarse", () => {
    expect(fechaBloqueo("2026-09-29", 3)).toBe("2026-10-02T12:00:00.000Z");
  });
  it("rechaza gracia menor a 1", () => {
    expect(() => fechaBloqueo("2026-09-04", 0)).toThrow();
  });
});
```

- [ ] **Step 4: Correr y ver que falla**

```bash
pnpm --filter @vim/platform test -- bloqueo
```
Expected: FAIL, `Cannot find module '../bloqueo'`.

- [ ] **Step 5: Implementar `fechaBloqueo`**

`apps/platform/app/lib/bloqueo.ts`:

```ts
/**
 * Cuándo empieza a bloquear una suspensión.
 *
 * Se fija a las 06:00 hora de México del día `hoy + gracia`: a esa hora el corte del día
 * anterior ya está cerrado en cualquier restaurante, así que el bloqueo nunca cae a media
 * jornada. México no tiene horario de verano desde 2022: UTC-6 fijo, sin librería.
 */
export function fechaBloqueo(hoyMx: string, graciaDias: number): string {
  if (!Number.isInteger(graciaDias) || graciaDias < 1) throw new Error("La gracia debe ser de al menos 1 día");
  const [a, m, d] = hoyMx.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) throw new Error("Fecha inválida");
  // 06:00 México = 12:00 UTC.
  const base = Date.UTC(a, m - 1, d + graciaDias, 12, 0, 0);
  return new Date(base).toISOString();
}

export const GRACIA_POR_DEFECTO = 3;

export function mensajeBloqueoPorDefecto(bloqueoDesdeIso: string): string {
  const f = new Date(bloqueoDesdeIso);
  const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(f);
  return `Tu suscripción de VIM POS tiene un pago pendiente. Ponte en contacto con VIM antes del ${dia}; a partir de esa fecha la caja dejará de vender.`;
}
```

- [ ] **Step 6: Correr la prueba, pasa**

```bash
pnpm --filter @vim/platform test -- bloqueo
```
Expected: 3 passed.

- [ ] **Step 7: Prueba de `evaluarConfirmacion` (falla)**

`apps/platform/app/lib/__tests__/confirmacion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarConfirmacion } from "../confirmacion";

const base = { nombreEsperado: "Knock-Out Burger", nombreEscrito: "Knock-Out Burger", motivo: "Pago vencido desde agosto" };

describe("evaluarConfirmacion", () => {
  it("acepta nombre exacto y motivo suficiente", () => {
    expect(evaluarConfirmacion(base)).toEqual({ ok: true, faltantes: [] });
  });
  it("el nombre se compara sin distinguir mayúsculas ni espacios sobrantes", () => {
    expect(evaluarConfirmacion({ ...base, nombreEscrito: "  knock-out burger " }).ok).toBe(true);
  });
  it("rechaza nombre distinto", () => {
    const r = evaluarConfirmacion({ ...base, nombreEscrito: "Knockout" });
    expect(r.ok).toBe(false);
    expect(r.faltantes).toContain("nombre");
  });
  it("exige motivo de al menos 10 caracteres", () => {
    expect(evaluarConfirmacion({ ...base, motivo: "corto" }).faltantes).toContain("motivo");
  });
  it("si pide gracia, exige entero >= 1", () => {
    expect(evaluarConfirmacion({ ...base, requiereGracia: true, graciaDias: 0 }).faltantes).toContain("gracia");
    expect(evaluarConfirmacion({ ...base, requiereGracia: true, graciaDias: 3 }).ok).toBe(true);
  });
  it("si pide la casilla, exige marcarla", () => {
    expect(evaluarConfirmacion({ ...base, requiereEntiendo: true, entiendo: false }).faltantes).toContain("entiendo");
    expect(evaluarConfirmacion({ ...base, requiereEntiendo: true, entiendo: true }).ok).toBe(true);
  });
});
```

- [ ] **Step 8: Correr y ver que falla**

```bash
pnpm --filter @vim/platform test -- confirmacion
```
Expected: FAIL, módulo no encontrado.

- [ ] **Step 9: Implementar**

`apps/platform/app/lib/confirmacion.ts`:

```ts
/**
 * Regla de las confirmaciones destructivas del panel (docs/diseno/platform.md): escribir el
 * nombre del negocio, no pulsar "sí". Pura, para probarla sin React.
 */
export type EntradaConfirmacion = {
  nombreEsperado: string;
  nombreEscrito: string;
  motivo: string;
  requiereGracia?: boolean;
  graciaDias?: number;
  requiereEntiendo?: boolean;
  entiendo?: boolean;
};
export type ResultadoConfirmacion = { ok: boolean; faltantes: ("nombre" | "motivo" | "gracia" | "entiendo")[] };

export const MOTIVO_MINIMO = 10;

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function evaluarConfirmacion(e: EntradaConfirmacion): ResultadoConfirmacion {
  const faltantes: ResultadoConfirmacion["faltantes"] = [];
  if (normal(e.nombreEscrito) !== normal(e.nombreEsperado)) faltantes.push("nombre");
  if (e.motivo.trim().length < MOTIVO_MINIMO) faltantes.push("motivo");
  if (e.requiereGracia && !(Number.isInteger(e.graciaDias) && (e.graciaDias as number) >= 1)) faltantes.push("gracia");
  if (e.requiereEntiendo && !e.entiendo) faltantes.push("entiendo");
  return { ok: faltantes.length === 0, faltantes };
}
```

- [ ] **Step 10: Correr todo y confirmar**

```bash
pnpm --filter @vim/platform test
pnpm --filter @vim/platform typecheck
git add packages/db/src/modulos.ts packages/db/package.json apps/platform/app/lib
git commit -m "feat(platform): catálogo de módulos compartido y utilidades puras (bloqueo, confirmación, formato)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: API — módulos, límites y suspensión con gracia

**Files:**
- Modify: `apps/platform/app/api/tenants/[id]/route.ts`
- Modify: `apps/platform/app/api/tenants/route.ts` (agregar `bloqueo_desde` al select de la lista)

**Interfaces:**
- Consumes: `modulos_efectivos`, `limites_efectivos`, `tenant_limites`, `tenant_feature_flags` (Task 1); `fechaBloqueo`, `mensajeBloqueoPorDefecto` (Task 2); `hoyMx` de `@vim/fecha`; `auditar` de `../../../lib/server`.
- Produces (GET `/api/tenants/[id]`): además de lo actual, `modulos: { permitidos: Record<string, boolean>; efectivos: Record<string, boolean>; excepciones: { codigo: string; activado: boolean; motivo: string | null; fecha_fin: string | null }[] }` y `limites: { max_sucursales: number|null; max_cajas_por_sucursal: number|null; max_usuarios: number|null; del_plan: {...}; excepcion: {...; motivo: string|null} }`. El `tenant` incluye `bloqueo_desde` y `bloqueo_mensaje`.
- Produces (PATCH): acciones `modulo_permitir { codigo, motivo }`, `modulo_quitar { codigo, motivo }`, `limites { max_sucursales?, max_cajas_por_sucursal?, max_usuarios?, motivo }`; `cambiar_estado` acepta `gracia_dias` y `mensaje` cuando `estado = SUSPENDIDO`; `CANCELADO` acepta `gracia_dias` opcional (sin él, bloquea ya).

- [ ] **Step 1: GET — agregar módulos, límites y columnas de bloqueo**

En el `select` del tenant (línea ~19) agregar `bloqueo_desde, bloqueo_mensaje, ` después de `motivo_baja, `. Antes del `return NextResponse.json({`:

```ts
  const [{ data: modRaw }, { data: limRaw }, { data: flagsRaw }] = await Promise.all([
    sb.rpc("modulos_efectivos", { p_tenant: id }),
    sb.rpc("limites_efectivos", { p_tenant: id }),
    sb.from("tenant_feature_flags").select("flag_codigo, activado, motivo, fecha_fin, fecha_inicio").eq("tenant_id", id),
  ]);
  const ahora = Date.now();
  const excepciones = ((flagsRaw ?? []) as { flag_codigo: string; activado: boolean; motivo: string | null; fecha_fin: string | null; fecha_inicio: string }[])
    .filter((f) => !f.fecha_fin || new Date(f.fecha_fin).getTime() > ahora)
    .map((f) => ({ codigo: f.flag_codigo, activado: f.activado, motivo: f.motivo, fecha_fin: f.fecha_fin }));
  const modulos = { ...((modRaw ?? { permitidos: {}, efectivos: {} }) as { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> }), excepciones };
  const limites = (limRaw ?? null) as Record<string, unknown> | null;
```

y en el JSON de respuesta agregar `modulos, limites,`.

- [ ] **Step 2: PATCH `cambiar_estado` con gracia**

Reemplazar el bloque `if (accion === "cambiar_estado") { ... }` por:

```ts
  if (accion === "cambiar_estado") {
    const nuevo = String(body.estado ?? "");
    if (!ESTADOS_VALIDOS.includes(nuevo)) return NextResponse.json({ error: "ESTADO_INVALIDO" }, { status: 400 });
    const motivo = (body.motivo as string | undefined)?.trim() || null;
    const esBaja = nuevo === "SUSPENDIDO" || nuevo === "CANCELADO";
    if (esBaja && (!motivo || motivo.length < 10)) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

    const patch: Record<string, unknown> = { estado: nuevo };
    if (esBaja) {
      patch.fecha_baja = new Date().toISOString();
      patch.motivo_baja = motivo;
      // Suspender siempre lleva gracia (≥1 día). Cancelar bloquea ya, salvo que se capture gracia.
      const graciaRaw = body.gracia_dias == null ? null : Math.trunc(Number(body.gracia_dias));
      if (nuevo === "SUSPENDIDO" && (graciaRaw === null || graciaRaw < 1)) return NextResponse.json({ error: "GRACIA_REQUERIDA" }, { status: 400 });
      const bloqueoDesde = graciaRaw && graciaRaw >= 1 ? fechaBloqueo(hoyMx(), graciaRaw) : new Date().toISOString();
      patch.bloqueo_desde = bloqueoDesde;
      patch.bloqueo_mensaje = (body.mensaje as string | undefined)?.trim() || mensajeBloqueoPorDefecto(bloqueoDesde);
    } else {
      patch.fecha_baja = null; patch.motivo_baja = null; patch.bloqueo_desde = null; patch.bloqueo_mensaje = null;
    }
    const { error } = await sb.from("tenants").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `tenant.${nuevo.toLowerCase()}`, tenantId: id, motivo, payload: { estado: nuevo, bloqueo_desde: patch.bloqueo_desde ?? null } });
    return NextResponse.json({ ok: true, bloqueo_desde: patch.bloqueo_desde ?? null });
  }
```

Import arriba: `import { fechaBloqueo, mensajeBloqueoPorDefecto } from "../../../lib/bloqueo";`.

- [ ] **Step 3: PATCH módulos y límites**

Antes del `return NextResponse.json({ error: "ACCION_DESCONOCIDA" } ...)` final:

```ts
  // ── Módulos por excepción (tenant_feature_flags) ──────────────────────────────────────────
  // Permitir escribe/actualiza el flag en true; quitar lo pone en false (así puede negar lo que
  // el plan incluye). "Volver al plan" = borrar el flag. cfdi no entra: lo decide el add-on.
  if (accion === "modulo_permitir" || accion === "modulo_quitar" || accion === "modulo_segun_plan") {
    const codigo = String(body.codigo ?? "");
    const motivo = (body.motivo as string | undefined)?.trim() || "";
    if (!MODULOS.some((m) => m.codigo === codigo && !m.porAddon)) return NextResponse.json({ error: "MODULO_INVALIDO" }, { status: 400 });
    if (accion !== "modulo_segun_plan" && motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });
    if (accion === "modulo_segun_plan") {
      const { error } = await sb.from("tenant_feature_flags").delete().eq("tenant_id", id).eq("flag_codigo", codigo);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await sb.from("tenant_feature_flags").upsert(
        { tenant_id: id, flag_codigo: codigo, activado: accion === "modulo_permitir", motivo, fecha_inicio: new Date().toISOString(), fecha_fin: null },
        { onConflict: "tenant_id,flag_codigo" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await auditar(sb, { accion: `tenant.${accion}`, tenantId: id, motivo: motivo || "Vuelve a lo que dice el plan", payload: { codigo } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "limites") {
    const motivo = (body.motivo as string | undefined)?.trim() || "";
    if (motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });
    const lee = (k: string): number | null => {
      const v = body[k];
      if (v === null || v === undefined || v === "") return null;
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n) || n < 1) throw new Error(`LIMITE_INVALIDO:${k}`);
      return n;
    };
    let fila: Record<string, unknown>;
    try {
      fila = { tenant_id: id, max_sucursales: lee("max_sucursales"), max_cajas_por_sucursal: lee("max_cajas_por_sucursal"), max_usuarios: lee("max_usuarios"), motivo };
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "LIMITE_INVALIDO" }, { status: 400 });
    }
    const { error } = await sb.from("tenant_limites").upsert(fila, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.limites", tenantId: id, motivo, payload: fila });
    return NextResponse.json({ ok: true });
  }
```

Import: `import { MODULOS } from "@vim/db/modulos";`.

- [ ] **Step 4: Lista de tenants con bloqueo**

En `apps/platform/app/api/tenants/route.ts`, agregar `bloqueo_desde` al `select` de la lista (junto a `fecha_alta`).

- [ ] **Step 5: Probar a mano contra la base local**

Levantar el panel en segundo plano (`pnpm --filter @vim/platform dev`, puerto 3002; usar la herramienta de preview, no Bash) y con la clave de dev `vim-platform-dev-key`:

```bash
K=vim-platform-dev-key; ID=$(curl -s -H "X-Platform-Key: $K" localhost:3002/api/tenants | python -c "import sys,json;print(json.load(sys.stdin)['tenants'][0]['id'])")
curl -s -H "X-Platform-Key: $K" localhost:3002/api/tenants/$ID | python -c "import sys,json;d=json.load(sys.stdin);print(d['modulos'],d['limites'])"
curl -s -X PATCH -H "X-Platform-Key: $K" -H "Content-Type: application/json" localhost:3002/api/tenants/$ID -d '{"accion":"modulo_quitar","codigo":"kds","motivo":"prueba de la entrega 1"}'
curl -s -X PATCH -H "X-Platform-Key: $K" -H "Content-Type: application/json" localhost:3002/api/tenants/$ID -d '{"accion":"cambiar_estado","estado":"SUSPENDIDO","motivo":"prueba de gracia desde la API","gracia_dias":3}'
curl -s -X PATCH -H "X-Platform-Key: $K" -H "Content-Type: application/json" localhost:3002/api/tenants/$ID -d '{"accion":"cambiar_estado","estado":"ACTIVO"}'
```
Expected: el primer GET trae `permitidos`/`efectivos` con seis claves y `limites` con `del_plan`; tras `modulo_quitar`, `permitidos.kds` es `false`; la suspensión responde `bloqueo_desde` a las `12:00:00.000Z` de tres días después; reactivar responde `bloqueo_desde: null`.

- [ ] **Step 6: Typecheck y confirmar**

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app/api
git commit -m "feat(platform): API de módulos por excepción, límites y suspensión con gracia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Sesión, barra lateral y páginas de solo lectura

**Files:**
- Create: `apps/platform/app/lib/sesion.tsx`
- Create: `apps/platform/app/lib/refresco.ts`
- Create: `apps/platform/app/components/barra-lateral.tsx`
- Create: `apps/platform/app/components/shell.tsx`
- Modify: `apps/platform/app/layout.tsx`
- Rewrite: `apps/platform/app/page.tsx` (solo redirige)
- Create: `apps/platform/app/atencion/page.tsx`, `apps/platform/app/cfdi/page.tsx`, `apps/platform/app/errores/page.tsx`, `apps/platform/app/bitacora/page.tsx`
- Modify: `apps/platform/app/components/atencion.tsx`, `cfdi.tsx` (el `onAbrirEmpresa` navega con `router.push`), `bitacora.tsx` (filtros), `errores.tsx` (refresco)

**Interfaces:**
- Produces: `useSesion(): { api: Api; salir: () => void }`; `SesionProvider`; `useRefresco(cargar: () => Promise<void>, ms?: number): { hace: number | null }`.
- Consumes: `Api` de `lib/tipos.ts`.

- [ ] **Step 1: Contexto de sesión**

`apps/platform/app/lib/sesion.tsx`:

```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LogoVim } from "@vim/ui/styles";
import type { Api } from "./tipos";
import { input, label } from "./formato";

const CLAVE = "vim.platform.clave";
const Ctx = createContext<{ api: Api; salir: () => void } | null>(null);

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSesion fuera de SesionProvider");
  return c;
}

/**
 * La clave vive en sessionStorage: muere al cerrar la pestaña y no sobrevive al navegador.
 * Un 401 en cualquier llamada la borra y vuelve a pedirla; así una clave rotada no deja el
 * panel "abierto" enseñando errores.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [clave, setClave] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    try { setClave(sessionStorage.getItem(CLAVE)); } catch { /* sin storage: se pide siempre */ }
    setListo(true);
  }, []);

  const salir = useCallback(() => { try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ } setClave(null); }, []);

  const api = useMemo<Api>(() => async (path, init) => {
    const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "X-Platform-Key": clave ?? "", ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) { salir(); throw new Error("La clave ya no es válida. Vuelve a entrar."); }
    if (!res.ok) throw new Error(String(data.error ?? data.detalle ?? "Error"));
    return data;
  }, [clave, salir]);

  if (!listo) return null;
  if (!clave) return <Entrada onEntrar={(k) => { try { sessionStorage.setItem(CLAVE, k); } catch { /* nada */ } setClave(k); }} />;
  return <Ctx.Provider value={{ api, salir }}>{children}</Ctx.Provider>;
}

function Entrada({ onEntrar }: { onEntrar: (clave: string) => void }) {
  const [k, setK] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  async function entrar() {
    setError(null);
    if (!k.trim()) { setError("Ingresa la clave de plataforma"); return; }
    setProbando(true);
    try {
      const r = await fetch("/api/tenants", { headers: { "X-Platform-Key": k } });
      if (r.status === 401) throw new Error("Clave incorrecta");
      if (r.status === 429) throw new Error("Demasiados intentos. Espera 15 minutos.");
      if (!r.ok) throw new Error("No se pudo entrar");
      onEntrar(k);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al entrar"); }
    finally { setProbando(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-sel p-6">
      <div className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <LogoVim className="h-8 w-8" />
          <span className="font-display text-[17px] font-bold tracking-tight">VIM Plataforma</span>
        </div>
        <p className="mb-5 text-[13px] text-ink-3">Panel de control interno de VIM. Acceso restringido.</p>
        <label className={label} htmlFor="pk">Clave de plataforma</label>
        <input id="pk" type="password" className={input} value={k} onChange={(e) => setK(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} autoFocus />
        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        <button onClick={entrar} disabled={probando} className="mt-4 h-11 w-full rounded bg-ink text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{probando ? "Entrando…" : "Entrar"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Hook de refresco**

`apps/platform/app/lib/refresco.ts`:

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recarga cada `ms` mientras la pestaña está visible, y al volver a ella. Sin websockets: el
 * panel lo usa una persona. Devuelve hace cuántos segundos se cargó, para el pie de página.
 */
export function useRefresco(cargar: () => Promise<void>, ms = 60_000): { hace: number | null; recargar: () => Promise<void> } {
  const [ultima, setUltima] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const recargar = useCallback(async () => { await cargarRef.current(); setUltima(Date.now()); }, []);

  useEffect(() => {
    let vivo = true;
    const corre = () => { if (vivo && document.visibilityState === "visible") void recargar(); };
    corre();
    const id = setInterval(corre, ms);
    document.addEventListener("visibilitychange", corre);
    const reloj = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => { vivo = false; clearInterval(id); clearInterval(reloj); document.removeEventListener("visibilitychange", corre); };
  }, [ms, recargar]);

  void tick;
  return { hace: ultima ? Math.floor((Date.now() - ultima) / 1000) : null, recargar };
}
```

- [ ] **Step 3: Barra lateral**

`apps/platform/app/components/barra-lateral.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoVim } from "@vim/ui/styles";
import { useSesion } from "../lib/sesion";

const NAV: { href: string; label: string }[] = [
  { href: "/atencion", label: "Atención" },
  { href: "/clientes", label: "Clientes" },
  { href: "/cfdi", label: "Facturación" },
  { href: "/errores", label: "Errores" },
  { href: "/bitacora", label: "Bitácora" },
];

/**
 * Se ve distinto al admin a propósito (docs/diseno/platform.md): leyenda "interno" bajo el
 * logotipo y sin el sidebar oscuro del cliente. El conteo de críticas acompaña a Atención
 * desde cualquier pantalla: un pendiente que solo se ve en su pestaña se pospone.
 */
export function BarraLateral() {
  const path = usePathname();
  const { api, salir } = useSesion();
  const [criticas, setCriticas] = useState<number>(0);

  useEffect(() => {
    let vivo = true;
    const carga = () => api("/api/alertas").then((r) => { if (vivo) setCriticas(Number((r.resumen as { critica?: number } | undefined)?.critica ?? 0)); }).catch(() => {});
    carga();
    const id = setInterval(carga, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, [api]);

  return (
    <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-5 py-4">
        <LogoVim className="h-8 w-8" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight">VIM Plataforma</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Interno</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 pt-2">
        {NAV.map((n) => {
          const activo = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} className={["flex items-center justify-between rounded px-3 py-2 text-[13.5px] font-semibold transition", activo ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}>
              <span>{n.label}</span>
              {n.href === "/atencion" && criticas > 0 && (
                <span className={["rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums", activo ? "bg-white text-danger" : "bg-danger text-white"].join(" ")}>{criticas}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pb-4">
        <Link href="/clientes/nuevo" className="mb-2 flex h-9 items-center justify-center rounded border border-line-strong text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">Nuevo cliente</Link>
        <button onClick={salir} className="h-8 w-full rounded text-[12.5px] font-medium text-ink-3 transition hover:bg-hover hover:text-ink">Salir</button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Shell y layout**

`apps/platform/app/components/shell.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { SesionProvider } from "../lib/sesion";
import { BarraLateral } from "./barra-lateral";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <SesionProvider>
      <div className="flex min-h-screen bg-bg">
        <BarraLateral />
        <main className="min-w-0 flex-1 px-8 py-7">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>
    </SesionProvider>
  );
}
```

En `apps/platform/app/layout.tsx`, importar `Shell` y cambiar `<body>{children}</body>` por `<body><Shell>{children}</Shell></body>`. Descripción del metadata: `"Panel interno de VIM — clientes, facturación y control de cajas"`.

- [ ] **Step 5: Páginas de solo lectura y redirección**

`apps/platform/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function Inicio() { redirect("/atencion"); }
```

`apps/platform/app/atencion/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { Atencion } from "../components/atencion";
import { useSesion } from "../lib/sesion";

export default function AtencionPage() {
  const { api } = useSesion();
  const router = useRouter();
  return <Atencion api={api} onAbrirEmpresa={(id) => router.push(`/clientes/${id}`)} />;
}
```

`apps/platform/app/cfdi/page.tsx` igual con `Cfdi`. `apps/platform/app/errores/page.tsx` y `apps/platform/app/bitacora/page.tsx` renderizan `<Errores api={api} />` y `<Bitacora api={api} />`.

- [ ] **Step 6: Refresco en Atención y Errores; filtros en Bitácora**

En `components/atencion.tsx`, reemplazar el `useEffect` de carga por:

```tsx
  const cargar = useCallback(async () => {
    try { setAlertas(((await api("/api/alertas")).alertas ?? []) as Alerta[]); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, [api]);
  const { hace } = useRefresco(cargar);
```
(importar `useCallback` y `useRefresco` de `../lib/refresco`) y al final del `return`, después de la lista: `<p className="mt-4 text-[11.5px] text-ink-3">{hace === null ? "Cargando…" : `Actualizado hace ${hace} s`}</p>`. Lo mismo en `components/errores.tsx`.

En `components/bitacora.tsx`, agregar dos filtros arriba de la tabla: un `<select>` de acción (opciones = valores únicos de `accesos.map(a => a.accion)`) y un `<input>` de texto que filtra por `tenant` (`includes`, sin mayúsculas). La tabla renderiza la lista filtrada. Estados: `const [accion, setAccion] = useState(""); const [q, setQ] = useState("");`.

- [ ] **Step 7: Borrar el código viejo que ya no se usa en `page.tsx`**

`page.tsx` ya solo redirige. `Metricas`, `Empresas`, `DetalleDrawer`, `NuevoCliente` se migran en las Tasks 5–8; hasta entonces el panel **no tiene lista de clientes**. Es aceptable dentro de la rama.

- [ ] **Step 8: Verificar en el navegador**

Con el dev server en 3002 (preview tool): entrar con `vim-platform-dev-key`, ver la barra lateral con el conteo en Atención, navegar a las cuatro páginas, recargar la página y comprobar que **no** vuelve a pedir la clave, pulsar Salir y comprobar que sí la pide. Revisar consola sin errores.

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app
git commit -m "feat(platform): sesión en sessionStorage, barra lateral y páginas por ruta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Lista de clientes con métricas y alta

**Files:**
- Create: `apps/platform/app/components/tarjeta-cifra.tsx`
- Create: `apps/platform/app/components/pastilla-estado.tsx`
- Create: `apps/platform/app/clientes/page.tsx`
- Create: `apps/platform/app/clientes/nuevo/page.tsx`

**Interfaces:**
- Produces: `TarjetaCifra({ titulo, valor, sub? })`, `PastillaEstado({ estado, grande? })`.
- Consumes: `/api/metricas`, `/api/tenants`, `/api/planes`, `/api/provisionar` (sin cambios).

- [ ] **Step 1: Componentes chicos**

`apps/platform/app/components/tarjeta-cifra.tsx`:

```tsx
export function TarjetaCifra({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className="mt-1 font-display text-[26px] font-bold tabular-nums">{valor}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
```

`apps/platform/app/components/pastilla-estado.tsx`:

```tsx
import { COLOR_ESTADO, NOMBRE_ESTADO } from "../lib/formato";
export function PastillaEstado({ estado, grande }: { estado: string; grande?: boolean }) {
  return (
    <span className={["rounded-full font-semibold", grande ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]", COLOR_ESTADO[estado] ?? "bg-sel text-ink-3"].join(" ")}>
      {NOMBRE_ESTADO[estado] ?? estado}
    </span>
  );
}
```

- [ ] **Step 2: Lista de clientes**

`apps/platform/app/clientes/page.tsx` — trasladar `Empresas` y `Metricas` de la versión vieja de `page.tsx` (ver `git show main:apps/platform/app/page.tsx`) con estos cambios:

- Franja arriba: `grid grid-cols-2 gap-4 lg:grid-cols-4` con las cuatro `TarjetaCifra` de Métricas (MRR, Clientes, Suspendidos/Cancelados, Folios vendidos). Se elimina "Por vertical".
- Filtros: buscador (igual) + botones de estado `Todos · Activos · En prueba · Suspendidos · Cancelados` con el mismo estilo de los filtros de Atención (`bg-ink text-white` activo).
- Fila con `onClick={() => router.push(`/clientes/${t.id}`)}`; columna Estado usa `PastillaEstado`. Si `t.bloqueo_desde` existe y es futuro, bajo la pastilla un texto `text-[11px] text-warning`: `bloquea el dd/mm`.
- `useRefresco` para la lista y las métricas; pie "Actualizado hace N s".
- El tipo `Tenant` (con `bloqueo_desde?: string | null`) y `Metricas` se declaran en `lib/tipos.ts`.

- [ ] **Step 3: Alta**

`apps/platform/app/clientes/nuevo/page.tsx` — trasladar `NuevoCliente` y `aSlug` tal cual; `onCreado` hace `router.push("/clientes")`. `VERTICALES`, `fmtMxn`, `input`, `label` vienen de `lib/formato`.

- [ ] **Step 4: Verificar y confirmar**

Navegador: `/clientes` muestra franja, lista, filtros; clic en una fila cambia la URL a `/clientes/<id>` (404 por ahora, la ficha llega en la Task 7); `/clientes/nuevo` crea un tenant de prueba `prueba-entrega-1` y vuelve a la lista con él visible.

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app
git commit -m "feat(platform): lista de clientes con métricas y filtros, alta como página

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Diálogo de confirmación y tarjeta de sección

**Files:**
- Create: `apps/platform/app/components/dialogo-confirmar.tsx`
- Create: `apps/platform/app/components/seccion.tsx`

**Interfaces:**
- Consumes: `Modal` de `@vim/ui/styles`; `evaluarConfirmacion` (Task 2).
- Produces:
  ```ts
  type DialogoConfirmarProps = {
    abierto: boolean; onCerrar: () => void;
    titulo: string; descripcion: ReactNode;
    nombreEsperado: string;
    etiquetaBoton: string; peligroso?: boolean;
    conGracia?: boolean; conEntiendo?: string;   // texto de la casilla
    conMensaje?: boolean;                        // textarea "mensaje al cajero"
    ocupado?: boolean;
    onConfirmar: (r: { motivo: string; graciaDias?: number; mensaje?: string }) => void | Promise<void>;
  }
  ```
  `Seccion({ id, titulo, descripcion?, peligrosa?, children })`.

- [ ] **Step 1: Diálogo**

`apps/platform/app/components/dialogo-confirmar.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@vim/ui/styles";
import { evaluarConfirmacion, MOTIVO_MINIMO } from "../lib/confirmacion";
import { fechaBloqueo, GRACIA_POR_DEFECTO } from "../lib/bloqueo";
import { input, label } from "../lib/formato";

export type DialogoConfirmarProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion: ReactNode;
  nombreEsperado: string;
  etiquetaBoton: string;
  peligroso?: boolean;
  conGracia?: boolean;
  conEntiendo?: string;
  conMensaje?: boolean;
  ocupado?: boolean;
  onConfirmar: (r: { motivo: string; graciaDias?: number; mensaje?: string }) => void | Promise<void>;
};

/** Hoy en hora de México, como YYYY-MM-DD, para calcular la fecha de bloqueo en pantalla. */
function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Fricción deliberada (docs/diseno/platform.md): lo que toca a un tenant ajeno se confirma
 * escribiendo su nombre, con motivo, y diciendo a quién afecta y desde cuándo.
 */
export function DialogoConfirmar(p: DialogoConfirmarProps) {
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [gracia, setGracia] = useState<number>(GRACIA_POR_DEFECTO);
  const [entiendo, setEntiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => { if (p.abierto) { setNombre(""); setMotivo(""); setGracia(GRACIA_POR_DEFECTO); setEntiendo(false); setMensaje(""); } }, [p.abierto]);

  const r = useMemo(() => evaluarConfirmacion({
    nombreEsperado: p.nombreEsperado, nombreEscrito: nombre, motivo,
    requiereGracia: p.conGracia, graciaDias: gracia, requiereEntiendo: Boolean(p.conEntiendo), entiendo,
  }), [p.nombreEsperado, p.conGracia, p.conEntiendo, nombre, motivo, gracia, entiendo]);

  const fechaBloq = p.conGracia && Number.isInteger(gracia) && gracia >= 1 ? fechaBloqueo(hoyMx(), gracia) : null;

  return (
    <Modal open={p.abierto} onClose={p.onCerrar} title={p.titulo} className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
      <h2 className="font-display text-[18px] font-semibold tracking-tight">{p.titulo}</h2>
      <div className="mt-2 text-[13px] leading-snug text-ink-2">{p.descripcion}</div>

      <div className="mt-4">
        <label className={label} htmlFor="dc-motivo">Motivo (queda en la bitácora)</label>
        <textarea id="dc-motivo" className={`${input} h-20 py-2`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {motivo.length > 0 && motivo.trim().length < MOTIVO_MINIMO && <p className="mt-1 text-[11.5px] text-ink-3">Al menos {MOTIVO_MINIMO} caracteres.</p>}
      </div>

      {p.conGracia && (
        <div className="mt-3">
          <label className={label} htmlFor="dc-gracia">Días de gracia antes de bloquear la caja</label>
          <input id="dc-gracia" className={`${input} w-28`} inputMode="numeric" value={gracia} onChange={(e) => setGracia(Math.trunc(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))} />
          <p className="mt-1 text-[12px] text-ink-3">
            {fechaBloq
              ? `La caja dejará de vender el ${new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeZone: "America/Mexico_City" }).format(new Date(fechaBloq))} a las 6:00.`
              : "Escribe al menos 1 día."}
          </p>
        </div>
      )}

      {p.conMensaje && (
        <div className="mt-3">
          <label className={label} htmlFor="dc-mensaje">Mensaje que verá el cajero (opcional)</label>
          <textarea id="dc-mensaje" className={`${input} h-16 py-2`} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Si lo dejas vacío se usa el texto estándar con la fecha." />
        </div>
      )}

      {p.conEntiendo && (
        <label className="mt-3 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
          <span>{p.conEntiendo}</span>
        </label>
      )}

      <div className="mt-4">
        <label className={label} htmlFor="dc-nombre">Escribe <b>{p.nombreEsperado}</b> para confirmar</label>
        <input id="dc-nombre" className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={p.onCerrar} className="h-10 rounded border border-line-strong px-4 text-[13px] font-semibold hover:bg-hover">Cancelar</button>
        <button
          type="button"
          disabled={!r.ok || p.ocupado}
          onClick={() => p.onConfirmar({ motivo: motivo.trim(), graciaDias: p.conGracia ? gracia : undefined, mensaje: p.conMensaje ? mensaje.trim() || undefined : undefined })}
          className={["h-10 rounded px-4 text-[13px] font-semibold text-white disabled:opacity-50", p.peligroso ? "bg-danger" : "bg-ink"].join(" ")}
        >
          {p.ocupado ? "Aplicando…" : p.etiquetaBoton}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Sección**

`apps/platform/app/components/seccion.tsx`:

```tsx
import type { ReactNode } from "react";

export function Seccion({ id, titulo, descripcion, peligrosa, children }: { id: string; titulo: string; descripcion?: string; peligrosa?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={["scroll-mt-24 rounded-lg border p-5", peligrosa ? "mt-10 border-danger/30 bg-danger/5" : "border-line bg-surface"].join(" ")}>
      <div className="mb-4">
        <h2 className={["font-display text-[16px] font-semibold tracking-tight", peligrosa ? "text-danger" : ""].join(" ")}>{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-[12.5px] text-ink-3">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck y confirmar**

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app/components
git commit -m "feat(platform): diálogo de confirmación escrita y tarjeta de sección

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Ficha de cliente — Operación, Contrato y Facturación

**Files:**
- Create: `apps/platform/app/clientes/[id]/page.tsx`
- Create: `apps/platform/app/components/ficha-contrato.tsx`
- Create: `apps/platform/app/components/ficha-facturacion.tsx`
- Modify: `apps/platform/app/lib/tipos.ts` (tipos `Detalle`, `Plan`, `AddonCatalogo`, `AddonContratado`, `Paquete` movidos de `page.tsx`, más `Modulos` y `Limites`)

**Interfaces:**
- Consumes: `GET /api/tenants/[id]` (Task 3), `PATCH` acciones existentes, `SaludTenant`, `Seccion`, `TarjetaCifra`, `PastillaEstado`, `DialogoConfirmar` (para impersonar).
- Produces: `FichaContrato({ d, planes, accion, busy })`, `FichaFacturacion({ d, accion, busy })` con `accion: (body: Record<string, unknown>) => Promise<void>`.
- La página exporta nada; deja dos huecos para las Tasks 8 y 9: `{/* MODULOS_LIMITES */}` dentro de Contrato y `{/* ZONA_PELIGROSA */}` al final.

- [ ] **Step 1: Tipos**

En `apps/platform/app/lib/tipos.ts` agregar (copiando de la versión vieja de `page.tsx` `Tenant`, `AddonCatalogo`, `AddonContratado`, `Paquete`, `Detalle`, `Plan`) y además:

```ts
export type Modulos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean>; excepciones: { codigo: string; activado: boolean; motivo: string | null; fecha_fin: string | null }[] };
export type LimitesTrio = { max_sucursales: number | null; max_cajas_por_sucursal: number | null; max_usuarios: number | null };
export type Limites = LimitesTrio & { del_plan: LimitesTrio; excepcion: LimitesTrio & { motivo: string | null } };
```
y en `Detalle`: `modulos: Modulos; limites: Limites | null;`.

- [ ] **Step 2: Página de la ficha**

`apps/platform/app/clientes/[id]/page.tsx`:

```tsx
"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSesion } from "../../lib/sesion";
import { useRefresco } from "../../lib/refresco";
import { fmtMxn } from "../../lib/formato";
import type { Detalle, Plan } from "../../lib/tipos";
import { Seccion } from "../../components/seccion";
import { TarjetaCifra } from "../../components/tarjeta-cifra";
import { PastillaEstado } from "../../components/pastilla-estado";
import { SaludTenant } from "../../components/salud-tenant";
import { FichaContrato } from "../../components/ficha-contrato";
import { FichaFacturacion } from "../../components/ficha-facturacion";
import { DialogoConfirmar } from "../../components/dialogo-confirmar";

const ANCLAS = [["operacion", "Operación"], ["contrato", "Contrato"], ["facturacion", "Facturación"], ["peligro", "Zona peligrosa"]] as const;

export default function FichaCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api } = useSesion();
  const [d, setD] = useState<Detalle | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [impersonando, setImpersonando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const det = (await api(`/api/tenants/${id}`)) as unknown as Detalle;
      setD(det);
      setPlanes(((await api("/api/planes")).planes ?? []) as Plan[]);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, [api, id]);
  const { hace, recargar } = useRefresco(cargar);

  const accion = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try { await api(`/api/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await recargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); throw e; }
    finally { setBusy(false); }
  }, [api, id, recargar]);

  async function impersonar(motivo: string) {
    setBusy(true);
    try {
      const r = await api(`/api/tenants/${id}/impersonar`, { method: "POST", body: JSON.stringify({ motivo }) });
      if (r.link) window.open(String(r.link), "_blank");
      setImpersonando(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  if (error && !d) return <p className="text-sm text-danger">{error}</p>;
  if (!d) return <p className="text-sm text-ink-3">Cargando…</p>;
  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const estado = String(t.estado);
  const plan = t.plan as { codigo?: string; precio_mensual_mxn?: number } | null;

  return (
    <>
      {/* Cabecera: siempre dice de quién son los datos (platform.md). */}
      <div className="sticky top-0 z-10 -mx-8 mb-6 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <button onClick={() => router.push("/clientes")} className="text-[12px] font-semibold text-ink-3 hover:text-ink">← Clientes</button>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[22px] font-bold tracking-tight">{nombre}</h1>
            <PastillaEstado estado={estado} grande />
            <span className="font-mono text-[12px] text-ink-3">{String(t.codigo)} · {String(t.vertical_principal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1">
              {ANCLAS.map(([a, l]) => <a key={a} href={`#${a}`} className={["rounded px-2.5 py-1 text-[12.5px] font-semibold hover:bg-hover", a === "peligro" ? "text-danger" : "text-ink-2"].join(" ")}>{l}</a>)}
            </nav>
            <button onClick={() => setImpersonando(true)} disabled={busy} className="h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50">Entrar como este cliente</button>
          </div>
        </div>
        {t.bloqueo_desde ? (
          <p className="mt-2 text-[12.5px] font-semibold text-warning">
            Bloqueo programado: la caja dejará de vender el {new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(String(t.bloqueo_desde)))}.
          </p>
        ) : null}
      </div>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}

      <div className="flex flex-col gap-6">
        <Seccion id="operacion" titulo="Operación" descripcion="Lo que hace este cliente hoy: cajas, sincronización y ventas.">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TarjetaCifra titulo="Plan" valor={plan?.codigo ?? "—"} sub={fmtMxn(Number(plan?.precio_mensual_mxn ?? 0)) + "/mes"} />
            <TarjetaCifra titulo="Sucursales" valor={String(d.nSucursales)} />
            <TarjetaCifra titulo="Folios" valor={String(d.foliosSaldo)} sub={d.foliosBase ? `+${Math.max(d.foliosBase.mensuales - d.foliosBase.consumidos, 0)} de base este mes` : undefined} />
            <TarjetaCifra titulo="Fase" valor={String((t.onboarding as { fase?: string } | null)?.fase ?? "—")} />
          </div>
          <SaludTenant api={api} id={id} />
        </Seccion>

        <Seccion id="contrato" titulo="Contrato" descripcion="Qué paga, qué tiene contratado y qué puede usar.">
          <FichaContrato d={d} planes={planes} accion={accion} busy={busy} />
          {/* MODULOS_LIMITES */}
        </Seccion>

        <Seccion id="facturacion" titulo="Facturación" descripcion="Datos fiscales y folios CFDI.">
          <FichaFacturacion d={d} accion={accion} busy={busy} />
        </Seccion>

        {/* ZONA_PELIGROSA */}
      </div>
      <p className="mt-4 text-[11.5px] text-ink-3">{hace === null ? "" : `Actualizado hace ${hace} s`}</p>

      <DialogoConfirmar
        abierto={impersonando}
        onCerrar={() => setImpersonando(false)}
        titulo="Entrar como este cliente"
        descripcion={<>Vas a abrir el admin de <b>{nombre}</b> con acceso de soporte. Queda en la bitácora con tu motivo.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Abrir su admin"
        ocupado={busy}
        onConfirmar={({ motivo }) => impersonar(motivo)}
      />
    </>
  );
}
```

- [ ] **Step 3: Contrato**

`apps/platform/app/components/ficha-contrato.tsx` — trasladar de la versión vieja de `DetalleDrawer` los bloques **Plan** (selector con plan retirado), **Suscripción** (activar/pausar/reanudar/cancelar), **Onboarding** (fases), **Add-ons** y **Notas internas**, en ese orden, dentro de un `grid gap-4 lg:grid-cols-2` (Plan y Suscripción a la izquierda, Onboarding y Add-ons a la derecha, Notas abajo a lo ancho). Cambios respecto al original:

- "Cancelar suscripción" ya no usa `confirm()`: abre un `DialogoConfirmar` (`peligroso`, `etiquetaBoton="Cancelar suscripción"`, descripción "Se detiene el cobro de <b>{nombre}</b>. El acceso sigue hasta que cambies su estado en la zona peligrosa.") y en `onConfirmar` llama `accion({ accion: "suscripcion_estado", estado: "CANCELADA", motivo })`.
- Todo lo demás se conserva con sus textos y comentarios.

Firma:
```tsx
export function FichaContrato({ d, planes, accion, busy }: { d: Detalle; planes: Plan[]; accion: (b: Record<string, unknown>) => Promise<void>; busy: boolean })
```

- [ ] **Step 4: Facturación**

`apps/platform/app/components/ficha-facturacion.tsx` — trasladar **Datos fiscales**, **Acreditar paquete de folios** y **Ajuste manual de folios** en un `grid gap-4 lg:grid-cols-2` (fiscal a la izquierda; paquete y ajuste apilados a la derecha). Misma firma que Contrato sin `planes`.

- [ ] **Step 5: Verificar en el navegador y confirmar**

`/clientes/<id>`: cabecera pegajosa, tres secciones, cambiar plan recarga la ficha, "Entrar como este cliente" abre el diálogo y no permite confirmar hasta escribir el nombre y un motivo; cancelar suscripción usa el diálogo. `grep -rn "confirm(\|prompt(" apps/platform/app` debe devolver **nada**.

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app
git commit -m "feat(platform): ficha de cliente por secciones (operación, contrato, facturación)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Módulos y límites en la ficha

**Files:**
- Create: `apps/platform/app/components/modulos-limites.tsx`
- Modify: `apps/platform/app/clientes/[id]/page.tsx` (reemplazar `{/* MODULOS_LIMITES */}`)

**Interfaces:**
- Consumes: `MODULOS` de `@vim/db/modulos`; `d.modulos`, `d.limites` (Task 7 tipos); `DialogoConfirmar`; acciones `modulo_permitir` / `modulo_quitar` / `modulo_segun_plan` / `limites` (Task 3).
- Produces: `ModulosLimites({ d, nombre, accion, busy })`.

- [ ] **Step 1: Componente**

`apps/platform/app/components/modulos-limites.tsx`:

```tsx
"use client";
import { useState } from "react";
import { MODULOS, type CodigoModulo } from "@vim/db/modulos";
import type { Detalle } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Pendiente = { tipo: "permitir" | "quitar"; codigo: CodigoModulo; nombre: string } | { tipo: "limites"; valores: { max_sucursales: string; max_cajas_por_sucursal: string; max_usuarios: string } } | null;

/**
 * Dos capas (spec §5.4): VIM permite, el dueño enciende. Aquí solo se mueve la primera; la
 * segunda se ve en gris para entender por qué un módulo permitido puede no estar en uso.
 */
export function ModulosLimites({ d, nombre, accion, busy }: { d: Detalle; nombre: string; accion: (b: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const lim = d.limites;
  const [f, setF] = useState({
    max_sucursales: lim?.excepcion.max_sucursales?.toString() ?? "",
    max_cajas_por_sucursal: lim?.excepcion.max_cajas_por_sucursal?.toString() ?? "",
    max_usuarios: lim?.excepcion.max_usuarios?.toString() ?? "",
  });

  const origen = (codigo: string): { texto: string; clase: string } => {
    const ex = d.modulos.excepciones.find((e) => e.codigo === codigo);
    if (ex) return ex.activado ? { texto: `Permitido por excepción · ${ex.motivo ?? "sin motivo"}`, clase: "text-[#0063A8]" } : { texto: `Negado por excepción · ${ex.motivo ?? "sin motivo"}`, clase: "text-warning" };
    return d.modulos.permitidos[codigo] ? { texto: "Incluido en el plan", clase: "text-success" } : { texto: "No incluido en el plan", clase: "text-ink-3" };
  };

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className={label}>Módulos que puede usar</label>
          <ul className="flex flex-col gap-2">
            {MODULOS.map((m) => {
              const permitido = Boolean(d.modulos.permitidos[m.codigo]);
              const efectivo = Boolean(d.modulos.efectivos[m.codigo]);
              const o = origen(m.codigo);
              const tieneExcepcion = d.modulos.excepciones.some((e) => e.codigo === m.codigo);
              return (
                <li key={m.codigo} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">{m.nombre}</div>
                    <div className={["text-[11.5px]", o.clase].join(" ")}>{m.porAddon ? (permitido ? "Por el add-on CFDI" : "Sin add-on CFDI · se activa en Contrato") : o.texto}</div>
                    {permitido && !efectivo && m.interruptorDueno && <div className="text-[11.5px] text-ink-3">Permitido, pero el dueño no lo ha encendido en su admin.</div>}
                  </div>
                  {!m.porAddon && (
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {tieneExcepcion && (
                        <button onClick={() => accion({ accion: "modulo_segun_plan", codigo: m.codigo })} disabled={busy} className="h-8 rounded px-2 text-[12px] font-semibold text-ink-3 hover:bg-hover disabled:opacity-50">Según plan</button>
                      )}
                      <button
                        onClick={() => setPendiente({ tipo: permitido ? "quitar" : "permitir", codigo: m.codigo, nombre: m.nombre })}
                        disabled={busy}
                        className={["h-8 rounded px-3 text-[12.5px] font-semibold disabled:opacity-50", permitido ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"].join(" ")}
                      >
                        {permitido ? "Quitar" : "Permitir"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label className={label}>Límites</label>
          <p className="mb-2 text-[12px] text-ink-3">En gris, lo que da el plan. Escribe un número para hacer una excepción; vacío = según plan.</p>
          {(["max_sucursales", "max_cajas_por_sucursal", "max_usuarios"] as const).map((k) => {
            const nombreLim = { max_sucursales: "Sucursales", max_cajas_por_sucursal: "Cajas por sucursal", max_usuarios: "Usuarios" }[k];
            const delPlan = lim?.del_plan[k];
            return (
              <div key={k} className="mb-2 flex items-center gap-3">
                <span className="w-40 text-[13px]">{nombreLim}</span>
                <span className="w-24 text-[12px] text-ink-3">plan: {delPlan ?? "sin límite"}</span>
                <input className={`${input} w-24`} inputMode="numeric" placeholder="—" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^0-9]/g, "") })} />
              </div>
            );
          })}
          <button onClick={() => setPendiente({ tipo: "limites", valores: f })} disabled={busy} className="mt-1 h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50">Guardar límites</button>
          {lim?.excepcion.motivo && <p className="mt-2 text-[11.5px] text-ink-3">Excepción vigente: {lim.excepcion.motivo}</p>}
        </div>
      </div>

      <DialogoConfirmar
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={pendiente?.tipo === "limites" ? "Cambiar límites" : pendiente?.tipo === "quitar" ? `Quitar ${pendiente.nombre}` : `Permitir ${pendiente?.nombre ?? ""}`}
        descripcion={pendiente?.tipo === "limites"
          ? <>Los límites de <b>{nombre}</b> dejarán de seguir su plan. Se aplican al dar de alta cajas, sucursales y usuarios.</>
          : pendiente?.tipo === "quitar"
            ? <>El módulo dejará de estar disponible para <b>{nombre}</b> aunque su plan lo incluya. La caja lo obedecerá cuando reciba directivas (entrega 2).</>
            : <>Se le permite a <b>{nombre}</b> un módulo que su plan no incluye. Queda como excepción con tu motivo.</>}
        nombreEsperado={nombre}
        etiquetaBoton={pendiente?.tipo === "limites" ? "Guardar" : pendiente?.tipo === "quitar" ? "Quitar módulo" : "Permitir módulo"}
        peligroso={pendiente?.tipo === "quitar"}
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          if (!pendiente) return;
          if (pendiente.tipo === "limites") await accion({ accion: "limites", ...pendiente.valores, motivo });
          else await accion({ accion: pendiente.tipo === "quitar" ? "modulo_quitar" : "modulo_permitir", codigo: pendiente.codigo, motivo });
          setPendiente(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Montar en la ficha**

En `clientes/[id]/page.tsx` reemplazar `{/* MODULOS_LIMITES */}` por `<ModulosLimites d={d} nombre={nombre} accion={accion} busy={busy} />` e importar.

- [ ] **Step 3: Verificar**

Navegador: en un cliente en plan Esencial, "Recetas e inventario" dice "No incluido en el plan"; Permitir → diálogo → tras confirmar dice "Permitido por excepción · <motivo>" y aparece "Según plan"; Quitar en `kds` lo marca "Negado por excepción"; guardar límites con cajas = 1 y luego intentar crear una segunda caja desde el admin del cliente (`localhost:3001`, Configuración → Sucursales) muestra el error "Tu plan permite 1 caja(s) por sucursal…".

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app
git commit -m "feat(platform): módulos por excepción y límites por cliente en la ficha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Zona peligrosa

**Files:**
- Create: `apps/platform/app/components/zona-peligrosa.tsx`
- Modify: `apps/platform/app/clientes/[id]/page.tsx` (reemplazar `{/* ZONA_PELIGROSA */}`)

**Interfaces:**
- Consumes: `Seccion` (peligrosa), `DialogoConfirmar` (`conGracia`, `conMensaje`, `conEntiendo`), acción `cambiar_estado` con `gracia_dias` y `mensaje` (Task 3).
- Produces: `ZonaPeligrosa({ estado, nombre, bloqueoDesde, accion, busy })`.

- [ ] **Step 1: Componente**

`apps/platform/app/components/zona-peligrosa.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Seccion } from "./seccion";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Modo = "suspender" | "cancelar" | "reactivar" | null;

/**
 * Siempre al final, separada, en danger (docs/diseno/platform.md). Nada de aquí comparte fila
 * con lo cotidiano, y cada botón abre un diálogo que dice a quién afecta y desde cuándo.
 */
export function ZonaPeligrosa({ estado, nombre, bloqueoDesde, accion, busy }: { estado: string; nombre: string; bloqueoDesde: string | null; accion: (b: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [modo, setModo] = useState<Modo>(null);
  const boton = "h-10 rounded px-4 text-[13px] font-semibold text-white disabled:opacity-50";

  return (
    <Seccion id="peligro" titulo="Zona peligrosa" descripcion="Lo que puede dejar a este negocio sin sistema. Cada acción pide motivo y el nombre del cliente." peligrosa>
      <div className="flex flex-wrap gap-2">
        {estado !== "SUSPENDIDO" && estado !== "CANCELADO" && (
          <button onClick={() => setModo("suspender")} disabled={busy} className={`${boton} bg-warning`}>Suspender con gracia…</button>
        )}
        {estado !== "CANCELADO" && (
          <button onClick={() => setModo("cancelar")} disabled={busy} className={`${boton} bg-danger`}>Cancelar cliente…</button>
        )}
        {(estado === "SUSPENDIDO" || estado === "CANCELADO") && (
          <button onClick={() => setModo("reactivar")} disabled={busy} className={`${boton} bg-success`}>Reactivar…</button>
        )}
      </div>
      {bloqueoDesde && <p className="mt-3 text-[12.5px] text-ink-2">Bloqueo programado para el {new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(bloqueoDesde))}. Reactivar lo cancela.</p>}

      <DialogoConfirmar
        abierto={modo === "suspender"}
        onCerrar={() => setModo(null)}
        titulo="Suspender con gracia"
        descripcion={<><b>{nombre}</b> pasa a SUSPENDIDO hoy. Su caja seguirá vendiendo durante los días de gracia con un aviso, y a partir de la fecha indicada dejará de vender (cuando la caja reciba directivas, entrega 2).</>}
        nombreEsperado={nombre}
        etiquetaBoton="Suspender"
        peligroso
        conGracia
        conMensaje
        ocupado={busy}
        onConfirmar={async ({ motivo, graciaDias, mensaje }) => { await accion({ accion: "cambiar_estado", estado: "SUSPENDIDO", motivo, gracia_dias: graciaDias, mensaje }); setModo(null); }}
      />
      <DialogoConfirmar
        abierto={modo === "cancelar"}
        onCerrar={() => setModo(null)}
        titulo="Cancelar cliente"
        descripcion={<><b>{nombre}</b> pasa a CANCELADO. Sin días de gracia, el bloqueo es inmediato. Su historial no se borra y se puede reactivar después.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Cancelar cliente"
        peligroso
        conGracia
        conEntiendo="Entiendo que el cliente dejará de poder vender."
        ocupado={busy}
        onConfirmar={async ({ motivo, graciaDias }) => { await accion({ accion: "cambiar_estado", estado: "CANCELADO", motivo, gracia_dias: graciaDias }); setModo(null); }}
      />
      <DialogoConfirmar
        abierto={modo === "reactivar"}
        onCerrar={() => setModo(null)}
        titulo="Reactivar"
        descripcion={<><b>{nombre}</b> vuelve a ACTIVO y se cancela cualquier bloqueo programado.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Reactivar"
        ocupado={busy}
        onConfirmar={async ({ motivo }) => { await accion({ accion: "cambiar_estado", estado: "ACTIVO", motivo }); setModo(null); }}
      />
    </Seccion>
  );
}
```

Nota: en "Cancelar", la gracia se pide con `conGracia` pero el valor por defecto de 3 días aplica; si el operador quiere bloqueo inmediato, escribe 1. (La API trata cualquier gracia ≥ 1 como fecha futura; "inmediato" real solo si no se manda gracia, que este diálogo siempre manda. Es deliberado: la spec exige gracia salvo fraude, y ese caso se cubre con 1 día.)

- [ ] **Step 2: Montar**

En `clientes/[id]/page.tsx` reemplazar `{/* ZONA_PELIGROSA */}` por `<ZonaPeligrosa estado={estado} nombre={nombre} bloqueoDesde={t.bloqueo_desde ? String(t.bloqueo_desde) : null} accion={accion} busy={busy} />`.

- [ ] **Step 3: Verificar**

Navegador con el tenant `prueba-entrega-1`: Suspender con gracia 2 → la cabecera muestra "Bloqueo programado…", la lista `/clientes` muestra "bloquea el dd/mm" bajo la pastilla, y la bitácora registra `tenant.suspendido` con el motivo. Reactivar limpia todo. Cancelar exige la casilla.

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app
git commit -m "feat(platform): zona peligrosa con suspensión con gracia y confirmación escrita

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Cierre — pruebas, diseño, docs y publicación

**Files:**
- Modify: `docs/diseno/platform.md`
- Modify: `apps/platform/next.config.mjs` (solo si el typecheck/build lo pide)
- Delete: nada más en `page.tsx` (ya solo redirige)

- [ ] **Step 1: Suite completa**

```bash
pnpm --filter @vim/platform test
pnpm --filter @vim/platform typecheck
supabase test db
grep -rn "confirm(\|prompt(" apps/platform/app || echo "sin confirm/prompt"
```
Expected: vitest 4 archivos verdes; typecheck limpio; pgTAP todos verdes; el grep no encuentra nada.

- [ ] **Step 2: Revisión de diseño**

Cargar la skill `emil-design-eng` y recorrer las cinco pantallas en el navegador a 1280×900: jerarquía de la ficha (Operación primero, Zona peligrosa separada y en danger), un solo botón `accent`/`ink` dominante por sección, estados de foco visibles en inputs y botones, la cabecera pegajosa no tapa las anclas (`scroll-mt-24`). Capturar una imagen de `/clientes/<id>` y otra de `/atencion` con `computer.screenshot` y mandarlas a Fermín con `SendUserFile`.

- [ ] **Step 3: Revisión de seguridad**

Invocar `security-review` sobre la rama. Lo que debe salir limpio: `service_role` solo en `app/api/*`; toda acción nueva pasa por `autorizar()` y `auditar()`; el `sessionStorage` solo guarda la clave y se borra en 401; `modulos_efectivos`/`limites_efectivos` con guard por claim; `tenant_limites` sin políticas. Corregir lo que salga antes de seguir.

- [ ] **Step 4: Actualizar `docs/diseno/platform.md`**

Reemplazar "Poca superficie (7 pantallas) y mucho poder por pantalla." por:

```markdown
Poca superficie y mucho poder por pantalla. Desde la entrega 1 del ADR 0014 (04/09/2026) el
panel es una barra lateral con cinco pantallas globales (Atención, Clientes, Facturación,
Errores, Bitácora) y una **ficha de cliente** con cuatro secciones en este orden: Operación,
Contrato, Facturación y Zona peligrosa. El orden es el del trabajo diario: primero si está
operando, luego qué paga, luego lo que factura, y al final, aparte, lo que puede romperle el
negocio.
```

Y bajo "Fricción deliberada en lo destructivo" agregar al final:

```markdown
Esto lo implementa `app/components/dialogo-confirmar.tsx`: motivo de al menos 10 caracteres,
nombre comercial escrito, días de gracia cuando aplica y una casilla "entiendo" en cancelar.
`prompt()` y `confirm()` del navegador no se usan en este panel.
```

```bash
git add docs/diseno/platform.md
git commit -m "docs(diseno): el panel de plataforma pasa a barra lateral y ficha por secciones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Publicar**

Pedir a Fermín el visto bueno con las capturas. Con su sí:

```bash
supabase db push
git push -u origin platform-centro-control
```
Abrir PR contra `main` con `gh pr create` (título: "Panel de plataforma: rediseño, módulos y límites (ADR 0014, entrega 1)"). Al hacer merge, Vercel despliega `platform.vimpos.com.mx` solo (git conectado). Verificar con:

```bash
curl -s -H "X-Platform-Key: $PLATFORM_KEY_PROD" https://platform.vimpos.com.mx/api/tenants/<id-knockout>/ | python -c "import sys,json;d=json.load(sys.stdin);print(d['modulos']['permitidos'], d['limites'])"
```
Expected: Knock-Out (plan Negocio o heredado) con `recetas: true`, `kds: true`, y `limites.del_plan` con los del plan.

- [ ] **Step 6: Memoria**

Actualizar `../MEMORY.md` (sección 2, "Dónde estamos") con dos líneas: entrega 1 del ADR 0014 en producción con fecha, y que las entregas 2–4 (latido, avisos, versiones) requieren escritorio 0.4.58. Guardar en la memoria de Claude un `project_platform_centro_control.md` con el estado de las cuatro entregas.

---

## Self-review (hecho al escribir)

- **Cobertura de la spec §5:** 5.1 navegación → Tasks 4–5; 5.2 sesión → Task 4; 5.3 ficha y diálogos → Tasks 6, 7, 9; 5.4 módulos y límites → Tasks 1, 2, 3, 8; 5.5 migración → Task 1; 5.6 refresco → Tasks 4, 5, 7; 5.7 API → Task 3; 5.8 visual → Tasks 4–9 + revisión en Task 10. §10 seguridad → Task 10 paso 3. §11 pruebas → Tasks 1, 2 y verificación manual por tarea. §12 paso 1 → Task 10.
- **Fuera de este plan (a propósito):** el candado "No incluido en tu plan" en el admin del dueño y los límites de sucursales/usuarios se aplican en la entrega 2 con `mi_acceso()`; `/avisos` y `/versiones` son entregas 3 y 4.
- **Consistencia de nombres:** `accion(body)` devuelve `Promise<void>` en Tasks 7, 8, 9; `DialogoConfirmar` props iguales en 6, 7, 8, 9; `Detalle.modulos`/`Detalle.limites` definidos en Task 7 y usados en 8; acciones de la API (`modulo_permitir`, `modulo_quitar`, `modulo_segun_plan`, `limites`, `cambiar_estado` con `gracia_dias`/`mensaje`) iguales en Tasks 3, 8, 9; `hoyMx` de `@vim/fecha` en el servidor y una copia local en el diálogo (cliente no importa `@vim/fecha` para no arrastrar dependencias de servidor; si `@vim/fecha` es puro, usarlo también ahí).
