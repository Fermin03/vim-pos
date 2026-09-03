<!-- fuente: https://apisandbox.facturama.mx/docs/api/POST-Product · capturado 2026-09-03 -->

-

# Agrega un Producto o servicio.

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

Unit  **(
string
 )**

Unidad de medida aplicable al producto. La unidad debe corresponder con la descripción del concepto

**
**

  Required

  Data type: Text

  String length: inclusive between 1 and 20

UnitCode  **(
string
 )**

Código de la unidad de medida según el catálogo del SAT (requerido) [vea el catálogo "Unidades"]

**
**

IdentificationNumber  **(
string
 )**

Número de parte identificador del producto. La clave de servicio, SKU o equivalente

**
**

  Data type: Text

  String length: inclusive between 0 and 50

Name  **(
string
 )**

Nombre corto del producto

**
**

  Required

  Data type: Text

  String length: inclusive between 2 and 50

Description  **(
string
 )**

Descripción del producto, o nombre ampliado

**
**

  Required

  Data type: Text

Price  **(
decimal number
 )**

Valor o precio unitario del producto

**
**

  Required

  Data type: Currency

CodeProdServ  **(
string
 )**

Clave del Producto o servicio segun el catalogo del SAT (requerido) [vea el catálogo "Códigos de productos y servicios"]

**
**

CodeProdServName  **(
string
 )**

Nombre del CodeProdServ

**
**

CuentaPredial  **(
string
 )**

Atributo para precisar el número de la cuenta predial del inmueble cubierto por el presente concepto, o bien para incorporar
            los datos de identificación del certificado de participación inmobiliaria no amortizable, tratándose de arrendamiento.

**
**

  Matching regular expression pattern: [0-9]{1,150}

  String length: inclusive between 1 and 150

CuentasPredial  **(
        Atributos de
string

 )**

cfdi 4.0 Atributo para precisar el número de la cuenta predial del inmueble cubierto por el presente concepto, o bien para incorporar
             los datos de identificación del certificado de participación inmobiliaria no amortizable, tratándose de arrendamiento.

**
**

NumerosPedimento  **(
        Atributos de
string

 )**

Nodo opcional para listar el(los) número(s) de pedimento(s)
            que amparan la importación del bien, aplicable cuando se trate de
            ventas de primera mano de mercancías importadas o se trate de operaciones de
            comercio exterior con bienes o servicios.
            Patrón [0-9]{2}  [0-9]{2}  [0-9]{4}  [0-9]{7}

**
**

Complement  **(
[ItemComplemenv33](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemComplemenv33) )**

Complemento del Producto donde se incluyen los nodos complementarios de extensión al concepto definidos por el SAT, de acuerdo con las disposiciones
            particulares para un sector o actividad específica (Nodo Opcional)

**
**

Taxes  **(
        Atributos de
[ProductsTaxesModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ProductsTaxesModel)
 )**

Impuestos federales aplicables al producto (Nodo Opcional)

**
**

ObjetoImp  **(
string
 )**

Clave correspondiente para indicar si la operación comercial es objeto o no de impuesto

**
**

### Argumentos de respuesta

Regresa el detalle del producto creado.

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

#### POST

**https://apisandbox.facturama.mx/Product**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Unit": "Servicio",
  "UnitCode": "E48",
  "IdentificationNumber": "WEB003",
  "Name": "Sitio Web CMS",
  "Description": "Desarrollo e implementación de sitio web empleando un CMS",
  "Price": 6500.0,
  "CodeProdServ": "43232408",
  "CuentaPredial": "123",
  "Taxes": [
    {
      "Name": "IVA",
      "Rate": 0.16,
      "IsRetention": false,
      "IsFederalTax": true
    },
    {
      "Name": "ISR",
      "IsRetention": true,
      "IsFederalTax": true,
      "Total": 0.1
    },
    {
      "Name": "IVA",
      "IsRetention": true,
      "IsFederalTax": true,
      "Total": 0.106667
    }
  ]
}
```

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Id": "NIUOt3Pgd24ErcrM1OFyag2",
  "UnitCode": "E48",
  "Unit": "Servicio",
  "IdentificationNumber": "WEB003",
  "Name": "Sitio Web CMS",
  "Description": "Desarrollo e implementación de sitio web empleando un CMS",
  "Price": 6500.0,
  "CodeProdServ": "43232408",
  "NameCodeProdServ": "Software de desarrollo de plataformas web",
  "CuentaPredial": "123",
  "Taxes": [
    {
      "Name": "IVA",
      "Rate": 0.16,
      "IsRetention": false,
      "IsFederalTax": true
    },
    {
      "Name": "ISR",
      "IsRetention": true,
      "IsFederalTax": true,
      "Total": 0.1
    },
    {
      "Name": "IVA",
      "IsRetention": true,
      "IsFederalTax": true,
      "Total": 0.1
    }
  ]
}
```
