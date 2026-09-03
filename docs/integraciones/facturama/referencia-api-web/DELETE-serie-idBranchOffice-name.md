<!-- fuente: https://apisandbox.facturama.mx/docs/api/DELETE-serie-idBranchOffice-name · capturado 2026-09-03 -->

-

# Elimina la Serie

### Parámetros URI

idBranchOffice  **(
string
 )**

Identificador unico de la serie

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

SerieViewModel

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

#### DELETE

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
