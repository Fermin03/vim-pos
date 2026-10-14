-- Smoke correos de estado de la tienda (mig. 0176): qué cambio de estado deja un correo en la cola,
-- cuál no (Uber, sin correo, el pedido en línea que nunca se pagó, «entregado»), que nunca se
-- repite, los plazos, el tope por hora, los reintentos y el que se rinde, el enlace cifrado, la
-- limpieza y los permisos. Aquí no hay SMTP: se prueba lo que la base decide.
--
-- LA CAJA INSTALADA. Este smoke corre en dos motores: el Postgres de la caja (`npm run smokes`, sin
-- pg_cron) y el Supabase local del CI (con pg_cron). En el primero el bloque 0 demuestra que ahí la
-- cola NO se llena, y después crea el esquema `cron` (dentro de la transacción, que se deshace)
-- para probar lo demás como en la nube. En el CI el bloque 0 se salta: el esquema ya existe.
-- Fixture: pedidos y pagos creados a mano, como smoke_tienda_estado_pedido.sql. Corre como postgres.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_correos_de_estado.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE SEQUENCE pg_temp.n_pedido;
CREATE FUNCTION pg_temp.h(p_n bigint) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to('correo-estado-' || p_n, 'UTF8')), 'hex') $$;
-- Un pedido de la tienda en el estado que se pida, con correo salvo que se diga.
CREATE FUNCTION pg_temp.pedido(p_estado text, p_pago text DEFAULT 'EFECTIVO', p_pagado boolean DEFAULT false,
                               p_email text DEFAULT 'ana.correos@example.com', p_app text DEFAULT 'DRIVE_THRU') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_n bigint := nextval('pg_temp.n_pedido'); v_id uuid;
BEGIN
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, gestion, items, payload_raw,
    total_cliente_mxn, seguimiento_hash, vence_aceptacion, cliente_nombre, cliente_email, pago_al_recibir, pagado_at)
  VALUES ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', 'TIENDA', p_app::modo_servicio,
    'tienda-correo-' || v_n, 'T' || v_n, p_estado, 'ESCRITORIO', '[]'::jsonb, '{}'::jsonb,
    150.00, pg_temp.h(v_n), now() + interval '5 minutes', 'Ana Correos', p_email, p_pago, CASE WHEN p_pagado THEN now() END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.mover(p_id uuid, p_estado text) RETURNS void LANGUAGE sql
AS $$ UPDATE delivery_pedidos SET estado = p_estado WHERE id = p_id $$;
-- Los correos de un pedido, en orden: «EN_PREPARACION:PENDIENTE,LISTO:PENDIENTE».
CREATE FUNCTION pg_temp.cola(p_id uuid) RETURNS text LANGUAGE sql
AS $$ SELECT COALESCE(string_agg(c.tipo || ':' || c.estado, ',' ORDER BY c.id), '') FROM tienda_correos c WHERE c.pedido_id = p_id $$;

DO $$
DECLARE
  v_t    uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_otro uuid := '76767676-0000-0000-0000-0000000000aa';
  c_cif  CONSTANT text := repeat('Ab3_-', 13);            -- 65 caracteres con la forma de un cifrado
  v_id uuid; v_id2 uuid; v_id3 uuid; v_cx uuid; v_conexion uuid; v_pago uuid; v_c bigint;
  v_n integer; v_txt text; v_antes jsonb;
  r record; t record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'correos-smoke');
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key) VALUES (v_t, '760', 'APP_USR-smoke-correos-00000001') RETURNING id INTO v_cx;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0176', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');

  -- ── 0) En la caja instalada la cola no se llena ─────────────────────────────────────────────
  IF to_regnamespace('cron') IS NULL THEN
    v_id := pg_temp.pedido('RECIBIDO', 'EN_LINEA', true);
    INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, vence_at, aprobado_at)
    VALUES (v_t, v_id, v_cx, 150.00, 'APROBADO', now(), now()) RETURNING id INTO v_pago;
    PERFORM pg_temp.mover(v_id, 'ACEPTADO');
    PERFORM pg_temp.mover(v_id, 'EN_PREPARACION');
    PERFORM pg_temp.mover(v_id, 'LISTO');
    PERFORM pg_temp.mover(v_id, 'CANCELADO');
    IF (SELECT estado FROM tienda_pagos WHERE id = v_pago) <> 'POR_DEVOLVER' THEN RAISE EXCEPTION '0: el fixture no dejó el pago por devolver'; END IF;
    PERFORM tienda_pago_devolucion(v_pago, true);
    IF (SELECT count(*) FROM tienda_correos) <> 0 THEN
      RAISE EXCEPTION '0: sin pg_cron (la caja instalada) la cola debía quedar vacía y tiene: %', (SELECT string_agg(tipo, ',') FROM tienda_correos);
    END IF;
    IF tienda_correos_barrer() <> 0 OR EXISTS (SELECT 1 FROM tienda_eventos WHERE accion = 'correos:sin_configurar') THEN
      RAISE EXCEPTION '0: en la caja el barrido no tiene nada que hacer ni que avisar';
    END IF;
    DELETE FROM delivery_pedidos WHERE id = v_id;
    EXECUTE 'CREATE SCHEMA cron';   -- de aquí en adelante, como en la nube (se deshace con la transacción)
  ELSE
    RAISE NOTICE '0: aquí hay pg_cron; la prueba de la caja instalada corre con `npm run smokes` en desktop/';
  END IF;

  -- ── A) Qué cambio de estado deja qué correo ─────────────────────────────────────────────────
  -- A1) Aceptado: «en preparación». ACEPTADO → EN_PREPARACION es el mismo paso para el cliente: no repite.
  v_id := pg_temp.pedido('RECIBIDO');
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A1: un pedido recién recibido no manda correo de estado: %', pg_temp.cola(v_id); END IF;
  PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE' THEN RAISE EXCEPTION 'A1: al aceptar debía quedar «en preparación»: %', pg_temp.cola(v_id); END IF;
  PERFORM pg_temp.mover(v_id, 'EN_PREPARACION');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE' THEN RAISE EXCEPTION 'A1: ACEPTADO → EN_PREPARACION repitió o añadió: %', pg_temp.cola(v_id); END IF;
  -- A2) Listo. Volver atrás por una corrección y marcarlo listo otra vez no repite.
  PERFORM pg_temp.mover(v_id, 'LISTO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE,LISTO:PENDIENTE' THEN RAISE EXCEPTION 'A2: al quedar listo: %', pg_temp.cola(v_id); END IF;
  PERFORM pg_temp.mover(v_id, 'EN_PREPARACION');
  PERFORM pg_temp.mover(v_id, 'LISTO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE,LISTO:PENDIENTE' THEN RAISE EXCEPTION 'A2: volver atrás y repetir «listo» repitió el correo: %', pg_temp.cola(v_id); END IF;
  -- …ni aunque el primero ya hubiera salido.
  UPDATE tienda_correos SET estado = 'ENVIADO', enviado_at = now() WHERE pedido_id = v_id AND tipo = 'LISTO';
  PERFORM pg_temp.mover(v_id, 'EN_PREPARACION');
  PERFORM pg_temp.mover(v_id, 'LISTO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE,LISTO:ENVIADO' THEN RAISE EXCEPTION 'A2: repitió un correo ya enviado: %', pg_temp.cola(v_id); END IF;
  -- A3) Entregado: NO hay correo.
  PERFORM pg_temp.mover(v_id, 'ENTREGADO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE,LISTO:ENVIADO' THEN RAISE EXCEPTION 'A3: «entregado» dejó un correo: %', pg_temp.cola(v_id); END IF;
  -- A4) Estado saltado: de «en preparación» a entregado sin pasar por «listo» no manda el de «listo».
  v_id := pg_temp.pedido('ACEPTADO');
  PERFORM tienda_reportar_estado(v_t, v_id, 'EN_PREPARACION');
  PERFORM tienda_reportar_estado(v_t, v_id, 'ENTREGADO');
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE' THEN RAISE EXCEPTION 'A4: el estado saltado mandó correo: %', pg_temp.cola(v_id); END IF;
  -- A5) Cancelado, por cada camino: lo rechazan, vence sin aceptar, lo cancela la caja, lo caduca el barrido.
  FOR r IN SELECT * FROM (VALUES ('RECIBIDO', 'RECHAZADO'), ('RECIBIDO', 'EXPIRADO'), ('ACEPTADO', 'CANCELADO'),
                                 ('LISTO', 'CANCELADO'), ('ERROR', 'RECHAZADO')) AS x(desde, hasta) LOOP
    v_id := pg_temp.pedido(r.desde);
    PERFORM pg_temp.mover(v_id, r.hasta);
    IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' THEN RAISE EXCEPTION 'A5: % → % debía dejar «cancelado»: %', r.desde, r.hasta, pg_temp.cola(v_id); END IF;
  END LOOP;
  v_id := pg_temp.pedido('RECIBIDO');
  IF tienda_reportar_estado(v_t, v_id, 'CANCELADO', 'AGOTADO') <> 'CANCELADO' OR pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' THEN
    RAISE EXCEPTION 'A5: la caja reporta cancelado: %', pg_temp.cola(v_id);
  END IF;
  v_id := pg_temp.pedido('RECIBIDO');
  UPDATE delivery_pedidos SET vence_aceptacion = now() - interval '1 minute' WHERE id = v_id;
  PERFORM delivery_marcar_expirados();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'EXPIRADO' OR pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' THEN
    RAISE EXCEPTION 'A5: vencer sin aceptar (el cron) debía dejar «cancelado»: %', pg_temp.cola(v_id);
  END IF;
  -- A6) El pedido en línea que NUNCA se pagó no avisa: sin pago, verificación abandonada, tarjeta rechazada.
  FOR r IN SELECT * FROM (VALUES ('EXPIRADO'), ('RECHAZADO'), ('CANCELADO')) AS x(hasta) LOOP
    v_id := pg_temp.pedido('POR_PAGAR', 'EN_LINEA', false);
    PERFORM pg_temp.mover(v_id, r.hasta);
    IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A6: un pedido en línea sin pagar que acaba % mandó correo: %', r.hasta, pg_temp.cola(v_id); END IF;
  END LOOP;
  --     Pagarse (POR_PAGAR → RECIBIDO) tampoco: eso ya lo dice el correo de confirmación.
  v_id := pg_temp.pedido('POR_PAGAR', 'EN_LINEA', false);
  UPDATE delivery_pedidos SET estado = 'RECIBIDO', pagado_at = now() WHERE id = v_id;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A6: pagarse dejó un correo de estado: %', pg_temp.cola(v_id); END IF;
  --     Ya pagado, sí avisa de su cancelación.
  PERFORM pg_temp.mover(v_id, 'RECHAZADO');
  IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' THEN RAISE EXCEPTION 'A6: el pedido pagado que rechazan debía avisar: %', pg_temp.cola(v_id); END IF;
  -- A7) Uber nunca: ni con correo en el pedido.
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_t, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-correos') RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, canal, app, id_externo, estado, cliente_email)
  VALUES (v_t, v_suc, v_conexion, 'APP', 'APP_UBEREATS', 'uber-correos-1', 'RECIBIDO', 'uber@example.com') RETURNING id INTO v_id;
  FOR r IN SELECT * FROM (VALUES ('ACEPTADO'), ('EN_PREPARACION'), ('LISTO'), ('ENTREGADO'), ('CANCELADO')) AS x(hasta) LOOP
    PERFORM pg_temp.mover(v_id, r.hasta);
  END LOOP;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A7: un pedido de Uber dejó correos: %', pg_temp.cola(v_id); END IF;
  -- A8) Sin correo en el pedido no hay a quién escribir.
  v_id := pg_temp.pedido('RECIBIDO', 'EFECTIVO', false, NULL);
  FOR r IN SELECT * FROM (VALUES ('ACEPTADO'), ('LISTO'), ('CANCELADO')) AS x(hasta) LOOP
    PERFORM pg_temp.mover(v_id, r.hasta);
  END LOOP;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A8: un pedido sin correo dejó correos: %', pg_temp.cola(v_id); END IF;
  -- A9) Lo que el cliente no ve como cambio: ERROR, y un UPDATE que no cambia el estado.
  v_id := pg_temp.pedido('RECIBIDO');
  PERFORM pg_temp.mover(v_id, 'ERROR');
  PERFORM pg_temp.mover(v_id, 'RECIBIDO');
  UPDATE delivery_pedidos SET estado = estado, nota_cliente = 'x' WHERE id = v_id;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A9: un cambio que el cliente no ve dejó correo: %', pg_temp.cola(v_id); END IF;
  v_id := pg_temp.pedido('ACEPTADO');
  UPDATE delivery_pedidos SET estado = 'ACEPTADO' WHERE id = v_id;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'A9: escribir el mismo estado dejó correo: %', pg_temp.cola(v_id); END IF;
  -- A10) Si encolar falla, el pedido cambia de estado igual (aquí: una restricción que rechaza el renglón).
  ALTER TABLE tienda_correos ADD CONSTRAINT smoke_rompe CHECK (tipo <> 'LISTO') NOT VALID;
  PERFORM pg_temp.mover(v_id, 'LISTO');
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_id) <> 'LISTO' OR pg_temp.cola(v_id) <> '' THEN
    RAISE EXCEPTION 'A10: un fallo al encolar no debía tocar el cambio de estado: %', pg_temp.cola(v_id);
  END IF;
  ALTER TABLE tienda_correos DROP CONSTRAINT smoke_rompe;

  -- ── B) «Te devolvimos tu pago» ──────────────────────────────────────────────────────────────
  -- B1) Pedido pagado que cancelan: «cancelado» al cancelar y «devuelto» cuando la devolución queda hecha.
  v_id := pg_temp.pedido('ACEPTADO', 'EN_LINEA', true);
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, vence_at, aprobado_at, orden_id_externo)
  VALUES (v_t, v_id, v_cx, 150.00, 'APROBADO', now(), now() - interval '5 minutes', 'ORDCORREO1') RETURNING id INTO v_pago;
  PERFORM tienda_reportar_estado(v_t, v_id, 'CANCELADO', 'AGOTADO');
  IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' OR (SELECT estado FROM tienda_pagos WHERE id = v_pago) <> 'POR_DEVOLVER' THEN
    RAISE EXCEPTION 'B1: al cancelar un pedido pagado: cola %, pago %', pg_temp.cola(v_id), (SELECT estado FROM tienda_pagos WHERE id = v_pago);
  END IF;
  PERFORM tienda_pago_devolucion(v_pago, false, 'sin saldo');
  IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE' THEN RAISE EXCEPTION 'B1: una devolución fallida no es «te devolvimos»: %', pg_temp.cola(v_id); END IF;
  PERFORM tienda_pago_devolucion(v_pago, true);
  IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE,DEVUELTO:PENDIENTE' THEN RAISE EXCEPTION 'B1: con la devolución hecha: %', pg_temp.cola(v_id); END IF;
  -- Mercado Pago lo vuelve a decir (aviso repetido): no repite.
  PERFORM tienda_pago_aplicar(v_pago, 'DEVUELTO', 'ORDCORREO1', 150.00);
  IF pg_temp.cola(v_id) <> 'CANCELADO:PENDIENTE,DEVUELTO:PENDIENTE' THEN RAISE EXCEPTION 'B1: el aviso repetido de devolución repitió el correo: %', pg_temp.cola(v_id); END IF;
  -- B2) El cobro de más (`extra`) que se devuelve no avisa.
  v_id2 := pg_temp.pedido('ACEPTADO', 'EN_LINEA', true);
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, extra, vence_at, aprobado_at)
  VALUES (v_t, v_id2, v_cx, 150.00, 'POR_DEVOLVER', true, now(), now() - interval '5 minutes') RETURNING id INTO v_pago;
  PERFORM tienda_pago_devolucion(v_pago, true);
  IF (SELECT estado FROM tienda_pagos WHERE id = v_pago) <> 'DEVUELTO' OR pg_temp.cola(v_id2) <> '' THEN
    RAISE EXCEPTION 'B2: devolver un cobro de más avisó al cliente: %', pg_temp.cola(v_id2);
  END IF;
  -- B3) El pago que llegó tarde (el pedido ya había vencido sin pago): nunca hubo «cancelado»; sí «devuelto».
  v_id3 := pg_temp.pedido('POR_PAGAR', 'EN_LINEA', false);
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, vence_at)
  VALUES (v_t, v_id3, v_cx, 150.00, 'VENCIDO', now()) RETURNING id INTO v_pago;
  PERFORM pg_temp.mover(v_id3, 'EXPIRADO');
  UPDATE tienda_pagos SET estado = 'POR_DEVOLVER', aprobado_at = now() WHERE id = v_pago;
  IF pg_temp.cola(v_id3) <> '' THEN RAISE EXCEPTION 'B3: antes de devolver no hay correo: %', pg_temp.cola(v_id3); END IF;
  PERFORM tienda_pago_devolucion(v_pago, true);
  IF pg_temp.cola(v_id3) <> 'DEVUELTO:PENDIENTE' THEN RAISE EXCEPTION 'B3: el pago tardío devuelto: %', pg_temp.cola(v_id3); END IF;

  -- ── C) Privacidad: la cola no guarda datos del cliente ──────────────────────────────────────
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_txt FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tienda_correos';
  IF v_txt <> 'id,tenant_id,pedido_id,tipo,estado,intentos,proximo_intento_at,tomado_at,enviado_at,motivo,created_at' THEN
    RAISE EXCEPTION 'C: las columnas de la cola cambiaron (¿guarda algo del cliente?): %', v_txt;
  END IF;
  IF EXISTS (SELECT 1 FROM tienda_correos c WHERE to_jsonb(c)::text ILIKE '%example.com%' OR to_jsonb(c)::text ILIKE '%Ana%') THEN
    RAISE EXCEPTION 'C: hay un correo o un nombre en la cola';
  END IF;

  -- ── D) Tomar: lo que se manda ahora ─────────────────────────────────────────────────────────
  DELETE FROM tienda_correos;
  -- D1) Lo mínimo para armar el correo; contar el intento y apartarlo un minuto.
  v_id := pg_temp.pedido('RECIBIDO');
  PERFORM tienda_enlace_guardar(v_t, (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id), c_cif);
  PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  SELECT * INTO t FROM tienda_correos_tomar();
  IF t.tipo IS DISTINCT FROM 'EN_PREPARACION' OR t.tenant_id IS DISTINCT FROM v_t OR t.slug IS DISTINCT FROM 'correos-smoke'
     OR t.email IS DISTINCT FROM 'ana.correos@example.com'
     OR t.negocio IS DISTINCT FROM (SELECT nombre_comercial FROM tenants WHERE id = v_t)
     OR t.seguimiento_hash IS DISTINCT FROM (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id) OR t.cifrado IS DISTINCT FROM c_cif THEN
    RAISE EXCEPTION 'D1: lo tomado no trae lo que hace falta: %', to_jsonb(t);
  END IF;
  v_c := t.id;
  IF NOT EXISTS (SELECT 1 FROM tienda_correos WHERE id = v_c AND estado = 'PENDIENTE' AND intentos = 1 AND tomado_at IS NOT NULL
                   AND proximo_intento_at BETWEEN now() + interval '59 seconds' AND now() + interval '61 seconds') THEN
    RAISE EXCEPTION 'D1: al tomarlo debía contar un intento y apartarse un minuto: %', (SELECT to_jsonb(c) FROM tienda_correos c WHERE c.id = v_c);
  END IF;
  IF EXISTS (SELECT 1 FROM tienda_correos_tomar()) THEN RAISE EXCEPTION 'D1: dos pasadas tomaron el mismo correo'; END IF;
  -- D2) Reintentos: 1, 5 y 15 minutos de espera; el cuarto fallo lo deja MUERTO. Un fallo no toca el pedido.
  v_antes := (SELECT to_jsonb(p) FROM delivery_pedidos p WHERE p.id = v_id);
  FOR r IN SELECT * FROM (VALUES (1, 1, 'PENDIENTE'), (2, 5, 'PENDIENTE'), (3, 15, 'PENDIENTE'), (4, 15, 'MUERTO')) AS x(intento, espera, queda) LOOP
    IF r.intento > 1 THEN
      UPDATE tienda_correos SET proximo_intento_at = now() - interval '1 second' WHERE id = v_c;
      IF (SELECT x.id FROM tienda_correos_tomar() x) IS DISTINCT FROM v_c THEN RAISE EXCEPTION 'D2: pasada la espera debía volver a salir (intento %)', r.intento; END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tienda_correos WHERE id = v_c AND intentos = r.intento
                     AND proximo_intento_at BETWEEN now() + make_interval(mins => r.espera) - interval '1 second' AND now() + make_interval(mins => r.espera) + interval '1 second') THEN
      RAISE EXCEPTION 'D2: intento %: la espera debía ser de % min: %', r.intento, r.espera, (SELECT to_jsonb(c) FROM tienda_correos c WHERE c.id = v_c);
    END IF;
    IF tienda_correo_resultado(v_c, 'FALLO') <> r.queda THEN
      RAISE EXCEPTION 'D2: tras el fallo % debía quedar %: %', r.intento, r.queda, (SELECT to_jsonb(c) FROM tienda_correos c WHERE c.id = v_c);
    END IF;
  END LOOP;
  IF (SELECT motivo FROM tienda_correos WHERE id = v_c) <> 'ENVIO' THEN RAISE EXCEPTION 'D2: el muerto debía decir por qué'; END IF;
  IF (SELECT to_jsonb(p) FROM delivery_pedidos p WHERE p.id = v_id) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'D2: los fallos de envío tocaron el pedido'; END IF;
  UPDATE tienda_correos SET proximo_intento_at = NULL WHERE id = v_c;
  IF EXISTS (SELECT 1 FROM tienda_correos_tomar()) THEN RAISE EXCEPTION 'D2: un correo muerto volvió a salir'; END IF;
  IF tienda_correo_resultado(v_c, 'ENVIADO') <> 'MUERTO' THEN RAISE EXCEPTION 'D2: un resultado tardío revivió a un muerto'; END IF;
  -- D3) Resultados: enviado, obsoleto, sin correo; y el inválido se rechaza.
  FOR r IN SELECT * FROM (VALUES ('ENVIADO', 'ENVIADO', NULL), ('OBSOLETO', 'DESCARTADO', 'OBSOLETO'), ('SIN_CORREO', 'DESCARTADO', 'SIN_CORREO')) AS x(resultado, queda, motivo) LOOP
    DELETE FROM tienda_correos;
    v_id := pg_temp.pedido('RECIBIDO');
    PERFORM pg_temp.mover(v_id, 'ACEPTADO');
    v_c := (SELECT x.id FROM tienda_correos_tomar() x);
    v_txt := tienda_correo_resultado(v_c, r.resultado);
    IF v_txt <> r.queda
       OR NOT EXISTS (SELECT 1 FROM tienda_correos WHERE id = v_c AND estado = r.queda AND motivo IS NOT DISTINCT FROM r.motivo
                        AND (enviado_at IS NOT NULL) = (r.resultado = 'ENVIADO')) THEN
      RAISE EXCEPTION 'D3: resultado %: %', r.resultado, (SELECT to_jsonb(c) FROM tienda_correos c WHERE c.id = v_c);
    END IF;
    UPDATE tienda_correos SET proximo_intento_at = NULL WHERE id = v_c;
    IF EXISTS (SELECT 1 FROM tienda_correos_tomar()) THEN RAISE EXCEPTION 'D3: un correo % volvió a salir', r.queda; END IF;
  END LOOP;
  BEGIN
    PERFORM tienda_correo_resultado(v_c, 'LO_QUE_SEA');
    RAISE EXCEPTION 'D3: aceptó un resultado inválido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CORREO_RESULTADO_INVALIDO%' THEN RAISE; END IF;
  END;
  -- D4) Los de «cancelado» y «devuelto» salen antes que los demás, y dentro de cada grupo, el más viejo.
  DELETE FROM tienda_correos;
  v_id := pg_temp.pedido('RECIBIDO');  PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  v_id2 := pg_temp.pedido('RECIBIDO'); PERFORM pg_temp.mover(v_id2, 'RECHAZADO');
  UPDATE tienda_correos SET created_at = now() - interval '5 minutes' WHERE pedido_id = v_id;
  v_txt := (SELECT x.tipo FROM tienda_correos_tomar(1) x);
  v_txt := v_txt || ',' || (SELECT x.tipo FROM tienda_correos_tomar(1) x);
  IF v_txt <> 'CANCELADO,EN_PREPARACION' THEN RAISE EXCEPTION 'D4: «cancelado» debía salir antes que «en preparación»: %', v_txt; END IF;
  -- D5) El tope por hora: con la hora llena no sale nada; los intentos de hace más de una hora ya no cuentan.
  DELETE FROM tienda_correos;
  FOR v_n IN 1..4 LOOP
    v_id := pg_temp.pedido('RECIBIDO'); PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  END LOOP;
  IF (SELECT count(*) FROM tienda_correos_tomar(10, 0)) <> 0 THEN RAISE EXCEPTION 'D5: con tope 0 no debía salir nada'; END IF;
  IF (SELECT count(*) FROM tienda_correos_tomar(10, 3)) <> 3 THEN RAISE EXCEPTION 'D5: con tope 3 debían salir 3'; END IF;
  IF (SELECT count(*) FROM tienda_correos_tomar(10, 3)) <> 0 THEN RAISE EXCEPTION 'D5: con la hora llena salió otro'; END IF;
  IF (SELECT count(*) FROM tienda_correos WHERE estado = 'PENDIENTE' AND intentos = 0) <> 1 THEN RAISE EXCEPTION 'D5: el que no cupo debía seguir esperando, sin intentos'; END IF;
  UPDATE tienda_correos SET tomado_at = now() - interval '61 minutes' WHERE id = (SELECT min(id) FROM tienda_correos WHERE intentos = 1);
  IF (SELECT count(*) FROM tienda_correos_tomar(10, 3)) <> 1 THEN RAISE EXCEPTION 'D5: al liberarse un lugar de la hora debía salir uno'; END IF;
  IF (SELECT count(*) FROM tienda_correos_tomar(2, 100)) <> 0 THEN RAISE EXCEPTION 'D5: no quedaba ninguno por tomar'; END IF;
  -- D6) Plazos: «en preparación» y «listo» caducan a los 30 minutos; «cancelado» y «devuelto», a las 24 horas.
  FOR r IN SELECT * FROM (VALUES
    ('EN_PREPARACION', interval '29 minutes', true), ('EN_PREPARACION', interval '31 minutes', false),
    ('LISTO',          interval '29 minutes', true), ('LISTO',          interval '31 minutes', false),
    ('CANCELADO',      interval '23 hours',   true), ('CANCELADO',      interval '25 hours',   false),
    ('DEVUELTO',       interval '23 hours',   true), ('DEVUELTO',       interval '25 hours',   false)) AS x(tipo, hace, sale) LOOP
    DELETE FROM tienda_correos;
    v_id := pg_temp.pedido('RECIBIDO');
    INSERT INTO tienda_correos (tenant_id, pedido_id, tipo, created_at) VALUES (v_t, v_id, r.tipo, now() - r.hace);
    IF EXISTS (SELECT 1 FROM tienda_correos_tomar(10, 100)) <> r.sale THEN RAISE EXCEPTION 'D6: un «%» de hace %: ¿sale? debía ser %', r.tipo, r.hace, r.sale; END IF;
    UPDATE tienda_correos SET intentos = 0, proximo_intento_at = NULL, tomado_at = NULL;
    v_n := tienda_correos_barrer();
    IF v_n <> r.sale::integer OR pg_temp.cola(v_id) <> (r.tipo || (CASE WHEN r.sale THEN ':PENDIENTE' ELSE ':DESCARTADO' END))
       OR (NOT r.sale AND (SELECT motivo FROM tienda_correos WHERE pedido_id = v_id) <> 'VENCIDO') THEN
      RAISE EXCEPTION 'D6: tras el barrido, un «%» de hace % quedó % (el barrido contó %)', r.tipo, r.hace, pg_temp.cola(v_id), v_n;
    END IF;
  END LOOP;
  -- D7) El pedido perdió su correo (se anonimizó) después de encolar: sale con email NULL, para descartarlo.
  DELETE FROM tienda_correos;
  v_id := pg_temp.pedido('RECIBIDO'); PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  UPDATE delivery_pedidos SET cliente_email = NULL WHERE id = v_id;
  SELECT * INTO t FROM tienda_correos_tomar();
  IF t.id IS NULL OR t.email IS NOT NULL THEN RAISE EXCEPTION 'D7: debía salir sin correo: %', to_jsonb(t); END IF;
  -- D8) Gastó sus cuatro intentos y nunca reportó (la función murió): el barrido lo da por muerto, a la vista.
  UPDATE tienda_correos SET intentos = 4, proximo_intento_at = now() - interval '1 second' WHERE id = t.id;
  IF EXISTS (SELECT 1 FROM tienda_correos_tomar()) THEN RAISE EXCEPTION 'D8: un correo con sus cuatro intentos gastados volvió a salir'; END IF;
  PERFORM tienda_correos_barrer();
  IF NOT EXISTS (SELECT 1 FROM tienda_correos WHERE id = t.id AND estado = 'MUERTO' AND motivo = 'SIN_RESULTADO') THEN
    RAISE EXCEPTION 'D8: debía quedar MUERTO / SIN_RESULTADO: %', (SELECT to_jsonb(c) FROM tienda_correos c WHERE c.id = t.id);
  END IF;

  -- ── E) El enlace cifrado ────────────────────────────────────────────────────────────────────
  -- E1) Solo para el pedido de esa huella y ese negocio, solo si dejó correo, y una vez.
  v_id := pg_temp.pedido('RECIBIDO');
  v_txt := (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id);
  PERFORM tienda_enlace_guardar(v_otro, v_txt, c_cif);
  PERFORM tienda_enlace_guardar(v_t, repeat('0', 64), c_cif);
  IF EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id) THEN RAISE EXCEPTION 'E1: guardó el enlace con otro negocio u otra huella'; END IF;
  PERFORM tienda_enlace_guardar(v_t, v_txt, c_cif);
  PERFORM tienda_enlace_guardar(v_t, v_txt, repeat('Zz9_-', 13));
  IF (SELECT cifrado FROM tienda_enlaces WHERE pedido_id = v_id) IS DISTINCT FROM c_cif THEN RAISE EXCEPTION 'E1: debía guardarse una vez y no pisarse'; END IF;
  v_id2 := pg_temp.pedido('RECIBIDO', 'EFECTIVO', false, NULL);
  PERFORM tienda_enlace_guardar(v_t, (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id2), c_cif);
  IF EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id2) THEN RAISE EXCEPTION 'E1: guardó el enlace de un pedido sin correo'; END IF;
  -- E2) Nunca el código en claro: 22 caracteres no caben en la forma de un cifrado.
  BEGIN
    DELETE FROM tienda_enlaces WHERE pedido_id = v_id;
    PERFORM tienda_enlace_guardar(v_t, v_txt, 'AAAAAAAAAAAAAAAAAAAAAA');
    RAISE EXCEPTION 'E2: aceptó un código en claro como cifrado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- E3) Se borra a las 48 horas; la cola, a los 30 días; y las dos se van con el pedido.
  PERFORM tienda_enlace_guardar(v_t, v_txt, c_cif);
  PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  UPDATE tienda_enlaces SET created_at = now() - interval '47 hours' WHERE pedido_id = v_id;
  UPDATE tienda_correos SET created_at = now() - interval '29 days', estado = 'ENVIADO' WHERE pedido_id = v_id;
  PERFORM tienda_correos_barrer();
  IF NOT EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id) OR pg_temp.cola(v_id) = '' THEN RAISE EXCEPTION 'E3: borró antes de tiempo'; END IF;
  UPDATE tienda_enlaces SET created_at = now() - interval '49 hours' WHERE pedido_id = v_id;
  UPDATE tienda_correos SET created_at = now() - interval '31 days' WHERE pedido_id = v_id;
  PERFORM tienda_correos_barrer();
  IF EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id) THEN RAISE EXCEPTION 'E3: un enlace de 49 horas sigue guardado'; END IF;
  IF pg_temp.cola(v_id) <> '' THEN RAISE EXCEPTION 'E3: un renglón de la cola de 31 días sigue ahí: %', pg_temp.cola(v_id); END IF;
  v_id := pg_temp.pedido('RECIBIDO');
  PERFORM tienda_enlace_guardar(v_t, (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id), c_cif);
  PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  DELETE FROM delivery_pedidos WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id) OR EXISTS (SELECT 1 FROM tienda_correos WHERE pedido_id = v_id) THEN
    RAISE EXCEPTION 'E3: borrar el pedido dejó su enlace o sus correos';
  END IF;
  -- E4) La purga de datos personales a los 30 días: después de ella no queda ni enlace ni correo que mandar.
  v_id := pg_temp.pedido('RECIBIDO');
  PERFORM tienda_enlace_guardar(v_t, (SELECT seguimiento_hash FROM delivery_pedidos WHERE id = v_id), c_cif);
  PERFORM pg_temp.mover(v_id, 'CANCELADO');
  UPDATE delivery_pedidos SET recibido_at = now() - interval '31 days' WHERE id = v_id;
  UPDATE tienda_enlaces SET created_at = now() - interval '31 days' WHERE pedido_id = v_id;
  UPDATE tienda_correos SET created_at = now() - interval '31 days' WHERE pedido_id = v_id;
  PERFORM delivery_anonimizar_pedidos_viejos();
  PERFORM tienda_correos_barrer();
  IF (SELECT cliente_email FROM delivery_pedidos WHERE id = v_id) IS NOT NULL OR EXISTS (SELECT 1 FROM tienda_enlaces WHERE pedido_id = v_id)
     OR pg_temp.cola(v_id) <> '' THEN
    RAISE EXCEPTION 'E4: tras la purga de 30 días quedó algo del pedido: %', pg_temp.cola(v_id);
  END IF;

  -- ── F) El barrido que no puede llamar a la función lo deja a la vista (un renglón por hora) ─
  DELETE FROM tienda_correos;
  DELETE FROM tienda_eventos WHERE accion = 'correos:sin_configurar';
  IF tienda_correos_barrer() <> 0 OR EXISTS (SELECT 1 FROM tienda_eventos WHERE accion = 'correos:sin_configurar') THEN
    RAISE EXCEPTION 'F: sin nada que mandar no debía avisar';
  END IF;
  v_id := pg_temp.pedido('RECIBIDO'); PERFORM pg_temp.mover(v_id, 'ACEPTADO');
  IF tienda_correos_barrer() <> 1 OR tienda_correos_barrer() <> 1 THEN RAISE EXCEPTION 'F: el barrido debía contar un correo por mandar'; END IF;
  IF (SELECT count(*) FROM tienda_eventos WHERE accion = 'correos:sin_configurar' AND payload ->> 'vim_interno' = 'false') <> 1 THEN
    RAISE EXCEPTION 'F: sin los secretos debía quedar UN rastro y quedaron %', (SELECT count(*) FROM tienda_eventos WHERE accion = 'correos:sin_configurar');
  END IF;
  IF pg_temp.cola(v_id) <> 'EN_PREPARACION:PENDIENTE' THEN RAISE EXCEPTION 'F: el barrido sin configurar tocó el correo: %', pg_temp.cola(v_id); END IF;

  -- ── G) Permisos ─────────────────────────────────────────────────────────────────────────────
  FOR r IN SELECT p.oid::regprocedure AS firma, p.proname, p.prosecdef, p.proconfig FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_enlace_guardar', 'tienda_correos_tomar', 'tienda_correo_resultado', 'tienda_correos_barrer',
                                '_tienda_correo_plazo', '_tienda_correo_encolar',
                                'delivery_pedidos_correo_de_estado', 'tienda_pagos_correo_de_devolucion') LOOP
    IF has_function_privilege('anon', r.firma, 'EXECUTE') OR has_function_privilege('authenticated', r.firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'G: % la puede ejecutar el público o el personal', r.firma;
    END IF;
    IF has_function_privilege('service_role', r.firma, 'EXECUTE') <> (r.proname IN ('tienda_enlace_guardar', 'tienda_correos_tomar', 'tienda_correo_resultado', 'tienda_correos_barrer')) THEN
      RAISE EXCEPTION 'G: permiso de service_role sobre %', r.firma;
    END IF;
    IF COALESCE(r.proconfig::text, '') NOT LIKE '%search_path=public, pg_temp%' OR (NOT r.prosecdef AND r.proname <> '_tienda_correo_plazo') THEN
      RAISE EXCEPTION 'G: % debía ser SECURITY DEFINER con search_path fijo', r.firma;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('tienda_enlace_guardar', 'tienda_correos_tomar', 'tienda_correo_resultado', 'tienda_correos_barrer', '_tienda_correo_plazo',
                       '_tienda_correo_encolar', 'delivery_pedidos_correo_de_estado', 'tienda_pagos_correo_de_devolucion')) <> 8 THEN
    RAISE EXCEPTION 'G: falta o sobra alguna función (¿una sobrecarga?)';
  END IF;
  FOR r IN SELECT * FROM (VALUES ('tienda_correos'), ('tienda_enlaces')) AS x(tabla), (VALUES ('anon'), ('authenticated')) AS y(rol),
                         (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS z(permiso) LOOP
    IF has_table_privilege(r.rol, r.tabla, r.permiso) THEN RAISE EXCEPTION 'G: % puede % en %', r.rol, r.permiso, r.tabla; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_class WHERE relname IN ('tienda_correos', 'tienda_enlaces') AND relnamespace = 'public'::regnamespace AND relrowsecurity) <> 2
     OR EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('tienda_correos', 'tienda_enlaces')) THEN
    RAISE EXCEPTION 'G: las dos tablas llevan RLS encendido y ninguna política';
  END IF;

  RAISE NOTICE 'smoke_tienda_correos_de_estado OK';
END $$;
ROLLBACK;
