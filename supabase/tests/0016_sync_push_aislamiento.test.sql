-- ============================================================================
-- 0131 · sync_push_snapshot no puede tocar filas de otro negocio.
--
-- Antes de la 0131, una caja del negocio A que empujaba una fila con el id de una fila del
-- negocio B la sobreescribía (tenant_id incluido) por el ON CONFLICT (id) DO UPDATE. Y en modo
-- réplica una fila hija de A podía colgar de un padre de B.
-- ============================================================================
begin;
select plan(7);

\set tenant_a '99999999-0000-0000-0000-0000000000aa'
\set suc_a    '99999999-0000-0000-0000-0000000000bb'
\set tenant_b '16161616-0000-0000-0000-0000000000aa'
\set suc_b    '16161616-0000-0000-0000-0000000000bb'
\set zona_b   '16161616-0000-0000-0000-0000000000e1'
\set cli_b    '16161616-0000-0000-0000-0000000000c1'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'tenant_b', 'tenant-b-0016', 'Tenant B', 'ACTIVO', 'QUICK_SERVICE');
insert into sucursales (id, tenant_id, codigo, nombre) values (:'suc_b', :'tenant_b', 'B16', 'B Centro');
insert into zonas_envio (id, tenant_id, sucursal_id, nombre, costo_mxn)
  values (:'zona_b', :'tenant_b', :'suc_b', 'Zona de B', 40);
insert into clientes (id, tenant_id, nombre) values (:'cli_b', :'tenant_b', 'Cliente de B');

-- 1) A empuja una zona con el id de la de B, reclamándola como suya.
select sync_push_snapshot(:'tenant_a'::uuid, jsonb_build_object('zonas_envio', jsonb_build_array(
  jsonb_build_object('id', :'zona_b', 'tenant_id', :'tenant_a', 'sucursal_id', :'suc_a',
                     'nombre', 'robada', 'costo_mxn', 0, 'orden', 0, 'activa', true,
                     'created_at', now(), 'updated_at', now()))));

select is((select tenant_id::text from zonas_envio where id = :'zona_b'), :'tenant_b',
  'la zona de B sigue siendo de B');
select is((select nombre from zonas_envio where id = :'zona_b'), 'Zona de B',
  'la zona de B no se reescribió');
select is((select costo_mxn from zonas_envio where id = :'zona_b'), 40.00::numeric,
  'el costo de la zona de B no cambió');

-- 2) El rechazo no es silencioso: queda como error en el evento de sync.
select ok(
  (select response_summary::text like '%fila de otro negocio%' from sync_eventos
    where tenant_id = :'tenant_a' order by fecha_procesado_inicio desc limit 1),
  'el rechazo queda registrado con su motivo');

-- 3) Una fila hija de A que cuelga de un padre de B se rechaza (FK apagada en réplica).
select sync_push_snapshot(:'tenant_a'::uuid, jsonb_build_object('direcciones_cliente', jsonb_build_array(
  jsonb_build_object('id', '16161616-0000-0000-0000-0000000000d1', 'tenant_id', :'tenant_a',
                     'cliente_id', :'cli_b', 'etiqueta', 'Casa', 'calle', 'X', 'numero_exterior', '1', 'colonia', 'C',
                     'codigo_postal', '37000', 'ciudad', 'León', 'estado_geo', 'GTO', 'pais', 'MX',
                     'es_principal', true, 'activa', true, 'created_at', now(), 'updated_at', now()))));
select is((select count(*)::int from direcciones_cliente where id = '16161616-0000-0000-0000-0000000000d1'), 0,
  'no entra una dirección de A colgada de un cliente de B');

-- 4) Lo legítimo sigue entrando: una zona nueva de A.
select sync_push_snapshot(:'tenant_a'::uuid, jsonb_build_object('zonas_envio', jsonb_build_array(
  jsonb_build_object('id', '16161616-0000-0000-0000-0000000000e2', 'tenant_id', :'tenant_a',
                     'sucursal_id', :'suc_a', 'nombre', 'Zona de A', 'costo_mxn', 25, 'orden', 0,
                     'activa', true, 'created_at', now(), 'updated_at', now()))));
select is((select tenant_id::text from zonas_envio where id = '16161616-0000-0000-0000-0000000000e2'), :'tenant_a',
  'una fila propia de A se aplica');

-- 5) Y reenviarla (upsert de lo propio) sigue funcionando.
select is(
  (_vim_apply_rows_detalle('zonas_envio', jsonb_build_array(
     jsonb_build_object('id', '16161616-0000-0000-0000-0000000000e2', 'tenant_id', :'tenant_a',
                        'sucursal_id', :'suc_a', 'nombre', 'Zona de A v2', 'costo_mxn', 30, 'orden', 0,
                        'activa', true, 'created_at', now(), 'updated_at', now())), :'tenant_a'::uuid)->>'aplicadas')::int,
  1, 'el upsert de una fila propia se aplica');

select * from finish();
rollback;
