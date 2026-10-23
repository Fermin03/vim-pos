-- 0262 · Domicilio: cambiar a quién y a dónde se entrega una cuenta ya abierta.
-- La cajera corrige la dirección, elige otra del mismo cliente o pasa el pedido a otro cliente
-- desde la lista de Domicilio. Cliente, dirección y envío cambian en UNA transacción: por REST
-- serían dos pasos (PATCH a tickets y fijar_envio_ticket) y un fallo a la mitad dejaría la
-- dirección nueva con el envío de la zona vieja.
-- Reglas, todas aquí y no solo en la caja:
--   · cuenta ABIERTA (o BORRADOR) y a domicilio propio;
--   · la dirección es del cliente y de este negocio, y está vigente;
--   · el CLIENTE no cambia si la cuenta tiene un canje de lealtad (el descuento salió del saldo de
--     ese cliente) ni si nació de la tienda en línea o de una app (API_EXTERNA): el pedido es de
--     quien lo hizo; ahí solo se corrige su dirección;
--   · el envío sigue a la zona de la dirección nueva. Sin zona en la dirección, el envío no se toca.
-- SECURITY INVOKER: corre bajo el RLS de tickets, clientes y direcciones_cliente.
CREATE OR REPLACE FUNCTION public.cambiar_entrega_ticket(p_ticket_id uuid, p_cliente_id uuid, p_direccion_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket record;
  v_zona   uuid;
BEGIN
  SELECT tenant_id, estado_fiscal, modo_servicio, origen_creacion, cliente_id, zona_envio_id INTO v_ticket
  FROM tickets WHERE id = p_ticket_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_ticket.tenant_id IS DISTINCT FROM current_tenant_id() THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'La cuenta ya no está abierta (estado actual: %)', v_ticket.estado_fiscal;
  END IF;
  IF v_ticket.modo_servicio <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'Solo los pedidos a domicilio llevan dirección de entrega (modo actual: %)', v_ticket.modo_servicio;
  END IF;

  SELECT d.zona_envio_id INTO v_zona
  FROM direcciones_cliente d
  JOIN clientes c ON c.id = d.cliente_id
  WHERE d.id = p_direccion_id
    AND d.cliente_id = p_cliente_id
    AND d.tenant_id = v_ticket.tenant_id
    AND c.tenant_id = v_ticket.tenant_id
    AND d.deleted_at IS NULL
    AND d.activa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La dirección no existe o no es de ese cliente';
  END IF;

  IF p_cliente_id IS DISTINCT FROM v_ticket.cliente_id THEN
    IF v_ticket.origen_creacion = 'API_EXTERNA' THEN
      RAISE EXCEPTION 'Este pedido llegó en línea: no se cambia de cliente, solo se corrige su dirección';
    END IF;
    IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE ticket_id = p_ticket_id AND NOT revertido) THEN
      RAISE EXCEPTION 'Esta cuenta tiene un canje de lealtad. Quita el canje antes de cambiar al cliente.';
    END IF;
  END IF;

  UPDATE tickets
     SET cliente_id = p_cliente_id,
         direccion_entrega_id = p_direccion_id,
         updated_at = now()
   WHERE id = p_ticket_id;

  IF v_zona IS NOT NULL AND v_zona IS DISTINCT FROM v_ticket.zona_envio_id THEN
    PERFORM fijar_envio_ticket(p_ticket_id, v_zona);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cambiar_entrega_ticket(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_entrega_ticket(uuid, uuid, uuid) TO authenticated, service_role;
