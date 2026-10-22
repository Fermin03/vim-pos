-- Belleza, entrega 2: colaborador por renglón, comisiones y cita cobrada (diseño 2026-10-18).
--
-- · El colaborador va en el renglón (`ticket_items.colaborador_id`), lo pone agregar_item_a_ticket
--   y editar el renglón (reemplazar_item_ticket) lo conserva.
-- · Al insertar el renglón, un disparador CONGELA la regla de comisión en el propio renglón: la
--   comisión de una venta no cambia si el dueño edita las reglas después. El disparador no corre en
--   el push del sync (session_replication_role = replica, 0219), así que la nube guarda lo que
--   congeló la caja; y si el renglón ya trae su regla, no la pisa.
-- · La comisión se calcula al leer (vw_comisiones_renglon): no hay tabla de comisiones.
-- · La cita queda COBRADA cuando su ticket se paga; si el ticket se cancela, vuelve a TERMINADA.
-- · Un renglón sin colaborador (restaurantes, tiendas, la caja vieja) se comporta igual que antes.

-- ── §1 Configuración del negocio ────────────────────────────────────────────
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS agenda_cobro_modo text NOT NULL DEFAULT 'AL_FINAL'
    CHECK (agenda_cobro_modo IN ('AL_FINAL', 'ANTICIPO', 'TODO')),
  ADD COLUMN IF NOT EXISTS agenda_cancelar_horas integer NOT NULL DEFAULT 24
    CHECK (agenda_cancelar_horas BETWEEN 0 AND 168),
  ADD COLUMN IF NOT EXISTS agenda_comision_base text NOT NULL DEFAULT 'COBRADO'
    CHECK (agenda_comision_base IN ('COBRADO', 'LISTA')),
  ADD COLUMN IF NOT EXISTS agenda_comision_productos_pct numeric(5,2) NULL
    CHECK (agenda_comision_productos_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS agenda_periodo_comisiones text NOT NULL DEFAULT 'SEMANAL'
    CHECK (agenda_periodo_comisiones IN ('SEMANAL', 'QUINCENAL'));
COMMENT ON COLUMN configuracion_tenant.agenda_cobro_modo IS 'Cuándo se cobra una cita: AL_FINAL «Al final», ANTICIPO «Anticipo al apartar», TODO «Todo por adelantado» (0221).';
COMMENT ON COLUMN configuracion_tenant.agenda_cancelar_horas IS 'Horas antes de la cita hasta las que se cancela con devolución del anticipo (0221).';
COMMENT ON COLUMN configuracion_tenant.agenda_comision_base IS 'COBRADO «Sobre lo cobrado (con descuentos, sin IVA)» o LISTA «Sobre el precio de lista (sin IVA)». Se congela en el renglón (0221).';
COMMENT ON COLUMN configuracion_tenant.agenda_comision_productos_pct IS 'Porcentaje de comisión por productos que no son servicio; NULL = no dan comisión (0221).';
COMMENT ON COLUMN configuracion_tenant.agenda_periodo_comisiones IS 'SEMANAL (lunes a domingo) o QUINCENAL (1–15 y 16–fin de mes) (0221).';

-- Cuerpo vigente de la 0218 más las columnas nuevas: solo el dueño o un administrador las cambia.
CREATE OR REPLACE FUNCTION configuracion_tenant_agenda_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cambio boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_cambio := NEW.agenda_tolerancia_min IS DISTINCT FROM OLD.agenda_tolerancia_min
             OR NEW.agenda_cobro_modo IS DISTINCT FROM OLD.agenda_cobro_modo
             OR NEW.agenda_cancelar_horas IS DISTINCT FROM OLD.agenda_cancelar_horas
             OR NEW.agenda_comision_base IS DISTINCT FROM OLD.agenda_comision_base
             OR NEW.agenda_comision_productos_pct IS DISTINCT FROM OLD.agenda_comision_productos_pct
             OR NEW.agenda_periodo_comisiones IS DISTINCT FROM OLD.agenda_periodo_comisiones;
  ELSE
    v_cambio := NEW.agenda_tolerancia_min <> 15
             OR NEW.agenda_cobro_modo <> 'AL_FINAL'
             OR NEW.agenda_cancelar_horas <> 24
             OR NEW.agenda_comision_base <> 'COBRADO'
             OR NEW.agenda_comision_productos_pct IS NOT NULL
             OR NEW.agenda_periodo_comisiones <> 'SEMANAL';
  END IF;
  IF v_cambio AND NOT es_admin_del_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar las reglas de la agenda.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_agenda_guardia() FROM PUBLIC, anon, authenticated;

-- ── §2 Reglas por servicio, por colaborador y sueldo ───────────────────────
-- Escritura solo de dueño o administrador: RLS de la 0218.
ALTER TABLE servicios_agenda
  ADD COLUMN IF NOT EXISTS comision_tipo  text NULL CHECK (comision_tipo IN ('PORCENTAJE', 'MONTO')),
  ADD COLUMN IF NOT EXISTS comision_valor numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS anticipo_tipo  text NULL CHECK (anticipo_tipo IN ('PORCENTAJE', 'MONTO')),
  ADD COLUMN IF NOT EXISTS anticipo_valor numeric(12,2) NULL,
  ADD CONSTRAINT servicios_agenda_comision_coherente CHECK (
    (comision_tipo IS NULL) = (comision_valor IS NULL)
    AND (comision_valor IS NULL OR comision_valor >= 0)
    AND (comision_tipo IS DISTINCT FROM 'PORCENTAJE' OR comision_valor <= 100)),
  ADD CONSTRAINT servicios_agenda_anticipo_coherente CHECK (
    (anticipo_tipo IS NULL) = (anticipo_valor IS NULL)
    AND (anticipo_valor IS NULL OR anticipo_valor >= 0)
    AND (anticipo_tipo IS DISTINCT FROM 'PORCENTAJE' OR anticipo_valor <= 100));

ALTER TABLE servicio_colaborador
  ADD COLUMN IF NOT EXISTS comision_tipo  text NULL CHECK (comision_tipo IN ('PORCENTAJE', 'MONTO')),
  ADD COLUMN IF NOT EXISTS comision_valor numeric(12,2) NULL,
  ADD CONSTRAINT servicio_colaborador_comision_coherente CHECK (
    (comision_tipo IS NULL) = (comision_valor IS NULL)
    AND (comision_valor IS NULL OR comision_valor >= 0)
    AND (comision_tipo IS DISTINCT FROM 'PORCENTAJE' OR comision_valor <= 100));
COMMENT ON COLUMN servicio_colaborador.comision_tipo IS 'Excepción de comisión de este colaborador en este servicio; gana a la del servicio (0221).';

ALTER TABLE colaboradores_agenda
  ADD COLUMN IF NOT EXISTS sueldo_periodo_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (sueldo_periodo_mxn >= 0);
COMMENT ON COLUMN colaboradores_agenda.sueldo_periodo_mxn IS 'Sueldo fijo por periodo de comisiones del negocio (0221).';

-- ── §3 Colaborador y regla congelada en el renglón ─────────────────────────
ALTER TABLE ticket_items
  ADD COLUMN IF NOT EXISTS colaborador_id uuid NULL REFERENCES usuarios_perfil(id),
  ADD COLUMN IF NOT EXISTS comision_tipo  text NULL CHECK (comision_tipo IN ('PORCENTAJE', 'MONTO')),
  ADD COLUMN IF NOT EXISTS comision_valor numeric(12,2) NULL CHECK (comision_valor >= 0),
  ADD COLUMN IF NOT EXISTS comision_base  text NULL CHECK (comision_base IN ('COBRADO', 'LISTA')),
  ADD CONSTRAINT ticket_items_comision_coherente CHECK (
    (comision_tipo IS NULL) = (comision_valor IS NULL) AND (comision_tipo IS NULL) = (comision_base IS NULL));
CREATE INDEX IF NOT EXISTS idx_ticket_items_colaborador ON ticket_items (tenant_id, colaborador_id)
  WHERE colaborador_id IS NOT NULL;
COMMENT ON COLUMN ticket_items.colaborador_id IS 'Quien atendió o vendió el renglón; NULL = sin comisión (0221).';
COMMENT ON COLUMN ticket_items.comision_tipo IS 'Regla de comisión congelada al insertar el renglón (0221). NULL = sin comisión.';

-- Precedencia: servicio_colaborador → servicios_agenda → % de productos (solo si no es servicio).
CREATE OR REPLACE FUNCTION ticket_items_congelar_comision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo  text;
  v_valor numeric(12,2);
  v_base  text;
  v_pct   numeric(5,2);
BEGIN
  IF NEW.colaborador_id IS NULL OR NEW.comision_tipo IS NOT NULL OR NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sc.comision_tipo, sc.comision_valor INTO v_tipo, v_valor
    FROM servicio_colaborador sc
   WHERE sc.producto_id = NEW.producto_id AND sc.usuario_id = NEW.colaborador_id
     AND sc.tenant_id = NEW.tenant_id AND sc.comision_tipo IS NOT NULL;
  IF v_tipo IS NULL THEN
    SELECT sa.comision_tipo, sa.comision_valor INTO v_tipo, v_valor
      FROM servicios_agenda sa
     WHERE sa.producto_id = NEW.producto_id AND sa.tenant_id = NEW.tenant_id AND sa.comision_tipo IS NOT NULL;
  END IF;

  SELECT c.agenda_comision_base, c.agenda_comision_productos_pct INTO v_base, v_pct
    FROM configuracion_tenant c WHERE c.tenant_id = NEW.tenant_id;

  IF v_tipo IS NULL AND v_pct IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM servicios_agenda sa
                      WHERE sa.producto_id = NEW.producto_id AND sa.tenant_id = NEW.tenant_id AND sa.activo) THEN
    v_tipo := 'PORCENTAJE';
    v_valor := v_pct;
  END IF;

  IF v_tipo IS NOT NULL THEN
    NEW.comision_tipo  := v_tipo;
    NEW.comision_valor := v_valor;
    NEW.comision_base  := COALESCE(v_base, 'COBRADO');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ticket_items_congelar_comision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ticket_items_congelar_comision ON ticket_items;
CREATE TRIGGER ticket_items_congelar_comision
  BEFORE INSERT ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION ticket_items_congelar_comision();

-- ── §4 agregar_item_a_ticket con colaborador ───────────────────────────────
-- Cuerpo vigente de la 0152 más p_colaborador_id: valida que sea colaborador activo del negocio
-- (criterio de _agenda_tramos, 0219, sin exigir la sucursal) y toma su precio del servicio si lo
-- tiene. Se borra la de 6 parámetros: con las dos, una llamada con 6 argumentos sería ambigua. La
-- caja vieja la sigue llamando con 6 y el DEFAULT la cubre.
DROP FUNCTION IF EXISTS agregar_item_a_ticket(uuid, uuid, numeric, text, jsonb, varchar);
CREATE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
  p_client_id_local varchar DEFAULT NULL,
  p_colaborador_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id     uuid;
  v_sucursal_id   uuid;
  v_ticket_estado ticket_estado_fiscal;
  v_producto      record;
  v_item_id       uuid;
  v_modif         jsonb;
  v_opcion        record;
  v_next_orden    integer;
  v_precio_colab  numeric(12,2);
BEGIN
  SELECT tenant_id, sucursal_id, estado_fiscal INTO v_tenant_id, v_sucursal_id, v_ticket_estado
  FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar items a tickets BORRADOR o ABIERTO (estado actual: %)', v_ticket_estado;
  END IF;

  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM ticket_items
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_item_id; END IF;
  END IF;

  -- 0221: colaborador activo del negocio y todavía empleado (acceso activo, perfil sin borrar).
  IF p_colaborador_id IS NOT NULL THEN
    IF NOT EXISTS (
         SELECT 1 FROM colaboradores_agenda ca
          WHERE ca.tenant_id = v_tenant_id AND ca.usuario_id = p_colaborador_id AND ca.activo
            AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = v_tenant_id AND ua.usuario_id = p_colaborador_id AND ua.activo)
            AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = p_colaborador_id AND up.deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el colaborador no está activo en este negocio.' USING ERRCODE = '22023';
    END IF;
    SELECT sc.precio_mxn INTO v_precio_colab
      FROM servicio_colaborador sc
     WHERE sc.producto_id = p_producto_id AND sc.usuario_id = p_colaborador_id AND sc.tenant_id = v_tenant_id;
  END IF;

  SELECT p.id, p.nombre, p.codigo_interno AS sku,
         COALESCE(v_precio_colab, precio_producto_en_sucursal(p.id, v_sucursal_id)) AS precio_mxn,
         p.tasa_iva, p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
         p.modos_servicio_disponibles AS modos_servicio_aplicables,
         p.es_combo,
         c.nombre AS categoria_nombre,
         ac.nombre AS area_cocina_nombre
  INTO v_producto
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN areas_cocina ac ON ac.id = p.area_cocina_id
  WHERE p.id = p_producto_id
    AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no existe o está eliminado', p_producto_id;
  END IF;
  -- 0111: un combo sin hijos sería un renglón que cobra y no cocina. Tiene su propia RPC.
  IF v_producto.es_combo THEN
    RAISE EXCEPTION 'El producto "%" es un combo: usa agregar_combo_a_ticket', v_producto.nombre;
  END IF;

  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1
  INTO v_next_orden
  FROM ticket_items
  WHERE ticket_id = p_ticket_id;

  INSERT INTO ticket_items (
    tenant_id, ticket_id, producto_id, cantidad, orden_visualizacion,
    producto_nombre_snapshot, producto_sku_snapshot,
    precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
    clave_sat_snapshot, unidad_sat_snapshot,
    categoria_nombre_snapshot, modos_servicio_snapshot, area_cocina_nombre_snapshot,
    nota_cocina, client_id_local, created_by, colaborador_id
  ) VALUES (
    v_tenant_id, p_ticket_id, v_producto.id, p_cantidad, v_next_orden,
    v_producto.nombre, v_producto.sku,
    v_producto.precio_mxn, v_producto.tasa_iva, v_producto.iva_incluido_en_precio,
    v_producto.clave_sat, v_producto.unidad_sat,
    v_producto.categoria_nombre, v_producto.modos_servicio_aplicables, v_producto.area_cocina_nombre,
    p_nota_cocina, p_client_id_local, auth.uid(), p_colaborador_id
  ) RETURNING id INTO v_item_id;

  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    FOR v_modif IN SELECT * FROM jsonb_array_elements(p_modificadores)
    LOOP
      SELECT om.id, om.nombre, om.precio_extra_mxn AS precio_extra,
             gm.id AS grupo_id, gm.nombre AS grupo_nombre, gm.naturaleza
      INTO v_opcion
      FROM opciones_modificador om
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      WHERE om.id = (v_modif->>'opcion_modificador_id')::uuid
        AND om.deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Opción de modificador % no existe', v_modif->>'opcion_modificador_id';
      END IF;
      INSERT INTO ticket_item_modificadores (
        tenant_id, ticket_item_id, opcion_modificador_id, grupo_id,
        grupo_nombre_snapshot, opcion_nombre_snapshot,
        precio_extra_snapshot, naturaleza_snapshot,
        cantidad, monto_total_mxn, created_by
      ) VALUES (
        v_tenant_id, v_item_id, v_opcion.id, v_opcion.grupo_id,
        v_opcion.grupo_nombre, v_opcion.nombre,
        v_opcion.precio_extra, v_opcion.naturaleza,
        COALESCE((v_modif->>'cantidad')::integer, 1),
        v_opcion.precio_extra * COALESCE((v_modif->>'cantidad')::integer, 1) * p_cantidad,
        auth.uid()
      );
    END LOOP;
  END IF;

  RETURN v_item_id;
END;
$$;
COMMENT ON FUNCTION agregar_item_a_ticket(uuid, uuid, numeric, text, jsonb, varchar, uuid) IS
  'Inserta un item con snapshot completo del producto y sus modificadores. Idempotente vía client_id_local. 0221: colaborador opcional (activo del negocio) y su precio del servicio.';
-- Mismos permisos que la de 6 parámetros (los de siempre del esquema).
GRANT EXECUTE ON FUNCTION agregar_item_a_ticket(uuid, uuid, numeric, text, jsonb, varchar, uuid) TO anon, authenticated, service_role;

-- ── §5 Cita cobrada ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vincular_cita_ticket(p_cita uuid, p_ticket uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_cita   citas%ROWTYPE;
  v_suc    uuid;
BEGIN
  SELECT sucursal_id INTO v_suc FROM tickets
   WHERE id = p_ticket AND tenant_id = v_tenant AND estado_fiscal IN ('BORRADOR', 'ABIERTO') AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no está abierta en este negocio.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cita FROM citas
   WHERE id = p_cita AND tenant_id = v_tenant AND estado IN ('AGENDADA', 'EN_CURSO', 'TERMINADA') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no se puede cobrar.' USING ERRCODE = '22023';
  END IF;
  IF v_cita.sucursal_id <> v_suc THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita es de otra sucursal.' USING ERRCODE = '22023';
  END IF;
  -- No se roba una cita que ya está en otra venta abierta (sí se reemplaza la de una venta cancelada).
  IF v_cita.ticket_id IS NOT NULL AND v_cita.ticket_id <> p_ticket AND EXISTS (
       SELECT 1 FROM tickets WHERE id = v_cita.ticket_id AND estado_fiscal IN ('BORRADOR', 'ABIERTO') AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita ya está en otra venta abierta.' USING ERRCODE = '22023';
  END IF;
  UPDATE citas SET ticket_id = p_ticket WHERE id = p_cita;
END;
$$;
COMMENT ON FUNCTION vincular_cita_ticket(uuid, uuid) IS
  'Liga una cita (por llegar, atendiéndose o terminada) a una venta abierta del mismo negocio; al pagarse la venta, la cita queda COBRADA (0221).';
REVOKE EXECUTE ON FUNCTION vincular_cita_ticket(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION vincular_cita_ticket(uuid, uuid) TO authenticated, service_role;

-- Pagado → COBRADA; cancelado → de vuelta a TERMINADA (para cobrarla en otra venta).
CREATE OR REPLACE FUNCTION tickets_cita_cobrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado_fiscal IN ('PAGADO', 'FACTURADO') AND OLD.estado_fiscal NOT IN ('PAGADO', 'FACTURADO') THEN
    UPDATE citas SET estado = 'COBRADA'
     WHERE ticket_id = NEW.id AND tenant_id = NEW.tenant_id AND estado IN ('AGENDADA', 'EN_CURSO', 'TERMINADA');
  ELSIF NEW.estado_fiscal = 'CANCELADO' THEN
    UPDATE citas SET estado = 'TERMINADA'
     WHERE ticket_id = NEW.id AND tenant_id = NEW.tenant_id AND estado = 'COBRADA';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION tickets_cita_cobrada() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tickets_cita_cobrada ON tickets;
CREATE TRIGGER trg_tickets_cita_cobrada
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW WHEN (OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal)
  EXECUTE FUNCTION tickets_cita_cobrada();
-- El disparador corre en cada cobro o cancelación de cualquier negocio y busca la cita por su venta.
CREATE INDEX IF NOT EXISTS idx_citas_ticket ON citas (ticket_id) WHERE ticket_id IS NOT NULL;

-- ── §6 Comisiones al leer ───────────────────────────────────────────────────
-- Renglones con colaborador de tickets PAGADO o FACTURADO, no cancelados, menos la parte devuelta
-- (devoluciones CONFIRMADA). LISTA = precio de lista × cantidad sin IVA (sin modificadores).
-- COBRADO = total del renglón × factor del ticket, sin IVA. El factor reparte entre los renglones
-- que no son cargo lo que el ticket descontó a nivel ticket (descuento manual, promoción y canje de
-- lealtad; recalcular_totales_ticket solo los resta de tickets.total_mxn y nunca del envío):
-- (total del ticket − cargos) / renglones, acotado a [0, 1]. El IVA se quita al final con la tasa
-- (total / (1 + tasa)), no restando iva_item_mxn ya redondeado; se redondea una sola vez.
-- venta_mxn = lo cobrado sin IVA (para «ventas por colaborador»). Sin regla congelada, comisión 0.
-- Visibilidad: el RLS de ticket_items acota al negocio; además, un usuario autenticado que no es
-- dueño ni administrador solo ve sus renglones. Sin JWT de usuario (postgres, service_role) se ve todo.
CREATE OR REPLACE VIEW vw_comisiones_renglon WITH (security_invoker = true) AS
WITH r AS (
  SELECT ti.tenant_id, ti.ticket_id, ti.id AS ticket_item_id, ti.colaborador_id,
         (t.fecha_pago AT TIME ZONE 'America/Mexico_City')::date AS fecha_negocio,
         ti.producto_nombre_snapshot::text AS producto_nombre,
         EXISTS (SELECT 1 FROM servicios_agenda sa WHERE sa.producto_id = ti.producto_id) AS es_servicio,
         ti.comision_tipo, ti.comision_valor, ti.comision_base, ti.cantidad,
         ti.cantidad - COALESCE((
           SELECT sum(di.cantidad_devuelta)
             FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
            WHERE di.ticket_item_id_original = ti.id AND d.estado = 'CONFIRMADA' AND d.deleted_at IS NULL), 0) AS cantidad_neta,
         ti.total_item_mxn
           * CASE WHEN s.lineas > 0 THEN LEAST(1, GREATEST(0, (t.total_mxn - s.cargos) / s.lineas)) ELSE 1 END
           / (1 + ti.tasa_iva_snapshot / 100) AS cobrado_sin_iva,
         COALESCE(ti.precio_unitario_original_snapshot, ti.precio_unitario_snapshot) * ti.cantidad
           / CASE WHEN ti.iva_incluido_en_precio_snapshot THEN 1 + ti.tasa_iva_snapshot / 100 ELSE 1 END AS lista_sin_iva
    FROM ticket_items ti
    JOIN tickets t ON t.id = ti.ticket_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(x.total_item_mxn) FILTER (WHERE x.cargo_tipo IS NULL), 0)     AS lineas,
             COALESCE(sum(x.total_item_mxn) FILTER (WHERE x.cargo_tipo IS NOT NULL), 0) AS cargos
        FROM ticket_items x WHERE x.ticket_id = t.id AND NOT x.cancelado) s
   WHERE ti.colaborador_id IS NOT NULL
     AND NOT ti.cancelado
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
     AND t.deleted_at IS NULL
     AND (auth.role() IS DISTINCT FROM 'authenticated'
          OR ti.colaborador_id = auth.uid()
          OR es_admin_del_tenant(ti.tenant_id))
), b AS (
  SELECT r.*,
         round(r.cobrado_sin_iva * r.cantidad_neta / r.cantidad, 2) AS venta_mxn,
         round(CASE WHEN r.comision_base = 'LISTA' THEN r.lista_sin_iva ELSE r.cobrado_sin_iva END
               * r.cantidad_neta / r.cantidad, 2) AS base_mxn
    FROM r
)
SELECT b.tenant_id, b.ticket_id, b.ticket_item_id, b.colaborador_id, b.fecha_negocio,
       b.producto_nombre, b.es_servicio, b.base_mxn,
       (CASE b.comision_tipo
          WHEN 'PORCENTAJE' THEN round(b.base_mxn * b.comision_valor / 100, 2)
          WHEN 'MONTO' THEN round(b.comision_valor * b.cantidad_neta, 2)
          ELSE 0 END)::numeric(12,2) AS comision_mxn,
       b.venta_mxn
  FROM b;
COMMENT ON VIEW vw_comisiones_renglon IS
  'Comisión de cada renglón con colaborador, calculada al leer con la regla congelada (0221). Un colaborador que no administra solo ve los suyos.';
REVOKE ALL ON vw_comisiones_renglon FROM PUBLIC, anon;
GRANT SELECT ON vw_comisiones_renglon TO authenticated, service_role;

-- Periodo del negocio que contiene p_fecha (ambas fechas inclusive): semana lunes–domingo o
-- quincena 1–15 / 16–fin de mes.
CREATE OR REPLACE FUNCTION periodo_comisiones(p_fecha date)
RETURNS TABLE(desde date, hasta date)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH m AS (SELECT date_trunc('month', p_fecha)::date AS ini,
                    p_fecha - (extract(isodow FROM p_fecha)::int - 1) AS lunes)
  SELECT CASE WHEN q THEN (CASE WHEN extract(day FROM p_fecha) <= 15 THEN m.ini ELSE m.ini + 15 END) ELSE m.lunes END,
         CASE WHEN q THEN (CASE WHEN extract(day FROM p_fecha) <= 15 THEN m.ini + 14
                                ELSE (m.ini + interval '1 month')::date - 1 END)
              ELSE m.lunes + 6 END
    FROM m, LATERAL (SELECT COALESCE((SELECT agenda_periodo_comisiones = 'QUINCENAL' FROM configuracion_tenant
                                       WHERE tenant_id = current_tenant_id()), false) AS q) x;
$$;
COMMENT ON FUNCTION periodo_comisiones(date) IS 'Periodo de comisiones del negocio que contiene la fecha: desde y hasta, inclusive (0221).';

-- Por colaborador: servicios, ventas sin IVA, comisiones y sueldo (solo si el rango es exactamente
-- un periodo del negocio). SECURITY INVOKER: la vista ya acota quién ve qué.
CREATE OR REPLACE FUNCTION comisiones_periodo(p_desde date, p_hasta date)
RETURNS TABLE(usuario_id uuid, nombre text, servicios int, ventas_mxn numeric, comision_servicios_mxn numeric,
              comision_productos_mxn numeric, sueldo_mxn numeric, total_mxn numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH r AS (
    SELECT v.* FROM vw_comisiones_renglon v
     WHERE v.tenant_id = current_tenant_id() AND v.fecha_negocio BETWEEN p_desde AND p_hasta
  ), c AS (
    SELECT ca.usuario_id, ca.sueldo_periodo_mxn
      FROM colaboradores_agenda ca
     WHERE ca.tenant_id = current_tenant_id()
       AND (ca.activo OR EXISTS (SELECT 1 FROM r WHERE r.colaborador_id = ca.usuario_id))
       AND (auth.role() IS DISTINCT FROM 'authenticated'
            OR ca.usuario_id = auth.uid()
            OR es_admin_del_tenant(ca.tenant_id))
  ), u AS (
    SELECT c.usuario_id FROM c UNION SELECT r.colaborador_id FROM r
  ), s AS (
    SELECT u.usuario_id,
           count(r.ticket_item_id) FILTER (WHERE r.es_servicio)::int AS servicios,
           COALESCE(sum(r.venta_mxn), 0) AS ventas,
           COALESCE(sum(r.comision_mxn) FILTER (WHERE r.es_servicio), 0) AS com_serv,
           COALESCE(sum(r.comision_mxn) FILTER (WHERE NOT r.es_servicio), 0) AS com_prod,
           CASE WHEN (p_desde, p_hasta) = (SELECT p.desde, p.hasta FROM periodo_comisiones(p_desde) p)
                THEN COALESCE(max(c.sueldo_periodo_mxn), 0) ELSE 0 END AS sueldo
      FROM u
      LEFT JOIN r ON r.colaborador_id = u.usuario_id
      LEFT JOIN c ON c.usuario_id = u.usuario_id
     GROUP BY u.usuario_id
  )
  SELECT s.usuario_id, up.nombre::text, s.servicios, s.ventas, s.com_serv, s.com_prod, s.sueldo,
         s.com_serv + s.com_prod + s.sueldo
    FROM s JOIN usuarios_perfil up ON up.id = s.usuario_id
   ORDER BY up.nombre;
$$;
COMMENT ON FUNCTION comisiones_periodo(date, date) IS
  'Comisiones por colaborador entre dos fechas de negocio (inclusive). Sueldo solo si el rango es un periodo del negocio. Un colaborador que no administra solo ve su fila (0221).';

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['periodo_comisiones(date)', 'comisiones_periodo(date, date)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ── §7 Editar un renglón conserva su colaborador ────────────────────────────
-- reemplazar_item_ticket: la de la 0119 (vigente). Cambio "0221": el renglón nuevo lleva el
-- colaborador del viejo (las líneas son del mismo producto), así que conserva su precio y la regla
-- de comisión se vuelve a congelar. Sin colaborador, igual que antes.
CREATE OR REPLACE FUNCTION reemplazar_item_ticket(
  p_ticket_item_id uuid,
  p_lineas         jsonb
) RETURNS uuid[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_item        record;
  v_linea       jsonb;
  v_client      text;
  v_nuevo       uuid;
  v_nuevos      uuid[] := '{}';
  v_filas_nuevas uuid[];
  v_ultimo      integer;
  v_n_filas     integer;
  v_existentes  uuid[];
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Hace falta al menos una línea para reemplazar el renglón';
  END IF;

  SELECT ti.*, t.estado_fiscal
    INTO v_item
    FROM ticket_items ti
    JOIN tickets t ON t.id = ti.ticket_id
   WHERE ti.id = p_ticket_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;

  -- Reintento de una edición que ya se aplicó: devolver lo que quedó, no fallar.
  IF v_item.cancelado AND v_item.motivo_cancelacion = 'EDITADO' THEN
    SELECT array_agg(ti.id ORDER BY ti.orden_visualizacion) INTO v_existentes
      FROM ticket_items ti
     WHERE ti.tenant_id = v_item.tenant_id
       AND ti.client_id_local IN (SELECT l->>'client_id_local' FROM jsonb_array_elements(p_lineas) l);
    IF COALESCE(array_length(v_existentes, 1), 0) = jsonb_array_length(p_lineas) THEN
      RETURN v_existentes;
    END IF;
  END IF;

  IF v_item.cancelado THEN RAISE EXCEPTION 'El producto ya está cancelado'; END IF;
  IF v_item.combo_rol = 'HIJO' THEN RAISE EXCEPTION 'Edita el combo completo'; END IF;
  IF v_item.cargo_tipo IS NOT NULL THEN RAISE EXCEPTION 'El cargo de envío se cambia desde la zona'; END IF;
  IF v_item.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se editan productos de cuentas abiertas (estado actual: %)', v_item.estado_fiscal;
  END IF;
  IF EXISTS (
    SELECT 1 FROM ticket_items
     WHERE (id = p_ticket_item_id OR (parent_item_id = p_ticket_item_id AND cancelado = false))
       AND enviado_cocina_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El producto ya se mandó a cocina: ya no se puede modificar';
  END IF;
  IF v_item.precio_override THEN
    RAISE EXCEPTION 'El producto tiene el precio cambiado con autorización: quítalo antes de editarlo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ticket_descuentos_manuales
     WHERE ticket_item_id = p_ticket_item_id AND reversado = false
  ) THEN
    RAISE EXCEPTION 'El producto tiene un descuento: quítalo antes de editarlo';
  END IF;

  -- Cada línea: del mismo producto, con cantidad, y con un client_id_local que no exista todavía
  -- (si existiera, las RPC de alta devolverían ESE renglón por idempotencia y lo robaríamos).
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF COALESCE(v_linea->>'combo_producto_id', v_linea->>'producto_id') IS DISTINCT FROM v_item.producto_id::text THEN
      RAISE EXCEPTION 'Las líneas tienen que ser del mismo producto que el renglón que se edita';
    END IF;
    -- COALESCE: en un renglón normal combo_rol es NULL, y NULL <> algo no dispara el IF.
    IF COALESCE(v_item.combo_rol = 'PADRE', false) <> (v_linea ? 'combo_producto_id') THEN
      RAISE EXCEPTION 'Un combo se reemplaza por combos y un producto por productos';
    END IF;
    IF COALESCE((v_linea->>'cantidad')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;
    v_client := NULLIF(v_linea->>'client_id_local', '');
    IF v_client IS NULL THEN RAISE EXCEPTION 'Cada línea necesita su client_id_local'; END IF;
    IF EXISTS (SELECT 1 FROM ticket_items WHERE tenant_id = v_item.tenant_id AND client_id_local = v_client) THEN
      RAISE EXCEPTION 'client_id_local % ya existe', v_client;
    END IF;
    -- Los componentes de un combo también: reusar el id de un hijo del renglón viejo (cancelado,
    -- pero sigue ahí) haría que agregar_combo_a_ticket lo encontrara y rechazara el combo.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(v_linea->'componentes', '[]'::jsonb)) c
        JOIN ticket_items ti ON ti.tenant_id = v_item.tenant_id AND ti.client_id_local = c->>'client_id_local'
    ) THEN
      RAISE EXCEPTION 'Un componente trae un client_id_local que ya existe: manda ids nuevos';
    END IF;
  END LOOP;

  -- El hueco que deja el renglón viejo: su último orden (el del padre o el de su último hijo).
  SELECT MAX(orden_visualizacion) INTO v_ultimo
    FROM ticket_items
   WHERE id = p_ticket_item_id OR parent_item_id = p_ticket_item_id;

  -- 2) Cancelar el viejo con sus hijos. El trigger recalcula los totales (UPDATE OF cancelado).
  UPDATE ticket_items
     SET cancelado = true,
         motivo_cancelacion = 'EDITADO',
         usuario_cancelo_id = auth.uid(),
         cancelado_at = now()
   WHERE id = p_ticket_item_id
      OR (parent_item_id = p_ticket_item_id AND cancelado = false);

  -- 3) Las líneas nuevas, por las RPC de alta.
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF v_linea ? 'combo_producto_id' THEN
      v_nuevo := agregar_combo_a_ticket(
        v_item.ticket_id,
        (v_linea->>'combo_producto_id')::uuid,
        (v_linea->>'cantidad')::numeric,
        COALESCE(v_linea->'componentes', '[]'::jsonb),
        '[]'::jsonb,
        NULLIF(v_linea->>'nota_cocina', ''),
        v_linea->>'client_id_local');
    ELSE
      v_nuevo := agregar_item_a_ticket(
        v_item.ticket_id,
        (v_linea->>'producto_id')::uuid,
        (v_linea->>'cantidad')::numeric,
        NULLIF(v_linea->>'nota_cocina', ''),
        COALESCE(v_linea->'modificadores', '[]'::jsonb),
        v_linea->>'client_id_local',
        v_item.colaborador_id);   -- 0221
    END IF;
    v_nuevos := v_nuevos || v_nuevo;
  END LOOP;

  -- 4) Acomodarlas donde estaba el viejo: se recorre lo que venía después y las nuevas (con sus
  --    hijos, en el orden en que entraron) ocupan el hueco.
  SELECT array_agg(id ORDER BY orden_visualizacion) INTO v_filas_nuevas
    FROM ticket_items
   WHERE id = ANY (v_nuevos) OR parent_item_id = ANY (v_nuevos);
  v_n_filas := array_length(v_filas_nuevas, 1);

  UPDATE ticket_items
     SET orden_visualizacion = orden_visualizacion + v_n_filas
   WHERE ticket_id = v_item.ticket_id
     AND orden_visualizacion > v_ultimo
     AND NOT (id = ANY (v_filas_nuevas));

  UPDATE ticket_items ti
     SET orden_visualizacion = v_ultimo + x.pos
    FROM unnest(v_filas_nuevas) WITH ORDINALITY AS x(id, pos)
   WHERE ti.id = x.id;

  RETURN v_nuevos;
END;
$$;
