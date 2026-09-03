<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Clients_start_length_search_orderBy_orderAsc_draw · capturado 2026-09-03 -->

-

# Obtiene el catálogo de productos y servicios paginado (versión octubre de 2020, sucesión del original /product)

### Parámetros URI

start  **(
integer
 )**

**
**

  Default value is 0

length  **(
integer
 )**

**
**

  Default value is 100

search  **(
string
 )**

**
**

orderBy  **(
string
 )**

**
**

orderAsc  **(
boolean
 )**

**
**

  Default value is True

draw  **(
unsigned integer
 )**

**
**

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Lista de productos paginada

        Atributos de
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

**https://apisandbox.facturama.mx/clients?start={start}&length={length}&search={search}&orderBy={orderBy}&orderAsc={orderAsc}&draw={draw}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Id": "sample string 1",
    "Address": {
      "Street": "sample string 1",
      "ExteriorNumber": "sample string 2",
      "InteriorNumber": "sample string 3",
      "Neighborhood": "sample string 4",
      "ZipCode": "sample string 5",
      "Locality": "sample string 6",
      "Municipality": "sample string 7",
      "State": "sample string 8",
      "Country": "sample string 9",
      "Id": "sample string 10"
    },
    "Rfc": "sample string 2",
    "Name": "sample string 3",
    "FiscalRegime": "sample string 4",
    "Email": "sample string 5",
    "EmailOp1": "sample string 6",
    "EmailOp2": "sample string 7",
    "CfdiUse": "sample string 8",
    "TaxResidence": "sample string 9",
    "NumRegIdTrib": "sample string 10",
    "TaxZipCode": "sample string 11"
  },
  {
    "Id": "sample string 1",
    "Address": {
      "Street": "sample string 1",
      "ExteriorNumber": "sample string 2",
      "InteriorNumber": "sample string 3",
      "Neighborhood": "sample string 4",
      "ZipCode": "sample string 5",
      "Locality": "sample string 6",
      "Municipality": "sample string 7",
      "State": "sample string 8",
      "Country": "sample string 9",
      "Id": "sample string 10"
    },
    "Rfc": "sample string 2",
    "Name": "sample string 3",
    "FiscalRegime": "sample string 4",
    "Email": "sample string 5",
    "EmailOp1": "sample string 6",
    "EmailOp2": "sample string 7",
    "CfdiUse": "sample string 8",
    "TaxResidence": "sample string 9",
    "NumRegIdTrib": "sample string 10",
    "TaxZipCode": "sample string 11"
  }
]
```
