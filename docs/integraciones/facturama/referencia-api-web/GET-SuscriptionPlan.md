<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-SuscriptionPlan · capturado 2026-09-03 -->

-

# Obtiene los datos de la suscripción vigente. Estos son expuestos, mediante la API, para que el usuario pueda estar al tanto

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

[SuscriptionViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=SuscriptionViewModel)

Plan  **(
string
 )**

Nombre del plan comprado

**
**

CurrentFolios  **(
string
 )**

Cantidad de Folios Restantes

**
**

CreationDate  **(
date
 )**

Fecha de creación e inicio de la suscripción

**
**

ExpirationDate  **(
date
 )**

Fecha en la que terminará la suscripción

**
**

Amount  **(
decimal number
 )**

Monto total de la suscripción

**
**

Id  **(
string
 )**

Identificador de la suscripción

**
**

Type  **(
string
 )**

Tipo de la suscripcion.

**
**

Category  **(
string
 )**

Categoría de productos a la venta.

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/SuscriptionPlan**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Plan": "sample string 1",
  "CurrentFolios": "sample string 2",
  "CreationDate": "2026-09-03T13:06:11.5102329-06:00",
  "ExpirationDate": "2026-09-03T13:06:11.5102329-06:00",
  "Amount": 1.0,
  "Id": "sample string 5",
  "Type": "sample string 6",
  "Category": "sample string 7"
}
```
