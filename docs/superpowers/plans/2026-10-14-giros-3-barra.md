# Giros y módulos de operación · Entrega 3: cuentas por nombre en barra — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un bar abra cuentas a nombre de una persona, sin mesa, desde un acceso **Barra** en la caja, y que esas cuentas se puedan pasar a una mesa y de vuelta.

**Architecture:** Una cuenta de barra es un ticket abierto con `modo_servicio = 'BARRA'` (el valor ya existe) y el nombre en **`tickets.nombre_cliente`**, la columna que Pick-up ya usa para el nombre de la cuenta (0068). Así el ticket impreso, la comanda, el KDS, las listas y la sincronización la muestran sin cambios. Tres RPC nuevas, cada una atómica: abrir, pasar a mesa y pasar a barra. Un índice único parcial impide dos cuentas de barra abiertas con el mismo nombre en una sucursal. La caja gana el acceso Barra, gobernado por el módulo `cuentas_barra`, y reutiliza la lista de cuentas y el flujo de cuenta abierta que ya usan Comedor y Pick-up.

**Tech Stack:** PostgreSQL (migración 0183 + smoke), Next.js POS (Vitest en `app/**/*.test.ts`, entorno node), `@vim/db/operacion`.

**Spec:** `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md` §8 (cuentas por nombre en barra). **Planes anteriores:** `2026-10-14-giros-1-nucleo.md`, `2026-10-14-giros-2-pantallas.md`.

## Global Constraints

- **Nada sale de local:** sin push ni PR y sin aplicar migraciones a producción hasta el lanzamiento conjunto de fin de semana.
- Rama `feat/giros-barra`, cortada de `feat/giros-pantallas`, en el worktree `../vim-pos-giros`.
- **Un negocio que ya existe no ve nada nuevo:** `cuentas_barra` queda apagado para todos, salvo los que tengan giro BAR, y una llave ausente cuenta como apagada (igual que `eventos`).
- Nombre obligatorio; no puede haber dos cuentas de barra abiertas (BORRADOR o ABIERTO) con el mismo nombre en la misma sucursal, sin distinguir mayúsculas ni espacios al inicio o al final. Si se repite, la caja propone "Luis 2".
- Una cuenta de barra se puede pasar a una mesa y al revés, si el módulo de destino (`comedor` o `cuentas_barra`) está encendido.
- Dentro, una cuenta de barra funciona igual que una de mesa: agregar, mandar a cocina, combinar formas de pago y cobrar.
- Las RPC corren como el usuario (SECURITY INVOKER, como `abrir_ticket`) y se apoyan en RLS. Cada creación lleva `p_client_id_local` para ser idempotente.
- Texto en español llano; estilos de `docs/diseno/pos.md` y de los componentes existentes, sin inventar. Antes de escribir CSS, cargar `emil-design-eng` y `ponytail`.
- No usar `next build` para verificar.

## Decisiones tomadas al planear (rulings del controlador)

| # | Decisión | Por qué | Costo si está mal |
|---|---|---|---|
| 1 | El nombre va en `tickets.nombre_cliente` y **no** en una columna nueva `nombre_cuenta` (el spec decía columna nueva) | Pick-up ya guarda ahí el nombre de la cuenta. Impresión, comanda, KDS (`detalle`), listas (`listarCuentasAbiertas`) y sincronización lo leen sin tocarlos. Una columna nueva cambiaría la huella de cada ticket y la caja volvería a subir unos 60 días de ventas | Si algún día un ticket de barra necesitara a la vez un cliente con otro nombre, `cliente_id` sigue disponible |
| 2 | Abrir una cuenta de barra es **una RPC** (`abrir_cuenta_barra`), no `abrir_ticket` + `update` como hace Pick-up | Si el nombre choca después de crear el ticket, quedaría un BORRADOR huérfano que cuenta como cuenta de barra abierta y le impide a VIM apagar el módulo | Ninguno |
| 3 | La 0183 apaga `cuentas_barra` a los negocios existentes que no son BAR y cambia el default de la columna | La 0181 los dejó encendidos: a Knock-Out le aparecería "Barra" de golpe | Ninguno: antes de esta entrega nadie tenía cuentas de barra |
| 4 | Los reportes no ganan un contador nuevo | "Ventas por tipo de servicio" ya agrupa por `modo_servicio`, con la etiqueta "Barra" (`etiquetaModo`). El estado de resultados tampoco cuenta MESA hoy | El estado de resultados no separa barra; se agrega si Fermín lo pide |
| 5 | La impresión no cambia | Hoy no se imprime el número de mesa: el ticket dice "Servicio: Barra" y "Cliente: Luis", y la comanda lleva la banda "BARRA" y "Cliente: Luis" | Ninguno |

## Review Focus

1. **Un negocio que ya existe** (Knock-Out, todo encendido salvo eventos) **no ve "Barra"** ni en la caja ni en el admin como encendido. Pruebas en las Tareas 1 y 2.
2. **Dos cajeros abren "Luis" casi al mismo tiempo** (dos cajas, o un reintento): uno gana. El otro recibe `NOMBRE_EN_USO`, no un error opaco, y la caja propone "Luis 2". Un reintento con el mismo `client_id_local` devuelve la misma cuenta. Pruebas en las Tareas 1 y 3.
3. **Cobrar una cuenta de barra no le cambia el `modo_servicio`** a COMER_AQUI. Hoy `mapearModo` convierte BARRA a COMER_AQUI en el cliente. Prueba en la Tarea 4.
4. **Pasar una cuenta a mesa y de vuelta** libera o ocupa la mesa bien, cambia el modo y respeta el nombre único. Prueba en la Tarea 1.
5. **Con `cuentas_barra` apagado pero cuentas de barra abiertas en la caja,** el acceso Barra se sigue viendo con su contador hasta cerrarlas. Prueba en la Tarea 3.

---

### Task 0: Rama

- [ ] **Step 1**

```bash
cd ../vim-pos-giros
git switch feat/giros-barra       # ya creada con este plan, desde feat/giros-pantallas
ls supabase/migrations | tail -2   # la última debe ser 0182_prospectos_giros_nuevos.sql
```

---

### Task 1: Base de datos — abrir, nombre único y pasar entre barra y mesa

**Files:**
- Create: `supabase/migrations/0183_cuentas_barra.sql`
- Create: `supabase/scripts/smoke_cuentas_barra.sql`
- Modify: `supabase/scripts/smoke_giros_operacion.sql` (chequeo 2c)
- Modify: `packages/db/src/database.types.ts` (las tres RPC nuevas, en orden alfabético, con la forma de las demás)

**Interfaces:**
- Produces (las tres SECURITY INVOKER, `GRANT EXECUTE` a `authenticated` y `service_role`, `REVOKE` de `anon`):
  - `abrir_cuenta_barra(p_sucursal_id uuid, p_caja_id uuid, p_turno_id uuid, p_nombre text, p_client_id_local varchar, p_usuario_id uuid DEFAULT NULL) RETURNS uuid`.
  - `mover_cuenta_a_mesa(p_ticket_id uuid, p_mesa_id uuid, p_client_id_local varchar) RETURNS void`.
  - `mover_cuenta_a_barra(p_ticket_id uuid, p_nombre text) RETURNS void`.
- Errores, con un mensaje que empieza con el código:
  - `NOMBRE_REQUERIDO` (22023).
  - `NOMBRE_EN_USO` (23505, el del índice, reescrito con ese mensaje).
  - `NO_ES_CUENTA_DE_BARRA` y `NO_ES_CUENTA_DE_MESA` (22023).
  - `CUENTA_CERRADA` (22023, el ticket no está en BORRADOR ni ABIERTO).
  - Los de `asignar_mesa_a_ticket` pasan tal cual.

- [ ] **Step 1: El smoke (RED)**

`supabase/scripts/smoke_cuentas_barra.sql`, con el patrón de `smoke_cuenta_mesa.sql`: semilla `99999999-…aa` (tenant), `…bb` (sucursal), `…cc` (caja), María `…01`; turno propio con `dia_contable = (now() AT TIME ZONE 'America/Mexico_City')::date`; BEGIN…ROLLBACK. Un bloque `DO` por caso, cada uno con su `RAISE NOTICE` de OK:

```sql
-- Smoke cuentas por nombre en barra (spec giros §8, migración 0183). Sobre la semilla. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_t1 uuid; v_t1b uuid; v_t2 uuid; v_mesa uuid; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-BARRA', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- a) Abrir: BARRA, con nombre (sin espacios sobrantes), sin mesa, BORRADOR.
  v_t1 := abrir_cuenta_barra(v_suc, v_caja, v_turno, '  Luis  ', 'barra-1', v_maria);
  IF (SELECT modo_servicio::text || '|' || nombre_cliente || '|' || estado_fiscal::text FROM tickets WHERE id = v_t1) <> 'BARRA|Luis|BORRADOR' THEN
    RAISE EXCEPTION 'a: cuenta mal creada: %', (SELECT row_to_json(t) FROM tickets t WHERE id = v_t1);
  END IF;
  IF EXISTS (SELECT 1 FROM tickets_mesas WHERE ticket_id = v_t1) THEN RAISE EXCEPTION 'a: no debía tener mesa'; END IF;
  RAISE NOTICE 'a abrir OK';

  -- b) Idempotente: el mismo client_id_local devuelve la misma cuenta.
  v_t1b := abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-1', v_maria);
  IF v_t1b <> v_t1 THEN RAISE EXCEPTION 'b: el reintento creó otra cuenta'; END IF;
  RAISE NOTICE 'b idempotente OK';

  -- c) Nombre repetido (mayúsculas/espacios) en la misma sucursal → NOMBRE_EN_USO, y no queda ticket huérfano.
  SELECT count(*) INTO v_n FROM tickets WHERE turno_id = v_turno;
  BEGIN
    PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, ' luis', 'barra-2', v_maria);
    RAISE EXCEPTION 'c: aceptó un nombre repetido';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'NOMBRE_EN_USO%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM tickets WHERE turno_id = v_turno) <> v_n THEN RAISE EXCEPTION 'c: quedó un ticket huérfano'; END IF;
  -- Sin nombre → NOMBRE_REQUERIDO.
  BEGIN
    PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, '   ', 'barra-3', v_maria);
    RAISE EXCEPTION 'c: aceptó nombre vacío';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'NOMBRE_REQUERIDO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'c nombre único y requerido OK';

  -- d) Pasar a mesa: modo MESA, mesa OCUPADA, el nombre se libera para otra cuenta de barra.
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 96, 'Mesa 96', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  PERFORM mover_cuenta_a_mesa(v_t1, v_mesa, 'barra-mesa-1');
  IF (SELECT modo_servicio::text FROM tickets WHERE id = v_t1) <> 'MESA' THEN RAISE EXCEPTION 'd: no cambió a MESA'; END IF;
  IF (SELECT estado::text FROM mesas WHERE id = v_mesa) <> 'OCUPADA' THEN RAISE EXCEPTION 'd: la mesa no quedó ocupada'; END IF;
  v_t2 := abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-4', v_maria);   -- ya no choca
  RAISE NOTICE 'd pasar a mesa OK';

  -- e) Pasar de mesa a barra: libera la mesa, modo BARRA, nombre único (Luis ya lo tiene v_t2).
  BEGIN
    PERFORM mover_cuenta_a_barra(v_t1, 'LUIS');
    RAISE EXCEPTION 'e: aceptó un nombre en uso';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'NOMBRE_EN_USO%' THEN RAISE; END IF;
  END;
  IF (SELECT modo_servicio::text FROM tickets WHERE id = v_t1) <> 'MESA' THEN RAISE EXCEPTION 'e: el rechazo dejó cambios'; END IF;
  PERFORM mover_cuenta_a_barra(v_t1, 'Luis 2');
  IF (SELECT modo_servicio::text || '|' || nombre_cliente FROM tickets WHERE id = v_t1) <> 'BARRA|Luis 2' THEN RAISE EXCEPTION 'e: no pasó a barra'; END IF;
  IF (SELECT estado::text FROM mesas WHERE id = v_mesa) <> 'LIBRE' THEN RAISE EXCEPTION 'e: la mesa no se liberó'; END IF;
  RAISE NOTICE 'e pasar a barra OK';

  -- f) Reglas: no se pasa a mesa algo que no es de barra; no se pasa a barra algo sin mesa; cerrada no se mueve.
  BEGIN PERFORM mover_cuenta_a_barra(v_t2, 'Otro'); RAISE EXCEPTION 'f: movió a barra una cuenta sin mesa';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM NOT LIKE 'NO_ES_CUENTA_DE_MESA%' THEN RAISE; END IF; END;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t2;
  BEGIN PERFORM mover_cuenta_a_mesa(v_t2, v_mesa, 'barra-mesa-2'); RAISE EXCEPTION 'f: movió una cuenta cerrada';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM NOT LIKE 'CUENTA_CERRADA%' THEN RAISE; END IF; END;
  -- Una cuenta cerrada libera su nombre.
  PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-5', v_maria);
  RAISE NOTICE 'f reglas OK';

  -- g) VIM no puede apagar cuentas_barra con cuentas de barra abiertas (0180 ya lo cuenta).
  IF (operacion_cuentas_abiertas(v_tenant)->>'cuentas_barra')::int < 1 THEN RAISE EXCEPTION 'g: no contó las cuentas de barra'; END IF;
  RAISE NOTICE 'g conteo OK';
END $$;

-- h) Bajo RLS como el cajero: abrir funciona en su negocio.
DO $$
DECLARE v_t uuid;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'role', 'authenticated', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  v_t := abrir_cuenta_barra('99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
          (SELECT id FROM turnos WHERE codigo_turno = 'SMOKE-BARRA'), 'Ana', 'barra-rls', NULL);
  IF v_t IS NULL THEN RAISE EXCEPTION 'h: no abrió bajo RLS'; END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'h RLS OK';
END $$;

-- i) Un negocio que ya existe no tiene cuentas_barra (0183).
DO $$
BEGIN
  IF (SELECT (operacion->>'cuentas_barra')::boolean FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa') THEN
    RAISE EXCEPTION 'i: el negocio existente quedó con cuentas_barra encendido';
  END IF;
  RAISE NOTICE 'i existentes sin barra OK';
END $$;
ROLLBACK;
```

> El bloque h depende de que `authenticated` pueda leer el turno y escribir `tickets` bajo RLS, como hace `abrir_ticket` en la caja web. Si el `SELECT` del turno no ve la fila (RLS de `turnos`), guardar el id en un `set_config('smoke.turno', …)` en el bloque anterior y leerlo con `current_setting`.

En `smoke_giros_operacion.sql`, el chequeo 2c pasa a esperar `v_todo || '{"eventos":false,"cuentas_barra":false}'::jsonb`.

Run: `npm --prefix desktop run smokes -- smoke_cuentas_barra.sql smoke_giros_operacion.sql`
Esperado: los dos en `❌` (`function abrir_cuenta_barra(...) does not exist`; 2c distinto).

- [ ] **Step 2: La 0183**

`supabase/migrations/0183_cuentas_barra.sql` contiene, en este orden:

1. **Existentes y default** (ruling 3):

```sql
ALTER TABLE tenants ALTER COLUMN operacion
  SET DEFAULT (juego_inicial_de_giro(NULL) || '{"eventos":false,"cuentas_barra":false}'::jsonb);
UPDATE tenants SET operacion = operacion || '{"cuentas_barra":false}'::jsonb
 WHERE vertical_principal::text <> 'BAR';
```

2. **Nombre único entre cuentas de barra abiertas:**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_barra_nombre_abierto
  ON tickets (sucursal_id, lower(btrim(nombre_cliente)))
  WHERE modo_servicio = 'BARRA' AND estado_fiscal IN ('BORRADOR', 'ABIERTO') AND deleted_at IS NULL;
```

3. **`abrir_cuenta_barra`** (plpgsql, SECURITY INVOKER, `SET search_path = public, pg_temp`):
   - `v_nombre := btrim(p_nombre)`; si es NULL o vacío → `RAISE EXCEPTION 'NOMBRE_REQUERIDO' USING ERRCODE = '22023'`.
   - Recortar a 100 caracteres (el ancho de la columna).
   - `v_id := abrir_ticket(p_sucursal_id, p_caja_id, p_turno_id, 'BARRA', NULL, NULL, p_client_id_local, p_usuario_id);`
   - `UPDATE tickets SET nombre_cliente = v_nombre WHERE id = v_id AND nombre_cliente IS DISTINCT FROM v_nombre;` (en un reintento idempotente no reescribe).
   - Envolver el `UPDATE` en `BEGIN … EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'NOMBRE_EN_USO: %', v_nombre USING ERRCODE = '23505'; END;`. Como el ticket se creó en la misma transacción de la función, el error lo revierte todo y no queda huérfano (smoke c).
   - `RETURN v_id`.
4. **`mover_cuenta_a_mesa`:**
   - Lee el ticket con `FOR UPDATE`.
   - Si no está en BORRADOR o ABIERTO → `CUENTA_CERRADA`; si `modo_servicio <> 'BARRA'` → `NO_ES_CUENTA_DE_BARRA`.
   - `UPDATE tickets SET modo_servicio = 'MESA'`.
   - `PERFORM asignar_mesa_a_ticket(p_ticket_id, p_mesa_id, true, p_client_id_local);` (sus errores pasan; si falla, el cambio de modo se revierte con la transacción).
   - El nombre se queda en `nombre_cliente` (es el cliente de la mesa).
5. **`mover_cuenta_a_barra`:**
   - `FOR UPDATE`; `CUENTA_CERRADA` si no está abierta.
   - Si no hay fila viva en `tickets_mesas` (`fecha_liberacion IS NULL`, `es_mesa_principal`) → `NO_ES_CUENTA_DE_MESA`. `NOMBRE_REQUERIDO` igual que al abrir.
   - Hace primero el `UPDATE tickets SET modo_servicio = 'BARRA', nombre_cliente = v_nombre`, con la misma traducción de `unique_violation` a `NOMBRE_EN_USO`.
   - Después libera la mesa: `UPDATE tickets_mesas SET fecha_liberacion = now(), motivo_liberacion = 'PASADA_A_BARRA' WHERE ticket_id = p_ticket_id AND fecha_liberacion IS NULL`. El disparador de 0010 deja la mesa LIBRE.
6. `COMMENT ON FUNCTION` de cada una (una línea).
7. Permisos: `REVOKE ALL … FROM PUBLIC, anon;` y `GRANT EXECUTE … TO authenticated, service_role;`.

Cabecera de la migración: qué es y por qué el nombre va en `nombre_cliente` (ruling 1), y por qué se apaga `cuentas_barra` a los existentes (ruling 3).

- [ ] **Step 3: GREEN y vecinos**

Run: `npm --prefix desktop run smokes -- smoke_cuentas_barra.sql smoke_giros_operacion.sql smoke_cuenta_mesa.sql smoke_mesas.sql smoke_mesa_huerfana.sql`
Esperado: todos en verde.

- [ ] **Step 4: Tipos**

Agregar a `packages/db/src/database.types.ts` las tres funciones (Args/Returns, en orden alfabético dentro de `Functions`). Comprobar con el `tsc` del monorepo: `pnpm --filter @vim/pos typecheck`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0183_cuentas_barra.sql supabase/scripts/smoke_cuentas_barra.sql supabase/scripts/smoke_giros_operacion.sql packages/db/src/database.types.ts
git commit -m "feat(barra): abrir cuentas por nombre en barra y pasarlas entre barra y mesa"
```

---

### Task 2: El catálogo enseña "Cuentas en barra"

**Files:**
- Modify: `packages/db/src/operacion.ts` (`OPERACION` y `moduloActivo`)
- Modify: `apps/admin/app/lib/__tests__/operacion-catalogo.test.ts`

**Interfaces:**
- Produces: `OPERACION` con diez módulos (agrega `cuentas_barra` al final). `moduloActivo(m, "cuentas_barra")` con la llave ausente → `false`, igual que `eventos`.

- [ ] **Step 1: Pruebas (RED)**

En `operacion-catalogo.test.ts`:
- La prueba "salvo eventos" gana `expect(moduloActivo({}, "cuentas_barra")).toBe(false); expect(moduloActivo(null, "cuentas_barra")).toBe(false);` y `expect(moduloActivo({ cuentas_barra: true }, "cuentas_barra")).toBe(true);`.
- La prueba del catálogo pasa a esperar diez códigos, terminando en `"eventos", "cuentas_barra"`. Cambiar su título a "diez módulos visibles".

Run: `pnpm --filter @vim/admin test -- operacion-catalogo` → FAIL.

- [ ] **Step 2: El cambio**

En `operacion.ts`:
- Agregar al final de `OPERACION`: `{ codigo: "cuentas_barra", nombre: "Cuentas en barra", descripcion: "Cuentas a nombre de una persona, sin mesa." }`.
- Quitar el comentario "entra con la entrega 3".
- En `moduloActivo`: `return typeof v === "boolean" ? v : codigo !== "eventos" && codigo !== "cuentas_barra";`.
- Actualizar el comentario: los dos que "antes de los giros" nadie veía.

Run: `pnpm --filter @vim/admin test` y `pnpm --filter @vim/platform test` → verde. Si alguna prueba de admin o platform contaba nueve módulos, ajustarla a diez.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/operacion.ts apps/admin apps/platform
git commit -m "feat(barra): las cuentas en barra aparecen como módulo para VIM y el dueño"
```

---

### Task 3: La caja — lógica de barra

**Files:**
- Modify: `apps/pos/app/lib/accesos-inicio.ts` (+ su prueba)
- Modify: `apps/pos/app/lib/turno.ts:160-185` (`contarCuentasAbiertasPorModo`)
- Create: `apps/pos/app/lib/cuenta-barra.ts`, `apps/pos/app/lib/__tests__/cuenta-barra.test.ts`

**Interfaces:**
- Produces:
  - `accesosInicio(modulos, cuentas: { comedor: number; pickup: number; domicilio: number; barra: number })` → `{ comedor, paraLlevar, pickup, domicilio, barra }`, con `barra = moduloActivo(m, "cuentas_barra") || cuentas.barra > 0`.
  - `CuentasAbiertasPorModo` gana `barra: n("BARRA")`.
  - En `cuenta-barra.ts`:
    - `nombreLibre(nombre: string, enUso: readonly string[]): string`: recorta espacios; si el nombre, en minúsculas y recortado, no está en uso, lo devuelve; si no, prueba "Nombre 2", "Nombre 3"… con la misma comparación.
    - `abrirCuentaBarra(token, a: { sucursalId; cajaId; turnoId; nombre; usuarioId; clientIdLocal }): Promise<string>`.
    - `moverCuentaAMesa(token, ticketId, mesaId, clientIdLocal): Promise<void>`.
    - `moverCuentaABarra(token, ticketId, nombre): Promise<void>`.
    - Las tres lanzan `NombreEnUso` (clase exportada, con `.nombre`) si el error empieza con `NOMBRE_EN_USO`; cualquier otro error se relanza tal cual.

- [ ] **Step 1: Pruebas (RED)**

a) `accesos-inicio.test.ts`:
- Los cuatro `toEqual` ganan `barra` (con `{}` → `barra: false`; food truck → `false`).
- Un caso nuevo: `accesosInicio({ cuentas_barra: true }, SIN).barra === true`.
- Otro: con `cuentas_barra: false` y `barra: 2` cuentas → `true`.
- `SIN` gana `barra: 0`.

b) `cuenta-barra.test.ts`, con el patrón de mock de `cobro.test.ts:47-65`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("nombreLibre", () => {
  it("un nombre libre se queda (sin espacios sobrantes)", async () => {
    const { nombreLibre } = await import("../cuenta-barra");
    expect(nombreLibre("  Luis ", ["Ana"])).toBe("Luis");
  });
  it("si está en uso propone el siguiente número, sin distinguir mayúsculas", async () => {
    const { nombreLibre } = await import("../cuenta-barra");
    expect(nombreLibre("luis", ["Luis"])).toBe("luis 2");
    expect(nombreLibre("Luis", ["luis", "LUIS 2"])).toBe("Luis 3");
  });
});
```

Más un `describe("abrirCuentaBarra")` que mockea `employeeClient(token).rpc` (ver cómo lo mockea `cobro.test.ts`) y comprueba dos cosas:
- llama `abrir_cuenta_barra` con `{ p_sucursal_id, p_caja_id, p_turno_id, p_nombre, p_client_id_local, p_usuario_id }`;
- un error `{ message: "NOMBRE_EN_USO: Luis" }` se convierte en `NombreEnUso` con `nombre === "Luis"`, y uno `{ message: "boom" }` se relanza como `Error("boom")`.

Run: `pnpm --filter @vim/pos test -- accesos-inicio cuenta-barra` → FAIL.

- [ ] **Step 2: Implementar**

`accesos-inicio.ts`, `turno.ts` (el tipo y `barra: n("BARRA")`) y `cuenta-barra.ts`, usando `employeeClient` del mismo módulo que `cuenta-mesa.ts`. `moverCuentaAMesa` y `moverCuentaABarra` siguen la misma forma. Revisar quién usa `CuentasAbiertasPorModo` o construye el objeto de cuentas (por ejemplo `home-pos.tsx:178` y su estado inicial) y agregar `barra: 0` donde haga falta para que compile.

Run: `pnpm --filter @vim/pos test && pnpm --filter @vim/pos typecheck` → verde.

- [ ] **Step 3: Commit**

```bash
git add apps/pos
git commit -m "feat(barra): la caja sabe contar, nombrar y abrir cuentas de barra"
```

---

### Task 4: La caja — pantallas de barra

**Files:**
- Modify: `apps/pos/app/components/pantalla-inicio.tsx` (acceso Barra, prop `nCuentasBarra`, `onBarra?`)
- Modify: `apps/pos/app/components/home-pos.tsx` (estado `enBarra`, `Origen` con `"barra"`, cableado)
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx` (que liste BARRA)
- Modify: `apps/pos/app/components/modal-nombre-cuenta.tsx` (modo obligatorio, sin "Omitir", con sugerencia)
- Modify: `apps/pos/app/lib/cuenta-mesa.ts` (`mapearModo`), solo si hace falta para la Review Focus 3
- Modify: `apps/pos/app/components/pantalla-turno.tsx` (la `PantallaInicio` sin turno recibe `onBarra={abrir}` y `nCuentasBarra={0}`)

**Interfaces:**
- Consumes: todo lo de la Tarea 3; `listarCuentasAbiertas(token, sucursalId, modos, …)` (`lib/cuentas-abiertas.ts`), que ya acepta una lista de modos y devuelve `cliente` (desde `nombre_cliente`), `total`, `desdeIso` y `nItems`; `entrarCuenta(ticketId, origen)` (`home-pos.tsx` ~856); `ModalNumeroMesa` (se usa para elegir mesa en Comedor).

Comportamiento, en este orden:

- [ ] **Step 1: Leer antes de tocar**

Leer `docs/diseno/pos.md` y cargar `emil-design-eng` y `ponytail`. Leer en `home-pos.tsx` el flujo de Pick-up de punta a punta (`enPickup`, `PantallaCuentasModo` con `DRIVE_THRU`, `onAbrirCuenta`, `ModalNombreCuenta`, `entrarCuenta(…, "pickup")`, `volverAtras`), porque Barra lo copia. Ubicar dónde están hoy las acciones por cuenta dentro de una cuenta abierta (por ejemplo "Poner en espera" o "Cancelar cuenta"); ahí van "Pasar a mesa" y "Pasar a barra". Anotar en el reporte qué se encontró.

- [ ] **Step 2: Comprobar la Review Focus 3 (RED si falla)**

Buscar el camino de cobro de una cuenta abierta (`entrarCuenta` → carrito con `reconstruirCarrito`/`mapearModo` → `persistirTicket` o el cobro de cuenta abierta). Si algún `update` o RPC reescribe `tickets.modo_servicio` desde el modo del carrito, escribir primero una prueba de lib que lo demuestre (con el mock de `cobro.test.ts`) y corregirlo para que una cuenta ya persistida conserve su modo. Si nada lo reescribe, decirlo en el reporte con las líneas revisadas; no hace falta cambio.

- [ ] **Step 3: El acceso Barra**

En `PantallaInicio`:
- Prop opcional `onBarra?: () => void` y `nCuentasBarra?: number` (default 0).
- `ver = accesosInicio(acceso.modulos, { …, barra: nCuentasBarra })`.
- Acceso `{ver.barra && onBarra && <Acceso label="Barra" badge={nCuentasBarra} onClick={onBarra} requiereTurno={sinTurno} icon={<Icono nombre="…" />} />}` después de Comedor. Elegir un ícono existente del set (`docs/diseno/iconos/` o el componente `Icono`), sin dibujar uno nuevo; si ninguno encaja, usar el de "mesa" y anotarlo.

En `home-pos.tsx`:
- `nCuentasBarra={cuentasAbiertas.barra}`.
- `onBarra={() => { setEnInicio(false); setEnBarra(true); }}`.

- [ ] **Step 4: La lista y abrir**

- La rama de listas (`if (enDelivery || enPickup || enMesas …)`) incluye `enBarra`.
- `PantallaCuentasModo` acepta `modo="BARRA"`. Agregar `"BARRA"` a su tipo de `modo` sin tocar el tipo del carrito; si el `Extract<ModoServicio, …>` lo impide, declarar el prop como `ModoServicio | "BARRA"` y anotarlo. Lista con `listarCuentasAbiertas(token, sucursalId, ["BARRA"], …)`. Las tarjetas muestran nombre, total y tiempo abierta, como las de Pick-up.
- "Abrir cuenta" en Barra abre `ModalNombreCuenta` en modo obligatorio:
  - sin botón "Omitir";
  - con el nombre sugerido de `nombreLibre(lo escrito, nombres de las cuentas listadas)` cuando el escrito ya existe ("Ya hay una cuenta con ese nombre. ¿La abrimos como «Luis 2»?").
- Al confirmar:
  - `abrirCuentaBarra(…, { clientIdLocal: \`cuenta-${nuevoClientId()}\` })` → `entrarCuenta(ticketId, "barra")`.
  - Si lanza `NombreEnUso` (otra caja ganó), el modal se queda abierto con `nombreLibre(e.nombre, [...listados, e.nombre])` sugerido.
- `volverAtras` desde una cuenta con origen `"barra"` regresa a la lista de Barra.

- [ ] **Step 5: Pasar entre barra y mesa**

En el lugar de las acciones por cuenta (Step 1):
- **"Pasar a mesa"**, visible si la cuenta es BARRA y `moduloActivo(modulos, "comedor")`. Abre `ModalNumeroMesa`; al elegir, `moverCuentaAMesa(token, ticketId, mesaId, \`cuenta-${nuevoClientId()}\`)`. Después, la cuenta sigue abierta con origen `"mesas"`.
- **"Pasar a barra"**, visible si la cuenta es de mesa y `moduloActivo(modulos, "cuentas_barra")`. Abre `ModalNombreCuenta` obligatorio; al confirmar, `moverCuentaABarra(token, ticketId, nombre)`, con el mismo manejo de `NombreEnUso`.
- Los errores de mesa ocupada que vengan de `asignar_mesa_a_ticket` se enseñan con el texto de error que ya usa Comedor.

> Para saber si la cuenta abierta es de barra o de mesa, usar el `modo_servicio` del ticket que ya se lee al entrar (`entrarCuenta` / `leerTotales`). Si no se lee, agregarlo al `select` existente en vez de hacer otra consulta.

- [ ] **Step 6: Tipos y pruebas**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test` → verde.

- [ ] **Step 7: Commit**

```bash
git add apps/pos
git commit -m "feat(barra): acceso Barra en la caja, abrir por nombre y pasar entre barra y mesa"
```

---

### Task 5: Documentos

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md` (§8, §7 fila de /platform, §9)
- Modify: `docs/decisiones/0034-el-giro-arma-el-juego-inicial-y-vim-lo-ajusta.md`

- [ ] **Step 1**

**Spec §8:**
- El nombre vive en `tickets.nombre_cliente`, la columna de Pick-up, y no en `nombre_cuenta`. Explicarlo en una frase, con lo que ahorra: impresión, KDS y sincronización sin cambios.
- Abrir y pasar entre barra y mesa son RPC atómicas.
- El nombre único es un índice parcial.
- Los reportes la muestran en "Ventas por tipo de servicio".
- El ticket dice "Servicio: Barra" y "Cliente: …". No se imprime el número de mesa, ni antes ni ahora.

**Spec §7:** la fila de /platform pasa a "los diez interruptores".

**Spec §9:** el smoke de barra y el de Playwright quedan como se hicieron (smoke SQL + verificación visual del controlador).

**ADR 0034:**
- Estado "vigente (entregas 1, 2 y 3)".
- En "Cómo se despliega", sumar la 0183 a la lista de migraciones a mano. Decir que apaga `cuentas_barra` a los negocios existentes que no son BAR.

- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs(barra): spec y ADR 0034 con la entrega 3"
```

---

### Task 6: Verificación completa (controlador)

- [ ] **Step 1:** `pnpm typecheck`, `pnpm --filter @vim/pos test`, `pnpm --filter @vim/admin test`, `pnpm --filter @vim/platform test`, `pnpm test:functions` y `npm --prefix desktop run smokes`. Todo en verde.

- [ ] **Step 2: Verificación visual de la caja de un bar**

Backend temporal en 54370, como en la entrega 2 (script en el scratchpad, `launch.json` temporal).
1. Poner la semilla en `operacion = juego_inicial_de_giro('BAR')`.
2. Comprobar que aparece el acceso **Barra**.
3. Abrir "Luis" y, desde otra cuenta, intentar abrir "luis": debe proponer "luis 2".
4. Agregar un producto, mandar a cocina y cobrar. Comprobar en la base que el ticket quedó `BARRA` y `PAGADO`.
5. Pasar una cuenta de barra a una mesa y de vuelta.
6. Con la semilla en "negocio de siempre" (todo encendido salvo eventos y barra): **sin** acceso Barra.

Captura de cada estado. Limpiar todo al terminar.

---

## Lo que esta entrega no hace

- Un contador de barra en el estado de resultados (ruling 4).
- Liberar BAR, CAFETERIA y TAQUERIA para negocios que ya existen. Sigue esperando a que la 0179 esté en todas las cajas.
- La sincronización de propinas a la caja (tarea aparte).
