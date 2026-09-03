<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Product-id · capturado 2026-09-03 -->

-

# Obtiene un Producto según un Id.

### Parámetros URI

id  **(
string
 )**

Identificador unico del producto.

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Regresa el producto correpondiente al Id proporcionado.

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

**https://apisandbox.facturama.mx/Product/{id}**

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
