<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-products_start_length_search_orderBy_orderAsc_draw · capturado 2026-09-03 -->

-

# Obtiene el catálogo de productos y servicios paginado (versión octubre de 2020, sucesón del original /product).

### Parámetros URI

start  **(
integer
 )**

posicion de inicio.

**
**

  Default value is 0

length  **(
integer
 )**

longitud de datos.

**
**

  Default value is 100

search  **(
string
 )**

palabra clave para buscar en Nombre, Descripcion, Clave del producto o sercvicio y Unidad.

**
**

orderBy  **(
string
 )**

Atributo por el cual se ordenaran los resultados.

**
**

orderAsc  **(
boolean
 )**

ordenar resultado de la busqueda puede ser 'asc': ascendente o 'desc': descendente.

**
**

  Default value is True

draw  **(
unsigned integer
 )**

pagina.

**
**

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Lista de productos paginada.

        Atributos de
[ProductViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ProductViewModel)

Id  **(
string
 )**

Identificador unico de producto

**
**

UnitCode  **(
string
 )**

Código correspondiente a la Unidad conforme al catalogo del SAT

**
**

Unit  **(
string
 )**

La unidad de medida aplicable para la cantidad expresada en el producto

**
**

IdentificationNumber  **(
string
 )**

Número de serie del producto

**
**

Name  **(
string
 )**

Nombre del producto

**
**

Description  **(
string
 )**

Descripción del producto

**
**

Category  **(
string
 )**

Nombre de la categoría del producto

**
**

Code  **(
string
 )**

Nombre de la categoría del producto

**
**

Price  **(
decimal number
 )**

Valor o precio unitario del producto

**
**

CodeProdServ  **(
string
 )**

Clave del Producto o servicio segun el catalogo del SAT

**
**

NameCodeProdServ  **(
string
 )**

Nombre correspondiente a la clave del Producto o servicio segun el catalogo del SAT

**
**

CuentaPredial  **(
string
 )**

Cuenta Predial cfdi 4.0 (para facturas de arrendamiento que necesiten expresar esta informacion)

**
**

CuentasPredial  **(
        Atributos de
string

 )**

Cuenta Predial cfdi 4.0 (para facturas de arrendamiento que necesiten expresar esta informacion)

**
**

ObjetoImp  **(
string
 )**

Clave correspondiente para indicar si la operación comercial es objeto o no de impuesto

**
**

NumerosPedimento  **(
        Atributos de
string

 )**

Información aduanera (ventas de primera mano de mercancías importadas o se trate de operaciones de
            comercio exterior)

**
**

Taxes  **(
        Atributos de
[ProductTaxesModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ProductTaxesModel)
 )**

Impuestos federales aplicables al producto

**
**

Complement  **(
[ItemComplemenv33](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemComplemenv33) )**

Complementos aplicables al producto

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/products?start={start}&length={length}&search={search}&orderBy={orderBy}&orderAsc={orderAsc}&draw={draw}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Id": "sample string 1",
    "UnitCode": "sample string 2",
    "Unit": "sample string 3",
    "IdentificationNumber": "sample string 4",
    "Name": "sample string 5",
    "Description": "sample string 6",
    "Category": "sample string 7",
    "Code": "sample string 8",
    "Price": 9.0,
    "CodeProdServ": "sample string 10",
    "NameCodeProdServ": "sample string 11",
    "CuentaPredial": "sample string 12",
    "CuentasPredial": [
      "sample string 1",
      "sample string 2"
    ],
    "ObjetoImp": "sample string 13",
    "NumerosPedimento": [
      "sample string 1",
      "sample string 2"
    ],
    "Taxes": [
      {
        "Name": "sample string 1",
        "Rate": 1.0,
        "IsRetention": true,
        "IsFederalTax": true,
        "IsQuota": true,
        "Total": 1.0
      },
      {
        "Name": "sample string 1",
        "Rate": 1.0,
        "IsRetention": true,
        "IsFederalTax": true,
        "IsQuota": true,
        "Total": 1.0
      }
    ],
    "Complement": {
      "EducationalInstitution": {
        "StudentsName": "sample string 1",
        "Curp": "sample string 2",
        "EducationLevel": "sample string 3",
        "AutRvoe": "sample string 4",
        "PaymentRfc": "sample string 5"
      },
      "ThirdPartyAccount": {
        "Rfc": "sample string 1",
        "Name": "sample string 2",
        "FiscalRegime": "sample string 3",
        "TaxZipCode": "sample string 4",
        "ThirdTaxInformation": {
          "Street": "sample string 1",
          "ExteriorNumber": "sample string 2",
          "InteriorNumber": "sample string 3",
          "Neighborhood": "sample string 4",
          "Locality": "sample string 5",
          "Reference": "sample string 6",
          "Municipality": "sample string 7",
          "State": "sample string 8",
          "Country": "sample string 9",
          "PostalCode": "sample string 10",
          "ZipCode": "sample string 11"
        },
        "CustomsInformation": {
          "Number": "sample string 1",
          "Date": "sample string 2",
          "Customs": "sample string 3"
        },
        "Parts": [
          {
            "Quantity": 1.0,
            "Unit": "sample string 2",
            "IdentificationNumber": "sample string 3",
            "Description": "sample string 4",
            "UnitPrce": 1.0,
            "Amount": 1.0,
            "CustomsInformation": [
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              },
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              }
            ]
          },
          {
            "Quantity": 1.0,
            "Unit": "sample string 2",
            "IdentificationNumber": "sample string 3",
            "Description": "sample string 4",
            "UnitPrce": 1.0,
            "Amount": 1.0,
            "CustomsInformation": [
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              },
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              }
            ]
          }
        ],
        "PropertyTaxNumber": "sample string 5",
        "Taxes": [
          {
            "Name": "sample string 1",
            "Rate": 1.0,
            "Amount": 2.0
          },
          {
            "Name": "sample string 1",
            "Rate": 1.0,
            "Amount": 2.0
          }
        ]
      },
      "HidroYPetro": {
        "Version": 1.1,
        "TypePermit": "sample string 2",
        "PermitNumber": "sample string 3",
        "HYPCode": "sample string 4",
        "SubProductHYP": "sample string 5"
      }
    }
  },
  {
    "Id": "sample string 1",
    "UnitCode": "sample string 2",
    "Unit": "sample string 3",
    "IdentificationNumber": "sample string 4",
    "Name": "sample string 5",
    "Description": "sample string 6",
    "Category": "sample string 7",
    "Code": "sample string 8",
    "Price": 9.0,
    "CodeProdServ": "sample string 10",
    "NameCodeProdServ": "sample string 11",
    "CuentaPredial": "sample string 12",
    "CuentasPredial": [
      "sample string 1",
      "sample string 2"
    ],
    "ObjetoImp": "sample string 13",
    "NumerosPedimento": [
      "sample string 1",
      "sample string 2"
    ],
    "Taxes": [
      {
        "Name": "sample string 1",
        "Rate": 1.0,
        "IsRetention": true,
        "IsFederalTax": true,
        "IsQuota": true,
        "Total": 1.0
      },
      {
        "Name": "sample string 1",
        "Rate": 1.0,
        "IsRetention": true,
        "IsFederalTax": true,
        "IsQuota": true,
        "Total": 1.0
      }
    ],
    "Complement": {
      "EducationalInstitution": {
        "StudentsName": "sample string 1",
        "Curp": "sample string 2",
        "EducationLevel": "sample string 3",
        "AutRvoe": "sample string 4",
        "PaymentRfc": "sample string 5"
      },
      "ThirdPartyAccount": {
        "Rfc": "sample string 1",
        "Name": "sample string 2",
        "FiscalRegime": "sample string 3",
        "TaxZipCode": "sample string 4",
        "ThirdTaxInformation": {
          "Street": "sample string 1",
          "ExteriorNumber": "sample string 2",
          "InteriorNumber": "sample string 3",
          "Neighborhood": "sample string 4",
          "Locality": "sample string 5",
          "Reference": "sample string 6",
          "Municipality": "sample string 7",
          "State": "sample string 8",
          "Country": "sample string 9",
          "PostalCode": "sample string 10",
          "ZipCode": "sample string 11"
        },
        "CustomsInformation": {
          "Number": "sample string 1",
          "Date": "sample string 2",
          "Customs": "sample string 3"
        },
        "Parts": [
          {
            "Quantity": 1.0,
            "Unit": "sample string 2",
            "IdentificationNumber": "sample string 3",
            "Description": "sample string 4",
            "UnitPrce": 1.0,
            "Amount": 1.0,
            "CustomsInformation": [
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              },
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              }
            ]
          },
          {
            "Quantity": 1.0,
            "Unit": "sample string 2",
            "IdentificationNumber": "sample string 3",
            "Description": "sample string 4",
            "UnitPrce": 1.0,
            "Amount": 1.0,
            "CustomsInformation": [
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              },
              {
                "Number": "sample string 1",
                "Date": "sample string 2",
                "Customs": "sample string 3"
              }
            ]
          }
        ],
        "PropertyTaxNumber": "sample string 5",
        "Taxes": [
          {
            "Name": "sample string 1",
            "Rate": 1.0,
            "Amount": 2.0
          },
          {
            "Name": "sample string 1",
            "Rate": 1.0,
            "Amount": 2.0
          }
        ]
      },
      "HidroYPetro": {
        "Version": 1.1,
        "TypePermit": "sample string 2",
        "PermitNumber": "sample string 3",
        "HYPCode": "sample string 4",
        "SubProductHYP": "sample string 5"
      }
    }
  }
]
```
