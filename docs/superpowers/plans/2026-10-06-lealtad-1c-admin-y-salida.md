# Lealtad 1C — Admin `/lealtad`, panel, reportes y salida: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño configure y encienda su programa de lealtad desde el admin, que VIM lo conceda desde el panel (o que el plan lo dé solo), que los reportes lo cuenten, y dejar todo listo para publicar la versión 0.5.0.

**Architecture:** El admin no decide reglas: llama a las funciones que el plan 1A ya dejó (`lealtad_guardar_programa`, `lealtad_ajustar_saldo`) y escribe premios bajo RLS. Una sola migración (`0159`) enciende el add-on en el catálogo, enseña el add-on al cambio de plan, cierra el hueco de factura que quedó de 1B y añade las vistas y funciones de lectura que el admin necesita. La regla «cuánto gana una compra» sale de `apps/pos` a `@vim/db/lealtad`, para que el POS y el admin usen la misma. Lo último es la salida: versión, notas, sitio y la lista de publicación, que ejecuta una persona.

**Tech Stack:** Next.js 15 / React 19 (`apps/admin`, `apps/platform`), TypeScript estricto, Vitest (`node`, solo `*.test.ts`), zod, Tailwind con tokens de `@vim/ui`, Postgres (una migración), smokes `.sql`, Edge Function Deno (`timbrar-cfdi`), escritorio Electron (`node:test`, scripts `verify:*`).

**Spec:** `docs/superpowers/specs/2026-10-05-lealtad-design.md` (§7 «Admin y panel», §8.6 «Orden de salida», §12). **ADR:** `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md` (sección «Lo que cerró el plan 1B y lo que queda para 1C»).

Tercero y último plan de la entrega 1. Se apila sobre **1B** (rama `feat/lealtad-1b`, PR Fermin03/vim-pos#112), que se apila sobre **1A** (#110). Ninguno está mezclado.

## Global Constraints

- **Rama y worktree:** `feat/lealtad-1c`, creada desde `feat/lealtad-1b`, en el worktree `C:/vwtN`. No se tocan `C:/vwtL` ni `C:/vwtM` (ahí se atienden los PR #110 y #112), ni el checkout principal, ni otros worktrees.
- **Prohibido en la ejecución:** `git push`, abrir PR o mezclar sin que Fermín lo pida; `supabase db reset`, `supabase test db`, `supabase start/stop`, `pnpm db:types`; cualquier cosa contra la nube; leer o usar `.env.local` de la raíz del repo (apunta a PRODUCCIÓN); `npm run dist`, publicar instaladores, `latest.json`; `npm run verify:push`, `verify:sync`, `verify`, `verify:dia`, `verify:hub`, `verify:robustez*`, `verify:concurrencia` (usan los puertos o los datos de la caja instalada); `next build` (rompe el dev server; se usa `tsc --noEmit`).
- **Una sola migración:** `supabase/migrations/0159_lealtad_admin.sql`, que crece por secciones (§1…§5) en las Tareas 1 y 2. Si al empezar `0159` ya existe en `origin/main`, usa el siguiente número libre y cámbialo en todo el plan. Las `0001`–`0158` no se editan. Corre también en el Postgres de cada caja: todo debe ser inocuo en local.
- **Funciones y vistas que ya existen se redefinen copiando su definición vigente ÍNTEGRA** y aplicando solo el cambio que el plan lista. Toda `CREATE OR REPLACE VIEW` repite `WITH (security_invoker = true)` (sin eso la vista deja de respetar RLS) y solo AÑADE columnas al final.
- **El admin se guía por `permitidos`, el POS por `efectivos`.** `/lealtad` aparece en el menú siempre; sin el add-on muestra una tarjeta que explica cómo pedirlo (regla de `docs/diseno/admin.md`: las secciones por plan no se esconden).
- **Configura dueño o administrador** (jerarquía ≥ 4). La frontera real es la base (`es_admin_del_tenant`); la tabla `MIN_JERARQUIA` solo evita enseñar lo que no se puede usar.
- **El admin no ofrece combos como premio** (`productos.es_combo`): el alta no lo impide en la base y el canje fallaría en caja.
- **Diseño del admin:** antes de tocar JSX lee `docs/diseno/admin.md` y `docs/diseno/nucleo.md`. Filas de 40 px, texto de 13–14 px, números a la derecha con `tabular-nums`, una confirmación que nombra la consecuencia para todo lo destructivo (`DialogoPeligro`, botón con verbo, nunca «Aceptar»). No hay componentes compartidos de input, select ni interruptor: se copian las constantes de clase de `configuracion/envios/page.tsx` y el `role="switch"` de `configuracion/integraciones/page.tsx`. `pnpm tipografia` falla con cualquier `text-[Npx]`.
- **Textos para el dueño:** de tú, en presente, sin jerga (nada de «RPC», «sync», «migración», «add-on» en pantalla: se dice «programa de lealtad»). Los errores dicen qué pasó y qué hacer.
- **TypeScript:** sin `any`. En `apps/admin` los `*.test.ts` SÍ entran al typecheck (su `tsconfig` solo excluye `node_modules`).
- **No hay ESLint en el repo.** Las dependencias de cada `useEffect`/`useCallback`/`useMemo` que se añada o cambie se revisan a mano y se dice en el reporte.
- **Versión:** esta entrega es una función nueva → `0.5.0` (regla de `docs/operacion/actualizaciones.md`). El número se cambia en la Tarea 12; empaquetar y publicar NO son parte de la ejecución.
- **Sin nombres ni números de clientes** en notas, sitio o documentación pública.
- **Commits** en español (`feat(lealtad): …`), terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Se agregan archivos por ruta explícita, nunca `git add -A`.
- **Cómo correr pruebas** (ruta absoluta siempre):
  - Admin, un archivo: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/<archivo>.test.ts`
  - Admin completo y tipos: `pnpm --filter @vim/admin test` · `pnpm --filter @vim/admin typecheck`
  - Panel: `pnpm --filter @vim/platform test` · `pnpm --filter @vim/platform typecheck`
  - POS: `pnpm --filter @vim/pos test` · `pnpm --filter @vim/pos typecheck`
  - Funciones: `pnpm -s test:functions`
  - Smokes: `cd C:/vwtN/desktop && node scripts/smokes.mjs <smoke>.sql` (~1 min; aplica todas las migraciones desde cero)
  - Escritorio: `cd C:/vwtN && node --test desktop/src/<archivo>.test.mjs`

## Alcance: qué entra y qué no

Entra:

| Qué | Dónde |
|---|---|
| Sección `/lealtad` con tres pestañas: Programa (mecánica con ejemplo en vivo, parámetros, interruptor), Premios, Movimientos (cuatro cifras, libro filtrable, vista de control) | `apps/admin` |
| Saldo de lealtad en la lista de clientes, con su historial y el ajuste manual | `apps/admin`, Clientes |
| «Lealtad» junto a los descuentos en el panel del día y en el consolidado por sucursal | `apps/admin` |
| El add-on `LEALTAD` visible en el panel de VIM, a $0 si el plan lo incluye; el cambio de plan lo concede o lo retira | `apps/platform` + SQL |
| Negocios que ya están en un plan que la incluye reciben el permiso al aplicar la migración | SQL (relleno único) |
| Un premio cuyos puntos se devolvieron DESPUÉS de cobrar sigue sin poder facturarse individual | SQL |
| `timbrar-cfdi` ya no deja pasar un timbrado si no pudo comprobar el premio | Edge Function |
| En el POS: no se quita ni se cambia al cliente de una cuenta con un canje a medias | `apps/pos` |
| Prueba de punta a punta del puente de la caja (gateway + nube de mentira) | `desktop/` |
| Versión 0.5.0, nota de la versión, páginas del sitio, documentación | `desktop/package.json`, `sitio-web/`, `docs/` |

No entra:

| Qué | Por qué / quién |
|---|---|
| Empaquetar y publicar el instalador, aplicar migraciones en producción, desplegar funciones, mezclar | Los hace una persona con la lista de la Tarea 12; exigen el visto bueno de Fermín |
| Pantalla del cliente con saldo (entrega 2) y página web con QR (entrega 3) | Entregas siguientes |
| Elegir modificadores del premio; canjear en Domicilio desde la captura | Decisiones de producto abiertas (ADR 0030) |
| Normalizar a dígitos los teléfonos ya guardados con formato | Choca con el índice único donde hay duplicados; necesita su propio plan con fusión de clientes |
| `estado_resultados_periodo` y `kpis_dia_sucursal` | Ninguna app las llama hoy; se les enseña `lealtad_mxn` cuando alguien las use |
| El IVA de las cuentas con descuento a nivel de cuenta | Problema anterior a la lealtad, con su propia tarea |
| ESLint en el repo | Tarea aparte; aquí los hooks se revisan a mano |
| «El encargado de sucursal ve los movimientos de la suya» (spec §7) | No existe RLS por sucursal en el proyecto (spec §13.3): la sección queda para dueño y administrador, con filtro por sucursal |

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0159_lealtad_admin.sql` (nuevo) | §1 premio revertido tras el pago · §2 add-on activo, cambio de plan y relleno · §3 reportes · §4 clientes · §5 lecturas del admin |
| `supabase/scripts/smoke_lealtad_factura.sql` | Su paso 5 cambia: revertido tras el pago sigue bloqueando |
| `supabase/scripts/smoke_lealtad_admin.sql` (nuevo) | Cambio de plan, vistas y cifras |
| `supabase/tests/0038_lealtad.test.sql` | El add-on ya no «nace inactivo» |
| `supabase/functions/timbrar-cfdi/index.ts` | Falla cerrado si no puede comprobar el premio |
| `packages/db/src/lealtad.ts` (nuevo) + `packages/db/package.json` | La regla de puntos y sus tipos, compartida por POS y admin |
| `packages/db/src/modulos.ts` | El módulo `lealtad` en el catálogo compartido |
| `apps/pos/app/lib/lealtad-reglas.ts` | Reexporta la regla desde `@vim/db/lealtad` |
| `apps/pos/app/lib/clientes-cuenta.ts`, `components/home-pos.tsx`, `pantalla-cuentas-modo.tsx` | No cambiar al cliente con un canje a medias |
| `apps/platform/app/lib/cambio-plan.ts`, `addons.ts`, `app/api/tenants/[id]/route.ts`, `components/ficha-contrato.tsx` | Lealtad en el cambio de plan, precio de alta y consecuencia de la baja |
| `apps/admin/app/lib/lealtad.ts` (nuevo) | Todo lo que el admin lee y escribe de lealtad, con sus esquemas y mensajes |
| `apps/admin/app/lib/lealtad-plan.ts` (nuevo) | Estado de la sección (cargando / permitida / sin contratar) y el mensaje de WhatsApp |
| `apps/admin/app/(panel)/lealtad/layout.tsx`, `page.tsx`, `premios/page.tsx`, `movimientos/page.tsx` (nuevos) | La sección y sus tres pestañas |
| `apps/admin/app/components/lealtad-sin-contratar.tsx`, `lealtad-pestanas.tsx` (nuevos) | Tarjeta «pídela» y navegación de pestañas |
| `apps/admin/app/components/admin-shell.tsx`, `lib/acceso.ts` | Entrada del menú y jerarquía mínima |
| `apps/admin/app/(panel)/clientes/page.tsx`, `lib/clientes.ts`, `components/cliente-lealtad.tsx` (nuevo) | Columna de saldo, historial y ajuste |
| `apps/admin/app/lib/reportes.ts`, `consolidado.ts`, `(panel)/dashboard/page.tsx`, `reportes/consolidado/page.tsx` | Lealtad junto a los descuentos |
| `desktop/src/verify-lealtad-canje.mjs` (nuevo) + `desktop/package.json` | Puente de la caja de punta a punta; versión 0.5.0 |
| `docs/…`, `sitio-web/…` | ADR, diseño del admin, alta de cliente, novedades, funciones, precios |

---

## Task 0: Worktree, dependencias y línea base

**Files:**
- Create: worktree `C:/vwtN` (rama `feat/lealtad-1c`)
- Create: `C:/vwtN/docs/superpowers/plans/2026-10-06-lealtad-1c-admin-y-salida.md` (copia de este plan)

- [ ] **Step 1: Crear el worktree desde la rama de 1B**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos" && git fetch origin && git worktree add C:/vwtN -b feat/lealtad-1c origin/feat/lealtad-1b
```

Expected: `Preparing worktree (new branch 'feat/lealtad-1c')` y un `HEAD is now at …` que es el último commit de `feat/lealtad-1b`.

- [ ] **Step 2: Dependencias**

```bash
cd C:/vwtN && pnpm install --frozen-lockfile --prefer-offline
```

```powershell
New-Item -ItemType Junction -Path "C:\vwtN\desktop\node_modules" -Target "D:\Users\Fermi\Documents\VIM MARKETING\Vim-marketing managment\PROYECTOS\VIM POS\vim-pos\desktop\node_modules"
New-Item -ItemType Directory -Force -Path "C:\vwtN\desktop\bin" | Out-Null
Copy-Item "D:\Users\Fermi\Documents\VIM MARKETING\Vim-marketing managment\PROYECTOS\VIM POS\vim-pos\desktop\bin\postgrest.exe" "C:\vwtN\desktop\bin\postgrest.exe"
```

Expected: `Done in …`; la junction aparece con `Mode d----l`; `postgrest.exe` copiado (los smokes lo exigen aunque no lo usen). La junction sirve para pruebas; **nunca** para empaquetar.

- [ ] **Step 3: Confirmar que `0159` está libre**

```bash
cd C:/vwtN && git ls-tree --name-only origin/main supabase/migrations/ | tail -2 && ls supabase/migrations | tail -3
```

Expected: `origin/main` termina en `0155_…` (o más, si 1A/1B ya se mezclaron); en local la última es `0158_lealtad_premio_sin_factura.sql`. Si `origin/main` trae una `0159` de otra rama, usa el siguiente número libre en todo el plan.

- [ ] **Step 4: Línea base**

```bash
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -4 && pnpm --filter @vim/admin typecheck 2>&1 | tail -2
cd C:/vwtN && pnpm --filter @vim/platform test 2>&1 | tail -4 && pnpm --filter @vim/platform typecheck 2>&1 | tail -2
cd C:/vwtN && pnpm --filter @vim/pos test 2>&1 | tail -4 && pnpm -s test:functions 2>&1 | tail -4
cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_factura.sql smoke_cobro_plan.sql 2>&1 | tail -4
```

Expected: todo en verde. Anota los números (archivos y pruebas de admin, panel y POS; 303 de funciones): son la línea base. Si algo falla aquí es anterior a este plan: detente y repórtalo.

- [ ] **Step 5: Guardar el plan en la rama**

```bash
mkdir -p C:/vwtN/docs/superpowers/plans && cp "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos/docs/superpowers/plans/2026-10-06-lealtad-1c-admin-y-salida.md" C:/vwtN/docs/superpowers/plans/ && cd C:/vwtN && git add docs/superpowers/plans/2026-10-06-lealtad-1c-admin-y-salida.md && git commit -m "docs(lealtad): plan 1C del admin, el panel y la salida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 1: Migración 0159 §1–§2 — el premio revertido tras el pago, el add-on y el cambio de plan

Tres cosas de la base que dejaron pendientes 1A y 1B:

1. **Factura.** `ticket_lleva_premio` solo cuenta canjes `NOT revertido`. Pero si los puntos de un premio se devuelven DESPUÉS de cobrar (lo hace la conciliación de la nube), los totales de una cuenta cerrada no se recalculan: el renglón sigue en $0 y esa cuenta volvería a admitir factura individual con un concepto en cero. Se decide por el estado del renglón, no por fechas: un premio revertido cuyo renglón sigue vivo y en $0 con su descuento puesto, sigue siendo un premio.
2. **Catálogo.** `LEALTAD` nació con `addons.activo = false` para que el panel no lo ofreciera sin pantallas detrás. Ya las hay.
3. **Plan.** `_sincronizar_addons_del_plan` solo conoce CFDI y DELIVERY. Los planes ya traen `lealtad_incluido` (0156), pero nadie lo lee.

**Files:**
- Create: `supabase/migrations/0159_lealtad_admin.sql` (§1 y §2)
- Create: `supabase/scripts/smoke_lealtad_admin.sql`
- Modify: `supabase/scripts/smoke_lealtad_factura.sql` (paso 5)
- Modify: `supabase/tests/0038_lealtad.test.sql` (la aserción «nace inactivo»)
- Modify: `supabase/functions/timbrar-cfdi/index.ts` (≈línea 181-187)

**Interfaces:**
- Produces: `ticket_lleva_premio(uuid)` con la semántica nueva; `_sincronizar_addons_del_plan` que concede y retira `LEALTAD`; `addons.activo = true` para `LEALTAD`; `timbrar-cfdi` contesta `503 { error: "NO_SE_PUDO_REVISAR_PREMIO" }` si la lectura falla por algo que no sea «la función no existe».

- [ ] **Step 1: Cambiar el paso 5 del smoke de factura para que falle**

En `supabase/scripts/smoke_lealtad_factura.sql`, sustituye el paso 5 (las tres líneas que empiezan en `-- 5) Un canje revertido ya no cuenta como premio.`) por:

```sql
  -- 5) Un premio revertido DESPUÉS de cobrar sigue siendo un premio: los totales de una cuenta
  --    cerrada no se recalculan, así que su renglón sigue en $0 (0159).
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_premio;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item) <> 0 THEN
    RAISE EXCEPTION 'el smoke supone que una cuenta cobrada no se recalcula al revertir su canje';
  END IF;
  IF NOT ticket_lleva_premio(v_premio) THEN
    RAISE EXCEPTION 'un premio revertido tras el pago dejó de bloquear la factura (su renglón sigue en $0)';
  END IF;

  -- 6) En cambio, quitar el premio de una cuenta ABIERTA sí lo libera: ahí el renglón vuelve a su precio.
  v_abierta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-d', v_maria);
  v_item3 := agregar_item_a_ticket(v_abierta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-d1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_abierta, v_cli, v_item3, 6, 120);
  IF NOT ticket_lleva_premio(v_abierta) THEN RAISE EXCEPTION 'el premio vivo de la cuenta abierta no se reconoce'; END IF;
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_abierta;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item3) <> 120 THEN
    RAISE EXCEPTION 'al quitar el premio de una cuenta abierta el renglón debió volver a $120';
  END IF;
  IF ticket_lleva_premio(v_abierta) THEN RAISE EXCEPTION 'un premio quitado de una cuenta abierta sigue contando'; END IF;
```

y en el `DECLARE` del mismo bloque añade `v_abierta uuid; v_item3 uuid;`.

Run: `cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_factura.sql`
Expected: FAIL con `un premio revertido tras el pago dejó de bloquear la factura`.

- [ ] **Step 2: Escribir el smoke nuevo, que también falla**

Crea `supabase/scripts/smoke_lealtad_admin.sql`:

```sql
-- Smoke lealtad · admin (0159). El add-on está activo en el catálogo; el cambio de plan concede y
-- retira la lealtad (y al retirarla apaga el interruptor del dueño); las vistas que usa el admin
-- traen sus columnas nuevas y las cifras del resumen cuadran. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_negocio uuid; v_esencial uuid; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- §2 · el catálogo y el cambio de plan
  IF NOT (SELECT activo FROM addons WHERE codigo = 'LEALTAD') THEN
    RAISE EXCEPTION 'el add-on LEALTAD sigue inactivo en el catálogo';
  END IF;
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  -- Se parte de un negocio sin la lealtad concedida.
  UPDATE tenant_addons ta SET activo = false, fecha_fin = (now() AT TIME ZONE 'America/Mexico_City')::date
    FROM addons a WHERE a.id = ta.addon_id AND a.codigo = 'LEALTAD' AND ta.tenant_id = v_tenant AND ta.activo;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF NOT (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'subir a Negocio no concedió la lealtad: %', v_r; END IF;
  IF NOT tenant_addon_activo(v_tenant, 'LEALTAD') THEN RAISE EXCEPTION 'la lealtad no quedó concedida'; END IF;
  IF NOT (SELECT bool_and(precio_mensual_mxn = 0 AND incluido_en_plan) FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
           WHERE ta.tenant_id = v_tenant AND a.codigo = 'LEALTAD' AND ta.activo) THEN
    RAISE EXCEPTION 'la lealtad incluida en el plan debe quedar a $0 y marcada como incluida';
  END IF;
  -- Repetir no la duplica ni la vuelve a contar.
  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'conceder dos veces no es inocuo: %', v_r; END IF;

  -- El dueño la enciende (necesita programa) y al bajar a Esencial se retira y se apaga sola.
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_tenant, 'PUNTOS_DINERO', 5)
    ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  IF NOT (modulos_efectivos(v_tenant)->'efectivos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad no quedó efectiva'; END IF;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_esencial, true);
  IF NOT (v_r->'retirados') ? 'LEALTAD' THEN RAISE EXCEPTION 'bajar a Esencial no retiró la lealtad: %', v_r; END IF;
  IF (modulos_efectivos(v_tenant)->'permitidos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad sigue permitida tras bajar de plan'; END IF;
  IF (SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'al retirar la lealtad el interruptor del dueño debió apagarse';
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD ADMIN §2 OK';
END $$;
ROLLBACK;
```

Run: `cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_admin.sql`
Expected: FAIL con `el add-on LEALTAD sigue inactivo en el catálogo`.

- [ ] **Step 3: Escribir §1 y §2 de la migración**

Crea `supabase/migrations/0159_lealtad_admin.sql`:

```sql
-- 0159 · Lealtad: lo que el admin, el panel y la salida necesitan de la base (ADR 0030, plan 1C).
--
--   §1  Un premio revertido DESPUÉS de cobrar sigue sin admitir factura individual.
--   §2  El add-on LEALTAD se enciende en el catálogo; el cambio de plan lo concede y lo retira; los
--       negocios que ya están en un plan que la incluye reciben el permiso.
--   §3  Los reportes del admin aprenden tickets.lealtad_mxn.            (Tarea 2)
--   §4  La lista de clientes trae el saldo.                             (Tarea 2)
--   §5  Lecturas de la sección /lealtad: libro, cifras y vista de control. (Tarea 2)
--
-- Corre también en el Postgres de cada caja al arrancar: solo redefine funciones y vistas de lectura,
-- enciende una fila de catálogo y rellena una tabla que en la caja está vacía.

-- ── §1 El premio revertido tras el pago ──────────────────────────────────────
-- Hasta aquí ticket_lleva_premio (0158) contaba solo los canjes NOT revertido. Pero la conciliación
-- de la nube (_vim_conciliar_canjes, 0156) puede marcar `revertido` el premio de una cuenta YA
-- cobrada, y los totales de una cuenta cerrada no se recalculan: el renglón se queda en $0 con su
-- descuento puesto. Esa cuenta volvería a admitir factura individual con un concepto en cero, que es
-- justo lo que el candado existe para impedir.
--
-- Se decide por el ESTADO DEL RENGLÓN, no por fechas: un canje revertido cuyo renglón sigue vivo, en
-- $0 y con descuento, sigue siendo un premio. Cuando el canje se quita de una cuenta abierta el
-- recálculo devuelve el renglón a su precio y deja de contar (smoke_lealtad_factura.sql, pasos 5 y 6).
CREATE OR REPLACE FUNCTION ticket_lleva_premio(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ticket_canjes_lealtad c
     WHERE c.ticket_id = p_ticket_id AND c.ticket_item_id IS NOT NULL
       AND (NOT c.revertido
            OR EXISTS (SELECT 1 FROM ticket_items i
                        WHERE i.id = c.ticket_item_id AND NOT i.cancelado
                          AND i.total_item_mxn = 0 AND i.promocion_item_mxn > 0)));
$$;
COMMENT ON FUNCTION ticket_lleva_premio(uuid) IS
  'TRUE si la cuenta lleva un premio de producto de lealtad: un canje vivo, o uno revertido cuyo renglón sigue en $0 (cuenta ya cobrada). Esas cuentas no admiten factura individual (0158, 0159).';

-- ── §2 El add-on, el cambio de plan y el relleno ─────────────────────────────
-- Nació inactivo (0156) porque el panel de VIM lista todo add-on activo con un botón de activar y
-- todavía no había pantallas detrás. Ya las hay.
UPDATE addons SET activo = true, updated_at = now() WHERE codigo = 'LEALTAD' AND NOT activo;
```

Ahora la función del cambio de plan. **Copia ÍNTEGRO** el `CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan(…)` de `supabase/migrations/0141_cobro_promocion_prueba_plan.sql` (líneas 277-353: desde el `CREATE` hasta los dos `REVOKE`/`GRANT` que le siguen) y pégalo debajo, con este encabezado y con UN solo cambio: la lista de `VALUES`.

```sql
-- El cambio de plan también concede y retira la lealtad. Cuerpo copiado ÍNTEGRO de
-- 0141_cobro_promocion_prueba_plan.sql:277-353 (única definición vigente); el único cambio es que la
-- lista de add-ons gana ('LEALTAD', 'lealtad_incluido'), la bandera que la 0156 ya dejó en los planes.
-- Retirarla dispara trg_tenant_addons_apaga_lealtad (0156), que apaga el interruptor del dueño.
-- Su espejo en TS es ADDONS_DEL_PLAN (apps/platform/app/lib/cambio-plan.ts): si cambias uno, cambia el otro.
```

La línea que cambia queda así:

```sql
  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido')) AS x(codigo, bandera) LOOP
```

Comprueba que eso fue lo único que cambió:

```bash
cd C:/vwtN && diff <(sed -n '277,353p' supabase/migrations/0141_cobro_promocion_prueba_plan.sql) <(sed -n '/^CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan/,/^GRANT EXECUTE ON FUNCTION public._sincronizar_addons_del_plan/p' supabase/migrations/0159_lealtad_admin.sql)
```

Expected: una sola diferencia, la línea `FOR r IN SELECT * FROM (VALUES …`. Cualquier otra significa que la copia está mal: manda el archivo `0141`.

Y al final de §2, el relleno:

```sql
-- Los negocios que YA están en un plan que incluye la lealtad no pasarán por un cambio de plan: se
-- les concede aquí, una vez, a $0 e «incluido en el plan». Es solo el permiso: sigue apagada hasta que
-- el dueño configure su programa y la encienda. En la caja `suscripciones` está vacía y no hace nada.
INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
SELECT s.tenant_id, a.id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 0,
       'Incluido en el plan ' || p.nombre, true
  FROM suscripciones s
  JOIN planes p ON p.id = s.plan_id
  CROSS JOIN addons a
 WHERE a.codigo = 'LEALTAD'
   AND s.estado = 'ACTIVA'
   AND COALESCE((p.features_incluidos ->> 'lealtad_incluido')::boolean, false)
   AND NOT EXISTS (SELECT 1 FROM tenant_addons x
                    WHERE x.tenant_id = s.tenant_id AND x.addon_id = a.id AND x.activo)
ON CONFLICT ON CONSTRAINT addon_unico_activo DO NOTHING;
```

- [ ] **Step 4: Correr los smokes**

Run: `cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_factura.sql smoke_lealtad_admin.sql smoke_cobro_plan.sql smoke_lealtad_totales.sql`
Expected: los cuatro `OK`. `smoke_cobro_plan.sql` ejercita el cambio de plan de siempre (CFDI y DELIVERY): si falla, la copia de la función está mal.

Si `smoke_lealtad_admin.sql` falla en `tenant_addon_activo(...)` con permiso denegado, no es el caso (los smokes corren como `postgres`); si falla al insertar en `configuracion_tenant` con `SIN_ADDON_LEALTAD`, el `_sincronizar…` no concedió: revisa la línea de `VALUES`.

- [ ] **Step 5: La guardia pgTAP**

En `supabase/tests/0038_lealtad.test.sql`, la aserción

```sql
select is((select activo from addons where codigo = 'LEALTAD'), false, 'el add-on LEALTAD existe y nace inactivo en el catálogo');
```

pasa a:

```sql
select is((select activo from addons where codigo = 'LEALTAD'), true, 'el add-on LEALTAD está activo en el catálogo (0159)');
```

En el mismo archivo hay un `insert into tenant_addons` para el negocio de la prueba (≈línea 80). El relleno de §2 pudo haberle concedido ya la lealtad ese mismo día, y la restricción `addon_unico_activo (tenant_id, addon_id, fecha_inicio)` rechazaría un segundo alta. Añade `on conflict on constraint addon_unico_activo do update set activo = true` a ese `insert` (y solo a ese). pgTAP no se ejecuta en local: anota «pgTAP ajustada, no ejecutada».

- [ ] **Step 6: `timbrar-cfdi` deja de fallar abierto**

En `supabase/functions/timbrar-cfdi/index.ts`, dentro del bloque `if (String(c.tipo_comprobante) === "INGRESO") {` que consulta `ticket_lleva_premio`, sustituye la línea del `console.warn` por:

```ts
    // Si la lectura falla, NO se timbra a ciegas: timbrar una cuenta con premio deja un concepto en
    // cero ante el SAT, y eso no se deshace con un clic. La única excepción es que la función todavía
    // no exista (la 0158 sin aplicar): ahí no hay candado ni premios que facturar mal, y bloquear
    // tumbaría toda la facturación individual durante el despliegue.
    if (pErr) {
      const noExiste = pErr.code === "PGRST202" || pErr.code === "42883";
      console.warn(`[lealtad] no se pudo revisar el premio del ticket ${ticketId}: ${pErr.message}`);
      if (!noExiste) {
        return json({ error: "NO_SE_PUDO_REVISAR_PREMIO", detalle: "No se pudo comprobar la cuenta antes de facturar. Inténtalo de nuevo en un momento." }, 503);
      }
    }
```

y corrige el comentario de arriba del bloque para que no diga que «se sigue de largo»: ahora solo se sigue si la función no existe.

Run: `cd C:/vwtN && pnpm -s test:functions 2>&1 | tail -4`
Expected: 303/303 (el punto de entrada no tiene prueba unitaria; lo cubre la lista de salida).

- [ ] **Step 7: Commit**

```bash
cd C:/vwtN && git add supabase/migrations/0159_lealtad_admin.sql supabase/scripts/smoke_lealtad_admin.sql supabase/scripts/smoke_lealtad_factura.sql supabase/tests/0038_lealtad.test.sql supabase/functions/timbrar-cfdi/index.ts && git commit -m "feat(lealtad): el add-on se enciende, el plan lo concede y un premio revertido tras el pago no se factura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Migración 0159 §3–§5 — reportes, clientes y lecturas del admin

**Files:**
- Modify: `supabase/migrations/0159_lealtad_admin.sql` (añade §3, §4, §5 al final)
- Modify: `supabase/scripts/smoke_lealtad_admin.sql` (segundo bloque `DO`)

**Interfaces:**
- Produces:
  - `vw_estado_resultados_dia.lealtad_mxn` y `vw_ventas_por_marca.lealtad_mxn` (última columna de cada una)
  - `vw_clientes_lista.lealtad_saldo integer`, `vw_clientes_lista.lealtad_vence_el date` (últimas dos columnas)
  - vista `vw_lealtad_movimientos` (columnas: `id, tenant_id, fecha, tipo, puntos, saldo_visto, motivo, monto_mxn, programa_version, cliente_id, cliente_nombre, cliente_telefono, sucursal_id, sucursal_nombre, usuario_id, usuario_nombre, ticket_id, ticket_folio`)
  - `lealtad_resumen(p_desde date, p_hasta date, p_sucursal uuid DEFAULT NULL) RETURNS jsonb` → `{ emitido, canjeado, saldo_vivo, clientes_con_saldo }`
  - `lealtad_control(p_desde date, p_hasta date) RETURNS jsonb` → `{ clientes_al_tope: [{cliente_id, cliente_nombre, dias_al_tope}], cajeros: [{usuario_id, usuario_nombre, canjes, clientes, puntos, del_cliente_top}] }`

- [ ] **Step 1: Añadir al smoke el bloque que falla**

Al final de `supabase/scripts/smoke_lealtad_admin.sql`, entre el `END $$;` del primer bloque y el `ROLLBACK;`, añade:

```sql
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_prod uuid; v_ana uuid; v_luis uuid; v_t uuid; v_r jsonb; i int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_tenant, 'PUNTOS_DINERO', 5, 2)
    ON CONFLICT (tenant_id) DO UPDATE SET mecanica = 'PUNTOS_DINERO', porcentaje = 5, tope_compras_dia = 2;
  INSERT INTO clientes (tenant_id, nombre, apellido_paterno, telefono) VALUES (v_tenant, 'Ana', 'Resumen', '4770001591') RETURNING id INTO v_ana;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Luis', '4770001592') RETURNING id INTO v_luis;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LADM', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Movimientos a mano (como postgres): Ana gana 10 y 6 en dos cuentas de hoy, y canjea 5 tres veces con María.
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 10, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 6, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  FOR i IN 1..3 LOOP
    PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'CANJE', -5, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  END LOOP;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_luis, 'GANADO', 4, 1, gen_random_uuid(), v_suc, v_caja, v_maria);

  -- §5 · resumen: emitido 20, canjeado 15, saldo vivo 1 + 4 = 5, dos clientes con saldo.
  v_r := lealtad_resumen(v_hoy, v_hoy, NULL);
  IF (v_r->>'emitido')::int <> 20 OR (v_r->>'canjeado')::int <> 15 THEN RAISE EXCEPTION 'resumen mal: %', v_r; END IF;
  IF (v_r->>'saldo_vivo')::int <> 5 OR (v_r->>'clientes_con_saldo')::int <> 2 THEN RAISE EXCEPTION 'saldos del resumen mal: %', v_r; END IF;
  -- Con una sucursal que no es, emitido y canjeado quedan en cero; el saldo es del negocio entero.
  v_r := lealtad_resumen(v_hoy, v_hoy, gen_random_uuid());
  IF (v_r->>'emitido')::int <> 0 OR (v_r->>'saldo_vivo')::int <> 5 THEN RAISE EXCEPTION 'filtro por sucursal mal: %', v_r; END IF;

  -- §5 · control: Ana llegó al tope (2 cuentas) hoy; hace falta que le pase 2 días para salir en la lista.
  v_r := lealtad_control(v_hoy, v_hoy);
  IF jsonb_array_length(v_r->'clientes_al_tope') <> 0 THEN RAISE EXCEPTION 'un solo día al tope no debe salir: %', v_r; END IF;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 1, 1, gen_random_uuid(), v_suc, v_caja, v_maria, p_fecha => now() - interval '1 day');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 1, 1, gen_random_uuid(), v_suc, v_caja, v_maria, p_fecha => now() - interval '1 day');
  v_r := lealtad_control(v_hoy - 1, v_hoy);
  IF (v_r->'clientes_al_tope'->0->>'dias_al_tope')::int <> 2 OR v_r->'clientes_al_tope'->0->>'cliente_nombre' <> 'Ana Resumen' THEN
    RAISE EXCEPTION 'clientes al tope mal: %', v_r;
  END IF;
  -- María hizo 3 canjes, todos a la misma clienta.
  IF (v_r->'cajeros'->0->>'canjes')::int <> 3 OR (v_r->'cajeros'->0->>'clientes')::int <> 1 OR (v_r->'cajeros'->0->>'del_cliente_top')::int <> 3 THEN
    RAISE EXCEPTION 'cajeros con canjes concentrados mal: %', v_r;
  END IF;

  -- §5 · el libro trae nombres, no solo ids.
  IF NOT EXISTS (SELECT 1 FROM vw_lealtad_movimientos WHERE cliente_nombre = 'Ana Resumen' AND tipo = 'CANJE' AND sucursal_nombre IS NOT NULL) THEN
    RAISE EXCEPTION 'vw_lealtad_movimientos no trae el nombre del cliente o de la sucursal';
  END IF;

  -- §4 · la lista de clientes trae el saldo del programa vigente; el de otra versión no cuenta.
  IF (SELECT lealtad_saldo FROM vw_clientes_lista WHERE id = v_ana) <> 3 THEN RAISE EXCEPTION 'saldo de Ana en la lista de clientes'; END IF;
  UPDATE lealtad_programa SET version = 2 WHERE tenant_id = v_tenant;
  IF (SELECT lealtad_saldo FROM vw_clientes_lista WHERE id = v_ana) <> 0 THEN RAISE EXCEPTION 'un saldo de otra versión del programa no debe mostrarse'; END IF;
  UPDATE lealtad_programa SET version = 1 WHERE tenant_id = v_tenant;

  -- §3 · el reporte del día suma el canje de una cuenta cobrada.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-ladm-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ladm-1a');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_ana, 20, 20);
  PERFORM aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 100, 100);
  IF (SELECT lealtad_mxn FROM vw_estado_resultados_dia WHERE tenant_id = v_tenant AND sucursal_id = v_suc AND dia_contable = v_hoy) <> 20 THEN
    RAISE EXCEPTION 'vw_estado_resultados_dia no suma lealtad_mxn';
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD ADMIN §3-§5 OK';
END $$;
```

Run: `cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_admin.sql`
Expected: FAIL con `function lealtad_resumen(date, date, unknown) does not exist`.

- [ ] **Step 2: §3 — los reportes**

Añade al final de `0159_lealtad_admin.sql`. El cuerpo de `vw_estado_resultados_dia` es el de `0011_reportes_cierres.sql:723-772` copiado íntegro, con la columna nueva AL FINAL:

```sql
-- ── §3 Los reportes del admin aprenden lealtad_mxn ───────────────────────────
-- CREATE OR REPLACE VIEW exige las mismas columnas en el mismo orden: la nueva va al final. Y repite
-- WITH (security_invoker = true): sin eso la vista deja de respetar la RLS de tickets (0111, 0044).
-- Cuerpo copiado ÍNTEGRO de 0011_reportes_cierres.sql:723-772; el único cambio es la última columna.
CREATE OR REPLACE VIEW vw_estado_resultados_dia WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,

  -- ===== Tickets =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))    AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')                 AS tickets_cancelados,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('BORRADOR', 'ABIERTO'))    AS tickets_pendientes,

  -- ===== Ingresos brutos =====
  COALESCE(SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS subtotal_neto_mxn,
  COALESCE(SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS iva_neto_mxn,
  COALESCE(SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS total_neto_mxn,

  -- ===== Descuentos y promociones =====
  COALESCE(SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS descuentos_manuales_mxn,
  COALESCE(SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS promociones_mxn,

  -- ===== Propinas =====
  COALESCE(SUM(t.propina_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS propinas_capturadas_mxn,

  -- ===== Devoluciones (subquery) =====
  COALESCE((SELECT SUM(d.total_devuelto_mxn) FROM devoluciones d
            WHERE d.sucursal_id = t.sucursal_id AND d.dia_contable = t.dia_contable
            AND d.estado = 'CONFIRMADA' AND d.deleted_at IS NULL), 0) AS devoluciones_mxn,

  -- ===== Cancelaciones de tickets pagados (subquery) =====
  COALESCE((SELECT SUM(c.ticket_total_snapshot) FROM cancelaciones_ticket c
            WHERE c.sucursal_id = t.sucursal_id AND c.dia_contable = t.dia_contable
            AND c.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')), 0) AS cancelaciones_post_pago_mxn,

  -- ===== Comisiones de apps externas (estimación basada en liquidaciones disponibles) =====
  COALESCE((SELECT SUM(ali.monto_comision_mxn) FROM apps_liquidacion_items ali
            JOIN tickets t2 ON t2.id = ali.ticket_id_match
            WHERE t2.sucursal_id = t.sucursal_id AND t2.dia_contable = t.dia_contable), 0) AS comisiones_apps_mxn,

  -- ===== Tickets por modo de servicio =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'PARA_LLEVAR')          AS tickets_para_llevar,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'COMER_AQUI')           AS tickets_comer_aqui,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'DELIVERY_PROPIO')      AS tickets_delivery_propio,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio::text LIKE 'APP_%')             AS tickets_apps,

  -- ===== Ticket promedio =====
  COALESCE(AVG(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS ticket_promedio_mxn,

  -- ===== 0159: lo descontado por canjes de lealtad (tercer carril, aparte de los dos de arriba) =====
  COALESCE(SUM(t.lealtad_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS lealtad_mxn

FROM tickets t
WHERE t.deleted_at IS NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable;
```

Verifica contra el original (la única diferencia debe ser el encabezado `WITH (security_invoker…)`, la coma tras `ticket_promedio_mxn` y las dos líneas nuevas):

```bash
cd C:/vwtN && diff <(sed -n '723,772p' supabase/migrations/0011_reportes_cierres.sql) <(sed -n '/^CREATE OR REPLACE VIEW vw_estado_resultados_dia/,/^GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable;/p' supabase/migrations/0159_lealtad_admin.sql)
```

Y la vista por marca, cuerpo de `0010_verticales.sql:1561-1586` con la columna al final:

```sql
-- Cuerpo copiado ÍNTEGRO de 0010_verticales.sql:1561-1586; el único cambio es la última columna.
CREATE OR REPLACE VIEW vw_ventas_por_marca WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.marca_virtual_id,
  mv.nombre               AS marca_nombre,
  mv.color_primario_hex            AS marca_color,

  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))  AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')               AS tickets_cancelados,

  SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS subtotal_neto_mxn,
  SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS iva_neto_mxn,
  SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS total_neto_mxn,
  SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS descuentos_manuales_mxn,
  SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS promociones_mxn,

  AVG(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS ticket_promedio_mxn,

  SUM(t.lealtad_mxn)  FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS lealtad_mxn

FROM tickets t
JOIN marcas_virtuales mv ON mv.id = t.marca_virtual_id
WHERE t.deleted_at IS NULL
  AND t.marca_virtual_id IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         t.marca_virtual_id, mv.nombre, mv.color_primario_hex;
```

- [ ] **Step 3: §4 — la lista de clientes**

```sql
-- ── §4 La lista de clientes trae el saldo ────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0118_clientes_lista_paginada.sql:26-55; se añaden dos columnas al final y
-- el LEFT JOIN de donde salen. Un saldo de otra versión del programa ya no vale: se muestra 0.
-- vw_clientes_kpis (0118) lee de esta vista por nombre de columna y no se entera.
CREATE OR REPLACE VIEW vw_clientes_lista WITH (security_invoker = on) AS
SELECT
  c.id,
  c.tenant_id,
  c.nombre,
  c.apellido_paterno,
  c.telefono,
  c.email,
  c.rfc,
  c.razon_social,
  c.codigo_postal_fiscal,
  c.tipo_fiscal,
  c.notas_internas,
  c.estado,
  c.created_at,
  COALESCE(r.compras, 0)          AS compras,
  COALESCE(r.gasto_total_mxn, 0)  AS gasto_total_mxn,
  r.ultima_visita,
  COALESCE(ls.saldo, 0)           AS lealtad_saldo,
  ls.vence_el                     AS lealtad_vence_el
FROM clientes c
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int          AS compras,
         SUM(t.total_mxn)       AS gasto_total_mxn,
         MAX(t.fecha_pago)      AS ultima_visita
    FROM tickets t
   WHERE t.cliente_id = c.id
     AND t.tenant_id  = c.tenant_id
     AND t.deleted_at IS NULL
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
) r ON true
LEFT JOIN LATERAL (
  SELECT s.saldo, s.vence_el
    FROM lealtad_saldos s
    JOIN lealtad_programa p ON p.tenant_id = s.tenant_id AND p.version = s.programa_version
   WHERE s.cliente_id = c.id
) ls ON true
WHERE c.deleted_at IS NULL;
```

- [ ] **Step 4: §5 — el libro, las cifras y la vista de control**

```sql
-- ── §5 Lecturas de la sección /lealtad del admin ─────────────────────────────
-- El libro con nombres. security_invoker: cada quien ve lo que su RLS le deja (los movimientos de su
-- negocio). sucursal_id, usuario_id y ticket_id no tienen llave foránea a propósito (0156), así que
-- todos van con LEFT JOIN: un movimiento cuyo ticket aún no llega se ve igual, sin folio.
CREATE OR REPLACE VIEW vw_lealtad_movimientos WITH (security_invoker = true) AS
SELECT
  m.id, m.tenant_id, m.fecha, m.tipo, m.puntos, m.saldo_visto, m.motivo, m.monto_mxn, m.programa_version,
  m.cliente_id,
  btrim(concat_ws(' ', c.nombre, c.apellido_paterno))  AS cliente_nombre,
  c.telefono                                           AS cliente_telefono,
  m.sucursal_id,
  s.nombre                                             AS sucursal_nombre,
  m.usuario_id,
  btrim(concat_ws(' ', u.nombre, u.apellido_paterno))  AS usuario_nombre,
  m.ticket_id,
  t.folio_completo                                     AS ticket_folio
FROM lealtad_movimientos m
JOIN clientes c ON c.id = m.cliente_id
LEFT JOIN sucursales s      ON s.id = m.sucursal_id
LEFT JOIN usuarios_perfil u ON u.id = m.usuario_id
LEFT JOIN tickets t         ON t.id = m.ticket_id;
GRANT SELECT ON vw_lealtad_movimientos TO authenticated, service_role;
COMMENT ON VIEW vw_lealtad_movimientos IS 'El libro de la lealtad con nombres, para la sección /lealtad del admin (0159).';

-- Las cuatro cifras de la pestaña Movimientos. SECURITY INVOKER: suma lo que la RLS deja ver.
-- «Emitido» y «canjeado» son del rango y de la sucursal elegida; el saldo vivo y los clientes con
-- saldo son del negocio entero y de HOY (un saldo no pertenece a una sucursal ni a un rango).
-- Solo cuenta el programa vigente: lo de una mecánica anterior no se suma con la actual.
CREATE OR REPLACE FUNCTION lealtad_resumen(p_desde date, p_hasta date, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH prog AS (SELECT version FROM lealtad_programa WHERE tenant_id = current_tenant_id()),
  mov AS (
    SELECT m.tipo, m.puntos
      FROM lealtad_movimientos m, prog
     WHERE m.tenant_id = current_tenant_id()
       AND m.programa_version = prog.version
       AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
       AND (p_sucursal IS NULL OR m.sucursal_id = p_sucursal)),
  sal AS (
    SELECT s.saldo
      FROM lealtad_saldos s, prog
     WHERE s.tenant_id = current_tenant_id() AND s.programa_version = prog.version AND s.saldo > 0)
  SELECT jsonb_build_object(
    'emitido',            COALESCE((SELECT SUM(puntos) FROM mov WHERE tipo IN ('GANADO', 'REVERSA_GANADO')), 0),
    'canjeado',           COALESCE((SELECT -SUM(puntos) FROM mov WHERE tipo IN ('CANJE', 'REVERSA_CANJE')), 0),
    'saldo_vivo',         COALESCE((SELECT SUM(saldo) FROM sal), 0),
    'clientes_con_saldo', (SELECT COUNT(*) FROM sal));
$$;
REVOKE ALL ON FUNCTION lealtad_resumen(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_resumen(date, date, uuid) TO authenticated, service_role;

-- La vista de control (spec §7): dos señales de posible abuso, no acusaciones.
--   · clientes que llegaron al tope diario de compras 2 días o más dentro del rango;
--   · cajeros con 3 canjes o más, ordenados por qué tanto se concentran en un solo cliente.
-- Como mucho 20 de cada una.
CREATE OR REPLACE FUNCTION lealtad_control(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH prog AS (SELECT version, tope_compras_dia FROM lealtad_programa WHERE tenant_id = current_tenant_id()),
  mov AS (
    SELECT m.*, (m.fecha AT TIME ZONE 'America/Mexico_City')::date AS dia
      FROM lealtad_movimientos m, prog
     WHERE m.tenant_id = current_tenant_id() AND m.programa_version = prog.version
       AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta),
  dias AS (
    SELECT cliente_id, dia, COUNT(DISTINCT ticket_id) AS compras
      FROM mov WHERE tipo = 'GANADO' GROUP BY cliente_id, dia),
  tope AS (
    SELECT d.cliente_id, COUNT(*) AS dias_al_tope
      FROM dias d, prog WHERE d.compras >= prog.tope_compras_dia
     GROUP BY d.cliente_id HAVING COUNT(*) >= 2),
  par AS (
    SELECT usuario_id, cliente_id, COUNT(*) AS n, -SUM(puntos) AS pts
      FROM mov WHERE tipo = 'CANJE' AND usuario_id IS NOT NULL GROUP BY usuario_id, cliente_id),
  caj AS (
    SELECT usuario_id, SUM(n)::int AS canjes, COUNT(*)::int AS clientes, SUM(pts)::int AS puntos, MAX(n)::int AS del_cliente_top
      FROM par GROUP BY usuario_id HAVING SUM(n) >= 3)
  SELECT jsonb_build_object(
    'clientes_al_tope', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'dias_al_tope')::int DESC, x->>'cliente_nombre')
        FROM (SELECT jsonb_build_object(
                'cliente_id', t.cliente_id,
                'cliente_nombre', btrim(concat_ws(' ', c.nombre, c.apellido_paterno)),
                'dias_al_tope', t.dias_al_tope) AS x
                FROM tope t JOIN clientes c ON c.id = t.cliente_id
               ORDER BY t.dias_al_tope DESC LIMIT 20) q), '[]'::jsonb),
    'cajeros', COALESCE((
      SELECT jsonb_agg(x ORDER BY ((x->>'del_cliente_top')::numeric / (x->>'canjes')::numeric) DESC, (x->>'canjes')::int DESC)
        FROM (SELECT jsonb_build_object(
                'usuario_id', k.usuario_id,
                'usuario_nombre', btrim(concat_ws(' ', u.nombre, u.apellido_paterno)),
                'canjes', k.canjes, 'clientes', k.clientes, 'puntos', k.puntos, 'del_cliente_top', k.del_cliente_top) AS x
                FROM caj k LEFT JOIN usuarios_perfil u ON u.id = k.usuario_id
               ORDER BY (k.del_cliente_top::numeric / k.canjes) DESC, k.canjes DESC LIMIT 20) q), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION lealtad_control(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_control(date, date) TO authenticated, service_role;
```

- [ ] **Step 5: Correr los smokes**

Run: `cd C:/vwtN/desktop && node scripts/smokes.mjs smoke_lealtad_admin.sql smoke_cierre.sql smoke_lealtad_corte.sql`
Expected: los tres `OK`.

Si el bloque nuevo falla en `lealtad_registrar_movimiento(… p_fecha => …)`, confirma la firma en `0156_lealtad.sql` (≈línea 403: `p_id, p_tenant, p_cliente, p_tipo, p_puntos, p_version, p_ticket, p_sucursal, p_caja, p_usuario, p_premio, p_monto, p_motivo, p_canje_mov, p_fecha, p_saldo_visto`) y ajusta la llamada del smoke, no la función. Si falla la cifra `saldo_vivo`, recuerda que los movimientos de ayer también suman al saldo: recalcula lo esperado antes de tocar el SQL y, si el número del smoke era el equivocado, corrígelo y dilo en el reporte bajo «Desviaciones del brief».

- [ ] **Step 6: Las guardias pgTAP de vistas y funciones**

```bash
cd C:/vwtN && grep -n "vw_clientes_lista\|vw_estado_resultados_dia\|security_invoker" supabase/tests/0002_rls_cobertura.test.sql | head -8
```

Expected: una prueba genérica («toda vista vw_* declara security_invoker») que las tres vistas cumplen porque el `CREATE` lo repite. No hay lista que mantener. Anota «pgTAP revisada, no ejecutada».

- [ ] **Step 7: Commit**

```bash
cd C:/vwtN && git add supabase/migrations/0159_lealtad_admin.sql supabase/scripts/smoke_lealtad_admin.sql && git commit -m "feat(lealtad): reportes, lista de clientes y lecturas del admin conocen la lealtad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: La regla de puntos sale a `@vim/db/lealtad`

La regla «cuánto gana una compra» vive en SQL y tiene un espejo en TS dentro de `apps/pos`. El admin la necesita para el ejemplo en vivo del programa. Dos espejos en TS serían tres copias de una regla: se muda a `@vim/db`, que ya comparten las apps (`@vim/db/cobro`, `@vim/db/modulos`).

**Files:**
- Create: `packages/db/src/lealtad.ts`
- Modify: `packages/db/package.json` (`exports`)
- Modify: `apps/pos/app/lib/lealtad-reglas.ts` (deja de definir `Mecanica`, `puntosPorCompra`, `unidad`, `cantidad`: los reexporta)

**Interfaces:**
- Produces (en `@vim/db/lealtad`):
  - `type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS"`
  - `type ReglaGanar = { mecanica: Mecanica; porcentaje: number | null; pesosPorPunto: number | null; compraMinima: number }`
  - `puntosPorCompra(regla: ReglaGanar, base: number): number`
  - `unidad(mecanica: Mecanica, n: number): string`, `cantidad(mecanica: Mecanica, n: number): string`
- `apps/pos/app/lib/lealtad-reglas.ts` sigue exportando los mismos nombres: ningún otro archivo del POS cambia.

- [ ] **Step 1: Crear el módulo compartido**

`packages/db/src/lealtad.ts`:

```ts
// La regla de la lealtad que comparten el POS y el admin (ADR 0030). Lógica PURA: sin red, sin base.
//
// `puntosPorCompra` es el ESPEJO en TS de `lealtad_puntos_por_compra`
// (supabase/migrations/0156_lealtad.sql). La de SQL es la que escribe el movimiento; esta solo anuncia
// en pantalla lo que va a pasar (el «gana X» de la caja, el ejemplo del admin). Si cambias una, cambia
// la otra: sus casos de prueba son los mismos seis de supabase/scripts/smoke_lealtad_ganar.sql y viven
// en apps/pos/app/lib/__tests__/lealtad-reglas.test.ts.

export type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS";

/** Lo que hace falta de `lealtad_programa` para saber cuánto gana una compra. */
export type ReglaGanar = {
  mecanica: Mecanica;
  porcentaje: number | null;      // PUNTOS_DINERO
  pesosPorPunto: number | null;   // PUNTOS_PREMIOS
  compraMinima: number;
};

/**
 * Cuánto gana una compra de `base` pesos (lo pagado por comida: sin propina y sin envío).
 *
 * Se calcula en centavos enteros: `0.3 / 0.1` en coma flotante da 2.9999… y perdería un punto que
 * Postgres (numeric) sí da.
 */
export function puntosPorCompra(p: ReglaGanar, base: number): number {
  if (!Number.isFinite(base) || base <= 0 || base < (p.compraMinima ?? 0)) return 0;
  const baseCent = Math.round(base * 100);
  if (p.mecanica === "SELLOS") return 1;
  if (p.mecanica === "PUNTOS_DINERO") {
    const pctCent = Math.round((p.porcentaje ?? 0) * 100);
    return Math.floor((baseCent * pctCent) / 1_000_000);
  }
  if (p.mecanica === "PUNTOS_PREMIOS") {
    const porPuntoCent = Math.round((p.pesosPorPunto ?? 0) * 100);
    return porPuntoCent > 0 ? Math.floor(baseCent / porPuntoCent) : 0;
  }
  return 0;
}

export function unidad(mecanica: Mecanica, n: number): string {
  if (mecanica === "SELLOS") return n === 1 ? "sello" : "sellos";
  return n === 1 ? "punto" : "puntos";
}

/** "120 puntos", "1 sello". */
export function cantidad(mecanica: Mecanica, n: number): string {
  return `${n} ${unidad(mecanica, n)}`;
}
```

En `packages/db/package.json`, dentro de `"exports"`, después de `"./cobro": "./src/cobro.ts",`:

```json
    "./lealtad": "./src/lealtad.ts",
```

- [ ] **Step 2: El POS reexporta en vez de definir**

En `apps/pos/app/lib/lealtad-reglas.ts`:

1. Borra las definiciones de `type Mecanica`, `puntosPorCompra`, `unidad` y `cantidad` (con sus comentarios).
2. Añade arriba, junto al import de `./dinero`:

```ts
import { cantidad, puntosPorCompra, unidad, type Mecanica } from "@vim/db/lealtad";

// La regla de puntos vive en @vim/db/lealtad (la comparte el admin). Se reexporta porque es parte de
// la interfaz de este módulo desde el plan 1B.
export { cantidad, puntosPorCompra, unidad, type Mecanica };
```

`Programa`, `Premio` y todo lo demás se quedan como están; `Programa` sigue siendo compatible con `ReglaGanar` porque tiene sus cuatro campos.

- [ ] **Step 3: Verificar que nada se movió**

```bash
cd C:/vwtN && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-reglas.test.ts && pnpm --filter @vim/pos test 2>&1 | tail -4 && pnpm --filter @vim/pos typecheck
```

Expected: `lealtad-reglas.test.ts` pasa sin tocarlo (los seis casos del espejo incluidos), la suite del POS queda en la línea base y el typecheck limpio. Si el typecheck no resuelve `@vim/db/lealtad`, falta la línea de `exports`.

- [ ] **Step 4: Commit**

```bash
cd C:/vwtN && git add packages/db/src/lealtad.ts packages/db/package.json apps/pos/app/lib/lealtad-reglas.ts && git commit -m "refactor(lealtad): la regla de puntos vive en @vim/db/lealtad para que la comparta el admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: El panel de VIM conoce la lealtad

**Files:**
- Modify: `packages/db/src/modulos.ts`
- Modify: `apps/platform/app/lib/cambio-plan.ts:9-12`
- Modify: `apps/platform/app/lib/addons.ts:32-41`
- Modify: `apps/platform/app/api/tenants/[id]/route.ts` (rama `addon_activar`, ≈313-317)
- Modify: `apps/platform/app/components/ficha-contrato.tsx` (`CONSECUENCIA_BAJA` ≈23-26 y la vista previa ≈407-410)
- Test: `apps/platform/app/lib/__tests__/addons.test.ts`, `cobro-promocion.test.ts`

**Interfaces:**
- Produces: `CodigoModulo` incluye `"lealtad"`; `precioAltaAddon(codigo: string, planCodigo: string | undefined, precioLista: number): number` (sustituye a `precioAltaDelivery`); `ADDONS_DEL_PLAN` con `LEALTAD`.

- [ ] **Step 1: Pruebas que fallan**

En `apps/platform/app/lib/__tests__/addons.test.ts`, sustituye el `describe` de `precioAltaDelivery` por este (y cambia el import a `precioAltaAddon`):

```ts
describe("precioAltaAddon: lo que el plan ya incluye entra a $0", () => {
  it("delivery y lealtad van a $0 desde Negocio", () => {
    for (const codigo of ["DELIVERY", "LEALTAD"]) {
      expect(precioAltaAddon(codigo, "NEGOCIO", 100)).toBe(0);
      expect(precioAltaAddon(codigo, "CADENA", 100)).toBe(0);
    }
  });

  it("en Esencial se cobran a precio de lista", () => {
    expect(precioAltaAddon("DELIVERY", "ESENCIAL", 100)).toBe(100);
    expect(precioAltaAddon("LEALTAD", "ESENCIAL", 100)).toBe(100);
  });

  it("los planes heredados por giro también los incluyen", () => {
    for (const plan of ["FT", "QS", "CB", "FS", "DK", "ENT"]) expect(precioAltaAddon("LEALTAD", plan, 100)).toBe(0);
  });

  it("un plan que no conocemos paga", () => {
    expect(precioAltaAddon("LEALTAD", "OTRO", 100)).toBe(100);
    expect(precioAltaAddon("LEALTAD", undefined, 100)).toBe(100);
  });

  it("un add-on que ningún plan regala se cobra siempre a su precio", () => {
    expect(precioAltaAddon("CFDI", "NEGOCIO", 250)).toBe(250);
  });
});
```

En `apps/platform/app/lib/__tests__/cobro-promocion.test.ts`, dentro de `describe("vistaPreviaCambioPlan (espejo de cambiar_plan_tenant)", …)`, añade:

```ts
  it("la lealtad también entra y sale con el plan", () => {
    const esencial = { ...ESENCIAL, features_incluidos: { ...ESENCIAL.features_incluidos, lealtad_incluido: false } };
    const negocio = { ...NEGOCIO, features_incluidos: { ...NEGOCIO.features_incluidos, lealtad_incluido: true } };
    const sube = vistaPreviaCambioPlan({
      nuevo: negocio, foliosAntes: 10,
      addons: [{ codigo: "LEALTAD", activo: true, precio: 100, incluidoEnPlan: false }],
      suscripcion: { precio_mensual_mxn: 699, precio_promocional_mxn: null, promocion_hasta: null, promocion_nombre: null }, hoy: "2026-11-15",
    });
    expect(sube.concede).toContain("LEALTAD");
    expect(sube.dejaDePagar).toContainEqual({ codigo: "LEALTAD", precio: 100 });

    const baja = vistaPreviaCambioPlan({
      nuevo: esencial, foliosAntes: 20,
      addons: [{ codigo: "LEALTAD", activo: true, precio: 0, incluidoEnPlan: true }],
      suscripcion: { precio_mensual_mxn: 999, precio_promocional_mxn: null, promocion_hasta: null, promocion_nombre: null }, hoy: "2026-11-15",
    });
    expect(baja.retira).toContain("LEALTAD");
  });
```

Run: `cd C:/vwtN && pnpm --filter @vim/platform exec vitest run app/lib/__tests__/addons.test.ts app/lib/__tests__/cobro-promocion.test.ts`
Expected: FAIL — `precioAltaAddon` no existe; `concede` no trae `LEALTAD`. Si el tipo de `suscripcion` o de `addons` en el fixture no coincide con el del archivo (campos con otro nombre), copia la forma exacta de los casos vecinos del mismo `describe`: lo que este caso afirma es `concede`, `dejaDePagar` y `retira`.

- [ ] **Step 2: El catálogo de módulos compartido**

En `packages/db/src/modulos.ts`:

```ts
export type CodigoModulo = "cfdi" | "delivery_apps" | "lealtad" | "kds" | "recetas" | "reservaciones" | "promociones";
```

En el tipo `Modulo`, `interruptorDueno` gana la columna nueva:

```ts
  interruptorDueno: "modulo_inventario_activo" | "modulo_delivery_activo" | "modulo_lealtad_activo" | null;
```

Y en `MODULOS`, después de la fila de `delivery_apps`:

```ts
  { codigo: "lealtad", nombre: "Programa de lealtad", descripcion: "Puntos, sellos y premios que tus clientes ganan y canjean en caja.", interruptorDueno: "modulo_lealtad_activo", porAddon: true },
```

- [ ] **Step 3: Cambio de plan y precio de alta**

`apps/platform/app/lib/cambio-plan.ts`:

```ts
export const ADDONS_DEL_PLAN = [
  { codigo: "CFDI", bandera: "cfdi_incluido" },
  { codigo: "DELIVERY", bandera: "delivery_incluido" },
  { codigo: "LEALTAD", bandera: "lealtad_incluido" },
] as const;
```

y en el comentario de cabecera del archivo, donde cita la migración `0141`, añade: «`_sincronizar_addons_del_plan` se redefinió en la 0159 para incluir LEALTAD».

`apps/platform/app/lib/addons.ts` — sustituye `precioAltaDelivery` (conserva `PLANES_QUE_LO_INCLUYEN` tal cual):

```ts
/** Add-ons que van incluidos sin cargo desde el plan Negocio; en Esencial se contratan aparte. */
const INCLUIDOS_DESDE_NEGOCIO = new Set(["DELIVERY", "LEALTAD"]);

/**
 * Precio con el que entra un add-on que el operador da de alta a mano. Lo que el plan del cliente ya
 * incluye entra a $0; cobrarlo sería cobrarlo dos veces. Un plan que no conocemos paga: equivocarse
 * hacia cobrar se corrige con una llamada; equivocarse hacia regalar no se nota.
 */
export function precioAltaAddon(codigo: string, planCodigo: string | undefined, precioLista: number): number {
  if (!INCLUIDOS_DESDE_NEGOCIO.has(codigo)) return precioLista;
  return PLANES_QUE_LO_INCLUYEN.has(planCodigo ?? "") ? 0 : precioLista;
}
```

`apps/platform/app/api/tenants/[id]/route.ts`, rama `addon_activar`: el bloque

```ts
  if (codigo === "DELIVERY") {
    const { data: tRaw } = await sb.from("tenants").select("plan:planes(codigo)").eq("id", id).maybeSingle();
    const planCodigo = (tRaw as { plan?: { codigo?: string } } | null)?.plan?.codigo ?? "";
    precioLista = precioAltaDelivery(planCodigo, precioLista);
  }
```

pasa a (sin el `if`: la función ya decide por código):

```ts
  {
    const { data: tRaw } = await sb.from("tenants").select("plan:planes(codigo)").eq("id", id).maybeSingle();
    const planCodigo = (tRaw as { plan?: { codigo?: string } } | null)?.plan?.codigo ?? "";
    precioLista = precioAltaAddon(codigo, planCodigo, precioLista);
  }
```

y cambia el import de `precioAltaDelivery` por `precioAltaAddon`. Busca cualquier otro uso: `grep -rn "precioAltaDelivery" C:/vwtN/apps` debe quedar vacío.

- [ ] **Step 4: La consecuencia de la baja**

`apps/platform/app/components/ficha-contrato.tsx`, en `CONSECUENCIA_BAJA`:

```tsx
  LEALTAD: "Se apaga su programa de lealtad: sus clientes dejan de ganar y de canjear. Los saldos se conservan por si lo retoma.",
```

Y en la vista previa del cambio de plan (≈línea 410), la línea que hoy termina en `{c === "DELIVERY" ? " Se pausan sus tiendas en Uber Eats." : ""}` queda:

```tsx
{c === "DELIVERY" ? " Se pausan sus tiendas en Uber Eats." : c === "LEALTAD" ? " Se apaga su programa de lealtad; los saldos se conservan." : ""}
```

- [ ] **Step 5: Verificar las tres apps (el tipo `CodigoModulo` las toca a todas)**

```bash
cd C:/vwtN && pnpm --filter @vim/platform test 2>&1 | tail -4 && pnpm --filter @vim/platform typecheck && pnpm --filter @vim/admin typecheck && pnpm --filter @vim/pos typecheck
```

Expected: panel en verde con los casos nuevos; los tres typecheck limpios. Si alguno falla con «Property 'lealtad' is missing» es un `Record<CodigoModulo, …>` que ahora exige la clave: añádela con el valor que corresponda al patrón de sus vecinas y lista el archivo en el reporte.

- [ ] **Step 6: Commit**

```bash
cd C:/vwtN && git add packages/db/src/modulos.ts apps/platform && git commit -m "feat(lealtad): el panel concede la lealtad, a \$0 si el plan la incluye, y dice qué pasa al darla de baja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Lo que el admin lee y escribe del programa y los premios

**Files:**
- Create: `apps/admin/app/lib/lealtad.ts`
- Create: `apps/admin/app/lib/lealtad-plan.ts`
- Create: `apps/admin/app/lib/__tests__/lealtad.test.ts`

**Interfaces:**
- Consumes: `puntosPorCompra`, `cantidad`, `Mecanica` de `@vim/db/lealtad`; `supabase`, `leerSesion` de `./supabase`; `mensajeAyudaAdmin` de `@vim/db/soporte`.
- Produces (en `lealtad.ts`):
  - `type ProgramaAdmin = { mecanica: Mecanica; version: number; porcentaje: number | null; pesosPorPunto: number | null; compraMinima: number; vencimientoMeses: number | null; topeComprasDia: number }`
  - `type FormPrograma = { mecanica: Mecanica; porcentaje: string; pesosPorPunto: string; compraMinima: string; vencimientoMeses: string; topeComprasDia: string }`
  - `FORM_PROGRAMA_INICIAL: FormPrograma`, `formDePrograma(p: ProgramaAdmin): FormPrograma`
  - `programaSchema` (zod) y `ejemploPrograma(f: FormPrograma): string | null`
  - `leerProgramaAdmin(): Promise<ProgramaAdmin | null>`
  - `guardarPrograma(f: FormPrograma, confirmarReinicio: boolean): Promise<{ ok: true; version: number; clientesReiniciados: number } | { ok: false; clientesConSaldo: number }>`
  - `activarModuloLealtad(activo: boolean): Promise<void>`
  - `type PremioAdmin = { id: string; productoId: string; nombre: string; precio: number; costo: number; activo: boolean; productoDisponible: boolean }`
  - `listarPremios(): Promise<PremioAdmin[]>`, `productosParaPremio(): Promise<{ id: string; nombre: string; precio: number }[]>`
  - `costoPremioSchema`, `crearPremio(productoId, costo)`, `cambiarCostoPremio(id, costo)`, `setActivoPremio(id, activo)`, `eliminarPremio(id)`
  - `mensajeLealtad(e: unknown, porDefecto: string): string`
- Produces (en `lealtad-plan.ts`): `estadoLealtad(m): "cargando" | "permitida" | "sin_contratar"`, `mensajeQuieroLealtad(d): string`

- [ ] **Step 1: La prueba que falla**

Crea `apps/admin/app/lib/__tests__/lealtad.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  rpc: [] as { fn: string; args: Fila }[],
  rpcRespuesta: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  escrituras: [] as { tabla: string; op: string; valores: Fila; filtros: Fila }[],
  errorEscritura: null as { message: string; code?: string } | null,
}));

// Doble de PostgREST sobre filas en memoria: filtra de verdad y anota cada escritura.
function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  const eqs: Fila = {};
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let valores: Fila = {};
  const resolver = () => {
    if (op !== "select") {
      doble.escrituras.push({ tabla, op, valores, filtros: { ...eqs } });
      return { data: null, error: doble.errorEscritura };
    }
    return { data: (doble.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null };
  };
  const q = {
    select: () => q,
    insert: (v: Fila) => { op = "insert"; valores = v; return q; },
    update: (v: Fila) => { op = "update"; valores = v; return q; },
    upsert: (v: Fila) => { op = "upsert"; valores = v; return q; },
    eq: (c: string, v: unknown) => { eqs[c] = v; filtros = [...filtros, (f) => f[c] === v]; return q; },
    is: (c: string, v: unknown) => { filtros = [...filtros, (f) => (f[c] ?? null) === v]; return q; },
    order: () => q,
    maybeSingle: async () => { const r = resolver(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: consulta,
    rpc: vi.fn(async (fn: string, args: Fila) => {
      doble.rpc.push({ fn, args });
      return doble.rpcRespuesta[fn] ?? { data: null, error: null };
    }),
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })),
}));

import {
  FORM_PROGRAMA_INICIAL, activarModuloLealtad, cambiarCostoPremio, costoPremioSchema, crearPremio, ejemploPrograma,
  eliminarPremio, formDePrograma, guardarPrograma, leerProgramaAdmin, listarPremios, mensajeLealtad, productosParaPremio,
  programaSchema, setActivoPremio,
} from "../lealtad";
import { estadoLealtad, mensajeQuieroLealtad } from "../lealtad-plan";

beforeEach(() => {
  doble.tablas = {};
  doble.rpc = [];
  doble.rpcRespuesta = {};
  doble.escrituras = [];
  doble.errorEscritura = null;
});

const DINERO = { ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_DINERO" as const, porcentaje: "5" };

describe("el formulario del programa", () => {
  it("acepta cada mecánica con lo suyo y rechaza lo que le falta", () => {
    expect(programaSchema.safeParse(DINERO).success).toBe(true);
    expect(programaSchema.safeParse({ ...DINERO, porcentaje: "" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, porcentaje: "51" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" }).success).toBe(true);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "10" }).success).toBe(true);
  });

  it("el vencimiento vacío es «sin vencimiento»; con número, de 1 a 60 meses", () => {
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "" }).success).toBe(true);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "0" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "61" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, vencimientoMeses: "6" }).success).toBe(true);
  });

  it("el tope de compras por día va de 1 a 50", () => {
    expect(programaSchema.safeParse({ ...DINERO, topeComprasDia: "0" }).success).toBe(false);
    expect(programaSchema.safeParse({ ...DINERO, topeComprasDia: "51" }).success).toBe(false);
  });
});

describe("el ejemplo en vivo", () => {
  it("puntos por dinero: dice cuánto gana y cuánto vale", () => {
    expect(ejemploPrograma(DINERO)).toBe("Una compra de $200 gana 10 puntos, que valen $10 en su siguiente visita.");
  });

  it("con compra mínima, el ejemplo usa una compra que sí gana", () => {
    expect(ejemploPrograma({ ...DINERO, compraMinima: "300" })).toBe("Una compra de $300 gana 15 puntos, que valen $15 en su siguiente visita.");
  });

  it("sellos: uno por visita", () => {
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" })).toBe("Cada visita gana 1 sello, sin importar cuánto consuma.");
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS", compraMinima: "100" })).toBe("Cada visita de $100 o más gana 1 sello.");
  });

  it("puntos con premios: cuántos puntos da la compra del ejemplo", () => {
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "10" }))
      .toBe("Una compra de $200 gana 20 puntos, que se cambian por los premios que definas.");
  });

  it("sin el dato de la mecánica no hay ejemplo que dar", () => {
    expect(ejemploPrograma({ ...DINERO, porcentaje: "" })).toBeNull();
    expect(ejemploPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "PUNTOS_PREMIOS", pesosPorPunto: "0" })).toBeNull();
  });
});

describe("leer y guardar el programa", () => {
  it("lee el programa con números y lo convierte al formulario", async () => {
    doble.tablas.lealtad_programa = [{ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: "5.00", pesos_por_punto: null, compra_minima_mxn: "0.00", vencimiento_meses: 6, tope_compras_dia: 3 }];
    const p = await leerProgramaAdmin();
    expect(p).toEqual({ mecanica: "PUNTOS_DINERO", version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 0, vencimientoMeses: 6, topeComprasDia: 3 });
    expect(formDePrograma(p!)).toEqual({ mecanica: "PUNTOS_DINERO", porcentaje: "5", pesosPorPunto: "", compraMinima: "0", vencimientoMeses: "6", topeComprasDia: "3" });
  });

  it("sin programa devuelve null", async () => {
    doble.tablas.lealtad_programa = [];
    expect(await leerProgramaAdmin()).toBeNull();
  });

  it("guarda por la función de la base, mandando NULL lo que no aplica a la mecánica", async () => {
    doble.rpcRespuesta.lealtad_guardar_programa = { data: { ok: true, version: 1, clientes_reiniciados: 0 }, error: null };
    const r = await guardarPrograma({ ...DINERO, pesosPorPunto: "10", vencimientoMeses: "" }, false);
    expect(r).toEqual({ ok: true, version: 1, clientesReiniciados: 0 });
    expect(doble.rpc[0]).toEqual({
      fn: "lealtad_guardar_programa",
      args: { p_mecanica: "PUNTOS_DINERO", p_porcentaje: 5, p_pesos_por_punto: null, p_compra_minima_mxn: 0, p_vencimiento_meses: null, p_tope_compras_dia: 3, p_confirmar_reinicio: false },
    });
  });

  it("si cambiar de mecánica borraría saldos, no guarda: devuelve a cuántos clientes afecta", async () => {
    doble.rpcRespuesta.lealtad_guardar_programa = { data: { ok: false, error: "REQUIERE_CONFIRMAR_REINICIO", clientes_con_saldo: 37 }, error: null };
    expect(await guardarPrograma({ ...FORM_PROGRAMA_INICIAL, mecanica: "SELLOS" }, false)).toEqual({ ok: false, clientesConSaldo: 37 });
  });

  it("un formulario inválido no llega a la base", async () => {
    await expect(guardarPrograma({ ...DINERO, porcentaje: "" }, false)).rejects.toThrow(/porcentaje/i);
    expect(doble.rpc).toEqual([]);
  });
});

describe("el interruptor", () => {
  it("enciende con un upsert sobre la configuración del negocio", async () => {
    await activarModuloLealtad(true);
    expect(doble.escrituras[0]).toMatchObject({ tabla: "configuracion_tenant", op: "upsert", valores: { tenant_id: "t1", modulo_lealtad_activo: true } });
  });

  it("los rechazos de la base se dicen en palabras del dueño", async () => {
    doble.errorEscritura = { message: "SIN_PROGRAMA_LEALTAD", code: "22023" };
    await expect(activarModuloLealtad(true)).rejects.toThrow("Primero guarda tu programa: elige cómo ganan tus clientes.");
    doble.errorEscritura = { message: "SIN_ADDON_LEALTAD", code: "42501" };
    await expect(activarModuloLealtad(true)).rejects.toThrow(/no está incluido/i);
  });
});

describe("premios", () => {
  beforeEach(() => {
    doble.tablas.lealtad_premios = [
      { id: "pr-1", costo: 6, activo: true, deleted_at: null, producto: { id: "p-1", nombre: "Hamburguesa", precio_base_mxn: "120.00", estado: "ACTIVO", deleted_at: null } },
      { id: "pr-2", costo: 3, activo: false, deleted_at: null, producto: { id: "p-2", nombre: "Refresco", precio_base_mxn: "35.00", estado: "PAUSADO", deleted_at: null } },
      { id: "pr-3", costo: 9, activo: true, deleted_at: "2026-10-01", producto: { id: "p-3", nombre: "Malteada", precio_base_mxn: "70.00", estado: "ACTIVO", deleted_at: null } },
    ];
    doble.tablas.productos = [
      { id: "p-1", nombre: "Hamburguesa", precio_base_mxn: "120.00", es_combo: false, estado: "ACTIVO", deleted_at: null },
      { id: "p-4", nombre: "Papas", precio_base_mxn: "55.00", es_combo: false, estado: "ACTIVO", deleted_at: null },
      { id: "p-5", nombre: "Combo Clásico", precio_base_mxn: "150.00", es_combo: true, estado: "ACTIVO", deleted_at: null },
      { id: "p-6", nombre: "Pausado", precio_base_mxn: "10.00", es_combo: false, estado: "PAUSADO", deleted_at: null },
    ];
  });

  it("lista los premios vivos, y marca los que tienen su producto pausado", async () => {
    expect(await listarPremios()).toEqual([
      { id: "pr-2", productoId: "p-2", nombre: "Refresco", precio: 35, costo: 3, activo: false, productoDisponible: false },
      { id: "pr-1", productoId: "p-1", nombre: "Hamburguesa", precio: 120, costo: 6, activo: true, productoDisponible: true },
    ]);
  });

  it("para premio solo se ofrecen productos activos, que no son combo y que no son ya un premio", async () => {
    expect(await productosParaPremio()).toEqual([{ id: "p-4", nombre: "Papas", precio: 55 }]);
  });

  it("el costo es un entero de 1 en adelante", () => {
    expect(costoPremioSchema.safeParse("6").success).toBe(true);
    expect(costoPremioSchema.safeParse("0").success).toBe(false);
    expect(costoPremioSchema.safeParse("2.5").success).toBe(false);
    expect(costoPremioSchema.safeParse("").success).toBe(false);
  });

  it("crear, cambiar el costo, pausar y eliminar escriben lo que deben", async () => {
    await crearPremio("p-4", 5);
    await cambiarCostoPremio("pr-1", 8);
    await setActivoPremio("pr-1", false);
    await eliminarPremio("pr-1");
    expect(doble.escrituras[0]).toMatchObject({ tabla: "lealtad_premios", op: "insert", valores: { tenant_id: "t1", producto_id: "p-4", costo: 5 } });
    expect(doble.escrituras[1]).toMatchObject({ op: "update", valores: { costo: 8 }, filtros: { id: "pr-1" } });
    expect(doble.escrituras[2]).toMatchObject({ op: "update", valores: { activo: false }, filtros: { id: "pr-1" } });
    expect(doble.escrituras[3].valores).toMatchObject({ activo: false });
    expect(typeof doble.escrituras[3].valores.deleted_at).toBe("string");
  });

  it("un producto que ya es premio se dice así, no con el nombre del índice", async () => {
    doble.errorEscritura = { message: 'duplicate key value violates unique constraint "lealtad_premios_producto_uq"', code: "23505" };
    await expect(crearPremio("p-1", 5)).rejects.toThrow("Ese producto ya es un premio.");
  });
});

describe("mensajes y estado de la sección", () => {
  it("a quien no es dueño ni administrador se le dice eso, no el rechazo de la base", () => {
    expect(mensajeLealtad({ message: "new row violates row-level security policy", code: "42501" }, "x"))
      .toBe("Solo el dueño o un administrador puede cambiar la lealtad.");
    expect(mensajeLealtad(new Error("El porcentaje de puntos debe ser mayor que 0 y de máximo 50."), "x"))
      .toBe("El porcentaje de puntos debe ser mayor que 0 y de máximo 50.");
    expect(mensajeLealtad(null, "No se pudo guardar")).toBe("No se pudo guardar");
  });

  it("la sección se enseña si está permitida; si la lectura de módulos falla, también", () => {
    expect(estadoLealtad(null)).toBe("cargando");
    expect(estadoLealtad("error")).toBe("permitida");
    expect(estadoLealtad({ permitidos: { lealtad: true }, efectivos: {} })).toBe("permitida");
    expect(estadoLealtad({ permitidos: { lealtad: false }, efectivos: {} })).toBe("sin_contratar");
    expect(estadoLealtad({ permitidos: {}, efectivos: {} })).toBe("sin_contratar");
  });

  it("el mensaje de WhatsApp ya dice qué se quiere", () => {
    expect(mensajeQuieroLealtad({ usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" })).toMatch(/Quiero activar el programa de lealtad\.$/);
  });
});
```

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/lealtad.test.ts`
Expected: FAIL — `Cannot find module '../lealtad'`.

- [ ] **Step 2: `lealtad-plan.ts`**

```ts
// La lealtad es un programa que VIM concede (add-on LEALTAD, incluido desde el plan Negocio) y el
// dueño enciende (ADR 0030). Lógica pura de qué enseña el admin; el candado de verdad está en la base
// (`configuracion_tenant_lealtad_guardia`, 0156).
import { mensajeAyudaAdmin } from "@vim/db/soporte";

export type ModulosLeidos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> };
export type EstadoLealtad = "cargando" | "permitida" | "sin_contratar";

/**
 * Qué pantalla toca. Si la lectura de módulos falló se enseña la sección: esconder de más deja al
 * dueño sin su programa por un fallo de red, y la base igual impide encender lo que no se contrató.
 */
export function estadoLealtad(m: ModulosLeidos | "error" | null): EstadoLealtad {
  if (m === null) return "cargando";
  if (m === "error") return "permitida";
  return m.permitidos.lealtad === true ? "permitida" : "sin_contratar";
}

/** Lo que el programa hace, para la tarjeta de quien todavía no lo tiene. */
export const LEALTAD_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Tus clientes ganan en cada compra", detalle: "Puntos que valen dinero, sellos por visita o puntos que se cambian por premios: tú eliges." },
  { titulo: "Canjean en la caja", detalle: "Quien cobra ve el saldo del cliente y aplica el canje en la cuenta, sin tarjetas de cartón." },
  { titulo: "Un solo saldo en todas tus sucursales", detalle: "Lo que ganan en una lo pueden usar en otra." },
  { titulo: "Tú ves todo", detalle: "Cuánto se ha repartido, cuánto se ha canjeado y quién lo hizo." },
];

/** El mensaje de WhatsApp ya escrito: quién es, de qué negocio y qué quiere. */
export function mensajeQuieroLealtad(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  return mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero activar el programa de lealtad.");
}
```

- [ ] **Step 3: `lealtad.ts`**

```ts
"use client";
// Lo que el admin lee y escribe del programa de lealtad (ADR 0030, spec §7).
//
// El admin NO decide reglas: el programa se guarda por `lealtad_guardar_programa` (0156), que valida
// con mensajes para el dueño y es la única que sabe reiniciar saldos al cambiar de mecánica. Los
// premios se escriben directo bajo RLS (solo dueño o administrador). El libro, las cifras y el ajuste
// manual están en lealtad-libro.ts.
import { z } from "zod";
import { cantidad, puntosPorCompra, type Mecanica } from "@vim/db/lealtad";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar la lealtad.";

/** Los rechazos de la base, en palabras del dueño. Lo que ya viene en español se respeta. */
export function mensajeLealtad(e: unknown, porDefecto: string): string {
  const crudo = e instanceof Error ? e.message : typeof e === "string" ? e : ((e as { message?: string } | null)?.message ?? "");
  if (!crudo) return porDefecto;
  if (crudo.includes("SIN_PROGRAMA_LEALTAD")) return "Primero guarda tu programa: elige cómo ganan tus clientes.";
  if (crudo.includes("SIN_ADDON_LEALTAD")) return "El programa de lealtad no está incluido en tu plan. Escríbenos y lo activamos contigo.";
  if (crudo.includes("lealtad_premios_producto_uq")) return "Ese producto ya es un premio.";
  // El rechazo crudo de la base (RLS, permisos) no le dice nada al dueño. Los mensajes que las
  // funciones ya mandan en español («Solo el dueño o un administrador…») pasan tal cual.
  if (/row-level security|permission denied/i.test(crudo)) return SOLO_ADMIN;
  return crudo;
}

function fallo(error: { message: string; code?: string }, porDefecto: string): Error {
  return new Error(mensajeLealtad(error, porDefecto));
}

// ── Programa ──────────────────────────────────────────────────────────────────

export type ProgramaAdmin = {
  mecanica: Mecanica;
  version: number;
  porcentaje: number | null;
  pesosPorPunto: number | null;
  compraMinima: number;
  /** null = los puntos no vencen. */
  vencimientoMeses: number | null;
  topeComprasDia: number;
};

/** El formulario guarda textos: así un campo a medio escribir no se convierte en 0. */
export type FormPrograma = {
  mecanica: Mecanica;
  porcentaje: string;
  pesosPorPunto: string;
  compraMinima: string;
  vencimientoMeses: string;
  topeComprasDia: string;
};

export const FORM_PROGRAMA_INICIAL: FormPrograma = {
  mecanica: "PUNTOS_DINERO", porcentaje: "5", pesosPorPunto: "", compraMinima: "0", vencimientoMeses: "", topeComprasDia: "3",
};

const txt = (n: number | null): string => (n == null ? "" : String(n));

export function formDePrograma(p: ProgramaAdmin): FormPrograma {
  return {
    mecanica: p.mecanica,
    porcentaje: txt(p.porcentaje),
    pesosPorPunto: txt(p.pesosPorPunto),
    compraMinima: txt(p.compraMinima),
    vencimientoMeses: txt(p.vencimientoMeses),
    topeComprasDia: txt(p.topeComprasDia),
  };
}

const numero = (s: string): number => Number(s.trim().replace(",", "."));
const vacio = (s: string): boolean => s.trim() === "";

/** Mismas reglas que valida `lealtad_guardar_programa`: aquí solo se dicen antes de ir a la base. */
export const programaSchema = z
  .object({
    mecanica: z.enum(["PUNTOS_DINERO", "SELLOS", "PUNTOS_PREMIOS"]),
    porcentaje: z.string(),
    pesosPorPunto: z.string(),
    compraMinima: z.string(),
    vencimientoMeses: z.string(),
    topeComprasDia: z.string(),
  })
  .refine((d) => d.mecanica !== "PUNTOS_DINERO" || (!vacio(d.porcentaje) && numero(d.porcentaje) > 0 && numero(d.porcentaje) <= 50), {
    message: "El porcentaje de puntos debe ser mayor que 0 y de máximo 50.", path: ["porcentaje"],
  })
  .refine((d) => d.mecanica !== "PUNTOS_PREMIOS" || (!vacio(d.pesosPorPunto) && numero(d.pesosPorPunto) > 0), {
    message: "Indica cuántos pesos de compra valen un punto.", path: ["pesosPorPunto"],
  })
  .refine((d) => vacio(d.compraMinima) || numero(d.compraMinima) >= 0, {
    message: "La compra mínima no puede ser negativa.", path: ["compraMinima"],
  })
  .refine((d) => vacio(d.vencimientoMeses) || (Number.isInteger(numero(d.vencimientoMeses)) && numero(d.vencimientoMeses) >= 1 && numero(d.vencimientoMeses) <= 60), {
    message: "El vencimiento va de 1 a 60 meses. Déjalo vacío si no vencen.", path: ["vencimientoMeses"],
  })
  .refine((d) => !vacio(d.topeComprasDia) && Number.isInteger(numero(d.topeComprasDia)) && numero(d.topeComprasDia) >= 1 && numero(d.topeComprasDia) <= 50, {
    message: "El tope de compras por día debe estar entre 1 y 50.", path: ["topeComprasDia"],
  });

const pesos = (n: number): string => `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

/**
 * El ejemplo que se actualiza mientras el dueño escribe (spec §7). Usa la MISMA regla que la caja
 * (`puntosPorCompra`, espejo de la de SQL): lo que aquí se promete es lo que la caja va a dar.
 * Devuelve null si con lo escrito todavía no hay ejemplo que dar.
 */
export function ejemploPrograma(f: FormPrograma): string | null {
  const minima = vacio(f.compraMinima) ? 0 : numero(f.compraMinima);
  if (!Number.isFinite(minima) || minima < 0) return null;
  const compra = Math.max(200, minima);
  const regla = {
    mecanica: f.mecanica,
    porcentaje: vacio(f.porcentaje) ? null : numero(f.porcentaje),
    pesosPorPunto: vacio(f.pesosPorPunto) ? null : numero(f.pesosPorPunto),
    compraMinima: minima,
  };
  if (f.mecanica === "SELLOS") {
    return minima > 0 ? `Cada visita de ${pesos(minima)} o más gana 1 sello.` : "Cada visita gana 1 sello, sin importar cuánto consuma.";
  }
  const gana = puntosPorCompra(regla, compra);
  if (gana <= 0) return null;
  if (f.mecanica === "PUNTOS_DINERO") {
    return `Una compra de ${pesos(compra)} gana ${cantidad(f.mecanica, gana)}, que valen ${pesos(gana)} en su siguiente visita.`;
  }
  return `Una compra de ${pesos(compra)} gana ${cantidad(f.mecanica, gana)}, que se cambian por los premios que definas.`;
}

export async function leerProgramaAdmin(): Promise<ProgramaAdmin | null> {
  const { data, error } = await supabase
    .from("lealtad_programa")
    .select("mecanica, version, porcentaje, pesos_por_punto, compra_minima_mxn, vencimiento_meses, tope_compras_dia")
    .maybeSingle();
  if (error) throw fallo(error, "No se pudo leer el programa");
  if (!data) return null;
  const p = data as Record<string, unknown>;
  return {
    mecanica: p.mecanica as Mecanica,
    version: Number(p.version),
    porcentaje: p.porcentaje == null ? null : Number(p.porcentaje),
    pesosPorPunto: p.pesos_por_punto == null ? null : Number(p.pesos_por_punto),
    compraMinima: Number(p.compra_minima_mxn ?? 0),
    vencimientoMeses: p.vencimiento_meses == null ? null : Number(p.vencimiento_meses),
    topeComprasDia: Number(p.tope_compras_dia ?? 3),
  };
}

export type ResultadoGuardar =
  | { ok: true; version: number; clientesReiniciados: number }
  /** Cambiar de mecánica pondría en cero el saldo de estos clientes: hay que confirmarlo. */
  | { ok: false; clientesConSaldo: number };

/**
 * Guarda el programa. Cambiar de mecánica pone TODOS los saldos en cero (no son convertibles): sin
 * `confirmarReinicio` la base no guarda nada y contesta a cuántos clientes afectaría.
 */
export async function guardarPrograma(f: FormPrograma, confirmarReinicio: boolean): Promise<ResultadoGuardar> {
  const v = programaSchema.safeParse(f);
  if (!v.success) throw new Error(v.error.issues[0]?.message ?? "Revisa los datos del programa.");
  const { data, error } = await supabase.rpc("lealtad_guardar_programa", {
    p_mecanica: f.mecanica,
    p_porcentaje: f.mecanica === "PUNTOS_DINERO" ? numero(f.porcentaje) : null,
    p_pesos_por_punto: f.mecanica === "PUNTOS_PREMIOS" ? numero(f.pesosPorPunto) : null,
    p_compra_minima_mxn: vacio(f.compraMinima) ? 0 : numero(f.compraMinima),
    p_vencimiento_meses: vacio(f.vencimientoMeses) ? null : numero(f.vencimientoMeses),
    p_tope_compras_dia: numero(f.topeComprasDia),
    p_confirmar_reinicio: confirmarReinicio,
  });
  if (error) throw fallo(error, "No se pudo guardar el programa");
  const r = (data ?? {}) as { ok?: boolean; version?: number; clientes_reiniciados?: number; clientes_con_saldo?: number };
  if (r.ok === true) return { ok: true, version: Number(r.version ?? 1), clientesReiniciados: Number(r.clientes_reiniciados ?? 0) };
  return { ok: false, clientesConSaldo: Number(r.clientes_con_saldo ?? 0) };
}

/**
 * Enciende o apaga la lealtad del negocio. Mismo upsert que delivery (`activarModuloDelivery`): la
 * mayoría de los negocios no tiene fila en `configuracion_tenant` hasta su primer ajuste. La base
 * exige el programa guardado y el permiso de VIM; sus rechazos se traducen.
 */
export async function activarModuloLealtad(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_lealtad_activo: activo }, { onConflict: "tenant_id" });
  if (error) throw fallo(error, "No se pudo cambiar");
}

// ── Premios ───────────────────────────────────────────────────────────────────

export type PremioAdmin = {
  id: string;
  productoId: string;
  nombre: string;
  /** Precio de lista del producto: lo que el negocio deja de cobrar al regalarlo. */
  precio: number;
  /** Puntos o sellos que cuesta. */
  costo: number;
  activo: boolean;
  /** false = su producto está pausado o se eliminó: en caja no se puede entregar. */
  productoDisponible: boolean;
};

type ProductoDePremio = { id: string; nombre: string; precio_base_mxn: string | number; estado: string; deleted_at: string | null };

export async function listarPremios(): Promise<PremioAdmin[]> {
  const { data, error } = await supabase
    .from("lealtad_premios")
    .select("id, costo, activo, producto:productos(id, nombre, precio_base_mxn, estado, deleted_at)")
    .is("deleted_at", null)
    .order("costo", { ascending: true });
  if (error) throw fallo(error, "No se pudieron leer los premios");
  type Fila = { id: string; costo: number; activo: boolean; producto: ProductoDePremio | ProductoDePremio[] | null };
  return ((data ?? []) as unknown as Fila[])
    .flatMap((f) => {
      const p = Array.isArray(f.producto) ? f.producto[0] : f.producto;
      if (!p) return [];
      return [{
        id: f.id, productoId: p.id, nombre: p.nombre, precio: Number(p.precio_base_mxn) || 0,
        costo: Number(f.costo), activo: f.activo !== false,
        productoDisponible: p.deleted_at == null && p.estado !== "PAUSADO",
      }];
    })
    .sort((a, b) => a.costo - b.costo || a.nombre.localeCompare(b.nombre));
}

/**
 * Productos que se pueden ofrecer como premio: activos, que NO son combo (un combo no se puede
 * canjear: la base lo rechaza en la caja) y que todavía no son un premio.
 */
export async function productosParaPremio(): Promise<{ id: string; nombre: string; precio: number }[]> {
  const [prod, prem] = await Promise.all([
    supabase.from("productos").select("id, nombre, precio_base_mxn, es_combo, estado").is("deleted_at", null).order("nombre", { ascending: true }),
    supabase.from("lealtad_premios").select("producto:productos(id)").is("deleted_at", null),
  ]);
  if (prod.error) throw fallo(prod.error, "No se pudieron leer los productos");
  if (prem.error) throw fallo(prem.error, "No se pudieron leer los premios");
  const yaSon = new Set(((prem.data ?? []) as unknown as { producto: { id: string } | { id: string }[] | null }[])
    .map((f) => (Array.isArray(f.producto) ? f.producto[0]?.id : f.producto?.id))
    .filter(Boolean));
  return ((prod.data ?? []) as { id: string; nombre: string; precio_base_mxn: string | number; es_combo: boolean; estado: string }[])
    .filter((p) => !p.es_combo && p.estado !== "PAUSADO" && !yaSon.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio_base_mxn) || 0 }));
}

export const costoPremioSchema = z.coerce
  .number()
  .int("El costo va en números enteros.")
  .min(1, "El costo debe ser de 1 en adelante.")
  .max(100000, "El costo no puede pasar de 100,000.");

export async function crearPremio(productoId: string, costo: number): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("lealtad_premios").insert({ tenant_id: tid, producto_id: productoId, costo });
  if (error) throw fallo(error, "No se pudo crear el premio");
}

export async function cambiarCostoPremio(id: string, costo: number): Promise<void> {
  const { error } = await supabase.from("lealtad_premios").update({ costo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw fallo(error, "No se pudo cambiar el costo");
}

/** Un premio pausado deja de ofrecerse en la caja; los canjes ya hechos no cambian. */
export async function setActivoPremio(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("lealtad_premios").update({ activo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw fallo(error, "No se pudo cambiar el premio");
}

/** Baja lógica: el libro sigue apuntando al premio. */
export async function eliminarPremio(id: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("lealtad_premios").update({ deleted_at: ahora, activo: false, updated_at: ahora }).eq("id", id);
  if (error) throw fallo(error, "No se pudo eliminar el premio");
}
```

- [ ] **Step 4: Correr la prueba**

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/lealtad.test.ts`
Expected: PASS. Dos cosas que pueden pedir un ajuste mínimo, sin debilitar lo que la prueba afirma:
- `toLocaleString("es-MX")` en el Node de la máquina: `pesos(200)` debe dar `$200` y `pesos(300)` `$300`. Si diera otro separador, usa `String(n)` para enteros.
- En `listarPremios` la prueba espera primero el de costo 3: el `.sort` final lo garantiza aunque el doble no ordene.

- [ ] **Step 5: Typecheck y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin typecheck && git add apps/admin/app/lib/lealtad.ts apps/admin/app/lib/lealtad-plan.ts apps/admin/app/lib/__tests__/lealtad.test.ts && git commit -m "feat(lealtad): el admin lee y guarda el programa y los premios, con el ejemplo en vivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: La sección `/lealtad` y su pestaña Programa

**Files:**
- Modify: `apps/admin/app/components/admin-shell.tsx` (`NAV`, ≈47-69)
- Modify: `apps/admin/app/lib/acceso.ts` (`MIN_JERARQUIA`) y `apps/admin/app/lib/__tests__/acceso.test.ts`
- Create: `apps/admin/app/components/lealtad-sin-contratar.tsx`
- Create: `apps/admin/app/components/lealtad-pestanas.tsx`
- Create: `apps/admin/app/(panel)/lealtad/layout.tsx`
- Create: `apps/admin/app/(panel)/lealtad/page.tsx`
- Modify: `docs/diseno/admin.md` (un párrafo nuevo)

**Interfaces:**
- Consumes: todo lo de la Tarea 5; `useModulos`, `usePerfil` de `components/admin-shell`; `PageHeader`, `PageBody` de `components/page-header`; `Button`, `DialogoPeligro` de `@vim/ui/styles`; `leerAyuda`, `AyudaAdmin` de `lib/soporte`; `enlaceWhatsapp`, `SOPORTE_POR_DEFECTO`, `textoHorario` de `@vim/db/soporte`.
- Produces: `LealtadPestanas()` (la usan las Tareas 7 y 8); el layout que decide «cargando / sin contratar / la sección».

- [ ] **Step 1: Leer las reglas de diseño del admin**

Lee `docs/diseno/admin.md` y `docs/diseno/nucleo.md` completos, y abre `apps/admin/app/(panel)/configuracion/integraciones/page.tsx` y `apps/admin/app/components/inventario-desde-negocio.tsx`: son los dos modelos de esta tarea (el interruptor de dos capas y la tarjeta de «pídelo»).

- [ ] **Step 2: Jerarquía y menú (con su prueba)**

En `apps/admin/app/lib/__tests__/acceso.test.ts` añade un caso junto a los que prueban `/clientes`:

```ts
  it("la lealtad la configura dueño o administrador; un supervisor no la ve", () => {
    expect(puedeVer(5, "/lealtad")).toBe(true);
    expect(puedeVer(4, "/lealtad/premios")).toBe(true);
    expect(puedeVer(3, "/lealtad")).toBe(false);
    expect(puedeVer(3, "/lealtad/movimientos")).toBe(false);
  });
```

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/acceso.test.ts`
Expected: FAIL (una ruta sin registrar queda abierta a jerarquía 3).

En `apps/admin/app/lib/acceso.ts`, en `MIN_JERARQUIA`, después de la fila de `/clientes`:

```ts
  // El programa de lealtad reparte dinero del negocio: lo configura dueño o administrador.
  { prefijo: "/lealtad", min: 4 },
```

En `apps/admin/app/components/admin-shell.tsx`, en `NAV`, sección «Operación», después de `Clientes`:

```tsx
      { label: "Lealtad", href: "/lealtad", icon: I.clientes },
```

(No se esconde según el plan: regla de `admin.md`. La pantalla decide qué enseñar.)

Run otra vez: PASS.

- [ ] **Step 3: Las pestañas**

`apps/admin/app/components/lealtad-pestanas.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { label: "Programa", href: "/lealtad" },
  { label: "Premios", href: "/lealtad/premios" },
  { label: "Movimientos", href: "/lealtad/movimientos" },
];

/** Las tres pestañas de la sección Lealtad. Mismo control segmentado que el filtro de Promociones. */
export function LealtadPestanas() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de lealtad" className="mb-5 inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
      {PESTANAS.map((p) => {
        const activa = ruta === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={[
              "rounded-[4px] px-3 py-1.5 text-13 font-semibold transition",
              activa ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: La tarjeta de quien no la tiene**

`apps/admin/app/components/lealtad-sin-contratar.tsx` (misma forma que `InventarioDesdeNegocio`: contenido de la pantalla, no un aviso; un solo botón; sin precios):

```tsx
"use client";
import { useEffect, useState } from "react";
import { enlaceWhatsapp, SOPORTE_POR_DEFECTO, textoHorario } from "@vim/db/soporte";
import { PageBody, PageHeader } from "./page-header";
import { usePerfil } from "./admin-shell";
import { leerAyuda, type AyudaAdmin } from "../lib/soporte";
import { LEALTAD_INCLUYE, mensajeQuieroLealtad } from "../lib/lealtad-plan";

/**
 * Lo que ve en Lealtad un negocio que todavía no tiene el programa (ADR 0030).
 *
 * No es un aviso ni un muro: ocupa el lugar de la pantalla y dice qué es y cómo pedirlo. Una sola
 * acción —escribir por WhatsApp, con el mensaje ya hecho— porque lo activa VIM. Sin precios: los
 * dice quien contesta, que sabe en qué plan está este cliente.
 */
export function LealtadSinContratar() {
  const perfil = usePerfil();
  // Arranca con el número de fábrica: el botón nunca queda sin a dónde escribir.
  const [ayuda, setAyuda] = useState<AyudaAdmin>({ soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null });
  useEffect(() => { leerAyuda().then(setAyuda).catch(() => {}); }, []);

  const wa = enlaceWhatsapp(ayuda.soporte.whatsapp, mensajeQuieroLealtad({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }));
  const horario = textoHorario(ayuda.soporte);

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Premia a los clientes que vuelven." />
      <PageBody>
        <section className="max-w-[640px] rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-20 font-semibold tracking-tight">Un programa de lealtad para tu negocio</h2>
          <p className="mt-1.5 text-14 leading-relaxed text-ink-2">
            Tus clientes ganan algo cada vez que compran y lo usan en su siguiente visita. Tú decides cómo ganan y qué reciben.
          </p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {LEALTAD_INCLUYE.map((x) => (
              <li key={x.titulo} className="text-14 leading-snug">
                <span className="font-semibold text-ink">{x.titulo}.</span>{" "}
                <span className="text-ink-2">{x.detalle}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
            <p className="text-14 text-ink-2">Si te interesa, escríbenos y lo activamos contigo.</p>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex h-10 w-fit items-center rounded bg-accent px-4 text-14 font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[.97]"
              >
                Preguntar por el programa de lealtad
              </a>
            )}
            {horario && <p className="text-12 text-ink-3">{horario}. Se abre WhatsApp con el mensaje ya escrito.</p>}
          </div>
        </section>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 5: El layout que decide qué pantalla toca**

`apps/admin/app/(panel)/lealtad/layout.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { PageBody } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { LealtadSinContratar } from "../../components/lealtad-sin-contratar";
import { estadoLealtad } from "../../lib/lealtad-plan";

/**
 * La sección Lealtad se guía por lo PERMITIDO (lo que VIM concedió), no por lo efectivo: aquí
 * adentro está el interruptor con el que el dueño la enciende. Sin el permiso, se explica cómo pedirlo.
 */
export default function LealtadLayout({ children }: { children: ReactNode }) {
  const estado = estadoLealtad(useModulos());
  if (estado === "cargando") return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (estado === "sin_contratar") return <LealtadSinContratar />;
  return <>{children}</>;
}
```

- [ ] **Step 6: La pestaña Programa**

`apps/admin/app/(panel)/lealtad/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import type { Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { LealtadPestanas } from "../../components/lealtad-pestanas";
import {
  FORM_PROGRAMA_INICIAL, activarModuloLealtad, ejemploPrograma, formDePrograma, guardarPrograma, leerProgramaAdmin, mensajeLealtad,
  type FormPrograma,
} from "../../lib/lealtad";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const ayuda = "mt-1 text-12 text-ink-3";

const MECANICAS: { codigo: Mecanica; titulo: string; detalle: string }[] = [
  { codigo: "PUNTOS_DINERO", titulo: "Puntos que valen dinero", detalle: "Gana un porcentaje de lo que consume. Cada punto vale $1 en su siguiente compra." },
  { codigo: "SELLOS", titulo: "Sellos por visita", detalle: "Un sello por visita. Al juntar los que tú digas, se lleva un premio." },
  { codigo: "PUNTOS_PREMIOS", titulo: "Puntos por premios", detalle: "Gana puntos según lo que consume y los cambia por los premios que definas." },
];

export default function ProgramaLealtadPage() {
  const modulos = useModulos();
  /** undefined = leyendo; false = todavía no hay programa guardado; true = ya existe. */
  const [existe, setExiste] = useState<boolean | undefined>(undefined);
  const [mecanicaGuardada, setMecanicaGuardada] = useState<Mecanica | null>(null);
  const [form, setForm] = useState<FormPrograma>(FORM_PROGRAMA_INICIAL);
  const [encendido, setEncendido] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /** Cambiar de mecánica borraría el saldo de estos clientes: se pide confirmación. */
  const [reinicio, setReinicio] = useState<number | null>(null);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerProgramaAdmin()
      .then((p) => {
        if (!vivo) return;
        setExiste(p !== null);
        if (p) { setForm(formDePrograma(p)); setMecanicaGuardada(p.mecanica); }
      })
      .catch((e) => { if (vivo) { setExiste(false); setError(mensajeLealtad(e, "No se pudo leer el programa")); } });
    return () => { vivo = false; };
  }, []);

  // El interruptor arranca con lo que la base dice que está efectivo.
  useEffect(() => {
    if (modulos && modulos !== "error") setEncendido(modulos.efectivos.lealtad === true);
  }, [modulos]);

  const set = <K extends keyof FormPrograma>(k: K, v: FormPrograma[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); setOk(null); };
  const ejemplo = ejemploPrograma(form);

  async function guardar(confirmarReinicio: boolean) {
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      const r = await guardarPrograma(form, confirmarReinicio);
      if (!r.ok) { setReinicio(r.clientesConSaldo); return; }
      setReinicio(null);
      setExiste(true);
      setMecanicaGuardada(form.mecanica);
      setOk(r.clientesReiniciados > 0 ? `Programa guardado. Se puso en cero el saldo de ${r.clientesReiniciados} cliente(s).` : "Programa guardado.");
    } catch (e) {
      setReinicio(null);
      setError(mensajeLealtad(e, "No se pudo guardar el programa"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEncendido(activo: boolean) {
    setCambiando(true);
    setError(null);
    setOk(null);
    try {
      await activarModuloLealtad(activo);
      setEncendido(activo);
      setApagando(false);
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo cambiar"));
      setApagando(false);
    } finally {
      setCambiando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Cómo ganan tus clientes y qué reciben por volver." />
      <PageBody>
        <LealtadPestanas />

        {error && !reinicio && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {ok && <p className="mb-4 text-sm font-medium text-success" role="status">{ok}</p>}

        {existe === undefined ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <>
            {/* El interruptor vive aquí, no en Configuración: solo afecta a la lealtad. */}
            <div className="mb-6 flex max-w-[720px] flex-wrap items-start gap-3 rounded-lg border border-line bg-surface p-4">
              <button
                type="button" role="switch" aria-checked={encendido} aria-label="Programa de lealtad"
                disabled={cambiando || !existe}
                onClick={() => (encendido ? setApagando(true) : void cambiarEncendido(true))}
                className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${encendido ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${encendido ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Programa de lealtad {encendido ? "· Encendido" : "· Apagado"}</div>
                <p className="mt-0.5 text-13 text-ink-2">
                  {!existe
                    ? "Primero guarda tu programa aquí abajo. Después lo enciendes."
                    : encendido
                      ? "Tus clientes ganan y canjean en la caja. Para que cuente, la cuenta debe llevar un cliente asignado."
                      : "Mientras está apagado nadie gana ni canjea. Los saldos se conservan y nada vence."}
                </p>
              </div>
            </div>

            <section className="max-w-[720px] rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-16 font-semibold tracking-tight">Cómo ganan tus clientes</h2>

              <div role="radiogroup" aria-label="Forma de ganar" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MECANICAS.map((m) => {
                  const elegida = form.mecanica === m.codigo;
                  return (
                    <button
                      key={m.codigo} type="button" role="radio" aria-checked={elegida}
                      onClick={() => set("mecanica", m.codigo)}
                      className={[
                        "rounded border p-3 text-left transition active:scale-[.99]",
                        elegida ? "border-ink bg-sel" : "border-line-strong hover:border-ink",
                      ].join(" ")}
                    >
                      <span className="block text-14 font-semibold text-ink">{m.titulo}</span>
                      <span className="mt-1 block text-12 leading-snug text-ink-2">{m.detalle}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {form.mecanica === "PUNTOS_DINERO" && (
                  <div>
                    <label className={label} htmlFor="lea-porcentaje">Porcentaje que regresa en puntos</label>
                    <input id="lea-porcentaje" className={input} inputMode="decimal" value={form.porcentaje}
                      onChange={(e) => set("porcentaje", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="5" />
                    <p className={ayuda}>De lo que el cliente paga por su consumo. Máximo 50.</p>
                  </div>
                )}
                {form.mecanica === "PUNTOS_PREMIOS" && (
                  <div>
                    <label className={label} htmlFor="lea-pesos">Pesos de compra por cada punto</label>
                    <input id="lea-pesos" className={input} inputMode="decimal" value={form.pesosPorPunto}
                      onChange={(e) => set("pesosPorPunto", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="10" />
                    <p className={ayuda}>Con 10, una compra de $200 da 20 puntos.</p>
                  </div>
                )}
                <div>
                  <label className={label} htmlFor="lea-minima">Compra mínima para ganar</label>
                  <input id="lea-minima" className={input} inputMode="decimal" value={form.compraMinima}
                    onChange={(e) => set("compraMinima", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
                  <p className={ayuda}>En pesos. Con 0, toda compra gana.</p>
                </div>
                <div>
                  <label className={label} htmlFor="lea-vence">Vencen tras estos meses sin venir</label>
                  <input id="lea-vence" className={input} inputMode="numeric" value={form.vencimientoMeses}
                    onChange={(e) => set("vencimientoMeses", e.target.value.replace(/\D/g, ""))} placeholder="Sin vencimiento" />
                  <p className={ayuda}>Cada compra o canje reinicia la cuenta. Vacío: no vencen.</p>
                </div>
                <div>
                  <label className={label} htmlFor="lea-tope">Compras que suman por cliente al día</label>
                  <input id="lea-tope" className={input} inputMode="numeric" value={form.topeComprasDia}
                    onChange={(e) => set("topeComprasDia", e.target.value.replace(/\D/g, ""))} placeholder="3" />
                  <p className={ayuda}>Evita que una misma persona acumule de más en un día.</p>
                </div>
              </div>

              {/* El ejemplo usa la misma regla que la caja: lo que aquí se promete es lo que se da. */}
              <div className="mt-5 rounded border border-line bg-bg px-4 py-3" aria-live="polite">
                <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Ejemplo</div>
                <p className="mt-1 text-14 text-ink">{ejemplo ?? "Completa los datos de arriba para ver un ejemplo."}</p>
                {form.mecanica !== "PUNTOS_DINERO" && (
                  <p className="mt-1 text-12 text-ink-3">Los premios se definen en la pestaña Premios.</p>
                )}
              </div>

              {existe && mecanicaGuardada && mecanicaGuardada !== form.mecanica && (
                <p className="mt-4 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning">
                  Vas a cambiar la forma de ganar. Los saldos que tus clientes ya tienen no se pueden convertir: quedarán en cero.
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button onClick={() => void guardar(false)} disabled={guardando}>{guardando ? "Guardando…" : "Guardar programa"}</Button>
              </div>
            </section>

            <p className="mt-5 max-w-[720px] rounded-lg border border-line bg-surface px-4 py-3 text-13 leading-relaxed text-ink-2">
              Tus cajas necesitan la versión 0.5.0 o una posterior para mostrar la lealtad. Un cambio que hagas aquí llega a cada
              caja en cerca de un minuto. Canjear necesita internet; ganar puntos, no.
            </p>
          </>
        )}
      </PageBody>

      {reinicio !== null && (
        <DialogoPeligro
          titulo="¿Cambiar la forma de ganar?"
          consecuencia={
            <>
              <b className="text-ink">{reinicio} cliente(s)</b> tienen saldo con la forma actual. Al cambiar, su saldo queda en cero.
              No se puede deshacer.
            </>
          }
          error={error}
          boton="Cambiar y poner saldos en cero"
          ocupado={guardando}
          textoOcupado="Cambiando…"
          ancho="sm"
          onConfirmar={() => void guardar(true)}
          onCerrar={() => setReinicio(null)}
        />
      )}

      {apagando && (
        <DialogoPeligro
          titulo="¿Apagar el programa de lealtad?"
          consecuencia="Tus clientes dejan de ganar y de canjear en la caja. Sus saldos se conservan y nada vence mientras esté apagado; puedes volver a encenderlo cuando quieras."
          boton="Apagar"
          ocupado={cambiando}
          textoOcupado="Apagando…"
          ancho="sm"
          onConfirmar={() => void cambiarEncendido(false)}
          onCerrar={() => setApagando(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: La regla en el documento de diseño**

En `docs/diseno/admin.md`, junto al párrafo que explica por qué el interruptor de combos vive en Combos, añade:

```markdown
**Lealtad.** La sección aparece siempre en el menú. Sin el programa contratado ocupa la pantalla una
tarjeta que dice qué es y un botón que abre WhatsApp con el mensaje escrito (misma regla que
Inventario). Con él, el interruptor vive en la pestaña Programa, no en Configuración. Apagarlo y
cambiar la forma de ganar pasan por `DialogoPeligro` y dicen la consecuencia: al apagar, los saldos
se conservan; al cambiar de forma, quedan en cero y se dice a cuántos clientes afecta. El ejemplo
de la pestaña Programa se calcula con la misma regla que usa la caja (`@vim/db/lealtad`).
```

- [ ] **Step 8: Verificar y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -4 && pnpm --filter @vim/admin typecheck && pnpm tipografia
cd C:/vwtN && git add apps/admin/app/components/admin-shell.tsx apps/admin/app/components/lealtad-sin-contratar.tsx apps/admin/app/components/lealtad-pestanas.tsx "apps/admin/app/(panel)/lealtad" apps/admin/app/lib/acceso.ts apps/admin/app/lib/__tests__/acceso.test.ts docs/diseno/admin.md && git commit -m "feat(lealtad): sección Lealtad en el admin con el programa, su ejemplo y el interruptor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: pruebas del admin en verde, typecheck y tipografía limpios. Si `warning-line` o `warning-soft` no existen como clases (búscalas en `packages/ui/tokens.css` o en otro archivo del admin con `grep -rn "warning-soft" apps/admin/app | head -3`), usa las que ese archivo use para un aviso amarillo. Revisa a mano las dependencias de los dos `useEffect`.

---

## Task 7: La pestaña Premios

**Files:**
- Create: `apps/admin/app/(panel)/lealtad/premios/page.tsx`

**Interfaces:**
- Consumes: `listarPremios`, `productosParaPremio`, `crearPremio`, `cambiarCostoPremio`, `setActivoPremio`, `eliminarPremio`, `costoPremioSchema`, `leerProgramaAdmin`, `mensajeLealtad`, `PremioAdmin` (Tarea 5); `cantidad`, `Mecanica` de `@vim/db/lealtad`; `LealtadPestanas` (Tarea 6); `Button`, `Modal`, `DialogoPeligro` de `@vim/ui/styles`.

- [ ] **Step 1: Escribir la página**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button, DialogoPeligro, Modal } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader } from "../../../components/page-header";
import { LealtadPestanas } from "../../../components/lealtad-pestanas";
import {
  cambiarCostoPremio, costoPremioSchema, crearPremio, eliminarPremio, leerProgramaAdmin, listarPremios, mensajeLealtad,
  productosParaPremio, setActivoPremio, type PremioAdmin,
} from "../../../lib/lealtad";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const accion = "h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50";

const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

type Editando = { id: string | null; productoId: string; nombre: string; costo: string };

export default function PremiosLealtadPage() {
  const [premios, setPremios] = useState<PremioAdmin[] | null>(null);
  /** undefined = leyendo; null = todavía no hay programa. */
  const [mecanica, setMecanica] = useState<Mecanica | null | undefined>(undefined);
  const [opciones, setOpciones] = useState<{ id: string; nombre: string; precio: number }[]>([]);
  const [editando, setEditando] = useState<Editando | null>(null);
  const [borrar, setBorrar] = useState<PremioAdmin | null>(null);
  /** Una escritura a la vez: mientras algo se guarda, lo demás no responde. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    try {
      setPremios(await listarPremios());
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudieron leer los premios"));
      setPremios([]);
    }
  }

  useEffect(() => {
    let vivo = true;
    leerProgramaAdmin().then((p) => { if (vivo) setMecanica(p?.mecanica ?? null); }).catch(() => { if (vivo) setMecanica(null); });
    void recargar();
    return () => { vivo = false; };
  }, []);

  async function nuevo() {
    setError(null);
    try {
      const ops = await productosParaPremio();
      setOpciones(ops);
      setEditando({ id: null, productoId: ops[0]?.id ?? "", nombre: "", costo: "" });
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudieron leer los productos"));
    }
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const costo = costoPremioSchema.safeParse(editando.costo);
    if (!costo.success) { setError(costo.error.issues[0]?.message ?? "Revisa el costo."); return; }
    if (!editando.id && !editando.productoId) { setError("Elige el producto que vas a regalar."); return; }
    setOcupado("guardar");
    try {
      if (editando.id) await cambiarCostoPremio(editando.id, costo.data);
      else await crearPremio(editando.productoId, costo.data);
      setEditando(null);
      await recargar();
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo guardar el premio"));
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(p: PremioAdmin) {
    setError(null);
    setOcupado(p.id);
    try {
      await setActivoPremio(p.id, !p.activo);
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo cambiar el premio"));
    } finally {
      await recargar();
      setOcupado(null);
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setOcupado(borrar.id);
    try {
      await eliminarPremio(borrar.id);
      setBorrar(null);
      await recargar();
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo eliminar el premio"));
    } finally {
      setOcupado(null);
    }
  }

  const unidadDe = (n: number) => cantidad(mecanica ?? "SELLOS", n);
  const conPremios = mecanica === "SELLOS" || mecanica === "PUNTOS_PREMIOS";

  return (
    <>
      <PageHeader
        titulo="Lealtad"
        subtitulo="Lo que tus clientes se pueden llevar."
        right={conPremios ? <Button onClick={() => void nuevo()} disabled={ocupado !== null}>Nuevo premio</Button> : undefined}
      />
      <PageBody>
        <LealtadPestanas />

        {error && !editando && !borrar && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {(premios === null || mecanica === undefined) && <p className="text-sm text-ink-3">Cargando…</p>}

        {mecanica === null && premios !== null && (
          <p className="max-w-[640px] rounded-lg border border-line bg-surface px-4 py-3 text-14 text-ink-2">
            Primero guarda tu programa en la pestaña Programa. Los premios se usan con sellos o con puntos por premios.
          </p>
        )}

        {mecanica === "PUNTOS_DINERO" && (
          <p className="mb-4 max-w-[640px] rounded-lg border border-line bg-surface px-4 py-3 text-14 text-ink-2">
            Tu programa es de puntos que valen dinero: el cliente los usa como descuento en su cuenta y no hacen falta premios.
            {premios && premios.length > 0 ? " Los premios de abajo quedaron de otra forma de ganar y no se ofrecen en la caja." : ""}
          </p>
        )}

        {conPremios && premios !== null && premios.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay premios</p>
            <p className="mt-1 text-sm text-ink-2">Elige un producto de tu catálogo y di cuánto cuesta. Sin premios, tus clientes juntan pero no tienen qué canjear.</p>
            <div className="mt-4"><Button onClick={() => void nuevo()}>Nuevo premio</Button></div>
          </div>
        )}

        {premios !== null && premios.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Premio</th>
                  <th className="px-4 py-2.5 text-right">Cuesta</th>
                  <th className="px-4 py-2.5 text-right">Precio en carta</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {premios.map((p) => (
                  <tr key={p.id} className={`border-b border-line last:border-b-0 ${ocupado === p.id ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{p.nombre}</div>
                      {!p.productoDisponible && <div className="text-12 font-medium text-warning">Su producto está pausado: no se puede entregar.</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{unidadDe(p.costo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">{fmtMxn(p.precio)}</td>
                    <td className="px-4 py-3">
                      <span className={["inline-block rounded-full px-2 py-0.5 text-12 font-semibold", p.activo ? "bg-success-soft text-success" : "bg-hover text-ink-3"].join(" ")}>
                        {p.activo ? "Activo" : "Pausado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" className={accion} disabled={ocupado !== null}
                          onClick={() => { setError(null); setEditando({ id: p.id, productoId: p.productoId, nombre: p.nombre, costo: String(p.costo) }); }}>
                          Cambiar costo
                        </button>
                        <button type="button" className={accion} disabled={ocupado !== null} onClick={() => void alternar(p)}>
                          {p.activo ? "Pausar" : "Activar"}
                        </button>
                        <button type="button" disabled={ocupado !== null} onClick={() => { setError(null); setBorrar(p); }}
                          className="h-9 rounded border border-line-strong px-3 text-13 font-semibold text-danger transition hover:border-danger disabled:opacity-50">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {conPremios && (
          <p className="mt-5 max-w-[720px] rounded-lg border border-line bg-surface px-4 py-3 text-13 leading-relaxed text-ink-2">
            En la caja, el premio entra a la cuenta como el producto en $0.00, sale a cocina y descuenta inventario como cualquier otro.
            Una cuenta que lleva un premio no se factura de forma individual: queda en tu factura global. Los combos no se pueden dar de premio.
          </p>
        )}
      </PageBody>

      {editando && (
        <Modal
          open
          onClose={() => { if (ocupado === null) setEditando(null); }}
          title={editando.id ? "Cambiar el costo" : "Nuevo premio"}
          className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          {editando.id ? (
            <p className="mt-3 text-14 font-semibold text-ink">{editando.nombre}</p>
          ) : opciones.length === 0 ? (
            <p className="mt-3 text-14 text-ink-2">No hay productos disponibles: todos son combos, están pausados o ya son premios.</p>
          ) : (
            <div className="mt-4">
              <label className={label} htmlFor="premio-producto">Producto que regalas</label>
              <select id="premio-producto" className={input} value={editando.productoId} autoFocus
                onChange={(e) => setEditando({ ...editando, productoId: e.target.value })}>
                {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} · {fmtMxn(o.precio)}</option>)}
              </select>
            </div>
          )}

          {(editando.id || opciones.length > 0) && (
            <div className="mt-4">
              <label className={label} htmlFor="premio-costo">Cuánto cuesta ({mecanica === "SELLOS" ? "sellos" : "puntos"})</label>
              <input id="premio-costo" className={input} inputMode="numeric" value={editando.costo} autoFocus={editando.id !== null}
                onChange={(e) => setEditando({ ...editando, costo: e.target.value.replace(/\D/g, "") })} placeholder={mecanica === "SELLOS" ? "6" : "100"} />
            </div>
          )}

          {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setEditando(null)} disabled={ocupado !== null}
              className="h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50">
              Cancelar
            </button>
            <Button className="flex-1" onClick={() => void guardar()} disabled={ocupado !== null || (!editando.id && opciones.length === 0)}>
              {ocupado === "guardar" ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </Modal>
      )}

      {borrar && (
        <DialogoPeligro
          titulo="¿Eliminar este premio?"
          consecuencia={
            <>
              <strong>{borrar.nombre}</strong> deja de ofrecerse en la caja. Los canjes que ya se hicieron no cambian y los saldos de tus
              clientes tampoco.
            </>
          }
          error={error}
          boton="Eliminar"
          ocupado={ocupado === borrar.id}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={() => void confirmarBorrado()}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin typecheck && pnpm tipografia && git add "apps/admin/app/(panel)/lealtad/premios/page.tsx" && git commit -m "feat(lealtad): pestaña Premios del admin, sin combos y con el costo en puntos o sellos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck y tipografía limpios. Revisa a mano el `useEffect`: depende solo del montaje (`recargar` no cierra sobre estado que cambie).

---

## Task 8: El libro, las cifras y la vista de control

**Files:**
- Create: `apps/admin/app/lib/lealtad-libro.ts`
- Create: `apps/admin/app/lib/__tests__/lealtad-libro.test.ts`
- Create: `apps/admin/app/(panel)/lealtad/movimientos/page.tsx`

**Interfaces:**
- Consumes: vista `vw_lealtad_movimientos`, funciones `lealtad_resumen`, `lealtad_control`, `lealtad_ajustar_saldo` (Tareas 1–2 y plan 1A); `listarSucursalesOpciones`, `SucursalOpcion` de `lib/inventario`.
- Produces (en `lealtad-libro.ts`):
  - `type TipoMov = "GANADO" | "CANJE" | "REVERSA_GANADO" | "REVERSA_CANJE" | "AJUSTE" | "VENCIMIENTO"`; `etiquetaTipo(t: string): string`
  - `type MovimientoLibro = { id: string; fecha: string; tipo: string; puntos: number; saldoVisto: number | null; motivo: string | null; cliente: string; telefono: string | null; sucursal: string | null; usuario: string | null; folio: string | null }`
  - `MOVS_POR_PAGINA = 50`; `listarMovimientos(a: { desde: string; hasta: string; sucursalId: string | null; tipo: TipoMov | "TODOS"; busqueda: string; pagina: number }): Promise<{ filas: MovimientoLibro[]; total: number }>`
  - `type ResumenLealtad = { emitido: number; canjeado: number; saldoVivo: number; clientesConSaldo: number }`; `leerResumen(desde, hasta, sucursalId): Promise<ResumenLealtad>`
  - `type ControlLealtad = { clientesAlTope: { clienteId: string; nombre: string; diasAlTope: number }[]; cajeros: { usuarioId: string; nombre: string; canjes: number; clientes: number; puntos: number; delClienteTop: number }[] }`; `leerControl(desde, hasta): Promise<ControlLealtad>`
  - `hoyMexico(ahora?: Date): string`; `rangoPorDefecto(ahora?: Date): { desde: string; hasta: string }`; `errorDeRango(desde: string, hasta: string, hoy: string): string | null`
  - `ajusteSchema`; `ajustarSaldo(clienteId: string, puntos: number, motivo: string): Promise<number>`; `historialCliente(clienteId: string): Promise<MovimientoLibro[]>` (los usa la Tarea 9)

- [ ] **Step 1: La prueba que falla**

Crea `apps/admin/app/lib/__tests__/lealtad-libro.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({
  filas: [] as Fila[],
  llamadas: [] as { metodo: string; args: unknown[] }[],
  rpc: [] as { fn: string; args: Fila }[],
  rpcRespuesta: {} as Record<string, { data: unknown; error: { message: string } | null }>,
}));

// Doble que ANOTA la consulta (qué filtros se pidieron) y devuelve las filas tal cual.
function consulta(tabla: string) {
  doble.llamadas.push({ metodo: "from", args: [tabla] });
  const anota = (metodo: string) => (...args: unknown[]) => { doble.llamadas.push({ metodo, args }); return q; };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lt", "or", "order", "range", "limit"]) q[m] = anota(m);
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: doble.filas, error: null, count: doble.filas.length }).then(ok);
  return q;
}

vi.mock("../supabase", () => ({
  supabase: {
    from: consulta,
    rpc: vi.fn(async (fn: string, args: Fila) => { doble.rpc.push({ fn, args }); return doble.rpcRespuesta[fn] ?? { data: null, error: null }; }),
  },
  leerSesion: vi.fn(async () => ({ email: "d@d.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB", autoservicio: false })),
}));

import {
  MOVS_POR_PAGINA, ajustarSaldo, ajusteSchema, errorDeRango, etiquetaTipo, historialCliente, hoyMexico, leerControl, leerResumen,
  listarMovimientos, rangoPorDefecto,
} from "../lealtad-libro";

const FILA = {
  id: "m1", fecha: "2026-10-06T18:00:00+00:00", tipo: "CANJE", puntos: -50, saldo_visto: 70, motivo: null,
  cliente_nombre: "Ana Gómez", cliente_telefono: "4771234567", sucursal_nombre: "Centro", usuario_nombre: "María G", ticket_folio: "KC-1",
};
const con = (metodo: string) => doble.llamadas.filter((l) => l.metodo === metodo).map((l) => l.args);

beforeEach(() => { doble.filas = []; doble.llamadas = []; doble.rpc = []; doble.rpcRespuesta = {}; });

describe("fechas del libro, en hora de México", () => {
  it("«hoy» es el día de México, no el de UTC", () => {
    expect(hoyMexico(new Date("2026-10-07T03:30:00Z"))).toBe("2026-10-06");
    expect(hoyMexico(new Date("2026-10-07T18:00:00Z"))).toBe("2026-10-07");
  });

  it("por defecto se miran los últimos 30 días, contando hoy", () => {
    expect(rangoPorDefecto(new Date("2026-10-07T18:00:00Z"))).toEqual({ desde: "2026-09-08", hasta: "2026-10-07" });
  });

  it("el rango no deja elegir el futuro ni un inicio posterior al fin, y dice por qué", () => {
    expect(errorDeRango("2026-10-01", "2026-10-07", "2026-10-07")).toBeNull();
    expect(errorDeRango("2026-10-08", "2026-10-07", "2026-10-07")).toMatch(/inicio/i);
    expect(errorDeRango("2026-10-01", "2026-10-08", "2026-10-07")).toMatch(/futuro/i);
    expect(errorDeRango("", "2026-10-07", "2026-10-07")).toMatch(/fechas/i);
  });
});

describe("el libro", () => {
  it("cada tipo de movimiento se dice en palabras del dueño", () => {
    expect(etiquetaTipo("GANADO")).toBe("Ganó");
    expect(etiquetaTipo("CANJE")).toBe("Canjeó");
    expect(etiquetaTipo("REVERSA_GANADO")).toBe("Se le quitó lo ganado");
    expect(etiquetaTipo("REVERSA_CANJE")).toBe("Canje devuelto");
    expect(etiquetaTipo("AJUSTE")).toBe("Ajuste");
    expect(etiquetaTipo("VENCIMIENTO")).toBe("Venció");
    expect(etiquetaTipo("OTRO")).toBe("OTRO");
  });

  it("filtra por el día de México completo, por sucursal, por tipo y por cliente, y pagina", async () => {
    doble.filas = [FILA];
    const r = await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: "s1", tipo: "CANJE", busqueda: "Ana 477-123", pagina: 2 });
    expect(con("from")).toEqual([["vw_lealtad_movimientos"]]);
    expect(con("gte")).toEqual([["fecha", "2026-10-01T00:00:00-06:00"]]);
    expect(con("lt")).toEqual([["fecha", "2026-10-07T00:00:00-06:00"]]);
    expect(con("eq")).toEqual([["sucursal_id", "s1"], ["tipo", "CANJE"]]);
    expect(con("or")).toEqual([["cliente_nombre.ilike.%Ana 477-123%,cliente_telefono.ilike.%477123%"]]);
    expect(con("range")).toEqual([[MOVS_POR_PAGINA, MOVS_POR_PAGINA * 2 - 1]]);
    expect(r).toEqual({
      total: 1,
      filas: [{ id: "m1", fecha: "2026-10-06T18:00:00+00:00", tipo: "CANJE", puntos: -50, saldoVisto: 70, motivo: null, cliente: "Ana Gómez", telefono: "4771234567", sucursal: "Centro", usuario: "María G", folio: "KC-1" }],
    });
  });

  it("sin sucursal, sin tipo y sin búsqueda no añade esos filtros", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: "  ", pagina: 1 });
    expect(con("eq")).toEqual([]);
    expect(con("or")).toEqual([]);
    expect(con("range")).toEqual([[0, MOVS_POR_PAGINA - 1]]);
  });

  it("los caracteres que rompen el .or() no llegan a la consulta", async () => {
    await listarMovimientos({ desde: "2026-10-01", hasta: "2026-10-06", sucursalId: null, tipo: "TODOS", busqueda: "a,b(c)%", pagina: 1 });
    expect(con("or")).toEqual([["cliente_nombre.ilike.%a b c %"]]);
  });

  it("el historial de un cliente son sus últimos 30 movimientos", async () => {
    doble.filas = [FILA];
    const h = await historialCliente("c1");
    expect(con("eq")).toEqual([["cliente_id", "c1"]]);
    expect(con("limit")).toEqual([[30]]);
    expect(h[0]?.cliente).toBe("Ana Gómez");
  });
});

describe("cifras y control", () => {
  it("el resumen llega con números y nombres del lado del admin", async () => {
    doble.rpcRespuesta.lealtad_resumen = { data: { emitido: 120, canjeado: 50, saldo_vivo: 300, clientes_con_saldo: 12 }, error: null };
    expect(await leerResumen("2026-10-01", "2026-10-06", null)).toEqual({ emitido: 120, canjeado: 50, saldoVivo: 300, clientesConSaldo: 12 });
    expect(doble.rpc[0]).toEqual({ fn: "lealtad_resumen", args: { p_desde: "2026-10-01", p_hasta: "2026-10-06", p_sucursal: null } });
  });

  it("la vista de control llega lista para pintar; vacía si la base no manda nada", async () => {
    doble.rpcRespuesta.lealtad_control = { data: {
      clientes_al_tope: [{ cliente_id: "c1", cliente_nombre: "Ana Gómez", dias_al_tope: 3 }],
      cajeros: [{ usuario_id: "u9", usuario_nombre: "María G", canjes: 6, clientes: 2, puntos: 300, del_cliente_top: 5 }],
    }, error: null };
    expect(await leerControl("2026-10-01", "2026-10-06")).toEqual({
      clientesAlTope: [{ clienteId: "c1", nombre: "Ana Gómez", diasAlTope: 3 }],
      cajeros: [{ usuarioId: "u9", nombre: "María G", canjes: 6, clientes: 2, puntos: 300, delClienteTop: 5 }],
    });
    doble.rpcRespuesta.lealtad_control = { data: null, error: null };
    expect(await leerControl("2026-10-01", "2026-10-06")).toEqual({ clientesAlTope: [], cajeros: [] });
  });
});

describe("ajuste manual", () => {
  it("pide puntos enteros distintos de cero y un motivo", () => {
    expect(ajusteSchema.safeParse({ puntos: "10", motivo: "Cortesía por la espera" }).success).toBe(true);
    expect(ajusteSchema.safeParse({ puntos: "-5", motivo: "Se cargó de más" }).success).toBe(true);
    expect(ajusteSchema.safeParse({ puntos: "0", motivo: "x" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ puntos: "2.5", motivo: "x y z" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ puntos: "10", motivo: "  " }).success).toBe(false);
  });

  it("va por la función de la base y devuelve el saldo nuevo", async () => {
    doble.rpcRespuesta.lealtad_ajustar_saldo = { data: 130, error: null };
    expect(await ajustarSaldo("c1", 10, "  Cortesía por la espera ")).toBe(130);
    expect(doble.rpc[0]).toEqual({ fn: "lealtad_ajustar_saldo", args: { p_cliente_id: "c1", p_puntos: 10, p_motivo: "Cortesía por la espera" } });
  });

  it("lo que la base rechaza se dice tal cual: ya viene en palabras del dueño", async () => {
    doble.rpcRespuesta.lealtad_ajustar_saldo = { data: null, error: { message: "El ajuste dejaría el saldo en negativo." } };
    await expect(ajustarSaldo("c1", -500, "Error de captura")).rejects.toThrow("El ajuste dejaría el saldo en negativo.");
  });
});
```

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/lealtad-libro.test.ts`
Expected: FAIL — `Cannot find module '../lealtad-libro'`.

- [ ] **Step 2: `lealtad-libro.ts`**

```ts
"use client";
// El libro de la lealtad visto desde el admin (spec §7, pestaña Movimientos): cuatro cifras, los
// movimientos con nombres y la vista de control. Y el ajuste manual de un saldo, que usa Clientes.
// Todo es lectura bajo RLS; el ajuste va por `lealtad_ajustar_saldo` (0156), que lo deja en el libro
// con quién lo hizo y por qué.
import { z } from "zod";
import { supabase } from "./supabase";
import { mensajeLealtad } from "./lealtad";

export type TipoMov = "GANADO" | "CANJE" | "REVERSA_GANADO" | "REVERSA_CANJE" | "AJUSTE" | "VENCIMIENTO";

const ETIQUETAS: Record<string, string> = {
  GANADO: "Ganó",
  CANJE: "Canjeó",
  REVERSA_GANADO: "Se le quitó lo ganado",
  REVERSA_CANJE: "Canje devuelto",
  AJUSTE: "Ajuste",
  VENCIMIENTO: "Venció",
};
export const TIPOS: TipoMov[] = ["GANADO", "CANJE", "REVERSA_GANADO", "REVERSA_CANJE", "AJUSTE", "VENCIMIENTO"];
export function etiquetaTipo(t: string): string {
  return ETIQUETAS[t] ?? t;
}

// ── Fechas: el negocio vive en hora de México (UTC−6 fijo, sin horario de verano) ──────────────

export function hoyMexico(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los últimos 30 días, contando hoy. */
export function rangoPorDefecto(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hasta = hoyMexico(ahora);
  return { desde: sumarDias(hasta, -29), hasta };
}

/** Por qué no se puede consultar ese rango, o null si sí (regla de admin.md: se dice por qué). */
export function errorDeRango(desde: string, hasta: string, hoy: string): string | null {
  if (!desde || !hasta) return "Elige las dos fechas.";
  if (desde > hasta) return "El inicio no puede ser posterior al fin.";
  if (hasta > hoy) return "No se puede consultar el futuro.";
  return null;
}

// ── El libro ─────────────────────────────────────────────────────────────────

export type MovimientoLibro = {
  id: string;
  fecha: string;
  tipo: string;
  /** Con signo: positivo suma, negativo resta. */
  puntos: number;
  /** El saldo tal como quedó donde se escribió el movimiento. */
  saldoVisto: number | null;
  motivo: string | null;
  cliente: string;
  telefono: string | null;
  sucursal: string | null;
  usuario: string | null;
  folio: string | null;
};

export const MOVS_POR_PAGINA = 50;
const COLUMNAS = "id, fecha, tipo, puntos, saldo_visto, motivo, cliente_nombre, cliente_telefono, sucursal_nombre, usuario_nombre, ticket_folio";

function aMovimiento(f: Record<string, unknown>): MovimientoLibro {
  const texto = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
  return {
    id: String(f.id),
    fecha: String(f.fecha),
    tipo: String(f.tipo),
    puntos: Number(f.puntos) || 0,
    saldoVisto: f.saldo_visto == null ? null : Number(f.saldo_visto),
    motivo: texto(f.motivo),
    cliente: texto(f.cliente_nombre) ?? "Sin nombre",
    telefono: texto(f.cliente_telefono),
    sucursal: texto(f.sucursal_nombre),
    usuario: texto(f.usuario_nombre),
    folio: texto(f.ticket_folio),
  };
}

export async function listarMovimientos(a: {
  desde: string; hasta: string; sucursalId: string | null; tipo: TipoMov | "TODOS"; busqueda: string; pagina: number;
}): Promise<{ filas: MovimientoLibro[]; total: number }> {
  let q = supabase
    .from("vw_lealtad_movimientos")
    .select(COLUMNAS, { count: "exact" })
    // El día completo en México: desde su medianoche hasta la medianoche del día siguiente.
    .gte("fecha", `${a.desde}T00:00:00-06:00`)
    .lt("fecha", `${sumarDias(a.hasta, 1)}T00:00:00-06:00`);
  if (a.sucursalId) q = q.eq("sucursal_id", a.sucursalId);
  if (a.tipo !== "TODOS") q = q.eq("tipo", a.tipo);
  const texto = a.busqueda.trim().replace(/[%,()]/g, " ");
  if (texto.trim()) {
    const digitos = a.busqueda.replace(/\D/g, "");
    const partes = [`cliente_nombre.ilike.%${texto}%`];
    if (digitos.length >= 3) partes.push(`cliente_telefono.ilike.%${digitos}%`);
    q = q.or(partes.join(","));
  }
  const desde = (Math.max(1, a.pagina) - 1) * MOVS_POR_PAGINA;
  const { data, error, count } = await q
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .range(desde, desde + MOVS_POR_PAGINA - 1);
  if (error) throw new Error(mensajeLealtad(error, "No se pudieron leer los movimientos"));
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(aMovimiento), total: count ?? 0 };
}

/** Los últimos 30 movimientos de un cliente, del más reciente al más viejo. */
export async function historialCliente(clienteId: string): Promise<MovimientoLibro[]> {
  const { data, error } = await supabase
    .from("vw_lealtad_movimientos")
    .select(COLUMNAS)
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .limit(30);
  if (error) throw new Error(mensajeLealtad(error, "No se pudo leer el historial"));
  return ((data ?? []) as Record<string, unknown>[]).map(aMovimiento);
}

// ── Cifras y control ─────────────────────────────────────────────────────────

export type ResumenLealtad = { emitido: number; canjeado: number; saldoVivo: number; clientesConSaldo: number };

export async function leerResumen(desde: string, hasta: string, sucursalId: string | null): Promise<ResumenLealtad> {
  const { data, error } = await supabase.rpc("lealtad_resumen", { p_desde: desde, p_hasta: hasta, p_sucursal: sucursalId });
  if (error) throw new Error(mensajeLealtad(error, "No se pudieron leer las cifras"));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    emitido: Number(r.emitido) || 0,
    canjeado: Number(r.canjeado) || 0,
    saldoVivo: Number(r.saldo_vivo) || 0,
    clientesConSaldo: Number(r.clientes_con_saldo) || 0,
  };
}

export type ControlLealtad = {
  /** Clientes que llegaron al tope de compras del día dos días o más. */
  clientesAlTope: { clienteId: string; nombre: string; diasAlTope: number }[];
  /** Cajeros con tres canjes o más, del más concentrado en un solo cliente al menos. */
  cajeros: { usuarioId: string; nombre: string; canjes: number; clientes: number; puntos: number; delClienteTop: number }[];
};

export async function leerControl(desde: string, hasta: string): Promise<ControlLealtad> {
  const { data, error } = await supabase.rpc("lealtad_control", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(mensajeLealtad(error, "No se pudo leer la vista de control"));
  const r = (data ?? {}) as { clientes_al_tope?: Record<string, unknown>[]; cajeros?: Record<string, unknown>[] };
  return {
    clientesAlTope: (r.clientes_al_tope ?? []).map((c) => ({
      clienteId: String(c.cliente_id), nombre: String(c.cliente_nombre ?? "Sin nombre"), diasAlTope: Number(c.dias_al_tope) || 0,
    })),
    cajeros: (r.cajeros ?? []).map((c) => ({
      usuarioId: String(c.usuario_id), nombre: String(c.usuario_nombre || "Sin nombre"),
      canjes: Number(c.canjes) || 0, clientes: Number(c.clientes) || 0, puntos: Number(c.puntos) || 0, delClienteTop: Number(c.del_cliente_top) || 0,
    })),
  };
}

// ── Ajuste manual ─────────────────────────────────────────────────────────────

export const ajusteSchema = z.object({
  puntos: z.string().trim().regex(/^-?\d+$/, "Escribe un número entero. Con signo menos para quitar.")
    .refine((s) => Number(s) !== 0, "El ajuste no puede ser cero.")
    .refine((s) => Math.abs(Number(s)) <= 100000, "Un ajuste no puede pasar de 100,000."),
  motivo: z.string().trim().min(3, "Escribe el motivo: queda guardado con tu nombre.").max(200),
});

/** Suma o resta a mano. Devuelve el saldo nuevo. Queda en el libro con quién lo hizo y el motivo. */
export async function ajustarSaldo(clienteId: string, puntos: number, motivo: string): Promise<number> {
  const { data, error } = await supabase.rpc("lealtad_ajustar_saldo", { p_cliente_id: clienteId, p_puntos: puntos, p_motivo: motivo.trim() });
  if (error) throw new Error(mensajeLealtad(error, "No se pudo ajustar el saldo"));
  return Number(data ?? 0);
}
```

- [ ] **Step 3: Correr la prueba**

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/lealtad-libro.test.ts`
Expected: PASS. El caso «los caracteres que rompen el .or()» espera `cliente_nombre.ilike.%a b c %` (el texto ya sin `,()%` y sin recortar por dentro) y ninguna condición de teléfono porque no hay tres dígitos.

- [ ] **Step 4: La página Movimientos**

`apps/admin/app/(panel)/lealtad/movimientos/page.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { LealtadPestanas } from "../../../components/lealtad-pestanas";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { leerProgramaAdmin, mensajeLealtad } from "../../../lib/lealtad";
import {
  MOVS_POR_PAGINA, TIPOS, errorDeRango, etiquetaTipo, hoyMexico, leerControl, leerResumen, listarMovimientos, rangoPorDefecto,
  type ControlLealtad, type MovimientoLibro, type ResumenLealtad, type TipoMov,
} from "../../../lib/lealtad-libro";

const control = "h-10 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink";
const etiqueta = "mb-1 block text-12 font-medium text-ink-2";
const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Filtros = { desde: string; hasta: string; sucursalId: string | null; tipo: TipoMov | "TODOS"; busqueda: string };

export default function MovimientosLealtadPage() {
  const inicial = rangoPorDefecto();
  /** Lo que se está escribiendo en los controles. */
  const [borrador, setBorrador] = useState<Filtros>({ ...inicial, sucursalId: null, tipo: "TODOS", busqueda: "" });
  /** Lo que de verdad se consultó (cambia solo al tocar Aplicar). */
  const [filtros, setFiltros] = useState<Filtros>({ ...inicial, sucursalId: null, tipo: "TODOS", busqueda: "" });
  const [pagina, setPagina] = useState(1);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [mecanica, setMecanica] = useState<Mecanica>("PUNTOS_DINERO");
  const [resumen, setResumen] = useState<ResumenLealtad | null>(null);
  const [vigilancia, setVigilancia] = useState<ControlLealtad | null>(null);
  const [libro, setLibro] = useState<{ filas: MovimientoLibro[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Solo la respuesta de la última consulta pinta: una vieja que tarda más no pisa a la nueva.
  const ultima = useRef(0);

  useEffect(() => {
    listarSucursalesOpciones().then(setSucursales).catch(() => setSucursales([]));
    leerProgramaAdmin().then((p) => { if (p) setMecanica(p.mecanica); }).catch(() => {});
  }, []);

  // Cifras y control: dependen del rango y la sucursal, no de la página ni del tipo.
  useEffect(() => {
    const n = ++ultima.current;
    setError(null);
    Promise.all([leerResumen(filtros.desde, filtros.hasta, filtros.sucursalId), leerControl(filtros.desde, filtros.hasta)])
      .then(([r, c]) => { if (n === ultima.current) { setResumen(r); setVigilancia(c); } })
      .catch((e) => { if (n === ultima.current) setError(mensajeLealtad(e, "No se pudieron leer las cifras")); });
  }, [filtros.desde, filtros.hasta, filtros.sucursalId]);

  const consultaLibro = useRef(0);
  useEffect(() => {
    const n = ++consultaLibro.current;
    setLibro(null);
    listarMovimientos({ ...filtros, pagina })
      .then((r) => { if (n === consultaLibro.current) setLibro(r); })
      .catch((e) => { if (n === consultaLibro.current) { setLibro({ filas: [], total: 0 }); setError(mensajeLealtad(e, "No se pudieron leer los movimientos")); } });
  }, [filtros, pagina]);

  const hoy = hoyMexico();
  const errorRango = errorDeRango(borrador.desde, borrador.hasta, hoy);
  const aplicar = () => { if (!errorRango) { setPagina(1); setFiltros(borrador); } };
  const paginas = libro ? Math.max(1, Math.ceil(libro.total / MOVS_POR_PAGINA)) : 1;
  const puntos = (n: number) => cantidad(mecanica, n);

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Cuánto has repartido, cuánto se ha canjeado y quién lo hizo." />
      <PageBody>
        <LealtadPestanas />

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <label className={etiqueta} htmlFor="mov-desde">Desde</label>
            <input id="mov-desde" type="date" className={control} max={hoy} value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="mov-hasta">Hasta</label>
            <input id="mov-hasta" type="date" className={control} max={hoy} value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} />
          </div>
          {sucursales.length > 1 && (
            <div>
              <label className={etiqueta} htmlFor="mov-suc">Sucursal</label>
              <select id="mov-suc" className={control} value={borrador.sucursalId ?? ""} onChange={(e) => setBorrador({ ...borrador, sucursalId: e.target.value || null })}>
                <option value="">Todas</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={etiqueta} htmlFor="mov-tipo">Movimiento</label>
            <select id="mov-tipo" className={control} value={borrador.tipo} onChange={(e) => setBorrador({ ...borrador, tipo: e.target.value as TipoMov | "TODOS" })}>
              <option value="TODOS">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{etiquetaTipo(t)}</option>)}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={etiqueta} htmlFor="mov-buscar">Cliente</label>
            <input id="mov-buscar" className={`${control} w-full`} placeholder="Nombre o teléfono" value={borrador.busqueda}
              onChange={(e) => setBorrador({ ...borrador, busqueda: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") aplicar(); }} />
          </div>
          <Button onClick={aplicar} disabled={errorRango !== null}>Aplicar</Button>
        </div>
        {errorRango && <p className="mb-4 text-13 font-medium text-danger" role="alert">{errorRango}</p>}
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}

        <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { t: "Repartido en el periodo", v: resumen ? puntos(resumen.emitido) : "…", pie: "Lo que ganaron tus clientes" },
            { t: "Canjeado en el periodo", v: resumen ? puntos(resumen.canjeado) : "…", pie: mecanica === "PUNTOS_DINERO" && resumen ? `${fmtMxn(resumen.canjeado)} en descuentos` : "Lo que ya usaron" },
            { t: "Saldo vivo hoy", v: resumen ? puntos(resumen.saldoVivo) : "…", pie: mecanica === "PUNTOS_DINERO" && resumen ? `Equivale a ${fmtMxn(resumen.saldoVivo)}` : "Lo que todavía pueden usar" },
            { t: "Clientes con saldo", v: resumen ? String(resumen.clientesConSaldo) : "…", pie: "En todo el negocio" },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-12 font-bold uppercase tracking-wide text-ink-3">{c.t}</dt>
              <dd className="mt-1 font-display text-20 font-semibold tabular-nums text-ink">{c.v}</dd>
              <dd className="mt-0.5 text-12 text-ink-3">{c.pie}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mb-2 font-display text-16 font-semibold tracking-tight">Movimientos</h2>
        {libro === null ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : libro.filas.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-15 font-semibold text-ink-2">Sin movimientos</p>
            <p className="mt-1 text-13">No hay nada con esos filtros. Los puntos se ganan en cuentas con un cliente asignado.</p>
          </div>
        ) : (
          <>
            <TablaScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Cliente</th>
                    <th className="px-4 py-2.5">Movimiento</th>
                    <th className="px-4 py-2.5 text-right">Cantidad</th>
                    <th className="px-4 py-2.5 text-right">Saldo</th>
                    <th className="px-4 py-2.5">Sucursal</th>
                    <th className="px-4 py-2.5">Quién</th>
                    <th className="px-4 py-2.5">Cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {libro.filas.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2">{fmtFecha(m.fecha)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-ink">{m.cliente}</div>
                        {m.telefono && <div className="font-mono text-12 text-ink-3">{m.telefono}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        {etiquetaTipo(m.tipo)}
                        {m.motivo && <div className="text-12 text-ink-3">{m.motivo}</div>}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${m.puntos < 0 ? "text-danger" : "text-ink"}`}>
                        {m.puntos > 0 ? "+" : "−"}{Math.abs(m.puntos)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{m.saldoVisto ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-2">{m.sucursal ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-2">{m.usuario ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-12 text-ink-3">{m.folio ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScroll>
            <div className="mt-3 flex items-center justify-between text-13 text-ink-2">
              <span>Página <b>{pagina}</b> de <b>{paginas}</b> · {libro.total} movimiento(s)</span>
              <div className="flex gap-2">
                <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}
                  className="h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-40">Anterior</button>
                <button type="button" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}
                  className="h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          </>
        )}

        <h2 className="mb-1 mt-8 font-display text-16 font-semibold tracking-tight">Para revisar</h2>
        <p className="mb-3 max-w-[720px] text-13 text-ink-2">
          Dos señales que conviene mirar de vez en cuando. No son acusaciones: un cliente muy fiel o un cajero con un turno pesado también salen aquí.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-14 font-semibold text-ink">Clientes que llegan seguido al tope del día</h3>
            {!vigilancia ? <p className="mt-2 text-13 text-ink-3">Cargando…</p> : vigilancia.clientesAlTope.length === 0 ? (
              <p className="mt-2 text-13 text-ink-3">Nadie llegó al tope dos días o más en este periodo.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {vigilancia.clientesAlTope.map((c) => (
                  <li key={c.clienteId} className="flex items-center justify-between border-b border-line py-2 text-13 last:border-b-0">
                    <span className="font-semibold text-ink">{c.nombre}</span>
                    <span className="tabular-nums text-ink-2">{c.diasAlTope} días al tope</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-14 font-semibold text-ink">Canjes por cajero</h3>
            {!vigilancia ? <p className="mt-2 text-13 text-ink-3">Cargando…</p> : vigilancia.cajeros.length === 0 ? (
              <p className="mt-2 text-13 text-ink-3">Ningún cajero hizo tres canjes o más en este periodo.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {vigilancia.cajeros.map((c) => (
                  <li key={c.usuarioId} className="border-b border-line py-2 text-13 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{c.nombre}</span>
                      <span className="tabular-nums text-ink-2">{c.canjes} canjes · {puntos(c.puntos)}</span>
                    </div>
                    <div className="text-12 text-ink-3">A {c.clientes} cliente(s); {c.delClienteTop} de los {c.canjes} fueron al mismo.</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
}
```

- [ ] **Step 5: Verificar y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -4 && pnpm --filter @vim/admin typecheck && pnpm tipografia
cd C:/vwtN && git add apps/admin/app/lib/lealtad-libro.ts apps/admin/app/lib/__tests__/lealtad-libro.test.ts "apps/admin/app/(panel)/lealtad/movimientos/page.tsx" && git commit -m "feat(lealtad): pestaña Movimientos con las cifras, el libro filtrable y la vista de control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: en verde y limpio. Si `TablaScroll` no se exporta desde `components/page-header` con ese nombre, usa el envoltorio que use `clientes/page.tsx` para su tabla. Revisa a mano las dependencias de los tres `useEffect` (el segundo depende de tres campos de `filtros`, no del objeto entero: es a propósito).

---

## Task 9: Clientes: saldo, historial y ajuste manual

**Files:**
- Modify: `apps/admin/app/lib/clientes.ts` (`ResumenCliente`, el `select` de `listarClientesPagina` y su `map`)
- Create: `apps/admin/app/components/cliente-lealtad.tsx`
- Modify: `apps/admin/app/(panel)/clientes/page.tsx` (encabezado y celdas de la tabla, ≈237-275)

**Interfaces:**
- Consumes: `vw_clientes_lista.lealtad_saldo`, `.lealtad_vence_el` (Tarea 2); `ajustarSaldo`, `ajusteSchema`, `historialCliente`, `etiquetaTipo`, `MovimientoLibro` (Tarea 8); `leerProgramaAdmin`, `mensajeLealtad` (Tarea 5); `useModulos`.
- Produces: `ResumenCliente` gana `lealtadSaldo: number` y `lealtadVenceEl: string | null`; componente `ClienteLealtad({ cliente, onCerrar, onCambio })`.

- [ ] **Step 1: La lista trae el saldo**

En `apps/admin/app/lib/clientes.ts`:

1. `ResumenCliente` pasa a:

```ts
export type ResumenCliente = {
  compras: number;
  gastoTotal: number;
  ultimaVisita: string | null;
  /** Saldo de lealtad del programa vigente (0159). 0 si no tiene o si el programa cambió. */
  lealtadSaldo: number;
  lealtadVenceEl: string | null;
};
```

2. En `listarClientesPagina`, añade `, lealtad_saldo, lealtad_vence_el` al final del texto del `.select(...)` (después de `ultima_visita`).
3. En el `map` que arma cada fila (donde hoy se asignan `compras`, `gastoTotal` y `ultimaVisita` a partir de la fila), añade con el mismo estilo:

```ts
      lealtadSaldo: Number(f.lealtad_saldo ?? 0) || 0,
      lealtadVenceEl: (f.lealtad_vence_el as string | null) ?? null,
```

(`f` es el nombre que ese `map` le dé a la fila: usa el que tenga.)

Run: `cd C:/vwtN && pnpm --filter @vim/admin typecheck`
Expected: sin errores, o errores en algún archivo (pruebas incluidas) que construya un `ResumenCliente` a mano: añade ahí `lealtadSaldo: 0, lealtadVenceEl: null`.

- [ ] **Step 2: El diálogo de lealtad del cliente**

`apps/admin/app/components/cliente-lealtad.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { leerProgramaAdmin, mensajeLealtad } from "../lib/lealtad";
import { ajustarSaldo, ajusteSchema, etiquetaTipo, historialCliente, type MovimientoLibro } from "../lib/lealtad-libro";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDia = (dia: string) => { const [a, m, d] = dia.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };

/**
 * La lealtad de un cliente: su saldo, cuándo vence, sus últimos movimientos y el ajuste manual
 * (spec §7). El ajuste queda en el libro con quién lo hizo y por qué; no hay forma de borrarlo.
 */
export function ClienteLealtad({
  cliente,
  onCerrar,
  onCambio,
}: {
  cliente: { id: string; nombre: string; saldo: number; venceEl: string | null };
  onCerrar: () => void;
  /** El saldo cambió: la lista de clientes debe releerse. */
  onCambio: () => void;
}) {
  const [mecanica, setMecanica] = useState<Mecanica>("PUNTOS_DINERO");
  const [saldo, setSaldo] = useState(cliente.saldo);
  const [historial, setHistorial] = useState<MovimientoLibro[] | null>(null);
  const [puntos, setPuntos] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    leerProgramaAdmin().then((p) => { if (vivo && p) setMecanica(p.mecanica); }).catch(() => {});
    historialCliente(cliente.id)
      .then((h) => { if (vivo) setHistorial(h); })
      .catch((e) => { if (vivo) { setHistorial([]); setError(mensajeLealtad(e, "No se pudo leer el historial")); } });
    return () => { vivo = false; };
  }, [cliente.id]);

  async function ajustar() {
    setError(null);
    setOk(null);
    const v = ajusteSchema.safeParse({ puntos, motivo });
    if (!v.success) { setError(v.error.issues[0]?.message ?? "Revisa el ajuste."); return; }
    setGuardando(true);
    try {
      const nuevo = await ajustarSaldo(cliente.id, Number(v.data.puntos), v.data.motivo);
      setSaldo(nuevo);
      setPuntos("");
      setMotivo("");
      setOk("Ajuste guardado.");
      setHistorial(await historialCliente(cliente.id).catch(() => []));
      onCambio();
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo ajustar el saldo"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!guardando) onCerrar(); }}
      title={`Lealtad de ${cliente.nombre}`}
      className="w-[560px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-24 font-semibold tabular-nums text-ink">{cantidad(mecanica, saldo)}</span>
        <span className="text-13 text-ink-3">{cliente.venceEl ? `Vence el ${fmtDia(cliente.venceEl)} si no vuelve` : "Sin fecha de vencimiento"}</span>
      </div>

      <h3 className="mb-2 mt-5 text-12 font-bold uppercase tracking-wide text-ink-3">Últimos movimientos</h3>
      <div className="max-h-[220px] overflow-y-auto rounded border border-line">
        {historial === null ? (
          <p className="p-3 text-13 text-ink-3">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="p-3 text-13 text-ink-3">Todavía no tiene movimientos.</p>
        ) : (
          <ul>
            {historial.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-13 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-ink">{etiquetaTipo(m.tipo)}{m.folio ? ` · ${m.folio}` : ""}</span>
                  <span className="block text-12 text-ink-3">{fmtFecha(m.fecha)}{m.usuario ? ` · ${m.usuario}` : ""}{m.motivo ? ` · ${m.motivo}` : ""}</span>
                </span>
                <span className={`flex-shrink-0 font-semibold tabular-nums ${m.puntos < 0 ? "text-danger" : "text-ink"}`}>
                  {m.puntos > 0 ? "+" : "−"}{Math.abs(m.puntos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3 className="mb-2 mt-5 text-12 font-bold uppercase tracking-wide text-ink-3">Ajuste a mano</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <label className={label} htmlFor="aj-puntos">Cantidad</label>
          <input id="aj-puntos" className={input} inputMode="numeric" value={puntos} placeholder="10 o -10"
            onChange={(e) => { setPuntos(e.target.value.replace(/[^0-9-]/g, "")); setError(null); setOk(null); }} />
        </div>
        <div>
          <label className={label} htmlFor="aj-motivo">Motivo</label>
          <input id="aj-motivo" className={input} value={motivo} maxLength={200} placeholder="Por qué se suma o se quita"
            onChange={(e) => { setMotivo(e.target.value); setError(null); setOk(null); }} />
        </div>
      </div>
      <p className="mt-1.5 text-12 text-ink-3">Con signo menos para quitar. Queda guardado con tu nombre y no se puede borrar.</p>

      {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}
      {ok && <p className="mt-3 text-13 font-medium text-success" role="status">{ok}</p>}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cerrar</Button>
        <Button onClick={() => void ajustar()} disabled={guardando}>{guardando ? "Guardando…" : "Guardar ajuste"}</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: La columna y el enlace en la lista de clientes**

En `apps/admin/app/(panel)/clientes/page.tsx`:

1. Imports y estado:

```tsx
import { useModulos } from "../../components/admin-shell";
import { ClienteLealtad } from "../../components/cliente-lealtad";
```

```tsx
  // Lealtad (0159): la columna y el ajuste solo existen si el negocio tiene el programa concedido.
  const modulos = useModulos();
  const conLealtad = modulos !== null && modulos !== "error" && modulos.permitidos.lealtad === true;
  const [lealtadDe, setLealtadDe] = useState<{ id: string; nombre: string; saldo: number; venceEl: string | null } | null>(null);
```

2. En el encabezado de la tabla, entre `Gasto total` y `Última visita`:

```tsx
                  {conLealtad && <th className="px-4 py-2.5 text-right font-semibold">Lealtad</th>}
```

3. En cada fila, en la misma posición (entre la celda del gasto total y la de la última visita):

```tsx
                    {conLealtad && <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{c.lealtadSaldo}</td>}
```

4. En la celda de acciones, antes del botón `Editar`, con las mismas clases que ese botón:

```tsx
                      {conLealtad && (
                        <button type="button" onClick={() => setLealtadDe({ id: c.id, nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" "), saldo: c.lealtadSaldo, venceEl: c.lealtadVenceEl })}
                          className="text-13 font-semibold text-ink-2 hover:text-ink">Lealtad</button>
                      )}
```

5. El renglón «Sin resultados» usa `colSpan={6}`: pasa a `colSpan={conLealtad ? 7 : 6}`.
6. Al final del JSX de la página, junto a los demás diálogos:

```tsx
      {lealtadDe && (
        <ClienteLealtad
          cliente={lealtadDe}
          onCerrar={() => setLealtadDe(null)}
          onCambio={() => { void recargar(); }}
        />
      )}
```

`recargar` es la función de esta página que vuelve a pedir la página actual de clientes: usa el nombre que tenga (búscala por el `listarClientesPagina(` que hay en el archivo) y **conserva su guarda de carrera** (`ultimaConsulta`): no añadas una segunda consulta por fuera de ella. Si el nombre de los campos de la fila no es `c.apellido_paterno`, usa los que esa tabla ya pinta en la columna «Cliente».

- [ ] **Step 4: Verificar y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -4 && pnpm --filter @vim/admin typecheck && pnpm tipografia
cd C:/vwtN && git add apps/admin/app/lib/clientes.ts apps/admin/app/components/cliente-lealtad.tsx "apps/admin/app/(panel)/clientes/page.tsx" && git commit -m "feat(lealtad): la lista de clientes muestra el saldo, su historial y el ajuste a mano

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: en verde y limpio. Añade al commit cualquier archivo de prueba que hayas tenido que tocar en el paso 1.

---

## Task 10: «Lealtad» junto a los descuentos en el panel del día y el consolidado

Hoy el panel y el consolidado suman solo `descuentos_manuales_mxn`. Una cuenta con canje baja la venta neta sin que ningún renglón diga por qué.

**Files:**
- Modify: `apps/admin/app/lib/reportes.ts` (`sumarDia` ≈146-160 y el `select` ≈222)
- Modify: `apps/admin/app/lib/consolidado.ts` (≈31, 45, 81)
- Modify: `apps/admin/app/(panel)/dashboard/page.tsx` (`FranjaCaja` ≈171-233 y su uso ≈460)
- Modify: `apps/admin/app/(panel)/reportes/consolidado/page.tsx` (≈30)
- Test: `apps/admin/app/lib/__tests__/consolidado.test.ts`

- [ ] **Step 1: La prueba que falla**

En `apps/admin/app/lib/__tests__/consolidado.test.ts`, en el caso que suma `descuentos` por sucursal, añade `lealtad_mxn` a las filas del fixture (por ejemplo `lealtad_mxn: 30` en una y `lealtad_mxn: 20` en otra de la MISMA sucursal) y afirma que el resultado de esa sucursal trae `lealtad: 50`. Usa el mismo estilo de aserción que el caso ya usa para `descuentos`.

Run: `cd C:/vwtN && pnpm --filter @vim/admin exec vitest run app/lib/__tests__/consolidado.test.ts`
Expected: FAIL — el resultado no trae `lealtad` (y el typecheck del test se quejará del campo hasta el paso 2).

- [ ] **Step 2: Las dos libs**

`apps/admin/app/lib/consolidado.ts`:
- en el tipo de las filas de entrada (≈línea 31) añade `lealtad_mxn?: number;` (opcional: una nube sin la 0159 no la manda);
- en el tipo del resultado por sucursal añade `lealtad: number;` junto a `descuentos`, inicializado en `0` donde se crea el acumulador;
- junto a `cur.descuentos += num(f.descuentos_manuales_mxn);` añade:

```ts
    cur.lealtad += num(f.lealtad_mxn);
```

- en el `.select(...)` (≈línea 81) añade `, lealtad_mxn` al final del texto.

`apps/admin/app/lib/reportes.ts`:
- en `sumarDia`, junto a `descuentos: …`:

```ts
    lealtad: filas.reduce((a, f) => a + num(f.lealtad_mxn), 0),
```

  y añade `lealtad: number;` al tipo que esa función devuelve, y `lealtad_mxn?: number | string | null` al tipo de sus filas si lo declara;
- en el `select` de `vw_estado_resultados_dia` (≈línea 222) añade `, lealtad_mxn` al final del texto.

- [ ] **Step 3: Las dos pantallas**

`apps/admin/app/(panel)/dashboard/page.tsx`: `FranjaCaja` recibe una prop más, `lealtad: number`, y pinta su renglón justo después del de Descuentos, solo si hay algo:

```tsx
          {lealtad > 0 && (
            <>
              <dt className="text-ink-2">Lealtad</dt>
              <dd className="text-right tabular-nums">{fmt(lealtad)}</dd>
            </>
          )}
```

(copia las clases exactas del `dt`/`dd` de Descuentos de ese mismo componente, que pueden diferir de las de arriba) y donde se usa (≈línea 460) pásale `lealtad={hoy.lealtad}`.

`apps/admin/app/(panel)/reportes/consolidado/page.tsx`: en la lista de columnas, después de la de `descuentos`:

```tsx
  { id: "lealtad", titulo: "Lealtad", tipo: "mxn", valor: (f) => f.lealtad, total: "suma", enfasis: "suave" },
```

- [ ] **Step 4: Verificar y commit**

```bash
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -4 && pnpm --filter @vim/admin typecheck && pnpm tipografia
cd C:/vwtN && git add apps/admin/app/lib/reportes.ts apps/admin/app/lib/consolidado.ts apps/admin/app/lib/__tests__ "apps/admin/app/(panel)/dashboard/page.tsx" "apps/admin/app/(panel)/reportes/consolidado/page.tsx" && git commit -m "feat(lealtad): el panel del día y el consolidado dicen cuánto se descontó por lealtad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: en verde. Otros fixtures que construyan el resultado de `sumarDia` o de consolidado (`dashboard-top-paginado.test.ts`, `estadisticas-sucursal.test.ts`) pueden pedir `lealtad: 0`: añádelo y lista los archivos en el reporte.

---

## Task 11: Dos pendientes de la caja — el cliente con un canje a medias y la prueba de punta a punta

Dos cabos sueltos del plan 1B (los nombra el ADR 0030 en «Límites conocidos» y la revisión final):

1. Con un canje **a medias** (la nube ya descontó, la cuenta todavía no lo tiene), quitar o cambiar al cliente de la cuenta deja ese canje huérfano: al retomarlo falla con `CLIENTE_NO_COINCIDE` y los puntos del cliente original quedan descontados hasta la reversa de 48 h.
2. El manejador del gateway y `lealtad-puente.mjs` nunca se han ejecutado juntos contra un Postgres real.

**Files:**
- Modify: `apps/pos/app/lib/lealtad-canje.ts` (función nueva al final)
- Modify: `apps/pos/app/lib/__tests__/lealtad-canje.test.ts`
- Modify: `apps/pos/app/components/home-pos.tsx` (`onAsignarClienteCuenta`, ≈1019)
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx` (`onAsignar` del `ModalClienteCuenta`, ≈649)
- Create: `desktop/src/verify-lealtad-canje.mjs`
- Modify: `desktop/package.json` (script `verify:lealtad-canje`)

**Interfaces:**
- Consumes: `leerPendiente(a: Almacen, ticketId: string): Pendiente | null`, `almacenLocal()` (plan 1B); `startBackend` de `desktop/src/backend.mjs` (acepta `nube: async () => ({ cloudUrl, anonKey, deviceToken })`).
- Produces: `motivoNoCambiarCliente(a: Almacen, ticketId: string | null, actualId: string | null, nuevoId: string | null): string | null`.

- [ ] **Step 1: La prueba que falla**

En `apps/pos/app/lib/__tests__/lealtad-canje.test.ts` añade `motivoNoCambiarCliente` al import de `../lealtad-canje` y, al final del archivo, este bloque. Usa las mismas fixtures que el archivo ya tiene (`alm` es el almacén en memoria que se recrea en el `beforeEach`; `dinero` es el `Pendiente` de `ticketId: "tk-1"`; si en el archivo se llaman distinto, usa esos nombres):

```ts
describe("cambiar al cliente con un canje a medias", () => {
  it("sin canje a medias, se puede poner, cambiar o quitar al cliente", () => {
    expect(motivoNoCambiarCliente(alm, "tk-1", "cli-1", null)).toBeNull();
    expect(motivoNoCambiarCliente(alm, "tk-1", "cli-1", "cli-2")).toBeNull();
    expect(motivoNoCambiarCliente(alm, null, null, "cli-2")).toBeNull();
  });

  it("con un canje a medias no deja quitarlo ni cambiarlo, y dice qué hacer", () => {
    guardarPendiente(alm, dinero);
    expect(motivoNoCambiarCliente(alm, "tk-1", "cli-1", null)).toMatch(/canje/i);
    expect(motivoNoCambiarCliente(alm, "tk-1", "cli-1", "cli-2")).toMatch(/Canjear puntos/);
  });

  it("volver a elegir al mismo cliente no estorba (se usa para corregir su nombre)", () => {
    guardarPendiente(alm, dinero);
    expect(motivoNoCambiarCliente(alm, "tk-1", "cli-1", "cli-1")).toBeNull();
  });

  it("un canje a medias de OTRA cuenta no bloquea esta", () => {
    guardarPendiente(alm, dinero);
    expect(motivoNoCambiarCliente(alm, "tk-2", "cli-1", null)).toBeNull();
  });
});
```

Run: `cd C:/vwtN && pnpm --filter @vim/pos exec vitest run app/lib/__tests__/lealtad-canje.test.ts`
Expected: FAIL — `motivoNoCambiarCliente is not a function` (o error de import).

- [ ] **Step 2: La función**

Al final de `apps/pos/app/lib/lealtad-canje.ts`:

```ts
/**
 * Con un canje a medias (la nube ya descontó; la cuenta aún no lo tiene) no se quita ni se cambia
 * al cliente: el canje es de ESE cliente y al retomarlo en una cuenta de otro fallaría, dejando sus
 * puntos descontados hasta la reversa automática. Devuelve el texto para el cajero, o null si se puede.
 */
export function motivoNoCambiarCliente(a: Almacen, ticketId: string | null, actualId: string | null, nuevoId: string | null): string | null {
  if (!ticketId || actualId === nuevoId) return null;
  if (!leerPendiente(a, ticketId)) return null;
  return "Esta cuenta tiene un canje de puntos a medias. Termínalo o descártalo en «Canjear puntos» antes de cambiar al cliente.";
}
```

Run otra vez: PASS.

- [ ] **Step 3: Los dos caminos que asignan cliente**

`apps/pos/app/components/home-pos.tsx` — `onAsignarClienteCuenta` pasa a (añade `motivoNoCambiarCliente` al import de `../lib/lealtad-canje`, que ya trae `almacenLocal`):

```tsx
  const onAsignarClienteCuenta = useCallback(async (c: ClienteCuenta | null) => {
    // Lealtad: con un canje a medias el cliente no se mueve (el modal muestra el porqué y no se cierra).
    const motivo = motivoNoCambiarCliente(almacenLocal(), ticketBd?.ticketId ?? null, carrito.clienteCuenta?.clienteId ?? null, c?.clienteId ?? null);
    if (motivo) throw new Error(motivo);
    if (ticketBd) await asignarClienteTicket(token, ticketBd.ticketId, c?.clienteId ?? null);
    dispatch({ tipo: "cliente_cuenta", cliente: c });
    setClienteCuentaAbierto(false);
  }, [ticketBd, token, carrito.clienteCuenta?.clienteId]);
```

Si el carrito guarda al cliente de la cuenta en otro campo que `carrito.clienteCuenta` (míralo en el `actual={…}` que este componente le pasa a `ModalClienteCuenta`, ≈línea 2300), usa ese.

`apps/pos/app/components/pantalla-cuentas-modo.tsx` — el `onAsignar` del `ModalClienteCuenta` (añade el import de `almacenLocal` y `motivoNoCambiarCliente` desde `../lib/lealtad-canje`):

```tsx
          onAsignar={async (cli) => {
            const motivo = motivoNoCambiarCliente(almacenLocal(), clienteDe.ticketId, clienteDe.clienteId ?? null, cli?.clienteId ?? null);
            if (motivo) throw new Error(motivo);
            await asignarClienteTicket(token, clienteDe.ticketId, cli?.clienteId ?? null);
            setClienteDe(null);
            void recargar();
          }}
```

`ModalClienteCuenta` ya muestra el mensaje de un `onAsignar` que lanza y no se cierra (lo dice el comentario sobre `onAsignarClienteCuenta`). Compruébalo leyendo su `catch`; si pintara un texto fijo en lugar de `e.message`, cambia ese `catch` para mostrar `e instanceof Error ? e.message : <el texto fijo>`.

```bash
cd C:/vwtN && pnpm --filter @vim/pos test 2>&1 | tail -4 && pnpm --filter @vim/pos typecheck
cd C:/vwtN && git add apps/pos/app && git commit -m "fix(lealtad): con un canje a medias no se quita ni se cambia al cliente de la cuenta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: 616+ pruebas del POS en verde, typecheck limpio.

- [ ] **Step 4: La prueba de punta a punta del canje en la caja**

`desktop/src/verify-lealtad-canje.mjs` — Postgres embebido temporal, gateway real, sesión real de cajero y una **nube de mentira** (un servidor HTTP local que contesta como la Edge Function `lealtad-canje`). Puertos propios: no toca la caja instalada (54329/54350) ni los smokes.

```js
// El canje de lealtad por el camino REAL de la caja (ADR 0030): navegador → gateway → lealtad-puente
// → nube → asiento en el Postgres local. Las pruebas unitarias del puente usan un pool falso; aquí
// corren el gateway de verdad, la sesión de un cajero, las migraciones 0156–0159 y la función
// lealtad_asentar_canje. La nube es un servidor local que contesta como la Edge Function.
// Datos temporales y puertos propios (54396/54395/54372/54373): no toca la caja instalada.
// Uso: node src/verify-lealtad-canje.mjs
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startBackend } from "./backend.mjs";

const GW_PORT = 54372;
const NUBE_PORT = 54373;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";
const TELEFONO = "4775550199";

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };
const dir = mkdtempSync(path.join(tmpdir(), "vim-verify-lc-"));
let backend, nube;

// ── La nube de mentira ───────────────────────────────────────────────────────
// Guarda los canjes que autoriza y, al asentar, contesta SUS datos (los que la caja debe usar).
const estado = { caida: false, llamadas: [], canjes: new Map(), clienteId: null };
function levantarNube() {
  return new Promise((ok) => {
    const s = http.createServer(async (req, res) => {
      const trozos = [];
      for await (const t of req) trozos.push(t);
      const cuerpo = JSON.parse(Buffer.concat(trozos).toString() || "{}");
      estado.llamadas.push({ url: req.url, auth: req.headers.authorization, cuerpo });
      const send = (st, b) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (estado.caida) return req.socket.destroy(); // corte de red a media petición
      if (req.url !== "/functions/v1/lealtad-canje") return send(404, { error: "NO_EXISTE" });
      if (cuerpo.accion === "saldo") return send(200, { ok: true, saldo: 100, cliente_id: estado.clienteId });
      if (cuerpo.accion === "canjear") {
        estado.canjes.set(cuerpo.canje_id, { ...cuerpo });
        return send(200, { ok: true, canje_id: cuerpo.canje_id, saldo: 100 - cuerpo.puntos });
      }
      if (cuerpo.accion === "asentar") {
        const c = estado.canjes.get(cuerpo.canje_id);
        if (!c) return send(404, { ok: false, error: "CANJE_NO_EXISTE" });
        return send(200, {
          ok: true, canje_id: c.canje_id, ticket_id: c.ticket_id, cliente_id: estado.clienteId, telefono: TELEFONO,
          puntos: c.puntos, monto_mxn: c.puntos, premio_id: null, programa_version: 1,
        });
      }
      return send(400, { error: "ACCION_INVALIDA" });
    });
    s.listen(NUBE_PORT, "127.0.0.1", () => ok(s));
  });
}

try {
  nube = await levantarNube();
  backend = await startBackend({
    dataRoot: dir, pgPort: 54396, restPort: 54395, gatewayPort: GW_PORT, host: "127.0.0.1", log: () => {},
    nube: async () => ({ cloudUrl: `http://127.0.0.1:${NUBE_PORT}`, anonKey: "anon-de-prueba", deviceToken: "token-del-dispositivo" }),
  });
  console.log("· backend temporal y nube de mentira arriba");
  const q = async (sql, p) => (await backend.pool.query(sql, p)).rows;

  // Sesiones: la de la caja (dispositivo) y la de un cajero (PIN), como hace el POS.
  const dev = await j(await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASS }),
  }));
  exigir(dev.body.access_token, `device sign-in falló: ${JSON.stringify(dev.body)}`);
  const tenant = dev.body.user.app_metadata.tenant_id;
  const accesos = await j(await fetch(`${GW}/rest/v1/usuarios_acceso?select=usuario_id,rol:roles(codigo)&activo=eq.true`, {
    headers: { Authorization: `Bearer ${dev.body.access_token}`, apikey: "anon" },
  }));
  const cajero = accesos.body.find((a) => a.rol?.codigo === "CAJERO");
  exigir(cajero, "no hay CAJERO en el seed");
  const emp = await j(await fetch(`${GW}/functions/v1/pin-login`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${dev.body.access_token}` },
    body: JSON.stringify({ usuario_id: cajero.usuario_id, pin: "1234", caja_id: CAJA }),
  }));
  exigir(emp.body.access_token, `pin-login falló: ${emp.status} ${JSON.stringify(emp.body)}`);
  const hdr = { "content-type": "application/json", Authorization: `Bearer ${emp.body.access_token}`, apikey: "anon" };
  const rpc = async (fn, args) => {
    const r = await j(await fetch(`${GW}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr, body: JSON.stringify(args) }));
    exigir(r.status < 300, `${fn} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const lealtad = async (cuerpo, cabeceras = hdr) =>
    j(await fetch(`${GW}/functions/v1/lealtad-canje`, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) }));

  // Programa de puntos = dinero, una clienta con 100 puntos en la caja, turno abierto.
  await q("INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES ($1, 'PUNTOS_DINERO', 10)", [tenant]);
  const cliente = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Clienta Verify', $2) RETURNING id", [tenant, TELEFONO]))[0].id;
  estado.clienteId = cliente;
  await q("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 100, 1)", [tenant, cliente]);
  const suc = (await q("SELECT sucursal_id FROM cajas WHERE id = $1", [CAJA]))[0].sucursal_id;
  await q("UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=$1 AND estado='ABIERTO'", [CAJA]);
  const turno = (await q(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'VERIFY-LC',CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [tenant, suc, CAJA, cajero.usuario_id]))[0].id;

  // Una cuenta de esa clienta con un producto que cueste más que el canje.
  const prod = (await q("SELECT id FROM productos WHERE tenant_id = $1 AND precio_base_mxn >= 50 AND deleted_at IS NULL ORDER BY precio_base_mxn LIMIT 1", [tenant]))[0];
  exigir(prod, "el seed no trae un producto de $50 o más");
  const abrir = async (clave) => {
    const id = await rpc("abrir_ticket", { p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "PARA_LLEVAR", p_cliente_id: cliente, p_marca_virtual_id: null, p_client_id_local: clave, p_usuario_id: cajero.usuario_id });
    await rpc("agregar_item_a_ticket", { p_ticket_id: id, p_producto_id: prod.id, p_cantidad: 1, p_nota_cocina: null, p_modificadores: [], p_client_id_local: `${clave}-item` });
    return id;
  };
  const ticket = await abrir("verify-lc-1");
  const totalAntes = Number((await q("SELECT total_mxn FROM tickets WHERE id = $1", [ticket]))[0].total_mxn);
  console.log(`· cuenta abierta por $${totalAntes} a nombre de la clienta`);

  // 1) La cuenta de la CAJA (antes del PIN) no canjea: solo un empleado.
  const sinEmpleado = await lealtad({ accion: "saldo", telefono: TELEFONO }, { ...hdr, Authorization: `Bearer ${dev.body.access_token}` });
  exigir(sinEmpleado.status === 403 && sinEmpleado.body.error === "SOLO_EMPLEADO", `la sesión de la caja debía dar 403 SOLO_EMPLEADO y dio ${sinEmpleado.status} ${JSON.stringify(sinEmpleado.body)}`);
  exigir(estado.llamadas.length === 0, "la sesión de la caja no debía llegar a la nube");

  // 2) Canjear: se reenvía con el token del DISPOSITIVO y el empleado de la sesión local.
  const canje = randomUUID();
  const c1 = await lealtad({ accion: "canjear", canje_id: canje, cliente_id: cliente, telefono: TELEFONO, puntos: 40, ticket_id: ticket, usuario_id: "suplantado", tenant_id: "otro" });
  exigir(c1.status === 200 && c1.body.ok === true, `canjear → ${c1.status} ${JSON.stringify(c1.body)}`);
  const visto = estado.llamadas.at(-1);
  exigir(visto.auth === "Bearer token-del-dispositivo", "a la nube debe ir el token del dispositivo, no el del empleado");
  exigir(visto.cuerpo.usuario_id === cajero.usuario_id, "el empleado sale de la sesión local, no del navegador");
  exigir(!("tenant_id" in visto.cuerpo), "el negocio no viaja desde el navegador");
  exigir((await q("SELECT count(*)::int AS n FROM ticket_canjes_lealtad WHERE ticket_id = $1", [ticket]))[0].n === 0, "canjear NO toca la base local");
  console.log("· canjear: reenviado con la identidad correcta, sin tocar la caja");

  // 3) Asentar: la caja escribe el canje en SU cuenta con los datos que confirmó la nube.
  const a1 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: ticket });
  exigir(a1.status === 200 && a1.body.ok === true, `asentar → ${a1.status} ${JSON.stringify(a1.body)}`);
  const fila = (await q("SELECT cliente_id, puntos, monto_descontado_mxn, created_by, revertido FROM ticket_canjes_lealtad WHERE id = $1", [canje]))[0];
  exigir(fila && fila.cliente_id === cliente && fila.puntos === 40 && Number(fila.monto_descontado_mxn) === 40 && fila.created_by === cajero.usuario_id && fila.revertido === false,
    `el canje asentado no es el esperado: ${JSON.stringify(fila)}`);
  const t = (await q("SELECT total_mxn, lealtad_mxn FROM tickets WHERE id = $1", [ticket]))[0];
  exigir(Number(t.lealtad_mxn) === 40, `la cuenta debía llevar $40 de lealtad y lleva ${t.lealtad_mxn}`);
  exigir(Math.abs(Number(t.total_mxn) - (totalAntes - 40)) < 0.011, `el total debía bajar $40: antes ${totalAntes}, ahora ${t.total_mxn}`);
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 60, "el saldo local debía quedar en 60");
  const pendientes = await q("SELECT count(*)::int AS n FROM lealtad_movimientos m WHERE m.id = $1", [canje]);
  exigir(pendientes[0].n === 1, "el movimiento del canje debe existir en la caja");
  console.log("· asentar: canje en la cuenta, total y saldo correctos");

  // 4) Reintentar el asiento (se cortó la respuesta) no duplica nada.
  const a2 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: ticket });
  exigir(a2.status === 200, `el reintento debía ser 200 y fue ${a2.status}`);
  exigir((await q("SELECT count(*)::int AS n FROM ticket_canjes_lealtad WHERE ticket_id = $1", [ticket]))[0].n === 1, "el reintento duplicó el canje");
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 60, "el reintento volvió a descontar");

  // 5) El mismo canje no se puede asentar en OTRA cuenta (la nube lo ató a la primera).
  const otra = await abrir("verify-lc-2");
  const a3 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: otra });
  exigir(a3.status === 502 && a3.body.error === "RESPUESTA_INVALIDA", `asentar en otra cuenta debía rechazarse (502) y dio ${a3.status} ${JSON.stringify(a3.body)}`);
  exigir(Number((await q("SELECT lealtad_mxn FROM tickets WHERE id = $1", [otra]))[0].lealtad_mxn) === 0, "la otra cuenta no debía recibir descuento");

  // 6) Una cuenta que ya tiene un canje vivo rechaza un segundo, con el código que el POS traduce.
  const canje2 = randomUUID();
  await lealtad({ accion: "canjear", canje_id: canje2, cliente_id: cliente, telefono: TELEFONO, puntos: 10, ticket_id: ticket });
  const a4 = await lealtad({ accion: "asentar", canje_id: canje2, ticket_id: ticket });
  exigir(a4.status === 409 && a4.body.error === "TICKET_YA_TIENE_CANJE", `un segundo canje debía dar 409 TICKET_YA_TIENE_CANJE y dio ${a4.status} ${JSON.stringify(a4.body)}`);
  console.log("· reintento idempotente; otra cuenta y segundo canje rechazados");

  // 7) Sin red, canjear dice SIN_RED y la caja no cambia.
  estado.caida = true;
  const c5 = await lealtad({ accion: "canjear", canje_id: randomUUID(), cliente_id: cliente, telefono: TELEFONO, puntos: 5, ticket_id: otra });
  exigir(c5.status === 503 && c5.body.error === "SIN_RED", `sin red debía dar 503 SIN_RED y dio ${c5.status} ${JSON.stringify(c5.body)}`);
  estado.caida = false;

  // 8) Quitar el canje devuelve el saldo y el total, sin pasar por la nube.
  const antesDeQuitar = estado.llamadas.length;
  await rpc("quitar_canje_lealtad", { p_ticket_id: ticket });
  const t2 = (await q("SELECT total_mxn, lealtad_mxn FROM tickets WHERE id = $1", [ticket]))[0];
  exigir(Number(t2.lealtad_mxn) === 0 && Math.abs(Number(t2.total_mxn) - totalAntes) < 0.011, `al quitar el canje la cuenta debía volver a ${totalAntes}: ${JSON.stringify(t2)}`);
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 100, "al quitar el canje el saldo debía volver a 100");
  exigir(estado.llamadas.length === antesDeQuitar, "quitar el canje no llama a la nube");
  console.log("· sin red se dice; quitar el canje devuelve saldo y total en local");

  console.log("\n✅ Canje de lealtad OK de punta a punta en la caja (gateway + puente + asiento local).");
} catch (e) {
  console.error("\n❌ FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
  if (nube) await new Promise((ok) => nube.close(ok));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows suelta el pgdata tarde */ }
}
```

En `desktop/package.json`, después de `"verify:lealtad-pull"`:

```json
    "verify:lealtad-canje": "node src/verify-lealtad-canje.mjs",
```

- [ ] **Step 5: Correrla**

Run: `cd C:/vwtN/desktop && npm run verify:lealtad-canje`
Expected: termina con `✅ Canje de lealtad OK de punta a punta…` y código 0.

Este script es de los que SÍ se pueden correr (puertos y datos propios). Si un paso falla, **primero decide quién tiene razón**:
- Si el fallo es del guion (un nombre de columna del seed —`precio_base_mxn`, `codigo_turno`—, el modo `PARA_LLEVAR`, la firma de `abrir_ticket`), corrige el guion mirando `verify-ticket-impreso.mjs` y `verify-lealtad-pull.mjs`, que usan esas mismas piezas.
- Si el fallo es del producto (el gateway no pasa `tipoIdentidad`, el asiento no baja el total, el reintento duplica), es un hallazgo real: arréglalo en `gateway.mjs` / `lealtad-puente.mjs` con su prueba unitaria en `lealtad-puente.test.mjs`, y dilo en el reporte. No ajustes la aserción para que pase.
- El paso 5 espera 502 porque el puente compara la cuenta que contesta la nube con la pedida. El paso 8 depende de que `quitar_canje_lealtad` esté concedida a `authenticated`; si responde 403/404, es un hallazgo real del 1B.

```bash
cd C:/vwtN/desktop && npm test 2>&1 | tail -4
cd C:/vwtN && git add desktop/src/verify-lealtad-canje.mjs desktop/package.json desktop/src && git commit -m "test(lealtad): el canje de la caja corre de punta a punta contra Postgres y el gateway reales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: Versión, novedades, sitio, documentos y la lista de salida

Nada de esta tarea publica nada. Deja escrito lo que una persona necesita para publicar y deja la rama lista.

**Files:**
- Modify: `desktop/package.json` (`"version": "0.4.110"` → `"0.5.0"`)
- Modify: `sitio-web/novedades.html`, `sitio-web/funciones.html`, `sitio-web/precios.html`
- Modify: `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md`
- Modify: `docs/operacion/alta-de-cliente.md`
- Create: `docs/operacion/salida-lealtad-0.5.0.md`

- [ ] **Step 1: La versión**

`docs/operacion/actualizaciones.md`: una función nueva sube el número de en medio. En `desktop/package.json`: `"version": "0.5.0"`. Busca otros sitios que repitan la versión: `cd C:/vwtN && grep -rn "0\.4\.110" --include=*.json --include=*.mjs --include=*.ts . | grep -v node_modules | grep -v sitio-web` y actualiza solo los que sean «la versión actual de la caja» (no los históricos ni las pruebas que la usan como dato).

- [ ] **Step 2: Novedades**

En `sitio-web/novedades.html`, **antes** del primer `<article class="novedad">`, con la fecha del martes en que se publique (deja el 13 de octubre; la lista de salida recuerda corregirla si cambia):

```html
      <article class="novedad">
        <p class="novedad-meta">
          <time datetime="2026-10-13">13 de octubre</time>
          <span>Caja · 0.5.0</span>
        </p>
        <div class="novedad-cuerpo pila pila-5">
          <h3>Programa de lealtad</h3>
          <div class="pila pila-3">
            <h4 class="eyebrow" data-tipo="nuevo">Nuevo</h4>
            <ul class="lista-legal">
              <li><strong>Programa de lealtad.</strong> Tus clientes ganan algo cada vez que compran y lo usan en su siguiente visita. Lo encuentras en el panel, en <strong>Lealtad</strong>.</li>
              <li>Tú eliges cómo ganan: puntos que valen dinero, sellos por visita o puntos que se cambian por premios de tu carta.</li>
              <li>En la caja, al asignar un cliente a la cuenta se ve cuánto tiene y cuánto va a ganar; el botón <strong>Canjear puntos</strong> aplica el descuento o agrega el premio.</li>
              <li>El ticket le dice al cliente cuánto ganó y cuánto lleva, y el corte separa lo que se descontó por lealtad.</li>
              <li>En <strong>Lealtad → Movimientos</strong> ves cuánto has repartido, cuánto se ha canjeado y quién hizo cada canje.</li>
            </ul>
          </div>
          <div class="pila pila-3">
            <h4 class="eyebrow" data-tipo="correcciones">A tener en cuenta</h4>
            <ul class="lista-legal">
              <li>Canjear necesita internet; ganar puntos, no.</li>
              <li>Una cuenta que lleva un premio de regalo no se factura por separado: entra en tu factura global.</li>
              <li>En el plan Esencial es un extra; en Negocio y en Cadena ya va incluido.</li>
            </ul>
          </div>
        </div>
      </article>
```

Si `data-tipo` solo admite los valores que ya usa el archivo (`nuevo`, `correcciones`, y los que encuentres con `grep -o 'data-tipo="[a-z]*"' sitio-web/novedades.html | sort -u`), usa para el segundo bloque el que corresponda a una nota neutra; si no hay ninguno, fúndelo en la lista de «Nuevo».

- [ ] **Step 3: Funciones y precios**

`sitio-web/funciones.html`: añade un bloque de Lealtad con la misma estructura que el bloque vecino más parecido (el de Clientes o el de Promociones; copia su marcado tal cual y cambia el texto). Texto:

> **Programa de lealtad.** Puntos que valen dinero, sellos por visita o puntos por premios: tú eliges. El cliente gana al pagar y canjea en su siguiente visita, en cualquiera de tus sucursales. Todo canje queda registrado con quién lo hizo.

`feedback_sitio_imagenes` pide una figura real por página, no una por bloque: no añadas una imagen de relleno. Si el bloque vecino lleva `.figura`, deja el de Lealtad sin figura y apúntalo en el reporte como pendiente de captura (las capturas se hacen con la semilla Crazy Burgers, fuera de este plan).

`sitio-web/precios.html`:
1. En la tabla comparativa, después de la fila «Pedidos de Uber Eats en la caja», una fila nueva con el mismo marcado que la de «Facturación electrónica»:

```html
            <tr role="row">
              <th role="rowheader" scope="row">Programa de lealtad</th>
              <td role="cell" data-plan="Esencial">$100 al mes aparte</td>
              <td role="cell" data-plan="Negocio" class="col-vim"><span class="marca marca-si">Incluido</span></td>
              <td role="cell" data-plan="Cadena"><span class="marca marca-si">Incluido</span></td>
            </tr>
```

2. En «Extras, con su precio», una quinta tarjeta después de la de Uber Eats:

```html
        <!-- El add-on LEALTAD del catálogo (mig. 0156/0159): $100 en Esencial, incluido desde Negocio. -->
        <div class="tarjeta pila pila-3">
          <h3>Programa de lealtad</h3>
          <div class="plan-precio">$100</div>
          <p>
            Al mes, más IVA, y <strong>solo si estás en Esencial</strong>: en Negocio y en Cadena
            ya va incluido. Tus clientes ganan puntos o sellos al comprar y los canjean en su
            siguiente visita.
          </p>
        </div>
```

   Con cinco tarjetas en rejilla de dos, la última queda sola. Cambia el comentario `<!-- Cuatro extras en rejilla de dos… -->` por uno que diga que ahora son cinco y por qué se queda así, y mira cómo se ve (paso 5). Si queda mal, la salida correcta es la clase de rejilla de tres que el propio CSS del sitio ya tenga (`grep -n "\.tres" sitio-web/*.css sitio-web/**/*.css`), que con cinco deja 3+2; no inventes una clase nueva. Decide con la captura y dilo en el reporte.
3. Si alguna otra parte de la página lista lo que incluye cada plan (tarjetas de plan arriba), añade «Programa de lealtad» a Negocio y a Cadena con el mismo formato que «Pedidos de Uber Eats».

- [ ] **Step 4: Regenerar lo que el sitio deriva y probar**

```bash
cd C:/vwtN && pnpm sitio:generar && pnpm test:sitio 2>&1 | tail -6 && pnpm tipografia
```

Expected: pruebas del sitio en verde. `sitio:generar` reescribe los `.md` de `_agentes`, `llms.txt` y puede tocar `vercel.json`: todo eso entra al commit.

- [ ] **Step 5: Ver el sitio**

Abre `sitio-web/precios.html` y `sitio-web/novedades.html` en el navegador (son HTML estático: sirve la carpeta con `npx serve sitio-web -l 4173` en segundo plano o ábrelos por `file://`), a 1280 px y a 375 px. Comprueba: la fila nueva de la tabla se lee en móvil (cada celda con su `data-plan`), las tarjetas de extras no dejan un hueco feo, la novedad nueva es la primera. Guarda las capturas en el workspace del plan y cítalas en el reporte.

- [ ] **Step 6: El ADR**

En `docs/decisiones/0030-la-lealtad-viaja-por-movimientos.md`:
- en la lista de pendientes («El admin no debe ofrecer combos como premio», «`_sincronizar_addons_del_plan` y su espejo en TS», «Los reportes del admin que leen los descuentos del ticket»), marca los tres como hechos en la 0159 / plan 1C, con una línea cada uno que diga dónde;
- en «Límites conocidos», sustituye el primer punto por: el manejador del gateway y el puente ya corren de punta a punta en `npm run verify:lealtad-canje` (con una nube de mentira); **la Edge Function `lealtad-canje` desplegada, el horario de `pg_cron` y pgTAP siguen sin ejecutarse fuera del CI** y se ejercitan en la prueba de VIM Pruebas de la lista de salida;
- añade una sección «Admin (plan 1C)» de 8–12 líneas: la sección `/lealtad` y sus tres pestañas; que se guía por `permitidos` y el interruptor vive ahí; que la regla de puntos es un solo archivo (`@vim/db/lealtad`) que usan caja y admin; las lecturas (`vw_lealtad_movimientos`, `lealtad_resumen`, `lealtad_control`) y que son `security_invoker`; la decisión del 6 de octubre sobre facturas (premio en $0, sin factura individual, sí en la global; `timbrar-cfdi` falla cerrado); y que el canje revertido después del pago sigue contando como premio para efectos de factura;
- deja la línea de tipos generados (`pnpm db:types`) como pendiente: sigue sin poder correrse en local.

- [ ] **Step 7: Alta de cliente**

En `docs/operacion/alta-de-cliente.md`, donde se describen los add-ons (junto a Delivery), añade:

```markdown
### Lealtad

- En Negocio y Cadena viene concedida con el plan. En Esencial se concede desde el panel
  (ficha del cliente → Extras → Programa de lealtad, $100 al mes).
- Concederla no la enciende: el dueño entra a **Lealtad** en su panel, guarda su programa y lo
  enciende ahí mismo. Sin programa guardado el interruptor no se deja encender.
- Las cajas necesitan la 0.5.0 o posterior. Una caja más vieja sigue vendiendo, pero no muestra la
  lealtad ni otorga puntos.
- Para que una venta sume, la cuenta debe llevar un cliente con teléfono.
- Si el cliente pregunta por facturas: una cuenta con un premio de regalo no se factura por
  separado; entra en la factura global. El canje de puntos por dinero se factura normal.
- Dar de baja el extra apaga el programa en sus cajas; los saldos se conservan.
```

- [ ] **Step 8: La lista de salida (para una persona)**

`docs/operacion/salida-lealtad-0.5.0.md`:

```markdown
# Salida de la lealtad — caja 0.5.0

Lista para quien publique. Nada de esto lo hace un agente: toca producción.
El orden importa: **base y funciones primero, mezclar después, instalador al final.**

## 0. Antes de empezar

- [ ] Fermín revisó y dio el OK a la lista de lo que incluye la versión (abajo, «Nota de versión»).
- [ ] El contador confirmó el criterio de facturas: cuenta con premio de regalo → sin factura
      individual, sí en la global; canje de puntos por dinero → factura normal.
- [ ] Es un día y hora sin servicio en los negocios en producción (las migraciones redefinen
      `recalcular_totales_ticket` y `reporte_x`).
- [ ] CI de los tres PR en verde. El de pruebas (pgTAP) solo corre contra `main`: cambia la base
      del PR #110 a `main` (o ábrelo ya contra `main`) y espera a que pase antes de seguir.

## 1. Base de datos (producción)

- [ ] Respaldo de la base desde el panel de Supabase.
- [ ] Aplicar, en orden y de una en una: `0156_lealtad.sql`, `0157_lealtad_corte.sql`,
      `0158_lealtad_premio_sin_factura.sql`, `0159_lealtad_admin.sql`.
- [ ] Comprobar: `select lealtad_mxn from tickets limit 1;` responde sin error.
- [ ] Comprobar: `select codigo, activo, precio_mxn from addons where codigo = 'LEALTAD';` → activo, 100.
- [ ] Comprobar a quién se le concedió:
      `select t.nombre from tenant_addons ta join tenants t on t.id = ta.tenant_id join addons a on a.id = ta.addon_id where a.codigo = 'LEALTAD';`
      Deben ser solo los negocios en Negocio y Cadena. Ninguno queda encendido: el interruptor es del dueño.
- [ ] Comprobar que el proceso diario quedó programado: `select jobname, schedule from cron.job where jobname ilike '%lealtad%';`

## 2. Funciones (producción)

- [ ] Desplegar `lealtad-canje` (nueva).
- [ ] Redesplegar `autofacturar` (pública: con `verify_jwt = false`, ver
      `reference_deploy_funciones_publicas`) y `timbrar-cfdi`.
- [ ] Probar el portal de autofactura con un ticket normal de producción: debe seguir facturando.

## 3. Mezclar

- [ ] PR #110 (1A) → `main`. Luego #112 (1B), luego el de 1C, cada uno ya con base `main`.
- [ ] Esperar el despliegue de Vercel de admin, panel y sitio. Abrir `/lealtad` en el admin de
      VIM Pruebas: debe verse la sección (Pruebas está en un plan que la incluye) o la tarjeta de «pídelo».

## 4. Instalador

- [ ] Seguir `desktop/RUNBOOK.md`, «Antes de empaquetar», completo. Versión `0.5.0`.
- [ ] `npm run verify:lealtad-canje` y `npm run verify:lealtad-pull` en verde en la máquina que empaqueta.
- [ ] El `.exe` pesa ~155 MB o más (uno de ~134 MB salió sin dependencias: no se publica).
- [ ] Instalar en **VIM Pruebas** y recorrer, con internet:
  - [ ] Guardar un programa de sellos en el admin, un premio, y encenderlo. En un minuto la caja lo muestra.
  - [ ] Venta con cliente → el ticket dice lo que ganó. El saldo aparece en Clientes del admin.
  - [ ] Canjear el premio → sale en $0.00, llega a cocina. Cobrar. El corte separa «Lealtad».
  - [ ] Ese ticket en el portal de autofactura → dice que no se factura por separado.
  - [ ] Cancelar una cuenta con canje → el saldo vuelve.
  - [ ] Cambiar el programa a puntos = dinero (confirma el reinicio) → canjear $ en una cuenta → el total baja.
  - [ ] Sin internet: la venta suma puntos al volver la red; el botón de canjear avisa que necesita internet.
  - [ ] Lealtad → Movimientos muestra todo lo anterior con el nombre del cajero.
- [ ] Apagar el programa en VIM Pruebas al terminar, o dejarlo como demo: decisión de Fermín.

## 5. Publicar

- [ ] Martes antes de las 10:00 (`docs/operacion/actualizaciones.md`).
- [ ] Subir el instalador a `Fermin03/vim-pos-descargas`, firmar, y publicar `latest.json` desde
      `/versiones` escribiendo TODOS los campos (`reference_publicar_latest_json`).
- [ ] Tag `v0.5.0`.
- [ ] Corregir la fecha de `sitio-web/novedades.html` si no se publicó el 13 de octubre.
- [ ] Actualizar primero el hub de cada negocio y después sus cajas.

## Nota de versión (sin jerga, sin nombres ni números de clientes)

> **Nuevo: programa de lealtad.** Tus clientes ganan puntos o sellos cada vez que compran y los
> canjean en su siguiente visita. Tú eliges cómo ganan y qué reciben. Lo encuentras en tu panel,
> en Lealtad. En la caja, asigna un cliente a la cuenta y usa «Canjear puntos».
> Canjear necesita internet. En el plan Esencial es un extra; pregúntanos por WhatsApp.

## Si algo sale mal

- La lealtad se apaga sin desinstalar nada: quitar el extra LEALTAD al negocio desde el panel
  (o que el dueño apague el interruptor). Las cajas dejan de mostrarla en un minuto; los saldos se conservan.
- Las migraciones no se revierten: solo añaden. Con el programa apagado, `recalcular_totales_ticket`
  y `reporte_x` se comportan como antes.
- El instalador se retira volviendo a publicar `latest.json` con la 0.4.110.
```

- [ ] **Step 9: Verificación completa y commit**

```bash
cd C:/vwtN && pnpm -r typecheck 2>&1 | tail -8
cd C:/vwtN && pnpm --filter @vim/admin test 2>&1 | tail -3 && pnpm --filter @vim/pos test 2>&1 | tail -3 && pnpm --filter @vim/platform test 2>&1 | tail -3 && pnpm --filter @vim/db test 2>&1 | tail -3
cd C:/vwtN/desktop && npm test 2>&1 | tail -3 && npm run smokes 2>&1 | tail -4
cd C:/vwtN && pnpm tipografia && pnpm test:sitio 2>&1 | tail -3
cd C:/vwtN && git add -A sitio-web docs desktop/package.json && git status --short && git commit -m "docs(lealtad): versión 0.5.0, novedades, precios, ADR y la lista de salida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: todo en verde; `npm run smokes` con 66 archivos (los 65 del 1B más `smoke_lealtad_admin.sql`). Si algún `--filter` no tiene script `test`, dilo en el reporte en lugar de inventarlo. `git status --short` no debe listar `apps/pos/.env.local` ni nada bajo `.superpowers/`.

**No hagas push, no abras el PR y no toques producción.** El reporte final dice qué quedó verificado y qué no (pgTAP, la Edge Function desplegada y `pg_cron` no corren en local).

---

## Self-Review (hecha al escribir el plan)

**Cobertura del spec** (`docs/superpowers/specs/2026-10-05-lealtad-design.md`):

| Spec | Tarea |
|---|---|
| §7 Programa: mecánica, parámetros, ejemplo en vivo, interruptor, confirmación de reinicio | 5, 6 |
| §7 Premios: alta desde el catálogo, costo, pausar, eliminar; sin combos | 5, 7 |
| §7 Movimientos: cuatro cifras, libro filtrable, vista de control | 2, 8 |
| §7 Clientes: saldo, historial, ajuste manual con motivo | 2, 8, 9 |
| §8.6 Add-on de dos capas, precio en Esencial, incluido desde Negocio; panel de VIM | 1, 4 |
| §8.6 Sin contratar: tarjeta con WhatsApp, sin precios | 5, 6 |
| §12 Reportes: lealtad separada de descuentos | 2, 10 |
| §12 Salida: versión, nota, sitio, orden de publicación | 12 |
| Decisión 6 oct: premio $0, sin factura individual, sí en la global; `timbrar-cfdi` cerrado; premio revertido tras el pago | 1 |
| Pendientes del 1B: cliente con canje a medias; puente de punta a punta | 11 |

**Fuera, a propósito** (ya listado en «Alcance»): normalizar teléfonos existentes, modificadores del premio, canje en Domicilio desde la captura, el IVA con descuentos a nivel ticket, `estado_resultados_periodo` y `kpis_dia_sucursal`, y las capturas nuevas del sitio.

**Nombres que cruzan tareas** (revisados uno por uno): `@vim/db/lealtad` → `Mecanica`, `puntosPorCompra`, `unidad`, `cantidad` (T3 → T5, T6, T7, T8, T9); `guardarPrograma(f, confirmarReinicio)` con `{ ok, version, clientesReiniciados } | { ok: false, clientesConSaldo }` (T5 → T6); `activarModuloLealtad`, `leerProgramaAdmin`, `formDePrograma`, `ejemploPrograma`, `mensajeLealtad` (T5 → T6–T9); `PremioAdmin { id, productoId, nombre, costo, precio, activo, productoDisponible }` (T5 → T7); `estadoLealtad` → `"cargando" | "sin_contratar" | …` (T5 → T6); `lealtad_resumen(p_desde, p_hasta, p_sucursal)`, `lealtad_control(p_desde, p_hasta)`, `vw_lealtad_movimientos` con `cliente_nombre, cliente_telefono, sucursal_nombre, usuario_nombre, ticket_folio, saldo_visto` (T2 → T8); `vw_clientes_lista.lealtad_saldo/lealtad_vence_el` (T2 → T9); `lealtad_mxn` en las dos vistas de reportes (T2 → T10); `precioAltaAddon` (T4, no se usa fuera de platform).

**Lo que el ejecutor debe confirmar contra el código y no dar por bueno:** las clases de aviso amarillo y `TablaScroll` (T6, T8), el nombre de la fila en el `map` de clientes y de `recargar` (T9), los tipos exactos de `sumarDia`/consolidado (T10), el campo del carrito con el cliente de la cuenta (T11), los nombres de columna del seed en el script de verificación (T11) y el marcado vecino en `funciones.html` (T12). En cada uno el plan dice dónde mirar y qué hacer si difiere.
