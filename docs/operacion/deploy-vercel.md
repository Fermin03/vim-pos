# Deploy a Vercel — VIM POS (monorepo pnpm + turbo)

3 apps = **3 proyectos Vercel** en la misma cuenta (`fermin03` / team `fermin03s-projects`),
todos desde el mismo repo de GitHub `Fermin03/vim-pos`.

## Gotcha del monorepo (resuelto)
La CLI `vercel deploy` **desde `apps/pos`** sube SOLO esa carpeta y usa `npm install` → falla
(no resuelve `@vim/*`). Hay que:
1. Setear **Root Directory = `apps/<app>`** a nivel proyecto (API o dashboard).
2. Desplegar **desde la raíz del repo** (`vercel deploy --prod` con la raíz linkeada al proyecto)
   → sube todo el monorepo, detecta `pnpm-lock.yaml` + turbo, hace `pnpm install` de los 7
   workspaces y `turbo run build` del app filtrado.

## Receta por app (CLI, autenticada con `XDG_DATA_HOME=D:\vercel-cli-cfg`)
> En este entorno la config de la CLI debe vivir en `D:` (el perfil C: es un junction → EXDEV).

```bash
# 1) Crear el proyecto (primer deploy desde la carpeta del app, sólo para crearlo)
cd apps/<app> && vercel deploy --yes           # crea el proyecto "<app>"
# 2) Setear rootDirectory + framework vía API (token en D:\vercel-cli-cfg\com.vercel.cli\auth.json)
curl -X PATCH "https://api.vercel.com/v9/projects/<PID>?teamId=<TEAM>" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"rootDirectory":"apps/<app>","framework":"nextjs"}'
# 3) Env vars (API, upsert=true). Públicas: NEXT_PUBLIC_*. Secretas solo platform (server).
curl -X POST "https://api.vercel.com/v10/projects/<PID>/env?teamId=<TEAM>&upsert=true" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"key":"NEXT_PUBLIC_SUPABASE_URL","value":"...","type":"plain","target":["production","preview","development"]}'
# 4) Linkear la RAÍZ al proyecto y desplegar desde la raíz
echo '{"projectId":"<PID>","orgId":"<TEAM>","projectName":"<app>"}' > .vercel/project.json
vercel deploy --prod --yes
```

## Env vars por app
- **pos** y **admin**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **platform**: además `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server, secreta),
  `PLATFORM_PROVISION_KEY`, `VIM_JWT_SECRET`, `ADMIN_APP_URL` (para impersonación).
- **Edge Functions** (Supabase, no Vercel): `VIM_CORS_ORIGINS`, `FACTURAPI_API_KEY`, etc.

## Auto-deploy en cada commit
Conectar cada proyecto al repo de GitHub (Settings → Git) con Root Directory ya seteado →
cada `git push` a `main` redespliega automáticamente.

## PENDIENTE de backend (sin esto las apps cargan pero no funcionan)
- `supabase link` + `supabase db push` (las 43 migraciones) al proyecto cloud `pbiaxzvmssjsxdwqrumb`.
- `supabase functions deploy` (las 7 edge functions) + `supabase secrets set`.

## Borrar despliegues viejos

**Cada despliegue sigue vivo en su propia URL, sirviendo el sitio tal como estaba ese día.** Sacar
algo de `main` no toca ninguno de los anteriores, y el panel de Vercel no borra en lote: es de uno
en uno. Para eso está `scripts/borrar-despliegues-vercel.mjs`.

```bash
npx vercel@latest login                                              # deja la sesión en disco
node scripts/borrar-despliegues-vercel.mjs --proyecto=sitio-web      # solo LISTA
node scripts/borrar-despliegues-vercel.mjs --proyecto=sitio-web --borrar
```

Sin `--borrar` no borra nada. Nunca toca el despliegue que sirve producción —se lo pregunta a la
API en vez de deducirlo por fecha— ni nada posterior al corte, para que queden destinos de *Instant
Rollback*. El corte por defecto es el merge que sacó los datos personales del sitio (6 sep 2026);
se cambia con `--antes-de=2026-08-01`.

Se usó el 8 de septiembre de 2026 para borrar los **107 despliegues de `sitio-web`** anteriores a
esa purga. Los de `platform`, `admin`, `pos` y `vim-factura` se dejaron a propósito: nunca
publicaron esos datos —bajo `apps/` solo estaban en dos archivos de test y en un comentario de
código— y borrarlos se llevaría por delante el historial de rollback del producto.

**Ojo al comprobar si una URL de despliegue está expuesta.** Con Deployment Protection en modo
estándar, `vimpos.com.mx` es público pero las URLs `.vercel.app` redirigen (302) al login de
Vercel. `curl -L` sigue la redirección y devuelve **200** — que es la página de login, no el sitio.
Hay que mirar sin seguir redirecciones:

```bash
curl -s -D - -o /dev/null https://<despliegue>.vercel.app/
```
