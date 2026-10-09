# Tienda en línea — cómo publicar la tienda pública

Guía para Fermín. La tienda que verán los comensales (`apps/tienda`) ya está construida y probada,
pero **no está publicada**: nadie puede abrirla hasta que se hagan los pasos de abajo. Son
dominios, claves y servicios externos, y por eso no se tocan sin ti.

Cada paso dice **quién lo hace**:

- **[Tú]** solo tú puedes: entras con tu cuenta (Cloudflare, el proveedor del dominio) o es una
  decisión tuya.
- **[Tú o Claude]** lo puede hacer Claude **si se lo pides** (tiene la sesión de Vercel y el acceso a
  Supabase de siempre). Claude no actúa sobre producción por su cuenta: dile «haz el paso N».

> **Regla de oro:** las claves nunca se pegan en el chat ni en un archivo del repositorio. La clave de
> la tienda (`VIM_TIENDA_SECRET`) está en `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt`. Si le
> pides a Claude que la ponga en Vercel, la lee de ese archivo y la manda directo, sin mostrarla.

## El orden, en una línea

Cloudflare (1) → Supabase (2) → Vercel: proyecto, variables y dominio (3, 4, 5) → prueba (6 y 7).

El orden importa en un punto: **los pasos 1 y 2 van antes de que el dominio exista** (5). Si la
tienda sale antes, el primer cliente que intente pedir recibe «no pudimos verificar que eres una
persona».

---

## Antes de empezar: lo que ya debería estar

| Qué | Cómo comprobarlo |
|---|---|
| La función `tienda` desplegada en Supabase, con su clave `VIM_TIENDA_SECRET` | **[Tú o Claude]** pide «comprueba que la función `tienda` contesta»: sin clave debe responder 401, no 404. |
| `TURNSTILE_SECRET_KEY` puesta en Supabase (se puso el 30 sep 2026 para el registro) | **[Tú o Claude]** «lista los secretos de Supabase» (solo muestra los nombres). |
| La llave pública del captcha (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | Está en Vercel, proyecto **admin**, variables de entorno. Se copia tal cual. |

---

## Paso 1 — Cloudflare Turnstile: añadir el dominio nuevo · **[Tú]**

El captcha de la tienda es **el mismo widget** que el del registro del admin (la función solo conoce
una pareja de llaves). Hay que decirle que ahora también vale en `pedidos.vimpos.com.mx`.

1. Entra a Cloudflare → **Turnstile** → el widget que ya existe (el del registro de VIM POS).
2. En **Hostnames** deja los que tiene (`admin.vimpos.com.mx`, `localhost`) y **añade**
   `pedidos.vimpos.com.mx`. Guarda.

**Cómo comprobarlo:** al volver a abrir el widget, la lista de hostnames tiene los tres.
No crees un widget nuevo ni cambies las llaves: se rompería el registro.

## Paso 2 — Supabase: `TURNSTILE_HOSTNAMES` con los DOS dominios · **[Tú o Claude]**

La función revisa de qué sitio viene cada captcha. Hoy, sin esta variable, solo acepta
`admin.vimpos.com.mx`. Hay que ponerla con **los dos**:

```
TURNSTILE_HOSTNAMES=admin.vimpos.com.mx,pedidos.vimpos.com.mx
```

> **Ojo:** si pones solo `pedidos.vimpos.com.mx`, **se rompe el registro de negocios del admin**
> (la variable reemplaza a la de fábrica, no se suma). Siempre los dos, separados por coma, sin
> espacios.

Mientras estás en los secretos de Supabase:

- **`CAPTCHA_OPCIONAL` no debe existir en producción.** Es un atajo solo para desarrollo que apaga
  la verificación. Si aparece en la lista, bórralo. **[Tú o Claude]**
- **`VIM_TIENDA_URL=https://pedidos.vimpos.com.mx`** (opcional pero recomendado): es la base de los
  enlaces del correo de confirmación que recibe el cliente. Sin ella el pedido funciona, pero ese
  correo no sale. También hace falta que estén los `VIM_SMTP_*` (ya los usa el registro).

**Cómo comprobarlo:** la lista de secretos muestra `TURNSTILE_HOSTNAMES` y no muestra
`CAPTCHA_OPCIONAL`. Y el registro sigue funcionando: abre `admin.vimpos.com.mx/registro` y
comprueba que el captcha aparece y se resuelve. (Terminar el registro con un correo de prueba es la
prueba completa; si lo haces, pídele a Claude que borre esa cuenta después.)

## Paso 3 — Vercel: crear el proyecto `vim-tienda` · **[Tú o Claude]**

1. En Vercel (equipo `fermin03s-projects`) → **Add New → Project** → importa el mismo repositorio
   que los demás (`Fermin03/vim-pos`).
2. **Project Name:** `vim-tienda`.
3. **Framework Preset:** Next.js.
4. **Root Directory:** `apps/tienda`. Deja activada la casilla *Include source files outside of the
   Root Directory* (la tienda usa los paquetes compartidos `@vim/ui` y `@vim/fecha`).
5. Install y Build command: los de fábrica (Vercel detecta pnpm solo). Node.js Version: 22.x.
6. **No des Deploy todavía:** primero las variables (paso 4). Si lo diste, no pasa nada, solo falla.

Si se lo pides a Claude, lo hace con la receta de [`deploy-vercel.md`](deploy-vercel.md) (la misma
de las demás apps, con el nombre `vim-tienda` y `rootDirectory: apps/tienda`).

**Cómo comprobarlo:** en Vercel aparece el proyecto `vim-tienda` conectado al repositorio y en
*Settings → General* el Root Directory dice `apps/tienda`.

## Paso 4 — Vercel: las tres variables · **[Tú o Claude]**

En el proyecto `vim-tienda` → **Settings → Environment Variables**. Marca Production, Preview y
Development.

| Nombre | Valor | Notas |
|---|---|---|
| `VIM_TIENDA_SECRET` | el contenido de `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt` | **Sensible: márcala como «Sensitive».** Es la misma que ya tiene Supabase; si no coinciden, toda la tienda contesta «no disponible». Es solo de servidor: sin `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SUPABASE_URL` | la dirección del proyecto de Supabase (`https://pbiaxzvmssjsxdwqrumb.supabase.co`) | La misma que usan admin y pos. De aquí salen la dirección de la función y las fotos del menú. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | la misma llave pública del proyecto **admin** | Es pública (se ve en el navegador); no confundir con la llave secreta, que solo vive en Supabase. |

La tienda **no** necesita la `anon key` ni la `service_role`: no las pongas.

**Cómo comprobarlo:** las tres aparecen en la lista; `VIM_TIENDA_SECRET` con el ojo tachado
(oculta). Dale **Deploy** (o *Redeploy*) al último commit de la rama principal una vez mezclada la
rama de la tienda; el despliegue debe terminar en «Ready».

## Paso 5 — Dominio `pedidos.vimpos.com.mx` · **[Tú]**

1. En `vim-tienda` → **Settings → Domains** → añade `pedidos.vimpos.com.mx`.
2. Vercel te dirá qué registro DNS falta (normalmente un **CNAME** de `pedidos` hacia el valor que
   muestra). Si el DNS de `vimpos.com.mx` lo lleva Vercel, se crea solo. Si lo lleva otro proveedor
   (el del dominio), añade ahí el registro tal como lo muestra Vercel.
3. Espera a que Vercel marque el dominio en verde (minutos; a veces más con el DNS). El certificado
   HTTPS se crea solo.

**Cómo comprobarlo:** abrir `https://pedidos.vimpos.com.mx/` carga una página sencilla (la raíz no
es una tienda: no hay nada que ver ahí, y está bien). Una dirección que no existe, por ejemplo
`https://pedidos.vimpos.com.mx/nadie-existe`, dice que la tienda no está disponible.

> Con *Deployment Protection* activa, las direcciones `.vercel.app` piden iniciar sesión; el dominio
> propio es público. Pruébalo siempre en el dominio propio, no en la dirección `.vercel.app`.

---

## Paso 6 — Preparar un negocio interno para la prueba · **[Tú o Claude]**

La prueba de humo se hace con un negocio nuestro (por ejemplo, **VIM Pruebas**), nunca con un
cliente. Hace falta:

1. **El complemento «Tienda en línea» concedido a ese negocio.** Todavía no se puede dar desde el
   panel de VIM: el complemento nace inactivo y no aparece en la lista hasta la entrega 7. Se
   concede a mano en la base de producción. **[Claude, con tu visto bueno]**: pídeselo así: «concede
   el complemento TIENDA a VIM Pruebas».
2. **En su admin → Tienda en línea:** elegir la dirección (por ejemplo `vim-pruebas`), marcar al
   menos una sucursal como participante, ponerle horario que incluya la hora de la prueba, dejar al
   menos una forma de pago, y **encender** la tienda. La lista de pendientes que muestra la propia
   pantalla dice qué falta. Si quieres probar domicilio, la sucursal necesita una zona de envío
   activa.
3. **Una caja con turno abierto y con internet** en esa sucursal. Tiene que ser una de estas dos:
   - **El POS en el navegador, con turno abierto.** Es lo más fácil y funciona hoy.
   - **Una caja de escritorio con la versión 0.8.0.** Esa versión **todavía no está publicada**
     (la última es la 0.7.0; ver [`instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md)).
     Una caja 0.7.0 con turno abierto **no basta**: la tienda diría «sin turno abierto».
   - Cuidado: no tengas a la vez una caja 0.7.0 y el POS web abiertos en la misma sucursal.

## Paso 7 — Prueba de humo, de punta a punta · **[Tú]** (Claude puede mirar los registros)

Hazla desde tu teléfono, con datos tuyos. Marca cada punto:

1. Abre `https://pedidos.vimpos.com.mx/<dirección-del-negocio>`. **Debe verse:** nombre, logo y
   color del negocio, el menú con precios y «Abierto».
2. Elige un producto (si hay uno con opciones, elige alguna) y agrégalo. **Debe:** salir el carrito
   con el total.
3. Si hay un **combo**, pruébalo también: debe poder completarse. (Si un combo no se puede pedir, el
   admin lo avisa en Tienda en línea → «Combos que tus clientes no pueden pedir».)
4. Haz el pedido **para recoger, pagando en efectivo**, con tu nombre, teléfono y correo. **Debe:**
   aparecer el captcha, resolverse solo o con un clic, y mostrarte la pantalla del pedido con su
   número. Si dice «no pudimos verificar que eres una persona», revisa los pasos 1 y 2.
5. En la caja (o el POS web): en **Pedidos en línea** debe sonar y aparecer el pedido. Acéptalo.
   **Debe:** la pantalla del pedido en tu teléfono pasar a «Aceptado» en unos segundos (se
   actualiza sola).
6. Imprime la cuenta o cóbrala. **Debe:** el pedido avanzar a «Listo» y luego a «Entregado».
7. Revisa tu correo: debe llegar la confirmación del pedido (si pusiste `VIM_TIENDA_URL` y los
   `VIM_SMTP_*`).
8. Cierra el turno en la caja y recarga la tienda. **Debe:** decir que no está recibiendo pedidos
   por ahora (y no dejar pedir).
9. Repite con **a domicilio** si el negocio lo tiene activo.

**Si algo falla:**

| Se ve | Probable causa |
|---|---|
| Todas las pantallas dicen «no pudimos cargar la tienda» | `VIM_TIENDA_SECRET` distinta en Vercel y en Supabase, o falta en Vercel. |
| «La tienda no está disponible» en una dirección que sí existe | La tienda está apagada, el negocio no tiene el complemento, o ninguna sucursal participa. |
| «Sin turno abierto» con la caja abierta | Caja 0.7.0 (ver paso 6), o la caja no tiene internet. |
| Captcha que no aparece | Falta `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en Vercel o el dominio no está en Cloudflare (paso 1). Hace falta redesplegar tras cambiar una variable. |
| «No pudimos verificar que eres una persona» al enviar | `TURNSTILE_HOSTNAMES` sin `pedidos.vimpos.com.mx` (paso 2). |
| Las fotos no cargan | `NEXT_PUBLIC_SUPABASE_URL` distinta de la del proyecto real. |

**Para volver atrás sin tirar nada:** apaga el interruptor en el admin del negocio de prueba (la
tienda deja de recibir pedidos al instante). Quitar el dominio de Vercel la saca de internet; las
variables se pueden dejar.

---

## Un aviso sobre los despliegues de Vercel

El plan de Vercel permite **100 despliegues al día en total**. Con `vim-tienda` hay **una app más**
(seis en vez de cinco): cada cambio a algo que todas comparten (`packages/ui`, `packages/fecha`,
`packages/config`) despliega una más. En un día de mucho movimiento en esos paquetes se gasta más
cupo. Lo que **no** cuesta cupo: cambios solo en `supabase/migrations`, `sitio-web` y `docs`
(están dentro del workspace sin que ninguna app dependa de ellos; ver `pnpm-workspace.yaml`).
Si algún día se llega al límite, los despliegues quedan en espera hasta el día siguiente; no se
pierde nada.

## Qué pasa después

- La entrega 7 activará el complemento en el panel de VIM y lo concederá a los planes que lo
  incluyen; hasta entonces cada negocio nuevo se concede a mano.
- El aviso de privacidad y los términos de la tienda son texto **provisional** (están marcados como
  tal en la página); el texto definitivo también es de la entrega 7.
- Soporte: [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md) explica qué ve el cajero y qué
  responder cuando un cliente dice «mi tienda no me manda pedidos».
