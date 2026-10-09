<!-- fuente: https://developer.clip.mx/reference/deposit · capturado 2026-10-08 -->

---
updatedAt: 2026-04-28T20:34:52.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Obtener reporte desglosado de depósitos

Genera un reporte con los detalles del depósito basado en su **Settlement Report ID**.

Este endpoint devuelve los detalles completos de un depósito individual, incluyendo los pagos que lo componen, cargos, propinas, método de pago, entre otros.

> 🚧 Importante
>
> No se debe utilizar el settlement\_report\_id como parámetro en la URL.
>
> El valor correcto es un UUID que se obtiene desde la propiedad links.self.href del objeto cuando se llama al endpoint:
>
> GET /settlements?from=\{fecha\_inicio}\&to=\{fecha\_fin}

***

## Ejemplo de flujo de uso

* Realiza una llamada al endpoint [obtener resumen de depósitos por periodo](https://developer.clip.mx/reference/settlements)

```json
GET /settlements?from=2025-03-01&to=2025-03-10
```

> Esto genera un **listado resumido de depósitos** realizados en el periodo indicado. Es ideal para obtener una **visión general** y localizar depósitos específicos a detallar.

* En la respuesta,  identifica el `href` dentro del objeto `links.self`

```json
"links": {
  "self": {
    "href": "/settlements/e3e5116c-639b-41da-b3bf-202c8c5d7834"
  }
}
```

> Este `href` contiene el **UUID único** que identifica ese depósito en particular. Es un valor esencial para obtener el **detalle completo del depósito**

* Copia el UUID del `href` y realiza una nueva llamada para obtener el detalle

```json
GET /settlements/e3e5116c-639b-41da-b3bf-202c8c5d7834
```

> Esta llamada retornará un **reporte exhaustivo del depósito**

```json
{
  "settlement": {
    "settlement_report_id": "W472RZQKV",
    "merchant_name": "Clip",
    "disbursement_date": "2022-01-13",
    "gross_amount": 9300,
    "disbursed_net_amount": 8911.62,
    "total_transactions": 22,
    "details": [
      {
        "date": "2022-01-10",
        "payments": [
          {
            "receipt_no": "liNzWOR",
            "payment_date": "2022-01-10",
            "amount": 100,
            "terms": null,
            "charges": {
              "charge": {
                "fee": 3.6,
                "tax": 0.58
              }
            },
            "tip": 0,
            "total_retention": 4.18,
            "settled_amount": 95.82,
            "payment_method": "Credit",
            "card": {
              "brand": "Mastercard",
              "last4": 4352,
              "issuer": "BANAMEX"
            },
            "merchant_invoice": null,
            "user_email": "user@example.com"
          }
        ]
      }
    ]
  },
  "links": {
    "next": {
      "href": "/settlements/GHWRWSFLW?page_size=1&page=eyJjb21wbZSJ9fX0=",
      "method": "GET"
    }
  }
}
```

***

## Errores comunes

<HTMLBlock>{`
<table class="c27">
  <tr class="c30">
    <td class="c29 c11" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c17">C&oacute;digo HTTP</span>
      </p>
    </td>

    <td class="c2 c11" colspan="1" rowspan="1">
      <p class="c16">
       
        <span class="c14 c17">Response</span>
      </p>
    </td>
    <td class="c24 c11" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c14 c17">Description</span>
      </p>
    </td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">400</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">settlement_id Invalid pattern</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Se usó un settlement_report_id en vez de un UUID válido</span>
      </p>
    </td>
    
  </tr>
  


  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">401</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Unauthorized</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Falta el token de autenticación</span>
      </p>
    </td>
    
  </tr>
  
  
</table>
`}</HTMLBlock>

***

## Llamada de prueba

Puedes realizar una llamada de prueba llenando los campos necesarios en el formulario que se muestra abajo.

Recuerda que necesitas tu [*token de autenticación*](https://developer.clip.mx/reference/token-de-autenticacion) para realizar las llamadas a la API.

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
    "/settlements/{settlement_report_id}": {
      "get": {
        "tags": [
          "Depósitos"
        ],
        "summary": "Obtener reporte desglosado de depósitos",
        "description": "Genera un reporte con los detalles del depósito basado en su **Settlement Report ID**.",
        "operationId": "deposit",
        "security": [
          {
            "ApiKeyAuth": []
          }
        ],
        "parameters": [
          {
            "name": "settlement_report_id",
            "in": "path",
            "description": "ID del depósito a detallar.\n\nEste parámetro se obtiene de la respuesta del endpoint **GET /settlements**.\n",
            "required": true,
            "style": "simple",
            "explode": false,
            "schema": {
              "type": "string",
              "default": "e3e5116c-639b-41da-b3bf-202c8c5d7834"
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "Número de elementos a mostrar por página. El valor máximo de elementos por página es de 100.",
            "required": false,
            "explode": false,
            "schema": {
              "type": "integer",
              "maximum": 100,
              "minimum": 1,
              "default": 100
            },
            "example": 50
          },
          {
            "name": "paging",
            "in": "query",
            "description": "Token de paginación requerido cuando los elementos a mostrar exceden el tamaño de paginación definido en el parámetro <code>paging</code>.",
            "required": false,
            "explode": false,
            "schema": {
              "type": "string",
              "default": "Mg=="
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Solicitud exitosa. La respuesta contiene un objeto del tipo settlement.",
            "content": {
              "application/vnd.com.payclip.v2+json": {
                "example": {
                  "settlement": {
                    "settlement_report_id": "W472RZQKV",
                    "merchant_name": "Clip",
                    "disbursement_date": "2022-01-13",
                    "gross_amount": 9300,
                    "disbursed_net_amount": 8911.62,
                    "total_transactions": 22,
                    "details": [
                      {
                        "date": "2022-01-10",
                        "payments": [
                          {
                            "receipt_no": "liNzWOR",
                            "payment_date": "2022-01-10",
                            "amount": 100,
                            "terms": null,
                            "charges": {
                              "charge": {
                                "fee": 3.6,
                                "tax": 0.58
                              }
                            },
                            "tip": 0,
                            "total_retention": 4.18,
                            "settled_amount": 95.82,
                            "payment_method": "Credit",
                            "card": {
                              "brand": "Mastercard",
                              "last4": 4352,
                              "issuer": "BANAMEX"
                            },
                            "merchant_invoice": null,
                            "user_email": "user@example.com"
                          }
                        ]
                      }
                    ]
                  },
                  "links": {
                    "next": {
                      "href": "/settlements/GHWRWSFLW?page_size=1&page=eyJjb21wbZSJ9fX0=",
                      "method": "GET"
                    }
                  }
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