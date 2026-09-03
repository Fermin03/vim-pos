<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Account-UserInfo · capturado 2026-09-03 -->

-

# Obtiene la información de la cuenta del usuario incluyendo su información Fiscal

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

[UserInfoViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=UserInfoViewModel)

UserName  **(
string
 )**

Nombre de usuario

**
**

Email  **(
string
 )**

Correo electrónico

**
**

ContactPhone  **(
string
 )**

Teléfono de contacto

**
**

HasRegistered  **(
boolean
 )**

Bandera de registrado

**
**

FiscalRegime  **(
string
 )**

Régimen fiscal

**
**

Rfc  **(
string
 )**

Registro Fiscal de Contribuyentes

**
**

TaxName  **(
string
 )**

Código postal

**
**

TaxAddress  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Dirección

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/account/UserInfo**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "UserName": "Luis",
  "Email": "humbertos@facturama.mx",
  "ContactPhone": "4448253053",
  "HasRegistered": true,
  "FiscalRegime": "601",
  "Rfc": "EKU9003173C9",
  "TaxName": "nombre12",
  "TaxAddress": {
    "Street": "FRAY JOSE DE ARLEGUIS",
    "ExteriorNumber": "abcs",
    "InteriorNumber": "L16",
    "Neighborhood": "-",
    "ZipCode": "05505",
    "Locality": "",
    "Municipality": "Mexico",
    "State": "ESTADO DE MEXICO",
    "Country": "MEXICO"
  }
}
```
