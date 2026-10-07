# Lealtad 1A — Nube, reglas y sincronización: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en la base, en la nube y en el escritorio todo lo que la lealtad necesita para ganar, canjear, vencer y viajar entre sucursales, probado sin una sola pantalla.

**Architecture:** Libro de movimientos que solo se agrega (`lealtad_movimientos`); el saldo se deriva de él. Ganar corre en la base donde se cobra (caja o nube) por trigger; canjear lo autoriza solo la nube por la Edge Function `lealtad-canje`. La caja sube movimientos y recibe programa, premios, saldos y clientes; el teléfono es la identidad del cliente y la nube fusiona duplicados.

**Tech Stack:** Postgres 15/17 (plpgsql, RLS, pgTAP, pg_cron con guarda), Supabase Edge Functions (Deno), escritorio Electron (`desktop/src/*.mjs`, `node:test`).

**Spec:** `docs/superpowers/specs/2026-10-05-lealtad-design.md`

Este es el primero de tres planes de la entrega 1. **1B** (POS: saldo, canje, ticket impreso, corte) y **1C** (admin `/lealtad`, panel, ADR de salida, instalador) consumen las interfaces que aquí se definen y se escriben cuando este plan esté implementado.

## Global Constraints

- Una sola migración: `supabase/migrations/0156_lealtad.sql`, que crece por secciones (§1…§8) a lo largo de las tareas. Si al empezar 0156 ya existe, usa el siguiente número libre y cámbialo en todo el plan. **Una vez aplicada en producción no se edita.**
- La migración corre también en el Postgres de cada caja al arrancar (`desktop/src/runtime.mjs:430-448`), sin lista de exclusión: todo debe ser inocuo en local. `pg_cron` solo dentro de `IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')`.
- RLS en toda tabla con `tenant_id`. Helpers reales: `current_tenant_id()`, `es_admin_del_tenant(uuid)`. No existen `auth_tenant_id()` ni `tiene_rol()`.
- Dinero en `numeric(12,2)`; puntos y sellos en `integer`. Sin `any` en TS.
- Fechas de negocio en `America/Mexico_City`. Ningún smoke compara `CURRENT_DATE` contra fechas de negocio.
- Las funciones que una migración anterior definió se redefinen **copiando el cuerpo íntegro de la versión vigente** y aplicando solo los cambios que el plan lista.
- Código del módulo: `lealtad`. Código del add-on: `LEALTAD`, $100.00.
- El canje es descuento, nunca forma de pago.
- 1 punto = $1 en `PUNTOS_DINERO`.
- Commits en español, estilo del repo (`feat(lealtad): …`). Rama: `feat/lealtad-1a`.
- Cómo correr pruebas: smokes `npm run smokes` dentro de `desktop/` (o `node scripts/smokes.mjs smoke_x.sql`); pgTAP `supabase test db`; escritorio `pnpm test:escritorio`; funciones `pnpm test:functions`.

## Lo que este plan deja fuera, y quién lo toma

`tickets.lealtad_mxn` nace aquí y aquí se corrige el recálculo y el CFDI. Los demás consumidores de los descuentos del ticket son de lectura y van en los otros planes:

| Consumidor | Archivo | Plan |
|---|---|---|
| `reporte_x` (payload del corte) | `0011_reportes_cierres.sql:295` | 1B |
| Totales del POS, sidebar, lista y consulta de cuentas | `apps/pos/app/lib/cobro.ts:187`, `sidebar-ticket.tsx:437`, `pantalla-cuentas-modo.tsx:217`, `pantalla-consulta-cuentas.tsx:253` | 1B |
| Ticket impreso y su espejo | `print/ticket-datos.ts:77`, `ticket-builder.ts:98`, `recibo-ticket.tsx:138` | 1B |
| Corte Z | `cierre.ts:38`, `reporte-z-builder.ts:170`, `recibo-z.tsx:125` | 1B |
| `vw_estado_resultados_dia`, `estado_resultados_periodo`, `kpis_dia_sucursal`, `vw_ventas_por_marca` | `0011:723/1187/1232`, `0010:1561` | 1C |
| `vw_clientes_lista` con saldo | `0118:26` | 1C |
| `_sincronizar_addons_del_plan` y su espejo `ADDONS_DEL_PLAN` | `0141:277`, `apps/platform/app/lib/cambio-plan.ts:10` | 1C |

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0156_lealtad.sql` | Todo el SQL: esquema, RLS, add-on, reglas, canje, programa, sync |
| `supabase/tests/0038_lealtad.test.sql` | Aislamiento entre negocios y permisos (pgTAP) |
| `supabase/tests/0002_rls_cobertura.test.sql`, `0003_grants_secdef.test.sql`, `0010_modulos_limites.test.sql` | Guardias existentes que hay que mantener al día |
| `supabase/scripts/smoke_lealtad_ganar.sql` | Ganar, tope, reversas |
| `supabase/scripts/smoke_lealtad_totales.sql` | Recálculo del ticket con canje |
| `supabase/scripts/smoke_lealtad_canje.sql` | Canje, idempotencia, saldo insuficiente, quitar |
| `supabase/scripts/smoke_lealtad_programa.sql` | Cambio de mecánica, ajuste, vencimiento, red de 48 h, apagado |
| `supabase/scripts/smoke_sync_lealtad.sql` | Push de movimientos, fusión por teléfono, pull |
| `desktop/src/sync-push.mjs` (+ test) | Libreta y subida de movimientos y canjes |
| `desktop/src/sync-pull.mjs` (+ test) | Bajada de clientes, programa, premios y saldos |
| `desktop/src/gateway.mjs` | Puente `/functions/v1/lealtad-canje` |
| `desktop/src/lealtad-puente.mjs` (+ test) | Lógica pura del puente, probada sin red |
| `supabase/functions/lealtad-canje/index.ts` | Entrada única de saldo y canje |
| `supabase/functions/_shared/lealtad/cuerpo.ts` (+ test) | Validación del cuerpo y guarda del módulo |
| `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md` | ADR |

---

### Task 1: Esquema, RLS y add-on

**Files:**
- Create: `supabase/migrations/0156_lealtad.sql` (§1–§3)
- Create: `supabase/tests/0038_lealtad.test.sql`
- Modify: `supabase/tests/0010_modulos_limites.test.sql` (solo si afirma el conjunto exacto de claves)

**Interfaces:**
- Produces: tipos `lealtad_mecanica`, `lealtad_movimiento_tipo`; tablas `lealtad_programa`, `lealtad_premios`, `lealtad_movimientos`, `lealtad_saldos`, `ticket_canjes_lealtad`, `clientes_alias`; columnas `tickets.lealtad_mxn`, `clientes.codigo_publico`, `configuracion_tenant.modulo_lealtad_activo`; función `lealtad_vence_el(p_tenant uuid, p_ultima timestamptz) RETURNS date`; clave `lealtad` en `modulos_efectivos()`.

- [ ] **Step 1: Escribir la prueba pgTAP que falla**

`supabase/tests/0038_lealtad.test.sql`:

```sql
-- ============================================================================
-- 0156 · lealtad: cada negocio ve solo lo suyo, solo dueño o admin configura, nadie escribe el
-- libro ni los saldos a mano, y el interruptor exige add-on y programa.
-- ============================================================================
begin;
select plan(14);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set otro   '38383838-0000-0000-0000-0000000000aa'
\set cli    '38383838-0000-0000-0000-000000000001'
\set cli2   '38383838-0000-0000-0000-000000000002'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0038', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into clientes (id, tenant_id, nombre, telefono) values
  (:'cli',  :'t',    'Ana Propia', '4770000381'),
  (:'cli2', :'otro', 'Beto Ajeno', '4770000382');
insert into lealtad_programa (tenant_id, mecanica, porcentaje) values (:'otro', 'PUNTOS_DINERO', 5);
insert into lealtad_saldos (tenant_id, cliente_id, saldo, programa_version) values
  (:'t', :'cli', 10, 1), (:'otro', :'cli2', 99, 1);

-- 1-2) Estructura.
select has_column('tickets', 'lealtad_mxn', 'tickets lleva el descuento por lealtad');
select isnt((select codigo_publico from clientes where id = :'cli'), null, 'todo cliente nace con código público');

-- 3) El módulo aparece en modulos_efectivos, apagado por omisión.
select is((select (modulos_efectivos(:'t') -> 'efectivos' ->> 'lealtad')::boolean), false, 'lealtad nace apagada');

-- Como el cajero.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 4-5) Ve lo de su negocio y no lo ajeno.
select is((select count(*)::int from lealtad_saldos), 1, 'el cajero ve solo los saldos de su negocio');
select is((select count(*)::int from lealtad_programa), 0, 'el programa de otro negocio no se ve');

-- 6-8) No configura ni escribe el libro ni los saldos.
select throws_ok(
  format($$ insert into lealtad_programa (tenant_id, mecanica) values (%L, 'SELLOS') $$, :'t'),
  '42501', null, 'un cajero no crea el programa');
select throws_ok(
  format($$ insert into lealtad_movimientos (tenant_id, cliente_id, tipo, puntos, programa_version) values (%L, %L, 'AJUSTE', 50, 1) $$, :'t', :'cli'),
  '42501', null, 'nadie escribe el libro a mano');
-- Sin GRANT de UPDATE: aquí no filtra RLS, lanza permiso denegado.
select throws_ok(
  format($$ update lealtad_saldos set saldo = 9999 where cliente_id = %L $$, :'cli'),
  '42501', null, 'nadie edita un saldo a mano');

-- 9) Tampoco enciende el módulo.
select throws_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  '42501', null, 'un cajero no enciende la lealtad');

-- Como el dueño.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 10) Sin add-on no se enciende.
select throws_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  '42501', null, 'sin el add-on no se enciende');

-- 11-12) El dueño crea su programa, nunca el de otro.
select lives_ok(
  format($$ insert into lealtad_programa (tenant_id, mecanica, porcentaje) values (%L, 'PUNTOS_DINERO', 5) $$, :'t'),
  'el dueño crea el programa');
select throws_ok(
  format($$ insert into lealtad_premios (tenant_id, producto_id, costo) select %L, id, 5 from productos limit 1 $$, :'otro'),
  '42501', null, 'el dueño no crea premios en otro negocio');

-- 13-14) Con add-on y programa, sí enciende, y queda efectivo.
reset role;
insert into tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
select :'t', id, (now() at time zone 'America/Mexico_City')::date, true, 100 from addons where codigo = 'LEALTAD';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select lives_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  'con add-on y programa, el dueño enciende');
select is((select (modulos_efectivos(:'t') -> 'efectivos' ->> 'lealtad')::boolean), true, 'lealtad queda efectiva');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `supabase db reset && supabase test db`
Expected: FAIL en `0038_lealtad.test.sql` con `relation "lealtad_programa" does not exist`.

- [ ] **Step 3: Escribir §1–§3 de la migración**

`supabase/migrations/0156_lealtad.sql`:

```sql
-- ============================================================================
-- 0156 · Sistema de lealtad (ADR 0030; spec docs/superpowers/specs/2026-10-05-lealtad-design.md)
--
-- Libro de movimientos que solo se agrega; el saldo se deriva de él. Ganar corre donde se cobra
-- (caja o nube); canjear lo autoriza solo la nube. Esta migración corre también en el Postgres de
-- cada caja: nada aquí puede depender de algo que solo exista en la nube.
-- ============================================================================

-- ── §1 Tipos y tablas ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE lealtad_mecanica AS ENUM ('PUNTOS_DINERO', 'SELLOS', 'PUNTOS_PREMIOS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lealtad_movimiento_tipo AS ENUM
    ('GANADO', 'CANJE', 'REVERSA_GANADO', 'REVERSA_CANJE', 'AJUSTE', 'VENCIMIENTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lealtad_programa (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  mecanica            lealtad_mecanica NOT NULL,
  -- Sube en cada cambio de mecánica. Un movimiento de otra versión se registra y no suma.
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  porcentaje          numeric(5,2) NULL CHECK (porcentaje > 0 AND porcentaje <= 50),       -- PUNTOS_DINERO
  pesos_por_punto     numeric(10,2) NULL CHECK (pesos_por_punto > 0),                      -- PUNTOS_PREMIOS
  compra_minima_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (compra_minima_mxn >= 0),
  vencimiento_meses   integer NULL CHECK (vencimiento_meses BETWEEN 1 AND 60),             -- NULL = nunca
  tope_compras_dia    integer NOT NULL DEFAULT 3 CHECK (tope_compras_dia BETWEEN 1 AND 50),
  -- Última vez que se encendió el módulo: el reloj de vencimiento no corre mientras está apagado.
  encendido_desde     timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lealtad_programa_parametros_chk CHECK (
    (mecanica = 'PUNTOS_DINERO'  AND porcentaje IS NOT NULL)
    OR (mecanica = 'PUNTOS_PREMIOS' AND pesos_por_punto IS NOT NULL)
    OR mecanica = 'SELLOS')
);
COMMENT ON TABLE lealtad_programa IS 'Programa de lealtad del negocio: una fila, una mecánica activa. ADR 0030.';

CREATE TABLE IF NOT EXISTS lealtad_premios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  costo       integer NOT NULL CHECK (costo > 0),                 -- puntos o sellos
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lealtad_premios_producto_uq
  ON lealtad_premios (tenant_id, producto_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE lealtad_premios IS 'Catálogo de premios (SELLOS y PUNTOS_PREMIOS). Baja a la caja; usa deleted_at porque el pull no trae lápidas.';

CREATE TABLE IF NOT EXISTS lealtad_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo                lealtad_movimiento_tipo NOT NULL,
  puntos              integer NOT NULL,                            -- con signo
  programa_version    integer NOT NULL,
  -- SIN llave foránea a propósito: el movimiento puede llegar a la nube en un lote anterior al de
  -- su ticket, y una FK lo rechazaría en cada ciclo.
  ticket_id           uuid NULL,
  sucursal_id         uuid NULL,
  caja_id             uuid NULL,
  usuario_id          uuid NULL,
  premio_id           uuid NULL,
  monto_mxn           numeric(12,2) NULL,
  motivo              text NULL,
  -- En una REVERSA_CANJE: el id del CANJE que deshace.
  canje_movimiento_id uuid NULL,
  -- El saldo tal como quedó donde se escribió. La verdad es lealtad_saldos de la nube.
  saldo_visto         integer NULL,
  fecha               timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lealtad_mov_signo_chk CHECK (
    (tipo IN ('GANADO', 'REVERSA_CANJE') AND puntos > 0)
    OR (tipo IN ('CANJE', 'REVERSA_GANADO', 'VENCIMIENTO') AND puntos < 0)
    OR (tipo = 'AJUSTE' AND puntos <> 0))
);
CREATE INDEX IF NOT EXISTS idx_lealtad_mov_cliente ON lealtad_movimientos (tenant_id, cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_lealtad_mov_ticket ON lealtad_movimientos (ticket_id) WHERE ticket_id IS NOT NULL;
-- Un canje se deshace una sola vez, venga la reversa de la caja o de la red de seguridad.
CREATE UNIQUE INDEX IF NOT EXISTS lealtad_mov_una_reversa_por_canje
  ON lealtad_movimientos (canje_movimiento_id) WHERE tipo = 'REVERSA_CANJE';
COMMENT ON TABLE lealtad_movimientos IS 'El libro de la lealtad. Solo se agrega; lo escriben funciones definer. ADR 0030.';

CREATE TABLE IF NOT EXISTS lealtad_saldos (
  cliente_id        uuid PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  saldo             integer NOT NULL DEFAULT 0,
  ultima_actividad  timestamptz NULL,
  vence_el          date NULL,
  programa_version  integer NOT NULL DEFAULT 1,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lealtad_saldos_tenant ON lealtad_saldos (tenant_id);
COMMENT ON TABLE lealtad_saldos IS 'Saldo por cliente. La verdad es la de la nube; en la caja es una copia que el pull corrige con los movimientos pendientes de subir.';

CREATE TABLE IF NOT EXISTS ticket_canjes_lealtad (
  -- El id ES el id del movimiento CANJE que la nube autorizó.
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id             uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cliente_id            uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  premio_id             uuid NULL,
  -- NULL = descuento sobre la cuenta (PUNTOS_DINERO). Con valor = premio de producto sobre ese renglón.
  ticket_item_id        uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,
  puntos                integer NOT NULL CHECK (puntos > 0),
  monto_descontado_mxn  numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),
  revertido             boolean NOT NULL DEFAULT false,
  revertido_at          timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_canje_uno_vivo ON ticket_canjes_lealtad (ticket_id) WHERE NOT revertido;
COMMENT ON TABLE ticket_canjes_lealtad IS 'El canje aplicado a un ticket. Un canje vivo por ticket. Sube con su ticket.';

CREATE TABLE IF NOT EXISTS clientes_alias (
  alias_id    uuid PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE clientes_alias IS 'Id que una caja le dio a un cliente cuyo teléfono ya existía en la nube con otro id. La nube redirige a cliente_id todo lo que llegue con alias_id.';

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lealtad_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (lealtad_mxn >= 0);
COMMENT ON COLUMN tickets.lealtad_mxn IS 'Descuento por canje de lealtad. Hermano de promociones_mxn y descuentos_manuales_mxn; lo mantiene recalcular_totales_ticket.';

-- Código inadivinable para la página pública de consulta (entrega 3). Nace ya para que baje a las
-- cajas con el cliente. Sin pgcrypto: dos uuid v4 dan ~244 bits.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_publico text NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_publico_uq ON clientes (codigo_publico);

ALTER TABLE configuracion_tenant ADD COLUMN IF NOT EXISTS modulo_lealtad_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_lealtad_activo IS 'Interruptor del dueño para la lealtad. VIM concede el add-on LEALTAD; el dueño lo enciende. Es lo único que la caja puede consultar en SQL (tenant_addons no baja).';

-- ── §2 RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE lealtad_programa       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_premios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lealtad_saldos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_canjes_lealtad  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_alias         ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON lealtad_programa, lealtad_premios TO authenticated;
GRANT SELECT ON lealtad_movimientos, lealtad_saldos, ticket_canjes_lealtad, clientes_alias TO authenticated;
GRANT ALL ON lealtad_programa, lealtad_premios, lealtad_movimientos, lealtad_saldos,
             ticket_canjes_lealtad, clientes_alias TO service_role;

DO $$
DECLARE t text;
BEGIN
  -- Lectura: todo empleado del negocio.
  FOREACH t IN ARRAY ARRAY['lealtad_programa', 'lealtad_premios', 'lealtad_movimientos',
                           'lealtad_saldos', 'ticket_canjes_lealtad', 'clientes_alias'] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t || '_select', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
  -- Escritura: solo dueño o administrador, y solo en programa y premios. El libro, los saldos y
  -- los canjes los escriben funciones definer: no tienen política de escritura a propósito.
  FOREACH t IN ARRAY ARRAY['lealtad_programa', 'lealtad_premios'] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_insert', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)) WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_update', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_lealtad_programa_updated_at ON lealtad_programa;
CREATE TRIGGER trg_lealtad_programa_updated_at BEFORE UPDATE ON lealtad_programa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_lealtad_premios_updated_at ON lealtad_premios;
CREATE TRIGGER trg_lealtad_premios_updated_at BEFORE UPDATE ON lealtad_premios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §3 Add-on, módulo e interruptor ─────────────────────────────────────────
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES (
  'LEALTAD',
  'Programa de lealtad',
  'Tus clientes ganan puntos o sellos en cada compra y los canjean en caja. '
    || 'Incluido sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('lealtad', true),
  25
)
ON CONFLICT (codigo) DO NOTHING;

UPDATE planes
   SET features_incluidos = COALESCE(features_incluidos, '{}'::jsonb) || jsonb_build_object('lealtad_incluido', codigo <> 'ESENCIAL'),
       updated_at = now()
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- Fecha en que vence un saldo: la última actividad (o el último encendido, lo que sea más reciente)
-- más los meses del programa, en hora de México. NULL = no vence.
CREATE OR REPLACE FUNCTION lealtad_vence_el(p_tenant uuid, p_ultima timestamptz)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p.vencimiento_meses IS NULL OR p_ultima IS NULL THEN NULL
    ELSE ((GREATEST(p_ultima, COALESCE(p.encendido_desde, p_ultima)) AT TIME ZONE 'America/Mexico_City')::date
          + make_interval(months => p.vencimiento_meses))::date
  END
  FROM lealtad_programa p WHERE p.tenant_id = p_tenant;
$$;
REVOKE ALL ON FUNCTION lealtad_vence_el(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_vence_el(uuid, timestamptz) TO authenticated, service_role;

-- El interruptor: solo dueño o admin, solo con add-on y programa. Al encender, el reloj de
-- vencimiento arranca de ese momento (spec §5, regla 9). SECURITY DEFINER porque
-- tenant_addon_activo es exclusiva de service_role desde la 0132.
-- En la caja el pull va en modo réplica y este trigger no se dispara: el valor llega tal cual.
CREATE OR REPLACE FUNCTION configuracion_tenant_lealtad_guardia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.modulo_lealtad_activo IS NOT DISTINCT FROM OLD.modulo_lealtad_activo THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.modulo_lealtad_activo = false THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'authenticated' AND NOT es_admin_del_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede encender o apagar la lealtad.' USING ERRCODE = '42501';
  END IF;

  IF NEW.modulo_lealtad_activo THEN
    IF NOT tenant_addon_activo(NEW.tenant_id, 'LEALTAD') THEN
      RAISE EXCEPTION 'SIN_ADDON_LEALTAD' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM lealtad_programa WHERE tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'SIN_PROGRAMA_LEALTAD' USING ERRCODE = '22023';
    END IF;
    UPDATE lealtad_programa SET encendido_desde = now() WHERE tenant_id = NEW.tenant_id;
    UPDATE lealtad_saldos s
       SET vence_el = lealtad_vence_el(s.tenant_id, s.ultima_actividad), updated_at = now()
     WHERE s.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_lealtad_guardia ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_lealtad_guardia
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_lealtad_guardia();

-- Retirar el add-on apaga el interruptor. Así "apagado" es un solo hecho que la caja sí puede leer.
CREATE OR REPLACE FUNCTION tenant_addons_apaga_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activo AND NOT NEW.activo
     AND NEW.addon_id = (SELECT id FROM addons WHERE codigo = 'LEALTAD')
     AND NOT tenant_addon_activo(NEW.tenant_id, 'LEALTAD') THEN
    UPDATE configuracion_tenant SET modulo_lealtad_activo = false
     WHERE tenant_id = NEW.tenant_id AND modulo_lealtad_activo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_addons_apaga_lealtad ON tenant_addons;
CREATE TRIGGER trg_tenant_addons_apaga_lealtad
  AFTER UPDATE OF activo ON tenant_addons
  FOR EACH ROW EXECUTE FUNCTION tenant_addons_apaga_lealtad();
```

A continuación, en la misma §3, redefine `modulos_efectivos`: copia íntegra la función vigente de `supabase/migrations/0113_delivery_addon.sql:43-112` (con sus `REVOKE`/`GRANT`) y aplica exactamente estos dos cambios:

1. En el `DECLARE`, junto a `v_del boolean;`, añade:

```sql
  v_lea boolean;
```

2. Justo antes del `RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);`, añade:

```sql
  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));
```

- [ ] **Step 4: Correr las pruebas**

Run: `supabase db reset && supabase test db`
Expected: `0038_lealtad.test.sql` PASS (14/14). `0002_rls_cobertura` PASS (las seis tablas tienen RLS y política). Si `0010_modulos_limites.test.sql` falla porque afirma el conjunto exacto de claves de `modulos_efectivos`, añade `lealtad` (valor `false`) a lo esperado en ese archivo y vuelve a correr.

- [ ] **Step 5: Comprobar que la migración entra en una caja**

Run (desde `desktop/`): `npm run verify:migraciones`
Expected: termina sin error y lista `0156_lealtad.sql` entre las aplicadas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/tests/0038_lealtad.test.sql supabase/tests/0010_modulos_limites.test.sql
git commit -m "feat(lealtad): esquema, RLS y add-on (0156 §1-§3)"
```

---

### Task 2: Ganar y revertir lo ganado

**Files:**
- Modify: `supabase/migrations/0156_lealtad.sql` (añadir §4)
- Modify: `supabase/tests/0003_grants_secdef.test.sql:28` (lista `_secdef_solo_service`)
- Create: `supabase/scripts/smoke_lealtad_ganar.sql`

**Interfaces:**
- Consumes: tablas y `lealtad_vence_el` de la Task 1.
- Produces:
  - `lealtad_puntos_por_compra(p_mecanica lealtad_mecanica, p_base numeric, p_porcentaje numeric, p_pesos_por_punto numeric, p_compra_minima numeric) RETURNS integer` — pura; el plan 1B la espeja en TS con los mismos casos.
  - `lealtad_registrar_movimiento(p_id uuid, p_tenant uuid, p_cliente uuid, p_tipo lealtad_movimiento_tipo, p_puntos integer, p_version integer, p_ticket uuid, p_sucursal uuid, p_caja uuid, p_usuario uuid, p_premio uuid, p_monto numeric, p_motivo text, p_canje_mov uuid, p_fecha timestamptz, p_saldo_visto integer) RETURNS boolean` — `true` si lo insertó, `false` si ya existía. Único punto que escribe el libro y el saldo.
  - `lealtad_neto_ganado(p_ticket uuid) RETURNS integer`
  - `lealtad_acumular_por_ticket(p_ticket_id uuid) RETURNS integer`
  - `lealtad_revertir_ganado_ticket(p_ticket_id uuid, p_fraccion numeric DEFAULT 1) RETURNS integer`
  - Triggers `trg_tickets_lealtad` (en `tickets`) y `trg_devoluciones_lealtad` (en `devoluciones`).

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_lealtad_ganar.sql`:

```sql
-- Smoke lealtad · ganar (0156 §4). Un cliente compra y gana; pagar dos veces no duplica; el tope
-- diario frena; cancelar revierte; los sellos cuentan visitas. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_total  numeric; v_n integer;
BEGIN
  -- La función pura, caso por caso (los mismos que prueba el espejo en TS del plan 1B).
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 200, 5, NULL, 0) <> 10 THEN RAISE EXCEPTION '5%% de 200 debe dar 10'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 199.99, 5, NULL, 0) <> 9 THEN RAISE EXCEPTION 'se redondea hacia abajo'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_DINERO', 80, 5, NULL, 100) <> 0 THEN RAISE EXCEPTION 'bajo la compra mínima no gana'; END IF;
  IF lealtad_puntos_por_compra('PUNTOS_PREMIOS', 125, NULL, 10, 0) <> 12 THEN RAISE EXCEPTION '1 punto por cada $10'; END IF;
  IF lealtad_puntos_por_compra('SELLOS', 45, NULL, NULL, 0) <> 1 THEN RAISE EXCEPTION 'una visita, un sello'; END IF;
  IF lealtad_puntos_por_compra('SELLOS', 0, NULL, NULL, 0) <> 0 THEN RAISE EXCEPTION 'una cuenta en cero no gana'; END IF;

  -- Negocio con add-on, programa (10%, tope 2) e interruptor encendido.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_tenant, 'PUNTOS_DINERO', 10, 2);
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;

  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Smoke', '4770001561') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LEA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- 1) Compra de $120 con cliente: gana 12.
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-1-i');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t1;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t1) <> 'PAGADO' THEN RAISE EXCEPTION 'el ticket no quedó pagado'; END IF;
  IF lealtad_neto_ganado(v_t1) <> 12 THEN RAISE EXCEPTION 'ganado: % (esperado 12)', lealtad_neto_ganado(v_t1); END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 12 THEN RAISE EXCEPTION 'saldo no es 12'; END IF;
  IF (SELECT saldo_visto FROM lealtad_movimientos WHERE ticket_id = v_t1) <> 12 THEN RAISE EXCEPTION 'saldo_visto no se guardó'; END IF;

  -- 2) Volver a acumular el mismo ticket no duplica.
  IF lealtad_acumular_por_ticket(v_t1) <> 0 THEN RAISE EXCEPTION 'acumuló dos veces'; END IF;

  -- 3) Segunda compra del día: gana. Tercera: el tope (2) la frena.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-2-i');
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, v_total, v_total);
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-3', v_maria);
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-3-i');
  PERFORM aplicar_pago(v_t3, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF lealtad_neto_ganado(v_t3) <> 0 THEN RAISE EXCEPTION 'el tope diario no frenó la tercera compra'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 24 THEN RAISE EXCEPTION 'saldo tras dos compras no es 24'; END IF;

  -- 4) Cancelar la primera revierte sus 12 y no más.
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t1;
  IF lealtad_neto_ganado(v_t1) <> 0 THEN RAISE EXCEPTION 'cancelar no revirtió'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 12 THEN RAISE EXCEPTION 'saldo tras cancelar no es 12'; END IF;
  IF lealtad_revertir_ganado_ticket(v_t1) <> 0 THEN RAISE EXCEPTION 'revirtió dos veces'; END IF;

  -- 5) Sin cliente no hay movimiento.
  SELECT count(*) INTO v_n FROM lealtad_movimientos WHERE tenant_id = v_tenant;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-lea-4', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-4-i');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT count(*) FROM lealtad_movimientos WHERE tenant_id = v_tenant) <> v_n THEN RAISE EXCEPTION 'un ticket sin cliente generó movimiento'; END IF;

  -- 6) Con el módulo apagado nadie gana.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  UPDATE lealtad_programa SET tope_compras_dia = 50 WHERE tenant_id = v_tenant;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lea-5', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lea-5-i');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF lealtad_neto_ganado(v_t1) <> 0 THEN RAISE EXCEPTION 'ganó con el módulo apagado'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD GANAR OK';
END $$;
ROLLBACK;
```

Si `aplicar_pago` exige más argumentos al correr como `postgres`, copia la llamada exacta de `supabase/scripts/smoke_propina.sql`, que cobra un ticket en las mismas condiciones.

- [ ] **Step 2: Correrlo y verlo fallar**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_ganar.sql`
Expected: FAIL con `function lealtad_puntos_por_compra(...) does not exist`.

- [ ] **Step 3: Escribir §4 de la migración**

Añade al final de `supabase/migrations/0156_lealtad.sql`:

```sql
-- ── §4 Ganar y revertir lo ganado ───────────────────────────────────────────

-- Cuánto gana una compra. PURA: tiene un espejo en TS (apps/pos, plan 1B) con los mismos casos
-- de smoke_lealtad_ganar.sql. Si cambias una, cambia la otra.
CREATE OR REPLACE FUNCTION lealtad_puntos_por_compra(
  p_mecanica lealtad_mecanica, p_base numeric, p_porcentaje numeric,
  p_pesos_por_punto numeric, p_compra_minima numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_base IS NULL OR p_base <= 0 OR p_base < COALESCE(p_compra_minima, 0) THEN 0
    WHEN p_mecanica = 'SELLOS' THEN 1
    WHEN p_mecanica = 'PUNTOS_DINERO' THEN floor(p_base * COALESCE(p_porcentaje, 0) / 100)::integer
    WHEN p_mecanica = 'PUNTOS_PREMIOS' AND COALESCE(p_pesos_por_punto, 0) > 0 THEN floor(p_base / p_pesos_por_punto)::integer
    ELSE 0
  END;
$$;
GRANT EXECUTE ON FUNCTION lealtad_puntos_por_compra(lealtad_mecanica, numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- EL ÚNICO punto que escribe el libro y el saldo. Idempotente por id (y por "una reversa por
-- canje"): devuelve false si el movimiento ya existía y entonces no toca el saldo.
-- Un movimiento de una versión anterior del programa se registra y no suma.
CREATE OR REPLACE FUNCTION lealtad_registrar_movimiento(
  p_id uuid, p_tenant uuid, p_cliente uuid, p_tipo lealtad_movimiento_tipo, p_puntos integer, p_version integer,
  p_ticket uuid DEFAULT NULL, p_sucursal uuid DEFAULT NULL, p_caja uuid DEFAULT NULL, p_usuario uuid DEFAULT NULL,
  p_premio uuid DEFAULT NULL, p_monto numeric DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_canje_mov uuid DEFAULT NULL, p_fecha timestamptz DEFAULT now(), p_saldo_visto integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_ver   integer;
  v_saldo integer;
BEGIN
  INSERT INTO lealtad_movimientos (
    id, tenant_id, cliente_id, tipo, puntos, programa_version, ticket_id, sucursal_id, caja_id,
    usuario_id, premio_id, monto_mxn, motivo, canje_movimiento_id, fecha, saldo_visto)
  VALUES (
    COALESCE(p_id, gen_random_uuid()), p_tenant, p_cliente, p_tipo, p_puntos, p_version, p_ticket, p_sucursal, p_caja,
    p_usuario, p_premio, p_monto, p_motivo, p_canje_mov, COALESCE(p_fecha, now()), p_saldo_visto)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;

  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF v_ver IS DISTINCT FROM p_version THEN RETURN true; END IF;

  INSERT INTO lealtad_saldos (cliente_id, tenant_id, saldo, ultima_actividad, programa_version)
  VALUES (p_cliente, p_tenant, p_puntos,
          CASE WHEN p_tipo IN ('GANADO', 'CANJE') THEN COALESCE(p_fecha, now()) END, p_version)
  ON CONFLICT (cliente_id) DO UPDATE
    SET saldo = lealtad_saldos.saldo + EXCLUDED.saldo,
        -- GREATEST ignora NULL: una reversa o un ajuste no cuentan como actividad.
        ultima_actividad = GREATEST(lealtad_saldos.ultima_actividad, EXCLUDED.ultima_actividad),
        programa_version = EXCLUDED.programa_version,
        updated_at = now()
  RETURNING saldo INTO v_saldo;

  UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(p_tenant, ultima_actividad) WHERE cliente_id = p_cliente;
  UPDATE lealtad_movimientos SET saldo_visto = COALESCE(saldo_visto, v_saldo) WHERE id = v_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION lealtad_registrar_movimiento(uuid, uuid, uuid, lealtad_movimiento_tipo, integer, integer, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_registrar_movimiento(uuid, uuid, uuid, lealtad_movimiento_tipo, integer, integer, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION lealtad_neto_ganado(p_ticket uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(puntos), 0)::integer FROM lealtad_movimientos
   WHERE ticket_id = p_ticket AND tipo IN ('GANADO', 'REVERSA_GANADO');
$$;
REVOKE ALL ON FUNCTION lealtad_neto_ganado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_neto_ganado(uuid) TO service_role;

-- Lo que gana un ticket al quedar pagado. Devuelve los puntos escritos (0 si no aplica).
-- Base: lo que el cliente pagó por comida. total_mxn ya viene neto de descuentos, promociones y
-- canje; se le quitan los renglones de cargo (el envío). La propina nunca entra en total_mxn.
CREATE OR REPLACE FUNCTION lealtad_acumular_por_ticket(p_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_t       tickets%ROWTYPE;
  v_p       lealtad_programa%ROWTYPE;
  v_cargos  numeric(12,2);
  v_puntos  integer;
  v_hoy     date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_compras integer;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_t.cliente_id IS NULL THEN RETURN 0; END IF;
  -- Los pedidos de apps de delivery no ganan.
  IF v_t.modo_servicio::text LIKE 'APP\_%' THEN RETURN 0; END IF;
  IF NOT COALESCE((SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_t.tenant_id), false) THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_t.tenant_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Idempotente: un ticket con ganado vivo no vuelve a ganar (FACTURADO→PAGADO, reintentos).
  IF lealtad_neto_ganado(p_ticket_id) > 0 THEN RETURN 0; END IF;

  -- Tope diario: compras de HOY (hora de México) de este cliente que siguen contando.
  SELECT count(*) INTO v_compras
    FROM lealtad_movimientos m
   WHERE m.cliente_id = v_t.cliente_id AND m.tipo = 'GANADO'
     AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date = v_hoy
     AND NOT EXISTS (SELECT 1 FROM lealtad_movimientos r
                      WHERE r.ticket_id = m.ticket_id AND r.tipo = 'REVERSA_GANADO');
  IF v_compras >= v_p.tope_compras_dia THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
    FROM ticket_items WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;

  v_puntos := lealtad_puntos_por_compra(
    v_p.mecanica, GREATEST(v_t.total_mxn - v_cargos, 0), v_p.porcentaje, v_p.pesos_por_punto, v_p.compra_minima_mxn);
  IF v_puntos <= 0 THEN RETURN 0; END IF;

  PERFORM lealtad_registrar_movimiento(
    NULL, v_t.tenant_id, v_t.cliente_id, 'GANADO', v_puntos, v_p.version,
    p_ticket_id, v_t.sucursal_id, v_t.caja_id, auth.uid());
  RETURN v_puntos;
END $$;
REVOKE ALL ON FUNCTION lealtad_acumular_por_ticket(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_acumular_por_ticket(uuid) TO service_role;

-- Deshace lo ganado por un ticket, entero o en proporción (devolución parcial). Idempotente: solo
-- revierte lo que siga vivo. Devuelve los puntos revertidos.
CREATE OR REPLACE FUNCTION lealtad_revertir_ganado_ticket(p_ticket_id uuid, p_fraccion numeric DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_neto integer := lealtad_neto_ganado(p_ticket_id);
  v_m    lealtad_movimientos%ROWTYPE;
  v_rev  integer;
BEGIN
  IF v_neto <= 0 THEN RETURN 0; END IF;
  SELECT * INTO v_m FROM lealtad_movimientos
   WHERE ticket_id = p_ticket_id AND tipo = 'GANADO' ORDER BY fecha DESC LIMIT 1;
  v_rev := LEAST(v_neto, ceil(v_neto * LEAST(GREATEST(COALESCE(p_fraccion, 1), 0), 1))::integer);
  IF v_rev <= 0 THEN RETURN 0; END IF;
  PERFORM lealtad_registrar_movimiento(
    NULL, v_m.tenant_id, v_m.cliente_id, 'REVERSA_GANADO', -v_rev, v_m.programa_version,
    p_ticket_id, v_m.sucursal_id, v_m.caja_id, auth.uid());
  RETURN v_rev;
END $$;
REVOKE ALL ON FUNCTION lealtad_revertir_ganado_ticket(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_revertir_ganado_ticket(uuid, numeric) TO service_role;

-- El gancho en tickets. SECURITY DEFINER: lo dispara el cajero al cobrar y las funciones de
-- adentro no son ejecutables por authenticated.
-- OJO: en la nube los tickets que suben de una caja entran en modo réplica y este trigger NO
-- corre; lo ganado en la caja llega como movimiento por el push (§8). Solo corre aquí para el
-- POS web, que cobra directo contra la nube.
CREATE OR REPLACE FUNCTION trg_ticket_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado_fiscal = 'PAGADO' AND OLD.estado_fiscal <> 'PAGADO' THEN
    PERFORM lealtad_acumular_por_ticket(NEW.id);
  ELSIF NEW.estado_fiscal IN ('CANCELADO', 'ABIERTO') AND OLD.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN
    -- Cancelar o reabrir una cuenta cobrada deshace lo que ganó.
    PERFORM lealtad_revertir_ganado_ticket(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_lealtad ON tickets;
CREATE TRIGGER trg_tickets_lealtad
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_lealtad();

-- Devolución confirmada: revierte en proporción a lo devuelto. Misma condición de transición que
-- trg_devolucion_inventario (0009:314).
CREATE OR REPLACE FUNCTION trg_devolucion_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA' THEN
    SELECT total_mxn INTO v_total FROM tickets WHERE id = NEW.ticket_original_id;
    PERFORM lealtad_revertir_ganado_ticket(
      NEW.ticket_original_id,
      CASE WHEN COALESCE(v_total, 0) <= 0 THEN 1 ELSE LEAST(NEW.total_devuelto_mxn / v_total, 1) END);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_devoluciones_lealtad ON devoluciones;
CREATE TRIGGER trg_devoluciones_lealtad
  AFTER UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_lealtad();
```

- [ ] **Step 4: Registrar las funciones exclusivas de servicio en la guardia**

En `supabase/tests/0003_grants_secdef.test.sql`, dentro del `insert into _secdef_solo_service (fn, motivo) values` (línea 28), añade estas filas respetando las comas de la lista:

```sql
  ('lealtad_registrar_movimiento',  'escribe el libro y el saldo de lealtad de cualquier cliente (0156)'),
  ('lealtad_acumular_por_ticket',   'otorga puntos; solo la dispara el trigger de tickets (0156)'),
  ('lealtad_revertir_ganado_ticket','quita puntos; solo la disparan los triggers (0156)'),
```

- [ ] **Step 5: Correr las pruebas**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_ganar.sql`
Expected: `SMOKE LEALTAD GANAR OK`.

Run: `supabase db reset && supabase test db`
Expected: PASS, incluido `0003_grants_secdef`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/tests/0003_grants_secdef.test.sql supabase/scripts/smoke_lealtad_ganar.sql
git commit -m "feat(lealtad): ganar al pagar y revertir al cancelar o devolver (0156 §4)"
```

---

### Task 3: El canje dentro de los totales del ticket

**Files:**
- Modify: `supabase/migrations/0156_lealtad.sql` (añadir §5)
- Create: `supabase/scripts/smoke_lealtad_totales.sql`

**Interfaces:**
- Consumes: `ticket_canjes_lealtad`, `tickets.lealtad_mxn`.
- Produces: `recalcular_totales_ticket(uuid)` que mantiene `tickets.lealtad_mxn`; trigger `trg_ticket_canjes_lealtad_recalcular`; `cfdi_crear_borrador` que suma `lealtad_mxn` al descuento. Invariante nueva: `renglones vivos − (descuentos_manuales_mxn + promociones_mxn + lealtad_mxn) = total_mxn`.

**Decisión de diseño que el ejecutor no debe cambiar:** el premio de producto se descuenta a nivel de renglón sumándolo a `ticket_items.promocion_item_mxn`. Es a propósito: las funciones de timbrado (`timbrar-cfdi`, `timbrar-global`, `autofacturar`) leen `descuento_item_mxn + promocion_item_mxn` como el descuento del concepto, y así el CFDI cuadra sin tocarlas. A nivel de ticket ese importe se reporta en `lealtad_mxn`, no en `promociones_mxn`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_lealtad_totales.sql`:

```sql
-- Smoke lealtad · totales (0156 §5). Un canje de dinero baja el total y se reporta en lealtad_mxn;
-- un premio de producto deja su renglón en cero; revertir lo devuelve todo. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_item uuid; v_item2 uuid;
  v_canje  uuid := gen_random_uuid(); v_canje2 uuid := gen_random_uuid();
  r        tickets%ROWTYPE;
BEGIN
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Totales', '4770001562') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LTOT', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-ltot-1', v_maria);
  v_item  := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i1');
  v_item2 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i2');
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 THEN RAISE EXCEPTION 'total inicial % (esperado 240)', r.total_mxn; END IF;

  -- 1) Canje de dinero: $40 sobre la cuenta.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (v_canje, v_tenant, v_t, v_cli, 40, 40);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 200 THEN RAISE EXCEPTION 'total con canje % (esperado 200)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 40 THEN RAISE EXCEPTION 'lealtad_mxn % (esperado 40)', r.lealtad_mxn; END IF;
  IF r.promociones_mxn <> 0 OR r.descuentos_manuales_mxn <> 0 THEN RAISE EXCEPTION 'el canje se coló en otro carril'; END IF;

  -- 2) Revertirlo devuelve el total.
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = v_canje;
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'revertir no devolvió el total: % / %', r.total_mxn, r.lealtad_mxn; END IF;

  -- 3) Premio de producto: el segundo renglón sale en cero y la cuenta queda en $120.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (v_canje2, v_tenant, v_t, v_cli, v_item2, 6, 120);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 120 THEN RAISE EXCEPTION 'total con premio % (esperado 120)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'lealtad_mxn con premio % (esperado 120)', r.lealtad_mxn; END IF;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item2) <> 0 THEN RAISE EXCEPTION 'el renglón premiado no quedó en cero'; END IF;
  IF (SELECT promocion_item_mxn FROM ticket_items WHERE id = v_item2) <> 120 THEN RAISE EXCEPTION 'el descuento del renglón no quedó donde el CFDI lo lee'; END IF;

  -- 4) La invariante que el CFDI deduce.
  IF (SELECT SUM(subtotal_bruto_mxn + monto_modificadores_mxn) FROM ticket_items WHERE ticket_id = v_t AND NOT cancelado)
     - (r.descuentos_manuales_mxn + r.promociones_mxn + r.lealtad_mxn) <> r.total_mxn THEN
    RAISE EXCEPTION 'la invariante renglones - descuentos = total se rompió';
  END IF;

  -- 5) Un canje mayor que la cuenta no la deja negativa ni reporta de más.
  UPDATE ticket_canjes_lealtad SET revertido = true WHERE id = v_canje2;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_cli, 999, 999);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 0 OR r.lealtad_mxn <> 240 THEN RAISE EXCEPTION 'canje excedido: total % lealtad %', r.total_mxn, r.lealtad_mxn; END IF;

  RAISE NOTICE 'SMOKE LEALTAD TOTALES OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_totales.sql`
Expected: FAIL con `total con canje 240.00 (esperado 200)`.

- [ ] **Step 3: Escribir §5 — recálculo**

Añade a la migración el encabezado `-- ── §5 El canje en los totales del ticket ──` y debajo copia íntegra `recalcular_totales_ticket` de `supabase/migrations/0116_zonas_envio.sql:917-1080`. Aplica estos ocho cambios, y ninguno más:

1. En el `DECLARE`, después de `v_piso`:

```sql
  v_lealtad                 numeric(12,2) := 0;  -- 0156: canjes de lealtad vivos
  v_item_lea                numeric(12,2);
```

2. Dentro del bucle, justo después del `SELECT … INTO v_item_promo … ;` de promociones por renglón:

```sql
    -- 0156: premio de producto canjeado sobre este renglón. Acotado a lo que queda del renglón.
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_lea
    FROM ticket_canjes_lealtad
    WHERE ticket_item_id = v_item.id
      AND revertido = false;
    v_item_lea := LEAST(v_item_lea, GREATEST((v_item_bruto + v_item_modif) - v_item_desc - v_item_promo, 0));
```

3. Sustituye la línea del neto:

```sql
    v_item_neto := (v_item_bruto + v_item_modif) - v_item_desc - v_item_promo - v_item_lea;
```

4. En el `UPDATE ticket_items`, sustituye la línea de la promoción:

```sql
        -- 0156: el premio de lealtad va aquí porque el timbrado lee esta columna como descuento
        -- del concepto. A nivel de ticket se reporta en lealtad_mxn, no en promociones_mxn.
        promocion_item_mxn      = v_item_promo + v_item_lea,
```

5. En el bloque "Acumular al ticket", añade al final:

```sql
    v_lealtad             := v_lealtad        + v_item_lea;
```

6. Después del bloque de promociones a nivel ticket (el que termina en `IF v_total < 0 THEN v_total := 0; END IF;`) y antes de `-- Subtotal final`, añade:

```sql
  -- 0156: canje de lealtad a nivel ticket (puntos por dinero). Mismo piso que descuentos y
  -- promociones, y se reporta solo lo que de verdad se aplicó.
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_lea
  FROM ticket_canjes_lealtad
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND revertido = false;
  v_total := v_total - v_item_lea;
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_lea := v_item_lea - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  IF v_total < 0 THEN
    v_item_lea := v_item_lea + v_total;
    v_total := 0;
  END IF;
  v_lealtad := v_lealtad + GREATEST(v_item_lea, 0);
```

7. En el `UPDATE tickets` final, después de `promociones_mxn = v_promociones,`:

```sql
      lealtad_mxn             = v_lealtad,
```

8. Debajo de la función, el trigger que recalcula cuando cambia un canje:

```sql
CREATE OR REPLACE FUNCTION trg_ticket_canje_lealtad_recalcular()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM recalcular_totales_ticket(COALESCE(NEW.ticket_id, OLD.ticket_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ticket_canjes_lealtad_recalcular ON ticket_canjes_lealtad;
CREATE TRIGGER trg_ticket_canjes_lealtad_recalcular
  AFTER INSERT OR UPDATE OR DELETE ON ticket_canjes_lealtad
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_canje_lealtad_recalcular();
```

Conserva el `SET search_path` y cualquier `GRANT`/`ALTER FUNCTION` que la 0116 traiga para esta función.

- [ ] **Step 4: Escribir §5 — CFDI**

Copia íntegra `cfdi_crear_borrador` de `supabase/migrations/0135_cfdi_emisor_verificado.sql` (empieza en la línea 147; incluye sus `REVOKE`/`GRANT`). Un solo cambio: en la línea que hoy calcula el descuento del ticket (0135:216), donde dice

```sql
descuentos_manuales_mxn + promociones_mxn
```

deja

```sql
descuentos_manuales_mxn + promociones_mxn + lealtad_mxn
```

con este comentario encima: `-- 0156: el canje de lealtad es descuento, no forma de pago.`

- [ ] **Step 5: Correr las pruebas**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_totales.sql smoke_envio.sql smoke_descuento.sql smoke_descuento_item.sql smoke_propina.sql`
Expected: los cinco OK. Los cuatro viejos prueban que el recálculo no cambió para tickets sin canje.

Run: `pnpm test:functions`
Expected: PASS (`conceptos.test.ts` no cambia: deduce el descuento de ticket de `total_mxn`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/scripts/smoke_lealtad_totales.sql
git commit -m "feat(lealtad): el canje entra en los totales del ticket y en el descuento del CFDI (0156 §5)"
```

---

### Task 4: Canje, saldo y asentado

**Files:**
- Modify: `supabase/migrations/0156_lealtad.sql` (añadir §6; ampliar `trg_ticket_lealtad` de §4)
- Modify: `supabase/tests/0003_grants_secdef.test.sql`
- Create: `supabase/scripts/smoke_lealtad_canje.sql`

**Interfaces:**
- Consumes: `lealtad_registrar_movimiento`, `clientes_alias`, `ticket_canjes_lealtad`.
- Produces (todas `SECURITY DEFINER`; las cuatro primeras solo `service_role`):
  - `lealtad_resolver_cliente(p_tenant uuid, p_cliente_id uuid, p_telefono text) RETURNS uuid`
  - `lealtad_saldo(p_tenant uuid, p_cliente_id uuid, p_telefono text) RETURNS jsonb` → `{ok, cliente_id, saldo, vence_el, mecanica, programa_version}` o `{ok:false, error}`
  - `lealtad_canjear(p_canje_id uuid, p_tenant uuid, p_cliente_id uuid, p_telefono text, p_puntos integer, p_premio_id uuid, p_ticket_id uuid, p_sucursal_id uuid, p_caja_id uuid, p_usuario_id uuid) RETURNS jsonb` → `{ok:true, canje_id, cliente_id, puntos, monto_mxn, premio_id, producto_id, saldo, vence_el, programa_version, repetido}` o `{ok:false, error, saldo?}`. Errores: `MODULO_APAGADO`, `SIN_PROGRAMA`, `CLIENTE_NO_EXISTE`, `PUNTOS_INVALIDOS`, `PREMIO_INVALIDO`, `SALDO_INSUFICIENTE`.
  - `lealtad_canje_datos(p_canje_id uuid, p_tenant uuid) RETURNS jsonb` → mismo objeto que devuelve `lealtad_canjear` con `ok:true`, o `{ok:false, error:'CANJE_NO_EXISTE'|'CANJE_REVERTIDO'}`
  - `lealtad_asentar_canje(p jsonb) RETURNS uuid` — `p` = `{canje_id, tenant_id, ticket_id, cliente_id, puntos, monto_mxn, premio_id, ticket_item_id, programa_version, sucursal_id, caja_id, usuario_id}`
  - `lealtad_revertir_canje_ticket(p_ticket_id uuid, p_motivo text) RETURNS integer`
  - `lealtad_revertir_canje(p_canje_id uuid, p_tenant uuid, p_motivo text) RETURNS boolean`
  - `quitar_canje_lealtad(p_ticket_id uuid) RETURNS integer` — la única para `authenticated`; la usa el POS (plan 1B).

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_lealtad_canje.sql`:

```sql
-- Smoke lealtad · canje (0156 §6). La nube autoriza, el mismo id no descuenta dos veces, sin saldo
-- no hay canje, asentar baja el total, quitar devuelve los puntos una sola vez. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_item uuid; v_premio uuid;
  v_c1 uuid := gen_random_uuid(); v_c2 uuid := gen_random_uuid(); v_c3 uuid := gen_random_uuid();
  j jsonb; v_ver integer;
BEGIN
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_tenant, 'PUNTOS_DINERO', 10) RETURNING version INTO v_ver;
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Canje', '4770001563') RETURNING id INTO v_cli;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli, 'AJUSTE', 100, v_ver, p_motivo => 'saldo de prueba');

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LCAN', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-1', v_maria);
  v_item := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-i1');

  -- 1) Saldo: por id y por teléfono con formato.
  j := lealtad_saldo(v_tenant, v_cli, NULL);
  IF (j->>'saldo')::int <> 100 THEN RAISE EXCEPTION 'saldo por id: %', j; END IF;
  j := lealtad_saldo(v_tenant, gen_random_uuid(), '(477) 000-1563');
  IF (j->>'cliente_id')::uuid <> v_cli THEN RAISE EXCEPTION 'no resolvió por teléfono: %', j; END IF;

  -- 2) Canjear 40.
  j := lealtad_canjear(v_c1, v_tenant, v_cli, NULL, 40, NULL, v_t, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR (j->>'saldo')::int <> 60 OR (j->>'monto_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'canje: %', j; END IF;

  -- 3) El mismo id no descuenta dos veces.
  j := lealtad_canjear(v_c1, v_tenant, v_cli, NULL, 40, NULL, v_t, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR NOT (j->>'repetido')::boolean THEN RAISE EXCEPTION 'reintento: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 60 THEN RAISE EXCEPTION 'el reintento descontó de nuevo'; END IF;

  -- 4) Sin saldo suficiente no hay canje ni movimiento.
  j := lealtad_canjear(v_c2, v_tenant, v_cli, NULL, 61, NULL, v_t, v_suc, v_caja, v_maria);
  IF (j->>'ok')::boolean OR j->>'error' <> 'SALDO_INSUFICIENTE' THEN RAISE EXCEPTION 'debió rechazar: %', j; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE id = v_c2) THEN RAISE EXCEPTION 'un canje rechazado dejó movimiento'; END IF;

  -- 5) Asentar con los datos que devolvió la nube baja el total.
  j := lealtad_canje_datos(v_c1, v_tenant);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_t, 'sucursal_id', v_suc, 'caja_id', v_caja, 'usuario_id', v_maria));
  IF (SELECT total_mxn FROM tickets WHERE id = v_t) <> 80 THEN RAISE EXCEPTION 'asentar no bajó el total'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 60 THEN RAISE EXCEPTION 'asentar movió el saldo otra vez'; END IF;

  -- 6) Quitar el canje devuelve los 40, una sola vez.
  IF lealtad_revertir_canje_ticket(v_t, 'el cliente cambió de idea') <> 1 THEN RAISE EXCEPTION 'no revirtió'; END IF;
  IF lealtad_revertir_canje_ticket(v_t, 'otra vez') <> 0 THEN RAISE EXCEPTION 'revirtió dos veces'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 100 THEN RAISE EXCEPTION 'no devolvió los puntos'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_t) <> 120 THEN RAISE EXCEPTION 'no devolvió el total'; END IF;
  IF lealtad_revertir_canje(v_c1, v_tenant, 'red de seguridad') THEN RAISE EXCEPTION 'la nube lo revirtió por segunda vez'; END IF;
  IF (lealtad_canje_datos(v_c1, v_tenant))->>'error' <> 'CANJE_REVERTIDO' THEN RAISE EXCEPTION 'un canje revertido sigue siendo asentable'; END IF;

  -- 7) Cancelar la cuenta con un canje vivo lo revierte.
  j := lealtad_canjear(v_c3, v_tenant, v_cli, NULL, 30, NULL, v_t, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_t));
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 100 THEN RAISE EXCEPTION 'cancelar no devolvió el canje'; END IF;

  -- 8) Premios: con mecánica de sellos se canjea un premio y vuelve el producto.
  UPDATE lealtad_programa SET mecanica = 'SELLOS' WHERE tenant_id = v_tenant;
  INSERT INTO lealtad_premios (tenant_id, producto_id, costo) VALUES (v_tenant, v_prod, 6) RETURNING id INTO v_premio;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR (j->>'puntos')::int <> 6 OR (j->>'producto_id')::uuid <> v_prod THEN RAISE EXCEPTION 'premio: %', j; END IF;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, 10, NULL, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'PREMIO_INVALIDO' THEN RAISE EXCEPTION 'sellos sin premio debió rechazar: %', j; END IF;

  -- 9) Módulo apagado.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'MODULO_APAGADO' THEN RAISE EXCEPTION 'canjeó con el módulo apagado: %', j; END IF;

  RAISE NOTICE 'SMOKE LEALTAD CANJE OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_canje.sql`
Expected: FAIL con `function lealtad_saldo(uuid, uuid, unknown) does not exist`.

- [ ] **Step 3: Escribir §6**

Añade a la migración:

```sql
-- ── §6 Canje, saldo y asentado ──────────────────────────────────────────────

-- El cliente canónico: por id; si ese id es un alias, su cliente real; si no, por teléfono.
-- El teléfono es la identidad (spec §8.4): una caja puede conocer al cliente con otro id.
CREATE OR REPLACE FUNCTION lealtad_resolver_cliente(p_tenant uuid, p_cliente_id uuid, p_telefono text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT c.id FROM clientes c WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant AND c.deleted_at IS NULL),
    (SELECT a.cliente_id FROM clientes_alias a WHERE a.alias_id = p_cliente_id AND a.tenant_id = p_tenant),
    (SELECT c.id FROM clientes c
      WHERE c.tenant_id = p_tenant AND c.deleted_at IS NULL
        AND c.telefono = NULLIF(regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'), '')
      LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION lealtad_saldo(p_tenant uuid, p_cliente_id uuid, p_telefono text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cli uuid := lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono);
  v_p   lealtad_programa%ROWTYPE;
  v_s   lealtad_saldos%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PROGRAMA'); END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CLIENTE_NO_EXISTE'); END IF;
  SELECT * INTO v_s FROM lealtad_saldos WHERE cliente_id = v_cli;
  RETURN jsonb_build_object(
    'ok', true, 'cliente_id', v_cli,
    -- Un saldo de otra versión del programa ya no vale.
    'saldo', CASE WHEN v_s.programa_version = v_p.version THEN COALESCE(v_s.saldo, 0) ELSE 0 END,
    'vence_el', v_s.vence_el, 'mecanica', v_p.mecanica, 'programa_version', v_p.version);
END $$;

-- LA AUTORIDAD DEL CANJE. Solo tiene sentido en la nube. Bloquea la fila del saldo, valida y
-- escribe el movimiento en una transacción. Reintentar con el mismo p_canje_id devuelve lo mismo.
CREATE OR REPLACE FUNCTION lealtad_canjear(
  p_canje_id uuid, p_tenant uuid, p_cliente_id uuid, p_telefono text,
  p_puntos integer, p_premio_id uuid, p_ticket_id uuid,
  p_sucursal_id uuid, p_caja_id uuid, p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_p       lealtad_programa%ROWTYPE;
  v_cli     uuid;
  v_m       lealtad_movimientos%ROWTYPE;
  v_premio  lealtad_premios%ROWTYPE;
  v_puntos  integer;
  v_monto   numeric(12,2);
  v_saldo   integer;
BEGIN
  IF p_canje_id IS NULL THEN RAISE EXCEPTION 'el canje necesita id' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF FOUND THEN
    RETURN lealtad_canje_datos(p_canje_id, p_tenant) || jsonb_build_object('repetido', true);
  END IF;

  IF NOT COALESCE((SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = p_tenant), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODULO_APAGADO');
  END IF;
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PROGRAMA'); END IF;

  v_cli := lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono);
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CLIENTE_NO_EXISTE'); END IF;

  IF v_p.mecanica = 'PUNTOS_DINERO' THEN
    IF p_premio_id IS NOT NULL OR COALESCE(p_puntos, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PUNTOS_INVALIDOS');
    END IF;
    v_puntos := p_puntos;
    v_monto  := p_puntos;                      -- 1 punto = $1
  ELSE
    SELECT * INTO v_premio FROM lealtad_premios
     WHERE id = p_premio_id AND tenant_id = p_tenant AND activo AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'PREMIO_INVALIDO'); END IF;
    v_puntos := v_premio.costo;
    v_monto  := NULL;                          -- lo fija el renglón al asentar
  END IF;

  -- La fila del saldo, bloqueada: dos canjes simultáneos del mismo cliente van en fila.
  INSERT INTO lealtad_saldos (cliente_id, tenant_id, saldo, programa_version)
  VALUES (v_cli, p_tenant, 0, v_p.version) ON CONFLICT (cliente_id) DO NOTHING;
  SELECT CASE WHEN programa_version = v_p.version THEN saldo ELSE 0 END INTO v_saldo
    FROM lealtad_saldos WHERE cliente_id = v_cli FOR UPDATE;

  IF v_saldo < v_puntos THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SALDO_INSUFICIENTE', 'saldo', v_saldo);
  END IF;

  PERFORM lealtad_registrar_movimiento(
    p_canje_id, p_tenant, v_cli, 'CANJE', -v_puntos, v_p.version,
    p_ticket_id, p_sucursal_id, p_caja_id, p_usuario_id, v_premio.id, v_monto);

  RETURN lealtad_canje_datos(p_canje_id, p_tenant) || jsonb_build_object('repetido', false);
END $$;

-- Los datos de un canje ya autorizado. Es lo que el puente de la caja consulta antes de asentar:
-- la caja asienta con lo que diga la nube, nunca con lo que mande el navegador.
CREATE OR REPLACE FUNCTION lealtad_canje_datos(p_canje_id uuid, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_m lealtad_movimientos%ROWTYPE;
  v_s lealtad_saldos%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CANJE_NO_EXISTE'); END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE canje_movimiento_id = p_canje_id AND tipo = 'REVERSA_CANJE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANJE_REVERTIDO');
  END IF;
  SELECT * INTO v_s FROM lealtad_saldos WHERE cliente_id = v_m.cliente_id;
  RETURN jsonb_build_object(
    'ok', true, 'canje_id', v_m.id, 'cliente_id', v_m.cliente_id, 'puntos', -v_m.puntos,
    'monto_mxn', v_m.monto_mxn, 'premio_id', v_m.premio_id,
    'producto_id', (SELECT producto_id FROM lealtad_premios WHERE id = v_m.premio_id),
    'saldo', COALESCE(v_s.saldo, 0), 'vence_el', v_s.vence_el, 'programa_version', v_m.programa_version);
END $$;

-- Pega un canje YA AUTORIZADO a un ticket, en la base donde vive el ticket (la caja o la nube).
-- En la caja además escribe la copia local del movimiento (mismo id) para que el saldo local baje;
-- en la nube ese id ya existe y el registro es un no-op.
-- Para un premio, ticket_item_id es obligatorio y el descuento es lo que valga ese renglón.
CREATE OR REPLACE FUNCTION lealtad_asentar_canje(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_canje  uuid := (p->>'canje_id')::uuid;
  v_tenant uuid := (p->>'tenant_id')::uuid;
  v_ticket uuid := (p->>'ticket_id')::uuid;
  v_item   uuid := NULLIF(p->>'ticket_item_id', '')::uuid;
  v_premio uuid := NULLIF(p->>'premio_id', '')::uuid;
  v_puntos integer := (p->>'puntos')::integer;
  v_monto  numeric(12,2) := NULLIF(p->>'monto_mxn', '')::numeric;
  v_t      tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = v_ticket AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;
  IF v_t.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN RAISE EXCEPTION 'TICKET_NO_ABIERTO' USING ERRCODE = '22023'; END IF;

  IF v_premio IS NOT NULL THEN
    IF v_item IS NULL THEN RAISE EXCEPTION 'PREMIO_SIN_RENGLON' USING ERRCODE = '22023'; END IF;
    SELECT GREATEST(subtotal_bruto_mxn + monto_modificadores_mxn - descuento_item_mxn - promocion_item_mxn, 0)
      INTO v_monto FROM ticket_items WHERE id = v_item AND ticket_id = v_ticket AND cancelado = false;
    IF v_monto IS NULL THEN RAISE EXCEPTION 'RENGLON_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;
  ELSIF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO' USING ERRCODE = '22023';
  END IF;

  PERFORM lealtad_registrar_movimiento(
    v_canje, v_tenant, (p->>'cliente_id')::uuid, 'CANJE', -v_puntos, (p->>'programa_version')::integer,
    v_ticket, COALESCE(NULLIF(p->>'sucursal_id', '')::uuid, v_t.sucursal_id),
    COALESCE(NULLIF(p->>'caja_id', '')::uuid, v_t.caja_id),
    NULLIF(p->>'usuario_id', '')::uuid, v_premio, v_monto);

  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, premio_id, ticket_item_id, puntos, monto_descontado_mxn, created_by)
  VALUES (v_canje, v_tenant, v_ticket, (p->>'cliente_id')::uuid, v_premio, v_item, v_puntos, v_monto, NULLIF(p->>'usuario_id', '')::uuid)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_canje;
END $$;

-- Deshace el canje vivo de un ticket, en la base donde vive el ticket. Solo devuelve saldo, así
-- que es seguro sin internet: en la caja la reversa sube en el siguiente push.
CREATE OR REPLACE FUNCTION lealtad_revertir_canje_ticket(p_ticket_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c     ticket_canjes_lealtad%ROWTYPE;
  v_ver integer;
  v_n   integer := 0;
BEGIN
  FOR c IN SELECT * FROM ticket_canjes_lealtad WHERE ticket_id = p_ticket_id AND NOT revertido FOR UPDATE LOOP
    UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = c.id;
    SELECT COALESCE((SELECT programa_version FROM lealtad_movimientos WHERE id = c.id),
                    (SELECT version FROM lealtad_programa WHERE tenant_id = c.tenant_id)) INTO v_ver;
    PERFORM lealtad_registrar_movimiento(
      NULL, c.tenant_id, c.cliente_id, 'REVERSA_CANJE', c.puntos, v_ver,
      p_ticket_id, p_motivo => p_motivo, p_canje_mov => c.id, p_usuario => auth.uid());
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- Deshace un canje por su id, sin necesitar el ticket. Es la que usa la red de seguridad de la
-- nube (§7). true si lo revirtió; false si ya estaba revertido o no existe.
CREATE OR REPLACE FUNCTION lealtad_revertir_canje(p_canje_id uuid, p_tenant uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_m lealtad_movimientos%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO v_m FROM lealtad_movimientos WHERE id = p_canje_id AND tenant_id = p_tenant AND tipo = 'CANJE';
  IF NOT FOUND THEN RETURN false; END IF;
  v_ok := lealtad_registrar_movimiento(
    NULL, p_tenant, v_m.cliente_id, 'REVERSA_CANJE', -v_m.puntos, v_m.programa_version,
    v_m.ticket_id, p_motivo => p_motivo, p_canje_mov => p_canje_id);
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = p_canje_id AND NOT revertido;
  RETURN v_ok;
END $$;

-- Lo único que el POS llama directo: quitar el canje de una cuenta que sigue abierta.
CREATE OR REPLACE FUNCTION quitar_canje_lealtad(p_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets
                  WHERE id = p_ticket_id AND tenant_id = current_tenant_id()
                    AND estado_fiscal IN ('BORRADOR', 'ABIERTO')) THEN
    RAISE EXCEPTION 'Esta cuenta ya se cobró o no existe.' USING ERRCODE = '22023';
  END IF;
  RETURN lealtad_revertir_canje_ticket(p_ticket_id, 'Canje quitado en caja');
END $$;

REVOKE ALL ON FUNCTION lealtad_resolver_cliente(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_saldo(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_canjear(uuid, uuid, uuid, text, integer, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_canje_datos(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_asentar_canje(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_revertir_canje_ticket(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lealtad_revertir_canje(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quitar_canje_lealtad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_resolver_cliente(uuid, uuid, text), lealtad_saldo(uuid, uuid, text),
  lealtad_canjear(uuid, uuid, uuid, text, integer, uuid, uuid, uuid, uuid, uuid), lealtad_canje_datos(uuid, uuid),
  lealtad_asentar_canje(jsonb), lealtad_revertir_canje_ticket(uuid, text), lealtad_revertir_canje(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION quitar_canje_lealtad(uuid) TO authenticated, service_role;
```

`lealtad_canjear` llama a `lealtad_canje_datos`, que en el archivo queda definida después. En plpgsql eso se resuelve al ejecutar, no al crear: el orden de arriba es válido.

- [ ] **Step 4: Ampliar el trigger de tickets para revertir el canje al cancelar**

En §4 de la misma migración, dentro de `trg_ticket_lealtad()`, añade este bloque justo antes del `RETURN NEW;`:

```sql
  -- Cancelar una cuenta con un canje vivo lo devuelve. Reabrirla no: el canje sigue en la cuenta.
  IF NEW.estado_fiscal = 'CANCELADO' AND OLD.estado_fiscal <> 'CANCELADO' THEN
    PERFORM lealtad_revertir_canje_ticket(NEW.id, 'Cuenta cancelada');
  END IF;
```

- [ ] **Step 5: Registrar en la guardia**

En `supabase/tests/0003_grants_secdef.test.sql`, añade a `_secdef_solo_service`:

```sql
  ('lealtad_saldo',                 'lee el saldo de cualquier cliente de cualquier negocio (0156)'),
  ('lealtad_canjear',               'descuenta saldo de lealtad; solo la Edge Function lealtad-canje (0156)'),
  ('lealtad_canje_datos',           'lee un canje de cualquier negocio (0156)'),
  ('lealtad_asentar_canje',         'pega un descuento a un ticket; solo el puente o la Edge Function (0156)'),
  ('lealtad_revertir_canje_ticket', 'devuelve saldo; el POS usa quitar_canje_lealtad (0156)'),
  ('lealtad_revertir_canje',        'devuelve saldo sin ticket; solo la red de seguridad (0156)'),
  ('lealtad_resolver_cliente',      'busca clientes por teléfono sin RLS (0156)'),
```

- [ ] **Step 6: Correr las pruebas**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_canje.sql smoke_lealtad_ganar.sql smoke_lealtad_totales.sql`
Expected: los tres OK.

Run: `supabase db reset && supabase test db`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/tests/0003_grants_secdef.test.sql supabase/scripts/smoke_lealtad_canje.sql
git commit -m "feat(lealtad): canje autorizado por la nube, asentado y reversa (0156 §6)"
```

---

### Task 5: Programa, ajuste manual, vencimiento y red de seguridad

**Files:**
- Modify: `supabase/migrations/0156_lealtad.sql` (añadir §7)
- Modify: `supabase/tests/0003_grants_secdef.test.sql`
- Create: `supabase/scripts/smoke_lealtad_programa.sql`

**Interfaces:**
- Consumes: `lealtad_registrar_movimiento`, `lealtad_revertir_canje`, `lealtad_vence_el`.
- Produces:
  - `lealtad_guardar_programa(p_mecanica lealtad_mecanica, p_porcentaje numeric, p_pesos_por_punto numeric, p_compra_minima_mxn numeric, p_vencimiento_meses integer, p_tope_compras_dia integer, p_confirmar_reinicio boolean DEFAULT false) RETURNS jsonb` → `{ok:true, version, clientes_reiniciados}` o `{ok:false, error:'REQUIERE_CONFIRMAR_REINICIO', clientes_con_saldo}`. Para `authenticated` (dueño o admin). La usa el admin (plan 1C).
  - `lealtad_ajustar_saldo(p_cliente_id uuid, p_puntos integer, p_motivo text) RETURNS integer` — saldo nuevo. Para `authenticated` (dueño o admin).
  - `lealtad_proceso_diario(p_ahora timestamptz DEFAULT now()) RETURNS jsonb` → `{vencidos, canjes_revertidos}`. Solo `service_role`. Job `lealtad-diario` de pg_cron.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_lealtad_programa.sql`:

```sql
-- Smoke lealtad · programa (0156 §7). Cambiar de mecánica reinicia saldos solo con confirmación;
-- el ajuste manual exige motivo; los saldos vencen en hora de México; nada vence con el módulo
-- apagado; un canje sin ticket pagado a las 48 h se devuelve. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_cli uuid; v_cli2 uuid; v_ver integer; j jsonb; v_canje uuid := gen_random_uuid();
  -- Una hora fija: 31 de marzo de 2027, 23:30 en México (ya es 1 de abril en UTC).
  v_ahora timestamptz := timestamptz '2027-04-01 05:30:00+00';
BEGIN
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Programa', '4770001564') RETURNING id INTO v_cli;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Beto Programa', '4770001565') RETURNING id INTO v_cli2;

  -- Como el dueño (las RPC del admin leen current_tenant_id() y auth.uid()).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);

  -- 1) Alta del programa.
  j := lealtad_guardar_programa('PUNTOS_DINERO', 5, NULL, 0, 6, 3);
  IF NOT (j->>'ok')::boolean OR (j->>'version')::int <> 1 THEN RAISE EXCEPTION 'alta: %', j; END IF;
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;

  -- 2) Ajuste manual: exige motivo y deja rastro con el usuario.
  BEGIN
    PERFORM lealtad_ajustar_saldo(v_cli, 50, '  ');
    RAISE EXCEPTION 'aceptó un ajuste sin motivo';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  IF lealtad_ajustar_saldo(v_cli, 50, 'Compensación por un error') <> 50 THEN RAISE EXCEPTION 'ajuste no dejó 50'; END IF;
  IF (SELECT usuario_id FROM lealtad_movimientos WHERE cliente_id = v_cli AND tipo = 'AJUSTE') <> v_dueno THEN RAISE EXCEPTION 'el ajuste no quedó firmado'; END IF;
  PERFORM lealtad_ajustar_saldo(v_cli2, 20, 'Bienvenida');

  -- 3) Cambiar parámetros sin cambiar de mecánica no reinicia nada.
  j := lealtad_guardar_programa('PUNTOS_DINERO', 8, NULL, 50, 6, 3);
  IF (j->>'version')::int <> 1 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 50 THEN RAISE EXCEPTION 'un cambio de parámetros tocó los saldos: %', j; END IF;

  -- 4) Cambiar de mecánica sin confirmar: se niega y dice a cuántos afecta.
  j := lealtad_guardar_programa('SELLOS', NULL, NULL, 0, 6, 3);
  IF (j->>'ok')::boolean OR j->>'error' <> 'REQUIERE_CONFIRMAR_REINICIO' OR (j->>'clientes_con_saldo')::int <> 2 THEN RAISE EXCEPTION 'debió pedir confirmación: %', j; END IF;
  IF (SELECT mecanica FROM lealtad_programa WHERE tenant_id = v_tenant) <> 'PUNTOS_DINERO' THEN RAISE EXCEPTION 'cambió sin confirmar'; END IF;

  -- 5) Confirmando: saldos en cero, versión nueva, y el libro lo explica.
  j := lealtad_guardar_programa('SELLOS', NULL, NULL, 0, 6, 3, true);
  IF NOT (j->>'ok')::boolean OR (j->>'version')::int <> 2 OR (j->>'clientes_reiniciados')::int <> 2 THEN RAISE EXCEPTION 'reinicio: %', j; END IF;
  IF (SELECT SUM(saldo) FROM lealtad_saldos WHERE tenant_id = v_tenant) <> 0 THEN RAISE EXCEPTION 'quedaron saldos vivos'; END IF;
  IF (SELECT count(*) FROM lealtad_movimientos WHERE tenant_id = v_tenant AND tipo = 'AJUSTE' AND motivo LIKE 'Cambio de mecánica%') <> 2 THEN RAISE EXCEPTION 'el reinicio no quedó en el libro'; END IF;

  -- 6) Un movimiento que llega de la versión anterior se registra y no suma.
  -- De aquí en adelante, sin sesión de usuario (como el proceso de la nube).
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli, 'GANADO', 30, 1);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 0 THEN RAISE EXCEPTION 'un movimiento de versión vieja sumó'; END IF;

  -- 7) Vencimiento en hora de México. Ana: actividad hace 6 meses y un día; Beto: hace 5 meses.
  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = v_tenant;
  UPDATE lealtad_programa SET encendido_desde = NULL WHERE tenant_id = v_tenant;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli,  'GANADO', 4, v_ver, p_fecha => timestamptz '2026-09-30 18:00:00+00');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli2, 'GANADO', 3, v_ver, p_fecha => timestamptz '2026-11-01 18:00:00+00');
  IF (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_cli) <> date '2027-03-30' THEN RAISE EXCEPTION 'vence_el mal calculado: %', (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_cli); END IF;

  -- 7a) Con el módulo apagado nada vence.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  j := lealtad_proceso_diario(v_ahora);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 4 THEN RAISE EXCEPTION 'venció con el módulo apagado'; END IF;

  -- 7b) Encendido (sin mover encendido_desde, que es lo que se prueba aparte): vence Ana, no Beto.
  SET LOCAL session_replication_role = replica;
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;
  SET LOCAL session_replication_role = origin;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'vencidos')::int <> 1 THEN RAISE EXCEPTION 'vencidos: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 0 THEN RAISE EXCEPTION 'Ana no venció'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> 3 THEN RAISE EXCEPTION 'Beto venció antes de tiempo'; END IF;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'vencidos')::int <> 0 THEN RAISE EXCEPTION 'venció dos veces'; END IF;

  -- 8) Red de seguridad: un canje de hace 49 h sin ticket pagado se devuelve; uno de 47 h, no.
  PERFORM lealtad_registrar_movimiento(v_canje, v_tenant, v_cli2, 'CANJE', -2, v_ver, p_fecha => v_ahora - interval '49 hours');
  PERFORM lealtad_registrar_movimiento(NULL,    v_tenant, v_cli2, 'CANJE', -1, v_ver, p_fecha => v_ahora - interval '47 hours');
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'canjes_revertidos')::int <> 1 THEN RAISE EXCEPTION 'canjes revertidos: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> 2 THEN RAISE EXCEPTION 'saldo de Beto tras la red: %', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2); END IF;

  RAISE NOTICE 'SMOKE LEALTAD PROGRAMA OK';
END $$;
ROLLBACK;
```

Nota para el ejecutor: el paso 7b usa `session_replication_role`, que en el CI no está permitido en un smoke (los smokes no corren como superusuario). Si el CI lo rechaza, sustituye esas tres líneas por un `UPDATE configuracion_tenant SET modulo_lealtad_activo = true …` normal seguido de `UPDATE lealtad_programa SET encendido_desde = NULL …` y `UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(tenant_id, ultima_actividad) WHERE tenant_id = v_tenant;`.

- [ ] **Step 2: Correrlo y verlo fallar**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_programa.sql`
Expected: FAIL con `function lealtad_guardar_programa(...) does not exist`.

- [ ] **Step 3: Escribir §7**

```sql
-- ── §7 Programa, ajuste manual, vencimiento y red de seguridad ──────────────

-- Alta o edición del programa. Cambiar de mecánica pone TODOS los saldos en cero (no son
-- convertibles) y por eso exige p_confirmar_reinicio; sin él, devuelve a cuántos clientes afecta.
CREATE OR REPLACE FUNCTION lealtad_guardar_programa(
  p_mecanica lealtad_mecanica, p_porcentaje numeric, p_pesos_por_punto numeric,
  p_compra_minima_mxn numeric, p_vencimiento_meses integer, p_tope_compras_dia integer,
  p_confirmar_reinicio boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_p      lealtad_programa%ROWTYPE;
  v_con    integer := 0;
  s        lealtad_saldos%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede configurar la lealtad.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, pesos_por_punto, compra_minima_mxn, vencimiento_meses, tope_compras_dia)
    VALUES (v_tenant, p_mecanica, p_porcentaje, p_pesos_por_punto, COALESCE(p_compra_minima_mxn, 0), p_vencimiento_meses, COALESCE(p_tope_compras_dia, 3));
    RETURN jsonb_build_object('ok', true, 'version', 1, 'clientes_reiniciados', 0);
  END IF;

  IF v_p.mecanica <> p_mecanica THEN
    SELECT count(*) INTO v_con FROM lealtad_saldos
     WHERE tenant_id = v_tenant AND saldo <> 0 AND programa_version = v_p.version;
    IF v_con > 0 AND NOT COALESCE(p_confirmar_reinicio, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REQUIERE_CONFIRMAR_REINICIO', 'clientes_con_saldo', v_con);
    END IF;
    -- Primero se anula cada saldo CON LA VERSIÓN VIEJA (para que el movimiento sume), después se
    -- sube la versión.
    FOR s IN SELECT * FROM lealtad_saldos
              WHERE tenant_id = v_tenant AND saldo <> 0 AND programa_version = v_p.version LOOP
      PERFORM lealtad_registrar_movimiento(
        NULL, v_tenant, s.cliente_id, 'AJUSTE', -s.saldo, v_p.version,
        p_motivo => 'Cambio de mecánica: ' || v_p.mecanica || ' → ' || p_mecanica, p_usuario => auth.uid());
    END LOOP;
    v_p.version := v_p.version + 1;
    UPDATE lealtad_saldos SET saldo = 0, programa_version = v_p.version, vence_el = NULL, updated_at = now()
     WHERE tenant_id = v_tenant;
  END IF;

  UPDATE lealtad_programa
     SET mecanica = p_mecanica, version = v_p.version, porcentaje = p_porcentaje, pesos_por_punto = p_pesos_por_punto,
         compra_minima_mxn = COALESCE(p_compra_minima_mxn, 0), vencimiento_meses = p_vencimiento_meses,
         tope_compras_dia = COALESCE(p_tope_compras_dia, 3)
   WHERE tenant_id = v_tenant;

  -- Cambiar los meses de vencimiento mueve la fecha de todos.
  UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(v_tenant, ultima_actividad), updated_at = now()
   WHERE tenant_id = v_tenant AND vence_el IS DISTINCT FROM lealtad_vence_el(v_tenant, ultima_actividad);

  RETURN jsonb_build_object('ok', true, 'version', v_p.version, 'clientes_reiniciados', v_con);
END $$;
REVOKE ALL ON FUNCTION lealtad_guardar_programa(lealtad_mecanica, numeric, numeric, numeric, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_guardar_programa(lealtad_mecanica, numeric, numeric, numeric, integer, integer, boolean) TO authenticated, service_role;

-- Ajuste manual del dueño o admin. Motivo obligatorio; queda en el libro con quien lo hizo.
-- Devuelve el saldo nuevo.
CREATE OR REPLACE FUNCTION lealtad_ajustar_saldo(p_cliente_id uuid, p_puntos integer, p_motivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_ver    integer;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede ajustar un saldo.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_puntos, 0) = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero.' USING ERRCODE = '22023'; END IF;
  IF btrim(COALESCE(p_motivo, '')) = '' THEN RAISE EXCEPTION 'El ajuste necesita un motivo.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'El cliente no existe.' USING ERRCODE = 'P0002';
  END IF;
  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = v_tenant;
  IF v_ver IS NULL THEN RAISE EXCEPTION 'Primero configura el programa.' USING ERRCODE = '22023'; END IF;

  PERFORM lealtad_registrar_movimiento(
    NULL, v_tenant, p_cliente_id, 'AJUSTE', p_puntos, v_ver,
    p_motivo => btrim(p_motivo), p_usuario => auth.uid());
  RETURN (SELECT saldo FROM lealtad_saldos WHERE cliente_id = p_cliente_id);
END $$;
REVOKE ALL ON FUNCTION lealtad_ajustar_saldo(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_ajustar_saldo(uuid, integer, text) TO authenticated, service_role;

-- El proceso diario de la nube. Dos trabajos:
--   1) Vencer los saldos cuya fecha ya pasó, en hora de México. Solo en negocios con el módulo
--      encendido: mientras está apagado nada vence (spec §5, regla 9).
--   2) Red de seguridad del canje (spec §6): un canje de hace más de 48 h que no cuelga de un
--      ticket pagado se devuelve. Cubre la llamada que la caja nunca supo que se completó.
-- p_ahora existe para poder probarlo sin depender del reloj.
CREATE OR REPLACE FUNCTION lealtad_proceso_diario(p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy  date := (p_ahora AT TIME ZONE 'America/Mexico_City')::date;
  s      record;
  m      record;
  v_venc integer := 0;
  v_rev  integer := 0;
BEGIN
  FOR s IN
    SELECT sa.cliente_id, sa.tenant_id, sa.saldo, sa.programa_version
      FROM lealtad_saldos sa
      JOIN lealtad_programa p ON p.tenant_id = sa.tenant_id AND p.version = sa.programa_version
      JOIN configuracion_tenant c ON c.tenant_id = sa.tenant_id AND c.modulo_lealtad_activo
     WHERE sa.saldo > 0 AND sa.vence_el IS NOT NULL AND sa.vence_el < v_hoy
  LOOP
    PERFORM lealtad_registrar_movimiento(
      NULL, s.tenant_id, s.cliente_id, 'VENCIMIENTO', -s.saldo, s.programa_version,
      p_motivo => 'Venció por inactividad', p_fecha => p_ahora);
    v_venc := v_venc + 1;
  END LOOP;

  FOR m IN
    SELECT c.id, c.tenant_id
      FROM lealtad_movimientos c
     WHERE c.tipo = 'CANJE' AND c.fecha < p_ahora - interval '48 hours'
       AND NOT EXISTS (SELECT 1 FROM lealtad_movimientos r
                        WHERE r.canje_movimiento_id = c.id AND r.tipo = 'REVERSA_CANJE')
       AND NOT EXISTS (SELECT 1 FROM ticket_canjes_lealtad tc
                         JOIN tickets t ON t.id = tc.ticket_id
                        WHERE tc.id = c.id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO'))
  LOOP
    IF lealtad_revertir_canje(m.id, m.tenant_id, 'El canje no llegó a una cuenta pagada en 48 horas') THEN
      v_rev := v_rev + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('vencidos', v_venc, 'canjes_revertidos', v_rev);
END $$;
REVOKE ALL ON FUNCTION lealtad_proceso_diario(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_proceso_diario(timestamptz) TO service_role;

-- Solo en la nube: el Postgres de la caja no tiene pg_cron y este bloque no hace nada ahí.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lealtad-diario') THEN
      PERFORM cron.unschedule('lealtad-diario');
    END IF;
    -- 09:20 UTC = 03:20 hora del centro de México: fuera de servicio y ya dentro del día nuevo.
    PERFORM cron.schedule('lealtad-diario', '20 9 * * *', 'SELECT public.lealtad_proceso_diario()');
  END IF;
END $$;
```

- [ ] **Step 4: Registrar en la guardia**

En `supabase/tests/0003_grants_secdef.test.sql`, añade a `_secdef_solo_service`:

```sql
  ('lealtad_proceso_diario',        'vence saldos y revierte canjes de todos los negocios (0156)'),
```

- [ ] **Step 5: Correr las pruebas**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_lealtad_programa.sql`
Expected: `SMOKE LEALTAD PROGRAMA OK`.

Run: `supabase db reset && supabase test db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/tests/0003_grants_secdef.test.sql supabase/scripts/smoke_lealtad_programa.sql
git commit -m "feat(lealtad): programa, ajuste manual, vencimiento y red de seguridad del canje (0156 §7)"
```

---

### Task 6: Sincronización del lado de la nube

**Files:**
- Modify: `supabase/migrations/0156_lealtad.sql` (añadir §8)
- Create: `supabase/scripts/smoke_sync_lealtad.sql`

**Interfaces:**
- Consumes: `lealtad_registrar_movimiento`, `clientes_alias`.
- Produces:
  - `_vim_fusionar_clientes(p_snapshot jsonb, p_tenant uuid) RETURNS jsonb` — devuelve el snapshot reescrito.
  - `_vim_aplicar_movimientos_lealtad(p_rows jsonb, p_tenant uuid) RETURNS jsonb` → `{aplicadas, errores}`
  - `_vim_compat_0156(p_snapshot jsonb, p_tenant uuid) RETURNS jsonb` — rellena lo que una caja sin actualizar no manda.
  - `sync_push_snapshot` acepta las claves `lealtad_movimientos` y `ticket_canjes_lealtad`.
  - `sync_pull_snapshot` devuelve además `clientes`, `lealtad_programa`, `lealtad_premios`, `lealtad_saldos`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_sync_lealtad.sql`:

```sql
-- Smoke sync de lealtad (0156 §8). Lo ganado en una caja sube y suma una sola vez; un cliente
-- registrado en dos cajas con el mismo teléfono se funde en uno y lo suyo se redirige; la caja no
-- puede inventar un canje; el pull baja clientes, programa, premios y saldos. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_real uuid; v_dup uuid := gen_random_uuid();
  v_mov uuid := gen_random_uuid(); v_mov2 uuid := gen_random_uuid(); v_falso uuid := gen_random_uuid();
  v_snap jsonb; v_res jsonb; v_pull jsonb;
BEGIN
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_t, 'PUNTOS_DINERO', 10);
  -- La nube ya conoce a Ana (se registró en la sucursal A).
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Ana Nube', '4770001566') RETURNING id INTO v_real;

  -- 1) La sucursal B la registró otra vez, con otro id, y le dio 12 puntos.
  v_snap := jsonb_build_object(
    'clientes', jsonb_build_array(jsonb_build_object(
      'id', v_dup, 'tenant_id', v_t, 'nombre', 'Ana Caja B', 'telefono', '4770001566',
      'tipo_fiscal', 'EVENTUAL', 'estado', 'ACTIVO', 'created_at', now(), 'updated_at', now())),
    'lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_mov, 'tenant_id', v_t, 'cliente_id', v_dup, 'tipo', 'GANADO', 'puntos', 12,
      'programa_version', 1, 'sucursal_id', v_suc, 'fecha', now(), 'saldo_visto', 12)));
  v_res := sync_push_snapshot(v_t, v_snap);
  RAISE NOTICE 'push 1: %', v_res;
  IF v_res ? '_ignoradas' THEN RAISE EXCEPTION 'la RPC ignoró tablas: %', v_res->'_ignoradas'; END IF;
  IF v_res ? '_errores' THEN RAISE EXCEPTION 'la RPC rechazó filas: %', v_res->'_errores'; END IF;
  IF (SELECT count(*) FROM clientes WHERE tenant_id = v_t AND telefono = '4770001566' AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'quedaron dos clientes con el mismo teléfono'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_dup AND cliente_id = v_real) THEN RAISE EXCEPTION 'no se anotó el alias'; END IF;
  IF (SELECT cliente_id FROM lealtad_movimientos WHERE id = v_mov) <> v_real THEN RAISE EXCEPTION 'el movimiento no se redirigió al cliente real'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 12 THEN RAISE EXCEPTION 'el saldo no sumó'; END IF;
  IF (SELECT saldo_visto FROM lealtad_movimientos WHERE id = v_mov) <> 12 THEN RAISE EXCEPTION 'saldo_visto debe conservar lo que vio la caja'; END IF;

  -- 2) Reenviar el mismo snapshot no suma dos veces.
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 12 THEN RAISE EXCEPTION 'el reenvío sumó dos veces'; END IF;
  IF v_res ? '_errores' THEN RAISE EXCEPTION 'el reenvío dio errores: %', v_res->'_errores'; END IF;

  -- 3) Un push posterior que todavía usa el id viejo (la caja no ha hecho pull) también se redirige.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_mov2, 'tenant_id', v_t, 'cliente_id', v_dup, 'tipo', 'GANADO', 'puntos', 5,
      'programa_version', 1, 'sucursal_id', v_suc, 'fecha', now())));
  PERFORM sync_push_snapshot(v_t, v_snap);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'el segundo movimiento no llegó al cliente real'; END IF;

  -- 4) La caja no puede inventar un canje: un CANJE que la nube no autorizó se rechaza.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_falso, 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'CANJE', 'puntos', -17,
      'programa_version', 1, 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF NOT (v_res ? '_errores') THEN RAISE EXCEPTION 'aceptó un canje inventado'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'el canje inventado movió el saldo'; END IF;

  -- 5) Ni un ajuste: eso solo lo hace el admin en la nube.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'AJUSTE', 'puntos', 500,
      'programa_version', 1, 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF NOT (v_res ? '_errores') OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'aceptó un ajuste desde la caja'; END IF;

  -- 6) El pull baja lo que la caja necesita.
  v_pull := sync_pull_snapshot(v_t);
  IF NOT (v_pull ? 'clientes' AND v_pull ? 'lealtad_programa' AND v_pull ? 'lealtad_premios' AND v_pull ? 'lealtad_saldos') THEN
    RAISE EXCEPTION 'al pull le faltan claves de lealtad';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'clientes') c WHERE (c->>'id')::uuid = v_real) THEN RAISE EXCEPTION 'el cliente no baja'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'clientes') c WHERE (c->>'id')::uuid = v_dup) THEN RAISE EXCEPTION 'el duplicado no debe existir'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'lealtad_saldos') s WHERE (s->>'cliente_id')::uuid = v_real AND (s->>'saldo')::int = 17) THEN RAISE EXCEPTION 'el saldo no baja'; END IF;

  -- 7) UNA CAJA SIN ACTUALIZAR no manda las columnas nuevas. Sin relleno, su ticket y su cliente
  --    se rechazarían por NOT NULL y esa caja dejaría de subir ventas.
  v_snap := _vim_compat_0156(jsonb_build_object(
    'tickets',  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t)),
    'clientes', jsonb_build_array(
      jsonb_build_object('id', v_real, 'tenant_id', v_t, 'nombre', 'Ana editada en caja vieja'),
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'nombre', 'Nuevo de caja vieja'))), v_t);
  IF (v_snap->'tickets'->0->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'el ticket de una caja vieja no recibió lealtad_mxn'; END IF;
  IF v_snap->'clientes'->0->>'codigo_publico' IS DISTINCT FROM (SELECT codigo_publico FROM clientes WHERE id = v_real) THEN
    RAISE EXCEPTION 'una caja vieja le cambiaría el código público a un cliente que ya lo tiene';
  END IF;
  IF length(v_snap->'clientes'->1->>'codigo_publico') <> 64 THEN RAISE EXCEPTION 'el cliente nuevo de una caja vieja quedó sin código'; END IF;
  -- Y una caja ya actualizada conserva lo que manda.
  v_snap := _vim_compat_0156(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'lealtad_mxn', 40))), v_t);
  IF (v_snap->'tickets'->0->>'lealtad_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'el relleno pisó un valor real'; END IF;

  RAISE NOTICE 'SMOKE SYNC LEALTAD OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_sync_lealtad.sql`
Expected: FAIL con `la RPC ignoró tablas: ["lealtad_movimientos"]` o con el rechazo por `idx_clientes_telefono_unico`.

- [ ] **Step 3: Escribir §8 — funciones nuevas**

```sql
-- ── §8 Sincronización ───────────────────────────────────────────────────────

-- EL TELÉFONO ES LA IDENTIDAD Y LA NUBE DECIDE (spec §8.4).
--
-- Dos cajas pueden registrar el mismo teléfono antes de sincronizar. Hasta la 0156 el segundo
-- chocaba contra idx_clientes_telefono_unico, caía en _errores y se reintentaba en cada ciclo para
-- siempre, ocupando cupo del techo de 500; sus tickets entraban apuntando a un cliente que la nube
-- no tenía. Ahora: se anota como alias del existente, se quita del lote (no es un error: la caja lo
-- da por subido) y se redirige al cliente real todo lo que venga con el id viejo, en este push y en
-- los siguientes hasta que la caja haga pull.
CREATE OR REPLACE FUNCTION _vim_fusionar_clientes(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clave text;
  v_filas jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot->'clientes') = 'array' THEN
    INSERT INTO clientes_alias (alias_id, cliente_id, tenant_id)
    SELECT (r->>'id')::uuid, c.id, p_tenant
      FROM jsonb_array_elements(p_snapshot->'clientes') r
      JOIN clientes c
        ON c.tenant_id = p_tenant AND c.deleted_at IS NULL
       AND c.telefono = NULLIF(r->>'telefono', '')
       AND c.id <> (r->>'id')::uuid
     WHERE (r->>'tenant_id')::uuid = p_tenant
       AND NULLIF(r->>'deleted_at', '') IS NULL
    ON CONFLICT (alias_id) DO NOTHING;

    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_filas
      FROM jsonb_array_elements(p_snapshot->'clientes') r
     WHERE NOT EXISTS (SELECT 1 FROM clientes_alias a
                        WHERE a.alias_id = (r->>'id')::uuid AND a.tenant_id = p_tenant);
    p_snapshot := jsonb_set(p_snapshot, '{clientes}', v_filas);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE tenant_id = p_tenant) THEN
    RETURN p_snapshot;
  END IF;

  FOREACH v_clave IN ARRAY ARRAY['tickets', 'direcciones_cliente', 'lealtad_movimientos',
                                 'ticket_canjes_lealtad', 'ticket_promociones_aplicadas'] LOOP
    CONTINUE WHEN jsonb_typeof(p_snapshot->v_clave) <> 'array';
    SELECT COALESCE(jsonb_agg(
             CASE WHEN a.cliente_id IS NOT NULL
                  THEN r || jsonb_build_object('cliente_id', a.cliente_id)
                  ELSE r END), '[]'::jsonb)
      INTO v_filas
      FROM jsonb_array_elements(p_snapshot->v_clave) r
      LEFT JOIN clientes_alias a
        ON a.tenant_id = p_tenant AND a.alias_id = NULLIF(r->>'cliente_id', '')::uuid;
    p_snapshot := jsonb_set(p_snapshot, ARRAY[v_clave], v_filas);
  END LOOP;
  RETURN p_snapshot;
END $$;
REVOKE ALL ON FUNCTION _vim_fusionar_clientes(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- CAJAS SIN ACTUALIZAR. _vim_apply_rows_detalle (0131) inserta TODAS las columnas del destino y
-- deja en NULL las que el JSON no trae. tickets.lealtad_mxn y clientes.codigo_publico son NOT NULL:
-- sin este relleno, en cuanto la 0156 esté en producción cada venta y cada cliente que suba una
-- caja que aún no se actualizó se rechazaría, y esa caja dejaría de subir. Un cliente que ya existe
-- conserva su código (el upsert pisa todas las columnas).
CREATE OR REPLACE FUNCTION _vim_compat_0156(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_filas jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
             CASE WHEN r->>'lealtad_mxn' IS NOT NULL THEN r
                  ELSE r || jsonb_build_object('lealtad_mxn', 0) END), '[]'::jsonb)
      INTO v_filas FROM jsonb_array_elements(p_snapshot->'tickets') r;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', v_filas);
  END IF;

  IF jsonb_typeof(p_snapshot->'clientes') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
             CASE WHEN r->>'codigo_publico' IS NOT NULL THEN r
                  ELSE r || jsonb_build_object('codigo_publico', COALESCE(
                         (SELECT c.codigo_publico FROM clientes c
                           WHERE c.id = NULLIF(r->>'id', '')::uuid AND c.tenant_id = p_tenant),
                         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')))
             END), '[]'::jsonb)
      INTO v_filas FROM jsonb_array_elements(p_snapshot->'clientes') r;
    p_snapshot := jsonb_set(p_snapshot, '{clientes}', v_filas);
  END IF;
  RETURN p_snapshot;
END $$;
REVOKE ALL ON FUNCTION _vim_compat_0156(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- Aplica los movimientos de lealtad que sube una caja. Uno por uno y aislados: un movimiento malo
-- no retiene a los demás. Idempotente por id. La caja solo puede subir lo que ella origina:
--   GANADO, REVERSA_GANADO, REVERSA_CANJE.
-- Un CANJE solo pasa si la nube ya lo tiene (es la copia local de uno que ella autorizó); uno que
-- no conoce se rechaza. AJUSTE y VENCIMIENTO no suben nunca.
CREATE OR REPLACE FUNCTION _vim_aplicar_movimientos_lealtad(p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila    jsonb;
  v_tipo    lealtad_movimiento_tipo;
  v_n       integer := 0;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', v_errores);
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'fecha' LOOP
    BEGIN
      IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'movimiento de otro negocio';
      END IF;
      v_tipo := (v_fila->>'tipo')::lealtad_movimiento_tipo;

      IF v_tipo = 'CANJE' THEN
        IF NOT EXISTS (SELECT 1 FROM lealtad_movimientos
                        WHERE id = (v_fila->>'id')::uuid AND tenant_id = p_tenant AND tipo = 'CANJE') THEN
          RAISE EXCEPTION 'canje que la nube no autorizó';
        END IF;
        CONTINUE;
      END IF;
      IF v_tipo NOT IN ('GANADO', 'REVERSA_GANADO', 'REVERSA_CANJE') THEN
        RAISE EXCEPTION 'un movimiento % no puede subir desde una caja', v_tipo;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = (v_fila->>'cliente_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'el cliente todavía no existe en la nube';
      END IF;

      IF lealtad_registrar_movimiento(
           (v_fila->>'id')::uuid, p_tenant, (v_fila->>'cliente_id')::uuid, v_tipo,
           (v_fila->>'puntos')::integer, (v_fila->>'programa_version')::integer,
           NULLIF(v_fila->>'ticket_id', '')::uuid, NULLIF(v_fila->>'sucursal_id', '')::uuid,
           NULLIF(v_fila->>'caja_id', '')::uuid, NULLIF(v_fila->>'usuario_id', '')::uuid,
           NULLIF(v_fila->>'premio_id', '')::uuid, NULLIF(v_fila->>'monto_mxn', '')::numeric,
           v_fila->>'motivo', NULLIF(v_fila->>'canje_movimiento_id', '')::uuid,
           COALESCE(NULLIF(v_fila->>'fecha', '')::timestamptz, now()),
           NULLIF(v_fila->>'saldo_visto', '')::integer) THEN
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object(
        'tabla', 'lealtad_movimientos', 'id', v_fila->>'id', 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores);
END $$;
REVOKE ALL ON FUNCTION _vim_aplicar_movimientos_lealtad(jsonb, uuid) FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 4: Escribir §8 — `sync_push_snapshot`**

Copia íntegra `sync_push_snapshot` de `supabase/migrations/0126_registro_impresiones.sql:132-279` (con sus `REVOKE`/`GRANT`) y aplica exactamente estos cuatro cambios:

1. En `v_tablas`, la línea de los descuentos queda con el canje al final:

```sql
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
```

2. Justo después del `BEGIN` y antes del bloque de "La guarda del FACTURADO":

```sql
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);
```

3. Justo después del bloque de inventario (el que termina en `v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);` tras `_vim_aplicar_movimientos`) y antes de `-- ── Rastro del envío`:

```sql
  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
```

4. En el cálculo de `v_ignoradas`, la lista de claves conocidas:

```sql
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos']));
```

- [ ] **Step 5: Escribir §8 — `sync_pull_snapshot`**

Copia íntegra `sync_pull_snapshot` de `supabase/migrations/0152_menu_por_sucursal.sql:681-744` (con sus `REVOKE`/`GRANT`). Un solo cambio: después de la línea de `'anuncios_pantalla'` y antes del comentario de inventario, añade:

```sql
    -- Lealtad (0156, ADR 0030). Los clientes bajan por primera vez: sin esto el cliente de una
    -- sucursal no existe en la otra. Los saldos bajan solo para mostrarse; la caja les suma lo que
    -- aún no subió. Los movimientos NO bajan.
    'clientes',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_programa',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_programa x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_premios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_premios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_saldos',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_saldos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
```

`catalogo_version()` **no** se toca: si los clientes o los saldos movieran la versión del catálogo, cada venta con cliente dispararía un pull completo en todas las cajas del negocio al minuto. Programa y premios llegan con el pull de cada hora y con el botón de sincronizar.

- [ ] **Step 6: Correr las pruebas**

Run (desde `desktop/`): `node scripts/smokes.mjs smoke_sync_lealtad.sql smoke_sync_push_clientes.sql smoke_sync_push_completo.sql smoke_sync_inventario.sql`
Expected: los cuatro OK. Los tres viejos prueban que el push y el pull de siempre no cambiaron.

Run: `supabase db reset && supabase test db`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0156_lealtad.sql supabase/scripts/smoke_sync_lealtad.sql
git commit -m "feat(lealtad): push de movimientos, fusión de clientes por teléfono y pull (0156 §8)"
```

---

### Task 7: El escritorio sube movimientos y canjes

**Files:**
- Modify: `desktop/src/sync-push.mjs`
- Modify: `desktop/src/sync-push.test.mjs`

**Interfaces:**
- Consumes: tablas locales `lealtad_movimientos`, `ticket_canjes_lealtad`; claves que acepta `sync_push_snapshot` (Task 6).
- Produces:
  - Libreta `_vim_lealtad_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz)`.
  - `export const HUELLA_FILA` (hoy es una constante privada; la Task 8 la importa).
  - `export async function marcarLealtadSubidos(pool, ids)`.
  - `listarPendientes()` devuelve además `lealtadIds: string[]`.
  - `construirSnapshotPush(pool, { …, lealtadIds })` devuelve además `lealtad: string[]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `desktop/src/sync-push.test.mjs` (y añade `marcarLealtadSubidos, HUELLA_FILA` al `import` de `./sync-push.mjs` que ya existe arriba):

```js
test("lealtad: el canje entra en la huella del ticket sin mover la de los tickets que no tienen", () => {
  // COALESCE(..., '') es lo que importa: sin canjes el fragmento vale cadena vacía y la huella de
  // 60 días de ventas ya subidas no cambia. Un count(*) incondicional las re-subiría todas.
  assert.match(
    HUELLA_TICKET,
    /COALESCE\(\(SELECT string_agg\(md5\(to_jsonb\(h\)::text\), '' ORDER BY h\.id\) FROM ticket_canjes_lealtad h WHERE h\.ticket_id = x\.id\), ''\)/,
  );
});

test("lealtad: HUELLA_FILA se exporta para que el pull anote clientes con la misma huella", () => {
  assert.equal(HUELLA_FILA, "md5(to_jsonb(x)::text)");
});

test("lealtad: marcarLealtadSubidos anota por id y no hace nada con una lista vacía", async () => {
  const consultas = [];
  const pool = { query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
  await marcarLealtadSubidos(pool, []);
  assert.equal(consultas.length, 0);
  await marcarLealtadSubidos(pool, ["a", "b"]);
  assert.equal(consultas.length, 1);
  assert.match(consultas[0].sql, /INSERT INTO _vim_lealtad_mov_ok/);
  assert.deepEqual(consultas[0].params, [["a", "b"]]);
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `node --test desktop/src/sync-push.test.mjs`
Expected: FAIL: `marcarLealtadSubidos` no se exporta.

- [ ] **Step 3: Implementar en `desktop/src/sync-push.mjs`**

Ocho cambios, en este orden.

**(a)** Exporta la huella de fila. Donde hoy dice (línea ~71) `const HUELLA_FILA = "md5(to_jsonb(x)::text)";`, deja:

```js
export const HUELLA_FILA = "md5(to_jsonb(x)::text)";
```

**(b)** En `HUELLA_TICKET`, añade esta línea inmediatamente después de la de `delivery_asignaciones` y antes de la de `comanda_impresiones`:

```js
  || COALESCE((SELECT string_agg(md5(to_jsonb(h)::text), '' ORDER BY h.id) FROM ticket_canjes_lealtad h WHERE h.ticket_id = x.id), '')
```

**(c)** En `asegurarTabla`, antes de `await rescatarCortesUnaVez(pool);`:

```js
  // Movimientos de lealtad (0156, ADR 0030): la caja los genera al cobrar, cancelar o quitar un
  // canje y nunca los baja del pull. Se marcan por id en cuanto la nube confirma; la nube es
  // idempotente por id. La copia local de un CANJE autorizado por la nube la marca el puente del
  // gateway al asentarla (lealtad-puente.mjs): la nube ya lo tiene y no debe contar como pendiente.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_lealtad_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
```

**(d)** En `listarPendientes`, añade esta subconsulta después de la de `movimientos` y su campo en el retorno:

```js
      -- Movimientos de lealtad aún no confirmados por la nube, en orden de fecha.
      (SELECT array_agg(m.id ORDER BY m.fecha)
         FROM lealtad_movimientos m
         LEFT JOIN _vim_lealtad_mov_ok ok ON ok.movimiento_id = m.id
        WHERE ok.movimiento_id IS NULL) AS lealtad,
```

```js
    clienteIds: rows[0].clientes ?? [], direccionIds: rows[0].direcciones ?? [],
    lealtadIds: rows[0].lealtad ?? [],
```

**(e)** En `construirSnapshotPush`: añade `lealtadIds = null` a los parámetros desestructurados; añade `lealtadIds` como **octavo** elemento del arreglo de parámetros de la consulta (queda `$8`); y dentro del `SELECT`:

Junto a `AS movimientos`:

```js
      (SELECT array_agg(id) FROM lealtad_movimientos x WHERE ($8::uuid[] IS NOT NULL AND x.id = ANY($8::uuid[])) OR ($8::uuid[] IS NULL AND $2::uuid[] IS NULL AND x.id NOT IN (SELECT movimiento_id FROM _vim_lealtad_mov_ok))) AS lealtad,
```

Dentro del `jsonb_build_object`, después de `'ticket_promociones_aplicadas'`:

```js
        'ticket_canjes_lealtad',        (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_canjes_lealtad x WHERE x.ticket_id IN (SELECT id FROM tk)),
```

Y después de `'movimientos_inventario'` (añade la coma que falte a la entrada anterior):

```js
        -- Lealtad (ADR 0030): con lista, exactamente esos; sin lista (modo completo), los pendientes.
        'lealtad_movimientos',       (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.fecha) FROM lealtad_movimientos x
                                        WHERE ($8::uuid[] IS NOT NULL AND x.id = ANY($8::uuid[]))
                                           OR ($8::uuid[] IS NULL AND $2::uuid[] IS NULL
                                               AND x.id NOT IN (SELECT movimiento_id FROM _vim_lealtad_mov_ok)))
```

En el objeto que devuelve la función añade `lealtad: rows[0].lealtad ?? [],`.

**(f)** Debajo de `marcarMovimientosPushed`:

```js
/** Marca movimientos de lealtad confirmados por la nube. */
export async function marcarLealtadSubidos(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_lealtad_mov_ok(movimiento_id) SELECT unnest($1::uuid[]) ON CONFLICT (movimiento_id) DO NOTHING", [ids]);
}
```

**(g)** En `rechazadosPorTicket`: añade `"ticket_canjes_lealtad"` al arreglo de la rama que retiene el ticket (`["ticket_items", "pagos", "ticket_descuentos_manuales", "ticket_promociones_aplicadas", "cancelaciones_ticket"]`), porque sin su canje el total del ticket no cuadra en la nube. Y añade esta rama antes del `else` final:

```js
    } else if (e.tabla === "lealtad_movimientos") {
      // Se reintenta solo (no se marca en _vim_lealtad_mov_ok); no invalida la venta.
      continue;
```

**(h)** En `enviarLote`: añade `lealtadIds = []` a los parámetros desestructurados del tercer argumento; pásalo a `construirSnapshotPush` y recoge `lealtad` del resultado; en `partir`, pasa `lealtadIds` a la **primera** mitad (como `clienteIds`); y después de marcar clientes:

```js
  const leaFuera = filasRechazadas(errores, "lealtad_movimientos");
  await marcarLealtadSubidos(pool, lealtad.filter((id) => !leaFuera.has(id)));
```

En `pushToCloud`: después de calcular `movimientoIds`,

```js
  // Mismo techo que inventario; el resto sube en el siguiente ciclo, en orden de fecha.
  const lealtadIds = pendientes.lealtadIds.slice(0, maxMovimientos);
```

añade `&& !lealtadIds.length` a la guarda de "nada pendiente por subir"; añade a `parte`:

```js
    lealtadIds.length ? `${lealtadIds.length} movimiento(s) de lealtad` : null,
```

y en el bucle de lotes pasa `lealtadIds: n === 1 ? lealtadIds : []` a `enviarLote` (después del `n++`, igual que `conMesas: n === 1`).

- [ ] **Step 4: Correr las pruebas**

Run: `pnpm test:escritorio`
Expected: PASS. Si alguna prueba vieja falla porque `crearPoolFalso` no reconoce una consulta nueva, abre esa función en `sync-push.test.mjs`, mira cómo decide por el texto de la consulta y añade el caso de `_vim_lealtad_mov_ok` devolviendo `{ rows: [], rowCount: 0 }`. No cambies lo que afirman las pruebas viejas.

Run (desde `desktop/`): `npm run verify:push`
Expected: termina sin error. Usa Postgres embebido real y ejercita el SQL de `listarPendientes` y `construirSnapshotPush`; si hay un error de sintaxis en lo añadido, aquí aparece. **Cierra VIM POS instalado antes de correrlo** (comparte el puerto 54329).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/sync-push.mjs desktop/src/sync-push.test.mjs
git commit -m "feat(lealtad): la caja sube movimientos y canjes (libreta _vim_lealtad_mov_ok)"
```

---

### Task 8: El escritorio baja clientes, programa, premios y saldos

**Files:**
- Modify: `desktop/src/sync-pull.mjs`
- Modify: `desktop/src/sync-pull.test.mjs`

**Interfaces:**
- Consumes: `HUELLA_FILA` (Task 7); claves que devuelve `sync_pull_snapshot` (Task 6); libretas `_vim_clientes_ok` y `_vim_lealtad_mov_ok`.
- Produces:
  - `export function deltaLealtadPendiente(movimientos, versionActual): Map<string, number>` — pura.
  - `export async function corregirSaldosLealtadPorPendientes(client, log, filasAplicadas)`.
  - `export async function marcarClientesDelPull(client, filas, log)`.
  - `PULL_ORDER` con `clientes`, `lealtad_programa`, `lealtad_premios`, `lealtad_saldos`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade a `desktop/src/sync-pull.test.mjs` (y añade `deltaLealtadPendiente` al `import` de `./sync-pull.mjs`):

```js
test("lealtad: deltaLealtadPendiente suma por cliente solo lo de la versión vigente", () => {
  const d = deltaLealtadPendiente([
    { cliente_id: "ana", puntos: 12, programa_version: 2 },
    { cliente_id: "ana", puntos: -5, programa_version: 2 },
    { cliente_id: "ana", puntos: 40, programa_version: 1 }, // versión vieja: registrado, no suma
    { cliente_id: "beto", puntos: 3, programa_version: 2 },
  ], 2);
  assert.equal(d.get("ana"), 7);
  assert.equal(d.get("beto"), 3);
  assert.equal(d.size, 2);
});

test("lealtad: deltaLealtadPendiente aguanta vacío y sin versión", () => {
  assert.equal(deltaLealtadPendiente([], 1).size, 0);
  assert.equal(deltaLealtadPendiente(null, 1).size, 0);
  assert.equal(deltaLealtadPendiente([{ cliente_id: "ana", puntos: 5, programa_version: 1 }], null).size, 0);
});

test("lealtad: el pull respeta las llaves foráneas en el orden", () => {
  const pos = (t) => PULL_ORDER.findIndex((x) => x.t === t);
  assert.ok(pos("clientes") > pos("tenants"), "clientes después de tenants");
  assert.ok(pos("lealtad_saldos") > pos("clientes"), "saldos después de clientes");
  assert.ok(pos("lealtad_saldos") > pos("lealtad_programa"), "saldos después del programa (se corrigen con su versión)");
  assert.ok(pos("lealtad_premios") > pos("productos"), "premios después de productos");
});
```

Si `PULL_ORDER` no está ya en el `import` del archivo de pruebas, añádelo.

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `node --test desktop/src/sync-pull.test.mjs`
Expected: FAIL: `deltaLealtadPendiente` no se exporta.

- [ ] **Step 3: Implementar en `desktop/src/sync-pull.mjs`**

**(a)** Cambia el `import` de la línea 9:

```js
import { asegurarLibretaZonas, ZONA_EDITADA_LOCAL, HUELLA_FILA } from "./sync-push.mjs";
```

**(b)** En `PULL_ORDER`, después de `{ t: "anuncios_pantalla" },`:

```js
  // Lealtad (0156, ADR 0030). Clientes: FK solo a tenants. El programa antes que los saldos, que se
  // corrigen con su versión. Los premios apuntan a productos, que ya bajaron arriba.
  { t: "clientes" },
  { t: "lealtad_programa" },
  { t: "lealtad_premios" },
  { t: "lealtad_saldos" },
```

**(c)** En `CLAVES_NATURALES`, después de la entrada de `zonas_envio`:

```js
  // El mismo teléfono registrado en esta caja y en otra sucursal (spec lealtad §8.4): la nube ya
  // los fundió en uno y aquí baja el cliente real, con otro id. Igual que una zona, el cliente
  // local tiene datos que no se pueden tirar (ventas, direcciones, movimientos), así que se mudan
  // al id de la nube. `reapuntarFk` los busca en el catálogo de Postgres en vez de listarlos a
  // mano: una tabla nueva que apunte a clientes queda cubierta sola.
  // lealtad_saldos NO se muda (su llave ES el cliente y mudarla chocaría si el real ya tuviera
  // saldo): se borra y entra la de la nube unas filas más abajo, en este mismo pull.
  clientes: {
    claveSql: {
      where: "tenant_id = $1 AND telefono = $2 AND deleted_at IS NULL",
      params: (f) => [f.tenant_id ?? null, f.telefono ?? null],
      aplica: (f) => f.deleted_at == null && f.telefono != null && f.telefono !== "",
    },
    dependientes: [{ tabla: "lealtad_saldos", col: "cliente_id" }],
    reapuntarFk: { tabla: "clientes", excepto: ["lealtad_saldos"] },
  },
```

**(d)** Encima de `reconciliarCatalogo`:

```js
const fkCache = new Map();
/** Columnas de otras tablas de `public` con llave foránea simple hacia `public.<tabla>(id)`. */
async function columnasQueApuntanA(client, tabla, excepto = []) {
  if (!fkCache.has(tabla)) {
    const { rows } = await client.query(
      `SELECT cl.relname AS tabla, a.attname AS col
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
          AND c.confrelid = ('public.' || $1)::regclass`, [tabla]);
    fkCache.set(tabla, rows);
  }
  return fkCache.get(tabla).filter((r) => !excepto.includes(r.tabla));
}
```

**(e)** Dentro de `reconciliarCatalogo`, justo antes del `let borradas = 0;`:

```js
  const reapuntar = cfg.reapuntarFk
    ? await columnasQueApuntanA(client, cfg.reapuntarFk.tabla, cfg.reapuntarFk.excepto)
    : (cfg.reapuntar ?? []);
```

y en el bucle de abajo sustituye `for (const r of cfg.reapuntar ?? []) {` por `for (const r of reapuntar) {`.

**(f)** Debajo de `separarZonasPendientes`:

```js
/**
 * Clientes: mismo contrato que las zonas. Un cliente que la caja editó y aún no sube (está en la
 * libreta `_vim_clientes_ok` con una huella distinta a la de su fila) no se pisa con la copia de la
 * nube; el siguiente push lo sube y el pull siguiente ya es inocuo.
 */
async function separarClientesPendientes(client, filas) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return { aplicar: filas ?? [], descartadas: [] };
  await client.query("CREATE TABLE IF NOT EXISTS _vim_clientes_ok (cliente_id uuid PRIMARY KEY, huella text NOT NULL, subido_at timestamptz DEFAULT now())");
  // FOR NO KEY UPDATE: espera a una edición en vuelo sin chocar con las FK de tickets (ver
  // separarZonasPendientes para el porqué del candado y de su tipo).
  await client.query("SELECT 1 FROM clientes WHERE id = ANY($1::uuid[]) FOR NO KEY UPDATE", [ids]);
  const { rows } = await client.query(
    `SELECT o.cliente_id FROM _vim_clientes_ok o
       JOIN clientes x ON x.id = o.cliente_id
      WHERE o.cliente_id = ANY($1::uuid[]) AND o.huella IS DISTINCT FROM ${HUELLA_FILA}`, [ids]);
  const pendientes = new Set(rows.map((r) => r.cliente_id));
  if (!pendientes.size) return { aplicar: filas, descartadas: [] };
  return {
    aplicar: filas.filter((f) => !pendientes.has(f.id)),
    descartadas: filas.filter((f) => pendientes.has(f.id)),
  };
}

/**
 * Anota en la libreta del PUSH los clientes que acaban de bajar, con la huella de la fila LOCAL
 * recién escrita. Sin esto el push los volvería a mandar y la caja pisaría con su copia lo que se
 * editó en el panel o en otra sucursal (misma razón que marcarZonasDelPull).
 */
export async function marcarClientesDelPull(client, filas, log = () => {}) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return 0;
  await client.query("CREATE TABLE IF NOT EXISTS _vim_clientes_ok (cliente_id uuid PRIMARY KEY, huella text NOT NULL, subido_at timestamptz DEFAULT now())");
  await client.query(
    `INSERT INTO _vim_clientes_ok (cliente_id, huella)
     SELECT x.id, ${HUELLA_FILA} FROM clientes x WHERE x.id = ANY($1::uuid[])
     ON CONFLICT (cliente_id) DO UPDATE SET huella = EXCLUDED.huella`, [ids]);
  log(`  clientes: ${ids.length} anotado(s) como de la nube (no vuelven a subir)`);
  return ids.length;
}

/**
 * Lo que la nube todavía NO sabe de lealtad: suma de puntos, por cliente, de los movimientos
 * locales pendientes de subir que son de la versión vigente del programa (los de una versión
 * anterior se registran y no suman, igual que en la nube). Pura, para poder probarla.
 */
export function deltaLealtadPendiente(movimientos, versionActual) {
  const acumulado = new Map();
  if (versionActual == null) return acumulado;
  for (const m of movimientos ?? []) {
    if (Number(m.programa_version) !== Number(versionActual)) continue;
    acumulado.set(m.cliente_id, (acumulado.get(m.cliente_id) ?? 0) + Number(m.puntos));
  }
  return acumulado;
}

/**
 * Después de bajar `lealtad_saldos` (la nube manda), suma lo que la caja generó y aún no subió.
 * Sin esto, un pull entre dos pushes le "quitaría" al cliente lo que acaba de ganar. Solo sobre
 * los clientes que trajo ESTE pull (misma regla I1 que corregirExistenciasPorPendientes): si la
 * nube no mandó su fila, la local ya incluye lo pendiente y no se toca.
 */
export async function corregirSaldosLealtadPorPendientes(client, log = () => {}, filasAplicadas = []) {
  const permitidos = new Set(filasAplicadas.map((f) => f.cliente_id));
  if (!permitidos.size) return 0;
  await client.query("CREATE TABLE IF NOT EXISTS _vim_lealtad_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  const tenantId = filasAplicadas[0].tenant_id;
  const prog = await client.query("SELECT version FROM lealtad_programa WHERE tenant_id = $1", [tenantId]);
  const { rows } = await client.query(`
    SELECT m.cliente_id, m.puntos, m.programa_version
      FROM lealtad_movimientos m
      LEFT JOIN _vim_lealtad_mov_ok ok ON ok.movimiento_id = m.id
     WHERE ok.movimiento_id IS NULL AND m.tenant_id = $1`, [tenantId]);
  const deltas = deltaLealtadPendiente(rows, prog.rows[0]?.version ?? null);
  let n = 0;
  for (const [clienteId, delta] of deltas) {
    if (!delta || !permitidos.has(clienteId)) continue;
    const r = await client.query(
      "UPDATE lealtad_saldos SET saldo = saldo + $2 WHERE cliente_id = $1", [clienteId, delta]);
    n += r.rowCount;
  }
  if (n) log(`  lealtad_saldos: ${n} saldo(s) corregido(s) por movimientos pendientes`);
  return n;
}
```

**(g)** En `pullSnapshot`, dentro del bucle. Después del bloque `if (t === "zonas_envio") { … }` que separa pendientes:

```js
      if (t === "clientes") {
        const { aplicar, descartadas } = await separarClientesPendientes(client, filas);
        if (descartadas.length) {
          log(`  clientes: ${descartadas.length} con edición local pendiente, no se pisan`);
        }
        filas = aplicar;
        if (!filas.length) continue;
      }
```

Y junto a los ganchos de después del upsert:

```js
      if (t === "clientes") await marcarClientesDelPull(client, filas, log);
      if (t === "lealtad_saldos") await corregirSaldosLealtadPorPendientes(client, log, filas);
```

- [ ] **Step 4: Correr las pruebas**

Run: `pnpm test:escritorio`
Expected: PASS.

Run (desde `desktop/`): `npm run verify:sync`
Expected: termina sin error (ejercita `pullSnapshot` contra Postgres embebido real). Cierra VIM POS instalado antes.

- [ ] **Step 5: Probar la fusión en la caja contra Postgres real**

Crea `desktop/src/verify-lealtad-pull.mjs`:

```js
// Verifica contra Postgres embebido real lo que las pruebas unitarias no pueden: que al bajar el
// cliente real de la nube, el duplicado local se funde en él sin perder sus ventas ni sus puntos.
// Uso: node src/verify-lealtad-pull.mjs   (cerrar VIM POS instalado antes: comparte Postgres)
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { startLocalBackend } from "./runtime.mjs";
import { pullSnapshot } from "./sync-pull.mjs";

const T = "99999999-0000-0000-0000-0000000000aa";
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vim-lealtad-pull-"));
const backend = await startLocalBackend({ dataRoot, pgPort: 54398, restPort: 54397 });
const pool = backend.pool;
try {
  await pool.query("INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES ($1, 'PUNTOS_DINERO', 10)", [T]);
  const local = (await pool.query(
    "INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Ana Caja', '4770001567') RETURNING id", [T])).rows[0].id;
  // Lo que la caja ya generó para el duplicado: 12 puntos sin subir.
  await pool.query("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 12, 1)", [T, local]);

  const real = "77777777-0000-0000-0000-000000000001";
  const snapshot = {
    clientes: [{ id: real, tenant_id: T, nombre: "Ana Nube", telefono: "4770001567", tipo_fiscal: "EVENTUAL", estado: "ACTIVO",
                 codigo_publico: "a".repeat(64), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    // La nube trae 30 de otra sucursal; todavía no sabe de los 12 de esta caja.
    lealtad_saldos: [{ cliente_id: real, tenant_id: T, saldo: 30, programa_version: 1, updated_at: new Date().toISOString() }],
  };
  await pullSnapshot(pool, snapshot, (m) => console.log(m));

  const vivos = (await pool.query("SELECT id FROM clientes WHERE tenant_id = $1 AND telefono = '4770001567'", [T])).rows;
  assert.deepEqual(vivos.map((r) => r.id), [real], "queda un solo cliente y es el de la nube");
  const mov = (await pool.query("SELECT cliente_id FROM lealtad_movimientos WHERE tenant_id = $1", [T])).rows;
  assert.ok(mov.every((m) => m.cliente_id === real), "los movimientos locales se mudaron al cliente real");
  const saldo = (await pool.query("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real])).rows[0].saldo;
  assert.equal(saldo, 42, "saldo = 30 de la nube + 12 pendientes de subir");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM lealtad_saldos WHERE cliente_id = $1", [local])).rows[0].n, 0, "el saldo del duplicado se fue");

  // Un segundo pull idéntico no cambia nada.
  await pullSnapshot(pool, snapshot, () => {});
  assert.equal((await pool.query("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real])).rows[0].saldo, 42, "el pull es idempotente");
  console.log("VERIFY LEALTAD PULL OK");
} finally {
  await backend.stop?.();
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
```

Antes de correrlo, abre `desktop/scripts/smokes.mjs:27-30` y confirma cómo se obtiene el pool y cómo se detiene el backend que devuelve `startLocalBackend`; ajusta `backend.pool` y `backend.stop` a los nombres reales de ese objeto (el script de smokes usa exactamente lo mismo).

Añade a `desktop/package.json`, en `scripts`: `"verify:lealtad-pull": "node src/verify-lealtad-pull.mjs"`.

Run (desde `desktop/`): `npm run verify:lealtad-pull`
Expected: `VERIFY LEALTAD PULL OK`.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/sync-pull.mjs desktop/src/sync-pull.test.mjs desktop/src/verify-lealtad-pull.mjs desktop/package.json
git commit -m "feat(lealtad): la caja baja clientes, programa, premios y saldos, y funde duplicados por teléfono"
```

---

### Task 9: Edge Function `lealtad-canje` y puente del gateway

**Files:**
- Create: `supabase/functions/_shared/lealtad/cuerpo.ts`
- Create: `supabase/functions/_shared/lealtad/cuerpo.test.ts`
- Create: `supabase/functions/lealtad-canje/index.ts`
- Create: `desktop/src/lealtad-puente.mjs`
- Create: `desktop/src/lealtad-puente.test.mjs`
- Modify: `desktop/src/gateway.mjs` (junto al handler de `delivery-accion`, ~línea 313)
- Modify: `package.json` (script `test:functions`, solo si su glob no cubre `_shared/lealtad/`)

**Interfaces:**
- Consumes: `lealtad_saldo`, `lealtad_canjear`, `lealtad_canje_datos`, `lealtad_asentar_canje` (Task 4); `modulos_efectivos` (Task 1); `marcarLealtadSubidos` (Task 7).
- Produces — contrato HTTP de `POST /functions/v1/lealtad-canje`, el mismo en web y en la caja. Es lo que consume el POS en el plan 1B:

| `accion` | Cuerpo | Respuesta 200 |
|---|---|---|
| `saldo` | `{cliente_id?, telefono?}` | `{ok:true, cliente_id, saldo, vence_el, mecanica, programa_version}` |
| `canjear` | `{canje_id, cliente_id?, telefono?, puntos?, premio_id?, ticket_id?, sucursal_id?}` | `{ok:true, canje_id, cliente_id, puntos, monto_mxn, premio_id, producto_id, saldo, vence_el, programa_version, repetido}` |
| `asentar` | `{canje_id, ticket_id, ticket_item_id?}` | `{ok:true, canje_id}` |

Errores: `409 {ok:false, error}` para reglas de negocio (`SALDO_INSUFICIENTE`, `CLIENTE_NO_EXISTE`, `PREMIO_INVALIDO`, `PUNTOS_INVALIDOS`, `MODULO_APAGADO`, `SIN_PROGRAMA`, `CANJE_NO_EXISTE`, `CANJE_REVERTIDO`, `TICKET_NO_ABIERTO`); `403 {error:"SIN_MODULO_LEALTAD"}`; `400 {error:"FALTAN_CAMPOS"|"BAD_JSON"|"ACCION_INVALIDA"}`; en la caja además `503 {error:"FUNCION_REQUIERE_NUBE"|"SIN_RED"}`.

Flujo en dos pasos, igual en web y en caja: `canjear` (la nube descuenta) → el POS añade el renglón del premio si lo hay → `asentar` (se pega al ticket donde viva). En la caja, `asentar` lo atiende el gateway: le pregunta a la nube por el canje y asienta en el Postgres local **con lo que diga la nube**.

- [ ] **Step 1: Escribir las pruebas de la validación del cuerpo**

`supabase/functions/_shared/lealtad/cuerpo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { moduloLealtadActivo, validarCuerpo } from "./cuerpo.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

test("moduloLealtadActivo lee efectivos, no permitidos, y falla cerrado", () => {
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: { lealtad: true } }), true);
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: { lealtad: false } }), false);
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: {} }), false);
  assert.equal(moduloLealtadActivo(null), false);
  assert.equal(moduloLealtadActivo(undefined), false);
});

test("saldo exige cliente o teléfono", () => {
  assert.deepEqual(validarCuerpo({ accion: "saldo" }), { ok: false, error: "FALTAN_CAMPOS" });
  assert.equal(validarCuerpo({ accion: "saldo", telefono: "477 000 1234" }).ok, true);
  assert.equal(validarCuerpo({ accion: "saldo", cliente_id: UUID }).ok, true);
});

test("canjear exige id del canje, a quién, y puntos o premio (no ambos)", () => {
  assert.equal(validarCuerpo({ accion: "canjear", cliente_id: UUID, puntos: 10 }).ok, false, "sin canje_id");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, puntos: 10 }).ok, false, "sin cliente ni teléfono");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID }).ok, false, "sin puntos ni premio");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 10, premio_id: UUID }).ok, false, "ambos");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 0 }).ok, false, "cero");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 1.5 }).ok, false, "fracción");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 10 }).ok, true);
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, telefono: "4770001234", premio_id: UUID }).ok, true);
});

test("asentar exige canje y ticket", () => {
  assert.equal(validarCuerpo({ accion: "asentar", canje_id: UUID }).ok, false);
  assert.equal(validarCuerpo({ accion: "asentar", canje_id: UUID, ticket_id: UUID }).ok, true);
});

test("un uuid mal formado o una acción desconocida se rechazan", () => {
  assert.deepEqual(validarCuerpo({ accion: "regalar" }), { ok: false, error: "ACCION_INVALIDA" });
  assert.equal(validarCuerpo({ accion: "saldo", cliente_id: "no-es-uuid" }).ok, false);
  assert.deepEqual(validarCuerpo(null), { ok: false, error: "ACCION_INVALIDA" });
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Abre `package.json` y mira el script `test:functions`. Si su lista de globs no incluye `supabase/functions/_shared/lealtad/*.test.ts`, añádelo al final de la lista, con el mismo formato que los demás.

Run: `pnpm test:functions`
Expected: FAIL: no existe `./cuerpo.ts`.

- [ ] **Step 3: Implementar `cuerpo.ts`**

`supabase/functions/_shared/lealtad/cuerpo.ts`:

```ts
// Validación del cuerpo de lealtad-canje y guarda del módulo. Sin Deno ni red, para poder probarla
// con node --test igual que _shared/delivery/modulo.ts.

export type Accion = "saldo" | "canjear" | "asentar";

export type Cuerpo = {
  accion: Accion;
  cliente_id?: string;
  telefono?: string;
  canje_id?: string;
  puntos?: number;
  premio_id?: string;
  ticket_id?: string;
  ticket_item_id?: string;
  sucursal_id?: string;
  /** Solo lo manda el puente de la caja: el empleado no viaja en el token de dispositivo. */
  usuario_id?: string;
};

export type Validado = { ok: true; cuerpo: Cuerpo } | { ok: false; error: "ACCION_INVALIDA" | "FALTAN_CAMPOS" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES: readonly Accion[] = ["saldo", "canjear", "asentar"];
const CAMPOS_UUID = ["cliente_id", "canje_id", "premio_id", "ticket_id", "ticket_item_id", "sucursal_id", "usuario_id"] as const;

/** Fail-closed y sobre `efectivos`: el add-on concedido pero apagado no canjea. */
export function moduloLealtadActivo(mod: unknown): boolean {
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null | undefined)?.efectivos;
  return efectivos?.lealtad === true;
}

export function validarCuerpo(entrada: unknown): Validado {
  const b = (entrada ?? {}) as Record<string, unknown>;
  if (typeof b.accion !== "string" || !ACCIONES.includes(b.accion as Accion)) {
    return { ok: false, error: "ACCION_INVALIDA" };
  }
  const falta: Validado = { ok: false, error: "FALTAN_CAMPOS" };

  const cuerpo: Cuerpo = { accion: b.accion as Accion };
  for (const campo of CAMPOS_UUID) {
    const v = b[campo];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || !UUID.test(v)) return falta;
    cuerpo[campo] = v.toLowerCase();
  }
  if (typeof b.telefono === "string" && b.telefono.replace(/\D/g, "") !== "") {
    cuerpo.telefono = b.telefono.replace(/\D/g, "");
  }
  if (b.puntos != null) {
    if (typeof b.puntos !== "number" || !Number.isInteger(b.puntos) || b.puntos <= 0) return falta;
    cuerpo.puntos = b.puntos;
  }

  const hayCliente = cuerpo.cliente_id != null || cuerpo.telefono != null;
  if (cuerpo.accion === "saldo" && !hayCliente) return falta;
  if (cuerpo.accion === "canjear") {
    if (!cuerpo.canje_id || !hayCliente) return falta;
    const conPuntos = cuerpo.puntos != null;
    const conPremio = cuerpo.premio_id != null;
    if (conPuntos === conPremio) return falta; // ni ninguno ni ambos
  }
  if (cuerpo.accion === "asentar" && (!cuerpo.canje_id || !cuerpo.ticket_id)) return falta;
  return { ok: true, cuerpo };
}
```

Run: `pnpm test:functions`
Expected: PASS.

- [ ] **Step 4: Implementar la Edge Function**

`supabase/functions/lealtad-canje/index.ts`:

```ts
// Entrada única del saldo y del canje de lealtad (ADR 0030). La nube es la única que autoriza un
// canje. La llaman el POS web (JWT del empleado) y el puente de la caja (token de dispositivo).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { registrarError } from "../_shared/errores.ts";
import { claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { moduloLealtadActivo, validarCuerpo } from "../_shared/lealtad/cuerpo.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** El id de caja de un dispositivo viene en su correo: caja-<uuid>@dispositivos.<dominio>. */
function cajaDesdeCorreo(email: string | undefined): string | null {
  const m = /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i.exec(email ?? "");
  return m ? m[1].toLowerCase() : null;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Resultado = { ok?: boolean; error?: string } & Record<string, unknown>;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) Quién llama y de qué negocio (mismo patrón que delivery-accion).
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const claims = claimsDe(token);
  const tenantId = tenantDeClaims(claims);
  if (!tenantId) return json({ error: "SIN_TENANT" }, 403);
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id")
    .eq("usuario_id", userResp.user.id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);

  const esDispositivo = claims.tipo_identidad === "DISPOSITIVO";
  let caja: { id: string; sucursal_id: string } | null = null;
  if (esDispositivo) {
    const cid = cajaDesdeCorreo(userResp.user.email);
    if (cid) {
      const { data: c } = await admin.from("cajas").select("id, sucursal_id")
        .eq("id", cid).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null).maybeSingle();
      caja = (c as { id: string; sucursal_id: string } | null) ?? null;
    }
    if (!caja) return json({ error: "CAJA_NO_VALIDA" }, 403);
  }

  // 2) Cuerpo.
  let crudo: unknown;
  try { crudo = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const v = validarCuerpo(crudo);
  if (!v.ok) return json({ error: v.error }, 400);
  const b = v.cuerpo;

  // 3) El módulo, encendido de verdad (add-on Y interruptor).
  const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
  if (!moduloLealtadActivo(mod)) return json({ error: "SIN_MODULO_LEALTAD" }, 403);

  // El empleado: en web es quien llama; desde una caja lo manda el puente en el cuerpo.
  const usuarioId = esDispositivo ? (b.usuario_id ?? null) : userResp.user.id;
  const responder = (r: Resultado | null) => (r?.ok ? json(r) : json(r ?? { ok: false, error: "SIN_RESPUESTA" }, 409));

  try {
    if (b.accion === "saldo") {
      const { data, error } = await admin.rpc("lealtad_saldo", {
        p_tenant: tenantId, p_cliente_id: b.cliente_id ?? null, p_telefono: b.telefono ?? null,
      });
      if (error) throw error;
      return responder(data as Resultado);
    }

    if (b.accion === "canjear") {
      const { data, error } = await admin.rpc("lealtad_canjear", {
        p_canje_id: b.canje_id, p_tenant: tenantId,
        p_cliente_id: b.cliente_id ?? null, p_telefono: b.telefono ?? null,
        p_puntos: b.puntos ?? null, p_premio_id: b.premio_id ?? null, p_ticket_id: b.ticket_id ?? null,
        p_sucursal_id: caja?.sucursal_id ?? b.sucursal_id ?? null, p_caja_id: caja?.id ?? null,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      return responder(data as Resultado);
    }

    // asentar. Desde una caja esta acción es solo una CONSULTA: el ticket vive en su Postgres y lo
    // asienta el puente con estos datos. Desde el POS web el ticket vive aquí y se asienta aquí.
    const { data: datos, error: e1 } = await admin.rpc("lealtad_canje_datos", { p_canje_id: b.canje_id, p_tenant: tenantId });
    if (e1) throw e1;
    const canje = datos as Resultado;
    if (!canje?.ok) return responder(canje);
    if (esDispositivo) return json(canje);

    const { error: e2 } = await admin.rpc("lealtad_asentar_canje", {
      p: { ...canje, tenant_id: tenantId, ticket_id: b.ticket_id, ticket_item_id: b.ticket_item_id ?? null, usuario_id: usuarioId },
    });
    if (e2) {
      const m = msg(e2);
      const conocido = ["TICKET_NO_EXISTE", "TICKET_NO_ABIERTO", "PREMIO_SIN_RENGLON", "RENGLON_NO_EXISTE", "MONTO_INVALIDO"].find((c) => m.includes(c));
      if (conocido) return json({ ok: false, error: conocido }, 409);
      throw e2;
    }
    return json({ ok: true, canje_id: b.canje_id });
  } catch (e) {
    registrarError("lealtad-canje", "ERROR_INTERNO", msg(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
```

Antes de guardar, abre `supabase/functions/_shared/errores.ts` y confirma que `registrarError` acepta `(funcion: string, codigo: string, detalle: string)`, que es como lo usa `delivery-accion/index.ts:132`. No añadas nada a `supabase/config.toml`: esta función exige JWT (el valor por omisión), igual que `delivery-accion`.

- [ ] **Step 5: Escribir las pruebas del puente de la caja**

`desktop/src/lealtad-puente.test.mjs`:

```js
// El puente de lealtad, probado sin red y sin Postgres. Lo que importa es la política: qué se
// reenvía, qué se asienta en local, con los datos de quién, y qué se anota en la libreta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { atenderLealtad } from "./lealtad-puente.mjs";

const NUBE = { cloudUrl: "https://nube.test", anonKey: "anon", deviceToken: "disp" };
const EMPLEADO = "22222222-2222-4222-8222-222222222222";
const TENANT = "99999999-0000-0000-0000-0000000000aa";

function poolFalso() {
  const consultas = [];
  return { consultas, query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [{ r: "ok" }], rowCount: 1 }; } };
}
function nubeFalsa(respuestas) {
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    llamadas.push({ url, cuerpo, auth: init.headers.Authorization });
    const r = respuestas[cuerpo.accion] ?? { status: 500, json: { error: "SIN_GUION" } };
    return { status: r.status, ok: r.status < 300, text: async () => JSON.stringify(r.json), json: async () => r.json };
  };
  return { llamadas, fetchFalso };
}

test("saldo y canjear se reenvían con el token del dispositivo y el empleado en el cuerpo", async () => {
  const pool = poolFalso();
  const { llamadas, fetchFalso } = nubeFalsa({ canjear: { status: 200, json: { ok: true, canje_id: "c1", saldo: 60 } } });
  const r = await atenderLealtad({ pool, nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, cuerpo: { accion: "canjear", canje_id: "c1", puntos: 40, usuario_id: "suplantado" }, fetchFn: fetchFalso });
  assert.equal(r.status, 200);
  assert.equal(llamadas[0].url, "https://nube.test/functions/v1/lealtad-canje");
  assert.equal(llamadas[0].auth, "Bearer disp");
  assert.equal(llamadas[0].cuerpo.usuario_id, EMPLEADO, "el empleado sale de la sesión local, no del navegador");
  assert.equal(pool.consultas.length, 0, "canjear no toca la base local");
});

test("asentar pregunta a la nube y asienta en local CON SUS DATOS, no con los del navegador", async () => {
  const pool = poolFalso();
  const deLaNube = { ok: true, canje_id: "c1", cliente_id: "cli-real", puntos: 40, monto_mxn: 40, premio_id: null, programa_version: 3 };
  const { llamadas, fetchFalso } = nubeFalsa({ asentar: { status: 200, json: deLaNube } });
  const r = await atenderLealtad({
    pool, nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, fetchFn: fetchFalso,
    cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1", ticket_item_id: "i1", puntos: 9999, monto_mxn: 9999, cliente_id: "otro" },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, canje_id: "c1" });
  assert.equal(llamadas.length, 1);
  const asentado = JSON.parse(pool.consultas[0].params[0]);
  assert.match(pool.consultas[0].sql, /lealtad_asentar_canje/);
  assert.equal(asentado.puntos, 40, "los puntos son los de la nube");
  assert.equal(asentado.monto_mxn, 40);
  assert.equal(asentado.cliente_id, "cli-real");
  assert.equal(asentado.ticket_id, "t1", "el ticket y el renglón sí son locales");
  assert.equal(asentado.ticket_item_id, "i1");
  assert.equal(asentado.tenant_id, TENANT);
  assert.equal(asentado.usuario_id, EMPLEADO);
  assert.match(pool.consultas[1].sql, /_vim_lealtad_mov_ok/, "la copia local del canje se anota como ya subida");
  assert.deepEqual(pool.consultas[1].params, [["c1"]]);
});

test("si la nube no reconoce el canje, no se asienta nada", async () => {
  const pool = poolFalso();
  const { fetchFalso } = nubeFalsa({ asentar: { status: 409, json: { ok: false, error: "CANJE_NO_EXISTE" } } });
  const r = await atenderLealtad({ pool, nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, cuerpo: { accion: "asentar", canje_id: "falso", ticket_id: "t1" }, fetchFn: fetchFalso });
  assert.equal(r.status, 409);
  assert.equal(pool.consultas.length, 0);
});

test("sin nube o sin red responde 503 con el vocabulario del gateway", async () => {
  const pool = poolFalso();
  const sinNube = await atenderLealtad({ pool, nube: null, usuarioId: EMPLEADO, tenantId: TENANT, cuerpo: { accion: "saldo" }, fetchFn: async () => { throw new Error("no debe llamarse"); } });
  assert.equal(sinNube.status, 503);
  assert.equal(sinNube.body.error, "FUNCION_REQUIERE_NUBE");
  const sinRed = await atenderLealtad({ pool, nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, cuerpo: { accion: "saldo" }, fetchFn: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(sinRed.status, 503);
  assert.equal(sinRed.body.error, "SIN_RED");
});

test("un error al asentar en local se reporta y no se anota la libreta", async () => {
  const consultas = [];
  const pool = { query: async (sql) => { consultas.push(sql); throw new Error("TICKET_NO_ABIERTO"); } };
  const { fetchFalso } = nubeFalsa({ asentar: { status: 200, json: { ok: true, canje_id: "c1", cliente_id: "cli", puntos: 5, monto_mxn: 5, programa_version: 1 } } });
  const r = await atenderLealtad({ pool, nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" }, fetchFn: fetchFalso });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "TICKET_NO_ABIERTO");
  assert.equal(consultas.length, 1, "no llegó a tocar la libreta");
});
```

Run: `node --test desktop/src/lealtad-puente.test.mjs`
Expected: FAIL: no existe `./lealtad-puente.mjs`.

- [ ] **Step 6: Implementar el puente**

`desktop/src/lealtad-puente.mjs`:

```js
// Puente de lealtad de la caja (ADR 0030). El POS llama a /functions/v1/lealtad-canje igual que en
// la web; el gateway valida la sesión LOCAL y este módulo decide qué hacer:
//
//   saldo, canjear → se reenvían a la nube con el token de DISPOSITIVO. El empleado no viaja en ese
//                    token, así que se añade al cuerpo desde la sesión local (nunca desde lo que
//                    mande el navegador).
//   asentar        → el ticket vive en ESTE Postgres. Se le pregunta a la nube por el canje y se
//                    asienta en local con lo que ella diga: puntos, monto, cliente. Del navegador
//                    solo se toman el ticket y el renglón.
//
// Va aparte de gateway.mjs para poder probarlo sin red y sin base (lealtad-puente.test.mjs).
import { marcarLealtadSubidos } from "./sync-push.mjs";

const ERRORES_DE_ASENTAR = ["TICKET_NO_EXISTE", "TICKET_NO_ABIERTO", "PREMIO_SIN_RENGLON", "RENGLON_NO_EXISTE", "MONTO_INVALIDO"];

async function llamarNube(nube, cuerpo, fetchFn) {
  let up;
  try {
    up = await fetchFn(`${nube.cloudUrl}/functions/v1/lealtad-canje`, {
      method: "POST",
      body: JSON.stringify(cuerpo),
      headers: { apikey: nube.anonKey, Authorization: `Bearer ${nube.deviceToken}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { status: 503, body: { error: "SIN_RED", detalle: String(e?.message ?? e) } };
  }
  const texto = await up.text();
  let body;
  try { body = JSON.parse(texto); } catch { body = { error: "RESPUESTA_INVALIDA" }; }
  return { status: up.status, body };
}

/**
 * @param {{ pool: { query: Function }, nube: { cloudUrl: string, anonKey: string, deviceToken: string } | null,
 *           usuarioId: string, tenantId: string, cuerpo: Record<string, unknown>, fetchFn?: typeof fetch }} args
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function atenderLealtad({ pool, nube, usuarioId, tenantId, cuerpo, fetchFn = fetch }) {
  if (!nube) return { status: 503, body: { error: "FUNCION_REQUIERE_NUBE", funcion: "lealtad-canje" } };
  const saliente = { ...cuerpo, usuario_id: usuarioId };

  if (cuerpo?.accion !== "asentar") return llamarNube(nube, saliente, fetchFn);

  const consulta = await llamarNube(nube, saliente, fetchFn);
  if (consulta.status !== 200 || consulta.body?.ok !== true) return consulta;

  const canje = consulta.body;
  const paraAsentar = {
    canje_id: canje.canje_id, cliente_id: canje.cliente_id, puntos: canje.puntos, monto_mxn: canje.monto_mxn,
    premio_id: canje.premio_id ?? null, programa_version: canje.programa_version,
    tenant_id: tenantId, usuario_id: usuarioId,
    ticket_id: cuerpo.ticket_id, ticket_item_id: cuerpo.ticket_item_id ?? null,
  };
  try {
    await pool.query("SELECT lealtad_asentar_canje($1::jsonb) AS r", [JSON.stringify(paraAsentar)]);
  } catch (e) {
    const m = String(e?.message ?? e);
    const conocido = ERRORES_DE_ASENTAR.find((c) => m.includes(c));
    return conocido
      ? { status: 409, body: { ok: false, error: conocido } }
      : { status: 500, body: { error: "ERROR_INTERNO", detalle: m } };
  }
  // La nube ya tiene este movimiento: que no cuente como pendiente (ni en el push ni al corregir
  // el saldo que baja en el pull).
  await marcarLealtadSubidos(pool, [canje.canje_id]);
  return { status: 200, body: { ok: true, canje_id: canje.canje_id } };
}
```

`marcarLealtadSubidos` hace `INSERT INTO _vim_lealtad_mov_ok`, pero esa tabla la crea `asegurarTabla` en el primer push. Para una caja que canjea antes de su primer push, añade al principio de `marcarLealtadSubidos` (en `sync-push.mjs`, Task 7), después del `if (!ids?.length) return;`:

```js
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_lealtad_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
```

y ajusta la tercera prueba de la Task 7 para que espere **dos** consultas tras la llamada con ids (la del `CREATE TABLE` y la del `INSERT`), y la de este archivo para que el `INSERT` sea `pool.consultas[2]`.

- [ ] **Step 7: Conectar el puente en el gateway**

En `desktop/src/gateway.mjs`, añade el import junto a los demás del archivo:

```js
import { atenderLealtad } from "./lealtad-puente.mjs";
```

Y añade este bloque inmediatamente después del `if (p === "/functions/v1/delivery-accion") { … }` y **antes** del comodín `if (p.startsWith("/functions/v1/")) {`:

```js
      if (p === "/functions/v1/lealtad-canje") {
        // Lealtad (ADR 0030): la nube autoriza el canje; la caja lo asienta en su ticket. Ver
        // lealtad-puente.mjs. Se valida la sesión LOCAL del empleado; a la nube va el dispositivo.
        const u = await getUser(pool, secret, bearer(req));
        if (u.error) return send(u.error, u.body);
        const { rows: acc } = await pool.query(
          "SELECT tenant_id FROM usuarios_acceso WHERE usuario_id = $1 AND activo = true LIMIT 1", [u.body.id]);
        if (!acc.length) return send(403, { error: "SIN_TENANT" });
        let cuerpo;
        try { cuerpo = JSON.parse((await readBody(req)).toString() || "{}"); } catch { return send(400, { error: "BAD_JSON" }); }
        const nube = typeof backend.nube === "function" ? await backend.nube().catch(() => null) : null;
        const r = await atenderLealtad({ pool, nube, usuarioId: u.body.id, tenantId: acc[0].tenant_id, cuerpo });
        return send(r.status, r.body);
      }
```

Confirma en `desktop/src/auth.mjs:63` (`goTrueUser`) que el objeto que devuelve trae `id`; es lo que se usa como `u.body.id`.

- [ ] **Step 8: Correr las pruebas**

Run: `pnpm test:escritorio && pnpm test:functions`
Expected: PASS en ambos.

Run: `pnpm --filter "./apps/*" -r typecheck`
Expected: PASS (nada de `apps/` cambió; es la red de seguridad de que no se rompió un tipo compartido).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/lealtad supabase/functions/lealtad-canje desktop/src/lealtad-puente.mjs desktop/src/lealtad-puente.test.mjs desktop/src/gateway.mjs desktop/src/sync-push.mjs desktop/src/sync-push.test.mjs package.json
git commit -m "feat(lealtad): Edge Function lealtad-canje y puente de la caja"
```

---

### Task 10: Tipos, ADR y verificación completa

**Files:**
- Modify: `packages/db/src/database.types.ts` (generado)
- Create: `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md`
- Modify: `docs/decisiones/README.md`

**Interfaces:**
- Produces: tipos de las tablas y RPC nuevas para los planes 1B y 1C.

- [ ] **Step 1: Regenerar los tipos**

Run: `supabase db reset && pnpm db:types`
Expected: `packages/db/src/database.types.ts` gana `lealtad_programa`, `lealtad_premios`, `lealtad_movimientos`, `lealtad_saldos`, `ticket_canjes_lealtad`, `clientes_alias`, los enums `lealtad_mecanica` y `lealtad_movimiento_tipo`, `tickets.lealtad_mxn`, y las funciones `lealtad_guardar_programa`, `lealtad_ajustar_saldo`, `quitar_canje_lealtad`.

Si `supabase db reset` falla en local por el desfase conocido del historial (`type "combo_modo_precio" already exists`), no lo fuerces: genera los tipos desde un stack limpio (`supabase stop --no-backup && supabase start`) y vuelve a intentar. Si sigue fallando, deja este paso anotado en el PR como pendiente; los planes 1B y 1C no usan el tipo genérico del cliente de Supabase y no se bloquean.

Run: `pnpm --filter "./apps/*" -r typecheck`
Expected: PASS.

- [ ] **Step 2: Escribir el ADR**

`docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md`:

```markdown
# 0030 — La lealtad viaja por movimientos y el canje lo autoriza la nube

**Fecha:** 2026-10-05 · **Estado:** vigente · **Supera:** D20 de la especificación (cliente sin
lealtad en el MVP). **Amplía:** ADR 0004 (lista de tablas que se sincronizan) con el patrón del
ADR 0013.

## Qué decía el plan

- **D20:** `clientes` es una tabla simple, sin lealtad ni puntos; "CRM Pro" sería un add-on de $399
  que extendería el esquema cuando se contratara.
- **ADR 0004:** la sincronización replica una lista explícita de tablas, disjunta: la operación
  sube, el catálogo baja. `clientes` solo subía (0117).

## Qué hacemos ahora (migración 0156)

1. **Un libro que solo se agrega.** `lealtad_movimientos` registra lo ganado, lo canjeado, las
   reversas, los ajustes y los vencimientos. El saldo (`lealtad_saldos`) se deriva de él y lo
   escribe una sola función, `lealtad_registrar_movimiento`, idempotente por id.
2. **Ganar corre donde se cobra.** Un trigger en `tickets` escribe el movimiento al quedar pagado:
   en la caja para la caja, en la nube para el POS web. Los tickets de una caja entran a la nube en
   modo réplica, así que allá el trigger no corre y lo ganado llega como movimiento por el push.
3. **Canjear lo autoriza solo la nube.** La Edge Function `lealtad-canje` bloquea el saldo, valida y
   descuenta. Sin internet no hay canje. El POS llama igual en web y en caja; en la caja el gateway
   reenvía con el token del dispositivo y asienta el canje en el ticket local con los datos que
   devuelve la nube, nunca con los del navegador.
4. **El canje es un descuento, no una forma de pago.** Vive en `ticket_canjes_lealtad` y en
   `tickets.lealtad_mxn`. Un premio de producto entra como renglón a su precio con el descuento
   completo, y ese descuento se guarda en `ticket_items.promocion_item_mxn` porque es la columna
   que el timbrado lee.
5. **Los clientes bajan a la caja** junto con el programa, los premios y los saldos. La caja
   muestra saldo de la nube + lo suyo que aún no sube.
6. **El teléfono es la identidad y la nube decide.** Un cliente que llega con un teléfono que ya
   existe con otro id se anota en `clientes_alias` y todo lo suyo se redirige al existente. En el
   siguiente pull la caja muda sus ventas y movimientos al id de la nube y borra el duplicado.
7. **Tres mecánicas, un núcleo.** `PUNTOS_DINERO`, `SELLOS` y `PUNTOS_PREMIOS` son una regla de
   cómo se gana y una de cómo se canjea. Cambiar de mecánica sube la versión del programa y pone
   los saldos en cero; un movimiento de una versión anterior se registra y no suma.
8. **Dos capas, como delivery:** add-on `LEALTAD` ($100, incluido desde Negocio) e interruptor
   `configuracion_tenant.modulo_lealtad_activo`. Retirar el add-on apaga el interruptor.

## Por qué

- Replicar saldos entre cajas los pisaría; los movimientos suman en cualquier orden y reintentar
  no duplica. Es el mismo argumento del ADR 0013 y ya está probado en producción con inventario.
- Con saldo único por negocio, canjear sin conexión permite gastar el mismo saldo en dos
  sucursales. Una sola autoridad lo impide sin saldos negativos. Fermín eligió esto sobre el canje
  sin conexión el 5 oct 2026.
- "Monedero electrónico" como forma de pago en el CFDI exige ser emisor autorizado por el SAT;
  como descuento no cambia nada de lo que ya se timbra.
- La caja solo puede saber si el módulo está encendido por `configuracion_tenant`, porque
  `tenant_addons` no baja. Por eso retirar el add-on apaga el interruptor en vez de dejar dos
  hechos que podrían contradecirse.
- No se reutilizó el código `CRM_PRO`: nunca se sembró, y ese nombre prometía segmentación.

## Consecuencias

- **Orden de salida obligatorio:** migración a producción y función desplegada **antes** de mezclar,
  y el instalador al final. Una caja nueva contra una nube sin la 0156 anotaría como subidos
  movimientos que la nube ignoró (la trampa de la 0117).
- **Una caja sin actualizar sigue subiendo.** `sync_push_snapshot` rellena `lealtad_mxn` y
  `codigo_publico` cuando no vienen (`_vim_compat_0156`). Toda columna `NOT NULL` que se añada en el
  futuro a una tabla que sube necesita lo mismo, porque `_vim_apply_rows_detalle` inserta NULL en
  lo que el JSON no trae.
- **Al actualizar, cada caja vuelve a subir 60 días de ventas y todos sus clientes**, una vez:
  `tickets` y `clientes` ganaron una columna y eso mueve su huella. Es el mismo efecto de la 0122.
- **El pull sigue siendo completo y por hora.** Un cliente o un saldo de otra sucursal tarda hasta
  una hora en verse en la caja. El canje no depende de eso: pregunta a la nube en el momento y
  resuelve al cliente por teléfono.
- **`catalogo_version()` no mira lealtad** a propósito: si lo hiciera, cada venta con cliente
  dispararía un pull completo en todas las cajas del negocio.
- **El tope diario es por caja.** Un cliente que compra en dos sucursales el mismo día puede
  pasarse; la nube acepta esos puntos porque el ticket ya los imprimió.
- **Una caja sin conexión más de 48 horas después de un canje** verá ese canje devuelto por la red
  de seguridad aunque la cuenta se haya cobrado. El error favorece al cliente final.
- **El permiso es por negocio, no por sucursal.** No existe RLS por sucursal en el proyecto; que el
  encargado vea "solo su sucursal" es un filtro del admin, como en el resto de los reportes.
- `promocion_item_mxn` de un renglón premiado incluye el descuento de lealtad. Quien lea esa
  columna para reportar promociones por renglón debe saberlo.
- Diseño completo: `docs/superpowers/specs/2026-10-05-lealtad-design.md`.
```

- [ ] **Step 3: Registrar el ADR en el índice**

En `docs/decisiones/README.md`, añade esta fila al final de la tabla, después de la del 0029:

```markdown
| [0030](0030-la-lealtad-viaja-por-movimientos.md) | La lealtad viaja por movimientos y el canje lo autoriza la nube | 05/10/2026 |
```

- [ ] **Step 4: Verificación completa**

Run (desde `desktop/`, con VIM POS instalado cerrado): `npm run smokes`
Expected: todos los smokes OK, los cinco nuevos incluidos.

Run: `supabase db reset && supabase test db`
Expected: PASS completo.

Run: `pnpm test:escritorio && pnpm test:functions && pnpm -r test`
Expected: PASS.

Run (desde `desktop/`): `npm run verify:migraciones && npm run verify:lealtad-pull`
Expected: ambos terminan OK.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/database.types.ts docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md docs/decisiones/README.md
git commit -m "docs(lealtad): ADR 0030 y tipos regenerados"
```

---

## Al terminar este plan

Nada de esto se ve todavía y nada se publica: no hay pantalla que lo use. **No se aplica la 0156 a producción ni se despliega `lealtad-canje` desde este plan**; el orden de salida completo (migración → función → merge → instalador) vive en el plan 1C, cuando POS y admin estén listos. Lo que sí deja este plan es una rama `feat/lealtad-1a` con todo en verde, sobre la que se escriben y ejecutan 1B y 1C.
