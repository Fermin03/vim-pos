<!-- fuente: https://apisandbox.facturama.mx/docs/api/DELETE-BranchOffice-id · capturado 2026-09-03 -->

-

# Elimina una sucursal si no tiene facturas relacionadas

### Parámetros URI

id  **(
string
 )**

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

[BranchOfficeViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=BranchOfficeViewModel)

Id  **(
string
 )**

Identificador unico de la sucursal

**
**

Name  **(
string
 )**

Nombre de la sucursal

**
**

Description  **(
string
 )**

Descripcion de la sucursal

**
**

Address  **(
[Addressv40](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Addressv40) )**

Nodo que enlista los de detalles de la dirección de la sucursal

**
**

IsDefault  **(
boolean
 )**

**
**

#### http method:

#### DELETE

**https://apisandbox.facturama.mx/BranchOffice/{id}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Id": "LX_AzPIieK7GdbXjqItHGg2",
  "Name": "El sauce",
  "Description": "Sucursal del sauce, enfocada en la distribución de agua en garrafón",
  "Address": {
    "Street": "Av. del Sauce",
    "ExteriorNumber": "120",
    "InteriorNumber": "",
    "Neighborhood": "Las Flores",
    "ZipCode": "78116",
    "Locality": "",
    "Municipality": "San Luis Potosí",
    "State": "SAN LUIS POTOSI",
    "Country": "MEXICO"
  },
  "IsDefault": false
}
```
