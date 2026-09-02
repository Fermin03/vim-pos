# 07 — ARQUITECTURA TÉCNICA — Parte 1C.1: Operación de venta (tickets, items, pagos, descuentos, promociones aplicadas)

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** tercera entrega de la arquitectura técnica de VIM POS
> **Alcance de esta parte:** ciclo de vida del ticket en vivo — apertura, captura de productos y modificadores, descuentos manuales con PIN, promociones automáticas aplicadas, notas a cocina y cliente, pago (simple y dividido), recálculo de totales, transición de estados fiscal y de cocina hasta `PAGADO`
> **Depende de:** Parte 1A (tenants, sucursales, turnos, auditoría, folio) + Parte 1B (productos, modificadores, clientes, promociones, recetas, inventario)
> **Stack:** PostgreSQL 15 vía Supabase, Row Level Security activo
> **Continúa en:** Parte 1C.2 (devoluciones, cancelaciones, CFDI, delivery propio, apps externas, sync offline)

---

> ## ⚠️ Reconciliación post-validación (F1)
> Nombres canónicos confirmados al validar (bitácora Playbook doc 18 §4; migración `0008`):
> - Constraint de folio de ticket: **`ticket_folio_unico_por_sucursal`** (el nombre `folio_unico_por_sucursal` ya lo usa `cortes_parciales` en 1A; los índices son globales).
> - Totales del ticket: **`descuentos_manuales_mxn`**, **`promociones_mxn`**, **`subtotal_bruto_mxn`**, **`iva_item_mxn`**, **`total_item_mxn`**.
> - Descuento manual: monto = **`monto_descontado_mxn`**; motivo = **`motivo_categoria`** (enum `descuento_manual_motivo`).

## 📋 Tabla de contenidos

- [0. Introducción y dependencias](#0-introducción-y-dependencias)
- [1. Filosofía del ticket operativo](#1-filosofía-del-ticket-operativo)
- [2. Convenciones (recap)](#2-convenciones-recap)
- [3. Esquema: Tickets](#3-esquema-tickets)
- [4. Esquema: Ticket items y modificadores aplicados](#4-esquema-ticket-items-y-modificadores-aplicados)
- [5. Esquema: Pagos](#5-esquema-pagos)
- [6. Esquema: Descuentos manuales aplicados](#6-esquema-descuentos-manuales-aplicados)
- [7. Esquema: Promociones aplicadas](#7-esquema-promociones-aplicadas)
- [8. Funciones helper y triggers](#8-funciones-helper-y-triggers)
- [9. RLS consolidada](#9-rls-consolidada)
- [10. Estrategia de migraciones (continuación)](#10-estrategia-de-migraciones-continuación)
- [11. Decisiones pendientes para Parte 1C.2 y 1D](#11-decisiones-pendientes-para-parte-1c2-y-1d)
- [12. Checklist de validación](#12-checklist-de-validación)

---

## 0. Introducción y dependencias

### 0.1 Propósito de este documento

Esta Parte 1C.1 define **cómo nace y se cobra un ticket** en VIM POS. Es la operación más crítica de un POS: si esto falla, no se vende. Por lo mismo, es donde concentramos los triggers más estrictos, la atomicidad más cuidada y los snapshots más defensivos.

**Distinción clave con partes anteriores:**

- **Parte 1A** modeló *quién opera dónde* (tenants, usuarios, turnos, cajas).
- **Parte 1B** modeló *qué se vende y a quién* (productos, modificadores, clientes, recetas).
- **Parte 1C.1** modela *cómo se vende* (tickets, items, pagos en caliente).
- **Parte 1C.2** modelará *qué pasa después* (devoluciones, cancelaciones, CFDI, delivery propio, apps externas, sync).
- **Parte 1D** modelará *especializaciones por vertical* (mesas, cuentas abiertas, multi-marca operativa).

### 0.2 Alcance

**Esta Parte 1C.1 cubre:**

- ✅ Tabla `tickets` con estados fiscal y de cocina paralelos, folio atómico, día contable inmutable
- ✅ Tabla `ticket_items` con **snapshot completo del producto** al momento de la venta (resistente a soft delete y cambios de precio)
- ✅ Tabla `ticket_item_modificadores` con snapshot de opciones aplicadas
- ✅ Tabla `pagos` (1:N con tickets) para pagos simples y divididos
- ✅ Tabla `ticket_descuentos_manuales` con vínculo obligatorio a `autorizaciones_pin` de Parte 1A
- ✅ Tabla `ticket_promociones_aplicadas` para promociones automáticas detectadas y aplicadas
- ✅ Notas al producto (en `ticket_items.nota_cocina`) y al ticket (en `tickets.nota_general` con flags de destino)
- ✅ Pedidos en espera (etiqueta libre en `tickets.etiqueta_espera`)
- ✅ Folio externo de apps externas (captura manual, columnas en `tickets`)
- ✅ Función `recalcular_totales_ticket()` como punto único de verdad para subtotales/IVA/total
- ✅ Funciones de transición de estado fiscal y de cocina con validación
- ✅ Descuento automático de inventario al pagar (invoca `descontar_inventario_por_venta()` de Parte 1B)
- ✅ Idempotencia para sync offline vía `client_id_local`

**Lo que NO cubre (intencional, va a 1C.2):**

- ❌ Devoluciones (`devoluciones`, `devolucion_items`)
- ❌ Cancelaciones de tickets pagados (`cancelaciones_ticket`)
- ❌ CFDI 4.0 (`tickets_cfdi`, XML en Storage)
- ❌ Delivery propio (`delivery_asignaciones`, liquidación)
- ❌ Apps externas (validación de conciliación, reportes de liquidación)
- ❌ Estado de cocina extendido para delivery (`EN_RUTA`, `ENTREGADO_DOMICILIO`)
- ❌ Sync offline (estrategia completa, conflict resolution detallado, edge cases)
- ❌ Reimpresión de comanda y formato (queda como flag aquí, la mecánica va en 1C.2)

**Lo que NO cubre ninguna parte de 1C (queda para 1D):**

- ❌ Mesas (Full Service)
- ❌ Cuentas abiertas (Café & Bar)
- ❌ Multi-marca operativa (Dark Kitchen — la columna `marca_virtual_id` ya existe en `productos` por D25; aquí solo la propagamos a `tickets`)
- ❌ Reservaciones

### 0.3 Dependencias con Partes 1A y 1B

Toda tabla de 1C.1 referencia entidades de 1A/1B:

| Referencia | Tipo | Origen |
|---|---|---|
| `tenants(id)` | FK obligatoria | Parte 1A §3 |
| `sucursales(id)` | FK obligatoria | Parte 1A §4 |
| `cajas(id)` | FK obligatoria | Parte 1A §4 |
| `turnos(id)` | FK obligatoria | Parte 1A §6 |
| `auth.users(id)` | FK para `usuario_*` | Supabase Auth (Parte 1A §5) |
| `autorizaciones_pin(id)` | FK obligatoria en descuentos manuales | Parte 1A §7.3 |
| `productos(id)` | FK opcional (nullable por soft delete) | Parte 1B §3.3 |
| `categorias(id)` | FK opcional (snapshot también) | Parte 1B §3.2 |
| `opciones_modificador(id)` | FK opcional en modificadores aplicados | Parte 1B §3.5 |
| `grupos_modificadores(id)` | FK opcional en modificadores aplicados | Parte 1B §3.4 |
| `clientes(id)` | FK opcional | Parte 1B §5.2 |
| `direcciones_cliente(id)` | FK opcional para delivery | Parte 1B §5.3 |
| `marcas_virtuales(id)` | FK opcional (DK) | Parte 1B §7.1 |
| `promociones(id)` | FK obligatoria en promociones aplicadas | Parte 1B §6.2 |

**Funciones reutilizadas de partes previas:**

- `current_tenant_id()` — Parte 1A §8.1 — para RLS
- `current_sucursal_id()` — Parte 1A §8.2 — para RLS y defaults
- `calcular_dia_contable(tenant_id, ts)` — Parte 1A §8.3 — para `tickets.dia_contable` (D7)
- `generar_folio(sucursal_id, tipo_documento, anio)` — Parte 1A §8.4 — para `tickets.folio_completo` (D11)
- `set_updated_at()` — Parte 1A §8.5 — para mantenimiento de `updated_at`
- `descontar_inventario_por_venta(ticket_id)` — Parte 1B §9.6 — invocada por trigger al pagar
- `aplicar_movimiento_inventario(...)` — Parte 1B §9.2 — uso interno

### 0.4 Nuevas decisiones de diseño (D33-D47 que aplican a 1C.1)

Las decisiones D1-D32 de Partes 1A y 1B siguen vigentes intactas. Estas decisiones son nuevas y aplican específicamente al modelo operativo de venta. Las que se refieren a post-venta, CFDI y sync se desarrollan en 1C.2 pero se enumeran aquí para que el conjunto D33-D47 quede declarado en este punto.

| # | Decisión | Justificación |
|---|---|---|
| **D33** | `tickets` y `ticket_items` en **tablas separadas** (no `jsonb` embebido) | Joins eficientes para reportes; índices independientes; soft delete por línea posible |
| **D34** | Snapshot de catálogo via **campos duplicados** en `ticket_items` (nombre, precio, IVA, claves SAT). No tabla snapshot aparte | Resistente a cambios de precio y soft delete sin tabla extra. KISS |
| **D35** | `pagos` como tabla 1:N con `metodo_pago` como enum, no tabla por método | Soporta pago dividido (§17.3) sin proliferación de tablas |
| **D36** | `estado_fiscal` y `estado_cocina` como **columnas separadas** del mismo ticket (no estados combinados) | Refleja §1.3 + §20 del `/core`: planos independientes con transiciones propias |
| **D37** | Devoluciones como **documento independiente** (`devoluciones` + `devolucion_items`) vinculado al ticket original — no reversa | (Aplica a 1C.2) §15.3: ticket original mantiene estado PAGADO; limpio para nota de crédito CFDI |
| **D38** | Cancelaciones: cambio de `estado_fiscal` a `CANCELADO` + tabla `cancelaciones_ticket` con motivo/autorización | (Aplica a 1C.2) §13.4: folio se preserva, ticket nunca se borra |
| **D39** | CFDI: tabla `tickets_cfdi` 1:1 opcional con tickets, XML en **Supabase Storage**, metadata (UUID, folio fiscal, estado SAT) en BD | (Aplica a 1C.2) Activable Fase Final sin migración |
| **D40** | Sync offline: **UUIDs v4** (no ULIDs), `client_id_local varchar UNIQUE` para deduplicación al subir, last-write-wins por `updated_at` con reglas específicas | D3 ya cerró uuid; el client_id_local es el ancla de idempotencia. ULIDs no aportan valor extra |
| **D41** | Promociones aplicadas y descuentos manuales en **tablas separadas** (`ticket_promociones_aplicadas`, `ticket_descuentos_manuales`) | §14.1: semánticas, autorización y reportes distintos |
| **D42** | Totales del ticket: campos almacenados (subtotal, descuentos, promociones, IVA, total) recalculados vía función `recalcular_totales_ticket(ticket_id)` invocada por triggers en items/pagos/descuentos/promos | Lectura barata, único punto de verdad, evita drift |
| **D43** | Delivery propio: tabla `delivery_asignaciones` 1:1 opcional con ticket (timestamps salida/regreso, repartidor_id, liquidación) | (Aplica a 1C.2) §22 versión MVP, estados intermedios en Fase 2 sin migrar |
| **D44** | Apps externas: columnas `folio_externo_app` y `app_externa_modo` directamente en `tickets` — no tabla separada MVP | §23: captura manual simple, conciliación es un reporte (1C.2) |
| **D45** | Pedidos en espera: campo `etiqueta_espera varchar` en tickets, `estado_fiscal = ABIERTO` mientras espera, no tabla aparte | §12: lo más simple, índice parcial |
| **D46** | Notas: dos campos en `tickets` (`nota_general`, flags `imprime_en_comanda`/`imprime_en_ticket`) + un campo `nota_cocina` en `ticket_items` | §11: ambos tipos en columnas, no tabla |
| **D47** | Modificadores aplicados: tabla `ticket_item_modificadores` con FK opcional a `opciones_modificador` + snapshot de nombre/precio_extra/naturaleza. Ya referenciada por `descontar_inventario_por_venta()` de 1B §9.6 | Cierra el contrato implícito con Parte 1B |

### 0.5 Tablas que esta parte añade

| # | Tabla | Propósito |
|---|---|---|
| 1 | `tickets` | Documento de venta principal |
| 2 | `ticket_items` | Líneas del ticket con snapshot del producto |
| 3 | `ticket_item_modificadores` | Modificadores aplicados a cada línea con snapshot |
| 4 | `pagos` | Pagos del ticket (1:N) con método y referencia |
| 5 | `ticket_descuentos_manuales` | Descuentos manuales aplicados con PIN |
| 6 | `ticket_promociones_aplicadas` | Promociones automáticas que efectivamente se aplicaron |

**Total: 6 tablas operativas nuevas, 5 enums nuevos, 9 funciones nuevas, 8 triggers nuevos.**

---

## 1. Filosofía del ticket operativo

### 1.1 El ticket como agregado

En VIM POS un ticket es la **unidad de venta**: un conjunto cohesivo de líneas, modificadores, descuentos, promociones y pagos que se procesa transaccionalmente. Cada vez que el cajero toca "Nuevo ticket" se crea una fila en `tickets`. Cada producto agregado crea una fila en `ticket_items`. Cada modificador aplicado crea una fila en `ticket_item_modificadores`. Cada pago crea una fila en `pagos`.

**Implicación práctica:** un ticket es huérfano sin sus items, y los items son huérfanos sin su ticket. La integridad referencial se hace cumplir vía FKs con `ON DELETE CASCADE` desde la fila padre hacia las hijas.

**Sin embargo, soft delete:** los tickets nunca se eliminan físicamente (D5, §27 del `/core`). Lo que cambia es su `estado_fiscal` a `CANCELADO`. Los items pueden cancelarse individualmente sin cancelar el ticket completo (flag `cancelado` en `ticket_items` para edición pre-cobro, §16 del `/core`).

### 1.2 Dos planos de estado paralelos

Un ticket tiene **dos vidas en paralelo** (D36):

```
┌─────────────────────────────────────────────────────────────┐
│  estado_fiscal:    BORRADOR → ABIERTO → PAGADO → FACTURADO  │
│                                          │                  │
│                                          └→ CANCELADO       │
├─────────────────────────────────────────────────────────────┤
│  estado_cocina:    SIN_ENVIAR → EN_COCINA → LISTO →         │
│                                                ENTREGADO    │
│                    (DELIVERY añade EN_RUTA, ENTREGADO_DOMICILIO en 1C.2) │
└─────────────────────────────────────────────────────────────┘
```

Ambos planos avanzan independientemente. Un ticket puede estar `PAGADO` + `EN_COCINA` (caso normal), o `PAGADO` + `LISTO` (cocina terminó), o `PAGADO` + `ENTREGADO` (todo cerrado), o incluso `ABIERTO` + `EN_COCINA` (raro pero válido: cobro al entregar, ver delivery propio §22 que se modela en 1C.2).

Cada transición se valida en un trigger dedicado (§8). Las reglas de quién puede transicionar qué viven en `permisos` (Parte 1A §5.5).

### 1.3 Snapshot defensivo del catálogo

Cuando se agrega un producto a un ticket, **NO basta con guardar el `producto_id`**. Los precios cambian, los productos se renombran, los productos se eliminan suavemente (soft delete §27). Si dependiéramos solo de la FK, al cambiar el precio del producto los tickets viejos cambiarían retroactivamente — fraude contable inmediato.

**Solución (D34):** todo `ticket_item` copia textualmente al momento de la inserción:

- `producto_nombre_snapshot` (ej. "Hamburguesa Clásica")
- `precio_unitario_snapshot`
- `tasa_iva_snapshot` (típicamente 16.00)
- `iva_incluido_en_precio_snapshot` (México: típicamente true)
- `clave_sat_snapshot` (50202301)
- `unidad_sat_snapshot` (H87)
- `categoria_nombre_snapshot` (opcional, para reportes históricos)
- `producto_sku_snapshot` (opcional)

La FK `producto_id` se conserva como **nullable** y como referencia blanda. Si el producto se elimina (soft delete o hard delete), el snapshot sigue siendo legible.

**Mismo principio para modificadores:** `ticket_item_modificadores` lleva `opcion_nombre_snapshot`, `grupo_nombre_snapshot`, `precio_extra_snapshot`, `naturaleza_snapshot`.

### 1.4 Totales como verdad almacenada, no calculada al vuelo

El POS lee tickets muchísimo más de lo que los escribe. Calcular el total al vuelo sumando items + modificadores - descuentos - promociones en cada SELECT sería caro y abriría espacio para drift entre lo que ve el cajero y lo que dice la BD.

**Estrategia (D42):** todos los totales viven como columnas en `tickets`:

- `subtotal_mxn` — suma de items antes de descuentos y promociones
- `descuentos_manuales_mxn`
- `promociones_mxn`
- `iva_mxn`
- `propina_mxn` (default 0 en MVP, infraestructura para Fase 2)
- `total_mxn`
- `monto_pagado_mxn` (suma de pagos)
- `monto_pendiente_mxn` (calculado, generado)
- `cambio_mxn`

Estos campos se mantienen vía la función `recalcular_totales_ticket(ticket_id)` que se llama desde triggers `AFTER INSERT/UPDATE/DELETE` en `ticket_items`, `ticket_item_modificadores`, `ticket_descuentos_manuales`, `ticket_promociones_aplicadas` y `pagos`. La función es **idempotente y transaccional**: si se llama dos veces, el resultado es el mismo.

### 1.5 IVA: el detalle mexicano

México usa por convención **precios con IVA incluido** ("Hamburguesa $130 — IVA incluido"). El ticket impreso muestra el desglose pero el cliente paga exactamente el precio de menú.

La columna `productos.iva_incluido_en_precio` (Parte 1B §3.3) define el comportamiento por producto. Su snapshot en `ticket_items.iva_incluido_en_precio_snapshot` decide cómo se calcula:

- **`iva_incluido = true`:** `subtotal_neto = precio_unitario / (1 + tasa_iva/100)`, `iva = precio_unitario - subtotal_neto`
- **`iva_incluido = false`:** `subtotal_neto = precio_unitario`, `iva = precio_unitario * tasa_iva/100`

La función `recalcular_totales_ticket()` itera ambos casos correctamente.

### 1.6 Idempotencia para sync offline (anticipo)

D40 cierra UUIDs como PKs. Pero un cliente offline puede generar 50 tickets en un dispositivo, recobrar conectividad y subirlos. Sin protección, una doble llamada de sync los duplicaría.

**Anticipo de la estrategia:** cada `tickets`, `ticket_items`, `pagos` y demás de 1C.1 lleva una columna `client_id_local varchar(64)` opcional con `UNIQUE (tenant_id, client_id_local) WHERE client_id_local IS NOT NULL`. El cliente genera este ID en su Dexie.js local. Al sincronizar, si la fila ya existe con ese `client_id_local`, el INSERT no falla — devuelve la fila existente (vía `ON CONFLICT DO NOTHING ... RETURNING` patrón). El desarrollo completo de sync se trata en 1C.2 §9.

### 1.7 ¿Por qué el ticket vive en `/core` y no en módulos por vertical?

Más del 80% del comportamiento del ticket es idéntico para QSR, Foodtruck, Café & Bar, Full Service y Dark Kitchen: items, precios, IVA, pagos, descuentos. Las diferencias se concentran en:

- **Full Service:** asociación a mesa (será FK opcional `mesa_id` añadida en Parte 1D)
- **Café & Bar:** asociación a cuenta abierta (será FK opcional `cuenta_abierta_id` en Parte 1D)
- **Dark Kitchen:** marca virtual obligatoria (FK `marca_virtual_id` ya en `productos`, se denormaliza a `tickets.marca_virtual_id`)
- **Foodtruck:** sin particularidad a nivel ticket
- **Quick Service:** sin particularidad a nivel ticket (drive-thru solo añade un modo de servicio)

Por eso `tickets` vive en este documento (`/core`) y los hooks por vertical se modelan como columnas opcionales que sus módulos llenarán o no.

---

## 2. Convenciones (recap)

(Resumen de Parte 1A §2 — todas vigentes en 1C.1)

- Naming `snake_case` español (D4): `tickets`, `ticket_items`, `pagos`, `ticket_descuentos_manuales`
- PKs `uuid` con `gen_random_uuid()` (D3)
- `tenant_id uuid NOT NULL` en TODAS las tablas operativas (D1, D14)
- RLS habilitado en todas las tablas operativas, política por `current_tenant_id()` (D2)
- Soft delete con `deleted_at timestamptz` + `deleted_by` en tablas auditables (D5)
- `timestamptz` siempre, UTC almacenado (D6)
- `dia_contable date` inmutable en tickets (D7)
- Dinero en `numeric(12,2)`, cantidades en `numeric(12,3)`
- Estados como `enum` de PostgreSQL (D10)
- Folio vía `generar_folio()` atómica por sucursal/año/tipo (D11)
- Auditoría a `auditoria_eventos` con `payload jsonb` (D8)
- Columnas comunes en tablas operativas: `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`
- Trigger `set_updated_at()` aplicado a todas las tablas con `updated_at`

**Nuevas convenciones específicas a 1C.1:**

- **Snapshot fields:** sufijo `_snapshot` en columnas que duplican datos del catálogo al momento de la venta (D34, D47). Ejemplos: `producto_nombre_snapshot`, `tasa_iva_snapshot`.
- **Idempotencia offline:** `client_id_local varchar(64) NULL` en tablas que aceptan sync desde dispositivos (D40). UNIQUE parcial por tenant.
- **Naming de triggers de estado:** `trg_<tabla>_validar_<atributo>` (ej. `trg_tickets_validar_estado_fiscal`).
- **Naming de funciones de transición:** verbos en infinitivo (`abrir_ticket`, `aplicar_pago`, `cerrar_ticket`, `marcar_pedido_listo`).

---

## 3. Esquema: Tickets

### 3.1 Enums asociados

```sql
-- Estado fiscal del ticket (§1.3 del /core)
CREATE TYPE ticket_estado_fiscal AS ENUM (
  'BORRADOR',     -- recién creado, sin items todavía (se descarta solo si no llega a ABIERTO en X minutos)
  'ABIERTO',      -- tiene al menos un item, no cobrado, modificable
  'PAGADO',       -- cobrado completamente, ya no se modifica
  'FACTURADO',    -- CFDI emitido (post-MVP)
  'CANCELADO'     -- anulado con motivo (cancelaciones se modelan completamente en 1C.2)
);

-- Estado de cocina del ticket (§20 del /core; los estados de delivery propio
-- EN_RUTA y ENTREGADO_DOMICILIO se agregan vía ALTER TYPE en Parte 1C.2)
CREATE TYPE ticket_estado_cocina AS ENUM (
  'SIN_ENVIAR',   -- existe el ticket pero la comanda no se ha mandado a cocina
  'EN_COCINA',    -- comanda impresa, cocina está preparando
  'LISTO',        -- cocina marcó como terminado
  'ENTREGADO'     -- el cliente recibió su pedido
);

-- Modo de servicio del ticket (§6 del /core)
CREATE TYPE modo_servicio AS ENUM (
  'COMER_AQUI',
  'PARA_LLEVAR',
  'DRIVE_THRU',
  'DELIVERY_PROPIO',
  'APP_RAPPI',
  'APP_UBEREATS',
  'APP_DIDI',
  'APP_IFOOD',
  'APP_OTRO',
  'MESA',
  'BARRA',
  'EVENTO_PRIVADO'
);

-- Origen de creación del ticket (sync offline vs en línea)
CREATE TYPE ticket_origen AS ENUM (
  'POS_ONLINE',       -- creado con conectividad, escrito directo a Postgres
  'POS_OFFLINE',      -- creado offline, sincronizado después desde Dexie.js
  'API_EXTERNA',      -- futuro: ingesta de Rappi/Uber por API (Dark Kitchen Fase 5)
  'IMPORTADO'         -- migración inicial desde otro POS
);
```

### 3.2 Tabla `tickets`

```sql
CREATE TABLE tickets (
  -- ===== Identidad =====
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio interno único (D11; §1.3.bis del /core). Asignado por trigger al pasar de BORRADOR→ABIERTO.
  -- Formato 'K-2026-001043'. Inmutable una vez asignado.
  folio_completo      varchar(50) NULL,
  folio_consecutivo   bigint NULL,

  -- Día contable inmutable (D7; §25.3 del /core). Asignado por trigger en INSERT.
  dia_contable        date NOT NULL,

  -- ===== Clasificación operativa =====
  modo_servicio       modo_servicio NOT NULL,
  marca_virtual_id    uuid NULL REFERENCES marcas_virtuales(id),  -- DK (D25)

  -- Cliente y delivery
  cliente_id          uuid NULL REFERENCES clientes(id),
  direccion_entrega_id uuid NULL REFERENCES direcciones_cliente(id),

  -- Apps externas (D44; §23 del /core)
  folio_externo_app   varchar(100) NULL,    -- ej. 'R-A4F92B' (Rappi), 'UE-12345' (Uber)
  -- 'app_externa_modo' no necesita columna extra: se deriva de modo_servicio cuando es APP_*

  -- Pedidos en espera (D45; §12 del /core)
  etiqueta_espera     varchar(100) NULL,    -- 'Cliente camisa azul', 'Mesa 1 todavía pensando'
  en_espera           boolean NOT NULL DEFAULT false,
  fecha_puesto_en_espera timestamptz NULL,

  -- ===== Estados (D36) =====
  estado_fiscal       ticket_estado_fiscal NOT NULL DEFAULT 'BORRADOR',
  estado_cocina       ticket_estado_cocina NOT NULL DEFAULT 'SIN_ENVIAR',

  -- ===== Notas (D46; §11 del /core) =====
  nota_general        text NULL,
  nota_imprime_en_comanda boolean NOT NULL DEFAULT true,
  nota_imprime_en_ticket  boolean NOT NULL DEFAULT false,

  -- ===== Totales (D42) — mantenidos por recalcular_totales_ticket() =====
  -- Convención: todo en MXN, IVA segregado, snapshot exacto en cada cambio.
  subtotal_mxn            numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_mxn >= 0),
  descuentos_manuales_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuentos_manuales_mxn >= 0),
  promociones_mxn         numeric(12,2) NOT NULL DEFAULT 0 CHECK (promociones_mxn >= 0),
  iva_mxn                 numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_mxn >= 0),
  propina_mxn             numeric(12,2) NOT NULL DEFAULT 0 CHECK (propina_mxn >= 0),  -- Fase 2
  total_mxn               numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_mxn >= 0),

  -- Información de pago (consolidada desde tabla pagos)
  monto_pagado_mxn        numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_pagado_mxn >= 0),
  cambio_mxn              numeric(12,2) NOT NULL DEFAULT 0 CHECK (cambio_mxn >= 0),
  -- Pendiente como columna generada (siempre coherente con total - pagado)
  monto_pendiente_mxn     numeric(12,2) GENERATED ALWAYS AS (total_mxn - monto_pagado_mxn) STORED,

  -- ===== Comanda (impresión a cocina) =====
  comanda_impresa_at      timestamptz NULL,                       -- primera impresión
  comanda_reimpresa_count integer NOT NULL DEFAULT 0,             -- reimpresiones del cajero
  envio_cocina_automatico boolean NOT NULL DEFAULT true,          -- política configurable

  -- ===== Ciclo de vida (timestamps) =====
  fecha_apertura          timestamptz NOT NULL DEFAULT now(),
  fecha_primer_item       timestamptz NULL,                       -- cuando pasó BORRADOR→ABIERTO
  fecha_envio_cocina      timestamptz NULL,                       -- cuando estado_cocina pasó a EN_COCINA
  fecha_pago              timestamptz NULL,                       -- cuando estado_fiscal pasó a PAGADO
  fecha_listo             timestamptz NULL,                       -- cuando estado_cocina pasó a LISTO
  fecha_entrega           timestamptz NULL,                       -- cuando estado_cocina pasó a ENTREGADO

  -- ===== Atribución de usuarios =====
  usuario_apertura_id     uuid NULL REFERENCES auth.users(id),
  usuario_cierre_id       uuid NULL REFERENCES auth.users(id),    -- quien procesó el pago final
  usuario_entrega_id      uuid NULL REFERENCES auth.users(id),    -- quien marcó entregado

  -- ===== Sync offline (D40) =====
  client_id_local         varchar(64) NULL,                       -- idempotencia
  origen_creacion         ticket_origen NOT NULL DEFAULT 'POS_ONLINE',
  sincronizado_at         timestamptz NULL,                       -- cuando llegó al servidor desde offline

  -- ===== Comunes (Parte 1A §2.5) =====
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id),
  deleted_at              timestamptz NULL,
  deleted_by              uuid REFERENCES auth.users(id),

  -- ===== Constraints =====

  -- El folio se exige una vez salido de BORRADOR
  CONSTRAINT folio_obligatorio_post_borrador CHECK (
    (estado_fiscal = 'BORRADOR' AND folio_completo IS NULL)
    OR (estado_fiscal <> 'BORRADOR' AND folio_completo IS NOT NULL)
  ),

  -- Folio único por sucursal (no global, porque el formato lo identifica)
  CONSTRAINT folio_unico_por_sucursal UNIQUE (sucursal_id, folio_completo),

  -- Si tiene direccion_entrega_id, debe tener cliente_id también
  CONSTRAINT direccion_requiere_cliente CHECK (
    direccion_entrega_id IS NULL OR cliente_id IS NOT NULL
  ),

  -- Fechas coherentes
  CONSTRAINT fecha_pago_implica_apertura CHECK (
    fecha_pago IS NULL OR fecha_pago >= fecha_apertura
  ),
  CONSTRAINT fecha_entrega_implica_pago_o_listo CHECK (
    fecha_entrega IS NULL OR fecha_listo IS NOT NULL OR fecha_pago IS NOT NULL
  ),

  -- Si está en espera, debe tener etiqueta_espera
  CONSTRAINT espera_requiere_etiqueta CHECK (
    en_espera = false OR etiqueta_espera IS NOT NULL
  )
);

-- ===== Índices de filtro frecuente =====
CREATE INDEX idx_tickets_tenant_dia ON tickets(tenant_id, dia_contable DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_sucursal_dia ON tickets(sucursal_id, dia_contable DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_turno ON tickets(turno_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_caja_estado ON tickets(caja_id, estado_fiscal)
  WHERE deleted_at IS NULL;

-- Tickets activos del cajero (vista "Pedidos en curso")
CREATE INDEX idx_tickets_activos ON tickets(caja_id, fecha_apertura DESC)
  WHERE deleted_at IS NULL
    AND estado_fiscal IN ('BORRADOR', 'ABIERTO')
    AND en_espera = false;

-- Pedidos en espera (vista §12)
CREATE INDEX idx_tickets_en_espera ON tickets(caja_id, fecha_puesto_en_espera DESC)
  WHERE deleted_at IS NULL
    AND en_espera = true;

-- Búsqueda por cliente (CRM)
CREATE INDEX idx_tickets_cliente ON tickets(cliente_id, fecha_apertura DESC)
  WHERE cliente_id IS NOT NULL AND deleted_at IS NULL;

-- Pedidos en cocina (vista del rol Personal)
CREATE INDEX idx_tickets_cocina_activos ON tickets(sucursal_id, fecha_envio_cocina)
  WHERE deleted_at IS NULL
    AND estado_cocina IN ('EN_COCINA', 'LISTO')
    AND estado_fiscal <> 'CANCELADO';

-- Folio
CREATE UNIQUE INDEX idx_tickets_folio ON tickets(sucursal_id, folio_completo)
  WHERE folio_completo IS NOT NULL;

-- Apps externas (búsqueda por folio externo para conciliación)
CREATE INDEX idx_tickets_folio_externo ON tickets(tenant_id, folio_externo_app)
  WHERE folio_externo_app IS NOT NULL AND deleted_at IS NULL;

-- Marca virtual (DK)
CREATE INDEX idx_tickets_marca_virtual ON tickets(marca_virtual_id, fecha_apertura DESC)
  WHERE marca_virtual_id IS NOT NULL AND deleted_at IS NULL;

-- Sync offline: idempotencia
CREATE UNIQUE INDEX idx_tickets_client_id_local ON tickets(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

-- Tickets pendientes de cobro (pago al recibir, delivery)
CREATE INDEX idx_tickets_pendientes_cobro ON tickets(sucursal_id, fecha_apertura)
  WHERE deleted_at IS NULL
    AND estado_fiscal = 'ABIERTO'
    AND modo_servicio = 'DELIVERY_PROPIO';

COMMENT ON TABLE tickets IS 'Documento de venta. §1.3 del /core. Snapshot defensivo se hace en ticket_items (D34).';
COMMENT ON COLUMN tickets.dia_contable IS 'Inmutable post-creación (D7). Calculado por trigger usando calcular_dia_contable() del tenant.';
COMMENT ON COLUMN tickets.folio_completo IS 'Folio único por sucursal/año (D11). Asignado al transicionar BORRADOR→ABIERTO. §1.3.bis del /core.';
COMMENT ON COLUMN tickets.monto_pendiente_mxn IS 'Generada: total_mxn - monto_pagado_mxn. Permite filtrar pagos parciales eficientemente.';
COMMENT ON COLUMN tickets.client_id_local IS 'ID generado por el cliente offline (Dexie.js). Permite idempotencia al sincronizar (D40).';
COMMENT ON COLUMN tickets.estado_cocina IS 'Plano paralelo al estado_fiscal (D36, §20). Avanza independientemente.';
```

### 3.3 Triggers en `tickets`

Los triggers más críticos del documento. Validan transiciones, asignan folios y propagan totales.

```sql
-- 3.3.1 ASIGNAR dia_contable AL INSERT (igual que turnos en Parte 1A §8.8)
CREATE OR REPLACE FUNCTION trg_ticket_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_apertura);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_dia_contable_insert
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_dia_contable();

-- 3.3.2 PROTEGER dia_contable y folio_completo POST-INSERT (D7)
CREATE OR REPLACE FUNCTION trg_ticket_proteger_inmutables() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.dia_contable IS NOT NULL AND NEW.dia_contable <> OLD.dia_contable THEN
      RAISE EXCEPTION 'dia_contable es inmutable post-creación (D7, §25.3)';
    END IF;
    IF OLD.folio_completo IS NOT NULL AND NEW.folio_completo IS DISTINCT FROM OLD.folio_completo THEN
      RAISE EXCEPTION 'folio_completo es inmutable una vez asignado (§1.3.bis)';
    END IF;
    IF OLD.folio_consecutivo IS NOT NULL AND NEW.folio_consecutivo IS DISTINCT FROM OLD.folio_consecutivo THEN
      RAISE EXCEPTION 'folio_consecutivo es inmutable una vez asignado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_proteger_inmutables
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_proteger_inmutables();

-- 3.3.3 ASIGNAR folio AL PASAR DE BORRADOR a ABIERTO
CREATE OR REPLACE FUNCTION trg_ticket_asignar_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal = 'BORRADOR'
     AND NEW.estado_fiscal = 'ABIERTO'
     AND NEW.folio_completo IS NULL THEN

    SELECT folio_completo, consecutivo INTO v_folio_row
    FROM generar_folio(NEW.sucursal_id, 'TICKET', NULL);

    NEW.folio_completo := v_folio_row.folio_completo;
    NEW.folio_consecutivo := v_folio_row.consecutivo;
    NEW.fecha_primer_item := COALESCE(NEW.fecha_primer_item, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_asignar_folio
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_asignar_folio();

-- 3.3.4 VALIDAR TRANSICIÓN DE estado_fiscal (§1.3)
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_fiscal() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    -- Transiciones válidas:
    --   BORRADOR  → ABIERTO | CANCELADO
    --   ABIERTO   → PAGADO  | CANCELADO
    --   PAGADO    → FACTURADO | CANCELADO
    --   FACTURADO → CANCELADO (requiere sustitución CFDI, manejado en 1C.2)
    --   CANCELADO → (terminal, no más transiciones)
    IF NOT (
      (OLD.estado_fiscal = 'BORRADOR'  AND NEW.estado_fiscal IN ('ABIERTO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'ABIERTO'   AND NEW.estado_fiscal IN ('PAGADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'PAGADO'    AND NEW.estado_fiscal IN ('FACTURADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'FACTURADO' AND NEW.estado_fiscal = 'CANCELADO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_fiscal no permitida: % → %', OLD.estado_fiscal, NEW.estado_fiscal;
    END IF;

    -- Cuando pasa a PAGADO, fecha_pago debe quedar fijada
    IF NEW.estado_fiscal = 'PAGADO' AND NEW.fecha_pago IS NULL THEN
      NEW.fecha_pago := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_validar_estado_fiscal
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_validar_estado_fiscal();

-- 3.3.5 VALIDAR TRANSICIÓN DE estado_cocina (§20.3)
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_cocina() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_cocina IS DISTINCT FROM NEW.estado_cocina THEN
    -- Transiciones válidas (avance hacia adelante):
    --   SIN_ENVIAR → EN_COCINA
    --   EN_COCINA  → LISTO
    --   LISTO      → ENTREGADO
    -- Las transiciones reversas (corrección de errores) requieren PIN de admin
    -- y se hacen vía función dedicada que pasa por aquí desactivando temporalmente
    -- la validación con SET LOCAL session_replication_role = 'replica'.
    IF NOT (
      (OLD.estado_cocina = 'SIN_ENVIAR' AND NEW.estado_cocina = 'EN_COCINA')
      OR (OLD.estado_cocina = 'EN_COCINA'  AND NEW.estado_cocina = 'LISTO')
      OR (OLD.estado_cocina = 'LISTO'      AND NEW.estado_cocina = 'ENTREGADO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_cocina no permitida sin autorización: % → %', OLD.estado_cocina, NEW.estado_cocina
        USING HINT = 'Reversas requieren función transicionar_estado_cocina_con_autorizacion()';
    END IF;

    -- Timestamps por transición
    IF NEW.estado_cocina = 'EN_COCINA' AND NEW.fecha_envio_cocina IS NULL THEN
      NEW.fecha_envio_cocina := now();
    ELSIF NEW.estado_cocina = 'LISTO' AND NEW.fecha_listo IS NULL THEN
      NEW.fecha_listo := now();
    ELSIF NEW.estado_cocina = 'ENTREGADO' AND NEW.fecha_entrega IS NULL THEN
      NEW.fecha_entrega := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_validar_estado_cocina
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_validar_estado_cocina();

-- 3.3.6 DESCONTAR INVENTARIO AL PAGAR (invoca función de Parte 1B §9.6)
CREATE OR REPLACE FUNCTION trg_ticket_descontar_inventario_al_pagar() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Cuando estado_fiscal pasa a PAGADO, descontar insumos
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal <> 'PAGADO'
     AND NEW.estado_fiscal = 'PAGADO' THEN
    -- La función ya valida internamente si el módulo de inventario está activo
    PERFORM descontar_inventario_por_venta(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_descontar_inventario
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_descontar_inventario_al_pagar();

-- 3.3.7 AUTO-AVANZAR estado_cocina AL PAGAR (política configurable, §19.4)
-- Si configuracion_tenant.envio_cocina_al_cobrar = true (default), al pagar
-- se manda automáticamente la comanda a cocina.
CREATE OR REPLACE FUNCTION trg_ticket_auto_enviar_cocina_al_pagar() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_politica_envio boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal <> 'PAGADO'
     AND NEW.estado_fiscal = 'PAGADO'
     AND NEW.estado_cocina = 'SIN_ENVIAR'
     AND NEW.envio_cocina_automatico = true THEN
    -- Avanzar a EN_COCINA. Esto disparará trg_tickets_validar_estado_cocina
    -- que asignará fecha_envio_cocina.
    NEW.estado_cocina := 'EN_COCINA';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_auto_enviar_cocina
  BEFORE UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_auto_enviar_cocina_al_pagar();

-- 3.3.8 set_updated_at
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.3.9 AUDITORÍA de cambios de estado fiscal críticos
CREATE OR REPLACE FUNCTION trg_ticket_audit_estado() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.updated_by, 'VENTA', 'ticket.estado_fiscal.cambio',
      'ticket', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado_fiscal,
        'estado_nuevo', NEW.estado_fiscal,
        'folio', NEW.folio_completo,
        'total_mxn', NEW.total_mxn
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_audit_estado
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_audit_estado();
```

> **Sobre la concurrencia de transiciones:** PostgreSQL serializa los UPDATE sobre la misma fila, por lo que dos UPDATE simultáneos sobre el mismo ticket no pueden hacer un "PAGADO" y un "CANCELADO" al mismo tiempo. El segundo verá el estado actualizado y fallará la validación de transición.

---

## 4. Esquema: Ticket items y modificadores aplicados

### 4.1 Tabla `ticket_items`

Una fila por cada producto agregado al ticket. **Lleva snapshot completo** del producto (D34).

```sql
CREATE TABLE ticket_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- FK blanda al catálogo: nullable porque el producto puede soft-deletearse
  producto_id         uuid NULL REFERENCES productos(id),

  -- ===== Cantidad y orden =====
  cantidad            numeric(12,3) NOT NULL CHECK (cantidad > 0),
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- ===== Snapshot defensivo del producto (D34) =====
  producto_nombre_snapshot       varchar(150) NOT NULL,
  producto_sku_snapshot          varchar(50) NULL,
  precio_unitario_snapshot       numeric(12,2) NOT NULL CHECK (precio_unitario_snapshot >= 0),
  tasa_iva_snapshot              numeric(5,2)  NOT NULL CHECK (tasa_iva_snapshot >= 0 AND tasa_iva_snapshot <= 100),
  iva_incluido_en_precio_snapshot boolean      NOT NULL,
  clave_sat_snapshot             varchar(20) NULL,
  unidad_sat_snapshot            varchar(10) NULL,
  -- Categoría: solo el nombre (FK no necesaria para snapshot)
  categoria_nombre_snapshot      varchar(100) NULL,
  -- Modos de servicio aplicables (para auditar conflictos en reportes)
  modos_servicio_snapshot        text[] NULL,
  -- Área de cocina (para reportes de carga de estaciones)
  area_cocina_nombre_snapshot    varchar(100) NULL,

  -- ===== Override de precio (cuando admin permite cambiar precio en línea) =====
  precio_override                boolean NOT NULL DEFAULT false,
  precio_unitario_original_snapshot numeric(12,2) NULL,           -- el de catálogo antes del override
  autorizacion_pin_override_id   uuid NULL REFERENCES autorizaciones_pin(id),

  -- ===== Notas =====
  nota_cocina         text NULL,                                  -- "bien doradito", "sin cebolla"

  -- ===== Cálculo del item (mantenido por trigger) =====
  -- subtotal_bruto = cantidad * precio_unitario_snapshot
  -- ya considera el caso "IVA incluido" o "IVA por afuera" en recalcular_totales_ticket()
  subtotal_bruto_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_bruto_mxn >= 0),
  monto_modificadores_mxn  numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_modificadores_mxn >= 0),
  descuento_item_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuento_item_mxn >= 0),
  promocion_item_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (promocion_item_mxn >= 0),
  iva_item_mxn             numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_item_mxn >= 0),
  total_item_mxn           numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_item_mxn >= 0),

  -- ===== Cancelación individual del item (§16 del /core, edición pre-cobro) =====
  cancelado           boolean NOT NULL DEFAULT false,
  motivo_cancelacion  text NULL,
  usuario_cancelo_id  uuid NULL REFERENCES auth.users(id),
  autorizacion_cancelacion_id uuid NULL REFERENCES autorizaciones_pin(id),
  cancelado_at        timestamptz NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT precio_override_coherente CHECK (
    (precio_override = false AND precio_unitario_original_snapshot IS NULL AND autorizacion_pin_override_id IS NULL)
    OR (precio_override = true AND precio_unitario_original_snapshot IS NOT NULL AND autorizacion_pin_override_id IS NOT NULL)
  ),
  CONSTRAINT cancelacion_coherente CHECK (
    (cancelado = false AND cancelado_at IS NULL AND motivo_cancelacion IS NULL)
    OR (cancelado = true AND cancelado_at IS NOT NULL AND motivo_cancelacion IS NOT NULL)
  )
);

CREATE INDEX idx_ticket_items_ticket ON ticket_items(ticket_id)
  WHERE cancelado = false;
CREATE INDEX idx_ticket_items_producto ON ticket_items(producto_id)
  WHERE producto_id IS NOT NULL;
CREATE INDEX idx_ticket_items_tenant ON ticket_items(tenant_id);
CREATE UNIQUE INDEX idx_ticket_items_client_id_local ON ticket_items(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_items IS 'Líneas de venta con snapshot defensivo del producto (D34). Resistente a soft delete y cambios de precio del catálogo.';
COMMENT ON COLUMN ticket_items.cancelado IS 'Cancelación individual pre-cobro (§16). NO confundir con tickets.estado_fiscal = CANCELADO.';
COMMENT ON COLUMN ticket_items.precio_override IS 'TRUE si admin/supervisor cambió el precio en línea. Requiere autorización registrada en autorizacion_pin_override_id.';
```

### 4.2 Tabla `ticket_item_modificadores`

Modificadores aplicados a cada línea. Resistente a cambios de catálogo (D47).

```sql
CREATE TABLE ticket_item_modificadores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_item_id      uuid NOT NULL REFERENCES ticket_items(id) ON DELETE CASCADE,

  -- FKs blandas al catálogo (nullable por soft delete)
  opcion_modificador_id uuid NULL REFERENCES opciones_modificador(id),
  grupo_id              uuid NULL REFERENCES grupos_modificadores(id),

  -- ===== Snapshot del modificador (D47) =====
  grupo_nombre_snapshot      varchar(100) NOT NULL,        -- 'Término de cocción'
  opcion_nombre_snapshot     varchar(100) NOT NULL,        -- 'Tres cuartos'
  precio_extra_snapshot      numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_extra_snapshot >= 0),
  -- naturaleza es esencial para descontar_inventario_por_venta() de 1B §9.6
  naturaleza_snapshot        modificador_naturaleza NOT NULL,  -- enum de Parte 1B: EXTRA, SUSTITUCION, OBSERVACION

  -- ===== Cantidad del modificador (ej. "extra queso x2") =====
  cantidad            integer NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  monto_total_mxn     numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_total_mxn >= 0),

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tim_ticket_item ON ticket_item_modificadores(ticket_item_id);
CREATE INDEX idx_tim_opcion ON ticket_item_modificadores(opcion_modificador_id)
  WHERE opcion_modificador_id IS NOT NULL;
CREATE INDEX idx_tim_tenant ON ticket_item_modificadores(tenant_id);
CREATE UNIQUE INDEX idx_tim_client_id_local ON ticket_item_modificadores(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_item_modificadores IS 'Modificadores aplicados a un ticket_item con snapshot completo (D47). naturaleza_snapshot crítica para descuento de inventario.';
```

### 4.3 Triggers en `ticket_items` y `ticket_item_modificadores`

```sql
-- 4.3.1 AL INSERT/UPDATE/DELETE en items o modificadores, recalcular totales del ticket
CREATE OR REPLACE FUNCTION trg_item_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Determinar el ticket_id afectado
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  -- Recalcular totales del ticket
  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_ticket_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_recalc_totales();

-- Para modificadores: trigger similar pero recalcula vía el item
CREATE OR REPLACE FUNCTION trg_modif_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
  v_ticket_item_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_item_id := OLD.ticket_item_id;
  ELSE
    v_ticket_item_id := NEW.ticket_item_id;
  END IF;

  SELECT ticket_id INTO v_ticket_id FROM ticket_items WHERE id = v_ticket_item_id;

  IF v_ticket_id IS NOT NULL THEN
    PERFORM recalcular_totales_ticket(v_ticket_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_ticket_item_modif_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_item_modificadores
  FOR EACH ROW EXECUTE FUNCTION trg_modif_recalc_totales();

-- 4.3.2 AL INSERT del primer item, pasar ticket de BORRADOR a ABIERTO
-- (la asignación de folio se dispara automáticamente vía trg_tickets_asignar_folio)
CREATE OR REPLACE FUNCTION trg_ticket_item_promover_borrador() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = NEW.ticket_id;

    IF v_estado = 'BORRADOR' THEN
      UPDATE tickets
      SET estado_fiscal = 'ABIERTO'
      WHERE id = NEW.ticket_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_items_promover_borrador
  AFTER INSERT ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_item_promover_borrador();

-- 4.3.3 set_updated_at
CREATE TRIGGER trg_ticket_items_updated_at
  BEFORE UPDATE ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tim_updated_at
  BEFORE UPDATE ON ticket_item_modificadores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 5. Esquema: Pagos

Un ticket puede tener múltiples pagos (D35; §17.3 pago dividido). Tabla 1:N.

### 5.1 Enums asociados

```sql
-- Método de pago (§17.1 del /core)
CREATE TYPE metodo_pago AS ENUM (
  'EFECTIVO',
  'TARJETA_CREDITO',
  'TARJETA_DEBITO',
  'TRANSFERENCIA',           -- SPEI
  'VALES_DESPENSA',          -- Sodexo, Edenred, etc.
  'CUPON',                   -- cupón canjeado como medio de pago
  'CUENTA_INTERNA',          -- staff, cuenta de la casa
  'APP_RAPPI',
  'APP_UBEREATS',
  'APP_DIDI',
  'APP_IFOOD',
  'APP_OTRO',
  'PAGO_AL_RECIBIR',         -- pendiente hasta que regrese repartidor (delivery propio)
  'OTRO'
);

-- Estado del pago
CREATE TYPE pago_estado AS ENUM (
  'PENDIENTE',               -- registrado pero no aplicado (ej. delivery pago al recibir)
  'APLICADO',                -- entró efectivo a caja o se procesó tarjeta
  'CONCILIADO',              -- apps externas: liquidación llegó y se concilió
  'CANCELADO'                -- reverso por cancelación de ticket
);
```

### 5.2 Tabla `pagos`

```sql
CREATE TABLE pagos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- Día contable (denormalizado para reportes; debe coincidir con tickets.dia_contable)
  dia_contable        date NOT NULL,

  -- ===== Método y monto =====
  metodo_pago         metodo_pago NOT NULL,
  monto_mxn           numeric(12,2) NOT NULL CHECK (monto_mxn > 0),

  -- Cuando el método es EFECTIVO y el cliente entrega de más:
  monto_recibido_mxn  numeric(12,2) NULL CHECK (monto_recibido_mxn IS NULL OR monto_recibido_mxn >= monto_mxn),
  cambio_mxn          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cambio_mxn >= 0),

  -- ===== Referencias por método (§17.1) =====
  referencia          varchar(150) NULL,              -- últimos 4 dígitos tarjeta, ref SPEI, folio vale, código cupón
  terminal_aprobacion varchar(50) NULL,               -- código de autorización terminal bancaria
  folio_externo       varchar(100) NULL,              -- folio app externa cuando metodo es APP_*

  -- ===== Pago al recibir (delivery propio) =====
  es_pago_al_recibir  boolean NOT NULL DEFAULT false,
  metodo_real         metodo_pago NULL,               -- cuando el repartidor regresa, qué se cobró realmente
  monto_real_mxn      numeric(12,2) NULL,             -- monto real cobrado (puede diferir en caso edge)

  -- ===== Conciliación (apps externas) =====
  estado              pago_estado NOT NULL DEFAULT 'APLICADO',
  conciliado_at       timestamptz NULL,
  conciliado_por_id   uuid NULL REFERENCES auth.users(id),

  -- ===== Atribución =====
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),  -- quien procesó el pago
  fecha_pago          timestamptz NOT NULL DEFAULT now(),

  -- ===== Nota libre =====
  nota                text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT cambio_solo_efectivo CHECK (
    cambio_mxn = 0 OR metodo_pago = 'EFECTIVO'
  ),
  CONSTRAINT pago_al_recibir_coherente CHECK (
    es_pago_al_recibir = false
    OR (es_pago_al_recibir = true AND metodo_pago = 'PAGO_AL_RECIBIR')
  ),
  CONSTRAINT conciliacion_coherente CHECK (
    (estado <> 'CONCILIADO' AND conciliado_at IS NULL)
    OR (estado = 'CONCILIADO' AND conciliado_at IS NOT NULL)
  )
);

CREATE INDEX idx_pagos_ticket ON pagos(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_turno_metodo ON pagos(turno_id, metodo_pago) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_dia_metodo ON pagos(tenant_id, dia_contable, metodo_pago) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_pendientes ON pagos(sucursal_id, fecha_pago)
  WHERE deleted_at IS NULL AND estado = 'PENDIENTE';
CREATE INDEX idx_pagos_apps_no_conciliados ON pagos(tenant_id, fecha_pago)
  WHERE deleted_at IS NULL
    AND metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
    AND estado = 'APLICADO';
CREATE UNIQUE INDEX idx_pagos_client_id_local ON pagos(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE pagos IS 'Pagos del ticket. 1:N con tickets (D35). Soporta pago dividido (§17.3) y pago al recibir (delivery propio).';
COMMENT ON COLUMN pagos.dia_contable IS 'Denormalizado desde tickets para reportes por día. El trigger lo sincroniza al crear.';
COMMENT ON COLUMN pagos.es_pago_al_recibir IS 'TRUE para delivery propio cuando el cobro lo hace el repartidor. metodo_real se llena al regresar.';
```

### 5.3 Triggers en `pagos`

```sql
-- 5.3.1 Asignar dia_contable y validar coherencia con el ticket
CREATE OR REPLACE FUNCTION trg_pago_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_dia date;
  v_ticket_tenant uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT dia_contable, tenant_id INTO v_ticket_dia, v_ticket_tenant
    FROM tickets WHERE id = NEW.ticket_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ticket % no existe', NEW.ticket_id;
    END IF;
    IF v_ticket_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Inconsistencia: pago.tenant_id (%) <> ticket.tenant_id (%)', NEW.tenant_id, v_ticket_tenant;
    END IF;

    NEW.dia_contable := v_ticket_dia;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_dia_contable
  BEFORE INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_dia_contable();

-- 5.3.2 Proteger dia_contable inmutable
CREATE OR REPLACE FUNCTION trg_pago_proteger_dia() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dia_contable <> NEW.dia_contable THEN
    RAISE EXCEPTION 'pagos.dia_contable es inmutable (D7)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_proteger_dia
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_proteger_dia();

-- 5.3.3 Recalcular totales del ticket al insertar/actualizar/eliminar pago
CREATE OR REPLACE FUNCTION trg_pago_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_pagos_recalc
  AFTER INSERT OR UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_recalc_totales();

-- 5.3.4 set_updated_at
CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5.3.5 Generar movimiento_caja cuando es pago en efectivo APLICADO
-- (refleja §17.5 del /core: efectivo entra a caja al cobrar)
CREATE OR REPLACE FUNCTION trg_pago_generar_movimiento_caja() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo para EFECTIVO en estado APLICADO (no para PENDIENTE de delivery)
  IF TG_OP = 'INSERT'
     AND NEW.metodo_pago = 'EFECTIVO'
     AND NEW.estado = 'APLICADO' THEN
    -- Insertar entrada en movimientos_caja como VENTA_EFECTIVO
    -- (la tabla existe en Parte 1A §6.4; se documentó tipo_movimiento, esta
    -- tipificación VENTA_EFECTIVO está implícita en el corte; aquí registramos
    -- el lado de caja como un movimiento informativo no transaccional)
    -- NOTA: si Parte 1A no incluyó VENTA_EFECTIVO en el enum, ese tipo se agrega
    -- vía ALTER TYPE en la migración correspondiente; aquí asumimos su existencia.
    -- Si no se quiere expandir el enum, el corte cuenta venta_efectivo via la
    -- query SUM(pagos WHERE metodo=EFECTIVO) sin necesidad de fila en movimientos_caja.
    -- Decisión documentada en §11.
    NULL;  -- en MVP, el corte calcula efectivo via JOIN pagos; no insertamos movimientos
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger NO se activa por default en MVP. Se documenta para activación futura
-- si se decide reflejar pagos como movimientos formales. Queda como decisión §11.

-- 5.3.6 Audit del pago
CREATE OR REPLACE FUNCTION trg_pago_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.usuario_id, 'COBRO', 'pago.aplicado',
      'pago', NEW.id,
      jsonb_build_object(
        'ticket_id', NEW.ticket_id,
        'metodo_pago', NEW.metodo_pago,
        'monto_mxn', NEW.monto_mxn,
        'es_pago_al_recibir', NEW.es_pago_al_recibir,
        'referencia', NEW.referencia
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_audit
  AFTER INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_audit();
```

> **Sobre `movimientos_caja` y pagos:** la Parte 1A modeló `movimientos_caja` (§6.4) con tipos `FONDO_APERTURA`, `SANGRIA`, `DEPOSITO`, `DEVOLUCION_EFECTIVO`, `AJUSTE_*`. **No incluyó** un tipo `VENTA_EFECTIVO` porque las ventas viven en `pagos`. En el corte de caja (§24 del /core), el cálculo del efectivo esperado se hace como:
>
> ```sql
> efectivo_esperado = fondo_apertura
>   + COALESCE(SUM(pagos WHERE metodo=EFECTIVO AND estado=APLICADO), 0)
>   - COALESCE(SUM(movimientos_caja tipo=SANGRIA), 0)
>   - COALESCE(SUM(movimientos_caja tipo=DEVOLUCION_EFECTIVO), 0)
>   + COALESCE(SUM(movimientos_caja tipo=DEPOSITO), 0)
>   ± ajustes
> ```
>
> Esto se documenta como query del cierre de turno y se materializa como vista en 1C.2.

---

## 6. Esquema: Descuentos manuales aplicados

(§14 del `/core` — descuentos manuales SIEMPRE requieren PIN superior, D41).

### 6.1 Enums asociados

```sql
-- Tipo de descuento manual aplicado al ticket (§14.2)
CREATE TYPE descuento_manual_tipo AS ENUM (
  'PORCENTAJE',           -- N% sobre subtotal o ítem
  'MONTO_FIJO',           -- $X sobre subtotal o ítem
  'CORTESIA_TOTAL',       -- 100% off — ítem o ticket regalado
  'OVERRIDE_PRECIO'       -- ajuste del precio del producto al vuelo (precio nuevo)
);

-- Motivo del descuento manual (§14.3)
CREATE TYPE descuento_manual_motivo AS ENUM (
  'CLIENTE_FRECUENTE',
  'INCONVENIENCIA_OPERATIVA',
  'CORTESIA_INVITADO',
  'PERSONAL_STAFF',
  'PRODUCTO_DEFECTO_LEVE',
  'OTRO'
);
```

### 6.2 Tabla `ticket_descuentos_manuales`

```sql
CREATE TABLE ticket_descuentos_manuales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- NULL = se aplica al ticket completo. Si tiene valor, aplica solo a ese item.
  ticket_item_id      uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,

  -- ===== Tipo y valor =====
  tipo                descuento_manual_tipo NOT NULL,
  valor_porcentaje    numeric(5,2) NULL CHECK (valor_porcentaje IS NULL OR (valor_porcentaje > 0 AND valor_porcentaje <= 100)),
  valor_monto_mxn     numeric(12,2) NULL CHECK (valor_monto_mxn IS NULL OR valor_monto_mxn > 0),
  precio_override_mxn numeric(12,2) NULL CHECK (precio_override_mxn IS NULL OR precio_override_mxn >= 0),

  -- Monto efectivamente descontado (calculado al aplicar)
  monto_descontado_mxn numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),

  -- ===== Motivo (obligatorio §14.3) =====
  motivo_categoria    descuento_manual_motivo NOT NULL,
  motivo_texto        text NULL,             -- obligatorio si motivo_categoria = 'OTRO'

  -- ===== Autorización por PIN (D41, §14.1) =====
  autorizacion_pin_id uuid NOT NULL REFERENCES autorizaciones_pin(id),
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),

  aplicado_at         timestamptz NOT NULL DEFAULT now(),

  -- ===== Reverso (rara vez se usa, pero permitido) =====
  reversado           boolean NOT NULL DEFAULT false,
  reversado_at        timestamptz NULL,
  reversado_por_id    uuid NULL REFERENCES auth.users(id),
  motivo_reverso      text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Constraints de coherencia tipo↔valor
  CONSTRAINT valor_consistente_descuento CHECK (
    (tipo = 'PORCENTAJE'      AND valor_porcentaje IS NOT NULL AND valor_monto_mxn IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'MONTO_FIJO'   AND valor_monto_mxn IS NOT NULL AND valor_porcentaje IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'CORTESIA_TOTAL' AND valor_porcentaje IS NULL AND valor_monto_mxn IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'OVERRIDE_PRECIO' AND precio_override_mxn IS NOT NULL AND ticket_item_id IS NOT NULL)
  ),
  -- OVERRIDE_PRECIO solo aplica a ítem específico, no al ticket completo
  CONSTRAINT override_requiere_item CHECK (
    tipo <> 'OVERRIDE_PRECIO' OR ticket_item_id IS NOT NULL
  ),
  -- Motivo OTRO requiere texto
  CONSTRAINT motivo_otro_requiere_texto CHECK (
    motivo_categoria <> 'OTRO' OR motivo_texto IS NOT NULL
  ),
  CONSTRAINT reverso_coherente CHECK (
    (reversado = false AND reversado_at IS NULL)
    OR (reversado = true AND reversado_at IS NOT NULL AND motivo_reverso IS NOT NULL)
  )
);

CREATE INDEX idx_descmanual_ticket ON ticket_descuentos_manuales(ticket_id) WHERE reversado = false;
CREATE INDEX idx_descmanual_item ON ticket_descuentos_manuales(ticket_item_id) WHERE ticket_item_id IS NOT NULL AND reversado = false;
CREATE INDEX idx_descmanual_autorizo ON ticket_descuentos_manuales(usuario_autorizo_id, aplicado_at DESC);
CREATE INDEX idx_descmanual_tenant_fecha ON ticket_descuentos_manuales(tenant_id, aplicado_at DESC);
CREATE UNIQUE INDEX idx_descmanual_client_id_local ON ticket_descuentos_manuales(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_descuentos_manuales IS 'Descuentos manuales aplicados a tickets/items. SIEMPRE con autorización PIN (D41, §14.1).';
COMMENT ON COLUMN ticket_descuentos_manuales.autorizacion_pin_id IS 'FK obligatoria a autorizaciones_pin de Parte 1A. Sin PIN no hay descuento manual.';
```

### 6.3 Triggers en `ticket_descuentos_manuales`

```sql
-- Recalcular totales del ticket al aplicar/reversar descuento
CREATE OR REPLACE FUNCTION trg_descmanual_recalc() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_descmanual_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION trg_descmanual_recalc();

CREATE TRIGGER trg_descmanual_updated_at
  BEFORE UPDATE ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoría
CREATE OR REPLACE FUNCTION trg_descmanual_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, usuario_autorizo_id,
      categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.usuario_solicitante_id, NEW.usuario_autorizo_id,
      'DESCUENTO', 'descuento_manual.aplicado',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'tipo', NEW.tipo,
        'monto_descontado_mxn', NEW.monto_descontado_mxn,
        'motivo_categoria', NEW.motivo_categoria,
        'motivo_texto', NEW.motivo_texto,
        'ticket_item_id', NEW.ticket_item_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descmanual_audit
  AFTER INSERT ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION trg_descmanual_audit();
```

---

## 7. Esquema: Promociones aplicadas

(§14.4 del `/core` — promociones automáticas detectadas. NO requieren PIN, D41).

### 7.1 Tabla `ticket_promociones_aplicadas`

```sql
CREATE TABLE ticket_promociones_aplicadas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  promocion_id        uuid NOT NULL REFERENCES promociones(id),

  -- ===== Snapshot de la promoción (resistente a edición/borrado de promociones) =====
  promocion_nombre_snapshot       varchar(150) NOT NULL,
  promocion_tipo_snapshot         promocion_tipo NOT NULL,         -- enum de Parte 1B §6.1
  promocion_alcance_snapshot      promocion_alcance NOT NULL,      -- enum de Parte 1B §6.1
  -- Valor que rigió la aplicación
  valor_porcentaje_snapshot       numeric(5,2) NULL,
  valor_monto_snapshot            numeric(12,2) NULL,
  precio_especial_snapshot        numeric(12,2) NULL,
  precio_combo_snapshot           numeric(12,2) NULL,

  -- ===== Monto efectivamente descontado =====
  monto_descontado_mxn            numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),

  -- Items afectados (referencia denormalizada para reportes rápidos)
  -- Cada uuid es un ticket_items.id. Vacío para promociones aplicadas al ticket completo.
  items_afectados                 uuid[] NOT NULL DEFAULT '{}',

  -- ===== Captura del momento de evaluación =====
  cumple_condiciones_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ej: {"horario": true, "monto_minimo": true, "modo_servicio": "PARA_LLEVAR"}

  -- ===== Cancelación manual de la promoción (§14.7 — cliente la rechaza) =====
  cancelada_por_cajero            boolean NOT NULL DEFAULT false,
  motivo_cancelacion              text NULL,
  usuario_que_cancelo_id          uuid NULL REFERENCES auth.users(id),
  cancelada_at                    timestamptz NULL,

  -- ===== Cliente asociado (para reportes CRM) =====
  cliente_id          uuid NULL REFERENCES clientes(id),

  aplicado_at         timestamptz NOT NULL DEFAULT now(),

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cancelacion_promo_coherente CHECK (
    (cancelada_por_cajero = false AND cancelada_at IS NULL)
    OR (cancelada_por_cajero = true AND cancelada_at IS NOT NULL AND motivo_cancelacion IS NOT NULL)
  )
);

CREATE INDEX idx_promo_apl_ticket ON ticket_promociones_aplicadas(ticket_id)
  WHERE cancelada_por_cajero = false;
CREATE INDEX idx_promo_apl_promocion ON ticket_promociones_aplicadas(promocion_id, aplicado_at DESC);
CREATE INDEX idx_promo_apl_cliente ON ticket_promociones_aplicadas(cliente_id, aplicado_at DESC)
  WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_promo_apl_tenant_fecha ON ticket_promociones_aplicadas(tenant_id, aplicado_at DESC);
CREATE UNIQUE INDEX idx_promo_apl_client_id_local ON ticket_promociones_aplicadas(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_promociones_aplicadas IS 'Promociones automáticas aplicadas a tickets. Snapshot defensivo (D41). NO requieren PIN.';
COMMENT ON COLUMN ticket_promociones_aplicadas.cumple_condiciones_snapshot IS 'Snapshot del resultado de evaluar las condiciones jsonb de la promoción. Útil para auditoría.';
```

### 7.2 Triggers

```sql
-- Recalcular totales del ticket al aplicar/cancelar promoción
CREATE OR REPLACE FUNCTION trg_promo_apl_recalc() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_promo_apl_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_recalc();

-- Incrementar usos_actuales en la promoción al aplicar; decrementar al cancelar
CREATE OR REPLACE FUNCTION trg_promo_apl_actualizar_uso() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE promociones SET usos_actuales = usos_actuales + 1 WHERE id = NEW.promocion_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE promociones SET usos_actuales = GREATEST(0, usos_actuales - 1) WHERE id = OLD.promocion_id;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.cancelada_por_cajero = false
        AND NEW.cancelada_por_cajero = true THEN
    UPDATE promociones SET usos_actuales = GREATEST(0, usos_actuales - 1) WHERE id = NEW.promocion_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_promo_apl_uso
  AFTER INSERT OR UPDATE OR DELETE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_actualizar_uso();

CREATE TRIGGER trg_promo_apl_updated_at
  BEFORE UPDATE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoría
CREATE OR REPLACE FUNCTION trg_promo_apl_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.created_by, 'DESCUENTO', 'promocion.aplicada',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'promocion_id', NEW.promocion_id,
        'promocion_nombre', NEW.promocion_nombre_snapshot,
        'monto_descontado_mxn', NEW.monto_descontado_mxn
      )
    );
  ELSIF TG_OP = 'UPDATE'
        AND OLD.cancelada_por_cajero = false
        AND NEW.cancelada_por_cajero = true THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.usuario_que_cancelo_id, 'DESCUENTO', 'promocion.cancelada_por_cajero',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'promocion_id', NEW.promocion_id,
        'motivo', NEW.motivo_cancelacion
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promo_apl_audit
  AFTER INSERT OR UPDATE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_audit();
```

---

## 8. Funciones helper y triggers

Las funciones de esta sección encapsulan las operaciones de negocio del ticket. Algunas ya quedaron documentadas como triggers en §3-§7. Aquí se entregan las **funciones públicas que la aplicación invoca** desde la capa de servicios y las **funciones internas críticas**.

### 8.1 `recalcular_totales_ticket(ticket_id)`

Punto único de verdad para los totales del ticket (D42). Invocada por triggers de items, pagos, descuentos y promos. Es la función más invocada del sistema; debe ser determinista, idempotente y rápida.

```sql
CREATE OR REPLACE FUNCTION recalcular_totales_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal_bruto          numeric(12,2) := 0;
  v_modificadores           numeric(12,2) := 0;
  v_descuentos_manuales     numeric(12,2) := 0;
  v_promociones             numeric(12,2) := 0;
  v_iva                     numeric(12,2) := 0;
  v_subtotal_final          numeric(12,2) := 0;
  v_total                   numeric(12,2) := 0;
  v_monto_pagado            numeric(12,2) := 0;
  v_cambio                  numeric(12,2) := 0;
  v_item                    record;
  v_item_bruto              numeric(12,2);
  v_item_modif              numeric(12,2);
  v_item_desc               numeric(12,2);
  v_item_promo              numeric(12,2);
  v_item_neto               numeric(12,2);
  v_item_iva                numeric(12,2);
  v_item_total              numeric(12,2);
BEGIN
  -- Iterar items no cancelados y calcular su subtotal e IVA
  FOR v_item IN
    SELECT
      ti.id,
      ti.cantidad,
      ti.precio_unitario_snapshot,
      ti.tasa_iva_snapshot,
      ti.iva_incluido_en_precio_snapshot,
      COALESCE(SUM(tim.monto_total_mxn), 0) AS monto_modif
    FROM ticket_items ti
    LEFT JOIN ticket_item_modificadores tim ON tim.ticket_item_id = ti.id
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
    GROUP BY ti.id, ti.cantidad, ti.precio_unitario_snapshot,
             ti.tasa_iva_snapshot, ti.iva_incluido_en_precio_snapshot
  LOOP
    -- Bruto del ítem: precio * cantidad + modificadores
    v_item_bruto := (v_item.cantidad * v_item.precio_unitario_snapshot);
    v_item_modif := v_item.monto_modif;

    -- Descuentos manuales aplicables a este item (los del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_desc
    FROM ticket_descuentos_manuales
    WHERE ticket_item_id = v_item.id
      AND reversado = false;

    -- Promociones aplicables a este item (las del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_promo
    FROM ticket_promociones_aplicadas
    WHERE ticket_id = p_ticket_id
      AND cancelada_por_cajero = false
      AND v_item.id = ANY(items_afectados);

    -- Neto del ítem (después de descuentos a nivel item, no a nivel ticket)
    v_item_neto := (v_item_bruto + v_item_modif) - v_item_desc - v_item_promo;
    IF v_item_neto < 0 THEN v_item_neto := 0; END IF;

    -- IVA del ítem según política iva_incluido
    IF v_item.iva_incluido_en_precio_snapshot THEN
      -- El precio ya trae IVA: subtotal_sin_iva = neto / (1 + tasa/100), iva = neto - subtotal
      v_item_iva := ROUND(v_item_neto - (v_item_neto / (1 + v_item.tasa_iva_snapshot/100)), 2);
      v_item_total := v_item_neto;
    ELSE
      -- IVA por afuera: subtotal_sin_iva = neto, iva = neto * tasa/100, total = neto + iva
      v_item_iva := ROUND(v_item_neto * v_item.tasa_iva_snapshot/100, 2);
      v_item_total := v_item_neto + v_item_iva;
    END IF;

    -- Persistir el cálculo en ticket_items
    UPDATE ticket_items
    SET subtotal_bruto_mxn      = v_item_bruto,
        monto_modificadores_mxn = v_item_modif,
        descuento_item_mxn      = v_item_desc,
        promocion_item_mxn      = v_item_promo,
        iva_item_mxn            = v_item_iva,
        total_item_mxn          = v_item_total
    WHERE id = v_item.id;

    -- Acumular al ticket
    v_subtotal_bruto      := v_subtotal_bruto + v_item_bruto;
    v_modificadores       := v_modificadores  + v_item_modif;
    v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
    v_promociones         := v_promociones    + v_item_promo;
    v_iva                 := v_iva            + v_item_iva;
    v_total               := v_total          + v_item_total;
  END LOOP;

  -- Descuentos manuales a nivel ticket (sin ticket_item_id) — se restan del total
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_desc
  FROM ticket_descuentos_manuales
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND reversado = false;
  v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
  v_total := v_total - v_item_desc;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Promociones a nivel ticket (items_afectados vacío y alcance TICKET_COMPLETO)
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_promo
  FROM ticket_promociones_aplicadas
  WHERE ticket_id = p_ticket_id
    AND cancelada_por_cajero = false
    AND promocion_alcance_snapshot = 'TICKET_COMPLETO';
  v_promociones := v_promociones + v_item_promo;
  v_total := v_total - v_item_promo;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Subtotal final (sin IVA) — útil para reportes
  v_subtotal_final := v_total - v_iva;
  IF v_subtotal_final < 0 THEN v_subtotal_final := 0; END IF;

  -- Pagos
  SELECT
    COALESCE(SUM(monto_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0),
    COALESCE(SUM(cambio_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0)
  INTO v_monto_pagado, v_cambio
  FROM pagos
  WHERE ticket_id = p_ticket_id
    AND deleted_at IS NULL;

  -- Persistir totales en el ticket
  UPDATE tickets
  SET subtotal_mxn            = v_subtotal_final,
      descuentos_manuales_mxn = v_descuentos_manuales,
      promociones_mxn         = v_promociones,
      iva_mxn                 = v_iva,
      total_mxn               = v_total,
      monto_pagado_mxn        = v_monto_pagado,
      cambio_mxn              = v_cambio,
      updated_at              = now()
  WHERE id = p_ticket_id;
END;
$$;

COMMENT ON FUNCTION recalcular_totales_ticket IS 'Punto único de verdad para totales del ticket (D42). Idempotente. Invocada por triggers AFTER en items, pagos, descuentos, promos.';
```

> **Convención de redondeo:** ROUND a 2 decimales en cada cálculo de IVA por ítem. La suma se hace después. Esto puede producir diferencias de ±$0.01 vs un cálculo a nivel ticket; aceptable y consistente con la práctica del SAT.

### 8.2 `abrir_ticket(...)`

Crea un ticket en estado `BORRADOR`. El folio se asigna automáticamente al agregar el primer item (vía trigger §3.3.3).

```sql
CREATE OR REPLACE FUNCTION abrir_ticket(
  p_sucursal_id    uuid,
  p_caja_id        uuid,
  p_turno_id       uuid,
  p_modo_servicio  modo_servicio,
  p_cliente_id     uuid DEFAULT NULL,
  p_marca_virtual_id uuid DEFAULT NULL,
  p_client_id_local varchar DEFAULT NULL,
  p_usuario_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_ticket_id uuid;
BEGIN
  -- Validar turno abierto y obtener tenant_id
  SELECT t.tenant_id INTO v_tenant_id
  FROM turnos t
  WHERE t.id = p_turno_id
    AND t.sucursal_id = p_sucursal_id
    AND t.caja_id = p_caja_id
    AND t.estado = 'ABIERTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no está abierto o no corresponde a la sucursal/caja indicada', p_turno_id;
  END IF;

  -- Idempotencia: si ya existe ticket con este client_id_local, devolver el existente
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_ticket_id
    FROM tickets
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;

    IF FOUND THEN
      RETURN v_ticket_id;
    END IF;
  END IF;

  -- Crear ticket en BORRADOR
  INSERT INTO tickets (
    tenant_id, sucursal_id, caja_id, turno_id,
    modo_servicio, cliente_id, marca_virtual_id,
    estado_fiscal, estado_cocina,
    client_id_local, origen_creacion,
    usuario_apertura_id, created_by
  ) VALUES (
    v_tenant_id, p_sucursal_id, p_caja_id, p_turno_id,
    p_modo_servicio, p_cliente_id, p_marca_virtual_id,
    'BORRADOR', 'SIN_ENVIAR',
    p_client_id_local, 'POS_ONLINE',
    COALESCE(p_usuario_id, auth.uid()), COALESCE(p_usuario_id, auth.uid())
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

COMMENT ON FUNCTION abrir_ticket IS 'Crea un ticket en BORRADOR. Idempotente vía client_id_local. El folio se asigna al primer item.';
```

### 8.3 `agregar_item_a_ticket(...)`

Inserta una línea con snapshot completo del producto. Maneja modificadores como JSON.

```sql
CREATE OR REPLACE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
  -- estructura esperada del jsonb:
  -- [
  --   { "opcion_modificador_id": "uuid", "cantidad": 1 },
  --   { "opcion_modificador_id": "uuid", "cantidad": 2 }
  -- ]
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_ticket_estado ticket_estado_fiscal;
  v_producto      record;
  v_item_id       uuid;
  v_modif         jsonb;
  v_opcion        record;
  v_next_orden    integer;
BEGIN
  -- Validar ticket y obtener contexto
  SELECT tenant_id, estado_fiscal INTO v_tenant_id, v_ticket_estado
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar items a tickets BORRADOR o ABIERTO (estado actual: %)', v_ticket_estado;
  END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM ticket_items
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_item_id; END IF;
  END IF;

  -- Obtener snapshot del producto
  SELECT p.id, p.nombre, p.sku, p.precio_base_mxn, p.tasa_iva,
         p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
         p.modos_servicio_aplicables,
         c.nombre AS categoria_nombre,
         ac.nombre AS area_cocina_nombre
  INTO v_producto
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN areas_cocina ac ON ac.id = p.area_cocina_id
  WHERE p.id = p_producto_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no existe o está eliminado', p_producto_id;
  END IF;

  -- Calcular siguiente orden_visualizacion
  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1
  INTO v_next_orden
  FROM ticket_items
  WHERE ticket_id = p_ticket_id;

  -- Insertar item con snapshot
  INSERT INTO ticket_items (
    tenant_id, ticket_id, producto_id, cantidad, orden_visualizacion,
    producto_nombre_snapshot, producto_sku_snapshot,
    precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
    clave_sat_snapshot, unidad_sat_snapshot,
    categoria_nombre_snapshot, modos_servicio_snapshot, area_cocina_nombre_snapshot,
    nota_cocina, client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, v_producto.id, p_cantidad, v_next_orden,
    v_producto.nombre, v_producto.sku,
    v_producto.precio_base_mxn, v_producto.tasa_iva, v_producto.iva_incluido_en_precio,
    v_producto.clave_sat, v_producto.unidad_sat,
    v_producto.categoria_nombre, v_producto.modos_servicio_aplicables, v_producto.area_cocina_nombre,
    p_nota_cocina, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_item_id;

  -- Procesar modificadores
  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    FOR v_modif IN SELECT * FROM jsonb_array_elements(p_modificadores)
    LOOP
      SELECT om.id, om.nombre, om.precio_extra,
             gm.id AS grupo_id, gm.nombre AS grupo_nombre, gm.naturaleza
      INTO v_opcion
      FROM opciones_modificador om
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      WHERE om.id = (v_modif->>'opcion_modificador_id')::uuid
        AND om.deleted_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Opción de modificador % no existe', v_modif->>'opcion_modificador_id';
      END IF;

      INSERT INTO ticket_item_modificadores (
        tenant_id, ticket_item_id,
        opcion_modificador_id, grupo_id,
        grupo_nombre_snapshot, opcion_nombre_snapshot,
        precio_extra_snapshot, naturaleza_snapshot,
        cantidad, monto_total_mxn,
        created_by
      ) VALUES (
        v_tenant_id, v_item_id,
        v_opcion.id, v_opcion.grupo_id,
        v_opcion.grupo_nombre, v_opcion.nombre,
        v_opcion.precio_extra, v_opcion.naturaleza,
        COALESCE((v_modif->>'cantidad')::integer, 1),
        v_opcion.precio_extra * COALESCE((v_modif->>'cantidad')::integer, 1) * p_cantidad,
        auth.uid()
      );
    END LOOP;
  END IF;

  -- recalcular_totales_ticket() ya fue invocada por los triggers de items y modificadores

  RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION agregar_item_a_ticket IS 'Inserta un item con snapshot completo del producto y sus modificadores. Idempotente vía client_id_local.';
```

### 8.4 `aplicar_descuento_manual(...)`

```sql
CREATE OR REPLACE FUNCTION aplicar_descuento_manual(
  p_ticket_id        uuid,
  p_ticket_item_id   uuid,                       -- NULL = aplica al ticket completo
  p_tipo             descuento_manual_tipo,
  p_valor            numeric(12,2),              -- porcentaje, monto fijo, o precio override
  p_motivo_categoria descuento_manual_motivo,
  p_motivo_texto     text,                       -- obligatorio si motivo=OTRO
  p_autorizacion_pin_id uuid,                    -- pre-obtenida del flujo de PIN
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id uuid,
  p_client_id_local  varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id        uuid;
  v_descuento_id     uuid;
  v_monto_descontado numeric(12,2);
  v_base             numeric(12,2);
  v_porc             numeric(5,2);
  v_monto            numeric(12,2);
  v_precio_over      numeric(12,2);
  v_item             record;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_descuento_id FROM ticket_descuentos_manuales
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_descuento_id; END IF;
  END IF;

  -- Calcular monto descontado según tipo
  IF p_tipo = 'PORCENTAJE' THEN
    v_porc := p_valor;
    -- Base de cálculo depende del alcance
    IF p_ticket_item_id IS NULL THEN
      SELECT subtotal_mxn + iva_mxn - promociones_mxn INTO v_base FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_base FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;
    v_monto_descontado := ROUND(v_base * v_porc / 100, 2);

  ELSIF p_tipo = 'MONTO_FIJO' THEN
    v_monto := p_valor;
    v_monto_descontado := v_monto;

  ELSIF p_tipo = 'CORTESIA_TOTAL' THEN
    IF p_ticket_item_id IS NULL THEN
      SELECT total_mxn INTO v_monto_descontado FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_monto_descontado FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    -- Para OVERRIDE_PRECIO: marcamos el ítem con precio_override y calculamos el delta
    v_precio_over := p_valor;
    SELECT * INTO v_item FROM ticket_items WHERE id = p_ticket_item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
    v_monto_descontado := GREATEST(0, (v_item.precio_unitario_snapshot - v_precio_over) * v_item.cantidad);

    -- Actualizar el ítem con override
    UPDATE ticket_items
    SET precio_override = true,
        precio_unitario_original_snapshot = precio_unitario_snapshot,
        autorizacion_pin_override_id = p_autorizacion_pin_id,
        precio_unitario_snapshot = v_precio_over
    WHERE id = p_ticket_item_id;
  END IF;

  -- Insertar registro del descuento
  INSERT INTO ticket_descuentos_manuales (
    tenant_id, ticket_id, ticket_item_id,
    tipo, valor_porcentaje, valor_monto_mxn, precio_override_mxn,
    monto_descontado_mxn,
    motivo_categoria, motivo_texto,
    autorizacion_pin_id,
    usuario_solicitante_id, usuario_autorizo_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_ticket_item_id,
    p_tipo,
    CASE WHEN p_tipo = 'PORCENTAJE'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'MONTO_FIJO'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'OVERRIDE_PRECIO' THEN p_valor ELSE NULL END,
    v_monto_descontado,
    p_motivo_categoria, p_motivo_texto,
    p_autorizacion_pin_id,
    p_usuario_solicitante_id, p_usuario_autorizo_id,
    p_client_id_local, p_usuario_solicitante_id
  ) RETURNING id INTO v_descuento_id;

  RETURN v_descuento_id;
END;
$$;

COMMENT ON FUNCTION aplicar_descuento_manual IS 'Aplica un descuento manual al ticket o ítem. Asume que ya existe la autorización_pin (la app debe validar el PIN antes de invocar).';
```

### 8.5 `evaluar_y_aplicar_promociones(ticket_id)` — esqueleto

La evaluación completa de condiciones jsonb (Parte 1B §6.4) vive principalmente en la capa de servicios por su complejidad. Aquí entregamos el esqueleto SQL que itera promociones activas y delega la evaluación al cliente.

```sql
CREATE OR REPLACE FUNCTION evaluar_promociones_aplicables(p_ticket_id uuid)
RETURNS TABLE (
  promocion_id          uuid,
  nombre                varchar(150),
  tipo                  promocion_tipo,
  alcance               promocion_alcance,
  monto_descuento_estimado_mxn numeric(12,2),
  condiciones           jsonb,
  prioridad             integer
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_tenant_id   uuid;
  v_sucursal_id uuid;
  v_modo        modo_servicio;
  v_cliente_id  uuid;
  v_subtotal    numeric(12,2);
  v_ahora       timestamptz := now();
BEGIN
  SELECT t.tenant_id, t.sucursal_id, t.modo_servicio, t.cliente_id,
         t.subtotal_mxn + t.iva_mxn
  INTO v_tenant_id, v_sucursal_id, v_modo, v_cliente_id, v_subtotal
  FROM tickets t
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- Retornar promociones que cumplen FILTROS BÁSICOS evaluables en SQL.
  -- La evaluación detallada de condiciones jsonb se hace en la capa de servicios.
  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.tipo,
    p.alcance,
    -- Estimación rápida del descuento (la app recalcula exactamente al aplicar)
    CASE
      WHEN p.tipo = 'PORCENTAJE'     THEN ROUND(v_subtotal * p.valor_porcentaje / 100, 2)
      WHEN p.tipo = 'MONTO_FIJO'     THEN p.valor_monto_mxn
      WHEN p.tipo = 'CORTESIA_TOTAL' THEN v_subtotal
      ELSE 0
    END AS monto_descuento_estimado_mxn,
    p.condiciones,
    p.prioridad
  FROM promociones p
  WHERE p.tenant_id = v_tenant_id
    AND p.estado = 'ACTIVA'
    AND p.deleted_at IS NULL
    AND p.fecha_inicio <= v_ahora
    AND (p.fecha_fin IS NULL OR p.fecha_fin >= v_ahora)
    AND (p.max_usos_total IS NULL OR p.usos_actuales < p.max_usos_total)
    AND (
      -- Filtro de sucursal si la condición existe en jsonb
      NOT (p.condiciones ? 'sucursales_aplicables')
      OR v_sucursal_id::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'sucursales_aplicables')
      )
    )
    AND (
      -- Filtro de modo de servicio
      NOT (p.condiciones ? 'modos_servicio_permitidos')
      OR v_modo::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'modos_servicio_permitidos')
      )
    )
    AND (
      -- Filtro de monto mínimo
      NOT (p.condiciones ? 'monto_ticket')
      OR (p.condiciones->'monto_ticket'->>'minimo_mxn') IS NULL
      OR v_subtotal >= (p.condiciones->'monto_ticket'->>'minimo_mxn')::numeric
    )
    AND (
      -- Filtro requiere_cliente_identificado
      p.requiere_cliente_identificado = false
      OR v_cliente_id IS NOT NULL
    )
  ORDER BY p.prioridad DESC, p.valor_porcentaje DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION evaluar_promociones_aplicables IS 'Devuelve promociones que cumplen filtros básicos en SQL. La app evalúa horarios, días de semana y cupones (más complejo) en JS y llama aplicar_promocion() para confirmar.';
```

> **División de responsabilidades:** los filtros que son **siempre evaluables al momento del SELECT** (modo de servicio, monto mínimo, sucursal, vigencia, usos restantes, cliente requerido) viven en SQL. Los que requieren cómputo en hora local del tenant o lógica compleja (días de la semana, ventana horaria, validación de cupón teclado por el cajero) viven en la capa de servicios. La función `aplicar_promocion_a_ticket()` (no se implementa en este documento por brevedad; queda como contrato) recibe el ID de la promoción ya validado por la app y simplemente inserta en `ticket_promociones_aplicadas`.

### 8.6 `aplicar_pago(...)`

```sql
CREATE OR REPLACE FUNCTION aplicar_pago(
  p_ticket_id       uuid,
  p_metodo_pago     metodo_pago,
  p_monto_mxn       numeric(12,2),
  p_monto_recibido_mxn numeric(12,2) DEFAULT NULL,    -- solo efectivo
  p_referencia      varchar DEFAULT NULL,
  p_terminal_aprobacion varchar DEFAULT NULL,
  p_folio_externo   varchar DEFAULT NULL,
  p_es_pago_al_recibir boolean DEFAULT false,
  p_nota            text DEFAULT NULL,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket       record;
  v_pago_id      uuid;
  v_cambio       numeric(12,2) := 0;
  v_pagado_actual numeric(12,2);
  v_estado_pago  pago_estado;
BEGIN
  -- Obtener ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  IF v_ticket.estado_fiscal NOT IN ('ABIERTO', 'BORRADOR') THEN
    RAISE EXCEPTION 'No se puede aplicar pago a un ticket en estado %', v_ticket.estado_fiscal;
  END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_pago_id FROM pagos
    WHERE tenant_id = v_ticket.tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_pago_id; END IF;
  END IF;

  -- Validar suma de pagos no exceda total (D42 — protege contra cobros dobles)
  v_pagado_actual := v_ticket.monto_pagado_mxn;
  IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + 0.01 THEN
    RAISE EXCEPTION 'El pago de % excede el total pendiente del ticket (total: %, pagado: %)',
      p_monto_mxn, v_ticket.total_mxn, v_pagado_actual;
  END IF;

  -- Calcular cambio si efectivo
  IF p_metodo_pago = 'EFECTIVO' AND p_monto_recibido_mxn IS NOT NULL THEN
    v_cambio := GREATEST(0, p_monto_recibido_mxn - p_monto_mxn);
  END IF;

  -- Estado del pago
  v_estado_pago := CASE
    WHEN p_es_pago_al_recibir THEN 'PENDIENTE'
    WHEN p_metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO') THEN 'APLICADO'
    ELSE 'APLICADO'
  END;

  -- Insertar pago
  INSERT INTO pagos (
    tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
    metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn,
    referencia, terminal_aprobacion, folio_externo,
    es_pago_al_recibir, estado,
    usuario_id, nota, client_id_local, created_by
  ) VALUES (
    v_ticket.tenant_id, v_ticket.sucursal_id, v_ticket.caja_id, v_ticket.turno_id, p_ticket_id,
    p_metodo_pago, p_monto_mxn, p_monto_recibido_mxn, v_cambio,
    p_referencia, p_terminal_aprobacion, p_folio_externo,
    p_es_pago_al_recibir, v_estado_pago,
    auth.uid(), p_nota, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_pago_id;

  -- recalcular_totales_ticket() ya fue invocada por trigger

  -- Si el ticket queda completamente pagado, transicionar a PAGADO
  PERFORM cerrar_ticket_si_pagado(p_ticket_id);

  RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION aplicar_pago IS 'Aplica un pago al ticket. Si los pagos suman el total, transiciona automáticamente a PAGADO.';
```

### 8.7 `cerrar_ticket_si_pagado(ticket_id)` — interna

```sql
CREATE OR REPLACE FUNCTION cerrar_ticket_si_pagado(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket record;
BEGIN
  SELECT id, estado_fiscal, total_mxn, monto_pagado_mxn, monto_pendiente_mxn
  INTO v_ticket
  FROM tickets WHERE id = p_ticket_id;

  IF v_ticket.estado_fiscal = 'ABIERTO'
     AND v_ticket.total_mxn > 0
     AND v_ticket.monto_pendiente_mxn <= 0.01 THEN  -- tolerancia de redondeo
    UPDATE tickets
    SET estado_fiscal = 'PAGADO',
        fecha_pago = now(),
        usuario_cierre_id = auth.uid()
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
```

### 8.8 `cancelar_item_ticket(...)`

```sql
CREATE OR REPLACE FUNCTION cancelar_item_ticket(
  p_ticket_item_id  uuid,
  p_motivo          text,
  p_autorizacion_pin_id uuid DEFAULT NULL          -- requerido si el ticket ya está EN_COCINA
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item    record;
  v_ticket  record;
BEGIN
  SELECT ti.*, t.estado_fiscal, t.estado_cocina, t.tenant_id AS t_tenant
  INTO v_item
  FROM ticket_items ti
  JOIN tickets t ON t.id = ti.ticket_id
  WHERE ti.id = p_ticket_item_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
  IF v_item.cancelado THEN
    RAISE EXCEPTION 'Item ya está cancelado';
  END IF;
  IF v_item.estado_fiscal = 'PAGADO' THEN
    RAISE EXCEPTION 'No se puede cancelar items de ticket PAGADO. Usar flujo de devolución (1C.2)';
  END IF;

  -- Si la comanda ya está en cocina, requiere PIN (§16.3)
  IF v_item.estado_cocina IN ('EN_COCINA', 'LISTO') AND p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Cancelar item con comanda en cocina requiere autorización_pin_id';
  END IF;

  UPDATE ticket_items
  SET cancelado = true,
      motivo_cancelacion = p_motivo,
      usuario_cancelo_id = auth.uid(),
      autorizacion_cancelacion_id = p_autorizacion_pin_id,
      cancelado_at = now()
  WHERE id = p_ticket_item_id;

  -- recalcular_totales_ticket() invocada por trigger
END;
$$;

COMMENT ON FUNCTION cancelar_item_ticket IS 'Cancela un ítem individual sin cancelar el ticket. Si la comanda ya está en cocina, requiere PIN (§16.3).';
```

### 8.9 `poner_ticket_en_espera(ticket_id, etiqueta)` y `retomar_ticket(ticket_id)`

```sql
CREATE OR REPLACE FUNCTION poner_ticket_en_espera(
  p_ticket_id  uuid,
  p_etiqueta   varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = p_ticket_id;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden poner en espera tickets BORRADOR o ABIERTO';
  END IF;

  UPDATE tickets
  SET en_espera = true,
      etiqueta_espera = p_etiqueta,
      fecha_puesto_en_espera = now()
  WHERE id = p_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION retomar_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET en_espera = false,
      fecha_puesto_en_espera = NULL
  WHERE id = p_ticket_id;
END;
$$;
```

### 8.10 `marcar_pedido_listo(ticket_id)` y `marcar_pedido_entregado(ticket_id)`

```sql
CREATE OR REPLACE FUNCTION marcar_pedido_listo(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET estado_cocina = 'LISTO'
  WHERE id = p_ticket_id
    AND estado_cocina = 'EN_COCINA';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede marcar como LISTO: el ticket no está en EN_COCINA';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION marcar_pedido_entregado(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET estado_cocina = 'ENTREGADO',
      usuario_entrega_id = auth.uid()
  WHERE id = p_ticket_id
    AND estado_cocina = 'LISTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede marcar como ENTREGADO: el ticket no está en LISTO';
  END IF;
END;
$$;
```

### 8.11 `transicionar_estado_cocina_con_autorizacion(...)` — reversa con PIN

Permite reversar `estado_cocina` (corrección de errores) con autorización registrada.

```sql
CREATE OR REPLACE FUNCTION transicionar_estado_cocina_con_autorizacion(
  p_ticket_id        uuid,
  p_estado_destino   ticket_estado_cocina,
  p_autorizacion_pin_id uuid,
  p_motivo           text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- permite saltar el trigger trg_tickets_validar_estado_cocina
AS $$
DECLARE
  v_estado_anterior ticket_estado_cocina;
  v_tenant_id       uuid;
BEGIN
  SELECT estado_cocina, tenant_id INTO v_estado_anterior, v_tenant_id
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Desactivar trigger validador para esta transacción
  SET LOCAL session_replication_role = 'replica';

  UPDATE tickets
  SET estado_cocina = p_estado_destino,
      updated_by = auth.uid()
  WHERE id = p_ticket_id;

  -- Reactivar trigger
  SET LOCAL session_replication_role = 'origin';

  -- Auditoría explícita del salto autorizado
  INSERT INTO auditoria_eventos (
    tenant_id, usuario_id, usuario_autorizo_id,
    categoria, evento_codigo, entidad_tipo, entidad_id, payload
  ) VALUES (
    v_tenant_id, auth.uid(),
    (SELECT usuario_autorizo_id FROM autorizaciones_pin WHERE id = p_autorizacion_pin_id),
    'COCINA', 'estado_cocina.reversa_autorizada',
    'ticket', p_ticket_id,
    jsonb_build_object(
      'estado_anterior', v_estado_anterior,
      'estado_nuevo', p_estado_destino,
      'motivo', p_motivo,
      'autorizacion_pin_id', p_autorizacion_pin_id
    )
  );
END;
$$;

COMMENT ON FUNCTION transicionar_estado_cocina_con_autorizacion IS 'Reversa de estado_cocina con autorización PIN. SECURITY DEFINER + session_replication_role para saltar trigger validador.';
```

> **Sobre SECURITY DEFINER:** las funciones marcadas con `SECURITY DEFINER` se ejecutan con los privilegios del propietario, no del invocador. Esto les permite saltar RLS y triggers internos. La función debe validar manualmente los permisos del invocador (no implementado aquí por brevedad; en producción se valida vía `auth.uid()` + lookup en `usuarios_acceso` + `permisos`).

---

## 9. RLS consolidada

Todas las tablas operativas de Parte 1C.1 viven con `ROW LEVEL SECURITY ENABLED` y políticas idénticas en estructura a las de Partes 1A y 1B: filtrado por `current_tenant_id()` (Parte 1A §8.1) + restricción adicional por sucursal cuando aplica. Los administradores de tenant pueden ver toda la operación de su negocio; los cajeros y supervisores ven solo lo de su sucursal/caja.

### 9.1 Estrategia y patrón estándar

```sql
-- Patrón aplicado a cada tabla:
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario del tenant puede leer (con o sin restricción de sucursal)
CREATE POLICY <tabla>_select ON <tabla>
  FOR SELECT
  USING (tenant_id = current_tenant_id());

-- Escritura: usuarios autenticados del tenant pueden escribir
CREATE POLICY <tabla>_insert ON <tabla>
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY <tabla>_update ON <tabla>
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido por defecto (soft delete vía UPDATE)
-- Si se necesita, se concede a través de funciones SECURITY DEFINER específicas.
```

> **Razón:** la lógica fina de "qué cajero ve qué" se hace en la app vía consultas que ya filtran por `caja_id` o `turno_id`. La RLS solo previene el cross-tenant. Esto es congruente con D2 y la práctica de Parte 1A §9.

### 9.2 Aplicación a cada tabla

```sql
-- ====== tickets ======
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_select ON tickets
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tickets_insert ON tickets
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tickets_update ON tickets
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- No se permite DELETE — usar soft delete.

-- ====== ticket_items ======
ALTER TABLE ticket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_items_select ON ticket_items
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_insert ON ticket_items
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_update ON ticket_items
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_delete ON ticket_items
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_id IN (
      SELECT id FROM tickets WHERE estado_fiscal = 'BORRADOR'
    )
  );
-- Solo se pueden DELETE items de tickets en BORRADOR (todavía no tienen folio).
-- Items de tickets ABIERTO se cancelan, no se borran.

-- ====== ticket_item_modificadores ======
ALTER TABLE ticket_item_modificadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tim_select ON ticket_item_modificadores
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tim_insert ON ticket_item_modificadores
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tim_update ON ticket_item_modificadores
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tim_delete ON ticket_item_modificadores
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_item_id IN (
      SELECT ti.id FROM ticket_items ti
      JOIN tickets t ON t.id = ti.ticket_id
      WHERE t.estado_fiscal = 'BORRADOR'
    )
  );

-- ====== pagos ======
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY pagos_select ON pagos
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY pagos_insert ON pagos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY pagos_update ON pagos
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido para pagos. Reverso es soft delete vía UPDATE deleted_at
-- y/o cancelación del ticket completo (1C.2).

-- ====== ticket_descuentos_manuales ======
ALTER TABLE ticket_descuentos_manuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY descmanual_select ON ticket_descuentos_manuales
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY descmanual_insert ON ticket_descuentos_manuales
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY descmanual_update ON ticket_descuentos_manuales
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- No DELETE — reverso vía flag 'reversado'.

-- ====== ticket_promociones_aplicadas ======
ALTER TABLE ticket_promociones_aplicadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY promoapl_select ON ticket_promociones_aplicadas
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY promoapl_insert ON ticket_promociones_aplicadas
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY promoapl_update ON ticket_promociones_aplicadas
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY promoapl_delete ON ticket_promociones_aplicadas
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_id IN (
      SELECT id FROM tickets WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')
    )
  );
-- Promos pueden eliminarse físicamente solo si el ticket no se ha pagado.
-- Para tickets pagados se marca cancelada_por_cajero = true.
```

### 9.3 Notas sobre SECURITY DEFINER y RLS

Las funciones públicas (`abrir_ticket`, `agregar_item_a_ticket`, `aplicar_pago`, etc.) NO usan `SECURITY DEFINER` salvo `transicionar_estado_cocina_con_autorizacion()` que necesita saltar un trigger validador. Las demás se invocan con los permisos del usuario y RLS las protege normalmente.

`recalcular_totales_ticket()` recibe explícitamente el `ticket_id` ya validado por la app o por triggers internos que ya operan bajo el contexto del ticket en cuestión. Es seguro invocarla sin `SECURITY DEFINER`.

---

## 10. Estrategia de migraciones (continuación)

Esta Parte 1C.1 introduce 6 tablas operativas, 5 enums y 11 funciones. El orden de aplicación es crítico: hay dependencias hacia atrás (1A, 1B) y dependencias internas.

### 10.1 Orden recomendado de archivos de migración

```
migrations/
├── 010_core_setup.sql                  (Parte 1A — ya aplicada)
├── 011_catalogo.sql                    (Parte 1B — ya aplicada)
├── 020_operacion_enums.sql             ← este documento, §3.1, §5.1, §6.1
├── 021_operacion_tickets.sql           ← este documento, §3.2-§3.3
├── 022_operacion_items.sql             ← este documento, §4.1, §4.2, §4.3
├── 023_operacion_pagos.sql             ← este documento, §5.2, §5.3
├── 024_operacion_descuentos.sql        ← este documento, §6.2, §6.3
├── 025_operacion_promociones_apl.sql   ← este documento, §7.1, §7.2
├── 026_operacion_funciones.sql         ← este documento, §8 (helpers)
└── 027_operacion_rls.sql               ← este documento, §9
```

### 10.2 Dependencias hacia atrás (validación crítica)

Antes de aplicar 020-027 deben existir en BD:

| Dependencia | Origen | Validación |
|---|---|---|
| `tenants`, `sucursales`, `cajas`, `turnos` | Parte 1A | `SELECT count(*) FROM tenants;` |
| `calcular_dia_contable()` | Parte 1A §8.3 | `SELECT calcular_dia_contable(...);` |
| `generar_folio()` | Parte 1A §8.4 | `SELECT generar_folio(...);` |
| `set_updated_at()` | Parte 1A §8.5 | `\df set_updated_at` |
| `auditoria_eventos` | Parte 1A §10 | `\d auditoria_eventos` |
| `autorizaciones_pin` | Parte 1A §7.3 | `\d autorizaciones_pin` |
| `productos`, `categorias`, `opciones_modificador`, `grupos_modificadores`, `areas_cocina` | Parte 1B | `\d productos` |
| `promociones` | Parte 1B §6 | `\d promociones` |
| `clientes`, `direcciones_cliente` | Parte 1B §5 | `\d clientes` |
| `marcas_virtuales` | Parte 1B §7 | `\d marcas_virtuales` |
| `descontar_inventario_por_venta()` | Parte 1B §9.6 | `\df descontar_inventario_por_venta` |
| Enum `modificador_naturaleza` | Parte 1B §3.5 | `\dT modificador_naturaleza` |
| Enum `promocion_tipo`, `promocion_alcance` | Parte 1B §6.1 | `\dT promocion_tipo` |

### 10.3 Validaciones post-migración

```sql
-- Verificar que las 6 tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tickets', 'ticket_items', 'ticket_item_modificadores',
                     'pagos', 'ticket_descuentos_manuales', 'ticket_promociones_aplicadas')
ORDER BY table_name;
-- Debe devolver las 6.

-- Verificar enums creados
SELECT typname FROM pg_type WHERE typname IN (
  'ticket_estado_fiscal', 'ticket_estado_cocina', 'modo_servicio',
  'ticket_origen', 'metodo_pago', 'pago_estado',
  'descuento_manual_tipo', 'descuento_manual_motivo'
);
-- Debe devolver los 8.

-- Verificar RLS habilitado
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('tickets', 'ticket_items', 'ticket_item_modificadores',
                  'pagos', 'ticket_descuentos_manuales', 'ticket_promociones_aplicadas');
-- Todas deben tener relrowsecurity = t.

-- Verificar triggers (esperados: 8 en tickets, 3 en items, 1 en modificadores,
-- 5 en pagos, 3 en descuentos, 4 en promo_aplicadas; total ~24)
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_table IN ('tickets', 'ticket_items', 'ticket_item_modificadores',
                              'pagos', 'ticket_descuentos_manuales', 'ticket_promociones_aplicadas')
ORDER BY event_object_table, trigger_name;

-- Verificar funciones públicas declaradas
SELECT proname FROM pg_proc WHERE proname IN (
  'recalcular_totales_ticket', 'abrir_ticket', 'agregar_item_a_ticket',
  'aplicar_descuento_manual', 'evaluar_promociones_aplicables',
  'aplicar_pago', 'cerrar_ticket_si_pagado',
  'cancelar_item_ticket', 'poner_ticket_en_espera', 'retomar_ticket',
  'marcar_pedido_listo', 'marcar_pedido_entregado',
  'transicionar_estado_cocina_con_autorizacion'
);
-- Debe devolver las 13.
```

### 10.4 Compatibilidad con futuras partes

Esta migración deja **slots vacíos** para 1C.2 y 1D que no requerirán cambios destructivos:

- **Para 1C.2 / Estados de cocina con delivery propio:** `ALTER TYPE ticket_estado_cocina ADD VALUE 'EN_RUTA' BEFORE 'ENTREGADO';` y `ADD VALUE 'ENTREGADO_DOMICILIO' AFTER 'EN_RUTA';`
- **Para 1C.2 / CFDI:** crear tabla `tickets_cfdi` 1:1 opcional con tickets. No requiere ALTER en tickets.
- **Para 1C.2 / Devoluciones:** crear tablas `devoluciones` y `devolucion_items` independientes con FK a tickets. No requiere ALTER en tickets.
- **Para 1C.2 / Cancelaciones:** crear tabla `cancelaciones_ticket`. Agregar columnas opcionales en tickets vía ALTER (`fecha_cancelacion`, `motivo_cancelacion`, etc.).
- **Para 1D / Mesas (Full Service):** `ALTER TABLE tickets ADD COLUMN mesa_id uuid NULL REFERENCES mesas(id);`. La columna ya tiene su lugar conceptual reservado.
- **Para 1D / Cuentas abiertas (Café & Bar):** `ALTER TABLE tickets ADD COLUMN cuenta_abierta_id uuid NULL REFERENCES cuentas_abiertas(id);`.

Esto refleja la disciplina aditiva (D9) de no romper el contrato establecido.

---

## 11. Decisiones pendientes para Parte 1C.2 y 1D

Esta sección lista los temas que esta parte deliberadamente **no resolvió**, con la decisión preliminar de diseño que se confirmará al producir la siguiente entrega.

### 11.1 Devoluciones (1C.2)

**Decisión preliminar (D37):** documento independiente. Tabla `devoluciones` con folio propio del año (vía `generar_folio()` con `tipo_documento = 'DEVOLUCION'`), `ticket_original_id` como FK, columnas `total_devuelto_mxn`, `medio_devolucion` (efectivo / mismo medio que pago original / nota de crédito), `motivo_obligatorio`. Tabla hija `devolucion_items` con `ticket_item_id` original como referencia. **Los pagos originales NO se modifican**; se crean nuevos en `pagos` con `monto_mxn` negativo y referencia a `devolucion_id`. El ticket original se mantiene PAGADO, lo que mantiene limpia la trazabilidad CFDI.

Pendiente confirmar:
- ¿Devolución total = automáticamente CFDI nota de crédito? (sugerencia: sí, pero CFDI vive en 1C.2 §5)
- ¿Permitir devolución parcial sin requerir afectar inventario? (sugerencia: trigger igual al de venta pero invertido)

### 11.2 Cancelaciones de tickets pagados (1C.2)

**Decisión preliminar (D38):** transición de `estado_fiscal` a `CANCELADO` + fila en tabla `cancelaciones_ticket` con motivo, autorización_pin obligatoria, ts. El ticket conserva su folio y total. Pagos quedan en estado `CANCELADO`. Inventario se reversa (nuevo trigger). CFDI emitido se sustituye o se cancela ante SAT (manual o vía PAC, decisión §11.4).

### 11.3 Estados de cocina extendidos para delivery (1C.2)

**Decisión preliminar:** `ALTER TYPE ticket_estado_cocina ADD VALUE 'EN_RUTA' BEFORE 'ENTREGADO';` y `ADD VALUE 'ENTREGADO_DOMICILIO' AFTER 'EN_RUTA';`. Transiciones:
- `LISTO → EN_RUTA` (delivery propio: cuando el repartidor sale)
- `EN_RUTA → ENTREGADO_DOMICILIO` (cuando regresa con confirmación)
- `LISTO → ENTREGADO_DOMICILIO` (apps externas: cuando el repartidor de la app recoge)

### 11.4 CFDI 4.0 (1C.2)

**Decisión preliminar (D39):**
- Tabla `tickets_cfdi` 1:1 opcional con `tickets`. Columnas: `uuid_fiscal varchar(40)`, `folio_fiscal varchar(50)`, `serie varchar(20)`, `xml_path varchar(500)` (Supabase Storage), `pdf_path varchar(500)`, `estado_sat enum`, `fecha_timbrado timestamptz`, `pac_proveedor varchar`.
- El XML se guarda en Supabase Storage en bucket privado `cfdi/<tenant>/<año>/<mes>/<uuid>.xml`.
- Provider PAC integrable vía abstracción `proveedor_cfdi` (Facturapi, Solucionfactible, Finkok). Selección a nivel tenant.
- `nota_credito_cfdi` para devoluciones, mismo esquema.
- Sustituciones y cancelaciones SAT con tabla `cfdi_sat_movimientos` para auditar acuses.

### 11.5 Delivery propio (1C.2)

**Decisión preliminar (D43):**
- Tabla `delivery_asignaciones` 1:1 opcional con tickets (solo cuando `modo_servicio = 'DELIVERY_PROPIO'`).
- Columnas: `repartidor_id` (FK a usuarios), `fecha_salida`, `fecha_entrega_confirmada`, `fecha_regreso`, `liquidado_at`, `monto_a_liquidar_mxn` (cuando es pago al recibir, lo que el repartidor trae al regresar).
- Cierre de turno del repartidor en 1C.2 §6.

### 11.6 Apps externas — conciliación (1C.2)

**Decisión preliminar (D44):**
- Captura en `tickets.folio_externo_app` ya implementada (no requiere tabla).
- Para conciliación: vista/reporte `vw_ventas_apps_externas` que cruza tickets vs liquidaciones (subidas manualmente como CSV en Fase 1, integración API en Fase 5).
- Tabla `apps_liquidaciones` para Fase 5: ingesta automática de reportes de Rappi/Uber.

### 11.7 Sync offline completo (1C.2)

**Decisión preliminar (D40):**
- Cliente offline en Dexie.js con misma estructura de tablas que servidor.
- Cada operación genera UUID v4 + `client_id_local` (combinación dispositivo+timestamp+random).
- Al recobrar conectividad, push secuencial respetando dependencias (turnos antes que tickets, tickets antes que items, items antes que pagos).
- Conflict resolution: last-write-wins por `updated_at` para entidades no críticas; para tickets PAGADOS se rechaza cualquier intento de modificación post-sync.
- Detalle de edge cases (¿qué si el turno offline ya cerró en servidor?, ¿qué si dos cajeros offline crearon tickets con el mismo cliente?) en 1C.2 §9.

### 11.8 Mesas, cuentas abiertas, multi-marca operativa (1D)

Decisiones de modelo de datos para verticales: pendiente Parte 1D. Las columnas opcionales ya están reservadas conceptualmente.

### 11.9 Propinas (1D o Fase 2)

`tickets.propina_mxn` ya existe con default 0. La mecánica de captura (sugerida vs voluntaria, % o monto, asignación a meseros en Full Service) se modela en 1D §propinas.

### 11.10 Reimpresión de comanda (1C.2 menor)

`tickets.comanda_reimpresa_count` ya existe. La función `reimprimir_comanda(ticket_id, autorizacion_pin_id)` y el evento de auditoría correspondiente se modelan en 1C.2 §3 (mecánica de comanda completa).

---

## 12. Checklist de validación

Una vez aplicadas las migraciones 020-027, los siguientes criterios deben cumplirse para considerar 1C.1 completo y operable.

### 12.1 Mapeo de flujos del `/core` → tablas y funciones de 1C.1

| Flujo del `/core` | Tablas / funciones de 1C.1 que lo soportan |
|---|---|
| **§1.3 Estados del ticket** | `tickets.estado_fiscal` enum + triggers de validación §3.3.4 |
| **§1.3.bis Folio único** | `tickets.folio_completo` + trigger §3.3.3 + `generar_folio()` de 1A |
| **§6 Modos de servicio** | `tickets.modo_servicio` enum + `productos.modos_servicio_aplicables` (validación cruzada en `agregar_item_a_ticket()` queda como TODO) |
| **§11 Notas al ticket y al producto** | `tickets.nota_general` + flags + `ticket_items.nota_cocina` (D46) |
| **§12 Pedidos en espera** | `tickets.en_espera` + `etiqueta_espera` + funciones `poner_ticket_en_espera`/`retomar_ticket` (D45) |
| **§13.x Cancelación pre-cobro / item individual** | `ticket_items.cancelado` + función `cancelar_item_ticket()` |
| **§14.1 Descuentos manuales con PIN** | `ticket_descuentos_manuales` + FK obligatoria a `autorizaciones_pin` (D41) |
| **§14.2-§14.3 Tipos y motivos** | Enums `descuento_manual_tipo`, `descuento_manual_motivo` |
| **§14.4 Promociones automáticas** | `ticket_promociones_aplicadas` + `evaluar_promociones_aplicables()` |
| **§14.7 Cancelación manual de promo** | Columnas `cancelada_por_cajero`, `motivo_cancelacion` |
| **§16 Edición de items pre-cobro** | `ticket_items.cancelado` + función `cancelar_item_ticket()` con autorización opcional |
| **§17.1 Métodos de pago** | Enum `metodo_pago` con todos los métodos del `/core` |
| **§17.3 Pago dividido** | Tabla `pagos` 1:N permite N filas para un mismo ticket (D35) |
| **§17.5 Cambio en efectivo** | `pagos.monto_recibido_mxn`, `pagos.cambio_mxn`, `tickets.cambio_mxn` (consolidado) |
| **§18 Captura folio externo app** | `tickets.folio_externo_app` (D44) |
| **§19-§20 Comanda y áreas de cocina** | `tickets.comanda_impresa_at`, `comanda_reimpresa_count`, `estado_cocina` + áreas heredadas de items (Parte 1B) |
| **§20.3 Transiciones de cocina** | Trigger §3.3.5 + funciones `marcar_pedido_listo`, `marcar_pedido_entregado`, `transicionar_estado_cocina_con_autorizacion` |
| **§21 Marcar pedido como entregado** | Función `marcar_pedido_entregado()` |
| **§22 Delivery propio (cobro al recibir parcial)** | `pagos.es_pago_al_recibir`, `pagos.estado = 'PENDIENTE'`. Delivery completo en 1C.2 |
| **§23 Apps externas (captura)** | `tickets.folio_externo_app` + `modo_servicio = 'APP_*'`. Conciliación en 1C.2 |
| **§25.3 Día contable inmutable** | `tickets.dia_contable` + trigger protector §3.3.2 |
| **§27 Soft delete** | Columnas `deleted_at` en `tickets`, `pagos`. Items y modificadores con DELETE permitido solo para tickets BORRADOR |
| **Idempotencia sync offline** | `client_id_local` UNIQUE parcial en todas las tablas operativas (D40) |

### 12.2 Verificaciones técnicas (queries para correr en BD post-migración)

```sql
-- 12.2.1 Probar el flujo de creación + venta + cobro end-to-end (un script de smoke)

-- Configurar contexto de tenant para RLS
SELECT set_config('app.current_tenant_id', '<tenant_id_real>', false);

BEGIN;

-- 1. Abrir ticket
SELECT abrir_ticket(
  p_sucursal_id   := '<sucursal_id>'::uuid,
  p_caja_id       := '<caja_id>'::uuid,
  p_turno_id      := '<turno_abierto_id>'::uuid,
  p_modo_servicio := 'PARA_LLEVAR',
  p_client_id_local := 'TEST-001-T'
);
-- Debe devolver un uuid

-- Reusar el mismo client_id_local — debe devolver el mismo uuid (idempotencia)
SELECT abrir_ticket(
  p_sucursal_id   := '<sucursal_id>'::uuid,
  p_caja_id       := '<caja_id>'::uuid,
  p_turno_id      := '<turno_abierto_id>'::uuid,
  p_modo_servicio := 'PARA_LLEVAR',
  p_client_id_local := 'TEST-001-T'
);

-- 2. Verificar estado BORRADOR y sin folio
SELECT estado_fiscal, folio_completo, total_mxn
FROM tickets WHERE id = '<ticket_id>';
-- Esperar: BORRADOR, NULL, 0

-- 3. Agregar producto
SELECT agregar_item_a_ticket(
  p_ticket_id   := '<ticket_id>'::uuid,
  p_producto_id := '<producto_id>'::uuid,
  p_cantidad    := 2,
  p_nota_cocina := 'sin cebolla'
);

-- 4. Verificar promoción a ABIERTO y asignación de folio
SELECT estado_fiscal, folio_completo, subtotal_mxn, iva_mxn, total_mxn
FROM tickets WHERE id = '<ticket_id>';
-- Esperar: ABIERTO, 'K-2026-XXX...', valores calculados

-- 5. Aplicar pago completo
SELECT aplicar_pago(
  p_ticket_id   := '<ticket_id>'::uuid,
  p_metodo_pago := 'EFECTIVO',
  p_monto_mxn   := <total_mxn_del_ticket>,
  p_monto_recibido_mxn := <total_mxn_del_ticket> + 50,
  p_client_id_local := 'TEST-001-P'
);

-- 6. Verificar PAGADO y cambio
SELECT estado_fiscal, monto_pagado_mxn, cambio_mxn, fecha_pago
FROM tickets WHERE id = '<ticket_id>';
-- Esperar: PAGADO, total_mxn, 50.00, fecha actual

-- 7. Verificar inventario descontado (si está activo el módulo)
SELECT producto_id, cantidad_actual FROM stock_actual
WHERE producto_id = '<producto_id>';

-- 8. Verificar auditoría
SELECT evento_codigo, payload FROM auditoria_eventos
WHERE entidad_id = '<ticket_id>'::uuid
ORDER BY created_at;
-- Esperar: ticket.estado_fiscal.cambio (BORRADOR→ABIERTO), pago.aplicado, ticket.estado_fiscal.cambio (ABIERTO→PAGADO)

ROLLBACK;  -- es smoke test, no se persiste
```

### 12.3 Pruebas de aceptación funcional

Estas pruebas las debe correr el equipo de QA antes de declarar 1C.1 listo para integración con frontend.

- [ ] **TA-01 Apertura y cobro feliz:** abrir ticket → 3 productos → pago efectivo → PAGADO. Cambio correcto.
- [ ] **TA-02 Pago dividido:** abrir → 2 productos → 50% efectivo + 50% tarjeta → PAGADO al sumar.
- [ ] **TA-03 Modificadores:** agregar producto con 3 modificadores (1 SUSTITUCION, 2 EXTRAS) → totales incluyen precio_extra → IVA correcto.
- [ ] **TA-04 IVA incluido vs por afuera:** producto A iva_incluido=true, B=false → desglose IVA diferenciado por línea, total correcto.
- [ ] **TA-05 Cancelación de item pre-cocina:** sin PIN, cancela correctamente.
- [ ] **TA-06 Cancelación de item EN_COCINA:** falla sin `autorizacion_pin_id`; pasa con PIN.
- [ ] **TA-07 Descuento porcentaje al ticket:** descuento 10% sobre 4 productos → monto_descontado coherente, total recalculado.
- [ ] **TA-08 Descuento monto fijo a item:** descuento $20 sobre un item → solo afecta ese item.
- [ ] **TA-09 Override precio:** producto $100 → override a $75 con PIN → ticket muestra $75, registro de override en `ticket_descuentos_manuales` y `ticket_items.precio_override`.
- [ ] **TA-10 Promoción automática:** crear promo "10% lunes 12-17h", abrir ticket lunes 14h → promoción aparece en `evaluar_promociones_aplicables`, aplicarla → descuento se refleja.
- [ ] **TA-11 Promo + descuento manual coexistencia:** aplicar promo + descuento manual → ambos se cuentan en sus columnas respectivas, totales coherentes.
- [ ] **TA-12 Pedido en espera:** poner en espera con etiqueta → no aparece en vista activos, sí en vista de espera. Retomar → reaparece en activos.
- [ ] **TA-13 Folio único por sucursal:** crear N tickets concurrentes → folios consecutivos sin gaps anómalos.
- [ ] **TA-14 Día contable cruce de medianoche:** abrir ticket a 02:30 con cierre_dia_contable=03:00 → `dia_contable` debe ser el día anterior.
- [ ] **TA-15 Idempotencia sync:** dos llamadas `abrir_ticket` con mismo `client_id_local` → mismo ticket devuelto, no duplicado.
- [ ] **TA-16 Idempotencia sync items:** dos llamadas `agregar_item_a_ticket` con mismo `client_id_local` → mismo item, no duplicado.
- [ ] **TA-17 RLS cross-tenant:** desde tenant A no puede leer tickets de tenant B (incluso conociendo el uuid).
- [ ] **TA-18 Inmutabilidad de dia_contable:** UPDATE manual de `dia_contable` post-creación → falla.
- [ ] **TA-19 Inmutabilidad de folio_completo:** UPDATE manual post-asignación → falla.
- [ ] **TA-20 Transición fiscal inválida:** UPDATE de estado_fiscal de BORRADOR a PAGADO (salta ABIERTO) → falla.
- [ ] **TA-21 Reversión de cocina sin PIN:** UPDATE manual de estado_cocina de LISTO a EN_COCINA → falla. Vía `transicionar_estado_cocina_con_autorizacion` → pasa.
- [ ] **TA-22 Inventario al pagar:** producto con receta activa → al pagar, stock_actual se decrementa.
- [ ] **TA-23 Cortesía total:** descuento `CORTESIA_TOTAL` al ticket → `total_mxn = 0`, `monto_pendiente_mxn = 0`. Sin pago requerido. Estado puede pasar a PAGADO vía función explícita.
- [ ] **TA-24 Pago al recibir (delivery):** pago con `es_pago_al_recibir = true` → queda en estado PENDIENTE, ticket no pasa a PAGADO automáticamente. Función `confirmar_pago_pendiente()` se modela en 1C.2.
- [ ] **TA-25 Apps externas:** ticket con modo_servicio=APP_RAPPI y folio_externo_app="R-A4F92B" → pago APP_RAPPI por el total → conciliable en reporte.

### 12.4 Pruebas de carga y rendimiento (recomendaciones)

Para tenants grandes (>1000 tickets/día/sucursal), se recomienda probar:

- **Performance recálculo:** abrir ticket con 20 items y 50 modificadores → `recalcular_totales_ticket()` debe ejecutar en <50ms.
- **Concurrencia folio:** 50 sesiones aplicando `agregar_item_a_ticket` en paralelo → todas obtienen folios consecutivos sin deadlocks.
- **RLS overhead:** `EXPLAIN ANALYZE` sobre `SELECT * FROM tickets WHERE dia_contable = today` con 10K tickets/día → debe usar `idx_tickets_tenant_dia`.

### 12.5 Cosas que esta parte deja explícitamente para después

- ❌ Devoluciones funcionales (1C.2)
- ❌ Cancelaciones de tickets PAGADOS (1C.2)
- ❌ CFDI emisión, cancelación, nota de crédito (1C.2)
- ❌ Delivery propio liquidación y conciliación (1C.2)
- ❌ Apps externas conciliación de liquidaciones (1C.2)
- ❌ Reimpresión de comanda mecánica completa (1C.2)
- ❌ Sync offline conflict resolution detallado (1C.2)
- ❌ Mesas, cuentas abiertas, multi-marca operativa (1D)
- ❌ Propinas captura y reparto (1D)
- ❌ Reservaciones (1D)
- ❌ KDS (Kitchen Display System) — Fase 2 post-MVP
- ❌ Estado de cocina por ítem individual — Fase 2 post-MVP (KDS)

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. 15 decisiones nuevas (D33-D47) declaradas, 11 efectivas en 1C.1. 6 tablas operativas (`tickets`, `ticket_items`, `ticket_item_modificadores`, `pagos`, `ticket_descuentos_manuales`, `ticket_promociones_aplicadas`), 8 enums nuevos, 13 funciones públicas, ~24 triggers, RLS consolidada, estrategia de migración, checklist completo de validación con 25 pruebas de aceptación. Mapeo explícito a los flujos §1.3, §6, §11-§17, §19-§23 del `/core`. |

---

**Fin Parte 1C.1.** Siguiente: **Parte 1C.2 — Post-venta (devoluciones, cancelaciones, CFDI, delivery propio, conciliación apps externas, sync offline completo).** Estimado ~1,500-1,800 líneas SQL adicionales.
