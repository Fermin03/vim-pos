# Giros y módulos de operación · Entrega 2: las pantallas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja, el admin, /platform y el registro obedezcan los módulos de operación de la entrega 1: cada negocio ve solo lo que usa, VIM los mueve desde /platform y un negocio nuevo arranca con el juego de su giro.

**Architecture:** Un catálogo compartido (`@vim/db/operacion`) con los giros, los módulos y la regla `moduloActivo`. Las pantallas leen los módulos por los caminos que ya existen: la caja por `useAcceso()` (directivas), el admin por `useModulos()`, y /platform por el GET de la ficha. Ninguna pantalla pregunta por el giro. Una migración (0181) hace que el alta aplique el juego del giro y que los clientes existentes conserven exactamente lo que veían. /platform llama `operacion_cambiar` y `cambiar_giro` (entrega 1) desde su API del lado del servidor.

**Tech Stack:** Next.js (pos, admin, platform), Vitest (`app/**/*.test.ts`, entorno node, sin pruebas de componentes), Edge Functions en Deno probadas con `node --test --experimental-strip-types`, smokes `.sql` del escritorio.

**Spec:** `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md` (§4, §5, §6.3, §6.4, §7). **Plan anterior:** `docs/superpowers/plans/2026-10-14-giros-1-nucleo.md`.

## Global Constraints

- **Nada sale de local:** sin push ni PR y sin aplicar migraciones a producción hasta el lanzamiento conjunto de fin de semana (decisión de Fermín, 14 oct).
- Rama `feat/giros-pantallas`, cortada de `feat/giros-nucleo`, en el mismo worktree `../vim-pos-giros`.
- **Solo VIM cambia los módulos.** El admin solo los muestra; no hay interruptores para el dueño.
- **Una llave ausente cuenta como encendida, salvo `eventos`, que cuenta como apagada.** Así una caja vieja o un dato que todavía no llega muestra lo de siempre, y el bloque de evento no aparece de golpe en negocios que no son food truck.
- Un acceso de la caja con cuentas abiertas se sigue viendo aunque su módulo esté apagado (spec §6.4), hasta que se cierren.
- `cambiar_giro` sigue rechazando BAR, CAFETERIA y TAQUERIA para negocios que ya existen (`GIRO_NO_DISPONIBLE`, ADR 0034). Un negocio **nuevo** sí puede nacer con esos giros, porque su caja se instala con la versión que ya los conoce.
- Texto para el dueño en español llano, sin jerga (reglas del sitio y de las notas de versión).
- Los estilos salen de `docs/diseno/` y `tokens.css`; no se inventan. Antes de escribir CSS, cargar las skills de Emil Kowalski (memoria del proyecto).
- No usar `next build` para verificar (rompe el dev server): `tsc --noEmit` / `pnpm typecheck`.

## Decisiones de Fermín que cambian el spec (14 oct)

| Tema | Decisión | Efecto |
|---|---|---|
| Propina inicial por giro | **Se quita.** Todos arrancan con propina sugerida, como hoy; el dueño la apaga en Configuración → Propinas | La sincronización de `sucursal_propinas_config` a la caja (hoy nunca llega) va en una tarea aparte |
| Cobro antes o después de cocina | **Se queda como hoy, por tipo de cuenta** (mesa al final, mostrador al pedir) | `politica_cobro_cocina` no se fija en el alta; `cobro_inicial_de_giro` se borra de la 0180, que no se ha aplicado en ningún lado |

## Hallazgos del código que ajustan el spec

- **"Dividir cuenta" no existe en la caja.** Lo que hay es "Combinar formas de pago" (`modal-cobro.tsx:292`), que sirve en cualquier giro. Se queda visible siempre.
- **No hay botón de "asignar mesero":** se asigna solo al abrir mesa (`home-pos.tsx:885`). Con `meseros` apagado se esconden "Mis propinas" (caja) y "Ventas por mesero" (admin).
- **La primera vez no tiene un paso de mesas** (`apps/admin/app/lib/onboarding.ts:72`): no hay nada que saltar.
- **"Estaciones de preparación" no se esconde con `kds` apagado:** las estaciones también reparten la impresión de comandas (Knock-Out no tiene pantalla de cocina y sí comandas). Solo se esconde el acceso "Cocina" de la caja.
- **"Cuentas en barra" no se muestra** en ningún catálogo de pantalla hasta la entrega 3; la llave existe en la base.
- **El bloque de evento hoy solo lo ve FOODTRUCK.** La 0180 dejó `eventos` encendido para todos; la 0181 lo apaga a los negocios existentes que no son food truck y cambia el valor por defecto de la columna a "todo encendido salvo eventos". Lo segundo hace falta porque la semilla de desarrollo y los smokes crean negocios *después* de las migraciones, y el `UPDATE` no los alcanza.

## Review Focus

1. **Un negocio que ya existe, con todo encendido, ve exactamente lo de hoy** en caja, admin y reportes, incluido que el bloque de evento solo sale a FOODTRUCK. Pruebas en las Tareas 1, 3 y 4.
2. **Mientras los módulos cargan** (`modulos = {}` en la caja, `null` en el admin) no desaparece ni aparece nada que luego se corrija. Pruebas en las Tareas 2 y 4.
3. **Apagar Comedor con mesas abiertas en la caja** deja el acceso visible con su contador. Prueba en la Tarea 3.
4. **Respuestas de rechazo de la base en /platform** (dependencia faltante, cuentas abiertas, giro no disponible, giro retirado) llegan al operador como texto entendible y con estado 409/400, y nunca como 500 opaco. Prueba en la Tarea 6.
5. **El registro con un giro retirado o desconocido** (`CAFE_BAR`, `ENTERPRISE`, un formulario viejo en caché) se rechaza con `VERTICAL_INVALIDA` sin crear la cuenta. Prueba en la Tarea 7.

## Archivos

- Crear: `packages/db/src/operacion.ts` (+ export `./operacion` en `packages/db/package.json`).
- Crear: `supabase/migrations/0181_alta_por_giro.sql`.
- Modificar: `supabase/migrations/0180_modulos_de_operacion.sql` (quitar `cobro_inicial_de_giro`), `supabase/scripts/smoke_giros_operacion.sql`, `packages/db/src/database.types.ts`.
- Caja: crear `apps/pos/app/lib/accesos-inicio.ts` (+ prueba); modificar `pantalla-inicio.tsx`, `menu-general.tsx`, `abrir-turno.tsx`, `pantalla-turno.tsx`, `home-pos.tsx`, `lib/turno.ts`.
- Admin: crear `apps/admin/app/lib/operacion.ts` (+ prueba) y `apps/admin/app/(panel)/configuracion/operacion/page.tsx`; modificar `admin-shell.tsx`, `config-sidenav.tsx`, `(panel)/configuracion/layout.tsx`, `(panel)/configuracion/negocio/page.tsx`, `(panel)/usuarios/page.tsx`, `(panel)/reportes/page.tsx`, `lib/reportes.ts`.
- Platform: crear `apps/platform/app/components/operacion-giro.tsx` y `apps/platform/app/lib/__tests__/rutas-operacion.test.ts`; modificar `api/tenants/[id]/route.ts`, `clientes/[id]/page.tsx`, `lib/formato.ts`.
- Registro: modificar `supabase/functions/_shared/alta.ts` (+ `alta.test.ts`), `apps/admin/app/registro/page.tsx`, `supabase/functions/provisionar-tenant/index.ts`, `supabase/functions/solicitar-demo/index.ts`.
- Docs: spec y ADR 0034.

---

### Task 0: Rama y dependencias

- [ ] **Step 1: Rama**

La rama ya existe (se creó al escribir este plan, desde `feat/giros-nucleo`):

```bash
cd ../vim-pos-giros
git switch feat/giros-pantallas
git log --oneline -1   # docs(giros): plan de la entrega 2
```

- [ ] **Step 2: Dependencias del monorepo en el worktree** (las pruebas de Vitest y `tsc` las necesitan; el worktree solo tiene las de `desktop/`)

Run: `pnpm install --frozen-lockfile`
Esperado: termina sin errores. Si Norton rompe TLS, reintentar; no cambiar el lockfile.

- [ ] **Step 3: Línea base**

Run: `pnpm --filter @vim/pos test && pnpm --filter @vim/admin test && pnpm --filter @vim/platform test && pnpm test:functions`
Esperado: todo en verde. Anotar en el ledger cualquier rojo previo (por ejemplo, `device-creds.test.ts` cuando corre en paralelo; ver memoria) para no confundirlo con una regresión.

---

### Task 1: Base de datos — el alta aplica el giro y nadie pierde lo que veía

**Files:**
- Modify: `supabase/migrations/0180_modulos_de_operacion.sql` (quitar `cobro_inicial_de_giro`)
- Create: `supabase/migrations/0181_alta_por_giro.sql`
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (bloques 2b, 2c y 5)
- Modify: `packages/db/src/database.types.ts` (quitar `cobro_inicial_de_giro`)

**Interfaces:**
- Produces: `crear_tenant_con_owner(...)` con la firma de la 0141, que ahora deja `tenants.operacion = juego_inicial_de_giro(p_vertical)`. Los negocios existentes que no son FOODTRUCK quedan con `eventos = false`.

- [ ] **Step 1: Ajustar el smoke (RED)**

En `smoke_giros_operacion.sql`:

a) Quitar el bloque 2b completo (desde `IF cobro_inicial_de_giro('FULL_SERVICE')` hasta `RAISE NOTICE '2b cobro inicial OK';`).

b) Reemplazar el chequeo 2c por:

```sql
  -- Cliente existente (semilla, QUICK_SERVICE): lo mismo que veía antes. Todo encendido salvo
  -- eventos, que antes solo salía a FOODTRUCK (0181).
  SELECT operacion INTO v_op FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa';
  IF v_op IS DISTINCT FROM v_todo || '{"eventos":false}'::jsonb THEN
    RAISE EXCEPTION '2c: el cliente existente debía ver lo de siempre: %', v_op;
  END IF;
  RAISE NOTICE '2c cliente existente intacto OK';
```

c) Reemplazar el bloque 5 completo por:

```sql
-- 5) El alta aplica el juego del giro (0181); la política de cobro no se toca (sigue por tipo de cuenta).
DO $$
DECLARE
  v_owner uuid; v_tenant uuid; v_giro text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  FOREACH v_giro IN ARRAY ARRAY['FOODTRUCK', 'BAR', 'TAQUERIA'] LOOP
    v_owner := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
            now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    v_tenant := crear_tenant_con_owner(v_owner, 'smoke-giro-' || substr(v_owner::text, 1, 8), 'Giro Smoke', 'Dueño Smoke',
                                       '4770000000', v_giro::vertical_tipo, 'ESENCIAL', 'TRIAL'::tenant_estado, 'smoke 0181');
    IF (SELECT operacion FROM tenants WHERE id = v_tenant) IS DISTINCT FROM juego_inicial_de_giro(v_giro::vertical_tipo) THEN
      RAISE EXCEPTION '5a: el alta de % no aplicó su juego: %', v_giro, (SELECT operacion FROM tenants WHERE id = v_tenant);
    END IF;
  END LOOP;
  RAISE NOTICE '5a alta por giro OK (incluidos giros nuevos para negocios nuevos)';
END $$;
```

Run: `npm --prefix desktop run smokes -- smoke_giros_operacion.sql`
Esperado: `❌` con `2c: el cliente existente debía ver lo de siempre`.

- [ ] **Step 2: Quitar `cobro_inicial_de_giro` de la 0180**

Borrar de `0180_modulos_de_operacion.sql` el bloque `CREATE OR REPLACE FUNCTION cobro_inicial_de_giro ... COMMENT ON FUNCTION cobro_inicial_de_giro ...;`. La 0180 no se ha aplicado en ningún entorno (rama local), así que se edita. En `database.types.ts` borrar la entrada `cobro_inicial_de_giro: { ... }`.

- [ ] **Step 3: La 0181**

`supabase/migrations/0181_alta_por_giro.sql`:

```sql
-- El alta aplica el juego del giro, y los negocios que ya existían ven exactamente lo de antes
-- (spec 2026-10-14-giros-y-modulos-de-operacion-design.md §6.3, ADR 0034; entrega 2).
--
-- Va junto con las pantallas que obedecen los módulos: aplicar el juego antes habría hecho que un
-- negocio registrado en el hueco perdiera pantallas de golpe. La política de cobro NO se fija:
-- la caja decide por tipo de cuenta (mesa al final, mostrador al pedir), decisión de Fermín 14 oct.

-- Antes de la 0180 el bloque de evento solo salía a FOODTRUCK (abrir-turno.tsx). La 0180 dejó
-- `eventos` encendido para todos; aquí se apaga a los demás para que ninguna caja cambie. El
-- default cambia también: un negocio que no nace por el alta (semilla, scripts) ve lo de siempre.
ALTER TABLE tenants ALTER COLUMN operacion SET DEFAULT (juego_inicial_de_giro(NULL) || '{"eventos":false}'::jsonb);
UPDATE tenants SET operacion = operacion || '{"eventos":false}'::jsonb
 WHERE vertical_principal::text <> 'FOODTRUCK';

-- Cuerpo de la 0141 más el bloque marcado 0181.
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_estado           tenant_estado,
  p_notas_internas   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_plan   uuid;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Unidades de medida (0085). */
  PERFORM sembrar_unidades_base(v_tenant);

  /* Lo que el plan incluye (0086 → 0141). En el alta no hay nada que retirar. */
  SELECT id INTO v_plan FROM planes WHERE codigo = p_plan_codigo;
  IF v_plan IS NOT NULL THEN
    PERFORM public._sincronizar_addons_del_plan(v_tenant, v_plan, false);
  END IF;

  /* 0181: los módulos de operación con que arranca su giro. */
  UPDATE tenants SET operacion = juego_inicial_de_giro(p_vertical) WHERE id = v_tenant;

  RETURN v_tenant;
END;
$$;
COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base, siembra unidades de medida (0085), los add-ons que el plan incluye (0086, 0141) y los módulos de operación de su giro (0181).';
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;
```

- [ ] **Step 4: GREEN y vecinos**

Run: `npm --prefix desktop run smokes -- smoke_giros_operacion.sql smoke_provisioning.sql smoke_cobro_plan.sql smoke_tienda_salida.sql`
Esperado: 4/4 en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0180_modulos_de_operacion.sql supabase/migrations/0181_alta_por_giro.sql supabase/scripts/smoke_giros_operacion.sql packages/db/src/database.types.ts
git commit -m "feat(giros): el alta aplica el juego del giro y nadie pierde lo que veía"
```

---

### Task 2: Catálogo compartido `@vim/db/operacion`

**Files:**
- Create: `packages/db/src/operacion.ts`
- Modify: `packages/db/package.json` (export `"./operacion": "./src/operacion.ts"`)
- Test: `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts`

**Interfaces:**
- Produces:
  - `type CodigoGiro`; `GIROS: readonly { codigo: CodigoGiro; nombre: string; ofrecido: boolean }[]`; `nombreGiro(codigo: string | null | undefined): string`.
  - `type CodigoOperacion = "mostrador" | "comedor" | "meseros" | "domicilio" | "repartidores" | "kds" | "reservaciones" | "marcas" | "eventos" | "cuentas_barra"`.
  - `OPERACION: readonly { codigo: CodigoOperacion; nombre: string; descripcion: string; requiere?: CodigoOperacion }[]`, con nueve módulos (sin `cuentas_barra` hasta la entrega 3).
  - `moduloActivo(modulos: Record<string, boolean> | null | undefined, codigo: CodigoOperacion): boolean`.

- [ ] **Step 1: La prueba (RED)**

`apps/admin/app/lib/__tests__/operacion-catalogo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GIROS, OPERACION, moduloActivo, nombreGiro } from "@vim/db/operacion";

describe("moduloActivo", () => {
  it("lo que dice la base manda", () => {
    expect(moduloActivo({ comedor: false }, "comedor")).toBe(false);
    expect(moduloActivo({ eventos: true }, "eventos")).toBe(true);
  });
  it("una llave ausente (caja vieja, todavía cargando) se ve como siempre: encendida", () => {
    for (const m of [undefined, null, {}]) {
      expect(moduloActivo(m, "comedor")).toBe(true);
      expect(moduloActivo(m, "kds")).toBe(true);
    }
  });
  it("salvo eventos: ausente es apagado, como antes de los giros (solo food truck lo veía)", () => {
    expect(moduloActivo({}, "eventos")).toBe(false);
    expect(moduloActivo(null, "eventos")).toBe(false);
  });
});

describe("catálogo", () => {
  it("los siete giros que se ofrecen, y los retirados con nombre para leer datos viejos", () => {
    expect(GIROS.filter((g) => g.ofrecido).map((g) => g.codigo)).toEqual(
      ["QUICK_SERVICE", "FULL_SERVICE", "TAQUERIA", "CAFETERIA", "BAR", "DARK_KITCHEN", "FOODTRUCK"]);
    expect(nombreGiro("CAFE_BAR")).toBe("Cafetería o bar");
    expect(nombreGiro("TAQUERIA")).toBe("Taquería o cocina económica");
    expect(nombreGiro("NUEVO_RARO")).toBe("NUEVO_RARO");
    expect(nombreGiro(null)).toBe("—");
  });
  it("nueve módulos visibles; cuentas en barra llega en la entrega 3", () => {
    expect(OPERACION.map((m) => m.codigo)).toEqual(
      ["mostrador", "comedor", "meseros", "domicilio", "repartidores", "kds", "reservaciones", "marcas", "eventos"]);
    expect(OPERACION.find((m) => m.codigo === "meseros")?.requiere).toBe("comedor");
    expect(OPERACION.find((m) => m.codigo === "repartidores")?.requiere).toBe("domicilio");
  });
});
```

Run: `pnpm --filter @vim/admin test -- operacion-catalogo`
Esperado: FAIL, `Failed to resolve import "@vim/db/operacion"`.

- [ ] **Step 2: El catálogo**

`packages/db/src/operacion.ts`:

```ts
/**
 * Giros y módulos de operación (ADR 0034). La tabla de qué módulos arranca cada giro vive en la
 * base (`juego_inicial_de_giro`, 0180); aquí solo están los nombres que ven el dueño y VIM, y la
 * regla para leer un módulo que todavía no llegó.
 */
export type CodigoGiro =
  | "QUICK_SERVICE" | "FULL_SERVICE" | "TAQUERIA" | "CAFETERIA" | "BAR" | "DARK_KITCHEN" | "FOODTRUCK"
  | "CAFE_BAR" | "ENTERPRISE";

export const GIROS: readonly { codigo: CodigoGiro; nombre: string; ofrecido: boolean }[] = [
  { codigo: "QUICK_SERVICE", nombre: "Comida rápida", ofrecido: true },
  { codigo: "FULL_SERVICE", nombre: "Restaurante con meseros", ofrecido: true },
  { codigo: "TAQUERIA", nombre: "Taquería o cocina económica", ofrecido: true },
  { codigo: "CAFETERIA", nombre: "Cafetería", ofrecido: true },
  { codigo: "BAR", nombre: "Bar", ofrecido: true },
  { codigo: "DARK_KITCHEN", nombre: "Cocina solo para apps", ofrecido: true },
  { codigo: "FOODTRUCK", nombre: "Food truck", ofrecido: true },
  // Retirados: se quedan para nombrar a quien ya los tiene.
  { codigo: "CAFE_BAR", nombre: "Cafetería o bar", ofrecido: false },
  { codigo: "ENTERPRISE", nombre: "Cadena", ofrecido: false },
];

export const nombreGiro = (codigo: string | null | undefined): string =>
  GIROS.find((g) => g.codigo === codigo)?.nombre ?? codigo ?? "—";

export type CodigoOperacion =
  | "mostrador" | "comedor" | "meseros" | "domicilio" | "repartidores"
  | "kds" | "reservaciones" | "marcas" | "eventos" | "cuentas_barra";

/** Lo que se enseña en el admin y en /platform. `cuentas_barra` entra con la entrega 3. */
export const OPERACION: readonly { codigo: CodigoOperacion; nombre: string; descripcion: string; requiere?: CodigoOperacion }[] = [
  { codigo: "mostrador", nombre: "Mostrador", descripcion: "Para llevar y Pick-up en la caja." },
  { codigo: "comedor", nombre: "Comedor", descripcion: "Mesas, mapa y cuentas abiertas por mesa." },
  { codigo: "meseros", nombre: "Meseros", descripcion: "Mesero por mesa, sus propinas y el reporte por mesero.", requiere: "comedor" },
  { codigo: "domicilio", nombre: "Domicilio", descripcion: "Pedidos a domicilio propios y zonas de envío." },
  { codigo: "repartidores", nombre: "Repartidores", descripcion: "Asignar cada pedido a uno de tus repartidores.", requiere: "domicilio" },
  { codigo: "kds", nombre: "Pantalla de cocina", descripcion: "Las comandas en pantalla, por estación." },
  { codigo: "reservaciones", nombre: "Reservaciones", descripcion: "Mesas reservadas visibles desde la caja." },
  { codigo: "marcas", nombre: "Marcas virtuales", descripcion: "Varias marcas desde la misma cocina." },
  { codigo: "eventos", nombre: "Eventos", descripcion: "Abrir el turno en una feria o un evento." },
];

/**
 * ¿Está encendido? Lo que diga la base manda. Si la llave no llegó (caja con directivas viejas,
 * todavía cargando) se enseña lo de siempre: todo, menos el bloque de evento, que antes de los
 * giros solo veía un food truck.
 */
export function moduloActivo(modulos: Record<string, boolean> | null | undefined, codigo: CodigoOperacion): boolean {
  const v = modulos?.[codigo];
  return typeof v === "boolean" ? v : codigo !== "eventos";
}
```

En `packages/db/package.json`, dentro de `exports`, después de `"./registro"`:

```json
    "./registro": "./src/registro.ts",
    "./operacion": "./src/operacion.ts"
```

- [ ] **Step 3: GREEN**

Run: `pnpm --filter @vim/admin test -- operacion-catalogo`
Esperado: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/operacion.ts packages/db/package.json apps/admin/app/lib/__tests__/operacion-catalogo.test.ts
git commit -m "feat(giros): catálogo compartido de giros y módulos de operación"
```

---

### Task 3: La caja obedece los módulos

**Files:**
- Create: `apps/pos/app/lib/accesos-inicio.ts`, `apps/pos/app/lib/__tests__/accesos-inicio.test.ts`
- Modify: `apps/pos/app/components/pantalla-inicio.tsx:192-201`, `menu-general.tsx:117-141`, `abrir-turno.tsx:29-46`, `pantalla-turno.tsx:143`, `home-pos.tsx:2270` y `:2407`, `lib/turno.ts:46-72`

**Interfaces:**
- Consumes: `moduloActivo` (Tarea 2); `useAcceso().modulos` (`banda-acceso.tsx`, `{}` mientras carga).
- Produces: `accesosInicio(modulos: Record<string, boolean> | null | undefined, cuentas: { comedor: number; pickup: number; domicilio: number }): { comedor: boolean; paraLlevar: boolean; pickup: boolean; domicilio: boolean }`.

- [ ] **Step 1: La prueba (RED)**

`apps/pos/app/lib/__tests__/accesos-inicio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accesosInicio } from "../accesos-inicio";

const SIN = { comedor: 0, pickup: 0, domicilio: 0 };

describe("accesosInicio", () => {
  it("cargando o caja vieja ({}): los cuatro, como siempre", () => {
    expect(accesosInicio({}, SIN)).toEqual({ comedor: true, paraLlevar: true, pickup: true, domicilio: true });
  });
  it("food truck: sin comedor ni domicilio", () => {
    const m = { mostrador: true, comedor: false, domicilio: false };
    expect(accesosInicio(m, SIN)).toEqual({ comedor: false, paraLlevar: true, pickup: true, domicilio: false });
  });
  it("mostrador apagado esconde Para llevar y Pick-up", () => {
    const r = accesosInicio({ mostrador: false }, SIN);
    expect([r.paraLlevar, r.pickup]).toEqual([false, false]);
  });
  it("con cuentas abiertas el acceso se queda aunque el módulo se haya apagado (spec §6.4)", () => {
    const m = { comedor: false, mostrador: false, domicilio: false };
    expect(accesosInicio(m, { comedor: 2, pickup: 1, domicilio: 3 })).toEqual(
      { comedor: true, paraLlevar: false, pickup: true, domicilio: true });
  });
});
```

Run: `pnpm --filter @vim/pos test -- accesos-inicio`
Esperado: FAIL, no encuentra `../accesos-inicio`.

- [ ] **Step 2: El cálculo**

`apps/pos/app/lib/accesos-inicio.ts`:

```ts
import { moduloActivo } from "@vim/db/operacion";

/**
 * Qué accesos enseña el inicio de la caja según los módulos de operación (ADR 0034). Un acceso con
 * cuentas abiertas se queda aunque su módulo se haya apagado: hay que poder terminarlas (spec §6.4).
 * Para llevar no tiene contador: es venta directa.
 */
export function accesosInicio(
  modulos: Record<string, boolean> | null | undefined,
  cuentas: { comedor: number; pickup: number; domicilio: number },
): { comedor: boolean; paraLlevar: boolean; pickup: boolean; domicilio: boolean } {
  const mostrador = moduloActivo(modulos, "mostrador");
  return {
    comedor: moduloActivo(modulos, "comedor") || cuentas.comedor > 0,
    paraLlevar: mostrador,
    pickup: mostrador || cuentas.pickup > 0,
    domicilio: moduloActivo(modulos, "domicilio") || cuentas.domicilio > 0,
  };
}
```

Run: `pnpm --filter @vim/pos test -- accesos-inicio`
Esperado: PASS.

- [ ] **Step 3: El inicio** (`pantalla-inicio.tsx`, que ya tiene `const acceso = useAcceso();` en la línea 124 y sirve a `home-pos` y a `pantalla-turno`)

Agregar el import:

```ts
import { accesosInicio } from "../lib/accesos-inicio";
```

Después de `const acceso = useAcceso();`:

```ts
  const ver = accesosInicio(acceso.modulos, { comedor: nCuentasComedor, pickup: nCuentasPickup, domicilio: nCuentasDomicilio });
```

Y la barra (líneas 192-199) queda:

```tsx
        {ver.comedor && (
          <Acceso label="Comedor" badge={nCuentasComedor} onClick={onComedor} requiereTurno={sinTurno}
            icon={<Icono nombre="mesa" />} />
        )}
        {ver.paraLlevar && (
          <Acceso label="Para llevar" onClick={onParaLlevar} requiereTurno={sinTurno} destacado
            icon={<Icono nombre="para-llevar" />} />
        )}
        {ver.pickup && (
          <Acceso label="Pick-up" badge={nCuentasPickup} onClick={onPickup} requiereTurno={sinTurno}
            icon={<Icono nombre="bolsa" />} />
        )}
        {ver.domicilio && (
          <Acceso label="Domicilio" badge={nCuentasDomicilio} onClick={onDomicilio} requiereTurno={sinTurno}
            icon={<Icono nombre="moto" />} />
        )}
```

- [ ] **Step 4: El menú general** (`menu-general.tsx`)

Imports:

```ts
import { moduloActivo } from "@vim/db/operacion";
import { useAcceso } from "./banda-acceso";
```

Al inicio del cuerpo del componente: `const { modulos } = useAcceso();`. Cambiar las condiciones de las líneas 117 y 140:

```tsx
            {onKds && moduloActivo(modulos, "kds") && (
```

```tsx
            {onMisPropinas && moduloActivo(modulos, "meseros") && (
```

(La condición del bloque en la línea 115 se deja: si la única tarjeta era Cocina y se esconde, queda el resto del bloque, que lleva Devoluciones, Corte X, etc.)

- [ ] **Step 5: El bloque de evento** (`abrir-turno.tsx`)

Quitar el prop `vertical` (líneas 22 y 29-30) y reemplazar la línea 46:

```ts
  /* El bloque de evento lo enciende VIM con el módulo `eventos` (ADR 0034): un camión que hoy
     vende en una feria y mañana en otra. Mientras carga cuenta como apagado: no aparece y desaparece. */
  const { modulos } = useAcceso();
  const ofreceEvento = moduloActivo(modulos, "eventos");
```

con los imports `moduloActivo` de `@vim/db/operacion` y `useAcceso` de `./banda-acceso`. En `pantalla-turno.tsx:143` borrar `vertical={caja.vertical}`. Luego:

```bash
grep -rn "\.vertical\b\|vertical_principal" apps/pos/app --include=*.ts --include=*.tsx
```

Si `DatosCaja.vertical` ya no tiene lectores, quitarlo de `lib/turno.ts` (campo en la línea 46, `vertical_principal` del select de la línea 53 y la línea 72) y de su tipo en la línea 61. Si alguna prueba de `lib/__tests__` lo usa, ajustarla.

- [ ] **Step 6: Reservaciones** (`home-pos.tsx`, ya tiene `modulos` en la línea 195)

Import `moduloActivo` de `@vim/db/operacion`. Línea 2270:

```tsx
        onVerReservaciones={modo === "COMER_AQUI" && moduloActivo(modulos, "reservaciones") ? () => setViendoReservaciones(true) : undefined}
```

Línea 2407:

```tsx
              onVerReservaciones={moduloActivo(modulos, "reservaciones") ? () => setViendoReservaciones(true) : undefined}
```

- [ ] **Step 7: Tipos y pruebas de la caja**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`
Esperado: sin errores; todas en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/pos packages/db
git commit -m "feat(giros): la caja enseña solo los accesos de los módulos encendidos"
```

---

### Task 4: El admin esconde lo que el negocio no usa

**Files:**
- Create: `apps/admin/app/lib/operacion.ts`, `apps/admin/app/lib/__tests__/operacion.test.ts`
- Modify: `components/admin-shell.tsx:316-345`, `components/config-sidenav.tsx`, `(panel)/configuracion/layout.tsx`, `(panel)/usuarios/page.tsx:117-122`, `(panel)/reportes/page.tsx:45,79-91`, `lib/reportes.ts:777-800`

**Interfaces:**
- Consumes: `moduloActivo`, `OPERACION` (Tarea 2); `ModulosLeidos` (`lib/inventario-plan.ts:8`); `useModulos()` (`admin-shell.tsx:30`, `null` cargando, `"error"` si falló).
- Produces:
  - `rutasOcultas(m: ModulosLeidos | "error" | null): ReadonlySet<string>`.
  - `filtrarSecciones<T extends { items: { href: string }[] }>(secciones: readonly T[], ocultas: ReadonlySet<string>): T[]` (quita las secciones que se quedan vacías).
  - `disponiblesDe(ef: Record<string, boolean>, hay: { marcas: boolean; eventos: boolean; reservas: boolean; apps: boolean; sucursales: boolean; movimientos: boolean; meseros: boolean }): ReportesDisponibles` (en `lib/reportes.ts`).

- [ ] **Step 1: La prueba (RED)**

`apps/admin/app/lib/__tests__/operacion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filtrarSecciones, rutasOcultas } from "../operacion";
import { disponiblesDe } from "../reportes";

const con = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });

describe("rutasOcultas", () => {
  it("cargando o con error no esconde nada (esconder de más y luego mostrar salta a la vista)", () => {
    expect(rutasOcultas(null).size).toBe(0);
    expect(rutasOcultas("error").size).toBe(0);
  });
  it("un negocio de siempre (todo encendido o sin llaves) ve todo", () => {
    expect(rutasOcultas(con({})).size).toBe(0);
  });
  it("food truck: sin mesas, envíos, repartidores, reservaciones, marcas ni reporte de meseros", () => {
    const m = con({ comedor: false, meseros: false, domicilio: false, repartidores: false, reservaciones: false, marcas: false });
    expect([...rutasOcultas(m)].sort()).toEqual([
      "/configuracion/envios", "/configuracion/marcas", "/configuracion/mesas",
      "/reportes/ventas-mesero", "/reservaciones", "/usuarios/repartidores",
    ]);
  });
  it("las estaciones no se esconden sin pantalla de cocina: reparten las comandas impresas", () => {
    expect(rutasOcultas(con({ kds: false })).has("/configuracion/areas")).toBe(false);
  });
});

describe("filtrarSecciones", () => {
  it("quita los items ocultos y las secciones que se quedan vacías", () => {
    const s = [{ titulo: "A", items: [{ href: "/x" }, { href: "/y" }] }, { titulo: "B", items: [{ href: "/z" }] }];
    expect(filtrarSecciones(s, new Set(["/y", "/z"]))).toEqual([{ titulo: "A", items: [{ href: "/x" }] }]);
  });
});

describe("disponiblesDe — ventas por mesero", () => {
  const hay = { marcas: false, eventos: false, reservas: false, apps: false, sucursales: false, movimientos: false, meseros: false };
  it("se ve con el módulo encendido (o sin la llave) aunque aún no haya datos", () => {
    expect(disponiblesDe({}, hay).meseros).toBe(true);
  });
  it("apagado y sin historial, no se ve; con historial sí (no se le esconde a nadie su historia)", () => {
    expect(disponiblesDe({ meseros: false }, hay).meseros).toBe(false);
    expect(disponiblesDe({ meseros: false }, { ...hay, meseros: true }).meseros).toBe(true);
  });
});
```

Run: `pnpm --filter @vim/admin test -- lib/__tests__/operacion.test.ts`
Esperado: FAIL, no encuentra `../operacion`.

- [ ] **Step 2: La lógica**

`apps/admin/app/lib/operacion.ts`:

```ts
import { moduloActivo, type CodigoOperacion } from "@vim/db/operacion";
import { mensajeAyudaAdmin } from "@vim/db/soporte";
import type { ModulosLeidos } from "./inventario-plan";

/** Pantalla del admin → el módulo de operación que la gobierna (ADR 0034). */
const RUTA_DE_MODULO: readonly [string, CodigoOperacion][] = [
  ["/configuracion/mesas", "comedor"],
  ["/reportes/ventas-mesero", "meseros"],
  ["/configuracion/envios", "domicilio"],
  ["/usuarios/repartidores", "repartidores"],
  ["/reservaciones", "reservaciones"],
  ["/configuracion/marcas", "marcas"],
];

/**
 * Las rutas que este negocio no usa. Mientras carga o si la lectura falló no se esconde nada: un
 * menú que se encoge un segundo después de abrir salta a la vista, y esconder no es un candado
 * (eso lo decide VIM con el módulo, no el admin).
 */
export function rutasOcultas(m: ModulosLeidos | "error" | null): ReadonlySet<string> {
  if (m === null || m === "error") return new Set();
  return new Set(RUTA_DE_MODULO.filter(([, codigo]) => !moduloActivo(m.efectivos, codigo)).map(([ruta]) => ruta));
}

export function filtrarSecciones<T extends { items: { href: string }[] }>(secciones: readonly T[], ocultas: ReadonlySet<string>): T[] {
  return secciones
    .map((s) => ({ ...s, items: s.items.filter((it) => !ocultas.has(it.href)) }))
    .filter((s) => s.items.length > 0);
}

/** El WhatsApp ya escrito para pedir que VIM cambie los módulos. */
export const mensajeCambiarModulos = (d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string =>
  mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero cambiar lo que mi negocio usa en VIM POS.");
```

En `lib/reportes.ts`:
- Agregar `meseros: boolean` al tipo `ReportesDisponibles`.
- Agregar al `Promise.all` de `leerReportesDisponibles` la consulta `hay(supabase.from("vw_ventas_por_mesero").select("mesero_id", { count: "exact", head: true }))` como séptimo valor (`meseroDatos`).
- Reemplazar el `return { ... }` por `return disponiblesDe(modulos?.efectivos ?? {}, { marcas, eventos, reservas, apps, sucursales: !!sucursales.error || (sucursales.count ?? 0) > 1, movimientos, meseros: meseroDatos });`.
- Agregar la función pura, con import `moduloActivo` de `@vim/db/operacion`:

```ts
/** Qué reportes se enseñan: el módulo encendido O que ya haya datos. Pura para poder probarla. */
export function disponiblesDe(
  ef: Record<string, boolean>,
  hay: { marcas: boolean; eventos: boolean; reservas: boolean; apps: boolean; sucursales: boolean; movimientos: boolean; meseros: boolean },
): ReportesDisponibles {
  return {
    marcas: hay.marcas,
    eventos: hay.eventos,
    reservaciones: hay.reservas || !!ef.reservaciones,
    apps: hay.apps || !!ef.delivery_apps,
    variasSucursales: hay.sucursales,
    inventario: hay.movimientos || !!ef.recetas,
    meseros: hay.meseros || moduloActivo(ef, "meseros"),
  };
}
```

> Confirmar que `vw_ventas_por_mesero` tiene la columna `mesero_id`, con `grep -n "vw_ventas_por_mesero" -A15 supabase/migrations/*.sql | head -30`. Si se llama distinto, usar el nombre real en el `select`.

Run: `pnpm --filter @vim/admin test -- lib/__tests__/operacion.test.ts`
Esperado: PASS.

- [ ] **Step 3: Conectar las pantallas**

- `(panel)/reportes/page.tsx`:
  - En la línea 45 agregar `modulo: "meseros"` al reporte "Ventas por mesero".
  - Sumar `"meseros"` a la unión de `Reporte["modulo"]` (donde se define el tipo, en la parte alta del archivo).
  - En el `.catch` de la línea 82, el objeto de respaldo gana `meseros: true`.
- `components/admin-shell.tsx`:
  - Importar `filtrarSecciones, rutasOcultas` de `../lib/operacion`.
  - Junto a `sinInventario` (línea 258): `const navVisible = filtrarSecciones(NAV, rutasOcultas(modulos));`.
  - Donde se recorre `NAV.map(` para pintar el menú, usar `navVisible.map(`.
- `(panel)/usuarios/page.tsx`: envolver el `<Link href="/usuarios/repartidores" ...>Repartidores</Link>` (líneas 117-122) en `{!rutasOcultas(modulos).has("/usuarios/repartidores") && ( ... )}`, con `const modulos = useModulos();` (import de `../../components/admin-shell`) y `rutasOcultas` de `../../lib/operacion`.
- `(panel)/configuracion/layout.tsx`: deja de leer módulos por su cuenta y usa el contexto:

```tsx
"use client";
import { ConfigSideNav } from "../../components/config-sidenav";
import { useModulos } from "../../components/admin-shell";
import { rutasOcultas } from "../../lib/operacion";

/**
 * Layout interno de Configuración. Esconde lo que este negocio no usa (ADR 0034) y "Apps de
 * delivery" mientras VIM no le conceda el add-on (ADR 0014). Mientras carga, delivery se esconde
 * (esconder de más es recuperable) y lo de operación se enseña (lo de siempre).
 */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const m = useModulos();
  const ocultas = new Set(rutasOcultas(m));
  const permitidoDelivery = m !== null && m !== "error" && m.permitidos.delivery_apps === true;
  if (!permitidoDelivery) ocultas.add("/configuracion/integraciones");
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <ConfigSideNav ocultas={ocultas} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
```

> Antes de esto, confirmar que el layout de Configuración se pinta dentro del `ModulosCtx.Provider` de `admin-shell.tsx`, como ya lo hacen `lealtad/layout.tsx` y `tienda/layout.tsx`. Si no lo está, mantener `leerModulos()` en el layout y calcular `ocultas` con su resultado.

- `components/config-sidenav.tsx`:
  - Cambiar la firma a `ConfigSideNav({ ocultas }: { ocultas: ReadonlySet<string> })`.
  - Borrar `seccionesPara` y usar `const secciones = filtrarSecciones(SECCIONES_BASE, ocultas);` (import de `../lib/operacion`).
  - Agregar en "Negocio", después de "Datos del negocio", `{ label: "Cómo vende tu negocio", href: "/configuracion/operacion" }`.
  - Actualizar el comentario: ya no es "la única entrada gobernada por un módulo".

- [ ] **Step 4: Tipos y pruebas del admin**

Run: `pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test`
Esperado: sin errores; todas en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat(giros): el admin esconde lo que el negocio no usa"
```

---

### Task 5: Admin — «Cómo vende tu negocio» y el giro en Datos del negocio

**Files:**
- Create: `apps/admin/app/(panel)/configuracion/operacion/page.tsx`
- Modify: `apps/admin/app/(panel)/configuracion/negocio/page.tsx:18-25,98-101`
- Test: `apps/admin/app/lib/__tests__/operacion.test.ts` (el mensaje de WhatsApp)

**Interfaces:**
- Consumes: `OPERACION`, `moduloActivo`, `nombreGiro` (Tarea 2); `mensajeCambiarModulos` (Tarea 4); `leerNegocio` (`lib/configuracion.ts`, trae `vertical_principal`); `leerAyuda` (`lib/soporte.ts`); `enlaceWhatsapp` (`@vim/db/soporte`); `useModulos`; `PageHeader` y `PageBody`.

- [ ] **Step 1: La prueba del mensaje (RED)**

Agregar a `operacion.test.ts`:

```ts
import { mensajeCambiarModulos } from "../operacion";

describe("mensajeCambiarModulos", () => {
  it("dice quién es y qué pide", () => {
    const t = mensajeCambiarModulos({ usuario: "Ana", negocio: "Tacos Ana", codigo: "tacos-ana" });
    expect(t).toMatch(/Tacos Ana/);
    expect(t).toMatch(/Quiero cambiar lo que mi negocio usa en VIM POS\.$/);
  });
});
```

Run: `pnpm --filter @vim/admin test -- lib/__tests__/operacion.test.ts`
Esperado: PASS si la Tarea 4 ya trajo `mensajeCambiarModulos`. Si pasa a la primera, anotar en el ledger que el RED de esta función ocurrió en la Tarea 4, no aquí.

- [ ] **Step 2: La página**

Cargar primero las skills de Emil Kowalski y leer `docs/diseno/` (admin). Copiar la estructura de tarjeta y chip de `(panel)/configuracion/negocio/page.tsx` y de la invitación de `lealtad`; no inventar estilos.

`apps/admin/app/(panel)/configuracion/operacion/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { OPERACION, moduloActivo, nombreGiro } from "@vim/db/operacion";
import { enlaceWhatsapp } from "@vim/db/soporte";
import { PageHeader, PageBody } from "../../../components/page-header";
import { useModulos, usePerfil } from "../../../components/admin-shell";
import { leerNegocio } from "../../../lib/configuracion";
import { leerAyuda, type AyudaAdmin } from "../../../lib/soporte";
import { mensajeCambiarModulos } from "../../../lib/operacion";

/**
 * Lo que este negocio usa en VIM POS (ADR 0034). Solo se consulta: los módulos los ajusta VIM a
 * petición del dueño, por WhatsApp.
 */
export default function OperacionPage() {
  const m = useModulos();
  const perfil = usePerfil();
  const [giro, setGiro] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState<AyudaAdmin | null>(null);
  useEffect(() => {
    leerNegocio().then((n) => setGiro(n?.vertical_principal ?? null)).catch(() => {});
    leerAyuda().then(setAyuda).catch(() => {});
  }, []);
  const efectivos = m && m !== "error" ? m.efectivos : null;
  const wa = ayuda
    ? enlaceWhatsapp(ayuda.soporte.whatsapp, mensajeCambiarModulos({ usuario: perfil?.nombre, negocio: ayuda.negocio, codigo: ayuda.codigo }))
    : null;

  return (
    <>
      <PageHeader titulo="Cómo vende tu negocio" subtitulo="Lo que tu caja y tu panel enseñan, según cómo trabajas."
        migas={[{ label: "Configuración" }, { label: "Cómo vende tu negocio" }]} />
      <PageBody>
        <div className="max-w-[640px]">
          <p className="mb-4 text-14 text-ink-2">Giro: <b className="text-ink">{nombreGiro(giro)}</b></p>
          {m === null ? (
            <p className="text-sm text-ink-3">Cargando…</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {OPERACION.map((mod) => {
                const activo = moduloActivo(efectivos, mod.codigo);
                return (
                  <li key={mod.codigo} className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <div className="text-14 font-semibold text-ink">{mod.nombre}</div>
                      <div className="text-13 text-ink-2">{mod.descripcion}</div>
                    </div>
                    <span className={activo ? "text-13 font-semibold text-success" : "text-13 text-ink-3"}>
                      {activo ? "En uso" : "Apagado"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-13 text-ink-2">
            ¿Necesitas algo que está apagado o quieres quitar algo que no usas?{" "}
            {wa ? <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">Escríbenos por WhatsApp</a> : "Escríbenos por WhatsApp"}
            {" "}y lo ajustamos.
          </p>
        </div>
      </PageBody>
    </>
  );
}
```

> Confirmar que `usePerfil` se exporta desde `admin-shell.tsx` (se usa en `reportes/page.tsx`) y la forma de `leerNegocio()`/`Negocio` en `lib/configuracion.ts:37-47`. Ajustar los imports a lo que exista, sin crear helpers nuevos.

- [ ] **Step 3: Datos del negocio**

En `(panel)/configuracion/negocio/page.tsx`:
- Borrar `VERT_LABEL` (líneas 18-25) e importar `nombreGiro` de `@vim/db/operacion`.
- La etiqueta "Vertical" (línea 98) pasa a "Giro".
- La línea 100 queda `{nombreGiro(neg.vertical_principal)}`.

- [ ] **Step 4: Tipos y pruebas**

Run: `pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test`
Esperado: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat(giros): el dueño ve cómo vende su negocio y pide cambios por WhatsApp"
```

---

### Task 6: /platform — encender, apagar y cambiar de giro

**Files:**
- Modify: `apps/platform/app/api/tenants/[id]/route.ts` (dos ramas nuevas en `PATCH`, antes de la de módulos por excepción)
- Create: `apps/platform/app/lib/__tests__/rutas-operacion.test.ts`
- Create: `apps/platform/app/components/operacion-giro.tsx`
- Modify: `apps/platform/app/clientes/[id]/page.tsx:174`, `apps/platform/app/lib/formato.ts:23-32`

**Interfaces:**
- Consumes: RPC `operacion_cambiar(p_tenant, p_cambios)` → `{operacion, ajustes}` y `cambiar_giro(p_tenant, p_giro, p_reaplicar)` → `{operacion, avisos}` (entrega 1); `auditar` y `motivoDe` de la ruta; `DialogoConfirmar`; `OPERACION`, `GIROS`, `moduloActivo`, `nombreGiro`.
- Produces: acciones de `PATCH /api/tenants/[id]`:
  - `{ accion: "operacion", cambios: Record<string, boolean>, motivo }`.
  - `{ accion: "cambiar_giro", giro: string, reaplicar: boolean, motivo }`.
  - Respuestas: 200 `{ ok, operacion, ajustes | avisos }`; 400 `{ error, detalle }` por entrada mala; 409 `{ error, detalle }` por choque con el estado del negocio.

- [ ] **Step 1: La prueba de la ruta (RED)**

`apps/platform/app/lib/__tests__/rutas-operacion.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

type Llamada = { nombre: string; args: unknown };
let llamadas: Llamada[] = [];
let auditorias: Record<string, unknown>[] = [];
let rpcRespuesta: { data: unknown; error: { message: string } | null };

const sb = {
  from: () => { throw new Error("operación no debe tocar tablas a mano"); },
  rpc: (nombre: string, args: unknown) => { llamadas.push({ nombre, args }); return Promise.resolve(rpcRespuesta); },
};
vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { PATCH } = await import("../../api/tenants/[id]/route");
const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = (body: unknown) => new Request("http://x/api/tenants/t1", { method: "PATCH", body: JSON.stringify(body) });
const MOTIVO = "El food truck ya reparte a domicilio";

beforeEach(() => {
  llamadas = []; auditorias = [];
  rpcRespuesta = { data: { operacion: { domicilio: true }, ajustes: [] }, error: null };
});

describe("operacion", () => {
  it("una llamada a operacion_cambiar y queda en la bitácora", async () => {
    const r = await PATCH(pedir({ accion: "operacion", cambios: { domicilio: true }, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas).toEqual([{ nombre: "operacion_cambiar", args: { p_tenant: "t1", p_cambios: { domicilio: true } } }]);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.operacion", tenantId: "t1", motivo: MOTIVO, payload: { cambios: { domicilio: true } } });
  });
  it("sin motivo o con cambios que no son un objeto, ni llega a la base", async () => {
    expect((await PATCH(pedir({ accion: "operacion", cambios: { domicilio: true } }), ctx)).status).toBe(400);
    expect((await PATCH(pedir({ accion: "operacion", cambios: [true], motivo: MOTIVO }), ctx)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
  it("cuentas abiertas = 409 con cuántas, en palabras", async () => {
    rpcRespuesta = { data: null, error: { message: "CUENTAS_ABIERTAS_COMEDOR: 3" } };
    const r = await PATCH(pedir({ accion: "operacion", cambios: { comedor: false }, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(409);
    const b = await r.json();
    expect(b.error).toBe("CUENTAS_ABIERTAS_COMEDOR");
    expect(b.detalle).toMatch(/3 cuentas de mesa abiertas/);
    expect(auditorias).toHaveLength(0);
  });
  it("dependencia faltante = 409 que dice qué encender primero", async () => {
    rpcRespuesta = { data: null, error: { message: "MESEROS_REQUIERE_COMEDOR" } };
    const b = await (await PATCH(pedir({ accion: "operacion", cambios: { meseros: true }, motivo: MOTIVO }), ctx)).json();
    expect(b.detalle).toMatch(/primero enciende Comedor/);
  });
  it("algo desconocido de la base = 500 con el mensaje", async () => {
    rpcRespuesta = { data: null, error: { message: "boom" } };
    expect((await PATCH(pedir({ accion: "operacion", cambios: { comedor: true }, motivo: MOTIVO }), ctx)).status).toBe(500);
  });
});

describe("cambiar_giro", () => {
  it("una llamada a cambiar_giro y queda en la bitácora con los avisos", async () => {
    rpcRespuesta = { data: { operacion: {}, avisos: ["El comedor sigue encendido porque tiene 1 cuentas abiertas."] }, error: null };
    const r = await PATCH(pedir({ accion: "cambiar_giro", giro: "FOODTRUCK", reaplicar: true, motivo: MOTIVO }), ctx);
    expect(r.status).toBe(200);
    expect(llamadas).toEqual([{ nombre: "cambiar_giro", args: { p_tenant: "t1", p_giro: "FOODTRUCK", p_reaplicar: true } }]);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.cambiar_giro", payload: { giro: "FOODTRUCK", reaplicar: true } });
    expect((await r.json()).avisos).toHaveLength(1);
  });
  it("giro nuevo para un negocio que ya existe = 409 que explica por qué", async () => {
    rpcRespuesta = { data: null, error: { message: "GIRO_NO_DISPONIBLE: BAR" } };
    const b = await (await PATCH(pedir({ accion: "cambiar_giro", giro: "BAR", reaplicar: false, motivo: MOTIVO }), ctx)).json();
    expect(b.error).toBe("GIRO_NO_DISPONIBLE");
    expect(b.detalle).toMatch(/cajas/);
  });
  it("un giro que no está en el catálogo no llega a la base", async () => {
    expect((await PATCH(pedir({ accion: "cambiar_giro", giro: "SUPERMERCADO", reaplicar: false, motivo: MOTIVO }), ctx)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});
```

Run: `pnpm --filter @vim/platform test -- rutas-operacion`
Esperado: FAIL; la ruta todavía no conoce `operacion` y responde con su error de acción desconocida. Si en vez de eso falla con "operación no debe tocar tablas a mano", es porque `PATCH` lee alguna tabla antes de elegir la rama: reemplazar ese `from` por el `tabla()` de `rutas-extras.test.ts` y comprobar las llamadas de otra manera.

- [ ] **Step 2: Las ramas de la ruta**

En `route.ts`, import `GIROS` de `@vim/db/operacion`. Antes de `// ── Módulos por excepción`:

```ts
  // ── Módulos de operación y giro (0180, ADR 0034) ───────────────────────────────────────────
  // Solo VIM los mueve. Las reglas (dependencias, cuentas abiertas, giros que las cajas aún no
  // conocen) viven en la base; aquí se traducen sus rechazos a algo que el operador entienda.
  const RECHAZOS_OPERACION: Record<string, { status: number; texto: (n: string) => string }> = {
    MESEROS_REQUIERE_COMEDOR: { status: 409, texto: () => "Para encender Meseros, primero enciende Comedor." },
    REPARTIDORES_REQUIERE_DOMICILIO: { status: 409, texto: () => "Para encender Repartidores, primero enciende Domicilio." },
    CUENTAS_ABIERTAS_COMEDOR: { status: 409, texto: (n) => `Tiene ${n} cuentas de mesa abiertas. Se puede apagar cuando las cierren.` },
    CUENTAS_ABIERTAS_BARRA: { status: 409, texto: (n) => `Tiene ${n} cuentas en barra abiertas. Se puede apagar cuando las cierren.` },
    GIRO_NO_DISPONIBLE: { status: 409, texto: () => "Ese giro todavía no se puede asignar a un negocio que ya existe: sus cajas deben actualizarse primero." },
    GIRO_RETIRADO: { status: 400, texto: () => "Ese giro ya no se ofrece." },
    MODULO_DESCONOCIDO: { status: 400, texto: () => "Ese módulo no existe." },
    MODULO_NO_BOOLEANO: { status: 400, texto: () => "Cada módulo va encendido o apagado." },
    CAMBIOS_INVALIDOS: { status: 400, texto: () => "No hay cambios que aplicar." },
    TENANT_NO_EXISTE: { status: 404, texto: () => "Ese negocio no existe." },
  };
  const rechazo = (message: string) => {
    const m = /^([A-Z_]+)(?::\s*(.*))?$/.exec(message.trim());
    const r = m ? RECHAZOS_OPERACION[m[1]] : undefined;
    return r
      ? NextResponse.json({ error: m![1], detalle: r.texto(m![2] ?? "") }, { status: r.status })
      : NextResponse.json({ error: message }, { status: 500 });
  };

  if (accion === "operacion") {
    const cambios = body.cambios;
    if (typeof cambios !== "object" || cambios === null || Array.isArray(cambios)) {
      return NextResponse.json({ error: "CAMBIOS_INVALIDOS", detalle: "No hay cambios que aplicar." }, { status: 400 });
    }
    if (!motivoDe()) return faltaMotivo();
    const { data, error } = await sb.rpc("operacion_cambiar", { p_tenant: id, p_cambios: cambios });
    if (error) return rechazo(error.message);
    await auditar(sb, { accion: "tenant.operacion", tenantId: id, motivo: motivoDe(), payload: { cambios, resultado: data } });
    return NextResponse.json({ ok: true, ...((data ?? {}) as Record<string, unknown>) });
  }

  if (accion === "cambiar_giro") {
    const giro = String(body.giro ?? "");
    if (!GIROS.some((g) => g.codigo === giro)) return NextResponse.json({ error: "GIRO_INVALIDO", detalle: "Elige un giro de la lista." }, { status: 400 });
    if (!motivoDe()) return faltaMotivo();
    const reaplicar = body.reaplicar === true;
    const { data, error } = await sb.rpc("cambiar_giro", { p_tenant: id, p_giro: giro, p_reaplicar: reaplicar });
    if (error) return rechazo(error.message);
    await auditar(sb, { accion: "tenant.cambiar_giro", tenantId: id, motivo: motivoDe(), payload: { giro, reaplicar, resultado: data } });
    return NextResponse.json({ ok: true, ...((data ?? {}) as Record<string, unknown>) });
  }
```

> `motivoDe` y `faltaMotivo` ya están definidos al inicio de `PATCH` (líneas 157-161). Si quedan definidos *después* de este punto, mover estas ramas debajo de ellos.

Run: `pnpm --filter @vim/platform test -- rutas-operacion`
Esperado: PASS.

- [ ] **Step 3: Los nombres de giro** (`lib/formato.ts:23-32`)

```ts
import { GIROS, nombreGiro } from "@vim/db/operacion";

// Los mismos nombres que ve el dueño (ADR 0034). Solo se ofrecen los vigentes; los retirados
// conservan su nombre para leer a quien ya los tiene.
export const VERTICALES = GIROS.filter((g) => g.ofrecido).map((g) => ({ v: g.codigo, l: g.nombre }));
export const nombreVertical = nombreGiro;
```

Quitar `as const` donde algún consumidor lo exija (revisar con `pnpm --filter @vim/platform typecheck`).

- [ ] **Step 4: La sección de la ficha**

Cargar las skills de Emil Kowalski y copiar el formato de lista y botones de `modulos-limites.tsx`.

`apps/platform/app/components/operacion-giro.tsx`:

```tsx
"use client";
import { useState } from "react";
import { GIROS, OPERACION, moduloActivo, nombreGiro, type CodigoOperacion } from "@vim/db/operacion";
import type { Detalle } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;
type Pendiente =
  | { tipo: "modulo"; codigo: CodigoOperacion; nombre: string; encender: boolean }
  | { tipo: "giro"; giro: string; reaplicar: boolean }
  | null;

/**
 * Qué usa este negocio (ADR 0034). Solo VIM lo cambia: encender o apagar es reversible y pide
 * motivo; cambiar el giro y volver a aplicar sus módulos puede apagar varios a la vez, así que pide
 * además el nombre. La caja lo obedece en su siguiente conexión.
 */
export function OperacionGiro({ d, nombre, accion, busy }: { d: Detalle; nombre: string; accion: Accion; busy: boolean }) {
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const giroActual = String(d.tenant.vertical_principal ?? "");
  const [giro, setGiro] = useState(giroActual);
  const [reaplicar, setReaplicar] = useState(true);
  const ef = d.modulos.efectivos;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <label className={label}>Cómo vende</label>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <select className={input} value={giro} onChange={(e) => setGiro(e.target.value)} aria-label="Giro">
          {GIROS.filter((g) => g.ofrecido || g.codigo === giroActual).map((g) => <option key={g.codigo} value={g.codigo}>{g.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-13 text-ink-2">
          <input type="checkbox" checked={reaplicar} onChange={(e) => setReaplicar(e.target.checked)} />
          Volver a aplicar sus módulos
        </label>
        <button type="button" disabled={busy || giro === giroActual}
          className="rounded border border-line-strong px-3 py-1.5 text-13 font-semibold disabled:opacity-50"
          onClick={() => setPendiente({ tipo: "giro", giro, reaplicar })}>Cambiar giro</button>
      </div>
      <ul className="flex flex-col gap-2">
        {OPERACION.map((m) => {
          const activo = moduloActivo(ef, m.codigo);
          return (
            <li key={m.codigo} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
              <div>
                <div className="text-13 font-semibold">{m.nombre} <span className={activo ? "text-success" : "text-ink-3"}>· {activo ? "encendido" : "apagado"}</span></div>
                <div className="text-12 text-ink-3">{m.descripcion}{m.requiere ? ` Necesita ${OPERACION.find((x) => x.codigo === m.requiere)?.nombre}.` : ""}</div>
              </div>
              <button type="button" disabled={busy}
                className="rounded border border-line-strong px-2.5 py-1 text-12 font-semibold disabled:opacity-50"
                onClick={() => setPendiente({ tipo: "modulo", codigo: m.codigo, nombre: m.nombre, encender: !activo })}>
                {activo ? "Apagar" : "Encender"}
              </button>
            </li>
          );
        })}
      </ul>

      <DialogoConfirmar
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={pendiente?.tipo === "giro" ? `Cambiar giro a ${nombreGiro(pendiente.giro)}` : pendiente ? `${pendiente.encender ? "Encender" : "Apagar"} ${pendiente.nombre}` : ""}
        descripcion={pendiente?.tipo === "giro"
          ? <>El giro de <b>{nombre}</b> cambia a <b>{nombreGiro(pendiente.giro)}</b>.{pendiente.reaplicar ? " Sus módulos vuelven a los de ese giro: lo que no use se esconde en su caja y su panel (no se borra nada)." : " Sus módulos se quedan como están."}</>
          : <>La caja y el panel de <b>{nombre}</b> lo reflejan en su siguiente conexión. Apagar solo esconde: no se borra nada.</>}
        nombreEsperado={nombre}
        sinNombre={pendiente?.tipo === "modulo"}
        etiquetaBoton={pendiente?.tipo === "giro" ? "Cambiar giro" : pendiente?.encender ? "Encender" : "Apagar"}
        peligroso={pendiente?.tipo === "giro" ? pendiente.reaplicar : pendiente?.encender === false}
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          if (!pendiente) return;
          if (pendiente.tipo === "giro") await accion({ accion: "cambiar_giro", giro: pendiente.giro, reaplicar: pendiente.reaplicar, motivo });
          else await accion({ accion: "operacion", cambios: { [pendiente.codigo]: pendiente.encender }, motivo });
          setPendiente(null);
        }}
      />
    </div>
  );
}
```

> `Detalle.tenant` es `Record<string, unknown>` y ya trae `vertical_principal` (GET, línea 27). `d.modulos.efectivos` trae las llaves de operación desde la 0180. Confirmar la firma exacta de `onConfirmar` en `dialogo-confirmar.tsx` (se usa `({ motivo })` en `modulos-limites.tsx:175`).

En `clientes/[id]/page.tsx`, debajo de `<ModulosLimites ... />` (línea 174):

```tsx
          <OperacionGiro d={d} nombre={nombre} accion={accion} busy={busy} />
```

con su import desde `../../components/operacion-giro`.

- [ ] **Step 5: Tipos y pruebas**

Run: `pnpm --filter @vim/platform typecheck && pnpm --filter @vim/platform test`
Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/platform
git commit -m "feat(giros): VIM enciende, apaga y cambia el giro desde la ficha del cliente"
```

---

### Task 7: Registro y alta con los giros nuevos

**Files:**
- Modify: `supabase/functions/_shared/alta.ts:18-35,50-105,163,221`
- Test: `supabase/functions/_shared/alta.test.ts`
- Modify: `apps/admin/app/registro/page.tsx:15-22,51,100,167-172`
- Modify: `supabase/functions/provisionar-tenant/index.ts:33`
- Modify: `supabase/functions/solicitar-demo/index.ts:64-73`

**Interfaces:**
- Produces:
  - `validarAlta` acepta `vertical ∈ {FOODTRUCK, QUICK_SERVICE, FULL_SERVICE, DARK_KITCHEN, BAR, CAFETERIA, TAQUERIA}` y `varias_sucursales: boolean` (falta = false).
  - `planDeAlta(d: DatosAlta): "CADENA" | "ESENCIAL"` reemplaza a `PLAN_DE_VERTICAL`.
  - El cuerpo del registro manda `varias_sucursales`.

- [ ] **Step 1: Las pruebas (RED)**

Agregar al final de `alta.test.ts` (y sumar `planDeAlta` al import):

```ts
test("los siete giros que se ofrecen pasan; los retirados no (formulario viejo en caché)", () => {
  for (const v of ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "DARK_KITCHEN", "BAR", "CAFETERIA", "TAQUERIA"]) {
    assert.equal(validarAlta({ ...BUENO, vertical: v }).ok, true, v);
  }
  for (const v of ["CAFE_BAR", "ENTERPRISE"]) {
    const r = validarAlta({ ...BUENO, vertical: v });
    assert.equal(r.ok, false);
    assert.equal((r as { error: string }).error, "VERTICAL_INVALIDA");
  }
});

test("una cadena es plan, no giro: varias sucursales → Cadena; si no, Esencial", async () => {
  const conVarias = validarAlta({ ...BUENO, vertical: "TAQUERIA", varias_sucursales: true });
  assert.equal(conVarias.ok && planDeAlta(conVarias.datos), "CADENA");
  const sola = validarAlta({ ...BUENO, vertical: "TAQUERIA" });
  assert.equal(sola.ok && planDeAlta(sola.datos), "ESENCIAL");
  const { d, llamadas } = deps();
  await procesarAlta({ ...BUENO, varias_sucursales: true }, d);
  assert.equal((llamadas.altaNegocio![0] as { plan: string }).plan, "CADENA");
});
```

Run: `node --test --experimental-strip-types supabase/functions/_shared/alta.test.ts`
Esperado: FAIL (`planDeAlta` no existe, BAR rechazado).

- [ ] **Step 2: `alta.ts`**

Reemplazar las líneas 18-35 por:

```ts
export const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "DARK_KITCHEN", "BAR", "CAFETERIA", "TAQUERIA"] as const;
export type Vertical = (typeof VERTICALES)[number];

export const GIRO_ETIQUETA: Record<Vertical, string> = {
  FOODTRUCK: "Food truck",
  QUICK_SERVICE: "Comida rápida / mostrador",
  FULL_SERVICE: "Restaurante con meseros",
  DARK_KITCHEN: "Cocina fantasma / solo reparto",
  BAR: "Bar",
  CAFETERIA: "Cafetería",
  TAQUERIA: "Taquería o cocina económica",
};

/** Una cadena es un plan, no un giro (ADR 0034): quien dice tener varias sucursales empieza en Cadena. */
export const planDeAlta = (d: Pick<DatosAlta, "varias_sucursales">): "CADENA" | "ESENCIAL" =>
  d.varias_sucursales ? "CADENA" : "ESENCIAL";
```

- `DatosAlta` gana `varias_sucursales: boolean`.
- En `validarAlta`, el `return { ok: true, datos: {...} }` agrega `varias_sucursales: b.varias_sucursales === true`.
- Línea 163: `plan: planDeAlta(d)`.
- Línea 221: el correo a VIM agrega el dato, `${esc(GIRO_ETIQUETA[d.vertical])}${d.varias_sucursales ? " · varias sucursales" : ""}`.
- `grep -rn "PLAN_DE_VERTICAL" supabase/functions` no debe devolver nada.

Run: `node --test --experimental-strip-types supabase/functions/_shared/alta.test.ts`
Esperado: PASS, incluidas las pruebas que ya existían.

- [ ] **Step 3: El formulario de registro** (`apps/admin/app/registro/page.tsx`)

`VERTICALES` (líneas 15-22):

```ts
const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Comida rápida · hamburguesas, pizza, pollo" },
  { v: "FULL_SERVICE", l: "Restaurante con meseros" },
  { v: "TAQUERIA", l: "Taquería o cocina económica" },
  { v: "CAFETERIA", l: "Cafetería" },
  { v: "BAR", l: "Bar" },
  { v: "DARK_KITCHEN", l: "Cocina solo para apps de entrega" },
  { v: "FOODTRUCK", l: "Food truck" },
];
```

- Estado nuevo: `const [variasSucursales, setVariasSucursales] = useState(false);`.
- El cuerpo (línea 100) agrega `varias_sucursales: variasSucursales`.
- Debajo del `<select id="vertical">` (línea 172):

```tsx
              <label className="flex items-center gap-2 text-14 text-ink-2">
                <input type="checkbox" checked={variasSucursales} onChange={(e) => setVariasSucursales(e.target.checked)} />
                Tengo más de una sucursal
              </label>
```

- [ ] **Step 4: Los otros dos puntos de entrada**

- `provisionar-tenant/index.ts:33`, que usa /platform → Nuevo cliente (el plan se elige ahí aparte):

```ts
const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "DARK_KITCHEN", "BAR", "CAFETERIA", "TAQUERIA"];
```

- `solicitar-demo/index.ts:64-73`: solo registra un prospecto, y el formulario del sitio (que no se toca aquí) sigue mandando los valores viejos. Se **suman** los nuevos y se conservan los viejos:

```ts
const GIROS = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE", "BAR", "CAFETERIA", "TAQUERIA"];

const GIRO_ETIQUETA: Record<string, string> = {
  FOODTRUCK: "Food truck",
  QUICK_SERVICE: "Comida rápida / mostrador",
  FULL_SERVICE: "Restaurante con meseros",
  CAFE_BAR: "Cafetería o bar",
  DARK_KITCHEN: "Cocina fantasma / solo reparto",
  ENTERPRISE: "Cadena",
  BAR: "Bar",
  CAFETERIA: "Cafetería",
  TAQUERIA: "Taquería o cocina económica",
};
```

- [ ] **Step 5: Todo lo de funciones y admin**

Run: `pnpm test:functions && pnpm --filter @vim/admin typecheck && pnpm --filter @vim/platform typecheck`
Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions apps/admin/app/registro
git commit -m "feat(giros): el registro ofrece los siete giros y la cadena pasa a ser una casilla"
```

---

### Task 8: Verificación completa y prueba visual de la caja

**Files:** ninguno de producto. Script temporal en el scratchpad de la sesión (no se versiona).

- [ ] **Step 1: Todo en verde**

Run, en este orden:
- `pnpm typecheck`
- `pnpm --filter @vim/pos test`
- `pnpm --filter @vim/admin test`
- `pnpm --filter @vim/platform test`
- `pnpm test:functions`
- `npm --prefix desktop run smokes`

Esperado: todo en verde. Un rojo conocido de la línea base (Tarea 0) se anota y no se "arregla" aquí.

- [ ] **Step 2: La caja de un food truck, de verdad**

Backend embebido en una carpeta temporal (no toca el `pgdata` de dev ni el Supabase compartido), en un puerto libre:

```js
// <scratchpad>/verificar-giros.mjs — node <scratchpad>/verificar-giros.mjs
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startBackend } from "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos-giros/desktop/src/backend.mjs";

const dataRoot = mkdtempSync(path.join(tmpdir(), "vim-giros-"));
const b = await startBackend({ dataRoot, gatewayPort: 54370, pgPort: 54397, restPort: 54398, host: "127.0.0.1", uiPorts: [3000] });
await b.pool.query(`UPDATE tenants SET operacion = juego_inicial_de_giro('FOODTRUCK') WHERE id = '99999999-0000-0000-0000-0000000000aa'`);
console.log("listo en", b.url, "datos en", dataRoot);
```

Antes de correrlo, confirmar con `Get-NetTCPConnection -LocalPort 54370,54397,54398 -State Listen` que nadie usa esos puertos. Correrlo en segundo plano y, con `.claude/launch.json`, levantar el POS con `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54370 pnpm --filter @vim/pos dev`. Antes de mirar, desregistrar el service worker (memoria `reference_reproducir_pos_sin_docker`).

Comprobar en la vista previa (María, PIN 1234):
- el inicio enseña **Para llevar** y **Pick-up**, y **no** Comedor ni Domicilio;
- el menú no tiene "Mis propinas";
- "Abrir turno" enseña el bloque de evento.

Después, con `UPDATE tenants SET operacion = juego_inicial_de_giro(NULL) || '{"eventos":false}'` (lo de un negocio de siempre), recargar: los cuatro accesos, "Mis propinas" y **sin** bloque de evento. Tomar captura de los dos estados.

Al terminar, parar el dev server y el script, y borrar la carpeta temporal.

- [ ] **Step 3: Commit** (solo si se corrigió algo en este paso)

---

### Task 9: Documentos

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md` (§5 ajustes, §6.1, §6.3, §7)
- Modify: `docs/decisiones/0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md`

- [ ] **Step 1: Spec**

- En §5, quitar la tabla "Ajustes que también cambian según el giro" y dejar una nota:

  > Cobro y propina no dependen del giro (Fermín, 14 oct): el cobro va por tipo de cuenta y la propina arranca sugerida, como hoy.

- En §6.1, quitar "Se reaprovecha: `politica_cobro_cocina`…".
- En §6.3, el alta aplica solo `operacion` (sin política de cobro, sin propina).
- En §7:
  - La fila "Caja, cuenta" queda: "Mis propinas solo con `meseros`; Combinar formas de pago se queda para todos (no existe dividir por persona)."
  - La fila "Primera vez" queda: "Sin cambios: no tiene un paso de mesas."
  - En la página nueva, decir que es de solo consulta con WhatsApp.
  - Agregar que el registro cambia "Cadena" por la casilla "Tengo más de una sucursal".
  - Agregar que "Estaciones de preparación" no se esconde (comandas impresas).

- [ ] **Step 2: ADR 0034**

Cambiar el estado a "vigente (entregas 1 y 2 de 3)". En "Cómo se despliega", la frase del alta queda: "El alta aplica el juego del giro desde la 0181, que viaja con las pantallas". Agregar que la 0181 apaga `eventos` a los negocios existentes que no son food truck, para que ninguno vea el bloque de evento de golpe.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(giros): spec y ADR 0034 al día con la entrega 2"
```

---

## Lo que esta entrega no hace

- **Cuentas por nombre en barra** (acceso Barra, `tickets.nombre_cuenta`, impresión, sync): entrega 3.
- **Sincronizar `sucursal_propinas_config` a la caja:** tarea aparte (hoy lo que el dueño cambia en Propinas no llega a la caja instalada).
- **Liberar BAR, CAFETERIA y TAQUERIA para negocios existentes,** y convertir CAFE_BAR: una migración cuando todas las cajas tengan la 0179.
- **La sección `#giros` del sitio web y el formulario de demo del sitio** (con James).
- Los minors diferidos de la entrega 1: HTTP de los rechazos (ahora traducidos en la ruta), `FOR NO KEY UPDATE`, cuentas huérfanas que bloquean el comedor sin decir cuáles.
