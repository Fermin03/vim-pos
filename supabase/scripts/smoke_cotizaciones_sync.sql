-- Smoke: las cotizaciones de la caja suben con sync_push_snapshot (retail 2, entrega 3; 0213). Hace ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_cotizaciones_sync.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := 'c2130000-0000-0000-0000-0000000000ee';
  v_cat    uuid := 'c2130000-0000-0000-0000-0000000000c1';
  v_pa     uuid := 'c2130000-0000-0000-0000-0000000000a1';
  v_ana    uuid := 'c2130000-0000-0000-0000-000000000001';
  v_alias  uuid := 'c2130000-0000-0000-0000-000000000002';
  v_turno  uuid; v_tk uuid; v_c1 uuid; v_c2 uuid; v_ajena uuid := gen_random_uuid();
  j jsonb; v_cot jsonb; v_items jsonb; v_cot2 jsonb; v_items2 jsonb; v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Cotizaciones sync');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn) VALUES (v_pa, v_t, 'Botas sync', v_cat, 100);
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES (v_ana, v_t, 'Ana Sync', '4770002131');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE configuracion_tenant SET modulo_cotizaciones_activo = true WHERE tenant_id = v_t;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0213', 'Otra tienda 0213', 'INTERNO', 'QUICK_SERVICE');

  -- Lo que la caja manda: dos cotizaciones hechas con la RPC, tal como to_jsonb las deja. Se borran
  -- aquí para que la «nube» no las tenga.
  j := guardar_cotizacion(v_suc, v_caja, v_ana, jsonb_build_array(
         jsonb_build_object('producto_id', v_pa, 'cantidad', 2),
         jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cots-1');
  v_c1 := (j->>'id')::uuid;
  j := guardar_cotizacion(v_suc, v_caja, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cots-2');
  v_c2 := (j->>'id')::uuid;
  SELECT to_jsonb(c) INTO v_cot FROM cotizaciones c WHERE id = v_c1;
  SELECT jsonb_agg(to_jsonb(i)) INTO v_items FROM cotizacion_items i WHERE cotizacion_id = v_c1;
  SELECT to_jsonb(c) INTO v_cot2 FROM cotizaciones c WHERE id = v_c2;
  SELECT jsonb_agg(to_jsonb(i)) INTO v_items2 FROM cotizacion_items i WHERE cotizacion_id = v_c2;
  DELETE FROM cotizaciones WHERE id IN (v_c1, v_c2);

  -- 1) Sube con sus renglones; no va a _ignoradas.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizaciones', jsonb_build_array(v_cot), 'cotizacion_items', v_items));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 1 OR (v_res->>'cotizacion_items')::int IS DISTINCT FROM 2
     OR v_res ? '_errores' OR v_res ? '_ignoradas' THEN
    RAISE EXCEPTION '1: la cotización y sus 2 renglones debían aplicarse: %', v_res; END IF;
  IF (SELECT folio || '|' || token_publico || '|' || total_mxn FROM cotizaciones WHERE id = v_c1)
     <> (v_cot->>'folio') || '|' || (v_cot->>'token_publico') || '|' || (v_cot->>'total_mxn')::numeric THEN
    RAISE EXCEPTION '1: la cotización no llegó tal cual'; END IF;

  -- 2) Dos push iguales no duplican nada.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizaciones', jsonb_build_array(v_cot), 'cotizacion_items', v_items));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 0 OR (v_res->>'cotizacion_items')::int IS DISTINCT FROM 0 OR v_res ? '_errores' THEN
    RAISE EXCEPTION '2: el reenvío debía aplicar 0 sin errores: %', v_res; END IF;
  IF (SELECT count(*) FROM cotizaciones WHERE tenant_id = v_t AND client_id_local = 'smoke-cots-1') <> 1
     OR (SELECT count(*) FROM cotizacion_items WHERE cotizacion_id = v_c1) <> 2 THEN
    RAISE EXCEPTION '2: se duplicó'; END IF;

  -- 3) El cambio de estado se aplica (y solo eso: un renglón reenviado con otro precio no cambia).
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'cotizaciones', jsonb_build_array(v_cot || jsonb_build_object('estado', 'CANCELADA', 'updated_at', now() + interval '1 minute')),
    'cotizacion_items', jsonb_build_array(v_items->0 || jsonb_build_object('precio_unitario_snapshot', 1))));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 1 OR (v_res->>'cotizacion_items')::int IS DISTINCT FROM 0 OR v_res ? '_errores' THEN
    RAISE EXCEPTION '3: el cambio de estado debía aplicarse: %', v_res; END IF;
  IF (SELECT estado FROM cotizaciones WHERE id = v_c1) <> 'CANCELADA' THEN RAISE EXCEPTION '3: no quedó CANCELADA'; END IF;
  IF EXISTS (SELECT 1 FROM cotizacion_items WHERE cotizacion_id = v_c1 AND precio_unitario_snapshot = 1) THEN
    RAISE EXCEPTION '3: un renglón ya subido cambió'; END IF;

  -- 4) Convertida con una venta que la nube aún no tiene: se rechaza (se reintenta); con la venta, entra.
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-COTS', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizaciones', jsonb_build_array(
    v_cot2 || jsonb_build_object('estado', 'CONVERTIDA', 'ticket_id', gen_random_uuid(), 'updated_at', now()))));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 0
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]')) e
                     WHERE e->>'tabla' = 'cotizaciones' AND e->>'id' = v_c2::text) THEN
    RAISE EXCEPTION '4: una venta que aún no sube debía rechazarse: %', v_res; END IF;
  IF EXISTS (SELECT 1 FROM cotizaciones WHERE id = v_c2) THEN RAISE EXCEPTION '4: entró sin su venta'; END IF;
  -- Sus renglones, sin la cotización, también se rechazan.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizacion_items', v_items2));
  IF (v_res->>'cotizacion_items')::int IS DISTINCT FROM 0 OR jsonb_array_length(COALESCE(v_res->'_errores', '[]')) <> 1 THEN
    RAISE EXCEPTION '4: un renglón sin su cotización debía rechazarse: %', v_res; END IF;
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-cots-tk', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_pa, 1, NULL, '[]'::jsonb, 'smoke-cots-tk-a');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 100, 100);
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'cotizaciones', jsonb_build_array(v_cot2 || jsonb_build_object('estado', 'CONVERTIDA', 'ticket_id', v_tk, 'updated_at', now())),
    'cotizacion_items', v_items2));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 1 OR (v_res->>'cotizacion_items')::int IS DISTINCT FROM 1 OR v_res ? '_errores' THEN
    RAISE EXCEPTION '4: con su venta debía entrar: %', v_res; END IF;
  IF (SELECT estado || ':' || ticket_id FROM cotizaciones WHERE id = v_c2) <> 'CONVERTIDA:' || v_tk THEN
    RAISE EXCEPTION '4: no quedó CONVERTIDA con su venta'; END IF;

  -- 5) Un cliente que la nube fundió con otro se redirige.
  INSERT INTO clientes_alias (alias_id, cliente_id, tenant_id) VALUES (v_alias, v_ana, v_t);
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizaciones', jsonb_build_array(v_cot || jsonb_build_object(
    'id', gen_random_uuid(), 'folio', 'COT-ALIAS-1', 'client_id_local', 'smoke-cots-alias', 'cliente_id', v_alias,
    'token_publico', md5('alias') || md5('alias2')))));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 1 OR v_res ? '_errores' THEN RAISE EXCEPTION '5: el alias debía aplicarse: %', v_res; END IF;
  IF (SELECT cliente_id FROM cotizaciones WHERE client_id_local = 'smoke-cots-alias') <> v_ana THEN
    RAISE EXCEPTION '5: el cliente no se redirigió'; END IF;

  -- 6) Lo que no es del negocio se rechaza y no detiene a lo bueno.
  SET LOCAL session_replication_role = replica;
  INSERT INTO cotizaciones (id, tenant_id, sucursal_id, caja_id, folio, vigente_hasta)
  VALUES (v_ajena, v_otro, v_suc, v_caja, 'COT-AJENA', current_date);
  SET LOCAL session_replication_role = origin;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('cotizaciones', jsonb_build_array(
    v_cot || jsonb_build_object('id', gen_random_uuid(), 'folio', 'COT-X1', 'client_id_local', 'x1', 'token_publico', md5('x1') || md5('y1'), 'tenant_id', v_otro),
    v_cot || jsonb_build_object('id', v_ajena, 'folio', 'COT-X2', 'client_id_local', 'x2', 'token_publico', md5('x2') || md5('y2')),
    v_cot || jsonb_build_object('id', gen_random_uuid(), 'folio', 'COT-X3', 'client_id_local', 'x3', 'token_publico', md5('x3') || md5('y3'), 'cliente_id', gen_random_uuid()),
    v_cot || jsonb_build_object('id', gen_random_uuid(), 'folio', 'COT-X4', 'client_id_local', 'x4', 'token_publico', md5('x4') || md5('y4'), 'sucursal_id', gen_random_uuid()),
    v_cot || jsonb_build_object('id', gen_random_uuid(), 'folio', 'COT-X5', 'client_id_local', 'x5', 'token_publico', md5('x5') || md5('y5'), 'caja_id', gen_random_uuid()),
    v_cot || jsonb_build_object('id', gen_random_uuid(), 'folio', 'COT-X6', 'client_id_local', 'x6', 'token_publico', md5('x6') || md5('y6'))),
    'cotizacion_items', jsonb_build_array(
      v_items->0 || jsonb_build_object('id', gen_random_uuid(), 'cotizacion_id', v_ajena),
      v_items->0 || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_otro))));
  IF (v_res->>'cotizaciones')::int IS DISTINCT FROM 1 OR (v_res->>'cotizacion_items')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '6: solo la buena debía aplicarse: %', v_res; END IF;
  IF jsonb_array_length(COALESCE(v_res->'_errores', '[]')) <> 7 THEN RAISE EXCEPTION '6: debían ser 7 errores: %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e
                  WHERE e->>'id' = v_ajena::text AND e->>'error' = 'el id ya existe en otro negocio') THEN
    RAISE EXCEPTION '6: el id de otro negocio debía ser error: %', v_res; END IF;
  IF (SELECT tenant_id FROM cotizaciones WHERE id = v_ajena) <> v_otro OR (SELECT folio FROM cotizaciones WHERE id = v_ajena) <> 'COT-AJENA' THEN
    RAISE EXCEPTION '6: se pisó la cotización de otro negocio'; END IF;
  IF EXISTS (SELECT 1 FROM cotizaciones WHERE tenant_id = v_otro AND folio <> 'COT-AJENA') THEN
    RAISE EXCEPTION '6: entró una cotización a otro negocio'; END IF;

  -- 7) El pull no las baja.
  IF sync_pull_snapshot(v_t) ? 'cotizaciones' OR sync_pull_snapshot(v_t) ? 'cotizacion_items' THEN
    RAISE EXCEPTION '7: el pull bajó cotizaciones'; END IF;
  RAISE NOTICE 'SMOKE COTIZACIONES SYNC 0213 OK';
END $$;
ROLLBACK;
