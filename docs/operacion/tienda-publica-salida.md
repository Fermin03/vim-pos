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

Cloudflare (1) → Supabase (2) → Vercel: proyecto, variables y dominio (3, 4, 5) → prueba (6, 7 y 8).

El orden importa en un punto: **los pasos 1 y 2 van antes de que el dominio exista** (5). Si la
tienda sale antes, el primer cliente que intente pedir recibe «No pudimos comprobar que eres una
persona.»

---

## Antes de empezar: lo que ya debería estar

| Qué | Cómo comprobarlo |
|---|---|
| La migración **0165** aplicada en producción | **[Tú o Claude]** «comprueba que la 0165 está aplicada». Sin ella el menú no se puede leer y la tienda dice «No pudimos cargar el menú». Se aplica a mano y **antes** de mezclar la rama, como todas. |
| La migración **0166** (cuentas de clientes) aplicada en producción | **[Tú o Claude]** «comprueba que la 0166 está aplicada». Sin ella la tienda se ve y se puede pedir como invitado, pero entrar y crear cuenta dan un error aunque los datos estén bien. Antes de aplicarla, las cuatro tablas de cuentas (`tienda_cuentas`, `tienda_sesiones`, `tienda_recuperaciones`, `tienda_direcciones`) deben estar **vacías**: si no, la migración falla. Lo están mientras nadie haya escrito en ellas a mano. |
| La función `tienda` **redesplegada** con el código de la rama de cuentas, y con su clave `VIM_TIENDA_SECRET` | **[Tú o Claude]** «redespliega la función `tienda`». Hace falta aunque ya estuviera desplegada: la entrega 5 le cambió el cupo del seguimiento y la 6 le añadió todas las acciones de cuenta (una función vieja no conoce «entrar» ni «registrar» y las rechaza). Va **después** de aplicar la 0166. Para comprobar que contesta: una petición **POST** sin clave debe responder **401** (no 404). Ojo: con GET responde 405 tenga o no clave, así que un GET no prueba nada. |
| Los secretos del correo en Supabase: `VIM_SMTP_HOST`, `VIM_SMTP_USER`, `VIM_SMTP_PASS` (y `VIM_SMTP_PORT` si no es 465) | **[Tú o Claude]** «lista los secretos de Supabase». Ya los usa el registro de negocios. Con cuentas dejan de ser opcionales: **sin ellos nadie puede recuperar su contraseña** (ver paso 2). |
| `TURNSTILE_SECRET_KEY` puesta en Supabase (se puso el 30 sep 2026 para el registro) | **[Tú o Claude]** «lista los secretos de Supabase» (solo muestra los nombres). |
| La llave pública del captcha (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | Está en Vercel, proyecto **admin**, variables de entorno. Se copia tal cual. |

---

## Paso 1 — Cloudflare Turnstile: añadir el dominio nuevo · **[Tú]**

El captcha de la tienda es **el mismo widget** que el del registro del admin (la función solo conoce
una pareja de llaves). Hay que decirle que ahora también vale en `pedidos.vimpos.com.mx`.

1. Entra a Cloudflare → **Turnstile** → el widget que ya existe (el del registro de VIM POS).
2. En **Hostnames** deja los que tiene (`admin.vimpos.com.mx`, `localhost`) y **añade**
   `pedidos.vimpos.com.mx`. Guarda.

Ese mismo widget cubre las tres cosas que la tienda protege: pedir (`tienda_pedido`), crear cuenta
(`tienda_registro`) y pedir el enlace para recuperar la contraseña (`tienda_recuperar`). Esos
nombres los manda la tienda sola; **en Cloudflare no hay que dar de alta nada por cada uno**. Entrar
con correo y contraseña no lleva captcha.

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
- **`VIM_TIENDA_URL=https://pedidos.vimpos.com.mx`** — **obligatoria desde que hay cuentas.** Es la
  base de los enlaces de los correos: el de confirmación del pedido y, sobre todo, el de
  **recuperar la contraseña**. Sin barra al final. También hacen falta los `VIM_SMTP_*` (ya los usa
  el registro de negocios).

  > **Ojo:** si falta `VIM_TIENDA_URL` o falta el correo, **la tienda no avisa**. Pedir funciona, y
  > quien pide recuperar su contraseña ve «Revisa tu correo» como siempre, pero el correo no sale
  > nunca. Tampoco salen la bienvenida ni el aviso «ya tienes una cuenta». En los registros de la
  > función queda una línea: `sin correo de recuperación (falta VIM_TIENDA_URL o VIM_SMTP_*)`. Por
  > eso el paso 8 pide recuperar la contraseña con un correo de verdad.

**Cómo comprobarlo:** la lista de secretos muestra `TURNSTILE_HOSTNAMES`, `VIM_TIENDA_URL` y los
`VIM_SMTP_*`, y no muestra `CAPTCHA_OPCIONAL`. Y el registro sigue funcionando: abre `admin.vimpos.com.mx/registro` y
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

En el proyecto `vim-tienda` → **Settings → Environment Variables**. Marca **solo Production**.

- **Preview no:** con Preview marcado, cualquier rama que Vercel despliegue tendría la clave real de
  la tienda. Si un día hace falta probar una rama, se le pone la variable a esa rama y se quita.
- **Development no:** Vercel no deja guardar una variable «Sensitive» en Development, y en tu
  máquina la tienda lee sus variables de `apps/tienda/.env.local`, no de Vercel.

| Nombre | Valor | Notas |
|---|---|---|
| `VIM_TIENDA_SECRET` | el contenido de `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt` | **Márcala como «Sensitive»** (por eso solo puede ir en Production y Preview). Es la misma que ya tiene Supabase; si no coinciden, toda la tienda dice «No pudimos cargar la tienda». Es solo de servidor: sin `NEXT_PUBLIC_`. |
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

**Cómo comprobarlo:** abrir `https://pedidos.vimpos.com.mx/` carga una página sencilla que dice
«Pedidos en línea» (la raíz no es una tienda: no hay nada más que ver ahí, y está bien). Una
dirección que no existe, por ejemplo `https://pedidos.vimpos.com.mx/nadie-existe`, dice «No
encontramos esta página».

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
     Una caja 0.7.0 con turno abierto **no basta**: la tienda seguiría diciendo «Aún no abrimos.»
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
   número y el estado «En proceso». Si dice «No pudimos comprobar que eres una persona.», revisa
   los pasos 1 y 2.
5. En la caja (o el POS web): en **Pedidos en línea** debe sonar y aparecer el pedido. Acéptalo.
   **Debe:** la pantalla del pedido en tu teléfono pasar a «En preparación» en unos segundos (se
   actualiza sola, cada 10 segundos).
6. Imprime la cuenta o cóbrala. **Debe:** el pedido avanzar a «Listo para recoger» y luego a
   «Entregado». (En un pedido a domicilio, en lugar de «Listo para recoger» dice «En camino».)
7. Revisa tu correo: debe llegar la confirmación del pedido (si pusiste `VIM_TIENDA_URL` y los
   `VIM_SMTP_*`).
8. Cierra el turno en la caja y espera un minuto con la tienda abierta (se actualiza sola; también
   puedes recargar). **Debe:** decir «Aún no abrimos. Vuelve a intentar en unos minutos.» y no
   dejar pedir: en el carrito ese aviso ocupa el lugar del botón «Continuar».
9. Repite con **a domicilio** si el negocio lo tiene activo.

## Paso 8 — Prueba de humo de las cuentas · **[Tú]** (Claude puede mirar los registros)

En el mismo negocio de prueba, desde tu teléfono, **con un correo tuyo de verdad** (vas a tener que
abrirlo). Marca cada punto:

1. **Crear cuenta.** En la tienda toca «Entrar» → «Crear cuenta». Llena nombre, apellido, correo,
   teléfono y una contraseña de 8 caracteres o más. **Debe:** resolverse el captcha, entrar de una
   vez (arriba ya no dice «Entrar» sino «Mi cuenta») y llegarte un correo «Tu cuenta esta lista»
   que saluda con «Hola.» **sin tu nombre** (es a propósito). Los asuntos de estos correos van sin
   acentos, también a propósito.
2. **Salir.** En «Mi cuenta» → «Cerrar sesión». **Debe:** volver a decir «Entrar».
3. **Entrar con la contraseña mal** una vez. **Debe:** decir «El correo o la contraseña no
   coinciden.», sin aclarar cuál. No lo repitas cinco veces: a la quinta la cuenta se bloquea 15
   minutos (se desbloquea sola, o con el punto 5).
4. **Entrar bien.** **Debe:** llevarte a donde ibas, con «Mi cuenta» arriba.
5. **Recuperar la contraseña, con el correo real.** Sal, toca «Entrar» → «¿Olvidaste tu
   contraseña?», escribe tu correo. **Debe:** decir «Revisa tu correo» y llegarte «Restablece tu
   contrasena» con un botón. Ábrelo: la dirección termina en `/recuperar#t=…` y, al cargar, el
   `#t=…` desaparece de la barra. Elige una contraseña nueva. **Debe:** entrar a «Mi cuenta». Abre
   el mismo enlace otra vez: **debe** decir «Este enlace ya no sirve».
   **Si el correo no llega en un par de minutos**, revisa el no deseado y luego el paso 2
   (`VIM_TIENDA_URL` y `VIM_SMTP_*`): la pantalla dice «Revisa tu correo» aunque no haya salido.
6. **Pedir con la sesión abierta.** Arma un pedido: **debe** traer ya tu nombre, teléfono y correo.
   Envíalo y atiéndelo en la caja como en el paso 7. Luego, en «Mi cuenta» → **debe** aparecer ese
   pedido, con «Pedir de nuevo».
7. **Guardar una dirección** en «Mi cuenta» y comprobar que al pedir a domicilio se puede elegir.
8. **Crear cuenta otra vez con el mismo correo.** **Debe:** decir «Revisa tu correo para
   continuar» (no «ya existe») y llegarte «Ya tienes una cuenta». Esto es lo esperado.
9. **Eliminar la cuenta.** «Mi cuenta» → «Eliminar mi cuenta», con tu contraseña. **Debe:** sacarte
   de la sesión, y entrar con ese correo ya no funciona. El pedido del punto 6 sigue en la caja.

Si quieres ver el tope de intentos: pide el enlace de recuperación cuatro veces seguidas para el
mismo correo. La cuarta **debe** decir «Demasiados intentos. Espera unos minutos y vuelve a
intentar.» (son 3 por hora por correo, y 3 por hora desde una misma red). Crear cuenta tiene el
mismo tope por correo y 5 por hora desde una misma red.

**Si algo falla:**

| Se ve | Probable causa |
|---|---|
| Todas las direcciones dicen «No pudimos cargar la tienda» | `VIM_TIENDA_SECRET` distinta en Vercel y en Supabase, o falta en Vercel. |
| «No pudimos cargar el menú» (el nombre del negocio sí sale) | Falta aplicar la migración 0165. |
| «No encontramos esta página» en una dirección que sí existe | La tienda está apagada, el negocio no tiene el complemento, o la dirección está mal escrita. |
| «Esta tienda no está disponible por ahora» | Ninguna sucursal del negocio participa en la tienda. |
| «Aún no abrimos.» con la caja abierta | Caja 0.7.0 (ver paso 6), o la caja no tiene internet. |
| «Cerrado ahora. Abre hoy a las…» | La hora de la prueba está fuera del horario que se le puso a la sucursal. |
| «No estamos tomando pedidos en este momento.» | La tienda está en pausa desde la caja. |
| Captcha que no aparece | Falta `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en Vercel o el dominio no está en Cloudflare (paso 1). Hace falta redesplegar tras cambiar una variable. |
| «No pudimos comprobar que eres una persona.» al enviar | `TURNSTILE_HOSTNAMES` sin `pedidos.vimpos.com.mx` (paso 2). |
| Las fotos no cargan | `NEXT_PUBLIC_SUPABASE_URL` distinta de la del proyecto real. |
| Entrar o crear cuenta dan un error aunque los datos estén bien | Falta aplicar la migración 0166, o la función `tienda` no se redesplegó después. |
| «Revisa tu correo» pero el correo nunca llega (recuperar, bienvenida) | Falta `VIM_TIENDA_URL` o algún `VIM_SMTP_*` en Supabase (paso 2). La pantalla no lo distingue; los registros de la función, sí. |
| El botón del correo de recuperar abre una dirección que no es la tienda | `VIM_TIENDA_URL` mal escrita (otro dominio, o con una ruta de más). |
| Entras y parece que no pasó nada (sigue diciendo «Entrar») | Estás probando por `http://` o por la dirección de la red local: la cookie de sesión solo se guarda con `https://` (o en `localhost`). En el dominio propio no pasa. |
| «Demasiados intentos» al crear cuenta o recuperar | Tope de 3 por hora por correo, o el de la red. Espera, o prueba con otro correo. |

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
- Las decisiones de fondo de las cuentas, y lo que se aceptó a sabiendas (por ejemplo, que crear
  cuenta deja deducir si un correo ya es cliente, y que `entrar` gasta CPU de la base de las cajas:
  conviene mirar la carga los primeros días), están en
  [`decisiones/0032`](../decisiones/0032-la-tienda-es-un-canal-y-sus-clientes-no-viven-en-auth.md).
- El aviso de privacidad de la tienda es texto **provisional** (está marcado como tal en la
  página); el texto definitivo también es de la entrega 7. La tienda no tiene página de términos.
- Soporte: [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md) explica qué ve el cajero y qué
  responder cuando un cliente dice «mi tienda no me manda pedidos».
