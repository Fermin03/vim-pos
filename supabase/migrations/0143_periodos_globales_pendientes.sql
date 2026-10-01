-- ============================================================================
-- 0143 — Qué periodos de factura global faltan por emitir.
--
-- La factura global se emite A MANO (decisión del 30 sep 2026: no hay global automática por
-- ahora). El sitio decía lo contrario y se corrigió; lo que faltaba en el producto era que el dueño
-- se enterara de que hay un periodo cerrado sin amparar antes de que se le pase el plazo del SAT.
--
-- El panel solo enseñaba EL periodo anterior al vigente. Si al dueño se le pasó uno —o dos— no
-- había dónde verlo. Esta función contesta "¿qué periodos cerrados tienen ventas sin factura?" y
-- de ella salen el aviso del dashboard, el de Facturación y un botón Emitir por periodo.
--
-- NO REPITE REGLAS, las reúne:
--   · qué ticket falta por amparar  → `tickets_de_periodo_global` (0082)
--   · a qué periodo pertenece       → `periodo_global_de` (0082)
-- Si mañana cambia qué cuenta como "pendiente", cambia en un solo lugar.
--
-- `p_hoy` LO MANDA QUIEN LLAMA, en hora de México (`hoyMx()`): el servidor corre en UTC y de 18:00
-- a 23:59 su CURRENT_DATE ya es mañana, con lo que el periodo de hoy saldría como "cerrado".
--
-- Se excluyen los periodos TIMBRADA y EN_PROCESO: `cfdi_tomar_periodo_global` no deja volver a
-- tomarlos, así que avisar de ellos sería un aviso que no se puede atender. (Una venta que llega
-- tarde a un periodo ya timbrado —una caja que sincronizó después— queda fuera de este aviso; es
-- un caso conocido y aparte.) ERROR sí cuenta: se puede reintentar.
--
-- SECURITY INVOKER: corre con el RLS de quien pregunta, igual que las dos funciones que usa.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.periodos_globales_pendientes(
  p_tenant_id  uuid,
  p_hoy        date,
  p_dias_atras integer DEFAULT 92
)
RETURNS TABLE (desde date, hasta date, n_tickets integer, total_mxn numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH cfg AS (
    SELECT COALESCE(
      (SELECT e.periodicidad_global FROM tenant_cfdi_emisor e WHERE e.tenant_id = p_tenant_id),
      '04'
    )::varchar AS per
  ),
  vigente AS (
    SELECT v.desde FROM cfg, periodo_global_de(cfg.per, p_hoy) v
  ),
  -- La ventana empieza en el INICIO del periodo que contiene la fecha límite: si empezara a media
  -- quincena, el periodo más viejo saldría con la mitad de sus ventas.
  ventana AS (
    SELECT i.desde AS inicio, (vigente.desde - 1) AS fin
      FROM cfg, vigente,
           periodo_global_de(cfg.per, vigente.desde - GREATEST(COALESCE(p_dias_atras, 92), 1)) i
  ),
  pendientes AS (
    SELECT t.dia_contable, x.total_mxn
      FROM ventana,
           tickets_de_periodo_global(p_tenant_id, ventana.inicio, ventana.fin) x
      JOIN tickets t ON t.id = x.ticket_id
  )
  SELECT p.desde, p.hasta, count(*)::integer, COALESCE(sum(pendientes.total_mxn), 0)::numeric
    FROM pendientes, cfg, periodo_global_de(cfg.per, pendientes.dia_contable) p
   WHERE NOT EXISTS (
           SELECT 1 FROM cfdi_periodos_globales g
            WHERE g.tenant_id = p_tenant_id
              AND g.desde = p.desde AND g.hasta = p.hasta
              AND g.estado IN ('TIMBRADA', 'EN_PROCESO')
         )
   GROUP BY p.desde, p.hasta
   ORDER BY p.desde;
$$;

COMMENT ON FUNCTION public.periodos_globales_pendientes(uuid, date, integer) IS
  'Periodos de factura global ya cerrados (anteriores al que contiene p_hoy) con ventas pagadas sin amparar. p_hoy va en hora de México.';

REVOKE ALL ON FUNCTION public.periodos_globales_pendientes(uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.periodos_globales_pendientes(uuid, date, integer) TO authenticated, service_role;
