-- Smoke tienda en línea (mig. 0162 §1): horario de la tienda, estado de una sucursal por modo
-- (el primer motivo que aplique) y los datos públicos del negocio.
-- Fechas SIEMPRE en hora de México con AT TIME ZONE, nunca CURRENT_DATE (en el CI es UTC).
-- Único caso que depende del reloj real: el 20, porque sucursal_recibe_pedidos usa now().
-- Uso: cd desktop && npm run smokes -- smoke_tienda_estado.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_otro  uuid := '62626262-0000-0000-0000-0000000000aa';
  v_suc_o uuid;
  v_zona  uuid;
  v_tz    text := 'America/Mexico_City';
  v_hoy   date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  -- 2026-10-05 es lunes: se verifica abajo con isodow, no se da por hecho.
  v_lun   timestamptz := '2026-10-05 14:00'::timestamp AT TIME ZONE 'America/Mexico_City';
  h_lun   jsonb := '{"1":["13:00","22:00"]}';
  h_vie   jsonb := '{"5":["18:00","02:00"]}';
  h_fix   jsonb := '{"1":["13:00","22:00"],"5":["18:00","02:00"]}';
  h_todo  jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_r     text;
  v_j     jsonb;
  v_p     jsonb;
  v_s     jsonb;
  v_estado tenant_estado;
BEGIN
  -- Los días que el smoke da por supuestos.
  IF EXTRACT(isodow FROM '2026-10-05'::date) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'fixture: 2026-10-05 no es lunes'; END IF;
  IF EXTRACT(isodow FROM '2026-10-09'::date) IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'fixture: 2026-10-09 no es viernes'; END IF;
  IF EXTRACT(isodow FROM '2026-10-11'::date) IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'fixture: 2026-10-11 no es domingo'; END IF;

  -- ── tienda_horario_abierto ────────────────────────────────────────────────
  IF tienda_horario_abierto(h_lun, '2026-10-05 14:00'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT TRUE THEN RAISE EXCEPTION '1: lunes 14:00 debe estar abierto'; END IF;
  IF tienda_horario_abierto(h_lun, '2026-10-05 12:59'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '2: lunes 12:59 debe estar cerrado'; END IF;
  IF tienda_horario_abierto(h_lun, '2026-10-05 22:00'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '3: el cierre no se incluye'; END IF;
  IF tienda_horario_abierto(h_lun, '2026-10-06 14:00'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '4: martes (ausente) debe estar cerrado'; END IF;
  IF tienda_horario_abierto(h_vie, '2026-10-09 23:30'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT TRUE THEN RAISE EXCEPTION '5: viernes 23:30 debe estar abierto'; END IF;
  IF tienda_horario_abierto(h_vie, '2026-10-10 01:30'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT TRUE THEN RAISE EXCEPTION '6: sábado 01:30 sigue el tramo del viernes'; END IF;
  IF tienda_horario_abierto(h_vie, '2026-10-10 02:00'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '7: sábado 02:00 ya cerró'; END IF;
  IF tienda_horario_abierto(h_vie, '2026-10-09 01:30'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '8: el jueves no abre'; END IF;
  IF tienda_horario_abierto('{"1":"siempre"}', v_lun, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '9: "siempre" es mal formado = cerrado'; END IF;
  IF tienda_horario_abierto('{"1":["25:00","x"]}', v_lun, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '9: horas inválidas = cerrado'; END IF;
  IF tienda_horario_abierto('{}', v_lun, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '9: {} = cerrado'; END IF;
  IF tienda_horario_abierto(NULL, v_lun, v_tz) IS NOT FALSE THEN RAISE EXCEPTION '9: NULL = cerrado'; END IF;
  IF tienda_horario_abierto('{"7":["00:00","00:00"]}', '2026-10-11 10:00'::timestamp AT TIME ZONE v_tz, v_tz) IS NOT TRUE THEN RAISE EXCEPTION '10: 00:00-00:00 es todo el día'; END IF;
  -- 29) Una zona horaria inválida (texto libre en sucursales/tenants) cuenta como cerrado y no revienta.
  IF tienda_horario_abierto(h_lun, v_lun, 'No/Existe') IS NOT FALSE THEN RAISE EXCEPTION '29: zona inválida = cerrado'; END IF;

  -- ── Fixture del negocio de la semilla ─────────────────────────────────────
  SELECT estado INTO v_estado FROM tenants WHERE id = v_t;
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, color, descripcion) VALUES (v_t, 'knockout-smoke', '#112233', 'Hamburguesas');
  -- Encender va DESPUÉS del complemento y de la configuración: la guarda de la 0163 lo exige.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_fix);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Centro', 35.00) RETURNING id INTO v_zona;
  UPDATE cajas SET espejo_turno_abierto_at = now() WHERE id = v_caja;

  -- ── tienda_estado_sucursal ────────────────────────────────────────────────
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS NOT NULL THEN RAISE EXCEPTION '11: RECOGER debía recibir, dio %', v_r; END IF;
  v_r := tienda_estado_sucursal(v_suc, 'DOMICILIO', v_lun);
  IF v_r IS NOT NULL THEN RAISE EXCEPTION '12: DOMICILIO debía recibir, dio %', v_r; END IF;

  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_t;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'TIENDA_NO_DISPONIBLE' THEN RAISE EXCEPTION '13: esperaba TIENDA_NO_DISPONIBLE, dio %', v_r; END IF;
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;

  UPDATE tienda_sucursales SET participa = false WHERE sucursal_id = v_suc;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'NO_PARTICIPA' THEN RAISE EXCEPTION '14: esperaba NO_PARTICIPA, dio %', v_r; END IF;
  UPDATE tienda_sucursales SET participa = true WHERE sucursal_id = v_suc;

  UPDATE tienda_sucursales SET domicilio = false WHERE sucursal_id = v_suc;
  v_r := tienda_estado_sucursal(v_suc, 'DOMICILIO', v_lun);
  IF v_r IS DISTINCT FROM 'MODO_NO_DISPONIBLE' THEN RAISE EXCEPTION '15: esperaba MODO_NO_DISPONIBLE, dio %', v_r; END IF;
  UPDATE tienda_sucursales SET domicilio = true WHERE sucursal_id = v_suc;

  UPDATE zonas_envio SET activa = false WHERE id = v_zona;
  v_r := tienda_estado_sucursal(v_suc, 'DOMICILIO', v_lun);
  IF v_r IS DISTINCT FROM 'MODO_NO_DISPONIBLE' THEN RAISE EXCEPTION '16: sin zonas activas esperaba MODO_NO_DISPONIBLE, dio %', v_r; END IF;
  UPDATE zonas_envio SET activa = true WHERE id = v_zona;

  UPDATE tienda_sucursales SET pausa_hasta = v_lun + interval '10 minutes' WHERE sucursal_id = v_suc;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'EN_PAUSA' THEN RAISE EXCEPTION '17: esperaba EN_PAUSA, dio %', v_r; END IF;
  UPDATE tienda_sucursales SET pausa_hasta = v_lun - interval '1 minute' WHERE sucursal_id = v_suc;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS NOT NULL THEN RAISE EXCEPTION '18: una pausa vencida no cuenta, dio %', v_r; END IF;
  UPDATE tienda_sucursales SET pausa_hasta = NULL WHERE sucursal_id = v_suc;

  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', '2026-10-05 23:00'::timestamp AT TIME ZONE v_tz);
  IF v_r IS DISTINCT FROM 'FUERA_DE_HORARIO' THEN RAISE EXCEPTION '19: esperaba FUERA_DE_HORARIO, dio %', v_r; END IF;

  -- 20) Horario que abre ahora todos los días y p_ahora = now(): solo falta la caja.
  UPDATE tienda_sucursales SET horario = h_todo WHERE sucursal_id = v_suc;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', now());
  IF v_r IS NOT NULL THEN RAISE EXCEPTION '20: con caja lista y horario abierto debía recibir, dio %', v_r; END IF;
  UPDATE cajas SET espejo_turno_abierto_at = NULL WHERE id = v_caja;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', now());
  IF v_r IS DISTINCT FROM 'CAJA_NO_LISTA' THEN RAISE EXCEPTION '20: esperaba CAJA_NO_LISTA, dio %', v_r; END IF;
  UPDATE cajas SET espejo_turno_abierto_at = now() WHERE id = v_caja;
  UPDATE tienda_sucursales SET horario = h_fix WHERE sucursal_id = v_suc;

  v_r := tienda_estado_sucursal(v_suc, 'MESA', v_lun);
  IF v_r IS DISTINCT FROM 'MODO_NO_DISPONIBLE' THEN RAISE EXCEPTION '21: esperaba MODO_NO_DISPONIBLE, dio %', v_r; END IF;

  -- 22) Sucursal de otro negocio que tiene la tienda pero no registró esta sucursal.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0162', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OT', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_otro, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_otro, 'otro-smoke');
  INSERT INTO configuracion_tenant (tenant_id, modulo_tienda_activo) VALUES (v_otro, true);
  v_r := tienda_estado_sucursal(v_suc_o, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'NO_PARTICIPA' THEN RAISE EXCEPTION '22: esperaba NO_PARTICIPA, dio %', v_r; END IF;

  -- ── tienda_negocio ────────────────────────────────────────────────────────
  v_j := tienda_negocio('knockout-smoke', v_lun);
  v_p := v_j -> 'publico';
  IF v_p IS NULL THEN RAISE EXCEPTION '23: tienda_negocio devolvió %', v_j; END IF;
  IF v_p ->> 'nombre' IS NULL OR v_p ->> 'color' IS DISTINCT FROM '#112233'
     OR (v_p ->> 'pago_efectivo')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '23: faltan nombre, color o pago_efectivo: %', v_p;
  END IF;
  IF jsonb_array_length(v_p -> 'sucursales') IS DISTINCT FROM 1 THEN RAISE EXCEPTION '23: esperaba una sucursal, dio %', v_p -> 'sucursales'; END IF;

  v_s := v_p -> 'sucursales' -> 0;
  IF (v_s ?& ARRAY['id', 'nombre', 'recoger', 'domicilio', 'horario', 'estado', 'zonas']) IS NOT TRUE THEN RAISE EXCEPTION '24: faltan claves en la sucursal: %', v_s; END IF;
  IF v_s ->> 'id' IS DISTINCT FROM v_suc::text THEN RAISE EXCEPTION '24: id de sucursal %', v_s ->> 'id'; END IF;
  IF (v_s -> 'estado' ? 'recoger' AND v_s -> 'estado' ? 'domicilio') IS NOT TRUE THEN RAISE EXCEPTION '24: faltan estado.recoger/domicilio: %', v_s -> 'estado'; END IF;
  IF jsonb_typeof(v_s -> 'estado' -> 'recoger') IS DISTINCT FROM 'null' THEN RAISE EXCEPTION '24: estado.recoger debía ser null: %', v_s -> 'estado'; END IF;
  IF jsonb_array_length(v_s -> 'zonas') IS DISTINCT FROM 1
     OR v_s -> 'zonas' -> 0 ->> 'id' IS DISTINCT FROM v_zona::text
     OR v_s -> 'zonas' -> 0 ->> 'nombre' IS DISTINCT FROM 'Centro'
     OR jsonb_typeof(v_s -> 'zonas' -> 0 -> 'costo_mxn') IS DISTINCT FROM 'string'
     OR v_s -> 'zonas' -> 0 ->> 'costo_mxn' IS DISTINCT FROM '35.00' THEN
    RAISE EXCEPTION '24: zonas mal: %', v_s -> 'zonas';
  END IF;

  IF tienda_negocio('no-existe') IS NOT NULL THEN RAISE EXCEPTION '25: un slug inexistente debe dar NULL'; END IF;

  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_t;
  IF tienda_negocio('knockout-smoke', v_lun) IS NOT NULL THEN RAISE EXCEPTION '26: sin el módulo debe dar NULL'; END IF;
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;

  UPDATE tenants SET deleted_at = now() WHERE id = v_t;
  IF tienda_negocio('knockout-smoke') IS NOT NULL THEN RAISE EXCEPTION '27: un negocio dado de baja debe dar NULL'; END IF;
  UPDATE tenants SET deleted_at = NULL WHERE id = v_t;

  -- 30) Negocio suspendido: ni se enseña ni recibe pedidos.
  UPDATE tenants SET estado = 'SUSPENDIDO' WHERE id = v_t;
  IF tienda_negocio('knockout-smoke', v_lun) IS NOT NULL THEN RAISE EXCEPTION '30: un negocio SUSPENDIDO debe dar NULL'; END IF;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'TIENDA_NO_DISPONIBLE' THEN RAISE EXCEPTION '30: SUSPENDIDO esperaba TIENDA_NO_DISPONIBLE, dio %', v_r; END IF;
  UPDATE tenants SET estado = v_estado WHERE id = v_t;

  -- 31) Bloqueo ya vigente (en el pasado respecto a p_ahora): igual.
  UPDATE tenants SET bloqueo_desde = v_lun - interval '1 day' WHERE id = v_t;
  IF tienda_negocio('knockout-smoke', v_lun) IS NOT NULL THEN RAISE EXCEPTION '31: un negocio bloqueado debe dar NULL'; END IF;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS DISTINCT FROM 'TIENDA_NO_DISPONIBLE' THEN RAISE EXCEPTION '31: bloqueado esperaba TIENDA_NO_DISPONIBLE, dio %', v_r; END IF;

  -- 32) Bloqueo programado a futuro: todavía vende.
  UPDATE tenants SET bloqueo_desde = v_lun + interval '1 day' WHERE id = v_t;
  IF tienda_negocio('knockout-smoke', v_lun) IS NULL THEN RAISE EXCEPTION '32: con bloqueo a futuro la tienda sigue disponible'; END IF;
  v_r := tienda_estado_sucursal(v_suc, 'RECOGER', v_lun);
  IF v_r IS NOT NULL THEN RAISE EXCEPTION '32: con bloqueo a futuro debía recibir, dio %', v_r; END IF;
  UPDATE tenants SET bloqueo_desde = NULL WHERE id = v_t;

  -- 28) El tenant_id viaja aparte para la función, nunca dentro de lo público.
  IF v_j ->> 'tenant_id' IS DISTINCT FROM v_t::text THEN RAISE EXCEPTION '28: falta tenant_id aparte: %', v_j; END IF;
  IF (v_p ? 'tenant_id') IS NOT FALSE THEN RAISE EXCEPTION '28: lo público no debe llevar tenant_id'; END IF;
  IF (v_s ? 'tenant_id') IS NOT FALSE OR (v_p::text LIKE '%' || v_t::text || '%') IS NOT FALSE THEN RAISE EXCEPTION '28: el tenant_id se coló en lo público'; END IF;

  RAISE NOTICE 'smoke_tienda_estado OK';
END $$;
ROLLBACK;
