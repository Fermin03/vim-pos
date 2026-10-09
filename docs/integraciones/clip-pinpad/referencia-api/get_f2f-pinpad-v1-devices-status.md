<!-- fuente: https://developer.clip.mx/reference/get_f2f-pinpad-v1-devices-status · capturado 2026-10-08 -->

---
updatedAt: 2026-02-12T18:59:12.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obtener status de Lectores Clip PinPad

Recupera el estado de los dispositivos pinpad. Puede consultar todos los dispositivos del comercio o filtrar por un dispositivo específico.

La API permite obtener el estado actual de los Lectores Clip PinPad asociados a un comercio. Esta información es útil para monitorear la disponibilidad de los Lectores Clip y detectar problemas de conectividad.

## Autenticación

El endpoint requiere el siguiente header obligatorio:

```json
{
  "Authorization": "Basic [token]"
}
```

## Objeto Completo

La respuesta es un arreglo JSON con la siguiente estructura para cada dispositivo:

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
  </tr>

  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">merchant_id</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Identificador &uacute;nico del comercio, en formato: UUID
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">serial_number</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">N&uacute;mero de serie &uacute;nico asignado al dispositivo.
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
  </tr>

  </tr>
  
<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">status</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Estado actual del dispositivo (active, inactive, unknown).</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
  </tr>

<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">expired_at
</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Fecha y hora en que expira el registro del dispositivo.
</span>
      </p>
  </td>
<td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
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
        <span class="c23 c18">Fecha y hora en que se cre&oacute;n el registro del dispositivo.</span>
      </p>
  </td>
  <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
  </tr>
  

<tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">updated_at</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23">Fecha y hora de la &uacute;ltima actualización del registro.
</span>
      </p>
  </td>
<td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>

  </tr>
  
  <tr class="c25">
    <td class="c19" colspan="8" rowspan="1">
      <p class="c7">
        <span class="c14 c10">version</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c23 c18">Versi&oacute;n interna del registro (para control y seguimiento).
</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Number</span>
      </p>
    </td>

  </tr>
</table>
`}</HTMLBlock>

## Consideraciones Clave

* Los Lectores Clip pueden tener los siguientes estados:
  * **active**: el Lector Clip está operativo y puede procesar transacciones.
  * **inactive**: el Lector Clip está desconectado o no disponible.
  * **expired**: el Lector Clip no ha reportado un estado active en los últimos 20 segundos.
  * **unknown**: el merchant tiene el feature desactivado.
* Los Lectores Clip deben reportar su estado regularmente. Si un Lector Clip activo no actualiza su estado en 20 segundos, automáticamente se marca como `"expired".`
* Un arreglo vacío \[] es una respuesta válida e indica que no hay Lectores Clip registrados o que ningún Lector Clip cumple con los criterios de búsqueda, ejemplo `Response (200 OK)`:

```json
[]
```

* Todas las fechas están en formato ISO 8601 con zona horaria UTC.

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip PinPad API - Devices Status",
    "version": "1.0.0",
    "description": "API de consulta de status de dispositivos PinPad asociados a un comercio.\nPermite monitorear la disponibilidad de los dispositivos y detectar problemas de conectividad.\n"
  },
  "servers": [
    {
      "url": "https://api.payclip.io"
    }
  ],
  "paths": {
    "/f2f/pinpad/v1/devices/status": {
      "get": {
        "summary": "Obtener status de dispositivos PinPad",
        "description": "Recupera el estado actual de los dispositivos PinPad asociados al comercio autenticado.\n\nLa respuesta es un arreglo JSON que puede contener:\n- Lista de dispositivos\n- Arreglo vacío [] si no existen dispositivos registrados\n\nEstados posibles del dispositivo:\n- **active**: el dispositivo está operativo  \n- **inactive**: el dispositivo está desconectado  \n- **expired**: no ha reportado estado activo en los últimos 20 segundos  \n- **unknown**: el merchant no tiene el feature habilitado\n",
        "tags": [
          "API de PinPad"
        ],
        "security": [
          {
            "basicAuthHeader": []
          }
        ],
        "responses": {
          "200": {
            "description": "Consulta exitosa",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "description": "Lista de dispositivos PinPad del comercio",
                  "items": {
                    "type": "object",
                    "properties": {
                      "merchant_id": {
                        "type": "string",
                        "description": "Identificador único del comercio."
                      },
                      "serial_number": {
                        "type": "string",
                        "description": "Número de serie del dispositivo PinPad."
                      },
                      "status": {
                        "type": "string",
                        "description": "Estado actual del dispositivo.",
                        "enum": [
                          "active",
                          "inactive",
                          "expired",
                          "unknown"
                        ]
                      },
                      "expires_at": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Fecha y hora en que expira el estado del dispositivo."
                      },
                      "created_at": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Fecha de creación del registro del dispositivo."
                      },
                      "updated_at": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Fecha de última actualización del registro."
                      },
                      "version": {
                        "type": "integer",
                        "description": "Versión interna del registro."
                      }
                    }
                  }
                },
                "example": [
                  {
                    "merchant_id": "uuid",
                    "serial_number": "PP35542235000286",
                    "status": "active",
                    "expires_at": "2024-01-15T10:30:20Z",
                    "created_at": "2024-01-15T10:00:00Z",
                    "updated_at": "2024-01-15T10:30:00Z",
                    "version": 5
                  },
                  {
                    "merchant_id": "uuid",
                    "serial_number": "PP35542235000287",
                    "status": "inactive",
                    "expires_at": "2024-01-15T10:25:20Z",
                    "created_at": "2024-01-15T09:00:00Z",
                    "updated_at": "2024-01-15T10:25:00Z",
                    "version": 3
                  }
                ]
              }
            }
          },
          "401": {
            "description": "No autorizado",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "code": "UNAUTHORIZED",
                  "message": "Authorization header is missing or invalid"
                }
              }
            }
          },
          "500": {
            "description": "Error interno del servidor",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "code": "INTERNAL_SERVER_ERROR",
                  "message": "Unexpected error occurred"
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
        "description": "Usa el formato: **Basic {TOKEN}**  \n⚠️ En ReadMe, en el campo de credenciales escribe **solo el token base64**  \nEjemplo: `MTZjNjI4NDAtOTkwMy00ZjU5LWE4MTAtODE4YjI2NWUyZTk0Om...`\n"
      }
    }
  }
}
```