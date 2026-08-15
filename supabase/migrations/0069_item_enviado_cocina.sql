-- ============================================================================
-- 0069 — `ticket_items.enviado_cocina_at`: qué renglones ya se mandaron a cocina.
--
-- El envío a cocina se marcaba solo en el TICKET (`tickets.estado_cocina`), que es un
-- interruptor de una sola vía: en cuanto pasaba a EN_COCINA, el botón "Enviar a cocina" se
-- apagaba para siempre. Si el cliente pedía algo más —lo normal en comedor y muy común en
-- domicilio por teléfono— los renglones nuevos se quedaban sin mandar y sin comanda.
--
-- Reenviar el ticket completo tampoco sirve: la cocina recibiría otra vez lo que ya está
-- preparando y volvería a hacerlo. Hace falta saber, renglón por renglón, qué ya salió; así la
-- segunda comanda lleva ÚNICAMENTE lo agregado.
--
-- Los renglones existentes se dan por enviados: son de cuentas ya en curso y marcarlos como
-- pendientes haría que la próxima comanda repitiera pedidos que la cocina ya preparó.
--
-- Migración ADITIVA e idempotente. El backfill se limita a los tickets ya enviados y, como el
-- ADD COLUMN es IF NOT EXISTS, correrla de nuevo no vuelve a tocar nada (los renglones nuevos
-- de tickets EN_COCINA que estuvieran pendientes se quedarían sin comanda, así que el UPDATE
-- se ata a la creación de la columna).
-- ============================================================================

DO $$
DECLARE
  v_nueva boolean;
BEGIN
  v_nueva := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ticket_items' AND column_name = 'enviado_cocina_at'
  );

  ALTER TABLE public.ticket_items ADD COLUMN IF NOT EXISTS enviado_cocina_at timestamptz NULL;

  IF v_nueva THEN
    UPDATE public.ticket_items i
       SET enviado_cocina_at = COALESCE(t.updated_at, t.created_at, now())
      FROM public.tickets t
     WHERE t.id = i.ticket_id
       AND t.estado_cocina IS DISTINCT FROM 'SIN_ENVIAR';
  END IF;
END $$;

-- Buscar pendientes de un ticket es la consulta que decide si el botón "Enviar a cocina" se
-- habilita; corre cada vez que se abre una cuenta o se agrega un producto.
CREATE INDEX IF NOT EXISTS idx_ticket_items_pendientes_cocina
  ON public.ticket_items (ticket_id)
  WHERE enviado_cocina_at IS NULL AND cancelado = false;

COMMENT ON COLUMN public.ticket_items.enviado_cocina_at IS
  'Cuándo se mandó ESTE renglón a cocina. NULL = pendiente; la comanda solo imprime los pendientes.';
