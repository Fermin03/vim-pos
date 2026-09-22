-- ============================================================================
-- 0116 — Zonas de envío: el domicilio se cobra según dónde vive el cliente.
--
-- POR QUÉ UN RENGLÓN DEL TICKET Y NO UNA COLUMNA DE tickets
--
-- La tentación es copiar `propina_mxn`: una columna más y a otra cosa. No se puede. Los totales
-- del ticket salen SOLO de ticket_items (recalcular_totales_ticket, 0008 §8.1), y el armador de
-- conceptos del CFDI valida que la suma de los renglones dé exactamente tickets.total_mxn — y
-- truena a propósito si no (ConceptosIncoherentes, _shared/pac/conceptos.ts). Un cargo por fuera
-- de los renglones produciría tickets que no se pueden facturar.
--
-- Como renglón, en cambio, no hay que tocar nada: totales, ticket impreso, CFDI, factura global,
-- reportes y sync ya saben qué hacer con un renglón.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zonas_envio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre      varchar(60) NOT NULL,
  costo_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mxn >= 0),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

COMMENT ON TABLE zonas_envio IS 'Zonas de reparto por sucursal con su cargo de envío. El cargo entra al ticket como renglón (cargo_tipo=ENVIO), nunca como columna.';

-- Por sucursal y no por tenant: las colonias de León no le sirven a una sucursal de otra ciudad.
-- Se comparan sin distinguir mayúsculas ni espacios de sobra, que es como se capturan de verdad.
CREATE UNIQUE INDEX IF NOT EXISTS zona_envio_nombre_uq
  ON zonas_envio (sucursal_id, lower(btrim(nombre))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_zonas_envio_sucursal
  ON zonas_envio (sucursal_id) WHERE deleted_at IS NULL AND activa;

ALTER TABLE zonas_envio ENABLE ROW LEVEL SECURITY;

-- Explícito y no por default privileges (0065): esos solo aplican si la tabla la crea el mismo rol
-- que los definió, y una tabla sin privilegio falla con "permission denied" antes del RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON zonas_envio TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY zonas_envio_select ON zonas_envio
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_insert ON zonas_envio
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_update ON zonas_envio
    FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_delete ON zonas_envio
    FOR DELETE USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_zonas_envio_updated_at
  BEFORE UPDATE ON zonas_envio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona se recuerda en la dirección (para que salga sola la próxima vez) y se congela en el
-- ticket (para poder agrupar ventas por zona sin parsear el nombre del renglón).
ALTER TABLE direcciones_cliente ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);

-- Marca del renglón. Hace falta explícita: producto_id YA es nulo para los renglones cuyo producto
-- se borró del catálogo (FK blanda, 0008:547), así que "sin producto" no significa "es un cargo".
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS cargo_tipo varchar(20) NULL;

DO $$ BEGIN
  ALTER TABLE ticket_items ADD CONSTRAINT ticket_items_cargo_tipo_chk CHECK (cargo_tipo IN ('ENVIO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ticket_items.cargo_tipo IS 'NULL = renglón de producto. ENVIO = cargo de envío: no va a cocina, no consume inventario, no es un producto vendido.';

-- La garantía va en la base, no en que el código se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_envio_unico
  ON ticket_items (ticket_id) WHERE cargo_tipo = 'ENVIO' AND cancelado = false;

-- ============================================================================
-- fijar_envio_ticket(ticket, zona) — punto único por el que entra y sale el cargo.
--
-- Idempotente: llamarla dos veces con la misma zona deja el mismo renglón. Con otra zona, lo
-- reprecia. Con NULL, lo borra.
--
-- BORRA en lugar de cancelar a propósito: un cargo retirado antes de cobrar no es una venta
-- cancelada y no tiene por qué aparecer en los reportes de cancelaciones. El trigger
-- AFTER INSERT OR UPDATE OR DELETE de ticket_items (0008:696) recalcula los totales solo.
--
-- SECURITY DEFINER a propósito. Como invoker, el DELETE del renglón pasaba por la política
-- ticket_items_delete (0008:2126), que solo deja borrar renglones de tickets en BORRADOR — y todo
-- ticket con renglones ya está ABIERTO (trg_ticket_item_promover_borrador). El DELETE afectaba
-- CERO filas sin error: la RPC quitaba la zona del ticket y dejaba vivo el cargo, con el total
-- inflado. Como definer se salta RLS, así que la frontera del tenant la pone la guarda explícita
-- de abajo, ANTES de tocar nada; y cada escritura comprueba cuántas filas afectó, para que un
-- "no hizo nada" nunca vuelva a pasar por éxito.
-- ============================================================================
CREATE OR REPLACE FUNCTION fijar_envio_ticket(p_ticket_id uuid, p_zona_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant     uuid;
  v_sucursal   uuid;
  v_modo       modo_servicio;
  v_estado     ticket_estado_fiscal;
  v_zona       record;
  v_item       uuid;
  v_tasa       numeric(5,2);
  v_incluido   boolean;
  v_orden      integer;
  v_filas      integer;
BEGIN
  SELECT tenant_id, sucursal_id, modo_servicio, estado_fiscal
    INTO v_tenant, v_sucursal, v_modo, v_estado
  FROM tickets WHERE id = p_ticket_id;

  -- Misma respuesta para "no existe" y "es de otro negocio": no se confirma que el id exista.
  IF NOT FOUND OR v_tenant IS DISTINCT FROM current_tenant_id() THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El envío solo se puede fijar en tickets BORRADOR o ABIERTO (estado actual: %)', v_estado;
  END IF;
  IF v_modo <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'El cargo de envío solo aplica a domicilio propio (modo actual: %)', v_modo;
  END IF;

  SELECT id INTO v_item
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;

  -- Quitar el envío
  IF p_zona_id IS NULL THEN
    IF v_item IS NOT NULL THEN
      DELETE FROM ticket_items WHERE id = v_item;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'No se pudo quitar el renglón de envío % (filas afectadas: %)', v_item, v_filas;
      END IF;
    END IF;
    UPDATE tickets SET zona_envio_id = NULL, updated_at = now() WHERE id = p_ticket_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No se pudo quitar la zona del ticket % (filas afectadas: %)', p_ticket_id, v_filas;
    END IF;
    RETURN NULL;
  END IF;

  SELECT z.id, z.nombre, z.costo_mxn INTO v_zona
  FROM zonas_envio z
  WHERE z.id = p_zona_id
    AND z.tenant_id = v_tenant
    AND z.sucursal_id = v_sucursal
    AND z.activa = true
    AND z.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zona de envío % no existe, está inactiva o no es de esta sucursal', p_zona_id;
  END IF;

  -- La política fiscal del envío es la del ticket, no una constante: un negocio que factura con
  -- IVA por afuera tendría si no un envío incoherente con su propia comida.
  SELECT tasa_iva_snapshot, iva_incluido_en_precio_snapshot
    INTO v_tasa, v_incluido
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo IS NULL AND cancelado = false
  ORDER BY orden_visualizacion
  LIMIT 1;

  IF NOT FOUND THEN
    v_tasa := 16.00;
    v_incluido := true;
  END IF;

  IF v_item IS NOT NULL THEN
    UPDATE ticket_items
       SET producto_nombre_snapshot = 'Envío · ' || v_zona.nombre,
           precio_unitario_snapshot = v_zona.costo_mxn,
           tasa_iva_snapshot = v_tasa,
           iva_incluido_en_precio_snapshot = v_incluido,
           updated_at = now()
     WHERE id = v_item;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No se pudo repreciar el renglón de envío % (filas afectadas: %)', v_item, v_filas;
    END IF;
  ELSE
    SELECT COALESCE(MAX(orden_visualizacion), 0) + 1 INTO v_orden
    FROM ticket_items WHERE ticket_id = p_ticket_id;

    INSERT INTO ticket_items (
      tenant_id, ticket_id, producto_id, cargo_tipo, cantidad, orden_visualizacion,
      producto_nombre_snapshot, precio_unitario_snapshot,
      tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
      clave_sat_snapshot, unidad_sat_snapshot, created_by
    ) VALUES (
      v_tenant, p_ticket_id, NULL, 'ENVIO', 1, v_orden,
      'Envío · ' || v_zona.nombre, v_zona.costo_mxn,
      v_tasa, v_incluido,
      NULL, NULL, auth.uid()
    ) RETURNING id INTO v_item;
  END IF;

  UPDATE tickets SET zona_envio_id = v_zona.id, updated_at = now() WHERE id = p_ticket_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'No se pudo fijar la zona del ticket % (filas afectadas: %)', p_ticket_id, v_filas;
  END IF;
  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION fijar_envio_ticket IS 'Fija (o quita, con zona NULL) el renglón de envío de un ticket de domicilio. Idempotente. Los totales los recalcula el trigger de ticket_items.';

-- Definer: fuera `public`/`anon` (el EXECUTE por omisión es de PUBLIC). La guarda de tenant ya los
-- rechazaría, pero una RPC que se salta RLS no se deja abierta a quien no tiene sesión.
REVOKE EXECUTE ON FUNCTION fijar_envio_ticket(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION fijar_envio_ticket(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- Sync: las zonas de envío entran y salen de la caja igual que el catálogo de repartidores.
--
-- Se crean tanto en el panel (tienen que BAJAR con sync_pull_snapshot) como en la propia caja
-- (tienen que SUBIR con sync_push_snapshot). Ambas funciones se redeclaran completas —convención
-- del repo: cada migración que las toca las vuelve a declarar entera. Cuerpo idéntico al vigente
-- (sync_pull_snapshot en 0111_combos.sql, sync_push_snapshot en 0114_delivery_viaje.sql) con dos
-- cambios: la clave 'zonas_envio' en el pull, y 'zonas_envio' en v_tablas del push, ambas
-- inmediatamente después de 'repartidores' (el array va ordenado por dependencia y
-- tickets.zona_envio_id apunta a la zona, así que tiene que aplicarse antes que los tickets).
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla     text;
  v_res       jsonb := '{}'::jsonb;
  v_det       jsonb;
  v_errores   jsonb := '[]'::jsonb;
  v_ignoradas text[] := ARRAY[]::text[];
  v_ini       timestamptz := clock_timestamp();
  v_total     integer := 0;
  v_aplicadas integer := 0;
  v_caja      uuid;
  v_sucursal  uuid;
  v_disp      text;
  v_desc      text;
  v_min       timestamptz;
  v_max       timestamptz;
  /* `repartidores` va PRIMERO: el array está ordenado por dependencia (ver 0089) y
     `delivery_asignaciones` lo referencia por `repartidor_catalogo_id`. Sube porque desde la 0114
     la caja puede dar de alta un repartidor (el pedido no puede quedarse sin salir porque nadie
     entró al panel), y sin esto esa alta se quedaría en el Postgres local para siempre. */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- ── Rastro del envío (0070/0073) ─────────────────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    -- Caja y sucursal de la primera fila (tickets, turnos o, si solo vienen movimientos, pagos/movimientos).
    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', '[]'::jsonb)) AS t
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', '[]'::jsonb)) AS t LIMIT 1;
    END IF;
    IF v_caja IS NULL AND v_sucursal IS NOT NULL THEN
      -- Un lote de puros movimientos no trae caja: se toma la de la sucursal con señal de vida más reciente.
      SELECT id INTO v_caja FROM public.cajas WHERE sucursal_id = v_sucursal AND tenant_id = p_tenant
       ORDER BY ultima_conexion DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
     WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id, dispositivo_descripcion,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'), v_desc,
      v_total, v_aplicadas, jsonb_array_length(v_errores),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'), v_res
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Tablas que la caja mandó y aquí no se replican (0089).
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario']));
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;
COMMENT ON FUNCTION sync_push_snapshot(uuid, jsonb) IS
  'Replica la rebanada operativa de la caja (modo réplica, aislando filas conflictivas en _errores) y aplica sus movimientos de inventario en modo origin (existencias + alertas). Registra sync_eventos y sella cajas.ultima_conexion. Solo service_role. ADR 0013.';
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
