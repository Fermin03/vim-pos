# Fase 0 — Spike local-first · Hallazgos y veredicto

**Fecha:** 11 jun 2026 · **Objetivo:** validar el mayor riesgo antes de comprometer la Fase 1 —
¿corre el stack de VIM POS **100% local, sin Docker ni Supabase**, reusando las migraciones y
el plpgsql ya verificados?

## ✅ VEREDICTO: GO — reusar, NO rehacer desde cero

Todo el esquema + la lógica de dinero en plpgsql corre sobre un **Postgres embebido**
(PG 17.10, un binario que el instalador empaqueta, sin Docker) con una **capa de
compatibilidad de ~90 líneas**. Reescribir desde cero tiraría a la basura 53 migraciones y
28 smokes de lógica de dinero verificada, a cambio de nada.

## Lo que se probó (los 3 pasos, todos verdes)

| Paso | Qué valida | Resultado |
|------|-----------|-----------|
| `01-bootstrap.mjs` | Postgres embebido (sin Docker) + shim + **53 migraciones** + seed | ✅ 4 extensiones (`pgcrypto`/`citext`/`pg_trgm`/`unaccent`), fixtures cargados, ~7–12 s |
| `02-venta-sql.mjs` | Lógica de dinero plpgsql local (abrir turno → ticket → ítem → **pago → PAGADO**) | ✅ folio por trigger (`KC-2026-000001`), total con IVA, PAGADO |
| `03-postgrest.mjs` | La **ruta real del POS**: PostgREST + JWT + RLS + RPC en `localhost` | ✅ `GET /productos` filtrado por RLS, venta por RPC → PAGADO |

El paso [3] es la prueba clave: es lo que hoy hace `supabase-js` contra la nube, apuntando a
`localhost`. **El POS corre offline cambiando esencialmente la URL del endpoint.**

## El acoplamiento a Supabase = 1 shim (`sql/00-compat-shim.sql`, ~90 líneas)

No hay `vault`/`realtime`/`graphql`/`pg_net`. Todo se reduce a:
- **Roles**: `anon`, `authenticated`, `service_role`, `supabase_auth_admin`, `authenticator`.
- **Schema `auth`**: tabla `users` (subconjunto compatible con las 169 FKs y el seed) +
  `auth.jwt()` / `auth.uid()` / `auth.role()` / `auth.email()` leyendo el GUC `request.jwt.claims`.
- **Schema `storage`**: `objects` + `foldername()` (para las 2 políticas CFDI de 0009).
- **Grants** a los roles API sobre `public` (lo que Supabase da por defecto, fuera de migraciones).

## Gotchas encontrados (todos resueltos — insumo directo para Fase 1 / instalador)

1. **Encoding Windows.** `initdb` toma el locale del SO (WIN1252) → el dominio en español
   revienta. Fix: crear la BD en **UTF8** (`template0`) o `initdb --encoding=UTF8`.
2. **`libpq.dll`.** PostgREST la enlaza dinámicamente → el instalador debe empaquetarla
   (ya viene con el Postgres embebido; basta ponerla en el PATH del proceso).
3. **Puerto 54321** lo ocupa el Supabase local del entorno de dev → el device usará puertos propios.
4. **`seed.sql` (dev) choca con la migración 0046** en 5 catálogos globales. En el device los
   catálogos vienen de las migraciones/sync, no del seed (el seed es solo fixture de dev).
5. **`auth.users`** necesita 8 columnas internas de GoTrue que el seed normaliza a `''`.
6. **Grants a roles API** van fuera de las migraciones (Supabase los aplica por plataforma).

## Rendimiento (en la laptop de dev)

- Arranque en frío del cluster embebido: ~1 s.
- Bootstrap completo (shim + 53 migraciones + seed): **~7–12 s** (solo la primera vez / reset).
- Consultas/RPC por PostgREST: instantáneas (todo local). Apto de sobra para un POS.

## Recomendación para Fase 1 (POS escritorio single-caja local-first)

Reusar este runtime tal cual, dentro de un shell **Electron**:
- **Postgres embebido** como servicio del app (arranque/apagado gestionados por el proceso main),
  con las migraciones aplicadas por un runner en el device (idempotente).
- **PostgREST** como sidecar (con `libpq.dll` empaquetada), contra el Postgres local.
- **Auth PIN local** = un `pin-login` que valida contra `usuarios_perfil.pin_hash` (bcrypt/pgcrypto,
  ya probado) y **firma el mismo JWT** (`sub`+`tenant_id`+`role`) con un secreto local → RLS igual.
- **POS Next.js** apuntando el cliente Supabase al endpoint local (`http://localhost:<puerto>`).
- **Sync bidireccional** extendiendo el motor existente (push idempotente ya está; falta el *pull*
  de catálogo/config de la rebanada del tenant).

## Cómo re-correr el spike

```
cd spike-local-first
npm install
npm run bootstrap   # [1] Postgres embebido + shim + 53 migraciones + seed
npm run venta       # [2] venta completa por SQL (lógica de dinero)
npm run rest        # [3] venta completa por PostgREST (RLS + JWT + RPC)
```

Binarios (Postgres embebido, `postgrest.exe`, `libpq.dll`) y datos (`pgdata/`) NO se commitean.
