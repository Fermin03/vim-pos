-- Smoke del viaje de reparto (spec 2026-09-20-asignacion-repartidores-design.md, migración 0114).
-- Asignar ES salir: `asignar_delivery_lote` deja los pedidos EN_RUTA de una vez, comparten viaje_id
-- y el monto lo calcula el servidor. Prueba también que el lote es atómico y que `repartidores`
-- sube por el push. Sobre la semilla de dev. ROLLBACK.
--
-- El aislamiento por tenant se prueba en el caso 9, y lo que prueba es EL PREDICADO EXPLÍCITO
-- `tenant_id = current_tenant_id()` de la RPC, no el RLS: estos smokes corren como `postgres` y se
-- saltan las políticas (ver la cabecera de desktop/scripts/smokes.mjs). Si el predicado no
-- estuviera, la fila del otro negocio entraría sin que nada la parara, y el caso se pondría rojo.
--
-- (Esta cabecera decía que el aislamiento "NO se prueba aquí" y a la vez que sí; los ocho casos
-- originales corrían todos bajo un solo tenant. El caso 9 es el que faltaba.)
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_rep uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_pick uuid;
  v_viaje uuid; v_n integer; v_estado text; v_monto numeric; v_total numeric;
  v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-VIAJE',
          (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  INSERT INTO repartidores(tenant_id, nombre, telefono)
  VALUES (v_tenant, 'Luis Smoke', '4771234567') RETURNING id INTO v_rep;

  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-1', v_maria);
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-2', v_maria);
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-3', v_maria);
  v_pick := abrir_ticket(v_suc, v_caja, v_turno, 'DRIVE_THRU'::modo_servicio, NULL, NULL, 'smk-v-p', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-i1');
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 2, NULL, '[]'::jsonb, 'smk-v-i2');
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-i3');
  PERFORM agregar_item_a_ticket(v_pick, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ip');

  -- ── 1. Tres pedidos, un viaje ──────────────────────────────────────────────
  v_viaje := asignar_delivery_lote(ARRAY[v_t1, v_t2, v_t3], v_rep, 30);
  IF v_viaje IS NULL THEN RAISE EXCEPTION 'asignar_delivery_lote no devolvió viaje_id'; END IF;

  SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE viaje_id = v_viaje;
  IF v_n <> 3 THEN RAISE EXCEPTION 'esperaba 3 asignaciones con el mismo viaje_id, hay %', v_n; END IF;
  RAISE NOTICE '1. tres pedidos comparten viaje_id OK';

  -- ── 2. Asignar ES salir: quedan EN_RUTA con fecha_salida ───────────────────
  SELECT count(*) INTO v_n FROM delivery_asignaciones
   WHERE viaje_id = v_viaje AND estado = 'EN_RUTA' AND fecha_salida IS NOT NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'las 3 debían quedar EN_RUTA con fecha_salida, quedaron %', v_n; END IF;
  RAISE NOTICE '2. asignar es salir (EN_RUTA + fecha_salida) OK';

  -- ── 3. El monto lo calcula el servidor, no el cliente ──────────────────────
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t2;
  SELECT monto_a_liquidar_mxn INTO v_monto FROM delivery_asignaciones WHERE ticket_id = v_t2;
  IF v_monto IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'monto_a_liquidar_mxn (%) debía salir de tickets.total_mxn (%)', v_monto, v_total;
  END IF;
  RAISE NOTICE '3. el monto sale de tickets.total_mxn OK';

  -- ── 4. Atomicidad: un Pick-up en el lote tumba el lote entero ──────────────
  -- Se prueba con tickets NUEVOS para que el fallo no se confunda con los ya asignados.
  DECLARE v_a uuid; v_b uuid;
  BEGIN
    v_a := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-a', v_maria);
    v_b := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-b', v_maria);
    PERFORM agregar_item_a_ticket(v_a, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ia');
    PERFORM agregar_item_a_ticket(v_b, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ib');
    v_ok := false;
    BEGIN
      PERFORM asignar_delivery_lote(ARRAY[v_a, v_b, v_pick], v_rep, 30);
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'un ticket de Pick-up en el lote debía hacerlo fallar'; END IF;
    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id IN (v_a, v_b);
    IF v_n <> 0 THEN RAISE EXCEPTION 'el lote no fue atómico: quedaron % asignaciones de los dos primeros', v_n; END IF;
    RAISE NOTICE '4. atomicidad OK: falla el tercero y no queda ninguna';

    -- ── 5. Un ticket inexistente tampoco deja rastro ─────────────────────────
    v_ok := false;
    BEGIN
      PERFORM asignar_delivery_lote(ARRAY[v_a, gen_random_uuid()], v_rep, 30);
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'un ticket inexistente debía hacer fallar el lote'; END IF;
    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id = v_a;
    IF v_n <> 0 THEN RAISE EXCEPTION 'un ticket inexistente dejó asignación del otro'; END IF;
    RAISE NOTICE '5. ticket inexistente OK: excepción y sin rastro';
  END;

  -- ── 6. Idempotencia: reasignar actualiza, no duplica ───────────────────────
  PERFORM asignar_delivery_lote(ARRAY[v_t1], v_rep, 45);
  SELECT count(*) INTO v_n FROM delivery_asignaciones
   WHERE ticket_id = v_t1 AND estado NOT IN ('LIQUIDADO','CANCELADO');
  IF v_n <> 1 THEN RAISE EXCEPTION 'reasignar duplicó: % asignaciones vivas del mismo ticket', v_n; END IF;
  RAISE NOTICE '6. idempotencia OK: una sola asignación viva por ticket';

  -- ── 7. Repartidor dado de baja ─────────────────────────────────────────────
  UPDATE repartidores SET activo = false WHERE id = v_rep;
  v_ok := false;
  BEGIN
    PERFORM asignar_delivery_lote(ARRAY[v_t2], v_rep, 30);
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'un repartidor inactivo no debe poder recibir pedidos'; END IF;
  UPDATE repartidores SET activo = true WHERE id = v_rep;
  RAISE NOTICE '7. repartidor inactivo rechazado OK';

  -- ── 8. El catálogo sube por el push ────────────────────────────────────────
  -- Es lo que hace que un repartidor dado de alta en la caja llegue al panel.
  DECLARE v_res jsonb; v_nuevo uuid := gen_random_uuid();
  BEGIN
    v_res := sync_push_snapshot(v_tenant, jsonb_build_object(
      'repartidores', jsonb_build_array(jsonb_build_object(
        'id', v_nuevo, 'tenant_id', v_tenant, 'nombre', 'Alta Desde La Caja',
        'telefono', NULL, 'notas', NULL, 'activo', true,
        'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));
    IF COALESCE((v_res->>'repartidores')::integer, 0) <> 1 THEN
      RAISE EXCEPTION 'sync_push_snapshot no aplicó el repartidor: %', v_res;
    END IF;
    IF v_res ? '_ignoradas' THEN
      RAISE EXCEPTION 'sync_push_snapshot ignoró la tabla repartidores: %', v_res->'_ignoradas';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM repartidores WHERE id = v_nuevo) THEN
      RAISE EXCEPTION 'el repartidor del push no quedó en la tabla';
    END IF;
    RAISE NOTICE '8. repartidores sube por el push OK';
  END;

  -- ── 9. Otro negocio: ni se asigna ni queda rastro ──────────────────────────
  -- Es el caso que hace verdadera la cabecera. Los claims siguen siendo los del tenant de arriba
  -- (A); el pedido es de un negocio ajeno (B). Como el smoke corre como `postgres` y se salta RLS,
  -- lo único que puede rechazarlo es el `tenant_id = v_tenant` del bucle de `asignar_delivery_lote`.
  --
  -- El fixture de B es el mínimo que deja abrir un ticket: negocio, sucursal, caja y turno. No
  -- lleva productos ni renglones porque la RPC se cae en la búsqueda del ticket, antes de mirar el
  -- total. Se crea aquí dentro, en la misma transacción que termina en ROLLBACK.
  DECLARE
    v_ajeno  uuid := '99999999-0000-0000-0000-0000000000ff';
    v_suc_b  uuid; v_caja_b uuid; v_turno_b uuid; v_tb uuid; v_rep_b uuid;
    v_msg    text;
  BEGIN
    INSERT INTO tenants(id, codigo, nombre_comercial, vertical_principal)
    VALUES (v_ajeno, 'smoke-ajeno-viaje', 'Ajeno', 'QUICK_SERVICE') ON CONFLICT (id) DO NOTHING;
    INSERT INTO sucursales(tenant_id, codigo, nombre)
    VALUES (v_ajeno, 'AJ', 'Sucursal ajena') RETURNING id INTO v_suc_b;
    INSERT INTO cajas(tenant_id, sucursal_id, numero, nombre)
    VALUES (v_ajeno, v_suc_b, 1, 'Caja ajena') RETURNING id INTO v_caja_b;
    INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                       usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    VALUES (v_ajeno, v_suc_b, v_caja_b, 'SMOKE-AJENO',
            (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 0, 'TOTAL')
    RETURNING id INTO v_turno_b;

    v_tb := abrir_ticket(v_suc_b, v_caja_b, v_turno_b, 'DELIVERY_PROPIO'::modo_servicio,
                         NULL, NULL, 'smk-v-ajeno', v_maria);

    v_ok := false;
    BEGIN
      PERFORM asignar_delivery_lote(ARRAY[v_tb], v_rep, 30);
    EXCEPTION WHEN OTHERS THEN
      v_ok := true; v_msg := SQLERRM;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'un pedido de OTRO negocio no debe poderse asignar: el predicado por tenant no está';
    END IF;
    -- El ticket EXISTE (se acaba de crear): que la RPC diga "no existe" es exactamente el
    -- `tenant_id = v_tenant` haciendo su trabajo, y no otro fallo cualquiera que también habría
    -- lanzado. Sin esta comprobación el caso pasaría en verde por el motivo equivocado.
    IF v_msg IS NULL OR position('no existe' in v_msg) = 0 THEN
      RAISE EXCEPTION 'esperaba que el pedido ajeno se rechazara por no pertenecer al tenant, y falló por otra cosa: %', v_msg;
    END IF;

    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id = v_tb;
    IF v_n <> 0 THEN RAISE EXCEPTION 'quedó % asignación(es) sobre el pedido ajeno', v_n; END IF;
    -- Y al revés: el repartidor de A no acabó apuntando a nada del otro negocio.
    SELECT count(*) INTO v_n FROM delivery_asignaciones
     WHERE repartidor_catalogo_id = v_rep AND tenant_id = v_ajeno;
    IF v_n <> 0 THEN RAISE EXCEPTION 'el repartidor de un negocio quedó asignado en otro'; END IF;

    -- CONTROL. El mismo pedido, con los claims de SU negocio, sí se asigna. Sin esto el caso de
    -- arriba podría estar en verde porque el fixture está mal armado (un ticket que nadie podría
    -- asignar nunca), y no porque el aislamiento funcione.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_maria::text, 'tenant_id', v_ajeno::text)::text, true);
    INSERT INTO repartidores(tenant_id, nombre) VALUES (v_ajeno, 'Repartidor Ajeno') RETURNING id INTO v_rep_b;
    PERFORM asignar_delivery_lote(ARRAY[v_tb], v_rep_b, 30);
    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id = v_tb;
    IF v_n <> 1 THEN RAISE EXCEPTION 'el control falló: el pedido ajeno no se asignó ni con sus propios claims (% filas)', v_n; END IF;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

    RAISE NOTICE '9. aislamiento por tenant OK: excepción, sin rastro, y con sus claims sí pasa';
  END;

  RAISE NOTICE 'SMOKE DELIVERY VIAJE OK';
END $$;
ROLLBACK;
