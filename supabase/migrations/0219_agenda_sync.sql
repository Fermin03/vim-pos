-- Belleza, entrega 1: la agenda viaja con la caja instalada (diseño 2026-10-18).
--
-- Pull: baja el catálogo de la agenda completo (las ausencias, solo las vigentes o futuras) y las
-- citas desde hace 7 días (día de America/Mexico_City) más las que están en espera, con sus tramos.
-- Push: acepta `citas` y `citas_servicios` hechas o editadas en la caja (las RPC de la 0218 corren
-- contra su Postgres local). La caja las manda por huella, como las cotizaciones (0213). El catálogo
-- NO se acepta desde la caja: si llega, queda en `_ignoradas`.
-- Empalmes: la caja agenda sin ver lo que la nube agendó mientras estaba sin internet. Un tramo que
-- choca con otro de la nube no se pierde ni se rechaza: entra con `empalme = true`, y se marcan
-- también el tramo de la nube y las dos citas. La recepción lo arregla y `resolver_empalme` quita la
-- marca. Nunca se borra ni se cancela una cita por chocar.
-- Regla de la marca: un tramo está marcado si y solo si hoy se cruza con otro tramo activo (marcado
-- o no) de otra cita, del mismo colaborador o del mismo espacio. La copia de la caja no la decide.

-- ── §1 Empalmes ─────────────────────────────────────────────────────────────
-- Tramos activos de otras citas con los que se cruza un tramo. A mano y no con el EXCLUDE: el EXCLUDE
-- no ve los tramos ya marcados. NULL si no choca con nada.
CREATE OR REPLACE FUNCTION _agenda_choques(p_tenant uuid, p_cita uuid, p_usuario uuid, p_espacio uuid,
                                           p_inicia timestamptz, p_termina timestamptz)
RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT array_agg(o.id)
    FROM citas_servicios o
   WHERE p_inicia IS NOT NULL AND p_termina IS NOT NULL
     AND o.tenant_id = p_tenant AND o.activa AND o.cita_id <> p_cita
     AND (o.usuario_id = p_usuario OR (p_espacio IS NOT NULL AND o.espacio_id = p_espacio))
     AND tstzrange(o.inicia, o.termina, '[)') && tstzrange(p_inicia, p_termina, '[)');
$$;
REVOKE ALL ON FUNCTION _agenda_choques(uuid, uuid, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- Tramos de otras citas con los que hoy chocan los tramos activos de una cita. Se toman ANTES de
-- moverla, cancelarla o marcarla «No llegó», para revisarles la marca después.
CREATE OR REPLACE FUNCTION _agenda_vecinos(p_tenant uuid, p_cita uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(u), '{}')
    FROM citas_servicios o, unnest(_agenda_choques(p_tenant, p_cita, o.usuario_id, o.espacio_id, o.inicia, o.termina)) u
   WHERE o.cita_id = p_cita AND o.activa;
$$;
REVOKE ALL ON FUNCTION _agenda_vecinos(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Recalcula con la regla de arriba la marca de estos tramos, y la de sus citas más p_citas. La
-- usan el aplicador del push y las RPC de la 0218 que mueven, cancelan o dan por no llegada una
-- cita: así la compañera pierde la marca por el canal que sea.
CREATE OR REPLACE FUNCTION _agenda_remarcar(p_tenant uuid, p_tramos uuid[], p_citas uuid[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_citas uuid[] := COALESCE(p_citas, '{}');
  v_marca boolean;
  r       record;
BEGIN
  FOR r IN SELECT * FROM citas_servicios WHERE id = ANY(p_tramos) AND tenant_id = p_tenant LOOP
    v_marca := r.activa AND _agenda_choques(p_tenant, r.cita_id, r.usuario_id, r.espacio_id, r.inicia, r.termina) IS NOT NULL;
    IF v_marca IS DISTINCT FROM r.empalme THEN
      BEGIN
        UPDATE citas_servicios SET empalme = v_marca WHERE id = r.id;
      EXCEPTION WHEN exclusion_violation THEN NULL;   -- otro envío lo ocupó en el ínterin: queda marcado
      END;
    END IF;
    v_citas := v_citas || r.cita_id;
  END LOOP;
  UPDATE citas c SET empalme = m.marca
    FROM (SELECT x.id, EXISTS (SELECT 1 FROM citas_servicios s WHERE s.cita_id = x.id AND s.empalme) AS marca
            FROM citas x WHERE x.id = ANY(v_citas) AND x.tenant_id = p_tenant) m
   WHERE c.id = m.id AND c.empalme IS DISTINCT FROM m.marca;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_remarcar(uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- Cuerpo de la 0218 con la regla de arriba: la marca solo se quita si el tramo ya no choca con
-- NADA (tampoco con un tramo marcado, que el EXCLUDE dejaría pasar).
CREATE OR REPLACE FUNCTION resolver_empalme(p_cita uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_nombre text;
  v_choca  uuid[];
  v_s      record;
BEGIN
  PERFORM 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023'; END IF;
  FOR v_s IN SELECT * FROM citas_servicios WHERE cita_id = p_cita AND empalme ORDER BY orden LOOP
    v_choca := CASE WHEN v_s.activa THEN _agenda_choques(v_tenant, p_cita, v_s.usuario_id, v_s.espacio_id, v_s.inicia, v_s.termina) END;
    IF v_choca IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM citas_servicios WHERE id = ANY(v_choca) AND usuario_id = v_s.usuario_id) THEN
        SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_s.usuario_id;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM espacios WHERE id = v_s.espacio_id;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
    END IF;
    UPDATE citas_servicios SET empalme = false WHERE id = v_s.id;
  END LOOP;
  UPDATE citas SET empalme = false WHERE id = p_cita;
END;
$$;

-- Cuerpo de la 0218 con estas diferencias: un tramo nuevo (guardar_cita, atender_cita desde la
-- espera) no se encima sobre NINGÚN tramo activo de otra cita, tampoco sobre uno marcado con
-- empalme, y el espacio automático tampoco elige uno ocupado por un tramo marcado (mismos mensajes
-- CITA_EMPALMADA); un servicio cuyo producto se borró o pausó no se agenda; el colaborador elegido
-- debe seguir siendo empleado del negocio. colaborador_libre (0218) ya no excluía los marcados.
CREATE OR REPLACE FUNCTION _agenda_tramos(p_tenant uuid, p_cita uuid, p_sucursal uuid, p_inicia timestamptz, p_servicios jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s       jsonb;
  v_orden   smallint := 0;
  v_cursor  timestamptz := p_inicia;
  v_fin     timestamptz;
  v_dur     integer;
  v_tipo    uuid;
  v_usuario uuid;
  v_espacio uuid;
  v_precio  numeric(12,2);
  v_prod    uuid;
  v_restr   text;
  v_nombre  text;
  v_choca   uuid[];
BEGIN
  IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servicios) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no tiene servicios.' USING ERRCODE = '22023';
  END IF;

  FOR v_s IN SELECT * FROM jsonb_array_elements(p_servicios) LOOP
    v_prod    := (v_s->>'producto_id')::uuid;
    v_usuario := (v_s->>'usuario_id')::uuid;
    v_espacio := (v_s->>'espacio_id')::uuid;
    -- Un producto borrado o pausado en /productos ya no se agenda.
    SELECT sa.duracion_min, sa.tipo_espacio_id INTO v_dur, v_tipo
      FROM servicios_agenda sa
      JOIN productos p ON p.id = sa.producto_id AND p.deleted_at IS NULL AND p.estado <> 'PAUSADO'
     WHERE sa.producto_id = v_prod AND sa.tenant_id = p_tenant AND sa.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un servicio de la cita no existe o ya no se ofrece.' USING ERRCODE = '22023';
    END IF;
    -- Activo en la sucursal y todavía empleado del negocio (acceso activo, perfil sin borrar).
    IF v_usuario IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM colaboradores_agenda ca
          WHERE ca.tenant_id = p_tenant AND ca.usuario_id = v_usuario AND ca.activo AND ca.sucursal_id = p_sucursal
            AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = p_tenant AND ua.usuario_id = v_usuario AND ua.activo)
            AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = v_usuario AND up.deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el colaborador no está activo en esta sucursal.' USING ERRCODE = '22023';
    END IF;
    IF v_espacio IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM espacios WHERE id = v_espacio AND tenant_id = p_tenant AND sucursal_id = p_sucursal) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el espacio no es de esta sucursal.' USING ERRCODE = '22023';
    END IF;

    v_fin := NULL;
    IF v_cursor IS NOT NULL THEN
      IF v_usuario IS NULL THEN
        v_usuario := colaborador_libre(p_sucursal, v_prod, v_cursor);
        IF v_usuario IS NULL THEN
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay quien esté libre a esa hora' USING ERRCODE = '23P01';
        END IF;
      END IF;
      SELECT COALESCE(sc.duracion_min, v_dur) INTO v_dur
        FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;
      v_fin := v_cursor + make_interval(mins => v_dur);

      IF v_tipo IS NOT NULL AND v_espacio IS NULL THEN
        SELECT e.id INTO v_espacio
          FROM espacios e
         WHERE e.tenant_id = p_tenant AND e.sucursal_id = p_sucursal AND e.tipo_espacio_id = v_tipo AND e.activo
           AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                            WHERE cs.espacio_id = e.id AND cs.activa
                              AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(v_cursor, v_fin, '[)'))
         ORDER BY e.orden, e.nombre
         LIMIT 1;
        IF v_espacio IS NULL THEN
          SELECT lower(nombre) INTO v_nombre FROM tipos_espacio WHERE id = v_tipo;
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay % libre a esa hora', v_nombre USING ERRCODE = '23P01';
        END IF;
      END IF;
    END IF;

    SELECT COALESCE(sc.precio_mxn, precio_producto_en_sucursal(v_prod, p_sucursal)) INTO v_precio
      FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;

    -- 0219: tampoco encima de un tramo marcado con empalme (el EXCLUDE no lo ve).
    v_choca := _agenda_choques(p_tenant, p_cita, v_usuario, v_espacio, v_cursor, v_fin);
    IF v_choca IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM citas_servicios WHERE id = ANY(v_choca) AND usuario_id = v_usuario) THEN
        SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_usuario;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM espacios WHERE id = v_espacio;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
    END IF;

    v_orden := v_orden + 1;
    BEGIN
      INSERT INTO citas_servicios (tenant_id, cita_id, orden, producto_id, usuario_id, espacio_id, inicia, termina, precio_mxn)
      VALUES (p_tenant, p_cita, v_orden, v_prod, v_usuario, v_espacio, v_cursor, v_fin, COALESCE(v_precio, 0));
    EXCEPTION WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_restr = CONSTRAINT_NAME;
      IF v_restr = 'citas_servicios_sin_empalme_espacio' THEN
        SELECT nombre INTO v_nombre FROM espacios WHERE id = v_espacio;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_usuario;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
    END;
    v_cursor := v_fin;
  END LOOP;
  RETURN v_cursor;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_tramos(uuid, uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- ── §2 Aplicador ────────────────────────────────────────────────────────────
-- Molde de _vim_aplicar_cotizaciones_caja (0213). Corre en origin: el disparador de `activa`
-- (0218) decide si cada tramo ocupa, según el estado de la cita en la nube.
--   · cada cita entra con TODOS sus tramos o no entra: un bloque por cita. Si algo falla, la versión
--     de la nube queda como estaba y la cita va a `_errores` (la caja la reintenta);
--   · tenant_id de cada fila = el del dispositivo; un id que ya es de otro negocio es error;
--   · sucursal, cliente (redirigido por clientes_alias, 0156) y venta, del negocio; created_by solo
--     si tiene acceso al negocio (si no, NULL);
--   · una cita TERMINADA, NO_LLEGO o CANCELADA en la nube ya no cambia: una copia vieja de la caja
--     no la regresa a «Por llegar». Fuera de eso gana el último push;
--   · los tramos de la nube se borran y entran los que manda la caja (editar en la caja les da ids
--     nuevos); producto, colaborador y espacio de cada uno, del negocio;
--   · un tramo que se cruza con otro activo entra con empalme = true y marca al otro. Al final se
--     recalcula la marca de todo lo tocado (así un intercambio de horario entre dos citas de la caja
--     no deja una marca falsa) y la de sus citas.
-- Devuelve {citas int, citas_servicios int, errores [{tabla, id, error}]}.
CREATE OR REPLACE FUNCTION _vim_aplicar_citas_caja(p_tenant uuid, p_citas jsonb, p_servicios jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_c       jsonb;
  v_s       jsonb;
  v_cita    uuid;
  v_tramo   uuid;
  v_cli     uuid;
  v_dueno   uuid;
  v_estado  cita_estado;
  v_activa  boolean;
  v_choca   uuid[];
  v_revisar uuid[] := '{}';
  v_tocadas uuid[] := '{}';
  v_k       integer;
  v_nc      integer := 0;
  v_ns      integer := 0;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_citas) IS DISTINCT FROM 'array' THEN p_citas := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' THEN p_servicios := '[]'::jsonb; END IF;

  -- Un tramo viaja siempre con su cita.
  FOR v_s IN SELECT s.value FROM jsonb_array_elements(p_servicios) s
              WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_citas) c WHERE c.value->>'id' = s.value->>'cita_id') LOOP
    v_errores := v_errores || jsonb_build_object('tabla', 'citas_servicios', 'id', v_s->>'id', 'error', 'llegó sin su cita');
  END LOOP;

  FOR v_c IN SELECT value FROM jsonb_array_elements(p_citas) ORDER BY value->>'created_at' LOOP
    BEGIN
      v_cita := (v_c->>'id')::uuid;
      IF (v_c->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'fila de otro negocio';
      END IF;
      v_dueno := NULL; v_estado := NULL;
      SELECT tenant_id, estado INTO v_dueno, v_estado FROM citas WHERE id = v_cita;
      IF v_dueno IS DISTINCT FROM p_tenant AND v_dueno IS NOT NULL THEN
        RAISE EXCEPTION 'el id ya existe en otro negocio';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_c->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'sucursal de otro negocio';
      END IF;
      v_cli := (v_c->>'cliente_id')::uuid;
      IF v_cli IS NOT NULL THEN
        v_cli := COALESCE((SELECT cliente_id FROM clientes_alias WHERE alias_id = v_cli AND tenant_id = p_tenant), v_cli);
        v_c := v_c || jsonb_build_object('cliente_id', v_cli);
        IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'cliente de otro negocio';
        END IF;
      END IF;
      IF v_c->>'ticket_id' IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tickets WHERE id = (v_c->>'ticket_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'venta de otro negocio o que aún no sube';
      END IF;
      IF v_c->>'created_by' IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_c->>'created_by')::uuid AND tenant_id = p_tenant) THEN
        v_c := v_c || '{"created_by": null}'::jsonb;
      END IF;
      IF v_estado IN ('TERMINADA', 'NO_LLEGO', 'CANCELADA') THEN
        CONTINUE;   -- cerrada en la nube: la copia de la caja no la reabre
      END IF;

      -- Lo que chocaba con sus tramos viejos se vuelve a revisar al final: si la cita se movió o se
      -- canceló, la otra pierde la marca.
      v_revisar := v_revisar || _agenda_vecinos(p_tenant, v_cita);
      -- Primero fuera los tramos de la nube: cambiar el estado no debe reactivar unos que se van.
      DELETE FROM citas_servicios WHERE cita_id = v_cita;
      INSERT INTO citas AS c SELECT * FROM jsonb_populate_record(NULL::citas, v_c || '{"empalme": false}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          sucursal_id = EXCLUDED.sucursal_id, cliente_id = EXCLUDED.cliente_id,
          cliente_nombre = EXCLUDED.cliente_nombre, cliente_telefono = EXCLUDED.cliente_telefono,
          cliente_email = EXCLUDED.cliente_email, estado = EXCLUDED.estado, canal = EXCLUDED.canal,
          inicia = EXCLUDED.inicia, termina = EXCLUDED.termina, llego_at = EXCLUDED.llego_at,
          nota = EXCLUDED.nota, cancelada_motivo = EXCLUDED.cancelada_motivo, updated_at = EXCLUDED.updated_at
        WHERE c.tenant_id = p_tenant;
      SELECT estado NOT IN ('CANCELADA', 'NO_LLEGO', 'EN_ESPERA') INTO v_activa FROM citas WHERE id = v_cita;

      v_k := 0;
      FOR v_s IN SELECT value FROM jsonb_array_elements(p_servicios)
                  WHERE value->>'cita_id' = v_cita::text ORDER BY (value->>'orden')::integer LOOP
        v_tramo := (v_s->>'id')::uuid;
        IF (v_s->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'tramo %: fila de otro negocio', v_tramo;
        END IF;
        IF EXISTS (SELECT 1 FROM citas_servicios WHERE id = v_tramo AND tenant_id <> p_tenant) THEN
          RAISE EXCEPTION 'tramo %: el id ya existe en otro negocio', v_tramo;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM productos WHERE id = (v_s->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: producto de otro negocio', v_tramo;
        END IF;
        IF v_s->>'usuario_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_s->>'usuario_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: colaborador de otro negocio', v_tramo;
        END IF;
        IF v_s->>'espacio_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM espacios WHERE id = (v_s->>'espacio_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: espacio de otro negocio', v_tramo;
        END IF;
        v_choca := CASE WHEN v_activa THEN _agenda_choques(p_tenant, v_cita, (v_s->>'usuario_id')::uuid, (v_s->>'espacio_id')::uuid,
                                                           (v_s->>'inicia')::timestamptz, (v_s->>'termina')::timestamptz) END;
        IF v_choca IS NOT NULL THEN
          UPDATE citas_servicios SET empalme = true WHERE id = ANY(v_choca) AND NOT empalme;
          v_revisar := v_revisar || v_choca;
        END IF;
        INSERT INTO citas_servicios
          SELECT * FROM jsonb_populate_record(NULL::citas_servicios, v_s || jsonb_build_object('empalme', v_choca IS NOT NULL));
        v_revisar := v_revisar || v_tramo;
        v_k := v_k + 1;
      END LOOP;
      v_tocadas := v_tocadas || v_cita;
      v_nc := v_nc + 1;
      v_ns := v_ns + v_k;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object('tabla', 'citas', 'id', v_c->>'id', 'error', SQLERRM);
    END;
  END LOOP;

  -- La marca, recalculada sobre lo tocado ya con todo el envío aplicado.
  PERFORM _agenda_remarcar(p_tenant, v_revisar, v_tocadas);

  RETURN jsonb_build_object('citas', v_nc, 'citas_servicios', v_ns, 'errores', v_errores);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_citas_caja(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ── §3 sync_pull_snapshot ───────────────────────────────────────────────────
-- La de la 0210 (vigente) más la agenda (marcado "0219"). La ventana de citas vive en `ci`.
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH ci AS (   -- 0219: las citas que bajan
    SELECT c.id FROM citas c
     WHERE c.tenant_id = p_tenant
       AND (c.estado = 'EN_ESPERA'
            OR c.inicia >= (((now() AT TIME ZONE 'America/Mexico_City')::date - 7)::timestamp AT TIME ZONE 'America/Mexico_City'))
  )
  SELECT jsonb_build_object(
    'tenants',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Menú por sucursal (0152, ADR 0027).
    'productos_sucursal',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0187: el catálogo de colonias (ADR 0036). Sube y baja, como las zonas.
    'colonias',                       coalesce((SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Propinas por sucursal (0184): lo que el dueño configura en el admin, para que la caja lo respete.
    'sucursal_propinas_config',       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursal_propinas_config x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Lealtad (0156, ADR 0030). Los clientes bajan por primera vez: sin esto el cliente de una
    -- sucursal no existe en la otra. Los saldos bajan solo para mostrarse; la caja les suma lo que
    -- aún no subió. Los movimientos NO bajan.
    'clientes',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_programa',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_programa x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_premios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_premios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_saldos',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_saldos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0210: el crédito. Las filas son inmutables y la caja baja en cada ciclo, así que basta la
    -- ventana: lo que sigue debiéndose (o a favor) y lo de los últimos 90 días, que trae el abono o
    -- el uso que dejó la cuenta en cero. Sin la ventana, la caja se quedaría con una deuda o un saldo
    -- a favor que ya no existen.
    'clientes_credito',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes_credito x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'abonos_credito',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM abonos_credito x WHERE x.tenant_id = p_tenant
                                        AND (x.created_at >= now() - interval '90 days' OR credito_saldo_ticket(x.ticket_id) > 0)), '[]'::jsonb),
    -- 0210: deuda de cada venta a crédito con saldo, para que la caja sume la de otras cajas (§0).
    'creditos_resumen_nube',          coalesce((SELECT jsonb_agg(jsonb_build_object('ticket_id', v.id, 'tenant_id', v.tenant_id,
                                          'cliente_id', v.cliente_id, 'saldo_mxn', v.saldo, 'fecha_venta', v.fecha, 'sincronizado_at', now()))
                                        FROM (SELECT t.id, t.tenant_id, t.cliente_id, COALESCE(t.fecha_pago, t.fecha_apertura) AS fecha,
                                                     credito_saldo_ticket(t.id) AS saldo
                                                FROM tickets t
                                               WHERE t.tenant_id = p_tenant AND t.cliente_id IS NOT NULL
                                                 AND t.id IN (SELECT p.ticket_id FROM pagos p WHERE p.metodo_pago = 'CREDITO'
                                                                 AND p.estado = 'APLICADO' AND p.deleted_at IS NULL)) v
                                       WHERE v.saldo > 0), '[]'::jsonb),
    'saldo_favor_movimientos',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM saldo_favor_movimientos x WHERE x.tenant_id = p_tenant
                                        AND x.cliente_id IN (SELECT s.cliente_id FROM saldo_favor_movimientos s WHERE s.tenant_id = p_tenant
                                                              GROUP BY s.cliente_id
                                                             HAVING max(s.created_at) >= now() - interval '90 days'
                                                                 OR sum(CASE WHEN s.tipo = 'USO' THEN -s.monto_mxn ELSE s.monto_mxn END) > 0)), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0195: existencias por producto de todas las sucursales vivas (la caja enseña las de las otras).
    'producto_existencias',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM producto_existencias x WHERE x.tenant_id = p_tenant
                                        AND x.sucursal_id IN (SELECT id FROM sucursales WHERE tenant_id = p_tenant AND deleted_at IS NULL)), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  -- 0219: la agenda, en su propio objeto (jsonb_build_object no acepta más de 100 argumentos).
  -- El catálogo entero; las ausencias que aún no terminan; las citas de los últimos 7 días (día de
  -- México) y las que esperan, con sus tramos tal como están (`activa` y `empalme` incluidos).
  || jsonb_build_object(
    'tipos_espacio',                  coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tipos_espacio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'espacios',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM espacios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'servicios_agenda',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM servicios_agenda x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'colaboradores_agenda',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM colaboradores_agenda x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'servicio_colaborador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM servicio_colaborador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'horarios_colaborador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM horarios_colaborador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'ausencias_colaborador',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM ausencias_colaborador x WHERE x.tenant_id = p_tenant
                                        AND x.hasta >= (now() AT TIME ZONE 'America/Mexico_City')::date), '[]'::jsonb),
    'citas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM citas x WHERE x.id IN (SELECT id FROM ci)), '[]'::jsonb),
    'citas_servicios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM citas_servicios x WHERE x.cita_id IN (SELECT id FROM ci)), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- ── §4 sync_push_snapshot ───────────────────────────────────────────────────
-- La de la 0213 (vigente) más las citas (marcado "0219"): se aplican al final, en origin; no cuentan
-- entre las ignoradas y sirven para hallar la sucursal del rastro.
CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla     text;
  v_res       jsonb := '{}'::jsonb;
  v_det       jsonb;
  v_errores   jsonb := '[]'::jsonb;
  v_ignoradas text[] := ARRAY[]::text[];
  v_ini       timestamptz := clock_timestamp();
  v_total     integer := 0;
  v_aplicadas integer := 0;
  v_caja      uuid;
  v_sucursal  uuid;
  v_disp      text;
  v_desc      text;
  v_min       timestamptz;
  v_max       timestamptz;
  v_tickets   jsonb;
  v_descartados jsonb;   -- 0195
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'colonias',   -- 0187
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  IF jsonb_typeof(p_snapshot->'_fusion_errores') = 'array' THEN v_errores := v_errores || (p_snapshot->'_fusion_errores'); END IF;
  p_snapshot := p_snapshot - '_fusion_errores';
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);

  -- La guarda del FACTURADO (ver el encabezado, punto 2): si la nube ya lo facturó y la caja
  -- manda su copia PAGADO, se conserva FACTURADO. Se reescribe el JSON entrante antes de aplicar,
  -- así el resto de la fila (lo que cambió en la caja) entra igual.
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT jsonb_agg(
             CASE WHEN t.estado_fiscal = 'FACTURADO' AND r->>'estado_fiscal' = 'PAGADO'
                  THEN r || jsonb_build_object('estado_fiscal', 'FACTURADO')
                  ELSE r END)
      INTO v_tickets
      FROM jsonb_array_elements(p_snapshot->'tickets') AS r
      LEFT JOIN public.tickets t ON t.id = NULLIF(r->>'id', '')::uuid AND t.tenant_id = p_tenant;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', COALESCE(v_tickets, '[]'::jsonb));
  END IF;

  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- 0156: un canje que el libro ya devolvió no revive con la copia tardía de la caja. Ver
  -- _vim_conciliar_canjes. Sigue en modo réplica, que es lo que se quiere para su UPDATE.
  v_det := _vim_conciliar_canjes(p_snapshot->'ticket_canjes_lealtad', p_tenant);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0195: existencias por producto. En origin: el disparador mueve producto_existencias.
  v_det := _vim_aplicar_movimientos_producto(p_tenant, p_snapshot->'movimientos_producto');
  v_res := v_res || jsonb_build_object('movimientos_producto', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_descartados := COALESCE(v_det->'descartados', '[]'::jsonb);   -- 0195

  -- 0210: el crédito hecho en la caja. En origin, ya con las ventas y los turnos del lote aplicados.
  v_det := _vim_aplicar_credito_caja(p_tenant, 'abonos_credito', p_snapshot->'abonos_credito');
  v_res := v_res || jsonb_build_object('abonos_credito', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_det := _vim_aplicar_credito_caja(p_tenant, 'saldo_favor_movimientos', p_snapshot->'saldo_favor_movimientos');
  v_res := v_res || jsonb_build_object('saldo_favor_movimientos', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0213: las cotizaciones de la caja. En origin, ya con las ventas del lote aplicadas.
  v_det := _vim_aplicar_cotizaciones_caja(p_tenant, p_snapshot->'cotizaciones', p_snapshot->'cotizacion_items');
  v_res := v_res || jsonb_build_object('cotizaciones', (v_det->>'cotizaciones')::integer,
                                       'cotizacion_items', (v_det->>'cotizacion_items')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0219: las citas de la caja. En origin: el disparador de `activa` decide qué tramos ocupan.
  v_det := _vim_aplicar_citas_caja(p_tenant, p_snapshot->'citas', p_snapshot->'citas_servicios');
  v_res := v_res || jsonb_build_object('citas', (v_det->>'citas')::integer,
                                       'citas_servicios', (v_det->>'citas_servicios')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- ── Rastro del envío (0070/0073) ─────────────────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    -- Caja y sucursal de la primera fila (tickets, turnos o, si solo vienen movimientos, pagos/movimientos).
    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', p_snapshot->'cotizaciones', '[]'::jsonb)) AS t   -- 0213
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', p_snapshot->'movimientos_producto', p_snapshot->'citas', '[]'::jsonb)) AS t LIMIT 1;   -- 0195, 0219
    END IF;
    IF v_caja IS NULL AND v_sucursal IS NOT NULL THEN
      -- Un lote de puros movimientos no trae caja: se toma la de la sucursal con señal de vida más reciente.
      SELECT id INTO v_caja FROM public.cajas WHERE sucursal_id = v_sucursal AND tenant_id = p_tenant
       ORDER BY ultima_conexion DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
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
      -- 0123: el motivo de cada fila rechazada (hasta 20), no solo cuántas. Sin esto el detalle solo
      -- quedaba en la bitácora de la caja del local, y un rechazo que se reintenta cada 10 minutos
      -- no se podía diagnosticar desde aquí.
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                    THEN jsonb_build_object('_errores', (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_errores) e LIMIT 20) x))
                    ELSE '{}'::jsonb END
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Tablas que la caja mandó y aquí no se replican (0089).
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos', 'movimientos_producto', 'abonos_credito', 'saldo_favor_movimientos', 'cotizaciones', 'cotizacion_items', 'citas', 'citas_servicios']));   -- 0210, 0213, 0219
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
               -- 0195: ids que la caja marca como subidos aunque la nube no los guardó.
               || CASE WHEN jsonb_array_length(v_descartados) > 0 THEN jsonb_build_object('_descartados', jsonb_build_object('movimientos_producto', v_descartados)) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
