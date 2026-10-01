-- 0144 · eliminar un cliente por completo desde el panel de plataforma (ADR 0023)
--
-- Hasta hoy el panel solo podía dar de baja (estado CANCELADO): el negocio dejaba de operar pero
-- todas sus filas, sus cuentas y su código seguían ahí para siempre. Con el registro público
-- (0142) eso se llena de altas de prueba y pruebas abandonadas, y el código queda tomado.
--
-- Aquí:
--   · `tenants_eliminados` — lo ÚNICO que queda de un cliente eliminado: quién era, cuándo y por
--     qué se eliminó, cuánto se borró, lo que le pagó a VIM y a quién llamar.
--   · `eliminar_tenant_vista_previa` — de solo lectura: qué se va a borrar y si se puede.
--   · `eliminar_tenant` — lo borra todo en UNA transacción.
--
-- REGLAS (decididas, ADR 0023)
--   1. Solo se elimina un cliente CANCELADO. Dos pasos: primero la baja, luego esto. INTERNO, nunca.
--   2. Guardia fiscal: con un solo CFDI que haya llegado al SAT (uuid_fiscal, vigente o
--      cancelado) no se elimina. Tampoco con un timbrado o una cancelación a medias.
--   3. Los pagos de la suscripción (0130) no impiden eliminar, pero se archivan.
--   4. El código queda libre: el mismo negocio puede volver a registrarse.
--
-- CÓMO BORRA SIN UNA LISTA DE TABLAS
--   Las tablas salen del catálogo: toda tabla de `public` con columna `tenant_id`. Se borran
--   TODAS EN UNA SOLA SENTENCIA (un DELETE por tabla, encadenados como CTE). Eso resuelve el orden
--   sin calcularlo: Postgres comprueba las llaves foráneas —también las ON DELETE RESTRICT— al
--   TERMINAR la sentencia, cuando ya no queda ninguna fila del negocio, así que da igual que
--   tickets ↔ mesas ↔ cuentas_abiertas se referencien en círculo. Las llaves siguen ENCENDIDAS:
--   si una fila de otro negocio (o de una tabla sin tenant_id) apunta a algo de este, la sentencia
--   falla y no se borra nada. Después se borra la fila de `tenants` con las llaves igual de
--   encendidas, y al final se recorre el catálogo otra vez: si en alguna tabla queda una sola
--   fila con ese tenant_id, se aborta. Una tabla nueva con tenant_id entra sola; una tabla nueva
--   SIN tenant_id que cuelgue de una del negocio o tiene ON DELETE CASCADE (y se va sola, como
--   rol_permisos) o hace fallar la eliminación con el nombre de la llave — nunca deja huérfanos.
--
-- CÓMO PASA LAS GUARDAS DE DINERO
--   · `guardia_escritura_directa` (0133, "DELETE nunca" en 21 tablas de dinero) NO se toca. Solo
--     actúa sobre escrituras REST directas a tabla de un rol sujeto a RLS; esto es una RPC
--     (`/rpc/eliminar_tenant`) y corre como el dueño de la función, que no está sujeto a RLS.
--   · `trg_reporte_z_inmutable` (0010) sí rechaza TODO DELETE, venga de quien venga. Es el único
--     trigger que estorba, y se le añade UNA excepción: `_eliminando_tenant(OLD.tenant_id)`.
--     Esa función exige las dos cosas a la vez:
--       a) la variable de transacción `vim.eliminando_tenant` vale exactamente el tenant de la
--          fila (la pone `eliminar_tenant`, local a su transacción, y la quita al terminar), y
--       b) quien ejecuta NO está sujeto a RLS (superusuario o BYPASSRLS) — dentro de
--          `eliminar_tenant` es el dueño de la función; en una sesión del negocio es
--          `authenticated`, que no lo es nunca.
--     Por (b), aunque una sesión `authenticated` lograra fijar la variable, el reporte Z sigue
--     sin poder borrarse. No se desactiva ningún trigger, ni para esta sesión ni para las demás.
--   Los demás triggers de DELETE son recálculos AFTER (totales del ticket, costo de receta, uso
--   de promoción): corren al final de la sentencia, cuando su ticket ya no existe, y no hacen nada.
--
-- CUENTAS (auth.users)
--   Se borran en la misma transacción las cuentas que SOLO eran de este negocio: el dueño, los
--   empleados y las cuentas de dispositivo (`caja-<id>@dispositivos…`). Una cuenta que también
--   tiene acceso a otro negocio, que es dueña de otro, o que es de un operador del panel, se
--   conserva y solo pierde el acceso a este. Si una cuenta exclusiva sigue referenciada desde
--   filas de OTRO negocio (un `created_by` viejo), tampoco se borra: se reporta.
--
-- ARCHIVOS
--   Borrar filas de `storage.objects` deja los archivos en el disco: los quita el servidor del
--   panel por la API de Storage DESPUÉS de esta transacción. Aquí solo se listan (antes de
--   borrar) y se devuelven. Los nombres salen del id del CFDI, nunca de `*_storage_path`: esas
--   columnas las podía reescribir el negocio (0135, C1-3) y con service_role sería borrar
--   cualquier objeto de cualquier bucket.
--
-- ESCRITORIO: la caja aplica esta misma migración en su Postgres embebido. Ahí `auth.users` es
-- el shim y `storage.objects` no existe: lo de Storage va por `to_regclass` + SQL dinámico. Las
-- funciones quedan creadas e inertes (solo service_role, y nadie las llama).

-- ---------------------------------------------------------------------------------------------
-- 1) Lo que queda de un cliente eliminado
-- ---------------------------------------------------------------------------------------------
-- La llave es el id que tuvo en `tenants`, y la columna NO se llama `tenant_id` a propósito: la
-- comprobación final de `eliminar_tenant` busca ese nombre en todo el catálogo.
CREATE TABLE IF NOT EXISTS public.tenants_eliminados (
  id                 uuid PRIMARY KEY,
  codigo             varchar(50)  NOT NULL,
  nombre_comercial   varchar(150) NOT NULL,
  vertical_principal text         NOT NULL,
  plan_codigo        text         NULL,
  fecha_alta         timestamptz  NOT NULL,
  fecha_baja         timestamptz  NULL,
  motivo_baja        text         NULL,
  eliminado_at       timestamptz  NOT NULL DEFAULT now(),
  -- Operador del panel (plataforma_operadores) o el UUID de sistema de la clave compartida.
  eliminado_por      uuid         NOT NULL,
  motivo             text         NOT NULL CHECK (length(btrim(motivo)) >= 10),
  -- Cuántas filas se borraron: { resumen: {sucursales, cajas, …}, tablas: {tabla: n} }.
  conteos            jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- El dinero que entró a VIM no desaparece con el cliente: copia de `suscripciones` y de
  -- `pagos_suscripcion` (también los anulados) tal como estaban.
  suscripciones      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  pagos_suscripcion  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- Para el seguimiento comercial: { nombre, email, telefono } del dueño. Nada fiscal (ni RFC ni
  -- razón social ni domicilio): sin CFDI timbrados no hay obligación de conservarlos.
  contacto           jsonb        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tenants_eliminados_fecha ON public.tenants_eliminados (eliminado_at DESC);

ALTER TABLE public.tenants_eliminados ENABLE ROW LEVEL SECURITY;
-- Sin políticas y sin privilegios para el navegador. El panel (service_role) solo LEE: la única
-- que escribe es `eliminar_tenant`, que corre como su dueño.
REVOKE ALL ON public.tenants_eliminados FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.tenants_eliminados TO service_role;

COMMENT ON TABLE public.tenants_eliminados IS
  'Lo que queda de un cliente eliminado (0144, ADR 0023). Solo la escribe eliminar_tenant; solo la lee el panel de plataforma.';

-- ---------------------------------------------------------------------------------------------
-- 2) La excepción de los triggers de inmutabilidad
-- ---------------------------------------------------------------------------------------------
-- SECURITY INVOKER A PROPÓSITO: `current_user` tiene que ser el de quien dispara el trigger. Si
-- fuera DEFINER respondería siempre por su dueño y la condición (b) no valdría nada.
CREATE OR REPLACE FUNCTION public._eliminando_tenant(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_tenant IS NOT NULL
     AND coalesce(pg_catalog.current_setting('vim.eliminando_tenant', true), '') = p_tenant::text
     AND coalesce((SELECT r.rolsuper OR r.rolbypassrls
                     FROM pg_catalog.pg_roles r
                    WHERE r.rolname = current_user), false);
$$;

-- La llama el trigger con el rol de la sesión, así que `authenticated` necesita EXECUTE (sin él,
-- borrar un reporte Z fallaría igual, pero con "permission denied for function" en vez del
-- mensaje del trigger). No revela nada: a `authenticated` siempre le contesta false.
REVOKE ALL ON FUNCTION public._eliminando_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._eliminando_tenant(uuid) TO authenticated, service_role;

-- Mismo cuerpo que en 0010, más la excepción en el DELETE (y RETURN OLD en ese caso: con
-- RETURN NEW, que en un DELETE es NULL, el borrado se saltaría en silencio).
CREATE OR REPLACE FUNCTION public.trg_reporte_z_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Solo se permite UPDATE de la columna `nota` (para agregar observaciones post-hoc)
    IF OLD.payload_completo IS DISTINCT FROM NEW.payload_completo
       OR OLD.total_ventas_mxn <> NEW.total_ventas_mxn
       OR OLD.efectivo_declarado_mxn IS DISTINCT FROM NEW.efectivo_declarado_mxn
       OR OLD.folio_z <> NEW.folio_z
       OR OLD.dia_contable <> NEW.dia_contable THEN
      RAISE EXCEPTION 'Reporte Z es inmutable. Solo el campo nota se puede actualizar.';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Única salida: la eliminación completa del negocio desde el panel (0144).
    IF public._eliminando_tenant(OLD.tenant_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Reporte Z no se puede eliminar.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3) Piezas internas (no las ejecuta nadie más que las dos funciones de abajo)
-- ---------------------------------------------------------------------------------------------

-- Cuántas filas tiene el negocio en cada tabla con tenant_id. Solo las que tienen alguna.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_inventario(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  r        record;
  v_n      bigint;
  v_tablas jsonb := '{}'::jsonb;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
       -- La bitácora de plataforma no se borra (se le quita la llave): no cuenta.
       AND c.relname <> 'super_admin_accesos'
     ORDER BY c.relname
  LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', r.relname)
      INTO v_n USING p_tenant_id;
    IF v_n > 0 THEN
      v_tablas := v_tablas || pg_catalog.jsonb_build_object(r.relname, v_n);
    END IF;
  END LOOP;
  RETURN v_tablas;
END;
$$;

-- Las cuentas de auth que tocan a este negocio y qué pasa con cada una.
--   exclusiva = true  → solo era de este negocio: se borra.
--   exclusiva = false → se conserva; `motivo` dice por qué.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_cuentas(p_tenant_id uuid)
RETURNS TABLE (usuario_id uuid, exclusiva boolean, motivo text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH candidatas AS (
    SELECT a.usuario_id FROM public.usuarios_acceso a WHERE a.tenant_id = p_tenant_id
    UNION
    SELECT t.usuario_dueno_id FROM public.tenants t WHERE t.id = p_tenant_id AND t.usuario_dueno_id IS NOT NULL
    UNION
    -- La cuenta de cada caja lleva el id de la caja en el correo (los dos dominios, ver
    -- supabase/functions/_shared/dispositivo.ts). Normalmente ya salió por usuarios_acceso.
    SELECT u.id
      FROM public.cajas c
      JOIN auth.users u
        ON pg_catalog.lower(u.email) IN ('caja-' || c.id::text || '@dispositivos.vimpos.com.mx',
                                         'caja-' || c.id::text || '@dispositivos.vimpos.mx')
     WHERE c.tenant_id = p_tenant_id
  )
  SELECT k.usuario_id,
         m.motivo IS NULL,
         m.motivo
    FROM candidatas k
    JOIN auth.users u ON u.id = k.usuario_id
   CROSS JOIN LATERAL (
     SELECT CASE
       WHEN EXISTS (SELECT 1 FROM public.plataforma_operadores o WHERE o.usuario_id = k.usuario_id)
         THEN 'OPERADOR_DEL_PANEL'
       WHEN EXISTS (SELECT 1 FROM public.usuarios_acceso a WHERE a.usuario_id = k.usuario_id AND a.tenant_id <> p_tenant_id)
         THEN 'ACCESO_A_OTRO_NEGOCIO'
       WHEN EXISTS (SELECT 1 FROM public.tenants t WHERE t.usuario_dueno_id = k.usuario_id AND t.id <> p_tenant_id)
         THEN 'DUENO_DE_OTRO_NEGOCIO'
       ELSE NULL
     END AS motivo
   ) m;
$$;

-- Los objetos de Storage del negocio: los archivos de sus CFDI (nombre derivado del id) y
-- cualquier objeto, en cualquier bucket, cuya ruta empiece por `<tenant_id>/`.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_archivos(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_nombres text[];
  v_res     jsonb;
BEGIN
  IF pg_catalog.to_regclass('storage.objects') IS NULL THEN
    RETURN '[]'::jsonb;  -- escritorio: no hay Storage
  END IF;
  SELECT coalesce(pg_catalog.array_agg(n.nombre), ARRAY[]::text[])
    INTO v_nombres
    FROM public.tickets_cfdi c
   CROSS JOIN LATERAL (VALUES (c.id::text || '.xml'), (c.id::text || '.pdf'), (c.id::text || '-acuse.xml')) AS n(nombre)
   WHERE c.tenant_id = p_tenant_id;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'nombre', o.name) ORDER BY o.bucket_id, o.name), '[]'::jsonb)
      FROM storage.objects o
     WHERE (o.bucket_id = 'cfdi' AND o.name = ANY ($1))
        OR o.name LIKE $2 || '/%'
  $q$ INTO v_res USING v_nombres, p_tenant_id::text;
  RETURN v_res;
END;
$$;

-- Por qué NO se puede eliminar. Vacío = se puede.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_bloqueos(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_estado text;
  v_res    jsonb := '[]'::jsonb;
BEGIN
  SELECT t.estado::text INTO v_estado FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'codigo', 'TENANT_NO_EXISTE', 'mensaje', 'Ese cliente no existe (o ya se eliminó).'));
  END IF;
  IF v_estado = 'INTERNO' THEN
    v_res := v_res || pg_catalog.jsonb_build_object(
      'codigo', 'TENANT_INTERNO', 'mensaje', 'Es un negocio interno de VIM: no se elimina.');
  ELSIF v_estado <> 'CANCELADO' THEN
    v_res := v_res || pg_catalog.jsonb_build_object(
      'codigo', 'TENANT_NO_CANCELADO',
      'mensaje', 'Solo se elimina un cliente cancelado. Primero dalo de baja con "Cancelar cliente".');
  END IF;
  IF EXISTS (SELECT 1 FROM public.tickets_cfdi c WHERE c.tenant_id = p_tenant_id AND c.uuid_fiscal IS NOT NULL) THEN
    v_res := v_res || pg_catalog.jsonb_build_object(
      'codigo', 'TIENE_TIMBRADOS',
      'mensaje', 'Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja.');
  ELSIF EXISTS (SELECT 1 FROM public.tickets_cfdi c
                 WHERE c.tenant_id = p_tenant_id
                   AND c.estado_sat::text NOT IN ('BORRADOR', 'ERROR_TIMBRADO')) THEN
    -- Sin uuid pero fuera de borrador: la petición salió al PAC y no sabemos qué contestó.
    v_res := v_res || pg_catalog.jsonb_build_object(
      'codigo', 'TIMBRADO_EN_PROCESO',
      'mensaje', 'Tiene un timbrado a medias con el SAT. Espera a que termine (o falle) antes de eliminar.');
  END IF;
  RETURN v_res;
END;
$$;

-- Las cifras que se enseñan antes de confirmar y se guardan en el archivo.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_resumen(p_tablas jsonb, p_cuentas integer, p_conservadas integer, p_archivos integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'sucursales',        coalesce((p_tablas ->> 'sucursales')::bigint, 0),
    'cajas',             coalesce((p_tablas ->> 'cajas')::bigint, 0),
    'usuarios',          coalesce((p_tablas ->> 'usuarios_acceso')::bigint, 0),
    'productos',         coalesce((p_tablas ->> 'productos')::bigint, 0),
    'tickets',           coalesce((p_tablas ->> 'tickets')::bigint, 0),
    'clientes',          coalesce((p_tablas ->> 'clientes')::bigint, 0),
    'cfdi',              coalesce((p_tablas ->> 'tickets_cfdi')::bigint, 0),
    'pagos_suscripcion', coalesce((p_tablas ->> 'pagos_suscripcion')::bigint, 0),
    'cuentas',           p_cuentas,
    'cuentas_conservadas', p_conservadas,
    'archivos',          p_archivos,
    'tablas_con_datos',  (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_tablas)),
    'filas',             coalesce((SELECT sum(v.value::bigint) FROM pg_catalog.jsonb_each_text(p_tablas) v), 0)
  );
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_eliminar_tenant_inventario(uuid)', '_eliminar_tenant_cuentas(uuid)', '_eliminar_tenant_archivos(uuid)',
    '_eliminar_tenant_bloqueos(uuid)', '_eliminar_tenant_resumen(jsonb, integer, integer, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 4) Vista previa: qué se va a borrar y si se puede. No escribe nada.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eliminar_tenant_vista_previa(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t        record;
  v_bloqueos jsonb;
  v_tablas   jsonb;
  v_archivos jsonb;
  v_borrar   integer;
  v_quedan   integer;
BEGIN
  SELECT t.id, t.codigo, t.nombre_comercial, t.estado::text AS estado, t.fecha_baja
    INTO v_t FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó).';
  END IF;

  v_bloqueos := public._eliminar_tenant_bloqueos(p_tenant_id);
  v_tablas   := public._eliminar_tenant_inventario(p_tenant_id);
  v_archivos := public._eliminar_tenant_archivos(p_tenant_id);
  SELECT count(*) FILTER (WHERE k.exclusiva), count(*) FILTER (WHERE NOT k.exclusiva)
    INTO v_borrar, v_quedan
    FROM public._eliminar_tenant_cuentas(p_tenant_id) k;

  RETURN pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.jsonb_build_object('id', v_t.id, 'codigo', v_t.codigo, 'nombre_comercial', v_t.nombre_comercial,
                                            'estado', v_t.estado, 'fecha_baja', v_t.fecha_baja),
    'puede_eliminar', pg_catalog.jsonb_array_length(v_bloqueos) = 0,
    'bloqueos', v_bloqueos,
    'resumen', public._eliminar_tenant_resumen(v_tablas, v_borrar, v_quedan, pg_catalog.jsonb_array_length(v_archivos)),
    'tablas', v_tablas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_tenant_vista_previa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_tenant_vista_previa(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 5) Eliminar
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eliminar_tenant(
  p_tenant_id    uuid,
  p_motivo       text,
  p_operador     uuid,
  p_confirmacion text,
  p_ip           inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t            record;
  v_bloqueos     jsonb;
  v_archivos     jsonb;
  v_sql          text;
  v_borradas     jsonb;
  v_auditoria    bigint;
  v_contacto     jsonb;
  v_suscripciones jsonb;
  v_pagos        jsonb;
  v_plan         text;
  v_cuentas      uuid[];
  v_n_compartidas integer;
  v_u            uuid;
  v_n_cuentas    integer := 0;
  v_conservadas  jsonb := '[]'::jsonb;
  v_resumen      jsonb;
  v_resto        text;
  r              record;
  v_queda        boolean;
BEGIN
  IF p_confirmacion IS DISTINCT FROM 'ELIMINAR' THEN
    RAISE EXCEPTION 'CONFIRMACION_INVALIDA: hay que escribir ELIMINAR.';
  END IF;
  IF p_motivo IS NULL OR pg_catalog.length(pg_catalog.btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO: escribe el motivo (10 caracteres o más).';
  END IF;
  IF p_operador IS NULL THEN
    RAISE EXCEPTION 'OPERADOR_REQUERIDO: falta quién elimina.';
  END IF;

  -- La fila del negocio, bloqueada: una caja que quiera escribir algo suyo a la vez espera a
  -- que esto termine y entonces falla por llave foránea (el negocio ya no existe).
  SELECT t.* INTO v_t FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó).';
  END IF;

  v_bloqueos := public._eliminar_tenant_bloqueos(p_tenant_id);
  IF pg_catalog.jsonb_array_length(v_bloqueos) > 0 THEN
    RAISE EXCEPTION '%: %', v_bloqueos -> 0 ->> 'codigo', v_bloqueos -> 0 ->> 'mensaje';
  END IF;

  -- ── Lo que hay que saber ANTES de borrar ───────────────────────────────────────────────────
  v_archivos := public._eliminar_tenant_archivos(p_tenant_id);
  SELECT coalesce(pg_catalog.array_agg(k.usuario_id) FILTER (WHERE k.exclusiva), ARRAY[]::uuid[]),
         count(*) FILTER (WHERE NOT k.exclusiva)
    INTO v_cuentas, v_n_compartidas
    FROM public._eliminar_tenant_cuentas(p_tenant_id) k;

  SELECT p.codigo INTO v_plan FROM public.planes p WHERE p.id = v_t.plan_actual_id;

  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
           'nombre', nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', pf.nombre, pf.apellido_paterno, pf.apellido_materno)), ''),
           'email', u.email,
           'telefono', coalesce(nullif(pf.telefono, ''), nullif(u.phone, ''))))
    INTO v_contacto
    FROM auth.users u
    LEFT JOIN public.usuarios_perfil pf ON pf.id = u.id
   -- El dueño es `usuario_dueno_id`; los negocios dados de alta antes de esa columna lo tienen
   -- solo como el acceso con rol DUENO más antiguo.
   WHERE u.id = coalesce(v_t.usuario_dueno_id, (
           SELECT a.usuario_id
             FROM public.usuarios_acceso a
             JOIN public.roles ro ON ro.id = a.rol_id
            WHERE a.tenant_id = p_tenant_id AND ro.codigo = 'DUENO'
            ORDER BY a.created_at
            LIMIT 1));

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) - 'tenant_id' ORDER BY s.fecha_inicio), '[]'::jsonb)
    INTO v_suscripciones FROM public.suscripciones s WHERE s.tenant_id = p_tenant_id;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) - 'tenant_id' ORDER BY g.pagado_el, g.created_at), '[]'::jsonb)
    INTO v_pagos FROM public.pagos_suscripcion g WHERE g.tenant_id = p_tenant_id;

  -- ── La bitácora del negocio sobrevive ──────────────────────────────────────────────────────
  -- super_admin_accesos.tenant_id es una llave a tenants: las filas se quedan, sin la llave y
  -- con quién era en el payload.
  UPDATE public.super_admin_accesos a
     SET tenant_id = NULL,
         payload   = a.payload || pg_catalog.jsonb_build_object('tenant_eliminado', pg_catalog.jsonb_build_object(
                       'id', v_t.id, 'codigo', v_t.codigo, 'nombre_comercial', v_t.nombre_comercial))
   WHERE a.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_auditoria = ROW_COUNT;

  -- ── Borrar todo, en una sola sentencia ─────────────────────────────────────────────────────
  PERFORM pg_catalog.set_config('vim.eliminando_tenant', p_tenant_id::text, true);

  SELECT 'WITH '
         || pg_catalog.string_agg(pg_catalog.format('d%s AS (DELETE FROM public.%I WHERE tenant_id = $1 RETURNING 1)', q.n, q.relname), ', ' ORDER BY q.n)
         || ' SELECT coalesce(jsonb_object_agg(s.t, s.n) FILTER (WHERE s.n > 0), ''{}''::jsonb) FROM ('
         || pg_catalog.string_agg(pg_catalog.format('SELECT %L::text AS t, (SELECT count(*) FROM d%s) AS n', q.relname, q.n), ' UNION ALL ' ORDER BY q.n)
         || ') s'
    INTO v_sql
    FROM (
      SELECT c.relname, pg_catalog.row_number() OVER (ORDER BY c.relname) AS n
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p')
         -- La bitácora de plataforma se queda (arriba se le quitó la llave).
         AND c.relname <> 'super_admin_accesos'
    ) q;

  BEGIN
    EXECUTE v_sql INTO v_borradas USING p_tenant_id;
    DELETE FROM public.tenants t WHERE t.id = p_tenant_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Algo que NO es de este negocio apunta a una fila suya. No se adivina: se dice cuál.
    RAISE EXCEPTION 'QUEDAN_REFERENCIAS: %', SQLERRM
      USING HINT = 'Una fila de otro negocio o de una tabla sin tenant_id apunta a este cliente. No se borró nada.';
  END;

  PERFORM pg_catalog.set_config('vim.eliminando_tenant', '', true);

  -- ── Comprobación: no queda NADA con ese tenant_id, en ninguna tabla ───────────────────────
  v_resto := NULL;
  FOR r IN
    SELECT c.relname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id = $1)', r.relname)
      INTO v_queda USING p_tenant_id;
    IF v_queda THEN
      v_resto := pg_catalog.concat_ws(', ', v_resto, r.relname);
    END IF;
  END LOOP;
  IF v_resto IS NOT NULL THEN
    RAISE EXCEPTION 'QUEDAN_FILAS: siguen quedando filas del cliente en %. No se borró nada.', v_resto;
  END IF;

  -- ── Cuentas que solo eran de este negocio ──────────────────────────────────────────────────
  FOREACH v_u IN ARRAY v_cuentas LOOP
    BEGIN
      DELETE FROM auth.users u WHERE u.id = v_u;
      IF FOUND THEN v_n_cuentas := v_n_cuentas + 1; END IF;
    EXCEPTION WHEN foreign_key_violation THEN
      -- La cuenta sigue citada desde filas de OTRO negocio (un created_by, un mesero_id). Se
      -- queda, sin acceso a nada: ya no tiene fila en usuarios_acceso.
      v_conservadas := v_conservadas || pg_catalog.jsonb_build_object('usuario_id', v_u, 'motivo', 'REFERENCIADA_POR_OTRO_NEGOCIO');
    END;
  END LOOP;

  -- ── Lo que queda ───────────────────────────────────────────────────────────────────────────
  v_resumen := public._eliminar_tenant_resumen(
    v_borradas, v_n_cuentas, v_n_compartidas + pg_catalog.jsonb_array_length(v_conservadas),
    pg_catalog.jsonb_array_length(v_archivos));

  INSERT INTO public.tenants_eliminados (
    id, codigo, nombre_comercial, vertical_principal, plan_codigo, fecha_alta, fecha_baja, motivo_baja,
    eliminado_por, motivo, conteos, suscripciones, pagos_suscripcion, contacto)
  VALUES (
    v_t.id, v_t.codigo, v_t.nombre_comercial, v_t.vertical_principal::text, v_plan, v_t.fecha_alta, v_t.fecha_baja, v_t.motivo_baja,
    p_operador, pg_catalog.btrim(p_motivo),
    pg_catalog.jsonb_build_object('resumen', v_resumen, 'tablas', v_borradas),
    v_suscripciones, v_pagos, coalesce(v_contacto, '{}'::jsonb));

  -- La bitácora, en la MISMA transacción: una eliminación sin rastro no puede existir.
  INSERT INTO public.super_admin_accesos (super_admin_id, tenant_id, accion, motivo, payload, ip_address)
  VALUES (p_operador, NULL, 'tenant.eliminar', pg_catalog.btrim(p_motivo),
          pg_catalog.jsonb_build_object(
            'tenant_eliminado', pg_catalog.jsonb_build_object('id', v_t.id, 'codigo', v_t.codigo, 'nombre_comercial', v_t.nombre_comercial),
            'resumen', v_resumen,
            'cuentas_conservadas', v_conservadas,
            'archivos', pg_catalog.jsonb_array_length(v_archivos)),
          p_ip);

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'tenant', pg_catalog.jsonb_build_object('id', v_t.id, 'codigo', v_t.codigo, 'nombre_comercial', v_t.nombre_comercial),
    'resumen', v_resumen,
    'tablas', v_borradas,
    'bitacora_conservada', v_auditoria,
    'cuentas_conservadas', v_conservadas,
    -- El servidor del panel los borra por la API de Storage después de esta transacción.
    'archivos', v_archivos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) TO service_role;

COMMENT ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) IS
  'Elimina por completo un cliente CANCELADO sin CFDI timbrados (0144, ADR 0023). Solo service_role (panel de plataforma). Irreversible.';
