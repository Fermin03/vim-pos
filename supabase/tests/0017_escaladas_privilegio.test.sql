-- ============================================================================
-- 0132 · Escaladas de privilegio (Auditoría integral 30/09/2026, equipo A).
--
-- Cada escalada se reproduce con la sesión de un empleado (rol `authenticated` + su JWT), igual
-- que una petición directa a PostgREST, y debe FALLAR. Al lado va la operación legítima que la
-- UI hace sobre las mismas tablas, que debe seguir funcionando.
--
-- Negocio A = el de la semilla (dueño e1, supervisor f1 con PIN 4321, cajera María 0001 con PIN
-- 1234, caja cc). Aquí se agregan un ADMIN en A y un negocio B con su dueño y saldo de folios.
-- ============================================================================
begin;
select plan(42);

\set ta      '99999999-0000-0000-0000-0000000000aa'
\set caja_a  '99999999-0000-0000-0000-0000000000cc'
\set dueno_a '99999999-0000-0000-0000-0000000000e1'
\set super_a '99999999-0000-0000-0000-0000000000f1'
\set cajero  '99999999-0000-0000-0000-000000000001'
\set admin_a '17171717-0000-0000-0000-0000000000a1'
\set tb      '17171717-0000-0000-0000-0000000000bb'
\set dueno_b '17171717-0000-0000-0000-0000000000b1'
\set admin2  '17171717-0000-0000-0000-0000000000a2'

\set j_cajero '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}'
\set j_admin  '{"sub":"17171717-0000-0000-0000-0000000000a1","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}'
\set j_admin2 '{"sub":"17171717-0000-0000-0000-0000000000a2","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}'
\set j_dueno  '{"sub":"99999999-0000-0000-0000-0000000000e1","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}'
\set j_super  '{"sub":"99999999-0000-0000-0000-0000000000f1","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}'

-- ── Fixture ─────────────────────────────────────────────────────────────────
insert into auth.users (id, aud, role, email) values
  (:'admin_a', 'authenticated', 'authenticated', 'admin-0017@a.dev'),
  (:'dueno_b', 'authenticated', 'authenticated', 'dueno-0017@b.dev');
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'tb', 'tenant-b-0017', 'Tenant B', 'ACTIVO', 'QUICK_SERVICE');
insert into usuarios_perfil (id, nombre, pin_hash, estado) values
  (:'admin_a', 'Admin A', crypt('9999', gen_salt('bf')), 'ACTIVO'),
  (:'dueno_b', 'Dueño B', null, 'ACTIVO');
insert into usuarios_acceso (usuario_id, tenant_id, rol_id) values
  (:'admin_a', :'ta', (select id from roles where codigo = 'ADMIN' and es_sistema)),
  (:'dueno_b', :'tb', (select id from roles where codigo = 'DUENO' and es_sistema));
insert into tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  values (:'tb', 50, 0, date_trunc('month', now())::date, 100);
-- Restricción que el dueño puso al rol CAJERO (D71) y otra al rol ADMIN.
insert into rol_permiso_overrides (tenant_id, rol_id, permiso_id) values
  (:'ta', (select id from roles where codigo = 'CAJERO' and es_sistema), (select id from permisos where codigo = 'descuento.manual_aplicar')),
  (:'ta', (select id from roles where codigo = 'ADMIN'  and es_sistema), (select id from permisos where codigo = 'caja.ajuste_admin'));

-- ============================================================================
-- A1 · tenants: el admin no se quita la suspensión ni se cambia plan/dueño
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" to :'j_admin';

select throws_ok($$ update tenants set estado = 'ACTIVO' where id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'A1 · admin no cambia tenants.estado');
select throws_ok($$ update tenants set bloqueo_desde = null, bloqueo_mensaje = null where id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'A1 · admin no se quita el bloqueo');
select throws_ok($$ update tenants set plan_actual_id = null where id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'A1 · admin no cambia plan_actual_id');
select throws_ok($$ update tenants set usuario_dueno_id = '17171717-0000-0000-0000-0000000000a1' where id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'A1 · admin no se hace usuario_dueno_id');
select throws_ok($$ update tenants set deleted_at = null, fecha_baja = null, motivo_baja = null where id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'A1 · admin no deshace la baja');
select lives_ok($$ update tenants set nombre_comercial = 'Knock-Out 0017', timezone = 'America/Mexico_City',
                   rfc = 'XAXX010101000', razon_social = 'KO SA', logo_url = null
                  where id = '99999999-0000-0000-0000-0000000000aa' $$,
  'A1 · legítimo: admin edita datos del negocio, fiscales y logo');

-- ============================================================================
-- A2 · overrides / permisos personalizados
-- ============================================================================
set local "request.jwt.claims" to :'j_cajero';
delete from rol_permiso_overrides;   -- el cajero intenta borrar su restricción
select throws_ok($$ insert into permisos_personalizados (tenant_id, usuario_id, permiso_id)
                    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-000000000001',
                            (select id from permisos where codigo = 'caja.ajuste_admin')) $$,
  '42501', null, 'A2 · cajero no se otorga permisos personalizados');
select throws_ok($$ insert into rol_permiso_overrides (tenant_id, rol_id, permiso_id)
                    values ('99999999-0000-0000-0000-0000000000aa', (select id from roles where codigo = 'SUPERVISOR' and es_sistema),
                            (select id from permisos where codigo = 'descuento.manual_aplicar')) $$,
  '42501', null, 'A2 · cajero no restringe a otros roles');
select throws_ok($$ insert into overrides_permisos (tenant_id, rol_id, permiso_id, concedido)
                    values ('99999999-0000-0000-0000-0000000000aa', (select id from roles where codigo = 'CAJERO' and es_sistema),
                            (select id from permisos where codigo = 'caja.ajuste_admin'), true) $$,
  '42501', null, 'A2 · cajero no escribe overrides_permisos');

set local "request.jwt.claims" to :'j_admin';
select throws_ok($$ insert into rol_permiso_overrides (tenant_id, rol_id, permiso_id)
                    values ('99999999-0000-0000-0000-0000000000aa', (select id from roles where codigo = 'DUENO' and es_sistema),
                            (select id from permisos where codigo = 'descuento.manual_aplicar')) $$,
  '42501', null, 'A2 · nadie pone overrides al rol DUEÑO');
delete from rol_permiso_overrides where rol_id = (select id from roles where codigo = 'ADMIN' and es_sistema);  -- admin se devuelve lo que el dueño le quitó
select lives_ok($$ insert into rol_permiso_overrides (tenant_id, rol_id, permiso_id)
                   values ('99999999-0000-0000-0000-0000000000aa', (select id from roles where codigo = 'SUPERVISOR' and es_sistema),
                           (select id from permisos where codigo = 'caja.sangria')) $$,
  'A2 · legítimo: admin restringe al SUPERVISOR');
select lives_ok($$ delete from rol_permiso_overrides where rol_id = (select id from roles where codigo = 'SUPERVISOR' and es_sistema) $$,
  'A2 · legítimo: admin restaura al SUPERVISOR');

reset role;
set local "request.jwt.claims" to '';
select is((select count(*)::int from rol_permiso_overrides
            where tenant_id = :'ta' and rol_id = (select id from roles where codigo = 'CAJERO' and es_sistema)),
  1, 'A2 · la restricción del CAJERO sobrevive al DELETE del cajero');
select is((select count(*)::int from rol_permiso_overrides
            where tenant_id = :'ta' and rol_id = (select id from roles where codigo = 'ADMIN' and es_sistema)),
  1, 'A2 · la restricción del ADMIN sobrevive al DELETE del admin');
select is((select count(*)::int from rol_permiso_overrides
            where tenant_id = :'ta' and rol_id = (select id from roles where codigo = 'SUPERVISOR' and es_sistema)),
  0, 'A2 · legítimo: el override del SUPERVISOR se borró');

-- ============================================================================
-- A3 · usuarios_acceso / usuarios_perfil
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" to :'j_admin';
select throws_ok($$ update usuarios_acceso set rol_id = (select id from roles where codigo = 'DUENO' and es_sistema)
                    where usuario_id = '17171717-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'A3 · admin no se promueve a DUEÑO');
select throws_ok($$ update usuarios_acceso set activo = false where usuario_id = '99999999-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'A3 · admin no desactiva al dueño');
select throws_ok($$ update usuarios_acceso set usuario_id = '17171717-0000-0000-0000-0000000000b1'
                    where usuario_id = '17171717-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'A3 · admin no re-vincula usuario_id');
select throws_ok($$ update usuarios_perfil set pin_hash = crypt('0000', gen_salt('bf')) where id = '99999999-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'A3 · admin no sobrescribe el pin_hash del supervisor');
select throws_ok($$ update usuarios_perfil set estado = 'DESACTIVADO' where id = '99999999-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'A3 · admin no desactiva el perfil del dueño');
-- Legítimo (usuarios.ts): cambiarRol y setActivo sobre la cajera, y de vuelta.
select lives_ok($$ update usuarios_acceso set rol_id = (select id from roles where codigo = 'SUPERVISOR' and es_sistema)
                   where usuario_id = '99999999-0000-0000-0000-000000000001' $$,
  'A3 · legítimo: cambiarRol');
select lives_ok($$ update usuarios_acceso set rol_id = (select id from roles where codigo = 'CAJERO' and es_sistema), activo = false
                   where usuario_id = '99999999-0000-0000-0000-000000000001';
                   update usuarios_perfil set estado = 'DESACTIVADO' where id = '99999999-0000-0000-0000-000000000001';
                   update usuarios_acceso set activo = true where usuario_id = '99999999-0000-0000-0000-000000000001';
                   update usuarios_perfil set estado = 'ACTIVO' where id = '99999999-0000-0000-0000-000000000001' $$,
  'A3 · legítimo: setActivo (acceso + perfil)');

-- La cajera, bloqueada por el administrador, intenta desbloquearse sola.
reset role;
set local "request.jwt.claims" to '';
update usuarios_perfil set estado = 'BLOQUEADO_ADMIN' where id = :'cajero';
set local role authenticated;
set local "request.jwt.claims" to :'j_cajero';
select throws_ok($$ update usuarios_perfil set intentos_pin_fallidos = 0, bloqueado_hasta = null
                    where id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', null, 'A3 · cajero no se resetea el bloqueo de PIN');
select throws_ok($$ update usuarios_perfil set pin_hash = crypt('0000', gen_salt('bf')) where id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', null, 'A3 · cajero no se pone el pin_hash a mano');
select throws_ok($$ update usuarios_perfil set estado = 'ACTIVO' where id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', null, 'A3 · cajero no cambia su propio estado');
reset role;
set local "request.jwt.claims" to '';
update usuarios_perfil set pin_hash = crypt('1234', gen_salt('bf')) where id = :'cajero';  -- aislado de lo de arriba
set local role authenticated;
set local "request.jwt.claims" to :'j_cajero';
select lives_ok($$ select cambiar_pin_propio('1234', '5678') $$,
  'A3 · legítimo: cambiar_pin_propio');
reset role;
set local "request.jwt.claims" to '';
update usuarios_perfil set estado = 'ACTIVO' where id = :'cajero';
set local role authenticated;

-- El dueño sí puede tocar el acceso del dueño (p. ej. co-dueño) y del admin.
set local "request.jwt.claims" to :'j_dueno';
select lives_ok($$ update usuarios_acceso set notas = 'revisado' where usuario_id in
                   ('99999999-0000-0000-0000-0000000000e1', '17171717-0000-0000-0000-0000000000a1') $$,
  'A3 · legítimo: el dueño edita accesos de dueño y admin');

-- ============================================================================
-- A4 · pin_hash ilegible por la API
-- ============================================================================
set local "request.jwt.claims" to :'j_cajero';
select throws_ok($$ select pin_hash from usuarios_perfil $$,
  '42501', null, 'A4 · un empleado no lee pin_hash del equipo');
select cmp_ok((select count(*)::int from usuarios_perfil), '>=', 3,
  'A4 · legítimo: sigue leyendo nombres del equipo (count sin pin_hash)');

-- ============================================================================
-- A5 · consumir_folio_cfdi
-- ============================================================================
select throws_ok($$ select consumir_folio_cfdi('17171717-0000-0000-0000-0000000000bb', gen_random_uuid(), false) $$,
  '42501', null, 'A5 · cajero de A no quema folios de B');
set local "request.jwt.claims" to :'j_admin';
select throws_ok($$ select consumir_folio_cfdi('17171717-0000-0000-0000-0000000000bb', gen_random_uuid(), false) $$,
  '42501', null, 'A5 · admin de A tampoco quema folios de B');
-- Legítimo: la Edge Function timbrar-cfdi, con service_role, consume el folio del negocio del CFDI.
reset role;
set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is((consumir_folio_cfdi('99999999-0000-0000-0000-0000000000aa', gen_random_uuid(), false)) ->> 'ok', 'true',
  'A5 · legítimo: service_role consume el folio del negocio');
reset role;
set local "request.jwt.claims" to '';
-- El chequeo interno de la 0132 no depende del REVOKE de la 0135: con EXECUTE otorgado otra vez
-- (dentro de esta transacción), el cajero de A sigue sin poder tocar los folios de B.
grant execute on function consumir_folio_cfdi(uuid, uuid, boolean) to authenticated;
set local role authenticated;
set local "request.jwt.claims" to :'j_cajero';
select throws_like($$ select consumir_folio_cfdi('17171717-0000-0000-0000-0000000000bb', gen_random_uuid(), false) $$,
  '%SIN_PERMISO%', 'A5 · aun con EXECUTE, el chequeo interno rechaza el negocio ajeno');
reset role;
set local "request.jwt.claims" to '';
select is((select saldo_paquetes + folios_base_consumidos from tenant_folios_saldo where tenant_id = :'tb'), 100,
  'A5 · los folios de B quedan intactos');

-- ============================================================================
-- A6 · transicionar_estado_cocina_con_autorizacion fuera de la API
-- ============================================================================
select ok(not has_function_privilege('authenticated',
  'transicionar_estado_cocina_con_autorizacion(uuid, ticket_estado_cocina, uuid, text)', 'EXECUTE'),
  'A6 · authenticated ya no ejecuta transicionar_estado_cocina_con_autorizacion');

-- ============================================================================
-- A7 · autorización por PIN (como service_role: la llama la Edge Function)
-- ============================================================================
-- Fixture propio, para que el resultado no dependa de lo que las escaladas de arriba hayan
-- logrado cuando se corre sin el arreglo: un segundo ADMIN (PIN 8888), la restricción del rol
-- ADMIN presente y un PIN conocido para la cajera (rol CAJERO, sin descuento.manual_aplicar).
insert into auth.users (id, aud, role, email) values (:'admin2', 'authenticated', 'authenticated', 'admin2-0017@a.dev');
insert into usuarios_perfil (id, nombre, pin_hash, estado) values (:'admin2', 'Admin 2', crypt('8888', gen_salt('bf')), 'ACTIVO');
insert into usuarios_acceso (usuario_id, tenant_id, rol_id)
  values (:'admin2', :'ta', (select id from roles where codigo = 'ADMIN' and es_sistema));
insert into rol_permiso_overrides (tenant_id, rol_id, permiso_id)
  values (:'ta', (select id from roles where codigo = 'ADMIN' and es_sistema), (select id from permisos where codigo = 'caja.ajuste_admin'))
  on conflict do nothing;
update usuarios_perfil set pin_hash = crypt('5678', gen_salt('bf')), estado = 'ACTIVO' where id = :'cajero';
update usuarios_acceso set rol_id = (select id from roles where codigo = 'CAJERO' and es_sistema), activo = true
 where usuario_id = :'cajero';

select is(verificar_autorizacion_pin('4321', 'descuento_manual', 'descuento.manual_aplicar', 'ticket', null, 10, 'x',
                                     :'caja_a', null, :'cajero') ->> 'ok', 'true',
  'A7 · legítimo: el supervisor autoriza con su PIN');
select is(verificar_autorizacion_pin('8888', 'descuento_manual', 'caja.ajuste_admin', 'ticket', null, 10, 'x',
                                     :'caja_a', null, :'cajero') ->> 'motivo', 'PIN_INCORRECTO',
  'A7 · la restricción del dueño al rol ADMIN aplica en la autorización por PIN');
select is(verificar_autorizacion_pin('5678', 'descuento_manual', 'descuento.manual_aplicar', 'ticket', null, 10, 'x',
                                     :'caja_a', null, :'super_a') ->> 'motivo', 'PIN_INCORRECTO',
  'A7 · un PIN real sin permiso responde igual que uno inexistente (no SIN_PERMISO)');

set local role authenticated;
set local "request.jwt.claims" to :'j_admin2';
select is(registrar_autorizacion_propia('ajuste', 'caja.ajuste_admin', 'caja', null, 10, 'x', :'caja_a', null) ->> 'motivo',
  'SIN_PERMISO', 'A7 · registrar_autorizacion_propia respeta la restricción del rol');
reset role;
set local "request.jwt.claims" to '';

-- Límite por solicitante: 6 fallos recientes suyos (en otras cajas) bloquean aunque el PIN sea bueno.
insert into pin_intentos (tenant_id, usuario_id, caja_id, exitoso, motivo_fallo)
  select null, :'cajero', null, false, 'AUTORIZACION' from generate_series(1, 6);
select is(verificar_autorizacion_pin('4321', 'descuento_manual', 'descuento.manual_aplicar', 'ticket', null, 10, 'x',
                                     :'caja_a', null, :'cajero') ->> 'motivo', 'BLOQUEADO',
  'A7 · 6 fallos del mismo solicitante lo bloquean');

-- ============================================================================
-- A8 · oráculos
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" to :'j_cajero';
select is(usuario_tiene_permiso(:'dueno_b', 'descuento.manual_aplicar'), false,
  'A8 · usuario_tiene_permiso no contesta por usuarios de otro negocio');
reset role;
set local "request.jwt.claims" to '';
select ok(not has_function_privilege('anon', 'ticket_autofacturable(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'tenant_addon_activo(uuid, varchar)', 'EXECUTE'),
  'A8 · anon ya no ejecuta ticket_autofacturable ni tenant_addon_activo');

select * from finish();
rollback;
