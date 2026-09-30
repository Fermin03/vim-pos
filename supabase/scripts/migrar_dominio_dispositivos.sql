-- Mueve las cuentas de caja de `@dispositivos.vimpos.mx` a `@dispositivos.vimpos.com.mx`.
--
-- NO es una migración: se corre UNA vez, a mano, contra producción, y solo cuando todas las cajas
-- vinculadas corren 0.4.97 o más. Esas versiones, si la nube rechaza su correo, prueban el del
-- otro dominio con la misma contraseña y guardan el bueno (desktop/src/dispositivo.mjs). Una caja
-- anterior NO sabe hacerlo: se quedaría sin sincronizar hasta que alguien la vuelva a vincular.
-- Por eso el bloque se niega a correr si queda alguna, y dice cuál.
--
-- Por qué: `vimpos.mx` no es de VIM y nadie lo tiene registrado. Quien lo registrara podría pedir
-- el restablecimiento de contraseña de una caja y recibirlo. `dispositivos.vimpos.com.mx` no tiene
-- MX: un correo a esas cuentas no llega a ningún lado, que es lo correcto.
--
-- Uso:  npx supabase db query --linked -f supabase/scripts/migrar_dominio_dispositivos.sql
-- Es idempotente: una segunda pasada no encuentra nada que mover.

DO $$
DECLARE
  v_atrasadas text;
  v_movidas int;
BEGIN
  -- Cajas con cuenta en el dominio viejo cuya última versión reportada es anterior a 0.4.97
  -- (o que nunca reportaron: anteriores a 0.4.60, o nunca encendidas).
  SELECT string_agg(format('%s · %s (%s)', t.nombre_comercial, c.nombre, coalesce(c.version_app, 'sin reportar')), '; ')
    INTO v_atrasadas
    FROM auth.users u
    JOIN public.cajas c ON c.id::text = substring(lower(u.email) FROM '^caja-([0-9a-f-]{36})@dispositivos\.vimpos\.mx$')
    JOIN public.tenants t ON t.id = c.tenant_id
   WHERE lower(u.email) LIKE 'caja-%@dispositivos.vimpos.mx'
     AND (c.version_app IS NULL
          OR string_to_array(regexp_replace(c.version_app, '[^0-9.].*$', ''), '.')::int[] < ARRAY[0,4,97]);

  IF v_atrasadas IS NOT NULL THEN
    RAISE EXCEPTION 'No se movió nada. Estas cajas todavía no corren 0.4.97: %', v_atrasadas
      USING HINT = 'Actualízalas (o vuelve a vincularlas con credenciales nuevas) y corre el script otra vez.';
  END IF;

  UPDATE auth.identities i
     SET identity_data = jsonb_set(i.identity_data, '{email}',
           to_jsonb(replace(lower(i.identity_data->>'email'), '@dispositivos.vimpos.mx', '@dispositivos.vimpos.com.mx'))),
         updated_at = now()
    FROM auth.users u
   WHERE i.user_id = u.id
     AND i.provider = 'email'
     AND lower(u.email) LIKE 'caja-%@dispositivos.vimpos.mx';

  UPDATE auth.users
     SET email = replace(lower(email), '@dispositivos.vimpos.mx', '@dispositivos.vimpos.com.mx'),
         updated_at = now()
   WHERE lower(email) LIKE 'caja-%@dispositivos.vimpos.mx';
  GET DIAGNOSTICS v_movidas = ROW_COUNT;

  RAISE NOTICE 'Cuentas de caja movidas a dispositivos.vimpos.com.mx: %', v_movidas;
END $$;

SELECT email FROM auth.users WHERE lower(email) LIKE 'caja-%@dispositivos.%' ORDER BY 1;
