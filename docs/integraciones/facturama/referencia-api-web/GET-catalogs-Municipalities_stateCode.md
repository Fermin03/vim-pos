<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-catalogs-Municipalities_stateCode · capturado 2026-09-03 -->

-

# Catalogo de Municipios a partir del Estado

### Parámetros URI

stateCode  **(
string
 )**

**
**

  Default value is

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[MunicipalityCatalog](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=MunicipalityCatalog)

State  **(
string
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

**https://apisandbox.facturama.mx/catalogs/Municipalities?stateCode={stateCode}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "State": "sample string 1",
    "Name": "sample string 2",
    "Value": "sample string 3"
  },
  {
    "State": "sample string 1",
    "Name": "sample string 2",
    "Value": "sample string 3"
  }
]
```
