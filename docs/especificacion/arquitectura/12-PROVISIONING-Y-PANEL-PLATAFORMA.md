# 12 — PROVISIONING Y PANEL DE PLATAFORMA — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** define el plano de plataforma de VIM — cómo se da de alta un cliente (provisioning) y el panel super-admin (`apps/platform`) desde donde VIM gestiona las empresas.
> **Depende de:** 07-1A (tenants, planes, usuarios, folios, auditoría), 07-1F (identidades y JWT), 10 (wizard de onboarding del tenant)
> **Cierra:** el hueco "¿cómo se instala/da de alta un cliente y dónde lo administra VIM?" + reconcilia nombres entre doc 10 y 1A
> **Stack:** Supabase Auth Admin API + Edge Functions + PostgreSQL 15 + Stripe (Fase 3+)

---

## 📋 Tabla de contenidos

- [0. Propósito y los dos planos](#0-propósito-y-los-dos-planos)
- [1. Concepto: no hay "instalación"](#1-concepto-no-hay-instalación)
- [2. Camino A — Alta asistida por VIM (MVP y Fase 2)](#2-camino-a--alta-asistida-por-vim-mvp-y-fase-2)
- [3. Camino B — Contratación en línea con Stripe (Fase 3+)](#3-camino-b--contratación-en-línea-con-stripe-fase-3)
- [4. Función `crear_tenant_con_owner()`](#4-función-crear_tenant_con_owner)
- [5. Tabla `tenant_onboarding_estado`](#5-tabla-tenant_onboarding_estado)
- [6. El panel `apps/platform`](#6-el-panel-appsplatform)
- [7. MVP manual vs. panel Fase 2](#7-mvp-manual-vs-panel-fase-2)
- [8. Reconciliación doc 10 ↔ 1A](#8-reconciliación-doc-10--1a)
- [9. Seguridad del plano de plataforma](#9-seguridad-del-plano-de-plataforma)
- [10. Decisiones de diseño (D97–D103)](#10-decisiones-de-diseño-d97d103)
- [11. Checklist de validación](#11-checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Propósito y los dos planos

VIM POS tiene **dos planos de administración completamente distintos** que no deben confundirse:

| Plano | Quién lo usa | App | Vive en | Qué administra |
|---|---|---|---|---|
| **Tenant** | El dueño/admin de cada negocio | `apps/admin` | Dentro del RLS (su `tenant_id`) | SU negocio: catálogo, usuarios, sucursales, reportes |
| **Plataforma** | VIM (Fermín / equipo) | `apps/platform` | **Fuera del RLS** (`service_role`) | TODAS las empresas: alta, baja, planes, folios, métricas |

Este documento cubre el **plano de plataforma** y el flujo de **provisioning** (cómo nace y se activa un tenant). El plano de tenant ya está en el doc 10 (wizard de configuración).

```
        ┌──────────────────── VIM (plataforma) ────────────────────┐
        │  apps/platform  ·  service_role  ·  fuera de RLS          │
        │  crea / suspende / cancela tenants · folios · métricas    │
        └───────────────────────────┬───────────────────────────────┘
                                     │ provisiona
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
        ┌───────────┐          ┌───────────┐          ┌───────────┐
        │ Tenant A  │          │ Tenant B  │          │ Tenant C  │
        │ apps/admin│          │ apps/admin│          │ apps/admin│  ← cada uno aislado por RLS
        │ apps/pos  │          │ apps/pos  │          │ apps/pos  │
        └───────────┘          └───────────┘          └───────────┘
```

---

## 1. Concepto: no hay "instalación"

Por la arquitectura multi-tenant de schema compartido (Plan Maestro §5), **dar de alta un cliente NO instala ni despliega nada nuevo**. Ya existe:

- Una sola base de datos Supabase sirviendo a todos los tenants.
- Una sola app `admin` y una sola app `pos` desplegadas.

"Instalar" un cliente significa exactamente tres cosas:

1. **Crear su registro `tenant`** (+ dueño + accesos + saldo de folios) en la base que ya corre.
2. **Que el dueño complete el wizard** (doc 10): datos fiscales, sucursal, cajas, usuarios, catálogo.
3. **Provisionar las cuentas de dispositivo** (una por caja, doc 07-1F §1.1) y abrir la app en la tablet (URL en MVP; app Capacitor en Fase 3).

Cero servidores por cliente. Cero despliegues por cliente. Ese es el punto del modelo. **D97.**

---

## 2. Camino A — Alta asistida por VIM (MVP y Fase 2)

En MVP y Fase 2 la venta es asistida: VIM crea el tenant manualmente. Da control mientras se valida el producto con pocos clientes.

### 2.1 Paso a paso

```
1. VIM captura datos del cliente
   (en MVP: Supabase Studio o script; en Fase 2: apps/platform)
   → nombre del negocio, email del dueño, vertical, plan

2. Sistema ejecuta el provisioning (§4):
   a) Supabase Auth Admin API crea el usuario del dueño (email + pwd temporal)
   b) crear_tenant_con_owner() inserta:
      - tenant (estado TRIAL, o INTERNO para Knock-Out)
      - usuarios_perfil + usuarios_acceso (rol DUENO)
      - tenant_folios_saldo (base mensual del plan)
      - tenant_onboarding_estado (fase INVITADO)
   c) Envía email de invitación con magic link

3. El dueño recibe el email → clic en "Activar"
   → define contraseña + PIN + acepta términos
   → onboarding pasa a EN_CONFIGURACION
   → entra al wizard (doc 10, fases 1-8)

4. El dueño completa el wizard + venta de prueba
   → onboarding pasa a GO_LIVE
   → el negocio opera
```

### 2.2 Estados que cruzan dos dimensiones

Importante (resuelve la inconsistencia del doc 10, ver §8): el tenant tiene **dos estados ortogonales**:

- **Estado comercial** (`tenants.estado`, enum de 1A): `TRIAL` → `ACTIVO` → `SUSPENDIDO` → `CANCELADO` (+ `INTERNO`). Es el ciclo de **facturación/suscripción**.
- **Estado de onboarding** (`tenant_onboarding_estado`, nuevo §5): `INVITADO` → `EN_CONFIGURACION` → `GO_LIVE`. Es el progreso de **configuración inicial**.

Un tenant recién creado es `TRIAL` + onboarding `INVITADO`. Un tenant operando es `ACTIVO` + `GO_LIVE`. Son independientes: un tenant puede estar `ACTIVO` comercialmente pero aún `EN_CONFIGURACION`.

### 2.3 Recordatorios y expiración

- Si el dueño no activa en **7 días** → recordatorio automático.
- Si no activa en **30 días** → alerta a VIM; se decide suspender o contactar.

---

## 3. Camino B — Contratación en línea con Stripe (Fase 3+)

El autoservicio total —el cliente contrata sin que VIM intervenga— llega en **Fase 3+**. Mismo provisioning, disparado por Stripe.

```
1. Prospecto en la página de precios → elige plan → Stripe Checkout (paga)
2. Stripe emite webhook  checkout.session.completed
3. Edge Function  stripe-webhook  (service_role):
   a) valida la firma del webhook
   b) Supabase Auth Admin API crea el usuario del dueño
   c) crear_tenant_con_owner(... estado = ACTIVO ...)
   d) registra la suscripción (tabla suscripciones, 1A §3.5) con el customer/subscription de Stripe
   e) envía email de activación
4. De aquí en adelante idéntico al Camino A (activar → wizard → go-live)
```

> **D98:** los webhooks de Stripe son la **única** fuente que cambia el estado comercial del tenant en el Camino B (`ACTIVO`/`SUSPENDIDO`/`CANCELADO` según `invoice.paid`, `payment_failed`, `subscription.deleted`). El cliente nunca edita su propia suscripción directamente (1A §3.8).

> **Fuera de alcance MVP/Fase 2:** este camino. En MVP/Fase 2 solo existe el Camino A. La estructura de `suscripciones` ya está lista en 1A para soportarlo sin migración.

---

## 4. Función `crear_tenant_con_owner()`

El provisioning ocurre en **dos pasos** porque crear el usuario de autenticación es competencia de GoTrue (Supabase Auth), no de SQL:

1. **Paso de aplicación (Edge Function / server action con `service_role`):** `supabase.auth.admin.createUser({ email, password: temporal, email_confirm: false })` → devuelve `user_id`.
2. **Paso SQL:** `crear_tenant_con_owner(user_id, ...)` arma todos los registros de negocio de forma atómica.

```sql
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id   uuid,            -- ya creado vía Auth Admin API
  p_codigo          varchar,         -- slug: 'knockout'
  p_nombre_comercial varchar,
  p_nombre_owner    varchar,
  p_telefono_owner  varchar,
  p_vertical        vertical_tipo,
  p_plan_codigo     varchar,         -- 'QS', 'FT', ...
  p_estado          tenant_estado DEFAULT 'TRIAL',   -- 'INTERNO' para Knock-Out, 'ACTIVO' vía Stripe
  p_notas_internas  text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id   uuid;
  v_plan        planes%ROWTYPE;
  v_rol_dueno   uuid;
  v_periodo     date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
BEGIN
  -- Plan vigente y rol DUENO del sistema
  SELECT * INTO v_plan FROM planes WHERE codigo = p_plan_codigo AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan % no existe o inactivo', p_plan_codigo; END IF;

  SELECT id INTO v_rol_dueno FROM roles WHERE codigo = 'DUENO' AND es_sistema = true;

  -- 1) Tenant
  INSERT INTO tenants (codigo, nombre_comercial, estado, vertical_principal,
                       plan_actual_id, usuario_dueno_id)
  VALUES (p_codigo, p_nombre_comercial, p_estado, p_vertical,
          v_plan.id, p_owner_user_id)
  RETURNING id INTO v_tenant_id;

  -- 2) Perfil del dueño (1:1 con auth.users)
  INSERT INTO usuarios_perfil (id, nombre, telefono, estado)
  VALUES (p_owner_user_id, p_nombre_owner, p_telefono_owner, 'ACTIVO')
  ON CONFLICT (id) DO NOTHING;

  -- 3) Acceso del dueño: rol DUENO, todas las sucursales (sucursal_id NULL)
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (p_owner_user_id, v_tenant_id, NULL, v_rol_dueno);

  -- 4) Saldo de folios: base mensual del plan (D96)
  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales,
                                   folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant_id, COALESCE(v_plan.timbres_cfdi_mensuales, 0), 0, v_periodo, 0);

  -- 5) Estado de onboarding (fase inicial)
  INSERT INTO tenant_onboarding_estado (tenant_id, fase, notas_internas)
  VALUES (v_tenant_id, 'INVITADO', p_notas_internas);

  -- 6) Auditoría
  INSERT INTO auditoria_eventos (tenant_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload)
  VALUES (v_tenant_id, 'SISTEMA', 'tenant.creado', 'tenant', v_tenant_id,
          jsonb_build_object('plan', p_plan_codigo, 'vertical', p_vertical, 'estado', p_estado));

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Provisiona un tenant completo a partir de un auth.users ya creado. Atómico. Solo service_role. Doc 12 §4.';

REVOKE EXECUTE ON FUNCTION crear_tenant_con_owner FROM authenticated, anon, public;
```

> El envío del email de invitación (magic link) lo hace la capa de aplicación tras esta función, vía `supabase.auth.admin.generateLink({ type: 'invite' })`.

---

## 5. Tabla `tenant_onboarding_estado`

Rastrea el progreso de configuración inicial de cada tenant (independiente del estado comercial, §2.2).

```sql
CREATE TYPE onboarding_fase AS ENUM (
  'INVITADO',          -- creado, esperando que el dueño active
  'EN_CONFIGURACION',  -- dueño activó, recorriendo el wizard (doc 10 fases 1-8)
  'GO_LIVE',           -- configuración completa, operando
  'ABANDONADO'         -- no activó en plazo / decidió no continuar
);

CREATE TABLE tenant_onboarding_estado (
  tenant_id           uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  fase                onboarding_fase NOT NULL DEFAULT 'INVITADO',

  -- Progreso fino dentro del wizard (doc 10): 0 = invitado, 1-8 = fases, 9 = go-live
  fase_wizard         integer NOT NULL DEFAULT 0 CHECK (fase_wizard BETWEEN 0 AND 9),

  -- Hitos
  fecha_invitacion    timestamptz NOT NULL DEFAULT now(),
  fecha_activacion    timestamptz NULL,        -- cuando el dueño definió pwd+PIN
  fecha_go_live       timestamptz NULL,

  -- Recordatorios
  recordatorios_enviados integer NOT NULL DEFAULT 0,
  ultimo_recordatorio    timestamptz NULL,

  notas_internas      text NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_fase ON tenant_onboarding_estado(fase);
CREATE INDEX idx_onboarding_pendientes ON tenant_onboarding_estado(fecha_invitacion)
  WHERE fase IN ('INVITADO', 'EN_CONFIGURACION');

COMMENT ON TABLE tenant_onboarding_estado IS
  'Progreso de configuración inicial del tenant. Ortogonal al estado comercial (tenants.estado). Doc 12 §5.';

-- RLS: el tenant lee su propio progreso; VIM lo gestiona vía service_role
ALTER TABLE tenant_onboarding_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_select_tenant ON tenant_onboarding_estado FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 5.1 Ciclo de fases

```
INVITADO ──dueño activa──> EN_CONFIGURACION ──completa wizard──> GO_LIVE
   │                              │
   └──30 días sin activar──> ABANDONADO <──decide no seguir──┘
```

---

## 6. El panel `apps/platform`

La tercera app del monorepo (además de `pos` y `admin`). Es el plano de control interno de VIM. Corre con `service_role` y opera **fuera del RLS**.

### 6.1 Capacidades

| Módulo | Acciones |
|---|---|
| **Empresas** | Listar/buscar tenants, ver detalle, **crear** (Camino A), **suspender / reactivar / cancelar**, cambiar de plan, editar notas internas |
| **Onboarding** | Ver quién está `INVITADO`/`EN_CONFIGURACION`, reenviar invitación, marcar `ABANDONADO` |
| **Folios CFDI** | Ver consumo por tenant, **regalar/ajustar folios** (`AJUSTE_MANUAL` en `folios_movimientos`), gestionar la bolsa con Facturama |
| **Feature flags** | Activar/desactivar flags por tenant (`tenant_feature_flags`): beta, accesos temporales |
| **Suscripciones** | Ver MRR, próximos cobros, historial; (Fase 3+) conciliar con Stripe |
| **Soporte** | **Impersonar** un tenant para diagnosticar (auditado, §9.2) |
| **Métricas globales** | MRR, churn, folios vendidos, tenants activos, uso de infraestructura |

### 6.2 Quién accede

Rol de plataforma `SUPER_ADMIN` (Fermín / equipo VIM). **No vive en `usuarios_acceso`** (ese es a nivel tenant); vive a nivel plataforma. Sus accesos se registran en `super_admin_accesos` (ver §9). **D99.**

---

## 7. MVP manual vs. panel Fase 2

> **D100:** el panel `apps/platform` es **Fase 2**. En MVP no se construye UI; el provisioning se hace con **Supabase Studio + un script** que llama `crear_tenant_con_owner()`. Knock-Out se da de alta así, con `estado = 'INTERNO'`.

| Capacidad | MVP | Fase 2 (`apps/platform`) |
|---|---|---|
| Crear tenant | Script / Studio | UI del panel |
| Suspender/cancelar | `UPDATE tenants` manual | Botón en el panel |
| Ajustar folios | SQL manual | UI |
| Métricas | Queries SQL | Dashboard |
| Impersonación soporte | No (acceso directo a Studio) | Sí, auditada |

Esto evita construir UI de plataforma antes de tener clientes que la justifiquen.

---

## 8. Reconciliación doc 10 ↔ 1A

El doc 10 (escrito antes de cerrar el schema 1A) usa nombres que **no concuerdan** con la implementación. Este documento fija los **nombres canónicos**. **D101.**

| Concepto | Doc 10 (a corregir) | **Canónico (1A + este doc)** |
|---|---|---|
| Estado al crear | `INVITADO` (como `tenant.estado`) | `tenants.estado = 'TRIAL'` (o `'INTERNO'`) + `tenant_onboarding_estado.fase = 'INVITADO'` |
| "En onboarding" | `EN_ONBOARDING` (como estado de tenant) | `tenant_onboarding_estado.fase = 'EN_CONFIGURACION'` |
| Tabla de accesos | `usuarios_acceso_roles` | `usuarios_acceso` (tabla única con `rol_id`) |
| Rol del dueño | `OWNER_TENANT` | `DUENO` |
| Scope | `TENANT_COMPLETO` | `sucursal_id = NULL` en `usuarios_acceso` |
| Tabla de progreso | `tenant_onboarding_estado` (no existía) | **Creada aquí** (§5) |
| Función de alta | `crear_tenant_con_owner()` (no existía) | **Definida aquí** (§4) |
| Vertical "QSR" | `QSR` | `QUICK_SERVICE` (enum `vertical_tipo`) |

> **Acción pendiente:** actualizar el doc 10 para usar estos nombres. No se modifica aquí para no salir del alcance; queda anotado como deuda de documentación.

---

## 9. Seguridad del plano de plataforma

### 9.1 `service_role` nunca toca el cliente

Todas las operaciones de plataforma (crear tenant, ajustar folios, impersonar) corren con `service_role` **solo en el backend de `apps/platform`** (server actions / Edge Functions). La key nunca se expone al navegador. **D102.**

### 9.2 Impersonación auditada

Cuando VIM impersona un tenant para soporte:

```sql
CREATE TABLE super_admin_accesos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  uuid NOT NULL,                    -- quién de VIM
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  accion          varchar(50) NOT NULL,             -- 'IMPERSONAR', 'AJUSTE_FOLIOS', 'CAMBIO_PLAN', etc.
  motivo          text NOT NULL,                     -- obligatorio: por qué
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_super_admin_tenant ON super_admin_accesos(tenant_id, created_at DESC);

COMMENT ON TABLE super_admin_accesos IS
  'Bitácora de toda acción de VIM sobre un tenant. Impersonación exige motivo. Doc 12 §9.2.';
```

- Toda impersonación **exige un motivo** y se registra.
- La sesión de impersonación es de duración corta y claramente marcada en la UI.
- El tenant puede (Fase 2+) ver en su bitácora que VIM accedió y por qué. **D103.**

---

## 10. Decisiones de diseño (D97–D103)

| # | Decisión | Justificación |
|---|---|---|
| **D97** | Alta de cliente = crear registros en BD compartida, sin instalación ni despliegue por cliente | Esencia del multi-tenant shared schema (Plan Maestro §5) |
| **D98** | Estado comercial del tenant lo dirige Stripe (Camino B); el cliente nunca edita su suscripción | Integridad del cobro; coherente con 1A §3.8 |
| **D99** | `SUPER_ADMIN` es rol de plataforma, fuera de `usuarios_acceso`; accesos en `super_admin_accesos` | Separación tajante entre administrar VIM y operar un tenant |
| **D100** | `apps/platform` es Fase 2; en MVP el provisioning es Studio + script | No construir UI de plataforma antes de tener clientes que la justifiquen |
| **D101** | Nombres canónicos fijados aquí; doc 10 a corregir | Eliminar la deriva de nombres entre onboarding y schema |
| **D102** | `service_role` solo en backend de `apps/platform`, jamás en cliente | Una fuga de esa key colapsa el aislamiento multi-tenant |
| **D103** | Estado comercial y estado de onboarding son ortogonales (dos campos/tablas) | Un tenant puede estar ACTIVO pero aún configurándose, y viceversa |

---

## 11. Checklist de validación

- [ ] `crear_tenant_con_owner()` creada, `REVOKE` a roles cliente, `SECURITY DEFINER`
- [ ] Crear tenant inicializa: `tenants`, `usuarios_perfil`, `usuarios_acceso` (DUENO), `tenant_folios_saldo` (base del plan), `tenant_onboarding_estado` (INVITADO)
- [ ] `tenant_onboarding_estado` creada con enum `onboarding_fase` y RLS
- [ ] Flujo Camino A probado: crear → invitar → activar → wizard → go-live
- [ ] Estado comercial (`tenants.estado`) y onboarding (`tenant_onboarding_estado.fase`) se mueven de forma independiente
- [ ] `super_admin_accesos` creada; impersonación exige motivo y se registra
- [ ] `service_role` no aparece en ningún bundle de cliente (pos/admin)
- [ ] Knock-Out dado de alta como `estado = 'INTERNO'` vía script
- [ ] `apps/platform` agregada al monorepo (doc 11) — alcance Fase 2
- [ ] Doc 10 marcado para corrección de nombres (§8)
- [ ] (Fase 3+) Edge Function `stripe-webhook` valida firma y dispara provisioning

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Define el plano de plataforma vs. plano de tenant, los dos caminos de alta (asistido / Stripe), `crear_tenant_con_owner()`, `tenant_onboarding_estado`, el panel `apps/platform`, `super_admin_accesos`, y reconcilia los nombres entre doc 10 y 1A. Decisiones D97–D103. |
