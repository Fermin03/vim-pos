-- 0285 · Código corto para vincular una caja
--
-- Antes, para vincular una caja había que teclear un correo sintético de ~66 caracteres
-- (caja-<uuid>@dispositivos.vimpos.com.mx) y una clave de 16. Ahora el panel da un código de 6
-- caracteres (K7M-4QX) que se canjea UNA vez, dentro de 15 minutos, en `canjear-codigo-caja`.
--
-- La contraseña del dispositivo NO se guarda aquí: se genera nueva al canjear el código (ver
-- `_shared/cuenta-dispositivo.ts`). Así, un código que nadie canjea no le cambia nada a una caja
-- que ya está en uso.
--
-- Una fila por caja como máximo: generar un código nuevo reemplaza al anterior.
--
-- Solo service_role: RLS sin políticas (deny-all). Las dos Edge Functions que la usan validan por
-- su cuenta quién llama. En el Postgres local de la caja la tabla existe y se queda vacía.

CREATE TABLE IF NOT EXISTS codigos_vinculacion_caja (
  caja_id    uuid PRIMARY KEY REFERENCES cajas(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo     text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z2-9]{6}$'),
  creado_por uuid NOT NULL,
  expira_en  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE codigos_vinculacion_caja ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON codigos_vinculacion_caja FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON codigos_vinculacion_caja TO service_role;
