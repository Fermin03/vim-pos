# Recetas con costeo, proveedores y compras — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel admin pueda dar de alta recetas con costo y margen por producto, y registrar compras a proveedores (a mano o desde el XML del CFDI) que alimenten existencias y costo promedio.

**Architecture:** Una migración aditiva (0099) crea proveedores, compras, líneas y alias, más tres RPC `SECURITY INVOKER` bajo RLS que hacen el trabajo transaccional; el panel (Next.js, cliente Supabase en el navegador) solo valida con Zod, convierte unidades y llama a los RPC. El lector de XML y el cálculo de costo son funciones puras probadas con vitest. Las funciones SQL de venta, cancelación y devolución no se tocan.

**Tech Stack:** Postgres/Supabase (plpgsql, RLS, pgTAP), Next.js 14 app router (`apps/admin`), supabase-js, Zod, vitest (+ jsdom solo para la prueba del lector de XML), Tailwind con tokens de `@vim/ui`.

**Spec:** `docs/superpowers/specs/2026-09-03-recetas-y-compras-design.md` (decisión: `docs/decisiones/0012-compras-y-proveedores.md`).

## Global Constraints

- Toda tabla nueva lleva `tenant_id` + política RLS `FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())`. Ninguna ruta del admin usa `service_role`.
- Dinero en `numeric`, nunca float: importes `numeric(12,2)`, costos unitarios `numeric(14,6)`, cantidades `numeric(14,3)`.
- Dominio en español y SQL en `snake_case`; archivos `kebab-case`; componentes `PascalCase`; sin `any` (usar `unknown` + Zod).
- Una migración aplicada en remoto no se edita: todo cambio es una migración aditiva. Tras la migración correr `pnpm db:types`.
- `receta_componentes.cantidad` sigue en la unidad del insumo. Las funciones `descontar_inventario_por_venta`, `reversar_inventario_por_cancelacion` y `reversar_inventario_por_devolucion` **no se modifican**.
- Verificar tipos con `pnpm --filter ./apps/admin typecheck` (`tsc --noEmit`); **nunca** `next build` con el dev server arriba (comparten `.next`).
- Copy de pantallas según `docs/diseno/admin.md`: filas 40 px, números a la derecha con `tabular-nums`, negativos en `text-danger`, acciones peligrosas con confirmación que nombra la consecuencia, rangos de fecha que no permiten futuro ni inicio > fin.
- Smokes SQL se corren contra el Supabase local: `psql "<DB_URL de supabase status>" -f supabase/scripts/<archivo>.sql` y terminan en `ROLLBACK`. Usan el tenant seed `99999999-0000-0000-0000-0000000000aa`, sucursal `…bb`, dueño `…e1`, y `set_config('request.jwt.claims', …)` para que `current_tenant_id()` resuelva.
- Commits en español, un commit por tarea, con la línea final `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0099_compras_proveedores_recetas.sql` | Enums, tablas, RLS, índices, trigger de folio, trigger de costo, columnas nuevas, `guardar_receta` |
| `supabase/migrations/0100_registrar_anular_compra.sql` | `registrar_compra`, `anular_compra` |
| `supabase/scripts/smoke_recetas.sql` | Smoke de `guardar_receta` + trigger de costo |
| `supabase/scripts/smoke_compras.sql` | Smoke de registrar, promedio, anular, UUID repetido |
| `supabase/tests/0009_compras_rls.test.sql` | pgTAP cross-tenant de `compras` y `proveedores` |
| `apps/admin/app/lib/recetas.ts` | Conversión de unidades, costo y margen (puro) + acceso a datos de recetas |
| `apps/admin/app/lib/__tests__/recetas.test.ts` | Pruebas de la parte pura |
| `apps/admin/app/lib/cfdi-recibido.ts` | Lector puro del XML CFDI 4.0 |
| `apps/admin/app/lib/__tests__/cfdi-recibido.test.ts` | Pruebas con jsdom |
| `apps/admin/app/lib/proveedores.ts` | CRUD de proveedores |
| `apps/admin/app/lib/compras.ts` | Listar, obtener, registrar, anular compras; alias; totales (puro) |
| `apps/admin/app/lib/__tests__/compras.test.ts` | Pruebas de totales y armado de líneas |
| `apps/admin/app/(panel)/catalogo/recetas/page.tsx` | Lista de recetas con margen |
| `apps/admin/app/(panel)/catalogo/recetas/[productoId]/page.tsx` | Editor de receta |
| `apps/admin/app/(panel)/inventario/proveedores/page.tsx` | Catálogo de proveedores |
| `apps/admin/app/(panel)/inventario/compras/page.tsx` | Lista de compras |
| `apps/admin/app/(panel)/inventario/compras/[id]/page.tsx` | Detalle y anulación |
| `apps/admin/app/(panel)/inventario/compras/nueva/page.tsx` | Nueva compra (manual o XML) |
| `apps/admin/app/components/catalogo-tabs.tsx` | Pestaña "Recetas" |
| `apps/admin/app/(panel)/inventario/page.tsx` | Accesos a compras y proveedores; quitar `ENTRADA_COMPRA` del modal |
| `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx` | Enlace "Receta y costo" |

Las rutas nuevas `/catalogo/recetas` e `/inventario/…` quedan cubiertas por los prefijos `/catalogo` e `/inventario` de `MIN_JERARQUIA` en `apps/admin/app/lib/acceso.ts` (jerarquía 4); **no hay que tocar ese archivo**.

---

### Task 1: Migración 0099 — esquema, triggers y `guardar_receta`

**Files:**
- Create: `supabase/migrations/0099_compras_proveedores_recetas.sql`
- Create: `supabase/scripts/smoke_recetas.sql`

**Interfaces:**
- Consumes: `current_tenant_id()`, `set_updated_at()` (0001), `generar_folio(p_sucursal_id, p_tipo_documento)` (0003), `recalcular_costo_recetas(p_insumo_id)` (0007), trigger existente `trg_componentes_recalcular_costo` sobre `receta_componentes`.
- Produces: tablas `proveedores`, `compras`, `compra_lineas`, `proveedor_insumo_alias`; enums `compra_origen`, `compra_estado`; columnas `movimientos_inventario.compra_id`, `receta_componentes.cantidad_capturada`, `receta_componentes.unidad_capturada_id`; función `guardar_receta(p_producto_id uuid, p_activa boolean, p_notas text, p_componentes jsonb) RETURNS uuid`.

- [ ] **Step 1: Escribir el smoke que debe fallar**

`supabase/scripts/smoke_recetas.sql`:

```sql
-- Smoke recetas (spec 2026-09-03 §4.3, §3.6): guardar_receta crea/actualiza y reemplaza componentes;
-- el costo se recalcula al guardar y al editar el costo del insumo a mano. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_pza uuid; v_g uuid; v_carne uuid; v_pan uuid; v_prod uuid; v_receta uuid;
  v_costo numeric; v_n int; v_version int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1;
  SELECT id INTO v_g   FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='G' LIMIT 1;
  IF v_pza IS NULL OR v_g IS NULL THEN RAISE EXCEPTION 'faltan unidades PZA/G (seed 0035)'; END IF;

  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Carne smoke', v_g, 'CARNICOS', 0.18) RETURNING id INTO v_carne;      -- $0.18/g
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan smoke', v_pza, 'PANIFICACION', 4) RETURNING id INTO v_pan;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND deleted_at IS NULL LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'no hay producto seed'; END IF;
  DELETE FROM recetas WHERE producto_id = v_prod;

  -- 1) Crear: 150 g carne + 1 pan = 27 + 4 = 31
  v_receta := guardar_receta(v_prod, true, 'Plancha 3 min', jsonb_build_array(
    jsonb_build_object('insumo_id', v_carne, 'cantidad', 150, 'cantidad_capturada', 150, 'unidad_capturada_id', v_g, 'es_critico', true, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_pan,   'cantidad', 1,   'cantidad_capturada', 1,   'unidad_capturada_id', v_pza, 'es_critico', true, 'notas', NULL, 'orden', 1)));
  SELECT costo_total_mxn, version INTO v_costo, v_version FROM recetas WHERE id=v_receta;
  RAISE NOTICE 'costo tras crear: % (esperado 31) version % (esperado 1)', v_costo, v_version;
  IF v_costo <> 31 THEN RAISE EXCEPTION 'costo esperado 31, es %', v_costo; END IF;
  IF v_version <> 1 THEN RAISE EXCEPTION 'version esperada 1'; END IF;

  -- 2) Editar costo del insumo a mano → trigger nuevo recalcula: 150×0.20 + 4 = 34
  UPDATE insumos SET costo_unitario_mxn = 0.20 WHERE id = v_carne;
  SELECT costo_total_mxn INTO v_costo FROM recetas WHERE id=v_receta;
  RAISE NOTICE 'costo tras editar insumo: % (esperado 34)', v_costo;
  IF v_costo <> 34 THEN RAISE EXCEPTION 'el trigger de costo no recalculó (es %)', v_costo; END IF;

  -- 3) Reemplazar componentes: solo 2 panes = 8; version sube a 2
  PERFORM guardar_receta(v_prod, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_pan, 'cantidad', 2, 'cantidad_capturada', 2, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0)));
  SELECT costo_total_mxn, version INTO v_costo, v_version FROM recetas WHERE id=v_receta;
  SELECT count(*) INTO v_n FROM receta_componentes WHERE receta_id=v_receta;
  RAISE NOTICE 'tras reemplazar: costo % (8) componentes % (1) version % (2)', v_costo, v_n, v_version;
  IF v_costo <> 8 OR v_n <> 1 OR v_version <> 2 THEN RAISE EXCEPTION 'reemplazo de componentes incorrecto'; END IF;

  -- 4) Receta activa sin componentes → error
  BEGIN
    PERFORM guardar_receta(v_prod, true, NULL, '[]'::jsonb);
    RAISE EXCEPTION 'debió fallar: activa sin componentes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%al menos un insumo%' THEN RAISE; END IF;
  END;

  -- 5) Pausada sin componentes → permitido
  PERFORM guardar_receta(v_prod, false, NULL, '[]'::jsonb);
  IF (SELECT activa FROM recetas WHERE id=v_receta) THEN RAISE EXCEPTION 'debió quedar pausada'; END IF;

  RAISE NOTICE 'SMOKE RECETAS OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `psql "$DB_URL" -f supabase/scripts/smoke_recetas.sql`
Expected: `ERROR: function guardar_receta(uuid, boolean, unknown, jsonb) does not exist`

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0099_compras_proveedores_recetas.sql`:

```sql
-- 0099 — Compras con proveedores y recetas con pantalla (ADR 0012, spec 2026-09-03).
--
-- Supera D26 (proveedor como texto libre) y D31 (compras solo como movimientos). Aditiva:
-- tablas nuevas + columnas nullable en movimientos_inventario y receta_componentes + trigger que
-- recalcula el costo de recetas cuando el costo del insumo se edita a mano + RPC guardar_receta.
-- Las funciones de venta/cancelación/devolución NO cambian: siguen leyendo
-- receta_componentes.cantidad en la unidad del insumo.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE compra_origen AS ENUM ('MANUAL', 'XML');
CREATE TYPE compra_estado AS ENUM ('CONFIRMADA', 'ANULADA');

-- ---------------------------------------------------------------------------
-- 2. proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE proveedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre        varchar(200) NOT NULL,
  rfc           varchar(13) NULL,
  telefono      varchar(30) NULL,
  email         varchar(200) NULL,
  notas         text NULL,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz NULL,
  deleted_by    uuid NULL REFERENCES auth.users(id),
  CONSTRAINT proveedor_rfc_formato CHECK (rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$')
);
CREATE INDEX idx_proveedores_tenant ON proveedores(tenant_id);
CREATE UNIQUE INDEX idx_proveedores_rfc_unico ON proveedores(tenant_id, rfc)
  WHERE rfc IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY proveedores_tenant ON proveedores FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_proveedores_updated_at BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE proveedores IS 'Catálogo de proveedores por negocio (ADR 0012, supera D26).';

-- ---------------------------------------------------------------------------
-- 3. compras (documento) + compra_lineas
-- ---------------------------------------------------------------------------
CREATE TABLE compras (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id           uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  proveedor_id          uuid NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  folio_completo        varchar(50) NULL,
  folio_consecutivo     bigint NULL,
  fecha                 date NOT NULL,
  referencia_documento  varchar(100) NULL,
  cfdi_uuid             uuid NULL,
  origen                compra_origen NOT NULL DEFAULT 'MANUAL',
  subtotal_mxn          numeric(12,2) NOT NULL CHECK (subtotal_mxn >= 0),
  iva_mxn               numeric(12,2) NOT NULL CHECK (iva_mxn >= 0),
  total_mxn             numeric(12,2) NOT NULL CHECK (total_mxn >= 0),
  notas                 text NULL,
  estado                compra_estado NOT NULL DEFAULT 'CONFIRMADA',
  usuario_id            uuid NOT NULL REFERENCES auth.users(id),
  dia_contable          date NOT NULL,
  anulada_at            timestamptz NULL,
  anulada_por           uuid NULL REFERENCES auth.users(id),
  motivo_anulacion      text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_total_cuadra CHECK (total_mxn = subtotal_mxn + iva_mxn)
);
CREATE INDEX idx_compras_tenant ON compras(tenant_id);
CREATE INDEX idx_compras_tenant_fecha ON compras(tenant_id, fecha DESC);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE UNIQUE INDEX idx_compras_cfdi_uuid ON compras(tenant_id, cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;
CREATE UNIQUE INDEX idx_compras_folio ON compras(sucursal_id, folio_completo) WHERE folio_completo IS NOT NULL;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_tenant ON compras FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_compras_updated_at BEFORE UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE compras IS 'Compra recibida a un proveedor. Cada línea genera un ENTRADA_COMPRA (ADR 0012, supera D31).';

CREATE OR REPLACE FUNCTION trg_compra_folio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_folio record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.folio_completo IS NULL THEN
    SELECT folio_completo, consecutivo INTO v_folio FROM generar_folio(NEW.sucursal_id, 'COMPRA', NULL);
    NEW.folio_completo := v_folio.folio_completo;
    NEW.folio_consecutivo := v_folio.consecutivo;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_compras_folio BEFORE INSERT ON compras
  FOR EACH ROW EXECUTE FUNCTION trg_compra_folio();

CREATE TABLE compra_lineas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  compra_id               uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  insumo_id               uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  descripcion_origen      varchar(500) NULL,
  cantidad_capturada      numeric(14,3) NOT NULL CHECK (cantidad_capturada > 0),
  unidad_capturada_id     uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
  cantidad                numeric(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario_mxn      numeric(14,6) NOT NULL CHECK (costo_unitario_mxn >= 0),
  importe_mxn             numeric(12,2) NOT NULL CHECK (importe_mxn >= 0),
  movimiento_id           uuid NULL REFERENCES movimientos_inventario(id) ON DELETE SET NULL,
  movimiento_reversa_id   uuid NULL REFERENCES movimientos_inventario(id) ON DELETE SET NULL,
  orden                   integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compra_lineas_tenant ON compra_lineas(tenant_id);
CREATE INDEX idx_compra_lineas_compra ON compra_lineas(compra_id);
CREATE INDEX idx_compra_lineas_insumo ON compra_lineas(insumo_id);
ALTER TABLE compra_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY compra_lineas_tenant ON compra_lineas FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
COMMENT ON COLUMN compra_lineas.cantidad IS 'Ya en la unidad del insumo. cantidad_capturada/unidad_capturada_id es como se tecleó o vino en el XML.';

-- ---------------------------------------------------------------------------
-- 4. proveedor_insumo_alias — memoria de emparejamiento XML → insumo
-- ---------------------------------------------------------------------------
CREATE TABLE proveedor_insumo_alias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  proveedor_id        uuid NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  clave_origen        varchar(120) NOT NULL,
  descripcion_origen  varchar(500) NULL,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id           uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
  factor              numeric(20,10) NOT NULL CHECK (factor > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alias_unico UNIQUE (proveedor_id, clave_origen)
);
CREATE INDEX idx_alias_tenant ON proveedor_insumo_alias(tenant_id);
ALTER TABLE proveedor_insumo_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY alias_tenant ON proveedor_insumo_alias FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_alias_updated_at BEFORE UPDATE ON proveedor_insumo_alias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN proveedor_insumo_alias.factor IS 'Unidades del insumo por una unidad del proveedor. CAJA 12 PZ → 12.';

-- ---------------------------------------------------------------------------
-- 5. Columnas nuevas en tablas existentes
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_inventario ADD COLUMN compra_id uuid NULL REFERENCES compras(id) ON DELETE SET NULL;
CREATE INDEX idx_movimientos_compra ON movimientos_inventario(compra_id) WHERE compra_id IS NOT NULL;

ALTER TABLE receta_componentes
  ADD COLUMN cantidad_capturada numeric(14,3) NULL CHECK (cantidad_capturada IS NULL OR cantidad_capturada > 0),
  ADD COLUMN unidad_capturada_id uuid NULL REFERENCES unidades_medida(id) ON DELETE SET NULL;
COMMENT ON COLUMN receta_componentes.cantidad_capturada IS 'Solo para mostrar. NULL = capturada en la unidad del insumo. La cantidad operativa sigue en `cantidad`.';

-- ---------------------------------------------------------------------------
-- 6. Trigger: editar costo del insumo a mano recalcula recetas (hueco conocido)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_insumo_costo_recalcula_recetas() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.costo_unitario_mxn IS DISTINCT FROM OLD.costo_unitario_mxn THEN
    PERFORM recalcular_costo_recetas(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_insumos_costo_recetas AFTER UPDATE OF costo_unitario_mxn ON insumos
  FOR EACH ROW EXECUTE FUNCTION trg_insumo_costo_recalcula_recetas();

-- ---------------------------------------------------------------------------
-- 7. guardar_receta — upsert de cabecera + reemplazo de componentes en una transacción
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guardar_receta(
  p_producto_id uuid,
  p_activa      boolean,
  p_notas       text,
  p_componentes jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant   uuid := current_tenant_id();
  v_usuario  uuid := auth.uid();
  v_receta   uuid;
  v_n        int;
  v_distintos int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM productos WHERE id = p_producto_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'El producto no existe o no es de tu negocio';
  END IF;

  v_n := COALESCE(jsonb_array_length(p_componentes), 0);
  IF p_activa AND v_n = 0 THEN
    RAISE EXCEPTION 'Una receta activa necesita al menos un insumo';
  END IF;
  SELECT count(DISTINCT c->>'insumo_id') INTO v_distintos FROM jsonb_array_elements(p_componentes) c;
  IF v_distintos <> v_n THEN RAISE EXCEPTION 'Hay insumos repetidos en la receta'; END IF;

  SELECT id INTO v_receta FROM recetas WHERE producto_id = p_producto_id AND tenant_id = v_tenant;
  IF v_receta IS NULL THEN
    INSERT INTO recetas (tenant_id, producto_id, activa, notas_preparacion, created_by, updated_by)
    VALUES (v_tenant, p_producto_id, p_activa, p_notas, v_usuario, v_usuario)
    RETURNING id INTO v_receta;
  ELSE
    UPDATE recetas
       SET activa = p_activa, notas_preparacion = p_notas, version = version + 1,
           updated_by = v_usuario, updated_at = now()
     WHERE id = v_receta;
  END IF;

  DELETE FROM receta_componentes WHERE receta_id = v_receta;
  INSERT INTO receta_componentes (tenant_id, receta_id, insumo_id, cantidad, cantidad_capturada,
                                  unidad_capturada_id, es_critico, notas, orden_visualizacion)
  SELECT v_tenant, v_receta, (c->>'insumo_id')::uuid, (c->>'cantidad')::numeric,
         NULLIF(c->>'cantidad_capturada','')::numeric, NULLIF(c->>'unidad_capturada_id','')::uuid,
         COALESCE((c->>'es_critico')::boolean, true), NULLIF(c->>'notas',''),
         COALESCE((c->>'orden')::int, 0)
  FROM jsonb_array_elements(p_componentes) c;

  -- Si quedó sin componentes el trigger no dispara: dejar el costo en 0.
  IF v_n = 0 THEN UPDATE recetas SET costo_total_mxn = 0 WHERE id = v_receta; END IF;

  RETURN v_receta;
END $$;
COMMENT ON FUNCTION guardar_receta IS 'Upsert de receta 1:1 con producto + reemplazo de componentes. Cantidades ya en la unidad del insumo (el panel convierte). Spec 2026-09-03 §4.3.';
```

- [ ] **Step 4: Aplicar y correr el smoke**

Run: `supabase db reset` (o `supabase migration up` si ya hay datos que conservar) y luego
`psql "$DB_URL" -f supabase/scripts/smoke_recetas.sql`
Expected: termina con `NOTICE: SMOKE RECETAS OK` y `ROLLBACK`.

Si el paso 2 del smoke falla con costo 31 en vez de 34, revisa que el trigger sea `AFTER UPDATE OF costo_unitario_mxn` y que `recalcular_costo_recetas` exista con esa firma (0007 §9).

- [ ] **Step 5: Regenerar tipos y verificar RLS de cobertura**

Run: `pnpm db:types && supabase test db`
Expected: `0002_rls_cobertura.test.sql` en verde (recorre todas las tablas con `tenant_id`, incluidas las cuatro nuevas).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0099_compras_proveedores_recetas.sql supabase/scripts/smoke_recetas.sql packages/db/src/database.types.ts
git commit -m "db: proveedores, compras, alias y guardar_receta (migración 0099, ADR 0012)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migración 0100 — `registrar_compra` y `anular_compra`

**Files:**
- Create: `supabase/migrations/0100_registrar_anular_compra.sql`
- Create: `supabase/scripts/smoke_compras.sql`

**Interfaces:**
- Consumes: tablas de la Task 1; `aplicar_movimiento_inventario(p_tenant_id, p_sucursal_id, p_insumo_id, p_tipo, p_cantidad, p_costo_unitario_mxn, p_usuario_id, p_motivo, p_descripcion, p_ticket_id, p_proveedor_texto, p_factura_referencia) RETURNS uuid` (0007 §9); `calcular_dia_contable(p_tenant_id uuid, p_ts timestamptz) RETURNS date` (0002).
- Produces: `registrar_compra(p_compra jsonb) RETURNS uuid` y `anular_compra(p_compra_id uuid, p_motivo text) RETURNS void`. El JSON de entrada es exactamente el de la spec §4.1 (el `usuario_id` sale de `auth.uid()`, no del JSON).

- [ ] **Step 1: Escribir el smoke que debe fallar**

`supabase/scripts/smoke_compras.sql`:

```sql
-- Smoke compras (spec 2026-09-03 §4.1, §4.2): registrar_compra genera ENTRADA_COMPRA por línea,
-- actualiza existencias y costo promedio, guarda alias; anular_compra regresa existencias con
-- DEVOLUCION_PROVEEDOR sin tocar el costo promedio; el mismo cfdi_uuid no se registra dos veces. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_pza uuid; v_caja uuid; v_prov uuid; v_insumo uuid; v_c1 uuid; v_c2 uuid;
  v_stock numeric; v_costo numeric; v_folio text; v_estado text; v_n int; v_movs int; v_factor numeric;
  v_uuid uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_pza  FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1;
  SELECT id INTO v_caja FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='CAJ' LIMIT 1;
  IF v_pza IS NULL OR v_caja IS NULL THEN RAISE EXCEPTION 'faltan unidades PZA/CAJ (seed 0035)'; END IF;

  INSERT INTO proveedores(tenant_id, nombre, rfc) VALUES (v_tenant, 'Panificadora Smoke', 'PSM010101AB1') RETURNING id INTO v_prov;
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan brioche smoke', v_pza, 'PANIFICACION', 10) RETURNING id INTO v_insumo;

  -- 1) Compra de 2 cajas de 12 = 24 pzas a $12.50 (importe 300) desde XML, con alias.
  v_c1 := registrar_compra(jsonb_build_object(
    'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-03', 'referencia_documento', 'A 1234',
    'cfdi_uuid', v_uuid, 'origen', 'XML', 'notas', NULL, 'iva_mxn', 48.00,
    'lineas', jsonb_build_array(jsonb_build_object(
      'insumo_id', v_insumo, 'descripcion_origen', 'PAN BRIOCHE CAJA 12 PZ',
      'cantidad_capturada', 2, 'unidad_capturada_id', v_caja,
      'cantidad', 24, 'costo_unitario_mxn', 12.5, 'importe_mxn', 300.00)),
    'aliases', jsonb_build_array(jsonb_build_object(
      'clave_origen', 'PB-12', 'descripcion_origen', 'PAN BRIOCHE CAJA 12 PZ',
      'insumo_id', v_insumo, 'unidad_id', v_caja, 'factor', 12))));

  SELECT folio_completo, estado::text, total_mxn INTO v_folio, v_estado, v_costo FROM compras WHERE id=v_c1;
  RAISE NOTICE 'compra 1: folio % estado % total % (esperado K?-2026-…, CONFIRMADA, 348)', v_folio, v_estado, v_costo;
  IF v_folio IS NULL OR v_estado <> 'CONFIRMADA' OR v_costo <> 348 THEN RAISE EXCEPTION 'cabecera incorrecta'; END IF;

  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  RAISE NOTICE 'tras compra 1: stock % (24) costo % (12.5, promedio con stock 0)', v_stock, v_costo;
  IF v_stock <> 24 THEN RAISE EXCEPTION 'stock esperado 24'; END IF;
  IF round(v_costo, 2) <> 12.50 THEN RAISE EXCEPTION 'costo esperado 12.50, es %', v_costo; END IF;

  SELECT count(*) INTO v_movs FROM movimientos_inventario WHERE compra_id=v_c1 AND tipo='ENTRADA_COMPRA';
  IF v_movs <> 1 THEN RAISE EXCEPTION 'debe haber 1 ENTRADA_COMPRA ligada'; END IF;
  IF (SELECT movimiento_id FROM compra_lineas WHERE compra_id=v_c1) IS NULL THEN RAISE EXCEPTION 'la línea no guardó movimiento_id'; END IF;
  SELECT factor INTO v_factor FROM proveedor_insumo_alias WHERE proveedor_id=v_prov AND clave_origen='PB-12';
  IF v_factor <> 12 THEN RAISE EXCEPTION 'alias no guardado'; END IF;

  -- 2) Segunda compra manual: 24 pzas a $15 → promedio ponderado (24×12.5 + 24×15)/48 = 13.75
  v_c2 := registrar_compra(jsonb_build_object(
    'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-04', 'referencia_documento', 'Nota 7',
    'cfdi_uuid', NULL, 'origen', 'MANUAL', 'notas', 'sin factura',
    'lineas', jsonb_build_array(jsonb_build_object(
      'insumo_id', v_insumo, 'descripcion_origen', NULL,
      'cantidad_capturada', 24, 'unidad_capturada_id', v_pza,
      'cantidad', 24, 'costo_unitario_mxn', 15, 'importe_mxn', 360.00)),
    'aliases', '[]'::jsonb));
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  SELECT iva_mxn, total_mxn INTO v_factor, v_stock FROM compras WHERE id=v_c2;
  RAISE NOTICE 'tras compra 2: costo % (13.75) iva % (57.6) total % (417.6)', v_costo, v_factor, v_stock;
  IF round(v_costo, 2) <> 13.75 THEN RAISE EXCEPTION 'promedio esperado 13.75'; END IF;
  IF v_factor <> 57.60 OR v_stock <> 417.60 THEN RAISE EXCEPTION 'IVA 16 % por defecto mal calculado'; END IF;

  -- 3) Anular la segunda: stock vuelve a 24, costo promedio NO cambia, estado ANULADA.
  PERFORM anular_compra(v_c2, 'Se devolvió al proveedor');
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  SELECT estado::text INTO v_estado FROM compras WHERE id=v_c2;
  SELECT count(*) INTO v_movs FROM movimientos_inventario WHERE compra_id=v_c2 AND tipo='DEVOLUCION_PROVEEDOR';
  RAISE NOTICE 'tras anular: stock % (24) costo % (13.75) estado % movs reversa % (1)', v_stock, v_costo, v_estado, v_movs;
  IF v_stock <> 24 OR round(v_costo,2) <> 13.75 OR v_estado <> 'ANULADA' OR v_movs <> 1 THEN RAISE EXCEPTION 'anulación incorrecta'; END IF;
  IF (SELECT movimiento_reversa_id FROM compra_lineas WHERE compra_id=v_c2) IS NULL THEN RAISE EXCEPTION 'la línea no guardó movimiento_reversa_id'; END IF;

  -- 4) Anular dos veces → error
  BEGIN
    PERFORM anular_compra(v_c2, 'otra vez');
    RAISE EXCEPTION 'debió fallar: ya anulada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ya está anulada%' THEN RAISE; END IF;
  END;

  -- 5) Mismo UUID → error con el folio de la compra existente
  BEGIN
    PERFORM registrar_compra(jsonb_build_object(
      'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-05', 'cfdi_uuid', v_uuid, 'origen', 'XML',
      'lineas', jsonb_build_array(jsonb_build_object('insumo_id', v_insumo, 'cantidad_capturada', 1,
        'unidad_capturada_id', v_pza, 'cantidad', 1, 'costo_unitario_mxn', 1, 'importe_mxn', 1)),
      'aliases', '[]'::jsonb));
    RAISE EXCEPTION 'debió fallar: uuid repetido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ya está registrada como la compra ' || v_folio || '%' THEN RAISE; END IF;
  END;

  -- 6) Sin líneas → error
  BEGIN
    PERFORM registrar_compra(jsonb_build_object('sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-05',
      'origen', 'MANUAL', 'lineas', '[]'::jsonb, 'aliases', '[]'::jsonb));
    RAISE EXCEPTION 'debió fallar: sin líneas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%al menos un insumo%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'SMOKE COMPRAS OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `psql "$DB_URL" -f supabase/scripts/smoke_compras.sql`
Expected: `ERROR: function registrar_compra(jsonb) does not exist`

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0100_registrar_anular_compra.sql`:

```sql
-- 0100 — registrar_compra / anular_compra (ADR 0012, spec 2026-09-03 §4.1 y §4.2).
-- SECURITY INVOKER: corren bajo RLS del usuario del panel. El usuario sale de auth.uid().

CREATE OR REPLACE FUNCTION registrar_compra(p_compra jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant     uuid := current_tenant_id();
  v_usuario    uuid := auth.uid();
  v_sucursal   uuid := (p_compra->>'sucursal_id')::uuid;
  v_proveedor  uuid := (p_compra->>'proveedor_id')::uuid;
  v_uuid       uuid := NULLIF(p_compra->>'cfdi_uuid','')::uuid;
  v_prov_nombre varchar(200);
  v_referencia varchar(100) := NULLIF(p_compra->>'referencia_documento','');
  v_folio_existente varchar(50);
  v_subtotal   numeric(12,2);
  v_iva        numeric(12,2);
  v_compra     uuid;
  v_folio      varchar(50);
  v_linea      record;
  v_mov        uuid;
  v_n          int;
BEGIN
  IF v_tenant IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;

  v_n := COALESCE(jsonb_array_length(p_compra->'lineas'), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'Una compra necesita al menos un insumo'; END IF;

  SELECT nombre INTO v_prov_nombre FROM proveedores
   WHERE id = v_proveedor AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_prov_nombre IS NULL THEN RAISE EXCEPTION 'El proveedor no existe o no es de tu negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = v_sucursal AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'La sucursal no existe o no es de tu negocio';
  END IF;

  IF v_uuid IS NOT NULL THEN
    SELECT folio_completo INTO v_folio_existente FROM compras WHERE tenant_id = v_tenant AND cfdi_uuid = v_uuid;
    IF v_folio_existente IS NOT NULL THEN
      RAISE EXCEPTION 'Esta factura ya está registrada como la compra %', v_folio_existente;
    END IF;
  END IF;

  SELECT COALESCE(SUM((l->>'importe_mxn')::numeric), 0) INTO v_subtotal
    FROM jsonb_array_elements(p_compra->'lineas') l;
  v_iva := COALESCE(NULLIF(p_compra->>'iva_mxn','')::numeric, round(v_subtotal * 0.16, 2));

  INSERT INTO compras (tenant_id, sucursal_id, proveedor_id, fecha, referencia_documento, cfdi_uuid, origen,
                       subtotal_mxn, iva_mxn, total_mxn, notas, usuario_id, dia_contable)
  VALUES (v_tenant, v_sucursal, v_proveedor, (p_compra->>'fecha')::date, v_referencia, v_uuid,
          COALESCE(NULLIF(p_compra->>'origen',''), 'MANUAL')::compra_origen,
          v_subtotal, v_iva, v_subtotal + v_iva, NULLIF(p_compra->>'notas',''), v_usuario,
          calcular_dia_contable(v_tenant, now()))
  RETURNING id, folio_completo INTO v_compra, v_folio;

  FOR v_linea IN
    SELECT (l->>'insumo_id')::uuid            AS insumo_id,
           NULLIF(l->>'descripcion_origen','') AS descripcion_origen,
           (l->>'cantidad_capturada')::numeric AS cantidad_capturada,
           (l->>'unidad_capturada_id')::uuid   AS unidad_capturada_id,
           (l->>'cantidad')::numeric           AS cantidad,
           (l->>'costo_unitario_mxn')::numeric AS costo_unitario_mxn,
           (l->>'importe_mxn')::numeric        AS importe_mxn,
           ord - 1                             AS orden
      FROM jsonb_array_elements(p_compra->'lineas') WITH ORDINALITY AS t(l, ord)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM insumos WHERE id = v_linea.insumo_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Uno de los insumos no existe o no es de tu negocio';
    END IF;

    v_mov := aplicar_movimiento_inventario(
      p_tenant_id := v_tenant, p_sucursal_id := v_sucursal, p_insumo_id := v_linea.insumo_id,
      p_tipo := 'ENTRADA_COMPRA'::movimiento_inventario_tipo, p_cantidad := v_linea.cantidad,
      p_costo_unitario_mxn := v_linea.costo_unitario_mxn, p_usuario_id := v_usuario,
      p_motivo := 'Compra ' || v_folio, p_descripcion := v_linea.descripcion_origen,
      p_ticket_id := NULL, p_proveedor_texto := v_prov_nombre, p_factura_referencia := v_referencia);
    UPDATE movimientos_inventario SET compra_id = v_compra WHERE id = v_mov;

    INSERT INTO compra_lineas (tenant_id, compra_id, insumo_id, descripcion_origen, cantidad_capturada,
                               unidad_capturada_id, cantidad, costo_unitario_mxn, importe_mxn, movimiento_id, orden)
    VALUES (v_tenant, v_compra, v_linea.insumo_id, v_linea.descripcion_origen, v_linea.cantidad_capturada,
            v_linea.unidad_capturada_id, v_linea.cantidad, v_linea.costo_unitario_mxn, v_linea.importe_mxn,
            v_mov, v_linea.orden);
  END LOOP;

  INSERT INTO proveedor_insumo_alias (tenant_id, proveedor_id, clave_origen, descripcion_origen, insumo_id, unidad_id, factor)
  SELECT v_tenant, v_proveedor, a->>'clave_origen', NULLIF(a->>'descripcion_origen',''),
         (a->>'insumo_id')::uuid, (a->>'unidad_id')::uuid, (a->>'factor')::numeric
    FROM jsonb_array_elements(COALESCE(p_compra->'aliases', '[]'::jsonb)) a
  ON CONFLICT (proveedor_id, clave_origen) DO UPDATE
    SET descripcion_origen = EXCLUDED.descripcion_origen, insumo_id = EXCLUDED.insumo_id,
        unidad_id = EXCLUDED.unidad_id, factor = EXCLUDED.factor, updated_at = now();

  RETURN v_compra;
END $$;
COMMENT ON FUNCTION registrar_compra IS 'Registra una compra recibida: cabecera + líneas + ENTRADA_COMPRA por línea + alias del proveedor. Spec 2026-09-03 §4.1.';

CREATE OR REPLACE FUNCTION anular_compra(p_compra_id uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_usuario uuid := auth.uid();
  v_compra  compras%ROWTYPE;
  v_linea   record;
  v_mov     uuid;
BEGIN
  IF v_tenant IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribe el motivo de la anulación'; END IF;

  SELECT * INTO v_compra FROM compras WHERE id = p_compra_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La compra no existe o no es de tu negocio'; END IF;
  IF v_compra.estado = 'ANULADA' THEN RAISE EXCEPTION 'Esta compra ya está anulada'; END IF;

  FOR v_linea IN SELECT * FROM compra_lineas WHERE compra_id = p_compra_id ORDER BY orden LOOP
    v_mov := aplicar_movimiento_inventario(
      p_tenant_id := v_tenant, p_sucursal_id := v_compra.sucursal_id, p_insumo_id := v_linea.insumo_id,
      p_tipo := 'DEVOLUCION_PROVEEDOR'::movimiento_inventario_tipo, p_cantidad := v_linea.cantidad,
      p_costo_unitario_mxn := v_linea.costo_unitario_mxn, p_usuario_id := v_usuario,
      p_motivo := 'Anulación de compra ' || v_compra.folio_completo || ': ' || trim(p_motivo),
      p_descripcion := v_linea.descripcion_origen, p_ticket_id := NULL,
      p_proveedor_texto := NULL, p_factura_referencia := v_compra.referencia_documento);
    UPDATE movimientos_inventario SET compra_id = p_compra_id WHERE id = v_mov;
    UPDATE compra_lineas SET movimiento_reversa_id = v_mov WHERE id = v_linea.id;
  END LOOP;

  UPDATE compras
     SET estado = 'ANULADA', anulada_at = now(), anulada_por = v_usuario, motivo_anulacion = trim(p_motivo)
   WHERE id = p_compra_id;
END $$;
COMMENT ON FUNCTION anular_compra IS 'Anula una compra: DEVOLUCION_PROVEEDOR por línea (regresa existencias). NO revierte el costo promedio. Spec 2026-09-03 §4.2.';
```

- [ ] **Step 4: Aplicar y correr el smoke**

Run: `supabase migration up && psql "$DB_URL" -f supabase/scripts/smoke_compras.sql`
Expected: `NOTICE: SMOKE COMPRAS OK`.

Si falla la FK `compras.usuario_id → auth.users` es porque el dueño seed `…e1` no existe en `auth.users` de tu base local: corre `supabase db reset` para volver a sembrar. Si el promedio da 12.5 en vez de 13.75 en el paso 2, revisa que `insumos.metodo_valuacion` del insumo sea `PROMEDIO_PONDERADO` (es el default) y que `aplicar_movimiento_inventario` reciba `p_costo_unitario_mxn` no nulo.

- [ ] **Step 5: Regenerar tipos y commit**

```bash
pnpm db:types
git add supabase/migrations/0100_registrar_anular_compra.sql supabase/scripts/smoke_compras.sql packages/db/src/database.types.ts
git commit -m "db: registrar_compra y anular_compra con smoke (migración 0100)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: pgTAP cross-tenant de compras y proveedores

**Files:**
- Create: `supabase/tests/0009_compras_rls.test.sql`

**Interfaces:**
- Consumes: tablas de la Task 1.
- Produces: nada; es una prueba.

- [ ] **Step 1: Escribir la prueba**

```sql
-- RLS cross-tenant de proveedores, compras, compra_lineas y proveedor_insumo_alias (ADR 0012).
begin;
select plan(5);

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('aaaaaaaa-0000-0000-0000-0000000000c0', 'rls-compras-a', 'Tenant A', 'QUICK_SERVICE'),
       ('bbbbbbbb-0000-0000-0000-0000000000c0', 'rls-compras-b', 'Tenant B', 'QUICK_SERVICE')
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c0', 'CA', 'Suc A'),
       ('bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c0', 'CB', 'Suc B')
on conflict (id) do nothing;
insert into proveedores (id, tenant_id, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-0000000000c0', 'Prov A'),
       ('bbbbbbbb-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-0000000000c0', 'Prov B');
insert into auth.users (id) values ('99999999-0000-0000-0000-0000000000c9') on conflict (id) do nothing;
insert into compras (tenant_id, sucursal_id, proveedor_id, fecha, subtotal_mxn, iva_mxn, total_mxn, usuario_id, dia_contable)
values ('aaaaaaaa-0000-0000-0000-0000000000c0', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c2', '2026-09-03', 100, 16, 116, '99999999-0000-0000-0000-0000000000c9', '2026-09-03'),
       ('bbbbbbbb-0000-0000-0000-0000000000c0', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c2', '2026-09-03', 200, 32, 232, '99999999-0000-0000-0000-0000000000c9', '2026-09-03');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000c9',
                    'tenant_id', 'aaaaaaaa-0000-0000-0000-0000000000c0',
                    'role', 'authenticated')::text, true);

select results_eq($$ select nombre from proveedores order by 1 $$, $$ values ('Prov A') $$, 'Tenant A solo ve sus proveedores');
select results_eq($$ select subtotal_mxn::int from compras $$, $$ values (100) $$, 'Tenant A solo ve sus compras');
select throws_ok(
  $$ insert into proveedores (tenant_id, nombre) values ('bbbbbbbb-0000-0000-0000-0000000000c0', 'intruso') $$,
  '42501', NULL, 'Tenant A no inserta proveedores del tenant B');
select throws_ok(
  $$ insert into compras (tenant_id, sucursal_id, proveedor_id, fecha, subtotal_mxn, iva_mxn, total_mxn, usuario_id, dia_contable)
     values ('bbbbbbbb-0000-0000-0000-0000000000c0', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c2', '2026-09-03', 1, 0, 1, '99999999-0000-0000-0000-0000000000c9', '2026-09-03') $$,
  '42501', NULL, 'Tenant A no inserta compras del tenant B');
select is((select count(*)::int from proveedor_insumo_alias), 0, 'Alias vacío y legible por el tenant');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver verde**

Run: `supabase test db`
Expected: `0009_compras_rls.test.sql .. ok` (5 pruebas).

Si el insert de `compras` del setup falla por `usuario_id` (FK a `auth.users`), el `insert into auth.users (id)` del setup necesita también `email` e `instance_id` en esta versión de Supabase: copia los valores que use `0001_rls_cross_tenant.test.sql` si los define, o usa `insert into auth.users (id, instance_id, aud, role, email) values ('…c9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-compras@test.local')`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0009_compras_rls.test.sql
git commit -m "test: RLS cross-tenant de proveedores y compras

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `lib/recetas.ts` — conversión, costo, margen y acceso a datos

**Files:**
- Create: `apps/admin/app/lib/recetas.ts`
- Create: `apps/admin/app/lib/__tests__/recetas.test.ts`

**Interfaces:**
- Consumes: `supabase`, `leerSesion` de `./supabase`; RPC `guardar_receta` (Task 1); tablas `unidades_medida`, `conversiones_unidades`, `insumos`, `productos`, `recetas`, `receta_componentes`.
- Produces (los usan las Tasks 5, 6 y 11):

```ts
export type UnidadDetalle = { id: string; codigo: string; nombre: string; simbolo: string; dimension: string };
export type Conversion = { origenId: string; destinoId: string; factor: number };
export function convertirCantidad(cantidad: number, origen: UnidadDetalle, destino: UnidadDetalle, conversiones: Conversion[]): number; // lanza Error con mensaje en español
export function costoReceta(componentes: { cantidad: number; costoUnitario: number }[]): number;
export function margen(precioSinIva: number, costo: number): { pesos: number; porcentaje: number | null };
export function precioSinIva(precioConIva: number, tasaIva: number, ivaIncluido: boolean): number;
export async function listarUnidadesDetalle(): Promise<UnidadDetalle[]>;
export async function listarConversiones(): Promise<Conversion[]>;
export type InsumoOpcion = { id: string; nombre: string; categoria: string; unidadId: string; costoUnitario: number };
export async function listarInsumosOpciones(): Promise<InsumoOpcion[]>;
export type RecetaResumen = { productoId: string; nombre: string; categoriaNombre: string; precioSinIva: number; costo: number | null; activa: boolean | null };
export async function listarRecetasResumen(): Promise<RecetaResumen[]>;
export type ComponenteReceta = { insumoId: string; cantidad: number; cantidadCapturada: number | null; unidadCapturadaId: string | null; esCritico: boolean; notas: string | null; orden: number };
export type Receta = { id: string | null; productoId: string; activa: boolean; notas: string | null; costo: number; componentes: ComponenteReceta[] };
export async function obtenerReceta(productoId: string): Promise<Receta>;
export async function guardarReceta(input: { productoId: string; activa: boolean; notas: string | null; componentes: ComponenteReceta[] }): Promise<string>;
```

- [ ] **Step 1: Escribir las pruebas de la parte pura (deben fallar)**

`apps/admin/app/lib/__tests__/recetas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convertirCantidad, costoReceta, margen, precioSinIva, type UnidadDetalle } from "../recetas";

const KG: UnidadDetalle = { id: "u-kg", codigo: "KG", nombre: "Kilogramo", simbolo: "kg", dimension: "MASA" };
const G: UnidadDetalle = { id: "u-g", codigo: "G", nombre: "Gramo", simbolo: "g", dimension: "MASA" };
const OZ: UnidadDetalle = { id: "u-oz", codigo: "OZ", nombre: "Onza", simbolo: "oz", dimension: "MASA" };
const ML: UnidadDetalle = { id: "u-ml", codigo: "ML", nombre: "Mililitro", simbolo: "ml", dimension: "VOLUMEN" };
const CAJA: UnidadDetalle = { id: "u-caja", codigo: "CAJ", nombre: "Caja", simbolo: "caja", dimension: "CANTIDAD" };
const PZA: UnidadDetalle = { id: "u-pza", codigo: "PZA", nombre: "Pieza", simbolo: "pza", dimension: "CANTIDAD" };

describe("convertirCantidad", () => {
  it("misma unidad → identidad", () => {
    expect(convertirCantidad(3, G, G, [])).toBe(3);
  });
  it("kg → g usa la tabla del sistema aunque el tenant no tenga conversiones", () => {
    expect(convertirCantidad(1.5, KG, G, [])).toBe(1500);
  });
  it("g → kg (inversa del sistema)", () => {
    expect(convertirCantidad(250, G, KG, [])).toBe(0.25);
  });
  it("oz → g con 3 decimales", () => {
    expect(convertirCantidad(2, OZ, G, [])).toBe(56.699);
  });
  it("conversión del tenant gana sobre la del sistema", () => {
    expect(convertirCantidad(1, KG, G, [{ origenId: "u-kg", destinoId: "u-g", factor: 999 }])).toBe(999);
  });
  it("conversión del tenant inversa", () => {
    expect(convertirCantidad(12, PZA, CAJA, [{ origenId: "u-caja", destinoId: "u-pza", factor: 12 }])).toBe(1);
  });
  it("dimensión distinta → error que dice qué hacer", () => {
    expect(() => convertirCantidad(1, ML, G, [])).toThrow("No hay conversión de ml a g; captura la cantidad en g");
  });
  it("misma dimensión sin conversión conocida → error", () => {
    expect(() => convertirCantidad(1, CAJA, PZA, [])).toThrow("No hay conversión de caja a pza; captura la cantidad en pza");
  });
});

describe("costoReceta y margen", () => {
  it("suma cantidad × costo unitario", () => {
    expect(costoReceta([{ cantidad: 150, costoUnitario: 0.18 }, { cantidad: 1, costoUnitario: 4 }])).toBe(31);
  });
  it("margen en pesos y porcentaje sobre el precio", () => {
    expect(margen(100, 31)).toEqual({ pesos: 69, porcentaje: 0.69 });
  });
  it("precio cero → porcentaje null", () => {
    expect(margen(0, 5)).toEqual({ pesos: -5, porcentaje: null });
  });
  it("precioSinIva quita el IVA incluido y respeta el precio neto", () => {
    expect(precioSinIva(116, 0.16, true)).toBe(100);
    expect(precioSinIva(100, 0.16, false)).toBe(100);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm --filter ./apps/admin test -- recetas`
Expected: FAIL, `Cannot find module '../recetas'`.

- [ ] **Step 3: Escribir `recetas.ts`**

```ts
"use client";
import { supabase, leerSesion } from "./supabase";

// Recetas con costeo (ADR 0012, spec 2026-09-03 §4.3 y §6). La cantidad operativa de un
// componente va SIEMPRE en la unidad del insumo; aquí se convierte lo que el cocinero captura.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));
const redondear = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;

export type UnidadDetalle = { id: string; codigo: string; nombre: string; simbolo: string; dimension: string };
export type Conversion = { origenId: string; destinoId: string; factor: number };

/** Conversiones del sistema por código; las unidades se siembran por tenant (0035) así que el id cambia pero el código no. */
const SISTEMA: Record<string, number> = {
  "KG>G": 1000,
  "L>ML": 1000,
  "OZ>G": 28.3495,
  "KG>OZ": 35.274,
};

function factorEntre(origen: UnidadDetalle, destino: UnidadDetalle, conversiones: Conversion[]): number | null {
  const directa = conversiones.find((c) => c.origenId === origen.id && c.destinoId === destino.id);
  if (directa) return directa.factor;
  const inversa = conversiones.find((c) => c.origenId === destino.id && c.destinoId === origen.id);
  if (inversa) return 1 / inversa.factor;
  const sd = SISTEMA[`${origen.codigo}>${destino.codigo}`];
  if (sd) return sd;
  const si = SISTEMA[`${destino.codigo}>${origen.codigo}`];
  if (si) return 1 / si;
  return null;
}

/** Convierte `cantidad` de `origen` a `destino`. Lanza con instrucción si no hay cómo. Resultado a 3 decimales. */
export function convertirCantidad(cantidad: number, origen: UnidadDetalle, destino: UnidadDetalle, conversiones: Conversion[]): number {
  if (origen.id === destino.id) return cantidad;
  const factor = origen.dimension === destino.dimension ? factorEntre(origen, destino, conversiones) : null;
  if (factor == null) {
    throw new Error(`No hay conversión de ${origen.simbolo} a ${destino.simbolo}; captura la cantidad en ${destino.simbolo}`);
  }
  return redondear(cantidad * factor, 3);
}

export function costoReceta(componentes: { cantidad: number; costoUnitario: number }[]): number {
  return redondear(componentes.reduce((a, c) => a + c.cantidad * c.costoUnitario, 0), 4);
}

export function margen(precioSinIvaMxn: number, costo: number): { pesos: number; porcentaje: number | null } {
  const pesos = redondear(precioSinIvaMxn - costo, 2);
  return { pesos, porcentaje: precioSinIvaMxn > 0 ? redondear(pesos / precioSinIvaMxn, 4) : null };
}

export function precioSinIva(precioConIva: number, tasaIva: number, ivaIncluido: boolean): number {
  return ivaIncluido ? redondear(precioConIva / (1 + tasaIva), 2) : precioConIva;
}

// ---------------------------------------------------------------- datos

export async function listarUnidadesDetalle(): Promise<UnidadDetalle[]> {
  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, codigo, nombre, simbolo, dimension")
    .eq("activa", true)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((u) => ({
    id: S(u.id), codigo: S(u.codigo), nombre: S(u.nombre), simbolo: S(u.simbolo), dimension: S(u.dimension),
  }));
}

export async function listarConversiones(): Promise<Conversion[]> {
  const { data, error } = await supabase.from("conversiones_unidades").select("unidad_origen_id, unidad_destino_id, factor");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    origenId: S(c.unidad_origen_id), destinoId: S(c.unidad_destino_id), factor: num(c.factor),
  }));
}

export type InsumoOpcion = { id: string; nombre: string; categoria: string; unidadId: string; costoUnitario: number };
export async function listarInsumosOpciones(): Promise<InsumoOpcion[]> {
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nombre, categoria, unidad_medida_id, costo_unitario_mxn")
    .is("deleted_at", null)
    .eq("estado", "ACTIVO")
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: S(i.id), nombre: S(i.nombre), categoria: S(i.categoria), unidadId: S(i.unidad_medida_id), costoUnitario: num(i.costo_unitario_mxn),
  }));
}

export type RecetaResumen = {
  productoId: string; nombre: string; categoriaNombre: string;
  precioSinIva: number; costo: number | null; activa: boolean | null;
};

/** Productos activos con su receta (si la tienen). `costo`/`activa` null = sin receta. */
export async function listarRecetasResumen(): Promise<RecetaResumen[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, categoria:categorias!categoria_id(nombre), receta:recetas(costo_total_mxn, activa)")
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => {
    const r = p.receta as Record<string, unknown> | Record<string, unknown>[] | null;
    const receta = Array.isArray(r) ? r[0] ?? null : r;
    return {
      productoId: S(p.id),
      nombre: S(p.nombre),
      categoriaNombre: ((p.categoria as { nombre?: string } | null)?.nombre) ?? "",
      precioSinIva: precioSinIva(num(p.precio_base_mxn), num(p.tasa_iva ?? 0.16), p.iva_incluido_en_precio !== false),
      costo: receta ? num(receta.costo_total_mxn) : null,
      activa: receta ? Boolean(receta.activa) : null,
    };
  });
}

export type ComponenteReceta = {
  insumoId: string; cantidad: number; cantidadCapturada: number | null; unidadCapturadaId: string | null;
  esCritico: boolean; notas: string | null; orden: number;
};
export type Receta = { id: string | null; productoId: string; activa: boolean; notas: string | null; costo: number; componentes: ComponenteReceta[] };

export async function obtenerReceta(productoId: string): Promise<Receta> {
  const { data, error } = await supabase
    .from("recetas")
    .select("id, activa, notas_preparacion, costo_total_mxn, componentes:receta_componentes(insumo_id, cantidad, cantidad_capturada, unidad_capturada_id, es_critico, notas, orden_visualizacion)")
    .eq("producto_id", productoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { id: null, productoId, activa: true, notas: null, costo: 0, componentes: [] };
  const r = data as unknown as Record<string, unknown>;
  const comps = ((r.componentes as Record<string, unknown>[] | null) ?? [])
    .map((c) => ({
      insumoId: S(c.insumo_id), cantidad: num(c.cantidad),
      cantidadCapturada: c.cantidad_capturada == null ? null : num(c.cantidad_capturada),
      unidadCapturadaId: c.unidad_capturada_id == null ? null : S(c.unidad_capturada_id),
      esCritico: c.es_critico !== false, notas: c.notas == null ? null : S(c.notas), orden: num(c.orden_visualizacion),
    }))
    .sort((a, b) => a.orden - b.orden);
  return { id: S(r.id), productoId, activa: r.activa !== false, notas: r.notas_preparacion == null ? null : S(r.notas_preparacion), costo: num(r.costo_total_mxn), componentes: comps };
}

export async function guardarReceta(input: { productoId: string; activa: boolean; notas: string | null; componentes: ComponenteReceta[] }): Promise<string> {
  await tenantId();
  const { data, error } = await supabase.rpc("guardar_receta", {
    p_producto_id: input.productoId,
    p_activa: input.activa,
    p_notas: input.notas,
    p_componentes: input.componentes.map((c, i) => ({
      insumo_id: c.insumoId, cantidad: c.cantidad, cantidad_capturada: c.cantidadCapturada,
      unidad_capturada_id: c.unidadCapturadaId, es_critico: c.esCritico, notas: c.notas, orden: i,
    })),
  });
  if (error) throw new Error(error.message);
  return String(data);
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `pnpm --filter ./apps/admin test -- recetas`
Expected: 12 pruebas en verde. Si `2 oz → g` da `56.7`, revisa el redondeo a 3 decimales (`56.699`).

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm --filter ./apps/admin typecheck
git add apps/admin/app/lib/recetas.ts apps/admin/app/lib/__tests__/recetas.test.ts
git commit -m "admin: lib de recetas (conversión de unidades, costo, margen, datos)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Pantalla de lista de recetas y pestaña en Catálogo

**Files:**
- Create: `apps/admin/app/(panel)/catalogo/recetas/page.tsx`
- Modify: `apps/admin/app/components/catalogo-tabs.tsx:5-9`

**Interfaces:**
- Consumes: `listarRecetasResumen`, `margen`, `RecetaResumen` de `../../../lib/recetas`; `PageHeader`, `PageBody`, `TablaScroll` de `../../../components/page-header`; `CatalogoTabs`; `mensajeError`.
- Produces: la ruta `/catalogo/recetas` que enlaza a `/catalogo/recetas/[productoId]` (Task 6).

- [ ] **Step 1: Agregar la pestaña**

En `catalogo-tabs.tsx`, la constante `TABS` queda:

```ts
const TABS = [
  { label: "Categorías", href: "/catalogo/categorias" },
  { label: "Productos", href: "/catalogo/productos" },
  { label: "Modificadores", href: "/catalogo/modificadores" },
  { label: "Recetas", href: "/catalogo/recetas" },
];
```

- [ ] **Step 2: Escribir la página**

`apps/admin/app/(panel)/catalogo/recetas/page.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { listarRecetasResumen, margen, type RecetaResumen } from "../../../lib/recetas";
import { mensajeError } from "../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)} %`);
const input = "h-10 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";

type Estado = "CON" | "SIN" | "PAUSADA";
function estadoDe(r: RecetaResumen): Estado {
  if (r.activa === null) return "SIN";
  return r.activa ? "CON" : "PAUSADA";
}
const BADGE: Record<Estado, { texto: string; clase: string }> = {
  CON: { texto: "Con receta", clase: "bg-[#E8F1EC] text-success" },
  PAUSADA: { texto: "Receta pausada", clase: "bg-[#FDF3E2] text-warning" },
  SIN: { texto: "Sin receta", clase: "bg-hover text-ink-3" },
};

export default function RecetasPage() {
  const [filas, setFilas] = useState<RecetaResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloSin, setSoloSin] = useState(false);

  useEffect(() => {
    listarRecetasResumen().then(setFilas).catch((e) => { setError(mensajeError(e, "No se pudieron cargar las recetas")); setFilas([]); });
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (filas ?? []).filter((r) => (!soloSin || r.activa === null) && (!q || r.nombre.toLowerCase().includes(q) || r.categoriaNombre.toLowerCase().includes(q)));
  }, [filas, busqueda, soloSin]);

  const sinReceta = (filas ?? []).filter((r) => r.activa === null).length;

  return (
    <>
      <PageHeader
        titulo="Recetas y costos"
        subtitulo="Qué insumos lleva cada producto y cuánto te cuesta. El margen se calcula contra el precio sin IVA."
        migas={[{ label: "Catálogo" }, { label: "Recetas" }]}
      />
      <CatalogoTabs />
      <PageBody>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <input className={input} placeholder="Buscar producto o categoría" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} />
            Solo sin receta ({sinReceta})
          </label>
        </div>
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={760}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="py-2 pr-3 font-semibold">Categoría</th>
                  <th className="py-2 pr-3 text-right font-semibold">Precio sin IVA</th>
                  <th className="py-2 pr-3 text-right font-semibold">Costo</th>
                  <th className="py-2 pr-3 text-right font-semibold">Margen $</th>
                  <th className="py-2 pr-3 text-right font-semibold">Margen %</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => {
                  const m = r.costo == null ? null : margen(r.precioSinIva, r.costo);
                  const est = estadoDe(r);
                  return (
                    <tr key={r.productoId} className="h-10 border-b border-line-soft hover:bg-hover">
                      <td className="pr-3"><Link className="font-medium text-ink underline-offset-2 hover:underline" href={`/catalogo/recetas/${r.productoId}`}>{r.nombre}</Link></td>
                      <td className="pr-3 text-ink-2">{r.categoriaNombre}</td>
                      <td className="pr-3 text-right tabular-nums">{fmt(r.precioSinIva)}</td>
                      <td className="pr-3 text-right tabular-nums">{r.costo == null ? "—" : fmt(r.costo)}</td>
                      <td className={`pr-3 text-right tabular-nums ${m && m.pesos < 0 ? "text-danger" : ""}`}>{m ? fmt(m.pesos) : "—"}</td>
                      <td className={`pr-3 text-right tabular-nums ${m && m.porcentaje != null && m.porcentaje < 0 ? "text-danger" : ""}`}>{m ? pct(m.porcentaje) : "—"}</td>
                      <td><span className={`rounded px-2 py-0.5 text-[12px] font-medium ${BADGE[est].clase}`}>{BADGE[est].texto}</span></td>
                    </tr>
                  );
                })}
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-ink-3">No hay productos que coincidan.</td></tr>
                )}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `pnpm --filter ./apps/admin typecheck`, luego con el dev server del admin abierto contra Supabase local, entrar a `/catalogo/recetas`.
Expected: pestaña "Recetas" visible; el producto seed aparece con "Sin receta" y guiones en costo y margen; el buscador filtra.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/catalogo-tabs.tsx "apps/admin/app/(panel)/catalogo/recetas/page.tsx"
git commit -m "admin: lista de recetas con costo y margen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Editor de receta y enlace desde el producto

**Files:**
- Create: `apps/admin/app/(panel)/catalogo/recetas/[productoId]/page.tsx`
- Modify: `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx:21-28` (cabecera)

**Interfaces:**
- Consumes: de `../../../../lib/recetas`: `obtenerReceta`, `guardarReceta`, `listarInsumosOpciones`, `listarUnidadesDetalle`, `listarConversiones`, `convertirCantidad`, `costoReceta`, `margen`, `precioSinIva`, tipos `Receta`, `ComponenteReceta`, `InsumoOpcion`, `UnidadDetalle`, `Conversion`; `obtenerProducto` de `../../../../lib/catalogo` (devuelve `Producto` con `precio_base_mxn`, `tasa_iva`, `iva_incluido_en_precio`, `nombre`).
- Produces: ruta `/catalogo/recetas/[productoId]`.

- [ ] **Step 1: Escribir el editor**

`apps/admin/app/(panel)/catalogo/recetas/[productoId]/page.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";
import {
  convertirCantidad, costoReceta, guardarReceta, listarConversiones, listarInsumosOpciones, listarUnidadesDetalle,
  margen, obtenerReceta, precioSinIva, type Conversion, type InsumoOpcion, type Receta, type UnidadDetalle,
} from "../../../../lib/recetas";
import { mensajeError } from "../../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 w-full rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";

/** Fila del editor: lo que el usuario teclea. La cantidad operativa se deriva al guardar. */
type Fila = { insumoId: string; cantidadTexto: string; unidadId: string; esCritico: boolean; error: string | null };

export default function EditorRecetaPage() {
  const params = useParams<{ productoId: string }>();
  const router = useRouter();
  const [producto, setProducto] = useState<Producto | null | undefined>(undefined);
  const [receta, setReceta] = useState<Receta | null>(null);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [conversiones, setConversiones] = useState<Conversion[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [activa, setActiva] = useState(true);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([obtenerProducto(params.productoId), obtenerReceta(params.productoId), listarInsumosOpciones(), listarUnidadesDetalle(), listarConversiones()])
      .then(([p, r, ins, uni, conv]) => {
        setProducto(p); setReceta(r); setInsumos(ins); setUnidades(uni); setConversiones(conv);
        setActiva(r.activa); setNotas(r.notas ?? "");
        setFilas(r.componentes.map((c) => {
          const insumo = ins.find((i) => i.id === c.insumoId);
          return {
            insumoId: c.insumoId,
            cantidadTexto: String(c.cantidadCapturada ?? c.cantidad),
            unidadId: c.unidadCapturadaId ?? insumo?.unidadId ?? "",
            esCritico: c.esCritico,
            error: null,
          };
        }));
      })
      .catch((e) => { setError(mensajeError(e, "No se pudo cargar la receta")); setProducto(null); });
  }, [params.productoId]);

  const unidadDe = (id: string) => unidades.find((u) => u.id === id);
  const insumoDe = (id: string) => insumos.find((i) => i.id === id);

  /** Cantidad en la unidad del insumo, o el motivo por el que no se puede. */
  function resolver(f: Fila): { cantidad: number; error: null } | { cantidad: null; error: string } {
    const insumo = insumoDe(f.insumoId);
    if (!insumo) return { cantidad: null, error: "Elige un insumo" };
    const cant = Number(f.cantidadTexto);
    if (!(cant > 0)) return { cantidad: null, error: "Cantidad mayor que cero" };
    const origen = unidadDe(f.unidadId);
    const destino = unidadDe(insumo.unidadId);
    if (!origen || !destino) return { cantidad: null, error: "Revisar unidad" };
    try {
      return { cantidad: convertirCantidad(cant, origen, destino, conversiones), error: null };
    } catch (e) {
      return { cantidad: null, error: e instanceof Error ? e.message : "Revisar unidad" };
    }
  }

  const resueltas = useMemo(() => filas.map((f) => ({ f, r: resolver(f) })), [filas, insumos, unidades, conversiones]);
  const costo = costoReceta(resueltas.filter((x) => x.r.cantidad != null).map((x) => ({ cantidad: x.r.cantidad as number, costoUnitario: insumoDe(x.f.insumoId)?.costoUnitario ?? 0 })));
  const precioNeto = producto ? precioSinIva(producto.precio_base_mxn, producto.tasa_iva, producto.iva_incluido_en_precio) : 0;
  const m = margen(precioNeto, costo);
  const hayErrores = resueltas.some((x) => x.r.error) || filas.some((f) => f.insumoId && filas.filter((g) => g.insumoId === f.insumoId).length > 1);

  function set(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }
  function agregar() {
    setFilas((prev) => [...prev, { insumoId: "", cantidadTexto: "", unidadId: "", esCritico: true, error: null }]);
  }
  function elegirInsumo(i: number, insumoId: string) {
    const insumo = insumoDe(insumoId);
    set(i, { insumoId, unidadId: insumo?.unidadId ?? "" });
  }
  function unidadesCompatibles(f: Fila): UnidadDetalle[] {
    const insumo = insumoDe(f.insumoId);
    const base = insumo ? unidadDe(insumo.unidadId) : undefined;
    return base ? unidades.filter((u) => u.dimension === base.dimension) : unidades;
  }

  async function guardar() {
    setError(null);
    if (activa && filas.length === 0) { setError("Una receta activa necesita al menos un insumo."); return; }
    if (hayErrores) { setError("Corrige las filas marcadas antes de guardar."); return; }
    setGuardando(true);
    try {
      await guardarReceta({
        productoId: params.productoId, activa, notas: notas.trim() || null,
        componentes: resueltas.map(({ f, r }, i) => ({
          insumoId: f.insumoId, cantidad: r.cantidad as number,
          cantidadCapturada: Number(f.cantidadTexto), unidadCapturadaId: f.unidadId,
          esCritico: f.esCritico, notas: null, orden: i,
        })),
      });
      setOkMsg("Receta guardada.");
      setTimeout(() => setOkMsg(null), 2500);
      setReceta(await obtenerReceta(params.productoId));
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar la receta"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo={producto ? `Receta: ${producto.nombre}` : "Receta"}
        subtitulo={producto ? `Precio sin IVA ${fmt(precioNeto)}` : undefined}
        migas={[{ label: "Catálogo" }, { label: "Recetas", href: "/catalogo/recetas" }, { label: producto?.nombre ?? "…" }]}
        right={<Button variant="ghost" onClick={() => router.push("/catalogo/recetas")}>Volver</Button>}
      />
      <CatalogoTabs />
      <PageBody>
        {producto === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {producto === null && <p className="text-sm text-danger">Producto no encontrado.</p>}
        {producto && receta && (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
                Receta activa (descuenta inventario al vender)
              </label>
              {insumos.length === 0 && <span className="text-sm text-warning">No hay insumos activos. Da de alta insumos en Inventario primero.</span>}
            </div>

            <TablaScroll min={820}>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                    <th className="py-2 pr-3 font-semibold">Insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
                    <th className="py-2 pr-3 font-semibold">Unidad</th>
                    <th className="py-2 pr-3 text-right font-semibold">En unidad del insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Costo</th>
                    <th className="py-2 pr-3 font-semibold">Crítico</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {resueltas.map(({ f, r }, i) => {
                    const insumo = insumoDe(f.insumoId);
                    const repetido = f.insumoId && filas.filter((g) => g.insumoId === f.insumoId).length > 1;
                    const err = r.error ?? (repetido ? "Insumo repetido" : null);
                    return (
                      <tr key={i} className="border-b border-line-soft align-top">
                        <td className="py-1.5 pr-3">
                          <select className={input} value={f.insumoId} onChange={(e) => elegirInsumo(i, e.target.value)} aria-label="Insumo">
                            <option value="">Elige…</option>
                            {insumos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                          </select>
                          {err && f.insumoId && <p className="mt-1 text-[12px] text-danger">{err}</p>}
                        </td>
                        <td className="py-1.5 pr-3">
                          <input className={`${input} text-right tabular-nums`} inputMode="decimal" value={f.cantidadTexto} aria-label="Cantidad"
                            onChange={(e) => set(i, { cantidadTexto: e.target.value.replace(/[^0-9.]/g, "") })} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select className={input} value={f.unidadId} onChange={(e) => set(i, { unidadId: e.target.value })} aria-label="Unidad">
                            {unidadesCompatibles(f).map((u) => <option key={u.id} value={u.id}>{u.simbolo}</option>)}
                          </select>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-ink-2">
                          {r.cantidad != null && insumo ? `${r.cantidad} ${unidadDe(insumo.unidadId)?.simbolo ?? ""}` : "—"}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">{r.cantidad != null && insumo ? fmt(r.cantidad * insumo.costoUnitario) : "—"}</td>
                        <td className="py-3 pr-3"><input type="checkbox" checked={f.esCritico} onChange={(e) => set(i, { esCritico: e.target.checked })} aria-label="Crítico" /></td>
                        <td className="py-1.5"><Button variant="ghost" onClick={() => setFilas((p) => p.filter((_, k) => k !== i))}>Quitar</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td colSpan={4} className="py-2 pr-3 text-right">Costo de la receta</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(costo)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 pr-3 text-right text-ink-2">Margen sobre {fmt(precioNeto)} sin IVA</td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${m.pesos < 0 ? "text-danger" : ""}`}>
                      {fmt(m.pesos)} {m.porcentaje != null && `(${(m.porcentaje * 100).toFixed(1)} %)`}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </TablaScroll>

            <div><Button variant="ghost" onClick={agregar} disabled={insumos.length === 0}>Agregar insumo</Button></div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="notas">Notas de preparación</label>
              <textarea id="notas" className="min-h-[80px] w-full rounded border border-line-strong p-2 text-sm" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
            {okMsg && <p className="text-sm font-medium text-success">{okMsg}</p>}
            <div className="flex gap-2">
              <Button onClick={guardar} disabled={guardando || hayErrores}>{guardando ? "Guardando…" : "Guardar receta"}</Button>
            </div>
            <p className="text-[12px] text-ink-3">Marca como crítico el insumo sin el cual el producto se agota solo cuando no hay existencia.</p>
          </div>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 2: Enlace desde el producto**

En `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx`, agregar `import Link from "next/link";` y en `<PageHeader …>` la prop:

```tsx
right={prod ? <Link className="text-sm font-medium text-accent underline-offset-2 hover:underline" href={`/catalogo/recetas/${prod.id}`}>Receta y costo</Link> : undefined}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `pnpm --filter ./apps/admin typecheck`; abrir `/catalogo/recetas/<id del producto seed>`.
Expected: crear insumos "Carne" (g, costo 0.18) y "Pan" (pza, 4) en Inventario; en el editor agregar 150 g de carne y 1 pan → costo $31.00 en vivo; cambiar la unidad de carne a kg y cantidad 0.15 → sigue $31.00 y "150 g" en la columna de unidad del insumo; guardar → toast; volver a la lista → "Con receta", costo $31.00 y margen calculado. Con 1 ml de carne la fila muestra "No hay conversión de ml a g; captura la cantidad en g" y Guardar queda deshabilitado.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/recetas/[productoId]/page.tsx" "apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx"
git commit -m "admin: editor de receta con unidades convertidas y margen en vivo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Lector de XML CFDI 4.0 (`lib/cfdi-recibido.ts`)

**Files:**
- Create: `apps/admin/app/lib/cfdi-recibido.ts`
- Create: `apps/admin/app/lib/__tests__/cfdi-recibido.test.ts`
- Modify: `apps/admin/package.json` (devDependency `jsdom`)

**Interfaces:**
- Consumes: `DOMParser` global del navegador (en pruebas lo da jsdom).
- Produces:

```ts
export type ConceptoCfdi = { claveOrigen: string; claveProdServ: string; noIdentificacion: string | null; descripcion: string; cantidad: number; claveUnidad: string; unidad: string | null; valorUnitario: number; descuento: number; importeSinIva: number };
export type CfdiRecibido = { uuid: string; fecha: string; serie: string | null; folio: string | null; emisor: { rfc: string; nombre: string }; receptorRfc: string; subtotal: number; descuento: number; iva: number; total: number; conceptos: ConceptoCfdi[]; avisos: string[] };
export type ResultadoLectura = { ok: true; cfdi: CfdiRecibido } | { ok: false; motivo: string };
export function leerCfdiRecibido(xml: string): ResultadoLectura;
export function claveOrigenDe(claveProdServ: string, noIdentificacion: string | null, descripcion: string): string;
export function normalizarDescripcion(s: string): string;
```

- [ ] **Step 1: Instalar jsdom para las pruebas**

Run: `pnpm --filter ./apps/admin add -D jsdom`
Expected: `jsdom` en `devDependencies` de `apps/admin/package.json`.

- [ ] **Step 2: Escribir las pruebas (deben fallar)**

`apps/admin/app/lib/__tests__/cfdi-recibido.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { claveOrigenDe, leerCfdiRecibido, normalizarDescripcion } from "../cfdi-recibido";

function cfdi(opts: { tipo?: string; moneda?: string; version?: string; timbre?: boolean; conceptos?: string } = {}): string {
  const { tipo = "I", moneda = "MXN", version = "4.0", timbre = true } = opts;
  const conceptos = opts.conceptos ?? `
    <cfdi:Concepto ClaveProdServ="50181900" NoIdentificacion="PB-12" Cantidad="2" ClaveUnidad="XBX" Unidad="Caja"
        Descripcion="PAN BRIOCHE CAJA 12 PZ" ValorUnitario="160.00" Importe="320.00" Descuento="20.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados>
        <cfdi:Traslado Base="300.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="48.00"/>
      </cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="78101800" Cantidad="1" ClaveUnidad="E48" Descripcion="Flete  a  Léon" ValorUnitario="100.00" Importe="100.00" ObjetoImp="01"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="${version}" Serie="A" Folio="1234" Fecha="2026-09-03T10:15:00" SubTotal="420.00" Descuento="20.00"
  Moneda="${moneda}" Total="448.00" TipoDeComprobante="${tipo}" LugarExpedicion="37150">
  <cfdi:Emisor Rfc="PSM010101AB1" Nombre="PANIFICADORA SMOKE SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="VIMF0308282D7" Nombre="FERMIN VILLALOBOS" UsoCFDI="G01" DomicilioFiscalReceptor="37150" RegimenFiscalReceptor="612"/>
  <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="48.00"/>
  ${timbre ? `<cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE" FechaTimbrado="2026-09-03T10:16:00"/></cfdi:Complemento>` : ""}
</cfdi:Comprobante>`;
}

describe("leerCfdiRecibido", () => {
  it("lee cabecera, emisor, receptor, timbre y conceptos con descuento e IVA", () => {
    const r = leerCfdiRecibido(cfdi());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cfdi.uuid).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(r.cfdi.fecha).toBe("2026-09-03");
    expect(r.cfdi.serie).toBe("A");
    expect(r.cfdi.folio).toBe("1234");
    expect(r.cfdi.emisor).toEqual({ rfc: "PSM010101AB1", nombre: "PANIFICADORA SMOKE SA DE CV" });
    expect(r.cfdi.receptorRfc).toBe("VIMF0308282D7");
    expect(r.cfdi.subtotal).toBe(420);
    expect(r.cfdi.descuento).toBe(20);
    expect(r.cfdi.iva).toBe(48);
    expect(r.cfdi.total).toBe(448);
    expect(r.cfdi.conceptos).toHaveLength(2);
    const [pan, flete] = r.cfdi.conceptos;
    expect(pan).toMatchObject({ claveOrigen: "PB-12", claveProdServ: "50181900", noIdentificacion: "PB-12", cantidad: 2, claveUnidad: "XBX", unidad: "Caja", valorUnitario: 160, descuento: 20, importeSinIva: 300 });
    expect(flete).toMatchObject({ claveOrigen: "78101800|flete a leon", noIdentificacion: null, unidad: null, importeSinIva: 100 });
    expect(r.cfdi.avisos).toEqual([]);
  });
  it("sin timbre → error", () => {
    expect(leerCfdiRecibido(cfdi({ timbre: false }))).toEqual({ ok: false, motivo: "El archivo no está timbrado" });
  });
  it("tipo E (egreso) → error explicando", () => {
    const r = leerCfdiRecibido(cfdi({ tipo: "E" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no es una factura de compra/);
  });
  it("moneda distinta de MXN → error", () => {
    expect(leerCfdiRecibido(cfdi({ moneda: "USD" }))).toEqual({ ok: false, motivo: "Solo se aceptan facturas en pesos" });
  });
  it("versión 3.3 → se acepta con aviso", () => {
    const r = leerCfdiRecibido(cfdi({ version: "3.3" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cfdi.avisos).toContain("La factura es CFDI 3.3; revisa los conceptos");
  });
  it("XML que no es CFDI → error", () => {
    expect(leerCfdiRecibido("<html><body>hola</body></html>")).toEqual({ ok: false, motivo: "El archivo no es una factura CFDI" });
  });
  it("XML roto → error", () => {
    expect(leerCfdiRecibido("<cfdi:Comprobante").ok).toBe(false);
  });
});

describe("claveOrigenDe / normalizarDescripcion", () => {
  it("usa NoIdentificacion cuando existe", () => {
    expect(claveOrigenDe("50181900", " PB-12 ", "lo que sea")).toBe("PB-12");
  });
  it("si no, clave SAT + descripción normalizada, máximo 120", () => {
    expect(normalizarDescripcion("  Pan  Brioche  Léon ")).toBe("pan brioche leon");
    expect(claveOrigenDe("50181900", null, "x".repeat(200))).toHaveLength(120);
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `pnpm --filter ./apps/admin test -- cfdi-recibido`
Expected: FAIL, `Cannot find module '../cfdi-recibido'`.

- [ ] **Step 4: Escribir el lector**

`apps/admin/app/lib/cfdi-recibido.ts`:

```ts
// Lector del XML de un CFDI 4.0 RECIBIDO (la factura que nos da el proveedor). Función pura:
// no toca la red ni guarda el archivo. Spec 2026-09-03 §5. Busca por localName para tolerar los
// prefijos cfdi:/tfd: y cualquier orden de atributos.

export type ConceptoCfdi = {
  claveOrigen: string; claveProdServ: string; noIdentificacion: string | null; descripcion: string;
  cantidad: number; claveUnidad: string; unidad: string | null; valorUnitario: number; descuento: number; importeSinIva: number;
};
export type CfdiRecibido = {
  uuid: string; fecha: string; serie: string | null; folio: string | null;
  emisor: { rfc: string; nombre: string }; receptorRfc: string;
  subtotal: number; descuento: number; iva: number; total: number; conceptos: ConceptoCfdi[]; avisos: string[];
};
export type ResultadoLectura = { ok: true; cfdi: CfdiRecibido } | { ok: false; motivo: string };

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null) => (v == null || v === "" ? 0 : Number(v));
const attr = (el: Element | null, nombre: string): string | null => el?.getAttribute(nombre) ?? null;

function hijos(el: Element | null, localName: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === localName);
}
function descendientes(el: Element | Document, localName: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", localName));
}

export function normalizarDescripcion(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function claveOrigenDe(claveProdServ: string, noIdentificacion: string | null, descripcion: string): string {
  const ident = (noIdentificacion ?? "").trim();
  const clave = ident ? ident : `${claveProdServ}|${normalizarDescripcion(descripcion)}`;
  return clave.slice(0, 120);
}

export function leerCfdiRecibido(xml: string): ResultadoLectura {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { ok: false, motivo: "No se pudo leer el archivo" };
  }
  if (descendientes(doc, "parsererror").length > 0) return { ok: false, motivo: "El archivo XML está dañado" };
  const comp = doc.documentElement;
  if (!comp || comp.localName !== "Comprobante") return { ok: false, motivo: "El archivo no es una factura CFDI" };

  const avisos: string[] = [];
  const version = attr(comp, "Version") ?? "";
  if (version === "3.3") avisos.push("La factura es CFDI 3.3; revisa los conceptos");
  else if (version !== "4.0") return { ok: false, motivo: `Versión de CFDI no soportada (${version || "desconocida"})` };

  const tipo = attr(comp, "TipoDeComprobante");
  if (tipo !== "I") return { ok: false, motivo: `Este XML es de tipo ${tipo ?? "?"}, no es una factura de compra (ingreso)` };
  if ((attr(comp, "Moneda") ?? "MXN") !== "MXN") return { ok: false, motivo: "Solo se aceptan facturas en pesos" };

  const timbre = descendientes(comp, "TimbreFiscalDigital")[0] ?? null;
  const uuid = attr(timbre, "UUID");
  if (!uuid) return { ok: false, motivo: "El archivo no está timbrado" };

  const emisor = hijos(comp, "Emisor")[0] ?? null;
  const receptor = hijos(comp, "Receptor")[0] ?? null;
  const conceptosEl = hijos(comp, "Conceptos")[0] ?? null;

  const conceptos: ConceptoCfdi[] = hijos(conceptosEl, "Concepto").map((c) => {
    const claveProdServ = attr(c, "ClaveProdServ") ?? "";
    const noIdent = (attr(c, "NoIdentificacion") ?? "").trim() || null;
    const descripcion = (attr(c, "Descripcion") ?? "").trim();
    const importe = num(attr(c, "Importe"));
    const descuento = num(attr(c, "Descuento"));
    return {
      claveOrigen: claveOrigenDe(claveProdServ, noIdent, descripcion),
      claveProdServ, noIdentificacion: noIdent, descripcion,
      cantidad: r6(num(attr(c, "Cantidad"))),
      claveUnidad: attr(c, "ClaveUnidad") ?? "",
      unidad: (attr(c, "Unidad") ?? "").trim() || null,
      valorUnitario: r6(num(attr(c, "ValorUnitario"))),
      descuento: r2(descuento),
      importeSinIva: r2(importe - descuento),
    };
  });

  // IVA = traslados con Impuesto 002 de cada concepto (los del comprobante pueden incluir IEPS).
  const iva = r2(conceptos.length === 0 ? 0 : hijos(conceptosEl, "Concepto").reduce((acc, c) => {
    const traslados = descendientes(c, "Traslado").filter((t) => attr(t, "Impuesto") === "002");
    return acc + traslados.reduce((a, t) => a + num(attr(t, "Importe")), 0);
  }, 0));

  return {
    ok: true,
    cfdi: {
      uuid: uuid.toLowerCase(),
      fecha: (attr(comp, "Fecha") ?? "").slice(0, 10),
      serie: attr(comp, "Serie") || null,
      folio: attr(comp, "Folio") || null,
      emisor: { rfc: (attr(emisor, "Rfc") ?? "").toUpperCase(), nombre: (attr(emisor, "Nombre") ?? "").trim() },
      receptorRfc: (attr(receptor, "Rfc") ?? "").toUpperCase(),
      subtotal: r2(num(attr(comp, "SubTotal"))),
      descuento: r2(num(attr(comp, "Descuento"))),
      iva,
      total: r2(num(attr(comp, "Total"))),
      conceptos,
      avisos,
    },
  };
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `pnpm --filter ./apps/admin test -- cfdi-recibido`
Expected: 9 pruebas en verde. Si `getElementsByTagNameNS` no encuentra `parsererror` en jsdom con un XML roto, jsdom lanza al parsear: el `try/catch` lo cubre y la prueba "XML roto" solo exige `ok === false`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/app/lib/cfdi-recibido.ts apps/admin/app/lib/__tests__/cfdi-recibido.test.ts
git commit -m "admin: lector puro del XML de CFDI 4.0 recibido

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Proveedores — lib y pantalla

**Files:**
- Create: `apps/admin/app/lib/proveedores.ts`
- Create: `apps/admin/app/(panel)/inventario/proveedores/page.tsx`

**Interfaces:**
- Consumes: tabla `proveedores` (Task 1); `supabase`, `leerSesion`; `PageHeader`, `PageBody`, `TablaScroll`, `Button`, `mensajeError`.
- Produces (los usa la Task 11):

```ts
export const proveedorSchema: z.ZodObject<…>;  // nombre, rfc?, telefono?, email?, notas?
export type ProveedorInput = z.infer<typeof proveedorSchema>;
export type Proveedor = { id: string; nombre: string; rfc: string | null; telefono: string | null; email: string | null; notas: string | null; activo: boolean; compras: number };
export async function listarProveedores(): Promise<Proveedor[]>;
export async function crearProveedor(input: ProveedorInput): Promise<string>;   // devuelve id
export async function actualizarProveedor(id: string, input: ProveedorInput): Promise<void>;
export async function eliminarProveedor(id: string): Promise<void>;             // baja lógica
export async function buscarProveedorPorRfc(rfc: string): Promise<Proveedor | null>;
```

- [ ] **Step 1: Escribir la lib**

`apps/admin/app/lib/proveedores.ts`:

```ts
"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// Catálogo de proveedores (ADR 0012). Tabla proveedores con RLS por tenant y baja lógica.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const S = (v: unknown) => (v == null ? "" : String(v));
const opc = (v: unknown) => (v == null || v === "" ? null : String(v));

export const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, "Obligatorio").max(200),
  rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, "RFC inválido").or(z.literal("")).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Correo inválido").or(z.literal("")).optional(),
  notas: z.string().trim().max(2000).optional(),
});
export type ProveedorInput = z.infer<typeof proveedorSchema>;

export type Proveedor = {
  id: string; nombre: string; rfc: string | null; telefono: string | null; email: string | null;
  notas: string | null; activo: boolean; compras: number;
};

function mapear(r: Record<string, unknown>): Proveedor {
  const compras = r.compras as { count?: number }[] | null;
  return {
    id: S(r.id), nombre: S(r.nombre), rfc: opc(r.rfc), telefono: opc(r.telefono), email: opc(r.email),
    notas: opc(r.notas), activo: r.activo !== false, compras: Number(compras?.[0]?.count ?? 0),
  };
}

export async function listarProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, rfc, telefono, email, notas, activo, compras(count)")
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapear);
}

function aFila(d: ProveedorInput) {
  return { nombre: d.nombre, rfc: d.rfc || null, telefono: d.telefono || null, email: d.email || null, notas: d.notas || null };
}

export async function crearProveedor(input: ProveedorInput): Promise<string> {
  const d = proveedorSchema.parse(input);
  const tid = await tenantId();
  const { data, error } = await supabase.from("proveedores").insert({ tenant_id: tid, ...aFila(d) }).select("id").single();
  if (error) throw new Error(error.message);
  return S((data as { id: unknown }).id);
}

export async function actualizarProveedor(id: string, input: ProveedorInput): Promise<void> {
  const d = proveedorSchema.parse(input);
  const { error } = await supabase.from("proveedores").update(aFila(d)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarProveedor(id: string): Promise<void> {
  const { error } = await supabase.from("proveedores").update({ deleted_at: new Date().toISOString(), activo: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function buscarProveedorPorRfc(rfc: string): Promise<Proveedor | null> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, rfc, telefono, email, notas, activo, compras(count)")
    .is("deleted_at", null)
    .eq("rfc", rfc.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapear(data as unknown as Record<string, unknown>) : null;
}
```

- [ ] **Step 2: Escribir la pantalla**

`apps/admin/app/(panel)/inventario/proveedores/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import {
  actualizarProveedor, crearProveedor, eliminarProveedor, listarProveedores, proveedorSchema, type Proveedor,
} from "../../../lib/proveedores";
import { mensajeError } from "../../../lib/errores";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type Form = { nombre: string; rfc: string; telefono: string; email: string; notas: string };
const VACIO: Form = { nombre: "", rfc: "", telefono: "", email: "", notas: "" };

export default function ProveedoresPage() {
  const [filas, setFilas] = useState<Proveedor[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: Form } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try { setFilas(await listarProveedores()); }
    catch (e) { setError(mensajeError(e, "No se pudieron cargar los proveedores")); setFilas([]); }
  }
  useEffect(() => { recargar(); }, []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = proveedorSchema.safeParse(editando.datos);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; }
    setGuardando(true);
    try {
      if (editando.id) await actualizarProveedor(editando.id, parsed.data);
      else await crearProveedor(parsed.data);
      setOkMsg("Proveedor guardado.");
      setTimeout(() => setOkMsg(null), 2500);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el proveedor"));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(p: Proveedor) {
    if (!confirm(`¿Dar de baja a "${p.nombre}"? No podrás registrarle compras; las anteriores se conservan.`)) return;
    try { await eliminarProveedor(p.id); recargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo dar de baja")); }
  }

  return (
    <>
      <PageHeader
        titulo="Proveedores"
        subtitulo="A quién le compras. El RFC sirve para reconocer sus facturas al registrar una compra."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Proveedores" }]}
        right={<div className="flex gap-2"><Link href="/inventario/compras" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Compras</Link><Button onClick={() => { setError(null); setEditando({ id: null, datos: VACIO }); }}>Nuevo proveedor</Button></div>}
      />
      <PageBody>
        {error && !editando && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={720}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Nombre</th>
                  <th className="py-2 pr-3 font-semibold">RFC</th>
                  <th className="py-2 pr-3 font-semibold">Teléfono</th>
                  <th className="py-2 pr-3 text-right font-semibold">Compras</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="h-10 border-b border-line-soft hover:bg-hover">
                    <td className="pr-3 font-medium">{p.nombre}</td>
                    <td className="pr-3 font-mono text-[12.5px] text-ink-2">{p.rfc ?? "—"}</td>
                    <td className="pr-3 text-ink-2">{p.telefono ?? "—"}</td>
                    <td className="pr-3 text-right tabular-nums">{p.compras}</td>
                    <td className="text-right">
                      <button className="mr-3 text-sm text-ink-2 hover:text-ink" onClick={() => { setError(null); setEditando({ id: p.id, datos: { nombre: p.nombre, rfc: p.rfc ?? "", telefono: p.telefono ?? "", email: p.email ?? "", notas: p.notas ?? "" } }); }}>Editar</button>
                      <button className="text-sm text-danger" onClick={() => borrar(p)}>Dar de baja</button>
                    </td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-ink-3">Aún no tienes proveedores.</td></tr>}
              </tbody>
            </table>
          </TablaScroll>
        )}

        {editando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
            <div role="dialog" aria-modal="true" aria-label={editando.id ? "Editar proveedor" : "Nuevo proveedor"} className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl">
              <h2 className="mb-4 font-display text-lg font-bold">{editando.id ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <div className="grid gap-3">
                <div><label className={label} htmlFor="p-nombre">Nombre</label><input id="p-nombre" className={input} value={editando.datos.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
                <div><label className={label} htmlFor="p-rfc">RFC (opcional)</label><input id="p-rfc" className={`${input} uppercase`} value={editando.datos.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} maxLength={13} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label} htmlFor="p-tel">Teléfono</label><input id="p-tel" className={input} value={editando.datos.telefono} onChange={(e) => set("telefono", e.target.value)} /></div>
                  <div><label className={label} htmlFor="p-email">Correo</label><input id="p-email" className={input} value={editando.datos.email} onChange={(e) => set("email", e.target.value)} /></div>
                </div>
                <div><label className={label} htmlFor="p-notas">Notas</label><textarea id="p-notas" className="min-h-[60px] w-full rounded border border-line-strong p-2 text-sm" value={editando.datos.notas} onChange={(e) => set("notas", e.target.value)} /></div>
                {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `pnpm --filter ./apps/admin typecheck`; abrir `/inventario/proveedores`.
Expected: crear "Panificadora Smoke" con RFC `PSM010101AB1` → aparece con 0 compras; un RFC mal formado muestra "RFC inválido"; el mismo RFC dos veces muestra "Ya existe un registro con esos datos"; dar de baja pide confirmación con la consecuencia.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/lib/proveedores.ts "apps/admin/app/(panel)/inventario/proveedores/page.tsx"
git commit -m "admin: catálogo de proveedores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `lib/compras.ts` — totales, armado de líneas y acceso a datos

**Files:**
- Create: `apps/admin/app/lib/compras.ts`
- Create: `apps/admin/app/lib/__tests__/compras.test.ts`

**Interfaces:**
- Consumes: RPC `registrar_compra(p_compra jsonb)` y `anular_compra(p_compra_id, p_motivo)` (Task 2); tablas `compras`, `compra_lineas`, `proveedor_insumo_alias`; `convertirCantidad`, `UnidadDetalle`, `Conversion` de `./recetas`; `ConceptoCfdi` de `./cfdi-recibido`.
- Produces (los usan las Tasks 10 y 11):

```ts
export type LineaCaptura = { insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string; factor: number; importeSinIva: number; claveOrigen: string | null; omitir: boolean };
export type LineaResuelta = { insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string; cantidad: number; costoUnitario: number; importe: number };
export function resolverLinea(l: LineaCaptura): LineaResuelta;                 // cantidad = capturada × factor; costo = importe / cantidad
export function totales(lineas: LineaResuelta[], ivaXml: number | null): { subtotal: number; iva: number; total: number };
export function factorSugerido(origen: UnidadDetalle | undefined, destino: UnidadDetalle | undefined, conversiones: Conversion[]): number | null;
export type Alias = { claveOrigen: string; descripcionOrigen: string | null; insumoId: string; unidadId: string; factor: number };
export async function listarAliases(proveedorId: string): Promise<Alias[]>;
export async function buscarCompraPorUuid(uuid: string): Promise<{ id: string; folio: string } | null>;
export type CompraResumen = { id: string; folio: string; fecha: string; proveedorNombre: string; referencia: string | null; sucursalNombre: string; total: number; estado: "CONFIRMADA" | "ANULADA"; origen: "MANUAL" | "XML" };
export async function listarCompras(f: { desde: string; hasta: string; proveedorId?: string; sucursalId?: string }): Promise<CompraResumen[]>;
export type CompraDetalle = CompraResumen & { sucursalId: string; cfdiUuid: string | null; subtotal: number; iva: number; notas: string | null; motivoAnulacion: string | null; lineas: { insumoNombre: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturada: string; cantidad: number; unidadInsumo: string; costoUnitario: number; importe: number }[] };
export async function obtenerCompra(id: string): Promise<CompraDetalle | null>;
export async function registrarCompra(input: { sucursalId: string; proveedorId: string; fecha: string; referencia: string | null; cfdiUuid: string | null; origen: "MANUAL" | "XML"; notas: string | null; ivaXml: number | null; lineas: LineaResuelta[]; aliases: Alias[] }): Promise<string>;
export async function anularCompra(id: string, motivo: string): Promise<void>;
```

- [ ] **Step 1: Escribir las pruebas de la parte pura (deben fallar)**

`apps/admin/app/lib/__tests__/compras.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { factorSugerido, resolverLinea, totales, type LineaCaptura } from "../compras";
import type { UnidadDetalle } from "../recetas";

const CAJA: UnidadDetalle = { id: "u-caja", codigo: "CAJ", nombre: "Caja", simbolo: "caja", dimension: "CANTIDAD" };
const PZA: UnidadDetalle = { id: "u-pza", codigo: "PZA", nombre: "Pieza", simbolo: "pza", dimension: "CANTIDAD" };
const KG: UnidadDetalle = { id: "u-kg", codigo: "KG", nombre: "Kilogramo", simbolo: "kg", dimension: "MASA" };
const G: UnidadDetalle = { id: "u-g", codigo: "G", nombre: "Gramo", simbolo: "g", dimension: "MASA" };

const base: LineaCaptura = { insumoId: "i1", descripcionOrigen: "PAN CAJA 12", cantidadCapturada: 2, unidadCapturadaId: "u-caja", factor: 12, importeSinIva: 300, claveOrigen: "PB-12", omitir: false };

describe("resolverLinea", () => {
  it("convierte por factor y calcula costo por unidad del insumo", () => {
    expect(resolverLinea(base)).toMatchObject({ cantidad: 24, costoUnitario: 12.5, importe: 300 });
  });
  it("redondea costo a 6 decimales y cantidad a 3", () => {
    const r = resolverLinea({ ...base, cantidadCapturada: 1, factor: 3, importeSinIva: 10 });
    expect(r.cantidad).toBe(3);
    expect(r.costoUnitario).toBe(3.333333);
  });
});

describe("totales", () => {
  const lineas = [resolverLinea(base), resolverLinea({ ...base, insumoId: "i2", importeSinIva: 60, factor: 1, cantidadCapturada: 24 })];
  it("IVA 16 % cuando no viene del XML", () => {
    expect(totales(lineas, null)).toEqual({ subtotal: 360, iva: 57.6, total: 417.6 });
  });
  it("respeta el IVA del XML", () => {
    expect(totales(lineas, 48)).toEqual({ subtotal: 360, iva: 48, total: 408 });
  });
});

describe("factorSugerido", () => {
  it("misma unidad → 1", () => expect(factorSugerido(PZA, PZA, [])).toBe(1));
  it("kg → g del sistema → 1000", () => expect(factorSugerido(KG, G, [])).toBe(1000));
  it("caja → pza sin conversión → null (el usuario lo captura)", () => expect(factorSugerido(CAJA, PZA, [])).toBeNull());
  it("unidad desconocida → null", () => expect(factorSugerido(undefined, PZA, [])).toBeNull());
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm --filter ./apps/admin test -- compras`
Expected: FAIL, `Cannot find module '../compras'`.

- [ ] **Step 3: Escribir la lib**

`apps/admin/app/lib/compras.ts`:

```ts
"use client";
import { supabase, leerSesion } from "./supabase";
import { convertirCantidad, type Conversion, type UnidadDetalle } from "./recetas";

// Compras a proveedores (ADR 0012, spec 2026-09-03 §4.1, §4.2, §7.3). La parte pura (resolver
// líneas y totales) se prueba con vitest; el resto son llamadas a los RPC y a las tablas.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));
const opc = (v: unknown) => (v == null || v === "" ? null : String(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

// ---------------------------------------------------------------- puro

export type LineaCaptura = {
  insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string;
  factor: number; importeSinIva: number; claveOrigen: string | null; omitir: boolean;
};
export type LineaResuelta = {
  insumoId: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturadaId: string;
  cantidad: number; costoUnitario: number; importe: number;
};

/** cantidad = capturada × factor (unidad del insumo); costo unitario = importe sin IVA / cantidad. */
export function resolverLinea(l: LineaCaptura): LineaResuelta {
  const cantidad = r3(l.cantidadCapturada * l.factor);
  const importe = r2(l.importeSinIva);
  return {
    insumoId: l.insumoId, descripcionOrigen: l.descripcionOrigen, cantidadCapturada: l.cantidadCapturada,
    unidadCapturadaId: l.unidadCapturadaId, cantidad, costoUnitario: cantidad > 0 ? r6(importe / cantidad) : 0, importe,
  };
}

export function totales(lineas: LineaResuelta[], ivaXml: number | null): { subtotal: number; iva: number; total: number } {
  const subtotal = r2(lineas.reduce((a, l) => a + l.importe, 0));
  const iva = ivaXml == null ? r2(subtotal * 0.16) : r2(ivaXml);
  return { subtotal, iva, total: r2(subtotal + iva) };
}

/** Factor propuesto de la unidad del proveedor a la del insumo; null cuando el usuario debe capturarlo. */
export function factorSugerido(origen: UnidadDetalle | undefined, destino: UnidadDetalle | undefined, conversiones: Conversion[]): number | null {
  if (!origen || !destino) return null;
  if (origen.id === destino.id) return 1;
  try { return convertirCantidad(1, origen, destino, conversiones); } catch { return null; }
}

// ---------------------------------------------------------------- datos

export type Alias = { claveOrigen: string; descripcionOrigen: string | null; insumoId: string; unidadId: string; factor: number };

export async function listarAliases(proveedorId: string): Promise<Alias[]> {
  const { data, error } = await supabase
    .from("proveedor_insumo_alias")
    .select("clave_origen, descripcion_origen, insumo_id, unidad_id, factor")
    .eq("proveedor_id", proveedorId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    claveOrigen: S(a.clave_origen), descripcionOrigen: opc(a.descripcion_origen), insumoId: S(a.insumo_id), unidadId: S(a.unidad_id), factor: num(a.factor),
  }));
}

export async function buscarCompraPorUuid(uuid: string): Promise<{ id: string; folio: string } | null> {
  const { data, error } = await supabase.from("compras").select("id, folio_completo").eq("cfdi_uuid", uuid.toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: S((data as Record<string, unknown>).id), folio: S((data as Record<string, unknown>).folio_completo) } : null;
}

export type CompraResumen = {
  id: string; folio: string; fecha: string; proveedorNombre: string; referencia: string | null; sucursalNombre: string;
  total: number; estado: "CONFIRMADA" | "ANULADA"; origen: "MANUAL" | "XML";
};

const SELECT_RESUMEN = "id, folio_completo, fecha, referencia_documento, total_mxn, estado, origen, proveedor:proveedores!proveedor_id(nombre), sucursal:sucursales!sucursal_id(nombre)";

function mapearResumen(r: Record<string, unknown>): CompraResumen {
  return {
    id: S(r.id), folio: S(r.folio_completo), fecha: S(r.fecha), referencia: opc(r.referencia_documento),
    proveedorNombre: ((r.proveedor as { nombre?: string } | null)?.nombre) ?? "",
    sucursalNombre: ((r.sucursal as { nombre?: string } | null)?.nombre) ?? "",
    total: num(r.total_mxn), estado: r.estado === "ANULADA" ? "ANULADA" : "CONFIRMADA", origen: r.origen === "XML" ? "XML" : "MANUAL",
  };
}

export async function listarCompras(f: { desde: string; hasta: string; proveedorId?: string; sucursalId?: string }): Promise<CompraResumen[]> {
  let q = supabase.from("compras").select(SELECT_RESUMEN).gte("fecha", f.desde).lte("fecha", f.hasta).order("fecha", { ascending: false }).order("folio_consecutivo", { ascending: false });
  if (f.proveedorId) q = q.eq("proveedor_id", f.proveedorId);
  if (f.sucursalId) q = q.eq("sucursal_id", f.sucursalId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapearResumen);
}

export type CompraDetalle = CompraResumen & {
  sucursalId: string; cfdiUuid: string | null; subtotal: number; iva: number; notas: string | null; motivoAnulacion: string | null;
  lineas: { insumoNombre: string; descripcionOrigen: string | null; cantidadCapturada: number; unidadCapturada: string; cantidad: number; unidadInsumo: string; costoUnitario: number; importe: number }[];
};

export async function obtenerCompra(id: string): Promise<CompraDetalle | null> {
  const { data, error } = await supabase
    .from("compras")
    .select(`${SELECT_RESUMEN}, sucursal_id, cfdi_uuid, subtotal_mxn, iva_mxn, notas, motivo_anulacion, lineas:compra_lineas(orden, descripcion_origen, cantidad_capturada, cantidad, costo_unitario_mxn, importe_mxn, insumo:insumos!insumo_id(nombre, unidad:unidades_medida!unidad_medida_id(simbolo)), unidad_capturada:unidades_medida!unidad_capturada_id(simbolo))`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const lineas = ((r.lineas as Record<string, unknown>[] | null) ?? [])
    .sort((a, b) => num(a.orden) - num(b.orden))
    .map((l) => {
      const insumo = l.insumo as { nombre?: string; unidad?: { simbolo?: string } | null } | null;
      return {
        insumoNombre: insumo?.nombre ?? "", descripcionOrigen: opc(l.descripcion_origen),
        cantidadCapturada: num(l.cantidad_capturada), unidadCapturada: ((l.unidad_capturada as { simbolo?: string } | null)?.simbolo) ?? "",
        cantidad: num(l.cantidad), unidadInsumo: insumo?.unidad?.simbolo ?? "",
        costoUnitario: num(l.costo_unitario_mxn), importe: num(l.importe_mxn),
      };
    });
  return {
    ...mapearResumen(r), sucursalId: S(r.sucursal_id), cfdiUuid: opc(r.cfdi_uuid), subtotal: num(r.subtotal_mxn), iva: num(r.iva_mxn),
    notas: opc(r.notas), motivoAnulacion: opc(r.motivo_anulacion), lineas,
  };
}

export async function registrarCompra(input: {
  sucursalId: string; proveedorId: string; fecha: string; referencia: string | null; cfdiUuid: string | null;
  origen: "MANUAL" | "XML"; notas: string | null; ivaXml: number | null; lineas: LineaResuelta[]; aliases: Alias[];
}): Promise<string> {
  await tenantId();
  const { data, error } = await supabase.rpc("registrar_compra", {
    p_compra: {
      sucursal_id: input.sucursalId, proveedor_id: input.proveedorId, fecha: input.fecha,
      referencia_documento: input.referencia, cfdi_uuid: input.cfdiUuid, origen: input.origen, notas: input.notas,
      iva_mxn: input.ivaXml,
      lineas: input.lineas.map((l) => ({
        insumo_id: l.insumoId, descripcion_origen: l.descripcionOrigen, cantidad_capturada: l.cantidadCapturada,
        unidad_capturada_id: l.unidadCapturadaId, cantidad: l.cantidad, costo_unitario_mxn: l.costoUnitario, importe_mxn: l.importe,
      })),
      aliases: input.aliases.map((a) => ({
        clave_origen: a.claveOrigen, descripcion_origen: a.descripcionOrigen, insumo_id: a.insumoId, unidad_id: a.unidadId, factor: a.factor,
      })),
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function anularCompra(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("anular_compra", { p_compra_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Correr pruebas y typecheck**

Run: `pnpm --filter ./apps/admin test -- compras && pnpm --filter ./apps/admin typecheck`
Expected: 8 pruebas en verde, sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/compras.ts apps/admin/app/lib/__tests__/compras.test.ts
git commit -m "admin: lib de compras (totales, líneas resueltas, RPC)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Lista y detalle de compras

**Files:**
- Create: `apps/admin/app/(panel)/inventario/compras/page.tsx`
- Create: `apps/admin/app/(panel)/inventario/compras/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarCompras`, `obtenerCompra`, `anularCompra`, tipos `CompraResumen`, `CompraDetalle` de `../../../lib/compras`; `listarProveedores` de `../../../lib/proveedores`; `listarSucursalesOpciones` de `../../../lib/inventario`.
- Produces: rutas `/inventario/compras` y `/inventario/compras/[id]`; el botón "Nueva compra" apunta a `/inventario/compras/nueva` (Task 11).

- [ ] **Step 1: Escribir la lista**

`apps/admin/app/(panel)/inventario/compras/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import { useRouter } from "next/navigation";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { listarCompras, type CompraResumen } from "../../../lib/compras";
import { listarProveedores, type Proveedor } from "../../../lib/proveedores";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { mensajeError } from "../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";
const hoy = () => new Date().toISOString().slice(0, 10);
const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

export default function ComprasPage() {
  const router = useRouter();
  const [desde, setDesde] = useState(hace(30));
  const [hasta, setHasta] = useState(hoy());
  const [proveedorId, setProveedorId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [filas, setFilas] = useState<CompraResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangoInvalido = desde > hasta ? "La fecha inicial no puede ser mayor que la final" : hasta > hoy() ? "No puedes elegir fechas futuras" : null;

  async function cargar() {
    if (rangoInvalido) return;
    setError(null);
    try { setFilas(await listarCompras({ desde, hasta, proveedorId: proveedorId || undefined, sucursalId: sucursalId || undefined })); }
    catch (e) { setError(mensajeError(e, "No se pudieron cargar las compras")); setFilas([]); }
  }
  useEffect(() => { cargar(); listarProveedores().then(setProveedores).catch(() => {}); listarSucursalesOpciones().then(setSucursales).catch(() => {}); }, []);

  return (
    <>
      <PageHeader
        titulo="Compras"
        subtitulo="Lo que has recibido de proveedores. Cada compra alimenta existencias y costo promedio."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras" }]}
        right={<div className="flex gap-2"><Link href="/inventario/proveedores" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Proveedores</Link><Button onClick={() => router.push("/inventario/compras/nueva")}>Nueva compra</Button></div>}
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[12px] text-ink-2">Desde<input type="date" className={input} value={desde} max={hoy()} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] text-ink-2">Hasta<input type="date" className={input} value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] text-ink-2">Proveedor
            <select className={input} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">Todos</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
          {sucursales.length > 1 && (
            <label className="grid gap-1 text-[12px] text-ink-2">Sucursal
              <select className={input} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}><option value="">Todas</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
            </label>
          )}
          <Button variant="ghost" onClick={cargar} disabled={!!rangoInvalido}>Aplicar</Button>
          {rangoInvalido && <span className="text-[12px] text-danger">{rangoInvalido}</span>}
        </div>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={800}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Folio</th>
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 font-semibold">Proveedor</th>
                  <th className="py-2 pr-3 font-semibold">Referencia</th>
                  <th className="py-2 pr-3 font-semibold">Sucursal</th>
                  <th className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id} className="h-10 border-b border-line-soft hover:bg-hover">
                    <td className="pr-3"><Link className="font-mono text-[12.5px] font-medium text-ink underline-offset-2 hover:underline" href={`/inventario/compras/${c.id}`}>{c.folio}</Link></td>
                    <td className="pr-3 tabular-nums text-ink-2">{c.fecha}</td>
                    <td className="pr-3">{c.proveedorNombre}</td>
                    <td className="pr-3 text-ink-2">{c.referencia ?? "—"}{c.origen === "XML" && <span className="ml-2 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">XML</span>}</td>
                    <td className="pr-3 text-ink-2">{c.sucursalNombre}</td>
                    <td className="pr-3 text-right tabular-nums">{fmt(c.total)}</td>
                    <td><span className={`rounded px-2 py-0.5 text-[12px] font-medium ${c.estado === "ANULADA" ? "bg-[#FBECEA] text-danger" : "bg-[#E8F1EC] text-success"}`}>{c.estado === "ANULADA" ? "Anulada" : "Confirmada"}</span></td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sm text-ink-3">No hay compras en este rango.</td></tr>}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 2: Escribir el detalle con anulación**

`apps/admin/app/(panel)/inventario/compras/[id]/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { anularCompra, obtenerCompra, type CompraDetalle } from "../../../../lib/compras";
import { mensajeError } from "../../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function CompraDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [compra, setCompra] = useState<CompraDetalle | null | undefined>(undefined);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try { setCompra(await obtenerCompra(params.id)); }
    catch (e) { setError(mensajeError(e, "No se pudo cargar la compra")); setCompra(null); }
  }
  useEffect(() => { cargar(); }, [params.id]);

  async function confirmarAnulacion() {
    if (!compra) return;
    setError(null);
    if (!motivo.trim()) { setError("Escribe el motivo de la anulación."); return; }
    setOcupado(true);
    try { await anularCompra(compra.id, motivo.trim()); setAnulando(false); await cargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo anular la compra")); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <PageHeader
        titulo={compra ? `Compra ${compra.folio}` : "Compra"}
        subtitulo={compra ? `${compra.proveedorNombre} · ${compra.fecha} · ${compra.sucursalNombre}` : undefined}
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras", href: "/inventario/compras" }, { label: compra?.folio ?? "…" }]}
        right={<div className="flex gap-2"><Button variant="ghost" onClick={() => router.push("/inventario/compras")}>Volver</Button>{compra?.estado === "CONFIRMADA" && <Button variant="danger" onClick={() => { setError(null); setAnulando(true); }}>Anular compra</Button>}</div>}
      />
      <PageBody>
        {compra === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {compra === null && <p className="text-sm text-danger">Compra no encontrada.</p>}
        {error && !anulando && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {compra && (
          <div className="grid gap-5">
            {compra.estado === "ANULADA" && (
              <p className="rounded border border-danger/30 bg-[#FBECEA] p-3 text-sm text-danger">Anulada. Motivo: {compra.motivoAnulacion ?? "—"}. Las existencias se regresaron; el costo promedio no se modificó.</p>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Referencia</dt><dd>{compra.referencia ?? "—"}</dd></div>
              <div><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Origen</dt><dd>{compra.origen === "XML" ? "Factura XML" : "Captura manual"}</dd></div>
              <div className="col-span-2"><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">UUID fiscal</dt><dd className="font-mono text-[12.5px]">{compra.cfdiUuid ?? "—"}</dd></div>
              {compra.notas && <div className="col-span-2 md:col-span-4"><dt className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Notas</dt><dd>{compra.notas}</dd></div>}
            </dl>
            <TablaScroll min={860}>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                    <th className="py-2 pr-3 font-semibold">Insumo</th>
                    <th className="py-2 pr-3 font-semibold">Descripción de origen</th>
                    <th className="py-2 pr-3 text-right font-semibold">Capturado</th>
                    <th className="py-2 pr-3 text-right font-semibold">En unidad del insumo</th>
                    <th className="py-2 pr-3 text-right font-semibold">Costo unitario</th>
                    <th className="py-2 text-right font-semibold">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.lineas.map((l, i) => (
                    <tr key={i} className="h-10 border-b border-line-soft">
                      <td className="pr-3 font-medium">{l.insumoNombre}</td>
                      <td className="pr-3 text-ink-2">{l.descripcionOrigen ?? "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{l.cantidadCapturada} {l.unidadCapturada}</td>
                      <td className="pr-3 text-right tabular-nums">{l.cantidad} {l.unidadInsumo}</td>
                      <td className="pr-3 text-right tabular-nums">{fmt(l.costoUnitario)}</td>
                      <td className="text-right tabular-nums">{fmt(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="py-1 pr-3 text-right text-ink-2">Subtotal</td><td className="py-1 text-right tabular-nums">{fmt(compra.subtotal)}</td></tr>
                  <tr><td colSpan={5} className="py-1 pr-3 text-right text-ink-2">IVA</td><td className="py-1 text-right tabular-nums">{fmt(compra.iva)}</td></tr>
                  <tr className="border-t border-line font-semibold"><td colSpan={5} className="py-2 pr-3 text-right">Total</td><td className="py-2 text-right tabular-nums">{fmt(compra.total)}</td></tr>
                </tfoot>
              </table>
            </TablaScroll>
          </div>
        )}

        {anulando && compra && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
            <div role="dialog" aria-modal="true" aria-label="Anular compra" className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl">
              <h2 className="mb-2 font-display text-lg font-bold">Anular la compra {compra.folio}</h2>
              <p className="mb-4 text-sm text-ink-2">Se regresarán las existencias de {compra.lineas.length} insumo{compra.lineas.length === 1 ? "" : "s"} en {compra.sucursalNombre}. El costo promedio no se modifica.</p>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="motivo">Motivo</label>
              <textarea id="motivo" className="min-h-[70px] w-full rounded border border-line-strong p-2 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAnulando(false)} disabled={ocupado}>Cancelar</Button>
                <Button variant="danger" onClick={confirmarAnulacion} disabled={ocupado}>{ocupado ? "Anulando…" : "Anular compra"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `pnpm --filter ./apps/admin typecheck`; abrir `/inventario/compras`.
Expected: lista vacía con "No hay compras en este rango"; poner "Hasta" en mañana deshabilita Aplicar y muestra "No puedes elegir fechas futuras". (El detalle se prueba en la Task 11 cuando exista una compra.)

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(panel)/inventario/compras/page.tsx" "apps/admin/app/(panel)/inventario/compras/[id]/page.tsx"
git commit -m "admin: lista y detalle de compras con anulación

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Nueva compra (manual o desde XML)

**Files:**
- Create: `apps/admin/app/(panel)/inventario/compras/nueva/page.tsx`

**Interfaces:**
- Consumes: `leerCfdiRecibido`, `claveOrigenDe`, `CfdiRecibido` de `../../../../lib/cfdi-recibido`; `resolverLinea`, `totales`, `factorSugerido`, `listarAliases`, `buscarCompraPorUuid`, `registrarCompra`, tipos `LineaCaptura`, `Alias` de `../../../../lib/compras`; `listarProveedores`, `buscarProveedorPorRfc`, `crearProveedor`, `Proveedor` de `../../../../lib/proveedores`; `listarInsumosOpciones`, `listarUnidadesDetalle`, `listarConversiones`, tipos de `../../../../lib/recetas`; `listarSucursalesOpciones` de `../../../../lib/inventario`; `supabase` de `../../../../lib/supabase` para leer `tenants.rfc`.
- Produces: ruta `/inventario/compras/nueva`; al registrar redirige a `/inventario/compras/[id]`.

- [ ] **Step 1: Escribir la pantalla**

`apps/admin/app/(panel)/inventario/compras/nueva/page.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { leerCfdiRecibido, type CfdiRecibido } from "../../../../lib/cfdi-recibido";
import { buscarCompraPorUuid, factorSugerido, listarAliases, registrarCompra, resolverLinea, totales, type Alias, type LineaCaptura } from "../../../../lib/compras";
import { buscarProveedorPorRfc, crearProveedor, listarProveedores, type Proveedor } from "../../../../lib/proveedores";
import { listarConversiones, listarInsumosOpciones, listarUnidadesDetalle, type Conversion, type InsumoOpcion, type UnidadDetalle } from "../../../../lib/recetas";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../../lib/inventario";
import { supabase } from "../../../../lib/supabase";
import { mensajeError } from "../../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 w-full rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";
const label = "mb-1 block text-[12px] font-medium text-ink-2";
const hoy = () => new Date().toISOString().slice(0, 10);

/** Fila tal como se edita en pantalla (texto), más lo que vino del XML. */
type Fila = {
  descripcionOrigen: string | null; claveOrigen: string | null; emparejado: boolean;
  insumoId: string; cantidadTexto: string; unidadId: string; factorTexto: string; importeTexto: string; omitir: boolean;
};
const filaVacia = (): Fila => ({ descripcionOrigen: null, claveOrigen: null, emparejado: false, insumoId: "", cantidadTexto: "", unidadId: "", factorTexto: "1", importeTexto: "", omitir: false });

/** Unidad del sistema que corresponde a la ClaveUnidad del SAT más común; si no, la del insumo. */
const CLAVE_SAT_A_CODIGO: Record<string, string> = { KGM: "KG", GRM: "G", LTR: "L", MLT: "ML", ONZ: "OZ", H87: "PZA", XBX: "CAJ", XPK: "PAQ", XBO: "BOT" };

export default function NuevaCompraPage() {
  const router = useRouter();
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [conversiones, setConversiones] = useState<Conversion[]>([]);
  const [rfcNegocio, setRfcNegocio] = useState<string | null>(null);

  const [sucursalId, setSucursalId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [cfdi, setCfdi] = useState<CfdiRecibido | null>(null);
  const [proveedorSugerido, setProveedorSugerido] = useState<{ rfc: string; nombre: string } | null>(null);
  const [duplicada, setDuplicada] = useState<{ id: string; folio: string } | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [avisoArchivo, setAvisoArchivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([listarSucursalesOpciones(), listarProveedores(), listarInsumosOpciones(), listarUnidadesDetalle(), listarConversiones()])
      .then(([s, p, i, u, c]) => { setSucursales(s); setProveedores(p); setInsumos(i); setUnidades(u); setConversiones(c); if (s.length === 1) setSucursalId(s[0].id); })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los catálogos")));
    supabase.from("tenants").select("rfc").maybeSingle().then(({ data }) => setRfcNegocio(((data as { rfc?: string | null } | null)?.rfc) ?? null));
  }, []);

  useEffect(() => {
    if (!proveedorId) { setAliases([]); return; }
    listarAliases(proveedorId).then(setAliases).catch(() => setAliases([]));
  }, [proveedorId]);

  // Cuando llegan los alias del proveedor, empareja las filas del XML que aún no tienen insumo.
  useEffect(() => {
    if (!cfdi || aliases.length === 0) return;
    setFilas((prev) => prev.map((f) => {
      if (f.insumoId || !f.claveOrigen) return f;
      const a = aliases.find((x) => x.claveOrigen === f.claveOrigen);
      return a ? { ...f, insumoId: a.insumoId, unidadId: a.unidadId, factorTexto: String(a.factor), emparejado: true } : f;
    }));
  }, [aliases, cfdi]);

  const insumoDe = (id: string) => insumos.find((i) => i.id === id);
  const unidadDe = (id: string) => unidades.find((u) => u.id === id);
  const unidadPorCodigo = (codigo: string) => unidades.find((u) => u.codigo === codigo);

  async function leerArchivo(archivo: File) {
    setAvisoArchivo(null); setError(null); setDuplicada(null); setProveedorSugerido(null);
    const r = leerCfdiRecibido(await archivo.text());
    if (!r.ok) { setAvisoArchivo(r.motivo); return; }
    const c = r.cfdi;
    setCfdi(c);
    setFecha(c.fecha || hoy());
    setReferencia([c.serie, c.folio].filter(Boolean).join(" "));
    const avisos = [...c.avisos];
    if (rfcNegocio && c.receptorRfc && c.receptorRfc !== rfcNegocio) avisos.push("Esta factura no está a nombre de tu negocio");
    setAvisoArchivo(avisos.length ? avisos.join(". ") : null);

    const dup = await buscarCompraPorUuid(c.uuid);
    if (dup) { setDuplicada(dup); }

    const prov = c.emisor.rfc ? await buscarProveedorPorRfc(c.emisor.rfc) : null;
    if (prov) setProveedorId(prov.id);
    else { setProveedorId(""); setProveedorSugerido({ rfc: c.emisor.rfc, nombre: c.emisor.nombre }); }

    setFilas(c.conceptos.map((con) => {
      const unidadProv = unidadPorCodigo(CLAVE_SAT_A_CODIGO[con.claveUnidad] ?? "");
      return {
        descripcionOrigen: con.descripcion, claveOrigen: con.claveOrigen, emparejado: false,
        insumoId: "", cantidadTexto: String(con.cantidad), unidadId: unidadProv?.id ?? "", factorTexto: "1",
        importeTexto: String(con.importeSinIva), omitir: false,
      };
    }));
  }

  async function crearProveedorSugerido() {
    if (!proveedorSugerido) return;
    try {
      const id = await crearProveedor({ nombre: proveedorSugerido.nombre || proveedorSugerido.rfc, rfc: proveedorSugerido.rfc });
      setProveedores(await listarProveedores());
      setProveedorId(id);
      setProveedorSugerido(null);
    } catch (e) { setError(mensajeError(e, "No se pudo crear el proveedor")); }
  }

  function set(i: number, patch: Partial<Fila>) { setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...patch } : f))); }
  function elegirInsumo(i: number, insumoId: string) {
    const f = filas[i];
    const insumo = insumoDe(insumoId);
    const unidadId = f.unidadId || insumo?.unidadId || "";
    const sugerido = factorSugerido(unidadDe(unidadId), insumo ? unidadDe(insumo.unidadId) : undefined, conversiones);
    set(i, { insumoId, unidadId, factorTexto: sugerido == null ? f.factorTexto : String(sugerido), emparejado: false });
  }
  function elegirUnidad(i: number, unidadId: string) {
    const insumo = insumoDe(filas[i].insumoId);
    const sugerido = factorSugerido(unidadDe(unidadId), insumo ? unidadDe(insumo.unidadId) : undefined, conversiones);
    set(i, { unidadId, factorTexto: sugerido == null ? filas[i].factorTexto : String(sugerido) });
  }

  const capturas: (LineaCaptura | null)[] = filas.map((f) => {
    if (f.omitir) return null;
    return {
      insumoId: f.insumoId, descripcionOrigen: f.descripcionOrigen, cantidadCapturada: Number(f.cantidadTexto), unidadCapturadaId: f.unidadId,
      factor: Number(f.factorTexto), importeSinIva: Number(f.importeTexto), claveOrigen: f.claveOrigen, omitir: false,
    };
  });
  const errores = filas.map((f, i) => {
    const c = capturas[i];
    if (!c) return null;
    if (!c.insumoId) return "Elige un insumo";
    if (!(c.cantidadCapturada > 0)) return "Cantidad mayor que cero";
    if (!c.unidadCapturadaId) return "Elige la unidad";
    if (!(c.factor > 0)) return "Factor mayor que cero";
    if (!(c.importeSinIva >= 0)) return "Importe inválido";
    return null;
  });
  const resueltas = useMemo(() => capturas.filter((c): c is LineaCaptura => !!c && !!c.insumoId && c.cantidadCapturada > 0 && c.factor > 0).map(resolverLinea), [filas]);
  const tot = totales(resueltas, cfdi ? cfdi.iva : null);
  const descuadre = cfdi ? Math.round((cfdi.total - tot.total) * 100) / 100 : 0;
  const puedeGuardar = !!sucursalId && !!proveedorId && resueltas.length > 0 && errores.every((e) => e === null) && !duplicada;

  async function registrar() {
    setError(null);
    if (!puedeGuardar) { setError("Revisa proveedor, sucursal y las filas marcadas."); return; }
    setGuardando(true);
    try {
      const nuevosAlias: Alias[] = filas
        .filter((f) => !f.omitir && f.claveOrigen && f.insumoId && !f.emparejado)
        .map((f) => ({ claveOrigen: f.claveOrigen as string, descripcionOrigen: f.descripcionOrigen, insumoId: f.insumoId, unidadId: f.unidadId, factor: Number(f.factorTexto) }));
      const id = await registrarCompra({
        sucursalId, proveedorId, fecha, referencia: referencia.trim() || null, cfdiUuid: cfdi?.uuid ?? null,
        origen: cfdi ? "XML" : "MANUAL", notas: notas.trim() || null, ivaXml: cfdi ? cfdi.iva : null, lineas: resueltas, aliases: nuevosAlias,
      });
      router.push(`/inventario/compras/${id}`);
    } catch (e) {
      setError(mensajeError(e, "No se pudo registrar la compra"));
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Nueva compra"
        subtitulo="Arrastra el XML de la factura o captura los insumos a mano. Nada se guarda hasta que registres la compra."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras", href: "/inventario/compras" }, { label: "Nueva" }]}
        right={<Button variant="ghost" onClick={() => router.push("/inventario/compras")}>Cancelar</Button>}
      />
      <PageBody>
        <div className="grid gap-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong p-6 text-center text-sm text-ink-2 hover:bg-hover"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) leerArchivo(f); }}>
            <span className="font-medium text-ink">Arrastra el XML de la factura o haz clic</span>
            <span className="text-[12px] text-ink-3">CFDI 4.0 de ingreso, en pesos</span>
            <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = ""; }} />
          </label>
          {avisoArchivo && <p role="alert" className="text-sm font-medium text-warning">{avisoArchivo}</p>}
          {cfdi && <p className="text-[12px] text-ink-3">Factura {cfdi.uuid} de {cfdi.emisor.nombre} ({cfdi.emisor.rfc}), total {fmt(cfdi.total)}.</p>}
          {duplicada && <p role="alert" className="text-sm font-medium text-danger">Esta factura ya está registrada como la compra <Link className="underline" href={`/inventario/compras/${duplicada.id}`}>{duplicada.folio}</Link>.</p>}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={label} htmlFor="prov">Proveedor</label>
              <select id="prov" className={input} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {proveedorSugerido && !proveedorId && (
                <button type="button" className="mt-1 text-[12px] font-medium text-accent hover:underline" onClick={crearProveedorSugerido}>Crear proveedor "{proveedorSugerido.nombre || proveedorSugerido.rfc}"</button>
              )}
            </div>
            {sucursales.length > 1 && (
              <div><label className={label} htmlFor="suc">Sucursal que recibe</label>
                <select id="suc" className={input} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}><option value="">Elige…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
            )}
            <div><label className={label} htmlFor="fecha">Fecha</label><input id="fecha" type="date" className={input} value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><label className={label} htmlFor="ref">Factura o nota</label><input id="ref" className={input} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="A 1234" /></div>
          </div>

          <TablaScroll min={1000}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  {cfdi && <th className="py-2 pr-2 font-semibold">En la factura</th>}
                  <th className="py-2 pr-2 font-semibold">Insumo</th>
                  <th className="py-2 pr-2 text-right font-semibold">Cantidad</th>
                  <th className="py-2 pr-2 font-semibold">Unidad</th>
                  <th className="py-2 pr-2 text-right font-semibold">Factor</th>
                  <th className="py-2 pr-2 text-right font-semibold">En unidad del insumo</th>
                  <th className="py-2 pr-2 text-right font-semibold">Importe sin IVA</th>
                  <th className="py-2 pr-2 text-right font-semibold">Costo unitario</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const insumo = insumoDe(f.insumoId);
                  const c = capturas[i];
                  const res = c && c.insumoId && c.cantidadCapturada > 0 && c.factor > 0 ? resolverLinea(c) : null;
                  return (
                    <tr key={i} className={`border-b border-line-soft align-top ${f.omitir ? "opacity-50" : ""}`}>
                      {cfdi && <td className="max-w-[220px] py-2 pr-2 text-[12px] text-ink-2">{f.descripcionOrigen}{f.emparejado && <span className="ml-1 rounded bg-[#E8F1EC] px-1 text-[10.5px] font-medium text-success">Emparejado</span>}</td>}
                      <td className="py-1.5 pr-2">
                        <select className={input} value={f.insumoId} disabled={f.omitir} onChange={(e) => elegirInsumo(i, e.target.value)} aria-label="Insumo">
                          <option value="">Elige…</option>{insumos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                        </select>
                        {!f.omitir && errores[i] && <p className="mt-1 text-[11.5px] text-danger">{errores[i]}</p>}
                      </td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.cantidadTexto} onChange={(e) => set(i, { cantidadTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Cantidad" /></td>
                      <td className="py-1.5 pr-2">
                        <select className={input} value={f.unidadId} disabled={f.omitir} onChange={(e) => elegirUnidad(i, e.target.value)} aria-label="Unidad del proveedor">
                          <option value="">…</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.simbolo}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.factorTexto} onChange={(e) => set(i, { factorTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Factor a unidad del insumo" title="Cuántas unidades del insumo trae una unidad del proveedor" /></td>
                      <td className="py-3 pr-2 text-right tabular-nums text-ink-2">{res && insumo ? `${res.cantidad} ${unidadDe(insumo.unidadId)?.simbolo ?? ""}` : "—"}</td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.importeTexto} onChange={(e) => set(i, { importeTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Importe sin IVA" /></td>
                      <td className="py-3 pr-2 text-right tabular-nums">{res ? fmt(res.costoUnitario) : "—"}</td>
                      <td className="py-1.5 text-right">
                        {cfdi
                          ? <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => set(i, { omitir: !f.omitir })}>{f.omitir ? "Incluir" : "Omitir"}</button>
                          : <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => setFilas((p) => p.filter((_, k) => k !== i))}>Quitar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={cfdi ? 7 : 6} className="py-1 pr-2 text-right text-ink-2">Subtotal</td><td className="py-1 pr-2 text-right tabular-nums">{fmt(tot.subtotal)}</td><td></td></tr>
                <tr><td colSpan={cfdi ? 7 : 6} className="py-1 pr-2 text-right text-ink-2">IVA {cfdi ? "(de la factura)" : "16 %"}</td><td className="py-1 pr-2 text-right tabular-nums">{fmt(tot.iva)}</td><td></td></tr>
                <tr className="border-t border-line font-semibold"><td colSpan={cfdi ? 7 : 6} className="py-2 pr-2 text-right">Total</td><td className="py-2 pr-2 text-right tabular-nums">{fmt(tot.total)}</td><td></td></tr>
              </tfoot>
            </table>
          </TablaScroll>
          {cfdi && Math.abs(descuadre) > 0.05 && <p className="text-sm text-warning">El total no cuadra con la factura por {fmt(descuadre)}; revisa las filas omitidas.</p>}
          {!cfdi && <div><Button variant="ghost" onClick={() => setFilas((p) => [...p, filaVacia()])}>Agregar insumo</Button></div>}

          <div><label className={label} htmlFor="notas">Notas</label><textarea id="notas" className="min-h-[60px] w-full rounded border border-line-strong p-2 text-sm" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={registrar} disabled={!puedeGuardar || guardando}>{guardando ? "Registrando…" : "Registrar compra"}</Button>
          </div>
          <p className="text-[12px] text-ink-3">El factor dice cuántas unidades del insumo trae una unidad del proveedor: una caja de 12 piezas es factor 12. Se recuerda para la próxima factura del mismo proveedor.</p>
        </div>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 2: Verificar en el navegador (manual)**

Run: `pnpm --filter ./apps/admin typecheck`; abrir `/inventario/compras/nueva`.
Expected: con proveedor "Panificadora Smoke", fila "Pan" 2 caja factor 12 importe 300 → "24 pza", costo $12.50, subtotal $300, IVA $48, total $348; "Registrar compra" redirige al detalle con folio `<código de sucursal>-2026-000001`; en Inventario el insumo Pan sube 24 y su costo cambia a 12.50.

- [ ] **Step 3: Verificar en el navegador (XML)**

Guardar el XML de la prueba de la Task 7 (el que genera `cfdi()`) como `factura-prueba.xml` y arrastrarlo.
Expected: proveedor se selecciona por RFC; fecha 2026-09-03 y referencia "A 1234"; dos filas: "PAN BRIOCHE CAJA 12 PZ" (unidad caja, importe 300) y "Flete a Léon" (importe 100). Omitir el flete, emparejar el pan con "Pan" factor 12 → total $348 igual al de la factura, sin aviso de descuadre. Registrar → detalle con UUID y etiqueta XML. Arrastrar el mismo archivo otra vez → "Esta factura ya está registrada como la compra …" y el botón deshabilitado. Registrar una nueva compra del mismo proveedor con otro XML que traiga `NoIdentificacion="PB-12"` (editar el UUID y el folio del archivo) → la fila del pan aparece "Emparejado" con factor 12 sin tocar nada.

- [ ] **Step 4: Verificar el detalle y la anulación**

En el detalle de la segunda compra, "Anular compra" → confirmación con "Se regresarán las existencias de 1 insumo en …" → motivo → estado Anulada, existencia del pan baja 24 y su costo promedio no cambia.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(panel)/inventario/compras/nueva/page.tsx"
git commit -m "admin: nueva compra a mano o desde el XML del CFDI con alias por proveedor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Ajustes a Inventario y verificación final

**Files:**
- Modify: `apps/admin/app/(panel)/inventario/page.tsx` (cabecera y `TIPOS_MOV` usados por el modal)
- Modify: `apps/admin/app/lib/inventario.ts:130-136` (`TIPOS_MOV`)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la entrada por compra deja de ofrecerse en el modal de movimiento; accesos a Compras y Proveedores desde Inventario.

- [ ] **Step 1: Quitar la entrada por compra del modal**

En `apps/admin/app/lib/inventario.ts`, `TipoMovimientoUI` y `TIPOS_MOV` quedan:

```ts
export type TipoMovimientoUI = "MERMA" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO";
export const TIPOS_MOV: { v: TipoMovimientoUI; l: string }[] = [
  { v: "MERMA", l: "Merma" },
  { v: "AJUSTE_POSITIVO", l: "Ajuste +" },
  { v: "AJUSTE_NEGATIVO", l: "Ajuste −" },
];
```

Si `ModalMovimiento` en `page.tsx` inicializa el tipo con `"ENTRADA_COMPRA"` o muestra el campo de costo solo para ese tipo, cambiar el valor inicial a `"MERMA"` y quitar la condición del costo (los ajustes positivos siguen aceptando costo opcional). Correr `pnpm --filter ./apps/admin typecheck` y corregir lo que marque.

- [ ] **Step 2: Accesos en la cabecera de Inventario**

En `apps/admin/app/(panel)/inventario/page.tsx`, agregar `import Link from "next/link";` y en el `<PageHeader …>` de la página, dentro de la prop `right` (junto al botón de nuevo insumo que ya exista), anteponer:

```tsx
<Link href="/inventario/compras" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Compras</Link>
<Link href="/inventario/proveedores" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Proveedores</Link>
```

envueltos con el botón existente en un `<div className="flex gap-2">…</div>`.

- [ ] **Step 3: Verificación completa**

Run, en este orden:

```bash
supabase test db
psql "$DB_URL" -f supabase/scripts/smoke_recetas.sql
psql "$DB_URL" -f supabase/scripts/smoke_compras.sql
psql "$DB_URL" -f supabase/scripts/smoke_inventario.sql
pnpm --filter ./apps/admin test
pnpm --filter ./apps/admin typecheck
pnpm --filter ./apps/admin lint
```

Expected: todo en verde; `smoke_inventario.sql` sigue pasando (la entrada por compra directa vía RPC no se tocó). En el navegador: el modal de movimiento ya no ofrece "Entrada (compra)"; los enlaces Compras y Proveedores funcionan; la pestaña Recetas y el enlace "Receta y costo" del producto abren el editor.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/lib/inventario.ts "apps/admin/app/(panel)/inventario/page.tsx"
git commit -m "admin: Inventario enlaza compras y proveedores; la entrada por compra ya no va por el modal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Cierre del ciclo**

Anotar en `docs/producto/backlog.md` §6 (módulo de inventario) que recetas, proveedores y compras quedaron construidos con referencia al ADR 0012 y a este plan, y que lo pendiente es el sync de inventario con la caja instalada (0055/0056), el historial de movimientos (P-149) y el reporte de costo de ventas (P-150). Commit:

```bash
git add docs/producto/backlog.md
git commit -m "docs: backlog de inventario al día tras recetas y compras

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Después, `docs/operacion/go-live.md` o el runbook de despliegue que se use: aplicar 0099 y 0100 al proyecto de producción con `supabase db push` y desplegar el admin. Ninguna Edge Function cambia en este ciclo.
