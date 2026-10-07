-- 0159 · Lealtad: lo que el admin, el panel y la salida necesitan de la base (ADR 0030, plan 1C).
--
--   §1  Un premio revertido DESPUÉS de cobrar sigue sin admitir factura individual.
--   §2  El add-on LEALTAD se enciende en el catálogo; el cambio de plan lo concede y lo retira; los
--       negocios que ya están en un plan que la incluye reciben el permiso.
--   §3  Los reportes del admin aprenden tickets.lealtad_mxn.            (Tarea 2)
--   §4  La lista de clientes trae el saldo.                             (Tarea 2)
--   §5  Lecturas de la sección /lealtad: libro, cifras y vista de control. (Tarea 2)
--
-- Corre también en el Postgres de cada caja al arrancar: solo redefine funciones y vistas de lectura,
-- enciende una fila de catálogo y rellena una tabla que en la caja está vacía.

-- ── §1 El premio revertido tras el pago ──────────────────────────────────────
-- Hasta aquí ticket_lleva_premio (0158) contaba solo los canjes NOT revertido. Pero la conciliación
-- de la nube (_vim_conciliar_canjes, 0156) puede marcar `revertido` el premio de una cuenta YA
-- cobrada, y los totales de una cuenta cerrada no se recalculan: el renglón se queda en $0 con su
-- descuento puesto. Esa cuenta volvería a admitir factura individual con un concepto en cero, que es
-- justo lo que el candado existe para impedir.
--
-- Se decide por el ESTADO DEL RENGLÓN, no por fechas: un canje revertido cuyo renglón sigue vivo, en
-- $0 y con descuento, sigue siendo un premio. Cuando el canje se quita de una cuenta abierta el
-- recálculo devuelve el renglón a su precio y deja de contar (smoke_lealtad_factura.sql, pasos 5 y 6).
CREATE OR REPLACE FUNCTION ticket_lleva_premio(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ticket_canjes_lealtad c
     WHERE c.ticket_id = p_ticket_id AND c.ticket_item_id IS NOT NULL
       AND (NOT c.revertido
            OR EXISTS (SELECT 1 FROM ticket_items i
                        WHERE i.id = c.ticket_item_id AND NOT i.cancelado
                          AND i.total_item_mxn = 0 AND i.promocion_item_mxn > 0)));
$$;
COMMENT ON FUNCTION ticket_lleva_premio(uuid) IS
  'TRUE si la cuenta lleva un premio de producto de lealtad: un canje vivo, o uno revertido cuyo renglón sigue en $0 (cuenta ya cobrada). Esas cuentas no admiten factura individual (0158, 0159).';

-- ── §2 El add-on, el cambio de plan y el relleno ─────────────────────────────
-- Nació inactivo (0156) porque el panel de VIM lista todo add-on activo con un botón de activar y
-- todavía no había pantallas detrás. Ya las hay.
UPDATE addons SET activo = true, updated_at = now() WHERE codigo = 'LEALTAD' AND NOT activo;

-- El cambio de plan también concede y retira la lealtad. Cuerpo copiado ÍNTEGRO de
-- 0141_cobro_promocion_prueba_plan.sql:277-353 (única definición vigente); el único cambio es que la
-- lista de add-ons gana ('LEALTAD', 'lealtad_incluido'), la bandera que la 0156 ya dejó en los planes.
-- Retirarla dispara trg_tenant_addons_apaga_lealtad (0156), que apaga el interruptor del dueño.
-- Su espejo en TS es ADDONS_DEL_PLAN (apps/platform/app/lib/cambio-plan.ts): si cambias uno, cambia el otro.
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

  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido')) AS x(codigo, bandera) LOOP
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


-- Los negocios que YA están en un plan que incluye la lealtad no pasarán por un cambio de plan: se
-- les concede aquí, una vez, a $0 e «incluido en el plan». Es solo el permiso: sigue apagada hasta que
-- el dueño configure su programa y la encienda. En la caja `suscripciones` está vacía y no hace nada.
INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
SELECT s.tenant_id, a.id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 0,
       'Incluido en el plan ' || p.nombre, true
  FROM suscripciones s
  JOIN planes p ON p.id = s.plan_id
  CROSS JOIN addons a
 WHERE a.codigo = 'LEALTAD'
   AND s.estado = 'ACTIVA'
   AND COALESCE((p.features_incluidos ->> 'lealtad_incluido')::boolean, false)
   AND NOT EXISTS (SELECT 1 FROM tenant_addons x
                    WHERE x.tenant_id = s.tenant_id AND x.addon_id = a.id AND x.activo)
ON CONFLICT ON CONSTRAINT addon_unico_activo DO NOTHING;
