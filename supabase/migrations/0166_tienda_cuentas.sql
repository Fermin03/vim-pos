-- ============================================================================
-- 0166 — Tienda en línea, entrega 6: las cuentas de los clientes de la tienda.
-- Plan: docs/superpowers/plans/2026-10-09-tienda-en-linea-6-cuentas.md (Task 1)
--
-- Registro, entrar, sesión, recuperar la contraseña, «Mi cuenta», direcciones, mis pedidos y
-- eliminar la cuenta. Todo en funciones definer que solo ejecuta service_role (la Edge Function
-- `tienda`); las tablas siguen cerradas a todo lo demás (0161).
--
-- Tres reglas que valen para todas las funciones:
--   · Aislamiento: todas reciben p_tenant y TODAS sus consultas filtran por él. Una sesión, un
--     enlace o una dirección de otro negocio se comportan como si no existieran.
--   · Secretos: de la contraseña solo existe su bcrypt (coste 10); de los tokens de sesión y de
--     recuperación, su SHA-256 en hex, que es lo que llega aquí. Nada de esto sale en un error.
--   · Sin enumeración: «no existe», «contraseña mala» y «bloqueada» devuelven lo mismo y hacen el
--     mismo trabajo (un crypt() de relleno).
-- search_path lleva `extensions` por crypt()/gen_salt() y por citext, que en la nube viven ahí.
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.*.
-- ============================================================================

-- ── §1 El esquema ────────────────────────────────────────────────────────────
-- Las cuatro tablas son de 0161 y están vacías (nada escribía en ellas hasta hoy).
ALTER TABLE tienda_cuentas ADD COLUMN IF NOT EXISTS email_verificado_at timestamptz NULL;
COMMENT ON COLUMN tienda_cuentas.email_verificado_at IS 'Se sella la primera vez que la cuenta usa un enlace de recuperación: prueba que el correo es suyo.';
COMMENT ON COLUMN tienda_cuentas.password_hash IS 'bcrypt de coste 10 (pgcrypto). La contraseña no se guarda ni se registra.';

-- El teléfono, siempre en 10 dígitos: la misma forma que guarda el pedido y por la que lealtad
-- reconoce al cliente (lealtad_resolver_cliente).
ALTER TABLE tienda_cuentas DROP CONSTRAINT IF EXISTS tienda_cuentas_telefono_10;
ALTER TABLE tienda_cuentas ADD CONSTRAINT tienda_cuentas_telefono_10 CHECK (telefono ~ '^[0-9]{10}$');

-- Requisito de las llaves compuestas de abajo (molde: sucursales_id_tenant_uq, 0161).
CREATE UNIQUE INDEX IF NOT EXISTS tienda_cuentas_id_tenant_uq ON tienda_cuentas (id, tenant_id);

DROP TRIGGER IF EXISTS trg_tienda_cuentas_updated_at ON tienda_cuentas;
CREATE TRIGGER trg_tienda_cuentas_updated_at BEFORE UPDATE ON tienda_cuentas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sesiones, enlaces y direcciones se amarran a la cuenta Y a su negocio: con dos llaves sueltas se
-- podía guardar una sesión «del negocio A» apuntando a una cuenta de B.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tienda_sesiones', 'tienda_recuperaciones', 'tienda_direcciones'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_cuenta_id_fkey');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_cuenta_del_negocio');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (cuenta_id, tenant_id) '
                   'REFERENCES tienda_cuentas (id, tenant_id) ON DELETE CASCADE', t, t || '_cuenta_del_negocio');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tienda_sesiones', 'tienda_recuperaciones'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_huella');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (token_hash ~ %L)', t, t || '_huella', '^[0-9a-f]{64}$');
    -- Para barrer lo vencido sin recorrer la tabla.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expira_at)', 'idx_' || t || '_expira', t);
  END LOOP;
END $$;

ALTER TABLE tienda_sesiones ADD COLUMN IF NOT EXISTS ultimo_uso_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_tienda_recuperaciones_cuenta ON tienda_recuperaciones (cuenta_id);

-- «Mis pedidos»: los de una cuenta, del más reciente al más viejo.
CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_tienda_cuenta
  ON delivery_pedidos (tienda_cuenta_id, recibido_at DESC) WHERE tienda_cuenta_id IS NOT NULL;

-- ── §2 Piezas internas ───────────────────────────────────────────────────────
-- Diez dígitos nacionales, o NULL. La misma regla que normalizarTelefono de la función `tienda`
-- (_shared/tienda/validar.ts): quita adornos (espacios y `()+-.`) y el prefijo de México (52, o 521
-- de celular); una letra no es adorno, y la lada no empieza en 0 ni en 1.
CREATE OR REPLACE FUNCTION _tienda_telefono(p_telefono text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE WHEN b.d ~ '^[2-9][0-9]{9}$' THEN b.d END
    FROM (SELECT CASE WHEN p_telefono !~ '^[0-9[:space:]()+.-]+$' THEN NULL
                      WHEN a.x ~ '^521[0-9]{10}$' THEN substr(a.x, 4)
                      WHEN a.x ~ '^52[0-9]{10}$' THEN substr(a.x, 3)
                      ELSE a.x END AS d
            FROM (SELECT regexp_replace(p_telefono, '[^0-9]', '', 'g') AS x) a) b;
$$;

-- Lo ÚNICO de una cuenta que sale de la base hacia el cliente. Ni id, ni negocio, ni hash, ni contadores.
CREATE OR REPLACE FUNCTION _tienda_cuenta_publica(p_cuenta tienda_cuentas)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object(
    'nombre', (p_cuenta).nombre, 'apellido', (p_cuenta).apellido, 'email', (p_cuenta).email::text,
    'telefono', (p_cuenta).telefono, 'fecha_nacimiento', (p_cuenta).fecha_nacimiento);
$$;

CREATE OR REPLACE FUNCTION _tienda_direcciones(p_tenant uuid, p_cuenta uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'etiqueta', d.etiqueta, 'calle', d.calle, 'numero_exterior', d.numero_exterior,
           'numero_interior', d.numero_interior, 'colonia', d.colonia, 'codigo_postal', d.codigo_postal,
           'ciudad', d.ciudad, 'estado', d.estado, 'referencias', d.referencias) ORDER BY d.created_at, d.id), '[]'::jsonb)
    FROM tienda_direcciones d
   WHERE d.tenant_id = p_tenant AND d.cuenta_id = p_cuenta;
$$;

-- Una sesión de 30 días desde que se crea; usarla no la alarga. Una huella que no sea un SHA-256 en
-- hex la rechaza el CHECK de la tabla (es un error de quien llama, no del cliente).
CREATE OR REPLACE FUNCTION _tienda_abrir_sesion(p_tenant uuid, p_cuenta uuid, p_sesion_hash text, p_ahora timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  INSERT INTO tienda_sesiones (token_hash, cuenta_id, tenant_id, expira_at, created_at, ultimo_uso_at)
  VALUES (p_sesion_hash, p_cuenta, p_tenant, p_ahora + interval '30 days', p_ahora, p_ahora);
$$;

-- ¿Es esta la contraseña de la cuenta? La ÚNICA puerta por la que se compara una contraseña: la usan
-- entrar, cambiar la contraseña y eliminar la cuenta, así que las tres comparten contador y bloqueo
-- (5 fallos seguidos = 15 minutos; molde de verificar_pin_login, 0006).
--   · La cuenta se busca POR NEGOCIO antes de mover nada: un intento contra otro negocio no toca
--     este contador.
--   · Si no existe o está bloqueada: falso, sin evaluar ni contar. Se hace un crypt() contra un hash
--     fijo para tardar lo mismo que una comparación de verdad.
--   · Mala: suma un fallo; al quinto, bloquea y pone el contador en cero. Buena: contador en cero.
-- Como devuelve y no lanza, el contador queda guardado aunque la respuesta sea «no».
CREATE OR REPLACE FUNCTION _tienda_password_ok(p_tenant uuid, p_cuenta uuid, p_password text, p_ahora timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_relleno CONSTANT text := '$2a$10$CCCCCCCCCCCCCCCCCCCCC.';   -- sal válida de coste 10; no es el hash de nada
  v_c tienda_cuentas%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM tienda_cuentas
   WHERE id = p_cuenta AND tenant_id = p_tenant AND deleted_at IS NULL
     FOR UPDATE;
  IF NOT FOUND OR v_c.bloqueada_hasta > p_ahora THEN
    PERFORM crypt(COALESCE(p_password, ''), c_relleno);
    RETURN false;
  END IF;

  -- bcrypt ignora lo que pase del byte 72: una contraseña más larga que el tope no es la buena.
  IF (char_length(p_password) <= 72 AND crypt(p_password, v_c.password_hash) = v_c.password_hash) IS NOT TRUE THEN
    UPDATE tienda_cuentas
       SET intentos_fallidos = CASE WHEN intentos_fallidos >= 4 THEN 0 ELSE intentos_fallidos + 1 END,
           bloqueada_hasta   = CASE WHEN intentos_fallidos >= 4 THEN p_ahora + interval '15 minutes' END
     WHERE id = v_c.id;
    RETURN false;
  END IF;

  IF v_c.intentos_fallidos <> 0 OR v_c.bloqueada_hasta IS NOT NULL THEN
    UPDATE tienda_cuentas SET intentos_fallidos = 0, bloqueada_hasta = NULL WHERE id = v_c.id;
  END IF;
  RETURN true;
END;
$$;

-- ── §3 El estado de un pedido, como lo ve el cliente ─────────────────────────
-- La regla de tienda_seguimiento (0162 §5), sacada a dos funciones para que «mis pedidos» use
-- EXACTAMENTE la misma. _tienda_estado_real: el estado del pedido, o el que se deriva del ticket
-- cuando el ticket vive en la nube (cancelado > cobrado > impreso o con repartidor).
CREATE OR REPLACE FUNCTION _tienda_estado_real(p_pedido delivery_pedidos)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_estado text := p_pedido.estado;
  v_t      record;
BEGIN
  IF p_pedido.gestion = 'NUBE' AND p_pedido.ticket_id IS NOT NULL AND v_estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO') THEN
    SELECT t.estado_fiscal::text AS fiscal, t.ticket_impreso_at,
           EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) AS con_repartidor
      INTO v_t FROM tickets t WHERE t.id = p_pedido.ticket_id AND t.tenant_id = p_pedido.tenant_id;
    IF FOUND THEN
      v_estado := CASE
        WHEN v_t.fiscal = 'CANCELADO' THEN 'CANCELADO'
        WHEN v_t.fiscal IN ('PAGADO', 'FACTURADO') THEN 'ENTREGADO'
        WHEN v_t.ticket_impreso_at IS NOT NULL OR v_t.con_repartidor THEN 'LISTO'
        ELSE v_estado END;
    END IF;
  END IF;
  RETURN v_estado;
END;
$$;

-- …y la palabra que se le enseña al cliente (p_app: 'DELIVERY_PROPIO' = a domicilio).
CREATE OR REPLACE FUNCTION _tienda_estado_publico(p_estado text, p_app text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    -- ERROR no es un final: para 0161 es reintentable. A quien todavía puede recibir su pedido no
    -- se le dice «cancelado»; se ve como recién recibido y sin motivo.
    WHEN p_estado IN ('RECIBIDO', 'ERROR') THEN 'EN_PROCESO'
    WHEN p_estado IN ('ACEPTADO', 'EN_PREPARACION') THEN 'EN_PREPARACION'
    WHEN p_estado = 'LISTO' AND p_app = 'DELIVERY_PROPIO' THEN 'EN_CAMINO'
    WHEN p_estado = 'LISTO' THEN 'LISTO_PARA_RECOGER'
    WHEN p_estado = 'ENTREGADO' THEN 'ENTREGADO'
    ELSE 'CANCELADO' END;
$$;

-- Los renglones de un pedido para enseñarlos: nombre, cantidad y lo que lleva.
CREATE OR REPLACE FUNCTION _tienda_renglones(p_items jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'nombre', i ->> 'nombre_app',
             'cantidad', (i ->> 'cantidad')::integer,
             'detalle', (SELECT string_agg(m ->> 'nombre_app', ', ')
                           FROM jsonb_array_elements(COALESCE(i -> 'modificadores', '[]'::jsonb)) m)))
      FROM jsonb_array_elements(p_items) i), '[]'::jsonb);
$$;

-- Cuerpo copiado de 0162_tienda_funcion.sql; devuelve lo mismo, campo por campo. El estado y los
-- renglones salen ahora de las tres funciones de arriba. (Los comentarios de la regla, en 0162 §5.)
CREATE OR REPLACE FUNCTION tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      delivery_pedidos%ROWTYPE;
  v_estado text;
  v_envio_total numeric(12,2);
BEGIN
  IF p_seguimiento_hash IS NULL OR p_seguimiento_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM delivery_pedidos
   WHERE seguimiento_hash = p_seguimiento_hash AND tenant_id = p_tenant AND canal = 'TIENDA';
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_estado := _tienda_estado_real(v_p);
  v_envio_total := v_p.total_cliente_mxn - COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn);

  RETURN jsonb_build_object(
    'folio_corto', v_p.folio_corto,
    'modo', CASE v_p.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
    'estado', _tienda_estado_publico(v_estado, v_p.app::text),
    'motivo', CASE
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
                   FROM sucursales s WHERE s.id = v_p.sucursal_id));
END;
$$;

-- ── §4 Registro y entrada ────────────────────────────────────────────────────
-- {creada: true, cuenta} y la sesión abierta; o {creada: false} si el correo ya tiene cuenta EN ESE
-- negocio: no crea ni cambia nada y no dice más (el aviso «ya tienes cuenta» lo manda la función por
-- correo). El hash se calcula antes de saber cuál de los dos casos es: tardan lo mismo.
-- Datos mal formados: CUENTA_INVALIDA_DATOS.
CREATE OR REPLACE FUNCTION tienda_cuenta_registrar(
  p_tenant uuid, p_nombre text, p_apellido text, p_email text, p_telefono text, p_password text, p_sesion_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_nombre   text := btrim(p_nombre);
  v_apellido text := btrim(p_apellido);
  v_email    text := lower(btrim(p_email));
  v_tel      text := _tienda_telefono(p_telefono);
  v_c        tienda_cuentas%ROWTYPE;
BEGIN
  -- «IS NOT TRUE»: un dato ausente deja la condición en NULL, y NULL no es válido.
  IF (char_length(v_nombre) BETWEEN 1 AND 100 AND char_length(v_apellido) BETWEEN 1 AND 100
      AND char_length(v_email) <= 254 AND v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      AND v_tel IS NOT NULL
      AND char_length(p_password) BETWEEN 8 AND 72) IS NOT TRUE THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA_DATOS: nombre y apellido de 1 a 100 caracteres, correo válido, teléfono de 10 dígitos y contraseña de 8 a 72 caracteres';
  END IF;

  INSERT INTO tienda_cuentas (tenant_id, email, password_hash, nombre, apellido, telefono)
  VALUES (p_tenant, v_email, crypt(p_password, gen_salt('bf', 10)), v_nombre, v_apellido, v_tel)
  ON CONFLICT (tenant_id, email) WHERE deleted_at IS NULL DO NOTHING
  RETURNING * INTO v_c;
  IF NOT FOUND THEN RETURN jsonb_build_object('creada', false); END IF;

  PERFORM _tienda_abrir_sesion(p_tenant, v_c.id, p_sesion_hash, now());
  RETURN jsonb_build_object('creada', true, 'cuenta', _tienda_cuenta_publica(v_c));
END;
$$;

-- {cuenta} y la sesión abierta, o NULL: credenciales malas, cuenta que no existe o cuenta bloqueada,
-- indistinguibles. De paso barre algunas sesiones vencidas (no hay cron para esto).
CREATE OR REPLACE FUNCTION tienda_cuenta_entrar(
  p_tenant uuid, p_email text, p_password text, p_sesion_hash text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_email citext := lower(btrim(p_email));
  v_id    uuid;
  v_c     tienda_cuentas%ROWTYPE;
BEGIN
  DELETE FROM tienda_sesiones
   WHERE token_hash IN (SELECT s.token_hash FROM tienda_sesiones s WHERE s.expira_at <= p_ahora
                         LIMIT 200 FOR UPDATE SKIP LOCKED);

  SELECT c.id INTO v_id FROM tienda_cuentas c
   WHERE c.tenant_id = p_tenant AND c.email = v_email AND c.deleted_at IS NULL;
  IF NOT _tienda_password_ok(p_tenant, v_id, p_password, p_ahora) THEN RETURN NULL; END IF;

  PERFORM _tienda_abrir_sesion(p_tenant, v_id, p_sesion_hash, p_ahora);
  SELECT * INTO v_c FROM tienda_cuentas WHERE id = v_id AND tenant_id = p_tenant;
  RETURN jsonb_build_object('cuenta', _tienda_cuenta_publica(v_c));
END;
$$;

-- ── §5 La sesión ─────────────────────────────────────────────────────────────
-- La cuenta de una sesión viva DE ESE NEGOCIO, o NULL (no existe, venció, es de otro negocio, o la
-- cuenta ya no está). El id lo usa solo el servidor: nunca viaja al navegador.
-- El último uso se anota como mucho una vez por hora, para no escribir en cada lectura.
CREATE OR REPLACE FUNCTION tienda_sesion_cuenta(p_tenant uuid, p_sesion_hash text, p_ahora timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_s record;
BEGIN
  SELECT s.cuenta_id, s.ultimo_uso_at INTO v_s
    FROM tienda_sesiones s
    JOIN tienda_cuentas c ON c.id = s.cuenta_id AND c.tenant_id = s.tenant_id
   WHERE s.token_hash = p_sesion_hash AND s.tenant_id = p_tenant AND s.expira_at > p_ahora
     AND c.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_s.ultimo_uso_at <= p_ahora - interval '1 hour' THEN
    UPDATE tienda_sesiones SET ultimo_uso_at = p_ahora WHERE token_hash = p_sesion_hash AND tenant_id = p_tenant;
  END IF;
  RETURN v_s.cuenta_id;
END;
$$;

-- Cierra ESA sesión (la de ese teléfono), y solo si es de ese negocio.
CREATE OR REPLACE FUNCTION tienda_cuenta_salir(p_tenant uuid, p_sesion_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  DELETE FROM tienda_sesiones WHERE token_hash = p_sesion_hash AND tenant_id = p_tenant;
$$;

-- ── §6 Recuperar la contraseña ───────────────────────────────────────────────
-- Guarda la huella de un enlace de 30 minutos y un solo uso, y anula los anteriores de esa cuenta.
-- {nombre} (para el correo) o NULL si no hay cuenta: quien llama contesta lo mismo en los dos casos.
-- De paso barre algunos enlaces vencidos.
CREATE OR REPLACE FUNCTION tienda_recuperar_pedir(p_tenant uuid, p_email text, p_token_hash text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_email citext := lower(btrim(p_email));
  v_c     tienda_cuentas%ROWTYPE;
BEGIN
  DELETE FROM tienda_recuperaciones
   WHERE token_hash IN (SELECT r.token_hash FROM tienda_recuperaciones r WHERE r.expira_at <= p_ahora
                         LIMIT 200 FOR UPDATE SKIP LOCKED);

  SELECT * INTO v_c FROM tienda_cuentas c
   WHERE c.tenant_id = p_tenant AND c.email = v_email AND c.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  DELETE FROM tienda_recuperaciones WHERE cuenta_id = v_c.id AND tenant_id = p_tenant AND usada_at IS NULL;
  INSERT INTO tienda_recuperaciones (token_hash, cuenta_id, tenant_id, expira_at, created_at)
  VALUES (p_token_hash, v_c.id, p_tenant, p_ahora + interval '30 minutes', p_ahora);
  RETURN jsonb_build_object('nombre', v_c.nombre);
END;
$$;

-- Gasta el enlace: cambia la contraseña, cierra TODAS las sesiones de la cuenta, levanta el
-- bloqueo, sella el correo como verificado (solo la primera vez) y abre la sesión nueva.
-- {cuenta}, o NULL si el enlace no existe, venció, ya se usó o es de otro negocio.
-- Una contraseña mal formada es CUENTA_INVALIDA_DATOS y NO gasta el enlace.
CREATE OR REPLACE FUNCTION tienda_recuperar_aplicar(
  p_tenant uuid, p_token_hash text, p_password text, p_sesion_hash text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cuenta uuid;
  v_c      tienda_cuentas%ROWTYPE;
BEGIN
  IF (char_length(p_password) BETWEEN 8 AND 72) IS NOT TRUE THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA_DATOS: la contraseña lleva de 8 a 72 caracteres';
  END IF;

  UPDATE tienda_recuperaciones SET usada_at = p_ahora
   WHERE token_hash = p_token_hash AND tenant_id = p_tenant AND usada_at IS NULL AND expira_at > p_ahora
  RETURNING cuenta_id INTO v_cuenta;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE tienda_cuentas
     SET password_hash = crypt(p_password, gen_salt('bf', 10)),
         intentos_fallidos = 0, bloqueada_hasta = NULL,
         email_verificado_at = COALESCE(email_verificado_at, p_ahora)
   WHERE id = v_cuenta AND tenant_id = p_tenant AND deleted_at IS NULL
  RETURNING * INTO v_c;
  IF NOT FOUND THEN RETURN NULL; END IF;

  DELETE FROM tienda_sesiones WHERE cuenta_id = v_cuenta AND tenant_id = p_tenant;
  PERFORM _tienda_abrir_sesion(p_tenant, v_cuenta, p_sesion_hash, p_ahora);
  RETURN jsonb_build_object('cuenta', _tienda_cuenta_publica(v_c));
END;
$$;

-- ── §7 «Mi cuenta» ───────────────────────────────────────────────────────────
-- {cuenta, direcciones}, o NULL si esa cuenta no es de ese negocio.
CREATE OR REPLACE FUNCTION tienda_cuenta_leer(p_tenant uuid, p_cuenta uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object('cuenta', _tienda_cuenta_publica(c), 'direcciones', _tienda_direcciones(p_tenant, c.id))
    FROM tienda_cuentas c
   WHERE c.id = p_cuenta AND c.tenant_id = p_tenant AND c.deleted_at IS NULL;
$$;

-- {cuenta} con los datos nuevos, o NULL si la cuenta no es de ese negocio. El correo no se cambia
-- aquí. La fecha de nacimiento es opcional (NULL la quita). Mal formados: CUENTA_INVALIDA_DATOS.
CREATE OR REPLACE FUNCTION tienda_cuenta_guardar(
  p_tenant uuid, p_cuenta uuid, p_nombre text, p_apellido text, p_telefono text, p_fecha_nacimiento date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_nombre   text := btrim(p_nombre);
  v_apellido text := btrim(p_apellido);
  v_tel      text := _tienda_telefono(p_telefono);
  v_c        tienda_cuentas%ROWTYPE;
BEGIN
  IF (char_length(v_nombre) BETWEEN 1 AND 100 AND char_length(v_apellido) BETWEEN 1 AND 100 AND v_tel IS NOT NULL
      AND (p_fecha_nacimiento IS NULL
           OR p_fecha_nacimiento BETWEEN DATE '1900-01-01' AND (now() AT TIME ZONE 'America/Mexico_City')::date)) IS NOT TRUE THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA_DATOS: nombre y apellido de 1 a 100 caracteres, teléfono de 10 dígitos y fecha de nacimiento real o ausente';
  END IF;

  UPDATE tienda_cuentas
     SET nombre = v_nombre, apellido = v_apellido, telefono = v_tel, fecha_nacimiento = p_fecha_nacimiento
   WHERE id = p_cuenta AND tenant_id = p_tenant AND deleted_at IS NULL
  RETURNING * INTO v_c;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('cuenta', _tienda_cuenta_publica(v_c));
END;
$$;

-- Cambia la contraseña desde dentro: exige la actual (cuenta para el bloqueo, como entrar) y cierra
-- las demás sesiones; la presente (p_sesion_hash) sigue. Falso si la actual no es.
CREATE OR REPLACE FUNCTION tienda_cuenta_password(p_tenant uuid, p_cuenta uuid, p_actual text, p_nueva text, p_sesion_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF (char_length(p_nueva) BETWEEN 8 AND 72) IS NOT TRUE THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA_DATOS: la contraseña lleva de 8 a 72 caracteres';
  END IF;
  IF NOT _tienda_password_ok(p_tenant, p_cuenta, p_actual, now()) THEN RETURN false; END IF;

  UPDATE tienda_cuentas SET password_hash = crypt(p_nueva, gen_salt('bf', 10))
   WHERE id = p_cuenta AND tenant_id = p_tenant;
  DELETE FROM tienda_sesiones
   WHERE cuenta_id = p_cuenta AND tenant_id = p_tenant AND token_hash IS DISTINCT FROM p_sesion_hash;
  RETURN true;
END;
$$;

-- ── §8 Direcciones guardadas ─────────────────────────────────────────────────
-- p_id NULL = nueva (hasta 5 por cuenta: DIRECCIONES_LLENAS); con p_id, edita ESA dirección de ESA
-- cuenta —si es de otra, no toca nada—. La dirección se valida con la regla del pedido (0162 §4,
-- paso 6): recortada, solo con sus claves, código postal de 5 dígitos; si no, DIRECCION_INVALIDA.
-- Devuelve la lista de direcciones de la cuenta.
-- No guarda zona de envío: las zonas son por sucursal y se eligen al pedir.
CREATE OR REPLACE FUNCTION tienda_direccion_guardar(p_tenant uuid, p_cuenta uuid, p_id uuid, p_etiqueta text, p_direccion jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_etiqueta text := COALESCE(NULLIF(btrim(p_etiqueta), ''), 'Casa');
  v_ok  boolean;
  v_dir jsonb;
BEGIN
  SELECT bool_and(char_length(x.valor) BETWEEN k.minimo AND k.maximo),
         jsonb_object_agg(k.clave, x.valor) FILTER (WHERE x.valor <> '')
    INTO v_ok, v_dir
    FROM (VALUES ('calle', 1, 255), ('numero_exterior', 1, 20), ('numero_interior', 0, 20), ('colonia', 1, 150),
                 ('codigo_postal', 5, 5), ('ciudad', 1, 100), ('estado', 1, 50), ('referencias', 0, 300)) AS k(clave, minimo, maximo)
   CROSS JOIN LATERAL (SELECT btrim(COALESCE(CASE WHEN jsonb_typeof(p_direccion) = 'object' THEN p_direccion ->> k.clave END, ''))) AS x(valor);
  IF (v_ok AND v_dir ->> 'codigo_postal' ~ '^[0-9]{5}$' AND char_length(v_etiqueta) <= 50) IS NOT TRUE THEN
    RAISE EXCEPTION 'DIRECCION_INVALIDA: hacen falta calle, número, colonia, código postal de 5 dígitos, ciudad y estado; la etiqueta, de hasta 50 caracteres';
  END IF;

  -- La fila de la cuenta, con candado: dos altas a la vez no pasan las dos el tope.
  PERFORM 1 FROM tienda_cuentas WHERE id = p_cuenta AND tenant_id = p_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_INVALIDA: la cuenta no existe en este negocio'; END IF;

  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM tienda_direcciones WHERE cuenta_id = p_cuenta AND tenant_id = p_tenant) >= 5 THEN
      RAISE EXCEPTION 'DIRECCIONES_LLENAS: una cuenta guarda hasta 5 direcciones';
    END IF;
    -- created_at con el reloj real y no el de la transacción: es el orden de la lista.
    INSERT INTO tienda_direcciones (cuenta_id, tenant_id, etiqueta, calle, numero_exterior, numero_interior,
                                    colonia, codigo_postal, ciudad, estado, referencias, created_at)
    VALUES (p_cuenta, p_tenant, v_etiqueta, v_dir ->> 'calle', v_dir ->> 'numero_exterior', v_dir ->> 'numero_interior',
            v_dir ->> 'colonia', v_dir ->> 'codigo_postal', v_dir ->> 'ciudad', v_dir ->> 'estado', v_dir ->> 'referencias',
            clock_timestamp());
  ELSE
    UPDATE tienda_direcciones
       SET etiqueta = v_etiqueta, calle = v_dir ->> 'calle', numero_exterior = v_dir ->> 'numero_exterior',
           numero_interior = v_dir ->> 'numero_interior', colonia = v_dir ->> 'colonia',
           codigo_postal = v_dir ->> 'codigo_postal', ciudad = v_dir ->> 'ciudad', estado = v_dir ->> 'estado',
           referencias = v_dir ->> 'referencias', zona_envio_id = NULL
     WHERE id = p_id AND cuenta_id = p_cuenta AND tenant_id = p_tenant;
  END IF;
  RETURN _tienda_direcciones(p_tenant, p_cuenta);
END;
$$;

-- Borra ESA dirección de ESA cuenta (la de otra no se toca) y devuelve la lista.
CREATE OR REPLACE FUNCTION tienda_direccion_borrar(p_tenant uuid, p_cuenta uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  DELETE FROM tienda_direcciones WHERE id = p_id AND cuenta_id = p_cuenta AND tenant_id = p_tenant;
  RETURN _tienda_direcciones(p_tenant, p_cuenta);
END;
$$;

-- ── §9 Mis pedidos ───────────────────────────────────────────────────────────
-- Los últimos 20 pedidos en línea que esa cuenta hizo con su sesión, en ese negocio. Sin teléfono,
-- dirección ni seguimiento (la huella no sirve para armar el enlace, y el código no se guarda).
-- `items` es el pedido en la forma del carrito, para «pedir de nuevo»: lo que guardó
-- tienda_cotizar (0162), de vuelta a {producto_id, cantidad, nota, modificadores, componentes}. En
-- lo guardado, una elección de combo es el modificador que lleva grupo_id (0162:566-572).
-- Los precios NO viajan: al pedir de nuevo se cotiza otra vez con los de hoy.
-- Un pedido que la retención ya anonimizó (0161) sigue en la lista, con `items` en null.
CREATE OR REPLACE FUNCTION tienda_mis_pedidos(p_tenant uuid, p_cuenta uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'sucursal_id', d.sucursal_id,   -- «pedir de nuevo» arma el carrito de ESA sucursal
           'folio_corto', d.folio_corto,
           'recibido_at', d.recibido_at,
           'modo', CASE d.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
           'estado', _tienda_estado_publico(_tienda_estado_real(d), d.app::text),
           'total_mxn', to_char(d.total_cliente_mxn, 'FM999999990.00'),
           'renglones', _tienda_renglones(d.items),
           'items', CASE WHEN d.payload_raw IS DISTINCT FROM '{"anonimizado": true}'::jsonb THEN (
             SELECT jsonb_agg(jsonb_build_object(
                      'producto_id', i.r ->> 'producto_id',
                      'cantidad', (i.r ->> 'cantidad')::integer,
                      'nota', i.r -> 'nota',
                      'modificadores', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object('opcion_id', m.e ->> 'opcion_modificador_id',
                                                            'cantidad', (m.e ->> 'cantidad')::integer) ORDER BY m.ord)
                          FROM jsonb_array_elements(COALESCE(i.r -> 'modificadores', '[]'::jsonb)) WITH ORDINALITY AS m(e, ord)
                         WHERE m.e ->> 'grupo_id' IS NULL), '[]'::jsonb),
                      'componentes', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                                 'grupo_id', m.e ->> 'grupo_id',
                                 'producto_id', m.e ->> 'opcion_modificador_id',
                                 'cantidad', (m.e ->> 'cantidad')::integer,
                                 'modificadores', COALESCE((
                                   SELECT jsonb_agg(jsonb_build_object('opcion_id', n.e ->> 'opcion_modificador_id',
                                                                       'cantidad', (n.e ->> 'cantidad')::integer) ORDER BY n.ord)
                                     FROM jsonb_array_elements(COALESCE(m.e -> 'modificadores', '[]'::jsonb)) WITH ORDINALITY AS n(e, ord)),
                                   '[]'::jsonb)) ORDER BY m.ord)
                          FROM jsonb_array_elements(COALESCE(i.r -> 'modificadores', '[]'::jsonb)) WITH ORDINALITY AS m(e, ord)
                         WHERE m.e ->> 'grupo_id' IS NOT NULL), '[]'::jsonb)) ORDER BY i.ord)
               FROM jsonb_array_elements(d.items) WITH ORDINALITY AS i(r, ord)) END)
           ORDER BY d.recibido_at DESC, d.id), '[]'::jsonb)
    FROM delivery_pedidos d
   WHERE d.id IN (SELECT u.id FROM delivery_pedidos u
                   WHERE u.tenant_id = p_tenant AND u.tienda_cuenta_id = p_cuenta AND u.canal = 'TIENDA'
                   ORDER BY u.recibido_at DESC, u.id LIMIT 20);
$$;

-- ── §10 Eliminar la cuenta ───────────────────────────────────────────────────
-- Pide la contraseña (falso si no es; cuenta para el bloqueo). Borra la cuenta y, en cascada, sus
-- sesiones, sus enlaces y sus direcciones guardadas; sus pedidos se quedan —son del restaurante—
-- desligados de la cuenta. El cliente y las direcciones que un ticket creó en el negocio
-- (clientes, direcciones_cliente) no cuelgan de la cuenta y no se tocan.
CREATE OR REPLACE FUNCTION tienda_cuenta_eliminar(p_tenant uuid, p_cuenta uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT _tienda_password_ok(p_tenant, p_cuenta, p_password, now()) THEN RETURN false; END IF;
  UPDATE delivery_pedidos SET tienda_cuenta_id = NULL WHERE tenant_id = p_tenant AND tienda_cuenta_id = p_cuenta;
  DELETE FROM tienda_cuentas WHERE id = p_cuenta AND tenant_id = p_tenant;
  RETURN true;
END;
$$;

-- ── §11 Privilegios ──────────────────────────────────────────────────────────
-- Nada para el público ni para el personal. Las internas (_tienda_*) no se le dan ni a
-- service_role: solo las llaman las funciones definer de arriba. Los nombres no tienen sobrecargas.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma, p.proname
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_cuenta_registrar', 'tienda_cuenta_entrar', 'tienda_sesion_cuenta', 'tienda_cuenta_salir',
                                'tienda_recuperar_pedir', 'tienda_recuperar_aplicar', 'tienda_cuenta_leer', 'tienda_cuenta_guardar',
                                'tienda_cuenta_password', 'tienda_direccion_guardar', 'tienda_direccion_borrar', 'tienda_mis_pedidos',
                                'tienda_cuenta_eliminar', 'tienda_seguimiento',
                                '_tienda_telefono', '_tienda_cuenta_publica', '_tienda_direcciones', '_tienda_abrir_sesion',
                                '_tienda_password_ok', '_tienda_estado_real', '_tienda_estado_publico', '_tienda_renglones')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
    IF f.proname NOT LIKE '\_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.firma);
    END IF;
  END LOOP;
END $$;
