# Registro público: captcha, correo de confirmación y aviso a VIM

> Desde 0142 (ADR 0022) cualquiera se registra desde el sitio en `admin.vimpos.com.mx/registro`:
> datos de contacto obligatorios, términos aceptados, captcha y correo confirmado antes de entrar.
> Esto es lo que hay que configurar **fuera del código** y el orden en que se despliega.

## 1. Orden de despliegue (exacto)

1. **Migración 0142** en producción (antes de mezclar; ver `reference_migraciones_antes_del_merge`).
2. **Vercel: admin** (y **platform**, **pos**) desplegados **y verificados**: `/registro` pinta el
   captcha y tiene WhatsApp, ciudad y la casilla de términos; `/cuenta-confirmada` existe.
3. **`supabase functions deploy signup-tenant`** (y, opcional, `solicitar-demo`: solo cambió por
   dentro). `config.toml` ya trae `verify_jwt = false` para las dos.
4. **Secretos:** `TURNSTILE_SECRET_KEY` ya está puesto (Fermín, 30 sep). `TURNSTILE_HOSTNAMES` no
   hace falta en producción (por defecto `admin.vimpos.com.mx`). **Nunca** `CAPTCHA_OPCIONAL`.
5. **Supabase Auth** (sección 3).
6. **Sitio** al final: es lo que manda gente a `/registro`.

### Qué se rompe en cada orden equivocado

| Si… | Pasa |
|---|---|
| función o admin antes que la migración | `alta_autoservicio` no existe: todo registro da `PROVISION_FALLO` (la cuenta se borra en el rollback). El admin y la caja no ven soporte (RPC inexistente → número de fábrica, sin romper). |
| función nueva con admin viejo | el admin viejo no manda `acepta_terminos` ni WhatsApp/ciudad ni captcha: **todos** los registros fallan (`TERMINOS_REQUERIDOS`). |
| admin nuevo con función vieja | la función vieja ignora términos y captcha y crea la cuenta **ya confirmada**: el admin dice "revisa tu correo" pero no sale ninguno (el dueño puede entrar con su contraseña). Funciona, pero sin las protecciones. |
| función nueva sin `TURNSTILE_SECRET_KEY` | 503 `CAPTCHA_NO_CONFIGURADO`: registro cerrado (fail-closed, a propósito). |
| Auth sin la Redirect URL | el enlace del correo cae en la Site URL: el correo sí queda confirmado, pero el dueño no entra solo; tiene que iniciar sesión. |
| sitio antes que todo lo anterior | el botón "Pruébalo 30 días gratis" lleva a un registro roto o sin protecciones. |

## 2. Cloudflare Turnstile (el captcha)

Ya creado (30 sep 2026): widget con hostnames `admin.vimpos.com.mx` y `localhost`, modo Managed.

- **Site key** (pública): Vercel → proyecto **admin** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Se aplica
  en el siguiente despliegue del admin. Local: `apps/admin/.env.local`.
- **Secret key**: solo en Supabase, `supabase secrets set TURNSTILE_SECRET_KEY=<secret>` (en su
  propio comando; no se pega en chats ni commits).
- La función comprueba además que el token sea de un **dominio permitido** (`TURNSTILE_HOSTNAMES`)
  y de la **acción** correcta: el widget del registro declara `registro`, el del reenvío `reenvio`.
- La CSP del admin permite `https://challenges.cloudflare.com` solo en `script-src` y `frame-src`.

**Local:** `supabase/functions/.env` (no se versiona) lleva `CAPTCHA_OPCIONAL=1` y
`TURNSTILE_HOSTNAMES=admin.vimpos.com.mx,localhost`. Con la site key real en `.env.local`, el
widget funciona en `localhost`; si además pones la secret key en ese `.env`, se verifica de verdad.

## 3. Supabase Auth — revisar en el dashboard

- **Providers → Email → Confirm email: ON.** Las cuentas del registro ya nacen sin confirmar desde
  la función; con esto encendido, ninguna otra vía (p. ej. un `signUp` directo con la anon key)
  crea cuentas que entren sin confirmar.
- **URL Configuration → Redirect URLs:** `https://admin.vimpos.com.mx/cuenta-confirmada` (o
  `https://admin.vimpos.com.mx/**`).
- **Email Templates → Confirm signup**, en español:
  - Asunto: `Confirma tu correo para entrar a VIM POS`
  - Cuerpo:
    ```html
    <h2>¡Bienvenido a VIM POS!</h2>
    <p>Para terminar de crear tu cuenta, confirma tu correo:</p>
    <p><a href="{{ .ConfirmationURL }}">Confirmar mi correo y entrar</a></p>
    <p>Tu prueba gratis de 30 días ya empezó. Al entrar te guiamos para dejar lista tu caja.</p>
    <p>Si tú no te registraste, ignora este correo.</p>
    <p>— El equipo de VIM POS</p>
    ```
- **Rate Limits → Rate limit for sending emails:** subirlo a **100 por hora** (con SMTP propio
  Supabase deja ~30). Comparte cupo con invitaciones y recuperaciones de contraseña.

## 4. El aviso a VIM de cada alta

Sale por el mismo SMTP que el formulario de demo (`VIM_SMTP_*`, `VIM_AVISOS_A`; ver
`sitio-web.md` §0.4). Lleva negocio, código, giro, dueño, teléfono, correo, ciudad y el enlace a la
ficha (`PLATFORM_APP_URL`, por defecto `https://platform.vimpos.com.mx`). Si falla, el alta sigue:
se ve en el log de `signup-tenant`.

## 4 bis. El correo de bienvenida al dueño (0146)

Con la cuenta confirmada sale **un** correo al dueño: primeros pasos, descarga de la caja, equipo
que hace falta, cómo se paga y el WhatsApp de soporte. Lo manda la Edge Function
**`correo-bienvenida`**, que el admin llama desde `/cuenta-confirmada` (registro público) y desde
`/establecer-acceso` (invitación de VIM).

- **Desplegar:** migración 0146 antes; después `supabase functions deploy correo-bienvenida`. Va
  **con** JWT (no lleva `verify_jwt = false` en `config.toml`): la llama un dueño con sesión.
- **Secretos:** los mismos `VIM_SMTP_*` y `ADMIN_APP_URL` que ya existen. Sin `VIM_SMTP_*` no sale
  nada (y la marca se libera, así que saldrá el día que estén).
- **Una vez por negocio:** la marca es `tenant_onboarding_estado.bienvenida_enviada_at`. Para
  **volver a mandarla** a un cliente: ponerla en `NULL` y pedirle que abra otra vez el enlace de su
  correo o inicie sesión por `/establecer-acceso`.
- **A quién no:** negocios con más de 30 días, internos, suspendidos o cancelados (así quien
  restablece su contraseña meses después no recibe una "bienvenida").
- **El horario y el WhatsApp** salen de `plataforma_soporte` (/platform → Pagos y soporte). El
  horario admite hasta 80 caracteres: conviene capturarlo completo, p. ej.
  `lunes a viernes de 9:00 a 18:00; sábado y domingo de 9:00 a 14:00`.
- **Si falla** no se entera el dueño: queda en el log de la función
  (`bienvenida de <tenant> NO enviada (…)`).
- Admin viejo con función nueva, o al revés: no pasa nada. El admin viejo no la llama; el admin
  nuevo sin función recibe un 404 que ignora.

## 5. Límites

Por hora: 10 intentos de alta por IP y 60 en total. Reenvíos: **uno por correo por minuto** (a
todo correo, exista o no la cuenta), 5 por IP, 3 por correo y 100 en total. El botón del admin
espera 60 s tras cada envío. Si la base no responde, la función contesta 503.

## 6. Riesgo aceptado: el registro dice si un correo ya tiene cuenta

`signup-tenant` contesta `EMAIL_YA_REGISTRADO` (409) para poder decirle al dueño "inicia sesión"
en vez de un error opaco. Eso permite averiguar si un correo está registrado. Se acepta porque
cada intento cuesta un captcha resuelto y cuenta contra el límite por IP y el global (10 y 60 por
hora), lo que hace inviable sondear en volumen. El **reenvío** sí contesta igual exista o no la
cuenta. Si algún día se ve sondeo en los logs, la salida es contestar siempre "revisa tu correo" y
mandar al correo existente un aviso de "ya tienes cuenta".

## 7. Cuenta confirmada sin negocio

Si el alta del negocio falla, la función borra la cuenta recién creada; si ese borrado también
falla, queda en el log (`rollback: no se pudo borrar la cuenta …`). Si esa persona confirma su
correo, el admin le muestra "Tu cuenta no terminó de crearse" con el WhatsApp de soporte en vez de
romperse. Se resuelve borrando la cuenta en Auth para que se registre de nuevo, o dándole de alta
desde /platform.
