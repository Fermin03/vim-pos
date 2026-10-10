<!-- fuente: https://developer.clip.mx/reference/post_payment-1 · capturado 2026-10-08 -->

---
updatedAt: 2026-02-11T23:35:33.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Crear una Intención de Pago

Crea una intención de pago en un dispositivo PinPad registrado en tu cuenta Clip.

<Callout icon="🚧" theme="warn">


  ### Importante

  Para generar una intención de pago exitosa asegurate que tu dispositivo clip se encuentre activo (Revisa la sección [Health Check](https://developer.clip.mx/reference/health-check) para más información).
</Callout>

El encabezado contendrá la Clave con el prefijo Basic, Para crear un intento de pago implementa la siguiente función desde tu backend:

```json
curl --location 'https://api.payclip.io/f2f/pinpad/v1/payment' \
--header 'Authorization: Basic {TOKEN}' \
--header 'Content-Type: application/json' \
--data '{
    "amount": "200.50",
    "tip_amount": "10",
    "reference": "test-demo-6a405173-c661-414a-9a8f-ecc77a9afe3f",
    "serial_number_pos":"P8220724000042",
    "webhook_url": "https://webhook.site/34bb8f7a-9646-4cc9-8694-4307ec53fbb4",
    "preferences": {
        "is_auto_return_enabled": false,
        "is_tip_enabled": false,
        "is_msi_enabled": true,
        "is_mci_enabled": true,
        "is_dcc_enabled": true,
        "is_retry_enabled": true,
        "is_share_enabled": true,
        "is_auto_print_receipt_enabled": false,
        "is_split_payment_enabled": true,
        "redirect_package_name": "com.payclip.blaze.client.app",
        "tip_options": [10,18]
        
    }
}'
```

## Objeto Completo

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
        <span class="c14 c10">amount</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Monto de la transacci&oacute;n.
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
        <span class="c3">Este par&aacute;metro es requerido</span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">tip_amount</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Monto de la propina.
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
        <span class="c14 c10">reference</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">ID de referencia externa.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Este par&aacute;metro es requerido</span>
      </p>
    </td>
  </tr>

<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">serial_number_pos
</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">N&uacute;mero de serie del terminal Clip
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
        <span class="c3">Este par&aacute;metro es requerido</span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">webhook_url</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">
          URL donde se enviar&aacute;n las notificaciones.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">De no venir este valor se utilizará por default el definido en el <a href= "https://dashboard.developer.clip.mx/webhooks">panel de desarrolladores</a>.

</span>
      </p>
    </td>
  </tr>
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">preferences</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Valores personalizables.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Object</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Opciones que pueden activarse o desactivarse</span>
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
        <span class="c14 c10">is_auto_return_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro para configurar el proceso del terminal al finalizar.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_tip_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Par&aacute;metro para la configuraci&oacute;n de la pantalla de propinas del terminal.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_msi_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro para habilitar cuotas sin intereses.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Para conocer los t&eacute;rminos y condiciones sobre cuotas, visita el sitio de Clip.</span>
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
        <span class="c14 c10">is_mci_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Par&aacute;metro para habilitar cuotas con intereses.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Para conocer los t&eacute;rminos y condiciones sobre cuotas, visita el sitio de Clip.</span>
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
        <span class="c14 c10">is_dcc_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro para habilitar la conversión dinámica de moneda actual.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_retry_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Par&aacute;metro  para permitir que los usuarios reintenten sus pagos cuando estos fallan.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_share_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Par&aacute;metro  para habilitar botones de compartir en pantalla de detalle del pago.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_auto_print_receipt_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Par&aacute;metro  para mandar a imprimir en automático al finalizar.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">is_split_payment_enabled</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro para para habilitar la división del pago total en múltiples transacciones.</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
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
        <span class="c14 c10">redirect_package_name</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Despu&eacute;s de la transacción pinpad redirecciona hacia una app instalada dentro de las terminales.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">        <span class="c3">String</span>
</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">En caso de que el packageName sea incorrecto pin pad app volverá a la vista principal.</span>
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
        <span class="c14 c10">tip_options</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro para definir las propinas que aparecen en la vista de Tips. </span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Array</span>
      </p>
    </td>
<td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Los valores permitidos son n&uacute;meros enteros entre 1 y 100. Permite entre 1 y tres opciones.

</span>
      </p>
    </td>
  </tr>


</table>
`}</HTMLBlock>

## Consideraciones Clave

1. La **Api de PinPad** es **compatible** solo con los **Lectores: [Total 3](https://shop.clip.mx/products/clip-total?utm_ad_id=\&utm_adgroup_id=\&utm_campaign_id=23532371458\&utm_gclid=CjwKCAiAqKbMBhBmEiwAZ3UboNZGmg3-9VN0pER-I3spP9gNC_rqN9po8L-oCR1AmZpuCGzUcOUc7BoCgI8QAvD_BwE\&adtype=pmax\&utm_source=Google\&utm_medium=cpc\&utm_campaign=conv_mx_clip-total-3_aon_pmax_2026_02_mult_google_cross-network_cpa\&gad_source=1\&gad_campaignid=23532401887\&gbraid=0AAAAADHOJbJ_BpJ-AwC-f55_eOA3-KIJZ\&gclid=CjwKCAiAqKbMBhBmEiwAZ3UboNZGmg3-9VN0pER-I3spP9gNC_rqN9po8L-oCR1AmZpuCGzUcOUc7BoCgI8QAvD_BwE), [Ultra](https://shop.clip.mx/products/clip-ultra?utm_medium=cpa\&utm_source=Google\&utm_campaign=conv_mx_clip-ultra_aon_brand-terms-|-clip-ultra_google_google-search_cpa\&utm_source_platform=Google%20Search\&utm_ID=104201301403\&utm_ad_id=768430425767\&utm_adgroup_id=186671067834\&utm_campaign_id=22876367264\&utm_gclid=CjwKCAjwisnGBhAXEiwA0zEORzVn_H6pGm6h-1GNPQoe8M8qFnp_IeY3TRD3lrPFcl90382eo2-PhxoCTDkQAvD_BwE\&gad_source=1), [Clip PinPad](https://www.clip.mx/clip-para-empresas/pin-pad?srsltid=AfmBOoo2sxCJYMCpkNFz_x560Kai4yKkI8Vzh3Wuk2G9wXf_0neLr2ej), [Clip Stand 2](https://shop.clip.mx/products/clip-stand)**
2. **Errores comunes:** Problemas de conectividad o identificadores de terminal incorrectos desencadenará una respuesta de excepción, se requiere **contar con red una WiFi estable mínimo 10MB/s**

> 🚧 Importante
>
> Para instalar el aplicativo de PinPad en tu Lector Clip, envia un correo electronico a <sdk@payclip.com> más el número de serie de tu lector
>
> Es necesario que también verifiques tu identidad con Clip. Puedes encontrar más información sobre cómo verificar tu identidad [aquí](https://developer.clip.mx/reference/kyc) .

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.

## Llamada de prueba

Puedes realizar una llamada de prueba, únicamente asegúrate de poner tu [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) en el campo **"Header: Autorization"** del widget localizado a tu derecha y dale click en el botón "Try It!":

<Image align="center" width="500px" src="https://files.readme.io/f3220b029037463a16c4ca9aa7383891b9196120872b6fbec17c423ebd971978-tryit3.png" />

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip PinPad API Paid",
    "version": "1.0.0",
    "description": "API para crear pagos en terminales PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/payment": {
      "post": {
        "summary": "Crear una intención de pago",
        "description": "Crea una intención de pago en un dispositivo PinPad registrado en tu cuenta Clip.\n",
        "tags": [
          "API de PinPad"
        ],
        "security": [
          {
            "basicAuthHeader": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "amount",
                  "reference",
                  "serial_number_pos"
                ],
                "properties": {
                  "amount": {
                    "type": "number",
                    "format": "float",
                    "description": "Monto de la transacción.",
                    "example": 200.5
                  },
                  "tip_amount": {
                    "type": "number",
                    "format": "float",
                    "description": "Monto de la propina.",
                    "example": 10
                  },
                  "reference": {
                    "type": "string",
                    "description": "ID de referencia externa.",
                    "example": "test-demo-6a405173-c661-414a-9a8f-ecc77a9afe3f"
                  },
                  "serial_number_pos": {
                    "type": "string",
                    "description": "Número de serie del Lector Clip.",
                    "example": "P8220724000042"
                  },
                  "webhook_url": {
                    "type": "string",
                    "format": "uri",
                    "description": "URL del endpoint que recibirá notificaciones webhook del link de pago. Puedes consultar la estructura de la notificación webhook en el siguiente [link](https://developer.clip.mx/reference/webhook).",
                    "example": "https://webhook.site/34bb8f7a-9646-4cc9-8694-4307ec53fbb4"
                  },
                  "preferences": {
                    "type": "object",
                    "description": "Valores personalizables.",
                    "properties": {
                      "is_auto_return_enabled": {
                        "type": "boolean",
                        "example": false
                      },
                      "is_tip_enabled": {
                        "type": "boolean",
                        "example": false
                      },
                      "is_msi_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "is_mci_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "is_dcc_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "is_retry_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "is_share_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "is_auto_print_receipt_enabled": {
                        "type": "boolean",
                        "example": false
                      },
                      "is_split_payment_enabled": {
                        "type": "boolean",
                        "example": true
                      },
                      "redirect_package_name": {
                        "type": "string",
                        "example": "com.payclip.blaze.client.app"
                      },
                      "tip_options": {
                        "type": "array",
                        "items": {
                          "type": "number"
                        },
                        "example": [
                          10,
                          18
                        ]
                      }
                    }
                  }
                }
              },
              "example": {
                "amount": 200.5,
                "tip_amount": 10,
                "reference": "test-demo-6a405173-c661-414a-9a8f-ecc77a9afe3f",
                "serial_number_pos": "P8220724000042",
                "webhook_url": "https://webhook.site/34bb8f7a-9646-4cc9-8694-4307ec53fbb4",
                "preferences": {
                  "is_auto_return_enabled": false,
                  "is_tip_enabled": false,
                  "is_msi_enabled": true,
                  "is_mci_enabled": true,
                  "is_dcc_enabled": true,
                  "is_retry_enabled": true,
                  "is_share_enabled": true,
                  "is_auto_print_receipt_enabled": false,
                  "is_split_payment_enabled": true,
                  "redirect_package_name": "com.payclip.blaze.client.app",
                  "tip_options": [
                    10,
                    18
                  ]
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "pinpad_request_id": {
                      "type": "string",
                      "description": "Identificador de la solicitud en PinPad."
                    },
                    "reference": {
                      "type": "string",
                      "description": "ID de referencia externa del pago."
                    },
                    "amount": {
                      "type": "string",
                      "description": "Monto de la transacción."
                    },
                    "serial_number_pos": {
                      "type": "string",
                      "description": "Número de serie del Lector Clip."
                    }
                  }
                },
                "example": {
                  "pinpad_request_id": "pinpad-6a405173-c661-414a-9a8f-ecc77a9afe3f",
                  "reference": "test-demo-6a405173-c661-414a-9a8f-ecc77a9afe3f",
                  "amount": "200.50",
                  "serial_number_pos": "P8220724000042"
                }
              }
            }
          },
          "400": {
            "description": "Error al conectar con el terminal",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string",
                      "description": "Código del error."
                    },
                    "message": {
                      "type": "string",
                      "description": "Mensaje detallado del error."
                    }
                  }
                },
                "example": {
                  "code": "PINPAD_TERMINAL_TIMEOUT_EXCEPTION",
                  "message": "Unable to connect to pinpad terminal. Please check your internet connection in the desired pinpad terminal or verify the correct serial_number_pos."
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "basicAuthHeader": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": "Usa el formato: **Basic {TOKEN}**\n"
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```