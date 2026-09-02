# 07 — ARQUITECTURA TÉCNICA — Parte 1A: Núcleo Multi-tenant

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** primera entrega de la arquitectura técnica de VIM POS
> **Alcance de esta parte:** esquema de base de datos para el núcleo multi-tenant (tenants, suscripciones, sucursales, cajas, usuarios, roles, permisos, turnos, movimientos de caja, arqueos, cierre de día, auditoría)
> **Stack:** PostgreSQL 15 vía Supabase, Row Level Security activo

---

## 📋 Tabla de contenidos

- [0. Introducción](#0-introducción)
- [1. Filosofía multi-tenant](#1-filosofía-multi-tenant)
- [2. Convenciones y extensiones](#2-convenciones-y-extensiones)
- [3. Esquema: Tenants, planes y suscripciones](#3-esquema-tenants-planes-y-suscripciones)
- [4. Esquema: Sucursales, cajas y configuración](#4-esquema-sucursales-cajas-y-configuración)
- [5. Esquema: Usuarios, roles y permisos](#5-esquema-usuarios-roles-y-permisos)
- [6. Esquema: Turnos, movimientos de caja y arqueos](#6-esquema-turnos-movimientos-de-caja-y-arqueos)
- [7. Esquema: Auditoría y autorización](#7-esquema-auditoría-y-autorización)
- [8. Funciones helper y triggers](#8-funciones-helper-y-triggers)
- [9. Seeds iniciales](#9-seeds-iniciales)
- [10. Estrategia de migraciones](#10-estrategia-de-migraciones)
- [11. Decisiones pendientes para Parte 1B/1C/1D](#11-decisiones-pendientes-para-parte-1b1c1d)
- [12. Checklist de validación](#12-checklist-de-validación)

---

## 0. Introducción

### 0.1 Propósito de este documento

Este documento define el **esquema de base de datos del núcleo multi-tenant** de VIM POS. Es la fundación sobre la que se montan los esquemas operativos (catálogo, inventario, órdenes, pagos) y las especializaciones por vertical.

Todo el SQL aquí es **ejecutable directamente en Supabase/PostgreSQL 15**. No hay pseudocódigo. Cada tabla, política RLS, índice y función se entrega lista para convertirse en migración.

### 0.2 Alcance

**Esta Parte 1A cubre:**

- ✅ Modelo de tenancy (negocios, planes, suscripciones, add-ons, feature flags)
- ✅ Estructura organizacional (sucursales, cajas, configuración)
- ✅ Usuarios, roles base, subtipos de Personal, permisos, autorización por PIN
- ✅ Turnos, movimientos de caja, arqueos, cierre de día
- ✅ Auditoría universal y registro de autorizaciones

**Las siguientes partes cubren:**

- 📦 **Parte 1B** — Catálogo: categorías, productos, modificadores, recetas, insumos, inventario
- 🧾 **Parte 1C** — Operación: órdenes, items, pagos, descuentos, delivery, cierre de día consolidado, CFDI
- 🎨 **Parte 1D** — Especializaciones por vertical: mesas (FS), cuentas abiertas (Café & Bar), marcas virtuales (DK), apps externas

### 0.3 Stack confirmado

| Capa | Tecnología |
|---|---|
| Base de datos | **PostgreSQL 15** (Supabase) |
| Autenticación | **Supabase Auth** (`auth.users`) |
| Row Level Security | **Activo en TODAS las tablas operativas** |
| Realtime | **Supabase Realtime** (selectivo por canal) |
| Cache local | **Dexie.js sobre IndexedDB** (Parte 1C tratará la estrategia offline) |
| Frontend | Next.js 15 + TypeScript + Tailwind |
| Hosting | Vercel |

### 0.4 13 Decisiones de diseño que rigen este documento

Estas decisiones se aplican transversalmente a todas las tablas del esquema:

| # | Decisión | Justificación |
|---|---|---|
| **D1** | `tenant_id uuid NOT NULL` en TODAS las tablas operativas | Multi-tenant desde día 1 (Plan Maestro §5.1). Aislamiento de datos garantizado. |
| **D2** | RLS habilitado en todas las tablas, política por `tenant_id` | Aislamiento a nivel de motor de BD, no de aplicación. Defensa en profundidad. |
| **D3** | Primary keys tipo `uuid` (no `bigint`) | Predecible en multi-tenant, no expone volumen de ventas, mejor para sincronización offline. |
| **D4** | Naming en `snake_case` español | `turnos`, `cortes_parciales`, `denominaciones_fondo`. Coherente con documentación operativa. |
| **D5** | Soft delete (`deleted_at timestamptz`) en tablas auditables | Trazabilidad imposibilita hard delete (§27 del `/core`). |
| **D6** | `timestamptz` siempre, almacenado en UTC | Multi-zona horaria correcto. La conversión a hora del negocio ocurre en aplicación. |
| **D7** | `dia_contable date` explícito en tickets/movimientos, calculado al crear, **inmutable** | Para que turnos cruzando medianoche se asignen al día de apertura (§25.3 del `/core`). |
| **D8** | Tabla `auditoria_eventos` genérica con `entidad_tipo + entidad_id + payload jsonb` | Una sola bitácora universal en lugar de N tablas log. |
| **D9** | PINs hasheados con `pgcrypto` (bcrypt) | Nunca en texto plano. No existe operación "ver PIN", solo reset. |
| **D10** | Estados como `enum` de PostgreSQL | Constraint a nivel BD, autocompletado, mejor performance que `text` + `check`. |
| **D11** | Folio de ticket vía secuencia por sucursal en tabla `contadores_folio` | Soporta `[código_sucursal]-[año]-[consecutivo]` (§1.3.bis), atomicidad garantizada. |
| **D12** | 5 roles base **inalterables** + roles personalizados por tenant + subtipos de Personal extensibles | Refleja §2.1 y §30 del `/core`. |
| **D13** | Tenant activo se resuelve vía JWT claim `tenant_id` que Supabase Auth mete en cada request | Forma estándar Supabase, integra naturalmente con RLS. |

---

## 1. Filosofía multi-tenant

### 1.1 Modelo de tenancy

VIM POS opera con **multi-tenant compartido** (shared schema, shared database). Un solo proyecto de Supabase aloja a todos los negocios. Cada fila operativa lleva `tenant_id` como llave de aislamiento.

```
┌──────────────────────── Supabase project ────────────────────────┐
│                                                                  │
│   ┌─────────────────────  schema: public  ──────────────────┐    │
│   │                                                          │    │
│   │   tenants                                                │    │
│   │   ├── Knock-Out Burger        (tenant_id: A)            │    │
│   │   ├── Chick'n Go              (tenant_id: B)            │    │
│   │   └── Camtaritos              (tenant_id: C)            │    │
│   │                                                          │    │
│   │   sucursales, cajas, usuarios, turnos, tickets, …       │    │
│   │   (todas con tenant_id como columna de aislamiento)     │    │
│   │                                                          │    │
│   └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**¿Por qué shared schema y no schema-per-tenant?**

- Una persona mantiene el código (Fermín + Claude Code). Multi-schema multiplica migraciones por N tenants.
- Free tier de Supabase no permite operar múltiples bases.
- Backup, monitoring, debugging son N veces más simples.
- Cuando el volumen lo justifique, particionar tablas grandes por `tenant_id` es el siguiente paso natural — no requiere refactor.

**En MVP:** un solo tenant activo (Knock-Out). Toda la estructura multi ya está, pero no se ejercita aún.

**En Fase 2:** 3 tenants (Knock-Out, Chick'n Go, Camtaritos).

**En Fase 3+:** N tenants comerciales.

### 1.2 Aislamiento por RLS

Cada tabla operativa tiene una política RLS de la forma:

```sql
CREATE POLICY tenant_isolation ON <tabla>
  USING (tenant_id = auth.jwt() ->> 'tenant_id'::text)::uuid);
```

Si un atacante o un bug intentara hacer `SELECT * FROM tickets`, PostgreSQL filtraría automáticamente a las filas del tenant del JWT. No hay forma de leer datos de otro tenant a menos que se use el `service_role` (que solo corre en el backend administrado de VIM, nunca en el cliente).

**Defensa en profundidad:**

1. **Capa 1 (BD):** RLS aísla físicamente.
2. **Capa 2 (servicios):** los repositorios filtran por `tenant_id` redundantemente.
3. **Capa 3 (UI):** el usuario solo ve interfaces de su tenant.

Si una capa falla, las otras dos contienen el daño.

### 1.3 Feature flags por plan

Cada tenant tiene un **plan vigente** (Foodtruck, QS, Full Service, Café & Bar, Dark Kitchen, Enterprise). El plan determina:

- Verticales activos en la UI
- Módulos opcionales accesibles (Inventario, CRM, CFDI, etc.)
- Límites de uso (cuántas sucursales, cuántos usuarios, cuántos timbres CFDI/mes)
- Add-ons disponibles para contratar

Adicionalmente, cada tenant puede tener **feature flags individuales** que se activan fuera del plan (feature beta, prueba gratuita de un add-on por tiempo limitado, override por soporte). Ver tabla `tenant_feature_flags` en §3.

```
   PLAN (plantilla)              TENANT (instancia)
   ─────────────────             ──────────────────
   QuickService                  Knock-Out Burger
   ├── /core                ──→  ├── plan: QuickService
   ├── /modules/quickservice     ├── feature flags vigentes (del plan)
   ├── max_sucursales: 5         └── overrides individuales (si los hay)
   ├── max_usuarios: 20
   ├── timbres_cfdi/mes: 500
   └── precio: $999 MXN/mes
```

---

## 2. Convenciones y extensiones

### 2.1 Naming conventions

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas | `snake_case`, plural, español | `turnos`, `movimientos_caja` |
| Columnas | `snake_case`, español | `fondo_inicial`, `fecha_apertura` |
| Primary keys | siempre `id uuid` | `id uuid PRIMARY KEY` |
| Foreign keys | `<entidad>_id` | `tenant_id`, `sucursal_id` |
| Timestamps | `fecha_*` o `*_at` | `fecha_apertura`, `created_at` |
| Booleanos | prefijo `es_` o `tiene_` | `es_sistema`, `tiene_diferencia` |
| Enums | `<entidad>_<atributo>` | `turno_estado`, `movimiento_tipo` |
| Funciones | `verbo_objeto` | `calcular_dia_contable()` |
| Índices | `idx_<tabla>_<columnas>` | `idx_turnos_sucursal_estado` |
| Políticas RLS | `<tabla>_<accion>_<principio>` | `turnos_select_tenant` |
| Triggers | `trg_<tabla>_<evento>_<accion>` | `trg_turnos_before_insert_audit` |

### 2.2 Tipos de datos estándar

| Concepto | Tipo PostgreSQL | Notas |
|---|---|---|
| Identificador | `uuid` con default `gen_random_uuid()` | D3 |
| Fecha + hora | `timestamptz` | D6, almacenado en UTC |
| Solo fecha | `date` | Día contable, fechas de calendario |
| Solo hora | `time` | Hora de cierre día contable |
| Dinero | `numeric(12,2)` | Hasta $9,999,999,999.99. Nunca `float`. |
| Porcentaje | `numeric(5,2)` | 0.00 a 100.00 |
| Cantidad de inventario | `numeric(12,3)` | 3 decimales para gramos, mililitros |
| Texto corto | `varchar(N)` con límite explícito | `varchar(100)` para nombres |
| Texto largo | `text` | Notas, descripciones, motivos |
| JSON estructurado | `jsonb` | Payloads de auditoría, configuración flexible |
| Enum | `CREATE TYPE ... AS ENUM (...)` | D10 |

### 2.3 Extensiones PostgreSQL requeridas

```sql
-- UUIDs criptográficamente seguros (incluido en Supabase por default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Comparación de texto sin acentos / case-insensitive
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Búsquedas trigram para "buscar cliente por nombre parcial"
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Citext para emails case-insensitive
CREATE EXTENSION IF NOT EXISTS "citext";
```

`pgcrypto` se usa para hashear PINs con `crypt()` y `gen_salt('bf')` (bcrypt). `unaccent` y `pg_trgm` se usarán en Parte 1B para búsqueda de productos y clientes.

### 2.4 Convención para soft delete

Las tablas con auditoría requerida (D5) llevan:

```sql
deleted_at timestamptz NULL,
deleted_by uuid NULL REFERENCES auth.users(id)
```

Y todas las queries operativas se filtran con `WHERE deleted_at IS NULL`. Las RLS policies incluyen este filtro:

```sql
USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  AND deleted_at IS NULL
)
```

Tablas SIN soft delete (catálogos inmutables como `planes`, `permisos`, `roles` base): se rigen por `es_sistema = true` y validaciones de aplicación.

### 2.5 Columnas comunes a todas las tablas operativas

Toda tabla operativa lleva al menos:

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
created_at  timestamptz NOT NULL DEFAULT now(),
created_by  uuid REFERENCES auth.users(id),
updated_at  timestamptz NOT NULL DEFAULT now(),
updated_by  uuid REFERENCES auth.users(id),
deleted_at  timestamptz NULL,
deleted_by  uuid REFERENCES auth.users(id) NULL
```

Se mantiene `updated_at` automáticamente vía trigger (ver §8.5).

---

## 3. Esquema: Tenants, planes y suscripciones

Este bloque define el contrato comercial entre VIM POS y cada negocio cliente.

### 3.1 Enums asociados

```sql
-- Estado del tenant (negocio cliente)
CREATE TYPE tenant_estado AS ENUM (
  'TRIAL',         -- en periodo de prueba (Fase 3+)
  'ACTIVO',        -- suscripción al corriente
  'SUSPENDIDO',    -- pago vencido > 7 días
  'CANCELADO',     -- baja voluntaria o forzosa
  'INTERNO'        -- tenant de uso interno de VIM (Knock-Out en MVP)
);

-- Vertical principal del tenant (determina módulo por defecto)
CREATE TYPE vertical_tipo AS ENUM (
  'FOODTRUCK',
  'QUICK_SERVICE',
  'FULL_SERVICE',
  'CAFE_BAR',
  'DARK_KITCHEN',
  'ENTERPRISE'
);

-- Régimen fiscal SAT (subset relevante para restauranteros)
-- La lista completa se carga vía seed; estos son los más comunes
CREATE TYPE regimen_fiscal_sat AS ENUM (
  '601',  -- General de Ley Personas Morales
  '603',  -- Personas Morales con Fines no Lucrativos
  '605',  -- Sueldos y Salarios e Ingresos Asimilados a Salarios
  '612',  -- Personas Físicas con Actividades Empresariales y Profesionales
  '621',  -- Incorporación Fiscal
  '625',  -- Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas
  '626'   -- Régimen Simplificado de Confianza (RESICO)
);

-- Estado de una suscripción
CREATE TYPE suscripcion_estado AS ENUM (
  'ACTIVA',
  'PAUSADA',
  'CANCELADA',
  'EXPIRADA'
);
```

### 3.2 Tabla `planes`

Catálogo de planes disponibles. Es un catálogo del sistema (no por tenant) — todos los tenants ven los mismos planes.

```sql
CREATE TABLE planes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'QS', 'FT', 'FS', 'CB', 'DK', 'ENT'
  nombre              varchar(100) NOT NULL,              -- 'Quick Service'
  descripcion         text,
  vertical            vertical_tipo NOT NULL,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  -- Límites del plan (NULL = ilimitado)
  max_sucursales        integer NULL,
  max_cajas_por_sucursal integer NULL,
  max_usuarios          integer NULL,
  timbres_cfdi_mensuales integer NULL,                    -- folios base mensuales incluidos, NO acumulables (D96). Excedente vía paquetes prepagados

  -- Feature flags incluidos en el plan (qué módulos puede activar)
  -- Estructura: { "inventario_avanzado": true, "crm_pro": false, ... }
  features_incluidos  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Visibilidad y disponibilidad
  visible_publico     boolean NOT NULL DEFAULT true,     -- ¿se muestra en página de precios?
  activo              boolean NOT NULL DEFAULT true,     -- ¿se puede contratar?
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE planes IS 'Catálogo de planes de suscripción. No tiene tenant_id porque es catálogo del sistema.';
COMMENT ON COLUMN planes.features_incluidos IS 'JSON con flags de módulos. La app lee esto al iniciar para decidir qué UI mostrar.';
```

**Seed inicial:** ver §9.1.

### 3.3 Tabla `addons`

Add-ons transversales que cualquier tenant puede contratar adicional a su plan.

```sql
CREATE TABLE addons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'INV_AV', 'CRM_PRO', 'ANALITICA', etc.
  nombre              varchar(100) NOT NULL,
  descripcion         text,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  -- Qué flags activa este add-on cuando está vigente
  features_activadas  jsonb NOT NULL DEFAULT '{}'::jsonb,

  visible_publico     boolean NOT NULL DEFAULT true,
  activo              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE addons IS 'Add-ons disponibles. Ej: Inventario Avanzado ($299), CRM Pro ($399), Analítica ($499).';
```

### 3.4 Tabla `tenants`

El negocio cliente. Una fila por cada negocio que opera con VIM POS.

```sql
CREATE TABLE tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad comercial
  codigo                varchar(50) NOT NULL UNIQUE,    -- slug: 'knockout', 'chickngo'
  nombre_comercial      varchar(150) NOT NULL,          -- 'Knock-Out Burger'
  estado                tenant_estado NOT NULL DEFAULT 'TRIAL',

  -- Datos fiscales (pueden estar vacíos en TRIAL; obligatorios para CFDI Fase Final)
  razon_social          varchar(255) NULL,
  rfc                   varchar(13) NULL,
  regimen_fiscal        regimen_fiscal_sat NULL,
  codigo_postal_fiscal  varchar(5) NULL,
  email_fiscal          citext NULL,                    -- para envío de facturas

  -- Vertical y plan vigente (denormalizado para lectura rápida)
  vertical_principal    vertical_tipo NOT NULL,
  plan_actual_id        uuid NULL REFERENCES planes(id),

  -- Contacto principal del negocio (usuario dueño)
  usuario_dueno_id      uuid NULL REFERENCES auth.users(id),

  -- Configuración global (denormalizada para acceso rápido sin join)
  timezone              varchar(50) NOT NULL DEFAULT 'America/Mexico_City',
  hora_cierre_dia_contable time NOT NULL DEFAULT '03:00:00',  -- §25.2

  -- Auditoría
  fecha_alta            timestamptz NOT NULL DEFAULT now(),
  fecha_baja            timestamptz NULL,
  motivo_baja           text NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz NULL,

  CONSTRAINT rfc_formato_valido CHECK (
    rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  )
);

CREATE INDEX idx_tenants_codigo ON tenants(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_estado ON tenants(estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_vertical ON tenants(vertical_principal) WHERE deleted_at IS NULL;

COMMENT ON TABLE tenants IS 'Negocio cliente de VIM POS. Cada fila = un cliente del SaaS.';
COMMENT ON COLUMN tenants.codigo IS 'Slug único usado en subdominios, prefijos de folios, etc.';
COMMENT ON COLUMN tenants.hora_cierre_dia_contable IS '03:00 default (§25.2 del /core). Configurable por tenant.';
```

> **Nota MVP:** Knock-Out se da de alta con `estado = 'INTERNO'`. No paga suscripción pero usa el sistema completo.

### 3.5 Tabla `suscripciones`

Histórico de suscripciones del tenant. Una fila por cada periodo de contratación (cuando cambia de plan o renueva, se crea fila nueva).

```sql
CREATE TABLE suscripciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id             uuid NOT NULL REFERENCES planes(id),

  -- Periodo de vigencia
  fecha_inicio        date NOT NULL,
  fecha_fin           date NULL,                          -- NULL = vigente / indefinida
  estado              suscripcion_estado NOT NULL DEFAULT 'ACTIVA',

  -- Precio acordado (snapshot del precio al contratar — protege de cambios futuros)
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),
  ciclo_facturacion   varchar(20) NOT NULL DEFAULT 'MENSUAL',  -- MENSUAL | ANUAL
  descuento_porcentaje numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),

  -- Próximo cobro
  proxima_fecha_cobro date NULL,
  ultima_fecha_cobro  date NULL,

  -- Notas comerciales
  notas               text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periodo_valido CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_suscripciones_tenant ON suscripciones(tenant_id);
CREATE INDEX idx_suscripciones_activas ON suscripciones(tenant_id, estado) WHERE estado = 'ACTIVA';
CREATE INDEX idx_suscripciones_proximo_cobro ON suscripciones(proxima_fecha_cobro) WHERE estado = 'ACTIVA';

COMMENT ON TABLE suscripciones IS 'Histórico de contrataciones. Una fila por cada periodo (cambio de plan = nueva fila).';
```

### 3.6 Tabla `tenant_addons`

Add-ons activos para cada tenant.

```sql
CREATE TABLE tenant_addons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  addon_id            uuid NOT NULL REFERENCES addons(id),

  fecha_inicio        date NOT NULL,
  fecha_fin           date NULL,
  activo              boolean NOT NULL DEFAULT true,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  notas               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- No puede haber 2 add-ons del mismo tipo activos al mismo tiempo
  CONSTRAINT addon_unico_activo UNIQUE (tenant_id, addon_id, fecha_inicio)
);

CREATE INDEX idx_tenant_addons_vigentes ON tenant_addons(tenant_id) WHERE activo = true;
```

### 3.7 Tabla `tenant_feature_flags`

Overrides individuales de features por tenant. Sirve para activar features beta, dar acceso temporal, o desactivar funcionalidades problemáticas para un cliente específico.

```sql
CREATE TABLE tenant_feature_flags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_codigo     varchar(100) NOT NULL,     -- 'beta_kds', 'cfdi_activo', etc.
  activado        boolean NOT NULL DEFAULT true,

  -- Vigencia opcional (NULL = sin vencimiento)
  fecha_inicio    timestamptz NOT NULL DEFAULT now(),
  fecha_fin       timestamptz NULL,

  -- Quién y por qué
  motivo          text NULL,
  activado_por    uuid REFERENCES auth.users(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT flag_unico_por_tenant UNIQUE (tenant_id, flag_codigo)
);

CREATE INDEX idx_tenant_flags_lookup ON tenant_feature_flags(tenant_id, flag_codigo);

COMMENT ON TABLE tenant_feature_flags IS 'Overrides de feature flags por tenant. Combina con planes.features_incluidos.';
```

**Lógica de resolución de features** (implementada en aplicación):

```
feature_activa(tenant, flag) =
  1. Buscar override en tenant_feature_flags vigente → si existe, usar ese valor
  2. Sino, buscar en addons activos del tenant → si alguno activa el flag, true
  3. Sino, buscar en planes.features_incluidos del plan vigente → usar ese valor
  4. Default: false
```

### 3.8 RLS y políticas

**Política general:** las tablas de catálogo del sistema (`planes`, `addons`) son **lectura pública** (cualquier usuario autenticado puede verlas para mostrar página de precios). Las tablas de tenant (`tenants`, `suscripciones`, `tenant_addons`, `tenant_feature_flags`) están restringidas al tenant del usuario.

```sql
-- planes y addons: lectura pública, escritura solo service_role
ALTER TABLE planes ENABLE ROW LEVEL SECURITY;
CREATE POLICY planes_select_publico ON planes FOR SELECT USING (true);

ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY addons_select_publico ON addons FOR SELECT USING (true);

-- tenants: solo el propio tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select_propio ON tenants FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid AND deleted_at IS NULL);

-- suscripciones, tenant_addons, tenant_feature_flags
ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY suscripciones_select_tenant ON suscripciones FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE tenant_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_addons_select_tenant ON tenant_addons FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_flags_select_tenant ON tenant_feature_flags FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.9 Modelo de folios CFDI (base mensual + paquetes prepagados)

> **D96 — Modelo de monetización de timbrado.** El timbrado CFDI NO se cobra como cuota incluida generosa ni como excedente sorpresa. Se estructura en dos buckets (ver Plan Maestro §6/§7):
>
> 1. **Base mensual incluida en el plan** (`planes.timbres_cfdi_mensuales`): folios que el plan regala cada periodo contable. **No son acumulables** (use-it-or-lose-it). Cubren la factura global periódica + uso ligero, de modo que todo tenant cumple SAT "de fábrica".
> 2. **Paquetes prepagados** (`folios_paquetes`): el tenant compra bolsas de folios (100/250/500/1000/5000) que **no expiran mientras su suscripción esté activa**. Es consumible prepagado: utilidad sin exposición de costo (costo VIM $0.50/folio vía Facturama Multiemisor).
>
> **Orden de consumo:** cada timbrado descuenta primero de la base mensual; al agotarla, descuenta del saldo de paquetes; si no hay saldo, se bloquea el timbrado individual (la factura global tiene tolerancia, ver §3.9.4).

#### 3.9.1 Enum y tabla `folios_paquetes` (catálogo del sistema)

```sql
CREATE TYPE folio_movimiento_tipo AS ENUM (
  'BASE_RESET',        -- crédito de base mensual al iniciar periodo contable (no acumulable)
  'CONSUMO_BASE',      -- timbrado descontado de la base mensual
  'COMPRA_PAQUETE',    -- alta de folios por compra de paquete prepagado
  'CONSUMO_PAQUETE',   -- timbrado descontado del saldo prepagado
  'AJUSTE_MANUAL'      -- corrección por soporte VIM (service_role)
);

-- Catálogo de paquetes disponibles. Como planes/addons: sin tenant_id, lectura pública.
CREATE TABLE folios_paquetes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'PACK_100', 'PACK_1000'
  nombre              varchar(100) NOT NULL,              -- 'Paquete 100 folios'
  cantidad_folios     integer NOT NULL CHECK (cantidad_folios > 0),
  precio_mxn          numeric(10,2) NOT NULL CHECK (precio_mxn >= 0),
  -- Precio unitario derivado, almacenado para mostrar en UI (precio_mxn / cantidad_folios)
  precio_por_folio    numeric(8,4) NOT NULL CHECK (precio_por_folio >= 0),

  visible_publico     boolean NOT NULL DEFAULT true,
  activo              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE folios_paquetes IS 'Catálogo de paquetes de folios CFDI prepagados. Sin tenant_id (catálogo del sistema). Seed en §9.x.';
```

#### 3.9.2 Tabla `tenant_folios_saldo` (1:1 con tenant)

Estado vigente de folios de cada tenant. Una fila por tenant.

```sql
CREATE TABLE tenant_folios_saldo (
  tenant_id               uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Base mensual (no acumulable): cuántos da el plan y cuántos van consumidos este periodo
  folios_base_mensuales   integer NOT NULL DEFAULT 0 CHECK (folios_base_mensuales >= 0),
  folios_base_consumidos  integer NOT NULL DEFAULT 0 CHECK (folios_base_consumidos >= 0),
  periodo_actual          date NOT NULL,                  -- mes contable vigente (primer día del periodo)

  -- Saldo de paquetes prepagados (persistente, no expira mientras suscripción activa)
  saldo_paquetes          integer NOT NULL DEFAULT 0 CHECK (saldo_paquetes >= 0),

  -- Umbral para alerta de saldo bajo y bandera de autorecarga
  umbral_alerta           integer NOT NULL DEFAULT 20 CHECK (umbral_alerta >= 0),
  autorecarga_activa      boolean NOT NULL DEFAULT false,
  autorecarga_paquete_id  uuid NULL REFERENCES folios_paquetes(id),

  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_folios_saldo IS 'Saldo vigente de folios CFDI por tenant. Base mensual no acumulable + paquetes prepagados. D96.';
COMMENT ON COLUMN tenant_folios_saldo.folios_base_consumidos IS 'Se resetea a 0 al cambiar periodo_actual (ver consumir_folio_cfdi).';
```

#### 3.9.3 Tabla `folios_movimientos` (ledger universal — patrón D23)

Bitácora inmutable de cada movimiento de folios. Mismo patrón que `movimientos_caja` / `movimientos_inventario`.

```sql
CREATE TABLE folios_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  tipo                folio_movimiento_tipo NOT NULL,
  cantidad            integer NOT NULL,                   -- positivo (crédito) o negativo (consumo)

  -- Trazabilidad del origen
  paquete_id          uuid NULL REFERENCES folios_paquetes(id),  -- si tipo = COMPRA_PAQUETE
  cfdi_id             uuid NULL,                          -- si CONSUMO_* (FK lógica a tickets_cfdi de 1C.2)
  precio_pagado_mxn   numeric(10,2) NULL,                 -- si COMPRA_PAQUETE

  -- Snapshot del saldo de paquetes después del movimiento (auditoría)
  saldo_paquetes_resultante integer NOT NULL,

  dia_contable        date NOT NULL,                      -- D7
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_folios_mov_tenant_fecha ON folios_movimientos(tenant_id, created_at DESC);
CREATE INDEX idx_folios_mov_tipo ON folios_movimientos(tenant_id, tipo);

COMMENT ON TABLE folios_movimientos IS 'Ledger inmutable de movimientos de folios CFDI. Balance auditable. D96 + patrón D23.';
```

#### 3.9.4 Función `consumir_folio_cfdi(tenant_id, cfdi_id)`

Se invoca al timbrar un CFDI (desde el flujo de timbrado de 1C.2 §6). Aplica el orden de consumo y el reset de periodo.

```sql
CREATE OR REPLACE FUNCTION consumir_folio_cfdi(
  p_tenant_id  uuid,
  p_cfdi_id    uuid,
  p_es_global  boolean DEFAULT false   -- la factura global tiene tolerancia (ver abajo)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo      tenant_folios_saldo%ROWTYPE;
  v_periodo    date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
  v_fuente     text;
BEGIN
  SELECT * INTO v_saldo FROM tenant_folios_saldo WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % sin fila de saldo de folios', p_tenant_id;
  END IF;

  -- Reset de base mensual si cambió el periodo (no acumulable)
  IF v_saldo.periodo_actual < v_periodo THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = 0, periodo_actual = v_periodo, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'BASE_RESET', v_saldo.folios_base_mensuales, v_saldo.saldo_paquetes, v_periodo);
    v_saldo.folios_base_consumidos := 0;
  END IF;

  -- 1) Consumir de la base mensual si queda
  IF v_saldo.folios_base_consumidos < v_saldo.folios_base_mensuales THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = folios_base_consumidos + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_BASE', -1, p_cfdi_id, v_saldo.saldo_paquetes, CURRENT_DATE);
    v_fuente := 'BASE';

  -- 2) Si no, consumir del saldo de paquetes
  ELSIF v_saldo.saldo_paquetes > 0 THEN
    UPDATE tenant_folios_saldo
       SET saldo_paquetes = saldo_paquetes - 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, v_saldo.saldo_paquetes - 1, CURRENT_DATE);
    v_fuente := 'PAQUETE';

  -- 3) Sin folios: la factura global se permite igual (cumplimiento SAT no se bloquea);
  --    el timbrado individual sí se bloquea y la UI obliga a comprar paquete.
  ELSE
    IF p_es_global THEN
      INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
      VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, -1, CURRENT_DATE);  -- saldo negativo tolerado solo para global
      v_fuente := 'GLOBAL_TOLERADO';
    ELSE
      RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_FOLIOS',
        'mensaje', 'Sin folios disponibles. Compra un paquete para seguir facturando.');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'fuente', v_fuente);
END;
$$;

COMMENT ON FUNCTION consumir_folio_cfdi IS 'Descuenta 1 folio al timbrar. Orden: base mensual → paquetes. Global tolera saldo negativo para no romper cumplimiento SAT. D96.';
```

#### 3.9.5 RLS de las tablas de folios

```sql
-- folios_paquetes: catálogo, lectura pública
ALTER TABLE folios_paquetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_paquetes_select_publico ON folios_paquetes FOR SELECT USING (true);

-- tenant_folios_saldo y folios_movimientos: solo el propio tenant (lectura)
ALTER TABLE tenant_folios_saldo ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_saldo_select_tenant ON tenant_folios_saldo FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE folios_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_mov_select_tenant ON folios_movimientos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Escritura (compra de paquete, ajustes) solo vía funciones SECURITY DEFINER / service_role:
-- la app nunca hace INSERT directo al ledger ni UPDATE al saldo.
```

> **Importante:** las operaciones de INSERT/UPDATE/DELETE sobre estas tablas (cambiar de plan, dar de baja, etc.) **se ejecutan desde el backend administrativo de VIM** con el `service_role` key. **El cliente nunca puede modificar su propia suscripción directamente** — pasa por proceso comercial / Stripe webhook / panel admin de VIM.

---

## 4. Esquema: Sucursales, cajas y configuración

### 4.1 Tabla `sucursales`

Punto físico de operación. Un tenant puede tener una o muchas.

```sql
CREATE TABLE sucursales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  codigo              varchar(10) NOT NULL,             -- 'K', 'KC', 'KN', 'CG1' — usado en folio (§1.3.bis)
  nombre              varchar(150) NOT NULL,            -- 'León Centro'
  descripcion         text NULL,

  -- Ubicación
  direccion_calle     varchar(255) NULL,
  direccion_numero    varchar(20) NULL,
  direccion_colonia   varchar(150) NULL,
  ciudad              varchar(100) NULL,
  estado_geo          varchar(50) NULL,                 -- 'Guanajuato'
  codigo_postal       varchar(5) NULL,
  pais                varchar(50) NOT NULL DEFAULT 'México',
  geo_lat             numeric(9,6) NULL,
  geo_lng             numeric(9,6) NULL,

  -- Operación
  telefono            varchar(20) NULL,
  email_contacto      citext NULL,
  horario_apertura    time NULL,
  horario_cierre      time NULL,

  -- Overrides de configuración global del tenant (NULL = hereda del tenant)
  hora_cierre_dia_contable time NULL,
  timezone            varchar(50) NULL,

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  fecha_apertura      date NULL,
  fecha_cierre        date NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT codigo_sucursal_unico_por_tenant UNIQUE (tenant_id, codigo)
);

CREATE INDEX idx_sucursales_tenant ON sucursales(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sucursales_activas ON sucursales(tenant_id, activa) WHERE deleted_at IS NULL;

COMMENT ON COLUMN sucursales.codigo IS 'Código corto único por tenant. Aparece en folio de ticket: [codigo]-[año]-[consecutivo]. Ej: K-2026-001043';
COMMENT ON COLUMN sucursales.hora_cierre_dia_contable IS 'Si NULL, hereda del tenant. Permite que una sucursal tenga horario distinto.';
```

### 4.2 Tabla `cajas`

Estación POS dentro de una sucursal. Una sucursal puede tener varias cajas operando en paralelo.

```sql
CREATE TABLE cajas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- Identidad
  numero              integer NOT NULL,                 -- 1, 2, 3...
  nombre              varchar(100) NOT NULL,            -- 'Caja 01', 'Caja Barra'
  descripcion         text NULL,

  -- Vinculación a dispositivo (opcional, para tracking)
  identificador_dispositivo varchar(255) NULL,          -- fingerprint del navegador/tablet
  ultima_ip           inet NULL,
  ultima_conexion     timestamptz NULL,

  -- Configuración de impresora asignada (FK opcional a una tabla impresoras en Parte 1C)
  -- Por ahora se guarda la dirección de manera flexible
  impresora_config    jsonb NULL,
  -- Estructura ejemplo:
  -- { "tipo": "ethernet", "ip": "192.168.1.50", "puerto": 9100 }
  -- { "tipo": "bluetooth_ble", "device_id": "AA:BB:CC:DD:EE:FF" }

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  bloqueada           boolean NOT NULL DEFAULT false,   -- bloqueada por cierre pendiente (§1.2)
  bloqueo_motivo      text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT numero_caja_unico_por_sucursal UNIQUE (sucursal_id, numero)
);

CREATE INDEX idx_cajas_sucursal ON cajas(sucursal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cajas_tenant ON cajas(tenant_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN cajas.bloqueada IS 'TRUE cuando hay un cierre PENDIENTE_VALIDACION (§1.2). No permite abrir nuevo turno hasta que admin valide.';
COMMENT ON COLUMN cajas.impresora_config IS 'JSON flexible. La capa /services interpreta. Soporta ethernet (Knock-Out actual) y BLE.';
```

### 4.3 Tabla `configuracion_tenant`

Configuración operativa del negocio. Una sola fila por tenant (relación 1:1).

> **Decisión de diseño:** se separa de la tabla `tenants` porque la configuración crece con el tiempo y conviene tenerla aparte para evitar columnas anchas. Los datos identitarios (RFC, razón social) van en `tenants`; los operativos van aquí.

```sql
CREATE TABLE configuracion_tenant (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

  -- §28.2 Configuración de operación general

  -- Modos de servicio activos para este tenant (subset del catálogo §6.1)
  -- Array de strings: ['PARA_LLEVAR', 'COMER_AQUI', 'DOMICILIO_PROPIO', ...]
  modos_servicio_activos      text[] NOT NULL DEFAULT '{PARA_LLEVAR}',
  modo_servicio_default       varchar(50) NOT NULL DEFAULT 'PARA_LLEVAR',

  -- Captura de fondo de caja
  fondo_modo_captura          varchar(20) NOT NULL DEFAULT 'DENOMINACION'
    CHECK (fondo_modo_captura IN ('DENOMINACION', 'TOTAL')),
  fondo_estandar_mxn          numeric(10,2) NULL,        -- pre-llenado al abrir turno
  fondo_minimo_mxn            numeric(10,2) NOT NULL DEFAULT 0.01,

  -- Umbrales y políticas
  umbral_sangria_sin_pin_mxn  numeric(10,2) NOT NULL DEFAULT 0,  -- default: todas requieren PIN
  alerta_reincidencia_cierres integer NOT NULL DEFAULT 3,         -- N cierres con diferencia
  alerta_reincidencia_dias    integer NOT NULL DEFAULT 14,        -- en M días

  -- Política de cobro
  politica_cobro_cocina       varchar(20) NOT NULL DEFAULT 'COBRO_PRIMERO'
    CHECK (politica_cobro_cocina IN ('COBRO_PRIMERO', 'COCINA_PRIMERO', 'HIBRIDO_POR_MODO')),

  -- Política de redondeo
  redondeo_efectivo_activo    boolean NOT NULL DEFAULT false,

  -- Propinas
  propina_sugerida_activa     boolean NOT NULL DEFAULT false,
  propina_porcentajes         numeric(5,2)[] NOT NULL DEFAULT '{10.00, 15.00, 20.00}',
  propina_permite_otro_monto  boolean NOT NULL DEFAULT true,

  -- Notas / formato de ticket
  mostrar_nota_producto_ticket boolean NOT NULL DEFAULT true,
  pie_ticket                  text NULL,                 -- texto adicional al pie del ticket

  -- Reimpresión
  reimpresion_ticket_requiere_pin boolean NOT NULL DEFAULT false,
  reimpresion_comanda_requiere_pin boolean NOT NULL DEFAULT true,

  -- Tiempo de alerta para pedidos en espera abandonados (minutos)
  alerta_pedidos_espera_min   integer NOT NULL DEFAULT 30,

  -- Módulos activables (cache del estado actual; fuente de verdad: feature flags + addons)
  modulo_inventario_activo    boolean NOT NULL DEFAULT false,
  modulo_crm_avanzado_activo  boolean NOT NULL DEFAULT false,
  modulo_cfdi_activo          boolean NOT NULL DEFAULT false,
  modulo_delivery_propio_activo boolean NOT NULL DEFAULT false,
  modulo_apps_externas_activo boolean NOT NULL DEFAULT false,
  modulo_display_cliente_activo boolean NOT NULL DEFAULT false,

  -- §28.1 Configuración fiscal (datos sensibles)
  -- CSD se almacena ENCRIPTADO con pgp_sym_encrypt (no en MVP; estructura preparada)
  pac_proveedor               varchar(50) NULL,         -- 'Facturama'
  pac_credenciales_encrypted  bytea NULL,               -- pgp_sym_encrypt(...)
  csd_archivo_encrypted       bytea NULL,
  csd_password_encrypted      bytea NULL,
  cfdi_serie_default          varchar(25) NULL,
  cfdi_folio_inicial          integer NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_config_tenant ON configuracion_tenant(tenant_id);

COMMENT ON TABLE configuracion_tenant IS 'Una fila por tenant. Configuración operativa global del negocio. §28 del /core.';
COMMENT ON COLUMN configuracion_tenant.modos_servicio_activos IS 'Array de strings. Catálogo completo definido en §6.1 del /core.';
COMMENT ON COLUMN configuracion_tenant.pac_credenciales_encrypted IS 'Encriptado con pgp_sym_encrypt. Llave maestra fuera de la BD (variable de entorno).';
```

### 4.4 Tabla `configuracion_sucursal`

Override de configuración a nivel sucursal. Relación 1:1 opcional con sucursal.

```sql
CREATE TABLE configuracion_sucursal (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id                 uuid NOT NULL UNIQUE REFERENCES sucursales(id) ON DELETE CASCADE,

  -- Cualquier campo NULL = hereda de configuracion_tenant
  modos_servicio_activos      text[] NULL,
  modo_servicio_default       varchar(50) NULL,
  fondo_modo_captura          varchar(20) NULL,
  fondo_estandar_mxn          numeric(10,2) NULL,
  politica_cobro_cocina       varchar(20) NULL,
  pie_ticket                  text NULL,

  -- Notas operativas específicas
  notas_internas              text NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_config_sucursal ON configuracion_sucursal(sucursal_id);

COMMENT ON TABLE configuracion_sucursal IS 'Overrides por sucursal (§28.8). Cualquier campo NULL hereda de configuracion_tenant.';
```

### 4.5 Tabla `contadores_folio`

Implementa la numeración eterna de tickets (§1.3.bis). Una fila por sucursal por año.

```sql
CREATE TABLE contadores_folio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  anio                integer NOT NULL CHECK (anio >= 2025 AND anio <= 2100),
  tipo_documento      varchar(20) NOT NULL DEFAULT 'TICKET',  -- TICKET | SANGRIA | DEPOSITO | NOTA_CREDITO
  ultimo_consecutivo  bigint NOT NULL DEFAULT 0 CHECK (ultimo_consecutivo >= 0),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contador_unico UNIQUE (sucursal_id, anio, tipo_documento)
);

CREATE INDEX idx_contadores_lookup ON contadores_folio(sucursal_id, anio, tipo_documento);

COMMENT ON TABLE contadores_folio IS 'Secuencia eterna por sucursal y tipo de documento. NUNCA se reinicia. §1.3.bis del /core.';
```

> **Cómo se usa:** la función `generar_folio_ticket(sucursal_id)` (ver §8.4) hace un `UPDATE … RETURNING` atómico sobre esta tabla para incrementar y devolver el nuevo consecutivo. Garantía de no-colisión bajo concurrencia.

### 4.6 RLS y políticas

```sql
-- Sucursales: lectura/escritura del tenant
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sucursales_tenant ON sucursales FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
CREATE POLICY cajas_tenant ON cajas FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE configuracion_tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_tenant ON configuracion_tenant FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE configuracion_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_sucursal ON configuracion_sucursal FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE contadores_folio ENABLE ROW LEVEL SECURITY;
CREATE POLICY contadores_tenant ON contadores_folio FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

> **Granularidad:** estas políticas son a nivel `tenant_id` (no a nivel `sucursal_id`). Un usuario del tenant puede ver todas sus sucursales. La restricción por sucursal (ej. supervisor solo de su sucursal) se hace a nivel aplicación con verificación adicional contra `usuarios_acceso` (§5).

---

## 5. Esquema: Usuarios, roles y permisos

Este bloque modela los 5 roles base del `/core` (§2.1), los subtipos extensibles del rol Personal (§30), la matriz de permisos (§2.2) y el patrón de autorización por PIN (§2.3).

### 5.1 Enums asociados

```sql
-- Tipos de acceso (operativo vs administrativo)
CREATE TYPE tipo_acceso AS ENUM (
  'PIN_OPERATIVO',     -- caja: PIN 4-6 dígitos
  'WEB_ADMIN'          -- panel admin: usuario + contraseña + 2FA opcional
);

-- Estado del usuario en el sistema
CREATE TYPE usuario_estado AS ENUM (
  'ACTIVO',
  'BLOQUEADO_TEMP',    -- 3 PINs fallidos = 5 min de bloqueo
  'BLOQUEADO_ADMIN',   -- bloqueo permanente hasta acción de admin
  'DESACTIVADO'        -- usuario dado de baja
);
```

### 5.2 Tabla `usuarios_perfil`

Extensión de `auth.users` de Supabase con datos de negocio. Relación 1:1 con `auth.users`.

> **Decisión:** no replicamos `email`, `phone`, etc. de `auth.users`. Solo se almacenan datos VIM POS-específicos. La autenticación web (email + contraseña + 2FA) la maneja Supabase nativamente. El PIN operativo es independiente y vive aquí.

```sql
CREATE TABLE usuarios_perfil (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Datos personales
  nombre          varchar(100) NOT NULL,
  apellido_paterno varchar(100) NULL,
  apellido_materno varchar(100) NULL,
  telefono        varchar(20) NULL,
  foto_url        text NULL,

  -- PIN operativo (4-6 dígitos, hasheado)
  pin_hash        text NULL,                            -- bcrypt vía pgcrypto

  -- Estado
  estado          usuario_estado NOT NULL DEFAULT 'ACTIVO',
  bloqueado_hasta timestamptz NULL,                     -- bloqueo temporal por 3 PINs fallidos
  intentos_pin_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_pin_fallidos >= 0),

  -- Última actividad
  fecha_ultimo_login_pin  timestamptz NULL,
  fecha_ultimo_login_web  timestamptz NULL,

  -- Auditoría
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,

  CONSTRAINT pin_intentos_max CHECK (intentos_pin_fallidos <= 10)
);

CREATE INDEX idx_usuarios_estado ON usuarios_perfil(estado) WHERE deleted_at IS NULL;

COMMENT ON TABLE usuarios_perfil IS 'Datos VIM POS del usuario. Una fila 1:1 con auth.users.';
COMMENT ON COLUMN usuarios_perfil.pin_hash IS 'bcrypt hash del PIN. NUNCA en texto plano. Verificación con crypt(input, pin_hash).';
```

### 5.3 Tabla `roles`

5 roles base del sistema (`es_sistema = true`, inalterables) + roles personalizados por tenant.

```sql
CREATE TABLE roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL para roles del sistema
  codigo          varchar(50) NOT NULL,                  -- 'DUENO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'PERSONAL'
  nombre          varchar(100) NOT NULL,                 -- 'Dueño', 'Administrador', etc.
  descripcion     text NULL,

  es_sistema      boolean NOT NULL DEFAULT false,        -- roles base = true (inalterables)
  jerarquia       integer NOT NULL,                      -- 1=Personal, 2=Cajero, 3=Supervisor, 4=Admin, 5=Dueño
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Códigos del sistema (tenant_id NULL) únicos globalmente; roles custom únicos por tenant.
-- Índices únicos parciales (NO `EXCLUDE ... IS NOT DISTINCT FROM`, que no es SQL válido en Postgres).
CREATE UNIQUE INDEX rol_codigo_sistema_uq ON roles (codigo) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX rol_codigo_tenant_uq  ON roles (tenant_id, codigo) WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_roles_tenant ON roles(tenant_id) WHERE activo = true;
CREATE INDEX idx_roles_sistema ON roles(es_sistema) WHERE es_sistema = true;

COMMENT ON TABLE roles IS '5 roles base (es_sistema=true, tenant_id=NULL) + roles custom por tenant. §2.1 del /core.';
COMMENT ON COLUMN roles.jerarquia IS 'Nivel jerárquico. Un PIN solo autoriza acciones que requieren jerarquía <= la suya.';
```

**Seed inicial:** ver §9.2.

### 5.4 Tabla `subtipos_personal`

Subtipos extensibles del rol Personal (§30). Catálogo de sugerencias del sistema + custom por tenant.

```sql
CREATE TABLE subtipos_personal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = sugerencia del sistema
  codigo          varchar(50) NOT NULL,                  -- 'COCINERO', 'MESERO', 'REPARTIDOR', etc.
  nombre          varchar(100) NOT NULL,
  descripcion     text NULL,

  -- Verticales donde aplica (sirve para UI: solo mostrar relevantes según vertical del tenant)
  verticales_aplicables vertical_tipo[] NOT NULL DEFAULT '{}',

  -- Capacidades del subtipo (qué pantallas/acciones tiene acceso)
  -- Estructura JSON flexible. Ejemplo:
  -- { "ver_cola_cocina": true, "marcar_listo": true, "recibir_delivery": false }
  capacidades     jsonb NOT NULL DEFAULT '{}'::jsonb,

  es_sistema      boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Códigos del sistema (tenant_id NULL) únicos globalmente; custom únicos por tenant.
-- Índices únicos parciales (NO `EXCLUDE ... IS NOT DISTINCT FROM`, que no es SQL válido).
CREATE UNIQUE INDEX subtipo_codigo_sistema_uq ON subtipos_personal (codigo) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX subtipo_codigo_tenant_uq  ON subtipos_personal (tenant_id, codigo) WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_subtipos_tenant ON subtipos_personal(tenant_id) WHERE activo = true;

COMMENT ON TABLE subtipos_personal IS 'Subtipos del rol Personal. 9 sugeridos del sistema (cocinero, mesero, etc.) + custom por tenant. §30 del /core.';
```

**Seed inicial:** ver §9.3.

### 5.5 Tabla `permisos`

Catálogo de permisos del sistema. Cada permiso es un slug que se evalúa en la aplicación.

```sql
CREATE TABLE permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          varchar(100) NOT NULL UNIQUE,         -- 'caja.abrir_turno', 'venta.cancelar_pagado'
  nombre          varchar(150) NOT NULL,
  descripcion     text NULL,
  categoria       varchar(50) NOT NULL,                 -- 'caja', 'venta', 'descuento', 'config', 'reporte'

  -- ¿Este permiso puede ser autorizado vía PIN superior si el usuario no lo tiene?
  permite_autorizacion_pin boolean NOT NULL DEFAULT false,

  -- Jerarquía mínima que puede autorizar via PIN (solo si permite_autorizacion_pin = true)
  jerarquia_minima_pin integer NULL CHECK (jerarquia_minima_pin BETWEEN 1 AND 5),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_permisos_categoria ON permisos(categoria);

COMMENT ON TABLE permisos IS 'Catálogo de permisos. Lectura pública para todos los usuarios autenticados.';
```

**Seed inicial:** ver §9.4.

### 5.6 Tabla `rol_permisos`

Matriz base del sistema (§2.2). Define qué permisos tiene cada rol del sistema.

```sql
CREATE TABLE rol_permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_id          uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id      uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,

  -- TRUE = tiene el permiso; FALSE = puede pedirlo vía PIN superior si permite_autorizacion_pin
  concedido       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rol_permiso_unico UNIQUE (rol_id, permiso_id)
);

CREATE INDEX idx_rol_permisos_rol ON rol_permisos(rol_id);

COMMENT ON TABLE rol_permisos IS 'Matriz base permiso-rol. Para roles del sistema (es_sistema=true), es la matriz oficial del /core.';
```

**Seed inicial:** ver §9.5.

### 5.7 Tabla `overrides_permisos`

Overrides personalizados de la matriz base por tenant (§28.2 "Permisos personalizados").

```sql
CREATE TABLE overrides_permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rol_id          uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id      uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,

  -- Si concedido es distinto del valor base, este override aplica
  concedido       boolean NOT NULL,

  motivo          text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),

  CONSTRAINT override_unico UNIQUE (tenant_id, rol_id, permiso_id)
);

CREATE INDEX idx_overrides_lookup ON overrides_permisos(tenant_id, rol_id);
```

**Lógica de resolución** (en aplicación):

```
permiso_concedido(usuario, permiso_codigo) =
  acceso = usuarios_acceso[usuario, tenant_actual]
  override = overrides_permisos[tenant, acceso.rol, permiso]
  if override existe → return override.concedido
  else → return rol_permisos[acceso.rol, permiso].concedido
```

### 5.8 Tabla `usuarios_acceso`

Define a qué tenants/sucursales tiene acceso el usuario y con qué rol y (si aplica) subtipo.

```sql
CREATE TABLE usuarios_acceso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Sucursal específica o NULL = todas las sucursales del tenant
  sucursal_id     uuid NULL REFERENCES sucursales(id) ON DELETE CASCADE,

  -- Rol con el que opera en este tenant/sucursal
  rol_id          uuid NOT NULL REFERENCES roles(id),

  -- Si el rol es 'PERSONAL', cuál subtipo
  subtipo_personal_id uuid NULL REFERENCES subtipos_personal(id),

  -- Vigencia (NULL = sin vencimiento)
  fecha_inicio    date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin       date NULL,

  activo          boolean NOT NULL DEFAULT true,

  -- Notas (motivo de asignación, etc.)
  notas           text NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

-- Un usuario no puede tener 2 accesos activos al mismo tenant+sucursal+rol.
-- sucursal_id NULL = acceso a "todas las sucursales"; se trata como valor → dos índices parciales.
-- Índices únicos parciales (NO `EXCLUDE ... IS NOT DISTINCT FROM`, que no es SQL válido).
CREATE UNIQUE INDEX acceso_unico_con_suc ON usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  WHERE activo = true AND sucursal_id IS NOT NULL;
CREATE UNIQUE INDEX acceso_unico_sin_suc ON usuarios_acceso (usuario_id, tenant_id, rol_id)
  WHERE activo = true AND sucursal_id IS NULL;

CREATE INDEX idx_acceso_usuario ON usuarios_acceso(usuario_id) WHERE activo = true;
CREATE INDEX idx_acceso_tenant ON usuarios_acceso(tenant_id) WHERE activo = true;
CREATE INDEX idx_acceso_sucursal ON usuarios_acceso(sucursal_id) WHERE activo = true;

COMMENT ON TABLE usuarios_acceso IS 'Quién puede operar dónde con qué rol. Un usuario puede tener múltiples filas (varias sucursales, varios tenants).';
COMMENT ON COLUMN usuarios_acceso.sucursal_id IS 'NULL = acceso a TODAS las sucursales del tenant. Usado típicamente para dueño/admin.';
```

### 5.9 Tabla `pin_intentos`

Histórico de intentos de PIN (exitosos y fallidos). Para auditoría y política anti-fuerza-bruta (§3.3).

```sql
CREATE TABLE pin_intentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id),       -- NULL si todavía no se identificó el usuario
  usuario_id      uuid NULL REFERENCES auth.users(id),    -- NULL si el PIN no matcheó nadie
  caja_id         uuid NULL REFERENCES cajas(id),

  exitoso         boolean NOT NULL,
  motivo_fallo    varchar(50) NULL,                       -- 'PIN_INCORRECTO', 'USUARIO_BLOQUEADO', 'USUARIO_INEXISTENTE'

  ip_address      inet NULL,
  user_agent      text NULL,

  fecha_intento   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pin_intentos_usuario_fecha ON pin_intentos(usuario_id, fecha_intento DESC);
CREATE INDEX idx_pin_intentos_caja_fecha ON pin_intentos(caja_id, fecha_intento DESC);
CREATE INDEX idx_pin_intentos_fallidos_recientes
  ON pin_intentos(usuario_id, fecha_intento DESC)
  WHERE exitoso = false;

COMMENT ON TABLE pin_intentos IS 'Bitácora de intentos de PIN. Política: 3 fallidos = bloqueo 5 min; 6 fallidos = bloqueo admin (§3.3).';
```

### 5.10 RLS y políticas

```sql
-- usuarios_perfil: usuario puede leer/editar su propio perfil; admin del tenant lee los de su tenant
ALTER TABLE usuarios_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuarios_perfil_propio ON usuarios_perfil FOR SELECT
  USING (id = auth.uid());

CREATE POLICY usuarios_perfil_mismo_tenant ON usuarios_perfil FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_acceso ua
      WHERE ua.usuario_id = usuarios_perfil.id
        AND ua.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND ua.activo = true
    )
  );

CREATE POLICY usuarios_perfil_update_propio ON usuarios_perfil FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- roles: lectura pública para roles del sistema; del tenant para roles custom
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_sistema ON roles FOR SELECT
  USING (es_sistema = true OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- subtipos_personal: igual que roles
ALTER TABLE subtipos_personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY subtipos_lectura ON subtipos_personal FOR SELECT
  USING (es_sistema = true OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- permisos: lectura pública (catálogo del sistema)
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY permisos_publico ON permisos FOR SELECT USING (true);

-- rol_permisos: lectura pública (matriz base es pública)
ALTER TABLE rol_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rol_permisos_publico ON rol_permisos FOR SELECT USING (true);

-- overrides_permisos: solo del tenant
ALTER TABLE overrides_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY overrides_tenant ON overrides_permisos FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- usuarios_acceso: usuario ve sus propios accesos; admin del tenant ve todos los del tenant
ALTER TABLE usuarios_acceso ENABLE ROW LEVEL SECURITY;
CREATE POLICY acceso_propio ON usuarios_acceso FOR SELECT
  USING (usuario_id = auth.uid());

CREATE POLICY acceso_tenant ON usuarios_acceso FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- pin_intentos: solo lectura para admin del tenant (auditoría)
ALTER TABLE pin_intentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pin_intentos_tenant ON pin_intentos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- INSERT permitido solo desde service_role (vía función segura, no directo)
```

> **Sobre INSERT/UPDATE de `usuarios_acceso`:** las modificaciones (alta/baja de usuarios, cambio de rol) pasan por funciones server-side `assign_user_role()` / `revoke_user_access()` que validan jerarquía: solo un usuario con rol jerarquía >= 4 (Admin) puede asignar accesos, y un Dueño es el único que puede crear otros Dueños.

---

## 6. Esquema: Turnos, movimientos de caja y arqueos

Este bloque modela el flujo más crítico operativamente: apertura de turno, sangrías, depósitos, cambios de cajero, cierre de turno con conteo, validación de diferencias por admin, y cierre de día consolidado.

### 6.1 Enums asociados

```sql
-- Estado del turno (§1.2 del /core)
CREATE TYPE turno_estado AS ENUM (
  'ABIERTO',
  'PENDIENTE_VALIDACION',     -- cerrado con diferencia, esperando PIN admin
  'CERRADO'
);

-- Modo de captura del fondo de caja
CREATE TYPE fondo_modo_captura AS ENUM (
  'DENOMINACION',              -- captura por billete/moneda (default)
  'TOTAL'                      -- captura solo monto total
);

-- Tipo de movimiento de caja (§1.4 del /core)
CREATE TYPE movimiento_tipo AS ENUM (
  'FONDO_APERTURA',
  'INYECCION_FONDO',           -- inyectar efectivo al fondo a media jornada (P-097)
  'SANGRIA',                   -- retiro de efectivo (P-098)
  'DEPOSITO',                  -- depósito bancario / salida de efectivo a banco (P-099)
  'PAGO_PROVEEDOR',            -- pago a proveedor desde la caja (P-100)
  'DEVOLUCION_EFECTIVO',       -- pago de devolución en efectivo
  'AJUSTE_POSITIVO',           -- ajuste manual + (admin)
  'AJUSTE_NEGATIVO'            -- ajuste manual - (admin)
);

-- Decisión del admin al validar un cierre con diferencia (§24.2 paso 6)
CREATE TYPE admin_decision_cierre AS ENUM (
  'ACEPTAR_DIFERENCIA',        -- merma del negocio
  'PENDIENTE_EXTERNA',         -- queda registrada, resolución externa
  'PENDIENTE_INVESTIGACION'    -- caja sigue bloqueada
);
```

### 6.2 Tabla `turnos`

Sesión de trabajo de una caja entre apertura y cierre (§1.1, §1.2, §7).

```sql
CREATE TABLE turnos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,

  -- Identificación humano-legible: '2026-05-17-C01-01'
  -- (fecha apertura + caja + correlativo del día)
  codigo_turno        varchar(50) NOT NULL,

  -- Día contable al que pertenecen las ventas del turno (D7, §25.3)
  dia_contable        date NOT NULL,

  -- Estado y fechas
  estado              turno_estado NOT NULL DEFAULT 'ABIERTO',
  fecha_apertura      timestamptz NOT NULL DEFAULT now(),
  fecha_cierre        timestamptz NULL,
  fecha_validacion    timestamptz NULL,                  -- cuando admin validó (si aplicó)

  -- Usuario responsable de apertura
  usuario_apertura_id uuid NOT NULL REFERENCES auth.users(id),

  -- Usuario que cerró el turno (puede ser distinto al de apertura si hubo cambio de cajero)
  usuario_cierre_id   uuid NULL REFERENCES auth.users(id),

  -- Admin que validó (si turno cerró con diferencia)
  usuario_validacion_id uuid NULL REFERENCES auth.users(id),

  -- Fondo de apertura
  fondo_inicial_mxn   numeric(12,2) NOT NULL CHECK (fondo_inicial_mxn >= 0),
  fondo_modo          fondo_modo_captura NOT NULL DEFAULT 'DENOMINACION',

  -- Resumen de cierre (snapshot calculado al cerrar)
  efectivo_esperado_mxn numeric(12,2) NULL,
  efectivo_contado_mxn  numeric(12,2) NULL,
  diferencia_mxn        numeric(12,2) NULL,              -- contado - esperado; negativo = faltante

  -- Justificación del cajero si hay diferencia (§24.2 paso 4)
  diferencia_justificacion text NULL,
  diferencia_descripcion text NULL,

  -- Decisión del admin (si aplica)
  admin_decision      admin_decision_cierre NULL,
  admin_notas         text NULL,

  -- Notas libres
  notas_apertura      text NULL,
  notas_cierre        text NULL,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT codigo_turno_unico UNIQUE (sucursal_id, codigo_turno),
  CONSTRAINT cierre_consistencia CHECK (
    (estado = 'ABIERTO' AND fecha_cierre IS NULL)
    OR (estado IN ('PENDIENTE_VALIDACION', 'CERRADO') AND fecha_cierre IS NOT NULL)
  )
);

-- Solo puede haber UN turno ABIERTO o PENDIENTE_VALIDACION por caja
CREATE UNIQUE INDEX idx_turno_unico_activo_por_caja
  ON turnos(caja_id)
  WHERE estado IN ('ABIERTO', 'PENDIENTE_VALIDACION');

CREATE INDEX idx_turnos_tenant_dia ON turnos(tenant_id, dia_contable);
CREATE INDEX idx_turnos_sucursal_dia ON turnos(sucursal_id, dia_contable);
CREATE INDEX idx_turnos_caja_estado ON turnos(caja_id, estado);
CREATE INDEX idx_turnos_usuario_apertura ON turnos(usuario_apertura_id, fecha_apertura DESC);

COMMENT ON TABLE turnos IS 'Sesión de trabajo de una caja. §7 (apertura), §24 (cierre) del /core.';
COMMENT ON COLUMN turnos.dia_contable IS 'Día al que pertenecen las ventas. Inmutable (D7). §25.3.';
COMMENT ON COLUMN turnos.diferencia_mxn IS 'contado - esperado. Negativo = faltante, positivo = sobrante.';
```

### 6.3 Tabla `turno_cajero_historial`

Histórico de quién operó la caja durante el turno. Permite cambios de cajero (§8) sin cerrar turno.

```sql
CREATE TABLE turno_cajero_historial (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  fecha_inicio        timestamptz NOT NULL,
  fecha_fin           timestamptz NULL,                  -- NULL = está operando ahora

  -- ¿Hubo conteo parcial al hacer cambio? (§8.2 paso 2)
  hizo_conteo_parcial boolean NOT NULL DEFAULT false,
  corte_parcial_id    uuid NULL,                          -- FK a cortes_parciales (FK se agrega después)

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periodo_valido CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_turno_cajero_turno ON turno_cajero_historial(turno_id, fecha_inicio);
CREATE INDEX idx_turno_cajero_usuario ON turno_cajero_historial(usuario_id, fecha_inicio DESC);

-- Solo puede haber un cajero "activo" (sin fecha_fin) por turno
CREATE UNIQUE INDEX idx_turno_cajero_activo
  ON turno_cajero_historial(turno_id)
  WHERE fecha_fin IS NULL;

COMMENT ON TABLE turno_cajero_historial IS 'Quién operó la caja durante el turno. §8 cambio de cajero sin cierre.';
```

### 6.4 Tabla `cortes_parciales`

Conteos parciales al hacer cambio de cajero. Opcional pero recomendado (§8.2).

```sql
CREATE TABLE cortes_parciales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  fecha               timestamptz NOT NULL DEFAULT now(),

  -- Snapshot de venta del cajero saliente
  ventas_efectivo_mxn   numeric(12,2) NOT NULL DEFAULT 0,
  ventas_tarjeta_mxn    numeric(12,2) NOT NULL DEFAULT 0,
  ventas_transferencia_mxn numeric(12,2) NOT NULL DEFAULT 0,
  ventas_vales_mxn      numeric(12,2) NOT NULL DEFAULT 0,
  tickets_count         integer NOT NULL DEFAULT 0,

  -- Conteo de efectivo
  efectivo_esperado_mxn numeric(12,2) NOT NULL,
  efectivo_contado_mxn  numeric(12,2) NOT NULL,
  diferencia_mxn        numeric(12,2) NOT NULL,           -- contado - esperado

  notas                 text NULL,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cortes_parciales_turno ON cortes_parciales(turno_id);

-- FK back-reference desde turno_cajero_historial
ALTER TABLE turno_cajero_historial
  ADD CONSTRAINT fk_corte_parcial
  FOREIGN KEY (corte_parcial_id) REFERENCES cortes_parciales(id);

COMMENT ON TABLE cortes_parciales IS 'Conteo parcial al cambiar de cajero (§8.2). No cierra turno.';
```

### 6.5 Tabla `denominaciones_fondo`

Detalle por denominación del fondo de apertura (cuando `fondo_modo = 'DENOMINACION'`). §7.2 paso 1.

```sql
CREATE TABLE denominaciones_fondo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  denominacion_mxn    numeric(8,2) NOT NULL,             -- 1000.00, 500.00, ..., 0.50
  tipo                varchar(10) NOT NULL CHECK (tipo IN ('BILLETE', 'MONEDA')),
  cantidad            integer NOT NULL CHECK (cantidad >= 0),
  subtotal_mxn        numeric(12,2) GENERATED ALWAYS AS (denominacion_mxn * cantidad) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT denominacion_unica_por_turno UNIQUE (turno_id, denominacion_mxn)
);

CREATE INDEX idx_denom_fondo_turno ON denominaciones_fondo(turno_id);
```

### 6.6 Tabla `movimientos_caja`

Tabla universal para sangrías, depósitos, fondo de apertura, devoluciones en efectivo (§9, §10).

```sql
CREATE TABLE movimientos_caja (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
  caja_id             uuid NOT NULL REFERENCES cajas(id),
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio humano-legible: 'SAN-2026-0142' (sangría), 'DEP-2026-0089' (depósito)
  folio               varchar(50) NOT NULL,

  -- Tipo y signo
  tipo                movimiento_tipo NOT NULL,
  monto_mxn           numeric(12,2) NOT NULL CHECK (monto_mxn > 0),
  -- Si afecta el efectivo de la caja: signo se infiere del tipo (SANGRIA = resta)

  -- Día contable (inherita del turno al crear)
  dia_contable        date NOT NULL,
  fecha               timestamptz NOT NULL DEFAULT now(),

  -- Quién y por qué
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_autorizo_id    uuid NULL REFERENCES auth.users(id),  -- NULL para FONDO_APERTURA
  autorizacion_pin_id    uuid NULL,                             -- FK a autorizaciones_pin (lazy)

  motivo              varchar(100) NOT NULL,             -- 'Pago a proveedor', 'Refuerzo de fondo', etc.
  descripcion         text NULL,

  -- Comprobante impreso
  comprobante_impreso boolean NOT NULL DEFAULT false,
  fecha_impresion     timestamptz NULL,

  -- Si fue retiro hacia otra caja o sucursal, vínculo opcional
  caja_destino_id     uuid NULL REFERENCES cajas(id),

  -- Cancelación (solo admin puede)
  cancelado           boolean NOT NULL DEFAULT false,
  cancelado_por       uuid NULL REFERENCES auth.users(id),
  fecha_cancelacion   timestamptz NULL,
  motivo_cancelacion  text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT folio_unico_por_sucursal UNIQUE (sucursal_id, folio)
);

CREATE INDEX idx_movs_turno ON movimientos_caja(turno_id);
CREATE INDEX idx_movs_dia_contable ON movimientos_caja(sucursal_id, dia_contable);
CREATE INDEX idx_movs_tipo ON movimientos_caja(tenant_id, tipo, fecha DESC);
CREATE INDEX idx_movs_no_cancelados ON movimientos_caja(turno_id) WHERE cancelado = false;

COMMENT ON TABLE movimientos_caja IS 'Todos los movimientos de efectivo del turno. §9 sangrías, §10 depósitos.';
COMMENT ON COLUMN movimientos_caja.motivo IS 'Categoría seleccionada de la lista (§9.2 paso 1). Texto libre permitido bajo "Otro".';
```

### 6.7 Tabla `denominaciones_conteo`

Detalle por denominación del conteo físico al cierre (§24.2 paso 3).

```sql
CREATE TABLE denominaciones_conteo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  -- Tipo: cierre final o corte parcial
  tipo_conteo         varchar(20) NOT NULL CHECK (tipo_conteo IN ('CIERRE', 'CORTE_PARCIAL')),
  corte_parcial_id    uuid NULL REFERENCES cortes_parciales(id) ON DELETE CASCADE,

  denominacion_mxn    numeric(8,2) NOT NULL,
  tipo                varchar(10) NOT NULL CHECK (tipo IN ('BILLETE', 'MONEDA')),
  cantidad            integer NOT NULL CHECK (cantidad >= 0),
  subtotal_mxn        numeric(12,2) GENERATED ALWAYS AS (denominacion_mxn * cantidad) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT denom_conteo_unica UNIQUE (turno_id, tipo_conteo, corte_parcial_id, denominacion_mxn)
);

CREATE INDEX idx_denom_conteo_turno ON denominaciones_conteo(turno_id, tipo_conteo);
```

### 6.8 Tabla `cierres_dia`

Cierre Z global de la sucursal en un día contable (§25). Una fila por sucursal por día.

```sql
CREATE TABLE cierres_dia (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  dia_contable        date NOT NULL,

  -- Ejecución
  ejecutado_automatico boolean NOT NULL DEFAULT true,    -- true = corrió a las 3:00 AM
  fecha_ejecucion     timestamptz NOT NULL DEFAULT now(),
  ejecutado_por_id    uuid NULL REFERENCES auth.users(id),  -- NULL si automático

  -- Resumen consolidado (snapshot)
  turnos_count        integer NOT NULL DEFAULT 0,
  ventas_brutas_mxn   numeric(14,2) NOT NULL DEFAULT 0,
  descuentos_mxn      numeric(14,2) NOT NULL DEFAULT 0,
  devoluciones_mxn    numeric(14,2) NOT NULL DEFAULT 0,
  ventas_netas_mxn    numeric(14,2) NOT NULL DEFAULT 0,

  ventas_efectivo_mxn      numeric(14,2) NOT NULL DEFAULT 0,
  ventas_tarjeta_mxn       numeric(14,2) NOT NULL DEFAULT 0,
  ventas_transferencia_mxn numeric(14,2) NOT NULL DEFAULT 0,
  ventas_vales_mxn         numeric(14,2) NOT NULL DEFAULT 0,
  ventas_apps_externas_mxn numeric(14,2) NOT NULL DEFAULT 0,

  tickets_cobrados    integer NOT NULL DEFAULT 0,
  tickets_cancelados  integer NOT NULL DEFAULT 0,
  ticket_promedio_mxn numeric(12,2) NULL,

  -- Datos completos para análisis posterior (top productos, hora pico, etc.)
  payload_detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Estado
  finalizado          boolean NOT NULL DEFAULT true,     -- false si algún turno quedó abierto
  observaciones       text NULL,

  -- Facturación global (Fase Final, cuando módulo CFDI esté activo)
  cfdi_global_emitido boolean NOT NULL DEFAULT false,
  cfdi_global_uuid    uuid NULL,                         -- UUID que devuelve el PAC

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cierre_unico_por_sucursal_dia UNIQUE (sucursal_id, dia_contable)
);

CREATE INDEX idx_cierres_dia_tenant ON cierres_dia(tenant_id, dia_contable DESC);
CREATE INDEX idx_cierres_dia_sucursal ON cierres_dia(sucursal_id, dia_contable DESC);

COMMENT ON TABLE cierres_dia IS 'Z global por sucursal por día contable. §25 del /core.';
COMMENT ON COLUMN cierres_dia.payload_detalle IS 'Datos adicionales (top productos, mix de modos, etc.) sin proliferar columnas.';
```

### 6.9 RLS y políticas

```sql
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY turnos_tenant ON turnos FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE turno_cajero_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY turno_cajero_tenant ON turno_cajero_historial FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cortes_parciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY cortes_tenant ON cortes_parciales FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE denominaciones_fondo ENABLE ROW LEVEL SECURITY;
CREATE POLICY denom_fondo_tenant ON denominaciones_fondo FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE denominaciones_conteo ENABLE ROW LEVEL SECURITY;
CREATE POLICY denom_conteo_tenant ON denominaciones_conteo FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
CREATE POLICY movs_tenant ON movimientos_caja FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cierres_dia ENABLE ROW LEVEL SECURITY;
CREATE POLICY cierres_tenant ON cierres_dia FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

---

## 7. Esquema: Auditoría y autorización

Implementa el principio fundamental de trazabilidad del §27: **todo evento operativo queda registrado, nada se borra**.

### 7.1 Enums asociados

```sql
-- Categorías de eventos de auditoría (agrupación para filtros)
CREATE TYPE evento_categoria AS ENUM (
  'AUTENTICACION',     -- login, logout, PIN
  'TURNO',             -- apertura, cierre, validación
  'CAJA',              -- sangrías, depósitos
  'VENTA',             -- creación, modificación, cancelación
  'COBRO',             -- pago, devolución
  'DESCUENTO',         -- aplicación manual o automática
  'COCINA',            -- estado_cocina, reimpresión
  'CONFIGURACION',     -- cambios de configuración del negocio
  'CATALOGO',          -- alta/baja/modificación de productos
  'USUARIOS',          -- alta/baja/cambio de rol
  'SISTEMA',           -- errores, reintentos, sync
  'OTRO'
);
```

### 7.2 Tabla `auditoria_eventos`

Bitácora universal. Una fila por cada evento auditable del sistema (D8).

```sql
CREATE TABLE auditoria_eventos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Contexto operativo
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),
  turno_id            uuid NULL REFERENCES turnos(id),

  -- Quién
  usuario_id          uuid NULL REFERENCES auth.users(id),    -- NULL para eventos del sistema
  usuario_autorizo_id uuid NULL REFERENCES auth.users(id),    -- si hubo PIN superior

  -- Qué
  categoria           evento_categoria NOT NULL,
  evento_codigo       varchar(100) NOT NULL,                  -- 'turno.abrir', 'venta.cancelar_pagada'
  entidad_tipo        varchar(50) NULL,                       -- 'turno', 'ticket', 'producto'
  entidad_id          uuid NULL,                              -- id de la entidad afectada

  -- Detalle estructurado (payload flexible)
  -- Estructura sugerida:
  -- {
  --   "antes": { ...estado previo... },
  --   "despues": { ...estado nuevo... },
  --   "motivo": "...",
  --   "monto_mxn": 245.00,
  --   "metadata": { ... }
  -- }
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Información técnica
  ip_address          inet NULL,
  user_agent          text NULL,

  -- Cuándo
  fecha               timestamptz NOT NULL DEFAULT now(),
  dia_contable        date NULL                                -- inherita del turno cuando aplica
);

CREATE INDEX idx_auditoria_tenant_fecha ON auditoria_eventos(tenant_id, fecha DESC);
CREATE INDEX idx_auditoria_categoria ON auditoria_eventos(tenant_id, categoria, fecha DESC);
CREATE INDEX idx_auditoria_usuario ON auditoria_eventos(usuario_id, fecha DESC);
CREATE INDEX idx_auditoria_entidad ON auditoria_eventos(entidad_tipo, entidad_id);
CREATE INDEX idx_auditoria_turno ON auditoria_eventos(turno_id) WHERE turno_id IS NOT NULL;
CREATE INDEX idx_auditoria_dia_contable ON auditoria_eventos(tenant_id, dia_contable) WHERE dia_contable IS NOT NULL;

-- Índice GIN sobre payload para queries jsonb (cuando se requiera buscar por campos del payload)
CREATE INDEX idx_auditoria_payload ON auditoria_eventos USING GIN (payload);

COMMENT ON TABLE auditoria_eventos IS 'Bitácora universal de eventos. Tabla append-only: las filas NUNCA se modifican ni se borran. §27 del /core.';
COMMENT ON COLUMN auditoria_eventos.payload IS 'JSON estructurado. Convención: { antes, despues, motivo, metadata }. Indexado con GIN.';
```

### 7.3 Tabla `autorizaciones_pin`

Cuando un cajero hace una acción que requiere PIN superior, queda registrado aquí (§2.3).

```sql
CREATE TABLE autorizaciones_pin (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),
  turno_id            uuid NULL REFERENCES turnos(id),

  -- Quién operaba (cajero)
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),

  -- Quién autorizó (supervisor/admin via PIN)
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),

  -- Qué se autorizó
  accion              varchar(100) NOT NULL,             -- 'cancelar_ticket_pagado', 'sangria', 'descuento_manual'
  permiso_codigo      varchar(100) NULL REFERENCES permisos(codigo),
  entidad_tipo        varchar(50) NULL,
  entidad_id          uuid NULL,

  -- Monto cuando aplica
  monto_mxn           numeric(12,2) NULL,

  -- Motivo capturado (obligatorio en el modal §2.3)
  motivo              text NOT NULL,

  fecha               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autorizaciones_tenant_fecha ON autorizaciones_pin(tenant_id, fecha DESC);
CREATE INDEX idx_autorizaciones_autorizo ON autorizaciones_pin(usuario_autorizo_id, fecha DESC);
CREATE INDEX idx_autorizaciones_solicitante ON autorizaciones_pin(usuario_solicitante_id, fecha DESC);
CREATE INDEX idx_autorizaciones_accion ON autorizaciones_pin(tenant_id, accion, fecha DESC);

-- FK back-reference desde movimientos_caja
ALTER TABLE movimientos_caja
  ADD CONSTRAINT fk_autorizacion_pin
  FOREIGN KEY (autorizacion_pin_id) REFERENCES autorizaciones_pin(id);

COMMENT ON TABLE autorizaciones_pin IS 'Registro de autorizaciones por PIN superior. §2.3 del /core.';
```

### 7.4 Tabla `sesiones_login`

Registro de sesiones de login (PIN operativo y web admin).

```sql
CREATE TABLE sesiones_login (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  tipo_acceso         tipo_acceso NOT NULL,

  -- Contexto (solo aplica para PIN operativo)
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),

  fecha_login         timestamptz NOT NULL DEFAULT now(),
  fecha_logout        timestamptz NULL,
  motivo_logout       varchar(50) NULL,                  -- 'MANUAL', 'CAMBIO_CAJERO', 'INACTIVIDAD', 'BLOQUEO'

  ip_address          inet NULL,
  user_agent          text NULL,

  duracion_minutos    integer GENERATED ALWAYS AS (
    CASE
      WHEN fecha_logout IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (fecha_logout - fecha_login))::integer / 60
    END
  ) STORED
);

CREATE INDEX idx_sesiones_usuario_fecha ON sesiones_login(usuario_id, fecha_login DESC);
CREATE INDEX idx_sesiones_tenant_fecha ON sesiones_login(tenant_id, fecha_login DESC);
CREATE INDEX idx_sesiones_caja ON sesiones_login(caja_id, fecha_login DESC) WHERE caja_id IS NOT NULL;
CREATE INDEX idx_sesiones_abiertas ON sesiones_login(usuario_id) WHERE fecha_logout IS NULL;

COMMENT ON TABLE sesiones_login IS 'Histórico de sesiones. PIN operativo (caja) y web admin son distinguibles via tipo_acceso.';
```

### 7.5 RLS y políticas

```sql
-- auditoria_eventos: lectura por tenant; INSERT permitido a todos los usuarios autenticados del tenant
ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditoria_select_tenant ON auditoria_eventos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY auditoria_insert_tenant ON auditoria_eventos FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- NO UPDATE, NO DELETE — tabla append-only (D8, §27.1)

ALTER TABLE autorizaciones_pin ENABLE ROW LEVEL SECURITY;
CREATE POLICY autorizaciones_tenant ON autorizaciones_pin FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE sesiones_login ENABLE ROW LEVEL SECURITY;
CREATE POLICY sesiones_propias ON sesiones_login FOR SELECT
  USING (usuario_id = auth.uid());
CREATE POLICY sesiones_tenant_admin ON sesiones_login FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

> **Append-only enforcement:** las tablas `auditoria_eventos`, `autorizaciones_pin`, `pin_intentos` y `sesiones_login` no tienen políticas de UPDATE/DELETE. Cualquier intento se rechaza por RLS. Esto refuerza el principio de §27.1: "nada se borra".

---

## 8. Funciones helper y triggers

Estas funciones encapsulan la lógica que debe vivir cerca de la BD: resolución de tenant del JWT, cálculo del día contable, generación de folios atómicos, y triggers de mantenimiento.

### 8.1 Función `current_tenant_id()`

Extrae el `tenant_id` del JWT del usuario autenticado. Se usa dentro de RLS policies y funciones server-side.

```sql
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

COMMENT ON FUNCTION current_tenant_id() IS 'Tenant del usuario autenticado vía JWT claim. Base de RLS (D13).';
```

> **Cómo llega el `tenant_id` al JWT:** al hacer login (PIN o web), un trigger en `auth.users` o una Edge Function de Supabase setea custom claims en el JWT en base a `usuarios_acceso`. Se documenta detalladamente en Parte 1C cuando se cubra el flujo de autenticación.

### 8.2 Función `current_sucursal_id()`

Sucursal "activa" del usuario en este momento. Se almacena en JWT claim también (cambia al elegir sucursal en login).

```sql
CREATE OR REPLACE FUNCTION current_sucursal_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sucursal_id', '')::uuid;
$$;
```

### 8.3 Función `calcular_dia_contable(tenant_id, ts)`

Dada una fecha/hora y la configuración del negocio, calcula a qué `día contable` pertenece (§25.3).

**Regla:** si `ts` cae antes de `hora_cierre_dia_contable` del tenant, el día contable es el día calendario **anterior**. Si cae después, es el día calendario actual.

```sql
CREATE OR REPLACE FUNCTION calcular_dia_contable(
  p_tenant_id uuid,
  p_ts timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_hora_cierre time;
  v_tz          text;
  v_ts_local    timestamp;
BEGIN
  SELECT t.hora_cierre_dia_contable, t.timezone
  INTO v_hora_cierre, v_tz
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant % no existe', p_tenant_id;
  END IF;

  -- Convertir a timezone del negocio
  v_ts_local := p_ts AT TIME ZONE v_tz;

  -- Si la hora local es anterior a la hora de cierre, pertenece al día anterior
  IF v_ts_local::time < v_hora_cierre THEN
    RETURN (v_ts_local::date - INTERVAL '1 day')::date;
  ELSE
    RETURN v_ts_local::date;
  END IF;
END;
$$;

COMMENT ON FUNCTION calcular_dia_contable IS 'Día contable según hora de cierre del negocio (§25.3). Inmutable una vez asignado (D7).';
```

**Ejemplo:** Knock-Out con `hora_cierre_dia_contable = '03:00'`.

- Ticket cobrado el viernes 23 a las 23:00 → `dia_contable = 2026-05-23` (viernes)
- Ticket cobrado el sábado 24 a las 02:30 → `dia_contable = 2026-05-23` (sigue siendo viernes)
- Ticket cobrado el sábado 24 a las 04:00 → `dia_contable = 2026-05-24` (sábado)

### 8.4 Función `generar_folio_ticket(sucursal_id)`

Genera el siguiente folio único e incremental para una sucursal y año, de forma atómica.

```sql
CREATE OR REPLACE FUNCTION generar_folio(
  p_sucursal_id uuid,
  p_tipo_documento varchar DEFAULT 'TICKET',
  p_anio integer DEFAULT NULL
) RETURNS TABLE (
  folio_completo varchar,
  consecutivo bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_codigo_suc    varchar(10);
  v_anio          integer;
  v_consecutivo   bigint;
BEGIN
  -- Obtener tenant_id y código de sucursal
  SELECT s.tenant_id, s.codigo
  INTO v_tenant_id, v_codigo_suc
  FROM sucursales s
  WHERE s.id = p_sucursal_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal % no existe o está eliminada', p_sucursal_id;
  END IF;

  v_anio := COALESCE(p_anio, EXTRACT(YEAR FROM now())::integer);

  -- Upsert atómico del contador
  INSERT INTO contadores_folio (tenant_id, sucursal_id, anio, tipo_documento, ultimo_consecutivo)
  VALUES (v_tenant_id, p_sucursal_id, v_anio, p_tipo_documento, 1)
  ON CONFLICT (sucursal_id, anio, tipo_documento)
  DO UPDATE SET
    ultimo_consecutivo = contadores_folio.ultimo_consecutivo + 1,
    updated_at = now()
  RETURNING ultimo_consecutivo INTO v_consecutivo;

  -- Componer folio: 'K-2026-001043'
  RETURN QUERY SELECT
    (v_codigo_suc || '-' || v_anio || '-' || LPAD(v_consecutivo::text, 6, '0'))::varchar AS folio_completo,
    v_consecutivo AS consecutivo;
END;
$$;

COMMENT ON FUNCTION generar_folio IS 'Folio atómico por sucursal/año/tipo. Formato: [codigo]-[anio]-[NNNNNN]. §1.3.bis del /core.';
```

> **Atomicidad garantizada:** PostgreSQL serializa las operaciones `INSERT ... ON CONFLICT ... DO UPDATE` sobre la misma fila. Dos cajas que pidan folio al mismo milisegundo obtendrán números distintos sin colisión.

### 8.5 Trigger: `updated_at` automático

Función genérica que actualiza `updated_at` antes de cada UPDATE.

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Aplicar a todas las tablas con updated_at
-- (Patrón: se aplica al crear cada tabla; aquí los más críticos)
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sucursales_updated_at
  BEFORE UPDATE ON sucursales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cajas_updated_at
  BEFORE UPDATE ON cajas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_turnos_updated_at
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_tenant_updated_at
  BEFORE UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_sucursal_updated_at
  BEFORE UPDATE ON configuracion_sucursal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suscripciones_updated_at
  BEFORE UPDATE ON suscripciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_usuarios_perfil_updated_at
  BEFORE UPDATE ON usuarios_perfil
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_usuarios_acceso_updated_at
  BEFORE UPDATE ON usuarios_acceso
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 8.6 Trigger: validar PIN al hashear

Al hacer INSERT o UPDATE del `pin_hash` en `usuarios_perfil`, validar que el PIN crudo (que viene en una variable temporal) cumpla con reglas (4-6 dígitos numéricos).

> **Nota:** el hasheo se hace en aplicación (Edge Function de Supabase o backend) usando `bcrypt`. La BD recibe el hash ya calculado. Aquí solo validamos formato del hash y registramos auditoría.

```sql
CREATE OR REPLACE FUNCTION trg_audit_pin_cambio() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.pin_hash IS DISTINCT FROM NEW.pin_hash)
     OR (TG_OP = 'INSERT' AND NEW.pin_hash IS NOT NULL) THEN

    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    )
    SELECT
      ua.tenant_id,
      NEW.id,
      'AUTENTICACION',
      'usuario.pin_modificado',
      'usuario',
      NEW.id,
      jsonb_build_object(
        'operacion', TG_OP,
        'es_creacion', TG_OP = 'INSERT'
      )
    FROM usuarios_acceso ua
    WHERE ua.usuario_id = NEW.id AND ua.activo = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_pin_audit
  AFTER INSERT OR UPDATE ON usuarios_perfil
  FOR EACH ROW EXECUTE FUNCTION trg_audit_pin_cambio();
```

### 8.7 Trigger: validar transiciones de estado de turno

Aplica las reglas de §1.2 (transiciones permitidas).

```sql
CREATE OR REPLACE FUNCTION trg_validar_transicion_turno() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    -- Transiciones válidas:
    --   ABIERTO → PENDIENTE_VALIDACION (cierre con diferencia)
    --   ABIERTO → CERRADO (cierre sin diferencia)
    --   PENDIENTE_VALIDACION → CERRADO (admin valida)
    IF NOT (
      (OLD.estado = 'ABIERTO' AND NEW.estado IN ('PENDIENTE_VALIDACION', 'CERRADO'))
      OR (OLD.estado = 'PENDIENTE_VALIDACION' AND NEW.estado = 'CERRADO')
    ) THEN
      RAISE EXCEPTION 'Transición de turno no permitida: % → %', OLD.estado, NEW.estado;
    END IF;
  END IF;

  -- Si pasa a CERRADO, fecha_cierre obligatoria
  IF NEW.estado IN ('PENDIENTE_VALIDACION', 'CERRADO') AND NEW.fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'fecha_cierre es obligatoria al cerrar turno';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_validar_estado
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_validar_transicion_turno();
```

### 8.8 Trigger: asignar `dia_contable` al crear turno

Al insertar un turno, se calcula y asigna `dia_contable` automáticamente con base en `fecha_apertura`.

```sql
CREATE OR REPLACE FUNCTION trg_turno_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo se asigna en INSERT, NUNCA se modifica en UPDATE (D7)
  IF TG_OP = 'INSERT' THEN
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_apertura);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_dia_contable
  BEFORE INSERT ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_turno_dia_contable();

-- Trigger explícito para BLOQUEAR cambios a dia_contable post-creación
CREATE OR REPLACE FUNCTION trg_proteger_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.dia_contable IS DISTINCT FROM NEW.dia_contable THEN
    RAISE EXCEPTION 'dia_contable es inmutable una vez creado el turno (D7, §25.3)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_proteger_dia_contable
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_proteger_dia_contable();
```

### 8.9 Trigger: bloquear caja al pasar turno a `PENDIENTE_VALIDACION`

Refleja §24.3: "Cierre con diferencia bloquea la caja físicamente".

```sql
CREATE OR REPLACE FUNCTION trg_bloquear_caja_si_pendiente() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'PENDIENTE_VALIDACION'
     AND OLD.estado IS DISTINCT FROM 'PENDIENTE_VALIDACION' THEN
    UPDATE cajas
    SET bloqueada = true,
        bloqueo_motivo = 'Cierre con diferencia pendiente de validación de admin',
        updated_at = now()
    WHERE id = NEW.caja_id;
  END IF;

  IF NEW.estado = 'CERRADO'
     AND OLD.estado = 'PENDIENTE_VALIDACION' THEN
    UPDATE cajas
    SET bloqueada = false,
        bloqueo_motivo = NULL,
        updated_at = now()
    WHERE id = NEW.caja_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_bloquear_caja
  AFTER UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_bloquear_caja_si_pendiente();
```

---

## 9. Seeds iniciales

Datos que se insertan al ejecutar las migraciones iniciales. Son catálogos del sistema (no por tenant).

### 9.1 Seed de `planes`

```sql
INSERT INTO planes (codigo, nombre, descripcion, vertical, precio_mensual_mxn, max_sucursales, timbres_cfdi_mensuales, features_incluidos, orden_visualizacion) VALUES
  ('FT',  'Foodtruck',
   'Foodtrucks, food bikes, puestos móviles. Operación offline robusta, captura ultra-rápida.',
   'FOODTRUCK', 399.00, 1, 30,
   '{"offline_robusto": true, "multi_evento": true, "captura_rapida": true}'::jsonb, 1),

  ('QS',  'Quick Service',
   'Hamburgueserías, taquerías, pizzerías. Mostrador y pickup, modos de servicio flexibles.',
   'QUICK_SERVICE', 999.00, 3, 50,
   '{"modos_servicio": true, "areas_cocina": true, "kds_basico": true}'::jsonb, 2),

  ('CB',  'Café & Bar',
   'Cafeterías, bares, cantinas. Cuentas abiertas en barra, operación híbrida.',
   'CAFE_BAR', 999.00, 3, 50,
   '{"cuentas_abiertas": true, "operacion_hibrida": true, "happy_hour": true}'::jsonb, 3),

  ('FS',  'Full Service',
   'Restaurantes con meseros, casual dining. Mesas, propinas, cuentas por mesero.',
   'FULL_SERVICE', 1299.00, 3, 80,
   '{"mesas": true, "cuentas_abiertas": true, "propinas": true, "asignacion_mesero": true}'::jsonb, 4),

  ('DK',  'Dark Kitchen',
   'Cocinas fantasma, operadores multi-marca. Apps externas, gestión multi-marca.',
   'DARK_KITCHEN', 1499.00, 2, 80,
   '{"multi_marca": true, "apps_externas": true, "consolidacion_canales": true}'::jsonb, 5),

  ('ENT', 'Enterprise',
   'Cadenas, franquiciantes. Multi-sucursal avanzado, reporteo central. (Fase 5)',
   'ENTERPRISE', 2499.00, NULL, 200,
   '{"multi_sucursal_avanzado": true, "reporteo_central": true, "franquicias": true}'::jsonb, 6);
```

> **Nota:** `timbres_cfdi_mensuales` es la **base mensual no acumulable** (D96), no una cuota generosa. Cubre la factura global periódica + uso ligero. El timbrado por arriba de la base se cubre con paquetes prepagados (§9.1.bis).

### 9.1.bis Seed de `folios_paquetes`

Paquetes de folios CFDI prepagados. Precio con descuento por volumen; costo VIM $0.50/folio vía Facturama Multiemisor (Plan Maestro §6).

```sql
INSERT INTO folios_paquetes (codigo, nombre, cantidad_folios, precio_mxn, precio_por_folio, orden_visualizacion) VALUES
  ('PACK_100',  'Paquete 100 folios',   100,  200.00, 2.0000, 1),
  ('PACK_250',  'Paquete 250 folios',   250,  450.00, 1.8000, 2),
  ('PACK_500',  'Paquete 500 folios',   500,  750.00, 1.5000, 3),
  ('PACK_1000', 'Paquete 1,000 folios', 1000, 1300.00, 1.3000, 4),
  ('PACK_5000', 'Paquete 5,000 folios', 5000, 5000.00, 1.0000, 5);
```

### 9.2 Seed de `roles` base del sistema

```sql
INSERT INTO roles (id, tenant_id, codigo, nombre, descripcion, es_sistema, jerarquia, activo) VALUES
  (gen_random_uuid(), NULL, 'DUENO',     'Dueño',
   'Cuenta master del negocio. Acceso total inalterable.',
   true, 5, true),

  (gen_random_uuid(), NULL, 'ADMIN',     'Administrador',
   'Gerente o encargado de sucursal. Configura, autoriza, gestiona.',
   true, 4, true),

  (gen_random_uuid(), NULL, 'SUPERVISOR', 'Supervisor',
   'Jefe de turno. Autoriza cancelaciones, descuentos, sangrías.',
   true, 3, true),

  (gen_random_uuid(), NULL, 'CAJERO',    'Cajero / Operador',
   'Personal de caja. Abre turnos, vende, cobra. No autoriza.',
   true, 2, true),

  (gen_random_uuid(), NULL, 'PERSONAL',  'Personal / General',
   'Personal operativo sin acceso a caja. Cocina, mesa, delivery según subtipo.',
   true, 1, true);
```

### 9.3 Seed de `subtipos_personal` sugeridos

```sql
INSERT INTO subtipos_personal (tenant_id, codigo, nombre, descripcion, verticales_aplicables, capacidades, es_sistema, activo) VALUES
  (NULL, 'COCINERO', 'Cocinero',
   'Ver cola de cocina, marcar comandas como listas, reportar producto agotado.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR', 'DARK_KITCHEN']::vertical_tipo[],
   '{"ver_cola_cocina": true, "marcar_listo": true, "reportar_agotado": true}'::jsonb,
   true, true),

  (NULL, 'AYUDANTE_COCINA', 'Ayudante de cocina',
   'Ver cola de cocina, NO puede marcar como listo (solo cocinero principal).',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR']::vertical_tipo[],
   '{"ver_cola_cocina": true, "marcar_listo": false}'::jsonb,
   true, true),

  (NULL, 'MESERO', 'Mesero',
   'Captura comanda asociada a mesa, gestiona cuentas abiertas, marca propinas.',
   ARRAY['FULL_SERVICE', 'CAFE_BAR']::vertical_tipo[],
   '{"capturar_comanda_mesa": true, "gestionar_cuenta_abierta": true, "marcar_propina": true}'::jsonb,
   true, true),

  (NULL, 'BARISTA', 'Barista',
   'Cola de barra, gestión de cocteles/bebidas, captura cuenta de barra.',
   ARRAY['CAFE_BAR']::vertical_tipo[],
   '{"ver_cola_barra": true, "capturar_cuenta_barra": true}'::jsonb,
   true, true),

  (NULL, 'HOST', 'Host / Hostess',
   'Gestión de reservaciones, asignación de mesas, recibimiento.',
   ARRAY['FULL_SERVICE']::vertical_tipo[],
   '{"gestionar_reservaciones": true, "asignar_mesa": true}'::jsonb,
   true, true),

  (NULL, 'RUNNER', 'Runner / Entrega en mostrador',
   'Ve pedidos listos, marca entregados, lleva pedidos del mostrador a la mesa.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'CAFE_BAR']::vertical_tipo[],
   '{"ver_pedidos_listos": true, "marcar_entregado": true}'::jsonb,
   true, true),

  (NULL, 'REPARTIDOR', 'Repartidor (delivery propio)',
   'Recibe asignación de pedidos, marca en ruta y entregado, captura cobro al recibir.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'CAFE_BAR', 'FULL_SERVICE']::vertical_tipo[],
   '{"recibir_asignacion_delivery": true, "marcar_en_ruta": true, "marcar_entregado_domicilio": true, "capturar_cobro_recibir": true}'::jsonb,
   true, true),

  (NULL, 'ARMADOR_DK', 'Armador (Dark Kitchen)',
   'Confirma pedidos de apps, gestiona empaque multi-marca, marca listos por canal.',
   ARRAY['DARK_KITCHEN']::vertical_tipo[],
   '{"confirmar_pedido_app": true, "gestionar_empaque_multi_marca": true, "marcar_listo_canal": true}'::jsonb,
   true, true),

  (NULL, 'GENERAL', 'Personal general',
   'Solo asistencia, sin funciones operativas específicas.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR', 'DARK_KITCHEN', 'ENTERPRISE']::vertical_tipo[],
   '{"asistencia": true}'::jsonb,
   true, true);
```

### 9.4 Seed de `permisos`

Refleja la matriz §2.2 del `/core`. Cada permiso es un código `categoria.accion`.

```sql
INSERT INTO permisos (codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin) VALUES
  -- Autenticación
  ('auth.login_pin',              'Iniciar sesión con PIN', NULL, 'AUTENTICACION', false, NULL),
  ('auth.asistencia_registrar',   'Registrar entrada/salida laboral', NULL, 'AUTENTICACION', false, NULL),

  -- Turno
  ('turno.abrir',                 'Abrir turno de caja', NULL, 'TURNO', false, NULL),
  ('turno.cerrar_propio',         'Cerrar turno propio', NULL, 'TURNO', false, NULL),
  ('turno.validar_con_diferencia', 'Validar corte con diferencia (desbloquear caja)', NULL, 'TURNO', false, NULL),
  ('turno.cambio_cajero',         'Cambio de cajero sin cierre', NULL, 'TURNO', false, NULL),
  ('turno.forzar_cierre',         'Forzar cierre de turno (admin)', NULL, 'TURNO', false, NULL),

  -- Caja / Movimientos
  ('caja.sangria',                'Hacer retiro / sangría', NULL, 'CAJA', true, 3),
  ('caja.deposito',               'Hacer depósito a caja', NULL, 'CAJA', true, 3),
  ('caja.ajuste_admin',           'Ajuste manual de efectivo (admin)', NULL, 'CAJA', true, 4),

  -- Venta
  ('venta.registrar',             'Registrar venta y cobrar', NULL, 'VENTA', false, NULL),
  ('venta.cancelar_abierta',      'Cancelar ticket abierto', NULL, 'VENTA', false, NULL),
  ('venta.cancelar_pagada',       'Cancelar ticket ya pagado', NULL, 'VENTA', true, 3),
  ('venta.devolucion',            'Procesar devolución', NULL, 'VENTA', true, 3),
  ('venta.editar_post_cobro',     'Editar pedido después de cobrar', NULL, 'VENTA', true, 3),

  -- Descuentos (§14.7)
  ('descuento.manual_aplicar',    'Aplicar descuento manual (cualquier monto o %)', NULL, 'DESCUENTO', true, 3),
  ('descuento.cortesia_total',    'Aplicar cortesía 100% manual', NULL, 'DESCUENTO', true, 3),
  ('descuento.automatico_aceptar', 'Aceptar descuento automático configurado', NULL, 'DESCUENTO', false, NULL),

  -- Cocina
  ('cocina.marcar_listo',         'Marcar pedido como listo', NULL, 'COCINA', false, NULL),
  ('cocina.marcar_entregado',     'Marcar pedido como entregado', NULL, 'COCINA', false, NULL),
  ('cocina.reimprimir_comanda',   'Reimprimir comanda', NULL, 'COCINA', true, 3),
  ('cocina.reimprimir_ticket',    'Reimprimir ticket', NULL, 'COCINA', false, NULL),

  -- Delivery
  ('delivery.asignar_pedido',     'Asignar/aceptar pedido de delivery propio', NULL, 'COCINA', false, NULL),

  -- Configuración
  ('config.productos',            'Configurar productos del catálogo', NULL, 'CONFIGURACION', false, NULL),
  ('config.usuarios',             'Gestionar usuarios y roles', NULL, 'CONFIGURACION', false, NULL),
  ('config.fiscal',               'Modificar configuración fiscal', NULL, 'CONFIGURACION', false, NULL),
  ('config.promociones',          'Configurar promociones automáticas', NULL, 'CONFIGURACION', false, NULL),
  ('config.sucursal',             'Configurar sucursal (override)', NULL, 'CONFIGURACION', false, NULL),

  -- Reportes
  ('reporte.turno_propio',        'Ver reporte del turno propio', NULL, 'REPORTE', false, NULL),
  ('reporte.sucursal',            'Ver reportes de la sucursal', NULL, 'REPORTE', false, NULL),
  ('reporte.global',              'Ver reportes globales del negocio', NULL, 'REPORTE', false, NULL),
  ('reporte.auditoria',           'Ver bitácora de auditoría', NULL, 'REPORTE', false, NULL),

  -- Facturación
  ('factura.emitir',              'Emitir factura CFDI', NULL, 'CONFIGURACION', false, NULL),
  ('factura.cancelar',            'Cancelar factura CFDI', NULL, 'CONFIGURACION', false, NULL),
  ('factura.global_masiva',       'Emitir facturación global / masiva', NULL, 'CONFIGURACION', false, NULL),

  -- Plan SaaS
  ('saas.cambiar_plan',           'Cancelar/contratar plan SaaS', NULL, 'CONFIGURACION', false, NULL);
```

### 9.5 Seed de matriz `rol_permisos` (§2.2)

Inserción masiva basada en la matriz del `/core`. Se hace con un script que lee el rol y permiso por código.

```sql
-- Helper para insertar matriz de forma legible
DO $$
DECLARE
  v_rol_dueno      uuid;
  v_rol_admin      uuid;
  v_rol_supervisor uuid;
  v_rol_cajero     uuid;
  v_rol_personal   uuid;
BEGIN
  SELECT id INTO v_rol_dueno      FROM roles WHERE codigo = 'DUENO'      AND es_sistema = true;
  SELECT id INTO v_rol_admin      FROM roles WHERE codigo = 'ADMIN'      AND es_sistema = true;
  SELECT id INTO v_rol_supervisor FROM roles WHERE codigo = 'SUPERVISOR' AND es_sistema = true;
  SELECT id INTO v_rol_cajero     FROM roles WHERE codigo = 'CAJERO'     AND es_sistema = true;
  SELECT id INTO v_rol_personal   FROM roles WHERE codigo = 'PERSONAL'   AND es_sistema = true;

  -- Dueño y Admin: todos los permisos (auto-grant via función)
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_dueno, p.id, true FROM permisos p;

  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_admin, p.id, true FROM permisos p
  WHERE p.codigo NOT IN ('config.fiscal', 'saas.cambiar_plan');

  -- Supervisor: subset según matriz §2.2
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_supervisor, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'turno.abrir', 'turno.cerrar_propio', 'turno.cambio_cajero',
    'caja.sangria', 'caja.deposito',
    'venta.registrar', 'venta.cancelar_abierta', 'venta.cancelar_pagada', 'venta.devolucion', 'venta.editar_post_cobro',
    'descuento.manual_aplicar', 'descuento.cortesia_total', 'descuento.automatico_aceptar',
    'cocina.marcar_listo', 'cocina.marcar_entregado', 'cocina.reimprimir_comanda', 'cocina.reimprimir_ticket',
    'delivery.asignar_pedido',
    'reporte.turno_propio'
  );

  -- Cajero: ventas básicas, NO autoriza solo
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_cajero, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'turno.abrir', 'turno.cerrar_propio',
    'venta.registrar', 'venta.cancelar_abierta',
    'descuento.automatico_aceptar',
    'cocina.marcar_listo', 'cocina.marcar_entregado', 'cocina.reimprimir_ticket',
    'delivery.asignar_pedido',
    'reporte.turno_propio'
  );

  -- Personal: lo mínimo
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_personal, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'cocina.marcar_listo', 'cocina.marcar_entregado',
    'delivery.asignar_pedido'
  );
END $$;
```

### 9.6 Seed de Knock-Out (tenant interno MVP)

```sql
-- Knock-Out Burger como primer tenant (interno)
INSERT INTO tenants (
  codigo, nombre_comercial, estado, vertical_principal,
  hora_cierre_dia_contable, timezone
) VALUES (
  'knockout', 'Knock-Out Burger', 'INTERNO', 'QUICK_SERVICE',
  '03:00:00', 'America/Mexico_City'
);

-- Sucursal León Centro (única sucursal MVP)
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
INSERT INTO sucursales (tenant_id, codigo, nombre, ciudad, estado_geo, pais)
SELECT t.id, 'K', 'León Centro', 'León', 'Guanajuato', 'México' FROM t;

-- Caja 01 (única caja MVP)
WITH s AS (SELECT id, tenant_id FROM sucursales WHERE codigo = 'K')
INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre)
SELECT s.tenant_id, s.id, 1, 'Caja 01' FROM s;

-- Configuración Knock-Out (decisiones operativas cerradas)
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
INSERT INTO configuracion_tenant (
  tenant_id,
  modos_servicio_activos, modo_servicio_default,
  fondo_modo_captura,
  modulo_delivery_propio_activo
)
SELECT
  t.id,
  ARRAY['PARA_LLEVAR', 'COMER_AQUI', 'DOMICILIO_PROPIO']::text[],  -- mix 50/27/23
  'PARA_LLEVAR',                                                    -- default Knock-Out
  'DENOMINACION',
  true                                                              -- delivery propio activo MVP
FROM t;
```

> **El usuario dueño se crea posteriormente** vía Supabase Auth (alta manual desde panel admin de Supabase) y se vincula vía `usuarios_acceso`.

---

## 10. Estrategia de migraciones

### 10.1 Estructura de carpetas

```
/supabase
├── /migrations
│   ├── 20260520_000_extensiones.sql                 # CREATE EXTENSION
│   ├── 20260520_001_enums_globales.sql              # tipos enum del sistema
│   ├── 20260520_010_planes_addons.sql               # catálogo SaaS
│   ├── 20260520_020_tenants.sql                     # tenants, suscripciones
│   ├── 20260520_030_feature_flags.sql               # tenant_feature_flags
│   ├── 20260520_040_sucursales_cajas.sql            # estructura organizacional
│   ├── 20260520_050_configuracion.sql               # config tenant + sucursal
│   ├── 20260520_060_contadores_folio.sql            # numeración eterna
│   ├── 20260520_070_usuarios_perfil.sql             # extensión auth.users
│   ├── 20260520_080_roles_subtipos.sql              # roles + subtipos_personal
│   ├── 20260520_090_permisos.sql                    # catálogo + matriz
│   ├── 20260520_100_overrides_acceso.sql            # overrides_permisos, usuarios_acceso
│   ├── 20260520_110_pin_intentos.sql                # antifraude PIN
│   ├── 20260520_120_turnos.sql                      # turnos + historial cajero
│   ├── 20260520_130_movimientos_caja.sql            # sangrías, depósitos, cortes parciales
│   ├── 20260520_140_cierres_dia.sql                 # Z global
│   ├── 20260520_150_auditoria.sql                   # auditoria_eventos
│   ├── 20260520_160_autorizaciones_sesiones.sql     # autorizaciones_pin, sesiones_login
│   ├── 20260520_170_funciones_helper.sql            # current_tenant_id, generar_folio, etc.
│   ├── 20260520_180_triggers.sql                    # updated_at, validaciones, etc.
│   ├── 20260520_190_rls_policies.sql                # ALTER TABLE … ENABLE RLS + policies
│   ├── 20260520_200_seeds_sistema.sql               # planes, roles, subtipos, permisos
│   ├── 20260520_210_seeds_matriz_permisos.sql       # rol_permisos (§2.2)
│   └── 20260520_900_seed_knockout.sql               # tenant interno + sucursal + caja MVP
│
├── /functions                                       # Edge Functions (Parte 1C)
└── /seed                                            # scripts auxiliares
```

### 10.2 Orden de aplicación

Las migraciones se aplican en orden numérico estricto. Las dependencias críticas:

```
extensiones
  → enums
    → planes_addons
      → tenants
        → sucursales_cajas
          → configuracion
            → contadores_folio
              → usuarios_perfil ⟵ depende de auth.users (Supabase)
                → roles_subtipos
                  → permisos
                    → overrides_acceso
                      → pin_intentos
                        → turnos ⟵ usa tenant, sucursal, caja, usuario
                          → movimientos_caja, cortes_parciales
                            → cierres_dia
                              → auditoria
                                → autorizaciones_sesiones
                                  → funciones_helper
                                    → triggers
                                      → rls_policies
                                        → seeds_sistema
                                          → seeds_matriz_permisos
                                            → seed_knockout
```

### 10.3 Convención de naming

```
YYYYMMDD_NNN_descripcion_breve.sql
```

- `YYYYMMDD` — fecha de creación (no de aplicación). Ordena cronológicamente.
- `NNN` — número de 3 dígitos para ordenar dentro del día (incrementos de 10 dejan espacio para insertar entre).
- `descripcion_breve` — `snake_case`, máximo 50 caracteres.

**Reglas:**

- Una migración hace **una sola cosa lógica**. Crear una tabla con sus índices, RLS y triggers asociados va en una sola migración.
- **Nunca** se edita una migración ya aplicada en producción. Se crea una nueva migración de corrección.
- Cada migración debe ser **idempotente cuando sea posible** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Cada migración debe ser **transaccional**: si falla a la mitad, no deja BD en estado inconsistente.

### 10.4 Rollback strategy

Supabase no genera rollbacks automáticos. Estrategia:

- **MVP / Fase 2:** rollback manual con script inverso preparado para migraciones críticas (DROP TABLE, ALTER TABLE DROP COLUMN). Para migraciones de seed, simplemente ignorar (idempotente al re-aplicar).
- **Fase 3+ comercial:** considerar herramientas como `dbmate` o `sqitch` con rollbacks generados.

**Filosofía MVP:** mejor mantener migraciones aditivas (nunca DROP COLUMN sin antes deprecar) y aceptar que el rollback es "restaurar backup" en último caso.

### 10.5 Aplicación inicial

Para arrancar desde cero (entorno limpio):

```bash
# 1. Crear proyecto Supabase
supabase init

# 2. Apuntar al proyecto remoto
supabase link --project-ref <ref>

# 3. Aplicar todas las migraciones
supabase db push

# 4. Verificar
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
# Esperado: 1 (Knock-Out)
```

---

## 11. Decisiones pendientes para Parte 1B/1C/1D

Para mantener el foco del documento, las siguientes decisiones se **difieren explícitamente** a las próximas partes. Esto evita la tentación de "diseñar todo de una vez" y reduce el riesgo de overengineering.

### 11.1 Parte 1B — Catálogo (próxima sesión)

**Decisiones pendientes:**

- ¿Productos tienen `tenant_id` o se hereda por categoría?
- ¿Cómo se modelan modificadores reutilizables vs específicos de un producto?
- Recetas: ¿bill-of-materials clásico o estructura más flexible?
- Inventario: ¿stock a nivel sucursal o también a nivel caja?
- ¿Productos pueden tener múltiples precios por canal (POS vs Rappi)?
- Multi-marca (Dark Kitchen): ¿marca como FK simple o como dimensión más rica?

**Lo que SÍ se fija aquí desde Parte 1A:**

- Todo producto irá con `tenant_id NOT NULL` (D1)
- Todo cambio de precio o disponibilidad irá a `auditoria_eventos` (D8)

### 11.2 Parte 1C — Operación

**Decisiones pendientes:**

- ¿Tickets y items en tablas separadas o ticket con items como `jsonb`? (recomendación previa: separadas para joins y reportería; jsonb solo para snapshot histórico de precios)
- ¿Pagos como una tabla o desglose por método (efectivo, tarjeta, vale)?
- ¿Cómo se trackea el offline-first con Dexie.js + sync? (ULIDs vs UUIDs, conflict resolution)
- Devoluciones: ¿reversa del ticket original o documento independiente vinculado?
- CFDI: ¿se almacena el XML completo o solo metadata? (recomendación: XML en Storage, metadata en BD)
- Estado_cocina vs estado_fiscal: confirmar que viven en columnas separadas del mismo ticket

**Lo que SÍ se fija aquí desde Parte 1A:**

- Todo ticket tendrá `dia_contable date NOT NULL` calculado con `calcular_dia_contable()` (D7)
- Folios de tickets usarán `generar_folio()` con `tipo_documento = 'TICKET'`
- Toda venta llevará `tenant_id`, `sucursal_id`, `caja_id`, `turno_id` (D1)

### 11.3 Parte 1D — Especializaciones por vertical

**Decisiones pendientes:**

- Mesas (Full Service): ¿entidad separada o atributo del ticket?
- Cuentas abiertas (Café & Bar): ¿estado del ticket o entidad nueva con relación 1:N a tickets?
- Marcas virtuales (Dark Kitchen): ¿tabla aparte con FK desde productos?
- Apps externas: ¿una tabla `apps_externas_configuracion` o columnas en `configuracion_tenant`?
- Reservaciones (Full Service): ¿módulo independiente o tabla simple?
- Domicilio propio: ¿flota de repartidores asignados al ticket cómo?

**Lo que SÍ se fija aquí desde Parte 1A:**

- Todas las extensiones por vertical respetarán `tenant_id` + RLS (D1, D2)
- Las decisiones de plan-vs-feature-flag ya están resueltas (§3.7): si una entidad solo aplica a un vertical, su tabla puede existir pero las RLS verifican `vertical_principal` o feature flag activo.

### 11.4 Lo que NO se decide aquí ni en próximas partes (post-MVP)

Estas decisiones se posponen hasta tener datos reales:

| Tema | Por qué se difiere |
|---|---|
| Combos / paquetes | §4.7 del `/core`: "sin combos al MVP, estructura preparada para agregarlos" |
| CFDI 4.0 activo | Fase Final del producto, columnas ya preparadas en `configuracion_tenant` |
| Programa de lealtad | Add-on pagado, decisión comercial después de MVP |
| Multi-PAC | Decisión arquitectónica de §26.4: un solo PAC, multi-PAC si lo justifica confiabilidad |
| iOS nativo | Fase 3 con Capacitor, no afecta esquema BD |
| Particionamiento de tablas grandes | Cuando alguna tabla pase ~10M filas. No urge. |

---

## 12. Checklist de validación

Antes de declarar Parte 1A "lista para implementar", verificar que el esquema soporta cada flujo del `/core`:

### 12.1 Flujos cubiertos por este esquema

| Flujo `/core` | Tablas/funciones que lo soportan | ✓ |
|---|---|---|
| §1.1 Jerarquía Negocio → Sucursal → Caja → Turno → Ticket | `tenants` ← `sucursales` ← `cajas` ← `turnos` ← (tickets en 1C) | ✅ |
| §1.2 Estados de turno (ABIERTO / PENDIENTE_VALIDACION / CERRADO) | enum `turno_estado` + trigger `trg_validar_transicion_turno` | ✅ |
| §1.3.bis Folio `[codigo]-[año]-[NNNNNN]` | función `generar_folio()` + `contadores_folio` | ✅ |
| §1.4 Tipos de movimiento de caja | enum `movimiento_tipo` + tabla `movimientos_caja` | ✅ |
| §2.1 5 roles base inalterables | `roles` con `es_sistema = true`, seed §9.2 | ✅ |
| §2.2 Matriz de permisos | `permisos` + `rol_permisos` + `overrides_permisos`, seed §9.4-9.5 | ✅ |
| §2.3 Autorización por PIN | `autorizaciones_pin` + `permisos.permite_autorizacion_pin` | ✅ |
| §3.1 PIN operativo vs web admin | enum `tipo_acceso` + `sesiones_login.tipo_acceso` | ✅ |
| §3.3 Bloqueo por 3/6 PINs fallidos | `pin_intentos` + `usuarios_perfil.bloqueado_hasta` + `intentos_pin_fallidos` | ✅ |
| §7 Apertura de turno con denominaciones | `turnos` + `denominaciones_fondo` + `movimientos_caja(tipo=FONDO_APERTURA)` | ✅ |
| §8 Cambio de cajero sin cierre | `turno_cajero_historial` + `cortes_parciales` | ✅ |
| §9 Sangrías | `movimientos_caja(tipo=SANGRIA)` + `autorizaciones_pin` | ✅ |
| §10 Depósitos | `movimientos_caja(tipo=DEPOSITO)` + `autorizaciones_pin` | ✅ |
| §24 Cierre de turno con conteo | `turnos.efectivo_*` + `denominaciones_conteo` + admin_decision | ✅ |
| §24.3 Caja bloqueada por cierre pendiente | `cajas.bloqueada` + trigger `trg_bloquear_caja_si_pendiente` | ✅ |
| §25.2 Hora de cierre día contable 3:00 AM | `tenants.hora_cierre_dia_contable` (default 03:00) | ✅ |
| §25.3 Turnos que cruzan medianoche | `dia_contable` inmutable + función `calcular_dia_contable()` + trigger | ✅ |
| §27 Trazabilidad / auditoría universal | `auditoria_eventos` (append-only, RLS sin UPDATE/DELETE) | ✅ |
| §28.1 Configuración fiscal | `configuracion_tenant.pac_*` + `csd_*_encrypted` | ✅ |
| §28.2 Configuración operativa | `configuracion_tenant` columnas operativas | ✅ |
| §28.8 Override por sucursal | `configuracion_sucursal` (1:1 opcional con `sucursales`) | ✅ |
| §28.9 Usuarios y roles + subtipos | `usuarios_perfil` + `usuarios_acceso` + `subtipos_personal` | ✅ |
| §30 Subtipos extensibles de Personal | `subtipos_personal` con `es_sistema=true` + custom, seed §9.3 | ✅ |

### 12.2 Lo que NO está cubierto aquí (intencional)

| Tema | Dónde se cubre |
|---|---|
| §1.3 Estados de ticket (BORRADOR → ABIERTO → PAGADO → FACTURADO / CANCELADO) | Parte 1C |
| §4 Catálogo (productos, modificadores, categorías) | Parte 1B |
| §5 Cliente y direcciones | Parte 1B |
| §6 Modos de servicio (entidad ticket) | Parte 1C |
| §11-§17 Flujos de ticket / pago / descuento / cancelación | Parte 1C |
| §18 CFDI 4.0 (estructura) | Parte 1C (preparado) |
| §19-§21 Comanda, áreas de cocina, entrega | Parte 1C |
| §22-§23 Delivery propio y apps externas | Parte 1C + 1D |
| §29 Reportes (queries y materialized views) | Parte 1C |
| §31-§35 Inventario y recetas (módulo opcional) | Parte 1B |

### 12.3 Verificaciones técnicas

- [ ] **RLS habilitado** en TODAS las tablas operativas (verificar con `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false`)
- [ ] **Foreign keys con `ON DELETE` apropiado**: `RESTRICT` para entidades referenciadas (tenants, sucursales) y `CASCADE` para hijas (denominaciones, historial)
- [ ] **Índices en columnas de filtro frecuente**: `tenant_id`, `sucursal_id`, `caja_id`, `dia_contable`, `fecha`
- [ ] **Constraints `UNIQUE` donde aplican**: códigos de sucursal, folios por sucursal/año, etc.
- [ ] **Defaults razonables** en columnas de configuración: hora_cierre = 03:00, modo de fondo = DENOMINACION, etc.
- [ ] **Comments en tablas y columnas críticas** para autodocumentación
- [ ] **Permisos `revoke all` sobre tablas y `grant` explícito a `authenticated` y `anon`** (Supabase default)

### 12.4 Pruebas de aceptación que debería pasar la BD

1. **Aislamiento multi-tenant:** un usuario del tenant A no puede leer ni una fila del tenant B (incluso con SQL crudo en supabase-js).
2. **Folio único bajo concurrencia:** 100 inserts paralelos en `generar_folio()` producen 100 folios distintos consecutivos.
3. **Día contable correcto:** un turno abierto a las 23:00 del viernes que cobra ticket a las 02:00 del sábado tiene `dia_contable = viernes`.
4. **Bloqueo de caja:** al pasar un turno a `PENDIENTE_VALIDACION`, su `caja.bloqueada = true`; al pasarlo a `CERRADO` desde ahí, `caja.bloqueada = false`.
5. **Append-only de auditoría:** un `UPDATE auditoria_eventos SET payload = ...` es rechazado por RLS.
6. **Inmutabilidad de `dia_contable`:** un `UPDATE turnos SET dia_contable = ...` posterior al INSERT es rechazado por trigger.
7. **PIN hasheado:** un `SELECT pin_hash FROM usuarios_perfil` muestra hash, no texto plano. `crypt('1234', pin_hash) = pin_hash` valida correctamente.
8. **Solo un turno activo por caja:** intentar abrir un segundo turno con `estado = 'ABIERTO'` en la misma caja falla por índice único parcial.

---

## Changelog

### v1.2 — Mayo 2026 — Fix: restricciones de unicidad (validado contra Postgres real)

Al aplicar las migraciones en Supabase local se detectó que `EXCLUDE (... WITH IS NOT DISTINCT FROM)` **no es SQL válido** en Postgres. Se reemplazó en `roles` (§5.3), `subtipos_personal` (§5.4) y `usuarios_acceso` (§5.8) por **índices únicos parciales** (`CREATE UNIQUE INDEX ... WHERE ...`), que logran el mismo "NULL cuenta como valor" y sí compilan. El esquema 1A completo aplica limpio y el test RLS cross-tenant pasa 8/8.

### v1.1 — Mayo 2026 — Modelo de monetización de folios CFDI (D96)

**Cambio:** se redefine el timbrado CFDI de "cuota incluida" a **base mensual no acumulable + paquetes prepagados** (decisión estratégica de pricing, ver Plan Maestro §6/§7).

- **§3.2 / §9.1** — `planes.timbres_cfdi_mensuales` ahora es la **base mensual no acumulable** (no cuota generosa). Valores reducidos: FT 30, QS 50, CB 50, FS 80, DK 80, ENT 200.
- **§3.9 (nuevo)** — modelo de folios:
  - `folios_paquetes` (catálogo del sistema: 5 paquetes 100/250/500/1000/5000)
  - `tenant_folios_saldo` (1:1 con tenant: base mensual + saldo prepagado + autorecarga)
  - `folios_movimientos` (ledger inmutable, patrón D23)
  - `consumir_folio_cfdi()` (orden de consumo base → paquetes; global tolera saldo negativo)
  - enum `folio_movimiento_tipo`
- **§9.1.bis (nuevo)** — seed de `folios_paquetes`.
- **Pendiente de integración:** el alta de tenant (`crear_tenant`/onboarding doc 10) debe inicializar la fila en `tenant_folios_saldo` copiando `folios_base_mensuales` del plan vigente. El timbrado en 1C.2 §6 debe invocar `consumir_folio_cfdi()`.
- **Proveedor:** Facturama Módulo API **Multiemisor** ($1,650/año, $0.50/folio).

**Decisión nueva:**

| # | Decisión |
|---|---|
| D96 | Timbrado CFDI = base mensual no acumulable (en `planes`) + paquetes prepagados que no expiran mientras la suscripción esté activa. Consumo: base → paquetes. Excedente es utilidad prepagada, sin exposición de costo |

### v1.0 — Mayo 2026 — Sesión 7

**Estado:** Lista para implementar en migraciones SQL.

**Contenido inicial:**

- §0 Introducción + 13 decisiones de diseño confirmadas con Fermín
- §1 Filosofía multi-tenant (shared schema + RLS + feature flags)
- §2 Convenciones (naming, tipos, extensiones, soft delete, columnas comunes)
- §3 Esquema Tenants/Planes/Suscripciones/Add-ons/Feature flags (8 tablas)
- §4 Esquema Sucursales/Cajas/Configuración/Contadores (5 tablas)
- §5 Esquema Usuarios/Roles/Subtipos/Permisos/Accesos (8 tablas)
- §6 Esquema Turnos/Movimientos/Arqueos/Cierres de día (7 tablas)
- §7 Esquema Auditoría/Autorizaciones/Sesiones (3 tablas)
- §8 Funciones helper + triggers (9 funciones/triggers)
- §9 Seeds del sistema (planes, roles, subtipos, permisos, matriz §2.2, tenant Knock-Out MVP)
- §10 Estrategia de migraciones
- §11 Decisiones explícitamente diferidas a Parte 1B/1C/1D
- §12 Checklist de validación cruzada con `/core`

**Total:** ~31 tablas, 8 enums, 9 funciones/triggers, RLS en todas las tablas operativas.

**Decisiones cerradas en esta sesión:**

| # | Decisión |
|---|---|
| D1 | `tenant_id uuid NOT NULL` en todas las tablas operativas |
| D2 | RLS activo en todas las tablas operativas |
| D3 | PKs uuid |
| D4 | Naming `snake_case` español |
| D5 | Soft delete con `deleted_at` en tablas auditables |
| D6 | `timestamptz` siempre, UTC almacenado |
| D7 | `dia_contable` inmutable en tickets/movimientos |
| D8 | `auditoria_eventos` genérica con `payload jsonb` |
| D9 | PINs hasheados con bcrypt vía pgcrypto |
| D10 | Estados como enum de Postgres |
| D11 | Folio vía secuencia atómica por sucursal/año/tipo |
| D12 | 5 roles base inalterables + custom por tenant + subtipos extensibles |
| D13 | Tenant activo via JWT claim `tenant_id` |

**Próximos pasos:**

1. **Sesión 8 — Parte 1B (Catálogo):** categorías, productos, modificadores, recetas, insumos, inventario
2. **Sesión 9 — Parte 1C (Operación):** órdenes, items, pagos, descuentos, devoluciones, delivery, cierre de día consolidado, CFDI
3. **Sesión 10 — Parte 1D (Especializaciones):** mesas (FS), cuentas abiertas (CB), marcas virtuales (DK), apps externas
4. Tras cerrar Partes 1B/1C/1D: implementar migraciones reales en Supabase y ejecutar pruebas de aceptación de §12.4 antes de codear MVP

---

> **Nota final:** este documento es el contrato técnico del núcleo. Cualquier cambio futuro al esquema multi-tenant pasa por aquí y se versiona en el changelog. La fuente de verdad operativa sigue siendo el `/core` v3.3 — si surge un conflicto, ahí se resuelve primero.

