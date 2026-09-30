-- ============================================================================
-- 0136 · Cupos en la base (consumir_cupo / cupo_agotado) y el pull de la caja sin contraseñas
-- de personas. Auditoría integral 30/09/2026, hallazgos C2-1/3/7 y C2-5.
--
-- Antes de la 0136: consumir_cupo no existía (el límite de tasa vivía en memoria de cada
-- instancia) y sync_pull_snapshot mandaba a la caja el bcrypt de la contraseña del DUEÑO.
-- ============================================================================
begin;
select plan(18);

-- ── consumir_cupo ───────────────────────────────────────────────────────────
select has_function('public', 'consumir_cupo', array['text', 'interval', 'integer'], 'existe consumir_cupo');
select has_function('public', 'cupo_agotado',  array['text', 'interval', 'integer'], 'existe cupo_agotado');

select is(consumir_cupo('t0021:ip', '1 hour', 2), true,  '1.º uso de 2: cabe');
select is(consumir_cupo('t0021:ip', '1 hour', 2), true,  '2.º uso de 2: cabe');
select is(cupo_agotado('t0021:ip', '1 hour', 2), true,   'cupo_agotado lo ve lleno sin sumar');
select is(consumir_cupo('t0021:ip', '1 hour', 2), false, '3.º uso de 2: ya no cabe');
select is(consumir_cupo('t0021:otra-ip', '1 hour', 2), true, 'otra clave lleva su propia cuenta');

-- Ventana: con una de 1 s, al pasar el segundo se empieza de cero.
select is(consumir_cupo('t0021:corta', '1 second', 1), true,  'ventana corta: 1.º uso cabe');
select is(consumir_cupo('t0021:corta', '1 second', 1), false, 'ventana corta: 2.º uso no cabe');
select pg_sleep(1.1);
select is(consumir_cupo('t0021:corta', '1 second', 1), true,  'ventana nueva: se vuelve a contar desde cero');

-- La limpieza se lleva las ventanas vencidas.
insert into limites_cupo (clave, ventana_inicio, expira_en, usos)
  values ('t0021:vieja', now() - interval '2 days', now() - interval '1 day', 9);
select consumir_cupo('t0021:dispara-limpieza', '1 hour', 5);
select is((select count(*)::int from limites_cupo where clave = 't0021:vieja'), 0, 'las ventanas vencidas se borran');

-- Nadie más que service_role puede llamarlas ni leer la tabla.
select ok(not has_function_privilege('anon', 'consumir_cupo(text, interval, integer)', 'execute'),
  'anon no ejecuta consumir_cupo');
select ok(not has_function_privilege('authenticated', 'consumir_cupo(text, interval, integer)', 'execute'),
  'authenticated no ejecuta consumir_cupo');
select ok(not has_function_privilege('authenticated', 'cupo_agotado(text, interval, integer)', 'execute')
      and not has_function_privilege('anon', 'cupo_agotado(text, interval, integer)', 'execute'),
  'ni anon ni authenticated ejecutan cupo_agotado');
select ok(not has_table_privilege('authenticated', 'limites_cupo', 'select')
      and not has_table_privilege('anon', 'limites_cupo', 'insert'),
  'limites_cupo no se lee ni se escribe como cliente');

-- ── sync_pull_snapshot ─────────────────────────────────────────────────────
-- Seed: dueno@knockout.dev (DUEÑO) y la cuenta de la Caja 01 (DISPOSITIVO) del tenant ...aa.
create temporary table _users on commit drop as
  select e from jsonb_array_elements(sync_pull_snapshot('99999999-0000-0000-0000-0000000000aa'::uuid)->'users') e;

select ok(
  (select e ? 'encrypted_password' and e->'encrypted_password' = 'null'::jsonb
     from _users where e->>'id' = '99999999-0000-0000-0000-0000000000e1'),
  'la contraseña del DUEÑO no baja a la caja (null explícito, para borrar la copia vieja)');

select is(
  (select e->>'encrypted_password' from _users where e->>'id' = '99999999-0000-0000-0000-0000000000d1'),
  (select encrypted_password::text from auth.users where id = '99999999-0000-0000-0000-0000000000d1'),
  'la contraseña de la cuenta de la CAJA sí baja (deviceSignIn sin internet)');

select is(
  (select count(*)::int from _users where e->>'encrypted_password' is not null), 1,
  'de todas las cuentas del tenant, solo la de la caja lleva contraseña');

select * from finish();
rollback;
