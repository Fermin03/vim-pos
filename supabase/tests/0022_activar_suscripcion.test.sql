-- ============================================================================
-- 0137 · activar_suscripcion: expirar la vigente, crear la nueva y pasar TRIAL→ACTIVO es TODO o
-- NADA. Auditoría integral 30/09/2026, hallazgo E-3: la ruta del panel lo hacía en tres pasos y
-- un INSERT fallido (precio negativo) dejaba al cliente con la anterior EXPIRADA y ninguna nueva.
-- ============================================================================
begin;
select plan(15);

\set tenant '22222222-0000-0000-0000-0000000000aa'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id)
  values (:'tenant', 'tenant-0022', 'Tenant 0022', 'TRIAL', 'QUICK_SERVICE',
          (select id from planes order by precio_mensual_mxn limit 1));
insert into suscripciones (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro)
  values (:'tenant', (select plan_actual_id from tenants where id = :'tenant'), '2026-08-01', 'ACTIVA', 500, 'MENSUAL', '2026-09-01');

-- 1) Solo service_role puede llamarla.
select ok(not has_function_privilege('authenticated', 'activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text)', 'execute'),
  'authenticated no puede activar cobros');
select ok(not has_function_privilege('anon', 'activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text)', 'execute'),
  'anon no puede activar cobros');
select ok(has_function_privilege('service_role', 'activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text)', 'execute'),
  'service_role (el panel) sí');

-- 2) Precio inválido: se rechaza ANTES de tocar nada, y la suscripción vigente sigue ACTIVA.
select throws_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', -1, 'MENSUAL', '2026-09-30', '2026-10-30') $$,
  'P0001', 'PRECIO_INVALIDO', 'un precio negativo se rechaza');
select throws_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 'NaN'::numeric, 'MENSUAL', '2026-09-30', '2026-10-30') $$,
  'P0001', 'PRECIO_INVALIDO', 'NaN se rechaza');
select throws_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 100, 'SEMANAL', '2026-09-30', '2026-10-30') $$,
  'P0001', 'CICLO_INVALIDO', 'un ciclo desconocido se rechaza');
select is((select count(*)::int from suscripciones where tenant_id = :'tenant' and estado = 'ACTIVA'), 1,
  'tras los rechazos, la suscripción anterior sigue ACTIVA (no quedó sin cobro)');

-- 3) El alta buena: una sola ACTIVA, la anterior EXPIRADA, y el tenant pasa a ACTIVO.
select lives_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 899.00, 'MENSUAL', '2026-09-30', '2026-10-30') $$,
  'un alta válida pasa');
select is((select count(*)::int from suscripciones where tenant_id = :'tenant' and estado = 'ACTIVA'), 1,
  'queda exactamente una suscripción ACTIVA');
select is((select precio_mensual_mxn from suscripciones where tenant_id = :'tenant' and estado = 'ACTIVA'), 899.00::numeric,
  'con el precio nuevo');
select is((select estado::text from suscripciones where tenant_id = :'tenant' and fecha_inicio = '2026-08-01'), 'EXPIRADA',
  'la anterior quedó EXPIRADA');
select is((select estado::text from tenants where id = :'tenant'), 'ACTIVO', 'el tenant en prueba pasa a ACTIVO');

-- 4) Cobro por adelantado (0141): el primer cobro vence el mismo día del inicio; antes, no.
select lives_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 699, 'MENSUAL', '2026-10-01', '2026-10-01') $$,
  'el primer cobro puede vencer el día de la activación');
select throws_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 699, 'MENSUAL', '2026-10-01', '2026-09-30') $$,
  'P0001', 'FECHAS_INVALIDAS', 'un primer cobro anterior al inicio se rechaza');
select throws_ok($$ select activar_suscripcion('22222222-0000-0000-0000-0000000000aa', 699, 'ANUAL', '2026-10-01', '2026-10-01', 499, '2027-03-31', null) $$,
  'P0001', 'PROMOCION_CICLO_INVALIDO', 'no hay promociones en cobro anual');

select * from finish();
rollback;
