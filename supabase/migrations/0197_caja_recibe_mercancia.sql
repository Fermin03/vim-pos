-- 0197 — La caja sube las entradas de mercancía (Giro RETAIL, entrega 4b, decisiones 1 y 3).
--
-- recibir_mercancia (0193) en la caja instalada escribe ENTRADA sin ticket, sin costo y sin
-- proveedor: los productos y los proveedores los manda la nube, así que costo y proveedor solo se
-- capturan en el admin. Sin esto el push de la 0196 la rechazaba para siempre.
--
-- _vim_aplicar_movimientos_producto: el cuerpo de la 0196 §3 con una sola rama nueva ("0197").
-- Mismo contrato R3 ({aplicados, errores, descartados}), misma idempotencia por id del negocio.

CREATE OR REPLACE FUNCTION _vim_aplicar_movimientos_producto(p_tenant uuid, p_movs jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila        jsonb;
  v_id          uuid;
  v_n           integer := 0;
  v_errores     jsonb := '[]'::jsonb;
  v_descartados jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_movs) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('aplicados', 0, 'errores', '[]'::jsonb, 'descartados', '[]'::jsonb);
  END IF;
  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_movs) ORDER BY value->>'creado_at' LOOP
    BEGIN
      IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'movimiento de otro negocio';
      END IF;
      IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = (v_fila->>'id')::uuid) THEN
        IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = (v_fila->>'id')::uuid AND tenant_id = p_tenant) THEN CONTINUE; END IF;
        RAISE EXCEPTION 'el id ya existe en otro negocio';   -- 0196
      END IF;
      IF v_fila->>'tipo' = 'ENTRADA' THEN
        -- 0197: la recepción de la caja, sin ticket, costo ni proveedor y con cantidad positiva.
        IF NULLIF(v_fila->>'ticket_id', '') IS NOT NULL OR NULLIF(v_fila->>'costo_unitario_mxn', '') IS NOT NULL
           OR NULLIF(v_fila->>'proveedor_id', '') IS NOT NULL OR NOT COALESCE((v_fila->>'cantidad')::numeric > 0, false) THEN
          RAISE EXCEPTION 'la caja solo sube entradas sin ticket, costo ni proveedor y con cantidad positiva';
        END IF;
      -- 0196
      ELSIF v_fila->>'tipo' IS NULL OR v_fila->>'tipo' NOT IN ('VENTA', 'DEVOLUCION') OR NULLIF(v_fila->>'ticket_id', '') IS NULL THEN
        RAISE EXCEPTION 'la caja solo sube ventas y devoluciones de un ticket';
      END IF;
      IF NULLIF(v_fila->>'usuario_id', '') IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso ua WHERE ua.usuario_id = (v_fila->>'usuario_id')::uuid AND ua.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'el usuario no es de este negocio';
      END IF;
      v_id := NULL;
      INSERT INTO movimientos_producto SELECT * FROM jsonb_populate_record(NULL::movimientos_producto, v_fila)
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_n := v_n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Producto de este negocio que ya no lleva existencias: descartado. De otro negocio: error.
      IF SQLERRM LIKE 'MOVIMIENTO_INVALIDO: el producto no lleva existencias%'
         AND EXISTS (SELECT 1 FROM productos WHERE id = (v_fila->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
        v_descartados := v_descartados || to_jsonb(v_fila->>'id');
      ELSE
        v_errores := v_errores || jsonb_build_object('tabla', 'movimientos_producto', 'id', v_fila->>'id', 'error', SQLERRM);
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicados', v_n, 'errores', v_errores, 'descartados', v_descartados);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_movimientos_producto(uuid, jsonb) FROM PUBLIC, anon, authenticated;
