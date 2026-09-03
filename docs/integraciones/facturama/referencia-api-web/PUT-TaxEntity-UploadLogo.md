<!-- fuente: https://apisandbox.facturama.mx/docs/api/PUT-TaxEntity-UploadLogo · capturado 2026-09-03 -->

-

# Cargar Logo

### Parámetros URI

 No se tienen parámetros

### Atributos de la petición

Image  **(
string
 )**

Imagen en url ó base64

**
**

  Required

  Matching regular expression pattern: (https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/=]*))|(^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$)

  String length: inclusive between 1 and 1500000

Type  **(
string
 )**

Tipo de la imagen (Opcional)

**
**

  Matching regular expression pattern: jpg|bmp|png|jpg|jpeg

### Argumentos de respuesta

La respuesta no tiene argumentos

#### http method:

#### PUT

**https://apisandbox.facturama.mx/TaxEntity/UploadLogo**

## Ejemplo de Petición

#### application/json, text/json

                **Ejemplo:**

```
{
  "Image": "http://Facturama.mx/Files/Logos/AAA010101AAA-180118153149.png",
  "Type": "png"
}
```
