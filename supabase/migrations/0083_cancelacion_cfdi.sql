-- ============================================================================
-- 0083 — Cancelación de CFDI (fase 8).
--
-- El modelo ya contemplaba casi todo desde 0009: el enum tiene EN_PROCESO_CANCELACION, CANCELADO y
-- CANCELACION_RECHAZADA, `cfdi_sat_movimientos` tiene los eventos y `acuse_xml_storage_path` está
-- esperando. Faltaba el motivo, las transiciones que no eran la confirmada, y lo que pasa con los
-- tickets cuando se cancela una GLOBAL.
--
-- POR QUÉ LA CANCELACIÓN NO ES INSTANTÁNEA
--
-- Desde 2022 el SAT exige un motivo y, en varios casos, la aceptación del receptor: la solicitud
-- queda "en proceso" hasta que el otro contesta o pasa el plazo. Por eso el estado intermedio
-- existe y por eso `CANCELADO` no se escribe solo porque el PAC respondió 200.
-- ============================================================================

ALTER TABLE tickets_cfdi
  ADD COLUMN IF NOT EXISTS motivo_cancelacion_sat varchar(2) NULL,
  ADD COLUMN IF NOT EXISTS cancelacion_solicitada_at timestamptz NULL;

DO $$ BEGIN
  ALTER TABLE tickets_cfdi ADD CONSTRAINT motivo_cancelacion_valido
    CHECK (motivo_cancelacion_sat IS NULL OR motivo_cancelacion_sat IN ('01', '02', '03', '04'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN tickets_cfdi.motivo_cancelacion_sat IS
  'Catálogo del SAT: 01 con errores CON relación (exige sustituto), 02 con errores sin relación, 03 no se realizó la operación, 04 nominativa incluida en la global.';

-- ---------------------------------------------------------------------------
-- ¿Se puede pedir la cancelación de este CFDI?
--
-- Solo un comprobante timbrado y no cancelado. Se expone como función para que la respuesta sea la
-- misma en el panel y en la Edge Function; que la UI decida por su cuenta cuándo enseñar el botón
-- terminaría en un botón que existe y una petición que falla.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cfdi_es_cancelable(p_cfdi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tickets_cfdi
     WHERE id = p_cfdi_id
       AND estado_sat = 'TIMBRADO'
       AND uuid_fiscal IS NOT NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- Una factura cancelada devuelve el ticket a PAGADO.
--
-- ESTO ES UN HUECO DEL MODELO, NO UN CAPRICHO. La máquina de estados de `tickets` (0008, ampliada
-- en 0058) solo contempla FACTURADO → CANCELADO, que significa cancelar la VENTA. Nunca se pensó
-- en cancelar la FACTURA de una venta que sigue en pie, y sin embargo es un evento normal: el
-- cliente dio mal su RFC y hay que rehacerla.
--
-- Con el hueco abierto, un ticket cuya factura se cancela se queda en FACTURADO para siempre. Y
-- como tanto `ticket_autofacturable` como `tickets_de_periodo_global` exigen PAGADO, esa venta
-- quedaría sin poder facturarse otra vez Y fuera de la siguiente global: una venta cobrada que
-- nunca se declara. Se detectó probando la cancelación contra la base local.
--
-- Se replica el cuerpo de 0058 tal cual y solo se añade el destino nuevo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_fiscal() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    IF NOT (
      (OLD.estado_fiscal = 'BORRADOR'  AND NEW.estado_fiscal IN ('ABIERTO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'ABIERTO'   AND NEW.estado_fiscal IN ('PAGADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'PAGADO'    AND NEW.estado_fiscal IN ('FACTURADO', 'CANCELADO', 'ABIERTO'))
      -- PAGADO es nuevo aquí: la factura se canceló pero la venta sigue cobrada y sin declarar.
      OR (OLD.estado_fiscal = 'FACTURADO' AND NEW.estado_fiscal IN ('CANCELADO', 'PAGADO'))
    ) THEN
      RAISE EXCEPTION 'Transición de estado_fiscal no permitida: % → %', OLD.estado_fiscal, NEW.estado_fiscal;
    END IF;

    IF NEW.estado_fiscal = 'PAGADO' AND NEW.fecha_pago IS NULL THEN
      NEW.fecha_pago := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Registrar el resultado de una solicitud de cancelación.
--
-- Una sola función para las tres salidas —en proceso, cancelado, rechazado— porque las tres tienen
-- que hacer lo mismo además de cambiar el estado: dejar el movimiento asentado en
-- `cfdi_sat_movimientos`. Repartirlo en tres funciones era garantizar que alguna se olvidara.
--
-- Lo importante está al final: si el CFDI cancelado era una GLOBAL, sus tickets vuelven a quedar
-- libres. Sin eso, cancelar una global dejaría a esas ventas sin amparo y sin poder ampararlas —
-- ni por otra global ni por el portal—, que es la peor de las dos formas de equivocarse.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cfdi_registrar_cancelacion(
  p_cfdi_id            uuid,
  p_estado             cfdi_estado_sat,
  p_motivo             varchar DEFAULT NULL,
  p_acuse_storage_path varchar DEFAULT NULL,
  p_pac_mensaje        text DEFAULT NULL,
  p_response_payload   jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cfdi   tickets_cfdi%ROWTYPE;
  v_evento cfdi_sat_evento;
BEGIN
  SELECT * INTO v_cfdi FROM tickets_cfdi WHERE id = p_cfdi_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CFDI % no existe', p_cfdi_id;
  END IF;

  IF p_estado NOT IN ('EN_PROCESO_CANCELACION', 'CANCELADO', 'CANCELACION_RECHAZADA') THEN
    RAISE EXCEPTION 'Estado % no es un resultado de cancelación', p_estado;
  END IF;

  v_evento := CASE p_estado
    WHEN 'CANCELADO' THEN 'CANCELACION_CONFIRMADA'::cfdi_sat_evento
    WHEN 'CANCELACION_RECHAZADA' THEN 'CANCELACION_RECHAZADA'::cfdi_sat_evento
    ELSE 'CANCELACION_SOLICITADA'::cfdi_sat_evento
  END;

  UPDATE tickets_cfdi
     SET estado_sat = p_estado,
         motivo_cancelacion_sat = COALESCE(p_motivo, motivo_cancelacion_sat),
         cancelacion_solicitada_at = COALESCE(cancelacion_solicitada_at, now()),
         acuse_xml_storage_path = COALESCE(p_acuse_storage_path, acuse_xml_storage_path),
         updated_by = auth.uid()
   WHERE id = p_cfdi_id;

  INSERT INTO cfdi_sat_movimientos (
    tenant_id, cfdi_id, evento, pac_proveedor, pac_mensaje,
    acuse_storage_path, response_payload, usuario_id, created_by
  ) VALUES (
    v_cfdi.tenant_id, p_cfdi_id, v_evento, v_cfdi.pac_proveedor, p_pac_mensaje,
    p_acuse_storage_path, p_response_payload, auth.uid(), auth.uid()
  );

  IF p_estado = 'CANCELADO' THEN
    -- Una global cancelada deja de amparar nada.
    IF v_cfdi.es_global THEN
      DELETE FROM cfdi_global_tickets WHERE cfdi_id = p_cfdi_id;
      UPDATE cfdi_periodos_globales
         SET estado = 'ABIERTO', cfdi_id = NULL, n_tickets = 0, total_mxn = 0, cerrado_at = NULL
       WHERE cfdi_id = p_cfdi_id;

    -- Y una factura individual cancelada devuelve su ticket a la cola de lo facturable, salvo que
    -- otro CFDI vigente lo ampare (una sustitución, por ejemplo).
    ELSIF v_cfdi.ticket_id IS NOT NULL THEN
      UPDATE tickets
         SET estado_fiscal = 'PAGADO', updated_by = auth.uid()
       WHERE id = v_cfdi.ticket_id
         AND estado_fiscal = 'FACTURADO'
         AND NOT EXISTS (
           SELECT 1 FROM tickets_cfdi otro
            WHERE otro.ticket_id = v_cfdi.ticket_id
              AND otro.id <> p_cfdi_id
              AND otro.tipo_comprobante = 'INGRESO'
              AND otro.estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
         );
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION cfdi_registrar_cancelacion IS
  'Asienta el resultado de una cancelación, libera los tickets de una global y devuelve el ticket a PAGADO si su factura se canceló.';
