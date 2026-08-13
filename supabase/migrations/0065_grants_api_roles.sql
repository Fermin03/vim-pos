-- 0065 — Privilegios de tabla para los roles de la API.
--
-- Por qué hace falta. El RLS decide QUÉ FILAS ve cada quien, pero antes de eso Postgres exige un
-- privilegio de TABLA. Ninguna migración lo otorgaba: se daba por hecho que los default privileges
-- de Supabase lo harían. En el stack efímero del CI no ocurre, y el test 0001 (el smoke
-- cross-tenant, el chequeo "no negociable" del proyecto) moría con
-- `permission denied for table tenants` antes de llegar a comprobar nada.
--
-- Llevaba oculto desde julio porque el job rls-tests ni siquiera arrancaba: `supabase start` se caía
-- antes, al sembrar. Con eso arreglado salió esto. El README de supabase/tests/ ya lo anticipaba.
--
-- En producción esto es un no-op: los privilegios ya están (si no, el admin no podría leer nada) y
-- GRANT es idempotente. Su valor está en que el entorno se vuelve reproducible desde cero.
--
-- DIFERENCIA A PROPÓSITO CON EL README: el README sugería además
-- `grant select on all tables to anon`. No se hace. `anon` es el rol de la llave pública, sin
-- usuario detrás, y ninguna política del esquema lo menciona (`TO anon` no aparece en ninguna
-- migración): no necesita nada. Y si algún día una tabla perdiera su RLS, el grant a anon
-- convertiría ese descuido en una fuga pública en vez de en un error de permisos.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Que no vuelva a pasar con las tablas que se creen de aquí en adelante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- Las funciones NO entran aquí: sus privilegios se gestionan una por una (0045 y 0063), justo
-- porque un GRANT en masa sobre funciones SECURITY DEFINER fue el origen de CN-002.
