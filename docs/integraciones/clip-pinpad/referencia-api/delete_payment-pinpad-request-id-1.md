<!-- fuente: https://developer.clip.mx/reference/delete_payment-pinpad-request-id-1 · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:19:19.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Eliminar Pago ID

Cancela un pago previamente creado en un dispositivo PinPad.  
El parámetro `pinpad_request_id` corresponde al identificador devuelto cuando creaste la intención de pago.

Si por alguna razón necesitas cancelar o eliminar una intención de pago, podrás hacerlo utilizando un endpoint **DELETE**

Disponible pasando el parámetro `pinpad_request_id`como se muestra a continuación:

```json
curl --location --request DELETE 'https://api.payclip.io/f2f/pinpad/v1/payment/{pinpad_request_id}' \
--header 'Authorization: Basic {TOKEN}' \
--data ''
```

## Objeto Completo

La siguiente tabla describe los elementos del objeto de respuesta completo que recibirá tu sistema:

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

.c18 {
  background-color: transparent !important; /* en lugar de #ffffff */
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
        <span class="c14 c10">pinpad_request_id</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Par&aacute;metro  en la url que indica el id generado por la solicitud de pago.
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
</table>
`}</HTMLBlock>

> 🚧 Importante
>
> Esto solo funcionará siempre y cuando el intento de pago aún no haya sido recogido por el terminal. Si ese es el caso y aún así deseas cancelar el pago, aún puedes hacerlo cancelando el proceso dentro de la aplicación Pin Pad o cerrando completamente la aplicación.

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.

## Llamada de prueba

Puedes realizar una llamada de prueba, únicamente asegúrate de poner tu [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) en el campo **"Header: Autorization"** del widget localizado a tu derecha y dale click en el botón "Try It!":

<Image align="center" border={false} width="500px" src="https://files.readme.io/f3220b029037463a16c4ca9aa7383891b9196120872b6fbec17c423ebd971978-tryit3.png" />

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip PinPad API - Delete Payment - ID",
    "version": "1.0.0",
    "description": "API para gestionar pagos en terminales PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/payment/{pinpad_request_id}": {
      "delete": {
        "summary": "Cancelar un pago en PinPad",
        "description": "Cancela un pago previamente creado en un dispositivo PinPad.  \nEl parámetro `pinpad_request_id` corresponde al identificador devuelto cuando creaste la intención de pago.\n",
        "tags": [
          "API de PinPad"
        ],
        "security": [
          {
            "basicAuthHeader": []
          }
        ],
        "parameters": [
          {
            "in": "path",
            "name": "pinpad_request_id",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Parámetro en la URL que indica el id generado por la solicitud de pago.",
            "example": "pinpad-c8e8a7f1-5d28-4f20-b7b9-6adfe12bcd34"
          }
        ],
        "responses": {
          "200": {
            "description": "Pago cancelado exitosamente",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "pinpad_request_id": {
                      "type": "string",
                      "description": "ID de la solicitud de pago cancelada.",
                      "example": "pinpad-0c9abeff-189b-4763-9f8c-907336df4afd"
                    },
                    "reference": {
                      "type": "string",
                      "description": "Referencia asociada al pago.",
                      "example": "test-demo-6a405173-c661-414a-9a8f-ecc77a9afe3f"
                    },
                    "amount": {
                      "type": "string",
                      "description": "Monto de la transacción cancelada.",
                      "example": "200.50"
                    },
                    "serial_number_pos": {
                      "type": "string",
                      "description": "Número de serie del Lector Clip.",
                      "example": "P8220724000042"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Petición inválida",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string",
                      "example": "PAYMENT_REQUEST_ISSUE"
                    },
                    "message": {
                      "type": "string",
                      "example": "The payment requested was removed or was taken successfully by CLIP POS"
                    }
                  }
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