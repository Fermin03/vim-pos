-- 0138 · el outbox web congelado ya no escribe dinero con lo que mande el cliente
--
-- Auditoría integral 30/09/2026 (cabo suelto del equipo B). La 0133 cerró las escrituras REST
-- directas a las tablas de dinero, pero `sync_aplicar_operacion` (la RPC del outbox web, que
-- `sync_procesar_push` llama por cada operación) es SECURITY INVOKER y entra por `/rpc/`: el
-- guardián la deja pasar, y dentro inserta tickets, renglones y pagos con los valores del payload
-- — `precio_unitario_snapshot` y `monto_mxn` incluidos. Un cajero con su JWT podía mandar un
-- renglón a $0.01 o un pago inventado y la BD lo aceptaba: el mismo agujero de la 0133 por la
-- puerta de al lado.
--
-- Ese outbox está CONGELADO desde la remediación Fase 3 (CLAUDE.md regla 5; apps/pos/app/lib/
-- outbox.ts @deprecated): `cobrarOffline` ya no tiene llamadores, así que nada encola operaciones
-- nuevas. Lo único que podría llegar es lo que una tablet vieja tuviera guardado de antes.
--
-- Por eso no se arregla la validación campo por campo de un camino muerto: se deja de APLICAR.
-- Cada operación que llegue se guarda íntegra en `sync_conflictos` (tipo OTRO, motivo
-- OUTBOX_CONGELADO, resolución PENDIENTE) para que alguien la revise y, si es una venta real, la
-- capture por el camino normal. La primera vez se responde CONFLICTO (el resumen lo cuenta); si la
-- tablet la reenvía se responde IDEMPOTENTE para que la suelte, porque el POS solo quita del outbox
-- lo EXITO/IDEMPOTENTE y un CONFLICTO eterno la reenviaría en cada ciclo. Nada se pierde: el
-- payload queda en la base.
--
-- La versión anterior se conserva renombrada (sin EXECUTE para nadie salvo el dueño) por si hace
-- falta reprocesar a mano un conflicto con sus reglas R1–R10.

ALTER FUNCTION sync_aplicar_operacion(uuid, text, text, uuid, character varying, jsonb, timestamptz)
  RENAME TO _sync_aplicar_operacion_legado;
REVOKE EXECUTE ON FUNCTION _sync_aplicar_operacion_legado(uuid, text, text, uuid, character varying, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION sync_aplicar_operacion(
  p_sync_evento_id   uuid,
  p_tabla            text,
  p_operacion        text,
  p_entidad_id_local uuid,
  p_client_id_local  character varying,
  p_payload          jsonb,
  p_fecha_operacion  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_id        uuid;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'sync_aplicar_operacion: sin negocio en la sesión' USING ERRCODE = '42501';
  END IF;

  -- ¿Ya se guardó antes? (la tablet la reenvía mientras no reciba EXITO/IDEMPOTENTE). Se
  -- reconoce por su client_id_local, que es único por OPERACIÓN; el INSERT y el UPDATE de un mismo
  -- ticket comparten entidad_id_local y no son la misma operación.
  SELECT id INTO v_id
    FROM sync_conflictos
   WHERE tenant_id = v_tenant_id
     AND diferencia_detectada->>'motivo' = 'OUTBOX_CONGELADO'
     AND CASE WHEN p_client_id_local IS NOT NULL
              THEN client_id_local = p_client_id_local
              ELSE client_id_local IS NULL
               AND entidad_id_local = p_entidad_id_local
               AND entidad_tipo = left(COALESCE(p_tabla, '?'), 50)
               AND payload_intentado->>'operacion' IS NOT DISTINCT FROM p_operacion
         END
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'entidad_id_local', p_entidad_id_local,
      'tabla', p_tabla,
      'estado', 'IDEMPOTENTE',
      'sync_conflicto_id', v_id,
      'regla', 'OUTBOX_CONGELADO_ya_guardado');
  END IF;

  INSERT INTO sync_conflictos (
    tenant_id, sync_evento_id, tipo_conflicto,
    entidad_tipo, entidad_id_local, client_id_local,
    payload_intentado, diferencia_detectada
  ) VALUES (
    v_tenant_id, p_sync_evento_id, 'OTRO',
    left(COALESCE(p_tabla, '?'), 50), p_entidad_id_local, p_client_id_local,
    jsonb_build_object('operacion', p_operacion, 'fecha_operacion', p_fecha_operacion, 'payload', p_payload),
    jsonb_build_object('motivo', 'OUTBOX_CONGELADO',
                       'detalle', 'El outbox web está congelado (0138): la operación se guardó para revisión y no se aplicó.')
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'entidad_id_local', p_entidad_id_local,
    'tabla', p_tabla,
    'estado', 'CONFLICTO',
    'sync_conflicto_id', v_id,
    'regla', 'OUTBOX_CONGELADO');
END;
$fn$;
REVOKE EXECUTE ON FUNCTION sync_aplicar_operacion(uuid, text, text, uuid, character varying, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_aplicar_operacion(uuid, text, text, uuid, character varying, jsonb, timestamptz) TO authenticated;
