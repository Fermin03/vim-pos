<!-- fuente: https://developer.clip.mx/reference/get_devices-serial-number-preferences · capturado 2026-10-08 -->

---
updatedAt: 2026-07-16T00:28:34.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Consultar preferencias de un dispositivo

Obtiene las preferencias configuradas para un dispositivo PinPad utilizando su número de serie.

Si el dispositivo no tiene preferencias personalizadas, la respuesta indicará que utiliza la configuración predeterminada (`DEFAULT`).


El encabezado contendrá la Clave con el prefijo Basic, Para crear un intento de pago implementa la siguiente función desde tu backend:

```json
{
   "ssn": "P8220724000042",
   "preferences": {
       "is_kiosk_mode_enabled": false
   },
   "type": "DEFAULT"
}
```

### Body parameters (parámetros del cuerpo de la solicitud)

La siguiente tabla describe el esquema de los parámetros del body de la solicitud:<br /><br />

<HTMLBlock>{`
<style type="text/css">
  @import url('https://themes.googleusercontent.com/fonts/css?kit=bI_Gc1PWC8t0lAlDZHzCYto0Zrc4dKrZ3w3rWMnBg_xdW0rLHhFSksIhV-jPNnvG');

  table td, table th {
    padding: 0;
  }

  .c1, .c6, .c8, .c12, .c13, .c19, .c34 {
    border-right-style: solid;
    padding: 5pt;
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
    border-bottom-style: solid;
  }

  .c1 { width: 13.4pt; }
  .c6 { width: 16.5pt; }
  .c8 { width: 48pt; }
  .c12 { width: 183pt; }
  .c13 { width: 48pt; }
  .c19 { width: 114pt; }
  .c34 { width: 97.5pt; }

  .c3 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 10pt;
    font-family: "Barlow";
    font-style: normal;
  }

  .c7,
  .c16,
  .c0 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: left;
  }

  .c16 {
    text-align: center;
  }

  .c10,
  .c14 {
    font-size: 10pt;
    font-family: "Barlow";
    font-weight: 700;
  }

  .c11 {
    background-color: #d9d9d9;
  }

  .c25,
  .c30 {
    height: 21.8pt;
  }

  .c35 {
    margin-left: auto;
    margin-right: auto;
    border-collapse: collapse;
    border-spacing: 0;
  }
</style>

<table class="c35">

  
  <tr class="c30">
    <td class="c19 c11" colspan="3">
      <p class="c16"><span class="c14">Parámetro</span></p>
    </td>
    <td class="c11 c12">
      <p class="c16"><span class="c14">Descripción</span></p>
    </td>
    <td class="c13 c11">
      <p class="c16"><span class="c14">Tipo</span></p>
    </td>
  
  </tr>

 
  
  <tr class="c25">
    <td class="c19" colspan="3">
      <p class="c7">
        <span class="c14 c10">ssn</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
          Representa el serial number del device.
        </span>
      </p>
    </td>

    <td class="c13">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>
  </tr>

  
  <tr class="c25">
    <td class="c19" colspan="3">
      <p class="c7">
        <span class="c14 c10">preferences</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
          Representa las preferencias que puede configurar el merchant.
        </span>
      </p>
    </td>

    <td class="c13">
      <p class="c16">
        <span class="c3">Object</span>
      </p>
    </td>
  

  
  <tr class="c25">
    <td class="c6"></td>

    <td class="c34" colspan="2">
      <p class="c7">
        <span class="c14 c10">type</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
  Representa si los valores por device son por <strong>DEFAULT</strong> o
  <strong>CUSTOM</strong> en caso de que se hayan realizado cambios en los
  preferences por medio del <strong>POST request</strong>.
</span>
      </p>
    </td>

    <td class="c13">
      <p class="c16">
        <span class="c3">String</span>
      </p>
    </td>

   
  </tr>

</table>
`}</HTMLBlock>

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip PinPad API - Get Device Preferences",
    "version": "1.0.0",
    "description": "API para consultar las preferencias configuradas en un dispositivo PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/devices/{serial_number}/preferences": {
      "get": {
        "summary": "Consultar preferencias de un dispositivo",
        "description": "Obtiene las preferencias configuradas para un dispositivo PinPad utilizando su número de serie.\n\nSi el dispositivo no tiene preferencias personalizadas, la respuesta indicará que utiliza la configuración predeterminada (`DEFAULT`).\n",
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
            "name": "serial_number",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Número de serie del dispositivo PinPad.",
            "example": "P8220724000042"
          }
        ],
        "responses": {
          "200": {
            "description": "Preferencias obtenidas correctamente.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ssn": {
                      "type": "string",
                      "description": "Representa el número de serie (`serial_number`) del dispositivo PinPad."
                    },
                    "preferences": {
                      "type": "object",
                      "description": "Representa las preferencias configuradas para el dispositivo.",
                      "properties": {
                        "is_kiosk_mode_enabled": {
                          "type": "boolean",
                          "description": "Indica si el modo kiosko se encuentra habilitado en el dispositivo.",
                          "example": false
                        }
                      }
                    },
                    "type": {
                      "type": "string",
                      "description": "Representa el origen de las preferencias del dispositivo.\n\n- **DEFAULT:** El dispositivo utiliza la configuración predeterminada.\n- **CUSTOM:** El dispositivo tiene preferencias personalizadas configuradas mediante el endpoint `POST /devices`.\n",
                      "example": "DEFAULT"
                    }
                  }
                },
                "example": {
                  "ssn": "P8220724000042",
                  "preferences": {
                    "is_kiosk_mode_enabled": false
                  },
                  "type": "DEFAULT"
                }
              }
            }
          },
          "404": {
            "description": "Dispositivo no encontrado.",
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
                      "description": "Mensaje descriptivo del error."
                    }
                  }
                },
                "example": {
                  "code": "DEVICE_NOT_FOUND",
                  "message": "Device not found."
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
  }
}
```