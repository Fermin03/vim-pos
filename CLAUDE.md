# VIM POS — guía para Claude Code

POS SaaS multi-vertical, multi-tenant, para restaurantes en México.

> 🧠 **Para retomar el proyecto, lee primero `../MEMORY.md`** (tablero de estado: dónde vamos, cómo levantar el entorno, gotchas). El plan por fases está en `docs/especificacion/guia-de-desarrollo/18-PLAYBOOK-DE-EJECUCION.md`.

## Fuente de verdad

**La regla de precedencia, en este orden:**

1. **`docs/decisiones/`** — lo que cambió respecto al plan original. Manda siempre.
2. **`docs/especificacion/`** — la especificación original. Manda en todo lo que ningún
   ADR haya superado.
3. **`docs/diseno/`** y el código — mandan en cómo se ve y cómo se comporta.

Si el código contradice a los tres, es un bug **o un ADR que nadie escribió**. Averigua cuál antes
de "arreglarlo".

> Esta regla decía antes *"el documento de arquitectura manda; el código lo implementa"*. Dejó de
> ser cierta: el plan maestro sigue cobrando por vertical cuando la BD cobra por paquete, y así
> varias más. Una fuente de verdad que miente es peor que ninguna, porque se obedece.
> Empieza siempre por `docs/README.md`.

La especificación sigue siendo válida en la mayor parte. Antes de implementar algo, consulta:

- `00-PLAN-MAESTRO-VIM-POS.md` — visión, verticales, roadmap, índice de docs
  (**los precios están superados por `decisiones/0002`**)
- `arquitectura/07-…-1A…1F` — modelo de datos (SQL ejecutable), auth/JWT
- `guia-de-desarrollo/11-GUIA-DE-DESARROLLO.md` — convenciones, estructura, testing, CI
- `arquitectura/09-MATRIZ-ROLES-PERMISOS.md` — permisos
- `arquitectura/13`/`14`/`16` — CFDI, Realtime/KDS, impresión
- `flujos/` — flujos por vertical

**Diseño:** `docs/diseno/nucleo.md` (marca compartida) + un documento por app. Los **mockups ya no
mandan**: se archivaron el 30/08/2026 en `respaldos/`, ver `decisiones/0001`.

## Reglas duras

1. **RLS sagrado.** Toda tabla operativa con `tenant_id` + política RLS. Ninguna ruta de `apps/pos` ni `apps/admin` usa `service_role`. Solo `apps/platform` y Edge Functions (server-side).
2. **Dinero nunca en float.** `numeric(12,2)` en BD; enteros/decimal validado en TS.
3. **Español en el dominio** (igual que el SQL `snake_case`). Archivos `kebab-case`, componentes `PascalCase`.
4. **Sin `any`.** `unknown` + Zod.
5. **El POS escribe directo por RPC bajo RLS** (no hay capa Dexie de escritura en operación). El offline-first lo da el **escritorio**: Postgres local + gateway compatible con supabase-js, y sync por **snapshot** (migraciones 0055 pull / 0056 push), no un op-log. *(Corregido en la remediación Fase 3: la versión anterior —"pasa por Dexie y sincroniza por batch"— describía el outbox web, hoy congelado. Justificación: el doc manda, así que se versiona el cambio; ver `apps/pos/app/lib/outbox.ts` @deprecated. El único Dexie que queda es el **cache de lectura** del catálogo.)*

## Convenciones de migraciones

- SQL extraído de los docs a `supabase/migrations/NNNN_*.sql` en orden de dependencias (1A→1F→12).
- Una migración aplicada en remoto NO se edita; cambios = migración aditiva.
- Tras cada migración: `pnpm db:types`.

## Testing (pragmático, doc 11 §9)

- RLS cross-tenant (no negociable), funciones SQL de dinero, y E2E de la ruta crítica (login→venta→cobro→cierre).
