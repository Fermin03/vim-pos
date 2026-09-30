-- 0139 · el permiso que el POS pedía y no existía, y el costo de envío con PIN de verdad
--
-- Auditoría integral 30/09/2026 (cabos sueltos del equipo B):
--
-- 1) `descuento.override_precio` NO EXISTÍA en `permisos`. El POS lo pide en dos lugares: cambiar
--    el precio de un renglón (modal-descuento-item) y repreciar una zona de envío (selector-zona).
--    `autorizaciones_pin.permiso_codigo` tiene FK a `permisos`, así que la autorización ni se
--    podía registrar: las dos funciones fallaban siempre con un error de llave foránea. Se da de
--    alta con la misma jerarquía y los mismos roles que `descuento.manual_aplicar` (DUEÑO, ADMIN,
--    SUPERVISOR): cambiar un precio es un descuento con otra forma.
--
-- 2) El PIN del costo de envío no protegía nada. La pantalla pedía el PIN y DESPUÉS hacía
--    `update zonas_envio set costo_mxn` directo, que cualquier empleado podía hacer sin PIN
--    (política solo por tenant; la 0133 no cubre zonas_envio). Ahora el cambio pasa por
--    `cambiar_costo_zona`, que consume la autorización (0134: permiso, entidad, monto, vigencia,
--    un uso), y UPDATE/DELETE directos de zonas quedan para quien administra la sucursal (el
--    panel). El ALTA desde la caja sigue abierta a propósito: llega un pedido de una colonia que
--    nadie capturó y no se le puede pedir PIN a nadie a esa hora (apps/pos/app/lib/zonas-envio.ts).
--
-- 3) `confirmar_devolucion(p_usuario_id)` registraba como autor lo que mandara el cliente.
--    Ahora es el usuario de la sesión cuando la hay (el parámetro queda para llamadas sin JWT).

-- ── 1 ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO permisos (codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin)
SELECT 'descuento.override_precio', 'Cambiar el precio de un renglón o el costo de una zona de envío',
       'Fijar un precio distinto al del catálogo en la caja. Alta en la 0139: el POS ya lo pedía.',
       'DESCUENTO', true, 3
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'descuento.override_precio');

INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
SELECT rp.rol_id, (SELECT id FROM permisos WHERE codigo = 'descuento.override_precio'), rp.concedido
  FROM rol_permisos rp
  JOIN permisos p ON p.id = rp.permiso_id
 WHERE p.codigo = 'descuento.manual_aplicar'
   AND NOT EXISTS (
     SELECT 1 FROM rol_permisos x
      WHERE x.rol_id = rp.rol_id
        AND x.permiso_id = (SELECT id FROM permisos WHERE codigo = 'descuento.override_precio'));

-- ── 2 ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cambiar_costo_zona(p_zona_id uuid, p_costo_mxn numeric, p_autorizacion_pin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  IF p_costo_mxn IS NULL OR p_costo_mxn < 0 OR p_costo_mxn > 99999 THEN
    RAISE EXCEPTION 'Costo de envío inválido.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM zonas_envio WHERE id = p_zona_id AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La zona no existe.' USING ERRCODE = 'P0002';
  END IF;
  -- Quien administra la sucursal no necesita PIN (es lo mismo que hace desde el panel).
  IF NOT (es_admin_del_tenant(v_tenant) AND p_autorizacion_pin_id IS NULL) THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['descuento.override_precio'],
                                  p_zona_id, p_costo_mxn);
  END IF;
  UPDATE zonas_envio SET costo_mxn = round(p_costo_mxn, 2), updated_at = now()
   WHERE id = p_zona_id AND tenant_id = v_tenant;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION cambiar_costo_zona(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cambiar_costo_zona(uuid, numeric, uuid) TO authenticated;

DROP POLICY IF EXISTS zonas_envio_update ON zonas_envio;
CREATE POLICY zonas_envio_update ON zonas_envio FOR UPDATE
  USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
  WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
DROP POLICY IF EXISTS zonas_envio_delete ON zonas_envio;
CREATE POLICY zonas_envio_delete ON zonas_envio FOR DELETE
  USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));

-- ── 3 ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirmar_devolucion(p_devolucion_id uuid, p_usuario_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_devolucion devoluciones%ROWTYPE;
BEGIN
  SELECT * INTO v_devolucion FROM devoluciones WHERE id = p_devolucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;

  IF v_devolucion.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo devoluciones en BORRADOR se pueden confirmar (estado actual: %)', v_devolucion.estado;
  END IF;

  UPDATE devoluciones
  SET estado     = 'CONFIRMADA',
      -- 0139: el autor es quien tiene la sesión; el parámetro solo cuenta sin JWT (SQL directo).
      updated_by = COALESCE(auth.uid(), p_usuario_id)
  WHERE id = p_devolucion_id;
  -- Los triggers trg_devolucion_inventario y trg_devolucion_pago_efectivo disparan
  -- automáticamente al cambiar a CONFIRMADA.
END;
$function$;
