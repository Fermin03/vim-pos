-- 0157 · Lealtad en el corte (ADR 0030, plan 1B).
--
-- reporte_x arma el objeto `tickets` del corte X; reporte_z no calcula nada, congela ese mismo objeto
-- en reportes_z_historico.payload_completo. Hasta hoy no conocía tickets.lealtad_mxn (0156): un turno
-- con canjes mostraba la venta neta ya rebajada sin decir por qué. Aquí gana la clave `lealtad_mxn`,
-- hermana de descuentos_manuales_mxn y promociones_mxn.
--
-- Cuerpo copiado ÍNTEGRO de 0011_reportes_cierres.sql:295-414 (única definición vigente). El único
-- cambio es la línea marcada con «0157». Un corte Z ya emitido no gana la clave: quien la lea usa 0.
-- Corre también en el Postgres de cada caja: solo redefine una función de lectura.

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
    'lealtad_mxn',                COALESCE(SUM(lealtad_mxn)            FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),  -- 0157
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

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn.';
