<!-- fuente: https://apisandbox.facturama.mx/docs-multi/api/DELETE-api-lite-cfdis-id_motive_uuidReplacement · capturado 2026-09-03 -->

-

# Cancela un CFDI (Version 2018) En el caso de que se requiera autorizacion, realiza la petición

### Parámetros URI

id  **(
string
 )**

Identificador unico de la factura en Facturama

**
**

  Required

motive  **(
string
 )**

Motivo de cancelación ( 01 | 02 | 03 | 04 )

**
**

  Default value is 02

uuidReplacement  **(
string
 )**

UUID del comprobante que sustituye al comprobante cancelado

**
**

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Al obtener una respuesta exitosa devuelve el CFDI emitido de lo contrario un error con el mensaje

[CancelationStatusLite](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CancelationStatusLite)

Status  **(
string
 )**

**
**

Message  **(
string
 )**

**
**

Uuid  **(
string
 )**

**
**

RequestDate  **(
string
 )**

**
**

AcuseXmlBase64  **(
string
 )**

**
**

CancelationDate  **(
string
 )**

**
**

#### http method:

#### DELETE

**https://apisandbox.facturama.mx/api-lite/cfdis/{id}?motive={motive}&uuidReplacement={uuidReplacement}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Status": "canceled",
  "Message": "Cancelado sin Aceptacion",
  "RequestDate": "2018-11-01T12:00:00",
  "AcuseXmlBase64": "PENhbmNlbGFjaW9uIHhtbG5zOnhzaT0iaH......W9uPg==",
  "CancelationDate": "2018-11-01T12:00:00"
}
```
