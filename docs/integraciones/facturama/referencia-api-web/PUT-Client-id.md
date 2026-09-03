<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-Client-id · capturado 2026-09-03 -->

-

# Actualiza la información del cliente.

### Parámetros URI

id  **(
string
 )**

Identificador unico del cliente

**
**

  Required

### Atributos de la petición

Email  **(
string
 )**

Email del cliente

**
**

  Required

  Data type: EmailAddress

  Max length: 200

EmailOp1  **(
string
 )**

Email opcional 1 del cliente

**
**

  Matching regular expression pattern: [a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?

  Max length: 200

EmailOp2  **(
string
 )**

Email opcional 2 del cliente

**
**

  Matching regular expression pattern: [a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?

  Max length: 200

Address  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Dirección del receptor (opcional)

**
**

Rfc  **(
string
 )**

Clave del Registro Federal de Contribuyentes

**
**

  Required

  Matching regular expression pattern: [A-Z,Ñ,&]{3,4}[0-9]{2}[0-1][0-9][0-3][0-9][A-Z,0-9]?[A-Z,0-9]?[0-9,A-Z]?

Name  **(
string
 )**

Nombre, denominación o razón social del contribuyente receptor del comprobante.

**
**

  Required

  String length: inclusive between 1 and 300

FiscalRegime  **(
string
 )**

Régimen fiscal del contribuyente receptor del comprobante.

**
**

CfdiUse  **(
string
 )**

Clave del uso por defecto que dará a las facturas el receptor del CFDI (Vea el catálogo de   Usos del Cfdi)

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

Número de registro de identidad fiscal  (Solo para clientes extranjeros)

**
**

### Argumentos de respuesta

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/Client/{id}**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Email": "manuelromeroalva@gmail.com",
  "EmailOp1": "",
  "EmailOp2": "",
  "Address": {
    "Street": "Av Seguridad Soc",
    "ExteriorNumber": "123",
    "InteriorNumber": "",
    "Neighborhood": "Fidel Velazquez",
    "ZipCode": "78436",
    "Locality": "",
    "Municipality": "Soledad de Graciano Sánchez",
    "State": "San Luis Potosí",
    "Country": "Mex"
  },
  "Rfc": "ROAM861021459",
  "Name": "Manuel Romero Alva",
  "CfdiUse": "P01",
  "TaxResidence": "",
  "NumRegIdTrib": ""
}
```
