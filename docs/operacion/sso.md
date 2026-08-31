# Runbook · SSO Google / Microsoft (Fase 4)

> El código ya está: botones "Continuar con Google/Microsoft" en el login del admin,
> vinculación automática de identidad por correo verificado, y guard "tu correo no tiene
> acceso" para correos sin invitación. Lo ÚNICO que falta es crear las credenciales OAuth
> en las consolas de Google/Microsoft (no se pueden crear por API) y pegarlas en Supabase.

## Cómo funciona (para que sepas qué esperar)
- Un usuario **ya invitado** (su correo existe en el tenant) entra con Google/Microsoft y
  Supabase **vincula la identidad automáticamente** (mismo correo verificado) → entra a su panel.
- Un correo **no invitado** entra pero sin tenant → ve la pantalla "Tu correo no tiene acceso
  todavía" con opciones de pedir invitación o crear su negocio.

## Google (≈10 min)
1. https://console.cloud.google.com → crea/elige un proyecto ("VIM POS").
2. **APIs & Services → OAuth consent screen**: tipo External, nombre "VIM POS",
   dominios autorizados: `vimpos.com.mx` y `supabase.co`. Publica la app.
3. **Credentials → Create credentials → OAuth client ID** → Web application:
   - Authorized redirect URI: `https://pbiaxzvmssjsxdwqrumb.supabase.co/auth/v1/callback`
4. Copia **Client ID** y **Client secret**.
5. Supabase Dashboard → Authentication → Providers → **Google** → Enable, pega ID y secret. Save.

## Microsoft (Azure) (≈10 min)
1. https://portal.azure.com → Microsoft Entra ID → **App registrations → New registration**:
   - Nombre "VIM POS" · cuentas: *Accounts in any organizational directory and personal Microsoft accounts*.
   - Redirect URI (Web): `https://pbiaxzvmssjsxdwqrumb.supabase.co/auth/v1/callback`
2. **Certificates & secrets → New client secret** → copia el VALUE (no el ID).
3. Copia el **Application (client) ID** del Overview.
4. Supabase Dashboard → Authentication → Providers → **Azure** → Enable, pega ID y secret,
   Azure tenant: `common`. Save.

## Verificación (2 min)
1. `admin.vimpos.com.mx` → "Continuar con Google" con TU correo de dueño → debes entrar
   directo a tu dashboard (identidad vinculada).
2. Con un correo NO invitado → debes ver "Tu correo no tiene acceso todavía".

## Nota
Los redirects ya están permitidos en la allowlist de auth (admin.vimpos.com.mx/**). No hay
cambios de código pendientes para SSO.
