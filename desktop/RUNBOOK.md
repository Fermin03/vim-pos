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
npm install                 # baja Postgres embebido + Electron. postgrest.exe NO viene: es bin/postgrest.exe, gitignoreado (ver "Antes de empaquetar")
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

Fixtures de dev (seed): dispositivo `caja-99999999-…cc@dispositivos.vimpos.com.mx` / `vim-device-dev`;
cajera **María G. PIN 1234**; dueño `dueno@knockout.dev` / `devadmin`.

## Empaquetar (probado)

### Antes de empaquetar — lista obligatoria (léela SIEMPRE antes de `npm run dist`)

> **Por qué existe:** el 6 sep 2026 las versiones 0.4.60, 0.4.61 y 0.4.62 salieron **sin
> `postgrest.exe`**. Se construyeron desde un worktree que no tenía el binario, y electron-builder
> empaqueta igual, sin avisar. Las cajas arrancaban Postgres, hacían `spawn` de un archivo
> inexistente, esperaban 60 s y morían con *"PostgREST no respondió"* — un mensaje que señalaba al
> sitio equivocado. Knock-Out se quedó sin caja, y una caja rota **no se auto-actualiza** (el updater
> corre después del backend, que nunca arranca). Hotfix: 0.4.63.

1. **Estás en un checkout que tiene `desktop/bin/postgrest.exe`.** Debe medir **69,366,272 bytes**
   (sha256 `5a1f928c8aaa3519567a093fce8ae34fb81423e14980785d6968669b3789bbd1`). Está en
   `.gitignore` y **ningún script lo regenera**: un worktree o un clon nuevo NO lo trae. Cópialo
   desde `vim-pos/desktop/bin/` antes de seguir. Es el único `extraResources` en esa situación:
   `pos-ui/` y `kds-ui/` los rehace `npm run dist`, `pg-bin` viene de `npm install`, el resto está en git.
2. **`desktop/node_modules` existe.** `desktop/` NO está en el workspace de pnpm (`apps/*`,
   `packages/*`), así que `pnpm install` en la raíz no lo instala: `npm install` dentro de
   `desktop/` (o un junction al `node_modules` del checkout principal, que tiene las mismas versiones).
3. **Construye desde `vim-pos/`.** Desde otro worktree (`vim-pos-platform/`, uno temporal) solo si
   pasaste 1 y 2 a mano. Y nunca en una ruta bajo `AppData`: EFS rompe electron-builder.
4. **`npm run dist` tiene que terminar con `✔ extraResources completos`.** `scripts/dist.mjs`
   comprueba los recursos antes de empaquetar y otra vez sobre `dist/win-unpacked/resources`; si
   aborta con *"faltan recursos"*, arregla el origen. No se fuerza ni se comenta el chequeo.
   Desde la 0.4.109 también tiene que terminar con `✔ dependencias de la app completas`: revisa que
   `pg`, `jsonwebtoken` y `embedded-postgres` lleguen a `resources/app/node_modules`, y se niega a
   empaquetar si `desktop/node_modules` es un enlace. En un worktree, copia esa carpeta de verdad
   (`robocopy … /E`); un junction da un instalador de 134 MB sin dependencias que no arranca.
5. **Antes de publicar, tres comprobaciones sobre el resultado:**
   - `dist/win-unpacked/resources/bin/postgrest.exe` existe (69,366,272 bytes);
   - `dist/VIM POS Setup <ver>.exe` pesa **~156 MB** (los rotos pesaban 147 MB: esos 9 MB de
     menos son exactamente el binario comprimido) y tiene la **fecha de hoy**;
   - tras subirlo, el `content-length` del asset en GitHub es idéntico al del archivo local.

Si cualquiera falla, **no se publica**. Un instalador incompleto deja al cliente sin caja y sin
forma de recibir el arreglo por el actualizador.

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
en la cocina) con "Copiar IP", "Abrir caja", "Respaldar ahora", la fecha del último respaldo y "Salir". Resuelve el incidente de
que cerrar la ventana tumbaba todo el servidor del local.

**Watchdog — auto-recuperación.** `watchdog.mjs` hace ping a `GET /health/deep` (que toca Postgres
*y* PostgREST, no un ok estático) cada 20s; si falla 3 veces seguidas, reinicia el backend solo.

- **Qué es "sano"** (`sonda-postgrest.mjs`): Postgres contesta `SELECT 1` en 1.5 s, y PostgREST
  contesta a una lectura mínima (`/tenants?select=id&limit=1`) con cualquier estado por debajo de
  500 en 4 s. Como `anon` no puede leer `tenants`, lo normal es un **401** — que ya demuestra que
  PostgREST atiende, tiene el esquema cargado y habla con la base. **Nunca se le pide `/`**: es la
  descripción OpenAPI de todo el esquema y tarda segundos (2.2 s en una laptop buena, más de 4 en
  la PC de Obregón). El readiness del arranque (`runtime.mjs`) sí sigue pidiendo `/`, sin tope.
- **Cada fallo dice por qué** en el log: `salud del backend FALLÓ (2/3): PostgREST contestó 503
  (PGRST002)`, `Postgres no contestó en 1500 ms`, `gateway inalcanzable (ECONNREFUSED)`…
- **Si reiniciar no cura, no insiste.** Tras un reinicio que terminó bien pero la salud sigue
  fallando, el siguiente pide el doble de fallos (3 → 6 → 12… hasta 90, unos 30 min). Al segundo
  reinicio seguido sin sanar se avisa a VIM en `errores_app` (`contexto.origen = "watchdog"`), una
  vez por racha. Si el reinicio **no terminó** (la caja quedó sin backend), lo contrario: se
  reintenta al siguiente fallo, luego a los 2, 4 y 6; y cuando por fin levanta tras dos o más
  intentos fallidos, se avisa a VIM cuántos fueron y cuánto duró. La racha se olvida con **tres
  revisiones buenas seguidas** (un minuto: un OK suelto justo tras reiniciar no prueba nada) o con
  un respaldo. El aviso nunca se espera: con un Postgres que no contesta, no podría escribirse.
- **Apagarlo en el campo**: `VIM_WATCHDOG=0` en el entorno de la caja (sin publicar otra versión).
- **Detener el backend nunca se queda esperando** (`detenerBackend` en `backend.mjs`): el stream
  del KDS deja de aceptar streams, el gateway da 1.5 s a lo que estaba en vuelo y corta el resto
  (`cerrarServidor`); lo que EMPIECE en ese segundo y medio recibe **503 "La caja se está
  reiniciando; intenta en unos segundos."** en vez de cortarse a medias. Solo entonces se detienen
  PostgREST y Postgres — con tope, comprobando por
  PID si Postgres de verdad murió. El respaldo y la salida **no copian** el pgdata si no se pudo
  confirmar.

Verificado (`npm run verify:parada`, con el backend de verdad): salud en milisegundos, parada con un
stream y una consulta abiertos, y parada con Postgres ya muerto. Las reglas del watchdog están en
`watchdog.test.mjs`. **Incidente que lo pidió:** Knock-Out Obregón, 2 oct 2026 — ver
[`docs/bitacora/2026-10-02-obregon-reinicios-del-watchdog.md`](../docs/bitacora/2026-10-02-obregon-reinicios-del-watchdog.md).
Su firma en el log, por si vuelve: `salud del backend FALLÓ` ~4 s después de cada tick y nunca
`OK de nuevo` (falso positivo); o un `KDS desconectado` seguido de `KDS conectado` a los 3 s sin
`limpieza:` ni `reiniciado ✓`, y luego `[sync] omitido` cada minuto (reinicio colgado, ≤ 0.4.106).

**Respaldo local del pgdata.** El bin de Postgres embebido no trae `pg_dump`, así que el respaldo es
**físico en frío**: se copia el `pgdata` con Postgres detenido → copia 100% consistente. Se dispara:
- **una vez al día, sola** (`respaldo-diario.mjs`) — la caja vive en la bandeja y casi nunca se
  cierra, así que el respaldo "al cerrar" no bastaba. Cada 15 minutos se mira si toca, y solo se
  hace con la caja **quieta**: sin turno abierto, sin que nadie la haya operado en 10 minutos (una
  escritura por el gateway; los sondeos del POS y del KDS no cuentan) y sin sincronización ni
  actualización en curso. Como mucho uno cada 20 horas. Si el día se va con el turno abierto, se
  hace en la primera ventana quieta que aparezca. **Nunca interrumpe un turno.**
- **al cerrar la caja** ("Salir" / apagar la PC) — automático, sin costo (ya está cerrando);
- **bajo demanda** — "Respaldar ahora" en la bandeja (pausa el watchdog, detiene el backend, copia,
  lo vuelve a levantar; breve interrupción, a criterio del cajero). No corre mientras el watchdog
  reinicia el backend, ni el watchdog mientras corre un respaldo.

Los tres anotan su resultado en `<dataRoot>/backups/ultimo-respaldo.json` y cuentan igual como
"último respaldo". La bandeja lo enseña: **"Último respaldo: hoy 03:12"**.

**Cuando falla o se atrasa, VIM se entera.** Un respaldo fallido (disco lleno, permiso) se escribe
en `vim-pos.log` y en `errores_app` —la bitácora que sube sola a la nube y se ve en el panel—
con `contexto.origen = "respaldo-diario"`. Y una caja que lleva **3 días o más** sin respaldo
(típico: un negocio que nunca cierra el turno) lo reporta una vez al día, diciendo por qué. Tras un
fallo no se reintenta antes de una hora: cada intento detiene Postgres.

**Quieta también es "nadie en el teclado".** Además del gateway se pide que el sistema lleve 10
minutos sin teclado ni mouse (`powerMonitor.getSystemIdleTime()`): un cajero contando el fondo no
escribe nada en la base. Y si aun así alguien toca la caja en los segundos que dura la copia, el
puerto no queda cerrado: un gateway de espera contesta **503 "La caja está haciendo su respaldo
diario; intenta en unos segundos."**, que es lo que el POS enseña en vez de un fallo de red.

**Antes de detener la base se comprueba que el respaldo quepa** (tamaño del pgdata + holgura contra
el espacio libre). Si no cabe se purgan respaldos del más viejo al más nuevo, dejando siempre al
menos uno bueno; si ni así, **la base no se detiene** y se reporta (`causa: "sin-espacio"`). Cada
causa de fallo se reporta una vez cada 24 h. La copia con la caja encendida es asíncrona (no congela
la bandeja ni el servidor del POS); salir de la app espera al respaldo en curso.

Los respaldos van a `<dataRoot>/backups/pgdata-<fecha>_<hora>/`, rotando los **últimos 7**. Una copia a medias (`.parcial`) no cuenta como respaldo y se borra al empezar el siguiente.

**Qué protege y qué no.** Esto es una copia **en la misma computadora**: salva de una base dañada o
de un error humano, no de que se robe o se queme el equipo. Fuera del local están **las ventas**,
que el sync sube a la nube cuando hay internet (y el menú, que vive en la nube). No hay una copia
de la base entera fuera del local; el sitio lo dice así y no promete más.

```bash
# Con la caja CERRADA (respeta VIM_DATA_DIR si reubicaste los datos):
npm run backup                 # respaldo manual en frío
npm run restore                # restaura el MÁS RECIENTE
npm run restore -- pgdata-2026-07-11_14-30-05   # restaura uno específico
npm run verify:parada          # prueba headless: salud barata + parada que no se cuelga
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

> El instalador pesa ~150 MB y **Supabase Free rechaza archivos de más de 50 MB**, así que el `.exe`
> va a **GitHub Releases** y solo el `latest.json` al bucket. (El script te lo recuerda al final.)

1. Sube la versión en `desktop/package.json` (p. ej. `0.4.49` → `0.4.50`).
2. `npm run dist` → `dist/VIM POS Setup 0.4.50.exe`.
   **Tarda más de diez minutos.** Antes de seguir, comprueba la FECHA del `.exe`: es fácil publicar
   el binario anterior creyendo que el nuevo ya salió. Y pasa la lista **"Antes de empaquetar"** de
   arriba: `dist/win-unpacked/resources/bin/postgrest.exe` presente y el `.exe` de ~156 MB.
3. **Sube el `.exe` PRIMERO**, y solo después genera el manifiesto:

   ```bash
   gh release create v0.4.50 "dist/VIM POS Setup 0.4.50.exe" --title "VIM POS 0.4.50" --notes "…"
   gh release view v0.4.50 --json assets -q '.assets[].url'   # la URL REAL, no la supuesta
   ```

   El orden importa: así el manifiesto no puede apuntar a un archivo que no existe. GitHub además
   cambia los espacios por puntos en el nombre (`VIM.POS.Setup.0.4.50.exe`), otra razón para leer la
   URL en vez de escribirla a mano.

   Comprueba que el tamaño que reporta GitHub sea idéntico al del archivo local: es la prueba de
   que allá está exactamente el binario que vas a hashear.

4. `VIM_UPDATE_URL="<la URL real>" npm run release-manifest -- "Qué cambió"` → `dist/latest.json`
   (calcula el SHA-512 del `.exe` local y fija esa URL).
5. Sube `latest.json` al bucket **público** `actualizaciones` con un PUT:

   ```bash
   curl -X PUT -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"      -H "Content-Type: application/json" -H "x-upsert: true"      --data-binary @dist/latest.json      "https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/actualizaciones/latest.json"
   ```

   **El feed tarda un par de minutos en propagarse.** Justo después de subirlo, la URL pública sigue
   devolviendo la versión anterior: es caché de borde, no un fallo de la subida. Confírmalo leyendo
   el objeto autenticado (sin CDN) o con `?v=$(date +%s)`, y vuelve a mirar la URL limpia al rato.

**Reglas del manifiesto (desde la auditoría del 30/09/2026):** la caja rechaza un `latest.json`
cuya `version` no sea `x.y.z` estricto o cuya `url` no sea `https://`. `release-manifest` aborta en
el mismo caso, para que te enteres aquí y no en la caja.

#### Firmar `latest.json` (Ed25519) — ACTIVO desde la 0.4.103 (1 oct 2026)

El manifiesto va **firmado**. La caja lleva la llave pública en `src/updater.mjs`
(`LLAVE_PUBLICA_ACTUALIZACIONES`) y rechaza cualquier `latest.json` sin una firma válida sobre
`version`, `url` y `sha512` (ver `mensajeAFirmar`). Quien logre escribir en el bucket ya no puede
mandarle a las cajas un instalador suyo: le falta la llave privada.

- **La llave privada NO está en el repo ni en ningún servidor.** Vive en la máquina que publica:
  `%USERPROFILE%\.vim-pos-llaves\vim-actualizaciones.key` (o donde apunte
  `VIM_UPDATE_LLAVE_PRIVADA`). Hay que tener **un respaldo fuera de esa máquina** (USB o gestor de
  contraseñas). **Si se pierde, las cajas instaladas dejan de poder actualizarse** y habría que
  reinstalarlas a mano con un instalador que traiga otra llave.
- `npm run release-manifest -- "Qué cambió"` firma solo, comprueba la firma contra la llave pública
  de las cajas y **aborta si falta la llave** o si no es la pareja. Ya no existe el manifiesto sin firmar.
- La `url` por omisión es la del repo público de descargas
  (`Fermin03/vim-pos-descargas`); el del código es privado y sus releases dan 404.
- El panel (`/versiones`) valida la firma con la misma llave pública
  (`apps/platform/app/lib/llave-actualizaciones.ts`) y la conserva al subir el manifiesto; una prueba
  comprueba que las dos copias de la llave coinciden.
- Las cajas anteriores a la 0.4.103 no verifican firma: aceptan el manifiesto firmado igual (ignoran
  el campo) y, al instalar la 0.4.103, empiezan a exigirla.
- Para cambiar de llave: publicar (firmado con la llave VIEJA) una versión que traiga la pública
  NUEVA; desde esa versión se firma con la nueva.

Las cajas/cocinas detectan la nueva versión en su próximo arranque. Feed por defecto:
`https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones/latest.json`
(override con `VIM_UPDATE_FEED`; base del `.exe` con `VIM_UPDATE_BASE` en release-manifest).

### Los cortes que se quedaron en una caja (se rescatan solos)

Hasta la versión 0.4.50 la sincronización **no subía los cortes de caja ni el reporte Z**: se
generaban en la caja, se imprimían, y no salían nunca. En el piloto quedaron trece turnos cerrados
sin un solo corte en la nube, y «Reportes → Cortes Z históricos» del panel estaba vacío.

Arreglar el snapshot no bastaba para recuperarlos: la caja rastrea los turnos por huella para no
reenviar lo ya subido, y esos turnos no habían cambiado.

**Al actualizar a 0.4.50 la caja lo resuelve sola**, una sola vez: borra la huella de los turnos
que tienen corte, y en el siguiente ciclo suben con su cierre. No se pierde ningún dato, y re-subir
un turno es inofensivo (la nube hace `ON CONFLICT DO UPDATE`). Un marcador impide que se repita —
sin él, la caja re-subiría su historia entera cada diez minutos.

Va automático a propósito: pedirle a alguien que abra una terminal en la caja de un restaurante es
pedir que no se haga. Y no le pasa solo al piloto, sino a toda caja que haya cerrado un turno antes
de actualizar.

Se confirma en el panel, en **Reportes → Cortes Z históricos**, unos minutos después.

> Si hiciera falta forzarlo desde el repositorio (diagnóstico, o repetirlo tras una restauración):
> `npm run resincronizar-cortes` muestra qué subiría, y `-- --hacer` lo aplica. Ese script NO va
> dentro del instalador; el rescate automático de arriba es el camino normal.

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

**Datos en la máquina de el dueño:** la app *instalada* usa `userData` (`%APPDATA%`) por defecto; en
esta PC (perfil con junction) eso rompe `initdb` → lanzar con **`VIM_DATA_DIR=D:\ruta`** (o setear esa
env de sistema). En una **PC normal del piloto** `userData` funciona sin tocar nada.

## Arranque que "no abre a la primera" (0.4.56)

Causa: `postgres.exe` muere antes de decir "ready" (puerto 54329 aún ocupado por el Postgres de la
sesión anterior, candado `postmaster.pid`, memoria compartida, antivirus) y embedded-postgres
rechaza sin motivo → el log decía `Boot falló: undefined`. Desde 0.4.56 el arranque captura lo que
escribe Postgres, reintenta hasta 3 veces con 3 s y limpieza entre intentos
(`src/arranque-reintentos.mjs`), y si aun así falla el diálogo y el log dicen la causa
(`arranque: Postgres no arrancó (intento 1/3): el puerto de Postgres sigue ocupado…`). Si a un
cliente le vuelve a pasar, pedir `%APPDATA%\vim-pos-desktop\vim-pos.log` y buscar `arranque:`.

## Endurecimiento de la auditoría integral (30/09/2026)

- **Privilegios de la BD local.** El arranque ya NO hace `GRANT … ON ALL TABLES` (deshacía los
  `REVOKE` de las migraciones y dejaba las libretas `_vim_*` escribibles desde la LAN). Los
  privilegios los ponen los default privileges (shim + 0065) y las migraciones, como en Supabase.
  Las tablas `_vim_*` quedan fuera de la API (`src/privilegios.mjs` + event trigger del shim). Una
  sola vez, las cajas ya instaladas reaplican los `REVOKE` que el GRANT viejo les había deshecho
  (marcador `reaplicar_revokes_d1` en `_vim_migraciones_sync`). Prueba contra un Postgres:
  `VIM_TEST_PG=… VIM_TEST_PG_PLANTILLA=… VIM_TEST_PG_HASTA=… node --test src/privilegios.test.mjs`.
- **Login local solo para cuentas de caja.** `/auth/v1/token` acepta únicamente usuarios con rol
  DISPOSITIVO (el dueño entra al panel en la nube, no aquí) y frena a 10 fallos en 5 min por IP y
  por cuenta (429 durante 15 min; la propia caja por `localhost` no se bloquea por cuenta).
- **Host permitido.** Gateway y ui-server solo atienden si el `Host` es `localhost`, `127.0.0.1`,
  una IP de la máquina o su nombre de equipo (contra DNS rebinding). Si en un local la cocina llega
  a la caja por un nombre DNS propio, añádelo en `VIM_HOSTS_PERMITIDOS=caja.lan,otro`.
- **KDS por SSE.** Tope de 32 conexiones y token obligatorio (`?access_token=`, lo manda
  `abrirStreamHub` de `packages/kds-core`). Si un local se queda sin tiempo real en cocina tras
  actualizar, `VIM_KDS_STREAM_AUTH=0` lo apaga mientras se investiga (el sondeo cubre igual).
- **Ventana de Electron** con `sandbox: true`; no navega fuera del POS local (o
  `https://pos.vimpos.com.mx`) y `window.open` solo abre `https://` en el navegador del sistema.

## Espejo de pedidos de apps (Uber Eats) — spec 2026-09-03

La caja vinculada a la nube corre un agente (`src/delivery-espejo.mjs`, log `· [espejo]`) cada
10 s: llama `delivery-espejo` con el token de dispositivo, espeja `delivery_conexiones` y
`delivery_pedidos` de su sucursal en la base local, reclama los pedidos que le tocan
(`delivery-accion` → `reclamar`), crea el ticket local con `crear_ticket_desde_app` y acepta en
Uber (`delivery-accion` → `aceptar`). El gateway reenvía `POST /functions/v1/delivery-accion` a la
nube con el token de dispositivo (`backend.nube`), así la pantalla del POS no cambia. Pruebas:
`pnpm test:escritorio` (planificador + agente con nube y base falsas).

## Hub del local — KDS en tiempo real por LAN (Fase 2)

La caja hace de **servidor en la LAN**: el gateway escucha en `0.0.0.0` y al arrancar loguea
`Hub en la LAN: http://<ip>:54350`. Otro equipo (pantalla de cocina, 2ª caja) apunta ahí.

- **Tiempo real:** trigger `pg_notify('vim_kds', …)` al cambiar el estado de cocina de un ticket →
  el backend hace `LISTEN` y reenvía por **SSE** (`GET /kds/stream?sucursal=<id>`). El KDS del POS
  se suscribe (EventSource) y recarga al instante; el polling de 5s queda como respaldo.
  El mismo puente lleva `vim_catalogo` como `event: catalogo` (ver "El menú, al minuto"): un
  cliente que no lo conozca lo ignora, así que el KDS viejo no se rompe.
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

## El menú, al minuto (sondeo de catálogo)

El catálogo bajaba **1 de cada 6 ciclos** (`SYNC_PULL_CADA`, ≈1 h). Un producto dado de alta en
/admin no salía en la caja hasta esa hora o hasta reiniciar la app —el arranque siempre hace PULL—
y así lo reportó el piloto. Bajarlo cada 10 min tampoco servía: es reescribir productos, precios y
permisos sobre la base de una caja que está cobrando.

La caja no puede recibir avisos (vive detrás del NAT del local), así que **pregunta**:

- **Cada 60 s** llama `catalogo_version()` (migración `0109`) por PostgREST. Devuelve UN timestamp:
  el `max(updated_at)` del menú del tenant, bajo RLS. Va por PostgREST y no por Edge Function a
  propósito — ahí no cuesta invocación ni arranque en frío. Si no cambió, no pasa nada.
- Si cambió, **PULL en el acto** (`sondeo-catalogo.mjs`). El PULL del sondeo NO sube ventas: un
  cambio de menú no tiene por qué arrastrar un push, que es la parte lenta.
- Al terminar, `pg_notify('vim_catalogo', …)` → viaja por el **mismo puente SSE del KDS** →
  el POS relee el menú sin recargar. La 2ª caja y la cocina se enteran por el mismo camino.
- **Botón manual:** `POST /__sincronizar-catalogo` (menú del POS → Ajustes → "Actualizar menú").
  Guarda de origen como el resto de rutas que escriben, y freno de 10 s.
- Con la nube caída el sondeo hace backoff 1→2→4→8→10 min, y ahí se queda: una caja sin internet
  preguntando cada minuto solo llena el log.
- Verificado: `npm run verify:hub` (el aviso de catálogo llega por SSE) y `node --test src/`.

Una caja que arranca **sin red** deja el sondeo sin versión conocida, así que el primer sondeo que
alcance la nube baja el catálogo. Es a propósito: su copia local es de la sesión anterior.

## Dominio de las cuentas de caja (0.4.97)

Cada caja entra a la nube como `caja-<caja_id>@dispositivos.<dominio>`. El dominio era
`dispositivos.vimpos.mx`, que **no es de VIM** (nadie lo tiene registrado: quien lo registrara
recibiría el "restablecer contraseña" de las cajas). Pasa a `dispositivos.vimpos.com.mx`, sin MX:
un correo a esas cuentas no llega a ningún lado. El código de los dominios vive en tres espejos:
`desktop/src/dispositivo.mjs`, `supabase/functions/_shared/dispositivo.ts` y `@vim/db/dispositivo`.

El cambio va sin corte, en este orden:

1. **Funciones** (reconocen los dos dominios): `caja-latido`, `delivery-espejo`, `pin-login`,
   `sync-pull`, `sync-push` y, AL FINAL, `provisionar-dispositivo` (crea las cuentas nuevas ya con
   `.com.mx` y, al regenerar, mueve la cuenta existente de la caja en vez de crear otra).
2. **Instalador 0.4.97**: si la nube rechaza su correo, la caja prueba el del otro dominio con la
   misma contraseña y guarda el bueno en `nube.json` (log: `la cuenta de esta caja cambió de dominio`).
3. **Con TODAS las cajas en 0.4.97 o más** (panel → Versiones), mover las cuentas:
   `npx supabase db query --linked -f supabase/scripts/migrar_dominio_dispositivos.sql`.
   Se niega a correr si queda alguna caja atrasada y dice cuál. Una caja anterior a 0.4.97 no sabe
   reintentar: se quedaría sin sincronizar hasta que alguien la vuelva a vincular.

## Pantalla del cliente

Un segundo monitor de cara al mostrador, que enseña la cuenta mientras el cajero captura (ADR 0026).
La abre sola `desktop/src/pantalla-cliente.mjs` cuando detecta el monitor; la dibuja el mismo POS con
`?cliente` (`apps/pos/app/components/pantalla-cliente.tsx`).

Solo se puede probar de verdad con dos monitores y el instalador (o `npm start` en `desktop/`): la
ventana, el foco, los monitores y la suspensión de pantalla son de Electron y de Windows, y ninguna
prueba automática los ve. Esta lista se pasa completa con cada instalador que toque la ventana o
la vista (`desktop/src/pantalla-cliente.mjs`, `desktop/src/main.mjs`, `desktop/src/ui-server.mjs`,
`apps/pos/app/components/pantalla-cliente.tsx`, `apps/pos/app/lib/pantalla-cliente/vista.ts`,
`apps/pos/app/lib/pantalla-cliente/canal.ts`).

- [ ] Con dos monitores, al abrir la caja la pantalla del cliente aparece sola en el segundo.
- [ ] Ocupa todo el monitor: sin marco, sin barra de título, sin barra de tareas encima.
- [ ] No aparece en la barra de tareas ni en Alt+Tab.
- [ ] Al escribir o escanear, el foco sigue en la caja.
- [ ] Desconectar el segundo monitor: la caja sigue igual. Reconectar: la pantalla vuelve sola.
- [ ] Capturar, cobrar y ver el cambio: las dos pantallas coinciden en el total y en el cambio.
- [ ] En una sucursal con propina activada, cobrar con propina: al confirmar la propina, el monto de la pantalla del cliente coincide con el del cajero.
- [ ] Cobro sin impresora configurada: la pantalla del cliente vuelve a reposo a los 8 s aunque el recibo siga abierto en la caja.
- [ ] En «Impresoras y pantallas de esta caja» (desde «Configurar impresoras y pantallas»), apagarla la cierra; encenderla la reabre. Sigue apagada tras reiniciar.
- [ ] Cerrar la caja a la bandeja: la pantalla del cliente se cierra. Al volver a abrir la caja, reaparece. «Salir» la cierra.
- [ ] Arrastrar la caja al otro monitor: las pantallas se intercambian.
- [ ] Con un monitor vertical: nada se corta ni se encima.
- [ ] Con un solo monitor: nada cambia respecto a la versión anterior.
- [ ] El monitor del cliente no se apaga solo tras varios minutos sin uso.
- [ ] Con anuncios subidos en /admin: tras uno o dos minutos, la pantalla en reposo los rota.
- [ ] Sin internet: los anuncios ya bajados siguen saliendo.
- [ ] Un anuncio eliminado o pausado en /admin deja de salir sin reiniciar la caja.
- [ ] Sin anuncios: logo y nombre, como antes.
- [ ] Una imagen con tiempo propio dura lo suyo; las demás, el tiempo general.
- [ ] Si la ventana del cliente muere varias veces seguidas (matar su proceso de renderizado desde el Administrador de tareas), la caja sigue funcionando; tras 5 reaperturas en un minuto la ventana deja de reabrirse, y reconectar el monitor o apagar y encender «Encendida» en el menú la trae de vuelta. El registro muestra líneas `[pantalla-cliente]`.

**Si no aparece.** Windows tiene que estar en «Extender», no en «Duplicar»: duplicando reporta un
solo monitor y no hay dónde abrirla (el ajuste lo dice). Y el monitor del cajero debe ser el
principal de Windows; si el principal es el del mostrador, las dos pantallas arrancan
intercambiadas. Si la ventana muere seis veces en un minuto, deja de reabrirse y lo anota en el
registro; vuelve a intentarlo al mostrar o mover la caja, al cambiar los monitores o al tocar el ajuste.

El registro queda en `vim-pos.log` con la etiqueta `[pantalla-cliente]`. La configuración local
(`modo` y monitor elegido) es `pantalla-cliente.json`, en la misma carpeta que `vim-pos.log`; si se
borra, vuelve al estado de fábrica (encendida, sin monitor elegido).

**Anuncios.** Las imágenes viven en `anuncios/`, dentro de la carpeta de datos de la caja (la misma
de `vim-pos.log`); la caja las baja tras cada pull y borra las que ya no están en la lista. El
registro lleva la etiqueta `[anuncios]`; si no salen, ahí dice qué descarga falló. La lista se
lee en la propia máquina en `/__anuncios`.

### Orden de salida de los anuncios

1. **Aplicar la migración 0150 a producción ANTES de mezclar** (crea la tabla y el almacén). Y
   verificar ahí lo que en local no se puede: con una sesión que no es admin no se puede subir,
   cambiar ni borrar ningún anuncio; la undécima subida se rechaza y no deja imagen huérfana;
   eliminar un anuncio quita su objeto del almacén `anuncios`. Además:
   - `select policyname from pg_policies where schemaname='storage' and tablename='objects' and
     policyname like 'anuncios_%'` devuelve **3** renglones.
   - `select public, file_size_limit, allowed_mime_types from storage.buckets where id='anuncios'`
     devuelve `true`, `1048576` y los tres tipos (`image/jpeg`, `image/png`, `image/webp`).
   - El camino bueno también: con el dueño o un admin **sí** se puede subir, pausar, reordenar y
     eliminar. Eso prueba que las funciones de permisos se resuelven dentro de `storage`; si no, el
     panel rechaza a todos y nadie lo nota hasta que un dueño intenta subir.
   - `curl -I <url pública de un anuncio>`, sin sesión, devuelve `200` con `content-type`
     `image/jpeg`, `image/png` o `image/webp`. La caja rechaza cualquier otro tipo: un tipo
     equivocado significaría, en silencio, ningún anuncio en ninguna caja.
   - `sync_pull_snapshot(<un negocio real>)` como `service_role` sigue trayendo `encrypted_password`
     para la cuenta `caja-…@dispositivos` y `null` para las personas, e incluye los anuncios dados
     de baja (con `deleted_at`): de eso depende que la caja se entere de una baja.
   - Con el token de dispositivo de una caja, `rpc/catalogo_version` cambia después de editar un
     anuncio y después de guardar el tiempo general.
2. **Mezclar:** el admin se despliega y ya se pueden subir anuncios.
3. **Instalador nuevo de la caja.** Una caja sin actualizar no muestra anuncios, pero tampoco falla.
   Ya instalado, comprobar: pausar un anuncio quita su archivo de `anuncios/` (en el log, la línea
   `[anuncios]`), y una caja de prueba revinculada a un segundo negocio enseña solo los anuncios del
   negocio nuevo.

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
VIM_DEVICE_EMAIL=caja-<caja_id>@dispositivos.vimpos.com.mx \
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
