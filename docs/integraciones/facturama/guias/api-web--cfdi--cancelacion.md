<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/cancelacion · capturado 2026-09-03 -->

# Cancelación de CFDI con Motivo

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	** A partir del 1 de enero de 2022 la cancelación debe incluir el motivo de cancelación.**

	Facturama es la plataforma de facturación más amigable, por lo que tenemos **compatibilidad hacia atrás empleando el valor por defecto: "02"**

	Por lo que el "endpoint" y parámetros que usas actualmente para cancelar, continuará vigente. Sin embargo,  **tenemos nuevas funcionalidades que debes conocer**

- **La cancelación de CFDI desde el 1 de enero de 2022 debe incluir el motivo de cancelación.**

- Al enviar tu solicitud de cancelación se validará si se requiere la aceptación del receptor para llevar a cabo la cancelación.

- Cuando se requiera la aceptación para la cancelación el receptor tendrá hasta 72 horas para aceptar o rechazar la solicitud de cancelación (este proceso es en el SAT).

- En el caso de que el receptor no acepte o rechace la cancelación se considera cancelada.

- En caso de que la solicitud de cancelación no requiera aceptación por parte del receptor, la factura se cancelará de manera inmediata.

**Puedes consultar el estado de una factura en el portal del SAT**

-  [Validador de CFDI SAT](https://verificacfdi.facturaelectronica.sat.gob.mx/)

### Motivos de cancelación y su significado:

| Clave | Descripción | Cuando se usa |
| --- | --- | --- |
| 01 | Comprobante emitido con errores con relación | Se deberá utilizar cuando se cancela un CFDI para corregir errores en el mismo y se emite uno nuevo con los datos correctos, cuando se utilice la clave 01 se abrirá un campo nuevo para capturar el folio fiscal del CFDI que sustituye al cancelado. Usar este motivo de cancelación requiere que el CFDI que sustituye al cancelado tenga una relación del tipo 04 Ver procedimiento |
| 02 | Comprobante emitido con errores sin relación | Esta clave se utiliza cuando se cancela un CFDI con errores, pero no se emite un nuevo CFDI que lo sustituya, es decir cuando se realiza una refacturación. |
| 03 | No se llevó a cabo la operación | Se utilizará cuando se emite un CFDI como por ejemplo para enviarlo al cliente y tramitar el pago de este ya que la operación será de contado, y después la persona que solicito la factura indica que no se autorizó el pago, motivo por el cual el emisor lo tiene que cancelar. |
| 04 | Operación nominativa relacionada con una factura global | Esta deberá utilizarse en el siguiente caso. El cliente realiza la compra y no solicita la factura con su RFC. El vendedor emite un comprobante simplificado y posteriormente lo factura dentro de la factura global de público en general. Después regresa el cliente y solicita factura a su nombre con su RFC, el vendedor tiene que cancelar el CFDI global de público en general para eliminar la operación del cliente que solicita la factura nominativa. |

### Solicitar la cancelación de un CFDI:

#### Estructura de la URL

#### DELETE

```
https://apisandbox.facturama.mx/cfdi/{cfdiId}?type={type}&motive={motive}&uuidReplacement={uuidReplacement}

    Ejemplo:
    https://apisandbox.facturama.mx/cfdi/jhQS4AaCO4bIwqcv5UHYCw2?type=issued&motive=01&uuidReplacement=d8e34bab-5bd4-4788-bde2-1428dc469e10
```

	**{cfdiId}**:  Identificador del CFDI

Ejemplo:   jhQS4AaCO4bIwqcv5UHYCw2

	**{type}**: Tipo del CFDI ( Seleccione uno de los disponibles)

Valores disponibles para API Web:

- **issued** = Emitida

- **payroll** =  Nómina

	**{motive}**: Motivo de cancelación

Cadena donde los valores posibles son: 01, 02, 03, 04 [Ver la tabla de Motivos de cancelación y su significado](https://apisandbox.facturama.mx/guias/api-web/cfdi/cancelacion#motivos-cancelacion)

	**{uuidReplacement}**: UUID del comprobante que sustituye al cancelado

### Forma de uso del motivo de cancelación 01:

	**1)** Al momento de generar el nuevo CFDI debes relacionarlo con el CFDI que deseas cancelar

	El tipo de relación debe ser **04** (no confundir con el motivo de cancelación),

	[Ver como relacionar un CFDI](https://apisandbox.facturama.mx/guias/conocimientos/cfdi-relacionados)

	**2)** Solicitar la cancelación con el motivo 01

	Especificando el UUID del CFDI que remplaza al cancelado en el campo **uuidReplacement**

### Respuesta a una solicitud de cancelación

	La respuesta respecto al "HTTP Response" si la petición fué exitos regresa un **200**

	** Incluyendo el estado de la factura**

#### Ejemplo de factura cancelada

```
{
        "Status": "canceled",
        "Uuid": "41A49A5E-7E57-4339-88F9-DEEE9B901B55",
        "RequestDate": "2018-11-14T10:21:43",
        "ResponseDate": "2018-11-17T10:21:43",
        "ExpirationDate": "2018-11-17T10:21:43",
        "AcuseXmlBase64": "PD94bWwgdmVyc2lvbj0iMS...3VzZT4="
    }
```

#### Los datos del estado de la cancelación son:

	**Uuid**:   UIID del CFDI

	**RequestDate**:   Fecha de solicitud de la cancelación

	**ResponseDate**:   Fecha de respuesta de la solicitud de la cancelación

    **ExpirationDate**:   Fecha límite que tiene el receptor para emitir una respuesta

    **AcuseXmlBase64**:   XML del Acuse en Formato Base64, solo se tiene acuse cuando ya se encuentra cancelada (y no se canceló directamente con el SAT)

	**Status**:   Estado de la cancelación:

- **canceled** =  Cancelada

- **active** =  Activa, no se puede cancelar, por que tiene documentos relacionados

- **pending** =  Pendiente de aceptación, requiere una respuesta por parte del receptor (tiene hasta 72 horas para responder)
