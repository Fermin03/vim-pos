-- ============================================================================
-- 0089 — El corte de caja también sube a la nube.
--
-- EL HUECO, Y CÓMO SE ENCONTRÓ
--
-- El dueño abrió «Reportes → Cortes Z históricos» en el panel y estaba vacío.
-- No era la pantalla: en producción había CATORCE turnos cerrados y UN SOLO
-- corte. Los otros trece no existían en la nube.
--
-- La causa está en la 0056: `sync_push_snapshot` recorre una lista fija de
-- tablas, y esa lista tiene seis:
--
--     turnos · tickets · ticket_items · ticket_item_modificadores
--     pagos  · movimientos_caja
--
-- El corte de caja se genera en la CAJA —el POS de escritorio corre sus RPCs
-- contra su propio Postgres local— y se queda ahí para siempre. Se imprime, el
-- cajero lo firma, y de la nube nadie se entera. El reporte del panel no podía
-- llenarse nunca: el dato no llegaba.
--
-- Es el peor tipo de hueco porque NADA falla. No hay error, no hay reintento en
-- rojo, no hay fila rechazada: la tabla simplemente no se mira. El corte se ve
-- perfecto en el papel que sale de la impresora.
--
-- EL MISMO HUECO, SEGUNDA VEZ
--
-- Buscando esto salió otro: la caja YA recolecta `delivery_asignaciones` (quién
-- repartió cada domicilio) y lo manda en el snapshot desde la 0078. La nube lo
-- descartaba en silencio, porque tampoco estaba en la lista. Cero filas en
-- producción. Sube ahora junto con lo demás.
--
-- POR QUÉ LA LISTA SIGUE SIENDO EXPLÍCITA
--
-- Tentador: recorrer todas las tablas con `tenant_id` y acabar con el problema.
-- Sería peor. Esta función corre en modo réplica —sin triggers, sin FK— y
-- fuerza `tenant_id`; lo que entre aquí se escribe VERBATIM en producción. Una
-- lista explícita es la frontera de lo que un dispositivo puede replicar, y
-- ampliarla debe costar una migración que alguien lea. El precio es este
-- olvido; la alternativa es que un device pueda escribir en cualquier tabla.
--
-- Lo que sí se arregla es el silencio: ahora el resultado incluye qué tablas
-- venían en el snapshot y NO se aplicaron, para que el próximo hueco de este
-- tipo aparezca en el log del sync en vez de en un reporte vacío meses después.
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
  v_ignoradas text[] := ARRAY[]::text[];
  /* Orden por dependencia. En modo réplica las FK no se comprueban, así que no
     es obligatorio — pero el día que alguien quite el modo réplica para depurar,
     este orden es la diferencia entre que funcione y una cascada de errores.

     `cortes_caja_detalle` va después de `cortes_caja` (cuelga de él), y
     `delivery_asignaciones` después de `tickets`. */
  v_tablas   text[] := ARRAY[
    'turnos',
    'tickets',
    'ticket_items',
    'ticket_item_modificadores',
    'pagos',
    'movimientos_caja',
    'delivery_asignaciones',
    'cortes_parciales',        -- corte X: arqueos intermedios del turno
    'cortes_caja',             -- el corte del cierre
    'cortes_caja_detalle',     -- su desglose por método de pago
    'reportes_z_historico'     -- el Z que alimenta «Cortes Z históricos» del panel
  ];
BEGIN
  -- Modo réplica: no dispara triggers (folio/totales/cerrar_ticket_si_pagado). Requiere el
  -- privilegio de superusuario del dueño de la función (definer), no del service_role llamante.
  --
  -- Vale también para el corte: `folio_z` lo asigna un trigger al insertar, y aquí NO debe
  -- reasignarse. El folio que vale es el que la caja ya imprimió y el cajero firmó.
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_res := v_res || jsonb_build_object(v_tabla, _vim_apply_rows(v_tabla, p_snapshot->v_tabla, p_tenant));
  END LOOP;

  /* Lo que el device mandó y aquí no se conoce. Sin esto, una tabla nueva en el
     snapshot se descarta sin dejar rastro — que es exactamente como se perdieron
     trece cortes y todas las asignaciones de reparto. */
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas));

  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION sync_push_snapshot(uuid, jsonb) IS
  'Replica verbatim (modo réplica, sin triggers) la rebanada operativa del device a la nube, conservando folios/totales/estado. Incluye cortes de caja y reporte Z desde la 0089. Devuelve `_ignoradas` con las tablas del snapshot que no están en la lista. Solo service_role.';

REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
