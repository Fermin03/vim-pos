-- Smoke tienda en línea (mig. 0164 §3): tienda_sincronizar_estados_nube. Un pedido atendido desde el
-- POS web (gestión NUBE) no tiene caja que reporte su estado: la nube mira su ticket y lo pasa sola
-- a LISTO, ENTREGADO o CANCELADO, con la misma regla que tienda_seguimiento. Los de una caja
-- instalada (ESCRITORIO) y los de las apps no se tocan. delivery_marcar_expirados la ejecuta.
-- Fixture: el de smoke_tienda_seguimiento.sql (tienda abierta, turno abierto, un producto, una zona).
-- Uso: cd desktop && npm run smokes -- smoke_tienda_estado_nube.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.h(p_n int) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to('estado-nube-' || p_n, 'UTF8')), 'hex') $$;
CREATE SEQUENCE pg_temp.n_pedido;
-- Un pedido de la tienda ya aceptado, con su ticket de verdad en la nube.
CREATE FUNCTION pg_temp.aceptado(p_modo text DEFAULT 'RECOGER') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_t   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_n   int := nextval('pg_temp.n_pedido');
  v_id  uuid;
BEGIN
  v_id := (tienda_crear_pedido(v_t, v_suc, p_modo,
             CASE WHEN p_modo = 'DOMICILIO' THEN (SELECT id FROM zonas_envio WHERE nombre = 'Nube 35') END,
             format('[{"producto_id":"%s","cantidad":1}]', (SELECT id FROM productos WHERE nombre = 'Sencilla nube'))::jsonb,
             jsonb_build_object('nombre', 'Ana Nube', 'telefono', '4775552' || lpad(v_n::text, 3, '0')),
             CASE WHEN p_modo = 'DOMICILIO' THEN '{"calle":"Av. Nube","numero_exterior":"7","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}'::jsonb END,
             'EFECTIVO', NULL, NULL, pg_temp.h(v_n)) ->> 'pedido_id')::uuid;
  IF (SELECT gestion FROM delivery_pedidos WHERE id = v_id) <> 'NUBE' THEN RAISE EXCEPTION 'fixture: el pedido debía nacer de gestión NUBE'; END IF;
  PERFORM crear_ticket_desde_tienda(v_id);
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ACEPTADO' THEN RAISE EXCEPTION 'fixture: el pedido debía quedar ACEPTADO'; END IF;
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.fila(p_id uuid) RETURNS jsonb LANGUAGE sql
AS $$ SELECT to_jsonb(p) FROM delivery_pedidos p WHERE p.id = p_id $$;
CREATE FUNCTION pg_temp.ticket(p_id uuid) RETURNS uuid LANGUAGE sql
AS $$ SELECT ticket_id FROM delivery_pedidos WHERE id = p_id $$;

DO $$
DECLARE
  c_firma  CONSTANT text := 'tienda_sincronizar_estados_nube()';
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat uuid; v_rep uuid; v_conexion uuid;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_id uuid; v_quieto uuid; v_esc uuid; v_app uuid; v_viejo uuid; v_vence uuid; v_antes jsonb; v_n int;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture ───────────────────────────────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta)
  VALUES (v_t, 'estado-nube-smoke', 7, true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Nube smoke', 62) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla nube', 120);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Nube 35', 35);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-NUBE', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  INSERT INTO repartidores (tenant_id, nombre, telefono) VALUES (v_t, 'Luis Nube', '4771234568') RETURNING id INTO v_rep;

  -- 1) Aceptado y sin nada que decir (ticket abierto, sin imprimir): la pasada no lo toca.
  v_quieto := pg_temp.aceptado();
  v_antes := pg_temp.fila(v_quieto);
  PERFORM tienda_sincronizar_estados_nube();
  IF pg_temp.fila(v_quieto) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '1: tocó un pedido cuyo ticket no dice nada'; END IF;

  -- 2) Imprimir el ticket → LISTO; cobrarlo → ENTREGADO. Cada paso, una pasada; la segunda no cambia nada.
  v_id := pg_temp.aceptado();
  UPDATE tickets SET ticket_impreso_at = now() WHERE id = pg_temp.ticket(v_id);
  v_n := tienda_sincronizar_estados_nube();
  IF v_n <> 1 THEN RAISE EXCEPTION '2: la pasada movió % (esperaba 1)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'LISTO' AND listo_at IS NOT NULL AND entregado_at IS NULL) THEN
    RAISE EXCEPTION '2: impreso debía quedar LISTO con listo_at: %', pg_temp.fila(v_id);
  END IF;
  v_antes := pg_temp.fila(v_id);
  IF tienda_sincronizar_estados_nube() <> 0 OR pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '2: la segunda pasada debía dejar todo igual (LISTO)'; END IF;
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = pg_temp.ticket(v_id);
  v_n := tienda_sincronizar_estados_nube();
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'ENTREGADO' AND entregado_at IS NOT NULL) THEN
    RAISE EXCEPTION '2: cobrado debía quedar ENTREGADO (movió %): %', v_n, pg_temp.fila(v_id);
  END IF;
  v_antes := pg_temp.fila(v_id);
  IF tienda_sincronizar_estados_nube() <> 0 OR pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '2: la segunda pasada debía dejar todo igual (ENTREGADO)'; END IF;

  -- 3) Cobrado sin imprimir, y facturado: de ACEPTADO a ENTREGADO directo.
  FOR r IN SELECT * FROM (VALUES ('PAGADO'), ('FACTURADO')) AS x(fiscal) LOOP
    v_id := pg_temp.aceptado();
    UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = pg_temp.ticket(v_id);
    IF r.fiscal = 'FACTURADO' THEN UPDATE tickets SET estado_fiscal = 'FACTURADO' WHERE id = pg_temp.ticket(v_id); END IF;
    PERFORM tienda_sincronizar_estados_nube();
    IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ENTREGADO' THEN RAISE EXCEPTION '3 (%): esperaba ENTREGADO: %', r.fiscal, pg_temp.fila(v_id); END IF;
  END LOOP;

  -- 4) A domicilio con repartidor asignado y sin imprimir → LISTO.
  v_id := pg_temp.aceptado('DOMICILIO');
  INSERT INTO delivery_asignaciones (tenant_id, sucursal_id, ticket_id, repartidor_catalogo_id, repartidor_nombre, monto_a_liquidar_mxn, estado, fecha_salida)
  VALUES (v_t, v_suc, pg_temp.ticket(v_id), v_rep, 'Luis Nube', 155, 'EN_RUTA', now());
  PERFORM tienda_sincronizar_estados_nube();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'LISTO' THEN RAISE EXCEPTION '4: con repartidor esperaba LISTO: %', pg_temp.fila(v_id); END IF;

  -- 5) Ticket cancelado (aunque esté impreso) → CANCELADO por el restaurante, motivo OTRO.
  v_id := pg_temp.aceptado();
  UPDATE tickets SET ticket_impreso_at = now() WHERE id = pg_temp.ticket(v_id);
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = pg_temp.ticket(v_id);
  PERFORM tienda_sincronizar_estados_nube();
  IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'CANCELADO' AND cancelado_at IS NOT NULL
                   AND cancelado_por = 'RESTAURANTE' AND motivo_cancelacion = 'OTRO') THEN
    RAISE EXCEPTION '5: esperaba CANCELADO por RESTAURANTE con motivo OTRO: %', pg_temp.fila(v_id);
  END IF;
  -- Y lo que ve el cliente coincide con lo guardado.
  IF (tienda_seguimiento(v_t, (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id)) ->> 'estado') IS DISTINCT FROM 'CANCELADO' THEN
    RAISE EXCEPTION '5: el seguimiento no dice CANCELADO';
  END IF;

  -- 6) No se tocan: el de una caja instalada (ESCRITORIO), el de una app, y uno de hace más de 7 días.
  v_esc := pg_temp.aceptado();
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = pg_temp.ticket(v_esc);
  UPDATE delivery_pedidos SET gestion = 'ESCRITORIO' WHERE id = v_esc;
  v_viejo := pg_temp.aceptado();
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = pg_temp.ticket(v_viejo);
  UPDATE delivery_pedidos SET recibido_at = now() - interval '8 days' WHERE id = v_viejo;
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_t, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-nube') RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, estado, gestion, ticket_id, items, payload_raw, total_cliente_mxn)
  VALUES (v_t, v_suc, v_conexion, 'APP_UBEREATS', 'uber-nube-1', 'ACEPTADO', 'NUBE', pg_temp.ticket(v_esc), '[]'::jsonb, '{}'::jsonb, 0)
  RETURNING id INTO v_app;
  v_n := tienda_sincronizar_estados_nube();
  IF v_n <> 0 THEN RAISE EXCEPTION '6: la pasada movió % (esperaba 0)', v_n; END IF;
  FOR r IN SELECT * FROM (VALUES ('ESCRITORIO', v_esc), ('de una app', v_app), ('de hace 8 días', v_viejo), ('sin nada que decir', v_quieto)) AS x(caso, id) LOOP
    IF (SELECT estado FROM delivery_pedidos WHERE id = r.id) <> 'ACEPTADO' THEN RAISE EXCEPTION '6: tocó el pedido %', r.caso; END IF;
  END LOOP;

  -- 7) delivery_marcar_expirados la ejecuta, y sigue marcando vencidos.
  v_id := pg_temp.aceptado();
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = pg_temp.ticket(v_id);
  v_vence := (tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL,
                format('[{"producto_id":"%s","cantidad":1}]', (SELECT id FROM productos WHERE nombre = 'Sencilla nube'))::jsonb,
                '{"nombre":"Ana Nube","telefono":"4775552999"}'::jsonb, NULL, 'EFECTIVO', NULL, NULL, pg_temp.h(999)) ->> 'pedido_id')::uuid;
  UPDATE delivery_pedidos SET vence_aceptacion = now() - interval '1 minute' WHERE id = v_vence;
  v_n := delivery_marcar_expirados();
  IF v_n < 1 OR (SELECT estado FROM delivery_pedidos WHERE id = v_vence) <> 'EXPIRADO' THEN RAISE EXCEPTION '7: no marcó el vencido (devolvió %)', v_n; END IF;
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ENTREGADO' THEN RAISE EXCEPTION '7: delivery_marcar_expirados no puso al día el pedido cobrado'; END IF;

  -- 8) Solo service_role.
  IF NOT has_function_privilege('service_role', c_firma, 'EXECUTE') THEN RAISE EXCEPTION '8: service_role debe poder ejecutarla'; END IF;
  IF has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('authenticated', c_firma, 'EXECUTE') THEN
    RAISE EXCEPTION '8: anon o authenticated pueden ejecutar tienda_sincronizar_estados_nube';
  END IF;

  RAISE NOTICE 'smoke_tienda_estado_nube OK';
END $$;
ROLLBACK;
