-- ============================================================================
-- 0169 · Cobro con terminal integrada (Mercado Pago Point). ADR 0033.
--
-- La caja le manda el monto a la terminal y el resultado regresa al ticket. VIM es el integrador:
-- el restaurante autoriza su cuenta de Mercado Pago (OAuth) y cada cobro se hace con SU token.
--
-- Quién escribe: solo las Edge Functions (service_role). El admin y el POS leen lo de su negocio.
-- Los tokens del restaurante NO viven en ninguna tabla: van cifrados en Vault, con nombre
-- `terminal:<conexion_id>:access` / `:refresh`, y solo se alcanzan por las dos funciones de abajo.
-- Esta migración también corre en el Postgres de la caja, que no tiene Vault: por eso todo lo de
-- Vault va con EXECUTE dinámico (mismo cuidado que la 0097) y ahí simplemente no se usa.
-- ============================================================================

CREATE TABLE terminal_conexiones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  proveedor          varchar(20) NOT NULL DEFAULT 'MERCADO_PAGO',
  cuenta_id_externo  text NOT NULL,                 -- user_id de Mercado Pago del restaurante
  cuenta_nombre      text NULL,                     -- para distinguirlas en el admin si conecta varias
  de_prueba          boolean NOT NULL DEFAULT false,
  estado             varchar(15) NOT NULL DEFAULT 'ACTIVA',
  vence_at           timestamptz NULL,              -- cuándo vence el access token (180 días)
  ultimo_error       text NULL,
  conectada_at       timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_conexion_proveedor_valido CHECK (proveedor IN ('MERCADO_PAGO')),
  CONSTRAINT terminal_conexion_estado_valido CHECK (estado IN ('ACTIVA', 'ERROR', 'DESCONECTADA')),
  CONSTRAINT terminal_conexion_unica UNIQUE (tenant_id, proveedor, cuenta_id_externo)
);

-- Lo que el dueño decide por sucursal, y el reflejo de la sucursal en Mercado Pago.
CREATE TABLE terminal_config_sucursal (
  sucursal_id          uuid PRIMARY KEY REFERENCES sucursales(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  conexion_id          uuid NOT NULL REFERENCES terminal_conexiones(id) ON DELETE CASCADE,
  sucursal_id_externo  text NULL,                   -- id de la «store» en Mercado Pago
  latitud              numeric(9,6) NOT NULL,       -- Mercado Pago las exige para crear la sucursal
  longitud             numeric(9,6) NOT NULL,
  imprime_terminal     boolean NOT NULL DEFAULT true,
  espera_segundos      integer NOT NULL DEFAULT 180,
  propina_en_terminal  boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_config_espera_valida CHECK (espera_segundos BETWEEN 30 AND 10800),
  CONSTRAINT terminal_config_coordenadas_validas CHECK (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
);

-- Una caja de VIM = una «pos» de Mercado Pago = una terminal. La fila nace al crear la pos; la
-- terminal se liga a mano (QR en la app del restaurante) y se detecta después, por eso es NULL.
CREATE TABLE terminal_dispositivos (
  caja_id              uuid PRIMARY KEY REFERENCES cajas(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id          uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  conexion_id          uuid NOT NULL REFERENCES terminal_conexiones(id) ON DELETE CASCADE,
  caja_id_externo      text NOT NULL,               -- id de la «pos» en Mercado Pago
  terminal_id_externo  text NULL UNIQUE,            -- p. ej. NEWLAND_N950__N950NCB801293324
  modo                 varchar(12) NULL,            -- PDV | STANDALONE | UNDEFINED
  activa               boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Un intento de cobro. Su id ES la external_reference y la llave de idempotencia en Mercado Pago.
CREATE TABLE terminal_cobros (
  id                 uuid PRIMARY KEY,              -- lo genera la caja
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id        uuid NOT NULL REFERENCES sucursales(id),
  caja_id            uuid NOT NULL REFERENCES cajas(id),
  conexion_id        uuid NOT NULL REFERENCES terminal_conexiones(id),
  ticket_id          uuid NOT NULL,                 -- SIN llave foránea: el ticket de la caja puede no haber subido
  folio              text NULL,
  monto_mxn          numeric(12,2) NOT NULL,
  estado             varchar(12) NOT NULL DEFAULT 'EN_TERMINAL',
  detalle            text NULL,                     -- status_detail de Mercado Pago
  orden_id_externo   text NULL UNIQUE,
  pago_id_externo    text NULL,
  tipo_tarjeta       varchar(20) NULL,              -- credit_card | debit_card
  marca              varchar(30) NULL,
  mensualidades      integer NULL,
  referencia         text NULL,
  pagado_mxn         numeric(12,2) NULL,            -- lo que cobró la terminal (puede traer propina)
  reembolsado_mxn    numeric(12,2) NOT NULL DEFAULT 0,
  empleado_id        uuid NULL,
  confirmado_a_mano_por uuid NULL,                  -- quién autorizó con PIN un cobro en REVISAR
  aplicado_at        timestamptz NULL,              -- la caja ya lo metió al ticket
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_cobro_monto_positivo CHECK (monto_mxn > 0),
  CONSTRAINT terminal_cobro_estado_valido CHECK (
    estado IN ('EN_TERMINAL', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'VENCIDO', 'REVISAR', 'DEVUELTO'))
);
CREATE INDEX idx_terminal_cobros_caja_pendientes ON terminal_cobros(caja_id) WHERE estado = 'APROBADO' AND aplicado_at IS NULL;
CREATE INDEX idx_terminal_cobros_ticket ON terminal_cobros(ticket_id);

-- Bitácora cruda de avisos de Mercado Pago. Solo service_role.
CREATE TABLE terminal_eventos (
  id            bigserial PRIMARY KEY,
  orden_id_externo text NULL,                      -- sin UNIQUE: aplicar un aviso dos veces da lo mismo
  accion        text NOT NULL,
  cobro_id      uuid NULL,
  payload       jsonb NOT NULL,
  procesado_at  timestamptz NULL,
  error         text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS + grants (patrón 0090): se quita todo y se devuelve solo lectura al negocio.
-- ---------------------------------------------------------------------------
ALTER TABLE terminal_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_config_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON terminal_conexiones, terminal_config_sucursal, terminal_dispositivos, terminal_cobros, terminal_eventos
  FROM anon, authenticated;
GRANT SELECT ON terminal_conexiones, terminal_config_sucursal, terminal_dispositivos, terminal_cobros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON terminal_conexiones, terminal_config_sucursal, terminal_dispositivos,
  terminal_cobros, terminal_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE terminal_eventos_id_seq TO service_role;

CREATE POLICY terminal_conexiones_select ON terminal_conexiones FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY terminal_config_sucursal_select ON terminal_config_sucursal FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY terminal_dispositivos_select ON terminal_dispositivos FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY terminal_cobros_select ON terminal_cobros FOR SELECT USING (tenant_id = current_tenant_id());
-- terminal_eventos: sin políticas a propósito.

CREATE TRIGGER trg_terminal_conexiones_updated BEFORE UPDATE ON terminal_conexiones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terminal_config_sucursal_updated BEFORE UPDATE ON terminal_config_sucursal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terminal_dispositivos_updated BEFORE UPDATE ON terminal_dispositivos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terminal_cobros_updated BEFORE UPDATE ON terminal_cobros
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tokens del restaurante en Vault. Solo service_role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION terminal_guardar_tokens(p_conexion uuid, p_access text, p_refresh text, p_vence timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE par record; v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN RAISE EXCEPTION 'VAULT_NO_DISPONIBLE'; END IF;
  FOR par IN SELECT * FROM (VALUES ('access', p_access), ('refresh', p_refresh)) AS t(cual, valor) LOOP
    EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1' INTO v_id USING format('terminal:%s:%s', p_conexion, par.cual);
    IF v_id IS NULL THEN
      EXECUTE 'SELECT vault.create_secret($1, $2)' USING par.valor, format('terminal:%s:%s', p_conexion, par.cual);
    ELSE
      EXECUTE 'SELECT vault.update_secret($1, $2)' USING v_id, par.valor;
    END IF;
  END LOOP;
  UPDATE terminal_conexiones SET vence_at = p_vence, estado = 'ACTIVA', ultimo_error = NULL WHERE id = p_conexion;
END $$;

CREATE OR REPLACE FUNCTION terminal_leer_tokens(p_conexion uuid)
RETURNS TABLE (access_token text, refresh_token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN RAISE EXCEPTION 'VAULT_NO_DISPONIBLE'; END IF;
  RETURN QUERY EXECUTE
    'SELECT max(decrypted_secret) FILTER (WHERE name = $1), max(decrypted_secret) FILTER (WHERE name = $2)
       FROM vault.decrypted_secrets WHERE name IN ($1, $2)'
    USING format('terminal:%s:access', p_conexion), format('terminal:%s:refresh', p_conexion);
END $$;

CREATE OR REPLACE FUNCTION terminal_borrar_tokens(p_conexion uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN RETURN; END IF;
  EXECUTE 'DELETE FROM vault.secrets WHERE name IN ($1, $2)'
    USING format('terminal:%s:access', p_conexion), format('terminal:%s:refresh', p_conexion);
END $$;

REVOKE ALL ON FUNCTION terminal_guardar_tokens(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION terminal_leer_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION terminal_borrar_tokens(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION terminal_guardar_tokens(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION terminal_leer_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION terminal_borrar_tokens(uuid) TO service_role;

COMMENT ON TABLE terminal_conexiones IS 'Cuenta de Mercado Pago que un restaurante autorizó. Los tokens viven en Vault. ADR 0033.';
COMMENT ON TABLE terminal_config_sucursal IS 'Qué cuenta usa cada sucursal y cómo cobra su terminal (comprobante, espera, propina). ADR 0033.';
COMMENT ON TABLE terminal_dispositivos IS 'Caja de VIM ↔ caja y terminal de Mercado Pago. Una caja, una terminal. ADR 0033.';
COMMENT ON TABLE terminal_cobros IS 'Intento de cobro en terminal; su id es la referencia en Mercado Pago. La caja lo aplica al ticket. ADR 0033.';
COMMENT ON TABLE terminal_eventos IS 'Avisos crudos de Mercado Pago, para diagnóstico. ADR 0033.';
