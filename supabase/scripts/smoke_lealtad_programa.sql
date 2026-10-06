-- Smoke lealtad · programa (0156 §7). Cambiar de mecánica reinicia saldos solo con confirmación;
-- el ajuste manual exige motivo y no deja el saldo en negativo; los parámetros se validan con
-- mensajes claros; el vencimiento se calcula y se aplica en hora de México (un saldo que vence el
-- 31 de marzo sigue vivo a las 23:30 de México de ese día, aunque en UTC ya sea abril); nada vence
-- con el módulo apagado; una fila que falla no tumba el proceso de las demás; un canje sin ticket
-- pagado a las 48 h se devuelve y uno que cuelga de un ticket pagado, no. Hace ROLLBACK.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_lealtad_programa.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_cli uuid; v_cli2 uuid; v_cli3 uuid; v_dani uuid; v_fabi uuid; v_fran uuid; v_gus uuid; v_eli uuid; v_ver integer; j jsonb; v_canje uuid := gen_random_uuid();
  v_canje_pagado uuid := gen_random_uuid(); v_turno uuid; v_prod uuid; v_t uuid; v_total numeric; v_saldo3 integer;
  p lealtad_programa%ROWTYPE;
  -- Una hora fija: 31 de marzo de 2027, 23:30 en México (ya es 1 de abril en UTC).
  v_ahora timestamptz := timestamptz '2027-04-01 05:30:00+00';
BEGIN
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Programa', '4770001564') RETURNING id INTO v_cli;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Beto Programa', '4770001565') RETURNING id INTO v_cli2;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Caro Programa', '4770001566') RETURNING id INTO v_cli3;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Dani Programa', '4770001567') RETURNING id INTO v_dani;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Fabi Programa', '4770001568') RETURNING id INTO v_fabi;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Fran Programa', '4770001569') RETURNING id INTO v_fran;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Gus Programa', '4770001570') RETURNING id INTO v_gus;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Eli Programa', '4770001571') RETURNING id INTO v_eli;

  -- Como el dueño (las RPC del admin leen current_tenant_id() y auth.uid()).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);

  -- 1) Alta del programa. La semilla no trae fila de configuracion_tenant: se crea ya encendida
  --    (el add-on y el programa, antes; un trigger lo exige).
  j := lealtad_guardar_programa('PUNTOS_DINERO', 5, NULL, 0, 6, 3);
  IF NOT (j->>'ok')::boolean OR (j->>'version')::int <> 1 THEN RAISE EXCEPTION 'alta: %', j; END IF;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;

  -- 1b) Un parámetro inválido se rechaza con un mensaje claro (22023), no con un CHECK crudo, y
  --     no toca el programa.
  BEGIN
    PERFORM lealtad_guardar_programa('PUNTOS_DINERO', NULL, NULL, 0, 6, 3);
    RAISE EXCEPTION 'aceptó PUNTOS_DINERO sin porcentaje';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%porcentaje%' THEN RAISE EXCEPTION 'el mensaje no habla del porcentaje: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM lealtad_guardar_programa('PUNTOS_DINERO', 5, NULL, 0, 61, 3);
    RAISE EXCEPTION 'aceptó un vencimiento de 61 meses';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%vencimiento%' THEN RAISE EXCEPTION 'el mensaje no habla del vencimiento: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM lealtad_guardar_programa('PUNTOS_DINERO', 0.004, NULL, 0, 6, 3);
    RAISE EXCEPTION 'aceptó un porcentaje de 0.004 (que la columna redondea a 0)';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%porcentaje%' THEN RAISE EXCEPTION 'el mensaje de 0.004 no habla del porcentaje: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM lealtad_guardar_programa('PUNTOS_DINERO', 5, NULL, 99999999999, 6, 3);
    RAISE EXCEPTION 'aceptó una compra mínima que no cabe en la columna';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%compra mínima%' THEN RAISE EXCEPTION 'el mensaje no habla de la compra mínima: %', SQLERRM; END IF;
  END;
  SELECT * INTO p FROM lealtad_programa WHERE tenant_id = v_tenant;
  IF p.version <> 1 OR p.porcentaje <> 5 OR p.vencimiento_meses <> 6 THEN RAISE EXCEPTION 'un rechazo tocó el programa'; END IF;

  -- 2) Ajuste manual: exige motivo y deja rastro con el usuario.
  BEGIN
    PERFORM lealtad_ajustar_saldo(v_cli, 50, '  ');
    RAISE EXCEPTION 'aceptó un ajuste sin motivo';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  IF lealtad_ajustar_saldo(v_cli, 50, 'Compensación por un error') <> 50 THEN RAISE EXCEPTION 'ajuste no dejó 50'; END IF;
  IF (SELECT usuario_id FROM lealtad_movimientos WHERE cliente_id = v_cli AND tipo = 'AJUSTE') <> v_dueno THEN RAISE EXCEPTION 'el ajuste no quedó firmado'; END IF;
  PERFORM lealtad_ajustar_saldo(v_cli2, 20, 'Bienvenida');

  -- 2b) Cota del ajuste: ni negativo (Fabi no tiene saldo), ni descomunal; bajar justo a cero sí.
  BEGIN
    PERFORM lealtad_ajustar_saldo(v_fabi, -1, 'Prueba');
    RAISE EXCEPTION 'aceptó dejar un saldo de 0 en -1';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%negativo%' THEN RAISE EXCEPTION 'mensaje del negativo: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM lealtad_ajustar_saldo(v_fabi, 100001, 'Prueba');
    RAISE EXCEPTION 'aceptó un ajuste de 100001 puntos';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%100,000%' THEN RAISE EXCEPTION 'mensaje del tope: %', SQLERRM; END IF;
  END;
  IF lealtad_ajustar_saldo(v_fabi, 10, 'Bienvenida') <> 10 THEN RAISE EXCEPTION 'ajuste a 10'; END IF;
  BEGIN
    PERFORM lealtad_ajustar_saldo(v_fabi, -11, 'Prueba');
    RAISE EXCEPTION 'aceptó dejar un saldo de 10 en -1';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  IF lealtad_ajustar_saldo(v_fabi, -10, 'Corrección') <> 0 THEN RAISE EXCEPTION 'bajar justo a cero debe aceptarse'; END IF;

  -- 3) Cambiar parámetros sin cambiar de mecánica no reinicia nada. Lo que no aplica a la mecánica
  --    (aquí pesos_por_punto) se guarda como NULL.
  j := lealtad_guardar_programa('PUNTOS_DINERO', 8, 10, 50, 6, 3);
  IF (j->>'version')::int <> 1 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 50 THEN RAISE EXCEPTION 'un cambio de parámetros tocó los saldos: %', j; END IF;
  SELECT * INTO p FROM lealtad_programa WHERE tenant_id = v_tenant;
  IF p.porcentaje <> 8 OR p.compra_minima_mxn <> 50 THEN RAISE EXCEPTION 'los parámetros no se guardaron'; END IF;
  IF p.pesos_por_punto IS NOT NULL THEN RAISE EXCEPTION 'pesos_por_punto no aplica a PUNTOS_DINERO y debía quedar NULL'; END IF;

  -- 4) Cambiar de mecánica sin confirmar: se niega y dice a cuántos afecta.
  j := lealtad_guardar_programa('SELLOS', NULL, NULL, 0, 6, 3);
  IF (j->>'ok')::boolean OR j->>'error' <> 'REQUIERE_CONFIRMAR_REINICIO' OR (j->>'clientes_con_saldo')::int <> 2 THEN RAISE EXCEPTION 'debió pedir confirmación: %', j; END IF;
  IF (SELECT mecanica FROM lealtad_programa WHERE tenant_id = v_tenant) <> 'PUNTOS_DINERO' THEN RAISE EXCEPTION 'cambió sin confirmar'; END IF;

  -- 5) Confirmando: saldos en cero, versión nueva, y el libro lo explica.
  j := lealtad_guardar_programa('SELLOS', 99, 99, 0, 6, 3, true);
  IF NOT (j->>'ok')::boolean OR (j->>'version')::int <> 2 OR (j->>'clientes_reiniciados')::int <> 2 THEN RAISE EXCEPTION 'reinicio: %', j; END IF;
  IF (SELECT SUM(saldo) FROM lealtad_saldos WHERE tenant_id = v_tenant) <> 0 THEN RAISE EXCEPTION 'quedaron saldos vivos'; END IF;
  IF (SELECT count(*) FROM lealtad_movimientos WHERE tenant_id = v_tenant AND tipo = 'AJUSTE' AND motivo LIKE 'Cambio de mecánica%') <> 2 THEN RAISE EXCEPTION 'el reinicio no quedó en el libro'; END IF;
  SELECT * INTO p FROM lealtad_programa WHERE tenant_id = v_tenant;
  IF p.porcentaje IS NOT NULL OR p.pesos_por_punto IS NOT NULL THEN RAISE EXCEPTION 'SELLOS no usa porcentaje ni pesos_por_punto y debían quedar NULL'; END IF;

  -- 6) Un movimiento que llega de la versión anterior se registra y no suma.
  -- De aquí en adelante, sin sesión de usuario (como el proceso de la nube).
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli, 'GANADO', 30, 1);
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 0 THEN RAISE EXCEPTION 'un movimiento de versión vieja sumó'; END IF;

  -- 7) Vencimiento en hora de México. Ana: actividad hace 6 meses y un día; Beto: hace 5 meses.
  SELECT version INTO v_ver FROM lealtad_programa WHERE tenant_id = v_tenant;
  UPDATE lealtad_programa SET encendido_desde = NULL WHERE tenant_id = v_tenant;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli,  'GANADO', 4, v_ver, p_fecha => timestamptz '2026-09-30 18:00:00+00');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli2, 'GANADO', 3, v_ver, p_fecha => timestamptz '2026-11-01 18:00:00+00');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_dani, 'GANADO', 5, v_ver, p_fecha => timestamptz '2026-09-30 18:00:00+00');
  IF (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_cli) <> date '2027-03-30' THEN RAISE EXCEPTION 'vence_el mal calculado: %', (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_cli); END IF;

  -- 7a) Con el módulo apagado nada vence.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'vencidos')::int <> 0 THEN RAISE EXCEPTION 'vencidos con el módulo apagado: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 4 THEN RAISE EXCEPTION 'venció con el módulo apagado'; END IF;

  -- 7b) Encendido: vence Ana, no Beto. Encender mueve encendido_desde a "ahora" (eso se prueba
  --     aparte); aquí se vuelve a NULL y se recalculan las fechas para probar solo el vencimiento.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;
  UPDATE lealtad_programa SET encendido_desde = NULL WHERE tenant_id = v_tenant;
  UPDATE lealtad_saldos SET vence_el = lealtad_vence_el(tenant_id, ultima_actividad) WHERE tenant_id = v_tenant;
  -- Dani vence EXACTAMENTE el 31 de marzo: a las 23:30 de México de ese día aún no vence (en UTC ya
  -- es 1 de abril y vencería). Ana (30 de marzo) sí; Beto (1 de mayo) no.
  UPDATE lealtad_saldos SET vence_el = date '2027-03-31' WHERE cliente_id = v_dani;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'vencidos')::int <> 1 OR (j->>'errores')::int <> 0 THEN RAISE EXCEPTION 'vencidos: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 0 THEN RAISE EXCEPTION 'Ana no venció'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> 3 THEN RAISE EXCEPTION 'Beto venció antes de tiempo'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_dani) <> 5 THEN RAISE EXCEPTION 'Dani venció el mismo día de su fecha (¿se usó UTC?)'; END IF;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'vencidos')::int <> 0 THEN RAISE EXCEPTION 'venció dos veces'; END IF;
  -- 24 horas después ya es 1 de abril en México: Dani vence.
  j := lealtad_proceso_diario(v_ahora + interval '24 hours');
  IF (j->>'vencidos')::int <> 1 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_dani) <> 0 THEN RAISE EXCEPTION 'Dani no venció al día siguiente: %', j; END IF;

  -- 8) Red de seguridad: un canje de hace 49 h sin ticket pagado se devuelve; uno de 47 h, no.
  PERFORM lealtad_registrar_movimiento(v_canje, v_tenant, v_cli2, 'CANJE', -2, v_ver, p_fecha => v_ahora - interval '49 hours');
  PERFORM lealtad_registrar_movimiento(NULL,    v_tenant, v_cli2, 'CANJE', -1, v_ver, p_fecha => v_ahora - interval '47 hours');

  -- 8b) Un canje de la misma edad que cuelga de un ticket PAGADO no se toca: el cliente ya se llevó
  --     el descuento. Se arma una cuenta abierta con su canje y se cobra (aplicar_pago lee al empleado
  --     del JWT).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LPRG', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli3, NULL, 'smoke-lprg-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lprg-1-i');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli3, 'GANADO', 50, v_ver, p_fecha => v_ahora - interval '100 hours');
  PERFORM lealtad_registrar_movimiento(v_canje_pagado, v_tenant, v_cli3, 'CANJE', -20, v_ver, p_ticket => v_t, p_fecha => v_ahora - interval '49 hours');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (v_canje_pagado, v_tenant, v_t, v_cli3, 20, 20);
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t;
  IF v_total <> 100 THEN RAISE EXCEPTION 'total con canje % (esperado 100)', v_total; END IF;
  PERFORM aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, v_total, v_total);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t) <> 'PAGADO' THEN RAISE EXCEPTION 'el ticket no quedó PAGADO'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT saldo INTO v_saldo3 FROM lealtad_saldos WHERE cliente_id = v_cli3;

  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'canjes_revertidos')::int <> 1 THEN RAISE EXCEPTION 'canjes revertidos: % (solo el de 49 h sin ticket)', j; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE canje_movimiento_id = v_canje_pagado) THEN RAISE EXCEPTION 'la red revirtió un canje de un ticket pagado'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli3) <> v_saldo3 THEN RAISE EXCEPTION 'el saldo del ticket pagado se movió'; END IF;
  IF NOT EXISTS (SELECT 1 FROM lealtad_movimientos WHERE canje_movimiento_id = v_canje AND tipo = 'REVERSA_CANJE') THEN RAISE EXCEPTION 'el canje de 49 h sin ticket no se revirtió'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> 2 THEN RAISE EXCEPTION 'saldo de Beto tras la red: %', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2); END IF;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'canjes_revertidos')::int <> 0 THEN RAISE EXCEPTION 'la red revirtió dos veces: %', j; END IF;

  -- 8c) Una fila que falla no tumba a las demás. Fran y Gus vencieron hace meses; una restricción
  --     (solo dentro de esta transacción) impide el VENCIMIENTO de Fran. El proceso cuenta el error,
  --     vence a Gus y deja a Fran con su saldo; sin la restricción, la corrida siguiente lo vence.
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_fran, 'GANADO', 7, v_ver, p_fecha => timestamptz '2026-06-01 18:00:00+00');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_gus,  'GANADO', 8, v_ver, p_fecha => timestamptz '2026-06-01 18:00:00+00');
  EXECUTE format('ALTER TABLE lealtad_movimientos ADD CONSTRAINT smoke_rompe CHECK (tipo <> ''VENCIMIENTO'' OR cliente_id <> %L) NOT VALID', v_fran);
  j := lealtad_proceso_diario(v_ahora);
  ALTER TABLE lealtad_movimientos DROP CONSTRAINT smoke_rompe;
  IF (j->>'errores')::int <> 1 OR (j->>'vencidos')::int <> 1 THEN RAISE EXCEPTION 'una fila rota debía dar errores=1 y vencidos=1: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_gus) <> 0 THEN RAISE EXCEPTION 'Gus no venció por la falla de Fran'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_fran) <> 7 THEN RAISE EXCEPTION 'Fran perdió su saldo a pesar de la falla'; END IF;
  j := lealtad_proceso_diario(v_ahora);
  IF (j->>'errores')::int <> 0 OR (j->>'vencidos')::int <> 1 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_fran) <> 0 THEN RAISE EXCEPTION 'Fran debía vencer en la corrida siguiente: %', j; END IF;

  -- 9) El cálculo de vence_el cruza la medianoche en hora de México: 3:00 UTC del 1 de octubre es
  --    todavía el 30 de septiembre en México, y seis meses después es el 30 de marzo (no el 1 de abril).
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_eli, 'GANADO', 1, v_ver, p_fecha => timestamptz '2026-10-01 03:00:00+00');
  IF (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_eli) <> date '2027-03-30' THEN
    RAISE EXCEPTION 'vence_el de una compra a las 3:00 UTC: % (esperado 2027-03-30, hora de México)', (SELECT vence_el FROM lealtad_saldos WHERE cliente_id = v_eli);
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD PROGRAMA OK';
END $$;
ROLLBACK;
