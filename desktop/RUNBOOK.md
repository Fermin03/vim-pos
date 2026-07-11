# VIM POS Escritorio (local-first) — Fase 1

POS que corre **100% offline** en la PC del restaurante. La caja nunca deja de cobrar aunque
se caiga internet. La nube pasa a ser sync/respaldo (Fase 2+).

## Arquitectura

```
Electron (main.mjs)
 ├─ startBackend()  ──────────────────────────────────────────────
 │   ├─ Postgres 17 EMBEBIDO (sin Docker)  ← tus 53 migraciones + plpgsql
 │   ├─ PostgREST (sidecar, libpq del PG embebido)
 │   └─ Gateway Supabase-compat (localhost:54350)
 │        /auth/v1/*        → auth local (device sign-in, refresh)   [reemplaza GoTrue]
 │        /functions/v1/pin-login → pin-login local                  [reemplaza Edge]
 │        /rest/v1/*        → PostgREST                              [datos + RPC + RLS]
 └─ BrowserWindow  →  POS Next.js  (preload inyecta window.__VIM_SUPABASE_URL = gateway local)
```

El POS **no se modificó** salvo una línea: `apps/pos/app/lib/supabase.ts` resuelve la URL de
`window.__VIM_SUPABASE_URL` (inyectada por el preload) con fallback al env. Mismo build, dos
destinos: navegador→nube, Electron→local.

## Correr

```bash
cd desktop
npm install                 # baja Postgres embebido + Electron; postgrest.exe/libpq ya vienen
npm run verify              # E2E headless: device→empleados(RLS)→pin-login→venta(RPC)→PAGADO
npm run build:ui            # exporta el POS estático → desktop/pos-ui/ (UI 100% offline)
npm run build:kds-ui        # exporta la COCINA (apps/kds) → desktop/kds-ui/
npm start                   # rol CAJA: sirve pos-ui/ offline + backend local (hace de hub)
npm run start:cocina        # rol COCINA: cliente delgado del hub (pantalla de cocina dedicada)
#   npm run backend                                # solo el backend (apuntar un POS dev a :54350)
#   VIM_POS_URL=http://localhost:3000 npm start    # cargar un POS dev en vez del pos-ui/ empaquetado
#   VIM_HUB_URL=http://<ip-caja>:54350 npm run start:cocina   # cocina apuntando a un hub sin setup
```

## Dos roles, un ejecutable (caja / cocina)

El mismo `.exe` arranca en dos roles (el instalador crea un acceso directo por cada uno):

- **CAJA** (por defecto): el POS local-first con backend embebido; hace de **hub** en la LAN.
- **COCINA** (`--role=cocina`): la **pantalla de cocina dedicada** (`apps/kds`), **cliente delgado**
  del hub — SIN Postgres/sync local. Sirve `kds-ui/` apuntándolo al gateway de la caja por LAN.
  La primera vez muestra un **setup** para teclear la IP de la caja (se guarda en
  `userData/kds-hub.json`); luego arranca directo en Cocina con la sesión de DISPOSITIVO (sin PIN).

Código compartido en **`packages/kds-core`** (PantallaKds, vincular, cliente de dispositivo,
comandas): lo consumen el POS (botón Cocina) y `apps/kds` → sin duplicación. La cocina lee y avanza
comandas con el token del DISPOSITIVO (RLS por tenant, no por identidad) y recibe el tiempo real por
SSE del hub (`__VIM_DESKTOP`). Instancia única solo para la caja; la cocina no toma el lock, así una
caja y una cocina pueden convivir en la misma PC.

El UI se sirve en `localhost:54360` (offline) y el gateway de datos en `localhost:54350`; si no
existe `pos-ui/` (no corriste `build:ui`), cae a `VIM_POS_URL` o al dominio desplegado.

Fixtures de dev (seed): dispositivo `caja-99999999-…cc@dispositivos.vimpos.mx` / `vim-device-dev`;
cajera **María G. PIN 1234**; dueño `dueno@knockout.dev` / `devadmin`.

## Empaquetar (probado)

```bash
npm run build:ui                                   # exporta el POS a pos-ui/
ELECTRON_CACHE=D:/electron-cache ELECTRON_BUILDER_CACHE=D:/electron-builder-cache \
  npx electron-builder --win dir                   # → dist/win-unpacked/VIM POS.exe (app corrible)
# instalador NSIS (requiere Modo Desarrollador o admin en Windows, ver abajo):
npm run dist                                        # build:ui + build:kds-ui + NSIS → dist/VIM POS Setup <ver>.exe
```

**Un instalador, dos accesos directos.** `build/installer.nsh` crea, además del acceso directo
"VIM POS" (rol caja), un segundo **"VIM POS Cocina"** que abre el mismo `.exe` con `--role=cocina`.
`kds-ui/` va en `extraResources`. Así la misma instalación sirve la caja y la pantalla de cocina.

## Fase 3 — Endurecer

**Bandeja (systray) — la caja no se apaga por accidente.** En rol caja, cerrar la ventana la **oculta
a la bandeja** (no apaga el backend). Solo "Salir (apaga la caja)" desde el menú de la bandeja, o
apagar la PC, la cierran de verdad. El menú de la bandeja muestra **la IP de la caja** (para teclear
en la cocina) con "Copiar IP", "Abrir caja", "Respaldar ahora" y "Salir". Resuelve el incidente de
que cerrar la ventana tumbaba todo el servidor del local.

**Watchdog — auto-recuperación.** `watchdog.mjs` hace ping a `GET /health/deep` (que toca Postgres
*y* PostgREST, no un ok estático) cada 20s; si falla 3 veces seguidas, reinicia el backend solo.
Verificado (`npm run verify:robustez3`): matando `postgrest.exe`, el backend revive en ~12s.

**Respaldo local del pgdata.** El bin de Postgres embebido no trae `pg_dump`, así que el respaldo es
**físico en frío**: se copia el `pgdata` con Postgres detenido → copia 100% consistente. Se dispara:
- **al cerrar la caja** ("Salir" / apagar la PC) — automático, sin costo (ya está cerrando);
- **bajo demanda** — "Respaldar ahora" en la bandeja (pausa el watchdog, detiene el backend, copia,
  lo vuelve a levantar; breve interrupción, pensado para el fin de turno).

Los respaldos van a `<dataRoot>/backups/pgdata-<fecha>_<hora>/`, rotando los **últimos 7**. La nube
(sync PUSH) sigue siendo el respaldo offsite de las ventas; esto protege el estado completo local.

```bash
# Con la caja CERRADA (respeta VIM_DATA_DIR si reubicaste los datos):
npm run backup                 # respaldo manual en frío
npm run restore                # restaura el MÁS RECIENTE
npm run restore -- pgdata-2026-07-11_14-30-05   # restaura uno específico
npm run verify:robustez3       # prueba headless: respaldo restaurable + watchdog
```
`restore` mueve el `pgdata` actual a `pgdata.pre-restauracion-<fecha>` por si acaso.

### Actualizaciones in-app (Opción B — sin firma) ✅

La app **avisa** cuando hay versión nueva y ofrece **descargar + verificar (SHA-512) + instalar** —
sin necesitar certificado de firma. La integridad está garantizada por el hash aunque no haya firma;
los datos (`pgdata` en `userData`/`VIM_DATA_DIR`) se conservan al actualizar, y las **migraciones de
BD nuevas se aplican solas** al arrancar. Al arrancar (caja y cocina) revisa el feed; si hay update:
notificación + (en la caja) ítem en la bandeja "⬇ Actualización vX — instalar". Verificado headless
(`npm run verify:updater`): detección de versión + descarga con SHA-512 + rechazo de descarga corrupta.

**Publicar una versión nueva:**
1. Sube la versión en `desktop/package.json` (p. ej. `0.1.0` → `0.2.0`).
2. `npm run dist` → `dist/VIM POS Setup 0.2.0.exe`.
3. `npm run release-manifest -- "Qué cambió en esta versión"` → genera `dist/latest.json`
   (calcula el SHA-512 y arma la URL del bucket).
4. Sube **AMBOS** al bucket **público** `actualizaciones` de Supabase Storage (crea el bucket una
   vez, marcado *Public*): `VIM POS Setup 0.2.0.exe` y `latest.json` (reemplazando el anterior).

Las cajas/cocinas detectan la nueva versión en su próximo arranque. Feed por defecto:
`https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones/latest.json`
(override con `VIM_UPDATE_FEED`; base del `.exe` con `VIM_UPDATE_BASE` en release-manifest).

> Sin firma, al instalar la actualización Windows puede mostrar SmartScreen/UAC una vez ("Ejecutar
> de todos modos") — molesto, no bloqueante. Con firma EV desaparece (ver abajo).

### 🔜 Firma del instalador + auto-update SILENCIOSO (DIFERIDOS — requieren certificado)

Hoy el instalador **no está firmado** → Windows muestra "editor desconocido" (se sortea con *Más
información → Ejecutar de todos modos*). Para activarlo cuando tengas un **certificado de firma de
código** (.pfx; ~$200–400/año, o EV en token):

1. **Firma:** en `package.json` → `build.win`, quita `"signAndEditExecutable": false` y exporta
   `CSC_LINK=file:///D:/ruta/cert.pfx` + `CSC_KEY_PASSWORD=…` antes de `npm run dist`. electron-builder
   firma solo. (Con EV en token, se usa el flujo de firma del proveedor.)
2. **Auto-update:** instala `electron-updater`, agrega en `build` un `publish` (p. ej. GitHub Releases
   o un bucket S3/Spaces), y en `main.mjs` llama `autoUpdater.checkForUpdatesAndNotify()` al arrancar
   (gated a `app.isPackaged`). El `dist` genera `latest.yml` que el updater consulta. **La firma (#1)
   es prácticamente requisito** — sin firma, Windows/SmartScreen bloquea el auto-update.

**✅ VALIDADO en vivo:** `dist/win-unpacked/VIM POS.exe` arranca Postgres embebido + PostgREST +
gateway + UI y autentica (device sign-in), corriendo desde el build. Config: `asar:false` (para que
los binarios nativos ejecuten), recursos en `resources/` (migraciones, seed, sql, postgrest.exe,
`pg-bin/`, `pos-ui/`), datos escribibles en `dataRoot`. `runtime.mjs` resuelve rutas por `app.isPackaged`.

**Gotchas resueltos al empaquetar (para no repetirlos):**
1. **asar** rompía el spawn/chmod de los binarios nativos de Postgres → `"asar": false`.
2. **Perfil con junction / carpeta redirigida** (el `%APPDATA%` de esta PC) rompe los renames de
   Postgres en `initdb` (*"Improper link"*) → **`VIM_DATA_DIR`** reubica los datos a un volumen sano
   (p. ej. `D:`). En una PC normal `userData` funciona; con junction/redirect, setear `VIM_DATA_DIR`.
3. **`localhost` → IPv6 (::1)** bajo Electron, pero PostgREST escucha `0.0.0.0` (IPv4) → usar
   **`127.0.0.1`** en TODO: readiness, proxy del gateway, **y el `db-uri` postgrest→postgres**. Este
   último fue sutil: bajo Electron el hijo postgrest resolvía `localhost`→`::1` y NO alcanzaba
   Postgres (se colgaba mudo tras "listening", readiness expiraba a 60s); bajo `node` sí conectaba.
   Con IP literal libpq conecta directo. Si el hub no arranca, revisa `bin/postgrest.log`: si se
   corta en "listening" sin "Successfully connected", es esto.
4. **Boot fallido dejaba postgrest huérfano** ocupando `restPort` → los reintentos fallaban en
   cascada. Ahora el PID se registra en el pidfile ANTES del readiness y se mata el postgrest si
   expira, para que `matarHuerfanos` del próximo arranque lo limpie.
5. **Caches de electron-builder en `D:`** (`ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE`) por el junction
   del perfil C: (rename cross-disk falla).

**✅ Instalador construido:** `dist/VIM POS Setup <ver>.exe` (NSIS, ~138 MB). El fix del bloqueo de
`winCodeSign` (symlinks que Windows bloquea sin Modo Desarrollador) fue **`win.signAndEditExecutable:
false`** — no firmamos el ejecutable, así electron-builder no baja winCodeSign. Correr con los caches
en D: (`ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE`) por el junction del perfil.

**Datos en la máquina de Fermín:** la app *instalada* usa `userData` (`%APPDATA%`) por defecto; en
esta PC (perfil con junction) eso rompe `initdb` → lanzar con **`VIM_DATA_DIR=D:\ruta`** (o setear esa
env de sistema). En una **PC normal del piloto** `userData` funciona sin tocar nada.

## Hub del local — KDS en tiempo real por LAN (Fase 2)

La caja hace de **servidor en la LAN**: el gateway escucha en `0.0.0.0` y al arrancar loguea
`Hub en la LAN: http://<ip>:54350`. Otro equipo (pantalla de cocina, 2ª caja) apunta ahí.

- **Tiempo real:** trigger `pg_notify('vim_kds', …)` al cambiar el estado de cocina de un ticket →
  el backend hace `LISTEN` y reenvía por **SSE** (`GET /kds/stream?sucursal=<id>`). El KDS del POS
  se suscribe (EventSource) y recarga al instante; el polling de 5s queda como respaldo.
- Verificado: `npm run verify:hub` (KDS recibe EN_COCINA/LISTO en vivo + acceso por IP de LAN).
- **UI servido por la LAN (auto-configurable):** el hub sirve el POS en `http://<ip-caja>:54360`;
  el `ui-server` inyecta el endpoint del gateway desde `location` → cualquier navegador de la LAN
  funciona sin teclear URLs. La CSP incluye el host del hub para permitir la conexión.
- **Modo KDS dedicado:** abre **`http://<ip-caja>:54360/?kds`** en la tablet/PC de cocina → entra
  directo a Cocina con la sesión de DISPOSITIVO, **sin PIN de empleado** (una vez vinculado el
  dispositivo). Recibe las órdenes en vivo por SSE.
- **Pendiente Fase 2 (comodidad, no riesgo):** descubrimiento mDNS del hub (hoy IP a mano); refresco
  del token del device para KDS 24/7 (hoy TTL 12h cubre un turno, reinicio diario lo renueva);
  probar 2ª caja en la LAN.

## Conectar a la nube (deploy del sync real) — #3

Requiere: (a) **despausar** el proyecto Supabase (plan FREE se pausa) desde el dashboard;
(b) `SUPABASE_ACCESS_TOKEN` (o `supabase login`) + la DB password. Proyecto ya linkeado (`pbiaxzvmssjsxdwqrumb`).

```bash
cd vim-pos
export SUPABASE_ACCESS_TOKEN=sbp_…          # token del dashboard (transitorio)
supabase db push                             # aplica migraciones 0055 + 0056 a la nube
supabase functions deploy sync-pull sync-push
```

Luego probar el sync real desde el device:
```bash
cd desktop
VIM_CLOUD_URL=https://pbiaxzvmssjsxdwqrumb.supabase.co \
VIM_CLOUD_ANON=<anon key del proyecto> \
VIM_DEVICE_EMAIL=caja-<caja_id>@dispositivos.vimpos.mx \
VIM_DEVICE_PASS=<clave del dispositivo> \
  npm run verify:cloud        # device sign-in en la nube → PULL (referencia↓) + PUSH (ventas↑)
```

Las mismas env, puestas al lanzar la app (`npm start` / el .exe), activan el `syncBestEffort`
al arrancar (pull + push automáticos cuando hay red). Sin ellas, la caja opera 100% offline.

## Estado Fase 1

**✅ Hecho y verificado (headless):**
- Runtime local (PG embebido + migraciones idempotentes + PostgREST).
- Auth local: device sign-in (bcrypt/pgcrypto) + pin-login (verificar_pin_login), mismos claims.
- Gateway compatible con supabase-js.
- El POS apunta al gateway con un cambio de una línea; build del POS verde.
- Shell de Electron que arranca el backend y carga el POS inyectándole el endpoint local.
- **UI 100% offline**: `npm run build:ui` exporta el POS estático a `pos-ui/` y el servidor local
  (`ui-server.mjs`) lo sirve con CSP. Verificado: UI + datos conviven offline (ui:54360 + gateway:54350).
- **Sync PULL** (referencia ↓): `sync-pull.mjs` (motor de upsert idempotente, orden de FKs, modo
  réplica) + RPC `sync_pull_snapshot` (migración 0055) + Edge `sync-pull`. Verificado (`npm run
  verify:sync`): cambio de precio + producto nuevo + **empleado nuevo con PIN entrando al login local**.
- **Sync PUSH** (ventas ↑): `sync-push.mjs` (arma el snapshot de ventas terminales no subidas +
  tracking `_vim_push_ok`) + RPC `sync_push_snapshot` (migración 0056, aplica **verbatim en modo
  réplica** → conserva folio/totales/PAGADO exactos, no re-genera el folio fiscal) + Edge `sync-push`.
  Verificado (`npm run verify:push` + `smoke_sync_push`): folios/estados intactos, idempotente.
- `main.mjs` hace **sync best-effort al arrancar**: PULL luego PUSH (gated por env; no bloquea offline).
- **Día completo por el gateway** (`npm run verify:dia`): login device+PIN → abrir turno → venta →
  `autorizar-pin` (supervisor) → Reporte X → arqueo → autorización propia → Reporte Z → turno CERRADO.
  El gateway emula pin-login Y `autorizar-pin` (autorización de superior), así cancelar/descuento/
  corte con PIN funcionan 100% offline.

  Env para sync con la nube (opcional; sin ellas la caja opera 100% offline con lo que tiene):
  `VIM_CLOUD_URL`, `VIM_CLOUD_ANON`, `VIM_DEVICE_EMAIL`, `VIM_DEVICE_PASS`.

**🔜 Pendiente para cerrar Fase 1 al 100%:**
1. **Impresión Epson nativa** (USB/serial) por IPC del main (hoy el POS ya tiene el adapter de red;
   la impresión genérica por `window.print()` a cualquier impresora/PDF ya funciona).
2. **Instalador firmado + auto-update** y **hardening** (contextIsolation, secreto JWT por
   dispositivo, instancia única que limpie procesos huérfanos) → Fase 3.
3. **Deploy** de las Edge `sync-pull`/`sync-push` a la nube + probar el sync real con tu cloud
   (hoy ambas fuentes RPC 0055/0056 están verificadas localmente y son cloud-safe).
