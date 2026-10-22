# Giro RETAIL · Entrega 3: el admin de existencias — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de una tienda vea cuánto le queda de cada prenda en cada sucursal y cuánto vale. Debe poder ajustar, registrar mermas, contar, recibir mercancía, mandar mercancía entre sucursales (y cancelar un envío en camino), revisar el historial y ver qué talla y color vende más y con qué margen, **sin que un restaurante note nada**.

**Architecture:**
- **Base de datos, dos migraciones.**
  - La 0192 solo agrega el estado `CANCELADO` al tipo de traspaso: un valor nuevo de un enum va solo en su archivo.
  - La 0193 trae:
    - un validador común de renglones (`_existencias_lineas`) que usan conteo, traspaso y recepción;
    - nuevas versiones de `registrar_conteo` y `enviar_traspaso_producto`, con los arreglos que la entrega 1 dejó pendientes;
    - `cancelar_traspaso_producto`, `fijar_minimo_producto` y `recibir_mercancia`;
    - la vista `vw_existencias`: cada producto con existencias × cada sucursal, con nombre, variante, códigos, costo y valor.
- **Admin, una sección nueva «Existencias».** Va en el menú justo después de Inventario y se ve solo con el módulo `existencias`.
  - Cinco pestañas: Existencias, Recibir, Conteo, Traspasos y Movimientos.
  - El reporte «Ventas por talla y color», con margen, entra al índice de Reportes.
  - Las pantallas reutilizan las piezas que ya existen: `ReporteMarco`, `useSucursalReporte`, `Columna`, el Excel, `Segmentos`, `Modal` y `AccionFila`.

**Tech Stack:** PostgreSQL 15 (Supabase) y smokes `.sql`; Next.js con React y Tailwind en `apps/admin`, probado con Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-giro-retail-design.md` §6.2, §6.3 y §13 (lo que se pasó a la entrega 3). ADR 0037.

## Global Constraints

- **Todo en local hasta el 100 % (Fermín, 15 oct).** Nada de push, PR, producción, `supabase db push` ni `functions deploy`. Las migraciones nuevas sí se aplican al Supabase **local** de Docker con `npx supabase migration up --local` (autorizado el 15 oct), en la Tarea 10.
- **Ningún restaurante cambia.** La sección, sus rutas, la entrada del menú y el reporte nuevo aparecen **solo** con el módulo `existencias` efectivo (`conExistencias(m)`). Sin él, el admin queda idéntico.
- **RLS sagrado.** Toda función `SECURITY DEFINER` se confina con `_existencias_puede_escribir()`, que exige negocio, permiso `config.productos` y módulo. La vista es `security_invoker`.
- **Dinero en `numeric(12,2)`; cantidades en `numeric(12,3)`. `'NaN'` nunca entra.** Ni más de 3 decimales en cantidades, ni más de 2 en costos: error `DATOS_INVALIDOS` claro.
- **La existencia es la suma de los movimientos** (ADR 0037). Nadie escribe `producto_existencias.cantidad` directo, salvo que `fijar_minimo_producto` puede crear la fila en 0.
- **Sin dependencias nuevas.** Diseño según `docs/diseno/admin.md`, `docs/diseno/nucleo.md` y `packages/ui/tokens.css`. Tamaños de letra solo de la escala (`pnpm tipografia`). Cargar `ponytail`, y `emil-design-eng` antes de escribir CSS o marcado.
- **Commits:** solo los archivos de la tarea, por nombre. Mensaje + línea en blanco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Antes de crear las migraciones, confirmar que 0192 y 0193 siguen libres.

## Decisiones de este plan

1. **Quién lo usa:** quien tenga `config.productos` (dueño o administrador), igual que en la entrega 1. Recibir mercancía **no** exige pertenecer a la sucursal destino. Un permiso propio para encargados se agrega cuando un cliente lo pida.
2. **Margen** = venta sin IVA (`subtotal_mxn` de `vw_ventas_por_producto`) − unidades × **costo actual** del producto (`productos.costo_mxn`). El costo histórico de cada venta no se guarda todavía. El reporte lo dice en una nota: «con el costo de hoy».
3. **Existencias valorizadas** = cantidad × costo actual, por sucursal. Va como cifra y columna en la pestaña Existencias, no como reporte aparte.
4. **Alertas:** no hay campanita. La pestaña Existencias muestra cifras de «bajo mínimo» y «en negativo» con su filtro. Avisos por correo, cuando un cliente los pida.
5. **Cancelar un traspaso en camino** regresa la mercancía al origen con un `TRASPASO_ENTRADA` y deja el traspaso `CANCELADO`. No se edita un traspaso: se cancela y se manda otro.
6. **Un traspaso o una cancelación sobre un producto que dejó de llevar existencias** falla con el mensaje de siempre. Es raro; queda anotado.
7. **La captura de renglones** (recibir, contar, traspasar) busca primero por código de barras o SKU exacto (el escáner es teclado + Enter) y luego por nombre. Un componente sirve para las tres pantallas.

## Review Focus

1. **Un restaurante** no ve «Existencias» en el menú ni el reporte nuevo. Si entra por enlace directo, lee «Esta sección es para tiendas.». Prueba en las Tareas 4 y 9.
2. **Conteo:** dos productos, uno sin fila de existencias todavía, contados al mismo tiempo que se vende uno de ellos. La diferencia se calcula contra la existencia bloqueada, y la fila se crea antes de bloquearla. Prueba en la Tarea 1.
3. **Renglones malos** en recepción, conteo y traspaso: el mismo producto dos veces aunque cambien las mayúsculas del uuid, 4 decimales, `NaN`, cantidad 0 donde no toca, producto de otro negocio. Error claro y nada a medias. Pruebas en las Tareas 1 y 2.
4. **Cancelar un traspaso:** la mercancía vuelve al origen una sola vez. No se cancela uno ya recibido o ya cancelado, ni se recibe uno cancelado. Prueba en la Tarea 1.
5. **Otra sucursal sin movimientos** sí aparece en la vista con existencia 0, para poder fijarle mínimo o contarla. La vista no enseña nada de otro negocio. Prueba en la Tarea 2.

## Archivos

| Archivo | Qué |
|---|---|
| Crear `supabase/migrations/0192_traspaso_cancelado.sql` | Solo el `ADD VALUE` |
| Crear `supabase/migrations/0193_existencias_admin.sql` | §1 renglones, conteo, traspaso y cancelación · §2 vista, mínimo y recepción |
| Crear `supabase/scripts/smoke_existencias_admin.sql` | Un bloque por sección |
| Crear `apps/admin/app/lib/existencias.ts` + `__tests__/existencias.test.ts` | Lectura, estados, búsqueda de captura y llamadas a la base |
| Modificar `apps/admin/app/components/admin-shell.tsx` y `apps/admin/app/lib/operacion.ts` | Entrada del menú y ruta del módulo |
| Crear `apps/admin/app/(panel)/existencias/layout.tsx` + `components/existencias-tabs.tsx` | Candado de sección y pestañas |
| Crear `apps/admin/app/(panel)/existencias/page.tsx` | Existencias |
| Crear `apps/admin/app/components/captura-productos.tsx` | Captura por escáner o búsqueda |
| Crear `apps/admin/app/(panel)/existencias/recibir/page.tsx` | Recibir mercancía |
| Crear `apps/admin/app/(panel)/existencias/conteo/page.tsx` | Conteo físico |
| Crear `apps/admin/app/(panel)/existencias/traspasos/page.tsx` | Traspasos |
| Crear `apps/admin/app/(panel)/existencias/movimientos/page.tsx` | Historial |
| Crear `apps/admin/app/(panel)/reportes/ventas-variantes/page.tsx`; modificar `lib/reportes.ts`, `(panel)/reportes/page.tsx` | Reporte |
| Modificar `docs/diseno/admin.md` | Sección Existencias |
| Regenerar `packages/db/src/database.types.ts` | Al final |

---

### Task 0: Rama

Ya creada encima de la entrega 2 (`git switch feat/retail-existencias`; `feat/retail-catalogo` debe ser ancestro de HEAD). `ls supabase/migrations | tail -2` termina en `0191`. Dependencias ya instaladas en el worktree.

---

### Task 1: 0192 + 0193 §1: renglones, conteo, traspaso y cancelación

**Files:**
- Create: `supabase/migrations/0192_traspaso_cancelado.sql`, `supabase/migrations/0193_existencias_admin.sql` (§1), `supabase/scripts/smoke_existencias_admin.sql`

**Interfaces:**
- Consumes (0189/0190): `_existencias_puede_escribir() RETURNS uuid`, `_existencias_validar(p_tenant uuid, p_sucursal uuid, p_producto uuid)`, `movimientos_producto`, `traspasos_producto`, `producto_existencias`.
- Produces:
  - `_existencias_lineas(p jsonb, p_campo text, p_cero_ok boolean) RETURNS jsonb`: arreglo `[{producto_id: uuid, cantidad: numeric, costo: numeric|null}]` ordenado por `producto_id`. Valida y quita duplicados por uuid.
  - `registrar_conteo(p_sucursal uuid, p_conteo jsonb) RETURNS jsonb`: misma firma y salida que en 0189.
  - `enviar_traspaso_producto(p_origen uuid, p_destino uuid, p_lineas jsonb) RETURNS uuid`: misma firma.
  - `cancelar_traspaso_producto(p_traspaso uuid) RETURNS void`.
  - Columnas `traspasos_producto.cancelado_por uuid` y `cancelado_at timestamptz`.

- [ ] **Step 1: El smoke que falla**

`supabase/scripts/smoke_existencias_admin.sql`:

```sql
-- Smoke del admin de existencias (spec 2026-10-15-giro-retail-design.md §6.2; migraciones 0192-0193).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_existencias_admin.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: módulo encendido, dos productos con existencias, segunda sucursal, otro negocio.
DO $$
DECLARE v_t uuid := '99999999-0000-0000-0000-0000000000aa';
BEGIN
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000c1', v_t, 'Accesorios');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras, controla_existencias) VALUES
    ('e3e30000-0000-0000-0000-0000000000a1', v_t, 'Gorra', 'e3e30000-0000-0000-0000-0000000000c1', 249, 90, 'GOR-1', '2000000000985', true),
    ('e3e30000-0000-0000-0000-0000000000a2', v_t, 'Cinturón', 'e3e30000-0000-0000-0000-0000000000c1', 399, 150, 'CIN-1', NULL, true);
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 5) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000b2', v_t, 'RN3', 'Tienda Norte');
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES ('e3e30000-0000-0000-0000-0000000000ee', 'tenant-0193', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000c2', 'e3e30000-0000-0000-0000-0000000000ee', 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES ('e3e30000-0000-0000-0000-0000000000e1', 'e3e30000-0000-0000-0000-0000000000ee', 'Ajena', 'e3e30000-0000-0000-0000-0000000000c2', 10, true);
  -- Existencia inicial de la gorra en la sucursal de la semilla: 10.
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo)
  VALUES (v_t, '99999999-0000-0000-0000-0000000000bb', 'e3e30000-0000-0000-0000-0000000000a1', 'ENTRADA', 10, 'smoke');
END $$;

-- 1) Renglones, conteo, traspaso y cancelación.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_norte uuid := 'e3e30000-0000-0000-0000-0000000000b2';
  v_gor   uuid := 'e3e30000-0000-0000-0000-0000000000a1';
  v_cin   uuid := 'e3e30000-0000-0000-0000-0000000000a2';
  v_r     jsonb; v_tr uuid; v_n int;
BEGIN
  IF NOT 'CANCELADO' = ANY(enum_range(NULL::traspaso_producto_estado)::text[]) THEN RAISE EXCEPTION '1a: falta CANCELADO'; END IF;

  -- 1b) El validador: duplicado aunque cambien mayúsculas, 4 decimales, NaN, cero, vacío, costo malo.
  BEGIN PERFORM _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1),
          jsonb_build_object('producto_id', upper(v_gor::text), 'cantidad', 2)), 'cantidad', false);
        RAISE EXCEPTION '1b: duplicado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: un producto viene dos veces%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1.0005)), 'cantidad', false);
        RAISE EXCEPTION '1b: decimales'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: la cantidad admite máximo 3 decimales%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":"NaN"}]', 'cantidad', false);
        RAISE EXCEPTION '1b: NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":0}]', 'cantidad', false);
        RAISE EXCEPTION '1b: cero'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[]', 'cantidad', true);
        RAISE EXCEPTION '1b: vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":1,"costo":1.005}]', 'cantidad', false);
        RAISE EXCEPTION '1b: costo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  v_r := _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_cin, 'cantidad', 0),
                                               jsonb_build_object('producto_id', v_gor, 'cantidad', 2.5)), 'cantidad', true);
  IF (v_r->0->>'producto_id')::uuid <> LEAST(v_gor, v_cin) OR jsonb_array_length(v_r) <> 2 THEN RAISE EXCEPTION '1b: orden por producto %', v_r; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  -- 1c) Conteo con un producto sin fila de existencias (cinturón): crea la fila y ajusta.
  v_r := registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'contado', 8),
                                                   jsonb_build_object('producto_id', v_cin, 'contado', 3)));
  IF (v_r->>'ajustados')::int <> 2 THEN RAISE EXCEPTION '1c: %', v_r; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_cin) <> 3 THEN RAISE EXCEPTION '1c: cinturón'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 8 THEN RAISE EXCEPTION '1c: gorra'; END IF;

  -- 1d) Traspaso 3 gorras a Norte, cancelarlo: vuelven al origen una vez; no se recibe ni se cancela otra vez.
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 3)));
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 5 THEN RAISE EXCEPTION '1d: salida'; END IF;
  PERFORM cancelar_traspaso_producto(v_tr);
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 8 THEN RAISE EXCEPTION '1d: regreso'; END IF;
  IF (SELECT estado::text FROM traspasos_producto WHERE id = v_tr) <> 'CANCELADO'
     OR (SELECT cancelado_at FROM traspasos_producto WHERE id = v_tr) IS NULL THEN RAISE EXCEPTION '1d: estado'; END IF;
  BEGIN PERFORM cancelar_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: cancelar dos veces'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM recibir_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: recibir cancelado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  -- Uno recibido no se cancela.
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1)));
  PERFORM recibir_traspaso_producto(v_tr);
  BEGIN PERFORM cancelar_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: cancelar recibido'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  -- 1e) Traspaso con un renglón de otro negocio: nada se guarda.
  SELECT count(*) INTO v_n FROM traspasos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(
          jsonb_build_object('producto_id', v_gor, 'cantidad', 1), jsonb_build_object('producto_id', 'e3e30000-0000-0000-0000-0000000000e1', 'cantidad', 1)));
        RAISE EXCEPTION '1e: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM traspasos_producto WHERE tenant_id = v_t) <> v_n THEN RAISE EXCEPTION '1e: dejó traspaso'; END IF;
  RAISE NOTICE '1 renglones, conteo y traspasos OK';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_admin.sql`
Esperado: `❌` con `1a: falta CANCELADO`.

- [ ] **Step 3: Las migraciones**

`supabase/migrations/0192_traspaso_cancelado.sql`:

```sql
-- Cancelar un traspaso en camino (spec 2026-10-15-giro-retail-design.md §6.2, entrega 3).
-- SOLO el ADD VALUE: un valor nuevo no se usa en la misma transacción en que se agrega, y la caja
-- aplica cada archivo como una sola consulta. Se usa desde la 0193.
ALTER TYPE traspaso_producto_estado ADD VALUE IF NOT EXISTS 'CANCELADO';
```

`supabase/migrations/0193_existencias_admin.sql`:

```sql
-- El admin de existencias (spec 2026-10-15-giro-retail-design.md §6.2, §6.3 y §13; ADR 0037).
-- §1 renglones, conteo, traspaso y cancelación · §2 vista, mínimo y recepción.

-- ── §1 Renglones, conteo, traspaso y cancelación ────────────────────────────
-- Un solo validador para los renglones que mandan recepción, conteo y traspaso. Antes cada
-- función repetía su versión: comparaba el uuid como texto (el mismo producto en mayúsculas
-- pasaba dos veces) y un 0.0004 se redondeaba a cero y salía como error crudo del CHECK.
CREATE OR REPLACE FUNCTION _existencias_lineas(p jsonb, p_campo text, p_cero_ok boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_e      jsonb;
  v_prod   uuid;
  v_q      numeric;
  v_c      numeric;
  v_vistos uuid[] := '{}';
  v_out    jsonb := '[]'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la lista viene vacía' USING ERRCODE = '22023';
  END IF;
  FOR v_e IN SELECT value FROM jsonb_array_elements(p) LOOP
    BEGIN
      v_prod := (v_e->>'producto_id')::uuid;
      v_q    := (v_e->>p_campo)::numeric;
      v_c    := NULLIF(v_e->>'costo', '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: renglón mal formado: %', v_e USING ERRCODE = '22023';
    END;
    IF v_prod IS NULL OR v_q IS NULL OR v_q = 'NaN' OR v_q < 0 OR (v_q = 0 AND NOT p_cero_ok) OR v_q >= 1e9 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: cantidad inválida en %', v_e USING ERRCODE = '22023';
    END IF;
    IF v_q <> round(v_q, 3) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: la cantidad admite máximo 3 decimales' USING ERRCODE = '22023';
    END IF;
    IF v_c IS NOT NULL AND (v_c = 'NaN' OR v_c < 0 OR v_c >= 1e10 OR v_c <> round(v_c, 2)) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: costo inválido en %', v_e USING ERRCODE = '22023';
    END IF;
    IF v_prod = ANY(v_vistos) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un producto viene dos veces' USING ERRCODE = '22023';
    END IF;
    v_vistos := v_vistos || v_prod;
    v_out := v_out || jsonb_build_object('producto_id', v_prod, 'cantidad', v_q, 'costo', v_c);
  END LOOP;
  -- Ordenado por producto: dos conteos simultáneos bloquean sus filas en el mismo orden.
  RETURN (SELECT jsonb_agg(e ORDER BY (e->>'producto_id')::uuid) FROM jsonb_array_elements(v_out) e);
END;
$$;
REVOKE ALL ON FUNCTION _existencias_lineas(jsonb, text, boolean) FROM PUBLIC, anon, authenticated;

-- Conteo físico. Cambios contra la 0189: usa el validador común, crea la fila de existencia antes
-- de bloquearla (sin fila, FOR UPDATE no bloqueaba nada y una venta simultánea se perdía en la
-- diferencia) y recorre los productos en orden.
CREATE OR REPLACE FUNCTION registrar_conteo(p_sucursal uuid, p_conteo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t       uuid := _existencias_puede_escribir();
  v_lineas  jsonb := _existencias_lineas(p_conteo, 'contado', true);
  v_l       jsonb;
  v_prod    uuid;
  v_contado numeric;
  v_sistema numeric;
  v_n       int := 0;
  v_dif     jsonb := '[]'::jsonb;
BEGIN
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_sucursal, (v_l->>'producto_id')::uuid);
  END LOOP;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    v_prod    := (v_l->>'producto_id')::uuid;
    v_contado := (v_l->>'cantidad')::numeric;
    INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id)
    VALUES (v_t, p_sucursal, v_prod) ON CONFLICT (sucursal_id, producto_id) DO NOTHING;
    SELECT cantidad INTO v_sistema FROM producto_existencias
     WHERE sucursal_id = p_sucursal AND producto_id = v_prod FOR UPDATE;
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

-- Traspaso. Cambios contra la 0189: validador común, todo validado antes de escribir nada.
CREATE OR REPLACE FUNCTION enviar_traspaso_producto(p_origen uuid, p_destino uuid, p_lineas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_lineas jsonb;
  v_l      jsonb;
  v_id     uuid;
BEGIN
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen = p_destino THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el traspaso necesita dos sucursales distintas' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_destino AND tenant_id = v_t AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal destino no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  v_lineas := _existencias_lineas(p_lineas, 'cantidad', false);
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_origen, (v_l->>'producto_id')::uuid);
  END LOOP;

  INSERT INTO traspasos_producto (tenant_id, origen_sucursal_id, destino_sucursal_id, lineas, enviado_por)
  VALUES (v_t, p_origen, p_destino, (SELECT jsonb_agg(e - 'costo') FROM jsonb_array_elements(v_lineas) e), auth.uid())
  RETURNING id INTO v_id;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, p_origen, (v_l->>'producto_id')::uuid, 'TRASPASO_SALIDA', -(v_l->>'cantidad')::numeric, v_id, 'Traspaso enviado', auth.uid());
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) TO authenticated, service_role;

ALTER TABLE traspasos_producto
  ADD COLUMN IF NOT EXISTS cancelado_por uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelado_at  timestamptz NULL;

-- Un traspaso en camino se cancela: la mercancía vuelve al origen (TRASPASO_ENTRADA) una sola
-- vez. Uno recibido o ya cancelado no.
CREATE OR REPLACE FUNCTION cancelar_traspaso_producto(p_traspaso uuid)
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
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cancela un traspaso que va en camino' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_tr.lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, v_tr.origen_sucursal_id, (v_l->>'producto_id')::uuid, 'TRASPASO_ENTRADA',
            (v_l->>'cantidad')::numeric, p_traspaso, 'Traspaso cancelado', auth.uid());
  END LOOP;
  UPDATE traspasos_producto SET estado = 'CANCELADO', cancelado_por = auth.uid(), cancelado_at = now() WHERE id = p_traspaso;
END;
$$;
REVOKE ALL ON FUNCTION cancelar_traspaso_producto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_traspaso_producto(uuid) TO authenticated, service_role;
```

Antes de dar por buena la §1, abre en la 0189 los cuerpos vigentes de `registrar_conteo`, `enviar_traspaso_producto` y `recibir_traspaso_producto`, porque la 0189 recibió arreglos durante la entrega 1 (`NaN`, mensajes). Confirma que las versiones de arriba no pierden ninguna validación que la 0189 tenga y estas no. `recibir_traspaso_producto` no se toca: ya rechaza todo estado distinto de `ENVIADO`, incluido `CANCELADO`.

- [ ] **Step 4: Correrlo y verlo pasar, con los de la entrega 1**

Run: `cd desktop && npm run smokes -- smoke_existencias_admin.sql smoke_existencias_producto.sql smoke_eliminar_tenant.sql`
Esperado: `✅ 3/3`. Si `smoke_existencias_producto.sql` falla en 6f o 7d porque un mensaje cambió (p. ej. «un producto viene dos veces»), ajusta **ese** mensaje esperado al nuevo y anótalo.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0192_traspaso_cancelado.sql supabase/migrations/0193_existencias_admin.sql supabase/scripts/smoke_existencias_admin.sql
git commit -m "feat(retail): validador de renglones, conteo y traspasos endurecidos y cancelar traspaso (0192, 0193 §1)"
```

---

### Task 2: 0193 §2: vista, mínimo y recepción

**Files:**
- Modify: `supabase/migrations/0193_existencias_admin.sql` (§2 al final), `supabase/scripts/smoke_existencias_admin.sql` (bloque 2)

**Interfaces:**
- Consumes: `_existencias_lineas`, `_existencias_validar`, `_existencias_puede_escribir`.
- Produces:
  - Vista `vw_existencias` con las columnas `tenant_id, sucursal_id, sucursal_nombre, producto_id, producto_nombre` (padre o suelto), `nombre_completo, variante_valores, variante_ejes, codigo_interno, codigo_barras, costo_mxn, precio_base_mxn, cantidad, minimo, actualizado_at, valor_mxn`. Una fila por producto con existencias × sucursal viva.
  - `fijar_minimo_producto(p_sucursal uuid, p_producto uuid, p_minimo numeric) RETURNS void` (`NULL` quita el mínimo).
  - `recibir_mercancia(p_sucursal uuid, p_proveedor uuid, p_lineas jsonb, p_referencia text) RETURNS int`, que devuelve los renglones recibidos. `p_lineas = [{producto_id, cantidad, costo?}]`.

- [ ] **Step 1: El bloque 2 del smoke (antes de `ROLLBACK;`)**

```sql
-- 2) Vista, mínimo y recepción.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_norte uuid := 'e3e30000-0000-0000-0000-0000000000b2';
  v_gor   uuid := 'e3e30000-0000-0000-0000-0000000000a1';
  v_cin   uuid := 'e3e30000-0000-0000-0000-0000000000a2';
  v_antes numeric; v_n int; v_prov uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  -- 2a) Norte sin movimientos del cinturón aparece con 0; el valor es cantidad × costo.
  IF (SELECT cantidad FROM vw_existencias WHERE sucursal_id = v_norte AND producto_id = v_cin) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '2a: Norte debía tener el cinturón en 0'; END IF;
  IF (SELECT valor_mxn FROM vw_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor)
     <> (SELECT cantidad * 90 FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) THEN
    RAISE EXCEPTION '2a: valor'; END IF;

  -- 2b) Mínimo: crea la fila si no había, no toca la cantidad; NULL lo quita; malo se rechaza.
  PERFORM fijar_minimo_producto(v_norte, v_cin, 2);
  IF (SELECT minimo FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_cin) <> 2
     OR (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_cin) <> 0 THEN RAISE EXCEPTION '2b'; END IF;
  PERFORM fijar_minimo_producto(v_norte, v_cin, NULL);
  IF (SELECT minimo FROM producto_existencias WHERE sucursal_id = v_norte AND producto_id = v_cin) IS NOT NULL THEN RAISE EXCEPTION '2b: quitar'; END IF;
  BEGIN PERFORM fijar_minimo_producto(v_norte, v_cin, 1.0005);
        RAISE EXCEPTION '2b: decimales'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  -- 2c) Recepción: dos renglones con costo y proveedor; sube existencia, actualiza costo, guarda la referencia.
  INSERT INTO proveedores (tenant_id, nombre) VALUES (v_t, 'Textiles León') RETURNING id INTO v_prov;
  SELECT cantidad INTO v_antes FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor;
  IF recibir_mercancia(v_suc, v_prov, jsonb_build_array(
       jsonb_build_object('producto_id', v_gor, 'cantidad', 12, 'costo', 95),
       jsonb_build_object('producto_id', v_cin, 'cantidad', 4)), 'Remisión 881') <> 2 THEN RAISE EXCEPTION '2c: renglones'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> v_antes + 12 THEN RAISE EXCEPTION '2c: existencia'; END IF;
  IF (SELECT costo_mxn FROM productos WHERE id = v_gor) <> 95 OR (SELECT costo_mxn FROM productos WHERE id = v_cin) <> 150 THEN RAISE EXCEPTION '2c: costo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM movimientos_producto WHERE producto_id = v_gor AND tipo = 'ENTRADA' AND proveedor_id = v_prov AND motivo LIKE '%Remisión 881%') THEN
    RAISE EXCEPTION '2c: referencia y proveedor'; END IF;

  -- 2d) Recepción con un renglón malo o con proveedor de otro negocio: nada entra.
  INSERT INTO proveedores (tenant_id, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000ee', 'Proveedor ajeno');
  SELECT count(*) INTO v_n FROM movimientos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM recibir_mercancia(v_suc, NULL, jsonb_build_array(
          jsonb_build_object('producto_id', v_gor, 'cantidad', 1), jsonb_build_object('producto_id', v_cin, 'cantidad', 'NaN')), NULL);
        RAISE EXCEPTION '2d: NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM recibir_mercancia(v_suc, (SELECT id FROM proveedores WHERE tenant_id = 'e3e30000-0000-0000-0000-0000000000ee'),
          jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1)), NULL);
        RAISE EXCEPTION '2d: proveedor ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM movimientos_producto WHERE tenant_id = v_t) <> v_n THEN RAISE EXCEPTION '2d: entró algo'; END IF;

  -- 2e) La cajera no puede recibir.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', v_t)::text, true);
  BEGIN PERFORM recibir_mercancia(v_suc, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1)), NULL);
        RAISE EXCEPTION '2e: cajera'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF; END;

  -- 2f) Como la cajera con RLS: la vista no enseña el producto del otro negocio.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  IF EXISTS (SELECT 1 FROM vw_existencias WHERE producto_id = 'e3e30000-0000-0000-0000-0000000000e1') THEN RAISE EXCEPTION '2f: ajeno visible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM vw_existencias WHERE producto_id = v_gor) THEN RAISE EXCEPTION '2f: lo propio no se ve'; END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE '2 vista, mínimo y recepción OK';
END $$;
```

Si `proveedores` exige más columnas que `tenant_id` y `nombre`, agrégalas mínimamente (mira `supabase/scripts/smoke_compras.sql`) y anótalo.

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_existencias_admin.sql`
Esperado: `❌` con `relation "vw_existencias" does not exist`.

- [ ] **Step 3: La §2**

```sql
-- ── §2 Vista, mínimo y recepción ─────────────────────────────────────────────
-- Cada producto con existencias × cada sucursal viva, aunque nunca se haya movido ahí (para poder
-- fijarle mínimo o contarlo). security_invoker: manda la RLS de productos, sucursales y existencias.
CREATE OR REPLACE VIEW vw_existencias WITH (security_invoker = true) AS
SELECT
  p.tenant_id,
  s.id                                   AS sucursal_id,
  s.nombre                               AS sucursal_nombre,
  p.id                                   AS producto_id,
  COALESCE(pa.nombre, p.nombre)          AS producto_nombre,
  p.nombre                               AS nombre_completo,
  p.variante_valores,
  pa.variante_ejes,
  p.codigo_interno,
  p.codigo_barras,
  p.costo_mxn,
  p.precio_base_mxn,
  COALESCE(e.cantidad, 0)                AS cantidad,
  e.minimo,
  e.actualizado_at,
  round(COALESCE(e.cantidad, 0) * COALESCE(p.costo_mxn, 0), 2) AS valor_mxn
FROM productos p
JOIN sucursales s ON s.tenant_id = p.tenant_id AND s.deleted_at IS NULL
LEFT JOIN producto_existencias e ON e.producto_id = p.id AND e.sucursal_id = s.id
LEFT JOIN productos pa ON pa.id = p.producto_padre_id
WHERE p.controla_existencias AND p.deleted_at IS NULL;
REVOKE ALL ON vw_existencias FROM PUBLIC, anon;
GRANT SELECT ON vw_existencias TO authenticated, service_role;
COMMENT ON VIEW vw_existencias IS 'Existencia y valor de cada producto con existencias en cada sucursal viva (0193).';

-- El mínimo es lo único de producto_existencias que se escribe a mano. Si la fila no existe se
-- crea en 0 (la suma de movimientos también es 0): la existencia sigue siendo la suma.
CREATE OR REPLACE FUNCTION fijar_minimo_producto(p_sucursal uuid, p_producto uuid, p_minimo numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_t uuid := _existencias_puede_escribir();
BEGIN
  PERFORM _existencias_validar(v_t, p_sucursal, p_producto);
  IF p_minimo IS NOT NULL AND (p_minimo = 'NaN' OR p_minimo < 0 OR p_minimo >= 1e9 OR p_minimo <> round(p_minimo, 3)) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: mínimo inválido (0 o más, máximo 3 decimales)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id, minimo)
  VALUES (v_t, p_sucursal, p_producto, p_minimo)
  ON CONFLICT (sucursal_id, producto_id) DO UPDATE SET minimo = EXCLUDED.minimo, actualizado_at = now();
END;
$$;
REVOKE ALL ON FUNCTION fijar_minimo_producto(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fijar_minimo_producto(uuid, uuid, numeric) TO authenticated, service_role;

-- Recibir mercancía de un proveedor: varios renglones, todo o nada. El costo de cada renglón,
-- si viene, pasa a ser el costo del producto. La referencia (remisión, factura) va en el motivo.
CREATE OR REPLACE FUNCTION recibir_mercancia(p_sucursal uuid, p_proveedor uuid, p_lineas jsonb, p_referencia text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_lineas jsonb := _existencias_lineas(p_lineas, 'cantidad', false);
  v_l      jsonb;
  v_prod   uuid;
  v_costo  numeric;
  v_motivo text := 'Recepción' || COALESCE(' · ' || NULLIF(left(btrim(p_referencia), 100), ''), ' de mercancía');
BEGIN
  IF p_proveedor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores WHERE id = p_proveedor AND tenant_id = v_t AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el proveedor no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_sucursal, (v_l->>'producto_id')::uuid);
  END LOOP;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    v_prod  := (v_l->>'producto_id')::uuid;
    v_costo := NULLIF(v_l->>'costo', '')::numeric;
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, proveedor_id, motivo, usuario_id)
    VALUES (v_t, p_sucursal, v_prod, 'ENTRADA', (v_l->>'cantidad')::numeric, v_costo, p_proveedor, v_motivo, auth.uid());
    IF v_costo IS NOT NULL THEN
      UPDATE productos SET costo_mxn = v_costo, updated_at = now() WHERE id = v_prod;
    END IF;
  END LOOP;
  RETURN jsonb_array_length(v_lineas);
END;
$$;
REVOKE ALL ON FUNCTION recibir_mercancia(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recibir_mercancia(uuid, uuid, jsonb, text) TO authenticated, service_role;
```

Revisa que `proveedores` tenga `deleted_at` (0099). Si no, quita esa condición. Revisa también que el motivo de 2c coincida: `'Recepción · Remisión 881'` contiene «Remisión 881».

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_existencias_admin.sql smoke_existencias_producto.sql smoke_catalogo_tienda.sql smoke_eliminar_tenant.sql`
Esperado: `✅ 4/4`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0193_existencias_admin.sql supabase/scripts/smoke_existencias_admin.sql
git commit -m "feat(retail): vista de existencias, minimo por sucursal y recibir mercancia (0193 §2)"
```

---

### Task 3: `lib/existencias.ts`

**Files:**
- Create: `apps/admin/app/lib/existencias.ts`, `apps/admin/app/lib/__tests__/existencias.test.ts`

**Interfaces:**
- Produces:
  - `type FilaExistencia = { sucursal_id: string; sucursal_nombre: string; producto_id: string; producto_nombre: string; variante: string; nombre_completo: string; codigo_interno: string | null; codigo_barras: string | null; costo_mxn: number | null; precio_mxn: number; cantidad: number; minimo: number | null; valor_mxn: number }`
  - `varianteDe(ejes: string[] | null, valores: Record<string,string> | null): string`, p. ej. `"M · Negra"`, o `""` si no hay variante.
  - `type EstadoExistencia = "negativa" | "agotada" | "bajo" | "ok"` y `estadoExistencia(cantidad: number, minimo: number | null): EstadoExistencia`. Negativa si es < 0; agotada si es 0; bajo si hay mínimo y la cantidad es ≤ mínimo; ok en otro caso.
  - `resumenExistencias(filas): { piezas: number; valor_mxn: number; bajo: number; negativas: number }`. «bajo» cuenta las de estado `bajo` o `agotada` que tienen mínimo.
  - `type Capturable = { id: string; nombre: string; codigo_interno: string | null; codigo_barras: string | null }` y `buscarCapturable(lista, texto): { exacto: Capturable | null; coincidencias: Capturable[] }`: primero código de barras o SKU exacto (sin importar mayúsculas ni espacios); si no hay, por nombre que contiene el texto, hasta 8.
  - Llamadas a la base:
    - `listarExistencias(sucursalId: string | null)`, con `leerTodas` sobre `vw_existencias` (orden `producto_nombre, nombre_completo, sucursal_id, producto_id`);
    - `fijarMinimo(sucursal, producto, minimo: number | null)`;
    - `registrarMovimientoProducto(sucursal, producto, tipo: "ENTRADA" | "MERMA" | "AJUSTE", cantidad, costo?, motivo?)`;
    - `recibirMercancia(sucursal, proveedor | null, lineas: { producto_id; cantidad; costo?: number | null }[], referencia)`;
    - `registrarConteo(sucursal, lineas: { producto_id; contado }[])`;
    - `enviarTraspaso(origen, destino, lineas: { producto_id; cantidad }[])`;
    - `recibirTraspaso(id)` y `cancelarTraspaso(id)`;
    - `listarTraspasos()`, que lee `traspasos_producto` con `leerTodas`, ordenados por `enviado_at desc, id`;
    - `listarMovimientosProducto(desde, hasta, sucursalId | null)`, que lee `movimientos_producto` con el nombre del producto (embebido `producto:productos(nombre)`) por `creado_at` en el rango de días de México, con `leerTodas`.

- [ ] **Step 1: Las pruebas que fallan** (solo lo puro, como `reportes-inventario.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { buscarCapturable, estadoExistencia, resumenExistencias, varianteDe, type FilaExistencia } from "../existencias";

const fila = (c: number, m: number | null, v = 0): FilaExistencia => ({
  sucursal_id: "s", sucursal_nombre: "S", producto_id: Math.random().toString(), producto_nombre: "P", variante: "",
  nombre_completo: "P", codigo_interno: null, codigo_barras: null, costo_mxn: 10, precio_mxn: 20, cantidad: c, minimo: m, valor_mxn: v,
});

describe("existencias", () => {
  it("variante en orden de ejes", () => {
    expect(varianteDe(["Talla", "Color"], { Color: "Negra", Talla: "M" })).toBe("M · Negra");
    expect(varianteDe(null, null)).toBe("");
  });
  it("estado", () => {
    expect(estadoExistencia(-1, null)).toBe("negativa");
    expect(estadoExistencia(0, null)).toBe("agotada");
    expect(estadoExistencia(2, 2)).toBe("bajo");
    expect(estadoExistencia(3, 2)).toBe("ok");
    expect(estadoExistencia(3, null)).toBe("ok");
  });
  it("resumen", () => {
    expect(resumenExistencias([fila(5, 2, 50), fila(1, 2, 10), fila(-2, null, 0), fila(0, 1, 0)]))
      .toEqual({ piezas: 4, valor_mxn: 60, bajo: 2, negativas: 1 });
  });
  it("captura: código exacto primero, luego nombre", () => {
    const lista = [
      { id: "1", nombre: "Gorra roja", codigo_interno: "GOR-1", codigo_barras: "2000000000985" },
      { id: "2", nombre: "Gorra azul", codigo_interno: "GOR-2", codigo_barras: null },
    ];
    expect(buscarCapturable(lista, " 2000000000985 ").exacto?.id).toBe("1");
    expect(buscarCapturable(lista, "gor-2").exacto?.id).toBe("2");
    const r = buscarCapturable(lista, "gorra");
    expect(r.exacto).toBeNull();
    expect(r.coincidencias.map((c) => c.id)).toEqual(["1", "2"]);
    expect(buscarCapturable(lista, "").coincidencias).toEqual([]);
  });
});
```

(`piezas` es la suma **con signo**, lo que hay de verdad: 5 + 1 − 2 + 0 = 4. `bajo` cuenta la de 1 con mínimo 2 y la agotada con mínimo 1: 2.)

- [ ] **Step 2: Verlas fallar**

Run: `pnpm --filter @vim/admin test -- existencias`
Esperado: no encuentra el módulo.

- [ ] **Step 3: El código**

`apps/admin/app/lib/existencias.ts`:

```ts
"use client";
import { supabase } from "./supabase";
import { leerTodas } from "./reportes";

export type FilaExistencia = {
  sucursal_id: string; sucursal_nombre: string; producto_id: string; producto_nombre: string; variante: string;
  nombre_completo: string; codigo_interno: string | null; codigo_barras: string | null; costo_mxn: number | null;
  precio_mxn: number; cantidad: number; minimo: number | null; valor_mxn: number;
};

export const varianteDe = (ejes: string[] | null, valores: Record<string, string> | null): string =>
  ejes && valores ? ejes.map((e) => valores[e]).filter(Boolean).join(" · ") : "";

export type EstadoExistencia = "negativa" | "agotada" | "bajo" | "ok";
export function estadoExistencia(cantidad: number, minimo: number | null): EstadoExistencia {
  if (cantidad < 0) return "negativa";
  if (cantidad === 0) return "agotada";
  if (minimo !== null && cantidad <= minimo) return "bajo";
  return "ok";
}

/** Piezas = la suma con signo (lo que hay de verdad); bajo = con mínimo y en o bajo él (agotadas incluidas). */
export function resumenExistencias(filas: FilaExistencia[]) {
  let piezas = 0, valor = 0, bajo = 0, negativas = 0;
  for (const f of filas) {
    piezas += f.cantidad;
    valor += f.valor_mxn;
    const e = estadoExistencia(f.cantidad, f.minimo);
    if (e === "negativa") negativas++;
    else if (f.minimo !== null && (e === "bajo" || e === "agotada")) bajo++;
  }
  return { piezas, valor_mxn: Math.round(valor * 100) / 100, bajo, negativas };
}

export type Capturable = { id: string; nombre: string; codigo_interno: string | null; codigo_barras: string | null };
/** El escáner escribe el código y Enter: primero el código exacto; si no, el nombre. */
export function buscarCapturable(lista: Capturable[], texto: string): { exacto: Capturable | null; coincidencias: Capturable[] } {
  const t = texto.trim().toLowerCase();
  if (!t) return { exacto: null, coincidencias: [] };
  const exacto = lista.find((p) => p.codigo_barras?.toLowerCase() === t || p.codigo_interno?.toLowerCase() === t) ?? null;
  return { exacto, coincidencias: exacto ? [] : lista.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 8) };
}

const n = (v: unknown) => Number(v ?? 0);

export async function listarExistencias(sucursalId: string | null): Promise<FilaExistencia[]> {
  const filas = await leerTodas((desde, hasta) => {
    let q = supabase.from("vw_existencias")
      .select("sucursal_id, sucursal_nombre, producto_id, producto_nombre, nombre_completo, variante_valores, variante_ejes, codigo_interno, codigo_barras, costo_mxn, precio_base_mxn, cantidad, minimo, valor_mxn")
      .order("producto_nombre").order("nombre_completo").order("sucursal_id").order("producto_id");
    if (sucursalId) q = q.eq("sucursal_id", sucursalId);
    return q.range(desde, hasta);
  });
  return filas.map((r) => ({
    sucursal_id: String(r.sucursal_id), sucursal_nombre: String(r.sucursal_nombre ?? ""), producto_id: String(r.producto_id),
    producto_nombre: String(r.producto_nombre ?? ""),
    variante: varianteDe(r.variante_ejes as string[] | null, r.variante_valores as Record<string, string> | null),
    nombre_completo: String(r.nombre_completo ?? ""), codigo_interno: (r.codigo_interno as string | null) ?? null,
    codigo_barras: (r.codigo_barras as string | null) ?? null, costo_mxn: r.costo_mxn == null ? null : n(r.costo_mxn),
    precio_mxn: n(r.precio_base_mxn), cantidad: n(r.cantidad), minimo: r.minimo == null ? null : n(r.minimo), valor_mxn: n(r.valor_mxn),
  }));
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fijarMinimo = (sucursal: string, producto: string, minimo: number | null) =>
  rpc<void>("fijar_minimo_producto", { p_sucursal: sucursal, p_producto: producto, p_minimo: minimo });
export const registrarMovimientoProducto = (sucursal: string, producto: string, tipo: "ENTRADA" | "MERMA" | "AJUSTE", cantidad: number, costo: number | null = null, motivo: string | null = null) =>
  rpc<string>("registrar_movimiento_producto", { p_sucursal: sucursal, p_producto: producto, p_tipo: tipo, p_cantidad: cantidad, p_costo_unitario: costo, p_motivo: motivo });
export const recibirMercancia = (sucursal: string, proveedor: string | null, lineas: { producto_id: string; cantidad: number; costo?: number | null }[], referencia: string) =>
  rpc<number>("recibir_mercancia", { p_sucursal: sucursal, p_proveedor: proveedor, p_lineas: lineas, p_referencia: referencia });
export const registrarConteo = (sucursal: string, lineas: { producto_id: string; contado: number }[]) =>
  rpc<{ ajustados: number; diferencias: { producto_id: string; sistema: number; contado: number; diferencia: number }[] }>("registrar_conteo", { p_sucursal: sucursal, p_conteo: lineas });
export const enviarTraspaso = (origen: string, destino: string, lineas: { producto_id: string; cantidad: number }[]) =>
  rpc<string>("enviar_traspaso_producto", { p_origen: origen, p_destino: destino, p_lineas: lineas });
export const recibirTraspaso = (id: string) => rpc<void>("recibir_traspaso_producto", { p_traspaso: id });
export const cancelarTraspaso = (id: string) => rpc<void>("cancelar_traspaso_producto", { p_traspaso: id });

export type Traspaso = {
  id: string; origen_sucursal_id: string; destino_sucursal_id: string; estado: "ENVIADO" | "RECIBIDO" | "CANCELADO";
  lineas: { producto_id: string; cantidad: number }[]; enviado_at: string; recibido_at: string | null; cancelado_at: string | null;
};
export async function listarTraspasos(): Promise<Traspaso[]> {
  const filas = await leerTodas((d, h) => supabase.from("traspasos_producto")
    .select("id, origen_sucursal_id, destino_sucursal_id, estado, lineas, enviado_at, recibido_at, cancelado_at")
    .order("enviado_at", { ascending: false }).order("id").range(d, h));
  return filas as unknown as Traspaso[];
}

export type MovimientoProducto = {
  id: string; creado_at: string; sucursal_id: string; producto_id: string; producto: string; tipo: string;
  cantidad: number; costo_unitario_mxn: number | null; motivo: string | null;
};
/** Los movimientos de un rango de días de México (00:00 a 23:59:59 hora de México). */
export async function listarMovimientosProducto(desde: string, hasta: string, sucursalId: string | null): Promise<MovimientoProducto[]> {
  const filas = await leerTodas((d, h) => {
    let q = supabase.from("movimientos_producto")
      .select("id, creado_at, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, producto:productos(nombre)")
      .gte("creado_at", `${desde}T00:00:00-06:00`).lte("creado_at", `${hasta}T23:59:59.999-06:00`)
      .order("creado_at", { ascending: false }).order("id");
    if (sucursalId) q = q.eq("sucursal_id", sucursalId);
    return q.range(d, h);
  });
  return filas.map((r) => ({
    id: String(r.id), creado_at: String(r.creado_at), sucursal_id: String(r.sucursal_id), producto_id: String(r.producto_id),
    producto: String((r.producto as { nombre?: string } | null)?.nombre ?? "—"), tipo: String(r.tipo), cantidad: n(r.cantidad),
    costo_unitario_mxn: r.costo_unitario_mxn == null ? null : n(r.costo_unitario_mxn), motivo: (r.motivo as string | null) ?? null,
  }));
}
```

Revisa cómo arma hoy el rango de días de México `lib/reportes-inventario.ts` (`leerMovimientos`) y usa **la misma** utilidad o el mismo desfase. México ya no cambia de horario, pero si el repo tiene un helper (`@vim/fecha`), úsalo en vez del `-06:00` escrito a mano.

- [ ] **Step 4: Verlas pasar, con la suite y el tipado**

Run: `pnpm --filter @vim/admin test` y `pnpm --filter @vim/admin typecheck`
Esperado: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/existencias.ts apps/admin/app/lib/__tests__/existencias.test.ts
git commit -m "feat(retail): libreria de existencias (lectura, estados, captura y llamadas)"
```

---

### Task 4: La sección: menú, candado, pestañas y la pantalla Existencias

**Files:**
- Modify: `apps/admin/app/components/admin-shell.tsx`, `apps/admin/app/lib/operacion.ts`, `apps/admin/app/lib/__tests__/operacion.test.ts`
- Create: `apps/admin/app/(panel)/existencias/layout.tsx`, `apps/admin/app/components/existencias-tabs.tsx`, `apps/admin/app/(panel)/existencias/page.tsx`

**Interfaces:**
- Consumes: Tarea 3; `conExistencias`, `useModulos`; `useSucursalReporte`, `SelectorSucursal`; `Columna`, `hojaDeReporte`, `descargarXlsx`; `Segmentos`, `Modal`, `Button`.
- Produces: la entrada «Existencias» (`/existencias`) en el menú, justo después de Inventario; `RUTA_DE_MODULO` incluye `["/existencias", "existencias"]`; un layout que, sin el módulo, muestra «Esta sección es para tiendas.», y mientras carga, «Cargando…»; `ExistenciasTabs` con Existencias · Recibir · Conteo · Traspasos · Movimientos.

- [ ] **Step 1: Prueba de la ruta** (en `operacion.test.ts`)

Agrega a la prueba que hoy espera exactamente las dos rutas de tienda (`/catalogo/importar-tienda` y `/catalogo/etiquetas`) la tercera, `/existencias`, para `rutasOcultas(con({}))`. Con `existencias: true`, ninguna de las tres se oculta. Corre `pnpm --filter @vim/admin test -- operacion` y mírala fallar.

- [ ] **Step 2: Menú, ruta y candado**

- `admin-shell.tsx`: en `NAV`, después de Inventario, `{ label: "Existencias", href: "/existencias", icon: "<uno de NombreIcono>" }`. Revisa los nombres válidos en `packages/ui/src/components/icono.tsx`; elige uno que diga «estante» o «paquete» y que no sea `caja`, que ya es Inventario.
- `operacion.ts`: agrega `["/existencias", "existencias"]` a `RUTA_DE_MODULO`.
- `(panel)/existencias/layout.tsx`: con `useModulos()`: `null` → «Cargando…» (mismo marcado que `SoloConInventario`); `!conExistencias(m)` → el mismo mensaje que usan Etiquetas e Importar tienda («Esta sección es para tiendas.»); si no, `children`. Si `SoloConInventario` (`components/inventario-desde-negocio.tsx`) tiene una forma reutilizable, cópiala, no la importes: su regla es otra (el plan con recetas).
- `components/existencias-tabs.tsx`: copia la forma de `catalogo-tabs.tsx` (mismas clases, `aria-current`) con las cinco pestañas: `/existencias`, `/existencias/recibir`, `/existencias/conteo`, `/existencias/traspasos` y `/existencias/movimientos`. La primera solo está activa en la ruta exacta (`pathname === "/existencias"`).

Corre la prueba del Step 1: verde.

- [ ] **Step 3: La pantalla Existencias** (`(panel)/existencias/page.tsx`)

Usa `ReporteMarco` con `rango={null}`, porque no hay fechas, y `sucursal={useSucursalReporte()}`. Si `ReporteMarco` no acepta `consulta` sin rango, carga con `useEffect` + estado y arma la página con `PageHeader`, `ExistenciasTabs` y `PageBody`, reutilizando `TablaScroll` y las clases de las tablas de reportes. Lo que lleva:
- **Cifras** (`resumenExistencias`): «Piezas», «Valor del inventario» (mxn, «con el costo de hoy»), «Bajo mínimo» y «En negativo».
- **Filtros:** `Segmentos` Todas · Bajo mínimo · Agotadas · Negativas, y un buscador por nombre, SKU o código.
- **Tabla** (`Columna<FilaExistencia>`):
  - Producto (nombre + variante debajo en `text-13 text-ink-2`), SKU, Sucursal (solo con «todas las sucursales»), Existencia (con color de estado de tokens: `text-danger` negativa, `text-warning` bajo o agotada), Mínimo, Costo, Valor.
  - Acciones con `AccionFila`: «Mínimo» abre un `Modal` con un campo y un «Quitar mínimo» que manda `null`; «Ajustar» abre un `Modal` con `Segmentos` Entrada · Merma · Ajuste, cantidad, costo (solo para Entrada), motivo y la sucursal fija de la fila.
  - Con «todas las sucursales», las acciones se desactivan con una nota: «Elige una sucursal para ajustar.».
- **Excel:** el botón de `ReporteMarco`, o `hojaDeReporte` + `descargarXlsx` con las mismas columnas.
- **Vacío:** «Todavía no hay productos que lleven existencias. Márcalos en el producto o impórtalos desde Catálogo → Importar tienda.», con enlace.
- Tras cada acción, recargar y mostrar el error con `mensajeError`.

- [ ] **Step 4: Tipado, pruebas y tipografía**

Run: `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test`, `pnpm tipografia`
Esperado: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/components/admin-shell.tsx apps/admin/app/lib/operacion.ts apps/admin/app/lib/__tests__/operacion.test.ts "apps/admin/app/(panel)/existencias/layout.tsx" apps/admin/app/components/existencias-tabs.tsx "apps/admin/app/(panel)/existencias/page.tsx"
git commit -m "feat(retail): seccion Existencias con tabla por sucursal, minimos y ajustes"
```

---

### Task 5: Captura de productos y Recibir mercancía

**Files:**
- Create: `apps/admin/app/components/captura-productos.tsx`, `apps/admin/app/(panel)/existencias/recibir/page.tsx`

**Interfaces:**
- Consumes: `buscarCapturable`, `Capturable`, `recibirMercancia` (Tarea 3); `listarProductosEtiquetables` (`lib/variantes.ts`, ya devuelve `id, nombre, codigo_barras, codigo_interno`); `listarProveedores` (`lib/proveedores.ts`); `useSucursalReporte`.
- Produces: `CapturaProductos({ productos, alAgregar, placeholder })`. Es un campo con foco automático: con Enter busca; si hay código exacto llama `alAgregar(producto)` y limpia; si no, muestra hasta 8 coincidencias como botones y, si no hay ninguna, «No se encontró "<texto>"». Con `type="button"` en todo: nunca envía un formulario.

- [ ] **Step 1: El componente.** Debe responder al escáner (texto + Enter) y al tecleo. Escanear dos veces el mismo producto **suma** (lo hace la página, no el componente). Marcado con `input` de `campos.ts` y lista con bordes de renglón.

- [ ] **Step 2: La página Recibir.**
- **Encabezado:** sucursal (si es «todas», pide elegir una, igual que Existencias), proveedor (`<select>` con «Sin proveedor» + `listarProveedores`), y «Remisión o factura (opcional)», máximo 100 caracteres.
- **Captura:** `CapturaProductos`. Cada producto agregado es un renglón de tabla: producto (nombre completo), cantidad (entero o decimal ≥ 0.001, empieza en 1) y costo unitario (opcional; si se deja vacío, el costo del producto no cambia), con «Quitar» en `AccionFila peligro`. Repetir un producto suma 1 a su renglón.
- **«Recibir N productos»:** deshabilitado sin renglones o con un dato inválido (cantidad ≤ 0, NaN o más de 3 decimales; costo < 0 o más de 2 decimales). El aviso va junto al renglón.
- Llama a `recibirMercancia` y muestra «Listo: entraron N productos a <sucursal>.», limpia la lista y conserva proveedor y sucursal. Mientras guarda, un solo clic.
- Una prueba pequeña en Vitest **solo** si extraes una función pura (p. ej. `sumarRenglon(lineas, producto)` o `renglonValido`). Si la extraes, ponla en `lib/existencias.ts` con su prueba.

- [ ] **Step 3: Tipado, pruebas y tipografía** (los mismos tres comandos).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/captura-productos.tsx "apps/admin/app/(panel)/existencias/recibir/page.tsx"
git commit -m "feat(retail): recibir mercancia con escaner o busqueda"
```

(Si tocaste `lib/existencias.ts` y su prueba, agrégalos por nombre.)

---

### Task 6: Conteo físico

**Files:**
- Create: `apps/admin/app/(panel)/existencias/conteo/page.tsx`
- Modify: `apps/admin/app/lib/existencias.ts` + su prueba (`diferenciasConteo`)

**Interfaces:**
- Produces: `diferenciasConteo(contados: { producto_id: string; contado: number }[], existencias: FilaExistencia[]): { producto_id: string; nombre: string; sistema: number; contado: number; diferencia: number }[]`, pura. Con la existencia de la sucursal elegida y 0 si no hay fila; ordenada por diferencia absoluta descendente.

- [ ] **Step 1: Prueba de `diferenciasConteo`** con un producto que sobra, uno que falta, uno sin fila (sistema 0) y uno igual (diferencia 0). Verla fallar y luego implementarla.

- [ ] **Step 2: La página.**
- **Sucursal obligatoria.**
- **Captura:** `CapturaProductos`. Cada escaneo suma 1 al contado de ese producto, y el número se puede editar a mano.
- **«Revisar diferencias»:** abre un `Modal` con la tabla de `diferenciasConteo` (sistema, contado, diferencia con signo y color), y el total de piezas que sobran y que faltan.
- **«Confirmar conteo»** llama a `registrarConteo` con todos los renglones contados (también los que salen igual) y muestra «Listo: se ajustaron N productos.».
- **Alcance:** el aviso fijo explica que se cuentan solo los productos capturados, no toda la tienda: «Lo que no captures no se toca.».

- [ ] **Step 3: Tipado, pruebas y tipografía.**

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(panel)/existencias/conteo/page.tsx" apps/admin/app/lib/existencias.ts apps/admin/app/lib/__tests__/existencias.test.ts
git commit -m "feat(retail): conteo fisico con revision de diferencias"
```

---

### Task 7: Traspasos

**Files:**
- Create: `apps/admin/app/(panel)/existencias/traspasos/page.tsx`

**Interfaces:**
- Consumes: `enviarTraspaso`, `recibirTraspaso`, `cancelarTraspaso`, `listarTraspasos`, `Traspaso` (Tarea 3); `listarSucursalesOpciones`; `listarProductosEtiquetables` (para los nombres en la lista); `CapturaProductos`; `useConfirmar`.

- [ ] **Step 1: La página.**
- **Con una sola sucursal**, solo un aviso: «Los traspasos son entre sucursales; tu negocio tiene una.».
- **«Nuevo traspaso»** (bloque arriba): origen y destino (`<select>`, distintos), captura de productos con cantidad (≥ 0.001; repetir suma 1) y «Enviar». Al enviar, la mercancía sale del origen al momento.
- **Lista** (abajo, más reciente primero): fecha, origen → destino, renglones («3 productos · 12 piezas», que se despliegan al tocar) y estado como `StatusChip` o etiqueta con tokens: En camino, Recibido o Cancelado.
- **Acciones** solo para «En camino»: «Recibir», que confirma y llama a `recibirTraspaso`, y «Cancelar», con `useConfirmar` y el texto «La mercancía regresa a <origen>.», que llama a `cancelarTraspaso`.
- Errores con `mensajeError`. Recargar después de cada acción.

- [ ] **Step 2: Tipado, pruebas y tipografía.**

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/(panel)/existencias/traspasos/page.tsx"
git commit -m "feat(retail): traspasos entre sucursales con recibir y cancelar"
```

---

### Task 8: Movimientos

**Files:**
- Create: `apps/admin/app/(panel)/existencias/movimientos/page.tsx`

**Interfaces:**
- Consumes: `listarMovimientosProducto`, `MovimientoProducto` (Tarea 3); `ReporteMarco`, `useRangoReporte`, `useConsulta`, `useSucursalReporte`, `Columna`.

- [ ] **Step 1: La página.** Copia la forma de `(panel)/inventario/movimientos/page.tsx`: `ReporteMarco` con rango, sucursal y `migas` de Existencias, con `ExistenciasTabs` debajo del encabezado. Si `ReporteMarco` no deja meter las pestañas, ponlas en `antes`.
- **Filtros:** tipo (Todos, Ventas, Devoluciones, Entradas, Ajustes y conteos, Mermas, Traspasos) con `Segmentos` o `<select>`, y un buscador por producto. Ambos filtran en memoria.
- **Columnas:** Fecha y hora, Producto, Tipo (en palabras: Venta, Devolución, Entrada, Ajuste, Conteo, Merma, Sale a otra sucursal, Llega de otra sucursal), Cantidad (con signo), Costo unitario y Motivo.
- **Cifras:** Entradas (piezas), Salidas (piezas) y Movimientos.
- **Excel:** el de `ReporteMarco`.
- **Vacío:** «Sin movimientos en estas fechas.».

- [ ] **Step 2: Tipado, pruebas y tipografía.**

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/(panel)/existencias/movimientos/page.tsx"
git commit -m "feat(retail): historial de movimientos de existencias"
```

---

### Task 9: Reporte «Ventas por talla y color»

**Files:**
- Modify: `apps/admin/app/lib/reportes.ts`, `apps/admin/app/lib/__tests__/reportes.test.ts`, `apps/admin/app/(panel)/reportes/page.tsx`
- Create: `apps/admin/app/(panel)/reportes/ventas-variantes/page.tsx`

**Interfaces:**
- Produces:
  - `ReportesDisponibles` suma `existencias: boolean`; en `disponiblesDe` es `moduloActivo(ef, "existencias")` (solo el módulo, no los datos).
  - `type FilaVariante = { producto_id; producto: string; variante: string; sku: string | null; unidades: number; venta_mxn: number; subtotal_mxn: number; costo_mxn: number | null; margen_mxn: number | null; margen_pct: number | null }`.
  - `agruparVentasVariantes(ventas, productos)`, pura.
  - `leerVentasPorVariante(desde, hasta, sucursalId)`.

- [ ] **Step 1: Prueba de `agruparVentasVariantes`.** Recibe filas de la vista (por día: `producto_id, unidades_vendidas, total_mxn, subtotal_mxn`) y productos (`id, nombre, padre_nombre, variante_ejes, variante_valores, codigo_interno, costo_mxn, controla_existencias`).
- Suma por producto y deja fuera los productos sin existencias.
- Margen = `subtotal − unidades × costo`, con `margen_pct` = margen / subtotal × 100. Sin costo, `margen_mxn` y `margen_pct` son `null`, nunca 0.
- Caso de prueba: dos días de la misma variante se suman; un producto de restaurante no aparece; uno sin costo trae `null`.

Agrega también a la prueba existente de `disponiblesDe` que `existencias` sigue al módulo.

- [ ] **Step 2: La lógica.**
- `leerVentasPorVariante` usa `leerVista("vw_ventas_por_producto", "producto_id, unidades_vendidas, total_mxn, subtotal_mxn, dia_contable", desde, hasta, ["sucursal_id","producto_id","producto_nombre"], { sucursalId })`. Revisa que la vista exponga `subtotal_mxn`; sí la tiene.
- Lee los productos con existencias con `leerTodas`: `productos.select("id, nombre, codigo_interno, costo_mxn, controla_existencias, variante_valores, padre:productos!producto_padre_id(nombre, variante_ejes)")`. Si el embebido por la llave a sí misma da ambigüedad en PostgREST, lee los padres en una segunda consulta.
- Llama a `agruparVentasVariantes`.

- [ ] **Step 3: La página** (`reportes/ventas-variantes/page.tsx`), copiando `ventas-producto/page.tsx`:
- **Título:** «Ventas por talla y color»; **subtítulo:** «Qué talla y color se vende más y cuánto te deja cada uno.».
- **Cifras:** Venta, Piezas, Margen («con el costo de hoy») y la variante que más vende.
- **Columnas:** Producto, Variante, SKU, Piezas, Venta, Costo (unidades × costo; vacío si no hay costo), Margen y Margen %.
- **Nota al pie:** «El margen usa el costo actual de cada producto, sin IVA.».

En `reportes/page.tsx`, en el grupo «Qué se vende», agrega `{ href: "/reportes/ventas-variantes", titulo: "Ventas por talla y color", descripcion: "Qué talla y color se vende más y cuánto te deja cada uno.", modulo: "existencias" }`. Revisa que el índice esconda la tarjeta cuando `existencias` sea `false`, como hace con los demás `modulo`.

- [ ] **Step 4: Tipado, pruebas y tipografía.**

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/reportes.ts apps/admin/app/lib/__tests__/reportes.test.ts "apps/admin/app/(panel)/reportes/page.tsx" "apps/admin/app/(panel)/reportes/ventas-variantes/page.tsx"
git commit -m "feat(retail): reporte de ventas por talla y color con margen"
```

---

### Task 10: Diseño, base local, tipos y todo

**Files:**
- Modify: `docs/diseno/admin.md`
- Regenerate: `packages/db/src/database.types.ts`

- [ ] **Step 1: Diseño.** En la sección «Tienda (giro RETAIL)» de `docs/diseno/admin.md`, agrega en una o dos frases por pieza: la sección Existencias y sus cinco pestañas, la captura por escáner o búsqueda (código exacto primero), «Revisar diferencias» antes de confirmar un conteo, cancelar un traspaso en camino y el reporte por talla y color («con el costo de hoy»). Describe lo que se construyó leyendo el código.

- [ ] **Step 2: Base local.** `npx supabase migration list --local` debe mostrar **solo** 0192 y 0193 pendientes; si aparece otra cosa, detente y repórtalo. Luego `npx supabase migration up --local`, `pnpm db:types` y restaurar el bloque `__InternalSupabase` exactamente como está en HEAD si el CLI lo quita. El diff de tipos solo debe agregar lo de 0192 y 0193.

- [ ] **Step 3: Todo.**

```bash
cd desktop && npm run smokes && cd ..
node --test desktop/src/sync-pull.test.mjs
pnpm test:functions
pnpm --filter "./apps/*" -r typecheck
pnpm --filter @vim/admin test
pnpm tipografia
```

Esperado: todo verde. Un rojo ajeno se reporta, no se arregla aquí.

- [ ] **Step 4: Commit**

```bash
git add docs/diseno/admin.md packages/db/src/database.types.ts
git commit -m "docs(retail): existencias en el diseno del admin; tipos con 0192-0193"
```

- [ ] **Step 5: Cierre local.** Sin push, PR ni producción. El controlador verifica en el navegador (config `admin-retail`, puerto 3021, cuenta de prueba de la semilla, `existencias` encendido solo mientras prueba en el Docker local):
- un restaurante no ve la sección;
- con el módulo: existencias por sucursal, mínimo, ajuste, recibir con escaneo, conteo con revisión, traspaso enviado, recibido y cancelado, movimientos y reporte;
- al final regresa `existencias` a `false` y borra (suave) lo creado.

## Lo que esta entrega no hace

- La caja retail, el escáner en la caja, el cambio de talla con dinero y la sincronización de existencias con la caja instalada: entrega 4.
- Liberar `RETAIL` en el alta y el registro, el sitio y el PDF para prospectos: entrega 5.
- Avisos por correo de bajo mínimo; permiso propio para encargados; costo histórico por venta.
- Antes de mezclar (con todo el giro): aplicar 0188–0193 a producción y desplegar `buscar-clave-sat`.
