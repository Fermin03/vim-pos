-- ============================================================================
-- 0110 — Índices para el espejo de pedidos de apps (optimización 2026-09-09).
--
-- POR QUÉ. `delivery-espejo` es, de lejos, lo que más veces se llama en toda la nube: la caja de
-- escritorio sondeaba cada 10 s, 8 640 veces al día, cada caja. Y su consulta de pedidos era
--
--     WHERE tenant_id = … AND sucursal_id = … AND (estado IN (activos) OR recibido_at >= 24h)
--
-- Ese OR no lo cubre ningún índice: el único que había es PARCIAL sobre los cuatro estados
-- activos (0090), y las filas de la segunda rama quedan fuera de él. O sea, recorrido completo de
-- `delivery_pedidos` —tabla común a TODOS los clientes, que solo crece porque la retención (0095)
-- anonimiza pero no borra— seis veces por minuto por caja. Con un cliente no se nota. Con
-- cincuenta y un año de historia, es la pared: deja de aguantar un martes cualquiera, sin que
-- nadie haya dado de alta un cliente nuevo ese día.
--
-- La función ahora hace tres consultas con un solo filtro de rango cada una, sin OR:
--   1) pedidos vivos      → estado IN (los cuatro activos)  → índice parcial de 0090
--   2) delta              → updated_at >= <cursor>          → idx_delivery_pedidos_suc_updated
--   3) arranque en frío   → recibido_at >= now() - 24h      → idx_delivery_pedidos_suc_recibido
--
-- Sin CONCURRENTLY a propósito: el CLI corre cada migración dentro de una transacción y
-- CONCURRENTLY no puede vivir ahí. Hoy la tabla es chica (piloto); si alguna vez hay que
-- recrearlos con la tabla grande, se hace a mano y fuera de transacción.
--
-- CÓMO COMPROBARLO (con datos de verdad, no en vacío — el planner elige recorrido completo
-- cuando la tabla cabe en una página y eso no prueba nada):
--   EXPLAIN ANALYZE SELECT id FROM delivery_pedidos
--    WHERE tenant_id = '…' AND sucursal_id = '…' AND updated_at >= now() - interval '1 minute'
--    ORDER BY recibido_at DESC LIMIT 200;
--   Debe decir Index Scan / Bitmap Index Scan, nunca Seq Scan.
-- ============================================================================

-- El camino caliente: "¿qué cambió en esta sucursal desde que pregunté?". Es el que corre en
-- casi todas las vueltas.
CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_suc_updated
  ON delivery_pedidos(sucursal_id, updated_at DESC);
COMMENT ON INDEX idx_delivery_pedidos_suc_updated IS
  'Delta del espejo: pedidos de la sucursal cambiados desde el cursor de la caja (delivery-espejo).';

-- El arranque en frío: la caja acaba de encender y no tiene cursor, así que pide la ventana de
-- 24 h completa. Pasa una vez por arranque, no cada vuelta.
CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_suc_recibido
  ON delivery_pedidos(sucursal_id, recibido_at DESC);
COMMENT ON INDEX idx_delivery_pedidos_suc_recibido IS
  'Arranque en frío del espejo: ventana de 24 h de la sucursal cuando la caja todavía no tiene cursor.';
