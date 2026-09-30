-- 0140 · tres ajustes que encontró la revisión de regresiones de la auditoría integral (30/09/2026)
--
-- 1) aplicar_descuento_manual, MONTO_FIJO a nivel renglón: el POS autoriza el monto TOPADO en lo
--    que vale el renglón (previewDescuento), pero la RPC comparaba contra el valor capturado sin
--    tope. Desde la 0134 eso rechazaba un descuento fijo mayor que el renglón ("El monto (60.00)
--    pasa de lo autorizado (55.00)"), que antes se aplicaba. Se topa igual que a nivel ticket.
-- 2) _es_escritura_rest_directa (0133): reconoce '/rpc/' en cualquier posición de request.path.
--    Preventivo: con la configuración estándar de Supabase la ruta llega sin '/rest/v1', pero si
--    no fuera así, el guardián bloquearía TODAS las RPC del POS.
-- 3) verificar_autorizacion_pin: prefiere el negocio de la caja cuando el solicitante tiene acceso
--    a más de uno.
--
-- Las tres funciones parten de su definición vigente (pg_get_functiondef) y cambian solo eso.

CREATE OR REPLACE FUNCTION public.aplicar_descuento_manual(p_ticket_id uuid, p_ticket_item_id uuid, p_tipo descuento_manual_tipo, p_valor numeric, p_motivo_categoria descuento_manual_motivo, p_motivo_texto text, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id        uuid;
  v_descuento_id     uuid;
  v_monto_descontado numeric(12,2);
  v_base             numeric(12,2);
  v_porc             numeric(5,2);
  v_monto            numeric(12,2);
  v_precio_over      numeric(12,2);
  v_item             record;
  v_cargos           numeric(12,2) := 0;         -- 0116: el envío, que no se descuenta
  v_solicitante      uuid;
  v_autorizo         uuid;
  v_monto_autorizable numeric(12,2);
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_descuento_id FROM ticket_descuentos_manuales
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_descuento_id; END IF;
  END IF;

  -- 0116: el envío no admite descuentos (spec zonas de envío §3, ADR 0017). Descontar el renglón
  -- de envío directamente sería la puerta trasera de la regla. Quitarlo sí se puede: es quitar la
  -- zona del pedido (fijar_envio_ticket con zona NULL).
  IF p_ticket_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ticket_items WHERE id = p_ticket_item_id AND cargo_tipo IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El envío no admite descuentos: se cobra completo. Si no se va a cobrar, quita la zona del pedido.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 0116: a nivel ticket, la base del descuento es la comida. El envío se resta de la base.
  IF p_ticket_item_id IS NULL THEN
    SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
      FROM ticket_items
     WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;
  END IF;

  -- Calcular monto descontado según tipo
  IF p_tipo = 'PORCENTAJE' THEN
    v_porc := p_valor;
    -- Base de cálculo depende del alcance
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(subtotal_mxn + iva_mxn - promociones_mxn - v_cargos, 0) INTO v_base FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_base FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;
    v_monto_descontado := ROUND(v_base * v_porc / 100, 2);

  ELSIF p_tipo = 'MONTO_FIJO' THEN
    v_monto := p_valor;
    v_monto_descontado := v_monto;
    -- 0116: a nivel ticket, topado en la comida. Sin tope, un monto mayor que la comida quedaba
    -- registrado por encima de lo aplicable (recalcular_totales_ticket, redefinida al final de
    -- esta migración, ya no deja que se coma el envío, pero el registro debe decir la verdad).
    IF p_ticket_item_id IS NULL THEN
      SELECT LEAST(v_monto, GREATEST(total_mxn - v_cargos, 0)) INTO v_monto_descontado
        FROM tickets WHERE id = p_ticket_id;
    ELSE
      -- 0140: a nivel renglón, topado en lo que vale el renglón. Es lo que muestra la vista previa
      -- del POS (previewDescuento: Math.min(valor, base)) y por tanto lo que el supervisor
      -- autoriza; sin el tope, $60 sobre unas papas de $55 excedía la autorización de $55 (0134).
      SELECT LEAST(v_monto, GREATEST(total_item_mxn, 0)) INTO v_monto_descontado
        FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'CORTESIA_TOTAL' THEN
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(total_mxn - v_cargos, 0) INTO v_monto_descontado FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_monto_descontado FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    -- Para OVERRIDE_PRECIO: marcamos el ítem con precio_override y calculamos el delta
    v_precio_over := p_valor;
    SELECT * INTO v_item FROM ticket_items WHERE id = p_ticket_item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
    v_monto_descontado := GREATEST(0, (v_item.precio_unitario_snapshot - v_precio_over) * v_item.cantidad);

    -- Actualizar el ítem con override
    UPDATE ticket_items
    SET precio_override = true,
        precio_unitario_original_snapshot = precio_unitario_snapshot,
        autorizacion_pin_override_id = p_autorizacion_pin_id,
        precio_unitario_snapshot = v_precio_over
    WHERE id = p_ticket_item_id;
  END IF;

  -- 0134: la autorización es para ESTE descuento. El monto que se compara es el que el
  -- supervisor vio en la pantalla (previewDescuento): en % de ticket, sobre el total actual sin
  -- envío; en override de precio, total del renglón menos el valor capturado.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  IF p_tipo = 'PORCENTAJE' AND p_ticket_item_id IS NULL THEN
    SELECT ROUND(GREATEST(total_mxn - v_cargos, 0) * v_porc / 100, 2) INTO v_monto_autorizable
      FROM tickets WHERE id = p_ticket_id;
  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    v_monto_autorizable := GREATEST(0, v_item.total_item_mxn - v_precio_over);
  ELSE
    v_monto_autorizable := v_monto_descontado;
  END IF;
  v_autorizo := consumir_autorizacion(
    p_autorizacion_pin_id,
    CASE p_tipo
      WHEN 'CORTESIA_TOTAL'  THEN ARRAY['descuento.cortesia_total']
      -- El POS pide 'descuento.override_precio', que no existe en `permisos` (ver informe).
      WHEN 'OVERRIDE_PRECIO' THEN ARRAY['descuento.override_precio', 'descuento.manual_aplicar']
      ELSE ARRAY['descuento.manual_aplicar', 'descuento.cortesia_total']
    END,
    coalesce(p_ticket_item_id, p_ticket_id), v_monto_autorizable, p_ticket_id, false, v_tenant_id);

  -- Insertar registro del descuento
  INSERT INTO ticket_descuentos_manuales (
    tenant_id, ticket_id, ticket_item_id,
    tipo, valor_porcentaje, valor_monto_mxn, precio_override_mxn,
    monto_descontado_mxn,
    motivo_categoria, motivo_texto,
    autorizacion_pin_id,
    usuario_solicitante_id, usuario_autorizo_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_ticket_item_id,
    p_tipo,
    CASE WHEN p_tipo = 'PORCENTAJE'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'MONTO_FIJO'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'OVERRIDE_PRECIO' THEN p_valor ELSE NULL END,
    v_monto_descontado,
    p_motivo_categoria, p_motivo_texto,
    p_autorizacion_pin_id,
    v_solicitante, v_autorizo,
    p_client_id_local, v_solicitante
  ) RETURNING id INTO v_descuento_id;

  RETURN v_descuento_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._es_escritura_rest_directa()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(current_setting('request.path', true), '') <> ''
     -- 0140: '/rpc/' en cualquier posición, no solo al principio. PostgREST recibe la ruta ya sin
     -- el prefijo del gateway ('/rest/v1'); si algún despliegue lo conservara, con el prefijo fijo
     -- TODA RPC se tomaría por escritura directa y el POS no podría cobrar. Una ruta de tabla nunca
     -- contiene '/rpc/'.
     AND (position('/rpc/' in current_setting('request.path', true)) = 0
          OR current_setting('request.path', true) LIKE '%/rpc/graphql%')
     AND NOT coalesce((SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user), false);
$function$;

CREATE OR REPLACE FUNCTION public.verificar_autorizacion_pin(p_pin text, p_accion text, p_permiso_codigo text, p_entidad_tipo text, p_entidad_id uuid, p_monto numeric, p_motivo text, p_caja_id uuid, p_turno_id uuid, p_usuario_solicitante_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant        uuid;
  v_autorizador   uuid;
  v_fallidos      integer;
  v_fallidos_ten  integer;
  v_fallidos_sol  integer;
  v_fallidos_hora integer;
  v_jerarquia_min integer;
  v_autorizacion  uuid;
BEGIN
  -- Tenant del solicitante (cajero)
  SELECT tenant_id INTO v_tenant
    FROM usuarios_acceso
   WHERE usuario_id = p_usuario_solicitante_id AND activo = true
   -- 0140: con acceso a dos negocios, el de la caja desde la que se pide (antes, uno cualquiera;
   -- desde la 0134 la autorización además tiene que ser del negocio de quien la consume).
   ORDER BY (tenant_id = (SELECT c.tenant_id FROM cajas c WHERE c.id = p_caja_id)) DESC NULLS LAST
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SOLICITANTE_SIN_TENANT');
  END IF;

  -- SEC CN-011 (1) — la caja tiene que ser real y del tenant.
  IF NOT EXISTS (SELECT 1 FROM cajas WHERE id = p_caja_id AND tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CAJA_INVALIDA');
  END IF;

  -- Anti-fuerza-bruta: 6 intentos fallidos por caja en 5 min -> bloqueo temporal
  SELECT count(*) INTO v_fallidos
    FROM pin_intentos
   WHERE caja_id = p_caja_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos >= 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- SEC CN-011 (2) — techo por tenant.
  SELECT count(*) INTO v_fallidos_ten
    FROM pin_intentos
   WHERE tenant_id = v_tenant AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos_ten >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- 0132 (A7) — techo por SOLICITANTE, en ventana corta y en ventana larga. Los fallos de
  -- autorización se registran con usuario_id = solicitante (antes iba NULL).
  SELECT count(*) FILTER (WHERE fecha_intento > now() - interval '5 minutes'),
         count(*)
    INTO v_fallidos_sol, v_fallidos_hora
    FROM pin_intentos
   WHERE usuario_id = p_usuario_solicitante_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '1 hour';
  IF v_fallidos_sol >= 6 OR v_fallidos_hora >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  SELECT jerarquia_minima_pin INTO v_jerarquia_min FROM permisos WHERE codigo = p_permiso_codigo;

  -- Buscar autorizador: usuario del tenant cuyo PIN coincide Y que tiene el permiso con la regla
  -- completa (overrides del negocio y permisos personalizados incluidos).
  SELECT up.id INTO v_autorizador
    FROM usuarios_perfil up
   WHERE up.pin_hash IS NOT NULL
     AND up.estado = 'ACTIVO'
     AND EXISTS (SELECT 1 FROM usuarios_acceso ua
                  WHERE ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true)
     AND crypt(p_pin, up.pin_hash) = up.pin_hash
     AND public.usuario_tiene_permiso_en_tenant(up.id, v_tenant, p_permiso_codigo, v_jerarquia_min)
   LIMIT 1;

  IF v_autorizador IS NULL THEN
    INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (v_tenant, p_usuario_solicitante_id, p_caja_id, false, 'AUTORIZACION');
    -- Antes: 'SIN_PERMISO' si el PIN era de alguien sin el permiso. Eso confirmaba al atacante
    -- que había dado con un PIN real del equipo. Misma respuesta en los dos casos.
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO');
  END IF;

  -- Registrar la autorización
  INSERT INTO autorizaciones_pin(
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo
  )
  SELECT v_tenant, (SELECT sucursal_id FROM cajas WHERE id = p_caja_id), p_caja_id, p_turno_id,
         p_usuario_solicitante_id, v_autorizador,
         p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo
  RETURNING id INTO v_autorizacion;

  INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso)
  VALUES (v_tenant, v_autorizador, p_caja_id, true);

  RETURN jsonb_build_object('ok', true, 'autorizacion_pin_id', v_autorizacion, 'autorizo_id', v_autorizador);
END;
$function$;
