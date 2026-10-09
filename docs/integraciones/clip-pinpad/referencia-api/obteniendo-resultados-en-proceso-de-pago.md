<!-- fuente: https://developer.clip.mx/reference/obteniendo-resultados-en-proceso-de-pago · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:35:28.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obteniendo Resultados en Proceso de Pago

Hay dos métodos disponibles para obtener los resultados de pago al utilizar el SDK de pagos de Clip:

## Respuesta de la implementación del cliente

Este canal proporciona los resultados de pago de forma síncrona, lo que significa que la respuesta se recibe inmediatamente después de que se complete la transacción de pago. Así es cómo funciona:

* **Respuesta Sincrónica:** Los resultados de pago se devuelven directamente como parte de la sesión de composición, generalmente en forma de un objeto de respuesta o estructura de datos.
* **Integración en Tiempo Real:** Los comerciantes pueden integrar este método en la lógica de su aplicación para manejar los resultados de pago en tiempo real, permitiendo un procesamiento inmediato y una respuesta al resultado de la transacción.
* **Mismo Contexto de Sesión:** Dado que la respuesta es síncrona, los comerciantes pueden acceder directamente a los resultados de pago dentro del mismo contexto de sesión donde se inició la transacción de pago.
* **Ventajas:** Este método ofrece simplicidad e inmediatez en el acceso a los resultados de pago, lo que lo hace adecuado para escenarios donde se requiere un procesamiento en tiempo real.

```java
clipPayment.Builder().addListener(new PaymentListener() {
    @Override
    public void onSuccess(PaymentResult result) {
        // Handle successful payment result
    }

    @Override
    public void onCancelled() {
        // Handle payment cancelled
    }

    @Override
    public void onFailure(String error) {
        // Handle failed payment result
    }
}).build();
```

La siguiente tabla describe los elementos del objeto de respuesta completo que recibirá tu sistema

<HTMLBlock>{`
<style type="text/css">
  @import url('https://themes.googleusercontent.com/fonts/css?kit=bI_Gc1PWC8t0lAlDZHzCYto0Zrc4dKrZ3w3rWMnBg_xdW0rLHhFSksIhV-jPNnvG');

  ol {
    margin: 0;
    padding: 0
  }

  table td,
  table th {
    padding: 0
  }

  .c21 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: top;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 96pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c20 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: top;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 39pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c13 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 48pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c34 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 97.5pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c12 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 183pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c2 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: top;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 124.5pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c19 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 114pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c1 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 13.4pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c8 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 123pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c29 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: top;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 78pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c6 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 16.5pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c5 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 14.1pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c15 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 16.1pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c9 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 7.4pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c28 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 81pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c24 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: top;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    width: 168pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c3 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 10pt;
    font-family: "Barlow";
    font-style: normal
  }

  .c4 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 9pt;
    font-family: "Courier New";
    font-style: normal
  }

  .c33 {
    color: #666666;
    font-weight: 700;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 12pt;
    font-family: "Proxima Nova";
    font-style: normal
  }

  .c32 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.1500000000000001;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  .c0 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: left;
    height: 11pt
  }

  .c26 {
    color: #000000;
    text-decoration: none;
    vertical-align: baseline;
    font-style: italic
  }

  .c27 {
    margin-left: 0.8pt;
    border-spacing: 0;
    border-collapse: collapse;
    margin-right: auto
  }

  .c40 {
    -webkit-text-decoration-skip: none;
    color: #1155cc;
    text-decoration: underline;
    text-decoration-skip-ink: none
  }

  .c14 {
    color: #000000;
    text-decoration: none;
    vertical-align: baseline;
    font-style: normal
  }

  .c35 {
    margin-left: auto;
    border-spacing: 0;
    border-collapse: collapse;
    margin-right: auto
  }

  .c7 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: left
  }

  .c16 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: center
  }

  .c31 {
    font-weight: 400;
    font-size: 12pt;
    font-family: "Barlow"
  }

  .c10 {
    font-size: 10pt;
    font-family: "Barlow";
    font-weight: 700
  }

  .c23 {
    font-size: 10pt;
    font-family: "Barlow";
    font-weight: 400
  }

  .c17 {
    font-weight: 700;
    font-size: 12pt;
    font-family: "Barlow"
  }

  .c36 {
    font-weight: 400;
    font-size: 11pt;
    font-family: "Arial"
  }

  .c39 {
    max-width: 468pt;
    padding: 72pt 72pt 72pt 72pt
  }

  .c37 {
    color: inherit;
    text-decoration: inherit
  }

  .c11 {
    background-color: #d9d9d9
  }

  .c22 {
    height: 11pt
  }

  .c25 {
    height: 21.8pt
  }

  .c30 {
    height: 22pt
  }

.c18 {
  background-color: transparent !important; /* en lugar de #ffffff */
}
  .c38 {
    font-style: italic
  }

  .title {
    padding-top: 0pt;
    color: #000000;
    font-size: 26pt;
    padding-bottom: 3pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  .subtitle {
    padding-top: 0pt;
    color: #666666;
    font-size: 15pt;
    padding-bottom: 16pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  li {
    color: #000000;
    font-size: 11pt;
    font-family: "Arial"
  }

  p {
    margin: 0;
    color: #000000;
    font-size: 11pt;
    font-family: "Arial"
  }

  h1 {
    padding-top: 20pt;
    color: #000000;
    font-size: 20pt;
    padding-bottom: 6pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  h2 {
    padding-top: 18pt;
    color: #000000;
    font-size: 16pt;
    padding-bottom: 6pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  h3 {
    padding-top: 16pt;
    color: #434343;
    font-size: 14pt;
    padding-bottom: 4pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  h4 {
    padding-top: 14pt;
    color: #666666;
    font-size: 12pt;
    padding-bottom: 4pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  h5 {
    padding-top: 12pt;
    color: #666666;
    font-size: 11pt;
    padding-bottom: 4pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  h6 {
    padding-top: 12pt;
    color: #666666;
    font-size: 11pt;
    padding-bottom: 4pt;
    font-family: "Arial";
    line-height: 1.15;
    page-break-after: avoid;
    font-style: italic;
    orphans: 2;
    widows: 2;
    text-align: left
  }
</style>
<table class="c35">
  <tr class="c30">
    <td class="c19 c11" colspan="8" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Elemento</span>
      </p>
    </td>
    <td class="c11 c12" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Descripci&oacute;n</span>
      </p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Tipo</span>
      </p>
    </td>
    <td class="c8 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Notas</span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">reference</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Referencia generada por el SDK
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String
</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">status</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Estatus del pago: PENDING , IN_PROCESS, REJECTED, CANCELED, APPROVED
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">amount</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Cantidad por el cual se hizo el pago</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>
  </tr>

<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">receiptNumber
</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Si fue exitosa este campo contiene el receipt generado del pago, de lo contrario su valor ser&aacute; null</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>
  </tr>
  

</table>
`}</HTMLBlock>

## Notificación del Resultado del Pago Webhook (Proceso de pago completado)

Este método entrega los resultados de pago de forma asincrónica, lo que significa que los resultados se envían a un endpoint designado (webhook) después de que se complete la transacción de pago:

* **Respuesta Asincrónica:** Los comerciantes necesitan configurar un endpoint de webhook para recibir y procesar los resultados de pago. El endpoint debe ser accesible a través de internet y capaz de manejar solicitudes HTTP.
* **Notificación de Webhook:** Cuando se completa una transacción de pago, el sistema de Clip envía una notificación de webhook que contiene los resultados de pago al endpoint configurado.
* **Procesamiento en el Backend:** Los comerciantes pueden implementar lógica en su servidor para manejar las notificaciones de webhook, como actualizar registros de base de datos, activar notificaciones o realizar procesamiento adicional basado en el resultado del pago.
* **Flexibilidad y Escalabilidad:** Dado que la respuesta es asincrónica, los comerciantes pueden experimentar un ligero retraso entre la finalización de la transacción de pago y la recepción de la notificación de webhook. Este canal permite a los comerciantes desacoplar el procesamiento de resultados de pago del flujo de transacción y manejarlo de forma asincrónica en sus sistemas backend.

> 🚧 Importante
>
> Sólo hay un intento de envío de notificación por parte del webhook, a lo cual si se requiere conocer el detalle de un pago procesado en específico se tiene que realizar una petición a nuestro endpoint [GET/Payments](https://developer.clip.mx/reference/transactions#/)

## Ejemplo de uso:

* Configurar el endpoint del Webhook: Asegúrate de que tu servidor esté configurado para manejar solicitudes HTTP entrantes.
* Configurar el Webhook en el Panel de Clip: Ve al Portal de Desarrolladores de Clip y configura tu endpoint de webhook.

Para obtener información detallada sobre cómo configurar webhooks, consulta la Referencia de [Webhooks de Clip](https://developer.clip.mx/reference/referencia-postback-webhook).

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.