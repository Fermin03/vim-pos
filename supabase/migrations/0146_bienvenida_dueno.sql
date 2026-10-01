-- ============================================================================
-- 0146 — Correo de bienvenida al dueño: una sola vez por negocio.
--
-- Cuando la cuenta del dueño queda confirmada —abrió el enlace del registro público o fijó su
-- contraseña tras la invitación de VIM— la Edge Function `correo-bienvenida` le manda un correo
-- con los primeros pasos, la descarga de la caja, el equipo que hace falta, cómo se paga y el
-- WhatsApp de soporte. Esta migración le da a esa función lo único que necesita de la base: una
-- marca que solo se puede reclamar UNA vez.
--
-- LA MARCA VIVE EN EL ONBOARDING, no en `tenants`. `tenants` viaja entero a cada caja por el pull
-- (ADR 0022): una fecha de correo no tiene por qué ir al disco del restaurante. El onboarding ya es
-- "cómo llegó este cliente" y no se sincroniza.
--
-- RECLAMAR ANTES DE ENVIAR. `reclamar_bienvenida` pone la fecha con un UPDATE condicionado a que
-- esté vacía: dos pestañas, un doble clic o un reintento chocan en el bloqueo de la fila y solo
-- uno se lleva 'RECLAMADA'. Si el correo no sale, la función llama `liberar_bienvenida` y el
-- siguiente intento puede mandarlo. Nunca dos correos; en el peor caso (la instancia muere a medio
-- envío), ninguno.
--
-- A QUIÉN NO SE LE MANDA. /establecer-acceso también recibe a quien restablece su contraseña, así
-- que sin una regla un cliente de hace un año recibiría una "bienvenida" el día que olvide la
-- suya. La regla va aquí, junto a la marca:
--   · solo negocios en prueba o activos (un INTERNO es de VIM; un suspendido o cancelado no está
--     llegando), y
--   · solo en sus primeros 30 días desde el alta (lo que dura la prueba).
-- Con eso ningún negocio que ya existía antes de esta migración y lleve más de un mes recibe nada.
-- ============================================================================

ALTER TABLE public.tenant_onboarding_estado
  ADD COLUMN IF NOT EXISTS bienvenida_enviada_at timestamptz NULL;

COMMENT ON COLUMN public.tenant_onboarding_estado.bienvenida_enviada_at IS
  'Cuándo se mandó (o se reclamó para mandar) el correo de bienvenida al dueño. NULL = no se ha mandado. Solo la escriben reclamar_bienvenida/liberar_bienvenida (0146).';

CREATE OR REPLACE FUNCTION public.reclamar_bienvenida(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Los días que un negocio cuenta como "recién llegado": los mismos de la prueba (0141).
  c_dias_nuevo constant integer := 30;
  v_n          integer;
  v_marca      timestamptz;
BEGIN
  UPDATE public.tenant_onboarding_estado o
     SET bienvenida_enviada_at = now()
    FROM public.tenants t
   WHERE o.tenant_id = p_tenant_id
     AND t.id = o.tenant_id
     AND o.bienvenida_enviada_at IS NULL
     AND t.deleted_at IS NULL
     AND t.estado IN ('TRIAL', 'ACTIVO')
     AND t.fecha_alta >= now() - make_interval(days => c_dias_nuevo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN RETURN 'RECLAMADA'; END IF;

  SELECT o.bienvenida_enviada_at INTO v_marca
    FROM public.tenant_onboarding_estado o WHERE o.tenant_id = p_tenant_id;
  RETURN CASE WHEN v_marca IS NOT NULL THEN 'YA_ENVIADA' ELSE 'NO_APLICA' END;
END;
$$;
COMMENT ON FUNCTION public.reclamar_bienvenida(uuid) IS
  'Reclama el envío del correo de bienvenida de un negocio, una sola vez (0146). RECLAMADA = le toca a quien llamó; YA_ENVIADA; NO_APLICA = no es un negocio recién llegado (más de 30 días, interno, suspendido, cancelado o sin onboarding). Solo service_role.';
REVOKE ALL ON FUNCTION public.reclamar_bienvenida(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_bienvenida(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.liberar_bienvenida(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.tenant_onboarding_estado
     SET bienvenida_enviada_at = NULL
   WHERE tenant_id = p_tenant_id;
$$;
COMMENT ON FUNCTION public.liberar_bienvenida(uuid) IS
  'Suelta la marca del correo de bienvenida porque el envío falló, para que un reintento pueda mandarlo (0146). Solo service_role.';
REVOKE ALL ON FUNCTION public.liberar_bienvenida(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_bienvenida(uuid) TO service_role;
