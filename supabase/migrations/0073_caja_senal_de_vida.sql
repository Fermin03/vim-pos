-- ============================================================================
-- 0073 — La caja deja señal de vida al sincronizar.
--
-- El panel pintaba TODAS las cajas como "Nunca conectó", incluida la del piloto, que llevaba
-- semanas subiendo ventas sin falta. El semáforo lee `cajas.ultima_conexion`, una columna
-- declarada en la 0003 que ningún código escribe jamás: el rojo no era un diagnóstico, era el
-- valor por defecto. Una alarma que siempre suena es una alarma que se deja de mirar, y el día
-- que una caja se calle de verdad nadie lo va a notar.
--
-- Aquí `sync_push_snapshot` sella `ultima_conexion` y, de paso, llena `dispositivo_descripcion`
-- —que el panel muestra y que la 0070 dejaba en NULL, por eso salía "—" en cada renglón.
--
-- LO QUE ESTO **NO** ARREGLA, y conviene tenerlo escrito:
-- El sello solo ocurre cuando hay ventas que subir. El escritorio ni llama a esta función si no
-- hay nada pendiente, así que una caja encendida en un día flojo seguirá envejeciendo en el
-- panel. El latido honesto es el PULL, que corre cada 10 minutos pase lo que pase — pero
-- `sync_pull_snapshot` solo recibe el tenant y no sabe QUÉ caja pregunta, y darle esa
-- información obliga a redesplegar la Edge Function. Mientras tanto, el panel completa el hueco
-- con las señales que sí existen (última venta, último evento de sync).
--
-- Migración ADITIVA: reemplaza el cuerpo sin tocar firma ni permisos. El sello va en su propio
-- bloque protegido — las ventas ya se aplicaron y nada de esto debe tumbar un push.
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
  v_desc     text;
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

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c
      LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
     WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id, dispositivo_descripcion,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'), v_desc,
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

  -- ── Señal de vida de la caja ──────────────────────────────────────────────
  -- En su PROPIO bloque: si el registro del evento falla, el sello debe darse igual. Son dos
  -- datos independientes y perder los dos por un solo error sería peor.
  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  RETURN v_res;
END;
$$;
