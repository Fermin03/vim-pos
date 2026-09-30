-- ============================================================================
-- 0141 · Cobro: precio de promoción, prueba con fecha de fin, cambio de plan que ajusta lo que el
--        plan incluye, y los datos de pago que ve el dueño. ADR 0021.
--
-- Cuatro huecos de la auditoría de cobro (30/09/2026), verificados en el código:
--
--   1. El precio del piloto no se podía capturar. `suscripcion_activar` guardaba el precio de lista
--      ($699) aunque el trato fuera $499 seis meses; el dueño veía $699 y el MRR salía inflado. Y no
--      había cómo programar el regreso al precio de lista.
--   2. La prueba no terminaba nunca. No había fecha de fin, y la alerta "Trial por vencer" del panel
--      buscaba `suscripciones.estado = 'TRIAL'`, un valor que el enum ni tiene: código muerto.
--   3. Cambiar de plan solo movía `tenants.plan_actual_id`. Los folios mensuales seguían en los del
--      plan anterior, subir a Negocio no daba la facturación ni el delivery que incluye, y bajar a
--      Esencial se los dejaba gratis.
--   4. "Plan y pagos" le pedía al dueño mandar el comprobante sin decirle a qué cuenta pagar ni a
--      quién escribir.
--
-- TODO ES ADITIVO. Columnas nuevas NULL, una tabla nueva, funciones nuevas y dos reemplazos
-- (`activar_suscripcion`, `crear_tenant_con_owner`) cuyo contrato con quien las llama se conserva.
--
-- SEGURO EN EL ESCRITORIO. La caja aplica estas mismas migraciones en su Postgres embebido. Aquí no
-- hay nada de storage ni de auth más allá de `auth.jwt()`/`auth.uid()`, que el shim del escritorio
-- ya define; los UPDATE de datos son idempotentes y sobre una caja no tocan nada que la caja use.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- A. Precio de promoción en la suscripción
--
-- La regla, en un solo lugar (espejo en TS: `precioVigente` de packages/db/src/cobro.ts):
--
--   precio vigente = precio_promocional_mxn  si hoy (hora de México) <= promocion_hasta
--                  = precio_mensual_mxn       en cualquier otro caso
--
-- `precio_mensual_mxn` sigue siendo el precio de lista pactado: el que se cobra cuando la promoción
-- termina. La promoción no lo pisa, se le pone ENCIMA con fecha de caducidad — así el regreso al
-- precio normal está programado desde el día del alta y no depende de que alguien se acuerde.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS precio_promocional_mxn numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS promocion_hasta        date          NULL,
  ADD COLUMN IF NOT EXISTS promocion_nombre       text          NULL;

DO $$ BEGIN
  ALTER TABLE public.suscripciones
    ADD CONSTRAINT suscripciones_promocion_precio_ck CHECK (precio_promocional_mxn IS NULL OR precio_promocional_mxn >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Precio y fecha van juntos: una promoción sin fin no es promoción, y una fecha sin precio no dice nada.
  ALTER TABLE public.suscripciones
    ADD CONSTRAINT suscripciones_promocion_completa_ck CHECK ((precio_promocional_mxn IS NULL) = (promocion_hasta IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.suscripciones
    ADD CONSTRAINT suscripciones_promocion_nombre_ck CHECK (
      promocion_nombre IS NULL OR (precio_promocional_mxn IS NOT NULL AND length(btrim(promocion_nombre)) BETWEEN 1 AND 80));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.suscripciones.precio_mensual_mxn IS
  'Precio mensual pactado de lista (snapshot al contratar). Lo que se cobra cuando no hay promoción vigente. El precio del día sale de precio_vigente_suscripcion() (0141).';
COMMENT ON COLUMN public.suscripciones.precio_promocional_mxn IS
  'Precio mensual de promoción (0141). Vale mientras hoy en México sea <= promocion_hasta; después manda precio_mensual_mxn.';
COMMENT ON COLUMN public.suscripciones.promocion_hasta IS
  'Último día (inclusive, hora de México) en que vale el precio de promoción (0141).';
COMMENT ON COLUMN public.suscripciones.promocion_nombre IS
  'Nombre de la promoción para mostrarla ("Piloto 5 negocios") (0141).';

-- La regla del precio vigente. `p_fecha` NULL = hoy en México; se puede pasar otra para preguntar
-- "¿cuánto toca en tal fecha de cobro?". Sin SECURITY DEFINER: no lee tablas, solo decide.
CREATE OR REPLACE FUNCTION public.precio_vigente_suscripcion(
  p_precio_lista numeric,
  p_precio_promo numeric,
  p_promo_hasta  date,
  p_fecha        date DEFAULT NULL
) RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN p_precio_promo IS NOT NULL AND p_promo_hasta IS NOT NULL
            AND COALESCE(p_fecha, (now() AT TIME ZONE 'America/Mexico_City')::date) <= p_promo_hasta
           THEN p_precio_promo
           ELSE p_precio_lista
         END
$$;
COMMENT ON FUNCTION public.precio_vigente_suscripcion(numeric, numeric, date, date) IS
  'Precio de la suscripción en una fecha (hoy en México si es NULL): el de promoción hasta promocion_hasta inclusive, después el de lista. Espejo: precioVigente() en @vim/db/cobro (0141, ADR 0021).';
GRANT EXECUTE ON FUNCTION public.precio_vigente_suscripcion(numeric, numeric, date, date) TO authenticated, service_role;


-- ── activar_suscripcion con promoción ───────────────────────────────────────
-- Se BORRA la firma de 0137 y se crea la nueva. Con las dos vivas, una llamada con cinco
-- argumentos sería ambigua (los tres nuevos tienen DEFAULT) y PostgREST no sabría a cuál ir.
-- Todo lo de 0137 se conserva: transacción única, bloqueo del tenant, validar antes de tocar.
DROP FUNCTION IF EXISTS public.activar_suscripcion(uuid, numeric, text, date, date);

CREATE OR REPLACE FUNCTION public.activar_suscripcion(
  p_tenant_id     uuid,
  p_precio        numeric,
  p_ciclo         text,
  p_inicio        date,
  p_proxima       date,
  p_promo_precio  numeric DEFAULT NULL,
  p_promo_hasta   date    DEFAULT NULL,
  p_promo_nombre  text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan    uuid;
  v_id      uuid;
  v_expir   int;
  v_nombre  text := NULLIF(btrim(p_promo_nombre), '');
BEGIN
  IF p_precio IS NULL OR p_precio < 0 OR p_precio > 99999999.99 OR p_precio <> round(p_precio, 2) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO' USING HINT = 'Un importe en pesos, de 0 en adelante, con hasta dos decimales.';
  END IF;
  IF p_ciclo IS NULL OR p_ciclo NOT IN ('MENSUAL', 'ANUAL') THEN
    RAISE EXCEPTION 'CICLO_INVALIDO';
  END IF;
  IF p_inicio IS NULL OR p_proxima IS NULL OR p_proxima <= p_inicio THEN
    RAISE EXCEPTION 'FECHAS_INVALIDAS';
  END IF;

  -- Promoción: las tres piezas juntas o ninguna (el nombre es opcional, pero no suelto).
  IF (p_promo_precio IS NULL) <> (p_promo_hasta IS NULL) OR (v_nombre IS NOT NULL AND p_promo_precio IS NULL) THEN
    RAISE EXCEPTION 'PROMOCION_INCOMPLETA' USING HINT = 'Precio y fecha de fin de la promoción van juntos.';
  END IF;
  IF p_promo_precio IS NOT NULL THEN
    -- Una "promoción" igual o más cara que la lista no es promoción: casi seguro es un error de captura.
    IF p_promo_precio < 0 OR p_promo_precio > 99999999.99 OR p_promo_precio <> round(p_promo_precio, 2) OR p_promo_precio >= p_precio THEN
      RAISE EXCEPTION 'PROMOCION_PRECIO_INVALIDO' USING HINT = 'Menor que el precio de lista, de 0 en adelante, con hasta dos decimales.';
    END IF;
    IF p_promo_hasta <= p_inicio THEN
      RAISE EXCEPTION 'PROMOCION_FECHA_INVALIDA' USING HINT = 'La promoción termina después del inicio del cobro.';
    END IF;
    IF v_nombre IS NOT NULL AND length(v_nombre) > 80 THEN
      RAISE EXCEPTION 'PROMOCION_NOMBRE_INVALIDO';
    END IF;
  END IF;

  -- La fila del tenant, bloqueada: dos altas simultáneas se forman, no se cruzan.
  SELECT plan_actual_id INTO v_plan FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NO_EXISTE';
  END IF;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'TENANT_SIN_PLAN';
  END IF;

  UPDATE public.suscripciones
     SET estado = 'EXPIRADA', fecha_fin = p_inicio, updated_at = now()
   WHERE tenant_id = p_tenant_id AND estado = 'ACTIVA';
  GET DIAGNOSTICS v_expir = ROW_COUNT;

  INSERT INTO public.suscripciones
    (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro,
     precio_promocional_mxn, promocion_hasta, promocion_nombre)
  VALUES
    (p_tenant_id, v_plan, p_inicio, 'ACTIVA', p_precio, p_ciclo, p_proxima,
     p_promo_precio, p_promo_hasta, CASE WHEN p_promo_precio IS NULL THEN NULL ELSE v_nombre END)
  RETURNING id INTO v_id;

  UPDATE public.tenants SET estado = 'ACTIVO' WHERE id = p_tenant_id AND estado = 'TRIAL';

  RETURN jsonb_build_object('suscripcion_id', v_id, 'plan_id', v_plan, 'expiradas', v_expir);
END;
$$;

REVOKE ALL ON FUNCTION public.activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text) TO service_role;
COMMENT ON FUNCTION public.activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text) IS
  'Panel de plataforma (0137, promoción en 0141): expira la ACTIVA, crea la nueva con precio de lista y promoción opcional, y pasa TRIAL→ACTIVO en una transacción. Solo service_role.';


-- ────────────────────────────────────────────────────────────────────────────
-- B. La prueba gratis tiene fecha de fin
--
-- 30 días desde el alta, en hora de México. Se pone con un trigger y no en cada Edge Function
-- (signup-tenant, provisionar-tenant) para que TODA alta en prueba la tenga, incluidas las que
-- entren mañana por un camino nuevo. El trigger solo rellena si viene vacía: quien la mande
-- explícita (una semilla, el panel) manda.
--
-- NO bloquea nada. Vencer la prueba avisa al dueño y al panel; suspender sigue siendo una decisión
-- de VIM con motivo y días de gracia (ADR 0014/0020).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS prueba_hasta date NULL;
COMMENT ON COLUMN public.tenants.prueba_hasta IS
  'Último día de la prueba gratis (hora de México). Se pone sola al alta en TRIAL: +30 días (0141). No bloquea: solo avisa.';

CREATE OR REPLACE FUNCTION public.tenants_prueba_por_defecto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado = 'TRIAL' AND NEW.prueba_hasta IS NULL THEN
    NEW.prueba_hasta := (now() AT TIME ZONE 'America/Mexico_City')::date + 30;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_prueba_por_defecto ON public.tenants;
CREATE TRIGGER tenants_prueba_por_defecto
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_prueba_por_defecto();

-- Los que ya están en prueba: 30 días desde su alta. A los que ya pasaron se les queda la fecha
-- vencida a propósito — es la verdad, y justo lo que la alerta "Prueba vencida sin cobro" busca.
UPDATE public.tenants
   SET prueba_hasta = (created_at AT TIME ZONE 'America/Mexico_City')::date + 30
 WHERE estado = 'TRIAL' AND prueba_hasta IS NULL;

-- El dueño NO puede moverla: 0132 dejó el UPDATE de tenants en una lista cerrada de columnas y
-- `prueba_hasta` no entra. Solo el panel (service_role) la extiende.


-- ────────────────────────────────────────────────────────────────────────────
-- C. Cambiar de plan ajusta lo que el plan incluye
--
-- CÓMO SE SABE QUÉ INCLUYE UN PLAN. `planes.features_incluidos`:
--   · `cfdi_incluido`     — ya existía (0086) y lo lee el alta.
--   · `delivery_incluido` — NUEVA aquí. Hasta hoy la inclusión de delivery solo vivía en TS
--     (`precioAltaDelivery`, apps/platform/app/lib/addons.ts), que la usaba para pre-llenar $0.00.
--     Se escribe con la misma lista de planes que usa esa función, para que digan lo mismo.
--
-- CÓMO SE SABE QUÉ SE DIO POR EL PLAN. `tenant_addons.incluido_en_plan`. Sin esta marca, al bajar
-- de plan no hay forma de distinguir "lo tenía incluido" de "lo paga aparte" (o "se lo regalamos
-- por cortesía"). Al bajar solo se retira lo que tiene la marca; lo que paga aparte se queda.
--
-- La trampa de `addon_unico_activo` = UNIQUE (tenant, addon, fecha_inicio) — una sola alta por día
-- y por add-on (ver apps/platform/app/lib/addons.ts): bajar y volver a subir de plan el mismo día
-- no inserta otra fila, reactiva la de hoy.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_addons ADD COLUMN IF NOT EXISTS incluido_en_plan boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tenant_addons.incluido_en_plan IS
  'true = lo dio el plan a $0 (0141). Al bajar a un plan que no lo incluye se retira; los add-ons que el cliente paga aparte no se tocan.';

-- Las filas que ya existían como "incluido": las del alta (0086, "Incluido en el plan …") y las
-- del panel a $0 sin motivo propio ("incluido en el plan"). Las de cortesía llevan otra nota.
UPDATE public.tenant_addons
   SET incluido_en_plan = true
 WHERE incluido_en_plan = false
   AND precio_mensual_mxn = 0
   AND notas ILIKE 'incluido en el plan%';

-- Delivery incluido: la misma lista que `PLANES_QUE_LO_INCLUYEN` en apps/platform/app/lib/addons.ts
-- (todo menos Esencial, nombrando a quien lo incluye para que un plan nuevo no se regale solo).
UPDATE public.planes
   SET features_incluidos = COALESCE(features_incluidos, '{}'::jsonb) || jsonb_build_object('delivery_incluido', codigo <> 'ESENCIAL'),
       updated_at = now()
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- Pone los add-ons de un tenant de acuerdo con lo que incluye un plan. Interna: la llaman
-- `cambiar_plan_tenant` y `crear_tenant_con_owner`, nadie más.
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

  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido')) AS x(codigo, bandera) LOOP
    SELECT id INTO v_addon FROM public.addons WHERE codigo = r.codigo;
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
        IF FOUND THEN
          -- Lo pagaba aparte: esa fila se cierra hoy (la historia de lo que pagó se queda) y entra
          -- una nueva a $0. Cobrarle aparte lo que su plan ya incluye sería cobrarlo dos veces.
          UPDATE public.tenant_addons
             SET activo = false, fecha_fin = v_hoy, updated_at = now(),
                 notas = concat_ws(' · ', notas, 'Pasa a incluido en el plan ' || COALESCE(v_plan_nom, ''))
           WHERE id = v_fila.id;
        END IF;
        -- ¿Una baja de HOY? Se reactiva esa fila: un INSERT chocaría con addon_unico_activo.
        UPDATE public.tenant_addons
           SET activo = true, fecha_fin = NULL, precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE tenant_id = p_tenant AND addon_id = v_addon AND fecha_inicio = v_hoy AND NOT activo;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
          VALUES (p_tenant, v_addon, v_hoy, true, 0, v_nota, true);
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
  'Interna (0141): concede a $0 los add-ons que el plan incluye (CFDI, DELIVERY) y, si p_retirar, quita los que se dieron por el plan anterior. Respeta addon_unico_activo reactivando la fila del día.';

-- ── cambiar_plan_tenant ─────────────────────────────────────────────────────
-- En UNA transacción: el plan, los folios del mes, los add-ons incluidos y el precio del cobro.
--
-- LA SUSCRIPCIÓN SE ACTUALIZA EN SU LUGAR, no se abre otra fila. Razones:
--   · Los pagos (0130) cuelgan de `suscripcion_id`, y el periodo que cubre cada pago se cuenta desde
--     la fecha de alta de ESA suscripción. Una fila nueva reiniciaría el ancla de cobro (el cliente
--     del día 31 pasaría a pagar el día del cambio) y dejaría los pagos anteriores colgando de una
--     fila EXPIRADA, con `anular_pago_suscripcion` sin poder anular el último.
--   · El historial de precio no se pierde: cada pago guarda su monto, la bitácora del panel guarda
--     precio anterior y nuevo, y aquí se anota el cambio en `suscripciones.notas`.
-- La promoción se quita: se pactó para el plan anterior (el piloto es solo de Esencial). Si se
-- acuerda otra, se captura de nuevo.
--
-- LOS FOLIOS DEL MES siguen al plan desde ya: `folios_base_mensuales` es una copia por tenant que
-- consume `consumir_folio_cfdi` (0002/0132) y nadie más actualizaba. Lo consumido no se toca: al
-- subir le quedan más este mes; al bajar, si ya gastó más que la base nueva, pasa a paquetes.
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
  'Panel de plataforma (0141, ADR 0021): cambia el plan y en la misma transacción ajusta folios del mes, add-ons incluidos y el precio de la suscripción vigente (en su lugar). Solo service_role.';

-- ── El alta usa la misma regla ──────────────────────────────────────────────
-- Cuerpo de 0086 con un solo cambio: la siembra del add-on incluido pasa por
-- `_sincronizar_addons_del_plan`, así el alta y el cambio de plan no pueden decir cosas distintas
-- (y el alta en Negocio/Cadena ya trae también delivery a $0 — el interruptor del dueño sigue
-- apagado, así que la caja no sondea nada hasta que él lo encienda, 0113).
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_estado           tenant_estado,
  p_notas_internas   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_plan   uuid;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Unidades de medida (0085). */
  PERFORM sembrar_unidades_base(v_tenant);

  /* Lo que el plan incluye (0086 → 0141). En el alta no hay nada que retirar. */
  SELECT id INTO v_plan FROM planes WHERE codigo = p_plan_codigo;
  IF v_plan IS NOT NULL THEN
    PERFORM public._sincronizar_addons_del_plan(v_tenant, v_plan, false);
  END IF;

  RETURN v_tenant;
END;
$$;
COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base, siembra unidades de medida (0085) y los add-ons que el plan incluye (0086, 0141). La prueba (prueba_hasta) la pone el trigger de tenants.';
-- CREATE OR REPLACE conserva los privilegios; se repiten por si alguien lee solo esta migración.
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- D. Los datos de pago que ve el dueño
--
-- Una sola fila (id = true). La escribe el panel (service_role) y se audita ahí; el dueño la lee
-- SOLO por `datos_pago_plataforma()`, que devuelve estos campos y nada más. Sin políticas RLS a
-- propósito: ni authenticated ni anon tocan la tabla.
-- ────────────────────────────────────────────────────────────────────────────

-- CLABE: 18 dígitos y el dígito de control de Banxico (pesos 3-7-1 sobre los primeros 17, cada
-- producto módulo 10, y el control es (10 − suma mod 10) mod 10). Espejo: `clabeValida` en @vim/db/cobro.
CREATE OR REPLACE FUNCTION public.clabe_valida(p_clabe text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_suma int := 0;
  i      int;
  v_pesos int[] := ARRAY[3, 7, 1];
BEGIN
  IF p_clabe IS NULL OR p_clabe !~ '^[0-9]{18}$' THEN RETURN false; END IF;
  FOR i IN 1..17 LOOP
    v_suma := v_suma + (substr(p_clabe, i, 1)::int * v_pesos[((i - 1) % 3) + 1]) % 10;
  END LOOP;
  RETURN ((10 - (v_suma % 10)) % 10) = substr(p_clabe, 18, 1)::int;
END;
$$;
COMMENT ON FUNCTION public.clabe_valida(text) IS 'CLABE interbancaria válida: 18 dígitos y dígito de control (0141). Espejo: clabeValida() en @vim/db/cobro.';
GRANT EXECUTE ON FUNCTION public.clabe_valida(text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.plataforma_datos_pago (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  banco         text NULL CHECK (banco IS NULL OR length(btrim(banco)) BETWEEN 2 AND 80),
  titular       text NULL CHECK (titular IS NULL OR length(btrim(titular)) BETWEEN 2 AND 120),
  clabe         text NULL CHECK (clabe IS NULL OR public.clabe_valida(clabe)),
  -- Número de WhatsApp en dígitos con lada de país (52…), como lo pide wa.me.
  whatsapp      text NULL CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),
  correo        text NULL CHECK (correo IS NULL OR (length(correo) <= 254 AND correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  instrucciones text NULL CHECK (instrucciones IS NULL OR length(instrucciones) <= 500),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NULL
);
COMMENT ON TABLE public.plataforma_datos_pago IS
  'Datos para pagarle a VIM (una fila). Escribe solo el panel de plataforma; el dueño lee por datos_pago_plataforma() (0141).';
ALTER TABLE public.plataforma_datos_pago ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_datos_pago FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plataforma_datos_pago TO service_role;

CREATE OR REPLACE FUNCTION public.datos_pago_plataforma()
RETURNS TABLE (banco text, titular text, clabe text, whatsapp text, correo text, instrucciones text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- El dueño o el administrador de un negocio (los mismos que ven sus pagos, 0130). Un cajero no.
  SELECT d.banco, d.titular, d.clabe, d.whatsapp, d.correo, d.instrucciones
    FROM public.plataforma_datos_pago d
   WHERE d.id
     AND public.current_tenant_id() IS NOT NULL
     AND public.es_admin_del_tenant(public.current_tenant_id());
$$;
REVOKE ALL ON FUNCTION public.datos_pago_plataforma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.datos_pago_plataforma() TO authenticated, service_role;
COMMENT ON FUNCTION public.datos_pago_plataforma() IS
  'Datos para pagarle a VIM, solo para dueño/admin del negocio del JWT (0141). Devuelve cero filas si no está configurado.';
