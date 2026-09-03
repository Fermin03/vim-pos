<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-serie-idBranchOffice-name · capturado 2026-09-03 -->

-

# Obtiene un Serie a partir de su Nombre

### Parámetros URI

idBranchOffice  **(
string
 )**

Id de la Sucursal a la que pertenece la Serie

**
**

  Required

name  **(
string
 )**

Nombre de la Serie

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

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

**https://apisandbox.facturama.mx/serie/{idBranchOffice}/{name}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Folio": 404,
  "Name": "A",
  "Description": "SERIE A"
}
```
