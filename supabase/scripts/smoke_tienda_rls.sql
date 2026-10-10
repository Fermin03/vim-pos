-- Smoke tienda en línea (mig. 0161 §4): cada negocio ve solo su configuración, solo dueño o admin
-- la cambia, nadie ata a su tienda la sucursal de otro negocio, y las cuentas de clientes de la
-- tienda no las lee ni escribe nadie con sesión (ni `anon` toca ninguna tabla nueva).
-- Uso: cd desktop && npm run smokes -- smoke_tienda_rls.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '61616161-0000-0000-0000-0000000000aa';
  v_suc_otra uuid;
  v_n      integer;
  v_abierto text;
BEGIN
  -- Fixture, como postgres.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0161', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OT', 'Sucursal del otro') RETURNING id INTO v_suc_otra;
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_otro, 'otro-negocio');
  INSERT INTO tienda_cuentas (tenant_id, email, password_hash, nombre, telefono)
  VALUES (v_t, 'ana@example.com', 'x', 'Ana', '4771112233'), (v_otro, 'ana@example.com', 'x', 'Ana', '4771112233');

  -- 1) El mismo correo existe en dos negocios; repetido en el mismo, no.
  BEGIN
    INSERT INTO tienda_cuentas (tenant_id, email, password_hash, nombre, telefono) VALUES (v_t, 'ANA@example.com', 'x', 'Ana', '4771112233');
    RAISE EXCEPTION '1: se repitió un correo dentro del mismo negocio';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 2) Dirección de la tienda: formato y palabras reservadas.
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'Con Espacios');
    RAISE EXCEPTION '2: aceptó un slug con mayúsculas y espacios';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'api');
    RAISE EXCEPTION '2: aceptó un slug reservado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'otro-negocio');
    RAISE EXCEPTION '2: dos negocios con la misma dirección';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3) Sin forma de pago no hay tienda; minutos fuera de 3..15, tampoco.
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_tarjeta) VALUES (v_t, 'knockout-smoke', false, false);
    RAISE EXCEPTION '3: aceptó una tienda sin forma de pago';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion) VALUES (v_t, 'knockout-smoke', 30);
    RAISE EXCEPTION '3: aceptó 30 minutos de espera';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) El cajero lee la configuración de su negocio pero no la escribe.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
    RAISE EXCEPTION '4: un cajero creó la configuración de la tienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5) El dueño sí, y solo ve lo suyo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, false, '{"1":["13:00","22:00"]}'::jsonb);
  SELECT count(*) INTO v_n FROM tienda_config;
  IF v_n <> 1 THEN RAISE EXCEPTION '5: el dueño ve % configuraciones (esperaba solo la suya)', v_n; END IF;
  UPDATE tienda_config SET color = '#000000' WHERE tenant_id = v_otro;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '5: el dueño cambió la tienda de otro negocio'; END IF;
  -- Ni ata a su tienda la sucursal de otro negocio poniéndole su propio tenant_id: con la PK en
  -- sucursal_id, el otro negocio ya no podría crear ni ver su fila.
  BEGIN
    INSERT INTO tienda_sucursales (sucursal_id, tenant_id) VALUES (v_suc_otra, v_t);
    RAISE EXCEPTION '5: el dueño registró en su tienda la sucursal de otro negocio';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- Y el cajero, que en el paso 4 no pudo escribirla, SÍ lee la de su negocio (y solo esa).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM tienda_config WHERE tenant_id = v_t;
  IF v_n <> 1 THEN RAISE EXCEPTION '5: el cajero no lee la configuración de la tienda de su negocio'; END IF;
  SELECT count(*) INTO v_n FROM tienda_config;
  IF v_n <> 1 THEN RAISE EXCEPTION '5: el cajero ve % configuraciones (esperaba solo la suya)', v_n; END IF;
  EXECUTE 'RESET ROLE';

  -- 6) Las cuentas de clientes están cerradas a todo rol con sesión, también al dueño: ni un
  --    privilegio para anon ni authenticated, y RLS forzada sin políticas. Se pregunta al catálogo
  --    y no con un SELECT: «cero filas» también lo daría una tabla abierta y vacía para ese rol.
  SELECT string_agg(format('%s %s en %s', r, p, t), ', ') INTO v_abierto
    FROM unnest(ARRAY['tienda_cuentas', 'tienda_sesiones', 'tienda_recuperaciones', 'tienda_direcciones']) t,
         unnest(ARRAY['anon', 'authenticated']) r,
         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   WHERE has_table_privilege(r, t, p);
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION '6: tablas de cuentas con privilegios de más: %', v_abierto; END IF;
  SELECT string_agg(relname, ', ') INTO v_abierto FROM pg_class
   WHERE oid IN ('tienda_cuentas'::regclass, 'tienda_sesiones'::regclass, 'tienda_recuperaciones'::regclass, 'tienda_direcciones'::regclass)
     AND NOT (relrowsecurity AND relforcerowsecurity);
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION '6: tablas de cuentas sin RLS forzada: %', v_abierto; END IF;

  -- 7) Ninguna tabla nueva para anon: la tienda pública lee por la Edge Function, no por la API.
  SELECT string_agg(t, ', ') INTO v_abierto FROM unnest(ARRAY['tienda_config', 'tienda_sucursales']) t
   WHERE has_table_privilege('anon', t, 'SELECT');
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION '7: anon puede leer %', v_abierto; END IF;

  RAISE NOTICE 'smoke_tienda_rls OK';
END $$;
ROLLBACK;
