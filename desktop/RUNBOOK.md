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
npm run backend             # solo el backend local (para apuntar un POS dev a localhost:54350)
npm start                   # la app de escritorio (Electron)
#   VIM_POS_URL=http://localhost:3000 npm start   # cargar un POS dev local en vez del desplegado
```

Fixtures de dev (seed): dispositivo `caja-99999999-…cc@dispositivos.vimpos.mx` / `vim-device-dev`;
cajera **María G. PIN 1234**; dueño `dueno@knockout.dev` / `devadmin`.

## Estado Fase 1

**✅ Hecho y verificado (headless):**
- Runtime local (PG embebido + migraciones idempotentes + PostgREST).
- Auth local: device sign-in (bcrypt/pgcrypto) + pin-login (verificar_pin_login), mismos claims.
- Gateway compatible con supabase-js.
- El POS apunta al gateway con un cambio de una línea; build del POS verde.
- Shell de Electron que arranca el backend y carga el POS inyectándole el endpoint local.

**🔜 Pendiente para cerrar Fase 1 al 100%:**
1. **UI 100% offline**: empaquetar un build local del POS (servidor local o export) en vez de
   cargar `pos.vimpos.com.mx`. Los **datos** ya son locales; falta que el **HTML** también lo sea.
2. **Impresión Epson nativa** (USB/serial) por IPC del main (hoy el POS ya tiene el adapter de red).
3. **Sync bidireccional**: el *push* idempotente ya existe; falta el *pull* de la rebanada del
   tenant (catálogo/config/usuarios) desde la nube al arrancar/reconectar.
4. **Apertura de caja/turno** desde el POS local (hoy el verify lo crea por conexión directa).
5. **Instalador firmado + auto-update** y **hardening** (contextIsolation, secreto JWT por
   dispositivo) → esto último es Fase 3.
