<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-catalogs-Countries_keyword · capturado 2026-09-03 -->

-

# Catalogo de monedas

### Parámetros URI

keyword  **(
string
 )**

Palabra clave (opcional)

**
**

  Default value is

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[CatalogViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CatalogViewModel)

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

**https://apisandbox.facturama.mx/Catalogs/Countries?keyword={keyword}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Name": "Sample_string",
    "Value": "00"
  },
  {
    "Name": "Sample_string",
    "Value": "01"
  }
]
```
