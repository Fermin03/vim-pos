-- 0050 — B4 Café/Bar: alertas de cuentas prolongadas (Flujos C&B §5).
-- Añade minutos_sin_movimiento a vw_mesas_estado_actual (tiempo desde el último ítem
-- agregado al ticket activo) para la alerta "cuenta sin movimiento >1h".
-- CREATE OR REPLACE con la columna nueva AL FINAL (requisito de Postgres para vistas).

CREATE OR REPLACE VIEW vw_mesas_estado_actual
WITH (security_invoker = on) AS
SELECT m.id AS mesa_id,
   m.tenant_id,
   m.sucursal_id,
   m.numero AS mesa_numero,
   m.capacidad,
   m.seccion_id,
   s.nombre AS seccion_nombre,
   m.estado AS mesa_estado,
   m.posicion_x,
   m.posicion_y,
   m.forma,
   tm.ticket_id AS ticket_activo_id,
   t.folio_completo AS ticket_folio,
   t.fecha_apertura AS ticket_fecha_apertura,
   t.fecha_primer_item AS ticket_fecha_primer_item,
   t.total_mxn AS ticket_total_mxn,
   t.mesero_id AS ticket_mesero_id,
   (up_mesero.nombre)::character varying(255) AS mesero_email,
       CASE
           WHEN (t.fecha_apertura IS NOT NULL) THEN ((EXTRACT(epoch FROM (now() - t.fecha_apertura)))::integer / 60)
           ELSE NULL::integer
       END AS minutos_ocupada,
   m.reservacion_actual_id,
       CASE
           WHEN ult.ultimo_item IS NOT NULL THEN ((EXTRACT(epoch FROM (now() - ult.ultimo_item)))::integer / 60)
           WHEN (t.fecha_apertura IS NOT NULL) THEN ((EXTRACT(epoch FROM (now() - t.fecha_apertura)))::integer / 60)
           ELSE NULL::integer
       END AS minutos_sin_movimiento
  FROM ((((mesas m
    LEFT JOIN secciones s ON ((s.id = m.seccion_id)))
    LEFT JOIN tickets_mesas tm ON (((tm.mesa_id = m.id) AND (tm.fecha_liberacion IS NULL))))
    LEFT JOIN tickets t ON (((t.id = tm.ticket_id) AND (t.estado_fiscal = ANY (ARRAY['BORRADOR'::ticket_estado_fiscal, 'ABIERTO'::ticket_estado_fiscal])))))
    LEFT JOIN usuarios_perfil up_mesero ON ((up_mesero.id = t.mesero_id)))
  LEFT JOIN LATERAL (
    SELECT max(ti.created_at) AS ultimo_item
    FROM ticket_items ti
    WHERE ti.ticket_id = t.id AND ti.cancelado = false
  ) ult ON true
 WHERE ((m.deleted_at IS NULL) AND (m.activa = true));

COMMENT ON VIEW vw_mesas_estado_actual IS 'Estado vivo de mesas. 0050 añade minutos_sin_movimiento (B4 Café/Bar §5: alertas de cuentas prolongadas).';
