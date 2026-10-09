<!-- fuente: https://developer.clip.mx/reference/settlements · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:15:58.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obtener resumen de depósitos por periodo

Genera la información de depósitos realizados en el periodo definido en los parámetros. El periodo no puede ser mayor a tres meses de antiguedad (90 días). 
Recuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

Completa la sección de **QUERY PARAMS** ubicada a continuación y la llamada de solicitud se llenará automáticamente con la información que le proporciones para realizar tu primera llamada.

Presiona el botón **Try it!** y listo, realizaste tu primera llamada a la API de depósitos.

> 🚧 Importante
>
> Recuerda que necesitas incluir tu [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "API de depósitos",
    "description": "Settlement API esta diseñado para obtener la información referente a los depósitos realizados en un rango de hasta 90 días. De la misma manera y con la información de los depósitos consultados se puede obtener el detalle de sus transacciones.",
    "contact": {
      "name": "API Support",
      "email": "developers@clip.mx"
    },
    "license": {
      "name": "Apache 2.0",
      "url": "http://www.apache.org/licenses/LICENSE-2.0.html"
    },
    "version": "1.0.0"
  },
  "x-explorer-enabled": true,
  "x-samples-enabled": true,
  "x-proxy-enabled": true,
  "servers": [
    {
      "description": "URL base del ambiente de producción.",
      "url": "https://api-gw.payclip.com/"
    }
  ],
  "tags": [
    {
      "name": "Depósitos",
      "description": "La API de Depósitos esta diseñada para obtener la información referente a los depósitos realizados en los últimos 90 días. De la misma manera y con la información de los depósitos consultados se puede obtener un reporte detallado de sus transacciones.\n"
    }
  ],
  "paths": {
    "/settlements": {
      "get": {
        "tags": [
          "Depósitos"
        ],
        "summary": "Obtener resumen de depósitos por periodo",
        "description": "Genera la información de depósitos realizados en el periodo definido en los parámetros. El periodo no puede ser mayor a tres meses de antiguedad (90 días). \nRecuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.",
        "operationId": "settlements",
        "security": [
          {
            "ApiKeyAuth": []
          }
        ],
        "parameters": [
          {
            "name": "from",
            "in": "query",
            "description": "La fecha de inicio no puede ser mayor a 90 días anteriores a la fecha actual. La fecha del parámetro <code>from</code> es de carácter inclusivo. \n\nLa fecha del día actual es parte de los 90 días del periodo máximo de consulta permitido.\n",
            "required": true,
            "style": "form",
            "explode": true,
            "schema": {
              "type": "string",
              "format": "date",
              "default": "2023-08-14"
            }
          },
          {
            "name": "to",
            "in": "query",
            "description": "La fecha de fin tiene que ser igual o posterior a la fecha de inicio en el parámetro <code>from</code>. \n\nLa fecha del parámetro <code>to</code> es de carácter inclusivo. \n",
            "required": true,
            "style": "form",
            "explode": true,
            "schema": {
              "type": "string",
              "format": "date",
              "default": "2023-09-14"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Solicitud exitosa. La respuesta contiene un objeto del tipo settlements.",
            "content": {
              "application/vnd.com.payclip.v2+json": {
                "example": {
                  "settlements": [
                    {
                      "disbursement_date": "2022-01-13",
                      "settlement_report_id": "W472RZQKV",
                      "gross_amount": 9300,
                      "total_fee": 360,
                      "total_tax": 62.14,
                      "total_retention": 388.38,
                      "disbursed_net_amount": 8911.62,
                      "total_transactions": 22,
                      "links": {
                        "self": {
                          "href": "/settlements/W472RZQKV",
                          "method": "GET"
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          "400": {
            "description": "Bad request."
          },
          "401": {
            "description": "Unauthorized."
          },
          "403": {
            "description": "Forbidden."
          },
          "500": {
            "description": "Internal Server Error."
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "x-api-key"
      }
    }
  }
}
```