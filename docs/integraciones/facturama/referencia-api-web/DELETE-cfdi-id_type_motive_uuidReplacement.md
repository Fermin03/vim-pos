<!-- fuente: https://apisandbox.facturama.mx/docs/api/DELETE-cfdi-id_type_motive_uuidReplacement · capturado 2026-09-03 -->

-

# Cancela un CFDI (Version 2018 - Actualizado para 2022 con Motivo de cancelación) En el caso de que se requiera autorizacion, realiza la petición

### Parámetros URI

id  **(
string
 )**

ID del CFDI en Facturama

**
**

  Required

type  **(
string
 )**

Tipo de comprobante para API Web: ( issued | payroll ) y para API Multiemisor: ( issuedLite )

**
**

  Default value is issued

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

[CancelationViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CancelationViewModel)

Status  **(
string
 )**

Estado del CFDI ( canceled, requested ,rejected )

**
**

Uuid  **(
string
 )**

UUID del CFDI consultado

**
**

RequestDate  **(
string
 )**

Fecha de solicitud de la cancelación

**
**

ResponseDate  **(
string
 )**

Fecha en que se responde la solicitud de cancelación

**
**

ExpirationDate  **(
string
 )**

Vigencia de la solicitud de cancelación

**
**

AcuseXmlBase64  **(
string
 )**

Vigencia de la solicitud de cancelación

**
**

#### http method:

#### DELETE

**https://apisandbox.facturama.mx/cfdi/{id}?type={type}&motive={motive}&uuidReplacement={uuidReplacement}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Status": "sample string 1",
  "Uuid": "sample string 2",
  "RequestDate": "sample string 3",
  "ResponseDate": "sample string 4",
  "ExpirationDate": "sample string 5",
  "AcuseXmlBase64": "sample string 6"
}
```
