-- ============================================================================
-- 0144 · eliminar un cliente por completo (ADR 0023).
--
-- Aquí va lo que es de PRIVILEGIOS y de la excepción de los triggers: quién puede ejecutar qué,
-- y que la salida que se le abrió al reporte Z no es alcanzable desde una sesión del negocio.
-- El recorrido completo con datos realistas (venta, devolución, corte, Z, inventario, delivery,
-- suscripción, CFDI borrador → cero filas en todo el catálogo) lo cubre
-- supabase/scripts/smoke_eliminar_tenant.sql, que además corre en el Postgres del escritorio.
-- ============================================================================
begin;
select plan(27);

\set tenant '99999999-0000-0000-0000-0000000000aa'
\set suc    '99999999-0000-0000-0000-0000000000bb'
\set caja   '99999999-0000-0000-0000-0000000000cc'
\set maria  '99999999-0000-0000-0000-000000000001'
\set op     '00000000-0000-0000-0000-0000000000a1'
\set nuevo  '28282828-0000-0000-0000-0000000000a1'
\set dueno2 '28282828-0000-0000-0000-0000000000e1'

-- ── 1) Quién puede ejecutar ──────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'eliminar_tenant(uuid, text, uuid, text, inet)', 'execute'),
  'authenticated no puede eliminar clientes');
select ok(not has_function_privilege('anon', 'eliminar_tenant(uuid, text, uuid, text, inet)', 'execute'),
  'anon no puede eliminar clientes');
select ok(has_function_privilege('service_role', 'eliminar_tenant(uuid, text, uuid, text, inet)', 'execute'),
  'service_role (el panel) sí');
select ok(not has_function_privilege('authenticated', 'eliminar_tenant_vista_previa(uuid)', 'execute')
      and not has_function_privilege('anon', 'eliminar_tenant_vista_previa(uuid)', 'execute')
      and has_function_privilege('service_role', 'eliminar_tenant_vista_previa(uuid)', 'execute'),
  'la vista previa, solo service_role');
select is_empty($$
  select p.oid::regprocedure::text
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like '\_eliminar\_tenant\_%'
     and (has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'las piezas internas no las ejecuta nadie por la API');
select is((select prosecdef from pg_proc where oid = 'public._eliminando_tenant(uuid)'::regprocedure), false,
  '_eliminando_tenant es SECURITY INVOKER: responde por quien dispara el trigger, no por su dueño');

-- ── 2) El archivo no se toca desde el navegador ──────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.tenants_eliminados'::regclass),
  'tenants_eliminados tiene RLS');
select is_empty($$ select 1 from pg_policy where polrelid = 'public.tenants_eliminados'::regclass $$,
  'y ninguna política: nadie la lee por RLS');
select ok(not has_table_privilege('authenticated', 'tenants_eliminados', 'select')
      and not has_table_privilege('authenticated', 'tenants_eliminados', 'insert')
      and not has_table_privilege('anon', 'tenants_eliminados', 'select'),
  'authenticated y anon no tienen privilegios sobre tenants_eliminados');
select ok(has_table_privilege('service_role', 'tenants_eliminados', 'select')
      and not has_table_privilege('service_role', 'tenants_eliminados', 'insert')
      and not has_table_privilege('service_role', 'tenants_eliminados', 'update')
      and not has_table_privilege('service_role', 'tenants_eliminados', 'delete'),
  'el panel la lee pero no la escribe: solo eliminar_tenant');

-- ── SETUP: un turno cerrado con Z en el negocio del seed (como postgres) ─────────────────────
create temp table ctx (ticket uuid, pago uuid);
grant all on ctx to authenticated;

do $$
declare
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_t uuid; v_prod uuid; v_pago uuid; v_auth uuid; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_tenant)::text, true);
  update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = v_caja and estado = 'ABIERTO';
  insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    values (v_tenant, v_suc, v_caja, 'T0028', current_date, v_maria, 500, 'TOTAL') returning id into v_turno;
  select id into v_prod from productos where tenant_id = v_tenant and nombre = 'Hamburguesa Clásica' limit 1;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't0028-1', v_maria);
  perform agregar_item_a_ticket(v_t, v_prod, 1, null, '[]'::jsonb, 't0028-1-i');
  v_pago := aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't0028-1-p');
  insert into autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
    values (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cerrar_turno', 'turno.cerrar_propio', 'turno', v_turno, null, 'Cierre de turno')
    returning id into v_auth;
  r := reporte_x(v_turno);
  perform arquear_caja(v_turno,
    jsonb_build_array(jsonb_build_object('metodo_pago', 'EFECTIVO', 'monto_declarado_mxn', (r->>'efectivo_esperado_mxn')::numeric)),
    'CIERRE_TURNO', v_maria, null);
  perform reporte_z(v_turno, (r->>'efectivo_esperado_mxn')::numeric, v_auth, v_maria, null);
  insert into ctx values (v_t, v_pago);
end $$;

select ok((select count(*) from reportes_z_historico where tenant_id = :'tenant') > 0, 'setup: hay un reporte Z');

-- Hoy `authenticated` no tiene política de DELETE en estas tablas: RLS le filtra las filas y el
-- trigger ni se entera. Para probar el TRIGGER (la capa que tocó esta migración) y no el RLS, se
-- abre aquí —solo dentro de esta transacción— una política de DELETE: es el peor caso, "alguien
-- abrió el DELETE por error".
create policy t0028_delete on reportes_z_historico for delete to authenticated using (tenant_id = current_tenant_id());
create policy t0028_delete on pagos for delete to authenticated using (tenant_id = current_tenant_id());
create policy t0028_delete on tickets for delete to authenticated using (tenant_id = current_tenant_id());

-- ── 3) Como una sesión del negocio (cajera María) ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant', 'role', 'authenticated')::text, true);

select throws_ok(
  format($$ select eliminar_tenant(%L, 'Me quiero borrar a mí misma', %L, 'ELIMINAR') $$, :'tenant', :'maria'),
  '42501', null, 'authenticated: llamar a eliminar_tenant da permiso denegado');
select throws_ok(
  format($$ select eliminar_tenant_vista_previa(%L) $$, :'tenant'),
  '42501', null, 'authenticated: la vista previa también');
select throws_ok($$ select * from tenants_eliminados $$, '42501', null, 'authenticated: no lee tenants_eliminados');

-- La excepción del reporte Z NO se alcanza aunque la sesión fije la variable: exige además un rol
-- que no esté sujeto a RLS.
select set_config('vim.eliminando_tenant', :'tenant', true);
select is(_eliminando_tenant(:'tenant'::uuid), false,
  'con la variable puesta, a authenticated _eliminando_tenant le contesta false');
select throws_ok(
  format($$ delete from reportes_z_historico where tenant_id = %L $$, :'tenant'),
  'P0001', 'Reporte Z no se puede eliminar.',
  'authenticated con la variable puesta: el reporte Z sigue sin borrarse (SQL directo)');

-- Y la guarda de dinero de la 0133 sigue en pie para una petición REST directa.
select set_config('request.path', '/pagos', true);
select throws_ok(
  format($$ delete from pagos where id = %L $$, (select pago from ctx)),
  '42501', null, 'authenticated con la variable puesta: DELETE /pagos sigue rechazado (0133)');
select set_config('request.path', '/tickets', true);
select throws_ok(
  format($$ delete from tickets where id = %L $$, (select ticket from ctx)),
  '42501', null, 'authenticated con la variable puesta: DELETE /tickets sigue rechazado (0133)');
select set_config('request.path', '/reportes_z_historico', true);
select throws_ok(
  format($$ delete from reportes_z_historico where tenant_id = %L $$, :'tenant'),
  '42501', null, 'authenticated con la variable puesta: DELETE /reportes_z_historico sigue rechazado');
select set_config('request.path', '', true);
select set_config('vim.eliminando_tenant', '', true);
reset role;

-- ── 4) Como postgres, sin pasar por eliminar_tenant ──────────────────────────────────────────
select throws_ok(
  format($$ delete from reportes_z_historico where tenant_id = %L $$, :'tenant'),
  'P0001', 'Reporte Z no se puede eliminar.',
  'ni el dueño de la base borra un reporte Z fuera de la eliminación del negocio');
-- La variable de OTRO negocio no abre este.
select set_config('vim.eliminando_tenant', :'nuevo', true);
select throws_ok(
  format($$ delete from reportes_z_historico where tenant_id = %L $$, :'tenant'),
  'P0001', 'Reporte Z no se puede eliminar.',
  'la variable de otro negocio no abre el reporte Z de este');
select set_config('vim.eliminando_tenant', '', true);

-- ── 5) Rechazos de eliminar_tenant ───────────────────────────────────────────────────────────
select throws_like(
  format($$ select eliminar_tenant(%L, 'Prueba de eliminación', %L, 'ELIMINAR') $$, :'tenant', :'op'),
  'TENANT_INTERNO%', 'un negocio INTERNO no se elimina');

-- Un negocio recién registrado (como el alta pública), todavía en prueba.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (:'dueno2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno-0028@prueba.test', '',
        now(), '{"provider":"email","providers":["email"]}', '{}');
insert into usuarios_perfil (id, nombre, telefono) values (:'dueno2', 'Dueña Prueba', '4770002828');
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, usuario_dueno_id)
values (:'nuevo', 'prueba-0028', 'Prueba 0028', 'QUICK_SERVICE', 'TRIAL', :'dueno2');
insert into usuarios_acceso (usuario_id, tenant_id, rol_id)
select :'dueno2', :'nuevo', id from roles where tenant_id is null and codigo = 'DUENO';

select throws_like(
  format($$ select eliminar_tenant(%L, 'Prueba de eliminación', %L, 'ELIMINAR') $$, :'nuevo', :'op'),
  'TENANT_NO_CANCELADO%', 'un negocio en prueba (sin cancelar) no se elimina');

-- ── 6) Cancelado: se elimina, queda el archivo, el código se libera ──────────────────────────
update tenants set estado = 'CANCELADO', fecha_baja = now(), motivo_baja = 'Alta de prueba' where id = :'nuevo';

select lives_ok(
  format($$ select eliminar_tenant(%L, 'Alta de prueba que nunca operó', %L, 'ELIMINAR') $$, :'nuevo', :'op'),
  'un negocio CANCELADO sin timbrados se elimina');
select ok(not exists (select 1 from tenants where id = :'nuevo')
      and not exists (select 1 from auth.users where id = :'dueno2')
      and not exists (select 1 from usuarios_acceso where tenant_id = :'nuevo'),
  'no queda el negocio, ni su acceso, ni la cuenta de su dueña');
select is((select contacto ->> 'email' from tenants_eliminados where id = :'nuevo'), 'dueno-0028@prueba.test',
  'queda el archivo, con el correo de contacto');
select lives_ok(
  $$ insert into tenants (codigo, nombre_comercial, vertical_principal) values ('prueba-0028', 'Prueba 0028 otra vez', 'QUICK_SERVICE') $$,
  'el código queda libre para volver a registrarse');

select * from finish();
rollback;
