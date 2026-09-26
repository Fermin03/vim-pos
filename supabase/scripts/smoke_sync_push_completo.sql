-- Smoke: lo que la caja hace DESPUÉS de cobrar llega a la nube sin pisar lo que la nube sabe (0122).
--
-- La nube aplica el push con ON CONFLICT DO UPDATE de todas las columnas. Desde la 0.4.91 la caja
-- vuelve a mandar una venta que cambió después de subirla, así que hay que probar las tres reglas:
--
--   A) Un ticket que la nube ya FACTURÓ no regresa a PAGADO con la copia de la caja, pero el resto
--      de lo que cambió en la caja (aquí, la hora en que cocina lo marcó listo) sí entra.
--   B) Una cancelación hecha en la caja SÍ gana: la venta se canceló de verdad.
--   C) El estado de una mesa sube solo como estado: nombre y capacidad no se tocan, y una mesa que
--      la nube no tiene no es un error.
--   D) Las tablas que antes no subían (descuentos, reimpresiones) ahora se aplican.
--
-- Se corre contra la misma base: "la nube" es el estado de la fila antes de llamar al push.
-- ROLLBACK al final.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_ticket uuid; v_mesa uuid;
  v_fila   jsonb; v_res jsonb; v_estado text; v_listo timestamptz; v_nombre text; v_n integer;
  v_auth   uuid; v_area uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-SP', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sp-t', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'sp-i');

  -- ── D) Descuentos y reimpresiones: antes se quedaban en la caja ────────────────
  -- Como en la caja: la fila completa (to_jsonb de una fila real, con sus defaults). Se crean con el
  -- ticket todavía abierto y se suben como copias con id nuevo: el push tiene que insertarlas.
  -- (Sin session_replication_role: en el CI el smoke no corre como superusuario.)
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'descuento_manual', 'descuento.manual_aplicar',
          'ticket', v_ticket, 10, 'Smoke sync')
  RETURNING id INTO v_auth;
  SELECT id INTO v_area FROM areas_cocina WHERE tenant_id = v_tenant LIMIT 1;
  IF v_area IS NULL THEN
    INSERT INTO areas_cocina(tenant_id, sucursal_id, nombre) VALUES (v_tenant, v_suc, 'Cocina smoke') RETURNING id INTO v_area;
  END IF;

  INSERT INTO ticket_descuentos_manuales(tenant_id, ticket_id, tipo, valor_monto_mxn, monto_descontado_mxn,
    motivo_categoria, autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id)
  VALUES (v_tenant, v_ticket, 'MONTO_FIJO', 10, 10, 'CLIENTE_FRECUENTE', v_auth, v_maria, v_maria)
  RETURNING to_jsonb(ticket_descuentos_manuales.*) INTO v_fila;
  INSERT INTO comanda_impresiones(tenant_id, sucursal_id, ticket_id, area_cocina_id, area_cocina_nombre_snapshot,
    evento_tipo, usuario_id)
  VALUES (v_tenant, v_suc, v_ticket, v_area, 'Cocina', 'IMPRESION_INICIAL', v_maria)
  RETURNING to_jsonb(comanda_impresiones.*) INTO v_res;

  v_res := sync_push_snapshot(v_tenant, jsonb_build_object(
    'ticket_descuentos_manuales', jsonb_build_array(v_fila || jsonb_build_object('id', gen_random_uuid())),
    'comanda_impresiones', jsonb_build_array(v_res || jsonb_build_object('id', gen_random_uuid()))));
  IF (v_res->>'ticket_descuentos_manuales')::int <> 1 OR (v_res->>'comanda_impresiones')::int <> 1 THEN
    RAISE EXCEPTION 'D: descuentos/reimpresiones no se aplicaron: %', v_res;
  END IF;
  IF v_res ? '_ignoradas' THEN
    RAISE EXCEPTION 'D: la nube ignoró tablas que ya debería replicar: %', v_res->'_ignoradas';
  END IF;
  SELECT count(*) INTO v_n FROM ticket_descuentos_manuales WHERE ticket_id = v_ticket;
  IF v_n <> 2 THEN RAISE EXCEPTION 'D: la copia del descuento no quedó (hay %)', v_n; END IF;
  RAISE NOTICE 'D ok: descuentos y reimpresiones arriba';

  -- ── A) La nube facturó; la caja manda su copia PAGADO con la hora de "listo" ─────
  -- La "nube" lo tiene FACTURADO: se pone con el mismo push (corre en réplica como su dueño), sin
  -- pasar por el flujo de cobro y timbrado.
  SELECT to_jsonb(t) INTO v_fila FROM tickets t WHERE id = v_ticket;
  PERFORM sync_push_snapshot(v_tenant, jsonb_build_object('tickets', jsonb_build_array(v_fila || jsonb_build_object('estado_fiscal', 'FACTURADO'))));
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_ticket) <> 'FACTURADO' THEN
    RAISE EXCEPTION 'A: preparación — no se pudo dejar el ticket FACTURADO';
  END IF;
  v_fila := v_fila || jsonb_build_object('estado_fiscal', 'PAGADO', 'fecha_listo', now());
  v_res := sync_push_snapshot(v_tenant, jsonb_build_object('tickets', jsonb_build_array(v_fila)));

  SELECT estado_fiscal::text, fecha_listo INTO v_estado, v_listo FROM tickets WHERE id = v_ticket;
  IF v_estado <> 'FACTURADO' THEN
    RAISE EXCEPTION 'A: la copia de la caja regresó un ticket FACTURADO a % — se ofrecería otra vez para facturar', v_estado;
  END IF;
  IF v_listo IS NULL THEN
    RAISE EXCEPTION 'A: la guarda del FACTURADO se llevó también lo que cambió en la caja (fecha_listo no entró)';
  END IF;
  RAISE NOTICE 'A ok: sigue FACTURADO y la hora de listo entró';

  -- ── B) Cancelado en la caja: gana ──────────────────────────────────────────────
  v_fila := v_fila || jsonb_build_object('estado_fiscal', 'CANCELADO');
  PERFORM sync_push_snapshot(v_tenant, jsonb_build_object('tickets', jsonb_build_array(v_fila)));
  SELECT estado_fiscal::text INTO v_estado FROM tickets WHERE id = v_ticket;
  IF v_estado <> 'CANCELADO' THEN
    RAISE EXCEPTION 'B: una cancelación hecha en la caja no llegó (quedó %)', v_estado;
  END IF;
  RAISE NOTICE 'B ok: la cancelación de la caja gana';

  -- ── C) Estado de mesa: solo el estado ─────────────────────────────────────────
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 93, 'Mesa 93', 6, 'OCUPADA', 'CUADRADA') RETURNING id INTO v_mesa;
  v_res := sync_push_snapshot(v_tenant, jsonb_build_object('mesas_estado', jsonb_build_array(
    jsonb_build_object('id', v_mesa, 'estado', 'LIBRE'),
    jsonb_build_object('id', gen_random_uuid(), 'estado', 'LIBRE'))));
  SELECT estado::text, nombre INTO v_estado, v_nombre FROM mesas WHERE id = v_mesa;
  IF v_estado <> 'LIBRE' THEN
    RAISE EXCEPTION 'C: la mesa atorada no se liberó con el estado de la caja (quedó %)', v_estado;
  END IF;
  IF v_nombre IS DISTINCT FROM 'Mesa 93' OR (SELECT capacidad FROM mesas WHERE id = v_mesa) <> 6 THEN
    RAISE EXCEPTION 'C: subir el estado pisó el catálogo de la mesa (nombre %)', v_nombre;
  END IF;
  IF v_res ? '_errores' THEN
    RAISE EXCEPTION 'C: una mesa que la nube no tiene no debe ser error: %', v_res->'_errores';
  END IF;
  RAISE NOTICE 'C ok: estado arriba, catálogo intacto';

END $$;
ROLLBACK;
