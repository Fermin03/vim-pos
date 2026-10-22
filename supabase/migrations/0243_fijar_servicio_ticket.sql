-- 0243 · Comida rápida: fijar «para llevar / comer aquí» (y el nombre) en una cuenta ya guardada.
-- El UPDATE directo a tickets.modo_servicio lo rechaza guardia_escritura_directa (0133): esa
-- columna no está en la lista blanca, y no debe estarlo (un cliente podría pasar una cuenta a
-- cualquier modo). Esta RPC solo permite el cambio PARA_LLEVAR ↔ COMER_AQUI con la cuenta ABIERTA.
-- SECURITY INVOKER: corre bajo el RLS de tickets (solo el negocio de quien llama); el chequeo de
-- negocio explícito da el mismo mensaje para "no existe" y "es de otro negocio".
CREATE OR REPLACE FUNCTION public.fijar_servicio_ticket(p_ticket_id uuid, p_modo modo_servicio, p_nombre text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket record;
BEGIN
  IF p_modo NOT IN ('PARA_LLEVAR', 'COMER_AQUI') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo PARA_LLEVAR o COMER_AQUI (recibido: %)', p_modo USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id, estado_fiscal, modo_servicio INTO v_ticket
  FROM tickets WHERE id = p_ticket_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_ticket.tenant_id IS DISTINCT FROM current_tenant_id() THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket.estado_fiscal <> 'ABIERTO' THEN
    RAISE EXCEPTION 'La cuenta ya no está abierta (estado actual: %)', v_ticket.estado_fiscal;
  END IF;
  IF v_ticket.modo_servicio NOT IN ('PARA_LLEVAR', 'COMER_AQUI') THEN
    RAISE EXCEPTION 'Esta cuenta es %: no se cambia a %', v_ticket.modo_servicio, p_modo;
  END IF;

  UPDATE tickets
     SET modo_servicio = p_modo,
         nombre_cliente = nullif(left(btrim(coalesce(p_nombre, '')), 100), ''),
         updated_at = now()
   WHERE id = p_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fijar_servicio_ticket(uuid, modo_servicio, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fijar_servicio_ticket(uuid, modo_servicio, text) TO authenticated, service_role;
