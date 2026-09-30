-- ============================================================================
-- 0135 · CFDI: el emisor lo prueba el sello; tickets_cfdi no se escribe desde el navegador;
-- el QR de autofactura lleva un token no adivinable. Auditoría integral 30/09/2026 (C1-1..C1-4).
--
-- Antes de la 0135:
--   · el admin del tenant escribía `tenant_cfdi_emisor` completo (y no existía rfc_verificado);
--   · cualquier usuario del tenant hacía UPDATE/INSERT en tickets_cfdi (rutas, pac_referencia,
--     estado_sat…) y ejecutaba cfdi_marcar_timbrado / consumir_folio_cfdi;
--   · cfdi_crear_borrador guardaba el emisor_rfc que mandara el navegador;
--   · las políticas de Storage cfdi_*_own_tenant dejaban subir al bucket `cfdi`.
-- ============================================================================
begin;
select plan(25);

\set tenant_a '99999999-0000-0000-0000-0000000000aa'
\set suc_a    '99999999-0000-0000-0000-0000000000bb'
\set caja_a   '99999999-0000-0000-0000-0000000000cc'
\set maria    '99999999-0000-0000-0000-000000000001'
\set dueno    '99999999-0000-0000-0000-0000000000e1'
\set tenant_b '20202020-0000-0000-0000-0000000000aa'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'tenant_b', 'tenant-b-0020', 'Tenant B', 'ACTIVO', 'QUICK_SERVICE');

-- Un ticket PAGADO del tenant A (mismo camino que smoke_cfdi_timbrado.sql).
create temporary table _t (ticket uuid) on commit drop;
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
  values (v_tenant, v_suc, v_caja, 'T-0020', current_date, v_maria, 500, 'TOTAL') returning id into v_turno;
  select id into v_prod from productos where tenant_id = v_tenant and nombre = 'Hamburguesa Clásica' limit 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, null, null, 't0020-1', v_maria);
  perform agregar_item_a_ticket(v_ticket, v_prod, 1, null, '[]'::jsonb, 't0020-item');
  perform aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't0020-pago');
  insert into _t values (v_ticket);
end $$;

-- El tenant A ya cargó su sello: su RFC verificado es KOB010101AAA.
insert into tenant_cfdi_emisor (tenant_id, rfc, facturama_issuer_ref, estado, rfc_verificado, csd_numero_certificado)
  values (:'tenant_a', 'KOB010101AAA', 'KOB010101AAA', 'ACTIVO', 'KOB010101AAA', '30001000000500003416');

-- ── Privilegios de columna en tenant_cfdi_emisor ─────────────────────────────────────────────
select has_column('tenant_cfdi_emisor', 'rfc_verificado', 'existe tenant_cfdi_emisor.rfc_verificado');
select ok(not has_column_privilege('authenticated', 'tenant_cfdi_emisor', 'rfc_verificado', 'UPDATE')
      and not has_column_privilege('authenticated', 'tenant_cfdi_emisor', 'rfc_verificado', 'INSERT'),
  'authenticated no escribe rfc_verificado');
select ok(not has_column_privilege('authenticated', 'tenant_cfdi_emisor', 'csd_numero_certificado', 'UPDATE')
      and not has_column_privilege('authenticated', 'tenant_cfdi_emisor', 'csd_vigencia_hasta', 'UPDATE'),
  'authenticated no escribe csd_*');

-- El DUEÑO, con su JWT, no se puede "verificar" el RFC de otro…
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'tenant_id', :'tenant_a', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ update tenant_cfdi_emisor set rfc_verificado = 'VIC010101VIC' where tenant_id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'el dueño no puede escribir rfc_verificado');
select throws_ok(
  $$ update tenant_cfdi_emisor set csd_numero_certificado = '1' where tenant_id = '99999999-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'el dueño no puede escribir csd_numero_certificado');
-- …pero sigue guardando su configuración (lo que manda guardarCfdiEmisor).
select lives_ok(
  $$ insert into tenant_cfdi_emisor (tenant_id, rfc, proveedor_pac, facturama_issuer_ref, estado, periodicidad_global)
     values ('99999999-0000-0000-0000-0000000000aa', 'KOB010101AAA', 'FACTURAMA', 'KOB010101AAA', 'PRUEBA', '01')
     on conflict (tenant_id) do update set tenant_id = excluded.tenant_id, rfc = excluded.rfc,
       proveedor_pac = excluded.proveedor_pac, facturama_issuer_ref = excluded.facturama_issuer_ref,
       estado = excluded.estado, periodicidad_global = excluded.periodicidad_global $$,
  'el dueño sigue guardando su configuración de facturación (upsert del panel)');
select is((select rfc_verificado::text from tenant_cfdi_emisor), 'KOB010101AAA', 'el upsert no tocó rfc_verificado');

-- ── tickets_cfdi: un empleado no escribe ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_a', 'role', 'authenticated')::text, true);

-- cfdi_crear_borrador con el RFC de OTRO cliente: el trigger lo fuerza al verificado.
select lives_ok($$
  select cfdi_crear_borrador(
    (select ticket from _t), 'INGRESO'::cfdi_tipo_comprobante,
    'XAXX010101000', 'PUBLICO EN GENERAL', 'S01', '37000', '616', null,
    'VIC010101VIC', 'VICTIMA SA DE CV', '601', '37000', 'PUE', '01', 'FACTURAMA'::cfdi_proveedor_pac)
$$, 'un empleado crea el borrador (la función es definer y acota al tenant)');
select is((select emisor_rfc::text from tickets_cfdi where ticket_id = (select ticket from _t)), 'KOB010101AAA',
  'el emisor_rfc del borrador es el RFC verificado, no el que mandó el cliente');

select throws_ok(
  $$ update tickets_cfdi set xml_storage_path = 'avatars/otro-tenant/secreto.pdf' $$,
  '42501', null, 'un empleado no reescribe xml_storage_path');
select throws_ok(
  $$ update tickets_cfdi set pac_referencia = 'CFDI-DE-OTRO-CLIENTE', estado_sat = 'TIMBRADO' $$,
  '42501', null, 'un empleado no reescribe pac_referencia ni estado_sat');
select throws_ok(
  $$ insert into tickets_cfdi (tenant_id, ticket_id, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal,
       emisor_lugar_expedicion, subtotal_mxn, total_mxn, metodo_pago_sat, forma_pago_sat, pac_proveedor)
     values ('99999999-0000-0000-0000-0000000000aa', (select ticket from _t), 'VIC010101VIC', 'X', '601', '37000',
       1, 1, 'PUE', '01', 'FACTURAMA') $$,
  '42501', null, 'un empleado no inserta en tickets_cfdi por fuera de cfdi_crear_borrador');
select throws_ok(
  $$ select cfdi_marcar_timbrado((select id from tickets_cfdi limit 1), 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', 'A', '1',
       now(), now(), 'cfdi/x.xml', 'cfdi/x.pdf', 'REF', 0, '{}'::jsonb, '{}'::jsonb) $$,
  '42501', null, 'un empleado no marca un CFDI como timbrado (ticket FACTURADO sin timbre real)');
select throws_ok(
  $$ select consumir_folio_cfdi('20202020-0000-0000-0000-0000000000aa', gen_random_uuid(), true) $$,
  '42501', null, 'un usuario no consume folios (de ningún tenant)');

-- Un ticket de otro tenant no se factura desde aquí, aunque la función sea definer.
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_b', 'role', 'authenticated')::text, true);
select throws_ok($$
  select cfdi_crear_borrador(
    (select ticket from _t), 'INGRESO'::cfdi_tipo_comprobante,
    'XAXX010101000', 'PUBLICO EN GENERAL', 'S01', '37000', '616', null,
    'VIC010101VIC', 'X', '601', '37000', 'PUE', '01', 'FACTURAMA'::cfdi_proveedor_pac)
$$, 'P0001', null, 'cfdi_crear_borrador no acepta un ticket de otro tenant');
reset role;

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('cfdi_marcar_timbrado', 'cfdi_marcar_error', 'cfdi_marcar_cancelado_sat',
                       'cfdi_registrar_cancelacion', 'consumir_folio_cfdi')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
$$, 'las funciones que asientan la respuesta del PAC y el consumo de folios son solo de service_role');
select ok(has_function_privilege('service_role', 'cfdi_marcar_timbrado(uuid, varchar, varchar, varchar, timestamptz, timestamptz, varchar, varchar, varchar, integer, jsonb, jsonb)', 'EXECUTE'),
  'service_role (las Edge Functions) sí marca el timbrado');

-- ── Storage ─────────────────────────────────────────────────────────────────────────────────
select is_empty($$ select polname from pg_policy where polname in ('cfdi_read_own_tenant', 'cfdi_write_own_tenant') $$,
  'no quedan políticas de Storage que abran el bucket cfdi a los empleados');

-- ── Token de autofactura ────────────────────────────────────────────────────────────────────
select is(encode(_vim_hmac_sha256(convert_to('Jefe', 'UTF8'), convert_to('what do ya want for nothing?', 'UTF8')), 'hex'),
  '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'HMAC-SHA256: RFC 4231 caso 2');
select is(encode(_vim_hmac_sha256(decode(repeat('aa', 131), 'hex'), convert_to('Test Using Larger Than Block-Size Key - Hash Key First', 'UTF8')), 'hex'),
  '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54', 'HMAC-SHA256: RFC 4231 caso 6 (llave > bloque)');

-- Caja de escritorio = base SIN secreto. En la nube (y en el Supabase del CI) la 0135 lo genera,
-- así que se quita aquí, dentro de la transacción, en vez de depender del entorno.
delete from cfdi_autofactura_secreto;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_a', 'role', 'authenticated')::text, true);
select is(autofactura_token((select ticket from _t)), null, 'sin secreto (caja de escritorio) no hay token');
select throws_ok($$ select * from cfdi_autofactura_secreto $$, '42501', null, 'un usuario no lee el secreto');
reset role;

delete from cfdi_autofactura_secreto;
insert into cfdi_autofactura_secreto (id, secreto) values (true, decode(repeat('0b', 32), 'hex'));
create temporary table _esperado on commit drop as
  select left(translate(encode(_vim_hmac_sha256(decode(repeat('0b', 32), 'hex'), convert_to(ticket::text, 'UTF8')), 'base64'), '+/=', '-_'), 16) as token
    from _t;
grant select on _esperado to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_a', 'role', 'authenticated')::text, true);
select is(autofactura_token((select ticket from _t)), (select token from _esperado),
  'el POS del tenant obtiene el token de su ticket: base64url(HMAC)[:16]');
select set_config('request.jwt.claims', json_build_object('sub', :'maria', 'tenant_id', :'tenant_b', 'role', 'authenticated')::text, true);
select is(autofactura_token((select ticket from _t)), null, 'otro tenant no obtiene el token de un ticket ajeno');
reset role;
select ok(not has_function_privilege('anon', 'autofactura_token(uuid)', 'EXECUTE'), 'anon no pide tokens');

select * from finish();
rollback;
