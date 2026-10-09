<!-- fuente: https://developer.clip.mx/reference/transaction · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:15:55.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obtener detalles de una transacción individual

Regresa una transacción individual por su ID <code>receipt_no</code>. 

Recuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

Completa la sección de **PATH PARAMS** ubicada a continuación y la llamada de solicitud se llenará automáticamente con la información que le proporciones para realizar tu primera llamada.

Presiona el botón **Try it!** y listo, realizaste tu primera llamada a la API de Transacciones.

> 🚧 Importante
>
> Recuerda que necesitas incluir tu [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "API de transacciones",
    "description": "La API de Transacciones esta diseñada para obtener la información referente a las transacciones individuales.",
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
      "name": "Transacciones",
      "description": "El recurso de **API de transacciones** permite obtener los detalles de una o más transacciones. Una transacción individual se identifica por su número de recibo **receipt_no**. Una lista de transacciones se define por un rango de fechas específico.\nEl objeto **payment** muestra la información relacionada a una transacción individual. Contiene detalles del lugar en que se realiza el pago, método de pago, estado actual de la transacción y fecha. "
    }
  ],
  "paths": {
    "/payments/receipt-no/{receipt_no}": {
      "get": {
        "tags": [
          "Transacciones"
        ],
        "summary": "Obtener detalles de una transacción individual",
        "description": "Regresa una transacción individual por su ID <code>receipt_no</code>. \n\nRecuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.\n",
        "operationId": "Transaction",
        "security": [
          {
            "ApiKeyAuth": []
          }
        ],
        "parameters": [
          {
            "name": "receipt_no",
            "in": "path",
            "description": "Número de identificación para la transacción.",
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "string",
                  "default": "5mUV5Dt"
                }
              }
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Solicitud exitosa. La respuesta contiene un objeto con los detalles de transacción.",
            "content": {
              "application/vnd.com.payclip.v1+json": {
                "example": {
                  "query": {
                    "receipt_no": "1iNzWOR"
                  },
                  "meta": {
                    "item_type": "payment"
                  },
                  "item": {
                    "receipt_no": "1iNzWOR",
                    "created_at": "2022-01-10T14:36:13.745Z",
                    "location": {
                      "latitude": -111.9060182,
                      "longitude": 111.9060182
                    },
                    "status": "Paid",
                    "amount": 200,
                    "currency": "MXN",
                    "terms": null,
                    "tip": 0,
                    "total": 200,
                    "payment_method": "Credit",
                    "sub_type": "SWIPE",
                    "card": {
                      "brand": "MasterCard",
                      "last4": "4352",
                      "issuer": "BANAMEX"
                    },
                    "merchant_invoice": null,
                    "user_email": "test@example.com"
                  },
                  "response_messages": []
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized."
          },
          "403": {
            "description": "Forbidden."
          },
          "404": {
            "description": "Parámetro de ruta incorrecto.",
            "content": {
              "application/vnd.com.payclip.v1+json": {
                "example": {
                  "query": {
                    "receipt_no": "1iNzWOR"
                  },
                  "meta": null,
                  "item": null,
                  "response_messages": [
                    {
                      "severity": "Error",
                      "code": "payclip.not.found",
                      "text": "Could not find the receipt no."
                    }
                  ]
                }
              }
            }
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
        "name": "Authorization"
      }
    }
  }
}
```