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
-- 0141_cobro_promocion_prueba_plan.sql:277-353 (única definición vigente). Dos cambios: la lista de
-- add-ons gana ('LEALTAD', 'lealtad_incluido'), la bandera que la 0156 ya dejó en los planes; y cuando
-- se pasa de pagarlo aparte a tenerlo incluido, primero queda activa la fila incluida y DESPUÉS se
-- cierra la pagada (el porqué está junto a ese UPDATE).
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
          -- DIFERENCIA CON 0141: allá la pagada se cerraba ANTES de dejar activa la incluida. Para CFDI
          -- y DELIVERY el orden da igual, pero al cerrar una fila de LEALTAD se dispara
          -- trg_tenant_addons_apaga_lealtad (0156), que si en ese instante no ve ninguna fila vigente
          -- apaga el interruptor del dueño: quien subía de plan perdía su programa encendido. Con la
          -- incluida ya activa el trigger la ve y no apaga nada. Las dos filas no chocan con
          -- addon_unico_activo: a esta rama solo llega una pagada con fecha_inicio distinta de hoy.
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
  'Interna (0141, 0159): concede a $0 los add-ons que el plan incluye (CFDI, DELIVERY, LEALTAD) y, si p_retirar, quita los que se dieron por el plan anterior. Respeta addon_unico_activo reactivando la fila del día.';


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

-- ── §3 Los reportes del admin aprenden lealtad_mxn ───────────────────────────
-- CREATE OR REPLACE VIEW exige las mismas columnas en el mismo orden: la nueva va al final. Y repite
-- WITH (security_invoker = true): sin eso la vista deja de respetar la RLS de tickets (0111, 0044).
-- Cuerpo copiado ÍNTEGRO de 0011_reportes_cierres.sql:723-772; el único cambio es la última columna.
CREATE OR REPLACE VIEW vw_estado_resultados_dia WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,

  -- ===== Tickets =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))    AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')                 AS tickets_cancelados,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('BORRADOR', 'ABIERTO'))    AS tickets_pendientes,

  -- ===== Ingresos brutos =====
  COALESCE(SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS subtotal_neto_mxn,
  COALESCE(SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS iva_neto_mxn,
  COALESCE(SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS total_neto_mxn,

  -- ===== Descuentos y promociones =====
  COALESCE(SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS descuentos_manuales_mxn,
  COALESCE(SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS promociones_mxn,

  -- ===== Propinas =====
  COALESCE(SUM(t.propina_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS propinas_capturadas_mxn,

  -- ===== Devoluciones (subquery) =====
  COALESCE((SELECT SUM(d.total_devuelto_mxn) FROM devoluciones d
            WHERE d.sucursal_id = t.sucursal_id AND d.dia_contable = t.dia_contable
            AND d.estado = 'CONFIRMADA' AND d.deleted_at IS NULL), 0) AS devoluciones_mxn,

  -- ===== Cancelaciones de tickets pagados (subquery) =====
  COALESCE((SELECT SUM(c.ticket_total_snapshot) FROM cancelaciones_ticket c
            WHERE c.sucursal_id = t.sucursal_id AND c.dia_contable = t.dia_contable
            AND c.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')), 0) AS cancelaciones_post_pago_mxn,

  -- ===== Comisiones de apps externas (estimación basada en liquidaciones disponibles) =====
  COALESCE((SELECT SUM(ali.monto_comision_mxn) FROM apps_liquidacion_items ali
            JOIN tickets t2 ON t2.id = ali.ticket_id_match
            WHERE t2.sucursal_id = t.sucursal_id AND t2.dia_contable = t.dia_contable), 0) AS comisiones_apps_mxn,

  -- ===== Tickets por modo de servicio =====
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'PARA_LLEVAR')          AS tickets_para_llevar,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'COMER_AQUI')           AS tickets_comer_aqui,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio = 'DELIVERY_PROPIO')      AS tickets_delivery_propio,
  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO') AND t.modo_servicio::text LIKE 'APP_%')             AS tickets_apps,

  -- ===== Ticket promedio =====
  COALESCE(AVG(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS ticket_promedio_mxn,

  -- ===== 0159: lo descontado por canjes de lealtad (tercer carril, aparte de los dos de arriba) =====
  COALESCE(SUM(t.lealtad_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')), 0) AS lealtad_mxn

FROM tickets t
WHERE t.deleted_at IS NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable;

-- Cuerpo copiado ÍNTEGRO de 0010_verticales.sql:1561-1586; el único cambio es la última columna.
CREATE OR REPLACE VIEW vw_ventas_por_marca WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.marca_virtual_id,
  mv.nombre               AS marca_nombre,
  mv.color_primario_hex            AS marca_color,

  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))  AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')               AS tickets_cancelados,

  SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS subtotal_neto_mxn,
  SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS iva_neto_mxn,
  SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS total_neto_mxn,
  SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS descuentos_manuales_mxn,
  SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS promociones_mxn,

  AVG(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS ticket_promedio_mxn,

  SUM(t.lealtad_mxn)  FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS lealtad_mxn

FROM tickets t
JOIN marcas_virtuales mv ON mv.id = t.marca_virtual_id
WHERE t.deleted_at IS NULL
  AND t.marca_virtual_id IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         t.marca_virtual_id, mv.nombre, mv.color_primario_hex;

-- ── §4 La lista de clientes trae el saldo ────────────────────────────────────
-- Cuerpo copiado ÍNTEGRO de 0118_clientes_lista_paginada.sql:26-55; se añaden dos columnas al final y
-- el LEFT JOIN de donde salen. Un saldo de otra versión del programa ya no vale: se muestra 0.
-- vw_clientes_kpis (0118) lee de esta vista por nombre de columna y no se entera.
CREATE OR REPLACE VIEW vw_clientes_lista WITH (security_invoker = on) AS
SELECT
  c.id,
  c.tenant_id,
  c.nombre,
  c.apellido_paterno,
  c.telefono,
  c.email,
  c.rfc,
  c.razon_social,
  c.codigo_postal_fiscal,
  c.tipo_fiscal,
  c.notas_internas,
  c.estado,
  c.created_at,
  COALESCE(r.compras, 0)          AS compras,
  COALESCE(r.gasto_total_mxn, 0)  AS gasto_total_mxn,
  r.ultima_visita,
  COALESCE(ls.saldo, 0)           AS lealtad_saldo,
  ls.vence_el                     AS lealtad_vence_el
FROM clientes c
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int          AS compras,
         SUM(t.total_mxn)       AS gasto_total_mxn,
         MAX(t.fecha_pago)      AS ultima_visita
    FROM tickets t
   WHERE t.cliente_id = c.id
     AND t.tenant_id  = c.tenant_id
     AND t.deleted_at IS NULL
     AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
) r ON true
LEFT JOIN LATERAL (
  SELECT s.saldo, s.vence_el
    FROM lealtad_saldos s
    JOIN lealtad_programa p ON p.tenant_id = s.tenant_id AND p.version = s.programa_version
   WHERE s.cliente_id = c.id
) ls ON true
WHERE c.deleted_at IS NULL;

-- ── §5 Lecturas de la sección /lealtad del admin ─────────────────────────────
-- El libro con nombres. security_invoker: cada quien ve lo que su RLS le deja (los movimientos de su
-- negocio). sucursal_id, usuario_id y ticket_id no tienen llave foránea a propósito (0156), así que
-- todos van con LEFT JOIN: un movimiento cuyo ticket aún no llega se ve igual, sin folio.
CREATE OR REPLACE VIEW vw_lealtad_movimientos WITH (security_invoker = true) AS
SELECT
  m.id, m.tenant_id, m.fecha, m.tipo, m.puntos, m.saldo_visto, m.motivo, m.monto_mxn, m.programa_version,
  m.cliente_id,
  btrim(concat_ws(' ', c.nombre, c.apellido_paterno))  AS cliente_nombre,
  c.telefono                                           AS cliente_telefono,
  m.sucursal_id,
  s.nombre                                             AS sucursal_nombre,
  m.usuario_id,
  btrim(concat_ws(' ', u.nombre, u.apellido_paterno))  AS usuario_nombre,
  m.ticket_id,
  t.folio_completo                                     AS ticket_folio
FROM lealtad_movimientos m
JOIN clientes c ON c.id = m.cliente_id
LEFT JOIN sucursales s      ON s.id = m.sucursal_id
LEFT JOIN usuarios_perfil u ON u.id = m.usuario_id
LEFT JOIN tickets t         ON t.id = m.ticket_id;
GRANT SELECT ON vw_lealtad_movimientos TO authenticated, service_role;
COMMENT ON VIEW vw_lealtad_movimientos IS 'El libro de la lealtad con nombres, para la sección /lealtad del admin (0159).';

-- Las cuatro cifras de la pestaña Movimientos. SECURITY INVOKER: suma lo que la RLS deja ver.
-- «Emitido» y «canjeado» son del rango y de la sucursal elegida; el saldo vivo y los clientes con
-- saldo son del negocio entero y de HOY (un saldo no pertenece a una sucursal ni a un rango).
-- Solo cuenta el programa vigente: lo de una mecánica anterior no se suma con la actual.
CREATE OR REPLACE FUNCTION lealtad_resumen(p_desde date, p_hasta date, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH prog AS (SELECT version FROM lealtad_programa WHERE tenant_id = current_tenant_id()),
  mov AS (
    SELECT m.tipo, m.puntos
      FROM lealtad_movimientos m, prog
     WHERE m.tenant_id = current_tenant_id()
       AND m.programa_version = prog.version
       AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
       AND (p_sucursal IS NULL OR m.sucursal_id = p_sucursal)),
  sal AS (
    SELECT s.saldo
      FROM lealtad_saldos s, prog
     WHERE s.tenant_id = current_tenant_id() AND s.programa_version = prog.version AND s.saldo > 0)
  SELECT jsonb_build_object(
    'emitido',            COALESCE((SELECT SUM(puntos) FROM mov WHERE tipo IN ('GANADO', 'REVERSA_GANADO')), 0),
    'canjeado',           COALESCE((SELECT -SUM(puntos) FROM mov WHERE tipo IN ('CANJE', 'REVERSA_CANJE')), 0),
    'saldo_vivo',         COALESCE((SELECT SUM(saldo) FROM sal), 0),
    'clientes_con_saldo', (SELECT COUNT(*) FROM sal));
$$;
REVOKE ALL ON FUNCTION lealtad_resumen(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_resumen(date, date, uuid) TO authenticated, service_role;

-- La vista de control (spec §7): dos señales de posible abuso, no acusaciones.
--   · clientes que llegaron al tope diario de compras 2 días o más dentro del rango;
--   · cajeros con 3 canjes o más, ordenados por qué tanto se concentran en un solo cliente.
-- Como mucho 20 de cada una.
CREATE OR REPLACE FUNCTION lealtad_control(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH prog AS (SELECT version, tope_compras_dia FROM lealtad_programa WHERE tenant_id = current_tenant_id()),
  mov AS (
    SELECT m.*, (m.fecha AT TIME ZONE 'America/Mexico_City')::date AS dia
      FROM lealtad_movimientos m, prog
     WHERE m.tenant_id = current_tenant_id() AND m.programa_version = prog.version
       AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta),
  dias AS (
    SELECT cliente_id, dia, COUNT(DISTINCT ticket_id) AS compras
      FROM mov WHERE tipo = 'GANADO' GROUP BY cliente_id, dia),
  tope AS (
    SELECT d.cliente_id, COUNT(*) AS dias_al_tope
      FROM dias d, prog WHERE d.compras >= prog.tope_compras_dia
     GROUP BY d.cliente_id HAVING COUNT(*) >= 2),
  par AS (
    SELECT usuario_id, cliente_id, COUNT(*) AS n, -SUM(puntos) AS pts
      FROM mov WHERE tipo = 'CANJE' AND usuario_id IS NOT NULL GROUP BY usuario_id, cliente_id),
  caj AS (
    SELECT usuario_id, SUM(n)::int AS canjes, COUNT(*)::int AS clientes, SUM(pts)::int AS puntos, MAX(n)::int AS del_cliente_top
      FROM par GROUP BY usuario_id HAVING SUM(n) >= 3)
  SELECT jsonb_build_object(
    'clientes_al_tope', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'dias_al_tope')::int DESC, x->>'cliente_nombre', x->>'cliente_id')
        FROM (SELECT jsonb_build_object(
                'cliente_id', t.cliente_id,
                'cliente_nombre', btrim(concat_ws(' ', c.nombre, c.apellido_paterno)),
                'dias_al_tope', t.dias_al_tope) AS x
                FROM tope t JOIN clientes c ON c.id = t.cliente_id
               ORDER BY t.dias_al_tope DESC, t.cliente_id LIMIT 20) q), '[]'::jsonb),
    'cajeros', COALESCE((
      SELECT jsonb_agg(x ORDER BY ((x->>'del_cliente_top')::numeric / (x->>'canjes')::numeric) DESC, (x->>'canjes')::int DESC, x->>'usuario_id')
        FROM (SELECT jsonb_build_object(
                'usuario_id', k.usuario_id,
                'usuario_nombre', btrim(concat_ws(' ', u.nombre, u.apellido_paterno)),
                'canjes', k.canjes, 'clientes', k.clientes, 'puntos', k.puntos, 'del_cliente_top', k.del_cliente_top) AS x
                FROM caj k LEFT JOIN usuarios_perfil u ON u.id = k.usuario_id
               ORDER BY (k.del_cliente_top::numeric / k.canjes) DESC, k.canjes DESC, k.usuario_id LIMIT 20) q), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION lealtad_control(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lealtad_control(date, date) TO authenticated, service_role;
