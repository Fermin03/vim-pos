-- Smoke de zonas de envío. Corre como postgres contra la BD sembrada, en transacción con ROLLBACK.
-- Objetivo: el contrato completo del cargo de envío — catálogo, totales, IVA heredado,
--           un solo renglón vivo, y la invariante que protege el timbrado.
-- Uso: cd desktop && npm run smokes -- smoke_envio.sql
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_z_centro uuid;
  v_z_norte  uuid;
BEGIN
  -- 1) Alta de zonas
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Centro', 0.00) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Norte', 35.00) RETURNING id INTO v_z_norte;

  -- 1b) Una zona nueva es "el catálogo cambió": catalogo_version() la ve. Sin esto la caja no
  --     se entera hasta el pull de respaldo (hasta una hora). Nada más en esta transacción ha
  --     tocado el catálogo todavía, así que el máximo solo puede ser now() si incluye zonas_envio.
  IF catalogo_version() IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'catalogo_version() no incluye zonas_envio (devolvió %, esperaba %)', catalogo_version(), now();
  END IF;

  -- 2) Nombre repetido en la misma sucursal: rechazado aunque cambien mayúsculas y espacios
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, '  zona norte ', 50.00);
    RAISE EXCEPTION 'FALLO: se permitió una zona con nombre duplicado';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3) Costo negativo: rechazado
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, 'Imposible', -1.00);
    RAISE EXCEPTION 'FALLO: se permitió un costo de envío negativo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) Las columnas nuevas existen y aceptan la zona
  UPDATE direcciones_cliente SET zona_envio_id = v_z_norte WHERE false;
  UPDATE tickets             SET zona_envio_id = v_z_norte WHERE false;
  UPDATE ticket_items        SET cargo_tipo    = 'ENVIO'   WHERE false;

  -- 5) El CHECK de cargo_tipo existe (el rechazo real se prueba en el smoke de la RPC, que sí
  --    crea renglones)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_items_cargo_tipo_chk') THEN
    RAISE EXCEPTION 'FALLO: falta el CHECK de cargo_tipo';
  END IF;

  -- Limpieza: este bloque solo prueba esquema, no debe dejar zonas puestas para los bloques de
  -- abajo (que crean SUS PROPIAS 'Centro'/'Zona Norte' en el mismo tenant/sucursal — todo el
  -- archivo corre en una sola transacción, así que un residuo aquí chocaría con
  -- zona_envio_nombre_uq antes de llegar a probar la RPC).
  DELETE FROM zonas_envio WHERE id IN (v_z_centro, v_z_norte);

  RAISE NOTICE 'OK esquema de zonas_envio';
END $$;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno  uuid;
  v_ticket uuid;
  v_aqui   uuid;
  v_z_centro uuid;
  v_z_norte  uuid;
  v_z_lejos  uuid;
  v_renglon  uuid;
  v_total  numeric(12,2);
  v_suma   numeric(12,2);
  v_n      integer;
  v_iva_incl boolean;
BEGIN
  -- Con tenant_id: fijar_envio_ticket es SECURITY DEFINER y compara el tenant del ticket con el
  -- del JWT, igual que en producción.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-ENV', current_date, v_maria, 1000.00)
  RETURNING id INTO v_turno;

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Centro', 0.00) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Norte', 35.00) RETURNING id INTO v_z_norte;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Las Joyas', 50.00) RETURNING id INTO v_z_lejos;

  -- Ticket de domicilio con dos hamburguesas = 240.00
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, NULL);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'partida: esperaba 240.00, got %', v_total; END IF;

  -- 1) El cargo suma al total
  v_renglon := fijar_envio_ticket(v_ticket, v_z_norte);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 275.00 THEN RAISE EXCEPTION 'con envío: esperaba 275.00, got %', v_total; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) <> v_z_norte
    THEN RAISE EXCEPTION 'el ticket no guardó la zona'; END IF;
  IF (SELECT producto_nombre_snapshot FROM ticket_items WHERE id = v_renglon) <> 'Envío · Zona Norte'
    THEN RAISE EXCEPTION 'nombre del renglón inesperado'; END IF;
  IF (SELECT clave_sat_snapshot FROM ticket_items WHERE id = v_renglon) IS NOT NULL
    THEN RAISE EXCEPTION 'el envío no debe traer clave SAT propia'; END IF;

  -- 2) LA INVARIANTE QUE PROTEGE EL TIMBRADO: los renglones suman el total del ticket.
  --    Es justo lo que valida armarConceptos antes de mandar el CFDI al PAC.
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
  FROM ticket_items WHERE ticket_id = v_ticket AND cancelado = false;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'renglones (%) no suman el total del ticket (%): el CFDI no timbraría', v_suma, v_total;
  END IF;

  -- 3) Cambiar de zona reprecia y NO duplica el renglón
  PERFORM fijar_envio_ticket(v_ticket, v_z_lejos);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 290.00 THEN RAISE EXCEPTION 'tras cambiar de zona: esperaba 290.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'esperaba 1 renglón de envío, hay %', v_n; END IF;

  -- 4) Quitar la zona deja el ticket como estaba
  IF fijar_envio_ticket(v_ticket, NULL) IS NOT NULL
    THEN RAISE EXCEPTION 'quitar el envío debe devolver NULL'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'tras quitar el envío: esperaba 240.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_n <> 0 THEN RAISE EXCEPTION 'el renglón de envío debía borrarse, no cancelarse'; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS NOT NULL
    THEN RAISE EXCEPTION 'el ticket conservó la zona tras quitar el envío'; END IF;

  -- 5) Zona de $0: NO hay renglón (un concepto de base 0 no timbra: Anexo 20 exige base > 0, y
  --    armarConceptos solo pliega los renglones sin dinero que son hijos de combo), el total no
  --    cambia y la zona SÍ queda en el ticket, para los reportes por zona.
  IF fijar_envio_ticket(v_ticket, v_z_centro) IS NOT NULL
    THEN RAISE EXCEPTION 'zona gratis: sin renglón no hay id que devolver'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'zona gratis: esperaba 240.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_n <> 0 THEN RAISE EXCEPTION 'la zona gratis dejó % renglón(es) de $0: ese ticket no se podría facturar', v_n; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_z_centro
    THEN RAISE EXCEPTION 'zona gratis: el ticket no guardó la zona'; END IF;

  -- 5b) De $35 a $0: el renglón que ya existía desaparece
  PERFORM fijar_envio_ticket(v_ticket, v_z_norte);
  PERFORM fijar_envio_ticket(v_ticket, v_z_centro);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 240.00 THEN RAISE EXCEPTION 'de $35 a $0: esperaba 240.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_n <> 0 THEN RAISE EXCEPTION 'de $35 a $0: el renglón de envío debía desaparecer, quedan %', v_n; END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_z_centro
    THEN RAISE EXCEPTION 'de $35 a $0: el ticket no guardó la zona gratis'; END IF;

  -- 6) El IVA se hereda del ticket, no es una constante (con una zona que sí cobra)
  PERFORM fijar_envio_ticket(v_ticket, v_z_norte);
  SELECT iva_incluido_en_precio_snapshot INTO v_iva_incl
    FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  IF v_iva_incl IS DISTINCT FROM (SELECT iva_incluido_en_precio_snapshot FROM ticket_items
                                   WHERE ticket_id = v_ticket AND cargo_tipo IS NULL
                                   ORDER BY orden_visualizacion LIMIT 1)
    THEN RAISE EXCEPTION 'el envío no heredó la política de IVA del ticket'; END IF;

  -- 6b) RESPALDO SIN RENGLONES: ticket recién abierto, SIN pasar por agregar_item_a_ticket (el
  --     cajero puede elegir la zona antes de capturar la comida — abrir_ticket deja el ticket en
  --     BORRADOR sin renglones). No hay ningún renglón de producto del que heredar, así que la RPC
  --     debe caer en el respaldo 16.00/incluido.
  DECLARE
    v_vacio         uuid;
    v_renglon_vacio uuid;
    v_tasa_vacio    numeric(5,2);
    v_incl_vacio    boolean;
  BEGIN
    v_vacio := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
    IF EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = v_vacio) THEN
      RAISE EXCEPTION 'el ticket "vacío" del caso 6b ya traía renglones';
    END IF;

    v_renglon_vacio := fijar_envio_ticket(v_vacio, v_z_norte);
    SELECT tasa_iva_snapshot, iva_incluido_en_precio_snapshot
      INTO v_tasa_vacio, v_incl_vacio
      FROM ticket_items WHERE id = v_renglon_vacio;

    IF v_tasa_vacio <> 16.00 OR v_incl_vacio IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'respaldo sin renglones: esperaba 16.00/true, got %/%', v_tasa_vacio, v_incl_vacio;
    END IF;
  END;

  -- 6c) HERENCIA FALSABLE: producto cuyo primer renglón NO es 16%/incluido, para que este caso
  --     reviente si alguien quema la constante del respaldo en vez de heredar de verdad. Fixture
  --     de prueba, NO es catálogo real: IVA por afuera al 8% (útil para probar sin depender de
  --     ninguna franja fronteriza real).
  DECLARE
    v_cat_h       uuid := 'a0000000-0000-0000-0000-0000000000c1';  -- categoría Hamburguesas (seed)
    v_prod_raro   uuid;
    v_raro        uuid;
    v_renglon_raro uuid;
    v_tasa_raro   numeric(5,2);
    v_incl_raro   boolean;
  BEGIN
    INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
    VALUES (v_tenant, v_cat_h, 'SMOKE fixture — IVA raro (no es catálogo real)', 100.00, 8.00, false)
    RETURNING id INTO v_prod_raro;

    v_raro := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
    PERFORM agregar_item_a_ticket(v_raro, v_prod_raro, 1, NULL, '[]'::jsonb, NULL);

    v_renglon_raro := fijar_envio_ticket(v_raro, v_z_norte);
    SELECT tasa_iva_snapshot, iva_incluido_en_precio_snapshot
      INTO v_tasa_raro, v_incl_raro
      FROM ticket_items WHERE id = v_renglon_raro;

    IF v_tasa_raro <> 8.00 OR v_incl_raro IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'herencia falsable: esperaba 8.00/false (política real del primer renglón), got %/% -- ¿se quemó la constante del respaldo?', v_tasa_raro, v_incl_raro;
    END IF;
  END;

  -- 7) Otro modo de servicio: rechazado
  v_aqui := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_aqui, v_prod, 1, NULL, '[]'::jsonb, NULL);
  BEGIN
    PERFORM fijar_envio_ticket(v_aqui, v_z_norte);
    RAISE EXCEPTION 'FALLO: se permitió cobrar envío en un ticket que no es domicilio';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  -- 8) Ticket ya cobrado: rechazado
  UPDATE tickets SET estado_fiscal = 'PAGADO' WHERE id = v_ticket;
  BEGIN
    PERFORM fijar_envio_ticket(v_ticket, v_z_norte);
    RAISE EXCEPTION 'FALLO: se permitió tocar el envío de un ticket PAGADO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  -- 9) El envío no es un producto vendido: el ticket PAGADO de arriba lleva envío y aun así no
  --    aparece "Envío · …" en la vista de ventas por producto.
  IF EXISTS (SELECT 1 FROM vw_ventas_por_producto
              WHERE tenant_id = v_tenant AND producto_nombre LIKE 'Envío%') THEN
    RAISE EXCEPTION 'vw_ventas_por_producto cuenta el envío como producto vendido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vw_ventas_por_producto
                  WHERE tenant_id = v_tenant AND producto_id = v_prod) THEN
    RAISE EXCEPTION 'vw_ventas_por_producto perdió la comida del ticket con envío';
  END IF;

  RAISE NOTICE 'OK fijar_envio_ticket';
END $$;

-- 4) RLS cross-tenant: bajo el rol `authenticated` con el JWT real de un empleado (no `postgres`,
--    que se salta RLS por completo), puede crear y leer SU zona de envío; la de otro negocio no
--    se ve (cero filas, no error). Esto es justo lo que protege el alta de zonas_envio desde la
--    caja (Tarea 6): un GRANT o una política rotos aquí truenan en producción y ningún smoke que
--    corra como postgres los vería. Patrón: supabase/scripts/rls_venta.sql.
DO $$
DECLARE
  v_ajeno      uuid := '99999999-0000-0000-0000-0000000000ff';
  v_suc_ajena  uuid := '99999999-0000-0000-0000-0000000000fc';
  v_zona_ajena uuid := '99999999-0000-0000-0000-0000000000fd';
BEGIN
  -- Fixture de OTRO negocio, insertada como postgres (superusuario, bypasea RLS) ANTES de
  -- cambiar de rol: ids fijos porque las variables de este bloque no las ve el bloque siguiente.
  INSERT INTO tenants (id, codigo, nombre_comercial, vertical_principal)
  VALUES (v_ajeno, 'smoke-ajeno-envio', 'Ajeno', 'QUICK_SERVICE') ON CONFLICT (id) DO NOTHING;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre)
  VALUES (v_suc_ajena, v_ajeno, 'AJ', 'Sucursal ajena') ON CONFLICT (id) DO NOTHING;
  INSERT INTO zonas_envio (id, tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_zona_ajena, v_ajeno, v_suc_ajena, 'Zona Ajena', 20.00) ON CONFLICT (id) DO NOTHING;
END $$;

-- Fixture del bloque de la RPC bajo RLS (abajo). Se arma como postgres porque abrir el turno y el
-- ticket no es lo que se prueba; lo que se prueba es fijar_envio_ticket llamada como la llama el
-- POS. Los ids viajan en GUCs locales porque las variables de un DO no cruzan al siguiente.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno  uuid;
  v_ticket uuid;
  v_z      uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE codigo_turno = 'SMOKE-ENV' AND tenant_id = v_tenant;

  -- Dos hamburguesas = 240.00. Tras agregar_item_a_ticket el ticket ya está ABIERTO
  -- (trg_ticket_item_promover_borrador): justo el estado en que la política ticket_items_delete
  -- NO deja borrar renglones a `authenticated`.
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM set_config('smoke_envio.ticket', v_ticket::text, true);

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'RLS Norte', 35.00) RETURNING id INTO v_z;
  PERFORM set_config('smoke_envio.z_norte', v_z::text, true);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'RLS Lejos', 50.00) RETURNING id INTO v_z;
  PERFORM set_config('smoke_envio.z_lejos', v_z::text, true);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'RLS Gratis', 0.00) RETURNING id INTO v_z;
  PERFORM set_config('smoke_envio.z_gratis', v_z::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}',
  true);

DO $$
DECLARE
  v_zona_propia uuid;
  v_nombre      text;
  v_n           integer;
BEGIN
  -- a) El empleado del tenant crea una zona (bajo RLS) y la lee de vuelta
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb',
          'Zona RLS', 45.00)
  RETURNING id INTO v_zona_propia;

  SELECT nombre INTO v_nombre FROM zonas_envio WHERE id = v_zona_propia;
  IF v_nombre IS DISTINCT FROM 'Zona RLS' THEN
    RAISE EXCEPTION 'RLS: el empleado no pudo crear/leer su propia zona de envío';
  END IF;

  -- b) La zona de otro tenant no se ve: cero filas, no error
  SELECT count(*) INTO v_n FROM zonas_envio WHERE id = '99999999-0000-0000-0000-0000000000fd';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'RLS NO bloqueó la lectura de una zona de envío de otro tenant';
  END IF;

  RAISE NOTICE 'RLS OK -- zonas_envio: alta+lectura propia bajo authenticated, zona ajena invisible';
END $$;

-- 4b) LA RPC BAJO RLS, como la llama el POS. Los casos de arriba corren como postgres, que se salta
--     la política ticket_items_delete (0008:2126: solo borra renglones de tickets en BORRADOR); por
--     eso nadie vio que, como `authenticated`, quitar el envío devolvía NULL sin error, borraba la
--     zona del ticket y dejaba VIVO el renglón con el total inflado (hallazgo C1).
DO $$
DECLARE
  v_ticket  uuid := current_setting('smoke_envio.ticket')::uuid;
  v_norte   uuid := current_setting('smoke_envio.z_norte')::uuid;
  v_lejos   uuid := current_setting('smoke_envio.z_lejos')::uuid;
  v_total   numeric(12,2);
  v_n       integer;
BEGIN
  -- a) Poner la zona
  PERFORM fijar_envio_ticket(v_ticket, v_norte);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 275.00 THEN RAISE EXCEPTION 'RLS a) con envío: esperaba 275.00, got %', v_total; END IF;

  -- b) Cambiarla: reprecia sin duplicar
  PERFORM fijar_envio_ticket(v_ticket, v_lejos);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 290.00 THEN RAISE EXCEPTION 'RLS b) tras cambiar de zona: esperaba 290.00, got %', v_total; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'RLS b) esperaba 1 renglón de envío, hay %', v_n; END IF;

  -- b2) Zona gratis bajo RLS: el renglón que había desaparece y la zona queda
  PERFORM fijar_envio_ticket(v_ticket, current_setting('smoke_envio.z_gratis')::uuid);
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_n <> 0 OR v_total <> 240.00 THEN
    RAISE EXCEPTION 'RLS b2) zona gratis dejó % renglón(es) ENVIO y total % (esperaba 0 y 240.00)', v_n, v_total;
  END IF;
  PERFORM fijar_envio_ticket(v_ticket, v_lejos);

  -- c) Quitarla: el total vuelve y NO queda renglón
  PERFORM fijar_envio_ticket(v_ticket, NULL);
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO';
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_n <> 0 OR v_total <> 240.00 THEN
    RAISE EXCEPTION 'RLS c) quitar el envío como authenticated dejó % renglón(es) ENVIO y total % (esperaba 0 y 240.00)', v_n, v_total;
  END IF;
  IF (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS NOT NULL THEN
    RAISE EXCEPTION 'RLS c) el ticket conservó la zona tras quitar el envío';
  END IF;

  -- Se deja puesto para el caso d)
  PERFORM fijar_envio_ticket(v_ticket, v_norte);
  RAISE NOTICE 'RLS OK -- fijar_envio_ticket: poner, cambiar y quitar bajo authenticated';
END $$;

-- d) Un empleado de OTRO negocio no puede tocar ese ticket (ni quitar ni poner envío).
SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-0000000000f1","tenant_id":"99999999-0000-0000-0000-0000000000ff","role":"authenticated"}',
  true);

DO $$
DECLARE
  v_ticket uuid := current_setting('smoke_envio.ticket')::uuid;
  v_lejos  uuid := current_setting('smoke_envio.z_lejos')::uuid;
BEGIN
  BEGIN
    PERFORM fijar_envio_ticket(v_ticket, NULL);
    RAISE EXCEPTION 'FALLO: un empleado de otro tenant pudo quitar el envío de un ticket ajeno';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM fijar_envio_ticket(v_ticket, v_lejos);
    RAISE EXCEPTION 'FALLO: un empleado de otro tenant pudo cambiar el envío de un ticket ajeno';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}',
  true);

DO $$
DECLARE
  v_ticket uuid := current_setting('smoke_envio.ticket')::uuid;
  v_norte  uuid := current_setting('smoke_envio.z_norte')::uuid;
BEGIN
  IF (SELECT total_mxn FROM tickets WHERE id = v_ticket) <> 275.00
     OR (SELECT zona_envio_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_norte
     OR (SELECT count(*) FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO') <> 1 THEN
    RAISE EXCEPTION 'RLS d) el intento del otro tenant alteró el ticket';
  END IF;
  RAISE NOTICE 'RLS OK -- fijar_envio_ticket: otro tenant rechazado sin tocar nada';
END $$;

RESET ROLE;

-- 5) Sync con la nube: la zona BAJA en el pull y una zona nueva creada en la caja SUBE en el push.
--    Corre como postgres (RESET ROLE ya hecho arriba): sync_push_snapshot hace
--    SET LOCAL session_replication_role = replica, que exige superusuario.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_snap   jsonb;
  v_zona   uuid := gen_random_uuid();
BEGIN
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Bajada', 25.00);

  -- BAJA: la rebanada del tenant trae las zonas
  v_snap := sync_pull_snapshot(v_tenant);
  IF NOT (v_snap ? 'zonas_envio') THEN
    RAISE EXCEPTION 'sync_pull_snapshot no incluye zonas_envio: la caja nunca vería el catálogo';
  END IF;
  IF jsonb_array_length(v_snap->'zonas_envio') < 1 THEN
    RAISE EXCEPTION 'sync_pull_snapshot devolvió zonas_envio vacío';
  END IF;

  -- SUBE: una zona dada de alta en la caja se replica verbatim
  PERFORM sync_push_snapshot(v_tenant, jsonb_build_object(
    'zonas_envio', jsonb_build_array(jsonb_build_object(
      'id', v_zona, 'tenant_id', v_tenant, 'sucursal_id', v_suc,
      'nombre', 'Desde la caja', 'costo_mxn', 40.00, 'orden', 0, 'activa', true,
      'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));

  IF NOT EXISTS (SELECT 1 FROM zonas_envio WHERE id = v_zona AND costo_mxn = 40.00) THEN
    RAISE EXCEPTION 'sync_push_snapshot no aplicó la zona creada en la caja';
  END IF;

  RAISE NOTICE 'OK sync de zonas_envio';
END $$;

-- 6) EL ENVÍO NO ADMITE DESCUENTOS NI PROMOCIONES (spec §3, ADR 0017). Un 10% rebaja la comida;
--    el envío se cobra completo. Cuatro caminos por donde el envío se colaba a la base del
--    descuento: el descuento manual de ticket, la promoción de ticket, la evaluación de promociones
--    (monto previsto y mínimo de compra) y el descuento de renglón sobre el propio envío. El quinto
--    —el reparto en el CFDI— lo cubren las unitarias de conceptos.ts.
--
--    Cada caso usa SU ticket (240 de comida + 35 de envío = 275) para que un descuento no contamine
--    al siguiente. Los fallos se juntan y se reportan todos al final: en rojo se ve de un vistazo
--    cuántos caminos dejan pasar el envío, no solo el primero.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno  uuid;
  v_zona   uuid;
  v_auth   jsonb;
  v_pin    uuid;
  v_autorizo uuid;
  v_t      uuid;
  v_envio  uuid;
  v_promo  uuid;
  v_monto  numeric(12,2);
  v_total  numeric(12,2);
  v_suma   numeric(12,2);
  v_desc   numeric(12,2);
  v_fallos text[] := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE codigo_turno = 'SMOKE-ENV' AND tenant_id = v_tenant;

  -- Nombre nuevo: el archivo entero es UNA transacción y 'Zona Norte'/'RLS Norte' ya existen.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Descuentos Norte', 35.00) RETURNING id INTO v_zona;

  -- Una autorización de supervisor (Diego, PIN 4321), reutilizada: aplicar_descuento_manual solo
  -- exige que exista, y lo que se prueba aquí es el monto, no el flujo de PIN.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  v_auth := verificar_autorizacion_pin('4321', 'descuento_manual', 'descuento.manual_aplicar',
              'ticket', v_t, 24, 'CLIENTE_FRECUENTE', v_caja, v_turno, v_maria);
  IF (v_auth->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'autorización falló: %', v_auth; END IF;
  v_pin := (v_auth->>'autorizacion_pin_id')::uuid;
  v_autorizo := (v_auth->>'autorizo_id')::uuid;

  -- a) Descuento manual de ticket, 10%: 24.00 (el 10% de 240), no 27.50 (el de 275).
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'PORCENTAJE', 10, 'CLIENTE_FRECUENTE', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  SELECT monto_descontado_mxn INTO v_monto FROM ticket_descuentos_manuales
   WHERE ticket_id = v_t AND ticket_item_id IS NULL;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_monto <> 24.00 OR v_total <> 251.00 THEN
    v_fallos := v_fallos || format('a) descuento manual 10%%: monto %s y total %s (esperaba 24.00 y 251.00)', v_monto, v_total);
  END IF;

  -- a2) La invariante del timbrado con descuento de ticket: renglones − descuentos de ticket = total.
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_t AND cancelado = false;
  SELECT COALESCE(SUM(monto_descontado_mxn), 0) INTO v_desc FROM ticket_descuentos_manuales
   WHERE ticket_id = v_t AND ticket_item_id IS NULL AND reversado = false;
  IF v_suma - v_desc <> v_total THEN
    v_fallos := v_fallos || format('a2) renglones %s − descuento de ticket %s ≠ total %s', v_suma, v_desc, v_total);
  END IF;

  -- b) Monto fijo mayor que la comida: se topa en la comida y el envío queda completo.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'MONTO_FIJO', 300, 'CLIENTE_FRECUENTE', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  SELECT monto_descontado_mxn INTO v_monto FROM ticket_descuentos_manuales
   WHERE ticket_id = v_t AND ticket_item_id IS NULL;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_monto <> 240.00 OR v_total <> 35.00 THEN
    v_fallos := v_fallos || format('b) monto fijo de 300: monto %s y total %s (esperaba 240.00 y 35.00)', v_monto, v_total);
  END IF;

  -- c) Cortesía total: regala la comida, no el envío. El total queda en 35.00.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'CORTESIA_TOTAL', 0, 'CORTESIA_INVITADO', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_total <> 35.00 THEN
    v_fallos := v_fallos || format('c) cortesía total: total %s (esperaba 35.00, el envío)', v_total);
  END IF;

  -- d) Promoción de ticket del 10%: 24.00. Y la evaluación previa estima lo mismo.
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance, valor_porcentaje)
  VALUES (v_tenant, 'SMOKE envío — 10% al ticket', 'PORCENTAJE', 'TICKET_COMPLETO', 10)
  RETURNING id INTO v_promo;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  SELECT monto_descuento_estimado_mxn INTO v_monto
    FROM evaluar_promociones_aplicables(v_t) WHERE promocion_id = v_promo;
  IF v_monto IS DISTINCT FROM 24.00 THEN
    v_fallos := v_fallos || format('d) evaluar_promociones_aplicables estima %s para el 10%% (esperaba 24.00)', v_monto);
  END IF;
  PERFORM aplicar_promocion(v_t, v_promo, NULL);
  SELECT monto_descontado_mxn INTO v_monto FROM ticket_promociones_aplicadas
   WHERE ticket_id = v_t AND promocion_id = v_promo;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_monto <> 24.00 OR v_total <> 251.00 THEN
    v_fallos := v_fallos || format('d) promoción 10%%: monto %s y total %s (esperaba 24.00 y 251.00)', v_monto, v_total);
  END IF;
  -- d2) Invariante del timbrado, ahora con promoción de ticket.
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_t AND cancelado = false;
  SELECT COALESCE(SUM(monto_descontado_mxn), 0) INTO v_desc FROM ticket_promociones_aplicadas
   WHERE ticket_id = v_t AND cancelada_por_cajero = false AND promocion_alcance_snapshot = 'TICKET_COMPLETO';
  IF v_suma - v_desc <> v_total THEN
    v_fallos := v_fallos || format('d2) renglones %s − promoción de ticket %s ≠ total %s', v_suma, v_desc, v_total);
  END IF;

  -- e) Promoción cortesía de ticket: el total queda en el envío.
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance)
  VALUES (v_tenant, 'SMOKE envío — cortesía', 'CORTESIA_TOTAL', 'TICKET_COMPLETO')
  RETURNING id INTO v_promo;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_promocion(v_t, v_promo, NULL);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_total <> 35.00 THEN
    v_fallos := v_fallos || format('e) promoción cortesía: total %s (esperaba 35.00)', v_total);
  END IF;

  -- f) Precio especial de 200 por la comida: descuenta 40 (240 → 200) y el envío va aparte.
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance, precio_especial_mxn)
  VALUES (v_tenant, 'SMOKE envío — precio especial', 'PRECIO_ESPECIAL', 'TICKET_COMPLETO', 200)
  RETURNING id INTO v_promo;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_promocion(v_t, v_promo, NULL);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_total <> 235.00 THEN
    v_fallos := v_fallos || format('f) precio especial 200: total %s (esperaba 235.00 = 200 + 35)', v_total);
  END IF;

  -- g) Mínimo de compra de 250: 240 de comida + 35 de envío NO lo alcanzan.
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance, valor_porcentaje, condiciones)
  VALUES (v_tenant, 'SMOKE envío — 5% desde 250', 'PORCENTAJE', 'TICKET_COMPLETO', 5,
          '{"monto_ticket": {"minimo_mxn": 250}}'::jsonb)
  RETURNING id INTO v_promo;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  IF EXISTS (SELECT 1 FROM evaluar_promociones_aplicables(v_t) WHERE promocion_id = v_promo) THEN
    v_fallos := v_fallos || 'g) una promo con mínimo de 250 se ofreció a 240 de comida + 35 de envío'::text;
  END IF;
  -- g2) Control: con 360 de comida sí aparece (el filtro no está simplemente roto).
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  IF NOT EXISTS (SELECT 1 FROM evaluar_promociones_aplicables(v_t) WHERE promocion_id = v_promo) THEN
    v_fallos := v_fallos || 'g2) con 360 de comida la promo de mínimo 250 no apareció'::text;
  END IF;

  -- h) Descuento de RENGLÓN sobre el propio envío: rechazado (si no, la regla se salta
  --    descontando el renglón directamente). Porcentaje y cambio de precio, los dos.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 2, NULL, '[]'::jsonb, NULL);
  v_envio := fijar_envio_ticket(v_t, v_zona);
  BEGIN
    PERFORM aplicar_descuento_manual(v_t, v_envio, 'PORCENTAJE', 50, 'CLIENTE_FRECUENTE', NULL,
              v_pin, v_maria, v_autorizo, NULL);
    v_fallos := v_fallos || 'h) se permitió un descuento de renglón sobre el envío'::text;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM aplicar_descuento_manual(v_t, v_envio, 'OVERRIDE_PRECIO', 0, 'CLIENTE_FRECUENTE', NULL,
              v_pin, v_maria, v_autorizo, NULL);
    v_fallos := v_fallos || 'h) se permitió cambiarle el precio al renglón de envío'::text;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_total <> 275.00 THEN
    v_fallos := v_fallos || format('h) el ticket quedó en %s tras los intentos (esperaba 275.00)', v_total);
  END IF;

  -- i) La redefinición en la 0116 conserva el search_path fijo que la 0044 les puso por ALTER
  --    FUNCTION (un CREATE OR REPLACE sin la cláusula se lo habría quitado en silencio).
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE proname IN ('aplicar_descuento_manual', 'evaluar_promociones_aplicables')
                AND pronamespace = 'public'::regnamespace
                AND NOT (COALESCE(proconfig, '{}') @> ARRAY['search_path=public, extensions, pg_temp'])) THEN
    v_fallos := v_fallos || 'i) aplicar_descuento_manual/evaluar_promociones_aplicables perdieron su search_path fijo'::text;
  END IF;

  IF cardinality(v_fallos) > 0 THEN
    RAISE EXCEPTION 'El envío entra al descuento por % camino(s): %', cardinality(v_fallos), array_to_string(v_fallos, ' | ');
  END IF;
  RAISE NOTICE 'OK el envío no admite descuentos ni promociones';
END $$;

-- 7) EL EXCEDENTE DE UN DESCUENTO CONGELADO NO SE COME EL ENVÍO (recalcular_totales_ticket, 0116).
--    El descuento o la promoción de ticket se congela como MONTO al aplicarse. Si después se cancela
--    comida (cancelar_item_ticket lo permite en ABIERTO), el monto congelado supera la comida que
--    queda; antes, recalcular_totales_ticket restaba el excedente del envío (solo topaba en 0). Ahora
--    el total no baja de los renglones de cargo vivos, el descuento reportado en el ticket es el que
--    se aplicó de verdad, y la invariante del timbrado se sostiene:
--      renglones vivos − (descuentos_manuales_mxn + promociones_mxn) = total_mxn
--    Control sin envío: el tope en 0 de siempre, con el descuento reportado sin tocar.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno  uuid;
  v_zona   uuid;
  v_auth   jsonb;
  v_pin    uuid;
  v_autorizo uuid;
  v_promo  uuid;
  v_t      uuid;
  v_h1     uuid;
  v_h2     uuid;
  v_tk     record;
  v_suma   numeric(12,2);
  v_fallos text[] := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE codigo_turno = 'SMOKE-ENV' AND tenant_id = v_tenant;

  -- Nombre nuevo: el archivo entero es UNA transacción.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Tope Norte', 35.00) RETURNING id INTO v_zona;

  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  v_auth := verificar_autorizacion_pin('4321', 'descuento_manual', 'descuento.manual_aplicar',
              'ticket', v_t, 240, 'CORTESIA_INVITADO', v_caja, v_turno, v_maria);
  IF (v_auth->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'autorización falló: %', v_auth; END IF;
  v_pin := (v_auth->>'autorizacion_pin_id')::uuid;
  v_autorizo := (v_auth->>'autorizo_id')::uuid;

  -- a) El caso de la revisión: $240 de comida (dos renglones de $120) + $35 de envío, cortesía
  --    total (congela 240), se cancela un platillo. Total 35.00, no 0.00.
  v_h1 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  v_h2 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'CORTESIA_TOTAL', 0, 'CORTESIA_INVITADO', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  PERFORM cancelar_item_ticket(v_h2, 'smoke tope', NULL);
  SELECT * INTO v_tk FROM tickets WHERE id = v_t;
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_t AND cancelado = false;
  IF v_tk.total_mxn <> 35.00 THEN
    v_fallos := v_fallos || format('a) cortesía + cancelar un platillo: total %s (esperaba 35.00, el envío)', v_tk.total_mxn);
  END IF;
  IF v_tk.descuentos_manuales_mxn <> 120.00 THEN
    v_fallos := v_fallos || format('a) descuento reportado %s (esperaba 120.00, lo que de verdad se aplicó)', v_tk.descuentos_manuales_mxn);
  END IF;
  IF v_suma - v_tk.descuentos_manuales_mxn - v_tk.promociones_mxn <> v_tk.total_mxn THEN
    v_fallos := v_fallos || format('a) invariante: renglones %s − descuento %s − promociones %s ≠ total %s',
                  v_suma, v_tk.descuentos_manuales_mxn, v_tk.promociones_mxn, v_tk.total_mxn);
  END IF;

  -- a2) Y si se cancela TODA la comida: queda el envío solo, sin descuento efectivo.
  PERFORM cancelar_item_ticket(v_h1, 'smoke tope', NULL);
  SELECT * INTO v_tk FROM tickets WHERE id = v_t;
  IF v_tk.total_mxn <> 35.00 OR v_tk.descuentos_manuales_mxn <> 0.00 THEN
    v_fallos := v_fallos || format('a2) sin comida: total %s y descuento %s (esperaba 35.00 y 0.00)',
                  v_tk.total_mxn, v_tk.descuentos_manuales_mxn);
  END IF;

  -- b) 50% de descuento sobre $360 de comida (congela 180) y se cancelan dos de tres platillos
  --    (más de la mitad): la comida que queda (120) se descuenta entera y el envío se cobra.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  v_h1 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  v_h2 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'PORCENTAJE', 50, 'CLIENTE_FRECUENTE', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  PERFORM cancelar_item_ticket(v_h1, 'smoke tope', NULL);
  PERFORM cancelar_item_ticket(v_h2, 'smoke tope', NULL);
  SELECT * INTO v_tk FROM tickets WHERE id = v_t;
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_t AND cancelado = false;
  IF v_tk.total_mxn <> 35.00 OR v_tk.descuentos_manuales_mxn <> 120.00 THEN
    v_fallos := v_fallos || format('b) 50%% + cancelar 2 de 3: total %s y descuento %s (esperaba 35.00 y 120.00)',
                  v_tk.total_mxn, v_tk.descuentos_manuales_mxn);
  END IF;
  IF v_suma - v_tk.descuentos_manuales_mxn - v_tk.promociones_mxn <> v_tk.total_mxn THEN
    v_fallos := v_fallos || format('b) invariante: renglones %s − descuento %s − promociones %s ≠ total %s',
                  v_suma, v_tk.descuentos_manuales_mxn, v_tk.promociones_mxn, v_tk.total_mxn);
  END IF;

  -- c) Lo mismo por el carril de las promociones: cortesía de ticket y se cancela un platillo.
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance)
  VALUES (v_tenant, 'SMOKE tope — cortesía', 'CORTESIA_TOTAL', 'TICKET_COMPLETO')
  RETURNING id INTO v_promo;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO', NULL, NULL, NULL, v_maria);
  v_h1 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM fijar_envio_ticket(v_t, v_zona);
  PERFORM aplicar_promocion(v_t, v_promo, NULL);
  PERFORM cancelar_item_ticket(v_h1, 'smoke tope', NULL);
  SELECT * INTO v_tk FROM tickets WHERE id = v_t;
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_t AND cancelado = false;
  IF v_tk.total_mxn <> 35.00 OR v_tk.promociones_mxn <> 120.00 THEN
    v_fallos := v_fallos || format('c) promo cortesía + cancelar un platillo: total %s y promociones %s (esperaba 35.00 y 120.00)',
                  v_tk.total_mxn, v_tk.promociones_mxn);
  END IF;
  IF v_suma - v_tk.descuentos_manuales_mxn - v_tk.promociones_mxn <> v_tk.total_mxn THEN
    v_fallos := v_fallos || format('c) invariante: renglones %s − descuento %s − promociones %s ≠ total %s',
                  v_suma, v_tk.descuentos_manuales_mxn, v_tk.promociones_mxn, v_tk.total_mxn);
  END IF;

  -- d) CONTROL sin envío: el comportamiento de siempre. Cortesía total sobre 240, se cancela un
  --    platillo: el total se topa en 0 y el descuento reportado sigue siendo el congelado (240).
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR', NULL, NULL, NULL, v_maria);
  v_h1 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM aplicar_descuento_manual(v_t, NULL, 'CORTESIA_TOTAL', 0, 'CORTESIA_INVITADO', NULL,
            v_pin, v_maria, v_autorizo, NULL);
  PERFORM cancelar_item_ticket(v_h1, 'smoke tope', NULL);
  SELECT * INTO v_tk FROM tickets WHERE id = v_t;
  IF v_tk.total_mxn <> 0.00 OR v_tk.descuentos_manuales_mxn <> 240.00 THEN
    v_fallos := v_fallos || format('d) control sin envío: total %s y descuento %s (esperaba 0.00 y 240.00, como siempre)',
                  v_tk.total_mxn, v_tk.descuentos_manuales_mxn);
  END IF;

  -- e) La redefinición conserva el search_path fijo que la 0044 le puso por ALTER FUNCTION.
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname = 'recalcular_totales_ticket'
                    AND pronamespace = 'public'::regnamespace
                    AND COALESCE(proconfig, '{}') @> ARRAY['search_path=public, extensions, pg_temp']) THEN
    v_fallos := v_fallos || 'e) recalcular_totales_ticket perdió su search_path fijo'::text;
  END IF;

  IF cardinality(v_fallos) > 0 THEN
    RAISE EXCEPTION 'El descuento congelado se come el envío: %', array_to_string(v_fallos, ' | ');
  END IF;
  RAISE NOTICE 'OK el excedente de un descuento congelado no se come el envío';
END $$;

ROLLBACK;
