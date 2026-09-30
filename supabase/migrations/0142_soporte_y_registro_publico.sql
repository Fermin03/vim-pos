-- ============================================================================
-- 0142 · Llegada del cliente: soporte por WhatsApp configurable y registro público con términos
--        aceptados. ADR 0022.
--
-- Tres piezas, todas aditivas:
--
--   A. `plataforma_soporte` — una fila con el WhatsApp, el horario y el correo de soporte de VIM.
--      La edita solo el panel de plataforma (service_role, auditado ahí). La lee cualquier usuario
--      con sesión de un negocio —cajeros incluidos— por `soporte_plataforma()`. Mismo patrón que
--      `plataforma_datos_pago` (0141), pero SIN restringir a dueño/admin: quien más necesita el
--      número es el cajero frente a una caja que no cobra.
--
--   B. `resolver_directivas` lleva además `soporte`. Así el dato viaja a la caja de escritorio en
--      cada latido y ella lo guarda en su `directivas.json`: una caja sin internet sigue enseñando
--      el número vigente (el último que recibió), y sin nada guardado usa el de fábrica. El POS web
--      lo lee por la RPC. Es la copia de 0108 con una llave más; nada de lo que ya devolvía cambia.
--
--   C. Registro público (signup-tenant): la aceptación de los términos y la ciudad se guardan en
--      `tenant_onboarding_estado` (no en `tenants`, que viaja entero a la caja por el pull), y
--      `alta_autoservicio()` hace el alta y la aceptación en UNA transacción: no puede quedar un
--      negocio dado de alta por el registro público sin constancia de que aceptó.
--
-- SEGURO EN EL ESCRITORIO. La caja aplica estas migraciones en su Postgres embebido: la tabla se
-- crea con la fila de fábrica, `resolver_directivas` allí no la llama nadie (las directivas le
-- llegan de la nube) y `alta_autoservicio` no se usa. Nada de storage ni de auth.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- A. Soporte de VIM
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plataforma_soporte (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Dígitos con lada de país (52…), como lo pide wa.me. Obligatorio: sin número no hay soporte.
  whatsapp    text NOT NULL CHECK (whatsapp ~ '^[0-9]{10,15}$'),
  horario     text NULL CHECK (horario IS NULL OR length(btrim(horario)) BETWEEN 2 AND 80),
  correo      text NULL CHECK (correo IS NULL OR (length(correo) <= 254 AND correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NULL
);
COMMENT ON TABLE public.plataforma_soporte IS
  'Canal de soporte de VIM (una fila). Escribe solo el panel de plataforma; se lee por soporte_plataforma() y viaja a la caja en las directivas (0142).';
ALTER TABLE public.plataforma_soporte ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role
REVOKE ALL ON public.plataforma_soporte FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plataforma_soporte TO service_role;

-- El número oficial de VIM (público, de negocio). Espejo: WHATSAPP_SOPORTE_VIM en @vim/db/soporte.
INSERT INTO public.plataforma_soporte (id, whatsapp, horario, correo)
VALUES (true, '525665083346', '9:00 a 18:00', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.soporte_plataforma()
RETURNS TABLE (whatsapp text, horario text, correo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Cualquier sesión de un negocio (dueño, admin, cajero, dispositivo). Sin tenant, nada.
  SELECT s.whatsapp, s.horario, s.correo
    FROM public.plataforma_soporte s
   WHERE s.id
     AND public.current_tenant_id() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.soporte_plataforma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soporte_plataforma() TO authenticated, service_role;
COMMENT ON FUNCTION public.soporte_plataforma() IS
  'WhatsApp, horario y correo de soporte de VIM para cualquier usuario con tenant en el JWT (0142).';


-- ────────────────────────────────────────────────────────────────────────────
-- B. Las directivas llevan el soporte (copia de 0108 + `soporte`)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolver_directivas(p_tenant uuid, p_caja uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado    text;
  v_desde     timestamptz;
  v_mensaje   text;
  v_bloqueado boolean;
  v_avisos    jsonb;
  v_version   jsonb := '{}'::jsonb;
  v_soporte   jsonb;
  v_rec       record;
  v_min       record;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  -- Solo los campos que el cajero necesita ver: `created_at` y el orden sirven para ordenar y no
  -- viajan a la caja.
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'id', x.id, 'nivel', x.nivel, 'titulo', x.titulo, 'cuerpo', x.cuerpo,
             'requiere_confirmacion', x.requiere_confirmacion, 'vigente_hasta', x.vigente_hasta)
             ORDER BY x.orden, x.created_at DESC),
           '[]'::jsonb)
    INTO v_avisos
    FROM (
      SELECT a.id, a.nivel, a.titulo, a.cuerpo, a.requiere_confirmacion, a.vigente_hasta,
             a.created_at,
             CASE a.nivel WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END AS orden
        FROM avisos_plataforma a
       WHERE a.deleted_at IS NULL
         AND (a.tenant_id = p_tenant OR a.tenant_id IS NULL)
         AND a.vigente_desde <= now()
         AND (a.vigente_hasta IS NULL OR a.vigente_hasta > now())
         -- Sin caja (POS web y admin) no hay acuse por caja: van todos los vigentes.
         AND (p_caja IS NULL OR NOT EXISTS (
               SELECT 1 FROM avisos_lecturas l WHERE l.aviso_id = a.id AND l.caja_id = p_caja))
       ORDER BY orden, a.created_at DESC
       LIMIT 10
    ) AS x;

  SELECT v.version, v.url, v.sha512, v.notas INTO v_rec
    FROM versiones_caja v WHERE v.publicada
   ORDER BY string_to_array(v.version, '.')::int[] DESC LIMIT 1;
  SELECT v.version, v.bloquea_bajo_minima, v.bloquea_desde INTO v_min
    FROM versiones_caja v WHERE v.es_minima LIMIT 1;

  IF v_rec.version IS NOT NULL OR v_min.version IS NOT NULL THEN
    v_version := jsonb_build_object(
      'recomendada', v_rec.version,
      'url',         v_rec.url,
      'sha512',      v_rec.sha512,
      'notas',       v_rec.notas,
      'minima',      v_min.version,
      -- Solo `true` cuando VIM lo encendió Y llegó la fecha. La caja no calcula esta parte.
      'bloquea_bajo_minima', COALESCE(v_min.bloquea_bajo_minima, false)
                             AND v_min.bloquea_desde IS NOT NULL
                             AND v_min.bloquea_desde <= now(),
      'bloquea_desde', v_min.bloquea_desde);
  END IF;

  -- Soporte de VIM (0142): la caja lo guarda y lo enseña aunque se quede sin internet.
  SELECT jsonb_build_object('whatsapp', s.whatsapp, 'horario', s.horario, 'correo', s.correo)
    INTO v_soporte
    FROM plataforma_soporte s WHERE s.id;

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    -- Solo los EFECTIVOS: a la caja no le sirve saber qué está permitido pero apagado.
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    -- Sin `del_plan` ni `excepcion`: esta última lleva el `motivo` interno de VIM (ver 0105).
    'limites', COALESCE(limites_efectivos(p_tenant) - 'del_plan' - 'excepcion', '{}'::jsonb),
    'avisos',  v_avisos,
    'version', v_version,
    'soporte', v_soporte
  );
END;
$$;
COMMENT ON FUNCTION resolver_directivas(uuid, uuid) IS
  'Paquete que la caja obedece: acceso (con gracia), módulos efectivos, límites, avisos, versión y soporte (ADR 0014, 0142).';
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- C. Registro público: términos aceptados y ciudad
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_onboarding_estado
  ADD COLUMN IF NOT EXISTS terminos_version       varchar(20) NULL
    CHECK (terminos_version IS NULL OR length(btrim(terminos_version)) BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS terminos_aceptados_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS terminos_aceptados_por uuid NULL,
  ADD COLUMN IF NOT EXISTS ciudad_registro        varchar(80) NULL
    CHECK (ciudad_registro IS NULL OR length(btrim(ciudad_registro)) BETWEEN 2 AND 80);
COMMENT ON COLUMN public.tenant_onboarding_estado.terminos_version IS
  'Versión de los términos y el aviso de privacidad que aceptó el dueño al registrarse (TERMINOS_VERSION en signup-tenant). NULL = alta hecha por VIM desde el panel (0142).';
COMMENT ON COLUMN public.tenant_onboarding_estado.terminos_aceptados_por IS
  'auth.users del dueño que aceptó. Sin FK a propósito: la constancia sobrevive aunque se borre la cuenta.';
COMMENT ON COLUMN public.tenant_onboarding_estado.ciudad_registro IS
  'Ciudad que dijo el dueño en el registro público. Aún no hay sucursal donde guardarla (0142).';

CREATE OR REPLACE FUNCTION public.alta_autoservicio(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_ciudad           varchar,
  p_terminos_version varchar
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  -- La función pública ya valida todo esto; aquí se repite lo que NO puede faltar, para que ni
  -- un error en la función ni una llamada directa con service_role dejen un alta sin constancia.
  IF p_terminos_version IS NULL OR btrim(p_terminos_version) = '' THEN
    RAISE EXCEPTION 'Faltan los términos aceptados' USING ERRCODE = '22023';
  END IF;
  IF p_telefono_owner IS NULL OR p_telefono_owner !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'El teléfono va en 10 dígitos' USING ERRCODE = '22023';
  END IF;
  IF p_ciudad IS NULL OR length(btrim(p_ciudad)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Falta la ciudad' USING ERRCODE = '22023';
  END IF;

  v_tenant := crear_tenant_con_owner(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner, p_telefono_owner,
    p_vertical, p_plan_codigo, 'TRIAL', 'Registro público (signup-tenant)');

  UPDATE tenant_onboarding_estado
     SET terminos_version       = btrim(p_terminos_version),
         terminos_aceptados_at  = now(),
         terminos_aceptados_por = p_owner_user_id,
         ciudad_registro        = btrim(p_ciudad),
         updated_at             = now()
   WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el onboarding del negocio recién creado';
  END IF;

  INSERT INTO auditoria_eventos (tenant_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload)
  VALUES (v_tenant, 'SISTEMA', 'tenant.terminos_aceptados', 'tenant', v_tenant,
          jsonb_build_object('version', btrim(p_terminos_version), 'usuario', p_owner_user_id));

  RETURN v_tenant;
END;
$$;
COMMENT ON FUNCTION public.alta_autoservicio(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, varchar, varchar) IS
  'Alta del registro público: crear_tenant_con_owner (TRIAL) + términos aceptados + ciudad, en una transacción. Solo service_role (0142).';
REVOKE ALL ON FUNCTION public.alta_autoservicio(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alta_autoservicio(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, varchar, varchar) TO service_role;
