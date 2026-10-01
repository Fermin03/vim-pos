-- Smoke de la 0147 (ADR 0024): sucursal adicional y caja adicional como extras por cantidad.
--
-- LA REGLA DE LAS CAJAS (decisión del dueño, 1 oct 2026): "$249 por cada caja nueva que se abra".
-- La base del plan es POR SUCURSAL; `CAJA_EXTRA.cantidad` son cajas adicionales para TODO el
-- negocio, usables en la sucursal que sea. Una caja se puede abrir si su sucursal está por debajo
-- de la base o si queda una adicional pagada sin usar.
--
-- Lo que se protege: esa regla con dos sucursales; que no se pueda quitar un extra en uso; que
-- cambiar la cantidad el mismo día no reviente con addon_unico_activo; que al volver a contratar
-- se conserve el precio pactado; la precedencia excepción → plan; que CAJA_EXTRA no entre en un
-- plan sin límite de cajas; y qué pasa al cambiar de plan (se conservan, se retiran o se rechaza).
--
-- "Hoy" siempre en hora de México, nunca CURRENT_DATE (el servidor es UTC).
BEGIN;

DO $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_tenant   uuid := gen_random_uuid();
  v_suc1     uuid := gen_random_uuid();
  v_suc2     uuid := gen_random_uuid();
  v_esencial uuid;
  v_negocio  uuid;
  v_cadena   uuid;
  v_caja_x   uuid;
  v_suc_x    uuid;
  v_c12      uuid := gen_random_uuid();   -- segunda caja de la sucursal 1
  v_c22      uuid := gen_random_uuid();   -- segunda caja de la sucursal 2
  r          jsonb;
  l          jsonb;
  v_n        int;
  v_hint     text;
BEGIN
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_cadena   FROM planes WHERE codigo = 'CADENA';
  SELECT id INTO v_caja_x FROM addons WHERE codigo = 'CAJA_EXTRA';
  SELECT id INTO v_suc_x  FROM addons WHERE codigo = 'SUCURSAL_EXTRA';
  IF v_esencial IS NULL OR v_negocio IS NULL OR v_cadena IS NULL THEN RAISE EXCEPTION 'faltan los planes de 0086'; END IF;
  IF v_caja_x IS NULL OR v_suc_x IS NULL THEN RAISE EXCEPTION 'faltan los extras en el catálogo (0147)'; END IF;
  IF (SELECT precio_mensual_mxn FROM addons WHERE id = v_suc_x) <> 599 OR (SELECT precio_mensual_mxn FROM addons WHERE id = v_caja_x) <> 249 THEN
    RAISE EXCEPTION 'los precios de catálogo deben ser los del sitio: $599 y $249';
  END IF;

  -- Un negocio en Esencial: 1 sucursal, 1 caja por sucursal.
  INSERT INTO tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
  VALUES (v_tenant, 'smoke-extras-' || substr(v_tenant::text, 1, 8), 'Extras Smoke', 'QUICK_SERVICE', 'ACTIVO', v_esencial);
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_suc1, v_tenant, 'X1', 'Centro');
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc1, 1, 'Caja 1');

  -- ── 1) Sin extras, el plan manda ─────────────────────────────────────────
  l := limites_efectivos(v_tenant);
  IF (l->>'max_cajas_por_sucursal')::int <> 1 OR (l->>'max_sucursales')::int <> 1
     OR (l->>'cajas_adicionales')::int <> 0 OR (l->>'cajas_adicionales_en_uso')::int <> 0 THEN
    RAISE EXCEPTION 'Esencial sin extras debía dar 1 sucursal, 1 caja y 0 adicionales: %', l;
  END IF;
  BEGIN
    INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_c12, v_tenant, v_suc1, 2, 'Caja 2');
    RAISE EXCEPTION 'dejó crear la segunda caja sin extra';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Tu plan permite 1 caja(s) por sucursal y ya usas 0 de 0 caja(s) adicional(es)%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%$249 al mes%' THEN RAISE EXCEPTION 'el rechazo no dice lo que cuesta la caja adicional: %', SQLERRM; END IF;
  END;

  -- ── 2) Una caja adicional: la base por sucursal NO cambia; hay una adicional libre ──
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  IF (r->>'cantidad_antes')::int <> 0 OR (r->>'cantidad_despues')::int <> 1 OR (r->>'base')::int <> 1
     OR (r->>'en_uso')::int <> 0 OR (r->>'precio_unitario')::numeric <> 249 OR (r->>'importe_mensual')::numeric <> 249 THEN
    RAISE EXCEPTION 'el alta del extra devolvió %', r;
  END IF;
  l := limites_efectivos(v_tenant);
  IF (l->>'max_cajas_por_sucursal')::int <> 1 OR (l->>'cajas_adicionales')::int <> 1 OR (l->>'cajas_adicionales_en_uso')::int <> 0 THEN
    RAISE EXCEPTION 'con una caja adicional debía decir base 1 + 1 adicional (0 en uso): %', l;
  END IF;
  -- La caja recibe lo mismo en sus directivas.
  l := resolver_directivas(v_tenant, NULL)->'limites';
  IF (l->>'max_cajas_por_sucursal')::int <> 1 OR (l->>'cajas_adicionales')::int <> 1 THEN
    RAISE EXCEPTION 'las directivas no llevan la base y las adicionales: %', l;
  END IF;
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_c12, v_tenant, v_suc1, 2, 'Caja 2');
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales_en_uso')::int <> 1 THEN RAISE EXCEPTION 'la segunda caja debía ocupar la adicional'; END IF;
  BEGIN
    INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc1, 3, 'Caja 3');
    RAISE EXCEPTION 'dejó crear una tercera caja con una sola adicional';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ya usas 1 de 1 caja(s) adicional(es)%' THEN RAISE; END IF;
  END;

  -- ── 3) Cambiar la cantidad EL MISMO DÍA actualiza la fila (addon_unico_activo) ──
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 3, 200.00, 'precio pactado por volumen');
  IF (r->>'cantidad_antes')::int <> 1 OR (r->>'cantidad_despues')::int <> 3 OR (r->>'importe_mensual')::numeric <> 600 OR (r->>'en_uso')::int <> 1 THEN
    RAISE EXCEPTION 'el cambio de cantidad devolvió %', r;
  END IF;
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 1 THEN RAISE EXCEPTION 'cambiar la cantidad el mismo día debía dejar UNA fila, hay %', v_n; END IF;
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 3);
    RAISE EXCEPTION 'aceptó un cambio que no cambia nada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'SIN_CAMBIOS' THEN RAISE; END IF; END;

  -- ── 4) No se puede bajar por debajo de las adicionales EN USO (1) ───────────
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
    RAISE EXCEPTION 'dejó quitar el extra con una caja adicional en uso';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLERRM <> 'EXTRA_EN_USO' THEN RAISE; END IF;
    IF v_hint NOT LIKE 'Tiene 1 caja(s) adicional(es) en uso y quedarían 0%' THEN RAISE EXCEPTION 'el motivo no dice cuántas usa: %', v_hint; END IF;
  END;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);   -- bajar a 1 sí cabe
  IF (r->>'precio_unitario')::numeric <> 200 THEN RAISE EXCEPTION 'al bajar debía conservar el precio pactado ($200): %', r; END IF;

  -- ── 5) Otro día: se cierra la fila vigente y se abre otra (queda la historia) ──
  UPDATE tenant_addons SET fecha_inicio = v_hoy - 10 WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 2);
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 2 THEN RAISE EXCEPTION 'otro día debía dejar dos filas (historia + vigente), hay %', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x AND NOT activo AND fecha_fin = v_hoy AND cantidad = 1) THEN
    RAISE EXCEPTION 'la fila anterior no quedó cerrada hoy con su cantidad';
  END IF;
  -- Quitar y volver a poner el mismo día reactiva la fila de hoy, con el precio PACTADO.
  UPDATE cajas SET activa = false WHERE id = v_c12;
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales')::int <> 0 THEN RAISE EXCEPTION 'quitar el extra no lo quitó'; END IF;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 2 THEN RAISE EXCEPTION 'quitar y volver a poner el mismo día insertó otra fila (hay %)', v_n; END IF;
  IF (r->>'precio_unitario')::numeric <> 200 THEN RAISE EXCEPTION 'al volver a contratar debía conservar el precio pactado ($200), puso %', r->>'precio_unitario'; END IF;
  -- También días después…
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
  UPDATE tenant_addons SET fecha_inicio = fecha_inicio - 30, fecha_fin = v_hoy - 5 WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  IF (r->>'precio_unitario')::numeric <> 200 THEN RAISE EXCEPTION 'días después debía conservar el último precio pactado ($200), puso %', r->>'precio_unitario'; END IF;
  -- …salvo que se mande un precio nuevo.
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1, 249.00);
  IF (r->>'precio_unitario')::numeric <> 249 THEN RAISE EXCEPTION 'un precio explícito debía mandar, puso %', r->>'precio_unitario'; END IF;

  -- ── 6) Sucursal adicional: cada una es una sucursal más ────────────────────
  BEGIN
    INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_suc2, v_tenant, 'X2', 'Norte');
    RAISE EXCEPTION 'dejó crear la segunda sucursal sin extra';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Tu plan permite 1 sucursal(es)%' THEN RAISE; END IF;
  END;
  r := fijar_extra_tenant(v_tenant, 'SUCURSAL_EXTRA', 1);
  IF (r->>'limite_despues')::int <> 2 OR (r->>'precio_unitario')::numeric <> 599 THEN RAISE EXCEPTION 'sucursal extra devolvió %', r; END IF;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_suc2, v_tenant, 'X2', 'Norte');
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'SUCURSAL_EXTRA', 0);
    RAISE EXCEPTION 'dejó quitar la sucursal extra con dos sucursales activas';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'EXTRA_EN_USO' THEN RAISE; END IF; END;

  -- ── 7) DOS SUCURSALES, base 1 cada una, UNA caja adicional ─────────────────
  -- Sucursal 1 tiene su caja 1 (la 2 quedó desactivada). La sucursal 2 abre la suya: está en su base.
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc2, 1, 'Caja 1 Norte');
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales_en_uso')::int <> 0 THEN RAISE EXCEPTION 'una caja por sucursal no debía ocupar ninguna adicional'; END IF;
  -- La TERCERA caja del negocio cabe en cualquiera de las dos: aquí, en la sucursal 2.
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_c22, v_tenant, v_suc2, 2, 'Caja 2 Norte');
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales_en_uso')::int <> 1 THEN RAISE EXCEPTION 'la tercera caja debía ocupar la adicional'; END IF;
  -- La CUARTA no: la adicional ya está en uso, en la sucursal que sea. (Antes de esta regla, una
  -- adicional valía una por sucursal y esta caja pasaba.)
  BEGIN
    UPDATE cajas SET activa = true WHERE id = v_c12;
    RAISE EXCEPTION 'dejó abrir una cuarta caja con UNA sola adicional (se estaría regalando una caja por sucursal)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ya usas 1 de 1 caja(s) adicional(es)%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc2, 3, 'Caja 3 Norte');
    RAISE EXCEPTION 'dejó abrir una cuarta caja en la otra sucursal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ya usas 1 de 1 caja(s) adicional(es)%' THEN RAISE; END IF;
  END;
  -- La adicional es del negocio, no de una sucursal: se libera en la 2 y se usa en la 1.
  UPDATE cajas SET activa = false WHERE id = v_c22;
  UPDATE cajas SET activa = true WHERE id = v_c12;
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales_en_uso')::int <> 1 THEN RAISE EXCEPTION 'la adicional debía poder usarse en la otra sucursal'; END IF;
  -- Y en uso no se puede quitar.
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
    RAISE EXCEPTION 'dejó quitar la caja adicional estando en uso';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'EXTRA_EN_USO' THEN RAISE; END IF; END;

  -- ── 8) Precedencia: la excepción reemplaza al plan como BASE por sucursal ──
  INSERT INTO tenant_limites (tenant_id, max_cajas_por_sucursal, motivo) VALUES (v_tenant, 2, 'smoke: cortesía');
  l := limites_efectivos(v_tenant);
  IF (l->>'max_cajas_por_sucursal')::int <> 2 OR (l->>'cajas_adicionales')::int <> 1 OR (l->>'cajas_adicionales_en_uso')::int <> 0 THEN
    RAISE EXCEPTION 'con excepción de 2 por sucursal la segunda caja ya no ocupa la adicional: %', l;
  END IF;
  IF (l->'del_plan'->>'max_cajas_por_sucursal')::int <> 1 OR (l->'excepcion'->>'max_cajas_por_sucursal')::int <> 2 THEN
    RAISE EXCEPTION 'el desglose del panel (del_plan / excepcion) cambió: %', l;
  END IF;
  DELETE FROM tenant_limites WHERE tenant_id = v_tenant;

  -- ── 9) Validaciones ──────────────────────────────────────────────────────
  BEGIN PERFORM fijar_extra_tenant(v_tenant, 'CFDI', 1); RAISE EXCEPTION 'aceptó un add-on que no es por cantidad';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'EXTRA_INVALIDO' THEN RAISE; END IF; END;
  BEGIN PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', -1); RAISE EXCEPTION 'aceptó una cantidad negativa';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'CANTIDAD_INVALIDA' THEN RAISE; END IF; END;
  BEGIN PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 2, -5); RAISE EXCEPTION 'aceptó un precio negativo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'PRECIO_INVALIDO' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, precio_mensual_mxn, cantidad) VALUES (v_tenant, v_caja_x, v_hoy - 400, 249, 0);
    RAISE EXCEPTION 'la tabla aceptó cantidad 0';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- ── 10) Cambio de plan ────────────────────────────────────────────────────
  -- Esencial → Negocio (3 cajas por sucursal): los extras se conservan; ya nada ocupa la adicional.
  r := cambiar_plan_tenant(v_tenant, v_negocio);
  IF r->'addons'->'retirados' @> '["CAJA_EXTRA"]'::jsonb OR r->'addons'->'retirados' @> '["SUCURSAL_EXTRA"]'::jsonb THEN
    RAISE EXCEPTION 'subir a Negocio no debía retirar extras: %', r->'addons';
  END IF;
  l := limites_efectivos(v_tenant);
  IF (l->>'max_cajas_por_sucursal')::int <> 3 OR (l->>'cajas_adicionales')::int <> 1 OR (l->>'cajas_adicionales_en_uso')::int <> 0
     OR (l->>'max_sucursales')::int <> 2 THEN
    RAISE EXCEPTION 'en Negocio debía dar 3 por sucursal + 1 adicional (0 en uso) y 2 sucursales: %', l;
  END IF;

  -- Negocio → Esencial con cajas que no caben: la sucursal 1 abre su tercera (cabe en Negocio).
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc1, 3, 'Caja 3');
  BEGIN
    PERFORM cambiar_plan_tenant(v_tenant, v_esencial);
    RAISE EXCEPTION 'dejó bajar a Esencial con dos cajas de más y una sola adicional';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLERRM <> 'CAJAS_EXCEDEN_PLAN' THEN RAISE; END IF;
    IF v_hint NOT LIKE '%Tiene 2 caja(s) de más y 1 adicional(es) contratada(s)%' THEN RAISE EXCEPTION 'el motivo no dice los números: %', v_hint; END IF;
  END;
  IF (SELECT plan_actual_id FROM tenants WHERE id = v_tenant) <> v_negocio THEN RAISE EXCEPTION 'el cambio rechazado no debía mover el plan'; END IF;
  -- Con otra adicional contratada, sí cabe.
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 2);
  PERFORM cambiar_plan_tenant(v_tenant, v_esencial);
  IF (limites_efectivos(v_tenant)->>'cajas_adicionales_en_uso')::int <> 2 THEN RAISE EXCEPTION 'en Esencial las dos cajas de más debían ocupar las dos adicionales'; END IF;

  -- Esencial → Cadena: cajas sin límite, CAJA_EXTRA ya no tiene sentido y se retira.
  r := cambiar_plan_tenant(v_tenant, v_cadena);
  IF NOT (r->'addons'->'retirados' @> '["CAJA_EXTRA"]'::jsonb) THEN RAISE EXCEPTION 'subir a Cadena debía retirar CAJA_EXTRA: %', r->'addons'; END IF;
  IF r->'addons'->'retirados' @> '["SUCURSAL_EXTRA"]'::jsonb THEN RAISE EXCEPTION 'Cadena sí limita sucursales: SUCURSAL_EXTRA se conserva'; END IF;
  l := limites_efectivos(v_tenant);
  IF l->>'max_cajas_por_sucursal' IS NOT NULL OR (l->>'cajas_adicionales')::int <> 0 OR (l->>'cajas_adicionales_en_uso')::int <> 0 THEN
    RAISE EXCEPTION 'Cadena debía quedar sin límite de cajas y sin adicionales: %', l;
  END IF;
  IF (l->>'max_sucursales')::int <> 4 THEN RAISE EXCEPTION 'Cadena (3) + 1 sucursal extra debía dar 4'; END IF;
  -- Y en Cadena no se puede contratar una caja adicional.
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
    RAISE EXCEPTION 'aceptó una caja adicional en un plan con cajas sin límite';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLERRM <> 'SIN_LIMITE' THEN RAISE; END IF;
    IF v_hint NOT LIKE '%cajas sin límite%' THEN RAISE EXCEPTION 'el motivo no explica por qué: %', v_hint; END IF;
  END;

  RAISE NOTICE '✅ smoke_extras: una caja adicional es UNA caja para todo el negocio; mismo día, en uso, precio pactado, sin límite y cambio de plan';
END $$;

ROLLBACK;
