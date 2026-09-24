-- ============================================================================
-- 0118 — Lista de clientes paginada en el servidor (/admin/clientes).
--
-- La pantalla pedía `clientes` con .limit(200) y le cruzaba vw_clientes_resumen (0061) en el
-- navegador. Con el padrón subiendo de las cajas (0117) el tope se notó al día siguiente:
-- Knockout Burger tenía 222 clientes y el panel enseñaba 200, sin decir que faltaban. Y los
-- indicadores de arriba (total, con RFC, recurrentes, ticket promedio) salían de esas 200 filas.
--
-- Paginar en el servidor pide dos cosas que hoy no existen:
--
--   · vw_clientes_lista — los datos del cliente JUNTO con sus compras, en una sola relación. Así
--     PostgREST puede ordenar, filtrar (búsqueda, "Con RFC", "Recurrentes 3+") y cortar la página
--     en la base. vw_clientes_resumen no sirve: solo trae cifras, y cruzarla en el navegador
--     obliga a bajar el padrón entero.
--   · vw_clientes_kpis — una fila por tenant con los indicadores del padrón COMPLETO.
--
-- Las compras se calculan con un LATERAL por cliente (idx_tickets_cliente), con el mismo criterio
-- que 0061: tickets vivos, PAGADO o FACTURADO.
--
-- Migración ADITIVA: solo crea vistas de lectura. vw_clientes_resumen se queda como está.
--
-- RLS — security_invoker=on es obligatorio (lo exige supabase/tests/0002_rls_cobertura): sin él la
-- vista corre como su dueño y un tenant leería el padrón de los demás.
-- ============================================================================

CREATE OR REPLACE VIEW vw_clientes_lista WITH (security_invoker = on) AS
SELECT
  c.id,
  c.tenant_id,
  c.nombre,
  c.apellido_paterno,
  c.telefono,
  c.email,
  c.rfc,
  c.razon_social,
  c.codigo_postal_fiscal,
  c.tipo_fiscal,
  c.notas_internas,
  c.estado,
  c.created_at,
  COALESCE(r.compras, 0)          AS compras,
  COALESCE(r.gasto_total_mxn, 0)  AS gasto_total_mxn,
  r.ultima_visita
FROM clientes c
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int          AS compras,
         SUM(t.total_mxn)       AS gasto_total_mxn,
         MAX(t.fecha_pago)      AS ultima_visita
    FROM tickets t
   WHERE t.cliente_id = c.id
     AND t.tenant_id  = c.tenant_id
     AND t.deleted_at IS NULL
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
) r ON true
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW vw_clientes_lista IS
  'Lista de clientes con su comportamiento de compra, para paginar /admin/clientes en el servidor. Un cliente sin compras sale en ceros.';

CREATE OR REPLACE VIEW vw_clientes_kpis WITH (security_invoker = on) AS
SELECT
  tenant_id,
  COUNT(*)::int                                                          AS total,
  (COUNT(*) FILTER (WHERE NULLIF(btrim(rfc), '') IS NOT NULL))::int     AS con_rfc,
  (COUNT(*) FILTER (WHERE compras >= 3))::int                           AS recurrentes,
  SUM(compras)::int                                                      AS compras_totales,
  SUM(gasto_total_mxn)                                                   AS gasto_total_mxn
FROM vw_clientes_lista
GROUP BY tenant_id;

COMMENT ON VIEW vw_clientes_kpis IS
  'Indicadores del padrón completo por tenant (total, con RFC, recurrentes 3+, compras y gasto para el ticket promedio).';
