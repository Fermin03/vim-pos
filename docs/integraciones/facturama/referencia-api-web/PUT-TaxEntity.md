<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-TaxEntity · capturado 2026-09-03 -->

-

# Actualiza una Entidad Fiscal

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

FiscalRegime  **(
string
 )**

Atributo requerido para incorporar el nombre del régimen en el que tributa el contribuyente

**
**

  Required

  String length: inclusive between 1 and 100

ComercialName  **(
string
 )**

Nombre Comercial

**
**

Rfc  **(
string
 )**

Atributo requerido para precisar la Clave del Registro Federal de Contribuyentes correspondiente al contribuyente

**
**

  Required

  Matching regular expression pattern: [A-Z,Ñ,&]{3,4}[0-9]{2}[0-1][0-9][0-3][0-9][A-Z,0-9]?[A-Z,0-9]?[0-9,A-Z]?

TaxName  **(
string
 )**

Modelo del tipo TaxName Requerido

**
**

  Required

  String length: inclusive between 1 and 254

Email  **(
string
 )**

Email de la entidad Fiscal

**
**

  Required

  Data type: EmailAddress

OptionalEmail  **(
string
 )**

Email opcional de la entidad Fiscal

**
**

Phone  **(
string
 )**

Telefono de la entidad Fiscal

**
**

  Data type: PhoneNumber

TaxAddress  **(
[TaxAddress](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxAddress) )**

Modelo del tipo TaxAddress Requerido

**
**

  Required

PasswordSat  **(
string
 )**

Contraseña de acceso al portal del SAT

**
**

### Argumentos de respuesta

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/TaxEntity**

## Ejemplo de Petición

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
    "ExteriorNumber": "203",
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
