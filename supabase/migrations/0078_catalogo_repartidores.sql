-- ============================================================================
-- 0078 — Catálogo de repartidores.
--
-- Los repartidores se dan de alta UNA vez en el panel y luego se eligen de una lista al despachar
-- un pedido. Antes se escribía el nombre en cada salida, lo que además de lento hacía que el mismo
-- "Luis" acabara escrito de varias maneras y dejara de poder cuadrarse.
--
-- POR QUÉ UNA TABLA PROPIA Y NO USUARIOS DEL SISTEMA
--
-- La 0077 razonó lo contrario —evitar un catálogo aparte para no duplicar concepto cuando lleguen
-- las cuentas de verdad— pero eso asumía que el repartidor terminaría siendo un usuario. No lo es
-- hoy: no entra al sistema, no tiene PIN y NO debe aparecer en la pantalla donde se elige quién
-- opera la caja. `usuarios_perfil` cuelga de `auth.users`, así que meterlos ahí obligaba a crear
-- cuentas y los ponía justo en esa lista.
--
-- Cuando exista la app del repartidor, ese usuario se enlaza con su fila del catálogo; no hay que
-- rehacer nada.
--
-- La asignación guarda el id del catálogo Y el nombre. El nombre es una foto del momento: si
-- mañana se corrige la ortografía o alguien se va, los pedidos viejos siguen diciendo quién los
-- llevó.
-- ============================================================================

CREATE TABLE IF NOT EXISTS repartidores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre      varchar(100) NOT NULL,
  telefono    varchar(20) NULL,
  notas       text NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

-- Dos "Luis" en el mismo negocio hacen imposible saber a quién cuadrarle. Se comparan sin
-- distinguir mayúsculas ni espacios de sobra, que es como se escriben de verdad al capturar.
CREATE UNIQUE INDEX IF NOT EXISTS repartidor_nombre_uq
  ON repartidores (tenant_id, lower(btrim(nombre)))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_repartidores_tenant ON repartidores (tenant_id) WHERE deleted_at IS NULL;

ALTER TABLE repartidores ENABLE ROW LEVEL SECURITY;

-- Explícito y no por default privileges (0065): esos solo aplican si la tabla la crea el mismo rol
-- que los definió, y una tabla sin privilegio falla con "permission denied" antes de llegar al RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON repartidores TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY repartidores_select ON repartidores
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY repartidores_insert ON repartidores
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY repartidores_update ON repartidores
    FOR UPDATE USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enlace de la asignación con el catálogo. Opcional: las asignaciones que ya existan por nombre
-- suelto siguen siendo válidas, y un pedido puede salir sin repartidor anotado.
ALTER TABLE delivery_asignaciones
  ADD COLUMN IF NOT EXISTS repartidor_catalogo_id uuid NULL REFERENCES repartidores(id);

CREATE INDEX IF NOT EXISTS idx_delivery_repartidor_catalogo
  ON delivery_asignaciones (repartidor_catalogo_id) WHERE repartidor_catalogo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Asignar eligiendo del catálogo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION asignar_delivery_repartidor(
  p_ticket_id              uuid,
  p_repartidor_id          uuid,
  p_monto_a_liquidar_mxn   numeric,
  p_tiempo_promesa_minutos integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_ticket        tickets%ROWTYPE;
  v_nombre        varchar(100);
  v_existente     uuid;
  v_asignacion_id uuid;
BEGIN
  SELECT nombre INTO v_nombre
    FROM repartidores
   WHERE id = p_repartidor_id AND tenant_id = v_tenant_id AND deleted_at IS NULL AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no encontrado o dado de baja';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket.modo_servicio <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'Solo los pedidos a domicilio se asignan a un repartidor (este es %)', v_ticket.modo_servicio;
  END IF;

  -- Idempotente: si el pedido ya tiene asignación viva se reasigna, no se duplica. Dos
  -- asignaciones del mismo pedido contarían el dinero dos veces al liquidar.
  SELECT id INTO v_existente
    FROM delivery_asignaciones
   WHERE ticket_id = p_ticket_id AND estado NOT IN ('LIQUIDADO', 'CANCELADO')
   ORDER BY fecha_asignacion DESC LIMIT 1;

  IF v_existente IS NOT NULL THEN
    UPDATE delivery_asignaciones
       SET repartidor_catalogo_id = p_repartidor_id,
           repartidor_nombre      = v_nombre,
           monto_a_liquidar_mxn   = p_monto_a_liquidar_mxn,
           tiempo_promesa_minutos = COALESCE(p_tiempo_promesa_minutos, tiempo_promesa_minutos)
     WHERE id = v_existente;
    RETURN v_existente;
  END IF;

  INSERT INTO delivery_asignaciones (
    tenant_id, sucursal_id, ticket_id, repartidor_catalogo_id, repartidor_nombre,
    monto_a_liquidar_mxn, tiempo_promesa_minutos, estado
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id, p_repartidor_id, v_nombre,
    p_monto_a_liquidar_mxn, p_tiempo_promesa_minutos, 'ASIGNADO'
  )
  RETURNING id INTO v_asignacion_id;

  RETURN v_asignacion_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION asignar_delivery_repartidor(uuid, uuid, numeric, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION asignar_delivery_repartidor(uuid, uuid, numeric, integer) TO authenticated, service_role;

COMMENT ON FUNCTION asignar_delivery_repartidor IS
  'Asigna un domicilio a un repartidor del catálogo. Guarda el nombre como foto del momento. Idempotente por ticket.';

-- ---------------------------------------------------------------------------
-- Sincronización con la caja.
--
-- El catálogo se administra en la nube pero se USA en la caja, que trabaja contra su Postgres
-- local: si no baja en la rebanada del pull, el cajero abre el modal y no ve a nadie.
--
-- Y la asignación SUBE. Hasta hoy `delivery_asignaciones` no estaba en el push: lo que la caja
-- anotaba se quedaba en la caja y el panel nunca se enteraba de quién repartió. Va después de
-- `tickets` porque cuelga de ellos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Repartidores: se dan de alta en el panel y se eligen en la caja al marcar una salida.
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Roles del tenant + los de sistema (tenant_id NULL): sin estos, los empleados llegan con un
    -- rol_id que no resuelve y el POS no los lista.
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x
                                        WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x
                                        WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x
                                        WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- El push, con `delivery_asignaciones` añadida al final de la lista (cuelga de `tickets`, así que
-- va después). Se copia el cuerpo de la 0074 porque CREATE OR REPLACE exige la función entera; el
-- único cambio es esa tabla.

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
  v_det      jsonb;
  v_errores  jsonb := '[]'::jsonb;
  v_min      timestamptz;
  v_max      timestamptz;
BEGIN
  -- Modo réplica: no dispara triggers (folio/totales/cerrar_ticket_si_pagado). Requiere el
  -- privilegio de superusuario del dueño de la función (definer), no del service_role llamante.
  SET LOCAL session_replication_role = replica;
  FOREACH v_tabla IN ARRAY ARRAY['turnos','tickets','ticket_items','ticket_item_modificadores','pagos','movimientos_caja','delivery_asignaciones'] LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
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
      v_total, v_aplicadas, jsonb_array_length(v_errores),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'),
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
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

  -- Los errores viajan de vuelta al device: sin esto, la caja daría por subido lo que se quedó
  -- en el camino y esas ventas no se reintentarían nunca.
  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                       THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;

-- ---------------------------------------------------------------------------
-- El reporte de tiempos nombraba al repartidor uniendo con `usuarios_perfil` por `repartidor_id`.
-- Con el catálogo ese campo va vacío —los repartidores no son usuarios— así que la columna salía
-- en blanco justo en el reporte que existe para mirarlos. Ahora cae al nombre de la asignación.
--
-- Se conserva el nombre de columna `repartidor_email` (CREATE OR REPLACE VIEW exige la misma lista
-- de columnas) aunque desde la 0044 ya traía el nombre, no el correo. Y se repite el
-- `security_invoker` de la 0044 para no perderlo al reemplazar la vista.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_cumplimiento_tiempos_delivery
WITH (security_invoker = true) AS
  SELECT da.id AS delivery_id, da.tenant_id, da.sucursal_id, t.dia_contable, da.ticket_id, t.folio_completo, da.repartidor_id,
     COALESCE(up.nombre, r.nombre, da.repartidor_nombre)::varchar(255) AS repartidor_email,
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
      LEFT JOIN repartidores r ON r.id = da.repartidor_catalogo_id
   WHERE (da.estado = ANY (ARRAY['ENTREGADO'::delivery_estado, 'NO_ENTREGADO'::delivery_estado, 'LIQUIDADO'::delivery_estado]))
     AND t.deleted_at IS NULL;
