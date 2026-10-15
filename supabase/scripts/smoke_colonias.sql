-- Smoke catálogo de colonias (mig. 0187, ADR 0036).
-- Uso: cd desktop && npm run smokes -- smoke_colonias.sql
\set ON_ERROR_STOP on
BEGIN;

-- El código del error de una sentencia (lo que va antes de los dos puntos) o el SQLSTATE si no
-- trae prefijo; NULL si no falló.
CREATE FUNCTION pg_temp.error_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLERRM ~ '^[A-Z_]+:' THEN split_part(SQLERRM, ':', 1) ELSE SQLSTATE END;
END $f$;

DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';   -- cajera
  v_dueno uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro  uuid := '18718718-0000-0000-0000-0000000000d1';
  v_suc_o uuid;
  v_z_centro uuid; v_z_norte uuid; v_z_otra uuid;
  v_col uuid; v_e text; v_n int; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE sucursales SET codigo_postal = '37000' WHERE id = v_suc;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Col Centro', 25) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Col Norte', 40) RETURNING id INTO v_z_norte;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0187', 'Otro negocio 0187', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre, codigo_postal) VALUES (v_otro, 'O187', 'Sucursal del otro', '37000') RETURNING id INTO v_suc_o;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_otro, v_suc_o, 'Ajena', 10) RETURNING id INTO v_z_otra;

  -- ── 1) La tabla y su llave ───────────────────────────────────────────────
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (v_t, v_suc, '  San José  ', '37000') RETURNING id INTO v_col;
  IF (SELECT nombre_busqueda FROM colonias WHERE id = v_col) <> 'san jose' THEN
    RAISE EXCEPTION '1: nombre_busqueda debía ser «san jose», fue %', (SELECT nombre_busqueda FROM colonias WHERE id = v_col);
  END IF;
  IF (SELECT origen FROM colonias WHERE id = v_col) <> 'CAPTURADA' THEN RAISE EXCEPTION '1: el origen por omisión es CAPTURADA'; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (%L, %L, %L, %L)', v_t, v_suc, 'SAN JOSÉ', '37000'));
  IF v_e IS DISTINCT FROM '23505' THEN RAISE EXCEPTION '1: la misma colonia y CP debía chocar (dio %)', v_e; END IF;
  -- Homónima con otro CP: entra.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (v_t, v_suc, 'San José', '37500');
  -- Sin CP: entra una vez.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (v_t, v_suc, 'San José');
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (%L, %L, %L)', v_t, v_suc, 'san jose'));
  IF v_e IS DISTINCT FROM '23505' THEN RAISE EXCEPTION '1: dos sin CP con el mismo nombre debían chocar (dio %)', v_e; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre, codigo_postal) VALUES (%L, %L, %L, %L)', v_t, v_suc, 'Mala', '370'));
  IF v_e IS DISTINCT FROM '23514' THEN RAISE EXCEPTION '1: un CP de 3 dígitos debía rechazarse (dio %)', v_e; END IF;
  v_e := pg_temp.error_de(format('INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (%L, %L, %L)', v_t, v_suc, '   '));
  IF v_e IS DISTINCT FROM '23514' THEN RAISE EXCEPTION '1: un nombre en blanco debía rechazarse (dio %)', v_e; END IF;

  -- ── 2) La zona tiene que ser de la sucursal y no de un tramo ─────────────
  v_e := pg_temp.error_de(format('UPDATE colonias SET zona_envio_id = %L WHERE id = %L', v_z_otra, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '2: una zona de otra sucursal debía rechazarse (dio %)', v_e; END IF;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, tramos_envio)
  VALUES (v_suc, v_t, true, jsonb_build_array(jsonb_build_object('hasta_km', '3.0', 'zona_id', v_z_norte)))
  ON CONFLICT (sucursal_id) DO UPDATE SET tramos_envio = EXCLUDED.tramos_envio;
  v_e := pg_temp.error_de(format('UPDATE colonias SET zona_envio_id = %L WHERE id = %L', v_z_norte, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '2: una zona de tramo debía rechazarse (dio %)', v_e; END IF;
  UPDATE tienda_sucursales SET tramos_envio = '[]' WHERE sucursal_id = v_suc;
  UPDATE colonias SET zona_envio_id = v_z_centro WHERE id = v_col;

  -- ── 3) RLS: la cajera ve las suyas y da de alta; no reasigna ni ve las ajenas ──
  INSERT INTO colonias (tenant_id, sucursal_id, nombre) VALUES (v_otro, v_suc_o, 'Colonia ajena');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  IF EXISTS (SELECT 1 FROM colonias WHERE tenant_id = v_otro) THEN RAISE EXCEPTION '3: la cajera vio colonias de otro negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM colonias WHERE id = v_col) THEN RAISE EXCEPTION '3: la cajera no ve las de su negocio'; END IF;
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, zona_envio_id) VALUES (v_t, v_suc, 'Las Joyas', v_z_centro);
  UPDATE colonias SET zona_envio_id = v_z_norte WHERE id = v_col;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '3: la cajera no debía poder reasignar con un UPDATE directo'; END IF;
  PERFORM 1 FROM sepomex_asentamientos LIMIT 1;   -- leer, sí
  -- Escribir, no. (Bloque propio y no pg_temp.error_de: con otro rol, el esquema temporal puede no
  -- estar al alcance.)
  v_e := NULL;
  BEGIN
    INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio)
    VALUES ('37000', 'X', 'Colonia', 'León', 'Guanajuato', '11020');
  EXCEPTION WHEN OTHERS THEN v_e := SQLSTATE;
  END;
  RESET ROLE;
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '3: authenticated no debía escribir en SEPOMEX (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'colonias 1-3 en verde';
END $$;

ROLLBACK;
