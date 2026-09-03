<!-- fuente: https://apisandbox.facturama.mx/docs/api/POST-serie-idBranchOffice · capturado 2026-09-03 -->

-

# Crea un nueva Serie

### Parámetros URI

idBranchOffice  **(
string
 )**

Id de la Sucursal a la que pertenece la Serie

**
**

  Required

### Atributos de la petición

IdBranchOffice  **(
string
 )**

Id de la Sucursal donde se alamcenará la Serie

**
**

  Required

  Data type: Text

Name  **(
string
 )**

Nombre de la serie

**
**

  Required

  Matching regular expression pattern: [a-zA-Z0-9]+

  String length: inclusive between 1 and 10

Description  **(
string
 )**

Descripción de la serie

**
**

  String length: inclusive between 1 and 50

Folio  **(
integer
 )**

Folio inicial para la serie

**
**

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

#### POST

**https://apisandbox.facturama.mx/serie/{idBranchOffice}**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "IdBranchOffice": "qzJc55WTQGueN4UbumJ91g2",
  "Name": "A",
  "Description": "SERIE A",
  "Folio": 404
}
```

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
