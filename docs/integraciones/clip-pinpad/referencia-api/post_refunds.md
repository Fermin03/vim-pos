<!-- fuente: https://developer.clip.mx/reference/post_refunds · capturado 2026-10-08 -->

---
updatedAt: 2026-04-27T18:35:11.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Solicitar el reembolso de una transacción

Crea un reembolso **Total** o **Parcial** de un pago previamente **Aprobado**.

<br />

> 🚧 Importante
>
> * Para poder hacer solicitudes a la API de Checkout, necesitas tener un [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) y una [cuenta de Clip](https://developer.clip.mx/docs/cuenta-de-clip).
> * Solo se permite un tipo de referencia por solicitud:- `transaction`- `receipt`.
> * Para poder integrar la API de Checkout en tu ecommerce, es recomendable ser desarrollador fullstack.

Completa la sección de **BODY PARAMS** ubicada a continuación y presiona el botón **Try it!**. La llamada de solicitud se llenará automáticamente con la información que le proporciones.

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip Refunds API",
    "version": "1.0.0",
    "description": "API para gestionar reembolsos de pagos previamente procesados."
  },
  "servers": [
    {
      "url": "https://api.payclip.com"
    }
  ],
  "paths": {
    "/refunds": {
      "post": {
        "summary": "Solicitar el reembolso de una transacción",
        "description": "Crea un reembolso **Total** o **Parcial** de un pago previamente **Aprobado**.",
        "tags": [
          "API de Refunds"
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
                  "reason",
                  "reference"
                ],
                "properties": {
                  "amount": {
                    "type": "number",
                    "format": "float",
                    "description": "Monto a reembolsar.",
                    "example": 0.01
                  },
                  "reason": {
                    "type": "string",
                    "description": "Motivo del reembolso.",
                    "example": "Articulo Defectuoso"
                  },
                  "reference": {
                    "type": "object",
                    "required": [
                      "type",
                      "id"
                    ],
                    "properties": {
                      "type": {
                        "type": "string",
                        "enum": [
                          "transaction",
                          "receipt"
                        ],
                        "example": "transaction"
                      },
                      "id": {
                        "type": "string",
                        "example": "c4e4294d-3cfb-4c6d-bff1-a66edd15d1c8"
                      }
                    }
                  }
                }
              },
              "examples": {
                "ReembolsoPorTransaction": {
                  "value": {
                    "reference": {
                      "type": "transaction",
                      "id": "c4e4294d-3cfb-4c6d-bff1-a66edd15d1c8"
                    },
                    "amount": 0.01,
                    "reason": "Articulo Defectuoso"
                  }
                },
                "ReembolsoPorReceipt": {
                  "value": {
                    "reference": {
                      "type": "receipt",
                      "id": "PigbE6lU"
                    },
                    "amount": 80.5,
                    "reason": "Articulo Defectuoso"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Reembolso creado exitosamente",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Unable to process the request. Required fields are missing.",
            "content": {
              "application/json": {}
            }
          },
          "403": {
            "description": "Unauthorized",
            "content": {
              "application/json": {}
            }
          },
          "404": {
            "description": "El pago no existe o no es elegible para reembolso",
            "content": {
              "application/json": {}
            }
          },
          "409": {
            "description": "Conflicto con reglas de validación del reembolso",
            "content": {
              "application/json": {}
            }
          },
          "500": {
            "description": "Error interno en el servidor",
            "content": {
              "application/json": {}
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