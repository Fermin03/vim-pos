<!-- fuente: https://developer.clip.mx/reference/introduccion-api-de-reembolsos · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:15:45.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Introducción a la API de Reembolsos

La API de Reembolsos de Clip te permite realizar un reembolso total o parcial de cualquier transacción que haya sido completada con tarjeta.

Sólo tienes que solicitar a la API el reembolso de un pago y recibirás el estado del reembolso (Aprobado, Declinado). Cuando el reembolso es aprobado, los fondos son reembolsados a la tarjeta de crédito o débito con la que se completó el pago.

Además del pago, el reembolso es un tipo de transacción. Por lo tanto, cada vez que solicitas un reembolso a través de la API, se genera un nuevo número de identificación (*id*) y de recibo (*receipt\_no*) específicos para ese reembolso. Sin embargo, si solicitas un reembolso dentro de las primeras 24 h después de haber completado el pago, el reembolso se identifica con el mismo id de la transacción original ya que en este caso es una cancelación.

## ¿Qué puedo hacer con la API de Reembolsos?

Puedes solicitar el reembolso total o parcial de cualquier pago que haya sido completado con tarjeta dentro de un plazo no mayor a 180 días naturales. La API también te permite consultar información detallada de los reembolsos que has realizado.

## ¿Qué necesito para hacer una solicitud de reembolso?

Estos son los requerimientos para hacer solicitudes a la API de Reembolsos:

* Una [cuenta Clip](https://dashboard.clip.mx/) activa.
* Un [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion).
* Un balance<sup>\*</sup> igual o mayor al monto que vas a reembolsar.
* Que el tiempo transcurrido entre la compleción de la transacción y la solicitud del reembolso no sea mayor a 180 días naturales.

<br />

## Balance

<sup>\*</sup> El balance es la cantidad de ventas que has realizado en el día en que solicitas el reembolso (y que no ha sido depositado en tu cuenta) menos la cantidad total de dinero que has reembolsado en ése mismo día. Balance actual = ventas totales - reembolsos totales. Para conocer tu balance deberás consultar las ventas del día en la sección *Transacciones* del [panel de Clip](https://dashboard.clip.mx/) y llevar un registro de tus reembolsos.

<br />

## ¿Cuál es la URL base?

Para hacer llamadas a la API, debes utilizar la siguiente URL base:

<https://api.payclip.com>

<br />

## ¿Cuáles son los endpoints de la API de Reembolsos?

La API de Checkout tiene dos endpoints:

**POST** /refunds

Solicitar el reembolso de una transacción.

<br />

**GET** /refunds/\{id}

Consultar la información de un reembolso.

<br />

## ¿Cuáles son los parámetros del encabezado?

<HTMLBlock>{`
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
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Requerido/opcional</span>
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
        <span class="c14 c10">Content-type</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Define el formato del objeto de solicitud.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">application/json</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Requerido </span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Solicitud en formato JSON.</span>
      </p>
    </td>
    
    

  <tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">idempotency-key<sup> †</sup></span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Valor único que puedes generar y utilizar para identificar subsecuentes intentos de reembolso de una misma transacción.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Opcional</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Tiene duración de 1 minuto.</span>
      </p>
    </td>
    
    

  <tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">Authorization</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Especifica el token de acceso. </span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Requerido</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"> < api_token > </span>
      </p>
    </td>
  
</table>
`}</HTMLBlock>

<sup>†</sup> El parámetro **idempotency-key** sólo puede ser enviado en la solicitud al endpoint **POST** *Solicitar el reembolso de una transacción*.

<br />

## ¿Cuál es el objeto JSON de reembolso?

El siguiente es un ejemplo de objeto JSON de reembolso.

```json
{
    "id": "7f2ffd14-a171-487f-acb3-ede3b19a5a6e",
    "status": "approved",
    "status_message": "Refunded. Merchant initiated.",
    "amount": 0.01,
    "receipt_no": "9vcLT53",
    "created_at": "2023-08-15T18:09:13Z",
    "currency": "MXN",
    "reference": {
        "type": "payment",
        "id": "b0e3bd81-d3db-41a2-ab8b-e56ccbd32f11"
    },
    "reason": "reason"
}
```

<br />

## ¿Cuál es el esquema del objeto de reembolso?

A continuación se enlistan y describen los elementos del objeto de reembolso.

<HTMLBlock>{`
<style type="text/css">
  
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
    font-family: 'Roboto', sans-serif;
    font-style: normal
  }

  .c4 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 9pt;
    font-family: 'Roboto', sans-serif;
    font-style: normal
  }

  .c33 {
    color: #666666;
    font-weight: 700;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 12pt;
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
  }

  .c10 {
    font-size: 10pt;
    font-family: 'Roboto', sans-serif;
    font-weight: 700
  }

  .c23 {
    font-size: 10pt;
    font-family: 'Roboto', sans-serif;
    font-weight: 400
  }

  .c17 {
    font-weight: 700;
    font-size: 12pt;
    font-family: 'Roboto', sans-serif;
  }

  .c36 {
    font-weight: 400;
    font-size: 11pt;
    font-family: 'Roboto', sans-serif;
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
    background-color: #ffffff
  }

  .c38 {
    font-style: italic
  }

  .title {
    padding-top: 0pt;
    color: #000000;
    font-size: 26pt;
    padding-bottom: 3pt;
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
    line-height: 1.15;
    page-break-after: avoid;
    orphans: 2;
    widows: 2;
    text-align: left
  }

  li {
    color: #000000;
    font-size: 11pt;
    font-family: 'Roboto', sans-serif;
  }

  p {
    margin: 0;
    color: #000000;
    font-size: 11pt;
    font-family: 'Roboto', sans-serif;
  }

  h1 {
    padding-top: 20pt;
    color: #000000;
    font-size: 20pt;
    padding-bottom: 6pt;
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
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
    font-family: 'Roboto', sans-serif;
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
        <span class="c14 c10">id<sup>‡ </sup> </span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Número de identificación del reembolso.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Formato UUID. </span>
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
        <span class="c3">Estado de la solicitud del reembolso.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Puede ser: </span>
      </p>
      <p class="c7">
        <span class="c3">- approved</span>
      </p>
      <p class="c7">
        <span class="c3">- declined</span>
      </p>
    </td>
  </tr>


<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">status_message</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Mensaje con detalles del estado de la solicitud.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
     
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
        <span class="c3">Cantidad reembolsada.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Float</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Debe ser igual al monto de la transacción original (versión beta). </span>
      </p>
    </td>
  </tr>


<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">receipt_no</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Número de recibo del reembolso.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Se mostrará en el evoucher de la transacción. </span>
      </p>
    </td>
  </tr>       

      
  <tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">created_at</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Fecha de creación del reembolso.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Formato ISO 8601 (YYYY-MM-DDTHH-MM-SSZ)</span>
      </p>
    </td>
  </tr>
       
   
  
  <tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">currency</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Código de tres letras que identifica el tipo de moneda de la transacción.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Sólo acepta MXN (pesos mexicanos). </span>
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
        <span class="c23 c18">Objeto que detalla el n&uacute;mero y tipo  de referencia de la transacción original reembolsada.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Objeto</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c0">
        <span class="c3"></span>
      </p>
    </td>
    
    
  </tr>
  <tr class="c25">
    <td class="c6" colspan="1" rowspan="1">
      <p class="c0">
        <span class="c14 c10"></span>
      </p>
    </td>
    <td class="c34" colspan="7" rowspan="1">
      <p class="c7">
        <span class="c14 c10">type</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Tipo de identificación con el que se hace referencia a la transacción original.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c0">
        <span class="c3">Puede ser: 
          <p class="c7">
        <span class="c3">- payment</span>
      </p>
          <p class="c7">
        <span class="c3">- receipt</span>
      </p>
        </span>
      </p>
    </td>
  </tr>
  
  
  <tr class="c25">
    <td class="c6" colspan="1" rowspan="1">
      <p class="c0">
        <span class="c14 c10"></span>
      </p>
    </td>
    <td class="c34" colspan="7" rowspan="1">
      <p class="c7">
        <span class="c14 c10">id</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Número de identificación de la transacción original reembolsada.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c0">
        <span class="c3">Formato: UUID.</span>
      </p>
    </td>
  </tr>

 

	<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">reason</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Motivo del reembolso.</span>
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

<sup>‡</sup> Este número de identificación del reembolso, *id*, es generado en la respuesta del endpoint **POST** *Solicitar el reembolso de una transacción*, mismo que deberás utilizar en el path parameter de la solicitud **GET** *Consultar la información de un reembolso*.

<br />

## ¿Cuáles son los códigos de error?

La siguiente tabla contiene una lista y la descripción de algunos mensajes de error y su asociación con estados HTTP.

<HTMLBlock>{`


<table class="c27">
  
  
  <tr class="c30">
    <td class="c29 c11" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c17">C&oacute;digo HTTP</span>
      </p>
    </td>
    <td class="c21 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">C&oacute;digo de error</span>
      </p>
    </td>
    <td class="c24 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Mensaje</span>
      </p>
    </td>
  </tr>

    
  <tr>
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">400</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">CL2200</span>
      </p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Unable to process the request. Required fields are missing.</span>
      </p>
    </td>
  </tr>
  
  
  <tr>
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">403</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">CL1500</span>
      </p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Unauthorized</span>
      </p>
    </td>
  </tr>
  

  
  
  <tr>
    <td class="c29" colspan="2" rowspan="3">
      <p class="c16">
        <span class="c14 c10">404</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">AI1300</span>
      </p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Transaction ID not found.</span>
      </p>
    </td>
  </tr>


<tr>
  <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">CL301</span>
        </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Payment not found.</span>
    </p>
  </td>
</tr>



<tr>
  <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">AI1800</span>
    </p>
  </td>
   <td class="c24" colspan="1" rowspan="1">
   	<p class="c7">
       <span class="c3">The payment is not approved.</span>
   	</p>
  </td>
</tr>
     

    
  <tr>
    <td class="c29" colspan="2" rowspan="8">
      <p class="c16">
        <span class="c14 c10">409</span></p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">AI1801 </span></p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">The refund amount is greater than the original.</span></p>
    </td>
  </tr>


<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1802 </span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">The refund amount, plus previous refunds, is greater than the original amount.</span>
    </p>
  </td>
</tr>
     

    
<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1803</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">The refund date has expired. </span>
    </p>
  </td>
</tr>
     
  
<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1804</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">  Refund declined.The original transaction is in dispute <sup>#</sup>. </span>
    </p>
  </td>
</tr>


<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1805</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Refunds are disabled. </span>
    </p>
  </td>
</tr>

      
<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1806</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Refund is disabled for payments with MSI and MCI </span>
    </p>
  </td>
</tr>

    
<tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1400</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Insufficient funds to make the refund. </span>
    </p>
  </td>
</tr>

  
  <tr>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1807</span>
      </p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Refund in process for this transaction. Please try again later. </span>
      </p>
    </td>
</tr>

  
<tr>
  <td class="c29" colspan="2" rowspan="1">
    <p class="c16">
      <span class="c14 c10">500</span>
    </p>
  </td>
  <td class="c2" colspan="1" rowspan="1">
    <p class="c16">
      <span class="c3">AI1899</span>
    </p>
  </td>
  <td class="c24" colspan="1" rowspan="1">
    <p class="c7">
      <span class="c3">Internal error. </span>
    </p>
  </td>
</tr>
</table>
`}</HTMLBlock>

<sup>#</sup> El reembolso es declinado debido a que la transacción original se encuentra en disputa.

<br />

### Ejemplo del objeto JSON de error

```json
{
"error_code": "AI1801",
"message": "Conflict",
"detail": [
  "The refund amount is greater that the original"
  ]
}
```

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