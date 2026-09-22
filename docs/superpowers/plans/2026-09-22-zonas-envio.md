# Zonas de envío — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la caja cobre el envío a domicilio según la zona del cliente, con las zonas y sus
precios administrables por sucursal y dadas de alta desde el propio modal de domicilio.

**Architecture:** el cargo de envío entra al ticket como un **renglón de `ticket_items`** con
`producto_id NULL` y `cargo_tipo = 'ENVIO'`, no como una columna de `tickets`. Así
`recalcular_totales_ticket` lo suma sin tocarse y los conceptos del CFDI siguen cuadrando con
`total_mxn` (que es lo que `armarConceptos` exige). Una tabla `zonas_envio` por sucursal —misma
forma y mismo camino de sync que `repartidores`— guarda nombre y costo; la zona se recuerda en
`direcciones_cliente.zona_envio_id` y se congela en el ticket.

**Tech Stack:** Postgres 15 + plpgsql (migraciones Supabase), PostgREST, Next.js 14 + React +
TypeScript (POS y admin), Electron + Postgres embebido (escritorio), vitest (POS), `node --test`
(escritorio), smokes `.sql` contra Postgres embebido.

**Spec:** [`docs/superpowers/specs/2026-09-22-zonas-envio-design.md`](../specs/2026-09-22-zonas-envio-design.md)

## Global Constraints

- Rama de trabajo: `delivery/zonas-envio` (ya creada, con la especificación commiteada).
- Migración `0115_zonas_envio.sql`. **Antes de crear el archivo, confirmar que el número sigue
  libre** (`ls supabase/migrations | tail -3` y revisar ramas/PRs abiertos).
- **La migración se aplica a producción a mano y ANTES de mezclar el PR.** El `db push` del CI
  corre contra una base efímera y no sirve de despliegue.
- El envío es **un renglón de `ticket_items`**, nunca una columna de `tickets`.
- Solo `modo_servicio = 'DELIVERY_PROPIO'` admite cargo de envío.
- El renglón hereda `tasa_iva_snapshot` e `iva_incluido_en_precio_snapshot` del **primer renglón no
  cancelado** del ticket; si no hay renglones, `16.00` e incluido.
- `clave_sat_snapshot` y `unidad_sat_snapshot` van en `NULL` (el CFDI cae a `90101500` / `E48`).
- Nombre del renglón: `'Envío · ' || zona.nombre`.
- Un ticket tiene **como mucho un** renglón de envío vivo (índice único parcial).
- Crear zona en la caja: libre. **Cambiar el precio de una zona: PIN**, con
  `permisoCodigo: "descuento.override_precio"`.
- Comandos:
  - Smokes: `cd desktop && npm run smokes -- smoke_envio.sql`
  - POS: `cd apps/pos && pnpm test -- <ruta del test>`
  - Escritorio: `cd desktop && node --test src/<archivo>.test.mjs`
  - Tipos: `pnpm --filter @vim/pos typecheck` · **nunca `next build` con el dev server arriba**
    (comparten `.next` y matan `localhost`).
- Commits en español, descriptivos, terminados con
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0115_zonas_envio.sql` | Tabla, columnas, índices, RLS, RPC y las dos funciones de sync |
| `supabase/scripts/smoke_envio.sql` | Todo el contrato de BD del envío (bloquea el merge) |
| `apps/pos/app/lib/zonas-envio.ts` | Leer, crear y repreciar zonas desde la caja |
| `apps/pos/app/components/selector-zona.tsx` | Los chips de zona + el `＋` + el lápiz con PIN |
| `apps/admin/app/lib/zonas-envio.ts` | CRUD de zonas para el panel |
| `apps/admin/app/(panel)/configuracion/envios/page.tsx` | Pantalla de zonas por sucursal |
| `docs/decisiones/0017-el-envio-es-un-renglon.md` | ADR |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `apps/pos/app/lib/carrito.ts` | `EstadoCarrito.envio`, acción `zona`, totales con envío |
| `apps/pos/app/components/modal-cliente-domicilio.tsx` | Fila `Zona:` en los campos de dirección |
| `apps/pos/app/lib/clientes-domicilio.ts` | Guardar y leer `zona_envio_id` de la dirección |
| `apps/pos/app/components/sidebar-ticket.tsx` | Renglón de envío antes de los totales |
| `apps/pos/app/lib/cobro.ts` | `persistirTicket` llama a `fijar_envio_ticket` |
| `apps/pos/app/components/home-pos.tsx` | Pasa la zona en las 4 llamadas a `persistirTicket` |
| `apps/pos/app/lib/cuenta-mesa.ts` | Reconstrucción separa el renglón de envío |
| `apps/pos/app/lib/print/tipos.ts` | `LineaImpresion.cargoTipo` |
| `apps/pos/app/lib/print/ticket-datos.ts` | Lee `cargo_tipo` |
| `apps/pos/app/lib/print/comanda-builder.ts` | La comanda ignora los cargos |
| `packages/kds-core/src/comandas.ts` | El KDS ignora los cargos |
| `desktop/src/sync-pull.mjs` | `zonas_envio` en `PULL_ORDER` + libreta `_vim_zonas_ok` |
| `desktop/src/sync-push.mjs` | `zonas_envio` sube, se marca y se siembra |
| `desktop/src/runtime.mjs` | Llama a la siembra al arrancar |

---

## Task 1: Esquema — `zonas_envio`, columnas y marca de cargo

**Files:**
- Create: `supabase/migrations/0115_zonas_envio.sql`
- Create: `supabase/scripts/smoke_envio.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `zonas_envio (id, tenant_id, sucursal_id, nombre, costo_mxn, orden, activa,
  created_at, updated_at, deleted_at)`; `direcciones_cliente.zona_envio_id uuid NULL`;
  `tickets.zona_envio_id uuid NULL`; `ticket_items.cargo_tipo varchar(20) NULL`.

- [ ] **Step 1: Confirmar que el número de migración sigue libre**

```bash
ls supabase/migrations | tail -3
git branch -a --sort=-committerdate | head -8
```

Esperado: la última es `0114_delivery_viaje.sql`. Si alguien tomó `0115`, usar el siguiente libre
y renombrar todas las referencias de este plan.

- [ ] **Step 2: Escribir el smoke del esquema (falla)**

Crear `supabase/scripts/smoke_envio.sql`:

```sql
-- Smoke de zonas de envío. Corre como postgres contra la BD sembrada, en transacción con ROLLBACK.
-- Objetivo: el contrato completo del cargo de envío — catálogo, totales, IVA heredado,
--           un solo renglón vivo, y la invariante que protege el timbrado.
-- Uso: cd desktop && npm run smokes -- smoke_envio.sql
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_z_centro uuid;
  v_z_norte  uuid;
BEGIN
  -- 1) Alta de zonas
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Centro', 0.00) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Norte', 35.00) RETURNING id INTO v_z_norte;

  -- 2) Nombre repetido en la misma sucursal: rechazado aunque cambien mayúsculas y espacios
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, '  zona norte ', 50.00);
    RAISE EXCEPTION 'FALLO: se permitió una zona con nombre duplicado';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3) Costo negativo: rechazado
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, 'Imposible', -1.00);
    RAISE EXCEPTION 'FALLO: se permitió un costo de envío negativo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) Las columnas nuevas existen y aceptan la zona
  UPDATE direcciones_cliente SET zona_envio_id = v_z_norte WHERE false;
  UPDATE tickets             SET zona_envio_id = v_z_norte WHERE false;
  UPDATE ticket_items        SET cargo_tipo    = 'ENVIO'   WHERE false;

  -- 5) cargo_tipo solo admite valores conocidos
  BEGIN
    UPDATE ticket_items SET cargo_tipo = 'CUALQUIERA' WHERE id IN (SELECT id FROM ticket_items LIMIT 1);
    IF FOUND THEN RAISE EXCEPTION 'FALLO: cargo_tipo aceptó un valor fuera del catálogo'; END IF;
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'OK esquema de zonas_envio';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Correr el smoke y verificar que falla**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `❌ smoke_envio.sql` con `relation "zonas_envio" does not exist`.

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/0115_zonas_envio.sql`:

```sql
-- ============================================================================
-- 0115 — Zonas de envío: el domicilio se cobra según dónde vive el cliente.
--
-- POR QUÉ UN RENGLÓN DEL TICKET Y NO UNA COLUMNA DE tickets
--
-- La tentación es copiar `propina_mxn`: una columna más y a otra cosa. No se puede. Los totales
-- del ticket salen SOLO de ticket_items (recalcular_totales_ticket, 0008 §8.1), y el armador de
-- conceptos del CFDI valida que la suma de los renglones dé exactamente tickets.total_mxn — y
-- truena a propósito si no (ConceptosIncoherentes, _shared/pac/conceptos.ts). Un cargo por fuera
-- de los renglones produciría tickets que no se pueden facturar.
--
-- Como renglón, en cambio, no hay que tocar nada: totales, ticket impreso, CFDI, factura global,
-- reportes y sync ya saben qué hacer con un renglón.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zonas_envio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre      varchar(60) NOT NULL,
  costo_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mxn >= 0),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

COMMENT ON TABLE zonas_envio IS 'Zonas de reparto por sucursal con su cargo de envío. El cargo entra al ticket como renglón (cargo_tipo=ENVIO), nunca como columna.';

-- Por sucursal y no por tenant: las colonias de León no le sirven a una sucursal de otra ciudad.
-- Se comparan sin distinguir mayúsculas ni espacios de sobra, que es como se capturan de verdad.
CREATE UNIQUE INDEX IF NOT EXISTS zona_envio_nombre_uq
  ON zonas_envio (sucursal_id, lower(btrim(nombre))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_zonas_envio_sucursal
  ON zonas_envio (sucursal_id) WHERE deleted_at IS NULL AND activa;

ALTER TABLE zonas_envio ENABLE ROW LEVEL SECURITY;

-- Explícito y no por default privileges (0065): esos solo aplican si la tabla la crea el mismo rol
-- que los definió, y una tabla sin privilegio falla con "permission denied" antes del RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON zonas_envio TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY zonas_envio_select ON zonas_envio
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_insert ON zonas_envio
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_update ON zonas_envio
    FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_delete ON zonas_envio
    FOR DELETE USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_zonas_envio_updated_at
  BEFORE UPDATE ON zonas_envio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona se recuerda en la dirección (para que salga sola la próxima vez) y se congela en el
-- ticket (para poder agrupar ventas por zona sin parsear el nombre del renglón).
ALTER TABLE direcciones_cliente ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);

-- Marca del renglón. Hace falta explícita: producto_id YA es nulo para los renglones cuyo producto
-- se borró del catálogo (FK blanda, 0008:547), así que "sin producto" no significa "es un cargo".
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS cargo_tipo varchar(20) NULL;

DO $$ BEGIN
  ALTER TABLE ticket_items ADD CONSTRAINT ticket_items_cargo_tipo_chk CHECK (cargo_tipo IN ('ENVIO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ticket_items.cargo_tipo IS 'NULL = renglón de producto. ENVIO = cargo de envío: no va a cocina, no consume inventario, no es un producto vendido.';

-- La garantía va en la base, no en que el código se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_envio_unico
  ON ticket_items (ticket_id) WHERE cargo_tipo = 'ENVIO' AND cancelado = false;
```

Antes de escribirlo, confirmar el nombre real del trigger de `updated_at`:

```bash
grep -rn "FUNCTION set_updated_at\|trg_.*updated_at" supabase/migrations/0078_catalogo_repartidores.sql supabase/migrations/0010_verticales.sql | head -3
```

Si en este repo se llama distinto (p. ej. `actualizar_updated_at`), usar ese nombre.

- [ ] **Step 5: Correr el smoke y verificar que pasa**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `✅ smoke_envio.sql` y `1/1 smokes en verde`.

- [ ] **Step 6: Correr TODOS los smokes (no romper nada)**

```bash
cd desktop && npm run smokes
```

Esperado: todos en verde. Si alguno cae, es de este cambio: `ticket_items` ganó una columna y hay
smokes que hacen `to_jsonb` de renglones.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0115_zonas_envio.sql supabase/scripts/smoke_envio.sql
git commit -m "feat(envio): tabla zonas_envio y la marca de cargo en los renglones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: La RPC `fijar_envio_ticket`

**Files:**
- Modify: `supabase/migrations/0115_zonas_envio.sql` (se le añade la función al final)
- Modify: `supabase/scripts/smoke_envio.sql` (se le añade el segundo bloque)

**Interfaces:**
- Consumes: `zonas_envio`, `ticket_items.cargo_tipo`, `tickets.zona_envio_id` (Task 1).
- Produces: `fijar_envio_ticket(p_ticket_id uuid, p_zona_id uuid) RETURNS uuid` — devuelve el id
  del renglón de envío, o `NULL` si se quitó. La llaman `apps/pos/app/lib/cobro.ts` (Task 7) y
  `apps/pos/app/lib/zonas-envio.ts` (Task 6).

- [ ] **Step 1: Escribir el segundo bloque del smoke (falla)**

Añadir a `supabase/scripts/smoke_envio.sql`, **antes** del `ROLLBACK;` final:

```sql
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno  uuid;
  v_ticket uuid;
  v_aqui   uuid;
  v_z_centro uuid;
  v_z_norte  uuid;
  v_z_lejos  uuid;
  v_renglon  uuid;
  v_total  numeric(12,2);
  v_suma   numeric(12,2);
  v_n      integer;
  v_iva_incl boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text)::text, true);

  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-ENV', current_date, v_maria, 1000.00)
  RETURNING id INTO v_turno;

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Centro', 0.00) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Norte', 35.00) RETURNING id INTO v_z_norte;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Las Joyas', 50.00) RETURNING id INTO v_z_lejos;

  -- Ticket de domicilio con dos hamburguesas = 240.00
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, NULL);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'partida: esperaba 240.00, got %', v_total; END IF;

  -- 1) El cargo suma al total
  v_renglon := fijar_envio_ticket(v_ticket, v_z_norte);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 275.00 THEN RAISE EXCEPTION 'con envío: esperaba 275.00, got %', v_total; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) <> v_z_norte
    THEN RAISE EXCEPTION 'el ticket no guardó la zona'; END IF;
  IF (SELECT producto_nombre_snapshot FROM ticket_items WHERE id = v_renglon) <> 'Envío · Zona Norte'
    THEN RAISE EXCEPTION 'nombre del renglón inesperado'; END IF;
  IF (SELECT clave_sat_snapshot FROM ticket_items WHERE id = v_renglon) IS NOT NULL
    THEN RAISE EXCEPTION 'el envío no debe traer clave SAT propia'; END IF;

  -- 2) LA INVARIANTE QUE PROTEGE EL TIMBRADO: los renglones suman el total del ticket.
  --    Es justo lo que valida armarConceptos antes de mandar el CFDI al PAC.
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
  FROM ticket_items WHERE ticket_id = v_ticket AND cancelado = false;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'renglones (%) no suman el total del ticket (%): el CFDI no timbraría', v_suma, v_total;
  END IF;

  -- 3) Cambiar de zona repre­cia y NO duplica el renglón
  PERFORM fijar_envio_ticket(v_ticket, v_z_lejos);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 290.00 THEN RAISE EXCEPTION 'tras cambiar de zona: esperaba 290.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'esperaba 1 renglón de envío, hay %', v_n; END IF;

  -- 4) Quitar la zona deja el ticket como estaba
  IF fijar_envio_ticket(v_ticket, NULL) IS NOT NULL
    THEN RAISE EXCEPTION 'quitar el envío debe devolver NULL'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'tras quitar el envío: esperaba 240.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_n <> 0 THEN RAISE EXCEPTION 'el renglón de envío debía borrarse, no cancelarse'; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS NOT NULL
    THEN RAISE EXCEPTION 'el ticket conservó la zona tras quitar el envío'; END IF;

  -- 5) Zona de $0: hay renglón y el total no cambia
  PERFORM fijar_envio_ticket(v_ticket, v_z_centro);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'zona gratis: esperaba 240.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'la zona gratis también deja renglón (el cliente ve que no pagó envío)'; END IF;

  -- 6) El IVA se hereda del ticket, no es una constante
  SELECT iva_incluido_en_precio_snapshot INTO v_iva_incl
    FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_iva_incl IS DISTINCT FROM (SELECT iva_incluido_en_precio_snapshot FROM ticket_items
                                   WHERE ticket_id = v_ticket AND cargo_tipo IS NULL
                                   ORDER BY orden_visualizacion LIMIT 1)
    THEN RAISE EXCEPTION 'el envío no heredó la política de IVA del ticket'; END IF;

  -- 7) Otro modo de servicio: rechazado
  v_aqui := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_aqui, v_prod, 1, NULL, '[]'::jsonb, NULL);
  BEGIN
    PERFORM fijar_envio_ticket(v_aqui, v_z_norte);
    RAISE EXCEPTION 'FALLO: se permitió cobrar envío en un ticket que no es domicilio';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  -- 8) Ticket ya cobrado: rechazado
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_ticket;
  BEGIN
    PERFORM fijar_envio_ticket(v_ticket, v_z_norte);
    RAISE EXCEPTION 'FALLO: se permitió tocar el envío de un ticket PAGADO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'OK fijar_envio_ticket';
END $$;
```

- [ ] **Step 2: Correr el smoke y verificar que falla**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `❌` con `function fijar_envio_ticket(uuid, uuid) does not exist`.

- [ ] **Step 3: Escribir la RPC**

Añadir al final de `supabase/migrations/0115_zonas_envio.sql`:

```sql
-- ============================================================================
-- fijar_envio_ticket(ticket, zona) — punto único por el que entra y sale el cargo.
--
-- Idempotente: llamarla dos veces con la misma zona deja el mismo renglón. Con otra zona, lo
-- repre­cia. Con NULL, lo borra.
--
-- BORRA en lugar de cancelar a propósito: un cargo retirado antes de cobrar no es una venta
-- cancelada y no tiene por qué aparecer en los reportes de cancelaciones. El trigger
-- AFTER INSERT OR UPDATE OR DELETE de ticket_items (0008:696) recalcula los totales solo.
-- ============================================================================
CREATE OR REPLACE FUNCTION fijar_envio_ticket(p_ticket_id uuid, p_zona_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant     uuid;
  v_sucursal   uuid;
  v_modo       modo_servicio;
  v_estado     ticket_estado_fiscal;
  v_zona       record;
  v_item       uuid;
  v_tasa       numeric(5,2);
  v_incluido   boolean;
  v_orden      integer;
BEGIN
  SELECT tenant_id, sucursal_id, modo_servicio, estado_fiscal
    INTO v_tenant, v_sucursal, v_modo, v_estado
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El envío solo se puede fijar en tickets BORRADOR o ABIERTO (estado actual: %)', v_estado;
  END IF;
  IF v_modo <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'El cargo de envío solo aplica a domicilio propio (modo actual: %)', v_modo;
  END IF;

  SELECT id INTO v_item
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;

  -- Quitar el envío
  IF p_zona_id IS NULL THEN
    IF v_item IS NOT NULL THEN DELETE FROM ticket_items WHERE id = v_item; END IF;
    UPDATE tickets SET zona_envio_id = NULL, updated_at = now() WHERE id = p_ticket_id;
    RETURN NULL;
  END IF;

  SELECT z.id, z.nombre, z.costo_mxn INTO v_zona
  FROM zonas_envio z
  WHERE z.id = p_zona_id
    AND z.tenant_id = v_tenant
    AND z.sucursal_id = v_sucursal
    AND z.activa = true
    AND z.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zona de envío % no existe, está inactiva o no es de esta sucursal', p_zona_id;
  END IF;

  -- La política fiscal del envío es la del ticket, no una constante: un negocio que factura con
  -- IVA por afuera tendría si no un envío incoherente con su propia comida.
  SELECT tasa_iva_snapshot, iva_incluido_en_precio_snapshot
    INTO v_tasa, v_incluido
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo IS NULL AND cancelado = false
  ORDER BY orden_visualizacion
  LIMIT 1;

  IF NOT FOUND THEN
    v_tasa := 16.00;
    v_incluido := true;
  END IF;

  IF v_item IS NOT NULL THEN
    UPDATE ticket_items
       SET producto_nombre_snapshot = 'Envío · ' || v_zona.nombre,
           precio_unitario_snapshot = v_zona.costo_mxn,
           tasa_iva_snapshot = v_tasa,
           iva_incluido_en_precio_snapshot = v_incluido,
           updated_at = now()
     WHERE id = v_item;
  ELSE
    SELECT COALESCE(MAX(orden_visualizacion), 0) + 1 INTO v_orden
    FROM ticket_items WHERE ticket_id = p_ticket_id;

    INSERT INTO ticket_items (
      tenant_id, ticket_id, producto_id, cargo_tipo, cantidad, orden_visualizacion,
      producto_nombre_snapshot, precio_unitario_snapshot,
      tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
      clave_sat_snapshot, unidad_sat_snapshot, created_by
    ) VALUES (
      v_tenant, p_ticket_id, NULL, 'ENVIO', 1, v_orden,
      'Envío · ' || v_zona.nombre, v_zona.costo_mxn,
      v_tasa, v_incluido,
      NULL, NULL, auth.uid()
    ) RETURNING id INTO v_item;
  END IF;

  UPDATE tickets SET zona_envio_id = v_zona.id, updated_at = now() WHERE id = p_ticket_id;
  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION fijar_envio_ticket IS 'Fija (o quita, con zona NULL) el renglón de envío de un ticket de domicilio. Idempotente. Los totales los recalcula el trigger de ticket_items.';

GRANT EXECUTE ON FUNCTION fijar_envio_ticket(uuid, uuid) TO authenticated, service_role;
```

- [ ] **Step 4: Correr el smoke y verificar que pasa**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `✅ smoke_envio.sql`.

- [ ] **Step 5: Correr todos los smokes**

```bash
cd desktop && npm run smokes
```

Esperado: todos en verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0115_zonas_envio.sql supabase/scripts/smoke_envio.sql
git commit -m "feat(envio): fijar_envio_ticket pone el cargo como renglón del ticket

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: El catálogo entra y sale del sync en la nube

**Files:**
- Modify: `supabase/migrations/0115_zonas_envio.sql` (se le añaden las dos funciones de sync)
- Modify: `supabase/scripts/smoke_envio.sql` (tercer bloque)

**Interfaces:**
- Consumes: `zonas_envio` (Task 1).
- Produces: `sync_pull_snapshot` devuelve la clave `zonas_envio`; `sync_push_snapshot` acepta
  `zonas_envio` en su payload. Lo consume el escritorio en Task 4.

- [ ] **Step 1: Escribir el tercer bloque del smoke (falla)**

Añadir a `supabase/scripts/smoke_envio.sql` antes del `ROLLBACK;`:

```sql
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_snap   jsonb;
  v_zona   uuid := gen_random_uuid();
BEGIN
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Bajada', 25.00);

  -- BAJA: la rebanada del tenant trae las zonas
  v_snap := sync_pull_snapshot(v_tenant);
  IF NOT (v_snap ? 'zonas_envio') THEN
    RAISE EXCEPTION 'sync_pull_snapshot no incluye zonas_envio: la caja nunca vería el catálogo';
  END IF;
  IF jsonb_array_length(v_snap->'zonas_envio') < 1 THEN
    RAISE EXCEPTION 'sync_pull_snapshot devolvió zonas_envio vacío';
  END IF;

  -- SUBE: una zona dada de alta en la caja se replica verbatim
  PERFORM sync_push_snapshot(v_tenant, jsonb_build_object(
    'zonas_envio', jsonb_build_array(jsonb_build_object(
      'id', v_zona, 'tenant_id', v_tenant, 'sucursal_id', v_suc,
      'nombre', 'Desde la caja', 'costo_mxn', 40.00, 'orden', 0, 'activa', true,
      'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));

  IF NOT EXISTS (SELECT 1 FROM zonas_envio WHERE id = v_zona AND costo_mxn = 40.00) THEN
    RAISE EXCEPTION 'sync_push_snapshot no aplicó la zona creada en la caja';
  END IF;

  RAISE NOTICE 'OK sync de zonas_envio';
END $$;
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `❌` con `sync_pull_snapshot no incluye zonas_envio`.

- [ ] **Step 3: Copiar las dos funciones a la 0115 con la línea nueva**

Las funciones se redefinen **completas** (es la convención del repo: cada migración que las toca
las vuelve a declarar entera).

```bash
sed -n '602,649p' supabase/migrations/0111_combos.sql   # sync_pull_snapshot vigente
sed -n '128,256p' supabase/migrations/0114_delivery_viaje.sql   # sync_push_snapshot vigente
```

Pegar ambas al final de la `0115` con estos dos cambios y nada más:

1. En `sync_pull_snapshot`, junto a la línea de `'repartidores'`:

```sql
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
```

2. En `sync_push_snapshot`, en `v_tablas`, **inmediatamente después de `'repartidores'`** (el
   array va ordenado por dependencia y `tickets.zona_envio_id` apunta a la zona, así que tiene
   que aplicarse antes que los tickets):

```sql
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
```

Repetir al final los `REVOKE`/`GRANT` de cada función tal como están en el original.

- [ ] **Step 4: Correr el smoke y verificar que pasa**

```bash
cd desktop && npm run smokes -- smoke_envio.sql
```

Esperado: `✅`.

- [ ] **Step 5: Correr `smoke_sync.sql` y `smoke_sync_push.sql`**

```bash
cd desktop && npm run smokes -- smoke_sync.sql smoke_sync_push.sql
```

Esperado: ambos en verde — son los que protegen que no se haya roto nada al recopiar las
funciones.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0115_zonas_envio.sql supabase/scripts/smoke_envio.sql
git commit -m "feat(envio): las zonas bajan en el pull y suben en el push

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: El escritorio sube y baja el catálogo de zonas

**Files:**
- Modify: `desktop/src/sync-pull.mjs` (`PULL_ORDER`, `marcarZonasDelPull`)
- Modify: `desktop/src/sync-push.mjs` (`asegurarTabla`, pendientes, snapshot, marcado, siembra)
- Modify: `desktop/src/runtime.mjs:334` (llamada a la siembra)
- Test: `desktop/src/sync-push.test.mjs`, `desktop/src/sync-pull.test.mjs`

**Interfaces:**
- Consumes: `sync_pull_snapshot` / `sync_push_snapshot` con `zonas_envio` (Task 3).
- Produces: libreta local `_vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz)`;
  `sembrarZonasUnaVez(db, log)` exportada desde `sync-push.mjs`;
  `marcarZonasDelPull(client, filas, log)` exportada desde `sync-pull.mjs`.

> Todo este camino es el de `repartidores` en la 0114. Leerlo antes de escribir:
> `sync-push.mjs` líneas 100-120 (`asegurarTabla`), 165-250 (`sembrarRepartidoresUnaVez`),
> 290-298 (pendientes), 355 y 368-370 (snapshot), 414-418 (marcado), 458 y 481 (rechazos);
> `sync-pull.mjs` líneas 234-257 (`marcarRepartidoresDelPull`).

- [ ] **Step 1: Escribir los tests (fallan)**

`desktop/src/sync-push.test.mjs` ya tiene el doble `crearPoolFalso({ catalogo, yaMarcados,
fallaLaSiembra })`, que modela la tabla `repartidores`, la libreta `_vim_repartidores_ok` y
`_vim_migraciones_sync`. **Extenderlo**, no escribir otro: añadirle `catalogoZonas = []` y
`yaMarcadasZonas = []`, con las mismas ramas de `query()` que ya tiene para repartidores pero
mirando `_vim_zonas_ok` y `SELECT id FROM zonas_envio`.

Después, añadir al final del archivo:

```js
test("la siembra de zonas no corre dos veces en la misma caja", async () => {
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }] });
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 1);
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 0);
});

test("la siembra de zonas NO marca un alta local que todavía no sube", async () => {
  // Calendario del fallo real de la 0114: arranque sin libreta → alta en la caja → primer sync.
  // Si la libreta ya tiene anotaciones (las puso el pull), sembrar marcaría el alta local como
  // subida y esa zona no viajaría NUNCA.
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }, { id: "z2" }], yaMarcadasZonas: ["z1"] });
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 0);
  assert.ok(!pool.marcadasZonas.has("z2"), "la siembra marcó un alta local sin subir");
});

test("las zonas pendientes son las que la nube aún no confirmó", async () => {
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }, { id: "z2" }], yaMarcadasZonas: ["z1"] });
  const p = await listarPendientes(pool);
  assert.deepEqual(p.zonaIds, ["z2"]);
});
```

Añadir `sembrarZonasUnaVez` al `import` de la línea 22.

Y a `desktop/src/sync-pull.test.mjs`, copiando el test de la línea 74
(`"el pull anota en _vim_repartidores_ok lo que acaba de bajar"`) con la tabla nueva:

```js
test("el pull anota en _vim_zonas_ok lo que acaba de bajar", async () => {
  const client = clienteFalsoDelPull();
  await marcarZonasDelPull(client, [{ id: "z1" }, { id: "z2" }], () => {});
  const marca = client.consultas.find((c) => c.sql.includes("_vim_zonas_ok") && c.sql.includes("unnest"));
  assert.ok(marca, "el pull no anotó las zonas que bajaron");
  assert.deepEqual(marca.params[0], ["z1", "z2"]);
});

test("sin zonas en el snapshot, el pull no toca la libreta", async () => {
  const client = clienteFalsoDelPull();
  assert.equal(await marcarZonasDelPull(client, [], () => {}), 0);
  assert.ok(!client.consultas.some((c) => c.sql.includes("_vim_zonas_ok")));
});
```

(`clienteFalsoDelPull` = el mismo doble que usa el test de repartidores en ese archivo; reusar su
nombre real.)

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd desktop && node --test src/sync-push.test.mjs src/sync-pull.test.mjs
```

Esperado: FAIL — `sembrarZonasUnaVez is not defined` / `snapshot.zonas_envio` undefined.

- [ ] **Step 3: `zonas_envio` baja en el pull**

En `desktop/src/sync-pull.mjs`, en `PULL_ORDER`, justo después de `{ t: "sucursales" }` (su FK):

```js
  { t: "sucursales" },
  { t: "zonas_envio" },
```

Y junto a `marcarRepartidoresDelPull` (línea 248), su gemela:

```js
/**
 * Anota en la libreta del PUSH las zonas de envío que acaban de bajar del pull.
 *
 * Misma razón que con los repartidores: si solo se escribiera al subir, lo que baja del panel
 * quedaría fuera de la libreta y el push lo volvería a mandar, pisando con la copia vieja de la
 * caja el nombre, el costo y el `activa` que se acaban de editar arriba. Y el push corre ANTES
 * que el pull, sin refrescarse primero.
 */
export async function marcarZonasDelPull(client, filas, log = () => {}) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return 0;
  await client.query(
    "CREATE TABLE IF NOT EXISTS _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await client.query(
    "INSERT INTO _vim_zonas_ok (zona_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING", [ids]);
  log(`  zonas de envío: ${ids.length} anotada(s) como de la nube (no vuelven a subir)`);
  return ids.length;
}
```

Llamarla desde `pullSnapshot` en el mismo punto donde se llama a `marcarRepartidoresDelPull`,
pasándole `snapshot.zonas_envio`.

- [ ] **Step 4: `zonas_envio` sube en el push**

En `desktop/src/sync-push.mjs`, cuatro puntos:

1. `asegurarTabla` (junto al CREATE de `_vim_repartidores_ok`, línea ~110):

```js
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
```

2. Consulta de pendientes (junto a la de `repartidores`, línea ~293):

```sql
      (SELECT array_agg(x.id) FROM zonas_envio x
        WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)) AS zonas
```

y devolverlo en el objeto de retorno como `zonaIds: rows[0].zonas ?? []`.

3. Snapshot (junto a `'repartidores'`, línea ~369):

```sql
        -- El catálogo de zonas de envío, solo las que la nube aún no confirmó. Ver _vim_zonas_ok.
        'zonas_envio',               (SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x
                                        WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)),
```

y en el `SELECT` de ids, `(SELECT array_agg(id) FROM zonas_envio x WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)) AS zonas`.

4. Marcado tras un push confirmado (junto a la función de la línea 414):

```js
/** Marca las zonas de envío que la nube ya aplicó: no vuelven a subir nunca. */
export async function marcarZonasSubidas(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_zonas_ok (zona_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING",
    [ids],
  );
}
```

Llamarla donde se marcan los repartidores, y tratar el rechazo de una zona igual que el de un
repartidor en el bloque de la línea 458 (se reintenta sola, no cuelga del ticket).

- [ ] **Step 5: La siembra, una vez por caja**

En `desktop/src/sync-push.mjs`, copiando `sembrarRepartidoresUnaVez` (línea 165) con la clave
`siembra_zonas_0115`:

```js
export async function sembrarZonasUnaVez(db, log = () => {}) {
  await db.query("CREATE TABLE IF NOT EXISTS _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await db.query("CREATE TABLE IF NOT EXISTS _vim_migraciones_sync (clave text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())");
  const { rowCount: yaCorrio } = await db.query(
    "SELECT 1 FROM _vim_migraciones_sync WHERE clave = 'siembra_zonas_0115'");
  if (yaCorrio) return 0;

  // Libreta con filas y sin marcador: la escribió el pull, así que el catálogo local ya puede
  // tener un alta hecha en la caja y sin subir. Sembrar ahora la marcaría como enviada — la misma
  // pérdida que esta función existe para impedir.
  const { rowCount: yaTieneFilas } = await db.query("SELECT 1 FROM _vim_zonas_ok LIMIT 1");
  await db.query("INSERT INTO _vim_migraciones_sync(clave) VALUES ('siembra_zonas_0115') ON CONFLICT DO NOTHING");
  if (yaTieneFilas) {
    log("libreta de zonas ya tenía anotaciones: no se siembra (marcaría un alta local sin subir)");
    return 0;
  }

  try {
    const { rowCount: n } = await db.query(
      "INSERT INTO _vim_zonas_ok (zona_id) SELECT id FROM zonas_envio ON CONFLICT DO NOTHING");
    if (n > 0) log(`libreta de zonas sembrada con ${n} del catálogo (bajaron de la nube: no vuelven a subir)`);
    return n;
  } catch (e) {
    // Ruidoso pero no fatal: la caja abre. El siguiente push subirá el catálogo entero una vez.
    log(`⚠ no se pudo sembrar la libreta de zonas (${e.message}). La caja abre igual.`);
    return 0;
  }
}
```

Y en `desktop/src/runtime.mjs`, junto a la línea 334:

```js
  await sembrarRepartidoresUnaVez(db, log);
  await sembrarZonasUnaVez(db, log);
```

(añadiendo `sembrarZonasUnaVez` al `import` de la línea 7).

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
cd desktop && node --test src/sync-push.test.mjs src/sync-pull.test.mjs
```

Esperado: PASS.

- [ ] **Step 7: Correr toda la batería del escritorio**

```bash
cd desktop && node --test src/*.test.mjs
```

Esperado: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/sync-pull.mjs desktop/src/sync-push.mjs desktop/src/runtime.mjs desktop/src/sync-push.test.mjs desktop/src/sync-pull.test.mjs
git commit -m "feat(envio): la caja sube y baja el catálogo de zonas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: El carrito sabe de envío

**Files:**
- Modify: `apps/pos/app/lib/carrito.ts`
- Test: `apps/pos/app/lib/__tests__/carrito.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export type EnvioCarrito = { zonaId: string; nombre: string; costoMxn: number }`;
  `EstadoCarrito.envio: EnvioCarrito | null`; acción `{ tipo: "zona"; envio: EnvioCarrito | null }`;
  `calcularTotalesDisplay(lineas, tasaIva?, envioMxn?)`. Lo consumen Tasks 6, 7 y 9.

- [ ] **Step 1: Escribir los tests (fallan)**

Añadir a `apps/pos/app/lib/__tests__/carrito.test.ts`:

```ts
describe("envío por zona", () => {
  const linea: LineaCarrito = {
    clientId: "l1", producto: prod("p1", "Hamburguesa", 120), cantidad: 2,
    modificadores: [], notaCocina: null,
  };

  it("el cargo de la zona suma al total", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.total).toBe(275);
  });

  it("sin envío los totales no cambian", () => {
    expect(calcularTotalesDisplay([linea]).total).toBe(240);
  });

  it("el IVA se calcula sobre el total con envío", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.subtotal + t.iva).toBe(275);
  });

  it("la acción zona guarda la zona elegida", () => {
    const e = reducerCarrito(estadoInicial, {
      tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 },
    });
    expect(e.envio?.costoMxn).toBe(35);
  });

  it("salir de domicilio borra el envío", () => {
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO" },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    expect(reducerCarrito(con, { tipo: "modo", modo: "COMER_AQUI" }).envio).toBeNull();
  });

  it("limpiar el carrito deja el envío en el pedido anterior", () => {
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO" },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    expect(reducerCarrito(con, { tipo: "limpiar" }).envio).toBeNull();
  });
});
```

Añadir `calcularTotalesDisplay` al `import` del principio del archivo.

- [ ] **Step 2: Correr y verificar que fallan**

```bash
cd apps/pos && pnpm test -- app/lib/__tests__/carrito.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar en `carrito.ts`**

```ts
/** Cargo de envío del pedido. Antes de cobrar vive aquí; al persistir se vuelve renglón del ticket. */
export type EnvioCarrito = { zonaId: string; nombre: string; costoMxn: number };
```

En `EstadoCarrito`:

```ts
  /** Zona de reparto y su cargo. Solo DELIVERY_PROPIO. */
  envio?: EnvioCarrito | null;
```

En `estadoInicial`, añadir `envio: null`. En `AccionCarrito`:

```ts
  | { tipo: "zona"; envio: EnvioCarrito | null }
```

En el reducer:

```ts
    case "zona":
      return { ...estado, envio: accion.envio };
```

En `case "modo"`, añadir al objeto devuelto:

```ts
        envio: accion.modo === "DELIVERY_PROPIO" ? estado.envio ?? null : null,
```

En `case "limpiar"`, el envío se va con el pedido (igual que la nota de orden): el objeto
devuelto lleva `envio: null`.

Y los totales:

```ts
/**
 * Totales de DISPLAY. Asume IVA incluido en precio (caso Knock-Out: productos.iva_incluido_en_precio=true).
 * Tasa fija 16% para display; la BD recalcula con la tasa real por producto al cobrar.
 *
 * `envioMxn` es el cargo de zona del pedido. Antes de cobrar no es una línea del carrito —vive en
 * `estado.envio`— pero sí forma parte del total que el cajero le dice al cliente.
 */
export function calcularTotalesDisplay(lineas: LineaCarrito[], tasaIva = 16, envioMxn = 0): TotalesDisplay {
  const total = r2(lineas.reduce((acc, l) => acc + totalLinea(l), 0) + envioMxn);
  const subtotal = r2(total / (1 + tasaIva / 100));
  const iva = r2(total - subtotal);
  return { subtotal, iva, total };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd apps/pos && pnpm test -- app/lib/__tests__/carrito.test.ts && pnpm typecheck
```

Esperado: PASS y typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/carrito.ts apps/pos/app/lib/__tests__/carrito.test.ts
git commit -m "feat(envio): el carrito lleva la zona y su cargo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Zonas en el modal de domicilio

**Files:**
- Create: `apps/pos/app/lib/zonas-envio.ts`
- Create: `apps/pos/app/components/selector-zona.tsx`
- Modify: `apps/pos/app/components/modal-cliente-domicilio.tsx`
- Modify: `apps/pos/app/lib/clientes-domicilio.ts`

**Interfaces:**
- Consumes: `zonas_envio` y `fijar_envio_ticket` (Tasks 1-2); `EnvioCarrito` (Task 5).
- Produces:
  - `zonas-envio.ts`: `type ZonaEnvio = { id: string; nombre: string; costoMxn: number }`;
    `listarZonas(token, sucursalId): Promise<ZonaEnvio[]>`;
    `crearZona(token, { tenantId, sucursalId, nombre, costoMxn }): Promise<ZonaEnvio>`;
    `cambiarCostoZona(token, zonaId, costoMxn): Promise<void>`;
    `fijarEnvioTicket(token, ticketId, zonaId | null): Promise<void>` — **solo para tickets ya
    persistidos** (cambiar la zona de una cuenta abierta desde el ticket lateral). En el cobro
    normal no se usa: `persistirTicket` llama a la RPC con su propio cliente (Task 7).
  - `selector-zona.tsx`: `<SelectorZona token sucursalId tenantId cajaId turnoId valor onCambio />`.
  - `clientes-domicilio.ts`: `DireccionInput.zonaId: string | null`,
    `DireccionCliente.zonaId: string | null`, `ClienteDomicilio.zonaId: string | null`.

- [ ] **Step 1: Escribir `apps/pos/app/lib/zonas-envio.ts`**

```ts
"use client";
import { employeeClient } from "./supabase";

// Zonas de reparto de la sucursal. El cargo de la zona entra al ticket como un renglón
// (fijar_envio_ticket); aquí solo se administra el catálogo.

export type ZonaEnvio = { id: string; nombre: string; costoMxn: number };

function mapZona(r: Record<string, unknown>): ZonaEnvio {
  return { id: String(r.id), nombre: String(r.nombre), costoMxn: Number(r.costo_mxn) };
}

/** Zonas activas de la sucursal, en el orden en que se muestran los chips. */
export async function listarZonas(token: string, sucursalId: string): Promise<ZonaEnvio[]> {
  const { data, error } = await employeeClient(token)
    .from("zonas_envio")
    .select("id, nombre, costo_mxn")
    .eq("sucursal_id", sucursalId)
    .eq("activa", true)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapZona);
}

/** Alta desde la caja: llega un pedido de una colonia que nadie había capturado. Sin PIN. */
export async function crearZona(
  token: string,
  args: { tenantId: string; sucursalId: string; nombre: string; costoMxn: number },
): Promise<ZonaEnvio> {
  const { data, error } = await employeeClient(token)
    .from("zonas_envio")
    .insert({
      tenant_id: args.tenantId,
      sucursal_id: args.sucursalId,
      nombre: args.nombre.trim(),
      costo_mxn: args.costoMxn,
    })
    .select("id, nombre, costo_mxn")
    .single();
  if (error) throw new Error(error.message);
  return mapZona(data as Record<string, unknown>);
}

/** Repreciar una zona existente. El PIN lo pide la pantalla ANTES de llamar aquí. */
export async function cambiarCostoZona(token: string, zonaId: string, costoMxn: number): Promise<void> {
  const { error } = await employeeClient(token)
    .from("zonas_envio")
    .update({ costo_mxn: costoMxn })
    .eq("id", zonaId);
  if (error) throw new Error(error.message);
}

/** Fija (o quita, con `zonaId` null) el renglón de envío de un ticket ya persistido. */
export async function fijarEnvioTicket(token: string, ticketId: string, zonaId: string | null): Promise<void> {
  const { error } = await employeeClient(token).rpc("fijar_envio_ticket", {
    p_ticket_id: ticketId,
    p_zona_id: zonaId,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Escribir `selector-zona.tsx`**

Componente con tres estados: lista de chips, alta (nombre + costo), y repreciar (pide PIN).
El PIN se pide con `ModalAutorizacionPin`, copiando el uso de
`apps/pos/app/components/modal-descuento.tsx:128`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { listarZonas, crearZona, cambiarCostoZona, type ZonaEnvio } from "../lib/zonas-envio";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const chip = "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition";
const mini = "h-9 rounded border border-line-strong px-2 text-[13px] outline-none focus:border-ink";

const pesos = (n: number) => (n === 0 ? "$0" : `$${n.toFixed(0)}`);

/**
 * Zonas de reparto: elegir, dar de alta en el acto, y repreciar con PIN.
 *
 * Crear es libre y repreciar no: dar de alta "Las Joyas $40" no toca ninguna venta anterior, pero
 * bajarle el precio a la zona que usa el 80% de los pedidos sí es dinero del negocio.
 *
 * Un negocio sin zonas no ve más que el ＋: la caja sigue trabajando como antes de esta entrega.
 */
export function SelectorZona({
  token, tenantId, sucursalId, cajaId, turnoId, valor, onCambio,
}: {
  token: string; tenantId: string; sucursalId: string; cajaId: string; turnoId: string;
  valor: string | null;
  onCambio: (z: ZonaEnvio | null) => void;
}) {
  const [zonas, setZonas] = useState<ZonaEnvio[]>([]);
  const [alta, setAlta] = useState<{ nombre: string; costo: string } | null>(null);
  const [repreciando, setRepreciando] = useState<{ zona: ZonaEnvio; costo: string } | null>(null);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarZonas(token, sucursalId)
      .then(setZonas)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las zonas"));
  }, [token, sucursalId]);

  async function guardarAlta() {
    if (!alta) return;
    const costo = Number(alta.costo || 0);
    if (!alta.nombre.trim()) { setError("Escribe el nombre de la zona."); return; }
    if (!Number.isFinite(costo) || costo < 0) { setError("El costo no puede ser negativo."); return; }
    try {
      const z = await crearZona(token, { tenantId, sucursalId, nombre: alta.nombre, costoMxn: costo });
      setZonas((zs) => [...zs, z]);
      setAlta(null);
      setError(null);
      onCambio(z);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la zona");
    }
  }

  async function aplicarNuevoCosto() {
    if (!repreciando) return;
    const costo = Number(repreciando.costo || 0);
    try {
      await cambiarCostoZona(token, repreciando.zona.id, costo);
      setZonas((zs) => zs.map((z) => (z.id === repreciando.zona.id ? { ...z, costoMxn: costo } : z)));
      if (valor === repreciando.zona.id) onCambio({ ...repreciando.zona, costoMxn: costo });
      setRepreciando(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el costo");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {zonas.map((z) => (
          <span key={z.id} className="inline-flex items-center gap-1">
            <button type="button"
              onClick={() => onCambio(valor === z.id ? null : z)}
              className={[chip, valor === z.id ? "bg-ink text-white" : "bg-sel text-ink-2 hover:bg-hover"].join(" ")}>
              {z.nombre} · {pesos(z.costoMxn)}
            </button>
            <button type="button" title="Cambiar el costo (pide PIN)"
              onClick={() => { setRepreciando({ zona: z, costo: String(z.costoMxn) }); setPinAbierto(true); }}
              className="text-[11px] text-ink-3 hover:text-ink">✎</button>
          </span>
        ))}
        {!alta && (
          <button type="button" onClick={() => { setAlta({ nombre: "", costo: "" }); setError(null); }}
            className={[chip, "border border-dashed border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {zonas.length === 0 ? "＋ Crear la primera zona" : "＋"}
          </button>
        )}
      </div>

      {alta && (
        <div className="flex items-center gap-1.5">
          <input className={`${mini} flex-1`} placeholder="Nombre (Las Joyas…)" maxLength={60}
            value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
          <input className={`${mini} w-24`} placeholder="Costo" inputMode="decimal"
            value={alta.costo} onChange={(e) => setAlta({ ...alta, costo: e.target.value })} />
          <button type="button" onClick={guardarAlta} className={[chip, "bg-ink text-white"].join(" ")}>Guardar</button>
          <button type="button" onClick={() => { setAlta(null); setError(null); }}
            className="text-[12px] text-ink-3 hover:text-ink-2">Cancelar</button>
        </div>
      )}

      {repreciando && !pinAbierto && (
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-ink-2">{repreciando.zona.nombre}</span>
          <input className={`${mini} w-24`} inputMode="decimal" autoFocus
            value={repreciando.costo} onChange={(e) => setRepreciando({ ...repreciando, costo: e.target.value })} />
          <button type="button" onClick={aplicarNuevoCosto} className={[chip, "bg-ink text-white"].join(" ")}>Aplicar</button>
          <button type="button" onClick={() => setRepreciando(null)}
            className="text-[12px] text-ink-3 hover:text-ink-2">Cancelar</button>
        </div>
      )}

      {error && <p className="text-[12px] font-medium text-danger" role="alert">{error}</p>}

      {pinAbierto && repreciando && (
        <ModalAutorizacionPin
          token={token}
          accion="editar_zona_envio"
          permisoCodigo="descuento.override_precio"
          entidadTipo="zona_envio"
          entidadId={repreciando.zona.id}
          monto={Number(repreciando.costo || 0)}
          motivo={`Cambio de costo de la zona ${repreciando.zona.nombre}`}
          cajaId={cajaId}
          turnoId={turnoId}
          onAutorizado={() => setPinAbierto(false)}
          onCancelar={() => { setPinAbierto(false); setRepreciando(null); }}
        />
      )}
    </div>
  );
}
```

**Antes de escribirlo, leer `apps/pos/app/components/modal-autorizacion-pin.tsx` y
`apps/pos/app/components/modal-descuento.tsx:120-140`** y ajustar los props de
`ModalAutorizacionPin` a su firma real (los nombres `onAutorizado`/`onCancelar` son los esperados,
pero el componente puede pedir alguno más).

Reglas de la interacción, para que no se pierdan al traducir el código:

- Tocar el chip ya elegido lo deselecciona (`onCambio(null)`): un pedido puede quedarse sin zona.
- El `＋` no pide PIN. El `✎` sí, siempre, incluso para subir el precio.
- Con `zonas.length === 0` solo se ve "＋ Crear la primera zona". **Un negocio sin zonas trabaja
  exactamente como hoy.**

- [ ] **Step 3: La dirección guarda su zona**

En `apps/pos/app/lib/clientes-domicilio.ts`:

```ts
export type DireccionCliente = {
  id: string;
  etiqueta: string;
  preview: string;
  referencias: string | null;
  /** Zona de reparto de esta dirección. null = todavía no se le asignó. */
  zonaId: string | null;
};
```

```ts
export type DireccionInput = {
  etiqueta: string;
  calle: string;
  numero: string;
  colonia: string;
  referencias: string;
  zonaId: string | null;
};
```

- `mapDir`: añadir `zonaId: (d.zona_envio_id as string) ?? null` y `zona_envio_id` a `FilaDir`.
- `buscarClientesDomicilio`: añadir `zona_envio_id` al `select` anidado de `direcciones_cliente`.
- `agregarDireccionCliente`: añadir `zona_envio_id: args.dir.zonaId` al `insert` y `zonaId` al
  objeto devuelto.
- `ClienteDomicilio` gana `zonaId: string | null` (la de la dirección elegida) y `conDireccion`
  lo propaga: `zonaId: dir.zonaId`.

- [ ] **Step 4: Meter el selector en el modal**

En `apps/pos/app/components/modal-cliente-domicilio.tsx`:

- `DIR_VACIA` gana `zonaId: null`.
- `CamposDireccion` recibe los props nuevos (`token`, `tenantId`, `sucursalId`, `cajaId`,
  `turnoId`) y, debajo del campo *Referencias*, renderiza:

```tsx
      <div>
        <span className={label}>Zona</span>
        <SelectorZona
          token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
          valor={dir.zonaId}
          onCambio={(z) => onCambio({ ...dir, zonaId: z?.id ?? null })}
        />
      </div>
```

- `ModalClienteDomicilio` gana los props `cajaId` y `turnoId` (los necesita el PIN) y los pasa.
- `validarDir`: si hay zonas activas cargadas y `d.zonaId` es `null`, devolver
  `"Elige la zona de reparto."`. Si no hay zonas, no se exige nada.
- Al elegir una dirección guardada **sin zona** teniendo zonas activas: en vez de llamar a
  `onSeleccionar` directo, abrir el selector para esa dirección, guardar la zona con
  `supabase.from("direcciones_cliente").update({ zona_envio_id })` y luego sí seleccionar.

- [ ] **Step 5: Verificar tipos y que el POS compila**

```bash
cd apps/pos && pnpm typecheck && pnpm test
```

Esperado: sin errores. (Si `home-pos.tsx` se queja por los props nuevos del modal, pasarle
`cajaId={turno.caja_id}` y `turnoId={turno.id}` en la línea 1672.)

- [ ] **Step 6: Commit**

```bash
git add apps/pos/app/lib/zonas-envio.ts apps/pos/app/components/selector-zona.tsx apps/pos/app/components/modal-cliente-domicilio.tsx apps/pos/app/lib/clientes-domicilio.ts apps/pos/app/components/home-pos.tsx
git commit -m "feat(envio): elegir y crear zona desde el modal de domicilio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: El envío en el ticket lateral y en la venta

**Files:**
- Modify: `apps/pos/app/components/sidebar-ticket.tsx`
- Modify: `apps/pos/app/lib/cobro.ts`
- Modify: `apps/pos/app/components/home-pos.tsx` (4 llamadas a `persistirTicket`)

**Interfaces:**
- Consumes: `EstadoCarrito.envio` (Task 5), `fijarEnvioTicket` (Task 6).
- Produces: `persistirTicket(ctx, modoServicio, lineas, ticketClientId, clienteId?,
  direccionEntregaId?, notaOrden?, nombreCliente?, envioZonaId?)` — noveno parámetro opcional.

- [ ] **Step 1: `persistirTicket` fija el envío**

En `apps/pos/app/lib/cobro.ts`, añadir el parámetro al final de la firma:

```ts
  nombreCliente?: string | null,
  /** Zona de reparto del pedido. El cargo entra como renglón, después de los productos: la RPC
   *  hereda la política de IVA del primer renglón, así que los productos tienen que existir ya. */
  envioZonaId?: string | null,
): Promise<TotalesTicket> {
```

y, justo antes del `return leerTotales(...)`:

```ts
  if (envioZonaId) {
    const { error } = await sb.rpc("fijar_envio_ticket", { p_ticket_id: tid, p_zona_id: envioZonaId });
    if (error) throw new Error(error.message);
  }

  return leerTotales(ctx.token, tid);
```

- [ ] **Step 2: Pasar la zona en las cuatro llamadas**

En `apps/pos/app/components/home-pos.tsx`, líneas 717, 768, 813 y 847, añadir como último
argumento:

```ts
          carrito.nombreCuenta ?? null,
          carrito.envio?.zonaId ?? null,
```

- [ ] **Step 3: El ticket lateral muestra el envío**

En `apps/pos/app/components/sidebar-ticket.tsx`:

```ts
  const totales = calcularTotalesDisplay(estado.lineas, 16, estado.envio?.costoMxn ?? 0);
```

y, dentro del bloque de totales, **encima** de la fila `Subtotal`:

```tsx
        {estado.envio && (
          <button type="button" onClick={onCambiarZona}
            className="mb-1 flex w-full items-center justify-between text-[13px] text-ink-2 hover:text-ink">
            <span>{estado.envio.nombre}</span>
            <span className="tabular-nums font-medium text-ink">{fmtMxn(estado.envio.costoMxn)}</span>
          </button>
        )}
```

con un prop nuevo `onCambiarZona?: () => void` que en `home-pos.tsx` abre el modal de domicilio
en el paso de zona. Cambiar la zona ahí toca **solo este pedido**: despacha
`{ tipo: "zona", envio }` y no reescribe `direcciones_cliente`.

- [ ] **Step 4: Verificar tipos y pruebas**

```bash
cd apps/pos && pnpm typecheck && pnpm test
```

Esperado: limpio y en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/components/sidebar-ticket.tsx apps/pos/app/lib/cobro.ts apps/pos/app/components/home-pos.tsx
git commit -m "feat(envio): el cargo se ve en el ticket y viaja al cobrar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: La cocina no ve el envío

**Files:**
- Modify: `packages/kds-core/src/comandas.ts`
- Modify: `apps/pos/app/lib/print/tipos.ts`
- Modify: `apps/pos/app/lib/print/ticket-datos.ts`
- Modify: `apps/pos/app/lib/print/comanda-builder.ts`
- Test: `apps/pos/app/lib/print/__tests__/comanda-builder.test.ts`,
  `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`

**Interfaces:**
- Consumes: `ticket_items.cargo_tipo` (Task 1).
- Produces: `LineaImpresion.cargoTipo?: string | null`. `lineasParaComanda` deja fuera los cargos;
  `ticket-builder` los imprime.

- [ ] **Step 1: Escribir los tests (fallan)**

En `apps/pos/app/lib/print/__tests__/comanda-builder.test.ts` (ya importa `lineasParaComanda` y
`type LineaImpresion`):

```ts
describe("cargos", () => {
  it("el envío no llega a la comanda: la plancha no prepara un reparto", () => {
    const lineas: LineaImpresion[] = [
      { id: "1", cantidad: 1, nombre: "Hamburguesa Clásica", totalMxn: 120, modificadores: [], notaCocina: null },
      { id: "2", cantidad: 1, nombre: "Envío · Zona Norte", totalMxn: 35, modificadores: [], notaCocina: null, cargoTipo: "ENVIO" },
    ];
    expect(lineasParaComanda(lineas).map((l) => l.nombre)).toEqual(["Hamburguesa Clásica"]);
  });

  it("un pedido que es SOLO envío no produce comanda con renglones", () => {
    const lineas: LineaImpresion[] = [
      { id: "1", cantidad: 1, nombre: "Envío · Centro", totalMxn: 0, modificadores: [], notaCocina: null, cargoTipo: "ENVIO" },
    ];
    expect(lineasParaComanda(lineas)).toEqual([]);
  });
});
```

En `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`, apoyándose en la constante `DATOS`
que ya tiene el archivo:

```ts
it("el cargo de envío sí se imprime en el ticket del cliente", () => {
  const conEnvio: DatosTicketImpresion = {
    ...DATOS,
    lineas: [
      ...DATOS.lineas,
      { cantidad: 1, nombre: "Envío · Zona Norte", totalMxn: 35, modificadores: [], notaCocina: null, cargoTipo: "ENVIO" },
    ],
    totales: { ...DATOS.totales, total: 143 },
  };
  const job = construirTicketJob(conEnvio);
  expect(job.bloques).toContainEqual({ t: "fila", izq: "1x Envío · Zona Norte", der: "$35.00" });
  expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL", der: "$143.00", bold: true });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
cd apps/pos && pnpm test -- app/lib/print/__tests__/comanda-builder.test.ts app/lib/print/__tests__/ticket-builder.test.ts
```

Esperado: el de la comanda FALLA (hoy el envío pasa); el del ticket depende de los ayudantes.

- [ ] **Step 3: Implementar los filtros**

`apps/pos/app/lib/print/tipos.ts`, en `LineaImpresion`:

```ts
  /** 'ENVIO' = cargo, no comida: se imprime en el ticket del cliente pero nunca en la comanda. */
  cargoTipo?: string | null;
```

`apps/pos/app/lib/print/ticket-datos.ts`: añadir `cargo_tipo` al `select` de `ticket_items`
(línea ~59) y `cargoTipo: (it.cargo_tipo as string) ?? null` al `map` (línea ~75).

`apps/pos/app/lib/print/comanda-builder.ts`, primera línea de `lineasParaComanda`:

```ts
export function lineasParaComanda(lineas: LineaImpresion[]): LineaConArea[] {
  // Los cargos (envío) no son comida: a la plancha no le sirve saber que el pedido paga $35 de
  // reparto, y un renglón así en la comanda se lee como un platillo que nadie sabe preparar.
  lineas = lineas.filter((l) => !l.cargoTipo);
```

`packages/kds-core/src/comandas.ts`: añadir `cargo_tipo` al `select` (línea ~43) y al tipo de
`ticket_items`, y filtrarlo en `vivos`:

```ts
    const vivos = (t.ticket_items ?? [])
      .filter((i) => !i.cancelado && !i.cargo_tipo)
      .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion);
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd apps/pos && pnpm test && pnpm typecheck
```

Esperado: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add packages/kds-core/src/comandas.ts apps/pos/app/lib/print/
git commit -m "fix(envio): el cargo se imprime en el ticket pero no llega a cocina

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Cuentas reabiertas

**Files:**
- Modify: `apps/pos/app/lib/cuenta-mesa.ts`
- Test: `apps/pos/app/lib/__tests__/cuenta-mesa.test.ts`

**Interfaces:**
- Consumes: `cargo_tipo` (Task 1), `EnvioCarrito` (Task 5).
- Produces: `reconstruirCarrito` devuelve
  `{ lineas: LineaCarrito[]; modoServicio: ModoServicio; envio: EnvioCarrito | null }`.

- [ ] **Step 1: Escribir el test (falla)**

```ts
it("el renglón de envío no se cuela como línea del carrito", () => {
  const filas = [
    { id: "i1", client_id_local: null, producto_id: "p1", cantidad: 1, nota_cocina: null,
      cancelado: false, parent_item_id: null, combo_rol: null, combo_grupo_nombre_snapshot: null,
      precio_unitario_snapshot: 120, cargo_tipo: null, producto_nombre_snapshot: "Hamburguesa",
      ticket_item_modificadores: [] },
    { id: "i2", client_id_local: null, producto_id: null, cantidad: 1, nota_cocina: null,
      cancelado: false, parent_item_id: null, combo_rol: null, combo_grupo_nombre_snapshot: null,
      precio_unitario_snapshot: 35, cargo_tipo: "ENVIO", producto_nombre_snapshot: "Envío · Zona Norte",
      ticket_item_modificadores: [] },
  ];
  expect(envioDeFilas(filas)).toEqual({ zonaId: "", nombre: "Envío · Zona Norte", costoMxn: 35 });
  expect(agruparPadresHijos(filas.filter((f) => !f.cargo_tipo), porId, []).length).toBe(1);
});
```

(`porId` = `new Map([["p1", prod("p1", "Hamburguesa", 120)]])`, con el mismo ayudante `prod` que
usa `carrito.test.ts`.)

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd apps/pos && pnpm test -- app/lib/__tests__/cuenta-mesa.test.ts
```

Esperado: FAIL — `envioDeFilas is not exported`.

- [ ] **Step 3: Implementar**

En `apps/pos/app/lib/cuenta-mesa.ts`:

- `FilaItemPersistido` gana `cargo_tipo: string | null` y
  `producto_nombre_snapshot: string`, y `producto_id` pasa a `string | null`.

```ts
/**
 * Saca el cargo de envío de los renglones persistidos.
 *
 * Sin esto el renglón se perdería en silencio: `agruparPadresHijos` descarta lo que no encuentra
 * en el catálogo, y el envío no está en el catálogo a propósito. El cajero vería un total con
 * envío sin nada en pantalla que lo explique.
 *
 * `zonaId` se rellena luego desde `tickets.zona_envio_id`; para pintar el renglón basta el nombre
 * y el importe congelados.
 */
export function envioDeFilas(filas: FilaItemPersistido[]): EnvioCarrito | null {
  const f = filas.find((r) => r.cargo_tipo === "ENVIO" && !r.cancelado);
  if (!f) return null;
  return { zonaId: "", nombre: f.producto_nombre_snapshot, costoMxn: Number(f.precio_unitario_snapshot) };
}
```

En `reconstruirCarrito`: añadir `cargo_tipo, producto_nombre_snapshot` al `select`, leer también
`zona_envio_id` del ticket, y devolver:

```ts
  const filas = (data ?? []) as unknown as FilaItemPersistido[];
  const envio = envioDeFilas(filas);
  return {
    lineas: agruparPadresHijos(filas.filter((r) => !r.cargo_tipo), porId, combos),
    modoServicio: modo,
    envio: envio ? { ...envio, zonaId: String(ticket?.zona_envio_id ?? "") } : null,
  };
```

Actualizar los llamadores de `reconstruirCarrito` para que despachen
`{ tipo: "zona", envio }` con lo que devuelve (`grep -rn "reconstruirCarrito" apps/pos`).

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd apps/pos && pnpm test && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/cuenta-mesa.ts apps/pos/app/lib/__tests__/cuenta-mesa.test.ts
git commit -m "fix(envio): reabrir una cuenta de domicilio conserva su cargo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: El panel administra las zonas

**Files:**
- Create: `apps/admin/app/lib/zonas-envio.ts`
- Create: `apps/admin/app/(panel)/configuracion/envios/page.tsx`
- Modify: el menú de Configuración (buscarlo con
  `grep -rn "propinas" apps/admin/app --include=*.tsx -l`)

**Interfaces:**
- Consumes: `zonas_envio` (Task 1).
- Produces: `listarZonas(sucursalId)`, `crearZona(input)`, `editarZona(id, input)`,
  `setActivaZona(id, activa)`, `eliminarZona(id)` y `zonaSchema` (zod).

- [ ] **Step 1: Escribir la lib copiando la de repartidores**

`apps/admin/app/lib/repartidores.ts` es el molde exacto (zod + `supabase` + `leerSesion` +
baja lógica). Diferencias: la zona lleva `sucursal_id` y `costo_mxn`, y el esquema es:

```ts
export const zonaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la zona").max(60),
  costoMxn: z.coerce.number().min(0, "El costo no puede ser negativo").max(9999),
  orden: z.coerce.number().int().min(0).default(0),
});
export type ZonaInput = z.infer<typeof zonaSchema>;
```

- [ ] **Step 2: Escribir la página copiando la de repartidores**

`apps/admin/app/(panel)/usuarios/repartidores/page.tsx` es el molde (PageHeader/PageBody, modal
de alta/edición, confirmación de borrado, `mensajeError`). Cambios:

- Selector de sucursal arriba (las zonas son por sucursal).
- Columnas: Zona · Costo · Activa · acciones.
- Nota fija bajo la tabla, porque es la expectativa que más se rompe:
  *"Cambiar el costo de una zona afecta a los pedidos nuevos. Los ya cobrados conservan lo que
  se cobró ese día."*

- [ ] **Step 3: Enlazar desde el menú de Configuración**

Añadir la entrada *Envíos* junto a *Propinas*, con el mismo patrón del archivo que resultó del
`grep` de arriba.

- [ ] **Step 4: Verificar**

```bash
cd apps/admin && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/zonas-envio.ts "apps/admin/app/(panel)/configuracion/envios/page.tsx"
git commit -m "feat(envio): pantalla de zonas de envío en el panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: ADR, memoria y verificación a mano

**Files:**
- Create: `docs/decisiones/0017-el-envio-es-un-renglon.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Escribir el ADR**

`docs/decisiones/0017-el-envio-es-un-renglon.md`, en el formato de
`docs/decisiones/0016-un-viaje-es-una-columna-no-una-tabla.md`. El argumento central: los totales
salen solo de `ticket_items` y el armador de conceptos del CFDI valida contra `total_mxn`, así que
un cargo fuera de los renglones produce tickets que no se pueden facturar. Consecuencia aceptada:
el envío aparece como una línea en el CFDI con la clave genérica del giro.

- [ ] **Step 2: Correr toda la batería**

```bash
cd desktop && npm run smokes && node --test src/*.test.mjs
cd ../apps/pos && pnpm test && pnpm typecheck
```

Esperado: todo en verde.

- [ ] **Step 3: Aplicar la migración a producción**

Antes de abrir el PR. Sin esto, una caja actualizada contra la base vieja falla al fijar el envío.

- [ ] **Step 4: Verificación a mano en la caja instalada**

1. Crear dos zonas desde el modal de domicilio: *Centro $0* y *Zona 2 $35*.
2. Pedido a domicilio en Zona 2 → el ticket lateral muestra `Envío · Zona 2 $35.00` y el total
   sube 35.
3. La comanda impresa **no** trae el envío; el KDS tampoco.
4. Cobrar → el ticket impreso trae la línea de envío y el total cuadra.
5. Facturar ese ticket desde el portal de autofactura → timbra y el PDF muestra el renglón.
6. Segundo pedido del mismo cliente → la zona sale sola, sin volver a elegirla.
7. Pedido en Centro ($0) → hay renglón, el total no cambia.
8. Intentar cambiar el precio de una zona → pide PIN.
9. Cerrar turno y revisar el corte.

- [ ] **Step 5: Actualizar `MEMORY.md`**

Sección «Dónde estamos» + «Últimos commits», y una entrada nueva en la tabla de módulos con el
estado (migración aplicada, versión del instalador si ya se publicó).

- [ ] **Step 6: Commit y PR**

```bash
git add docs/decisiones/0017-el-envio-es-un-renglon.md MEMORY.md
git commit -m "docs(envio): ADR 0017 y estado del proyecto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin delivery/zonas-envio
```

PR con el cuerpo terminado en
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Notas de riesgo para quien ejecute

- **El número de migración.** Si otra rama tomó `0115`, renombrar antes de empezar: dos
  migraciones con el mismo número se pisan en el despliegue.
- **Los smokes son el contrato.** Si `smoke_envio.sql` se pone rojo tras un cambio en otra parte,
  lo más probable es que alguien haya metido dinero al ticket sin renglón. Eso rompe el timbrado.
- **No publicar instalador sin la migración aplicada** y sin pasar la lista "Antes de empaquetar"
  del RUNBOOK (un `.exe` de menos de ~155 MB va sin PostgREST y deja la caja muerta).
- **Promociones sobre el envío:** comprobarlo al llegar a Task 7. Si `aplicar_promocion` reparte
  sobre todos los renglones vivos, un 10% de descuento estaría rebajando también los $35, y hay
  que excluir `cargo_tipo IS NOT NULL` de su base.
