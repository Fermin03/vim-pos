-- 0178 · Tienda en línea: modo de prueba por negocio y freno tras un rechazo por riesgo.
--
-- DOS COSAS, las dos del pago con tarjeta (Orders API de Mercado Pago):
--
-- A) MODO DE PRUEBA. Un negocio interno de VIM puede cobrar en su tienda contra el AMBIENTE DE PRUEBA
--    de Mercado Pago, de punta a punta y por el mismo código que producción, sin tocar una cuenta
--    real. Mercado Pago no deja mezclar cuentas reales y de prueba en un cobro, así que ese negocio
--    cobra DIRECTO con las credenciales de la aplicación gemela de prueba (un access token que no es
--    de OAuth: no tiene refresh token ni vence).
--      · La marca: tienda_config.pago_de_prueba. SOLO la pone VIM, a mano, por SQL. El dueño no
--        puede: `authenticated` no tiene INSERT ni UPDATE sobre esa columna (privilegios por columna,
--        el mecanismo de la 0132 y la 0135), y ninguna función a su alcance la escribe. Tampoco la
--        puede APAGAR borrando la fila y creándola otra vez: pierde el DELETE de la tabla (nada
--        suyo lo usa) y, además, un disparador niega borrar la fila con la marca puesta.
--      · La conexión de prueba: una fila de tienda_conexiones con de_prueba = true y su access token
--        en Vault, sin refresh. La crea tienda_conexion_de_prueba (solo service_role), que se niega
--        si el negocio no tiene la marca.
--      · QUÉ CONEXIÓN COBRA (tienda_conexion_cobro), y nunca se mezclan:
--          negocio en modo de prueba → SOLO su conexión de prueba (la única ACTIVA con de_prueba);
--          negocio normal            → NUNCA una de prueba. Su regla es la de la 0173 con un solo
--                                      cambio: para «la única activa» cuentan solo las reales (una
--                                      de prueba que quedó activa no estorba al apagar el modo).
--        Cada pago guarda la conexión con la que nació (tienda_pagos.conexion_id): encender o apagar
--        la marca no cambia con qué token se consulta o se devuelve un pago que ya existe.
--      · La conexión de prueba no se renueva: no tiene fecha de vencimiento, y la regla de la
--        renovación (tienda_conexiones_por_renovar, tienda_conexion_tomar_renovacion: 0173) ya deja
--        fuera a la que no la tiene. No se toca esa regla.
--      · Que se note: tienda_negocio dice `pago_de_prueba` (la tienda pinta la franja en la pantalla
--        de la tarjeta) y tienda_seguimiento dice, de CADA pedido en línea, si su pago se hizo con
--        una conexión de prueba (`pago_de_prueba`).
--
-- B) EL FRENO. Tras un rechazo por riesgo (`high_risk`: el antifraude de Mercado Pago, no el banco)
--    ese cliente no puede repetir el cobro en línea en ese negocio durante 30 minutos. Repetirlo al
--    instante con los mismos datos empeora la puntuación del restaurante en el antifraude (lo dijo el
--    soporte de Mercado Pago).
--      · A quién: al MISMO cliente, que es su teléfono Y su IP A LA VEZ, en ESE negocio. Es un freno
--        para que el mismo cliente no repita el cobro al instante, no una defensa contra el abuso
--        (esa son los topes por IP). Con solo la IP frenaría a todos los que comparten red (el wifi
--        del local, un operador móvil); con solo el teléfono, cualquiera frenaría a otro escribiendo
--        su número. Sin IP conocida no hay freno.
--      · La clave del freno la calcula la FUNCIÓN: un HMAC de negocio + teléfono + IP con una llave
--        que deriva de VIM_TIENDA_SECRET y que la base no tiene. Aquí llega ya calculada: quien lea
--        la base no saca de ella ni el teléfono ni la IP.
--      · Dónde vive: en limites_cupo (0136), la tabla de los topes, con su vencimiento.
--      · Quién lo pone: la función `tienda` cuando el rechazo llega en la respuesta del cobro, y un
--        disparador sobre tienda_pagos cuando llega después (por el aviso, la página del pedido o el
--        barrido), que es como se vio en producción (`in_review` y, segundos después, `failed`).
--        Para eso el pago guarda, al nacer, su clave de freno ya calculada (tienda_pagos.freno_clave):
--        el disparador no conoce el secreto, ni la IP con la que se pidió. Sin clave, no frena.
--
-- ORDEN DE DESPLIEGUE:  1) esta migración  →  2) la web de la tienda y el admin  →  3) las funciones
-- `tienda` y `tienda-webhook-mp`.
--   · La migración va PRIMERO: la función `tienda` nueva llama a tienda_pago_frenado en cada pedido
--     en línea, escribe tienda_pagos.freno_clave y llama a tienda_pago_frenar en cada rechazo por riesgo.
--   · La web va ANTES que la función: una pestaña con la web vieja no conoce PAGO_EN_PAUSA y diría
--     «algo salió mal» (sin cobrar nada; solo el texto).
--   · Con la migración sola nada cambia: ningún negocio tiene la marca, y nadie pone un freno hasta
--     que la función nueva guarda claves de freno (sin clave, el disparador no hace nada).
--
-- Corre también en el Postgres de la caja instalada (sin Vault, pg_net ni pg_cron): lo de Vault va
-- con EXECUTE dinámico, como en la 0173, y allá tienda_pagos y tienda_conexiones están vacías.
-- OJO, PARA QUIEN AÑADA UNA COLUMNA A tienda_config DESPUÉS DE ESTA: `authenticated` ya no tiene
-- INSERT ni UPDATE de tabla. Si el dueño tiene que escribirla desde el admin, hay que darle
-- GRANT INSERT (col), UPDATE (col). El smoke lo vigila (smoke_tienda_modo_de_prueba.sql).

-- ── §1 La marca, y que solo VIM la pueda poner ───────────────────────────────
ALTER TABLE tienda_config ADD COLUMN IF NOT EXISTS pago_de_prueba boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN tienda_config.pago_de_prueba IS 'Modo de prueba: la tienda cobra contra el ambiente de PRUEBA de Mercado Pago, con su conexión de prueba, y nunca con una real. Solo la pone VIM por SQL: authenticated no tiene INSERT ni UPDATE sobre esta columna.';

-- Un REVOKE de columna no sirve mientras exista el GRANT de tabla (0135): se quita el de tabla y se
-- devuelve, columna por columna, todo lo que hoy tiene la tabla MENOS la marca. Las políticas de la
-- 0161 (solo dueño o administrador, solo su negocio) siguen igual: esto solo quita una columna.
REVOKE INSERT, UPDATE ON tienda_config FROM authenticated;
DO $$
DECLARE v_columnas text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_columnas
    FROM pg_attribute a
   WHERE a.attrelid = 'public.tienda_config'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname <> 'pago_de_prueba';
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON tienda_config TO authenticated', v_columnas, v_columnas);
END $$;

-- Y que no la apague borrando la fila: la 0161 le dio DELETE a `authenticated` (con política de dueño
-- o administrador), y borrar la fila y crearla otra vez la dejaría con la marca en falso: la tienda
-- pasaría a cobrar tarjetas reales con su conexión real. Dos cerrojos:
--   · se le quita el DELETE de la tabla. Nada con sesión lo usa (el admin nunca borra la tienda; un
--     negocio se elimina con service_role y la fila se va en cascada con su tenant);
--   · y un disparador niega borrar una fila con la marca puesta a quien llega con una sesión
--     (`authenticated` o `anon`), por si un día alguien devuelve ese DELETE. Los roles de servicio
--     (service_role, y quien elimina un negocio entero) pasan.
REVOKE DELETE ON tienda_config FROM authenticated;
CREATE OR REPLACE FUNCTION tienda_config_no_borrar_en_prueba()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.pago_de_prueba AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'TIENDA_EN_MODO_DE_PRUEBA: la tienda está en modo de prueba y solo VIM puede quitarla'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tienda_config_no_borrar_en_prueba ON tienda_config;
CREATE TRIGGER trg_tienda_config_no_borrar_en_prueba
  BEFORE DELETE ON tienda_config
  FOR EACH ROW EXECUTE FUNCTION tienda_config_no_borrar_en_prueba();

-- ── §2 Qué conexión cobra ────────────────────────────────────────────────────
-- tienda_conexion_cobro: cuerpo copiado ÍNTEGRO de 0173_tienda_pago_en_linea.sql §3. Dos cambios:
--   1) el bloque del modo de prueba, después de las condiciones que valen para todos (el dueño lo
--      ofrece, sin pausas, la caja sabe de pedidos pagados, la sucursal está en la tienda) y antes
--      de la regla de siempre;
--   2) en la regla de siempre, «la única conexión activa» cuenta solo las REALES (`AND NOT
--      x.de_prueba` en el conteo). Antes, con una real y una de prueba activas y sin elegir, no
--      cobraba ninguna: al apagar el modo de prueba la tienda se quedaba sin pago en línea hasta
--      elegir cuenta a mano. Lo demás de esa rama queda letra por letra.
--   · En modo de prueba cobra la ÚNICA conexión ACTIVA de prueba del negocio. Si no hay, o hay más de
--     una, ninguna. No se mira la cuenta elegida para la sucursal: esa elección es de las cuentas
--     reales, y así queda intacta para cuando se apague el modo de prueba.
--   · Un negocio normal sigue sin poder cobrar con una de prueba (`AND NOT x.de_prueba`, abajo).
CREATE OR REPLACE FUNCTION tienda_conexion_cobro(p_tenant uuid, p_sucursal uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_elegida uuid;
  v_id      uuid;
BEGIN
  IF NOT COALESCE((SELECT c.pago_en_linea AND (c.pago_pausado_hasta IS NULL OR c.pago_pausado_hasta <= now())
                     FROM tienda_config c WHERE c.tenant_id = p_tenant), false) THEN RETURN NULL; END IF;

  IF sucursal_con_espejo(p_sucursal) AND NOT _tienda_caja_en_linea_viva(p_sucursal) THEN RETURN NULL; END IF;

  SELECT ts.conexion_id INTO v_elegida FROM tienda_sucursales ts
   WHERE ts.sucursal_id = p_sucursal AND ts.tenant_id = p_tenant
     AND (ts.pago_pausado_hasta IS NULL OR ts.pago_pausado_hasta <= now());
  IF NOT FOUND THEN RETURN NULL; END IF;   -- la sucursal no está en la tienda, o su pago está en pausa

  -- Modo de prueba: solo la conexión de prueba, y solo si es una.
  IF (SELECT c.pago_de_prueba FROM tienda_config c WHERE c.tenant_id = p_tenant) THEN
    IF (SELECT count(*) FROM tienda_conexiones x WHERE x.tenant_id = p_tenant AND x.estado = 'ACTIVA' AND x.de_prueba) = 1 THEN
      SELECT x.id INTO v_id FROM tienda_conexiones x
       WHERE x.tenant_id = p_tenant AND x.estado = 'ACTIVA' AND x.de_prueba;
    END IF;
    RETURN v_id;
  END IF;

  IF v_elegida IS NOT NULL THEN
    SELECT x.id INTO v_id FROM tienda_conexiones x
     WHERE x.id = v_elegida AND x.tenant_id = p_tenant AND x.estado = 'ACTIVA' AND NOT x.de_prueba;
    RETURN v_id;
  END IF;

  IF (SELECT count(*) FROM tienda_conexiones x WHERE x.tenant_id = p_tenant AND x.estado = 'ACTIVA' AND NOT x.de_prueba) = 1 THEN
    SELECT x.id INTO v_id FROM tienda_conexiones x
     WHERE x.tenant_id = p_tenant AND x.estado = 'ACTIVA' AND NOT x.de_prueba;
  END IF;
  RETURN v_id;
END;
$$;

-- La conexión de PRUEBA de un negocio en modo de prueba: la crea (o la actualiza) y guarda su access
-- token en Vault. No pasa por OAuth: son las credenciales de la aplicación gemela de prueba, que no
-- traen refresh token ni vencen (tienda_guardar_tokens no sirve: exige el par completo).
--   p_cuenta      el user_id de la cuenta vendedora de prueba (es lo que tiene que traer cada orden);
--   p_public_key  la public key de esa aplicación (no es secreta: va al navegador);
--   p_access      su access token. Solo entra a Vault: no se guarda en ninguna tabla ni se registra.
-- Se niega si el negocio no está en modo de prueba, y si esa cuenta ya está conectada ahí como real
-- (una conexión real no se convierte en de prueba). No deja refresh token guardado.
-- Devuelve el id de la conexión. Solo service_role.
CREATE OR REPLACE FUNCTION tienda_conexion_de_prueba(p_tenant uuid, p_cuenta text, p_public_key text, p_access text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id      uuid;
  v_secreto uuid;
BEGIN
  IF NOT COALESCE((SELECT c.pago_de_prueba FROM tienda_config c WHERE c.tenant_id = p_tenant), false) THEN
    RAISE EXCEPTION 'NEGOCIO_NO_ES_DE_PRUEBA: el negocio % no está en modo de prueba', COALESCE(p_tenant::text, 'NULL');
  END IF;
  IF (p_cuenta ~ '^[0-9]{1,20}$') IS NOT TRUE OR (p_public_key ~ '^[A-Za-z0-9_-]{20,100}$') IS NOT TRUE
     OR COALESCE(btrim(p_access), '') = '' THEN
    RAISE EXCEPTION 'CONEXION_DE_PRUEBA_INVALIDA: hacen falta la cuenta (solo dígitos), la public key y el access token';
  END IF;
  IF EXISTS (SELECT 1 FROM tienda_conexiones x
              WHERE x.tenant_id = p_tenant AND x.cuenta_id_externo = p_cuenta AND NOT x.de_prueba) THEN
    RAISE EXCEPTION 'CUENTA_REAL: la cuenta % ya está conectada como real en este negocio', p_cuenta;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN RAISE EXCEPTION 'VAULT_NO_DISPONIBLE'; END IF;

  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre, public_key, de_prueba, estado)
  VALUES (p_tenant, p_cuenta, 'Cuenta de prueba ' || p_cuenta, p_public_key, true, 'ACTIVA')
  ON CONFLICT (tenant_id, cuenta_id_externo) DO UPDATE
    SET public_key = EXCLUDED.public_key, estado = 'ACTIVA', vence_at = NULL, ultimo_error = NULL, renovando_hasta = NULL
  RETURNING id INTO v_id;

  EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1' INTO v_secreto USING format('tienda:%s:access', v_id);
  IF v_secreto IS NULL THEN
    EXECUTE 'SELECT vault.create_secret($1, $2)' USING btrim(p_access), format('tienda:%s:access', v_id);
  ELSE
    EXECUTE 'SELECT vault.update_secret($1, $2)' USING v_secreto, btrim(p_access);
  END IF;
  EXECUTE 'DELETE FROM vault.secrets WHERE name = $1' USING format('tienda:%s:refresh', v_id);
  RETURN v_id;
END $$;
COMMENT ON FUNCTION tienda_conexion_de_prueba IS
  'Crea o actualiza la conexión de PRUEBA de Mercado Pago de un negocio en modo de prueba (tienda_config.pago_de_prueba) y guarda su access token en Vault, sin refresh. Se niega si el negocio no tiene la marca. Solo service_role.';

-- ── §3 Que se note ───────────────────────────────────────────────────────────
-- tienda_negocio: cuerpo copiado ÍNTEGRO de 0173_tienda_pago_en_linea.sql §3. Se añade una clave al
-- negocio: `pago_de_prueba` (la marca). Con ella la tienda avisa, en la pantalla de la tarjeta, que
-- ahí los pagos no son reales.
CREATE OR REPLACE FUNCTION tienda_negocio(p_slug text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c  tienda_config%ROWTYPE;
  v_t  record;
  v_sucursales jsonb;
BEGIN
  SELECT * INTO v_c FROM tienda_config WHERE slug = lower(btrim(COALESCE(p_slug, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT t.id, t.nombre_comercial INTO v_t
    FROM tenants t
   WHERE t.id = v_c.tenant_id AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE((modulos_efectivos(v_c.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'telefono', s.telefono,
           'direccion', NULLIF(concat_ws(', ',
                          NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                          s.direccion_colonia, s.ciudad), ''),
           'recoger', ts.recoger,
           'domicilio', ts.domicilio,
           'horario', ts.horario,
           'pago_en_linea', tienda_conexion_cobro(v_c.tenant_id, s.id) IS NOT NULL,
           -- La public key de la cuenta que cobra ahí (no es secreta): con ella se tokeniza la tarjeta.
           'public_key', (SELECT x.public_key FROM tienda_conexiones x WHERE x.id = tienda_conexion_cobro(v_c.tenant_id, s.id)),
           'estado', jsonb_build_object(
             'recoger',   tienda_estado_sucursal(s.id, 'RECOGER', p_ahora),
             'domicilio', tienda_estado_sucursal(s.id, 'DOMICILIO', p_ahora)),
           'zonas', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'costo_mxn', z.costo_mxn::text)
                              ORDER BY z.orden, z.nombre)
               FROM zonas_envio z
              WHERE z.sucursal_id = s.id AND z.tenant_id = v_c.tenant_id AND z.activa AND z.deleted_at IS NULL),
             '[]'::jsonb))
         ORDER BY s.nombre), '[]'::jsonb)
    INTO v_sucursales
    FROM tienda_sucursales ts
    JOIN sucursales s ON s.id = ts.sucursal_id AND s.tenant_id = ts.tenant_id
   WHERE ts.tenant_id = v_c.tenant_id AND ts.participa AND s.activa AND s.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'tenant_id', v_c.tenant_id,
    'publico', jsonb_build_object(
      'slug', v_c.slug,
      'nombre', v_t.nombre_comercial,
      'logo_ruta', v_c.logo_ruta,
      'color', v_c.color,
      'descripcion', v_c.descripcion,
      'pago_efectivo', v_c.pago_efectivo,
      'pago_tarjeta', v_c.pago_tarjeta,
      'pago_en_linea', v_c.pago_en_linea,
      'pago_de_prueba', v_c.pago_de_prueba,
      'sucursales', v_sucursales));
END;
$$;

-- tienda_seguimiento: cuerpo copiado ÍNTEGRO de 0175_tienda_verificacion_del_banco.sql §3. Se añade
-- una clave al bloque del pedido en línea: `pago_de_prueba`, verdadero si el pago de ESE pedido se
-- hizo con una conexión de prueba. Sale del pago, no de la marca del negocio: un pedido de prueba lo
-- sigue diciendo aunque después se apague el modo de prueba, y uno real nunca lo dice.
CREATE OR REPLACE FUNCTION tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      delivery_pedidos%ROWTYPE;
  v_g      tienda_pagos%ROWTYPE;
  v_estado text;
  v_envio_total numeric(12,2);
  v_en_linea boolean;
BEGIN
  IF p_seguimiento_hash IS NULL OR p_seguimiento_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM delivery_pedidos
   WHERE seguimiento_hash = p_seguimiento_hash AND tenant_id = p_tenant AND canal = 'TIENDA';
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_estado := _tienda_estado_real(v_p);
  v_envio_total := v_p.total_cliente_mxn - COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn);
  v_en_linea := v_p.pago_al_recibir IS NOT DISTINCT FROM 'EN_LINEA';
  IF v_en_linea THEN
    SELECT * INTO v_g FROM tienda_pagos g WHERE g.pedido_id = v_p.id AND NOT g.extra;
  END IF;

  RETURN jsonb_build_object(
    'folio_corto', v_p.folio_corto,
    'modo', CASE v_p.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
    'estado', _tienda_estado_publico(v_estado, v_p.app::text),
    'motivo', CASE
      WHEN v_estado = 'EXPIRADO' AND v_en_linea AND v_p.pagado_at IS NULL AND v_g.estado = 'ABANDONADO' THEN 'SIN_VERIFICAR'
      WHEN v_estado = 'EXPIRADO' AND v_en_linea AND v_p.pagado_at IS NULL THEN 'SIN_PAGO'
      WHEN v_estado = 'EXPIRADO' THEN 'SIN_RESPUESTA'
      WHEN v_estado IN ('RECHAZADO', 'CANCELADO') THEN
        CASE WHEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1))) IN ('AGOTADO', 'CERRADO', 'SATURADO', 'OTRO')
             THEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1)))
             ELSE 'OTRO' END
      END,
    'renglones', _tienda_renglones(v_p.items),
    'subtotal_mxn', to_char(COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn), 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_total, 'FM999999990.00'),
    'total_mxn', to_char(v_p.total_cliente_mxn, 'FM999999990.00'),
    'pago', v_p.pago_al_recibir,
    'recibido_at', v_p.recibido_at,
    'sucursal', (SELECT jsonb_build_object('nombre', s.nombre, 'telefono', s.telefono)
                   FROM sucursales s WHERE s.id = v_p.sucursal_id))
    || CASE WHEN NOT v_en_linea THEN '{}'::jsonb ELSE jsonb_build_object(
      'pago_estado', CASE
        WHEN v_g.estado = 'APROBADO' THEN 'PAGADO'
        WHEN v_g.estado IN ('POR_DEVOLVER', 'DEVOLUCION_FALLIDA') THEN 'DEVOLUCION_EN_PROCESO'
        WHEN v_g.estado = 'DEVUELTO' THEN 'DEVUELTO'
        -- El cobro se mandó y no se sabe qué pasó (o venció y todavía no se le ha podido preguntar a
        -- Mercado Pago): no se afirma nada.
        WHEN v_p.estado = 'POR_PAGAR' THEN 'POR_CONFIRMAR'
        WHEN _tienda_pago_sin_confirmar(v_p.id) THEN 'POR_CONFIRMAR'
        ELSE 'SIN_PAGO' END,
      'propina_mxn', to_char(COALESCE(v_p.propina_mxn, 0), 'FM999999990.00'),
      'total_a_pagar_mxn', to_char(v_p.total_cliente_mxn + COALESCE(v_p.propina_mxn, 0), 'FM999999990.00'),
      'pago_de_prueba', COALESCE((SELECT x.de_prueba FROM tienda_conexiones x WHERE x.id = v_g.conexion_id), false)) END;
END;
$$;

-- ── §4 El freno tras un rechazo por riesgo ───────────────────────────────────
-- La clave de freno de un pago: HMAC(llave derivada de VIM_TIENDA_SECRET, negocio + teléfono + IP),
-- calculada por la función `tienda` al crear el pedido (freno.ts). Con ella el disparador de abajo
-- puede frenar al mismo cliente cuando el rechazo llega tarde, sin conocer el secreto ni la IP. No
-- es el teléfono ni la IP, ni se sacan de ella. NULL = no se conocía la IP: ese pago no frena.
ALTER TABLE tienda_pagos ADD COLUMN IF NOT EXISTS freno_clave text NULL;
ALTER TABLE tienda_pagos DROP CONSTRAINT IF EXISTS tienda_pago_freno_clave_valida;
ALTER TABLE tienda_pagos ADD CONSTRAINT tienda_pago_freno_clave_valida CHECK (freno_clave ~ '^[A-Za-z0-9_-]{40,64}$');
COMMENT ON COLUMN tienda_pagos.freno_clave IS 'Clave del freno por riesgo del cliente de este pago: un HMAC de negocio + teléfono + IP hecho por la función tienda con una llave que la base no tiene. NULL = sin IP conocida (no frena).';

-- Pone el freno: quien tenga esa clave (ese teléfono Y esa IP, en ese negocio) no cobra en línea
-- hasta dentro de p_minutos. Devuelve hasta cuándo, o NULL si la clave no tiene su forma (no frena a
-- nadie). Ponerlo otra vez lo deja hasta la hora más tardía (nunca lo acorta). Se guarda en
-- limites_cupo, que se limpia sola al vencer (consumir_cupo).
CREATE OR REPLACE FUNCTION tienda_pago_frenar(p_clave text, p_minutos integer DEFAULT 30)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- clock_timestamp y no now(), como los demás topes (0136): no depende de cuándo empezó la transacción.
  v_ahora  timestamptz := clock_timestamp();
  v_hasta  timestamptz := v_ahora + make_interval(mins => LEAST(GREATEST(COALESCE(p_minutos, 30), 1), 1440));
BEGIN
  IF (p_clave ~ '^[A-Za-z0-9_-]{40,64}$') IS NOT TRUE THEN RETURN NULL; END IF;
  INSERT INTO limites_cupo AS l (clave, ventana_inicio, expira_en, usos)
  VALUES ('tienda:pago-freno:' || p_clave, v_ahora, v_hasta, 1)
  ON CONFLICT (clave, ventana_inicio) DO UPDATE SET expira_en = GREATEST(l.expira_en, EXCLUDED.expira_en);
  RETURN v_hasta;
END;
$$;
COMMENT ON FUNCTION tienda_pago_frenar IS
  'Tras un rechazo por riesgo del antifraude de Mercado Pago: el cliente de esa clave (HMAC de negocio + teléfono + IP, calculado por la función tienda) no puede cobrar en línea durante p_minutos (30). Devuelve hasta cuándo. Solo service_role.';

-- ¿Esa clave tiene el pago en línea frenado? Hasta cuándo, o NULL si no. No suma ni cambia nada.
CREATE OR REPLACE FUNCTION tienda_pago_frenado(p_clave text)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT max(l.expira_en) FROM limites_cupo l
   WHERE p_clave ~ '^[A-Za-z0-9_-]{40,64}$' AND l.clave = 'tienda:pago-freno:' || p_clave AND l.expira_en > clock_timestamp();
$$;
COMMENT ON FUNCTION tienda_pago_frenado IS
  'Hasta cuándo el cliente de esa clave de freno tiene frenado el pago en línea por un rechazo por riesgo; NULL si no lo tiene. Solo service_role.';

-- El rechazo por riesgo que se conoce DESPUÉS de contestarle al cliente: el cobro quedó en revisión y
-- el aviso de Mercado Pago, la página del pedido o el barrido traen el `failed` / `high_risk`
-- (tienda_pago_aplicar deja el pago RECHAZADO con ese motivo). Frena con la clave que el pago guardó
-- al nacer; sin ella (IP desconocida, o un pago de antes de esta migración) no frena a nadie. Es un
-- disparador, como el de las devoluciones (0173 §6): así lo caza venga por donde venga. Y nunca
-- tumba el cambio de estado: se traga sus errores.
-- `high_risk` es el motivo tal como lo manda Mercado Pago (documento 04); su familia en la función
-- es RIESGO (pago-mp.ts), y una prueba ata los dos nombres.
CREATE OR REPLACE FUNCTION tienda_pagos_frenar_por_riesgo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM tienda_pago_frenar(NEW.freno_clave);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tienda_pagos_frenar_por_riesgo(%): %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_tienda_pagos_frenar_por_riesgo ON tienda_pagos;
CREATE TRIGGER trg_tienda_pagos_frenar_por_riesgo
  AFTER UPDATE OF estado ON tienda_pagos
  FOR EACH ROW
  WHEN (NEW.estado = 'RECHAZADO' AND OLD.estado IS DISTINCT FROM NEW.estado AND NEW.detalle = 'high_risk'
        AND NEW.freno_clave IS NOT NULL AND NOT NEW.extra)
  EXECUTE FUNCTION tienda_pagos_frenar_por_riesgo();

-- (De una versión anterior de esta migración, nunca aplicada: el freno por teléfono o por IP sueltos.)
DROP FUNCTION IF EXISTS tienda_pago_frenar(uuid, text, text, integer);
DROP FUNCTION IF EXISTS tienda_pago_frenado(uuid, text, text);
DROP FUNCTION IF EXISTS _tienda_freno_claves(uuid, text, text);

-- ── Privilegios ──────────────────────────────────────────────────────────────
-- Nada para el público ni para el personal. Las de disparador, ni a service_role.
-- (Las tres reemplazadas —tienda_conexion_cobro, tienda_negocio, tienda_seguimiento— conservan los
-- suyos: CREATE OR REPLACE no los toca; se repiten aquí por si acaso.)
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma, p.proname
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_conexion_cobro', 'tienda_negocio', 'tienda_seguimiento', 'tienda_conexion_de_prueba',
                                'tienda_pago_frenar', 'tienda_pago_frenado', 'tienda_pagos_frenar_por_riesgo', 'tienda_config_no_borrar_en_prueba')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
    IF f.proname NOT IN ('tienda_pagos_frenar_por_riesgo', 'tienda_config_no_borrar_en_prueba') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.firma);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', f.firma);
    END IF;
  END LOOP;
END $$;
