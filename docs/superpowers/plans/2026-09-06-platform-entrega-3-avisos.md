# Panel de plataforma · Entrega 3 — avisos a las cajas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que VIM pueda escribir un aviso desde el panel —a un cliente o a todos— y que llegue a las cajas por el latido, se muestre al cajero y se sepa quién lo leyó.

**Architecture:** Una migración (0106) crea `avisos_plataforma` y `avisos_lecturas`, y amplía las tres funciones de la 0105: `resolver_directivas` empieza a llenar el hueco `avisos: []`, `caja_latido` gana `p_avisos_vistos` para registrar lecturas, y nace `marcar_aviso_visto()` para el POS web. La Edge Function ya valida `avisos_vistos` en el cuerpo (0105) pero lo ignoraba: ahora lo pasa. En el escritorio, el POS avisa por `POST /__aviso-visto` y `directivas.mjs` guarda la cola de vistos hasta el siguiente latido. El panel gana `/avisos`.

**Tech Stack:** Postgres/plpgsql (SECURITY DEFINER con `search_path` fijo), Deno en la Edge Function, Node ESM sin dependencias en el escritorio (`node --test`), Next 15 + React 19, vitest para lógica pura, pgTAP para SQL.

**Spec:** `docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md` §8, más §3 (invariantes) y §4 (formato de directivas). ADR: `docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md`.

## Global Constraints

- **Carpeta y rama:** worktree `vim-pos-platform/`, rama `platform-avisos` **ya creada desde `origin/main`**. `main` está checkouteado en `vim-pos/`, así que aquí no se puede `git checkout main`.
- **Numeración de migraciones — ya chocó dos veces.** La spec dice 0106, pero **antes de fijarlo** correr `supabase migration list --linked` y **repetirlo justo antes de publicar**. Un número ya presente en el historial remoto hace que `db push` **salte la migración en silencio**. Si 0106 está tomado, subir el número aquí y en la spec.
- **Un aviso nunca puede impedir vender.** Se muestra, se cierra y ya. Si la lectura no se puede registrar, el aviso se cierra igual: perder el acuse es aceptable, dejar al cajero atrapado no.
- **Los avisos son texto plano.** Se guardan y se renderizan como texto, nunca como HTML.
- **Nada interno de VIM viaja en las directivas** (regla que la 0105 estableció al quitar `motivo`): un aviso lleva solo lo que el cliente debe leer.
- **`service_role` solo en Edge Functions y `apps/platform`.** `marcar_aviso_visto()` es la única pieza nueva para `authenticated`, y solo puede marcar avisos que le apliquen a su propio tenant.
- **Sin `any`**; español en dominio; archivos `kebab-case`, componentes `PascalCase`.
- **Toda escritura del panel llama `auditar()`** con motivo.
- Commits en español con prefijo, y al final:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0106_avisos_plataforma.sql` | tablas, `resolver_directivas` con avisos, `caja_latido` con lecturas, `marcar_aviso_visto` |
| `supabase/tests/0012_avisos.test.sql` | pgTAP: vigencia, alcance, lecturas, aislamiento |
| `supabase/functions/caja-latido/index.ts` | pasar `avisos_vistos` a la RPC |
| `desktop/src/directivas.mjs` | cola de avisos vistos pendientes de reportar |
| `desktop/src/directivas.test.mjs` | sus pruebas |
| `desktop/src/main.mjs` | mandar y limpiar la cola en cada latido |
| `desktop/src/ui-server.mjs` | `POST /__aviso-visto` |
| `apps/pos/app/lib/directivas.ts` | tipo `Aviso`, `avisosPendientes()`, `marcarAvisoVisto()` |
| `apps/pos/app/lib/__tests__/directivas.test.ts` | sus pruebas |
| `apps/pos/app/components/dialogo-avisos.tsx` | el diálogo que ve el cajero |
| `apps/pos/app/components/pantalla-inicio.tsx` | mostrarlo al abrir turno |
| `apps/pos/app/page.tsx` | mostrarlo al volver del bloqueo de pantalla |
| `apps/platform/app/api/avisos/route.ts` | GET lista con conteo de lecturas, POST crear, DELETE borrar |
| `apps/platform/app/avisos/page.tsx` | pantalla `/avisos` |
| `apps/platform/app/components/avisos-cliente.tsx` | avisos del cliente en su ficha |
| `apps/platform/app/components/barra-lateral.tsx` | entrada "Avisos" |
| `apps/platform/app/clientes/[id]/page.tsx` | montar `AvisosCliente` en Operación |
| `docs/diseno/platform.md`, `docs/diseno/pos.md` | documentar la pantalla y el diálogo |

---

### Task 0: Número de migración y línea base

- [ ] **Step 1: Confirmar que 0106 está libre**

```bash
cd "D:/Users/usuario/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos-platform"
supabase migration list --linked
```
Expected: la última versión remota es `0105`. Si aparece `0106`, renumerar todo este plan (y la spec §8/§9) al siguiente libre antes de escribir nada.

- [ ] **Step 2: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions && node --test desktop/src/*.test.mjs && supabase test db
```
Expected: todo en verde. Si la base local no tiene la 0105 (otra sesión pudo resetearla), aplicarla desde `supabase/migrations/0105_caja_latido_y_bloqueo.sql` y registrarla antes de seguir.

---

### Task 1: Migración 0106 — tablas, avisos en las directivas y acuses

**Files:**
- Create: `supabase/migrations/0106_avisos_plataforma.sql`
- Create: `supabase/tests/0012_avisos.test.sql`

**Interfaces:**
- Produces: tablas `avisos_plataforma` y `avisos_lecturas`; `resolver_directivas` devuelve `avisos` como array de `{id, nivel, titulo, cuerpo, requiere_confirmacion, vigente_hasta}` (máximo 10, sin los ya vistos por esa caja); `caja_latido(p_caja, p_version, p_so, p_ip, p_avisos_vistos uuid[])`; `marcar_aviso_visto(p_aviso uuid) RETURNS boolean`.
- Consumes: `resolver_directivas` y `caja_latido` de la 0105 (se redefinen con `CREATE OR REPLACE`; `caja_latido` **cambia de firma**, así que se hace `DROP FUNCTION` de la versión de 4 argumentos y se crea la de 5).

- [ ] **Step 1: Escribir la prueba pgTAP (falla porque no hay tablas)**

`supabase/tests/0012_avisos.test.sql`:

```sql
-- ============================================================================
-- Avisos a las cajas (spec 2026-09-04 §8, ADR 0014, migración 0106).
--
-- Lo que se protege: que un aviso llegue a quien le toca y solo mientras esté vigente, que un
-- aviso visto no vuelva, que las lecturas queden registradas por caja, y que un tenant no lea
-- los avisos dirigidos a otro.
-- ============================================================================
begin;
select plan(12);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('eeeeeeee-0000-0000-0000-0000000000f0', 'avi-uno', 'Avisos Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO')),
       ('ffffffff-0000-0000-0000-0000000000f0', 'avi-dos', 'Avisos Dos', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('eeeeeeee-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f0', 'A1', 'Suc A1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('eeeeeeee-0000-0000-0000-0000000000f0')
on conflict (tenant_id) do nothing;
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('eeeeeeee-0000-0000-0000-0000000000f2', 'eeeeeeee-0000-0000-0000-0000000000f0',
        'eeeeeeee-0000-0000-0000-0000000000f1', 1, 'Caja A1');

-- #1/#2 tablas nuevas
select has_table('avisos_plataforma');
select has_table('avisos_lecturas');

-- #3 sin avisos, las directivas traen un array vacío (no null)
select is((resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->>'avisos'),
          '[]', 'sin avisos el array va vacío');

-- Un aviso para ESE cliente y otro global.
insert into avisos_plataforma (id, tenant_id, nivel, titulo, cuerpo)
values ('11111111-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f0', 'info', 'Solo para ti', 'Cuerpo A');
insert into avisos_plataforma (id, tenant_id, nivel, titulo, cuerpo, requiere_confirmacion)
values ('22222222-0000-0000-0000-0000000000f0', null, 'warning', 'Para todos', 'Cuerpo B', true);

-- #4 le llegan los dos
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          2, 'llegan el suyo y el global');
-- #5 al OTRO cliente solo le llega el global
select is(jsonb_array_length(resolver_directivas('ffffffff-0000-0000-0000-0000000000f0', null)->'avisos'),
          1, 'al otro cliente solo le llega el global');

-- #6 el aviso lleva lo que el cajero necesita, y nada más
select is(((resolver_directivas('ffffffff-0000-0000-0000-0000000000f0', null)->'avisos'->0) - 'id' - 'nivel' - 'titulo' - 'cuerpo' - 'requiere_confirmacion' - 'vigente_hasta'),
          '{}'::jsonb, 'el aviso no lleva campos de más');

-- #7 un aviso vencido no llega
update avisos_plataforma set vigente_hasta = now() - interval '1 hour'
 where id = '11111111-0000-0000-0000-0000000000f0';
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso vencido no llega');
update avisos_plataforma set vigente_hasta = null where id = '11111111-0000-0000-0000-0000000000f0';

-- #8 uno que aún no empieza tampoco
update avisos_plataforma set vigente_desde = now() + interval '1 day'
 where id = '11111111-0000-0000-0000-0000000000f0';
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso futuro no llega todavía');
update avisos_plataforma set vigente_desde = now() - interval '1 minute' where id = '11111111-0000-0000-0000-0000000000f0';

-- #9 el latido registra las lecturas que le manda la caja
select ok((caja_latido('eeeeeeee-0000-0000-0000-0000000000f2', '0.4.61', 'Windows 11', null,
                       array['11111111-0000-0000-0000-0000000000f0']::uuid[])) ? 'avisos',
          'el latido con acuses devuelve directivas');
-- #10
select is((select count(*)::int from avisos_lecturas where aviso_id = '11111111-0000-0000-0000-0000000000f0'),
          1, 'la lectura quedó registrada');

-- #11 y ese aviso ya no vuelve a esa caja
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso visto no vuelve a esa caja');

-- #12 un id inventado en los acuses no revienta el latido
select lives_ok(
  $$ select caja_latido('eeeeeeee-0000-0000-0000-0000000000f2', '0.4.61', null, null,
                        array['99999999-9999-9999-9999-999999999999']::uuid[]) $$,
  'un acuse de un aviso inexistente se ignora');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

```bash
supabase test db
```
Expected: falla en #1, `avisos_plataforma` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0106_avisos_plataforma.sql`:

```sql
-- ============================================================================
-- 0106 — Avisos a las cajas (ADR 0014, entrega 3).
--
-- La 0105 dejó el hueco `avisos: []` en las directivas. Aquí se llena: VIM escribe un aviso
-- desde el panel —a un cliente o a todos— y viaja por el mismo latido, sin canal nuevo.
--
-- El acuse es por CAJA, no por tenant: un negocio con tres cajas necesita saber en cuál se leyó,
-- y un aviso visto en la barra no debe desaparecer de la caja del mostrador.
-- ============================================================================

CREATE TABLE avisos_plataforma (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = va a todos los clientes.
  tenant_id             uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nivel                 text NOT NULL CHECK (nivel IN ('info', 'warning', 'danger')),
  titulo                varchar(120) NOT NULL,
  cuerpo                text NOT NULL,
  requiere_confirmacion boolean NOT NULL DEFAULT false,
  vigente_desde         timestamptz NOT NULL DEFAULT now(),
  vigente_hasta         timestamptz NULL,
  creado_por            uuid NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz NULL
);
COMMENT ON TABLE avisos_plataforma IS
  'Avisos que VIM manda a las cajas por el latido. tenant_id NULL = a todos los clientes (ADR 0014).';
CREATE INDEX idx_avisos_vigentes ON avisos_plataforma (tenant_id, vigente_desde)
  WHERE deleted_at IS NULL;
ALTER TABLE avisos_plataforma ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

CREATE TABLE avisos_lecturas (
  aviso_id   uuid NOT NULL REFERENCES avisos_plataforma(id) ON DELETE CASCADE,
  -- NULL = leído en el POS web, donde no hay caja; se guarda quién lo leyó.
  caja_id    uuid NULL REFERENCES cajas(id) ON DELETE CASCADE,
  usuario_id uuid NULL,
  fecha      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, caja_id)
);
COMMENT ON TABLE avisos_lecturas IS 'Acuse de lectura de un aviso, por caja (ADR 0014).';
ALTER TABLE avisos_lecturas ENABLE ROW LEVEL SECURITY;     -- sin políticas: solo service_role

-- ── Las directivas llevan los avisos que esta caja no ha visto ──────────────
-- Se recorta a 10: si hay más, el cajero no los va a leer y lo que importa es que vea los
-- urgentes. Orden: primero `danger`, luego los más nuevos.
CREATE OR REPLACE FUNCTION resolver_directivas(p_tenant uuid, p_caja uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado    text;
  v_desde     timestamptz;
  v_mensaje   text;
  v_bloqueado boolean;
  v_avisos    jsonb;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  SELECT COALESCE(jsonb_agg(x ORDER BY x.orden, x.created_at DESC), '[]'::jsonb)
    INTO v_avisos
    FROM (
      SELECT a.id, a.nivel, a.titulo, a.cuerpo, a.requiere_confirmacion, a.vigente_hasta,
             a.created_at,
             CASE a.nivel WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END AS orden
        FROM avisos_plataforma a
       WHERE a.deleted_at IS NULL
         AND (a.tenant_id = p_tenant OR a.tenant_id IS NULL)
         AND a.vigente_desde <= now()
         AND (a.vigente_hasta IS NULL OR a.vigente_hasta > now())
         -- Sin caja (POS web y admin) no hay acuse por caja, así que van todos los vigentes.
         AND (p_caja IS NULL OR NOT EXISTS (
               SELECT 1 FROM avisos_lecturas l WHERE l.aviso_id = a.id AND l.caja_id = p_caja))
       ORDER BY orden, a.created_at DESC
       LIMIT 10
    ) AS x;
  -- `created_at` y `orden` solo sirven para ordenar: no viajan a la caja.
  SELECT COALESCE(jsonb_agg(e - 'created_at' - 'orden'), '[]'::jsonb)
    INTO v_avisos FROM jsonb_array_elements(v_avisos) AS e;

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    -- Sin `del_plan` ni `excepcion`: esa última lleva el `motivo` interno de VIM (ver 0105).
    'limites', COALESCE(limites_efectivos(p_tenant) - 'del_plan' - 'excepcion', '{}'::jsonb),
    'avisos',  v_avisos,
    'version', '{}'::jsonb    -- entrega 4
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;

-- ── El latido registra los acuses que trae la caja ──────────────────────────
-- Cambia de firma (gana p_avisos_vistos), así que se retira la de la 0105.
DROP FUNCTION IF EXISTS caja_latido(uuid, text, text, inet);
CREATE OR REPLACE FUNCTION caja_latido(
  p_caja uuid, p_version text DEFAULT NULL, p_so text DEFAULT NULL, p_ip inet DEFAULT NULL,
  p_avisos_vistos uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  UPDATE cajas
     SET ultimo_latido = now(),
         version_app   = COALESCE(left(p_version, 20), version_app),
         so            = COALESCE(left(p_so, 80), so),
         ultima_ip     = COALESCE(p_ip, ultima_ip)
   WHERE id = p_caja AND deleted_at IS NULL
   RETURNING tenant_id INTO v_tenant;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Acuses. El INSERT ... SELECT filtra por la propia tabla de avisos, así que un id inventado
  -- simplemente no inserta nada: un acuse inválido no puede tumbar el latido, que es lo que
  -- mantiene viva la señal de la caja.
  IF p_avisos_vistos IS NOT NULL AND array_length(p_avisos_vistos, 1) > 0 THEN
    INSERT INTO avisos_lecturas (aviso_id, caja_id)
    SELECT a.id, p_caja
      FROM avisos_plataforma a
     WHERE a.id = ANY (p_avisos_vistos)
       AND (a.tenant_id = v_tenant OR a.tenant_id IS NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN resolver_directivas(v_tenant, p_caja);
END;
$$;
COMMENT ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) IS
  'Sella que la caja está viva, guarda su versión, registra acuses de avisos y devuelve sus directivas (ADR 0014).';
REVOKE EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) TO service_role;

-- ── Acuse desde el POS web, donde no hay caja ───────────────────────────────
-- Solo puede marcar un aviso que le aplique a su propio tenant; devuelve false si no.
CREATE OR REPLACE FUNCTION marcar_aviso_visto(p_aviso uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL OR p_aviso IS NULL THEN RETURN false; END IF;
  INSERT INTO avisos_lecturas (aviso_id, caja_id, usuario_id)
  SELECT a.id, NULL, auth.uid()
    FROM avisos_plataforma a
   WHERE a.id = p_aviso AND (a.tenant_id = v_tenant OR a.tenant_id IS NULL)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;
COMMENT ON FUNCTION marcar_aviso_visto(uuid) IS
  'Acuse de lectura desde el POS web (sin caja). Solo avisos del propio tenant (ADR 0014).';
REVOKE EXECUTE ON FUNCTION marcar_aviso_visto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION marcar_aviso_visto(uuid) TO authenticated, service_role;
```

- [ ] **Step 4: Aplicar en local y correr las pruebas**

```bash
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/0106_avisos_plataforma.sql
docker exec supabase_db_vim-pos psql -U postgres -d postgres -Atc "insert into supabase_migrations.schema_migrations (version, name) values ('0106','avisos_plataforma') on conflict do nothing"
supabase test db
```
Expected: `0012_avisos.test.sql` 12/12 y el resto en verde. Si `0002_rls_cobertura` reclama las tablas nuevas, agregarlas a `_rls_exentas` con su justificación (son deny-all a propósito, como `tenant_limites`).

- [ ] **Step 5: Regenerar tipos y confirmar**

```bash
pnpm db:types
git add supabase/migrations/0106_avisos_plataforma.sql supabase/tests/ packages/db/src/database.types.ts
git commit -m "db: avisos a las cajas y acuses de lectura (0106, ADR 0014)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: La Edge Function pasa los acuses

**Files:**
- Modify: `supabase/functions/caja-latido/index.ts`

**Interfaces:**
- Consumes: `validarCuerpo(...).avisos_vistos` (ya existe desde la 0105) y la firma nueva de `caja_latido` (Task 1).

- [ ] **Step 1: Pasar el parámetro**

En la llamada a la RPC, agregar la línea:

```ts
    p_avisos_vistos: cuerpo.avisos_vistos.length > 0 ? cuerpo.avisos_vistos : null,
```

Y ampliar el comentario de cabecera del archivo: el cuerpo ya documenta `avisos_vistos`, ahora sí se usa.

- [ ] **Step 2: Probar contra la base local con un dispositivo real**

```bash
supabase functions serve caja-latido --no-verify-jwt --env-file supabase/functions/.env &
ANON=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' apps/platform/.env.local | cut -d= -f2- | tr -d '"\r')
# La clave del dispositivo de DEV vive en `supabase/seed.sql`; no se copia aquí para que
# este documento no cargue credenciales.
PASS=$(grep -m1 -oP "crypt[(]'[\\K][^']+" supabase/seed.sql)
T=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx\",\"password\":\"$PASS\"}" \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# Crear un aviso global y ver que llega
docker exec supabase_db_vim-pos psql -U postgres -d postgres -Atc "insert into avisos_plataforma (id,tenant_id,nivel,titulo,cuerpo) values ('33333333-0000-0000-0000-0000000000f0',null,'info','Prueba','Cuerpo de prueba') on conflict (id) do nothing"
curl -s -X POST http://127.0.0.1:54321/functions/v1/caja-latido -H "apikey: $ANON" -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" -d '{"version":"0.4.60"}' | python -m json.tool | head -30
# Acusarlo y comprobar que ya no vuelve
curl -s -X POST http://127.0.0.1:54321/functions/v1/caja-latido -H "apikey: $ANON" -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" -d '{"version":"0.4.60","avisos_vistos":["33333333-0000-0000-0000-0000000000f0"]}' \
  | python -c "import sys,json;print('avisos tras acusar:',json.load(sys.stdin)['directivas']['avisos'])"
```
Expected: el primer latido trae el aviso; el segundo lo acusa y devuelve `avisos: []`.

- [ ] **Step 3: Confirmar**

```bash
pnpm test:functions
git add supabase/functions/caja-latido
git commit -m "db: el latido registra los acuses de lectura que trae la caja

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Escritorio — cola de acuses

**Files:**
- Modify: `desktop/src/directivas.mjs`
- Modify: `desktop/src/directivas.test.mjs`
- Modify: `desktop/src/main.mjs`
- Modify: `desktop/src/ui-server.mjs`

**Interfaces:**
- Produces: el almacén gana `marcarVisto(id)`, `vistosPendientes()` y `limpiarVistos(ids)`; `POST /__aviso-visto` con cuerpo `{ id }`.
- Consumes: `crearAlmacenDirectivas` (0.4.60).

- [ ] **Step 1: Ampliar la prueba (falla)**

Añadir a `desktop/src/directivas.test.mjs`:

```js
test("guarda los acuses pendientes junto a las directivas", () => {
  const fs = fsFalso();
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs });
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0"); // repetido: no duplica
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
});

test("los acuses sobreviven a una directiva nueva", () => {
  const fs = fsFalso();
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs });
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.guardar({ acceso: { bloqueado: false }, avisos: [] });
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
});

test("limpiarVistos borra solo lo ya reportado", () => {
  const fs = fsFalso();
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs });
  a.marcarVisto("aaaa1111-0000-0000-0000-0000000000f0");
  a.marcarVisto("bbbb2222-0000-0000-0000-0000000000f0");
  a.limpiarVistos(["aaaa1111-0000-0000-0000-0000000000f0"]);
  assert.deepEqual(a.vistosPendientes(), ["bbbb2222-0000-0000-0000-0000000000f0"]);
});

test("un id que no es uuid se descarta", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.marcarVisto("no-es-uuid");
  assert.deepEqual(a.vistosPendientes(), []);
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test desktop/src/directivas.test.mjs
```
Expected: `a.marcarVisto is not a function`.

- [ ] **Step 3: Implementar la cola**

En `desktop/src/directivas.mjs`: añadir `const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` arriba, incluir `vistos: []` en el objeto que se persiste, y añadir al almacén:

```js
    /**
     * Anota que el cajero cerró un aviso. Se guarda en el mismo archivo y se reporta en el
     * siguiente latido: si se mandara al momento, un aviso leído sin internet se perdería, y el
     * cajero lo volvería a ver como si no lo hubiera cerrado.
     */
    marcarVisto(id) {
      if (typeof id !== "string" || !UUID.test(id)) return;
      const actual = leerCrudo();
      const vistos = Array.isArray(actual.vistos) ? actual.vistos : [];
      if (vistos.includes(id)) return;
      escribir({ ...actual, vistos: [...vistos, id].slice(-100) });
    },
    vistosPendientes() {
      const v = leerCrudo().vistos;
      return Array.isArray(v) ? v.filter((x) => typeof x === "string" && UUID.test(x)) : [];
    },
    /** Se llama DESPUÉS de que la nube confirmó el latido, no antes. */
    limpiarVistos(ids) {
      const actual = leerCrudo();
      const quedan = (Array.isArray(actual.vistos) ? actual.vistos : []).filter((x) => !ids.includes(x));
      escribir({ ...actual, vistos: quedan });
    },
```

Con dos helpers internos `leerCrudo()` (el JSON tal cual, `{}` si falla) y `escribir(obj)` (el `writeFileSync` con su try/catch), y `guardar()` reescrito para conservar `vistos`.

- [ ] **Step 4: Correr la prueba, pasa**

```bash
node --test desktop/src/directivas.test.mjs
```
Expected: 10 passed.

- [ ] **Step 5: Mandar y limpiar la cola en el latido**

En `desktop/src/main.mjs`, dentro de `latir()`:

```js
  const vistos = directivas.vistosPendientes();
  // …en el body: JSON.stringify({ version: app.getVersion(), so: `${os.type()} ${os.release()}`, avisos_vistos: vistos })
  // …tras guardar las directivas:
  if (vistos.length > 0) directivas.limpiarVistos(vistos);
```

La limpieza va **después** de que la nube confirmó: si el latido falla, los acuses se reintentan en el siguiente.

- [ ] **Step 6: Ruta para que el POS avise**

En `desktop/src/ui-server.mjs`, junto a las demás rutas de caja:

```js
      // CAJA: el cajero cerró un aviso. Se anota localmente y viaja en el siguiente latido.
      // POST con guarda de origen, como el resto de las rutas que escriben.
      if (!kds && req.method === "POST" && req.url.startsWith("/__aviso-visto")) {
        if (!mismaProcedencia(req, port)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Origen no permitido." }));
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        let id = null;
        try { id = JSON.parse(body || "{}").id ?? null; } catch { /* cuerpo inválido: se ignora */ }
        opts.avisoVisto?.(id);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }
```

Y en `main.mjs`, en las opciones de `startUiServer`: `avisoVisto: (id) => directivas.marcarVisto(id),`.

- [ ] **Step 7: Confirmar**

```bash
node --test desktop/src/*.test.mjs && node --check desktop/src/ui-server.mjs
git add desktop/
git commit -m "escritorio: cola de acuses de avisos, reportada en el siguiente latido

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: POS — el diálogo de avisos

**Files:**
- Modify: `apps/pos/app/lib/directivas.ts`
- Modify: `apps/pos/app/lib/__tests__/directivas.test.ts`
- Create: `apps/pos/app/components/dialogo-avisos.tsx`
- Modify: `apps/pos/app/components/pantalla-inicio.tsx`
- Modify: `apps/pos/app/page.tsx`

**Interfaces:**
- Produces: `type Aviso = { id: string; nivel: "info"|"warning"|"danger"; titulo: string; cuerpo: string; requiere_confirmacion: boolean; vigente_hasta: string | null }`; `avisosDe(d): Aviso[]`; `marcarAvisoVisto(id): Promise<void>`; `<DialogoAvisos avisos onCerrar />`.
- Consumes: `Directivas` y `leerDirectivas()` de la entrega 2; `/__aviso-visto` (Task 3) o `marcar_aviso_visto` (Task 1).

- [ ] **Step 1: Ampliar la prueba (falla)**

Añadir a `apps/pos/app/lib/__tests__/directivas.test.ts`:

```ts
import { avisosDe } from "../directivas";

describe("avisosDe", () => {
  const conAvisos = (avisos: unknown[]): Directivas => ({
    servidor_hora: null,
    acceso: { estado: "ACTIVO", bloqueado: false, bloquea_desde: null, mensaje: null },
    modulos: {}, limites: {}, avisos, version: {},
  });

  it("sin directivas no hay avisos", () => {
    expect(avisosDe(null)).toEqual([]);
  });

  it("descarta lo que no tiene la forma de un aviso", () => {
    expect(avisosDe(conAvisos([{ titulo: "sin id" }, "texto", null]))).toEqual([]);
  });

  it("acepta un aviso completo y normaliza el nivel desconocido a info", () => {
    const r = avisosDe(conAvisos([
      { id: "a1", nivel: "raro", titulo: "T", cuerpo: "C", requiere_confirmacion: true, vigente_hasta: null },
    ]));
    expect(r).toHaveLength(1);
    expect(r[0]!.nivel).toBe("info");
    expect(r[0]!.requiere_confirmacion).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @vim/pos test -- directivas
```
Expected: FAIL, `avisosDe` no existe.

- [ ] **Step 3: Implementar en `directivas.ts`**

```ts
export type NivelAviso = "info" | "warning" | "danger";
export type Aviso = {
  id: string; nivel: NivelAviso; titulo: string; cuerpo: string;
  requiere_confirmacion: boolean; vigente_hasta: string | null;
};

const NIVELES: NivelAviso[] = ["info", "warning", "danger"];

/** Los avisos que hay que enseñar. PURA. Descarta lo que no tenga forma de aviso: un JSON raro
 *  de la nube no puede tumbar la pantalla de un cajero. */
export function avisosDe(d: Directivas | null): Aviso[] {
  const xs = Array.isArray(d?.avisos) ? d!.avisos : [];
  return xs.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.titulo !== "string" || typeof o.cuerpo !== "string") return [];
    const nivel = NIVELES.includes(o.nivel as NivelAviso) ? (o.nivel as NivelAviso) : "info";
    return [{
      id: o.id, nivel, titulo: o.titulo, cuerpo: o.cuerpo,
      requiere_confirmacion: o.requiere_confirmacion === true,
      vigente_hasta: typeof o.vigente_hasta === "string" ? o.vigente_hasta : null,
    }];
  });
}

/** Acusa la lectura. En la caja lo anota el escritorio y viaja en el siguiente latido; en el POS
 *  web va directo por RPC. Nunca lanza: un acuse perdido no puede dejar al cajero atrapado. */
export async function marcarAvisoVisto(id: string): Promise<void> {
  try {
    const r = await fetch("/__aviso-visto", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (r.ok) return;
  } catch { /* POS web: esa ruta no existe */ }
  try { await deviceClient.rpc("marcar_aviso_visto", { p_aviso: id }); } catch { /* se reintenta al reabrir */ }
}
```

- [ ] **Step 4: Correr, pasa**

```bash
pnpm --filter @vim/pos test -- directivas
```
Expected: todas en verde.

- [ ] **Step 5: El diálogo**

`apps/pos/app/components/dialogo-avisos.tsx`: uno a uno, no una lista. Cabecera con el color del nivel (`info` → `accent-soft`, `warning` → `#F6EEDD`, `danger` → `#FBECEA`), título, cuerpo como texto plano con `whitespace-pre-wrap`, y un botón: **"Entendido"** si `requiere_confirmacion`, **"Cerrar"** si no. Al pulsarlo se llama `marcarAvisoVisto(id)` y se pasa al siguiente; al acabar, `onCerrar()`. Botones de 48 px de alto mínimo (regla táctil de `pos.md`). Sin `Escape` para cerrar cuando `requiere_confirmacion`: ahí el toque es el acuse.

- [ ] **Step 6: Mostrarlo donde toca**

- En `pantalla-inicio.tsx`: estado `avisos` cargado con `leerDirectivas().then(avisosDe)` al montar; se abre el diálogo si hay alguno. Esto cubre "al abrir turno", porque es la pantalla que el cajero ve tras el PIN.
- En `page.tsx`: al volver de `paso: "bloqueo"` (es decir, en `trasPin`), volver a leer los avisos. Un `key` en `PantallaTurno` que cambie al desbloquear basta para que se remonte y los relea.

- [ ] **Step 7: Verificar en el navegador**

Con el POS de desarrollo contra la base local: crear un aviso `warning` con confirmación para el tenant del fixture, entrar con PIN → aparece el diálogo → "Entendido" → desaparece; recargar → no vuelve; comprobar en la base que hay fila en `avisos_lecturas`.

```bash
pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test
git add apps/pos
git commit -m "feat(pos): diálogo de avisos de VIM con acuse de lectura

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Panel — pantalla `/avisos` y avisos en la ficha

**Files:**
- Create: `apps/platform/app/api/avisos/route.ts`
- Create: `apps/platform/app/avisos/page.tsx`
- Create: `apps/platform/app/components/avisos-cliente.tsx`
- Modify: `apps/platform/app/components/barra-lateral.tsx`
- Modify: `apps/platform/app/clientes/[id]/page.tsx`

**Interfaces:**
- Produces: `GET /api/avisos` → `{ avisos: { id, tenantId, tenantNombre, nivel, titulo, cuerpo, requiereConfirmacion, vigenteDesde, vigenteHasta, createdAt, vistos, cajasAlcance }[] }`; `POST /api/avisos` con `{ tenant_id?, nivel, titulo, cuerpo, requiere_confirmacion, vigente_hasta?, motivo }`; `DELETE /api/avisos?id=…&motivo=…`.
- Consumes: `autorizar()` y `auditar()` de `lib/server.ts`; `DialogoConfirmar` de la entrega 1.

- [ ] **Step 1: La API**

`apps/platform/app/api/avisos/route.ts`, con las tres rutas. En el GET, el conteo de lecturas se calcula así: `vistos` = filas de `avisos_lecturas` de ese aviso; `cajasAlcance` = cajas activas no borradas del tenant, o de todos los tenants activos si `tenant_id` es NULL. Validación del POST: `nivel` en la lista, `titulo` de 1 a 120 caracteres, `cuerpo` de 1 a 600, sin `<` (se guarda texto plano), `motivo` de al menos 10 caracteres. Todo auditado; para un aviso global, `auditar` no puede asentar sin `tenant_id`, así que **se registra con el tenant `NULL` en un campo del payload y se omite la auditoría por tenant**, dejando constancia en el log — o mejor: se audita una fila por cada tenant activo alcanzado, que es lo que permite responder después "a quién le llegó esto".

  > Decisión a tomar al implementar: la segunda opción es más fiel pero escribe N filas. Con el
  > número de clientes actual (3) es trivial; si algún día son cientos, se cambia por una sola
  > fila con la lista en el payload. Se implementa la segunda y se deja el comentario.

- [ ] **Step 2: La pantalla**

`apps/platform/app/avisos/page.tsx`: lista con pastilla de nivel, destinatario (nombre del cliente o "Todos los clientes"), vigencia, y **"visto por N de M cajas"**. Formulario de alta en un panel a la derecha o arriba, con selector de destinatario (buscador de cliente reusando `/api/tenants`), nivel, título, cuerpo con contador de caracteres, fecha de fin opcional y casilla de confirmación. Borrar abre `DialogoConfirmar`. **Un aviso `danger` a todos los clientes exige escribir `TODOS`** en vez del nombre de un cliente (`nombreEsperado="TODOS"`).

Añadir `{ href: "/avisos", label: "Avisos" }` a `NAV` en `barra-lateral.tsx`, entre Clientes y Facturación.

- [ ] **Step 3: Avisos en la ficha del cliente**

`avisos-cliente.tsx`: lista compacta de los avisos que le aplican (suyos y globales) con su estado de lectura, y un botón "Escribir aviso a este cliente" que abre el mismo formulario con el destinatario ya fijado. Se monta al final de la sección **Operación** de `clientes/[id]/page.tsx`.

- [ ] **Step 4: Verificar en el navegador**

Crear un aviso global `info` y otro `danger` para un cliente; comprobar que el `danger` global exige escribir `TODOS`; ver el contador de lecturas subir tras acusarlo desde el POS; borrar uno y ver que desaparece de la caja en el siguiente latido.

```bash
pnpm --filter @vim/platform typecheck && pnpm --filter @vim/platform test
git add apps/platform
git commit -m "feat(platform): pantalla de avisos y avisos por cliente en su ficha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Cierre — pruebas, seguridad, documentación y publicación

- [ ] **Step 1: Suite completa**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions
node --test desktop/src/*.test.mjs && node desktop/src/verify-sync-ciclo.mjs && supabase test db
```

- [ ] **Step 2: Prueba de extremo a extremo**

Desde el panel: aviso `warning` con confirmación a un cliente → en menos de 10 minutos aparece en su caja → "Entendido" → el contador del panel sube a 1 → el aviso no vuelve a esa caja → borrarlo desde el panel y comprobar que desaparece también para las cajas que no lo habían visto.

- [ ] **Step 3: Revisión de seguridad**

Invocar `security-review`. Puntos a mirar: que un tenant no pueda leer ni acusar avisos de otro (`marcar_aviso_visto` con un id ajeno debe devolver false y no insertar); que `/__aviso-visto` no acepte escrituras de fuera del equipo; que el cuerpo del aviso se renderice como texto en las tres apps; que las dos tablas sigan sin políticas de RLS.

- [ ] **Step 4: Documentación**

En `docs/diseno/platform.md`, describir `/avisos` y la regla de escribir `TODOS`. En `docs/diseno/pos.md`, el diálogo de avisos junto a los estados de suspensión.

- [ ] **Step 5: Publicar**

**Volver a comprobar el número de migración** (`supabase migration list --linked`) y la versión del escritorio en `main` antes de nada. Después:

```bash
supabase db push                       # desde ESTE worktree
supabase functions deploy caja-latido
git push -u origin platform-avisos
gh pr create --base main --title "Panel: avisos a las cajas (ADR 0014, entrega 3)" --body-file <cuerpo>
```

Tras el merge, publicar el escritorio con el número que corresponda: `npm run dist` (más de 10 minutos), `npm run release-manifest` con `VIM_UPDATE_URL`, **corregir los acentos del JSON a mano**, `gh release create`, y subir `latest.json` con `-H "cache-control: max-age=60"` para que el CDN no siga sirviendo el anterior.

- [ ] **Step 6: Memoria**

Actualizar `../MEMORY.md` y `project_platform_centro_control.md` con la entrega 3 en producción y lo que queda de la 4.

---

## Self-review (hecho al escribir)

- **Cobertura de la spec §8:** 8.1 migración y RLS → Task 1; el paso de `avisos_vistos` que la spec daba por hecho en `caja_latido` no existía (la 0105 lo validaba y lo ignoraba) → Tasks 1 y 2; 8.2 panel → Task 5; 8.3 caja y POS → Tasks 3 y 4.
- **Diferencias deliberadas con la spec:** `avisos_lecturas` gana `usuario_id` (la spec solo tenía `aviso_id, caja_id, fecha`) porque en el POS web no hay caja y sin eso el acuse no diría quién leyó. La clave primaria sigue siendo `(aviso_id, caja_id)`, así que en el POS web un segundo usuario del mismo tenant no puede duplicar la fila — **limitación conocida y aceptada**: el acuse del POS web es por tenant, no por persona.
- **Consistencia:** `Aviso` se define en `apps/pos/app/lib/directivas.ts` (Task 4) y lo consume `dialogo-avisos.tsx`; `marcarVisto`/`vistosPendientes`/`limpiarVistos` se definen en la Task 3 y los usa `main.mjs` en el mismo paso; el orden `danger → warning → info` es el mismo en SQL (Task 1) y en el diálogo (Task 4).
- **Riesgo:** `caja_latido` cambia de firma. Una caja en 0.4.60 sigue llamando sin `avisos_vistos` y el `DEFAULT NULL` la cubre, pero **la Edge Function y la migración deben desplegarse juntas**: si se despliega la función nueva contra la base vieja, la RPC falla por argumento desconocido. El orden del paso 5 (migración primero) lo respeta.
