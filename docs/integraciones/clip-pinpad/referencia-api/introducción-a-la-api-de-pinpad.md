<!-- fuente: https://developer.clip.mx/reference/introducción-a-la-api-de-pinpad · capturado 2026-10-08 -->

---
updatedAt: 2026-07-15T22:14:02.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Introducción a la Api de PinPad

El Api de PinPad Clip ofrece dos soluciones robustas para integrar un procesamiento de pagos fluido en tus aplicaciones. Ya sea que estés desarrollando una aplicación nativa para Android o trabajando con una aplicación del lado del servidor, el Api de PinPad de Clip proporciona las herramientas necesarias para gestionar las transacciones de manera eficiente.

Nuestro Api de PinPad Clip está diseñado para simplificar el proceso de integración, garantizando experiencias de pago seguras y fiables para tus clientes.

## Requerimientos mínimos

Antes de integrar la **API PinPad**, asegúrate de cumplir con los siguientes requisitos:

* Contar con una **Cuenta de Clip** activa para acceder y administrar los servicios necesarios.
* Generar tus credenciales de autenticación. Si aún no cuentas con ellas, consulta la guía de [Token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion#2-crea-un-token-de-autenticaci%C3%B3n-con-codificaci%C3%B3n-base64).
* Contar con un backend capaz de comunicarse con los endpoints de la API de Clip para iniciar, consultar y administrar transacciones.
* Tener instalada previamente la aplicación **Clip PinPad (APK)** en el dispositivo donde se ejecutará la integración.
* Completar el proceso de **Verificación de Identidad (KYC)**. Si aún no lo has realizado, consulta la guía de [Verificación de identidad](https://developer.clip.mx/reference/kyc).
* La **Api de PinPad** y **APK** son **compatibles** exclusivamente con los **Lectores: [Total 3](https://shop.clip.mx/products/clip-total?utm_ad_id=\&utm_adgroup_id=\&utm_campaign_id=23532371458\&utm_gclid=CjwKCAiAqKbMBhBmEiwAZ3UboNZGmg3-9VN0pER-I3spP9gNC_rqN9po8L-oCR1AmZpuCGzUcOUc7BoCgI8QAvD_BwE\&adtype=pmax\&utm_source=Google\&utm_medium=cpc\&utm_campaign=conv_mx_clip-total-3_aon_pmax_2026_02_mult_google_cross-network_cpa\&gad_source=1\&gad_campaignid=23532401887\&gbraid=0AAAAADHOJbJ_BpJ-AwC-f55_eOA3-KIJZ\&gclid=CjwKCAiAqKbMBhBmEiwAZ3UboNZGmg3-9VN0pER-I3spP9gNC_rqN9po8L-oCR1AmZpuCGzUcOUc7BoCgI8QAvD_BwE), [Ultra](https://shop.clip.mx/products/clip-ultra?utm_medium=cpa\&utm_source=Google\&utm_campaign=conv_mx_clip-ultra_aon_brand-terms-|-clip-ultra_google_google-search_cpa\&utm_source_platform=Google%20Search\&utm_ID=104201301403\&utm_ad_id=768430425767\&utm_adgroup_id=186671067834\&utm_campaign_id=22876367264\&utm_gclid=CjwKCAjwisnGBhAXEiwA0zEORzVn_H6pGm6h-1GNPQoe8M8qFnp_IeY3TRD3lrPFcl90382eo2-PhxoCTDkQAvD_BwE\&gad_source=1), [Clip PinPad](https://www.clip.mx/clip-para-empresas/pin-pad?srsltid=AfmBOoo2sxCJYMCpkNFz_x560Kai4yKkI8Vzh3Wuk2G9wXf_0neLr2ej), [Clip Stand 2](https://shop.clip.mx/products/clip-stand)**

<Image src="https://files.readme.io/686e1007576e8e8d2e0620cfc9c8ac21a89f64f2d6924ce324c407658639456b-Captura_de_pantalla_2026-02-10_a_las_10.56.17_a.m..png" align="center" />

<Callout icon="🚧" theme="warn">
  ### Importante

  Para instalar el aplicativo de PinPad en tu Lector Clip, envía un correo electrónico a [sdk@payclip.com](mailto:sdk@payclip.com) más el número de serie de tu lector
</Callout>

<br />

El siguiente diagrama muestra cómo funciona la API de PinPad al integrarla a tu backend:

<Image src="https://files.readme.io/9e304da95dcc0063a92199fd21d35d5bbe3e666302aa66a5a61e50c5c750c26f-Captura_de_pantalla_2025-09-23_a_las_4.08.05_p.m..png" align="center" />

## Métodos HTTP y URLs

Para hacer llamadas a la API de PinPad, debes utilizar los siguientes endpoints:

* [API de Pago](https://developer.clip.mx/reference/post_payment): Crea un nuevo pago
* **API de Eliminar Pago:** Método que elimina una solicitud de pago, ya sea por [ID](https://developer.clip.mx/reference/delete_payment-pinpad-request-id) o por [Número de Serie](https://developer.clip.mx/reference/delete_payment-serial-number-serial-number-id) de tu Lector Clip
* [API de Obtener Información de Intento de Pago](https://developer.clip.mx/reference/get_payment-1): Obtiene el detalle de una solicitud de pago en específico.

<Callout icon="🚧" theme="warn">
  ### Importante

  La API PinPad opera únicamente en el ambiente de **Producción**. Para realizar pruebas es necesario contar con un dispositivo compatible y credenciales válidas.
</Callout>

<Callout icon="📘" theme="info">
  ### ¿Necesitas Ayuda?

  Si lo que buscas no está documentado, contáctanos por el siguiente medio:

  - Envía un correo electrónico a la dirección [sdk@payclip.com](mailto:sdk@payclip.com).
</Callout>

<br />