# F5.2b — Descuento manual + Propina · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir aplicar un descuento manual al ticket (con autorización por PIN de supervisor cuando el operador no tiene el permiso) y capturar propina en el cobro, persistiendo todo en BD bajo RLS.

**Architecture:** Primitiva de autorización por PIN vía Edge Function `autorizar-pin` (PIN server-side con service_role, espejo de `pin-login`). El descuento usa el RPC existente `aplicar_descuento_manual` alimentado por un `autorizacion_pin_id`. La propina se fija en el ticket y `aplicar_pago` sube su tope a `total + propina`. CRUD client-side bajo RLS; verificación por smoke SQL + E2E en navegador.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno), Next.js 15 + React 19 + TS, Zod, `@vim/ui`.

**Spec:** `docs/superpowers/specs/2026-06-02-f5-2b-descuento-propina-design.md`

**Convención de verificación de este repo (no TDD unitario):** funciones de dinero → smoke SQL (`supabase/scripts/*.sql`); seguridad → `supabase test db` (RLS 8/8); ruta crítica → E2E en navegador (Preview). Igual que F5.2 (bugs #19/#20).

**Rama:** trabajar en `f5.2b-descuento-propina` (crear al iniciar: `git checkout -b f5.2b-descuento-propina`). Merge a `main` con `--no-ff` al cerrar las dos sub-rebanadas.

**Mapeo de motivos (P-078 chip → enum `descuento_manual_motivo`):**
`Cortesía → CORTESIA_INVITADO` · `Producto defectuoso → PRODUCTO_DEFECTO_LEVE` · `Cliente VIP/frecuente → CLIENTE_FRECUENTE` · `Ajuste de precio → INCONVENIENCIA_OPERATIVA` · `Otro → OTRO` (exige `motivo_texto`).

---

## FILE STRUCTURE

**Backend (nuevo):**
- `supabase/migrations/0018_f52b_autorizacion_pin.sql` — `verificar_autorizacion_pin`, `registrar_autorizacion_propia`, grants.
- `supabase/migrations/0020_f52b_propina.sql` — `establecer_propina_ticket`, `aplicar_pago` (tope = total+propina).
- `supabase/migrations/00NN_fix_*.sql` — fixes aditivos si el smoke caza bugs en `aplicar_descuento_manual`/`aplicar_pago` (como #19/#20). Número se asigna al crearlos.
- `supabase/functions/autorizar-pin/index.ts` — Edge Function.
- `supabase/scripts/smoke_descuento.sql`, `supabase/scripts/smoke_propina.sql` — smoke (rol postgres).
- `supabase/seed.sql` (modificar) — supervisor fixture.

**Frontend (nuevo en `apps/pos/app/`):**
- `lib/autorizacion.ts` — `autorizarConPin`, `autorizacionPropia` + tipos.
- `lib/descuento.ts` — `aplicarDescuento` + enums/labels + Zod.
- `components/modal-autorizacion-pin.tsx` — P-080 reutilizable.
- `components/modal-descuento.tsx` — P-078.
- `components/sidebar-ticket.tsx` (modificar) — botón "Aplicar descuento" + línea de descuento.
- `components/home-pos.tsx` (modificar) — montar modales, pasar operador.
- `components/modal-cobro.tsx` (modificar) — paso de propina.
- `lib/cobro.ts` (modificar) — `establecerPropina`.

---

# SUB-REBANADA 1 — DESCUENTO

## Task 1: Sembrar un supervisor fixture

**Files:**
- Modify: `supabase/seed.sql` (bloque fixture DEV, junto a María/dueño)

- [ ] **Step 1: Añadir supervisor al fixture**

En el `DO $$ ... $$` del fixture DEV (donde se crean María/dispositivo/dueño), añadir antes del `UPDATE auth.users ... token` final:

```sql
  -- ── SUPERVISOR (para autorizar descuentos por PIN) ──────────────────────────
  -- Diego R., rol SUPERVISOR (tiene descuento.manual_aplicar). PIN 4321.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', v_super, 'authenticated', 'authenticated',
          'diego@knockout.dev', crypt('devsuper', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado)
  VALUES (v_super, 'Diego R.', crypt('4321', gen_salt('bf')), 'ACTIVO');

  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (v_super, v_tenant, v_suc,
          (SELECT id FROM roles WHERE codigo = 'SUPERVISOR' AND es_sistema = true));
```

Declarar `v_super uuid := '99999999-0000-0000-0000-0000000000f1';` junto a las otras vars del `DECLARE`, e incluir `v_super` en el `UPDATE auth.users SET confirmation_token='' ... WHERE id IN (...)` final.

- [ ] **Step 2: Aplicar y verificar el supervisor existe con PIN**

Run:
```bash
supabase db reset
docker exec supabase_db_vim-pos psql -U postgres -d postgres -c "select up.nombre, r.codigo from usuarios_perfil up join usuarios_acceso ua on ua.usuario_id=up.id join roles r on r.id=ua.rol_id where up.nombre='Diego R.';"
```
Expected: una fila `Diego R. | SUPERVISOR`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(seed): supervisor fixture Diego R. (PIN 4321) para autorizar descuentos"
```

---

## Task 2: Migración 0018 — RPCs de autorización por PIN

**Files:**
- Create: `supabase/migrations/0018_f52b_autorizacion_pin.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- F5.2b — Primitiva de autorización por PIN de supervisor (P-080) + autorización propia.
-- verificar_autorizacion_pin: la invoca SOLO la Edge Function autorizar-pin (service_role).
-- registrar_autorizacion_propia: la invoca el cliente cuando el operador ya tiene el permiso.

-- ============================================================
-- verificar_autorizacion_pin — PIN-solo (fiel a P-080)
-- ============================================================
CREATE OR REPLACE FUNCTION verificar_autorizacion_pin(
  p_pin                    text,
  p_accion                 text,
  p_permiso_codigo         text,
  p_entidad_tipo           text,
  p_entidad_id             uuid,
  p_monto                  numeric,
  p_motivo                 text,
  p_caja_id                uuid,
  p_turno_id               uuid,
  p_usuario_solicitante_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp   -- 'extensions' por crypt()
AS $$
DECLARE
  v_tenant        uuid;
  v_autorizador   uuid;
  v_fallidos      integer;
  v_autorizacion  uuid;
BEGIN
  -- Tenant del solicitante (cajero)
  SELECT tenant_id INTO v_tenant
    FROM usuarios_acceso
   WHERE usuario_id = p_usuario_solicitante_id AND activo = true
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SOLICITANTE_SIN_TENANT');
  END IF;

  -- Anti-fuerza-bruta: 6 intentos fallidos por caja en 5 min → bloqueo temporal
  SELECT count(*) INTO v_fallidos
    FROM pin_intentos
   WHERE caja_id = p_caja_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos >= 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- Buscar autorizador: usuario del tenant CON el permiso cuyo PIN coincide
  SELECT up.id INTO v_autorizador
    FROM usuarios_perfil up
    JOIN usuarios_acceso ua ON ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true
    JOIN roles r           ON r.id = ua.rol_id
    JOIN rol_permisos rp    ON rp.rol_id = r.id AND rp.concedido = true
    JOIN permisos p         ON p.id = rp.permiso_id AND p.codigo = p_permiso_codigo
   WHERE up.pin_hash IS NOT NULL
     AND up.estado = 'ACTIVO'
     AND crypt(p_pin, up.pin_hash) = up.pin_hash
   LIMIT 1;

  IF v_autorizador IS NULL THEN
    INSERT INTO pin_intentos(tenant_id, caja_id, exitoso, motivo_fallo)
    VALUES (v_tenant, p_caja_id, false, 'AUTORIZACION');
    -- Distinguir "PIN válido pero sin permiso" de "PIN incorrecto" (mensaje de P-080)
    IF EXISTS (
      SELECT 1 FROM usuarios_perfil up
        JOIN usuarios_acceso ua ON ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true
       WHERE up.pin_hash IS NOT NULL AND crypt(p_pin, up.pin_hash) = up.pin_hash
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_PERMISO');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO');
  END IF;

  -- Registrar la autorización
  INSERT INTO autorizaciones_pin(
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo
  )
  SELECT v_tenant, (SELECT sucursal_id FROM cajas WHERE id = p_caja_id), p_caja_id, p_turno_id,
         p_usuario_solicitante_id, v_autorizador,
         p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo
  RETURNING id INTO v_autorizacion;

  INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso)
  VALUES (v_tenant, v_autorizador, p_caja_id, true);

  RETURN jsonb_build_object('ok', true, 'autorizacion_pin_id', v_autorizacion, 'autorizo_id', v_autorizador);
END;
$$;

COMMENT ON FUNCTION verificar_autorizacion_pin IS
  'F5.2b — verifica PIN de un autorizador con el permiso y registra autorizaciones_pin. Solo Edge Function autorizar-pin (service_role).';
REVOKE EXECUTE ON FUNCTION verificar_autorizacion_pin FROM authenticated, anon, public;

-- ============================================================
-- registrar_autorizacion_propia — el operador ya tiene el permiso
-- ============================================================
CREATE OR REPLACE FUNCTION registrar_autorizacion_propia(
  p_accion         text,
  p_permiso_codigo text,
  p_entidad_tipo   text,
  p_entidad_id     uuid,
  p_monto          numeric,
  p_motivo         text,
  p_caja_id        uuid,
  p_turno_id       uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_tiene  boolean;
  v_id     uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM usuarios_acceso WHERE usuario_id = v_uid AND activo = true LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_TENANT');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM usuarios_acceso ua
      JOIN roles r        ON r.id = ua.rol_id
      JOIN rol_permisos rp ON rp.rol_id = r.id AND rp.concedido = true
      JOIN permisos p      ON p.id = rp.permiso_id AND p.codigo = p_permiso_codigo
     WHERE ua.usuario_id = v_uid AND ua.tenant_id = v_tenant AND ua.activo = true
  ) INTO v_tiene;
  IF NOT v_tiene THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_PERMISO');
  END IF;

  INSERT INTO autorizaciones_pin(
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo
  )
  SELECT v_tenant, (SELECT sucursal_id FROM cajas WHERE id = p_caja_id), p_caja_id, p_turno_id,
         v_uid, v_uid, p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'autorizacion_pin_id', v_id);
END;
$$;

COMMENT ON FUNCTION registrar_autorizacion_propia IS
  'F5.2b — autorización propia (operador con el permiso). Corre bajo auth.uid().';
REVOKE EXECUTE ON FUNCTION registrar_autorizacion_propia FROM anon, public;
GRANT EXECUTE ON FUNCTION registrar_autorizacion_propia TO authenticated;
```

- [ ] **Step 2: Aplicar y verificar que la migración corre limpia**

Run: `supabase db reset 2>&1 | grep -iE "0018|error|Finished"`
Expected: `Applying migration 0018_...` y `Finished` sin ERROR.

- [ ] **Step 3: Verificar RLS sigue 8/8**

Run: `supabase test db 2>&1 | grep -iE "Result"`
Expected: `Result: PASS`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_f52b_autorizacion_pin.sql
git commit -m "feat(db): F5.2b — verificar_autorizacion_pin + registrar_autorizacion_propia (0018)"
```

---

## Task 3: Smoke SQL del descuento (verificar `aplicar_descuento_manual`)

**Files:**
- Create: `supabase/scripts/smoke_descuento.sql`

- [ ] **Step 1: Escribir el smoke**

```sql
-- Smoke F5.2b descuento (rol postgres). Crea ticket+item, autoriza por PIN, aplica
-- descuento y verifica que total_mxn baja. Ejecutar dentro de transacción y ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-000000000001'::uuid;
  v_turno  uuid;
  v_ticket uuid;
  v_prod   uuid;
  v_item   uuid;
  v_auth   jsonb;
  v_total_antes numeric;
  v_total_despues numeric;
BEGIN
  v_maria := '99999999-0000-0000-0000-000000000001';
  -- Turno
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-D', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  -- Producto del seed (Hamburguesa Clásica $120)
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  -- Ticket + item vía RPC
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR', 'smoke-d-1');
  v_item := agregar_item_a_ticket(v_ticket, v_prod, 1, ARRAY[]::uuid[], NULL, 'smoke-d-item');
  SELECT total_mxn INTO v_total_antes FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total antes: %', v_total_antes;  -- esperado 120.00

  -- Autorización (Diego supervisor, PIN 4321) vía la RPC server-side
  v_auth := verificar_autorizacion_pin('4321','descuento_manual','descuento.manual_aplicar','ticket',v_ticket,12,'CLIENTE_FRECUENTE'::text, v_caja, v_turno, v_maria);
  IF (v_auth->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'autorizacion fallo: %', v_auth; END IF;

  -- Descuento 10% al ticket
  PERFORM aplicar_descuento_manual(
    v_ticket, NULL, 'PORCENTAJE', 10, 'CLIENTE_FRECUENTE', NULL,
    (v_auth->>'autorizacion_pin_id')::uuid, v_maria, (v_auth->>'autorizo_id')::uuid, 'smoke-d-desc');

  SELECT total_mxn INTO v_total_despues FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total despues: %', v_total_despues;  -- esperado 108.00
  IF v_total_despues >= v_total_antes THEN RAISE EXCEPTION 'descuento NO bajo el total'; END IF;
  RAISE NOTICE 'SMOKE DESCUENTO OK: % -> %', v_total_antes, v_total_despues;
END $$;
ROLLBACK;
```

- [ ] **Step 2: Ejecutar el smoke**

Run: `docker exec -i supabase_db_vim-pos psql -U postgres -d postgres < supabase/scripts/smoke_descuento.sql 2>&1 | grep -iE "NOTICE|ERROR|EXCEPTION"`
Expected: `SMOKE DESCUENTO OK: 120.00 -> 108.00`.

- [ ] **Step 3: Si truena (bug de columnas, patrón #19/#20), crear fix aditivo**

Si el error es de columna inexistente en `aplicar_descuento_manual` o `abrir_ticket`/`agregar_item_a_ticket`, crear `supabase/migrations/00NN_fix_descuento.sql` con un `CREATE OR REPLACE FUNCTION` corrigiendo la columna (mapear al nombre real con `\d <tabla>`), re-`db reset`, re-correr el smoke. Documentar el bug en `docs/.../18-PLAYBOOK §4` (bitácora) como #21.

- [ ] **Step 4: Commit**

```bash
git add supabase/scripts/smoke_descuento.sql supabase/migrations/00NN_fix_descuento.sql 2>/dev/null
git commit -m "test(db): smoke del descuento manual (+ fix si aplica)"
```

---

## Task 4: Edge Function `autorizar-pin`

**Files:**
- Create: `supabase/functions/autorizar-pin/index.ts`

- [ ] **Step 1: Escribir la función (espeja `resetear-pin/index.ts`)**

```ts
// Edge Function: autorizar-pin (F5.2b) — verifica el PIN de un supervisor y registra
// la autorización. El PIN NUNCA se verifica en el cliente. Espeja resetear-pin.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const solicitanteId = u.user.id;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const { pin, accion, permiso_codigo, entidad_tipo, entidad_id, monto, motivo, caja_id, turno_id } = b as Record<string, string | number | null>;
  if (!pin || !accion || !permiso_codigo || !caja_id) return json({ error: "FALTAN_CAMPOS" }, 400);
  if (!/^\d{4,6}$/.test(String(pin))) return json({ error: "PIN_INVALIDO" }, 400);

  const { data, error } = await admin.rpc("verificar_autorizacion_pin", {
    p_pin: String(pin),
    p_accion: accion, p_permiso_codigo: permiso_codigo,
    p_entidad_tipo: entidad_tipo ?? null, p_entidad_id: entidad_id ?? null,
    p_monto: monto ?? null, p_motivo: motivo ?? "", p_caja_id: caja_id,
    p_turno_id: turno_id ?? null, p_usuario_solicitante_id: solicitanteId,
  });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);
  if (!data?.ok) {
    const motivoR = data?.motivo ?? "PIN_INCORRECTO";
    const status = motivoR === "BLOQUEADO" ? 423 : motivoR === "SIN_PERMISO" ? 403 : 401;
    return json({ error: motivoR }, status);
  }
  return json({ ok: true, autorizacion_pin_id: data.autorizacion_pin_id, autorizo_id: data.autorizo_id });
});
```

- [ ] **Step 2: Servir y probar con curl**

Run (en otra terminal, dejar corriendo):
`supabase functions serve autorizar-pin pin-login --no-verify-jwt --env-file supabase/functions/.env`

Probar (login María para el token, luego autorizar con PIN de Diego 4321):
```bash
ANON="<anon key local>"
MTOK=$(curl -s -X POST "http://127.0.0.1:54321/functions/v1/pin-login" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"usuario_id":"99999999-0000-0000-0000-000000000001","pin":"1234","caja_id":"99999999-0000-0000-0000-0000000000cc"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -X POST "http://127.0.0.1:54321/functions/v1/autorizar-pin" -H "apikey: $ANON" -H "Authorization: Bearer $MTOK" -H "Content-Type: application/json" -d '{"pin":"4321","accion":"descuento_manual","permiso_codigo":"descuento.manual_aplicar","entidad_tipo":"ticket","monto":12,"motivo":"prueba","caja_id":"99999999-0000-0000-0000-0000000000cc"}'
```
Expected: `{"ok":true,"autorizacion_pin_id":"...","autorizo_id":"..."}`. Probar también PIN `1234` (María, sin permiso) → `{"error":"SIN_PERMISO"}` (403), y PIN `0000` → `{"error":"PIN_INCORRECTO"}` (401).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/autorizar-pin/index.ts
git commit -m "feat(edge): autorizar-pin — verificación de PIN de supervisor server-side"
```

---

## Task 5: Capa cliente — `lib/autorizacion.ts` y `lib/descuento.ts`

**Files:**
- Create: `apps/pos/app/lib/autorizacion.ts`
- Create: `apps/pos/app/lib/descuento.ts`

- [ ] **Step 1: `lib/autorizacion.ts`**

```ts
"use client";
import { employeeClient } from "./supabase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type PayloadAutorizacion = {
  accion: string; permisoCodigo: string;
  entidadTipo: string; entidadId: string | null;
  monto: number | null; motivo: string;
  cajaId: string; turnoId: string;
};

/** Resultado uniforme de ambos caminos: id de la autorización + quién autorizó. */
export type Autorizacion = { autorizacionPinId: string; autorizoId: string };

function subDeToken(token: string): string {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("TOKEN_INVALIDO");
  const c = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  return c.sub as string;
}

/** Autorización por PIN de supervisor (Edge Function). */
export async function autorizarConPin(token: string, pin: string, p: PayloadAutorizacion): Promise<Autorizacion> {
  const res = await fetch(`${URL}/functions/v1/autorizar-pin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pin, accion: p.accion, permiso_codigo: p.permisoCodigo,
      entidad_tipo: p.entidadTipo, entidad_id: p.entidadId, monto: p.monto,
      motivo: p.motivo, caja_id: p.cajaId, turno_id: p.turnoId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return { autorizacionPinId: data.autorizacion_pin_id as string, autorizoId: data.autorizo_id as string };
}

/** Autorización propia (operador con el permiso) vía RPC. autorizoId = el propio operador. */
export async function autorizacionPropia(token: string, p: PayloadAutorizacion): Promise<Autorizacion> {
  const { data, error } = await employeeClient(token).rpc("registrar_autorizacion_propia", {
    p_accion: p.accion, p_permiso_codigo: p.permisoCodigo,
    p_entidad_tipo: p.entidadTipo, p_entidad_id: p.entidadId,
    p_monto: p.monto, p_motivo: p.motivo, p_caja_id: p.cajaId, p_turno_id: p.turnoId,
  });
  if (error) throw new Error(error.message);
  if (!(data as { ok?: boolean })?.ok) throw new Error((data as { motivo?: string })?.motivo ?? "SIN_PERMISO");
  return { autorizacionPinId: (data as { autorizacion_pin_id: string }).autorizacion_pin_id, autorizoId: subDeToken(token) };
}
```

- [ ] **Step 2: `lib/descuento.ts`**

```ts
"use client";
import { z } from "zod";
import { employeeClient } from "./supabase";

export type TipoDescuento = "PORCENTAJE" | "MONTO_FIJO";
export type MotivoDescuento =
  | "CORTESIA_INVITADO" | "PRODUCTO_DEFECTO_LEVE" | "CLIENTE_FRECUENTE"
  | "INCONVENIENCIA_OPERATIVA" | "OTRO";

export const MOTIVOS: { codigo: MotivoDescuento; label: string }[] = [
  { codigo: "CORTESIA_INVITADO", label: "Cortesía" },
  { codigo: "PRODUCTO_DEFECTO_LEVE", label: "Producto defectuoso" },
  { codigo: "CLIENTE_FRECUENTE", label: "Cliente VIP / frecuente" },
  { codigo: "INCONVENIENCIA_OPERATIVA", label: "Ajuste de precio" },
  { codigo: "OTRO", label: "Otro" },
];

export const descuentoSchema = z.object({
  tipo: z.enum(["PORCENTAJE", "MONTO_FIJO"]),
  valor: z.number().positive("El valor debe ser mayor a 0"),
  motivoCategoria: z.enum(["CORTESIA_INVITADO","PRODUCTO_DEFECTO_LEVE","CLIENTE_FRECUENTE","INCONVENIENCIA_OPERATIVA","OTRO"]),
  motivoTexto: z.string().trim().max(200).optional().or(z.literal("")),
}).refine((d) => d.motivoCategoria !== "OTRO" || (d.motivoTexto ?? "").length > 0, {
  message: "Describe el motivo", path: ["motivoTexto"],
}).refine((d) => d.tipo !== "PORCENTAJE" || d.valor <= 100, {
  message: "El porcentaje no puede pasar de 100", path: ["valor"],
});
export type DescuentoInput = z.infer<typeof descuentoSchema>;

/** Aplica el descuento (asume autorizacion_pin_id ya obtenido). Dispara recalcular_totales por trigger. */
export async function aplicarDescuento(
  token: string,
  args: { ticketId: string; input: DescuentoInput; autorizacionPinId: string; solicitanteId: string; autorizoId: string },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("aplicar_descuento_manual", {
    p_ticket_id: args.ticketId,
    p_ticket_item_id: null,
    p_tipo: args.input.tipo,
    p_valor: args.input.valor,
    p_motivo_categoria: args.input.motivoCategoria,
    p_motivo_texto: args.input.motivoTexto || null,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
}

/** Calcula el monto de descuento para PREVIEW en cliente (la BD es la autoridad). */
export function previewDescuento(tipo: TipoDescuento, valor: number, totalActual: number): number {
  if (!valor || valor <= 0) return 0;
  const m = tipo === "PORCENTAJE" ? (totalActual * Math.min(valor, 100)) / 100 : Math.min(valor, totalActual);
  return Math.round(m * 100) / 100;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully` (los libs aún no se importan, pero deben tipar).

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/lib/autorizacion.ts apps/pos/app/lib/descuento.ts
git commit -m "feat(pos): libs de autorización por PIN y descuento (cliente)"
```

---

## Task 6: `modal-autorizacion-pin.tsx` (P-080, reutilizable)

**Files:**
- Create: `apps/pos/app/components/modal-autorizacion-pin.tsx`

**Patrón a espejar:** `apps/pos/app/components/modal-sesion-expirada.tsx` (usa `Modal` de `@vim/ui` + `PinKeypad`, maneja estados error/ok). Reusar `PinKeypad`.

- [ ] **Step 1: Implementar el componente**

Props:
```ts
{
  token: string;
  accion: string;            // 'descuento_manual'
  permisoCodigo: string;     // 'descuento.manual_aplicar'
  descripcion: string;       // "Descuento de $12.00 · Cliente VIP"
  ejecutaNombre: string;     // nombre del cajero (P-080: "Lo ejecuta X")
  monto: number | null;
  entidadTipo: string; entidadId: string | null;
  cajaId: string; turnoId: string;
  motivo: string;
  onAutorizado: (autorizacionPinId: string) => void;
  onCancelar: () => void;
}
```

Comportamiento (fiel a P-080):
- Encabezado "Autorización requerida" + `descripcion` + "Lo ejecuta `{ejecutaNombre}` · debe autorizar un supervisor o admin".
- `PinKeypad length={4}` → `onComplete(pin)` llama `autorizarConPin(token, pin, {accion, permisoCodigo, entidadTipo, entidadId, monto, motivo, cajaId, turnoId})`.
- En éxito: estado `ok` ("Autorizado") y `onAutorizado(id)` tras ~600ms.
- En error: mapear el mensaje (`SIN_PERMISO` → "Ese PIN es válido pero no puede autorizar esta operación. Pide el PIN de un supervisor o administrador."; `PIN_INCORRECTO` → "PIN incorrecto."; `BLOQUEADO` → "Demasiados intentos. Espera unos minutos."), `status='error'`, limpiar el keypad (`clearSignal`) para reintentar.
- Botón "Cancelar" → `onCancelar`.

Usar el contenedor `Modal` (`hideTitle`, `className` de tarjeta ~`w-[360px]`), igual estilo que `modal-sesion-expirada`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/components/modal-autorizacion-pin.tsx
git commit -m "feat(pos): modal-autorizacion-pin reutilizable (P-080)"
```

---

## Task 7: `modal-descuento.tsx` (P-078)

**Files:**
- Create: `apps/pos/app/components/modal-descuento.tsx`

**Patrón a espejar:** `apps/admin/app/components/modal-categoria.tsx` (estructura `Modal` + form + Zod `safeParse` + estado guardando/error). Y `modal-cobro.tsx` del POS para el estilo del numpad si se usa.

- [ ] **Step 1: Implementar**

Props:
```ts
{
  token: string;
  empleado: Empleado;        // de lib/supabase — trae rol
  ticketId: string;
  totalActual: number;
  cajaId: string; turnoId: string;
  onAplicado: () => void;    // el padre recarga totales del ticket
  onCerrar: () => void;
}
```

UI (P-078): segmento **Porcentaje / Monto fijo**; input `valor`; chips de `MOTIVOS` (de `lib/descuento`); si motivo `OTRO` → input `motivoTexto`; bloque de preview: "Total actual / Descuento −$X / Nuevo total" usando `previewDescuento`. Banner según permiso:
- Si `empleado.rol` ∈ {SUPERVISOR, ADMIN, DUENO} → "Dentro de tu límite · no requiere autorización".
- Si CAJERO → "Requiere PIN de supervisor".

Al "Aplicar descuento":
1. `descuentoSchema.safeParse(...)`; si falla, mostrar el issue.
2. Construir `payload = { accion:'descuento_manual', permisoCodigo:'descuento.manual_aplicar', entidadTipo:'ticket', entidadId: ticketId, monto: previewDescuento(...), motivo: <label del motivo o motivoTexto>, cajaId, turnoId }`.
3. Si el operador tiene permiso (`["SUPERVISOR","ADMIN","DUENO"].includes(empleado.rol)`): `const id = await autorizacionPropia(token, payload)`.
   Si no: montar `<ModalAutorizacionPin .../>` (estado local `pidiendoPin=true`); su `onAutorizado(id)` continúa el paso 4.
4. Ambos caminos devuelven `Autorizacion = { autorizacionPinId, autorizoId }` (contrato ya unificado en Task 5). Llamar:
   `await aplicarDescuento(token, { ticketId, input, autorizacionPinId: a.autorizacionPinId, solicitanteId: empleado.id, autorizoId: a.autorizoId })`.
5. `onAplicado()` (cierra y recarga). Mostrar confirmación "Descuento aplicado".

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/components/modal-descuento.tsx
git commit -m "feat(pos): modal-descuento (P-078) con autorización propia o por PIN"
```

---

## Task 8: Integrar en `sidebar-ticket` + `home-pos`

**Files:**
- Modify: `apps/pos/app/components/sidebar-ticket.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx`

- [ ] **Step 1: `sidebar-ticket` — botón + línea de descuento**

El descuento se aplica a un ticket **persistido**. Hoy el carrito se persiste solo al cobrar. Decisión: el botón "Aplicar descuento" aparece habilitado solo cuando hay líneas; al pulsarlo, si el ticket aún no existe en BD, primero persiste (igual que `iniciarCobro`: `persistirTicket(...)`) y luego abre `modal-descuento` con ese `ticketId`. Tras aplicar, releer totales del ticket (`releerTotales(token, ticketId)` — añadir a `lib/cobro.ts`, un `select` de `tickets`) y mostrar la línea "Descuento −$X" + "Total" actualizado en el resumen.

Añadir a props del `SidebarTicket`: `onAplicarDescuento: () => void` y campos opcionales `descuentoMxn?: number`, `totalConDescuento?: number` para el resumen.

- [ ] **Step 2: `home-pos` — estado y montaje**

- Añadir estado `descuentoCtx: { ticketId: string; total: number } | null`.
- `onAplicarDescuento`: persistir ticket si hace falta → `setDescuentoCtx({ ticketId, total })`.
- Montar `{descuentoCtx && <ModalDescuento token={token} empleado={empleado} ticketId={descuentoCtx.ticketId} totalActual={descuentoCtx.total} cajaId={turno.caja_id} turnoId={turno.id} onAplicado={...} onCerrar={() => setDescuentoCtx(null)} />}`.
- En `onAplicado`: releer totales y guardarlos para el resumen; mantener el `ticketId` para que el cobro use ese mismo ticket (no re-persistir).

> Importante: cuando ya hay un `ticketId` por descuento, `iniciarCobro` debe **reusarlo** en vez de `persistirTicket` otra vez. Ajustar `iniciarCobro`/`persistirTicket` para aceptar un `ticketId` existente (si está, salta `abrir_ticket` + `agregar_item`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/components/sidebar-ticket.tsx apps/pos/app/components/home-pos.tsx apps/pos/app/lib/cobro.ts
git commit -m "feat(pos): integrar descuento en sidebar-ticket + home-pos"
```

---

## Task 9: E2E navegador del descuento + cierre sub-rebanada 1

- [ ] **Step 1: Levantar entorno**

Run (terminales separadas):
```bash
supabase functions serve autorizar-pin pin-login --no-verify-jwt --env-file supabase/functions/.env
```
Y reiniciar el Preview del POS (contexto limpio para evitar el gotcha de HMR/GoTrue).

- [ ] **Step 2: Recorrido E2E**

1. Login María (PIN 1234) → abrir turno → agregar "Hamburguesa Clásica".
2. "Aplicar descuento" → 10% → motivo "Cliente VIP" → "Aplicar".
3. Como María es CAJERO → aparece P-080 → teclear PIN **4321** (Diego) → "Autorizado".
4. Verificar: sidebar muestra "Descuento −$12.00" y "Total $108.00".
5. Verificar en BD:
   `docker exec supabase_db_vim-pos psql -U postgres -d postgres -c "select t.total_mxn, t.descuentos_manuales_mxn, a.usuario_autorizo_id from tickets t join ticket_descuentos_manuales d on d.ticket_id=t.id join autorizaciones_pin a on a.id=d.autorizacion_pin_id order by t.created_at desc limit 1;"`
   Expected: `total_mxn ≈ 108.00`, `descuentos_manuales_mxn ≈ 12.00`, autorizó = id de Diego.
6. Caso sin permiso correcto: PIN **1234** (María) en P-080 → "Ese PIN no puede autorizar…" (SIN_PERMISO).

- [ ] **Step 3: RLS y commit final de la sub-rebanada**

Run: `supabase test db 2>&1 | grep Result` → `PASS`.
```bash
git add -A && git commit -m "test(pos): E2E descuento manual verificado (cajero→PIN supervisor→total baja)"
```

---

# SUB-REBANADA 2 — PROPINA

## Task 10: Migración 0020 — propina

**Files:**
- Create: `supabase/migrations/0020_f52b_propina.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- F5.2b — Propina: fijar propina en el ticket y permitir cobrar total + propina.

CREATE OR REPLACE FUNCTION establecer_propina_ticket(
  p_ticket_id uuid,
  p_monto_mxn numeric
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_monto_mxn < 0 THEN RAISE EXCEPTION 'PROPINA_INVALIDA'; END IF;
  UPDATE tickets
     SET propina_mxn = p_monto_mxn, updated_at = now()
   WHERE id = p_ticket_id
     AND estado_fiscal NOT IN ('CANCELADO');
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no editable', p_ticket_id; END IF;
END;
$$;
COMMENT ON FUNCTION establecer_propina_ticket IS 'F5.2b — fija tickets.propina_mxn. RLS por el invocador (SECURITY INVOKER).';
REVOKE EXECUTE ON FUNCTION establecer_propina_ticket FROM anon, public;
GRANT EXECUTE ON FUNCTION establecer_propina_ticket TO authenticated;
```

Para `aplicar_pago`: copiar la definición completa actual (0008:1819) y cambiar **solo** la línea del tope:
```sql
-- ANTES:
IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + 0.01 THEN
-- DESPUÉS:
IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + v_ticket.propina_mxn + 0.01 THEN
```
Incluir el `CREATE OR REPLACE FUNCTION aplicar_pago(...) ...` completo con ese único cambio (leer la definición vigente con `sed -n '1819,1920p' supabase/migrations/0008_operacion_venta.sql` y replicarla con el ajuste; si hubo un fix #21 en aplicar_pago, partir de la versión corregida).

- [ ] **Step 2: Aplicar + RLS**

Run: `supabase db reset 2>&1 | grep -iE "0020|error|Finished"` → sin ERROR.
Run: `supabase test db 2>&1 | grep Result` → `PASS`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0020_f52b_propina.sql
git commit -m "feat(db): F5.2b — establecer_propina_ticket + aplicar_pago acepta total+propina (0020)"
```

---

## Task 11: Smoke SQL propina

**Files:**
- Create: `supabase/scripts/smoke_propina.sql`

- [ ] **Step 1: Escribir el smoke** (estructura igual a `smoke_descuento.sql`: crear turno+ticket+item con los RPC, luego:)

```sql
  PERFORM establecer_propina_ticket(v_ticket, 18);
  -- Pago en efectivo cubriendo total + propina (120 + 18 = 138), recibido 200
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO', 138, 200, false);
  SELECT propina_mxn, monto_pagado_mxn, cambio_mxn, estado_fiscal INTO v_prop, v_pag, v_cambio, v_estado FROM tickets WHERE id=v_ticket;
  IF v_prop <> 18 THEN RAISE EXCEPTION 'propina no fijada: %', v_prop; END IF;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'ticket no quedó PAGADO: %', v_estado; END IF;
  RAISE NOTICE 'SMOKE PROPINA OK: propina=% pagado=% cambio=% estado=%', v_prop, v_pag, v_cambio, v_estado;
```
(declarar las vars `v_prop, v_pag, v_cambio numeric; v_estado text;` y envolver en `BEGIN; DO $$ ... $$; ROLLBACK;`).

- [ ] **Step 2: Ejecutar**

Run: `docker exec -i supabase_db_vim-pos psql -U postgres -d postgres < supabase/scripts/smoke_propina.sql 2>&1 | grep -iE "NOTICE|ERROR|EXCEPTION"`
Expected: `SMOKE PROPINA OK: propina=18 ... estado=PAGADO`. Si el pago de 138 es rechazado, el ajuste de `aplicar_pago` falló → revisar 0020.

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/smoke_propina.sql
git commit -m "test(db): smoke de propina (pago total+propina deja ticket PAGADO)"
```

---

## Task 12: Propina en el cobro (`modal-cobro` + `lib/cobro`)

**Files:**
- Modify: `apps/pos/app/lib/cobro.ts`
- Modify: `apps/pos/app/components/modal-cobro.tsx`

- [ ] **Step 1: `lib/cobro.ts` — `establecerPropina` + leer sugerencias**

```ts
export async function establecerPropina(token: string, ticketId: string, monto: number): Promise<void> {
  const { error } = await employeeClient(token).rpc("establecer_propina_ticket", { p_ticket_id: ticketId, p_monto_mxn: monto });
  if (error) throw new Error(error.message);
}

export async function leerSugerenciasPropina(token: string, sucursalId: string): Promise<{ porcentajes: number[]; capturar: boolean; libre: boolean; sin: boolean }> {
  const { data } = await employeeClient(token)
    .from("sucursal_propinas_config")
    .select("porcentajes_sugeridos, capturar_propina, permitir_monto_libre, permitir_sin_propina")
    .eq("sucursal_id", sucursalId).maybeSingle();
  return {
    porcentajes: (data?.porcentajes_sugeridos as number[]) ?? [10, 15, 20],
    capturar: data?.capturar_propina ?? true,
    libre: data?.permitir_monto_libre ?? true,
    sin: data?.permitir_sin_propina ?? true,
  };
}
```

- [ ] **Step 2: `modal-cobro.tsx` — paso de propina (P-075)**

Al abrir el cobro (ya recibe `totalesIniciales` con el `ticketId` y `total`), si `capturar` es true, mostrar **antes del método de pago** un bloque "Propina": chips de `porcentajes` (calculan `total * pct/100`), opción "Otro" (monto libre) y "Sin propina". Al elegir → `establecerPropina(token, ticketId, monto)` y guardar `propina` en estado; el "a cobrar" pasa a `total + propina` y el resto del flujo de pago (efectivo/cambio/dividido) usa ese gran total. Mostrar la propina como línea en el resumen.

Pasar `sucursalId` al `ModalCobro` desde `home-pos` (está en `caja.sucursal_id`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"` → `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/lib/cobro.ts apps/pos/app/components/modal-cobro.tsx apps/pos/app/components/home-pos.tsx
git commit -m "feat(pos): propina en el cobro (P-075) — sugerencias + libre + sin"
```

---

## Task 13: E2E navegador propina + cierre

- [ ] **Step 1: Recorrido E2E**

1. Login María → turno → agregar producto → Cobrar.
2. En el cobro aparece Propina: elegir 15% → el "a cobrar" sube a `total + propina`.
3. Pagar en efectivo con un recibido mayor → cambio correcto → ticket PAGADO + confirmación.
4. Verificar BD:
   `docker exec supabase_db_vim-pos psql -U postgres -d postgres -c "select total_mxn, propina_mxn, monto_pagado_mxn, cambio_mxn, estado_fiscal from tickets order by created_at desc limit 1;"`
   Expected: `propina_mxn > 0`, `monto_pagado_mxn = total + propina`, `estado_fiscal = PAGADO`.
5. Probar también monto libre y "Sin propina".

- [ ] **Step 2: Commit final + merge**

Run: `supabase test db 2>&1 | grep Result` → `PASS`.
```bash
git add -A && git commit -m "test(pos): E2E propina verificado (total+propina, cambio, PAGADO)"
git checkout main && git merge --no-ff f5.2b-descuento-propina -m "merge: F5.2b — descuento manual + propina (autorización por PIN, P-075/078/080)"
git push origin main
```

- [ ] **Step 3: Actualizar tablero**

Actualizar `MEMORY.md` (F5.2b ✅) y `18-PLAYBOOK §4` (bitácora con los fixes #21+ si hubo) y la línea F5 del Playbook.

---

## Self-review (cobertura del spec)

- §2 descuento %/monto nivel ticket + motivo → Tasks 7, 5(`descuento.ts`). ✅
- §3.1 autorización por permiso (propia vs PIN) → Tasks 2, 5(`autorizacion.ts`), 7. ✅
- §3.2/4.3 Edge Function PIN server-side → Task 4. ✅
- §4.2 `verificar_autorizacion_pin` (PIN-solo, anti-FB por caja) + `registrar_autorizacion_propia` → Task 2. ✅
- §3.4/4.2 propina (tope total+propina, `establecer_propina_ticket`) → Tasks 10, 12. ✅
- §2 verificar RPC sin ejecutar + fixes aditivos → Tasks 3 (descuento), 11 (propina). ✅
- §1 gate seguridad (PIN nunca en cliente; SIN_PERMISO; RLS 8/8) → Tasks 4, 9, 13. ✅
- Seed supervisor → Task 1. ✅
- Deuda (cortesía/ítem/override/límite-$) → fuera de alcance, no hay tareas (correcto). ✅
