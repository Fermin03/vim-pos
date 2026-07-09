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
npm start                   # la app de escritorio: sirve pos-ui/ offline + backend local
#   npm run backend                                # solo el backend (apuntar un POS dev a :54350)
#   VIM_POS_URL=http://localhost:3000 npm start    # cargar un POS dev en vez del pos-ui/ empaquetado
```

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
npm run dist                                        # → dist/VIM POS Setup <ver>.exe
```

**✅ VALIDADO en vivo:** `dist/win-unpacked/VIM POS.exe` arranca Postgres embebido + PostgREST +
gateway + UI y autentica (device sign-in), corriendo desde el build. Config: `asar:false` (para que
los binarios nativos ejecuten), recursos en `resources/` (migraciones, seed, sql, postgrest.exe,
`pg-bin/`, `pos-ui/`), datos escribibles en `dataRoot`. `runtime.mjs` resuelve rutas por `app.isPackaged`.

**Gotchas resueltos al empaquetar (para no repetirlos):**
1. **asar** rompía el spawn/chmod de los binarios nativos de Postgres → `"asar": false`.
2. **Perfil con junction / carpeta redirigida** (el `%APPDATA%` de esta PC) rompe los renames de
   Postgres en `initdb` (*"Improper link"*) → **`VIM_DATA_DIR`** reubica los datos a un volumen sano
   (p. ej. `D:`). En una PC normal `userData` funciona; con junction/redirect, setear `VIM_DATA_DIR`.
3. **`localhost` → IPv6 (::1)** en el Electron empaquetado, pero PostgREST escucha `0.0.0.0` (IPv4) →
   usar **`127.0.0.1`** (ya aplicado en runtime + gateway).
4. **Caches de electron-builder en `D:`** (`ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE`) por el junction
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
- **Un KDS en otra máquina:** carga el POS apuntando `window.__VIM_SUPABASE_URL` al hub
  (`http://<ip-caja>:54350`) y entra a Cocina. Pendiente de Fase 2: descubrimiento automático del
  hub (mDNS) y servir el UI del KDS por la LAN; hoy se configura la IP a mano.

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
