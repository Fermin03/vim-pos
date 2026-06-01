# VIM POS

POS SaaS multi-vertical y multi-tenant para restauranteros mexicanos.

Monorepo (pnpm + Turborepo). La **especificación completa** vive en
`../RECURSOS PARA DESARROLLO/` (24 documentos). Empieza por el Plan Maestro
(`00-PLAN-MAESTRO-VIM-POS.md`).

## Estructura

```
vim-pos/
├─ apps/
│  ├─ pos/         # POS operativo — offline-first, Dexie, tablet Android (→ Capacitor Fase 3)
│  ├─ admin/       # Admin del tenant — online, Server Components
│  └─ platform/    # Panel super-admin de VIM — service_role (Fase 2)
├─ packages/
│  ├─ db/          # tipos generados de Supabase, factories de cliente, Zod
│  ├─ ui/          # design system (tokens + componentes) extraído de los mockups
│  └─ config/      # tsconfig base, preset Tailwind (tokens), ESLint
└─ supabase/
   ├─ migrations/  # SQL extraído de los docs 07-1A…1F + 12
   ├─ functions/   # Edge Functions Deno (pin-login, cfdi-*, backup-runner)
   └─ seed.sql     # planes, roles, paquetes de folios, Knock-Out
```

## Requisitos

- Node 20+, pnpm 9+
- Supabase CLI (`supabase`)
- Docker (para el stack local de Supabase)

## Arranque (cuando existan las cuentas)

```bash
pnpm install
supabase start            # stack local
supabase db reset         # aplica migraciones + seed
pnpm --filter @vim/db gen-types
pnpm dev                  # apps en paralelo (turbo)
```

## Reglas de oro

- El **documento de arquitectura es la fuente de verdad**; el código lo implementa (doc 11).
- **RLS sagrado**: `service_role` jamás en cliente (pos/admin). Solo en platform/Edge Functions.
- Español en el dominio (igual que el SQL); convenciones en doc 11 §8.
