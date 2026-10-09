<!-- fuente: https://developer.clip.mx/reference/post_devices · capturado 2026-10-08 -->

---
updatedAt: 2026-07-15T23:56:43.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Configurar Preferencias 

Permite habilitar o deshabilitar el modo kiosco en uno o varios dispositivos PinPad. Es posible enviar hasta **25 dispositivos** por solicitud.

El encabezado contendrá la Clave con el prefijo Basic, Para crear un intento de pago implementa la siguiente función desde tu backend:

```json
curl --location 'https://api.payclip.io/f2f/pinpad/v1/devices' \
--header 'Authorization: Basic {TOKEN}' \
--header 'Content-Type: application/json' \
--data '{
    "devices": ["MyClipPosSerialNumber1", "MyClipPosSerialNumber2"], 
    "preferences": {
        "is_kiosk_mode_enabled": true,
	 "timeout_seg": 10
    }
}'


```

### Body parameters (parámetros del cuerpo de la solicitud)

La siguiente tabla describe el esquema de los parámetros del body de la solicitud:

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
    <td class="c12 c11">
      <p class="c16"><span class="c14">Notas</span></p>
    </td>
    <td class="c13 c11">
      <p class="c16"><span class="c14">Requerido</span></p>
    </td>
    <td class="c13 c11">
      <p class="c16"><span class="c14">Por defecto</span></p>
    </td>
  </tr>

  
  <tr class="c25">
    <td class="c19" colspan="3">
      <p class="c7">
        <span class="c14 c10">devices</span>
      </p>
    </td>
    <td class="c12">
      <p class="c7">
        <span class="c3">
          Los números de serie de los dispositivos que serán afectados.
        </span>
      </p>
    </td>
    <td class="c13">
      <p class="c16">
        <span class="c3">Array</span>
      </p>
    </td>
    <td class="c12">
      <p class="c7">
        <span class="c3">Máximo 25 dispositivos por request.</span>
      </p>
    </td>
    <td class="c8">
      <p class="c16">
        <span class="c3">Requerido</span>
      </p>
    </td>
    <td class="c8">
      <p class="c16">
        <span class="c3"></span>
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
          Preferencias que afectarán a los dispositivos.
        </span>
      </p>
    </td>
    <td class="c13">
      <p class="c16">
        <span class="c3">Object</span>
      </p>
    </td>
    <td class="c12"></td>
    <td class="c8">
      <p class="c16">
        <span class="c3">Requerido</span>
      </p>
    </td>
    <td class="c8"></td>
  </tr>

  
  <tr class="c25">
    <td class="c6"></td>

    <td class="c34" colspan="2">
      <p class="c7">
        <span class="c14 c10">is_kiosk_mode_enabled</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
          Activa o desactiva el modo kiosco en el dispositivo.
        </span>
      </p>
    </td>

    <td class="c13">
      <p class="c16">
        <span class="c3">Boolean</span>
      </p>
    </td>

    <td class="c12"></td>

    <td class="c8">
      <p class="c16">
        <span class="c3">Opcional</span>
      </p>
    </td>

    <td class="c8">
      <p class="c16">
        <span class="c3">false</span>
      </p>
    </td>
  </tr>

  
  <tr class="c25">
    <td class="c6"></td>

    <td class="c34" colspan="2">
      <p class="c7">
        <span class="c14 c10">timeout_seg</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
          Define el tiempo de inactividad, en segundos, antes de cancelar la orden.
        </span>
      </p>
    </td>

    <td class="c13">
      <p class="c16">
        <span class="c3">Integer</span>
      </p>
    </td>

    <td class="c12">
      <p class="c7">
        <span class="c3">
          Utiliza null para deshabilitar el tiempo de espera.
        </span>
      </p>
    </td>

    <td class="c8">
      <p class="c16">
        <span class="c3">Opcional</span>
      </p>
    </td>

    <td class="c8">
      <p class="c16">
        <span class="c3">null</span>
      </p>
    </td>
  </tr>

</table>
`}</HTMLBlock>

<br />

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip PinPad API - Kiosk Mode",
    "version": "1.0.0",
    "description": "API para habilitar o deshabilitar el modo kiosco en uno o varios dispositivos PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/devices": {
      "post": {
        "summary": "Configurar Preferencias ",
        "description": "Permite habilitar o deshabilitar el modo kiosco en uno o varios dispositivos PinPad. Es posible enviar hasta **25 dispositivos** por solicitud.",
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
                  "devices",
                  "preferences"
                ],
                "properties": {
                  "devices": {
                    "type": "array",
                    "description": "Lista de números de serie de los dispositivos PinPad.\n\nSe permite enviar un máximo de **25 dispositivos** por solicitud.\n",
                    "minItems": 1,
                    "maxItems": 25,
                    "items": {
                      "type": "string"
                    },
                    "example": [
                      "MyClipPosSerialNumber1",
                      "MyClipPosSerialNumber2"
                    ]
                  },
                  "preferences": {
                    "type": "object",
                    "description": "Configuración del modo kiosco.",
                    "required": [
                      "is_kiosk_mode_enabled",
                      "timeout_seg"
                    ],
                    "properties": {
                      "is_kiosk_mode_enabled": {
                        "type": "boolean",
                        "description": "Habilita o deshabilita el modo kiosco.\n\n- **true**: Activa el modo kiosco.\n- **false**: Desactiva el modo kiosco.\n",
                        "example": true
                      },
                      "timeout_seg": {
                        "type": "integer",
                        "format": "int32",
                        "minimum": 1,
                        "description": "Tiempo de espera, en segundos, antes de regresar automáticamente a la aplicación configurada en modo kiosco.\n\nEl valor debe expresarse en segundos.\n",
                        "example": 10
                      }
                    }
                  }
                }
              },
              "example": {
                "devices": [
                  "MyClipPosSerialNumber1",
                  "MyClipPosSerialNumber2"
                ],
                "preferences": {
                  "is_kiosk_mode_enabled": true,
                  "timeout_seg": 10
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Configuración aplicada correctamente."
          },
          "400": {
            "description": "La solicitud contiene parámetros inválidos."
          },
          "401": {
            "description": "No autorizado."
          },
          "500": {
            "description": "Error interno del servidor."
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
        "description": "Usa el formato: **Basic {TOKEN}**.\n\n⚠️ En el campo de credenciales de ReadMe escribe únicamente el token codificado en Base64.\n"
      }
    }
  }
}
```