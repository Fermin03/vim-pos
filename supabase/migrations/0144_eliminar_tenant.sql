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
--      Y un negocio que PUDO facturar (tiene sello, o alguna fila en tickets_cfdi) espera 15
--      minutos desde la baja: ver "TIMBRADOS EN VUELO".
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
--     Qué protege cada mitad, sin adornos:
--       · (b) cubre el SQL que corre con el rol de la sesión: una petición REST directa o una
--         función SECURITY INVOKER. Ahí `authenticated` no pasa aunque fije la variable.
--       · Dentro de CUALQUIER función SECURITY DEFINER, (b) es cierta siempre (el dueño no está
--         sujeto a RLS): ahí lo único que protege es (a). Por eso importa que nadie más escriba
--         la variable y que ninguna función al alcance del navegador fije variables con nombre
--         libre o borre reportes Z — pgTAP 0028 lo comprueba contra el catálogo, para que una
--         función futura que lo rompa ponga el CI en rojo.
--     No se desactiva ningún trigger, ni para esta sesión ni para las demás.
--   Los demás triggers de DELETE son recálculos AFTER (totales del ticket, costo de receta, uso
--   de promoción): corren al final de la sentencia, cuando su ticket ya no existe, y no hacen nada.
--
-- TIMBRADOS EN VUELO (A1)
--   Mientras un comprobante viaja al PAC su fila sigue en BORRADOR, y BORRADOR no impide
--   eliminar. Si se eliminara en esos segundos, el PAC devolvería un UUID sin fila donde
--   guardarlo: un CFDI válido en el SAT del que no queda registro. Dos capas:
--     1) timbrar-cfdi, timbrar-global y autofacturar se niegan con el negocio CANCELADO, al
--        entrar y otra vez justo antes de llamar al PAC (`_shared/pac/negocio.ts`).
--     2) Aquí: un negocio que pudo facturar no se elimina hasta 15 minutos después de su
--        `fecha_baja` (sin fecha no se puede probar, así que tampoco), ni mientras tenga un
--        borrador tocado en los últimos 15 minutos. Es más de lo que vive cualquier llamada que
--        hubiera pasado la comprobación 1 antes de la baja. Código `ESPERA_TIMBRADOS`.
--   Un negocio que nunca tuvo sello ni facturas no espera.
--
-- CUENTAS (auth.users)
--   Se borran en la misma transacción las cuentas que SOLO eran de este negocio: el dueño, los
--   empleados y las cuentas de dispositivo (`caja-<id>@dispositivos…`). "Solo" se decide contra
--   el catálogo, no contra una lista: se recorre TODA llave foránea a auth.users y la cuenta se
--   CONSERVA si alguna tabla tiene una fila suya que no sea de este negocio (de otro negocio, o
--   de plataforma). Importa porque varias de esas llaves son ON DELETE CASCADE
--   (permisos_personalizados, push_suscripciones, delivery_autorizaciones…): borrar la cuenta de
--   alguien que dejó filas en otro negocio se las llevaría en silencio, token de Uber incluido.
--   La decisión se toma DESPUÉS de borrar el negocio y con las filas de auth.users bloqueadas
--   (FOR UPDATE): nadie puede colgarle una fila nueva a la cuenta entre decidir y borrar.
--
-- ARCHIVOS
--   Borrar filas de `storage.objects` deja los archivos en el disco: los quita el servidor del
--   panel por la API de Storage DESPUÉS de esta transacción. La lista se guarda en
--   `tenants_eliminados.archivos_pendientes` dentro de la transacción: si el servidor se cae
--   entre el commit y el borrado, la lista no se pierde y se reintenta desde "Clientes
--   eliminados" (`marcar_archivos_eliminados` la va vaciando). Los nombres salen del id del
--   CFDI, nunca de `*_storage_path`: esas columnas las podía reescribir el negocio (0135, C1-3)
--   y con service_role sería borrar cualquier objeto de cualquier bucket.
--
-- TIEMPO (M4)
--   PostgREST corta a service_role a los 8 s. `eliminar_tenant` declara su propio
--   `statement_timeout` de 50 s (PostgREST aplica los ajustes de la función ANTES de llamarla,
--   que es la única forma de que cuenten), por debajo de los 60 s de la ruta del panel. Si se
--   agota, la transacción entera se revierte: no se borró nada.
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
  contacto           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- Objetos de Storage que faltan por borrar: [{bucket, nombre}]. Se llena en la transacción
  -- que elimina y se vacía con `marcar_archivos_eliminados` conforme el panel los borra.
  archivos_pendientes jsonb       NOT NULL DEFAULT '[]'::jsonb
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
-- fuera DEFINER respondería siempre por su dueño y la condición del rol no valdría nada.
--
-- Lo que la condición del rol NO hace: distinguir a `eliminar_tenant` de cualquier otra función
-- SECURITY DEFINER. Dentro de una de esas el rol es el dueño y la condición es cierta siempre;
-- ahí solo protege la variable. Ver "CÓMO PASA LAS GUARDAS DE DINERO" arriba y pgTAP 0028 §2c.
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

-- Las cuentas de auth que tocan a este negocio: sus accesos, su dueño y sus dispositivos.
CREATE OR REPLACE FUNCTION public._eliminar_tenant_cuentas_candidatas(p_tenant_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(pg_catalog.array_agg(DISTINCT k.usuario_id), ARRAY[]::uuid[])
    FROM (
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
    ) k
    JOIN auth.users u ON u.id = k.usuario_id;
$$;

-- De esas cuentas, cuáles se CONSERVAN y por qué (M1).
--
-- No hay lista de tablas: se recorre toda llave foránea a auth.users (cualquier regla de
-- borrado, cualquier esquema salvo `auth`, que es la cuenta misma) y se conserva la cuenta que
-- tenga alguna fila que NO sea de este negocio:
--   · tabla con tenant_id  → una fila con otro tenant_id, o con tenant_id NULL (de plataforma);
--   · `tenants`            → es dueña de otro negocio;
--   · tabla sin tenant_id  → cualquier fila (plataforma_operadores, y lo que venga).
-- Única excepción: `usuarios_perfil`, que es el perfil 1:1 de la propia cuenta y se va con ella.
--
-- Sirve antes de borrar (vista previa) y después (ahí ya no quedan filas del negocio, así que
-- "que no sea de este negocio" es "cualquiera").
CREATE OR REPLACE FUNCTION public._eliminar_tenant_cuentas_retenidas(p_tenant_id uuid, p_usuarios uuid[])
RETURNS TABLE (usuario_id uuid, motivo text, tabla text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  r           record;
  v_pendientes uuid[] := coalesce(p_usuarios, ARRAY[]::uuid[]);
  v_hallados  uuid[];
BEGIN
  FOR r IN
    SELECT k.conrelid::regclass::text AS tabla,
           n.nspname, c.relname, a.attname AS columna,
           EXISTS (SELECT 1 FROM pg_catalog.pg_attribute t
                    WHERE t.attrelid = k.conrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped) AS con_tenant
      FROM pg_catalog.pg_constraint k
      JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
     WHERE k.contype = 'f'
       AND k.confrelid = 'auth.users'::regclass
       AND pg_catalog.cardinality(k.conkey) = 1
       AND n.nspname <> 'auth'
       AND NOT (n.nspname = 'public' AND c.relname = 'usuarios_perfil')
     -- Primero las tres que tienen un motivo con nombre propio; el resto, por orden.
     ORDER BY CASE c.relname WHEN 'plataforma_operadores' THEN 1 WHEN 'usuarios_acceso' THEN 2 WHEN 'tenants' THEN 3 ELSE 4 END,
              c.relname, a.attname
  LOOP
    EXIT WHEN pg_catalog.cardinality(v_pendientes) = 0;
    EXECUTE pg_catalog.format(
      'SELECT coalesce(array_agg(DISTINCT x.%1$I), ARRAY[]::uuid[]) FROM %2$s x WHERE x.%1$I = ANY ($1) %3$s',
      r.columna, r.tabla,
      CASE WHEN r.con_tenant THEN 'AND x.tenant_id IS DISTINCT FROM $2'
           WHEN r.nspname = 'public' AND r.relname = 'tenants' THEN 'AND x.id <> $2'
           ELSE '' END)
      INTO v_hallados USING v_pendientes, p_tenant_id;

    IF pg_catalog.cardinality(v_hallados) > 0 THEN
      RETURN QUERY
        SELECT h, CASE WHEN r.nspname = 'public' AND r.relname = 'plataforma_operadores' THEN 'OPERADOR_DEL_PANEL'
                       WHEN r.nspname = 'public' AND r.relname = 'usuarios_acceso' THEN 'ACCESO_A_OTRO_NEGOCIO'
                       WHEN r.nspname = 'public' AND r.relname = 'tenants' THEN 'DUENO_DE_OTRO_NEGOCIO'
                       ELSE 'REFERENCIADA_POR_OTRO_NEGOCIO' END,
               r.tabla
          FROM pg_catalog.unnest(v_hallados) h;
      v_pendientes := ARRAY(SELECT u FROM pg_catalog.unnest(v_pendientes) u WHERE u <> ALL (v_hallados));
    END IF;
  END LOOP;
END;
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
  -- Lo que tiene que haber pasado desde la baja (y desde el último borrador tocado) para dar por
  -- muerto cualquier timbrado en vuelo. Las funciones que timbran viven segundos; 15 minutos es
  -- holgura, no cálculo fino.
  c_espera  CONSTANT interval := interval '15 minutes';
  v_estado  text;
  v_baja    timestamptz;
  v_ultimo  timestamptz;
  v_falta   interval;
  v_res     jsonb := '[]'::jsonb;
BEGIN
  SELECT t.estado::text, t.fecha_baja INTO v_estado, v_baja FROM public.tenants t WHERE t.id = p_tenant_id;
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
  ELSIF v_estado = 'CANCELADO'
        AND (EXISTS (SELECT 1 FROM public.tickets_cfdi c WHERE c.tenant_id = p_tenant_id)
             OR EXISTS (SELECT 1 FROM public.tenant_cfdi_emisor e
                         WHERE e.tenant_id = p_tenant_id
                           AND (e.csd_numero_certificado IS NOT NULL OR e.rfc_verificado IS NOT NULL))) THEN
    -- Pudo facturar: puede haber un timbrado en vuelo (su fila sigue en BORRADOR mientras el
    -- PAC contesta). Ver "TIMBRADOS EN VUELO" en la cabecera.
    SELECT pg_catalog.max(GREATEST(c.created_at, c.updated_at, coalesce(c.ultimo_intento_at, c.created_at)))
      INTO v_ultimo
      FROM public.tickets_cfdi c
     WHERE c.tenant_id = p_tenant_id AND c.estado_sat::text = 'BORRADOR';

    IF v_baja IS NULL THEN
      v_res := v_res || pg_catalog.jsonb_build_object(
        'codigo', 'ESPERA_TIMBRADOS', 'espera_min', 15,
        'mensaje', 'Este cliente podía facturar y no tiene fecha de baja: no se puede saber si ya pasaron 15 minutos. Vuelve a cancelarlo y espera 15 minutos.');
    ELSE
      v_falta := GREATEST(v_baja, coalesce(v_ultimo, v_baja)) + c_espera - pg_catalog.clock_timestamp();
      IF v_falta > interval '0' THEN
        v_res := v_res || pg_catalog.jsonb_build_object(
          'codigo', 'ESPERA_TIMBRADOS',
          'espera_min', pg_catalog.ceil(extract(epoch FROM v_falta) / 60.0)::int,
          'mensaje', pg_catalog.format(
            CASE WHEN v_ultimo IS NOT NULL AND v_ultimo > v_baja
                 THEN 'Tiene una factura en borrador de hace menos de 15 minutos: puede estar timbrándose. Espera %s min.'
                 ELSE 'Este cliente podía facturar y se dio de baja hace menos de 15 minutos: puede haber un timbrado en curso. Espera %s min.' END,
            pg_catalog.ceil(extract(epoch FROM v_falta) / 60.0)::int));
      END IF;
    END IF;
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
    '_eliminar_tenant_inventario(uuid)', '_eliminar_tenant_cuentas_candidatas(uuid)',
    '_eliminar_tenant_cuentas_retenidas(uuid, uuid[])', '_eliminar_tenant_archivos(uuid)',
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
SET statement_timeout = '30s'
AS $$
DECLARE
  v_t        record;
  v_bloqueos jsonb;
  v_tablas   jsonb;
  v_archivos jsonb;
  v_cuentas  uuid[];
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
  v_cuentas  := public._eliminar_tenant_cuentas_candidatas(p_tenant_id);
  SELECT count(*) INTO v_quedan FROM public._eliminar_tenant_cuentas_retenidas(p_tenant_id, v_cuentas);
  v_borrar   := pg_catalog.cardinality(v_cuentas) - v_quedan;

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
-- PostgREST aplica este ajuste ANTES de llamar a la función (si no, valdrían los 8 s del rol).
-- Por debajo de los 60 s de la ruta del panel: si se agota, se revierte todo y la ruta alcanza a
-- contestar "no se borró nada".
SET statement_timeout = '50s'
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
  v_retenidas    uuid[];
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
  -- Las cuentas que TOCAN al negocio. Cuáles se borran se decide después de borrarlo, con sus
  -- filas bloqueadas (más abajo).
  v_cuentas := public._eliminar_tenant_cuentas_candidatas(p_tenant_id);

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
  -- Se bloquean primero: colgarle una fila nueva a una de estas cuentas exige un bloqueo que
  -- choca con este, así que entre decidir y borrar nadie puede añadirle nada (M1).
  PERFORM 1 FROM auth.users u WHERE u.id = ANY (v_cuentas) ORDER BY u.id FOR UPDATE;

  -- Del negocio ya no queda nada: cualquier fila que todavía cite a una cuenta es de OTRO negocio
  -- o de plataforma, y esa cuenta se conserva (borrarla arrastraría esas filas por CASCADE).
  SELECT coalesce(pg_catalog.array_agg(k.usuario_id), ARRAY[]::uuid[]),
         coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('usuario_id', k.usuario_id, 'motivo', k.motivo, 'tabla', k.tabla)), '[]'::jsonb)
    INTO v_retenidas, v_conservadas
    FROM public._eliminar_tenant_cuentas_retenidas(p_tenant_id, v_cuentas) k;

  FOREACH v_u IN ARRAY v_cuentas LOOP
    CONTINUE WHEN v_u = ANY (v_retenidas);
    BEGIN
      DELETE FROM auth.users u WHERE u.id = v_u;
      IF FOUND THEN v_n_cuentas := v_n_cuentas + 1; END IF;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Red de seguridad: una llave que el recorrido no cubre (de varias columnas, o de un
      -- esquema que no es nuestro). La cuenta se queda; sin acceso a nada.
      v_conservadas := v_conservadas || pg_catalog.jsonb_build_object('usuario_id', v_u, 'motivo', 'REFERENCIADA_POR_OTRO_NEGOCIO');
    END;
  END LOOP;

  -- ── Lo que queda ───────────────────────────────────────────────────────────────────────────
  v_resumen := public._eliminar_tenant_resumen(
    v_borradas, v_n_cuentas, pg_catalog.jsonb_array_length(v_conservadas),
    pg_catalog.jsonb_array_length(v_archivos));

  INSERT INTO public.tenants_eliminados (
    id, codigo, nombre_comercial, vertical_principal, plan_codigo, fecha_alta, fecha_baja, motivo_baja,
    eliminado_por, motivo, conteos, suscripciones, pagos_suscripcion, contacto, archivos_pendientes)
  VALUES (
    v_t.id, v_t.codigo, v_t.nombre_comercial, v_t.vertical_principal::text, v_plan, v_t.fecha_alta, v_t.fecha_baja, v_t.motivo_baja,
    p_operador, pg_catalog.btrim(p_motivo),
    pg_catalog.jsonb_build_object('resumen', v_resumen, 'tablas', v_borradas),
    v_suscripciones, v_pagos, coalesce(v_contacto, '{}'::jsonb), v_archivos);

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
    -- El servidor del panel los borra por la API de Storage después de esta transacción. La
    -- misma lista quedó en tenants_eliminados.archivos_pendientes, por si no llega a hacerlo.
    'archivos', v_archivos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) TO service_role;

COMMENT ON FUNCTION public.eliminar_tenant(uuid, text, uuid, text, inet) IS
  'Elimina por completo un cliente CANCELADO sin CFDI timbrados (0144, ADR 0023). Solo service_role (panel de plataforma). Irreversible.';

-- ---------------------------------------------------------------------------------------------
-- 6) Los archivos que el panel ya borró de Storage (M2)
-- ---------------------------------------------------------------------------------------------
-- El panel no escribe `tenants_eliminados` (solo la lee). Después de borrar por la API de
-- Storage llama aquí con la lista de los que NO pudo borrar; vacía = no queda nada pendiente.
-- Solo puede achicar la lista: lo que mande tiene que estar ya en ella.
CREATE OR REPLACE FUNCTION public.marcar_archivos_eliminados(p_id uuid, p_pendientes jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual jsonb;
BEGIN
  SELECT e.archivos_pendientes INTO v_actual FROM public.tenants_eliminados e WHERE e.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELIMINADO_NO_EXISTE: no hay un cliente eliminado con ese id.';
  END IF;
  IF p_pendientes IS NULL OR pg_catalog.jsonb_typeof(p_pendientes) <> 'array'
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_pendientes) x
                 WHERE pg_catalog.jsonb_typeof(x) <> 'object'
                    OR NOT (x ? 'bucket' AND x ? 'nombre')
                    OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_actual) a
                                    WHERE a ->> 'bucket' = x ->> 'bucket' AND a ->> 'nombre' = x ->> 'nombre')) THEN
    RAISE EXCEPTION 'ARCHIVOS_INVALIDOS: la lista de pendientes solo puede traer archivos que ya estaban pendientes.';
  END IF;
  UPDATE public.tenants_eliminados e SET archivos_pendientes = p_pendientes WHERE e.id = p_id;
  RETURN pg_catalog.jsonb_array_length(p_pendientes);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_archivos_eliminados(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_archivos_eliminados(uuid, jsonb) TO service_role;
