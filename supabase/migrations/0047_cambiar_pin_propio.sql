-- 0047 — C2: el propio cajero cambia su PIN desde el POS (P-007).
-- Verifica el PIN ACTUAL antes de fijar el nuevo. El llamante se identifica por auth.uid()
-- (la sesión de empleado de pin-login tiene sub = usuario_id). SECURITY DEFINER + search_path fijo.

CREATE OR REPLACE FUNCTION public.cambiar_pin_propio(p_pin_actual text, p_pin_nuevo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp  -- 'extensions' para pgcrypto (crypt/gen_salt)
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF p_pin_nuevo !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN_INVALIDO'; END IF;
  IF p_pin_actual = p_pin_nuevo THEN RAISE EXCEPTION 'PIN_IGUAL'; END IF;

  SELECT pin_hash INTO v_hash FROM public.usuarios_perfil WHERE id = v_uid AND deleted_at IS NULL;
  IF v_hash IS NULL THEN RAISE EXCEPTION 'SIN_PIN'; END IF;
  IF crypt(p_pin_actual, v_hash) <> v_hash THEN RAISE EXCEPTION 'PIN_ACTUAL_INCORRECTO'; END IF;

  UPDATE public.usuarios_perfil
     SET pin_hash = crypt(p_pin_nuevo, gen_salt('bf')), updated_at = now()
   WHERE id = v_uid;
END $$;

-- Disponible para usuarios firmados (el cajero); fuera de anon (consistente con 0045).
REVOKE EXECUTE ON FUNCTION public.cambiar_pin_propio(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_pin_propio(text, text) TO authenticated, service_role;
