# 0004 — El offline lo da el escritorio, no un outbox en el navegador

**Fecha:** 2026 (migraciones `0055` pull / `0056` push) · **Estado:** vigente

## Qué decía el plan

La regla #5 de `CLAUDE.md` decía: *"El POS no habla directo a Supabase en operación: pasa por la
capa repositorio sobre Dexie y sincroniza por batch"*. El diseño completo —cola de mutaciones en
IndexedDB, reintentos, resolución de conflictos— está en
`docs/bitacora/diseno-offline-dexie-SUPERADO.md`.

## Qué hacemos ahora

El offline-first lo da la **aplicación de escritorio**: Postgres embebido en la propia caja +
un gateway compatible con supabase-js. El POS escribe directo por RPC bajo RLS, contra su base
local, y la sincronización con la nube es por **snapshot** (`sync_pull_snapshot` /
`sync_push_snapshot`), no un registro de operaciones.

El outbox web está **congelado** (`apps/pos/app/lib/outbox.ts`, marcado `@deprecated`). El único
Dexie que queda es el caché de lectura del catálogo.

## Por qué

Una cola de mutaciones en el navegador tiene que reimplementar, en TypeScript y sin
transacciones, lo que Postgres ya sabe hacer: folios consecutivos, totales, integridad
referencial, estados. Con Postgres en la caja no hay nada que reimplementar — la caja *es* la
base de datos, y sincronizar es copiar filas.

El precio es que el offline de verdad solo existe en el escritorio. El POS web sigue siendo
online-first: si se cae la red, avisa y bloquea cobros.

## Consecuencias

- `CLAUDE.md` ya trae la corrección de esta regla.
- La sincronización es de **escritorio único**: dos dispositivos escribiendo el mismo tenant
  chocan. Por eso el outbox web se congeló en vez de mantenerse en paralelo.
- El snapshot replica una lista **explícita** de tablas. Ampliarla cuesta una migración a
  propósito: es la frontera de lo que un dispositivo puede escribir en producción.
