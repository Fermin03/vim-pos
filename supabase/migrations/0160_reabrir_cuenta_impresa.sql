-- ============================================================================
-- 0160 — Reabrir una cuenta cuyo ticket ya se imprimió.
--
-- QUÉ PASABA
--
-- Imprimir el ticket del cliente (la cuenta que se le lleva a la mesa, o la que se va con el
-- repartidor) no cerraba nada: a esa misma cuenta se le podían seguir agregando productos,
-- aplicando descuentos o cancelando renglones, y lo cobrado dejaba de coincidir con el papel
-- que el cliente tenía en la mano.
--
-- QUÉ CAMBIA
--
-- La caja trata `ticket_impreso_at` (0149) como candado: con el sello puesto no ofrece agregar,
-- descontar, canjear ni cancelar. Para volver a tocar la cuenta hay que REABRIRLA, que es esta
-- función: quita el sello y exige la autorización de un supervisor.
--
-- El permiso es el mismo de reimprimir (`venta.reimprimir_ticket`, 0067), a propósito: reabrir
-- deja la siguiente impresión como "primera" —sin PIN—, así que quien puede reabrir puede, de
-- hecho, reimprimir. Con un permiso más laxo, reabrir sería la puerta de atrás del otro.
--
-- La autorización se valida y se quema con `consumir_autorizacion` (0134): del mismo negocio,
-- para ESTE ticket, pedida por quien la usa, fresca y de un solo uso. Queda en
-- `autorizaciones_pin` con accion = 'reabrir_cuenta_impresa': ese es el rastro de quién reabrió.
--
-- Solo cuentas vivas (BORRADOR/ABIERTO). Una cobrada se reabre por `reabrir_ticket_pagado`.
--
-- El candado vive en la caja, no en la base: `agregar_item_a_ticket` y compañía no miran el
-- sello. Es un control de operación (que el cajero no cambie por descuido lo ya impreso), no una
-- frontera de seguridad.
-- ============================================================================

-- SECURITY INVOKER: quién puede tocar el ticket lo sigue decidiendo el RLS de `tickets`.
CREATE OR REPLACE FUNCTION public.reabrir_cuenta_impresa(
  p_ticket_id           uuid,
  p_autorizacion_pin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe.';
  END IF;
  IF v_ticket.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Esta cuenta ya no está abierta.';
  END IF;
  -- Ya está reabierta (otra caja se adelantó): no hay nada que hacer, y no se quema el PIN.
  IF v_ticket.ticket_impreso_at IS NULL THEN
    RETURN;
  END IF;

  PERFORM consumir_autorizacion(
    p_autorizacion_pin_id, ARRAY['venta.reimprimir_ticket'], p_ticket_id, NULL,
    p_tenant => v_ticket.tenant_id);

  UPDATE tickets SET ticket_impreso_at = NULL WHERE id = p_ticket_id;
END;
$$;

COMMENT ON FUNCTION public.reabrir_cuenta_impresa(uuid, uuid) IS
  'Quita el sello de ticket impreso de una cuenta abierta para poder modificarla otra vez (0160). Exige autorización con venta.reimprimir_ticket.';

REVOKE EXECUTE ON FUNCTION public.reabrir_cuenta_impresa(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reabrir_cuenta_impresa(uuid, uuid) TO authenticated, service_role;
