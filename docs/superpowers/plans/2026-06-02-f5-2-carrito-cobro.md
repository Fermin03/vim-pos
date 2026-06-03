# F5.2 — Carrito + Cobro: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cajero arme un ticket con modificadores y modo de servicio en el POS y una venta real persista en Postgres con RLS, cobrada (efectivo con cambio / tarjeta / transferencia / app / dividido) y cerrada con folio.

**Architecture:** Enfoque C (carrito local en React → commit del ticket completo al cobrar vía las RPC de venta de la migración 0008; los totales los calcula la BD con `recalcular_totales_ticket()`). Antes del frontend se arregla y se prueba la capa RPC a nivel SQL (Fase A), porque las funciones de 0008 nunca se ejecutaron y `agregar_item_a_ticket` tiene 3 columnas fantasma.

**Tech Stack:** Next.js 15 (App Router, RSC + client components), React 19, TypeScript (sin `any`), Tailwind + design system `@vim/ui`, `@supabase/supabase-js` (browser client con JWT de empleado, `.rpc()`), Supabase local (Postgres + pgTAP). Sin runner de JS: el gate es `typecheck` + `build` + smoke test SQL + E2E en navegador (Preview), siguiendo la filosofía de prueba pragmática del repo (CLAUDE.md §Testing).

**Convenciones del repo (no romper):**
- Dinero `numeric(12,2)` en BD; en TS números validados, nunca float para acumular sin `Math.round`.
- Dominio en español, archivos `kebab-case`, componentes `PascalCase`.
- El POS habla a Supabase con `employeeClient(token)` (RLS = frontera). Para F5.2 se llama vía `.rpc()` (las funciones de 0008 son `SECURITY INVOKER`, corren bajo la RLS del empleado).
- Una migración aplicada en remoto NO se edita; los arreglos van como migración aditiva (`CREATE OR REPLACE`).
- Mensajes de commit estilo repo: `feat(pos): F5.2 — …`, `fix(db): …`. Cerrar cada commit con el trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Bugs cazados → anotar en la bitácora del Playbook (doc 18 §4) y en `../MEMORY.md`.

**Tipos de la BD relevantes:**
- `modo_servicio` (F5.2 usa): `COMER_AQUI`, `PARA_LLEVAR`, `DRIVE_THRU`.
- `metodo_pago` (F5.2 usa): `EFECTIVO`, `TARJETA_CREDITO`, `TARJETA_DEBITO`, `TRANSFERENCIA`, `APP_OTRO`.
- `modificador_tipo_seleccion`: `UNICA_OBLIGATORIA` (exactamente 1; pre-selecciona `es_default`), `UNICA_OPCIONAL` (0–1), `MULTIPLE_OPCIONAL` (0–N), `MULTIPLE_OBLIGATORIA_RANGO` (min–max del grupo).

**Firmas RPC (parámetros nombrados, snake_case con prefijo `p_`):**
- `abrir_ticket(p_sucursal_id, p_caja_id, p_turno_id, p_modo_servicio, p_cliente_id?, p_marca_virtual_id?, p_client_id_local?, p_usuario_id?) → uuid`
- `agregar_item_a_ticket(p_ticket_id, p_producto_id, p_cantidad, p_nota_cocina?, p_modificadores jsonb?, p_client_id_local?) → uuid`. `p_modificadores`: `[{ "opcion_modificador_id": uuid, "cantidad": int }]`.
- `aplicar_pago(p_ticket_id, p_metodo_pago, p_monto_mxn, p_monto_recibido_mxn?, p_referencia?, p_terminal_aprobacion?, p_folio_externo?, p_es_pago_al_recibir?, p_nota?, p_client_id_local?) → uuid`. La BD calcula `cambio_mxn` cuando `EFECTIVO` y `p_monto_recibido_mxn` no es null. Valida que la suma de pagos no exceda `total_mxn`. Al saldar, transiciona a `PAGADO`.

---

## FASE A — Capa de venta probada a nivel SQL

### Task 1: Migración 0016 — arreglar `agregar_item_a_ticket`

El cuerpo referencia columnas inexistentes del catálogo (0007). Reales: `codigo_interno` (no `sku`), `modos_servicio_disponibles` (no `modos_servicio_aplicables`), `precio_extra_mxn` (no `precio_extra`). Las funciones plpgsql no validan el cuerpo hasta invocarse, por eso "aplican limpias" pero nunca corrieron. Arreglo quirúrgico: aliasear las columnas reales a los nombres que el cuerpo espera (resto idéntico al original).

**Files:**
- Create: `supabase/migrations/0016_fix_agregar_item_columnas.sql`

- [ ] **Step 1: Escribir la migración (CREATE OR REPLACE con los 3 alias)**

```sql
-- 0016 — Fix agregar_item_a_ticket: usar columnas reales del catálogo (0007).
-- Bug (#19 bitácora): el cuerpo de 0008 referenciaba p.sku, p.modos_servicio_aplicables
-- y om.precio_extra, que NO existen. Reales: productos.codigo_interno,
-- productos.modos_servicio_disponibles, opciones_modificador.precio_extra_mxn.
-- plpgsql no valida el cuerpo hasta invocarse → la función creó "limpia" pero
-- fallaba al primer item. Se re-crea con alias a las columnas reales; resto idéntico.
CREATE OR REPLACE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_ticket_estado ticket_estado_fiscal;
  v_producto      record;
  v_item_id       uuid;
  v_modif         jsonb;
  v_opcion        record;
  v_next_orden    integer;
BEGIN
  SELECT tenant_id, estado_fiscal INTO v_tenant_id, v_ticket_estado
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar items a tickets BORRADOR o ABIERTO (estado actual: %)', v_ticket_estado;
  END IF;

  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM ticket_items
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_item_id; END IF;
  END IF;

  -- FIX: codigo_interno AS sku, modos_servicio_disponibles AS modos_servicio_aplicables
  SELECT p.id, p.nombre, p.codigo_interno AS sku, p.precio_base_mxn, p.tasa_iva,
         p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
         p.modos_servicio_disponibles AS modos_servicio_aplicables,
         c.nombre AS categoria_nombre,
         ac.nombre AS area_cocina_nombre
  INTO v_producto
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN areas_cocina ac ON ac.id = p.area_cocina_id
  WHERE p.id = p_producto_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no existe o está eliminado', p_producto_id;
  END IF;

  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1
  INTO v_next_orden
  FROM ticket_items
  WHERE ticket_id = p_ticket_id;

  INSERT INTO ticket_items (
    tenant_id, ticket_id, producto_id, cantidad, orden_visualizacion,
    producto_nombre_snapshot, producto_sku_snapshot,
    precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
    clave_sat_snapshot, unidad_sat_snapshot,
    categoria_nombre_snapshot, modos_servicio_snapshot, area_cocina_nombre_snapshot,
    nota_cocina, client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, v_producto.id, p_cantidad, v_next_orden,
    v_producto.nombre, v_producto.sku,
    v_producto.precio_base_mxn, v_producto.tasa_iva, v_producto.iva_incluido_en_precio,
    v_producto.clave_sat, v_producto.unidad_sat,
    v_producto.categoria_nombre, v_producto.modos_servicio_aplicables, v_producto.area_cocina_nombre,
    p_nota_cocina, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_item_id;

  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    FOR v_modif IN SELECT * FROM jsonb_array_elements(p_modificadores)
    LOOP
      -- FIX: om.precio_extra_mxn AS precio_extra
      SELECT om.id, om.nombre, om.precio_extra_mxn AS precio_extra,
             gm.id AS grupo_id, gm.nombre AS grupo_nombre, gm.naturaleza
      INTO v_opcion
      FROM opciones_modificador om
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      WHERE om.id = (v_modif->>'opcion_modificador_id')::uuid
        AND om.deleted_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Opción de modificador % no existe', v_modif->>'opcion_modificador_id';
      END IF;

      INSERT INTO ticket_item_modificadores (
        tenant_id, ticket_item_id,
        opcion_modificador_id, grupo_id,
        grupo_nombre_snapshot, opcion_nombre_snapshot,
        precio_extra_snapshot, naturaleza_snapshot,
        cantidad, monto_total_mxn,
        created_by
      ) VALUES (
        v_tenant_id, v_item_id,
        v_opcion.id, v_opcion.grupo_id,
        v_opcion.grupo_nombre, v_opcion.nombre,
        v_opcion.precio_extra, v_opcion.naturaleza,
        COALESCE((v_modif->>'cantidad')::integer, 1),
        v_opcion.precio_extra * COALESCE((v_modif->>'cantidad')::integer, 1) * p_cantidad,
        auth.uid()
      );
    END LOOP;
  END IF;

  RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION agregar_item_a_ticket IS 'Inserta un item con snapshot completo del producto y sus modificadores. Idempotente vía client_id_local. (0016: columnas reales del catálogo.)';
```

- [ ] **Step 2: Aplicar migraciones y verificar que la función recompila**

Run: `supabase db reset`
Expected: aplica `0001`–`0016` + seed sin error; sin `ERROR:` en la salida.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_fix_agregar_item_columnas.sql
git commit -m "fix(db): 0016 — agregar_item_a_ticket usa columnas reales del catálogo (sku/modos/precio_extra)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Seed de modificadores para Knock-Out

El `seed.sql` no trae catálogo de modificadores (un `db reset` deja la BD sin grupos/opciones). Se siembran 2 grupos ligados a productos existentes para poder probar las dos ramas del modal (única-obligatoria y múltiple-opcional). Usa el `tenant_id` y los `producto_id` del seed actual.

**Files:**
- Modify: `supabase/seed.sql` (al final, después de los productos)

- [ ] **Step 1: Localizar el tenant y un producto del seed**

Run: `grep -nE "INSERT INTO (productos|tenants|categorias)" supabase/seed.sql`
Expected: ver el `tenant_id` de Knock-Out y al menos un `producto_id` (hamburguesa). Anotar ambos UUIDs reales del seed. Si el seed NO tiene productos (se crearon por el admin), añadir primero 1 categoría + 2 productos mínimos aquí antes de los modificadores.

- [ ] **Step 2: Añadir grupos + opciones + unión al seed**

Reemplazar `<TENANT_ID>`, `<PROD_HAMBURGUESA>` y `<PROD_PAPAS>` por los UUIDs reales encontrados en el Step 1. Si hiciste falta sembrar productos, usa esos UUIDs.

```sql
-- ===== F5.2: modificadores de prueba (Knock-Out) =====
-- Grupo 1: Término de cocción (única obligatoria) → hamburguesa
INSERT INTO grupos_modificadores (id, tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
VALUES ('a1000000-0000-0000-0000-000000000001', '<TENANT_ID>', 'Término de cocción', 'UNICA_OBLIGATORIA', 'PREPARACION', 1);

INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, es_default, orden_visualizacion) VALUES
  ('<TENANT_ID>', 'a1000000-0000-0000-0000-000000000001', 'Tres cuartos', 0, true, 1),
  ('<TENANT_ID>', 'a1000000-0000-0000-0000-000000000001', 'Bien cocida', 0, false, 2);

-- Grupo 2: Extras (múltiple opcional, con costo) → hamburguesa
INSERT INTO grupos_modificadores (id, tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
VALUES ('a1000000-0000-0000-0000-000000000002', '<TENANT_ID>', 'Extras', 'MULTIPLE_OPCIONAL', 'EXTRA', 2);

INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
  ('<TENANT_ID>', 'a1000000-0000-0000-0000-000000000002', 'Extra queso', 15.00, 1),
  ('<TENANT_ID>', 'a1000000-0000-0000-0000-000000000002', 'Tocino', 20.00, 2);

-- Unión: ambos grupos aplican a la hamburguesa
INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES
  ('<TENANT_ID>', '<PROD_HAMBURGUESA>', 'a1000000-0000-0000-0000-000000000001', 1),
  ('<TENANT_ID>', '<PROD_HAMBURGUESA>', 'a1000000-0000-0000-0000-000000000002', 2);
```

- [ ] **Step 2b: Re-aplicar el seed**

Run: `supabase db reset`
Expected: sin error; los grupos quedan sembrados.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed — grupos de modificadores de prueba para Knock-Out (F5.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Smoke test SQL de la ruta de venta (gate de Fase A)

Prueba la cadena completa contra la BD sembrada, como superusuario (probamos la lógica RPC, no RLS — la RLS ya tiene su test 8/8). Envuelto en transacción con `ROLLBACK` para no ensuciar el seed. Usa los UUID reales del seed (caja, turno, sucursal, producto, usuario, opciones de modificador).

**Files:**
- Create: `supabase/scripts/smoke_venta.sql`

- [ ] **Step 1: Escribir el script de humo**

Reemplazar los `<...>` por UUIDs reales del seed (sácalos con los `grep`/queries indicados en comentarios). El turno debe estar ABIERTO; si el seed no abre turno, el script abre uno.

```sql
-- Smoke test de la ruta de venta (F5.2). Corre como postgres (bypassa RLS).
-- Objetivo: probar abrir_ticket → agregar_item (plano y con modificadores)
-- → aplicar_pago (efectivo y dividido) → PAGADO, con totales correctos.
-- Uso: psql "<DB_URL de 'supabase status'>" -f supabase/scripts/smoke_venta.sql
BEGIN;

DO $$
DECLARE
  v_sucursal uuid := '<SUCURSAL_ID>';
  v_caja     uuid := '<CAJA_ID>';
  v_turno    uuid := '<TURNO_ABIERTO_ID>';
  v_usuario  uuid := '<USUARIO_MARIA_ID>';
  v_prod     uuid := '<PROD_HAMBURGUESA>';   -- precio_base_mxn conocido, IVA incluido
  v_opc_term uuid;
  v_opc_extra uuid := NULL;
  v_ticket   uuid;
  v_total    numeric(12,2);
  v_estado   ticket_estado_fiscal;
  v_pagado   numeric(12,2);
  v_cambio   numeric(12,2);
BEGIN
  SELECT id INTO v_opc_term FROM opciones_modificador WHERE nombre = 'Tres cuartos' LIMIT 1;
  SELECT id INTO v_opc_extra FROM opciones_modificador WHERE nombre = 'Extra queso' LIMIT 1;

  -- 1) abrir ticket
  v_ticket := abrir_ticket(v_sucursal, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_usuario);
  RAISE NOTICE 'ticket=%', v_ticket;

  -- 2) item plano
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, NULL);

  -- 3) item con modificadores (término + extra queso $15)
  PERFORM agregar_item_a_ticket(
    v_ticket, v_prod, 1, 'sin cebolla',
    jsonb_build_array(
      jsonb_build_object('opcion_modificador_id', v_opc_term, 'cantidad', 1),
      jsonb_build_object('opcion_modificador_id', v_opc_extra, 'cantidad', 1)
    ),
    NULL);

  SELECT total_mxn, estado_fiscal INTO v_total, v_estado FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'total tras items=% estado=%', v_total, v_estado;
  IF v_estado <> 'ABIERTO' THEN RAISE EXCEPTION 'esperaba ABIERTO, got %', v_estado; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'total no positivo: %', v_total; END IF;

  -- 4) pago dividido: tarjeta parcial + efectivo con cambio
  PERFORM aplicar_pago(v_ticket, 'TARJETA_DEBITO', ROUND(v_total/2, 2), NULL, '1234', NULL, NULL, false, NULL, NULL);
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO', v_total - ROUND(v_total/2, 2),
                       v_total - ROUND(v_total/2, 2) + 50, NULL, NULL, NULL, false, NULL, NULL);

  SELECT estado_fiscal, monto_pagado_mxn, cambio_mxn INTO v_estado, v_pagado, v_cambio
  FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'estado=% pagado=% cambio=%', v_estado, v_pagado, v_cambio;

  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'esperaba PAGADO, got %', v_estado; END IF;
  IF v_cambio <> 50.00 THEN RAISE EXCEPTION 'esperaba cambio 50, got %', v_cambio; END IF;
  IF (SELECT folio_completo FROM tickets WHERE id = v_ticket) IS NULL
    THEN RAISE EXCEPTION 'folio no asignado'; END IF;

  RAISE NOTICE 'SMOKE OK ✅ ticket=% folio=%', v_ticket,
    (SELECT folio_completo FROM tickets WHERE id = v_ticket);
END $$;

ROLLBACK;
```

- [ ] **Step 2: Obtener el DB_URL y los UUIDs del seed**

Run: `supabase status`
Expected: copiar la línea `DB URL` (ej. `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Sacar UUIDs:
Run: `psql "<DB_URL>" -c "select id,nombre from cajas; select id,codigo_turno,estado from turnos; select id,nombre from usuarios_perfil; select id,nombre,precio_base_mxn from productos;"`

- [ ] **Step 3: Correr el smoke test**

Run: `psql "<DB_URL>" -f supabase/scripts/smoke_venta.sql`
Expected: `NOTICE: SMOKE OK ✅ …`. Si algún `RAISE EXCEPTION` aparece (columna fantasma, trigger, etc.), es un bug de la capa de venta: corregir con una migración aditiva (0017+), anotar en bitácora, re-`db reset`, re-correr hasta verde. **No avanzar a Fase B hasta SMOKE OK.**

- [ ] **Step 4: Commit**

```bash
git add supabase/scripts/smoke_venta.sql
git commit -m "test(db): smoke test de la ruta de venta (abrir→item→pago→PAGADO) (F5.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FASE B — Frontend del POS

> Convención: todos los libs nuevos llevan `"use client"` y usan `employeeClient(token)`. Tras cada Task de código: `pnpm --filter @vim/pos typecheck` debe pasar. Las RPC se llaman con `.rpc("nombre", { p_xxx: ... })`.

### Task 4: `lib/modificadores.ts` — leer grupos+opciones por producto

**Files:**
- Create: `apps/pos/app/lib/modificadores.ts`

- [ ] **Step 1: Escribir el lib**

```typescript
"use client";
import { employeeClient } from "./supabase";

export type TipoSeleccion =
  | "UNICA_OBLIGATORIA"
  | "UNICA_OPCIONAL"
  | "MULTIPLE_OPCIONAL"
  | "MULTIPLE_OBLIGATORIA_RANGO";

export type OpcionModificador = {
  id: string;
  nombre: string;
  precioExtra: number;
  esDefault: boolean;
  agotada: boolean;
};

export type GrupoModificadores = {
  id: string;
  nombre: string;
  tipoSeleccion: TipoSeleccion;
  min: number | null;
  max: number | null;
  opciones: OpcionModificador[];
};

type FilaUnion = {
  orden_visualizacion: number;
  grupo: {
    id: string;
    nombre: string;
    tipo_seleccion: TipoSeleccion;
    activo: boolean;
    deleted_at: string | null;
    minimo_selecciones: number | null;
    maximo_selecciones: number | null;
    opciones: {
      id: string;
      nombre: string;
      precio_extra_mxn: string | number;
      es_default: boolean;
      activa: boolean;
      agotada: boolean;
      deleted_at: string | null;
      orden_visualizacion: number;
    }[];
  } | null;
};

/** Grupos de modificadores aplicables a un producto, ordenados; cada grupo con sus opciones activas. RLS por tenant. */
export async function obtenerGruposDeProducto(
  token: string,
  productoId: string,
): Promise<GrupoModificadores[]> {
  const { data, error } = await employeeClient(token)
    .from("productos_grupos_modificadores")
    .select(
      "orden_visualizacion, grupo:grupos_modificadores(id, nombre, tipo_seleccion, activo, deleted_at, minimo_selecciones, maximo_selecciones, opciones:opciones_modificador(id, nombre, precio_extra_mxn, es_default, activa, agotada, deleted_at, orden_visualizacion))",
    )
    .eq("producto_id", productoId)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as FilaUnion[];
  return filas
    .map((f) => f.grupo)
    .filter((g): g is NonNullable<FilaUnion["grupo"]> => !!g && g.activo && g.deleted_at === null)
    .map((g) => ({
      id: g.id,
      nombre: g.nombre,
      tipoSeleccion: g.tipo_seleccion,
      min: g.minimo_selecciones,
      max: g.maximo_selecciones,
      opciones: (g.opciones ?? [])
        .filter((o) => o.activa && o.deleted_at === null)
        .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion)
        .map((o) => ({
          id: o.id,
          nombre: o.nombre,
          precioExtra: Number(o.precio_extra_mxn),
          esDefault: o.es_default,
          agotada: o.agotada,
        })),
    }));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/lib/modificadores.ts
git commit -m "feat(pos): F5.2 — lib lectura de modificadores por producto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `lib/carrito.ts` — estado del carrito + cálculo de display

Estado puro en memoria con reducer. `calcularTotalesDisplay` es la única matemática de dinero en cliente (solo display; la BD manda al cobrar). Redondeo a centavos con `Math.round(x*100)/100`.

**Files:**
- Create: `apps/pos/app/lib/carrito.ts`

- [ ] **Step 1: Escribir el lib**

```typescript
"use client";
import type { Producto } from "./catalogo";
import type { GrupoModificadores, OpcionModificador } from "./modificadores";

export type ModoServicio = "COMER_AQUI" | "PARA_LLEVAR" | "DRIVE_THRU";

export type ModificadorSel = {
  opcionId: string;
  grupoNombre: string;
  opcionNombre: string;
  precioExtra: number;
  cantidad: number;
};

export type LineaCarrito = {
  clientId: string;
  producto: Producto;
  cantidad: number;
  modificadores: ModificadorSel[];
  notaCocina: string | null;
};

export type EstadoCarrito = {
  modoServicio: ModoServicio;
  lineas: LineaCarrito[];
};

export const estadoInicial: EstadoCarrito = { modoServicio: "COMER_AQUI", lineas: [] };

export type AccionCarrito =
  | { tipo: "agregar"; linea: LineaCarrito }
  | { tipo: "cantidad"; clientId: string; cantidad: number }
  | { tipo: "quitar"; clientId: string }
  | { tipo: "modo"; modo: ModoServicio }
  | { tipo: "limpiar" };

export function reducerCarrito(estado: EstadoCarrito, accion: AccionCarrito): EstadoCarrito {
  switch (accion.tipo) {
    case "agregar":
      return { ...estado, lineas: [...estado.lineas, accion.linea] };
    case "cantidad":
      return {
        ...estado,
        lineas: estado.lineas
          .map((l) => (l.clientId === accion.clientId ? { ...l, cantidad: accion.cantidad } : l))
          .filter((l) => l.cantidad > 0),
      };
    case "quitar":
      return { ...estado, lineas: estado.lineas.filter((l) => l.clientId !== accion.clientId) };
    case "modo":
      return { ...estado, modoServicio: accion.modo };
    case "limpiar":
      return { modoServicio: estado.modoServicio, lineas: [] };
    default:
      return estado;
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Precio unitario de una línea: base + suma de modificadores (precio_extra * cantidad de cada modif). */
export function precioUnitarioLinea(l: LineaCarrito): number {
  const modif = l.modificadores.reduce((acc, m) => acc + m.precioExtra * m.cantidad, 0);
  return r2(l.producto.precio_base_mxn + modif);
}

/** Total bruto de una línea (precio unitario * cantidad). */
export function totalLinea(l: LineaCarrito): number {
  return r2(precioUnitarioLinea(l) * l.cantidad);
}

export type TotalesDisplay = { subtotal: number; iva: number; total: number };

/**
 * Totales de DISPLAY. Asume IVA incluido en precio (caso Knock-Out: productos.iva_incluido_en_precio=true).
 * Tasa fija 16% para display; la BD recalcula con la tasa real por producto al cobrar.
 */
export function calcularTotalesDisplay(lineas: LineaCarrito[], tasaIva = 16): TotalesDisplay {
  const total = r2(lineas.reduce((acc, l) => acc + totalLinea(l), 0));
  const subtotal = r2(total / (1 + tasaIva / 100));
  const iva = r2(total - subtotal);
  return { subtotal, iva, total };
}

/** Construye la selección de modificadores por defecto de un grupo (para UNICA_OBLIGATORIA). */
export function seleccionInicialGrupo(g: GrupoModificadores): OpcionModificador[] {
  if (g.tipoSeleccion === "UNICA_OBLIGATORIA") {
    const def = g.opciones.find((o) => o.esDefault) ?? g.opciones[0];
    return def ? [def] : [];
  }
  return [];
}

/** Genera un uuid de cliente para `client_id_local`. */
export function nuevoClientId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/lib/carrito.ts
git commit -m "feat(pos): F5.2 — estado del carrito (reducer) + cálculo de display

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `lib/cobro.ts` — orquestación de RPCs (commit del ticket)

Crea UN cliente con el token y reusa para toda la ráfaga. Idempotencia vía `client_id_local`. Devuelve totales autoritativos releídos de la fila `tickets` y, al final, el folio.

**Files:**
- Create: `apps/pos/app/lib/cobro.ts`

- [ ] **Step 1: Escribir el lib**

```typescript
"use client";
import { employeeClient } from "./supabase";
import type { LineaCarrito, ModoServicio } from "./carrito";

export type MetodoPago =
  | "EFECTIVO"
  | "TARJETA_CREDITO"
  | "TARJETA_DEBITO"
  | "TRANSFERENCIA"
  | "APP_OTRO";

export type PagoInput = {
  metodo: MetodoPago;
  monto: number;
  montoRecibido?: number; // solo efectivo
  referencia?: string;
};

export type TotalesTicket = {
  ticketId: string;
  subtotal: number;
  iva: number;
  total: number;
  montoPagado: number;
  cambio: number;
  pendiente: number;
  estadoFiscal: string;
  folio: string | null;
};

type CtxCobro = {
  token: string;
  sucursalId: string;
  cajaId: string;
  turnoId: string;
};

function modifsJsonb(linea: LineaCarrito): { opcion_modificador_id: string; cantidad: number }[] {
  return linea.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad }));
}

/** Persiste el ticket completo (abrir + items) y devuelve los totales autoritativos de la BD. */
export async function persistirTicket(
  ctx: CtxCobro,
  modoServicio: ModoServicio,
  lineas: LineaCarrito[],
  ticketClientId: string,
): Promise<TotalesTicket> {
  const sb = employeeClient(ctx.token);

  const { data: ticketId, error: e1 } = await sb.rpc("abrir_ticket", {
    p_sucursal_id: ctx.sucursalId,
    p_caja_id: ctx.cajaId,
    p_turno_id: ctx.turnoId,
    p_modo_servicio: modoServicio,
    p_client_id_local: ticketClientId,
  });
  if (e1) throw new Error(e1.message);
  const tid = ticketId as string;

  for (const l of lineas) {
    const { error } = await sb.rpc("agregar_item_a_ticket", {
      p_ticket_id: tid,
      p_producto_id: l.producto.id,
      p_cantidad: l.cantidad,
      p_nota_cocina: l.notaCocina,
      p_modificadores: modifsJsonb(l),
      p_client_id_local: l.clientId,
    });
    if (error) throw new Error(error.message);
  }

  return leerTotales(ctx.token, tid);
}

/** Relee los totales autoritativos de la fila tickets. */
export async function leerTotales(token: string, ticketId: string): Promise<TotalesTicket> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, subtotal_mxn, iva_mxn, total_mxn, monto_pagado_mxn, cambio_mxn, monto_pendiente_mxn, estado_fiscal, folio_completo")
    .eq("id", ticketId)
    .single();
  if (error) throw new Error(error.message);
  const t = data as {
    id: string; subtotal_mxn: string | number; iva_mxn: string | number; total_mxn: string | number;
    monto_pagado_mxn: string | number; cambio_mxn: string | number; monto_pendiente_mxn: string | number;
    estado_fiscal: string; folio_completo: string | null;
  };
  return {
    ticketId: t.id,
    subtotal: Number(t.subtotal_mxn),
    iva: Number(t.iva_mxn),
    total: Number(t.total_mxn),
    montoPagado: Number(t.monto_pagado_mxn),
    cambio: Number(t.cambio_mxn),
    pendiente: Number(t.monto_pendiente_mxn),
    estadoFiscal: t.estado_fiscal,
    folio: t.folio_completo,
  };
}

/** Aplica un pago contra el ticket. Devuelve los totales actualizados. */
export async function aplicarPago(
  token: string,
  ticketId: string,
  pago: PagoInput,
  pagoClientId: string,
): Promise<TotalesTicket> {
  const { error } = await employeeClient(token).rpc("aplicar_pago", {
    p_ticket_id: ticketId,
    p_metodo_pago: pago.metodo,
    p_monto_mxn: pago.monto,
    p_monto_recibido_mxn: pago.metodo === "EFECTIVO" ? (pago.montoRecibido ?? pago.monto) : null,
    p_referencia: pago.referencia ?? null,
    p_client_id_local: pagoClientId,
  });
  if (error) throw new Error(error.message);
  return leerTotales(token, ticketId);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/lib/cobro.ts
git commit -m "feat(pos): F5.2 — orquestación de cobro (abrir→items→pago) vía RPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `components/selector-modo-servicio.tsx`

**Files:**
- Create: `apps/pos/app/components/selector-modo-servicio.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";
import type { ModoServicio } from "../lib/carrito";

const MODOS: { valor: ModoServicio; etiqueta: string }[] = [
  { valor: "COMER_AQUI", etiqueta: "Comer aquí" },
  { valor: "PARA_LLEVAR", etiqueta: "Para llevar" },
  { valor: "DRIVE_THRU", etiqueta: "Drive-thru" },
];

export function SelectorModoServicio({
  valor,
  onCambiar,
}: {
  valor: ModoServicio;
  onCambiar: (m: ModoServicio) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-hover p-1" role="radiogroup" aria-label="Modo de servicio">
      {MODOS.map((m) => {
        const activo = valor === m.valor;
        return (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambiar(m.valor)}
            className={[
              "flex-1 rounded px-2 py-1.5 text-[12.5px] font-semibold transition-colors",
              activo ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {m.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

```bash
git add apps/pos/app/components/selector-modo-servicio.tsx
git commit -m "feat(pos): F5.2 — selector de modo de servicio

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `components/modal-modificadores.tsx`

Modal al tapear un producto con grupos. Valida requerido/min/max antes de confirmar. Devuelve `ModificadorSel[]` + nota.

**Files:**
- Create: `apps/pos/app/components/modal-modificadores.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";
import { useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";
import type { ModificadorSel } from "../lib/carrito";
import { seleccionInicialGrupo } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";

type SelPorGrupo = Record<string, Set<string>>; // grupoId -> set de opcionId

function initSel(grupos: GrupoModificadores[]): SelPorGrupo {
  const s: SelPorGrupo = {};
  for (const g of grupos) s[g.id] = new Set(seleccionInicialGrupo(g).map((o) => o.id));
  return s;
}

function grupoValido(g: GrupoModificadores, sel: Set<string>): boolean {
  const n = sel.size;
  switch (g.tipoSeleccion) {
    case "UNICA_OBLIGATORIA":
      return n === 1;
    case "UNICA_OPCIONAL":
      return n <= 1;
    case "MULTIPLE_OPCIONAL":
      return true;
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return n >= (g.min ?? 0) && n <= (g.max ?? Infinity);
  }
}

export function ModalModificadores({
  producto,
  grupos,
  onConfirmar,
  onCancelar,
}: {
  producto: Producto;
  grupos: GrupoModificadores[];
  onConfirmar: (mods: ModificadorSel[], nota: string | null) => void;
  onCancelar: () => void;
}) {
  const [sel, setSel] = useState<SelPorGrupo>(() => initSel(grupos));
  const [nota, setNota] = useState("");

  function toggle(g: GrupoModificadores, opcionId: string) {
    setSel((prev) => {
      const actual = new Set(prev[g.id]);
      const unica = g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "UNICA_OPCIONAL";
      if (actual.has(opcionId)) {
        if (g.tipoSeleccion === "UNICA_OBLIGATORIA") return prev; // no permitir vaciar
        actual.delete(opcionId);
      } else {
        if (unica) actual.clear();
        if (g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.max && actual.size >= g.max) return prev;
        actual.add(opcionId);
      }
      return { ...prev, [g.id]: actual };
    });
  }

  const todoValido = useMemo(() => grupos.every((g) => grupoValido(g, sel[g.id] ?? new Set())), [grupos, sel]);

  function confirmar() {
    const mods: ModificadorSel[] = [];
    for (const g of grupos) {
      for (const opcionId of sel[g.id] ?? []) {
        const o = g.opciones.find((x) => x.id === opcionId);
        if (o) mods.push({ opcionId: o.id, grupoNombre: g.nombre, opcionNombre: o.nombre, precioExtra: o.precioExtra, cantidad: 1 });
      }
    }
    onConfirmar(mods, nota.trim() || null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-surface shadow-xl">
        <div className="border-b border-line p-4">
          <div className="font-display text-[17px] font-semibold">{producto.nombre}</div>
          <div className="text-[13px] text-ink-3">{fmtMxn(producto.precio_base_mxn)} base</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {grupos.map((g) => (
            <div key={g.id} className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold">{g.nombre}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-3">
                  {g.tipoSeleccion === "UNICA_OBLIGATORIA" ? "Elige 1" :
                   g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" ? `Elige ${g.min ?? 0}–${g.max ?? "∞"}` :
                   "Opcional"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {g.opciones.map((o) => {
                  const checked = sel[g.id]?.has(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={o.agotada}
                      onClick={() => toggle(g, o.id)}
                      aria-pressed={checked}
                      className={[
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                        o.agotada ? "cursor-not-allowed border-line opacity-40" :
                        checked ? "border-ink bg-ink/5" : "border-line hover:border-ink",
                      ].join(" ")}
                    >
                      <span className="font-medium">{o.nombre}{o.agotada ? " (agotado)" : ""}</span>
                      <span className="tabular-nums text-ink-2">{o.precioExtra > 0 ? `+${fmtMxn(o.precioExtra)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <label className="mt-2 block">
            <span className="mb-1 block text-[13px] font-semibold">Nota de cocina</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="ej. sin cebolla"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </label>
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <Button variant="ghost" className="flex-1" onClick={onCancelar}>Cancelar</Button>
          <Button className="flex-1" disabled={!todoValido} onClick={confirmar}>Agregar</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores. Si `Button` no acepta `variant="ghost"`, revisar la API real en `packages/ui` y ajustar (ver `home-pos.tsx`/admin para la firma correcta).

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/components/modal-modificadores.tsx
git commit -m "feat(pos): F5.2 — modal de modificadores con validación min/max/requerido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `components/sidebar-ticket.tsx` — carrito en vivo

Reemplaza el placeholder de la columna derecha. Muestra líneas (con modificadores), cantidades editables, totales de display, modo de servicio y botón "Cobrar".

**Files:**
- Create: `apps/pos/app/components/sidebar-ticket.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";
import { Button } from "@vim/ui/styles";
import type { EstadoCarrito, LineaCarrito, ModoServicio } from "../lib/carrito";
import { calcularTotalesDisplay, precioUnitarioLinea, totalLinea } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";
import { SelectorModoServicio } from "./selector-modo-servicio";

export function SidebarTicket({
  estado,
  onCantidad,
  onQuitar,
  onModo,
  onCobrar,
  procesando,
}: {
  estado: EstadoCarrito;
  onCantidad: (clientId: string, cantidad: number) => void;
  onQuitar: (clientId: string) => void;
  onModo: (m: ModoServicio) => void;
  onCobrar: () => void;
  procesando: boolean;
}) {
  const totales = calcularTotalesDisplay(estado.lineas);
  const vacio = estado.lineas.length === 0;

  return (
    <aside className="flex w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">Ticket actual</div>
        <SelectorModoServicio valor={estado.modoServicio} onCambiar={onModo} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {vacio && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-ink-2">Carrito vacío</p>
            <p className="text-[12.5px] text-ink-3">Tapea un producto para empezar.</p>
          </div>
        )}
        {!vacio && (
          <ul className="divide-y divide-line">
            {estado.lineas.map((l: LineaCarrito) => (
              <li key={l.clientId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold leading-tight">{l.producto.nombre}</div>
                    {l.modificadores.length > 0 && (
                      <div className="mt-0.5 text-[12px] text-ink-3">
                        {l.modificadores.map((m) => m.opcionNombre).join(", ")}
                      </div>
                    )}
                    {l.notaCocina && <div className="mt-0.5 text-[12px] italic text-ink-3">“{l.notaCocina}”</div>}
                    <div className="mt-1 text-[12px] text-ink-3">{fmtMxn(precioUnitarioLinea(l))} c/u</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-[14px] font-bold tabular-nums">{fmtMxn(totalLinea(l))}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" aria-label="Menos" onClick={() => onCantidad(l.clientId, l.cantidad - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink">−</button>
                  <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.cantidad}</span>
                  <button type="button" aria-label="Más" onClick={() => onCantidad(l.clientId, l.cantidad + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink">+</button>
                  <button type="button" onClick={() => onQuitar(l.clientId)}
                    className="ml-auto text-[12px] font-medium text-danger hover:underline">Quitar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-4">
        <div className="mb-2 flex justify-between text-[13.5px] text-ink-2">
          <span>Subtotal</span><span className="tabular-nums">{fmtMxn(totales.subtotal)}</span>
        </div>
        <div className="mb-3 flex justify-between text-[13.5px] text-ink-3">
          <span>IVA (16%)</span><span className="tabular-nums">{fmtMxn(totales.iva)}</span>
        </div>
        <div className="mb-3 flex justify-between border-t border-line pt-3 font-display text-[18px] font-bold">
          <span>Total</span><span className="tabular-nums">{fmtMxn(totales.total)}</span>
        </div>
        <Button size="lg" className="w-full" disabled={vacio || procesando} onClick={onCobrar}>
          {procesando ? "Procesando…" : `Cobrar ${fmtMxn(totales.total)}`}
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

```bash
git add apps/pos/app/components/sidebar-ticket.tsx
git commit -m "feat(pos): F5.2 — sidebar de ticket en vivo (líneas + totales + cobrar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: `components/modal-cobro.tsx` — pago (métodos + dividido + cambio)

Recibe los **totales autoritativos de la BD** (ya persistido el ticket). Permite uno o varios pagos hasta saldar; efectivo calcula cambio; al quedar PAGADO muestra folio.

**Files:**
- Create: `apps/pos/app/components/modal-cobro.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { aplicarPago, type MetodoPago, type TotalesTicket } from "../lib/cobro";
import { nuevoClientId } from "../lib/carrito";

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TARJETA_DEBITO", etiqueta: "Débito" },
  { valor: "TARJETA_CREDITO", etiqueta: "Crédito" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "APP_OTRO", etiqueta: "App" },
];

export function ModalCobro({
  token,
  totalesIniciales,
  onPagado,
  onCerrar,
}: {
  token: string;
  totalesIniciales: TotalesTicket;
  onPagado: (folio: string | null, cambio: number) => void;
  onCerrar: () => void;
}) {
  const [totales, setTotales] = useState<TotalesTicket>(totalesIniciales);
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [monto, setMonto] = useState<string>(totalesIniciales.pendiente.toFixed(2));
  const [recibido, setRecibido] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function cobrar() {
    setError(null);
    const m = Number(monto);
    if (!(m > 0)) { setError("Monto inválido"); return; }
    setProcesando(true);
    try {
      const recib = metodo === "EFECTIVO" && recibido ? Number(recibido) : undefined;
      const t = await aplicarPago(token, totales.ticketId, { metodo, monto: m, montoRecibido: recib }, nuevoClientId());
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        onPagado(t.folio, t.cambio);
      } else {
        setMonto(t.pendiente.toFixed(2));
        setRecibido("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cobrar");
    } finally {
      setProcesando(false);
    }
  }

  const cambioPreview = metodo === "EFECTIVO" && recibido ? Math.max(0, Number(recibido) - Number(monto)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-display text-[18px] font-semibold">Cobrar</span>
          <span className="text-[13px] text-ink-3">Pendiente <strong className="tabular-nums text-ink">{fmtMxn(totales.pendiente)}</strong></span>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {METODOS.map((x) => (
            <button key={x.valor} type="button" onClick={() => setMetodo(x.valor)} aria-pressed={metodo === x.valor}
              className={["rounded-lg border px-2 py-2 text-[12.5px] font-semibold transition",
                metodo === x.valor ? "border-ink bg-ink/5" : "border-line hover:border-ink"].join(" ")}>
              {x.etiqueta}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[13px] font-semibold">Monto a aplicar</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm tabular-nums outline-none focus:border-ink" />
        </label>

        {metodo === "EFECTIVO" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] font-semibold">Recibido (efectivo)</span>
            <input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={monto}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm tabular-nums outline-none focus:border-ink" />
            {cambioPreview > 0 && <div className="mt-1 text-[13px] text-success">Cambio: <strong className="tabular-nums">{fmtMxn(cambioPreview)}</strong></div>}
          </label>
        )}

        {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
          <Button className="flex-1" onClick={cobrar} disabled={procesando}>
            {procesando ? "Aplicando…" : "Aplicar pago"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.

```bash
git add apps/pos/app/components/modal-cobro.tsx
git commit -m "feat(pos): F5.2 — modal de cobro (métodos, dividido, cambio)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Cablear `home-pos.tsx`

Conectar el reducer del carrito, el click de producto (con/ sin modificadores), el sidebar y el flujo de cobro (persistir → modal cobro → confirmación). Reemplaza el `<aside>` placeholder por `<SidebarTicket>`.

**Files:**
- Modify: `apps/pos/app/components/home-pos.tsx`

- [ ] **Step 1: Imports y estado**

Añadir a los imports del archivo:

```tsx
import { useReducer, useCallback } from "react";
import { reducerCarrito, estadoInicial, nuevoClientId, seleccionInicialGrupo, type LineaCarrito, type ModoServicio, type ModificadorSel } from "../lib/carrito";
import { obtenerGruposDeProducto, type GrupoModificadores } from "../lib/modificadores";
import { persistirTicket, type TotalesTicket } from "../lib/cobro";
import { SidebarTicket } from "./sidebar-ticket";
import { ModalModificadores } from "./modal-modificadores";
import { ModalCobro } from "./modal-cobro";
import { leerCaja } from "../lib/turno"; // si no se requiere sucursal_id ya disponible en `caja`
```

(El `caja: DatosCaja` ya trae `tenant_id` y `sucursal_id`; usar `caja.sucursal_id`.)

Dentro de `HomePos`, junto a los `useState` existentes:

```tsx
const [carrito, dispatch] = useReducer(reducerCarrito, estadoInicial);
const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
const [totalesCobro, setTotalesCobro] = useState<TotalesTicket | null>(null);
const [procesandoCobro, setProcesandoCobro] = useState(false);
const [confirmacion, setConfirmacion] = useState<{ folio: string | null; cambio: number } | null>(null);
```

- [ ] **Step 2: Handler de click en producto**

Añadir dentro de `HomePos`:

```tsx
const onTapProducto = useCallback(async (p: Producto) => {
  if (p.agotado) return;
  try {
    const grupos = await obtenerGruposDeProducto(token, p.id);
    if (grupos.length === 0) {
      dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: p, cantidad: 1, modificadores: [], notaCocina: null } });
    } else {
      setModGrupos({ producto: p, grupos });
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error al cargar modificadores");
  }
}, [token]);

const confirmarModificadores = useCallback((mods: ModificadorSel[], nota: string | null) => {
  if (!modGrupos) return;
  dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: modGrupos.producto, cantidad: 1, modificadores: mods, notaCocina: nota } });
  setModGrupos(null);
}, [modGrupos]);
```

- [ ] **Step 3: Handler de cobro (persistir → modal)**

```tsx
const iniciarCobro = useCallback(async () => {
  if (carrito.lineas.length === 0) return;
  setProcesandoCobro(true);
  setError(null);
  try {
    const totales = await persistirTicket(
      { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
      carrito.modoServicio,
      carrito.lineas,
      nuevoClientId(),
    );
    setTotalesCobro(totales);
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error al abrir el ticket");
  } finally {
    setProcesandoCobro(false);
  }
}, [carrito, token, caja.sucursal_id, turno.caja_id, turno.id]);
```

- [ ] **Step 4: Conectar el grid de productos al handler**

En el `<button>` del grid de productos, añadir `onClick={() => onTapProducto(p)}` (el botón ya tiene `disabled={p.agotado}`).

- [ ] **Step 5: Reemplazar el `<aside>` placeholder y montar modales**

Reemplazar TODO el bloque `{/* Sidebar ticket — placeholder ... */}<aside ...>...</aside>` por:

```tsx
<SidebarTicket
  estado={carrito}
  onCantidad={(id, c) => dispatch({ tipo: "cantidad", clientId: id, cantidad: c })}
  onQuitar={(id) => dispatch({ tipo: "quitar", clientId: id })}
  onModo={(m: ModoServicio) => dispatch({ tipo: "modo", modo: m })}
  onCobrar={iniciarCobro}
  procesando={procesandoCobro}
/>
```

Y antes del cierre del `</div>` raíz del componente, montar los modales:

```tsx
{modGrupos && (
  <ModalModificadores
    producto={modGrupos.producto}
    grupos={modGrupos.grupos}
    onConfirmar={confirmarModificadores}
    onCancelar={() => setModGrupos(null)}
  />
)}
{totalesCobro && (
  <ModalCobro
    token={token}
    totalesIniciales={totalesCobro}
    onPagado={(folio, cambio) => {
      setTotalesCobro(null);
      dispatch({ tipo: "limpiar" });
      setConfirmacion({ folio, cambio });
    }}
    onCerrar={() => setTotalesCobro(null)}
  />
)}
{confirmacion && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center shadow-xl">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">✓</div>
      <div className="font-display text-[18px] font-semibold">Venta cobrada</div>
      {confirmacion.folio && <div className="mt-1 text-[13px] text-ink-3">Folio {confirmacion.folio}</div>}
      {confirmacion.cambio > 0 && <div className="mt-1 text-[14px]">Cambio: <strong className="tabular-nums">{fmtMxn(confirmacion.cambio)}</strong></div>}
      <Button className="mt-4 w-full" onClick={() => setConfirmacion(null)}>Nuevo ticket</Button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter @vim/pos typecheck`
Expected: sin errores.
Run: `pnpm --filter @vim/pos build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add apps/pos/app/components/home-pos.tsx
git commit -m "feat(pos): F5.2 — cablear carrito, modificadores y cobro en el home POS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Verificación E2E en navegador + BD (gate de la fase)

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el entorno**

Run (en terminales separadas, según `../MEMORY.md §3`):
```
supabase start
supabase db reset
supabase functions serve pin-login --no-verify-jwt --env-file supabase/functions/.env
pnpm --filter @vim/pos dev
```
Expected: POS en `http://localhost:3000`.

- [ ] **Step 2: Ruta crítica con preview tools**

Con `preview_start` (o el navegador), recorrer: login dispositivo → empleado María PIN `1234` → abrir turno → tapear una hamburguesa → en el modal elegir término + Extra queso → Agregar → ajustar cantidad a 2 → cambiar modo a "Para llevar" → Cobrar → pago dividido (Débito la mitad, Efectivo el resto con recibido mayor) → confirmar PAGADO con folio y cambio.
Usar `preview_console_logs`/`preview_network` para confirmar 0 errores en las RPC.

- [ ] **Step 3: Verificar en BD que cuadra**

Run: `psql "<DB_URL>" -c "select folio_completo, estado_fiscal, subtotal_mxn, iva_mxn, total_mxn, monto_pagado_mxn, cambio_mxn from tickets order by created_at desc limit 1;"`
Expected: `estado_fiscal=PAGADO`, `total_mxn = monto_pagado_mxn`, folio asignado. Confirmar que el `total_mxn` coincide (±redondeo) con el total mostrado en el sidebar antes de cobrar.
Run: `psql "<DB_URL>" -c "select producto_nombre_snapshot, cantidad, total_item_mxn from ticket_items where ticket_id = (select id from tickets order by created_at desc limit 1); select grupo_nombre_snapshot, opcion_nombre_snapshot, monto_total_mxn from ticket_item_modificadores;"`
Expected: 1 línea con modificadores y su `monto_total_mxn` correcto (Extra queso $15).

- [ ] **Step 4: Screenshot de evidencia + cierre**

Tomar `preview_screenshot` de la confirmación de venta. Actualizar `../MEMORY.md` (Dónde estamos → F5.2 ✅, próximos pasos → F5.2b descuento+propina / F5.3 impresión) y anotar el bug #19 (columnas de `agregar_item`) en la bitácora del Playbook (doc 18 §4).

```bash
git add ../MEMORY.md
git commit -m "docs: F5.2 cerrada — venta persiste con RLS; bitácora bug #19

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (cobertura del spec)

- **Carrito local + display** → Task 5 (`carrito.ts`) + Task 9 (`sidebar-ticket`). ✔
- **Modificadores (req/min/max, naturaleza)** → Task 4 (`modificadores.ts`) + Task 8 (`modal-modificadores`). ✔
- **Nota de cocina por línea** → Task 8 (input) + Task 6 (`p_nota_cocina`). ✔
- **Modo de servicio** → Task 7 + Task 6 (`p_modo_servicio`). ✔
- **Cobro todos los métodos + dividido + cambio** → Task 10 + Task 6 (`aplicar_pago`, loop de pagos). ✔
- **Commit del ticket (enfoque C) + totales autoritativos** → Task 6 (`persistirTicket`/`leerTotales`). ✔
- **Idempotencia (`client_id_local`)** → Task 6 (uuids por entidad). ✔
- **Seed de modificadores** → Task 2. ✔
- **Gate E2E + verificación BD** → Task 3 (SQL) + Task 12 (navegador). ✔
- **Sin propina / sin descuento (diferidos a F5.2b)** → ausentes del plan a propósito. ✔
- **Dependencia RPC rota descubierta** → Task 1 (migración 0016). ✔

**Notas de riesgo para el ejecutor:**
- La API real de `Button` (`@vim/ui/styles`): variantes/props pueden diferir (`variant="ghost"`, `size="lg"`). Verificar contra `home-pos.tsx`/admin y ajustar; no inventar props.
- `employeeClient(token)` crea un cliente por llamada; en `persistirTicket` se crea uno y se reusa para la ráfaga (ya contemplado).
- Si el smoke test (Task 3) revela MÁS columnas fantasma en otras RPC de venta, corregirlas en migraciones aditivas antes de Fase B y anotarlas en bitácora.
- Tasa de IVA en display fija a 16%; si algún producto del seed tuviera otra tasa, el display divergiría levemente del total BD (aceptable; la BD manda).
