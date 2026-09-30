-- ============================================================================
-- 0141 · Cobro: promoción, prueba, cambio de plan y datos de pago (ADR 0021).
-- Privilegios y la regla del precio vigente. El comportamiento completo (subir, bajar y volver a
-- subir el mismo día; folios; add-ons) lo cubre supabase/scripts/smoke_cobro_plan.sql.
-- ============================================================================
begin;
select plan(13);

-- 1) Las funciones que mueven dinero o planes, solo service_role.
select ok(not has_function_privilege('authenticated', 'cambiar_plan_tenant(uuid, uuid, numeric)', 'execute'),
  'authenticated no puede cambiar planes');
select ok(not has_function_privilege('anon', 'cambiar_plan_tenant(uuid, uuid, numeric)', 'execute'),
  'anon no puede cambiar planes');
select ok(has_function_privilege('service_role', 'cambiar_plan_tenant(uuid, uuid, numeric)', 'execute'),
  'service_role (el panel) sí');
select ok(not has_function_privilege('authenticated', '_sincronizar_addons_del_plan(uuid, uuid, boolean)', 'execute'),
  'authenticated no puede darse add-ons');
select is(to_regprocedure('activar_suscripcion(uuid, numeric, text, date, date)'), null,
  'la firma vieja de activar_suscripcion ya no existe (evita llamadas ambiguas)');

-- 2) Columnas y tabla que el navegador no escribe.
select ok(not has_column_privilege('authenticated', 'tenants', 'prueba_hasta', 'update'),
  'el dueño no puede moverse la fecha de fin de la prueba');
select ok(not has_table_privilege('authenticated', 'plataforma_datos_pago', 'select')
      and not has_table_privilege('authenticated', 'plataforma_datos_pago', 'update')
      and not has_table_privilege('anon', 'plataforma_datos_pago', 'select'),
  'la tabla de datos de pago no se toca desde el navegador');
select ok(has_function_privilege('authenticated', 'datos_pago_plataforma()', 'execute')
      and not has_function_privilege('anon', 'datos_pago_plataforma()', 'execute'),
  'los datos de pago se leen solo con sesión, por la RPC');

-- 3) La regla del precio vigente (fechas fijas).
select is(precio_vigente_suscripcion(699, 499, '2027-03-31', '2027-03-31'), 499::numeric, 'el último día vale la promoción');
select is(precio_vigente_suscripcion(699, 499, '2027-03-31', '2027-04-01'), 699::numeric, 'al día siguiente, la lista');
select is(precio_vigente_suscripcion(699, null, null, '2027-01-01'), 699::numeric, 'sin promoción, la lista');

-- 4) CLABE.
select ok(clabe_valida('002010077777777771'), 'una CLABE válida pasa');
select ok(not clabe_valida('012180001234567897'), 'un dígito de control malo no pasa');

select * from finish();
rollback;
