-- El admin de existencias (spec 2026-10-15-giro-retail-design.md §6.2, §6.3 y §13; ADR 0037).
-- §1 renglones, conteo, traspaso y cancelación · §2 vista, mínimo y recepción.

-- ── §1 Renglones, conteo, traspaso y cancelación ────────────────────────────
-- Un solo validador para los renglones que mandan recepción, conteo y traspaso. Antes cada
-- función repetía su versión: comparaba el uuid como texto (el mismo producto en mayúsculas
-- pasaba dos veces) y un 0.0004 se redondeaba a cero y salía como error crudo del CHECK.
CREATE OR REPLACE FUNCTION _existencias_lineas(p jsonb, p_campo text, p_cero_ok boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_e      jsonb;
  v_prod   uuid;
  v_q      numeric;
  v_c      numeric;
  v_vistos uuid[] := '{}';
  v_out    jsonb := '[]'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la lista viene vacía' USING ERRCODE = '22023';
  END IF;
  FOR v_e IN SELECT value FROM jsonb_array_elements(p) LOOP
    BEGIN
      v_prod := (v_e->>'producto_id')::uuid;
      v_q    := (v_e->>p_campo)::numeric;
      v_c    := NULLIF(v_e->>'costo', '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: renglón mal formado: %', v_e USING ERRCODE = '22023';
    END;
    IF v_prod IS NULL OR v_q IS NULL OR v_q = 'NaN' OR v_q < 0 OR (v_q = 0 AND NOT p_cero_ok) OR v_q >= 1e9 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: cantidad inválida en %', v_e USING ERRCODE = '22023';
    END IF;
    IF v_q <> round(v_q, 3) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: la cantidad admite máximo 3 decimales' USING ERRCODE = '22023';
    END IF;
    IF v_c IS NOT NULL AND (v_c = 'NaN' OR v_c < 0 OR v_c >= 1e10 OR v_c <> round(v_c, 2)) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: costo inválido en %', v_e USING ERRCODE = '22023';
    END IF;
    IF v_prod = ANY(v_vistos) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un producto viene dos veces' USING ERRCODE = '22023';
    END IF;
    v_vistos := v_vistos || v_prod;
    v_out := v_out || jsonb_build_object('producto_id', v_prod, 'cantidad', v_q, 'costo', v_c);
  END LOOP;
  -- Ordenado por producto: dos conteos simultáneos bloquean sus filas en el mismo orden.
  RETURN (SELECT jsonb_agg(e ORDER BY (e->>'producto_id')::uuid) FROM jsonb_array_elements(v_out) e);
END;
$$;
REVOKE ALL ON FUNCTION _existencias_lineas(jsonb, text, boolean) FROM PUBLIC, anon, authenticated;

-- Conteo físico. Cambios contra la 0189: usa el validador común, crea la fila de existencia antes
-- de bloquearla (sin fila, FOR UPDATE no bloqueaba nada y una venta simultánea se perdía en la
-- diferencia) y recorre los productos en orden.
CREATE OR REPLACE FUNCTION registrar_conteo(p_sucursal uuid, p_conteo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t       uuid := _existencias_puede_escribir();
  v_lineas  jsonb := _existencias_lineas(p_conteo, 'contado', true);
  v_l       jsonb;
  v_prod    uuid;
  v_contado numeric;
  v_sistema numeric;
  v_n       int := 0;
  v_dif     jsonb := '[]'::jsonb;
BEGIN
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_sucursal, (v_l->>'producto_id')::uuid);
  END LOOP;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    v_prod    := (v_l->>'producto_id')::uuid;
    v_contado := (v_l->>'cantidad')::numeric;
    INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id)
    VALUES (v_t, p_sucursal, v_prod) ON CONFLICT (sucursal_id, producto_id) DO NOTHING;
    SELECT cantidad INTO v_sistema FROM producto_existencias
     WHERE sucursal_id = p_sucursal AND producto_id = v_prod FOR UPDATE;
    IF v_contado <> v_sistema THEN
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo, usuario_id)
      VALUES (v_t, p_sucursal, v_prod, 'CONTEO', v_contado - v_sistema, 'Conteo físico', auth.uid());
      v_n := v_n + 1;
    END IF;
    v_dif := v_dif || jsonb_build_object('producto_id', v_prod, 'sistema', v_sistema,
                                         'contado', v_contado, 'diferencia', v_contado - v_sistema);
  END LOOP;
  RETURN jsonb_build_object('ajustados', v_n, 'diferencias', v_dif);
END;
$$;
REVOKE ALL ON FUNCTION registrar_conteo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_conteo(uuid, jsonb) TO authenticated, service_role;

-- Traspaso. Cambios contra la 0189: validador común, todo validado antes de escribir nada.
CREATE OR REPLACE FUNCTION enviar_traspaso_producto(p_origen uuid, p_destino uuid, p_lineas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_lineas jsonb;
  v_l      jsonb;
  v_id     uuid;
BEGIN
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen = p_destino THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el traspaso necesita dos sucursales distintas' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_destino AND tenant_id = v_t AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal destino no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  v_lineas := _existencias_lineas(p_lineas, 'cantidad', false);
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_origen, (v_l->>'producto_id')::uuid);
  END LOOP;

  INSERT INTO traspasos_producto (tenant_id, origen_sucursal_id, destino_sucursal_id, lineas, enviado_por)
  VALUES (v_t, p_origen, p_destino, (SELECT jsonb_agg(e - 'costo') FROM jsonb_array_elements(v_lineas) e), auth.uid())
  RETURNING id INTO v_id;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, traspaso_id, motivo, usuario_id)
    VALUES (v_t, p_origen, (v_l->>'producto_id')::uuid, 'TRASPASO_SALIDA', -(v_l->>'cantidad')::numeric, v_id, 'Traspaso enviado', auth.uid());
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enviar_traspaso_producto(uuid, uuid, jsonb) TO authenticated, service_role;

ALTER TABLE traspasos_producto
  ADD COLUMN IF NOT EXISTS cancelado_por uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelado_at  timestamptz NULL;

-- Un traspaso en camino se cancela: la mercancía vuelve al origen (TRASPASO_ENTRADA) una sola
-- vez. Uno recibido o ya cancelado no.
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

-- ── §2 Vista, mínimo y recepción ─────────────────────────────────────────────
-- Cada producto con existencias × cada sucursal viva, aunque nunca se haya movido ahí (para poder
-- fijarle mínimo o contarlo). security_invoker: manda la RLS de productos, sucursales y existencias.
CREATE OR REPLACE VIEW vw_existencias WITH (security_invoker = true) AS
SELECT
  p.tenant_id,
  s.id                                   AS sucursal_id,
  s.nombre                               AS sucursal_nombre,
  p.id                                   AS producto_id,
  COALESCE(pa.nombre, p.nombre)          AS producto_nombre,
  p.nombre                               AS nombre_completo,
  p.variante_valores,
  pa.variante_ejes,
  p.codigo_interno,
  p.codigo_barras,
  p.costo_mxn,
  p.precio_base_mxn,
  COALESCE(e.cantidad, 0)                AS cantidad,
  e.minimo,
  e.actualizado_at,
  round(COALESCE(e.cantidad, 0) * COALESCE(p.costo_mxn, 0), 2) AS valor_mxn
FROM productos p
JOIN sucursales s ON s.tenant_id = p.tenant_id AND s.deleted_at IS NULL
LEFT JOIN producto_existencias e ON e.producto_id = p.id AND e.sucursal_id = s.id
LEFT JOIN productos pa ON pa.id = p.producto_padre_id
WHERE p.controla_existencias AND p.deleted_at IS NULL;
REVOKE ALL ON vw_existencias FROM PUBLIC, anon;
GRANT SELECT ON vw_existencias TO authenticated, service_role;
COMMENT ON VIEW vw_existencias IS 'Existencia y valor de cada producto con existencias en cada sucursal viva (0193).';

-- El mínimo es lo único de producto_existencias que se escribe a mano. Si la fila no existe se
-- crea en 0 (la suma de movimientos también es 0): la existencia sigue siendo la suma.
CREATE OR REPLACE FUNCTION fijar_minimo_producto(p_sucursal uuid, p_producto uuid, p_minimo numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_t uuid := _existencias_puede_escribir();
BEGIN
  PERFORM _existencias_validar(v_t, p_sucursal, p_producto);
  IF p_minimo IS NOT NULL AND (p_minimo = 'NaN' OR p_minimo < 0 OR p_minimo >= 1e9 OR p_minimo <> round(p_minimo, 3)) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: mínimo inválido (0 o más, máximo 3 decimales)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id, minimo)
  VALUES (v_t, p_sucursal, p_producto, p_minimo)
  ON CONFLICT (sucursal_id, producto_id) DO UPDATE SET minimo = EXCLUDED.minimo, actualizado_at = now();
END;
$$;
REVOKE ALL ON FUNCTION fijar_minimo_producto(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fijar_minimo_producto(uuid, uuid, numeric) TO authenticated, service_role;

-- Recibir mercancía de un proveedor: varios renglones, todo o nada. El costo de cada renglón,
-- si viene, pasa a ser el costo del producto. La referencia (remisión, factura) va en el motivo.
CREATE OR REPLACE FUNCTION recibir_mercancia(p_sucursal uuid, p_proveedor uuid, p_lineas jsonb, p_referencia text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_lineas jsonb := _existencias_lineas(p_lineas, 'cantidad', false);
  v_l      jsonb;
  v_prod   uuid;
  v_costo  numeric;
  v_motivo text := 'Recepción' || COALESCE(' · ' || NULLIF(left(btrim(p_referencia), 100), ''), ' de mercancía');
BEGIN
  IF p_proveedor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores WHERE id = p_proveedor AND tenant_id = v_t AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el proveedor no es de tu negocio' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM _existencias_validar(v_t, p_sucursal, (v_l->>'producto_id')::uuid);
  END LOOP;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
    v_prod  := (v_l->>'producto_id')::uuid;
    v_costo := NULLIF(v_l->>'costo', '')::numeric;
    INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, proveedor_id, motivo, usuario_id)
    VALUES (v_t, p_sucursal, v_prod, 'ENTRADA', (v_l->>'cantidad')::numeric, v_costo, p_proveedor, v_motivo, auth.uid());
    IF v_costo IS NOT NULL THEN
      UPDATE productos SET costo_mxn = v_costo, updated_at = now() WHERE id = v_prod;
    END IF;
  END LOOP;
  RETURN jsonb_array_length(v_lineas);
END;
$$;
REVOKE ALL ON FUNCTION recibir_mercancia(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recibir_mercancia(uuid, uuid, jsonb, text) TO authenticated, service_role;

-- Recibir un traspaso: igual que la 0189, pero distingue uno cancelado de uno ya recibido.
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
