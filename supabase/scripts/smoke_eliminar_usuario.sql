-- Smoke de la 0154: eliminar a un empleado libera su correo y conserva el historial.
-- Activo, dueño o uno mismo se rechazan; ya desactivado, la cuenta se vacía (correo de relleno,
-- sin PIN ni teléfono), el nombre queda marcado, el turno que abrió sigue apuntando a ella, queda
-- el evento de auditoría, no se puede reactivar y el correo viejo ya no encuentra a nadie.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_ex     uuid := '99999999-0000-0000-0000-00000000e11a';
  v_correo text := 'renuncio@smoke.dev';
  v_turno  uuid; v_res jsonb; v_n integer; v_txt text; v_p usuarios_perfil%ROWTYPE;
BEGIN
  -- Solo service_role.
  IF has_function_privilege('authenticated', 'eliminar_usuario(uuid,uuid,uuid,text,text,inet)', 'execute')
     OR has_function_privilege('anon', 'eliminar_usuario(uuid,uuid,uuid,text,text,inet)', 'execute')
     OR has_function_privilege('authenticated', 'usuario_por_correo(text,uuid)', 'execute') THEN
    RAISE EXCEPTION 'eliminar_usuario / usuario_por_correo no deben poder llamarse desde el navegador';
  END IF;

  -- Una empleada con historial: abrió un turno.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', v_ex, 'authenticated', 'authenticated', v_correo,
          crypt('x', gen_salt('bf')), now(), '{"nombre":"Renata Smoke"}');
  INSERT INTO usuarios_perfil (id, nombre, telefono, pin_hash, estado)
  VALUES (v_ex, 'Renata Smoke', '4770000000', crypt('4321', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (v_ex, v_tenant, v_suc, (SELECT id FROM roles WHERE codigo = 'CAJERO' AND es_sistema));

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-EU', (now() AT TIME ZONE 'America/Mexico_City')::date, v_ex, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- 1) Sigue activa: no.
  BEGIN
    PERFORM eliminar_usuario(v_ex, v_tenant, v_dueno, 'NEGOCIO');
    RAISE EXCEPTION 'eliminar a un usuario activo debía rechazarse';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'SIGUE_ACTIVO:%' THEN RAISE; END IF;
  END;

  -- 2) Al dueño, nunca. 3) A uno mismo, tampoco. 4) Un cajero no elimina a nadie.
  BEGIN
    PERFORM eliminar_usuario(v_dueno, v_tenant, v_dueno, 'NEGOCIO');
    RAISE EXCEPTION 'eliminar al dueño debía rechazarse';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ES_UNO_MISMO:%' AND SQLERRM NOT LIKE 'ES_DUENO:%' THEN RAISE; END IF;
  END;
  IF NOT (_eliminar_usuario_bloqueos(v_dueno, v_tenant, v_maria) @> '[{"codigo":"ES_DUENO"}]') THEN
    RAISE EXCEPTION 'el dueño debía salir bloqueado por ES_DUENO';
  END IF;
  BEGIN
    PERFORM eliminar_usuario(v_ex, v_tenant, v_maria, 'NEGOCIO');
    RAISE EXCEPTION 'un cajero no debía poder eliminar';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'SIN_PERMISO:%' THEN RAISE; END IF;
  END;

  -- Antes de eliminar, el panel la encuentra por su correo y dice por qué no se puede.
  v_res := usuario_por_correo('  RENUNCIO@smoke.dev ', v_dueno);
  IF NOT (v_res ->> 'encontrado')::boolean OR (v_res ->> 'puede_eliminar')::boolean
     OR NOT (v_res -> 'bloqueos' @> '[{"codigo":"SIGUE_ACTIVO"}]') THEN
    RAISE EXCEPTION 'usuario_por_correo (activa) inesperado: %', v_res;
  END IF;

  -- 5) Desactivada: se elimina.
  UPDATE usuarios_acceso SET activo = false WHERE usuario_id = v_ex;
  UPDATE usuarios_perfil SET estado = 'DESACTIVADO' WHERE id = v_ex;
  v_res := eliminar_usuario(v_ex, v_tenant, v_dueno, 'NEGOCIO');
  IF NOT (v_res ->> 'ok')::boolean OR (v_res ->> 'ya_eliminado')::boolean THEN
    RAISE EXCEPTION 'eliminar_usuario inesperado: %', v_res;
  END IF;

  SELECT email INTO v_txt FROM auth.users WHERE id = v_ex;
  IF v_txt <> 'eliminado-' || v_ex || '@eliminados.vimpos.com.mx' THEN RAISE EXCEPTION 'el correo no se liberó: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE lower(email) = v_correo;
  IF v_n <> 0 THEN RAISE EXCEPTION 'el correo real sigue ocupado'; END IF;
  SELECT raw_user_meta_data::text || '|' || encrypted_password INTO v_txt FROM auth.users WHERE id = v_ex;
  IF v_txt <> '{}|' THEN RAISE EXCEPTION 'quedaron metadatos o contraseña: %', v_txt; END IF;

  SELECT * INTO v_p FROM usuarios_perfil WHERE id = v_ex;
  IF v_p.nombre <> 'Renata Smoke (cuenta eliminada)' THEN RAISE EXCEPTION 'nombre inesperado: %', v_p.nombre; END IF;
  IF v_p.pin_hash IS NOT NULL OR v_p.telefono IS NOT NULL OR v_p.deleted_at IS NULL OR v_p.estado <> 'DESACTIVADO' THEN
    RAISE EXCEPTION 'la ficha conserva datos personales o no quedó marcada';
  END IF;

  -- El historial del negocio no se tocó, y la fila de acceso sigue (por ella baja a la caja).
  IF (SELECT usuario_apertura_id FROM turnos WHERE id = v_turno) IS DISTINCT FROM v_ex THEN
    RAISE EXCEPTION 'el turno perdió a quien lo abrió';
  END IF;
  SELECT count(*) INTO v_n FROM usuarios_acceso WHERE usuario_id = v_ex AND tenant_id = v_tenant AND NOT activo;
  IF v_n <> 1 THEN RAISE EXCEPTION 'la fila de acceso debía quedarse, inactiva'; END IF;

  -- El rastro: quién, a quién, sin el correo.
  SELECT payload::text INTO v_txt FROM auditoria_eventos
   WHERE tenant_id = v_tenant AND evento_codigo = 'usuario.eliminar' AND entidad_id = v_ex AND usuario_id = v_dueno;
  IF v_txt IS NULL THEN RAISE EXCEPTION 'falta el evento de auditoría'; END IF;
  IF v_txt ILIKE '%' || v_correo || '%' THEN RAISE EXCEPTION 'la auditoría guardó el correo'; END IF;

  -- 6) Segundo clic: no hace nada y no falla.
  v_res := eliminar_usuario(v_ex, v_tenant, v_dueno, 'NEGOCIO');
  IF NOT (v_res ->> 'ya_eliminado')::boolean THEN RAISE EXCEPTION 'la segunda llamada debía ser un no-op'; END IF;
  SELECT nombre INTO v_txt FROM usuarios_perfil WHERE id = v_ex;
  IF v_txt <> 'Renata Smoke (cuenta eliminada)' THEN RAISE EXCEPTION 'la marca se repitió: %', v_txt; END IF;

  -- 7) No se reactiva.
  BEGIN
    UPDATE usuarios_acceso SET activo = true WHERE usuario_id = v_ex;
    RAISE EXCEPTION 'reactivar a un eliminado debía rechazarse';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 8) El correo quedó libre: ya no encuentra a nadie y se puede registrar de nuevo.
  v_res := usuario_por_correo(v_correo, v_dueno);
  IF (v_res ->> 'encontrado')::boolean THEN RAISE EXCEPTION 'el correo liberado sigue encontrando una cuenta'; END IF;
  INSERT INTO auth.users (instance_id, id, aud, role, email)
  VALUES ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-00000000e11b', 'authenticated', 'authenticated', v_correo);

  -- 9) Desde plataforma: exige motivo y deja bitácora.
  INSERT INTO auth.users (instance_id, id, aud, role, email)
  VALUES ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-00000000e11c', 'authenticated', 'authenticated', 'otra@smoke.dev');
  INSERT INTO usuarios_perfil (id, nombre, estado) VALUES ('99999999-0000-0000-0000-00000000e11c', 'Otra Smoke', 'DESACTIVADO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id, activo)
  VALUES ('99999999-0000-0000-0000-00000000e11c', v_tenant, v_suc, (SELECT id FROM roles WHERE codigo = 'CAJERO' AND es_sistema), false);
  BEGIN
    PERFORM eliminar_usuario('99999999-0000-0000-0000-00000000e11c', v_tenant, v_dueno, 'PLATAFORMA', 'corto');
    RAISE EXCEPTION 'desde plataforma sin motivo debía rechazarse';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'MOTIVO_REQUERIDO:%' THEN RAISE; END IF;
  END;
  v_res := usuario_por_correo('otra@smoke.dev', v_dueno);
  IF NOT (v_res ->> 'puede_eliminar')::boolean OR (v_res ->> 'tenant_id')::uuid <> v_tenant THEN
    RAISE EXCEPTION 'usuario_por_correo (desactivada) inesperado: %', v_res;
  END IF;
  PERFORM eliminar_usuario('99999999-0000-0000-0000-00000000e11c', v_tenant, v_dueno, 'PLATAFORMA', 'Pidió liberar su correo por WhatsApp');
  SELECT count(*) INTO v_n FROM super_admin_accesos
   WHERE accion = 'usuario.eliminar' AND tenant_id = v_tenant AND super_admin_id = v_dueno;
  IF v_n <> 1 THEN RAISE EXCEPTION 'falta la bitácora de plataforma'; END IF;

  RAISE NOTICE 'smoke_eliminar_usuario OK';
END $$;
ROLLBACK;
