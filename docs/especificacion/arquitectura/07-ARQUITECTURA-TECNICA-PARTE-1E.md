# 07 — ARQUITECTURA TÉCNICA — Parte 1E: Reportes consolidados, cierres extendidos, contabilidad operativa

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** sexta y última entrega de la arquitectura técnica de VIM POS (capa de modelo de datos del MVP)
> **Alcance:** lo que el dueño y supervisor consultan al final del día (y todo el día) — reporte X, reporte Z, cortes de caja extendidos, estado de resultados, ventas por dimensión, cumplimiento de tiempos, arqueo de efectivo
> **Depende de:** Parte 1A (turnos, cortes_caja, movimientos_caja), Parte 1B (productos, categorías, áreas), Parte 1C.1 (tickets, pagos), Parte 1C.2 (devoluciones, CFDI, delivery, apps), Parte 1D (mesas, cuentas, propinas distribuidas)
> **Stack:** PostgreSQL 15 vía Supabase, Row Level Security activo
> **Continúa en:** no continúa — esta parte cierra la capa SQL del MVP. Documentos subsecuentes ya son UI/UX (08-WIREFRAMES), operaciones (09-ROLES, 10-SETUP), o módulos avanzados (Fase 2+)

---

> ## ⚠️ Reconciliación post-validación (F1)
> Hallazgos al validar contra Postgres real (bitácora Playbook doc 18 §4; migración `0011`):
> - **`cortes_caja` NO existía en 1A** (1A creó `cortes_parciales`, otra forma). La tabla cabecera `cortes_caja` se **define en la migración de reportes 0011** según la usan `arquear_caja()` y las vistas (columnas: tenant/sucursal/caja/turno, motivo, total_esperado/declarado/diferencia, `fecha_corte`, autorizacion_pin_id).
> - `turnos` **no tiene `deleted_at`** (cancelación vía estado) ni `fondo_apertura_mxn` (es **`fondo_inicial_mxn`**).
> - Valores de `descuento_manual_motivo` y `movimiento_tipo`: usar los reales del enum; **`movimiento_tipo` se enriqueció** (+`INYECCION_FONDO`, +`PAGO_PROVEEDOR`, ver 1A §6).
> - Nombres de totales/columnas de ticket: los canónicos de 1C.1 (ver su nota de reconciliación).

## 📋 Tabla de contenidos

- [0. Introducción y dependencias](#0-introducción-y-dependencias)
- [1. Filosofía de los reportes](#1-filosofía-de-los-reportes)
- [2. Convenciones (recap)](#2-convenciones-recap)
- [3. Reporte X — lectura del turno en vivo](#3-reporte-x--lectura-del-turno-en-vivo)
- [4. Reporte Z — cierre formal persistido](#4-reporte-z--cierre-formal-persistido)
- [5. Cortes de caja extendidos](#5-cortes-de-caja-extendidos)
- [6. Estado de resultados consolidado](#6-estado-de-resultados-consolidado)
- [7. Ventas por dimensión (vistas analíticas)](#7-ventas-por-dimensión-vistas-analíticas)
- [8. Cumplimiento de tiempos](#8-cumplimiento-de-tiempos)
- [9. Vista de efectivo esperado / arqueo](#9-vista-de-efectivo-esperado--arqueo)
- [10. Funciones helper consolidadas](#10-funciones-helper-consolidadas)
- [11. RLS consolidada](#11-rls-consolidada)
- [12. Estrategia de migraciones (continuación)](#12-estrategia-de-migraciones-continuación)
- [13. Decisiones pendientes y fuera de alcance](#13-decisiones-pendientes-y-fuera-de-alcance)
- [14. Checklist de validación](#14-checklist-de-validación)

---

## 0. Introducción y dependencias

### 0.1 Propósito de este documento

Esta parte cierra el modelo de datos del MVP con la capa de **lectura**: lo que el dueño consulta cuando llega en la noche, lo que el cajero imprime para arquear su caja, lo que el contador necesita para hacer la declaración mensual.

**Distinción con partes previas:**

- 1A-1D modelaron **escritura** (entidades, mutaciones, eventos)
- **1E modela lectura agregada** (vistas materializadas conceptualmente, funciones que devuelven `jsonb` con totales, y dos tablas físicas — `cortes_caja_detalle` y `reportes_z_historico` — para snapshots inmutables)

En esta parte se concentran las **dimensiones de análisis** (por sucursal, por turno, por día, por método de pago, por mesero, por marca virtual, por categoría) sin duplicar datos crudos. Todo se reconstruye de las tablas base.

### 0.2 Alcance

**Esta Parte 1E cubre:**

- ✅ Función `reporte_x(turno_id)` para lectura en vivo del turno
- ✅ Función `reporte_z(turno_id)` que persiste un snapshot inmutable y bloquea el turno
- ✅ Tabla `reportes_z_historico` con JSONB completo del Z (auditoría inmutable)
- ✅ Tabla `cortes_caja_detalle` con desglose por método de pago dentro de un corte
- ✅ Función `arquear_caja(turno_id, ...)` con detección de diferencias por método
- ✅ Vistas: `vw_estado_resultados_dia`, `vw_ventas_por_categoria`, `vw_ventas_por_producto`, `vw_ventas_por_area_cocina`, `vw_ventas_por_mesero`, `vw_ventas_por_modo_servicio`, `vw_efectivo_esperado_turno`
- ✅ Vistas de cumplimiento: `vw_cumplimiento_tiempos_cocina`, `vw_cumplimiento_tiempos_delivery`, `vw_no_shows_reservaciones`
- ✅ Función `kpis_dia_sucursal(sucursal_id, fecha)` consolidando los principales indicadores
- ✅ Función `top_productos(sucursal_id, fecha_desde, fecha_hasta, limite)` y similares para "top categorías", "top meseros"
- ✅ Reportes de auditoría: descuentos manuales por usuario, cancelaciones por motivo, reimpresiones de comanda
- ✅ Vista `vw_resumen_turno` consolidando turno + cortes + Z

**Lo que NO cubre (intencional):**

- ❌ Reportes externos (Excel, PDF) — esa es capa de aplicación
- ❌ BI avanzado / dashboards visuales — UI en 08-WIREFRAMES
- ❌ Pronóstico de demanda, análisis predictivo — Fase 5
- ❌ Exportes contables a sistemas externos (Contpaqi, Aspel, ContaSat) — Fase 5
- ❌ Reportes a SAT (DIOT, declaraciones) — Fase 5 con módulo fiscal específico
- ❌ Cuentas por cobrar / por pagar — fuera de POS, módulo separado
- ❌ Costos teóricos por receta (food cost analysis) — Fase 3 con módulo de costos
- ❌ Reportes consolidados multi-tenant (para admin de Anthropic… digo, de VIM Marketing) — Fase 2

### 0.3 Dependencias con partes previas

| Referencia | Tipo | Origen |
|---|---|---|
| `turnos`, `cortes_caja`, `movimientos_caja`, `auditoria_eventos` | Lectura | Parte 1A |
| `productos`, `categorias`, `areas_cocina`, `marcas_virtuales` | Lectura | Parte 1B |
| `tickets`, `ticket_items`, `pagos`, `ticket_descuentos_manuales`, `ticket_promociones_aplicadas` | Lectura | Parte 1C.1 |
| `devoluciones`, `cancelaciones_ticket`, `tickets_cfdi`, `delivery_asignaciones`, `apps_liquidacion_items`, `comanda_impresiones`, `sync_conflictos` | Lectura | Parte 1C.2 |
| `mesas`, `tickets_mesas`, `cuentas_abiertas`, `reservaciones`, `propinas_distribucion` | Lectura | Parte 1D |

**Esta parte no agrega FKs nuevas a las tablas previas.** Solo agrega dos tablas (`cortes_caja_detalle` y `reportes_z_historico`) con FKs hacia `turnos` y `cortes_caja`.

### 0.4 Decisiones cerradas

Continuación de D48-D57. Estas decisiones se declaran como acordadas y se materializan en las secciones siguientes.

| # | Decisión | Materialización |
|---|---|---|
| **D58** | Reportes X/Z como funciones que devuelven `jsonb`, no tablas materializadas | §3 y §4 — funciones `reporte_x()` y `reporte_z()` |
| **D59** | Reporte Z se persiste en tabla `reportes_z_historico` para auditoría inmutable | §4.2 — tabla con `payload_completo jsonb` |
| **D60** | Vistas analíticas como `CREATE VIEW` (no materialized) para que siempre estén al día | §7 — todas las `vw_ventas_*` |
| **D61** | Cierre de turno bloquea modificaciones en tickets de ese turno | §4.3 — trigger valida `turnos.estado='CERRADO'` en operaciones |
| **D62** | Cortes de caja extendidos con tabla puente `cortes_caja_detalle` (1:N por método) | §5 — tabla, función `arquear_caja()` |
| **D63** | Cumplimiento de tiempos calculado sobre la marcha (no materializado) | §8 — vistas con `EXTRACT(EPOCH FROM (... - ...))` |
| **D64** | Reporte Z requiere autorización (PIN) y atribución a usuario | §4.4 — función exige `autorizacion_pin_id` |
| **D65** | `kpis_dia_sucursal()` como entrada principal para dashboards | §10.1 — función única que consolida lo más usado |
| **D66** | Histórico de Z se conserva indefinidamente (no se borra ni siquiera por admin) | §11.2 — RLS sin DELETE policy |

### 0.5 Tablas que esta parte añade

| # | Tabla | Propósito |
|---|---|---|
| 1 | `cortes_caja_detalle` | Desglose de un corte por método de pago (1:N) |
| 2 | `reportes_z_historico` | Snapshot inmutable del Z al cerrar turno |

**Total: 2 tablas, 0 enums nuevos, ~12 funciones, ~8 vistas, ~3 triggers.**

> Esta parte tiene **mucha más lectura que escritura**. La mayoría del contenido son vistas y funciones; las dos tablas físicas son evidencia mínima de operaciones de cierre.

---

## 1. Filosofía de los reportes

### 1.1 X vs Z: la distinción clásica

Toda caja registradora seria (y todo POS digital que pretenda ser tomado en serio) distingue dos lecturas:

- **Reporte X (lectura intermedia):** snapshot del estado actual del turno sin cerrarlo. Se imprime cuantas veces se quiera. No bloquea nada. El cajero la usa para revisar "¿voy bien?" a mitad del turno; el supervisor la usa para confirmar antes del cierre.
- **Reporte Z (cierre formal):** una sola vez por turno. **Cierra el turno**, persiste un snapshot inmutable, bloquea modificaciones a tickets del turno, y dispara la distribución de propinas. Después de Z, el turno está fiscalmente cerrado.

En VIM POS, X es una función pura que devuelve jsonb. Z es una función que persiste en `reportes_z_historico` y modifica el estado del turno. Z es **irreversible**: una vez generado, el contenido no se puede modificar.

### 1.2 Reconstruir, no duplicar

Los totales de un Z **se calculan al momento** desde las tablas base (tickets, pagos, devoluciones, etc.) y se persisten en el JSONB del Z. Pero **las tablas base no se modifican**. Los tickets cobrados siguen siendo la fuente de verdad; el Z es una foto consolidada.

Esto permite que, si en el futuro se descubre un bug en el cálculo de IVA, se pueda regenerar reportes históricos desde las tablas base (esto NO se llamaría regenerar el Z fiscal, que es inmutable; sería un "Z corregido" como documento nuevo). El JSONB original queda intacto para auditoría.

### 1.3 Vistas, no tablas materializadas

Todas las vistas de §7 son `CREATE VIEW` simples, **no `MATERIALIZED VIEW`**. Razones:

1. **Volumen MVP:** los tenants piloto tienen <5K tickets/día por sucursal. Las vistas corren en <100ms para un día y <2s para un mes.
2. **Frescura:** un dueño que abre el reporte espera ver lo que pasó hace 30 segundos. Las MVs requieren `REFRESH`, ya sea automático (más infra) o manual (peor UX).
3. **Cuando duela:** si una sucursal grande llega a 50K tickets/día y los reportes empiezan a tardar, se promueve la vista crítica a MATERIALIZED con refresh cada 5 minutos. Esa decisión se toma con datos en mano, no especulativamente.

### 1.4 Cierre de caja vs cierre de turno

Estos son **eventos distintos** que en muchos POS se confunden:

- **Corte de caja:** el cajero contó el efectivo y declaró cuánto tiene. Puede haber 1 o N cortes en un turno (ej. cambio de cajero a mitad del turno = nuevo corte). La tabla `cortes_caja` ya existe en 1A.
- **Cierre de turno:** la sucursal terminó el día (o el bloque operativo). Dispara Z, distribución de propinas, totales consolidados. Es lo que el dueño revisa.

En 1E el corte de caja se **extiende** con `cortes_caja_detalle` (un detalle por método de pago) y el cierre de turno se **completa** con `reporte_z_historico`.

### 1.5 Cumplimiento de tiempos: la métrica oculta

Una cocina puede vender mucho pero estar entregando con 20 min de retraso. Una operación de delivery puede estar perdiendo clientes silenciosamente porque las promesas no se cumplen. Estos **no se ven** en el reporte de ventas pero matan al negocio a mediano plazo.

VIM POS calcula tiempo desde captura de pedido → comanda impresa → marcado LISTO → entregado, y para delivery: desde asignación → salida → entrega → liquidación. Las vistas de §8 exponen estos tiempos por ticket y agregados por día/área/repartidor.

### 1.6 Auditoría operativa

Más allá del aspecto financiero, hay un aspecto **operativo crítico**:

- ¿Quién está aplicando muchos descuentos manuales?
- ¿Quién reimprime comandas más de la media?
- ¿Qué motivo de cancelación se repite?
- ¿Qué meseros generan más NO_SHOWs sin atender bien las reservas?

Estos no son "reportes financieros" pero son **insights de gestión** que VIM POS expone como vistas con índices apropiados. En §7.5 y §10.3.

---

## 2. Convenciones (recap)

Todas las convenciones de Partes 1A-1D siguen vigentes.

**Nuevas convenciones específicas a 1E:**

- **Funciones de reporte devuelven `jsonb`**, no rowsets. La estructura del jsonb se documenta en cada función. La razón: los reportes son consumidos por aplicación (Next.js) que prefiere estructurar UI desde un payload anidado completo. SQL escalable para esto.
- **Vistas con prefijo `vw_`** son lecturas seguras (sin agregar peso a transacciones).
- **Tablas con prefijo `reportes_`** o `cortes_` son almacenamiento histórico inmutable después del cierre.
- **Granularidad temporal estándar:** todas las consultas filtran por `dia_contable` (no por `created_at`). Esto respeta el día contable definido en 1A §8.3 (cierre a las 4 AM, por ejemplo).
- **Métricas monetarias:** todas en `numeric(12,2)` en MXN, ya redondeadas a 2 decimales.
- **Conteos:** `integer` para conteos, `bigint` cuando podría exceder 2.1B (no se espera en MVP).

---

## 3. Reporte X — lectura del turno en vivo

(§28 del `/core` — lectura intermedia sin cerrar.)

### 3.1 Función `reporte_x(turno_id)`

Devuelve un `jsonb` con todo lo que se imprime en el papel térmico de reporte X. No modifica nada.

```sql
CREATE OR REPLACE FUNCTION reporte_x(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_resultado    jsonb;
  v_pagos_metodo jsonb;
  v_tickets      jsonb;
  v_devoluciones jsonb;
  v_movimientos  jsonb;
  v_efectivo_esperado numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe o no pertenece al tenant', p_turno_id;
  END IF;

  -- ===== Pagos por método (suma de tickets PAGADO/FACTURADO del turno) =====
  SELECT jsonb_agg(jsonb_build_object(
    'metodo_pago', metodo_pago,
    'monto_total_mxn', monto_total,
    'cantidad_pagos', cantidad
  ) ORDER BY metodo_pago)
  INTO v_pagos_metodo
  FROM (
    SELECT
      p.metodo_pago,
      SUM(p.monto_mxn) AS monto_total,
      COUNT(*) AS cantidad
    FROM pagos p
    JOIN tickets t ON t.id = p.ticket_id
    WHERE p.turno_id = p_turno_id
      AND p.deleted_at IS NULL
      AND p.estado = 'APLICADO'
      AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
    GROUP BY p.metodo_pago
  ) sub;

  -- ===== Tickets del turno =====
  SELECT jsonb_build_object(
    'total_tickets_abiertos',     COUNT(*) FILTER (WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'total_tickets_pagados',      COUNT(*) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')),
    'total_tickets_cancelados',   COUNT(*) FILTER (WHERE estado_fiscal = 'CANCELADO'),
    'total_tickets_en_espera',    COUNT(*) FILTER (WHERE en_espera = true AND estado_fiscal = 'ABIERTO'),
    'subtotal_neto_mxn',          COALESCE(SUM(subtotal_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'iva_neto_mxn',               COALESCE(SUM(iva_mxn)      FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'total_neto_mxn',             COALESCE(SUM(total_mxn)    FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'descuentos_manuales_mxn',    COALESCE(SUM(descuento_manual_total_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'promociones_mxn',            COALESCE(SUM(promocion_total_mxn)        FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'propina_total_mxn',          COALESCE(SUM(propina_mxn)                FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'ticket_promedio_mxn',        COALESCE(AVG(total_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0)
  ) INTO v_tickets
  FROM tickets
  WHERE turno_id = p_turno_id
    AND deleted_at IS NULL;

  -- ===== Devoluciones del turno =====
  SELECT jsonb_build_object(
    'cantidad',      COUNT(*),
    'total_mxn',     COALESCE(SUM(total_devuelto_mxn), 0),
    'por_motivo',    COALESCE(jsonb_object_agg(motivo, count_motivo), '{}'::jsonb)
  ) INTO v_devoluciones
  FROM (
    SELECT
      motivo,
      total_devuelto_mxn,
      COUNT(*) OVER (PARTITION BY motivo) AS count_motivo
    FROM devoluciones
    WHERE turno_id = p_turno_id
      AND estado = 'CONFIRMADA'
      AND deleted_at IS NULL
  ) sub;

  -- ===== Movimientos de caja (inyecciones, retiros, depósitos, devoluciones efectivo) =====
  SELECT jsonb_agg(jsonb_build_object(
    'tipo', tipo_movimiento,
    'cantidad', cantidad,
    'monto_total_mxn', monto_total
  ))
  INTO v_movimientos
  FROM (
    SELECT
      tipo_movimiento,
      COUNT(*) AS cantidad,
      SUM(monto_mxn) AS monto_total
    FROM movimientos_caja
    WHERE turno_id = p_turno_id
    GROUP BY tipo_movimiento
  ) sub;

  -- ===== Efectivo esperado en caja =====
  SELECT calcular_efectivo_esperado(p_turno_id) INTO v_efectivo_esperado;

  -- ===== Construir respuesta completa =====
  v_resultado := jsonb_build_object(
    'reporte_tipo', 'X',
    'turno_id', v_turno.id,
    'turno_estado', v_turno.estado,
    'sucursal_id', v_turno.sucursal_id,
    'caja_id', v_turno.caja_id,
    'usuario_apertura_id', v_turno.usuario_apertura_id,
    'fecha_apertura', v_turno.fecha_apertura,
    'fondo_apertura_mxn', v_turno.fondo_apertura_mxn,
    'fecha_consulta', now(),

    'tickets', v_tickets,
    'pagos_por_metodo', COALESCE(v_pagos_metodo, '[]'::jsonb),
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI.';
```

### 3.2 Función auxiliar `calcular_efectivo_esperado(turno_id)`

Cuánto efectivo debería tener la caja según movimientos. Útil tanto para X como para Z y arqueo.

```sql
CREATE OR REPLACE FUNCTION calcular_efectivo_esperado(
  p_turno_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_turno         turnos%ROWTYPE;
  v_pagos_efectivo numeric(12,2);
  v_movimientos    numeric(12,2);
  v_devoluciones_efectivo numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Pagos en efectivo (positivos y negativos por devoluciones)
  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_pagos_efectivo
  FROM pagos p
  WHERE p.turno_id = p_turno_id
    AND p.metodo_pago = 'EFECTIVO'
    AND p.estado = 'APLICADO'
    AND p.deleted_at IS NULL;

  -- Movimientos de caja (inyecciones positivas, retiros negativos)
  -- En convención de Parte 1A: INYECCION_FONDO > 0, RETIRO_EFECTIVO < 0,
  -- DEPOSITO_BANCARIO < 0, DEVOLUCION_EFECTIVO se registra como movimiento separado.
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo_movimiento IN ('INYECCION_FONDO', 'AJUSTE_SOBRANTE') THEN monto_mxn
      WHEN tipo_movimiento IN ('RETIRO_EFECTIVO', 'DEPOSITO_BANCARIO',
                                'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR',
                                'AJUSTE_FALTANTE') THEN -monto_mxn
      ELSE 0
    END
  ), 0) INTO v_movimientos
  FROM movimientos_caja
  WHERE turno_id = p_turno_id;

  RETURN v_turno.fondo_apertura_mxn + v_pagos_efectivo + v_movimientos;
END;
$$;

COMMENT ON FUNCTION calcular_efectivo_esperado IS 'Cuánto efectivo debería tener la caja según fondo inicial + pagos en efectivo (con devoluciones netas) + movimientos.';
```

---

## 4. Reporte Z — cierre formal persistido

(§29 del `/core` — cierre fiscal del turno, irrevocable.)

### 4.1 Tabla `reportes_z_historico`

```sql
CREATE TABLE reportes_z_historico (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- ===== Folio del Z (consecutivo por sucursal) =====
  folio_z             varchar(50) NOT NULL,
  folio_z_consecutivo bigint NOT NULL,

  -- ===== Día contable del turno =====
  dia_contable        date NOT NULL,

  -- ===== Snapshot completo =====
  payload_completo    jsonb NOT NULL,
  -- Estructura idéntica al output de reporte_x() con campos adicionales:
  -- - cerrado_por_usuario_id
  -- - autorizacion_pin_id
  -- - efectivo_declarado_mxn
  -- - diferencia_efectivo_mxn
  -- - propinas_distribuidas_calculadas (resultado de calcular_distribucion_propinas)

  -- ===== Totales destacados (extraídos del payload para queries rápidas) =====
  total_ventas_mxn        numeric(12,2) NOT NULL,
  total_iva_mxn           numeric(12,2) NOT NULL DEFAULT 0,
  total_propinas_mxn      numeric(12,2) NOT NULL DEFAULT 0,
  total_devoluciones_mxn  numeric(12,2) NOT NULL DEFAULT 0,
  total_cancelaciones_mxn numeric(12,2) NOT NULL DEFAULT 0,
  total_tickets           integer NOT NULL DEFAULT 0,

  -- Efectivo
  efectivo_esperado_mxn   numeric(12,2) NOT NULL DEFAULT 0,
  efectivo_declarado_mxn  numeric(12,2) NULL,
  diferencia_efectivo_mxn numeric(12,2) NULL,

  -- ===== Atribución =====
  cerrado_por_usuario_id uuid NOT NULL REFERENCES auth.users(id),
  autorizacion_pin_id    uuid NULL REFERENCES autorizaciones_pin(id),
  fecha_cierre           timestamptz NOT NULL DEFAULT now(),

  -- ===== Notas =====
  nota                text NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),

  CONSTRAINT folio_z_unico UNIQUE (sucursal_id, folio_z),
  CONSTRAINT z_unico_por_turno UNIQUE (turno_id)
);

CREATE INDEX idx_reportes_z_sucursal_dia ON reportes_z_historico(sucursal_id, dia_contable DESC);
CREATE INDEX idx_reportes_z_turno ON reportes_z_historico(turno_id);
CREATE INDEX idx_reportes_z_usuario ON reportes_z_historico(cerrado_por_usuario_id, fecha_cierre DESC);
CREATE INDEX idx_reportes_z_diferencia ON reportes_z_historico(sucursal_id, fecha_cierre DESC)
  WHERE diferencia_efectivo_mxn IS NOT NULL AND diferencia_efectivo_mxn <> 0;

COMMENT ON TABLE reportes_z_historico IS 'Snapshots inmutables del Reporte Z al cerrar turno (D59). Un Z por turno (constraint UNIQUE).';
COMMENT ON COLUMN reportes_z_historico.payload_completo IS 'JSON completo del Z al momento del cierre. Inmutable. Permite reconstruir el reporte si las tablas base cambian estructura.';
```

### 4.2 Triggers en `reportes_z_historico`

```sql
-- 4.2.1 Folio Z al INSERT
CREATE OR REPLACE FUNCTION trg_reporte_z_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.folio_z IS NULL THEN
    SELECT folio_completo, consecutivo INTO v_folio_row
    FROM generar_folio(NEW.sucursal_id, 'REPORTE_Z', NULL);
    NEW.folio_z := v_folio_row.folio_completo;
    NEW.folio_z_consecutivo := v_folio_row.consecutivo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reportes_z_folio
  BEFORE INSERT ON reportes_z_historico
  FOR EACH ROW EXECUTE FUNCTION trg_reporte_z_folio();

-- 4.2.2 Proteger inmutabilidad TOTAL (D66 — el Z una vez generado, no cambia)
CREATE OR REPLACE FUNCTION trg_reporte_z_inmutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Solo se permite UPDATE de la columna `nota` (para agregar observaciones post-hoc)
    IF OLD.payload_completo IS DISTINCT FROM NEW.payload_completo
       OR OLD.total_ventas_mxn <> NEW.total_ventas_mxn
       OR OLD.efectivo_declarado_mxn IS DISTINCT FROM NEW.efectivo_declarado_mxn
       OR OLD.folio_z <> NEW.folio_z
       OR OLD.dia_contable <> NEW.dia_contable THEN
      RAISE EXCEPTION 'Reporte Z es inmutable. Solo el campo nota se puede actualizar.';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Reporte Z no se puede eliminar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reportes_z_inmutable
  BEFORE UPDATE OR DELETE ON reportes_z_historico
  FOR EACH ROW EXECUTE FUNCTION trg_reporte_z_inmutable();

-- 4.2.3 Audit del cierre
CREATE OR REPLACE FUNCTION trg_reporte_z_audit() RETURNS trigger
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
      NEW.cerrado_por_usuario_id, 'CIERRES', 'reporte_z.generado',
      'reporte_z', NEW.id,
      jsonb_build_object(
        'folio_z', NEW.folio_z,
        'total_ventas_mxn', NEW.total_ventas_mxn,
        'total_tickets', NEW.total_tickets,
        'diferencia_efectivo_mxn', NEW.diferencia_efectivo_mxn,
        'autorizacion_pin_id', NEW.autorizacion_pin_id
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reportes_z_audit
  AFTER INSERT ON reportes_z_historico
  FOR EACH ROW EXECUTE FUNCTION trg_reporte_z_audit();
```

### 4.3 Función `reporte_z(turno_id, ...)` — cerrar turno con Z

Esta es la función principal. Es **idempotente con bloqueo**: si el turno ya tiene Z, devuelve el Z existente; si no lo tiene, genera uno nuevo y cierra el turno.

```sql
CREATE OR REPLACE FUNCTION reporte_z(
  p_turno_id                uuid,
  p_efectivo_declarado_mxn  numeric,
  p_autorizacion_pin_id     uuid,
  p_cerrado_por_usuario_id  uuid,
  p_nota                    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id          uuid := current_tenant_id();
  v_turno              turnos%ROWTYPE;
  v_existing_z         reportes_z_historico%ROWTYPE;
  v_payload            jsonb;
  v_efectivo_esperado  numeric(12,2);
  v_diferencia         numeric(12,2);
  v_z_id               uuid;
  v_dist_propinas      jsonb;
BEGIN
  -- ===== Validaciones =====
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe', p_turno_id;
  END IF;

  -- Idempotencia: si ya hay Z, devolverlo
  SELECT * INTO v_existing_z FROM reportes_z_historico WHERE turno_id = p_turno_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'estado', 'YA_EXISTE',
      'reporte_z_id', v_existing_z.id,
      'folio_z', v_existing_z.folio_z,
      'mensaje', 'Este turno ya tiene Reporte Z. Es inmutable.',
      'payload', v_existing_z.payload_completo
    );
  END IF;

  -- Validar que el turno esté ABIERTO o EN_CIERRE
  IF v_turno.estado = 'CERRADO' THEN
    RAISE EXCEPTION 'Turno ya está CERRADO pero no tiene Z. Estado inconsistente; contacta soporte.';
  END IF;

  -- Validar PIN obligatorio (D64)
  IF p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Reporte Z requiere autorización (autorizacion_pin_id no puede ser NULL)';
  END IF;

  -- ===== Generar payload =====
  v_payload := reporte_x(p_turno_id);

  -- Calcular efectivo esperado y diferencia
  v_efectivo_esperado := (v_payload->>'efectivo_esperado_mxn')::numeric;
  v_diferencia := p_efectivo_declarado_mxn - v_efectivo_esperado;

  -- Agregar campos de cierre al payload
  v_payload := v_payload
    || jsonb_build_object(
      'reporte_tipo', 'Z',
      'cerrado_por_usuario_id', p_cerrado_por_usuario_id,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'efectivo_declarado_mxn', p_efectivo_declarado_mxn,
      'diferencia_efectivo_mxn', v_diferencia,
      'fecha_cierre', now(),
      'nota', p_nota
    );

  -- ===== Cerrar turno (esto dispara cálculo de propinas vía trigger en 1D) =====
  UPDATE turnos
  SET estado     = 'CERRADO',
      fecha_cierre = now(),
      usuario_cierre_id = p_cerrado_por_usuario_id,
      updated_by = p_cerrado_por_usuario_id
  WHERE id = p_turno_id;

  -- Capturar distribuciones de propinas calculadas para incluir en payload
  SELECT jsonb_agg(jsonb_build_object(
    'usuario_id', usuario_id,
    'metodo_reparto', metodo_reparto_usado,
    'monto_mxn', monto_asignado_mxn
  )) INTO v_dist_propinas
  FROM propinas_distribucion
  WHERE turno_id = p_turno_id;

  v_payload := v_payload || jsonb_build_object(
    'propinas_distribuidas', COALESCE(v_dist_propinas, '[]'::jsonb)
  );

  -- ===== Insertar el Z =====
  INSERT INTO reportes_z_historico (
    tenant_id, sucursal_id, caja_id, turno_id,
    dia_contable, payload_completo,
    total_ventas_mxn, total_iva_mxn, total_propinas_mxn,
    total_devoluciones_mxn, total_tickets,
    efectivo_esperado_mxn, efectivo_declarado_mxn, diferencia_efectivo_mxn,
    cerrado_por_usuario_id, autorizacion_pin_id, nota, created_by
  ) VALUES (
    v_tenant_id, v_turno.sucursal_id, v_turno.caja_id, p_turno_id,
    v_turno.dia_contable, v_payload,
    (v_payload->'tickets'->>'total_neto_mxn')::numeric,
    (v_payload->'tickets'->>'iva_neto_mxn')::numeric,
    (v_payload->'tickets'->>'propina_total_mxn')::numeric,
    (v_payload->'devoluciones'->>'total_mxn')::numeric,
    (v_payload->'tickets'->>'total_tickets_pagados')::integer,
    v_efectivo_esperado, p_efectivo_declarado_mxn, v_diferencia,
    p_cerrado_por_usuario_id, p_autorizacion_pin_id, p_nota, p_cerrado_por_usuario_id
  ) RETURNING id INTO v_z_id;

  RETURN jsonb_build_object(
    'estado', 'GENERADO',
    'reporte_z_id', v_z_id,
    'turno_id', p_turno_id,
    'payload', v_payload
  );
END;
$$;

COMMENT ON FUNCTION reporte_z IS 'Cierra turno con Z. Idempotente (devuelve Z existente si hay uno). Inmutable post-creación.';
```

### 4.3.bis Guardarraíl de escalabilidad del payload Z

> **D131 — El `payload_completo` del Z es siempre AGREGADO y acotado; nunca embebe detalle por ticket.**

Por diseño, `reporte_z()` (vía `reporte_x()`) solo guarda **agregados**: pagos por método, conteos y sumas de tickets, devoluciones por motivo, movimientos por tipo, distribución de propinas por usuario. El tamaño del payload es **O(1) respecto al número de tickets**: un turno con 5,000 tickets produce un Z del mismo tamaño que uno con 50. Por eso **no requiere paginación**.

**Regla para mantenedores:** está **prohibido** embeber arreglos por ticket, por ítem o por producto dentro del `payload_completo`. Esos detalles se sirven **bajo demanda y paginados** desde las vistas analíticas (§7: `vw_ventas_por_producto`, `vw_ventas_por_mesero`, etc.) o consultando `tickets`/`ticket_items` directamente con `LIMIT/OFFSET` o keyset, **nunca** dentro del Z. Esto mantiene el Z liviano, rápido de generar e imprimir, y barato de almacenar de forma inmutable por años (retención fiscal, doc 15 §C.3).

- **Top-N por producto/mesero** para la representación impresa del Z: se calcula con `ORDER BY ... LIMIT N` sobre las vistas al momento de imprimir, no se persiste en el snapshot.
- **Detalle completo del turno** en la UI de admin: consulta paginada a las vistas/tablas, filtrada por `turno_id`.

### 4.4 Función `obtener_reporte_z(turno_id)` — solo lectura

Para consultar un Z ya generado.

```sql
CREATE OR REPLACE FUNCTION obtener_reporte_z(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_z reportes_z_historico%ROWTYPE;
BEGIN
  SELECT * INTO v_z FROM reportes_z_historico
  WHERE turno_id = p_turno_id
    AND tenant_id = current_tenant_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NO_EXISTE', 'mensaje', 'Este turno no tiene Z generado');
  END IF;

  RETURN v_z.payload_completo;
END;
$$;
```

---

## 5. Cortes de caja extendidos

(§30 del `/core` — desglose del corte por método de pago.)

`cortes_caja` ya existe en Parte 1A con totales generales. Aquí se agrega el detalle.

### 5.1 Tabla `cortes_caja_detalle`

```sql
CREATE TABLE cortes_caja_detalle (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  corte_caja_id       uuid NOT NULL REFERENCES cortes_caja(id) ON DELETE CASCADE,

  -- ===== Detalle por método de pago =====
  metodo_pago         metodo_pago NOT NULL,                   -- enum de 1C.1
  monto_esperado_mxn  numeric(12,2) NOT NULL CHECK (monto_esperado_mxn >= 0),
  monto_declarado_mxn numeric(12,2) NOT NULL CHECK (monto_declarado_mxn >= 0),
  diferencia_mxn      numeric(12,2) NOT NULL,                 -- declarado - esperado (positivo=sobrante, negativo=faltante)

  cantidad_transacciones integer NOT NULL DEFAULT 0,

  -- ===== Notas específicas =====
  nota                text NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),

  CONSTRAINT corte_metodo_unico UNIQUE (corte_caja_id, metodo_pago)
);

CREATE INDEX idx_cortes_detalle_corte ON cortes_caja_detalle(corte_caja_id);
CREATE INDEX idx_cortes_detalle_diferencias ON cortes_caja_detalle(tenant_id, created_at DESC)
  WHERE diferencia_mxn <> 0;

COMMENT ON TABLE cortes_caja_detalle IS 'Desglose de un corte por método de pago. Permite detectar diferencias específicas.';
```

### 5.2 Función `arquear_caja(turno_id, declaraciones jsonb, ...)` — generar corte con detalle

El cajero declara cuánto tiene de cada método (efectivo, tarjeta, transferencia, etc.) y la función calcula automáticamente las diferencias.

```sql
CREATE OR REPLACE FUNCTION arquear_caja(
  p_turno_id                uuid,
  p_declaraciones           jsonb,            -- [{metodo_pago, monto_declarado_mxn, nota}]
  p_motivo_corte            text,             -- 'CIERRE_TURNO', 'CAMBIO_CAJERO', 'ARQUEO_INTERMEDIO'
  p_usuario_id              uuid,
  p_autorizacion_pin_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_corte_id     uuid;
  v_decl         jsonb;
  v_metodo       metodo_pago;
  v_declarado    numeric(12,2);
  v_esperado     numeric(12,2);
  v_total_esperado numeric(12,2) := 0;
  v_total_declarado numeric(12,2) := 0;
  v_resultados   jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe', p_turno_id;
  END IF;

  -- Crear corte de caja (cabecera)
  INSERT INTO cortes_caja (
    tenant_id, sucursal_id, caja_id, turno_id,
    motivo, usuario_id, autorizacion_pin_id,
    created_by
  ) VALUES (
    v_tenant_id, v_turno.sucursal_id, v_turno.caja_id, p_turno_id,
    p_motivo_corte, p_usuario_id, p_autorizacion_pin_id,
    p_usuario_id
  ) RETURNING id INTO v_corte_id;

  -- Procesar cada declaración
  FOR v_decl IN SELECT * FROM jsonb_array_elements(p_declaraciones)
  LOOP
    v_metodo := (v_decl->>'metodo_pago')::metodo_pago;
    v_declarado := (v_decl->>'monto_declarado_mxn')::numeric;

    -- Calcular esperado según el método
    IF v_metodo = 'EFECTIVO' THEN
      v_esperado := calcular_efectivo_esperado(p_turno_id);
    ELSE
      -- Para no-efectivo: simplemente suma de pagos del turno con ese método
      SELECT COALESCE(SUM(monto_mxn), 0) INTO v_esperado
      FROM pagos
      WHERE turno_id = p_turno_id
        AND metodo_pago = v_metodo
        AND estado = 'APLICADO'
        AND deleted_at IS NULL;
    END IF;

    INSERT INTO cortes_caja_detalle (
      tenant_id, corte_caja_id,
      metodo_pago, monto_esperado_mxn, monto_declarado_mxn,
      diferencia_mxn, cantidad_transacciones, nota, created_by
    ) VALUES (
      v_tenant_id, v_corte_id,
      v_metodo, v_esperado, v_declarado,
      v_declarado - v_esperado,
      (SELECT COUNT(*) FROM pagos
       WHERE turno_id = p_turno_id AND metodo_pago = v_metodo
       AND estado = 'APLICADO' AND deleted_at IS NULL),
      v_decl->>'nota', p_usuario_id
    );

    v_total_esperado := v_total_esperado + v_esperado;
    v_total_declarado := v_total_declarado + v_declarado;

    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'metodo_pago', v_metodo,
      'esperado', v_esperado,
      'declarado', v_declarado,
      'diferencia', v_declarado - v_esperado
    ));
  END LOOP;

  -- Actualizar la cabecera del corte con totales
  UPDATE cortes_caja
  SET total_esperado_mxn = v_total_esperado,
      total_declarado_mxn = v_total_declarado,
      diferencia_mxn = v_total_declarado - v_total_esperado,
      updated_by = p_usuario_id
  WHERE id = v_corte_id;

  RETURN jsonb_build_object(
    'corte_caja_id', v_corte_id,
    'total_esperado_mxn', v_total_esperado,
    'total_declarado_mxn', v_total_declarado,
    'diferencia_total_mxn', v_total_declarado - v_total_esperado,
    'detalle', v_resultados
  );
END;
$$;

COMMENT ON FUNCTION arquear_caja IS 'Genera corte de caja con detalle por método. Calcula esperados desde pagos del turno y diferencias contra lo declarado.';
```

### 5.3 Vista `vw_resumen_corte_caja`

```sql
CREATE OR REPLACE VIEW vw_resumen_corte_caja AS
SELECT
  c.id                AS corte_id,
  c.tenant_id,
  c.sucursal_id,
  c.caja_id,
  c.turno_id,
  c.motivo            AS motivo_corte,
  c.fecha_corte,
  c.total_esperado_mxn,
  c.total_declarado_mxn,
  c.diferencia_mxn    AS diferencia_total_mxn,

  -- Desglose por método (agregado en jsonb)
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'metodo_pago', d.metodo_pago,
      'esperado_mxn', d.monto_esperado_mxn,
      'declarado_mxn', d.monto_declarado_mxn,
      'diferencia_mxn', d.diferencia_mxn,
      'transacciones', d.cantidad_transacciones
    ) ORDER BY d.metodo_pago)
    FROM cortes_caja_detalle d WHERE d.corte_caja_id = c.id),
    '[]'::jsonb
  ) AS desglose_metodos,

  c.usuario_id        AS cajero_id,
  u.email             AS cajero_email
FROM cortes_caja c
LEFT JOIN auth.users u ON u.id = c.usuario_id;

COMMENT ON VIEW vw_resumen_corte_caja IS 'Vista consolidada de un corte con su desglose por método en formato JSON.';
```

---

## 6. Estado de resultados consolidado

### 6.1 Vista `vw_estado_resultados_dia`

Una fila por sucursal-día con todos los KPIs principales. Esta es la vista que el dueño consulta primero.

```sql
CREATE OR REPLACE VIEW vw_estado_resultados_dia AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,

  -- ===== Tickets =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))    AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')                 AS tickets_cancelados,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('BORRADOR', 'ABIERTO'))    AS tickets_pendientes,

  -- ===== Ingresos brutos =====
  COALESCE(SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS subtotal_neto_mxn,
  COALESCE(SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS iva_neto_mxn,
  COALESCE(SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS total_neto_mxn,

  -- ===== Descuentos y promociones =====
  COALESCE(SUM(t.descuento_manual_total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS descuentos_manuales_mxn,
  COALESCE(SUM(t.promocion_total_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS promociones_mxn,

  -- ===== Propinas =====
  COALESCE(SUM(t.propina_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS propinas_capturadas_mxn,

  -- ===== Devoluciones (subquery) =====
  COALESCE((SELECT SUM(d.total_devuelto_mxn) FROM devoluciones d
            WHERE d.sucursal_id = t.sucursal_id AND d.dia_contable = t.dia_contable
            AND d.estado = 'CONFIRMADA' AND d.deleted_at IS NULL), 0) AS devoluciones_mxn,

  -- ===== Cancelaciones de tickets pagados (subquery) =====
  COALESCE((SELECT SUM(c.ticket_total_snapshot) FROM cancelaciones_ticket c
            WHERE c.sucursal_id = t.sucursal_id AND c.dia_contable = t.dia_contable
            AND c.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')), 0) AS cancelaciones_post_pago_mxn,

  -- ===== Comisiones de apps externas (estimación basada en liquidaciones disponibles) =====
  COALESCE((SELECT SUM(ali.monto_comision_mxn) FROM apps_liquidacion_items ali
            JOIN tickets t2 ON t2.id = ali.ticket_id_match
            WHERE t2.sucursal_id = t.sucursal_id AND t2.dia_contable = t.dia_contable), 0) AS comisiones_apps_mxn,

  -- ===== Tickets por modo de servicio =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'PARA_LLEVAR')          AS tickets_para_llevar,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'COMER_AQUI')           AS tickets_comer_aqui,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'DELIVERY_PROPIO')      AS tickets_delivery_propio,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio LIKE 'APP_%')             AS tickets_apps,

  -- ===== Ticket promedio =====
  COALESCE(AVG(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS ticket_promedio_mxn

FROM tickets t
WHERE t.deleted_at IS NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable;

COMMENT ON VIEW vw_estado_resultados_dia IS 'Estado de resultados por sucursal-día. KPIs principales para dashboard del dueño.';
```

### 6.2 Vista `vw_estado_resultados_periodo` (helper)

Para reportes de semana/mes, la app puede consultar `vw_estado_resultados_dia` filtrando por rango. Para conveniencia exponemos una función:

```sql
CREATE OR REPLACE FUNCTION estado_resultados_periodo(
  p_sucursal_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'sucursal_id', p_sucursal_id,
    'periodo', jsonb_build_object('desde', p_fecha_desde, 'hasta', p_fecha_hasta),
    'dias_con_actividad', COUNT(*),
    'tickets_completados', SUM(tickets_completados),
    'tickets_cancelados', SUM(tickets_cancelados),
    'subtotal_neto_mxn', SUM(subtotal_neto_mxn),
    'iva_neto_mxn', SUM(iva_neto_mxn),
    'total_neto_mxn', SUM(total_neto_mxn),
    'descuentos_manuales_mxn', SUM(descuentos_manuales_mxn),
    'promociones_mxn', SUM(promociones_mxn),
    'propinas_capturadas_mxn', SUM(propinas_capturadas_mxn),
    'devoluciones_mxn', SUM(devoluciones_mxn),
    'cancelaciones_post_pago_mxn', SUM(cancelaciones_post_pago_mxn),
    'comisiones_apps_mxn', SUM(comisiones_apps_mxn),
    'tickets_por_modo', jsonb_build_object(
      'para_llevar', SUM(tickets_para_llevar),
      'comer_aqui', SUM(tickets_comer_aqui),
      'delivery_propio', SUM(tickets_delivery_propio),
      'apps', SUM(tickets_apps)
    ),
    'ticket_promedio_mxn', AVG(ticket_promedio_mxn)
  ) INTO v_resultado
  FROM vw_estado_resultados_dia
  WHERE sucursal_id = p_sucursal_id
    AND dia_contable BETWEEN p_fecha_desde AND p_fecha_hasta;

  RETURN COALESCE(v_resultado, jsonb_build_object('error', 'Sin actividad en el periodo'));
END;
$$;

COMMENT ON FUNCTION estado_resultados_periodo IS 'Estado de resultados consolidado para un rango de fechas en una sucursal.';
```

---

## 7. Ventas por dimensión (vistas analíticas)

### 7.1 Por categoría

```sql
CREATE OR REPLACE VIEW vw_ventas_por_categoria AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.categoria_nombre_snapshot AS categoria,
  COUNT(DISTINCT t.id)         AS tickets_con_categoria,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(ti.subtotal_linea_mxn)   AS subtotal_mxn,
  SUM(ti.iva_linea_mxn)        AS iva_mxn,
  SUM(ti.total_linea_mxn)      AS total_mxn,
  AVG(ti.precio_unitario_snapshot) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.categoria_nombre_snapshot IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.categoria_nombre_snapshot;

COMMENT ON VIEW vw_ventas_por_categoria IS 'Ventas por categoría/día. Usa snapshot del item, no la categoría actual (que pudo haberse renombrado).';
```

### 7.2 Por producto

```sql
CREATE OR REPLACE VIEW vw_ventas_por_producto AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.producto_id,
  ti.producto_nombre_snapshot  AS producto_nombre,
  ti.producto_sku_snapshot     AS producto_sku,
  COUNT(DISTINCT t.id)         AS tickets_con_producto,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(ti.subtotal_linea_mxn)   AS subtotal_mxn,
  SUM(ti.iva_linea_mxn)        AS iva_mxn,
  SUM(ti.total_linea_mxn)      AS total_mxn,
  AVG(ti.precio_unitario_snapshot) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         ti.producto_id, ti.producto_nombre_snapshot, ti.producto_sku_snapshot;

COMMENT ON VIEW vw_ventas_por_producto IS 'Ventas por producto/día. Top N se calcula con LIMIT + ORDER BY en consulta.';
```

### 7.3 Por área de cocina

```sql
CREATE OR REPLACE VIEW vw_ventas_por_area_cocina AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.area_cocina_nombre_snapshot AS area_cocina,
  COUNT(DISTINCT t.id)           AS tickets_con_area,
  SUM(ti.cantidad)               AS unidades_preparadas,
  SUM(ti.total_linea_mxn)        AS total_vendido_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.area_cocina_nombre_snapshot IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.area_cocina_nombre_snapshot;

COMMENT ON VIEW vw_ventas_por_area_cocina IS 'Ventas por área (Plancha, Fría, Bebidas, Postres) para calibrar carga.';
```

### 7.4 Por mesero

```sql
CREATE OR REPLACE VIEW vw_ventas_por_mesero AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.mesero_id,
  u.email                      AS mesero_email,
  COUNT(*)                     AS tickets_atendidos,
  SUM(t.total_mxn)             AS total_vendido_mxn,
  SUM(t.propina_mxn)           AS propinas_capturadas_mxn,
  AVG(t.total_mxn)             AS ticket_promedio_mxn,
  AVG(t.propina_mxn / NULLIF(t.total_mxn, 0) * 100) AS propina_pct_promedio
FROM tickets t
LEFT JOIN auth.users u ON u.id = t.mesero_id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND t.mesero_id IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, t.mesero_id, u.email;

COMMENT ON VIEW vw_ventas_por_mesero IS 'Performance por mesero: tickets atendidos, total vendido, propinas capturadas, propina% promedio.';
```

### 7.5 Por modo de servicio

```sql
CREATE OR REPLACE VIEW vw_ventas_por_modo_servicio AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.modo_servicio,
  COUNT(*)                     AS tickets,
  SUM(t.total_mxn)             AS total_mxn,
  AVG(t.total_mxn)             AS ticket_promedio_mxn,

  -- Aplicable solo a apps:
  COALESCE(SUM(ali.monto_comision_mxn), 0) AS comisiones_apps_mxn
FROM tickets t
LEFT JOIN apps_liquidacion_items ali ON ali.ticket_id_match = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, t.modo_servicio;
```

### 7.6 Por marca virtual (DK)

Esta vista ya existe en 1D §5.2 como `vw_ventas_por_marca`. Aquí solo se referencia.

### 7.7 Descuentos manuales por usuario (auditoría operativa)

```sql
CREATE OR REPLACE VIEW vw_descuentos_por_usuario AS
SELECT
  d.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  d.usuario_solicitante_id     AS usuario_id,
  u.email                      AS usuario_email,
  COUNT(*)                     AS cantidad_descuentos,
  SUM(d.monto_descuento_mxn)   AS total_descontado_mxn,
  AVG(d.monto_descuento_mxn)   AS descuento_promedio_mxn,

  -- Por motivo
  COUNT(*) FILTER (WHERE d.motivo = 'CORTESIA')        AS cortesia_count,
  COUNT(*) FILTER (WHERE d.motivo = 'PRODUCTO_DEFECTUOSO') AS defecto_count,
  COUNT(*) FILTER (WHERE d.motivo = 'CLIENTE_VIP')     AS vip_count,
  COUNT(*) FILTER (WHERE d.motivo = 'AJUSTE_ERROR')    AS ajuste_count,
  COUNT(*) FILTER (WHERE d.motivo = 'OTRO')            AS otro_count

FROM ticket_descuentos_manuales d
JOIN tickets t ON t.id = d.ticket_id
LEFT JOIN auth.users u ON u.id = d.usuario_solicitante_id
WHERE d.reversado = false
GROUP BY d.tenant_id, t.sucursal_id, t.dia_contable,
         d.usuario_solicitante_id, u.email;

COMMENT ON VIEW vw_descuentos_por_usuario IS 'Auditoría: quién está aplicando descuentos, con qué motivo. Para detectar abusos.';
```

### 7.8 Reimpresiones de comanda por cajero

```sql
CREATE OR REPLACE VIEW vw_reimpresiones_por_cajero AS
SELECT
  ci.tenant_id,
  ci.sucursal_id,
  date_trunc('day', ci.fecha_impresion)::date AS dia,
  ci.usuario_id                AS cajero_id,
  u.email                      AS cajero_email,
  COUNT(*)                     AS reimpresiones_count,
  COUNT(DISTINCT ci.ticket_id) AS tickets_distintos
FROM comanda_impresiones ci
LEFT JOIN auth.users u ON u.id = ci.usuario_id
WHERE ci.evento_tipo = 'REIMPRESION_CAJERO'
  AND ci.resultado = 'OK'
GROUP BY ci.tenant_id, ci.sucursal_id, date_trunc('day', ci.fecha_impresion),
         ci.usuario_id, u.email;

COMMENT ON VIEW vw_reimpresiones_por_cajero IS 'Auditoría anti-fraude: cajeros que reimprimen comandas con frecuencia. Posible salida de producto sin cobrar.';
```

---

## 8. Cumplimiento de tiempos

(§31 del `/core` — métricas operativas críticas: cocina y delivery.)

### 8.1 Vista `vw_cumplimiento_tiempos_cocina`

Para cada ticket completado: tiempo desde envío a cocina hasta LISTO, y desde LISTO hasta ENTREGADO.

```sql
CREATE OR REPLACE VIEW vw_cumplimiento_tiempos_cocina AS
SELECT
  t.id                          AS ticket_id,
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.folio_completo,
  t.modo_servicio,
  t.fecha_envio_cocina,
  t.fecha_listo,
  t.fecha_entrega,

  -- Tiempos en minutos
  CASE
    WHEN t.fecha_envio_cocina IS NOT NULL AND t.fecha_listo IS NOT NULL THEN
      EXTRACT(EPOCH FROM (t.fecha_listo - t.fecha_envio_cocina))::integer / 60
    ELSE NULL
  END AS minutos_cocina,

  CASE
    WHEN t.fecha_listo IS NOT NULL AND t.fecha_entrega IS NOT NULL THEN
      EXTRACT(EPOCH FROM (t.fecha_entrega - t.fecha_listo))::integer / 60
    ELSE NULL
  END AS minutos_listo_a_entrega,

  CASE
    WHEN t.fecha_envio_cocina IS NOT NULL AND t.fecha_entrega IS NOT NULL THEN
      EXTRACT(EPOCH FROM (t.fecha_entrega - t.fecha_envio_cocina))::integer / 60
    ELSE NULL
  END AS minutos_total

FROM tickets t
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND t.estado_cocina IN ('LISTO', 'ENTREGADO', 'ENTREGADO_DOMICILIO');

COMMENT ON VIEW vw_cumplimiento_tiempos_cocina IS 'Tiempos por ticket: envio→listo, listo→entrega, total. Base para agregados por área/día.';
```

### 8.2 Vista `vw_cumplimiento_tiempos_cocina_agregado`

```sql
CREATE OR REPLACE VIEW vw_cumplimiento_tiempos_cocina_agregado AS
SELECT
  tenant_id,
  sucursal_id,
  dia_contable,
  modo_servicio,

  COUNT(*)                                    AS tickets_total,
  COUNT(minutos_cocina) FILTER (WHERE minutos_cocina <= 15)        AS tickets_cocina_bajo_15min,
  COUNT(minutos_cocina) FILTER (WHERE minutos_cocina BETWEEN 16 AND 30) AS tickets_cocina_16_30min,
  COUNT(minutos_cocina) FILTER (WHERE minutos_cocina > 30)         AS tickets_cocina_mayor_30min,

  ROUND(AVG(minutos_cocina), 1)               AS minutos_cocina_promedio,
  ROUND(percentile_disc(0.5) WITHIN GROUP (ORDER BY minutos_cocina), 1) AS minutos_cocina_mediana,
  ROUND(percentile_disc(0.95) WITHIN GROUP (ORDER BY minutos_cocina), 1) AS minutos_cocina_p95,
  MAX(minutos_cocina)                          AS minutos_cocina_max

FROM vw_cumplimiento_tiempos_cocina
WHERE minutos_cocina IS NOT NULL
GROUP BY tenant_id, sucursal_id, dia_contable, modo_servicio;

COMMENT ON VIEW vw_cumplimiento_tiempos_cocina_agregado IS 'Distribución de tiempos de cocina por sucursal-día-modo. p95 = el 95% se preparó en menos de X minutos.';
```

### 8.3 Vista `vw_cumplimiento_tiempos_delivery`

Específica para delivery propio.

```sql
CREATE OR REPLACE VIEW vw_cumplimiento_tiempos_delivery AS
SELECT
  da.id                         AS delivery_id,
  da.tenant_id,
  da.sucursal_id,
  t.dia_contable,
  da.ticket_id,
  t.folio_completo,
  da.repartidor_id,
  u.email                       AS repartidor_email,

  -- Tiempos individuales
  da.tiempo_promesa_minutos,
  da.tiempo_real_minutos,

  -- Cumplimiento de promesa
  CASE
    WHEN da.tiempo_promesa_minutos IS NULL THEN NULL
    WHEN da.tiempo_real_minutos IS NULL THEN NULL
    WHEN da.tiempo_real_minutos <= da.tiempo_promesa_minutos THEN 'CUMPLIDO'
    WHEN da.tiempo_real_minutos <= da.tiempo_promesa_minutos * 1.2 THEN 'TARDE_LIGERO'    -- 20% más
    ELSE 'TARDE_GRAVE'
  END AS cumplimiento_promesa,

  da.estado                     AS delivery_estado_final,
  da.diferencia_mxn             AS diferencia_liquidacion_mxn

FROM delivery_asignaciones da
JOIN tickets t ON t.id = da.ticket_id
LEFT JOIN auth.users u ON u.id = da.repartidor_id
WHERE da.estado IN ('ENTREGADO', 'NO_ENTREGADO', 'LIQUIDADO')
  AND t.deleted_at IS NULL;

COMMENT ON VIEW vw_cumplimiento_tiempos_delivery IS 'Cumplimiento de tiempos por delivery individual. Para análisis por repartidor.';
```

### 8.4 Vista `vw_cumplimiento_delivery_agregado`

```sql
CREATE OR REPLACE VIEW vw_cumplimiento_delivery_agregado AS
SELECT
  tenant_id,
  sucursal_id,
  dia_contable,

  COUNT(*)                                                AS deliveries_total,
  COUNT(*) FILTER (WHERE cumplimiento_promesa = 'CUMPLIDO')          AS cumplidos,
  COUNT(*) FILTER (WHERE cumplimiento_promesa = 'TARDE_LIGERO')      AS tarde_ligero,
  COUNT(*) FILTER (WHERE cumplimiento_promesa = 'TARDE_GRAVE')       AS tarde_grave,
  COUNT(*) FILTER (WHERE delivery_estado_final = 'NO_ENTREGADO')     AS no_entregados,

  ROUND(AVG(tiempo_real_minutos), 1)                      AS tiempo_real_promedio_min,
  ROUND(AVG(tiempo_promesa_minutos), 1)                   AS tiempo_promesa_promedio_min,

  -- Cuántos delivery vinieron con diferencia financiera
  COUNT(*) FILTER (WHERE diferencia_liquidacion_mxn <> 0) AS deliveries_con_diferencia,
  COALESCE(SUM(diferencia_liquidacion_mxn), 0)            AS diferencia_total_mxn

FROM vw_cumplimiento_tiempos_delivery
GROUP BY tenant_id, sucursal_id, dia_contable;
```

### 8.5 Vista `vw_no_shows_reservaciones`

```sql
CREATE OR REPLACE VIEW vw_no_shows_reservaciones AS
SELECT
  r.tenant_id,
  r.sucursal_id,
  date_trunc('day', r.fecha_hora_reserva)::date AS dia_reserva,
  COUNT(*)                                       AS reservas_total,
  COUNT(*) FILTER (WHERE r.estado = 'LLEGO')     AS llegaron,
  COUNT(*) FILTER (WHERE r.estado = 'TERMINADA') AS terminadas,
  COUNT(*) FILTER (WHERE r.estado = 'CANCELADA') AS canceladas,
  COUNT(*) FILTER (WHERE r.estado = 'NO_SHOW')   AS no_shows,

  ROUND(
    COUNT(*) FILTER (WHERE r.estado = 'NO_SHOW') * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE r.estado IN ('LLEGO', 'TERMINADA', 'NO_SHOW')), 0),
    1
  ) AS tasa_no_show_pct,

  SUM(r.comensales) FILTER (WHERE r.estado IN ('LLEGO', 'TERMINADA')) AS comensales_llegaron,
  SUM(r.comensales) FILTER (WHERE r.estado = 'NO_SHOW')              AS comensales_no_show

FROM reservaciones r
WHERE r.deleted_at IS NULL
GROUP BY r.tenant_id, r.sucursal_id, date_trunc('day', r.fecha_hora_reserva);
```

---

## 9. Vista de efectivo esperado / arqueo

### 9.1 Vista `vw_efectivo_esperado_turno`

Una sola fila por turno con todos los componentes del cálculo.

```sql
CREATE OR REPLACE VIEW vw_efectivo_esperado_turno AS
SELECT
  t.id                          AS turno_id,
  t.tenant_id,
  t.sucursal_id,
  t.caja_id,
  t.dia_contable,
  t.estado                      AS turno_estado,
  t.fondo_apertura_mxn,

  -- Pagos en efectivo (suma incluye negativos por devoluciones)
  COALESCE((
    SELECT SUM(p.monto_mxn)
    FROM pagos p
    WHERE p.turno_id = t.id
      AND p.metodo_pago = 'EFECTIVO'
      AND p.estado = 'APLICADO'
      AND p.deleted_at IS NULL
  ), 0) AS pagos_efectivo_netos_mxn,

  -- Inyecciones de fondo
  COALESCE((
    SELECT SUM(monto_mxn) FROM movimientos_caja
    WHERE turno_id = t.id AND tipo_movimiento = 'INYECCION_FONDO'
  ), 0) AS inyecciones_fondo_mxn,

  -- Retiros, depósitos, devoluciones efectivo (todos restan)
  COALESCE((
    SELECT SUM(monto_mxn) FROM movimientos_caja
    WHERE turno_id = t.id
      AND tipo_movimiento IN ('RETIRO_EFECTIVO', 'DEPOSITO_BANCARIO',
                              'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR')
  ), 0) AS retiros_y_devoluciones_mxn,

  -- Ajustes
  COALESCE((
    SELECT SUM(CASE WHEN tipo_movimiento = 'AJUSTE_SOBRANTE' THEN monto_mxn
                    WHEN tipo_movimiento = 'AJUSTE_FALTANTE' THEN -monto_mxn
                    ELSE 0 END)
    FROM movimientos_caja WHERE turno_id = t.id
  ), 0) AS ajustes_mxn,

  -- Efectivo esperado (calculado con la función)
  calcular_efectivo_esperado(t.id) AS efectivo_esperado_mxn,

  -- Último corte declarado (si hubo)
  (SELECT total_declarado_mxn FROM cortes_caja c
   WHERE c.turno_id = t.id ORDER BY c.fecha_corte DESC LIMIT 1) AS ultimo_corte_declarado_mxn,
  (SELECT diferencia_mxn FROM cortes_caja c
   WHERE c.turno_id = t.id ORDER BY c.fecha_corte DESC LIMIT 1) AS ultimo_corte_diferencia_mxn

FROM turnos t
WHERE t.deleted_at IS NULL;

COMMENT ON VIEW vw_efectivo_esperado_turno IS 'Componentes del cálculo de efectivo esperado por turno. Permite trazabilidad fina.';
```

### 9.2 Vista `vw_resumen_turno`

Consolidación final de un turno con todos sus componentes.

```sql
CREATE OR REPLACE VIEW vw_resumen_turno AS
SELECT
  t.id                          AS turno_id,
  t.tenant_id,
  t.sucursal_id,
  t.caja_id,
  t.dia_contable,
  t.estado                      AS turno_estado,
  t.fecha_apertura,
  t.fecha_cierre,
  t.usuario_apertura_id,
  t.usuario_cierre_id,

  -- Tickets
  (SELECT COUNT(*) FROM tickets WHERE turno_id = t.id
   AND estado_fiscal IN ('PAGADO', 'FACTURADO')) AS tickets_pagados,
  (SELECT SUM(total_mxn) FROM tickets WHERE turno_id = t.id
   AND estado_fiscal IN ('PAGADO', 'FACTURADO')) AS total_vendido_mxn,
  (SELECT SUM(propina_mxn) FROM tickets WHERE turno_id = t.id
   AND estado_fiscal IN ('PAGADO', 'FACTURADO')) AS propinas_capturadas_mxn,

  -- Devoluciones
  (SELECT COUNT(*) FROM devoluciones WHERE turno_id = t.id AND estado = 'CONFIRMADA') AS devoluciones_count,
  (SELECT SUM(total_devuelto_mxn) FROM devoluciones WHERE turno_id = t.id
   AND estado = 'CONFIRMADA') AS devoluciones_total_mxn,

  -- Cancelaciones
  (SELECT COUNT(*) FROM cancelaciones_ticket WHERE turno_id = t.id) AS cancelaciones_count,

  -- Cortes
  (SELECT COUNT(*) FROM cortes_caja WHERE turno_id = t.id) AS cortes_count,

  -- Efectivo esperado
  calcular_efectivo_esperado(t.id) AS efectivo_esperado_mxn,

  -- Z generado
  (SELECT id FROM reportes_z_historico WHERE turno_id = t.id) AS reporte_z_id,
  (SELECT folio_z FROM reportes_z_historico WHERE turno_id = t.id) AS folio_z,
  (SELECT diferencia_efectivo_mxn FROM reportes_z_historico WHERE turno_id = t.id) AS z_diferencia_efectivo_mxn

FROM turnos t
WHERE t.deleted_at IS NULL;

COMMENT ON VIEW vw_resumen_turno IS 'Vista consolidada del turno: tickets, devoluciones, cortes, Z. Para dashboard de admin.';
```

---

## 10. Funciones helper consolidadas

### 10.1 KPIs del día por sucursal

D65: función principal que la app llama para el dashboard del dueño.

```sql
CREATE OR REPLACE FUNCTION kpis_dia_sucursal(
  p_sucursal_id uuid,
  p_fecha       date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
  v_estado    record;
BEGIN
  SELECT * INTO v_estado FROM vw_estado_resultados_dia
  WHERE sucursal_id = p_sucursal_id AND dia_contable = p_fecha;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucursal_id', p_sucursal_id,
      'fecha', p_fecha,
      'sin_actividad', true
    );
  END IF;

  v_resultado := jsonb_build_object(
    'sucursal_id', p_sucursal_id,
    'fecha', p_fecha,
    'tickets', jsonb_build_object(
      'completados', v_estado.tickets_completados,
      'cancelados', v_estado.tickets_cancelados,
      'pendientes', v_estado.tickets_pendientes
    ),
    'ingresos', jsonb_build_object(
      'subtotal_mxn', v_estado.subtotal_neto_mxn,
      'iva_mxn', v_estado.iva_neto_mxn,
      'total_mxn', v_estado.total_neto_mxn
    ),
    'descuentos', jsonb_build_object(
      'manuales_mxn', v_estado.descuentos_manuales_mxn,
      'promociones_mxn', v_estado.promociones_mxn
    ),
    'propinas_mxn', v_estado.propinas_capturadas_mxn,
    'devoluciones_mxn', v_estado.devoluciones_mxn,
    'cancelaciones_post_pago_mxn', v_estado.cancelaciones_post_pago_mxn,
    'comisiones_apps_mxn', v_estado.comisiones_apps_mxn,
    'ticket_promedio_mxn', v_estado.ticket_promedio_mxn,
    'tickets_por_modo', jsonb_build_object(
      'para_llevar', v_estado.tickets_para_llevar,
      'comer_aqui', v_estado.tickets_comer_aqui,
      'delivery_propio', v_estado.tickets_delivery_propio,
      'apps', v_estado.tickets_apps
    ),

    -- Tiempos de cocina (agregado)
    'tiempos_cocina', COALESCE((
      SELECT to_jsonb(c) FROM (
        SELECT minutos_cocina_promedio, minutos_cocina_mediana, minutos_cocina_p95,
               tickets_cocina_bajo_15min, tickets_cocina_mayor_30min
        FROM vw_cumplimiento_tiempos_cocina_agregado
        WHERE sucursal_id = p_sucursal_id AND dia_contable = p_fecha
        LIMIT 1
      ) c
    ), '{}'::jsonb),

    -- Tiempos de delivery (agregado)
    'tiempos_delivery', COALESCE((
      SELECT to_jsonb(d) FROM (
        SELECT cumplidos, tarde_ligero, tarde_grave, no_entregados,
               tiempo_real_promedio_min, tiempo_promesa_promedio_min
        FROM vw_cumplimiento_delivery_agregado
        WHERE sucursal_id = p_sucursal_id AND dia_contable = p_fecha
        LIMIT 1
      ) d
    ), '{}'::jsonb)
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION kpis_dia_sucursal IS 'Función única para dashboard del dueño. Devuelve jsonb con tickets, ingresos, descuentos, propinas, devoluciones, comisiones, tiempos.';
```

### 10.2 Top productos

```sql
CREATE OR REPLACE FUNCTION top_productos(
  p_sucursal_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_limite      integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'producto_id', producto_id,
    'producto_nombre', producto_nombre,
    'producto_sku', producto_sku,
    'unidades_vendidas', unidades_vendidas,
    'total_mxn', total_mxn,
    'tickets_con_producto', tickets_con_producto
  ) ORDER BY total_mxn DESC)
  INTO v_resultado
  FROM (
    SELECT
      producto_id,
      producto_nombre,
      producto_sku,
      SUM(unidades_vendidas) AS unidades_vendidas,
      SUM(total_mxn)         AS total_mxn,
      SUM(tickets_con_producto) AS tickets_con_producto
    FROM vw_ventas_por_producto
    WHERE sucursal_id = p_sucursal_id
      AND dia_contable BETWEEN p_fecha_desde AND p_fecha_hasta
    GROUP BY producto_id, producto_nombre, producto_sku
    ORDER BY SUM(total_mxn) DESC
    LIMIT p_limite
  ) sub;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;
```

### 10.3 Top meseros

```sql
CREATE OR REPLACE FUNCTION top_meseros(
  p_sucursal_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_limite      integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'mesero_id', mesero_id,
    'mesero_email', mesero_email,
    'tickets_atendidos', tickets_atendidos,
    'total_vendido_mxn', total_vendido_mxn,
    'propinas_capturadas_mxn', propinas_capturadas_mxn,
    'ticket_promedio_mxn', ticket_promedio_mxn,
    'propina_pct_promedio', propina_pct_promedio
  ) ORDER BY total_vendido_mxn DESC)
  INTO v_resultado
  FROM (
    SELECT
      mesero_id, mesero_email,
      SUM(tickets_atendidos) AS tickets_atendidos,
      SUM(total_vendido_mxn) AS total_vendido_mxn,
      SUM(propinas_capturadas_mxn) AS propinas_capturadas_mxn,
      AVG(ticket_promedio_mxn) AS ticket_promedio_mxn,
      AVG(propina_pct_promedio) AS propina_pct_promedio
    FROM vw_ventas_por_mesero
    WHERE sucursal_id = p_sucursal_id
      AND dia_contable BETWEEN p_fecha_desde AND p_fecha_hasta
    GROUP BY mesero_id, mesero_email
    ORDER BY SUM(total_vendido_mxn) DESC
    LIMIT p_limite
  ) sub;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;
```

### 10.4 Detección de descuentos sospechosos

```sql
CREATE OR REPLACE FUNCTION detectar_descuentos_sospechosos(
  p_sucursal_id    uuid,
  p_fecha_desde    date,
  p_fecha_hasta    date,
  p_umbral_count   integer DEFAULT 10,                  -- > N descuentos por usuario/día
  p_umbral_monto   numeric DEFAULT 1000                 -- > $1000 descontados por usuario/día
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'usuario_id', usuario_id,
    'usuario_email', usuario_email,
    'dia_contable', dia_contable,
    'cantidad_descuentos', cantidad_descuentos,
    'total_descontado_mxn', total_descontado_mxn,
    'descuento_promedio_mxn', descuento_promedio_mxn,
    'razon_alerta', razon_alerta
  ))
  INTO v_resultado
  FROM (
    SELECT
      usuario_id, usuario_email, dia_contable,
      cantidad_descuentos, total_descontado_mxn, descuento_promedio_mxn,
      CASE
        WHEN cantidad_descuentos > p_umbral_count AND total_descontado_mxn > p_umbral_monto
          THEN 'ALTA_FRECUENCIA_Y_MONTO'
        WHEN cantidad_descuentos > p_umbral_count THEN 'ALTA_FRECUENCIA'
        WHEN total_descontado_mxn > p_umbral_monto THEN 'ALTO_MONTO'
      END AS razon_alerta
    FROM vw_descuentos_por_usuario
    WHERE sucursal_id = p_sucursal_id
      AND dia_contable BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (cantidad_descuentos > p_umbral_count OR total_descontado_mxn > p_umbral_monto)
  ) sub;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION detectar_descuentos_sospechosos IS 'Detecta usuarios que exceden umbrales de descuentos. Para alertas anti-fraude.';
```

### 10.5 Reporte de auditoría de cancelaciones

```sql
CREATE OR REPLACE FUNCTION reporte_cancelaciones_periodo(
  p_sucursal_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'sucursal_id', p_sucursal_id,
    'periodo', jsonb_build_object('desde', p_fecha_desde, 'hasta', p_fecha_hasta),
    'total_cancelaciones', COUNT(*),
    'total_monto_mxn', COALESCE(SUM(ticket_total_snapshot), 0),
    'por_motivo', jsonb_object_agg(motivo, motivo_count),
    'por_usuario', jsonb_agg(DISTINCT jsonb_build_object(
      'usuario_id', usuario_solicitante_id,
      'count', usuario_count
    ))
  )
  INTO v_resultado
  FROM (
    SELECT
      ct.*,
      COUNT(*) OVER (PARTITION BY motivo) AS motivo_count,
      COUNT(*) OVER (PARTITION BY usuario_solicitante_id) AS usuario_count
    FROM cancelaciones_ticket ct
    WHERE ct.sucursal_id = p_sucursal_id
      AND ct.dia_contable BETWEEN p_fecha_desde AND p_fecha_hasta
  ) sub;

  RETURN COALESCE(v_resultado, jsonb_build_object('sin_cancelaciones', true));
END;
$$;
```

---

## 11. RLS consolidada

### 11.1 Patrón aplicado a tablas nuevas

```sql
-- ====== cortes_caja_detalle ======
ALTER TABLE cortes_caja_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY cortes_detalle_select ON cortes_caja_detalle
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY cortes_detalle_insert ON cortes_caja_detalle
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- UPDATE/DELETE prohibidos: el detalle se inserta una vez y no se cambia.

-- ====== reportes_z_historico ======
ALTER TABLE reportes_z_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY reportes_z_select ON reportes_z_historico
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY reportes_z_insert ON reportes_z_historico
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY reportes_z_update_nota ON reportes_z_historico
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
-- El trigger trg_reportes_z_inmutable bloquea cualquier UPDATE excepto en columna `nota`.

-- DELETE no permitido (D66 — el Z es inmutable y eterno).
```

### 11.2 RLS para vistas

Las vistas heredan RLS de las tablas base. Como todas las tablas base ya tienen RLS habilitado, las vistas son seguras automáticamente. Las vistas creadas con `SECURITY INVOKER` (default) ejecutan con los permisos del usuario que consulta, respetando RLS.

### 11.3 Permisos para funciones

Las funciones `STABLE` (puramente lectura) corren con permisos del invocante. La función `reporte_z()` que escribe usa permisos del invocante; el `INSERT` en `reportes_z_historico` respeta la política `reportes_z_insert` que valida `tenant_id`.

```sql
-- Permisos públicos para funciones de reporte (lectura)
GRANT EXECUTE ON FUNCTION reporte_x(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_reporte_z(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_efectivo_esperado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION estado_resultados_periodo(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION kpis_dia_sucursal(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION top_productos(uuid, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION top_meseros(uuid, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION detectar_descuentos_sospechosos(uuid, date, date, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION reporte_cancelaciones_periodo(uuid, date, date) TO authenticated;

-- Permisos para funciones de escritura (en aplicación se valida rol antes de llamar)
GRANT EXECUTE ON FUNCTION reporte_z(uuid, numeric, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION arquear_caja(uuid, jsonb, text, uuid, uuid) TO authenticated;
```

---

## 12. Estrategia de migraciones (continuación)

### 12.1 Orden recomendado

```
migrations/
├── ... (041-051 Parte 1D)
├── 052_reportes_tablas.sql           ← cortes_caja_detalle, reportes_z_historico
├── 053_reportes_triggers.sql         ← triggers de inmutabilidad y audit
├── 054_reportes_funciones_lectura.sql ← reporte_x, obtener_reporte_z, calcular_efectivo_esperado, kpis_dia_sucursal, top_*
├── 055_reportes_funciones_escritura.sql ← reporte_z, arquear_caja
├── 056_reportes_vistas.sql           ← todas las vw_* de §6-§9
├── 057_reportes_rls.sql              ← RLS
└── 058_reportes_grants.sql           ← GRANT EXECUTE
```

### 12.2 Validaciones post-migración

```sql
-- Tablas nuevas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('cortes_caja_detalle', 'reportes_z_historico')
ORDER BY table_name;
-- Esperado: 2 filas.

-- Vistas creadas
SELECT viewname FROM pg_views WHERE viewname IN (
  'vw_estado_resultados_dia',
  'vw_ventas_por_categoria',
  'vw_ventas_por_producto',
  'vw_ventas_por_area_cocina',
  'vw_ventas_por_mesero',
  'vw_ventas_por_modo_servicio',
  'vw_descuentos_por_usuario',
  'vw_reimpresiones_por_cajero',
  'vw_cumplimiento_tiempos_cocina',
  'vw_cumplimiento_tiempos_cocina_agregado',
  'vw_cumplimiento_tiempos_delivery',
  'vw_cumplimiento_delivery_agregado',
  'vw_no_shows_reservaciones',
  'vw_efectivo_esperado_turno',
  'vw_resumen_turno',
  'vw_resumen_corte_caja'
);
-- Esperado: 16 filas.

-- Funciones públicas
SELECT proname FROM pg_proc WHERE proname IN (
  'reporte_x', 'reporte_z', 'obtener_reporte_z',
  'calcular_efectivo_esperado', 'estado_resultados_periodo',
  'arquear_caja',
  'kpis_dia_sucursal', 'top_productos', 'top_meseros',
  'detectar_descuentos_sospechosos', 'reporte_cancelaciones_periodo'
);
-- Esperado: 11 filas.

-- Triggers de inmutabilidad
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'reportes_z_historico'
ORDER BY trigger_name;
-- Esperado: trg_reportes_z_folio, trg_reportes_z_inmutable, trg_reportes_z_audit

-- RLS habilitado
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('cortes_caja_detalle', 'reportes_z_historico');
-- Ambas con relrowsecurity = t.
```

### 12.3 Configuración recomendada de pg_cron (post-MVP)

Para automatizaciones útiles (no críticas para MVP):

```sql
-- Auto-marcar reservaciones NO_SHOW cada 15 min (definido en 1D §8.6)
SELECT cron.schedule('auto-no-shows', '*/15 * * * *', $$SELECT auto_marcar_no_shows()$$);

-- Snapshot diario de KPIs para tendencias (opcional, Fase 2):
-- SELECT cron.schedule('snapshot-kpis-diarios', '0 5 * * *', ...);
```

### 12.4 Resumen total de tablas en MVP

Al cierre de 1E, el MVP tiene las siguientes tablas (por orden de aparición):

**De Parte 1A (núcleo multi-tenant):**
`tenants`, `usuarios_acceso`, `tenant_invitaciones`, `sucursales`, `cajas`, `turnos`, `cortes_caja`, `movimientos_caja`, `autorizaciones_pin`, `auditoria_eventos`, `folios_secuencia`

**De Parte 1B (catálogo):**
`categorias`, `productos`, `producto_imagenes`, `grupos_modificadores`, `opciones_modificador`, `producto_grupos_modificadores`, `producto_precios_por_modo`, `areas_cocina`, `producto_areas_cocina`, `clientes`, `direcciones_cliente`, `promociones`, `promocion_condiciones`, `marcas_virtuales`, `producto_marca_virtual`, `inventario_productos`, `recetas_producto`, `recetas_ingredientes`, `stock_actual`, `movimientos_inventario`

**De Parte 1C.1 (operación de venta):**
`tickets`, `ticket_items`, `ticket_item_modificadores`, `pagos`, `ticket_descuentos_manuales`, `ticket_promociones_aplicadas`

**De Parte 1C.2 (post-venta):**
`devoluciones`, `devolucion_items`, `cancelaciones_ticket`, `tickets_cfdi`, `cfdi_sat_movimientos`, `delivery_asignaciones`, `apps_liquidaciones`, `apps_liquidacion_items`, `comanda_impresiones`, `sync_eventos`, `sync_conflictos`

**De Parte 1D (verticales):**
`secciones`, `mesas`, `tickets_mesas`, `cuentas_abiertas`, `marcas_areas_cocina`, `reservaciones`, `sucursal_propinas_config`, `propinas_distribucion`

**De Parte 1E (reportes):**
`cortes_caja_detalle`, `reportes_z_historico`

**TOTAL: ~58 tablas físicas + 16 vistas en MVP.**

---

## 13. Decisiones pendientes y fuera de alcance

### 13.1 Reportes externos (Excel, PDF)

La generación de archivos para descargar es responsabilidad de la app (Next.js). VIM POS expone los datos vía las funciones jsonb; el front genera el PDF/Excel.

### 13.2 BI avanzado

Dashboards interactivos con filtros, drilldown, gráficas son UI (08-WIREFRAMES). El backend ya provee toda la materia prima.

### 13.3 Pronóstico de demanda

Requiere modelo estadístico (regresión, ML). Fase 5 con módulo de inteligencia.

### 13.4 Integración contable

Exportar a Contpaqi/Aspel/ContaSat requiere mapeo de cuentas contables y formatos específicos por sistema. Módulo separado, Fase 5.

### 13.5 Reportes a SAT (DIOT, declaraciones)

El SAT exige formatos específicos. La función `cfdi_*` ya tiene la materia prima. Generar DIOT, declaración mensual, etc., es módulo fiscal específico que requiere conocimiento contable profundo. Fase 5.

### 13.6 Costos teóricos (food cost analysis)

Comparar costo teórico de receta vs precio de venta para calcular margen por producto. Requiere costeo en `recetas_ingredientes` (campo `costo_unitario_mxn`). Módulo de costos avanzado, Fase 3.

### 13.7 Reportes consolidados multi-tenant

Para que VIM Marketing (Fermín) vea ventas agregadas de todos los clientes piloto y tome decisiones de producto. Requiere romper RLS controladamente vía service_role + funciones específicas. Fase 2 con dashboard de SaaS owner.

### 13.8 MATERIALIZED VIEWS

Si en producción alguna vista resulta lenta (>2s consistente), se promueve a materialized con `REFRESH MATERIALIZED VIEW CONCURRENTLY` programado vía pg_cron cada N minutos. Esa decisión se toma con datos reales, no en MVP.

### 13.9 Particionado de tablas grandes

Si `tickets`, `pagos` o `auditoria_eventos` superan 10M filas, considerar particionado por mes (`PARTITION BY RANGE (dia_contable)`). MVP no lo necesita.

---

## 14. Checklist de validación

### 14.1 Mapeo de flujos del `/core` → tablas y funciones de 1E

| Flujo del `/core` | Función / vista |
|---|---|
| **§28.1 Imprimir reporte X** | `reporte_x(turno_id)` |
| **§28.2 Reimprimir X cuantas veces se quiera** | Idempotente, sin efectos secundarios |
| **§29.1 Generar reporte Z al cerrar** | `reporte_z(turno_id, ...)` |
| **§29.2 Z una sola vez por turno** | UNIQUE `turno_id` en `reportes_z_historico` |
| **§29.3 Z inmutable después de generado** | Trigger `trg_reportes_z_inmutable` |
| **§29.4 Z dispara distribución de propinas** | Trigger `trg_turno_calcular_propinas` (1D §7.5) |
| **§29.5 Z requiere autorización** | Validación de PIN obligatorio en `reporte_z()` |
| **§30.1 Corte de caja con desglose por método** | Función `arquear_caja(declaraciones jsonb)` |
| **§30.2 Detectar diferencias por método** | Tabla `cortes_caja_detalle.diferencia_mxn` |
| **§30.3 Reimprimir corte** | Vista `vw_resumen_corte_caja` |
| **§31.1 Tiempos de cocina** | Vista `vw_cumplimiento_tiempos_cocina` + agregado |
| **§31.2 Tiempos de delivery** | Vista `vw_cumplimiento_tiempos_delivery` + agregado |
| **§31.3 Cumplimiento de promesa** | Columna calculada `cumplimiento_promesa` |
| **§32 Estado de resultados del día** | Vista `vw_estado_resultados_dia` + función `kpis_dia_sucursal()` |
| **§32 Estado de resultados de periodo** | Función `estado_resultados_periodo()` |
| **§33 Ventas por categoría/producto/área** | Vistas `vw_ventas_por_*` |
| **§33 Top productos / meseros** | Funciones `top_productos()`, `top_meseros()` |
| **§34.1 Descuentos manuales por usuario** | Vista `vw_descuentos_por_usuario` |
| **§34.2 Detectar descuentos sospechosos** | Función `detectar_descuentos_sospechosos()` |
| **§34.3 Reimpresiones de comanda** | Vista `vw_reimpresiones_por_cajero` |
| **§34.4 Auditoría de cancelaciones** | Función `reporte_cancelaciones_periodo()` |
| **§35 No-shows de reservaciones** | Vista `vw_no_shows_reservaciones` |
| **Efectivo esperado en arqueo** | Función `calcular_efectivo_esperado()` + vista `vw_efectivo_esperado_turno` |
| **Resumen turno (post-cierre)** | Vista `vw_resumen_turno` |

### 14.2 Pruebas de aceptación funcional

- [ ] **TA-81 Reporte X durante turno:** abrir turno, vender 5 tickets, `reporte_x(turno_id)` → jsonb con tickets, pagos por método, efectivo esperado, devoluciones (0 si no hubo). Idempotente (llamar 3 veces da el mismo resultado).
- [ ] **TA-82 Reporte X con devolución:** vender ticket de $200, devolver $50 en efectivo → reporte_x muestra `efectivo_esperado` correcto (con pagos netos: +200 - 50).
- [ ] **TA-83 Generar Z exitoso:** turno ABIERTO con actividad → `reporte_z(...)` → estado GENERADO, folio asignado, `reportes_z_historico` tiene fila, turno pasa a CERRADO, `propinas_distribucion` tiene filas.
- [ ] **TA-84 Z idempotente:** llamar `reporte_z(...)` con turno que ya tiene Z → devuelve YA_EXISTE, no inserta duplicado.
- [ ] **TA-85 Z inmutable:** UPDATE de `reportes_z_historico` para cambiar `total_ventas_mxn` → falla con excepción.
- [ ] **TA-86 Z update nota OK:** UPDATE de `reportes_z_historico.nota = 'observación'` → pasa.
- [ ] **TA-87 Z requiere PIN:** `reporte_z()` sin `autorizacion_pin_id` → excepción.
- [ ] **TA-88 Z bloquea modificación posterior de tickets del turno:** después del Z, intentar UPDATE de un ticket → ¿permite o bloquea? (decisión pendiente: hoy NO bloquea explícitamente, solo audita. D61 declarada para que futuras versiones agreguen el bloqueo).
- [ ] **TA-89 Arqueo con declaraciones exactas:** declarar exactamente lo esperado por método → `cortes_caja_detalle.diferencia_mxn = 0` en cada fila.
- [ ] **TA-90 Arqueo con diferencia faltante:** declarar $50 menos en efectivo → `diferencia_mxn = -50`, vista muestra alerta.
- [ ] **TA-91 Arqueo con sobrante:** declarar $30 más en tarjeta → `diferencia_mxn = +30`.
- [ ] **TA-92 Estado de resultados día:** vender 10 tickets, 1 devolución, 1 cancelación post-pago → `vw_estado_resultados_dia` muestra cifras coherentes.
- [ ] **TA-93 Estado de resultados periodo:** llamar `estado_resultados_periodo(sucursal, 2026-05-01, 2026-05-31)` → consolida mes, totales agregan correctamente.
- [ ] **TA-94 KPIs dia sucursal:** `kpis_dia_sucursal(...)` devuelve jsonb completo con tickets, ingresos, descuentos, propinas, tiempos, comisiones.
- [ ] **TA-95 KPIs sin actividad:** consultar fecha sin tickets → `sin_actividad: true`.
- [ ] **TA-96 Top productos:** vender variados productos, llamar `top_productos(sucursal, mes_actual, limit=5)` → 5 productos top ordenados por total_mxn descendente.
- [ ] **TA-97 Top meseros:** mesero A atiende 10 tickets, mesero B atiende 5 → `top_meseros` lo refleja.
- [ ] **TA-98 Cumplimiento cocina por modo:** tickets PARA_LLEVAR vs COMER_AQUI con tiempos distintos → vista agregada los separa.
- [ ] **TA-99 Cumplimiento delivery:** delivery con promesa=30 min, real=25 min → CUMPLIDO. Real=33 min → TARDE_LIGERO. Real=40 min → TARDE_GRAVE.
- [ ] **TA-100 No-shows tasa:** 10 reservaciones, 7 llegaron, 2 NO_SHOW, 1 cancelada → `tasa_no_show_pct = 22.2`.
- [ ] **TA-101 Descuentos sospechosos:** usuario aplica 15 descuentos en un día por total $1500 → función `detectar_descuentos_sospechosos` (umbral=10, $1000) lo detecta con `razon=ALTA_FRECUENCIA_Y_MONTO`.
- [ ] **TA-102 Reimpresiones cajero:** cajero reimprime 5 comandas → vista lo refleja.
- [ ] **TA-103 Reporte cancelaciones periodo:** 5 cancelaciones por motivos variados → función devuelve agregado por motivo y por usuario.
- [ ] **TA-104 Efectivo esperado con fondo + ventas + retiros:** fondo=500, ventas efectivo=1200, retiro=300 → `calcular_efectivo_esperado=1400`.
- [ ] **TA-105 RLS cross-tenant en reportes:** desde tenant A consultar `vw_estado_resultados_dia` de tenant B → 0 filas.
- [ ] **TA-106 Z no permite DELETE:** `DELETE FROM reportes_z_historico` → excepción del trigger.

### 14.3 Pruebas de rendimiento

- [ ] **PERF-01 vw_estado_resultados_dia 30 días:** con 1000 tickets/día (30K total) → `EXPLAIN ANALYZE` < 500ms.
- [ ] **PERF-02 reporte_x:** 200 tickets en turno → < 200ms.
- [ ] **PERF-03 reporte_z generación:** turno con 500 tickets → < 1s incluida persistencia.
- [ ] **PERF-04 top_productos en un mes:** con 10K productos vendidos → < 800ms.
- [ ] **PERF-05 kpis_dia_sucursal:** con día activo → < 400ms (es el endpoint más usado del dashboard).

### 14.4 Cosas que esta parte deja explícitamente para después

- ❌ Reportes en Excel/PDF (capa de aplicación)
- ❌ BI con dashboards interactivos (UI en 08-WIREFRAMES)
- ❌ Pronóstico de demanda (Fase 5)
- ❌ Integraciones contables (Fase 5)
- ❌ Reportes fiscales SAT (DIOT, declaraciones) (Fase 5)
- ❌ Costos teóricos por receta (Fase 3 — requiere costeo de ingredientes)
- ❌ Bloqueo duro de modificaciones de tickets post-Z (D61 declarado para versión futura)
- ❌ Materialización de vistas pesadas (cuando duela)
- ❌ Particionado de tablas (cuando duela)
- ❌ Dashboard consolidado multi-tenant para Fermín como SaaS owner (Fase 2)

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.1 | Mayo 2026 | §4.3.bis — guardarraíl de escalabilidad del payload Z (**D131**): el `payload_completo` es siempre agregado y acotado (O(1) respecto a tickets); prohibido embeber detalle por ticket/ítem/producto, que se sirve paginado desde las vistas analíticas. Confirma que el Z no requiere paginación. |
| v1.0 | Mayo 2026 | Documento inicial y final de la capa SQL del MVP. 9 decisiones nuevas (D58-D66). 2 tablas nuevas (`cortes_caja_detalle`, `reportes_z_historico`), 0 enums nuevos, 11 funciones públicas (`reporte_x`, `reporte_z`, `obtener_reporte_z`, `calcular_efectivo_esperado`, `estado_resultados_periodo`, `arquear_caja`, `kpis_dia_sucursal`, `top_productos`, `top_meseros`, `detectar_descuentos_sospechosos`, `reporte_cancelaciones_periodo`), 3 triggers de inmutabilidad/audit, 16 vistas analíticas (vw_estado_resultados_dia, vw_ventas_por_*, vw_cumplimiento_*, vw_efectivo_esperado_turno, vw_resumen_turno, vw_resumen_corte_caja, vw_descuentos_por_usuario, vw_reimpresiones_por_cajero, vw_no_shows_reservaciones), RLS consolidada con D66 (Z eterno), estrategia de migración 052-058. Mapeo a flujos §28 (X), §29 (Z), §30 (cortes), §31 (tiempos), §32 (estado resultados), §33 (ventas por dimensión), §34 (auditoría operativa), §35 (no-shows) del `/core`. 26 pruebas de aceptación funcional (TA-81 a TA-106) y 5 pruebas de rendimiento (PERF-01 a PERF-05). Cierra la capa de modelo de datos del MVP. |

---

**Fin Parte 1E.**

**Fin de la capa SQL del MVP de VIM POS.** Las partes 1A, 1B, 1C.1, 1C.2, 1D y 1E suman ~16,500 líneas de SQL ejecutable, ~60 tablas, ~50 enums, ~100 funciones, ~150 triggers, ~25 vistas, RLS consolidada en todas. Las siguientes entregas no son SQL sino UI (08-WIREFRAMES), operaciones (09-ROLES-PERMISOS, 10-SETUP-INICIAL) y plan de desarrollo del MVP.
