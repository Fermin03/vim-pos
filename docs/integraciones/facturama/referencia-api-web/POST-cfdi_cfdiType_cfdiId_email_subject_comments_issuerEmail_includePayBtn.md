<!-- fuente: https://apisandbox.facturama.mx/docs/api/POST-cfdi_cfdiType_cfdiId_email_subject_comments_issuerEmail_includePayBtn · capturado 2026-09-03 -->

-

# Envia el CFDi por email.

### Parámetros URI

CfdiType  **(
string
 )**

**
**

CfdiId  **(
string
 )**

**
**

Email  **(
string
 )**

**
**

Subject  **(
string
 )**

**
**

Comments  **(
string
 )**

**
**

IssuerEmail  **(
string
 )**

**
**

IncludePayBtn  **(
string
 )**

**
**

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

json message.

[ResponseMailViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ResponseMailViewModel)

msj  **(
string
 )**

**
**

success  **(
boolean
 )**

**
**

#### http method:

#### POST

**https://apisandbox.facturama.mx/Cfdi?CfdiType={CfdiType}&CfdiId={CfdiId}&Email={Email}&Subject={Subject}&Comments={Comments}&IssuerEmail={IssuerEmail}&IncludePayBtn={IncludePayBtn}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "msj": "sample string 1",
  "success": true
}
```
