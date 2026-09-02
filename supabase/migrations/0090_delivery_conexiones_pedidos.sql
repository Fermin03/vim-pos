-- ============================================================================
-- 0090 — Integración con apps de delivery (ADR 0011): conexiones, pedidos, bitácora, credenciales.
--
-- `delivery_pedidos` vive aparte del ticket a propósito: un pedido puede llegar sin turno abierto,
-- puede rechazarse sin haber creado ticket, y guarda el JSON tal cual llegó para soporte y para
-- la conciliación contra lo que la app liquida.
-- `delivery_credenciales_app` NO tiene tenant_id: es el token de la aplicación de VIM (uno por app y
-- entorno). RLS activado sin políticas y sin GRANT a authenticated = solo service_role.
-- ============================================================================

CREATE TABLE delivery_conexiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  marca_virtual_id    uuid NULL REFERENCES marcas_virtuales(id),

  app                 modo_servicio NOT NULL,
  estado              varchar(20) NOT NULL DEFAULT 'SIN_CONECTAR',
  tienda_id_externo   text NULL,              -- store_id (Uber, uuid) / shop_id (DiDi) / rappiId
  tienda_nombre_app   text NULL,
  auto_aceptar        boolean NOT NULL DEFAULT true,
  tiempo_prep_min     integer NOT NULL DEFAULT 15 CHECK (tiempo_prep_min BETWEEN 1 AND 180),
  credencial_tienda   text NULL,              -- solo DiDi (F2): auth_token por tienda
  credencial_vence    timestamptz NULL,
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,   -- producto_generico_id, incremento_pct, webhooks_version…
  ultimo_evento_at    timestamptz NULL,
  ultimo_error        text NULL,
  conectada_at        timestamptz NULL,
  desconectada_at     timestamptz NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT delivery_conexion_app_valida CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  CONSTRAINT delivery_conexion_estado_valido CHECK (
    estado IN ('SIN_CONECTAR', 'PENDIENTE', 'ACTIVA', 'PAUSADA', 'ERROR', 'DESCONECTADA')),
  CONSTRAINT delivery_conexion_unica UNIQUE (sucursal_id, app)
);
-- El webhook enruta por el id de tienda de la app: debe ser único por app.
CREATE UNIQUE INDEX idx_delivery_conexion_tienda_externa
  ON delivery_conexiones(app, tienda_id_externo) WHERE tienda_id_externo IS NOT NULL;

CREATE TABLE delivery_pedidos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  conexion_id         uuid NOT NULL REFERENCES delivery_conexiones(id) ON DELETE RESTRICT,
  app                 modo_servicio NOT NULL,

  id_externo          text NOT NULL,           -- order_id de la app (string siempre)
  folio_corto         text NULL,               -- display_id / order_index: el que se grita en cocina
  estado              varchar(20) NOT NULL DEFAULT 'RECIBIDO',
  estado_app          text NULL,               -- state/status tal cual lo reporta la app
  tipo_entrega        varchar(25) NULL,        -- APP_REPARTE | RESTAURANTE_REPARTE | RECOGE_CLIENTE
  programado_para     timestamptz NULL,
  vence_aceptacion    timestamptz NULL,

  cliente_nombre      varchar(150) NULL,
  cliente_telefono    varchar(40) NULL,
  cliente_telefono_pin varchar(20) NULL,
  direccion_texto     text NULL,
  nota_cliente        text NULL,

  -- Ítems ya normalizados: [{producto_id, nombre_app, cantidad, precio_unitario_mxn, nota,
  --   modificadores:[{opcion_modificador_id, nombre_app, cantidad, precio_extra_mxn}]}]
  items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  items_sin_mapear    jsonb NULL,

  subtotal_mxn        numeric(12,2) NULL,
  descuento_app_mxn   numeric(12,2) NULL,
  descuento_tienda_mxn numeric(12,2) NULL,
  envio_mxn           numeric(12,2) NULL,
  propina_mxn         numeric(12,2) NULL,
  total_cliente_mxn   numeric(12,2) NULL,
  total_restaurante_mxn numeric(12,2) NULL,
  efectivo_a_cobrar_mxn numeric(12,2) NOT NULL DEFAULT 0,

  payload_raw         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ticket_id           uuid NULL REFERENCES tickets(id),

  repartidor_nombre   varchar(150) NULL,
  repartidor_telefono varchar(40) NULL,
  repartidor_estado   varchar(40) NULL,

  recibido_at         timestamptz NOT NULL DEFAULT now(),
  aceptado_at         timestamptz NULL,
  listo_at            timestamptz NULL,
  entregado_at        timestamptz NULL,
  cancelado_at        timestamptz NULL,
  motivo_cancelacion  text NULL,
  cancelado_por       varchar(20) NULL,        -- APP | RESTAURANTE | TIMEOUT
  ultimo_error        text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_pedido_app_valida CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  CONSTRAINT delivery_pedido_estado_valido CHECK (
    estado IN ('RECIBIDO', 'ACEPTADO', 'RECHAZADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO', 'EXPIRADO', 'ERROR')),
  CONSTRAINT delivery_pedido_unico UNIQUE (app, id_externo)
);
CREATE INDEX idx_delivery_pedidos_sucursal_activos
  ON delivery_pedidos(sucursal_id, recibido_at DESC)
  WHERE estado IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO');
CREATE INDEX idx_delivery_pedidos_ticket ON delivery_pedidos(ticket_id) WHERE ticket_id IS NOT NULL;

CREATE TABLE delivery_eventos (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT,   -- NULL si no se pudo enrutar
  conexion_id         uuid NULL REFERENCES delivery_conexiones(id),
  app                 modo_servicio NOT NULL,
  direccion           varchar(10) NOT NULL,     -- ENTRADA (webhook) | SALIDA (llamada nuestra)
  tipo                varchar(80) NOT NULL,     -- orders.notification, accept, deny…
  id_externo          text NULL,
  evento_id_externo   text NULL,                -- event_id de Uber: idempotencia
  firma_valida        boolean NULL,
  http_status         integer NULL,
  payload             jsonb NULL,
  respuesta           jsonb NULL,
  procesado           boolean NOT NULL DEFAULT false,
  error               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_evento_direccion_valida CHECK (direccion IN ('ENTRADA', 'SALIDA'))
);
CREATE UNIQUE INDEX idx_delivery_eventos_evento_externo
  ON delivery_eventos(app, evento_id_externo) WHERE evento_id_externo IS NOT NULL;
CREATE INDEX idx_delivery_eventos_pedido ON delivery_eventos(app, id_externo, created_at DESC);

CREATE TABLE delivery_credenciales_app (
  app                 modo_servicio NOT NULL,
  entorno             varchar(12) NOT NULL,      -- sandbox | produccion
  access_token        text NOT NULL,
  vence_at            timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app, entorno)
);

-- ---------------------------------------------------------------------------
-- RLS + grants (patrón 0078: GRANT explícito; RLS filtra por tenant).
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_credenciales_app ENABLE ROW LEVEL SECURITY;

-- Los privilegios por defecto de Supabase dan ALL a anon/authenticated sobre toda tabla nueva; aquí se
-- quitan y se vuelven a dar solo los necesarios. RLS sigue filtrando por tenant encima de esto.
REVOKE ALL ON delivery_conexiones, delivery_pedidos, delivery_eventos, delivery_credenciales_app FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON delivery_conexiones TO authenticated, service_role;
GRANT SELECT ON delivery_pedidos TO authenticated;                 -- el POS lee; escribe solo service_role
GRANT SELECT, INSERT, UPDATE ON delivery_pedidos TO service_role;
GRANT SELECT ON delivery_eventos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON delivery_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE delivery_eventos_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_credenciales_app TO service_role;

DO $$ BEGIN
  CREATE POLICY delivery_conexiones_select ON delivery_conexiones FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_conexiones_insert ON delivery_conexiones FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_conexiones_update ON delivery_conexiones FOR UPDATE
    USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_pedidos_select ON delivery_pedidos FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_eventos_select ON delivery_eventos FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- delivery_credenciales_app: sin políticas a propósito (deny-all para authenticated/anon).

-- Sello de updated_at (helper genérico de 0001).
CREATE TRIGGER trg_delivery_conexiones_updated BEFORE UPDATE ON delivery_conexiones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_delivery_pedidos_updated BEFORE UPDATE ON delivery_pedidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE delivery_conexiones IS 'Sucursal × app de delivery: id de tienda en la app, estado, auto-aceptar, config. ADR 0011.';
COMMENT ON TABLE delivery_pedidos IS 'Pedido recibido de una app (crudo + normalizado), enlazado al ticket cuando se acepta. ADR 0011.';
COMMENT ON TABLE delivery_eventos IS 'Bitácora de webhooks recibidos y llamadas hechas a las apps. Base de la tasa de éxito que exigen.';
COMMENT ON TABLE delivery_credenciales_app IS 'Token OAuth de la aplicación de VIM por app y entorno. Solo service_role.';
