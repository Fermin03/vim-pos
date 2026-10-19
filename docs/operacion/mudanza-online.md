# Mudanza de la tienda a `online.vimpos.com.mx`

La tienda (restaurantes y reservas de belleza) pasa de `pedidos.vimpos.com.mx` a
`online.vimpos.com.mx`. El código ya apunta a la dirección nueva y `apps/tienda/next.config.mjs`
redirige (308) todo lo que llegue con host `pedidos` a la misma ruta en `online`. Lo de abajo son los
pasos de lanzamiento: DNS, Vercel y secretos, que **no** se tocan hasta que Fermín lo pida.

## Orden

1. **DNS:** crear el registro `online` (CNAME, como lo muestre Vercel) en `vimpos.com.mx`.
2. **Vercel, proyecto `vim-tienda`:** Settings → Domains → añadir `online.vimpos.com.mx`.
3. **Mantener `pedidos.vimpos.com.mx` en el MISMO proyecto `vim-tienda`.** Es lo que hace que el
   redirect corra; si se quita el dominio, los enlaces viejos dejan de abrir.
4. **Supabase, secreto `VIM_TIENDA_URL=https://online.vimpos.com.mx`** (sin barra final). Es la base
   de los enlaces de los correos nuevos.
5. **Supabase, secreto `TURNSTILE_HOSTNAMES`:** `admin.vimpos.com.mx,online.vimpos.com.mx,pedidos.vimpos.com.mx`.
   No quitar `admin` (rompe el registro de negocios) ni `pedidos` hasta que el DNS esté totalmente
   movido. La variable reemplaza a la de fábrica, no se suma.
6. **Cloudflare Turnstile:** en el widget existente añadir `online.vimpos.com.mx` a los hostnames
   (dejar `admin`, `pedidos` y `localhost`). No crear widget nuevo ni cambiar llaves.
7. Redesplegar `vim-tienda` y las funciones que leen `VIM_TIENDA_URL` solo cuando Fermín lo apruebe.

## Qué esperar

- **Las sesiones de cuenta de la tienda se cierran una vez.** La cookie es `__Host-vt_<negocio>`:
  queda atada al host, así que la de `pedidos` no vale en `online`. Cada clienta vuelve a entrar.
- **Los correos viejos siguen funcionando:** un enlace `pedidos.vimpos.com.mx/<negocio>/pedido/<código>`
  redirige a `online` con la misma ruta (el código viaja en la ruta, no se pierde).

## Comprobar

`curl -sI https://pedidos.vimpos.com.mx/knockout` responde `308` con `location: https://online.vimpos.com.mx/knockout`;
`https://online.vimpos.com.mx/nadie-existe` dice «No encontramos esta página».
