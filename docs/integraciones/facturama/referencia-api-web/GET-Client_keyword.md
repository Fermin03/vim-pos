<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Client_keyword · capturado 2026-09-03 -->

-

# Obtiene una lista de los Clientes del Usuario filtrando por palabra clave

### Parámetros URI

keyword  **(
string
 )**

RFC ó Nombre del cliente (minimo 4 caracteres)

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Lista de Clientes.

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

**https://apisandbox.facturama.mx/Client?keyword={keyword}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Id": "-C4sT6klG1oX6193-HTN2Q2",
    "Address": {
      "Street": "",
      "ExteriorNumber": "105",
      "InteriorNumber": "",
      "Neighborhood": "",
      "ZipCode": "78216",
      "Municipality": "",
      "State": "SAN LUIS POTOSI",
      "Country": "MEXICO"
    },
    "Rfc": "XAXX010101000",
    "Name": "MARIA GUADALUPE GUERRERO RAMIREZ",
    "Email": "humbertos@facturama.mx",
    "CfdiUse": "P01"
  },
  {
    "Id": "DNiZQqp29_pjW7WR94PR9A2",
    "Address": {
      "Street": "",
      "ExteriorNumber": "302",
      "InteriorNumber": "",
      "Neighborhood": "",
      "ZipCode": "78216",
      "Municipality": "",
      "State": "SAN LUIS POTOSI",
      "Country": "MEXICO"
    },
    "Rfc": "XAXX010101000",
    "Name": "SERGIO MANUEL BERNAL GRANILLO",
    "Email": "humbertos@facturama.mx",
    "CfdiUse": "P01"
  }
]
```
