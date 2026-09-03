<!-- fuente: https://apisandbox.facturama.mx/Docs/Api/GET-api-Cfdi-format-type-id · capturado 2026-09-03 -->

-

# Obtiene el archivo de la factura en una sucesión de caracteres base64 en el formato deseado.

### Parámetros URI

format  **(
string
 )**

Formato del archivo a obtener: ( pdf | html | xml ).

**
**

  Required

type  **(
string
 )**

Tipo de comprbante a obtener, puede ser:  para facturas de API normal( payroll | received | issued )  y para API Multiemisor ( issuedLite ).

**
**

  Required

id  **(
string
 )**

Identificador unico de la factura.

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

Devuelve la factura en elformato solicitado en base64.

[FacturamaWebAPI.Models.FileViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=FacturamaWebAPI.Models.FileViewModel)

ContentEncoding  **(
string
 )**

Codificación del archivo obtenido

**
**

ContentType  **(
string
 )**

Tipo de archivo (pdf, html, xml)

**
**

ContentLength  **(
integer
 )**

Tamaño en bytes

**
**

Content  **(
string
 )**

Contenido del archivo

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/api/Cfdi/{format}/{type}/{id}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "ContentEncoding": "base64",
  "ContentType": "pdf",
  "ContentLength": 4281,
  "Content": "wggFcMRowGAYDVQQDDBFBLkMuIDIgZGUgc............"
}
```
