# Registro público: captcha, correo de confirmación y aviso a VIM

> Desde 0142 (ADR 0022) cualquiera se registra desde el sitio en `admin.vimpos.com.mx/registro`:
> datos de contacto obligatorios, términos aceptados, captcha y correo confirmado antes de entrar.
> Esto es lo que hay que configurar **fuera del código** para que funcione en producción.

## 1. Cloudflare Turnstile (el captcha)

1. Entra a <https://dash.cloudflare.com> → **Turnstile** → **Add widget** (la cuenta gratis basta).
2. Nombre: `VIM POS registro`. **Hostnames:** `admin.vimpos.com.mx` y `localhost`.
3. Modo: **Managed**. Pre-clearance: **No**.
4. Cloudflare te da dos llaves:
   - **Site key** (pública) → Vercel, proyecto **admin** → Settings → Environment Variables →
     `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production y Preview). Se aplica en el **siguiente**
     despliegue del admin.
   - **Secret key** → solo en Supabase:
     `supabase secrets set TURNSTILE_SECRET_KEY=<la secret key>`
     (va en su propio comando; no se pega en chats ni commits).

**Orden:** primero la site key en Vercel y el despliegue del admin; después el secreto en
Supabase. Al revés, durante unos minutos el formulario no manda token y la función (que ya lo
exige) rechaza todos los registros con `CAPTCHA_INVALIDO`.

**Sin las llaves todo sigue funcionando:** el formulario no pinta captcha y la función no verifica
(deja un aviso en su log). Así es en local.

La CSP del admin ya permite `https://challenges.cloudflare.com` en `script-src` y `frame-src`
(`apps/admin/next.config.mjs`).

## 2. El correo de confirmación (Supabase Auth)

La cuenta se crea **sin confirmar** y GoTrue manda el enlace por el SMTP del proyecto (el de
Hostinger, el mismo de las invitaciones). Hasta abrirlo, iniciar sesión responde "Email not
confirmed" y el admin ofrece reenviarlo.

En **Supabase → Authentication**:

- **URL Configuration → Redirect URLs:** que incluya `https://admin.vimpos.com.mx/cuenta-confirmada`
  (o `https://admin.vimpos.com.mx/**`). Si no está, el enlace cae en la *Site URL* y el dueño no
  entra solo.
- **Email Templates → Confirm signup:** hoy es la plantilla de fábrica, en inglés. Ponerla en
  español con la marca, como ya están *Invite* y *Reset password*. Asunto sugerido:
  `Confirma tu correo para entrar a VIM POS`. El enlace es `{{ .ConfirmationURL }}`.
- No hace falta encender "Confirm email": las cuentas del registro se crean sin confirmar desde la
  función, y GoTrue no deja entrar a una cuenta sin confirmar con esa opción encendida o apagada
  (probado en local el 30 sep 2026).

## 3. El aviso a VIM de cada alta

Sale por el mismo SMTP que el formulario de demo (`VIM_SMTP_*`, `VIM_AVISOS_A`; ver
`sitio-web.md` §0.4). Lleva negocio, código, giro, dueño, teléfono, correo, ciudad y el enlace a la
ficha (`PLATFORM_APP_URL`, por defecto `https://platform.vimpos.com.mx`). Si falla, el alta sigue:
se ve en el log de `signup-tenant`.

## 4. Límites

Por hora: 10 intentos de alta por IP y 60 en total; reenvíos, 5 por IP, 3 por correo y 100 en
total. Si la base no responde, la función contesta 503 (no abre la puerta).
