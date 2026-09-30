# 0022 — El registro es público y verificado, y el soporte viaja a la caja por el latido

**Fecha:** 30/09/2026 · **Estado:** vigente

## Qué decía el plan

El registro (`signup-tenant`, F12) era una puerta trasera sin enlazar: creaba la cuenta ya
confirmada y el dueño entraba directo, sin términos, sin captcha y con teléfono opcional. El
soporte era un teléfono fijo escrito en la pantalla de bloqueo de la caja.

## Qué hacemos ahora

1. **Registro público** desde el sitio ("Pruébalo 30 días gratis"). Obligatorios: nombre, WhatsApp
   (10 dígitos), correo, ciudad y **aceptar términos y aviso de privacidad**. Captcha Cloudflare
   Turnstile. La cuenta se crea **sin confirmar**; el negocio sí nace en TRIAL (la prueba cuenta
   desde el registro) y VIM recibe un correo con cada alta.
2. **La aceptación vive en `tenant_onboarding_estado`** (`terminos_version`,
   `terminos_aceptados_at`, `terminos_aceptados_por`, y `ciudad_registro`), escrita por
   `alta_autoservicio()` en la MISMA transacción que el alta. La versión es una constante de la
   función (`TERMINOS_VERSION`).
3. **Soporte = una fila en `plataforma_soporte`** (WhatsApp, horario, correo), editable solo desde
   /platform. Se lee con cualquier sesión de un negocio por `soporte_plataforma()` y **viaja en las
   directivas** (`resolver_directivas` → `soporte`); el escritorio lo guarda en `directivas.json`.
   Respaldo compilado: `WHATSAPP_SOPORTE_VIM` en `@vim/db/soporte`.

## Por qué

- **Onboarding y no `tenants`:** `tenants` viaja entero a cada caja por el pull; no hay por qué
  mandar a todas las cajas una constancia legal ni el dato de contacto. El onboarding ya es "cómo
  llegó este cliente", solo lo lee su dueño (RLS de solo lectura) y no se sincroniza. No se puso en
  `usuarios_perfil` porque la aceptación es del NEGOCIO (el contrato es con él), aunque la haga una
  persona: por eso se guarda también quién.
- **Una transacción:** si la aceptación se escribiera después del alta, un fallo a la mitad dejaría
  un negocio del registro público sin constancia. La función SQL además rechaza el alta sin versión.
- **Soporte por el latido y no por una consulta:** la caja tiene que mostrar el número justo cuando
  peor está (bloqueada, sin internet). El latido ya trae lo que la caja obedece y el escritorio ya
  lo guarda en disco; una llave más no cuesta una llamada ni un mecanismo nuevo. Se modificó
  `resolver_directivas` (SQL) en vez de `caja-latido` para no redesplegar la función.
- **Correo confirmado por GoTrue** (`resend` tipo `signup`) y no por un correo propio: el SMTP del
  proyecto ya manda las invitaciones, y GoTrue rechaza el inicio de sesión sin confirmar por sí
  mismo, así que no hay un chequeo nuestro que se pueda olvidar.

## Consecuencias

- Hay que configurar fuera del código: llaves de Turnstile, *Redirect URL* de
  `/cuenta-confirmada` y la plantilla *Confirm signup* en español (`operacion/registro-publico.md`).
- Sin `TURNSTILE_SECRET_KEY` el captcha no se verifica (a propósito, para local y la transición).
- Cambiar el texto de los términos obliga a subir `TERMINOS_VERSION`; las aceptaciones viejas
  conservan su versión. Las altas hechas por VIM desde el panel quedan con `terminos_version` NULL.
- Un cambio de número de soporte tarda hasta un latido (~10 min) en llegar a cada caja, y una caja
  apagada sigue con el anterior hasta que vuelva a latir.
- La validación de `signup-tenant` es a mano (no Zod): el código Deno no importa paquetes del
  monorepo y sus pruebas corren en Node. El formulario valida lo mismo con Zod (`@vim/db/registro`).
