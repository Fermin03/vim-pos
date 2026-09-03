<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-BranchOffice · capturado 2026-09-03 -->

-

# Obtiene todas las sucursales de la Entidad Fiscal.

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Lista de sucursales de la Entidad Fiscal.

        Atributos de
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

**https://apisandbox.facturama.mx/BranchOffice**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Id": "STx6PS - B9ggoj7Q8crPBbw2",
    "Name": "Mi Negocio S.A. de C.V.",
    "Description": "Desc de mi negocio",
    "Address": {
      "Street": "street ex",
      "ExteriorNumber": "extnum ex",
      "InteriorNumber": "interior number ex",
      "Neighborhood": "neighborhood ex",
      "ZipCode": "12345",
      "Locality": "localitty ex",
      "Municipality": "city ex",
      "State": "NUEVO LEON",
      "Country": "MEXICO"
    },
    "IsDefault": false
  },
  {
    "Id": "Rf8SltsDcELaNH0xS9U4Aw2",
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
      "State": "SAN LUIS POTOSI",
      "Country": "MEXICO"
    },
    "IsDefault": false
  }
]
```
