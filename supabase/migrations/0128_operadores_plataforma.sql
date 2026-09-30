-- 0128 — Operadores del panel de plataforma: una cuenta por persona (A8).
--
-- El panel interno (platform.vimpos.com.mx) se abría con UNA clave compartida. Con ella se
-- listan todos los negocios, se entra como cualquier dueño, se mueven planes y folios y se
-- publica el instalador de todas las cajas; y la bitácora atribuía todo al mismo UUID de sistema
-- (00000000-…-a1): no había forma de saber quién hizo qué, ni de quitarle el acceso a una persona
-- sin cambiarle la clave a todos.
--
-- Ahora cada operador es una cuenta de Supabase Auth con contraseña y segundo factor (TOTP), y
-- esta tabla dice quién de esas cuentas es operador. La clave compartida sigue sirviendo SOLO
-- mientras no haya ningún operador activado (`activado_at`): en cuanto el primero entra con su
-- segundo factor, deja de servir sola, sin tocar variables de entorno.
--
-- Sin políticas de RLS a propósito: solo el servidor del panel (service_role) la lee y escribe.

CREATE TABLE plataforma_operadores (
  usuario_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre         text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 80),
  activo         boolean NOT NULL DEFAULT true,
  -- Primera vez que entró con contraseña Y segundo factor. NULL = invitado que aún no termina.
  activado_at    timestamptz NULL,
  -- Quién lo invitó: un operador, o el UUID de sistema si fue con la clave compartida.
  invitado_por   uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  desactivado_at timestamptz NULL,
  CONSTRAINT desactivado_coherente CHECK (activo OR desactivado_at IS NOT NULL)
);

ALTER TABLE plataforma_operadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON plataforma_operadores FROM anon, authenticated;

COMMENT ON TABLE plataforma_operadores IS
  'Cuentas de VIM que entran al panel de plataforma (A8). Sin RLS policies: solo service_role. '
  'La clave compartida PLATFORM_PROVISION_KEY deja de servir en cuanto hay un operador activo con activado_at.';

-- La bitácora del panel exigía un negocio en cada registro, así que lo que no es de un negocio
-- (invitar o desactivar a un operador) no podía asentarse. `super_admin_id` pasa a ser el
-- operador real; el UUID de sistema queda para lo que se hizo con la clave compartida.
ALTER TABLE super_admin_accesos ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN super_admin_accesos.super_admin_id IS
  'usuario_id del operador (plataforma_operadores). 00000000-0000-0000-0000-0000000000a1 = clave compartida.';
