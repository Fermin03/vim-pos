-- ============================================================================
-- 0142 · Soporte de VIM y registro público (ADR 0022).
--
-- Lo que se protege: que la tabla de soporte no se toque desde el navegador; que cualquier sesión
-- de un negocio —un cajero también— lea el soporte por la RPC y anon no; que las directivas de la
-- caja lo lleven; y que el alta del registro público no pueda quedar sin términos aceptados.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(14);

-- 1) Privilegios de la tabla y la RPC.
select ok(not has_table_privilege('authenticated', 'plataforma_soporte', 'select')
      and not has_table_privilege('authenticated', 'plataforma_soporte', 'update')
      and not has_table_privilege('authenticated', 'plataforma_soporte', 'insert')
      and not has_table_privilege('anon', 'plataforma_soporte', 'select'),
  'la tabla de soporte no se toca desde el navegador');
select ok(has_function_privilege('authenticated', 'soporte_plataforma()', 'execute')
      and not has_function_privilege('anon', 'soporte_plataforma()', 'execute'),
  'el soporte se lee con sesión, por la RPC; anon no');
select ok(not has_function_privilege('authenticated',
            'alta_autoservicio(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, varchar, varchar)', 'execute')
      and not has_function_privilege('anon',
            'alta_autoservicio(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, varchar, varchar)', 'execute'),
  'el alta del registro público solo la llama service_role');

-- 2) La fila de fábrica: el WhatsApp oficial y el horario.
select is((select whatsapp from plataforma_soporte where id), '525665083346', 'el WhatsApp de fábrica es el oficial');
select is((select horario from plataforma_soporte where id), '9:00 a 18:00', 'con el horario de atención');

-- 3) Un número que no son dígitos no entra.
select throws_ok($$ update plataforma_soporte set whatsapp = '52 477 123' where id $$,
  '23514', null, 'el WhatsApp con espacios lo rechaza el CHECK');

-- 4) Las directivas llevan el soporte.
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('cccccccc-0000-0000-0000-0000000001a0', 'sop-uno', 'Soporte Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'ESENCIAL'))
on conflict (id) do nothing;
select is(resolver_directivas('cccccccc-0000-0000-0000-0000000001a0', null)->'soporte'->>'whatsapp',
  '525665083346', 'las directivas de la caja llevan el WhatsApp de soporte');

-- 5) Un cajero (sesión de empleado con tenant) lee el soporte y no puede escribirlo.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000001a9',
                    'tenant_id', 'cccccccc-0000-0000-0000-0000000001a0',
                    'tipo_identidad', 'EMPLEADO',
                    'role', 'authenticated')::text, true);
select is((select whatsapp from soporte_plataforma()), '525665083346', 'un cajero lee el WhatsApp de soporte');
select throws_ok($$ update plataforma_soporte set whatsapp = '5215555555555' $$,
  '42501', null, 'un cajero no puede cambiar el soporte');

-- 6) Sin tenant en el JWT, la RPC no devuelve nada.
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000001a8', 'role', 'authenticated')::text, true);
select is((select count(*) from soporte_plataforma())::int, 0, 'sin tenant, sin datos');
reset role;

-- 7) El alta del registro público exige términos, teléfono y ciudad.
select throws_ok($$
  select alta_autoservicio('99999999-0000-0000-0000-0000000001b1', 'sop-dos', 'Soporte Dos', 'Dueña',
    '4771234567', 'QUICK_SERVICE', 'ESENCIAL', 'León', null) $$,
  '22023', 'Faltan los términos aceptados', 'sin términos no hay alta');
select throws_ok($$
  select alta_autoservicio('99999999-0000-0000-0000-0000000001b1', 'sop-dos', 'Soporte Dos', 'Dueña',
    '477 123 4567', 'QUICK_SERVICE', 'ESENCIAL', 'León', '2026-09-30') $$,
  '22023', 'El teléfono va en 10 dígitos', 'el teléfono va solo en dígitos');

-- 8) Con todo, queda la constancia en el onboarding (y el negocio en prueba).
insert into auth.users (id, email, aud, role, instance_id)
values ('99999999-0000-0000-0000-0000000001b1', 'duena-sop@ejemplo.mx', 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');
select lives_ok($$
  select alta_autoservicio('99999999-0000-0000-0000-0000000001b1', 'sop-dos', 'Soporte Dos', 'Dueña',
    '4771234567', 'QUICK_SERVICE', 'ESENCIAL', ' León ', '2026-09-30') $$, 'con todo, el alta pasa');
select ok((
  select o.terminos_version = '2026-09-30' and o.terminos_aceptados_at is not null
     and o.terminos_aceptados_por = '99999999-0000-0000-0000-0000000001b1' and o.ciudad_registro = 'León'
     and tn.estado = 'TRIAL' and tn.prueba_hasta is not null
    from tenants tn
    join tenant_onboarding_estado o on o.tenant_id = tn.id
   where tn.codigo = 'sop-dos'
), 'el alta deja términos, ciudad y la prueba de 30 días');

select * from finish();
rollback;
