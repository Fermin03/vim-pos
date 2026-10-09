<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-printings · capturado 2026-10-08 -->

# Configurar impresiones

Las impresoras de las **terminals Point Smart 1 y 2** permiten imprimir el _ticket_ de la compra y, adicionalmente, **integrar impresiones personalizadas a través de la API de Terminals**. Esta función puede ser útil para quienes requieran imprimir comprobantes complementarios, como cupones o mismo imágenes.

De esta manera, podrás gestionar impresiones adicionales directamente desde tu sistema Punto de Venta, y obtenerlas desde la terminal a la que sean asignadas.

## Crear impresiones

Las impresiones generadas desde tu sistema son acciones que tu punto de venta envía a la terminal. Por esto, para crear una impresión, deberás enviar una solicitud al endpoint [/terminals/v1/actionsPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/impressions/create-terminal/post) con tu Access Token de prueba, cuidando de enviar correctamente los **parámetros obligatorios** indicados debajo.

```
curl -X POST \
    'https://api.mercadopago.com/terminals/v1/actions'\
    -H 'Content-Type: application/json' \
       -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
       -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
    -d '{
  "type": "print",
  "external_reference": "ext_ref_1234",
  "config": {
    "point": {
      "terminal_id": "NEWLAND_N950__N950NCB123456789",
      "subtype": "image"
    }
  },
  "content": "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAB2AAAAdgB+lymcgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAPqSURBVHic7ZrZaxRBEIe/mJh4xRgDGk8ivqtvIvGESLwQ7wsU/yD/Ah+NURQjIioY8FbwRZ9UEFREvEFjEm83GR96Byab2Zlf9/RuFp0PlsxR1dVTXVXdPRPIycnJycnJ+V+pc9DpANYAU8vc/wXcBZ479qkcLcBmYGaZ+6PAI+C+Z7tj2Ar8AIKU3x9gl0e7HcBbwW4AHPNodxwPxE4EwEtgkie7xy3sjgLtnuyO46tFRwJgnQebU4CBStm1GaFGYLqFPMBBS/k4dgKzLHVkeRsHtFl2AmAf0OSgF+WIg05FHDDboSOtQLeDXshcoMtBryIOaHXoCGRLg8NAg4NeiypY6QgA2A40O+oedtSrKQdMA3Y46K0AljnarJkaEOKSBi7FL6SmagDARkxBU2kgW+2ouQhoAPZYyHeTbTVXcw4AOGQh61r8QmwXThJXsVuOxq3Rlwh2ZgLfM9r6pD5UtWoAmK23ktf7Kb/VVmnBbaufyDOyjUoAPBHs3PFgJ6D8ewNnPnvq2PIEGx2YVPFhZ7HyUGoKTMJidZVCUjE8ir/Q9VoI2/AzKgHwinjH1+EnzcLfWuXB1AjIOgVGWQSsjrneCSz1aEeKANUBWWeAUuJmgyxL3zhq2gF7gcmR86biNYUBUU6qWb5TYEiUawM2RM43oY3YK+C6aMNrBKivw/qAn6Ls7sjxAVGnFxgUZb1GgDqlvMEsmRV2APWY9wXbRJ1e9CiT0rYSKXBWlJ2D+cK0FZghyD8EHgPDYvvSoKnv21QHDAIXMV+PlPX8LmC+2HZP8a8aAV5rgOqAL5iPJ1dE+b3AFkGuAJwuHk9IDVAdEE5RZ0T5drRI6Qc+FI9rPgIALmMiwRc9kWM1AibUAd+BS6JOGkOYuhI9V5iFsLHyvRL8EjlW0yCNPoxDQ9QIqEebXVJpRt+BNUb0mjAOybqri64YARZa6C5KezglAtTR/wb8jpz/YmzouvAGuF1yTU0BEOqA4gDb/I+SNQ1OACMl14Yxb40UJtwB/ZhXaa6cirkW4HE1WGkH/AEuiPqlPMD801Mc3qbCSjsA9L1BKT0J97wthnw6oNyoXAM+im2EFEiuH1WNAJc1QJQC9mnQD7xPuO9tP1CNFAD72SAp/EFPAS8OUCMgaVRuAu/EdkqXvra2otREEQQzb58X2znH2KVvHFV1gPpFKMkBoKfBSUFGTYHUwVMcoIbu05T794AXKTLPgFsebIUkFVKZlaRvatKKVkgnZn0f18ZrYJXYTiPpX5EHi31PRP0QOQ9Yz/h/dwswo1G6YUmiAViA2a6GjGAcU7Bsp4v4r8DDwA08RUBOTk5OTk7Ov8lfFiKY13GwsdoAAAAASUVORK5CYII="
}'
```

| Atributo | Tipo | Descripción |
| --- | --- | --- |
| `Authorization` | _Header_ | Hace referencia o bien a tu Access Token de prueba. |
| `X-Idempotency-Key` | _Header_ | Llave de idempotencia. Esta llave garantiza que cada solicitud sea procesada una única vez, evitando duplicidades. Utiliza un valor exclusivo en el encabezado de tu solicitud, como un UUID V4 o _strings_ aleatorias. |
| `type` | _Body_. _String_ | Tipo de acción. Debes enviar el valor `print`, que es el asociado con la creación de acciones de impresión para el Punto de Venta. |
| `external_reference` | _Body_. _String_ | Es una referencia externa de la order, asignada al momento de su creación. Debe ser un valor único para cada order, y no puede contener datos PII. El límite máximo permitido es de 64 caracteres y los permitidos son: **letras mayúsculas y minúsculas**, **números** y **los símbolos de guion (-) y guion bajo (\_)**. |
| `config.point.terminal_id` | _Body_. _String_ | Identificador de la terminal Point que obtendrá la order. Debes enviarlo tal cual fue devuelto en el llamado [Obtener terminalsGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/terminals/get-terminals/get), como en el siguiente ejemplo: "NEWLAND\_N950\_\_N950NCB801293324". |
| `config.point.subtype` | _Body_. _String_ | Identificador del subtipo de impresión que se creará para la terminal Point. Si la acción es print se debe elegir uno de los siguientes valores:  
\-`custom`: para una impresión personalizada.  
\-`image`: para una impresión de imágenes. |
| `content` | _Body_. _String_ | Contiene la información a imprimir en la terminal Point. Dirígete a [Requisitos para el contenido de impresiones](https://www.mercadopago.com.mx/developers/es/docs/mp-point/additional-settings/configure-printings#bookmark_requisitos_para_el_contenido_de_impresiones) para saber qué validaciones tener en cuenta dependiendo del tipo de impresión. |

### Requisitos para el contenido de impresiones

Para implementar los distintos tipos de impresión deseados, además de indicar de cuál se trata en el campo `config.point.subtype`, debes tener en cuenta los requisitos, formatos y validaciones que cada una de ellos requiere a la hora de enviar su contenido a través del parámetro `content`.

Las impresiones personalizadas utilizan _tags_ que permiten ajustar el formato y la apariencia de los documentos impresos, garantizando un mayor control sobre el estilo y la estructura del texto.

Al definir el atributo `subtype` como `custom`, debes incluir en el campo `content` un _string_ con el contenido deseado, formateado utilizando **por lo menos una de las _tags_ soportadas**. El contenido para este atributo es de un **mínimo de 100 caracteres y un máximo de 4096**, incluyendo las propias _tags_.

A continuación, consulta las diferentes _tags_ disponibles y sus funciones.

| _Tags_ | Función | Ejemplo |
| --- | --- | --- |
| `{b}` | Negrita | `{b}Texto en negrita{/b}` |
| `{w}` | Letra grande | `{w}Texto en letra grande{/w}` |
| `{s}` | Letra pequeña | `{s}Texto en letra pequeña{/s}` |
| `{br}` | Salto de línea | `{br}` |
| `{left}` | Alinear a la izquierda | `{left}Texto alineado a la izquierda{/left}` |
| `{center}` | Centrar texto | `{center}Texto centrado{/center}` |
| `{qr}` | Imprimir un QR que representa el texto enviado | `{qr}Texto{/qr}` |
| `{pdf417}` | Imprimir un código de barras | `{pdf417}Texto{/pdf417}` |

Adicionalmente, te proporcionamos un ejemplo de uso.

```
{
  "type": "print",
  "config": {
    "point": {
      "terminal_id": "{{device.id}}",
      "subtype": "custom"
    }
  },
  "external_reference": "8a42e06e45d5",
  "content": "{br}--------------------------------{br}{center}{w} COMPROBANTE DE ENTREGA{/w}{br}{br}{s} Nro pedido :12345{/s}{br}{s} Tienda: Tienda de prueba{/s}{br}--------------------------------{br}{s}***ITEM(S) DESPACHO***{/s}{br}{s}SKU / ARTICULO                    CANTIDAD    {/s}{br}{s}----------------------------------------------{/s}{br}{s}4065432630504 / BALON FUTBOL WUCL LGE EHV240424   1{br}{s}ENTREGAR: 06/06/2024{/s}{br}{s}DIRECCION: METROPOLITANA  {/s}{br}{s}RECIBE: John{/s}{br}{s}entrega a cliente en horario am{/s}{br}--------------------------------{br}"
}
```

Si la solicitud es enviada correctamente, la respuesta devolverá el `id` de la acción creada junto con el `status: created`, y la impresión será obtenida de manera automática por la terminal, en cuyo caso pasará a tener un `status: on_terminal`. En caso de que esto último no suceda, puedes consultar [nuestra documentación troubleshooting](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/troubleshooting).

La API de Terminals también te permitirá [obtener una acciónGET](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/impressions/get-action/get), incluyendo su `status` en tiempo real, enviando el `id` de referencia obtenido en la respuesta a su creación.

Por último, también es posible [cancelar una acciónPOST](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/impressions/cancel-action/post) utilizando el `id` de referencia obtenido en la respuesta a su creación, siempre y cuando su estado sea `created`.
