<!-- fuente: https://apisandbox.facturama.mx/docs-multi/api/GET-api-lite-csds · capturado 2026-09-03 -->

-

# Obtiene los CSD Cargados

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[TaxEntityCsdViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxEntityCsdViewModel)

Rfc  **(
string
 )**

RFC

**
**

Certificate  **(
string
 )**

Certificado CFSD en Base64

**
**

PrivateKey  **(
string
 )**

Llave privada en Base64

**
**

PrivateKeyPassword  **(
string
 )**

Contraseña  de la llave privada

**
**

CsdExpirationDate  **(
date
 )**

Fecha de vigencia del CSD

**
**

UploadDate  **(
date
 )**

Fecha en que se ha cargado ó actualizado el certificado

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/api-lite/csds**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Rfc": "sample string 1",
    "Certificate": "sample string 2",
    "PrivateKey": "sample string 3",
    "PrivateKeyPassword": "sample string 4",
    "CsdExpirationDate": "2026-09-03T13:05:56.2251173-06:00",
    "UploadDate": "2026-09-03T13:05:56.2251173-06:00"
  },
  {
    "Rfc": "sample string 1",
    "Certificate": "sample string 2",
    "PrivateKey": "sample string 3",
    "PrivateKeyPassword": "sample string 4",
    "CsdExpirationDate": "2026-09-03T13:05:56.2251173-06:00",
    "UploadDate": "2026-09-03T13:05:56.2251173-06:00"
  }
]
```
