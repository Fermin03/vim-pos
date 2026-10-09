-- Smoke tienda en línea (mig. 0166): las cuentas de los clientes de la tienda — registro, entrar,
-- sesión, recuperación, «Mi cuenta», direcciones, mis pedidos y eliminar.
-- Dos negocios: el de la semilla (con la tienda abierta, para poder pedir) y otro. Lo que se vigila
-- en cada bloque es lo mismo: nada de un negocio sirve en el otro, y nada revela si un correo existe.
-- El tiempo se mueve con p_ahora; nunca se espera de verdad.
-- Fixture de la tienda: el de smoke_tienda_seguimiento.sql.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_cuentas.sql
\set ON_ERROR_STOP on
BEGIN;
-- Huella distinta y válida por nombre (64 hex, como la manda la función `tienda`).
CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to('cuentas-' || p, 'UTF8')), 'hex') $$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := '66666666-0000-0000-0000-0000000000ab';
  v_cat uuid; v_p120 uuid; v_g uuid; v_o15 uuid; v_z35 uuid; v_combo uuid; v_slot uuid; v_combo_carrito jsonb;
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  v_dir_sucia jsonb := '{"calle":"  Av. Cuenta  ","numero_exterior":"12","numero_interior":"","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":" portón verde ","basura":"no se guarda","zona_envio_id":"99999999-0000-0000-0000-0000000000bb"}';
  v_dir2   jsonb := '{"calle":"Calle Dos","numero_exterior":"2","numero_interior":"B","colonia":"Norte","codigo_postal":"37100","ciudad":"León","estado":"Guanajuato"}';
  c_ana    CONSTANT jsonb := '{"nombre":"Ana","apellido":"López","email":"ana.cuenta@example.com","telefono":"4775550101","fecha_nacimiento":null}';
  c_pw     CONSTANT text := 'secreto-123';
  v_t0     timestamptz := now();
  v_a uuid; v_b uuid; v_beto uuid;       -- Ana en el negocio, Ana en el OTRO negocio, Beto en el negocio
  v_c tienda_cuentas%ROWTYPE;
  v_r jsonb; v_r2 jsonb; v_err text; v_n int; v_i int; v_hash text;
  v_d1 uuid; v_ped uuid; v_ped2 uuid; v_ticket uuid; v_seg jsonb; v_carrito jsonb;
  v_abierto text;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: la tienda del negocio, abierta ahora, y otro negocio ─────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, minutos_aceptacion, pago_efectivo, pago_tarjeta)
  VALUES (v_t, 'cuentas-smoke', 7, true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, true, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL WHERE sucursal_id = v_suc;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0166-cta', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');

  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Cuentas smoke', 66) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla cuentas', 120) RETURNING id INTO v_p120;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras cuentas', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES (v_t, v_p120, v_g, 1);
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Cuentas 35', 35) RETURNING id INTO v_z35;
  -- Un combo de $150 cuyo único slot ofrece la «Sencilla», que admite el extra de $15.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo) VALUES (v_t, v_cat, 'Combo cuentas', 150, true) RETURNING id INTO v_combo;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio) VALUES (v_t, v_combo, 'Principal', 1, 'DELTA') RETURNING id INTO v_slot;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id) VALUES (v_t, v_slot, v_p120);

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, '99999999-0000-0000-0000-0000000000cc', 'SMOKE-CTA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL');
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL THEN RAISE EXCEPTION 'fixture: la tienda debía estar abierta'; END IF;

  -- ── R) Registro ───────────────────────────────────────────────────────────
  -- R1) Datos mal formados: CUENTA_INVALIDA_DATOS y no se crea nada.
  FOR r IN SELECT * FROM (VALUES
    ('nombre vacío',           '  ',  'López', 'ana@example.com', '4775550101', c_pw),
    ('nombre de 101',          repeat('n', 101), 'López', 'ana@example.com', '4775550101', c_pw),
    ('apellido vacío',         'Ana', '',      'ana@example.com', '4775550101', c_pw),
    ('apellido NULL',          'Ana', NULL,    'ana@example.com', '4775550101', c_pw),
    ('correo sin arroba',      'Ana', 'López', 'ana.example.com', '4775550101', c_pw),
    ('correo con espacio',     'Ana', 'López', 'ana @example.com', '4775550101', c_pw),
    ('correo NULL',            'Ana', 'López', NULL,              '4775550101', c_pw),
    ('teléfono corto',         'Ana', 'López', 'ana@example.com', '477555010',  c_pw),
    ('teléfono con letras',    'Ana', 'López', 'ana@example.com', '477555010a', c_pw),
    ('teléfono que empieza en 1', 'Ana', 'López', 'ana@example.com', '1775550101', c_pw),
    ('contraseña de 7',        'Ana', 'López', 'ana@example.com', '4775550101', '1234567'),
    ('contraseña de 73',       'Ana', 'López', 'ana@example.com', '4775550101', repeat('a', 73)),
    -- bcrypt mira BYTES: 37 «ñ» son 37 caracteres y 74 bytes; 19 emojis, 19 y 76. chr() y no la letra,
    -- para que no dependa de la codificación con que se lea este archivo.
    ('contraseña de 37 ñ (74 bytes)',     'Ana', 'López', 'ana@example.com', '4775550101', repeat(chr(241), 37)),
    ('contraseña de 19 emojis (76 bytes)', 'Ana', 'López', 'ana@example.com', '4775550101', repeat(chr(128512), 19)),
    ('contraseña de 4 emojis (4 caracteres)', 'Ana', 'López', 'ana@example.com', '4775550101', repeat(chr(128512), 4)),
    ('contraseña NULL',        'Ana', 'López', 'ana@example.com', '4775550101', NULL)
  ) AS x(caso, nombre, apellido, email, telefono, pw) LOOP
    v_err := NULL;
    BEGIN
      PERFORM tienda_cuenta_registrar(v_t, r.nombre, r.apellido, r.email, r.telefono, r.pw, pg_temp.h('r1'));
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN
      RAISE EXCEPTION 'R1 %: esperaba CUENTA_INVALIDA_DATOS, dio %', r.caso, COALESCE(v_err, 'una cuenta');
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM tienda_cuentas WHERE tenant_id = v_t) OR EXISTS (SELECT 1 FROM tienda_sesiones WHERE tenant_id = v_t) THEN
    RAISE EXCEPTION 'R1: un registro inválido dejó filas';
  END IF;

  -- R1b) El tope es de 72 BYTES justos. 36 «ñ» (72 bytes) entra; esa misma con una letra más (37
  -- caracteres, 73 bytes) NO abre la cuenta, aunque bcrypt, que corta en el byte 72, las vea iguales.
  -- Se deshace al final: el resto del smoke cuenta filas.
  BEGIN
    v_r := tienda_cuenta_registrar(v_t, 'Bea', 'Bytes', 'bytes@example.com', '4775550199', repeat(chr(241), 36), pg_temp.h('rb'));
    IF (v_r ->> 'creada') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'R1b: una contraseña de 72 bytes debía entrar: %', v_r; END IF;
    IF tienda_cuenta_entrar(v_t, 'bytes@example.com', repeat(chr(241), 36), pg_temp.h('rb2'), v_t0) IS NULL THEN
      RAISE EXCEPTION 'R1b: no entró con su contraseña de 72 bytes';
    END IF;
    IF tienda_cuenta_entrar(v_t, 'bytes@example.com', repeat(chr(241), 36) || 'x', pg_temp.h('rb3'), v_t0) IS NOT NULL THEN
      RAISE EXCEPTION 'R1b: entró con una contraseña de 73 bytes cuyo final bcrypt no mira';
    END IF;
    RAISE EXCEPTION 'R1B_DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'R1B_DESHACER' THEN RAISE; END IF;
  END;

  -- R2) Válido: correo recortado y en minúsculas, teléfono a 10 dígitos, y entra de una vez.
  v_r := tienda_cuenta_registrar(v_t, ' Ana ', ' López ', '  Ana.Cuenta@Example.com ', '+52 (477) 555-0101', c_pw, pg_temp.h('s1'));
  IF v_r IS DISTINCT FROM jsonb_build_object('creada', true, 'cuenta', c_ana) THEN RAISE EXCEPTION 'R2: registro: %', v_r; END IF;
  SELECT * INTO v_c FROM tienda_cuentas WHERE tenant_id = v_t;
  v_a := v_c.id;
  IF v_c.password_hash = c_pw OR v_c.password_hash NOT LIKE '$2a$10$%' OR crypt(c_pw, v_c.password_hash) <> v_c.password_hash
     OR crypt('otra-cosa-1', v_c.password_hash) = v_c.password_hash THEN
    RAISE EXCEPTION 'R2: el hash guardado no es bcrypt de coste 10 de la contraseña';
  END IF;
  IF v_c.email_verificado_at IS NOT NULL OR v_c.intentos_fallidos <> 0 OR v_c.bloqueada_hasta IS NOT NULL THEN
    RAISE EXCEPTION 'R2: la cuenta nace sin verificar y sin bloqueo: %', to_jsonb(v_c) - 'password_hash';
  END IF;
  IF tienda_sesion_cuenta(v_t, pg_temp.h('s1')) IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'R2: el registro no abrió sesión'; END IF;
  IF (SELECT expira_at FROM tienda_sesiones WHERE token_hash = pg_temp.h('s1')) IS DISTINCT FROM now() + interval '30 days' THEN
    RAISE EXCEPTION 'R2: la sesión dura 30 días';
  END IF;

  -- R3) Correo repetido en el mismo negocio (con otras mayúsculas): {creada:false} y NADA cambia.
  v_r := tienda_cuenta_registrar(v_t, 'Impostor', 'Malo', ' ANA.CUENTA@example.com', '4779990000', 'otra-clave-99', pg_temp.h('s2'));
  IF v_r IS DISTINCT FROM '{"creada": false}'::jsonb THEN RAISE EXCEPTION 'R3: correo repetido: %', v_r; END IF;
  IF (SELECT count(*) FROM tienda_cuentas WHERE tenant_id = v_t) <> 1
     OR (SELECT to_jsonb(c) FROM tienda_cuentas c WHERE id = v_a) IS DISTINCT FROM to_jsonb(v_c)
     OR EXISTS (SELECT 1 FROM tienda_sesiones WHERE token_hash = pg_temp.h('s2')) THEN
    RAISE EXCEPTION 'R3: el registro repetido creó o cambió algo';
  END IF;

  -- R4) El mismo correo en OTRO negocio: cuenta independiente, con su propia contraseña.
  v_r := tienda_cuenta_registrar(v_otro, 'Ana', 'Otra', 'ana.cuenta@example.com', '4775550101', 'clave-del-otro-1', pg_temp.h('o1'));
  IF (v_r ->> 'creada')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'R4: el otro negocio no pudo registrar el mismo correo: %', v_r; END IF;
  SELECT id INTO v_b FROM tienda_cuentas WHERE tenant_id = v_otro;
  IF v_b IS NULL OR v_b = v_a THEN RAISE EXCEPTION 'R4: la cuenta del otro negocio no es independiente'; END IF;
  PERFORM tienda_cuenta_registrar(v_t, 'Beto', 'Ruiz', 'beto@example.com', '4775550303', 'clave-de-beto-1', pg_temp.h('b1'));
  SELECT id INTO v_beto FROM tienda_cuentas WHERE tenant_id = v_t AND email = 'beto@example.com';
  IF v_beto IS NULL THEN RAISE EXCEPTION 'R4: no se registró a Beto'; END IF;

  -- ── E) Entrar ─────────────────────────────────────────────────────────────
  -- E1) Bien, con el correo escrito de otra forma.
  v_r := tienda_cuenta_entrar(v_t, ' ANA.cuenta@example.com ', c_pw, pg_temp.h('s3'), v_t0);
  IF v_r IS DISTINCT FROM jsonb_build_object('cuenta', c_ana) THEN RAISE EXCEPTION 'E1: entrar: %', v_r; END IF;
  IF tienda_sesion_cuenta(v_t, pg_temp.h('s3')) IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'E1: entrar no abrió sesión'; END IF;

  -- E2) Mal y correo inexistente: la misma salida (NULL), sin sesión. Solo la mala mueve el contador.
  IF tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'no-es-esta-1', pg_temp.h('e2'), v_t0) IS NOT NULL
     OR tienda_cuenta_entrar(v_t, 'nadie@example.com', c_pw, pg_temp.h('e2'), v_t0) IS NOT NULL
     OR tienda_cuenta_entrar(v_t, NULL, c_pw, pg_temp.h('e2'), v_t0) IS NOT NULL
     OR tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', NULL, pg_temp.h('e2'), v_t0) IS NOT NULL
     OR tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw || repeat('x', 70), pg_temp.h('e2'), v_t0) IS NOT NULL THEN
    RAISE EXCEPTION 'E2: entró con credenciales malas';
  END IF;
  IF EXISTS (SELECT 1 FROM tienda_sesiones WHERE token_hash = pg_temp.h('e2')) THEN RAISE EXCEPTION 'E2: un intento fallido abrió sesión'; END IF;
  IF (SELECT intentos_fallidos FROM tienda_cuentas WHERE id = v_a) <> 3 THEN
    RAISE EXCEPTION 'E2: esperaba 3 fallos contados, hay %', (SELECT intentos_fallidos FROM tienda_cuentas WHERE id = v_a);
  END IF;
  -- Un intento contra el OTRO negocio (con la contraseña buena de este) no entra y no mueve este contador…
  IF tienda_cuenta_entrar(v_otro, 'ana.cuenta@example.com', c_pw, pg_temp.h('e2'), v_t0) IS NOT NULL THEN
    RAISE EXCEPTION 'E2: la contraseña de un negocio abrió la cuenta del otro';
  END IF;
  IF (SELECT intentos_fallidos FROM tienda_cuentas WHERE id = v_a) <> 3 OR (SELECT intentos_fallidos FROM tienda_cuentas WHERE id = v_b) <> 1 THEN
    RAISE EXCEPTION 'E2: un intento contra un negocio movió el contador del otro';
  END IF;
  -- …y entrar bien lo pone en cero.
  -- (La llamada y la lectura van en sentencias aparte: en una sola, la lectura no vería lo que la
  -- función acaba de escribir. Vale para todo el archivo.)
  v_r := tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('s4'), v_t0);
  IF v_r IS NULL OR (SELECT intentos_fallidos FROM tienda_cuentas WHERE id = v_a) <> 0 THEN
    RAISE EXCEPTION 'E2: entrar bien no reinició el contador';
  END IF;

  -- E3) Cinco fallos SEGUIDOS bloquean 15 minutos; bloqueada, ni la contraseña buena entra ni se cuenta.
  FOR v_i IN 1..5 LOOP
    IF (SELECT bloqueada_hasta FROM tienda_cuentas WHERE id = v_a) IS NOT NULL THEN RAISE EXCEPTION 'E3: se bloqueó con % fallos', v_i - 1; END IF;
    PERFORM tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'no-es-esta-1', pg_temp.h('e3'), v_t0);
  END LOOP;
  SELECT * INTO v_c FROM tienda_cuentas WHERE id = v_a;
  IF v_c.bloqueada_hasta IS DISTINCT FROM v_t0 + interval '15 minutes' OR v_c.intentos_fallidos <> 0 THEN
    RAISE EXCEPTION 'E3: al quinto fallo esperaba bloqueo de 15 min y contador en 0: %, %', v_c.bloqueada_hasta, v_c.intentos_fallidos;
  END IF;
  IF tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('e3'), v_t0 + interval '14 minutes') IS NOT NULL
     OR tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'no-es-esta-1', pg_temp.h('e3'), v_t0 + interval '14 minutes') IS NOT NULL THEN
    RAISE EXCEPTION 'E3: entró estando bloqueada';
  END IF;
  IF (SELECT to_jsonb(c) FROM tienda_cuentas c WHERE id = v_a) IS DISTINCT FROM to_jsonb(v_c) THEN
    RAISE EXCEPTION 'E3: un intento con la cuenta bloqueada movió algo';
  END IF;
  -- El bloqueo es de la cuenta de ESTE negocio: la del otro sigue entrando.
  IF tienda_cuenta_entrar(v_otro, 'ana.cuenta@example.com', 'clave-del-otro-1', pg_temp.h('o2'), v_t0) IS NULL THEN
    RAISE EXCEPTION 'E3: el bloqueo de un negocio alcanzó a la cuenta del otro';
  END IF;
  -- A los 15 minutos, vuelve a entrar.
  v_r := tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('s5'), v_t0 + interval '15 minutes 1 second');
  IF v_r IS NULL THEN RAISE EXCEPTION 'E3: pasado el bloqueo no entró'; END IF;
  IF (SELECT bloqueada_hasta FROM tienda_cuentas WHERE id = v_a) IS NOT NULL THEN RAISE EXCEPTION 'E3: entrar bien no limpió el bloqueo'; END IF;

  -- ── S) Sesión ─────────────────────────────────────────────────────────────
  IF tienda_sesion_cuenta(v_otro, pg_temp.h('s3')) IS NOT NULL THEN RAISE EXCEPTION 'S: una sesión sirvió con el negocio de otro'; END IF;
  IF tienda_sesion_cuenta(v_t, pg_temp.h('no-existe')) IS NOT NULL OR tienda_sesion_cuenta(v_t, 'basura') IS NOT NULL
     OR tienda_sesion_cuenta(v_t, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'S: una huella que no existe dio una cuenta';
  END IF;
  -- Vence a los 30 días de creada (s3 nació en v_t0); usarla no la alarga.
  IF tienda_sesion_cuenta(v_t, pg_temp.h('s3'), v_t0 + interval '29 days') IS DISTINCT FROM v_a
     OR tienda_sesion_cuenta(v_t, pg_temp.h('s3'), v_t0 + interval '30 days') IS NOT NULL THEN
    RAISE EXCEPTION 'S: la sesión no vence justo a los 30 días';
  END IF;
  -- El último uso se renueva como mucho una vez por hora.
  IF (SELECT ultimo_uso_at FROM tienda_sesiones WHERE token_hash = pg_temp.h('s3')) IS DISTINCT FROM v_t0 + interval '29 days' THEN
    RAISE EXCEPTION 'S: el último uso no se anotó';
  END IF;
  PERFORM tienda_sesion_cuenta(v_t, pg_temp.h('s3'), v_t0 + interval '29 days 30 minutes');
  IF (SELECT ultimo_uso_at FROM tienda_sesiones WHERE token_hash = pg_temp.h('s3')) IS DISTINCT FROM v_t0 + interval '29 days' THEN
    RAISE EXCEPTION 'S: el último uso se reescribió antes de una hora';
  END IF;
  -- Cerrar: con el negocio de otro no cierra nada; con el suyo, sí, y solo esa.
  PERFORM tienda_cuenta_salir(v_otro, pg_temp.h('s3'));
  IF tienda_sesion_cuenta(v_t, pg_temp.h('s3')) IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'S: otro negocio cerró la sesión'; END IF;
  PERFORM tienda_cuenta_salir(v_t, pg_temp.h('s3'));
  IF tienda_sesion_cuenta(v_t, pg_temp.h('s3')) IS NOT NULL OR tienda_sesion_cuenta(v_t, pg_temp.h('s4')) IS DISTINCT FROM v_a THEN
    RAISE EXCEPTION 'S: salir no cerró esa sesión, o cerró otra';
  END IF;
  -- La llave compuesta: una sesión no puede decir que es de un negocio y apuntar a la cuenta de otro.
  BEGIN
    INSERT INTO tienda_sesiones (token_hash, cuenta_id, tenant_id, expira_at) VALUES (pg_temp.h('cruzada'), v_a, v_otro, now() + interval '1 day');
    RAISE EXCEPTION 'S: aceptó una sesión de un negocio con la cuenta de otro';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- Entrar barre las sesiones vencidas (sin cron).
  PERFORM tienda_cuenta_entrar(v_otro, 'nadie@example.com', c_pw, pg_temp.h('e9'), v_t0 + interval '31 days');
  IF EXISTS (SELECT 1 FROM tienda_sesiones WHERE expira_at <= v_t0 + interval '30 days') THEN RAISE EXCEPTION 'S: entrar no barrió las sesiones vencidas'; END IF;

  -- ── P) Recuperación ───────────────────────────────────────────────────────
  -- Dos sesiones vivas y la cuenta bloqueada: lo que aplicar tiene que deshacer.
  PERFORM tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('p1'), v_t0);
  PERFORM tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('p2'), v_t0);
  PERFORM tienda_cuenta_entrar(v_otro, 'ana.cuenta@example.com', 'clave-del-otro-1', pg_temp.h('o3'), v_t0);
  FOR v_i IN 1..5 LOOP PERFORM tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'no-es-esta-1', pg_temp.h('e3'), v_t0); END LOOP;
  IF (SELECT bloqueada_hasta FROM tienda_cuentas WHERE id = v_a) IS NULL THEN RAISE EXCEPTION 'P: el fixture debía dejar la cuenta bloqueada'; END IF;

  -- Pedir: si no existe, NULL y nada; si existe, el nombre para el correo. Pedir otra vez anula el anterior.
  v_r := tienda_recuperar_pedir(v_t, 'nadie@example.com', pg_temp.h('k0'), v_t0);
  IF v_r IS NOT NULL OR EXISTS (SELECT 1 FROM tienda_recuperaciones) THEN
    RAISE EXCEPTION 'P: pedir recuperación de un correo que no existe dejó algo';
  END IF;
  v_r := tienda_recuperar_pedir(v_t, ' ANA.cuenta@example.com', pg_temp.h('k1'), v_t0);
  IF v_r IS DISTINCT FROM '{"nombre": "Ana"}'::jsonb THEN RAISE EXCEPTION 'P: pedir: %', v_r; END IF;
  IF (SELECT expira_at FROM tienda_recuperaciones WHERE token_hash = pg_temp.h('k1')) IS DISTINCT FROM v_t0 + interval '30 minutes' THEN
    RAISE EXCEPTION 'P: el enlace dura 30 minutos';
  END IF;
  PERFORM tienda_recuperar_pedir(v_t, 'ana.cuenta@example.com', pg_temp.h('k2'), v_t0);
  SELECT password_hash INTO v_hash FROM tienda_cuentas WHERE id = v_a;
  IF tienda_recuperar_aplicar(v_t, pg_temp.h('k1'), 'nueva-clave-1', pg_temp.h('p3'), v_t0) IS NOT NULL THEN
    RAISE EXCEPTION 'P: sirvió un enlace anulado por otro más nuevo';
  END IF;
  -- De otro negocio, vencido, o que no existe: NULL y nada cambia.
  IF tienda_recuperar_aplicar(v_otro, pg_temp.h('k2'), 'nueva-clave-1', pg_temp.h('p3'), v_t0) IS NOT NULL
     OR tienda_recuperar_aplicar(v_t, pg_temp.h('k2'), 'nueva-clave-1', pg_temp.h('p3'), v_t0 + interval '30 minutes') IS NOT NULL
     OR tienda_recuperar_aplicar(v_t, pg_temp.h('no-existe'), 'nueva-clave-1', pg_temp.h('p3'), v_t0) IS NOT NULL THEN
    RAISE EXCEPTION 'P: sirvió un enlace de otro negocio, vencido o inexistente';
  END IF;
  IF (SELECT password_hash FROM tienda_cuentas WHERE id = v_a) <> v_hash OR (SELECT password_hash FROM tienda_cuentas WHERE id = v_b) IS NULL
     OR EXISTS (SELECT 1 FROM tienda_sesiones WHERE token_hash = pg_temp.h('p3'))
     OR (SELECT usada_at FROM tienda_recuperaciones WHERE token_hash = pg_temp.h('k2')) IS NOT NULL THEN
    RAISE EXCEPTION 'P: un enlace inválido cambió algo';
  END IF;
  -- Contraseña nueva mal formada: error, y el enlace NO se gasta.
  v_err := NULL;
  BEGIN PERFORM tienda_recuperar_aplicar(v_t, pg_temp.h('k2'), 'corta', pg_temp.h('p3'), v_t0);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN RAISE EXCEPTION 'P: contraseña corta: esperaba CUENTA_INVALIDA_DATOS, dio %', v_err; END IF;
  v_err := NULL;
  BEGIN PERFORM tienda_recuperar_aplicar(v_t, pg_temp.h('k2'), repeat(chr(241), 37), pg_temp.h('p3'), v_t0);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN RAISE EXCEPTION 'P: contraseña de 74 bytes: esperaba CUENTA_INVALIDA_DATOS, dio %', v_err; END IF;
  -- El bueno: cambia la contraseña, cierra TODAS las sesiones, levanta el bloqueo, sella el correo y entra.
  v_r := tienda_recuperar_aplicar(v_t, pg_temp.h('k2'), 'nueva-clave-1', pg_temp.h('p3'), v_t0 + interval '10 minutes');
  IF v_r IS DISTINCT FROM jsonb_build_object('cuenta', c_ana) THEN RAISE EXCEPTION 'P: aplicar: %', v_r; END IF;
  SELECT * INTO v_c FROM tienda_cuentas WHERE id = v_a;
  IF crypt('nueva-clave-1', v_c.password_hash) <> v_c.password_hash OR v_c.bloqueada_hasta IS NOT NULL OR v_c.intentos_fallidos <> 0
     OR v_c.email_verificado_at IS DISTINCT FROM v_t0 + interval '10 minutes' THEN
    RAISE EXCEPTION 'P: aplicar no dejó la cuenta como debía: %', to_jsonb(v_c) - 'password_hash';
  END IF;
  IF (SELECT array_agg(token_hash) FROM tienda_sesiones WHERE cuenta_id = v_a) IS DISTINCT FROM ARRAY[pg_temp.h('p3')] THEN
    RAISE EXCEPTION 'P: aplicar debía dejar solo la sesión nueva';
  END IF;
  IF EXISTS (SELECT 1 FROM tienda_sesiones WHERE token_hash = pg_temp.h('o3')) IS NOT TRUE THEN RAISE EXCEPTION 'P: aplicar cerró sesiones de otro negocio'; END IF;
  -- Un solo uso.
  IF tienda_recuperar_aplicar(v_t, pg_temp.h('k2'), 'otra-mas-123', pg_temp.h('p4'), v_t0 + interval '11 minutes') IS NOT NULL THEN
    RAISE EXCEPTION 'P: el enlace sirvió dos veces';
  END IF;
  IF tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('p5'), v_t0) IS NOT NULL
     OR tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'nueva-clave-1', pg_temp.h('p5'), v_t0) IS NULL THEN
    RAISE EXCEPTION 'P: tras recuperar debe entrar la contraseña nueva y no la vieja';
  END IF;
  -- La segunda recuperación no vuelve a sellar el correo.
  PERFORM tienda_recuperar_pedir(v_t, 'ana.cuenta@example.com', pg_temp.h('k3'), v_t0 + interval '1 hour');
  v_r := tienda_recuperar_aplicar(v_t, pg_temp.h('k3'), c_pw, pg_temp.h('p6'), v_t0 + interval '1 hour');
  IF v_r IS NULL OR (SELECT email_verificado_at FROM tienda_cuentas WHERE id = v_a) IS DISTINCT FROM v_t0 + interval '10 minutes' THEN
    RAISE EXCEPTION 'P: la segunda recuperación falló o movió email_verificado_at';
  END IF;
  -- Pedir barre los enlaces vencidos.
  PERFORM tienda_recuperar_pedir(v_otro, 'nadie@example.com', pg_temp.h('k9'), v_t0 + interval '2 days');
  IF EXISTS (SELECT 1 FROM tienda_recuperaciones) THEN RAISE EXCEPTION 'P: pedir no barrió los enlaces vencidos'; END IF;

  -- ── C) Cambiar la contraseña desde dentro (la vigente es c_pw; la sesión presente, p6) ──
  PERFORM tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', c_pw, pg_temp.h('c1'), v_t0);
  SELECT password_hash INTO v_hash FROM tienda_cuentas WHERE id = v_a;
  IF tienda_cuenta_password(v_t, v_a, 'no-es-esta-1', 'cambiada-456', pg_temp.h('p6'))
     OR tienda_cuenta_password(v_otro, v_a, c_pw, 'cambiada-456', pg_temp.h('p6')) THEN
    RAISE EXCEPTION 'C: cambió la contraseña con la actual mala o desde otro negocio';
  END IF;
  IF (SELECT password_hash FROM tienda_cuentas WHERE id = v_a) <> v_hash OR (SELECT count(*) FROM tienda_sesiones WHERE cuenta_id = v_a) <> 2 THEN
    RAISE EXCEPTION 'C: un cambio rechazado movió la contraseña o las sesiones';
  END IF;
  v_err := NULL;
  BEGIN PERFORM tienda_cuenta_password(v_t, v_a, c_pw, 'corta', pg_temp.h('p6'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN RAISE EXCEPTION 'C: nueva corta: esperaba CUENTA_INVALIDA_DATOS, dio %', v_err; END IF;
  v_err := NULL;
  BEGIN PERFORM tienda_cuenta_password(v_t, v_a, c_pw, repeat(chr(241), 37), pg_temp.h('p6'));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN RAISE EXCEPTION 'C: nueva de 74 bytes: esperaba CUENTA_INVALIDA_DATOS, dio %', v_err; END IF;
  IF NOT tienda_cuenta_password(v_t, v_a, c_pw, 'cambiada-456', pg_temp.h('p6')) THEN RAISE EXCEPTION 'C: no cambió con la actual buena'; END IF;
  IF (SELECT array_agg(token_hash) FROM tienda_sesiones WHERE cuenta_id = v_a) IS DISTINCT FROM ARRAY[pg_temp.h('p6')] THEN
    RAISE EXCEPTION 'C: debía cerrar las demás sesiones y conservar la presente';
  END IF;
  IF tienda_cuenta_entrar(v_t, 'ana.cuenta@example.com', 'cambiada-456', pg_temp.h('c2'), v_t0) IS NULL THEN RAISE EXCEPTION 'C: la contraseña nueva no entra'; END IF;

  -- ── G) Leer y guardar los datos ───────────────────────────────────────────
  v_r := tienda_cuenta_leer(v_t, v_a);
  IF v_r IS DISTINCT FROM jsonb_build_object('cuenta', c_ana, 'direcciones', '[]'::jsonb) THEN RAISE EXCEPTION 'G: leer: %', v_r; END IF;
  IF tienda_cuenta_leer(v_otro, v_a) IS NOT NULL OR tienda_cuenta_leer(v_t, v_b) IS NOT NULL THEN RAISE EXCEPTION 'G: leyó una cuenta desde otro negocio'; END IF;
  v_r := tienda_cuenta_guardar(v_t, v_a, ' Ana María ', 'López Ruiz', '477 555 0202', '1990-05-17');
  IF v_r IS DISTINCT FROM '{"cuenta":{"nombre":"Ana María","apellido":"López Ruiz","email":"ana.cuenta@example.com","telefono":"4775550202","fecha_nacimiento":"1990-05-17"}}'::jsonb THEN
    RAISE EXCEPTION 'G: guardar: %', v_r;
  END IF;
  v_r := tienda_cuenta_guardar(v_otro, v_a, 'Hack', 'Hack', '4770000000', NULL);
  IF v_r IS NOT NULL OR (SELECT nombre FROM tienda_cuentas WHERE id = v_a) <> 'Ana María' THEN
    RAISE EXCEPTION 'G: guardó desde otro negocio';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('nombre vacío', '', 'López', '4775550202', NULL::date), ('apellido vacío', 'Ana', ' ', '4775550202', NULL),
    ('teléfono malo', 'Ana', 'López', 'abc', NULL), ('nacimiento en el futuro', 'Ana', 'López', '4775550202', (now() + interval '2 days')::date),
    ('nacimiento de 1800', 'Ana', 'López', '4775550202', '1800-01-01')
  ) AS x(caso, nombre, apellido, telefono, nacimiento) LOOP
    v_err := NULL;
    BEGIN PERFORM tienda_cuenta_guardar(v_t, v_a, r.nombre, r.apellido, r.telefono, r.nacimiento);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA_DATOS:%' THEN RAISE EXCEPTION 'G %: esperaba CUENTA_INVALIDA_DATOS, dio %', r.caso, v_err; END IF;
  END LOOP;
  -- La fecha se puede quitar, y updated_at lo lleva el disparador.
  IF tienda_cuenta_guardar(v_t, v_a, 'Ana', 'López', '4775550101', NULL) IS DISTINCT FROM jsonb_build_object('cuenta', c_ana) THEN
    RAISE EXCEPTION 'G: no volvió a los datos originales';
  END IF;
  UPDATE tienda_cuentas SET updated_at = '2000-01-01' WHERE id = v_a;
  IF (SELECT updated_at FROM tienda_cuentas WHERE id = v_a) < now() THEN RAISE EXCEPTION 'G: falta el disparador de updated_at'; END IF;
  -- El teléfono de la cuenta, siempre en 10 dígitos.
  BEGIN
    UPDATE tienda_cuentas SET telefono = '+52 477 555 0101' WHERE id = v_a;
    RAISE EXCEPTION 'G: la tabla aceptó un teléfono sin normalizar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── D) Direcciones ────────────────────────────────────────────────────────
  v_r := tienda_direccion_guardar(v_t, v_a, NULL, '  ', v_dir_sucia);
  v_d1 := (v_r -> 0 ->> 'id')::uuid;
  IF v_r - 0 <> '[]'::jsonb OR v_r -> 0 IS DISTINCT FROM jsonb_build_object('id', v_d1, 'etiqueta', 'Casa', 'calle', 'Av. Cuenta',
       'numero_exterior', '12', 'numero_interior', NULL, 'colonia', 'Centro', 'codigo_postal', '37000', 'ciudad', 'León',
       'estado', 'Guanajuato', 'referencias', 'portón verde') THEN
    RAISE EXCEPTION 'D: alta de dirección: %', v_r;
  END IF;
  v_r := tienda_direccion_guardar(v_t, v_a, v_d1, ' Oficina ', v_dir2);
  IF jsonb_array_length(v_r) <> 1 OR v_r -> 0 ->> 'etiqueta' <> 'Oficina' OR v_r -> 0 ->> 'calle' <> 'Calle Dos'
     OR v_r -> 0 ->> 'numero_interior' <> 'B' OR v_r -> 0 -> 'referencias' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'D: edición de dirección: %', v_r;
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('sin calle', v_dir2 - 'calle'), ('código postal de 4', v_dir2 || '{"codigo_postal":"3710"}'),
    ('código postal con letras', v_dir2 || '{"codigo_postal":"3710a"}'), ('NULL', NULL::jsonb), ('no es objeto', '[]'::jsonb),
    ('referencias de 301', v_dir2 || jsonb_build_object('referencias', repeat('r', 301)))
  ) AS x(caso, dir) LOOP
    v_err := NULL;
    BEGIN PERFORM tienda_direccion_guardar(v_t, v_a, NULL, 'Mala', r.dir);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    IF v_err IS NULL OR v_err NOT LIKE 'DIRECCION_INVALIDA:%' THEN RAISE EXCEPTION 'D %: esperaba DIRECCION_INVALIDA, dio %', r.caso, v_err; END IF;
  END LOOP;
  v_err := NULL;
  BEGIN PERFORM tienda_direccion_guardar(v_t, v_a, NULL, repeat('e', 51), v_dir2);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'DIRECCION_INVALIDA:%' THEN RAISE EXCEPTION 'D etiqueta de 51: esperaba DIRECCION_INVALIDA, dio %', v_err; END IF;
  -- Hasta 5; la sexta no entra, pero editar una de las cinco sí.
  FOR v_i IN 2..5 LOOP v_r := tienda_direccion_guardar(v_t, v_a, NULL, 'Otra ' || v_i, v_dir2); END LOOP;
  IF jsonb_array_length(v_r) <> 5 THEN RAISE EXCEPTION 'D: esperaba 5 direcciones, hay %', jsonb_array_length(v_r); END IF;
  v_err := NULL;
  BEGIN PERFORM tienda_direccion_guardar(v_t, v_a, NULL, 'Sexta', v_dir2);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'DIRECCIONES_LLENAS:%' THEN RAISE EXCEPTION 'D: la sexta: esperaba DIRECCIONES_LLENAS, dio %', v_err; END IF;
  IF tienda_direccion_guardar(v_t, v_a, v_d1, 'Casa', v_dir2) -> 0 ->> 'etiqueta' <> 'Casa' THEN RAISE EXCEPTION 'D: con 5 no dejó editar'; END IF;
  -- La dirección de otra cuenta, o la propia desde otro negocio: no se toca (ni se crea una nueva).
  v_r := tienda_direccion_guardar(v_t, v_beto, v_d1, 'Robada', v_dir2);
  IF v_r <> '[]'::jsonb THEN RAISE EXCEPTION 'D: editar la dirección de otra cuenta devolvió %', v_r; END IF;
  v_r := tienda_direccion_borrar(v_t, v_beto, v_d1);
  PERFORM tienda_direccion_borrar(v_otro, v_a, v_d1);
  PERFORM tienda_direccion_borrar(v_otro, v_b, v_d1);
  IF v_r <> '[]'::jsonb OR (SELECT etiqueta FROM tienda_direcciones WHERE id = v_d1) IS DISTINCT FROM 'Casa'
     OR (SELECT count(*) FROM tienda_direcciones) <> 5 THEN
    RAISE EXCEPTION 'D: se tocó la dirección de otra cuenta';
  END IF;
  v_err := NULL;
  BEGIN PERFORM tienda_direccion_guardar(v_otro, v_a, NULL, 'Casa', v_dir2);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'CUENTA_INVALIDA:%' THEN RAISE EXCEPTION 'D: alta desde otro negocio: esperaba CUENTA_INVALIDA, dio %', v_err; END IF;
  v_r := tienda_direccion_borrar(v_t, v_a, v_d1);
  IF jsonb_array_length(v_r) <> 4 OR v_r @> jsonb_build_array(jsonb_build_object('id', v_d1)) THEN RAISE EXCEPTION 'D: borrar: %', v_r; END IF;
  IF tienda_cuenta_leer(v_t, v_a) -> 'direcciones' IS DISTINCT FROM v_r THEN RAISE EXCEPTION 'D: leer la cuenta no trae las mismas direcciones'; END IF;

  -- ── M) Mis pedidos ────────────────────────────────────────────────────────
  -- Pedir con cuenta sigue funcionando. Dos de Ana (recoger con extra y nota; domicilio), uno de Beto, uno de invitado.
  v_carrito := format('[{"producto_id":"%s","cantidad":2,"nota":"sin cebolla","modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o15)::jsonb;
  v_ped := (tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_carrito, '{"nombre":"Ana Cuenta","telefono":"4775550777"}', NULL,
              'EFECTIVO', NULL, NULL, pg_temp.h('seg1'), v_a) ->> 'pedido_id')::uuid;
  v_ped2 := (tienda_crear_pedido(v_t, v_suc, 'DOMICILIO', v_z35, format('[{"producto_id":"%s","cantidad":1}]', v_p120)::jsonb,
              '{"nombre":"Ana Cuenta","telefono":"4775550778"}', v_dir2, 'EFECTIVO', NULL, NULL, pg_temp.h('seg2'), v_a) ->> 'pedido_id')::uuid;
  v_combo_carrito := format('[{"producto_id":"%s","cantidad":2,"nota":null,"modificadores":[],"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                            v_combo, v_slot, v_p120, v_o15)::jsonb;
  PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_combo_carrito, '{"nombre":"Beto","telefono":"4775550779"}', NULL, 'EFECTIVO', NULL, NULL, pg_temp.h('seg3'), v_beto);
  PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL, v_carrito, '{"nombre":"Invitado","telefono":"4775550780"}', NULL, 'EFECTIVO', NULL, NULL, pg_temp.h('seg4'));
  IF (SELECT tienda_cuenta_id FROM delivery_pedidos WHERE id = v_ped) IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'M: el pedido no quedó ligado a la cuenta'; END IF;
  UPDATE delivery_pedidos SET recibido_at = now() - interval '1 hour' WHERE id = v_ped2;   -- el de domicilio, más viejo

  v_r := tienda_mis_pedidos(v_t, v_a);
  IF jsonb_array_length(v_r) <> 2 THEN RAISE EXCEPTION 'M: Ana debía ver sus 2 pedidos: %', v_r; END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_r -> 0) k)
       IS DISTINCT FROM ARRAY['estado', 'folio_corto', 'items', 'modo', 'recibido_at', 'renglones', 'sucursal_id', 'total_mxn'] THEN
    RAISE EXCEPTION 'M: claves de un pedido: %', v_r -> 0;
  END IF;
  -- El más reciente primero; nada de teléfono, dirección ni seguimiento.
  IF v_r -> 0 ->> 'folio_corto' IS DISTINCT FROM (SELECT folio_corto FROM delivery_pedidos WHERE id = v_ped)
     OR v_r -> 0 ->> 'modo' <> 'RECOGER' OR v_r -> 1 ->> 'modo' <> 'DOMICILIO'
     OR v_r -> 0 ->> 'sucursal_id' IS DISTINCT FROM v_suc::text   -- para que «pedir de nuevo» sepa de qué sucursal era
     OR v_r -> 0 ->> 'total_mxn' <> '270.00' OR v_r -> 1 ->> 'total_mxn' <> '155.00'
     OR v_r -> 0 -> 'renglones' IS DISTINCT FROM '[{"nombre":"Sencilla cuentas","cantidad":2,"detalle":"Extra queso"}]'::jsonb
     OR (v_r -> 0 ->> 'recibido_at')::timestamptz IS DISTINCT FROM (SELECT recibido_at FROM delivery_pedidos WHERE id = v_ped) THEN
    RAISE EXCEPTION 'M: contenido de mis pedidos: %', v_r;
  END IF;
  IF v_r::text LIKE '%477555077%' OR v_r::text LIKE '%Calle Dos%' OR v_r::text LIKE '%' || pg_temp.h('seg1') || '%' OR v_r::text LIKE '%Ana Cuenta%' THEN
    RAISE EXCEPTION 'M: mis pedidos deja salir teléfono, dirección, nombre o seguimiento: %', v_r;
  END IF;
  -- `items` es el carrito tal como se pidió: cotizarlo otra vez da el mismo total.
  IF v_r -> 0 -> 'items' IS DISTINCT FROM format('[{"producto_id":"%s","cantidad":2,"nota":"sin cebolla","modificadores":[{"opcion_id":"%s","cantidad":1}],"componentes":[]}]', v_p120, v_o15)::jsonb
     OR tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_r -> 0 -> 'items') ->> 'total_mxn' <> '270.00' THEN
    RAISE EXCEPTION 'M: items no es el carrito: %', v_r -> 0 -> 'items';
  END IF;
  -- Un combo vuelve con sus elecciones en `componentes` (y los extras de cada una), y cotiza igual.
  v_r2 := tienda_mis_pedidos(v_t, v_beto);
  IF v_r2 -> 0 -> 'items' IS DISTINCT FROM v_combo_carrito
     OR tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_r2 -> 0 -> 'items') ->> 'total_mxn' IS DISTINCT FROM v_r2 -> 0 ->> 'total_mxn'
     OR v_r2 -> 0 ->> 'total_mxn' <> '330.00' THEN
    RAISE EXCEPTION 'M: el combo no volvió como carrito: %', v_r2 -> 0;
  END IF;
  -- El estado, con la misma regla que el seguimiento: recibido, aceptado (ticket), impreso (derivado del ticket).
  IF v_r -> 0 ->> 'estado' <> 'EN_PROCESO' THEN RAISE EXCEPTION 'M: recién creado: %', v_r -> 0 ->> 'estado'; END IF;
  v_ticket := crear_ticket_desde_tienda(v_ped);
  IF tienda_mis_pedidos(v_t, v_a) -> 0 ->> 'estado' <> 'EN_PREPARACION' THEN RAISE EXCEPTION 'M: aceptado: esperaba EN_PREPARACION'; END IF;
  UPDATE tickets SET ticket_impreso_at = now() WHERE id = v_ticket;
  v_seg := tienda_seguimiento(v_t, pg_temp.h('seg1'));
  IF tienda_mis_pedidos(v_t, v_a) -> 0 ->> 'estado' <> 'LISTO_PARA_RECOGER' OR v_seg ->> 'estado' <> 'LISTO_PARA_RECOGER' THEN
    RAISE EXCEPTION 'M: impreso: mis pedidos % y seguimiento %', tienda_mis_pedidos(v_t, v_a) -> 0 ->> 'estado', v_seg ->> 'estado';
  END IF;
  UPDATE delivery_pedidos SET estado = 'LISTO' WHERE id = v_ped2;
  IF tienda_mis_pedidos(v_t, v_a) -> 1 ->> 'estado' <> 'EN_CAMINO' THEN RAISE EXCEPTION 'M: LISTO a domicilio: esperaba EN_CAMINO'; END IF;
  -- Solo los de esa cuenta y ese negocio.
  IF jsonb_array_length(tienda_mis_pedidos(v_t, v_beto)) <> 1 OR tienda_mis_pedidos(v_otro, v_a) <> '[]'::jsonb
     OR tienda_mis_pedidos(v_t, v_b) <> '[]'::jsonb OR tienda_mis_pedidos(v_t, NULL) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'M: mis pedidos enseñó pedidos de otra cuenta o de otro negocio';
  END IF;
  -- Anonimizado por la retención: sigue en la lista, sin `items` (ya no se puede «pedir de nuevo»).
  UPDATE delivery_pedidos SET estado = 'ENTREGADO', recibido_at = now() - interval '40 days' WHERE id = v_ped2;
  PERFORM delivery_anonimizar_pedidos_viejos(30);
  v_r := tienda_mis_pedidos(v_t, v_a);
  IF jsonb_array_length(v_r) <> 2 OR v_r -> 1 -> 'items' <> 'null'::jsonb OR v_r -> 1 ->> 'estado' <> 'ENTREGADO'
     OR jsonb_array_length(v_r -> 1 -> 'renglones') <> 1 OR jsonb_typeof(v_r -> 0 -> 'items') <> 'array' THEN
    RAISE EXCEPTION 'M: pedido anonimizado: %', v_r;
  END IF;
  -- Los últimos 20.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, conexion_id, estado, tipo_entrega, id_externo, folio_corto,
                                items, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn, tienda_cuenta_id, gestion, payload_raw, recibido_at)
  SELECT d.tenant_id, d.sucursal_id, d.canal, d.app, NULL, 'ENTREGADO', d.tipo_entrega, md5('veinte-' || g), 'V' || g,
         d.items, d.total_cliente_mxn, d.total_restaurante_mxn, d.efectivo_a_cobrar_mxn, v_beto, d.gestion, '{}'::jsonb, now() - make_interval(days => g)
    FROM delivery_pedidos d, generate_series(1, 21) g WHERE d.id = v_ped;
  v_r := tienda_mis_pedidos(v_t, v_beto);
  IF jsonb_array_length(v_r) <> 20 OR v_r -> 19 ->> 'folio_corto' <> 'V19' THEN
    RAISE EXCEPTION 'M: esperaba los 20 más recientes de Beto, dio % (el último: %)', jsonb_array_length(v_r), v_r -> 19 ->> 'folio_corto';
  END IF;

  -- ── X) Eliminar la cuenta ─────────────────────────────────────────────────
  PERFORM tienda_recuperar_pedir(v_t, 'ana.cuenta@example.com', pg_temp.h('k7'), now());
  IF tienda_cuenta_eliminar(v_t, v_a, 'no-es-esta-1') OR tienda_cuenta_eliminar(v_otro, v_a, 'cambiada-456')
     OR tienda_cuenta_eliminar(v_t, v_a, NULL) THEN
    RAISE EXCEPTION 'X: eliminó con la contraseña mala o desde otro negocio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tienda_cuentas WHERE id = v_a) OR (SELECT count(*) FROM tienda_direcciones WHERE cuenta_id = v_a) <> 4
     OR NOT EXISTS (SELECT 1 FROM tienda_sesiones WHERE cuenta_id = v_a)
     OR (SELECT count(*) FROM delivery_pedidos WHERE tienda_cuenta_id = v_a) <> 2 THEN
    RAISE EXCEPTION 'X: un intento rechazado borró algo';
  END IF;
  SELECT count(*) INTO v_n FROM delivery_pedidos WHERE tenant_id = v_t;
  IF NOT tienda_cuenta_eliminar(v_t, v_a, 'cambiada-456') THEN RAISE EXCEPTION 'X: no eliminó con la contraseña buena'; END IF;
  IF EXISTS (SELECT 1 FROM tienda_cuentas WHERE id = v_a) OR EXISTS (SELECT 1 FROM tienda_sesiones WHERE cuenta_id = v_a)
     OR EXISTS (SELECT 1 FROM tienda_direcciones WHERE cuenta_id = v_a) OR EXISTS (SELECT 1 FROM tienda_recuperaciones WHERE cuenta_id = v_a) THEN
    RAISE EXCEPTION 'X: quedó la cuenta, o sus sesiones, direcciones o enlaces';
  END IF;
  -- Sus pedidos siguen (son del restaurante), desligados; los de Beto, intactos.
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE tienda_cuenta_id = v_a)
     OR (SELECT count(*) FROM delivery_pedidos WHERE tenant_id = v_t) <> v_n
     OR (SELECT tienda_cuenta_id FROM delivery_pedidos WHERE id = v_ped) IS NOT NULL
     OR (SELECT count(*) FROM delivery_pedidos WHERE tienda_cuenta_id = v_beto) <> 22
     OR NOT EXISTS (SELECT 1 FROM tienda_cuentas WHERE id = v_b) THEN
    RAISE EXCEPTION 'X: los pedidos no quedaron desligados, o se tocó lo de otra cuenta';
  END IF;
  IF tienda_cuenta_leer(v_t, v_a) IS NOT NULL OR tienda_sesion_cuenta(v_t, pg_temp.h('p6')) IS NOT NULL THEN RAISE EXCEPTION 'X: la cuenta eliminada sigue contestando'; END IF;
  -- El correo queda libre: se puede registrar de nuevo, y es otra cuenta, sin pedidos.
  v_r := tienda_cuenta_registrar(v_t, 'Ana', 'López', 'ana.cuenta@example.com', '4775550101', c_pw, pg_temp.h('x1'));
  IF (v_r ->> 'creada')::boolean IS NOT TRUE OR tienda_mis_pedidos(v_t, tienda_sesion_cuenta(v_t, pg_temp.h('x1'))) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'X: tras eliminar no se pudo registrar de nuevo, o heredó pedidos';
  END IF;

  -- ── Z) Privilegios ────────────────────────────────────────────────────────
  -- Ninguna función de cuentas (ni las internas) es de anon ni de authenticated; las públicas, de service_role.
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ') FILTER (WHERE
           has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR has_function_privilege('public', p.oid, 'EXECUTE')
           OR (p.proname NOT LIKE '\_%' AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))
           OR NOT p.prosecdef OR p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    INTO v_n, v_abierto
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('tienda_cuenta_registrar', 'tienda_cuenta_entrar', 'tienda_sesion_cuenta', 'tienda_cuenta_salir',
                       'tienda_recuperar_pedir', 'tienda_recuperar_aplicar', 'tienda_cuenta_leer', 'tienda_cuenta_guardar',
                       'tienda_cuenta_password', 'tienda_direccion_guardar', 'tienda_direccion_borrar', 'tienda_mis_pedidos',
                       'tienda_cuenta_eliminar', 'tienda_seguimiento',
                       '_tienda_telefono', '_tienda_cuenta_publica', '_tienda_direcciones', '_tienda_abrir_sesion',
                       '_tienda_password_ok', '_tienda_estado_real', '_tienda_estado_publico', '_tienda_renglones');
  IF v_n <> 22 THEN RAISE EXCEPTION 'Z: esperaba 22 funciones (sin sobrecargas), hay %', v_n; END IF;
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION 'Z: funciones con privilegios de más, sin definer o sin search_path fijo: %', v_abierto; END IF;
  SELECT string_agg(format('%s %s en %s', rol, p, t), ', ') INTO v_abierto
    FROM unnest(ARRAY['tienda_cuentas', 'tienda_sesiones', 'tienda_recuperaciones', 'tienda_direcciones']) t,
         unnest(ARRAY['anon', 'authenticated']) rol,
         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   WHERE has_table_privilege(rol, t, p);
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION 'Z: tablas de cuentas con privilegios de más: %', v_abierto; END IF;

  RAISE NOTICE 'smoke_tienda_cuentas: OK';
END $$;
ROLLBACK;
