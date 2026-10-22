-- Traspasos con una sucursal borrada (suave) (spec 2026-10-15-giro-retail-design.md §6.3 y §12).
-- 0193 ya no deja mover mercancía a una sucursal borrada, pero recibir y cancelar un traspaso
-- en camino escribían sin preguntar. Los dos cuerpos son los de 0193; solo se añade la pregunta.
-- Si se borran las dos puntas el traspaso se queda en camino: no hay a dónde mandar la mercancía
-- (restaurar una sucursal lo destraba).

CREATE OR REPLACE FUNCTION cancelar_traspaso_producto(p_traspaso uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t  uuid := _existencias_puede_escribir();
  v_tr traspasos_producto%ROWTYPE;
  v_l  jsonb;
BEGIN
  SELECT * INTO v_tr FROM traspasos_producto WHERE id = p_traspaso AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso no existe' USING ERRCODE = '22023';
  END IF;
  IF v_tr.estado <> 'ENVIADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cancela un traspaso que va en camino' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM sucursales WHERE id = v_tr.origen_sucursal_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal de origen está eliminada' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_tr.lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, v_tr.origen_sucursal_id, (v_l->>'producto_id')::uuid, 'TRASPASO_ENTRADA',
            (v_l->>'cantidad')::numeric, p_traspaso, 'Traspaso cancelado', auth.uid());
  END LOOP;
  UPDATE traspasos_producto SET estado = 'CANCELADO', cancelado_por = auth.uid(), cancelado_at = now() WHERE id = p_traspaso;
END;
$$;
REVOKE ALL ON FUNCTION cancelar_traspaso_producto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_traspaso_producto(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION recibir_traspaso_producto(p_traspaso uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t  uuid := _existencias_puede_escribir();
  v_tr traspasos_producto%ROWTYPE;
  v_l  jsonb;
BEGIN
  SELECT * INTO v_tr FROM traspasos_producto WHERE id = p_traspaso AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso no existe' USING ERRCODE = '22023';
  END IF;
  IF v_tr.estado = 'CANCELADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso fue cancelado' USING ERRCODE = '22023';
  END IF;
  IF v_tr.estado <> 'ENVIADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: ese traspaso ya se recibió' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM sucursales WHERE id = v_tr.destino_sucursal_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal destino está eliminada; cancela el traspaso' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_tr.lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, v_tr.destino_sucursal_id, (v_l->>'producto_id')::uuid, 'TRASPASO_ENTRADA',
            (v_l->>'cantidad')::numeric, p_traspaso, 'Traspaso recibido', auth.uid());
  END LOOP;
  UPDATE traspasos_producto SET estado = 'RECIBIDO', recibido_por = auth.uid(), recibido_at = now() WHERE id = p_traspaso;
END;
$$;
REVOKE ALL ON FUNCTION recibir_traspaso_producto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recibir_traspaso_producto(uuid) TO authenticated, service_role;
