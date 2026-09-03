<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Client-id · capturado 2026-09-03 -->

-

# Obtiener cliente por Id

### Parámetros URI

id  **(
string
 )**

Identificador unico del cliente

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

ClientViewModel

[ClientViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ClientViewModel)

Id  **(
string
 )**

Identificador unico del cliente

**
**

Address  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Dirección no fiscal del cliente (opcional)

**
**

Rfc  **(
string
 )**

Clave del Registro Federal de Contribuyentes

**
**

Name  **(
string
 )**

Nombre, denominación o razón social del contribuyente receptor del comprobante.

**
**

FiscalRegime  **(
string
 )**

Régimen fiscal del contribuyente receptor del comprobante.

**
**

Email  **(
string
 )**

Email principal del cliente

**
**

EmailOp1  **(
string
 )**

Email opcional 1

**
**

EmailOp2  **(
string
 )**

Email opcional 1

**
**

CfdiUse  **(
string
 )**

**
**

  Required

TaxResidence  **(
string
 )**

Clave del país de residencia (Solo para clientes extranjeros, vea el catálogo de países)

**
**

NumRegIdTrib  **(
string
 )**

Número de registro de identidad fiscal (Solo para clientes extranjeros)

**
**

TaxZipCode  **(
string
 )**

Atributo registrar el código postal del domicilio fiscal del receptor del comprobante..

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/Client/{id}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Id": "NH98VzHgdF8sFl1kFXXJ7A2",
  "Address": {
    "Street": "Av Seguridad Soc",
    "ExteriorNumber": "123",
    "InteriorNumber": "",
    "Neighborhood": "Fidel Velazquez",
    "ZipCode": "78436",
    "Locality": "",
    "Municipality": "Soledad de Graciano Sánchez",
    "State": "SAN LUIS POTOSI",
    "Country": "MEXICO"
  },
  "Rfc": "ROAM861021459",
  "Name": "Manuel Romero Alva",
  "Email": "manuelromeroalva@gmail.com",
  "CfdiUse": "P01",
  "TaxResidence": "",
  "NumRegIdTrib": ""
}
```
