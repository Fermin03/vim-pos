<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-BranchOffice-id · capturado 2026-09-03 -->

-

# Obtiene una sucursal a partir de su identificador unico

### Parámetros URI

id  **(
string
 )**

Id de sucursales.

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Modelo con informacion de sucursales.

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

#### GET

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
