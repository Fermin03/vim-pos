# Cobro de VIM por WhatsApp: lo verificado con Mercado Pago (28 oct 2026)

Aplicación «VIM POS Mensualidades» (Checkout Pro, API de Preferences) en la cuenta de Mercado Pago de VIM.
Webhooks: misma URL en modo de prueba y productivo (`/functions/v1/cobro-vim-webhook`), evento **Pagos (legacy)**.
Secretos: `MP_VIM_ACCESS_TOKEN`, `MP_VIM_WEBHOOK_SECRET` (se cargan con `scripts/cargar-secretos-cobro-vim.ps1`).

Prueba de punta a punta con VIM Pruebas (0288 y `cobro-vim-webhook` en producción, `whatsapp-webhook` sin cambios):

- La preferencia se crea con el cuerpo de `crearPreferencia` y Mercado Pago devuelve `init_point`. Se pagó desde un
  comprador de prueba, en incógnito, con la tarjeta de prueba (titular APRO).
- **Llegan tres tipos de aviso por cada pago:**
  - `?data.id=<pago>&type=payment`, user-agent «MercadoPago WebHook v1.0 payments_via_orders», **firmado** con `x-signature`.
  - `?id=<pago>&topic=payment`, user-agent «Feed», **sin firma** → 401. Es el aviso estilo IPN; se ignora sin perder nada.
  - `?id=<orden>&topic=merchant_order` → 200 sin hacer nada.
- **El modo de prueba firma con SU propia clave secreta**, distinta a la del modo productivo (pestaña «Modo de prueba» en
  Webhooks). Con la clave del otro modo, todo aviso da «firma inválida» (401). Al pasar a producción hay que cargar la
  clave del modo productivo y el Access Token de producción.
- Con la clave correcta, «Simular notificación» con el id del pago real lo aplicó: intento PAGADO, pago TARJETA por
  $1,158.84 con `pagado_el` en hora de México, próxima fecha +1 mes. Como el número de WhatsApp era falso, la
  confirmación falló y quedó el aviso «Pago sin confirmar al cliente» para Fermín, como está diseñado.
- El pago de prueba se anuló con `anular_pago_suscripcion` y se borraron la conversación, el intento y el aviso.

- El checkout solo ofreció tarjeta (sin meses, sin OXXO/SPEI ni Mercado Crédito): no hace falta excluir `digital_currency`.

Pendiente: cargar credenciales de producción; plantilla
`pago_confirmado`.
