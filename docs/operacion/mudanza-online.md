# Mudanza de la tienda a `online.vimpos.com.mx`

La tienda (restaurantes y reservas de belleza) pasa de `pedidos.vimpos.com.mx` a
`online.vimpos.com.mx`. El código ya apunta a la dirección nueva y `apps/tienda/next.config.mjs`
redirige (308) todo lo que llegue con host `pedidos` a la misma ruta en `online`.

**El merge publica la mudanza.** Al mezclar, Vercel despliega solos `vim-tienda` (con el redirect) y
`admin` (con enlaces a `online`). Por eso los pasos 1–6 van **antes del merge**: si se mezcla
primero, todo enlace `pedidos.*` (correos, QR, tiendas encendidas) manda a un host sin DNS, o cada
pedido, registro y reserva falla con «No pudimos comprobar que eres una persona». Nada de esto se
toca hasta que Fermín lo pida.

## Orden (todo antes del merge)

1. **DNS:** crear el registro `online` (CNAME, como lo muestre Vercel) en `vimpos.com.mx`.
2. **Vercel, proyecto `vim-tienda`:** Settings → Domains → añadir `online.vimpos.com.mx` y esperar a
   que quede en verde. **Mantener `pedidos.vimpos.com.mx` en el MISMO proyecto `vim-tienda`**: es lo
   que hace que el redirect corra; si se quita el dominio, los enlaces viejos dejan de abrir.
3. **Cloudflare Turnstile:** en el widget existente añadir `online.vimpos.com.mx` a los hostnames
   (dejar `admin`, `pedidos` y `localhost`). No crear widget nuevo ni cambiar llaves.
4. **Supabase, secreto `TURNSTILE_HOSTNAMES`:** `admin.vimpos.com.mx,online.vimpos.com.mx,pedidos.vimpos.com.mx`.
   No quitar `admin` (rompe el registro de negocios) ni `pedidos` hasta que el DNS esté totalmente
   movido. La variable reemplaza a la de fábrica, no se suma.
5. **Supabase, secreto `VIM_TIENDA_URL=https://online.vimpos.com.mx`** (sin barra final), en cuanto el
   dominio del paso 2 esté en verde. Es la base de los enlaces de los correos nuevos.
6. **`VIM_TIENDA_SECRET`:** confirmar que sigue igual en Vercel (`vim-tienda`) y en los secretos de
   Supabase. Ya existe; no se cambia, solo se comprueba.
7. **Merge.** Es lo que publica el redirect y los enlaces del admin; no hay un redespliegue aparte.

## Qué esperar

- **Las sesiones de cuenta de la tienda se cierran una vez.** La cookie es `__Host-vt_<negocio>`:
  queda atada al host, así que la de `pedidos` no vale en `online`. Cada clienta vuelve a entrar.
- **Los correos viejos siguen funcionando:** un enlace `pedidos.vimpos.com.mx/<negocio>/pedido/<código>`
  redirige a `online` con la misma ruta (el código viaja en la ruta, no se pierde).
- **Una pestaña que quedó abierta en `pedidos` falla una vez.** El 308 también alcanza a
  `POST /api/tienda`: el navegador no sigue esa redirección a otro origen, así que el siguiente pedido,
  reserva o pago (también un 3DS a medias) da error. Recargar la página lo arregla.

## Comprobar

`curl -sI https://pedidos.vimpos.com.mx/knockout` responde `308` con `location: https://online.vimpos.com.mx/knockout`;
`https://online.vimpos.com.mx/nadie-existe` dice «No encontramos esta página».
