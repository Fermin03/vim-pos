-- 0195 · La caja de tienda (Giro RETAIL, entrega 4).
-- §1 Candados pendientes de la entrega 1. §2 La venta de tienda no va a cocina.
-- §3 Sync de existencias con la caja instalada (al estilo de la 0101). §4 Cambio de talla atómico.

-- ── §1 Candados del renglón cobrado y de los movimientos ─────────────────────
-- Un renglón cobrado no cambia de producto: los movimientos de existencias ya se colgaron de él.
CREATE OR REPLACE FUNCTION trg_ticket_items_producto_fijo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.producto_id IS DISTINCT FROM OLD.producto_id
     AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = NEW.ticket_id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_items_producto_fijo ON ticket_items;
CREATE TRIGGER trg_ticket_items_producto_fijo
  BEFORE UPDATE OF producto_id ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_items_producto_fijo();

-- Igual que 0189 y además: lo que el movimiento referencia (ticket, renglón, devolución, traspaso,
-- proveedor) es del mismo negocio.
CREATE OR REPLACE FUNCTION movimientos_producto_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM productos p WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
                   AND p.controla_existencias AND p.variante_ejes IS NULL) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: el producto no lleva existencias en este negocio' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: la sucursal no es de este negocio' USING ERRCODE = '23514';
  END IF;
  IF (NEW.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets x WHERE x.id = NEW.ticket_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.ticket_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_items x WHERE x.id = NEW.ticket_item_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.devolucion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devoluciones x WHERE x.id = NEW.devolucion_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.traspaso_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM traspasos_producto x WHERE x.id = NEW.traspaso_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.proveedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores x WHERE x.id = NEW.proveedor_id AND x.tenant_id = NEW.tenant_id)) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: el movimiento apunta a algo de otro negocio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Igual que 0189 salvo el orden: los renglones se recorren por producto, así dos cobros a la vez
-- toman los candados de existencias en el mismo orden.
CREATE OR REPLACE FUNCTION _existencias_sincronizar_ticket(p_ticket uuid, p_es_cobro boolean, p_item uuid DEFAULT NULL, p_devolucion uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tk     tickets%ROWTYPE;
  v_canc   record;
  v_it     record;
  v_dev    numeric;
  v_debe   numeric;
  v_hecho  numeric;
  v_dif    numeric;
BEGIN
  SELECT * INTO v_tk FROM tickets WHERE id = p_ticket FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT c.reversar_inventario, c.ticket_estado_fiscal_previo INTO v_canc
    FROM cancelaciones_ticket c WHERE c.ticket_id = p_ticket ORDER BY c.created_at DESC, c.id DESC LIMIT 1;

  FOR v_it IN
    SELECT ti.id, ti.producto_id, ti.cantidad, ti.cancelado
      FROM ticket_items ti JOIN productos p ON p.id = ti.producto_id
     WHERE ti.ticket_id = p_ticket AND p.controla_existencias
     ORDER BY ti.producto_id, ti.id
  LOOP
    SELECT COALESCE(sum(di.cantidad_devuelta), 0) INTO v_dev
      FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
     WHERE di.ticket_item_id_original = v_it.id AND d.estado = 'CONFIRMADA'
       AND d.reversar_inventario AND di.reversar_inventario_item;

    v_debe := CASE
      WHEN v_it.cancelado THEN 0
      WHEN v_tk.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN -v_it.cantidad + v_dev
      WHEN v_tk.estado_fiscal = 'CANCELADO'
           AND v_canc.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')
           AND NOT v_canc.reversar_inventario THEN -v_it.cantidad + v_dev
      ELSE 0 END;
    v_debe := LEAST(v_debe, 0);   -- nunca se regresa más de lo vendido

    -- R5: una línea sin movimientos solo se registra en el cobro, o si es la línea que cambió (p_item).
    IF NOT (p_es_cobro OR COALESCE(v_it.id = p_item, false)) AND NOT EXISTS (SELECT 1 FROM movimientos_producto m WHERE m.ticket_item_id = v_it.id) THEN CONTINUE; END IF;
    SELECT COALESCE(sum(m.cantidad), 0) INTO v_hecho FROM movimientos_producto m WHERE m.ticket_item_id = v_it.id;
    v_dif := v_debe - v_hecho;
    IF v_dif <> 0 THEN
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad,
                                        ticket_id, ticket_item_id, devolucion_id, motivo, usuario_id)
      VALUES (v_tk.tenant_id, v_tk.sucursal_id, v_it.producto_id,
              CASE WHEN v_dif < 0 THEN 'VENTA' ELSE 'DEVOLUCION' END::movimiento_producto_tipo,
              v_dif, p_ticket, v_it.id, CASE WHEN v_dif > 0 THEN p_devolucion END,
              'Ticket ' || COALESCE(v_tk.folio_completo, p_ticket::text), auth.uid());
    END IF;
  END LOOP;
END;
$$;

-- ── §2 La venta de tienda no va a cocina ─────────────────────────────────────
-- En un negocio RETAIL el ticket nace con envio_cocina_automatico = false: cobrar no lo manda a
-- cocina (trg_ticket_auto_enviar_cocina_al_pagar, 0008). abrir_ticket y el POS no cambian.
CREATE OR REPLACE FUNCTION trg_tickets_tienda_sin_cocina()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants t WHERE t.id = NEW.tenant_id AND t.vertical_principal = 'RETAIL') THEN
    NEW.envio_cocina_automatico := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tickets_tienda_sin_cocina ON tickets;
CREATE TRIGGER trg_tickets_tienda_sin_cocina
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_tickets_tienda_sin_cocina();

-- ── §3 Sync de existencias ───────────────────────────────────────────────────
-- Como 0101 con movimientos_inventario: la caja sube sus movimientos_producto, aquí entran solo los
-- nuevos (por id) y el disparador movimientos_producto_aplicar mueve la existencia (corre en origin,
-- así que reenviar un snapshot no descuenta dos veces). El resto lo valida movimientos_producto_validar.
-- Bajan con el pull; no se agregan a catalogo_version (no avisan cada minuto).
--
-- Devuelve {aplicados int, errores [{tabla, id, error}], descartados [id]}. La caja marca como
-- subidos todos los ids que mandó salvo los de errores:
--   · un id que la nube ya tiene se salta antes del INSERT (ni aplicado ni error): el validador
--     BEFORE INSERT corre aun cuando ON CONFLICT lo descartaría, y un reenvío podría rechazarse
--     para siempre (p. ej. si al producto le quitaron las existencias entretanto);
--   · un movimiento de un producto del negocio que ya no lleva existencias va a descartados: no se
--     guarda ni se reintenta.
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
      IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = (v_fila->>'id')::uuid) THEN CONTINUE; END IF;
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

-- 0195: sync_pull_snapshot es la de la 0187 (vigente) más `producto_existencias`.
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
    -- Menú por sucursal (0152, ADR 0027).
    'productos_sucursal',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0187: el catálogo de colonias (ADR 0036). Sube y baja, como las zonas.
    'colonias',                       coalesce((SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Propinas por sucursal (0184): lo que el dueño configura en el admin, para que la caja lo respete.
    'sucursal_propinas_config',       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursal_propinas_config x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Lealtad (0156, ADR 0030). Los clientes bajan por primera vez: sin esto el cliente de una
    -- sucursal no existe en la otra. Los saldos bajan solo para mostrarse; la caja les suma lo que
    -- aún no subió. Los movimientos NO bajan.
    'clientes',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_programa',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_programa x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_premios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_premios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_saldos',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_saldos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0195: existencias por producto de todas las sucursales vivas (la caja enseña las de las otras).
    'producto_existencias',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM producto_existencias x WHERE x.tenant_id = p_tenant
                                        AND x.sucursal_id IN (SELECT id FROM sucursales WHERE tenant_id = p_tenant AND deleted_at IS NULL)), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- 0195: sync_push_snapshot es la de la 0187 (vigente) con cambios marcados "0195": aplica
-- movimientos_producto, no los cuenta entre las tablas ignoradas, los usa para hallar sucursal y caja
-- del rastro y devuelve sus descartados en `_descartados`.
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
  v_tickets   jsonb;
  v_descartados jsonb;   -- 0195
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'colonias',   -- 0187
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  IF jsonb_typeof(p_snapshot->'_fusion_errores') = 'array' THEN v_errores := v_errores || (p_snapshot->'_fusion_errores'); END IF;
  p_snapshot := p_snapshot - '_fusion_errores';
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);

  -- La guarda del FACTURADO (ver el encabezado, punto 2): si la nube ya lo facturó y la caja
  -- manda su copia PAGADO, se conserva FACTURADO. Se reescribe el JSON entrante antes de aplicar,
  -- así el resto de la fila (lo que cambió en la caja) entra igual.
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT jsonb_agg(
             CASE WHEN t.estado_fiscal = 'FACTURADO' AND r->>'estado_fiscal' = 'PAGADO'
                  THEN r || jsonb_build_object('estado_fiscal', 'FACTURADO')
                  ELSE r END)
      INTO v_tickets
      FROM jsonb_array_elements(p_snapshot->'tickets') AS r
      LEFT JOIN public.tickets t ON t.id = NULLIF(r->>'id', '')::uuid AND t.tenant_id = p_tenant;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', COALESCE(v_tickets, '[]'::jsonb));
  END IF;

  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- 0156: un canje que el libro ya devolvió no revive con la copia tardía de la caja. Ver
  -- _vim_conciliar_canjes. Sigue en modo réplica, que es lo que se quiere para su UPDATE.
  v_det := _vim_conciliar_canjes(p_snapshot->'ticket_canjes_lealtad', p_tenant);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0195: existencias por producto. En origin: el disparador mueve producto_existencias.
  v_det := _vim_aplicar_movimientos_producto(p_tenant, p_snapshot->'movimientos_producto');
  v_res := v_res || jsonb_build_object('movimientos_producto', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_descartados := COALESCE(v_det->'descartados', '[]'::jsonb);   -- 0195

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
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', p_snapshot->'movimientos_producto', '[]'::jsonb)) AS t LIMIT 1;   -- 0195
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
      jsonb_build_object('origen', 'sync_push_snapshot'),
      -- 0123: el motivo de cada fila rechazada (hasta 20), no solo cuántas. Sin esto el detalle solo
      -- quedaba en la bitácora de la caja del local, y un rechazo que se reintenta cada 10 minutos
      -- no se podía diagnosticar desde aquí.
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                    THEN jsonb_build_object('_errores', (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_errores) e LIMIT 20) x))
                    ELSE '{}'::jsonb END
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
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos', 'movimientos_producto']));
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
               -- 0195: ids que la caja marca como subidos aunque la nube no los guardó.
               || CASE WHEN jsonb_array_length(v_descartados) > 0 THEN jsonb_build_object('_descartados', jsonb_build_object('movimientos_producto', v_descartados)) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;

-- ── §4 Cambio de talla ───────────────────────────────────────────────────────
-- Devolución parcial (motivo CAMBIO_TALLA, la prenda vuelve al anaquel) + venta nueva, las dos en
-- efectivo por lo que regresa: el cajón cuadra solo y solo se mueve la diferencia (pos-retail.md,
-- «Cómo queda registrado»). Si la nueva cuesta más, el ticket queda ABIERTO con el saldo y la caja
-- abre el cobro de siempre; su VENTA de existencias llega al cerrarlo. SECURITY INVOKER: todo lo que
-- llama ya confina. La autorización se pasa tal cual a crear_devolucion, que la exige siempre.
CREATE OR REPLACE FUNCTION registrar_cambio_talla(
  p_ticket_origen uuid, p_regresa jsonb, p_lleva jsonb, p_caja_id uuid, p_turno_id uuid,
  p_usuario_id uuid, p_autorizacion_pin_id uuid, p_usuario_autorizo_id uuid, p_client_id_local varchar DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_tk      tickets%ROWTYPE;
  v_items   jsonb;
  v_malo    boolean;
  v_total   boolean;
  v_dev     uuid;
  v_nuevo   uuid;
  v_regresa numeric(12,2);
  v_lleva   numeric(12,2);
  v_l       jsonb;
  v_n       int := 0;
BEGIN
  -- Reintento con la misma llave: lo ya hecho (crear_devolucion y abrir_ticket son idempotentes,
  -- pero confirmar dos veces fallaría).
  IF p_client_id_local IS NOT NULL THEN
    SELECT id, total_devuelto_mxn INTO v_dev, v_regresa FROM devoluciones
     WHERE tenant_id = current_tenant_id() AND client_id_local = p_client_id_local AND motivo = 'CAMBIO_TALLA';
    IF FOUND THEN
      SELECT id, total_mxn INTO v_nuevo, v_lleva FROM tickets
       WHERE tenant_id = current_tenant_id() AND client_id_local = p_client_id_local;
      RETURN jsonb_build_object('devolucion_id', v_dev, 'ticket_id', v_nuevo, 'regresa_mxn', v_regresa,
                                'lleva_mxn', v_lleva, 'diferencia_mxn', v_lleva - v_regresa);
    END IF;
  END IF;

  SELECT * INTO v_tk FROM tickets WHERE id = p_ticket_origen FOR UPDATE;
  IF NOT FOUND OR v_tk.tenant_id IS DISTINCT FROM current_tenant_id() THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no es de este negocio' USING ERRCODE = '22023';
  END IF;
  IF v_tk.estado_fiscal = 'FACTURADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: Esta venta está facturada. Haz la devolución desde Devoluciones.' USING ERRCODE = '22023';
  END IF;
  IF v_tk.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cambia una venta pagada' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lleva) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lleva) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lleva) e
                 WHERE e->>'producto_id' IS NULL
                    OR NOT COALESCE((e->>'cantidad')::numeric > 0 AND (e->>'cantidad')::numeric <> 'NaN', false)) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta lo que se lleva' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_regresa) IS DISTINCT FROM 'array' OR jsonb_array_length(p_regresa) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta lo que regresa' USING ERRCODE = '22023';
  END IF;

  -- Cada renglón es de esta venta y no pasa de lo que queda por devolver (mismo criterio que el
  -- tope de 0040; aquí para que el rechazo sea DATOS_INVALIDOS y no a medias).
  WITH pedido AS (
    SELECT (e->>'ticket_item_id')::uuid AS id, sum((e->>'cantidad')::numeric) AS cant
      FROM jsonb_array_elements(p_regresa) e GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object('ticket_item_id', p.id, 'cantidad_devuelta', p.cant, 'reversar_inventario_item', true)),
         bool_or(ti.id IS NULL OR p.cant IS NULL OR NOT (p.cant > 0) OR p.cant > ti.cantidad - COALESCE(ya.cant, 0))
    INTO v_items, v_malo
    FROM pedido p
    LEFT JOIN ticket_items ti ON ti.id = p.id AND ti.ticket_id = p_ticket_origen AND NOT ti.cancelado
    LEFT JOIN LATERAL (SELECT sum(di.cantidad_devuelta) AS cant
                         FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
                        WHERE di.ticket_item_id_original = p.id AND d.estado <> 'CANCELADA' AND d.deleted_at IS NULL) ya ON true;
  IF v_malo THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un renglón no es de esta venta o ya se devolvió' USING ERRCODE = '22023';
  END IF;

  -- TOTAL si con esto queda devuelta toda la venta.
  v_total := NOT EXISTS (
    SELECT 1 FROM ticket_items ti
     WHERE ti.ticket_id = p_ticket_origen AND NOT ti.cancelado
       AND ti.cantidad > COALESCE((SELECT sum(di.cantidad_devuelta) FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
                                    WHERE di.ticket_item_id_original = ti.id AND d.estado <> 'CANCELADA' AND d.deleted_at IS NULL), 0)
                       + COALESCE((SELECT (x->>'cantidad_devuelta')::numeric FROM jsonb_array_elements(v_items) x
                                    WHERE (x->>'ticket_item_id')::uuid = ti.id), 0));

  v_dev := crear_devolucion(p_ticket_origen, p_caja_id, p_turno_id,
    (CASE WHEN v_total THEN 'TOTAL' ELSE 'PARCIAL' END)::devolucion_alcance,
    'CAMBIO_TALLA'::devolucion_motivo, NULL, 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id, p_usuario_id, p_usuario_autorizo_id, v_items, true,
    v_tk.cliente_id, NULL, p_client_id_local);
  PERFORM confirmar_devolucion(v_dev, p_usuario_id);
  SELECT total_devuelto_mxn INTO v_regresa FROM devoluciones WHERE id = v_dev;

  -- abrir_ticket valida que el turno esté abierto en esa caja y en la sucursal de la venta.
  v_nuevo := abrir_ticket(v_tk.sucursal_id, p_caja_id, p_turno_id, 'PARA_LLEVAR'::modo_servicio,
                          v_tk.cliente_id, NULL, p_client_id_local, p_usuario_id);
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lleva) LOOP
    v_n := v_n + 1;
    PERFORM agregar_item_a_ticket(v_nuevo, (v_l->>'producto_id')::uuid, (v_l->>'cantidad')::numeric,
                                  NULL, '[]'::jsonb, p_client_id_local || '-' || v_n);
  END LOOP;
  SELECT total_mxn INTO v_lleva FROM tickets WHERE id = v_nuevo;

  IF LEAST(v_regresa, v_lleva) > 0 THEN
    PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, LEAST(v_regresa, v_lleva), NULL, NULL, NULL, NULL, false,
                         'Cambio de la venta ' || v_tk.folio_completo, p_client_id_local || '-pago');
  END IF;

  RETURN jsonb_build_object('devolucion_id', v_dev, 'ticket_id', v_nuevo, 'regresa_mxn', v_regresa,
                            'lleva_mxn', v_lleva, 'diferencia_mxn', v_lleva - v_regresa);
END;
$$;
REVOKE EXECUTE ON FUNCTION registrar_cambio_talla(uuid, jsonb, jsonb, uuid, uuid, uuid, uuid, uuid, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_cambio_talla(uuid, jsonb, jsonb, uuid, uuid, uuid, uuid, uuid, varchar) TO authenticated, service_role;
