-- Módulos de operación por giro (spec 2026-10-14-giros-y-modulos-de-operacion-design.md, ADR 0034).
--
-- El giro ya no se lee en las pantallas: solo arma, al darse de alta, el juego inicial de diez
-- interruptores. Después los mueve solo VIM, desde /platform. Se guardan en `tenants` y no en
-- `configuracion_tenant` porque esta última la escribe el dueño (política `config_tenant FOR ALL`,
-- 0003); en `tenants` el UPDATE de `authenticated` está limitado a una lista de columnas (0132) y
-- `operacion` no entra en ella.

-- ── §1 El juego inicial de cada giro ─────────────────────────────────────────
-- Se compara como texto: así esta función no depende de que los valores de la 0179 ya estén
-- confirmados, y un giro que no está en la lista recibe todo encendido (ENTERPRISE, CAFE_BAR
-- viejo, NULL), que es lo que tenían todos antes de esta migración.
CREATE OR REPLACE FUNCTION juego_inicial_de_giro(p_giro vertical_tipo)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (CASE p_giro::text
    WHEN 'QUICK_SERVICE' THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FULL_SERVICE'  THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FOODTRUCK'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'
    WHEN 'DARK_KITCHEN'  THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'
    WHEN 'BAR'           THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'
    WHEN 'CAFETERIA'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'TAQUERIA'      THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro (tabla §5 del spec de giros). Sin giro conocido: todo encendido. Única fuente de esa tabla (0180).';

CREATE OR REPLACE FUNCTION cobro_inicial_de_giro(p_giro vertical_tipo)
RETURNS varchar LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_giro::text IN ('FULL_SERVICE', 'BAR', 'CAFE_BAR', 'TAQUERIA')
              THEN 'COCINA_PRIMERO' ELSE 'COBRO_PRIMERO' END::varchar;
$$;
COMMENT ON FUNCTION cobro_inicial_de_giro(vertical_tipo) IS
  'Valor inicial de configuracion_tenant.politica_cobro_cocina según el giro (0180).';

-- ── §2 Los interruptores ─────────────────────────────────────────────────────
-- Por defecto todo encendido: los clientes que ya existen no cambian sin que nadie haga nada.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS operacion jsonb NOT NULL DEFAULT juego_inicial_de_giro(NULL);
COMMENT ON COLUMN tenants.operacion IS
  'Módulos de operación encendidos (diez llaves booleanas). Los arma juego_inicial_de_giro al darse de alta y después solo los cambia VIM con operacion_cambiar / cambiar_giro (0180, ADR 0034).';

-- Completa, valida y corrige dependencias. NUNCA rechaza un valor válido por el estado del
-- negocio (cuentas abiertas): ese candado vive en operacion_cambiar, porque la caja baja `tenants`
-- en el pull y ahí no puede fallar. El pull corre con session_replication_role = replica, así que
-- este disparador no corre en la caja; aun así se mantiene determinista a propósito.
CREATE OR REPLACE FUNCTION operacion_normalizar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_base jsonb := juego_inicial_de_giro(NULL);
  v      jsonb;
  k      text;
BEGIN
  IF p IS NOT NULL AND jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'MODULO_NO_BOOLEANO: operacion debe ser un objeto' USING ERRCODE = '22023';
  END IF;
  v := v_base || COALESCE(p, '{}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF NOT v_base ? k THEN
      RAISE EXCEPTION 'MODULO_DESCONOCIDO: %', k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v->k) <> 'boolean' THEN
      RAISE EXCEPTION 'MODULO_NO_BOOLEANO: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT (v->>'comedor')::boolean   THEN v := v || '{"meseros":false}'::jsonb;      END IF;
  IF NOT (v->>'domicilio')::boolean THEN v := v || '{"repartidores":false}'::jsonb; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION tenants_operacion_normalizar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.operacion := operacion_normalizar(NEW.operacion);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenants_operacion_normalizar ON tenants;
CREATE TRIGGER tenants_operacion_normalizar
  BEFORE INSERT OR UPDATE OF operacion ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_operacion_normalizar();

-- CAFE_BAR se separa en BAR y CAFETERIA; quien lo tuviera pasa a BAR (el más parecido: cuentas
-- abiertas). Su `operacion` no se toca: sigue todo encendido, como cualquier cliente existente.
UPDATE tenants SET vertical_principal = 'BAR' WHERE vertical_principal = 'CAFE_BAR';
