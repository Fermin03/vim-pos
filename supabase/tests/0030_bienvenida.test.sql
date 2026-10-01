-- ============================================================================
-- 0146 · Correo de bienvenida: la marca que se reclama una sola vez.
--
-- Lo que se protege: que el correo salga una vez por negocio (la segunda reclamación pierde), que
-- un fallo de envío deje reintentar, que un negocio que ya no es nuevo no reciba "bienvenida" el
-- día que restablece su contraseña, y que nada de esto se pueda llamar desde el navegador.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(10);

select ok(not has_function_privilege('authenticated', 'reclamar_bienvenida(uuid)', 'execute')
      and not has_function_privilege('anon', 'reclamar_bienvenida(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'liberar_bienvenida(uuid)', 'execute')
      and not has_function_privilege('anon', 'liberar_bienvenida(uuid)', 'execute')
      and has_function_privilege('service_role', 'reclamar_bienvenida(uuid)', 'execute'),
  'reclamar y liberar la bienvenida: solo service_role');

-- Un negocio recién llegado, en prueba.
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('eeeeeeee-0000-0000-0000-0000000001a0', 'bienv-nuevo', 'Bienvenida Nueva', 'QUICK_SERVICE', 'TRIAL',
        (select id from planes where codigo = 'ESENCIAL'));
insert into tenant_onboarding_estado (tenant_id) values ('eeeeeeee-0000-0000-0000-0000000001a0');

select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001a0'), 'RECLAMADA', 'la primera reclamación se la lleva');
select ok((select bienvenida_enviada_at is not null from tenant_onboarding_estado where tenant_id = 'eeeeeeee-0000-0000-0000-0000000001a0'),
  'y deja la fecha');
select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001a0'), 'YA_ENVIADA', 'la segunda (doble clic, reintento) no');

-- El envío falló: se libera y se puede volver a reclamar.
select liberar_bienvenida('eeeeeeee-0000-0000-0000-0000000001a0');
select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001a0'), 'RECLAMADA', 'liberada, se puede reclamar otra vez');

-- Un negocio de hace dos meses no es "recién llegado".
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id, fecha_alta)
values ('eeeeeeee-0000-0000-0000-0000000001b0', 'bienv-viejo', 'Bienvenida Vieja', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'ESENCIAL'), now() - interval '60 days');
insert into tenant_onboarding_estado (tenant_id) values ('eeeeeeee-0000-0000-0000-0000000001b0');
select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001b0'), 'NO_APLICA', 'pasados 30 días del alta ya no hay bienvenida');
select ok((select bienvenida_enviada_at is null from tenant_onboarding_estado where tenant_id = 'eeeeeeee-0000-0000-0000-0000000001b0'),
  'y no se marca nada');

-- Un interno (de VIM) o un suspendido tampoco.
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('eeeeeeee-0000-0000-0000-0000000001c0', 'bienv-interno', 'Bienvenida Interna', 'QUICK_SERVICE', 'INTERNO',
        (select id from planes where codigo = 'ESENCIAL'));
insert into tenant_onboarding_estado (tenant_id) values ('eeeeeeee-0000-0000-0000-0000000001c0');
select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001c0'), 'NO_APLICA', 'un negocio interno no recibe bienvenida');

-- Sin fila de onboarding (negocios sembrados) no revienta.
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('eeeeeeee-0000-0000-0000-0000000001d0', 'bienv-sin-onb', 'Bienvenida Sin Onboarding', 'QUICK_SERVICE', 'TRIAL',
        (select id from planes where codigo = 'ESENCIAL'));
select is(reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001d0'), 'NO_APLICA', 'sin onboarding no hay a quién marcar');

-- Una sesión de negocio no puede llamarla.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', 'eeeeeeee-0000-0000-0000-0000000001a0', 'role', 'authenticated')::text, true);
select throws_ok($$ select reclamar_bienvenida('eeeeeeee-0000-0000-0000-0000000001a0') $$, '42501', null,
  'desde el navegador no se puede reclamar');
reset role;

select * from finish();
rollback;
