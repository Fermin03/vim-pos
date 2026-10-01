-- ============================================================================
-- 0149 — El ticket del cliente tiene su propio sello de impresión.
--
-- QUÉ PASABA
--
-- `tickets.comanda_impresa_at` servía para dos cosas distintas:
--
--   · la COMANDA salió a cocina: lo sella `trg_comanda_imp_actualizar_ticket` (0009) cada vez
--     que `imprimir_comanda` registra una IMPRESION_INICIAL;
--   · el TICKET DEL CLIENTE ya se imprimió: lo sellaba la caja al pulsar "Imprimir ticket" en un
--     domicilio, y la pantalla de cuentas lo leía para ofrecer "Reimprimir" con PIN de supervisor.
--
-- Mientras la caja no registraba sus comandas no se notaba. Desde la 0126 (escritorio 0.4.93) sí
-- las registra, así que TODA cuenta mandada a cocina nacía con el sello puesto: en Domicilio el
-- botón decía "Reimprimir" y pedía PIN desde la primera vez, sin que el ticket hubiera salido
-- nunca; en Pick-up y Comedor la tarjeta se pintaba como "ya salió" recién capturada.
--
-- QUÉ CAMBIA
--
-- `ticket_impreso_at`: solo el ticket del cliente. `comanda_impresa_at` vuelve a significar lo
-- que dice su nombre y nada más. La caja sella con `marcar_ticket_impreso` — una RPC y no un
-- UPDATE directo, para no abrirle otra columna a la lista blanca del guardián de la 0133.
--
-- No se rellena hacia atrás: en las cuentas abiertas hoy no hay forma de saber cuál de los dos
-- significados puso el sello viejo. Lo peor que pasa es una impresión sin PIN de una cuenta que
-- ya se había impreso.
-- ============================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_impreso_at timestamptz NULL;

COMMENT ON COLUMN tickets.ticket_impreso_at IS
  'Primera impresión del ticket del CLIENTE desde la pantalla de cuentas (0149). Distinto de comanda_impresa_at, que es la comanda de cocina.';
COMMENT ON COLUMN tickets.comanda_impresa_at IS
  'Primera impresión de la COMANDA de cocina (la sella imprimir_comanda). No dice nada del ticket del cliente: eso es ticket_impreso_at (0149).';

-- SECURITY INVOKER: quién puede tocar el ticket lo sigue decidiendo el RLS de `tickets`.
CREATE OR REPLACE FUNCTION public.marcar_ticket_impreso(p_ticket_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE tickets
     SET ticket_impreso_at = now()
   WHERE id = p_ticket_id
     AND ticket_impreso_at IS NULL;
$$;

COMMENT ON FUNCTION public.marcar_ticket_impreso(uuid) IS
  'Sella la primera impresión del ticket del cliente (0149). Idempotente: no mueve un sello ya puesto.';

REVOKE EXECUTE ON FUNCTION public.marcar_ticket_impreso(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_ticket_impreso(uuid) TO authenticated, service_role;
