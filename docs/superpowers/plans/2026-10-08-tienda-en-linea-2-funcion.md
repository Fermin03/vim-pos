# Tienda en línea · Entrega 2: la función pública — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un servidor de confianza pueda pedirle a la nube el negocio, el menú, una cotización, crear un pedido de la tienda y consultar su seguimiento, con todo validado y recalculado del lado del servidor.

**Architecture:** La lógica vive en funciones SQL nuevas (solo `service_role`), probadas con smokes contra un Postgres real: estado de la tienda, menú, cotización, alta del pedido y seguimiento. La Edge Function `tienda` es delgada: comprueba el secreto interno, limita el ritmo, valida la forma del cuerpo y llama a esas funciones. La cotización reproduce la aritmética del ticket, y la prueba que la vigila es de ida y vuelta: cotizar → crear el pedido → `crear_ticket_desde_tienda` tiene que aceptarlo.

**Tech Stack:** PostgreSQL / PL/pgSQL, smokes `.sql`, Edge Function en Deno/TypeScript, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` (§7, §10, §12 entrega 2). El contrato que la entrega 1 le impuso a esta función está al final de `docs/superpowers/plans/2026-10-08-tienda-en-linea-1-base.md` («Contrato para la entrega 2»): **es requisito de este plan, léelo**.

**Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-08-tienda-2-hechos-del-codigo.md`. Hechos del código vigente con `archivo:línea`: la aritmética exacta del ticket, qué valida y qué no `agregar_item_a_ticket`, la forma de un combo, qué filtra el catálogo de la caja, y los helpers `_shared` de las funciones. Las tareas remiten a sus secciones como «Anexo §N».

Plan 2 de 7. No incluye cuentas de clientes (entrega 6), ni admin (3), ni caja (4), ni la tienda pública (5).

## Cómo leer este plan

Las tareas 1, 5, 6 y 7 traen el código completo. Las tareas 2, 3 y 4 traen el **contrato exacto** (firma, forma del JSON de entrada y salida, códigos de error, reglas con su fuente) y la **lista de casos que el smoke debe afirmar**, pero no el cuerpo de la función: esa aritmética solo se puede dar por buena ejecutándola, y quien escribió el plan no podía ejecutarla. Quien implemente escribe primero el smoke con todos los casos, lo ve fallar, y luego la función. **Si un caso falla, se corrige la función, no el caso**; si crees que el caso está mal, repórtalo en vez de cambiarlo.

## Global Constraints

- **Cargar la skill `ponytail` antes de escribir código.** Reutilizar antes que crear.
- **RLS sagrado.** Ninguna tabla ni función nueva para `anon` ni `authenticated`. Todas las funciones SQL de este plan: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE … TO service_role`.
- **Dinero nunca en float.** `numeric(12,2)` en SQL. En JSON los importes viajan como texto decimal (`"150.00"`), igual que en `_shared/delivery/tipos.ts`.
- **El negocio sale siempre del `slug`** (`tienda_config.slug`), nunca de un `tenant_id` enviado por el cliente. Toda función que recibe `p_tenant` comprueba que la sucursal, la zona, los productos y las opciones son de ese negocio.
- **Español en el dominio**, SQL `snake_case`, archivos `kebab-case`. Sin `any` en TS. Las funciones de Deno **no usan zod** (Node no resuelve `npm:` en las pruebas): validación a mano, como `_shared/alta.ts`.
- **Migración:** número tentativo **0162**. Antes de crear el archivo: `git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -3` y `git worktree list`. Si está tomado, usar el siguiente y sustituirlo en todo el plan. Corre también en el Postgres embebido de la caja: nada de `storage.*`, `cron.*` ni `pg_net` sin guarda.
- **Hora de México por negocio:** la zona horaria es `COALESCE(sucursales.timezone, tenants.timezone)`. Nunca `CURRENT_DATE`.
- **Errores SQL con código al frente:** `RAISE EXCEPTION 'CODIGO: detalle'`, como el resto del repo. La función de Deno toma lo que va antes de `:`.
- **Smokes:** `cd desktop && npm run smokes -- <archivo>`; corren como `postgres` en una transacción que se revierte. La semilla solo trae dos productos con IVA incluido y ningún combo (Anexo §11): cada smoke crea lo que necesita, tomando de modelo `supabase/scripts/smoke_combos.sql` (combos e IVA por fuera) y `smoke_envio.sql` (zonas).
- **Lo existente no cambia:** `smoke_tienda_*.sql` de la entrega 1, `smoke_delivery_app.sql`, `smoke_combos_uber.sql` y `smoke_combos.sql` siguen en verde.
- **No se toca `desktop/`** ni `apps/`.
- **Nada se despliega, ni se aplica a producción, ni se crea un secreto sin el visto bueno explícito de Fermín** (Task 8).
- No usar el CLI `supabase` para nada local (`db reset` borra el Supabase que comparten otras sesiones), ni `next build`, ni `git stash`.
- Commits en español con el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| Crear `supabase/migrations/0162_tienda_funcion.sql` | Las funciones SQL, en secciones §1–§5 |
| Crear `supabase/scripts/smoke_tienda_estado.sql` | Horario, estado de sucursal, `tienda_negocio` |
| Crear `supabase/scripts/smoke_tienda_menu.sql` | `tienda_menu` |
| Crear `supabase/scripts/smoke_tienda_cotizar.sql` | `tienda_cotizar`: totales y rechazos |
| Crear `supabase/scripts/smoke_tienda_pedido.sql` | `tienda_crear_pedido` y la ida y vuelta hasta el ticket |
| Crear `supabase/scripts/smoke_tienda_seguimiento.sql` | `tienda_seguimiento` |
| Crear `supabase/functions/_shared/tienda/validar.ts` + `.test.ts` | Forma de los cuerpos, teléfono, texto libre |
| Crear `supabase/functions/_shared/tienda/seguimiento.ts` + `.test.ts` | Código de seguimiento y su huella |
| Crear `supabase/functions/_shared/tienda/correo-pedido.ts` + `.test.ts` | Asunto y cuerpo del correo de confirmación |
| Crear `supabase/functions/tienda/index.ts` | El handler |
| Modificar `supabase/functions/_shared/turnstile.ts` | Acción `tienda_pedido` |
| Modificar `supabase/config.toml` | `[functions.tienda] verify_jwt = false` |
| Modificar `package.json` (raíz) | `test:functions` incluye `_shared/tienda/*.test.ts` |

## Formas compartidas

**Carrito** (entrada de `tienda_cotizar` y `tienda_crear_pedido`, `p_items jsonb`):

```json
[
  { "producto_id": "uuid", "cantidad": 2, "nota": "sin cebolla",
    "modificadores": [ { "opcion_id": "uuid", "cantidad": 1 } ] },
  { "producto_id": "uuid-de-un-combo", "cantidad": 1,
    "componentes": [
      { "grupo_id": "uuid de combo_grupos", "producto_id": "uuid", "cantidad": 1,
        "modificadores": [ { "opcion_id": "uuid", "cantidad": 1 } ] } ] }
]
```

**Renglones normalizados** (lo que se guarda en `delivery_pedidos.items`; es la forma que `_delivery_items_a_ticket` ya consume, Anexo §4 y `_shared/delivery/tipos.ts`):

```json
[
  { "producto_id": "uuid", "nombre_app": "Hamburguesa Clásica", "cantidad": 2,
    "precio_unitario_mxn": "120.00", "nota": "sin cebolla", "alergenos": [], "alergia_nota": null,
    "modificadores": [
      { "opcion_modificador_id": "uuid", "grupo_id": null, "nombre_app": "Extra queso",
        "cantidad": 1, "precio_extra_mxn": "15.00" } ] },
  { "producto_id": "uuid-combo", "nombre_app": "Combo", "cantidad": 1,
    "precio_unitario_mxn": "150.00", "nota": null, "alergenos": [], "alergia_nota": null,
    "modificadores": [
      { "opcion_modificador_id": "uuid DEL PRODUCTO elegido", "grupo_id": "uuid del slot",
        "nombre_app": "Papas Gajo", "cantidad": 1, "precio_extra_mxn": "0.00",
        "modificadores": [ { "opcion_modificador_id": "uuid", "grupo_id": null,
                             "nombre_app": "Bien cocida", "cantidad": 1, "precio_extra_mxn": "0.00" } ] } ] }
]
```

Tres reglas de esa forma que no se pueden romper (Anexo §4):
- En un producto simple, `grupo_id` va en `null`. En un combo, **solo las elecciones de slot** llevan `grupo_id`, y su `opcion_modificador_id` es el id del **producto** elegido.
- `cantidad` de modificadores y elecciones es un entero JSON (`1`, no `1.0`), y la de una elección es por **unidad** de combo.
- `precio_extra_mxn` nunca falta ni es `null`.

**Modo:** `'RECOGER'` (→ `app = 'DRIVE_THRU'`, `tipo_entrega = 'RECOGE_CLIENTE'`) o `'DOMICILIO'` (→ `'DELIVERY_PROPIO'`, `'RESTAURANTE_REPARTE'`).

---

### Task 1: estado de la tienda y datos del negocio

**Files:**
- Create: `supabase/migrations/0162_tienda_funcion.sql` (§1)
- Test: `supabase/scripts/smoke_tienda_estado.sql`

**Interfaces:**
- Consumes: `tienda_config`, `tienda_sucursales`, `sucursal_recibe_pedidos(uuid, integer)`, `modulos_efectivos(uuid)`, `zonas_envio` (todo de la entrega 1 o anterior).
- Produces:
  - `tienda_horario_abierto(p_horario jsonb, p_ahora timestamptz, p_tz text) RETURNS boolean`
  - `tienda_estado_sucursal(p_sucursal uuid, p_modo text, p_ahora timestamptz DEFAULT now()) RETURNS text` — `NULL` = recibe pedidos; si no, el primero que aplique de: `TIENDA_NO_DISPONIBLE`, `NO_PARTICIPA`, `MODO_NO_DISPONIBLE`, `EN_PAUSA`, `FUERA_DE_HORARIO`, `CAJA_NO_LISTA`.
  - `tienda_negocio(p_slug text, p_ahora timestamptz DEFAULT now()) RETURNS jsonb` — `NULL` si la tienda no existe o no está disponible.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_tienda_estado.sql`. Fixture sobre la semilla (negocio `99999999-0000-0000-0000-0000000000aa`, sucursal `…bb`, caja `…cc`): fila en `configuracion_tenant` con `modulo_tienda_activo = true`; `tenant_addons` de `TIENDA` vigente (fecha en hora de México, como en `smoke_tienda_modulo.sql`); `tienda_config` con `slug = 'knockout-smoke'`; `tienda_sucursales` con `participa`, `recoger = true`, `domicilio = true` y horario `{"1":["13:00","22:00"],"5":["18:00","02:00"]}`; una zona de envío activa; `cajas.espejo_turno_abierto_at = now()`.

Casos de `tienda_horario_abierto` (zona `America/Mexico_City`; usar marcas de tiempo fijas con `AT TIME ZONE`, por ejemplo `'2026-10-05 14:00'::timestamp AT TIME ZONE 'America/Mexico_City'`, que es lunes):

| # | Horario | Momento local | Esperado |
|---|---|---|---|
| 1 | `{"1":["13:00","22:00"]}` | lunes 14:00 | true |
| 2 | igual | lunes 12:59 | false |
| 3 | igual | lunes 22:00 | false (el cierre no se incluye) |
| 4 | igual | martes 14:00 | false (día ausente = cerrado) |
| 5 | `{"5":["18:00","02:00"]}` | viernes 23:30 | true |
| 6 | igual | sábado 01:30 | true (tramo de ayer que cruza la medianoche) |
| 7 | igual | sábado 02:00 | false |
| 8 | igual | viernes 01:30 | false (el jueves no abre) |
| 9 | `{"1":"siempre"}`, `{"1":["25:00","x"]}`, `{}` y `NULL` | lunes 14:00 | false (mal formado = cerrado) |
| 10 | `{"7":["00:00","00:00"]}` | domingo 10:00 | true (abierto todo el día) |

Casos de `tienda_estado_sucursal` (pasar `p_ahora` = lunes 14:00 salvo que se diga):

| # | Cambio sobre el fixture | Modo | Esperado |
|---|---|---|---|
| 11 | ninguno | RECOGER | `NULL` |
| 12 | ninguno | DOMICILIO | `NULL` |
| 13 | `modulo_tienda_activo = false` | RECOGER | `TIENDA_NO_DISPONIBLE` |
| 14 | `tienda_sucursales.participa = false` | RECOGER | `NO_PARTICIPA` |
| 15 | `domicilio = false` | DOMICILIO | `MODO_NO_DISPONIBLE` |
| 16 | zona de envío desactivada (sin zonas activas) | DOMICILIO | `MODO_NO_DISPONIBLE` |
| 17 | `pausa_hasta = p_ahora + 10 min` | RECOGER | `EN_PAUSA` |
| 18 | `pausa_hasta = p_ahora - 1 min` | RECOGER | `NULL` |
| 19 | `p_ahora` = lunes 23:00 | RECOGER | `FUERA_DE_HORARIO` |
| 20 | `cajas.espejo_turno_abierto_at = NULL` (con `p_ahora = now()` y un horario que abra ahora todos los días) | RECOGER | `CAJA_NO_LISTA` |
| 21 | modo `'MESA'` | — | `MODO_NO_DISPONIBLE` |
| 22 | sucursal de otro negocio sin fila en `tienda_sucursales` | RECOGER | `NO_PARTICIPA` |

Cada caso restaura el fixture antes del siguiente. El caso 20 es el único que depende del reloj real: `sucursal_recibe_pedidos` usa `now()`.

Casos de `tienda_negocio`:

| # | Entrada | Esperado |
|---|---|---|
| 23 | `'knockout-smoke'` | objeto con `nombre`, `color`, `pago_efectivo`, `sucursales` (una) |
| 24 | la sucursal del objeto | trae `id`, `nombre`, `recoger`, `domicilio`, `horario`, `estado.recoger`, `estado.domicilio`, y `zonas` con la zona activa (`id`, `nombre`, `costo_mxn` como texto) |
| 25 | `'no-existe'` | `NULL` |
| 26 | con `modulo_tienda_activo = false` | `NULL` |
| 27 | con `tenants.deleted_at = now()` | `NULL` |
| 28 | el objeto del caso 23 | **no** contiene la clave `tenant_id` en la raíz pública (va aparte, ver abajo) |

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `cd desktop && npm run smokes -- smoke_tienda_estado.sql`
Expected: ❌ `function tienda_horario_abierto(jsonb, timestamp with time zone, text) does not exist`.

- [ ] **Step 3: Escribir §1 de la migración**

Crear `supabase/migrations/0162_tienda_funcion.sql`:

```sql
-- ============================================================================
-- 0162 — Tienda en línea, entrega 2: las funciones que usa la función pública `tienda`.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md (§7, §10)
--
-- Toda la lógica vive aquí y no en la Edge Function por dos razones: se prueba con smokes contra
-- un Postgres real, y la cotización tiene que dar el MISMO total que recalcular_totales_ticket al
-- centavo — crear_ticket_desde_tienda (0161) rechaza el pedido si no coincide.
--
-- Todas son SECURITY DEFINER y solo para service_role: el público nunca las llama; las llama la
-- Edge Function, que a su vez solo atiende al servidor de la tienda.
-- ============================================================================

-- ── §1 Estado de la tienda y datos del negocio ───────────────────────────────

-- ¿Cae p_ahora dentro del horario? p_horario: {"1": ["13:00","22:00"], …}, 1 = lunes … 7 = domingo.
-- Día ausente = cerrado. Cierre <= apertura = cierra pasada la medianoche (o, si son iguales, no
-- cierra). Cualquier cosa mal formada cuenta como cerrado: una tienda que no se sabe si abre, no abre.
CREATE OR REPLACE FUNCTION tienda_horario_abierto(p_horario jsonb, p_ahora timestamptz, p_tz text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local timestamp;
  v_hora  time;
  v_dow   integer;
  v_ayer  integer;
  v_a     time;
  v_c     time;
BEGIN
  IF p_horario IS NULL OR jsonb_typeof(p_horario) <> 'object' OR p_ahora IS NULL THEN RETURN false; END IF;
  v_local := p_ahora AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'America/Mexico_City');
  v_hora  := v_local::time;
  v_dow   := EXTRACT(isodow FROM v_local)::integer;
  v_ayer  := CASE WHEN v_dow = 1 THEN 7 ELSE v_dow - 1 END;

  -- El tramo de hoy.
  BEGIN
    v_a := (p_horario -> v_dow::text ->> 0)::time;
    v_c := (p_horario -> v_dow::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL THEN
    IF v_c > v_a  AND v_hora >= v_a AND v_hora < v_c THEN RETURN true; END IF;
    IF v_c <= v_a AND v_hora >= v_a THEN RETURN true; END IF;
  END IF;

  -- El tramo de ayer, si cruzó la medianoche.
  BEGIN
    v_a := (p_horario -> v_ayer::text ->> 0)::time;
    v_c := (p_horario -> v_ayer::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL AND v_c <= v_a AND v_hora < v_c THEN RETURN true; END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) TO service_role;

-- ¿Recibe pedidos esta sucursal en este modo? NULL = sí. Si no, el motivo, en este orden.
CREATE OR REPLACE FUNCTION tienda_estado_sucursal(p_sucursal uuid, p_modo text, p_ahora timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_suc  record;
  v_ts   tienda_sucursales%ROWTYPE;
BEGIN
  SELECT s.id, s.tenant_id, COALESCE(s.timezone, t.timezone) AS tz
    INTO v_suc
    FROM sucursales s JOIN tenants t ON t.id = s.tenant_id
   WHERE s.id = p_sucursal AND s.deleted_at IS NULL AND s.activa
     AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN 'TIENDA_NO_DISPONIBLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM tienda_config c WHERE c.tenant_id = v_suc.tenant_id)
     OR COALESCE((modulos_efectivos(v_suc.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN 'TIENDA_NO_DISPONIBLE';
  END IF;

  SELECT * INTO v_ts FROM tienda_sucursales WHERE sucursal_id = p_sucursal AND tenant_id = v_suc.tenant_id;
  IF NOT FOUND OR NOT v_ts.participa THEN RETURN 'NO_PARTICIPA'; END IF;

  IF p_modo = 'RECOGER' THEN
    IF NOT v_ts.recoger THEN RETURN 'MODO_NO_DISPONIBLE'; END IF;
  ELSIF p_modo = 'DOMICILIO' THEN
    IF NOT v_ts.domicilio
       OR NOT EXISTS (SELECT 1 FROM zonas_envio z
                       WHERE z.sucursal_id = p_sucursal AND z.tenant_id = v_suc.tenant_id
                         AND z.activa AND z.deleted_at IS NULL) THEN
      RETURN 'MODO_NO_DISPONIBLE';
    END IF;
  ELSE
    RETURN 'MODO_NO_DISPONIBLE';
  END IF;

  IF v_ts.pausa_hasta IS NOT NULL AND v_ts.pausa_hasta > p_ahora THEN RETURN 'EN_PAUSA'; END IF;
  IF NOT tienda_horario_abierto(v_ts.horario, p_ahora, v_suc.tz) THEN RETURN 'FUERA_DE_HORARIO'; END IF;
  IF NOT sucursal_recibe_pedidos(p_sucursal) THEN RETURN 'CAJA_NO_LISTA'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) TO service_role;

-- Lo que la tienda enseña del negocio. NULL = no hay tienda que enseñar (no existe, el negocio
-- está de baja o bloqueado, o no tiene el módulo). La Edge Function responde igual en los tres
-- casos: no se confirma qué direcciones existen.
-- Devuelve {tenant_id, publico: {…}}: `tenant_id` es para la función, que NUNCA lo manda al cliente.
CREATE OR REPLACE FUNCTION tienda_negocio(p_slug text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c  tienda_config%ROWTYPE;
  v_t  record;
  v_sucursales jsonb;
BEGIN
  SELECT * INTO v_c FROM tienda_config WHERE slug = lower(btrim(COALESCE(p_slug, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT t.id, t.nombre_comercial, t.logo_png_url INTO v_t
    FROM tenants t
   WHERE t.id = v_c.tenant_id AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE((modulos_efectivos(v_c.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'telefono', s.telefono,
           'direccion', NULLIF(concat_ws(', ',
                          NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                          s.direccion_colonia, s.ciudad), ''),
           'recoger', ts.recoger,
           'domicilio', ts.domicilio,
           'horario', ts.horario,
           'estado', jsonb_build_object(
             'recoger',   tienda_estado_sucursal(s.id, 'RECOGER', p_ahora),
             'domicilio', tienda_estado_sucursal(s.id, 'DOMICILIO', p_ahora)),
           'zonas', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'costo_mxn', z.costo_mxn::text)
                              ORDER BY z.orden, z.nombre)
               FROM zonas_envio z
              WHERE z.sucursal_id = s.id AND z.tenant_id = v_c.tenant_id AND z.activa AND z.deleted_at IS NULL),
             '[]'::jsonb))
         ORDER BY s.nombre), '[]'::jsonb)
    INTO v_sucursales
    FROM tienda_sucursales ts
    JOIN sucursales s ON s.id = ts.sucursal_id AND s.tenant_id = ts.tenant_id
   WHERE ts.tenant_id = v_c.tenant_id AND ts.participa AND s.activa AND s.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'tenant_id', v_c.tenant_id,
    'publico', jsonb_build_object(
      'slug', v_c.slug,
      'nombre', v_t.nombre_comercial,
      'logo_url', v_t.logo_png_url,
      'color', v_c.color,
      'descripcion', v_c.descripcion,
      'pago_efectivo', v_c.pago_efectivo,
      'pago_tarjeta', v_c.pago_tarjeta,
      'sucursales', v_sucursales));
END;
$$;
REVOKE ALL ON FUNCTION tienda_negocio(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_negocio(text, timestamptz) TO service_role;
```

En el smoke, los casos 23–28 leen `tienda_negocio(...) -> 'publico'`; el caso 28 afirma que `publico` no tiene la clave `tenant_id`.

- [ ] **Step 4: Verde**

Run: `cd desktop && npm run smokes -- smoke_tienda_estado.sql`
Expected: ✅. Si un nombre de columna de `sucursales`, `tenants` o `zonas_envio` no existe, corregirlo contra el Anexo §9 y la tabla real (`0003`, `0002`, `0116`), sin cambiar lo que devuelve la función.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0162_tienda_funcion.sql supabase/scripts/smoke_tienda_estado.sql
git commit -m "feat(tienda): estado de la tienda, horario y datos públicos del negocio"
```

---

### Task 2: el menú

**Files:**
- Modify: `supabase/migrations/0162_tienda_funcion.sql` (§2)
- Test: `supabase/scripts/smoke_tienda_menu.sql`

**Interfaces:**
- Consumes: `precio_producto_en_sucursal(uuid, uuid)`, `motivo_no_disponible_en_sucursal(uuid, uuid)` (0152).
- Produces: `tienda_menu(p_tenant uuid, p_sucursal uuid) RETURNS jsonb`. Lanza `SUCURSAL_DE_OTRO_NEGOCIO` si la sucursal no es de `p_tenant`.

**Salida:**

```json
{ "categorias": [
  { "id": "uuid", "nombre": "Hamburguesas", "productos": [
    { "id": "uuid", "nombre": "…", "descripcion": null, "imagen_url": null,
      "precio_mxn": "120.00", "agotado": false, "es_combo": false,
      "grupos": [
        { "id": "uuid", "nombre": "Término", "tipo_seleccion": "UNICA_OBLIGATORIA",
          "minimo": 1, "maximo": 1,
          "opciones": [ { "id": "uuid", "nombre": "…", "precio_extra_mxn": "0.00",
                          "agotada": false, "es_default": true } ] } ],
      "slots": [] } ] } ] }
```

Para un combo, `grupos` va vacío y `slots` trae:

```json
{ "id": "uuid de combo_grupos", "nombre": "Bebida", "minimo": 1, "maximo": 1,
  "opciones": [ { "producto_id": "uuid", "nombre": "…", "precio_extra_mxn": "0.00",
                  "agotado": false, "es_default": false,
                  "grupos": [ …los grupos de modificadores de ese producto, misma forma… ] } ] }
```

**Reglas** (la tienda enseña lo que la caja vende en esa sucursal; fuente: Anexo §5 y §6):

1. Categorías: `deleted_at IS NULL AND activa`, por `orden_visualizacion`. Una categoría sin productos visibles no sale.
2. Productos: de `p_tenant`, `deleted_at IS NULL`, `visible_en_pos`, y `motivo_no_disponible_en_sucursal(id, p_sucursal)` es `NULL` o `'AGOTADO'`. `PAUSADO` y `NO_SE_VENDE` no salen. `agotado` = el motivo es `'AGOTADO'`. Orden: `orden_visualizacion`, luego `nombre`.
3. `precio_mxn` = `precio_producto_en_sucursal(id, p_sucursal)`.
4. `minimo`/`maximo` de un grupo, normalizados por `tipo_seleccion` para que el cliente no tenga que conocer los tipos: `UNICA_OBLIGATORIA` → 1/1; `UNICA_OPCIONAL` → 0/1; `MULTIPLE_OPCIONAL` → `COALESCE(minimo_selecciones, 0)` / `maximo_selecciones` (puede ser `null` = sin tope); `MULTIPLE_OBLIGATORIA_RANGO` → sus valores.
5. Grupos: ligados por `productos_grupos_modificadores`, `activo` y sin borrar, por el `orden_visualizacion` de la liga. Opciones: `activa`, sin borrar y con `precio_extra_mxn >= 0` (una negativa rompería el ticket: Anexo §3), por `orden_visualizacion`. `agotada` se enseña, no se oculta.
6. Un grupo obligatorio (`minimo >= 1`) que se queda sin ninguna opción vendible (todas agotadas o ninguna) hace que el producto salga con `agotado = true`.
7. Slots de un combo: `combo_grupos` `activo` y sin borrar, por `orden_visualizacion`. Opciones de un slot, igual que valida `agregar_combo_a_ticket` (Anexo §4):
   - Slot con `categoria_id`: los productos de esa categoría que no son combo, visibles, sin borrar, cuyo motivo no es `PAUSADO` ni `NO_SE_VENDE`, y que no tengan una fila `combo_opciones` con `activa = false`. Su delta es el `precio_delta_mxn` de su fila activa si la hay, si no 0.
   - Slot sin categoría: las filas `combo_opciones` activas y sin borrar cuyo producto cumple lo mismo.
   - `precio_extra_mxn` de la opción = `(modo_precio = 'SUMA_PRECIO_PRODUCTO' ? precio en sucursal del producto : 0) + delta`.
8. Un combo con algún slot de `minimo >= 1` sin opciones vendibles sale con `agotado = true`.
9. Todos los importes, como texto con dos decimales (`to_char(x, 'FM999999990.00')`).

- [ ] **Step 1: Escribir el smoke con estos casos**

Fixture propio (crear, no depender de más que el negocio y la sucursal de la semilla): una categoría con dos productos simples (uno con un grupo `UNICA_OBLIGATORIA` de dos opciones y un grupo `MULTIPLE_OPCIONAL` con una opción de $15 y otra **negativa**), un producto `PAUSADO`, uno con `visible_en_pos = false`, uno borrado, uno de **otro negocio**, uno con fila en `productos_sucursal` de precio propio, uno agotado en la sucursal, una categoría inactiva con un producto, y un combo con un slot por categoría (`DELTA`) y otro de opciones explícitas (`SUMA_PRECIO_PRODUCTO`) con una opción `activa = false`.

| # | Afirmar |
|---|---|
| 1 | Sale la categoría activa con sus productos visibles, en orden; no sale la inactiva |
| 2 | No salen: el pausado, el no visible, el borrado, el de otro negocio |
| 3 | El producto con precio de sucursal sale con ese precio, no el base |
| 4 | El agotado sale con `agotado = true` |
| 5 | El grupo `UNICA_OBLIGATORIA` sale con `minimo = 1`, `maximo = 1`; el `MULTIPLE_OPCIONAL` con `minimo = 0` |
| 6 | La opción de precio negativo no sale; la de $15 sale con `"15.00"` |
| 7 | Con las dos opciones del grupo obligatorio marcadas `agotada`, el producto sale `agotado = true` |
| 8 | El combo sale con `es_combo = true`, `grupos = []` y dos `slots` |
| 9 | El slot por categoría lista los productos de la categoría (no combos) con `precio_extra_mxn = "0.00"`; el de `SUMA_PRECIO_PRODUCTO` lista sus opciones con el precio del producto más el delta; la opción `activa = false` no sale |
| 10 | Una opción de slot con modificadores propios trae sus `grupos` |
| 11 | `tienda_menu(v_tenant, sucursal_de_otro_negocio)` lanza `SUCURSAL_DE_OTRO_NEGOCIO` |
| 12 | Ningún importe del JSON es un número: todos son texto con dos decimales |

- [ ] **Step 2: Rojo** — `cd desktop && npm run smokes -- smoke_tienda_menu.sql` → `function tienda_menu(uuid, uuid) does not exist`.
- [ ] **Step 3: Escribir §2** en la migración: `tienda_menu`, con sus `REVOKE`/`GRANT`. Para no repetir tres veces el armado de grupos, una función interna `_tienda_grupos_de(p_producto uuid, p_tenant uuid) RETURNS jsonb` (solo `REVOKE`, sin `GRANT`: la llaman funciones definer).
- [ ] **Step 4: Verde** — el smoke nuevo y `smoke_tienda_estado.sql`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0162_tienda_funcion.sql supabase/scripts/smoke_tienda_menu.sql
git commit -m "feat(tienda): menú público de una sucursal, con modificadores y combos"
```

---

### Task 3: la cotización

**Files:**
- Modify: `supabase/migrations/0162_tienda_funcion.sql` (§3)
- Test: `supabase/scripts/smoke_tienda_cotizar.sql`

**Interfaces:**
- Consumes: las de la Task 2; `zonas_envio`.
- Produces: `tienda_cotizar(p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb) RETURNS jsonb`.

**No comprueba si la tienda está abierta** (eso es de `tienda_crear_pedido`): cotizar con la tienda cerrada sirve para enseñar el carrito.

**Salida:**

```json
{ "items": [ …renglones normalizados, forma de «Formas compartidas»… ],
  "renglones": [ { "nombre": "Hamburguesa Clásica", "cantidad": 2, "detalle": "Extra queso",
                   "total_mxn": "270.00" } ],
  "subtotal_mxn": "270.00",
  "envio_mxn": "35.00",
  "envio_total_mxn": "35.00",
  "total_mxn": "305.00" }
```

- `subtotal_mxn`: suma de los totales de los renglones de producto (con su IVA si va por fuera).
- `envio_mxn`: el costo de la zona **tal como se guardará** en `delivery_pedidos.envio_mxn` (sin el IVA que el ticket le sume). `"0.00"` al recoger.
- `envio_total_mxn`: lo que el envío le cuesta al cliente (con IVA si va por fuera).
- `total_mxn` = `subtotal_mxn` + `envio_total_mxn`. **Es exactamente lo que dará `tickets.total_mxn`.**

**Aritmética** (Anexo §1 — reproducirla tal cual, redondeando donde ella redondea):

```
Por renglón del ticket (producto simple, padre de combo, cada hijo de combo, envío):
  bruto = round(cantidad * precio_unitario, 2)
  modif = Σ round(precio_extra * cantidad_mod * cantidad_del_renglón, 2)
  neto  = bruto + modif
  total = neto                                   si el producto lleva IVA incluido
        = neto + round(neto * tasa_iva / 100, 2)  si va por fuera
total del ticket = Σ total
```

- Producto simple: `precio_unitario` = precio en la sucursal; sus modificadores cobran `precio_extra_mxn` de la opción; IVA del producto.
- Combo, padre: `precio_unitario` = `precio en sucursal del combo + Σ(precio_extra de cada elección × cantidad de la elección)`, donde `precio_extra` de la elección es el de la regla 7 del menú; sin modificadores; IVA del **combo**.
- Combo, hijos: `precio_unitario` 0; `cantidad_del_renglón` = `cantidad de la elección × cantidad de combos`; sus modificadores sí cobran, con el IVA del **producto hijo**.
- Envío (solo `DOMICILIO` y zona con costo > 0): un renglón de cantidad 1 y precio = costo de la zona, con la `tasa_iva` y el `iva_incluido_en_precio` del **primer renglón del carrito** (si es un combo, los del combo).

**Validaciones y sus errores** (todas del servidor; `agregar_item_a_ticket` no valida casi nada: Anexo §3):

| Código | Cuándo |
|---|---|
| `SUCURSAL_DE_OTRO_NEGOCIO` | la sucursal no es de `p_tenant` |
| `MODO_INVALIDO` | `p_modo` no es `RECOGER` ni `DOMICILIO` |
| `CARRITO_INVALIDO` | `p_items` no es un arreglo, está vacío, tiene más de 40 renglones, un renglón no es objeto, falta `producto_id`, o `cantidad` no es un entero entre 1 y 50 |
| `PRODUCTO_NO_DISPONIBLE` | el producto no existe, es de otro negocio, está borrado, no es visible, o su motivo en la sucursal no es `NULL` (incluye agotado). El detalle lleva el `producto_id` |
| `MODIFICADORES_INVALIDOS` | una opción no existe, es de otro negocio, no está activa, está agotada, tiene precio negativo, su grupo no está ligado a ese producto o no está activo; la misma opción dos veces en el renglón; `cantidad` de opción no es entero 1..10; o la suma de cantidades de un grupo ligado y activo no cumple su mínimo y máximo (regla 4 del menú). El detalle lleva el `producto_id` |
| `COMBO_INVALIDO` | un combo trae `modificadores` propios; un componente apunta a un slot que no es de ese combo o no está activo; el producto no es opción válida de ese slot (regla 7 del menú) o no está disponible; el mismo `producto_id` aparece dos veces entre los componentes del renglón; `cantidad` de componente no es entero ≥ 1; la suma de cantidades de un slot activo no cumple su mínimo y máximo; o los modificadores de un componente no cumplen lo de la fila anterior |
| `ZONA_INVALIDA` | en `DOMICILIO`, `p_zona` es `NULL`, no es de esa sucursal y negocio, no está activa o está borrada; en `RECOGER`, `p_zona` no es `NULL` |
| `PRECIO_INVALIDO` | un precio unitario resultante es negativo |

Un producto simple con `componentes` también es `CARRITO_INVALIDO`.

- [ ] **Step 1: Escribir el smoke con estos casos**

Fixture propio, sobre el negocio y la sucursal de la semilla: los productos de la Task 2 (se puede copiar su fixture) más dos con **IVA por fuera** (16 % y 8 %), un combo con IVA incluido, un combo con **IVA por fuera** cuyo hijo tiene un modificador de pago, y dos zonas (una de $35, una de $0).

Totales calculados a mano (cada fila afirma `total_mxn`, y cuando se indica, otros campos):

| # | Carrito | Modo / zona | Esperado |
|---|---|---|---|
| 1 | 2 × producto de $120 (IVA incl.) | RECOGER | total `240.00`, envío `0.00` |
| 2 | 2 × $120 con 1 extra de $15 | RECOGER | `270.00` (el extra se multiplica por la cantidad del renglón) |
| 3 | 1 × $120 con el extra de $15 en cantidad 2 | RECOGER | `150.00` |
| 4 | 3 × producto de $33.33 con IVA 16 % por fuera | RECOGER | bruto `99.99`, IVA `16.00`, total `115.99` |
| 5 | 1 × $100 (IVA 8 % por fuera) + 1 × $120 (incl.) | RECOGER | `228.00` |
| 6 | caso 1 | DOMICILIO, zona $35 | envío `35.00`, envío total `35.00`, total `275.00` |
| 7 | 1 × $100 con IVA 16 % por fuera, primero en el carrito | DOMICILIO, zona $35 | subtotal `116.00`, envío `35.00`, envío total `40.60`, total `156.60` |
| 8 | caso 1 | DOMICILIO, zona $0 | envío `0.00`, total `240.00` |
| 9 | 1 combo de $150 (incl.), slot `DELTA` con una elección de delta $10 | RECOGER | precio del renglón `160.00`; total `160.00` |
| 10 | 2 combos, slot `SUMA_PRECIO_PRODUCTO` con una elección de producto de $30 y delta $5 | RECOGER | `precio_unitario_mxn = "150.00"`, elección con `precio_extra_mxn = "35.00"`; total `370.00` |
| 11 | 2 combos con IVA por fuera (16 %) de $100, cuyo hijo (IVA incl.) lleva un modificador de $10 | RECOGER | padre `232.00` + hijo `20.00` = `252.00` |

Forma de la salida:

| # | Afirmar |
|---|---|
| 12 | `items` de un producto simple: `grupo_id` es `null` en sus modificadores, `precio_extra_mxn` presente, `cantidad` es entero JSON (`jsonb_typeof = 'number'` y sin punto decimal en su texto) |
| 13 | `items` de un combo: cada elección lleva `grupo_id` = el slot y `opcion_modificador_id` = el **producto** elegido; sus modificadores anidados van en `modificadores` |
| 14 | `nombre_app` son los nombres del catálogo, no texto del cliente; `alergenos = []` |
| 15 | La `nota` se conserva recortada a 200 caracteres |

Rechazos (cada uno afirma el código):

| # | Entrada | Código |
|---|---|---|
| 16 | `p_items = '[]'`, `'{}'`, `NULL`, 41 renglones, `cantidad` 0, 51, 1.5 y `"2"` | `CARRITO_INVALIDO` |
| 17 | producto de otro negocio; borrado; pausado; agotado en la sucursal; no visible | `PRODUCTO_NO_DISPONIBLE` |
| 18 | sin elegir el grupo obligatorio; dos opciones en un grupo `UNICA_*`; opción de un grupo no ligado al producto; opción agotada; opción de otro negocio; opción repetida; opción de precio negativo | `MODIFICADORES_INVALIDOS` |
| 19 | combo sin llenar un slot obligatorio; componente de un slot de otro combo; producto que no es opción del slot; opción `activa = false`; mismo producto dos veces; combo con `modificadores` propios | `COMBO_INVALIDO` |
| 20 | `DOMICILIO` sin zona; con zona de otra sucursal; con zona inactiva. `RECOGER` con zona | `ZONA_INVALIDA` |
| 21 | modo `'MESA'` | `MODO_INVALIDO` |
| 22 | sucursal de otro negocio | `SUCURSAL_DE_OTRO_NEGOCIO` |

- [ ] **Step 2: Rojo** — `cd desktop && npm run smokes -- smoke_tienda_cotizar.sql`.
- [ ] **Step 3: Escribir §3.** Sugerencia de estructura para que no se vuelva inmanejable: una función interna `_tienda_modificadores(p_tenant, p_producto, p_mods jsonb, p_cantidad_renglon numeric) RETURNS jsonb` que valida las opciones de un producto y devuelve `{normalizados, monto}`; la usan el producto simple y cada componente de combo. Solo `REVOKE`, sin `GRANT`.
- [ ] **Step 4: Verde** — el smoke nuevo, `smoke_tienda_menu.sql` y `smoke_combos.sql`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0162_tienda_funcion.sql supabase/scripts/smoke_tienda_cotizar.sql
git commit -m "feat(tienda): cotización del carrito con la aritmética del ticket"
```

---

### Task 4: crear el pedido, y la ida y vuelta hasta el ticket

**Files:**
- Modify: `supabase/migrations/0162_tienda_funcion.sql` (§4)
- Test: `supabase/scripts/smoke_tienda_pedido.sql`

**Interfaces:**
- Consumes: `tienda_estado_sucursal`, `tienda_cotizar`, `sucursal_con_espejo(uuid, integer)` (0096), `lealtad_resolver_cliente(uuid, uuid, text)` (0156), `crear_ticket_desde_tienda(uuid)` (0161, solo en el smoke).
- Produces:

```sql
tienda_crear_pedido(
  p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
  p_cliente jsonb,          -- {"nombre": "...", "telefono": "4771112233", "email": "..."|null}
  p_direccion jsonb,        -- NULL al recoger; {calle, numero_exterior, numero_interior?, colonia, codigo_postal, ciudad, estado, referencias?}
  p_pago text,              -- 'EFECTIVO' | 'TARJETA'
  p_paga_con numeric,       -- NULL salvo EFECTIVO
  p_nota text,
  p_seguimiento_hash text,  -- SHA-256 en hex (64 caracteres) del código que solo conoce el cliente
  p_cuenta uuid DEFAULT NULL,
  p_total_esperado numeric DEFAULT NULL   -- el total que el cliente vio al cotizar; NULL = no se compara
) RETURNS jsonb             -- {"pedido_id", "folio_corto", "total_mxn", "vence_aceptacion"}
```

La función tiene **una sola firma** (con dos, PostgREST no sabría a cuál llamar).

**Reglas, en este orden** — salvo el bloqueo y el límite (puntos 3 y 4), que se evalúan **justo antes del INSERT** (punto 11), después de todas las demás validaciones: si fueran antes, una petición inválida a propósito serviría para preguntar por un teléfono sin crear ningún pedido. El candado `pg_advisory_xact_lock` por negocio y teléfono va con ellos.

1. `tienda_estado_sucursal(p_sucursal, p_modo)` debe ser `NULL`; si no, `TIENDA_CERRADA: <motivo>`. Y la sucursal debe ser de `p_tenant` (`SUCURSAL_DE_OTRO_NEGOCIO`).
2. Cliente: `nombre` de 1 a 100 caracteres tras recortar; `telefono` exactamente 10 dígitos (`^[0-9]{10}$`); `email` `NULL` o con forma de correo y hasta 254 caracteres. Si no: `CLIENTE_INVALIDO`. (La Edge Function ya normaliza; esto es la última red.)
3. Si `lealtad_resolver_cliente(p_tenant, NULL, telefono)` da un cliente con `estado = 'BLOQUEADO'`: `NO_SE_PUDO_CREAR`. **El mismo código** se usa para el límite del punto 4, para no revelar si un teléfono existe o está bloqueado.
4. Más de 2 pedidos vivos (`RECIBIDO`, `ACEPTADO`, `EN_PREPARACION`, `LISTO`) del canal `TIENDA` con ese teléfono en ese negocio: `NO_SE_PUDO_CREAR`. El conteo **decae solo**: mira únicamente los pedidos con `recibido_at > now() - interval '6 hours'` y no cuenta los que ya tienen en la nube un ticket `PAGADO`, `FACTURADO` o `CANCELADO` (`tickets.estado_fiscal`, con `tickets.tenant_id = p_tenant`). Con gestión `NUBE` nada mueve `estado` más allá de `ACEPTADO`; sin esto, tres pedidos aceptados dejarían ese teléfono bloqueado para siempre.
5. `p_pago` debe estar habilitado en `tienda_config` (`pago_efectivo` / `pago_tarjeta`): `PAGO_INVALIDO`.
6. `tienda_cotizar(...)` (sus errores se propagan tal cual). Si `p_total_esperado` no es `NULL` y difiere del total cotizado en ese momento: `TOTAL_CAMBIO: <total nuevo con dos decimales>`, sin insertar nada (el cliente paga al recibir: no se le compromete a un total que no vio). Con `NULL` no se compara.
7. `p_paga_con`: solo con `EFECTIVO`; si viene, `>= total` y `<= total + 5000`. Con `TARJETA` debe ser `NULL`. Si no: `PAGO_INVALIDO`.
8. `DOMICILIO`: `p_direccion` con `calle`, `numero_exterior`, `colonia`, `ciudad`, `estado` no vacíos y dentro de las longitudes de `direcciones_cliente` (255, 20, 150, 100, 50), `codigo_postal` de 5 dígitos, `numero_interior` hasta 20 y `referencias` hasta 300. Si no: `DIRECCION_INVALIDA`. `RECOGER`: `p_direccion` debe ser `NULL`.
9. `p_seguimiento_hash` debe cumplir `^[0-9a-f]{64}$`: `SEGUIMIENTO_INVALIDO`. Si `p_cuenta` no es `NULL`, debe existir en `tienda_cuentas` con `tenant_id = p_tenant` y `deleted_at IS NULL`: `CUENTA_INVALIDA`.
10. `p_nota` recortada a 300 caracteres. Aquí, con todo lo demás ya validado, van el candado, el bloqueo (punto 3) y el límite (punto 4).
11. Insertar en `delivery_pedidos`:
    - `canal = 'TIENDA'`, `app` y `tipo_entrega` según el modo, `conexion_id = NULL`, `estado = 'RECIBIDO'`.
    - `id_externo = replace(gen_random_uuid()::text, '-', '')` (32 caracteres: `'tienda:' || id_externo` cabe en `varchar(64)`; aleatorio y único en toda la plataforma, que es lo que exige `UNIQUE (app, id_externo)`).
    - `folio_corto` = `'T'` + los primeros 5 caracteres de `id_externo` en mayúsculas.
    - `items` = los normalizados de la cotización; `subtotal_mxn`, `envio_mxn` (el de la cotización, no el total con IVA), `total_cliente_mxn = total_restaurante_mxn` = el total; `efectivo_a_cobrar_mxn` = el total si es `EFECTIVO`, si no 0.
    - `cliente_nombre`, `cliente_telefono`, `cliente_email`, `direccion`, `zona_envio_id`, `pago_al_recibir`, `paga_con_mxn`, `nota_cliente`, `seguimiento_hash`, `tienda_cuenta_id`.
    - `vence_aceptacion = now() + tienda_config.minutos_aceptacion minutos`.
    - `gestion = 'ESCRITORIO'` si `sucursal_con_espejo(p_sucursal)`, si no `'NUBE'` (misma regla que `procesar-uber.ts`).
    - `payload_raw = '{}'`: nada del cuerpo crudo, ni IP ni token.
12. Devolver `pedido_id`, `folio_corto`, `total_mxn` (texto) y `vence_aceptacion`.

- [ ] **Step 1: Escribir el smoke**

Fixture: el de `smoke_tienda_estado.sql` (tienda abierta: módulo, complemento, config, sucursal participante con un horario que abra **ahora** todos los días —`{"1":["00:00","00:00"], … "7":["00:00","00:00"]}`—, zona, `espejo_turno_abierto_at = now()`) más los productos de la Task 3 (incluidos los de IVA por fuera y los combos) y un turno abierto como el de `smoke_tienda_ticket.sql`.

**La ida y vuelta** — para cada carrito de esta lista: `tienda_crear_pedido(...)`, luego `crear_ticket_desde_tienda(pedido_id)`, y afirmar que no lanza y que `tickets.total_mxn` = el `total_mxn` devuelto:

| # | Carrito |
|---|---|
| 1 | Casos 1, 2 y 3 de la Task 3 (simple, con extra, extra en cantidad 2), al recoger |
| 2 | Caso 4 (IVA por fuera con redondeo) |
| 3 | Caso 5 (mezcla de tasas) |
| 4 | Caso 6 (domicilio, zona $35, IVA incluido) |
| 5 | Caso 7 (domicilio con el primer renglón de IVA por fuera: el envío hereda el IVA) |
| 6 | Caso 8 (domicilio, zona gratis) |
| 7 | Casos 9 y 10 (combos `DELTA` y `SUMA_PRECIO_PRODUCTO`, uno con cantidad 2) |
| 8 | Caso 11 (combo con IVA por fuera y modificador de pago en el hijo) |
| 9 | Un carrito de tres renglones mezclados: simple con extras ×3, combo ×2 y simple con IVA por fuera, a domicilio |

Usar un teléfono distinto por carrito (o cobrar/cancelar el ticket anterior) para no topar con el límite de pedidos vivos.

Además:

| # | Afirmar |
|---|---|
| 10 | La fila creada: `canal`, `app`, `tipo_entrega`, `estado = 'RECIBIDO'`, `conexion_id IS NULL`, `payload_raw = '{}'`, `id_externo` de 32 caracteres hex, `folio_corto` de 6, `vence_aceptacion` ≈ `now() + minutos_aceptacion` |
| 11 | `gestion = 'ESCRITORIO'` con `cajas.espejo_apps_at = now()`; `'NUBE'` con `espejo_apps_at = NULL` (y `espejo_turno_abierto_at` vigente en ambos) |
| 12 | Con la tienda en pausa: `TIENDA_CERRADA: EN_PAUSA`, y no se inserta nada |
| 13 | Cliente bloqueado (recordar `motivo_bloqueo`: lo exige un CHECK de `clientes`): `NO_SE_PUDO_CREAR` |
| 14 | Con 3 pedidos vivos de ese teléfono, el cuarto: `NO_SE_PUDO_CREAR`; con uno de ellos pasado a `ENTREGADO`, entra |
| 15 | `TARJETA` con `pago_tarjeta = false`: `PAGO_INVALIDO`. `EFECTIVO` con `paga_con` menor que el total: `PAGO_INVALIDO`. `TARJETA` con `paga_con`: `PAGO_INVALIDO` |
| 16 | Teléfono de 9 dígitos, con letras, vacío; nombre vacío; correo sin `@`: `CLIENTE_INVALIDO` |
| 17 | `DOMICILIO` sin dirección, con código postal de 4 dígitos, sin calle: `DIRECCION_INVALIDA`. `RECOGER` con dirección: `DIRECCION_INVALIDA` |
| 18 | `p_seguimiento_hash` de 63 caracteres o con mayúsculas: `SEGUIMIENTO_INVALIDO`; repetido: `unique_violation` |
| 19 | Un error de la cotización (producto agotado) se propaga como `PRODUCTO_NO_DISPONIBLE` y no deja fila |
| F1 | El límite decae: tres aceptados con el ticket cobrado, facturado y cancelado → entran tres más y el siguiente no; tres vivos de hace 5 h 59 min siguen contando y de hace 7 h ya no |
| F4 | Con el total esperado correcto entra; con otro, `TOTAL_CAMBIO: <total real>` y sin fila; lo mismo si entre cotizar y pedir cambia el precio de un producto o el costo de la zona. Existe una sola `tienda_crear_pedido` |
| F6 | Con un teléfono bloqueado o en el tope, una petición inválida (pago, carrito, zona, total, dirección, huella, cuenta) da su propio error, no `NO_SE_PUDO_CREAR` |
| F7 | `p_cuenta` de otro negocio, borrada o inexistente: `CUENTA_INVALIDA` |

- [ ] **Step 2: Rojo.**
- [ ] **Step 3: Escribir §4**, con `REVOKE`/`GRANT`.
- [ ] **Step 4: Verde** — este smoke y toda la familia: `smoke_tienda_estado.sql smoke_tienda_menu.sql smoke_tienda_cotizar.sql smoke_tienda_ticket.sql smoke_combos.sql smoke_combos_uber.sql smoke_envio.sql`.

  **Si la ida y vuelta falla con `TOTAL_NO_COINCIDE`, la cotización está mal**: comparar renglón por renglón el ticket que `crear_ticket_desde_tienda` armó contra la cotización (el Anexo §1 dice dónde redondea cada cosa) y corregir `tienda_cotizar`. No tocar `crear_ticket_desde_tienda` ni `recalcular_totales_ticket`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0162_tienda_funcion.sql supabase/scripts/smoke_tienda_pedido.sql
git commit -m "feat(tienda): alta del pedido, validada y cotizada en el servidor"
```

---

### Task 5: el seguimiento

**Files:**
- Modify: `supabase/migrations/0162_tienda_funcion.sql` (§5)
- Test: `supabase/scripts/smoke_tienda_seguimiento.sql`

**Interfaces:**
- Produces: `tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text) RETURNS jsonb` — `NULL` si no hay un pedido de la tienda de ese negocio con esa huella.

- [ ] **Step 1: Escribir el smoke**

Fixture: el de la Task 4. Crear pedidos con `tienda_crear_pedido` y mover su estado.

| # | Situación | `estado` esperado |
|---|---|---|
| 1 | recién creado | `EN_PROCESO` |
| 2 | `estado = 'ACEPTADO'` (y `'EN_PREPARACION'`) | `EN_PREPARACION` |
| 3 | `estado = 'LISTO'`, a domicilio | `EN_CAMINO` |
| 4 | `estado = 'LISTO'`, para recoger | `LISTO_PARA_RECOGER` |
| 5 | `estado = 'ENTREGADO'` | `ENTREGADO` |
| 6 | `estado = 'RECHAZADO'` con `motivo_cancelacion = 'AGOTADO'` | `CANCELADO`, `motivo = 'AGOTADO'` |
| 7 | `estado = 'EXPIRADO'` | `CANCELADO`, `motivo = 'SIN_RESPUESTA'` |
| 8 | `estado = 'CANCELADO'` | `CANCELADO` |
| 8b | `estado = 'ERROR'` (revisión final; el listado de §5 de más abajo es anterior) | `EN_PROCESO`, `motivo` `NULL`: para 0161 `ERROR` es reintentable, y a quien todavía puede recibir su pedido no se le dice «cancelado» |
| 9 | gestión `NUBE`, ticket creado con `crear_ticket_desde_tienda` y `ticket_impreso_at = now()` | `EN_CAMINO` / `LISTO_PARA_RECOGER` aunque `estado` siga en `ACEPTADO` |
| 10 | gestión `NUBE`, con una fila en `delivery_asignaciones` para su ticket | `EN_CAMINO` |
| 11 | gestión `NUBE`, ticket `PAGADO` | `ENTREGADO` |
| 12 | gestión `NUBE`, ticket `CANCELADO` | `CANCELADO` |
| 13 | gestión `ESCRITORIO` con `estado = 'ACEPTADO'` y un ticket en la nube impreso | `EN_PREPARACION` (en escritorio manda lo que reporta la caja, no el ticket de la nube) |
| 14 | huella inexistente; huella de un pedido de **otro negocio**; huella de un pedido de canal `APP` | `NULL` |
| 15 | el objeto devuelto | trae `folio_corto`, `modo`, `renglones` (nombre, cantidad, detalle), `subtotal_mxn`, `envio_total_mxn`, `total_mxn`, `pago`, `recibido_at`, `sucursal` (`nombre`, `telefono`); **no** trae teléfono, correo ni dirección del cliente, ni ids internos |

Para los casos 9–12 mirar en `smoke_tienda_ticket.sql` y `smoke_domicilio_cobro.sql` cómo se abre turno, se asigna repartidor y se cobra.

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: Escribir §5**

```sql
-- ── §5 Seguimiento ───────────────────────────────────────────────────────────
-- Lo que ve el cliente con su enlace. La huella es la única llave: quien la tiene ve ESE pedido y
-- nada más, y por eso no se devuelve ningún dato personal (ni teléfono, ni correo, ni dirección).
--
-- De dónde sale el estado: con caja instalada (gestion ESCRITORIO) el ticket vive en la caja y la
-- nube solo sabe lo que la caja reporta en delivery_pedidos.estado. Sin caja (NUBE) el ticket está
-- aquí, y el estado se deriva de él al leer, con la misma regla que usará el agente de la caja
-- (diseño §8): cancelado > cobrado > impreso o con repartidor.
CREATE OR REPLACE FUNCTION tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      delivery_pedidos%ROWTYPE;
  v_estado text;
  v_t      record;
  v_envio_total numeric(12,2);
BEGIN
  IF p_seguimiento_hash IS NULL OR p_seguimiento_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM delivery_pedidos
   WHERE seguimiento_hash = p_seguimiento_hash AND tenant_id = p_tenant AND canal = 'TIENDA';
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_estado := v_p.estado;
  IF v_p.gestion = 'NUBE' AND v_p.ticket_id IS NOT NULL AND v_estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO') THEN
    SELECT t.estado_fiscal::text AS fiscal, t.ticket_impreso_at,
           EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) AS con_repartidor
      INTO v_t FROM tickets t WHERE t.id = v_p.ticket_id AND t.tenant_id = p_tenant;
    IF FOUND THEN
      v_estado := CASE
        WHEN v_t.fiscal = 'CANCELADO' THEN 'CANCELADO'
        WHEN v_t.fiscal IN ('PAGADO', 'FACTURADO') THEN 'ENTREGADO'
        WHEN v_t.ticket_impreso_at IS NOT NULL OR v_t.con_repartidor THEN 'LISTO'
        ELSE v_estado END;
    END IF;
  END IF;

  v_envio_total := v_p.total_cliente_mxn - COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn);

  RETURN jsonb_build_object(
    'folio_corto', v_p.folio_corto,
    'modo', CASE v_p.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
    'estado', CASE
      WHEN v_estado = 'RECIBIDO' THEN 'EN_PROCESO'
      WHEN v_estado IN ('ACEPTADO', 'EN_PREPARACION') THEN 'EN_PREPARACION'
      WHEN v_estado = 'LISTO' AND v_p.app = 'DELIVERY_PROPIO' THEN 'EN_CAMINO'
      WHEN v_estado = 'LISTO' THEN 'LISTO_PARA_RECOGER'
      WHEN v_estado = 'ENTREGADO' THEN 'ENTREGADO'
      ELSE 'CANCELADO' END,
    'motivo', CASE
      WHEN v_estado = 'EXPIRADO' THEN 'SIN_RESPUESTA'
      WHEN v_estado IN ('RECHAZADO', 'CANCELADO', 'ERROR') THEN NULLIF(v_p.motivo_cancelacion, '')
      END,
    'renglones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'nombre', i ->> 'nombre_app',
               'cantidad', (i ->> 'cantidad')::integer,
               'detalle', (SELECT string_agg(m ->> 'nombre_app', ', ')
                             FROM jsonb_array_elements(COALESCE(i -> 'modificadores', '[]'::jsonb)) m)))
        FROM jsonb_array_elements(v_p.items) i), '[]'::jsonb),
    'subtotal_mxn', to_char(COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn), 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_total, 'FM999999990.00'),
    'total_mxn', to_char(v_p.total_cliente_mxn, 'FM999999990.00'),
    'pago', v_p.pago_al_recibir,
    'recibido_at', v_p.recibido_at,
    'sucursal', (SELECT jsonb_build_object('nombre', s.nombre, 'telefono', s.telefono)
                   FROM sucursales s WHERE s.id = v_p.sucursal_id));
END;
$$;
REVOKE ALL ON FUNCTION tienda_seguimiento(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_seguimiento(uuid, text) TO service_role;
```

- [ ] **Step 4: Verde** — el smoke nuevo. Si una columna no existe con ese nombre (`ticket_impreso_at`, `motivo_cancelacion`, `recibido_at`), corregirla contra la tabla real sin cambiar la salida.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0162_tienda_funcion.sql supabase/scripts/smoke_tienda_seguimiento.sql
git commit -m "feat(tienda): seguimiento del pedido por la huella de su código"
```

---

### Task 6: los ayudantes de la función, con sus pruebas

**Files:**
- Create: `supabase/functions/_shared/tienda/validar.ts`, `validar.test.ts`
- Create: `supabase/functions/_shared/tienda/seguimiento.ts`, `seguimiento.test.ts`
- Create: `supabase/functions/_shared/tienda/correo-pedido.ts`, `correo-pedido.test.ts`
- Modify: `supabase/functions/_shared/turnstile.ts` (el tipo `AccionCaptcha`)
- Modify: `package.json` (script `test:functions`)

**Interfaces:**
- Produces:
  - `validar.ts`: `normalizarTelefono(x: unknown): string | null`; `textoLimpio(x: unknown, max: number): string | null`; `esUuid(x: unknown): x is string`; `leerCuerpo(x: unknown): Resultado<Peticion>` con
    `type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }` y
    `type Peticion = { accion: "negocio"; negocio: string } | { accion: "menu"; negocio: string; sucursal_id: string } | { accion: "cotizar"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[] } | { accion: "pedir"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[]; cliente: { nombre: string; telefono: string; email: string | null }; direccion: Direccion | null; pago: "EFECTIVO" | "TARJETA"; paga_con: string | null; nota: string | null; captcha: string | null } | { accion: "seguimiento"; negocio: string; codigo: string }`,
    `type Modo = "RECOGER" | "DOMICILIO"`, `type Direccion = { calle: string; numero_exterior: string; numero_interior: string | null; colonia: string; codigo_postal: string; ciudad: string; estado: string; referencias: string | null }`.
  - `seguimiento.ts`: `nuevoCodigo(): string` (22 caracteres base64url, 128 bits); `huellaDe(codigo: string): Promise<string>` (SHA-256 en hex minúsculas); `esCodigo(x: unknown): x is string`.
  - `correo-pedido.ts`: `correoDePedido(d: { negocio: string; folio: string; total: string; modo: Modo; renglones: { nombre: string; cantidad: number; detalle: string | null }[]; enlace: string }): { subject: string; html: string }`.
  - `turnstile.ts`: `AccionCaptcha` admite `"tienda_pedido"`.

Los `.ts` de `_shared` se prueban con Node y no pueden importar `jsr:`, `npm:` ni `https:` (Anexo §8). Imports relativos con extensión `.ts`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`supabase/functions/_shared/tienda/validar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esUuid, leerCuerpo, normalizarTelefono, textoLimpio } from "./validar.ts";

const SUC = "99999999-0000-0000-0000-0000000000bb";

test("teléfono: 10 dígitos tal cual", () => {
  assert.equal(normalizarTelefono("4771112233"), "4771112233");
});
test("teléfono: se quitan espacios, guiones y paréntesis", () => {
  assert.equal(normalizarTelefono("(477) 111-22 33"), "4771112233");
});
test("teléfono: se quita el prefijo de México, con y sin el 1 de celular", () => {
  assert.equal(normalizarTelefono("+52 477 111 2233"), "4771112233");
  assert.equal(normalizarTelefono("5214771112233"), "4771112233");
});
test("teléfono: cualquier otra longitud se rechaza", () => {
  for (const t of ["477111223", "47711122334", "", "abc", null, undefined, 4771112233]) {
    assert.equal(normalizarTelefono(t), null);
  }
});
test("texto: recorta, colapsa espacios y quita caracteres de control", () => {
  assert.equal(textoLimpio("  Ana \u0000 María\n\tLópez  ", 50), "Ana María López");
});
test("texto: vacío o no texto es null; lo largo se corta", () => {
  assert.equal(textoLimpio("   ", 10), null);
  assert.equal(textoLimpio(42, 10), null);
  assert.equal(textoLimpio("abcdefghijkl", 5), "abcde");
});
test("uuid", () => {
  assert.equal(esUuid(SUC), true);
  assert.equal(esUuid("99999999-0000-0000-0000-0000000000b"), false);
  assert.equal(esUuid(null), false);
});

test("cuerpo: acción desconocida o cuerpo que no es objeto", () => {
  assert.deepEqual(leerCuerpo(null), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo([]), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "borrar", negocio: "x" }), { ok: false, error: "ACCION_INVALIDA" });
});
test("cuerpo: el negocio es un slug en minúsculas", () => {
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "Knock-Out" }), { ok: true, valor: { accion: "negocio", negocio: "knock-out" } });
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "con espacios" }), { ok: false, error: "NEGOCIO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "negocio" }), { ok: false, error: "NEGOCIO_INVALIDO" });
});
test("cuerpo: menu exige una sucursal uuid", () => {
  assert.deepEqual(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: "x" }), { ok: false, error: "SUCURSAL_INVALIDA" });
  assert.equal(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: SUC }).ok, true);
});
test("cuerpo: cotizar valida modo, zona e items como arreglo acotado", () => {
  const base = { accion: "cotizar", negocio: "knockout", sucursal_id: SUC, modo: "RECOGER", items: [{}] };
  assert.equal(leerCuerpo(base).ok, true);
  assert.deepEqual(leerCuerpo({ ...base, modo: "MESA" }), { ok: false, error: "MODO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, zona_id: "x" }), { ok: false, error: "ZONA_INVALIDA" });
  assert.deepEqual(leerCuerpo({ ...base, items: "x" }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: [] }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: Array(41).fill({}) }), { ok: false, error: "CARRITO_INVALIDO" });
});

const pedir = {
  accion: "pedir", negocio: "knockout", sucursal_id: SUC, modo: "DOMICILIO",
  zona_id: "99999999-0000-0000-0000-0000000000aa", items: [{}],
  cliente: { nombre: " Ana ", telefono: "(477) 111 2233", email: "ANA@Example.com " },
  direccion: { calle: "Av. Siempre Viva", numero_exterior: "742", colonia: "Centro",
               codigo_postal: "37000", ciudad: "León", estado: "Guanajuato" },
  pago: "EFECTIVO", paga_con: 500, nota: " tocar el timbre ", captcha: "tok",
};
test("cuerpo: pedir normaliza cliente, dirección, pago y nota", () => {
  const r = leerCuerpo(pedir);
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.deepEqual(r.valor.cliente, { nombre: "Ana", telefono: "4771112233", email: "ana@example.com" });
  assert.equal(r.valor.direccion?.numero_interior, null);
  assert.equal(r.valor.direccion?.referencias, null);
  assert.equal(r.valor.paga_con, "500.00");
  assert.equal(r.valor.nota, "tocar el timbre");
  assert.equal(r.valor.captcha, "tok");
});
test("cuerpo: pedir rechaza lo que no cuadra", () => {
  const con = (cambio: object) => leerCuerpo({ ...pedir, ...cambio });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, telefono: "123" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, nombre: "  " } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, email: "sin-arroba" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ direccion: null }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ direccion: { ...pedir.direccion, codigo_postal: "3700" } }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ modo: "RECOGER" }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ pago: "CHEQUE" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ pago: "TARJETA" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: -1 }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: "mucho" }), { ok: false, error: "PAGO_INVALIDO" });
});
test("cuerpo: pedir para recoger no lleva dirección ni zona; correo y paga_con son opcionales", () => {
  const r = leerCuerpo({ ...pedir, modo: "RECOGER", zona_id: null, direccion: null, paga_con: null,
                         cliente: { nombre: "Ana", telefono: "4771112233" } });
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.equal(r.valor.cliente.email, null);
  assert.equal(r.valor.paga_con, null);
});
test("cuerpo: seguimiento exige un código con forma de código", () => {
  assert.equal(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "A".repeat(22) }).ok, true);
  assert.deepEqual(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "corto" }), { ok: false, error: "CODIGO_INVALIDO" });
});
```

`supabase/functions/_shared/tienda/seguimiento.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esCodigo, huellaDe, nuevoCodigo } from "./seguimiento.ts";

test("el código tiene 22 caracteres base64url y no se repite", () => {
  const a = nuevoCodigo(), b = nuevoCodigo();
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
  assert.equal(esCodigo(a), true);
});
test("esCodigo rechaza lo que no tiene la forma", () => {
  for (const x of ["", "corto", "a".repeat(23), "con espacio aaaaaaaaaaaa", null, 5]) assert.equal(esCodigo(x), false);
});
test("la huella es el SHA-256 en hex minúsculas", async () => {
  assert.equal(await huellaDe("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(await huellaDe(nuevoCodigo()), /^[0-9a-f]{64}$/);
});
```

`supabase/functions/_shared/tienda/correo-pedido.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { correoDePedido } from "./correo-pedido.ts";

const base = {
  negocio: "Knock-Out Burger", folio: "TAB12C", total: "305.00", modo: "DOMICILIO" as const,
  renglones: [{ nombre: "Hamburguesa Clásica", cantidad: 2, detalle: "Extra queso" }],
  enlace: "https://pedidos.vimpos.com.mx/knockout/pedido/AAAAAAAAAAAAAAAAAAAAAA",
};

test("el asunto va sin acentos y con el folio", () => {
  const { subject } = correoDePedido({ ...base, negocio: "Tacos Él Güero" });
  assert.match(subject, /TAB12C/);
  assert.doesNotMatch(subject, /[^\x20-\x7E]/);
});
test("el cuerpo trae renglones, total y enlace, y NO menciona tiempos", () => {
  const { html } = correoDePedido(base);
  assert.match(html, /2 × Hamburguesa Clásica/);
  assert.match(html, /Extra queso/);
  assert.match(html, /\$305\.00/);
  assert.ok(html.includes(base.enlace));
  assert.doesNotMatch(html, /minutos|tiempo estimado/i);
});
test("lo que escribe el cliente o el negocio se escapa", () => {
  const { html } = correoDePedido({ ...base, negocio: "<script>x</script>",
    renglones: [{ nombre: "A & B", cantidad: 1, detalle: "<b>" }] });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;b&gt;/);
});
test("recoger y domicilio dicen cosas distintas", () => {
  assert.match(correoDePedido(base).html, /a domicilio/i);
  assert.match(correoDePedido({ ...base, modo: "RECOGER" }).html, /recoger/i);
});
```

- [ ] **Step 2: Añadir la carpeta al script y ver el rojo**

En `package.json` de la raíz, en el script `test:functions`, añadir ` supabase/functions/_shared/tienda/*.test.ts` al final de la lista de rutas.

Run: `pnpm test:functions`
Expected: FAIL — los tres módulos no existen.

- [ ] **Step 3: Implementar**

`supabase/functions/_shared/tienda/seguimiento.ts`:

```ts
// El código de seguimiento de un pedido de la tienda: 128 bits al azar que solo conoce el cliente.
// En la base se guarda su huella (SHA-256), nunca el código: quien lea la tabla no puede abrir el
// seguimiento de nadie. WebCrypto existe igual en Deno y en Node, así que esto se prueba con Node.

const FORMA = /^[A-Za-z0-9_-]{22}$/;

export function nuevoCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function esCodigo(x: unknown): x is string {
  return typeof x === "string" && FORMA.test(x);
}

export async function huellaDe(codigo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

`supabase/functions/_shared/tienda/validar.ts`:

```ts
// Forma de lo que le llega a la función `tienda`. Validación A MANO y no con zod: estos módulos se
// prueban con Node, que no resuelve `npm:` (mismo criterio que _shared/alta.ts).
//
// Aquí solo se mira la FORMA. Que el producto exista, que el precio sea el de hoy o que la tienda
// esté abierta lo deciden las funciones SQL (0162), que son las que tienen los datos.
import { esCodigo } from "./seguimiento.ts";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
export type Modo = "RECOGER" | "DOMICILIO";
export type Direccion = {
  calle: string; numero_exterior: string; numero_interior: string | null; colonia: string;
  codigo_postal: string; ciudad: string; estado: string; referencias: string | null;
};
export type Peticion =
  | { accion: "negocio"; negocio: string }
  | { accion: "menu"; negocio: string; sucursal_id: string }
  | { accion: "cotizar"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[] }
  | { accion: "pedir"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[];
      cliente: { nombre: string; telefono: string; email: string | null }; direccion: Direccion | null;
      pago: "EFECTIVO" | "TARJETA"; paga_con: string | null; nota: string | null; captcha: string | null }
  | { accion: "seguimiento"; negocio: string; codigo: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RENGLONES = 40;

const mal = (error: string): { ok: false; error: string } => ({ ok: false, error });
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function esUuid(x: unknown): x is string {
  return typeof x === "string" && UUID.test(x);
}

/** Diez dígitos nacionales, o null. Quita adornos y el prefijo de México (52, o 521 de celular). */
export function normalizarTelefono(x: unknown): string | null {
  if (typeof x !== "string") return null;
  let d = x.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? d : null;
}

/** Texto de una sola línea, sin caracteres de control, recortado a `max`. Vacío = null. */
export function textoLimpio(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  // deno-lint-ignore no-control-regex
  const t = x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t === "" ? null : t;
}

function leerDireccion(x: unknown): Direccion | null {
  if (!objeto(x)) return null;
  const calle = textoLimpio(x.calle, 255), numero_exterior = textoLimpio(x.numero_exterior, 20);
  const colonia = textoLimpio(x.colonia, 150), ciudad = textoLimpio(x.ciudad, 100), estado = textoLimpio(x.estado, 50);
  const codigo_postal = typeof x.codigo_postal === "string" ? x.codigo_postal.trim() : "";
  if (!calle || !numero_exterior || !colonia || !ciudad || !estado || !/^[0-9]{5}$/.test(codigo_postal)) return null;
  return { calle, numero_exterior, numero_interior: textoLimpio(x.numero_interior, 20), colonia,
           codigo_postal, ciudad, estado, referencias: textoLimpio(x.referencias, 300) };
}

/** Importe como texto con dos decimales, o undefined si no es un importe válido. null/ausente = null. */
function leerImporte(x: unknown): string | null | undefined {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : typeof x === "string" && /^\d+(\.\d{1,2})?$/.test(x.trim()) ? Number(x) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 999999) return undefined;
  return n.toFixed(2);
}

export function leerCuerpo(x: unknown): Resultado<Peticion> {
  if (!objeto(x)) return mal("CUERPO_INVALIDO");
  const accion = x.accion;
  if (accion !== "negocio" && accion !== "menu" && accion !== "cotizar" && accion !== "pedir" && accion !== "seguimiento") {
    return mal("ACCION_INVALIDA");
  }
  const negocio = typeof x.negocio === "string" ? x.negocio.trim().toLowerCase() : "";
  if (!SLUG.test(negocio)) return mal("NEGOCIO_INVALIDO");

  if (accion === "negocio") return { ok: true, valor: { accion, negocio } };
  if (accion === "seguimiento") {
    return esCodigo(x.codigo) ? { ok: true, valor: { accion, negocio, codigo: x.codigo } } : mal("CODIGO_INVALIDO");
  }

  if (!esUuid(x.sucursal_id)) return mal("SUCURSAL_INVALIDA");
  const sucursal_id = x.sucursal_id;
  if (accion === "menu") return { ok: true, valor: { accion, negocio, sucursal_id } };

  if (x.modo !== "RECOGER" && x.modo !== "DOMICILIO") return mal("MODO_INVALIDO");
  const modo: Modo = x.modo;
  const zonaCruda = x.zona_id ?? null;
  if (zonaCruda !== null && !esUuid(zonaCruda)) return mal("ZONA_INVALIDA");
  const zona_id = zonaCruda as string | null;
  if (!Array.isArray(x.items) || x.items.length === 0 || x.items.length > MAX_RENGLONES) return mal("CARRITO_INVALIDO");
  const items: unknown[] = x.items;
  if (accion === "cotizar") return { ok: true, valor: { accion, negocio, sucursal_id, modo, zona_id, items } };

  // pedir
  if (!objeto(x.cliente)) return mal("CLIENTE_INVALIDO");
  const nombre = textoLimpio(x.cliente.nombre, 100);
  const telefono = normalizarTelefono(x.cliente.telefono);
  const emailCrudo = x.cliente.email ?? null;
  const email = emailCrudo === null ? null : typeof emailCrudo === "string" ? emailCrudo.trim().toLowerCase() : "";
  if (!nombre || !telefono || (email !== null && (email.length > 254 || !CORREO.test(email)))) return mal("CLIENTE_INVALIDO");

  let direccion: Direccion | null = null;
  if (modo === "DOMICILIO") {
    direccion = leerDireccion(x.direccion);
    if (!direccion) return mal("DIRECCION_INVALIDA");
  } else if ((x.direccion ?? null) !== null) {
    return mal("DIRECCION_INVALIDA");
  }

  if (x.pago !== "EFECTIVO" && x.pago !== "TARJETA") return mal("PAGO_INVALIDO");
  const paga_con = leerImporte(x.paga_con);
  if (paga_con === undefined || (x.pago === "TARJETA" && paga_con !== null)) return mal("PAGO_INVALIDO");

  return { ok: true, valor: {
    accion, negocio, sucursal_id, modo, zona_id, items,
    cliente: { nombre, telefono, email }, direccion, pago: x.pago, paga_con,
    nota: textoLimpio(x.nota, 300), captcha: typeof x.captcha === "string" && x.captcha.length <= 4096 ? x.captcha : null,
  } };
}
```

`supabase/functions/_shared/tienda/correo-pedido.ts`:

```ts
// El correo que confirma un pedido de la tienda. Puro, para probarlo sin SMTP. No menciona tiempos
// de entrega: es decisión del diseño (§3), el restaurante no promete un tiempo que no controla.
import type { Modo } from "./validar.ts";

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** El asunto viaja por SMTP: sin acentos ni símbolos raros, como exige _shared/correo.ts. */
const ascii = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, 160);

export function correoDePedido(d: {
  negocio: string; folio: string; total: string; modo: Modo;
  renglones: { nombre: string; cantidad: number; detalle: string | null }[]; enlace: string;
}): { subject: string; html: string } {
  const filas = d.renglones.map((r) =>
    `<tr><td style="padding:6px 0">${r.cantidad} × ${esc(r.nombre)}${r.detalle ? `<br><span style="color:#666;font-size:13px">${esc(r.detalle)}</span>` : ""}</td></tr>`
  ).join("");
  const como = d.modo === "DOMICILIO" ? "Te lo llevamos a domicilio." : "Pasas a recogerlo a la sucursal.";
  return {
    subject: ascii(`Recibimos tu pedido ${d.folio} - ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">${esc(d.negocio)}</h1>
<p style="margin:0 0 16px">Recibimos tu pedido <strong>${esc(d.folio)}</strong>. ${como} Pagas al recibir.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${filas}</table>
<p style="font-size:18px;margin:16px 0"><strong>Total: $${esc(d.total)}</strong></p>
<p style="margin:0 0 24px"><a href="${esc(d.enlace)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver cómo va mi pedido</a></p>
<p style="color:#666;font-size:13px;margin:0">Si no hiciste este pedido, ignora este correo.</p>
</div>`,
  };
}
```

En `supabase/functions/_shared/turnstile.ts`, cambiar la línea del tipo a:

```ts
export type AccionCaptcha = "registro" | "reenvio" | "tienda_pedido";
```

- [ ] **Step 4: Verde**

Run: `pnpm test:functions`
Expected: PASS, incluidas las que ya existían (las de `turnstile` no deben cambiar).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tienda supabase/functions/_shared/turnstile.ts package.json
git commit -m "feat(tienda): validación del cuerpo, código de seguimiento y correo del pedido"
```

---

### Task 7: la Edge Function `tienda`

**Files:**
- Create: `supabase/functions/tienda/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: las funciones SQL de las Tasks 1–5 (por `admin.rpc(...)`); `_shared/tienda/*` (Task 6); de `_shared`: `clienteAdmin` y `json` de `http.ts`, `consumirCupos`, `leerCuerpoAcotado` de `limite.ts`, `secretoInternoValido` de `delivery/interno.ts`, `verificarTurnstile`, `hostnamesPermitidos` de `turnstile.ts`, `enviarCorreo`, `enSegundoPlano` de `correo.ts`, `registrarError` de `errores.ts`. **Antes de escribir, leer esos archivos y `autofacturar/index.ts`** y usar los nombres y firmas reales (Anexo §7).
- Produces: `POST /functions/v1/tienda` con cabeceras `x-vim-tienda: <VIM_TIENDA_SECRET>` y `x-tienda-ip: <ip del cliente>`, cuerpo JSON `{accion, negocio, …}`.

**Quién la llama:** solo el servidor de la tienda (entrega 5). El navegador del cliente nunca. Por eso no usa `servir()` de `http.ts` tal cual si este añade CORS abierto o no atrapa excepciones (Anexo §7): se usa `Deno.serve` directo con un `try/catch` propio, y **no** se responde a `OPTIONS` con permiso para ningún origen.

**Secretos y variables** (se leen con `Deno.env.get`): `VIM_TIENDA_SECRET` (obligatorio), `VIM_TIENDA_URL` (base de los enlaces, p. ej. `https://pedidos.vimpos.com.mx`), `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES`, `CAPTCHA_OPCIONAL` (los tres ya existen para el registro).

**Respuestas:** siempre JSON. Éxito: `200 {…}`. Error: `{ "error": "CODIGO" }` con:

| Estado | Cuándo |
|---|---|
| 401 `NO_AUTORIZADO` | falta o no coincide `x-vim-tienda` (o el secreto no está configurado) |
| 405 `METODO_NO_PERMITIDO` | no es `POST` |
| 413 `CUERPO_DEMASIADO_GRANDE` | más de 32 KB |
| 400 `<código de leerCuerpo>` | forma inválida. También `CUERPO_INVALIDO` si el cuerpo crudo trae el carácter NUL, literal o como escape (Postgres no lo admite en un `jsonb`) |
| 404 `TIENDA_NO_DISPONIBLE` | `tienda_negocio` devolvió `NULL` |
| 404 `PEDIDO_NO_ENCONTRADO` | `tienda_seguimiento` devolvió `NULL` |
| 409 `<código SQL>` | rechazo de negocio de `tienda_cotizar` o `tienda_crear_pedido`. Si el mensaje es `CODIGO: detalle`, se responde `{error: CODIGO, detalle}` **solo** para `TIENDA_CERRADA`, `PRODUCTO_NO_DISPONIBLE`, `MODIFICADORES_INVALIDOS` y `COMBO_INVALIDO` (el detalle es un motivo o un id de producto del propio carrito); para los demás, solo el código |
| 409 `TOTAL_CAMBIO` | en `pedir`, el total ya no es el `total_esperado` que mandó la tienda. `detalle` = el total nuevo, y solo sale si cumple `^\d+\.\d{2}$`. No se creó ningún pedido |
| 403 `CAPTCHA_INVALIDO` | Turnstile no pasó, en `pedir` (token ausente, rechazado, de otro dominio o de otra acción, o Cloudflare no respondió) |
| 429 `DEMASIADOS_INTENTOS` | cupo agotado |
| 503 `SERVICIO_NO_DISPONIBLE` | el control de cupos no respondió en `pedir`, falló una RPC sin código de negocio, o el antirobot **no está configurado** (motivo `NO_CONFIGURADO`: es un fallo nuestro, igual que en `signup-tenant`, no un «captcha inválido») |
| 500 `ERROR_INTERNO` | cualquier excepción. Se registra con `registrarError`; al cliente nunca le llega el mensaje |

Los códigos de negocio se reconocen así: el mensaje del error de PostgREST empieza con `MAYUSCULAS_Y_GUIONES:` o es exactamente uno de esos códigos. Cualquier otro error de la base es un 503 y se registra.

**Cupos** (diseño §10), con la IP de `x-tienda-ip` (si falta o no parece una IP, usar el literal `"desconocida"`: todos comparten contador, que es lo seguro):

| Acción | Cupos | Si el control falla |
|---|---|---|
| `negocio`, `menu`, `cotizar`, `seguimiento` | `tienda:lee:ip:<ip>` 120 cada 600 s | `"abrir"` |
| `pedir` | `tienda:pide:ip:<ip>` 5 cada 3600 s **antes** del antirobot; `tienda:pide:negocio:<slug>` 60 cada 3600 s **solo después** de pasarlo | `"cerrar"` |

El orden de `pedir` es: cupo por IP → `tienda_negocio` y sucursal → antirobot → cupo por negocio → `tienda_crear_pedido`. El cupo del negocio no se gasta sin pasar el antirobot: si se gastara al entrar, 60 peticiones basura por hora dejarían sin tienda a un restaurante. Cuando se agota queda una línea en el log (`CUPO_NEGOCIO_AGOTADO` con el slug), y otra (`IP_CLIENTE_DESCONOCIDA`) cuando un `pedir` llega sin una `x-tienda-ip` válida.

En la clave del cupo, `<ip>` es la IPv4 completa o, si es IPv6, su prefijo **/64** (los cuatro primeros grupos tras expandir `::`, p. ej. `2806:2f0:9000:ab::/64`): un cliente recibe un /64 entero. Una IPv4 mapeada (`::ffff:1.2.3.4`) cuenta como IPv4. A Turnstile se le manda la IP completa.

**Flujo del handler:**

1. Método, secreto (`secretoInternoValido(req.headers.get("x-vim-tienda") ?? "", Deno.env.get("VIM_TIENDA_SECRET") ?? "")`), cuerpo acotado a 32 768 bytes, rechazo del NUL sobre el texto crudo, `JSON.parse` con `catch` → `CUERPO_INVALIDO`, `leerCuerpo` (que además limpia la `nota` de cada renglón con `textoLimpio(nota, 200)` y exige que cada elemento de `items` sea un objeto).
2. Cupo por IP de la acción.
3. `tienda_negocio(p_slug)`. `NULL` → 404. Guardar `tenant_id` (no sale nunca en una respuesta) y `publico`.
4. Por acción:
   - `negocio` → `publico`.
   - `menu`, `cotizar`, `pedir` → la `sucursal_id` debe estar en `publico.sucursales`; si no, 404 `TIENDA_NO_DISPONIBLE`.
   - `menu` → `tienda_menu(p_tenant, p_sucursal)`.
   - `cotizar` → `tienda_cotizar(...)`; responder sin la clave `items` (los renglones normalizados son internos): `renglones`, `subtotal_mxn`, `envio_mxn`, `envio_total_mxn`, `total_mxn`.
   - `pedir` → Turnstile con `accion: "tienda_pedido"` y la IP (sin configurar: 503; cualquier otro fallo: 403); cupo por negocio; `nuevoCodigo()` y `huellaDe`; `tienda_crear_pedido(...)` con `p_cuenta: null` y `p_total_esperado` = el `total_esperado` del cuerpo (opcional; importe con la misma regla que `paga_con`, inválido → `PAGO_INVALIDO`); lo que devuelve se valida con `leerPedido` antes de usarlo (si llegara con otra forma el pedido ya existe: se responde 200 con el código y el resto en `null`, y se registra); si hay correo, `enSegundoPlano(enviarCorreo(...))` con `correoDePedido` (los renglones se sacan de una llamada a `tienda_seguimiento` con la huella, que ya los trae listos) y enlace `${VIM_TIENDA_URL}/${slug}/pedido/${codigo}`; responder `{ codigo, folio_corto, total_mxn, vence_aceptacion }`. **El código solo existe en esta respuesta y en el correo.**
   - `seguimiento` → `huellaDe(codigo)` y `tienda_seguimiento(p_tenant, huella)`; `NULL` → 404.
5. Nada del cuerpo, ni el código de seguimiento, ni el secreto se escriben en el log.

- [ ] **Step 1: Escribir `supabase/functions/tienda/index.ts`** siguiendo el flujo y las tablas de arriba. Encabezar el archivo con un comentario que explique quién la llama, por qué no hay CORS y por qué exige el secreto. Mantener el handler en un solo archivo de menos de ~220 líneas: lo que sea lógica pura ya vive en `_shared/tienda/`.

- [ ] **Step 2: Registrarla como pública para el gateway**

En `supabase/config.toml`, junto al bloque de `autofacturar`:

```toml
# La llama el servidor de la tienda en línea, no el navegador: se autentica con el secreto
# x-vim-tienda, no con un JWT. Sin esto el gateway responde "Invalid JWT" antes de llegar.
[functions.tienda]
verify_jwt = false
```

- [ ] **Step 3: Comprobar lo que se puede sin Deno**

Run: `node --experimental-strip-types --check supabase/functions/tienda/index.ts`
Expected: sin salida (la sintaxis es válida). Luego releer el archivo entero comprobando: cada import existe y exporta ese nombre; cada `rpc` usa los nombres de parámetro reales de su función SQL (`p_tenant`, `p_sucursal`, `p_modo`, `p_zona`, `p_items`, `p_cliente`, `p_direccion`, `p_pago`, `p_paga_con`, `p_nota`, `p_seguimiento_hash`, `p_cuenta`, `p_total_esperado`, `p_slug`); ninguna rama devuelve `tenant_id`, `items` ni el mensaje crudo de un error.

Run: `deno check supabase/functions/tienda/index.ts` si `deno --version` funciona; si no, decirlo en el informe.

Run: `pnpm test:functions`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/tienda/index.ts supabase/config.toml
git commit -m "feat(tienda): función pública tienda — negocio, menú, cotizar, pedir y seguimiento"
```

---

### Task 8: verificación completa y salida

- [ ] **Step 1: Todo en verde**

Run: `cd desktop && npm run smokes` → todos, con los cinco nuevos.
Run (raíz): `pnpm test:functions`, `pnpm test`, y `pnpm --filter ./apps/<app> exec tsc --noEmit` para `admin`, `platform`, `pos`, `kds`, `factura`.
Rojos conocidos que no son regresión en esta máquina: el aborto de libuv de `endurecimiento.test.mjs` y un timeout intermitente de `apps/pos` `device-creds.test.ts` bajo carga (repetir una vez).

- [ ] **Step 2: Releer la migración entera**

§1–§5 en orden; toda función con `SET search_path` y su `REVOKE … FROM PUBLIC, anon, authenticated`; las funciones internas (`_tienda_*`) sin `GRANT`; ningún `CURRENT_DATE`; nada de `storage.`, `cron.` ni `net.`; ningún importe devuelto como número JSON.

- [ ] **Step 3: Subir la rama y abrir el PR** contra `main`, con el resumen de lo que trae, las pruebas, lo que no se pudo verificar en local (la función no se compila con Deno aquí) y los pasos de producción pendientes.

- [ ] **Step 4: Producción — DETENERSE y pedir el visto bueno de Fermín**

Nada de esto sin su «sí». Decirle qué se hará: una migración que solo añade funciones (sin tablas ni bloqueos sobre datos), un secreto nuevo y una función nueva que nadie llama todavía.

1. `supabase migration list --linked` (el worktree se vincula copiando el **contenido** de `vim-pos/supabase/.temp/` a su `supabase/.temp/`).
2. Aplicar: `(echo "BEGIN;"; cat supabase/migrations/0162_tienda_funcion.sql; echo; echo "COMMIT;") | supabase db query --linked` y `supabase migration repair --status applied 0162 --linked`.
3. Verificar: las **once** funciones existen —siete para `service_role` (`tienda_horario_abierto`, `tienda_estado_sucursal`, `tienda_negocio`, `tienda_menu`, `tienda_cotizar`, `tienda_crear_pedido`, `tienda_seguimiento`) y cuatro internas sin `GRANT` (`_tienda_grupos_de`, `_tienda_entero`, `_tienda_con_iva`, `_tienda_modificadores`)—, que `has_function_privilege('anon', …)` y `('authenticated', …)` son falsos para **las once**, y que `tienda_crear_pedido` tiene una sola firma (`SELECT count(*) FROM pg_proc WHERE proname = 'tienda_crear_pedido'` = 1).
4. Secretos: generar `VIM_TIENDA_SECRET` (32 bytes al azar en hex), guardarlo en `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt` (la entrega 5 lo pondrá también en Vercel) y cargarlo con `supabase secrets set --env-file`; poner `VIM_TIENDA_URL=https://pedidos.vimpos.com.mx`. **No escribir el secreto en el chat ni en el repo.**
5. `supabase functions deploy tienda --use-api`.
6. Probar desde aquí, con el secreto leído del archivo: sin cabecera → 401; con cabecera y `{"accion":"negocio","negocio":"no-existe"}` → 404 `TIENDA_NO_DISPONIBLE`. Eso prueba que arranca, que el secreto funciona y que llega a la base. No hay ninguna tienda encendida, así que no se puede probar más en producción todavía.
7. Regenerar `packages/db/src/database.types.ts` con `supabase gen types typescript --linked`, comprobar `tsc` en las cinco apps y confirmarlo en el PR.

- [ ] **Step 5: Mezclar** con squash cuando el CI esté en verde y Fermín lo autorice.

---

## Lo que esta entrega NO hace

- Cuentas de clientes (`registrar`, `entrar`, `recuperar`, «Mi cuenta»): entrega 6. `tienda_crear_pedido` ya acepta `p_cuenta`.
- La aceptación automática de un pedido con gestión `NUBE`, el timbre, las comandas, la pausa desde la caja y el reporte de estados: entrega 4.
- La página de la tienda y su servidor (quien llama a esta función y pone el widget antirobot): entrega 5.
- Ampliar `TURNSTILE_HOSTNAMES` con `pedidos.vimpos.com.mx`: entrega 5, cuando exista el dominio.

---

## Notas para las siguientes entregas

Lo que la revisión final de esta entrega dejó anotado para las que vienen.

- **Entrega 3 (admin):**
  - Avisar que cambiar la dirección de la tienda rompe los enlaces de seguimiento vivos, no solo los QR.
  - Darle a la tienda una fuente de logo (`tienda_negocio` devuelve `tenants.logo_png_url`, que hoy ninguna app escribe).
  - En la lista de revisión: los productos en una categoría inactiva no se venden, y avisar de combos con dos slots obligatorios que solo admiten el mismo producto (la cotización los rechaza).
  - Validar la forma del horario al guardar.
- **Entrega 4 (caja):**
  - Escribir `estado` de vuelta también en pedidos con gestión `NUBE` (la retención y el límite de vivos dependen de ello).
  - Convertir `TOTAL_NO_COINCIDE`, `ENVIO_NO_COINCIDE`, un componente de combo no disponible o un producto inexistente en un rechazo explícito con motivo de lista cerrada, no en una expiración silenciosa.
  - «Agotado» marcado en la caja llega al menú de la nube hasta el siguiente push (hasta 10 minutos).
  - Las banderas de IVA salen del catálogo de la caja y la cotización usa las de la nube.
  - Mostrar forma de pago y nota del cliente como campos separados (`nota_general` las concatena y una nota puede imitar la línea de pago).
  - Decidir qué significa `ERROR` para un pedido de la tienda.
  - La regla «con repartidor = en camino» no mira el estado de la asignación.
- **Entrega 5 (tienda y su servidor):**
  - Mandar siempre la IP real del cliente en `x-tienda-ip`.
  - Pedir un token antirobot nuevo tras cada `pedir` fallido.
  - Llamar a `cotizar` justo antes de `pedir` y mandar `total_esperado`.
  - `cantidad` es obligatoria y entera en opciones y componentes.
  - Guardar en caché `negocio` y `menu` del lado del servidor (un sondeo de seguimiento cada 10 s gasta solo la mitad de las 120 lecturas por 10 minutos por IP, y las operadoras móviles comparten IPv4).
  - Dejar el enlace de seguimiento fuera de analítica y de cabeceras `Referer`.
  - Un reintento tras un tiempo de espera crea un segundo pedido (considerar derivar el código de seguimiento de una llave por compra).
  - `renglones.detalle` no trae cantidades.
  - Añadir `pedidos.vimpos.com.mx` a `TURNSTILE_HOSTNAMES` (añadir, no reemplazar) y al widget de Cloudflare: sin eso todo `pedir` responde 403.
  - Si `pedir` responde 200 con `codigo` pero con `folio_corto`, `total_mxn` y `vence_aceptacion` en `null`, el pedido SÍ existe (la base respondió con una forma inesperada): llevar al cliente al seguimiento con ese código, no reintentar.
- **Entrega 7 (salida):**
  - Confirmar que `pedidos.vimpos.com.mx` sigue en `TURNSTILE_HOSTNAMES` y en el widget de Cloudflare (se añade en la entrega 5; añadir, no reemplazar).
  - Confirmar que `CAPTCHA_OPCIONAL` no está puesto en producción.
  - La retención debe blanquear también `nota_cliente` y las notas de renglón, y cubrir filas atascadas en `ACEPTADO`.
  - El aviso de privacidad debe decir que un pedido anónimo crea un cliente y una dirección permanentes en el negocio.
  - Revisar el cupo de 5 pedidos por hora por IP (se comparte entre negocios y cuentan los intentos fallidos).
  - Medir `tienda_negocio` y `tienda_cotizar` con un menú real (cada cotización arma el menú completo).
  - Antes de que la entrega 5 dependa de ella, ejercitar `negocio`, `menu` y `cotizar` en producción contra un negocio interno.
