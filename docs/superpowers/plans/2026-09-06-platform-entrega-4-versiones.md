# Panel de plataforma · Entrega 4 — versiones de la caja — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver desde el panel qué versión corre cada caja de cada cliente, publicar una versión nueva sin tocar la terminal, y poder exigir una versión mínima.

**Architecture:** Una migración (0108) crea `versiones_caja` y hace que `resolver_directivas` llene el hueco `version: {}` que la 0105 dejó, con la recomendada y la mínima. El panel gana `/versiones`: arriba el parque de cajas con su versión, abajo el historial; publicar es pegar el `latest.json` que genera `release-manifest`, y el servidor del panel lo valida, lo guarda y lo sube al bucket (con la caché corta que ya sabemos que hace falta). En el escritorio, `directivas.mjs` compara la versión local con la recomendada y con la mínima; por debajo de la mínima, y solo si VIM lo encendió, el POS usa la misma pantalla de bloqueo con un botón para instalar.

**Tech Stack:** Postgres/plpgsql (SECURITY DEFINER con `search_path` fijo), Next 15 + React 19 en el panel, Node ESM sin dependencias en el escritorio (`node --test`), vitest para lógica pura, pgTAP para SQL, Supabase Storage por API REST.

**Spec:** `docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md` §9, más §3 (invariantes), §4 (formato de directivas) y §7 (compatibilidad). ADR: `docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md`.

## Global Constraints

- **Carpeta y rama:** worktree `vim-pos-platform/`, rama nueva `platform-versiones` creada **desde `origin/main`** (`main` está checkouteado en `vim-pos/`, aquí no se puede `git checkout main`).
- **Numeración de migraciones — ya chocó TRES veces.** La spec dice 0107, pero ya lo tomó `0107_generar_folio_no_repite` de otra sesión: esta va como **0108**. Comprobar igualmente con `supabase migration list --linked` **antes de fijarlo y otra vez antes de publicar**. Un número ya presente en el historial remoto hace que `db push` **salte la migración en silencio**. Igual con la versión del escritorio: mirar `desktop/package.json` en `main`, no asumir.
- **Nada de esto puede dejar una caja sin vender por accidente.** El bloqueo por versión es la única parte de todo el ADR que la caja decide **localmente**, comparando su versión con la mínima; a diferencia de la suspensión, una directiva vieja **sí** puede bloquear estando sin internet. Por eso: viene apagado, se enciende con confirmación escrita, y la pantalla de bloqueo **siempre** ofrece el botón de instalar y el teléfono de soporte.
- **El actualizador de la caja no cambia.** Sigue leyendo el mismo `latest.json` de siempre; lo que cambia es quién lo escribe. Una caja vieja que no entienda `directivas.version` sigue actualizándose como hoy.
- **La caché del CDN miente.** Tras subir `latest.json`, la URL pública sirve la copia anterior hasta un minuto. Subir con `-H "cache-control: max-age=60"` y **verificar la propagación** antes de dar la publicación por buena.
- **`service_role` solo en Edge Functions y `apps/platform`**; nada nuevo para `authenticated`.
- **Sin `any`**; español en dominio; archivos `kebab-case`, componentes `PascalCase`.
- **Toda escritura del panel llama `auditar()`** con motivo. Publicar una versión y exigir una mínima afectan a todos los clientes: se asienta **una fila por cliente**, como en los avisos globales.
- Commits en español con prefijo, y al final:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0108_versiones_caja.sql` | tabla `versiones_caja`, índice único de la mínima, `resolver_directivas` con `version` |
| `supabase/tests/0013_versiones.test.sql` | pgTAP: recomendada, mínima, bloqueo por fecha, una sola mínima |
| `apps/platform/app/api/versiones/route.ts` | GET (parque de cajas + historial), POST (publicar), PATCH (mínima / retirar) |
| `apps/platform/app/lib/manifiesto.ts` | `validarManifiesto()` pura + su prueba |
| `apps/platform/app/lib/__tests__/manifiesto.test.ts` | sus pruebas |
| `apps/platform/app/versiones/page.tsx` | pantalla `/versiones` |
| `apps/platform/app/components/barra-lateral.tsx` | entrada "Versiones" |
| `desktop/src/directivas.mjs` | `estadoDeVersion()` puro: al día / hay actualización / por debajo de la mínima |
| `desktop/src/directivas.test.mjs` | sus pruebas |
| `desktop/src/main.mjs` | avisar de la recomendada tras el latido; exponer el bloqueo por versión |
| `apps/pos/app/lib/directivas.ts` | `evaluarAcceso` distingue el motivo `version` |
| `apps/pos/app/components/pantalla-bloqueada.tsx` | variante "actualiza para continuar" con botón de instalar |
| `docs/diseno/platform.md`, `docs/diseno/pos.md` | documentar la pantalla y la variante |
| `docs/decisiones/0014-…md` | consecuencia nueva: el bloqueo por versión se decide en la caja |

---

### Task 0: Rama, numeración y línea base

- [ ] **Step 1: Rama nueva desde `origin/main`**

```bash
cd "D:/Users/usuario/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos-platform"
git fetch origin main && git checkout -b platform-versiones origin/main
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Comprobar el número de migración y la versión del escritorio**

```bash
supabase migration list --linked | tail -3
git show origin/main:desktop/package.json | grep -m1 '"version"'
```
Expected: la última remota es `0107` (si no, subir el número en todo este plan y en la spec §9) y el escritorio está en `0.4.61` (la versión de esta entrega será la siguiente libre).

- [ ] **Step 3: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions && node --test desktop/src/*.test.mjs && supabase test db
```
Expected: todo en verde. Si la base local no tiene la 0107, aplicarla desde su archivo y registrarla antes de seguir.

---

### Task 1: Migración 0108 — catálogo de versiones y directivas

**Files:**
- Create: `supabase/migrations/0108_versiones_caja.sql`
- Create: `supabase/tests/0013_versiones.test.sql`

**Interfaces:**
- Produces: tabla `versiones_caja`; `resolver_directivas` devuelve `version` con `{ recomendada, minima, url, sha512, notas, bloquea_bajo_minima, bloquea_desde }`.
- Consumes: `resolver_directivas` de la 0106/0107 (se redefine con `CREATE OR REPLACE`; **no cambia de firma**, así que no hay que redesplegar `caja-latido`).

- [ ] **Step 1: Escribir la prueba pgTAP (falla porque no hay tabla)**

`supabase/tests/0013_versiones.test.sql`:

```sql
-- ============================================================================
-- Versiones de la caja (spec 2026-09-04 §9, ADR 0014, migración 0108).
--
-- Lo que se protege: que la recomendada sea la más alta PUBLICADA, que solo pueda haber una
-- mínima, y que el bloqueo por versión solo se anuncie cuando VIM lo encendió y llegó su fecha.
-- ============================================================================
begin;
select plan(11);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('aaaaaaaa-0000-0000-0000-00000000ff00', 'ver-uno', 'Versiones Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO'))
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('aaaaaaaa-0000-0000-0000-00000000ff00')
on conflict (tenant_id) do nothing;

-- #1 tabla nueva
select has_table('versiones_caja');

-- #2 sin versiones publicadas, el bloque va vacío pero existe
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->>'version'), '{}',
          'sin versiones publicadas el bloque va vacío');

insert into versiones_caja (version, url, sha512, notas, fecha)
values ('0.4.60', 'https://github.com/x/y/releases/download/v0.4.60/a.exe', repeat('a', 128), 'vieja', '2026-09-06'),
       ('0.4.61', 'https://github.com/x/y/releases/download/v0.4.61/b.exe', repeat('b', 128), 'nueva', '2026-09-06');

-- #3 la recomendada es la más alta publicada
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'recomendada'),
          '0.4.61', 'la recomendada es la más alta publicada');
-- #4 y lleva su url para que la caja pueda instalarla
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'url'),
          'https://github.com/x/y/releases/download/v0.4.61/b.exe', 'la recomendada lleva su url');

-- #5 una versión despublicada no se recomienda
update versiones_caja set publicada = false where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'recomendada'),
          '0.4.60', 'una versión despublicada no se recomienda');
update versiones_caja set publicada = true where version = '0.4.61';

-- #6 sin mínima marcada, no hay mínima
select ok((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'minima') is null,
          'sin mínima marcada no se anuncia ninguna');

-- #7 se marca una mínima
update versiones_caja set es_minima = true where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'minima'),
          '0.4.61', 'la mínima se anuncia');

-- #8 solo puede haber UNA mínima a la vez
select throws_ok(
  $$ update versiones_caja set es_minima = true where version = '0.4.60' $$,
  '23505', NULL, 'no puede haber dos versiones mínimas');

-- #9 por defecto la mínima NO bloquea
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'false', 'la mínima no bloquea por defecto');

-- #10 encendido pero con fecha futura, tampoco
update versiones_caja set bloquea_bajo_minima = true, bloquea_desde = now() + interval '2 days'
 where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'false', 'con fecha futura todavía no bloquea');

-- #11 pasada la fecha, sí
update versiones_caja set bloquea_desde = now() - interval '1 minute' where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'true', 'pasada la fecha el bloqueo por versión se anuncia');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

```bash
supabase test db
```
Expected: falla en #1, `versiones_caja` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0108_versiones_caja.sql`:

```sql
-- ============================================================================
-- 0108 — Catálogo de versiones del escritorio (ADR 0014, entrega 4).
--
-- Publicar una actualización era: compilar, generar latest.json, subirlo con curl y crear el
-- release a mano. Tres de esos pasos pasan al panel, y de paso queda registro de qué se publicó
-- y cuándo. El actualizador de la caja NO cambia: sigue leyendo el mismo latest.json.
--
-- `resolver_directivas` llena aquí el último hueco que la 0105 dejó (`version: {}`).
-- ============================================================================

CREATE TABLE versiones_caja (
  version             text PRIMARY KEY,
  url                 text NOT NULL,
  sha512              char(128) NOT NULL,
  notas               text NULL,
  fecha               date NULL,
  -- Despublicar retira una versión de la recomendación sin borrar su historia.
  publicada           boolean NOT NULL DEFAULT true,
  es_minima           boolean NOT NULL DEFAULT false,
  -- Apagado a propósito: exigir una mínima que BLOQUEA es lo más agresivo de todo el ADR.
  bloquea_bajo_minima boolean NOT NULL DEFAULT false,
  bloquea_desde       timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE versiones_caja IS
  'Versiones publicadas del escritorio. La caja las recibe por las directivas del latido (ADR 0014).';
COMMENT ON COLUMN versiones_caja.es_minima IS
  'La versión por debajo de la cual una caja se considera desactualizada. Solo una a la vez.';
-- Una sola mínima. Índice parcial para que las demás filas no compitan por el valor `false`.
CREATE UNIQUE INDEX uq_version_minima ON versiones_caja ((true)) WHERE es_minima;
ALTER TABLE versiones_caja ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

-- ── Las directivas anuncian qué versión debería correr la caja ──────────────
-- Ordenar por semver, no por texto: como cadena, '0.4.9' > '0.4.61' y la caja se quedaría atrás
-- justo cuando más importa. `string_to_array(...)::int[]` compara número a número.
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
  v_version   jsonb := '{}'::jsonb;
  v_rec       record;
  v_min       record;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'id', x.id, 'nivel', x.nivel, 'titulo', x.titulo, 'cuerpo', x.cuerpo,
             'requiere_confirmacion', x.requiere_confirmacion, 'vigente_hasta', x.vigente_hasta)
             ORDER BY x.orden, x.created_at DESC),
           '[]'::jsonb)
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
         AND (p_caja IS NULL OR NOT EXISTS (
               SELECT 1 FROM avisos_lecturas l WHERE l.aviso_id = a.id AND l.caja_id = p_caja))
       ORDER BY orden, a.created_at DESC
       LIMIT 10
    ) AS x;

  SELECT v.version, v.url, v.sha512, v.notas INTO v_rec
    FROM versiones_caja v WHERE v.publicada
   ORDER BY string_to_array(v.version, '.')::int[] DESC LIMIT 1;
  SELECT v.version, v.bloquea_bajo_minima, v.bloquea_desde INTO v_min
    FROM versiones_caja v WHERE v.es_minima LIMIT 1;

  IF v_rec.version IS NOT NULL OR v_min.version IS NOT NULL THEN
    v_version := jsonb_build_object(
      'recomendada', v_rec.version,
      'url',         v_rec.url,
      'sha512',      v_rec.sha512,
      'notas',       v_rec.notas,
      'minima',      v_min.version,
      -- Solo `true` cuando VIM lo encendió Y llegó la fecha. La caja no calcula esto.
      'bloquea_bajo_minima', COALESCE(v_min.bloquea_bajo_minima, false)
                             AND v_min.bloquea_desde IS NOT NULL
                             AND v_min.bloquea_desde <= now(),
      'bloquea_desde', v_min.bloquea_desde);
  END IF;

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    'limites', COALESCE(limites_efectivos(p_tenant) - 'del_plan' - 'excepcion', '{}'::jsonb),
    'avisos',  v_avisos,
    'version', v_version
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;
```

- [ ] **Step 4: Aplicar y correr las pruebas**

```bash
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/0108_versiones_caja.sql
docker exec supabase_db_vim-pos psql -U postgres -d postgres -Atc "insert into supabase_migrations.schema_migrations (version, name) values ('0108','versiones_caja') on conflict do nothing"
supabase test db
```
Expected: `0013_versiones.test.sql` 11/11 y el resto en verde. `versiones_caja` no tiene `tenant_id`, así que `0002_rls_cobertura` no debería reclamarla; si lo hace, añadirla a `_rls_exentas` con su justificación.

- [ ] **Step 5: Regenerar tipos y confirmar**

```bash
pnpm db:types
git add supabase/ packages/db/src/database.types.ts
git commit -m "db: catálogo de versiones del escritorio y directivas de versión (0108, ADR 0014)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Validación del manifiesto (pura, probada)

**Files:**
- Create: `apps/platform/app/lib/manifiesto.ts`
- Create: `apps/platform/app/lib/__tests__/manifiesto.test.ts`

**Interfaces:**
- Produces: `validarManifiesto(texto: string, hostPermitido: string): { ok: true; manifiesto: Manifiesto } | { ok: false; error: string }` con `type Manifiesto = { version: string; url: string; sha512: string; notas: string; fecha: string | null }`.

- [ ] **Step 1: Escribir la prueba**

`apps/platform/app/lib/__tests__/manifiesto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarManifiesto } from "../manifiesto";

const HOST = "github.com";
const bueno = JSON.stringify({
  version: "0.4.62",
  url: "https://github.com/Fermin03/vim-pos/releases/download/v0.4.62/VIM.POS.Setup.0.4.62.exe",
  sha512: "a".repeat(128),
  notas: "Notas con acentos: versión y configuración.",
  fecha: "2026-09-06",
});

describe("validarManifiesto", () => {
  it("acepta un manifiesto correcto", () => {
    const r = validarManifiesto(bueno, HOST);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifiesto.version).toBe("0.4.62");
  });

  it("rechaza lo que no es JSON", () => {
    expect(validarManifiesto("{no es json", HOST).ok).toBe(false);
  });

  it("exige versión semver de tres números", () => {
    expect(validarManifiesto(bueno.replace('"0.4.62"', '"0.4"'), HOST).ok).toBe(false);
    expect(validarManifiesto(bueno.replace('"0.4.62"', '"v0.4.62"'), HOST).ok).toBe(false);
  });

  it("exige sha512 de 128 hex: sin él no se instala nada verificable", () => {
    expect(validarManifiesto(bueno.replace("a".repeat(128), "abc"), HOST).ok).toBe(false);
    expect(validarManifiesto(bueno.replace("a".repeat(128), "z".repeat(128)), HOST).ok).toBe(false);
  });

  it("rechaza una url fuera del host de releases", () => {
    const malo = bueno.replace("github.com", "ejemplo.com");
    const r = validarManifiesto(malo, HOST);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/host|dominio/i);
  });

  it("rechaza una url que no es https", () => {
    expect(validarManifiesto(bueno.replace("https://", "http://"), HOST).ok).toBe(false);
  });

  it("exige que la url contenga la versión: pegar el manifiesto de otra compilación es el error fácil", () => {
    const cruzado = bueno.replace("v0.4.62/VIM.POS.Setup.0.4.62.exe", "v0.4.61/VIM.POS.Setup.0.4.61.exe");
    expect(validarManifiesto(cruzado, HOST).ok).toBe(false);
  });

  it("conserva los acentos de las notas", () => {
    const r = validarManifiesto(bueno, HOST);
    if (r.ok) expect(r.manifiesto.notas).toContain("versión");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @vim/platform test -- manifiesto
```
Expected: FAIL, no encuentra `../manifiesto`.

- [ ] **Step 3: Implementar**

`apps/platform/app/lib/manifiesto.ts`: función pura, sin dependencias. Valida en este orden y devuelve el primer error en español: JSON parseable → `version` con `/^\d+\.\d+\.\d+$/` → `url` https y con el host permitido → `url` contiene la versión → `sha512` con `/^[0-9a-f]{128}$/i` → `notas` string (o vacío) → `fecha` `YYYY-MM-DD` u opcional.

Comentario que debe quedar escrito:

```ts
/**
 * El manifiesto es lo único que decide qué binario instalan TODAS las cajas, así que aquí no se
 * confía en nada. Dos comprobaciones que parecen de más y no lo son:
 *
 *   · la url tiene que contener la versión — pegar el latest.json de otra compilación es el error
 *     fácil de cometer a las once de la noche, y publicaría un instalador viejo como si fuera nuevo;
 *   · el host tiene que ser el de releases — sin eso, un despiste apunta a las cajas de todos los
 *     clientes a un binario que no controlamos.
 *
 * El sha512 no es negociable (CN-008): sin él la caja instalaría cualquier cosa sin verificar.
 */
```

- [ ] **Step 4: Correr, pasa, confirmar**

```bash
pnpm --filter @vim/platform test -- manifiesto
git add apps/platform/app/lib
git commit -m "feat(platform): validación del manifiesto de actualización, pura y probada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: API de versiones

**Files:**
- Create: `apps/platform/app/api/versiones/route.ts`
- Modify: `apps/platform/.env.local` y las variables de Vercel (documentar `PLATFORM_RELEASES_HOST`)

**Interfaces:**
- Produces: `GET /api/versiones` → `{ versiones: [...], cajas: [{ id, nombre, cliente, tenantId, sucursal, versionApp, so, ultimoLatido, desactualizada }] }`; `POST` (publicar, cuerpo `{ manifiesto: string, motivo: string }`); `PATCH` (`{ accion: "marcar_minima" | "quitar_minima" | "despublicar" | "bloquear" | "no_bloquear", version, bloquea_desde?, motivo }`).
- Consumes: `validarManifiesto` (Task 2), `autorizar`/`auditar`, Supabase Storage.

- [ ] **Step 1: GET — parque de cajas e historial**

Une `cajas` (activas, no borradas) con su sucursal y su cliente, y marca `desactualizada` comparando `version_app` con la mínima vigente (`null` = anterior a 0.4.60, que se muestra aparte y **no** cuenta como desactualizada por versión: no late). Devuelve también `versiones_caja` ordenada por semver descendente.

- [ ] **Step 2: POST — publicar**

Valida con `validarManifiesto` usando `process.env.PLATFORM_RELEASES_HOST ?? "github.com"`; exige `motivo` de al menos 10 caracteres; inserta en `versiones_caja` (`ON CONFLICT (version) DO UPDATE` para poder corregir una publicación); y **sube el JSON al bucket**:

```ts
  // Se re-serializa aquí en vez de reenviar el texto pegado: el script `release-manifest` escribe
  // las notas con los acentos rotos, y esto lo arregla de paso. La caché corta es obligatoria: sin
  // ella el CDN sirve el manifiesto anterior hasta un minuto y parece que la publicación no surtió
  // efecto (pasó en las entregas 2 y 3).
  const cuerpo = JSON.stringify(manifiesto, null, 2) + "\n";
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/actualizaciones/latest.json`, {
    method: "PUT",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,     // obligatorio: sin él Storage rechaza la clave
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "cache-control": "max-age=60",
      "x-upsert": "true",
    },
    body: cuerpo,
  });
  if (!r.ok) return NextResponse.json({ error: "STORAGE_ERROR", detalle: await r.text() }, { status: 502 });
```

Responde `{ ok: true, version, avisoCache: true }` para que la pantalla pueda decir que el CDN tarda hasta un minuto. Audita una fila por cliente vivo (helper igual al de avisos).

- [ ] **Step 3: PATCH — mínima, bloqueo y despublicar**

`marcar_minima` limpia la anterior y marca la nueva en una sola sentencia (el índice único lo exige). `bloquear` exige `bloquea_desde` futura y motivo. `despublicar` pone `publicada = false`. Todo auditado por cliente.

- [ ] **Step 4: Probar a mano**

```bash
K=$(grep -m1 '^PLATFORM_PROVISION_KEY=' apps/platform/.env.local | cut -d= -f2- | tr -d '"\r')
curl -s -H "X-Platform-Key: $K" localhost:3002/api/versiones | python -m json.tool | head -30
curl -s -X POST -H "X-Platform-Key: $K" -H "Content-Type: application/json" localhost:3002/api/versiones \
  -d "{\"manifiesto\": $(python -c "import json;print(json.dumps(open('desktop/dist/latest.json').read()))"), \"motivo\":\"publicación de prueba local\"}"
```
Expected: el GET lista las cajas con su versión; el POST responde `ok:true` y el objeto del bucket local cambia.

- [ ] **Step 5: Confirmar**

```bash
pnpm --filter @vim/platform typecheck
git add apps/platform/app/api
git commit -m "feat(platform): API para publicar versiones y exigir una mínima

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Pantalla `/versiones`

**Files:**
- Create: `apps/platform/app/versiones/page.tsx`
- Modify: `apps/platform/app/components/barra-lateral.tsx`

- [ ] **Step 1: La pantalla**

Tres bloques, en este orden:

1. **El parque.** Tabla de todas las cajas de todos los clientes: cliente, sucursal, caja, versión, SO, último latido. Filtro **"solo desactualizadas"**. Las que no laten (versión `null`) van en gris y aparte, con la leyenda "anterior a 0.4.60"; no están caídas, solo sin actualizar. Arriba, tres cifras: cajas al día, desactualizadas, sin latido.
2. **Publicar una versión.** Un `textarea` donde se pega el `latest.json` que generó `release-manifest`, con el recordatorio de dónde sale (`desktop/dist/latest.json`). Al enviar, `DialogoConfirmar` con motivo y escribiendo `TODOS` — publicar afecta a todas las cajas. Tras publicar, un aviso en pantalla: *"El CDN puede seguir sirviendo la versión anterior hasta un minuto."*
3. **Historial.** Las versiones publicadas, con su fecha, si es la mínima y si bloquea. Acciones por fila: marcar como mínima, exigirla (bloquear), dejar de exigirla, despublicar.

- [ ] **Step 2: Exigir una mínima**

Marcar mínima pide motivo y el nombre `TODOS`. **Encender el bloqueo** pide además una fecha y escribir `BLOQUEAR`, con esta advertencia en el diálogo:

> A partir de esa fecha, una caja por debajo de la versión mínima **no podrá vender** hasta actualizarse. La pantalla le ofrece el botón de instalar, pero si esa caja se queda sin internet no podrá salir del bloqueo sola.

Añadir `{ href: "/versiones", label: "Versiones" }` a `NAV`, después de "Avisos".

- [ ] **Step 3: Verificar en el navegador**

Publicar el `latest.json` local, ver la fila nueva en el historial, marcarla como mínima, comprobar que la caja del fixture aparece como desactualizada si su versión es menor, y que encender el bloqueo exige la fecha y la palabra.

```bash
pnpm --filter @vim/platform typecheck && pnpm --filter @vim/platform test
git add apps/platform
git commit -m "feat(platform): pantalla de versiones con el parque de cajas y publicación

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Escritorio — actuar sobre la versión

**Files:**
- Modify: `desktop/src/directivas.mjs`
- Modify: `desktop/src/directivas.test.mjs`
- Modify: `desktop/src/main.mjs`

**Interfaces:**
- Produces: `estadoDeVersion(directivas, versionActual)` → `{ hayNueva: boolean; recomendada: string|null; url: string|null; sha512: string|null; bloqueaPorVersion: boolean }`. Función **pura**.

- [ ] **Step 1: Escribir la prueba**

Añadir a `desktop/src/directivas.test.mjs`:

```js
import { estadoDeVersion } from "./directivas.mjs";

const conVersion = (v) => ({ acceso: { bloqueado: false }, version: v });

test("sin bloque de versión no hay nada que hacer", () => {
  const r = estadoDeVersion(normalizar(conVersion({})), "0.4.61");
  assert.equal(r.hayNueva, false);
  assert.equal(r.bloqueaPorVersion, false);
});

test("una recomendada más nueva se anuncia", () => {
  const r = estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.62", url: "u", sha512: "s" })), "0.4.61");
  assert.equal(r.hayNueva, true);
  assert.equal(r.recomendada, "0.4.62");
});

test("una recomendada igual o vieja no se anuncia", () => {
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.61" })), "0.4.61").hayNueva, false);
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.60" })), "0.4.61").hayNueva, false);
});

test("compara por número, no por texto: 0.4.9 es MENOR que 0.4.61", () => {
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.9" })), "0.4.61").hayNueva, false);
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.61" })), "0.4.9").hayNueva, true);
});

test("por debajo de la mínima bloquea SOLO si la nube lo encendió", () => {
  const bajo = { minima: "0.4.62", bloquea_bajo_minima: true };
  assert.equal(estadoDeVersion(normalizar(conVersion(bajo)), "0.4.61").bloqueaPorVersion, true);
  const apagado = { minima: "0.4.62", bloquea_bajo_minima: false };
  assert.equal(estadoDeVersion(normalizar(conVersion(apagado)), "0.4.61").bloqueaPorVersion, false);
});

test("estando al día o por encima de la mínima nunca bloquea", () => {
  const v = { minima: "0.4.60", bloquea_bajo_minima: true };
  assert.equal(estadoDeVersion(normalizar(conVersion(v)), "0.4.61").bloqueaPorVersion, false);
});

test("sin directivas no bloquea: la falta de datos nunca deja a una caja sin vender", () => {
  assert.equal(estadoDeVersion(DIRECTIVAS_VACIAS, "0.4.61").bloqueaPorVersion, false);
});
```

- [ ] **Step 2: Correr, falla; implementar; correr, pasa**

`estadoDeVersion` reutiliza la comparación semver. **Se copia la lógica de `esMasNueva` en `directivas.mjs` en vez de importarla de `updater.mjs`**, porque ese módulo se usará también desde el POS a través de `/__directivas` y no debe arrastrar el descargador; son cuatro líneas y se documenta el porqué.

- [ ] **Step 3: Cablearlo en `main.mjs`**

Tras guardar las directivas en `latir()`:

```js
  // Si la nube recomienda una versión más nueva, se avisa YA en vez de esperar al chequeo horario
  // del feed. Es el mismo flujo de siempre: notificación del sistema + entrada en la bandeja.
  const ver = estadoDeVersion(directivas.leer().directivas, app.getVersion());
  if (ver.hayNueva && !updateInfo) revisarActualizacion().catch(() => {});
```

Y en la respuesta de `/__directivas`, añadir el bloqueo por versión al objeto `acceso`, para que el POS use la misma pantalla:

```js
      directivas: () => {
        const { directivas: d, recibidoIso } = directivas.leer();
        const ver = estadoDeVersion(d, app.getVersion());
        // El bloqueo por versión se decide AQUÍ, comparando con la versión instalada, y se
        // presenta con el mismo campo que la suspensión para que el POS no necesite dos caminos.
        const acceso = ver.bloqueaPorVersion
          ? { ...d.acceso, bloqueado: true, motivo: "version", mensaje: "Actualiza VIM POS para poder seguir vendiendo." }
          : d.acceso;
        return { disponible: true, recibido: recibidoIso, directivas: { ...d, acceso } };
      },
```

- [ ] **Step 4: Confirmar**

```bash
node --test desktop/src/*.test.mjs && node desktop/src/verify-sync-ciclo.mjs
git add desktop/
git commit -m "escritorio: avisar de la versión recomendada y bloquear por debajo de la mínima

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: POS — la pantalla de bloqueo por versión

**Files:**
- Modify: `apps/pos/app/lib/directivas.ts`
- Modify: `apps/pos/app/lib/__tests__/directivas.test.ts`
- Modify: `apps/pos/app/components/pantalla-bloqueada.tsx`
- Modify: `apps/pos/app/page.tsx`

- [ ] **Step 1: `evaluarAcceso` distingue el motivo**

Añadir `motivo?: "version"` al tipo del acceso y devolverlo en el resultado. Prueba nueva:

```ts
it("distingue el bloqueo por versión del de suspensión", () => {
  const d = con({ estado: "ACTIVO", bloqueado: true, mensaje: "Actualiza VIM POS." });
  (d.acceso as { motivo?: string }).motivo = "version";
  const r = evaluarAcceso(d, AHORA);
  expect(r.nivel).toBe("bloqueado");
  expect(r.motivo).toBe("version");
});
```

- [ ] **Step 2: La variante de la pantalla**

`PantallaBloqueada` acepta `motivo`. Con `"version"`: título **"Actualiza para seguir vendiendo"**, el mensaje de la nube, y un **botón grande "Instalar la actualización"** que llama `buscarActualizacion()` de `lib/actualizacion.ts` (el flujo que ya existe). El teléfono de soporte se queda visible en las dos variantes.

En `page.tsx`, pasar `motivo={acceso.motivo}`.

- [ ] **Step 3: Verificar en el navegador**

Con la caja de desarrollo: publicar una versión mínima superior a la instalada, encender el bloqueo con fecha pasada, y comprobar que el POS muestra la variante con el botón, que el botón dispara el chequeo, y que al bajar la mínima vuelve a operar.

```bash
pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test
git add apps/pos
git commit -m "feat(pos): pantalla de bloqueo por versión con botón de instalar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Cierre — pruebas, seguridad, documentación y publicación

- [ ] **Step 1: Suite completa**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions
node --test desktop/src/*.test.mjs && node desktop/src/verify-sync-ciclo.mjs && supabase test db
```

- [ ] **Step 2: Prueba de extremo a extremo**

Publicar una versión desde el panel → comprobar que el `latest.json` del bucket cambió (esperando la propagación del CDN) → la caja de desarrollo la ofrece → marcar una mínima superior y encender el bloqueo → la caja muestra la pantalla de actualizar → apagar el bloqueo → vuelve a operar.

- [ ] **Step 3: Revisión de seguridad**

Invocar `security-review`. Puntos a mirar: que `POST /api/versiones` no acepte una URL fuera del host de releases ni un manifiesto sin sha512 válido; que la subida al bucket no exponga la clave de servicio al navegador; que `versiones_caja` siga sin políticas de RLS; que el bloqueo por versión no pueda encenderse sin la confirmación escrita; y que un cliente no pueda leer nada de otro a través del bloque `version` de las directivas.

- [ ] **Step 4: Documentación**

`docs/diseno/platform.md`: la pantalla `/versiones` y las dos confirmaciones (`TODOS` para publicar, `BLOQUEAR` para exigir). `docs/diseno/pos.md`: la variante de bloqueo por versión. **ADR 0014, Consecuencias:** añadir que el bloqueo por versión es el único que la caja decide localmente y que, por tanto, una caja sin internet sí puede quedar bloqueada; se acepta a cambio de poder retirar versiones con fallos graves, y por eso viene apagado.

Y actualizar `reference_publicar_latest_json` en la memoria: publicar ya no es `curl` a mano, es el panel.

- [ ] **Step 5: Publicar**

**Comprobar otra vez el número de migración y la versión del escritorio en `main`.** Después:

```bash
supabase db push          # 0108; NO hace falta redesplegar caja-latido (la firma no cambia)
git push -u origin platform-versiones
gh pr create --base main --title "Panel: versiones de la caja (ADR 0014, entrega 4)" --body-file <cuerpo>
```

Esperar a que **los tres chequeos terminen** antes de fusionar (en la entrega 3 se fusionó con dos aún corriendo). Tras el merge, publicar el escritorio con el número que corresponda — y hacerlo **desde la pantalla nueva**, que es la primera prueba real de que sirve.

- [ ] **Step 6: Memoria**

`../MEMORY.md` y `project_platform_centro_control.md`: ADR 0014 completo, las cuatro entregas en producción, y qué queda del panel (A8: login individual de super-admin).

---

## Self-review (hecho al escribir)

- **Cobertura de la spec §9:** 9.1 migración y directivas → Task 1; 9.2 pantalla, publicar y exigir mínima → Tasks 2, 3 y 4; 9.3 escritorio → Task 5; la pantalla del POS que §9.3 da por hecha → Task 6.
- **Diferencia con la spec, deliberada:** la spec dice que el bloqueo por versión se resuelve en `directivas.mjs` y se expone como `acceso.bloqueado`; aquí se hace igual pero añadiendo `motivo: "version"`, porque el POS necesita distinguirlo para ofrecer el botón de instalar en vez del teléfono a secas.
- **Riesgo principal, escrito y aceptado:** el bloqueo por versión lo decide la caja comparando localmente, así que —a diferencia de la suspensión— una directiva vieja **sí** puede bloquear sin internet. Mitigación: viene apagado, exige fecha y confirmación escrita, y la pantalla siempre ofrece instalar. Queda en el ADR.
- **Sin cambio de firma en las funciones**, así que esta vez no hay orden obligatorio entre migración y Edge Function; aun así la migración va antes que el merge, como siempre.
- **Consistencia:** `estadoDeVersion` se define en la Task 5 y la consumen `main.mjs` (mismo paso) y, a través de `/__directivas`, el POS de la Task 6; `validarManifiesto` se define en la Task 2 y la usa la API de la Task 3; el orden semver se implementa dos veces a propósito (SQL en la Task 1, JS en la Task 5) y ambas pruebas cubren el caso `0.4.9` vs `0.4.61`.
