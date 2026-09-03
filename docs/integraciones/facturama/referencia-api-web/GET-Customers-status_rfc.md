<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Customers-status_rfc · capturado 2026-09-03 -->

-

# Valida el RFC en cuanto a estructura, localizacón en el SAT y que allí se encuentre activo. En el ambiente Productivo se valida realmente y consume Folio En el ambiente Sandbox simpre se muesrta como Localizado y Activo

### Parámetros URI

rfc  **(
string
 )**

RFC a Validar

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Resultado de la validación

[RfcStatusViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=RfcStatusViewModel)

Rfc  **(
string
 )**

RFC a validar

**
**

FormatoCorrecto  **(
boolean
 )**

Indica si el formato del RFC es correcto

**
**

Activo  **(
boolean
 )**

Indica si RFC se encuentra activo ante el SAT y este no ha sido cancelado

**
**

Localizado  **(
boolean
 )**

Indica si se encuentra localizado en el SAT

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/customers/status?rfc={rfc}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Rfc": "ESO1202108R2",
  "FormatoCorrecto": true,
  "Activo": true,
  "Localizado": true
}
```
