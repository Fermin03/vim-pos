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
-- reprecia. Con NULL, lo borra. Con una zona de $0, fija la zona en el ticket SIN renglón (y borra
-- el que hubiera): devuelve el id del renglón, o NULL cuando no queda ninguno.
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

  -- Zona gratis: la zona se registra en el ticket (reportes por zona) pero NO hay renglón. Un
  -- concepto de $0 no timbra —el Anexo 20 exige base > 0 y armarConceptos solo pliega renglones
  -- sin dinero cuando son hijos de combo—, así que un renglón de "Envío · Centro $0.00" dejaría el
  -- ticket sin poder facturarse. Si la zona anterior sí cobraba, su renglón se borra.
  IF v_zona.costo_mxn = 0 THEN
    IF v_item IS NOT NULL THEN
      DELETE FROM ticket_items WHERE id = v_item;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'No se pudo quitar el renglón de envío % (filas afectadas: %)', v_item, v_filas;
      END IF;
    END IF;
    UPDATE tickets SET zona_envio_id = v_zona.id, updated_at = now() WHERE id = p_ticket_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No se pudo fijar la zona del ticket % (filas afectadas: %)', p_ticket_id, v_filas;
    END IF;
    RETURN NULL;
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

COMMENT ON FUNCTION fijar_envio_ticket IS 'Fija (o quita, con zona NULL) el renglón de envío de un ticket de domicilio. Una zona de $0 se registra en el ticket sin renglón (un concepto de base 0 no timbra). Idempotente. Los totales los recalcula el trigger de ticket_items.';

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

-- ============================================================================
-- catalogo_version(): una zona nueva o repreciada también es "el catálogo cambió".
--
-- Sin esto la caja solo se enteraba de un cambio de zona hecho en el panel con el pull de respaldo
-- (hasta una hora). Copia íntegra de la vigente (0111_combos.sql §3.3) con una línea más:
-- zonas_envio.
-- ============================================================================
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores),
    (SELECT max(updated_at) FROM combo_grupos),
    (SELECT max(updated_at) FROM combo_opciones),
    (SELECT max(updated_at) FROM zonas_envio)
  );
$$;
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;

-- ============================================================================
-- vw_ventas_por_producto: el envío no es un producto vendido.
--
-- Copia íntegra de la vigente (0111_combos.sql §3.1) con una condición más en el WHERE:
-- `ti.cargo_tipo IS NULL`. Sin ella, "Envío · Zona Norte" salía en el ranking de productos. Las
-- vistas por categoría y por área de cocina no la necesitan: ya exigen categoria/area no nulas, y
-- el renglón de envío no tiene ninguna de las dos.
-- ============================================================================
CREATE OR REPLACE VIEW vw_ventas_por_producto
WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.producto_id,
  ti.producto_nombre_snapshot  AS producto_nombre,
  ti.producto_sku_snapshot     AS producto_sku,
  COUNT(DISTINCT t.id)         AS tickets_con_producto,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_asignado_mxn + ti.subtotal_bruto_mxn ELSE ti.subtotal_bruto_mxn END) AS subtotal_mxn,
  -- IVA y total del HIJO: misma regla que en vw_ventas_por_categoria — atributos fiscales DEL
  -- PADRE (join `padre`) y, con IVA por afuera, el impuesto derivado se suma a total_mxn.
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN rebanada.iva_mxn + ti.iva_item_mxn
           ELSE ti.iva_item_mxn END) AS iva_mxn,
  SUM(CASE WHEN ti.combo_rol = 'HIJO'
           THEN ti.precio_asignado_mxn + (CASE WHEN rebanada.iva_dentro THEN 0 ELSE rebanada.iva_mxn END) + ti.total_item_mxn
           ELSE ti.total_item_mxn END) AS total_mxn,
  AVG(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_unitario_original_snapshot ELSE ti.precio_unitario_snapshot END) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
LEFT JOIN ticket_items padre ON padre.id = ti.parent_item_id
LEFT JOIN LATERAL (
  SELECT ROUND(ti.precio_asignado_mxn * padre.tasa_iva_snapshot
               / (CASE WHEN padre.iva_incluido_en_precio_snapshot THEN 100 + padre.tasa_iva_snapshot ELSE 100 END), 2) AS iva_mxn,
         padre.iva_incluido_en_precio_snapshot AS iva_dentro
) rebanada ON ti.combo_rol = 'HIJO'
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.combo_rol IS DISTINCT FROM 'PADRE'
  AND ti.cargo_tipo IS NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         ti.producto_id, ti.producto_nombre_snapshot, ti.producto_sku_snapshot;
COMMENT ON VIEW vw_ventas_por_producto IS 'Ventas por producto/día. Los PADRES de combo no cuentan; los HIJOS valen su precio asignado más sus extras, con el IVA derivado de los atributos fiscales DEL PADRE (y sumado al total cuando el padre cobra con IVA por afuera). ADR 0015. Los cargos (cargo_tipo, p.ej. ENVIO) no son productos y no cuentan. ADR 0017.';

-- ============================================================================
-- EL ENVÍO NO ADMITE DESCUENTOS NI PROMOCIONES (spec 2026-09-22-zonas-envio §3, ADR 0017)
--
-- Regla del dueño: un 10% de descuento rebaja la comida; el envío se cobra completo. La spec lo
-- decía y nadie lo había implementado. Como el envío es un renglón más (ADR 0017), entraba solo a
-- la base de todo descuento de ticket. Se redefinen las tres funciones por donde se colaba:
--
--   · aplicar_descuento_manual (vigente: 0008) — a nivel ticket, PORCENTAJE, MONTO_FIJO (ahora con
--     tope, que no tenía) y CORTESIA_TOTAL calculan sobre la comida. A nivel renglón, descontar el
--     propio renglón de envío se rechaza: sería la puerta trasera de la regla. Quitar el envío sí se
--     puede, quitando la zona (fijar_envio_ticket con NULL).
--   · aplicar_promocion (vigente: 0087) — la base `v_total` excluye el envío (los cuatro tipos).
--   · evaluar_promociones_aplicables (vigente: 0008) — el envío no cuenta para el monto previsto
--     ni para alcanzar `condiciones.monto_ticket.minimo_mxn`.
--
-- Cada una es copia de su versión vigente con SOLO estos cambios. Las dos de la 0008 llevan además
-- `SET search_path = public, extensions, pg_temp`: se lo puso la 0044 con ALTER FUNCTION, y un
-- CREATE OR REPLACE sin la cláusula se lo quitaría. aplicar_promocion no lo tenía y no lo gana.
-- Permisos y comentarios sobreviven al CREATE OR REPLACE.
--
-- El quinto camino, el reparto del descuento en el CFDI, vive en
-- supabase/functions/_shared/pac/conceptos.ts: DESPLEGAR timbrar-cfdi, timbrar-global y
-- autofacturar JUNTO con esta migración.
-- ============================================================================

CREATE OR REPLACE FUNCTION aplicar_descuento_manual(
  p_ticket_id        uuid,
  p_ticket_item_id   uuid,                       -- NULL = aplica al ticket completo
  p_tipo             descuento_manual_tipo,
  p_valor            numeric(12,2),              -- porcentaje, monto fijo, o precio override
  p_motivo_categoria descuento_manual_motivo,
  p_motivo_texto     text,                       -- obligatorio si motivo=OTRO
  p_autorizacion_pin_id uuid,                    -- pre-obtenida del flujo de PIN
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id uuid,
  p_client_id_local  varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id        uuid;
  v_descuento_id     uuid;
  v_monto_descontado numeric(12,2);
  v_base             numeric(12,2);
  v_porc             numeric(5,2);
  v_monto            numeric(12,2);
  v_precio_over      numeric(12,2);
  v_item             record;
  v_cargos           numeric(12,2) := 0;         -- 0116: el envío, que no se descuenta
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_descuento_id FROM ticket_descuentos_manuales
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_descuento_id; END IF;
  END IF;

  -- 0116: el envío no admite descuentos (spec zonas de envío §3, ADR 0017). Descontar el renglón
  -- de envío directamente sería la puerta trasera de la regla. Quitarlo sí se puede: es quitar la
  -- zona del pedido (fijar_envio_ticket con zona NULL).
  IF p_ticket_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ticket_items WHERE id = p_ticket_item_id AND cargo_tipo IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El envío no admite descuentos: se cobra completo. Si no se va a cobrar, quita la zona del pedido.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 0116: a nivel ticket, la base del descuento es la comida. El envío se resta de la base.
  IF p_ticket_item_id IS NULL THEN
    SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
      FROM ticket_items
     WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;
  END IF;

  -- Calcular monto descontado según tipo
  IF p_tipo = 'PORCENTAJE' THEN
    v_porc := p_valor;
    -- Base de cálculo depende del alcance
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(subtotal_mxn + iva_mxn - promociones_mxn - v_cargos, 0) INTO v_base FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_base FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;
    v_monto_descontado := ROUND(v_base * v_porc / 100, 2);

  ELSIF p_tipo = 'MONTO_FIJO' THEN
    v_monto := p_valor;
    v_monto_descontado := v_monto;
    -- 0116: a nivel ticket, topado en la comida. Sin tope, un monto mayor que la comida quedaba
    -- registrado por encima de lo aplicable (recalcular_totales_ticket, redefinida al final de
    -- esta migración, ya no deja que se coma el envío, pero el registro debe decir la verdad).
    IF p_ticket_item_id IS NULL THEN
      SELECT LEAST(v_monto, GREATEST(total_mxn - v_cargos, 0)) INTO v_monto_descontado
        FROM tickets WHERE id = p_ticket_id;
    END IF;

  ELSIF p_tipo = 'CORTESIA_TOTAL' THEN
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(total_mxn - v_cargos, 0) INTO v_monto_descontado FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_monto_descontado FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    -- Para OVERRIDE_PRECIO: marcamos el ítem con precio_override y calculamos el delta
    v_precio_over := p_valor;
    SELECT * INTO v_item FROM ticket_items WHERE id = p_ticket_item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
    v_monto_descontado := GREATEST(0, (v_item.precio_unitario_snapshot - v_precio_over) * v_item.cantidad);

    -- Actualizar el ítem con override
    UPDATE ticket_items
    SET precio_override = true,
        precio_unitario_original_snapshot = precio_unitario_snapshot,
        autorizacion_pin_override_id = p_autorizacion_pin_id,
        precio_unitario_snapshot = v_precio_over
    WHERE id = p_ticket_item_id;
  END IF;

  -- Insertar registro del descuento
  INSERT INTO ticket_descuentos_manuales (
    tenant_id, ticket_id, ticket_item_id,
    tipo, valor_porcentaje, valor_monto_mxn, precio_override_mxn,
    monto_descontado_mxn,
    motivo_categoria, motivo_texto,
    autorizacion_pin_id,
    usuario_solicitante_id, usuario_autorizo_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_ticket_item_id,
    p_tipo,
    CASE WHEN p_tipo = 'PORCENTAJE'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'MONTO_FIJO'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'OVERRIDE_PRECIO' THEN p_valor ELSE NULL END,
    v_monto_descontado,
    p_motivo_categoria, p_motivo_texto,
    p_autorizacion_pin_id,
    p_usuario_solicitante_id, p_usuario_autorizo_id,
    p_client_id_local, p_usuario_solicitante_id
  ) RETURNING id INTO v_descuento_id;

  RETURN v_descuento_id;
END;
$$;

CREATE OR REPLACE FUNCTION evaluar_promociones_aplicables(p_ticket_id uuid)
RETURNS TABLE (
  promocion_id          uuid,
  nombre                varchar(150),
  tipo                  promocion_tipo,
  alcance               promocion_alcance,
  monto_descuento_estimado_mxn numeric(12,2),
  condiciones           jsonb,
  prioridad             integer
)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id   uuid;
  v_sucursal_id uuid;
  v_modo        modo_servicio;
  v_cliente_id  uuid;
  v_subtotal    numeric(12,2);
  v_ahora       timestamptz := now();
BEGIN
  -- 0116: el envío no cuenta ni para el monto previsto ni para alcanzar el mínimo de compra
  -- (spec zonas de envío §3, ADR 0017). v_subtotal es la comida.
  SELECT t.tenant_id, t.sucursal_id, t.modo_servicio, t.cliente_id,
         GREATEST(t.subtotal_mxn + t.iva_mxn - COALESCE((
           SELECT SUM(ti.total_item_mxn) FROM ticket_items ti
            WHERE ti.ticket_id = t.id AND ti.cancelado = false AND ti.cargo_tipo IS NOT NULL
         ), 0), 0)
  INTO v_tenant_id, v_sucursal_id, v_modo, v_cliente_id, v_subtotal
  FROM tickets t
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- Retornar promociones que cumplen FILTROS BÁSICOS evaluables en SQL.
  -- La evaluación detallada de condiciones jsonb se hace en la capa de servicios.
  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.tipo,
    p.alcance,
    -- Estimación rápida del descuento (la app recalcula exactamente al aplicar)
    CASE
      WHEN p.tipo = 'PORCENTAJE'     THEN ROUND(v_subtotal * p.valor_porcentaje / 100, 2)
      WHEN p.tipo = 'MONTO_FIJO'     THEN p.valor_monto_mxn
      WHEN p.tipo = 'CORTESIA_TOTAL' THEN v_subtotal
      ELSE 0
    END AS monto_descuento_estimado_mxn,
    p.condiciones,
    p.prioridad
  FROM promociones p
  WHERE p.tenant_id = v_tenant_id
    AND p.estado = 'ACTIVA'
    AND p.deleted_at IS NULL
    AND p.fecha_inicio <= v_ahora
    AND (p.fecha_fin IS NULL OR p.fecha_fin >= v_ahora)
    AND (p.max_usos_total IS NULL OR p.usos_actuales < p.max_usos_total)
    AND (
      -- Filtro de sucursal si la condición existe en jsonb
      NOT (p.condiciones ? 'sucursales_aplicables')
      OR v_sucursal_id::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'sucursales_aplicables')
      )
    )
    AND (
      -- Filtro de modo de servicio
      NOT (p.condiciones ? 'modos_servicio_permitidos')
      OR v_modo::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'modos_servicio_permitidos')
      )
    )
    AND (
      -- Filtro de monto mínimo
      NOT (p.condiciones ? 'monto_ticket')
      OR (p.condiciones->'monto_ticket'->>'minimo_mxn') IS NULL
      OR v_subtotal >= (p.condiciones->'monto_ticket'->>'minimo_mxn')::numeric
    )
    AND (
      -- Filtro requiere_cliente_identificado
      p.requiere_cliente_identificado = false
      OR v_cliente_id IS NOT NULL
    )
  ORDER BY p.prioridad DESC, p.valor_porcentaje DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION aplicar_promocion(
  p_ticket_id       uuid,
  p_promocion_id    uuid,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid;
  v_estado      ticket_estado_fiscal;
  v_cliente_id  uuid;
  v_total       numeric(12,2);
  v_promo       record;
  v_monto       numeric(12,2);
  v_id          uuid;
BEGIN
  SELECT tenant_id, estado_fiscal, cliente_id, total_mxn
    INTO v_tenant_id, v_estado, v_cliente_id, v_total
    FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- Idempotencia por client_id_local, igual que el resto de operaciones de caja:
  -- si el envío se repite (reintento de red, sync), devuelve la misma fila en vez
  -- de descontar dos veces.
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_id FROM ticket_promociones_aplicadas
     WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  /* Un ticket cobrado ya no se toca. Sin esta guarda se le podría aplicar una
     promoción a una venta cerrada: el total cambiaría por debajo de un ticket ya
     impreso y ya cuadrado en el corte. */
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El ticket ya está %; no se le pueden aplicar promociones', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_promo FROM promociones
   WHERE id = p_promocion_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La promoción no existe o no es de este negocio'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Se revalida en la base lo que la app ya filtró. No es desconfianza del
  -- cliente: entre que la caja pinta la lista y el cajero toca el botón pueden
  -- pasar minutos, y una promoción que venció o se pausó en ese hueco no debe
  -- entrar.
  IF v_promo.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La promoción "%" no está activa', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.fecha_inicio > now() OR (v_promo.fecha_fin IS NOT NULL AND v_promo.fecha_fin < now()) THEN
    RAISE EXCEPTION 'La promoción "%" no está vigente', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.max_usos_total IS NOT NULL AND v_promo.usos_actuales >= v_promo.max_usos_total THEN
    RAISE EXCEPTION 'La promoción "%" agotó sus usos', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.requiere_cliente_identificado AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'La promoción "%" pide identificar al cliente', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_promo.alcance <> 'TICKET_COMPLETO' THEN
    RAISE EXCEPTION 'Todavía no se aplican promociones de alcance % desde la caja', v_promo.alcance
      USING ERRCODE = 'feature_not_supported';
  END IF;

  /* La misma promoción, dos veces en un ticket, es siempre un doble clic o un
     reintento — nunca una intención. Se corta antes de descontar. */
  IF EXISTS (
    SELECT 1 FROM ticket_promociones_aplicadas
     WHERE ticket_id = p_ticket_id AND promocion_id = p_promocion_id
       AND cancelada_por_cajero = false
  ) THEN
    RAISE EXCEPTION 'La promoción "%" ya está aplicada a este ticket', v_promo.nombre
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 0116: el envío no admite promociones (spec zonas de envío §3, ADR 0017). La base es la
  -- comida: el total vigente menos los renglones de cargo. Un 10% rebaja la comida; el envío se
  -- cobra completo, también en cortesía y en precio especial.
  v_total := GREATEST(v_total - COALESCE((
    SELECT SUM(total_item_mxn) FROM ticket_items
     WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL
  ), 0), 0);

  -- Monto, siempre sobre el total vigente y siempre acotado a él.
  v_monto := CASE v_promo.tipo
    WHEN 'PORCENTAJE'      THEN ROUND(v_total * LEAST(v_promo.valor_porcentaje, 100) / 100, 2)
    WHEN 'MONTO_FIJO'      THEN LEAST(v_promo.valor_monto_mxn, v_total)
    WHEN 'CORTESIA_TOTAL'  THEN v_total
    WHEN 'PRECIO_ESPECIAL' THEN GREATEST(v_total - v_promo.precio_especial_mxn, 0)
    ELSE NULL
  END;

  IF v_monto IS NULL THEN
    RAISE EXCEPTION 'El tipo de promoción % todavía no se aplica desde la caja', v_promo.tipo
      USING ERRCODE = 'feature_not_supported';
  END IF;

  -- Un ticket sin nada cobrable (o una promo que no descuenta) no se registra:
  -- dejaría un renglón de $0 en el ticket del cliente y en los reportes.
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'La promoción "%" no descuenta nada sobre este ticket', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;

  /* El insert dispara los dos triggers de la 0008: `trg_promo_apl_recalc`
     recalcula los totales del ticket y `trg_promo_apl_uso` incrementa
     `usos_actuales`. Por eso aquí no se toca `tickets` ni `promociones` a mano:
     hacerlo duplicaría el efecto. */
  INSERT INTO ticket_promociones_aplicadas (
    tenant_id, ticket_id, promocion_id,
    promocion_nombre_snapshot, promocion_tipo_snapshot, promocion_alcance_snapshot,
    valor_porcentaje_snapshot, valor_monto_snapshot, precio_especial_snapshot,
    monto_descontado_mxn, items_afectados,
    cumple_condiciones_snapshot, cliente_id, client_id_local
  ) VALUES (
    v_tenant_id, p_ticket_id, p_promocion_id,
    v_promo.nombre, v_promo.tipo, v_promo.alcance,
    v_promo.valor_porcentaje, v_promo.valor_monto_mxn, v_promo.precio_especial_mxn,
    v_monto, '{}',
    jsonb_build_object(
      'total_base_mxn', v_total,
      'aplicada_desde', 'caja',
      'evaluada_at', now()
    ),
    v_cliente_id, p_client_id_local
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- EL EXCEDENTE DE UN DESCUENTO CONGELADO NO SE COME EL ENVÍO (recalcular_totales_ticket)
--
-- Un descuento o una promoción de ticket se CONGELA como monto al aplicarse (arriba ya se calcula
-- sobre la comida). Si después se cancela comida —cancelar_item_ticket lo permite en ABIERTO con el
-- descuento puesto, y el POS no puede revertir un descuento manual— el monto congelado supera la
-- comida que queda y esta función restaba el excedente del envío: solo topaba el total en 0.
-- Ejemplo: 240 de comida + 35 de envío, cortesía total (240), se cancela un platillo de 120 →
-- total 0 en vez de 35. El negocio no cobraba el envío y el ticket no timbraba: el armador de
-- conceptos no tiene comida sobre la que repartir el descuento (ConceptosIncoherentes), y como la
-- factura global mete todos los tickets PAGADO, un ticket así bloqueaba la global del periodo.
--
-- Copia íntegra de la vigente (0008 §8.1; ninguna migración posterior la redefinió) con SOLO este
-- cambio: tras restar descuentos y promociones de nivel ticket, el total no baja de la suma de los
-- renglones de cargo vivos (v_piso) en vez de 0. Y lleva `SET search_path = public, extensions,
-- pg_temp`: se lo puso la 0044 con ALTER FUNCTION y un CREATE OR REPLACE sin la cláusula lo quita.
--
-- EL DESCUENTO REPORTADO. Cuando el tope actúa, descuentos_manuales_mxn / promociones_mxn del ticket
-- guardan lo que DE VERDAD se aplicó, no el monto congelado: el excedente que no pudo aplicarse se
-- descarta del reportado. Así el ticket cuadra por construcción:
--     renglones vivos − (descuentos_manuales_mxn + promociones_mxn) = total_mxn
-- que es exactamente lo que el CFDI deduce (sumaLineas − total, _shared/pac/conceptos.ts) y lo que
-- guarda la fila de tickets_cfdi (subtotal + iva − descuento = total, 0009). Los registros de
-- ticket_descuentos_manuales / ticket_promociones_aplicadas NO se tocan: conservan el monto que se
-- autorizó, para la auditoría. Los manuales se aplican primero (mismo orden de siempre), así que si
-- el tope actúa ahí, la promoción queda con 0 efectivo.
--
-- Sin renglones de cargo (v_piso = 0) todo queda EXACTAMENTE como antes, incluido el reportado:
-- el tope en 0 de siempre sigue reportando el monto congelado. Cambiar eso sería tocar el
-- comportamiento de todos los tickets sin envío, fuera del alcance de esta migración.
-- ============================================================================
CREATE OR REPLACE FUNCTION recalcular_totales_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_subtotal_bruto          numeric(12,2) := 0;
  v_modificadores           numeric(12,2) := 0;
  v_descuentos_manuales     numeric(12,2) := 0;
  v_promociones             numeric(12,2) := 0;
  v_iva                     numeric(12,2) := 0;
  v_subtotal_final          numeric(12,2) := 0;
  v_total                   numeric(12,2) := 0;
  v_monto_pagado            numeric(12,2) := 0;
  v_cambio                  numeric(12,2) := 0;
  v_item                    record;
  v_item_bruto              numeric(12,2);
  v_item_modif              numeric(12,2);
  v_item_desc               numeric(12,2);
  v_item_promo              numeric(12,2);
  v_item_neto               numeric(12,2);
  v_item_iva                numeric(12,2);
  v_item_total              numeric(12,2);
  v_piso                    numeric(12,2) := 0;  -- 0116: renglones de cargo vivos (el envío)
BEGIN
  -- Iterar items no cancelados y calcular su subtotal e IVA
  FOR v_item IN
    SELECT
      ti.id,
      ti.cantidad,
      ti.precio_unitario_snapshot,
      ti.tasa_iva_snapshot,
      ti.iva_incluido_en_precio_snapshot,
      COALESCE(SUM(tim.monto_total_mxn), 0) AS monto_modif
    FROM ticket_items ti
    LEFT JOIN ticket_item_modificadores tim ON tim.ticket_item_id = ti.id
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
    GROUP BY ti.id, ti.cantidad, ti.precio_unitario_snapshot,
             ti.tasa_iva_snapshot, ti.iva_incluido_en_precio_snapshot
  LOOP
    -- Bruto del ítem: precio * cantidad + modificadores
    v_item_bruto := (v_item.cantidad * v_item.precio_unitario_snapshot);
    v_item_modif := v_item.monto_modif;

    -- Descuentos manuales aplicables a este item (los del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_desc
    FROM ticket_descuentos_manuales
    WHERE ticket_item_id = v_item.id
      AND reversado = false;

    -- Promociones aplicables a este item (las del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_promo
    FROM ticket_promociones_aplicadas
    WHERE ticket_id = p_ticket_id
      AND cancelada_por_cajero = false
      AND v_item.id = ANY(items_afectados);

    -- Neto del ítem (después de descuentos a nivel item, no a nivel ticket)
    v_item_neto := (v_item_bruto + v_item_modif) - v_item_desc - v_item_promo;
    IF v_item_neto < 0 THEN v_item_neto := 0; END IF;

    -- IVA del ítem según política iva_incluido
    IF v_item.iva_incluido_en_precio_snapshot THEN
      -- El precio ya trae IVA: subtotal_sin_iva = neto / (1 + tasa/100), iva = neto - subtotal
      v_item_iva := ROUND(v_item_neto - (v_item_neto / (1 + v_item.tasa_iva_snapshot/100)), 2);
      v_item_total := v_item_neto;
    ELSE
      -- IVA por afuera: subtotal_sin_iva = neto, iva = neto * tasa/100, total = neto + iva
      v_item_iva := ROUND(v_item_neto * v_item.tasa_iva_snapshot/100, 2);
      v_item_total := v_item_neto + v_item_iva;
    END IF;

    -- Persistir el cálculo en ticket_items
    UPDATE ticket_items
    SET subtotal_bruto_mxn      = v_item_bruto,
        monto_modificadores_mxn = v_item_modif,
        descuento_item_mxn      = v_item_desc,
        promocion_item_mxn      = v_item_promo,
        iva_item_mxn            = v_item_iva,
        total_item_mxn          = v_item_total
    WHERE id = v_item.id;

    -- Acumular al ticket
    v_subtotal_bruto      := v_subtotal_bruto + v_item_bruto;
    v_modificadores       := v_modificadores  + v_item_modif;
    v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
    v_promociones         := v_promociones    + v_item_promo;
    v_iva                 := v_iva            + v_item_iva;
    v_total               := v_total          + v_item_total;
  END LOOP;

  -- 0116: el piso del total. Los descuentos de ticket no pueden comerse los renglones de cargo
  -- (el envío no admite descuentos, spec zonas de envío §3, ADR 0017). Se lee DESPUÉS del bucle,
  -- que acaba de persistir total_item_mxn. Acotado a v_total por defensa: el piso nunca puede
  -- subir el total por encima de la suma de sus renglones (eso descuadraría el CFDI).
  SELECT COALESCE(SUM(total_item_mxn), 0)
  INTO v_piso
  FROM ticket_items
  WHERE ticket_id = p_ticket_id
    AND cancelado = false
    AND cargo_tipo IS NOT NULL;
  v_piso := LEAST(v_piso, GREATEST(v_total, 0));

  -- Descuentos manuales a nivel ticket (sin ticket_item_id) — se restan del total
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_desc
  FROM ticket_descuentos_manuales
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND reversado = false;
  v_total := v_total - v_item_desc;
  -- 0116: el excedente no se come el cargo; se reporta solo lo que se aplicó.
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_desc := v_item_desc - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Promociones a nivel ticket (items_afectados vacío y alcance TICKET_COMPLETO)
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_promo
  FROM ticket_promociones_aplicadas
  WHERE ticket_id = p_ticket_id
    AND cancelada_por_cajero = false
    AND promocion_alcance_snapshot = 'TICKET_COMPLETO';
  v_total := v_total - v_item_promo;
  -- 0116: ídem para las promociones.
  IF v_piso > 0 AND v_total < v_piso THEN
    v_item_promo := v_item_promo - (v_piso - v_total);
    v_total := v_piso;
  END IF;
  v_promociones := v_promociones + v_item_promo;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Subtotal final (sin IVA) — útil para reportes
  v_subtotal_final := v_total - v_iva;
  IF v_subtotal_final < 0 THEN v_subtotal_final := 0; END IF;

  -- Pagos
  SELECT
    COALESCE(SUM(monto_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0),
    COALESCE(SUM(cambio_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0)
  INTO v_monto_pagado, v_cambio
  FROM pagos
  WHERE ticket_id = p_ticket_id
    AND deleted_at IS NULL;

  -- Persistir totales en el ticket
  UPDATE tickets
  SET subtotal_mxn            = v_subtotal_final,
      descuentos_manuales_mxn = v_descuentos_manuales,
      promociones_mxn         = v_promociones,
      iva_mxn                 = v_iva,
      total_mxn               = v_total,
      monto_pagado_mxn        = v_monto_pagado,
      cambio_mxn              = v_cambio,
      updated_at              = now()
  WHERE id = p_ticket_id;
END;
$$;
