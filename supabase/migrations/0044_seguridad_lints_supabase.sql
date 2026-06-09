-- 0044 — Resolver lints de seguridad de Supabase (database linter) antes de meter datos reales.
-- Tres frentes:
--   A) auth_users_exposed (ERROR): 6 vistas exponían auth.users.email (PII) a anon/authenticated.
--      → se reescriben para usar usuarios_perfil.nombre (mismo nombre de columna = no rompe la app).
--   B) security_definer_view (ERROR): vistas con SECURITY DEFINER saltaban el RLS del que consulta
--      (fuga entre tenants). → security_invoker=on en TODAS las vistas de public (respetan RLS).
--   C) function_search_path_mutable (WARN): funciones sin search_path fijo (riesgo de hijack).
--      → search_path = public, extensions, pg_temp en todas las funciones de public.
--      Se EXCLUYE custom_access_token_hook (cambiarle el search_path podría tumbar el login).

-- ───────────────────────────── A) Vistas sin auth.users ─────────────────────────────
-- Reemplazan `LEFT JOIN auth.users u ... u.email` por `usuarios_perfil up ... up.nombre`.
-- nombre y email son ambos character varying → CREATE OR REPLACE no cambia el tipo de columna.

CREATE OR REPLACE VIEW public.vw_ventas_por_mesero AS
  SELECT t.tenant_id, t.sucursal_id, t.dia_contable, t.mesero_id,
     up.nombre::varchar(255) AS mesero_email,
     count(*) AS tickets_atendidos,
     sum(t.total_mxn) AS total_vendido_mxn,
     sum(t.propina_mxn) AS propinas_capturadas_mxn,
     avg(t.total_mxn) AS ticket_promedio_mxn,
     avg(t.propina_mxn / NULLIF(t.total_mxn, 0::numeric) * 100::numeric) AS propina_pct_promedio
    FROM tickets t
      LEFT JOIN usuarios_perfil up ON up.id = t.mesero_id
   WHERE t.deleted_at IS NULL
     AND (t.estado_fiscal = ANY (ARRAY['PAGADO'::ticket_estado_fiscal, 'FACTURADO'::ticket_estado_fiscal]))
     AND t.mesero_id IS NOT NULL
   GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, t.mesero_id, up.nombre;

CREATE OR REPLACE VIEW public.vw_descuentos_por_usuario AS
  SELECT d.tenant_id, t.sucursal_id, t.dia_contable,
     d.usuario_solicitante_id AS usuario_id,
     up.nombre::varchar(255) AS usuario_email,
     count(*) AS cantidad_descuentos,
     sum(d.monto_descontado_mxn) AS total_descontado_mxn,
     avg(d.monto_descontado_mxn) AS descuento_promedio_mxn,
     count(*) FILTER (WHERE d.motivo_categoria = 'CORTESIA_INVITADO'::descuento_manual_motivo) AS cortesia_count,
     count(*) FILTER (WHERE d.motivo_categoria = 'PRODUCTO_DEFECTO_LEVE'::descuento_manual_motivo) AS defecto_count,
     count(*) FILTER (WHERE d.motivo_categoria = 'CLIENTE_FRECUENTE'::descuento_manual_motivo) AS vip_count,
     count(*) FILTER (WHERE d.motivo_categoria = 'INCONVENIENCIA_OPERATIVA'::descuento_manual_motivo) AS ajuste_count,
     count(*) FILTER (WHERE d.motivo_categoria = 'OTRO'::descuento_manual_motivo) AS otro_count
    FROM ticket_descuentos_manuales d
      JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN usuarios_perfil up ON up.id = d.usuario_solicitante_id
   WHERE d.reversado = false
   GROUP BY d.tenant_id, t.sucursal_id, t.dia_contable, d.usuario_solicitante_id, up.nombre;

CREATE OR REPLACE VIEW public.vw_reimpresiones_por_cajero AS
  SELECT ci.tenant_id, ci.sucursal_id,
     date_trunc('day'::text, ci.fecha_impresion)::date AS dia,
     ci.usuario_id AS cajero_id,
     up.nombre::varchar(255) AS cajero_email,
     count(*) AS reimpresiones_count,
     count(DISTINCT ci.ticket_id) AS tickets_distintos
    FROM comanda_impresiones ci
      LEFT JOIN usuarios_perfil up ON up.id = ci.usuario_id
   WHERE ci.evento_tipo = 'REIMPRESION_CAJERO'::comanda_evento_tipo
     AND ci.resultado = 'OK'::comanda_resultado
   GROUP BY ci.tenant_id, ci.sucursal_id, (date_trunc('day'::text, ci.fecha_impresion)), ci.usuario_id, up.nombre;

CREATE OR REPLACE VIEW public.vw_mesas_estado_actual AS
  SELECT m.id AS mesa_id, m.tenant_id, m.sucursal_id, m.numero AS mesa_numero, m.capacidad, m.seccion_id,
     s.nombre AS seccion_nombre, m.estado AS mesa_estado, m.posicion_x, m.posicion_y, m.forma,
     tm.ticket_id AS ticket_activo_id, t.folio_completo AS ticket_folio, t.fecha_apertura AS ticket_fecha_apertura,
     t.fecha_primer_item AS ticket_fecha_primer_item, t.total_mxn AS ticket_total_mxn, t.mesero_id AS ticket_mesero_id,
     up_mesero.nombre::varchar(255) AS mesero_email,
     CASE WHEN t.fecha_apertura IS NOT NULL
          THEN EXTRACT(epoch FROM now() - t.fecha_apertura)::integer / 60
          ELSE NULL::integer END AS minutos_ocupada,
     m.reservacion_actual_id
    FROM mesas m
      LEFT JOIN secciones s ON s.id = m.seccion_id
      LEFT JOIN tickets_mesas tm ON tm.mesa_id = m.id AND tm.fecha_liberacion IS NULL
      LEFT JOIN tickets t ON t.id = tm.ticket_id
        AND (t.estado_fiscal = ANY (ARRAY['BORRADOR'::ticket_estado_fiscal, 'ABIERTO'::ticket_estado_fiscal]))
      LEFT JOIN usuarios_perfil up_mesero ON up_mesero.id = t.mesero_id
   WHERE m.deleted_at IS NULL AND m.activa = true;

CREATE OR REPLACE VIEW public.vw_resumen_corte_caja AS
  SELECT c.id AS corte_id, c.tenant_id, c.sucursal_id, c.caja_id, c.turno_id, c.motivo AS motivo_corte, c.fecha_corte,
     c.total_esperado_mxn, c.total_declarado_mxn, c.diferencia_mxn AS diferencia_total_mxn,
     COALESCE(( SELECT jsonb_agg(jsonb_build_object('metodo_pago', d.metodo_pago, 'esperado_mxn', d.monto_esperado_mxn,
                  'declarado_mxn', d.monto_declarado_mxn, 'diferencia_mxn', d.diferencia_mxn,
                  'transacciones', d.cantidad_transacciones) ORDER BY d.metodo_pago)
            FROM cortes_caja_detalle d WHERE d.corte_caja_id = c.id), '[]'::jsonb) AS desglose_metodos,
     c.usuario_id AS cajero_id,
     up.nombre::varchar(255) AS cajero_email
    FROM cortes_caja c
      LEFT JOIN usuarios_perfil up ON up.id = c.usuario_id;

CREATE OR REPLACE VIEW public.vw_cumplimiento_tiempos_delivery AS
  SELECT da.id AS delivery_id, da.tenant_id, da.sucursal_id, t.dia_contable, da.ticket_id, t.folio_completo, da.repartidor_id,
     up.nombre::varchar(255) AS repartidor_email,
     da.tiempo_promesa_minutos, da.tiempo_real_minutos,
     CASE WHEN da.tiempo_promesa_minutos IS NULL THEN NULL::text
          WHEN da.tiempo_real_minutos IS NULL THEN NULL::text
          WHEN da.tiempo_real_minutos <= da.tiempo_promesa_minutos THEN 'CUMPLIDO'::text
          WHEN da.tiempo_real_minutos::numeric <= (da.tiempo_promesa_minutos::numeric * 1.2) THEN 'TARDE_LIGERO'::text
          ELSE 'TARDE_GRAVE'::text END AS cumplimiento_promesa,
     da.estado AS delivery_estado_final, da.diferencia_mxn AS diferencia_liquidacion_mxn
    FROM delivery_asignaciones da
      JOIN tickets t ON t.id = da.ticket_id
      LEFT JOIN usuarios_perfil up ON up.id = da.repartidor_id
   WHERE (da.estado = ANY (ARRAY['ENTREGADO'::delivery_estado, 'NO_ENTREGADO'::delivery_estado, 'LIQUIDADO'::delivery_estado]))
     AND t.deleted_at IS NULL;

-- ──────────────────── B) security_invoker en TODAS las vistas de public ────────────────────
-- Hace que cada vista respete el RLS del usuario que consulta (no el del creador). Cierra la fuga.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', r.viewname);
  END LOOP;
END $$;

-- ──────────────────── C) search_path fijo en todas las funciones de public ────────────────────
-- Evita el secuestro de search_path. Incluye `extensions` (p.ej. unaccent) y pg_temp.
-- Excluye el auth hook: cambiarle el search_path es riesgoso para el login.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'custom_access_token_hook'
      -- excluir funciones que pertenecen a una extensión (pg_trgm, unaccent, etc.): no se pueden ALTER
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'search_path no aplicado a % (%)', r.sig, SQLERRM;
    END;
  END LOOP;
END $$;
