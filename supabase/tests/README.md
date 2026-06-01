# Tests de base de datos (pgTAP)

Pruebas que corren **dentro de Postgres** vía el harness de Supabase.

## Correr

```bash
supabase start          # stack local (necesita Docker)
supabase db reset       # aplica migraciones 0001–0006 + seed.sql
supabase test db        # corre todos los *.test.sql de esta carpeta
```

## Tests

- **`0001_rls_cross_tenant.test.sql`** — el chequeo de seguridad **no negociable**:
  un usuario `authenticated` de un tenant no puede ver ni escribir filas de otro
  (simula el claim `request.jwt.claims.tenant_id`). Cubre `tenants` y
  `tenant_feature_flags` (lectura aislada + WITH CHECK en INSERT).

## Si el test falla la primera vez

Lo más probable: el rol `authenticated` **no tiene GRANT** sobre las tablas nuevas.
Supabase suele aplicar privilegios por defecto a `anon`/`authenticated`/`service_role`,
pero si no, agrega al final de las migraciones (o en una migración `0007_grants.sql`):

```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;            -- solo catálogos públicos
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
```

El **RLS sigue gateando las filas**; el GRANT solo habilita el acceso a nivel tabla.
(Doc 11 §9 — testing pragmático: RLS cross-tenant es el primero en verde.)
