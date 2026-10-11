-- ============================================================================
-- 0172 — Pago en línea de la tienda (Checkout API de Mercado Pago: tarjeta dentro de la tienda): la base.
-- El cobro se hace en la misma petición que crea el pedido (POST /v1/payments con el token de la
-- tarjeta). No hay preferencia, ni redirección, ni un pedido «esperando pago» a la vista del cliente.
-- Diseño: docs/integraciones/mercado-pago-checkout-pro/02-diseno.md
--
-- REGLA DE ORO: aplicar esta migración no cambia nada de lo que hoy funciona. Ningún negocio tiene
-- `tienda_config.pago_en_linea` encendido, así que ningún pedido puede nacer POR_PAGAR; los pedidos
-- de efectivo, de tarjeta al recibir y de Uber recorren exactamente el mismo camino que antes.
--
--   §1 Esquema: estado POR_PAGAR, pago EN_LINEA, pagado_at, la casilla del dueño, la cuenta que
--      cobra por sucursal y la tabla tienda_pagos.
--   §2 Un pedido sin pagar no existe para quien atiende: la política de lectura lo esconde.
--   §3 Qué cuenta cobra, y tienda_negocio que lo dice.
--   §4 tienda_crear_pedido con pago en línea y propina.
--   §5 El pago: aplicar lo que dice Mercado Pago, descartar, y las piezas del barrido.
--   §6 Devolver: todo pedido con pago aprobado que termina rechazado, vencido o cancelado.
--   §7 Aceptar un pedido pagado: la cuenta nace cobrada.
--   §8 Estados: un pedido pagado en línea no está «entregado» por estar cobrado; seguimiento.
--   §9 El barrido de cada minuto y su programación.
--
-- Corre también en el Postgres embebido de la caja: no toca storage.*; cron.* y net.* van con
-- EXECUTE o detrás de un IF (como 0093 y 0097). Allá tienda_pagos queda vacía: los pagos viven en
-- la nube, y a la caja solo le llega el pedido ya pagado.
-- ============================================================================

-- ── §1 Esquema ───────────────────────────────────────────────────────────────
ALTER TABLE delivery_pedidos DROP CONSTRAINT IF EXISTS delivery_pedido_estado_valido;
ALTER TABLE delivery_pedidos ADD CONSTRAINT delivery_pedido_estado_valido CHECK (
  estado IN ('POR_PAGAR', 'RECIBIDO', 'ACEPTADO', 'RECHAZADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO', 'EXPIRADO', 'ERROR'));

-- La restricción de pago_al_recibir de la 0161 era anónima: se busca por lo que dice y se repone con nombre.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.delivery_pedidos'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%pago_al_recibir%' LOOP
    EXECUTE format('ALTER TABLE delivery_pedidos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE delivery_pedidos ADD COLUMN IF NOT EXISTS pagado_at timestamptz NULL;
ALTER TABLE delivery_pedidos
  ADD CONSTRAINT delivery_pedido_pago_valido CHECK (pago_al_recibir IN ('EFECTIVO', 'TARJETA', 'EN_LINEA')),
  -- Solo un pedido que se paga en línea puede estar esperando su pago.
  ADD CONSTRAINT delivery_pedido_por_pagar_en_linea CHECK (estado <> 'POR_PAGAR' OR pago_al_recibir IS NOT DISTINCT FROM 'EN_LINEA');
COMMENT ON COLUMN delivery_pedidos.pago_al_recibir IS 'Canal TIENDA: EFECTIVO o TARJETA (se cobra al recibir) o EN_LINEA (ya pagado con Mercado Pago).';
COMMENT ON COLUMN delivery_pedidos.pagado_at IS 'Solo pago EN_LINEA: cuándo se confirmó el pago. NULL = nunca se pagó, y entonces el pedido no existe para la caja ni para el POS.';
-- delivery_pedidos.propina_mxn ya existe (0090): en un pedido de la tienda pagado en línea es la
-- propina que el cliente eligió, y va APARTE de total_cliente_mxn (que sigue siendo el total del ticket).

ALTER TABLE tienda_config ADD COLUMN IF NOT EXISTS pago_en_linea boolean NOT NULL DEFAULT false;
ALTER TABLE tienda_config DROP CONSTRAINT IF EXISTS tienda_config_algun_pago;
ALTER TABLE tienda_config ADD CONSTRAINT tienda_config_algun_pago CHECK (pago_efectivo OR pago_tarjeta OR pago_en_linea);
COMMENT ON COLUMN tienda_config.pago_en_linea IS 'El dueño ofrece pagar en línea con Mercado Pago. Solo vale en las sucursales con una cuenta que cobre (tienda_conexion_cobro).';

-- Qué cuenta de Mercado Pago cobra en esta sucursal. NULL = la única conexión activa del negocio.
ALTER TABLE tienda_sucursales
  ADD COLUMN IF NOT EXISTS conexion_id uuid NULL REFERENCES terminal_conexiones(id) ON DELETE SET NULL;
COMMENT ON COLUMN tienda_sucursales.conexion_id IS 'Cuenta de Mercado Pago (terminal_conexiones) que cobra los pedidos en línea de la sucursal. NULL = la única activa del negocio.';

-- La public key de la cuenta de Mercado Pago del restaurante (viene en la respuesta de OAuth). No
-- es secreta: con ella el navegador del cliente convierte su tarjeta en un token. Sin ella no se
-- puede cobrar en línea con esa cuenta (hay que volver a conectarla).
ALTER TABLE terminal_conexiones ADD COLUMN IF NOT EXISTS public_key text NULL;
COMMENT ON COLUMN terminal_conexiones.public_key IS 'Public key de la cuenta (respuesta de /oauth/token). Pública: la usa la tienda para tokenizar la tarjeta. NULL = conectada antes de guardarla; no cobra en línea hasta reconectar.';

-- Un intento de pago. Su id ES la external_reference del cobro en Mercado Pago.
-- `extra`: un pago aprobado que llegó con nuestra referencia y NO es el del pedido (por otro
-- monto, o un segundo cobro). No se honra: se registra para devolverlo.
CREATE TABLE IF NOT EXISTS tienda_pagos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pedido_id             uuid NOT NULL REFERENCES delivery_pedidos(id) ON DELETE CASCADE,
  conexion_id           uuid NOT NULL REFERENCES terminal_conexiones(id),
  monto_mxn             numeric(12,2) NOT NULL CHECK (monto_mxn > 0),      -- total del pedido + propina
  propina_mxn           numeric(12,2) NOT NULL DEFAULT 0 CHECK (propina_mxn >= 0),
  estado                varchar(20) NOT NULL DEFAULT 'CREADO',
  extra                 boolean NOT NULL DEFAULT false,
  cobro_pedido_at       timestamptz NULL,          -- cuándo se le mandó el cobro a Mercado Pago. UNA sola vez por renglón
  pago_id_externo       text NULL,                 -- id del pago en Mercado Pago
  tipo_tarjeta          varchar(20) NULL,          -- credit_card | debit_card | account_money
  marca                 varchar(30) NULL,
  detalle               text NULL,                 -- status_detail del último rechazo
  vence_at              timestamptz NOT NULL,      -- hasta cuándo se espera que el cobro se confirme
  aprobado_at           timestamptz NULL,
  devuelto_at           timestamptz NULL,
  consultado_at         timestamptz NULL,          -- última consulta a Mercado Pago (para no preguntar seguido)
  conciliaciones        integer NOT NULL DEFAULT 0,   -- veces que Mercado Pago contestó por él ya VENCIDO
  conciliacion_fallos   integer NOT NULL DEFAULT 0,   -- consultas seguidas del barrido que no se pudieron hacer
  conciliado_at         timestamptz NULL,          -- se dejó de preguntar: dos respuestas ya vencido, o 48 h
  correo_at            timestamptz NULL,          -- ya salió el correo de confirmación
  intentos              integer NOT NULL DEFAULT 0,   -- devoluciones fallidas
  proximo_intento_at    timestamptz NULL,
  ultimo_error          text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tienda_pago_estado_valido CHECK (
    estado IN ('CREADO', 'APROBADO', 'RECHAZADO', 'VENCIDO', 'POR_DEVOLVER', 'DEVUELTO', 'DEVOLUCION_FALLIDA'))
);
COMMENT ON TABLE tienda_pagos IS 'Pago en línea de un pedido de la tienda (Checkout Pro de Mercado Pago). Su id es la referencia en Mercado Pago. Solo la escriben las funciones; el admin la lee.';
-- Un pago por pedido (los `extra` son los que se devuelven) y un renglón por pago de Mercado Pago.
CREATE UNIQUE INDEX IF NOT EXISTS tienda_pagos_pedido_uq ON tienda_pagos (pedido_id) WHERE NOT extra;
CREATE UNIQUE INDEX IF NOT EXISTS tienda_pagos_pago_externo_uq ON tienda_pagos (pago_id_externo) WHERE pago_id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tienda_pagos_pedido ON tienda_pagos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_tienda_pagos_tenant ON tienda_pagos (tenant_id, created_at DESC);

ALTER TABLE tienda_pagos ENABLE ROW LEVEL SECURITY;
-- Nada para anon: en la nube, los privilegios por omisión del proyecto se lo darían.
REVOKE ALL ON tienda_pagos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON tienda_pagos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tienda_pagos TO service_role;
DROP POLICY IF EXISTS tienda_pagos_select ON tienda_pagos;
CREATE POLICY tienda_pagos_select ON tienda_pagos
  FOR SELECT USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
DROP TRIGGER IF EXISTS trg_tienda_pagos_updated_at ON tienda_pagos;
CREATE TRIGGER trg_tienda_pagos_updated_at BEFORE UPDATE ON tienda_pagos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §2 Un pedido sin pagar no existe para quien atiende ──────────────────────
-- El POS web lee delivery_pedidos bajo RLS (de esa lectura salen la lista, el timbre y los
-- contadores) y la vista de vencidos del día hereda esta política. Se esconde aquí, y no en cada consulta, lo que nunca se
-- pagó: el que espera su pago y el que venció sin pagarse. Todo lo demás se ve como siempre
-- («IS DISTINCT FROM»: en un pedido de app pago_al_recibir es NULL, y NULL tiene que pasar).
-- La caja instalada no lee esta tabla de la nube: se lo filtra delivery-espejo.
DROP POLICY IF EXISTS delivery_pedidos_select ON delivery_pedidos;
CREATE POLICY delivery_pedidos_select ON delivery_pedidos FOR SELECT
  USING (tenant_id = current_tenant_id() AND (pago_al_recibir IS DISTINCT FROM 'EN_LINEA' OR pagado_at IS NOT NULL));

-- ── §3 Qué cuenta cobra ──────────────────────────────────────────────────────
-- ¿`p_version` (cajas.version_app) es `p_minima` o posterior? Número a número. Lo que no sea
-- `n.n.n` cuenta como viejo (misma regla que versionAlMenos en _shared/delivery/enlinea.ts).
CREATE OR REPLACE FUNCTION _tienda_version_al_menos(p_version text, p_minima integer[])
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN btrim(p_version) ~ '^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}$'
              THEN string_to_array(btrim(p_version), '.')::integer[] >= p_minima
              ELSE false END;
$$;

-- ¿Late en la sucursal una caja instalada que sabe atender un pedido ya pagado (0.9.0 o posterior)?
-- Misma ventana que sucursal_con_espejo (0096). La usan quien decide si se ofrece el pago en línea
-- y quien decide, al pagarse, si el pedido lo atiende una caja (tienda_pago_aplicar).
CREATE OR REPLACE FUNCTION _tienda_caja_en_linea_viva(p_sucursal uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM cajas c WHERE c.sucursal_id = p_sucursal AND c.activa
                  AND c.espejo_apps_at > now() - interval '90 seconds'
                  AND _tienda_version_al_menos(c.version_app, ARRAY[0, 9, 0]));
$$;

-- La conexión de Mercado Pago que cobra los pedidos en línea de una sucursal, o NULL si ahí no se
-- puede pagar en línea. Tres condiciones:
--   · el dueño lo ofrece (tienda_config.pago_en_linea);
--   · hay una cuenta: la que eligió para la sucursal, si sigue ACTIVA; si no eligió, la única
--     ACTIVA del negocio. Con varias y sin elegir, ninguna: no se adivina a quién le cae el dinero.
--     Si la que eligió se desconectó tampoco se usa otra, por lo mismo;
--   · si en la sucursal late una caja instalada, alguna de las que laten sabe atender un pedido ya
--     pagado (0.9.0). Una anterior le crearía la cuenta SIN el pago y el cajero cobraría otra vez.
CREATE OR REPLACE FUNCTION tienda_conexion_cobro(p_tenant uuid, p_sucursal uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_elegida uuid;
  v_id      uuid;
BEGIN
  IF NOT COALESCE((SELECT c.pago_en_linea FROM tienda_config c WHERE c.tenant_id = p_tenant), false) THEN RETURN NULL; END IF;

  IF sucursal_con_espejo(p_sucursal) AND NOT _tienda_caja_en_linea_viva(p_sucursal) THEN RETURN NULL; END IF;

  SELECT ts.conexion_id INTO v_elegida FROM tienda_sucursales ts
   WHERE ts.sucursal_id = p_sucursal AND ts.tenant_id = p_tenant;
  IF v_elegida IS NOT NULL THEN
    SELECT x.id INTO v_id FROM terminal_conexiones x
     WHERE x.id = v_elegida AND x.tenant_id = p_tenant AND x.proveedor = 'MERCADO_PAGO' AND x.estado = 'ACTIVA'
       AND x.public_key IS NOT NULL    -- sin public key la tienda no puede tokenizar la tarjeta
       -- Una conexión de PRUEBA nunca cobra en la tienda: el cliente vería «pagado» sin haber pagado.
       -- (`tenants` no tiene una marca fiable de «negocio de pruebas»: INTERNO incluye a un restaurante real.)
       AND NOT x.de_prueba;
    RETURN v_id;
  END IF;

  IF (SELECT count(*) FROM terminal_conexiones x
       WHERE x.tenant_id = p_tenant AND x.proveedor = 'MERCADO_PAGO' AND x.estado = 'ACTIVA') = 1 THEN
    SELECT x.id INTO v_id FROM terminal_conexiones x
     WHERE x.tenant_id = p_tenant AND x.proveedor = 'MERCADO_PAGO' AND x.estado = 'ACTIVA'
       AND x.public_key IS NOT NULL AND NOT x.de_prueba;
  END IF;
  RETURN v_id;
END;
$$;

-- tienda_negocio: cuerpo copiado ÍNTEGRO de 0163_tienda_admin.sql §4. Se añaden dos claves:
-- `pago_en_linea` en el negocio (lo que el dueño ofrece) y en cada sucursal (si AHÍ se puede pagar
-- en línea ahora: tienda_conexion_cobro). La tienda enseña la opción solo donde las dos dicen sí.
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
           'public_key', (SELECT x.public_key FROM terminal_conexiones x WHERE x.id = tienda_conexion_cobro(v_c.tenant_id, s.id)),
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
      'sucursales', v_sucursales));
END;
$$;

-- ── §4 El alta del pedido, con pago en línea y propina ───────────────────────
-- Lo que devuelve tienda_crear_pedido, en un solo sitio (lo arman el alta, el reintento y la
-- segunda red). En un pedido que se paga en línea añade `pago_id` (interno: la función `tienda`
-- no lo enseña), la propina, lo que se cobra en total y hasta cuándo se puede pagar. En los demás,
-- las mismas cinco claves de siempre.
CREATE OR REPLACE FUNCTION _tienda_pedido_creado(p_pedido delivery_pedidos, p_ya_existia boolean)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
           'pedido_id', (p_pedido).id, 'folio_corto', (p_pedido).folio_corto,
           'total_mxn', to_char((p_pedido).total_cliente_mxn, 'FM999999990.00'),
           'vence_aceptacion', (p_pedido).vence_aceptacion, 'ya_existia', p_ya_existia)
         || COALESCE((
           SELECT jsonb_build_object(
                    'pago_id', g.id,
                    'propina_mxn', to_char(g.propina_mxn, 'FM999999990.00'),
                    'total_a_pagar_mxn', to_char(g.monto_mxn, 'FM999999990.00'))
             FROM tienda_pagos g WHERE g.pedido_id = (p_pedido).id AND NOT g.extra), '{}'::jsonb);
$$;

-- tienda_crear_pedido: cuerpo copiado ÍNTEGRO de 0167_tienda_salida.sql §2. Cambia, por el pago en línea:
--   · el parámetro nuevo p_propina_pct, al final (se llama por nombre);
--   · paso 3: EN_LINEA vale donde hay cuenta que cobre (tienda_conexion_cobro); la propina va solo
--     con EN_LINEA y es 0, 10, 15 o 20 por ciento;
--   · paso 4: la propina se calcula AQUÍ, sobre los productos (subtotal_mxn, sin el envío);
--   · paso 9: un pedido que espera su pago cuenta como vivo para el tope del cliente;
--   · paso 10: el pedido en línea nace POR_PAGAR, sin ventana de aceptación (empieza cuando se
--     paga: tienda_pago_aplicar), y con su renglón en tienda_pagos por total + propina;
--   · lo que devuelve sale de _tienda_pedido_creado.
-- La firma cambia, así que la anterior se va: con dos, PostgREST no sabría a cuál llamar.
DROP FUNCTION IF EXISTS tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text);
CREATE OR REPLACE FUNCTION tienda_crear_pedido(
  p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
  p_cliente jsonb,          -- {nombre, telefono (10 dígitos), email | null}
  p_direccion jsonb,        -- NULL al recoger; a domicilio {calle, numero_exterior, numero_interior?, colonia, codigo_postal, ciudad, estado, referencias?}
  p_pago text,              -- 'EFECTIVO' | 'TARJETA' | 'EN_LINEA'
  p_paga_con numeric,       -- NULL salvo EFECTIVO
  p_nota text,
  p_seguimiento_hash text,  -- SHA-256 en hex del código que solo conoce el cliente
  p_cuenta uuid DEFAULT NULL,
  p_total_esperado numeric DEFAULT NULL,
  p_clave text DEFAULT NULL,  -- la llave del intento de compra: con ella, repetir devuelve el mismo pedido
  p_propina_pct integer DEFAULT NULL)  -- solo EN_LINEA: 0, 10, 15 o 20. NULL = sin propina
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
  v_ped    delivery_pedidos%ROWTYPE;
  v_en_linea boolean := p_pago IS NOT DISTINCT FROM 'EN_LINEA';
  v_conexion uuid;
  v_propina  numeric(12,2) := 0;
BEGIN
  -- 0) El reintento. Va antes que todo: quien reintenta ya tiene su pedido, y da igual que desde
  --    entonces la tienda haya cerrado, un precio haya cambiado o él haya llegado a su tope de
  --    pedidos vivos. Se busca por huella Y negocio (el índice es único en toda la plataforma: la
  --    huella de otro negocio no se devuelve). El candado pone en fila a dos envíos simultáneos
  --    del mismo intento: el segundo espera a que el primero termine y aquí ya lo encuentra.
  IF p_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tienda_clave:' || COALESCE(p_seguimiento_hash, ''), 0));
    SELECT * INTO v_ped FROM delivery_pedidos d
     WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
    IF FOUND THEN RETURN _tienda_pedido_creado(v_ped, true); END IF;
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
  --    En línea, además, la sucursal tiene que tener quién cobre AHORA (tienda_conexion_cobro).
  SELECT * INTO v_cfg FROM tienda_config WHERE tenant_id = p_tenant;
  IF v_en_linea THEN v_conexion := tienda_conexion_cobro(p_tenant, p_sucursal); END IF;
  IF ((p_pago = 'EFECTIVO' AND v_cfg.pago_efectivo) OR (p_pago = 'TARJETA' AND v_cfg.pago_tarjeta)
      OR (v_en_linea AND v_conexion IS NOT NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: esa forma de pago no está disponible';
  END IF;
  -- En línea el correo es obligatorio: Mercado Pago lo pide con el cobro, y ahí llega la confirmación.
  IF v_en_linea AND v_email IS NULL THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO: para pagar en línea hace falta el correo';
  END IF;
  IF p_propina_pct IS NOT NULL AND (NOT v_en_linea OR p_propina_pct NOT IN (0, 10, 15, 20)) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: la propina va solo con el pago en línea y es de 0, 10, 15 o 20 por ciento';
  END IF;

  -- 4) La cotización: valida el carrito y la zona, y pone los renglones y los importes. Sus errores
  --    pasan tal cual. Y el total, si el cliente dijo cuál vio, tiene que seguir siendo ese.
  --    La propina es un porcentaje de los PRODUCTOS (sin el envío) y la calcula el servidor; no
  --    entra en el total del pedido: va aparte, como en el ticket.
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items);
  v_total := (v_q ->> 'total_mxn')::numeric;
  IF p_total_esperado IS NOT NULL AND p_total_esperado IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'TOTAL_CAMBIO: %', v_q ->> 'total_mxn';   -- el total de ahora, con dos decimales
  END IF;
  IF v_en_linea THEN
    IF v_total <= 0 THEN RAISE EXCEPTION 'PAGO_INVALIDO: no hay nada que cobrar en línea'; END IF;
    v_propina := ROUND((v_q ->> 'subtotal_mxn')::numeric * COALESCE(p_propina_pct, 0) / 100, 2);
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
  --    El que espera la confirmación de su cobro (POR_PAGAR) cuenta: puede acabar siendo un pedido.
  -- ponytail: el conteo no tiene índice propio; recorre los pedidos vivos (índice parcial de 0090),
  -- que son pocos. Si un día pesa, un índice parcial por (tenant_id, cliente_telefono).
  PERFORM pg_advisory_xact_lock(hashtextextended('tienda_pedido:' || p_tenant || ':' || v_tel, 0));
  IF EXISTS (SELECT 1 FROM clientes c
              WHERE c.id = lealtad_resolver_cliente(p_tenant, NULL, v_tel) AND c.estado = 'BLOQUEADO')
     OR (SELECT count(*) FROM delivery_pedidos d
          WHERE d.tenant_id = p_tenant AND d.canal = 'TIENDA' AND d.cliente_telefono = v_tel
            AND d.estado IN ('POR_PAGAR', 'RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
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
      pago_al_recibir, paga_con_mxn, propina_mxn, nota_cliente, seguimiento_hash, tienda_cuenta_id,
      vence_aceptacion, gestion, payload_raw)
    VALUES (
      p_tenant, p_sucursal, 'TIENDA',
      (CASE p_modo WHEN 'DOMICILIO' THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)::modo_servicio,
      NULL, CASE WHEN v_en_linea THEN 'POR_PAGAR' ELSE 'RECIBIDO' END,
      CASE p_modo WHEN 'DOMICILIO' THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END,
      v_id_ext, 'T' || upper(left(v_id_ext, 5)),
      v_q -> 'items', (v_q ->> 'subtotal_mxn')::numeric,
      (v_q ->> 'envio_mxn')::numeric,   -- el costo de la zona, no el total con IVA: así lo espera el ticket
      v_total, v_total, CASE p_pago WHEN 'EFECTIVO' THEN v_total ELSE 0 END,
      v_nombre, v_tel, v_email, v_dir, p_zona,
      p_pago, p_paga_con, CASE WHEN v_en_linea THEN v_propina END,
      NULLIF(left(btrim(p_nota), 300), ''), p_seguimiento_hash, p_cuenta,
      -- En línea no corre ninguna ventana hasta que se paga.
      CASE WHEN v_en_linea THEN NULL ELSE now() + make_interval(mins => v_cfg.minutos_aceptacion) END,
      -- Misma regla que los pedidos de apps (procesar-uber.ts): con una caja instalada viva, el
      -- ticket lo crea la caja. (En línea se vuelve a decidir al aprobarse el cobro.)
      CASE WHEN sucursal_con_espejo(p_sucursal) THEN 'ESCRITORIO' ELSE 'NUBE' END,
      '{}'::jsonb)                      -- nada del cuerpo crudo: ni IP, ni token, ni sesión
    RETURNING * INTO v_ped;
  EXCEPTION WHEN unique_violation THEN
    IF p_clave IS NOT NULL THEN
      SELECT * INTO v_ped FROM delivery_pedidos d
       WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA';
      IF FOUND THEN RETURN _tienda_pedido_creado(v_ped, true); END IF;
    END IF;
    RAISE;
  END;

  -- El cobro que se va a hacer enseguida: total + propina, a la cuenta que cobra. `vence_at` es
  -- hasta cuándo se espera su resultado si Mercado Pago no contestó (lo normal es saberlo al instante).
  IF v_en_linea THEN
    INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, propina_mxn, vence_at)
    VALUES (p_tenant, v_ped.id, v_conexion, v_total + v_propina, v_propina, now() + interval '5 minutes');
  END IF;

  RETURN _tienda_pedido_creado(v_ped, false);
END;
$$;

-- ── §5 El pago ───────────────────────────────────────────────────────────────
-- ¿Me toca mandar el cobro de este pago a Mercado Pago? UNA sola vez por renglón, pase lo que
-- pase: dos envíos del mismo intento de compra (o un reintento porque el primero no contestó) nunca
-- cobran dos veces. Quien no lo toma no cobra: le pregunta a Mercado Pago qué pasó con el primero.
CREATE OR REPLACE FUNCTION tienda_pago_tomar_cobro(p_pago uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET cobro_pedido_at = now()
   WHERE id = p_pago AND NOT extra AND estado = 'CREADO' AND cobro_pedido_at IS NULL AND pago_id_externo IS NULL;
  RETURN FOUND;
END;
$$;

-- Mercado Pago RECHAZÓ el cobro (o no lo aceptó): el pedido no se pagó, así que no queda vivo ni
-- cuenta contra el tope del cliente. Se BORRA (con su pago, en cascada): nadie lo vio, y así el
-- cliente puede reintentar con la misma tarjeta o con otra y nace un pedido nuevo.
-- Solo se llama con un NO seguro de Mercado Pago. Falso = ya no se podía descartar y no se tocó nada.
CREATE OR REPLACE FUNCTION tienda_pago_descartar(p_pago uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido uuid;
BEGIN
  SELECT pedido_id INTO v_pedido FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Siempre el pedido antes que el pago: el mismo orden de candados en todas las funciones.
  PERFORM 1 FROM delivery_pedidos WHERE id = v_pedido AND estado = 'POR_PAGAR' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM tienda_pagos
    WHERE id = p_pago AND estado = 'CREADO' AND pago_id_externo IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM delivery_pedidos WHERE id = v_pedido;
  RETURN true;
END;
$$;

-- ¿Se le puede preguntar a Mercado Pago por este pago? A lo sumo una vez cada p_segundos (Mercado
-- Pago pide no consultar seguido, y la página de seguimiento insiste cada pocos segundos).
CREATE OR REPLACE FUNCTION tienda_pago_tomar_consulta(p_pago uuid, p_segundos integer DEFAULT 10)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET consultado_at = now()
   WHERE id = p_pago
     AND (consultado_at IS NULL OR consultado_at < now() - make_interval(secs => GREATEST(p_segundos, 1)));
  RETURN FOUND;
END;
$$;

-- Aplica lo que Mercado Pago dijo de UN pago. Quien llama ya lo consultó con el token del
-- restaurante y comprobó referencia, cuenta vendedora y moneda; aquí se decide qué mueve.
--   p_resultado  APROBADO | RECHAZADO | DEVUELTO
--   p_monto      lo que Mercado Pago cobró (transaction_amount)
-- Un pago aprobado es EL pago del pedido o se devuelve; no hay tercera opción:
--   · es el del pedido si el pedido sigue POR_PAGAR, no tenía pago y el monto es el esperado:
--     pago APROBADO, pedido RECIBIDO, y su ventana de aceptación empieza AHORA;
--   · llegó tarde (el pedido ya venció o se canceló): se queda en el renglón, POR_DEVOLVER;
--   · sobra (el pedido ya tenía otro pago, o el monto no es el esperado): un renglón `extra`,
--     POR_DEVOLVER por lo que se cobró.
-- Idempotente: el mismo aviso dos veces, o dos a la vez, dejan lo mismo (candados sobre el pedido y
-- el pago, y un renglón por pago de Mercado Pago). Un rechazo que se conoce DESPUÉS (por el aviso o
-- por el barrido: la respuesta del cobro no llegó) cierra el pedido que esperaba: no se cobró.
-- Devuelve {estado, pedido_estado, recien_aprobado}.
CREATE OR REPLACE FUNCTION tienda_pago_aplicar(
  p_pago uuid, p_resultado text, p_pago_id_externo text, p_monto numeric,
  p_tipo text DEFAULT NULL, p_marca text DEFAULT NULL, p_detalle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido   uuid;
  v_p        delivery_pedidos%ROWTYPE;
  v_g        tienda_pagos%ROWTYPE;
  v_min      integer;
  v_aprobado boolean := false;
BEGIN
  IF p_resultado IS NULL OR p_resultado NOT IN ('APROBADO', 'RECHAZADO', 'DEVUELTO')
     OR (p_pago_id_externo ~ '^[0-9]{1,30}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: % / %', COALESCE(p_resultado, 'NULL'), COALESCE(left(p_pago_id_externo, 40), 'NULL');
  END IF;

  SELECT pedido_id INTO v_pedido FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGO_NO_EXISTE: %', COALESCE(p_pago::text, 'NULL'); END IF;
  -- Siempre el pedido antes que el pago: el mismo orden de candados en todas las funciones.
  SELECT * INTO v_p FROM delivery_pedidos WHERE id = v_pedido FOR UPDATE;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = p_pago FOR UPDATE;

  IF p_resultado = 'DEVUELTO' THEN
    -- Mercado Pago dice que ese pago ya se devolvió (lo devolvimos nosotros, o el restaurante desde su cuenta).
    UPDATE tienda_pagos SET estado = 'DEVUELTO', devuelto_at = COALESCE(devuelto_at, now()), ultimo_error = NULL
     WHERE pedido_id = v_pedido AND pago_id_externo = p_pago_id_externo
       AND estado IN ('APROBADO', 'POR_DEVOLVER', 'DEVOLUCION_FALLIDA');

  ELSIF p_resultado = 'RECHAZADO' THEN
    UPDATE tienda_pagos SET estado = 'RECHAZADO', detalle = left(p_detalle, 80) WHERE id = p_pago AND estado = 'CREADO';
    -- Ya no hay nada que esperar: el pedido se cierra como «sin pago» (nunca existió para la caja).
    IF FOUND AND v_p.estado = 'POR_PAGAR' THEN
      UPDATE delivery_pedidos
         SET estado = 'EXPIRADO', cancelado_at = now(), cancelado_por = 'TIMEOUT', motivo_cancelacion = 'Sin pago'
       WHERE id = v_pedido;
    END IF;

  ELSIF EXISTS (SELECT 1 FROM tienda_pagos WHERE pago_id_externo = p_pago_id_externo) THEN
    NULL;   -- ese pago ya está aplicado: aviso repetido

  ELSIF (p_monto > 0) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: monto %', COALESCE(p_monto::text, 'NULL');

  ELSIF v_g.pago_id_externo IS NULL AND v_g.estado IN ('CREADO', 'RECHAZADO') AND v_p.estado = 'POR_PAGAR'
        AND p_monto = v_g.monto_mxn THEN
    SELECT c.minutos_aceptacion INTO v_min FROM tienda_config c WHERE c.tenant_id = v_p.tenant_id;
    UPDATE tienda_pagos
       SET estado = 'APROBADO', pago_id_externo = p_pago_id_externo, tipo_tarjeta = left(p_tipo, 20),
           marca = left(p_marca, 30), aprobado_at = now(), detalle = NULL
     WHERE id = p_pago;
    -- Para el restaurante el pedido llega AHORA: desde aquí corre su ventana, y aquí se decide quién
    -- lo atiende (la caja pudo encenderse o apagarse mientras el cliente pagaba). A una caja solo si
    -- late una que sepa de pedidos pagados: a una anterior el espejo no se lo baja, y se quedaría
    -- sin nadie que lo atienda hasta vencer.
    UPDATE delivery_pedidos
       SET estado = 'RECIBIDO', pagado_at = now(), recibido_at = now(),
           vence_aceptacion = now() + make_interval(mins => COALESCE(v_min, 5)),
           gestion = CASE WHEN _tienda_caja_en_linea_viva(sucursal_id) THEN 'ESCRITORIO' ELSE 'NUBE' END,
           gestion_caja_id = NULL
     WHERE id = v_pedido;
    v_aprobado := true;

  ELSIF v_g.pago_id_externo IS NULL AND v_g.estado IN ('CREADO', 'RECHAZADO', 'VENCIDO') AND p_monto = v_g.monto_mxn THEN
    -- Llegó tarde: el pedido ya no espera pago. Se devuelve.
    UPDATE tienda_pagos
       SET estado = 'POR_DEVOLVER', pago_id_externo = p_pago_id_externo, tipo_tarjeta = left(p_tipo, 20),
           marca = left(p_marca, 30), aprobado_at = now(), proximo_intento_at = NULL
     WHERE id = p_pago;

  ELSE
    -- Sobra: el pedido ya tiene su pago, o este no es por el monto esperado. Se devuelve lo cobrado.
    INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, extra, pago_id_externo,
                              tipo_tarjeta, marca, vence_at, aprobado_at)
    VALUES (v_g.tenant_id, v_pedido, v_g.conexion_id, p_monto, 'POR_DEVOLVER', true, p_pago_id_externo,
            left(p_tipo, 20), left(p_marca, 30), v_g.vence_at, now());
  END IF;

  RETURN jsonb_build_object(
    'estado', (SELECT g.estado FROM tienda_pagos g WHERE g.id = p_pago),
    'pedido_estado', (SELECT d.estado FROM delivery_pedidos d WHERE d.id = v_pedido),
    'recien_aprobado', v_aprobado);
END;
$$;

-- El correo de confirmación de un pedido pagado sale una sola vez, aunque lo pidan dos pestañas.
CREATE OR REPLACE FUNCTION tienda_pago_tomar_correo(p_pago uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET correo_at = now() WHERE id = p_pago AND NOT extra AND estado = 'APROBADO' AND correo_at IS NULL;
  RETURN FOUND;
END;
$$;

-- ── §6 Devolver ──────────────────────────────────────────────────────────────
-- Un pedido con pago aprobado que termina RECHAZADO, EXPIRADO o CANCELADO deja su pago POR_DEVOLVER.
-- Es un disparador, y no una línea en cada función, porque los caminos son muchos y van a ser más:
-- el cajero rechaza (delivery-accion), la caja reporta la cuenta cancelada (tienda_reportar_estado),
-- la nube la ve cancelada (tienda_sincronizar_estados_nube), vence sin aceptar o nadie lo tomó
-- (delivery_marcar_expirados). Todos acaban en un UPDATE de `estado`, y aquí se cazan todos.
-- En la caja instalada existe y no hace nada: allá tienda_pagos está vacía.
CREATE OR REPLACE FUNCTION delivery_pedidos_devolver_pago()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET estado = 'POR_DEVOLVER', proximo_intento_at = NULL
   WHERE pedido_id = NEW.id AND estado = 'APROBADO';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_delivery_pedidos_devolver_pago ON delivery_pedidos;
CREATE TRIGGER trg_delivery_pedidos_devolver_pago
  AFTER UPDATE OF estado ON delivery_pedidos
  FOR EACH ROW
  WHEN (NEW.pago_al_recibir = 'EN_LINEA' AND NEW.estado IN ('RECHAZADO', 'EXPIRADO', 'CANCELADO')
        AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION delivery_pedidos_devolver_pago();

-- Lo que el barrido tiene que hacer contra Mercado Pago, tomado para que dos pasadas a la vez no
-- hagan lo mismo. Dos tareas:
--   DEVOLVER   pagos POR_DEVOLVER a los que ya les toca (un intento cada 2 minutos);
--   CONCILIAR  pagos que nadie ha confirmado: se le pregunta a Mercado Pago. Sin esto, si el aviso
--              no llega y el cliente cerró la pestaña, un pago cobrado se quedaría sin pedido (o
--              llegaría a la caja al vencer) y sin devolución. Cuándo toca:
--                · mientras el pedido espera (el cobro se mandó y no se supo el resultado), desde
--                  los 20 segundos y a lo sumo cada 45 por pago (la página del pedido, si está
--                  abierta, ya pregunta ella y comparte ese reloj: consultado_at);
--                · ya VENCIDO, hasta que Mercado Pago conteste una vez (conciliaciones = 1), y otra
--                  alrededor de una hora después del plazo, para cazar un aprobado tardío;
--                · si la consulta falla tres veces seguidas (cuenta desconectada, token rechazado),
--                  solo una vez por hora: el tercer fallo avisa a VIM (tienda_pago_conciliacion);
--                · nunca pasadas 48 horas del plazo.
--              Van primero los que llevan más sin consultarse (los nunca consultados, antes): diez
--              pagos atascados no le quitan el turno a los demás.
-- ponytail: recorre tienda_pagos entera; índice parcial por estado cuando la tabla pese.
CREATE OR REPLACE FUNCTION tienda_pagos_tomar(p_max integer DEFAULT 10)
RETURNS TABLE (id uuid, tarea text, conexion_id uuid, pago_id_externo text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     WHERE g.estado = 'POR_DEVOLVER' AND (g.proximo_intento_at IS NULL OR g.proximo_intento_at <= now())
     ORDER BY g.updated_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET proximo_intento_at = now() + interval '2 minutes'
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.pago_id_externo
  )
  SELECT t.id, 'DEVOLVER'::text, t.conexion_id, t.pago_id_externo FROM tomados t;

  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     -- Solo si el cobro llegó a mandarse: sin eso no hay nada que buscar en Mercado Pago.
     WHERE NOT g.extra AND g.conciliado_at IS NULL AND g.cobro_pedido_at IS NOT NULL
       AND g.vence_at > now() - interval '48 hours'
       AND ((g.estado = 'CREADO' AND g.cobro_pedido_at < now() - interval '20 seconds')
            OR (g.estado = 'VENCIDO' AND (g.conciliaciones = 0 OR g.vence_at < now() - interval '1 hour')))
       AND (g.consultado_at IS NULL OR g.consultado_at < now() - CASE
              WHEN g.conciliacion_fallos >= 3 THEN interval '1 hour'
              ELSE interval '45 seconds' END)
     ORDER BY g.consultado_at NULLS FIRST, g.created_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET consultado_at = now()
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.pago_id_externo
  )
  SELECT t.id, 'CONCILIAR'::text, t.conexion_id, t.pago_id_externo FROM tomados t;
END;
$$;

-- Cómo le fue a un intento de devolución. Con éxito: DEVUELTO. Sin él: suma un fallo y, al tercero,
-- DEVOLUCION_FALLIDA (ahí se deja de insistir y quien llama avisa a VIM). Devuelve el estado en que queda.
CREATE OR REPLACE FUNCTION tienda_pago_devolucion(p_pago uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  IF p_ok THEN
    UPDATE tienda_pagos SET estado = 'DEVUELTO', devuelto_at = now(), ultimo_error = NULL
     WHERE id = p_pago AND estado IN ('POR_DEVOLVER', 'DEVOLUCION_FALLIDA')
    RETURNING estado INTO v_estado;
  ELSE
    UPDATE tienda_pagos
       SET intentos = intentos + 1, ultimo_error = left(p_error, 300),
           estado = CASE WHEN intentos + 1 >= 3 THEN 'DEVOLUCION_FALLIDA' ELSE estado END
     WHERE id = p_pago AND estado = 'POR_DEVOLVER'
    RETURNING estado INTO v_estado;
  END IF;
  RETURN COALESCE(v_estado, (SELECT g.estado FROM tienda_pagos g WHERE g.id = p_pago));
END;
$$;

-- Cómo le fue a una consulta del barrido (CONCILIAR). Devuelve TRUE cuando hay que avisar a VIM: es
-- el tercer fallo seguido, y puede haber un cobro que no se ha podido ver.
--   · Mercado Pago contestó: los fallos vuelven a cero. Si el pago ya está VENCIDO cuenta una
--     conciliación; a la segunda (la de una hora después) se deja de preguntar.
--   · No se pudo consultar: suma un fallo. No se deja de preguntar (tienda_pagos_tomar lo espacia a
--     una vez por hora y lo corta a las 48 horas), y el seguimiento no afirma «sin pago».
CREATE OR REPLACE FUNCTION tienda_pago_conciliacion(p_pago uuid, p_ok boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fallos integer;
BEGIN
  IF p_ok THEN
    UPDATE tienda_pagos
       SET conciliacion_fallos = 0,
           conciliaciones = conciliaciones + CASE WHEN estado = 'VENCIDO' THEN 1 ELSE 0 END,
           conciliado_at = CASE WHEN estado = 'VENCIDO' AND conciliaciones >= 1 THEN now() ELSE conciliado_at END
     WHERE id = p_pago;
    RETURN false;
  END IF;
  UPDATE tienda_pagos SET conciliacion_fallos = conciliacion_fallos + 1
   WHERE id = p_pago RETURNING conciliacion_fallos INTO v_fallos;
  RETURN COALESCE(v_fallos = 3, false);
END;
$$;

-- ── §7 Aceptar un pedido pagado: la cuenta nace cobrada ──────────────────────
-- crear_ticket_desde_tienda: cuerpo copiado ÍNTEGRO de 0161_tienda_en_linea_base.sql §3. Dos cambios,
-- los dos solo para el pedido que se pagó en línea:
--   · la nota de la cuenta dice «Pagado en línea»;
--   · después de comprobar el total, registra la propina (establecer_propina_ticket, 0134) y el
--     pago por total + propina con el método PAGO_EN_LINEA (aplicar_pago, que cierra la cuenta
--     como PAGADA). Es el patrón de crear_ticket_desde_app con el pago de Uber: mismo turno, mismo
--     usuario, misma idempotencia por client_id_local. El corte suma el pago en su propio renglón
--     (obtener_resumen_turno agrupa por método) y la propina entra al reparto del turno.
-- En la nube comprueba además que el pago esté APROBADO. En la caja tienda_pagos está vacía y no
-- hay qué comprobar: a la caja solo le llega el pedido que ya se pagó (delivery-espejo).
CREATE OR REPLACE FUNCTION crear_ticket_desde_tienda(p_pedido_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedido      delivery_pedidos%ROWTYPE;
  v_turno       record;
  v_ticket_id   uuid;
  v_cliente_id  uuid;
  v_bloqueado   boolean;
  v_dir_id      uuid;
  v_total       numeric(12,2);
  v_claims_prev text;
  v_pago        text;
  v_propina     numeric(12,2);
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.canal <> 'TIENDA' THEN RAISE EXCEPTION 'PEDIDO_NO_ES_DE_TIENDA: canal %', v_pedido.canal; END IF;
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR', 'ACEPTADO') THEN
    RAISE EXCEPTION 'PEDIDO_NO_ACEPTABLE: estado %', v_pedido.estado;
  END IF;
  -- Pagado en línea: si aquí están sus pagos (la nube), el suyo tiene que estar aprobado.
  IF v_pedido.pago_al_recibir = 'EN_LINEA'
     AND EXISTS (SELECT 1 FROM tienda_pagos g WHERE g.pedido_id = p_pedido_id AND NOT g.extra AND g.estado <> 'APROBADO') THEN
    RAISE EXCEPTION 'PAGO_NO_APROBADO: el pago del pedido % no está aprobado', p_pedido_id;
  END IF;

  -- La fila del pedido no es de fiar: nada la obliga a que su sucursal sea de su negocio, y esta
  -- función es definer. Sin esto, el ticket se abriría en el turno de otro negocio.
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = v_pedido.sucursal_id AND s.tenant_id = v_pedido.tenant_id) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: sucursal %', v_pedido.sucursal_id;
  END IF;

  SELECT t.id, t.caja_id, t.usuario_apertura_id INTO v_turno
  FROM turnos t
  WHERE t.sucursal_id = v_pedido.sucursal_id AND t.tenant_id = v_pedido.tenant_id AND t.estado = 'ABIERTO'
  ORDER BY t.fecha_apertura DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO: sucursal %', v_pedido.sucursal_id; END IF;

  -- El cliente: por teléfono (comparado por dígitos), o se crea.
  v_cliente_id := lealtad_resolver_cliente(v_pedido.tenant_id, NULL, v_pedido.cliente_telefono);
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (tenant_id, nombre, telefono, email, created_by)
    VALUES (v_pedido.tenant_id, LEFT(COALESCE(NULLIF(btrim(v_pedido.cliente_nombre), ''), 'Cliente de la tienda'), 200),
            LEFT(regexp_replace(v_pedido.cliente_telefono, '\D', '', 'g'), 20),
            v_pedido.cliente_email, v_turno.usuario_apertura_id)
    RETURNING id INTO v_cliente_id;
  ELSE
    SELECT estado = 'BLOQUEADO' INTO v_bloqueado FROM clientes WHERE id = v_cliente_id;
    IF v_bloqueado THEN RAISE EXCEPTION 'CLIENTE_BLOQUEADO: %', v_cliente_id; END IF;
  END IF;

  -- Actuar como el usuario del turno (auth.uid() en las RPCs de venta), igual que la de apps.
  v_claims_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_turno.usuario_apertura_id::text,
                      'tenant_id', v_pedido.tenant_id::text,
                      'role', 'authenticated')::text,
    true);

  v_ticket_id := abrir_ticket(v_pedido.sucursal_id, v_turno.caja_id, v_turno.id, v_pedido.app,
                              v_cliente_id, NULL,
                              'tienda:' || v_pedido.id_externo,
                              v_turno.usuario_apertura_id);

  -- La tienda solo vende productos del catálogo: no hay producto genérico.
  PERFORM _delivery_items_a_ticket(v_ticket_id, v_pedido.items, NULL);

  IF v_pedido.app = 'DELIVERY_PROPIO' THEN
    -- A domicilio hace falta a dónde y por cuál zona: se dice claro en vez de reventar más abajo
    -- con un NOT NULL de direcciones_cliente. Una dirección NULL cae aquí también (NULL->>k es NULL).
    IF v_pedido.zona_envio_id IS NULL OR EXISTS (
         SELECT 1 FROM unnest(ARRAY['calle', 'numero_exterior', 'colonia', 'codigo_postal', 'ciudad', 'estado']) k
          WHERE NULLIF(btrim(v_pedido.direccion->>k), '') IS NULL) THEN
      RAISE EXCEPTION 'DIRECCION_INVALIDA: pedido % a domicilio sin zona de envío o con la dirección incompleta', p_pedido_id;
    END IF;

    -- La dirección del pedido se guarda en el cliente; si ya tenía esa misma, se reutiliza. «La
    -- misma» incluye interior y colonia: «Av. X 100 int 7» no es «Av. X 100 int 3», y reutilizarla
    -- mandaría el pedido al departamento equivocado.
    SELECT d.id INTO v_dir_id FROM direcciones_cliente d
     WHERE d.cliente_id = v_cliente_id AND d.activa AND d.deleted_at IS NULL
       AND lower(btrim(d.calle)) = lower(btrim(v_pedido.direccion->>'calle'))
       AND lower(btrim(d.numero_exterior)) = lower(btrim(v_pedido.direccion->>'numero_exterior'))
       AND lower(btrim(COALESCE(d.numero_interior, ''))) = lower(btrim(COALESCE(v_pedido.direccion->>'numero_interior', '')))
       AND lower(btrim(d.colonia)) = lower(btrim(v_pedido.direccion->>'colonia'))
       AND d.codigo_postal = v_pedido.direccion->>'codigo_postal'
     ORDER BY d.created_at LIMIT 1;
    IF v_dir_id IS NULL THEN
      INSERT INTO direcciones_cliente (tenant_id, cliente_id, etiqueta, calle, numero_exterior, numero_interior,
        colonia, codigo_postal, ciudad, estado_geo, referencias, zona_envio_id, created_by)
      VALUES (v_pedido.tenant_id, v_cliente_id, 'Tienda en línea',
        LEFT(v_pedido.direccion->>'calle', 255), LEFT(v_pedido.direccion->>'numero_exterior', 20),
        NULLIF(LEFT(v_pedido.direccion->>'numero_interior', 20), ''),
        LEFT(v_pedido.direccion->>'colonia', 150), LEFT(v_pedido.direccion->>'codigo_postal', 5),
        LEFT(v_pedido.direccion->>'ciudad', 100), LEFT(v_pedido.direccion->>'estado', 50),
        NULLIF(v_pedido.direccion->>'referencias', ''), v_pedido.zona_envio_id, v_turno.usuario_apertura_id)
      RETURNING id INTO v_dir_id;
    END IF;
    UPDATE tickets SET direccion_entrega_id = v_dir_id WHERE id = v_ticket_id;

    -- fijar_envio_ticket valida que la zona sea de la sucursal y crea el renglón al precio de HOY.
    -- Lo cotizado manda, como en los precios de arriba, y sin casos a medias:
    PERFORM fijar_envio_ticket(v_ticket_id, v_pedido.zona_envio_id);
    IF COALESCE(v_pedido.envio_mxn, 0) = 0 THEN
      -- Se cotizó gratis: fuera el renglón si la zona hoy cobra. Se BORRA, como hace
      -- fijar_envio_ticket con una zona de $0: un concepto de $0 no timbra (0116).
      DELETE FROM ticket_items WHERE ticket_id = v_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;
    ELSE
      UPDATE ticket_items SET precio_unitario_snapshot = v_pedido.envio_mxn
       WHERE ticket_id = v_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;
      -- Sin renglón que repreciar, la zona hoy es gratis: lo que se le cotizó ya no existe.
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ENVIO_NO_COINCIDE: se cotizó un envío de % y la zona % hoy no cobra', v_pedido.envio_mxn, v_pedido.zona_envio_id;
      END IF;
    END IF;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  v_pago := CASE v_pedido.pago_al_recibir
              WHEN 'EFECTIVO' THEN 'Efectivo' || COALESCE(', paga con $' || to_char(v_pedido.paga_con_mxn, 'FM999999990.00'), '')
              WHEN 'TARJETA'  THEN 'Tarjeta al recibir'
              -- Va a la nota de la cuenta, que es lo que se lee en el panel, en la comanda y en el ticket.
              WHEN 'EN_LINEA' THEN 'PAGADO EN LÍNEA, no cobrar'
            END;
  UPDATE tickets
  SET folio_externo_app = v_pedido.id_externo,
      origen_creacion   = 'API_EXTERNA',
      nombre_cliente    = LEFT(v_pedido.cliente_nombre, 100),
      nota_general      = NULLIF(concat_ws(' · ', v_pago, NULLIF(v_pedido.nota_cliente, '')), '')
  WHERE id = v_ticket_id;

  -- Lo que se le cotizó al cliente es lo que se le va a cobrar, o no hay ticket. El RAISE revierte
  -- todo lo anterior: no queda ticket a medias.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket_id;
  IF v_total IS DISTINCT FROM v_pedido.total_cliente_mxn THEN
    RAISE EXCEPTION 'TOTAL_NO_COINCIDE: ticket % vs pedido %', v_total, v_pedido.total_cliente_mxn;
  END IF;

  IF v_pedido.pago_al_recibir = 'EN_LINEA' THEN
    -- Ya pagado: la propina primero (solo se cambia con la cuenta abierta) y luego el pago por
    -- total + propina, que deja la cuenta PAGADA. El cajero no cobra nada.
    v_propina := COALESCE(v_pedido.propina_mxn, 0);
    IF v_propina > 0 THEN PERFORM establecer_propina_ticket(v_ticket_id, v_propina); END IF;
    PERFORM aplicar_pago(v_ticket_id, 'PAGO_EN_LINEA'::metodo_pago, v_total + v_propina, NULL, NULL, NULL,
                         v_pedido.id_externo, false, 'Pagado en línea',
                         'tienda-pago:' || v_pedido.id_externo);
  END IF;
  -- Efectivo y tarjeta: SIN aplicar_pago, la tienda cobra al recibir.

  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket_id AND estado_cocina = 'SIN_ENVIAR';

  UPDATE delivery_pedidos
  SET ticket_id = v_ticket_id, estado = 'ACEPTADO',
      aceptado_at = COALESCE(aceptado_at, now()), ultimo_error = NULL
  WHERE id = p_pedido_id;

  PERFORM set_config('request.jwt.claims', v_claims_prev, true);
  RETURN v_ticket_id;
END;
$$;
COMMENT ON FUNCTION crear_ticket_desde_tienda(uuid) IS
  'Convierte un pedido de la tienda en línea en ticket, con cliente por teléfono, dirección y envío. Al recibir: ABIERTO y sin pago. Pagado en línea: con su pago PAGO_EN_LINEA y su propina, ya PAGADO. Idempotente.';

-- ── §8 Estados y seguimiento ─────────────────────────────────────────────────
-- La regla «cuenta cobrada = pedido entregado» (0162, 0164, 0166) valía porque la tienda cobraba al
-- recibir. Un pedido pagado en línea tiene la cuenta cobrada desde que se acepta: NO está
-- entregado; lo estará cuando el cajero lo diga (botón Listo → delivery-accion `estado`).
-- La regla vive en tres sitios y cambian los dos de la base; el tercero es de la caja y del POS
-- (estadoAReportar, estadoDeFila) y va en su entrega.

-- Cuerpo copiado ÍNTEGRO de 0166_tienda_cuentas.sql §3; cambia solo la línea de PAGADO/FACTURADO.
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
        WHEN v_t.fiscal IN ('PAGADO', 'FACTURADO') AND p_pedido.pago_al_recibir IS DISTINCT FROM 'EN_LINEA' THEN 'ENTREGADO'
        WHEN v_t.ticket_impreso_at IS NOT NULL OR v_t.con_repartidor THEN 'LISTO'
        ELSE v_estado END;
    END IF;
  END IF;
  RETURN v_estado;
END;
$$;

-- Cuerpo copiado ÍNTEGRO de 0166_tienda_cuentas.sql §3; se añade POR_PAGAR, que antes habría caído
-- en «cancelado».
CREATE OR REPLACE FUNCTION _tienda_estado_publico(p_estado text, p_app text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN p_estado = 'POR_PAGAR' THEN 'POR_PAGAR'
    -- ERROR no es un final: para 0161 es reintentable. A quien todavía puede recibir su pedido no
    -- se le dice «cancelado»; se ve como recién recibido y sin motivo.
    WHEN p_estado IN ('RECIBIDO', 'ERROR') THEN 'EN_PROCESO'
    WHEN p_estado IN ('ACEPTADO', 'EN_PREPARACION') THEN 'EN_PREPARACION'
    WHEN p_estado = 'LISTO' AND p_app = 'DELIVERY_PROPIO' THEN 'EN_CAMINO'
    WHEN p_estado = 'LISTO' THEN 'LISTO_PARA_RECOGER'
    WHEN p_estado = 'ENTREGADO' THEN 'ENTREGADO'
    ELSE 'CANCELADO' END;
$$;

-- tienda_seguimiento: cuerpo copiado de 0166_tienda_cuentas.sql §3. Se añade lo del pago en línea,
-- sin ningún identificador de Mercado Pago ni dato de la tarjeta:
--   · `pago` puede ser EN_LINEA, y `estado`, POR_PAGAR;
--   · `pago_estado`: PAGADO | DEVOLUCION_EN_PROCESO | DEVUELTO | SIN_PAGO (no se cobró: Mercado
--     Pago lo confirmó, o el cobro nunca llegó a mandarse) | POR_CONFIRMAR (el cobro se mandó y
--     todavía no se sabe qué pasó: puede haber un cobro; nunca se dice «no se te cobró»);
--   · `propina_mxn` y `total_a_pagar_mxn` (total + propina);
--   · esas tres claves van SOLO en el pedido en línea: el de pago al recibir devuelve, clave por
--     clave, lo de siempre;
--   · `motivo` SIN_PAGO en el pedido que venció sin pagarse (antes habría dicho SIN_RESPUESTA,
--     que es «el restaurante no contestó»).
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
      WHEN v_estado = 'EXPIRADO' AND v_en_linea AND v_p.pagado_at IS NULL AND v_g.estado = 'VENCIDO' AND v_g.conciliaciones = 0 AND v_g.cobro_pedido_at IS NOT NULL THEN 'POR_CONFIRMAR'
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
        WHEN v_g.estado = 'VENCIDO' AND v_g.conciliaciones = 0 AND v_g.cobro_pedido_at IS NOT NULL THEN 'POR_CONFIRMAR'
        ELSE 'SIN_PAGO' END,
      'propina_mxn', to_char(COALESCE(v_p.propina_mxn, 0), 'FM999999990.00'),
      'total_a_pagar_mxn', to_char(v_p.total_cliente_mxn + COALESCE(v_p.propina_mxn, 0), 'FM999999990.00')) END;
END;
$$;

-- tienda_sincronizar_estados_nube: cuerpo copiado ÍNTEGRO de 0164_tienda_caja.sql §3. Dos cambios:
-- la línea de PAGADO/FACTURADO (la misma que en _tienda_estado_real: si cambia una, cambian las
-- dos), y que el pedido pagado en línea se sigue mirando ya ENTREGADO, solo por si le cancelan la cuenta.
CREATE OR REPLACE FUNCTION tienda_sincronizar_estados_nube() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT p.tenant_id, p.id, p.estado, p.recibido_at,
             CASE
               WHEN t.estado_fiscal = 'CANCELADO' THEN 'CANCELADO'
               WHEN p.estado = 'ENTREGADO' THEN NULL   -- entregado solo se mira por si se canceló su cuenta
               WHEN t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND p.pago_al_recibir IS DISTINCT FROM 'EN_LINEA' THEN 'ENTREGADO'
               WHEN t.ticket_impreso_at IS NOT NULL
                    OR EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) THEN 'LISTO'
             END AS nuevo
        FROM delivery_pedidos p
        JOIN tickets t ON t.id = p.ticket_id AND t.tenant_id = p.tenant_id
       WHERE p.canal = 'TIENDA' AND p.gestion = 'NUBE'
         -- El pagado en línea se sigue mirando ya ENTREGADO: si después le cancelan la cuenta, se
         -- cancela y su pago se devuelve (tienda_reportar_estado, abajo). Los demás, como siempre.
         AND (p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
              OR (p.estado = 'ENTREGADO' AND p.pago_al_recibir = 'EN_LINEA'))
         AND p.recibido_at > now() - interval '7 days'
    ) x
    WHERE x.nuevo IS NOT NULL AND x.nuevo <> x.estado
    ORDER BY x.recibido_at
    LIMIT 200
  LOOP
    IF tienda_reportar_estado(r.tenant_id, r.id, r.nuevo, CASE WHEN r.nuevo = 'CANCELADO' THEN 'OTRO' END)
       IS DISTINCT FROM r.estado THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- tienda_reportar_estado: cuerpo copiado ÍNTEGRO de 0167_tienda_salida.sql §3. Un cambio: un pedido
-- PAGADO EN LÍNEA se puede cancelar también ya ENTREGADO. El diseño dice que cancelar la cuenta en
-- la caja devuelve el pago, y la cuenta se puede cancelar después de entregar; al pasar a CANCELADO
-- el disparador de §6 deja su pago POR_DEVOLVER. Sin doble devolución: el disparador solo mueve un
-- pago APROBADO, y repetir el reporte ya no avanza (CANCELADO no es un estado vivo).
-- Un pedido al recibir ya ENTREGADO sigue sin poder cancelarse por aquí, como antes; los de Uber no
-- pasan por esta función (exige canal TIENDA).
CREATE OR REPLACE FUNCTION tienda_reportar_estado(p_tenant uuid, p_pedido uuid, p_estado text, p_motivo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual text;
  v_pago   text;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: %', COALESCE(p_estado, 'NULL');
  END IF;

  SELECT estado, pago_al_recibir INTO v_actual, v_pago FROM delivery_pedidos
   WHERE id = p_pedido AND tenant_id = p_tenant AND canal = 'TIENDA'
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', COALESCE(p_pedido::text, 'NULL'); END IF;

  -- Entre paréntesis: sin ellos plpgsql corta el IF en el primer THEN del CASE.
  IF NOT (CASE p_estado
       WHEN 'EN_PREPARACION' THEN v_actual = 'ACEPTADO'
       WHEN 'LISTO'     THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION')
       WHEN 'ENTREGADO' THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
       ELSE                  v_actual IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
                             OR (v_actual = 'ENTREGADO' AND v_pago IS NOT DISTINCT FROM 'EN_LINEA')
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
COMMENT ON FUNCTION tienda_reportar_estado IS
  'La caja reporta EN_PREPARACION («ya lo tengo»), LISTO, ENTREGADO o CANCELADO de un pedido de la tienda en línea. Solo avanza; la excepción es cancelar un pedido pagado en línea ya entregado, que devuelve su pago. Solo service_role.';

-- ── §9 El barrido de cada minuto ─────────────────────────────────────────────
-- Dos cosas, y ninguna avisa a nadie (ni correo, ni push, ni evento):
--   1) El pedido que lleva más de 5 minutos esperando la confirmación de su cobro pasa a EXPIRADO y
--      su pago a VENCIDO. Lo normal es saber al instante si el cobro pasó; aquí solo llega el que
--      Mercado Pago no contestó. En esos 5 minutos el barrido ya preguntó varias veces; si el cobro
--      aparece aprobado después, se devuelve (tienda_pago_aplicar).
--   2) Si hay algo que hacer contra Mercado Pago (devolver, o preguntar una última vez por un pago
--      que nadie confirmó), llama a la función `tienda-webhook-mp` por su puerta interna, con el
--      mismo mecanismo que el aviso de vencidos (0097): pg_net y los secretos de Vault. Sin pg_net
--      o sin los secretos (la caja, un entorno a medias) se omite y lo demás sigue funcionando.
-- ponytail: recorre delivery_pedidos como las pasadas de delivery_marcar_expirados; mismo índice
-- parcial cuando la tabla pese.
CREATE OR REPLACE FUNCTION tienda_pagos_barrer() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids     uuid[];
  v_secreto text;
  v_base    text;
BEGIN
  WITH vencidos AS (
    UPDATE delivery_pedidos
       SET estado = 'EXPIRADO', cancelado_at = now(), cancelado_por = 'TIMEOUT', motivo_cancelacion = 'Sin pago'
     WHERE estado = 'POR_PAGAR' AND created_at < now() - interval '5 minutes'
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM vencidos;
  UPDATE tienda_pagos SET estado = 'VENCIDO'
   WHERE pedido_id = ANY (v_ids) AND NOT extra AND estado = 'CREADO';

  BEGIN
    IF EXISTS (SELECT 1 FROM tienda_pagos g
                WHERE (g.estado = 'POR_DEVOLVER' AND (g.proximo_intento_at IS NULL OR g.proximo_intento_at <= now()))
                   -- Más ancho que tienda_pagos_tomar a propósito: quién toca de verdad lo decide ella.
                   OR (NOT g.extra AND g.conciliado_at IS NULL AND g.cobro_pedido_at IS NOT NULL
                       AND g.estado IN ('CREADO', 'VENCIDO')
                       AND g.cobro_pedido_at < now() - interval '20 seconds' AND g.vence_at > now() - interval '48 hours'
                       AND (g.estado <> 'VENCIDO' OR g.conciliaciones = 0 OR g.vence_at < now() - interval '1 hour')
                       AND (g.conciliacion_fallos < 3 OR g.consultado_at IS NULL OR g.consultado_at < now() - interval '1 hour'))) THEN
      v_secreto := _vim_secreto('vim_interno');
      v_base    := _vim_secreto('vim_functions_url');
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') OR v_secreto IS NULL OR v_base IS NULL THEN
        RAISE NOTICE 'tienda_pagos_barrer: sin pg_net o sin los secretos vim_interno / vim_functions_url; hay pagos pendientes sin atender';
      ELSE
        EXECUTE format(
          'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
          rtrim(v_base, '/') || '/tienda-webhook-mp',
          '{"barrido": true}',
          jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_pagos_barrer: %', SQLERRM;
  END;

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;
COMMENT ON FUNCTION tienda_pagos_barrer IS
  'Vence los pedidos de la tienda que llevan más de 5 minutos sin que su cobro se confirme y, si hay devoluciones o pagos por conciliar, llama a tienda-webhook-mp (pg_net). No avisa a nadie. Cron cada minuto (nube). Devuelve cuántos pedidos venció.';

-- ── §10 La cuenta pagada en línea, en la caja ────────────────────────────────
-- (a) «Listo» en la caja instalada. El POS de la caja escribe en su base local; quien le avisa a
-- la nube es el agente del espejo, que reporta ENTREGADO cuando ve `entregado_at` (y el espejo no
-- lo pisa con lo que traiga la nube). El estado no se toca aquí: lo pone la nube al tomar el
-- reporte. En el POS web este botón va por delivery-accion (acción `estado`), no por aquí.
CREATE OR REPLACE FUNCTION tienda_marcar_entregado(p_pedido uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE delivery_pedidos p
     SET entregado_at = COALESCE(p.entregado_at, now())
   WHERE p.id = p_pedido AND p.tenant_id = current_tenant_id() AND p.canal = 'TIENDA'
     AND p.pago_al_recibir = 'EN_LINEA' AND p.gestion = 'ESCRITORIO' AND p.ticket_id IS NOT NULL
     AND p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO');
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCION_INVALIDA: el pedido % no es una cuenta pagada en línea de esta caja', COALESCE(p_pedido::text, 'NULL'); END IF;
END;
$$;
COMMENT ON FUNCTION tienda_marcar_entregado IS
  'Caja instalada: el cajero tocó «Listo» en una cuenta pagada en línea. Sella entregado_at en la copia local; el agente del espejo lo reporta a la nube.';
REVOKE ALL ON FUNCTION tienda_marcar_entregado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tienda_marcar_entregado(uuid) TO authenticated, service_role;

-- (b) El pago en línea no se edita en caja. Cambiar la forma de pago (cambiar_forma_pago_ticket) y
-- reabrir la cuenta (reabrir_ticket_pagado) escriben en `pagos`: aquí se detienen las dos, sin
-- copiar esas funciones. El dinero está en Mercado Pago; lo único que lo regresa es cancelar la
-- cuenta. El mensaje es el que lee el cajero (el POS enseña el texto del error tal cual).
CREATE OR REPLACE FUNCTION pagos_en_linea_no_se_editan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
     OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
     OR (NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado::text NOT IN ('APLICADO', 'CONCILIADO')) THEN
    RAISE EXCEPTION 'Esta cuenta se pagó en línea: no se le puede cambiar la forma de pago ni reabrirla. Si hay que regresar el dinero, cancela la cuenta y el pago se le devuelve completo al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pagos_en_linea_no_se_editan ON pagos;
CREATE TRIGGER trg_pagos_en_linea_no_se_editan
  BEFORE UPDATE ON pagos
  FOR EACH ROW WHEN (OLD.metodo_pago = 'PAGO_EN_LINEA' OR NEW.metodo_pago = 'PAGO_EN_LINEA')
  EXECUTE FUNCTION pagos_en_linea_no_se_editan();

-- (c) Devolución de caja sobre una cuenta pagada en línea: no existe. Entregar efectivo por un pago
-- con tarjeta descuadra el cajón y deja el cobro vivo en Mercado Pago. La única que pasa es la que
-- arma cancelar_ticket_pagado (total, por cancelación), y esa nunca sale del cajón: se registra
-- como «mismo método», porque quien devuelve es Mercado Pago (disparador de §6).
CREATE OR REPLACE FUNCTION devoluciones_de_pago_en_linea()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pagos g
              WHERE g.ticket_id = NEW.ticket_original_id AND g.metodo_pago = 'PAGO_EN_LINEA'
                AND g.estado::text IN ('APLICADO', 'CONCILIADO') AND g.deleted_at IS NULL) THEN
    IF NEW.alcance <> 'TOTAL' OR NEW.motivo <> 'CANCELACION_PEDIDO' THEN
      RAISE EXCEPTION 'Esta cuenta se pagó en línea: no se le hace devolución en caja. Para regresar el dinero, cancela la cuenta y el pago se le devuelve completo al cliente.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.medio_devolucion := 'MISMO_METODO_PAGO';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_devoluciones_de_pago_en_linea ON devoluciones;
CREATE TRIGGER trg_devoluciones_de_pago_en_linea
  BEFORE INSERT ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION devoluciones_de_pago_en_linea();

-- ── Privilegios ──────────────────────────────────────────────────────────────
-- Nada para el público ni para el personal. Las internas (_tienda_*) y la del disparador no se le
-- dan ni a service_role. Ningún nombre de la lista tiene sobrecargas.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma, p.proname
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_conexion_cobro', 'tienda_negocio', 'tienda_crear_pedido', 'tienda_pago_tomar_cobro',
                                'tienda_pago_descartar', 'tienda_pago_tomar_consulta', 'tienda_pago_aplicar', 'tienda_pago_tomar_correo',
                                'tienda_pagos_tomar', 'tienda_pago_devolucion', 'tienda_pago_conciliacion', 'crear_ticket_desde_tienda',
                                'tienda_seguimiento', 'tienda_sincronizar_estados_nube', 'tienda_reportar_estado', 'tienda_pagos_barrer',
                                '_tienda_version_al_menos', '_tienda_caja_en_linea_viva', '_tienda_pedido_creado', '_tienda_estado_real', '_tienda_estado_publico',
                                'delivery_pedidos_devolver_pago', 'pagos_en_linea_no_se_editan', 'devoluciones_de_pago_en_linea')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
    IF f.proname NOT LIKE '\_%' AND f.proname NOT IN ('delivery_pedidos_devolver_pago', 'pagos_en_linea_no_se_editan', 'devoluciones_de_pago_en_linea') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.firma);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', f.firma);
    END IF;
  END LOOP;
END $$;

-- Programación: solo donde pg_cron exista (Supabase nube). En la caja no se hace nada. Molde de 0093.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tienda-pagos') THEN
      PERFORM cron.unschedule('tienda-pagos');
    END IF;
    PERFORM cron.schedule('tienda-pagos', '* * * * *', 'SELECT public.tienda_pagos_barrer()');
  END IF;
END $$;
