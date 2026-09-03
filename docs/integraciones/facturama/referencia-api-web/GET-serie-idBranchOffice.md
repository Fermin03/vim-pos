<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-serie-idBranchOffice · capturado 2026-09-03 -->

-

# Obtiene todos las Series asociados a la Sucursal

### Parámetros URI

idBranchOffice  **(
string
 )**

Id de la Sucursal a la que pertenece la Serie

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[SerieViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=SerieViewModel)

Folio  **(
integer
 )**

**
**

Name  **(
string
 )**

**
**

Description  **(
string
 )**

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/serie/{idBranchOffice}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Folio": 404,
    "Name": "A",
    "Description": "SERIE A"
  },
  {
    "Folio": 207,
    "Name": "A001",
    "Description": "A001"
  }
]
```
