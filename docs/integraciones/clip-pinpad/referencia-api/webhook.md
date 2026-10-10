<!-- fuente: https://developer.clip.mx/reference/webhook · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:21:28.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Webhook

Para el manejo asíncrono de los resultados de pago, puedes configurar un webhook. Integrar el webhook en tu sistema te ayudará a recibir notificaciones cuando la solicitud por pinpad-payments-api reciba alguna actualización de estatus. Además, **cuando se completa una transacción de pago**, el sistema de Clip también envía una notificación de webhook que **contiene los resultados del pago al endpoint configurado**.

* **Configuración:**&#x4C;os comerciantes deben configurar un endpoint de webhook que pueda manejar solicitudes HTTP.
* **Notificación:** El webhook entregará los resultados de pago a este endpoint.
* **Procesamiento:**&#x4C;os Merchants pueden implementar lógica del lado del servidor para procesar los resultados del pago, actualizar bases de datos, activar notificaciones u realizar otras acciones necesarias.

<Image align="center" src="https://files.readme.io/2978926e4bd19f9c49d22e5bada706d862d8bbdc5f85b510d7d75e3535457cc9-Captura_de_pantalla_2025-08-26_a_las_4.44.11_p.m..png" />

Este sistema notifica los cambios de estado de sus transacciones a través de un webhook. Por favor, asegúrese de haber configurado una URL de webhook en su portal de Clip. Para obtener información detallada sobre la configuración de webhooks.

Ejemplo:

```json
{
"webhook_url": "https://webhook.com/reception"
}
```

La estructura de las notificaciones webhook es la siguiente:

<br />

<HTMLBlock>{`
  <style type="text/css">
  @import url('https://themes.googleusercontent.com/fonts/css?kit=bI_Gc1PWC8t0lAlDZHzCYto0Zrc4dKrZ3w3rWMnBg_xdW0rLHhFSksIhV-jPNnvG');

  ol {
    margin: 0;
    padding: 0
  }
    
  table td, table th {
    padding: 0
  }

  .c1, .c6, .c12, .c13, .c19 {
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
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c1 { width: 13.4pt; }
  .c6 { width: 16.5pt; }
  .c12 { width: 183pt; }
  .c13 { width: 48pt; vertical-align: top; }
  .c19 { width: 114pt; }

  .c3 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 10pt;
    font-family: "Barlow";
    font-style: normal
  }

  .c7, .c16 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: left;
  }

  .c16 { text-align: center; }

  .c10, .c14 {
    font-size: 10pt;
    font-family: "Barlow";
    font-weight: 700;
  }

  .c11 { background-color: #d9d9d9; }
  .c18 { background-color: #ffffff; }

  .c25, .c30 {
    height: 21.8pt;
  }

  .c35 {
    margin-left: auto;
    border-spacing: 0;
    border-collapse: collapse;
    margin-right: auto
  }

</style>


<table class="c35">
   <tr class="c30">
    <td class="c19 c11" colspan="2" rowspan="1">
      <p class="c16"><span class="c14">Parámetro</span></p>
    </td>
    <td class="c11 c12" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Descripción</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Tipo</span></p>
    </td>
    <td class="c12 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Ejemplo</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Notas</span></p>
    </td>
  </tr>
  
  
  
  
  
  
  <tr class="c25">
    <td class="c19" colspan="2" rowspan="1">
      <p class="c7">
        <span class="c14 c10">id</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">id del pinpad request.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">pinpad-6a405173-c661-414a-9a8f-ecc77a9afe3f</span>
      </p>     
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UUID v4</span>
      </p>
    </td>    
  </tr>
  
  
  
  
  <tr class="c25">
    <td class="c19" colspan="2" rowspan="1">
      <p class="c7">
        <span class="c14 c10">origin</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Origen del pago.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">"pinpad-api"</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">"pinpad-payments-api".</span>
      </p>
    </td>    
  </tr>
  
  
  
  
  <tr class="c25">
    <td class="c19" colspan="2" rowspan="1">
      <p class="c7">
        <span class="c14 c10">event_type</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Estado de intenci&oacute;n del PinPad ha cambiado.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">"PINPAD_INTENT_STATUS_CHANGED"</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Valor "UPDATE" cuando se actualiza el status de un pago.</span>
      </p>
    </td>    
  </tr>
</table>
`}</HTMLBlock>

## Notificación de ejemplo

Ejemplo de una notificación webhook:

```json
{
"id":"pinpad-6a405173-c661-414a-9a8f-ecc77a9afe3f"
"origin":"pinpad-payments-api"
"event_type":"PINPAD_INTENT_STATUS_CHANGED"
}
```

Una vez obtenido ese id, puedes realizar una consulta al endpoint de [Consultar un Pago](https://developer.clip.mx/reference/get_payment-1) para consultar la información del link de pago.