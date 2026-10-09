<!-- fuente: https://developer.clip.mx/reference/get_refunds-refund-id · capturado 2026-10-08 -->

---
updatedAt: 2026-04-29T00:15:21.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Consultar la información de un reembolso

Consulta información detallada de un reembolso.

<br />

> 🚧 Importante
>
> * Para poder hacer solicitudes a la API de Checkout, necesitas tener un [token de autenticación](https://developer.clip.mx/reference/token-de-autenticacion) y una [cuenta de Clip](https://developer.clip.mx/docs/cuenta-de-clip).
> * Para poder integrar la API de Checkout en tu ecommerce, es recomendable ser desarrollador fullstack.

***

## Ejemplo de flujo de uso

* Primero [solicita el reembolso de una transacción](https://developer.clip.mx/reference/post_refunds)

La API respondió ejemplo:

```json
{
  "id": "f2dcbfab-5192-4b0a-9a5d-19da2a62acdf",
  "transaction_id": "31edbd7f-f6d1-46d1-b6ba-a4561a1102d3",
  "status": "approved",
  "status_message": "Refunded",
  ...
}
```

* Para consultar el estado del reembolso, usa ese `refund_id`

```json
id": "f2dcbfab-5192-4b0a-9a5d-19da2a62acdf"
```

> Esta llamada permite conocer el estado actual del reembolso en cualquier momento.

> 🚧 Importante
>
> En este flujo no interviene el `payment_request_id`.

* La respuesta te devuelve el detalle completo del reembolso

```json
{
  "id": "f2dcbfab-5192-4b0a-9a5d-19da2a62acdf",
  "transaction_id": "31edbd7f-f6d1-46d1-b6ba-a4561a110000",
  "status": "approved",
  "status_message": "Refunded",
  "amount": "0.05",
  "receipt_no": "Rf5ey7xZ",
  "created_at": "202-04-28T18:18:45.746252165Z",
  "currency": "MXN",
  "reference": {
    "type": "transaction",
    "id": "bb8e48df-e267-47bf-a64a-d26301900000"
  },
  "reason": "Articulo Defectuoso"
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
       
        <span class="c14 c17">Error code</span>
      </p>
    </td>
    <td class="c2 c11" colspan="1" rowspan="1">
      <p class="c16">
       
        <span class="c14 c17">Message</span>
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
        <span class="c14 c10">401</span>
      </p>
    </td>
<td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Unauthorized</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Unauthorized</span>
      </p>
    </td>
    
  </tr>
  
  
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">404</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">CL1301</span>
      </p>
    </td>

 <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not Found</span>
      </p>
    </td>

    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Payment not found</span>
      </p>
    </td>
  </tr>
  
  
  
    
  
  <tr class="c25">
    <td class="c29" colspan="2" rowspan="1">
      <p class="c16">
        <span class="c14 c10">404</span>
      </p>
    </td>
<td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AI4040</span>
      </p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not found</span>
      </p>
    </td>
    <td class="c21" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Refund ID does not exist</span>
      </p>
    </td>
    
  </tr>
  
  
</table>
`}</HTMLBlock>

***

## Llamada de prueba

Completa la sección de **PATH PARAMS** ubicada a continuación y presiona el botón **Try it!**. La llamada de solicitud se llenará automáticamente con la información que le proporciones

# OpenAPI definition

```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "Clip Refunds API - Get Refund",
    "version": "1.0.0",
    "description": "API para consultar el estado de un reembolso previamente creado."
  },
  "servers": [
    {
      "url": "https://api.payclip.com"
    }
  ],
  "paths": {
    "/refunds/{refund_id}": {
      "get": {
        "summary": "Consultar la información de un reembolso",
        "description": "Consulta información detallada de un reembolso.",
        "tags": [
          "API de Refunds"
        ],
        "security": [
          {
            "basicAuthHeader": []
          }
        ],
        "parameters": [
          {
            "in": "path",
            "name": "refund_id",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Número de identificación de la transacción del reembolso.",
            "example": "af4e688f-95a3-44c1-a9d0-c11dcd35365d"
          }
        ],
        "responses": {
          "200": {
            "description": "Información del reembolso obtenida exitosamente",
            "content": {
              "application/json": {
                "example": {
                  "id": "af4e688f-95a3-44c1-a9d0-c11dcd35365d",
                  "transaction_id": "87a6a7f0-0488-4ed2-8d01-91d19a97057b",
                  "status": "approved",
                  "status_message": "Refunded",
                  "amount": "0.01",
                  "receipt_no": "RFrK3hJ2",
                  "created_at": "2026-04-27T18:06:23.803635718Z",
                  "currency": "MXN",
                  "reference": {
                    "type": "transaction",
                    "id": "bf31e759-3990-42ed-9009-1fd1fbdc214e"
                  },
                  "reason": "Articulo Defecutoso"
                }
              }
            }
          },
          "404": {
            "description": "Reembolso no encontrado",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Not found"
                    },
                    "code_message": {
                      "type": "string",
                      "example": "AI4040"
                    },
                    "detail": {
                      "type": "string",
                      "example": "Refund ID does not exist"
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
  }
}
```