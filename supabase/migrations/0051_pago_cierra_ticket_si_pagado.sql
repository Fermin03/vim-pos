-- 0051 — Fase 3: finalización de pago offline.
-- El flip ABIERTO→PAGADO vivía SOLO dentro del RPC aplicar_pago (PERFORM cerrar_ticket_si_pagado).
-- Una venta hecha offline se sincroniza insertando el pago crudo (sync_aplicar_operacion), que
-- NO pasa por aplicar_pago → el ticket quedaba ABIERTO totalmente pagado.
--
-- Solución: un trigger AFTER INSERT en pagos que llama a la MISMA función de finalización
-- (cerrar_ticket_si_pagado). Cubre AMBOS caminos sin divergencia:
--   • online  → aplicar_pago ya la llama; este trigger la corre antes y su PERFORM queda no-op.
--   • offline → el insert por sync dispara el trigger y finaliza el ticket.
-- La función es idempotente (solo flipa ABIERTO con monto_pendiente<=0.01; si no, no-op), así que
-- ejecutarla de más es inofensivo.
--
-- Orden: se nombra 'zz' para correr DESPUÉS de trg_pagos_recalc (que actualiza monto_pendiente).

CREATE OR REPLACE FUNCTION public.trg_pago_cerrar_ticket_si_pagado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  PERFORM cerrar_ticket_si_pagado(NEW.ticket_id);
  RETURN NULL; -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS trg_pagos_zz_cerrar_si_pagado ON pagos;
CREATE TRIGGER trg_pagos_zz_cerrar_si_pagado
  AFTER INSERT ON pagos
  FOR EACH ROW
  EXECUTE FUNCTION trg_pago_cerrar_ticket_si_pagado();

COMMENT ON FUNCTION public.trg_pago_cerrar_ticket_si_pagado IS
  'Fase 3: finaliza el ticket a PAGADO al insertar un pago que lo salda. Idempotente; cubre pago online (aplicar_pago) y offline (sync_aplicar_operacion).';
