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
  v_cli uuid; v_suc_sin uuid; v_z_borrada uuid;
  v_super uuid := '99999999-0000-0000-0000-0000000000f1'; v_aut uuid; v_libre uuid; v_ajena uuid;
  v_q jsonb; v_uno text; v_z_tramo uuid; v_p120 uuid; v_cat uuid; v_aje uuid; v_cli_tienda jsonb; v_dir_tienda jsonb;
  h_todo jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
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

  -- ── 4) Sembrar desde SEPOMEX con herencia ────────────────────────────────
  INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio) VALUES
    ('37000', 'Centro',          'Colonia',         'León', 'Guanajuato', '11020'),
    ('37500', 'Centro',          'Colonia',         'León', 'Guanajuato', '11020'),
    ('37280', 'Jardines del Moral', 'Fraccionamiento', 'León', 'Guanajuato', '11020'),
    ('37280', 'Jardines del Moral', 'Fraccionamiento', 'León', 'Guanajuato', '11020'),  -- repetida en el archivo
    ('37000', 'San José',        'Colonia',         'León', 'Guanajuato', '11020'),       -- ya existe (sección 1)
    ('37390', 'El Coecillo',     'Barrio',          'León', 'Guanajuato', '11020'),
    ('36000', 'Zona Centro',     'Colonia',         'Guanajuato', 'Guanajuato', '11015'); -- otro municipio
  -- Historial: «jardines del moral» (sin acento, en minúsculas) 2 veces en Norte y 1 en Centro;
  -- «Centro» con CP 37000 en Centro; «El Coecillo» con una zona borrada (no cuenta).
  UPDATE tienda_sucursales SET tramos_envio = '[]' WHERE sucursal_id = v_suc;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Cliente herencia', '4770000187') RETURNING id INTO v_cli;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id) VALUES
    (v_t, v_cli, 'A', '1', 'jardines del moral ', '00000', 'León', 'Gto', v_z_norte),
    (v_t, v_cli, 'B', '2', 'JARDINES DEL MORAL',  '37280', 'León', 'Gto', v_z_norte),
    (v_t, v_cli, 'C', '3', 'Jardines del Moral',  '37280', 'León', 'Gto', v_z_centro),
    (v_t, v_cli, 'D', '4', 'Centro',              '37000', 'León', 'Gto', v_z_centro);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn, deleted_at) VALUES (v_t, v_suc, 'Col Borrada', 5, now()) RETURNING id INTO v_z_borrada;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id)
  VALUES (v_t, v_cli, 'E', '5', 'El Coecillo', '37390', 'León', 'Gto', v_z_borrada);

  -- La cajera no siembra.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc));
  IF v_e IS DISTINCT FROM 'NO_AUTORIZADO' THEN RAISE EXCEPTION '4: la cajera no debía sembrar (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc_o));
  IF v_e IS DISTINCT FROM 'SUCURSAL_INVALIDA' THEN RAISE EXCEPTION '4: sucursal de otro negocio (dio %)', v_e; END IF;
  INSERT INTO sucursales (tenant_id, codigo, nombre, codigo_postal) VALUES (v_t, 'S187', 'Sin CP conocido', '99999') RETURNING id INTO v_suc_sin;
  v_e := pg_temp.error_de(format('SELECT sembrar_colonias(%L)', v_suc_sin));
  IF v_e IS DISTINCT FROM 'CP_DESCONOCIDO' THEN RAISE EXCEPTION '4: un CP que no está en SEPOMEX (dio %)', v_e; END IF;

  v_r := sembrar_colonias(v_suc);
  -- Centro 37000, Centro 37500, Jardines del Moral 37280, El Coecillo 37390. San José 37000 ya estaba;
  -- la repetida entra una vez; la de otro municipio no entra.
  IF v_r <> '{"insertadas": 4, "heredadas": 2}'::jsonb THEN RAISE EXCEPTION '4: siembra dio %', v_r; END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral') IS DISTINCT FROM v_z_norte THEN
    RAISE EXCEPTION '4: Jardines del Moral debía heredar Norte (la más usada)';
  END IF;
  -- Centro tiene homónima: solo hereda la del CP del historial.
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37000') IS DISTINCT FROM v_z_centro
     OR (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500') IS NOT NULL THEN
    RAISE EXCEPTION '4: la herencia de homónimas debía ir por CP';
  END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo') IS NOT NULL THEN
    RAISE EXCEPTION '4: una zona borrada no se hereda';
  END IF;
  IF (SELECT origen FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo') <> 'SEPOMEX' THEN
    RAISE EXCEPTION '4: lo sembrado es SEPOMEX';
  END IF;

  -- Repetir no duplica ni pisa; una borrada no revive.
  UPDATE colonias SET zona_envio_id = v_z_centro WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral';
  UPDATE colonias SET deleted_at = now() WHERE sucursal_id = v_suc AND nombre_busqueda = 'el coecillo';
  v_r := sembrar_colonias(v_suc);
  IF v_r <> '{"insertadas": 0, "heredadas": 0}'::jsonb THEN RAISE EXCEPTION '4: la segunda siembra dio %', v_r; END IF;
  IF (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'jardines del moral') IS DISTINCT FROM v_z_centro THEN
    RAISE EXCEPTION '4: la segunda siembra pisó una zona asignada';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── 5) asignar_zona_colonia ──────────────────────────────────────────────
  SELECT id INTO v_libre FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500';
  SELECT id INTO v_ajena FROM colonias WHERE tenant_id = v_otro LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  -- Sin zona: libre, sin PIN.
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  IF (SELECT zona_envio_id FROM colonias WHERE id = v_libre) IS DISTINCT FROM v_z_centro THEN RAISE EXCEPTION '5: sin zona debía asignarse sin PIN'; END IF;
  -- La misma otra vez: no hace nada y no pide PIN.
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  -- Cambiarla sin autorización: no.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_libre, v_z_norte));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: cambiar sin PIN debía rechazarse (dio %)', v_e; END IF;
  -- Quitarla: solo admin.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, NULL)', v_libre));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: la cajera no quita zonas (dio %)', v_e; END IF;
  -- (Las tres pruebas de 42501 dependen de que `error_de` devuelva el SQLSTATE cuando el mensaje no
  -- trae prefijo: «Esta acción requiere autorización.» no lo trae.)
  -- Con PIN de supervisor sobre ESTA colonia, sí; y una sola vez.
  INSERT INTO autorizaciones_pin (id, tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion,
                                  permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (gen_random_uuid(), v_t, v_maria, v_super, 'editar_zona_colonia',
          'descuento.override_precio', 'colonia', v_libre, 'smoke 0187') RETURNING id INTO v_aut;
  PERFORM asignar_zona_colonia(v_libre, v_z_norte, v_aut);
  IF (SELECT zona_envio_id FROM colonias WHERE id = v_libre) IS DISTINCT FROM v_z_norte THEN RAISE EXCEPTION '5: con PIN debía cambiar'; END IF;
  -- El smoke corre en una sola transacción y consumir_autorizacion deja reusar dentro de la misma;
  -- se simula que el uso fue en otra.
  UPDATE autorizaciones_pin SET usada_txid = 0 WHERE id = v_aut;
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L, %L)', v_libre, v_z_centro, v_aut));
  IF v_e IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '5: la autorización es de un uso (dio %)', v_e; END IF;
  -- Zona actual desactivada = sin zona: libre otra vez.
  UPDATE zonas_envio SET activa = false WHERE id = v_z_norte;
  PERFORM asignar_zona_colonia(v_libre, v_z_centro);
  UPDATE zonas_envio SET activa = true WHERE id = v_z_norte;
  -- El dueño cambia y quita sin PIN.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM asignar_zona_colonia(v_libre, v_z_norte);
  PERFORM asignar_zona_colonia(v_libre, NULL);
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_libre, v_z_otra));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '5: zona ajena (dio %)', v_e; END IF;
  -- Colonia de otro negocio: para esta sesión no existe.
  v_e := pg_temp.error_de(format('SELECT asignar_zona_colonia(%L, %L)', v_ajena, v_z_centro));
  IF v_e IS DISTINCT FROM 'P0002' THEN RAISE EXCEPTION '5: colonia ajena (dio %)', v_e; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── 6) Sync de la nube ───────────────────────────────────────────────────
  v_r := sync_pull_snapshot(v_t);
  IF jsonb_typeof(v_r -> 'colonias') <> 'array'
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'colonias') x WHERE (x ->> 'id')::uuid = v_col)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'colonias') x WHERE (x ->> 'tenant_id')::uuid = v_otro) THEN
    RAISE EXCEPTION '6: el pull debía traer las colonias del negocio y solo esas';
  END IF;
  -- Push: una colonia nueva de la caja entra; una que choca por llave con otra de la nube se funde
  -- (no truena) y le pasa su zona si la de la nube no tenía.
  UPDATE colonias SET zona_envio_id = NULL WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500';
  v_r := sync_push_snapshot(v_t, jsonb_build_object('colonias', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_suc, 'nombre', 'La Nueva', 'codigo_postal', NULL,
                       'zona_envio_id', v_z_centro, 'origen', 'CAPTURADA', 'created_at', now(), 'updated_at', now(), 'deleted_at', NULL),
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_suc, 'nombre', 'CENTRO', 'codigo_postal', '37500',
                       'zona_envio_id', v_z_norte, 'origen', 'CAPTURADA', 'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));
  IF v_r ? '_errores' THEN RAISE EXCEPTION '6: el push no debía rechazar filas: %', v_r -> '_errores'; END IF;
  IF NOT EXISTS (SELECT 1 FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'la nueva' AND zona_envio_id = v_z_centro) THEN
    RAISE EXCEPTION '6: la colonia nueva de la caja no entró';
  END IF;
  IF (SELECT count(*) FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500' AND deleted_at IS NULL) <> 1
     OR (SELECT zona_envio_id FROM colonias WHERE sucursal_id = v_suc AND nombre_busqueda = 'centro' AND codigo_postal = '37500' AND deleted_at IS NULL) IS DISTINCT FROM v_z_norte THEN
    RAISE EXCEPTION '6: la homónima de la caja debía fundirse y pasar su zona';
  END IF;
  IF catalogo_version() IS NULL THEN RAISE EXCEPTION '6: catalogo_version'; END IF;
  -- El push termina en origin: las secciones siguientes necesitan sus disparadores.
  IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION '6: el rol de réplica quedó puesto'; END IF;

  -- ── 7) Tienda ────────────────────────────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_tarjeta) VALUES (v_t, 'colonias-smoke', true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  UPDATE tienda_sucursales SET participa = true, recoger = true, domicilio = true, horario = h_todo,
                               cobro_envio = 'ZONAS', tramos_envio = '[]' WHERE sucursal_id = v_suc;
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Colonias smoke', 62) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla colonias', 120) RETURNING id INTO v_p120;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-COL', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  v_uno := format('[{"producto_id":"%s","cantidad":1}]', v_p120);
  v_cli_tienda := '{"nombre":"Ana Colonia","telefono":"4775550187"}';
  v_dir_tienda := '{"calle":"Av. Pedido","numero_exterior":"12","colonia":"San José","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato"}';

  -- 7a) búsqueda
  v_r := tienda_colonias(v_t, v_suc, 'SAN jo');
  IF jsonb_array_length(v_r) = 0 OR v_r -> 0 ->> 'nombre' <> 'San José' OR v_r::text LIKE '%' || v_z_centro || '%'
     OR (v_r -> 0) ? 'zona_envio_id' OR (v_r -> 0 ->> 'con_zona')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '7a: búsqueda: %', v_r;
  END IF;
  IF tienda_colonias(v_t, v_suc, 'a') <> '[]'::jsonb OR tienda_colonias(v_t, v_suc_o, 'san') <> '[]'::jsonb
     OR tienda_colonias(v_t, v_suc, '%') <> '[]'::jsonb THEN
    RAISE EXCEPTION '7a: una letra, otra sucursal o un comodín no debían traer nada';
  END IF;
  -- 7b) colonia con zona: manda, aunque el navegador mande otra zona.
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_col);
  IF v_q ->> 'cobro' <> 'COLONIA' OR v_q ->> 'envio_mxn' <> '25.00' OR (v_q ->> 'zona_id')::uuid <> v_z_centro THEN
    RAISE EXCEPTION '7b: %', v_q - 'items' - 'renglones';
  END IF;
  -- 7c) colonia sin zona («Por zonas»): la zona elegida, como siempre. (La fusión del push de 6) le
  -- dejó Norte a v_libre; se le quita para probar una colonia sin zona.)
  UPDATE colonias SET zona_envio_id = NULL WHERE id = v_libre;
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_libre);
  IF v_q ->> 'cobro' <> 'ZONAS' OR (v_q ->> 'zona_id')::uuid <> v_z_norte THEN RAISE EXCEPTION '7c: %', v_q - 'items' - 'renglones'; END IF;
  -- 7d) colonia cuya zona se desactivó: igual que sin zona.
  UPDATE zonas_envio SET activa = false WHERE id = v_z_centro;
  v_e := pg_temp.error_de(format('SELECT tienda_cotizar(%L, %L, %L, NULL, %L, NULL, %L)', v_t, v_suc, 'DOMICILIO', v_uno, v_col));
  IF v_e IS DISTINCT FROM 'ZONA_INVALIDA' THEN RAISE EXCEPTION '7d: sin zona válida y sin elegir zona (dio %)', v_e; END IF;
  UPDATE zonas_envio SET activa = true WHERE id = v_z_centro;
  -- 7e) colonia de otra sucursal (y de otro negocio): no cuenta; cobra la zona elegida.
  INSERT INTO colonias (tenant_id, sucursal_id, nombre, zona_envio_id) VALUES (v_otro, v_suc_o, 'Ajena con zona', v_z_otra) RETURNING id INTO v_aje;
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, NULL, v_aje);
  IF v_q ->> 'cobro' <> 'ZONAS' OR (v_q ->> 'zona_id')::uuid <> v_z_norte THEN RAISE EXCEPTION '7e: %', v_q - 'items' - 'renglones'; END IF;
  -- 7f) el pedido se crea con la zona de la colonia, y su dirección lleva ESA colonia y su CP
  --     aunque el texto que mandó el navegador diga otra.
  v_r := tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z_norte, v_uno::jsonb, v_cli_tienda,
                             v_dir_tienda || '{"colonia":"Otra Colonia","codigo_postal":"37999"}',
                             'EFECTIVO', NULL, NULL, encode(sha256('colonias-smoke'::bytea), 'hex'),
                             p_colonia => v_col);
  IF (SELECT zona_envio_id FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) IS DISTINCT FROM v_z_centro THEN
    RAISE EXCEPTION '7f: el pedido debía llevar la zona de la colonia (%)', v_r;
  END IF;
  IF (SELECT direccion ->> 'colonia' FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) IS DISTINCT FROM 'San José'
     OR (SELECT direccion ->> 'codigo_postal' FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) IS DISTINCT FROM '37000' THEN
    RAISE EXCEPTION '7f: la dirección debía llevar la colonia del catálogo: %',
      (SELECT direccion FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid);
  END IF;
  -- 7f2) «Por distancia»: la colonia con zona gana al mapa, y sin punto el pedido se crea igual.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Col Tramo 5 km', 50) RETURNING id INTO v_z_tramo;
  UPDATE sucursales SET geo_lat = 21.1223, geo_lng = -101.6824 WHERE id = v_suc;
  UPDATE tienda_sucursales SET cobro_envio = 'DISTANCIA',
         tramos_envio = jsonb_build_array(jsonb_build_object('hasta_km', '5.0', 'zona_id', v_z_tramo)) WHERE sucursal_id = v_suc;
  v_q := tienda_cotizar(v_t, v_suc, 'DOMICILIO', NULL, v_uno::jsonb, '{"lat":21.129218,"lng":-101.6824}', v_col);
  IF v_q ->> 'cobro' <> 'COLONIA' OR v_q ->> 'envio_mxn' <> '25.00' OR (v_q ->> 'zona_id')::uuid <> v_z_centro THEN
    RAISE EXCEPTION '7f2: por distancia la colonia debía mandar: %', v_q - 'items' - 'renglones';
  END IF;
  v_r := tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', NULL, v_uno::jsonb, v_cli_tienda, v_dir_tienda,
                             'EFECTIVO', NULL, NULL, encode(sha256('colonias-smoke-distancia'::bytea), 'hex'),
                             p_colonia => v_col);
  IF (SELECT zona_envio_id FROM delivery_pedidos WHERE id = (v_r ->> 'pedido_id')::uuid) IS DISTINCT FROM v_z_centro THEN
    RAISE EXCEPTION '7f2: el pedido por distancia sin punto debía llevar la zona de la colonia (%)', v_r;
  END IF;
  UPDATE tienda_sucursales SET cobro_envio = 'ZONAS', tramos_envio = '[]' WHERE sucursal_id = v_suc;
  -- 7g) tienda_negocio dice si la sucursal tiene colonias.
  IF NOT ((SELECT s FROM jsonb_array_elements(tienda_negocio('colonias-smoke') -> 'publico' -> 'sucursales') s WHERE s ->> 'id' = v_suc::text) ->> 'colonias')::boolean THEN
    RAISE EXCEPTION '7g: tienda_negocio debía decir colonias = true';
  END IF;
  -- 7h) privilegios.
  IF has_function_privilege('authenticated', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'tienda_colonias(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', '_tienda_zona_de_colonia(uuid, uuid, uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('tienda_cotizar', 'tienda_crear_pedido') GROUP BY proname HAVING count(*) > 1) THEN
    RAISE EXCEPTION '7h: privilegios o firmas';
  END IF;

  RAISE NOTICE 'colonias en verde';
END $$;

ROLLBACK;
