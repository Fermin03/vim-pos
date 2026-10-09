<!-- fuente: https://developer.clip.mx/reference/administración-de-códigos-en-la-aplicación · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:35:47.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Administración de Códigos en la Aplicación

Para mejorar la gestión de errores, esta tabla brinda apoyo para comprender los mensajes de código de error obtenidos de la implementación del terminal SDK. Facilita la depuración de errores al permitir la comparación de procesos internos. Además, la fila del webhook indica si existe alguna relación con el proceso posterior al pago.

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
<table class="c27">
  <tr class="c30">
    <td class="c29 c11" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Código</span>
      </p>
    </td>
    <td class="c21 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Descripción</span>
      </p>
    </td>
    <td class="c24 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Terminal SDK PAYMENT PROCESS ERROR</span>
      </p>
    </td>
    <td class="c24 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">WEBHOOK POSTBACK PROCESS ERROR</span>
      </p>
    </td>
  </tr>
  
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">EMPTY_AMOUNT
</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">El importe no debe ser 0.0</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>
    </td>
        <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
    </td>
  
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">EMPTY_MESSAGE</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">El mensaje no debe estar vacío.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>

  </tr>
  
  
<tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">SERVICE_ERROR
</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Algo falló al intentar crear una orden de pago.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>
<td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
  </td>


  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">LIMIT_CHECK_FAILED
</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Ha alcanzado el límite de uso del terminal.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
    </td>
        <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>
    </td>
    
    
    

    
    <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">GENERIC_DECLINE</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">La transacción fue rechazada por razones no especificadas.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>

  </tr>
  
  
  
  
  
<tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">RECEIVE_DECLINE_CALL_ISSUER
</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">La transacción fue rechazada. Por favor, llame al emisor de la tarjeta para más ayuda.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
<td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>
  </td>


  
  
  
  
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">GENERIC_DECLINE</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">La transacción fue rechazada por razones no especificadas.</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">X
</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">
</span>
      </p>

  </tr>
  
  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">RECEIVE_DECLINE_CALL_ISSUER</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La transacción fue rechazada. Llame al emisor de la tarjeta para más ayuda.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">INSUFFICIENT_FUNDS</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Fondos insuficientes disponibles para la transacción.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">NO_CONN</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Sin conexión disponible durante la transacción.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">MC_FALLBACK</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Transacción de respaldo Mastercard iniciada.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">VISA_CTLS_FALLBACK</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Transacción de respaldo Visa sin contacto iniciada.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">AMEX_MERCHANT_BLOCKED</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Transacción American Express rechazada por bloqueo del comercio.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">DO_NOT_HONOR</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">El emisor de la tarjeta rechazó la transacción.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">INVALID_TRANSACTION</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La transacción no es válida.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">TRANSACTION_NOT_PERMITTED_TO_CARDHOLDER</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La transacción no está permitida al titular de la tarjeta.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">EXPIRED_CARD</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La tarjeta utilizada para la transacción ha expirado.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">EXCEEDS_WITHDRAWAL_AMOUNT_LIMIT</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">El monto de la transacción excede el límite permitido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>
  

<tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">FAIL_3DS_AUTHENTICATION</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La autenticación 3DS de la transacción falló.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">ALLOWABLE_NUMBER_OF_PIN_TRIES_EXCEEDED</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Número máximo de intentos de PIN excedido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">INVALID_CARD_NUMBER_NO_SUCH_NUMBER</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Número de tarjeta inválido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">GENERIC_ERROR</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Error genérico ocurrido durante la transacción.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">REFER_TO_CARD_ISSUER</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La transacción debe ser referida al emisor de la tarjeta.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">INVALID_AMOUNT</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">El monto de la transacción es inválido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">INVALID_PIN_ONE_TIME</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">PIN de un solo uso inválido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">CONTACTLESS_FALLBACK_VISA_MASTERCARD</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Transacción de respaldo sin contacto Visa o Mastercard iniciada.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">QPS_FALLBACK_FOREIGN_CARDS</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Transacción QPS de respaldo para tarjetas extranjeras iniciada.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">BILLER_SYSTEM_UNAVAILABLE</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">El sistema del facturador no está disponible.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">TERMINAL_ERROR</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Error ocurrido en el terminal.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">NO_CONNECTION</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">No se detectó conexión durante la transacción.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">CANCELLED</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La transacción fue cancelada.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">UNKNOWN_ERROR</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Error desconocido ocurrido.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">EMPTY_REFERENCE</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Referencia vacía cuando es requerida.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">EMPTY_SESSION</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">Sesión no inicializada desde la aplicación PinPad.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">ApplicationNotFoundException</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">La aplicación PinPad no está instalada en el dispositivo.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>

  <tr class="c25">
    <td class="c29" colspan="2"><p class="c16"><span class="c14 c10">PaymentInitializationException</span></p></td>
    <td class="c2"><p class="c7"><span class="c3">El PaymentHandler no fue declarado correctamente en la aplicación.</span></p></td>
    <td class="c21"><p class="c16"><span class="c3">X</span></p></td>
    <td class="c21"><p class="c16"><span class="c3"></span></p></td>
  </tr>


</table>
`}</HTMLBlock>

<br />

## Devoluciones

Para una devolución, dentro de las 24 horas se toma cómo una cancelación y posterior a las 24 horas se maneja como un rembolso de la transacción.

* POST <https://api.payclip.com/refunds>
  Solicita la devolución total de un pago completado.
* Obtener el estatus de la devolución:
  GET <https://api.payclip.com/refunds/{id}>
  Consulta información detallada de una devolución.

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.