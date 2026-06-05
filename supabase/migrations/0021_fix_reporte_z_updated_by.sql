-- F5.4 fix #21 — reporte_z referenciaba turnos.updated_by, columna que NO existe
-- (turnos tiene updated_at, no updated_by). Cazado por smoke_cierre.sql (plpgsql no
-- valida el cuerpo hasta invocarse; mismo patrón que #19/#20 de la capa de venta).
-- Cambio único: en el UPDATE turnos al cerrar, updated_by → updated_at = now().

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

  IF v_turno.estado = 'CERRADO' THEN
    RAISE EXCEPTION 'Turno ya está CERRADO pero no tiene Z. Estado inconsistente; contacta soporte.';
  END IF;

  IF p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Reporte Z requiere autorización (autorizacion_pin_id no puede ser NULL)';
  END IF;

  -- ===== Generar payload =====
  v_payload := reporte_x(p_turno_id);

  v_efectivo_esperado := (v_payload->>'efectivo_esperado_mxn')::numeric;
  v_diferencia := p_efectivo_declarado_mxn - v_efectivo_esperado;

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

  -- ===== Cerrar turno =====
  UPDATE turnos
  SET estado     = 'CERRADO',
      fecha_cierre = now(),
      usuario_cierre_id = p_cerrado_por_usuario_id,
      updated_at = now()                       -- FIX: era updated_by (columna inexistente)
  WHERE id = p_turno_id;

  -- Capturar distribuciones de propinas calculadas
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

  -- ===== Insertar el Z (folio_z lo asigna el trigger trg_reportes_z_folio) =====
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

COMMENT ON FUNCTION reporte_z IS 'Cierra turno con Z. Idempotente. Inmutable post-creación. (#21: updated_by→updated_at)';

-- #22 — trg_reporte_z_audit usaba categoria 'CIERRES', valor inexistente en el enum
-- evento_categoria (válidos: AUTENTICACION/TURNO/CAJA/VENTA/COBRO/DESCUENTO/COCINA/…).
-- El cierre Z es un evento de TURNO. Cambio único: 'CIERRES' → 'TURNO'.
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
      NEW.cerrado_por_usuario_id, 'TURNO', 'reporte_z.generado',
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
