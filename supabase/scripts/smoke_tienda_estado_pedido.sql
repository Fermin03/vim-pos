-- Smoke tienda en línea (mig. 0164): tienda_reportar_estado, con lo que la caja le cuenta a la nube
-- de un pedido de la tienda (listo, entregado, cancelado), y el aviso de vencidos por canal.
-- Los casos 1–8 y 10 son la función sola; el 9 es lo que ve el cliente (tienda_seguimiento) en cada
-- paso; el 11 vence un pedido de la tienda y uno de Uber en la misma pasada.
-- Fixture: pedidos creados a mano, como en smoke_tienda_ticket.sql. Corre como postgres.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_estado_pedido.sql
\set ON_ERROR_STOP on
BEGIN;
-- Un pedido de la tienda en el estado que se pida. Cada uno con su id_externo y su huella.
CREATE SEQUENCE pg_temp.n_pedido;
CREATE FUNCTION pg_temp.h(p_n bigint) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to('estado-pedido-' || p_n, 'UTF8')), 'hex') $$;
CREATE FUNCTION pg_temp.pedido(p_estado text, p_app text DEFAULT 'DRIVE_THRU',
                               p_tenant uuid DEFAULT '99999999-0000-0000-0000-0000000000aa',
                               p_suc uuid DEFAULT '99999999-0000-0000-0000-0000000000bb') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_n bigint := nextval('pg_temp.n_pedido'); v_id uuid;
BEGIN
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, gestion, items, payload_raw,
    total_cliente_mxn, seguimiento_hash, vence_aceptacion)
  VALUES (p_tenant, p_suc, 'TIENDA', p_app::modo_servicio, 'tienda-est-' || v_n, p_estado, 'ESCRITORIO', '[]'::jsonb, '{}'::jsonb,
    150.00, pg_temp.h(v_n), now() + interval '5 minutes')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
-- La fila entera, para afirmar que un reporte que no avanza no la toca.
CREATE FUNCTION pg_temp.fila(p_id uuid) RETURNS jsonb LANGUAGE sql
AS $$ SELECT to_jsonb(p) FROM delivery_pedidos p WHERE p.id = p_id $$;

DO $$
DECLARE
  c_firma  CONSTANT text := 'tienda_reportar_estado(uuid, uuid, text, text)';
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_otro   uuid := '65656565-0000-0000-0000-0000000000ab';
  v_suc_o  uuid;
  v_id uuid; v_app uuid; v_conexion uuid; v_antes jsonb; v_r text; v_s jsonb; v_n int;
  v_hash text;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0164-est', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OE', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_t, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-est') RETURNING id INTO v_conexion;

  -- 1) ACEPTADO → LISTO: devuelve LISTO y sella listo_at (EN_PREPARACION vale igual).
  FOR r IN SELECT * FROM (VALUES ('ACEPTADO'), ('EN_PREPARACION')) AS x(desde) LOOP
    v_id := pg_temp.pedido(r.desde);
    v_r := tienda_reportar_estado(v_t, v_id, 'LISTO');
    IF v_r IS DISTINCT FROM 'LISTO' THEN RAISE EXCEPTION '1 (%): devolvió % (esperaba LISTO)', r.desde, v_r; END IF;
    IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'LISTO' AND listo_at IS NOT NULL
                     AND entregado_at IS NULL AND cancelado_at IS NULL) THEN
      RAISE EXCEPTION '1 (%): no quedó LISTO con listo_at sellado: %', r.desde, pg_temp.fila(v_id);
    END IF;
  END LOOP;

  -- 2) LISTO → ENTREGADO sella entregado_at; después, LISTO devuelve ENTREGADO y no cambia nada.
  v_r := tienda_reportar_estado(v_t, v_id, 'ENTREGADO');
  IF v_r IS DISTINCT FROM 'ENTREGADO' THEN RAISE EXCEPTION '2: devolvió % (esperaba ENTREGADO)', v_r; END IF;
  IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'ENTREGADO' AND entregado_at IS NOT NULL AND listo_at IS NOT NULL) THEN
    RAISE EXCEPTION '2: no quedó ENTREGADO con entregado_at sellado: %', pg_temp.fila(v_id);
  END IF;
  v_antes := pg_temp.fila(v_id);
  FOR r IN SELECT * FROM (VALUES ('LISTO'), ('ENTREGADO'), ('CANCELADO')) AS x(reporte) LOOP
    v_r := tienda_reportar_estado(v_t, v_id, r.reporte, 'AGOTADO');
    IF v_r IS DISTINCT FROM 'ENTREGADO' THEN RAISE EXCEPTION '2: sobre ENTREGADO, % devolvió % (esperaba ENTREGADO)', r.reporte, v_r; END IF;
    IF pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '2: sobre ENTREGADO, % tocó la fila', r.reporte; END IF;
  END LOOP;

  -- 3) ACEPTADO → ENTREGADO directo (cobrado sin imprimir).
  v_id := pg_temp.pedido('ACEPTADO');
  v_r := tienda_reportar_estado(v_t, v_id, 'ENTREGADO');
  IF v_r IS DISTINCT FROM 'ENTREGADO' OR NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'ENTREGADO' AND entregado_at IS NOT NULL) THEN
    RAISE EXCEPTION '3: ACEPTADO → ENTREGADO directo: devolvió %, fila %', v_r, pg_temp.fila(v_id);
  END IF;

  -- 4) RECIBIDO → LISTO o ENTREGADO: nada (un pedido sin aceptar no puede estar listo ni entregado).
  --    Y LISTO → LISTO: el mismo estado tampoco vuelve a sellar.
  FOR r IN SELECT * FROM (VALUES ('RECIBIDO', 'LISTO'), ('RECIBIDO', 'ENTREGADO'), ('LISTO', 'LISTO'), ('ERROR', 'LISTO'), ('ERROR', 'CANCELADO')) AS x(desde, reporte) LOOP
    v_id := pg_temp.pedido(r.desde);
    v_antes := pg_temp.fila(v_id);
    v_r := tienda_reportar_estado(v_t, v_id, r.reporte);
    IF v_r IS DISTINCT FROM r.desde THEN RAISE EXCEPTION '4: % sobre % devolvió % (esperaba %)', r.reporte, r.desde, v_r, r.desde; END IF;
    IF pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '4: % sobre % tocó la fila', r.reporte, r.desde; END IF;
  END LOOP;

  -- 5) CANCELADO desde cualquier estado vivo. El motivo es de lista cerrada: lo demás se guarda OTRO.
  FOR r IN SELECT * FROM (VALUES
    ('RECIBIDO',       'AGOTADO',                 'AGOTADO'),
    ('ACEPTADO',       'texto libre 4771112233',  'OTRO'),
    ('EN_PREPARACION', 'SATURADO',                'SATURADO'),
    ('LISTO',          'CERRADO',                 'CERRADO'),
    ('ACEPTADO',       'OTRO',                    'OTRO'),
    ('ACEPTADO',       NULL,                      'OTRO'),
    ('ACEPTADO',       '',                        'OTRO'),
    ('ACEPTADO',       'agotado',                 'OTRO'),
    ('ACEPTADO',       'AGOTADO: llamó el dueño', 'OTRO'),
    ('LISTO',          'POS_OFFLINE',             'OTRO')
  ) AS x(desde, motivo, guardado) LOOP
    v_id := pg_temp.pedido(r.desde);
    v_r := tienda_reportar_estado(v_t, v_id, 'CANCELADO', r.motivo);
    IF v_r IS DISTINCT FROM 'CANCELADO' THEN RAISE EXCEPTION '5 (% / %): devolvió %', r.desde, r.motivo, v_r; END IF;
    IF NOT EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_id AND estado = 'CANCELADO' AND cancelado_at IS NOT NULL
                     AND cancelado_por = 'RESTAURANTE' AND motivo_cancelacion = r.guardado) THEN
      RAISE EXCEPTION '5 (% / %): esperaba CANCELADO por RESTAURANTE con motivo %: %', r.desde, r.motivo, r.guardado, pg_temp.fila(v_id);
    END IF;
  END LOOP;

  -- 6) Sobre un final (CANCELADO, RECHAZADO, EXPIRADO), cualquier reporte devuelve ese estado y no toca la fila.
  FOR r IN SELECT * FROM (VALUES ('CANCELADO'), ('RECHAZADO'), ('EXPIRADO')) AS f(final),
                         (VALUES ('LISTO'), ('ENTREGADO'), ('CANCELADO')) AS x(reporte) LOOP
    v_id := pg_temp.pedido(r.final);
    UPDATE delivery_pedidos SET motivo_cancelacion = 'CERRADO', cancelado_por = 'APP' WHERE id = v_id;
    v_antes := pg_temp.fila(v_id);
    v_r := tienda_reportar_estado(v_t, v_id, r.reporte, 'AGOTADO');
    IF v_r IS DISTINCT FROM r.final THEN RAISE EXCEPTION '6: % sobre % devolvió %', r.reporte, r.final, v_r; END IF;
    IF pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '6: % sobre % tocó la fila', r.reporte, r.final; END IF;
  END LOOP;

  -- 7) Un estado que la caja no puede reportar → ESTADO_INVALIDO, y el pedido intacto.
  v_id := pg_temp.pedido('ACEPTADO');
  v_antes := pg_temp.fila(v_id);
  FOR r IN SELECT * FROM (VALUES ('RECIBIDO'), ('LO QUE SEA'), (NULL), ('ACEPTADO'), ('RECHAZADO'), ('EXPIRADO'), ('listo'), ('')) AS x(reporte) LOOP
    BEGIN
      PERFORM tienda_reportar_estado(v_t, v_id, r.reporte);
      RAISE EXCEPTION '7: aceptó el estado «%»', COALESCE(r.reporte, 'NULL');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ESTADO_INVALIDO%' THEN RAISE; END IF;
    END;
  END LOOP;
  IF pg_temp.fila(v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION '7: un estado inválido tocó la fila'; END IF;

  -- 8) Pedido de otro negocio, de canal APP, o inexistente → PEDIDO_NO_EXISTE, y ninguno cambia.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
  VALUES (v_t, v_suc, v_conexion, 'APP_UBEREATS', 'uber-est-1', 'ACEPTADO', '[]'::jsonb, '{}'::jsonb, 0)
  RETURNING id INTO v_app;
  v_id := pg_temp.pedido('ACEPTADO', 'DRIVE_THRU', v_otro, v_suc_o);
  FOR r IN SELECT * FROM (VALUES
    ('de otro negocio', v_t,    v_id),
    ('de canal APP',    v_t,    v_app),
    ('inexistente',     v_t,    gen_random_uuid()),
    ('sin pedido',      v_t,    NULL::uuid),
    ('sin negocio',     NULL::uuid, v_id)
  ) AS x(caso, tenant, pedido) LOOP
    BEGIN
      PERFORM tienda_reportar_estado(r.tenant, r.pedido, 'LISTO');
      RAISE EXCEPTION '8: reportó un pedido %', r.caso;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%PEDIDO_NO_EXISTE%' THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'ACEPTADO' OR (SELECT estado FROM delivery_pedidos WHERE id = v_app) <> 'ACEPTADO' THEN
    RAISE EXCEPTION '8: un reporte ajeno cambió un pedido';
  END IF;
  -- Control positivo: con SU negocio, ese pedido sí se reporta.
  IF tienda_reportar_estado(v_otro, v_id, 'LISTO') IS DISTINCT FROM 'LISTO' THEN RAISE EXCEPTION '8: el pedido ajeno debía reportarse con su propio negocio'; END IF;

  -- 9) Lo que ve el cliente de un pedido ESCRITORIO, paso a paso.
  FOR r IN SELECT * FROM (VALUES ('DRIVE_THRU', 'LISTO_PARA_RECOGER'), ('DELIVERY_PROPIO', 'EN_CAMINO')) AS x(app, listo) LOOP
    v_id := pg_temp.pedido('ACEPTADO', r.app);
    SELECT seguimiento_hash INTO v_hash FROM delivery_pedidos WHERE id = v_id;
    v_s := tienda_seguimiento(v_t, v_hash);
    IF v_s ->> 'estado' IS DISTINCT FROM 'EN_PREPARACION' THEN RAISE EXCEPTION '9 (%): aceptado: esperaba EN_PREPARACION, dio %', r.app, v_s; END IF;
    PERFORM tienda_reportar_estado(v_t, v_id, 'LISTO');
    v_s := tienda_seguimiento(v_t, v_hash);
    IF v_s ->> 'estado' IS DISTINCT FROM r.listo THEN RAISE EXCEPTION '9 (%): listo: esperaba %, dio %', r.app, r.listo, v_s; END IF;
    PERFORM tienda_reportar_estado(v_t, v_id, 'ENTREGADO');
    v_s := tienda_seguimiento(v_t, v_hash);
    IF v_s ->> 'estado' IS DISTINCT FROM 'ENTREGADO' OR v_s ->> 'motivo' IS NOT NULL THEN RAISE EXCEPTION '9 (%): entregado: dio %', r.app, v_s; END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES ('AGOTADO', 'AGOTADO'), ('texto libre 4771112233', 'OTRO')) AS x(motivo, visto) LOOP
    v_id := pg_temp.pedido('ACEPTADO', 'DELIVERY_PROPIO');
    SELECT seguimiento_hash INTO v_hash FROM delivery_pedidos WHERE id = v_id;
    PERFORM tienda_reportar_estado(v_t, v_id, 'CANCELADO', r.motivo);
    v_s := tienda_seguimiento(v_t, v_hash);
    IF v_s ->> 'estado' IS DISTINCT FROM 'CANCELADO' OR v_s ->> 'motivo' IS DISTINCT FROM r.visto THEN
      RAISE EXCEPTION '9: cancelado con «%»: esperaba CANCELADO y motivo %, dio %', r.motivo, r.visto, v_s;
    END IF;
    IF v_s::text LIKE '%4771112233%' OR pg_temp.fila(v_id)::text LIKE '%4771112233%' THEN RAISE EXCEPTION '9: el texto libre del cajero quedó guardado o a la vista'; END IF;
  END LOOP;

  -- 10) Solo service_role.
  IF NOT has_function_privilege('service_role', c_firma, 'EXECUTE') THEN RAISE EXCEPTION '10: service_role debe poder ejecutar tienda_reportar_estado'; END IF;
  IF has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('authenticated', c_firma, 'EXECUTE') THEN
    RAISE EXCEPTION '10: anon o authenticated pueden ejecutar tienda_reportar_estado';
  END IF;

  -- 11) Vencen en la misma pasada un pedido de la tienda y uno de Uber de la misma sucursal.
  v_id := pg_temp.pedido('RECIBIDO');
  UPDATE delivery_pedidos SET vence_aceptacion = now() - interval '1 minute' WHERE id = v_id;
  UPDATE delivery_pedidos SET estado = 'RECIBIDO', vence_aceptacion = now() - interval '1 minute' WHERE id = v_app;
  v_n := delivery_marcar_expirados();   -- sin pg_net ni Vault (la caja, este smoke) no debe fallar
  IF v_n < 2 THEN RAISE EXCEPTION '11: marcó % (esperaba al menos los 2 de aquí)', v_n; END IF;
  SELECT count(*) INTO v_n FROM delivery_pedidos
   WHERE id IN (v_id, v_app) AND estado = 'EXPIRADO' AND cancelado_at IS NOT NULL AND motivo_cancelacion = 'Venció la ventana de aceptación';
  IF v_n <> 2 THEN RAISE EXCEPTION '11: quedaron EXPIRADO % de 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM delivery_eventos
   WHERE tenant_id = v_t AND tipo = 'expirado' AND id_externo IN ('uber-est-1', (SELECT id_externo FROM delivery_pedidos WHERE id = v_id));
  IF v_n <> 2 THEN RAISE EXCEPTION '11: % eventos de expiración (esperaba 2: el de la tienda no tiene conexión)', v_n; END IF;
  IF (SELECT ultimo_error FROM delivery_conexiones WHERE id = v_conexion) IS DISTINCT FROM 'Pedidos expirados sin aceptar: revisar la caja' THEN
    RAISE EXCEPTION '11: la conexión de Uber no quedó avisada';
  END IF;
  -- Los pedidos vigentes y los ya aceptados no se tocaron: de todos los de este smoke, el único que
  -- lleva el motivo que escribe el marcado es el que venció aquí (los EXPIRADO del caso 6 nacieron
  -- así, con otro motivo).
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE id_externo LIKE 'tienda-est-%' AND id <> v_id
                AND motivo_cancelacion = 'Venció la ventana de aceptación') THEN
    RAISE EXCEPTION '11: venció un pedido que no tocaba';
  END IF;
  -- El aviso, por canal: firma nueva, la de tres argumentos ya no existe, y sin pg_net/Vault no falla.
  IF to_regprocedure('delivery_avisar_expirados(uuid, uuid, integer)') IS NOT NULL THEN RAISE EXCEPTION '11: sigue viva la firma vieja de delivery_avisar_expirados'; END IF;
  PERFORM delivery_avisar_expirados(v_t, v_suc, 1, 'TIENDA');
  PERFORM delivery_avisar_expirados(v_t, v_suc, 2, 'APP');
  IF NOT has_function_privilege('service_role', 'delivery_avisar_expirados(uuid, uuid, integer, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'delivery_avisar_expirados(uuid, uuid, integer, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'delivery_avisar_expirados(uuid, uuid, integer, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'delivery_marcar_expirados()', 'EXECUTE') THEN
    RAISE EXCEPTION '11: permisos del aviso de vencidos';
  END IF;

  RAISE NOTICE 'smoke_tienda_estado_pedido OK';
END $$;
ROLLBACK;
