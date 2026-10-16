# Giro RETAIL · Entrega 2: el catálogo en el admin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de una tienda de ropa pueda dar de alta prendas con tallas y colores (cada combinación con su SKU, código de barras, precio, costo y existencia inicial), generar códigos de barras internos, importar su catálogo desde CSV o Excel, imprimir etiquetas con código de barras y buscar la clave SAT de cada prenda, **sin que un restaurante vea nada distinto**.

**Architecture:** Una migración, la 0190. Completa las reglas de variantes que dejó pendientes la entrega 1, agrega el generador de códigos EAN-13 internos y dos funciones que escriben todo de un golpe: `guardar_variantes` para el editor e `importar_catalogo_tienda` para el CSV. Las dos comparten la función interna `_guardar_variante`. En el admin, todo lo de tienda aparece solo con el módulo `existencias` efectivo:
- campos nuevos en el formulario de producto;
- un editor de matriz que copia el patrón de `ProductoModificadores` (ranura `extra` + `onPendiente`, un solo «Guardar» por pantalla);
- una pantalla para importar y otra para etiquetas.

Las etiquetas se imprimen desde el navegador con CSS de impresión, y el EAN-13 se dibuja como SVG sin ninguna librería. La clave SAT se busca en el catálogo de Facturama con una función nueva, `buscar-clave-sat`. La caja instalada recibe el arreglo de su pull antes de que el admin pueda editar prendas.

**Tech Stack:** PostgreSQL 15 (Supabase) y smokes `.sql`; Next.js con React y Tailwind en `apps/admin`, probado con Vitest 3; Edge Functions en Deno, probadas con `node --test --experimental-strip-types`; escritorio en Node (`desktop/src/sync-pull.mjs`, probado con `node --test`).

**Spec:** `docs/superpowers/specs/2026-10-15-giro-retail-design.md` (§6.1 completo, §13 «Antes de que el admin pueda editar prendas» y entrega 2 de §9). ADR 0037.

## Global Constraints

- **Todo en local hasta el 100 % (Fermín, 15 oct):** nada de push, PR, producción, `supabase db push` ni `functions deploy`. Por decisión de Fermín de este mismo día, las migraciones 0188–0190 **sí** se aplican al Supabase local de Docker (Tarea 13), para probar las pantallas.
- **Ningún restaurante cambia.** Todo lo de tienda (campos, editor, pestañas, pantallas) se ve **solo** con el módulo `existencias` efectivo. Sin él, el admin queda idéntico.
- **RLS sagrado.** Las funciones `SECURITY DEFINER` confinan todo a `current_tenant_id()` y exigen el permiso `config.productos` y el módulo, reutilizando `_existencias_puede_escribir()` de la 0189.
- **Dinero en `numeric(12,2)`; cantidades en `numeric(12,3)`. `'NaN'` nunca entra** (regla R6): se rechaza en cada función con `DATOS_INVALIDOS`.
- **Sin dependencias nuevas.** El CSV se lee con `dividirCSV` (ya existe, hay que exportarlo) y `textoDeArchivo` (ya lee `.xlsx`). El código de barras es SVG hecho a mano y el PDF es «Imprimir → Guardar como PDF» del navegador. El repo evita librerías a propósito (ver el encabezado de `apps/admin/app/lib/excel.ts`).
- **Diseño:** mandan `docs/diseno/admin.md`, `docs/diseno/nucleo.md` y `packages/ui/tokens.css`. Se usan las piezas existentes (`Tarjeta`, `Interruptor`, `Segmentos`, `AccionFila`, `label`/`input` de `campos.ts`, `Modal` y `Button` de `@vim/ui`). Los controles miden 36–40 px con mouse, salvo los campos estándar (`h-11`). Tamaños de letra solo de la escala (`text-13`, `text-14`…): `pnpm tipografia` rechaza `text-[Npx]`.
- **Código:** cargar la skill `ponytail` antes de escribir, y las skills de Emil Kowalski antes de escribir CSS (memoria del proyecto). Español en el dominio. Sin `any`: `unknown` + Zod.
- **Commits:** solo los archivos de la tarea (`git add <archivos>`, nunca `-a` ni `-A`). Mensaje + línea en blanco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de crear la migración, confirmar que la 0190 sigue libre (`ls supabase/migrations | tail -3` termina en 0189). Si no, renumerar.

## Decisiones de este plan

1. **Los tipos de TypeScript se regeneran al final** (Tarea 13), contra el Docker local con las migraciones aplicadas. El admin usa supabase-js sin tipar, así que nada depende de ellos antes.
2. **La existencia del CSV solo cuenta al crear.** Si se reimporta un SKU que ya existe, se actualizan nombre, precio, costo y códigos, pero no la existencia: eso es trabajo de la pantalla de Existencias (entrega 3). Así un CSV viejo no pisa un conteo.
3. **Los cambios del padre bajan a las hijas.** Nombre, categoría, clave SAT, unidad SAT, tasa de IVA e IVA incluido los copia un disparador. El nombre de la hija es «Padre + valores» («Playera Polo M Negra»).
4. **La lista de productos esconde las hijas** y muestra «N variantes» en el padre. Lo mismo pasa en todo lo que usa `listarProductos` (promociones, menús por sucursal). Queda anotado como pendiente.
5. **Las etiquetas de códigos que no son EAN-13 ni UPC-A** salen con el texto del código sin barras, y la pantalla avisa. Code 128 se agrega cuando un cliente lo pida.
6. **Generar códigos internos** usa `pg_advisory_xact_lock` + máximo + 1. Dentro de `guardar_variantes` e `importar_catalogo_tienda` es seguro. El botón suelto «Generar» del formulario puede, rara vez, repetir el código de otra pestaña abierta al mismo tiempo. El índice único lo detiene y el dueño vuelve a generar (`ponytail:`).
7. **La respuesta de Facturama** a `/Catalogs/ProductsOrServices` no viene documentada («Sample not available»). El normalizador acepta `Value`/`Name` y también `Code`/`Description`. Si hay credenciales de sandbox en `supabase/functions/.env`, se comprueba en la Tarea 11.

## Review Focus

1. **Un restaurante abre su catálogo** (módulo `existencias` apagado): no aparece ni un campo, pestaña ni pantalla nueva, y crear o editar un producto escribe exactamente lo de antes. Prueba en las Tareas 4 y 7.
2. **Guardar la matriz dos veces o reimportar el mismo CSV** no duplica hijas ni existencias, y una fila mala no deja nada a medias. Prueba en las Tareas 1 y 2.
3. **Códigos de barras repetidos** (escritos a mano o del proveedor) dan un mensaje claro que dice cuál choca, no un error crudo de Postgres. Prueba en la Tarea 1.
4. **CSV con comas, punto y coma o tabuladores, comillas, acentos (UTF-8 o Windows-1252), renglones vacíos, precios con «$» y columnas de más.** Pruebas en la Tarea 5.
5. **Imprimir etiquetas**: una hoja carta sale en cuadrícula de 3×10 y una etiqueta de rollo sale a su tamaño, sin el menú del admin. El EAN-13 debe leerse, con el dígito verificador correcto. Prueba en las Tareas 5 y 10, más la verificación en el navegador de la Tarea 13.

## Hallazgos que el plan ya considera

- `producto-form.tsx` (620 líneas) ya recibe `extra` y `guardarTambien`. El editor de variantes entra ahí sin tocar su lógica de guardado. Solo hacen falta campos nuevos dentro de un bloque condicionado.
- `listarProductos`/`obtenerProducto` usan un `select` escrito a mano. Hay que agregar las columnas nuevas o el formulario no las ve.
- `moduloActivo` (en `packages/db/src/operacion.ts`) toma una llave ausente como «encendido», salvo `eventos` y `cuentas_barra`. **`existencias` tiene que sumarse a esa excepción**, o todos los restaurantes verían lo de tienda mientras carga el admin.
- `operacion-catalogo.test.ts` fija la lista exacta de giros ofrecidos y de módulos. Se actualiza junto con `operacion.ts`.
- `/platform` valida el giro con `GIROS.some`. `RETAIL` entra con `ofrecido: false`: no aparece en el selector, y si llegara, `cambiar_giro` responde `GIRO_NO_DISPONIBLE` (0189).
- El pull de la caja aplica `productos` renglón por renglón en modo réplica, y los índices únicos sí se revisan ahí. El precedente para soltar llaves antes del upsert es `liberarClavesUnicasClientes` (`desktop/src/sync-pull.mjs:543`). `sync-pull.test.mjs` usa un cliente falso, sin Postgres real, así que se corre solo y sin riesgo.
- `importarMenu` crea productos de uno en uno y no es todo o nada. El importador de tienda es otro, con su propia función en la base.
- No hay Playwright. La prueba de punta a punta es la verificación en el navegador de la Tarea 13.

## Archivos

| Archivo | Qué |
|---|---|
| Crear `supabase/migrations/0190_catalogo_tienda.sql` | §1 coherencia completa y herencia del padre · §2 códigos internos · §3 `_guardar_variante` + `guardar_variantes` · §4 `importar_catalogo_tienda` |
| Crear `supabase/scripts/smoke_catalogo_tienda.sql` | Un bloque por sección |
| Modificar `desktop/src/sync-pull.mjs` + `desktop/src/sync-pull.test.mjs` | Soltar las llaves únicas de `productos` antes del upsert |
| Modificar `packages/db/src/operacion.ts` + `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts` | `RETAIL` y `existencias` |
| Modificar `apps/admin/app/lib/operacion.ts` | `conExistencias()` y rutas de tienda |
| Crear `apps/admin/app/lib/codigo-barras.ts` + prueba | EAN-13: dígito, validación y módulos para el SVG |
| Crear `apps/admin/app/lib/variantes.ts` + prueba | Matriz, nombre de variante y llamadas a la base |
| Crear `apps/admin/app/lib/importar-tienda.ts` + prueba | Parser del CSV de tienda y llamada a la base |
| Modificar `apps/admin/app/lib/importar-menu.ts` | `export` de `dividirCSV` |
| Modificar `apps/admin/app/lib/catalogo.ts` | Columnas y campos nuevos; la lista esconde hijas y cuenta variantes |
| Modificar `apps/admin/app/components/producto-form.tsx` | Bloque «Tienda» (código de barras, generar, costo, lleva existencias) y buscador SAT |
| Crear `apps/admin/app/components/producto-variantes.tsx` | Editor de la matriz |
| Modificar `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx` | Monta el editor |
| Modificar `apps/admin/app/(panel)/catalogo/productos/page.tsx` | «N variantes» |
| Modificar `apps/admin/app/components/catalogo-tabs.tsx` | Pestañas «Importar tienda» y «Etiquetas», solo con el módulo |
| Crear `apps/admin/app/(panel)/catalogo/importar-tienda/page.tsx` | Pantalla de importar |
| Crear `apps/admin/app/(panel)/catalogo/etiquetas/page.tsx` + `apps/admin/app/components/barras-ean13.tsx` | Etiquetas |
| Crear `supabase/functions/_shared/pac/catalogo-sat.ts` + prueba; `supabase/functions/buscar-clave-sat/index.ts`; modificar `facturama.ts` | Buscador SAT |
| Crear `apps/admin/app/components/buscador-clave-sat.tsx` + `apps/admin/app/lib/clave-sat.ts` | Buscador en el formulario |
| Modificar `docs/diseno/admin.md` | Sección «Tienda» |
| Regenerar `packages/db/src/database.types.ts` | Al final |

---

### Task 0: Rama y dependencias

- [ ] **Step 1: Rama encima de la entrega 1** (ya existe: el plan se escribió en ella)

```bash
cd vim-pos-retail
git switch feat/retail-catalogo
git log --oneline -1 feat/retail-nucleo   # debe ser ancestro de HEAD
ls supabase/migrations | tail -3
```

Esperado: la última es `0189_existencias_por_producto.sql`.

- [ ] **Step 2: Dependencias del monorepo** (el worktree no las trae)

```bash
pnpm install --frozen-lockfile
pnpm --filter @vim/admin test
```

Esperado: la suite del admin en verde (línea base). Si algo ya estaba rojo, se anota y no se arregla aquí.

---

### Task 1: Migración 0190 §1–§3: reglas completas, códigos internos y `guardar_variantes`

**Files:**
- Create: `supabase/migrations/0190_catalogo_tienda.sql`
- Create: `supabase/scripts/smoke_catalogo_tienda.sql`

**Interfaces:**
- Consumes (0189): `_existencias_puede_escribir() RETURNS uuid`, `productos_variante_coherencia()`, `movimientos_producto`, `usuario_actual_tiene_permiso(text)`.
- Produces:
  - `ean13_digito(p_doce text) RETURNS text`
  - `_siguiente_codigo_interno(p_tenant uuid) RETURNS text` (interna)
  - `generar_codigo_interno() RETURNS text` (RPC)
  - `_guardar_variante(p_tenant uuid, p_padre productos, p_fila jsonb, p_sucursal uuid) RETURNS text` (interna; devuelve `'creada'`, `'actualizada'` o `'desactivada'`)
  - `guardar_variantes(p_padre uuid, p_ejes text[], p_filas jsonb, p_sucursal uuid DEFAULT NULL) RETURNS jsonb` (RPC) → `{"creadas": int, "actualizadas": int, "desactivadas": int}`
  - Cada `p_filas[i]` es `{"id"?: uuid, "valores": {eje: valor}, "codigo_interno"?: text, "codigo_barras"?: text, "generar_codigo"?: bool, "precio": number, "costo"?: number, "existencia_inicial"?: number, "activa"?: bool}`
  - Errores: `DATOS_INVALIDOS: …` (22023), y los de 0189 (`SIN_PERMISO`, `MODULO_APAGADO`, `VARIANTE_INVALIDA`).

- [ ] **Step 1: El smoke que falla**

`supabase/scripts/smoke_catalogo_tienda.sql`:

```sql
-- Smoke del catálogo de tienda (spec 2026-10-15-giro-retail-design.md §6.1, migración 0190).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_catalogo_tienda.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: módulo encendido, una categoría y un padre "Playera Polo" sin hijas.
DO $$
BEGIN
  PERFORM operacion_cambiar('99999999-0000-0000-0000-0000000000aa', '{"existencias":true}');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c7c70000-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-0000000000aa', 'Playeras');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, clave_sat, tasa_iva)
  VALUES ('c7c70000-0000-0000-0000-0000000000a0', '99999999-0000-0000-0000-0000000000aa', 'Playera Polo',
          'c7c70000-0000-0000-0000-0000000000c1', 349, '53101602', 16);
END $$;

-- 1) Reglas completas de variantes y herencia del padre.
DO $$
DECLARE
  v_padre uuid := 'c7c70000-0000-0000-0000-0000000000a0';
BEGIN
  -- 1a) Ejes repetidos (sin importar mayúsculas), nulos o vacíos.
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla','talla'] WHERE id = v_padre;
        RAISE EXCEPTION '1a: ejes repetidos'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla',NULL] WHERE id = v_padre;
        RAISE EXCEPTION '1a: eje nulo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla',' '] WHERE id = v_padre;
        RAISE EXCEPTION '1a: eje vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  RAISE NOTICE '1 reglas de ejes OK';
END $$;

-- 2) Códigos internos: EAN-13 con prefijo 20, consecutivos y con dígito verificador correcto.
DO $$
DECLARE
  v_a text; v_b text;
BEGIN
  IF ean13_digito('400638133393') <> '1' THEN RAISE EXCEPTION '2a: dígito de 400638133393 debe ser 1'; END IF;
  IF ean13_digito('750100000000') <> '5' THEN RAISE EXCEPTION '2a: dígito de 750100000000 debe ser 5, es %', ean13_digito('750100000000'); END IF;
  v_a := _siguiente_codigo_interno('99999999-0000-0000-0000-0000000000aa');
  IF v_a !~ '^20[0-9]{11}$' OR right(v_a, 1) <> ean13_digito(left(v_a, 12)) THEN RAISE EXCEPTION '2b: código mal formado %', v_a; END IF;
  -- La cajera no puede pedir códigos; el dueño sí.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  BEGIN PERFORM generar_codigo_interno();
        RAISE EXCEPTION '2c: la cajera no debía generar'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  v_b := generar_codigo_interno();
  IF v_b <> v_a THEN RAISE EXCEPTION '2d: sin guardar nada, el siguiente debe ser el mismo (% vs %)', v_a, v_b; END IF;
  RAISE NOTICE '2 códigos internos OK';
END $$;

-- 3) guardar_variantes: crea, nombra, genera códigos, existencia inicial, actualiza, desactiva y
--    rechaza lo malo sin dejar nada a medias.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_padre uuid := 'c7c70000-0000-0000-0000-0000000000a0';
  v_r     jsonb; v_m uuid; v_g uuid; v_n int; v_cod_m text; v_cod_g text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('valores', jsonb_build_object('Talla','M','Color','Negra'), 'codigo_interno','POL-M-NEG',
                       'generar_codigo', true, 'precio', 349, 'costo', 150, 'existencia_inicial', 5),
    jsonb_build_object('valores', jsonb_build_object('Talla','G','Color','Negra'), 'codigo_interno','POL-G-NEG',
                       'generar_codigo', true, 'precio', 359, 'existencia_inicial', 0)), v_suc);
  IF (v_r->>'creadas')::int <> 2 THEN RAISE EXCEPTION '3a: debía crear 2, %', v_r; END IF;

  SELECT id, codigo_barras INTO v_m, v_cod_m FROM productos WHERE producto_padre_id = v_padre AND codigo_interno = 'POL-M-NEG';
  SELECT id, codigo_barras INTO v_g, v_cod_g FROM productos WHERE producto_padre_id = v_padre AND codigo_interno = 'POL-G-NEG';
  IF (SELECT nombre FROM productos WHERE id = v_m) <> 'Playera Polo M Negra' THEN RAISE EXCEPTION '3b: nombre de la hija'; END IF;
  IF NOT (SELECT controla_existencias FROM productos WHERE id = v_m) THEN RAISE EXCEPTION '3b: la hija debe llevar existencias'; END IF;
  IF (SELECT clave_sat FROM productos WHERE id = v_m) <> '53101602' THEN RAISE EXCEPTION '3b: la hija hereda la clave SAT'; END IF;
  IF v_cod_m IS NULL OR v_cod_g IS NULL OR v_cod_m = v_cod_g THEN RAISE EXCEPTION '3c: códigos generados % %', v_cod_m, v_cod_g; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 5 THEN RAISE EXCEPTION '3d: existencia inicial de M'; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE producto_id = v_g) THEN RAISE EXCEPTION '3d: existencia 0 no genera movimiento'; END IF;

  -- 3e) Guardar otra vez lo mismo (con id) actualiza, no duplica ni vuelve a sumar existencia.
  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('id', v_m, 'valores', jsonb_build_object('Talla','M','Color','Negra'), 'codigo_interno','POL-M-NEG',
                       'codigo_barras', v_cod_m, 'precio', 399, 'costo', 160, 'existencia_inicial', 5)), v_suc);
  IF (v_r->>'actualizadas')::int <> 1 OR (v_r->>'creadas')::int <> 0 THEN RAISE EXCEPTION '3e: %', v_r; END IF;
  IF (SELECT precio_base_mxn FROM productos WHERE id = v_m) <> 399 THEN RAISE EXCEPTION '3e: precio no se actualizó'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 5 THEN RAISE EXCEPTION '3e: la existencia no debe volver a sumar'; END IF;

  -- 3f) Desactivar G.
  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('id', v_g, 'valores', jsonb_build_object('Talla','G','Color','Negra'), 'precio', 359, 'activa', false)), v_suc);
  IF (v_r->>'desactivadas')::int <> 1 OR (SELECT deleted_at FROM productos WHERE id = v_g) IS NULL THEN RAISE EXCEPTION '3f: %', v_r; END IF;

  -- 3g) Renombrar el padre baja a las hijas.
  UPDATE productos SET nombre = 'Polo Clásica', clave_sat = '53101603' WHERE id = v_padre;
  IF (SELECT nombre FROM productos WHERE id = v_m) <> 'Polo Clásica M Negra' OR (SELECT clave_sat FROM productos WHERE id = v_m) <> '53101603' THEN
    RAISE EXCEPTION '3g: el cambio del padre no bajó a la hija'; END IF;

  -- 3h) Lo malo no deja nada: código repetido (mensaje que lo nombra), precio NaN, sin sucursal.
  SELECT count(*) INTO v_n FROM productos WHERE producto_padre_id = v_padre;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Negra'), 'precio', 349, 'codigo_interno', 'POL-CH-NEG'),
          jsonb_build_object('valores', jsonb_build_object('Talla','XG','Color','Negra'), 'precio', 349, 'codigo_barras', v_cod_m)), v_suc);
        RAISE EXCEPTION '3h: código repetido';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: el código de barras%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Roja'), 'precio', 'NaN')), v_suc);
        RAISE EXCEPTION '3h: precio NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Azul'), 'precio', 349, 'existencia_inicial', 3)), NULL);
        RAISE EXCEPTION '3h: existencia sin sucursal'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM productos WHERE producto_padre_id = v_padre) <> v_n THEN RAISE EXCEPTION '3h: un guardado rechazado dejó hijas'; END IF;

  -- 3i) Cambiar ejes con hijas vivas se rechaza (0189).
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla'], '[]'::jsonb, v_suc);
        RAISE EXCEPTION '3i: ejes con hijas'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;

  -- 3j) La cajera no puede.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', v_t)::text, true);
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], '[]'::jsonb, v_suc);
        RAISE EXCEPTION '3j: cajera'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF; END;
  RAISE NOTICE '3 guardar_variantes OK';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_catalogo_tienda.sql`
Esperado: `❌` en el bloque 1 (`1a: ejes repetidos`).

- [ ] **Step 3: La migración**

`supabase/migrations/0190_catalogo_tienda.sql`. Antes de escribir la §1, abre `productos_variante_coherencia` en `0189_existencias_por_producto.sql` y parte de **ese** cuerpo vigente. Lo de abajo es ese cuerpo más las dos validaciones marcadas `0190`. Si el vigente tiene algo más, consérvalo.

```sql
-- Catálogo de tienda en el admin (spec 2026-10-15-giro-retail-design.md §6.1 y §13; ADR 0037).
-- §1 reglas completas de variantes y herencia del padre · §2 códigos internos ·
-- §3 _guardar_variante + guardar_variantes · §4 importar_catalogo_tienda.

-- ── §1 Reglas completas y herencia ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION productos_variante_coherencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_padre productos%ROWTYPE;
  k       text;
BEGIN
  -- 0190: ejes sin repetir (sin importar mayúsculas), sin nulos y sin vacíos.
  IF NEW.variante_ejes IS NOT NULL AND (
       cardinality(NEW.variante_ejes) = 0
       OR array_position(NEW.variante_ejes, NULL) IS NOT NULL
       OR EXISTS (SELECT 1 FROM unnest(NEW.variante_ejes) e WHERE btrim(e) = '')
       OR cardinality(NEW.variante_ejes) <> (SELECT count(DISTINCT lower(btrim(e))) FROM unnest(NEW.variante_ejes) e)) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: los ejes no pueden ir vacíos ni repetidos' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.variante_ejes IS DISTINCT FROM NEW.variante_ejes
     AND EXISTS (SELECT 1 FROM productos h WHERE h.producto_padre_id = NEW.id AND h.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: no se cambian los ejes de un producto que ya tiene variantes' USING ERRCODE = '23514';
  END IF;

  IF NEW.producto_padre_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_padre FROM productos WHERE id = NEW.producto_padre_id;
  IF NOT FOUND OR v_padre.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el producto padre no es de este negocio' USING ERRCODE = '23514';
  END IF;
  -- 0190: ni a un padre borrado (al crear la hija o al moverla de padre).
  IF v_padre.deleted_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.producto_padre_id IS DISTINCT FROM NEW.producto_padre_id) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el producto padre está eliminado' USING ERRCODE = '23514';
  END IF;
  IF v_padre.producto_padre_id IS NOT NULL OR v_padre.variante_ejes IS NULL THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el padre tiene que ser un producto con variantes' USING ERRCODE = '23514';
  END IF;
  IF (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(NEW.variante_valores) x)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_padre.variante_ejes) x) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: la variante debe traer exactamente los ejes %', v_padre.variante_ejes USING ERRCODE = '23514';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.variante_valores) LOOP
    IF jsonb_typeof(NEW.variante_valores->k) <> 'string' OR btrim(NEW.variante_valores->>k) = '' THEN
      RAISE EXCEPTION 'VARIANTE_INVALIDA: el valor de % no puede ir vacío', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- "Playera Polo" + {"Talla":"M","Color":"Negra"} con ejes {Talla,Color} → "Playera Polo M Negra".
CREATE OR REPLACE FUNCTION _nombre_variante(p_nombre text, p_ejes text[], p_valores jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_nombre || ' ' || string_agg(p_valores->>e, ' ' ORDER BY o)
    FROM unnest(p_ejes) WITH ORDINALITY AS x(e, o);
$$;

-- Lo que la hija copia del padre se mantiene igual cuando el padre cambia. En la caja el pull corre
-- en réplica y esto no corre: la nube ya mandó las hijas actualizadas.
CREATE OR REPLACE FUNCTION productos_heredar_a_variantes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE productos h
     SET nombre = _nombre_variante(NEW.nombre, NEW.variante_ejes, h.variante_valores),
         categoria_id = NEW.categoria_id, clave_sat = NEW.clave_sat, unidad_sat = NEW.unidad_sat,
         tasa_iva = NEW.tasa_iva, iva_incluido_en_precio = NEW.iva_incluido_en_precio, updated_at = now()
   WHERE h.producto_padre_id = NEW.id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_heredar_a_variantes ON productos;
CREATE TRIGGER trg_productos_heredar_a_variantes
  AFTER UPDATE OF nombre, categoria_id, clave_sat, unidad_sat, tasa_iva, iva_incluido_en_precio ON productos
  FOR EACH ROW WHEN (NEW.variante_ejes IS NOT NULL)
  EXECUTE FUNCTION productos_heredar_a_variantes();

-- ── §2 Códigos de barras internos ────────────────────────────────────────────
-- EAN-13 con prefijo 20 (rango de uso interno de GS1): "20" + 10 dígitos consecutivos por negocio
-- + dígito verificador. Cuenta también los borrados: un código no se reutiliza.
CREATE OR REPLACE FUNCTION ean13_digito(p_doce text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT ((10 - (sum(substr(p_doce, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END) % 10)) % 10)::text
    FROM generate_series(1, 12) i;
$$;

CREATE OR REPLACE FUNCTION _siguiente_codigo_interno(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n    bigint;
  v_doce text;
BEGIN
  -- ponytail: candado por negocio + máximo; dentro de una misma transacción no repite. Dos
  -- llamadas sueltas sin guardar pueden dar el mismo código: lo detiene el índice único (0189).
  PERFORM pg_advisory_xact_lock(hashtext('codigo_interno:' || p_tenant::text));
  SELECT COALESCE(max(substr(codigo_barras, 3, 10)::bigint), 0) + 1 INTO v_n
    FROM productos WHERE tenant_id = p_tenant AND codigo_barras ~ '^20[0-9]{11}$';
  v_doce := '20' || lpad(v_n::text, 10, '0');
  RETURN v_doce || ean13_digito(v_doce);
END;
$$;
REVOKE ALL ON FUNCTION _siguiente_codigo_interno(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION generar_codigo_interno()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN _siguiente_codigo_interno(_existencias_puede_escribir());
END;
$$;
REVOKE ALL ON FUNCTION generar_codigo_interno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generar_codigo_interno() TO authenticated, service_role;

-- ── §3 Guardar variantes ─────────────────────────────────────────────────────
-- Una hija: la crea (con su existencia inicial) o la actualiza o la desactiva. La usan el editor
-- (guardar_variantes) y el importador (importar_catalogo_tienda). Interna: confía en que quien la
-- llama ya validó negocio, permiso, módulo y padre.
CREATE OR REPLACE FUNCTION _guardar_variante(p_tenant uuid, p_padre productos, p_fila jsonb, p_sucursal uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id      uuid;
  v_valores jsonb := p_fila->'valores';
  v_cod     text := NULLIF(btrim(p_fila->>'codigo_interno'), '');
  v_barras  text := NULLIF(btrim(p_fila->>'codigo_barras'), '');
  v_precio  numeric;
  v_costo   numeric;
  v_q       numeric;
  v_activa  boolean := COALESCE((p_fila->>'activa')::boolean, true);
BEGIN
  BEGIN
    v_id     := NULLIF(p_fila->>'id', '')::uuid;
    v_precio := (p_fila->>'precio')::numeric;
    v_costo  := NULLIF(p_fila->>'costo', '')::numeric;
    v_q      := NULLIF(p_fila->>'existencia_inicial', '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: variante mal formada: %', p_fila USING ERRCODE = '22023';
  END;
  IF v_precio IS NULL OR v_precio = 'NaN' OR v_precio < 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: precio inválido en %', v_valores USING ERRCODE = '22023';
  END IF;
  IF v_costo = 'NaN' OR v_costo < 0 OR v_q = 'NaN' OR v_q < 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: costo o existencia inválidos en %', v_valores USING ERRCODE = '22023';
  END IF;
  IF v_barras IS NULL AND COALESCE((p_fila->>'generar_codigo')::boolean, false) THEN
    v_barras := _siguiente_codigo_interno(p_tenant);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras,
                           clave_sat, unidad_sat, tasa_iva, iva_incluido_en_precio, producto_padre_id, variante_valores,
                           controla_existencias, en_menu_general, visible_en_pos, estado, orden_visualizacion, deleted_at)
    VALUES (p_tenant, _nombre_variante(p_padre.nombre, p_padre.variante_ejes, v_valores), p_padre.categoria_id, v_precio,
            v_costo, v_cod, v_barras, p_padre.clave_sat, p_padre.unidad_sat, p_padre.tasa_iva, p_padre.iva_incluido_en_precio,
            p_padre.id, v_valores, true, p_padre.en_menu_general, p_padre.visible_en_pos, 'ACTIVO', p_padre.orden_visualizacion,
            CASE WHEN v_activa THEN NULL ELSE now() END)
    RETURNING id INTO v_id;
    IF v_q > 0 THEN
      IF p_sucursal IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: elige la sucursal de la existencia inicial' USING ERRCODE = '22023';
      END IF;
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, usuario_id)
      VALUES (p_tenant, p_sucursal, v_id, 'ENTRADA', v_q, v_costo, 'Existencia inicial', auth.uid());
    END IF;
    RETURN 'creada';
  END IF;

  UPDATE productos
     SET nombre = _nombre_variante(p_padre.nombre, p_padre.variante_ejes, v_valores), variante_valores = v_valores,
         precio_base_mxn = v_precio, costo_mxn = v_costo, codigo_interno = v_cod, codigo_barras = v_barras,
         deleted_at = CASE WHEN v_activa THEN NULL ELSE COALESCE(deleted_at, now()) END, updated_at = now()
   WHERE id = v_id AND producto_padre_id = p_padre.id AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: esa variante no es de este producto' USING ERRCODE = '22023';
  END IF;
  RETURN CASE WHEN v_activa THEN 'actualizada' ELSE 'desactivada' END;
END;
$$;
REVOKE ALL ON FUNCTION _guardar_variante(uuid, productos, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- El índice que choca, dicho como lo entiende el dueño.
CREATE OR REPLACE FUNCTION _mensaje_unico_producto(p_constraint text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_constraint
    WHEN 'productos_codigo_barras_unico' THEN 'DATOS_INVALIDOS: el código de barras ya lo tiene otro producto'
    WHEN 'productos_sku_existencias_unico' THEN 'DATOS_INVALIDOS: el SKU ya lo tiene otro producto'
    WHEN 'productos_variante_unica' THEN 'DATOS_INVALIDOS: esa combinación de talla y color ya existe'
    ELSE 'DATOS_INVALIDOS: hay un dato repetido (' || p_constraint || ')' END;
$$;

CREATE OR REPLACE FUNCTION guardar_variantes(p_padre uuid, p_ejes text[], p_filas jsonb, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t  uuid := _existencias_puede_escribir();
  v_p  productos%ROWTYPE;
  v_f  jsonb;
  v_r  text;
  v_c  text;
  v_n  jsonb := '{"creadas":0,"actualizadas":0,"desactivadas":0}';
BEGIN
  SELECT * INTO v_p FROM productos WHERE id = p_padre AND tenant_id = v_t AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_p.producto_padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el producto no existe o es una variante' USING ERRCODE = '22023';
  END IF;
  IF v_p.controla_existencias THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: quita «Lleva existencias» del producto antes de darle tallas y colores' USING ERRCODE = '22023';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: variantes mal formadas' USING ERRCODE = '22023';
  END IF;
  IF p_sucursal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de tu negocio' USING ERRCODE = '22023';
  END IF;

  IF v_p.variante_ejes IS DISTINCT FROM p_ejes THEN
    UPDATE productos SET variante_ejes = p_ejes, updated_at = now() WHERE id = p_padre RETURNING * INTO v_p;
  END IF;

  BEGIN
    FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
      v_r := _guardar_variante(v_t, v_p, v_f, p_sucursal);
      v_n := jsonb_set(v_n, ARRAY[v_r || 's'], to_jsonb((v_n->>(v_r || 's'))::int + 1));
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', _mensaje_unico_producto(v_c) USING ERRCODE = '22023';
  END;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION guardar_variantes(uuid, text[], jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_variantes(uuid, text[], jsonb, uuid) TO authenticated, service_role;
```

Nota para quien implementa: el bloque `BEGIN … EXCEPTION` deshace las filas de ese bloque, pero el `RAISE` que sigue aborta toda la llamada, así que no queda nada a medias. Así lo exige el caso 3h.

- [ ] **Step 4: Correrlo y verlo pasar, con los smokes de la entrega 1 y del catálogo**

Run: `cd desktop && npm run smokes -- smoke_catalogo_tienda.sql smoke_existencias_producto.sql smoke_menus.sql smoke_combos.sql smoke_recetas.sql`
Esperado: `✅ 5/5 smokes en verde`.

Ponderación de EAN-13: con los 12 dígitos contados desde la izquierda, las posiciones impares van ×1 y las pares ×3. `400638133393 → 1` es el ejemplo clásico. En `750100000000 → 5`: 7 + 5·3 + 0 + 1·3 = 25.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0190_catalogo_tienda.sql supabase/scripts/smoke_catalogo_tienda.sql
git commit -m "feat(retail): reglas de variantes, codigos internos y guardar_variantes (0190 §1-§3)"
```

---

### Task 2: Migración 0190 §4: `importar_catalogo_tienda`

**Files:**
- Modify: `supabase/migrations/0190_catalogo_tienda.sql` (agregar §4 al final)
- Modify: `supabase/scripts/smoke_catalogo_tienda.sql` (bloque 4)

**Interfaces:**
- Consumes: `_guardar_variante`, `_mensaje_unico_producto`, `_siguiente_codigo_interno`, `_existencias_puede_escribir` (Tarea 1).
- Produces: `importar_catalogo_tienda(p_filas jsonb, p_sucursal uuid DEFAULT NULL) RETURNS jsonb` → `{"categorias": int, "productos": int, "variantes_creadas": int, "actualizados": int}`. Cada `p_filas[i]` es `{"linea": int, "categoria": text, "producto": text, "ejes": text[], "valores": {…}, "sku": text, "codigo_barras"?: text, "generar_codigo"?: bool, "precio": number, "costo"?: number, "existencia"?: number}`. `ejes` vacío = producto sin variantes. Todo o nada. El error dice `línea N:`.

- [ ] **Step 1: Agregar el bloque 4 al smoke (antes de `ROLLBACK;`)**

```sql
-- 4) Importar: crea categorías, padres, hijas y productos sueltos; reimportar actualiza sin duplicar
--    ni volver a sumar existencia; una línea mala no deja nada.
DO $$
DECLARE
  v_t   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_r   jsonb; v_n int; v_hija uuid;
  v_csv jsonb := jsonb_build_array(
    jsonb_build_object('linea', 2, 'categoria', 'Pantalones', 'producto', 'Jeans Slim', 'ejes', jsonb_build_array('Talla','Color'),
                       'valores', jsonb_build_object('Talla','30','Color','Azul'), 'sku', 'JNS-30-AZU', 'generar_codigo', true,
                       'precio', 799, 'costo', 350, 'existencia', 4),
    jsonb_build_object('linea', 3, 'categoria', 'Pantalones', 'producto', 'Jeans Slim', 'ejes', jsonb_build_array('Talla','Color'),
                       'valores', jsonb_build_object('Talla','32','Color','Azul'), 'sku', 'JNS-32-AZU', 'codigo_barras', '7501000000004',
                       'precio', 799, 'existencia', 2),
    jsonb_build_object('linea', 4, 'categoria', 'Accesorios', 'producto', 'Gorra', 'ejes', '[]'::jsonb, 'valores', '{}'::jsonb,
                       'sku', 'GOR-001', 'generar_codigo', true, 'precio', 249, 'existencia', 10));
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);
  v_r := importar_catalogo_tienda(v_csv, v_suc);
  IF (v_r->>'categorias')::int <> 2 OR (v_r->>'productos')::int <> 2 OR (v_r->>'variantes_creadas')::int <> 2 THEN
    RAISE EXCEPTION '4a: %', v_r; END IF;
  SELECT id INTO v_hija FROM productos WHERE tenant_id = v_t AND codigo_interno = 'JNS-30-AZU' AND deleted_at IS NULL;
  IF (SELECT nombre FROM productos WHERE id = v_hija) <> 'Jeans Slim 30 Azul' THEN RAISE EXCEPTION '4b: nombre'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_hija) <> 4 THEN RAISE EXCEPTION '4b: existencia'; END IF;
  IF (SELECT controla_existencias FROM productos WHERE tenant_id = v_t AND codigo_interno = 'GOR-001') IS NOT TRUE THEN
    RAISE EXCEPTION '4b: el producto suelto lleva existencias'; END IF;

  -- 4c) Reimportar con otro precio: actualiza, no duplica, no vuelve a sumar existencia.
  SELECT count(*) INTO v_n FROM productos WHERE tenant_id = v_t AND deleted_at IS NULL;
  v_r := importar_catalogo_tienda(jsonb_set(v_csv, '{0,precio}', '849'), v_suc);
  IF (SELECT count(*) FROM productos WHERE tenant_id = v_t AND deleted_at IS NULL) <> v_n THEN RAISE EXCEPTION '4c: duplicó'; END IF;
  IF (SELECT precio_base_mxn FROM productos WHERE id = v_hija) <> 849 THEN RAISE EXCEPTION '4c: no actualizó el precio'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_hija) <> 4 THEN RAISE EXCEPTION '4c: volvió a sumar'; END IF;

  -- 4d) Una línea mala (ejes distintos para el mismo padre) aborta todo y nombra la línea.
  SELECT count(*) INTO v_n FROM productos WHERE tenant_id = v_t;
  BEGIN
    PERFORM importar_catalogo_tienda(jsonb_build_array(
      jsonb_build_object('linea', 2, 'categoria', 'Nueva', 'producto', 'Sudadera', 'ejes', jsonb_build_array('Talla'),
                         'valores', jsonb_build_object('Talla','M'), 'sku', 'SUD-M', 'precio', 599),
      jsonb_build_object('linea', 3, 'categoria', 'Pantalones', 'producto', 'Jeans Slim', 'ejes', jsonb_build_array('Talla'),
                         'valores', jsonb_build_object('Talla','34'), 'sku', 'JNS-34', 'precio', 799)), v_suc);
    RAISE EXCEPTION '4d: debía rechazar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: línea 3:%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM productos WHERE tenant_id = v_t) <> v_n THEN RAISE EXCEPTION '4d: dejó productos a medias'; END IF;
  IF EXISTS (SELECT 1 FROM categorias WHERE tenant_id = v_t AND nombre = 'Nueva') THEN RAISE EXCEPTION '4d: dejó la categoría'; END IF;
  RAISE NOTICE '4 importar OK';
END $$;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_catalogo_tienda.sql`
Esperado: `❌` con `function importar_catalogo_tienda(jsonb, uuid) does not exist`.

- [ ] **Step 3: La §4**

```sql
-- ── §4 Importar el catálogo de una tienda ────────────────────────────────────
-- Todo o nada. El admin ya parseó y validó cada línea (importar-tienda.ts); aquí se resuelve contra
-- la base. Un SKU que ya existe se actualiza; la existencia solo cuenta al crear (decisión del
-- plan de la entrega 2: un CSV viejo no pisa un conteo).
CREATE OR REPLACE FUNCTION importar_catalogo_tienda(p_filas jsonb, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_f      jsonb;
  v_linea  text;
  v_cat    uuid;
  v_ejes   text[];
  v_padre  productos%ROWTYPE;
  v_prod   productos%ROWTYPE;
  v_fila   jsonb;
  v_q      numeric;
  v_c      text;
  v_r      text;
  v_cats   int := 0; v_prods int := 0; v_vars int := 0; v_act int := 0;
BEGIN
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el archivo viene vacío' USING ERRCODE = '22023';
  END IF;
  IF p_sucursal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de tu negocio' USING ERRCODE = '22023';
  END IF;

  FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
    v_linea := COALESCE(v_f->>'linea', '?');
    BEGIN
      IF NULLIF(btrim(v_f->>'categoria'), '') IS NULL OR NULLIF(btrim(v_f->>'producto'), '') IS NULL
         OR NULLIF(btrim(v_f->>'sku'), '') IS NULL THEN
        RAISE EXCEPTION 'faltan categoría, producto o SKU';
      END IF;
      SELECT COALESCE(array_agg(e), '{}') INTO v_ejes FROM jsonb_array_elements_text(COALESCE(v_f->'ejes', '[]')) e;

      SELECT id INTO v_cat FROM categorias
       WHERE tenant_id = v_t AND deleted_at IS NULL AND lower(btrim(nombre)) = lower(btrim(v_f->>'categoria')) LIMIT 1;
      IF v_cat IS NULL THEN
        INSERT INTO categorias (tenant_id, nombre) VALUES (v_t, btrim(v_f->>'categoria')) RETURNING id INTO v_cat;
        v_cats := v_cats + 1;
      END IF;

      v_fila := jsonb_build_object('valores', v_f->'valores', 'codigo_interno', v_f->'sku', 'codigo_barras', v_f->'codigo_barras',
                                   'generar_codigo', v_f->'generar_codigo', 'precio', v_f->'precio', 'costo', v_f->'costo',
                                   'existencia_inicial', v_f->'existencia');

      -- ¿El SKU ya existe? Entonces es esa fila la que se actualiza.
      SELECT * INTO v_prod FROM productos
       WHERE tenant_id = v_t AND deleted_at IS NULL AND controla_existencias AND codigo_interno = btrim(v_f->>'sku');

      IF cardinality(v_ejes) = 0 THEN
        -- Producto sin variantes que lleva existencias.
        IF v_prod.producto_padre_id IS NOT NULL THEN
          RAISE EXCEPTION 'el SKU % es de una variante; para esa prenda llena Ejes y Valores', v_f->>'sku';
        END IF;
        IF v_prod.id IS NOT NULL THEN
          UPDATE productos SET nombre = btrim(v_f->>'producto'), categoria_id = v_cat,
                 precio_base_mxn = (v_fila->>'precio')::numeric, costo_mxn = NULLIF(v_fila->>'costo', '')::numeric,
                 codigo_barras = COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''), codigo_barras), updated_at = now()
           WHERE id = v_prod.id;
          v_act := v_act + 1;
        ELSE
          INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras, controla_existencias)
          VALUES (v_t, btrim(v_f->>'producto'), v_cat, (v_fila->>'precio')::numeric, NULLIF(v_fila->>'costo', '')::numeric,
                  btrim(v_f->>'sku'),
                  COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''),
                           CASE WHEN COALESCE((v_f->>'generar_codigo')::boolean, false) THEN _siguiente_codigo_interno(v_t) END),
                  true)
          RETURNING * INTO v_prod;
          v_prods := v_prods + 1;
          v_q := NULLIF(v_f->>'existencia', '')::numeric;
          IF v_q > 0 THEN
            IF p_sucursal IS NULL THEN RAISE EXCEPTION 'elige la sucursal de la existencia'; END IF;
            INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, usuario_id)
            VALUES (v_t, p_sucursal, v_prod.id, 'ENTRADA', v_q, v_prod.costo_mxn, 'Existencia inicial (importación)', auth.uid());
          END IF;
        END IF;
      ELSE
        -- Prenda con variantes: el padre se busca por nombre entre los padres vivos.
        SELECT * INTO v_padre FROM productos
         WHERE tenant_id = v_t AND deleted_at IS NULL AND variante_ejes IS NOT NULL
           AND lower(btrim(nombre)) = lower(btrim(v_f->>'producto')) LIMIT 1;
        IF v_padre.id IS NULL THEN
          INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes)
          VALUES (v_t, btrim(v_f->>'producto'), v_cat, (v_fila->>'precio')::numeric, v_ejes)
          RETURNING * INTO v_padre;
          v_prods := v_prods + 1;
        ELSIF v_padre.variante_ejes IS DISTINCT FROM v_ejes THEN
          RAISE EXCEPTION '«%» ya existe con ejes %', v_padre.nombre, array_to_string(v_padre.variante_ejes, ', ');
        END IF;
        IF v_prod.id IS NOT NULL THEN
          IF v_prod.producto_padre_id IS DISTINCT FROM v_padre.id THEN
            RAISE EXCEPTION 'el SKU % ya es de otro producto', v_f->>'sku';
          END IF;
          v_fila := v_fila || jsonb_build_object('id', v_prod.id, 'existencia_inicial', NULL,
                                                 'codigo_barras', COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''), v_prod.codigo_barras));
        END IF;
        v_r := _guardar_variante(v_t, v_padre, v_fila, p_sucursal);
        IF v_r = 'creada' THEN v_vars := v_vars + 1; ELSE v_act := v_act + 1; END IF;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
        RAISE EXCEPTION 'DATOS_INVALIDOS: línea %: %', v_linea, replace(_mensaje_unico_producto(v_c), 'DATOS_INVALIDOS: ', '') USING ERRCODE = '22023';
      WHEN OTHERS THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: línea %: %', v_linea, regexp_replace(SQLERRM, '^(DATOS_INVALIDOS|VARIANTE_INVALIDA): ', '') USING ERRCODE = '22023';
    END;
    v_prod := NULL; v_padre := NULL;
  END LOOP;

  RETURN jsonb_build_object('categorias', v_cats, 'productos', v_prods, 'variantes_creadas', v_vars, 'actualizados', v_act);
END;
$$;
REVOKE ALL ON FUNCTION importar_catalogo_tienda(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION importar_catalogo_tienda(jsonb, uuid) TO authenticated, service_role;
```

Nota: un `SIN_PERMISO` o `MODULO_APAGADO` sale antes del bucle, sin número de línea. Está bien: no es culpa de ninguna línea.

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `cd desktop && npm run smokes -- smoke_catalogo_tienda.sql smoke_existencias_producto.sql smoke_eliminar_tenant.sql`
Esperado: `✅ 3/3 smokes en verde`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0190_catalogo_tienda.sql supabase/scripts/smoke_catalogo_tienda.sql
git commit -m "feat(retail): importar el catalogo de una tienda, todo o nada (0190 §4)"
```

---

### Task 3: El pull de la caja suelta las llaves únicas de `productos`

**Files:**
- Modify: `desktop/src/sync-pull.mjs`
- Modify: `desktop/src/sync-pull.test.mjs`

**Interfaces:**
- Produces: `soltarClavesProductos(client, filas)`, llamada justo antes del upsert de `productos` dentro de `pullSnapshot`.

- [ ] **Step 1: La prueba que falla** (al final de `desktop/src/sync-pull.test.mjs`)

```js
test("antes de bajar productos se sueltan sus llaves únicas (intercambio de códigos entre variantes)", async () => {
  // La nube intercambió el código de barras de dos variantes. El pull aplica productos fila por
  // fila en réplica y los índices únicos sí se revisan: la primera chocaba con la segunda todavía
  // vieja y el ROLLBACK se llevaba todo el pull, en cada ciclo.
  const { client, pool } = clienteFalso();
  const A = "aaaaaaaa-0000-0000-0000-0000000000a1";
  const B = "bbbbbbbb-0000-0000-0000-0000000000b2";
  await pullSnapshot(pool, { productos: [{ id: A, nombre: "Polo M" }, { id: B, nombre: "Polo G" }] });
  const iSoltar = client.consultas.findIndex((c) => /UPDATE productos SET deleted_at/.test(c.sql));
  const iUpsert = client.consultas.findIndex((c) => c.sql.includes('INSERT INTO public."productos"'));
  assert.ok(iSoltar >= 0, "debía soltar las llaves de los productos que bajan");
  assert.ok(iSoltar < iUpsert, "se sueltan ANTES del upsert");
  assert.deepEqual(client.consultas[iSoltar].params[0].sort(), [A, B].sort());
});
```

- [ ] **Step 2: Verla fallar**

Run: `node --test desktop/src/sync-pull.test.mjs`
Esperado: falla `debía soltar las llaves de los productos que bajan`.

- [ ] **Step 3: El arreglo** (en `desktop/src/sync-pull.mjs`, junto a `liberarClavesUnicasClientes`)

```js
/**
 * productos (0189): sus índices únicos (variante por padre, código de barras y SKU con existencias)
 * se revisan aun en réplica, y el snapshot trae las filas sin orden: si la nube intercambió el
 * código de dos variantes, la primera que entra choca con la segunda todavía vieja. Antes del
 * upsert se marcan como borradas las copias locales de las filas que van a bajar y que participan
 * en esos índices; el upsert les devuelve el `deleted_at` de la nube en la misma transacción.
 */
async function soltarClavesProductos(client, filas) {
  const ids = filas.map((f) => f?.id).filter(Boolean);
  if (!ids.length) return;
  await client.query(
    "UPDATE productos SET deleted_at = COALESCE(deleted_at, now()) WHERE id = ANY($1::uuid[]) AND (producto_padre_id IS NOT NULL OR controla_existencias)",
    [ids]);
}
```

Y en el `else` de `pullSnapshot` que hoy hace `await reconciliarCatalogo(client, t, filas, log);`:

```js
      } else {
        await reconciliarCatalogo(client, t, filas, log);
        if (t === "productos") await soltarClavesProductos(client, filas);
      }
```

- [ ] **Step 4: Verla pasar, con el resto del archivo**

Run: `node --test desktop/src/sync-pull.test.mjs`
Esperado: todas en verde.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/sync-pull.mjs desktop/src/sync-pull.test.mjs
git commit -m "fix(caja): el pull suelta las llaves unicas de productos antes de bajarlos"
```

---

### Task 4: `RETAIL` y `existencias` en TypeScript

**Files:**
- Modify: `packages/db/src/operacion.ts`
- Modify: `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts`
- Modify: `apps/admin/app/lib/operacion.ts`

**Interfaces:**
- Produces: `CodigoGiro` incluye `"RETAIL"` (`ofrecido: false`, nombre `"Tienda de ropa o calzado"`); `CodigoOperacion` incluye `"existencias"`; `moduloActivo(m, "existencias")` es `false` si falta la llave; `conExistencias(m: ModulosLeidos | "error" | null): boolean` en `apps/admin/app/lib/operacion.ts`.

- [ ] **Step 1: Las pruebas que fallan** (en `operacion-catalogo.test.ts`)

En el `describe("moduloActivo")`, en la prueba «salvo eventos», agrega:

```ts
    expect(moduloActivo({}, "existencias")).toBe(false);
    expect(moduloActivo(null, "existencias")).toBe(false);
    expect(moduloActivo({ existencias: true }, "existencias")).toBe(true);
```

En `describe("catálogo")`: la lista de giros ofrecidos **no cambia** (RETAIL no se ofrece todavía). Agrega `expect(nombreGiro("RETAIL")).toBe("Tienda de ropa o calzado");`. La prueba de módulos pasa a «once módulos visibles» y su lista termina en `"cuentas_barra", "existencias"`.

Y al final del archivo:

```ts
import { conExistencias } from "../operacion";

describe("conExistencias", () => {
  it("solo con el módulo efectivo; mientras carga o si falló, no", () => {
    expect(conExistencias(null)).toBe(false);
    expect(conExistencias("error")).toBe(false);
    expect(conExistencias({ permitidos: {}, efectivos: {} })).toBe(false);
    expect(conExistencias({ permitidos: {}, efectivos: { existencias: true } })).toBe(true);
  });
});
```

- [ ] **Step 2: Verlas fallar**

Run: `pnpm --filter @vim/admin test -- operacion-catalogo`
Esperado: fallan `existencias` y `conExistencias`.

- [ ] **Step 3: El código**

En `packages/db/src/operacion.ts`:

```ts
export type CodigoGiro =
  | "QUICK_SERVICE" | "FULL_SERVICE" | "TAQUERIA" | "CAFETERIA" | "BAR" | "DARK_KITCHEN" | "FOODTRUCK"
  | "RETAIL" | "CAFE_BAR" | "ENTERPRISE";
```

En `GIROS`, después de FOODTRUCK:

```ts
  // Tienda (ADR 0037): existe en la base, pero no se asigna hasta la entrega 5 del giro.
  { codigo: "RETAIL", nombre: "Tienda de ropa o calzado", ofrecido: false },
```

`CodigoOperacion` suma `| "existencias"`. En `OPERACION`, al final:

```ts
  { codigo: "existencias", nombre: "Existencias", descripcion: "Tallas y colores, código de barras y cuánto queda de cada prenda por sucursal." },
```

`moduloActivo`:

```ts
/**
 * ¿Está encendido? Lo que diga la base manda. Si la llave no llegó (caja con directivas viejas,
 * todavía cargando) se enseña lo de siempre: todo, menos eventos, cuentas en barra y existencias,
 * que antes nadie veía (eventos solo un food truck; existencias es de tienda, ADR 0037).
 */
export function moduloActivo(modulos: Record<string, boolean> | null | undefined, codigo: CodigoOperacion): boolean {
  const v = modulos?.[codigo];
  return typeof v === "boolean" ? v : codigo !== "eventos" && codigo !== "cuentas_barra" && codigo !== "existencias";
}
```

En `apps/admin/app/lib/operacion.ts`, agrega a `RUTA_DE_MODULO`:

```ts
  ["/catalogo/importar-tienda", "existencias"],
  ["/catalogo/etiquetas", "existencias"],
```

y la función:

```ts
/** ¿Se enseña lo de tienda? Solo con el módulo efectivo: mientras carga o si falló, un restaurante no ve nada nuevo. */
export const conExistencias = (m: ModulosLeidos | "error" | null): boolean =>
  m !== null && m !== "error" && moduloActivo(m.efectivos, "existencias");
```

- [ ] **Step 4: Verlas pasar, y el tipado de admin y platform**

Run: `pnpm --filter @vim/admin test -- operacion-catalogo` y `pnpm --filter @vim/admin --filter @vim/platform typecheck`
Esperado: verde. Si `/platform` tiene un `Record<CodigoGiro, …>` exhaustivo, agrégale `RETAIL` con el mismo nombre.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/operacion.ts apps/admin/app/lib/__tests__/operacion-catalogo.test.ts apps/admin/app/lib/operacion.ts
git commit -m "feat(retail): giro RETAIL y modulo existencias en TypeScript"
```

---

### Task 5: Lógica pura: EAN-13, matriz de variantes y CSV de tienda

**Files:**
- Create: `apps/admin/app/lib/codigo-barras.ts`, `apps/admin/app/lib/__tests__/codigo-barras.test.ts`
- Create: `apps/admin/app/lib/variantes.ts`, `apps/admin/app/lib/__tests__/variantes.test.ts`
- Create: `apps/admin/app/lib/importar-tienda.ts`, `apps/admin/app/lib/__tests__/importar-tienda.test.ts`
- Modify: `apps/admin/app/lib/importar-menu.ts` (solo `export function dividirCSV`)

**Interfaces:**
- Produces:
  - `digitoEan13(doce: string): string`, `esEan13(c: string): boolean`, `normalizarEan(c: string): string | null` (UPC-A de 12 dígitos → EAN-13 con 0 adelante; si no es EAN-13 válido, `null`), `modulosEan13(trece: string): string` (95 caracteres `"1"`/`"0"`).
  - `type FilaVariante = { id?: string; valores: Record<string, string>; codigo_interno: string; codigo_barras: string; generar_codigo: boolean; precio: string; costo: string; existencia_inicial: string; activa: boolean }`.
  - `armarMatriz(ejes: { nombre: string; valores: string[] }[], existentes: FilaVariante[], precioBase: string): FilaVariante[]`: el producto cartesiano en orden de ejes. Reutiliza la fila existente con los mismos valores. Las existentes que ya no caben quedan al final con `activa: false`.
  - `claveValores(v: Record<string,string>): string`.
  - `parsearValoresEje(texto: string): string[]` ("CH, M, G" → ["CH","M","G"], sin vacíos ni repetidos sin importar mayúsculas).
  - `type FilaImport = { linea: number; categoria: string; producto: string; ejes: string[]; valores: Record<string,string>; sku: string; codigo_barras: string; generar_codigo: boolean; precio: number; costo: number | null; existencia: number | null }`.
  - `parsearCsvTienda(texto: string, generarFaltantes: boolean): { filas: FilaImport[]; errores: { linea: number; motivo: string }[] }`.
  - `PLANTILLA_TIENDA: string`.

- [ ] **Step 1: Las pruebas que fallan**

`apps/admin/app/lib/__tests__/codigo-barras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { digitoEan13, esEan13, modulosEan13, normalizarEan } from "../codigo-barras";

describe("EAN-13", () => {
  it("dígito verificador", () => {
    expect(digitoEan13("400638133393")).toBe("1");
    expect(digitoEan13("200000000001")).toBe("5"); // 2·1 + 1·3 = 5 → (10 − 5) % 10
  });
  it("valida y normaliza", () => {
    expect(esEan13("4006381333931")).toBe(true);
    expect(esEan13("4006381333932")).toBe(false);
    expect(normalizarEan(" 4006381333931 ")).toBe("4006381333931");
    expect(normalizarEan("036000291452")).toBe("0036000291452"); // UPC-A
    expect(normalizarEan("POL-M-NEG")).toBeNull();
  });
  it("95 módulos con guardas en los extremos y al centro", () => {
    const m = modulosEan13("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(92)).toBe("101");
  });
});
```

`apps/admin/app/lib/__tests__/variantes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { armarMatriz, claveValores, parsearValoresEje, type FilaVariante } from "../variantes";

describe("variantes", () => {
  it("valores de un eje: separa por coma, quita vacíos y repetidos", () => {
    expect(parsearValoresEje(" CH, M ,, m, G ")).toEqual(["CH", "M", "G"]);
  });
  it("arma el producto cartesiano en orden de ejes con el precio base", () => {
    const m = armarMatriz([{ nombre: "Talla", valores: ["M", "G"] }, { nombre: "Color", valores: ["Negra", "Blanca"] }], [], "349");
    expect(m.map((f) => claveValores(f.valores))).toEqual([
      claveValores({ Talla: "M", Color: "Negra" }), claveValores({ Talla: "M", Color: "Blanca" }),
      claveValores({ Talla: "G", Color: "Negra" }), claveValores({ Talla: "G", Color: "Blanca" }),
    ]);
    expect(m.every((f) => f.precio === "349" && f.activa && f.generar_codigo)).toBe(true);
  });
  it("conserva las existentes y desactiva las que ya no caben", () => {
    const vieja: FilaVariante = { id: "x", valores: { Talla: "CH" }, codigo_interno: "A", codigo_barras: "200", generar_codigo: false,
      precio: "300", costo: "", existencia_inicial: "", activa: true };
    const sigue: FilaVariante = { ...vieja, id: "y", valores: { Talla: "M" }, precio: "310" };
    const m = armarMatriz([{ nombre: "Talla", valores: ["M", "G"] }], [vieja, sigue], "349");
    expect(m.find((f) => f.id === "y")?.precio).toBe("310");
    expect(m.find((f) => f.valores.Talla === "G")?.id).toBeUndefined();
    expect(m.at(-1)).toMatchObject({ id: "x", activa: false });
  });
});
```

`apps/admin/app/lib/__tests__/importar-tienda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLANTILLA_TIENDA, parsearCsvTienda } from "../importar-tienda";

describe("CSV de tienda", () => {
  it("la plantilla se lee sin errores", () => {
    const r = parsearCsvTienda(PLANTILLA_TIENDA, true);
    expect(r.errores).toEqual([]);
    expect(r.filas.length).toBeGreaterThan(0);
  });
  it("variantes, producto suelto, precios con $ y separadores distintos", () => {
    const r = parsearCsvTienda(
      "Categoría;Producto;Ejes;Valores;SKU;Código de barras;Precio;Costo;Existencia\n" +
      "Playeras;\"Polo, clásica\";Talla|Color;M|Negra;POL-M;;$349.00;150;5\n" +
      "\n" +
      "Accesorios;Gorra;;;GOR-1;4006381333931;249;;\n", false);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ linea: 2, producto: "Polo, clásica", ejes: ["Talla", "Color"],
      valores: { Talla: "M", Color: "Negra" }, sku: "POL-M", precio: 349, costo: 150, existencia: 5, generar_codigo: false });
    expect(r.filas[1]).toMatchObject({ linea: 4, ejes: [], valores: {}, codigo_barras: "4006381333931", costo: null, existencia: null });
  });
  it("errores por renglón con su número", () => {
    const r = parsearCsvTienda(
      "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\n" +
      "Playeras,Polo,Talla|Color,M,POL-M,,349,,\n" +       // valores no cuadran con ejes
      "Playeras,Polo,Talla,G,,,349,,\n" +                  // sin SKU
      "Playeras,Polo,Talla,CH,POL-CH,123,349,,\n" +        // código que no es EAN-13 → sí se acepta como texto
      "Playeras,Polo,Talla,XG,POL-XG,,abc,,\n" +           // precio
      "Playeras,Polo,Talla,XL,pol-ch,,349,,\n", true);     // SKU repetido en el archivo (sin importar mayúsculas)
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3, 5, 6]);
    expect(r.filas.map((f) => f.sku)).toEqual(["POL-CH"]);
  });
});
```

- [ ] **Step 2: Verlas fallar**

Run: `pnpm --filter @vim/admin test -- codigo-barras variantes importar-tienda`
Esperado: no encuentra los módulos.

- [ ] **Step 3: El código**

`apps/admin/app/lib/codigo-barras.ts`:

```ts
// EAN-13 sin librerías (decisión de la entrega 2: el repo evita dependencias). Lo usan las etiquetas
// y la validación de lo que el dueño escribe. Otros formatos (Code 128) cuando un cliente los pida.

const PESOS = (i: number) => (i % 2 === 0 ? 1 : 3);

export function digitoEan13(doce: string): string {
  const s = [...doce].reduce((a, d, i) => a + Number(d) * PESOS(i), 0);
  return String((10 - (s % 10)) % 10);
}

export const esEan13 = (c: string): boolean => /^\d{13}$/.test(c) && digitoEan13(c.slice(0, 12)) === c[12];

/** EAN-13 válido tal cual, o UPC-A (12 dígitos) con un 0 adelante. Cualquier otra cosa: null. */
export function normalizarEan(c: string): string | null {
  const t = c.trim();
  const trece = /^\d{12}$/.test(t) ? "0" + t : t;
  return esEan13(trece) ? trece : null;
}

// Patrones L, G y R por dígito, y la paridad de la primera mitad según el primer dígito.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => [...p].reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const PARIDAD = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Las 95 barras (1 = negra) de un EAN-13 ya válido. */
export function modulosEan13(trece: string): string {
  const d = [...trece].map(Number);
  const par = PARIDAD[d[0]];
  const izq = d.slice(1, 7).map((n, i) => (par[i] === "L" ? L[n] : G[n])).join("");
  const der = d.slice(7).map((n) => R[n]).join("");
  return "101" + izq + "01010" + der + "101";
}
```

`apps/admin/app/lib/variantes.ts`:

```ts
"use client";
import { supabase } from "./supabase";

export type FilaVariante = {
  id?: string;
  valores: Record<string, string>;
  codigo_interno: string;
  codigo_barras: string;
  generar_codigo: boolean;
  precio: string;
  costo: string;
  existencia_inicial: string;
  activa: boolean;
};
export type Eje = { nombre: string; valores: string[] };

export const claveValores = (v: Record<string, string>): string =>
  JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]));

export function parsearValoresEje(texto: string): string[] {
  const vistos = new Set<string>();
  return texto.split(",").map((s) => s.trim()).filter((s) => {
    const k = s.toLowerCase();
    if (!s || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** El producto cartesiano de los ejes. Lo que ya existía se conserva; lo que ya no cabe se desactiva. */
export function armarMatriz(ejes: Eje[], existentes: FilaVariante[], precioBase: string): FilaVariante[] {
  const combos = ejes.reduce<Record<string, string>[]>(
    (acc, e) => acc.flatMap((c) => e.valores.map((v) => ({ ...c, [e.nombre]: v }))), [{}]);
  const porClave = new Map(existentes.map((f) => [claveValores(f.valores), f]));
  const nuevas = ejes.length === 0 ? [] : combos.map((valores) => {
    const k = claveValores(valores);
    const vieja = porClave.get(k);
    porClave.delete(k);
    return vieja ? { ...vieja, activa: true } : {
      valores, codigo_interno: "", codigo_barras: "", generar_codigo: true,
      precio: precioBase, costo: "", existencia_inicial: "", activa: true,
    };
  });
  const sobran = [...porClave.values()].filter((f) => f.id).map((f) => ({ ...f, activa: false }));
  return [...nuevas, ...sobran];
}

type FilaBase = {
  id: string; variante_valores: Record<string, string>; codigo_interno: string | null; codigo_barras: string | null;
  precio_base_mxn: number; costo_mxn: number | null; deleted_at: string | null;
};

export async function listarVariantes(padreId: string): Promise<FilaVariante[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("id, variante_valores, codigo_interno, codigo_barras, precio_base_mxn, costo_mxn, deleted_at")
    .eq("producto_padre_id", padreId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaBase[]).map((f) => ({
    id: f.id, valores: f.variante_valores, codigo_interno: f.codigo_interno ?? "", codigo_barras: f.codigo_barras ?? "",
    generar_codigo: false, precio: String(f.precio_base_mxn), costo: f.costo_mxn == null ? "" : String(f.costo_mxn),
    existencia_inicial: "", activa: f.deleted_at == null,
  }));
}

export async function guardarVariantes(padreId: string, ejes: string[], filas: FilaVariante[], sucursalId: string | null): Promise<void> {
  const { error } = await supabase.rpc("guardar_variantes", {
    p_padre: padreId,
    p_ejes: ejes,
    p_sucursal: sucursalId,
    // Una fila nueva que se quitó antes de guardar no se manda: crearía una variante ya borrada.
    p_filas: filas.filter((f) => f.id || f.activa).map((f) => ({
      id: f.id ?? null, valores: f.valores, codigo_interno: f.codigo_interno, codigo_barras: f.codigo_barras,
      generar_codigo: f.generar_codigo, precio: f.precio, costo: f.costo, activa: f.activa,
      existencia_inicial: f.id ? null : f.existencia_inicial,
    })),
  });
  if (error) throw new Error(error.message);
}

export async function generarCodigoInterno(): Promise<string> {
  const { data, error } = await supabase.rpc("generar_codigo_interno");
  if (error) throw new Error(error.message);
  return String(data);
}
```

`apps/admin/app/lib/importar-tienda.ts`:

```ts
"use client";
import { supabase } from "./supabase";
import { dividirCSV } from "./importar-menu";

export type FilaImport = {
  linea: number; categoria: string; producto: string; ejes: string[]; valores: Record<string, string>;
  sku: string; codigo_barras: string; generar_codigo: boolean; precio: number; costo: number | null; existencia: number | null;
};
export type ParseTienda = { filas: FilaImport[]; errores: { linea: number; motivo: string }[] };

export const PLANTILLA_TIENDA = `Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia
Playeras,Playera Polo,Talla|Color,M|Negra,POL-M-NEG,,349,150,5
Playeras,Playera Polo,Talla|Color,G|Negra,POL-G-NEG,,349,150,3
Accesorios,Gorra,,,GOR-001,,249,90,10`;

const numero = (s: string): number | null => {
  const t = s.replace(/[$\s,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Columnas: categoría, producto, ejes (Talla|Color), valores (M|Negra), SKU, código de barras, precio, costo, existencia. */
export function parsearCsvTienda(texto: string, generarFaltantes: boolean): ParseTienda {
  const filas: FilaImport[] = [];
  const errores: ParseTienda["errores"] = [];
  const skus = new Set<string>();
  texto.split(/\r?\n/).forEach((raw, i) => {
    const linea = i + 1;
    if (!raw.trim()) return;
    const c = dividirCSV(raw);
    if (i === 0 && /categor/i.test(c[0] ?? "")) return;
    const [categoria = "", producto = "", ejesTxt = "", valoresTxt = "", sku = "", barras = "", precioTxt = "", costoTxt = "", existTxt = ""] = c;
    const mal = (motivo: string) => errores.push({ linea, motivo });
    if (!categoria || !producto || !sku) return void mal("Faltan categoría, producto o SKU");
    const ejes = ejesTxt ? ejesTxt.split("|").map((s) => s.trim()) : [];
    const vals = valoresTxt ? valoresTxt.split("|").map((s) => s.trim()) : [];
    if (ejes.length !== vals.length || ejes.some((e) => !e) || vals.some((v) => !v)) {
      return void mal("Los valores no cuadran con los ejes (ej.: Talla|Color y M|Negra)");
    }
    const precio = numero(precioTxt);
    const costo = numero(costoTxt);
    const existencia = numero(existTxt);
    if (precio == null || Number.isNaN(precio) || precio < 0) return void mal(`Precio inválido: "${precioTxt}"`);
    if (Number.isNaN(costo) || (costo ?? 0) < 0 || Number.isNaN(existencia) || (existencia ?? 0) < 0) {
      return void mal("Costo o existencia inválidos");
    }
    if (skus.has(sku.toLowerCase())) return void mal(`El SKU ${sku} viene dos veces`);
    skus.add(sku.toLowerCase());
    filas.push({
      linea, categoria, producto, ejes, valores: Object.fromEntries(ejes.map((e, k) => [e, vals[k]])),
      sku, codigo_barras: barras, generar_codigo: generarFaltantes && !barras, precio, costo, existencia,
    });
  });
  return { filas, errores };
}

export type ResultadoImportTienda = { categorias: number; productos: number; variantes_creadas: number; actualizados: number };

export async function importarCatalogoTienda(filas: FilaImport[], sucursalId: string | null): Promise<ResultadoImportTienda> {
  const { data, error } = await supabase.rpc("importar_catalogo_tienda", { p_filas: filas, p_sucursal: sucursalId });
  if (error) throw new Error(error.message);
  return data as ResultadoImportTienda;
}
```

En `importar-menu.ts`, cambia `function dividirCSV` por `export function dividirCSV`.

- [ ] **Step 4: Verlas pasar**

Run: `pnpm --filter @vim/admin test -- codigo-barras variantes importar-tienda importar-formatos`
Esperado: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/codigo-barras.ts apps/admin/app/lib/variantes.ts apps/admin/app/lib/importar-tienda.ts apps/admin/app/lib/importar-menu.ts apps/admin/app/lib/__tests__/codigo-barras.test.ts apps/admin/app/lib/__tests__/variantes.test.ts apps/admin/app/lib/__tests__/importar-tienda.test.ts
git commit -m "feat(retail): EAN-13, matriz de variantes y CSV de tienda (logica pura)"
```

---

### Task 6: `catalogo.ts` lee y escribe los campos de tienda

**Files:**
- Modify: `apps/admin/app/lib/catalogo.ts`
- Create: `apps/admin/app/lib/__tests__/catalogo-tienda.test.ts`

**Interfaces:**
- Produces:
  - `Producto` suma `codigo_barras: string | null`, `costo_mxn: number | null`, `controla_existencias: boolean`, `variante_ejes: string[] | null`, `variantes: number`.
  - `productoSchema` suma `codigo_barras` (opcional, ≤ 50) y `costo_mxn` (número ≥ 0 opcional).
  - `crearProducto(input, opciones)` acepta `opciones.tienda?: { codigo_barras: string; costo_mxn: number | null; controla_existencias: boolean }`; `actualizarProducto(id, input, tienda?)` igual.
  - `listarProductos()` **esconde las hijas** y llena `variantes`.

- [ ] **Step 1: La prueba que falla**

`apps/admin/app/lib/__tests__/catalogo-tienda.test.ts` (mismo patrón de mock que `modulos.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ llamadas: [] as { tabla: string; op: string; args: unknown[] }[] }));
vi.mock("../supabase", () => {
  const cadena = (tabla: string) => {
    const q: Record<string, unknown> = {};
    const reg = (op: string) => (...args: unknown[]) => { h.llamadas.push({ tabla, op, args }); return q; };
    for (const op of ["select", "is", "not", "eq", "order", "limit", "insert", "update"]) q[op] = reg(op);
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: { id: "nuevo" }, error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => cadena(t) } };
});
vi.mock("../datos", () => ({ tenantId: async () => "t1", borrarSuave: async () => undefined }));

import { crearProducto, listarProductos } from "../catalogo";

const base = {
  nombre: "Gorra", categoria_id: "11111111-1111-4111-8111-111111111111", precio_base_mxn: 249, descripcion: "",
  codigo_interno: "GOR-1", estado: "ACTIVO" as const, agotado: false, visible_en_pos: true, marca_virtual_id: "",
  area_cocina_id: "", clave_sat: "", tasa_iva: 16, iva_incluido_en_precio: true, codigo_barras: "", costo_mxn: undefined,
};

describe("catálogo con tienda", () => {
  beforeEach(() => { h.llamadas.length = 0; });

  it("la lista esconde las variantes (hijas)", async () => {
    await listarProductos();
    expect(h.llamadas.some((l) => l.tabla === "productos" && l.op === "is" && l.args[0] === "producto_padre_id" && l.args[1] === null)).toBe(true);
  });

  it("un restaurante crea exactamente lo de antes (sin campos de tienda)", async () => {
    await crearProducto(base);
    const ins = h.llamadas.find((l) => l.op === "insert")!.args[0] as Record<string, unknown>;
    expect(ins).not.toHaveProperty("codigo_barras");
    expect(ins).not.toHaveProperty("controla_existencias");
  });

  it("con tienda escribe código de barras, costo y existencias", async () => {
    await crearProducto(base, { tienda: { codigo_barras: "4006381333931", costo_mxn: 90, controla_existencias: true } });
    const ins = h.llamadas.find((l) => l.op === "insert")!.args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({ codigo_barras: "4006381333931", costo_mxn: 90, controla_existencias: true });
  });
});
```

- [ ] **Step 2: Verla fallar**

Run: `pnpm --filter @vim/admin test -- catalogo-tienda`
Esperado: fallan las tres (la lista no filtra; `tienda` no existe).

- [ ] **Step 3: El código** (en `catalogo.ts`)

1. En `productoSchema` agrega, después de `codigo_interno`:

```ts
  codigo_barras: z.string().trim().max(50).optional().or(z.literal("")),
  costo_mxn: z.number({ error: "Costo inválido" }).min(0, "El costo no puede ser negativo").optional(),
```

2. En `Producto` agrega los cinco campos de la interfaz. Saca el `select` repetido a una constante y súmale `codigo_barras, costo_mxn, controla_existencias, variante_ejes`:

```ts
const COLUMNAS_PRODUCTO =
  "id, nombre, descripcion, codigo_interno, codigo_barras, costo_mxn, controla_existencias, variante_ejes, imagen_url, precio_base_mxn, categoria_id, estado, agotado_manual, agotado_automatico, visible_en_pos, en_menu_general, marca_virtual_id, area_cocina_id, clave_sat, tasa_iva, iva_incluido_en_precio, es_combo, categoria:categorias(nombre)";
```

Extrae también el mapeo repetido de `listarProductos`/`obtenerProducto` a `function aProducto(f: FilaProd, variantes = 0): Producto`, con los campos nuevos:

```ts
    codigo_barras: f.codigo_barras ?? null,
    costo_mxn: f.costo_mxn == null ? null : Number(f.costo_mxn),
    controla_existencias: Boolean(f.controla_existencias),
    variante_ejes: f.variante_ejes ?? null,
    variantes,
```

3. `listarProductos`:

```ts
export async function listarProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("productos").select(COLUMNAS_PRODUCTO)
    .is("deleted_at", null).is("producto_padre_id", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  // Cuántas variantes vivas tiene cada padre (solo tiendas; en un restaurante sale vacío).
  const { data: hijas } = await supabase
    .from("productos").select("producto_padre_id").is("deleted_at", null).not("producto_padre_id", "is", null);
  const cuenta = new Map<string, number>();
  for (const h of (hijas ?? []) as { producto_padre_id: string }[]) cuenta.set(h.producto_padre_id, (cuenta.get(h.producto_padre_id) ?? 0) + 1);
  return ((data ?? []) as unknown as FilaProd[]).map((f) => aProducto(f, cuenta.get(f.id) ?? 0));
}
```

`obtenerProducto` usa `COLUMNAS_PRODUCTO` y `aProducto(f)`.

4. Escritura: una función que solo agrega lo de tienda cuando viene.

```ts
export type DatosTienda = { codigo_barras: string; costo_mxn: number | null; controla_existencias: boolean };
const columnasTienda = (t?: DatosTienda) =>
  t ? { codigo_barras: t.codigo_barras.trim() || null, costo_mxn: t.costo_mxn, controla_existencias: t.controla_existencias } : {};
```

`crearProducto(input, opciones: { enMenuGeneral?: boolean; tienda?: DatosTienda } = {})` agrega `...columnasTienda(opciones.tienda)` al `insert`. `actualizarProducto(id, input, tienda?: DatosTienda)` agrega `...columnasTienda(tienda)` al `update`. Así un restaurante (sin `tienda`) escribe exactamente lo de antes.

- [ ] **Step 4: Verla pasar, con toda la suite y el tipado**

Run: `pnpm --filter @vim/admin test` y `pnpm --filter @vim/admin typecheck`
Esperado: verde. Si otro archivo construye un `Producto` a mano (p. ej. combos), agrégale los campos nuevos con valores vacíos.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/lib/catalogo.ts apps/admin/app/lib/__tests__/catalogo-tienda.test.ts
git commit -m "feat(retail): el catalogo del admin lee y escribe los campos de tienda"
```

(Si el Step 4 tocó otros archivos para el tipado, agrégalos por nombre.)

---

### Task 7: Formulario de producto: bloque «Tienda»

**Files:**
- Modify: `apps/admin/app/components/producto-form.tsx`

**Interfaces:**
- Consumes: `conExistencias` (Tarea 4), `generarCodigoInterno` (Tarea 5), `normalizarEan` (Tarea 5), `DatosTienda` y las firmas nuevas de `crearProducto`/`actualizarProducto` (Tarea 6), `useModulos` (admin-shell).
- Produces: con el módulo encendido, el formulario muestra «Código de barras» (con «Generar»), «Costo» y el interruptor «Lleva existencias» (escondido si el producto es padre de variantes). Sin el módulo, el formulario no cambia ni un píxel.

- [ ] **Step 1: El código**

Dentro de `ProductoForm`:

```tsx
  const tienda = conExistencias(useModulos());
  const esPadre = (producto?.variante_ejes?.length ?? 0) > 0;
  const [barras, setBarras] = useState(producto?.codigo_barras ?? "");
  const [costo, setCosto] = useState(producto?.costo_mxn == null ? "" : String(producto.costo_mxn));
  const [llevaExistencias, setLlevaExistencias] = useState(producto?.controla_existencias ?? false);
  const [generando, setGenerando] = useState(false);
```

Suma `barras`, `costo` y `llevaExistencias` a la comparación de «Cambios sin guardar» (la variable `sucio`), igual que los demás campos.

En `guardar()`, después del `safeParse` que ya existe:

```tsx
    const datosTienda: DatosTienda | undefined = tienda
      ? { codigo_barras: barras, costo_mxn: costo.trim() === "" ? null : Number(costo), controla_existencias: !esPadre && llevaExistencias }
      : undefined;
    if (datosTienda && datosTienda.costo_mxn !== null && !(Number.isFinite(datosTienda.costo_mxn) && datosTienda.costo_mxn >= 0)) {
      setError("Costo inválido"); return;
    }
```

Pásalo como `crearProducto(datos, { enMenuGeneral, tienda: datosTienda })` y `actualizarProducto(id, datos, datosTienda)`, respetando cómo `guardar()` arma hoy esas llamadas.

El bloque va justo **antes** de `{extra}`, como una `Tarjeta` (`components/tarjeta.tsx`) o un `Plegable` abierto, según lo que use el resto del formulario a esa altura:

```tsx
        {tienda && (
          <Tarjeta titulo="Tienda" descripcion="Para vender escaneando y llevar cuánto queda.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={label} htmlFor="codigo-barras">Código de barras <span className="font-normal text-ink-2">· opcional</span></label>
                <div className="flex gap-2">
                  <input id="codigo-barras" className={input} value={barras} maxLength={50}
                    onChange={(e) => setBarras(e.target.value.trim())} placeholder="El de la etiqueta del proveedor" />
                  <Button variant="secondary" disabled={generando} onClick={async () => {
                    setGenerando(true);
                    try { setBarras(await generarCodigoInterno()); } catch (e) { setError(mensajeError(e, "No se pudo generar el código")); }
                    finally { setGenerando(false); }
                  }}>{generando ? "Generando…" : "Generar"}</Button>
                </div>
                {barras && !normalizarEan(barras) && (
                  <p className="mt-1 text-13 text-ink-2">No es un EAN-13: se puede escanear si tu lector lo lee, pero la etiqueta saldrá sin barras.</p>
                )}
              </div>
              <div>
                <label className={label} htmlFor="costo">Costo <span className="font-normal text-ink-2">· lo que te cuesta a ti</span></label>
                <input id="costo" className={input} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            {!esPadre && (
              <div className="mt-4">
                <Interruptor etiqueta="Lleva existencias" encendido={llevaExistencias} onCambiar={setLlevaExistencias}
                  estado={llevaExistencias ? "La caja descuenta cada venta." : "Se vende sin contar cuántos quedan."} />
              </div>
            )}
          </Tarjeta>
        )}
```

Revisa la firma real de `Interruptor` (`components/interruptor.tsx`) y de `Button` (`variant`) y ajusta los nombres de las props. Si el formulario ya usa `Plegable` para los bloques, usa `Plegable` en lugar de `Tarjeta` para que se vea igual que sus hermanos. Por la regla de diseño, hay que verse como el resto.

El texto de ayuda de la clave SAT: con `tienda`, en vez de «Sin clave, se factura como servicio de restaurante.», muestra «Cada prenda necesita su clave para facturar; búscala abajo.». La Tarea 11 agrega el buscador.

- [ ] **Step 2: Tipado, pruebas y tipografía**

Run: `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test` y `pnpm tipografia`
Esperado: verde.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/producto-form.tsx
git commit -m "feat(retail): bloque Tienda en el formulario de producto (solo con existencias)"
```

---

### Task 8: El editor de variantes

**Files:**
- Create: `apps/admin/app/components/producto-variantes.tsx`
- Modify: `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx`

**Interfaces:**
- Consumes: `armarMatriz`, `parsearValoresEje`, `listarVariantes`, `guardarVariantes`, `claveValores`, `FilaVariante`, `Eje` (Tarea 5); `listarSucursalesOpciones` (`lib/inventario.ts`); `conExistencias`, `useModulos`.
- Produces: `ProductoVariantes({ producto, onPendiente })`. Lo monta la página de edición en la ranura `extra`, junto a `ProductoModificadores`, solo con el módulo. Se guarda con el «Guardar cambios» del producto, usando el mismo patrón `onPendiente` que modificadores.

- [ ] **Step 1: El componente**

`apps/admin/app/components/producto-variantes.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { label, input } from "./campos";
import { armarMatriz, claveValores, guardarVariantes, listarVariantes, parsearValoresEje, type Eje, type FilaVariante } from "../lib/variantes";
import { listarSucursalesOpciones, type SucursalOpcion } from "../lib/inventario";
import { mensajeError } from "../lib/errores";
import type { Producto } from "../lib/catalogo";

const nombreFila = (f: FilaVariante, ejes: Eje[]) => ejes.map((e) => f.valores[e.nombre]).join(" · ");

/**
 * Tallas y colores de una prenda (ADR 0037): el dueño escribe los ejes y sus valores y aquí sale una
 * fila por combinación, con su SKU, código de barras, precio, costo y existencia inicial. Se guarda
 * con el «Guardar cambios» del producto (mismo patrón que ProductoModificadores).
 */
export function ProductoVariantes({ producto, onPendiente }: {
  producto: Producto;
  onPendiente: (guardar: (() => Promise<void>) | null) => void;
}) {
  const [ejes, setEjes] = useState<Eje[]>([]);
  const [filas, setFilas] = useState<FilaVariante[] | null>(null);
  const [original, setOriginal] = useState("");
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [sucursal, setSucursal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tieneHijas = (filas ?? []).some((f) => f.id && f.activa);

  useEffect(() => {
    Promise.all([listarVariantes(producto.id), listarSucursalesOpciones()])
      .then(([vs, ss]) => {
        const nombres = producto.variante_ejes ?? [];
        setEjes(nombres.map((n) => ({ nombre: n, valores: [...new Set(vs.map((v) => v.valores[n]).filter(Boolean))] })));
        setFilas(vs);
        setOriginal(JSON.stringify(vs));
        setSucursales(ss);
        setSucursal(ss[0]?.id ?? "");
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron leer las variantes")));
  }, [producto.id, producto.variante_ejes]);

  const cambio = filas !== null && JSON.stringify(filas) !== original;
  const conExistenciaInicial = (filas ?? []).some((f) => !f.id && Number(f.existencia_inicial) > 0);

  useEffect(() => {
    onPendiente(cambio ? async () => {
      await guardarVariantes(producto.id, ejes.map((e) => e.nombre), filas ?? [], conExistenciaInicial ? sucursal || null : null);
      const vs = await listarVariantes(producto.id);
      setFilas(vs);
      setOriginal(JSON.stringify(vs));
    } : null);
  }, [cambio, filas, ejes, sucursal, conExistenciaInicial, producto.id, onPendiente]);

  function cambiarEjes(nuevos: Eje[]) {
    setEjes(nuevos);
    setFilas((fs) => armarMatriz(nuevos.filter((e) => e.nombre && e.valores.length), fs ?? [], String(producto.precio_base_mxn)));
  }
  const editar = (k: string, cambio: Partial<FilaVariante>) =>
    setFilas((fs) => (fs ?? []).map((f) => (claveValores(f.valores) === k ? { ...f, ...cambio } : f)));

  const activas = useMemo(() => (filas ?? []).filter((f) => f.activa), [filas]);

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="titulo-variantes">
      <h2 id="titulo-variantes" className="text-14 font-semibold">Tallas y colores</h2>
      <p className="mb-3 text-13 text-ink-2">Escribe los ejes y sus valores separados por coma. Cada combinación se vende y se cuenta por separado.</p>
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {filas === null && !error && <p className="text-sm text-ink-2">Cargando…</p>}
      {filas !== null && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="grid grid-cols-[120px_1fr] gap-2">
                <input aria-label={`Eje ${i + 1}`} className={input} value={ejes[i]?.nombre ?? ""} disabled={tieneHijas}
                  placeholder={i === 0 ? "Talla" : "Color"}
                  onChange={(e) => { const n = [...ejes]; n[i] = { nombre: e.target.value.trim(), valores: n[i]?.valores ?? [] }; cambiarEjes(n.filter(Boolean)); }} />
                <input aria-label={`Valores del eje ${i + 1}`} className={input} defaultValue={ejes[i]?.valores.join(", ") ?? ""}
                  placeholder={i === 0 ? "CH, M, G" : "Negra, Blanca"}
                  onBlur={(e) => { const n = [...ejes]; if (!n[i]) return; n[i] = { ...n[i], valores: parsearValoresEje(e.target.value) }; cambiarEjes(n); }} />
              </div>
            ))}
          </div>
          {tieneHijas && <p className="mt-2 text-13 text-ink-2">Los nombres de los ejes ya no se cambian; sí puedes agregar o quitar valores.</p>}

          {activas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-13 text-ink-2">
                  <tr><th className="py-2 pr-2 font-medium">Variante</th><th className="pr-2 font-medium">SKU</th><th className="pr-2 font-medium">Código de barras</th>
                    <th className="pr-2 font-medium">Precio</th><th className="pr-2 font-medium">Costo</th><th className="pr-2 font-medium">Existencia inicial</th><th /></tr>
                </thead>
                <tbody>
                  {activas.map((f) => {
                    const k = claveValores(f.valores);
                    return (
                      <tr key={k} className="border-t border-line">
                        <td className="py-2 pr-2 font-medium">{nombreFila(f, ejes)}</td>
                        <td className="pr-2"><input aria-label="SKU" className={`${input} h-9`} value={f.codigo_interno} onChange={(e) => editar(k, { codigo_interno: e.target.value })} /></td>
                        <td className="pr-2"><input aria-label="Código de barras" className={`${input} h-9`} value={f.codigo_barras}
                          placeholder={f.generar_codigo ? "Se genera al guardar" : ""} onChange={(e) => editar(k, { codigo_barras: e.target.value.trim(), generar_codigo: !e.target.value.trim() })} /></td>
                        <td className="pr-2"><input aria-label="Precio" className={`${input} h-9 w-24`} inputMode="decimal" value={f.precio} onChange={(e) => editar(k, { precio: e.target.value })} /></td>
                        <td className="pr-2"><input aria-label="Costo" className={`${input} h-9 w-24`} inputMode="decimal" value={f.costo} onChange={(e) => editar(k, { costo: e.target.value })} /></td>
                        <td className="pr-2">{f.id ? <span className="text-13 text-ink-2">—</span> :
                          <input aria-label="Existencia inicial" className={`${input} h-9 w-20`} inputMode="decimal" value={f.existencia_inicial} onChange={(e) => editar(k, { existencia_inicial: e.target.value })} />}</td>
                        <td><button type="button" className="text-13 font-semibold text-danger" onClick={() => editar(k, { activa: false })}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {conExistenciaInicial && sucursales.length > 1 && (
            <div className="mt-3 max-w-xs">
              <label className={label} htmlFor="sucursal-inicial">La existencia inicial entra en</label>
              <select id="sucursal-inicial" className={input} value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          {cambio && <p className="mt-3 text-13 text-ink-2">Se guardan con «Guardar cambios».</p>}
        </>
      )}
    </section>
  );
}
```

Revisa al cargar `docs/diseno/admin.md` y las skills de diseño: tabla con bordes de renglón, sin tarjetas por fila, «Quitar» en rojo en reposo (`AccionFila` con `peligro` si su API acepta un `onClick`; si sí, úsala en lugar del `<button>`).

- [ ] **Step 2: Montarlo en la página de edición**

En `apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx`, con un segundo registro de pendientes:

```tsx
  const varPendientes = useRef<(() => Promise<void>) | null>(null);
  const registrarVariantes = useCallback((fn: (() => Promise<void>) | null) => { varPendientes.current = fn; }, []);
  const guardarTodo = useCallback(async () => {
    await modsPendientes.current?.();
    await varPendientes.current?.();
  }, []);
  const tienda = conExistencias(useModulos());
```

`guardarTambien={guardarTodo}` y:

```tsx
            extra={
              <>
                {tienda && !prod.controla_existencias && <ProductoVariantes producto={prod} onPendiente={registrarVariantes} />}
                <ProductoModificadores productoId={prod.id} onPendiente={registrarPendiente} />
              </>
            }
```

Un producto que «lleva existencias» por sí mismo no tiene variantes. Para dárselas, primero se le quita el interruptor (la base también lo exige).

- [ ] **Step 3: Tipado, pruebas y tipografía**

Run: `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test` y `pnpm tipografia`
Esperado: verde.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/producto-variantes.tsx "apps/admin/app/(panel)/catalogo/productos/[id]/page.tsx"
git commit -m "feat(retail): editor de tallas y colores en el producto"
```

---

### Task 9: Lista de productos y pestañas

**Files:**
- Modify: `apps/admin/app/(panel)/catalogo/productos/page.tsx`
- Modify: `apps/admin/app/components/catalogo-tabs.tsx`

**Interfaces:**
- Consumes: `Producto.variantes` (Tarea 6), `conExistencias` (Tarea 4).

- [ ] **Step 1: «N variantes» en la lista**

En la celda del nombre de cada producto, si `p.variantes > 0`, una etiqueta junto al nombre con el mismo estilo que las etiquetas de estado de esa tabla (tokens `bg-hover`, `text-13`):

```tsx
{p.variantes > 0 && <span className="ml-2 rounded-full bg-hover px-2 py-px text-13 text-ink-2">{p.variantes} variantes</span>}
```

Si la lista tiene buscador, que también encuentre por `codigo_barras`: suma `p.codigo_barras` a lo que se compara, junto a `codigo_interno` si ya está.

- [ ] **Step 2: Pestañas de tienda**

En `catalogo-tabs.tsx`:

```tsx
const TABS_TIENDA = [
  { label: "Importar tienda", href: "/catalogo/importar-tienda" },
  { label: "Etiquetas", href: "/catalogo/etiquetas" },
];
```

y dentro de `CatalogoTabs`:

```tsx
  const tabs = conExistencias(useModulos()) ? [...TABS, ...TABS_TIENDA] : TABS;
```

con `tabs.map` en vez de `TABS.map`. Ojo: `useModulos()` ya se llama una vez para `sinInventario`. Léelo una sola vez en una constante y úsala para las dos cosas.

- [ ] **Step 3: Tipado, pruebas y tipografía**

Run: `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test` y `pnpm tipografia`
Esperado: verde.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/productos/page.tsx" apps/admin/app/components/catalogo-tabs.tsx
git commit -m "feat(retail): variantes en la lista y pestanas de tienda"
```

---

### Task 10: Importar tienda y etiquetas

**Files:**
- Create: `apps/admin/app/(panel)/catalogo/importar-tienda/page.tsx`
- Create: `apps/admin/app/(panel)/catalogo/etiquetas/page.tsx`
- Create: `apps/admin/app/components/barras-ean13.tsx`
- Create: `apps/admin/app/lib/__tests__/barras-ean13.test.ts`

**Interfaces:**
- Consumes: `parsearCsvTienda`, `importarCatalogoTienda`, `PLANTILLA_TIENDA` (Tarea 5); `normalizarEan`, `modulosEan13` (Tarea 5); `textoDeArchivo` (`lib/leer-archivo.ts`); `listarSucursalesOpciones`; `PageHeader`, `PageBody`, `CatalogoTabs`; `conExistencias`, `useModulos`.
- Produces: `BarrasEan13({ codigo, alto })` (SVG, o `null` si el código no es EAN); `formatoEtiqueta(f: Formato): { pagina: string; ancho: string; alto: string; columnas: number }` exportada desde `barras-ean13.tsx` y probada.

- [ ] **Step 1: La prueba del SVG y del formato**

`apps/admin/app/lib/__tests__/barras-ean13.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BarrasEan13, formatoEtiqueta } from "../../components/barras-ean13";
import { modulosEan13 } from "../codigo-barras";

describe("etiquetas", () => {
  it("dibuja un rect por cada módulo negro", () => {
    const html = renderToStaticMarkup(createElement(BarrasEan13, { codigo: "4006381333931" }));
    const negros = [...modulosEan13("4006381333931")].filter((b) => b === "1").length;
    expect((html.match(/<rect/g) ?? []).length).toBe(negros);
    expect(html).toContain('viewBox="0 0 95');
  });
  it("sin código EAN no dibuja barras", () => {
    expect(renderToStaticMarkup(createElement(BarrasEan13, { codigo: "POL-M" }))).toBe("");
  });
  it("hoja carta 3×10 y rollo a su tamaño", () => {
    expect(formatoEtiqueta({ tipo: "carta" })).toMatchObject({ pagina: "letter", columnas: 3 });
    expect(formatoEtiqueta({ tipo: "rollo", anchoMm: 50, altoMm: 25 })).toMatchObject({ pagina: "50mm 25mm", columnas: 1 });
  });
});
```

Ajusta el include de `apps/admin/vitest.config.ts` solo si no toma `app/lib/__tests__/*.test.ts`. Ya lo toma: no hace falta.

- [ ] **Step 2: Verla fallar**

Run: `pnpm --filter @vim/admin test -- barras-ean13`
Esperado: no encuentra el módulo.

- [ ] **Step 3: El componente de barras**

`apps/admin/app/components/barras-ean13.tsx`:

```tsx
import { modulosEan13, normalizarEan } from "../lib/codigo-barras";

/** Un EAN-13 (o UPC-A) como SVG: una barra por módulo negro. Sin código EAN, nada. */
export function BarrasEan13({ codigo, alto = 40 }: { codigo: string; alto?: number }) {
  const ean = normalizarEan(codigo);
  if (!ean) return null;
  const m = modulosEan13(ean);
  return (
    <svg viewBox={`0 0 95 ${alto}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`Código ${ean}`}>
      {[...m].map((b, i) => (b === "1" ? <rect key={i} x={i} y={0} width={1} height={alto} fill="#000" /> : null))}
    </svg>
  );
}

export type Formato = { tipo: "carta" } | { tipo: "rollo"; anchoMm: number; altoMm: number };

/** Hoja carta de 3×10 (etiquetas adhesivas comunes) o una etiqueta de rollo por página. */
export function formatoEtiqueta(f: Formato) {
  return f.tipo === "carta"
    ? { pagina: "letter", ancho: "66.7mm", alto: "25.4mm", columnas: 3 }
    : { pagina: `${f.anchoMm}mm ${f.altoMm}mm`, ancho: `${f.anchoMm}mm`, alto: `${f.altoMm}mm`, columnas: 1 };
}
```

(El SVG lleva `#000` literal a propósito: la impresión no lee tokens de tema y la barra debe salir negra pura. Es la única excepción a la regla de tokens. Anótalo así en el comentario si el revisor lo pregunta.)

- [ ] **Step 4: Pantalla de etiquetas**

`apps/admin/app/(panel)/catalogo/etiquetas/page.tsx` debe hacer esto:

- **Datos.** Lee los productos que llevan existencias y no son padres:

  ```ts
  supabase.from("productos").select("id, nombre, precio_base_mxn, codigo_barras, codigo_interno")
    .is("deleted_at", null).eq("controla_existencias", true).order("nombre")
  ```

  Ponlo en `lib/variantes.ts` como `listarProductosEtiquetables()`. También lee las existencias de la sucursal elegida (`producto_existencias`) para proponer cuántas etiquetas por producto.
- **Controles.** Arriba van:
  - un `Segmentos` con «Hoja carta (3×10)» y «Rollo»;
  - con «Rollo», ancho y alto en mm (por defecto 50 × 25);
  - la sucursal, para la cantidad propuesta;
  - un buscador por nombre, SKU o código;
  - el botón «Imprimir», que hace `window.print()`.
- **Lista.** Un renglón por producto: casilla, nombre, código y cantidad (número, por defecto su existencia o 1). Si el código no es EAN-13, el renglón dice «Sin barras: sale el código en texto».
- **Zona de impresión.** Un `<div className="zona-impresion">` con una cuadrícula de `formato.columnas` columnas. Cada etiqueta mide `formato.ancho × formato.alto` y lleva nombre (2 renglones como máximo, truncado), precio con `precioMxn`, `BarrasEan13` (o el texto del código) y el código en dígitos debajo.
- **CSS de impresión.** Un `<style>` en la página con el `@page` según el formato:

  ```tsx
  <style>{`
    @media screen { .zona-impresion { display: none; } }
    @media print {
      @page { size: ${formato.pagina}; margin: ${formato.columnas > 1 ? "12.7mm 4.8mm" : "0"}; }
      body * { visibility: hidden; }
      .zona-impresion, .zona-impresion * { visibility: visible; }
      .zona-impresion { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(${formato.columnas}, ${formato.ancho}); grid-auto-rows: ${formato.alto}; }
      .etiqueta { break-inside: avoid; overflow: hidden; padding: 1.5mm; font-family: Arial, sans-serif; color: #000; }
    }
  `}</style>
  ```
- **Vista previa.** Arriba de la lista, en pantalla, la primera etiqueta a escala (la misma `.etiqueta` dentro de un contenedor de vista previa) para que el dueño vea qué va a salir.
- **Ayuda.** Una línea: «Para PDF, en el diálogo de impresión elige "Guardar como PDF".»
- **Sin módulo.** Si `!conExistencias(...)`, la página muestra «Esta sección es para tiendas.» y no lee nada.

- [ ] **Step 5: Pantalla de importar tienda**

`apps/admin/app/(panel)/catalogo/importar-tienda/page.tsx`. Mismo esqueleto que `catalogo/importar/page.tsx`: `PageHeader`, `CatalogoTabs`, `PageBody`, textarea para pegar y subir archivo con `textoDeArchivo`. Debe hacer esto:

- **Plantilla.** «Descargar plantilla» crea un `Blob` con `"﻿" + PLANTILLA_TIENDA` (BOM para que Excel lea los acentos), tipo `text/csv;charset=utf-8`, y lo baja como `plantilla-tienda.csv`.
- **Generar códigos.** Una casilla «Generar código de barras a las que no traen», encendida por defecto. Es el `generarFaltantes`.
- **Sucursal.** Un selector de sucursal para la existencia, si hay más de una.
- **Vista previa.** Al pegar o subir: `parsearCsvTienda`. Una tabla muestra las filas válidas (categoría, producto, variante, SKU, código o «se genera», precio, costo, existencia). Una lista en rojo muestra los errores con su número de línea. Arriba va la cuenta: «N renglones listos · M con error».
- **Importar.** El botón «Importar N» solo se habilita sin errores (todo o nada también en la pantalla). Llama a `importarCatalogoTienda(filas, sucursal)`. Al terminar muestra «Listo: X productos, Y variantes, Z actualizados, W categorías nuevas» y un enlace a Productos. El error de la base se muestra tal cual, con `mensajeError`: ya dice «línea N: …».
- **Ayuda.** Bajo la plantilla: «Si un SKU ya existe se actualizan su nombre, precio, costo y código; la existencia solo cuenta al crear.»
- **Sin módulo.** Si `!conExistencias(...)`, igual que etiquetas.

- [ ] **Step 6: Tipado, pruebas y tipografía**

Run: `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test` y `pnpm tipografia`
Esperado: verde.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/components/barras-ean13.tsx apps/admin/app/lib/__tests__/barras-ean13.test.ts apps/admin/app/lib/variantes.ts "apps/admin/app/(panel)/catalogo/etiquetas/page.tsx" "apps/admin/app/(panel)/catalogo/importar-tienda/page.tsx"
git commit -m "feat(retail): importar catalogo de tienda y etiquetas con codigo de barras"
```

---

### Task 11: Buscador de clave SAT

**Files:**
- Create: `supabase/functions/_shared/pac/catalogo-sat.ts`, `supabase/functions/_shared/pac/catalogo-sat.test.ts`
- Modify: `supabase/functions/_shared/pac/facturama.ts` (método `buscarClavesSat`)
- Create: `supabase/functions/buscar-clave-sat/index.ts`
- Create: `apps/admin/app/lib/clave-sat.ts`, `apps/admin/app/components/buscador-clave-sat.tsx`
- Modify: `apps/admin/app/components/producto-form.tsx` (monta el buscador)

**Interfaces:**
- Produces:
  - `normalizarClavesSat(json: unknown): { clave: string; descripcion: string }[]` (acepta `Value`/`Name` o `Code`/`Description`, se queda solo con claves de 8 dígitos, máximo 30 resultados);
  - `FacturamaPac.buscarClavesSat(texto: string): Promise<{ clave: string; descripcion: string }[]>`;
  - la función `buscar-clave-sat` (`POST {texto}` → `{ ok: true, claves }`; 401 sin sesión; 400 con menos de 3 letras; 503 sin PAC);
  - en el admin, `buscarClavesSat(texto)` y `<BuscadorClaveSat onElegir={(clave) => …} />`.

- [ ] **Step 1: La prueba del normalizador**

`supabase/functions/_shared/pac/catalogo-sat.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarClavesSat } from "./catalogo-sat.ts";

test("acepta Value/Name y Code/Description, y descarta lo que no es clave de 8 dígitos", () => {
  assert.deepEqual(normalizarClavesSat([
    { Value: "53101602", Name: "Camisas de hombre" },
    { Code: "53111600", Description: "Zapatos de mujer" },
    { Value: "xx", Name: "basura" },
    "texto",
  ]), [
    { clave: "53101602", descripcion: "Camisas de hombre" },
    { clave: "53111600", descripcion: "Zapatos de mujer" },
  ]);
});

test("cualquier cosa que no es arreglo da vacío", () => {
  assert.deepEqual(normalizarClavesSat({ Message: "error" }), []);
  assert.deepEqual(normalizarClavesSat(null), []);
});
```

(Las claves del ejemplo son datos de prueba del normalizador, no un catálogo: el catálogo real lo da Facturama.)

- [ ] **Step 2: Verla fallar**

Run: `node --test --experimental-strip-types supabase/functions/_shared/pac/catalogo-sat.test.ts`
Esperado: no encuentra el módulo.

- [ ] **Step 3: El código de la función**

`supabase/functions/_shared/pac/catalogo-sat.ts`:

```ts
// Respuesta de GET /Catalogs/ProductsOrServices de Facturama. Su documentación no trae ejemplo
// ("Sample not available"): se aceptan los dos nombres de campo que usan sus otros catálogos.
export type ClaveSat = { clave: string; descripcion: string };

export function normalizarClavesSat(json: unknown): ClaveSat[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const clave = String(o.Value ?? o.Code ?? "").trim();
    const descripcion = String(o.Name ?? o.Description ?? "").trim();
    return /^\d{8}$/.test(clave) ? [{ clave, descripcion }] : [];
  }).slice(0, 30);
}
```

En `facturama.ts`, dentro de `FacturamaPac` (junto a `descargar`):

```ts
  /** Busca en el catálogo c_ClaveProdServ del SAT (mínimo 3 letras). */
  async buscarClavesSat(texto: string): Promise<ClaveSat[]> {
    const res = await fetch(`${this.baseUrl}/Catalogs/ProductsOrServices?keyword=${encodeURIComponent(texto)}`, {
      headers: { Authorization: this.autorizacion, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Facturama respondió ${res.status} al buscar claves SAT`);
    return normalizarClavesSat(await res.json());
  }
```

(con `import { normalizarClavesSat, type ClaveSat } from "./catalogo-sat.ts";`).

`supabase/functions/buscar-clave-sat/index.ts`:

```ts
// Edge Function: buscar-clave-sat — busca claves del catálogo del SAT (c_ClaveProdServ) en
// Facturama para el formulario de producto del admin. Solo para usuarios con sesión: el PAC cobra
// por cuenta, no por consulta, pero no se deja abierto a internet.
//
// Entrada: { texto }   Salida: { ok: true, claves: [{ clave, descripcion }] }
import { clienteDe, servir } from "../_shared/http.ts";
import { bearerDe } from "../_shared/identidad.ts";
import { obtenerFacturama } from "../_shared/pac/index.ts";

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error } = await clienteDe(token).auth.getUser(token);
  if (error || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  let body: { texto?: unknown };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const texto = String(body.texto ?? "").trim().slice(0, 60);
  if (texto.length < 3) return json({ error: "TEXTO_CORTO", mensaje: "Escribe al menos 3 letras" }, 400);

  const pac = obtenerFacturama();
  if (!pac) return json({ error: "PAC_NO_CONFIGURADO" }, 503);
  try {
    return json({ ok: true, claves: await pac.buscarClavesSat(texto) });
  } catch (e) {
    console.error(`[buscar-clave-sat] ${e instanceof Error ? e.message : e}`);
    return json({ error: "PAC_ERROR", mensaje: "El catálogo del SAT no respondió; intenta de nuevo" }, 502);
  }
});
```

Si en `supabase/functions/.env` hay credenciales de sandbox de Facturama (`FACTURAMA_*`), prueba la llamada real una vez, con `node --experimental-strip-types` como sugiere el comentario de `FacturamaPac`. Por ejemplo, un script en el scratchpad que instancie `FacturamaPac` y busque «camisa». Anota en el reporte qué campos regresó. Si no son `Value`/`Name` ni `Code`/`Description`, agrégalos al normalizador y a su prueba. **No pegues credenciales en ningún archivo del repo ni en el reporte.**

- [ ] **Step 4: El buscador en el admin**

`apps/admin/app/lib/clave-sat.ts`, con el mismo patrón de `fetch` que `provisionarDispositivo` en `lib/configuracion.ts` (sesión → `Authorization: Bearer`, `apikey`). Reutiliza las constantes `SB_URL`/`SB_ANON` de donde las importe `configuracion.ts`:

```ts
"use client";
export type ClaveSat = { clave: string; descripcion: string };

export async function buscarClavesSat(texto: string): Promise<ClaveSat[]> {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(`${SB_URL}/functions/v1/buscar-clave-sat`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${sess.session?.access_token ?? SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  const data = (await res.json().catch(() => ({}))) as { claves?: ClaveSat[]; mensaje?: string; error?: string };
  if (!res.ok) throw new Error(data.mensaje ?? data.error ?? `HTTP ${res.status}`);
  return data.claves ?? [];
}
```

`apps/admin/app/components/buscador-clave-sat.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { input } from "./campos";
import { buscarClavesSat, type ClaveSat } from "../lib/clave-sat";
import { mensajeError } from "../lib/errores";

/** Busca en el catálogo del SAT y llena la clave al elegir. La clave se puede seguir escribiendo a mano. */
export function BuscadorClaveSat({ onElegir }: { onElegir: (clave: string) => void }) {
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<ClaveSat[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function buscar() {
    setBuscando(true); setError(null);
    try { setRes(await buscarClavesSat(texto)); } catch (e) { setError(mensajeError(e, "No se pudo buscar")); setRes(null); }
    finally { setBuscando(false); }
  }
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input aria-label="Buscar clave en el catálogo del SAT" className={input} value={texto} placeholder="Buscar: camisa, pantalón, tenis…"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(); } }} />
        <Button variant="secondary" disabled={buscando || texto.trim().length < 3} onClick={() => void buscar()}>{buscando ? "Buscando…" : "Buscar"}</Button>
      </div>
      {error && <p className="mt-1 text-13 text-danger" role="alert">{error}</p>}
      {res && res.length === 0 && <p className="mt-1 text-13 text-ink-2">Sin resultados. Prueba con otra palabra.</p>}
      {res && res.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-line">
          {res.map((c) => (
            <li key={c.clave}>
              <button type="button" className="flex w-full gap-3 px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { onElegir(c.clave); setRes(null); }}>
                <span className="font-mono text-13">{c.clave}</span><span className="text-ink-2">{c.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

En `producto-form.tsx`, justo debajo del campo «Clave de producto SAT», ponlo **para todos los negocios**: también le sirve a un restaurante.

```tsx
<BuscadorClaveSat onElegir={setClaveSat} />
```

Revisa que siga dentro del mismo grid o, si rompe el acomodo de dos columnas, ponlo a todo el ancho debajo del grid.

- [ ] **Step 5: Pruebas, tipado y tipografía**

Run: `pnpm test:functions`, `pnpm --filter @vim/admin typecheck`, `pnpm --filter @vim/admin test` y `pnpm tipografia`
Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/pac/catalogo-sat.ts supabase/functions/_shared/pac/catalogo-sat.test.ts supabase/functions/_shared/pac/facturama.ts supabase/functions/buscar-clave-sat/index.ts apps/admin/app/lib/clave-sat.ts apps/admin/app/components/buscador-clave-sat.tsx apps/admin/app/components/producto-form.tsx
git commit -m "feat(retail): buscador de clave SAT con el catalogo de Facturama"
```

---

### Task 12: Diseño documentado

**Files:**
- Modify: `docs/diseno/admin.md`

- [ ] **Step 1:** Agrega una sección «Tienda (giro RETAIL)» antes de «Piezas que se repiten en el panel». Una o dos frases por pieza: cuándo aparece (solo con `existencias`), el bloque «Tienda» del producto, el editor de tallas y colores (tabla con bordes de renglón, «Quitar» en rojo, se guarda con «Guardar cambios»), importar (todo o nada, vista previa con errores por línea) y etiquetas (hoja carta 3×10 o rollo, EAN-13 en SVG negro puro como única excepción a los tokens, PDF desde «Imprimir»). Sin jerga.

- [ ] **Step 2: Commit**

```bash
git add docs/diseno/admin.md
git commit -m "docs(retail): el catalogo de tienda en el diseno del admin"
```

---

### Task 13: Base local, tipos y verificación completa

**Files:**
- Regenerate: `packages/db/src/database.types.ts`

- [ ] **Step 1: Aplicar 0188–0190 al Supabase local de Docker** (autorizado por Fermín el 15 oct; **solo** local)

```bash
npx supabase migration list --local
npx supabase migration up --local
```

Esperado: `migration list` muestra 0188, 0189 y 0190 pendientes en local, y `up` las aplica una por una. Si `list` muestra también otras migraciones pendientes que **no** son de esta rama, detente y repórtalo: no apliques migraciones de otras sesiones.

- [ ] **Step 2: Tipos**

Run: `pnpm db:types` y `git diff --stat packages/db/src/database.types.ts`
Esperado: el diff solo agrega lo de 0188–0190 (`RETAIL`, `CAMBIO_TALLA`, columnas de `productos`, `producto_existencias`, `movimientos_producto`, `traspasos_producto` y las funciones). Si trae cambios que no son de esta rama, repórtalo antes de hacer commit.

- [ ] **Step 3: Todo**

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
git add packages/db/src/database.types.ts
git commit -m "chore(retail): tipos regenerados con 0188-0190"
```

- [ ] **Step 5: Cierre local** (sin push, sin PR, sin producción)

El controlador verifica en el navegador, con el admin de este worktree contra el Supabase local:
- el catálogo de un restaurante sin cambios;
- con `existencias` encendido para el negocio de prueba (`UPDATE tenants SET operacion = operacion || '{"existencias":true}'`, **solo en el Docker local**): crear una prenda, darle 2×2 variantes con existencia inicial y guardar;
- ver «4 variantes» en la lista;
- importar la plantilla;
- vista previa de etiquetas e «Imprimir» (captura del diálogo de impresión);
- buscar una clave SAT (si no hay credenciales del PAC en local, se espera el mensaje de error amable).

## Lo que esta entrega no hace

- La pantalla de Existencias (ajustes, conteo, recibir mercancía, traspasos), mínimos, alertas y reportes: entrega 3.
- La caja retail, el escáner, el cambio de talla con dinero y que la caja vea las variantes: entrega 4.
- Liberar `RETAIL` en el alta, el registro y el sitio: entrega 5.
- Code 128 en etiquetas; una clave SAT por defecto para tiendas en el CFDI (hoy sin clave se factura como restaurante: anotado para la entrega 4 o 5).
- Variantes visibles en promociones y menús por sucursal (hoy `listarProductos` las esconde).
- Antes de mezclar: aplicar 0188–0191 a producción y desplegar `buscar-clave-sat`.
