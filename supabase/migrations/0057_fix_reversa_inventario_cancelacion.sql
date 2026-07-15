-- 0057 — Fix: reversar_inventario_por_cancelacion llamaba una firma inexistente.
--
-- Bug: la función (0009) invocaba aplicar_movimiento_inventario con parámetros que no existen
-- (p_producto_id, p_tipo_movimiento, p_origen_referencia_tipo, p_origen_referencia_id) y con un
-- tipo de movimiento inexistente ('CANCELACION_VENTA'). Postgres fallaba con
-- "function aplicar_movimiento_inventario(...) does not exist" y eso abortaba TODA la cancelación
-- (abierta y pagada), incluida la devolución del dinero.
--
-- Causa de fondo: el inventario se lleva por INSUMO, no por producto. Hay que explotar la receta
-- del producto igual que descontar_inventario_por_venta (0007), pero con el tipo real
-- REVERSA_CANCELACION (signo +1 = entrada al stock) y la firma real de la función central.
--
-- Aditiva: solo reemplaza el cuerpo (CREATE OR REPLACE). Mantiene la idempotencia por
-- inventario_reversado_at y agrega el mismo no-op que la venta cuando el módulo está apagado.

CREATE OR REPLACE FUNCTION reversar_inventario_por_cancelacion(
  p_cancelacion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cancelacion   cancelaciones_ticket%ROWTYPE;
  v_item          record;
  v_componente    record;
  v_modulo_activo boolean;
BEGIN
  SELECT * INTO v_cancelacion FROM cancelaciones_ticket WHERE id = p_cancelacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancelación % no existe', p_cancelacion_id;
  END IF;

  IF v_cancelacion.inventario_reversado_at IS NOT NULL THEN
    RETURN;     -- idempotencia
  END IF;

  -- El módulo de inventario puede estar apagado (mismo criterio que descontar_inventario_por_venta:
  -- si no se descontó al vender, no hay nada que regresar).
  SELECT ct.modulo_inventario_activo INTO v_modulo_activo
  FROM configuracion_tenant ct
  WHERE ct.tenant_id = v_cancelacion.tenant_id;

  IF COALESCE(v_modulo_activo, false) THEN
    FOR v_item IN
      SELECT ti.producto_id, ti.cantidad
      FROM ticket_items ti
      WHERE ti.ticket_id = v_cancelacion.ticket_id
        AND ti.cancelado = false
        AND ti.producto_id IS NOT NULL
    LOOP
      -- El stock vive en insumos: explotar la receta activa del producto.
      FOR v_componente IN
        SELECT rc.insumo_id, rc.cantidad AS cantidad_unitaria
        FROM receta_componentes rc
        JOIN recetas r ON r.id = rc.receta_id
        WHERE r.producto_id = v_item.producto_id
          AND r.activa = true
      LOOP
        PERFORM aplicar_movimiento_inventario(
          p_tenant_id   := v_cancelacion.tenant_id,
          p_sucursal_id := v_cancelacion.sucursal_id,
          p_insumo_id   := v_componente.insumo_id,
          p_tipo        := 'REVERSA_CANCELACION',
          p_cantidad    := v_componente.cantidad_unitaria * v_item.cantidad,
          p_descripcion := 'Cancelación ticket ' || v_cancelacion.ticket_folio_snapshot,
          p_ticket_id   := v_cancelacion.ticket_id
        );
      END LOOP;
    END LOOP;
  END IF;

  UPDATE cancelaciones_ticket
  SET inventario_reversado_at = now()
  WHERE id = p_cancelacion_id;
END;
$$;

COMMENT ON FUNCTION reversar_inventario_por_cancelacion IS
  'Regresa al stock los insumos de un ticket cancelado explotando la receta activa de cada producto (tipo REVERSA_CANCELACION). Idempotente por inventario_reversado_at; no-op si el módulo de inventario está apagado.';

-- Mismo bug, misma familia: reversar_inventario_por_devolucion (0009) tenía el mismo llamado
-- inválido (el comentario original lo admitía: "aquí llamamos una función espejo conceptual") con
-- otro tipo inexistente, 'DEVOLUCION_VENTA'. Importa porque cancelar un folio PAGADO crea una
-- devolución total, así que esta ruta se ejecuta en cada cancelación con devolución de dinero.
-- El enum real para una entrada por venta deshecha es REVERSA_CANCELACION.

CREATE OR REPLACE FUNCTION reversar_inventario_por_devolucion(
  p_devolucion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_devolucion    devoluciones%ROWTYPE;
  v_item          record;
  v_componente    record;
  v_modulo_activo boolean;
BEGIN
  SELECT * INTO v_devolucion FROM devoluciones WHERE id = p_devolucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;

  IF v_devolucion.inventario_reversado_at IS NOT NULL THEN
    RETURN;     -- idempotencia
  END IF;

  SELECT ct.modulo_inventario_activo INTO v_modulo_activo
  FROM configuracion_tenant ct
  WHERE ct.tenant_id = v_devolucion.tenant_id;

  IF COALESCE(v_modulo_activo, false) THEN
    FOR v_item IN
      SELECT ti.producto_id, di.cantidad_devuelta
      FROM devolucion_items di
      JOIN ticket_items ti ON ti.id = di.ticket_item_id_original
      WHERE di.devolucion_id = p_devolucion_id
        AND di.reversar_inventario_item = true
        AND ti.producto_id IS NOT NULL
    LOOP
      FOR v_componente IN
        SELECT rc.insumo_id, rc.cantidad AS cantidad_unitaria
        FROM receta_componentes rc
        JOIN recetas r ON r.id = rc.receta_id
        WHERE r.producto_id = v_item.producto_id
          AND r.activa = true
      LOOP
        PERFORM aplicar_movimiento_inventario(
          p_tenant_id   := v_devolucion.tenant_id,
          p_sucursal_id := v_devolucion.sucursal_id,
          p_insumo_id   := v_componente.insumo_id,
          p_tipo        := 'REVERSA_CANCELACION',
          p_cantidad    := v_componente.cantidad_unitaria * v_item.cantidad_devuelta,
          p_descripcion := 'Devolución folio ' || v_devolucion.folio_completo,
          p_ticket_id   := v_devolucion.ticket_original_id
        );
      END LOOP;
    END LOOP;
  END IF;

  UPDATE devoluciones
  SET inventario_reversado_at = now()
  WHERE id = p_devolucion_id;
END;
$$;

COMMENT ON FUNCTION reversar_inventario_por_devolucion IS
  'Regresa al stock los insumos de los items devueltos explotando la receta activa de cada producto (tipo REVERSA_CANCELACION). Idempotente por inventario_reversado_at; no-op si el módulo de inventario está apagado.';
