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
  v_codigo text; v_base jsonb; v_esp uuid; v_ant uuid; v_r3 uuid; v_r4 uuid;
  v_e1 uuid := gen_random_uuid(); v_e2 uuid := gen_random_uuid(); v_e3 uuid := gen_random_uuid();
  v_d3 uuid := gen_random_uuid(); v_d4 uuid := gen_random_uuid();
  v_ta uuid; v_tb uuid; v_za uuid; v_zb uuid; v_ca uuid := gen_random_uuid(); v_cb uuid := gen_random_uuid();
  v_vec uuid := gen_random_uuid(); v_vsuc uuid; v_vcaja uuid; v_vturno uuid; v_tvec uuid;
  v_dir1 uuid; v_dir2 uuid := gen_random_uuid(); v_d5 uuid := gen_random_uuid(); v_d6 uuid := gen_random_uuid();
  v_sano uuid := gen_random_uuid(); v_sano2 uuid := gen_random_uuid();
  v_cc uuid; v_d7 uuid := gen_random_uuid(); v_d8 uuid := gen_random_uuid(); v_dir3 uuid := gen_random_uuid();
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

  -- 3b) La redirección del alias alcanza a todo lo que cuelga del cliente dentro del lote.
  v_snap := _vim_fusionar_clientes(jsonb_build_object(
    'tickets',              jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', v_dup)),
    'direcciones_cliente',  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', v_dup)),
    'devoluciones',         jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', v_dup)),
    'ticket_promociones_aplicadas', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', v_dup)),
    'ticket_canjes_lealtad', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', v_dup))), v_t);
  IF (v_snap->'tickets'->0->>'cliente_id')::uuid <> v_real THEN RAISE EXCEPTION '3b: tickets no se redirigió'; END IF;
  IF (v_snap->'direcciones_cliente'->0->>'cliente_id')::uuid <> v_real THEN RAISE EXCEPTION '3b: direcciones_cliente no se redirigió'; END IF;
  IF (v_snap->'devoluciones'->0->>'cliente_id')::uuid <> v_real THEN RAISE EXCEPTION '3b: devoluciones no se redirigió'; END IF;
  IF (v_snap->'ticket_promociones_aplicadas'->0->>'cliente_id')::uuid <> v_real THEN RAISE EXCEPTION '3b: promociones no se redirigió'; END IF;
  IF (v_snap->'ticket_canjes_lealtad'->0->>'cliente_id')::uuid <> v_real THEN RAISE EXCEPTION '3b: canjes no se redirigió'; END IF;
  -- Y un lote sin esas tablas no las inventa vacías.
  v_snap := _vim_fusionar_clientes(jsonb_build_object('lealtad_movimientos', '[]'::jsonb), v_t);
  IF v_snap ? 'tickets' THEN RAISE EXCEPTION '3b: la fusión creó una clave de tickets'; END IF;

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

  -- 12) F1: el código público lo manda la NUBE. Un cliente que ya existe conserva el suyo aunque la
  --     caja (cuyo DEFAULT local le dio otro) mande uno distinto; uno nuevo conserva el que traía.
  SELECT codigo_publico INTO v_codigo FROM clientes WHERE id = v_real;
  SELECT to_jsonb(c) INTO v_base FROM clientes c WHERE id = v_real;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('codigo_publico', repeat('a', 64), 'nombre', 'Ana editada en caja'))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '12: %', v_res->'_errores'; END IF;
  IF (SELECT codigo_publico FROM clientes WHERE id = v_real) <> v_codigo THEN RAISE EXCEPTION '12: la caja le cambió el código público a un cliente de la nube'; END IF;
  IF (SELECT nombre FROM clientes WHERE id = v_real) <> 'Ana editada en caja' THEN RAISE EXCEPTION '12: el resto de la fila no entró'; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_e3, 'nombre', 'Nuevo con código', 'telefono', '4770009950', 'codigo_publico', repeat('b', 64)))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '12: %', v_res->'_errores'; END IF;
  IF (SELECT codigo_publico FROM clientes WHERE id = v_e3) <> repeat('b', 64) THEN RAISE EXCEPTION '12: un cliente nuevo debe conservar el código de la caja'; END IF;

  -- 13) F2: el teléfono se compara por dígitos, en los dos sentidos.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Con espacios', '477 000 9901') RETURNING id INTO v_esp;
  v_base := v_base - 'codigo_publico';
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_e1, 'nombre', 'Sin espacios', 'telefono', '4770009901'))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '13: %', v_res->'_errores'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_e1 AND cliente_id = v_esp) THEN RAISE EXCEPTION '13: "4770009901" no se fundió con "477 000 9901"'; END IF;
  IF EXISTS (SELECT 1 FROM clientes WHERE id = v_e1) THEN RAISE EXCEPTION '13: entró un segundo cliente vivo'; END IF;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Pegado', '4770009902') RETURNING id INTO v_ant;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_e2, 'nombre', 'Con espacios caja', 'telefono', '477 000 9902'))));
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_e2 AND cliente_id = v_ant) THEN RAISE EXCEPTION '13: el caso inverso no se fundió'; END IF;
  -- La búsqueda de lealtad encuentra por dígitos a un cliente guardado con espacios.
  IF lealtad_resolver_cliente(v_t, NULL, '4770009901') IS DISTINCT FROM v_esp THEN RAISE EXCEPTION '13: resolver no encontró al cliente guardado con espacios'; END IF;
  IF lealtad_resolver_cliente(v_t, NULL, '(477) 000-9901') IS DISTINCT FROM v_esp THEN RAISE EXCEPTION '13: resolver no limpia lo que escribe el cajero'; END IF;
  IF (lealtad_saldo(v_t, NULL, '4770009901')->>'cliente_id')::uuid IS DISTINCT FROM v_esp THEN RAISE EXCEPTION '13: lealtad_saldo no encontró al cliente'; END IF;
  -- Con varios vivos de los mismos dígitos (datos anteriores) gana el más antiguo.
  INSERT INTO clientes (tenant_id, nombre, telefono, created_at) VALUES (v_t, 'Nuevo 9903', '4770009903', now()) RETURNING id INTO v_r3;
  INSERT INTO clientes (tenant_id, nombre, telefono, created_at) VALUES (v_t, 'Viejo 9903', '477 000 9903', now() - interval '2 days') RETURNING id INTO v_ant;
  IF lealtad_resolver_cliente(v_t, NULL, '4770009903') <> v_ant THEN RAISE EXCEPTION '13: no eligió al más antiguo'; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_d4, 'nombre', 'Caja 9903', 'telefono', '(477)0009903'))));
  IF (SELECT cliente_id FROM clientes_alias WHERE alias_id = v_d4) IS DISTINCT FROM v_ant THEN RAISE EXCEPTION '13: el alias no apunta al más antiguo'; END IF;
  DELETE FROM clientes_alias WHERE alias_id = v_d4;

  -- 14) F3: un alias no sobrevive a su cliente real. Borrado el real, la fila viva de la caja entra.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 14', '4770009960') RETURNING id INTO v_r3;
  PERFORM sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_d3, 'nombre', 'Caja 14', 'telefono', '4770009960'))));
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_d3 AND cliente_id = v_r3) THEN RAISE EXCEPTION '14: preparación, sin alias'; END IF;
  UPDATE clientes SET deleted_at = now() WHERE id = v_r3;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'clientes', jsonb_build_array(v_base || jsonb_build_object('id', v_d3, 'nombre', 'Caja 14', 'telefono', '4770009960')),
    'lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_d3, 'tipo', 'GANADO', 'puntos', 4,
      'programa_version', v_ver, 'fecha', now()))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '14: %', v_res->'_errores'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_d3 AND deleted_at IS NULL) THEN RAISE EXCEPTION '14: el cliente vivo de la caja no llegó a la nube'; END IF;
  IF EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_d3) THEN RAISE EXCEPTION '14: el alias de un cliente borrado sigue vivo'; END IF;
  IF COALESCE((SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_d3), 0) <> 4 THEN RAISE EXCEPTION '14: los puntos no fueron al cliente vivo'; END IF;
  IF COALESCE((SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_r3), 0) <> 0 THEN RAISE EXCEPTION '14: los puntos fueron al cliente borrado'; END IF;

  -- 15) Lo que la nube YA tenía bajo el id del alias pasa al cliente real cuando el alias nace.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 15', '4770009970') RETURNING id INTO v_r4;
  PERFORM sync_push_snapshot(v_t, jsonb_build_object('tickets', jsonb_build_array(
    (SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('cliente_id', v_d4) FROM tickets t WHERE id = v_ticket))));
  IF (SELECT cliente_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_d4 THEN RAISE EXCEPTION '15: preparación, el ticket no quedó con el id de la caja'; END IF;
  PERFORM sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_d4, 'nombre', 'Caja 15', 'telefono', '4770009970'))));
  IF (SELECT cliente_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_r4 THEN RAISE EXCEPTION '15: el ticket ya guardado no pasó al cliente real'; END IF;

  -- 16) F4: un canje tardío no deja el descuento vivo Y los puntos devueltos.
  v_ta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sl-ta', v_maria);
  v_tb := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sl-tb', v_maria);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Za', '4770009980') RETURNING id INTO v_za;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Zb', '4770009981') RETURNING id INTO v_zb;
  -- (a) la red de 48 h devolvió el canje; después llega la cuenta, pagada, con el canje vivo.
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_za, 'GANADO', 30, v_ver);
  PERFORM lealtad_registrar_movimiento(v_ca, v_t, v_za, 'CANJE', -10, v_ver, v_ta);
  PERFORM lealtad_revertir_canje(v_ca, v_t, lealtad_motivo_red_48h());
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_za) <> 30 THEN RAISE EXCEPTION '16a: preparación, la red no devolvió'; END IF;
  v_snap := jsonb_build_object(
    'tickets', jsonb_build_array((SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('estado_fiscal', 'PAGADO', 'folio_completo', 'SL-A') FROM tickets t WHERE id = v_ta)),
    'ticket_canjes_lealtad', jsonb_build_array(jsonb_build_object(
      'id', v_ca, 'tenant_id', v_t, 'ticket_id', v_ta, 'cliente_id', v_za, 'puntos', 10, 'monto_descontado_mxn', 5,
      'revertido', false, 'created_at', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF v_res ? '_errores' THEN RAISE EXCEPTION '16a: %', v_res->'_errores'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_za) <> 20 THEN RAISE EXCEPTION '16a: el canje confirmado tarde no cobró los puntos (saldo %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_za); END IF;
  IF (SELECT count(*) FROM lealtad_movimientos WHERE cliente_id = v_za AND tipo = 'AJUSTE' AND puntos = -10
        AND motivo = 'Canje confirmado tarde: la cuenta llegó pagada después de la red de 48 horas') <> 1 THEN RAISE EXCEPTION '16a: debía haber exactamente un AJUSTE'; END IF;
  IF (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_ca) THEN RAISE EXCEPTION '16a: el canje usado debe quedar vivo'; END IF;
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_za) <> 20 THEN RAISE EXCEPTION '16a: reenviar cobró dos veces'; END IF;
  IF (SELECT count(*) FROM lealtad_movimientos WHERE cliente_id = v_za AND tipo = 'AJUSTE') <> 1 THEN RAISE EXCEPTION '16a: reenviar duplicó el AJUSTE'; END IF;
  IF (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_ca) THEN RAISE EXCEPTION '16a: reenviar revirtió el canje'; END IF;
  -- (b) la propia caja devolvió el canje; una copia vieja con revertido = false NO lo revive.
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_zb, 'GANADO', 30, v_ver);
  PERFORM lealtad_registrar_movimiento(v_cb, v_t, v_zb, 'CANJE', -10, v_ver, v_tb);
  PERFORM lealtad_revertir_canje(v_cb, v_t, 'cuenta cancelada');
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_zb) <> 30 THEN RAISE EXCEPTION '16b: preparación'; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'tickets', jsonb_build_array((SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('estado_fiscal', 'PAGADO', 'folio_completo', 'SL-B') FROM tickets t WHERE id = v_tb)),
    'ticket_canjes_lealtad', jsonb_build_array(jsonb_build_object(
      'id', v_cb, 'tenant_id', v_t, 'ticket_id', v_tb, 'cliente_id', v_zb, 'puntos', 10, 'monto_descontado_mxn', 5,
      'revertido', false, 'created_at', now()))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '16b: %', v_res->'_errores'; END IF;
  IF NOT (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cb) THEN RAISE EXCEPTION '16b: un canje devuelto revivió'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE cliente_id = v_zb AND tipo = 'AJUSTE') THEN RAISE EXCEPTION '16b: se cobró un canje que la caja había devuelto'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_zb) <> 30 THEN RAISE EXCEPTION '16b: el saldo cambió'; END IF;

  -- 17) F5: las referencias de un movimiento no pueden ser de otro negocio.
  INSERT INTO tenants (id, codigo, nombre_comercial, vertical_principal) VALUES (v_vec, 'smoke-sl-vecino', 'Vecino SL', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_vec, 'VE', 'Sucursal vecina') RETURNING id INTO v_vsuc;
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_vec, v_vsuc, 1, 'Caja vecina') RETURNING id INTO v_vcaja;
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, rol_id) SELECT v_maria, v_vec, id FROM roles WHERE tenant_id IS NULL AND codigo = 'CAJERO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_vec, v_vsuc, v_vcaja, 'VEC-SL', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 0, 'TOTAL') RETURNING id INTO v_vturno;
  v_tvec := abrir_ticket(v_vsuc, v_vcaja, v_vturno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sl-vec', v_maria);
  FOREACH v_fila IN ARRAY ARRAY[
    jsonb_build_object('ticket_id', v_tvec), jsonb_build_object('sucursal_id', v_vsuc), jsonb_build_object('caja_id', v_vcaja)] LOOP
    v_res := sync_push_snapshot(v_t, jsonb_build_object('lealtad_movimientos', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_real, 'tipo', 'GANADO', 'puntos', 50,
        'programa_version', v_ver, 'fecha', now()) || v_fila)));
    IF NOT (v_res ? '_errores') OR (v_res->>'lealtad_movimientos')::int <> 0 THEN RAISE EXCEPTION '17: aceptó una referencia de otro negocio: %', v_fila; END IF;
  END LOOP;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_real) <> 17 THEN RAISE EXCEPTION '17: la referencia ajena movió el saldo'; END IF;
  -- Y lo que ya quedó apuntando a un ticket ajeno no cuenta para ese ticket.
  PERFORM lealtad_registrar_movimiento(NULL, v_t, v_real, 'GANADO', 8, v_ver, v_tvec);
  IF lealtad_neto_ganado(v_tvec) <> 0 THEN RAISE EXCEPTION '17: lealtad_neto_ganado contó un movimiento de otro negocio'; END IF;
  IF lealtad_revertir_ganado_ticket(v_tvec) <> 0 THEN RAISE EXCEPTION '17: la reversa tocó un movimiento de otro negocio'; END IF;

  -- 18) C1: fundir clientes NUNCA aborta el push. El real y el alias tienen cada uno una dirección
  --     principal viva (idx_direcciones_principal_unica); el repunte deja UNA principal y el lote
  --     completo entra, incluido un cliente sano que no tiene nada que ver.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 18', '4770009990') RETURNING id INTO v_r3;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, es_principal)
  VALUES (v_t, v_r3, 'Madero', '1', 'Centro', '37000', 'León', 'Guanajuato', true) RETURNING id INTO v_dir1;
  -- Una subida anterior dejó en la nube una dirección principal bajo el id de la caja (aún sin cliente).
  v_res := sync_push_snapshot(v_t, jsonb_build_object('direcciones_cliente', jsonb_build_array(jsonb_build_object(
    'id', v_dir2, 'tenant_id', v_t, 'cliente_id', v_d5, 'etiqueta', 'Casa', 'calle', 'Hidalgo', 'numero_exterior', '2',
    'colonia', 'Centro', 'codigo_postal', '37000', 'ciudad', 'León', 'estado_geo', 'Guanajuato', 'pais', 'México',
    'es_principal', true, 'activa', true, 'created_at', now(), 'updated_at', now()))));
  IF v_res ? '_errores' OR (v_res->>'direcciones_cliente')::int <> 1 THEN RAISE EXCEPTION '18: preparación, la dirección de la caja no entró: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('clientes', jsonb_build_array(
    v_base || jsonb_build_object('id', v_d5, 'nombre', 'Caja 18', 'telefono', '4770009990'),
    v_base || jsonb_build_object('id', v_sano, 'nombre', 'Sano 18', 'telefono', '4770009991'))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '18: el push dio errores: %', v_res->'_errores'; END IF;
  IF (v_res->>'clientes')::int <> 1 THEN RAISE EXCEPTION '18: el cliente sano no entró: %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_sano AND deleted_at IS NULL) THEN RAISE EXCEPTION '18: el cliente sano no está en la nube'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_d5 AND cliente_id = v_r3) THEN RAISE EXCEPTION '18: no se anotó el alias'; END IF;
  IF (SELECT count(*) FROM direcciones_cliente WHERE id IN (v_dir1, v_dir2) AND cliente_id = v_r3) <> 2 THEN RAISE EXCEPTION '18: las dos direcciones debían ser del cliente real'; END IF;
  IF (SELECT count(*) FROM direcciones_cliente WHERE cliente_id = v_r3 AND es_principal AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION '18: debía quedar exactamente una principal'; END IF;
  IF NOT (SELECT es_principal FROM direcciones_cliente WHERE id = v_dir1) THEN RAISE EXCEPTION '18: la principal del cliente real debía conservarse'; END IF;

  -- 19) El aislamiento mismo: si el repunte falla por lo que sea, el push igual termina, el alias
  --     queda anotado, el lote se redirige y el cliente sano entra; el fallo se reporta.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 19', '4770009992') RETURNING id INTO v_r4;
  PERFORM sync_push_snapshot(v_t, jsonb_build_object('tickets', jsonb_build_array(
    (SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('cliente_id', v_d6) FROM tickets t WHERE id = v_ticket))));
  IF (SELECT cliente_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_d6 THEN RAISE EXCEPTION '19: preparación'; END IF;
  EXECUTE format('ALTER TABLE tickets ADD CONSTRAINT smoke_sl_sin_repunte CHECK (cliente_id IS DISTINCT FROM %L::uuid) NOT VALID', v_r4);
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'clientes', jsonb_build_array(
      v_base || jsonb_build_object('id', v_d6, 'nombre', 'Caja 19', 'telefono', '4770009992'),
      v_base || jsonb_build_object('id', v_sano2, 'nombre', 'Sano 19', 'telefono', '4770009993')),
    'lealtad_movimientos', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_d6, 'tipo', 'GANADO', 'puntos', 6,
      'programa_version', v_ver, 'fecha', now()))));
  ALTER TABLE tickets DROP CONSTRAINT smoke_sl_sin_repunte;
  IF (v_res->>'clientes')::int <> 1 THEN RAISE EXCEPTION '19: el cliente sano no entró: %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_sano2) THEN RAISE EXCEPTION '19: el cliente sano no está'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes_alias WHERE alias_id = v_d6 AND cliente_id = v_r4) THEN RAISE EXCEPTION '19: el alias no quedó anotado'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_r4) <> 6 THEN RAISE EXCEPTION '19: el lote no se redirigió'; END IF;
  IF jsonb_array_length(v_res->'_errores') <> 1 OR v_res->'_errores'->0->>'tabla' <> 'clientes_alias' OR v_res->'_errores'->0->>'id' <> v_d6::text THEN
    RAISE EXCEPTION '19: el fallo del repunte debía reportarse una vez: %', v_res->'_errores';
  END IF;
  IF (SELECT cliente_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_d6 THEN RAISE EXCEPTION '19: el repunte fallido dejó un cambio a medias'; END IF;
  IF current_setting('session_replication_role') = 'replica' THEN RAISE EXCEPTION '19: el modo réplica se filtró'; END IF;
  -- La clave reservada nunca sale: ni como tabla ignorada ni en el resultado.
  IF v_res ? '_ignoradas' OR v_res ? '_fusion_errores' THEN RAISE EXCEPTION '19: la clave reservada se filtró: %', v_res; END IF;
  -- Y una caja no puede colar la clave reservada para llenar _errores.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('_fusion_errores', jsonb_build_array(jsonb_build_object('x', 1))));
  IF v_res ? '_errores' OR v_res ? '_ignoradas' THEN RAISE EXCEPTION '19: la clave reservada de la caja no se descartó: %', v_res; END IF;

  -- 20) N1: la conciliación cubre TODO lo que el aplicador genérico aceptó, aunque venga con un uuid
  --     sin guiones o un booleano que solo Postgres entiende ('fal'): un canje que la caja ya
  --     devolvió no revive. Una fila de verdad mal formada se reporta una sola vez.
  FOR v_n IN 1..3 LOOP
    v_ta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'sl-tn-' || v_n::text, v_maria);
    v_cc := gen_random_uuid();
    INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Zn' || v_n::text, '47700088' || (10 + v_n)::text) RETURNING id INTO v_zb;
    PERFORM lealtad_registrar_movimiento(NULL, v_t, v_zb, 'GANADO', 30, v_ver);
    PERFORM lealtad_registrar_movimiento(v_cc, v_t, v_zb, 'CANJE', -10, v_ver, v_ta);
    PERFORM lealtad_revertir_canje(v_cc, v_t, 'cuenta cancelada');
    v_res := sync_push_snapshot(v_t, jsonb_build_object(
      'tickets', jsonb_build_array((SELECT to_jsonb(t) - 'lealtad_mxn' || jsonb_build_object('estado_fiscal', 'PAGADO', 'folio_completo', 'SL-N' || v_n::text) FROM tickets t WHERE id = v_ta)),
      'ticket_canjes_lealtad', jsonb_build_array(jsonb_build_object(
        'id', CASE v_n WHEN 1 THEN replace(v_cc::text, '-', '') WHEN 2 THEN v_cc::text ELSE '{' || v_cc::text || '}' END,
        'tenant_id', v_t, 'ticket_id', v_ta, 'cliente_id', v_zb, 'puntos', 10, 'monto_descontado_mxn', 5,
        'revertido', CASE v_n WHEN 2 THEN 'fal' WHEN 3 THEN 'false ' ELSE 'false' END, 'created_at', now()))));
    IF v_res ? '_errores' THEN RAISE EXCEPTION '20.%: %', v_n, v_res->'_errores'; END IF;
    IF NOT (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cc) THEN RAISE EXCEPTION '20.%: un canje devuelto revivió', v_n; END IF;
    IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE cliente_id = v_zb AND tipo = 'AJUSTE') THEN RAISE EXCEPTION '20.%: se cobró un canje devuelto por la caja', v_n; END IF;
    IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_zb) <> 30 THEN RAISE EXCEPTION '20.%: el saldo cambió', v_n; END IF;
  END LOOP;
  -- Una fila de verdad mal formada la reporta el aplicador y la conciliación no la repite.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('ticket_canjes_lealtad', jsonb_build_array(jsonb_build_object(
    'id', 'no-es-uuid', 'tenant_id', v_t, 'ticket_id', v_ta, 'cliente_id', v_zb, 'puntos', 10,
    'monto_descontado_mxn', 5, 'revertido', false, 'created_at', now()))));
  IF jsonb_array_length(v_res->'_errores') <> 1 THEN RAISE EXCEPTION '20: la fila mal formada debía reportarse una sola vez: %', v_res->'_errores'; END IF;

  -- 21) N2: el duplicado y su dirección PRINCIPAL en el mismo push, con el real ya con principal: la
  --     dirección entra bajo el cliente real como no principal y sigue habiendo una sola principal.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 21', '4770009994') RETURNING id INTO v_r3;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, es_principal)
  VALUES (v_t, v_r3, 'Madero', '21', 'Centro', '37000', 'León', 'Guanajuato', true) RETURNING id INTO v_dir1;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'clientes', jsonb_build_array(v_base || jsonb_build_object('id', v_d7, 'nombre', 'Caja 21', 'telefono', '4770009994')),
    'direcciones_cliente', jsonb_build_array(
      jsonb_build_object('id', v_dir3, 'tenant_id', v_t, 'cliente_id', v_d7, 'etiqueta', 'Casa', 'calle', 'Hidalgo', 'numero_exterior', '3',
        'colonia', 'Centro', 'codigo_postal', '37000', 'ciudad', 'León', 'estado_geo', 'Guanajuato', 'pais', 'México',
        'es_principal', true, 'activa', true, 'created_at', now(), 'updated_at', now()))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '21: %', v_res->'_errores'; END IF;
  IF (v_res->>'direcciones_cliente')::int <> 1 THEN RAISE EXCEPTION '21: la dirección no entró: %', v_res; END IF;
  IF (SELECT cliente_id FROM direcciones_cliente WHERE id = v_dir3) <> v_r3 THEN RAISE EXCEPTION '21: la dirección no quedó con el cliente real'; END IF;
  IF (SELECT es_principal FROM direcciones_cliente WHERE id = v_dir3) THEN RAISE EXCEPTION '21: la dirección redirigida debía entrar como no principal'; END IF;
  IF (SELECT count(*) FROM direcciones_cliente WHERE cliente_id = v_r3 AND es_principal AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION '21: debía quedar una sola principal'; END IF;
  -- Real SIN principal y dos principales redirigidas del mismo alias: se queda una.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Real 21b', '4770009995') RETURNING id INTO v_r4;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'clientes', jsonb_build_array(v_base || jsonb_build_object('id', v_d8, 'nombre', 'Caja 21b', 'telefono', '4770009995')),
    'direcciones_cliente', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_d8, 'etiqueta', 'Casa', 'calle', 'A', 'numero_exterior', '1',
        'colonia', 'Centro', 'codigo_postal', '37000', 'ciudad', 'León', 'estado_geo', 'Guanajuato', 'pais', 'México',
        'es_principal', true, 'activa', true, 'created_at', now(), 'updated_at', now()),
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'cliente_id', v_d8, 'etiqueta', 'Oficina', 'calle', 'B', 'numero_exterior', '2',
        'colonia', 'Centro', 'codigo_postal', '37000', 'ciudad', 'León', 'estado_geo', 'Guanajuato', 'pais', 'México',
        'es_principal', true, 'activa', true, 'created_at', now(), 'updated_at', now()))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '21b: %', v_res->'_errores'; END IF;
  IF (SELECT count(*) FROM direcciones_cliente WHERE cliente_id = v_r4) <> 2 THEN RAISE EXCEPTION '21b: debían entrar las dos direcciones'; END IF;
  IF (SELECT count(*) FROM direcciones_cliente WHERE cliente_id = v_r4 AND es_principal) <> 1 THEN RAISE EXCEPTION '21b: debía quedar exactamente una principal'; END IF;

  RAISE NOTICE 'SMOKE SYNC LEALTAD OK';
END $$;
ROLLBACK;
