<!-- fuente: https://apisandbox.facturama.mx/docs-multi/api/PUT-api-lite-csds-rfc · capturado 2026-09-03 -->

-

# Actualiza un CSD ya existente

### Parámetros URI

rfc  **(
string
 )**

**
**

  Required

### Atributos de la petición

Rfc  **(
string
 )**

RFC del propietario de los certificados

**
**

  Required

  Matching regular expression pattern: [A-Z,Ñ,&]{3,4}[0-9]{2}[0-1][0-9][0-3][0-9][A-Z,0-9]?[A-Z,0-9]?[0-9,A-Z]?

Certificate  **(
string
 )**

Certificado en base64

**
**

  Required

PrivateKey  **(
string
 )**

Llave privada en base64

**
**

  Required

PrivateKeyPassword  **(
string
 )**

Contraseña de la Llave privada

**
**

  Required

### Argumentos de respuesta

[IHttpActionResult](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=IHttpActionResult)

 No se tienen parámetros

#### http method:

#### PUT

**https://apisandbox.facturama.mx/api-lite/csds/{rfc}**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Rfc": "sample string 1",
  "Certificate": "sample string 2",
  "PrivateKey": "sample string 3",
  "PrivateKeyPassword": "sample string 4"
}
```

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

Sample not available.
