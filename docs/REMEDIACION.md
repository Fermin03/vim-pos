# 🛠️ Guía de remediación — VIM POS a 100%

> Plan de trabajo para cerrar los riesgos detectados en la revisión (31-jul-2026) y dejar el
> piloto de Knock-Out **endurecido y verificable**. Método acordado: **guía primero, ejecutar por
> fases** con visto bueno de Fermín en cada bloque. Decisiones base:
> - **Sync:** el escritorio (Postgres local) es el **único** camino de operación → se congela el outbox web.
> - **Alcance:** los 6 riesgos + verificar las brechas del piloto (ya construidas, ver §Contexto).
> - **Infra:** hay acceso al dashboard de Supabase y a la PC de la caja en esta sesión.

## Contexto — qué encontró la revisión (reencuadre de alcance)

El [ANALISIS-BRECHAS.md](ANALISIS-BRECHAS.md) (7-jun) está **desactualizado**. Verificado el 31-jul,
las tres "brechas del piloto" ya **están construidas y funcionales**, no son stubs:

| Brecha (según doc viejo) | Estado real (31-jul) | Evidencia |
|---|---|---|
| Dashboard admin | ✅ Construido (KPIs + onboarding) | `apps/admin/app/(panel)/dashboard/page.tsx` (170 líneas) |
| Inventario UI | ✅ Construido (CRUD + movimientos) | `apps/admin/app/(panel)/inventario/page.tsx` (319 líneas) |
| Round-trip cargar-ticket→carrito | ✅ Construido | `apps/pos/app/lib/cuenta-mesa.ts:20` `reconstruirCarrito` |

**Consecuencia:** el trabajo real de esta guía es **endurecer + verificar**, no construir features.
Las brechas del piloto pasan a una fase de *verificación end-to-end* (Fase 7), no de desarrollo.

---

## Resumen de fases

| Fase | Título | Riesgo que cierra | Requiere |
|---|---|---|---|
| 0 | Línea base verificable | — (mide el punto de partida) | stack local |
| 1 | Seguridad de secretos | Secretos de producción en texto plano | Dashboard Supabase |
| 2 | Concurrencia de pago | Doble cobro en `aplicar_pago` | migración + test |
| 3 | Unificar sync (desktop único) | Dos motores de sync divergentes | código POS + docs |
| 4 | Endurecer el escritorio | `contextIsolation:false`, backup solo físico | código desktop |
| 5 | Arranque de la caja | Backend no levanta en la PC del piloto | PC de la caja |
| 6 | Red de seguridad (CI + tests) | Huecos de CI, RLS test parcial | CI + SQL |
| 7 | Verificar brechas del piloto | Features construidas sin verificación e2e | smoke manual |
| 8 | Checklist de go-live | Prerrequisitos no-código | Fermín (infra externa) |

Orden recomendado de ejecución: **1 → 2 → 5 → 3 → 4 → 6 → 7 → 8** (seguridad y el bloqueador
del piloto primero; 0 se corre una vez al inicio como referencia).

---

## Estado de ejecución (rama `remediacion`)

| Fase | Estado | Nota |
|---|---|---|
| 0 · Línea base | ✅ Hecho | typecheck apps ✓, 63/63 tests ✓. Se corrigieron 4 errores TS preexistentes en tests de admin. Lint NO está montado (ninguna app tiene ESLint). |
| 1 · Secretos | ⏳ **Del usuario** | Rotar `service_role` + JWT secret en el dashboard; mover a env de Vercel/Supabase. No es código. |
| 2 · `FOR UPDATE` | ✅ Hecho | Mig. `0060`: aplicar_pago + cerrar_ticket_si_pagado + cambiar_forma_pago/reabrir. Test de concurrencia real (`npm run verify:concurrencia`) pasa. `crear_devolucion` diferido (ver abajo). |
| 3 · Unificar sync | ✅ Hecho | Cobro offline web congelado (@deprecated), regla #5 de CLAUDE.md reescrita. Cache de lectura conservado. |
| 4 · Endurecer Electron | 🟡 Parcial | 4.1 `contextIsolation:true` hecho (**pendiente confirmar en la ventana real de la caja**). 4.2 backup lógico **diferido** (el pg embebido no trae `pg_dump`). 4.3 diferido. |
| 5 · Arranque de la caja | ✅ **RESUELTO** | Ver reencuadre abajo — la causa NO era ninguna de las hipótesis originales. |
| 6 · CI + RLS | ✅ Hecho | Test RLS exhaustivo (`0002_rls_cobertura.test.sql`, recorre las 81 tablas con tenant_id). CI corre pos+admin. ESLint, typecheck de packages y CI del desktop: pendientes documentados. |
| 7 · Verificar brechas | ⏳ Para la caja viva | Dashboard/inventario/round-trip están construidos; el smoke e2e conviene hacerlo sobre la caja del piloto, que ya corre con datos reales. |
| 8 · Go-live | ⏳ **Del usuario** | Checklist abajo, con lo ya resuelto tachado. |

---

## Fase 0 — Línea base verificable

**Objetivo:** saber exactamente qué está verde/rojo HOY, para no confundir un problema preexistente
con uno que introduzcamos.

**Pasos**
1. `pnpm install --frozen-lockfile`
2. `supabase start` + `supabase db reset` (aplica las 59 migraciones + seed).
3. Correr y **anotar el resultado** de: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`,
   `supabase test db`.
4. En `desktop/`: `npm install` y `npm run verify` (E2E headless del backend local).

**Verificación / criterio de hecho:** tenemos un reporte de estado inicial (qué pasa, qué falla) escrito
en el PR de arranque. Nada se "arregla" en esta fase.

---

## Fase 1 — Seguridad de secretos (CRÍTICA, primero)

**Objetivo:** los secretos reales dejan de vivir en texto plano junto al código y se rotan (fueron
expuestos: quedaron visibles en la sesión de revisión).

**Contexto:** [.env.local](../.env.local) contiene `SUPABASE_SERVICE_ROLE_KEY` (ignora TODO el RLS) y
`SUPABASE_JWT_SECRET` (permite forjar un token de cualquier tenant). Está gitignored (correcto), pero
ambos deben rotarse y salir del disco local para operación.

**Pasos**
1. **Rotar** en el dashboard de Supabase: Project Settings → API → *reveal/rotate* del `service_role`
   (secret key `sb_secret_…`) y del **JWT secret**. ⚠️ Rotar el JWT secret **invalida todas las
   sesiones activas** — hacerlo en ventana de bajo tráfico.
2. Actualizar los env **donde de verdad viven en producción**: variables de entorno de Vercel (apps) y
   los `secrets` de las Edge Functions (`supabase secrets set`), **no** un archivo en el repo.
3. Dejar `.env.local` solo con lo necesario para dev, con valores de **proyecto de desarrollo** (no
   producción). Confirmar que sigue en `.gitignore`.
4. Redeploy de apps y `supabase functions deploy` para que tomen el secreto nuevo.
5. Verificar que ninguna otra copia del secreto viejo quedó (buscar en `desktop/`, scripts, notas).

**Verificación:** login en apps + una venta de prueba funcionan con el secreto nuevo; un token firmado
con el secreto viejo es **rechazado**. Las Edge Functions (`pin-login`, `sync-push`) responden.

**Criterio de hecho:** secretos rotados, fuera del repo, apps y functions operando con los nuevos.

---

## Fase 2 — Concurrencia en `aplicar_pago` (dinero)

**Objetivo:** eliminar la ventana de **doble cobro** cuando dos pagos concurren sobre el mismo ticket.

**Contexto:** [aplicar_pago](../supabase/migrations/0008_operacion_venta.sql:1841) hace
`SELECT * INTO v_ticket FROM tickets WHERE id = …` **sin `FOR UPDATE`**. Dos llamadas concurrentes
(multi-caja, liquidación de delivery, reabrir cuenta) leen el mismo `monto_pagado_mxn` viejo, ambas
pasan el guard de sobrepago y cobran de más.

**Pasos**
1. Nueva migración **aditiva** `0060_fix_aplicar_pago_lock.sql`: `CREATE OR REPLACE FUNCTION aplicar_pago`
   idéntica pero con `SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id **FOR UPDATE**;`
   (bloqueo de fila; serializa los pagos al mismo ticket).
2. Auditar el **mismo patrón** en funciones hermanas que leen-modifican totales del ticket:
   `crear_devolucion`, `cambiar_forma_pago`/`reabrir` (mig. 0058), `cerrar_ticket_si_pagado`. Añadir
   `FOR UPDATE` donde apliquen.
3. `pnpm --filter @vim/db gen-types` (por si cambia alguna firma; aquí no debería).

**Verificación:** test SQL nuevo `supabase/tests/0002_aplicar_pago_concurrencia.test.sql` que simula dos
pagos al mismo ticket y afirma que el segundo o espera o falla el guard (no cobra doble). Corre en `supabase test db`.

**Criterio de hecho:** imposible que la suma de pagos exceda el total bajo concurrencia; test en verde en CI.

---

## Fase 3 — Unificar el sync (escritorio = único camino)

**Objetivo:** un solo motor de verdad para el sync. Congelar el outbox web (op-log) que quedó
redundante ahora que la caja siempre corre el escritorio con Postgres local.

**Contexto:** hay dos modelos: (a) web outbox → `sync_procesar_push` (servidor re-deriva con triggers);
(b) escritorio snapshot replica verbatim con triggers OFF ([0056](../supabase/migrations/0056_sync_push_snapshot.sql)).
En el escritorio, `useConexion` apunta al gateway local → la rama offline del navegador casi nunca
se dispara. Se congela, no se opera desde navegador puro.

**Pasos**
1. En [home-pos.tsx](../apps/pos/app/components/home-pos.tsx): eliminar la rama `if (!online) → cobrarOffline(...)`
   y el uso de `ModalCobroOffline`. El POS online (escritorio contra gateway local, o web contra nube)
   usa siempre `persistirTicket` + `aplicarPago`.
2. Marcar como **DEPRECATED** (no borrar aún; congelar 1 release) con encabezado claro:
   `apps/pos/app/lib/cobro-offline.ts`, `apps/pos/app/lib/outbox.ts`, `apps/pos/app/lib/sync.ts`,
   `apps/pos/app/components/modal-cobro-offline.tsx`. Alternativa si prefieres limpieza total: borrarlos
   y sus tests. **Recomendación:** congelar con nota + issue de borrado en el siguiente release.
3. Conservar la **cache de lectura offline** (`cachePut`/`cacheGet` del catálogo en `outbox.ts`) si el
   POS web la usa para recargar el menú sin red — separar esa parte del outbox de escritura.
4. **Reconciliar la documentación:** la regla #5 de [CLAUDE.md](../CLAUDE.md) ("el POS no habla directo a
   Supabase; pasa por Dexie y sincroniza por batch") ya **no** describe la arquitectura. Reescribirla:
   *el POS escribe directo (RPC bajo RLS); el offline-first lo da el escritorio con Postgres local +
   sync snapshot (docs 0055/0056)*. Anotar el cambio con justificación (la regla del doc manda).

**Verificación:** build del POS verde; una venta en el escritorio persiste en el Postgres local y sube por
`sync-push` intacta (folio/total/PAGADO) — `npm run verify:push` sigue verde. `pnpm --filter @vim/pos test`
verde tras quitar/congelar los tests del outbox.

**Criterio de hecho:** un solo camino de escritura; sin código muerto activo; docs alineados al código.

---

## Fase 4 — Endurecer el escritorio (Electron)

**Objetivo:** cerrar el anti-patrón de seguridad de Electron y sumar backup portable.

### 4.1 `contextIsolation: true`
**Contexto:** [main.mjs:168](../desktop/src/main.mjs) usa `contextIsolation:false`. El preload
([preload.cjs](../desktop/src/preload.cjs)) setea `window.__VIM_SUPABASE_URL` directo, lo que exige
isolation off.

**Pasos**
1. Reescribir `preload.cjs` con `contextBridge.exposeInMainWorld("__VIM_SUPABASE_URL", urlArg)` (y los
   otros dos globals) — así el valor sigue visible como `window.__VIM_SUPABASE_URL` en el mundo aislado,
   sin cambiar el POS ([supabase.ts](../apps/pos/app/lib/supabase.ts) lo lee igual).
2. En `main.mjs`: `contextIsolation: true`. Confirmar que la inyección por HTML del `ui-server`
   (script inline, corre en contexto de página) sigue funcionando en el modo LAN.
3. Revisar que nada más dependa de node en el renderer (ya está `nodeIntegration:false`).

**Verificación:** `npm run verify` + arrancar el `.exe`/`win-unpacked` y hacer device sign-in + una venta.

### 4.2 Backup lógico portable (además del físico en frío)
**Contexto:** hoy el respaldo copia `pgdata` en frío (consistente pero no portable ni point-in-time). El
bin embebido no trae `pg_dump`.

**Pasos**
1. Incluir `pg_dump`/`pg_restore` del mismo Postgres embebido en `pg-bin/` (o client tools) en
   `extraResources`.
2. Añadir a `backup.mjs` un **dump lógico** (`pg_dump -Fc`) junto al físico, rotando 7. Documentar `restore` lógico.

**Verificación:** `npm run backup` genera físico **y** lógico; `npm run restore` de ambos deja la BD íntegra
(`npm run verify:robustez3` extendido).

### 4.3 Diferidos (documentar, no ejecutar ahora)
- **Firma del instalador** (cert EV) + auto-update silencioso — requiere certificado (~$200–400/año). Pasos ya en `desktop/RUNBOOK.md`.
- **JWT secret por dispositivo** — hardening de Fase 3 del plan; documentar el diseño.

**Criterio de hecho:** Electron con isolation activado y venta funcionando; backup lógico restaurable; diferidos documentados con su gatillo.

---

## Fase 5 — Desbloquear el arranque de la caja (BLOQUEADOR del piloto)

**Objetivo:** que el backend embebido (Postgres + PostgREST + gateway) levante de forma **confiable** en
la PC real de la caja. Es el riesgo #1 de go-live y **no es de código**.

> ✅ **RESUELTO (post-revisión).** La causa NO fue ninguna de las hipótesis originales (EFS/junction,
> Norton, `localhost→::1`): Norton ni siquiera está en la caja, lo de EFS era de la PC de desarrollo,
> y el `127.0.0.1` ya estaba en el código. La causa real, encontrada reproduciéndola:
> 1. **Instalación en `Program Files`** → el pg embebido no puede ajustar permisos de sus binarios
>    (`EPERM chmod postgres.exe`) y la app moría muda. Fix: el instalador ya no permite elegir carpeta
>    (siempre por usuario) + log a archivo + aviso en pantalla con el motivo.
> 2. **Procesos `postgres.exe` huérfanos** de un cierre no limpio (corte de luz, force-kill) ocupaban
>    el puerto → PostgREST no conectaba → "PostgREST no respondió". Fix: limpieza reforzada (se borra
>    siempre el `postmaster.pid` y se libera el puerto por `netstat`). La caja se recupera sola.
> 3. Un `unhandledRejection` benigno del hook de apagado de embedded-postgres que yo mismo hice fatal
>    al endurecer; corregido (solo los errores de permisos abortan el arranque).
>
> Publicado en 0.3.4 → 0.3.6. **La caja del piloto ya arranca con datos reales.** El playbook de abajo
> queda como referencia histórica de diagnóstico.

**Contexto (histórico):** en la PC de la caja el backend no respondía al iniciar. Pistas que se
barajaron y resultaron falsas: perfil con junction/EFS, Norton, `localhost→::1`.

**Playbook de diagnóstico (en la PC de la caja, pegar salidas)**
1. Arrancar con log verboso y revisar **`desktop/bin/postgrest.log`**: ¿se corta en `listening` sin
   `Successfully connected`? → problema `localhost/::1` (usar `127.0.0.1` en db-uri/readiness/proxy — ver
   gotcha #3 del RUNBOOK).
2. `GET http://127.0.0.1:54350/health/deep` → ¿toca Postgres y PostgREST?
3. ¿El perfil (`%APPDATA%`) es junction o está en carpeta cifrada (EFS)? Si sí → setear
   **`VIM_DATA_DIR=D:\vim-pos-datos`** (volumen sano) y reintentar `initdb`.
4. `matarHuerfanos`: ¿quedó un `postgrest.exe`/`postgres.exe` huérfano ocupando el puerto? (revisar pidfile).
5. Norton/AV: ¿está bloqueando el spawn de los binarios nativos o `SSLKEYLOGFILE` rompe algo? Excluir la
   carpeta de datos y el `.exe` del análisis en tiempo real.

**Verificación:** el `.exe` instalado arranca en frío 3 veces seguidas (reinicio de PC incluido), `health/deep`
verde, device sign-in + venta + Reporte Z (`npm run verify:dia` contra el gateway local de esa PC).

**Criterio de hecho:** la caja levanta sola y confiable en el hardware del piloto; causa raíz documentada
en `RUNBOOK.md`.

---

## Fase 6 — Red de seguridad: CI + tests

**Objetivo:** que el CI atrape las regresiones que hoy deja pasar, y que el test de RLS sea exhaustivo.

**Contexto (huecos en [ci.yml](../.github/workflows/ci.yml)):** `typecheck` solo en `apps/*` (no
`packages/db`); `lint` no corre; `vitest` solo `@vim/pos` (no los tests de admin); `pnpm audit` termina en
`|| true`; el desktop no tiene CI. Y el test de RLS cubre **2 tablas de 89**.

**Pasos**
1. **CI apps/packages:** añadir `pnpm -r lint`, extender typecheck a packages, correr `pnpm -r test`
   (incluye los 4 tests de admin), subir `--audit-level` a `high` y **hacer que bloquee** (quitar `|| true`)
   cuando vitest se actualice.
2. **CI desktop:** job nuevo que corra `npm run verify` (E2E headless del backend local) en cada PR.
3. **Test RLS exhaustivo:** `supabase/tests/0003_rls_cobertura.test.sql` que **itere todas las tablas con
   `tenant_id`** desde `information_schema` y afirme, por cada una: RLS habilitado **y** ≥1 política. Atrapa
   el olvido de RLS en una tabla nueva (lo que el test de 2 tablas no hace).
4. **Test de concurrencia** (Fase 2) y, si cabe, un **E2E de la ruta crítica** (login→venta→cobro→cierre)
   ejecutable en CI o como smoke del desktop.

**Verificación:** el CI falla a propósito si (a) se rompe RLS en cualquier tabla, (b) hay error de tipos en
packages, (c) un test de admin rompe. Todos los jobs verdes en un PR limpio.

**Criterio de hecho:** CI cubre lint + typecheck total + todos los tests + audit bloqueante + desktop + RLS exhaustivo.

---

## Fase 7 — Verificar las brechas del piloto (ya construidas)

**Objetivo:** confirmar que dashboard, inventario y round-trip funcionan **end-to-end** (no solo que el
código existe), y actualizar el doc de brechas al estado real.

**Pasos**
1. **Dashboard admin:** cargar con datos sembrados; KPIs cuadran contra los reportes; onboarding refleja el estado.
2. **Inventario UI:** crear insumo → registrar movimiento → ver saldo; probar la **reversa por receta** en
   cancelación/devolución (#29, mig. 0057).
3. **Round-trip:** abrir cuenta en mesa → agregar ítems → cerrar pantalla → **retomar** la cuenta y ver el
   carrito reconstruido (con modificadores; cancelados omitidos; producto fuera de catálogo omitido).
4. Actualizar [ANALISIS-BRECHAS.md](ANALISIS-BRECHAS.md) al estado 31-jul (marcar estas 3 como hechas).

**Verificación:** las 3 rutas pasan un smoke manual documentado; cualquier bug encontrado se corrige aquí.

**Criterio de hecho:** las tres features verificadas en vivo; doc de brechas al día.

---

## Fase 8 — Checklist de go-live (no-código)

**Objetivo:** listar y destrabar lo que no es código y bloquea el arranque real de Knock-Out.

**Prerrequisitos** (de [ANALISIS-BRECHAS.md](ANALISIS-BRECHAS.md) §Go-live; ~~tachado~~ = ya resuelto):
- Supabase Pro (despausar el proyecto free) · Vercel · ~~repo privado~~ (hoy público; decidido así) · **rotar secretos (Fase 1)**.
- **Facturama/Facturapi** + **CSD del SAT** de Knock-Out (bloquean CFDI real).
- ~~Impresora Epson TM-m30III~~ → **la caja usa una genérica ESC/POS de red (puerto 9100)**, ya soportada (0.3.2). Falta prueba física + confirmar que caja e impresora están en la misma subred. · red local estable · ~~menú real capturado~~ (ya cargado y operando).
- Cloudflare R2 (backups offsite) · Sentry · **aviso de privacidad + contrato responsable/encargado (LFPDPPP)**.

**Criterio de hecho:** checklist con responsable y estado por ítem; los bloqueantes de CFDI y hardware
identificados con fecha objetivo.

---

## Cómo ejecutaremos (recordatorio de método)

Cada fase es un **bloque con tu visto bueno**: te presento el diff/plan de la fase, lo apruebas, ejecuto,
verifico con el criterio de hecho, y paso a la siguiente. Trabajo en rama (no en `main`) y no hago push ni
merge sin que lo pidas. Las migraciones son **aditivas** (nunca se edita una ya aplicada).
