# 13 — ORQUESTACIÓN DEL TIMBRADO CFDI — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** define el "quién/cuándo/cómo" del timbrado CFDI: el motor, los disparadores, los reintentos, la cola offline, la factura global y la gestión de CSD. El modelo de datos ya existe en 1C.2 §6.
> **Depende de:** 07-1C.2 §6 (tablas `tickets_cfdi`, funciones `cfdi_*`), 07-1A §3.9 (`consumir_folio_cfdi`, D96), 10 (onboarding fiscal), 12 (provisioning)
> **Stack:** Facturama API Multiemisor · Supabase Edge Functions (Deno) · pg_cron · Supabase Storage

---

## 📋 Tabla de contenidos

- [0. Propósito y alcance](#0-propósito-y-alcance)
- [1. Arquitectura: un motor, tres disparadores](#1-arquitectura-un-motor-tres-disparadores)
- [2. Estados y la cola de timbrado](#2-estados-y-la-cola-de-timbrado)
- [3. Camino síncrono — factura en mostrador](#3-camino-síncrono--factura-en-mostrador)
- [4. `cfdi-worker` — la cola y el backlog offline](#4-cfdi-worker--la-cola-y-el-backlog-offline)
- [5. Política de reintentos](#5-política-de-reintentos)
- [6. Factura global mensual](#6-factura-global-mensual)
- [7. Gestión de CSD con Facturama Multiemisor](#7-gestión-de-csd-con-facturama-multiemisor)
- [8. Idempotencia y reembolso de folios](#8-idempotencia-y-reembolso-de-folios)
- [9. Cancelación CFDI con el SAT](#9-cancelación-cfdi-con-el-sat)
- [10. Seguridad y secretos](#10-seguridad-y-secretos)
- [11. Decisiones de diseño (D104–D112)](#11-decisiones-de-diseño-d104d112)
- [12. Checklist de validación](#12-checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Propósito y alcance

El modelo de datos del CFDI (tablas `tickets_cfdi`, estados, funciones `cfdi_crear_borrador` / `cfdi_marcar_timbrado` / `cfdi_marcar_error`) ya está en **1C.2 §6**. Lo que faltaba es la **orquestación**: nada dice quién llama al PAC, cuándo, qué pasa si falla, cómo se timbra lo creado offline, ni cómo se emite la factura global. Este documento lo cierra.

**Cubre:**

- ✅ El motor de timbrado y sus disparadores (síncrono, cola, programado)
- ✅ La cola de timbrado sobre `tickets_cfdi` y el backlog offline
- ✅ La política de reintentos (transitorio vs. permanente)
- ✅ La factura global mensual
- ✅ El registro y uso de CSD por tenant en Facturama Multiemisor
- ✅ Idempotencia, reembolso de folios, cancelación con SAT

**No cubre:** el modelo de tablas CFDI (1C.2 §6) ni el modelo de folios (1A §3.9).

---

## 1. Arquitectura: un motor, tres disparadores

Un **único motor de timbrado** (la lógica que construye el XML, llama al PAC y persiste el resultado), invocado por **tres disparadores** distintos.

```
                         ┌────────────────────────────────────┐
   ① Mostrador (online) ─▶│  Edge Function  cfdi-timbrar       │  síncrono (~1-3 s)
                          │                                    │
   ② Cola / backlog ─────▶│   ┌────────────────────────────┐  │
      (offline, errores)  │   │  MOTOR DE TIMBRADO (core)  │  │
      pg_cron → cfdi-worker│   │  build XML → PAC → persist │  │
                          │   └────────────────────────────┘  │
   ③ Cierre de mes ──────▶│  cfdi-global-mensual (pg_cron)     │  1 global/tenant
                          └────────────────────────────────────┘
                                          │
                                          ▼
                              Facturama API Multiemisor
```

- **① `cfdi-timbrar`** (síncrono): el cliente pide factura en el mostrador con internet. Se timbra al momento y se devuelve el CFDI con su QR. **D104.**
- **② `cfdi-worker`** (cola): drena `tickets_cfdi` en estados pendientes/error reintentables. Cubre lo creado **offline** (que llega como `BORRADOR` al sincronizar) y los **reintentos** de errores transitorios. Disparado por `pg_cron`. **D107.**
- **③ `cfdi-global-mensual`** (programado): al cierre de mes, emite un CFDI global por tenant con las ventas a público en general. **D106.**

Los tres comparten el mismo **motor core** (una función/módulo en la Edge Function); solo cambia el disparador y el origen de los datos. **D105.**

---

## 2. Estados y la cola de timbrado

> **D107 — La cola ES `tickets_cfdi`.** No hay tabla de cola separada. Los estados del CFDI + tres columnas de control hacen de cola. Menos piezas, una sola fuente de verdad.

### 2.1 Estados (de 1C.2 §6)

```
BORRADOR ──intento──> EN_PROCESO_TIMBRADO ──éxito──> TIMBRADO ──> (ticket = FACTURADO)
   ▲                          │
   │                          └──error──> ERROR_TIMBRADO
   │                                          │
   └──────reintento (si transitorio)──────────┘
                                              │
                          (si permanente o tope de intentos) → requiere acción manual
```

### 2.2 Columnas de control (extensión a `tickets_cfdi`)

```sql
-- Aditivo a tickets_cfdi (1C.2 §6). Si alguna ya existe, omitir.
ALTER TABLE tickets_cfdi
  ADD COLUMN IF NOT EXISTS intentos            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_reintento_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ultimo_error_codigo  varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS ultimo_error_msg     text NULL,
  ADD COLUMN IF NOT EXISTS error_es_permanente  boolean NOT NULL DEFAULT false;

-- Índice que define "qué está listo para timbrar"
CREATE INDEX IF NOT EXISTS idx_cfdi_cola_pendiente
  ON tickets_cfdi (tenant_id, proximo_reintento_at)
  WHERE estado_sat IN ('BORRADOR','ERROR_TIMBRADO')
    AND error_es_permanente = false;
```

La cola del worker = `WHERE estado_sat IN ('BORRADOR','ERROR_TIMBRADO') AND error_es_permanente = false AND (proximo_reintento_at IS NULL OR proximo_reintento_at <= now())`.

---

## 3. Camino síncrono — factura en mostrador

Cuando el cliente pide factura al pagar (online):

```
1. cfdi_crear_borrador(ticket_id)             → fila BORRADOR (1C.2 §11.6)
2. consumir_folio_cfdi(tenant_id, cfdi_id)    → reserva 1 folio (1A §3.9, D96)
   └─ si SIN_FOLIOS y no es global → abortar, UI "compra un paquete"
3. UPDATE estado_sat = 'EN_PROCESO_TIMBRADO'
4. Edge Function cfdi-timbrar:
   a) construye XML 4.0 (datos ticket + emisor + receptor)
   b) POST Facturama (issuer = RFC del tenant, §7)
   c) éxito → cfdi_marcar_timbrado(cfdi_id, uuid, xml_path, ...)  → TIMBRADO
              (trigger: ticket pasa a FACTURADO)
   d) error  → clasificar (§5) → cfdi_marcar_error(...) + reembolso folio si permanente
5. Devolver al POS: CFDI con UUID + QR (o mensaje de error accionable)
```

**Fallback offline:** si no hay conexión al llegar al paso 4, el CFDI queda en `BORRADOR` y el `cfdi-worker` lo tomará al reconectar (§4). El cajero ve "Factura en proceso, se enviará al correo". **D104.**

> La factura se entrega por: pantalla con QR + envío al `email_fiscal` del receptor (Facturama puede enviar el PDF/XML, o lo hace la capa de servicios).

---

## 4. `cfdi-worker` — la cola y el backlog offline

Drena la cola: lo creado offline (que sincroniza como `BORRADOR`) y los reintentos.

### 4.1 Disparo con pg_cron

```sql
-- Cada 2 minutos, invoca la Edge Function cfdi-worker vía pg_net
SELECT cron.schedule(
  'cfdi-worker',
  '*/2 * * * *',
  $$ SELECT net.http_post(
       url := 'https://<proj>.supabase.co/functions/v1/cfdi-worker',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.worker_token'))
     ); $$
);
```

### 4.2 Lógica del worker

```ts
// supabase/functions/cfdi-worker/index.ts (resumen)
// Corre con service_role. Procesa un lote acotado por invocación.
const pendientes = await admin
  .from('tickets_cfdi')
  .select('*')
  .in('estado_sat', ['BORRADOR', 'ERROR_TIMBRADO'])
  .eq('error_es_permanente', false)
  .or('proximo_reintento_at.is.null,proximo_reintento_at.lte.now()')
  .order('created_at')
  .limit(50);                       // lote acotado: no saturar el PAC

for (const cfdi of pendientes) {
  await timbrarCore(cfdi);          // MISMO motor que cfdi-timbrar
}
```

- **Lote acotado** (ej. 50) por corrida para no saturar el PAC ni exceder el tiempo de la Edge Function. **D109.**
- **Idempotente:** si una fila ya está `TIMBRADO` (otra corrida la tomó), se omite (§8).
- El backlog offline se procesa solo: al reconectar el POS, el ticket + su CFDI `BORRADOR` sincronizan (1C.2 §10) y el worker los timbra en la siguiente corrida.

---

## 5. Política de reintentos

> **D110 — Transitorio se reintenta con backoff; permanente NO.** La clasificación del error decide todo.

### 5.1 Clasificación

| Tipo | Ejemplos | Acción |
|---|---|---|
| **Transitorio** | Timeout del PAC, 5xx, red caída, rate limit | Reintentar con backoff exponencial |
| **Permanente** | RFC receptor inválido, CSD vencido/revocado, código postal no coincide, rechazo SAT por validación | `error_es_permanente = true` → **no reintentar**, marcar para corrección manual + **reembolsar folio** |

La capa de servicios mapea los códigos de error de Facturama a estas dos categorías (tabla de mapeo mantenida en el código).

### 5.2 Backoff

```
proximo_reintento_at = now() + (2 ^ intentos) minutos   -- 1, 2, 4, 8, 16, 32...
```

- Tope de **8 intentos** transitorios (~4 h acumuladas). Al superarlo → se marca `error_es_permanente = true` y se **alerta a VIM** (no se pierde, queda visible para soporte). **D111.**
- Los permanentes alertan al **tenant** ("revisa el RFC del cliente / tu CSD") en la primera ocurrencia.

### 5.3 `cfdi_marcar_error` (extensión)

```sql
-- Extiende la función de 1C.2 §11. Recibe la clasificación ya hecha por el servicio.
-- Si permanente: error_es_permanente = true, proximo_reintento_at = NULL.
-- Si transitorio: intentos+1, proximo_reintento_at = backoff, salvo que intentos >= 8 → permanente.
```

---

## 6. Factura global mensual

Emite un CFDI global por tenant que agrupa las ventas a **público en general** (tickets pagados sin CFDI individual) del mes. **Frecuencia: mensual** (D106).

### 6.1 Disparo

```sql
-- Día 1 de cada mes, 05:00, procesa el mes anterior por tenant
SELECT cron.schedule(
  'cfdi-global-mensual',
  '0 5 1 * *',
  $$ SELECT net.http_post(url := 'https://<proj>.supabase.co/functions/v1/cfdi-global-mensual', ...); $$
);
```

### 6.2 Lógica

```
Para cada tenant ACTIVO/INTERNO con CFDI habilitado:
  1. Reúne los tickets PAGADOS del mes anterior SIN tickets_cfdi individual
     (= ventas a público en general)
  2. Si el conjunto está vacío → no emite nada
  3. cfdi_crear_borrador_global(tenant_id, periodo) → 1 fila tickets_cfdi tipo GLOBAL
  4. consumir_folio_cfdi(tenant_id, cfdi_id, p_es_global := true)   -- tolera saldo negativo
  5. timbrarCore() con receptor genérico "Público en General" (RFC XAXX010101000)
  6. éxito → TIMBRADO; error → cola de reintentos (§5)
```

- **1 folio/mes** por la global (mínimo de consumo de cualquier tenant). **D106.**
- La global **tolera saldo de folios negativo** (1A §3.9): el cumplimiento SAT nunca se bloquea por falta de folios.
- Configurable a diaria/semanal en el futuro sin migración (la frecuencia es un parámetro del cron + config del tenant).

---

## 7. Gestión de CSD con Facturama Multiemisor

Para timbrar a nombre de un tenant se necesita su **CSD** (Certificado de Sello Digital del SAT: `.cer` + `.key` + contraseña). Con **Facturama Multiemisor**, VIM tiene UNA cuenta y registra cada emisor (RFC) con su CSD.

### 7.1 Flujo de alta (en onboarding fiscal, doc 10 Fase 1)

```
1. El dueño sube su .cer, .key y contraseña del CSD en el wizard
2. La capa de servicios (service_role) los envía a Facturama:
   POST /csd  (multiemisor) → registra el emisor RFC en Facturama
3. Facturama valida el CSD contra el SAT y devuelve un handle/confirmación
4. VIM guarda en BD SOLO: el RFC, el handle de Facturama y metadata (vigencia del cert).
   El .key y la contraseña NUNCA se guardan en claro en nuestra BD. (D112)
5. tenant_feature_flags: 'cfdi_activo' = true
```

### 7.2 Tabla de referencia (mínima)

```sql
CREATE TABLE tenant_cfdi_emisor (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  rfc                varchar(13) NOT NULL,
  facturama_issuer_ref varchar(100) NOT NULL,        -- handle del emisor en Facturama
  csd_vigencia_hasta date NULL,                       -- para alertar antes de que venza
  estado             varchar(20) NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO | CSD_VENCIDO | SUSPENDIDO
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_cfdi_emisor ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfdi_emisor_select_tenant ON tenant_cfdi_emisor FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- Escritura solo service_role (alta/renovación del CSD).
```

### 7.3 Alertas

- `csd_vigencia_hasta` permite alertar al tenant **30 días antes** de que venza su CSD (un CSD vencido = todos sus timbrados fallan como error permanente).

---

## 8. Idempotencia y reembolso de folios

> **D108 (idempotencia):** ningún CFDI se timbra dos veces.

- **Guard de estado:** el motor solo timbra filas en `BORRADOR`/`ERROR_TIMBRADO`. Antes de llamar al PAC, relee el estado con `FOR UPDATE`; si ya está `EN_PROCESO`/`TIMBRADO`, se omite (otra corrida lo tomó).
- **Clave de idempotencia hacia el PAC:** se envía el `cfdi_id` como referencia; si Facturama ya tiene un timbre para esa referencia, se reusa en vez de duplicar.
- **Reembolso de folio:** si el timbrado falla de forma **permanente**, el folio reservado en el paso 2 se reembolsa con un movimiento `AJUSTE_MANUAL` (+1) en `folios_movimientos` (1A §3.9). Así un error no consume folio del tenant.

```
consumir_folio_cfdi (−1)  →  intento PAC  →  permanente?  →  AJUSTE_MANUAL (+1)
```

---

## 9. Cancelación CFDI con el SAT

Un CFDI timbrado no se borra; se **cancela** ante el SAT (proceso con acuse).

```
1. Usuario (ADMIN+, con PIN) solicita cancelar → motivo SAT (01/02/03/04)
2. Edge Function cfdi-cancelar → POST Facturama /cancel
3. SAT puede requerir aceptación del receptor (motivo 01) → estado PENDIENTE_ACEPTACION
4. Al confirmarse → cfdi_marcar_cancelado_sat(cfdi_id, acuse_path) (1C.2 §11)
   - se guarda el ACUSE de cancelación en Supabase Storage
   - el ticket vuelve de FACTURADO al estado fiscal previo según reglas de 1C.2 §5
5. El folio NO se reembolsa en cancelación (ya se consumió el timbre ante el SAT)
```

- La ventana y reglas (72 h, con/sin aceptación) las dicta el SAT; la capa de servicios refleja el estado que devuelve Facturama.

---

## 10. Seguridad y secretos

| Secreto | Dónde | Nota |
|---|---|---|
| `FACTURAMA_API_KEY` | Edge Functions (`cfdi-timbrar`, `cfdi-worker`, `cfdi-global-mensual`, `cfdi-cancelar`) | nunca en cliente |
| `app.worker_token` | setting de Postgres para que pg_cron autentique el llamado a la Edge Function | rotable |
| CSD `.key` + contraseña | **se envían a Facturama, no se persisten en claro** en nuestra BD | D112 |

- Todas las Edge Functions de CFDI corren con `service_role` (operan sobre `tickets_cfdi`, `folios_*`, `tenant_cfdi_emisor` saltando RLS de forma controlada).
- Las acciones de cancelación se registran en `auditoria_eventos` (categoría `COBRO`/`SISTEMA`) con el usuario que autorizó (PIN).

---

## 11. Decisiones de diseño (D104–D112)

| # | Decisión | Justificación |
|---|---|---|
| **D104** | Factura en mostrador = timbrado **síncrono** online, con fallback a cola si offline | Cliente se va con su factura; sin internet no se rompe, se encola |
| **D105** | Un solo **motor de timbrado** compartido por los 3 disparadores (síncrono, worker, global) | Una sola lógica de XML+PAC+persistencia; sin duplicación |
| **D106** | Factura global **mensual** por default (1 folio/mes); configurable a futuro sin migración | Mínimo consumo de folios, cumple SAT, simple para SMB |
| **D107** | La **cola es `tickets_cfdi`** + columnas de control; sin tabla de cola separada | Una sola fuente de verdad, menos piezas |
| **D108** | Idempotencia por guard de estado + clave `cfdi_id` hacia el PAC | Nunca doble-timbrar, ni en reintentos ni en corridas paralelas |
| **D109** | `cfdi-worker` procesa **lotes acotados** (≤50) por corrida vía pg_cron | No saturar el PAC ni exceder el tiempo de la Edge Function |
| **D110** | Reintentos solo para errores **transitorios** (backoff exp.); permanentes a corrección manual + reembolso de folio | No machacar al PAC con errores que nunca pasarán |
| **D111** | Tope de **8 intentos**; al superarlo se marca permanente y se alerta a VIM | El CFDI nunca se pierde silenciosamente |
| **D112** | El `.key`/contraseña del CSD **se envían a Facturama, no se persisten en claro**; BD guarda solo el handle del emisor | Minimiza superficie de fuga de un secreto fiscal crítico |

---

## 12. Checklist de validación

- [ ] Columnas de control agregadas a `tickets_cfdi` (`intentos`, `proximo_reintento_at`, `ultimo_error_codigo`, `error_es_permanente`) + índice de cola
- [ ] Edge Function `cfdi-timbrar` (síncrono) con motor core compartido
- [ ] Edge Function `cfdi-worker` + `pg_cron` cada 2 min; procesa lote ≤50
- [ ] Camino síncrono: borrador → consumo folio → PAC → TIMBRADO → ticket FACTURADO
- [ ] Fallback offline: sin conexión → BORRADOR → worker lo timbra al reconectar
- [ ] Clasificación transitorio/permanente mapeada desde códigos de Facturama
- [ ] Backoff exponencial; tope 8 intentos → permanente + alerta a VIM
- [ ] `cfdi-global-mensual` con `pg_cron` (día 1, 05:00); agrega público en general; 1 folio; tolera saldo negativo
- [ ] `tenant_cfdi_emisor` creada; CSD registrado en Facturama; `.key` NO en claro en BD
- [ ] Alerta de CSD por vencer (30 días antes)
- [ ] Idempotencia: fila ya TIMBRADO se omite; reembolso de folio en error permanente
- [ ] Cancelación con acuse del SAT almacenado en Storage; auditoría con PIN
- [ ] `FACTURAMA_API_KEY` y `app.worker_token` solo en servidor/Edge

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Orquestación del timbrado: motor único + 3 disparadores (síncrono `cfdi-timbrar`, cola `cfdi-worker` vía pg_cron, `cfdi-global-mensual`). Cola sobre `tickets_cfdi` con columnas de reintento. Política transitorio/permanente con backoff. Factura global mensual. Gestión de CSD con Facturama Multiemisor (sin persistir `.key`). Idempotencia y reembolso de folios. Cancelación con SAT. Decisiones D104–D112. |
