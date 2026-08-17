-- ============================================================================
-- 0070 — `sync_push_snapshot` deja rastro de cada envío en `sync_eventos`.
--
-- Hoy no hay forma directa de saber si la caja de un cliente está sincronizando:
-- `cajas.ultima_conexion` está declarada desde la migración 0003 y ningún código la escribe, y
-- `sync_eventos` —que sí tiene las columnas adecuadas— no la llenaba nadie. El panel de
-- plataforma tenía que inferir la vida del cliente por la fecha del último ticket, y eso
-- confunde dos problemas muy distintos: un negocio CERRADO (no vende) y una caja MUDA (vende
-- pero no sube). El segundo es urgente aunque no haya ventas: significa que el respaldo en la
-- nube dejó de existir sin que nadie se entere.
--
-- Va aquí y no en la Edge Function `sync-push` a propósito: una migración se aplica con
-- `supabase db push` y viaja sola al instalador de la caja, mientras que redeplegar la función
-- exige el access token del CLI —que en la laptop de trabajo no funciona— y deja los dos lados
-- desincronizados mientras tanto. Además esto registra el resultado REAL de la escritura, no
-- lo que la función creía haber mandado.
--
-- El identificador del dispositivo (NOT NULL en la tabla) se deduce del snapshot: los turnos y
-- tickets traen `caja_id`, y `cajas.identificador_dispositivo` lo resuelve. Si no se puede, se
-- guarda 'escritorio' antes que perder el registro entero.
--
-- Migración ADITIVA: reemplaza el cuerpo de la función sin tocar su firma ni sus permisos, así
-- que la Edge Function la sigue llamando igual. El registro es best-effort — si algo fallara al
-- anotar el evento, NO debe tumbar un push de ventas que ya se aplicó.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla    text;
  v_res      jsonb := '{}'::jsonb;
  v_ini      timestamptz := clock_timestamp();
  v_total    integer := 0;
  v_aplicadas integer := 0;
  v_caja     uuid;
  v_sucursal uuid;
  v_disp     text;
  v_min      timestamptz;
  v_max      timestamptz;
BEGIN
  -- Modo réplica: no dispara triggers (folio/totales/cerrar_ticket_si_pagado). Requiere el
  -- privilegio de superusuario del dueño de la función (definer), no del service_role llamante.
  SET LOCAL session_replication_role = replica;
  FOREACH v_tabla IN ARRAY ARRAY['turnos','tickets','ticket_items','ticket_item_modificadores','pagos','movimientos_caja'] LOOP
    v_res := v_res || jsonb_build_object(v_tabla, _vim_apply_rows(v_tabla, p_snapshot->v_tabla, p_tenant));
  END LOOP;

  -- ── Rastro del envío ──────────────────────────────────────────────────────
  BEGIN
    -- Enviadas vs aplicadas: si difieren, algo se quedó fuera y hay que mirarlo.
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v)
     WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    -- Contexto del batch, tomado de los tickets (o de los turnos si no vinieron tickets).
    -- La ventana temporal se agrega; la caja y la sucursal se toman de la primera fila, NO con
    -- MAX(): Postgres no tiene agregado max() para uuid y el bloque entero se caía en silencio.
    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t
     LIMIT 1;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio')
      INTO v_disp FROM public.cajas c WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'),
      v_total, v_aplicadas, GREATEST(v_total - v_aplicadas, 0),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'), v_res
    );
  EXCEPTION WHEN OTHERS THEN
    -- Las ventas YA se aplicaron. Perder la bitácora es molesto; perder el push, grave.
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  RETURN v_res;
END;
$$;
