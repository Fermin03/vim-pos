-- 0049 — B3 Foodtruck: eventos como contexto del turno (doc FLUJOS-FOODTRUCK §4).
-- El turno puede etiquetarse con un evento (feria/festival/privado) para reportear
-- ventas POR EVENTO y registrar la comisión del organizador al cierre.

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS evento_nombre       varchar(150) NULL,
  ADD COLUMN IF NOT EXISTS evento_tipo         varchar(30)  NULL,
  ADD COLUMN IF NOT EXISTS evento_comision_mxn numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS evento_notas        text NULL;

COMMENT ON COLUMN turnos.evento_nombre IS 'Etiqueta de evento/ubicación del turno (Foodtruck §4). NULL = operación normal.';
COMMENT ON COLUMN turnos.evento_comision_mxn IS 'Comisión pagada al organizador, capturada al cerrar el turno.';

ALTER TABLE turnos ADD CONSTRAINT evento_tipo_valido CHECK (
  evento_tipo IS NULL OR evento_tipo IN ('FERIA','FESTIVAL','CONCIERTO','PRIVADO','CORPORATIVO','OTRO')
);

CREATE INDEX IF NOT EXISTS idx_turnos_evento ON turnos(tenant_id, evento_nombre)
  WHERE evento_nombre IS NOT NULL;

-- Reporte por evento: ¿valió la pena la feria? Ventas, tickets y comisión por evento.
CREATE OR REPLACE VIEW vw_ventas_por_evento
WITH (security_invoker = on) AS
SELECT
  tu.tenant_id,
  tu.evento_nombre,
  max(tu.evento_tipo)                          AS evento_tipo,
  count(*)                                     AS turnos,
  min(tu.dia_contable)                         AS primer_dia,
  max(tu.dia_contable)                         AS ultimo_dia,
  COALESCE(sum(v.tickets), 0)                  AS tickets,
  COALESCE(sum(v.total), 0)                    AS total_vendido_mxn,
  COALESCE(sum(v.propinas), 0)                 AS propinas_mxn,
  COALESCE(sum(tu.evento_comision_mxn), 0)     AS comision_mxn,
  COALESCE(sum(v.total), 0) - COALESCE(sum(tu.evento_comision_mxn), 0) AS neto_mxn
FROM turnos tu
LEFT JOIN LATERAL (
  SELECT count(*) AS tickets, sum(t.total_mxn) AS total, sum(t.propina_mxn) AS propinas
  FROM tickets t
  WHERE t.turno_id = tu.id AND t.deleted_at IS NULL
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
) v ON true
WHERE tu.evento_nombre IS NOT NULL
GROUP BY tu.tenant_id, tu.evento_nombre;

COMMENT ON VIEW vw_ventas_por_evento IS 'B3 Foodtruck: ventas agregadas por evento (turnos etiquetados). security_invoker → RLS del consultante.';
