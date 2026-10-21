# Catálogo de colonias con zona de envío — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al escribir la colonia de un domicilio (caja y tienda) salgan sugerencias de un catálogo por sucursal y la zona de envío se ponga sola, como en Soft Restaurant.

**Architecture:** SEPOMEX vive completo en la nube (`sepomex_asentamientos`, solo lectura). Cada sucursal tiene su catálogo `colonias` (nombre, CP, zona) que se siembra desde su municipio, baja a la caja y sube desde ella con el mismo patrón de libreta con huella que `zonas_envio`. El domicilio sigue guardando su propia zona; el catálogo solo sugiere. En la tienda, una colonia con zona decide el envío en el servidor; sin zona, manda el modo de cobro de la sucursal (mapa o selector).

**Tech Stack:** Postgres/Supabase (plpgsql, RLS, pg_trgm, `f_unaccent`), Electron + Postgres embebido (`desktop/src/sync-*.mjs`), Next.js (apps `pos`, `admin`, `tienda`), Edge Function Deno (`supabase/functions/tienda`), vitest, smokes `.sql`.

**Spec:** `docs/superpowers/specs/2026-10-15-catalogo-colonias-design.md`

## Global Constraints

- Trabajo en el worktree `C:/vwtCol`, rama `feat/catalogo-colonias` (desde `origin/main` bd292893). Nada de push hasta que Fermín lo diga.
- **Antes de escribir código, cargar la skill `ponytail`** (CLAUDE.md de la raíz). Antes de CSS, las skills de Emil Kowalski (memoria `feedback_skills_emil`).
- Migración única: `supabase/migrations/0187_catalogo_colonias.sql`. Antes de aplicarla a producción, comprobar con `git ls-tree origin/main supabase/migrations/` y en las ramas abiertas que nadie tomó el 0187.
- Convención del repo: para redefinir una función se copia **íntegra** su versión vigente y se marcan los cambios con un comentario `-- 0187:`. Nunca se edita una migración vieja.
- La caja corre TODAS las migraciones en su Postgres embebido (`desktop/src/runtime.mjs`): la 0187 no puede depender de nada que solo exista en la nube.
- Errores de negocio en SQL con prefijo `CODIGO: texto` (como `ZONA_INVALIDA: …`); la tienda los lee por el prefijo.
- Permiso del PIN: `descuento.override_precio` (0139). Quien administra el negocio (`es_admin_del_tenant`) no necesita PIN.
- Funciones de la tienda: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role` (el test 0003 de CI lo exige).
- Búsqueda: mínimo 2 caracteres, 300 ms de espera, máximo 8 resultados.
- `tsc --noEmit` en vez de `next build` (comparten `.next` con el dev server).
- Smokes: `cd desktop && npm run smokes -- smoke_colonias.sql` (corre como `postgres`; para probar RLS se usa `SET LOCAL ROLE authenticated` y `request.jwt.claims`).
- Textos de pantalla: cortos, sin jerga (memoria `feedback_textos_sitio_cortos`). Los que vea un cliente de la tienda los revisa James al final (marcar `// TEXTO PROVISIONAL (James).`).
- Instalador: al final, lista de lo que incluye y **esperar el OK de Fermín** antes de publicar (memoria `feedback_lista_antes_de_publicar`).

## Review Focus

1. **Colonias homónimas con distinto CP** («Centro» 37000 y «Centro» 37500): la sugerencia enseña el CP; la herencia solo asigna si el CP coincide; la llave única no las confunde. → pruebas en Task 2 (herencia) y Task 7 (orden y etiqueta).
2. **Texto con acentos, mayúsculas, espacios de sobra y `%`/`_`** («  SAN josé », «10%»): busca igual que «san jose» y no rompe el `LIKE`. → Task 2 (llave), Task 7 (normalizar), Task 10 (`tienda_colonias`).
3. **Zona de la colonia desactivada o borrada después de asignarla**: cuenta como «sin zona» (la caja vuelve a pedir zona sin PIN; la tienda cae al modo de la sucursal). → Task 3 y Task 10.
4. **Dos cajas (o caja y panel) capturan la misma colonia sin internet**: la nube no truena con la llave única y el pull de la caja no se queda atorado. → Task 4 (fusión en la nube) y Task 5 (clave natural en el pull).
5. **El navegador manda una `zona_id` más barata con una colonia que ya tiene zona**: el servidor la ignora. → Task 10.

---

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0187_catalogo_colonias.sql` (nuevo) | Tablas, RLS, `sembrar_colonias`, `asignar_zona_colonia`, sync de la nube, funciones de la tienda |
| `supabase/scripts/smoke_colonias.sql` (nuevo) | Pruebas de toda la 0187 |
| `supabase/scripts/smoke_tienda_envio_distancia.sql` | Firmas nuevas de `tienda_cotizar` / `tienda_crear_pedido` |
| `desktop/scripts/cargar-sepomex.mjs` (nuevo) | Carga única del archivo de Correos de México |
| `desktop/src/sync-push.mjs`, `desktop/src/sync-pull.mjs` | Colonias en push y pull |
| `desktop/src/sync-push.test.mjs` | Pruebas de pendientes de colonias |
| `apps/pos/app/lib/colonias.ts` (nuevo) + `__tests__/colonias.test.ts` | Consulta y alta del catálogo en la caja |
| `apps/pos/app/components/buscador-colonia.tsx` (nuevo) | Campo con sugerencias |
| `apps/pos/app/components/modal-cliente-domicilio.tsx`, `apps/pos/app/lib/clientes-domicilio.ts` | Integración en el domicilio |
| `apps/admin/app/lib/colonias.ts` (nuevo) + test | Datos del admin |
| `apps/admin/app/components/envios-pestanas.tsx` (nuevo) | Pestañas Zonas / Colonias |
| `apps/admin/app/(panel)/configuracion/envios/colonias/page.tsx` (nuevo) | Pantalla de colonias |
| `supabase/functions/_shared/tienda/validar.ts`, `respuesta.ts` + tests | Acción `colonias` y `colonia_id` |
| `supabase/functions/tienda/index.ts` | Acción `colonias`, `p_colonia` a cotizar y pedir |
| `apps/tienda/app/api/tienda/route.ts`, `lib/api.ts`, `lib/contrato.ts` | Proxy y cliente |
| `apps/tienda/app/components/campo-colonia.tsx` (nuevo), `datos.tsx`, `cuenta.tsx`, `entrega.tsx` | UI de la tienda |
| `docs/decisiones/0036-la-colonia-sugiere-la-zona.md` (nuevo) | ADR |

---

### Task 1: Tablas `sepomex_asentamientos` y `colonias` con RLS

**Files:**
- Create: `supabase/migrations/0187_catalogo_colonias.sql`
- Create: `supabase/scripts/smoke_colonias.sql`

**Interfaces:**
- Produces: tabla `colonias(id, tenant_id, sucursal_id, nombre, codigo_postal, zona_envio_id, origen, nombre_busqueda, created_at, updated_at, deleted_at)`; índice único `colonia_llave_uq`; tabla `sepomex_asentamientos(id, codigo_postal, nombre, tipo, municipio, estado, clave_municipio)`.

- [ ] **Step 1: Escribir el smoke (sección 1) que falla**

`supabase/scripts/smoke_colonias.sql`:

```sql
-- Smoke catálogo de colonias (mig. 0187, ADR 0036).
-- Uso: cd desktop && npm run smokes -- smoke_colonias.sql
\set ON_ERROR_STOP on
BEGIN;

-- El código del error de una sentencia (lo que va antes de los dos puntos) o el SQLSTATE si no
-- trae prefijo; NULL si no falló.
CREATE FUNCTION pg_temp.error_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLERRM ~ '^[A-Z_]+:' THEN split_part(SQLERRM, ':', 1) ELSE SQLSTATE END;
END $f$;

DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';   -- cajera
  v_dueno uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro  uuid := '18718718-0000-0000-0000-0000000000d1';
  v_suc_o uuid;
  v_z_centro uuid; v_z_norte uuid; v_z_otra uuid;
  v_col uuid; v_e text; v_n int; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE sucursales SET codigo_postal = '37000' WHERE id = v_suc;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Col Centro', 25) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Col Norte', 40) RETURNING id INTO v_z_norte;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0187', 'Otro negocio 0187', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre, codigo_postal) VALUES (v_otro, 'O187', 'Sucursal del otro', '37000') RETURNING id INTO v_suc_o;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_otro, v_suc_o, 'Ajena', 10) RETURNING id INTO v_z_otra;

  -- ── 1) La tabla y su llave ───────────────────────────────────────────────
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (v_t, v_suc, '  San José  ', '37000') RETURNING id INTO v_col;
  IF (SELECT nombre_busqueda FROM colonias WHERE id = v_col) <> 'san jose' THEN
    RAISE EXCEPTION '1: nombre_busqueda debía ser «san jose», fue %', (SELECT nombre_busqueda FROM colonias WHERE id = v_col);
  END IF;
  IF (SELECT origen FROM colonias WHERE id = v_col) <> 'CAPTURADA' THEN RAISE EXCEPTION '1: el origen por omisión es CAPTURADA'; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (%L, %L, %L, %L)', v_t, v_suc, 'SAN JOSÉ', '37000'));
  IF v_e IS DISTINCT FROM '23505' THEN RAISE EXCEPTION '1: la misma colonia y CP debía chocar (dio %)', v_e; END IF;
  -- Homónima con otro CP: entra.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (v_t, v_suc, 'San José', '37500');
  -- Sin CP: entra una vez.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (v_t, v_suc, 'San José');
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (%L, %L, %L)', v_t, v_suc, 'san jose'));
  IF v_e IS DISTINCT FROM '23505' THEN RAISE EXCEPTION '1: dos sin CP con el mismo nombre debían chocar (dio %)', v_e; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (%L, %L, %L, %L)', v_t, v_suc, 'Mala', '370'));
  IF v_e IS DISTINCT FROM '23514' THEN RAISE EXCEPTION '1: un CP de 3 dígitos debía rechazarse (dio %)', v_e; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (%L, %L, %L)', v_t, v_suc, '   '));
  IF v_e IS DISTINCT FROM '23514' THEN RAISE EXCEPTION '1: un nombre en blanco debía rechazarse (dio %)', v_e; END IF;

  -- ── 2) La zona tiene que ser de la sucursal y no de un tramo ─────────────
  v_e := pg_temp.error_de(format('UPDATE colonias SET zona_envio_id = %L WHERE id = %L', v_z_otra, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '2: una zona de otra sucursal debía rechazarse (dio %)', v_e; END IF;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, tramos_envio)
  VALUES (v_suc, v_t, true, jsonb_build_array(jsonb_build_object('hasta_km', '3.0', 'zona_id', v_z_norte)))
  ON CONFLICT (sucursal_id) DO UPDATE SET tramos_envio = EXCLUDED.tramos_envio;
  v_e := pg_temp.error_de(format('UPDATE colonias SET zona_envio_id = %L WHERE id = %L', v_z_norte, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '2: una zona de tramo debía rechazarse (dio %)', v_e; END IF;
  UPDATE tienda_sucursales SET tramos_envio = '[]' WHERE sucursal_id = v_suc;
  UPDATE colonias SET zona_envio_id = v_z_centro WHERE id = v_col;

  -- ── 3) RLS: la cajera ve las suyas y da de alta; no reasigna ni ve las ajenas ──
  INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (v_otro, v_suc_o, 'Colonia ajena');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  IF EXISTS (SELECT 1 FROM colonias WHERE tenant_id = v_otro) THEN RAISE EXCEPTION '3: la cajera vio colonias de otro negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM colonias WHERE id = v_col) THEN RAISE EXCEPTION '3: la cajera no ve las de su negocio'; END IF;
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, zona_envio_id) VALUES (v_t, v_suc, 'Las Joyas', v_z_centro);
  UPDATE colonias SET zona_envio_id = v_z_norte WHERE id = v_col;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '3: la cajera no debía poder reasignar con un UPDATE directo'; END IF;
  PERFORM 1 FROM sepomex_asentamientos LIMIT 1;   -- leer, sí
  -- Escribir, no. (Bloque propio y no pg_temp.error_de: con otro rol, el esquema temporal puede no
  -- estar al alcance.)
  v_e := NULL;
  BEGIN
    INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio)
    VALUES ('37000', 'X', 'Colonia', 'León', 'Guanajuato', '11020');
  EXCEPTION WHEN OTHERS THEN v_e := SQLSTATE;
  END;
  RESET ROLE;
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '3: authenticated no debía escribir en SEPOMEX (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'colonias 1-3 en verde';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `cd desktop && npm run smokes -- smoke_colonias.sql`
Expected: `❌ smoke_colonias.sql` con `relation "colonias" does not exist`.

- [ ] **Step 3: Escribir la sección 1 de la migración**

`supabase/migrations/0187_catalogo_colonias.sql`:

```sql
-- 0187 · Catálogo de colonias con zona de envío (ADR 0036; spec 2026-10-15-catalogo-colonias-design.md)
--
-- La colonia de un domicilio era texto libre y la zona se elegía aparte, de memoria. Ahora cada
-- sucursal tiene su catálogo de colonias con su zona: al escribirla, la caja y la tienda la sugieren
-- y la zona sale sola. El domicilio sigue guardando SU zona (direcciones_cliente.zona_envio_id): el
-- catálogo solo sugiere, y cambiar la zona de una colonia no toca domicilios guardados.
--
--   §1 sepomex_asentamientos: el catálogo oficial de Correos de México, entero y de solo lectura.
--      Lo carga desktop/scripts/cargar-sepomex.mjs una vez. NO baja a la caja.
--   §2 colonias: el catálogo de cada sucursal. Baja a la caja y sube desde ella (§5), igual que
--      zonas_envio. La caja da de alta colonias (CAPTURADA) sin PIN, como da de alta zonas (0139 §2).
--   §3 sembrar_colonias: copia el municipio de la sucursal y hereda zonas del historial.
--   §4 asignar_zona_colonia: poner zona a una colonia sin zona es libre; cambiarla pide PIN.
--   §5 sync: pull, push (con fusión por llave) y catalogo_version.
--   §6 tienda: búsqueda pública, la colonia decide el envío (tienda_cotizar / tienda_crear_pedido).

-- ── §1 SEPOMEX ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sepomex_asentamientos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_postal   varchar(5)   NOT NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  nombre          varchar(150) NOT NULL,
  tipo            varchar(50)  NOT NULL,
  municipio       varchar(100) NOT NULL,
  estado          varchar(50)  NOT NULL,
  -- c_estado (2) + c_mnpio (3): la llave para sembrar el municipio de una sucursal.
  clave_municipio varchar(8)   NOT NULL
);
COMMENT ON TABLE sepomex_asentamientos IS 'Asentamientos de Correos de México (CPdescarga.txt). Solo lectura; la carga desktop/scripts/cargar-sepomex.mjs. No baja a la caja.';
CREATE INDEX IF NOT EXISTS idx_sepomex_cp        ON sepomex_asentamientos (codigo_postal);
CREATE INDEX IF NOT EXISTS idx_sepomex_municipio ON sepomex_asentamientos (clave_municipio);
ALTER TABLE sepomex_asentamientos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sepomex_asentamientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON sepomex_asentamientos TO service_role;
DO $$ BEGIN
  CREATE POLICY sepomex_select ON sepomex_asentamientos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §2 colonias ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colonias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre          varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
  codigo_postal   varchar(5) NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  zona_envio_id   uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL,
  origen          text NOT NULL DEFAULT 'CAPTURADA' CHECK (origen IN ('SEPOMEX', 'CAPTURADA')),
  -- Para buscar y para la llave: sin acentos, minúsculas, sin espacios de sobra (como clientes, 0007).
  nombre_busqueda text GENERATED ALWAYS AS (f_unaccent(lower(btrim(nombre)))) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);
COMMENT ON TABLE colonias IS 'Colonias de cada sucursal con su zona de envío (0187, ADR 0036). Sugiere la zona del domicilio; no la impone.';

-- Hay colonias homónimas con distinto CP («Centro» 37000 y 37500): la llave lleva el CP.
CREATE UNIQUE INDEX IF NOT EXISTS colonia_llave_uq
  ON colonias (sucursal_id, nombre_busqueda, (coalesce(codigo_postal, ''))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_busqueda_trgm
  ON colonias USING GIN (nombre_busqueda gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_sucursal ON colonias (sucursal_id) WHERE deleted_at IS NULL;

ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON colonias TO authenticated, service_role;
-- Leer y dar de alta: todo el personal del negocio (la caja captura colonias al vuelo, sin PIN).
-- Cambiar o borrar: solo quien administra (el panel). La caja cambia zonas por asignar_zona_colonia.
DO $$ BEGIN
  CREATE POLICY colonias_select ON colonias FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_insert ON colonias FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_update ON colonias FOR UPDATE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_delete ON colonias FOR DELETE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_colonias_updated_at BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona de una colonia: viva, de la MISMA sucursal y no de un tramo por distancia (las de tramo
-- no se eligen a mano, 0185). SECURITY DEFINER: la cajera no necesita leer tienda_sucursales.
-- En modo réplica (sync) no corre: la nube y la caja ya validaron al escribir.
CREATE OR REPLACE FUNCTION _colonia_zona_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.zona_envio_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM zonas_envio z
                  WHERE z.id = NEW.zona_envio_id AND z.sucursal_id = NEW.sucursal_id
                    AND z.tenant_id = NEW.tenant_id AND z.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM tienda_sucursales ts
                 WHERE ts.sucursal_id = NEW.sucursal_id
                   AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', NEW.zona_envio_id::text))) THEN
    RAISE EXCEPTION 'ZONA_INVALIDA: la zona no es de esta sucursal o es de un tramo por distancia' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION _colonia_zona_valida() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_colonias_zona_valida BEFORE INSERT OR UPDATE OF zona_envio_id, sucursal_id ON colonias
  FOR EACH ROW EXECUTE FUNCTION _colonia_zona_valida();
```

- [ ] **Step 4: Correr el smoke y ver que pasa**

Run: `cd desktop && npm run smokes -- smoke_colonias.sql`
Expected: `✅ smoke_colonias.sql`. Si `tienda_sucursales` exige columnas NOT NULL que el `INSERT` del paso 2 no trae, completarlas en el smoke con los valores del fixture de `smoke_tienda_envio_distancia.sql` (no tocar la migración).

- [ ] **Step 5: Correr TODOS los smokes (la caja aplica la 0187 en su base)**

Run: `cd desktop && npm run smokes`
Expected: `✅ N/N smokes en verde`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0187_catalogo_colonias.sql supabase/scripts/smoke_colonias.sql
git commit -m "feat(colonias): tablas sepomex_asentamientos y colonias con RLS (0187 §1-§2)"
```

---

### Task 2: `sembrar_colonias` con herencia de zona

**Files:**
- Modify: `supabase/migrations/0187_catalogo_colonias.sql` (añadir §3 al final)
- Modify: `supabase/scripts/smoke_colonias.sql` (añadir sección 4 antes del `RAISE NOTICE`)

**Interfaces:**
- Consumes: tablas de Task 1.
- Produces: `sembrar_colonias(p_sucursal uuid) RETURNS jsonb` → `{"insertadas": int, "heredadas": int}`. Errores: `NO_AUTORIZADO` (42501), `SUCURSAL_INVALIDA`, `CP_DESCONOCIDO`.

- [ ] **Step 1: Escribir la sección 4 del smoke**

Insertar en `smoke_colonias.sql` justo antes de `RAISE NOTICE 'colonias 1-3 en verde';` (y cambiar ese aviso a `'colonias en verde'`). Declarar además `v_cli uuid; v_suc_sin uuid; v_z_borrada uuid;` en el `DECLARE`.

```sql
  -- ── 4) Sembrar desde SEPOMEX con herencia ────────────────────────────────
  INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio) VALUES
    ('37000', 'Centro',          'Colonia',         'León', 'Guanajuato', '11020'),
    ('37500', 'Centro',          'Colonia',         'León', 'Guanajuato', '11020'),
    ('37280', 'Jardines del Moral', 'Fraccionamiento', 'León', 'Guanajuato', '11020'),
    ('37280', 'Jardines del Moral', 'Fraccionamiento', 'León', 'Guanajuato', '11020'),  -- repetida en el archivo
    ('37000', 'San José',        'Colonia',         'León', 'Guanajuato', '11020'),       -- ya existe (sección 1)
    ('37390', 'El Coecillo',     'Barrio',          'León', 'Guanajuato', '11020'),
    ('36000', 'Zona Centro',     'Colonia',         'Guanajuato', 'Guanajuato', '11015'); -- otro municipio
  -- Historial: «jardines del moral» (sin acento, en minúsculas) 2 veces en Norte y 1 en Centro;
  -- «Centro» con CP 37000 en Centro; «El Coecillo» con una zona borrada (no cuenta).
  UPDATE tienda_sucursales SET tramos_envio = '[]' WHERE sucursal_id = v_suc;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Cliente herencia', '4770000187') RETURNING id INTO v_cli;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id) VALUES
    (v_t, v_cli, 'A', '1', 'jardines del moral ', '00000', 'León', 'Gto', v_z_norte),
    (v_t, v_cli, 'B', '2', 'JARDINES DEL MORAL',  '37280', 'León', 'Gto', v_z_norte),
    (v_t, v_cli, 'C', '3', 'Jardines del Moral',  '37280', 'León', 'Gto', v_z_centro),
    (v_t, v_cli, 'D', '4', 'Centro',              '37000', 'León', 'Gto', v_z_centro);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn, deleted_at) VALUES (v_t, v_suc, 'Col Borrada', 5, now()) RETURNING id INTO v_z_borrada;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id)
  VALUES (v_t, v_cli, 'E', '5', 'El Coecillo', '37390', 'León', 'Gto', v_z_borrada);

  -- La cajera no siembra.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc));
  IF v_e IS DISTINCT FROM 'NO_AUTORIZADO' THEN RAISE EXCEPTION '4: la cajera no debía sembrar (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc_o));
  IF v_e IS DISTINCT FROM 'SUCURSAL_INVALIDA' THEN RAISE EXCEPTION '4: sucursal de otro negocio (dio %)', v_e; END IF;
  INSERT INTO sucursales (tenant_id, codigo, nombre, codigo_postal) VALUES (v_t, 'S187', 'Sin CP conocido', '99999') RETURNING id INTO v_suc_sin;
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc_sin));
  IF v_e IS DISTINCT FROM 'CP_DESCONOCIDO' THEN RAISE EXCEPTION '4: un CP que no está en SEPOMEX (dio %)', v_e; END IF;

  v_r := sembrar_colonias(v_suc);
  -- Centro 37000, Centro 37500, Jardines del Moral 37280, El Coecillo 37390. San José 37000 ya estaba;
  -- la repetida entra una vez; la de otro municipio no entra.
  IF v_r <> '{"insertadas": 4, "heredadas": 2}'::jsonb THEN RAISE EXCEPTION '4: siembra dio %', v_r; END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral') IS DISTINCT FROM v_z_norte THEN
    RAISE EXCEPTION '4: Jardines del Moral debía heredar Norte (la más usada)';
  END IF;
  -- Centro tiene homónima: solo hereda la del CP del historial.
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37000') IS DISTINCT FROM v_z_centro
     OR (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500') IS NOT NULL THEN
    RAISE EXCEPTION '4: la herencia de homónimas debía ir por CP';
  END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo') IS NOT NULL THEN
    RAISE EXCEPTION '4: una zona borrada no se hereda';
  END IF;
  IF (SELECT origen FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo') <> 'SEPOMEX' THEN
    RAISE EXCEPTION '4: lo sembrado es SEPOMEX';
  END IF;

  -- Repetir no duplica ni pisa; una borrada no revive.
  UPDATE colonias SET zona_envio_id = v_z_centro WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral';
  UPDATE colonias SET deleted_at = now() WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo';
  v_r := sembrar_colonias(v_suc);
  IF v_r <> '{"insertadas": 0, "heredadas": 0}'::jsonb THEN RAISE EXCEPTION '4: la segunda siembra dio %', v_r; END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral') IS DISTINCT FROM v_z_centro THEN
    RAISE EXCEPTION '4: la segunda siembra pisó una zona asignada';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `cd desktop && npm run smokes -- smoke_colonias.sql`
Expected: FAIL con `function sembrar_colonias(uuid) does not exist`.

- [ ] **Step 3: Añadir §3 a la migración**

```sql
-- ── §3 sembrar_colonias ──────────────────────────────────────────────────────
-- Copia los asentamientos del municipio de la sucursal (sale de su CP) y a cada colonia SIN zona le
-- pone la zona más usada en el historial de domicilios de esa sucursal. Repetirla es seguro: no
-- duplica, no revive colonias borradas y nunca pisa una zona asignada.
-- Herencia: el texto del domicilio se compara sin acentos ni mayúsculas. Si la colonia tiene una
-- homónima viva con otro CP, solo cuenta el historial con SU CP (muchos domicilios de la caja
-- guardan «00000»: esos no deciden entre homónimas). Zonas borradas, inactivas o de tramo no cuentan.
CREATE OR REPLACE FUNCTION sembrar_colonias(p_sucursal uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_cp     text;
  v_mun    text;
  v_ins    integer;
  v_her    integer;
BEGIN
  IF v_tenant IS NULL OR NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: solo quien administra el negocio carga colonias' USING ERRCODE = '42501';
  END IF;
  SELECT s.codigo_postal INTO v_cp FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA: la sucursal no es de este negocio' USING ERRCODE = 'P0002';
  END IF;
  SELECT a.clave_municipio INTO v_mun FROM sepomex_asentamientos a WHERE a.codigo_postal = v_cp LIMIT 1;
  IF v_mun IS NULL THEN
    RAISE EXCEPTION 'CP_DESCONOCIDO: captura un código postal válido en los datos de la sucursal' USING ERRCODE = '22023';
  END IF;

  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal, origen)
  SELECT DISTINCT ON (f_unaccent(lower(btrim(a.nombre))), a.codigo_postal)
         v_tenant, p_sucursal, btrim(a.nombre), a.codigo_postal, 'SEPOMEX'
    FROM sepomex_asentamientos a
   WHERE a.clave_municipio = v_mun
     -- Sin el filtro de deleted_at: una colonia que el dueño borró no vuelve.
     AND NOT EXISTS (SELECT 1 FROM colonias c
                      WHERE c.sucursal_id = p_sucursal
                        AND c.nombre_busqueda = f_unaccent(lower(btrim(a.nombre)))
                        AND coalesce(c.codigo_postal, '') = a.codigo_postal)
   ORDER BY f_unaccent(lower(btrim(a.nombre))), a.codigo_postal, a.id;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  WITH uso AS (
    SELECT f_unaccent(lower(btrim(d.colonia))) AS nb, d.codigo_postal AS cp, d.zona_envio_id AS zona,
           count(*) AS n, max(d.updated_at) AS ult
      FROM direcciones_cliente d
      JOIN zonas_envio z ON z.id = d.zona_envio_id
     WHERE d.tenant_id = v_tenant AND d.activa
       AND z.sucursal_id = p_sucursal AND z.deleted_at IS NULL AND z.activa
       AND NOT EXISTS (SELECT 1 FROM tienda_sucursales ts
                        WHERE ts.sucursal_id = p_sucursal
                          AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text)))
     GROUP BY 1, 2, 3
  ), votos AS (
    SELECT c.id, u.zona, sum(u.n) AS n, max(u.ult) AS ult
      FROM colonias c
      JOIN uso u ON u.nb = c.nombre_busqueda
                AND (u.cp = c.codigo_postal
                     OR NOT EXISTS (SELECT 1 FROM colonias o
                                     WHERE o.sucursal_id = c.sucursal_id AND o.deleted_at IS NULL
                                       AND o.nombre_busqueda = c.nombre_busqueda AND o.id <> c.id))
     WHERE c.sucursal_id = p_sucursal AND c.deleted_at IS NULL AND c.zona_envio_id IS NULL
     GROUP BY c.id, u.zona
  ), elegida AS (
    SELECT DISTINCT ON (id) id, zona FROM votos ORDER BY id, n DESC, ult DESC
  )
  UPDATE colonias c SET zona_envio_id = e.zona FROM elegida e WHERE c.id = e.id;
  GET DIAGNOSTICS v_her = ROW_COUNT;

  RETURN jsonb_build_object('insertadas', v_ins, 'heredadas', v_her);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION sembrar_colonias(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sembrar_colonias(uuid) TO authenticated;
```

- [ ] **Step 4: Correr el smoke y ver que pasa**

Run: `cd desktop && npm run smokes -- smoke_colonias.sql`
Expected: `✅ smoke_colonias.sql`. Ojo: «San José» 37000 de la sección 1 ya tiene zona Centro y no cuenta en `heredadas`; «Las Joyas» (sección 3) tampoco está en SEPOMEX. Si el número no cuadra, revisar el caso antes de cambiar el esperado.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0187_catalogo_colonias.sql supabase/scripts/smoke_colonias.sql
git commit -m "feat(colonias): sembrar_colonias desde SEPOMEX con herencia de zona (0187 §3)"
```

---

### Task 3: `asignar_zona_colonia` (libre sin zona, PIN para cambiarla)

**Files:**
- Modify: `supabase/migrations/0187_catalogo_colonias.sql` (§4)
- Modify: `supabase/scripts/smoke_colonias.sql` (sección 5)

**Interfaces:**
- Produces: `asignar_zona_colonia(p_colonia uuid, p_zona uuid, p_autorizacion_pin_id uuid DEFAULT NULL) RETURNS void`. Errores: `42501` (sin autorización / quitar zona sin ser admin), `P0002` (no existe), `ZONA_INVALIDA` (del trigger).

- [ ] **Step 1: Escribir la sección 5 del smoke** (antes del `RAISE NOTICE`; declarar `v_super uuid := '99999999-0000-0000-0000-0000000000f1'; v_aut uuid; v_libre uuid; v_ajena uuid;`). Sin cambiar de rol: la función es SECURITY DEFINER y toma tenant y usuario de `request.jwt.claims`, que es lo que se prueba.

```sql
  -- ── 5) asignar_zona_colonia ──────────────────────────────────────────────
  SELECT id INTO v_libre FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500';
  SELECT id INTO v_ajena FROM colonias WHERE tenant_id = v_otro LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  -- Sin zona: libre, sin PIN.
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  IF (SELECT zona_envio_id FROM colonias WHERE id = v_libre) IS DISTINCT FROM v_z_centro THEN RAISE EXCEPTION '5: sin zona debía asignarse sin PIN'; END IF;
  -- La misma otra vez: no hace nada y no pide PIN.
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  -- Cambiarla sin autorización: no.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_libre, v_z_norte));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: cambiar sin PIN debía rechazarse (dio %)', v_e; END IF;
  -- Quitarla: solo admin.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, NULL)', v_libre));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: la cajera no quita zonas (dio %)', v_e; END IF;
  -- (Las tres pruebas de 42501 dependen de que `error_de` devuelva el SQLSTATE cuando el mensaje no
  -- trae prefijo: «Esta acción requiere autorización.» no lo trae.)
  -- Con PIN de supervisor sobre ESTA colonia, sí; y una sola vez.
  INSERT INTO autorizaciones_pin (id, tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion,
                                  permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (gen_random_uuid(), v_t, v_maria, v_super, 'editar_zona_colonia',
          'descuento.override_precio', 'colonia', v_libre, 'smoke 0187') RETURNING id INTO v_aut;
  PERFORM asignar_zona_colonia(v_libre, v_z_norte, v_aut);
  IF (SELECT zona_envio_id FROM colonias WHERE id = v_libre) IS DISTINCT FROM v_z_norte THEN RAISE EXCEPTION '5: con PIN debía cambiar'; END IF;
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L, %L)', v_libre, v_z_centro, v_aut));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: la autorización es de un uso (dio %)', v_e; END IF;
  -- Zona actual desactivada = sin zona: libre otra vez.
  UPDATE zonas_envio SET activa = false WHERE id = v_z_norte;
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  UPDATE zonas_envio SET activa = true WHERE id = v_z_norte;
  -- El dueño cambia y quita sin PIN.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM asignar_zona_colonia(v_libre, v_z_norte);
  PERFORM asignar_zona_colonia(v_libre, NULL);
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_libre, v_z_otra));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '5: zona ajena (dio %)', v_e; END IF;
  -- Colonia de otro negocio: para esta sesión no existe.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_ajena, v_z_centro));
  IF v_e IS DISTINCT FROM 'P0002' THEN RAISE EXCEPTION '5: colonia ajena (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
```

- [ ] **Step 2: Correrlo y ver que falla** — Run: `cd desktop && npm run smokes -- smoke_colonias.sql` · Expected: `function asignar_zona_colonia… does not exist`.

- [ ] **Step 3: Añadir §4 a la migración**

```sql
-- ── §4 asignar_zona_colonia ──────────────────────────────────────────────────
-- Mismo patrón que cambiar_costo_zona (0139). Poner zona a una colonia que no tiene (o cuya zona ya
-- no está viva y activa) es libre: llega un pedido a esa hora y no hay a quién pedirle PIN. CAMBIAR
-- una zona viva pide autorización de descuento.override_precio sobre esa colonia; quien administra
-- el negocio no la necesita. Quitar la zona, solo quien administra.
CREATE OR REPLACE FUNCTION asignar_zona_colonia(p_colonia uuid, p_zona uuid, p_autorizacion_pin_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_c      colonias%ROWTYPE;
  v_viva   boolean;
  v_admin  boolean;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM colonias WHERE id = p_colonia AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La colonia no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_c.zona_envio_id IS NOT DISTINCT FROM p_zona THEN RETURN; END IF;

  v_admin := es_admin_del_tenant(v_tenant);
  IF p_zona IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'Solo quien administra el negocio quita la zona de una colonia.' USING ERRCODE = '42501';
  END IF;
  v_viva := v_c.zona_envio_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM zonas_envio z WHERE z.id = v_c.zona_envio_id AND z.deleted_at IS NULL AND z.activa);
  IF v_viva AND NOT (v_admin AND p_autorizacion_pin_id IS NULL) THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['descuento.override_precio'], p_colonia, NULL);
  END IF;
  UPDATE colonias SET zona_envio_id = p_zona WHERE id = p_colonia;   -- trg_colonias_zona_valida revisa
END;
$fn$;
REVOKE EXECUTE ON FUNCTION asignar_zona_colonia(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION asignar_zona_colonia(uuid, uuid, uuid) TO authenticated;
```

- [ ] **Step 4: Correr el smoke y ver que pasa** — Expected: `✅ smoke_colonias.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0187_catalogo_colonias.sql supabase/scripts/smoke_colonias.sql
git commit -m "feat(colonias): asignar_zona_colonia, libre sin zona y con PIN para cambiarla (0187 §4)"
```

---

### Task 4: Sync del lado de la nube (pull, push con fusión, catalogo_version)

**Files:**
- Modify: `supabase/migrations/0187_catalogo_colonias.sql` (§5)
- Modify: `supabase/scripts/smoke_colonias.sql` (sección 6)

**Interfaces:**
- Produces: clave `colonias` en `sync_pull_snapshot(p_tenant)`; `sync_push_snapshot` acepta la tabla `colonias`; `_vim_fusionar_colonias(p_snapshot jsonb, p_tenant uuid) RETURNS jsonb`; `catalogo_version()` mira `colonias.updated_at`.

- [ ] **Step 1: Escribir la sección 6 del smoke**

```sql
  -- ── 6) Sync de la nube ───────────────────────────────────────────────────
  v_r := sync_pull_snapshot(v_t);
  IF jsonb_typeof(v_r -> 'colonias') <> 'array'
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'colonias') x WHERE (x ->> 'id')::uuid = v_col)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'colonias') x WHERE (x ->> 'tenant_id')::uuid = v_otro) THEN
    RAISE EXCEPTION '6: el pull debía traer las colonias del negocio y solo esas';
  END IF;
  -- Push: una colonia nueva de la caja entra; una que choca por llave con otra de la nube se funde
  -- (no truena) y le pasa su zona si la de la nube no tenía.
  UPDATE colonias SET zona_envio_id = NULL WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500';
  v_r := sync_push_snapshot(v_t, jsonb_build_object('colonias', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_suc, 'nombre', 'La Nueva', 'codigo_postal', NULL,
                       'zona_envio_id', v_z_centro, 'origen', 'CAPTURADA', 'created_at', now(), 'updated_at', now(), 'deleted_at', NULL),
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_suc, 'nombre', 'CENTRO', 'codigo_postal', '37500',
                       'zona_envio_id', v_z_norte, 'origen', 'CAPTURADA', 'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));
  IF v_r ? '_errores' THEN RAISE EXCEPTION '6: el push no debía rechazar filas: %', v_r -> '_errores'; END IF;
  IF NOT EXISTS (SELECT 1 FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'la nueva' AND zona_envio_id = v_z_centro) THEN
    RAISE EXCEPTION '6: la colonia nueva de la caja no entró';
  END IF;
  IF (SELECT count(*) FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500' AND deleted_at IS NULL) <> 1
     OR (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500' AND deleted_at IS NULL) IS DISTINCT FROM v_z_norte THEN
    RAISE EXCEPTION '6: la homónima de la caja debía fundirse y pasar su zona';
  END IF;
  IF catalogo_version() IS NULL THEN RAISE EXCEPTION '6: catalogo_version'; END IF;
```

- [ ] **Step 2: Correrlo y ver que falla** — Expected: `'6: el pull debía traer…'`.

- [ ] **Step 3: Añadir §5 a la migración**

1. `_vim_fusionar_colonias`:

```sql
-- ── §5 sync ──────────────────────────────────────────────────────────────────
-- Dos cajas (o una caja y el panel) capturan la misma colonia sin internet: mismo nombre y CP, otro
-- id. El upsert del push chocaría con colonia_llave_uq y la fila se reintentaría para siempre. Antes
-- de aplicar, la de la caja se saca del lote y, si la de la nube no tenía zona, le pasa la suya.
-- Nadie apunta a una colonia (el domicilio guarda su propia zona), así que no hay nada que reapuntar;
-- el siguiente pull de la caja trae la de la nube y la local se funde allá (sync-pull.mjs).
CREATE OR REPLACE FUNCTION _vim_fusionar_colonias(p_snapshot jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila   jsonb;
  v_nube   colonias%ROWTYPE;
  v_quedan jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot -> 'colonias') IS DISTINCT FROM 'array' THEN RETURN p_snapshot; END IF;
  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_snapshot -> 'colonias') LOOP
    SELECT * INTO v_nube FROM colonias c
     WHERE c.tenant_id = p_tenant
       AND c.sucursal_id = NULLIF(v_fila ->> 'sucursal_id', '')::uuid
       AND c.id <> NULLIF(v_fila ->> 'id', '')::uuid
       AND c.deleted_at IS NULL
       AND c.nombre_busqueda = f_unaccent(lower(btrim(v_fila ->> 'nombre')))
       AND coalesce(c.codigo_postal, '') = coalesce(v_fila ->> 'codigo_postal', '');
    IF FOUND AND (v_fila ->> 'deleted_at') IS NULL THEN
      IF v_nube.zona_envio_id IS NULL AND NULLIF(v_fila ->> 'zona_envio_id', '') IS NOT NULL THEN
        BEGIN
          UPDATE colonias SET zona_envio_id = (v_fila ->> 'zona_envio_id')::uuid WHERE id = v_nube.id;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '_vim_fusionar_colonias: no se pasó la zona de %: %', v_fila ->> 'id', SQLERRM;
        END;
      END IF;
    ELSE
      v_quedan := v_quedan || jsonb_build_array(v_fila);
    END IF;
  END LOOP;
  RETURN jsonb_set(p_snapshot, '{colonias}', v_quedan);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_fusionar_colonias(jsonb, uuid) FROM PUBLIC, anon, authenticated;
```

2. `sync_pull_snapshot`: copiar **íntegra** la de `0184_propinas_bajan_a_la_caja.sql` (desde `CREATE OR REPLACE FUNCTION sync_pull_snapshot` hasta su `GRANT`) y, justo después de la línea `'zonas_envio', …`, añadir:

```sql
    -- 0187: el catálogo de colonias (ADR 0036). Sube y baja, como las zonas.
    'colonias',                       coalesce((SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
```

(`- 'nombre_busqueda'`: es generada; la caja la calcula sola.)

3. `catalogo_version`: copiar íntegra la de la 0184 y añadir `(SELECT max(updated_at) FROM colonias)` a la lista del `GREATEST` (con comentario `-- 0187`).

4. `sync_push_snapshot`: copiar **íntegra** la de `0156_lealtad.sql` (encabezado `-- ── sync_push_snapshot: la de la 0126 (vigente) con cinco cambios…`) con dos cambios marcados `-- 0187`:
   - en `v_tablas`, `'colonias'` justo después de `'zonas_envio'`;
   - después de `p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);` añadir:

```sql
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);
```

Antes de copiar, confirmar que no hay una versión más nueva: `grep -l "FUNCTION sync_push_snapshot" supabase/migrations/*.sql | tail -1` y lo mismo para `sync_pull_snapshot` y `catalogo_version` (deben ser 0156, 0184 y 0184).

- [ ] **Step 4: Correr el smoke y ver que pasa** — Expected: `✅ smoke_colonias.sql`. Luego `npm run smokes` completo (otros smokes usan `sync_push_snapshot`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0187_catalogo_colonias.sql supabase/scripts/smoke_colonias.sql
git commit -m "feat(colonias): colonias en el pull y el push de la nube, con fusión por llave (0187 §5)"
```

---

### Task 5: Sync de la caja (libreta de colonias en push y pull)

**Files:**
- Modify: `desktop/src/sync-push.mjs`
- Modify: `desktop/src/sync-pull.mjs`
- Test: `desktop/src/sync-push.test.mjs`

**Interfaces:**
- Consumes: clave `colonias` del snapshot (Task 4).
- Produces: libreta local `_vim_colonias_ok (colonia_id uuid PK, huella text, subido_at)`; `listarPendientes()` devuelve además `coloniaIds: string[]`; `construirSnapshotPush()` devuelve `colonias: {id, huella}[]` y el snapshot trae `colonias`.

Mismo patrón que `zonas_envio` (léelo entero antes de empezar: `HUELLA_ZONA`, `ZONA_EDITADA_LOCAL`, `ZONA_PENDIENTE`, `asegurarLibretaZonas`, `marcarZonasSubidas`, `marcarZonasDelPull`, `separarZonasPendientes`, `CLAVES_NATURALES.zonas_envio`). La colonia no necesita siembra única de libreta (`sembrarZonasUnaVez`): ninguna caja anterior a esta versión tiene colonias locales.

- [ ] **Step 1: Escribir las pruebas que fallan** en `desktop/src/sync-push.test.mjs`, junto a las de zonas (≈ línea 300-400), con el mismo arnés de Postgres real que esas pruebas usan:

```js
test("colonias: una capturada en la caja queda pendiente y deja de estarlo al subir", async () => {
  // mismo arranque que la prueba de zonas pendientes (db con migraciones aplicadas)
  await db.query(`INSERT INTO colonias (id, tenant_id, sucursal_id, nombre) VALUES ($1, $2, $3, 'Las Joyas')`, [C1, T, S]);
  let p = await listarPendientes(db);
  assert.deepEqual(p.coloniaIds, [C1]);
  const { colonias, snapshot } = await construirSnapshotPush(db);
  assert.equal(snapshot.colonias.length, 1);
  assert.equal("nombre_busqueda" in snapshot.colonias[0], false);
  await marcarColoniasSubidas(db, colonias);
  p = await listarPendientes(db);
  assert.deepEqual(p.coloniaIds, []);
});

test("colonias: asignarle zona en la caja la vuelve a subir", async () => {
  await db.query(`UPDATE colonias SET zona_envio_id = $1 WHERE id = $2`, [Z1, C1]);
  assert.deepEqual((await listarPendientes(db)).coloniaIds, [C1]);
});

test("colonias: el pull no pisa una zona asignada en la caja que aún no sube", async () => {
  // C1 tiene zona Z1 local pendiente; la nube la manda sin zona.
  await pullSnapshot(db, { colonias: [{ id: C1, tenant_id: T, sucursal_id: S, nombre: "Las Joyas", codigo_postal: null, zona_envio_id: null, origen: "CAPTURADA", created_at: AHORA, updated_at: AHORA, deleted_at: null }] });
  const { rows } = await db.query("SELECT zona_envio_id FROM colonias WHERE id = $1", [C1]);
  assert.equal(rows[0].zona_envio_id, Z1);
});

test("colonias: la misma colonia con otro id en la nube reemplaza a la local", async () => {
  await db.query(`INSERT INTO colonias (id, tenant_id, sucursal_id, nombre, codigo_postal) VALUES ($1, $2, $3, 'Centro', '37500')`, [C2, T, S]);
  await pullSnapshot(db, { colonias: [{ id: C3, tenant_id: T, sucursal_id: S, nombre: "CENTRO", codigo_postal: "37500", zona_envio_id: null, origen: "SEPOMEX", created_at: AHORA, updated_at: AHORA, deleted_at: null }] });
  const { rows } = await db.query("SELECT id FROM colonias WHERE sucursal_id = $1 AND nombre_busqueda = 'centro' AND deleted_at IS NULL", [S]);
  assert.deepEqual(rows.map((r) => r.id), [C3]);
});
```

Ajustar nombres de constantes (`T`, `S`, `Z1`, ids) a los que ya usa el archivo, y crear la zona `Z1` en la sucursal `S` en el arranque si no existe.

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd desktop && node --test src/sync-push.test.mjs`
Expected: FAIL (`p.coloniaIds` undefined). En Linux estas pruebas se saltan; en Windows corren (memoria `reference_pruebas_escritorio_windows`: libuv/EPIPE/EADDRINUSE no son regresión).

- [ ] **Step 3: Implementar en `sync-push.mjs`**

Para no copiar cuatro funciones, generaliza las de zonas por tabla y deja los nombres viejos como envoltura (las pruebas de zonas siguen pasando sin cambios):

```js
/** Catálogos que la caja edita y que viajan por HUELLA (ver asegurarLibretaZonas, el porqué). */
const LIBRETAS = {
  zonas_envio: { libreta: "_vim_zonas_ok", col: "zona_id" },
  // 0187: la caja da de alta colonias y les asigna zona; mismo riesgo que una zona repreciada.
  colonias: { libreta: "_vim_colonias_ok", col: "colonia_id" },
};
const editadaLocal = (tabla) => `(o.huella IS NOT NULL AND o.huella IS DISTINCT FROM ${HUELLA_FILA})`;
const pendiente = (tabla) => `(o.${LIBRETAS[tabla].col} IS NULL OR ${editadaLocal(tabla)})`;

export async function asegurarLibreta(db, tabla) {
  const { libreta, col } = LIBRETAS[tabla];
  await db.query(`CREATE TABLE IF NOT EXISTS ${libreta} (${col} uuid PRIMARY KEY, huella text NULL, subido_at timestamptz DEFAULT now())`);
  await db.query(`ALTER TABLE ${libreta} ADD COLUMN IF NOT EXISTS huella text NULL`);
  await db.query(`UPDATE ${libreta} o SET huella = ${HUELLA_FILA} FROM ${tabla} x WHERE x.id = o.${col} AND o.huella IS NULL`);
}
export const asegurarLibretaZonas = (db) => asegurarLibreta(db, "zonas_envio");
export const asegurarLibretaColonias = (db) => asegurarLibreta(db, "colonias");
```

`HUELLA_ZONA` ya es igual a `HUELLA_FILA` (`md5(to_jsonb(x)::text)`); mantener la constante exportada. **Ojo con la huella de colonias:** la fila local trae `nombre_busqueda` (generada) y la de la nube baja sin ella; como la huella se calcula siempre sobre la fila LOCAL (la recién escrita en el pull y la actual en el push), coincide. No restar la columna de la huella.

Luego, en cada sitio donde aparece `zonas_envio` / `_vim_zonas_ok` / `ZONA_PENDIENTE`, añadir el equivalente de colonias:
- donde se llama `asegurarLibretaZonas(pool)` al preparar el push (≈ línea 192): `await asegurarLibretaColonias(pool);`
- `listarPendientes` (≈ 553): columna `colonias` con `LEFT JOIN _vim_colonias_ok o ON o.colonia_id = x.id WHERE ${pendiente("colonias")}` y `coloniaIds: rows[0].colonias ?? []` en el retorno;
- `construirSnapshotPush` (≈ 658 y 698): la lista `{id, huella}` y la clave del snapshot

```js
      (SELECT jsonb_agg(jsonb_build_object('id', x.id, 'huella', ${HUELLA_FILA})) FROM colonias x
         LEFT JOIN _vim_colonias_ok o ON o.colonia_id = x.id WHERE ${pendiente("colonias")}) AS colonias,
```

```js
        -- 0187: las colonias capturadas o reasignadas en la caja. Sin la columna generada.
        'colonias',                   (SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x
                                         LEFT JOIN _vim_colonias_ok o ON o.colonia_id = x.id
                                        WHERE ${pendiente("colonias")}),
```

  y `colonias: rows[0].colonias ?? []` en el retorno;
- `enviarLote` (≈ 980): `const colFuera = filasRechazadas(errores, "colonias"); await marcarColoniasSubidas(pool, colonias.filter((c) => !colFuera.has(c.id)));` (y desestructurar `colonias` donde se desestructura `zonas`);
- `pushToCloud` (≈ 1015-1048): `coloniaIds` en la guarda de «nada pendiente» y en el texto `parte` (`${coloniaIds.length} colonia(s)`);
- exportar `export function marcarColoniasSubidas(pool, colonias) { return anotarHuellas(pool, "_vim_colonias_ok", "colonia_id", colonias); }`.

- [ ] **Step 4: Implementar en `sync-pull.mjs`**

- `PULL_ORDER`: `{ t: "colonias" },` justo después de `{ t: "zonas_envio" },` con el comentario `// Colonias (0187): FK a sucursales y a zonas_envio, que ya bajaron.`
- `CLAVES_NATURALES.colonias`:

```js
  // 0187: la misma colonia capturada en esta caja y en otra (o en el panel) sin internet. Igual que
  // las zonas, choca con colonia_llave_uq —(sucursal_id, nombre_busqueda, coalesce(cp,''))— y el
  // ROLLBACK se llevaría todo el pull. Nadie apunta a una colonia: se borra la local (y su renglón
  // de libreta) y entra la de la nube. Su zona, si la local la tenía, ya se la pasó la nube al
  // fundir el push (_vim_fusionar_colonias).
  colonias: {
    claveSql: {
      where: "sucursal_id = $1 AND nombre_busqueda = f_unaccent(lower(btrim($2))) AND coalesce(codigo_postal, '') = coalesce($3, '') AND deleted_at IS NULL",
      params: (f) => [f.sucursal_id ?? null, f.nombre ?? null, f.codigo_postal ?? null],
      aplica: (f) => f.deleted_at == null,
    },
    dependientes: [{ tabla: "_vim_colonias_ok", col: "colonia_id" }],
  },
```

  Verificar en `fundirDuplicado` que `dependientes` borra por `col = id viejo` (si no, usar `reapuntar: []` y borrar la libreta a mano). Si `_vim_colonias_ok` aún no existe en el primer pull, llamar `asegurarLibretaColonias(client)` antes.
- En `pullSnapshot`, junto al bloque `if (t === "zonas_envio")`, el mismo bloque para `"colonias"` con una versión por tabla de `separarZonasPendientes` (generalízala como en el push: `separarPendientes(client, tabla, filas)`, mismo candado `FOR NO KEY UPDATE`).
- Donde se llama `marcarZonasDelPull`, lo mismo para colonias (`marcarDelPull(client, "colonias", filas)`).
- Importar `asegurarLibretaColonias` desde `sync-push.mjs`.

- [ ] **Step 5: Correr las pruebas**

Run: `cd desktop && node --test src/sync-push.test.mjs src/sync-pull.test.mjs`
Expected: PASS (las de zonas también).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/sync-push.mjs desktop/src/sync-pull.mjs desktop/src/sync-push.test.mjs
git commit -m "feat(colonias): la caja sube y baja el catálogo de colonias con libreta de huella"
```

---

### Task 6: Script de carga de SEPOMEX

**Files:**
- Create: `desktop/scripts/cargar-sepomex.mjs`
- Create: `desktop/scripts/cargar-sepomex.test.mjs`

**Interfaces:**
- Produces: `parsearSepomex(texto: string) → Array<{codigo_postal, nombre, tipo, municipio, estado, clave_municipio}>` (pura) y CLI `node scripts/cargar-sepomex.mjs <ruta CPdescarga.txt>` con `SEPOMEX_DB_URL`.

El archivo oficial se baja a mano de Correos de México (Consulta de códigos postales → «Descargar» en formato TXT, todo el país). Viene en latin1, separado por `|`; la línea 1 es un aviso y la 2 son los encabezados: `d_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|c_estado|c_oficina|c_CP|c_tipo_asenta|c_mnpio|id_asenta_cpcons|d_zona|c_cve_ciudad`.

- [ ] **Step 1: Prueba que falla** (`desktop/scripts/cargar-sepomex.test.mjs`)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearSepomex } from "./cargar-sepomex.mjs";

const MUESTRA = [
  "El Catálogo Nacional de Códigos Postales, es elaborado por Correos de México…",
  "d_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|c_estado|c_oficina|c_CP|c_tipo_asenta|c_mnpio|id_asenta_cpcons|d_zona|c_cve_ciudad",
  "37000|León de los Aldama Centro|Colonia|León|Guanajuato|León de los Aldama|37001|11|37001||09|020|0001|Urbano|01",
  "37280|Jardines del Moral|Fraccionamiento|León|Guanajuato|León de los Aldama|37001|11|37001||21|020|0420|Urbano|01",
  "",
].join("\r\n");

test("parsea las filas y arma la clave de municipio", () => {
  const filas = parsearSepomex(MUESTRA);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[1], {
    codigo_postal: "37280", nombre: "Jardines del Moral", tipo: "Fraccionamiento",
    municipio: "León", estado: "Guanajuato", clave_municipio: "11020",
  });
});

test("rechaza un archivo sin los encabezados esperados", () => {
  assert.throws(() => parsearSepomex("hola\nmundo"), /encabezados/);
});
```

- [ ] **Step 2:** `cd desktop && node --test scripts/cargar-sepomex.test.mjs` → FAIL (no existe el módulo).

- [ ] **Step 3: Implementar** `desktop/scripts/cargar-sepomex.mjs`

```js
// Carga el catálogo de Correos de México (CPdescarga.txt) en sepomex_asentamientos (0187).
//
//   SEPOMEX_DB_URL=postgres://… node scripts/cargar-sepomex.mjs C:/ruta/CPdescarga.txt
//
// Vacía y recarga en UNA transacción: repetirlo con un archivo nuevo es seguro, y si algo falla la
// tabla queda como estaba. El archivo no se versiona. La URL es la de la base (producción o la local
// de dev); el script no la escribe en ningún lado.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ENCABEZADOS = ["d_codigo", "d_asenta", "d_tipo_asenta", "D_mnpio", "d_estado", "d_ciudad", "d_CP", "c_estado", "c_oficina", "c_CP", "c_tipo_asenta", "c_mnpio"];

export function parsearSepomex(texto) {
  const lineas = texto.split(/\r?\n/);
  const i = lineas.findIndex((l) => l.startsWith("d_codigo|"));
  if (i < 0 || !ENCABEZADOS.every((e, k) => lineas[i].split("|")[k] === e)) throw new Error("El archivo no trae los encabezados de SEPOMEX");
  const col = Object.fromEntries(lineas[i].split("|").map((n, k) => [n, k]));
  return lineas.slice(i + 1).filter((l) => l.trim()).map((l) => {
    const c = l.split("|");
    return {
      codigo_postal: c[col.d_codigo], nombre: c[col.d_asenta].trim(), tipo: c[col.d_tipo_asenta],
      municipio: c[col.D_mnpio], estado: c[col.d_estado], clave_municipio: c[col.c_estado] + c[col.c_mnpio],
    };
  });
}

async function cargar(ruta, url) {
  const filas = parsearSepomex(readFileSync(ruta, "latin1"));
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("TRUNCATE sepomex_asentamientos RESTART IDENTITY");
    for (let i = 0; i < filas.length; i += 5000) {
      await db.query(
        `INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio)
         SELECT codigo_postal, nombre, tipo, municipio, estado, clave_municipio
           FROM jsonb_to_recordset($1::jsonb) AS x(codigo_postal text, nombre text, tipo text, municipio text, estado text, clave_municipio text)`,
        [JSON.stringify(filas.slice(i, i + 5000))]);
    }
    await db.query("COMMIT");
    console.log(`✅ ${filas.length} asentamientos cargados`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ruta] = process.argv.slice(2);
  if (!ruta || !process.env.SEPOMEX_DB_URL) {
    console.error("Uso: SEPOMEX_DB_URL=postgres://… node scripts/cargar-sepomex.mjs <CPdescarga.txt>");
    process.exit(2);
  }
  await cargar(ruta, process.env.SEPOMEX_DB_URL);
}
```

(Norton hace MITM de TLS en esta máquina: si la conexión a producción falla por certificado, ver memoria `reference_entorno_windows_python` / usar el pooler de Supabase con `sslmode=require`; no desactivar la verificación sin hablarlo.)

- [ ] **Step 4:** `node --test scripts/cargar-sepomex.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add desktop/scripts/cargar-sepomex.mjs desktop/scripts/cargar-sepomex.test.mjs && git commit -m "feat(colonias): script de carga de SEPOMEX"`

---

### Task 7: Datos de colonias en la caja (`apps/pos/app/lib/colonias.ts`)

**Files:**
- Create: `apps/pos/app/lib/colonias.ts`
- Test: `apps/pos/app/lib/__tests__/colonias.test.ts`

**Interfaces:**
- Consumes: `ZonaEnvio`, `zonaVigente` de `./zonas-envio`; `employeeClient` de `./supabase`.
- Produces:
  - `type Colonia = { id: string; nombre: string; codigoPostal: string | null; zona: ZonaEnvio | null }`
  - `normalizarColonia(texto: string): string`
  - `ordenarSugerencias(lista: Colonia[], q: string): Colonia[]` (empieza-con primero, luego alfabético, máximo 8)
  - `etiquetaColonia(c: Colonia): string` → `"San José · 37000"` con CP, `"San José"` sin él
  - `hayColonias(token, sucursalId): Promise<boolean>`
  - `buscarColonias(token, sucursalId, q, vigentes: ZonaEnvio[]): Promise<Colonia[]>`
  - `coloniaExacta(token, sucursalId, nombre, vigentes): Promise<Colonia | null>`
  - `crearColonia(token, { tenantId, sucursalId, nombre, codigoPostal, zonaId }): Promise<Colonia>`
  - `asignarZonaColonia(token, coloniaId, zonaId, autorizacionPinId: string | null): Promise<void>`

- [ ] **Step 1: Pruebas que fallan**

```ts
import { describe, expect, it } from "vitest";
import { etiquetaColonia, normalizarColonia, ordenarSugerencias, type Colonia } from "../colonias";

const c = (nombre: string, codigoPostal: string | null = null): Colonia => ({ id: nombre + codigoPostal, nombre, codigoPostal, zona: null });

describe("normalizarColonia", () => {
  it("quita acentos, mayúsculas y espacios de sobra como f_unaccent(lower(btrim()))", () => {
    expect(normalizarColonia("  SAN  José ")).toBe("san  jose");
    expect(normalizarColonia("Peñitas")).toBe("penitas");
  });
});

describe("ordenarSugerencias", () => {
  it("pone primero las que empiezan con lo escrito y corta en 8", () => {
    const lista = ["Barrio de San Juan", "San Juan Bosco", "Arboledas de San Juan", "San Juan de Abajo",
      "a1", "a2", "a3", "a4", "a5"].map((n) => c(n));
    const r = ordenarSugerencias(lista, "san ju");
    expect(r.slice(0, 2).map((x) => x.nombre)).toEqual(["San Juan Bosco", "San Juan de Abajo"]);
    expect(r).toHaveLength(8);
  });
});

describe("etiquetaColonia", () => {
  it("enseña el CP cuando lo hay", () => {
    expect(etiquetaColonia(c("Centro", "37000"))).toBe("Centro · 37000");
    expect(etiquetaColonia(c("Las Joyas"))).toBe("Las Joyas");
  });
});
```

- [ ] **Step 2:** `cd apps/pos && npx vitest run app/lib/__tests__/colonias.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
"use client";
import { employeeClient } from "./supabase";
import { zonaVigente, type ZonaEnvio } from "./zonas-envio";

// Catálogo de colonias de la sucursal (0187, ADR 0036). Sugiere la zona del domicilio; el
// domicilio guarda la suya. En el escritorio estas consultas van a la base local: sirven sin internet.

export type Colonia = { id: string; nombre: string; codigoPostal: string | null; zona: ZonaEnvio | null };

type Fila = { id: string; nombre: string; codigo_postal: string | null; zona: { id: string; nombre: string; costo_mxn: number } | null };

/** Igual que `nombre_busqueda` en la base: sin acentos, minúsculas, sin espacios de sobra en las orillas. */
export function normalizarColonia(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function ordenarSugerencias(lista: Colonia[], q: string): Colonia[] {
  const t = normalizarColonia(q);
  const empieza = (x: Colonia) => (normalizarColonia(x.nombre).startsWith(t) ? 0 : 1);
  return [...lista].sort((a, b) => empieza(a) - empieza(b) || a.nombre.localeCompare(b.nombre, "es")).slice(0, 8);
}

export function etiquetaColonia(c: Colonia): string {
  return c.codigoPostal ? `${c.nombre} · ${c.codigoPostal}` : c.nombre;
}

const COLUMNAS = "id, nombre, codigo_postal, zona:zonas_envio(id, nombre, costo_mxn)";

/** La zona embebida solo vale si sigue vigente, y con el precio de hoy (como `zonaVigente`). */
function mapear(f: Fila, vigentes: ZonaEnvio[]): Colonia {
  const zona = f.zona ? { id: f.zona.id, nombre: f.zona.nombre, costoMxn: Number(f.zona.costo_mxn) } : null;
  return { id: f.id, nombre: f.nombre, codigoPostal: f.codigo_postal, zona: zonaVigente(zona, vigentes) };
}

/** `%` y `_` del texto se buscan tal cual, no como comodines. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function hayColonias(token: string, sucursalId: string): Promise<boolean> {
  const { count, error } = await employeeClient(token).from("colonias")
    .select("id", { count: "exact", head: true }).eq("sucursal_id", sucursalId).is("deleted_at", null).limit(1);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function buscarColonias(token: string, sucursalId: string, q: string, vigentes: ZonaEnvio[]): Promise<Colonia[]> {
  const t = normalizarColonia(q);
  if (t.length < 2) return [];
  const { data, error } = await employeeClient(token).from("colonias").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).is("deleted_at", null)
    .like("nombre_busqueda", `%${escaparLike(t)}%`).limit(30);
  if (error) throw new Error(error.message);
  return ordenarSugerencias(((data ?? []) as unknown as Fila[]).map((f) => mapear(f, vigentes)), q);
}

/** La colonia del catálogo que se llama exactamente así (para domicilios ya guardados). Con homónimas, null. */
export async function coloniaExacta(token: string, sucursalId: string, nombre: string, vigentes: ZonaEnvio[]): Promise<Colonia | null> {
  const { data, error } = await employeeClient(token).from("colonias").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).is("deleted_at", null).eq("nombre_busqueda", normalizarColonia(nombre)).limit(2);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as Fila[];
  return filas.length === 1 ? mapear(filas[0]!, vigentes) : null;
}

export async function crearColonia(
  token: string,
  a: { tenantId: string; sucursalId: string; nombre: string; codigoPostal: string | null; zonaId: string | null },
): Promise<Colonia> {
  const { data, error } = await employeeClient(token).from("colonias")
    .insert({ tenant_id: a.tenantId, sucursal_id: a.sucursalId, nombre: a.nombre.trim(), codigo_postal: a.codigoPostal, zona_envio_id: a.zonaId })
    .select(COLUMNAS).single();
  if (error) throw new Error(error.message.includes("colonia_llave_uq") ? "Esa colonia ya está en el catálogo." : error.message);
  const f = data as unknown as Fila;
  return { id: f.id, nombre: f.nombre, codigoPostal: f.codigo_postal, zona: f.zona ? { id: f.zona.id, nombre: f.zona.nombre, costoMxn: Number(f.zona.costo_mxn) } : null };
}

export async function asignarZonaColonia(token: string, coloniaId: string, zonaId: string, autorizacionPinId: string | null): Promise<void> {
  const { error } = await employeeClient(token).rpc("asignar_zona_colonia", {
    p_colonia: coloniaId, p_zona: zonaId, p_autorizacion_pin_id: autorizacionPinId,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4:** vitest → PASS; `cd apps/pos && npx tsc --noEmit` → sin errores.
- [ ] **Step 5: Commit** — `git commit -m "feat(colonias): consulta y alta del catálogo en la caja"`

---

### Task 8: Buscador de colonia en el domicilio de la caja

**Files:**
- Create: `apps/pos/app/components/buscador-colonia.tsx`
- Modify: `apps/pos/app/components/modal-cliente-domicilio.tsx`
- Modify: `apps/pos/app/lib/clientes-domicilio.ts`
- Test: `apps/pos/app/lib/__tests__/clientes-domicilio.test.ts` (si existe; si no, crear) para `planColonia`

**Interfaces:**
- Consumes: todo lo de Task 7; `SelectorZona`; `ModalAutorizacionPin` (`apps/pos/app/components/modal-autorizacion-pin.tsx`, mismo uso que en `selector-zona.tsx:155-160`).
- Produces:
  - `DireccionInput` gana `colonia: string` (ya existe) + `coloniaCatalogo: Colonia | null` + `codigoPostal: string | null` + `guardarZonaEnColonia: boolean`.
  - `DireccionCliente` gana `colonia: string`.
  - `planColonia(dir: DireccionInput, hayCatalogo: boolean): { tipo: "nada" } | { tipo: "crear" } | { tipo: "asignar"; coloniaId: string } | { tipo: "cambiar"; coloniaId: string }` (pura: qué hacerle al catálogo al guardar).

- [ ] **Step 1: Prueba de `planColonia`**

```ts
import { describe, expect, it } from "vitest";
import { planColonia, type DireccionInput } from "../clientes-domicilio";

const zA = { id: "a", nombre: "A", costoMxn: 20 }, zB = { id: "b", nombre: "B", costoMxn: 30 };
const base: DireccionInput = { etiqueta: "Casa", calle: "x", numero: "1", colonia: "Las Joyas", referencias: "", zona: zA, coloniaCatalogo: null, codigoPostal: null, guardarZonaEnColonia: false };

describe("planColonia", () => {
  it("sin catálogo no hace nada", () => expect(planColonia(base, false)).toEqual({ tipo: "nada" }));
  it("texto que no está en el catálogo se da de alta", () => expect(planColonia(base, true)).toEqual({ tipo: "crear" }));
  it("colonia sin zona: se le asigna la del pedido", () =>
    expect(planColonia({ ...base, coloniaCatalogo: { id: "c", nombre: "Las Joyas", codigoPostal: null, zona: null } }, true)).toEqual({ tipo: "asignar", coloniaId: "c" }));
  it("zona distinta sin la casilla: solo el pedido", () =>
    expect(planColonia({ ...base, zona: zB, coloniaCatalogo: { id: "c", nombre: "Las Joyas", codigoPostal: null, zona: zA } }, true)).toEqual({ tipo: "nada" }));
  it("zona distinta con la casilla: cambiarla (pide PIN)", () =>
    expect(planColonia({ ...base, zona: zB, guardarZonaEnColonia: true, coloniaCatalogo: { id: "c", nombre: "Las Joyas", codigoPostal: null, zona: zA } }, true)).toEqual({ tipo: "cambiar", coloniaId: "c" }));
  it("sin zona en el pedido no toca el catálogo salvo el alta", () =>
    expect(planColonia({ ...base, zona: null, coloniaCatalogo: { id: "c", nombre: "Las Joyas", codigoPostal: null, zona: null } }, true)).toEqual({ tipo: "nada" }));
  it("colonia en blanco: nada", () => expect(planColonia({ ...base, colonia: "  " }, true)).toEqual({ tipo: "nada" }));
});
```

- [ ] **Step 2:** vitest → FAIL.

- [ ] **Step 3: `clientes-domicilio.ts`**

```ts
export type DireccionInput = {
  etiqueta: string; calle: string; numero: string; colonia: string; referencias: string;
  zona: ZonaEnvio | null;
  /** La colonia elegida de las sugerencias (null = escrita a mano o sin catálogo). */
  coloniaCatalogo: Colonia | null;
  /** CP de la colonia elegida; null = el de la sucursal. */
  codigoPostal: string | null;
  /** Casilla «Guardar esta zona para la colonia» (cambiar una zona ya asignada pide PIN). */
  guardarZonaEnColonia: boolean;
};

/** Qué hacerle al catálogo al guardar el domicilio. Pura, con pruebas. */
export function planColonia(dir: DireccionInput, hayCatalogo: boolean):
  { tipo: "nada" } | { tipo: "crear" } | { tipo: "asignar"; coloniaId: string } | { tipo: "cambiar"; coloniaId: string } {
  if (!hayCatalogo || !dir.colonia.trim()) return { tipo: "nada" };
  const c = dir.coloniaCatalogo;
  if (!c) return { tipo: "crear" };
  if (!dir.zona) return { tipo: "nada" };
  if (!c.zona) return { tipo: "asignar", coloniaId: c.id };
  if (dir.zona.id !== c.zona.id && dir.guardarZonaEnColonia) return { tipo: "cambiar", coloniaId: c.id };
  return { tipo: "nada" };
}
```

En `agregarDireccionCliente`: `codigo_postal: args.dir.codigoPostal || s.codigo_postal || "00000",`. En `FilaDir`/`mapDir`/`DireccionCliente` añadir `colonia` (ya viene en el select). Actualizar `DIR_VACIA` en el modal con `coloniaCatalogo: null, codigoPostal: null, guardarZonaEnColonia: false`.

- [ ] **Step 4: `buscador-colonia.tsx`**

Componente controlado, mismo estilo de input que el modal (`input`/`label` del modal; muévelos a una constante compartida solo si se usan en los dos archivos).

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { buscarColonias, type Colonia } from "../lib/colonias";
import type { ZonaEnvio } from "../lib/zonas-envio";

const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Colonia con sugerencias del catálogo de la sucursal, como la búsqueda por teléfono: desde 2
 * letras, 300 ms, hasta 8. Elegir una llena zona y CP (lo hace quien lo usa con `onElegir`).
 * Sin catálogo es un campo de texto como siempre.
 */
export function BuscadorColonia({ token, sucursalId, hayCatalogo, zonas, texto, onTexto, onElegir, className }: {
  token: string; sucursalId: string; hayCatalogo: boolean; zonas: ZonaEnvio[];
  texto: string; onTexto: (t: string) => void; onElegir: (c: Colonia) => void; className: string;
}) {
  const [res, setRes] = useState<Colonia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const ultima = useRef(0);

  useEffect(() => {
    if (!hayCatalogo || !abierto || texto.trim().length < 2) { setRes([]); return; }
    const n = ++ultima.current;
    const t = setTimeout(() => {
      buscarColonias(token, sucursalId, texto, zonas)
        .then((r) => { if (n === ultima.current) { setRes(r); setActivo(-1); } })
        .catch(() => { if (n === ultima.current) setRes([]); });   // sin sugerencias: se escribe a mano
    }, 300);
    return () => clearTimeout(t);
  }, [token, sucursalId, texto, zonas, hayCatalogo, abierto]);

  function elegir(c: Colonia) { onElegir(c); setAbierto(false); setRes([]); }

  return (
    <div className="relative">
      <input className={className} value={texto} maxLength={150} role="combobox" aria-expanded={abierto && res.length > 0}
        aria-autocomplete="list" autoComplete="off"
        onChange={(e) => { onTexto(e.target.value); setAbierto(true); }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (!res.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, res.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && activo >= 0) { e.preventDefault(); elegir(res[activo]!); }
        }} />
      {abierto && res.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-line bg-surface shadow-[0_8px_24px_rgba(22,22,26,.12)]">
          {res.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === activo}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(c)}
                className={["flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-13", i === activo ? "bg-hover" : "hover:bg-hover"].join(" ")}>
                <span className="truncate font-medium">{c.nombre}{c.codigoPostal && <span className="ml-1.5 font-mono text-12 text-ink-3">{c.codigoPostal}</span>}</span>
                <span className="shrink-0 text-12 text-ink-3">{c.zona ? `${c.zona.nombre} · ${fmtMxn(c.zona.costoMxn)}` : "Sin zona"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

El escape de `Escape` del POS es una pila compartida (memoria `reference_arbitraje_escape_pos`): si al abrir la lista `Escape` cierra el modal entero en vez de la lista, declara la capa como hacen las otras pantallas. No es requisito de esta tarea si el comportamiento actual (Escape cierra el modal) se mantiene.

«Agregar» no necesita botón: escribir un nombre que no está y guardar ya lo da de alta (`planColonia` → `crear`). Bajo el campo, cuando hay catálogo, texto escrito y ninguna sugerencia elegida: `<p className="mt-1 text-12 text-ink-3">«{texto}» se agregará al catálogo de colonias.</p>`.

- [ ] **Step 5: Integrar en `modal-cliente-domicilio.tsx`**

1. Estado `const [hayCatalogo, setHayCatalogo] = useState(false);` cargado junto a `listarZonas` con `hayColonias(token, sucursalId).then(setHayCatalogo).catch(() => setHayCatalogo(false))`.
2. `CamposDireccion` recibe `hayCatalogo` y reemplaza el input de Colonia (línea 45) por:

```tsx
<div>
  <span className={label}>Colonia *</span>
  <BuscadorColonia token={token} sucursalId={sucursalId} hayCatalogo={hayCatalogo} zonas={zonas} className={input}
    texto={dir.colonia}
    onTexto={(t) => onCambio({ ...dir, colonia: t, coloniaCatalogo: null, codigoPostal: null, guardarZonaEnColonia: false })}
    onElegir={(c) => onCambio({ ...dir, colonia: c.nombre, coloniaCatalogo: c, codigoPostal: c.codigoPostal, zona: c.zona ?? dir.zona, guardarZonaEnColonia: false })} />
  {hayCatalogo && dir.colonia.trim() && !dir.coloniaCatalogo && <p className="mt-1 text-12 text-ink-3">«{dir.colonia.trim()}» se agregará al catálogo de colonias.</p>}
</div>
```

3. Debajo del `SelectorZona`, la casilla, solo cuando la colonia elegida tiene zona y la del pedido es otra:

```tsx
{dir.coloniaCatalogo?.zona && dir.zona && dir.zona.id !== dir.coloniaCatalogo.zona.id && (
  <label className="mt-2 flex items-center gap-2 text-13 text-ink-2">
    <input type="checkbox" checked={dir.guardarZonaEnColonia} onChange={(e) => onCambio({ ...dir, guardarZonaEnColonia: e.target.checked })} />
    Guardar {dir.zona.nombre} para {dir.coloniaCatalogo.nombre} (pide PIN)
  </label>
)}
```

4. Función `async function aplicarColonia(d: DireccionInput): Promise<void>` en el modal, llamada en `registrar()` y `agregarDireccion()` DESPUÉS de guardar el domicilio y ANTES de `onSeleccionar`:

```ts
const plan = planColonia(d, hayCatalogo);
try {
  if (plan.tipo === "crear") await crearColonia(token, { tenantId, sucursalId, nombre: d.colonia, codigoPostal: null, zonaId: d.zona?.id ?? null });
  if (plan.tipo === "asignar") await asignarZonaColonia(token, plan.coloniaId, d.zona!.id, null);
} catch (e) {
  // El domicilio ya quedó guardado y el pedido sigue: el catálogo se arregla después, pero se dice.
  setAvisoColonia(e instanceof Error ? e.message : "No se pudo actualizar el catálogo de colonias");
}
```

   Para `plan.tipo === "cambiar"`: antes de guardar, abrir `ModalAutorizacionPin` con
   `payload={{ accion: "editar_zona_colonia", permisoCodigo: "descuento.override_precio", entidadTipo: "colonia", entidadId: plan.coloniaId, monto: 0, motivo: \`Zona de ${d.colonia}: de ${d.coloniaCatalogo!.zona!.nombre} a ${d.zona!.nombre}\`, cajaId, turnoId }}`;
   en `onAutorizado(a)` → `asignarZonaColonia(token, plan.coloniaId, d.zona!.id, a.autorizacionPinId)` y luego seguir con el guardado normal. Si cancela el PIN, se guarda el domicilio sin tocar el catálogo (la zona vale solo para el pedido). Revisar en `lib/autorizacion.ts` si `accion` es una lista cerrada; si lo es, añadir `"editar_zona_colonia"`.
   `avisoColonia` se pinta como el aviso de zonas, pero NO bloquea `onSeleccionar`.

5. `elegirDireccion` (línea 181): si no hay zona vigente pero `hayCatalogo`, antes de pedirla:

```ts
const delCatalogo = hayCatalogo ? await coloniaExacta(token, sucursalId, d.colonia, zonas).catch(() => null) : null;
if (delCatalogo?.zona) {
  await fijarZonaDireccion(token, d.id, delCatalogo.zona.id);
  onSeleccionar(conDireccion(c, { ...d, zona: delCatalogo.zona }));
  return;
}
```

   (`elegirDireccion` pasa a `async`; los `onClick` llaman `void elegirDireccion(c, d)`.)

6. Textos de ayuda (líneas 256 y 309): «CP, ciudad y estado se toman de la sucursal» → «El CP sale de la colonia; ciudad y estado, de la sucursal.» solo cuando `hayCatalogo`.

- [ ] **Step 6: Verificar**

Run: `cd apps/pos && npx vitest run && npx tsc --noEmit` → todo en verde.

- [ ] **Step 7: Verificar en el navegador** (POS web contra Supabase local con Crazy Burgers; memoria `reference_verificar_rama_con_capturas` para levantar el worktree; `reference_reproducir_pos_sin_docker` si no hay Docker). Cargar SEPOMEX en la base local con el script de Task 6 (o insertar a mano 5 colonias de León) y sembrar desde el admin (Task 9) o con `select sembrar_colonias(...)` como dueño. Casos: «san jo» sugiere con zona y precio; elegir llena zona; escribir «Colonia Inventada» y guardar la da de alta; cambiar zona con la casilla pide PIN; sin la casilla no lo pide. Captura de cada uno.

- [ ] **Step 8: Commit** — `git commit -m "feat(colonias): la colonia sugiere y fija la zona en el domicilio de la caja"`

---

### Task 9: Pantalla de colonias en el admin

**Files:**
- Create: `apps/admin/app/lib/colonias.ts` + `apps/admin/app/lib/__tests__/colonias.test.ts`
- Create: `apps/admin/app/components/envios-pestanas.tsx`
- Create: `apps/admin/app/(panel)/configuracion/envios/colonias/page.tsx`
- Modify: `apps/admin/app/(panel)/configuracion/envios/page.tsx` (añadir `<EnviosPestanas />` arriba, como `LealtadPestanas`)

**Interfaces:**
- Produces (admin lib):
  - `type ColoniaAdmin = { id: string; nombre: string; codigoPostal: string | null; origen: "SEPOMEX" | "CAPTURADA"; zonaId: string | null }`
  - `listarColonias(sucursalId, { q, sinZona, pagina }): Promise<{ filas: ColoniaAdmin[]; total: number }>` (50 por página, `.range()`, orden por nombre, filtro `nombre_busqueda like %q%` con `normalizarColonia`/escape iguales a la caja)
  - `sembrarColonias(sucursalId): Promise<{ insertadas: number; heredadas: number }>`
  - `asignarZona(ids: string[], zonaId: string | null): Promise<void>` (`update({ zona_envio_id }).in("id", ids)` — el dueño pasa la política)
  - `crearColonia(sucursalId, { nombre, codigoPostal, zonaId })`, `eliminarColonia(id)` (con `borrarSuave` de `./datos`)
  - `mensajeSiembra(r): string` (pura: «Se cargaron 812 colonias; 37 ya tienen zona por tus domicilios.» / «No había colonias nuevas.»)
  - `coloniaSchema` (zod): nombre 2-150, CP `^\d{5}$` opcional.

- [ ] **Step 1: Pruebas que fallan** de `mensajeSiembra`, `coloniaSchema` y del filtro (`filtroBusqueda("  San JOSÉ%")` → `"%san jose\\%%"`).
- [ ] **Step 2:** `cd apps/admin && npx vitest run app/lib/__tests__/colonias.test.ts` → FAIL.
- [ ] **Step 3: Implementar la lib** siguiendo `apps/admin/app/lib/zonas-envio.ts` (mismo `supabase`, `tenantId`, `borrarSuave`). Traducir errores de la base: `CP_DESCONOCIDO` → «La sucursal no tiene un código postal válido. Captúralo en Configuración → Sucursales.»; `colonia_llave_uq` → «Esa colonia ya está en el catálogo.»; `ZONA_INVALIDA` → «Esa zona no se puede usar aquí.».
- [ ] **Step 4: `envios-pestanas.tsx`**

```tsx
"use client";
import { Pestanas } from "./pestanas";

const PESTANAS = [
  { label: "Zonas", href: "/configuracion/envios" },
  { label: "Colonias", href: "/configuracion/envios/colonias" },
];

/** Las dos pestañas de Configuración → Envíos. */
export function EnviosPestanas() {
  return <Pestanas etiqueta="Secciones de envíos" pestanas={PESTANAS} />;
}
```

- [ ] **Step 5: La página** `configuracion/envios/colonias/page.tsx`, con la misma estructura que `envios/page.tsx` (`PageHeader`, `PageBody`, selector de sucursal, `mensajeError`):
  - Catálogo vacío: tarjeta con «Aún no hay colonias en {sucursal}.» y botón «Cargar colonias de {municipio}» (el municipio se pregunta con `select municipio from sepomex_asentamientos where codigo_postal = <cp de la sucursal> limit 1`; si no hay, el botón dice «Cargar colonias» y el error explica el CP). Al terminar, el aviso de `mensajeSiembra`.
  - Con catálogo: buscador (300 ms), casilla «Solo sin zona», contador «N colonias · M sin zona», tabla con casilla por fila, Nombre, CP, Origen («Oficial» / «Capturada»), Zona (select por fila que guarda al cambiar con `asignarZona([id], …)`), botón borrar con `DialogoPeligro`.
  - Barra de selección: «{k} seleccionadas · Asignar zona [select] [Aplicar]».
  - «Agregar colonia» abre un `Modal` con nombre, CP opcional y zona.
  - Paginación «Anteriores / Siguientes» de 50.
  - Los selects de zona listan las zonas de la sucursal (`listarZonas` de `../../../../lib/zonas-envio`) menos las de tramo: filtrar las que `tienda_sucursales.tramos_envio` incluye (léelas con `select tramos_envio from tienda_sucursales where sucursal_id = …`; sin fila, ninguna es de tramo).
  - Cargar `frontend-design` / skills de Emil antes del CSS; mismo vocabulario visual que `envios/page.tsx` (no inventar estilos: `docs/diseno/` + `tokens.css`).
- [ ] **Step 6:** `cd apps/admin && npx vitest run && npx tsc --noEmit` → verde.
- [ ] **Step 7: Navegador** (admin local, entrar sin contraseña como dice la memoria `project_rediseno_admin`): sembrar, ver heredadas, filtrar «Solo sin zona», asignar 3 en bloque, agregar una a mano, borrarla. Capturas.
- [ ] **Step 8: Commit** — `git commit -m "feat(colonias): pestaña Colonias en Configuración → Envíos"`

---

### Task 10: La colonia decide el envío en la tienda (SQL)

**Files:**
- Modify: `supabase/migrations/0187_catalogo_colonias.sql` (§6)
- Modify: `supabase/scripts/smoke_colonias.sql` (sección 7)
- Modify: `supabase/scripts/smoke_tienda_envio_distancia.sql` (firmas)

**Interfaces:**
- Produces:
  - `_tienda_zona_de_colonia(p_tenant uuid, p_sucursal uuid, p_colonia uuid) RETURNS TABLE (zona_id uuid, costo_mxn numeric)`
  - `tienda_colonias(p_tenant uuid, p_sucursal uuid, p_q text) RETURNS jsonb` → `[{id, nombre, codigo_postal, con_zona}]`, máximo 8
  - `tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items, p_punto jsonb DEFAULT NULL, p_colonia uuid DEFAULT NULL)` — `cobro` puede ser `'COLONIA'`
  - `tienda_crear_pedido(…, p_punto jsonb DEFAULT NULL, p_colonia uuid DEFAULT NULL)`
  - `tienda_negocio`: cada sucursal pública trae `"colonias": boolean`

**Regla (spec §6, aclarada):** a domicilio, si `p_colonia` es una colonia viva de la sucursal con zona viva, activa y no de tramo → esa zona y su precio, se ignoran `p_zona` y `p_punto`, y `cobro = 'COLONIA'`. Si no → exactamente lo de hoy según `tienda_sucursales.cobro_envio` («Por distancia»: el mapa; «Por zonas»: la zona elegida). Una sucursal «Por zonas» no tiene tramos utilizables, así que «mapa si hay tramos, si no selector» del spec es lo mismo que «el modo de la sucursal».

- [ ] **Step 1: Sección 7 del smoke.** El fixture es el de `smoke_tienda_envio_distancia.sql` adaptado: la fila de `tienda_sucursales` ya existe desde la sección 2, así que se actualiza. Declarar `v_q jsonb; v_uno text; v_p120 uuid; v_cat uuid; v_aje uuid; v_cli_tienda jsonb; v_dir_tienda jsonb; h_todo jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';`.

```sql
  -- ── 7) Tienda ────────────────────────────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_tarjeta) VALUES (v_t, 'colonias-smoke', true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  UPDATE tienda_sucursales SET participa = true, recoger = true, domicilio = true, horario = h_todo,
                               cobro_envio = 'ZONAS', tramos_envio = '[]' WHERE sucursal_id = v_suc;
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Colonias smoke', 62) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla colonias', 120) RETURNING id INTO v_p120;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-COL', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  v_uno := format('[{"producto_id":"%s","cantidad":1}]', v_p120);
  v_cli_tienda := '{"nombre":"Ana Colonia","telefono":"4775550187"}';
  v_dir_tienda := '{"calle":"Av. Pedido","numero_exterior":"12","colonia":"San José","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}';

  -- 7a) búsqueda
  v_r := tienda_colonias(v_t, v_suc, 'SAN jo');
  IF jsonb_array_length(v_r) = 0 OR v_r -> 0 ->> 'nombre' <> 'San José' OR v_r::text LIKE '%' || v_z_centro || '%'
     OR (v_r -> 0) ? 'zona_envio_id' THEN
    RAISE EXCEPTION '7a: búsqueda: %', v_r;
  END IF;
  IF tienda_colonias(v_t, v_suc, 'a') <> '[]'::jsonb OR tienda_colonias(v_t, v_suc_o, 'san') <> '[]'::jsonb
     OR tienda_colonias(v_t, v_suc, '%') <> '[]'::jsonb THEN
    RAISE EXCEPTION '7a: una letra, otra sucursal o un comodín no debían traer nada';
  END IF;
  -- 7b) colonia con zona: manda, aunque el navegador mande otra zona.
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_col);
  IF v_q ->> 'cobro' <> 'COLONIA' OR v_q ->> 'envio_mxn' <> '25.00' OR (v_q ->> 'zona_id')::uuid <> v_z_centro THEN
    RAISE EXCEPTION '7b: %', v_q - 'items' - 'renglones';
  END IF;
  -- 7c) colonia sin zona («Por zonas»): la zona elegida, como siempre.
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_libre);   -- v_libre quedó sin zona en 5)
  IF v_q ->> 'cobro' <> 'ZONAS' OR (v_q ->> 'zona_id')::uuid <> v_z_norte THEN RAISE EXCEPTION '7c: %', v_q - 'items' - 'renglones'; END IF;
  -- 7d) colonia cuya zona se desactivó: igual que sin zona.
  UPDATE zonas_envio SET activa = false WHERE id = v_z_centro;
  v_e := pg_temp.error_de(format('SELECT tienda_cotizar(%L, %L, %L, NULL, %L, NULL, %L)', v_t, v_suc, 'DOMICILIO', v_uno, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '7d: sin zona válida y sin elegir zona (dio %)', v_e; END IF;
  UPDATE zonas_envio SET activa = true WHERE id = v_z_centro;
  -- 7e) colonia de otra sucursal (y de otro negocio): no cuenta; cobra la zona elegida.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, zona_envio_id) VALUES (v_otro, v_suc_o, 'Ajena con zona', v_z_otra) RETURNING id INTO v_aje;
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_aje);
  IF v_q ->> 'cobro' <> 'ZONAS' OR (v_q ->> 'zona_id')::uuid <> v_z_norte THEN RAISE EXCEPTION '7e: %', v_q - 'items' - 'renglones'; END IF;
  -- 7f) el pedido se crea con la zona de la colonia.
  v_r := tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, v_cli_tienda, v_dir_tienda,
                             'EFECTIVO', NULL, NULL, encode(sha256('colonias-smoke'::bytea), 'hex'),
                             p_colonia => v_col);
  IF (SELECT zona_envio_id FROM delivery_pedidos WHERE id = (v_r ->> 'id')::uuid) IS DISTINCT FROM v_z_centro THEN
    RAISE EXCEPTION '7f: el pedido debía llevar la zona de la colonia';
  END IF;
  -- 7g) tienda_negocio dice si la sucursal tiene colonias.
  IF NOT ((SELECT s FROM jsonb_array_elements(tienda_negocio('colonias-smoke') -> 'publico' -> 'sucursales') s WHERE s ->> 'id' = v_suc::text) ->> 'colonias')::boolean THEN
    RAISE EXCEPTION '7g: tienda_negocio debía decir colonias = true';
  END IF;
  -- 7h) privilegios.
  IF has_function_privilege('authenticated', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', '_tienda_zona_de_colonia(uuid, uuid, uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('tienda_cotizar', 'tienda_crear_pedido') GROUP BY proname HAVING count(*) > 1) THEN
    RAISE EXCEPTION '7h: privilegios o firmas';
  END IF;
```

  Cómo sale la zona del pedido y el nombre de su columna: mirar `delivery_pedidos` y lo que devuelve `tienda_crear_pedido` en el smoke 0185 (§ «El alta del pedido») y ajustar solo la consulta de 7f a eso; lo que se prueba no cambia (el pedido lleva Centro, no Norte).

- [ ] **Step 2:** smoke → FAIL (`tienda_colonias` no existe).

- [ ] **Step 3: §6 de la migración**

```sql
-- ── §6 tienda ────────────────────────────────────────────────────────────────
-- La zona que una colonia le da a la tienda: viva, activa, de la sucursal y no de un tramo.
CREATE OR REPLACE FUNCTION _tienda_zona_de_colonia(p_tenant uuid, p_sucursal uuid, p_colonia uuid)
RETURNS TABLE (zona_id uuid, costo_mxn numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT z.id, z.costo_mxn
    FROM colonias c
    JOIN zonas_envio z ON z.id = c.zona_envio_id
   WHERE c.id = p_colonia AND c.tenant_id = p_tenant AND c.sucursal_id = p_sucursal AND c.deleted_at IS NULL
     AND z.sucursal_id = p_sucursal AND z.activa AND z.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM tienda_sucursales ts
                      WHERE ts.sucursal_id = p_sucursal
                        AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', z.id::text)));
$$;
REVOKE ALL ON FUNCTION _tienda_zona_de_colonia(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _tienda_zona_de_colonia(uuid, uuid, uuid) TO service_role;

-- Sugerencias para el formulario de la tienda. Sin precio ni id de zona: solo si tiene.
-- De 2 a 60 caracteres; `%` y `_` se buscan tal cual.
CREATE OR REPLACE FUNCTION tienda_colonias(p_tenant uuid, p_sucursal uuid, p_q text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH q AS (SELECT f_unaccent(lower(btrim(coalesce(p_q, '')))) AS t),
       l AS (SELECT t, replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') AS esc FROM q)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'codigo_postal', x.codigo_postal,
                                               'con_zona', x.con_zona) ORDER BY x.empieza DESC, x.nombre), '[]'::jsonb)
    FROM (SELECT c.id, c.nombre, c.codigo_postal,
                 c.nombre_busqueda LIKE l.esc || '%' AS empieza,
                 EXISTS (SELECT 1 FROM _tienda_zona_de_colonia(p_tenant, p_sucursal, c.id)) AS con_zona
            FROM colonias c, l
           WHERE c.tenant_id = p_tenant AND c.sucursal_id = p_sucursal AND c.deleted_at IS NULL
             AND char_length(l.t) BETWEEN 2 AND 60
             AND c.nombre_busqueda LIKE '%' || l.esc || '%'
           ORDER BY empieza DESC, c.nombre
           LIMIT 8) x;
$$;
REVOKE ALL ON FUNCTION tienda_colonias(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_colonias(uuid, uuid, text) TO service_role;
```

  Después, tres copias íntegras de la 0185 con cambios marcados `-- 0187`:

  1. **`tienda_cotizar`**: `DROP FUNCTION IF EXISTS tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb);` y recrear con `p_colonia uuid DEFAULT NULL` al final. Declarar `v_cobro text;` y `v_col record;`. Al entrar a `IF p_modo = 'DOMICILIO' THEN`, tras leer `v_ts`:

```sql
    -- 0187: la colonia con zona decide el envío, cobre como cobre la sucursal. La zona y el punto
    -- que mande el navegador no cuentan (así no se elige una zona más barata).
    SELECT * INTO v_col FROM _tienda_zona_de_colonia(p_tenant, p_sucursal, p_colonia);
    IF v_col.zona_id IS NOT NULL THEN
      v_zona := v_col.zona_id; v_envio := v_col.costo_mxn; v_cobro := 'COLONIA';
    ELSIF v_ts.cobro_envio IS NOT DISTINCT FROM 'DISTANCIA' THEN
```

  (el `IF v_ts.cobro_envio … THEN` de siempre pasa a `ELSIF`, y su `ELSE` queda igual). Donde la función arma `'cobro'` en el resultado, usar `coalesce(v_cobro, <lo de hoy>)`. Con `p_modo = 'RECOGER'`, `p_colonia` se ignora. `REVOKE`/`GRANT` con la firma nueva `(uuid, uuid, text, uuid, jsonb, jsonb, uuid)`.

  2. **`tienda_crear_pedido`**: `DROP FUNCTION IF EXISTS tienda_crear_pedido(<firma 0185 de 17 parámetros>);` y recrear con `p_colonia uuid DEFAULT NULL` al final; la llamada pasa a `tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items, p_punto, p_colonia);`. Nada más cambia (el `v_q ->> 'zona_id'` ya es la zona que lleva el pedido; confirmar que es lo que se guarda).

  3. **`tienda_negocio`**: copia íntegra; en el objeto de cada sucursal pública, junto a `'envio'`, añadir:

```sql
           -- 0187: si tiene catálogo de colonias (la tienda sugiere y la colonia puede decidir el envío).
           'colonias', EXISTS (SELECT 1 FROM colonias c WHERE c.sucursal_id = s.id AND c.deleted_at IS NULL),
```

  Buscar otros llamadores con la firma vieja: `grep -rn "tienda_cotizar(\|tienda_crear_pedido(" supabase/migrations/01[7-8]*.sql supabase/functions supabase/scripts supabase/tests`. La caja instalada tiene su propia copia de `crear_ticket_desde_tienda`, que no se toca.

- [ ] **Step 4: Actualizar `smoke_tienda_envio_distancia.sql`** (sección 3): las firmas pasan a `tienda_cotizar(uuid, uuid, text, uuid, jsonb, jsonb, uuid)` y `tienda_crear_pedido(…, jsonb, uuid)` (la de 18 parámetros).
- [ ] **Step 5:** `cd desktop && npm run smokes` → todos en verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(colonias): en la tienda la colonia con zona decide el envío (0187 §6)"`

---

### Task 11: Función `tienda` y proxy de la tienda

**Files:**
- Modify: `supabase/functions/_shared/tienda/validar.ts` + `validar.test.ts`
- Modify: `supabase/functions/_shared/tienda/respuesta.ts` + `respuesta.test.ts` (si `cotizacionPublica` filtra `cobro`)
- Modify: `supabase/functions/tienda/index.ts`
- Modify: `apps/tienda/app/api/tienda/route.ts`, `apps/tienda/app/lib/api.ts` (+ `__tests__/api.test.ts`), `apps/tienda/app/lib/contrato.ts`

**Interfaces:**
- Produces:
  - Petición `{ accion: "colonias"; negocio: string; sucursal_id: string; q: string }` → respuesta `[{ id, nombre, codigo_postal, con_zona }]`.
  - `cotizar` y `pedir` aceptan `colonia_id: string | null` (uuid o null; otra cosa → `DIRECCION_INVALIDA`); solo cuenta con `modo = "DOMICILIO"`.
  - `contrato.ts`: `Sucursal.colonias: boolean`; `Cotizacion.cobro: "ZONAS" | "DISTANCIA" | "COLONIA"`; `type ColoniaSugerida = { id: string; nombre: string; codigo_postal: string | null; con_zona: boolean }`.
  - `api.ts`: `colonias(negocio, sucursalId, q, signal?): Promise<Resultado<ColoniaSugerida[]>>`.

- [ ] **Step 1: Pruebas que fallan** en `validar.test.ts`:

```ts
it("colonias: lee sucursal y texto", () => {
  expect(leerPeticion({ accion: "colonias", negocio: "knockout", sucursal_id: ID, q: " san jo " }))
    .toEqual({ ok: true, valor: { accion: "colonias", negocio: "knockout", sucursal_id: ID, q: "san jo" } });
});
it("colonias: rechaza texto de más de 60", () => {
  expect(leerPeticion({ accion: "colonias", negocio: "knockout", sucursal_id: ID, q: "x".repeat(61) }).ok).toBe(false);
});
it("cotizar: colonia_id uuid o null; a recoger se descarta", () => {
  expect(leerPeticion({ ...COTIZAR_DOMICILIO, colonia_id: ID2 })).toMatchObject({ ok: true, valor: { colonia_id: ID2 } });
  expect(leerPeticion({ ...COTIZAR_DOMICILIO, colonia_id: "nope" }).ok).toBe(false);
  expect(leerPeticion({ ...COTIZAR_RECOGER, colonia_id: ID2 })).toMatchObject({ ok: true, valor: { colonia_id: null } });
});
```

  (Usar los nombres de función y fixtures que ya tiene `validar.test.ts`.) En `apps/tienda/app/lib/__tests__/api.test.ts`, que `colonias()` mande `{ accion: "colonias", negocio, sucursal_id, q }`.

- [ ] **Step 2:** `cd supabase/functions && deno test _shared/tienda/validar.test.ts` (o el comando que use el repo para esos tests; ver CI) y `cd apps/tienda && npx vitest run` → FAIL.
- [ ] **Step 3: Implementar**
  - `validar.ts`: añadir `"colonias"` a la lista de acciones, su variante del tipo `Peticion`, el `case` (texto con `textoLimpio(x.q, 60)`, mínimo 2 tras recortar, `sucursal_id` uuid) y `colonia_id` en `cotizar`/`pedir` (`null` si el modo no es DOMICILIO).
  - `index.ts`: tratar `colonias` como `menu` (después de resolver el negocio y comprobar que la sucursal es suya):

```ts
  if (p.accion === "colonias") {
    const r = await admin.rpc("tienda_colonias", { p_tenant, p_sucursal, p_q: p.q });
    return r.error ? rechazo("tienda_colonias", r.error) : json(r.data);
  }
```

    y en `carrito`: `...(p.colonia_id && { p_colonia: p.colonia_id })`. Cupos: darle a `colonias` el mismo trato que `cotizar` en `cuposDe` (lectura); confirmar dónde se define y añadir el caso.
  - `respuesta.ts`: si `cotizacionPublica` enumera los valores de `cobro`, añadir `"COLONIA"`; `zona_id` sigue sin salir.
  - `route.ts`: dejar pasar `accion === "colonias"` igual que `cotizar` (sin sesión).
  - `api.ts`/`contrato.ts`: lo de Interfaces; leer la respuesta con la misma validación de forma que usan las otras (`cotizacionDe`…), rechazando lo que no sea una lista de esos objetos.
- [ ] **Step 4:** tests → PASS; `cd apps/tienda && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(colonias): acción colonias y colonia_id en la función tienda"`

---

### Task 12: Colonia con sugerencias en la tienda

**Files:**
- Create: `apps/tienda/app/components/campo-colonia.tsx`
- Modify: `apps/tienda/app/components/datos.tsx` (campo colonia ≈ 729; zona ≈ 146, 696; pin ≈ 148-223)
- Modify: `apps/tienda/app/components/cuenta.tsx` (≈ 122)
- Modify: `apps/tienda/app/components/entrega.tsx`
- Modify: el estado del carrito/pasos donde «a domicilio por zonas» exige `zonaId` antes de seguir (buscar `zonaId` en `apps/tienda/app/lib/pasos.ts`, `pantalla.ts`, `carrito.ts`)
- Test: `apps/tienda/app/lib/__tests__/` (pruebas de la regla de qué se enseña)

**Interfaces:**
- Consumes: `colonias()` de `lib/api.ts`, `ColoniaSugerida`, `Sucursal.colonias`, `Cotizacion.cobro`.
- Produces:
  - `CampoColonia({ negocio, sucursalId, valor, alEscribir, alElegir })`: input con lista (2 letras, 300 ms, 8; teclado ↑↓ Enter; `role="combobox"`), `alElegir(c: ColoniaSugerida)`.
  - `DireccionDePedido` gana `colonia_id?: string | null` (no se guarda en la cuenta).
  - `envioEnDatos(sucursal, cotizacion, coloniaElegida): "colonia" | "mapa" | "zona" | "nada"` (pura, en `lib/pantalla.ts`):
    - `"colonia"` si `cotizacion?.cobro === "COLONIA"`;
    - si no, `"mapa"` con `sucursal.envio.cobro === "DISTANCIA"`;
    - si no, `"zona"` con `sucursal.colonias` y más de una zona (el selector se mueve aquí desde el carrito);
    - si no, `"nada"` (el carrito ya pidió la zona, como hoy).

**Comportamiento:**
- **Carrito (`entrega.tsx`)**, «Por zonas» y `sucursal.colonias`: no enseña el select; dice «El envío se calcula con tu colonia.» (TEXTO PROVISIONAL James) y el carrito deja seguir sin zona. Sin catálogo, todo igual que hoy.
- **Datos:** el campo Colonia es `CampoColonia` cuando `sucursal.colonias`. Elegir una sugerencia llena colonia y CP, guarda `colonia_id` y vuelve a cotizar con él (igual que cuando se mueve el pin). Escribir encima borra `colonia_id`.
  - `envioEnDatos === "colonia"`: «Envío a {colonia}: $X» donde hoy va «Zona de entrega»; no se enseña el mapa ni el select.
  - `"mapa"`: el mapa de siempre.
  - `"zona"`: el select de zonas de `entrega.tsx`, movido a un componente `SelectorDeZona` que usan los dos.
- **Direcciones guardadas de la cuenta:** al elegir una, si `sucursal.colonias`, llamar `colonias(negocio, sucursalId, direccion.colonia)` y tomar la que coincida exacto (mismo nombre normalizado y mismo CP); si hay, se usa su `id` para cotizar.
- **Cuenta (`cuenta.tsx`):** el campo colonia también sugiere y llena el CP (no guarda `colonia_id`).
- Errores: `ZONA_INVALIDA` con colonia sin zona en «Por zonas» → el mensaje de siempre, marcando el select de `"zona"`.

- [ ] **Step 1: Prueba que falla** de `envioEnDatos` (los cuatro casos, más: cobro `COLONIA` gana aunque la sucursal sea «Por distancia»).
- [ ] **Step 2:** `cd apps/tienda && npx vitest run` → FAIL.
- [ ] **Step 3: Implementar** `envioEnDatos`, `CampoColonia`, `SelectorDeZona` y los cambios de arriba. Los textos nuevos llevan `// TEXTO PROVISIONAL (James).`.
- [ ] **Step 4:** vitest + `npx tsc --noEmit` → verde.
- [ ] **Step 5: Navegador** (tienda local, sucursal de prueba con catálogo sembrado; memoria `reference_verificar_sitio_vista_previa`: capturas entre pasos). Casos: «Por zonas» con colonia con zona (sin select, envío correcto); colonia sin zona (aparece el select en Datos); «Por distancia» con colonia sin zona (mapa); con colonia con zona (sin mapa); dirección guardada; vista de celular (375 px). Capturas de cada uno.
- [ ] **Step 6: Commit** — `git commit -m "feat(colonias): la tienda sugiere colonias y la colonia decide el envío"`

---

### Task 13: ADR, revisión final y entrega

**Files:**
- Create: `docs/decisiones/0036-la-colonia-sugiere-la-zona.md`
- Modify: `docs/superpowers/specs/2026-10-15-catalogo-colonias-design.md` (solo si la implementación se apartó del spec: `sembrar_colonias` devuelve `{insertadas, heredadas}`, la regla aclarada de la tienda)

- [ ] **Step 1: ADR 0036** con el formato de `docs/decisiones/0035-el-envio-por-distancia-es-una-zona-por-tramo.md`: contexto (texto libre, zona de memoria), decisión (la colonia sugiere; el domicilio guarda su zona; SEPOMEX solo en la nube; PIN solo para cambiar una zona asignada; en la tienda la colonia con zona manda), consecuencias (cambiar la zona de una colonia no toca domicilios viejos; el último que escribe gana entre caja y panel, como las zonas; una caja vieja sigue con texto libre).
- [ ] **Step 2: Todo en verde:** `cd desktop && npm run smokes`; `node --test src/sync-push.test.mjs src/sync-pull.test.mjs scripts/cargar-sepomex.test.mjs`; `npx vitest run` y `npx tsc --noEmit` en `apps/pos`, `apps/admin`, `apps/tienda`; los tests de Deno de `_shared/tienda`.
- [ ] **Step 3: Revisión de rama** con `superpowers:requesting-code-review` (o `code-review` a nivel high) y, por tocar RLS y una función pública, `security-review`.
- [ ] **Step 4: Commit** — `git commit -m "docs(colonias): ADR 0036"`
- [ ] **Step 5: Parar y preguntar a Fermín** antes de cualquier paso a producción. El orden, cuando dé el OK (memoria `reference_migraciones_antes_del_merge`):
  1. Bajar `CPdescarga.txt` a mano y cargarlo en producción con `cargar-sepomex.mjs`.
  2. Respaldo del esquema, comprobar el número 0187 y aplicar la migración (`supabase db push --linked`, `--include-all` si hace falta).
  3. Desplegar la función `tienda` (memoria `reference_deploy_funciones_publicas`: conserva `verify_jwt=false`).
  4. Push, PR, CI en verde, merge.
  5. Instalador 0.12.0 (RUNBOOK; nunca un `.exe` < ~155 MB; memoria `feedback_empaquetar_instaladores`): lista de lo que incluye y esperar OK.
  6. Sembrar colonias de Knock-Out desde el admin y revisar con Fermín las heredadas.
