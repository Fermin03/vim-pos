<!-- fuente: https://apisandbox.facturama.mx/docs-multi/api/POST-api-lite-3-cfdis · capturado 2026-09-03 -->

-

# Crea un cfdi de emision

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

NameId  **(
integer
 )**

Gets or sets atributo para especificar el nombre que se establecera en el pdf (default 1 = factura) [ Vea la documentación de "Nombres del CFDI" ]

**
**

  Data type: Text

LogoUrl  **(
string
 )**

Gets or sets url del logo, ej. https://dominio.com/mi-logo.png

**
**

  Matching regular expression pattern: (http(s?):)([/|.|\w|\s|-])*\.(?:jpg|jpeg|png)

Date  **(
string
 )**

Gets or sets fecha de Emision (Opcional) del comprobante conforme a la norma ISO 8601

**
**

  Data type: DateTime

  Matching regular expression pattern: ^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$

Serie  **(
string
 )**

Gets or sets referencia (Opcional) de la Serie existente en la Sucursal

**
**

  Matching regular expression pattern: [a-zA-Z0-9]{1,25}

  String length: inclusive between 0 and 25

PaymentAccountNumber  **(
string
 )**

Gets or sets atributo opcional para incorporar al menos los cuatro últimos digitos del número de cuenta con la que se realizó el pago.

**
**

  Data type: Text

  Matching regular expression pattern: ^\d{1,4}?$

  String length: inclusive between 4 and 4

CurrencyExchangeRate  **(
decimal number
 )**

Gets or sets tipo de cambio de la moneda en caso de ser diferente de MXN

**
**

  Data type: Text

Currency  **(
string
 )**

Gets or sets atributo  para expresar la moneda utilizada para expresar los montos en 3 caracteres según la especificación del estándar internacional ISO 4217

**
**

  Data type: Text

  String length: inclusive between 3 and 3

ExpeditionPlace  **(
string
 )**

Gets or sets lugar de Expedición (Codigo Postal desde donde se expide el comprobante)

**
**

  Required

  Matching regular expression pattern: [0-9]{5}

Exportation  **(
string
 )**

Gets or sets atributo requerido para expresar si el comprobante ampara una
            operación de exportación.
            Se elige del catálogo del SAT 01|02|03|04

**
**

  Data type: Text

  Matching regular expression pattern: 0[1234]

PaymentConditions  **(
string
 )**

Gets or sets (Opcional).

**
**

  Data type: Text

  Matching regular expression pattern: [^|]{1,100}

GlobalInformation  **(
[GlobalInformationV4Model](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=GlobalInformationV4Model) )**

Gets or sets nodo Información Global

**
**

Relations  **(
[Cfdiv4Relations](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Cfdiv4Relations) )**

Gets or sets cfdis Relacionados empleado para las notas de credito, etc.

**
**

Folio  **(
string
 )**

Gets or sets folio: Atributo para control interno del contribuyente que expresa el
            folio del comprobante, acepta una cadena de 1 a 40 caracteres.

**
**

  Required

  Matching regular expression pattern: [^|]{1,40}

  String length: inclusive between 1 and 40

CfdiType  **(
string
 )**

Gets or sets atributo requerido para expresar el efecto del comprobante fiscal para el contribuyente emisor: ingreso, egreso ó traslado

**
**

  Required

  Data type: Text

  Matching regular expression pattern: I|E|T|N|P

PaymentForm  **(
string
 )**

Gets or sets atributo obligatorio y de catálogo, para expresar la forma de pago de los bienes o servicios amparados por el comprobante.
            Se entiende como método de pago leyendas tales como: 01, 02, 03, 99

**
**

  Data type: Text

  Matching regular expression pattern: 01|02|03|04|05|06|08|12|13|14|15|17|23|24|25|26|27|28|29|30|31|99

PaymentMethod  **(
string
 )**

Gets or sets atributo obligatorio y de catálogo, para expresar el método de pago de los bienes o servicios amparados por el comprobante.
            Se entiende como método de pago leyendas tales como: PPD, PUE

**
**

  Matching regular expression pattern: PUE|PPD

Issuer  **(
[IssuerV4BindingModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=IssuerV4BindingModel) )**

Gets or sets entidad Fiscal que emite el CFDI.

**
**

  Required

Receiver  **(
[ReceiverV4BindingModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ReceiverV4BindingModel) )**

Gets or sets cliente a quien se emitirá el CFDi, Atributo Requerido

**
**

  Required

Items  **(
        Atributos de
[ItemFullBindingModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemFullBindingModel)
 )**

Gets or sets nodo requerido para enlistar los conceptos cubiertos por el comprobante.

**
**

Complemento  **(
[Complementv4](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Complementv4) )**

Gets or sets complementos aplicables al cfdi 4.0.

**
**

Observations  **(
string
 )**

Gets or sets descripcion no fiscal del pdf

**
**

OrderNumber  **(
string
 )**

Gets or sets numero de Orden, propiedad no fiscal (opcional)

**
**

  Max length: 100

PaymentBankName  **(
string
 )**

Gets or sets nombre del banco, propiedad no fiscal (opcional)

**
**

  Max length: 50

### Argumentos de respuesta

detalle del CFDi

[CfdiInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CfdiInfoModel)

Id  **(
string
 )**

Identifiacador unico del cfdi.

**
**

CfdiType  **(
string
 )**

Tipo del efecto del comprobante fiscal para el contribuyente emisor: ingreso, egreso ó traslado.

**
**

Type  **(
string
 )**

Tipo de comprobante segun catalogo del SAT.

**
**

Serie  **(
string
 )**

Numero de la serie en el control interno del contribuyente.

**
**

Folio  **(
string
 )**

Numero de la folio en el control interno del contribuyente.

**
**

Date  **(
string
 )**

Fecha y hora de expedición del comprobante fiscal.

**
**

CertNumber  **(
string
 )**

No del Certificado.

**
**

PaymentTerms  **(
string
 )**

Forma de pago.

**
**

PaymentConditions  **(
string
 )**

Condiciones comerciales aplicables para el pago del comprobante fiscal digital a través de Internet.

**
**

PaymentMethod  **(
string
 )**

Método de pago de los bienes o servicios amparados por el comprobante. Se entiende como método de pago leyendas tales como: cheque, tarjeta de crédito o debito, depósito en cuenta, etc.

**
**

PaymentAccountNumber  **(
string
 )**

Incorpora al menos los cuatro últimos digitos del número de cuenta con la que se realizó el pago.

**
**

PaymentBankName  **(
string
 )**

Nombre del banco donde se realizo el pago.

**
**

ExpeditionPlace  **(
string
 )**

Lugar de expedición del comprobante.

**
**

ExchangeRate  **(
decimal number
 )**

Tipo de cambio conforme a la moneda usada.

**
**

Currency  **(
string
 )**

Moneda utilizada para expresar los montos.

**
**

Subtotal  **(
decimal number
 )**

Representa la suma de los importes antes de descuentos e impuestos.

**
**

Discount  **(
decimal number
 )**

Representa el importe total de los descuentos aplicables antes de impuestos.

**
**

Total  **(
decimal number
 )**

Representar la suma del subtotal, menos los descuentos aplicables, más los impuestos trasladados, menos los impuestos retenidos.

**
**

Observations  **(
string
 )**

Observaciones no fiscales de la factura.

**
**

OrderNumber  **(
string
 )**

Observaciones no fiscales de la factura.

**
**

Issuer  **(
[TaxEntityInfoViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxEntityInfoViewModel) )**

Nodo que contiene el detalle del emisor.

**
**

Receiver  **(
[ReceiverViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ReceiverViewModel) )**

Nodo que contiene el detalle del receptor.

**
**

Items  **(
        Atributos de
[ItemInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemInfoModel)
 )**

Nodo que contiene el detalle de los conceptos.

**
**

Taxes  **(
        Atributos de
[TaxInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxInfoModel)
 )**

Nodo que contiene el detalle de los impuestos.

**
**

Complement  **(
 )**

Nodo que contiene complementos de extensión definidos por el SAT.

**
**

#### http method:

#### POST

**https://apisandbox.facturama.mx/api-lite/3/cfdis**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "NameId": 1,
  "LogoUrl": "sample string 1",
  "Date": "sample string 2",
  "Serie": "sample string 3",
  "PaymentAccountNumber": "sample string 4",
  "CurrencyExchangeRate": 1.0,
  "Currency": "sample string 5",
  "ExpeditionPlace": "sample string 6",
  "Exportation": "sample string 7",
  "PaymentConditions": "sample string 8",
  "GlobalInformation": {
    "Periodicity": "sample string 1",
    "Months": "sample string 2",
    "Year": 3
  },
  "Relations": {
    "Type": "sample string 1",
    "Cfdis": [
      {
        "Uuid": "sample string 1"
      },
      {
        "Uuid": "sample string 1"
      }
    ]
  },
  "Folio": "sample string 9",
  "CfdiType": "sample string 10",
  "PaymentForm": "sample string 11",
  "PaymentMethod": "sample string 12",
  "Issuer": {
    "FiscalRegime": "sample string 1",
    "Rfc": "sample string 2",
    "Name": "sample string 3",
    "FacAtrAcquirer": "sample string 4",
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
    }
  },
  "Receiver": {
    "Id": "sample string 1",
    "Rfc": "sample string 2",
    "Name": "sample string 3",
    "CfdiUse": "sample string 4",
    "FiscalRegime": "sample string 5",
    "TaxZipCode": "sample string 6",
    "TaxResidence": "sample string 7",
    "TaxRegistrationNumber": "sample string 8",
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
    }
  },
  "Items": [
    {
      "IdProduct": "sample string 1",
      "ProductCode": "sample string 2",
      "IdentificationNumber": "sample string 3",
      "SKU": "sample string 4",
      "Description": "sample string 5",
      "Unit": "sample string 6",
      "UnitCode": "sample string 7",
      "UnitPrice": 8.0,
      "Quantity": 9.0,
      "Subtotal": 10.0,
      "Discount": 1.0,
      "TaxObject": "sample string 11",
      "Taxes": [
        {
          "Total": 1.0,
          "Name": "sample string 2",
          "Base": 3.0,
          "Rate": 4.0,
          "IsRetention": true,
          "IsQuota": true,
          "TaxObject": "sample string 6"
        },
        {
          "Total": 1.0,
          "Name": "sample string 2",
          "Base": 3.0,
          "Rate": 4.0,
          "IsRetention": true,
          "IsQuota": true,
          "TaxObject": "sample string 6"
        }
      ],
      "ThirdPartyAccount": {
        "Rfc": "sample string 1",
        "Name": "sample string 2",
        "FiscalRegime": "sample string 3",
        "TaxZipCode": "sample string 4"
      },
      "PropertyTaxIDNumber": [
        "sample string 1",
        "sample string 2"
      ],
      "NumerosPedimento": [
        "sample string 1",
        "sample string 2"
      ],
      "Parts": [
        {
          "Quantity": 1.0,
          "UnitCode": "sample string 2",
          "ProductCode": "sample string 3",
          "IdentificationNumber": "sample string 4",
          "Description": "sample string 5",
          "UnitPrice": 1.0,
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
          "UnitCode": "sample string 2",
          "ProductCode": "sample string 3",
          "IdentificationNumber": "sample string 4",
          "Description": "sample string 5",
          "UnitPrice": 1.0,
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
      "Total": 12.0,
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
          "Version": "sample string 1",
          "TipoPermiso": 0,
          "NumeroPermiso": "sample string 2",
          "ClaveHYP": 0,
          "SubProductoHYP": 0
        }
      }
    },
    {
      "IdProduct": "sample string 1",
      "ProductCode": "sample string 2",
      "IdentificationNumber": "sample string 3",
      "SKU": "sample string 4",
      "Description": "sample string 5",
      "Unit": "sample string 6",
      "UnitCode": "sample string 7",
      "UnitPrice": 8.0,
      "Quantity": 9.0,
      "Subtotal": 10.0,
      "Discount": 1.0,
      "TaxObject": "sample string 11",
      "Taxes": [
        {
          "Total": 1.0,
          "Name": "sample string 2",
          "Base": 3.0,
          "Rate": 4.0,
          "IsRetention": true,
          "IsQuota": true,
          "TaxObject": "sample string 6"
        },
        {
          "Total": 1.0,
          "Name": "sample string 2",
          "Base": 3.0,
          "Rate": 4.0,
          "IsRetention": true,
          "IsQuota": true,
          "TaxObject": "sample string 6"
        }
      ],
      "ThirdPartyAccount": {
        "Rfc": "sample string 1",
        "Name": "sample string 2",
        "FiscalRegime": "sample string 3",
        "TaxZipCode": "sample string 4"
      },
      "PropertyTaxIDNumber": [
        "sample string 1",
        "sample string 2"
      ],
      "NumerosPedimento": [
        "sample string 1",
        "sample string 2"
      ],
      "Parts": [
        {
          "Quantity": 1.0,
          "UnitCode": "sample string 2",
          "ProductCode": "sample string 3",
          "IdentificationNumber": "sample string 4",
          "Description": "sample string 5",
          "UnitPrice": 1.0,
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
          "UnitCode": "sample string 2",
          "ProductCode": "sample string 3",
          "IdentificationNumber": "sample string 4",
          "Description": "sample string 5",
          "UnitPrice": 1.0,
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
      "Total": 12.0,
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
          "Version": "sample string 1",
          "TipoPermiso": 0,
          "NumeroPermiso": "sample string 2",
          "ClaveHYP": 0,
          "SubProductoHYP": 0
        }
      }
    }
  ],
  "Complemento": {
    "NotariosPublicos": {
      "DescInmuebles": [
        {
          "TipoInmueble": "sample string 1",
          "Calle": "sample string 2",
          "NoExterior": "sample string 3",
          "NoInterior": "sample string 4",
          "Colonia": "sample string 5",
          "Localidad": "sample string 6",
          "Referencia": "sample string 7",
          "Municipio": "sample string 8",
          "Estado": "sample string 9",
          "Pais": "sample string 10",
          "CodigoPostal": "sample string 11"
        },
        {
          "TipoInmueble": "sample string 1",
          "Calle": "sample string 2",
          "NoExterior": "sample string 3",
          "NoInterior": "sample string 4",
          "Colonia": "sample string 5",
          "Localidad": "sample string 6",
          "Referencia": "sample string 7",
          "Municipio": "sample string 8",
          "Estado": "sample string 9",
          "Pais": "sample string 10",
          "CodigoPostal": "sample string 11"
        }
      ],
      "DatosOperacion": {
        "NumInstrumentoNotarial": 1,
        "FechaInstNotarial": "sample string 2",
        "MontoOperacion": 3.0,
        "Subtotal": 4.0,
        "IVA": 5.0
      },
      "DatosNotario": {
        "CURP": "sample string 1",
        "NumNotaria": 2,
        "EntidadFederativa": "sample string 3",
        "Adscripcion": "sample string 4"
      },
      "DatosEnajenante": {
        "CoproSocConyugalE": "sample string 1",
        "DatosUnEnajenante": {
          "Nombre": "sample string 1",
          "ApellidoPaterno": "sample string 2",
          "ApellidoMaterno": "sample string 3",
          "RFC": "sample string 4",
          "CURP": "sample string 5"
        },
        "DatosEnajenanteCopSC": {
          "DatosEnajenanteCopSC": [
            {
              "Porcentaje": 1.0,
              "Nombre": "sample string 2",
              "ApellidoPaterno": "sample string 3",
              "ApellidoMaterno": "sample string 4",
              "RFC": "sample string 5",
              "CURP": "sample string 6"
            },
            {
              "Porcentaje": 1.0,
              "Nombre": "sample string 2",
              "ApellidoPaterno": "sample string 3",
              "ApellidoMaterno": "sample string 4",
              "RFC": "sample string 5",
              "CURP": "sample string 6"
            }
          ]
        }
      },
      "DatosAdquiriente": {
        "CoproSocConyugalE": "sample string 1",
        "DatosUnAdquiriente": {
          "Nombre": "sample string 1",
          "ApellidoPaterno": "sample string 2",
          "ApellidoMaterno": "sample string 3",
          "RFC": "sample string 4",
          "CURP": "sample string 5"
        },
        "DatosAdquirienteCopSC": {
          "DatosAdquirienteCopSC": [
            {
              "Porcentaje": 1.0,
              "Nombre": "sample string 2",
              "ApellidoPaterno": "sample string 3",
              "ApellidoMaterno": "sample string 4",
              "RFC": "sample string 5",
              "CURP": "sample string 6"
            },
            {
              "Porcentaje": 1.0,
              "Nombre": "sample string 2",
              "ApellidoPaterno": "sample string 3",
              "ApellidoMaterno": "sample string 4",
              "RFC": "sample string 5",
              "CURP": "sample string 6"
            }
          ]
        }
      }
    },
    "Ine": {},
    "Detallista": {},
    "Payments": [
      {
        "SignPayment": "sample string 1",
        "CertPayment": "sample string 2",
        "OriginalString": "sample string 3",
        "StringTypePayment": "sample string 4",
        "RelatedDocuments": [
          {
            "Uuid": "sample string 1",
            "Serie": "sample string 2",
            "Folio": "sample string 3",
            "Currency": "sample string 4",
            "EquivalenceDocRel": 1.0,
            "ExchangeRate": 1.0,
            "PartialityNumber": 1,
            "PreviousBalanceAmount": 1.0,
            "AmountPaid": 1.0,
            "TaxObject": "sample string 5",
            "Taxes": [
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              },
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              }
            ]
          },
          {
            "Uuid": "sample string 1",
            "Serie": "sample string 2",
            "Folio": "sample string 3",
            "Currency": "sample string 4",
            "EquivalenceDocRel": 1.0,
            "ExchangeRate": 1.0,
            "PartialityNumber": 1,
            "PreviousBalanceAmount": 1.0,
            "AmountPaid": 1.0,
            "TaxObject": "sample string 5",
            "Taxes": [
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              },
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              }
            ]
          }
        ],
        "Taxes": [
          {
            "Total": 1.0,
            "Name": "sample string 2",
            "Base": 3.0,
            "Rate": 4.0,
            "IsRetention": true,
            "IsQuota": true,
            "TaxObject": "sample string 6"
          },
          {
            "Total": 1.0,
            "Name": "sample string 2",
            "Base": 3.0,
            "Rate": 4.0,
            "IsRetention": true,
            "IsQuota": true,
            "TaxObject": "sample string 6"
          }
        ],
        "Date": "sample string 5",
        "PaymentForm": "sample string 6",
        "Currency": "sample string 7",
        "ExchangeRate": 1.0,
        "Amount": 8.0,
        "OperationNumber": "sample string 9",
        "RfcIssuerPayerAccount": "sample string 10",
        "ForeignAccountNamePayer": "sample string 11",
        "PayerAccount": "sample string 12",
        "RfcReceiverBeneficiaryAccount": "sample string 13",
        "BeneficiaryAccount": "sample string 14",
        "ExpectedPaid": 2.0
      },
      {
        "SignPayment": "sample string 1",
        "CertPayment": "sample string 2",
        "OriginalString": "sample string 3",
        "StringTypePayment": "sample string 4",
        "RelatedDocuments": [
          {
            "Uuid": "sample string 1",
            "Serie": "sample string 2",
            "Folio": "sample string 3",
            "Currency": "sample string 4",
            "EquivalenceDocRel": 1.0,
            "ExchangeRate": 1.0,
            "PartialityNumber": 1,
            "PreviousBalanceAmount": 1.0,
            "AmountPaid": 1.0,
            "TaxObject": "sample string 5",
            "Taxes": [
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              },
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              }
            ]
          },
          {
            "Uuid": "sample string 1",
            "Serie": "sample string 2",
            "Folio": "sample string 3",
            "Currency": "sample string 4",
            "EquivalenceDocRel": 1.0,
            "ExchangeRate": 1.0,
            "PartialityNumber": 1,
            "PreviousBalanceAmount": 1.0,
            "AmountPaid": 1.0,
            "TaxObject": "sample string 5",
            "Taxes": [
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              },
              {
                "Name": "sample string 1",
                "Total": 2.0,
                "Base": 3.0,
                "Rate": 4.0,
                "IsRetention": true,
                "IsQuota": true,
                "TaxObject": "sample string 6"
              }
            ]
          }
        ],
        "Taxes": [
          {
            "Total": 1.0,
            "Name": "sample string 2",
            "Base": 3.0,
            "Rate": 4.0,
            "IsRetention": true,
            "IsQuota": true,
            "TaxObject": "sample string 6"
          },
          {
            "Total": 1.0,
            "Name": "sample string 2",
            "Base": 3.0,
            "Rate": 4.0,
            "IsRetention": true,
            "IsQuota": true,
            "TaxObject": "sample string 6"
          }
        ],
        "Date": "sample string 5",
        "PaymentForm": "sample string 6",
        "Currency": "sample string 7",
        "ExchangeRate": 1.0,
        "Amount": 8.0,
        "OperationNumber": "sample string 9",
        "RfcIssuerPayerAccount": "sample string 10",
        "ForeignAccountNamePayer": "sample string 11",
        "PayerAccount": "sample string 12",
        "RfcReceiverBeneficiaryAccount": "sample string 13",
        "BeneficiaryAccount": "sample string 14",
        "ExpectedPaid": 2.0
      }
    ],
    "Donation": {
      "AuthorizationNumber": "sample string 1",
      "AuthorizationDate": "sample string 2",
      "Legend": "sample string 3"
    },
    "ForeignTrade": {
      "Issuer": {
        "Address": {
          "Street": "sample string 1",
          "ExteriorNumber": "sample string 2",
          "InteriorNumber": "sample string 3",
          "Neighborhood": "sample string 4",
          "Reference": "sample string 5",
          "ZipCode": "sample string 6"
        },
        "Curp": "sample string 1"
      },
      "Receiver": {
        "Address": {
          "Street": "sample string 1",
          "ExteriorNumber": "sample string 2",
          "InteriorNumber": "sample string 3",
          "Neighborhood": "sample string 4",
          "Reference": "sample string 5",
          "Locality": "sample string 6",
          "Municipality": "sample string 7",
          "State": "sample string 8",
          "Country": "sample string 9",
          "ZipCode": "sample string 10"
        }
      },
      "Owner": [
        {
          "NumRegIdTrib": "sample string 1",
          "TaxResidence": "sample string 2"
        },
        {
          "NumRegIdTrib": "sample string 1",
          "TaxResidence": "sample string 2"
        }
      ],
      "Recipient": [
        {
          "Name": "sample string 1",
          "NumRegIdTrib": "sample string 2",
          "Addresses": [
            {
              "Street": "sample string 1",
              "ExteriorNumber": "sample string 2",
              "InteriorNumber": "sample string 3",
              "Neighborhood": "sample string 4",
              "Reference": "sample string 5",
              "Locality": "sample string 6",
              "Municipality": "sample string 7",
              "State": "sample string 8",
              "Country": "sample string 9",
              "ZipCode": "sample string 10"
            },
            {
              "Street": "sample string 1",
              "ExteriorNumber": "sample string 2",
              "InteriorNumber": "sample string 3",
              "Neighborhood": "sample string 4",
              "Reference": "sample string 5",
              "Locality": "sample string 6",
              "Municipality": "sample string 7",
              "State": "sample string 8",
              "Country": "sample string 9",
              "ZipCode": "sample string 10"
            }
          ]
        },
        {
          "Name": "sample string 1",
          "NumRegIdTrib": "sample string 2",
          "Addresses": [
            {
              "Street": "sample string 1",
              "ExteriorNumber": "sample string 2",
              "InteriorNumber": "sample string 3",
              "Neighborhood": "sample string 4",
              "Reference": "sample string 5",
              "Locality": "sample string 6",
              "Municipality": "sample string 7",
              "State": "sample string 8",
              "Country": "sample string 9",
              "ZipCode": "sample string 10"
            },
            {
              "Street": "sample string 1",
              "ExteriorNumber": "sample string 2",
              "InteriorNumber": "sample string 3",
              "Neighborhood": "sample string 4",
              "Reference": "sample string 5",
              "Locality": "sample string 6",
              "Municipality": "sample string 7",
              "State": "sample string 8",
              "Country": "sample string 9",
              "ZipCode": "sample string 10"
            }
          ]
        }
      ],
      "ReasonForTransfer": "sample string 1",
      "Commodity": [
        {
          "SpecificDescriptions": [
            {
              "Brand": "sample string 1",
              "Model": "sample string 2",
              "SubModel": "sample string 3",
              "SerialNumber": "sample string 4"
            },
            {
              "Brand": "sample string 1",
              "Model": "sample string 2",
              "SubModel": "sample string 3",
              "SerialNumber": "sample string 4"
            }
          ],
          "IdentificationNumber": "sample string 1",
          "TariffFraction": "sample string 2",
          "CustomsQuantity": 1.0,
          "CustomsUnit": "sample string 3",
          "CustomsUnitValue": 1.0,
          "ValueInDolar": 4.0
        },
        {
          "SpecificDescriptions": [
            {
              "Brand": "sample string 1",
              "Model": "sample string 2",
              "SubModel": "sample string 3",
              "SerialNumber": "sample string 4"
            },
            {
              "Brand": "sample string 1",
              "Model": "sample string 2",
              "SubModel": "sample string 3",
              "SerialNumber": "sample string 4"
            }
          ],
          "IdentificationNumber": "sample string 1",
          "TariffFraction": "sample string 2",
          "CustomsQuantity": 1.0,
          "CustomsUnit": "sample string 3",
          "CustomsUnitValue": 1.0,
          "ValueInDolar": 4.0
        }
      ],
      "RequestCode": "sample string 2",
      "Incoterm": "sample string 3",
      "ExchangeRateUSD": 1.0,
      "TotalUSD": 1.0,
      "OriginCertificate": true,
      "OriginCertificateNumber": "sample string 4",
      "ReliableExporterNumber": "sample string 5",
      "Observations": "sample string 6"
    },
    "Payroll": {
      "Issuer": {
        "EntitySNCF": {
          "OriginSource": "sample string 1",
          "AmountOriginSource": 1.0
        },
        "Curp": "sample string 1",
        "EmployerRegistration": "sample string 2",
        "FromEmployerRfc": "sample string 3"
      },
      "Employee": {
        "Outsourcing": [
          {
            "RfcContractor": "sample string 1",
            "PercentageTime": 2.0
          },
          {
            "RfcContractor": "sample string 1",
            "PercentageTime": 2.0
          }
        ],
        "Curp": "sample string 1",
        "SocialSecurityNumber": "sample string 2",
        "StartDateLaborRelations": "2026-09-03T13:04:51.427735-06:00",
        "ContractType": "sample string 3",
        "Unionized": true,
        "TypeOfJourney": "sample string 4",
        "RegimeType": "sample string 5",
        "EmployeeNumber": "sample string 6",
        "Department": "sample string 7",
        "Position": "sample string 8",
        "PositionRisk": "sample string 9",
        "FrequencyPayment": "sample string 10",
        "Bank": "sample string 11",
        "BankAccount": "sample string 12",
        "BaseSalary": 1.0,
        "DailySalary": 1.0,
        "FederalEntityKey": "sample string 13"
      },
      "Perceptions": {
        "Details": [
          {
            "ActionsOrTitles": {
              "MarketValue": 1.0,
              "PriceWhenGranting": 2.0
            },
            "ExtraHours": [
              {
                "Days": 1,
                "HoursType": "sample string 2",
                "ExtraHours": 3,
                "PaidAmount": 4.0
              },
              {
                "Days": 1,
                "HoursType": "sample string 2",
                "ExtraHours": 3,
                "PaidAmount": 4.0
              }
            ],
            "PerceptionType": "sample string 1",
            "Code": "sample string 2",
            "Description": "sample string 3",
            "TaxedAmount": 4.0,
            "ExemptAmount": 5.0
          },
          {
            "ActionsOrTitles": {
              "MarketValue": 1.0,
              "PriceWhenGranting": 2.0
            },
            "ExtraHours": [
              {
                "Days": 1,
                "HoursType": "sample string 2",
                "ExtraHours": 3,
                "PaidAmount": 4.0
              },
              {
                "Days": 1,
                "HoursType": "sample string 2",
                "ExtraHours": 3,
                "PaidAmount": 4.0
              }
            ],
            "PerceptionType": "sample string 1",
            "Code": "sample string 2",
            "Description": "sample string 3",
            "TaxedAmount": 4.0,
            "ExemptAmount": 5.0
          }
        ],
        "Retirement": {
          "TotalASinglePayment": 1.0,
          "TotalParciality": 1.0,
          "DailyAmount": 1.0,
          "AccumulatedIncome": 1.0,
          "NonAccumulatedIncome": 2.0
        },
        "Indemnification": {
          "TotalPaid": 1.0,
          "YearsOfService": 2.0,
          "LastMonthlySalaryOrd": 3.0,
          "AccumulatedIncome": 4.0,
          "NonAccumulatedIncome": 5.0
        }
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "sample string 1",
            "Code": "sample string 2",
            "Description": "sample string 3",
            "Amount": 4.0
          },
          {
            "DeduccionType": "sample string 1",
            "Code": "sample string 2",
            "Description": "sample string 3",
            "Amount": 4.0
          }
        ]
      },
      "OtherPayments": [
        {
          "EmploymentSubsidy": {
            "Amount": 1.0
          },
          "Compensation": {
            "PositiveBalance": 1.0,
            "Year": 2,
            "RemainingPositiveBalance": 3.0
          },
          "OtherPaymentType": "sample string 1",
          "Code": "sample string 2",
          "Description": "sample string 3",
          "Amount": 4.0
        },
        {
          "EmploymentSubsidy": {
            "Amount": 1.0
          },
          "Compensation": {
            "PositiveBalance": 1.0,
            "Year": 2,
            "RemainingPositiveBalance": 3.0
          },
          "OtherPaymentType": "sample string 1",
          "Code": "sample string 2",
          "Description": "sample string 3",
          "Amount": 4.0
        }
      ],
      "Incapacities": [
        {
          "Days": 1,
          "Type": "sample string 2",
          "Amount": 1.0
        },
        {
          "Days": 1,
          "Type": "sample string 2",
          "Amount": 1.0
        }
      ],
      "Type": "sample string 1",
      "PaymentDate": "2026-09-03T13:04:51.427735-06:00",
      "InitialPaymentDate": "2026-09-03T13:04:51.427735-06:00",
      "FinalPaymentDate": "2026-09-03T13:04:51.427735-06:00",
      "DaysPaid": 4.0
    },
    "TaxLegends": {
      "Legends": [
        {
          "TaxProvision": "sample string 1",
          "Norm": "sample string 2",
          "Text": "sample string 3"
        },
        {
          "TaxProvision": "sample string 1",
          "Norm": "sample string 2",
          "Text": "sample string 3"
        }
      ]
    },
    "CartaPorte31": {
      "RegimenesAduaneros": [
        {
          "RegimenAduanero": "sample string 1"
        },
        {
          "RegimenAduanero": "sample string 1"
        }
      ],
      "IdCCP": "sample string 1",
      "TranspInternac": "sample string 2",
      "EntradaSalidaMerc": "sample string 3",
      "PaisOrigenDestino": "sample string 4",
      "ViaEntradaSalida": "sample string 5",
      "TotalDistRec": 1.0,
      "RegistroISTMO": "sample string 6",
      "UbicacionPoloOrigen": "sample string 7",
      "UbicacionPoloDestino": "sample string 8",
      "Ubicaciones": [
        {
          "TranspInternac": 0,
          "Id": "sample string 1",
          "TiposTransporte": [
            0,
            0
          ],
          "Domicilio": {
            "Calle": "sample string 1",
            "NumeroExterior": "sample string 2",
            "NumeroInterior": "sample string 3",
            "Colonia": "sample string 4",
            "Localidad": "sample string 5",
            "Referencia": "sample string 6",
            "Municipio": "sample string 7",
            "MunicipioName": "sample string 8",
            "Estado": "sample string 9",
            "Pais": "sample string 10",
            "CodigoPostal": "sample string 11"
          },
          "TipoUbicacion": "sample string 2",
          "IDUbicacion": "sample string 3",
          "RFCRemitenteDestinatario": "sample string 4",
          "NombreRemitenteDestinatario": "sample string 5",
          "NumRegIdTrib": "sample string 6",
          "ResidenciaFiscal": "sample string 7",
          "NumEstacion": "sample string 8",
          "NombreEstacion": "sample string 9",
          "NavegacionTrafico": "sample string 10",
          "FechaHoraSalidaLlegada": "sample string 11",
          "TipoEstacion": "sample string 12",
          "DistanciaRecorrida": 13.0
        },
        {
          "TranspInternac": 0,
          "Id": "sample string 1",
          "TiposTransporte": [
            0,
            0
          ],
          "Domicilio": {
            "Calle": "sample string 1",
            "NumeroExterior": "sample string 2",
            "NumeroInterior": "sample string 3",
            "Colonia": "sample string 4",
            "Localidad": "sample string 5",
            "Referencia": "sample string 6",
            "Municipio": "sample string 7",
            "MunicipioName": "sample string 8",
            "Estado": "sample string 9",
            "Pais": "sample string 10",
            "CodigoPostal": "sample string 11"
          },
          "TipoUbicacion": "sample string 2",
          "IDUbicacion": "sample string 3",
          "RFCRemitenteDestinatario": "sample string 4",
          "NombreRemitenteDestinatario": "sample string 5",
          "NumRegIdTrib": "sample string 6",
          "ResidenciaFiscal": "sample string 7",
          "NumEstacion": "sample string 8",
          "NombreEstacion": "sample string 9",
          "NavegacionTrafico": "sample string 10",
          "FechaHoraSalidaLlegada": "sample string 11",
          "TipoEstacion": "sample string 12",
          "DistanciaRecorrida": 13.0
        }
      ],
      "Mercancias": {
        "LogisticaInversaRecoleccionDevolucion": "sample string 1",
        "Mercancia": [
          {
            "SectorCOFEPRIS": "sample string 1",
            "NombreIngredienteActivo": "sample string 2",
            "NomQuimico": "sample string 3",
            "DenominacionGenericaProd": "sample string 4",
            "DenominacionDistintivaProd": "sample string 5",
            "Fabricante": "sample string 6",
            "FechaCaducidad": "sample string 7",
            "LoteMedicamento": "sample string 8",
            "FormaFarmaceutica": "sample string 9",
            "CondicionesEspTransp": "sample string 10",
            "RegistroSanitarioFolioAutorizacion": "sample string 11",
            "PermisoImportacion": "sample string 12",
            "FolioImpoVUCEM": "sample string 13",
            "NumCAS": "sample string 14",
            "RazonSocialEmpImp": "sample string 15",
            "NumRegSanPlagCOFEPRIS": "sample string 16",
            "DatosFabricante": "sample string 17",
            "DatosFormulador": "sample string 18",
            "DatosMaquilador": "sample string 19",
            "UsoAutorizado": "sample string 20",
            "TipoMateria": "sample string 21",
            "DescripcionMateria": "sample string 22",
            "GuiasIdentificacion": [
              {
                "NumeroGuiaIdentificacion": "sample string 1",
                "DescripGuiaIdentificacion": "sample string 2",
                "PesoGuiaIdentificacion": 3.0
              },
              {
                "NumeroGuiaIdentificacion": "sample string 1",
                "DescripGuiaIdentificacion": "sample string 2",
                "PesoGuiaIdentificacion": 3.0
              }
            ],
            "CantidadTransporta": [
              {
                "Cantidad": 1.0,
                "IDOrigen": "sample string 2",
                "IDDestino": "sample string 3",
                "CvesTransporte": "sample string 4"
              },
              {
                "Cantidad": 1.0,
                "IDOrigen": "sample string 2",
                "IDDestino": "sample string 3",
                "CvesTransporte": "sample string 4"
              }
            ],
            "DocumentacionAduanera": [
              {
                "TranspInternac": "sample string 1",
                "EntradaSalidaMerc": "sample string 2",
                "TipoDocumento": "sample string 3",
                "NumPedimento": "sample string 4",
                "IdentDocAduanero": "sample string 5",
                "RFCImpo": "sample string 6"
              },
              {
                "TranspInternac": "sample string 1",
                "EntradaSalidaMerc": "sample string 2",
                "TipoDocumento": "sample string 3",
                "NumPedimento": "sample string 4",
                "IdentDocAduanero": "sample string 5",
                "RFCImpo": "sample string 6"
              }
            ],
            "DetalleMercancia": {
              "UnidadPesoMerc": "sample string 1",
              "PesoBruto": 2.0,
              "PesoNeto": 3.0,
              "PesoTara": 4.0,
              "NumPiezas": 5
            },
            "TiposTransporte": [
              0,
              0
            ],
            "TranspInternac": "sample string 23",
            "EntradaSalidaMerc": "sample string 24",
            "BienesTransp": "sample string 25",
            "ClaveSTCC": "sample string 26",
            "Descripcion": "sample string 27",
            "Cantidad": 28.0,
            "ClaveUnidad": "sample string 29",
            "Unidad": "sample string 30",
            "Dimensiones": "sample string 31",
            "MaterialPeligroso": "sample string 32",
            "CveMaterialPeligroso": "sample string 33",
            "Embalaje": "sample string 34",
            "DescripEmbalaje": "sample string 35",
            "PesoEnKg": 36.0,
            "ValorMercancia": 37.0,
            "Moneda": "sample string 38",
            "FraccionArancelaria": "sample string 39",
            "UUIDComercioExt": "sample string 40"
          },
          {
            "SectorCOFEPRIS": "sample string 1",
            "NombreIngredienteActivo": "sample string 2",
            "NomQuimico": "sample string 3",
            "DenominacionGenericaProd": "sample string 4",
            "DenominacionDistintivaProd": "sample string 5",
            "Fabricante": "sample string 6",
            "FechaCaducidad": "sample string 7",
            "LoteMedicamento": "sample string 8",
            "FormaFarmaceutica": "sample string 9",
            "CondicionesEspTransp": "sample string 10",
            "RegistroSanitarioFolioAutorizacion": "sample string 11",
            "PermisoImportacion": "sample string 12",
            "FolioImpoVUCEM": "sample string 13",
            "NumCAS": "sample string 14",
            "RazonSocialEmpImp": "sample string 15",
            "NumRegSanPlagCOFEPRIS": "sample string 16",
            "DatosFabricante": "sample string 17",
            "DatosFormulador": "sample string 18",
            "DatosMaquilador": "sample string 19",
            "UsoAutorizado": "sample string 20",
            "TipoMateria": "sample string 21",
            "DescripcionMateria": "sample string 22",
            "GuiasIdentificacion": [
              {
                "NumeroGuiaIdentificacion": "sample string 1",
                "DescripGuiaIdentificacion": "sample string 2",
                "PesoGuiaIdentificacion": 3.0
              },
              {
                "NumeroGuiaIdentificacion": "sample string 1",
                "DescripGuiaIdentificacion": "sample string 2",
                "PesoGuiaIdentificacion": 3.0
              }
            ],
            "CantidadTransporta": [
              {
                "Cantidad": 1.0,
                "IDOrigen": "sample string 2",
                "IDDestino": "sample string 3",
                "CvesTransporte": "sample string 4"
              },
              {
                "Cantidad": 1.0,
                "IDOrigen": "sample string 2",
                "IDDestino": "sample string 3",
                "CvesTransporte": "sample string 4"
              }
            ],
            "DocumentacionAduanera": [
              {
                "TranspInternac": "sample string 1",
                "EntradaSalidaMerc": "sample string 2",
                "TipoDocumento": "sample string 3",
                "NumPedimento": "sample string 4",
                "IdentDocAduanero": "sample string 5",
                "RFCImpo": "sample string 6"
              },
              {
                "TranspInternac": "sample string 1",
                "EntradaSalidaMerc": "sample string 2",
                "TipoDocumento": "sample string 3",
                "NumPedimento": "sample string 4",
                "IdentDocAduanero": "sample string 5",
                "RFCImpo": "sample string 6"
              }
            ],
            "DetalleMercancia": {
              "UnidadPesoMerc": "sample string 1",
              "PesoBruto": 2.0,
              "PesoNeto": 3.0,
              "PesoTara": 4.0,
              "NumPiezas": 5
            },
            "TiposTransporte": [
              0,
              0
            ],
            "TranspInternac": "sample string 23",
            "EntradaSalidaMerc": "sample string 24",
            "BienesTransp": "sample string 25",
            "ClaveSTCC": "sample string 26",
            "Descripcion": "sample string 27",
            "Cantidad": 28.0,
            "ClaveUnidad": "sample string 29",
            "Unidad": "sample string 30",
            "Dimensiones": "sample string 31",
            "MaterialPeligroso": "sample string 32",
            "CveMaterialPeligroso": "sample string 33",
            "Embalaje": "sample string 34",
            "DescripEmbalaje": "sample string 35",
            "PesoEnKg": 36.0,
            "ValorMercancia": 37.0,
            "Moneda": "sample string 38",
            "FraccionArancelaria": "sample string 39",
            "UUIDComercioExt": "sample string 40"
          }
        ],
        "Autotransporte": {
          "IdentificacionVehicular": {
            "ConfigVehicular": "sample string 1",
            "PlacaVM": "sample string 2",
            "AnioModeloVM": 3,
            "PesoBrutoVehicular": 4.0
          },
          "Remolques": [
            {
              "SubTipoRem": "sample string 1",
              "Placa": "sample string 2"
            },
            {
              "SubTipoRem": "sample string 1",
              "Placa": "sample string 2"
            }
          ],
          "PermSCT": "sample string 1",
          "NumPermisoSCT": "sample string 2",
          "Seguros": {
            "AseguraRespCivil": "sample string 1",
            "PolizaRespCivil": "sample string 2",
            "AseguraMedAmbiente": "sample string 3",
            "PolizaMedAmbiente": "sample string 4",
            "AseguraCarga": "sample string 5",
            "PolizaCarga": "sample string 6",
            "PrimaSeguro": 7.0
          }
        },
        "TransporteMaritimo": {
          "Puntal": 1.0,
          "PermisoTempNavegacion": "sample string 2",
          "Contenedor": [
            {
              "IdCCPRelacionado": "sample string 1",
              "PlacaVMCCP": "sample string 2",
              "FechaCertificacionCCP": "sample string 3",
              "RemolquesCCP": [
                {
                  "SubTipoRemCCP": "sample string 1",
                  "PlacaCCP": "sample string 2"
                },
                {
                  "SubTipoRemCCP": "sample string 1",
                  "PlacaCCP": "sample string 2"
                }
              ],
              "TipoContenedor": "sample string 4",
              "MatriculaContenedor": "sample string 5",
              "NumPrecinto": "sample string 6"
            },
            {
              "IdCCPRelacionado": "sample string 1",
              "PlacaVMCCP": "sample string 2",
              "FechaCertificacionCCP": "sample string 3",
              "RemolquesCCP": [
                {
                  "SubTipoRemCCP": "sample string 1",
                  "PlacaCCP": "sample string 2"
                },
                {
                  "SubTipoRemCCP": "sample string 1",
                  "PlacaCCP": "sample string 2"
                }
              ],
              "TipoContenedor": "sample string 4",
              "MatriculaContenedor": "sample string 5",
              "NumPrecinto": "sample string 6"
            }
          ],
          "RemolquesCCP": [
            {
              "SubTipoRemCCP": "sample string 1",
              "PlacaCCP": "sample string 2"
            },
            {
              "SubTipoRemCCP": "sample string 1",
              "PlacaCCP": "sample string 2"
            }
          ],
          "PermSCT": "sample string 3",
          "NumPermisoSCT": "sample string 4",
          "NombreAseg": "sample string 5",
          "NumPolizaSeguro": "sample string 6",
          "TipoEmbarcacion": "sample string 7",
          "Matricula": "sample string 8",
          "NumeroOMI": "sample string 9",
          "AnioEmbarcacion": 10,
          "NombreEmbarc": "sample string 11",
          "NacionalidadEmbarc": "sample string 12",
          "UnidadesDeArqBruto": 13.0,
          "TipoCarga": "sample string 14",
          "Eslora": 15.0,
          "Manga": 16.0,
          "Calado": 17.0,
          "LineaNaviera": "sample string 18",
          "NombreAgenteNaviero": "sample string 19",
          "NumAutorizacionNaviero": "sample string 20",
          "NumViaje": "sample string 21",
          "NumConocEmbarc": "sample string 22"
        },
        "TransporteAereo": {
          "PermSCT": "sample string 1",
          "NumPermisoSCT": "sample string 2",
          "MatriculaAeronave": "sample string 3",
          "NombreAseg": "sample string 4",
          "NumPolizaSeguro": "sample string 5",
          "NumeroGuia": "sample string 6",
          "LugarContrato": "sample string 7",
          "CodigoTransportista": "sample string 8",
          "RFCEmbarcador": "sample string 9",
          "NumRegIdTribEmbarc": "sample string 10",
          "ResidenciaFiscalEmbarc": "sample string 11",
          "NombreEmbarcador": "sample string 12"
        },
        "TransporteFerroviario": {
          "TipoDeServicio": "sample string 1",
          "TipoDeTrafico": "sample string 2",
          "NombreAseg": "sample string 3",
          "NumPolizaSeguro": "sample string 4",
          "DerechosDePaso": [
            {
              "TipoDerechoDePaso": "sample string 1",
              "KilometrajePagado": 2.0
            },
            {
              "TipoDerechoDePaso": "sample string 1",
              "KilometrajePagado": 2.0
            }
          ],
          "Carro": [
            {
              "TipoDeServicio": "sample string 1",
              "TipoCarro": "sample string 2",
              "MatriculaCarro": "sample string 3",
              "GuiaCarro": "sample string 4",
              "ToneladasNetasCarro": 5.0,
              "Contenedor": [
                {
                  "TipoContenedor": "sample string 1",
                  "PesoContenedorVacio": 2.0,
                  "PesoNetoMercancia": 3.0
                },
                {
                  "TipoContenedor": "sample string 1",
                  "PesoContenedorVacio": 2.0,
                  "PesoNetoMercancia": 3.0
                }
              ]
            },
            {
              "TipoDeServicio": "sample string 1",
              "TipoCarro": "sample string 2",
              "MatriculaCarro": "sample string 3",
              "GuiaCarro": "sample string 4",
              "ToneladasNetasCarro": 5.0,
              "Contenedor": [
                {
                  "TipoContenedor": "sample string 1",
                  "PesoContenedorVacio": 2.0,
                  "PesoNetoMercancia": 3.0
                },
                {
                  "TipoContenedor": "sample string 1",
                  "PesoContenedorVacio": 2.0,
                  "PesoNetoMercancia": 3.0
                }
              ]
            }
          ]
        },
        "PesoBrutoTotal": 72.0,
        "UnidadPeso": "sample string 3",
        "PesoNetoTotal": 10.0,
        "CargoPorTasacion": 5.0,
        "NumTotalMercancias": 2
      },
      "FiguraTransporte": [
        {
          "NombreFigura": "sample string 1",
          "PartesTransporte": [
            {
              "ParteTransporte": "sample string 1"
            },
            {
              "ParteTransporte": "sample string 1"
            }
          ],
          "TipoFigura": "sample string 2",
          "RFCFigura": "sample string 3",
          "NumLicencia": "sample string 4",
          "NumRegIdTribFigura": "sample string 5",
          "ResidenciaFiscalFigura": "sample string 6",
          "Domicilio": {
            "Calle": "sample string 1",
            "NumeroExterior": "sample string 2",
            "NumeroInterior": "sample string 3",
            "Colonia": "sample string 4",
            "Localidad": "sample string 5",
            "Referencia": "sample string 6",
            "Municipio": "sample string 7",
            "MunicipioName": "sample string 8",
            "Estado": "sample string 9",
            "Pais": "sample string 10",
            "CodigoPostal": "sample string 11"
          }
        },
        {
          "NombreFigura": "sample string 1",
          "PartesTransporte": [
            {
              "ParteTransporte": "sample string 1"
            },
            {
              "ParteTransporte": "sample string 1"
            }
          ],
          "TipoFigura": "sample string 2",
          "RFCFigura": "sample string 3",
          "NumLicencia": "sample string 4",
          "NumRegIdTribFigura": "sample string 5",
          "ResidenciaFiscalFigura": "sample string 6",
          "Domicilio": {
            "Calle": "sample string 1",
            "NumeroExterior": "sample string 2",
            "NumeroInterior": "sample string 3",
            "Colonia": "sample string 4",
            "Localidad": "sample string 5",
            "Referencia": "sample string 6",
            "Municipio": "sample string 7",
            "MunicipioName": "sample string 8",
            "Estado": "sample string 9",
            "Pais": "sample string 10",
            "CodigoPostal": "sample string 11"
          }
        }
      ]
    },
    "ValesDeDespensa": {
      "Conceptos": [
        {
          "Identificador": "sample string 1",
          "Fecha": "2026-09-03T13:04:51.427735-06:00",
          "Rfc": "sample string 3",
          "Curp": "sample string 4",
          "Nombre": "sample string 5",
          "NumSeguridadSocial": "sample string 6",
          "Importe": 7.0
        },
        {
          "Identificador": "sample string 1",
          "Fecha": "2026-09-03T13:04:51.427735-06:00",
          "Rfc": "sample string 3",
          "Curp": "sample string 4",
          "Nombre": "sample string 5",
          "NumSeguridadSocial": "sample string 6",
          "Importe": 7.0
        }
      ],
      "RegistroPatronal": "sample string 1",
      "NumeroDeCuenta": "sample string 2",
      "Total": 3.0
    }
  },
  "Observations": "sample string 13",
  "OrderNumber": "sample string 14",
  "PaymentBankName": "sample string 15"
}
```

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Id": "7eo51BvzV-E16gBx3nnxfQ2",
  "CfdiType": "ingreso",
  "Serie": "R",
  "Folio": "1",
  "Date": "2018-02-27T10:46:19",
  "PaymentTerms": "03 - Transferencia electrónica de fondos",
  "PaymentConditions": "CREDITO A SIETE DIAS",
  "PaymentMethod": "PUE - Pago en una sola exhibición",
  "ExpeditionPlace": "78116",
  "ExchangeRate": 0.0,
  "Currency": "MXN - Peso Mexicano",
  "Subtotal": 1600.0,
  "Discount": 0.0,
  "Total": 1856.0,
  "Observations": "",
  "Issuer": {
    "FiscalRegime": "601 - General de Ley Personas Morales",
    "Rfc": "ESO1202108R2",
    "TaxName": "EXPRESION EN SOFTWARE"
  },
  "Receiver": {
    "Rfc": "RSS2202108U5",
    "Name": "RADIAL SOFTWARE SOLUTIONS"
  },
  "Items": [
    {
      "Discount": 0.0,
      "Quantity": 2.0,
      "Unit": "E49 - NO APLICA",
      "Description": "Estudios de viabilidad",
      "UnitValue": 50.0,
      "Total": 100.0
    },
    {
      "Discount": 0.0,
      "Quantity": 15.0,
      "Unit": "E49 - NO APLICA",
      "Description": "SERVICIO DE COLOCACION",
      "UnitValue": 100.0,
      "Total": 1500.0
    }
  ],
  "Taxes": [
    {
      "Total": 256.0,
      "Name": "IVA",
      "Rate": 16.0,
      "Type": "transferred"
    }
  ],
  "Complement": {
    "TaxStamp": {
      "Uuid": "215CEC43-7E57-44AC-9D63-B54BBC4745BD",
      "Date": "2018-02-27T10:46:23",
      "CfdiSign": "EFirmqT9Ig9BYKPENRgVWaahM6qrejl0dmT5uyfm2/kaBGJ903odRxR1kchP0at6m4vjkrIa0gzQ58psbpNrRUi+2IRbvmITiC+W0u+RPHZTZoa6zZXVDmqYDjDpKGHE1zw202EOm3RTmYEqzkYNcLu8b15tdqqdiUqa4EIrFszFs3N5NsaCv7mwAidteCpuQi99sSfLNvsThs4JYBV1ahMz5zghysmPuMoQGf5rOe9ELAYc2OSQ7SdY0M5zECAUz7N4wmI1tF1LdIurmxpfbZq+IBtL1zG9B9WqhGRJSvVdiCPJTY6KzSQ4E4CUjx2ZX9/57q9uWRHr4cxVhhMfTw==",
      "SatCertNumber": "20001000000300022323",
      "SatSign": "Go3Q/iFSVFKw9qohv3RIk+86B9jaqEEYjYqIrI498afSO7MiNDyB+TDC3cLTOZ7g+cRJx9aMGEAldoQ0jnAZA7FEsppE1YI6QpUzKoRUzy43azepQxueyTd0YSBq1WkeXme5LGTTiKTx19sSThPPCTUUbSl8P8mjTkjlA8RWOdHq4hU5X9PDqGj8DmIp8276ENTkHdB7Q2Q0zKv4tY55yIzPxcrhFS4pji/KK0BogjbbXw4/cd5ippXohAsfwocNvIkqWutWTKUAh4BKKZzZNmTByjYql+QRE2NfHf2hIdchMVPIKWR7i6OXjzPL4fMYAeq1cXf9nr64kCEBvi2rpg==",
      "RfcProvCertif": "FLI081010EK2"
    }
  }
}
```
