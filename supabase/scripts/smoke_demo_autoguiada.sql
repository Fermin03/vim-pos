-- Smoke de la demo autoguiada (0261, ADR 0044): demo_clonar, demo_registrar_paso, demo_limpiar y
-- el tope de demos vivas. ROLLBACK.
--
-- Clona Crazy Burgers como lo haría la función `demo-iniciar` (service_role) y comprueba que el
-- clon sirve para el recorrido: una caja que entra con su correo de dispositivo, Ana con PIN 1234,
-- el catálogo y las mesas, y NADA de lo que no va (turnos, tickets, add-ons, dueña).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_caja   uuid := gen_random_uuid();
  v_caja2  uuid := gen_random_uuid();
  v_tenant uuid; v_tenant2 uuid;
  v_correo text;
  v_ana    uuid;
  v_n      int;
  v_pin    jsonb;
  v_acceso jsonb;
  v_ok     boolean;
BEGIN
  -- ── 1) El clon ───────────────────────────────────────────────────────────────
  SELECT c.tenant_id, c.correo INTO v_tenant, v_correo
    FROM demo_clonar(v_caja, 'clave-prueba-123', '1.2.3.4') c;
  IF v_correo IS DISTINCT FROM 'caja-' || v_caja || '@dispositivos.vimpos.com.mx' THEN
    RAISE EXCEPTION 'correo de la caja inesperado: %', v_correo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_correo) THEN
    RAISE EXCEPTION 'no se creó la cuenta de la caja en auth.users';
  END IF;

  SELECT count(*) INTO v_n FROM sucursales WHERE tenant_id = v_tenant;
  IF v_n <> 1 THEN RAISE EXCEPTION 'sucursales: % (se esperaba 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM cajas WHERE tenant_id = v_tenant;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM cajas WHERE id = v_caja AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'la caja no es la pedida o no es una sola (%)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM productos WHERE tenant_id = v_tenant;
  IF v_n < 8 THEN RAISE EXCEPTION 'productos: % (se esperaban 8 o más)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM productos_grupos_modificadores pg
                   JOIN productos p ON p.id = pg.producto_id
                   JOIN categorias c ON c.id = p.categoria_id
                  WHERE pg.tenant_id = v_tenant AND c.nombre = 'Hamburguesas') THEN
    RAISE EXCEPTION 'ninguna hamburguesa tiene modificadores';
  END IF;
  SELECT count(*) INTO v_n FROM mesas WHERE tenant_id = v_tenant;
  IF v_n < 1 THEN RAISE EXCEPTION 'sin mesas'; END IF;

  SELECT count(*) INTO v_n FROM turnos WHERE tenant_id = v_tenant;
  IF v_n <> 0 THEN RAISE EXCEPTION 'el clon trae % turnos', v_n; END IF;
  SELECT count(*) INTO v_n FROM tickets WHERE tenant_id = v_tenant;
  IF v_n <> 0 THEN RAISE EXCEPTION 'el clon trae % tickets', v_n; END IF;
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant;
  IF v_n <> 0 THEN RAISE EXCEPTION 'el clon trae % add-ons', v_n; END IF;
  SELECT count(*) INTO v_n FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
   WHERE ua.tenant_id = v_tenant AND r.codigo = 'DUENO';
  IF v_n <> 0 THEN RAISE EXCEPTION 'el clon trae % usuarios DUENO', v_n; END IF;

  -- ── 2) Ana entra con su PIN ──────────────────────────────────────────────────
  SELECT p.id INTO v_ana FROM usuarios_perfil p
    JOIN usuarios_acceso ua ON ua.usuario_id = p.id
   WHERE ua.tenant_id = v_tenant AND p.nombre = 'Ana';
  IF v_ana IS NULL THEN RAISE EXCEPTION 'no hay una Ana en el clon'; END IF;
  v_pin := verificar_pin_login(v_ana, '1234', v_caja);
  IF NOT coalesce((v_pin ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'el PIN 1234 de Ana no entra: %', v_pin;
  END IF;

  -- ── 3) La caja, con su sesión, no está bloqueada ─────────────────────────────
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', (SELECT id FROM auth.users WHERE email = v_correo), 'tenant_id', v_tenant,
    'tipo_identidad', 'DISPOSITIVO', 'role', 'authenticated')::text, true);
  v_acceso := mi_acceso();
  IF v_acceso IS NULL OR (v_acceso -> 'acceso' ->> 'bloqueado')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'mi_acceso de la caja demo: %', v_acceso -> 'acceso';
  END IF;

  -- ── 4) El paso registrado solo avanza ────────────────────────────────────────
  PERFORM demo_registrar_paso(5::smallint);
  PERFORM demo_registrar_paso(3::smallint);
  SELECT ultimo_paso INTO v_n FROM demo_sesiones WHERE tenant_id = v_tenant;
  IF v_n IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'ultimo_paso = % (se esperaba 5)', v_n; END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- ── 5) La limpieza borra lo de más de 24 h y deja lo reciente ────────────────
  SELECT c.tenant_id INTO v_tenant2 FROM demo_clonar(v_caja2, 'clave-prueba-456', '1.2.3.4') c;
  UPDATE demo_sesiones SET creado_en = now() - interval '25 hours' WHERE tenant_id = v_tenant;
  UPDATE demo_sesiones SET creado_en = now() - interval '1 hour'   WHERE tenant_id = v_tenant2;
  v_n := demo_limpiar();
  IF v_n <> 1 THEN RAISE EXCEPTION 'demo_limpiar borró % (se esperaba 1)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN RAISE EXCEPTION 'el tenant vencido sigue ahí'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_correo) THEN RAISE EXCEPTION 'la cuenta de la caja vencida sigue ahí'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_ana) THEN RAISE EXCEPTION 'la cuenta de Ana vencida sigue ahí'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant2) THEN RAISE EXCEPTION 'se borró el tenant de hace 1 hora'; END IF;

  -- ── 6) Con 50 demos vivas, la siguiente no entra ────────────────────────────
  WHILE (SELECT count(*) FROM demo_sesiones) < 50 LOOP
    PERFORM demo_clonar(gen_random_uuid(), 'clave-prueba-123', NULL);
  END LOOP;
  v_ok := false;
  BEGIN
    PERFORM demo_clonar(gen_random_uuid(), 'clave-prueba-123', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'DEMO_LLENA%';
    IF NOT v_ok THEN RAISE EXCEPTION 'la demo 51 falló con otro error: %', SQLERRM; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'la demo 51 entró: el tope no funciona'; END IF;

  RAISE NOTICE 'SMOKE DEMO AUTOGUIADA OK';
END $$;
ROLLBACK;
