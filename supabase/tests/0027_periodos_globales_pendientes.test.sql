-- ============================================================================
-- 0143 · periodos_globales_pendientes: el aviso de "tienes periodos sin factura global".
--
-- Lo que se cuida aquí es el aislamiento: la función recibe `p_tenant_id`, así que un usuario
-- podría preguntar por el negocio de otro. Corre como INVOKER, de modo que el RLS de `tickets`
-- contesta con cero filas. El cálculo de periodos lo cubre supabase/scripts/smoke_global_pendientes.sql.
-- ============================================================================
begin;
select plan(6);

\set tenant_a '99999999-0000-0000-0000-0000000000aa'
\set suc_a    '99999999-0000-0000-0000-0000000000bb'
\set caja_a   '99999999-0000-0000-0000-0000000000cc'
\set maria    '99999999-0000-0000-0000-000000000001'
\set tenant_b '27272727-0000-0000-0000-0000000000aa'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'tenant_b', 'tenant-b-0027', 'Tenant B', 'ACTIVO', 'QUICK_SERVICE');

-- Una venta PAGADA del tenant A, hoy.
create temporary table _t (ticket uuid, dia date) on commit drop;
grant select on _t to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_a')::text, true);
do $$
declare
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid;
begin
  update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = v_caja and estado = 'ABIERTO';
  insert into turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  values (v_tenant, v_suc, v_caja, 'T-0027', calcular_dia_contable(v_tenant, now()), v_maria, 500, 'TOTAL') returning id into v_turno;
  select id into v_prod from productos where tenant_id = v_tenant and nombre = 'Hamburguesa Clásica' limit 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, null, null, 't0027-1', v_maria);
  perform agregar_item_a_ticket(v_ticket, v_prod, 1, null, '[]'::jsonb, 't0027-item');
  perform aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't0027-pago');
  insert into _t select v_ticket, dia_contable from tickets where id = v_ticket;
end $$;

-- "Hoy" = un mes después de la venta: su periodo mensual ya cerró.
select ok(has_function_privilege('authenticated', 'periodos_globales_pendientes(uuid, date, integer)', 'EXECUTE'),
  'el panel (authenticated) puede preguntar por sus periodos pendientes');
select ok(not has_function_privilege('anon', 'periodos_globales_pendientes(uuid, date, integer)', 'EXECUTE'),
  'anon no');
select is((select prosecdef from pg_proc where proname = 'periodos_globales_pendientes'), false,
  'corre como INVOKER: el RLS de quien pregunta decide qué ve');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_a', 'role', 'authenticated')::text, true);
select isnt_empty(
  $$ select 1 from periodos_globales_pendientes('99999999-0000-0000-0000-0000000000aa', ((select dia from _t) + interval '1 month')::date) $$,
  'el tenant A ve su periodo cerrado sin factura global');
select is_empty(
  $$ select 1 from periodos_globales_pendientes('99999999-0000-0000-0000-0000000000aa', (select dia from _t)) $$,
  'el periodo que sigue abierto no se avisa');

-- Otro negocio preguntando por el tenant A: nada.
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_b', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from periodos_globales_pendientes('99999999-0000-0000-0000-0000000000aa', ((select dia from _t) + interval '1 month')::date) $$,
  'un usuario de otro tenant no ve los periodos del tenant A');
reset role;

select * from finish();
rollback;
