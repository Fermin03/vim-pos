-- 0010 — Verticales (mesas, cuentas abiertas, multi-marca, reservaciones, propinas). Fuente: 1D.
--
-- Transcripción EXACTA del doc 07-ARQUITECTURA-TECNICA-PARTE-1D.md (§3-§9 + ALTER aditivos).
-- Orden de dependencias: enums → tablas base (FKs cruzadas diferidas) → ALTER tickets →
--   FKs cruzadas → triggers/funciones → vistas → RLS.
--
-- Referencias externas (NO se redefinen aquí; viven en migraciones previas):
--   helpers current_tenant_id(), set_updated_at(), generar_folio()  → 0001 / 0003
--   tenants (0002), sucursales/cajas (0003), turnos (0005),
--   auditoria_eventos/autorizaciones_pin (0006),
--   areas_cocina/marcas_virtuales (0007), tickets/clientes + enums (0008),
--   auth.users (Supabase Auth).
--
-- NOTA sobre el FIX OBLIGATORIO de EXCLUDE (... WITH IS NOT DISTINCT FROM):
--   El doc 1D NO usa restricciones EXCLUDE. La unicidad de "una asignación activa por mesa"
--   y "una mesa principal por ticket" ya está modelada en el doc con índices únicos parciales
--   (idx_tickets_mesas_mesa_activa, idx_tickets_mesas_principal). No hubo ningún patrón
--   EXCLUDE que reemplazar; se transcriben los índices parciales tal cual.

-- ===========================================================================
-- §3.1 / §4.1 / §6.1 / §7.1 — Enums
-- ===========================================================================

-- Estado de la mesa en tiempo real
CREATE TYPE mesa_estado AS ENUM (
  'LIBRE',                        -- sin ticket activo
  'OCUPADA',                      -- ticket abierto asociado
  'RESERVADA',                    -- bloqueada por reservación próxima
  'EN_LIMPIEZA',                  -- entre ocupaciones (opcional, manual)
  'FUERA_DE_SERVICIO'             -- mesa dañada, no se usa
);

CREATE TYPE cuenta_abierta_estado AS ENUM (
  'ABIERTA',
  'CERRADA',                      -- se cobró el ticket asociado
  'CANCELADA'                     -- se canceló sin cobrar
);

CREATE TYPE reservacion_estado AS ENUM (
  'CONFIRMADA',                   -- creada y vigente
  'LLEGO',                        -- el cliente llegó, mesa ocupada
  'CANCELADA',                    -- cliente o restaurante canceló antes
  'NO_SHOW',                      -- hora pasó y no llegó
  'TERMINADA'                     -- visita completada (ticket cobrado)
);

CREATE TYPE reservacion_canal AS ENUM (
  'TELEFONO',
  'WHATSAPP',
  'WEB',
  'PRESENCIAL',                   -- cliente vino y reservó para más tarde
  'APP_INTERNA',                  -- app del cliente del restaurante
  'OTRO'
);

-- Método de reparto de propinas
CREATE TYPE propina_metodo_reparto AS ENUM (
  'POR_MESA_ATENDIDA',            -- cada mesero se queda con las propinas de los tickets donde aparece como mesero_id
  'POR_HORAS_TRABAJADAS',         -- se prorratea el total entre meseros del turno según horas
  'FONDO_COMUN',                  -- todo dividido en partes iguales entre meseros del turno
  'CUSTOM'                        -- distribución manual por el supervisor
);

-- Estado de la distribución del turno
CREATE TYPE propina_distribucion_estado AS ENUM (
  'PENDIENTE',                    -- calculada pero no entregada
  'ENTREGADA',                    -- mesero recibió su parte (efectivo)
  'CANCELADA'                     -- rara: ajuste posterior
);

-- ===========================================================================
-- §3.2 — Tabla secciones
-- ===========================================================================

CREATE TABLE secciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  nombre              varchar(80) NOT NULL,                   -- "Terraza", "Salón Principal", "Barra"
  descripcion         text NULL,

  -- ===== Configuración visual (UI) =====
  orden_visualizacion integer NOT NULL DEFAULT 0,
  color_hex           varchar(7) NULL,                        -- "#FF6B35"

  -- ===== Estado =====
  activa              boolean NOT NULL DEFAULT true,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id),

  CONSTRAINT nombre_seccion_unico UNIQUE (sucursal_id, nombre)
);

CREATE INDEX idx_secciones_sucursal_activas ON secciones(sucursal_id, orden_visualizacion)
  WHERE activa = true AND deleted_at IS NULL;

COMMENT ON TABLE secciones IS 'Secciones físicas del comedor para agrupar mesas (Terraza, Salón, Barra).';

-- ===========================================================================
-- §3.3 — Tabla mesas (FK a reservaciones diferida a §6.3)
-- ===========================================================================

CREATE TABLE mesas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  seccion_id          uuid NULL REFERENCES secciones(id) ON DELETE SET NULL,

  -- ===== Identidad =====
  numero              varchar(20) NOT NULL,                   -- "1", "T-5", "Barra-3"
  nombre              varchar(80) NULL,                       -- "Mesa de la ventana" (opcional)
  capacidad           integer NOT NULL DEFAULT 4 CHECK (capacidad > 0),

  -- ===== Estado actual =====
  estado              mesa_estado NOT NULL DEFAULT 'LIBRE',
  -- ticket activo se calcula via tabla puente tickets_mesas (no columna aquí)

  -- ===== Reservación próxima =====
  reservacion_actual_id uuid NULL,                            -- FK pospuesta a §6
  -- (Cuando estado='RESERVADA', apunta a la reservación que la bloquea.)

  -- ===== Configuración visual (UI futuro: layout drag&drop) =====
  posicion_x          numeric(8,2) NULL,                      -- coordenada en el layout
  posicion_y          numeric(8,2) NULL,
  forma               varchar(20) NULL DEFAULT 'RECTANGULAR', -- RECTANGULAR, REDONDA, CUADRADA

  -- ===== Configuración operativa =====
  activa              boolean NOT NULL DEFAULT true,
  permite_juntar      boolean NOT NULL DEFAULT true,          -- ¿se puede juntar con otra para grupos grandes?

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id),

  CONSTRAINT numero_mesa_unico UNIQUE (sucursal_id, numero),
  CONSTRAINT forma_valida CHECK (forma IN ('RECTANGULAR', 'REDONDA', 'CUADRADA', 'BARRA'))
);

CREATE INDEX idx_mesas_sucursal_estado ON mesas(sucursal_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_mesas_seccion ON mesas(seccion_id) WHERE seccion_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_mesas_activas ON mesas(sucursal_id, numero) WHERE activa = true AND deleted_at IS NULL;

COMMENT ON TABLE mesas IS 'Mesas físicas del comedor. estado se actualiza vía triggers desde tickets_mesas.';
COMMENT ON COLUMN mesas.permite_juntar IS 'Si true, esta mesa puede asociarse a un ticket que ya tiene otra mesa (juntar para grupos grandes).';

-- ===========================================================================
-- §3.4 — Tabla puente tickets_mesas
-- ===========================================================================

CREATE TABLE tickets_mesas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  mesa_id             uuid NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,

  -- ===== Designación =====
  es_mesa_principal   boolean NOT NULL DEFAULT true,
  -- (En juntar mesas, exactamente una es la principal. La cuenta se imprime en su número.)

  -- ===== Ciclo =====
  fecha_asignacion    timestamptz NOT NULL DEFAULT now(),
  fecha_liberacion    timestamptz NULL,                       -- cuando se cobró o transfirió
  motivo_liberacion   varchar(50) NULL,
  -- 'COBRADO', 'TRANSFERIDO_A_MESA_X', 'JUNTADA_LIBERADA', 'CANCELADO'

  -- ===== Auditoría de transferencia =====
  mesa_anterior_id    uuid NULL REFERENCES mesas(id),         -- si llegó por transferencia
  transferencia_motivo text NULL,
  transferencia_autorizacion_pin_id uuid NULL REFERENCES autorizaciones_pin(id),

  -- ===== Comunes =====
  client_id_local     varchar(64) NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

-- Solo una asignación activa por mesa (fecha_liberacion IS NULL)
CREATE UNIQUE INDEX idx_tickets_mesas_mesa_activa ON tickets_mesas(mesa_id)
  WHERE fecha_liberacion IS NULL;

-- Solo una mesa principal por ticket activo
CREATE UNIQUE INDEX idx_tickets_mesas_principal ON tickets_mesas(ticket_id)
  WHERE fecha_liberacion IS NULL AND es_mesa_principal = true;

CREATE INDEX idx_tickets_mesas_ticket ON tickets_mesas(ticket_id);
CREATE INDEX idx_tickets_mesas_activas ON tickets_mesas(mesa_id, fecha_asignacion DESC)
  WHERE fecha_liberacion IS NULL;
CREATE UNIQUE INDEX idx_tickets_mesas_client_id_local ON tickets_mesas(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE tickets_mesas IS 'Puente ticket↔mesa. En MVP, típicamente 1:1; preparada para juntar mesas (N:N).';
COMMENT ON COLUMN tickets_mesas.es_mesa_principal IS 'Exactamente una mesa principal por ticket activo. La cuenta se imprime con este número.';

-- ===========================================================================
-- §3.5 — Triggers en mesas y tickets_mesas
-- ===========================================================================

-- 3.5.1 set_updated_at en mesas
CREATE TRIGGER trg_mesas_updated_at
  BEFORE UPDATE ON mesas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_secciones_updated_at
  BEFORE UPDATE ON secciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.5.2 Sincronizar mesas.estado con tickets_mesas
CREATE OR REPLACE FUNCTION trg_tickets_mesas_sync_estado_mesa() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_estado_fiscal ticket_estado_fiscal;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Marcar mesa como OCUPADA (asumimos que el ticket está abierto o se va a abrir)
    UPDATE mesas SET estado = 'OCUPADA', updated_by = NEW.created_by
    WHERE id = NEW.mesa_id AND estado IN ('LIBRE', 'RESERVADA', 'EN_LIMPIEZA');

  ELSIF TG_OP = 'UPDATE' THEN
    -- Si se libera (fecha_liberacion pasó de NULL a no-NULL), marcar mesa como LIBRE
    IF OLD.fecha_liberacion IS NULL AND NEW.fecha_liberacion IS NOT NULL THEN
      -- Solo si no hay otro ticket_mesa activo en esa mesa
      IF NOT EXISTS (
        SELECT 1 FROM tickets_mesas
        WHERE mesa_id = NEW.mesa_id
          AND id <> NEW.id
          AND fecha_liberacion IS NULL
      ) THEN
        UPDATE mesas SET estado = 'LIBRE', updated_by = NEW.created_by
        WHERE id = NEW.mesa_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_mesas_sync_estado
  AFTER INSERT OR UPDATE ON tickets_mesas
  FOR EACH ROW EXECUTE FUNCTION trg_tickets_mesas_sync_estado_mesa();

-- 3.5.3 Auditoría de transferencia
CREATE OR REPLACE FUNCTION trg_tickets_mesas_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.mesa_anterior_id IS NOT NULL THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.created_by, 'MESAS', 'mesa.transferida',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'mesa_anterior_id', NEW.mesa_anterior_id,
        'mesa_nueva_id', NEW.mesa_id,
        'motivo', NEW.transferencia_motivo,
        'autorizacion_pin_id', NEW.transferencia_autorizacion_pin_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_mesas_audit
  AFTER INSERT ON tickets_mesas
  FOR EACH ROW EXECUTE FUNCTION trg_tickets_mesas_audit();

-- ===========================================================================
-- §3.6 — ALTER tickets: agregar mesero_id (D56) — sobre tabla de 0008
-- ===========================================================================

-- D56: mesero asignado a ticket
ALTER TABLE tickets
  ADD COLUMN mesero_id uuid NULL REFERENCES auth.users(id);

CREATE INDEX idx_tickets_mesero ON tickets(mesero_id, dia_contable DESC)
  WHERE mesero_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN tickets.mesero_id IS 'Mesero asignado al ticket (Full Service). NULL en QS, FoodTruck, DK, delivery.';

-- ===========================================================================
-- §4.2 — Tabla cuentas_abiertas (FK a tickets diferida a §4.3)
-- ===========================================================================

CREATE TABLE cuentas_abiertas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio propio
  folio_completo      varchar(50) NOT NULL,
  folio_consecutivo   bigint NOT NULL,

  -- ===== Identidad =====
  nombre_cuenta       varchar(100) NOT NULL,                  -- "Mesa 5", "Juan", "Cumpleaños Pedro"
  cliente_id          uuid NULL REFERENCES clientes(id),

  -- ===== Ticket principal =====
  ticket_principal_id uuid NULL,                              -- FK diferida (un ticket en estado ABIERTO)
  -- (Se llena al crear el primer item; mientras tanto, la cuenta existe pero sin ticket.)

  -- ===== Estado =====
  estado              cuenta_abierta_estado NOT NULL DEFAULT 'ABIERTA',
  fecha_apertura      timestamptz NOT NULL DEFAULT now(),
  fecha_cierre        timestamptz NULL,

  -- ===== Atribución =====
  usuario_apertura_id uuid NOT NULL REFERENCES auth.users(id),
  mesero_id           uuid NULL REFERENCES auth.users(id),    -- mesero asignado (igual que en tickets)

  -- ===== Notas =====
  nota                text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT folio_unico_cuenta UNIQUE (sucursal_id, folio_completo)
);

CREATE INDEX idx_cuentas_sucursal_estado ON cuentas_abiertas(sucursal_id, estado, fecha_apertura DESC);
CREATE INDEX idx_cuentas_turno ON cuentas_abiertas(turno_id) WHERE estado = 'ABIERTA';
CREATE INDEX idx_cuentas_ticket_principal ON cuentas_abiertas(ticket_principal_id)
  WHERE ticket_principal_id IS NOT NULL;
CREATE INDEX idx_cuentas_mesero ON cuentas_abiertas(mesero_id, fecha_apertura DESC)
  WHERE mesero_id IS NOT NULL;
CREATE UNIQUE INDEX idx_cuentas_client_id_local ON cuentas_abiertas(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

-- La FK al ticket se agrega después de §4.4 (ALTER tickets)

COMMENT ON TABLE cuentas_abiertas IS 'Cuentas que se acumulan a lo largo de la visita (Café & Bar). Un ticket principal por cuenta.';

-- ===========================================================================
-- §4.3 — ALTER tickets: agregar cuenta_abierta_id + FK cruzada
-- ===========================================================================

ALTER TABLE tickets
  ADD COLUMN cuenta_abierta_id uuid NULL REFERENCES cuentas_abiertas(id);

CREATE INDEX idx_tickets_cuenta_abierta ON tickets(cuenta_abierta_id)
  WHERE cuenta_abierta_id IS NOT NULL;

COMMENT ON COLUMN tickets.cuenta_abierta_id IS 'FK opcional a cuentas_abiertas. NULL en QS, FoodTruck, etc.';

-- Ahora sí, FK desde cuentas_abiertas.ticket_principal_id
ALTER TABLE cuentas_abiertas
  ADD CONSTRAINT fk_cuentas_ticket_principal
  FOREIGN KEY (ticket_principal_id) REFERENCES tickets(id);

-- ===========================================================================
-- §4.4 — Triggers en cuentas_abiertas
-- ===========================================================================

-- 4.4.1 Folio al INSERT
CREATE OR REPLACE FUNCTION trg_cuenta_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.folio_completo IS NULL THEN
    SELECT folio_completo, consecutivo INTO v_folio_row
    FROM generar_folio(NEW.sucursal_id, 'CUENTA_ABIERTA', NULL);
    NEW.folio_completo := v_folio_row.folio_completo;
    NEW.folio_consecutivo := v_folio_row.consecutivo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cuentas_folio
  BEFORE INSERT ON cuentas_abiertas
  FOR EACH ROW EXECUTE FUNCTION trg_cuenta_folio();

-- 4.4.2 set_updated_at
CREATE TRIGGER trg_cuentas_updated_at
  BEFORE UPDATE ON cuentas_abiertas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.4.3 Proteger folio
CREATE OR REPLACE FUNCTION trg_cuenta_proteger() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.folio_completo <> NEW.folio_completo THEN
      RAISE EXCEPTION 'cuentas_abiertas.folio_completo es inmutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cuentas_proteger
  BEFORE UPDATE ON cuentas_abiertas
  FOR EACH ROW EXECUTE FUNCTION trg_cuenta_proteger();

-- 4.4.4 Auto-cerrar cuenta cuando su ticket principal se paga
CREATE OR REPLACE FUNCTION trg_ticket_cerrar_cuenta() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.cuenta_abierta_id IS NOT NULL
     AND OLD.estado_fiscal <> NEW.estado_fiscal
     AND NEW.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO') THEN
    UPDATE cuentas_abiertas
    SET estado = CASE
          WHEN NEW.estado_fiscal = 'CANCELADO' THEN 'CANCELADA'::cuenta_abierta_estado
          ELSE 'CERRADA'::cuenta_abierta_estado
        END,
        fecha_cierre = COALESCE(NEW.fecha_pago, now()),
        updated_by   = NEW.updated_by
    WHERE id = NEW.cuenta_abierta_id
      AND estado = 'ABIERTA';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_cerrar_cuenta
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_cerrar_cuenta();

-- 4.4.5 Audit
CREATE OR REPLACE FUNCTION trg_cuenta_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, turno_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.turno_id, NEW.usuario_apertura_id,
      'CUENTAS', 'cuenta.abierta',
      'cuenta_abierta', NEW.id,
      jsonb_build_object(
        'folio', NEW.folio_completo,
        'nombre_cuenta', NEW.nombre_cuenta,
        'mesero_id', NEW.mesero_id
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, turno_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.turno_id, NEW.updated_by,
      'CUENTAS', 'cuenta.estado.cambio',
      'cuenta_abierta', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'ticket_id', NEW.ticket_principal_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cuentas_audit
  AFTER INSERT OR UPDATE ON cuentas_abiertas
  FOR EACH ROW EXECUTE FUNCTION trg_cuenta_audit();

-- ===========================================================================
-- §4.5 — Función abrir_cuenta()
-- ===========================================================================

CREATE OR REPLACE FUNCTION abrir_cuenta(
  p_sucursal_id        uuid,
  p_caja_id            uuid,
  p_turno_id           uuid,
  p_nombre_cuenta      varchar,
  p_mesero_id          uuid DEFAULT NULL,
  p_cliente_id         uuid DEFAULT NULL,
  p_client_id_local    varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid := current_tenant_id();
  v_existing_id uuid;
  v_cuenta_id   uuid;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM cuentas_abiertas
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  INSERT INTO cuentas_abiertas (
    tenant_id, sucursal_id, caja_id, turno_id,
    nombre_cuenta, cliente_id, mesero_id,
    usuario_apertura_id, client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_sucursal_id, p_caja_id, p_turno_id,
    p_nombre_cuenta, p_cliente_id, p_mesero_id,
    auth.uid(), p_client_id_local, auth.uid()
  ) RETURNING id INTO v_cuenta_id;

  RETURN v_cuenta_id;
END;
$$;

-- ===========================================================================
-- §4.6 — Función split_cuenta() — dividir entre N personas
-- ===========================================================================

CREATE OR REPLACE FUNCTION split_cuenta(
  p_cuenta_id              uuid,
  p_n_partes               integer,
  p_autorizacion_pin_id    uuid,
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id      uuid := current_tenant_id();
  v_cuenta         cuentas_abiertas%ROWTYPE;
  v_ticket_original tickets%ROWTYPE;
  v_nuevos_tickets uuid[] := ARRAY[]::uuid[];
  v_nuevo_id       uuid;
  v_i              integer;
  v_total_por_parte numeric(12,2);
BEGIN
  IF p_n_partes < 2 THEN
    RAISE EXCEPTION 'Split requiere al menos 2 partes (recibido: %)', p_n_partes;
  END IF;

  SELECT * INTO v_cuenta FROM cuentas_abiertas WHERE id = p_cuenta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta % no existe', p_cuenta_id;
  END IF;

  IF v_cuenta.estado <> 'ABIERTA' THEN
    RAISE EXCEPTION 'Solo se puede dividir una cuenta ABIERTA (estado actual: %)', v_cuenta.estado;
  END IF;

  IF v_cuenta.ticket_principal_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta no tiene ticket principal (no se le agregaron items)';
  END IF;

  SELECT * INTO v_ticket_original FROM tickets WHERE id = v_cuenta.ticket_principal_id;

  IF v_ticket_original.estado_fiscal <> 'ABIERTO' THEN
    RAISE EXCEPTION 'Solo se puede dividir un ticket ABIERTO (estado actual: %)', v_ticket_original.estado_fiscal;
  END IF;

  -- Calcular monto por parte
  v_total_por_parte := ROUND(v_ticket_original.total_mxn / p_n_partes, 2);

  -- Crear N tickets nuevos, cada uno con un item ficticio "Parte X de cuenta YYY"
  FOR v_i IN 1..p_n_partes LOOP
    -- Crear ticket nuevo asociado a la misma cuenta
    INSERT INTO tickets (
      tenant_id, sucursal_id, caja_id, turno_id,
      modo_servicio, cuenta_abierta_id, mesero_id,
      estado_fiscal, estado_cocina,
      fecha_apertura, usuario_apertura_id,
      nota_general, nota_imprime_en_comanda, nota_imprime_en_ticket,
      created_by
    ) VALUES (
      v_tenant_id, v_ticket_original.sucursal_id, v_ticket_original.caja_id, v_ticket_original.turno_id,
      v_ticket_original.modo_servicio, v_cuenta.id, v_ticket_original.mesero_id,
      'BORRADOR', 'SIN_ENVIAR',
      now(), p_usuario_solicitante_id,
      format('Split %s/%s de cuenta %s', v_i, p_n_partes, v_cuenta.folio_completo),
      false, true,
      p_usuario_solicitante_id
    ) RETURNING id INTO v_nuevo_id;

    -- Por simplicidad MVP: no se duplican items. Se agrega un "item virtual"
    -- vía la función agregar_item_a_ticket() con producto especial (a definir
    -- como producto fijo del catálogo SAT genérico, ej. "Consumo cuenta abierta").
    -- En la práctica el cajero ajusta items concretos manualmente si lo desea.

    v_nuevos_tickets := array_append(v_nuevos_tickets, v_nuevo_id);
  END LOOP;

  -- Cancelar el ticket original con devolución de los items
  -- (usar cancelar_ticket_pagado de 1C.2 NO aplica porque el ticket no está PAGADO).
  -- Para tickets ABIERTOS, cancelación directa:
  UPDATE tickets
  SET estado_fiscal = 'CANCELADO',
      updated_by    = p_usuario_solicitante_id
  WHERE id = v_ticket_original.id;

  -- Marcar cuenta como cerrada (el trigger normal hace esto, pero por claridad)
  UPDATE cuentas_abiertas
  SET estado       = 'CERRADA',
      fecha_cierre = now(),
      updated_by   = p_usuario_solicitante_id
  WHERE id = v_cuenta.id;

  -- Audit
  INSERT INTO auditoria_eventos (
    tenant_id, sucursal_id, turno_id, usuario_id, usuario_autorizo_id,
    categoria, evento_codigo,
    entidad_tipo, entidad_id, payload
  ) VALUES (
    v_tenant_id, v_ticket_original.sucursal_id, v_ticket_original.turno_id,
    p_usuario_solicitante_id, p_usuario_autorizo_id,
    'CUENTAS', 'cuenta.split',
    'cuenta_abierta', p_cuenta_id,
    jsonb_build_object(
      'ticket_original_id', v_ticket_original.id,
      'ticket_original_folio', v_ticket_original.folio_completo,
      'n_partes', p_n_partes,
      'total_original_mxn', v_ticket_original.total_mxn,
      'total_por_parte_mxn', v_total_por_parte,
      'tickets_generados', to_jsonb(v_nuevos_tickets),
      'autorizacion_pin_id', p_autorizacion_pin_id
    )
  );

  RETURN jsonb_build_object(
    'cuenta_id', p_cuenta_id,
    'ticket_original_cancelado', v_ticket_original.id,
    'nuevos_tickets', to_jsonb(v_nuevos_tickets),
    'total_original', v_ticket_original.total_mxn,
    'total_por_parte', v_total_por_parte
  );
END;
$$;

COMMENT ON FUNCTION split_cuenta IS 'Divide una cuenta abierta en N tickets equitativos. Cancela el ticket original. La distribución de items específicos se hace en capa de UI antes de cobrar.';

-- ===========================================================================
-- §5.1 — Tabla puente marcas_areas_cocina (DK)
-- ===========================================================================

CREATE TABLE marcas_areas_cocina (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  marca_virtual_id    uuid NOT NULL REFERENCES marcas_virtuales(id) ON DELETE CASCADE,
  area_cocina_id      uuid NOT NULL REFERENCES areas_cocina(id) ON DELETE CASCADE,

  -- ===== Configuración =====
  prioridad           integer NOT NULL DEFAULT 0,             -- en caso de que un producto pueda ir a varias áreas
  activa              boolean NOT NULL DEFAULT true,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT marca_area_unica UNIQUE (marca_virtual_id, area_cocina_id)
);

CREATE INDEX idx_marcas_areas_marca ON marcas_areas_cocina(marca_virtual_id) WHERE activa = true;
CREATE INDEX idx_marcas_areas_area ON marcas_areas_cocina(area_cocina_id) WHERE activa = true;

COMMENT ON TABLE marcas_areas_cocina IS 'Asignación de áreas de cocina por marca virtual (DK). Tabla puente N:N. Si una marca no tiene filas aquí, sirve a todas las áreas.';

CREATE TRIGGER trg_marcas_areas_updated_at
  BEFORE UPDATE ON marcas_areas_cocina
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- §6.2 — Tabla reservaciones
-- ===========================================================================

CREATE TABLE reservaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- Folio propio
  folio_completo      varchar(50) NOT NULL,
  folio_consecutivo   bigint NOT NULL,

  -- ===== Cliente =====
  cliente_id          uuid NULL REFERENCES clientes(id),
  cliente_nombre_snapshot varchar(150) NOT NULL,              -- para casos sin cliente_id (walk-in registration)
  cliente_telefono_snapshot varchar(20) NULL,
  cliente_email_snapshot varchar(255) NULL,

  -- ===== Detalles de la reserva =====
  fecha_hora_reserva  timestamptz NOT NULL,                   -- "el lunes 27 a las 8pm"
  duracion_estimada_minutos integer NOT NULL DEFAULT 90,
  comensales          integer NOT NULL CHECK (comensales > 0),

  -- Mesa preferida o asignada
  mesa_preferida_id   uuid NULL REFERENCES mesas(id),
  mesa_asignada_id    uuid NULL REFERENCES mesas(id),         -- al confirmar la llegada

  seccion_preferida_id uuid NULL REFERENCES secciones(id),

  -- ===== Solicitudes especiales =====
  nota                text NULL,                              -- "alergia a mariscos", "celebra cumpleaños"
  ocasion_especial    varchar(50) NULL,                       -- "CUMPLEAÑOS", "ANIVERSARIO", "NEGOCIOS", etc.

  -- ===== Canal =====
  canal               reservacion_canal NOT NULL,
  canal_referencia    varchar(100) NULL,                      -- ID de plataforma externa si vino vía OpenTable, etc.

  -- ===== Estado =====
  estado              reservacion_estado NOT NULL DEFAULT 'CONFIRMADA',
  fecha_llegada       timestamptz NULL,
  fecha_cancelacion   timestamptz NULL,
  motivo_cancelacion  text NULL,
  fecha_no_show_marcado timestamptz NULL,

  -- ===== Vinculación con ticket cuando llegan =====
  ticket_id           uuid NULL REFERENCES tickets(id),

  -- ===== Atribución =====
  usuario_creacion_id uuid NULL REFERENCES auth.users(id),
  usuario_confirmacion_llegada_id uuid NULL REFERENCES auth.users(id),

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id),

  CONSTRAINT folio_unico_reservacion UNIQUE (sucursal_id, folio_completo),
  CONSTRAINT llegada_requiere_fecha CHECK (
    estado <> 'LLEGO' OR fecha_llegada IS NOT NULL
  ),
  CONSTRAINT cancelacion_requiere_motivo_y_fecha CHECK (
    estado <> 'CANCELADA' OR (fecha_cancelacion IS NOT NULL AND motivo_cancelacion IS NOT NULL)
  )
);

CREATE INDEX idx_reservaciones_fecha ON reservaciones(sucursal_id, fecha_hora_reserva)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_reservaciones_estado ON reservaciones(sucursal_id, estado, fecha_hora_reserva DESC);
CREATE INDEX idx_reservaciones_cliente ON reservaciones(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_reservaciones_mesa_asignada ON reservaciones(mesa_asignada_id)
  WHERE mesa_asignada_id IS NOT NULL;
CREATE INDEX idx_reservaciones_proximas ON reservaciones(sucursal_id, fecha_hora_reserva)
  WHERE estado = 'CONFIRMADA' AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_reservaciones_client_id_local ON reservaciones(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE reservaciones IS 'Reservas con cliente, mesa preferida, ciclo de estados. MVP sin notificaciones automáticas.';

-- ===========================================================================
-- §6.3 — Completar FK en mesas.reservacion_actual_id
-- ===========================================================================

ALTER TABLE mesas
  ADD CONSTRAINT fk_mesas_reservacion_actual
  FOREIGN KEY (reservacion_actual_id) REFERENCES reservaciones(id);

-- ===========================================================================
-- §6.4 — Triggers en reservaciones
-- ===========================================================================

-- 6.4.1 Folio al INSERT
CREATE OR REPLACE FUNCTION trg_reservacion_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.folio_completo IS NULL THEN
    SELECT folio_completo, consecutivo INTO v_folio_row
    FROM generar_folio(NEW.sucursal_id, 'RESERVACION', NULL);
    NEW.folio_completo := v_folio_row.folio_completo;
    NEW.folio_consecutivo := v_folio_row.consecutivo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservaciones_folio
  BEFORE INSERT ON reservaciones
  FOR EACH ROW EXECUTE FUNCTION trg_reservacion_folio();

-- 6.4.2 set_updated_at
CREATE TRIGGER trg_reservaciones_updated_at
  BEFORE UPDATE ON reservaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6.4.3 Sincronizar estado de mesa con reservación
-- Cuando la reservación pasa a CONFIRMADA con mesa_asignada_id próxima (≤2h),
-- marcar la mesa como RESERVADA. Cuando pasa a LLEGÓ, la mesa pasa a OCUPADA.
CREATE OR REPLACE FUNCTION trg_reservacion_sync_mesa() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado = 'CONFIRMADA' AND NEW.mesa_asignada_id IS NOT NULL THEN
    UPDATE mesas
    SET estado = 'RESERVADA',
        reservacion_actual_id = NEW.id,
        updated_by = NEW.created_by
    WHERE id = NEW.mesa_asignada_id
      AND estado = 'LIBRE';

  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.estado IN ('CANCELADA', 'NO_SHOW', 'TERMINADA') THEN
      -- Liberar mesa si estaba reservada por esta
      UPDATE mesas
      SET estado = 'LIBRE',
          reservacion_actual_id = NULL,
          updated_by = NEW.updated_by
      WHERE id = NEW.mesa_asignada_id
        AND reservacion_actual_id = NEW.id
        AND estado = 'RESERVADA';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservaciones_sync_mesa
  AFTER INSERT OR UPDATE ON reservaciones
  FOR EACH ROW EXECUTE FUNCTION trg_reservacion_sync_mesa();

-- 6.4.4 Audit
CREATE OR REPLACE FUNCTION trg_reservacion_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.created_by, 'RESERVACIONES', 'reservacion.creada',
      'reservacion', NEW.id,
      jsonb_build_object(
        'folio', NEW.folio_completo,
        'fecha_hora', NEW.fecha_hora_reserva,
        'comensales', NEW.comensales,
        'cliente_nombre', NEW.cliente_nombre_snapshot,
        'canal', NEW.canal
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.updated_by, 'RESERVACIONES', 'reservacion.estado.cambio',
      'reservacion', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'motivo_cancelacion', NEW.motivo_cancelacion,
        'ticket_id', NEW.ticket_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservaciones_audit
  AFTER INSERT OR UPDATE ON reservaciones
  FOR EACH ROW EXECUTE FUNCTION trg_reservacion_audit();

-- ===========================================================================
-- §6.5 — Función confirmar_llegada_reservacion()
-- ===========================================================================

CREATE OR REPLACE FUNCTION confirmar_llegada_reservacion(
  p_reservacion_id  uuid,
  p_mesa_asignada_id uuid DEFAULT NULL,           -- si se confirma una mesa distinta a la preferida
  p_ticket_id       uuid DEFAULT NULL             -- ticket recién abierto, si se está abriendo en el mismo flujo
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_res reservaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM reservaciones WHERE id = p_reservacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservación % no existe', p_reservacion_id;
  END IF;

  IF v_res.estado <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'Solo reservaciones CONFIRMADAS aceptan llegada (estado: %)', v_res.estado;
  END IF;

  UPDATE reservaciones
  SET estado            = 'LLEGO',
      fecha_llegada     = now(),
      mesa_asignada_id  = COALESCE(p_mesa_asignada_id, mesa_asignada_id, mesa_preferida_id),
      ticket_id         = p_ticket_id,
      usuario_confirmacion_llegada_id = auth.uid(),
      updated_by        = auth.uid()
  WHERE id = p_reservacion_id;
END;
$$;

-- ===========================================================================
-- §7.2 — Tabla sucursal_propinas_config (D54)
-- ===========================================================================

CREATE TABLE sucursal_propinas_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,

  -- ===== Captura de propina (en el momento del cobro) =====
  capturar_propina            boolean NOT NULL DEFAULT true,
  porcentajes_sugeridos       integer[] NOT NULL DEFAULT ARRAY[10, 15, 20]::integer[],
  permitir_monto_libre        boolean NOT NULL DEFAULT true,
  permitir_sin_propina        boolean NOT NULL DEFAULT true,

  -- ===== Reparto =====
  metodo_reparto              propina_metodo_reparto NOT NULL DEFAULT 'POR_MESA_ATENDIDA',
  -- Si FONDO_COMUN o POR_HORAS, ¿se incluye al cajero/bartender además del mesero?
  incluir_cajero_en_fondo     boolean NOT NULL DEFAULT false,
  incluir_bartender_en_fondo  boolean NOT NULL DEFAULT false,
  -- Porcentaje de la propina total que va al fondo común vs el mesero que atendió
  -- (cuando hay split entre mesero individual y fondo)
  porcentaje_a_fondo_comun    integer NOT NULL DEFAULT 0 CHECK (porcentaje_a_fondo_comun BETWEEN 0 AND 100),

  -- ===== Distribución =====
  redondear_a_pesos           boolean NOT NULL DEFAULT true,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT propinas_config_sucursal_unica UNIQUE (sucursal_id)
);

COMMENT ON TABLE sucursal_propinas_config IS 'Configuración de propinas por sucursal. Una fila por sucursal. (D54)';

CREATE TRIGGER trg_propinas_config_updated_at
  BEFORE UPDATE ON sucursal_propinas_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- §7.3 — Tabla propinas_distribucion
-- ===========================================================================

CREATE TABLE propinas_distribucion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- ===== Mesero (o cajero/bartender si incluye_en_fondo) =====
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),
  rol_snapshot        varchar(30) NOT NULL,                   -- 'MESERO', 'CAJERO', 'BARTENDER'

  -- ===== Cálculo =====
  metodo_reparto_usado propina_metodo_reparto NOT NULL,
  monto_asignado_mxn  numeric(12,2) NOT NULL CHECK (monto_asignado_mxn >= 0),

  -- Para POR_HORAS_TRABAJADAS:
  horas_trabajadas    numeric(6,2) NULL,                      -- horas del mesero en este turno
  total_horas_turno   numeric(6,2) NULL,                      -- suma de horas de todos los meseros

  -- Para POR_MESA_ATENDIDA:
  tickets_atendidos   integer NULL,
  propinas_brutas_propias_mxn numeric(12,2) NULL,

  -- Para FONDO_COMUN:
  participantes_fondo integer NULL,

  -- ===== Entrega =====
  estado              propina_distribucion_estado NOT NULL DEFAULT 'PENDIENTE',
  fecha_entrega       timestamptz NULL,
  entregado_por_id    uuid NULL REFERENCES auth.users(id),

  -- ===== Notas =====
  nota                text NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT propina_distribucion_unica UNIQUE (turno_id, usuario_id)
);

CREATE INDEX idx_propinas_dist_turno ON propinas_distribucion(turno_id);
CREATE INDEX idx_propinas_dist_usuario ON propinas_distribucion(usuario_id, created_at DESC);
CREATE INDEX idx_propinas_dist_pendientes ON propinas_distribucion(sucursal_id, created_at DESC)
  WHERE estado = 'PENDIENTE';

COMMENT ON TABLE propinas_distribucion IS 'Cuánto le toca a cada mesero al cierre del turno. Una fila por mesero.';

-- ===========================================================================
-- §7.4 — Función calcular_distribucion_propinas() (D55)
-- ===========================================================================

CREATE OR REPLACE FUNCTION calcular_distribucion_propinas(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id      uuid := current_tenant_id();
  v_turno          turnos%ROWTYPE;
  v_config         sucursal_propinas_config%ROWTYPE;
  v_total_propinas numeric(12,2);
  v_total_a_fondo  numeric(12,2);
  v_total_individual numeric(12,2);
  v_mesero         record;
  v_n_meseros      integer;
  v_total_horas    numeric(6,2);
  v_participantes_fondo integer;
  v_resultado      jsonb := '[]'::jsonb;
  v_dist_id        uuid;
BEGIN
  -- Cargar turno y configuración
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe', p_turno_id;
  END IF;

  SELECT * INTO v_config FROM sucursal_propinas_config
  WHERE sucursal_id = v_turno.sucursal_id;

  IF NOT FOUND THEN
    -- Sucursal sin configuración: usar default POR_MESA_ATENDIDA
    v_config.metodo_reparto := 'POR_MESA_ATENDIDA';
    v_config.incluir_cajero_en_fondo := false;
    v_config.incluir_bartender_en_fondo := false;
    v_config.porcentaje_a_fondo_comun := 0;
    v_config.redondear_a_pesos := true;
  END IF;

  -- Calcular total de propinas del turno (sumar tickets PAGADO/FACTURADO del turno)
  SELECT COALESCE(SUM(propina_mxn), 0) INTO v_total_propinas
  FROM tickets
  WHERE turno_id = p_turno_id
    AND estado_fiscal IN ('PAGADO', 'FACTURADO')
    AND deleted_at IS NULL;

  IF v_total_propinas = 0 THEN
    RETURN jsonb_build_object(
      'turno_id', p_turno_id,
      'total_propinas_mxn', 0,
      'distribuciones', '[]'::jsonb,
      'mensaje', 'Sin propinas en el turno'
    );
  END IF;

  -- Split entre fondo común y mesero individual (según porcentaje_a_fondo_comun)
  v_total_a_fondo := ROUND(v_total_propinas * v_config.porcentaje_a_fondo_comun / 100.0, 2);
  v_total_individual := v_total_propinas - v_total_a_fondo;

  -- ===== Método POR_MESA_ATENDIDA =====
  IF v_config.metodo_reparto = 'POR_MESA_ATENDIDA' THEN
    -- Cada mesero recibe propinas de los tickets donde aparece como mesero_id
    FOR v_mesero IN
      SELECT
        t.mesero_id          AS usuario_id,
        COUNT(*)             AS tickets_count,
        SUM(t.propina_mxn)   AS propinas_brutas
      FROM tickets t
      WHERE t.turno_id = p_turno_id
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
        AND t.mesero_id IS NOT NULL
        AND t.deleted_at IS NULL
      GROUP BY t.mesero_id
    LOOP
      INSERT INTO propinas_distribucion (
        tenant_id, sucursal_id, turno_id, usuario_id, rol_snapshot,
        metodo_reparto_usado, monto_asignado_mxn,
        tickets_atendidos, propinas_brutas_propias_mxn,
        created_by
      ) VALUES (
        v_tenant_id, v_turno.sucursal_id, p_turno_id,
        v_mesero.usuario_id, 'MESERO',
        'POR_MESA_ATENDIDA',
        CASE WHEN v_config.redondear_a_pesos THEN ROUND(v_mesero.propinas_brutas, 0)
             ELSE v_mesero.propinas_brutas END,
        v_mesero.tickets_count, v_mesero.propinas_brutas,
        auth.uid()
      ) RETURNING id INTO v_dist_id;

      v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
        'distribucion_id', v_dist_id,
        'usuario_id', v_mesero.usuario_id,
        'monto', v_mesero.propinas_brutas,
        'tickets', v_mesero.tickets_count
      ));
    END LOOP;

  -- ===== Método FONDO_COMUN =====
  ELSIF v_config.metodo_reparto = 'FONDO_COMUN' THEN
    -- Listar meseros que aparecieron en al menos un ticket del turno
    SELECT COUNT(DISTINCT t.mesero_id)
    INTO v_n_meseros
    FROM tickets t
    WHERE t.turno_id = p_turno_id
      AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
      AND t.mesero_id IS NOT NULL
      AND t.deleted_at IS NULL;

    v_participantes_fondo := v_n_meseros
      + CASE WHEN v_config.incluir_cajero_en_fondo THEN 1 ELSE 0 END
      + CASE WHEN v_config.incluir_bartender_en_fondo THEN 1 ELSE 0 END;

    IF v_participantes_fondo = 0 THEN
      RETURN jsonb_build_object('mensaje', 'Sin participantes para fondo común');
    END IF;

    -- Cada participante recibe total/N
    FOR v_mesero IN
      SELECT DISTINCT t.mesero_id AS usuario_id
      FROM tickets t
      WHERE t.turno_id = p_turno_id
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
        AND t.mesero_id IS NOT NULL
        AND t.deleted_at IS NULL
    LOOP
      INSERT INTO propinas_distribucion (
        tenant_id, sucursal_id, turno_id, usuario_id, rol_snapshot,
        metodo_reparto_usado, monto_asignado_mxn,
        participantes_fondo, created_by
      ) VALUES (
        v_tenant_id, v_turno.sucursal_id, p_turno_id,
        v_mesero.usuario_id, 'MESERO',
        'FONDO_COMUN',
        CASE WHEN v_config.redondear_a_pesos
             THEN ROUND(v_total_propinas / v_participantes_fondo, 0)
             ELSE ROUND(v_total_propinas / v_participantes_fondo, 2)
        END,
        v_participantes_fondo, auth.uid()
      ) RETURNING id INTO v_dist_id;
    END LOOP;

  -- ===== Método POR_HORAS_TRABAJADAS =====
  ELSIF v_config.metodo_reparto = 'POR_HORAS_TRABAJADAS' THEN
    -- Esto requiere tabla de "asistencia / horas trabajadas" que vive en RH (no implementada en MVP).
    -- Para MVP: se procesa como POR_MESA_ATENDIDA con nota indicando que no se pudo calcular por horas.
    RAISE NOTICE 'Método POR_HORAS_TRABAJADAS requiere módulo RH (no implementado en MVP). Recayendo a POR_MESA_ATENDIDA.';

    FOR v_mesero IN
      SELECT
        t.mesero_id          AS usuario_id,
        COUNT(*)             AS tickets_count,
        SUM(t.propina_mxn)   AS propinas_brutas
      FROM tickets t
      WHERE t.turno_id = p_turno_id
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
        AND t.mesero_id IS NOT NULL
        AND t.deleted_at IS NULL
      GROUP BY t.mesero_id
    LOOP
      INSERT INTO propinas_distribucion (
        tenant_id, sucursal_id, turno_id, usuario_id, rol_snapshot,
        metodo_reparto_usado, monto_asignado_mxn,
        tickets_atendidos, propinas_brutas_propias_mxn,
        nota, created_by
      ) VALUES (
        v_tenant_id, v_turno.sucursal_id, p_turno_id,
        v_mesero.usuario_id, 'MESERO',
        'POR_MESA_ATENDIDA',
        v_mesero.propinas_brutas,
        v_mesero.tickets_count, v_mesero.propinas_brutas,
        'Configurado POR_HORAS pero RH no disponible; usando POR_MESA_ATENDIDA',
        auth.uid()
      ) RETURNING id INTO v_dist_id;
    END LOOP;

  -- ===== Método CUSTOM =====
  ELSE
    -- CUSTOM: no se calcula automático. El supervisor inserta filas manualmente.
    -- Aquí no hacemos nada.
    NULL;
  END IF;

  RETURN jsonb_build_object(
    'turno_id', p_turno_id,
    'total_propinas_mxn', v_total_propinas,
    'metodo_usado', v_config.metodo_reparto,
    'distribuciones', v_resultado
  );
END;
$$;

COMMENT ON FUNCTION calcular_distribucion_propinas IS 'Calcula la distribución de propinas según el método configurado en la sucursal. Se invoca al cerrar el turno.';

-- ===========================================================================
-- §7.5 — Trigger en turnos para invocar la distribución al cerrar
-- ===========================================================================

CREATE OR REPLACE FUNCTION trg_turno_calcular_propinas() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CERRADO'
     AND NEW.estado = 'CERRADO' THEN
    -- Disparar la distribución, ignorando errores no críticos
    BEGIN
      PERFORM calcular_distribucion_propinas(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Registrar el error pero no bloquear el cierre del turno
      INSERT INTO auditoria_eventos (
        tenant_id, sucursal_id, turno_id, usuario_id, categoria, evento_codigo,
        entidad_tipo, entidad_id, payload
      ) VALUES (
        NEW.tenant_id, NEW.sucursal_id, NEW.id, NEW.updated_by,
        'PROPINAS', 'distribucion.error',
        'turno', NEW.id,
        jsonb_build_object('error', SQLERRM)
      );
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turno_calcular_propinas
  AFTER UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_turno_calcular_propinas();

-- ===========================================================================
-- §7.6 — Función entregar_propina()
-- ===========================================================================

CREATE OR REPLACE FUNCTION entregar_propina(
  p_distribucion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE propinas_distribucion
  SET estado            = 'ENTREGADA',
      fecha_entrega     = now(),
      entregado_por_id  = auth.uid(),
      updated_by        = auth.uid()
  WHERE id = p_distribucion_id
    AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Distribución % no existe o ya fue entregada', p_distribucion_id;
  END IF;
END;
$$;

-- ===========================================================================
-- §8 — Funciones helper consolidadas
-- ===========================================================================

-- 8.1 Asignar mesa al abrir ticket
CREATE OR REPLACE FUNCTION asignar_mesa_a_ticket(
  p_ticket_id        uuid,
  p_mesa_id          uuid,
  p_es_principal     boolean DEFAULT true,
  p_client_id_local  varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid := current_tenant_id();
  v_existing_id uuid;
  v_asignacion_id uuid;
  v_mesa_estado mesa_estado;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM tickets_mesas
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Verificar que la mesa esté libre
  SELECT estado INTO v_mesa_estado FROM mesas WHERE id = p_mesa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa % no existe', p_mesa_id;
  END IF;

  IF v_mesa_estado NOT IN ('LIBRE', 'RESERVADA', 'EN_LIMPIEZA') THEN
    RAISE EXCEPTION 'Mesa % no está disponible (estado: %)', p_mesa_id, v_mesa_estado;
  END IF;

  -- Si es principal y el ticket ya tiene mesa principal, error
  IF p_es_principal AND EXISTS (
    SELECT 1 FROM tickets_mesas
    WHERE ticket_id = p_ticket_id
      AND es_mesa_principal = true
      AND fecha_liberacion IS NULL
  ) THEN
    RAISE EXCEPTION 'Ticket ya tiene mesa principal. Para juntar mesas, use es_principal=false';
  END IF;

  INSERT INTO tickets_mesas (
    tenant_id, ticket_id, mesa_id, es_mesa_principal,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_mesa_id, p_es_principal,
    p_client_id_local, auth.uid()
  ) RETURNING id INTO v_asignacion_id;

  RETURN v_asignacion_id;
END;
$$;

-- 8.2 Transferir mesa
CREATE OR REPLACE FUNCTION transferir_mesa(
  p_ticket_id              uuid,
  p_mesa_nueva_id          uuid,
  p_motivo                 text,
  p_autorizacion_pin_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_asignacion_actual tickets_mesas%ROWTYPE;
  v_nueva_asignacion_id uuid;
BEGIN
  -- Obtener asignación actual principal
  SELECT * INTO v_asignacion_actual
  FROM tickets_mesas
  WHERE ticket_id = p_ticket_id
    AND es_mesa_principal = true
    AND fecha_liberacion IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no tiene mesa principal activa', p_ticket_id;
  END IF;

  IF v_asignacion_actual.mesa_id = p_mesa_nueva_id THEN
    RAISE EXCEPTION 'Mesa nueva es igual a la actual';
  END IF;

  -- Liberar la asignación actual
  UPDATE tickets_mesas
  SET fecha_liberacion = now(),
      motivo_liberacion = format('TRANSFERIDO_A_MESA_%s', p_mesa_nueva_id)
  WHERE id = v_asignacion_actual.id;

  -- Insertar nueva asignación
  INSERT INTO tickets_mesas (
    tenant_id, ticket_id, mesa_id, es_mesa_principal,
    mesa_anterior_id, transferencia_motivo, transferencia_autorizacion_pin_id,
    created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_mesa_nueva_id, true,
    v_asignacion_actual.mesa_id, p_motivo, p_autorizacion_pin_id,
    auth.uid()
  ) RETURNING id INTO v_nueva_asignacion_id;

  RETURN v_nueva_asignacion_id;
END;
$$;

-- 8.3 Crear reservación
CREATE OR REPLACE FUNCTION crear_reservacion(
  p_sucursal_id        uuid,
  p_cliente_nombre     varchar,
  p_cliente_telefono   varchar,
  p_cliente_email      varchar,
  p_fecha_hora         timestamptz,
  p_comensales         integer,
  p_canal              reservacion_canal,
  p_cliente_id         uuid DEFAULT NULL,
  p_mesa_preferida_id  uuid DEFAULT NULL,
  p_seccion_preferida_id uuid DEFAULT NULL,
  p_duracion_estimada  integer DEFAULT 90,
  p_nota               text DEFAULT NULL,
  p_ocasion_especial   varchar DEFAULT NULL,
  p_client_id_local    varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid := current_tenant_id();
  v_existing_id uuid;
  v_id          uuid;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM reservaciones
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF p_fecha_hora <= now() THEN
    RAISE EXCEPTION 'Fecha de reservación debe ser futura';
  END IF;

  INSERT INTO reservaciones (
    tenant_id, sucursal_id,
    cliente_id, cliente_nombre_snapshot, cliente_telefono_snapshot, cliente_email_snapshot,
    fecha_hora_reserva, duracion_estimada_minutos, comensales,
    mesa_preferida_id, seccion_preferida_id,
    nota, ocasion_especial,
    canal, usuario_creacion_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_sucursal_id,
    p_cliente_id, p_cliente_nombre, p_cliente_telefono, p_cliente_email,
    p_fecha_hora, p_duracion_estimada, p_comensales,
    p_mesa_preferida_id, p_seccion_preferida_id,
    p_nota, p_ocasion_especial,
    p_canal, auth.uid(),
    p_client_id_local, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 8.4 Cancelar reservación
CREATE OR REPLACE FUNCTION cancelar_reservacion(
  p_reservacion_id uuid,
  p_motivo         text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo de cancelación es obligatorio';
  END IF;

  UPDATE reservaciones
  SET estado             = 'CANCELADA',
      fecha_cancelacion  = now(),
      motivo_cancelacion = p_motivo,
      updated_by         = auth.uid()
  WHERE id = p_reservacion_id
    AND estado = 'CONFIRMADA';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservación % no existe o no está CONFIRMADA', p_reservacion_id;
  END IF;
END;
$$;

-- 8.5 Marcar reservación como NO_SHOW
CREATE OR REPLACE FUNCTION marcar_no_show_reservacion(
  p_reservacion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE reservaciones
  SET estado                = 'NO_SHOW',
      fecha_no_show_marcado = now(),
      updated_by            = auth.uid()
  WHERE id = p_reservacion_id
    AND estado = 'CONFIRMADA';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservación % no existe o no está CONFIRMADA', p_reservacion_id;
  END IF;
END;
$$;

-- 8.6 Job programado para auto-NO_SHOW
CREATE OR REPLACE FUNCTION auto_marcar_no_shows()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH actualizadas AS (
    UPDATE reservaciones
    SET estado                = 'NO_SHOW',
        fecha_no_show_marcado = now()
    WHERE estado = 'CONFIRMADA'
      AND fecha_hora_reserva < now() - interval '30 minutes'
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM actualizadas;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION auto_marcar_no_shows IS 'Marca como NO_SHOW las reservaciones cuya hora pasó hace >30 min y siguen CONFIRMADAS. Ejecutar vía pg_cron cada 15 min.';

-- Configuración de pg_cron (Supabase Studio):
-- SELECT cron.schedule('auto-no-shows', '*/15 * * * *', $$SELECT auto_marcar_no_shows()$$);

-- ===========================================================================
-- §3.7 / §5.2 / §5.3 — Vistas (después de ALTER tickets.mesero_id y tablas)
-- ===========================================================================

-- §3.7 Vista vw_mesas_estado_actual
CREATE OR REPLACE VIEW vw_mesas_estado_actual AS
SELECT
  m.id                AS mesa_id,
  m.tenant_id,
  m.sucursal_id,
  m.numero            AS mesa_numero,
  m.capacidad,
  m.seccion_id,
  s.nombre            AS seccion_nombre,
  m.estado            AS mesa_estado,
  m.posicion_x, m.posicion_y, m.forma,

  -- Ticket activo (si existe)
  tm.ticket_id        AS ticket_activo_id,
  t.folio_completo    AS ticket_folio,
  t.fecha_apertura    AS ticket_fecha_apertura,
  t.fecha_primer_item AS ticket_fecha_primer_item,
  t.total_mxn         AS ticket_total_mxn,
  t.mesero_id         AS ticket_mesero_id,
  u_mesero.email      AS mesero_email,

  -- Tiempo desde apertura (en minutos)
  CASE
    WHEN t.fecha_apertura IS NOT NULL THEN
      EXTRACT(EPOCH FROM (now() - t.fecha_apertura))::integer / 60
    ELSE NULL
  END                 AS minutos_ocupada,

  -- Reservación próxima
  m.reservacion_actual_id

FROM mesas m
LEFT JOIN secciones s ON s.id = m.seccion_id
LEFT JOIN tickets_mesas tm ON tm.mesa_id = m.id AND tm.fecha_liberacion IS NULL
LEFT JOIN tickets t ON t.id = tm.ticket_id AND t.estado_fiscal IN ('BORRADOR', 'ABIERTO')
LEFT JOIN auth.users u_mesero ON u_mesero.id = t.mesero_id
WHERE m.deleted_at IS NULL AND m.activa = true;

COMMENT ON VIEW vw_mesas_estado_actual IS 'Mapa de mesas en tiempo real con ticket activo, total acumulado, tiempo ocupada.';

-- §5.2 Vista vw_ventas_por_marca
CREATE OR REPLACE VIEW vw_ventas_por_marca AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.marca_virtual_id,
  mv.nombre               AS marca_nombre,
  mv.color_primario_hex            AS marca_color,

  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))  AS tickets_completados,
  COUNT(*) FILTER (WHERE t.estado_fiscal = 'CANCELADO')               AS tickets_cancelados,

  SUM(t.subtotal_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS subtotal_neto_mxn,
  SUM(t.iva_mxn)      FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS iva_neto_mxn,
  SUM(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS total_neto_mxn,
  SUM(t.descuentos_manuales_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS descuentos_manuales_mxn,
  SUM(t.promociones_mxn)        FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS promociones_mxn,

  AVG(t.total_mxn)    FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS ticket_promedio_mxn

FROM tickets t
JOIN marcas_virtuales mv ON mv.id = t.marca_virtual_id
WHERE t.deleted_at IS NULL
  AND t.marca_virtual_id IS NOT NULL
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         t.marca_virtual_id, mv.nombre, mv.color_primario_hex;

COMMENT ON VIEW vw_ventas_por_marca IS 'KPIs por sucursal-día-marca para Dark Kitchen.';

-- §5.3 Vista vw_marcas_kpi_acumulado
CREATE OR REPLACE VIEW vw_marcas_kpi_acumulado AS
SELECT
  t.tenant_id,
  t.marca_virtual_id,
  mv.nombre               AS marca_nombre,
  mv.color_primario_hex            AS marca_color,

  MIN(t.dia_contable)     AS primer_dia_actividad,
  MAX(t.dia_contable)     AS ultimo_dia_actividad,

  COUNT(*) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO'))  AS tickets_totales,
  SUM(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS ingresos_totales_mxn,
  AVG(t.total_mxn) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS ticket_promedio_mxn,

  -- Modo de servicio dominante
  MODE() WITHIN GROUP (ORDER BY t.modo_servicio) FILTER (WHERE t.estado_fiscal IN ('PAGADO', 'FACTURADO')) AS modo_servicio_dominante,

  -- Cuántos vienen de apps externas
  COUNT(*) FILTER (
    WHERE t.modo_servicio IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
      AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  ) AS tickets_apps

FROM tickets t
JOIN marcas_virtuales mv ON mv.id = t.marca_virtual_id
WHERE t.deleted_at IS NULL
  AND t.marca_virtual_id IS NOT NULL
GROUP BY t.tenant_id, t.marca_virtual_id, mv.nombre, mv.color_primario_hex;

COMMENT ON VIEW vw_marcas_kpi_acumulado IS 'KPIs acumulados por marca virtual (rentabilidad relativa de cada marca).';

-- ===========================================================================
-- §9 — RLS consolidada
-- ===========================================================================

-- ====== secciones ======
ALTER TABLE secciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY secciones_select ON secciones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY secciones_insert ON secciones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY secciones_update ON secciones
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== mesas ======
ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY mesas_select ON mesas
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY mesas_insert ON mesas
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY mesas_update ON mesas
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== tickets_mesas ======
ALTER TABLE tickets_mesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_mesas_select ON tickets_mesas
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tickets_mesas_insert ON tickets_mesas
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tickets_mesas_update ON tickets_mesas
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== cuentas_abiertas ======
ALTER TABLE cuentas_abiertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY cuentas_select ON cuentas_abiertas
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY cuentas_insert ON cuentas_abiertas
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY cuentas_update ON cuentas_abiertas
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== marcas_areas_cocina ======
ALTER TABLE marcas_areas_cocina ENABLE ROW LEVEL SECURITY;

CREATE POLICY marcas_areas_select ON marcas_areas_cocina
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY marcas_areas_insert ON marcas_areas_cocina
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY marcas_areas_update ON marcas_areas_cocina
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY marcas_areas_delete ON marcas_areas_cocina
  FOR DELETE USING (tenant_id = current_tenant_id());

-- ====== reservaciones ======
ALTER TABLE reservaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservaciones_select ON reservaciones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY reservaciones_insert ON reservaciones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY reservaciones_update ON reservaciones
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE no permitido (soft delete via deleted_at).

-- ====== sucursal_propinas_config ======
ALTER TABLE sucursal_propinas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY propinas_config_select ON sucursal_propinas_config
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY propinas_config_insert ON sucursal_propinas_config
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY propinas_config_update ON sucursal_propinas_config
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== propinas_distribucion ======
ALTER TABLE propinas_distribucion ENABLE ROW LEVEL SECURITY;

CREATE POLICY propinas_dist_select ON propinas_distribucion
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY propinas_dist_insert ON propinas_distribucion
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY propinas_dist_update ON propinas_distribucion
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
