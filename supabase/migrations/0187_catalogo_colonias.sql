-- 0187 · Catálogo de colonias con zona de envío (ADR 0036; spec 2026-10-15-catalogo-colonias-design.md)
--
-- La colonia de un domicilio era texto libre y la zona se elegía aparte, de memoria. Ahora cada
-- sucursal tiene su catálogo de colonias con su zona: al escribirla, la caja y la tienda la sugieren
-- y la zona sale sola. El domicilio sigue guardando SU zona (direcciones_cliente.zona_envio_id): el
-- catálogo solo sugiere, y cambiar la zona de una colonia no toca domicilios guardados.
--
--   §1 sepomex_asentamientos: el catálogo oficial de Correos de México, entero y de solo lectura.
--      Lo carga desktop/scripts/cargar-sepomex.mjs una vez. NO baja a la caja.
--   §2 colonias: el catálogo de cada sucursal. Baja a la caja y sube desde ella (§5), igual que
--      zonas_envio. La caja da de alta colonias (CAPTURADA) sin PIN, como da de alta zonas (0139 §2).
--   §3 sembrar_colonias: copia el municipio de la sucursal y hereda zonas del historial.
--   §4 asignar_zona_colonia: poner zona a una colonia sin zona es libre; cambiarla pide PIN.
--   §5 sync: pull, push (con fusión por llave) y catalogo_version.
--   §6 tienda: búsqueda pública, la colonia decide el envío (tienda_cotizar / tienda_crear_pedido).

-- ── §1 SEPOMEX ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sepomex_asentamientos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_postal   varchar(5)   NOT NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  nombre          varchar(150) NOT NULL,
  tipo            varchar(50)  NOT NULL,
  municipio       varchar(100) NOT NULL,
  estado          varchar(50)  NOT NULL,
  -- c_estado (2) + c_mnpio (3): la llave para sembrar el municipio de una sucursal.
  clave_municipio varchar(8)   NOT NULL
);
COMMENT ON TABLE sepomex_asentamientos IS 'Asentamientos de Correos de México (CPdescarga.txt). Solo lectura; la carga desktop/scripts/cargar-sepomex.mjs. No baja a la caja.';
CREATE INDEX IF NOT EXISTS idx_sepomex_cp        ON sepomex_asentamientos (codigo_postal);
CREATE INDEX IF NOT EXISTS idx_sepomex_municipio ON sepomex_asentamientos (clave_municipio);
ALTER TABLE sepomex_asentamientos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sepomex_asentamientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON sepomex_asentamientos TO service_role;
DO $$ BEGIN
  CREATE POLICY sepomex_select ON sepomex_asentamientos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §2 colonias ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colonias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id     uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre          varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
  codigo_postal   varchar(5) NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
  zona_envio_id   uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL,
  origen          text NOT NULL DEFAULT 'CAPTURADA' CHECK (origen IN ('SEPOMEX', 'CAPTURADA')),
  -- Para buscar y para la llave: sin acentos, minúsculas, sin espacios de sobra (como clientes, 0007).
  nombre_busqueda text GENERATED ALWAYS AS (lower(f_unaccent(btrim(nombre)))) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);
COMMENT ON TABLE colonias IS 'Colonias de cada sucursal con su zona de envío (0187, ADR 0036). Sugiere la zona del domicilio; no la impone.';

-- Hay colonias homónimas con distinto CP («Centro» 37000 y 37500): la llave lleva el CP.
CREATE UNIQUE INDEX IF NOT EXISTS colonia_llave_uq
  ON colonias (sucursal_id, nombre_busqueda, (coalesce(codigo_postal, ''))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_busqueda_trgm
  ON colonias USING GIN (nombre_busqueda gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_colonias_sucursal ON colonias (sucursal_id) WHERE deleted_at IS NULL;

ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON colonias TO authenticated, service_role;
-- Leer y dar de alta: todo el personal del negocio (la caja captura colonias al vuelo, sin PIN).
-- Cambiar o borrar: solo quien administra (el panel). La caja cambia zonas por asignar_zona_colonia.
DO $$ BEGIN
  CREATE POLICY colonias_select ON colonias FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_insert ON colonias FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_update ON colonias FOR UPDATE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY colonias_delete ON colonias FOR DELETE
    USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_colonias_updated_at BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona de una colonia: viva, de la MISMA sucursal y no de un tramo por distancia (las de tramo
-- no se eligen a mano, 0185). SECURITY DEFINER: la cajera no necesita leer tienda_sucursales.
-- En modo réplica (sync) no corre: la nube y la caja ya validaron al escribir.
CREATE OR REPLACE FUNCTION _colonia_zona_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.zona_envio_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM zonas_envio z
                  WHERE z.id = NEW.zona_envio_id AND z.sucursal_id = NEW.sucursal_id
                    AND z.tenant_id = NEW.tenant_id AND z.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM tienda_sucursales ts
                 WHERE ts.sucursal_id = NEW.sucursal_id
                   AND ts.tramos_envio @> jsonb_build_array(jsonb_build_object('zona_id', NEW.zona_envio_id::text))) THEN
    RAISE EXCEPTION 'ZONA_INVALIDA: la zona no es de esta sucursal o es de un tramo por distancia' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION _colonia_zona_valida() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_colonias_zona_valida BEFORE INSERT OR UPDATE OF zona_envio_id, sucursal_id ON colonias
  FOR EACH ROW EXECUTE FUNCTION _colonia_zona_valida();
