-- Smoke de la 0147 (ADR 0024): sucursal adicional y caja adicional como extras por cantidad.
--
-- Lo que se protege, de punta a punta: que un extra suba el límite que aplican los candados de
-- cajas y sucursales; la precedencia excepción → plan → + extras; que cambiar la cantidad el mismo
-- día no reviente con addon_unico_activo; que no se pueda quitar un extra que el cliente está
-- usando; que CAJA_EXTRA no entre en un plan sin límite de cajas; y qué pasa con los extras al
-- cambiar de plan.
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
  r          jsonb;
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
  IF (limites_efectivos(v_tenant)->>'max_cajas_por_sucursal')::int <> 1 OR (limites_efectivos(v_tenant)->>'max_sucursales')::int <> 1 THEN
    RAISE EXCEPTION 'Esencial sin extras debía dar 1 y 1, dio %', limites_efectivos(v_tenant);
  END IF;
  BEGIN
    INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc1, 2, 'Caja 2');
    RAISE EXCEPTION 'dejó crear la segunda caja sin extra';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Tu plan permite 1 caja(s)%' THEN RAISE; END IF;
  END;

  -- ── 2) Un extra de caja sube el límite y deja crear la caja ──────────────
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  IF (r->>'cantidad_antes')::int <> 0 OR (r->>'cantidad_despues')::int <> 1 OR (r->>'limite_despues')::int <> 2
     OR (r->>'precio_unitario')::numeric <> 249 OR (r->>'importe_mensual')::numeric <> 249 THEN
    RAISE EXCEPTION 'el alta del extra devolvió %', r;
  END IF;
  IF (limites_efectivos(v_tenant)->>'max_cajas_por_sucursal')::int <> 2 THEN RAISE EXCEPTION 'el extra no subió el límite de cajas'; END IF;
  -- Lo que viaja a la caja en las directivas es el número final.
  IF (resolver_directivas(v_tenant, NULL)->'limites'->>'max_cajas_por_sucursal')::int <> 2 THEN
    RAISE EXCEPTION 'las directivas no llevan el límite con extras: %', resolver_directivas(v_tenant, NULL)->'limites';
  END IF;
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_tenant, v_suc1, 2, 'Caja 2');

  -- ── 3) Cambiar la cantidad EL MISMO DÍA actualiza la fila (addon_unico_activo) ──
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 3, 200.00, 'precio pactado por volumen');
  IF (r->>'cantidad_antes')::int <> 1 OR (r->>'limite_despues')::int <> 4 OR (r->>'importe_mensual')::numeric <> 600 THEN
    RAISE EXCEPTION 'el cambio de cantidad devolvió %', r;
  END IF;
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 1 THEN RAISE EXCEPTION 'cambiar la cantidad el mismo día debía dejar UNA fila, hay %', v_n; END IF;
  IF (SELECT cantidad FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x AND activo) <> 3 THEN RAISE EXCEPTION 'la fila no quedó con cantidad 3'; END IF;

  -- La misma cantidad sin tocar el precio no es un cambio.
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 3);
    RAISE EXCEPTION 'aceptó un cambio que no cambia nada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'SIN_CAMBIOS' THEN RAISE; END IF; END;

  -- ── 4) No se puede bajar por debajo de lo que ya usa (2 cajas activas) ──
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
    RAISE EXCEPTION 'dejó quitar el extra con dos cajas activas';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLERRM <> 'EXTRA_EN_USO' THEN RAISE; END IF;
    IF v_hint NOT LIKE 'Tiene 2 cajas activas%quedaría en 1%' THEN RAISE EXCEPTION 'el motivo no dice cuánto usa: %', v_hint; END IF;
  END;
  -- Bajar a 1 sí cabe (límite 2, usa 2).
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  IF (r->>'limite_despues')::int <> 2 OR (r->>'precio_unitario')::numeric <> 200 THEN
    RAISE EXCEPTION 'al bajar debía conservar el precio pactado ($200): %', r;
  END IF;

  -- ── 5) Otro día: se cierra la fila vigente y se abre otra (queda la historia) ──
  UPDATE tenant_addons SET fecha_inicio = v_hoy - 10 WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 2);
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 2 THEN RAISE EXCEPTION 'otro día debía dejar dos filas (historia + vigente), hay %', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x AND NOT activo AND fecha_fin = v_hoy AND cantidad = 1) THEN
    RAISE EXCEPTION 'la fila anterior no quedó cerrada hoy con su cantidad';
  END IF;
  IF _extras_vigentes(v_tenant, 'CAJA_EXTRA') <> 2 THEN RAISE EXCEPTION 'vigentes debía ser 2, es %', _extras_vigentes(v_tenant, 'CAJA_EXTRA'); END IF;
  -- Quitar y volver a poner el mismo día reactiva la fila de hoy, no inserta otra.
  UPDATE cajas SET activa = false WHERE tenant_id = v_tenant AND numero = 2;
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
  IF (limites_efectivos(v_tenant)->>'max_cajas_por_sucursal')::int <> 1 THEN RAISE EXCEPTION 'quitar el extra no bajó el límite'; END IF;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  IF v_n <> 2 THEN RAISE EXCEPTION 'quitar y volver a poner el mismo día insertó otra fila (hay %)', v_n; END IF;
  -- Y vuelve con el precio que tenía PACTADO ($200), no con el de catálogo ($249).
  IF (r->>'precio_unitario')::numeric <> 200 THEN
    RAISE EXCEPTION 'al volver a contratar el extra debía conservar el precio pactado ($200), puso %', r->>'precio_unitario';
  END IF;
  -- También otro día: se quita (queda solo historia) y al volver sigue siendo $200…
  PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 0);
  UPDATE tenant_addons SET fecha_inicio = fecha_inicio - 30, fecha_fin = v_hoy - 5 WHERE tenant_id = v_tenant AND addon_id = v_caja_x;
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
  IF (r->>'precio_unitario')::numeric <> 200 THEN
    RAISE EXCEPTION 'días después, volver a contratar debía conservar el último precio pactado ($200), puso %', r->>'precio_unitario';
  END IF;
  -- …salvo que se mande un precio nuevo.
  r := fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1, 249.00);
  IF (r->>'precio_unitario')::numeric <> 249 THEN RAISE EXCEPTION 'un precio explícito debía mandar, puso %', r->>'precio_unitario'; END IF;
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_caja_x AND activo;
  IF v_n <> 1 THEN RAISE EXCEPTION 'debía quedar UNA fila vigente, hay %', v_n; END IF;

  -- ── 6) Precedencia: la excepción reemplaza al plan como BASE y el extra se suma encima ──
  INSERT INTO tenant_limites (tenant_id, max_cajas_por_sucursal, motivo) VALUES (v_tenant, 3, 'smoke: excepción previa');
  IF (limites_efectivos(v_tenant)->>'max_cajas_por_sucursal')::int <> 4 THEN
    RAISE EXCEPTION 'excepción 3 + 1 extra debía dar 4, dio %', limites_efectivos(v_tenant)->>'max_cajas_por_sucursal';
  END IF;
  IF (limites_efectivos(v_tenant)->'del_plan'->>'max_cajas_por_sucursal')::int <> 1
     OR (limites_efectivos(v_tenant)->'excepcion'->>'max_cajas_por_sucursal')::int <> 3 THEN
    RAISE EXCEPTION 'el desglose del panel (del_plan / excepcion) cambió: %', limites_efectivos(v_tenant);
  END IF;
  DELETE FROM tenant_limites WHERE tenant_id = v_tenant;

  -- ── 7) Sucursal adicional ────────────────────────────────────────────────
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

  -- ── 8) Validaciones ──────────────────────────────────────────────────────
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

  -- ── 9) Cambio de plan: los extras se conservan… ──────────────────────────
  -- Esencial → Negocio (1 sucursal, 3 cajas): conserva los dos extras.
  r := cambiar_plan_tenant(v_tenant, v_negocio);
  IF r->'addons'->'retirados' @> '["CAJA_EXTRA"]'::jsonb OR r->'addons'->'retirados' @> '["SUCURSAL_EXTRA"]'::jsonb THEN
    RAISE EXCEPTION 'subir a Negocio no debía retirar extras: %', r->'addons';
  END IF;
  IF (limites_efectivos(v_tenant)->>'max_cajas_por_sucursal')::int <> 4 OR (limites_efectivos(v_tenant)->>'max_sucursales')::int <> 2 THEN
    RAISE EXCEPTION 'en Negocio con 1 extra de cada uno debía dar 4 cajas y 2 sucursales: %', limites_efectivos(v_tenant);
  END IF;

  -- …salvo el que el plan nuevo deja sin sentido: Cadena trae cajas sin límite.
  r := cambiar_plan_tenant(v_tenant, v_cadena);
  IF NOT (r->'addons'->'retirados' @> '["CAJA_EXTRA"]'::jsonb) THEN RAISE EXCEPTION 'subir a Cadena debía retirar CAJA_EXTRA: %', r->'addons'; END IF;
  IF r->'addons'->'retirados' @> '["SUCURSAL_EXTRA"]'::jsonb THEN RAISE EXCEPTION 'Cadena sí limita sucursales: SUCURSAL_EXTRA se conserva'; END IF;
  IF _extras_vigentes(v_tenant, 'CAJA_EXTRA') <> 0 THEN RAISE EXCEPTION 'CAJA_EXTRA siguió vigente en Cadena'; END IF;
  IF limites_efectivos(v_tenant)->>'max_cajas_por_sucursal' IS NOT NULL THEN RAISE EXCEPTION 'Cadena debía quedar sin límite de cajas'; END IF;
  IF (limites_efectivos(v_tenant)->>'max_sucursales')::int <> 4 THEN RAISE EXCEPTION 'Cadena (3) + 1 sucursal extra debía dar 4'; END IF;

  -- Y en Cadena no se puede contratar una caja adicional.
  BEGIN
    PERFORM fijar_extra_tenant(v_tenant, 'CAJA_EXTRA', 1);
    RAISE EXCEPTION 'aceptó una caja adicional en un plan con cajas sin límite';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLERRM <> 'SIN_LIMITE' THEN RAISE; END IF;
    IF v_hint NOT LIKE '%cajas sin límite%' THEN RAISE EXCEPTION 'el motivo no explica por qué: %', v_hint; END IF;
  END;

  RAISE NOTICE '✅ smoke_extras: límites con extras, mismo día, en uso, sin límite y cambio de plan';
END $$;

ROLLBACK;
