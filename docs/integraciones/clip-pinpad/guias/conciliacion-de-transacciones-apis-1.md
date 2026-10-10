<!-- fuente: https://developer.clip.mx/docs/conciliacion-de-transacciones-apis-1 · capturado 2026-10-08 -->

---
updatedAt: 2026-07-15T22:20:44.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Guía de conciliación de transacciones: API Checkout y Punto de Venta

Esta guía te enseñará lo siguiente:

* Identificar el número de recibo en todas las herramientas de Clip (APIs, Panel de Clip, reportes descargables, notificaciones webhook).
* Conciliar las transacciones creadas con la [API de Checkout ](https://developer.clip.mx/reference/introduccion-a-clip-checkout)(pago con tarjeta no presente) usando el número de recibo y los siguientes parámetros:
  * *payment\_request\_id* para transacciones creadas con API de Checkout.
  * *payment\_request\_code* para transacciones creadas con la API Punto de Venta.
* Identificar el estatus de las transacciones con las notificaciones webhook ([Checkout](https://developer.clip.mx/reference/checkout-webhook) y [Postback](https://developer.clip.mx/reference/referencia-postback-webhook)).

## ¿Qué es el número de recibo?

El número de recibo es una cadena de caracteres única (ejemplo: T96suhh) asignada por Clip a cada una de tus transacciones. El número de recibo se crea en las notificaciones webhook (Checkout y Postback) cuando un link de pago (en efectivo o con tarjeta) o un pago con tarjeta presente es completado.

## ¿Dónde puedo consultar el número de recibo?

Puedes consultar el número de recibo a través de los siguientes productos:

* Webhooks: [Checkout](https://developer.clip.mx/reference/checkout-webhook) y [Postback](https://developer.clip.mx/reference/referencia-postback-webhook).
* API de Checkout endpoint **GET** [Consultar el estado de un link de pago](https://developer.clip.mx/reference/createnewpaymentlink).
* [API de Transacciones](https://developer.clip.mx/reference/introduccion-api-de-transacciones).
* App de Clip > Transacciones > Pagado.
* [Panel de Clip](https://dashboard.clip.mx/) > Transacciones.
* Reportes descargables (desde Panel de Clip > Transacciones).
* Correo de confirmación de pago.

## ¿Cómo puedo identificar el número de recibo en las herramientas de Clip?

El número de recibo puede ser identificado en los productos de Clip con los siguientes nombres:

* No. de recibo (email de confirmación).
* No. recibo (Panel de Clip).
* Recibo (reporte descargable).
* eVoucher # (app de Clip).
* receipt\_no (API Checkout, API de Transacciones, API de Reembolsos, Checkout y Postback webhooks).

<Callout icon="📘" theme="info">
El campo **payment_request_code** fue deprecado y ya no debe utilizarse como identificador de un Payment Request.

A partir de esta actualización, el identificador principal es **payment_request_id**, el cual debe utilizarse en todos los flujos de conciliación y consultas relacionados con Payment Requests.
</Callout>

## ¿Qué es el payment\_request\_id y el payment\_request\_code?

El parámetro *payment\_request\_id* es generado en la respuesta a la solicitud de [creación de link de pago](https://developer.clip.mx/reference/createnewpaymentlink) de la API de Checkout y es una cadena de caracteres única de tipo UUID (ejemplo: aeb68a0e-f780-4636-8655-5b11e3f7b8b2) asignada por Clip a cada uno de tus link de pago.

<br />

## ¿Cómo puedo conciliar las transacciones generadas con la API de Checkout y de Transacciones?

Para conciliar tus transacciones generadas con la API de Checkout y de Transacciones deberás utilizar el número de recibo y los parámetros payment\_request\_id y y payment\_request\_code, respectivamente. El proceso específico para cada API se documenta en las siguientes secciones.

### Conciliación de links de pago generados con la API de Checkout (tarjeta no presente)

Para conciliar transacciones generadas con la API de Checkout necesitarás lo siguiente:

* [Configurar el Checkout Webhook](https://developer.clip.mx/reference/checkout-webhook#%C2%BFc%C3%B3mo-configurar-las-notificaciones-del-checkout-webhook).
* Guardar el valor del parámetro payment\_request\_id.
* Guardar el valor del parámetro receipt\_no.

Sigue estos pasos para conciliar las transacciones creadas con la API de Checkout:

1. Configura el Checkout Webhook en la solicitud de la API de Checkout.
2. [Genera un link de pago](https://developer.clip.mx/reference/createnewpaymentlink).
3. Guarda el valor del payment\_request\_id que contiene el objeto JSON de la solicitud crear un link de pago.
4. Utiliza el valor del payment\_request\_id para asociar las notificaciones del Checkout Webhook a su respectivo link de pago.
5. Identifica el estado de tu solicitud de pago con el valor del parámetro *resource\_status*. Los tipos de estado pueden ser: CREATED, CANCELED, EXPIRED, PENDING, COMPLETED.
6. Guarda el valor del parámetro receipt\_no de la notificación webhook cuyo estado sea completado (resource\_status: COMPLETED).
7. Localiza el número de recibo del paso anterior en el correo de confirmación, en el panel de Clip >Transacciones y en tus reportes descargables.

<Image alt="Flujo de conciliación de transacciones creadas con la API de Checkout con el parámetro payment_request_id y el número de recibo. " align="center" src="https://files.readme.io/175d842-Screenshot_2023-09-01_at_8.28.59.png">
  Flujo de conciliación de transacciones creadas con la API de Checkout con el parámetro payment\_request\_id y el número de recibo. 
</Image>

<Image alt="Detalle del flujo de conciliación de transacciones creadas con la API de Checkout mostrado en la imagen anterior. " align="center" src="https://files.readme.io/3e0733b-conciliacionCheckout2.gif">
  Detalle del flujo de conciliación de transacciones creadas con la API de Checkout mostrado en la imagen anterior. 
</Image>

### Conciliación de las transacciones creadas con la API Punto de Venta (tarjeta presente)

Para conciliar transacciones generadas con la API Punto de Venta utilizarás lo siguiente:

* [Configurar el Postback Webhook](https://developer.clip.mx/reference/referencia-postback-webhook#configuraci%C3%B3n-de-las-notificaciones-de-pago-por-postback-webhooks).
* Guardar el valor del parámetro receipt\_no.
* Guardar el valor del parámetro payment\_request\_code.

Sigue estos pasos para conciliar las transacciones creadas con la API de Punto de Venta:

1. Configura el Postback Webhook en el panel de Clip.
2. [Registra una transacción](https://developer.clip.mx/reference/payment-request).
3. Guarda el valor del payment\_request\_code del objeto JSON del registro de transacción.
4. Utiliza el valor del payment\_request\_code dentro del JSON del Postback Webhook para asociar las notificaciones a su respectiva transacción.
5. Identifica el estado de tu solicitud de pago con el valor del parámetro *status\_description*. Los tipos de estado pueden ser: COMPLETED, CANCELLED, DECLINED.
6. Guarda el valor del parámetro receipt\_no de la notificación webhook cuyo estado sea completado (status\_description: COMPLETED).
7. Para conciliar tus transacciones localiza el número de recibo del paso anterior en el correo de confirmación, en el panel de Clip, en tus reportes descargables y en la app de Clip.

<Image alt="Flujo de conciliación de transacciones creadas con la API Punto de Venta con el parámetro payment_request_code y el número de recibo." align="center" src="https://files.readme.io/8f9fab6-Screenshot_2023-09-01_at_8.35.31.png">
  Flujo de conciliación de transacciones creadas con la API 
</Image>

<Image alt="Detalle del flujo de conciliación de transacciones creadas con la API Punto de Venta mostrado en la imagen anterior." align="center" src="https://files.readme.io/2870e68-PDVConciliacion.gif">
  Detalle del flujo de conciliación de transacciones creadas con la API .
</Image>

<br />

> 📘 ¿Necesitas Ayuda?
>
> Consulta las nuestro [centro de soporte a desarrolladores](https://developer.clip.mx/page/soporte-desarrolladores) y el [centro de ayuda Clip.](https://ayuda.clip.mx/hc/es)\
> Si lo que buscas no está documentado, contáctanos por alguno de los siguientes medios:
>
> * Activa el botón de **Ayuda** y llena el formulario. No olvides proporcionar un correo electrónico y tus dudas para que podamos asistirte de manera eficiente.
> * Publica tu pregunta en nuestro [Foro.](https://developer.clip.mx/discuss) Publicar en el foro puede ayudar a otros desarrolladores que están experimentando el mismo problema.
> * Envía un correo electrónico a la dirección <developers@payclip.com.>
>
> O comunícate con nuestra área de Customer Happiness:
>
> * Llámanos al 55 6393-2323, Clip es el único con atención personalizada 24/7 los 365 días del año.
> * Envíanos un mensaje por WhatsApp al 55 6393-2323.
> * Escríbenos al correo <help@clip.mx>