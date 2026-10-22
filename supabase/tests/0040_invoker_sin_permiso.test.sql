-- ============================================================================
-- Una RPC que corre con el JWT del usuario no puede llamar a una función que ese usuario no
-- puede ejecutar.
--
-- El caso real que atrapa: la 0196 hizo que cancelar_ticket_pagado (SECURITY INVOKER) llamara a
-- _ticket_de_cambio_abierto, revocada para authenticated. Cancelar cualquier ticket fallaba con
-- «permission denied». Los smokes corren como superusuario y pasaban en verde. Corregido en 0199.
--
-- La búsqueda es por texto (nombre seguido de paréntesis) en el cuerpo de la función: puede dar un
-- falso positivo si una función menciona el nombre en un comentario; ahí se arregla el comentario.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(1);

select is_empty($$
  with prohibidas as (
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and not has_function_privilege('authenticated', p.oid, 'execute')
  )
  select c.proname || ' -> ' || x.proname as invoker_llama_funcion_sin_permiso
    from pg_proc c join pg_namespace n on n.oid = c.pronamespace, prohibidas x
   where n.nspname = 'public' and not c.prosecdef
     and has_function_privilege('authenticated', c.oid, 'execute')
     and c.prosrc ~ ('\m' || x.proname || '\s*\(')
   order by 1
$$, 'Ninguna RPC invoker de authenticated llama a una función que authenticated no puede ejecutar');

select * from finish();
rollback;
