<!-- fuente: https://developer.clip.mx/reference/get_payment · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:20:46.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Consultar Detalle de un Pago en PinPad

Obtiene la información de un pago en PinPad a partir de su `pinpadRequestId`.  
Puedes incluir el encabezado opcional `Pinpad-Include-Detail: true` para obtener información más detallada del pago.

Para obtener la información detallada de la transacción, es necesario incluir el siguiente header en la petición:

```json
Pinpad-Include-Detail: true
```

## Ejemplo de cURL

```json
curl --location 'https://api.payclip.io/f2f/pinpad/v1/payment?pinpadRequestId=pinpad-0d08e174-d7ca-4773-8ead-894bf7067bd0' \
--header 'Authorization: Basic ...' \
--header 'Pinpad-Include-Detail: true'

```

Cuando el header Pinpad-Include-Detail está presente en la solicitud, la respuesta incluirá el campo detail, el cual contiene información detallada de la transacción, incluyendo los siguientes datos:

```json
{
    "pinpad_request_id": "pinpad-0d08e174-d7ca-4773-8ead-894bf7067bd0",
    "reference": "testpinpad-000211",
    "amount": "1.20",
    "amount_paid": "3.10",
    "tip_amount": "0.00",
    "create_date": "2025-02-20T15:32:26.432",
    "status": "COMPLETED",
    "detail": {
        "pages": {
            "size": 50,
            "number": 1,
            "total": 1,
            "total_results": 4
        },
        "results": [
            {
                "id": "7bd5f8a2-f230-410e-b4f5-1006f285b755",
                "transaction_id": "f473b6eb-a71e-480b-82a3-2e851188c46f",
                "type": "pos",
                "entry_mode": "qps",
                "amount": 0.5,
                "tip_amount": 0,
                "amount_refunded": 0,
                "installment_amount": 0.5,
                "installments": 1,
                "capture_method": "automatic",
                "net_amount": 0,
                "paid_amount": 0.5,
                "status": "approved",
                "approved_at": "2025-02-20T15:33:22Z",
                "currency": "MXN",
                "merchant_id": "27d8f6ba-9822-4b2d-9968-fb238b2c6dd5",
                "payment_method": {
                    "id": "master",
                    "type": "credit_card",
                    "card": {
                        "bin": "549949",
                        "issuer": "CITIBANAMEX",
                        "last_digits": "8356",
                        "exp_year": "26",
                        "exp_month": "08"
                    }
                },
                "device": {
                    "id": "P8C1231120001152",
                    "type": "Si",
                    "manufacturer": "KOZEN"
                }
            }
        ]
    }
}

```

## Consideraciones clave

* Si el header **Pinpad-Include-Detai**l no se incluye en la solicitud, el campo **detail** no aparecerá en la respuesta.
* El campo **detail results** podría incluir varias transacciones relacionadas con el pago principal.

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
    "title": "Clip PinPad API - Status Transaction - True",
    "version": "1.0.0",
    "description": "API para gestionar pagos en terminales PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/payment": {
      "get": {
        "summary": "Consultar detalle de un pago en PinPad",
        "description": "Obtiene la información de un pago en PinPad a partir de su `pinpadRequestId`.  \nPuedes incluir el encabezado opcional `Pinpad-Include-Detail: true` para obtener información más detallada del pago.\n",
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
            "in": "query",
            "name": "pinpadRequestId",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "ID de la solicitud del pago (`pinpad_request_id`) generado al crear el pago.",
            "example": "pinpad-0d08e174-d7ca-4773-8ead-894bf7067bd0"
          },
          {
            "in": "header",
            "name": "Pinpad-Include-Detail",
            "required": false,
            "schema": {
              "type": "boolean"
            },
            "description": "Si se envía con valor `true`, se devuelve información adicional del pago.",
            "example": true
          }
        ],
        "responses": {
          "200": {
            "description": "Información del pago encontrada",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "pinpad_request_id": {
                      "type": "string",
                      "description": "Identificador único de la solicitud de pago en PinPad."
                    },
                    "reference": {
                      "type": "string",
                      "description": "Referencia externa asociada al pago."
                    },
                    "amount": {
                      "type": "string",
                      "description": "Monto total solicitado en la transacción."
                    },
                    "amount_paid": {
                      "type": "string",
                      "description": "Monto total que fue pagado."
                    },
                    "tip_amount": {
                      "type": "string",
                      "description": "Monto de la propina asociada al pago."
                    },
                    "create_date": {
                      "type": "string",
                      "format": "date-time",
                      "description": "Fecha de creación de la solicitud de pago."
                    },
                    "status": {
                      "type": "string",
                      "description": "Estado actual del pago (ej. COMPLETED, PENDING, FAILED)."
                    },
                    "detail": {
                      "type": "object",
                      "description": "Información detallada del pago.",
                      "properties": {
                        "pages": {
                          "type": "object",
                          "properties": {
                            "size": {
                              "type": "integer",
                              "description": "Número de elementos por página."
                            },
                            "number": {
                              "type": "integer",
                              "description": "Número de página actual."
                            },
                            "total": {
                              "type": "integer",
                              "description": "Total de páginas."
                            },
                            "total_results": {
                              "type": "integer",
                              "description": "Total de resultados encontrados."
                            }
                          }
                        },
                        "results": {
                          "type": "array",
                          "description": "Lista de transacciones relacionadas con el pago.",
                          "items": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "description": "Identificador único del resultado."
                              },
                              "transaction_id": {
                                "type": "string",
                                "description": "ID de la transacción asociada."
                              },
                              "type": {
                                "type": "string",
                                "description": "Tipo de transacción (ej. pos)."
                              },
                              "entry_mode": {
                                "type": "string",
                                "description": "Método de entrada (ej. qps)."
                              },
                              "amount": {
                                "type": "number",
                                "description": "Monto procesado en esta transacción."
                              },
                              "tip_amount": {
                                "type": "number",
                                "description": "Monto de propina en esta transacción."
                              },
                              "amount_refunded": {
                                "type": "number",
                                "description": "Monto devuelto en esta transacción."
                              },
                              "installment_amount": {
                                "type": "number",
                                "description": "Monto de cada cuota en caso de MSI/MCI."
                              },
                              "installments": {
                                "type": "integer",
                                "description": "Número de cuotas."
                              },
                              "capture_method": {
                                "type": "string",
                                "description": "Método de captura."
                              },
                              "net_amount": {
                                "type": "number",
                                "description": "Monto neto recibido."
                              },
                              "paid_amount": {
                                "type": "number",
                                "description": "Monto pagado."
                              },
                              "status": {
                                "type": "string",
                                "description": "Estado de la transacción."
                              },
                              "approved_at": {
                                "type": "string",
                                "format": "date-time",
                                "description": "Fecha y hora de aprobación."
                              },
                              "currency": {
                                "type": "string",
                                "description": "Moneda de la transacción."
                              },
                              "merchant_id": {
                                "type": "string",
                                "description": "ID del comercio asociado."
                              },
                              "payment_method": {
                                "type": "object",
                                "properties": {
                                  "id": {
                                    "type": "string",
                                    "description": "Identificador del método de pago."
                                  },
                                  "type": {
                                    "type": "string",
                                    "description": "Tipo de método de pago (ej. credit_card)."
                                  },
                                  "card": {
                                    "type": "object",
                                    "properties": {
                                      "bin": {
                                        "type": "string",
                                        "description": "BIN de la tarjeta."
                                      },
                                      "issuer": {
                                        "type": "string",
                                        "description": "Emisor de la tarjeta."
                                      },
                                      "last_digits": {
                                        "type": "string",
                                        "description": "Últimos 4 dígitos de la tarjeta."
                                      },
                                      "exp_year": {
                                        "type": "string",
                                        "description": "Año de expiración."
                                      },
                                      "exp_month": {
                                        "type": "string",
                                        "description": "Mes de expiración."
                                      }
                                    }
                                  }
                                }
                              },
                              "device": {
                                "type": "object",
                                "properties": {
                                  "id": {
                                    "type": "string",
                                    "description": "ID del dispositivo."
                                  },
                                  "type": {
                                    "type": "string",
                                    "description": "Tipo de dispositivo."
                                  },
                                  "manufacturer": {
                                    "type": "string",
                                    "description": "Fabricante del dispositivo."
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
                "example": {
                  "pinpad_request_id": "pinpad-0d08e174-d7ca-4773-8ead-894bf7067bd0",
                  "reference": "testpinpad-000211",
                  "amount": "1.20",
                  "amount_paid": "3.10",
                  "tip_amount": "0.00",
                  "create_date": "2025-02-20T15:32:26.432",
                  "status": "COMPLETED",
                  "detail": {
                    "pages": {
                      "size": 50,
                      "number": 1,
                      "total": 1,
                      "total_results": 4
                    },
                    "results": [
                      {
                        "id": "7bd5f8a2-f230-410e-b4f5-1006f285b755",
                        "transaction_id": "f473b6eb-a71e-480b-82a3-2e851188c46f",
                        "type": "pos",
                        "entry_mode": "qps",
                        "amount": 0.5,
                        "tip_amount": 0,
                        "amount_refunded": 0,
                        "installment_amount": 0.5,
                        "installments": 1,
                        "capture_method": "automatic",
                        "net_amount": 0,
                        "paid_amount": 0.5,
                        "status": "approved",
                        "approved_at": "2025-02-20T15:33:22Z",
                        "currency": "MXN",
                        "merchant_id": "27d8f6ba-9822-4b2d-9968-fb238b2c6dd5",
                        "payment_method": {
                          "id": "master",
                          "type": "credit_card",
                          "card": {
                            "bin": "549949",
                            "issuer": "CITIBANAMEX",
                            "last_digits": "8356",
                            "exp_year": "26",
                            "exp_month": "08"
                          }
                        },
                        "device": {
                          "id": "P8C1231120001152",
                          "type": "Si",
                          "manufacturer": "KOZEN"
                        }
                      }
                    ]
                  }
                }
              }
            }
          },
          "404": {
            "description": "No se encontró el `pinpadRequestId`",
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
                  "code": "PAYMENT_NOT_FOUND",
                  "message": "Payment not found, check your query params"
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
        "description": "Usa el formato: **Basic {TOKEN}**  \n⚠️ En el campo de credenciales en ReadMe escribe **solo el token base64**  \n(ejemplo: `MTZjNjI4NDAtOTkwMy00ZjU5LWE4MTAtODE4YjI2NWUyZTk0Om...`)\n"
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```