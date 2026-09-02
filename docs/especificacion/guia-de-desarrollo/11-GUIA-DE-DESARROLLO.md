# 11 — GUÍA DE DESARROLLO — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** convenciones de código, estructura del repositorio y flujo de trabajo. Es el manual para construir el MVP sin improvisar.
> **Audiencia:** Fermín + Claude Code + futuro equipo
> **Depende de:** todos los docs de arquitectura (07-1A…1F), 10 (setup), 12 (plataforma)
> **Stack base (fijado en Plan Maestro §4):** Next.js 15 + TypeScript + Tailwind + Supabase + Dexie + Capacitor (Fase 3) + Edge Functions (Deno) + Vercel

---

## 📋 Tabla de contenidos

- [0. Propósito y principios](#0-propósito-y-principios)
- [1. Topología del monorepo](#1-topología-del-monorepo)
- [2. Las tres apps](#2-las-tres-apps)
- [3. Paquetes compartidos](#3-paquetes-compartidos)
- [4. Capa de datos y patrones por app](#4-capa-de-datos-y-patrones-por-app)
- [5. Flujo de migraciones SQL](#5-flujo-de-migraciones-sql)
- [6. Edge Functions](#6-edge-functions)
- [7. Design system desde los mockups](#7-design-system-desde-los-mockups)
- [8. Convenciones de código](#8-convenciones-de-código)
- [9. Estrategia de testing](#9-estrategia-de-testing)
- [10. Git, ramas y CI/CD](#10-git-ramas-y-cicd)
- [11. Entorno y secretos](#11-entorno-y-secretos)
- [12. Definition of Done](#12-definition-of-done)
- [13. Orden de construcción del MVP](#13-orden-de-construcción-del-mvp)
- [14. Checklist y changelog](#14-checklist-y-changelog)

---

## 0. Propósito y principios

Esta guía traduce ~25,000 líneas de especificación en una forma concreta de trabajar. Reglas rectoras:

1. **El documento de arquitectura es la fuente de verdad; el código lo implementa.** Si el código y el doc difieren, se corrige el código (o se versiona el doc con justificación).
2. **Simplicidad sobre sofisticación** — equipo pequeño (Plan Maestro §1.4). Sin microservicios, sin abstracciones prematuras.
3. **RLS es sagrado** — ninguna ruta de código puede saltarse el aislamiento por tenant salvo el plano de plataforma con `service_role`.
4. **El español manda en el dominio** — igual que el SQL (`snake_case` español). El código de infraestructura puede ser inglés; las entidades de negocio, español.

---

## 1. Topología del monorepo

**pnpm workspaces + Turborepo.** Tres apps, paquetes compartidos, y Supabase como raíz de datos.

```
vim-pos/
├─ apps/
│  ├─ pos/             # POS operativo — offline-first, Dexie, tablet, → Capacitor (Fase 3)
│  ├─ admin/           # Admin del tenant — online, Server Components (config + reportes)
│  └─ platform/        # Panel super-admin de VIM — service_role, Fase 2 (doc 12)
├─ packages/
│  ├─ db/              # tipos generados de Supabase, factories de cliente, esquemas Zod
│  ├─ ui/              # design system extraído de los mockups (tokens + componentes)
│  └─ config/          # tsconfig base, eslint, tailwind preset compartidos
├─ supabase/
│  ├─ migrations/      # SQL extraído de docs 07-1A…1F + 12, numerado secuencial
│  ├─ functions/       # Edge Functions Deno (pin-login, stripe-webhook, …)
│  └─ seed.sql         # planes, roles, subtipos, paquetes de folios, Knock-Out
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

**Por qué monorepo con apps separadas:** el POS (offline, tablet, Capacitor) y el Admin (online, server-rendered) tienen runtimes incompatibles; forzarlos en una app complicaría Capacitor en Fase 3. Separarlos evita que un frente estorbe al otro, mientras `packages/db` y `packages/ui` impiden que tipos y diseño se desincronicen.

---

## 2. Las tres apps

| App | Runtime | Quién | Conexión | Empaque |
|---|---|---|---|---|
| **pos** | Cliente pesado, offline-first | Cajero/mesero/cocina en tablet | Opera sobre Dexie local; sincroniza por batch | Web (PWA) en MVP → **Capacitor** Fase 3 |
| **admin** | Server Components + Server Actions | Dueño/Admin del tenant | Online, Supabase server client | Web (Vercel) |
| **platform** | Server Actions, `service_role` | VIM (SUPER_ADMIN) | Online, fuera de RLS | Web interna (Fase 2) |

> En MVP se construyen **pos** y **admin**. `platform` arranca en Fase 2 (doc 12 §7); su provisioning en MVP es script + Supabase Studio.

---

## 3. Paquetes compartidos

### 3.1 `packages/db`

El contrato de datos. Contiene:

- **Tipos generados:** `supabase gen types typescript` → `database.types.ts`. Nunca se editan a mano; se regeneran tras cada migración.
- **Factories de cliente Supabase:**
  - `createBrowserClient()` — para componentes cliente (anon key, respeta RLS)
  - `createServerClient()` — para Server Components/Actions (anon key + cookies de sesión)
  - `createServiceClient()` — **solo** para `apps/platform` y Edge Functions (`service_role`, ignora RLS). Importarlo desde `pos`/`admin` debe fallar el lint.
- **Esquemas Zod:** validación de payloads (formularios, sync, webhooks) reutilizada en cliente y servidor.

### 3.2 `packages/ui`

El design system (ver §7). Componentes presentacionales sin lógica de datos, consumibles por las tres apps.

### 3.3 `packages/config`

`tsconfig` base, preset de Tailwind (tokens), reglas ESLint/Prettier. Una sola fuente para que las tres apps sean coherentes.

---

## 4. Capa de datos y patrones por app

> **Regla:** cada app accede a datos de la forma que corresponde a su runtime. No se mezclan paradigmas.

### 4.1 `admin` — Server-first

- **Lectura:** Server Components con `createServerClient()`. RLS filtra por el `tenant_id` del JWT (07-1F).
- **Escritura:** Server Actions que validan con Zod y llaman a Supabase / funciones SQL.
- **Estado de cliente:** mínimo. Para interactividad puntual, `TanStack Query` sobre el browser client.

### 4.2 `pos` — Offline-first

- **Toda la operación ocurre contra Dexie (IndexedDB), nunca directo a Supabase.** El cajero vende aunque no haya internet.
- **Capa repositorio:** módulos `repositories/*` que exponen `crearTicket`, `agregarItem`, `aplicarPago`, etc. Escriben en Dexie marcando `sync_status='pending'` (07-1C.2 §10).
- **Sincronización:** un `sync engine` recoge lo `pending`, lo envía a `sync_procesar_push()` y aplica resultados/conflictos.
- **Catálogo:** se descarga (pull) al iniciar sesión y se cachea; es solo-lectura offline (07-1C.2 §10.7).
- **Identidad:** sesión de dispositivo + token de empleado vía `pin-login` (07-1F).

### 4.3 `platform` — service_role

- Server Actions con `createServiceClient()`. Opera fuera de RLS (doc 12 §9).
- Toda acción sobre un tenant se registra en `super_admin_accesos`.

### 4.4 Regla de oro de seguridad

`createServiceClient()` y `SUPABASE_SERVICE_ROLE_KEY` **jamás** se importan ni se exponen en `pos` ni `admin` (ni en código cliente de `platform`). Se añade una regla de ESLint que prohíbe el import fuera de los paths permitidos.

---

## 5. Flujo de migraciones SQL

> **El SQL ya está escrito** en los docs 07-1A…1F y 12. La tarea es extraerlo a migraciones ejecutables, no reinventarlo.

### 5.1 Proceso

1. Crear `supabase/migrations/NNNN_descripcion.sql` numerado secuencial (timestamp del CLI o índice manual).
2. Extraer los bloques ```sql de cada documento **en orden de dependencias**:

   ```
   0001_extensiones_y_enums            (1A §2.3, §3.1, §5.1, §6.1, §7.x)
   0002_nucleo_tenants_planes_folios   (1A §3, incl. §3.9 folios)
   0003_sucursales_cajas_config        (1A §4)
   0004_usuarios_roles_permisos        (1A §5)
   0005_turnos_caja_arqueos            (1A §6)
   0006_auditoria_autorizaciones       (1A §7)
   0007_funciones_helper_triggers      (1A §8)
   0008_catalogo_inventario            (1B)
   0009_operacion_venta                (1C.1)
   0010_postventa_cfdi_sync            (1C.2)
   0011_verticales                     (1D)
   0012_reportes_cierres               (1E)
   0013_auth_hook_pin_login            (1F §3, §5.4)
   0014_provisioning_plataforma        (12 §4, §5, §9.2)
   ```
3. `supabase/seed.sql` aparte: seeds del sistema (1A §9 + §9.1.bis folios).
4. Desarrollo local: `supabase start` (stack local) → `supabase db reset` aplica migraciones + seed.
5. Tras cada migración: `supabase gen types` regenera `packages/db/database.types.ts`.

### 5.2 Reglas

- **Una migración nunca se edita una vez aplicada en remoto.** Cambios → nueva migración aditiva.
- **El hook de access token (1F §3) y la activación en `config.toml`** viajan en migración + config versionada.
- Toda migración debe dejar el RLS activo en sus tablas (verificado en CI, §10).

---

## 6. Edge Functions

`supabase/functions/<nombre>/index.ts` (Deno). Las del MVP/cercanas:

| Función | Propósito | Doc |
|---|---|---|
| `pin-login` | Verifica PIN y acuña JWT de empleado | 07-1F §5 |
| `stripe-webhook` | (Fase 3+) provisioning automático desde Stripe | 12 §3 |

- Corren con `service_role` (inyectado por Supabase). Nunca exponen la key.
- La lógica de negocio pesada vive en **funciones SQL** (`verificar_pin_login`, `crear_tenant_con_owner`); la Edge Function orquesta y firma.
- Validan entrada con Zod (compartido vía import del paquete o copia ligera, dado el aislamiento Deno).

---

## 7. Design system desde los mockups

Los 233 mockups (carpeta MOCKUPS) ya definen el lenguaje visual. **No se rediseña; se extrae.**

### 7.1 Tokens (a `packages/config` / preset Tailwind)

Tomados del CSS de los mockups (ej. P-059):

- **Tipografía:** `Inter Tight` (texto), `Sora` (display).
- **Acento:** `#E8502E` (+ hover `#CF4525`, soft `#FBF0EC`).
- **Tinta:** `#16161A` / `#5A5A60` / `#8E8E94`.
- **Semánticos:** success `#2E7D52`, warning `#9A6B12`, danger `#C0392B`, info `#2C5AA0`.
- **Espaciado:** escala 4/8/12/16/20/24/32. **Radios:** 4/6/8.

### 7.2 Componentes base (a `packages/ui`)

Extraer los recurrentes: `Button`, `IconButton`, `Modal`, `Toast`, `Tabs`, `TicketRow`, `CatalogCard`, `PinKeypad`, `NumericPad`, `StatusChip`. Presentacionales puros (sin fetch).

> **Regla:** un mockup HTML es el blueprint visual de su pantalla. El índice mockup ↔ pantalla está en el doc 08.

---

## 8. Convenciones de código

| Elemento | Convención | Ejemplo |
|---|---|---|
| Lenguaje | TypeScript `strict: true` | — |
| Archivos | `kebab-case` | `crear-ticket.ts`, `pin-keypad.tsx` |
| Componentes React | `PascalCase` | `PinKeypad`, `TicketRow` |
| Hooks | `useCamelCase` | `useTurnoActivo` |
| Dominio de negocio | español (igual que SQL) | `ticket`, `turno`, `sangria`, `folio` |
| Infra/utilidades | inglés ok | `formatCurrency`, `retry` |
| Server Actions | verbo + objeto, español | `aplicarPago`, `cerrarTurno` |
| Tipos | `PascalCase`, sufijo claro | `TicketRow`, `PagoInput` |
| Constantes | `SCREAMING_SNAKE` | `MAX_INTENTOS_PIN` |
| Formato/lint | Prettier + ESLint (preset en `packages/config`) | — |

- **Sin `any`.** Si algo es desconocido, `unknown` + validación Zod.
- **Dinero:** nunca `float`. Enteros en centavos o `string` decimal validado; coherente con `numeric(12,2)` del SQL.
- **Fechas:** UTC en datos; conversión a zona del negocio solo en presentación (coherente con D6).

---

## 9. Estrategia de testing

> **Nivel pragmático (decidido):** cubrir lo que duele si se rompe, sin frenar el MVP.

### 9.1 Qué se prueba (obligatorio)

1. **RLS / aislamiento multi-tenant** — tests que verifican que un JWT del tenant A **no** puede leer/escribir filas del tenant B en **ninguna** tabla. Es la prueba no negociable. Se corren contra Supabase local (pgTAP o scripts con dos sesiones).
2. **Funciones SQL de dinero y estado** — totales del ticket (`recalcular_totales_ticket`), cierres X/Z, consumo de folios (`consumir_folio_cfdi`), arqueo, transiciones de estado. Tests directos a la función con casos límite.
3. **Ruta crítica E2E (Playwright)** — un solo flujo: `login (PIN) → abrir turno → vender → cobrar → cierre`. Si eso pasa, el corazón del POS funciona.

### 9.2 Qué NO se prueba (en MVP)

- Cobertura unitaria exhaustiva de UI.
- Flujos secundarios E2E (se prueban manualmente).

### 9.3 Herramientas

- **Vitest** — unit (utilidades, repositorios, validación Zod).
- **pgTAP** o scripts SQL — RLS y funciones de BD.
- **Playwright** — la ruta crítica.

---

## 10. Git, ramas y CI/CD

### 10.1 Git

- **Trunk-based** con ramas cortas: `feat/...`, `fix/...`, `chore/...`. Se mergean rápido a `main`.
- **Conventional Commits:** `feat(pos): teclado de PIN`, `fix(admin): total con IVA`. Habilita changelog automático.
- Nunca se commitea con hooks de seguridad desactivados ni con secretos.

### 10.2 CI (GitHub Actions)

Pipeline en cada PR:

```
1. install (pnpm)        4. test (vitest + pgTAP + playwright ruta crítica)
2. lint (eslint)         5. check migraciones (db reset en Supabase local sin error)
3. typecheck (tsc)       6. verificar RLS activo en todas las tablas nuevas
```

### 10.3 CD

- **admin** y **platform** → Vercel (preview por PR, producción en `main`).
- **pos** → build PWA (MVP); pipeline Capacitor en Fase 3.
- Migraciones a producción: `supabase db push` controlado (no automático en cada merge; paso deliberado).

---

## 11. Entorno y secretos

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | todas las apps | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | todas las apps | pública, respeta RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** `platform` (servidor) + Edge Functions | **jamás** en cliente |
| `SUPABASE_JWT_SECRET` | Edge Function `pin-login` | firma tokens de empleado (1F §7.2) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Edge Function `stripe-webhook` (Fase 3+) | — |
| `FACTURAMA_API_KEY` | Edge Function de timbrado | Multiemisor |

- `.env.local` por app (gitignored). Secretos de Edge Functions vía `supabase secrets set`.
- Regla de ESLint/CI: detectar `SERVICE_ROLE`/`JWT_SECRET` importados en bundles cliente → falla el build.

---

## 12. Definition of Done

Una tarea está terminada cuando:

- [ ] `tsc` sin errores y ESLint limpio.
- [ ] Tests de su área en verde (RLS si tocó tablas; función de dinero si tocó cálculos; E2E si tocó la ruta crítica).
- [ ] Si tocó esquema: migración aditiva aplicada en local + tipos regenerados.
- [ ] RLS sigue activo y el test cross-tenant pasa.
- [ ] Ningún `service_role`/secreto en código cliente.
- [ ] Coherente con el doc de arquitectura correspondiente (o el doc se versionó).

---

## 13. Orden de construcción del MVP

Secuencia recomendada una vez scaffoldeado el monorepo:

1. **Migraciones 1A** + seed + **tests RLS cross-tenant** (sin esto, nada es confiable).
2. **`packages/db`** (tipos + factories) y **`packages/ui`** (tokens + componentes base).
3. **Auth (1F):** hook de access token + Edge Function `pin-login` + login de dispositivo.
4. **`apps/admin`** primero las pantallas de configuración (catálogo, usuarios, sucursales — P-128…P-176).
5. **Migraciones 1B/1C** + funciones de venta y sus tests de dinero.
6. **`apps/pos`:** capa Dexie + repositorios + pantalla de venta (P-059…P-077) **online primero**, luego cola de sync.
7. **Cierres X/Z** (1E) + ruta crítica E2E completa.
8. **CFDI básico** (1C.2 §6) + consumo de folios.
9. Provisioning de Knock-Out vía script (12 §7) y **venta de prueba real**.

> Offline robusto, KDS interactivo y `apps/platform` son Fase 2/3 (Plan Maestro §8).

---

## 14. Checklist y changelog

### 14.1 Checklist de arranque del repo

- [ ] Monorepo pnpm + Turborepo con `apps/{pos,admin,platform}` y `packages/{db,ui,config}`
- [ ] Supabase local corriendo (`supabase start`)
- [ ] Migración 0001 + seed aplicados sin error
- [ ] `packages/db` genera tipos desde el schema
- [ ] Tokens de `packages/ui` extraídos de los mockups
- [ ] Regla ESLint que prohíbe `service_role` en cliente
- [ ] GitHub Actions con lint/typecheck/test/migraciones
- [ ] Vercel conectado para `admin` (preview + prod)

### 14.2 Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Guía inicial. Monorepo de 3 apps (pos/admin/platform) + 3 paquetes, patrones de datos por app, flujo de migraciones desde los docs 07/12, design system desde mockups, convenciones TS, testing pragmático (RLS + dinero + ruta crítica), Git/CI/CD, secretos y orden de construcción del MVP. |

---

> **Nota final:** esta guía es práctica y evoluciona con el proyecto. Si una convención estorba en la realidad del desarrollo, se cambia aquí con justificación. Lo único inamovible: el aislamiento por tenant (RLS) y que `service_role` nunca toque el cliente.
