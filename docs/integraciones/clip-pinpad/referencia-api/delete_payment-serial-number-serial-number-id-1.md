<!-- fuente: https://developer.clip.mx/reference/delete_payment-serial-number-serial-number-id-1 · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:20:58.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Eliminar Pago Por Número de Serie

Cancela un pago activo en un dispositivo PinPad utilizando su número de serie (`serial_number_id`).  

Este endpoint es útil cuando necesitas cancelar un pago sin tener el `pinpad_request_id`.

Si por alguna razón necesitas cancelar o eliminar una intención de pago, además de hacerlo utilizando el `pinpad_request_id `también podrás hacerlo utilizando el siguiente endpoint `DELETE` disponible pasando el parámetro `serial_number_id `como se muestra a continuación:

```json
curl --location --request DELETE 'https://api.payclip.io/f2f/pinpad/v1/payment/serial-number/{serial_number_id}' \
--header 'Authorization: Basic {TOKEN}' \
--data ''

```

> 🚧 Importante
>
> * Similar a la eliminación por [pinpad\_request\_id](https://developer.clip.mx/reference/delete_payment-pinpad-request-id-1) esto solo funcionará siempre y cuando el intento de pago aún no haya sido recogido por el terminal.
> * Si ese es el caso y aún así deseas cancelar el pago, aún puedes hacerlo cancelando el proceso dentro de la aplicación Pin Pad o cerrando completamente la aplicación.
> * Cuando current\_payment\_on\_transaction es diferente de null entonces la solicitud recién creada se encuentra en espera.
> * Si ese es el caso y aún así deseas cancelar el pago, aún puedes hacerlo cancelando el proceso dentro de la aplicación Pin Pad o cerrando completamente la aplicación.

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
    "title": "Clip PinPad API - Delete Payment - Serial Number",
    "version": "1.0.0",
    "description": "API para gestionar pagos en terminales PinPad."
  },
  "servers": [
    {
      "url": "https://api.payclip.io/f2f/pinpad/v1"
    }
  ],
  "paths": {
    "/payment/serial-number/{serial_number_id}": {
      "delete": {
        "summary": "Cancelar un pago en PinPad por número de serie",
        "description": "Cancela un pago activo en un dispositivo PinPad utilizando su número de serie (`serial_number_id`).  \n\nEste endpoint es útil cuando necesitas cancelar un pago sin tener el `pinpad_request_id`.\n",
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
            "name": "serial_number_id",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Parámetro en la URL que indica el serial number id del dispositivo.",
            "example": "P8220724000042"
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
                      "type": "number",
                      "format": "float",
                      "description": "Monto de la transacción cancelada.",
                      "example": 1000
                    },
                    "serial_number_pos": {
                      "type": "string",
                      "description": "Número de serie del Lector Clip.",
                      "example": "P8220724000042"
                    },
                    "current_payment_on_transaction": {
                      "type": "string",
                      "nullable": true,
                      "description": "Identificador de la transacción en curso, si existe.",
                      "example": null
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
                      "example": "PAYMENT_PENDING"
                    },
                    "message": {
                      "type": "string",
                      "example": "El dispositivo tiene un pago pendiente en curso"
                    },
                    "data": {
                      "type": "object",
                      "properties": {
                        "current_payment_on_transaction": {
                          "type": "string",
                          "nullable": true,
                          "example": null
                        },
                        "payment_enqueued": {
                          "type": "string",
                          "nullable": true,
                          "example": null
                        }
                      }
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