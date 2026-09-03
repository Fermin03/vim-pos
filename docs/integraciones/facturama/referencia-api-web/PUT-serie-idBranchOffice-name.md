<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-serie-idBranchOffice-name · capturado 2026-09-03 -->

-

# Actualiza la Descripcion de la Serie

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

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/serie/{idBranchOffice}/{name}**

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
