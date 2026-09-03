<!-- fuente: https://apisandbox.facturama.mx/Docs/Api/POST-api-BranchOffice · capturado 2026-09-03 -->

-

# Crea una nueva sucursal

### Parámetros URI

 No se tienen parámetros

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

#### POST

**https://apisandbox.facturama.mx/api/BranchOffice**

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
