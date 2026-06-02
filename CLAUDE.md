# VIM POS — guía para Claude Code

POS SaaS multi-vertical, multi-tenant, para restaurantes en México.

> 🧠 **Para retomar el proyecto, lee primero `../MEMORY.md`** (tablero de estado: dónde vamos, cómo levantar el entorno, gotchas). El plan por fases está en `../RECURSOS PARA DESARROLLO/GUÍA DE DESARROLLO/18-PLAYBOOK-DE-EJECUCION.md`.

## Fuente de verdad

La especificación está en `../RECURSOS PARA DESARROLLO/`. Antes de implementar algo, consulta:

- `00-PLAN-MAESTRO-VIM-POS.md` — visión, verticales, pricing, roadmap, índice de docs
- `ARQUITECTURA/07-1A…1F` — modelo de datos (SQL ejecutable), auth/JWT
- `ARQUITECTURA/11-GUIA-DE-DESARROLLO.md` — convenciones, estructura, testing, CI
- `ARQUITECTURA/09-MATRIZ-ROLES-PERMISOS.md` — permisos
- `ARQUITECTURA/13`/`14`/`16` — CFDI, Realtime/KDS, impresión
- `MOCKUPS/` — 231 pantallas (P-XXX) como referencia visual

**Regla:** el documento de arquitectura manda; el código lo implementa. Si difieren, se corrige el código (o se versiona el doc con justificación).

## Reglas duras

1. **RLS sagrado.** Toda tabla operativa con `tenant_id` + política RLS. Ninguna ruta de `apps/pos` ni `apps/admin` usa `service_role`. Solo `apps/platform` y Edge Functions (server-side).
2. **Dinero nunca en float.** `numeric(12,2)` en BD; enteros/decimal validado en TS.
3. **Español en el dominio** (igual que el SQL `snake_case`). Archivos `kebab-case`, componentes `PascalCase`.
4. **Sin `any`.** `unknown` + Zod.
5. **El POS no habla directo a Supabase** en operación: pasa por la capa repositorio sobre Dexie y sincroniza por batch (doc 1C.2 §10).

## Convenciones de migraciones

- SQL extraído de los docs a `supabase/migrations/NNNN_*.sql` en orden de dependencias (1A→1F→12).
- Una migración aplicada en remoto NO se edita; cambios = migración aditiva.
- Tras cada migración: `pnpm db:types`.

## Testing (pragmático, doc 11 §9)

- RLS cross-tenant (no negociable), funciones SQL de dinero, y E2E de la ruta crítica (login→venta→cobro→cierre).
