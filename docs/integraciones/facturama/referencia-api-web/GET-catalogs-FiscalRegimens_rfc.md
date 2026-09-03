<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-catalogs-FiscalRegimens_rfc · capturado 2026-09-03 -->

-

# Catalogo de Regimenes Fiscales

### Parámetros URI

rfc  **(
string
 )**

**
**

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[FiscalRegimenCatalog](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=FiscalRegimenCatalog)

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

**https://apisandbox.facturama.mx/Catalogs/FiscalRegimens?rfc={rfc}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Natural": false,
    "Moral": true,
    "Name": "General de Ley Personas Morales",
    "Value": "601"
  },
  {
    "Natural": false,
    "Moral": true,
    "Name": "Personas Morales con Fines no Lucrativos",
    "Value": "603"
  }
]
```
