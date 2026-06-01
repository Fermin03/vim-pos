-- 0011 — Reportes, cierres X/Z, cortes extendidos, vistas analíticas. Fuente: 1E.
--
-- Orden de dependencias:
--   1) Tablas físicas nuevas (cortes_caja_detalle, reportes_z_historico) + índices + COMMENT
--   2) Triggers de inmutabilidad/folio/audit sobre reportes_z_historico
--   3) Funciones de lectura base (calcular_efectivo_esperado, reporte_x, obtener_reporte_z)
--   4) Función de escritura reporte_z (usa reporte_x + tabla)
--   5) Función arquear_caja (usa cortes_caja_detalle + calcular_efectivo_esperado)
--   6) Vistas analíticas (§5.3, §6, §7, §8, §9)
--   7) Funciones helper que consumen vistas (kpis, top_*, etc.)
--   8) RLS de las dos tablas nuevas
--   9) GRANT EXECUTE
--
-- Referencias externas (migraciones previas, NO se redefinen aquí):
--   tenants, sucursales, cajas (0002/0003); turnos, cortes_caja, movimientos_caja,
--   autorizaciones_pin, auditoria_eventos, generar_folio() (0005/0006);
--   tickets, ticket_items, pagos, ticket_descuentos_manuales (0008);
--   devoluciones, cancelaciones_ticket, apps_liquidacion_items, comanda_impresiones,
--   delivery_asignaciones (0009); reservaciones, propinas_distribucion (0010);
--   enum metodo_pago (0008); helpers current_tenant_id(), set_updated_at() (0001).
--
-- NOTA SOBRE EL FIX EXCLUDE: el doc 1E NO usa el patrón
--   EXCLUDE ( ... WITH IS NOT DISTINCT FROM ); todas sus unicidades ya son
--   CONSTRAINT ... UNIQUE válidas. Por tanto no aplica reemplazo a índice único
--   parcial en esta migración (el fix sí se aplicó en migraciones previas, p.ej. 0004).
--
-- NOTA SOBRE updated_at: ni cortes_caja_detalle ni reportes_z_historico tienen
--   columna updated_at (son insert-once/inmutables), por lo que NO se adjuntan
--   triggers set_updated_at().

-- =====================================================================
-- 1. TABLAS FÍSICAS NUEVAS
-- =====================================================================

-- ---------- 5.0 cortes_caja (cabecera) ----------
-- NOTA: 1E asumía que esta tabla "ya existía en 1A", pero 1A creó `cortes_parciales`
-- (otra forma). Se define aquí según la usan arquear_caja() y las vistas de 1E. (Fix gap 1A↔1E.)
CREATE TABLE cortes_caja (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
  caja_id             uuid NOT NULL REFERENCES cajas(id),
  turno_id            uuid NOT NULL REFERENCES turnos(id),
  motivo              varchar(50) NULL,                  -- CIERRE_TURNO / CAMBIO_CAJERO / ARQUEO_INTERMEDIO
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),
  autorizacion_pin_id uuid NULL REFERENCES autorizaciones_pin(id),
  total_esperado_mxn  numeric(12,2) NOT NULL DEFAULT 0,
  total_declarado_mxn numeric(12,2) NOT NULL DEFAULT 0,
  diferencia_mxn      numeric(12,2) NOT NULL DEFAULT 0,   -- declarado - esperado (negativo = faltante)
  fecha_corte         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_cortes_caja_turno ON cortes_caja(turno_id);
CREATE INDEX idx_cortes_caja_sucursal_fecha ON cortes_caja(sucursal_id, fecha_corte DESC);
COMMENT ON TABLE cortes_caja IS 'Cabecera de corte de caja (arqueo) por turno; detalle por método en cortes_caja_detalle. D62.';

CREATE TRIGGER trg_cortes_caja_updated_at
  BEFORE UPDATE ON cortes_caja
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE cortes_caja ENABLE ROW LEVEL SECURITY;
CREATE POLICY cortes_caja_tenant ON cortes_caja FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ---------- 5.1 cortes_caja_detalle ----------
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

-- ---------- 4.1 reportes_z_historico ----------
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

-- =====================================================================
-- 2. TRIGGERS EN reportes_z_historico (§4.2)
-- =====================================================================

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

-- =====================================================================
-- 3. FUNCIONES DE LECTURA BASE
-- =====================================================================

-- ---------- 3.2 calcular_efectivo_esperado(turno_id) ----------
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
      WHEN tipo IN ('INYECCION_FONDO', 'AJUSTE_POSITIVO') THEN monto_mxn
      WHEN tipo IN ('SANGRIA', 'DEPOSITO',
                                'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR',
                                'AJUSTE_NEGATIVO') THEN -monto_mxn
      ELSE 0
    END
  ), 0) INTO v_movimientos
  FROM movimientos_caja
  WHERE turno_id = p_turno_id;

  RETURN v_turno.fondo_inicial_mxn + v_pagos_efectivo + v_movimientos;
END;
$$;

COMMENT ON FUNCTION calcular_efectivo_esperado IS 'Cuánto efectivo debería tener la caja según fondo inicial + pagos en efectivo (con devoluciones netas) + movimientos.';

-- ---------- 3.1 reporte_x(turno_id) ----------
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
    'descuentos_manuales_mxn',    COALESCE(SUM(descuentos_manuales_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'promociones_mxn',            COALESCE(SUM(promociones_mxn)        FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
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
    'tipo', tipo,
    'cantidad', cantidad,
    'monto_total_mxn', monto_total
  ))
  INTO v_movimientos
  FROM (
    SELECT
      tipo,
      COUNT(*) AS cantidad,
      SUM(monto_mxn) AS monto_total
    FROM movimientos_caja
    WHERE turno_id = p_turno_id
    GROUP BY tipo
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
    'fondo_apertura_mxn', v_turno.fondo_inicial_mxn,
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

-- ---------- 4.4 obtener_reporte_z(turno_id) ----------
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

-- =====================================================================
-- 4. FUNCIÓN DE ESCRITURA reporte_z (§4.3)
-- =====================================================================

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

-- ---------------------------------------------------------------------
-- 4.3.bis Guardarraíl de escalabilidad del payload Z (D131) — solo nota.
-- ---------------------------------------------------------------------
-- D131 — El payload_completo del Z es siempre AGREGADO y acotado; nunca embebe
-- detalle por ticket. reporte_z() (vía reporte_x()) solo guarda agregados: pagos
-- por método, conteos/sumas de tickets, devoluciones por motivo, movimientos por
-- tipo, distribución de propinas por usuario. El tamaño del payload es O(1)
-- respecto al número de tickets, por lo que NO requiere paginación.
-- Regla para mantenedores: está PROHIBIDO embeber arreglos por ticket, por ítem
-- o por producto dentro de payload_completo. Esos detalles se sirven bajo demanda
-- y paginados desde las vistas analíticas (§7) o consultando tickets/ticket_items
-- directamente con LIMIT/OFFSET o keyset, NUNCA dentro del Z.
--  - Top-N por producto/mesero para la representación impresa del Z: se calcula
--    con ORDER BY ... LIMIT N sobre las vistas al imprimir, no se persiste.
--  - Detalle completo del turno en la UI de admin: consulta paginada a las
--    vistas/tablas, filtrada por turno_id.

-- =====================================================================
-- 5. FUNCIÓN arquear_caja (§5.2)
-- =====================================================================

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

-- =====================================================================
-- 6. VISTAS ANALÍTICAS
-- =====================================================================

-- ---------- 5.3 vw_resumen_corte_caja ----------
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

-- ---------- 6.1 vw_estado_resultados_dia ----------
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
  COALESCE(SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS descuentos_manuales_mxn,
  COALESCE(SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS promociones_mxn,

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
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio::text LIKE 'APP_%')             AS tickets_apps,

  -- ===== Ticket promedio =====
  COALESCE(AVG(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS ticket_promedio_mxn

FROM tickets t
WHERE t.deleted_at IS NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable;

COMMENT ON VIEW vw_estado_resultados_dia IS 'Estado de resultados por sucursal-día. KPIs principales para dashboard del dueño.';

-- ---------- 7.1 vw_ventas_por_categoria ----------
CREATE OR REPLACE VIEW vw_ventas_por_categoria AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.categoria_nombre_snapshot AS categoria,
  COUNT(DISTINCT t.id)         AS tickets_con_categoria,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(ti.subtotal_bruto_mxn)   AS subtotal_mxn,
  SUM(ti.iva_item_mxn)        AS iva_mxn,
  SUM(ti.total_item_mxn)      AS total_mxn,
  AVG(ti.precio_unitario_snapshot) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.categoria_nombre_snapshot IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.categoria_nombre_snapshot;

COMMENT ON VIEW vw_ventas_por_categoria IS 'Ventas por categoría/día. Usa snapshot del item, no la categoría actual (que pudo haberse renombrado).';

-- ---------- 7.2 vw_ventas_por_producto ----------
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
  SUM(ti.subtotal_bruto_mxn)   AS subtotal_mxn,
  SUM(ti.iva_item_mxn)        AS iva_mxn,
  SUM(ti.total_item_mxn)      AS total_mxn,
  AVG(ti.precio_unitario_snapshot) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         ti.producto_id, ti.producto_nombre_snapshot, ti.producto_sku_snapshot;

COMMENT ON VIEW vw_ventas_por_producto IS 'Ventas por producto/día. Top N se calcula con LIMIT + ORDER BY en consulta.';

-- ---------- 7.3 vw_ventas_por_area_cocina ----------
CREATE OR REPLACE VIEW vw_ventas_por_area_cocina AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.area_cocina_nombre_snapshot AS area_cocina,
  COUNT(DISTINCT t.id)           AS tickets_con_area,
  SUM(ti.cantidad)               AS unidades_preparadas,
  SUM(ti.total_item_mxn)        AS total_vendido_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.area_cocina_nombre_snapshot IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.area_cocina_nombre_snapshot;

COMMENT ON VIEW vw_ventas_por_area_cocina IS 'Ventas por área (Plancha, Fría, Bebidas, Postres) para calibrar carga.';

-- ---------- 7.4 vw_ventas_por_mesero ----------
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

-- ---------- 7.5 vw_ventas_por_modo_servicio ----------
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

-- ---------- 7.7 vw_descuentos_por_usuario ----------
CREATE OR REPLACE VIEW vw_descuentos_por_usuario AS
SELECT
  d.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  d.usuario_solicitante_id     AS usuario_id,
  u.email                      AS usuario_email,
  COUNT(*)                     AS cantidad_descuentos,
  SUM(d.monto_descontado_mxn)   AS total_descontado_mxn,
  AVG(d.monto_descontado_mxn)   AS descuento_promedio_mxn,

  -- Por motivo
  COUNT(*) FILTER (WHERE d.motivo_categoria = 'CORTESIA_INVITADO')        AS cortesia_count,
  COUNT(*) FILTER (WHERE d.motivo_categoria = 'PRODUCTO_DEFECTO_LEVE') AS defecto_count,
  COUNT(*) FILTER (WHERE d.motivo_categoria = 'CLIENTE_FRECUENTE')     AS vip_count,
  COUNT(*) FILTER (WHERE d.motivo_categoria = 'INCONVENIENCIA_OPERATIVA')    AS ajuste_count,
  COUNT(*) FILTER (WHERE d.motivo_categoria = 'OTRO')            AS otro_count

FROM ticket_descuentos_manuales d
JOIN tickets t ON t.id = d.ticket_id
LEFT JOIN auth.users u ON u.id = d.usuario_solicitante_id
WHERE d.reversado = false
GROUP BY d.tenant_id, t.sucursal_id, t.dia_contable,
         d.usuario_solicitante_id, u.email;

COMMENT ON VIEW vw_descuentos_por_usuario IS 'Auditoría: quién está aplicando descuentos, con qué motivo. Para detectar abusos.';

-- ---------- 7.8 vw_reimpresiones_por_cajero ----------
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

-- ---------- 8.1 vw_cumplimiento_tiempos_cocina ----------
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

-- ---------- 8.2 vw_cumplimiento_tiempos_cocina_agregado ----------
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

-- ---------- 8.3 vw_cumplimiento_tiempos_delivery ----------
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

-- ---------- 8.4 vw_cumplimiento_delivery_agregado ----------
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

-- ---------- 8.5 vw_no_shows_reservaciones ----------
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

-- ---------- 9.1 vw_efectivo_esperado_turno ----------
CREATE OR REPLACE VIEW vw_efectivo_esperado_turno AS
SELECT
  t.id                          AS turno_id,
  t.tenant_id,
  t.sucursal_id,
  t.caja_id,
  t.dia_contable,
  t.estado                      AS turno_estado,
  t.fondo_inicial_mxn,

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
    WHERE turno_id = t.id AND tipo = 'INYECCION_FONDO'
  ), 0) AS inyecciones_fondo_mxn,

  -- Retiros, depósitos, devoluciones efectivo (todos restan)
  COALESCE((
    SELECT SUM(monto_mxn) FROM movimientos_caja
    WHERE turno_id = t.id
      AND tipo IN ('SANGRIA', 'DEPOSITO',
                              'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR')
  ), 0) AS retiros_y_devoluciones_mxn,

  -- Ajustes
  COALESCE((
    SELECT SUM(CASE WHEN tipo = 'AJUSTE_POSITIVO' THEN monto_mxn
                    WHEN tipo = 'AJUSTE_NEGATIVO' THEN -monto_mxn
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
WHERE true;  -- turnos no tiene soft-delete

COMMENT ON VIEW vw_efectivo_esperado_turno IS 'Componentes del cálculo de efectivo esperado por turno. Permite trazabilidad fina.';

-- ---------- 9.2 vw_resumen_turno ----------
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
WHERE true;  -- turnos no tiene soft-delete

COMMENT ON VIEW vw_resumen_turno IS 'Vista consolidada del turno: tickets, devoluciones, cortes, Z. Para dashboard de admin.';

-- =====================================================================
-- 7. FUNCIONES HELPER QUE CONSUMEN VISTAS
-- =====================================================================

-- ---------- 6.2 estado_resultados_periodo ----------
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

-- ---------- 10.1 kpis_dia_sucursal ----------
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

-- ---------- 10.2 top_productos ----------
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

-- ---------- 10.3 top_meseros ----------
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

-- ---------- 10.4 detectar_descuentos_sospechosos ----------
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

-- ---------- 10.5 reporte_cancelaciones_periodo ----------
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

-- =====================================================================
-- 8. RLS DE TABLAS NUEVAS (§11.1)
-- =====================================================================

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

-- =====================================================================
-- 9. GRANTS (§11.3)
-- =====================================================================

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
