-- 0100 — registrar_compra / anular_compra (ADR 0012, spec 2026-09-03 §4.1 y §4.2).
-- SECURITY INVOKER: corren bajo RLS del usuario del panel. El usuario sale de auth.uid().

CREATE OR REPLACE FUNCTION registrar_compra(p_compra jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant     uuid := current_tenant_id();
  v_usuario    uuid := auth.uid();
  v_sucursal   uuid := (p_compra->>'sucursal_id')::uuid;
  v_proveedor  uuid := (p_compra->>'proveedor_id')::uuid;
  v_uuid       uuid := NULLIF(p_compra->>'cfdi_uuid','')::uuid;
  v_prov_nombre varchar(200);
  v_referencia varchar(100) := NULLIF(p_compra->>'referencia_documento','');
  v_folio_existente varchar(50);
  v_subtotal   numeric(12,2);
  v_iva        numeric(12,2);
  v_compra     uuid;
  v_folio      varchar(50);
  v_linea      record;
  v_mov        uuid;
  v_n          int;
BEGIN
  IF v_tenant IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;

  v_n := COALESCE(jsonb_array_length(p_compra->'lineas'), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'Una compra necesita al menos un insumo'; END IF;

  SELECT nombre INTO v_prov_nombre FROM proveedores
   WHERE id = v_proveedor AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_prov_nombre IS NULL THEN RAISE EXCEPTION 'El proveedor no existe o no es de tu negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = v_sucursal AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'La sucursal no existe o no es de tu negocio';
  END IF;

  -- Todo insumo de línea debe ser del negocio y estar vivo (la FK no pasa por RLS).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_compra->'lineas') l
    WHERE NOT EXISTS (
      SELECT 1 FROM insumos i
      WHERE i.id = (l->>'insumo_id')::uuid AND i.tenant_id = v_tenant AND i.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Uno de los insumos no existe o no es de tu negocio';
  END IF;
  -- Toda unidad capturada de línea debe ser del sistema o del negocio.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_compra->'lineas') l
    WHERE NOT EXISTS (
      SELECT 1 FROM unidades_medida u
      WHERE u.id = (l->>'unidad_capturada_id')::uuid AND (u.tenant_id = v_tenant OR u.tenant_id IS NULL))
  ) THEN
    RAISE EXCEPTION 'Una de las unidades no es válida para tu negocio';
  END IF;
  -- Todo insumo de alias debe ser del negocio y estar vivo.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_compra->'aliases', '[]'::jsonb)) a
    WHERE NOT EXISTS (
      SELECT 1 FROM insumos i
      WHERE i.id = (a->>'insumo_id')::uuid AND i.tenant_id = v_tenant AND i.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Uno de los insumos no existe o no es de tu negocio';
  END IF;
  -- Toda unidad de alias debe ser del sistema o del negocio.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_compra->'aliases', '[]'::jsonb)) a
    WHERE NOT EXISTS (
      SELECT 1 FROM unidades_medida u
      WHERE u.id = (a->>'unidad_id')::uuid AND (u.tenant_id = v_tenant OR u.tenant_id IS NULL))
  ) THEN
    RAISE EXCEPTION 'Una de las unidades no es válida para tu negocio';
  END IF;

  IF v_uuid IS NOT NULL THEN
    SELECT folio_completo INTO v_folio_existente FROM compras WHERE tenant_id = v_tenant AND cfdi_uuid = v_uuid;
    IF v_folio_existente IS NOT NULL THEN
      RAISE EXCEPTION 'Esta factura ya está registrada como la compra %', v_folio_existente;
    END IF;
  END IF;

  SELECT COALESCE(SUM((l->>'importe_mxn')::numeric), 0) INTO v_subtotal
    FROM jsonb_array_elements(p_compra->'lineas') l;
  v_iva := COALESCE(NULLIF(p_compra->>'iva_mxn','')::numeric, round(v_subtotal * 0.16, 2));

  INSERT INTO compras (tenant_id, sucursal_id, proveedor_id, fecha, referencia_documento, cfdi_uuid, origen,
                       subtotal_mxn, iva_mxn, total_mxn, notas, usuario_id, dia_contable)
  VALUES (v_tenant, v_sucursal, v_proveedor, (p_compra->>'fecha')::date, v_referencia, v_uuid,
          COALESCE(NULLIF(p_compra->>'origen',''), 'MANUAL')::compra_origen,
          v_subtotal, v_iva, v_subtotal + v_iva, NULLIF(p_compra->>'notas',''), v_usuario,
          calcular_dia_contable(v_tenant, now()))
  RETURNING id, folio_completo INTO v_compra, v_folio;

  FOR v_linea IN
    SELECT (l->>'insumo_id')::uuid            AS insumo_id,
           NULLIF(l->>'descripcion_origen','') AS descripcion_origen,
           (l->>'cantidad_capturada')::numeric AS cantidad_capturada,
           (l->>'unidad_capturada_id')::uuid   AS unidad_capturada_id,
           (l->>'cantidad')::numeric           AS cantidad,
           (l->>'costo_unitario_mxn')::numeric AS costo_unitario_mxn,
           (l->>'importe_mxn')::numeric        AS importe_mxn,
           ord - 1                             AS orden
      FROM jsonb_array_elements(p_compra->'lineas') WITH ORDINALITY AS t(l, ord)
  LOOP
    v_mov := aplicar_movimiento_inventario(
      p_tenant_id := v_tenant, p_sucursal_id := v_sucursal, p_insumo_id := v_linea.insumo_id,
      p_tipo := 'ENTRADA_COMPRA'::movimiento_inventario_tipo, p_cantidad := v_linea.cantidad,
      p_costo_unitario_mxn := v_linea.costo_unitario_mxn, p_usuario_id := v_usuario,
      p_motivo := 'Compra ' || v_folio, p_descripcion := v_linea.descripcion_origen,
      p_ticket_id := NULL, p_proveedor_texto := v_prov_nombre, p_factura_referencia := v_referencia);
    UPDATE movimientos_inventario SET compra_id = v_compra WHERE id = v_mov;

    INSERT INTO compra_lineas (tenant_id, compra_id, insumo_id, descripcion_origen, cantidad_capturada,
                               unidad_capturada_id, cantidad, costo_unitario_mxn, importe_mxn, movimiento_id, orden)
    VALUES (v_tenant, v_compra, v_linea.insumo_id, v_linea.descripcion_origen, v_linea.cantidad_capturada,
            v_linea.unidad_capturada_id, v_linea.cantidad, v_linea.costo_unitario_mxn, v_linea.importe_mxn,
            v_mov, v_linea.orden);
  END LOOP;

  INSERT INTO proveedor_insumo_alias (tenant_id, proveedor_id, clave_origen, descripcion_origen, insumo_id, unidad_id, factor)
  SELECT v_tenant, v_proveedor, a->>'clave_origen', NULLIF(a->>'descripcion_origen',''),
         (a->>'insumo_id')::uuid, (a->>'unidad_id')::uuid, (a->>'factor')::numeric
    FROM jsonb_array_elements(COALESCE(p_compra->'aliases', '[]'::jsonb)) a
  ON CONFLICT (proveedor_id, clave_origen) DO UPDATE
    SET descripcion_origen = EXCLUDED.descripcion_origen, insumo_id = EXCLUDED.insumo_id,
        unidad_id = EXCLUDED.unidad_id, factor = EXCLUDED.factor, updated_at = now();

  RETURN v_compra;
END $$;
COMMENT ON FUNCTION registrar_compra IS 'Registra una compra recibida: cabecera + líneas + ENTRADA_COMPRA por línea + alias del proveedor. Spec 2026-09-03 §4.1.';

CREATE OR REPLACE FUNCTION anular_compra(p_compra_id uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_usuario uuid := auth.uid();
  v_compra  compras%ROWTYPE;
  v_linea   record;
  v_mov     uuid;
BEGIN
  IF v_tenant IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribe el motivo de la anulación'; END IF;

  SELECT * INTO v_compra FROM compras WHERE id = p_compra_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La compra no existe o no es de tu negocio'; END IF;
  IF v_compra.estado = 'ANULADA' THEN RAISE EXCEPTION 'Esta compra ya está anulada'; END IF;

  FOR v_linea IN SELECT * FROM compra_lineas WHERE compra_id = p_compra_id ORDER BY orden LOOP
    v_mov := aplicar_movimiento_inventario(
      p_tenant_id := v_tenant, p_sucursal_id := v_compra.sucursal_id, p_insumo_id := v_linea.insumo_id,
      p_tipo := 'DEVOLUCION_PROVEEDOR'::movimiento_inventario_tipo, p_cantidad := v_linea.cantidad,
      p_costo_unitario_mxn := v_linea.costo_unitario_mxn, p_usuario_id := v_usuario,
      p_motivo := 'Anulación de compra ' || v_compra.folio_completo || ': ' || trim(p_motivo),
      p_descripcion := v_linea.descripcion_origen, p_ticket_id := NULL,
      p_proveedor_texto := NULL, p_factura_referencia := v_compra.referencia_documento);
    UPDATE movimientos_inventario SET compra_id = p_compra_id WHERE id = v_mov;
    UPDATE compra_lineas SET movimiento_reversa_id = v_mov WHERE id = v_linea.id;
  END LOOP;

  UPDATE compras
     SET estado = 'ANULADA', anulada_at = now(), anulada_por = v_usuario, motivo_anulacion = trim(p_motivo)
   WHERE id = p_compra_id;
END $$;
COMMENT ON FUNCTION anular_compra IS 'Anula una compra: DEVOLUCION_PROVEEDOR por línea (regresa existencias). NO revierte el costo promedio. Spec 2026-09-03 §4.2.';
