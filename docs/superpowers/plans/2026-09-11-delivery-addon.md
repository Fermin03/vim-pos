# Delivery como add-on — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las apps de delivery dejen de venir gratis con cualquier plan y pasen a ser un add-on que VIM concede y el dueño enciende, y que una caja sin ese módulo deje de sondear pedidos.

**Architecture:** Dos capas sobre mecanismos que ya existen. El permiso lo da una fila en `tenant_addons` con código `DELIVERY` —igual que el CFDI— y el encendido, una columna nueva en `configuracion_tenant`, igual que `recetas`. `modulos_efectivos` combina las dos y ya viaja a la caja en cada latido; lo único que falta es que alguien lo lea. Tres Edge Functions se convierten en la barrera, y el admin, el POS y la caja esconden o apagan lo suyo.

**Tech Stack:** Postgres/plpgsql bajo RLS; TypeScript sobre Deno para las Edge Functions (probado con el runner de Node, sin Deno); Next.js en `apps/admin`, `apps/pos` y `apps/platform`; Node ESM en el escritorio.

**Spec:** `docs/superpowers/specs/2026-09-11-delivery-addon-design.md`. Antecedentes: ADR 0011 (integración de delivery), ADR 0013 (el interruptor de inventario), ADR 0014 (el panel manda por latido).

## Global Constraints

- **Rama:** `delivery-addon`, desde `origin/main`, en un worktree propio (`vim-pos-addon/`). NO trabajar en `vim-pos/`: otras sesiones cambian de rama ahí. Copiar a mano `desktop/bin/postgrest.exe` y `supabase/.temp/` (el `cp -r` deja vacíos los de `.temp`).
- **Numeración de migraciones:** la última aplicada es `0112_combos_uber.sql`, así que la de este plan es la **0113**. Comprobarlo con `supabase migration list --linked` **antes de fijarla y otra vez antes de publicar**: `main` ya robó un número dos veces y `db push` salta la migración **en silencio**.
- **Una migración aplicada en remoto NO se edita.** 0103 está en producción: `modulos_efectivos` se redefine con `CREATE OR REPLACE` desde la 0113, nunca tocando el archivo de la 0103.
- **Al redefinir una función, sus atributos se pierden en silencio.** `modulos_efectivos` es `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp` y termina con `REVOKE ... FROM public, anon` + `GRANT ... TO authenticated, service_role`. Los cinco se conservan **literalmente**. Esto ya causó una regresión real (las vistas de ventas de la entrega de combos perdieron `security_invoker`).
- **Los tres estados** (spec §4b), que mandan sobre todo lo demás:

  | Estado | Admin | POS | ¿La caja sondea? |
  |---|---|---|---|
  | Sin add-on | la sección no existe | nada | no |
  | Con add-on, apagado | sección con interruptor | nada | **no** |
  | Encendido | completa | pantalla de pedidos | sí |

- **La asimetría que es fácil implementar al revés:** el **admin** se guía por `permitidos` (para poder mostrar el interruptor apagado); el **POS y la caja**, por `efectivos`. `resolver_directivas` manda solo `efectivos`.
- **La falta de datos nunca bloquea la venta** (invariante duro de ADR 0014). Sin latido la caja vende igual; lo único que no hace es sondear pedidos de apps.
- **Precio:** el `addons.precio_mensual_mxn` de lista es **100.00** (lo que paga un Esencial). El panel pre-llena **0.00** para NEGOCIO y CADENA. "Incluido desde $999" es política de cobro: el plan **no** concede el módulo.
- Dinero: `numeric(12,2)`. Sin `any`, también en pruebas. Español en el dominio; archivos `kebab-case`, componentes `PascalCase`. Los comentarios explican el **porqué**.
- **RLS sagrado:** `service_role` solo en Edge Functions y `apps/platform`.
- Commits en español, terminados exactamente con:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0113_delivery_addon.sql` | add-on `DELIVERY`, columna del interruptor, `modulos_efectivos` con dos capas, limpieza de los planes |
| `supabase/scripts/smoke_delivery_addon.sql` | los tres estados, en SQL |
| `supabase/functions/_shared/delivery/procesar-uber.ts` | el guard del webhook |
| `supabase/functions/_shared/delivery/espejo.ts` | la respuesta del espejo sin módulo (función pura) |
| `supabase/functions/delivery-espejo/index.ts` | usarla antes de consultar nada |
| `supabase/functions/delivery-uber-conexion/index.ts` | 403 sin módulo |
| `packages/db/src/modulos.ts` | el catálogo: delivery pasa a `porAddon` y gana interruptor |
| `apps/platform/app/api/tenants/[id]/route.ts` | pre-llenar el precio según el plan |
| `apps/admin/app/lib/modulos.ts` | **nuevo**: lector de las dos capas |
| `apps/admin/app/components/config-sidenav.tsx` | esconder la entrada sin permiso |
| `apps/admin/app/(panel)/configuracion/integraciones/page.tsx` | el interruptor del dueño |
| `apps/pos/app/components/home-pos.tsx` | esconder la pantalla sin módulo efectivo |
| `desktop/src/main.mjs` | el espejo solo arranca con módulo |
| `desktop/package.json` | versión nueva |

---

### Task 0: Rama y línea base

**Files:** ninguno.

- [ ] **Step 1: Worktree**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos"
git fetch origin main
git worktree add -b delivery-addon ../vim-pos-addon origin/main
cd ../vim-pos-addon && pnpm install --frozen-lockfile
```

Copiar `desktop/bin/postgrest.exe` desde `vim-pos/desktop/bin/` (69,366,272 bytes) y los archivos de `supabase/.temp/` uno por uno.

- [ ] **Step 2: Comprobar la numeración**

```bash
supabase migration list --linked | tail -4
```
Expected: la última aplicada es `0112`. Si no, usar el siguiente libre y decirlo.

- [ ] **Step 3: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm -r test && pnpm test:functions && pnpm test:escritorio
cd desktop && npm run smokes && cd ..
```
Expected: typecheck 6/6; vitest 4 paquetes; functions 157; escritorio 87; smokes 36/36. Anotar los números.

---

### Task 1: La migración

**Files:**
- Create: `supabase/migrations/0113_delivery_addon.sql`
- Create: `supabase/scripts/smoke_delivery_addon.sql`

**Interfaces:**
- Produces: `configuracion_tenant.modulo_delivery_activo boolean NOT NULL DEFAULT false`; una fila en `addons` con `codigo = 'DELIVERY'`; `modulos_efectivos(uuid)` devolviendo `delivery_apps` con `permitido ≠ efectivo`.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_delivery_addon.sql`, con la forma de `smoke_combos.sql`: fixtures propias con uuids fijos, `\set ON_ERROR_STOP on`, `BEGIN`/`ROLLBACK`, `RAISE NOTICE` por sección.

```sql
-- Estado 1: sin add-on → ni permitido ni efectivo.
SELECT modulos_efectivos(v_tenant) INTO v_m;
IF (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'sin add-on no debe estar permitido'; END IF;
IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'sin add-on no debe ser efectivo'; END IF;

-- Estado 2: con add-on vigente y el interruptor apagado → permitido, NO efectivo.
INSERT INTO tenant_addons(tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
VALUES (v_tenant, (SELECT id FROM addons WHERE codigo='DELIVERY'), CURRENT_DATE, true, 100.00);
SELECT modulos_efectivos(v_tenant) INTO v_m;
IF NOT (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'con add-on debe estar permitido'; END IF;
IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'sin encender NO debe ser efectivo'; END IF;

-- Estado 3: encendido → los dos.
INSERT INTO configuracion_tenant(tenant_id, modulo_delivery_activo) VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_delivery_activo = true;
SELECT modulos_efectivos(v_tenant) INTO v_m;
IF NOT (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'encendido debe ser efectivo'; END IF;

-- La vigencia manda sobre el interruptor: caducar el add-on lo apaga aunque siga encendido.
UPDATE tenant_addons SET fecha_fin = CURRENT_DATE - 1
 WHERE tenant_id = v_tenant AND addon_id = (SELECT id FROM addons WHERE codigo='DELIVERY');
SELECT modulos_efectivos(v_tenant) INTO v_m;
IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'caducado no debe ser efectivo'; END IF;

-- Ningún plan concede delivery: es política de cobro, no permiso.
IF EXISTS (SELECT 1 FROM planes WHERE features_incluidos->'modulos' ? 'delivery_apps') THEN
  RAISE EXCEPTION 'delivery_apps no debe quedar en features_incluidos de ningún plan';
END IF;

-- Los demás módulos no se tocaron.
IF NOT (v_m->'permitidos' ? 'kds' AND v_m->'permitidos' ? 'recetas'
        AND v_m->'permitidos' ? 'reservaciones' AND v_m->'permitidos' ? 'promociones'
        AND v_m->'permitidos' ? 'cfdi') THEN
  RAISE EXCEPTION 'la redefinición perdió módulos';
END IF;
```

- [ ] **Step 2: Correr y ver fallar**

```bash
cd desktop && npm run smokes -- smoke_delivery_addon.sql && cd ..
```
Expected: FAIL — no existe el add-on `DELIVERY` ni la columna `modulo_delivery_activo`.

- [ ] **Step 3: La columna y el add-on**

```sql
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_delivery_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_delivery_activo IS
  'Interruptor del dueño para las apps de delivery. Hermano de modulo_inventario_activo (ADR 0013): VIM concede el add-on, el dueño lo enciende cuando lo va a usar. Apagado = la caja no sondea.';

-- El precio de lista es el que paga un Esencial; Negocio y Cadena lo llevan incluido y el panel
-- pre-llena 0.00 al darlo de alta. No se pone como un plan porque el plan NO concede el módulo:
-- si lo concediera, la caja de todo cliente de Negocio sondearía sin usarlo nunca.
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES (
  'DELIVERY',
  'Apps de delivery',
  'Los pedidos de Uber Eats entran a la caja como un ticket, con su comanda a cocina. '
    || 'Incluido sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('delivery_apps', true),
  20
)
ON CONFLICT (codigo) DO NOTHING;
```

- [ ] **Step 4: Redefinir `modulos_efectivos`**

Copiar el cuerpo de `0103_platform_centro_control.sql:56-115` **entero** y cambiar solo dos cosas: sacar `delivery_apps` del array del bucle, y resolverlo aparte como el CFDI pero con interruptor.

```sql
-- El array pierde 'delivery_apps': pasa a resolverse por add-on, abajo.
FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
```

y, junto al bloque del CFDI:

```sql
  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));
```

Declarar `v_del boolean` en el `DECLARE`. **Conservar literalmente** `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp`, el `COMMENT`, el `REVOKE ... FROM public, anon` y el `GRANT ... TO authenticated, service_role`.

- [ ] **Step 5: Quitar delivery de los planes**

```sql
-- 0103 lo puso en los nueve planes. Si se queda, es una llave muerta que hará dudar al siguiente
-- que lea la tabla sobre quién concede el módulo.
UPDATE planes SET features_incluidos = jsonb_set(
         features_incluidos, '{modulos}', (features_incluidos->'modulos') - 'delivery_apps')
 WHERE features_incluidos->'modulos' ? 'delivery_apps';
```

- [ ] **Step 6: Dejar al tenant de pruebas con su add-on**

```sql
-- vim-pruebas es el único que ejercita delivery hoy (la integración está en producción pero ningún
-- restaurante real la usa). Sin esto se quedaría sin su propio banco de pruebas.
INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas)
SELECT t.id, a.id, CURRENT_DATE, true, 0.00, 'Tenant de pruebas de VIM'
  FROM tenants t CROSS JOIN addons a
 WHERE t.id = 'd3462bb3-198b-4cc3-8105-7060d6998478' AND a.codigo = 'DELIVERY'
   AND NOT EXISTS (SELECT 1 FROM tenant_addons x WHERE x.tenant_id = t.id AND x.addon_id = a.id AND x.activo);

INSERT INTO configuracion_tenant (tenant_id, modulo_delivery_activo)
SELECT id, true FROM tenants WHERE id = 'd3462bb3-198b-4cc3-8105-7060d6998478'
ON CONFLICT (tenant_id) DO UPDATE SET modulo_delivery_activo = true;
```

Va por uuid y no por `tenants.codigo` a propósito: el uuid es el que aparece en los documentos de
operación y en el ledger de las dos entregas de combos, así que es el identificador que alguien
puede verificar. Ambas sentencias son idempotentes, que es lo que se le pide a una migración.

- [ ] **Step 7: Verde**

```bash
cd desktop && npm run smokes && cd ..
```
Expected: `SMOKE DELIVERY ADDON OK` más los 36 anteriores. Si `smoke_delivery_app.sql` se pone rojo, investigar: es el que cubre el camino de un pedido normal.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/scripts
git commit -m "feat(delivery): el módulo pasa a ser add-on con interruptor del dueño" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: El guard del webhook

**Files:**
- Modify: `supabase/functions/_shared/delivery/procesar-uber.ts`
- Modify: `supabase/functions/_shared/delivery/procesar-uber.test.ts`

**Interfaces:**
- Consumes: `modulos_efectivos(p_tenant)` de la Task 1.
- Produces: `ResultadoProceso.accion` gana el valor `"SIN_MODULO"`.

Es la barrera principal: impide que entre trabajo de un cliente que no lo paga, y cubre el caso de que la llamada a Uber al retirar el add-on (Task 6) haya fallado.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
test("un pedido de un tenant sin el módulo no se procesa ni se guarda", async () => {
  const { db, pedidos } = dbFalsa({ conexion: CONEXION, turnoAbierto: true, productos: [PROD], moduloDelivery: false });
  const r = await procesarNotificacionUber({ db, uber: uberFalso(), ahora: () => new Date() }, EVENTO);
  assert.equal(r.accion, "SIN_MODULO");
  assert.equal(r.pedido_id, null);
  assert.equal(pedidos.length, 0);   // lo que más importa: no se escribió nada
});

test("con el módulo, el mismo pedido entra como siempre", async () => {
  const { db, pedidos } = dbFalsa({ conexion: CONEXION, turnoAbierto: true, productos: [PROD], moduloDelivery: true });
  const r = await procesarNotificacionUber({ db, uber: uberFalso(), ahora: () => new Date() }, EVENTO);
  assert.notEqual(r.accion, "SIN_MODULO");
  assert.equal(pedidos.length, 1);
});
```

El doble `dbFalsa` (`procesar-uber.test.ts:18-44`) resuelve por nombre de tabla y tiene `rpc`. Gana la opción `moduloDelivery` y su `rpc` contesta a `modulos_efectivos` con `{ efectivos: { delivery_apps: <ese valor> } }`. **Las pruebas que ya existen deben seguir pasando**: el valor por defecto de `moduloDelivery` es `true`, para no reescribirlas todas.

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — hoy el pedido se procesa igual.

- [ ] **Step 3: Implementar**

En `procesar-uber.ts`, el tipo:

```ts
  accion: "ACEPTADO_AUTO" | "PENDIENTE_CAJERO" | "PENDIENTE_ESCRITORIO" | "DUPLICADO" | "SIN_CONEXION" | "SIN_MODULO" | "ERROR";
```

y el guard **justo después** de resolver la conexión (`procesar-uber.ts:86-88`) y **antes** de mirar duplicados:

```ts
  // El add-on manda: sin él no entra trabajo de este cliente. Va aquí, antes del duplicado y antes
  // de pedirle la orden a Uber, para no hacer ni una llamada de red por un pedido que se descarta.
  const { data: mod } = await deps.db.rpc("modulos_efectivos", { p_tenant: String(cx.tenant_id) });
  if (obj(obj(mod).efectivos).delivery_apps !== true) {
    return { pedido_id: null, accion: "SIN_MODULO", detalle: `tenant ${cx.tenant_id} sin el módulo de delivery` };
  }
```

- [ ] **Step 4: Que el webhook registre el motivo**

En `supabase/functions/delivery-webhook-uber/index.ts`, donde se sella el evento con el resultado, `SIN_MODULO` tiene que quedar registrado como los demás. Comprobar que el `accion` viaja al registro sin necesidad de cambios; si hay un `switch` que enumere acciones, añadirlo.

- [ ] **Step 5: Verde y commit**

```bash
pnpm test:functions
git add supabase/functions
git commit -m "feat(delivery): el webhook rechaza pedidos de un tenant sin el módulo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: El guard del espejo

**Files:**
- Modify: `supabase/functions/_shared/delivery/espejo.ts`
- Modify: `supabase/functions/_shared/delivery/espejo.test.ts`
- Modify: `supabase/functions/delivery-espejo/index.ts`

**Interfaces:**
- Produces: `export function respuestaSinModulo(cajaId: string, sucursalId: string): {...}` en `espejo.ts`.

Es lo que hace que una caja que todavía no se enteró —o que no se actualice nunca— deje de pesar, sin publicar un instalador.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
test("sin módulo: respuesta vacía y a reposo", () => {
  const r = respuestaSinModulo("caja-1", "suc-1");
  assert.deepEqual(r.conexiones, []);
  assert.deepEqual(r.pedidos, []);
  assert.equal(r.siguiente_en_ms, REPOSO_MS);
  assert.equal(r.caja_id, "caja-1");
  assert.equal(r.sucursal_id, "suc-1");
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — `respuestaSinModulo` no existe.

- [ ] **Step 3: Implementar la función pura**

```ts
/**
 * Lo que se le contesta a una caja cuyo tenant no tiene el módulo encendido.
 *
 * Vacía y en reposo. Importa que exista como función y no como un objeto suelto en el handler
 * porque es la única parte del corte que se puede probar: el handler no se prueba (toca la base).
 * Y va ANTES de las tres consultas del handler, así que un tenant sin delivery no le cuesta a la
 * base ni una lectura.
 */
export function respuestaSinModulo(cajaId: string, sucursalId: string) {
  return {
    ahora: new Date().toISOString(),
    caja_id: cajaId,
    sucursal_id: sucursalId,
    conexiones: [] as unknown[],
    pedidos: [] as unknown[],
    siguiente_en_ms: REPOSO_MS,
  };
}
```

- [ ] **Step 4: Usarla en el handler**

En `delivery-espejo/index.ts`, **justo después** de `if (!caja) return json({ error: "CAJA_NO_EXISTE" }, 403);` (línea 76) y **antes** de declarar `pedidosDe`:

```ts
  const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null)?.efectivos ?? {};
  if (efectivos.delivery_apps !== true) {
    return json(respuestaSinModulo(caja.id, caja.sucursal_id));
  }
```

Añadir `respuestaSinModulo` al import de `../_shared/delivery/espejo.ts` (línea 16).

- [ ] **Step 5: Verde y commit**

```bash
pnpm test:functions
git add supabase/functions
git commit -m "feat(delivery): el espejo manda a reposo a la caja sin el módulo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: El guard de la conexión

**Files:**
- Modify: `supabase/functions/delivery-uber-conexion/index.ts`

Sin esto, el dueño podría reconectar su tienda por OAuth y recuperar el servicio sin pagarlo.

Esta tarea no tiene prueba automática: la función toca Supabase y el repo no prueba las Edge Functions con base. Se verifica leyendo, y de verdad en la Task 9.

- [ ] **Step 1: Implementar**

En `delivery-uber-conexion/index.ts`, después de resolver `tenantId` y la jerarquía del usuario, y **antes** del `switch` de acciones:

```ts
  // Todas las acciones quedan cerradas sin el módulo: conectar, pausar, mandar la carta. Si no,
  // el dueño recupera el servicio por OAuth sin pagarlo.
  const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null)?.efectivos ?? {};
  if (efectivos.delivery_apps !== true) {
    return json({ error: "SIN_MODULO_DELIVERY" }, 403);
  }
```

**Una excepción:** la acción `"desconectar"` debe seguir permitida sin módulo, porque la Task 6 la usa para cortar cuando se retira el add-on, y porque un dueño al que se le retiró debe poder soltar su tienda. Sacarla del guard con un comentario que lo explique.

- [ ] **Step 2: Typecheck y commit**

```bash
pnpm turbo run typecheck
git add supabase/functions
git commit -m "feat(delivery): las acciones de conexión piden el módulo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: El catálogo de módulos

**Files:**
- Modify: `packages/db/src/modulos.ts`

**Interfaces:**
- Produces: `Modulo.interruptorDueno` acepta `"modulo_delivery_activo"`; la fila de `delivery_apps` pasa a `porAddon: true`.

- [ ] **Step 1: Implementar**

```ts
  /** Columna de configuracion_tenant que el dueño enciende, o null si no hay interruptor. */
  interruptorDueno: "modulo_inventario_activo" | "modulo_delivery_activo" | null;
  /** true = el permiso lo decide un add-on de pago, no un flag ni el plan. */
  porAddon: boolean;
```

y la fila:

```ts
  { codigo: "delivery_apps", nombre: "Apps de delivery", descripcion: "Uber Eats, DiDi y Rappi entrando a la caja.", interruptorDueno: "modulo_delivery_activo", porAddon: true },
```

El comentario de `porAddon` decía "el add-on CFDI"; ahora son dos, así que se generaliza como arriba.

- [ ] **Step 2: Typecheck y commit**

```bash
pnpm turbo run typecheck && pnpm -r test
git add packages/db
git commit -m "feat(delivery): el catálogo declara el add-on y el interruptor" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: El panel

**Files:**
- Modify: `apps/platform/app/api/tenants/[id]/route.ts`

**Interfaces:**
- Consumes: la fila `DELIVERY` de `addons` (Task 1).

El panel ya lista los add-ons y tiene `addon_activar`/`addon_desactivar` genéricos (`ficha-contrato.tsx:109-126`), así que el add-on nuevo **aparece solo**. Faltan dos cosas.

- [ ] **Step 1: Pre-llenar el precio según el plan**

En `addon_activar` (`route.ts:212-242`), la línea del precio es hoy:

```ts
const precio = body.precio_mensual_mxn != null ? Number(body.precio_mensual_mxn) : Number(addon.precio_mensual_mxn);
```

Pasa a:

```ts
// El plan no concede el módulo —si lo concediera, la caja de todo cliente de Negocio sondearía sin
// usarlo— pero sí decide el precio: incluido desde Negocio, $100 al mes en Esencial. Pre-llenarlo
// aquí evita que la política viva en la memoria de quien rellena el formulario.
let precioLista = Number(addon.precio_mensual_mxn);
if (codigo === "DELIVERY") {
  const { data: tRaw } = await sb.from("tenants")
    .select("plan:planes(codigo)").eq("id", id).maybeSingle();
  const plan = (tRaw as { plan?: { codigo?: string } } | null)?.plan?.codigo ?? "";
  if (plan === "NEGOCIO" || plan === "CADENA") precioLista = 0;
}
const precio = body.precio_mensual_mxn != null ? Number(body.precio_mensual_mxn) : precioLista;
```

Comprobar el nombre de la relación (`plan_actual_id` → `planes`) contra la consulta que esa ruta ya
hace para la ficha y reusar su forma; si ya trae el plan en memoria, usarlo en vez de consultar otra
vez.

- [ ] **Step 2: Avisar a Uber al desactivar**

En `addon_desactivar`, cuando el código es `DELIVERY`, además de cerrar la fila hay que decirle a Uber que pare. **Reutiliza la acción que ya existe**: `delivery-uber-conexion` tiene `case "pausar"` (`index.ts:195-208`) que llama `uber.posData(tienda).actualizar({ integration_enabled: habilitar })`.

Después de cerrar la fila del add-on:

```ts
// Uber no lee nuestra base: si no se le avisa, sigue ofreciendo la tienda y cobrándole al cliente
// final por comida que nadie va a preparar. Se le avisa por cada conexión viva.
let pausadas = 0;
const fallos: string[] = [];
if (codigo === "DELIVERY") {
  const { data: cxs } = await sb.from("delivery_conexiones")
    .select("id, estado").eq("tenant_id", id).in("estado", ["ACTIVA", "PENDIENTE"]);
  for (const cx of (cxs ?? []) as { id: string; estado: string }[]) {
    try {
      const r = await fetch(`${URL_FUNCIONES}/delivery-uber-conexion`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ accion: "pausar", conexion_id: cx.id, habilitar: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      pausadas += 1;
    } catch (e) {
      // El add-on se retira IGUAL: el cliente dejó de pagar. Un fallo de red no puede dejarle el
      // servicio encendido. El guard del webhook lo cubre mientras tanto.
      fallos.push(`${cx.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
```

y la respuesta dice el resultado, para que alguien reintente:

```ts
return NextResponse.json({ ok: true, pausadas, fallos });
```

Comprobar cómo llama esa ruta a otras Edge Functions —si ya tiene un helper con la URL y la clave,
usarlo en vez de construir el `fetch` a mano— y que la acción `"pausar"` acepte ser invocada con
`service_role` y no solo con un JWT de dueño; si exige jerarquía de usuario, hay que permitir
explícitamente el `service_role` ahí, con un comentario que diga por qué.

- [ ] **Step 3: Typecheck y commit**

```bash
pnpm turbo run typecheck && pnpm --filter @vim/platform test
git add apps/platform
git commit -m "feat(delivery): el panel pre-llena el precio y avisa a Uber al retirar" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: El admin

**Files:**
- Create: `apps/admin/app/lib/modulos.ts`
- Modify: `apps/admin/app/components/config-sidenav.tsx`
- Modify: `apps/admin/app/(panel)/configuracion/integraciones/page.tsx`
- Test: `apps/admin/app/lib/__tests__/modulos.test.ts`

**Interfaces:**
- Produces: `leerModulos(): Promise<{ permitidos: Record<string, boolean>; efectivos: Record<string, boolean> }>` y `activarModuloDelivery(activo: boolean): Promise<void>`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
test("leerModulos devuelve las dos capas", async () => {
  const supabase = supabaseFalso({ rpc: { modulos_efectivos: { permitidos: { delivery_apps: true }, efectivos: { delivery_apps: false } } } });
  const m = await leerModulos();
  assert.equal(m.permitidos.delivery_apps, true);
  assert.equal(m.efectivos.delivery_apps, false);
});

test("sin respuesta del RPC, nada está permitido", async () => {
  const supabase = supabaseFalso({ rpc: { modulos_efectivos: null } });
  const m = await leerModulos();
  assert.deepEqual(m, { permitidos: {}, efectivos: {} });
});
```

Seguir el patrón de dobles que ya usan las pruebas de `apps/admin/app/lib/__tests__/`.

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @vim/admin test`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: El lector**

`apps/admin/app/lib/modulos.ts`, siguiendo el estilo de `inventario.ts`:

```ts
/**
 * Módulos del cliente, en sus DOS capas (ADR 0014).
 *
 * `permitidos` es lo que VIM concedió; `efectivos`, lo que además el dueño encendió. El admin
 * necesita las dos: sin `permitidos` no podría mostrar la sección de delivery con su interruptor
 * apagado, y el dueño no tendría dónde encenderla.
 *
 * Sin respuesta del RPC se devuelve vacío, que es lo mismo que "nada permitido": esconder de más
 * es recuperable —el dueño llama— y mostrar de más deja tocar lo que no se pagó.
 */
export async function leerModulos(): Promise<{ permitidos: Record<string, boolean>; efectivos: Record<string, boolean> }> {
  const tid = await tenantId();
  const { data, error } = await supabase.rpc("modulos_efectivos", { p_tenant: tid });
  if (error) throw new Error(error.message);
  const m = data as { permitidos?: Record<string, boolean>; efectivos?: Record<string, boolean> } | null;
  return { permitidos: m?.permitidos ?? {}, efectivos: m?.efectivos ?? {} };
}

/** Enciende o apaga las apps de delivery. Mismo upsert que el de inventario: la mayoría de los
 *  tenants no tiene fila en configuracion_tenant hasta el primer ajuste. */
export async function activarModuloDelivery(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_delivery_activo: activo }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Esconder la entrada del menú**

`config-sidenav.tsx` tiene hoy `SECCIONES` como constante de módulo y `TODOS` derivado de ella. Pasar a filtrar "Apps de delivery" cuando `permitidos.delivery_apps` no es `true`, leyendo los módulos donde el componente ya tenga datos del tenant. Si el componente es puramente cliente y no los tiene, recibirlos por prop desde el layout del panel en vez de consultar desde el sidenav.

- [ ] **Step 5: El interruptor en la página**

`(panel)/configuracion/integraciones/page.tsx`:

- `permitidos.delivery_apps !== true` → redirigir; esa sección no existe para ese cliente.
- permitido y `efectivos.delivery_apps !== true` → mostrar solo el encabezado, una línea de qué hace el módulo y el interruptor de activar. **Nada del asistente de conexión de Uber.**
- efectivo → la página completa de hoy.

El interruptor usa `activarModuloDelivery`. **Al apagarlo con conexiones activas, pide confirmación** y el texto dice lo que pasa: *"Uber seguirá mandando pedidos a tu tienda y no los verás aquí."* Es el riesgo del spec §10 y sin ese aviso el dueño pierde ventas sin entender por qué.

- [ ] **Step 6: Verde y commit**

```bash
pnpm --filter @vim/admin test && pnpm turbo run typecheck
git add apps/admin
git commit -m "feat(delivery): el admin esconde la sección sin permiso y la enciende el dueño" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El POS y la caja

**Files:**
- Modify: `apps/pos/app/components/home-pos.tsx:1528`
- Modify: `desktop/src/main.mjs:774-799`
- Modify: `desktop/package.json`
- Test: `apps/pos/app/lib/__tests__/` y `desktop/src/*.test.mjs` según corresponda

**Interfaces:**
- Consumes: `Directivas.modulos` de `apps/pos/app/lib/directivas.ts` (ya existe) y `crearAlmacenDirectivas(...).leer()` de `desktop/src/directivas.mjs`.

Aquí es donde desaparece la carga.

- [ ] **Step 1: Escribir las pruebas que fallan**

Para la caja, una función pura nueva en `desktop/src/delivery-espejo-ritmo.mjs` o junto a ella, probada con `node --test`:

```js
test("el espejo solo arranca con el módulo encendido", () => {
  assert.equal(debeSondearApps({ modulos: { delivery_apps: true } }), true);
  assert.equal(debeSondearApps({ modulos: { delivery_apps: false } }), false);
  assert.equal(debeSondearApps({ modulos: {} }), false);
});

test("sin directivas todavía, NO arranca", () => {
  // Arrancar por defecto contradiría el propósito: la caja de un cliente sin delivery sondearía
  // hasta el primer latido, que puede tardar 10 minutos o no llegar nunca si no hay nube.
  assert.equal(debeSondearApps(null), false);
  assert.equal(debeSondearApps(undefined), false);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:escritorio`
Expected: FAIL — `debeSondearApps` no existe.

- [ ] **Step 3: La caja**

```js
/**
 * ¿Esta caja debe sondear pedidos de apps?
 *
 * Solo si el latido dice que el módulo está encendido. Sin directivas guardadas todavía NO
 * arranca: es un cliente que puede no tener delivery, y arrancar "por si acaso" es exactamente
 * el sondeo que esta entrega vino a quitar. El primer latido decide, y llega en minutos.
 *
 * Ojo con el invariante de ADR 0014: la falta de datos no bloquea la VENTA. Aquí no se bloquea
 * nada de vender; lo único que no se hace es preguntar por pedidos de apps.
 */
export function debeSondearApps(directivas) {
  return directivas?.modulos?.delivery_apps === true;
}
```

En `main.mjs`, la condición de `iniciarSync` (línea 792) pasa a incluirla, leyendo del almacén que ya existe:

```js
  const { directivas: d } = directivas.leer();
  if (backend?.pool && cajaId && debeSondearApps(d) && !espejo) {
    espejo = crearEspejo({ ... });
    espejo.iniciar();
  } else if (!cajaId) {
    console.log("· [espejo] omitido (la caja no está vinculada a la nube)");
  } else if (!debeSondearApps(d)) {
    console.log("· [espejo] omitido (el cliente no tiene el módulo de apps de delivery)");
  }
```

Y donde se guardan las directivas nuevas tras un latido (`main.mjs:533`), si el módulo se apagó y hay espejo vivo, detenerlo; si se encendió y no lo hay, arrancarlo. El log dice cuál de las dos cosas pasó.

- [ ] **Step 4: El POS**

`home-pos.tsx:1528` monta `PantallaPedidosApps`, y el archivo ya importa de `../lib/pedidos-apps`
(línea 50) para el badge y el sonido. Las directivas ya se leen en el POS
(`apps/pos/app/lib/directivas.ts`, con `modulos: Record<string, boolean>`).

```tsx
// El módulo manda sobre la pantalla y sobre el badge: sin él, ni se monta ni se sondea, que es lo
// mismo que hace la caja de escritorio con su espejo.
const hayDelivery = directivas?.modulos?.delivery_apps === true;
```

Con eso: la rama de la línea 1528 no se monta si `!hayDelivery`, el atajo que lleva a esa pantalla
no se pinta, y las lecturas de `leerPedidosApps`/`hayExpiradosSinVer` no se disparan. Comprobar en
qué estado o hook tiene `home-pos.tsx` las directivas a mano y usar ese; si no las tiene, leerlas
donde ya se leen para la banda de gracia y el bloqueo, no con una consulta nueva.

- [ ] **Step 5: Versión**

`desktop/package.json` sube a la siguiente libre (comprobar `main`: hoy está en 0.4.68, así que **0.4.70**).

- [ ] **Step 6: Verde y commit**

```bash
pnpm test:escritorio && pnpm --filter @vim/pos test && pnpm turbo run typecheck
git add apps/pos desktop
git commit -m "feat(delivery): la caja no sondea y el POS no muestra la pantalla sin el módulo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación real

**Files:**
- Modify: `docs/operacion/delivery-uber-sandbox.md`

Con el tenant `vim-pruebas` y la tienda sandbox, recorrer los tres estados:

- [ ] **Step 1: Estado 3 → todo sigue igual**

Con el add-on y el interruptor encendidos (como los deja la migración), **un pedido entra como hoy**. Es la no-regresión que más importa: esta entrega no debe cambiar nada para quien sí paga.

- [ ] **Step 2: Estado 2 → apagar el interruptor**

Desde el admin. Comprobar: la sección sigue visible con el interruptor; la pantalla del POS desaparece; la caja deja de sondear (verlo en su log); y un pedido que llegue se rechaza con `SIN_MODULO` en `delivery_eventos`, sin crear fila en `delivery_pedidos`.

- [ ] **Step 3: Estado 1 → retirar el add-on**

Desde `/platform`. Comprobar: la sección desaparece del admin; las acciones de `delivery-uber-conexion` devuelven 403; y **Uber recibió el aviso** (`integration_enabled = false`, verificable con la acción "Comprobar" o en el dashboard de Uber).

- [ ] **Step 4: Volver a encenderlo**

Dar de alta el add-on otra vez y encender el interruptor: todo vuelve. Es lo que hará un cliente que se atrasa un mes y luego paga.

- [ ] **Step 5: Documentar y commit**

Añadir a `docs/operacion/delivery-uber-sandbox.md` una sección con la fecha, los tres estados y lo que se observó en cada uno.

```bash
git add docs/operacion/delivery-uber-sandbox.md
git commit -m "docs(delivery): resultado de la prueba de los tres estados del add-on" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Entrega

- [ ] **Step 1: Todo verde**

```bash
pnpm turbo run typecheck && pnpm -r test && pnpm test:functions && pnpm test:escritorio
cd desktop && npm run smokes && cd ..
```

- [ ] **Step 2: PR**

```bash
git push -u origin delivery-addon
gh pr create --title "Las apps de delivery son un add-on" --body "…"
```
Esperar `rls-tests` en verde antes de mezclar.

- [ ] **Step 3: Antes de tocar nada — cuatro comprobaciones**

La revisión final las echó en falta. Las tres primeras son de lectura y no cambian nada.

**a) Dar de alta el secreto en los dos lados**, con el mismo valor:

```bash
supabase secrets set VIM_DELIVERY_INTERNO_SECRET=<valor>
```
y la misma variable en el entorno de servidor de `apps/platform` en Vercel. **Sin esto, retirar el
add-on no avisa a Uber** y el panel lo reporta en `fallos`.

**b) Confirmar que el gateway acepta la llamada del panel.** Es lo único de la rama que no se pudo
verificar sin desplegar. Con la clave de servicio real y un `x-vim-interno` **deliberadamente
incorrecto** (no toca Uber ni ninguna fila):

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/delivery-uber-conexion"   -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "content-type: application/json"   -H "x-vim-interno: no-es-el-secreto"   -d '{"accion":"pausar","conexion_id":"00000000-0000-0000-0000-000000000000"}'
```

`401 {"error":"INTERNO_INVALIDO"}` = el gateway dejó pasar y corrió la función: **bien**.
Un 401 con el vocabulario de Supabase (`{"code":401,"message":"Invalid JWT"}`, sin campo `error`)
= lo frenó el gateway: **parar**, y decidir otro mecanismo. Repetirlo sin la cabecera `apikey`
cierra la duda de si el gateway la exige. Luego, con el secreto bueno y un `conexion_id`
inexistente → `404 CONEXION_NO_EXISTE` prueba el camino entero sin llamar a Uber.

**c) Comprobar en producción que de verdad nadie usa delivery.** Todo el diseño se apoya en eso, y
el spec §10 nombra "confundir *está en producción* con *está en uso*" como la trampa que ya mordió:

```sql
SELECT tenant_id, estado FROM delivery_conexiones WHERE estado IN ('ACTIVA','PAUSADA','ERROR');
```

Si sale alguien que no sea `vim-pruebas`, **parar**: la migración le quitaría el módulo y hay que
darle el add-on antes.

**d) Regenerar los tipos.** `pnpm db:types` no se pudo correr en el worktree (la base local tiene
drift real). Hacerlo desde un entorno limpio; hoy no rompe nada porque el cliente del admin no usa
el genérico, pero el archivo generado está desincronizado.

- [ ] **Step 4: Producción, en este orden**

1. `supabase migration list --linked` y `supabase db push`. **Ojo:** la migración retira delivery de todos los planes, así que en cuanto se aplique, **todo cliente queda sin el módulo hasta que se le dé el add-on**. Como hoy nadie usa delivery, no rompe a nadie; el de pruebas se autoconcede en la propia migración.
2. Desplegar las tres Edge Functions: `delivery-webhook-uber`, `delivery-espejo`, `delivery-uber-conexion`.
3. Mezclar el PR (despliega admin, POS y panel en Vercel).
4. Instalador **0.4.70**, con la lista "Antes de empaquetar" del RUNBOOK.
5. Después del `db push`, verificar contra un tenant real que `modulos_efectivos` sigue devolviendo
   los otros cinco módulos como estaban: el smoke corre sobre la semilla de dev, no sobre producción.

El orden no es el de la entrega de combos: aquí la migración puede ir primero porque **quita** permisos, no añade capacidades que la caja necesite entender. Una caja en 0.4.68 seguirá sondeando aunque el cliente no tenga el módulo, y el guard del espejo la manda a reposo: pesa lo mismo que hoy, no peor.

---

## Autorrevisión del plan

- **Cobertura del spec:** §4 (el add-on) → Task 1; §4b (los tres estados) → Tasks 1, 7 y 8, con el smoke de la Task 1 fijando las tres combinaciones; §5 (apagar de verdad) → Task 6 paso 2; §6 (los cuatro sitios) → Tasks 2, 3, 4 y 7/8; §7 (la caja) → Task 8; §8 (las superficies) → Tasks 7 y 8; §9 (pruebas) → las de cada tarea más la Task 9; §10 (riesgos) → el aviso al apagar en la Task 7 paso 5 y el orden de la Task 10.
- **Nombres consistentes:** `modulo_delivery_activo` se crea en la Task 1 y lo usan las Tasks 5 y 7; `respuestaSinModulo` se define y se usa en la Task 3; `leerModulos`/`activarModuloDelivery` en la Task 7; `debeSondearApps` en la Task 8; `"SIN_MODULO"` en la Task 2 y se observa en la Task 9.
- **Corregido durante la autorrevisión:** la Task 1 usaba `tenants.slug`, que no existe — la columna
  es `codigo` (`0002_nucleo_comercial.sql:135`). Se cambió a ir por uuid, que además es el
  identificador que aparece en los documentos de operación y que alguien puede verificar.
- **Tres puntos donde el plan manda comprobar en vez de asumir**, porque no se pueden verificar sin
  ejecutar. Los tres están acotados y con la alternativa escrita:
  1. Si `config-sidenav.tsx` tiene acceso a los módulos o hay que pasárselos por prop (Task 7 §4).
  2. Dónde tiene `home-pos.tsx` las directivas a mano (Task 8 §4).
  3. **El más importante:** si la acción `"pausar"` de `delivery-uber-conexion` acepta ser invocada
     con `service_role` o exige jerarquía de usuario (Task 6 §2). De eso depende que el panel pueda
     avisarle a Uber al retirar el add-on, que es la decisión 2 del spec. Si exige jerarquía, hay
     que abrirle paso al `service_role` explícitamente.
