# Knock-Out Obregón: «Sin internet» con el internet bien — 2 de octubre de 2026

> Registro (bitácora): no se edita. Lo pendiente está al final y en la sección del watchdog de
> `desktop/RUNBOOK.md`.

## Qué se vio

La caja de la sucursal Obregón (PC con Windows 10 19045, pantalla 1366×768, recién instalada)
decía **«Sin internet»** sola, y mientras duraba el POS no cargaba nada: **«TypeError: Failed to
fetch»**. La red estaba bien; la nube recibía los latidos de esa caja con normalidad. Parecía que
el modo sin conexión no funcionaba.

En la caja de escritorio ese aviso **no mide internet**: es un `HEAD` cada 20 s al gateway LOCAL
(`localhost:54350/auth/v1/health`, `apps/pos/app/lib/conexion.ts`). «Sin internet» y «Failed to
fetch» significaban lo mismo: el servidor de la propia caja no contestaba.

## Por qué (dos fallos encadenados, los dos reproducidos)

**A. Falso positivo de salud.** El watchdog pide `/health/deep` cada 20 s y reinicia el backend a
los 3 fallos. `/health/deep` le pedía a PostgREST `GET /`, con 4 s de tope. Ese `/` es la
descripción OpenAPI de todo el esquema: **2.2 s** en una laptop de desarrollo (y 4 ms una lectura
a una tabla). En la PC de Obregón superaba los 4 s **siempre**: cada fallo quedó en el log ~4.1 s
después de su tick, en todos los arranques, y nunca hubo un «OK de nuevo». El watchdog reiniciaba
un backend sano cada 60–80 s; cada reinicio son ~15 s con el puerto cerrado.

**B. Reinicio colgado para siempre.** `backend.stop()` esperaba a `gateway.close()`. Ese cierre
deja vivas las conexiones que Node considera activas (una petición en vuelo, o una que el navegador
abrió sin pedir nada todavía), y por ellas se siguen atendiendo peticiones NUEVAS. El stream del POS
reconectaba a los 3 s (reintento de `EventSource`) por una de esas conexiones; un stream no termina
nunca, así que `close()` no volvía jamás. Con `backend = null` y el puerto cerrado a conexiones
nuevas, el POS quedaba en «Failed to fetch» hasta que alguien reabría la app. Firma en el log: un
`KDS desconectado` y, 3.04 s después, `KDS conectado` sin `limpieza:` ni `reiniciado ✓`; luego
`[sync] omitido (la base local está detenida por el respaldo)` cada minuto — un mensaje que culpaba
al respaldo de lo que era un reinicio. Pasó cinco veces ese día; una duró 1 h 45 min.

A alimentaba a B: sin reinicios cada minuto no habría habido tantas paradas en que colgarse.

## Lo que salió al reproducirlo

- **Con Postgres ya muerto, `stop()` tampoco volvía.** embedded-postgres pide a `taskkill` que lo
  mate y espera su evento `exit`, que ya pasó. Es justo el caso para el que existe el watchdog:
  nunca pudo recuperarse de un Postgres caído. (`verify:robustez3` solo mataba PostgREST.)
- **Esa misma muerte tumbaba el proceso**: la conexión LISTEN del KDS y el pool emitían `'error'`
  sin oyente. En Electron eso es un diálogo de error encima de la caja.
- `gateway.listen` no manejaba `'error'`: un puerto ocupado era otra excepción sin capturar y un
  arranque que no terminaba.

## Qué cambió (0.4.107, solo escritorio)

- **Salud barata** (`sonda-postgrest.mjs`): lectura mínima a `tenants`; sano = PostgREST contesta
  por debajo de 500 (lo normal, 401 de `anon`). `SELECT 1` con su propio tope. El motivo de cada
  fallo viaja en la respuesta y queda en el log.
- **Watchdog que no insiste** (`watchdog.mjs`): motivo en cada línea; si reiniciar no cura, el
  siguiente reinicio espera el doble (hasta ~30 min) y se avisa a VIM en `errores_app` una vez por
  racha; si el reinicio no terminó, se reintenta pronto. `VIM_WATCHDOG=0` lo apaga.
- **Parada que no se cuelga** (`detenerBackend`, `cerrarServidor`, `detenerPostgres`): el stream del
  KDS rechaza streams tras detenerse; el gateway da 1.5 s a lo que estaba en vuelo y corta el resto;
  Postgres se detiene con tope y se comprueba por PID. El respaldo y la salida no copian el pgdata
  si no se confirmó que Postgres se detuvo.
- **Ciclo de vida en serie** (`main.mjs`): un reinicio a la vez, nunca encima de un respaldo ni de
  la salida; salir espera al reinicio en curso.
- Oyentes de `'error'` en el pool y en el LISTEN; `uncaughtException` al log en vez de un diálogo
  (durante el arranque sigue habiendo diálogo, sin cerrar la app).
- El log del sync dice el motivo real (respaldo, reinicio o backend sin levantar).

Tras una revisión adversarial (cinco lentes, cada hallazgo verificado) se añadió: el aviso a VIM
no se espera (con Postgres atorado dejaba al watchdog parado); aviso cuando la caja pasó varios
reinicios fallidos sin backend; la racha se olvida con tres revisiones buenas, no con una; lo que
empieza durante la gracia del cierre recibe 503 y las respuestas en vuelo salen con
`Connection: close` (antes el navegador colaba ahí una petición que se cortaba a medias); y la
instancia de embedded-postgres se desarma cuando Postgres ya murió, para que su gancho de salida no
mate un PID reciclado. Medido además contra PostgREST real: en el primer segundo tras morir
Postgres contesta **400 sin código**, que la sonda ya no cuenta como sano.

Pruebas: `watchdog.test.mjs`, `parada.test.mjs`, `sonda-postgrest.test.mjs`, `tope.test.mjs`,
casos nuevos en `gateway.test.mjs`, y `npm run verify:parada` con el backend de verdad.

## Abierto

- **No medido en Obregón** cuánto tarda allí el `/` de PostgREST (el log prueba que pasa de 4 s, no
  cuánto). Con la 0.4.107 el log dirá el motivo de cualquier fallo de salud.
- **21:19:55, «PostgREST no respondió»**: tras un reinicio, PostgREST abrió su puerto y no conectó
  con la base en 60 s (su log, dos líneas). Ni A ni B lo explican. Sospechoso: cada parada mata
  Postgres con `taskkill /f` (embedded-postgres) y el siguiente arranque hace recuperación.
- **Para la 0.4.108**: que el puerto conteste 503 con un mensaje durante un reinicio (hoy queda
  cerrado ~15 s); que el POS de escritorio no diga «Sin internet» cuando lo caído es el servidor
  local, ni enseñe «TypeError: Failed to fetch» crudo; readiness del arranque con tope.
- Revisar en el log de la caja de San Francisco del Rincón si hubo `salud del backend FALLÓ`: con
  2.2 s de `/` en una laptop buena y 4 s de tope, esa caja operaba con poco margen.
