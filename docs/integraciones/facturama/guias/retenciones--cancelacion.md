<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones/cancelacion · capturado 2026-09-03 -->

# Cancelación de Retenciones

Aplica para: Factura de retención y Complemento de Servicios para Plataformas Tecnologicas

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

-  Los emisores deberán enviar la solicitud de cancelación de la factura a través de Facturama.

- Cuando se requiera la aceptación para la cancelación, el receptor de la factura, recibirá una notificación mediante el[WebHook](#) informando que existe una solicitud de cancelación.

- ​ El receptor deberá manifestar la aceptación o rechazo de la cancelación a través del la [petición correspondiente](#) Within

-  En caso de que la solicitud de cancelación no requiera aceptación por parte del receptor, la factura se cancelará de manera inmediata.

**Puedes consultar las facturas pendientes de aceptación mediante:**

-  [Consultar estado de Retención en SAT](https://prodretencionverificacion.clouda.sat.gob.mx/)

### Solicitar la cancelación de un CFDI:

#### Solicitar la cancelación de una Retención

#### DELETE

```
https://apisandbox.facturama.mx/api/retenciones/{retId}

    Ejemplo:
    https://apisandbox.facturama.mx/api/retenciones/jhQS4AaCO4bIwqcv5UHYCw2
```

    **{retId}**:  Identificador de la retención

Ejemplo:   jhQS4AaCO4bIwqcv5UHYCw2

### Respuesta a una solicitud de cancelación

    La respuesta respecto al "HTTP Response" si la petición fué exitos regresa un **200**

  ** Incluyendo el estado de la factura**

#### Ejemplo de factura cancelada

```
{
        "Status": "canceled",
        "Uuid": "41A49A5E-7E57-4339-88F9-DEEE9B901B55",
        "RequestDate": "2018-11-14T10:21:43",
        "ResponseDate": "2018-11-17T10:21:43",
        "ExpirationDate": "2018-11-17T10:21:43",
        "AcuseXmlBase64": "PD94bWwgdmVyc2lvbj0iMS...3VzZT4="
    }
```

#### Los datos del estado de la cancelación son:

    **Uuid**:   UIID del CFDI

    **RequestDate**:   Fecha de solicitud de la cancelación

    **ResponseDate**:   Fecha de respuesta de la solicitud de la cancelación

    **ExpirationDate**:   Fecha limite que tiene el receptor para emitir una respuesta

    **AcuseXmlBase64**:   XML del Acuse en Formato Base64, solo se tiene acuse cuando ya se encuentra cancelada (y no se cancelo directamente con el SAT)

    **Status**:   Estado de la cancelación :

- **canceled** =  Cancelada

- **active** =  Activa, no se puede cancelar, por que tiene documentos relacionados

- **pending** =  Pendiente de aceptación, requiere una respuesta por parte del receptor (tiene hasta 72 horas para responder)

- **acepted** = Solicitud de cancelación aceptada (por parte del receptor)

- **rejected** =  Solicitud de cancelacion rechazada (por parte del receptor)

- **expired** =  Tiempo de respuesta de las 72 horas terminado

    Casos en que un CFDI está cancelado: **canceled, acepted, expired**
