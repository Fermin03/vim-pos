-- Smoke sync de lealtad (0156 §8). Lo ganado en una caja sube y suma una sola vez; un cliente
-- registrado en dos cajas con el mismo teléfono se funde en uno y lo suyo se redirige; la caja no
-- puede inventar un canje ni devolver más de lo canjeado; el pull baja clientes, programa, premios
-- y saldos; y el push de siempre (cajas sin actualizar incluidas) sigue igual. Hace ROLLBACK.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_sync_lealtad.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_real uuid; v_dup uuid := gen_random_uuid();
  v_mov uuid := gen_random_uuid(); v_mov2 uuid := gen_random_uuid(); v_falso uuid := gen_random_uuid();
  v_snap jsonb; v_res jsonb; v_pull jsonb; v_fila jsonb;
  v_x uuid; v_y uuid; v_canje uuid := gen_random_uuid(); v_rev uuid := gen_random_uuid(); v_rev2 uuid := gen_random_uuid();
  v_turno uuid; v_prod uuid; v_ticket uuid; v_cli_a uuid; v_cli_b uuid; v_nuevo uuid := gen_random_uuid();
  v_ver integer; v_n integer; v_llaves text[]; v_esperadas text[];
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);

  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_t, 'PUNTOS_DINERO', 10) RETURNING version INTO v_ver;
  -- La nube ya conoce a Ana (se registró en la sucursal A).
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Ana Nube', '4770001566') RETURNING id INTO v_real;

  -- 1) La sucursal B la registró otra vez, con otro id, y le dio 12 puntos.
  v_snap := jsonb_build_object(
    'clientes', jsonb_build_array(jsonb_build_object(
      'id', v_dup, 'tenant_id', v_t, 'nombre', 'Ana Caja B', 'telefono', '4770001566',
      'tipo_fiscal', 'EVENTUAL', 'estado', 'ACTIVO', 'created_at', now(), 'updated_at', now())),
    'lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_mov, 'tenant_id', v_t, 'cliente_id', v_dup, 'tipo', 'GANADO', 'puntos', 12,
      'programa_version', v_ver, 'sucursal_id', v_suc, 'fecha', now(), 'saldo_visto', 12)));
  v_res := sync_push_snapshot(v_t, v_snap);
  RAISE NOTICE 'push 1: %', v_res;
  IF v_res ? '_ignoradas' THEN RAISE EXCEPTION 'la RPC ignoró tablas: %', v_res->'_ignoradas'; END IF;
  IF v_res ? '_errores' THEN RAISE EXCEPTION 'la RPC rechazó filas: %', v_res->'_errores'; END IF;
  IF (SELECT count(*) FROM clientes WHERE tenant_id = v_t AND telefono = '4770001566' AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'quedaron dos clientes con el mismo teléfono'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_dup AND cliente_id = v_real) THEN RAISE EXCEPTION 'no se anotó el alias'; END IF;
  IF (SELECT cliente_id FROM lealtad_movimientos WHERE id = v_mov) <> v_real THEN RAISE EXCEPTION 'el movimiento no se redirigió al cliente real'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 12 THEN RAISE EXCEPTION 'el saldo no sumó'; END IF;
  IF (SELECT saldo_visto FROM lealtad_movimientos WHERE id = v_mov) <> 12 THEN RAISE EXCEPTION 'saldo_visto debe conservar lo que vio la caja'; END IF;

  -- 2) Reenviar el mismo snapshot no suma dos veces.
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 12 THEN RAISE EXCEPTION 'el reenvío sumó dos veces'; END IF;
  IF v_res ? '_errores' THEN RAISE EXCEPTION 'el reenvío dio errores: %', v_res->'_errores'; END IF;

  -- 3) Un push posterior que todavía usa el id viejo (la caja no ha hecho pull) también se redirige.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_mov2, 'tenant_id', v_t, 'cliente_id', v_dup, 'tipo', 'GANADO', 'puntos', 5,
      'programa_version', v_ver, 'sucursal_id', v_suc, 'fecha', now())));
  PERFORM sync_push_snapshot(v_t, v_snap);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'el segundo movimiento no llegó al cliente real'; END IF;

  -- 4) La caja no puede inventar un canje: un CANJE que la nube no autorizó se rechaza.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_falso, 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'CANJE', 'puntos', -17,
      'programa_version', v_ver, 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF NOT (v_res ? '_errores') THEN RAISE EXCEPTION 'aceptó un canje inventado'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'el canje inventado movió el saldo'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE id = v_falso) THEN RAISE EXCEPTION 'el canje inventado quedó en el libro'; END IF;

  -- 5) Ni un ajuste: eso solo lo hace el admin en la nube.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'AJUSTE', 'puntos', 500,
      'programa_version', v_ver, 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF NOT (v_res ? '_errores') OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION 'aceptó un ajuste desde la caja'; END IF;

  -- 6) El pull baja lo que la caja necesita.
  v_pull := sync_pull_snapshot(v_t);
  IF NOT (v_pull ? 'clientes' AND v_pull ? 'lealtad_programa' AND v_pull ? 'lealtad_premios' AND v_pull ? 'lealtad_saldos') THEN
    RAISE EXCEPTION 'al pull le faltan claves de lealtad';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'clientes') c WHERE (c->>'id')::uuid = v_real) THEN RAISE EXCEPTION 'el cliente no baja'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'clientes') c WHERE (c->>'id')::uuid = v_dup) THEN RAISE EXCEPTION 'el duplicado no debe existir'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'lealtad_saldos') s WHERE (s->>'cliente_id')::uuid = v_real AND (s->>'saldo')::int = 17) THEN RAISE EXCEPTION 'el saldo no baja'; END IF;
  IF jsonb_array_length(v_pull->'lealtad_programa') <> 1 THEN RAISE EXCEPTION 'el programa no baja'; END IF;
  IF v_pull ? 'lealtad_movimientos' THEN RAISE EXCEPTION 'los movimientos no deben bajar'; END IF;

  -- 7) UNA CAJA SIN ACTUALIZAR no manda las columnas nuevas. Sin relleno, su ticket y su cliente
  --    se rechazarían por NOT NULL y esa caja dejaría de subir ventas.
  v_snap := _vim_compat_0156(jsonb_build_object(
    'tickets',  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t)),
    'clientes', jsonb_build_array(
      jsonb_build_object('id', v_real, 'tenant_id', v_t, 'nombre', 'Ana editada en caja vieja'),
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'nombre', 'Nuevo de caja vieja'))), v_t);
  IF (v_snap->'tickets'->0->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'el ticket de una caja vieja no recibió lealtad_mxn'; END IF;
  IF v_snap->'clientes'->0->>'codigo_publico' IS DISTINCT FROM (SELECT codigo_publico FROM clientes WHERE id = v_real) THEN
    RAISE EXCEPTION 'una caja vieja le cambiaría el código público a un cliente que ya lo tiene';
  END IF;
  IF length(v_snap->'clientes'->1->>'codigo_publico') <> 64 THEN RAISE EXCEPTION 'el cliente nuevo de una caja vieja quedó sin código'; END IF;
  -- Y una caja ya actualizada conserva lo que manda.
  v_snap := _vim_compat_0156(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'lealtad_mxn', 40))), v_t);
  IF (v_snap->'tickets'->0->>'lealtad_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'el relleno pisó un valor real'; END IF;

  -- 8) REVERSA_CANJE: la caja la sube, pero la nube la valida contra el canje que autorizó. Devuelve
  --    EXACTAMENTE lo canjeado y al cliente del canje, diga lo que diga la caja.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'X Canje', '4770001570') RETURNING id INTO v_x;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Y Otro', '4770001571') RETURNING id INTO v_y;
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_x, 'GANADO', 30, v_ver);
  PERFORM lealtad_registrar_movimiento(v_canje, v_t, v_x, 'CANJE', -10, v_ver);
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_y, 'GANADO', 7, v_ver);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_x) <> 20 THEN RAISE EXCEPTION '8: preparación, saldo de X'; END IF;

  -- (a) la caja dice "devuelve 999 al cliente Y": se devuelven 10 a X y nada a Y.
  v_snap := jsonb_build_object('lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', v_rev, 'tenant_id', v_t, 'cliente_id', v_y, 'tipo', 'REVERSA_CANJE', 'puntos', 999,
      'programa_version', v_ver, 'canje_movimiento_id', v_canje, 'motivo', 'cuenta cancelada', 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF v_res ? '_errores' THEN RAISE EXCEPTION '8a: rechazó una reversa válida: %', v_res->'_errores'; END IF;
  IF (v_res->>'lealtad_movimientos')::int <> 1 THEN RAISE EXCEPTION '8a: aplicadas %', v_res->>'lealtad_movimientos'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_x) <> 30 THEN RAISE EXCEPTION '8a: X debía recuperar exactamente 10 (saldo %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_x); END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_y) <> 7 THEN RAISE EXCEPTION '8a: Y recibió puntos de una reversa que no era suya'; END IF;
  IF (SELECT cliente_id FROM lealtad_movimientos WHERE id = v_rev) <> v_x THEN RAISE EXCEPTION '8a: la reversa quedó a nombre de otro cliente'; END IF;
  IF (SELECT puntos FROM lealtad_movimientos WHERE id = v_rev) <> 10 THEN RAISE EXCEPTION '8a: la reversa quedó con el monto de la caja'; END IF;
  IF (SELECT motivo FROM lealtad_movimientos WHERE id = v_rev) IS DISTINCT FROM 'cuenta cancelada' THEN RAISE EXCEPTION '8a: el motivo es de la caja'; END IF;

  -- (c) el mismo reenvío no devuelve dos veces; ni con otro id (un canje se deshace una vez).
  PERFORM sync_push_snapshot(v_t, v_snap);
  v_res := sync_push_snapshot(v_t, jsonb_set(v_snap, '{lealtad_movimientos,0,id}', to_jsonb(v_rev2::text)));
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_x) <> 30 THEN RAISE EXCEPTION '8c: la reversa devolvió dos veces'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE id = v_rev2) THEN RAISE EXCEPTION '8c: quedó una segunda reversa del mismo canje'; END IF;

  -- (b) una reversa que no apunta a un canje de este negocio se rechaza y no mueve nada.
  FOREACH v_fila IN ARRAY ARRAY[
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_x, 'tipo', 'REVERSA_CANJE', 'puntos', 10,
      'programa_version', v_ver, 'canje_movimiento_id', gen_random_uuid(), 'fecha', now()),            -- no existe
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_x, 'tipo', 'REVERSA_CANJE', 'puntos', 10,
      'programa_version', v_ver, 'fecha', now()),                                                       -- sin canje
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_y, 'tipo', 'REVERSA_CANJE', 'puntos', 7,
      'programa_version', v_ver, 'canje_movimiento_id', v_mov, 'fecha', now())                          -- apunta a un GANADO
  ] LOOP
    v_res := sync_push_snapshot(v_t, jsonb_build_object('lealtad_movimientos', jsonb_build_array(v_fila)));
    IF NOT (v_res ? '_errores') THEN RAISE EXCEPTION '8b: aceptó una reversa sin canje: %', v_fila; END IF;
    IF (v_res->>'lealtad_movimientos')::int <> 0 THEN RAISE EXCEPTION '8b: la reversa inválida contó como aplicada'; END IF;
  END LOOP;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_x) <> 30 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_y) <> 7 THEN
    RAISE EXCEPTION '8b: una reversa inválida movió saldos';
  END IF;

  -- 9) Colisión por EDICIÓN: B ya existe en la nube y su fila editada trae el teléfono de A. No es un
  --    duplicado de otra caja: no se anota alias, no se quita B del lote, la restricción única lo
  --    rechaza como siempre y los dos clientes siguen vivos.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'A Edición', '4770001580') RETURNING id INTO v_cli_a;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'B Edición', '4770001581') RETURNING id INTO v_cli_b;
  SELECT to_jsonb(c) || jsonb_build_object('telefono', '4770001580') INTO v_fila FROM clientes c WHERE id = v_cli_b;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(v_fila)));
  IF NOT (v_res ? '_errores') THEN RAISE EXCEPTION '9: la colisión por edición no se reportó'; END IF;
  IF v_res->'_errores'->0->>'id' <> v_cli_b::text THEN RAISE EXCEPTION '9: el error no es de B: %', v_res->'_errores'; END IF;
  IF EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id IN (v_cli_a, v_cli_b)) THEN RAISE EXCEPTION '9: se anotó un alias para un cliente que existe'; END IF;
  IF (SELECT count(*) FROM clientes WHERE id IN (v_cli_a, v_cli_b) AND deleted_at IS NULL) <> 2 THEN RAISE EXCEPTION '9: se perdió un cliente'; END IF;
  IF (SELECT telefono FROM clientes WHERE id = v_cli_b) <> '4770001581' THEN RAISE EXCEPTION '9: B cambió de teléfono'; END IF;

  -- 10) El push de SIEMPRE no cambió: solo tablas anteriores a la 0156 devuelve las mismas claves
  --     de antes más las dos nuevas en cero, sin errores ni ignoradas.
  SELECT to_jsonb(c) - 'codigo_publico' || jsonb_build_object('id', gen_random_uuid(), 'nombre', 'Cliente de siempre', 'telefono', '4770001590')
    INTO v_fila FROM clientes c WHERE id = v_real;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(v_fila)));
  IF v_res ? '_errores' OR v_res ? '_ignoradas' THEN RAISE EXCEPTION '10: el push de siempre dio errores o ignoradas: %', v_res; END IF;
  v_esperadas := ARRAY['repartidores', 'zonas_envio', 'clientes', 'direcciones_cliente', 'turnos', 'tickets',
    'ticket_items', 'ticket_item_modificadores', 'pagos', 'ticket_descuentos_manuales', 'ticket_promociones_aplicadas',
    'comanda_impresiones', 'ticket_reimpresiones', 'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja', 'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle',
    'reportes_z_historico', 'mesas_estado', 'movimientos_inventario'];
  SELECT array_agg(k ORDER BY k) INTO v_llaves FROM jsonb_object_keys(v_res) k WHERE k NOT IN ('lealtad_movimientos', 'ticket_canjes_lealtad');
  IF v_llaves IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(v_esperadas) k) THEN
    RAISE EXCEPTION '10: las claves de siempre cambiaron: %', v_llaves;
  END IF;
  IF (v_res->>'lealtad_movimientos')::int <> 0 OR (v_res->>'ticket_canjes_lealtad')::int <> 0 THEN RAISE EXCEPTION '10: las claves nuevas debían venir en cero: %', v_res; END IF;
  IF (v_res->>'clientes')::int <> 1 THEN RAISE EXCEPTION '10: el cliente de siempre no entró'; END IF;

  -- 11) Una fila de lealtad mal formada se rechaza ELLA, sin frenar el ticket ni el cliente del mismo
  --     lote. Y una caja sin actualizar (sin lealtad_mxn ni codigo_publico) sigue subiendo.
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-SL', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_t AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sl-t', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'sl-i');

  v_snap := jsonb_build_object(
    'tickets', jsonb_build_array((SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('nota_general', 'editado en caja vieja') FROM tickets t WHERE id = v_ticket)),
    'clientes', jsonb_build_array((SELECT to_jsonb(c) - 'codigo_publico' || jsonb_build_object('id', v_nuevo, 'nombre', 'Nuevo de caja vieja', 'telefono', '4770001595') FROM clientes c WHERE id = v_real)),
    'lealtad_movimientos', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'GANADO', 'puntos', 'muchos',
        'programa_version', v_ver, 'fecha', now()),
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'REGALO', 'puntos', 5,
        'programa_version', v_ver, 'fecha', now()),
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', 'no-es-un-uuid', 'tipo', 'GANADO', 'puntos', 5,
        'programa_version', v_ver, 'fecha', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF jsonb_array_length(v_res->'_errores') <> 3 THEN RAISE EXCEPTION '11: debían ser 3 rechazos de lealtad: %', v_res->'_errores'; END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'tabla' = 'lealtad_movimientos';
  IF v_n <> 3 THEN RAISE EXCEPTION '11: los rechazos no son de lealtad: %', v_res->'_errores'; END IF;
  IF (v_res->>'lealtad_movimientos')::int <> 0 THEN RAISE EXCEPTION '11: aplicó filas malas'; END IF;
  IF (v_res->>'tickets')::int <> 1 OR (v_res->>'clientes')::int <> 1 THEN RAISE EXCEPTION '11: las filas malas frenaron al ticket o al cliente: %', v_res; END IF;
  IF (SELECT nota_general FROM tickets WHERE id = v_ticket) IS DISTINCT FROM 'editado en caja vieja' THEN RAISE EXCEPTION '11: el ticket no se aplicó'; END IF;
  IF (SELECT lealtad_mxn FROM tickets WHERE id = v_ticket) <> 0 THEN RAISE EXCEPTION '11: el ticket de caja vieja quedó sin lealtad_mxn'; END IF;
  IF length((SELECT codigo_publico FROM clientes WHERE id = v_nuevo)) <> 64 THEN RAISE EXCEPTION '11: el cliente de caja vieja quedó sin código'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION '11: una fila mala movió el saldo'; END IF;

  RAISE NOTICE 'SMOKE SYNC LEALTAD OK';
END $$;
ROLLBACK;
