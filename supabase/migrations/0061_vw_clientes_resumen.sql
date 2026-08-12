-- ============================================================================
-- 0061 — vw_clientes_resumen: comportamiento de compra por cliente.
--
-- El P-151 (lista de clientes) muestra Compras / Gasto total / Última visita y los KPIs
-- "Recurrentes (3+ visitas)" y "Ticket promedio", pero la tabla `clientes` solo guarda datos
-- de contacto y fiscales: esas cifras no existían en ninguna parte y la pantalla mostraba
-- RFC/Estado en su lugar. Esta vista las deriva de los tickets ya pagados.
--
-- Migración ADITIVA (regla del proyecto: una migración aplicada en remoto no se edita).
-- Solo crea una vista de lectura; no toca tablas ni datos.
--
-- RLS — `security_invoker=on` NO ES OPCIONAL: sin él la vista se ejecuta con los permisos de su
-- dueño (superusuario) y SALTA las políticas de las tablas base, con lo que un tenant podría leer
-- los clientes y el gasto de todos los demás. Con security_invoker corre como quien consulta, así
-- que aplica el RLS de `clientes` y `tickets` y cada tenant ve solo lo suyo. Todas las vistas
-- vw_* del proyecto lo llevan; esta debe seguir la misma regla.
-- ============================================================================

CREATE OR REPLACE VIEW vw_clientes_resumen WITH (security_invoker = on) AS
SELECT
  c.tenant_id,
  c.id                                   AS cliente_id,
  COUNT(t.id)                            AS compras,
  COALESCE(SUM(t.total_mxn), 0)          AS gasto_total_mxn,
  -- Ticket promedio del cliente. COUNT>0 se garantiza con el NULLIF para no dividir entre 0
  -- en clientes registrados que todavía no compran (alta por facturación, p. ej.).
  COALESCE(SUM(t.total_mxn) / NULLIF(COUNT(t.id), 0), 0) AS ticket_promedio_mxn,
  MAX(t.fecha_pago)                      AS ultima_visita
FROM clientes c
LEFT JOIN tickets t
       ON t.cliente_id = c.id
      AND t.tenant_id  = c.tenant_id
      AND t.deleted_at IS NULL
      AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
WHERE c.deleted_at IS NULL
GROUP BY c.tenant_id, c.id;

COMMENT ON VIEW vw_clientes_resumen IS
  'Comportamiento de compra por cliente (P-151): número de compras, gasto total, ticket promedio y última visita. LEFT JOIN: un cliente sin compras aparece en 0, no se pierde de la lista.';
