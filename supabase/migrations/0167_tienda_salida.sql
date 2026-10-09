-- ============================================================================
-- 0167 — Tienda en línea, entrega 7: la salida, en la base.
-- Plan: docs/superpowers/plans/2026-10-09-tienda-en-linea-7-salida.md
--
-- REGLA DE ORO: aplicar esta migración NO enciende ni concede nada. El complemento TIENDA sigue
-- inactivo (addons.activo = false) y, mientras lo esté, las altas y los cambios de plan hacen
-- exactamente lo de antes. Lo único que lo cambia es tienda_encender_complemento() (§1), que no la
-- llama nadie: se ejecuta a mano, con el visto bueno de Fermín.
--
--   §1 El encendido empaquetado: la sincronización de planes aprende la pareja de la tienda (y la
--      ignora con el complemento inactivo) y tienda_encender_complemento().
--   §2 `pedir` sin duplicados: tienda_crear_pedido gana p_clave.
--   §3 «Ya lo tengo»: tienda_reportar_estado acepta EN_PREPARACION, y delivery_marcar_expirados
--      cancela lo que una caja aceptó y en 15 minutos no tomó.
--   §4 Retención: las notas del pedido en línea, las filas atascadas, y el barrido de sesiones y
--      enlaces de recuperación vencidos.
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.*.
-- ============================================================================

-- ── §1 El encendido empaquetado ──────────────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0159_lealtad_admin.sql. Cambia una cosa: la lista gana la pareja
-- ('TIENDA', 'tienda_incluida') —en femenino, no como las otras tres— y esa pareja SOLO actúa con
-- el complemento activo en el catálogo. Inactivo, se salta entera: ni concede ni retira, que es lo
-- que pasaba cuando la pareja no estaba. Las otras tres no miran addons.activo, igual que antes.
CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan(p_tenant uuid, p_plan uuid, p_retirar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_feat     jsonb;
  v_plan_nom text;
  v_nota     text;
  v_addon    uuid;
  v_fila     public.tenant_addons%ROWTYPE;
  v_n        int;
  r          record;
  v_conc     text[] := '{}';
  v_ret      text[] := '{}';
BEGIN
  SELECT COALESCE(features_incluidos, '{}'::jsonb), nombre INTO v_feat, v_plan_nom FROM public.planes WHERE id = p_plan;
  v_nota := 'Incluido en el plan ' || COALESCE(v_plan_nom, '');

  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido'),
                                 ('TIENDA', 'tienda_incluida')) AS x(codigo, bandera) LOOP
    SELECT id INTO v_addon FROM public.addons WHERE codigo = r.codigo AND (r.codigo <> 'TIENDA' OR activo);
    CONTINUE WHEN v_addon IS NULL;

    IF COALESCE((v_feat->>r.bandera)::boolean, false) THEN
      SELECT * INTO v_fila FROM public.tenant_addons
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo
       ORDER BY fecha_inicio DESC LIMIT 1
       FOR UPDATE;

      IF FOUND AND v_fila.incluido_en_plan AND v_fila.precio_mensual_mxn = 0 THEN
        CONTINUE;                                            -- ya lo tiene incluido
      ELSIF FOUND AND v_fila.fecha_inicio = v_hoy THEN
        -- Se dio de alta hoy (pagado): se corrige en su lugar, no cabe otra fila con la misma fecha.
        UPDATE public.tenant_addons
           SET precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE id = v_fila.id;
      ELSE
        -- ¿Una baja de HOY? Se reactiva esa fila: un INSERT chocaría con addon_unico_activo.
        UPDATE public.tenant_addons
           SET activo = true, fecha_fin = NULL, precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE tenant_id = p_tenant AND addon_id = v_addon AND fecha_inicio = v_hoy AND NOT activo;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
          VALUES (p_tenant, v_addon, v_hoy, true, 0, v_nota, true);
        END IF;
        IF v_fila.id IS NOT NULL THEN
          -- Lo pagaba aparte: esa fila se cierra hoy (la historia de lo que pagó se queda) y ya entró
          -- la nueva a $0. Cobrarle aparte lo que su plan ya incluye sería cobrarlo dos veces.
          -- EL ORDEN IMPORTA (0159): al cerrar una fila de LEALTAD o de TIENDA se dispara
          -- trg_tenant_addons_apaga_lealtad (0156) / tenant_addons_apaga_tienda (0163), que si en
          -- ese instante no ve ninguna fila vigente apaga el interruptor del dueño: quien subía de
          -- plan perdía lo que tenía encendido. Con la incluida ya activa el trigger la ve y no
          -- apaga nada. Las dos filas no chocan con addon_unico_activo: a esta rama solo llega una
          -- pagada con fecha_inicio distinta de hoy.
          -- (Se pregunta por v_fila.id y no por FOUND, que el UPDATE y el INSERT de arriba ya pisaron.)
          UPDATE public.tenant_addons
             SET activo = false, fecha_fin = v_hoy, updated_at = now(),
                 notas = concat_ws(' · ', notas, 'Pasa a incluido en el plan ' || COALESCE(v_plan_nom, ''))
           WHERE id = v_fila.id;
        END IF;
      END IF;
      v_conc := v_conc || r.codigo;

    ELSIF p_retirar THEN
      -- Solo lo que dio el plan. Lo que paga aparte o se le regaló por cortesía no se toca.
      UPDATE public.tenant_addons
         SET activo = false, fecha_fin = v_hoy, updated_at = now()
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo AND incluido_en_plan;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_ret := v_ret || r.codigo; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('concedidos', to_jsonb(v_conc), 'retirados', to_jsonb(v_ret));
END;
$$;
REVOKE ALL ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) TO service_role;
COMMENT ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) IS
  'Interna (0141, 0159, 0167): concede a $0 los add-ons que el plan incluye (CFDI, DELIVERY, LEALTAD, y TIENDA solo si su complemento está activo en el catálogo) y, si p_retirar, quita los que se dieron por el plan anterior. Respeta addon_unico_activo reactivando la fila del día.';

-- El encendido. Idempotente. Activa el complemento en el catálogo (con eso el panel de VIM lo
-- ofrece y la sincronización de arriba empieza a concederlo) y se lo concede, incluido en su plan y
-- a $0, a cada negocio ACTIVO, TRIAL o INTERNO cuyo plan ACTUAL lo incluye y que no lo tenga ya
-- vigente. Va por tenants.plan_actual_id y no por suscripciones (como hizo el relleno de lealtad,
-- 0159) para no saltarse a quien está en prueba o no tiene suscripción.
-- Quien ya lo tiene vigente —aunque lo pague aparte— se queda como está: su siguiente cambio de
-- plan lo pone en orden. NO toca configuracion_tenant: conceder no abre la tienda de nadie.
-- Devuelve {activado, concedidos, ya_tenian}; `activado` dice si ESTA llamada lo activó.
-- La fila es la misma que deja la sincronización; una baja con fecha de hoy se reactiva (un INSERT
-- chocaría con addon_unico_activo).
CREATE OR REPLACE FUNCTION public.tienda_encender_complemento()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_addon    uuid;
  v_activado boolean;
  v_conc     integer;
  v_eleg     integer;
BEGIN
  SELECT id INTO v_addon FROM public.addons WHERE codigo = 'TIENDA' FOR UPDATE;   -- dos a la vez: de una en una
  IF v_addon IS NULL THEN RAISE EXCEPTION 'COMPLEMENTO_NO_EXISTE: falta TIENDA en el catálogo'; END IF;
  UPDATE public.addons SET activo = true, updated_at = now() WHERE id = v_addon AND NOT activo;
  v_activado := FOUND;

  WITH elegibles AS (
    SELECT t.id, p.nombre, public.tenant_addon_activo(t.id, 'TIENDA') AS vigente
      FROM public.tenants t JOIN public.planes p ON p.id = t.plan_actual_id
     WHERE t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
       AND COALESCE((p.features_incluidos ->> 'tienda_incluida')::boolean, false)
  ), dados AS (
    INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
    SELECT e.id, v_addon, v_hoy, true, 0, 'Incluido en el plan ' || e.nombre, true FROM elegibles e WHERE NOT e.vigente
    ON CONFLICT ON CONSTRAINT addon_unico_activo DO UPDATE
      SET activo = true, fecha_fin = NULL, precio_mensual_mxn = 0, incluido_en_plan = true, notas = EXCLUDED.notas, updated_at = now()
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM dados), (SELECT count(*) FROM elegibles) INTO v_conc, v_eleg;

  RETURN jsonb_build_object('activado', v_activado, 'concedidos', v_conc, 'ya_tenian', v_eleg - v_conc);
END;
$$;
REVOKE ALL ON FUNCTION public.tienda_encender_complemento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tienda_encender_complemento() TO service_role;
COMMENT ON FUNCTION public.tienda_encender_complemento() IS
  'El encendido de la tienda en línea (0167): activa el complemento TIENDA en el catálogo y lo concede a $0 a los negocios ACTIVO, TRIAL o INTERNO cuyo plan lo incluye. Idempotente; no enciende la tienda de nadie. Se ejecuta a mano, una vez, con visto bueno. Solo service_role.';

-- ── §2 `pedir` sin duplicados ────────────────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0162_tienda_funcion.sql §4. Cambian tres cosas, las tres con p_clave:
--   · el parámetro nuevo, al final (se llama por nombre; los demás conservan orden y nombre);
--   · el paso 0: con p_clave, si el negocio ya tiene un pedido con esa huella, se devuelve ese
--     —las mismas cuatro claves que al crearlo— sin crear ni validar nada;
--   · el INSERT atrapa la violación de unicidad y, con p_clave, devuelve el que ganó.
-- Con p_clave la función `tienda` DERIVA el código de seguimiento de la llave del intento de compra
-- (HMAC del slug y la llave), así que un reintento trae la misma huella y el índice único de
-- seguimiento_hash (0161) hace de candado. La llave no se guarda ni se mira: basta que venga.
-- Sin p_clave, todo como antes: una huella repetida la rechaza el índice.
-- La firma cambia, así que la anterior se va: con dos, PostgREST no sabría a cuál llamar.
DROP FUNCTION IF EXISTS tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric);
CREATE OR REPLACE FUNCTION tienda_crear_pedido(
  p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
  p_cliente jsonb,          -- {nombre, telefono (10 dígitos), email | null}
  p_direccion jsonb,        -- NULL al recoger; a domicilio {calle, numero_exterior, numero_interior?, colonia, codigo_postal, ciudad, estado, referencias?}
  p_pago text,              -- 'EFECTIVO' | 'TARJETA'
  p_paga_con numeric,       -- NULL salvo EFECTIVO
  p_nota text,
  p_seguimiento_hash text,  -- SHA-256 en hex del código que solo conoce el cliente
  p_cuenta uuid DEFAULT NULL,
  p_total_esperado numeric DEFAULT NULL,
  p_clave text DEFAULT NULL)  -- la llave del intento de compra: con ella, repetir devuelve el mismo pedido
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
  v_nombre text := btrim(p_cliente ->> 'nombre');
  v_tel    text := p_cliente ->> 'telefono';
  v_email  text := p_cliente ->> 'email';
  v_cfg    tienda_config%ROWTYPE;
  v_q      jsonb;
  v_total  numeric(12,2);
  v_dir    jsonb := NULLIF(p_direccion, 'null'::jsonb);
  v_dir_ok boolean;
  v_id_ext text := replace(gen_random_uuid()::text, '-', '');
  v_ped    record;
  v_ya     jsonb;
BEGIN
  -- 0) El reintento. Va antes que todo: quien reintenta ya tiene su pedido, y da igual que desde
  --    entonces la tienda haya cerrado, un precio haya cambiado o él haya llegado a su tope de
  --    pedidos vivos. Se busca por huella Y negocio (el índice es único en toda la plataforma: la
  --    huella de otro negocio no se devuelve). El candado pone en fila a dos envíos simultáneos
  --    del mismo intento: el segundo espera a que el primero termine y aquí ya lo encuentra.
  IF p_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tienda_clave:' || COALESCE(p_seguimiento_hash, ''), 0));
    SELECT jsonb_build_object('pedido_id', d.id, 'folio_corto', d.folio_corto,
                              'total_mxn', to_char(d.total_cliente_mxn, 'FM999999990.00'),
                              'vence_aceptacion', d.vence_aceptacion)
      INTO v_ya FROM delivery_pedidos d
     WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
    IF v_ya IS NOT NULL THEN RETURN v_ya; END IF;
  END IF;

  -- 1) La sucursal es del negocio (antes que nada: no se contesta por la tienda de otro) y recibe
  --    pedidos ahora en ese modo. Un modo que no existe sale por aquí como MODO_NO_DISPONIBLE.
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;
  v_motivo := tienda_estado_sucursal(p_sucursal, p_modo);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'TIENDA_CERRADA: %', v_motivo; END IF;

  -- 2) El cliente. «IS NOT TRUE»: una clave ausente deja la condición en NULL, y NULL no es válido.
  IF (char_length(v_nombre) BETWEEN 1 AND 100
      AND v_tel ~ '^[0-9]{10}$'
      AND (v_email IS NULL OR (char_length(v_email) <= 254 AND v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))) IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO: nombre de 1 a 100 caracteres, teléfono de 10 dígitos y correo válido o ausente';
  END IF;

  -- 3) La forma de pago, habilitada por el negocio. (tienda_estado_sucursal ya exigió la fila.)
  SELECT * INTO v_cfg FROM tienda_config WHERE tenant_id = p_tenant;
  IF ((p_pago = 'EFECTIVO' AND v_cfg.pago_efectivo) OR (p_pago = 'TARJETA' AND v_cfg.pago_tarjeta)) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: esa forma de pago no está disponible';
  END IF;

  -- 4) La cotización: valida el carrito y la zona, y pone los renglones y los importes. Sus errores
  --    pasan tal cual. Y el total, si el cliente dijo cuál vio, tiene que seguir siendo ese.
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items);
  v_total := (v_q ->> 'total_mxn')::numeric;
  IF p_total_esperado IS NOT NULL AND p_total_esperado IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'TOTAL_CAMBIO: %', v_q ->> 'total_mxn';   -- el total de ahora, con dos decimales
  END IF;

  -- 5) «Paga con»: solo en efectivo, y entre el total y el total + 5000 (el tope también deja
  --    fuera NaN e infinito, que para numeric son mayores que todo).
  IF p_paga_con IS NOT NULL AND (p_pago <> 'EFECTIVO' OR p_paga_con < v_total OR p_paga_con > v_total + 5000) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: «paga con» va solo en efectivo y entre el total y el total más 5000';
  END IF;

  -- 6) La dirección: a domicilio, completa y dentro de las longitudes de direcciones_cliente (que
  --    es donde crear_ticket_desde_tienda la guardará); al recoger, ninguna. Se guarda recortada y
  --    solo con estas claves: lo demás que mande el cliente no entra.
  IF p_modo = 'DOMICILIO' THEN
    SELECT bool_and(char_length(x.valor) BETWEEN k.minimo AND k.maximo),
           jsonb_object_agg(k.clave, x.valor) FILTER (WHERE x.valor <> '')
      INTO v_dir_ok, v_dir
      FROM (VALUES ('calle', 1, 255), ('numero_exterior', 1, 20), ('numero_interior', 0, 20), ('colonia', 1, 150),
                   ('codigo_postal', 5, 5), ('ciudad', 1, 100), ('estado', 1, 50), ('referencias', 0, 300)) AS k(clave, minimo, maximo)
     CROSS JOIN LATERAL (SELECT btrim(COALESCE(v_dir ->> k.clave, ''))) AS x(valor);
    IF (v_dir_ok AND v_dir ->> 'codigo_postal' ~ '^[0-9]{5}$') IS NOT TRUE THEN
      RAISE EXCEPTION 'DIRECCION_INVALIDA: a domicilio hacen falta calle, número, colonia, código postal de 5 dígitos, ciudad y estado';
    END IF;
  ELSIF v_dir IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECCION_INVALIDA: al recoger no hay dirección';
  END IF;

  -- 7) La huella del código de seguimiento. Repetida, la rechaza el índice único (0161 §1).
  IF (p_seguimiento_hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'SEGUIMIENTO_INVALIDO: la huella del seguimiento es un SHA-256 en hexadecimal';
  END IF;

  -- 8) La cuenta del cliente, si viene, es de este negocio y sigue viva. delivery_pedidos no tiene
  --    llave foránea a tienda_cuentas (0161 §1): quien lo comprueba es esta función.
  IF p_cuenta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tienda_cuentas c
                                           WHERE c.id = p_cuenta AND c.tenant_id = p_tenant AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA: la cuenta no existe en este negocio';
  END IF;

  -- 9) Cliente bloqueado o con 3 pedidos vivos: el MISMO error, letra por letra, para no revelar si
  --    un teléfono existe o está bloqueado. Va AQUÍ, lo último antes de insertar y después de todas
  --    las demás validaciones: si fuera antes, una petición inválida a propósito serviría para
  --    preguntar por un teléfono sin llegar a crear nada. Quien llega hasta aquí, o crea un pedido o
  --    recibe este error. El candado hace de uno en uno las altas de un mismo teléfono: sin él,
  --    varias simultáneas contarían lo mismo y pasarían todas el tope.
  --    «Vivo» tiene que decaer solo: con gestión NUBE nada mueve `estado` más allá de ACEPTADO (el
  --    seguimiento lo deriva del ticket al leer, §5), así que sin esto tres pedidos aceptados
  --    dejarían ese teléfono sin poder pedir para siempre. No cuenta el pedido de hace más de 6
  --    horas ni el que ya tiene en la nube un ticket cobrado, facturado o cancelado.
  -- ponytail: el conteo no tiene índice propio; recorre los pedidos vivos (índice parcial de 0090),
  -- que son pocos. Si un día pesa, un índice parcial por (tenant_id, cliente_telefono).
  PERFORM pg_advisory_xact_lock(hashtextextended('tienda_pedido:' || p_tenant || ':' || v_tel, 0));
  IF EXISTS (SELECT 1 FROM clientes c
              WHERE c.id = lealtad_resolver_cliente(p_tenant, NULL, v_tel) AND c.estado = 'BLOQUEADO')
     OR (SELECT count(*) FROM delivery_pedidos d
          WHERE d.tenant_id = p_tenant AND d.canal = 'TIENDA' AND d.cliente_telefono = v_tel
            AND d.estado IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
            AND d.recibido_at > now() - interval '6 hours'
            AND NOT EXISTS (SELECT 1 FROM tickets t
                             WHERE t.id = d.ticket_id AND t.tenant_id = p_tenant
                               AND t.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO'))) > 2 THEN
    RAISE EXCEPTION 'NO_SE_PUDO_CREAR: no se pudo crear el pedido';
  END IF;

  -- 10) La fila. id_externo: 32 hex al azar ('tienda:' || id_externo cabe en el varchar(64) de
  --    tickets.client_id_local) y único en toda la plataforma, como pide UNIQUE (app, id_externo).
  --    En su propio bloque por la segunda red del reintento: si aun con el candado del paso 0 otra
  --    transacción metió antes la misma huella (un llamador que no lee lo ya confirmado), con
  --    p_clave se devuelve el pedido que ganó en vez del error. Cualquier otra violación de
  --    unicidad —sin p_clave, o una huella que es de otro negocio— sale tal cual, como antes.
  BEGIN
    INSERT INTO delivery_pedidos (
      tenant_id, sucursal_id, canal, app, conexion_id, estado, tipo_entrega, id_externo, folio_corto,
      items, subtotal_mxn, envio_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn,
      cliente_nombre, cliente_telefono, cliente_email, direccion, zona_envio_id,
      pago_al_recibir, paga_con_mxn, nota_cliente, seguimiento_hash, tienda_cuenta_id,
      vence_aceptacion, gestion, payload_raw)
    VALUES (
      p_tenant, p_sucursal, 'TIENDA',
      (CASE p_modo WHEN 'DOMICILIO' THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)::modo_servicio,
      NULL, 'RECIBIDO',
      CASE p_modo WHEN 'DOMICILIO' THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END,
      v_id_ext, 'T' || upper(left(v_id_ext, 5)),
      v_q -> 'items', (v_q ->> 'subtotal_mxn')::numeric,
      (v_q ->> 'envio_mxn')::numeric,   -- el costo de la zona, no el total con IVA: así lo espera el ticket
      v_total, v_total, CASE p_pago WHEN 'EFECTIVO' THEN v_total ELSE 0 END,
      v_nombre, v_tel, v_email, v_dir, p_zona,
      p_pago, p_paga_con, NULLIF(left(btrim(p_nota), 300), ''), p_seguimiento_hash, p_cuenta,
      now() + make_interval(mins => v_cfg.minutos_aceptacion),
      -- Misma regla que los pedidos de apps (procesar-uber.ts): con una caja instalada viva, el
      -- ticket lo crea la caja.
      CASE WHEN sucursal_con_espejo(p_sucursal) THEN 'ESCRITORIO' ELSE 'NUBE' END,
      '{}'::jsonb)                      -- nada del cuerpo crudo: ni IP, ni token, ni sesión
    RETURNING id, folio_corto, vence_aceptacion INTO v_ped;
  EXCEPTION WHEN unique_violation THEN
    IF p_clave IS NOT NULL THEN
      SELECT jsonb_build_object('pedido_id', d.id, 'folio_corto', d.folio_corto,
                                'total_mxn', to_char(d.total_cliente_mxn, 'FM999999990.00'),
                                'vence_aceptacion', d.vence_aceptacion)
        INTO v_ya FROM delivery_pedidos d
       WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
      IF v_ya IS NOT NULL THEN RETURN v_ya; END IF;
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'pedido_id', v_ped.id,
    'folio_corto', v_ped.folio_corto,
    'total_mxn', v_q ->> 'total_mxn',
    'vence_aceptacion', v_ped.vence_aceptacion);
END;
$$;
REVOKE ALL ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text) TO service_role;

-- ── §3 «Ya lo tengo», y lo aceptado que nadie tomó ───────────────────────────
-- tienda_reportar_estado: cuerpo copiado ÍNTEGRO de 0164_tienda_caja.sql §1; se añade
-- EN_PREPARACION, que solo vale desde ACEPTADO. La caja lo reporta en cuanto crea la cuenta local
-- del pedido: es su «ya lo tengo». No sella nada (no hay columna para ello ni hace falta: lo que
-- importa es que el pedido deja de estar en ACEPTADO, que es lo que caduca aquí abajo).
-- SOLO AVANZA: ACEPTADO < EN_PREPARACION < LISTO < ENTREGADO; CANCELADO desde cualquier estado vivo.
CREATE OR REPLACE FUNCTION tienda_reportar_estado(p_tenant uuid, p_pedido uuid, p_estado text, p_motivo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual text;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: %', COALESCE(p_estado, 'NULL');
  END IF;

  SELECT estado INTO v_actual FROM delivery_pedidos
   WHERE id = p_pedido AND tenant_id = p_tenant AND canal = 'TIENDA'
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', COALESCE(p_pedido::text, 'NULL'); END IF;

  -- Entre paréntesis: sin ellos plpgsql corta el IF en el primer THEN del CASE.
  IF NOT (CASE p_estado
       WHEN 'EN_PREPARACION' THEN v_actual = 'ACEPTADO'
       WHEN 'LISTO'     THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION')
       WHEN 'ENTREGADO' THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
       ELSE                  v_actual IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
     END) THEN
    RETURN v_actual;
  END IF;

  UPDATE delivery_pedidos
     SET estado       = p_estado,
         listo_at     = CASE WHEN p_estado = 'LISTO' THEN now() ELSE listo_at END,
         entregado_at = CASE WHEN p_estado = 'ENTREGADO' THEN now() ELSE entregado_at END,
         cancelado_at = CASE WHEN p_estado = 'CANCELADO' THEN now() ELSE cancelado_at END,
         cancelado_por = CASE WHEN p_estado = 'CANCELADO' THEN 'RESTAURANTE' ELSE cancelado_por END,
         motivo_cancelacion = CASE
           WHEN p_estado <> 'CANCELADO' THEN motivo_cancelacion
           WHEN p_motivo IN ('AGOTADO', 'SATURADO', 'CERRADO', 'OTRO') THEN p_motivo
           ELSE 'OTRO' END
   WHERE id = p_pedido;
  RETURN p_estado;
END;
$$;
REVOKE ALL ON FUNCTION tienda_reportar_estado(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_reportar_estado(uuid, uuid, text, text) TO service_role;
COMMENT ON FUNCTION tienda_reportar_estado IS
  'La caja reporta EN_PREPARACION («ya lo tengo»), LISTO, ENTREGADO o CANCELADO de un pedido de la tienda en línea. Solo avanza; lo que no avanza devuelve el estado actual sin tocar nada. Solo service_role.';

-- delivery_marcar_expirados: cuerpo copiado ÍNTEGRO de 0164_tienda_caja.sql; se añade el último
-- bloque. Un pedido de la tienda de gestión ESCRITORIO que lleva más de 15 minutos en ACEPTADO es
-- uno que una caja aceptó y nunca tomó (se apagó, no tenía turno): la caja pasa el pedido a
-- EN_PREPARACION al crearle su cuenta, así que ACEPTADO quiere decir «todavía sin cuenta». Antes se
-- quedaba así para siempre y el cliente veía «en preparación» sin fin.
-- No toca los de gestión NUBE (su estado sale del ticket, 0164 §3) ni los de canal APP. Sin sello
-- de aceptado_at tampoco (delivery-accion siempre lo pone; una fila sin él no se adivina).
-- El valor devuelto sigue siendo el número de vencidos: lo caducado aquí no cuenta.
-- EN LA CAJA esta función existe pero no corre: su único llamador es el cron de la nube (0093) y
-- la caja no tiene pg_cron ni la invoca. La copia local del pedido se entera por el espejo.
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _exp_pasada (id uuid, tenant_id uuid, sucursal_id uuid) ON COMMIT DROP;
  DELETE FROM _exp_pasada;

  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, sucursal_id, conexion_id, app, id_externo
  ), ev AS (
    INSERT INTO delivery_eventos (tenant_id, conexion_id, app, direccion, tipo, id_externo, procesado, error)
    SELECT tenant_id, conexion_id, app, 'SALIDA', 'expirado', id_externo, true, 'Pedido expirado sin aceptar' FROM exp
    RETURNING conexion_id
  ), cx AS (
    UPDATE delivery_conexiones c
    SET ultimo_error = 'Pedidos expirados sin aceptar: revisar la caja', ultimo_evento_at = now()
    WHERE c.id IN (SELECT conexion_id FROM ev)
    RETURNING c.id
  )
  INSERT INTO _exp_pasada (id, tenant_id, sucursal_id) SELECT id, tenant_id, sucursal_id FROM exp;

  SELECT count(*) INTO v_n FROM _exp_pasada;

  -- Un aviso por sucursal y canal con expirados nuevos (best-effort: nunca tira el marcado).
  FOR r IN SELECT e.tenant_id, e.sucursal_id, p.canal, count(*)::integer AS n
             FROM _exp_pasada e JOIN delivery_pedidos p ON p.id = e.id
            GROUP BY e.tenant_id, e.sucursal_id, p.canal LOOP
    PERFORM delivery_avisar_expirados(r.tenant_id, r.sucursal_id, r.n, r.canal);
  END LOOP;

  -- Los pedidos atendidos desde el POS web (0164 §3). En su propio bloque: si falla, lo ya marcado
  -- como vencido se queda marcado y la siguiente pasada lo reintenta.
  BEGIN
    PERFORM tienda_sincronizar_estados_nube();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_sincronizar_estados_nube: %', SQLERRM;
  END;

  -- Lo que una caja aceptó y en 15 minutos no tomó (0167). También en su propio bloque. Queda como
  -- si el restaurante lo hubiera cancelado, con un motivo de la lista que el seguimiento enseña.
  -- ponytail: recorre la tabla como las dos pasadas de arriba; mismo índice parcial cuando pese.
  BEGIN
    UPDATE delivery_pedidos
       SET estado = 'CANCELADO', cancelado_por = 'RESTAURANTE', motivo_cancelacion = 'OTRO', cancelado_at = now()
     WHERE canal = 'TIENDA' AND gestion = 'ESCRITORIO' AND estado = 'ACEPTADO'
       AND aceptado_at < now() - interval '15 minutes';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delivery_marcar_expirados (aceptados sin tomar): %', SQLERRM;
  END;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;
COMMENT ON FUNCTION delivery_marcar_expirados IS
  'Marca EXPIRADO los pedidos RECIBIDOS (de apps y de la tienda en línea) cuya ventana venció; deja evento y aviso en la conexión y manda push al dueño diciendo de qué canal eran (pg_net → enviar-push). Al final pone al día los pedidos de la tienda atendidos desde el POS web y cancela los que una caja aceptó y en 15 minutos no tomó. Cron cada minuto (nube).';

-- ── §4 Retención ─────────────────────────────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0161_tienda_en_linea_base.sql §1. Se añade, SOLO para los pedidos de la
-- tienda (los de apps quedan exactamente como estaban):
--   · nota_cliente y la `nota` de cada renglón de `items`: texto libre del comensal, que el aviso
--     de privacidad promete borrar. El renglón conserva todo lo demás, y la clave queda en null.
--   · los estados ACEPTADO y EN_PREPARACION: un pedido de más de 30 días que se quedó ahí ya no
--     conserva sus datos para siempre. La retención no le cambia el estado.
-- tienda_cuenta_id se CONSERVA: es lo que mantiene el pedido en «mis pedidos» del comensal (que lo
-- enseña con `items` en null porque payload_raw queda marcado, 0166 §9); se suelta cuando él
-- elimina su cuenta.
-- Y en la misma pasada diaria, el barrido de sesiones y enlaces de recuperación vencidos, que hasta
-- ahora solo se limpiaban de 200 en 200 cuando alguien entraba o pedía recuperar (0166).
-- ponytail: «falta blanquear» no mira dentro de `items`; no hace falta, porque un pedido de la
-- tienda sin anonimizar siempre tiene payload_raw distinto de la marca. Si algún día se añade otro
-- dato a blanquear a pedidos YA anonimizados, hay que sumarlo a esa condición.
CREATE OR REPLACE FUNCTION delivery_anonimizar_pedidos_viejos(p_dias integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer := 0;
BEGIN
  WITH anon AS (
    UPDATE delivery_pedidos
    SET cliente_nombre       = CASE WHEN cliente_nombre IS NULL THEN NULL ELSE 'Cliente de app' END,
        cliente_telefono     = NULL,
        cliente_telefono_pin = NULL,
        direccion_texto      = NULL,
        payload_raw          = '{"anonimizado": true}'::jsonb,   -- la columna es NOT NULL
        repartidor_nombre    = NULL,
        repartidor_telefono  = NULL,
        cliente_email        = NULL,
        direccion            = NULL,
        seguimiento_hash     = NULL,
        nota_cliente         = CASE WHEN canal = 'TIENDA' THEN NULL ELSE nota_cliente END,
        items                = CASE WHEN canal = 'TIENDA' AND jsonb_typeof(items) = 'array' THEN COALESCE((
                                 SELECT jsonb_agg(CASE WHEN jsonb_typeof(i.r) = 'object' THEN i.r || '{"nota": null}'::jsonb ELSE i.r END ORDER BY i.ord)
                                   FROM jsonb_array_elements(items) WITH ORDINALITY AS i(r, ord)), '[]'::jsonb)
                               ELSE items END
    WHERE recibido_at < now() - make_interval(days => GREATEST(p_dias, 1))
      AND (estado IN ('ENTREGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'LISTO', 'ERROR')
           OR (canal = 'TIENDA' AND estado IN ('ACEPTADO', 'EN_PREPARACION')))
      AND (cliente_telefono IS NOT NULL OR cliente_telefono_pin IS NOT NULL OR direccion_texto IS NOT NULL
           OR payload_raw <> '{"anonimizado": true}'::jsonb OR repartidor_telefono IS NOT NULL OR repartidor_nombre IS NOT NULL
           OR cliente_email IS NOT NULL OR direccion IS NOT NULL OR seguimiento_hash IS NOT NULL
           OR (canal = 'TIENDA' AND nota_cliente IS NOT NULL)
           OR (cliente_nombre IS NOT NULL AND cliente_nombre <> 'Cliente de app'))
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM anon;
  -- El payload de los webhooks también lleva datos del cliente: misma ventana.
  UPDATE delivery_eventos SET payload = '{"anonimizado": true}'::jsonb
  WHERE payload IS NOT NULL AND payload <> '{"anonimizado": true}'::jsonb
    AND created_at < now() - make_interval(days => GREATEST(p_dias, 1));
  -- Sesiones y enlaces de recuperación de la tienda que ya vencieron: no sirven para nada.
  DELETE FROM tienda_sesiones WHERE expira_at <= now();
  DELETE FROM tienda_recuperaciones WHERE expira_at <= now();
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) TO service_role;
COMMENT ON FUNCTION delivery_anonimizar_pedidos_viejos IS
  'Anonimiza los datos personales de pedidos de apps y de la tienda en línea de hace más de p_dias (30 por defecto) —en los de la tienda también las notas, y también los que se quedaron en ACEPTADO o EN_PREPARACION—, vacía el payload de eventos viejos y borra sesiones y enlaces de recuperación vencidos de la tienda. Cron diario en la nube (DPA Uber 1.5).';
