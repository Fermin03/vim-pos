<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-TaxEntity-UploadCsd · capturado 2026-09-03 -->

-

# Sube los CSD al servidor de facturama

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

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

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/TaxEntity/UploadCsd**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Certificate": "AAA010101AAAManuel__CSD.cer",
  "PrivateKey": "AAA010101AAAManuel__CSD.key",
  "PrivateKeyPassword": "12345678a"
}
```
