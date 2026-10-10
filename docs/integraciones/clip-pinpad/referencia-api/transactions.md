<!-- fuente: https://developer.clip.mx/reference/transactions · capturado 2026-10-08 -->

---
updatedAt: 2026-09-04T17:29:53.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obtener detalles de una lista de transacciones

Regresa una lista de transacciones definida por un rango de fechas. 

Recuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

Completa la sección de **QUERY PARAMS** ubicada a continuación y la llamada de solicitud se llenará automáticamente con la información que le proporciones para realizar tu primera llamada.

Presiona el botón **Try it!** y listo, realizaste tu primera llamada a la API de Transacciones.

<Callout icon="🚧" theme="warn">
  ### Importante

  Límite en el rango de fechas de consulta

  - **La diferencia entre las fechas** `from` y `to` no debe exceder las 720 horas (30 días exactos).
  - **Para consultar un mes completo**: Puedes enviar de día 1 a día 31 siempre que utilices la misma hora exacta en ambos parámetros (ej. from=2026-07-01T18:44:41.000Z & to=2026-07-31T18:44:41.000Z). Si consultas desde T00:00:00 del día 1 hasta T23:59:59 del día 31, excederás las 720 horas y la API devolverá un error `400 Bad Request`.
  - **Para consultar periodos mayores a 30 días**: Realiza la extracción por bloques de fechas.
  - **Para obtener todos los resultados del mismo rango**: Si la respuesta incluye un valor en `meta.pagination_token`, vuelve a llamar al endpoint enviando `pagination_token=TU_TOKEN `para obtener los siguientes registros.
</Callout>

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
    "/payments": {
      "get": {
        "tags": [
          "Transacciones"
        ],
        "summary": "Obtener detalles de una lista de transacciones",
        "description": "Regresa una lista de transacciones definida por un rango de fechas. \n\nRecuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.",
        "operationId": "transactions",
        "security": [
          {
            "ApiKeyAuth": []
          }
        ],
        "parameters": [
          {
            "name": "from",
            "in": "query",
            "description": "Fecha de inicio a consultar",
            "required": true,
            "schema": {
              "type": "string",
              "format": "date-time",
              "default": "2022-07-01T18:44:41.000Z"
            }
          },
          {
            "name": "to",
            "in": "query",
            "description": "Fecha de fin a consultar",
            "required": true,
            "schema": {
              "type": "string",
              "format": "date-time",
              "default": "2022-07-02T18:44:41.000Z"
            }
          },
          {
            "name": "status",
            "in": "query",
            "description": "Estado de la transacción. Posibles valores: Paid, Cancelled.",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "paid",
                "cancelled"
              ]
            }
          },
          {
            "name": "last4",
            "in": "query",
            "description": "Últimos 4 dígitos del número de tarjeta",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "limit",
            "in": "query",
            "description": "Número de elementos por página",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 20,
              "maximum": 100
            }
          },
          {
            "name": "pagination_token",
            "in": "query",
            "description": "Token de paginación",
            "required": false,
            "schema": {
              "type": "string",
              "format": "base64"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Solicitud exitosa. La respuesta contiene un objeto con los detalles de la lista de transacciones.",
            "content": {
              "application/vnd.com.payclip.v2+json": {
                "example": {
                  "items": [
                    {
                      "receipt_no": "WpJi058",
                      "created_at": "2022-07-30T18:52:42Z",
                      "location": {
                        "longitude": "-103.3657798",
                        "latitude": "20.7009265"
                      },
                      "user_email": "test@example.com",
                      "status": "Paid",
                      "payment_method": "CREDIT",
                      "sub_type": "EMV_SIGNATURE",
                      "card": {
                        "brand": "MC",
                        "issuer": "BANAMEX",
                        "last4": "4352"
                      },
                      "currency": "MXN",
                      "terms": null,
                      "amount": "150.00",
                      "tip": "0.00",
                      "total": "150.00",
                      "merchant_invoice": ""
                    }
                  ],
                  "query": {
                    "pagination_token": "",
                    "limit": "1",
                    "from": "2022-07-01T10:10:50Z",
                    "to": "2022-08-01T07:32:50Z",
                    "last4": "1234",
                    "status": "Approved"
                  },
                  "response_messages": [],
                  "meta": {
                    "limit": "1",
                    "pagination_token": "Mg==",
                    "from": "2022-07-01T10:10:50Z",
                    "to": "2022-08-01T07:32:50Z",
                    "item_type": "Payment"
                  }
                }
              }
            }
          },
          "400": {
            "description": "Parámetros de consulta incorrectos.",
            "content": {
              "application/vnd.com.payclip.v2+json": {
                "example": {
                  "items": [],
                  "query": {
                    "pagination_token": "",
                    "limit": "12",
                    "from": "2019-09-25T04:38:00Z",
                    "to": "2019-10-23"
                  },
                  "response_messages": [
                    {
                      "severity": "error",
                      "code": "payclip.bad.request",
                      "text": "bad request"
                    }
                  ],
                  "meta": {
                    "limit": "12",
                    "pagination_token": "",
                    "from": "2019-09-25T04:38:00Z",
                    "to": "2019-10-23",
                    "item_type": "Payment"
                  }
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
            "description": "Not Found."
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