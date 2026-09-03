<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-catalogs-CfdiUses_keyword · capturado 2026-09-03 -->

-

# Catalogo de Usos de Cfdi, algunos usos aplican solo para personas Físicas y otros solo para Morales

### Parámetros URI

keyword  **(
string
 )**

**
**

  Default value is RFC del receptor

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[UseCfdiCatalog](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=UseCfdiCatalog)

Natural  **(
boolean
 )**

**
**

Moral  **(
boolean
 )**

**
**

Name  **(
string
 )**

Nombre de la propiedad

**
**

Value  **(
string
 )**

Valor de la propiedad

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/Catalogs/CfdiUses?keyword={keyword}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Natural": true,
    "Moral": true,
    "Name": "sample string 3",
    "Value": "sample string 4"
  },
  {
    "Natural": true,
    "Moral": true,
    "Name": "sample string 3",
    "Value": "sample string 4"
  }
]
```
