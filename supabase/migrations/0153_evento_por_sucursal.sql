-- ============================================================================
-- 0153 — Ventas por evento, por sucursal.
--
-- El panel y los reportes del admin ahora se miran por sucursal (una por defecto, "Todas" a
-- elección). Todas las vistas de reportes ya traían sucursal_id salvo esta: agrupaba por evento
-- sumando los turnos de cualquier sucursal, así que el reporte no se podía acotar.
--
-- Se agrega sucursal_id al FINAL (CREATE OR REPLACE VIEW solo admite columnas nuevas al final) y se
-- agrupa también por ella. Con "Todas las sucursales" el admin vuelve a juntar por evento, así que
-- lo que se veía antes no cambia.
--
-- (0152 queda para la rama de menú por sucursal, que hoy choca con 0151 de main.)
-- ============================================================================

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
  COALESCE(sum(v.total), 0) - COALESCE(sum(tu.evento_comision_mxn), 0) AS neto_mxn,
  tu.sucursal_id
FROM turnos tu
LEFT JOIN LATERAL (
  SELECT count(*) AS tickets, sum(t.total_mxn) AS total, sum(t.propina_mxn) AS propinas
  FROM tickets t
  WHERE t.turno_id = tu.id AND t.deleted_at IS NULL
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
) v ON true
WHERE tu.evento_nombre IS NOT NULL
GROUP BY tu.tenant_id, tu.evento_nombre, tu.sucursal_id;
