<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones/descarga · capturado 2026-09-03 -->

# Descarga de retencion en XML o PDF

Aplica para: Factura de retención y Complemento de Servicios para Plataformas Tecnologicas

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

**La referencia de esta llamada es:**

-
		[Descarga la retencion en XML o PDF](https://apisandbox.facturama.mx/docs/api/GET-retenciones-id-format)

#### Descargar la retención

#### POST

```
https://apisandbox.facturama.mx/retenciones/{id}/{format}

    Ejemplo:
    https://apisandbox.facturama.mx/retenciones/hbPAmkJYETg98XHpq4dASw2/pdf
```

		**{id}**:  Id de la retención, obtenido al momento de [crearla](https://apisandbox.facturama.mx/guias/retenciones) o en el [listado](guias/retenciones/filtrar)

		**{format}**:   Alguno de los formatos disponibles [pdf | xml]
		nota: el format se debe colocar en minusculas

### Respuesta de la descarga

	La respuesta respecto al "HTTP Response" si la petición fué exitosa regresa un **200**

#### Ejemplo de respuesta de descarga

```
{
    "ContentEncoding": "base64",
    "ContentType": "pdf",
    "ContentLength": 30855,
    "Content": "JVBERi0xLjQKMSAwIG9iago8PAovVGl0bGUg .... "
}
```

	**ContentEncoding**:   Indica la codificación del contenido (para este caso siempre es **Base64**)

	**ContentType**:   Tipo de contenido [pdf | xml]

	**Content**:   Archivo en Base64
