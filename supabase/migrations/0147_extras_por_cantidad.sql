-- ============================================================================
-- 0147 — Sucursal adicional y caja adicional como extras de verdad (ADR 0024).
--
-- La página de precios vende "Sucursal adicional $599/mes" y "Caja adicional $249/mes", pero en
-- el catálogo `addons` solo existían CFDI y DELIVERY. En la práctica VIM subía el límite a mano
-- (`tenant_limites`, 0103) y el cargo no estaba atado a nada: ni el panel, ni el dueño, ni el MRR
-- sabían que ese cliente pagaba $599 más. Aquí pasan a ser add-ons con CANTIDAD que suben el
-- límite por sí solos.
--
-- QUÉ CAMBIA
--
--   A. `tenant_addons.cantidad` (1 por omisión: CFDI y DELIVERY no cambian) y las dos filas del
--      catálogo: SUCURSAL_EXTRA ($599) y CAJA_EXTRA ($249). `precio_mensual_mxn` es el precio
--      UNITARIO; lo que se paga es precio × cantidad.
--
--   B. `limites_efectivos()` —la ÚNICA lectura de límites: la usan los candados de cajas y
--      sucursales (0103, 0105), las directivas de la caja (0105…0142), `crear-empleado` y el
--      panel— suma los extras vigentes. LA PRECEDENCIA, explícita:
--
--          base     = la excepción de `tenant_limites` si existe; si no, el plan
--          efectivo = base + extras vigentes × cantidad         (NULL = sin límite, y sigue NULL)
--
--      Las excepciones que ya existen siguen valiendo exactamente lo mismo (sin extras, base =
--      efectivo). Y un extra contratado encima de una excepción SÍ sube el límite: si la excepción
--      fuera un tope final, el cliente pagaría por una caja que el sistema le niega.
--      Las llaves del JSON no cambian (`del_plan`, `excepcion` siguen ahí), así que
--      `resolver_directivas` no se toca y a la caja le sigue llegando solo el número final.
--
--   C. `fijar_extra_tenant()`: pone la cantidad de un extra (0 = quitarlo) en una transacción,
--      con las reglas que la pantalla no puede garantizar sola:
--        · CAJA_EXTRA en un plan sin límite de cajas (Cadena) se rechaza: no hay nada que ampliar.
--        · Bajar la cantidad por debajo de lo que el cliente ya usa se rechaza, diciendo cuánto usa.
--        · `addon_unico_activo` es UNIQUE (tenant, addon, fecha_inicio) —una sola alta por día—:
--          cambiar la cantidad el mismo día ACTUALIZA la fila de hoy; otro día cierra la vigente y
--          abre una nueva, para que la historia diga cuántas tuvo y desde cuándo.
--
--   D. `cambiar_plan_tenant()` (0141): los extras se pagan aparte, así que se CONSERVAN al cambiar
--      de plan. La única excepción es la que deja al cliente pagando por nada: si el plan nuevo no
--      tiene límite de cajas (o de sucursales), el extra correspondiente se retira en la misma
--      transacción y sale en `addons.retirados`.
--
-- LO QUE NO HACE: no convierte las excepciones existentes de `tenant_limites` en extras de pago.
-- Eso es cambiarle a un cliente lo que paga, y se habla con él. Tampoco valida al BAJAR de plan
-- que el uso quepa en los límites nuevos: ya era así (los candados solo actúan al dar de alta).
-- ============================================================================

-- ── A. Cantidad y catálogo ───────────────────────────────────────────────────
ALTER TABLE public.tenant_addons
  ADD COLUMN IF NOT EXISTS cantidad integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.tenant_addons ADD CONSTRAINT tenant_addons_cantidad_ck CHECK (cantidad >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.tenant_addons.cantidad IS
  'Cuántas unidades del add-on (0147). Solo los extras por cantidad (SUCURSAL_EXTRA, CAJA_EXTRA) usan más de 1. Se paga precio_mensual_mxn × cantidad.';
COMMENT ON COLUMN public.tenant_addons.precio_mensual_mxn IS
  'Precio UNITARIO mensual pactado para este cliente. Lo que se cobra es precio_mensual_mxn × cantidad (0147).';

INSERT INTO public.addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES
  ('SUCURSAL_EXTRA', 'Sucursal adicional',
   'Una sucursal más de las que incluye el plan. Se contrata por cantidad.',
   599.00, jsonb_build_object('por_cantidad', true, 'limite', 'max_sucursales'), 30),
  ('CAJA_EXTRA', 'Caja adicional',
   'Una caja más por sucursal de las que incluye el plan. Se contrata por cantidad.',
   249.00, jsonb_build_object('por_cantidad', true, 'limite', 'max_cajas_por_sucursal'), 40)
ON CONFLICT (codigo) DO NOTHING;

-- ── B. La lectura única de límites suma los extras ───────────────────────────

-- Cuántos extras vigentes de un tipo tiene el negocio HOY (hora de México). Misma regla de
-- vigencia que `tenant_addon_activo()` (0081): activo, ya empezó y no ha terminado.
CREATE OR REPLACE FUNCTION public._extras_vigentes(p_tenant uuid, p_codigo text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(sum(ta.cantidad), 0)::integer
    FROM public.tenant_addons ta
    JOIN public.addons a ON a.id = ta.addon_id
   WHERE ta.tenant_id = p_tenant
     AND a.codigo = p_codigo
     AND ta.activo
     AND ta.fecha_inicio <= (now() AT TIME ZONE 'America/Mexico_City')::date
     AND (ta.fecha_fin IS NULL OR ta.fecha_fin >= (now() AT TIME ZONE 'America/Mexico_City')::date)
$$;
COMMENT ON FUNCTION public._extras_vigentes(uuid, text) IS
  'Interna (0147): unidades vigentes hoy de un extra por cantidad. La usan limites_efectivos y fijar_extra_tenant.';
REVOKE ALL ON FUNCTION public._extras_vigentes(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._extras_vigentes(uuid, text) TO service_role;

-- Cuerpo de 0103 con UN cambio: los dos primeros límites suman sus extras. En SQL, NULL + n es
-- NULL: un plan sin límite sigue sin límite, que es lo que se quiere.
CREATE OR REPLACE FUNCTION limites_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_tenant IS NULL THEN NULL
    -- Mismo criterio que modulos_efectivos: por rol, no por ausencia del claim.
    WHEN auth.jwt() IS NOT NULL
         AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
         AND current_tenant_id() IS DISTINCT FROM p_tenant THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'max_sucursales',         COALESCE(l.max_sucursales, p.max_sucursales)
                                    + public._extras_vigentes(t.id, 'SUCURSAL_EXTRA'),
        'max_cajas_por_sucursal', COALESCE(l.max_cajas_por_sucursal, p.max_cajas_por_sucursal)
                                    + public._extras_vigentes(t.id, 'CAJA_EXTRA'),
        'max_usuarios',           COALESCE(l.max_usuarios, p.max_usuarios),
        'del_plan',  jsonb_build_object(
                       'max_sucursales', p.max_sucursales,
                       'max_cajas_por_sucursal', p.max_cajas_por_sucursal,
                       'max_usuarios', p.max_usuarios),
        'excepcion', jsonb_build_object(
                       'max_sucursales', l.max_sucursales,
                       'max_cajas_por_sucursal', l.max_cajas_por_sucursal,
                       'max_usuarios', l.max_usuarios,
                       'motivo', l.motivo))
      FROM tenants t
      LEFT JOIN planes p ON p.id = t.plan_actual_id
      LEFT JOIN tenant_limites l ON l.tenant_id = t.id
      WHERE t.id = p_tenant)
  END;
$$;
COMMENT ON FUNCTION limites_efectivos(uuid) IS
  'Límites por cliente (ADR 0024): base = excepción de tenant_limites si existe, si no el plan; a sucursales y cajas se les suman los extras vigentes (SUCURSAL_EXTRA, CAJA_EXTRA) × cantidad. NULL = sin límite.';
REVOKE EXECUTE ON FUNCTION limites_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION limites_efectivos(uuid) TO authenticated, service_role;

-- Los candados de cajas (0103) y sucursales (0105) no se tocan: leen `limites_efectivos`, así que
-- ya aplican el número con extras.

-- ── C. Poner la cantidad de un extra ─────────────────────────────────────────
--
-- p_cantidad = 0 lo quita. p_precio NULL = el que ya tenía pactado y, si no tenía, el de catálogo.
-- Errores (el mensaje es el código; el HINT, la frase para el operador):
--   EXTRA_INVALIDO · CANTIDAD_INVALIDA · PRECIO_INVALIDO · TENANT_NO_EXISTE · SIN_CAMBIOS
--   SIN_LIMITE  — el plan ya no tiene tope de eso: no hay nada que ampliar.
--   EXTRA_EN_USO — la cantidad nueva dejaría el límite por debajo de lo que el cliente ya usa.
CREATE OR REPLACE FUNCTION public.fijar_extra_tenant(
  p_tenant_id uuid,
  p_codigo    text,
  p_cantidad  integer,
  p_precio    numeric DEFAULT NULL,
  p_notas     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_maximo     constant integer := 50;
  v_hoy        date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_addon      public.addons%ROWTYPE;
  v_columna    text;
  v_base       integer;
  v_antes      integer;
  v_uso        integer;
  v_precio     numeric;
  v_precio_act numeric;
  v_n          integer;
  v_que        text;
BEGIN
  IF p_codigo IS NULL OR p_codigo NOT IN ('SUCURSAL_EXTRA', 'CAJA_EXTRA') THEN
    RAISE EXCEPTION 'EXTRA_INVALIDO' USING HINT = 'Solo la sucursal adicional y la caja adicional se contratan por cantidad.';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 0 OR p_cantidad > c_maximo THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA' USING HINT = format('La cantidad va de 0 a %s.', c_maximo);
  END IF;
  IF p_precio IS NOT NULL AND (p_precio < 0 OR p_precio > 99999999.99 OR p_precio <> round(p_precio, 2)) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO' USING HINT = 'Un importe en pesos, de 0 en adelante, con hasta dos decimales.';
  END IF;

  -- El tenant bloqueado: dos pestañas cambiando el mismo extra se ponen en fila.
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE'; END IF;

  SELECT * INTO v_addon FROM public.addons WHERE codigo = p_codigo;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXTRA_INVALIDO' USING HINT = 'Ese extra no está en el catálogo.'; END IF;

  v_columna := CASE p_codigo WHEN 'SUCURSAL_EXTRA' THEN 'max_sucursales' ELSE 'max_cajas_por_sucursal' END;
  v_que     := CASE p_codigo WHEN 'SUCURSAL_EXTRA' THEN 'sucursales' ELSE 'cajas' END;

  -- La base sobre la que se suman los extras: la excepción si existe; si no, el plan (ADR 0024).
  SELECT CASE p_codigo
           WHEN 'SUCURSAL_EXTRA' THEN COALESCE(l.max_sucursales, p.max_sucursales)
           ELSE COALESCE(l.max_cajas_por_sucursal, p.max_cajas_por_sucursal)
         END
    INTO v_base
    FROM public.tenants t
    LEFT JOIN public.planes p ON p.id = t.plan_actual_id
    LEFT JOIN public.tenant_limites l ON l.tenant_id = t.id
   WHERE t.id = p_tenant_id;

  v_antes := public._extras_vigentes(p_tenant_id, p_codigo);
  IF p_cantidad = v_antes AND p_precio IS NULL THEN
    RAISE EXCEPTION 'SIN_CAMBIOS' USING HINT = 'Ya tiene esa cantidad.';
  END IF;

  IF v_base IS NULL AND p_cantidad > 0 THEN
    RAISE EXCEPTION 'SIN_LIMITE'
      USING HINT = format('Su plan ya trae %s sin límite: un extra no le añade nada.', v_que);
  END IF;

  -- Lo que ya usa. Cajas: la sucursal que MÁS tiene (el límite es por sucursal).
  IF p_codigo = 'SUCURSAL_EXTRA' THEN
    SELECT count(*) INTO v_uso FROM public.sucursales
     WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND activa;
  ELSE
    SELECT COALESCE(max(n), 0) INTO v_uso FROM (
      SELECT count(*) AS n FROM public.cajas
       WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND activa
       GROUP BY sucursal_id) x;
  END IF;
  IF v_base IS NOT NULL AND p_cantidad < v_antes AND v_uso > v_base + p_cantidad THEN
    RAISE EXCEPTION 'EXTRA_EN_USO'
      USING HINT = CASE p_codigo
        WHEN 'SUCURSAL_EXTRA' THEN format('Tiene %s sucursales activas y el límite quedaría en %s. Tiene que desactivar %s antes.', v_uso, v_base + p_cantidad, v_uso - v_base - p_cantidad)
        ELSE format('Tiene %s cajas activas en una sucursal y el límite quedaría en %s por sucursal. Tiene que desactivar %s antes.', v_uso, v_base + p_cantidad, v_uso - v_base - p_cantidad)
      END;
  END IF;

  -- El precio unitario: el que se manda; si no, el que ya tenía pactado; si no, el de catálogo.
  SELECT ta.precio_mensual_mxn INTO v_precio_act
    FROM public.tenant_addons ta
   WHERE ta.tenant_id = p_tenant_id AND ta.addon_id = v_addon.id AND ta.activo
   ORDER BY ta.fecha_inicio DESC LIMIT 1;
  v_precio := COALESCE(p_precio, v_precio_act, v_addon.precio_mensual_mxn);

  IF p_cantidad = 0 THEN
    UPDATE public.tenant_addons
       SET activo = false, fecha_fin = v_hoy, updated_at = now(),
           notas = COALESCE(NULLIF(btrim(p_notas), ''), notas)
     WHERE tenant_id = p_tenant_id AND addon_id = v_addon.id AND activo;
  ELSE
    -- Las vigentes de OTRO día se cierran hoy: su fila dice cuántas tuvo y hasta cuándo.
    UPDATE public.tenant_addons
       SET activo = false, fecha_fin = v_hoy, updated_at = now()
     WHERE tenant_id = p_tenant_id AND addon_id = v_addon.id AND activo AND fecha_inicio <> v_hoy;
    -- La de HOY (vigente o dada de baja hoy mismo) se actualiza en su lugar: un INSERT chocaría
    -- con addon_unico_activo, que es UNIQUE (tenant, addon, fecha_inicio).
    UPDATE public.tenant_addons
       SET activo = true, fecha_fin = NULL, cantidad = p_cantidad, precio_mensual_mxn = v_precio,
           incluido_en_plan = false, notas = COALESCE(NULLIF(btrim(p_notas), ''), notas), updated_at = now()
     WHERE tenant_id = p_tenant_id AND addon_id = v_addon.id AND fecha_inicio = v_hoy;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, cantidad, notas, incluido_en_plan)
      VALUES (p_tenant_id, v_addon.id, v_hoy, true, v_precio, p_cantidad, NULLIF(btrim(p_notas), ''), false);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'codigo', p_codigo,
    'cantidad_antes', v_antes,
    'cantidad_despues', p_cantidad,
    'precio_unitario', CASE WHEN p_cantidad = 0 THEN NULL ELSE v_precio END,
    'importe_mensual', v_precio * p_cantidad,
    'limite', v_columna,
    'limite_antes', v_base + v_antes,
    'limite_despues', v_base + p_cantidad,
    'en_uso', v_uso);
END;
$$;
COMMENT ON FUNCTION public.fijar_extra_tenant(uuid, text, integer, numeric, text) IS
  'Panel de plataforma (0147, ADR 0024): pone la cantidad de SUCURSAL_EXTRA o CAJA_EXTRA de un negocio (0 = quitar). Rechaza un extra sobre un límite inexistente y bajar por debajo de lo que ya usa. Solo service_role.';
REVOKE ALL ON FUNCTION public.fijar_extra_tenant(uuid, text, integer, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fijar_extra_tenant(uuid, text, integer, numeric, text) TO service_role;

-- ── D. Cambiar de plan conserva los extras, salvo los que ya no amplían nada ──

-- Retira los extras cuyo límite base quedó en NULL (sin límite). Interna: la llama cambiar_plan_tenant.
CREATE OR REPLACE FUNCTION public._retirar_extras_sin_limite(p_tenant uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy  date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_suc  integer;
  v_caj  integer;
  v_n    integer;
  v_ret  text[] := '{}';
  r      record;
BEGIN
  SELECT COALESCE(l.max_sucursales, p.max_sucursales), COALESCE(l.max_cajas_por_sucursal, p.max_cajas_por_sucursal)
    INTO v_suc, v_caj
    FROM public.tenants t
    LEFT JOIN public.planes p ON p.id = t.plan_actual_id
    LEFT JOIN public.tenant_limites l ON l.tenant_id = t.id
   WHERE t.id = p_tenant;

  FOR r IN SELECT * FROM (VALUES ('SUCURSAL_EXTRA', v_suc, 'sucursales'), ('CAJA_EXTRA', v_caj, 'cajas')) AS x(codigo, base, que) LOOP
    CONTINUE WHEN r.base IS NOT NULL;
    UPDATE public.tenant_addons ta
       SET activo = false, fecha_fin = v_hoy, updated_at = now(),
           notas = concat_ws(' · ', ta.notas, format('Retirado al cambiar de plan: el plan nuevo trae %s sin límite', r.que))
      FROM public.addons a
     WHERE a.id = ta.addon_id AND a.codigo = r.codigo AND ta.tenant_id = p_tenant AND ta.activo;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_ret := v_ret || r.codigo; END IF;
  END LOOP;
  RETURN v_ret;
END;
$$;
COMMENT ON FUNCTION public._retirar_extras_sin_limite(uuid) IS
  'Interna (0147): cierra SUCURSAL_EXTRA / CAJA_EXTRA cuando el límite base del negocio ya es "sin límite" (p. ej. al subir a Cadena), para que no pague por nada.';
REVOKE ALL ON FUNCTION public._retirar_extras_sin_limite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._retirar_extras_sin_limite(uuid) TO service_role;

-- Cuerpo de 0141 con UN cambio: tras sincronizar los add-ons que incluye el plan, se retiran los
-- extras que el plan nuevo vuelve inútiles (y se añaden a `addons.retirados`). Todo lo demás —el
-- bloqueo del tenant, los folios, la suscripción en su lugar— es idéntico.
CREATE OR REPLACE FUNCTION public.cambiar_plan_tenant(
  p_tenant_id uuid,
  p_plan_id   uuid,
  p_precio    numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy          date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_antes        uuid;
  v_plan         public.planes%ROWTYPE;
  v_ant_nombre   text;
  v_folios_antes int;
  v_folios       int;
  v_addons       jsonb;
  v_extras       text[];
  v_s            public.suscripciones%ROWTYPE;
  v_precio       numeric;
  v_susc         jsonb := NULL;
BEGIN
  IF p_precio IS NOT NULL AND (p_precio < 0 OR p_precio > 99999999.99 OR p_precio <> round(p_precio, 2)) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO' USING HINT = 'Un importe en pesos, de 0 en adelante, con hasta dos decimales.';
  END IF;

  SELECT plan_actual_id INTO v_antes FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE'; END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NO_EXISTE'; END IF;
  IF v_antes IS NOT DISTINCT FROM p_plan_id THEN RAISE EXCEPTION 'MISMO_PLAN'; END IF;
  -- A un plan retirado no se entra; quien ya está en uno lo conserva (0086).
  IF NOT v_plan.activo THEN RAISE EXCEPTION 'PLAN_RETIRADO'; END IF;
  SELECT nombre INTO v_ant_nombre FROM public.planes WHERE id = v_antes;

  UPDATE public.tenants SET plan_actual_id = p_plan_id WHERE id = p_tenant_id;

  -- Folios del mes.
  v_folios := COALESCE(v_plan.timbres_cfdi_mensuales, 0);
  SELECT folios_base_mensuales INTO v_folios_antes FROM public.tenant_folios_saldo WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.tenant_folios_saldo SET folios_base_mensuales = v_folios, updated_at = now() WHERE tenant_id = p_tenant_id;
  ELSE
    INSERT INTO public.tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
    VALUES (p_tenant_id, v_folios, 0, date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date, 0);
  END IF;

  -- Add-ons que el plan incluye.
  v_addons := public._sincronizar_addons_del_plan(p_tenant_id, p_plan_id, true);

  -- Extras por cantidad (0147): se pagan aparte y se conservan, salvo los que el plan nuevo deja
  -- sin sentido (cajas adicionales en un plan con cajas sin límite).
  v_extras := public._retirar_extras_sin_limite(p_tenant_id);
  IF cardinality(v_extras) > 0 THEN
    v_addons := jsonb_set(v_addons, '{retirados}', COALESCE(v_addons->'retirados', '[]'::jsonb) || to_jsonb(v_extras));
  END IF;

  -- El cobro vigente (activo o en pausa: al reanudar, cobraría el plan viejo).
  SELECT * INTO v_s FROM public.suscripciones
   WHERE tenant_id = p_tenant_id AND estado IN ('ACTIVA', 'PAUSADA')
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    v_precio := COALESCE(p_precio, v_plan.precio_mensual_mxn);
    UPDATE public.suscripciones
       SET plan_id = p_plan_id,
           precio_mensual_mxn = v_precio,
           precio_promocional_mxn = NULL, promocion_hasta = NULL, promocion_nombre = NULL,
           notas = concat_ws(E'\n', notas, format('%s · Cambio de plan %s → %s; precio %s → %s%s',
                     v_hoy, COALESCE(v_ant_nombre, 'sin plan'), v_plan.nombre, v_s.precio_mensual_mxn, v_precio,
                     CASE WHEN v_s.precio_promocional_mxn IS NOT NULL
                          THEN format('; se quitó la promoción %s (%s hasta %s)', COALESCE(v_s.promocion_nombre, ''), v_s.precio_promocional_mxn, v_s.promocion_hasta)
                          ELSE '' END)),
           updated_at = now()
     WHERE id = v_s.id;
    v_susc := jsonb_build_object(
      'id', v_s.id, 'precio_antes', v_s.precio_mensual_mxn, 'precio_despues', v_precio,
      'promocion_quitada', v_s.precio_promocional_mxn IS NOT NULL);
  END IF;

  RETURN jsonb_build_object(
    'plan_anterior', v_antes, 'plan_nuevo', p_plan_id,
    'folios_antes', v_folios_antes, 'folios_despues', v_folios,
    'addons', v_addons, 'suscripcion', v_susc);
END;
$$;
REVOKE ALL ON FUNCTION public.cambiar_plan_tenant(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_plan_tenant(uuid, uuid, numeric) TO service_role;
COMMENT ON FUNCTION public.cambiar_plan_tenant(uuid, uuid, numeric) IS
  'Panel de plataforma (0141, 0147): cambia el plan y en la misma transacción ajusta folios del mes, add-ons incluidos, extras que el plan nuevo deja sin sentido y el precio de la suscripción vigente (en su lugar). Solo service_role.';
