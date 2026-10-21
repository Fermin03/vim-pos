-- 0174 · Tienda en línea: propina de «otro monto» al pagar en línea.
--
-- Hasta la 0173 la propina era solo un porcentaje (0, 10, 15 o 20) que calcula el servidor. Ahora
-- el cliente también puede escribir un monto en pesos. tienda_crear_pedido gana un parámetro más,
-- AL FINAL y con valor por omisión:
--   · p_propina_mxn: solo con pago EN_LINEA y SIN p_propina_pct (son excluyentes); mayor que cero,
--     con dos decimales a lo más, y como máximo el subtotal de los productos (sin el envío) de la
--     cotización de ESTE pedido. Lo que no cumple: PAGO_INVALIDO.
-- Nada más cambia: el cuerpo es el de la 0173 §4, íntegro, con esas tres diferencias (el parámetro,
-- su validación en el paso 3 y de dónde sale v_propina en el paso 4).
--
-- Compatibilidad: la función `tienda` desplegada hoy llama por nombre y nunca manda p_propina_mxn,
-- así que sigue funcionando igual antes y después de aplicar esto. La que sí lo manda se despliega
-- DESPUÉS de esta migración. No usa Vault ni pg_net: corre igual en el Postgres de la caja.
--
-- La firma cambia, así que la anterior se va: con dos, PostgREST no sabría a cuál llamar.
DROP FUNCTION IF EXISTS tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer);
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
  p_propina_pct integer DEFAULT NULL,  -- solo EN_LINEA: 0, 10, 15 o 20. NULL = sin propina
  p_propina_mxn numeric DEFAULT NULL)  -- solo EN_LINEA y sin p_propina_pct: la propina de «otro monto», en pesos
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
  -- «Otro monto»: va en lugar del porcentaje (nunca los dos), solo en línea, mayor que cero y con
  -- dos decimales a lo más. Contra el subtotal se mide en el paso 4, que es donde se conoce (y
  -- ese tope también deja fuera NaN e infinito, que para numeric son mayores que todo).
  IF p_propina_mxn IS NOT NULL AND (NOT v_en_linea OR p_propina_pct IS NOT NULL
      OR (p_propina_mxn > 0 AND p_propina_mxn = round(p_propina_mxn, 2)) IS NOT TRUE) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: la propina de otro monto va sola, solo con el pago en línea, mayor que cero y con dos decimales';
  END IF;

  -- 4) La cotización: valida el carrito y la zona, y pone los renglones y los importes. Sus errores
  --    pasan tal cual. Y el total, si el cliente dijo cuál vio, tiene que seguir siendo ese.
  --    La propina es un porcentaje de los PRODUCTOS (sin el envío) que calcula el servidor, o el
  --    monto que escribió el cliente, de hasta ese subtotal; no entra en el total del pedido: va
  --    aparte, como en el ticket.
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items);
  v_total := (v_q ->> 'total_mxn')::numeric;
  IF p_total_esperado IS NOT NULL AND p_total_esperado IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'TOTAL_CAMBIO: %', v_q ->> 'total_mxn';   -- el total de ahora, con dos decimales
  END IF;
  IF v_en_linea THEN
    IF v_total <= 0 THEN RAISE EXCEPTION 'PAGO_INVALIDO: no hay nada que cobrar en línea'; END IF;
    IF p_propina_mxn IS NOT NULL THEN
      -- El tope lo pone el subtotal REAL de los productos (sin el envío), el de esta cotización.
      IF p_propina_mxn > (v_q ->> 'subtotal_mxn')::numeric THEN
        RAISE EXCEPTION 'PAGO_INVALIDO: la propina no puede ser mayor que el subtotal de los productos';
      END IF;
      v_propina := p_propina_mxn;
    ELSE
      v_propina := ROUND((v_q ->> 'subtotal_mxn')::numeric * COALESCE(p_propina_pct, 0) / 100, 2);
    END IF;
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

-- Los permisos son de la firma: la nueva nace con los de fábrica (EXECUTE para todos) y hay que
-- dejarla como estaba la anterior (0173 §9): solo service_role.
REVOKE ALL ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid, numeric, text, integer, numeric) TO service_role;
