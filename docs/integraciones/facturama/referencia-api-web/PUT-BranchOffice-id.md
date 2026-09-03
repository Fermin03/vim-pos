<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-BranchOffice-id · capturado 2026-09-03 -->

-

# Actualiza datos de una sucursal.

### Parámetros URI

id  **(
string
 )**

Identificador unico.

**
**

  Required

### Atributos de la petición

Name  **(
string
 )**

Nombre de la sucursal (requerido)

**
**

  Required

  String length: inclusive between 1 and 50

Description  **(
string
 )**

Descripción (requerido)

**
**

  Required

  String length: inclusive between 1 and 100

Address  **(
[TaxAddress](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxAddress) )**

Nodo para enlistar los de detalles de la dirección fiscal (requerido)

**
**

  Required

### Argumentos de respuesta

Results.

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/BranchOffice/{id}**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Name": "El sauce",
  "Description": "Sucursal del sauce, enfocada en la distribución de agua en garrafón",
  "Address": {
    "Street": "Av. del Sauce",
    "ExteriorNumber": "120",
    "InteriorNumber": "",
    "Neighborhood": "Las Flores",
    "ZipCode": "78116",
    "Locality": "",
    "Municipality": "San Luis Potosi",
    "State": "San Luis Potosi",
    "Country": "México"
  }
}
```
