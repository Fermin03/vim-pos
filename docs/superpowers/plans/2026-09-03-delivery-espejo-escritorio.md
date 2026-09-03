# Delivery — Espejo de pedidos de apps en la caja de escritorio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una sucursal que opera con el programa instalado vea y gestione los pedidos de Uber Eats desde su caja: el ticket se crea en la base local (folio local, KDS local, comanda) y todo cambio de estado pasa por la nube.

**Architecture:** La nube decide por pedido quién lo gestiona (`gestion = NUBE|ESCRITORIO`) mirando el latido `cajas.espejo_apps_at`. Un agente en el proceso principal de Electron lee cada 10 s la Edge Function `delivery-espejo` (token de dispositivo), espeja conexiones y pedidos en la base local, reclama y crea el ticket local con `crear_ticket_desde_app`, y acepta en Uber vía `delivery-accion`. El gateway local reenvía `delivery-accion` a la nube con el token de dispositivo. El ticket sube con el push y `sync-push` lo enlaza al pedido.

**Tech Stack:** Postgres/pgTAP (mig. 0096), Deno Edge Functions probadas con `node --test --experimental-strip-types`, Node ESM en `desktop/src` probado con `node --test`, POS Next (un cambio de condición).

**Spec:** `docs/superpowers/specs/2026-09-03-delivery-espejo-escritorio-design.md`

## Global Constraints

- RLS sagrado; el escritorio solo habla con la nube con el token de **dispositivo**; el gateway nunca expone ese token al navegador.
- El id de caja de un dispositivo sale de su correo `caja-<uuid_caja>@dispositivos.vimpos.mx` (patrón de alta) y se verifica contra `cajas` del tenant.
- `payload_raw` es NOT NULL: el espejo escribe `{}`; nunca baja `payload_raw` ni `credencial_*`.
- Migración aditiva 0096; después `pnpm db:types`.
- Docker puede no estar disponible: las pruebas SQL se corren contra el Postgres embebido (`desktop/`: `npm run backend`, puerto 54329, base `vimpos`, password en `desktop/bin/.pg-password`) con el patrón de `scratchpad/retencion_embebido.mjs`; pgTAP queda para cuando Docker vuelva.
- Rama: `delivery-espejo-escritorio` (creada).

---

### Task 1: Migración 0096 + pgTAP 0008

**Files:**
- Create: `supabase/migrations/0096_delivery_espejo_escritorio.sql`
- Create: `supabase/tests/0008_delivery_espejo.test.sql`
- Modify: `packages/db/src/database.types.ts` (regenerar)

**Interfaces (produce):** columnas `delivery_pedidos.gestion`, `delivery_pedidos.gestion_caja_id`, `cajas.espejo_apps_at`; RPCs `sucursal_con_espejo(uuid, integer) → boolean`, `delivery_reclamar_pedido(uuid, uuid) → boolean`, `delivery_enlazar_tickets(uuid) → integer`; `crear_ticket_desde_app` acepta `ACEPTADO` con `ticket_id NULL`.

- [ ] **Step 1: migración**

```sql
-- 0096 — Espejo de pedidos de apps en la caja de escritorio (spec 2026-09-03).
ALTER TABLE delivery_pedidos
  ADD COLUMN IF NOT EXISTS gestion         text NOT NULL DEFAULT 'NUBE' CHECK (gestion IN ('NUBE', 'ESCRITORIO')),
  ADD COLUMN IF NOT EXISTS gestion_caja_id uuid NULL REFERENCES cajas(id);
COMMENT ON COLUMN delivery_pedidos.gestion IS 'Quién crea el ticket: NUBE (POS web) o ESCRITORIO (agente de espejo de una caja instalada).';
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS espejo_apps_at timestamptz NULL;
COMMENT ON COLUMN cajas.espejo_apps_at IS 'Último latido del agente de espejo de pedidos de apps (cada 10 s mientras la caja instalada está viva).';

CREATE OR REPLACE FUNCTION sucursal_con_espejo(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cajas c
    WHERE c.sucursal_id = p_sucursal AND c.activa
      AND c.espejo_apps_at IS NOT NULL AND c.espejo_apps_at > now() - make_interval(secs => p_segundos));
$$;
REVOKE ALL ON FUNCTION sucursal_con_espejo(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sucursal_con_espejo(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION delivery_reclamar_pedido(p_pedido uuid, p_caja uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ok boolean := false;
BEGIN
  UPDATE delivery_pedidos SET gestion_caja_id = p_caja
   WHERE id = p_pedido AND gestion = 'ESCRITORIO' AND (gestion_caja_id IS NULL OR gestion_caja_id = p_caja)
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END $$;
REVOKE ALL ON FUNCTION delivery_reclamar_pedido(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_reclamar_pedido(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION delivery_enlazar_tickets(p_tenant uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer := 0;
BEGIN
  WITH e AS (
    UPDATE delivery_pedidos p SET ticket_id = t.id
      FROM tickets t
     WHERE p.tenant_id = p_tenant AND p.ticket_id IS NULL
       AND t.tenant_id = p_tenant AND t.origen_creacion = 'API_EXTERNA'
       AND t.folio_externo_app = p.id_externo AND t.modo_servicio = p.app
    RETURNING p.id)
  SELECT count(*) INTO v_n FROM e;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION delivery_enlazar_tickets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_enlazar_tickets(uuid) TO service_role;
```

Y `CREATE OR REPLACE FUNCTION crear_ticket_desde_app` = copia íntegra de 0094 cambiando solo:
```sql
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR', 'ACEPTADO') THEN
```
(el guard `IF v_pedido.ticket_id IS NOT NULL THEN RETURN` ya cubre el caso ACEPTADO con ticket).

- [ ] **Step 2: pgTAP 0008** — reclamo por dos cajas (segunda devuelve false), `sucursal_con_espejo` true/false por latido, `delivery_enlazar_tickets` enlaza un ticket con `folio_externo_app`, `crear_ticket_desde_app` con estado ACEPTADO y ticket NULL crea ticket (usar el fixture del tenant `99999999-…aa` como el smoke, con turno abierto).
- [ ] **Step 3: correr contra el Postgres embebido** (runner tipo `retencion_embebido.mjs` que aplique el archivo y ejecute las comprobaciones) o `supabase test db` si Docker está. `pnpm db:types`. Commit.

---

### Task 2: Webhook — `PENDIENTE_ESCRITORIO`

**Files:** `supabase/functions/_shared/delivery/procesar-uber.ts`, `procesar-uber.test.ts`

- [ ] `ResultadoProceso.accion` gana `"PENDIENTE_ESCRITORIO"`. Tras insertar el pedido y antes del paso 5:
```ts
  const { data: espejo } = await deps.db.rpc("sucursal_con_espejo", { p_sucursal: cx.sucursal_id });
  if (espejo === true) {
    await deps.db.from("delivery_pedidos").update({ gestion: "ESCRITORIO" }).eq("id", pedidoId);
    return { pedido_id: pedidoId, accion: "PENDIENTE_ESCRITORIO" };
  }
```
- [ ] Prueba: el fake `db.rpc` devuelve `{ data: true }` para `sucursal_con_espejo` → accion `PENDIENTE_ESCRITORIO`, ningún `crear_ticket_desde_app`, ningún `uber.aceptar`; con `false` → flujo actual (las pruebas existentes deben devolver `false`/`null` por defecto). `pnpm test:functions`. Commit.

---

### Task 3: `delivery-accion` (reclamar, aceptar en ESCRITORIO), `delivery-espejo`, `sync-push`

**Files:**
- Modify: `supabase/functions/delivery-accion/index.ts`
- Create: `supabase/functions/delivery-espejo/index.ts`
- Modify: `supabase/functions/sync-push/index.ts`
- Modify: `supabase/functions/README.md`

- [ ] **delivery-accion**: tras resolver `tenantId`, calcular `esDispositivo = claims.tipo_identidad === "DISPOSITIVO"` (decodificar el payload del JWT) y `cajaId` desde `userResp.user.email` (`/^caja-([0-9a-f-]{36})@/`), verificado con `admin.from("cajas").select("id, sucursal_id").eq("id", cajaId).eq("tenant_id", tenantId)`. Acciones:
  - `reclamar` (`pedido_id`; solo dispositivo): pedido del tenant y de la sucursal de la caja; `admin.rpc("delivery_reclamar_pedido", { p_pedido, p_caja })` → `{ ok: true }` o 409 `RECLAMADO_POR_OTRA_CAJA`.
  - `aceptar`: si `pedido.gestion === "ESCRITORIO"`: si es dispositivo, reclamar (409 si es de otra caja); **no** RPC de ticket; `uber.aceptar(...)` (YA_PROCESADA tolerado); `delivery_pedido_transicion(pedido, 'ACEPTADO')`; devolver `{ ok: true, gestion: "ESCRITORIO" }`. Si `gestion === "NUBE"`: flujo actual.
  - El select del pedido añade `gestion, gestion_caja_id, sucursal_id`.
- [ ] **delivery-espejo** (`verify_jwt` normal): solo `tipo_identidad = DISPOSITIVO` (403 `SOLO_DISPOSITIVO`); caja por correo; `UPDATE cajas SET espejo_apps_at = now()`; responde `{ ahora, conexiones: [...sin credencial_tienda/credencial_vence], pedidos: [...sin payload_raw] }` de la sucursal de la caja: `delivery_conexiones` (todas), `delivery_pedidos` con `estado in (RECIBIDO, ACEPTADO, EN_PREPARACION, LISTO, ERROR) OR recibido_at >= now()-24h`, límite 200.
- [ ] **sync-push**: tras la RPC, `const { data: enlazados } = await admin.rpc("delivery_enlazar_tickets", { p_tenant: tenant })` y devolver `{ resultado: data, enlazados }`.
- [ ] README de funciones. Commit. (Prueba local si hay Docker: `functions serve` + curl con el JWT del dispositivo `caja-…cc@dispositivos.vimpos.mx` / `vim-device-dev`.)

---

### Task 4: Escritorio — planificador puro + agente + gateway

**Files:**
- Create: `desktop/src/delivery-espejo-plan.mjs`, `desktop/src/delivery-espejo-plan.test.mjs`
- Create: `desktop/src/delivery-espejo.mjs`
- Modify: `desktop/src/gateway.mjs` (proxy), `desktop/src/main.mjs` (arranque/paro, `backend.nube`)
- Modify: root `package.json` → `"test:escritorio": "node --test desktop/src/*.test.mjs"`

- [ ] **Planificador** `planificarEspejo({ conexiones, pedidos, localPedidos, turnoAbierto, cajaId })`:
  - `filaLocal(p, local)`: copia todas las columnas conocidas de `delivery_pedidos` (lista de 0090 + `gestion`, `gestion_caja_id`), `payload_raw = {}`, `ticket_id = local?.ticket_id ?? null`.
  - `aCrear`: `gestion === 'ESCRITORIO'` y `(gestion_caja_id ?? cajaId) === cajaId` y `!local?.ticket_id` y (`estado === 'ACEPTADO'` o (`estado === 'RECIBIDO'` y `conexion.auto_aceptar` y `turnoAbierto` y `puedeCrear(p, conexion)`)) — `puedeCrear` = sin `items_sin_mapear` o `conexion.config.producto_generico_id`. Orden por `vence_aceptacion`.
  - `avisos`: `['CANCELADO','EXPIRADO'].includes(p.estado) && local?.ticket_id` → `{ pedidoId, motivo: "La app canceló este pedido: cancela el ticket en caja" }`.
  - Pruebas: 6 casos (conserva ticket local; auto‑aceptar; ACEPTADO sin ticket; de otra caja no; sin turno no; aviso por cancelación).
- [ ] **Agente** `crearEspejo({ pool, nube: () => Promise<{cloudUrl, anonKey, deviceToken}|null>, cajaId, log, cadaMs = 10_000 })` con `iniciar()/detener()/tick()`:
  1. `POST ${cloudUrl}/functions/v1/delivery-espejo` (apikey + bearer).
  2. Local: `turnoAbierto = EXISTS turnos ABIERTO de la sucursal de la caja`; `localPedidos = SELECT id, ticket_id, estado FROM delivery_pedidos WHERE id = ANY($1)`.
  3. Transacción: upsert `delivery_conexiones` (ON CONFLICT (id) DO UPDATE de columnas no sensibles) y `delivery_pedidos` (ON CONFLICT (id) DO UPDATE de todo menos `ticket_id`, que se conserva con `COALESCE(delivery_pedidos.ticket_id, EXCLUDED.ticket_id)`).
  4. Por `aCrear`: `POST delivery-accion {accion:'reclamar'}` → si `!ok` saltar; `SELECT crear_ticket_desde_app($1)` local (captura errores `SIN_TURNO_ABIERTO`/`ITEM_SIN_MAPEAR` → `ultimo_error` local y seguir); si estaba `RECIBIDO`: `POST delivery-accion {accion:'aceptar', pedido_id, tiempo_prep_min}` → si falla por red queda para el siguiente tick.
  5. `avisos` → `UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1` local.
  Token de nube cacheado 20 min; sin nube → `log("sin nube")` y esperar.
- [ ] **Gateway**: antes del `503 FUNCION_REQUIERE_NUBE`:
```js
      if (p === "/functions/v1/delivery-accion") {
        const u = await getUser(pool, secret, bearer(req));
        if (u.error) return send(u.error, u.body);
        const nube = await backend.nube?.();
        if (!nube) return send(503, { error: "FUNCION_REQUIERE_NUBE", funcion: "delivery-accion" });
        const cuerpo = await readBody(req);
        const up = await fetch(`${nube.cloudUrl}/functions/v1/delivery-accion`, {
          method: "POST", body: cuerpo,
          headers: { apikey: nube.anonKey, Authorization: `Bearer ${nube.deviceToken}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
        if (!up) return send(503, { error: "SIN_RED" });
        return send(up.status, await up.text(), "application/json");
      }
```
(`send` debe admitir texto ya serializado: revisar su firma y adaptar.)
- [ ] **main.mjs**: tras `startBackend`, `backend.nube = tokenDeNubeCacheado` (envoltorio de `tokenDeNube()` con caché de 20 min); en `iniciarSync()` (rol caja) también `espejo.iniciar()`; en `cerrarTodo` `espejo.detener()`. `cajaId` = el de la caja vinculada (ya lo tiene el backend/`nube.json`; si no, derivar del correo del dispositivo).
- [ ] `pnpm test:escritorio` en verde. Commit.

---

### Task 5: POS — aviso en tarjeta cancelada + docs + verificación

- [ ] `pantalla-pedidos-apps.tsx`: mostrar `p.ultimoError` también cuando `estado` es `CANCELADO` o `EXPIRADO` (hoy solo en `ERROR`). vitest/tsc.
- [ ] Docs: ADR 0011 (nota "el ticket se crea donde está la cocina"), `docs/operacion/delivery-uber-sandbox.md` sección "Escritorio", `desktop/RUNBOOK.md` (agente `· [espejo]`), roadmap.
- [ ] Verificación con el backend embebido: arrancar `npm run backend`, correr un tick del agente contra la nube de desarrollo o, sin Docker, contra producción con la caja de desarrollo `…cc` **solo si existe en producción**; si no, verificación por pruebas unitarias y dejar la prueba real para cuando Uber asigne tiendas (se anota).
- [ ] `pnpm test`, `pnpm test:functions`, `pnpm test:escritorio`, `pnpm test:sitio`. Commit. `finishing-a-development-branch`.
- [ ] Despliegue tras fusión: `supabase db push` (0096), `supabase functions deploy delivery-webhook-uber delivery-accion delivery-espejo sync-push --use-api`, `git push`, y **nuevo instalador** (0.4.55) porque el agente y el gateway viven en el escritorio.

## Self-review

- Cobertura del spec: modelo (T1), webhook (T2), acciones/espejo/push (T3), escritorio (T4), POS+docs+deploy (T5). Sonido y cancelación automática fuera por decisión.
- Tipos: `gestion` texto en SQL y en el planificador; `aceptar` devuelve `{ ok, gestion }`; `delivery-espejo` devuelve `{ ahora, conexiones, pedidos }` que consume el agente.
