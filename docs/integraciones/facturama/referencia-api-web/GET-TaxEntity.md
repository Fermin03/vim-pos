<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-TaxEntity · capturado 2026-09-03 -->

-

# Obtiene la Información Fiscal de la cuenta

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

[TaxEntityInfoViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxEntityInfoViewModel)

FiscalRegime  **(
string
 )**

nombre del régimen en el que tributa el contribuyente

**
**

ComercialName  **(
string
 )**

nombre comercial

**
**

Rfc  **(
string
 )**

Clave del Registro Federal de Contribuyentes correspondiente al contribuyente

**
**

TaxName  **(
string
 )**

Nodo para enlistar los detalles del nombre del contribuyente

**
**

Email  **(
string
 )**

Correo electronico del contributente

**
**

OptionalEmail  **(
string
 )**

Correo electronico opcional del contributente

**
**

Phone  **(
string
 )**

Telefono del contribuyente

**
**

TaxAddress  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Nodo para enlistar los detalles de la dirección del contribuyente

**
**

IssuedIn  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Nodo para enlistar los detalles de una dirección de expedicion

**
**

Csd  **(
[CsdBindingModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CsdBindingModel) )**

Nodo para enlistar los certificados

**
**

PasswordSat  **(
string
 )**

**
**

UrlLogo  **(
string
 )**

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/TaxEntity**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "FiscalRegime": "601",
  "ComercialName": "DECSAS111",
  "Rfc": "EKU9003173C9",
  "TaxName": "nombre12",
  "Email": "humbertos@facturama.mx",
  "Phone": "4448253053",
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
  },
  "IssuedIn": {
    "Street": "street ex",
    "ExteriorNumber": "extnum ex",
    "InteriorNumber": "interior number ex",
    "Neighborhood": "neighborhood ex",
    "ZipCode": "12345",
    "Locality": "localitty ex",
    "Municipality": "city ex",
    "State": "NUEVO LEON",
    "Country": "MEXICO"
  },
  "Csd": {
    "Certificate": "AAA010101AAAPruebas__CSD.cer",
    "PrivateKey": "AAA010101AAAPruebas__CSD.key",
    "PrivateKeyPassword": "12345678a"
  },
  "UrlLogo": "http://Facturama.mx/Files/Logos/AAA010101AAA-180118153149.png"
}
```
